import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { applyInit, ensureApprovalSecret, InterviewEngine, writeStarterWorkspace } from '@brand-os/brand-core'
import { buildNamedDocument } from '@brand-os/brand-core'
import { readSharedLandscape } from '@brand-os/brand-core/competitive'
import {
  buildBusinessModelCanvas,
  buildBook,
  buildCompetitorComparison,
  composeBook,
  buildMascotAtlas,
  buildPublishingGallery,
  buildVisualIdentity,
  coverageCells,
  EXPORT_PROFILES,
  illustrativeMascotAtlas,
  publishingExportCommand,
  PUBLISHING_DOCUMENT_TYPES,
  questionClassifier,
  redactBook,
  redactDocumentModel,
  redactVisualDocument,
  type ExportProfile,
  type LogoConstructionBlock,
  type LogoMasterCandidate,
  type MascotAtlasBlock,
  type VisualDocument,
  type VisualEntry,
} from '@brand-os/brand-core/visual'

/**
 * Visual V4.1: audience redaction per export profile. Public and investor never receive a restricted value, a finance
 * figure, a value that cites a `.private` source, a draft, or a draft mark; the internal profile is unchanged. The
 * Publishing gallery measures readiness on the redacted output and carries counts only. SYNTHETIC DATA ONLY.
 */
process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')

function brand(): { root: string; engine: InterviewEngine; proof: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-publishing-'))
  writeStarterWorkspace(root)
  applyInit(root, { name: 'Publishing Brand', slug: 'publishing-brand', industry: 'education', language: 'en', languages: ['en', 'fa', 'tr'], mascot: true, gamification: false, publish: 'public' })
  return { root, engine: new InterviewEngine(root), proof: ensureApprovalSecret(root) }
}

function approve(engine: InterviewEngine, proof: string, answers: Record<string, string>): void {
  for (const [id, value] of Object.entries(answers)) assert.equal(engine.answerQuestion(id, value).kind, 'recorded', id)
  const result = engine.approvals().approveBatch({ ids: Object.keys(answers) }, proof)
  assert.equal(result.approved, Object.keys(answers).length, JSON.stringify(result.results))
}

const SECRET = {
  restricted: 'SENTINEL-RESTRICTED-41200-EUR',
  finance: 'SENTINEL-FINANCE-UNIT-ECONOMICS',
  privateSource: 'SENTINEL-PRIVATE-SOURCED-VALUE',
  draft: 'SENTINEL-OWNER-DRAFT',
  unknown: 'SENTINEL-NOT-IN-BANK',
}

function entry(id: string, value: string, state: VisualEntry['state'] = 'approved', sources: string[] = [id]): VisualEntry {
  return { id, label: id, state, value, sources, version: 1, approved_at: '2026-11-01', review_due: null, note: null, missing_reason: null }
}

/**
 * A canvas the way a buggy builder could hand it over: every forbidden kind of value is present. Redaction must remove
 * them all, whatever the builder did.
 */
function leakyCanvas(base: VisualDocument): VisualDocument {
  const doc = structuredClone(base)
  const canvas = doc.blocks.find((block) => block.type === 'business_model_canvas')!
  if (canvas.type !== 'business_model_canvas') throw new Error('no canvas')
  canvas.zones[0]!.entries.push(
    entry('business.finance.revenue_figure', SECRET.restricted),
    entry('business.finance.economics_note', SECRET.finance),
    entry('brand.strategy.purpose', SECRET.privateSource, 'approved', ['brand.strategy.purpose', 'brand/.private/strategy/records/r1.json']),
    entry('brand.strategy.vision', SECRET.draft, 'assumption'),
    entry('made.up.question', SECRET.unknown),
  )
  return doc
}

