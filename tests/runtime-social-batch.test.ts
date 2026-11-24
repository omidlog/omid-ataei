import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import Ajv from 'ajv'
import { checkSvg, svgPublicationIssues } from '@brand-os/asset-catalog'
import { AGENT_TOKEN_ENV, brandRetrieve, packDigest, type TaskContextPack } from '@brand-os/brand-core'
import {
  coachLayer,
  createDemoBrand,
  DEMO_BANNER,
  DEMO_BRAND_SLUG,
  DEMO_LOGO_ID,
  DEMO_NOW,
  demoPack,
  loadApprovedLogo,
  runSocialBatch,
  RuntimeError,
  SOCIAL_BATCH_COUNT,
  writeBatch,
  type SocialBatchResult,
} from '@brand-os/brand-core/runtime'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

/**
 * Brand Runtime, first vertical slice: social_batch → ten real SVG drafts (docs-internal/BRAND_RUNTIME.md).
 *
 * - the pack comes from task_context for the SYNTHETIC DEMO brand, built in a temp directory;
 * - ten SVG files pass the existing checker and publication gate, and validate with their manifests;
 * - the same input gives the same bytes and digests, also across two independent demo builds;
 * - every cited source is in the pack with the same revision;
 * - model_use defaults to not_allowed and nothing is sent to a model;
 * - writes land only in the output directory; this repository's brand/ folder is never touched;
 * - a tampered pack, a wrong task, too few approved messages or a missing palette are refused or blocked, never padded;
 * - the Coach and Assurance layers are called and reported, and the Coach still refuses under an agent token.
 */

const repo = path.resolve(import.meta.dirname, '..')
const ajv = new Ajv({ allErrors: true, strict: false })
const validatePost = ajv.compile(JSON.parse(fs.readFileSync(path.join(repo, 'schemas/runtime-post-manifest.schema.json'), 'utf8')) as object)
const validateBatch = ajv.compile(JSON.parse(fs.readFileSync(path.join(repo, 'schemas/runtime-batch.schema.json'), 'utf8')) as object)
const brandStatus = (): string => execFileSync('git', ['--no-optional-locks', 'status', '--porcelain', '--', 'brand'], { cwd: repo, encoding: 'utf8' })
const brandBefore = brandStatus()

const demo = createDemoBrand()
const pack = demoPack(demo, 'fa')
const { logo, considered } = loadApprovedLogo(demo.root, pack)
const run = (input: TaskContextPack = pack): SocialBatchResult => runSocialBatch(input, { demo: true, demoBanner: DEMO_BANNER, logo, coach: demo.engine, now: DEMO_NOW })
const result = run()
const temps: string[] = []
const tempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-runtime-test-'))
  temps.push(dir)
  return dir
}
after(() => {
  demo.cleanup()
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true })
})

/** A changed copy of the pack with a recomputed digest, as task_context would have produced for other data. */
function repack(change: (copy: TaskContextPack) => void): TaskContextPack {
  const copy = JSON.parse(JSON.stringify(pack)) as TaskContextPack
  change(copy)
  copy.digests = { context_sha256: packDigest(copy) }
  return copy
}

test('the demo pack comes from task_context for the synthetic brand, in a temp directory', () => {
  assert.equal(pack.brand_id, DEMO_BRAND_SLUG)
  assert.equal(pack.task.type, 'social_batch')
  assert.equal(pack.task.deliverable_count, 10)
  assert.equal(pack.readiness, 'ready')
  assert.ok(path.resolve(demo.root).startsWith(path.resolve(os.tmpdir())), 'demo workspace lives in the OS temp folder')
  assert.ok(!path.resolve(demo.root).startsWith(repo), 'demo workspace is not inside this repository')
  assert.deepEqual(pack.authorizes, [])
})

test('ten real SVG posts pass the existing checker and publication gate and validate with their manifests', () => {
  assert.equal(result.summary.status, 'drafted', JSON.stringify(result.summary.blockers))
  assert.equal(result.manifests.length, SOCIAL_BATCH_COUNT)
  assert.equal(validateBatch(result.summary), true, JSON.stringify(validateBatch.errors))
  for (const manifest of result.manifests) {
    assert.equal(validatePost(manifest), true, `${manifest.post_id}: ${JSON.stringify(validatePost.errors)}`)
    const svg = result.files.get(manifest.file)!
    const check = checkSvg(svg)
    assert.equal(check.ok, true, `${manifest.post_id}: ${JSON.stringify(check.issues)}`)
    assert.deepEqual(svgPublicationIssues(svg), [], manifest.post_id)
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1080" height="1350" viewBox="0 0 1080 1350"/)
    // Every check result came from a named layer; none failed for the demo.
    assert.equal(manifest.checks.filter((entry) => entry.result === 'fail').length, 0, JSON.stringify(manifest.checks))
    assert.ok(manifest.checks.some((entry) => entry.layer === 'content-bridge.claims' && entry.result === 'pass'))
    assert.deepEqual(manifest.authorizes, [])
    assert.ok(Object.values(manifest.permissions).every((flag) => flag === false))
    assert.equal(manifest.renderer.model, null)
    assert.equal(manifest.renderer.network, false)
  }
  for (const entry of result.summary.set_checks) assert.equal(entry.result, 'pass', entry.check_id)
  assert.equal(new Set(result.manifests.map((manifest) => manifest.sha256)).size, SOCIAL_BATCH_COUNT)
})

