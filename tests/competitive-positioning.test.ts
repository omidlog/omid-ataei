import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import {
  addCandidate,
  addPosition,
  AXES_RECORD_PATH,
  CompetitiveError,
  placementOf,
  POSITION_BANDS,
  POSITION_STALE_DAYS,
  readAxes,
  readPositions,
  readSharedLandscape,
  removePosition,
  setAxes,
  setStatus,
  SHARED_LANDSCAPE_PATH,
  shareLandscape,
  validateAxes,
  validSharedLandscape,
  type PositionView,
  type SharedLandscape,
} from '@brand-os/brand-core/competitive'
import { unavailableAdapter } from '@brand-os/brand-core/research'
import { NOW, record, source } from './helpers/competitive.js'
import { useTestKey, workspace } from './helpers/knowledge.js'

/**
 * Visual V2.3 / D2: the owner-only positioning axes and evidenced positions, and their projection into the shared
 * landscape. Axes are the owner's choice; positions exist only with a cited source and date; unknown stays unknown;
 * stale and conflicting are flagged, never resolved; nothing private leaves.
 */
useTestKey()

const OFFLINE = unavailableAdapter().capability(NOW)
const RATIONALE_CANARY = 'RATIONALE-CANARY-4410 because our investors said so'
const AXIS_ID_CANARY = 'price_level_canary'

const AXES = {
  x: { axis_id: AXIS_ID_CANARY, label: { en: 'Price level', fa: 'سطح قیمت', tr: 'Fiyat düzeyi' }, low: { en: 'Budget', fa: 'اقتصادی', tr: 'Ekonomik' }, high: { en: 'Premium', fa: 'ممتاز', tr: 'Premium' }, rationale: RATIONALE_CANARY },
  y: { axis_id: 'service_depth', label: { en: 'Service depth' }, low: { en: 'Self-serve' }, high: { en: 'Done for you' } },
}

const ALLOWED: Record<string, string[]> = {
  positioning: ['axes', 'bands', 'stale_after_days', 'own', 'competitors'],
  axes: ['x', 'y'],
  axis: ['label', 'low', 'high'],
  localized: ['en', 'fa', 'tr'],
  pair: ['x', 'y'],
  placed: ['competitor_id', 'x', 'y'],
  placement: ['state', 'bands', 'sources'],
  source: ['source_class', 'host', 'observed_on'],
}

function keys(obj: object, kind: string): void {
  assert.deepEqual(Object.keys(obj).sort(), [...ALLOWED[kind]!].sort(), `${kind} keys`)
}

function code(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof CompetitiveError) return error.code
    throw error
  }
  return 'no_error'
}

const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