test('public and investor never receive restricted, finance, .private-sourced, draft or unknown values; internal keeps owner data', () => {
  const { engine, proof } = brand()
  approve(engine, proof, { 'business.offer.value_proposition': 'Calm lessons for busy parents' })
  const classify = questionClassifier(engine)
  const editions = { public: leakyCanvas(buildBusinessModelCanvas(engine, 'public')), internal: leakyCanvas(buildBusinessModelCanvas(engine, 'internal')) }
  for (const profile of ['public', 'investor'] as const) {
    const source = profile === 'public' ? editions.public : editions.internal
    const result = redactVisualDocument(source, profile, classify)
    assert.ok(result, profile)
    const text = JSON.stringify(result.document)
    for (const [kind, value] of Object.entries(SECRET)) assert.equal(text.includes(value), false, `${profile}: ${kind} leaked`)
    assert.equal(text.includes('.private'), false, `${profile}: a .private source is still cited`)
    assert.equal(result.redacted, 5, `${profile}: five values removed`)
    assert.ok(text.includes('Calm lessons for busy parents') || profile === 'public', `${profile}: approved values stay`)
    assert.ok(result.document.status_summary.withheld >= 5)
  }
  const internal = redactVisualDocument(editions.internal, 'internal', classify)!
  const text = JSON.stringify(internal.document)
  // Restricted is never shown, not even to the owner's internal profile; everything else stays as Studio shows it.
  assert.equal(text.includes(SECRET.restricted), false)
  for (const value of [SECRET.finance, SECRET.privateSource, SECRET.draft, SECRET.unknown]) assert.ok(text.includes(value), value)
  assert.equal(internal.redacted, 1)
})

test('a public profile refuses an internal edition, and profiles refuse document types they do not permit', () => {
  const { engine } = brand()
  const classify = questionClassifier(engine)
  assert.equal(redactVisualDocument(buildBusinessModelCanvas(engine, 'internal'), 'public', classify), null)
  const plan = buildNamedDocument(engine, 'business-plan', 'public')
  assert.equal(redactDocumentModel(plan, 'public', classify), null, 'business plan is never public')
  const comparison = { ...buildBusinessModelCanvas(engine, 'internal'), document_kind: 'competitor_comparison' as const }
  assert.equal(redactVisualDocument(comparison, 'investor', classify), null, 'competitor analysis is internal only')
  assert.equal(redactVisualDocument({ ...comparison, audience: 'public' }, 'public', classify), null)
  assert.ok(redactVisualDocument(comparison, 'internal', classify))
})

test('the public builders are a fixed point of public redaction: nothing they emit needed removing', () => {
  const { engine, proof } = brand()
  approve(engine, proof, { 'business.offer.value_proposition': 'Calm lessons', 'business.identity.trade_name': 'Calm Trade Name', 'brand.color.roles': 'primary: #0B6E4F\nbackground: #FFFFFF' })
  assert.equal(engine.publishFact('business.identity.trade_name', proof).kind, 'recorded')
  engine.answerQuestion('brand.strategy.vision', 'A draft vision')
  const classify = questionClassifier(engine)
  for (const doc of [buildBusinessModelCanvas(engine, 'public'), buildVisualIdentity(engine, 'public'), buildMascotAtlas(engine, 'public')]) {
    const result = redactVisualDocument(doc, 'public', classify)!
    assert.equal(result.redacted, 0, doc.document_kind)
    assert.deepEqual(result.document, doc, doc.document_kind)
  }
  const book = redactDocumentModel(buildNamedDocument(engine, 'brand-book', 'public'), 'public', classify)!
  assert.equal(book.redacted, 0)
  assert.ok(JSON.stringify(book.document).includes('Calm Trade Name'), 'a published fact stays public')
})