test('every post cites only pack sources, with the revision the pack carried, and shows approved copy unchanged', () => {
  const revisions = new Map(pack.sources.map((source) => [source.id, source.revision]))
  const approved = new Set(Object.values(pack.sections).flat().filter((item) => item.state === 'approved').map((item) => String(item.value)))
  for (const manifest of result.manifests) {
    for (const source of manifest.sources) {
      assert.ok(revisions.has(source.source_id), `${manifest.post_id}: ${source.source_id} is in the pack`)
      assert.equal(source.source_revision, revisions.get(source.source_id), `${manifest.post_id}: ${source.source_id} revision`)
    }
    assert.equal(manifest.context.pack_sha256, pack.digests.context_sha256)
    const message = /<desc id="d">([^<]*)<\/desc>/.exec(result.files.get(manifest.file)!)![1]!
    const unescaped = message.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    assert.ok([...approved].some((value) => value === unescaped || value.includes(unescaped)), `${manifest.post_id}: copy is approved text`)
  }
})

test('same input gives the same bytes and digests, also across two independent demo builds', () => {
  const again = run()
  assert.deepEqual([...again.files.entries()], [...result.files.entries()])
  const second = createDemoBrand()
  try {
    const secondPack = demoPack(second, 'fa')
    assert.equal(secondPack.digests.context_sha256, pack.digests.context_sha256)
    const secondLogo = loadApprovedLogo(second.root, secondPack).logo
    const other = runSocialBatch(secondPack, { demo: true, demoBanner: DEMO_BANNER, logo: secondLogo, coach: second.engine, now: DEMO_NOW })
    for (const manifest of result.manifests) assert.equal(other.files.get(manifest.file), result.files.get(manifest.file), manifest.post_id)
    assert.equal(other.summary.batch_sha256, result.summary.batch_sha256)
  } finally {
    second.cleanup()
  }
})

test('en and tr change labels, never the approved copy or its direction', () => {
  const descs = (r: SocialBatchResult): string[] => r.manifests.map((manifest) => /<desc id="d">([^<]*)<\/desc>/.exec(r.files.get(manifest.file)!)![1]!)
  for (const locale of ['en', 'tr'] as const) {
    const other = runSocialBatch(demoPack(demo, locale), { demo: true, demoBanner: DEMO_BANNER, logo, coach: null, now: DEMO_NOW })
    assert.deepEqual(descs(other), descs(result), locale)
    // Direction follows the script of the approved copy (Persian here), not the UI locale.
    assert.ok(other.manifests.every((manifest) => manifest.direction === 'rtl'), locale)
    assert.ok(other.manifests.every((manifest) => manifest.locale === locale))
    const svg = other.files.get(other.manifests[0]!.file)!
    assert.ok(svg.includes('\u202B'), `${locale}: Persian lines carry an RTL embedding`)
    assert.ok(!/\u202B(Why|Our|Made|The|Theme|In one|DRAFT|Sözümüz|TASLAK)/u.test(svg), `${locale}: Latin labels are never embedded RTL`)
  }
  assert.ok(result.manifests.every((manifest) => manifest.direction === 'rtl'))
})

