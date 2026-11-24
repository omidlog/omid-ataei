import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import Ajv from 'ajv'
import { checkSvg, svgPublicationIssues } from '@brand-os/asset-catalog'
import { AGENT_TOKEN_ENV, packDigest, type TaskContextPack } from '@brand-os/brand-core'
import {
  CANVAS_SCALE,
  createDemoBrand,
  createOutliner,
  DEMO_NOW,
  demoPack,
  drawnCodepoints,
  loadApprovedLogo,
  readFontFile,
  runSocialBatch,
  RuntimeError,
  type Outliner,
  type SocialBatchResult,
} from '@brand-os/brand-core/runtime'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

/**
 * Brand Runtime: the approved type scale on drafts, and outlines only in final export (docs-internal/BRAND_RUNTIME.md).
 *
 * Fixture: the SYNTHETIC DEMO brand in a temp directory. The final-export tests need a TTF that covers Persian; they
 * use DejaVu Sans from the OS when present (no font file is committed) and are skipped, with a reason, when it is not.
 */

const repo = path.resolve(import.meta.dirname, '..')
const ajv = new Ajv({ allErrors: true, strict: false })
const validatePost = ajv.compile(JSON.parse(fs.readFileSync(path.join(repo, 'schemas/runtime-post-manifest.schema.json'), 'utf8')) as object)

const demo = createDemoBrand()
const pack = demoPack(demo, 'fa')
const { logo } = loadApprovedLogo(demo.root, pack)
const run = (input: TaskContextPack, final: Outliner | null = null): SocialBatchResult => runSocialBatch(input, { demo: true, logo, now: DEMO_NOW, final })
const temps: string[] = []
after(() => {
  demo.cleanup()
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true })
})

function repack(change: (copy: TaskContextPack) => void): TaskContextPack {
  const copy = JSON.parse(JSON.stringify(pack)) as TaskContextPack
  change(copy)
  copy.digests = { context_sha256: packDigest(copy) }
  return copy
}
const withScale = (value: string): TaskContextPack =>
  repack((copy) => {
    for (const item of Object.values(copy.sections).flat()) if (item.key === 'type_rules') item.value = value
  })

const FONT_DIRS = ['/usr/share/fonts/truetype/dejavu', '/usr/share/fonts/dejavu', '/usr/share/fonts/TTF', '/Library/Fonts']
const findFont = (name: string): string | null => FONT_DIRS.map((dir) => path.join(dir, name)).find((file) => fs.existsSync(file)) ?? null
const persianFont = findFont('DejaVuSans.ttf')
const latinOnlyFont = findFont('DejaVuSerif-Bold.ttf') ?? findFont('DejaVuSerif.ttf')
const noFont = persianFont ? false : 'DejaVu Sans is not installed; final export needs a real TTF and none is committed'
const DEJAVU_SCALE = 'display: DejaVu Sans, sans-serif @ 44px/1.25; label: DejaVu Sans, sans-serif @ 16px/1.3; body: DejaVu Sans, sans-serif @ 18px/1.4'

const refusedAs = (code: RuntimeError['code']) => (error: unknown) => error instanceof RuntimeError && error.code === code

test('drafts apply the approved type scale: family, fallbacks, sizes and line heights, cited with its revision', () => {
  const result = run(pack)
  assert.equal(result.summary.status, 'drafted')
  const typeSource = pack.sources.find((source) => source.id === 'brand.type.scale')!
  for (const manifest of result.manifests) {
    assert.equal(validatePost(manifest), true, JSON.stringify(validatePost.errors))
    const { typography } = manifest
    assert.equal(typography.applied, true)
    assert.equal(typography.canvas_scale, CANVAS_SCALE)
    assert.deepEqual(typography.slots.headline.family_stack, ['Vazirmatn', 'Tahoma', 'sans-serif'])
    assert.equal(typography.slots.headline.role, 'display')
    assert.equal(typography.slots.headline.size_px, 44 * CANVAS_SCALE)
    assert.equal(typography.slots.headline.line_height, 1.25)
    assert.equal(typography.slots.label.size_px, 16 * CANVAS_SCALE)
    assert.equal(typography.slots.body.size_px, 18 * CANVAS_SCALE)
    assert.equal(typography.slots.headline.weight_source, 'renderer_default', 'the scale has no weight; no token approved one')
    assert.ok(manifest.sources.some((source) => source.source_id === 'brand.type.scale' && source.source_revision === typeSource.revision))
    const svg = result.files.get(manifest.file)!
    assert.match(svg, new RegExp(`font-size="${typography.headline.drawn_px}" font-weight="700" font-family="Vazirmatn, Tahoma, sans-serif"`))
    assert.match(svg, /font-size="32" font-weight="600" letter-spacing="0" font-family="Vazirmatn, Tahoma, sans-serif"/)
    assert.ok(svg.includes('<text'), 'a draft keeps live, editable text')
    assert.deepEqual(manifest.export, { mode: 'draft', text: 'live', outliner: null, fonts: [] })
  }
  assert.deepEqual([...run(pack).files.entries()], [...result.files.entries()], 'same pack ⇒ same bytes')
})

