import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import Ajv from 'ajv'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { agentTokenContext, buildTaskContext, guestContext, issueAgentToken, packDigest, readAccessLog, type TaskContextPack } from '@brand-os/brand-core'
import {
  createDemoBrand,
  DEMO_LOGO_ID,
  DEMO_NOW,
  demoPack,
  loadApprovedLogo,
  packAssetIds,
  planSocialBatch,
  productionReadiness,
  productionText,
  readBatchDir,
  runProductionReadinessTool,
  runSocialBatch,
  RuntimeError,
  writeBatch,
  type BatchArtifacts,
  type ProductionReadiness,
  type SocialBatchResult,
} from '@brand-os/brand-core/runtime'
import type { VisualReference } from '@brand-os/brand-core/visual-dna'
import { TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

/**
 * Production readiness and the deterministic quality gate (fixes pack PR-E, GAP-05; docs-internal/BRAND_RUNTIME.md).
 *
 * The fixture is the SYNTHETIC DEMO brand in a temp directory. No test reads a real brand.
 *
 * DoD: a missing required logo, a bad SHA, blocked rights, a banned claim and a missing renderer each give a
 * deterministic not_ready with the rule owner named; optional assets never block; untested checks say not_tested;
 * the pack's own readiness is never changed.
 */
useTestKey()
const repo = path.resolve(import.meta.dirname, '..')
const validate = new Ajv({ allErrors: true, strict: false }).compile(JSON.parse(fs.readFileSync(path.join(repo, 'schemas/production-readiness.schema.json'), 'utf8')) as object)

const demo = createDemoBrand()
const pack = demoPack(demo, 'fa')
const loaded = loadApprovedLogo(demo.root, pack)
const temps: string[] = []
const tempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-production-test-'))
  temps.push(dir)
  return dir
}
after(() => {
  demo.cleanup()
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true })
})

function repack(change: (copy: TaskContextPack) => void, base: TaskContextPack = pack): TaskContextPack {
  const copy = JSON.parse(JSON.stringify(base)) as TaskContextPack
  change(copy)
  copy.digests = { context_sha256: packDigest(copy) }
  return copy
}
const check = (result: ProductionReadiness, id: string) => result.checks.find((entry) => entry.check_id === id)
const valid = (result: ProductionReadiness): void => assert.equal(validate(result), true, JSON.stringify(validate.errors))
const batchOf = (result: SocialBatchResult): BatchArtifacts => ({ summary: result.summary, manifests: result.manifests, files: new Map(result.files) })

test('the demo pack is production-ready pre-render, and the pack readiness is copied, never changed', () => {
  const before = JSON.stringify(pack)
  const result = productionReadiness({ pack, references: loaded.references, required_assets: ['logo'] })
  valid(result)
  assert.equal(result.production_ready, 'ready', JSON.stringify(result.blockers))
  assert.equal(result.stage, 'pre_render')
  assert.equal(result.context.readiness, pack.readiness)
  assert.equal(result.context.pack_sha256, pack.digests.context_sha256)
  assert.equal(JSON.stringify(pack), before, 'the pack is not mutated')
  assert.equal(check(result, 'asset.required_logo')?.verdict, 'pass')
  assert.equal(check(result, 'copy.claims')?.verdict, 'pass')
  assert.equal(check(result, 'artifact.checks')?.verdict, 'not_tested', 'no artifact yet: not_tested, not pass')
  assert.equal(result.renderer.name, 'brand-os-svg-post-renderer')
  assert.deepEqual(result.authorizes, [])
  assert.ok(Object.values(result.permissions).every((flag) => flag === false))
  assert.equal(result.direction, 'rtl')
  // Taste and persuasion are never a pass and never a block.
  assert.equal(check(result, 'review.visual_taste')?.verdict, 'needs_human_review')
  assert.equal(check(result, 'review.semantic')?.verdict, 'not_tested')
  assert.ok(result.checks.filter((entry) => entry.rule_owner === 'human').every((entry) => !entry.blocks))
  // Every check names its owner, input and verdict, and only hard rules may block.
  assert.ok(result.checks.every((entry) => entry.rule_owner && entry.input && entry.verdict && (entry.hard || !entry.blocks)))
  // Same input, same digest.
  assert.equal(productionReadiness({ pack, references: loaded.references, required_assets: ['logo'] }).digest, result.digest)
})