test('model_use defaults to not_allowed and nothing is sent to a model', () => {
  const retrieved = brandRetrieve(demo.engine, demo.ctx, { kind: 'asset', ids: [DEMO_LOGO_ID] })
  const item = (retrieved.data as { items: Array<{ value: Record<string, unknown> }> }).items[0]
  assert.equal(item?.value.model_use, 'not_allowed')
  const packAsset = Object.values(pack.sections).flat().find((entry) => entry.key === 'assets.logo')
  assert.equal((packAsset?.value as Record<string, unknown>).model_use, 'not_allowed')
  assert.equal(considered.length, 1)
  assert.equal(considered[0]!.embedded, true)
  for (const manifest of result.manifests) {
    assert.equal(manifest.assets.length, 1)
    assert.equal(manifest.assets[0]!.model_use, 'not_allowed')
    assert.equal(manifest.assets[0]!.sent_to_model, false)
  }
  // The runtime code imports no model client and no network module.
  const dir = path.join(repo, 'packages/brand-core/src/runtime')
  for (const file of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8')
    assert.doesNotMatch(text, /from '(node:)?(http|https|net|tls|dgram)'|from '\.\.\/llm|fetch\(/, file)
  }
})

test('a changed logo file is not embedded: the Visual DNA resolver reports it changed', () => {
  const file = path.join(demo.root, 'brand/assets/logo/synthetic-demo-mark.svg')
  const original = fs.readFileSync(file, 'utf8')
  try {
    fs.writeFileSync(file, original.replace('#F2B705', '#F2B706'))
    const changed = loadApprovedLogo(demo.root, pack)
    assert.equal(changed.logo, null)
    assert.equal(changed.considered[0]?.not_embedded_reason, 'visual_dna:changed:checksum_mismatch')
    assert.equal(changed.references[0]?.state, 'changed')
    // The withheld logo is listed in every manifest with its reason code, never silently absent.
    const withheld = runSocialBatch(pack, { demo: true, demoBanner: DEMO_BANNER, logo: changed.logo, logoConsidered: changed.considered, coach: demo.engine, now: DEMO_NOW })
    const bare = runSocialBatch(pack, { demo: true, demoBanner: DEMO_BANNER, logo: null, coach: demo.engine, now: DEMO_NOW })
    for (const manifest of withheld.manifests) {
      assert.deepEqual(
        manifest.assets.map((asset) => [asset.asset_id, asset.embedded, asset.sent_to_model, asset.not_embedded_reason]),
        [[DEMO_LOGO_ID, false, false, 'visual_dna:changed:checksum_mismatch']],
      )
      assert.ok(validatePost(manifest), JSON.stringify(validatePost.errors))
      assert.equal(withheld.files.get(manifest.file), bare.files.get(manifest.file), 'no logo drawn')
    }
  } finally {
    fs.writeFileSync(file, original)
  }
})

test('writes land only in an empty output directory outside brand/', () => {
  const out = path.join(tempDir(), 'batch')
  const written = writeBatch(out, result)
  const tree = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? tree(path.join(dir, entry.name)).map((name) => `${entry.name}/${name}`) : [entry.name]))
  assert.deepEqual(tree(out).sort(), [...result.files.keys()].sort())
  assert.deepEqual(written.sort(), [...result.files.keys()].sort())
  assert.equal(written.length, 21)
  assert.throws(() => writeBatch(out, result), (error: unknown) => error instanceof RuntimeError && error.code === 'unsafe_output', 'non-empty directory')
  assert.throws(() => writeBatch(path.join(tempDir(), 'brand', 'out'), result), (error: unknown) => error instanceof RuntimeError && error.code === 'unsafe_output', 'inside brand/')
  const link = path.join(tempDir(), 'link')
  fs.symlinkSync(tempDir(), link)
  assert.throws(() => writeBatch(link, result), (error: unknown) => error instanceof RuntimeError && error.code === 'unsafe_output', 'symlink')
  // A dangling link is still a link.
  const dangling = path.join(tempDir(), 'dangling')
  fs.symlinkSync(path.join(tempDir(), 'gone', 'nowhere'), dangling)
  assert.throws(() => writeBatch(dangling, result), (error: unknown) => error instanceof RuntimeError && error.code === 'unsafe_output', 'dangling symlink')
  // A linked parent that leads into a brand/ folder is refused before anything is created there.
  const base = tempDir()
  fs.mkdirSync(path.join(base, 'brand'))
  fs.symlinkSync(path.join(base, 'brand'), path.join(base, 'via'))
  assert.throws(() => writeBatch(path.join(base, 'via', 'out'), result), (error: unknown) => error instanceof RuntimeError && error.code === 'unsafe_output', 'linked parent into brand/')
  assert.deepEqual(fs.readdirSync(path.join(base, 'brand')), [], 'nothing created under brand/')
  assert.equal(brandStatus(), brandBefore, "this repository's brand/ folder is unchanged")
})

test('a tampered pack, another task or another count is refused', () => {
  const tampered = JSON.parse(JSON.stringify(pack)) as TaskContextPack
  tampered.sections.identity[0]!.value = 'changed after the digest'
  assert.throws(() => run(tampered), (error: unknown) => error instanceof RuntimeError && error.code === 'invalid_pack')
  assert.throws(() => run(repack((copy) => (copy.task.type = 'visual_design'))), (error: unknown) => error instanceof RuntimeError && error.code === 'wrong_task')
  assert.throws(() => run(repack((copy) => (copy.task.deliverable_count = 9))), (error: unknown) => error instanceof RuntimeError && error.code === 'wrong_task')
})