/** Three reviewed competitors, one candidate, the own brand; evidenced, stale, conflicting and unknown placements. */
function seeded() {
  const { root, ws } = workspace({ slug: 'pilito', now: () => NOW })
  setAxes(ws, AXES)
  const a = addCandidate(ws, { display_name: 'Avenra', markets: 'TR', domain: 'avenra-app.com' })
  const b = addCandidate(ws, { display_name: 'Borla', markets: 'TR' })
  const c = addCandidate(ws, { display_name: 'Cetin', markets: 'TR' })
  const hidden = addCandidate(ws, { display_name: 'CANDIDATE-CANARY Hidden', markets: 'TR' })
  for (const id of [a, b, c]) setStatus(ws, { competitor_id: id.competitor_id, status: 'owner_reviewed' })
  const aPage = record(ws, source({ url: 'https://avenra-app.com/pricing', excerpts: [{ claim_key: 'avenra.tier.premium', quote: 'Our premium coaching plan.' }, { claim_key: 'avenra.service.coached', quote: 'A coach does it with you.' }] }))
  const press = record(ws, source({ url: 'https://trade-weekly.com/a', excerpts: [{ claim_key: 'avenra.tier.mid', quote: 'Avenra sits mid-market.' }, { claim_key: 'borla.tier.budget', quote: 'Borla is the cheap option.' }] }))
  const oldPage = record(ws, source({ url: 'https://borla-app.com/', excerpts: [{ claim_key: 'borla.service.self', quote: 'Do it yourself, at your pace.' }], retrieved_at: day(POSITION_STALE_DAYS + 30) }))
  const owner = record(ws, source({ url: 'https://owner-notes.com/interview', source_type: 'owner_testimony', excerpts: [{ claim_key: 'own.tier.upper', quote: 'We price above most tutors.' }, { claim_key: 'own.service.guided', quote: 'Every learner gets a guide.' }] }))
  // Avenra: x conflicts (own page says high, press says mid); y evidenced.
  addPosition(ws, { subject: a.competitor_id, axis_id: AXIS_ID_CANARY, band: 'high', note: aPage.note_id, claim_key: 'avenra.tier.premium' })
  addPosition(ws, { subject: a.competitor_id, axis_id: AXIS_ID_CANARY, band: 'mid', note: press.note_id, claim_key: 'avenra.tier.mid' })
  addPosition(ws, { subject: a.competitor_id, axis_id: 'service_depth', band: 'upper_mid', note: aPage.note_id, claim_key: 'avenra.service.coached' })
  // Borla: x evidenced; y only from an old page (stale).
  addPosition(ws, { subject: b.competitor_id, axis_id: AXIS_ID_CANARY, band: 'low', note: press.note_id, claim_key: 'borla.tier.budget' })
  addPosition(ws, { subject: b.competitor_id, axis_id: 'service_depth', band: 'low', note: oldPage.note_id, claim_key: 'borla.service.self' })
  // Cetin: nothing. Hidden candidate: a position that must not leave.
  addPosition(ws, { subject: hidden.competitor_id, axis_id: AXIS_ID_CANARY, band: 'high', note: press.note_id, claim_key: 'avenra.tier.mid' })
  // Own brand: both axes from owner testimony.
  addPosition(ws, { subject: 'own', axis_id: AXIS_ID_CANARY, band: 'upper_mid', note: owner.note_id, claim_key: 'own.tier.upper' })
  addPosition(ws, { subject: 'own', axis_id: 'service_depth', band: 'high', note: owner.note_id, claim_key: 'own.service.guided' })
  return { root, ws, a, b, c, hidden, aPage, press }
}

test('axes: the owner names two axes; invalid, duplicate, unsafe or unknown-language input is refused', () => {
  const ok = validateAxes(AXES)
  assert.equal(ok.x.label.fa, 'سطح قیمت')
  assert.equal(ok.y.label.fa, null, 'a missing translation stays missing, never generated')
  const bad = (change: (axes: typeof AXES) => void) => {
    const draft = structuredClone(AXES)
    change(draft)
    return code(() => validateAxes(draft))
  }
  assert.equal(code(() => validateAxes({ x: AXES.x, y: undefined })), 'invalid_input')
  assert.equal(bad((d) => (d.y.axis_id = AXIS_ID_CANARY)), 'invalid_input')
  assert.equal(bad((d) => (d.y.label = { en: 'price level' })), 'invalid_input')
  assert.equal(bad((d) => (d.x.high = { ...d.x.high, en: 'budget' })), 'invalid_input')
  assert.equal(bad((d) => ((d.x.label as Record<string, unknown>).de = 'Preis')), 'invalid_input')
  assert.equal(bad((d) => (d.x.axis_id = 'Price Level!')), 'invalid_input')
  assert.equal(bad((d) => (d.x.label.en = 'x'.repeat(61))), 'invalid_input')
  assert.equal(bad((d) => (d.x.low.en = 'Ask founder@avenra-app.com')), 'refused')
  assert.equal(bad((d) => ((d.x as Record<string, unknown>).value = 0.4)), 'invalid_input')
})

