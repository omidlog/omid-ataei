import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { parse, stringify } from 'yaml'
import { checkSvg, geometrySignature, inspectAssetForPublication, validateAssets } from '@brand-os/asset-catalog'
import { normalizeAsset, normalizeSvg, renderCompare } from '@brand-os/asset-catalog/normalize'
import { approveAssets, backupBrand, ensureApprovalSecret, writeStarterWorkspace } from '@brand-os/brand-core'

const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')
const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'svg')
process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')
const sha = (data: Buffer | string): string => crypto.createHash('sha256').update(data).digest('hex')

interface Manifest {
  schema_version: number
  assets: Array<Record<string, unknown>>
}

function brandWithSvgs(files: Record<string, { fixture?: string; data?: string; status?: string }>): { root: string; proof: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-svg-assets-'))
  writeStarterWorkspace(root)
  const manifestFile = path.join(root, 'brand/assets/asset-manifest.yaml')
  const manifest = parse(fs.readFileSync(manifestFile, 'utf8')) as Manifest
  for (const [id, spec] of Object.entries(files)) {
    const data = spec.data ?? fs.readFileSync(path.join(FIXTURES, spec.fixture!), 'utf8')
    const file = `brand/assets/mascot/${id.split('.').at(-1)}.svg`
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), data)
    manifest.assets.push({
      id,
      name: id,
      status: spec.status ?? 'draft',
      ...(spec.status === 'approved' ? { approved_by: 'owner (instruction in chat)' } : {}),
      owner: 'design',
      visibility: 'internal',
      license: 'Owned by the brand',
      path: file,
      present: true,
      checksum_sha256: sha(data),
      mime: 'image/svg+xml',
      tags: ['mascot'],
    })
  }
  fs.writeFileSync(manifestFile, stringify(manifest))
  return { root, proof: ensureApprovalSecret(root) }
}

function readManifest(root: string): Manifest {
  return parse(fs.readFileSync(path.join(root, 'brand/assets/asset-manifest.yaml'), 'utf8')) as Manifest
}

function cli(root: string, args: string[], env: Record<string, string> = {}, input = ''): ReturnType<typeof spawnSync> & { stdout: string; stderr: string } {
  const base: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && key !== 'BRAND_OS_AGENT_TOKEN' && key !== 'BRAND_OS_APPROVAL_PROOF') base[key] = value
  }
  return spawnSync(tsx, [path.join(repo, 'scripts/brand.ts'), 'assets', ...args], { cwd: root, env: { ...base, ...env }, input, encoding: 'utf8', timeout: 120_000 }) as ReturnType<typeof spawnSync> & { stdout: string; stderr: string }
}

test('brand:assets check reports each SVG with its issues and the fix command, and fails when one is not publishable', () => {
  const { root } = brandWithSvgs({ 'asset.mascot.ai': { fixture: 'illustrator-export.svg' }, 'asset.mascot.fig': { fixture: 'figma-export.svg' } })
  const before = readManifest(root)
  const text = cli(root, ['check'])
  assert.equal(text.status, 1, text.stderr)
  assert.match(text.stdout, /fixable\s+asset\.mascot\.ai/)
  assert.match(text.stdout, /fixable style-element line 4/)
  assert.match(text.stdout, /fix: npm run brand:assets -- normalize asset\.mascot\.ai/)
  assert.match(text.stdout, /ok\s+asset\.mascot\.fig/)
  const json = cli(root, ['check', '--json', '--ids', 'asset.mascot.fig'])
  assert.equal(json.status, 0, json.stderr)
  const report = JSON.parse(json.stdout) as { ok: boolean; assets: Array<{ id: string; ok: boolean }> }
  assert.deepEqual(report.assets.map((asset) => [asset.id, asset.ok]), [['asset.mascot.fig', true]])
  assert.deepEqual(readManifest(root), before, 'check never writes')
})