test('investor business plan: approved finance values are withheld, the internal profile keeps them', () => {
  const { engine, proof } = brand()
  approve(engine, proof, { 'business.finance.currency': SECRET.finance, 'business.finance.costs': SECRET.restricted, 'business.model.revenue': 'Monthly family subscription' })
  engine.answerQuestion('business.sales.motion', SECRET.draft)
  const classify = questionClassifier(engine)
  const internalPlan = buildNamedDocument(engine, 'business-plan', 'internal')
  assert.ok(JSON.stringify(internalPlan).includes(SECRET.finance), 'fixture: the internal plan has the finance note')
  assert.equal(JSON.stringify(internalPlan).includes(SECRET.restricted), false, 'restricted is withheld by the builder already')
  const investor = redactDocumentModel(internalPlan, 'investor', classify)!
  const text = JSON.stringify(investor.document)
  assert.equal(text.includes(SECRET.finance), false)
  assert.equal(text.includes(SECRET.restricted), false)
  assert.equal(text.includes(SECRET.draft), false)
  assert.ok(text.includes('Monthly family subscription'))
  assert.ok(investor.redacted >= 2)
  const internal = redactDocumentModel(internalPlan, 'internal', classify)!
  assert.ok(JSON.stringify(internal.document).includes(SECRET.finance))
})

const MASTER: LogoMasterCandidate = { asset_id: 'asset.logo.wordmark', name: 'Wordmark', version: '1.0.0', approved: true, published: false, tags: ['logo', 'master', 'draft'], example: false, preview_key: 'b'.repeat(64), mime: 'image/svg+xml', width: 640, height: 160 }

test('draft marks never leave the owner: a draft-tagged master is not drawn for investors, badges are stripped', () => {
  const { engine, proof } = brand()
  approve(engine, proof, { 'brand.logo.min_size': 'min-size: 80px; clear-space: 0.4x' })
  const classify = questionClassifier(engine)
  const internal = buildVisualIdentity(engine, 'internal', { masters: [MASTER] })
  const logo = (doc: VisualDocument) => doc.blocks.find((b): b is LogoConstructionBlock => b.type === 'logo_construction')!
  assert.deepEqual(logo(internal).master?.badges, ['draft_tag', 'internal_only'], 'fixture: owner sees the draft tag')
  assert.deepEqual(logo(redactVisualDocument(internal, 'internal', classify)!.document).master?.badges, ['draft_tag', 'internal_only'])
  const investor = redactVisualDocument(internal, 'investor', classify)!.document
  assert.equal(logo(investor).master, null)
  assert.equal(logo(investor).master_state, 'missing')
  const clean = buildVisualIdentity(engine, 'internal', { masters: [{ ...MASTER, tags: ['logo', 'master'] }] })
  assert.deepEqual(logo(redactVisualDocument(clean, 'investor', classify)!.document).master?.badges, [], 'approved, untagged: drawn without badges')
  assert.equal(JSON.stringify(investor).includes('draft_tag'), false)
})

test('investor follows public for a published logo that still carries a draft tag: drawn, with no mark (owner decision 2026-11-24)', () => {
  const { engine, proof } = brand()
  approve(engine, proof, { 'brand.logo.min_size': 'min-size: 80px; clear-space: 0.4x' })
  const classify = questionClassifier(engine)
  const logo = (doc: VisualDocument) => doc.blocks.find((b): b is LogoConstructionBlock => b.type === 'logo_construction')!
  const published = { ...MASTER, published: true }
  const internal = buildVisualIdentity(engine, 'internal', { masters: [published] })
  assert.deepEqual(logo(internal).master?.badges, ['draft_tag'], 'fixture: the owner sees the draft tag on a published master')
  const pub = redactVisualDocument(buildVisualIdentity(engine, 'public', { masters: [published] }), 'public', classify)!.document
  assert.equal(logo(pub).master?.asset_id, published.asset_id, 'public draws the published, draft-tagged master')
  const investor = redactVisualDocument(internal, 'investor', classify)!.document
  assert.equal(logo(investor).master?.asset_id, published.asset_id, 'investor draws it too, same as public')
  assert.equal(logo(investor).master_state, logo(pub).master_state)
  assert.deepEqual(logo(investor).master?.badges, [], 'without any draft mark')
  assert.equal(JSON.stringify(investor).includes('draft_tag'), false)
  assert.deepEqual(logo(redactVisualDocument(internal, 'internal', classify)!.document).master?.badges, ['draft_tag'], 'the owner keeps the tag')
})

