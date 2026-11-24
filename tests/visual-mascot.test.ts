import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { applyInit, InterviewEngine, writeStarterWorkspace } from '@brand-os/brand-core'
import {
  buildMascotAtlas,
  frameworkRegistry,
  illustrativeMascotAtlas,
  MASCOT_SHEET_STAGES,
  MASCOT_TEXT,
  mascotAtlasDocument,
  VISUAL_LANGS,
  type MascotAssetCandidate,
  type MascotAtlasBlock,
  type MascotEvolutionBlock,
  type VisualDocument,
} from '@brand-os/brand-core/visual'

/**
 * Visual Blueprint V3.4: the mascot atlas and six-stage evolution sheet draw only approved artwork backed by an
 * approved, previewable, non-example asset. Drafts are never drawn (counted as "in review" internally, not mentioned
 * in public); a file still tagged draft stays out of the public edition; missing stages are placeholders.
 */
process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')

function atlas(doc: VisualDocument): MascotAtlasBlock {
  return doc.blocks.find((block): block is MascotAtlasBlock => block.type === 'mascot_atlas')!
}

function sheet(doc: VisualDocument): MascotEvolutionBlock {
  return doc.blocks.find((block): block is MascotEvolutionBlock => block.type === 'mascot_evolution')!
}

function template(mascot: boolean): InterviewEngine {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-mascot-'))
  writeStarterWorkspace(root)
  applyInit(root, { name: 'Mascot Brand', slug: 'mascot-brand', industry: 'education', language: 'en', languages: ['en', 'fa', 'tr'], mascot, gamification: false, publish: 'public' })
  return new InterviewEngine(root)
}

test('template catalog: every state is a named gap, six placeholder stages, the example frame is never drawn', () => {
  const engine = template(true)
  const placeholder: MascotAssetCandidate = { asset_id: 'asset.mascot.placeholder-frame', name: 'Empty mascot frame', version: '0.1.0', approved: false, published: false, tags: ['mascot', 'example', 'draft'], example: true, preview_key: null, mime: null, width: null, height: null }
  for (const audience of ['internal', 'public'] as const) {
    const doc = buildMascotAtlas(engine, audience, { assets: [placeholder] })
    assert.equal(doc.document_kind, 'mascot_atlas')
    assert.equal(doc.illustrative, false)
    const block = atlas(doc)
    assert.equal(block.module_enabled, true)
    assert.ok(block.entries.length >= 90)
    assert.equal(block.counts.drawn, 0)
    assert.equal(block.data_state, 'missing')
    assert.ok(block.entries.every((entry) => entry.artwork === null && entry.do.length === 0 && entry.usage === null))
    assert.ok(block.entries.every((entry) => entry.gap === (audience === 'public' ? 'not_published' : 'not_drawn')))
    const evo = sheet(doc)
    assert.equal(evo.slots.length, MASCOT_SHEET_STAGES)
    assert.equal(evo.example_configuration, true)
    assert.ok(evo.slots.every((slot) => slot.artwork === null && slot.definition === 'example' && slot.summary === null))
    if (audience === 'public') assert.ok(evo.slots.every((slot) => slot.name === null), 'example stage names stay out of the public edition')
    else assert.equal(evo.slots[0]!.name, 'Egg / emergence')
    assert.equal(doc.framework_refs[0]!.framework_id, 'MASCOT-MODEL-SHEET')
  }
})

test('module off: nothing is read and the sheet is six placeholders', () => {
  const doc = buildMascotAtlas(template(false), 'internal')
  assert.equal(atlas(doc).module_enabled, false)
  assert.equal(atlas(doc).entries.length, 0)
  assert.equal(sheet(doc).recorded, 0)
  assert.ok(sheet(doc).slots.every((slot) => slot.definition === 'not_defined'))
})

test('fixture, internal: approved art drawn with notes, a draft-tagged file is badged, art in review is never drawn', () => {
  const doc = illustrativeMascotAtlas('internal')
  assert.equal(doc.illustrative, true)
  assert.equal(doc.origin, 'illustrative_fixture')
  const entries = new Map(atlas(doc).entries.map((entry) => [entry.name, entry]))
  const joyful = entries.get('Joyful')!
  assert.equal(joyful.artwork?.artwork_id, 'art.joyful', 'front angle first')
  assert.equal(joyful.variants, 1)
  assert.equal(joyful.do.length, 2)
  assert.match(joyful.usage ?? '', /MOCK usage/)
  assert.deepEqual(joyful.artwork?.badges, [])
  assert.deepEqual(entries.get('Curious')!.artwork?.badges, ['draft_tag', 'internal_only'])
  const worried = entries.get('Worried')!
  assert.equal(worried.artwork, null)
  assert.equal(worried.gap, 'in_review')
  assert.deepEqual(worried.do, [], 'notes only travel with drawn artwork')
  assert.equal(entries.get('Sad')!.gap, 'not_drawn')
  assert.deepEqual(atlas(doc).counts, { states: 8, drawn: 3, in_review: 1, awaiting: 5 })
  assert.equal(atlas(doc).data_state, 'partial')
  const slots = sheet(doc).slots
  assert.equal(slots.length, 6)
  assert.equal(slots[0]!.artwork?.artwork_id, 'art.joyful')
  assert.equal(slots[1]!.artwork?.artwork_id, 'art.curious', 'front angle beats an earlier profile view')
  assert.equal(slots[2]!.artwork?.artwork_id, 'art.waving')
  assert.equal(slots[3]!.artwork, null)
  assert.equal(slots[3]!.definition, 'approved')
  assert.match(slots[3]!.summary ?? '', /MOCK summary/)
  assert.equal(slots[4]!.definition, 'draft')
  assert.equal(slots[4]!.summary, null)
})