test('missing renderer: context may be ready while production is not_ready (GAP-05)', () => {
  const website = buildTaskContext(demo.engine, demo.ctx, { task_type: 'website_design', locale: 'en' }).data!
  const result = productionReadiness({ pack: website, references: [] })
  valid(result)
  assert.equal(result.production_ready, 'not_ready')
  assert.equal(result.context.readiness, website.readiness, 'context readiness keeps its own meaning')
  const renderer = check(result, 'renderer.available')!
  assert.deepEqual([renderer.verdict, renderer.blocks, renderer.rule_owner], ['fail', true, 'runtime.renderers'])
  assert.ok(renderer.evidence.includes('deliverable:brief_only'))
  assert.equal(check(result, 'copy.claims')?.verdict, 'not_tested')
  assert.deepEqual(result.blockers.map((blocker) => blocker.check_id), ['renderer.available'])

  // Format violations are hard too: a count or format the renderer does not produce.
  for (const change of [(copy: TaskContextPack) => (copy.task.deliverable_count = 12), (copy: TaskContextPack) => (copy.task.output_format = 'png'), (copy: TaskContextPack) => (copy.task.channel = 'tiktok')]) {
    const wrong = productionReadiness({ pack: repack(change), references: loaded.references })
    assert.equal(check(wrong, 'output.format')?.blocks, true)
    assert.equal(wrong.production_ready, 'not_ready')
  }
})

test('bad SHA: a pack changed after task_context built it, or a logo file changed on disk', () => {
  const tampered = JSON.parse(JSON.stringify(pack)) as TaskContextPack
  tampered.sections.identity[0]!.value = 'changed after the digest'
  const result = productionReadiness({ pack: tampered, references: loaded.references })
  valid(result)
  assert.equal(result.production_ready, 'not_ready')
  assert.deepEqual([check(result, 'context.pack_integrity')?.verdict, check(result, 'context.pack_integrity')?.rule_owner], ['fail', 'task-context.pack'])
  assert.equal(check(result, 'copy.claims')?.verdict, 'not_tested', 'copy from an unverified pack is not judged')

  const file = path.join(demo.root, 'brand/assets/logo/synthetic-demo-mark.svg')
  const original = fs.readFileSync(file, 'utf8')
  try {
    fs.writeFileSync(file, original.replace('#F2B705', '#F2B706'))
    const { references } = loadApprovedLogo(demo.root, pack)
    const optional = productionReadiness({ pack, references })
    const ref = check(optional, 'asset.reference')!
    assert.deepEqual([ref.verdict, ref.blocks, ref.rule_owner], ['fail', false, 'visual-dna.resolver'])
    assert.equal(optional.production_ready, 'ready', 'an optional asset never blocks')
    assert.equal(optional.asset_delivery.references[0]?.state, 'changed')
    const required = productionReadiness({ pack, references, required_assets: ['logo'] })
    assert.equal(required.production_ready, 'not_ready')
    assert.deepEqual(required.blockers.map((blocker) => [blocker.check_id, blocker.code]), [['asset.required_logo', 'required_logo_unusable']])
  } finally {
    fs.writeFileSync(file, original)
  }
  // A pack that pinned an older checksum than the approved file: pack_pin_differs.
  const stalePin = repack((copy) => {
    const item = copy.sections.creative.find((entry) => entry.key === 'assets.logo')!
    ;(item.value as Record<string, unknown>).checksum_sha256 = '0'.repeat(64)
  })
  const stale = productionReadiness({ pack: stalePin, references: loaded.references, required_assets: ['logo'] })
  assert.equal(stale.asset_delivery.references[0]?.reason, 'pack_pin_differs')
  assert.equal(stale.production_ready, 'not_ready')
})

