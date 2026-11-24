import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { applyInit, ensureApprovalSecret, InterviewEngine, writeStarterWorkspace } from '@brand-os/brand-core'
import { SHARED_CRITERIA, type SharedLandscape } from '@brand-os/brand-core/competitive'
import {
  buildCompetitorComparison,
  COMPETITOR_TEXT,
  illustrativeCompetitorComparison,
  illustrativeLandscape,
  VISUAL_LANGS,
  type CompetitorMatrixBlock,
  type PriceStripBlock,
  type VisualDocument,
} from '@brand-os/brand-core/visual'

/**
 * Visual V2.2: the competitor comparison matrix and price strip. Competitor rows come only from the shared landscape;
 * the own-brand row only from approved facts; prices are grouped by currency in the shared order, never ranked.
 */
process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')

function brand(): { root: string; engine: InterviewEngine; proof: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-competitors-'))
  writeStarterWorkspace(root)
  applyInit(root, { name: 'Compare Brand', slug: 'compare-brand', industry: 'education', language: 'en', languages: ['en', 'fa', 'tr'], mascot: false, gamification: false, publish: 'public' })
  return { root, engine: new InterviewEngine(root), proof: ensureApprovalSecret(root) }
}

const matrix = (doc: VisualDocument) => doc.blocks.find((b): b is CompetitorMatrixBlock => b.type === 'competitor_matrix')!
const strip = (doc: VisualDocument) => doc.blocks.find((b): b is PriceStripBlock => b.type === 'price_strip')!

function landscapeFor(slug: string): SharedLandscape {
  return { ...illustrativeLandscape(), brand_slug: slug }
}