test('fixture, public: only published, untagged files; drafts and reviews are not mentioned; no badges', () => {
  const doc = illustrativeMascotAtlas('public')
  const entries = new Map(atlas(doc).entries.map((entry) => [entry.name, entry]))
  assert.ok(entries.get('Joyful')!.artwork)
  assert.equal(entries.get('Curious')!.artwork, null, 'a file still tagged draft stays out of public view')
  assert.equal(entries.get('Curious')!.gap, 'not_published')
  assert.equal(entries.get('Worried')!.gap, 'not_published', 'public never says something is in review')
  assert.ok(atlas(doc).entries.every((entry) => !entry.artwork || entry.artwork.badges.length === 0))
  assert.equal(atlas(doc).counts.in_review, 0)
  const slots = sheet(doc).slots
  assert.equal(slots[1]!.artwork?.artwork_id, 'art.joyful-side', 'the draft-tagged front view is replaced by the published profile')
  assert.equal(slots[4]!.name, null, 'a draft stage name is not published')
  assert.equal(slots[0]!.name, 'MOCK Seed')
})

test('empty fixture: nothing drawn anywhere', () => {
  const doc = illustrativeMascotAtlas('internal', 'empty')
  assert.equal(atlas(doc).counts.drawn, 0)
  assert.ok(sheet(doc).slots.every((slot) => slot.artwork === null))
})

test('gate: example assets, unapproved rows, unapproved assets and unpreviewable files are never drawn', () => {
  const asset = (id: string, extra: Partial<MascotAssetCandidate> = {}): MascotAssetCandidate => ({ asset_id: id, name: id, version: '1', approved: true, published: true, tags: [], example: false, preview_key: 'k'.repeat(64), mime: 'image/png', width: 1, height: 1, ...extra })
  const row = (id: string, status: string, assetId: string, artStatus = 'approved') => ({ id, name: id, category: 'emotion', status, artwork: [{ id: `a.${id}`, stage: 'any', asset_id: assetId, status: artStatus, version: '1' }] })
  const doc = mascotAtlasDocument({
    brand_id: 'b',
    brand_name: 'B',
    audience: 'internal',
    illustrative: false,
    enabled: true,
    states: [row('ex', 'approved', 'x'), row('rowdraft', 'reviewed', 'ok'), row('assetdraft', 'approved', 'draft'), row('nopreview', 'approved', 'np'), row('gone', 'deprecated', 'ok'), row('pending', 'pending', 'ok', 'pending'), 'junk', row('ok', 'approved', 'ok')],
    stages: [{ id: 's1', order: 2, name: 'Two', status: 'approved' }, { id: 's0', order: 1, name: 'One', status: 'approved' }, { name: 'no id' }],
    assets: [asset('x', { example: true }), asset('ok'), asset('draft', { approved: false }), asset('np', { preview_key: null })],
  })
  const gaps = Object.fromEntries(atlas(doc).entries.map((entry) => [entry.name, entry.gap]))
  assert.deepEqual(gaps, { ex: 'example_only', rowdraft: 'in_review', assetdraft: 'in_review', nopreview: 'not_previewable', pending: 'not_drawn', ok: null })
  assert.deepEqual(sheet(doc).slots.map((slot) => slot.name), ['One', 'Two', null, null, null, null], 'ordered by order, padded to six')
})

test('framework registry accepts the model sheet entry', () => {
  const ref = frameworkRegistry().get('MASCOT-MODEL-SHEET')
  assert.equal(ref?.permitted_claim, 'original_professional_template')
  assert.equal(ref?.authority, 'Brand OS')
})

test('mascot text: en/fa/tr have the same keys, no empty strings and the same list lengths', () => {
  const shape = (value: unknown): unknown => (Array.isArray(value) ? value.length : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)])) : typeof value)
  for (const lang of VISUAL_LANGS) {
    assert.deepEqual(shape(MASCOT_TEXT[lang]), shape(MASCOT_TEXT.en), lang)
    assert.doesNotMatch(JSON.stringify(MASCOT_TEXT[lang]), /(:|\[|,)""/, `${lang} has an empty string`)
  }
  assert.match(MASCOT_TEXT.fa.title, /[؀-ۿ]/)
  assert.notEqual(MASCOT_TEXT.tr.title, MASCOT_TEXT.en.title)
})