test('axes: saved owner-only under brand/.private, read back validated; agent tokens and hand edits refused', () => {
  const { root, ws } = workspace({ slug: 'pilito', now: () => NOW })
  assert.equal(readAxes(ws), null)
  const saved = setAxes(ws, AXES)
  assert.equal(saved.kind, 'competitive_axes')
  const file = path.join(root, AXES_RECORD_PATH)
  assert.ok(file.includes(`${path.sep}.private${path.sep}`))
  assert.equal(fs.statSync(file).mode & 0o077, 0, 'owner-only file mode')
  assert.deepEqual(readAxes(ws)!.x, saved.x)

  process.env.BRAND_OS_AGENT_TOKEN = 'bos_at_test'
  try {
    assert.equal(code(() => readAxes(ws)), 'refused')
    assert.equal(code(() => setAxes(ws, AXES)), 'refused')
  } finally {
    delete process.env.BRAND_OS_AGENT_TOKEN
  }
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.writeFileSync(file, JSON.stringify({ ...doc, positions: [] }))
  assert.equal(code(() => readAxes(ws)), 'invalid_record')
  fs.writeFileSync(file, JSON.stringify({ ...doc, y: { ...doc.y, axis_id: doc.x.axis_id } }))
  assert.equal(code(() => readAxes(ws)), 'invalid_record')
  fs.writeFileSync(file, JSON.stringify({ ...doc, brand_slug: 'other' }))
  assert.equal(code(() => readAxes(ws)), 'wrong_brand')
})

test('positions: need axes, a known axis, a band, an existing subject and a cited market observation', () => {
  const { ws } = workspace({ slug: 'pilito', now: () => NOW })
  const a = addCandidate(ws, { display_name: 'Avenra', markets: 'TR' })
  const page = record(ws, source({ url: 'https://avenra-app.com/', excerpts: [{ claim_key: 'avenra.tier.premium', quote: 'Our premium plan.' }] }))
  const guide = record(ws, source({ url: 'https://developers.example-search.com/x', topic: 'search_platform_guidance', excerpts: [{ claim_key: 'search.rule', quote: 'A rule.' }] }))
  const input = { subject: a.competitor_id, axis_id: AXIS_ID_CANARY, band: 'high', note: page.note_id, claim_key: 'avenra.tier.premium' }
  assert.equal(code(() => addPosition(ws, input)), 'refused', 'no axes yet')
  setAxes(ws, AXES)
  assert.equal(code(() => addPosition(ws, { ...input, axis_id: 'other_axis' })), 'invalid_input')
  assert.equal(code(() => addPosition(ws, { ...input, band: '0.8' })), 'invalid_input', 'bands are words, never numbers')
  assert.equal(code(() => addPosition(ws, { ...input, subject: 'cmp_00000000-0000-4000-8000-000000000009' })), 'not_found')
  assert.equal(code(() => addPosition(ws, { ...input, claim_key: 'avenra.tier.unknown' })), 'unsupported_claim')
  assert.equal(code(() => addPosition(ws, { ...input, note: guide.note_id, claim_key: 'search.rule' })), 'refused')
  const first = addPosition(ws, input)
  assert.equal(first.outcome, 'recorded')
  assert.equal(addPosition(ws, input).outcome, 'existing')
  assert.equal(readPositions(ws).length, 1)
  assert.ok(!JSON.stringify(readPositions(ws)).includes('premium plan'), 'no quote is copied into a position')
  removePosition(ws, first.position.position_id)
  assert.deepEqual(readPositions(ws), [])
  assert.equal(code(() => removePosition(ws, first.position.position_id)), 'not_found')
})