test('mascot atlas: draft-tagged artwork and in-review slots are not drawn for investors', () => {
  const { engine } = brand()
  const classify = questionClassifier(engine)
  const doc = illustrativeMascotAtlas('internal')
  const atlas = doc.blocks.find((b): b is MascotAtlasBlock => b.type === 'mascot_atlas')!
  const drawn = atlas.entries.find((item) => item.artwork)
  assert.ok(drawn, 'fixture has drawn artwork')
  drawn.artwork!.badges = ['draft_tag']
  const investor = redactVisualDocument(doc, 'investor', classify)!.document
  const out = investor.blocks.find((b): b is MascotAtlasBlock => b.type === 'mascot_atlas')!
  assert.equal(out.entries.find((item) => item.state_id === drawn.state_id)?.artwork, null)
  assert.equal(out.entries.some((item) => item.gap === 'in_review'), false)
  assert.equal(JSON.stringify(investor).includes('draft_tag'), false)
  assert.equal(out.counts.in_review, 0)
})

test('the gallery lists every document type × profile, blocks what a profile may not receive, and carries no values', () => {
  const { engine, proof } = brand()
  approve(engine, proof, { 'business.offer.value_proposition': 'Calm lessons for busy parents', 'business.finance.currency': SECRET.finance })
  engine.answerQuestion('brand.strategy.vision', SECRET.draft)
  const gallery = buildPublishingGallery(engine, {
    bmc: { applies: true, internal: leakyCanvas(buildBusinessModelCanvas(engine, 'internal')), public: buildBusinessModelCanvas(engine, 'public') },
    identity: { internal: buildVisualIdentity(engine, 'internal'), public: buildVisualIdentity(engine, 'public') },
    mascot: { internal: buildMascotAtlas(engine, 'internal'), public: buildMascotAtlas(engine, 'public') },
    competitors: buildCompetitorComparison(engine, readSharedLandscape(engine.workspaceRoot(), 'publishing-brand')),
  })
  assert.equal(gallery.cells.length, PUBLISHING_DOCUMENT_TYPES.length * EXPORT_PROFILES.length)
  const cell = (type: string, profile: ExportProfile) => gallery.cells.find((item) => item.document_type === type && item.profile === profile)!
  assert.equal(cell('competitor_comparison', 'public').readiness, 'blocked')
  assert.equal(cell('competitor_comparison', 'investor').readiness, 'blocked')
  assert.equal(cell('business_plan', 'public').readiness, 'blocked')
  assert.equal(cell('competitor_comparison', 'internal').readiness, 'empty', 'not shared: a designed empty state, not invented rows')
  assert.equal(cell('business_model_canvas', 'public').export, 'print')
  assert.equal(cell('business_model_canvas', 'investor').export, 'planned')
  // The full Brand Book exports with a local command (V4.2) in public and internal; there is no investor edition.
  assert.equal(cell('brand_book', 'internal').export, 'command')
  assert.equal(cell('brand_book', 'public').export, 'command')
  assert.equal(cell('brand_book', 'investor').export, 'planned')
  assert.equal(publishingExportCommand('brand_book', 'public'), 'npm run brand:export-visual -- --doc brand-book --edition public')
  assert.equal(publishingExportCommand('brand_book', 'internal'), 'npm run brand:export-visual -- --doc brand-book --edition internal')
  assert.equal(publishingExportCommand('brand_book', 'investor'), null)
  // The Business Report stays internal only (owner decision 2026-11-24): no public or investor command.
  assert.equal(publishingExportCommand('business_plan', 'public'), null)
  assert.equal(publishingExportCommand('business_plan', 'investor'), null)
  assert.ok(cell('business_model_canvas', 'investor').redacted >= 4, 'investor counts what it removed')
  assert.ok(cell('business_plan', 'investor').redacted >= 1)
  assert.ok(['partial', 'ready'].includes(cell('business_model_canvas', 'internal').readiness))
  const text = JSON.stringify(gallery)
  for (const value of Object.values(SECRET)) assert.equal(text.includes(value), false, 'the gallery carries counts, never values')
  assert.equal(text.includes('Calm lessons'), false)
})