const fixture = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), 'utf8')
const find = (root: string, id: string): Record<string, unknown> => readManifest(root).assets.find((asset) => asset.id === id)!
const errorsFor = (root: string, id: string): string[] => validateAssets(root).filter((error) => error.startsWith(id))

test('the normalizer fixes Illustrator and Inkscape exports without changing a shape or a pixel, and leaves Figma alone', async () => {
  for (const name of ['illustrator-export.svg', 'inkscape-export.svg']) {
    const input = fixture(name)
    const result = normalizeSvg(input)
    assert.ok(result.ok, `${name}: ${JSON.stringify(result)}`)
    assert.equal(result.changed, true)
    assert.equal(checkSvg(result.output).ok, true, name)
    assert.deepEqual(geometrySignature(result.output), geometrySignature(input), `${name} geometry`)
    assert.doesNotMatch(result.output, /<style|style=|<!--|sodipodi|inkscape:|<metadata/)
    assert.match(result.output, /^<svg[\s>]/, `${name}: a UTF-8 XML declaration is dropped so older checkers accept the file`)
    const render = await renderCompare(input, result.output)
    assert.equal(render.result, 'identical', `${name}: ${JSON.stringify(render)}`)
  }
  const figma = normalizeSvg(fixture('figma-export.svg'))
  assert.ok(figma.ok && !figma.changed && figma.output === fixture('figma-export.svg'))
})

test('an XML declaration of another encoding is kept', () => {
  const latin = '<?xml version="1.0" encoding="ISO-8859-1"?>\n<svg xmlns="http://www.w3.org/2000/svg"><!-- x --><rect width="1" height="1"/></svg>'
  const result = normalizeSvg(latin)
  assert.ok(result.ok && result.output.startsWith('<?xml version="1.0" encoding="ISO-8859-1"?>'))
})

test('the render check sees a one-colour change', async () => {
  const a = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#fdd80c"/></svg>'
  assert.equal((await renderCompare(a, a.replace('#fdd80c', '#fdd80d'))).result, 'different')
  assert.equal((await renderCompare(a, '<svg')).result, 'unavailable')
})

test('the normalizer refuses what it must not touch and writes nothing', async () => {
  const scripted = '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{fill:red}</style><script>alert(1)</script></svg>'
  const descendant = '<svg xmlns="http://www.w3.org/2000/svg"><style>g .a{fill:red}</style><g><rect class="a" width="1" height="1"/></g></svg>'
  for (const svg of [scripted, descendant]) {
    const result = normalizeSvg(svg)
    assert.equal(result.ok, false)
    assert.ok(!result.ok && result.reason === 'not-fixable')
  }
  const { root } = brandWithSvgs({ 'asset.mascot.bad': { data: scripted, status: 'approved' } })
  const before = fs.readFileSync(path.join(root, 'brand/assets/asset-manifest.yaml'), 'utf8')
  const report = await normalizeAsset(root, 'asset.mascot.bad')
  assert.equal(report.outcome, 'refused')
  assert.ok(report.issues?.some((issue) => issue.code === 'script'))
  assert.equal(fs.readFileSync(path.join(root, 'brand/assets/asset-manifest.yaml'), 'utf8'), before)
  assert.equal(fs.existsSync(path.join(root, 'brand/assets-src')), false)
})

