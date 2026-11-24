import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { parse, stringify } from 'yaml'
import { applyInit, checkLogoMastersInRepo, checkLogoMastersReference, ensureApprovalSecret, InterviewEngine, validateRepo, writeStarterWorkspace } from '@brand-os/brand-core'
import { logoChapterStatus, logoVariantRole, pickMaster, visualCatalog, VISUAL_LANGS, type LogoConstructionBlock, type LogoMasterCandidate, type VisualDocument } from '@brand-os/brand-core/visual'
import { buildProjection } from '../apps/studio/src/projection.js'
import { logoConstructionView } from '../apps/studio/src/views/visual-identity.js'

/**
 * BOS-16: a light/dark wordmark pair plus an icon is one logo system; a `brand.logo.masters` answer that names files
 * only by their bare names gets a warning with the matching ids; an ambiguous master explains itself and its fix in
 * en/fa/tr; and the Brand Book's logo chapter is never "complete" without a drawn master.
 *
 * The fixture mirrors the shape of a real brand (two approved wordmarks for light and dark backgrounds, an approved
 * PNG icon, the template examples still present) with synthetic names and bytes only.
 */
process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')

const SLUG = 'lumen-studio'
const DARK = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100"><rect width="400" height="100" fill="#111111"/></svg>\n')
const LIGHT = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100"><rect width="400" height="100" fill="#FAFAFA"/></svg>\n')
/** A 1x1 transparent PNG stands in for the icon. */
const ICON = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const FILE_NAMES_ONLY = 'brand/assets/logo/ in this repository (lumen-wordmark-black.svg and lumen-wordmark-white.svg). No Figma file.'

const sha = (data: Buffer) => crypto.createHash('sha256').update(data).digest('hex')

function workspace(): { root: string; engine: InterviewEngine } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-logo-system-'))
  writeStarterWorkspace(root)
  applyInit(root, { name: 'Lumen Studio', slug: SLUG, industry: 'design', language: 'en', languages: ['en', 'fa', 'tr'], mascot: false, gamification: false, publish: 'private' })
  return { root, engine: new InterviewEngine(root) }
}

function approve(engine: InterviewEngine, root: string, answers: Record<string, string>): void {
  for (const [id, value] of Object.entries(answers)) assert.equal(engine.answerQuestion(id, value).kind, 'recorded', id)
  const result = engine.approvals().approveBatch({ ids: Object.keys(answers) }, ensureApprovalSecret(root))
  assert.equal(result.approved, Object.keys(answers).length, JSON.stringify(result.results))
}

/** Two approved wordmarks (dark ink, light ink) and an approved icon, tagged the way a hand-written manifest was. */
function addLogoSystem(root: string, extra: Array<Record<string, unknown>> = []): void {
  const files: Array<[string, Buffer]> = [
    ['brand/assets/logo/lumen-wordmark-black.svg', DARK],
    ['brand/assets/logo/lumen-wordmark-white.svg', LIGHT],
    ['brand/assets/icons/lumen-key.png', ICON],
  ]
  for (const [file, data] of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), data)
  }
  const record = (id: string, name: string, file: string, data: Buffer, mime: string, tags: string[]) => ({
    id,
    name,
    status: 'approved',
    version: '1.0.0',
    visibility: 'public',
    license: 'Owner-created; all rights reserved.',
    path: file,
    present: true,
    checksum_sha256: sha(data),
    mime,
    preview: file,
    tags,
    approved_by: 'owner',
    approved_at: '2026-11-24T00:00:00.000Z',
    approved_sha256: sha(data),
  })
  const manifestFile = path.join(root, 'brand/assets/asset-manifest.yaml')
  const manifest = parse(fs.readFileSync(manifestFile, 'utf8')) as { assets: Array<Record<string, unknown>> }
  manifest.assets.push(
    record('asset.logo.wordmark-dark', 'Lumen wordmark (dark, for light backgrounds)', files[0]![0], DARK, 'image/svg+xml', ['logo', 'wordmark', 'draft']),
    record('asset.logo.wordmark-light', 'Lumen wordmark (light, for dark backgrounds)', files[1]![0], LIGHT, 'image/svg+xml', ['logo', 'wordmark', 'draft']),
    record('asset.icon.key', 'Lumen key icon', files[2]![0], ICON, 'image/png', ['icon', 'draft']),
    ...extra,
  )
  fs.writeFileSync(manifestFile, stringify(manifest))
}