test('nothing shared: only the own-brand row, a designed empty matrix, no prices, no framework claim', () => {
  const { root, engine } = brand()
  try {
    const doc = buildCompetitorComparison(engine, { state: 'not_shared' })
    assert.equal(doc.document_kind, 'competitor_comparison')
    assert.equal(doc.audience, 'internal')
    assert.equal(doc.illustrative, false)
    assert.deepEqual(doc.framework_refs, [])
    const m = matrix(doc)
    assert.equal(m.share_state, 'not_shared')
    assert.equal(m.data_state, 'missing')
    assert.deepEqual(m.rows.map((r) => r.kind), ['own_brand'])
    assert.deepEqual(m.criteria, [...SHARED_CRITERIA])
    assert.deepEqual(strip(doc).groups, [])
    assert.equal(strip(doc).ranked, false)
    assert.equal(strip(doc).currency_conversion, 'none')
    assert.doesNotMatch(JSON.stringify(doc), /certified|compliant|conformant/i)
    assert.doesNotMatch(JSON.stringify(doc), /\bISO\b/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('own row: drafts are never carried; approved facts are, with approved colour swatches', () => {
  const { root, engine, proof } = brand()
  try {
    assert.equal(engine.answerQuestion('business.offer.summary', 'DRAFT-OFFER-CANARY lessons').kind, 'recorded')
    let doc = buildCompetitorComparison(engine, { state: 'not_shared' })
    const offer = () => matrix(doc).rows[0]!.cells.find((c) => c.criterion === 'offer')!
    assert.equal(offer().state, 'unknown')
    assert.equal(offer().own?.state, 'assumption')
    assert.equal(offer().own?.value, null)
    assert.equal(JSON.stringify(doc).includes('DRAFT-OFFER-CANARY'), false, 'a draft is not in the document at all')

    for (const [id, value] of Object.entries({ 'business.offer.summary': 'Short guided lessons', 'brand.color.roles': 'primary #123A73; onPrimary #FFFFFF' })) assert.equal(engine.answerQuestion(id, value).kind, 'recorded', id)
    const result = engine.approvals().approveBatch({ ids: ['business.offer.summary', 'brand.color.roles'] }, proof)
    assert.equal(result.approved, 2, JSON.stringify(result.results))
    doc = buildCompetitorComparison(engine, { state: 'not_shared' })
    assert.equal(offer().state, 'present')
    assert.deepEqual(offer().labels, ['Short guided lessons'])
    const visual = matrix(doc).rows[0]!.cells.find((c) => c.criterion === 'visual_language')!
    assert.deepEqual(visual.swatches, ['#123A73', '#FFFFFF'])
    assert.deepEqual(visual.labels, ['primary · onPrimary'])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('shared landscape: alphabetical rows after the own brand, deduplicated footnotes, prices in shared order', () => {
  const { root, engine } = brand()
  try {
    const doc = buildCompetitorComparison(engine, { state: 'shared', landscape: landscapeFor('compare-brand') })
    const m = matrix(doc)
    assert.equal(m.share_state, 'shared')
    assert.deepEqual(m.rows.map((r) => r.name), ['Compare Brand', 'Avenra (fictional)', 'Kestrel Learn (fictional)', 'Moraq Studio (fictional)'])
    assert.equal(m.rows[2]!.needs_refresh, true)
    // Footnotes: unique (class, host, date), numbered in reading order, every reference resolves.
    const keys = m.footnotes.map((f) => `${f.source_class}|${f.host}|${f.observed_on}`)
    assert.equal(new Set(keys).size, keys.length)
    assert.deepEqual(m.footnotes.map((f) => f.n), m.footnotes.map((_, i) => i + 1))
    const refs = [...m.rows.flatMap((r) => r.cells.flatMap((c) => c.footnotes)), ...strip(doc).groups.flatMap((g) => g.rows.map((r) => r.footnote))]
    assert.ok(refs.every((n) => n >= 1 && n <= m.footnotes.length))
    // Needs-review cells carry no label and no source.
    const review = m.rows[2]!.cells.find((c) => c.criterion === 'observable_channels')!
    assert.equal(review.state, 'needs_review')
    assert.deepEqual([review.labels, review.footnotes], [[], []])

    const s = strip(doc)
    assert.deepEqual(s.groups.map((g) => g.currency), ['AED', 'TRY', 'USD'])
    const usd = s.groups.find((g) => g.currency === 'USD')!.rows
    assert.deepEqual(usd.map((r) => r.amount), [9.99, 7], 'kept in the shared order (by name and offer), not sorted by amount')
    assert.deepEqual(s.unpriced, ['Moraq Studio (fictional)'])
    assert.equal(s.ranked, false)
    assert.equal(s.currency_conversion, 'none')
    assert.equal(s.data_state, 'partial')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a withheld shared file is reported with its reason and draws nothing', () => {
  const { root, engine } = brand()
  try {
    const doc = buildCompetitorComparison(engine, { state: 'withheld', reason: 'invalid_record' })
    assert.equal(matrix(doc).share_state, 'withheld')
    assert.equal(matrix(doc).withheld_reason, 'invalid_record')
    assert.equal(matrix(doc).rows.length, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('golden fixtures are stamped illustrative, use reserved .example hosts and cover every state', () => {
  const full = illustrativeCompetitorComparison('complete')
  const empty = illustrativeCompetitorComparison('empty')
  for (const doc of [full, empty]) {
    assert.equal(doc.illustrative, true)
    assert.equal(doc.origin, 'illustrative_fixture')
  }
  const hosts = matrix(full).footnotes.map((f) => f.host).filter((h): h is string => h !== null)
  assert.ok(hosts.length > 0 && hosts.every((h) => h.endsWith('.example')))
  const states = new Set(matrix(full).rows.flatMap((r) => r.cells.map((c) => c.state)))
  for (const state of ['present', 'unverified', 'historical', 'conflicting', 'needs_review', 'unknown']) assert.ok(states.has(state as never), state)
  assert.equal(matrix(empty).share_state, 'not_shared')
})

test('competitor catalogs: fa and tr define every key, arrays have the same length', () => {
  const shape = (value: unknown): unknown => (Array.isArray(value) ? value.length : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)])) : typeof value)
  for (const lang of VISUAL_LANGS) {
    assert.deepEqual(shape(COMPETITOR_TEXT[lang]), shape(COMPETITOR_TEXT.en), lang)
    for (const value of Object.values(COMPETITOR_TEXT[lang])) if (typeof value === 'string') assert.ok(value.trim().length > 0)
  }
  assert.equal(COMPETITOR_TEXT.en.title, 'Competitor comparison matrix')
  assert.match(COMPETITOR_TEXT.fa.title, /ماتریس مقایسهٔ رقبا/)
  assert.match(COMPETITOR_TEXT.tr.title, /Rakip karşılaştırma matrisi/)
})
