import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import Ajv from 'ajv'
import { checkSvg, svgPublicationIssues } from '@brand-os/asset-catalog'
import { AGENT_TOKEN_ENV, buildTaskContext, packDigest, type TaskContextPack } from '@brand-os/brand-core'
import {
  createDemoBrand,
  DEMO_NOW,
  loadApprovedLogo,
  MAX_PACK_BYTES,
  openOwnerWorkspace,
  readPackFile,
  runSocialBatch,
  RuntimeError,
  type SocialBatchResult,
} from '@brand-os/brand-core/runtime'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

/**
 * Brand Runtime, `--pack`: a real brand's social_batch pack file instead of the demo (docs-internal/BRAND_RUNTIME.md).
 *
 * The fixture is the SYNTHETIC DEMO workspace in a temp directory; its pack is written to a temp file in the exact
 * envelope `brand:query --tool task_context` prints. No test reads a real brand (this repository's brand/ or any other).
 *
 * - the pack file path drafts ten posts, deterministically (same pack file ⇒ same SVG bytes);
 * - a tampered, wrong-type or wrong-count pack file is refused exactly like the demo path;
 * - malformed, non-ok, linked or oversized files are refused before anything is rendered;
 * - --root is owner-local, must be the same brand, and leaves the workspace byte-for-byte unchanged;
 * - Coach findings are warnings and never block a draft.
 */

const repo = path.resolve(import.meta.dirname, '..')
const ajv = new Ajv({ allErrors: true, strict: false })
const validateBatch = ajv.compile(JSON.parse(fs.readFileSync(path.join(repo, 'schemas/runtime-batch.schema.json'), 'utf8')) as object)
const brandStatus = (): string => execFileSync('git', ['--no-optional-locks', 'status', '--porcelain', '--', 'brand'], { cwd: repo, encoding: 'utf8' })
const brandBefore = brandStatus()

const fixture = createDemoBrand()
const envelope = buildTaskContext(fixture.engine, fixture.ctx, { task_type: 'social_batch', deliverable_count: 10, channel: 'instagram', locale: 'fa', output_format: 'svg' })
assert.equal(envelope.status, 'ok')
const temps: string[] = []
const tempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-runtime-pack-test-'))
  temps.push(dir)
  return dir
}
after(() => {
  fixture.cleanup()
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true })
})

const writeJson = (value: unknown, name = 'pack.json'): string => {
  const file = path.join(tempDir(), name)
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
  return file
}
const packFile = writeJson(envelope)
const pack = envelope.data!
const runPack = (input: TaskContextPack): SocialBatchResult => runSocialBatch(input, { demo: false, now: DEMO_NOW, origin: 'pack_file' })

/** A changed copy of the pack with a recomputed digest, as task_context would have produced for other data. */
function repack(change: (copy: TaskContextPack) => void): TaskContextPack {
  const copy = JSON.parse(JSON.stringify(pack)) as TaskContextPack
  change(copy)
  copy.digests = { context_sha256: packDigest(copy) }
  return copy
}

const refusedAs = (code: RuntimeError['code']) => (error: unknown) => error instanceof RuntimeError && error.code === code

