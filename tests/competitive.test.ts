import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { archiveNote, captureNote, editNote, ensureApprovalSecret, findNote, InterviewEngine, openWorkspace } from '@brand-os/brand-core'
import {
  addCandidate,
  buildLandscape,
  classifyCandidate,
  COMPETITIVE_DIRS,
  CompetitiveError,
  GAP_TEXT,
  HEADINGS,
  PROHIBITED_TEXT,
  REVIEW_REASONS,
  linkEvidence,
  priceSupport,
  readCandidate,
  scanCandidates,
  setScope,
  setStatus,
  validateDomain,
  validatePrice,
  verifyDomain,
  type Landscape,
} from '@brand-os/brand-core/competitive'
import { liveAdapter, unavailableAdapter } from '@brand-os/brand-core/research'
import { MESSAGE_QUOTE, NOW, PRICE_QUOTE, PROMO_QUOTE, record, source, VISUAL_QUOTE, wordflightSources } from './helpers/competitive.js'
import { listTree, useTestKey, workspace } from './helpers/knowledge.js'

/** Identity Slice B: the per-brand competitor index on Knowledge research notes. No network anywhere. */
useTestKey()

const OFFLINE = unavailableAdapter().capability(NOW)
const PRO_PRICE = { offer_name: 'Pro', amount: 12, currency: 'USD', billing_period: 'month', billing_commitment: 'annual', market: 'US', tax_inclusion: 'excluded', promotion: 'none_observed', feature_scope: null }

function code(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof CompetitiveError) return error.code
    throw error
  }
  return 'no_error'
}

function land(ws: Parameters<typeof buildLandscape>[0], now: Date = NOW, lang: 'en' | 'fa' | 'tr' = 'en'): Landscape {
  return buildLandscape(ws, { now, capability: OFFLINE, lang })
}

/** Everything a test brand tracks in Git (brand/ minus .private), with contents. */
function tracked(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const file of listTree(path.join(root, 'brand'))) if (!file.startsWith('.private/')) out[file] = fs.readFileSync(path.join(root, 'brand', file), 'utf8')
  return out
}

test('two candidates; a name-only candidate has no verified domain, no price and an honest gap list', () => {
  const { ws } = workspace({ slug: 'pilito', now: () => NOW })
  const a = addCandidate(ws, { display_name: 'WordFlight', relationship: 'direct', geography: 'international', markets: 'US,TR', domain: 'wordflight-app.com' })
  const b = addCandidate(ws, { display_name: 'CardNest', markets: 'TR' })
  assert.match(a.competitor_id, /^cmp_[0-9a-f-]{36}$/)
  assert.equal(a.status, 'candidate')
  assert.equal(a.domain_evidence, null)

  const view = land(ws)
  assert.equal(view.state, 'candidate_only')
  assert.deepEqual(view.authorizes, [])
  const wf = view.candidates.find((c) => c.competitor_id === a.competitor_id)!
  assert.equal(wf.official_domain, null, 'a claimed domain is not shown as official until a source verifies it')
  assert.equal(wf.domain_state, 'unverified')
  assert.equal(wf.assessment, 'candidate')
  const cn = view.candidates.find((c) => c.competitor_id === b.competitor_id)!
  assert.equal(cn.domain_state, 'not_claimed')
  assert.ok(view.matrix.filter((cell) => cell.competitor_id === b.competitor_id).every((cell) => cell.state === 'unknown'))
  assert.deepEqual(view.prices.rows, [])
  const codes = view.gaps.map((g) => g.code)
  for (const c of ['research_unavailable', 'scope_not_set', 'target_market_unapproved', 'relationship_unknown', 'identity_unverified', 'dimension_unknown']) assert.ok(codes.includes(c), c)
  assert.ok(view.prohibited_inferences.some((p) => p.code === 'ad_performance'))
})