test('an asset id visual_dna would refuse does not void the other verdicts: it stays not_tested', () => {
  const odd = repack((copy) => {
    const item = copy.sections.creative.find((entry) => entry.key === 'assets.logo')!
    copy.sections.creative.push({ ...item, key: 'assets.icon', source_id: 'icon with space', value: { ...(item.value as Record<string, unknown>), id: 'icon with space' } })
  })
  assert.deepEqual(packAssetIds(odd), [DEMO_LOGO_ID], 'only ids visual_dna accepts are sent')
  const result = productionReadiness({ pack: odd, references: loaded.references, required_assets: ['logo'] })
  valid(result)
  assert.deepEqual(
    result.asset_delivery.references.map((asset) => [asset.asset_id, asset.state]),
    [
      [DEMO_LOGO_ID, 'approved'],
      ['icon with space', 'not_tested'],
    ],
  )
  assert.equal(result.production_ready, 'ready', 'an optional asset that was not tested never blocks')

  // social-batch --root resolves every pack asset (as readiness --root does), not only the logo.
  const extra = repack((copy) => {
    const item = copy.sections.creative.find((entry) => entry.key === 'assets.logo')!
    copy.sections.creative.push({ ...item, key: 'assets.icon', source_id: 'icon.synthetic-extra', value: { ...(item.value as Record<string, unknown>), id: 'icon.synthetic-extra' } })
  })
  const both = loadApprovedLogo(demo.root, extra)
  assert.ok(both.logo, 'the logo is still embedded')
  assert.deepEqual(
    both.references.filter((ref) => ref.via === 'asset').map((ref) => [ref.asset_id, ref.state]),
    [
      [DEMO_LOGO_ID, 'approved'],
      ['icon.synthetic-extra', 'missing'],
    ],
  )
  const verdicts = productionReadiness({ pack: extra, references: both.references }).asset_delivery.references
  assert.deepEqual(verdicts.map((asset) => [asset.asset_id, asset.state]), [
    [DEMO_LOGO_ID, 'approved'],
    ['icon.synthetic-extra', 'missing'],
  ])
})

test('blocked usage rights and a missing required logo are deterministic blockers; not verifiable is not a pass', () => {
  const withheld: VisualReference[] = loaded.references.map((ref) => ({ ...ref, state: 'withheld', reason: 'rights', asset: null, rights: null, delivery: 'none' }))
  const rights = productionReadiness({ pack, references: withheld, required_assets: ['logo'] })
  valid(rights)
  assert.equal(rights.production_ready, 'not_ready')
  assert.ok(check(rights, 'asset.required_logo')!.evidence.includes(`${DEMO_LOGO_ID}:withheld:rights`))
  assert.equal(productionReadiness({ pack, references: withheld }).production_ready, 'ready', 'the same withheld logo, not required: no block')

  const noLogo = repack((copy) => {
    copy.sections.creative = copy.sections.creative.filter((entry) => entry.key !== 'assets.logo')
  })
  const missing = productionReadiness({ pack: noLogo, references: [], required_assets: ['logo'] })
  valid(missing)
  assert.deepEqual(missing.blockers.map((blocker) => [blocker.check_id, blocker.rule_owner, blocker.code]), [['asset.required_logo', 'owner.task_input', 'missing_required_logo']])
  assert.equal(productionReadiness({ pack: noLogo, references: [] }).production_ready, 'ready', 'no logo, not required: ready')

  // No resolver run (no owner workspace, or a token visual_dna denies): the logo is not_tested, and a required one blocks.
  const unverified = productionReadiness({ pack, references: null, required_assets: ['logo'] })
  const required = check(unverified, 'asset.required_logo')!
  assert.deepEqual([required.verdict, required.blocks], ['not_tested', true])
  assert.equal(unverified.asset_delivery.status, 'not_tested')
  assert.equal(productionReadiness({ pack, references: null }).production_ready, 'ready')
})

test('a banned claim in the copy blocks, through the content-bridge guard', () => {
  const message = planSocialBatch(pack).posts[0]!.message
  const banned = repack((copy) => {
    copy.sections.production.push({ key: 'banned_claims', value: message, state: 'approved', source_id: 'brand.verbal.forbidden', source_revision: 'test' })
  })
  const result = productionReadiness({ pack: banned, references: loaded.references })
  valid(result)
  const claims = check(result, 'copy.claims')!
  assert.deepEqual([claims.verdict, claims.blocks, claims.rule_owner], ['fail', true, 'content-bridge.claims'])
  assert.ok(claims.evidence[0]!.startsWith('post-01:banned:message:brand.verbal.forbidden'))
  assert.doesNotMatch(JSON.stringify(result), new RegExp(message.slice(0, 12)), 'evidence carries ids, never the copy')
})