test('weights come only from approved fontWeight tokens; no scale means labelled renderer defaults', () => {
  const tokenPack = repack((copy) => {
    copy.sections.creative.push({ key: 'tokens', value: { id: 'type.fontWeight.display', type: 'fontWeight', value: 800 }, state: 'approved', source_id: 'type.fontWeight.display', source_revision: 'sha256:abc' })
    copy.sources.push({ id: 'type.fontWeight.display', revision: 'sha256:abc', classification: 'internal', status: 'approved' })
  })
  const weighted = run(tokenPack).manifests[0]!
  assert.equal(weighted.typography.slots.headline.weight, 800)
  assert.equal(weighted.typography.slots.headline.weight_source, 'approved_token')
  assert.ok(weighted.sources.some((source) => source.source_id === 'type.fontWeight.display'))

  const none = run(repack((copy) => {
    for (const item of Object.values(copy.sections).flat()) if (item.key === 'type_rules') item.state = 'missing'
  })).manifests[0]!
  assert.equal(none.typography.applied, false)
  assert.equal(none.typography.slots.headline.family_source, 'renderer_default')
  assert.equal(none.typography.slots.headline.size_source, 'renderer_default')
  assert.ok(!none.sources.some((source) => source.source_id === 'brand.type.scale'))

  // A stack with no generic family gets `sans-serif` appended, and says so.
  const noGeneric = run(withScale('display: Vazirmatn, Tahoma @ 40px; body: Vazirmatn, Tahoma @ 18px')).manifests[0]!
  assert.deepEqual(noGeneric.typography.slots.headline.family_stack, ['Vazirmatn', 'Tahoma', 'sans-serif'])
  assert.equal(noGeneric.typography.slots.headline.appended_generic, true)
})

test('an approved headline size that does not fit is reduced and reported as warn, never hidden', () => {
  const huge = run(withScale('display: Vazirmatn, sans-serif @ 120px/1.1; body: Vazirmatn, sans-serif @ 18px'))
  const reduced = huge.manifests.filter((manifest) => manifest.typography.headline.reduced_to_fit)
  assert.ok(reduced.length > 0)
  for (const manifest of reduced) {
    assert.ok(manifest.typography.headline.drawn_px < 240)
    assert.equal(manifest.checks.find((entry) => entry.check_id === 'post.headline_fit')!.result, 'warn')
  }
  assert.equal(huge.summary.status, 'drafted', 'a reduced headline is a warning, not a blocker')
})

test('final export is refused without fonts, without an approved scale, or with the wrong family', async () => {
  await assert.rejects(createOutliner([]), refusedAs('invalid_font'))
  const woff = path.join(repo, 'apps/studio/static/fonts/inter-var.woff2')
  if (fs.existsSync(woff)) assert.throws(() => readFontFile(woff), refusedAs('invalid_font'), 'WOFF2 is refused')
  const notFont = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-font-')), 'x.ttf')
  temps.push(path.dirname(notFont))
  fs.writeFileSync(notFont, 'not a font at all')
  assert.throws(() => readFontFile(notFont), refusedAs('invalid_font'))
  if (!persianFont) return
  const outliner = await createOutliner([persianFont])
  assert.throws(() => run(pack, outliner), refusedAs('invalid_font'), 'Vazirmatn is approved; DejaVu Sans is not a substitute')
  const noScale = repack((copy) => {
    for (const item of Object.values(copy.sections).flat()) if (item.key === 'type_rules') item.state = 'missing'
  })
  assert.throws(() => run(noScale, outliner), refusedAs('refused'), 'final needs an approved scale')
  if (latinOnlyFont) {
    const latin = await createOutliner([latinOnlyFont])
    assert.throws(() => run(withScale('display: DejaVu Serif, serif @ 44px; body: DejaVu Serif, serif @ 18px'), latin), (error: unknown) => error instanceof RuntimeError && error.code === 'invalid_font' && /U\+06/.test(error.message), 'missing Persian glyphs')
  }
})