test('normalizing a draft keeps the original outside the served folder and records where the file came from', async () => {
  const { root } = brandWithSvgs({ 'asset.mascot.ai': { fixture: 'illustrator-export.svg' } })
  const manifestBefore = fs.readFileSync(path.join(root, 'brand/assets/asset-manifest.yaml'), 'utf8')
  const originalSha = sha(fixture('illustrator-export.svg'))
  const dry = await normalizeAsset(root, 'asset.mascot.ai', { dryRun: true })
  assert.equal(dry.outcome, 'would-normalize')
  assert.equal(fs.readFileSync(path.join(root, 'brand/assets/asset-manifest.yaml'), 'utf8'), manifestBefore, 'a dry run writes nothing')

  const report = await normalizeAsset(root, 'asset.mascot.ai')
  assert.equal(report.outcome, 'normalized')
  assert.equal(report.approval, 'not-approved')
  assert.equal(report.render_check, undefined)
  const kept = path.join(root, 'brand/assets-src/mascot/ai.svg')
  assert.equal(fs.readFileSync(kept, 'utf8'), fixture('illustrator-export.svg'), 'the original bytes are kept')
  const record = find(root, 'asset.mascot.ai')
  assert.equal(record.status, 'draft')
  assert.equal(record.checksum_sha256, sha(fs.readFileSync(path.join(root, 'brand/assets/mascot/ai.svg'))))
  assert.deepEqual(record.derived_from, { path: 'brand/assets-src/mascot/ai.svg', sha256: originalSha })
  assert.equal((record.normalizer as { name: string }).name, 'brand-os-svg-normalizer')
  assert.deepEqual(errorsFor(root, 'asset.mascot.ai'), [])
  // Only this asset's lines changed in the manifest.
  const after = fs.readFileSync(path.join(root, 'brand/assets/asset-manifest.yaml'), 'utf8')
  assert.ok(after.startsWith(manifestBefore.slice(0, manifestBefore.indexOf('- id: asset.mascot.ai'))))
  // The original is never publishable, even if a manifest path pointed at it.
  assert.equal(inspectAssetForPublication(root, 'brand/assets-src/mascot/ai.svg').ok, false)

  const again = await normalizeAsset(root, 'asset.mascot.ai')
  assert.equal(again.outcome, 'unchanged')
  // A backup includes the originals.
  const saved = backupBrand(root)
  assert.ok(saved.files.some((file) => file.replaceAll(path.sep, '/').endsWith('brand/assets-src/mascot/ai.svg')), saved.files.join(', '))
})

test('an approved asset keeps its approval only when the render check is pixel-identical', async () => {
  const { root } = brandWithSvgs({ 'asset.mascot.ai': { fixture: 'illustrator-export.svg', status: 'approved' }, 'asset.mascot.ink': { fixture: 'inkscape-export.svg', status: 'approved' } })
  const oldSha = sha(fixture('illustrator-export.svg'))
  const carried = await normalizeAsset(root, 'asset.mascot.ai')
  assert.equal(carried.approval, 'carried')
  assert.equal(carried.render_check?.result, 'identical')
  const record = find(root, 'asset.mascot.ai')
  assert.equal(record.status, 'approved')
  assert.equal(record.approval_carried_from, oldSha)
  assert.equal(record.approved_sha256, record.checksum_sha256)
  assert.equal((record.render_check as { result: string }).result, 'identical')
  assert.deepEqual(errorsFor(root, 'asset.mascot.ai'), [])

  for (const result of ['different', 'unavailable'] as const) {
    const { root: other } = brandWithSvgs({ 'asset.mascot.ink': { fixture: 'inkscape-export.svg', status: 'approved' } })
    const reset = await normalizeAsset(other, 'asset.mascot.ink', { render: async () => ({ result, renderer: 'test' }) })
    assert.equal(reset.approval, 'reset')
    const after = find(other, 'asset.mascot.ink')
    assert.equal(after.status, 'draft', result)
    assert.equal(after.approved_by, undefined)
    assert.equal((after.approval_reset as { from_status: string; from_sha256: string }).from_sha256, sha(fixture('inkscape-export.svg')))
    assert.equal((after.approval_reset as { approved_by: string }).approved_by, 'owner (instruction in chat)')
    assert.deepEqual(errorsFor(other, 'asset.mascot.ink'), [])
  }
})