test('artifact stage: the batch passes; a wrong file checksum, an unsafe SVG or a missing required logo block', () => {
  const result = runSocialBatch(pack, { demo: true, logo: loaded.logo, coach: demo.engine, now: DEMO_NOW })
  const ok = productionReadiness({ pack, references: loaded.references, required_assets: ['logo'], batch: batchOf(result) })
  valid(ok)
  assert.equal(ok.stage, 'artifact')
  assert.equal(ok.production_ready, 'ready', JSON.stringify(ok.blockers))
  for (const id of ['artifact.pack_pin', 'artifact.file_sha256', 'artifact.svg_safety', 'artifact.required_logo', 'copy.claims', 'set.count']) assert.equal(check(ok, id)?.verdict, 'pass', id)
  // Drafts keep live text, which the SVG checker reports as a warning: a warning is shown, never counted as a pass or a block.
  assert.deepEqual([check(ok, 'svg.allowlist')?.verdict, check(ok, 'svg.allowlist')?.blocks], ['warn', false])
  assert.equal(check(ok, 'coach.advice')?.rule_owner, 'strategic-coach')
  assert.equal(check(ok, 'coach.advice')?.blocks, false, 'Coach advice never blocks')

  const tampered = batchOf(result)
  const file = result.manifests[0]!.file
  tampered.files.set(file, String(tampered.files.get(file)).replace('</svg>', '<script>alert(1)</script></svg>'))
  const bad = productionReadiness({ pack, references: loaded.references, batch: tampered })
  valid(bad)
  assert.equal(bad.production_ready, 'not_ready')
  assert.deepEqual(bad.blockers.map((blocker) => blocker.check_id).sort(), ['artifact.file_sha256', 'artifact.svg_safety'])
  assert.ok(check(bad, 'artifact.file_sha256')!.evidence.includes('sha256:post-01'))

  const noLogo = runSocialBatch(pack, { demo: true, logo: null, now: DEMO_NOW })
  const missing = productionReadiness({ pack, references: loaded.references, required_assets: ['logo'], batch: batchOf(noLogo) })
  assert.deepEqual(missing.blockers.map((blocker) => [blocker.check_id, blocker.code]), [['artifact.required_logo', 'missing_required_logo']])

  // A runtime fail that is not a hard rule (contrast) asks for a person; it is never passed and never blocks.
  const lowContrast = batchOf(result)
  lowContrast.manifests = lowContrast.manifests.map((manifest) => ({ ...manifest, checks: manifest.checks.map((entry) => (entry.check_id === 'color.contrast' ? { ...entry, result: 'fail' as const } : entry)) }))
  const contrast = check(productionReadiness({ pack, references: loaded.references, batch: lowContrast }), 'color.contrast')!
  assert.deepEqual([contrast.verdict, contrast.blocks, contrast.rule_owner], ['needs_human_review', false, 'design-tokens.contrast'])
})

test('a written batch is re-checked on its bytes; links and stray names are refused', () => {
  const result = runSocialBatch(pack, { demo: true, logo: loaded.logo, now: DEMO_NOW })
  const dir = path.join(tempDir(), 'batch')
  writeBatch(dir, result)
  const fromDisk = productionReadiness({ pack, references: loaded.references, batch: readBatchDir(dir) })
  assert.equal(fromDisk.digest, productionReadiness({ pack, references: loaded.references, batch: batchOf(result) }).digest, 'disk and memory agree')

  const svg = path.join(dir, result.manifests[1]!.file)
  fs.appendFileSync(svg, '\n')
  const changed = productionReadiness({ pack, references: loaded.references, batch: readBatchDir(dir) })
  assert.ok(check(changed, 'artifact.file_sha256')!.evidence.includes(`sha256:${result.manifests[1]!.post_id}`))
  assert.equal(changed.production_ready, 'not_ready')

  fs.rmSync(svg)
  fs.symlinkSync(path.join(demo.root, 'brand/assets/logo/synthetic-demo-mark.svg'), svg)
  assert.throws(() => readBatchDir(dir), (error: unknown) => error instanceof RuntimeError && error.code === 'invalid_batch')
  const summaryFile = path.join(dir, 'batch-summary.json')
  const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8')) as { posts: Array<{ manifest: string }> }
  summary.posts[0]!.manifest = '../../etc/passwd'
  fs.writeFileSync(summaryFile, JSON.stringify(summary))
  assert.throws(() => readBatchDir(dir), (error: unknown) => error instanceof RuntimeError && error.code === 'invalid_batch')
})

