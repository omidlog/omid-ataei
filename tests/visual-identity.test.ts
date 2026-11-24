import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { applyInit, ensureApprovalSecret, InterviewEngine, writeStarterWorkspace } from '@brand-os/brand-core'
import {
  buildVisualIdentity,
  contrastGrid,
  CONTRAST_GRID_MAX,
  declaredCombinations,
  IDENTITY_TEXT,
  illustrativeVisualIdentity,
  imageSize,
  measurePair,
  pickMaster,
  VISUAL_LANGS,
  type ColorPaletteBlock,
  type LogoConstructionBlock,
  type LogoMasterCandidate,
  type TypographySpecimenBlock,
  type VisualDocument,
} from '@brand-os/brand-core/visual'

/**
 * Visual Blueprint V2.1: the Brand Book "Visual identity" chapter is drawn only from approved facts and the
 * approved master asset; drafts, withheld values and gaps become designed "awaiting" blocks; contrast is computed.
 */
process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')

function brand(): { root: string; engine: InterviewEngine; proof: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-identity-'))
  writeStarterWorkspace(root)
  applyInit(root, { name: 'Identity Brand', slug: 'identity-brand', industry: 'education', language: 'en', languages: ['en', 'fa', 'tr'], mascot: false, gamification: false, publish: 'public' })
  return { root, engine: new InterviewEngine(root), proof: ensureApprovalSecret(root) }
}

function approve(engine: InterviewEngine, proof: string, answers: Record<string, string>): void {
  for (const [id, value] of Object.entries(answers)) assert.equal(engine.answerQuestion(id, value).kind, 'recorded', id)
  const result = engine.approvals().approveBatch({ ids: Object.keys(answers) }, proof)
  assert.equal(result.approved, Object.keys(answers).length, JSON.stringify(result.results))
}

const palette = (doc: VisualDocument) => doc.blocks.find((b): b is ColorPaletteBlock => b.type === 'color_palette')!
const type = (doc: VisualDocument) => doc.blocks.find((b): b is TypographySpecimenBlock => b.type === 'typography_specimen')!
const logo = (doc: VisualDocument) => doc.blocks.find((b): b is LogoConstructionBlock => b.type === 'logo_construction')!

const MASTER: LogoMasterCandidate = { asset_id: 'asset.logo.master', name: 'Master mark', version: '1.0.0', approved: true, published: false, tags: ['logo', 'master'], example: false, preview_key: 'a'.repeat(64), mime: 'image/svg+xml', width: 300, height: 100 }

test('contrast is measured with the WCAG 2 formula; thresholds use the exact ratio, display rounds down', () => {
  const pair = measurePair({ role: 'onPrimary', hex: '#FFFFFF' }, { role: 'primary', hex: '#000000' })
  assert.equal(pair.ratio, 21)
  assert.deepEqual([pair.aa_normal, pair.aa_large, pair.aaa_normal], [true, true, true])
  // #767676 on white is 4.54:1, just above 4.5.
  const grey = measurePair({ role: 'muted', hex: '#767676' }, { role: 'surface', hex: '#FFFFFF' })
  assert.equal(grey.ratio, 4.54)
  assert.equal(grey.aa_normal, true)
  assert.equal(grey.aaa_normal, false)
  const low = measurePair({ role: 'a', hex: '#777777' }, { role: 'b', hex: '#FFFFFF' })
  assert.equal(low.aa_normal, false, '4.47:1 is below 4.5 even though it rounds near it')
  assert.ok(low.ratio <= 4.48)
})

test('combinations come only from role names (onX on X); the grid covers every ordered pair up to the limit', () => {
  const colors = [
    { role: 'primary', hex: '#123A73' },
    { role: 'onPrimary', hex: '#FFFFFF' },
    { role: 'surface', hex: '#F7F5F2' },
    { role: 'accent', hex: '#D5FE00' },
  ]
  const combos = declaredCombinations(colors)
  assert.deepEqual(combos.map((pair) => `${pair.foreground}/${pair.background}`), ['onPrimary/primary'])
  const grid = contrastGrid(colors)!
  assert.equal(grid.ratios.length, 4)
  assert.equal(grid.ratios[0]![0], 1)
  assert.equal(grid.ratios[0]![1], grid.ratios[1]![0], 'contrast is symmetric')
  const many = Array.from({ length: CONTRAST_GRID_MAX + 1 }, (_, i) => ({ role: `c${i}`, hex: '#000000' }))
  assert.equal(contrastGrid(many), null)
})