test('coverage cells: nine canvas zones in canonical order, prose sections by status, never a value', () => {
  const { engine } = brand()
  const cells = coverageCells(buildBusinessModelCanvas(engine, 'internal'))
  assert.equal(cells.length, 9)
  assert.equal(cells[0]!.id, 'key_partners')
  const book = coverageCells(buildNamedDocument(engine, 'brand-book', 'internal'))
  assert.ok(book.length > 0)
  assert.ok(book.every((item) => ['complete', 'partial', 'missing'].includes(item.state)))
})

test('full books: the public Brand Book passes the public profile (finance, .private); the Business Report is never public', () => {
  const { engine, proof } = brand()
  const classify = questionClassifier(engine)
  // A public book the way a buggy builder could hand it over: approved, but finance, .private-sourced and unknown values.
  const leaky = (audience: 'public' | 'internal') =>
    composeBook({
      kind: 'brand_book',
      audience,
      brand_id: 'publishing-brand',
      brand_name: 'Publishing Brand',
      illustrative: false,
      sections: {
        overview: [entry('business.finance.economics_note', SECRET.finance)],
        strategy: [entry('brand.strategy.purpose', SECRET.privateSource, 'approved', ['brand.strategy.purpose', 'brand/.private/strategy/records/r1.json']), entry('brand.strategy.vision', 'Calm lessons for every family')],
        verbal: [entry('made.up.question', SECRET.unknown)],
      },
    })
  const pub = redactBook(leaky('public'), 'public', classify)!
  const text = JSON.stringify(pub.document)
  for (const value of [SECRET.finance, SECRET.privateSource, SECRET.unknown]) assert.equal(text.includes(value), false, value)
  assert.equal(text.includes('.private'), false, 'no .private source is cited')
  assert.ok(text.includes('Calm lessons for every family'), 'an approved, permitted value stays')
  assert.equal(pub.redacted, 3)
  const states = pub.document.chapters.flatMap((chapter) => (chapter.kind === 'facts' || chapter.kind === 'plate' ? chapter.entries : chapter.kind === 'unavailable' ? chapter.awaiting : []))
  assert.ok(!states.some((item) => item.state === 'withheld'), 'the public edition shows no withheld mark')
  const overview = pub.document.chapters.find((chapter) => chapter.chapter_id === 'overview')!
  assert.equal(overview.kind, 'unavailable', 'a chapter left without a value becomes a designed gap')
  if (overview.kind === 'unavailable') assert.deepEqual(overview.awaiting, [], 'public never lists what is awaited')
  assert.equal(redactBook(leaky('internal'), 'public', classify), null, 'a public profile refuses an internal book')
  assert.ok(JSON.stringify(redactBook(leaky('internal'), 'internal', classify)!.document).includes(SECRET.finance), 'the internal profile keeps owner data')
  // The Business Report is the business plan as a book: never public, investor and internal may receive it.
  assert.equal(redactBook(buildBook(engine, 'business_report', 'public'), 'public', classify), null)
  assert.ok(redactBook(buildBook(engine, 'business_report', 'internal'), 'investor', classify))
  // The real builder is a fixed point of public redaction.
  approve(engine, proof, { 'business.identity.trade_name': 'Calm Trade Name' })
  assert.equal(engine.publishFact('business.identity.trade_name', proof).kind, 'recorded')
  const real = buildBook(engine, 'brand_book', 'public')
  const fixed = redactBook(real, 'public', classify)!
  assert.equal(fixed.redacted, 0)
  assert.deepEqual(fixed.document, real)
})