test('placement: unknown stays unknown, disagreement is a range, old sources are stale, broken sources need review', () => {
  const view = (band: PositionView['band'], state: PositionView['state'], observed_on = '2026-11-01'): PositionView => ({
    position_id: `pos_${band}${state}`,
    subject: 'own',
    axis_id: 'x_axis',
    band,
    ref: 'knowledge:kn_x@y',
    claim_key: 'k.k',
    observed_on,
    state,
    source: { source_class: 'independent_reporting', host: 'a.com', observed_on },
  })
  assert.deepEqual(placementOf([]), { state: 'unknown', bands: [], sources: [] })
  assert.deepEqual(placementOf([view('mid', 'needs_review')]), { state: 'needs_review', bands: [], sources: [] })
  assert.equal(placementOf([view('mid', 'current')]).state, 'evidenced')
  assert.equal(placementOf([view('mid', 'stale')]).state, 'stale')
  assert.equal(placementOf([view('mid', 'stale'), view('mid', 'current')]).state, 'evidenced')
  const range = placementOf([view('high', 'current'), view('low', 'stale', '2026-01-01')])
  assert.equal(range.state, 'conflicting')
  assert.deepEqual(range.bands, ['low', 'high'], 'the recorded bands, low to high; never averaged')
  assert.deepEqual(placementOf([view('mid', 'conflicting')]).bands, ['mid'])
  assert.equal(placementOf([view('mid', 'needs_review'), view('low', 'current')]).state, 'evidenced', 'a broken source backs nothing')
})

test('share: axes labels and evidenced placements only; rationale, axis ids, note ids, quotes and hidden subjects never leave', () => {
  const { root, ws, a, b, c } = seeded()
  const out = shareLandscape(ws, { capability: OFFLINE, dryRun: false })
  const text = fs.readFileSync(path.join(root, SHARED_LANDSCAPE_PATH), 'utf8')
  const doc = JSON.parse(text) as SharedLandscape
  assert.ok(validSharedLandscape(doc))
  const pos = doc.positioning!
  keys(pos, 'positioning')
  keys(pos.axes, 'axes')
  for (const axis of [pos.axes.x, pos.axes.y]) {
    keys(axis, 'axis')
    for (const l of [axis.label, axis.low, axis.high]) keys(l, 'localized')
  }
  for (const pair of [pos.own, ...pos.competitors]) {
    keys(pair, 'competitor_id' in pair ? 'placed' : 'pair')
    for (const p of [pair.x, pair.y]) {
      keys(p, 'placement')
      for (const s of p.sources) keys(s, 'source')
    }
  }
  assert.deepEqual(pos.axes.x, { label: AXES.x.label, low: AXES.x.low, high: AXES.x.high })
  assert.deepEqual(pos.axes.y.label, { en: 'Service depth', fa: null, tr: null })
  assert.deepEqual(pos.bands, [...POSITION_BANDS])
  assert.equal(pos.stale_after_days, POSITION_STALE_DAYS)

  assert.deepEqual(pos.own.x, { state: 'evidenced', bands: ['upper_mid'], sources: [{ source_class: 'owner_statement', host: null, observed_on: '2026-11-22' }] })
  assert.equal(pos.own.y.state, 'evidenced')
  const of = (id: string) => pos.competitors.find((p) => p.competitor_id === id)!
  assert.deepEqual(pos.competitors.map((p) => p.competitor_id), doc.competitors.map((p) => p.competitor_id), 'one entry per shared competitor, same order')
  assert.equal(of(a.competitor_id).x.state, 'conflicting')
  assert.deepEqual(of(a.competitor_id).x.bands, ['mid', 'high'])
  assert.deepEqual(of(a.competitor_id).x.sources.map((s) => s.host).sort(), ['avenra-app.com', 'trade-weekly.com'])
  assert.equal(of(a.competitor_id).y.sources[0]!.source_class, 'competitor_own_page')
  assert.deepEqual([of(b.competitor_id).x.state, of(b.competitor_id).y.state], ['evidenced', 'stale'])
  assert.deepEqual(of(c.competitor_id), { competitor_id: c.competitor_id, x: { state: 'unknown', bands: [], sources: [] }, y: { state: 'unknown', bands: [], sources: [] } })
  assert.equal(out.landscape.positioning!.competitors.length, 3)

  for (const canary of [RATIONALE_CANARY, 'RATIONALE-CANARY', AXIS_ID_CANARY, 'service_depth', 'CANDIDATE-CANARY', 'pos_', 'kn_', 'knowledge:', 'avenra.tier', 'own.tier', 'premium coaching', 'mid-market', 'price above', 'https://', '.private', 'rationale', 'axis_id', 'claim_key', 'position_id']) {
    assert.ok(!text.includes(canary), `the shared file must not contain ${canary}`)
  }
  // Same records, same day: same bytes.
  assert.equal(shareLandscape(ws, { capability: OFFLINE, dryRun: false }).changed, false)
})