test('the agent tool: same caller for task_context and visual_dna, denied before input, invalid input refused', () => {
  const args = { task_type: 'social_batch', deliverable_count: 10, channel: 'instagram', locale: 'fa', output_format: 'svg' }
  const ok = runProductionReadinessTool(demo.engine, demo.ctx, { ...args, required_assets: ['logo'] })
  assert.equal(ok.status, 'ok')
  if (ok.status !== 'ok') return
  valid(ok.data)
  assert.equal(ok.data.context.pack_sha256, pack.digests.context_sha256, 'the pack is the one task_context gives this caller')
  assert.deepEqual(ok.authorizes, [])
  assert.doesNotMatch(JSON.stringify(ok), /<svg/, 'metadata only, never bytes')
  const lines = readAccessLog(demo.root).filter((line) => line.tool === 'production_readiness')
  assert.ok(lines.length > 0 && lines.every((line) => line.principal === demo.ctx.principal_id && line.query_sha256 === null))

  assert.equal(runProductionReadinessTool(demo.engine, guestContext(demo.engine.config().brand.slug), args).status, 'denied')
  assert.equal(runProductionReadinessTool(demo.engine, agentTokenContext('another-brand', 'agt_other', 'content-read'), args).status, 'denied')
  assert.equal(runProductionReadinessTool(demo.engine, demo.ctx, { ...args, required_assets: ['mascot'] }).status, 'invalid')
  assert.equal(runProductionReadinessTool(demo.engine, demo.ctx, { ...args, deliverable_count: 500 }).status, 'invalid')
  const unclear = runProductionReadinessTool(demo.engine, demo.ctx, { request: 'hello' })
  assert.equal(unclear.status, 'need_task_type')
})

function env(extra: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && key !== 'BRAND_OS_AGENT_TOKEN' && key !== 'BRAND_OS_APPROVAL_PROOF') out[key] = value
  }
  return { ...out, BRAND_OS_DATA_KEY: TEST_DATA_KEY, BRAND_OS_KNOWLEDGE_GH: 'off', ...extra }
}

test('production_readiness over stdio MCP: listed, strict schema, metadata only, guests denied', async () => {
  const { token } = issueAgentToken(demo.root, { brandId: demo.engine.config().brand.slug, profile: 'content-read', label: 'production readiness mcp test' })
  const client = new Client({ name: 'brand-os-production-test', version: '0.0.1' })
  await client.connect(new StdioClientTransport({ command: NODE, args: tsxArgs('scripts/mcp.ts'), cwd: demo.root, env: env({ BRAND_OS_AGENT_TOKEN: token }), stderr: 'pipe' }))
  try {
    const tool = (await client.listTools()).tools.find((entry) => entry.name === 'production_readiness')
    assert.ok(tool, 'production_readiness is listed')
    assert.match(tool.description ?? '', /ready is not approval/)
    const call = async (args: Record<string, unknown>) => (await client.callTool({ name: 'production_readiness', arguments: args })) as { content: Array<{ text: string }>; isError?: boolean }
    const reply = await call({ task_type: 'website_design', locale: 'tr' })
    assert.notEqual(reply.isError, true, reply.content[0]?.text)
    const result = JSON.parse(reply.content[0]!.text) as { status: string; data: ProductionReadiness }
    assert.equal(result.status, 'ok')
    valid(result.data)
    assert.equal(result.data.production_ready, 'not_ready')
    assert.equal(result.data.direction, 'ltr')
    assert.equal(check(result.data, 'renderer.available')?.label, 'Bu görev için doğrulanmış oluşturucu')
    assert.equal(reply.content[0]!.text.includes(token), false)
    for (const args of [{ task_type: 'social_batch', role: 'owner' }, { task_type: 'social_batch', brand_id: 'x' }, { task_type: 'social_batch', required_assets: ['mascot'] }, { task_type: 'social_batch', include_bytes: true }]) {
      assert.equal((await call(args)).isError, true, JSON.stringify(args))
    }
  } finally {
    await client.close()
  }
  const guest = new Client({ name: 'brand-os-production-guest', version: '0.0.1' })
  await guest.connect(new StdioClientTransport({ command: NODE, args: tsxArgs('scripts/mcp.ts'), cwd: demo.root, env: env(), stderr: 'pipe' }))
  try {
    const reply = (await guest.callTool({ name: 'production_readiness', arguments: { task_type: 'social_batch' } })) as { content: Array<{ text: string }> }
    assert.equal((JSON.parse(reply.content[0]!.text) as { status: string }).status, 'denied')
  } finally {
    await guest.close()
  }
})