test('final export outlines every text, passes the existing gates, and is deterministic', { skip: noFont }, async () => {
  const outliner = await createOutliner([persianFont!])
  const input = withScale(DEJAVU_SCALE)
  const draft = run(input)
  const final = run(input, outliner)
  const again = run(input, await createOutliner([persianFont!]))
  assert.deepEqual([...again.files.entries()], [...final.files.entries()], 'same pack + same font bytes ⇒ same bytes')
  assert.equal(final.summary.status, 'drafted')
  for (const manifest of final.manifests) {
    assert.equal(validatePost(manifest), true, JSON.stringify(validatePost.errors))
    const svg = final.files.get(manifest.file)!
    assert.doesNotMatch(svg, /<text\b/, 'no live text in a final export')
    assert.deepEqual(drawnCodepoints(svg), [])
    assert.match(svg, /<path /)
    const checked = checkSvg(svg)
    assert.equal(checked.ok, true, JSON.stringify(checked.issues))
    assert.deepEqual(checked.warnings, [], 'the live-text warning is gone')
    assert.deepEqual(svgPublicationIssues(svg), [])
    assert.match(svg, /<desc id="d">/, 'the accessible description survives outlining')
    assert.equal(manifest.export.mode, 'final')
    assert.equal(manifest.export.text, 'outlined')
    assert.equal(manifest.export.outliner?.name, 'resvg-js')
    assert.deepEqual(manifest.export.fonts.map((font) => font.file_name), [path.basename(persianFont!)])
    assert.match(manifest.export.fonts[0]!.sha256, /^[0-9a-f]{64}$/)
    assert.ok(manifest.checks.every((entry) => entry.result !== 'fail'), JSON.stringify(manifest.checks))
    // Draft and final differ only in how text is stored.
    const twin = draft.manifests.find((entry) => entry.post_id === manifest.post_id)!
    assert.match(draft.files.get(twin.file)!, /<text\b/)
    assert.deepEqual(twin.typography, manifest.typography)
  }
})

test('the CLI: drafts by default, --final needs --font-file, and --font-file needs --final', { skip: noFont }, () => {
  const env = { ...process.env }
  delete env[AGENT_TOKEN_ENV]
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-runtime-type-'))
  temps.push(dir)
  const cli = (args: string[]) => spawnSync(NODE, tsxArgs('scripts/runtime.ts', ['social-batch', '--demo', ...args]), { cwd: repo, encoding: 'utf8', env, input: '' })
  const noFile = cli(['--final', '--out', path.join(dir, 'a')])
  assert.equal(noFile.status, 1)
  assert.match(noFile.stderr, /^invalid_font:/)
  assert.equal(cli(['--font-file', persianFont!, '--out', path.join(dir, 'b')]).status, 2)
  const wrongFamily = cli(['--final', '--font-file', persianFont!, '--out', path.join(dir, 'c')])
  assert.equal(wrongFamily.status, 1)
  assert.match(wrongFamily.stderr, /Vazirmatn/)
  assert.ok(!fs.existsSync(path.join(dir, 'c')), 'a refused final export writes nothing')
})

test('a long approved brand name wraps clear of the counter and is reported, never cut', () => {
  const long = 'SYNTHETIC DEMO brand name that is far longer than one footer line can hold, with a note in brackets (illustrative)'
  const result = run(repack((copy) => {
    for (const item of Object.values(copy.sections).flat()) if (item.key === 'brand_name') item.value = long
  }))
  for (const manifest of result.manifests) {
    const svg = result.files.get(manifest.file)!
    const drawn = [...svg.matchAll(/font-weight="700"[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]!).join(' ')
    assert.ok(drawn.includes('(illustrative)'), `${manifest.post_id}: the whole name is drawn`)
    assert.equal(manifest.checks.find((entry) => entry.check_id === 'post.signoff_fit')!.result, 'warn')
  }
  assert.equal(result.summary.status, 'drafted')
  assert.equal(run(pack).manifests[0]!.checks.find((entry) => entry.check_id === 'post.signoff_fit')!.result, 'pass')
})