test('same name: overlapping market refused, a different market kept apart only with a reason; never merged', () => {
  const { ws } = workspace({ slug: 'pilito', now: () => NOW })
  const tr = addCandidate(ws, { display_name: 'Lingo Café', markets: 'TR' })
  assert.equal(code(() => addCandidate(ws, { display_name: 'LINGO-CAFÉ', markets: 'DE' })), 'duplicate_candidate', 'case and punctuation are normalized')
  assert.equal(code(() => addCandidate(ws, { display_name: 'Lingo Café', markets: 'DE' })), 'duplicate_candidate', 'no reason given')
  assert.equal(code(() => addCandidate(ws, { display_name: 'Lingo Café', markets: 'TR,DE', distinct_from: tr.competitor_id, reason: 'German school' })), 'duplicate_candidate', 'overlapping market')
  assert.equal(code(() => addCandidate(ws, { display_name: 'Lingo Café', distinct_from: tr.competitor_id, reason: 'unknown market' })), 'duplicate_candidate', 'unknown market cannot prove a difference')
  const de = addCandidate(ws, { display_name: 'Lingo Café', markets: 'DE', distinct_from: tr.competitor_id, reason: 'A Berlin language school, not the Istanbul app' })
  assert.notEqual(de.competitor_id, tr.competitor_id)
  assert.deepEqual(de.distinct_from, [{ competitor_id: tr.competitor_id, reason: 'A Berlin language school, not the Istanbul app' }])
  assert.equal(scanCandidates(ws).records.length, 2)
  assert.ok(land(ws).candidates.find((c) => c.competitor_id === de.competitor_id)!.needs_review.some((n) => /same name/.test(n)))
})

test('evidence comes from Knowledge research notes at a pinned revision; no quote is copied into the index', () => {
  const { root, ws } = workspace({ slug: 'pilito', now: () => NOW })
  const { pricing, home } = wordflightSources(ws)
  const wf = addCandidate(ws, { display_name: 'WordFlight', relationship: 'direct', markets: 'US', domain: 'wordflight-app.com' })
  const linked = linkEvidence(ws, { competitor_id: wf.competitor_id, note: pricing.provenance, claim_key: 'wordflight.pricing.pro', dimension: 'public_price', label: 'Pro plan price on own pricing page', price: PRO_PRICE })
  assert.equal(linked.outcome, 'linked')
  assert.deepEqual(linked.observation.evidence, { note_id: pricing.note_id, revision: pricing.revision, claim_key: 'wordflight.pricing.pro', observed_at: NOW.toISOString() })
  assert.equal(linkEvidence(ws, { competitor_id: wf.competitor_id, note: pricing.note_id, claim_key: 'wordflight.pricing.pro', dimension: 'public_price', label: 'again', price: PRO_PRICE }).outcome, 'existing')
  linkEvidence(ws, { competitor_id: wf.competitor_id, note: home.note_id, claim_key: 'wordflight.message.five_minutes', dimension: 'public_message', label: 'Five minutes a day' })
  linkEvidence(ws, { competitor_id: wf.competitor_id, note: home.note_id, claim_key: 'wordflight.visual.paper_plane', dimension: 'visual_language', statement_kind: 'inference', label: 'Paper-plane motifs may be common in this category' })
  verifyDomain(ws, { competitor_id: wf.competitor_id, note: home.provenance, claim_key: 'wordflight.message.five_minutes' })

  const dir = path.join(root, ...COMPETITIVE_DIRS.root.split('/'))
  const stored = listTree(dir).map((file) => fs.readFileSync(path.join(dir, file), 'utf8')).join('\n')
  for (const quote of [PRICE_QUOTE, MESSAGE_QUOTE, VISUAL_QUOTE, 'five minutes a day']) assert.ok(!stored.includes(quote), `no quote copied: ${quote}`)
  for (const file of listTree(dir)) assert.equal(fs.statSync(path.join(dir, file)).mode & 0o777, 0o600, file)

  const view = land(ws)
  const c = view.candidates[0]!
  assert.equal(c.official_domain, 'wordflight-app.com')
  assert.equal(c.assessment, 'researched')
  const byDim = Object.fromEntries(c.observations.map((o) => [o.dimension, o]))
  assert.equal(byDim.public_price!.cell, 'observed')
  assert.equal(byDim.public_price!.verified, true)
  assert.equal(byDim.public_price!.source_class, 'competitor_own_page')
  assert.deepEqual(byDim.public_price!.price!.caveats, ['monthly_rate_billed_annually', 'feature_scope_unknown'])
  assert.equal(byDim.visual_language!.cell, 'hypothesis')
  assert.equal(byDim.visual_language!.verified, false)
  assert.equal(view.prices.comparison, 'single')
  assert.equal(view.prices.ranked, false)
  assert.equal(view.prices.currency_conversion, 'none')
})