test('brand:runtime readiness: --root verifies the logo as the owner; without it a required logo is not verifiable', () => {
  const packFile = path.join(tempDir(), 'pack.json')
  fs.writeFileSync(packFile, JSON.stringify({ tool: 'task_context', status: 'ok', brand_id: pack.brand_id, data: pack, authorizes: [] }))
  const cliEnv = env()
  const cli = (args: string[]) => spawnSync(NODE, tsxArgs('scripts/runtime.ts', ['readiness', ...args]), { cwd: repo, encoding: 'utf8', env: cliEnv, input: '', timeout: 240_000 })
  const owned = cli(['--pack', packFile, '--root', demo.root, '--require', 'logo', '--json'])
  assert.equal(owned.status, 0, owned.stderr)
  const ready = JSON.parse(owned.stdout) as ProductionReadiness
  valid(ready)
  assert.equal(ready.asset_delivery.status, 'verified')

  const unverified = cli(['--pack', packFile, '--require', 'logo', '--locale', 'fa'])
  assert.equal(unverified.status, 3, unverified.stderr)
  assert.match(unverified.stdout, /تولید: آماده نیست \(not_ready\)/)
  assert.match(unverified.stdout, /لوگوی الزامی/)
  assert.equal(cli(['--pack', packFile, '--require', 'mascot']).status, 2)
})

test('brand:runtime social-batch: a not_ready batch still writes its drafts and exits 3 (PR-E owner decision 3)', () => {
  const packFile = path.join(tempDir(), 'pack.json')
  fs.writeFileSync(packFile, JSON.stringify({ tool: 'task_context', status: 'ok', brand_id: pack.brand_id, data: pack, authorizes: [] }))
  const cliEnv = env()
  const cli = (args: string[]) => spawnSync(NODE, tsxArgs('scripts/runtime.ts', ['social-batch', '--pack', packFile, '--as-of', DEMO_NOW.toISOString(), ...args]), { cwd: repo, encoding: 'utf8', env: cliEnv, input: '', timeout: 240_000 })

  // Without --root a required logo cannot be verified, so production is not_ready; the drafts are written anyway.
  const out = path.join(tempDir(), 'not-ready')
  const notReady = cli(['--require', 'logo', '--out', out])
  assert.equal(notReady.status, 3, notReady.stderr)
  assert.match(notReady.stdout, /production: not_ready/)
  assert.match(notReady.stderr, /پیش‌نویس‌ها نوشته شدند، اما تولید آماده نیست/, 'the fa pack gives the fa line')
  assert.equal(fs.readdirSync(path.join(out, 'posts')).length, 20)
  assert.ok(fs.existsSync(path.join(out, 'batch-summary.json')))
  const written = JSON.parse(fs.readFileSync(path.join(out, 'production-readiness.json'), 'utf8')) as ProductionReadiness
  assert.equal(written.production_ready, 'not_ready')

  // --json keeps stdout one JSON document; the exit code and the stderr line are the same.
  const json = cli(['--require', 'logo', '--json', '--out', path.join(tempDir(), 'json')])
  assert.equal(json.status, 3, json.stderr)
  assert.equal((JSON.parse(json.stdout) as SocialBatchResult['summary']).posts.length, 10)
  assert.match(json.stderr, /exit 3/)

  // The same batch without the requirement is ready: exit 0 and no line.
  const ready = cli(['--out', path.join(tempDir(), 'ready')])
  assert.equal(ready.status, 0, ready.stderr)
  assert.match(ready.stdout, /production: ready/)
  assert.doesNotMatch(ready.stderr, /exit 3/)

  // en and tr carry the same line.
  assert.match(productionText('en').labels.not_ready_exit, /drafts were written.*exit code 3/)
  assert.match(productionText('tr').labels.not_ready_exit, /Taslaklar yazıldı.*çıkış kodu 3/)
})