/** sha256 of every file under a directory, for a byte-for-byte "nothing changed" check. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      // The Visual DNA resolver appends its audit line here; checked separately (append-only, ids only).
      else if (path.relative(dir, full) === path.join('.private', 'access-log.jsonl')) continue
      else out[path.relative(dir, full)] = createHash('sha256').update(fs.readFileSync(full)).digest('hex')
    }
  }
  walk(dir)
  return out
}

test('a task_context result file (or the bare pack) drafts ten posts, the same bytes every time', () => {
  const fromEnvelope = readPackFile(packFile)
  assert.deepEqual(fromEnvelope, pack)
  assert.deepEqual(readPackFile(writeJson(pack, 'bare.json')), pack)
  const first = runPack(fromEnvelope)
  const second = runPack(readPackFile(packFile))
  assert.equal(first.summary.status, 'drafted', JSON.stringify(first.summary.blockers))
  assert.equal(first.manifests.length, 10)
  assert.deepEqual([...second.files.entries()], [...first.files.entries()], 'same pack file ⇒ same bytes')
  assert.equal(first.summary.context.origin, 'pack_file')
  assert.equal(first.summary.demo, false)
  assert.equal(validateBatch(first.summary), true, JSON.stringify(validateBatch.errors))
  for (const manifest of first.manifests) {
    const svg = first.files.get(manifest.file)!
    assert.equal(checkSvg(svg).ok, true, manifest.post_id)
    assert.deepEqual(svgPublicationIssues(svg), [], manifest.post_id)
    assert.equal(manifest.demo, false)
    assert.doesNotMatch(svg, /نمونهٔ مصنوعی — برند واقعی نیست|SYNTHETIC DEMO — NOT A REAL BRAND/, 'a pack-file post carries no demo stamp')
    assert.match(svg, /پیش‌نویس · تأییدنشده · برای انتشار نیست/, 'the draft stamp stays in the artwork')
    assert.equal(manifest.assets.length, 0, 'no logo without the owner workspace')
  }
  // Without the owner workspace the Coach is not called, and says so.
  const coach = first.summary.layers.find((layer) => layer.layer === 'coach')!
  assert.equal(coach.called, false)
  assert.equal(coach.skipped_reason, 'not_requested')
})

test('a tampered, wrong-type or wrong-count pack file is refused like the demo path', () => {
  const tampered = JSON.parse(JSON.stringify(envelope)) as typeof envelope
  tampered.data!.sections.identity[0]!.value = 'changed after the digest'
  assert.throws(() => runPack(readPackFile(writeJson(tampered))), refusedAs('invalid_pack'))
  const wrongType = { ...envelope, data: repack((copy) => (copy.task.type = 'visual_design')) }
  assert.throws(() => runPack(readPackFile(writeJson(wrongType))), refusedAs('wrong_task'))
  const wrongCount = { ...envelope, data: repack((copy) => (copy.task.deliverable_count = 12)) }
  assert.throws(() => runPack(readPackFile(writeJson(wrongCount))), refusedAs('wrong_task'))
  const authorizing = repack((copy) => ((copy as { authorizes: string[] }).authorizes = ['publish']))
  assert.throws(() => runPack(readPackFile(writeJson(authorizing))), refusedAs('invalid_pack'))
})

test('a file that is not a usable pack is refused before anything is rendered', () => {
  const dir = tempDir()
  fs.writeFileSync(path.join(dir, 'broken.json'), '{ not json')
  assert.throws(() => readPackFile(path.join(dir, 'broken.json')), refusedAs('invalid_pack'))
  assert.throws(() => readPackFile(path.join(dir, 'absent.json')), refusedAs('invalid_pack'))
  assert.throws(() => readPackFile(dir), refusedAs('invalid_pack'), 'a directory')
  fs.symlinkSync(packFile, path.join(dir, 'link.json'))
  assert.throws(() => readPackFile(path.join(dir, 'link.json')), refusedAs('invalid_pack'), 'a symlink')
  fs.writeFileSync(path.join(dir, 'big.json'), Buffer.alloc(MAX_PACK_BYTES + 1, 0x20))
  assert.throws(() => readPackFile(path.join(dir, 'big.json')), refusedAs('invalid_pack'), 'oversized')
  assert.throws(() => readPackFile(writeJson({ ...envelope, status: 'denied', data: null })), refusedAs('invalid_pack'), 'a denied result')
  assert.throws(() => readPackFile(writeJson({ ...envelope, brand_id: 'another-brand' })), refusedAs('invalid_pack'), 'envelope and pack disagree')
  // A recomputed digest does not make a malformed pack usable: the shape guard refuses it with a reason.
  const noSections = repack((copy) => delete (copy.sections as Partial<TaskContextPack['sections']>).creative)
  assert.throws(() => runPack(noSections), refusedAs('invalid_pack'))
  assert.throws(() => readPackFile(writeJson(noSections)), refusedAs('invalid_pack'))
})

test('--root is owner-local, must be the same brand, and leaves the workspace unchanged', () => {
  const before = snapshot(path.join(fixture.root, 'brand'))
  const engine = openOwnerWorkspace(fixture.root, pack)
  const { logo } = loadApprovedLogo(engine.workspaceRoot(), pack)
  assert.ok(logo, 'the approved logo passes the publication gate')
  const owned = runSocialBatch(pack, { demo: false, logo, coach: engine, now: DEMO_NOW, origin: 'pack_file' })
  assert.equal(owned.summary.status, 'drafted')
  assert.ok(owned.manifests.every((manifest) => manifest.assets[0]?.embedded === true && manifest.assets[0].sent_to_model === false))
  assert.equal(owned.summary.layers.find((layer) => layer.layer === 'coach')!.called, true)
  assert.deepEqual(snapshot(path.join(fixture.root, 'brand')), before, 'brand/ of the workspace is byte-for-byte unchanged')

  assert.throws(() => openOwnerWorkspace(fixture.root, { ...pack, brand_id: 'another-brand' }), refusedAs('refused'), 'another brand')
  assert.throws(() => openOwnerWorkspace(tempDir(), pack), refusedAs('refused'), 'not a workspace')
  const previous = process.env[AGENT_TOKEN_ENV]
  process.env[AGENT_TOKEN_ENV] = 'agt_not_a_real_token'
  try {
    assert.throws(() => openOwnerWorkspace(fixture.root, pack), refusedAs('refused'), 'agent token')
  } finally {
    if (previous === undefined) delete process.env[AGENT_TOKEN_ENV]
    else process.env[AGENT_TOKEN_ENV] = previous
  }
})

test('Coach findings are warnings and never block a draft', () => {
  const engine = openOwnerWorkspace(fixture.root, pack)
  const owned = runSocialBatch(pack, { demo: false, coach: engine, now: DEMO_NOW, origin: 'pack_file' })
  const coach = owned.summary.layers.find((layer) => layer.layer === 'coach')!
  const notReady = coach.results.filter((entry) => entry.status !== 'ready')
  assert.ok(notReady.length > 0, 'the fixture has at least one Coach result that is not ready')
  assert.equal(owned.summary.status, 'drafted', 'a Coach finding does not block')
  assert.equal(owned.summary.blockers.length, 0)
  assert.equal(owned.summary.warnings.length, notReady.length)
  assert.ok(owned.summary.warnings.every((warning) => warning.layer === 'coach' && warning.blocks === false))
  // Tagline and promise are short by design: the Coach no longer calls them too brief (owner decision 4).
  for (const id of ['brand.verbal.tagline', 'brand.strategy.promise']) {
    const entry = coach.results.find((result) => result.question_id === id)
    assert.ok(entry, `${id} was reviewed`)
    assert.ok(!(entry.codes as string[]).includes('too_brief_for_output'), id)
  }
  assert.doesNotMatch(JSON.stringify(owned.summary.warnings), /لومو|پنج دقیقه/, 'warnings carry codes, never answer text')
})

test('the CLI renders --pack into --out, matches the library, and refuses ambiguous input', () => {
  const env = { ...process.env }
  delete env[AGENT_TOKEN_ENV]
  const cli = (args: string[]) => spawnSync(NODE, tsxArgs('scripts/runtime.ts', ['social-batch', ...args]), { cwd: repo, encoding: 'utf8', env, input: '' })
  const out = path.join(tempDir(), 'out')
  const ok = cli(['--pack', packFile, '--out', out, '--json', '--as-of', DEMO_NOW.toISOString()])
  assert.equal(ok.status, 0, ok.stderr)
  const summary = JSON.parse(ok.stdout) as SocialBatchResult['summary']
  assert.equal(summary.status, 'drafted')
  assert.equal(summary.context.origin, 'pack_file')
  assert.equal(summary.batch_sha256, runPack(pack).summary.batch_sha256, 'CLI and library give the same bytes')
  assert.equal(fs.readdirSync(path.join(out, 'posts')).length, 20)

  const before = snapshot(path.join(fixture.root, 'brand'))
  const withRoot = cli(['--pack', packFile, '--root', fixture.root, '--out', path.join(tempDir(), 'owned'), '--json', '--as-of', DEMO_NOW.toISOString()])
  assert.equal(withRoot.status, 0, withRoot.stderr)
  assert.equal((JSON.parse(withRoot.stdout) as SocialBatchResult['summary']).layers[0]!.called, true)
  assert.deepEqual(snapshot(path.join(fixture.root, 'brand')), before)

  const tampered = JSON.parse(JSON.stringify(envelope)) as typeof envelope
  tampered.data!.sections.identity[0]!.value = 'changed'
  const refused = cli(['--pack', writeJson(tampered), '--out', path.join(tempDir(), 'x')])
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /^invalid_pack:/)
  assert.equal(cli(['--pack', packFile, '--demo', '--out', path.join(tempDir(), 'y')]).status, 2, '--demo and --pack together')
  assert.equal(cli(['--pack', packFile, '--locale', 'en', '--out', path.join(tempDir(), 'z')]).status, 2, 'a pack carries its own locale')
  assert.equal(brandStatus(), brandBefore, "this repository's brand/ folder is unchanged")
})