test('stale, changed, superseded and archived notes visibly degrade trust', () => {
  const { root, ws } = workspace({ slug: 'pilito', now: () => NOW })
  const { pricing, home } = wordflightSources(ws)
  const wf = addCandidate(ws, { display_name: 'WordFlight', relationship: 'direct', markets: 'US', domain: 'wordflight-app.com' })
  linkEvidence(ws, { competitor_id: wf.competitor_id, note: pricing.note_id, claim_key: 'wordflight.pricing.pro', dimension: 'public_price', label: 'Pro price', price: PRO_PRICE })
  linkEvidence(ws, { competitor_id: wf.competitor_id, note: home.note_id, claim_key: 'wordflight.message.five_minutes', dimension: 'public_message', label: 'Five minutes a day' })
  verifyDomain(ws, { competitor_id: wf.competitor_id, note: home.note_id, claim_key: 'wordflight.message.five_minutes' })

  // 100 days later market observations (90-day limit) are history, not current.
  const later = new Date(NOW.getTime() + 100 * 86_400_000)
  const stale = land(openWorkspace(root, { now: () => later }), later)
  const price = stale.candidates[0]!.observations.find((o) => o.dimension === 'public_price')!
  assert.equal(price.ref_state, 'stale')
  assert.equal(price.cell, 'historical')
  assert.equal(price.verified, false)
  assert.ok(stale.prices.rows[0]!.caveats.includes('historical'))
  assert.equal(stale.candidates[0]!.assessment, 'needs_refresh')

  // An edit to the cited note: changed, needs review.
  const loaded = findNote(ws, home.note_id)
  editNote(ws, home.note_id, { expectedRevision: loaded.revision, ops: [{ op: 'set', add_tags: ['reviewed'] }] })
  let view = land(ws)
  const message = view.candidates[0]!.observations.find((o) => o.dimension === 'public_message')!
  assert.equal(message.ref_state, 'changed')
  assert.equal(message.cell, 'needs_review')
  assert.equal(view.candidates[0]!.domain_state, 'needs_review')
  assert.equal(view.candidates[0]!.official_domain, null)
  assert.ok(view.gaps.some((g) => g.code === 'evidence_needs_review' && g.dimension === 'public_message'))

  // A new capture of the pricing page supersedes the old note.
  record(ws, source({ url: 'https://wordflight-app.com/pricing', excerpts: [{ claim_key: 'wordflight.pricing.pro', quote: 'Pro: 14 USD per month, billed annually. Taxes not included.' }], bytes: 'v2' }))
  view = land(ws)
  assert.equal(view.candidates[0]!.observations.find((o) => o.dimension === 'public_price')!.ref_state, 'superseded')
  assert.equal(code(() => linkEvidence(ws, { competitor_id: wf.competitor_id, note: pricing.note_id, claim_key: 'wordflight.pricing.pro', dimension: 'offer', label: 'Pro plan exists' })), 'stale_source')

  archiveNote(ws, home.note_id)
  view = land(ws)
  assert.equal(view.candidates[0]!.observations.find((o) => o.dimension === 'public_message')!.ref_state, 'archived')
  assert.equal(view.state, 'candidate_only', 'nothing usable is left')
})