const logoBlock = (doc: VisualDocument | undefined) => doc?.blocks.find((block): block is LogoConstructionBlock => block.type === 'logo_construction')

function candidate(id: string, file: string, tags: string[], extra: Partial<LogoMasterCandidate> = {}): LogoMasterCandidate {
  return { asset_id: id, name: id, version: '1.0.0', approved: true, published: false, tags, example: false, paths: [file], preview_key: sha(Buffer.from(id)), mime: file.endsWith('.png') ? 'image/png' : 'image/svg+xml', width: 400, height: 100, ...extra }
}

const PAIR = [
  candidate('asset.logo.wordmark-dark', 'brand/assets/logo/lumen-wordmark-black.svg', ['logo', 'wordmark', 'draft']),
  candidate('asset.logo.wordmark-light', 'brand/assets/logo/lumen-wordmark-white.svg', ['logo', 'wordmark', 'draft']),
  candidate('asset.icon.key', 'brand/assets/icons/lumen-key.png', ['icon', 'draft']),
  candidate('asset.logo.example-wordmark', 'brand/assets/logo/example-wordmark.svg', ['logo', 'example', 'draft'], { example: true, approved: false }),
]

test('variant roles: a tag wins; else the documented file-name convention; else none', () => {
  assert.deepEqual(logoVariantRole({ asset_id: 'asset.logo.a', tags: ['logo', 'on-dark'], paths: ['brand/assets/logo/a-black.svg'] }), { role: 'on_dark', by: 'tag' })
  assert.deepEqual(logoVariantRole({ asset_id: 'asset.logo.wordmark-dark', tags: ['logo'], paths: [] }), { role: 'on_light', by: 'file_name' })
  assert.deepEqual(logoVariantRole({ asset_id: 'asset.logo.mark', tags: ['logo'], paths: ['brand/assets/logo/mark-white.svg'] }), { role: 'on_dark', by: 'file_name' })
  assert.deepEqual(logoVariantRole({ asset_id: 'asset.icon.key', tags: ['icon'], paths: [] }), { role: 'icon', by: 'tag' })
  assert.equal(logoVariantRole({ asset_id: 'asset.logo.primary', tags: ['logo'], paths: ['brand/assets/logo/primary.svg'] }), null)
  assert.equal(logoVariantRole({ asset_id: 'asset.logo.dark-on-light', tags: ['logo'], paths: [] }), null, 'both words: no role')
  assert.equal(logoVariantRole({ asset_id: 'asset.photo.dark', tags: ['photo'], paths: [] }), null, 'only logo files take a role from their name')
})

test('a light/dark pair plus an icon resolves as one logo system, with or without a masters answer', () => {
  const pair = pickMaster(PAIR, 'internal')
  assert.equal(pair.state, 'approved')
  assert.equal(pair.master?.asset_id, 'asset.logo.wordmark-dark')
  assert.equal(pair.master?.resolved_by, 'pair')
  assert.equal(pair.system?.on_light?.asset_id, 'asset.logo.wordmark-dark')
  assert.equal(pair.system?.on_dark?.asset_id, 'asset.logo.wordmark-light')
  assert.equal(pair.system?.icon?.asset_id, 'asset.icon.key')
  assert.deepEqual(pair.system?.icon?.badges, ['draft_tag', 'internal_only'], 'approved, not published: said in the internal edition')
  // Bare file names that each name exactly one asset count as a reference; the first named is the master.
  const named = pickMaster(PAIR, 'internal', FILE_NAMES_ONLY)
  assert.equal(named.master?.asset_id, 'asset.logo.wordmark-dark')
  assert.equal(named.master?.resolved_by, 'reference')
  assert.equal(pickMaster(PAIR, 'internal', 'lumen-wordmark-white.svg').master?.asset_id, 'asset.logo.wordmark-light')
  // A file name two assets share names neither.
  const twin = candidate('asset.logo.other', 'brand/assets/other/lumen-wordmark-black.svg', ['logo'])
  assert.equal(pickMaster([...PAIR, twin], 'internal', 'lumen-wordmark-black.svg').state, 'ambiguous')
  // Tags beat the file name: swapping them swaps the plates.
  const swapped = PAIR.map((asset) => (asset.asset_id === 'asset.logo.wordmark-dark' ? { ...asset, tags: ['logo', 'on-dark'] } : asset.asset_id === 'asset.logo.wordmark-light' ? { ...asset, tags: ['logo', 'on-light'] } : asset))
  const bySwap = pickMaster(swapped, 'internal')
  assert.equal(bySwap.system?.on_light?.asset_id, 'asset.logo.wordmark-light')
  assert.equal(bySwap.system?.on_light?.role_by, 'tag')
  // Public: nothing is published, so no master and no system.
  const pub = pickMaster(PAIR, 'public')
  assert.equal(pub.master, null)
  assert.equal(pub.system, null)
  assert.deepEqual(pub.candidates, [])
  const published = pickMaster(PAIR.map((asset) => ({ ...asset, published: true })), 'public')
  assert.equal(published.system?.on_dark?.asset_id, 'asset.logo.wordmark-light')
  assert.deepEqual(published.system?.on_dark?.badges, [])
})