test('a fresh brand: every plate is awaiting, nothing is drawn, nothing is invented', () => {
  const { root, engine } = brand()
  try {
    for (const audience of ['internal', 'public'] as const) {
      const doc = buildVisualIdentity(engine, audience)
      assert.equal(doc.document_kind, 'visual_identity')
      assert.equal(doc.illustrative, false)
      assert.equal(palette(doc).colors.length, 0)
      assert.equal(palette(doc).data_state, 'missing')
      assert.equal(type(doc).roles.length, 0)
      assert.equal(logo(doc).spec, null)
      assert.equal(logo(doc).master, null)
      assert.equal(logo(doc).master_state, 'missing', 'no masters offered')
      assert.equal(doc.as_of, null)
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('drafts are never drawn and never carried; approved facts and the approved master are', () => {
  const { root, engine, proof } = brand()
  try {
    assert.equal(engine.answerQuestion('brand.color.roles', 'primary #123A73; onPrimary #FFFFFF').kind, 'recorded')
    let doc = buildVisualIdentity(engine, 'internal', { masters: [MASTER] })
    assert.equal(palette(doc).source.state, 'assumption')
    assert.equal(palette(doc).source.value, null, 'the draft value is not in the document at all')
    assert.equal(palette(doc).colors.length, 0)
    assert.equal(JSON.stringify(doc).includes('#123A73'), false)

    approve(engine, proof, {
      'brand.color.roles': 'primary #123A73; onPrimary #FFFFFF; surface #F7F5F2',
      'brand.type.scale': 'body: Inter, system-ui, sans-serif @ 16px/1.5; display: Rajdhani, sans-serif @ 40px',
      'brand.logo.min_size': 'min-size: 24px; clear-space: 0.5x; min-print: 10mm',
    })
    doc = buildVisualIdentity(engine, 'internal', { masters: [MASTER] })
    assert.equal(palette(doc).colors.length, 3)
    assert.deepEqual(palette(doc).colors[0]!.rgb, [18, 58, 115])
    assert.equal(palette(doc).combinations.length, 1)
    assert.ok(palette(doc).combinations[0]!.ratio > 10)
    assert.deepEqual(type(doc).roles.map((role) => [role.role, role.family, role.size_px]), [['body', 'Inter', 16], ['display', 'Rajdhani', 40]])
    assert.deepEqual(type(doc).scripts, ['en', 'fa', 'tr'])
    assert.deepEqual(logo(doc).spec, { min_size_px: 24, clear_space: { value: 0.5, unit: 'x' }, min_print_mm: 10 })
    assert.equal(logo(doc).master?.asset_id, 'asset.logo.master')
    assert.equal(logo(doc).data_state, 'complete')
    assert.ok(doc.as_of)
    // The master must be published for the public edition.
    assert.equal(logo(buildVisualIdentity(engine, 'public', { masters: [MASTER] })).master, null)
    assert.equal(logo(buildVisualIdentity(engine, 'public', { masters: [{ ...MASTER, published: true }] })).master?.asset_id, 'asset.logo.master')
    const refs = doc.framework_refs.map((ref) => ref.permitted_claim)
    assert.ok(!refs.includes('externally_certified'))
    assert.doesNotMatch(JSON.stringify(doc), /certified|compliant|conformant/i)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('master selection: examples, drafts, untagged and unreadable files never become the master', () => {
  assert.equal(pickMaster([{ ...MASTER, example: true }], 'internal').state, 'example_only')
  assert.equal(pickMaster([{ ...MASTER, approved: false }], 'internal').state, 'missing')
  assert.equal(pickMaster([{ ...MASTER, preview_key: null }], 'internal').state, 'not_previewable')
  assert.equal(pickMaster([MASTER], 'internal').state, 'approved')
  assert.equal(pickMaster([MASTER], 'internal').master?.resolved_by, 'tag')
})

// Shaped like pilito-brand: an approved, internal, previewable wordmark tagged [logo, wordmark, draft] (no `master`
// tag), named by id and path in the approved free-text brand.logo.masters answer.
const WORDMARK: LogoMasterCandidate = {
  asset_id: 'asset.logo.pilito-wordmark',
  name: 'Pilito wordmark (owner-supplied)',
  version: '0.1.0',
  approved: true,
  published: false,
  tags: ['logo', 'wordmark', 'draft'],
  example: false,
  preview_key: 'b'.repeat(64),
  mime: 'image/svg+xml',
  width: 640,
  height: 160,
  paths: ['brand/assets/logo/pilito-wordmark.svg', 'brand/assets/logo/pilito-wordmark.svg'],
}
const OTHER: LogoMasterCandidate = { ...WORDMARK, asset_id: 'asset.logo.pilito-symbol', name: 'Pilito symbol', tags: ['logo', 'symbol'], preview_key: 'c'.repeat(64), paths: ['brand/assets/logo/pilito-symbol.svg'] }
const EXAMPLE: LogoMasterCandidate = { ...WORDMARK, asset_id: 'asset.logo.example-wordmark', name: 'EXAMPLE wordmark', tags: ['logo', 'example'], example: true, paths: ['brand/assets/logo/example-wordmark.svg'] }
const PILITO_MASTERS = 'This repository: brand/assets/logo/pilito-wordmark.svg (asset.logo.pilito-wordmark). No Figma master recorded.'

test('master resolution: the asset named in brand.logo.masters, then the master tag, then the only approved logo', () => {
  // a. Named by exact id or exact path, in the free text; first named wins, even over a `master` tag.
  const named = pickMaster([OTHER, WORDMARK, EXAMPLE], 'internal', PILITO_MASTERS)
  assert.equal(named.state, 'approved')
  assert.equal(named.master?.asset_id, 'asset.logo.pilito-wordmark')
  assert.equal(named.master?.resolved_by, 'reference')
  assert.deepEqual(named.master?.badges, ['draft_tag', 'internal_only'], 'internal view says the file is tagged draft and unpublished')
  assert.equal(pickMaster([OTHER, WORDMARK], 'internal', 'Masters: `brand/assets/logo/pilito-wordmark.svg`.').master?.asset_id, 'asset.logo.pilito-wordmark', 'path alone')
  assert.equal(pickMaster([{ ...OTHER, tags: ['logo', 'master'] }, WORDMARK], 'internal', 'asset.logo.pilito-wordmark').master?.asset_id, 'asset.logo.pilito-wordmark')
  assert.equal(pickMaster([WORDMARK, OTHER], 'internal', 'asset.logo.pilito-symbol and asset.logo.pilito-wordmark').master?.asset_id, 'asset.logo.pilito-symbol', 'first named')
  // Token match only: a prefix, a directory or a near miss is not a reference.
  for (const text of ['brand/assets/logo/', 'asset.logo.pilito', 'pilito-wordmark', 'asset.logo.pilito-wordmark-v2', 'xasset.logo.pilito-wordmark']) {
    assert.equal(pickMaster([OTHER, WORDMARK], 'internal', text).state, 'ambiguous', text)
  }
  // b. The `master` tag still works without a reference.
  assert.equal(pickMaster([OTHER, { ...WORDMARK, tags: ['logo', 'master'] }], 'internal').master?.resolved_by, 'tag')
  // c. Exactly one approved previewable logo: used. Several and none named: ambiguous, never a guess.
  const sole = pickMaster([WORDMARK, EXAMPLE], 'internal')
  assert.equal(sole.master?.asset_id, 'asset.logo.pilito-wordmark')
  assert.equal(sole.master?.resolved_by, 'sole_logo')
  const two = pickMaster([WORDMARK, OTHER], 'internal')
  assert.equal(two.master, null)
  assert.equal(two.state, 'ambiguous')
  // A reference to an unknown id is never chosen and does not break the tie.
  const unknown = pickMaster([WORDMARK, OTHER], 'internal', 'asset.logo.does-not-exist brand/assets/logo/nope.svg')
  assert.equal(unknown.master, null)
  assert.equal(unknown.state, 'ambiguous')
})

test('master resolution never picks a draft-status, example, unreadable or (in public) unpublished file', () => {
  const draft = { ...WORDMARK, approved: false, preview_key: null, mime: null }
  assert.equal(pickMaster([draft], 'internal', PILITO_MASTERS).master, null, 'named but draft status')
  assert.equal(pickMaster([draft], 'internal', PILITO_MASTERS).state, 'missing')
  assert.equal(pickMaster([draft, OTHER], 'internal', PILITO_MASTERS).master?.asset_id, 'asset.logo.pilito-symbol', 'the draft is skipped, never drawn')
  const example = pickMaster([{ ...EXAMPLE, approved: true }], 'internal', 'asset.logo.example-wordmark')
  assert.equal(example.master, null, 'an example is never a master, even when named')
  assert.equal(example.state, 'example_only')
  assert.equal(pickMaster([{ ...WORDMARK, preview_key: null }, OTHER], 'internal', PILITO_MASTERS).state, 'not_previewable', 'named but unreadable: no fallback to another logo')
  // Public: Pilito's wordmark is not published, so the public edition has no master.
  assert.equal(pickMaster([WORDMARK], 'public', PILITO_MASTERS).master, null)
  assert.equal(pickMaster([WORDMARK], 'public', PILITO_MASTERS).state, 'missing')
  const published = pickMaster([{ ...WORDMARK, published: true }], 'public', PILITO_MASTERS)
  assert.equal(published.master?.asset_id, 'asset.logo.pilito-wordmark')
  assert.deepEqual(published.master?.badges, [], 'no internal badge in the public edition')
})

test('a pilito-shaped brand: internal draws the named wordmark with the approved rule; public has no master', () => {
  const { root, engine, proof } = brand()
  try {
    approve(engine, proof, {
      'brand.logo.min_size': 'min-size: 80px; clear-space: 0.4x',
      'brand.logo.masters': PILITO_MASTERS,
    })
    const internal = logo(buildVisualIdentity(engine, 'internal', { masters: [WORDMARK, OTHER, EXAMPLE] }))
    assert.deepEqual(internal.spec, { min_size_px: 80, clear_space: { value: 0.4, unit: 'x' }, min_print_mm: null })
    assert.equal(internal.master?.asset_id, 'asset.logo.pilito-wordmark')
    assert.equal(internal.master_state, 'approved')
    assert.equal(internal.data_state, 'complete')
    assert.ok(internal.sources.includes('asset:asset.logo.pilito-wordmark'))
    const pub = logo(buildVisualIdentity(engine, 'public', { masters: [WORDMARK, OTHER, EXAMPLE] }))
    assert.equal(pub.master, null, 'not published: never in the public edition')
    assert.doesNotMatch(JSON.stringify(buildVisualIdentity(engine, 'public', { masters: [WORDMARK] })), /pilito-wordmark/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('an unapproved brand.logo.masters answer names nothing', () => {
  const { root, engine, proof } = brand()
  try {
    approve(engine, proof, { 'brand.logo.min_size': 'min-size: 80px; clear-space: 0.4x' })
    assert.equal(engine.answerQuestion('brand.logo.masters', PILITO_MASTERS).kind, 'recorded')
    const block = logo(buildVisualIdentity(engine, 'internal', { masters: [WORDMARK, OTHER] }))
    assert.equal(block.master, null)
    assert.equal(block.master_state, 'ambiguous')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('image sizes: SVG viewBox and width/height, the PNG header; anything else is unknown', () => {
  assert.deepEqual(imageSize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80"></svg>'), 'image/svg+xml'), { width: 240, height: 80 })
  assert.deepEqual(imageSize(Buffer.from('<svg width="30px" height="10"></svg>'), 'image/svg+xml'), { width: 30, height: 10 })
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
  assert.deepEqual(imageSize(png, 'image/png'), { width: 1, height: 1 })
  assert.equal(imageSize(Buffer.from('nope'), 'image/jpeg'), null)
})

test('golden fixtures are stamped illustrative and cover drawn and awaiting states', () => {
  const complete = illustrativeVisualIdentity('internal', 'complete')
  assert.equal(complete.illustrative, true)
  assert.equal(complete.origin, 'illustrative_fixture')
  assert.ok(palette(complete).colors.length >= 6)
  assert.ok(logo(complete).master)
  const awaiting = illustrativeVisualIdentity('internal', 'awaiting')
  assert.equal(palette(awaiting).source.state, 'assumption')
  assert.equal(palette(awaiting).source.value, null)
  assert.equal(logo(awaiting).master_state, 'example_only')
  assert.equal(palette(illustrativeVisualIdentity('public', 'awaiting')).source.missing_reason, 'not_published')
})

test('identity catalogs: fa and tr define every key; specimen lines are present for every language', () => {
  const keys = (value: object): string[] => Object.entries(value).flatMap(([key, item]) => (item && typeof item === 'object' ? keys(item).map((sub) => `${key}.${sub}`) : [key]))
  const en = keys(IDENTITY_TEXT.en).sort()
  for (const lang of VISUAL_LANGS) {
    assert.deepEqual(keys(IDENTITY_TEXT[lang]).sort(), en, lang)
    for (const [key, value] of Object.entries(IDENTITY_TEXT[lang])) if (typeof value === 'string') assert.ok(value.trim().length > 0, `${lang}.${key}`)
  }
  assert.notEqual(IDENTITY_TEXT.fa.chapterTitle, IDENTITY_TEXT.en.chapterTitle)
  assert.notEqual(IDENTITY_TEXT.tr.chapterTitle, IDENTITY_TEXT.en.chapterTitle)
})