test('a false or missing source refuses the claim: no invented price, no masked promotion', () => {
  const { ws } = workspace({ slug: 'pilito', now: () => NOW })
  const { pricing, home } = wordflightSources(ws)
  const promo = record(ws, source({ url: 'https://wordflight-app.com/launch', excerpts: [{ claim_key: 'wordflight.pricing.launch', quote: PROMO_QUOTE }] }))
  const seoDoc = record(ws, source({ url: 'https://developers.google.com/search/docs', source_type: 'official_product_docs', topic: 'search_platform_guidance', excerpts: [{ claim_key: 'google.docs.thing', quote: 'Some guidance.' }] }))
  const contra = record(ws, source({ url: 'https://news-site.com/wordflight', excerpts: [{ claim_key: 'wordflight.offline.mode', stance: 'contradicts', quote: 'WordFlight has no offline mode.' }] }))
  const plain = captureNote(ws, { body: 'An idea about WordFlight pricing: 12 USD per month' })
  const wf = addCandidate(ws, { display_name: 'WordFlight', markets: 'US' }).competitor_id
  const link = (over: Record<string, unknown>) => code(() => linkEvidence(ws, { competitor_id: wf, note: pricing.note_id, claim_key: 'wordflight.pricing.pro', dimension: 'public_price', label: 'Pro price', price: PRO_PRICE, ...over } as never))

  assert.equal(link({ note: 'kn_00000000-0000-4000-8000-000000000001' }), 'refused', 'unknown note')
  assert.equal(link({ note: plain.id }), 'refused', 'an ordinary note is not research')
  assert.equal(link({ note: seoDoc.note_id, claim_key: 'google.docs.thing' }), 'refused', 'wrong topic')
  assert.equal(link({ claim_key: 'wordflight.pricing.enterprise' }), 'unsupported_claim', 'claim not in the note')
  assert.equal(link({ note: contra.note_id, claim_key: 'wordflight.offline.mode', dimension: 'offer', price: undefined }), 'unsupported_claim', 'a contradicting excerpt supports nothing')
  assert.equal(link({ note: `knowledge:${pricing.note_id}@${'0'.repeat(64)}` }), 'stale_source', 'pinned revision differs')
  assert.equal(link({ price: { ...PRO_PRICE, amount: 9 } }), 'unsupported_claim', 'amount not on the page')
  assert.equal(link({ price: { ...PRO_PRICE, currency: 'EUR' } }), 'unsupported_claim', 'currency not on the page')
  assert.equal(link({ price: { ...PRO_PRICE, billing_period: 'one_time' } }), 'unsupported_claim', 'period not on the page')
  assert.equal(link({ price: { ...PRO_PRICE, amount: 0 } }), 'unsupported_claim', 'unknown is not zero')
  assert.equal(link({ price: undefined }), 'invalid_input', 'public_price needs terms')
  assert.equal(link({ statement_kind: 'inference' }), 'invalid_input', 'a price is never an inference')
  assert.equal(link({ dimension: 'weakness_hypothesis', price: undefined }), 'invalid_input', 'hypotheses are inferences')
  // A launch discount cannot pass as a standard rate.
  const promoPrice = { ...PRO_PRICE, amount: 6, billing_commitment: 'unknown', tax_inclusion: 'unknown' }
  assert.equal(link({ note: promo.note_id, claim_key: 'wordflight.pricing.launch', price: promoPrice }), 'unsupported_claim')
  const ok = linkEvidence(ws, { competitor_id: wf, note: promo.note_id, claim_key: 'wordflight.pricing.launch', dimension: 'public_price', label: 'Launch price', price: { ...promoPrice, promotion: 'promotional' } })
  assert.ok(ok.observation.price)
  assert.ok(land(ws).prices.rows[0]!.caveats.includes('promotional_price'))
  assert.equal(readCandidate(ws, wf).observations.length, 1, 'only the supported price was recorded')
  void home
})