test('normalize refuses a file that does not match its checksum, and never overwrites a different original', async () => {
  const { root } = brandWithSvgs({ 'asset.mascot.ai': { fixture: 'illustrator-export.svg' } })
  fs.appendFileSync(path.join(root, 'brand/assets/mascot/ai.svg'), ' ')
  assert.match((await normalizeAsset(root, 'asset.mascot.ai')).reason, /does not match checksum_sha256/)
  const { root: second } = brandWithSvgs({ 'asset.mascot.ai': { fixture: 'illustrator-export.svg' } })
  fs.mkdirSync(path.join(second, 'brand/assets-src/mascot'), { recursive: true })
  fs.writeFileSync(path.join(second, 'brand/assets-src/mascot/ai.svg'), 'someone else')
  const refused = await normalizeAsset(second, 'asset.mascot.ai')
  assert.equal(refused.outcome, 'refused')
  assert.match(refused.reason, /already exists with different content/)
  assert.equal(fs.readFileSync(path.join(second, 'brand/assets/mascot/ai.svg'), 'utf8'), fixture('illustrator-export.svg'))
})

test('brand:assets approve records the exact bytes, needs the owner proof and refuses agents and argv proofs', async () => {
  const { root, proof } = brandWithSvgs({ 'asset.mascot.ai': { fixture: 'illustrator-export.svg' }, 'asset.mascot.fig': { fixture: 'figma-export.svg' } })
  assert.equal(cli(root, ['approve', '--ids', 'asset.mascot.fig', '--proof', proof]).status, 2)
  assert.equal(cli(root, ['approve', '--ids', 'asset.mascot.fig'], { BRAND_OS_AGENT_TOKEN: 'x', BRAND_OS_APPROVAL_PROOF: proof }).status, 2)
  const wrong = cli(root, ['approve', '--ids', 'asset.mascot.fig'], { BRAND_OS_APPROVAL_PROOF: 'wrong' })
  assert.equal(wrong.status, 1)
  assert.match(wrong.stdout, /Proof rejected/)
  assert.equal(find(root, 'asset.mascot.fig').status, 'draft')

  const unfixed = cli(root, ['approve', '--ids', 'asset.mascot.ai'], { BRAND_OS_APPROVAL_PROOF: proof })
  assert.equal(unfixed.status, 1)
  assert.match(unfixed.stdout, /normalize asset\.mascot\.ai first/)

  const ok = cli(root, ['approve', '--ids', 'asset.mascot.fig', '--json'], {}, `${proof}\n`)
  assert.equal(ok.status, 0, ok.stderr)
  const record = find(root, 'asset.mascot.fig')
  assert.equal(record.status, 'approved')
  assert.equal(record.approved_sha256, sha(fixture('figma-export.svg')))
  assert.equal(record.approved_by, 'owner')
  assert.equal(approveAssets(root, ['asset.mascot.fig'], proof).results[0]?.outcome, 'unchanged')
  assert.deepEqual(errorsFor(root, 'asset.mascot.fig'), [])

  // A later change to the file is caught by validate until the owner approves the new bytes.
  const changed = fixture('figma-export.svg').replace('#7C3AED', '#7C3AEE')
  fs.writeFileSync(path.join(root, 'brand/assets/mascot/fig.svg'), changed)
  const text = fs.readFileSync(path.join(root, 'brand/assets/asset-manifest.yaml'), 'utf8').replace(String(record.checksum_sha256) + '\n    mime', `${sha(changed)}\n    mime`)
  fs.writeFileSync(path.join(root, 'brand/assets/asset-manifest.yaml'), text)
  assert.match(errorsFor(root, 'asset.mascot.fig').join('\n'), /not the approved file/)

  // Normalize, then approve: the CLI path for a reset asset.
  const normalized = cli(root, ['normalize', 'asset.mascot.ai'])
  assert.equal(normalized.status, 0, normalized.stdout + normalized.stderr)
  const approved = approveAssets(root, ['asset.mascot.ai'], proof)
  assert.equal(approved.results[0]?.outcome, 'approved')
  assert.deepEqual(errorsFor(root, 'asset.mascot.ai'), [])
})