test('too few approved messages or no approved palette blocks the batch instead of padding it', () => {
  const few = run(repack((copy) => {
    for (const section of Object.values(copy.sections)) for (const item of section) if (item.key === 'pillars' || item.key === 'purpose') item.state = 'missing'
  }))
  assert.equal(few.summary.status, 'blocked')
  assert.equal(few.manifests.length, 0)
  assert.ok(few.summary.blockers.some((blocker) => blocker.code === 'insufficient_approved_messages'))
  assert.equal(few.summary.set_checks.find((entry) => entry.check_id === 'set.count')?.result, 'fail')
  assert.equal(validateBatch(few.summary), true, JSON.stringify(validateBatch.errors))

  const noPalette = run(repack((copy) => {
    for (const section of Object.values(copy.sections)) for (const item of section) if (item.key === 'color_roles') item.state = 'missing'
  }))
  assert.equal(noPalette.summary.status, 'blocked')
  assert.ok(noPalette.summary.blockers.some((blocker) => blocker.code === 'palette_missing'))
})

test('the Content Bridge claim guard fails a post whose copy carries a banned claim', () => {
  const banned = run(repack((copy) => {
    const promise = copy.sections.identity.find((item) => item.source_id === 'brand.strategy.promise')!
    promise.value = `${String(promise.value)} تضمین موفقیت`
  }))
  const post = banned.manifests.find((manifest) => manifest.angle === 'promise')!
  const claims = post.checks.find((entry) => entry.check_id === 'copy.claims')!
  assert.equal(claims.result, 'fail')
  assert.ok(claims.evidence.some((line) => line.startsWith('banned:message:brand.verbal.forbidden')))
})

test('Coach and Assurance are called and reported in their own vocabulary', () => {
  const coach = result.summary.layers.find((layer) => layer.layer === 'coach')!
  assert.equal(coach.called, true)
  assert.equal(coach.skipped_reason, null)
  assert.ok(coach.results.some((entry) => entry.mode === 'consistency_review'))
  assert.ok(coach.results.filter((entry) => entry.mode === 'quality_review').length >= 5)
  const assurance = result.summary.layers.find((layer) => layer.layer === 'assurance')!
  const assessed = assurance.results[0] as { claim_level: string; limitations: string[]; controls: unknown[] }
  assert.equal(assessed.controls.length, 15)
  assert.ok(assessed.limitations.includes('demo_data'))
  assert.ok(assessed.limitations.includes('internal_assessment_only'))
  assert.notEqual(assessed.claim_level, 'certified')
  assert.equal(result.summary.advisory.visual_review, 'not_tested')
  // No answer text from the brand leaks into the coach report.
  assert.doesNotMatch(JSON.stringify(coach), /لومو|پنج دقیقه/)

  const previous = process.env[AGENT_TOKEN_ENV]
  process.env[AGENT_TOKEN_ENV] = 'agt_not_a_real_token'
  try {
    const refused = coachLayer(demo.engine, ['brand.strategy.promise'], DEMO_NOW)
    assert.equal(refused.skipped_reason, 'refused')
    assert.throws(() => createDemoBrand(), (error: unknown) => error instanceof RuntimeError && error.code === 'refused')
  } finally {
    if (previous === undefined) delete process.env[AGENT_TOKEN_ENV]
    else process.env[AGENT_TOKEN_ENV] = previous
  }
})

test('the CLI writes the batch to --out and refuses without --demo', () => {
  const out = path.join(tempDir(), 'cli')
  const env = { ...process.env }
  delete env[AGENT_TOKEN_ENV]
  const ok = spawnSync(NODE, tsxArgs('scripts/runtime.ts', ['social-batch', '--demo', '--out', out, '--json']), { cwd: repo, encoding: 'utf8', env, input: '' })
  assert.equal(ok.status, 0, ok.stderr)
  const summary = JSON.parse(ok.stdout) as { status: string; batch_sha256: string; posts: unknown[] }
  assert.equal(summary.status, 'drafted')
  assert.equal(summary.posts.length, 10)
  assert.equal(summary.batch_sha256, result.summary.batch_sha256, 'the CLI produces the same bytes as the library')
  assert.equal(fs.readdirSync(path.join(out, 'posts')).length, 20)
  const refused = spawnSync(NODE, tsxArgs('scripts/runtime.ts', ['social-batch', '--out', path.join(tempDir(), 'x')]), { cwd: repo, encoding: 'utf8', env, input: '' })
  assert.equal(refused.status, 2)
  assert.match(refused.stderr, /--demo/)
  assert.equal(brandStatus(), brandBefore)
})