test('price support works on Persian and Turkish digits and words, and refuses unsupported terms', () => {
  const base = validatePrice({ offer_name: 'Pro', amount: 120000, currency: 'IRR', market: 'IR', billing_period: 'month' })
  assert.equal(priceSupport(base, 'اشتراک ماهانه: ۱۲۰٬۰۰۰ ریال').ok, true)
  const tr = validatePrice({ offer_name: 'Pro', amount: 149.9, currency: 'TRY', market: 'TR', billing_period: 'month', tax_inclusion: 'included' })
  assert.equal(priceSupport(tr, 'Aylık 149,90 TL (KDV dahil)').ok, true)
  assert.equal(priceSupport({ ...tr, tax_inclusion: 'included' }, 'Aylık 149,90 TL').ok, false)
  assert.equal(code(() => validatePrice({ offer_name: 'Pro', amount: 'free', currency: 'USD', market: 'US' })), 'invalid_input')
  assert.equal(code(() => validatePrice({ offer_name: 'Pro', amount: 5, currency: 'USD', market: 'GLOBAL' })), 'invalid_input')
})

test('conflicting sources are both kept and flagged; prices in different currencies are not comparable', () => {
  const { ws } = workspace({ slug: 'pilito', now: () => NOW })
  const { pricing, home } = wordflightSources(ws)
  const other = record(ws, source({ url: 'https://review-blog.com/wordflight', excerpts: [{ claim_key: 'wordflight.message.five_minutes', stance: 'contradicts', quote: 'Lessons take closer to twenty minutes.' }] }))
  const nest = record(ws, source({ url: 'https://cardnest-app.com/fiyat', excerpts: [{ claim_key: 'cardnest.pricing.plus', quote: 'Plus: aylık 99 TL' }] }))
  const wf = addCandidate(ws, { display_name: 'WordFlight', relationship: 'direct', markets: 'US' }).competitor_id
  const cn = addCandidate(ws, { display_name: 'CardNest', relationship: 'substitute', markets: 'TR' }).competitor_id
  linkEvidence(ws, { competitor_id: wf, note: home.note_id, claim_key: 'wordflight.message.five_minutes', dimension: 'public_message', label: 'Five minutes a day' })
  linkEvidence(ws, { competitor_id: wf, note: pricing.note_id, claim_key: 'wordflight.pricing.pro', dimension: 'public_price', label: 'Pro', price: PRO_PRICE })
  linkEvidence(ws, { competitor_id: cn, note: nest.note_id, claim_key: 'cardnest.pricing.plus', dimension: 'public_price', label: 'Plus', price: { offer_name: 'Plus', amount: 99, currency: 'TRY', market: 'TR', billing_period: 'month' } })
  const view = land(ws)
  const cell = view.matrix.find((m) => m.competitor_id === wf && m.dimension === 'public_message')!
  assert.equal(cell.state, 'conflicting')
  assert.ok(view.gaps.some((g) => g.code === 'evidence_conflicting'))
  assert.equal(view.prices.comparison, 'not_comparable')
  for (const r of ['different_currencies', 'different_markets', 'tax_unknown']) assert.ok(view.prices.reasons.includes(r), r)
  assert.deepEqual(view.prices.rows.map((r) => r.competitor_id), [cn, wf], 'listed by name, never sorted by amount')
  void other
})

test('two prices for the same offer and terms that disagree are a conflict, not a pick', () => {
  const { ws } = workspace({ slug: 'pilito', now: () => NOW })
  const a = record(ws, source({ url: 'https://wordflight-app.com/pricing', excerpts: [{ claim_key: 'wordflight.pricing.pro', quote: PRICE_QUOTE }] }))
  const b = record(ws, source({ url: 'https://wordflight-app.com/us/pricing', excerpts: [{ claim_key: 'wordflight.pricing.pro_us', quote: 'Pro: 15 USD per month, billed annually. Taxes not included.' }] }))
  const wf = addCandidate(ws, { display_name: 'WordFlight', markets: 'US' }).competitor_id
  linkEvidence(ws, { competitor_id: wf, note: a.note_id, claim_key: 'wordflight.pricing.pro', dimension: 'public_price', label: 'Pro', price: PRO_PRICE })
  linkEvidence(ws, { competitor_id: wf, note: b.note_id, claim_key: 'wordflight.pricing.pro_us', dimension: 'public_price', label: 'Pro (US page)', price: { ...PRO_PRICE, amount: 15 } })
  const view = land(ws)
  assert.ok(view.candidates[0]!.observations.every((o) => o.cell === 'conflicting' && !o.verified))
  assert.equal(view.prices.rows.length, 2)
})