test('three approved logos with no name, tag or pair stay ambiguous and list the candidates (internal only)', () => {
  const third = candidate('asset.logo.symbol', 'brand/assets/logo/symbol.svg', ['logo'])
  const result = pickMaster([...PAIR, third], 'internal')
  assert.equal(result.state, 'ambiguous')
  assert.equal(result.master, null)
  assert.deepEqual(result.candidates, ['asset.logo.symbol', 'asset.logo.wordmark-dark', 'asset.logo.wordmark-light'])
  assert.deepEqual(pickMaster([...PAIR, third], 'public').candidates, [])
})

test('a brand.logo.masters answer of bare file names gets a warning that lists the matching asset ids', () => {
  const rows = [
    { id: 'asset.logo.example-wordmark', path: 'brand/assets/logo/example-wordmark.svg', tags: ['logo', 'example'] },
    { id: 'asset.logo.wordmark-dark', path: 'brand/assets/logo/lumen-wordmark-black.svg', tags: ['logo', 'wordmark'] },
    { id: 'asset.logo.wordmark-light', path: 'brand/assets/logo/lumen-wordmark-white.svg', tags: ['logo', 'wordmark'] },
    { id: 'asset.icon.key', path: 'brand/assets/icons/lumen-key.png', tags: ['icon'] },
  ]
  const check = checkLogoMastersReference(FILE_NAMES_ONLY, rows)
  assert.equal(check.status, 'unmatched')
  assert.deepEqual(check.by_file_name, ['asset.logo.wordmark-dark', 'asset.logo.wordmark-light'])
  assert.deepEqual(check.candidates, ['asset.logo.wordmark-dark', 'asset.logo.wordmark-light'])
  assert.match(check.message!, /names no exact asset id or manifest path/)
  assert.match(check.message!, /asset\.logo\.wordmark-dark, asset\.logo\.wordmark-light/)
  assert.doesNotMatch(check.message!, /example-wordmark/)
  // Exact ids or paths: fine. Nothing that matches: every real logo and icon is offered. No real asset: silent.
  assert.equal(checkLogoMastersReference('asset.logo.wordmark-dark (master), asset.icon.key', rows).status, 'ok')
  assert.equal(checkLogoMastersReference('brand/assets/logo/lumen-wordmark-white.svg', rows).status, 'ok')
  assert.deepEqual(checkLogoMastersReference('In Figma, not exported yet.', rows).candidates, ['asset.logo.wordmark-dark', 'asset.logo.wordmark-light', 'asset.icon.key'])
  assert.equal(checkLogoMastersReference(FILE_NAMES_ONLY, rows.slice(0, 1)).message, null)

  // In a workspace: `validate` repeats the warning for the approved answer.
  const { root, engine } = workspace()
  try {
    addLogoSystem(root)
    approve(engine, root, { 'brand.logo.masters': FILE_NAMES_ONLY })
    assert.deepEqual(checkLogoMastersInRepo(root, FILE_NAMES_ONLY).by_file_name, ['asset.logo.wordmark-dark', 'asset.logo.wordmark-light'])
    fs.cpSync(path.join(process.cwd(), 'schemas'), path.join(root, 'schemas'), { recursive: true })
    const report = validateRepo(root)
    assert.ok(report.warnings.some((warning) => warning.includes('brand.logo.masters names no exact asset id') && warning.includes('asset.logo.wordmark-dark')), report.warnings.join('\n'))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('the internal brand book draws both plates and the icon without editing any fact; public draws nothing unpublished', () => {
  const { root, engine } = workspace()
  try {
    addLogoSystem(root)
    approve(engine, root, { 'brand.logo.min_size': 'min-size: 96px; clear-space: 1x', 'brand.logo.masters': FILE_NAMES_ONLY })
    const { projection } = buildProjection(root, SLUG)
    const internal = logoBlock(projection.visual?.identity?.internal)!
    assert.equal(internal.master_state, 'approved')
    assert.equal(internal.master?.asset_id, 'asset.logo.wordmark-dark')
    assert.equal(internal.system?.on_light?.asset_id, 'asset.logo.wordmark-dark')
    assert.equal(internal.system?.on_dark?.asset_id, 'asset.logo.wordmark-light')
    assert.equal(internal.system?.icon?.asset_id, 'asset.icon.key')
    assert.equal(internal.system?.icon?.preview_key, sha(ICON))
    const book = projection.visual?.books?.brand_book.internal
    assert.ok(book, 'the full book is built')
    const pub = logoBlock(projection.visual?.identity?.public)!
    assert.equal(pub.master, null)
    assert.equal(pub.system, null)

    const lang = 'en'
    const html = String(logoConstructionView(internal, { cat: visualCatalog(lang), lang, mode: 'screen', doc: projection.visual!.identity!.internal, showNext: true, assetUrl: (key) => `/brands/${SLUG}/assets/file/${key}` }))
    assert.match(html, new RegExp(`vz-logo-plate--light" data-role="on_light"><div class="vz-logo-plate-stage"><img class="vz-logo-plate-img" src="/brands/${SLUG}/assets/file/${sha(DARK)}"`))
    assert.match(html, new RegExp(`vz-logo-plate--dark" data-role="on_dark"><div class="vz-logo-plate-stage"><img class="vz-logo-plate-img" src="/brands/${SLUG}/assets/file/${sha(LIGHT)}"`))
    assert.equal((html.match(new RegExp(`src="/brands/${SLUG}/assets/file/${sha(ICON)}"`, 'g')) ?? []).length, 5, 'the icon at three favicon and two avatar sizes')
    assert.match(html, /Internal · not published/, 'approved but unpublished is said')
    assert.match(html, /Placed by its file name/, 'a role from the file name says how to confirm it')
    assert.doesNotMatch(html, /asset\.(logo|icon)\./, 'no asset id on the plate')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('an ambiguous master shows the reason, the candidates and the one-line fix in en, fa and tr', () => {
  const symbol = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>\n')
  const { root, engine } = workspace()
  try {
    fs.mkdirSync(path.join(root, 'brand/assets/logo'), { recursive: true })
    fs.writeFileSync(path.join(root, 'brand/assets/logo/lumen-symbol.svg'), symbol)
    addLogoSystem(root, [{ id: 'asset.logo.symbol', name: 'Lumen symbol', status: 'approved', visibility: 'public', path: 'brand/assets/logo/lumen-symbol.svg', present: true, checksum_sha256: sha(symbol), mime: 'image/svg+xml', preview: 'brand/assets/logo/lumen-symbol.svg', tags: ['logo'] }])
    approve(engine, root, { 'brand.logo.min_size': 'min-size: 96px; clear-space: 1x' })
    const { projection } = buildProjection(root, SLUG)
    const doc = projection.visual!.identity!.internal
    const block = logoBlock(doc)!
    assert.equal(block.master_state, 'ambiguous')
    for (const lang of VISUAL_LANGS) {
      const cat = visualCatalog(lang)
      const html = String(logoConstructionView(block, { cat, lang, mode: 'screen', doc, showNext: true, assetUrl: () => null }))
      assert.ok(html.includes(cat.identity.awaitingMaster.ambiguous), `${lang}: reason`)
      // BOS-21 isolates Latin runs inside Persian text with <bdi>; compare the visible text.
      const text = html.replace(/<\/?bdi[^>]*>/g, '')
      assert.ok(text.includes(cat.identity.stepMasterAmbiguous), `${lang}: fix`)
      assert.match(html, /asset\.logo\.symbol, asset\.logo\.wordmark-dark, asset\.logo\.wordmark-light/, `${lang}: candidates`)
      assert.match(cat.identity.stepMasterAmbiguous, /master/)
      assert.match(cat.identity.stepMasterAmbiguous, /on-light/)
      assert.match(cat.identity.stepMasterAmbiguous, /brand\.logo\.masters/)
      // The public edition (no owner steps) names no ids and no fix.
      const pub = String(logoConstructionView(block, { cat, lang, mode: 'screen', doc: { ...doc, audience: 'public' }, showNext: false, assetUrl: () => null }))
      assert.ok(!pub.includes(cat.identity.stepMasterAmbiguous))
      assert.doesNotMatch(pub, /asset\.logo\./)
    }
    assert.notEqual(visualCatalog('fa').identity.stepMasterAmbiguous, visualCatalog('en').identity.stepMasterAmbiguous)
    assert.notEqual(visualCatalog('tr').identity.stepMasterAmbiguous, visualCatalog('en').identity.stepMasterAmbiguous)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('the Brand Book logo chapter is never complete while the master is missing or ambiguous', () => {
  const withMaster = { blocks: [{ type: 'logo_construction', master: { asset_id: 'x' } }] } as unknown as VisualDocument
  const without = (state: string) => ({ blocks: [{ type: 'logo_construction', master: null, master_state: state }] }) as unknown as VisualDocument
  assert.equal(logoChapterStatus('complete', withMaster), 'complete')
  for (const state of ['missing', 'ambiguous', 'not_previewable', 'example_only']) assert.equal(logoChapterStatus('complete', without(state)), 'partial', state)
  assert.equal(logoChapterStatus('complete', null), 'partial', 'no identity document: not complete')
  assert.equal(logoChapterStatus('missing', without('missing')), 'missing')

  // In the projection: every logo question approved, three approved logos and no name: the chapter is partial.
  const symbol = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>\n')
  const { root, engine } = workspace()
  try {
    fs.mkdirSync(path.join(root, 'brand/assets/logo'), { recursive: true })
    fs.writeFileSync(path.join(root, 'brand/assets/logo/lumen-symbol.svg'), symbol)
    addLogoSystem(root, [{ id: 'asset.logo.symbol', name: 'Lumen symbol', status: 'approved', visibility: 'public', path: 'brand/assets/logo/lumen-symbol.svg', present: true, checksum_sha256: sha(symbol), mime: 'image/svg+xml', preview: 'brand/assets/logo/lumen-symbol.svg', tags: ['logo'] }])
    approve(engine, root, {
      'brand.logo.variants': 'Dark wordmark for light backgrounds, light wordmark for dark backgrounds, key icon.',
      'brand.logo.min_size': 'min-size: 96px; clear-space: 1x',
      'brand.logo.clear_space': 'The height of the O on every side.',
      'brand.logo.misuse': 'Do not stretch or recolor.',
      'brand.logo.masters': 'Kept in this repository; see the asset manifest.',
    })
    const chapter = (root_: string) => buildProjection(root_, SLUG).projection.documents['brand-book']!.sections.find((section) => section.id === 'logo')!
    const ambiguous = chapter(root)
    assert.equal(ambiguous.items.filter((item) => item.tag !== 'recommendation').every((item) => item.tag === 'approved'), true, 'every logo fact is approved')
    assert.equal(ambiguous.status, 'partial', 'ambiguous master: not complete')
    // Naming the master by id (a change the owner approves) resolves it, and the chapter is complete.
    const change = engine.requestChange('brand.logo.masters', 'asset.logo.wordmark-dark (master), asset.logo.wordmark-light, asset.icon.key')
    assert.equal(engine.approveChange(change.id, ensureApprovalSecret(root), change.expected_version).kind, 'recorded')
    assert.equal(chapter(root).status, 'complete')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