test('share: without axes the file has no positioning (a V2.2 file stays valid); an axis label that is a quote is refused', () => {
  const { root, ws } = workspace({ slug: 'pilito', now: () => NOW })
  const plain = shareLandscape(ws, { capability: OFFLINE, dryRun: false }).landscape
  assert.equal('positioning' in plain, false)
  assert.equal(readSharedLandscape(root, 'pilito').state, 'shared')
  const quote = 'Avenra is the most trusted premium tutor'
  record(ws, source({ url: 'https://trade-weekly.com/b', excerpts: [{ claim_key: 'avenra.trust', quote }] }))
  setAxes(ws, { ...AXES, y: { ...AXES.y, label: { en: quote } } })
  assert.equal(code(() => shareLandscape(ws, { capability: OFFLINE, dryRun: true })), 'refused')
})

test('read: a tampered positioning section withholds the whole file', () => {
  const { root, ws, a } = seeded()
  shareLandscape(ws, { capability: OFFLINE, dryRun: false })
  const file = path.join(root, SHARED_LANDSCAPE_PATH)
  const good = JSON.parse(fs.readFileSync(file, 'utf8')) as SharedLandscape
  const read = readSharedLandscape(root, 'pilito')
  assert.equal(read.state, 'shared')
  assert.ok(read.state === 'shared' && read.landscape.positioning)
  type Loose = Record<string, unknown>
  const tamper = (change: (doc: SharedLandscape) => void) => {
    const doc = structuredClone(good)
    change(doc)
    fs.writeFileSync(file, JSON.stringify(doc))
    return readSharedLandscape(root, 'pilito')
  }
  const withheld = { state: 'withheld', reason: 'invalid_record' }
  assert.deepEqual(tamper((d) => (d.positioning!.axes.x as unknown as Loose).rationale = RATIONALE_CANARY), withheld)
  assert.deepEqual(tamper((d) => ((d.positioning as unknown as Loose).axis_ids = ['a', 'b'])), withheld)
  assert.deepEqual(tamper((d) => ((d.positioning!.own.x as unknown as Loose).value = 0.72)), withheld, 'no numeric coordinates')
  assert.deepEqual(tamper((d) => (d.positioning!.own.x.bands = ['high', 'low'])), withheld, 'bands must be in order')
  assert.deepEqual(tamper((d) => (d.positioning!.competitors[0]!.y = { state: 'unknown', bands: ['mid'], sources: [] })), withheld, 'unknown carries no band')
  assert.deepEqual(tamper((d) => (d.positioning!.competitors[0]!.y = { state: 'evidenced', bands: ['mid'], sources: [] })), withheld, 'a placement needs a source')
  assert.deepEqual(tamper((d) => (d.positioning!.competitors[0]!.competitor_id = 'cmp_00000000-0000-4000-8000-000000000009')), withheld, 'only shared competitors')
  assert.deepEqual(tamper((d) => d.positioning!.competitors.push(structuredClone(d.positioning!.competitors[0]!))), withheld)
  assert.deepEqual(tamper((d) => (d.positioning!.stale_after_days = 0)), withheld)
  assert.deepEqual(tamper((d) => (d.positioning!.axes.y.label.en = `ghp_${'a'.repeat(36)}`)), { state: 'withheld', reason: 'unsafe_text' })
  assert.equal(tamper((d) => (d.positioning!.competitors = d.positioning!.competitors.filter((p) => p.competitor_id !== a.competitor_id))).state, 'shared', 'a subset is still honest')
})