test('cross-brand, restricted and agent access are refused', () => {
  const pilito = workspace({ slug: 'pilito', now: () => NOW })
  const north = workspace({ slug: 'northwind', now: () => NOW })
  const theirs = record(north.ws, source({ url: 'https://wordflight-app.com/pricing', excerpts: [{ claim_key: 'wordflight.pricing.pro', quote: PRICE_QUOTE }] }))
  const wf = addCandidate(pilito.ws, { display_name: 'WordFlight', markets: 'US' })
  assert.equal(code(() => linkEvidence(pilito.ws, { competitor_id: wf.competitor_id, note: theirs.note_id, claim_key: 'wordflight.pricing.pro', dimension: 'offer', label: 'x' })), 'refused')

  const restricted = captureNote(pilito.ws, { body: 'Partner rebate terms for WordFlight', classification: 'restricted', kind: 'research' })
  assert.equal(code(() => linkEvidence(pilito.ws, { competitor_id: wf.competitor_id, note: restricted.id, claim_key: 'wordflight.pricing.pro', dimension: 'offer', label: 'x' })), 'refused')

  // A pilito record copied into northwind is never read there.
  const from = path.join(pilito.root, ...COMPETITIVE_DIRS.candidates.split('/'), `${wf.competitor_id}.json`)
  const toDir = path.join(north.root, ...COMPETITIVE_DIRS.candidates.split('/'))
  fs.mkdirSync(toDir, { recursive: true })
  fs.copyFileSync(from, path.join(toDir, path.basename(from)))
  const scan = scanCandidates(north.ws)
  assert.equal(scan.records.length, 0)
  assert.deepEqual(scan.skipped, [{ file: path.basename(from), reason: 'wrong_brand' }])
  assert.equal(land(north.ws).state, 'no_candidates')

  process.env.BRAND_OS_AGENT_TOKEN = 'bos_at_test-not-a-real-token-000000'
  try {
    assert.equal(code(() => scanCandidates(pilito.ws)), 'refused')
    assert.equal(code(() => addCandidate(pilito.ws, { display_name: 'X' })), 'refused')
    assert.throws(() => land(pilito.ws))
  } finally {
    delete process.env.BRAND_OS_AGENT_TOKEN
  }
})

test('research unavailable: deterministic candidate-only output, no network', () => {
  const { ws } = workspace({ slug: 'pilito', now: () => NOW })
  const realFetch = globalThis.fetch
  globalThis.fetch = (() => {
    throw new Error('network used')
  }) as typeof fetch
  try {
    setScope(ws, 'pricing,identity')
    addCandidate(ws, { display_name: 'WordFlight', relationship: 'direct', markets: 'US' })
    addCandidate(ws, { display_name: 'CardNest', relationship: 'aspirational_benchmark', markets: 'TR' })
    const first = land(ws)
    const second = land(ws)
    assert.deepEqual(first, second)
    assert.equal(first.state, 'candidate_only')
    assert.equal(first.research.state, 'unavailable')
    assert.ok(first.gaps[0]!.code === 'research_unavailable')
    assert.deepEqual(first.scope.dimensions, ['offer', 'public_price', 'public_message', 'visual_language'])
    const dims = new Set(first.gaps.filter((g) => g.code === 'dimension_unknown').map((g) => g.dimension))
    assert.deepEqual([...dims].sort(), ['offer', 'public_message', 'public_price', 'visual_language'])
    assert.equal(first.gaps.filter((g) => g.code === 'dimension_unknown').length, 8)
    // A live adapter that is off is just as honest.
    const off = buildLandscape(ws, { now: NOW, capability: liveAdapter({ enabled: false }).capability(NOW) })
    assert.equal(off.research.state, 'unavailable')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('target market is the approved fact, cited by id and revision, and reports never mutate tracked brand files', () => {
  const { root, ws } = workspace({ slug: 'pilito', now: () => NOW })
  const engine = new InterviewEngine(root)
  const proof = ensureApprovalSecret(root)
  assert.equal(engine.changeAnswer('business.market.geography', 'Turkey and the Persian-speaking diaspora').kind, 'recorded')
  assert.equal(engine.approve('business.market.geography', 'owner', proof).kind, 'recorded')
  const before = tracked(root)
  const { pricing } = wordflightSources(ws)
  const wf = addCandidate(ws, { display_name: 'WordFlight', relationship: 'direct', geography: 'international', markets: 'US' })
  linkEvidence(ws, { competitor_id: wf.competitor_id, note: pricing.note_id, claim_key: 'wordflight.pricing.pro', dimension: 'public_price', label: 'Pro', price: PRO_PRICE })
  setStatus(ws, { competitor_id: wf.competitor_id, status: 'owner_reviewed' })
  const view = land(ws)
  assert.equal(view.target_market.state, 'approved')
  assert.ok(view.target_market.revision, 'cited by revision')
  assert.ok(!JSON.stringify(view).includes('Persian-speaking'), 'the fact value is cited, not copied')
  assert.ok(!view.gaps.some((g) => g.code === 'target_market_unapproved'))
  assert.equal(view.candidates[0]!.assessment, 'owner_reviewed')
  assert.deepEqual(tracked(root), before, 'approved facts, config and every tracked file unchanged')
})

test('status, exclusions and input validation', () => {
  const { root, ws } = workspace({ slug: 'pilito', now: () => NOW })
  const wf = addCandidate(ws, { display_name: 'WordFlight', markets: 'US' })
  assert.equal(code(() => setStatus(ws, { competitor_id: wf.competitor_id, status: 'archived' })), 'invalid_input', 'an exclusion needs a reason')
  assert.equal(code(() => setStatus(ws, { competitor_id: wf.competitor_id, status: 'researched' })), 'invalid_input', 'researched is computed, never set')
  classifyCandidate(ws, { competitor_id: wf.competitor_id, relationship: 'indirect', geography: 'regional' })
  setStatus(ws, { competitor_id: wf.competitor_id, status: 'archived', reason: 'Serves only schools; not our buyers' })
  const view = land(ws)
  assert.equal(view.candidates[0]!.assessment, 'archived')
  assert.equal(view.state, 'no_candidates')

  for (const bad of ['https://rival.com', 'rival.com/pricing', '10.0.0.1', 'localhost', 'rival.local', 'intranet', 'a..com', 'user@rival.com']) assert.equal(code(() => validateDomain(bad)), 'invalid_input', bad)
  assert.equal(validateDomain('WWW.Rival.com.tr.'), 'www.rival.com.tr')
  assert.equal(code(() => addCandidate(ws, { display_name: 'X', markets: 'Turkey' })), 'invalid_input')
  assert.equal(code(() => addCandidate(ws, { display_name: 'x'.repeat(81) })), 'invalid_input')
  assert.equal(code(() => addCandidate(ws, { display_name: '!!!' })), 'invalid_input')
  assert.equal(code(() => addCandidate(ws, { display_name: 'Y', relationship: 'enemy' })), 'invalid_input')
  assert.equal(code(() => readCandidate(ws, '../../etc/passwd')), 'invalid_input')
  assert.equal(code(() => linkEvidence(ws, { competitor_id: wf.competitor_id, note: '../x', claim_key: 'a.b', dimension: 'offer', label: 'x' })), 'invalid_input')
  assert.equal(code(() => linkEvidence(ws, { competitor_id: wf.competitor_id, note: 'kn_abc', claim_key: 'a.b', dimension: 'offer', label: 'y'.repeat(201) })), 'invalid_input')

  // A symlinked competitive folder is refused, never followed.
  const { root: other, ws: ows } = workspace({ slug: 'pilito', now: () => NOW })
  fs.mkdirSync(path.join(other, 'brand', '.private'), { recursive: true })
  fs.symlinkSync(path.join(root, 'brand', '.private', 'competitive'), path.join(other, 'brand', '.private', 'competitive'))
  assert.equal(code(() => scanCandidates(ows)), 'unsafe_path')
})

test('domain verification needs a source fetched from that domain; two records never share one', () => {
  const { ws } = workspace({ slug: 'pilito', now: () => NOW })
  const { home } = wordflightSources(ws)
  const blog = record(ws, source({ url: 'https://review-blog.com/wordflight', excerpts: [{ claim_key: 'wordflight.review.site', quote: 'WordFlight lives at wordflight-app.com.' }] }))
  const wf = addCandidate(ws, { display_name: 'WordFlight', markets: 'US' }).competitor_id
  assert.equal(code(() => verifyDomain(ws, { competitor_id: wf, domain: 'wordflight-app.com', note: blog.note_id, claim_key: 'wordflight.review.site' })), 'unsupported_claim')
  verifyDomain(ws, { competitor_id: wf, domain: 'wordflight-app.com', note: home.note_id, claim_key: 'wordflight.message.five_minutes' })
  assert.equal(land(ws).candidates[0]!.official_domain, 'wordflight-app.com')
  const twin = addCandidate(ws, { display_name: 'Word Flight Learning', markets: 'US' }).competitor_id
  assert.equal(code(() => verifyDomain(ws, { competitor_id: twin, domain: 'wordflight-app.com', note: home.note_id, claim_key: 'wordflight.message.five_minutes' })), 'duplicate_candidate')
})

test('gap text, review reasons and prohibited inferences exist in en, fa and tr; the landscape speaks the chosen language', () => {
  for (const catalog of [GAP_TEXT, PROHIBITED_TEXT, REVIEW_REASONS, HEADINGS]) {
    for (const [key, text] of Object.entries(catalog)) {
      for (const lang of ['en', 'fa', 'tr'] as const) assert.ok(text[lang] && text[lang].trim().length > 2, `${key}.${lang}`)
      assert.notEqual(text.fa, text.en, key)
      assert.notEqual(text.tr, text.en, key)
      const en = (text.en.match(/\{\w+\}/g) ?? []).sort()
      assert.deepEqual((text.fa.match(/\{\w+\}/g) ?? []).sort(), en, `${key} fa placeholders`)
      assert.deepEqual((text.tr.match(/\{\w+\}/g) ?? []).sort(), en, `${key} tr placeholders`)
    }
  }
  const { ws } = workspace({ slug: 'pilito', now: () => NOW })
  addCandidate(ws, { display_name: 'WordFlight', markets: 'US' })
  const fa = land(ws, NOW, 'fa')
  assert.ok(fa.gaps.every((g) => /[؀-ۿ]/.test(g.text)), 'Persian text')
  assert.ok(fa.gaps.some((g) => g.text.includes('WordFlight')))
  const tr = land(ws, NOW, 'tr')
  assert.ok(tr.gaps.some((g) => /bilinmiyor|doğrulanmadı/.test(g.text)))
})

test('dossiers stay private: the folder is gitignored in a brand repo, and no agent tool names it', () => {
  const { root, ws } = workspace({ slug: 'pilito', now: () => NOW })
  const wf = addCandidate(ws, { display_name: 'WordFlight', markets: 'US' })
  const file = path.join(COMPETITIVE_DIRS.candidates, `${wf.competitor_id}.json`)
  assert.ok(fs.existsSync(path.join(root, file)))
  execFileSync('git', ['init', '-q'], { cwd: root })
  assert.equal(execFileSync('git', ['check-ignore', file], { cwd: root, encoding: 'utf8' }).trim(), file)
  const mcp = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'scripts', 'mcp.ts'), 'utf8')
  const query = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'packages', 'brand-core', 'src', 'query.ts'), 'utf8')
  assert.ok(!/competitive/i.test(mcp) && !/competitive/i.test(query), 'no MCP or brand:query path reads competitor dossiers (tests/audit.test.ts pins the tool list)')
})
