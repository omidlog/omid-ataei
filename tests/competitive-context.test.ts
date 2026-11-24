import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { ensureApprovalSecret, InterviewEngine, openWorkspace } from '@brand-os/brand-core'
import {
  addCandidate,
  ALTERNATIVES,
  buildCompetitiveMemo,
  COMPETITIVE_DIRS,
  CompetitiveError,
  getCompetitiveContext,
  importSeoNames,
  scanCandidates,
  linkEvidence,
  MEMO_HEADINGS,
  MEMO_TITLES,
  NOT_KNOWN,
  PROPOSE_EDIT,
  SEO_NAME_STATUS,
  WARNINGS,
  type CompetitiveMemo,
} from '@brand-os/brand-core/competitive'
import { loadEvidence, unavailableAdapter } from '@brand-os/brand-core/research'
import { recordAnswer } from '@brand-os/brand-core/seo'
import { MESSAGE_QUOTE, NOW, PRICE_QUOTE, record, source, wordflightSources } from './helpers/competitive.js'
import { listTree, useTestKey, workspace } from './helpers/knowledge.js'

/** Identity Slice C: one CompetitiveContext projection, four draft consumers. No network, no writes. */
useTestKey()

const OFFLINE = unavailableAdapter().capability(NOW)
const PRO_PRICE = { offer_name: 'Pro', amount: 12, currency: 'USD', billing_period: 'month', billing_commitment: 'annual', market: 'US', tax_inclusion: 'excluded', promotion: 'none_observed', feature_scope: null }
type Ws = Parameters<typeof getCompetitiveContext>[0]

function memo(ws: Ws, purpose: 'marketing' | 'pricing' | 'seo' | 'identity', extra: { now?: Date; market?: string; lang?: 'en' | 'fa' | 'tr' } = {}): CompetitiveMemo {
  return buildCompetitiveMemo(ws, purpose, { capability: OFFLINE, now: extra.now ?? NOW, market: extra.market, lang: extra.lang })
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

/** Tracked brand files plus the private strategy (SEO plans, interview) and fact files, with contents. */
function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const file of listTree(path.join(root, 'brand'))) {
    if (file.startsWith('.private/') && !file.startsWith('.private/strategy/')) continue
    out[file] = fs.readFileSync(path.join(root, 'brand', file), 'utf8')
  }
  return out
}

/** WordFlight with a cited price and a message claim that is cited by both marketing (message) and pricing (offer). */
function seeded(slug = 'pilito') {
  const { root, ws } = workspace({ slug, now: () => NOW })
  const { pricing, home } = wordflightSources(ws)
  const wf = addCandidate(ws, { display_name: 'WordFlight', relationship: 'direct', geography: 'international', markets: 'US', domain: 'wordflight-app.com' }).competitor_id
  linkEvidence(ws, { competitor_id: wf, note: pricing.note_id, claim_key: 'wordflight.pricing.pro', dimension: 'public_price', label: 'Pro on own pricing page', price: PRO_PRICE })
  linkEvidence(ws, { competitor_id: wf, note: home.note_id, claim_key: 'wordflight.message.five_minutes', dimension: 'public_message', label: 'Five minutes a day' })
  linkEvidence(ws, { competitor_id: wf, note: home.note_id, claim_key: 'wordflight.message.five_minutes', dimension: 'offer', label: 'Short daily lessons' })
  return { root, ws, wf, pricing, home }
}

test('no candidates: missing, not an empty list; name-only: candidate_only; purpose filters dimensions and prohibitions', () => {
  const { ws } = workspace({ slug: 'pilito', now: () => NOW })
  const empty = getCompetitiveContext(ws, 'marketing', { capability: OFFLINE, now: NOW })
  assert.equal(empty.state, 'missing')
  assert.deepEqual(empty.authorizes, [])
  assert.ok(empty.gaps.some((g) => g.code === 'no_candidates'))
  assert.ok(empty.next_research.some((s) => s.code === 'add_candidates'))
  assert.ok(empty.next_research.some((s) => s.code === 'enable_research'))

  addCandidate(ws, { display_name: 'CardNest', markets: 'TR' })
  const names = getCompetitiveContext(ws, 'pricing', { capability: OFFLINE, now: NOW })
  assert.equal(names.state, 'candidate_only')
  assert.deepEqual(names.dimensions, ['public_price', 'offer'])
  assert.deepEqual(names.gaps.filter((g) => g.code === 'dimension_unknown').map((g) => g.dimension).sort(), ['offer', 'public_price'])
  assert.deepEqual(names.prohibited_inferences.map((p) => p.code), ['private_commercials', 'currency_conversion', 'price_coordination', 'brand_decision'])
  assert.ok(names.prices, 'pricing context lists prices')
  assert.equal(getCompetitiveContext(ws, 'identity', { capability: OFFLINE, now: NOW }).prices, null)
  assert.ok(getCompetitiveContext(ws, 'seo', { capability: OFFLINE, now: NOW }).gaps.some((g) => g.code === 'seo_needs_search_evidence'))
  assert.equal(code(() => getCompetitiveContext(ws, 'growth' as never, { capability: OFFLINE })), 'invalid_input')
  assert.equal(code(() => getCompetitiveContext(ws, 'pricing', { capability: OFFLINE, market: 'TR,US' })), 'invalid_input')
})

test('market filter keeps listed, GLOBAL and unknown-market candidates, counts the rest, and filters prices', () => {
  const { ws } = seeded()
  addCandidate(ws, { display_name: 'CardNest', markets: 'TR' })
  addCandidate(ws, { display_name: 'Polyglobe', markets: 'GLOBAL' })
  addCandidate(ws, { display_name: 'Nameless' })
  const tr = getCompetitiveContext(ws, 'pricing', { capability: OFFLINE, now: NOW, market: 'tr' })
  assert.equal(tr.market, 'TR')
  assert.deepEqual(tr.competitors.map((c) => [c.display_name, c.market_match]), [['CardNest', 'listed'], ['Nameless', 'unknown'], ['Polyglobe', 'global']])
  assert.equal(tr.excluded_candidates, 1, 'WordFlight (US only) is counted, not listed')
  assert.deepEqual(tr.prices!.rows, [], 'a US price is not a TR price')
  const us = getCompetitiveContext(ws, 'pricing', { capability: OFFLINE, now: NOW, market: 'US' })
  assert.equal(us.prices!.rows.length, 1)
})

test('one cited claim feeds both the marketing and the pricing draft; the quote is stored once, in Knowledge', () => {
  const { root, ws, home } = seeded()
  const marketing = memo(ws, 'marketing')
  const pricing = memo(ws, 'pricing')
  const shared = `knowledge:${home.note_id}@${home.revision}`
  assert.ok(marketing.source_refs.includes(shared))
  assert.ok(pricing.source_refs.includes(shared))
  assert.ok(marketing.observations.some((o) => o.claim_key === 'wordflight.message.five_minutes' && o.dimension === 'public_message'))
  assert.ok(pricing.observations.some((o) => o.claim_key === 'wordflight.message.five_minutes' && o.dimension === 'offer'))
  // Exactly one research note holds the quote; no competitive file and no draft repeats it.
  assert.equal(loadEvidence(ws).items.filter((item) => item.source.excerpts.some((e) => e.quote === MESSAGE_QUOTE)).length, 1)
  const dir = path.join(root, ...COMPETITIVE_DIRS.root.split('/'))
  const stored = listTree(dir).map((file) => fs.readFileSync(path.join(dir, file), 'utf8')).join('\n')
  for (const text of [stored, JSON.stringify(marketing), JSON.stringify(pricing)]) {
    assert.ok(!text.includes(MESSAGE_QUOTE) && !text.includes(PRICE_QUOTE), 'no quote copied')
  }
  assert.equal(marketing.status, 'draft')
  assert.deepEqual(marketing.authorizes, [])
  assert.ok(marketing.alternatives.length >= 2, 'at least two alternatives')
  assert.ok(marketing.alternatives.every((a) => a.status === 'hypothesis'))
  assert.deepEqual(marketing.not_known.map((n) => n.code), ['ad_spend', 'conversion', 'revenue', 'targeting', 'effectiveness'])
  assert.ok(marketing.proposed_edits.every((e) => /brand:knowledge propose/.test(e.text)))
})

test('a contradiction shows as unresolved in both the marketing and the pricing draft', () => {
  const { ws } = seeded()
  record(ws, source({ url: 'https://review-blog.com/wordflight', excerpts: [{ claim_key: 'wordflight.message.five_minutes', stance: 'contradicts', quote: 'Lessons take closer to twenty minutes.' }] }))
  for (const purpose of ['marketing', 'pricing'] as const) {
    const m = memo(ws, purpose)
    const item = m.unresolved.find((u) => u.cell === 'conflicting')
    assert.ok(item, `${purpose}: conflict listed as unresolved`)
    assert.ok(!m.observations.some((o) => o.observation_id === item.observation_id), `${purpose}: not used as current`)
    assert.ok(m.gaps.some((g) => g.code === 'evidence_conflicting'), purpose)
  }
})

test('missing or stale prices give warnings, never a priced recommendation', () => {
  const { ws } = workspace({ slug: 'pilito', now: () => NOW })
  addCandidate(ws, { display_name: 'WordFlight', markets: 'US' })
  const none = memo(ws, 'pricing')
  assert.equal(none.kind, 'pricing_benchmark_memo')
  if (none.kind !== 'pricing_benchmark_memo') return
  assert.ok(none.warnings.some((w) => w.code === 'no_current_price'))
  assert.equal(none.prices.priced_recommendation, false)
  assert.ok(none.alternatives.some((a) => a.id === 'gather_evidence'))
  assert.ok(!/\d/.test(none.alternatives.map((a) => a.title + a.trade_off).join(' ')), 'no option carries a number')

  const { root, ws: seededWs } = seeded()
  const later = new Date(NOW.getTime() + 100 * 86_400_000)
  const stale = buildCompetitiveMemo(openWorkspace(root, { now: () => later }), 'pricing', { capability: OFFLINE, now: later })
  if (stale.kind !== 'pricing_benchmark_memo') throw new Error('kind')
  assert.equal(stale.prices.rows[0]!.status, 'historical')
  assert.ok(stale.warnings.some((w) => w.code === 'historical_price' && /2026-11-22/.test(w.text)))
  assert.ok(stale.warnings.some((w) => w.code === 'no_current_price'))
  assert.equal(stale.prices.ranked, false)
  assert.equal(stale.prices.currency_conversion, 'none')
  void seededWs
})

test('a promotional annual price never reads as a standard monthly rate', () => {
  const { ws } = workspace({ slug: 'pilito', now: () => NOW })
  const promo = record(ws, source({ url: 'https://wordflight-app.com/launch', excerpts: [{ claim_key: 'wordflight.pricing.launch', quote: 'Launch offer: Pro 6 USD per month, billed annually for the first year, 50% off.' }] }))
  const wf = addCandidate(ws, { display_name: 'WordFlight', markets: 'US' }).competitor_id
  assert.equal(code(() => linkEvidence(ws, { competitor_id: wf, note: promo.note_id, claim_key: 'wordflight.pricing.launch', dimension: 'public_price', label: 'Launch', price: { ...PRO_PRICE, amount: 6, tax_inclusion: 'unknown' } })), 'unsupported_claim', 'none_observed refused')
  linkEvidence(ws, { competitor_id: wf, note: promo.note_id, claim_key: 'wordflight.pricing.launch', dimension: 'public_price', label: 'Launch', price: { ...PRO_PRICE, amount: 6, tax_inclusion: 'unknown', promotion: 'promotional' } })
  const m = memo(ws, 'pricing')
  if (m.kind !== 'pricing_benchmark_memo') throw new Error('kind')
  const row = m.prices.rows[0]!
  assert.equal(row.rate_label, 'promotional')
  assert.notEqual(row.rate_label, 'standard_rate')
  assert.equal(row.price_kind, 'publicly_advertised')
  assert.ok(row.caveats.includes('promotional_price') && row.caveats.includes('monthly_rate_billed_annually'))
  const codes = m.warnings.map((w) => w.code)
  assert.ok(codes.includes('promotional_price') && codes.includes('monthly_rate_billed_annually'))
})

test('a new research revision keeps the same refs and turns them into needs_review in every draft', () => {
  const { ws, home } = seeded()
  const before = memo(ws, 'marketing')
  const oldRef = `knowledge:${home.note_id}@${home.revision}`
  record(ws, source({ url: 'https://www.wordflight-app.com/', excerpts: [{ claim_key: 'wordflight.message.five_minutes', quote: 'WordFlight: learn a language in ten minutes a day.' }], bytes: 'v2' }))
  for (const purpose of ['marketing', 'pricing'] as const) {
    const after = memo(ws, purpose)
    const item = after.unresolved.find((u) => u.ref === oldRef)
    assert.ok(item, `${purpose}: same ref, still cited`)
    assert.equal(item.ref_state, 'superseded')
    assert.equal(item.cell, 'needs_review')
    assert.ok(after.next_research.some((s) => s.code === 'refresh_source'))
  }
  assert.notEqual(memo(ws, 'marketing').context.source_digest, before.context.source_digest, 'digest shows the change')
})

test('drafts leave the marketing plan, SEO plan, interview and business.sales.pricing unchanged; facts cited by revision only', () => {
  const { root, ws } = seeded()
  const engine = new InterviewEngine(root)
  const proof = ensureApprovalSecret(root)
  assert.equal(engine.changeAnswer('business.sales.pricing', 'Freemium with a Pro plan, owner-set').kind, 'recorded')
  assert.equal(engine.approve('business.sales.pricing', 'owner', proof).kind, 'recorded')
  recordAnswer(ws, { question_id: 'seo.competitors.named', value: ['WordFlight', 'LexiLoop'] })
  const seoDraftDir = path.join(root, 'brand', '.private', 'strategy', 'seo', 'drafts')
  fs.mkdirSync(seoDraftDir, { recursive: true })
  fs.writeFileSync(path.join(seoDraftDir, 'plan.json'), '{"kind":"seo_strategy_draft"}\n')
  const before = snapshot(root)
  const out = (['marketing', 'pricing', 'seo', 'identity'] as const).map((p) => memo(ws, p))
  assert.deepEqual(snapshot(root), before, 'nothing tracked or strategic changed')
  const pricing = out[1]!
  const cited = pricing.owner_inputs.find((f) => f.fact_id === 'business.sales.pricing')!
  assert.equal(cited.state, 'approved')
  assert.ok(cited.revision, 'cited by its revision')
  assert.ok(!JSON.stringify(out).includes('owner-set'), 'the fact value is cited, not copied')
  assert.ok(!out.some((m) => m.owner_inputs.some((f) => f.fact_id === 'business.marketing.budget')), 'budgets are never read')
})

test('SEO supplement: interview names stay owner assumptions; cited competitors are mapped by id; rankings unverified', () => {
  const { ws, wf } = seeded()
  const unanswered = memo(ws, 'seo')
  if (unanswered.kind !== 'seo_competitor_supplement') throw new Error('kind')
  assert.equal(unanswered.seo_interview, 'not_answered')
  recordAnswer(ws, { question_id: 'seo.competitors.named', value: ['wordflight', 'LexiLoop'] })
  const m = memo(ws, 'seo')
  if (m.kind !== 'seo_competitor_supplement') throw new Error('kind')
  assert.deepEqual(m.owner_named, [
    { name: 'wordflight', status: 'unverified_owner_assumption', competitor_id: wf },
    { name: 'LexiLoop', status: 'unverified_owner_assumption', competitor_id: null },
  ])
  assert.deepEqual(m.search_evidence, { rankings: 'unverified', keyword_gaps: 'unverified' })
  assert.ok(m.observations.every((o) => o.dimension === 'public_message'))
  assert.ok(m.prohibited_inferences.some((p) => p.code === 'search_rankings'))
})

test('visual landscape: no cited visuals means unavailable, not invented; retain is a valid route; legal clearance never claimed', () => {
  const { ws, wf, home } = seeded()
  const without = memo(ws, 'identity')
  if (without.kind !== 'visual_landscape_assessment') throw new Error('kind')
  assert.equal(without.visual_comparison, 'unavailable')
  assert.ok(without.warnings.some((w) => w.code === 'visual_unavailable'))
  assert.equal(without.similarity, 'not_assessed')
  assert.equal(without.intake.state, 'not_recorded')
  assert.deepEqual(without.alternatives.map((a) => a.id).slice(0, 4), ['create', 'retain_improve_guidelines', 'evolve', 'rebrand'], 'unknown logo status lists every route')
  linkEvidence(ws, { competitor_id: wf, note: home.note_id, claim_key: 'wordflight.visual.paper_plane', dimension: 'visual_language', label: 'Paper-plane logo' })
  const present = buildCompetitiveMemo(ws, 'identity', {
    capability: OFFLINE,
    now: NOW,
    identityIntake: { state: 'recorded', choice: { logo_presence: 'present', identity_intent: 'retain', change_depth: null }, intake: { schema_version: 1, source: 'studio_owner_wizard', authority: 'unapproved_owner_intake', logo_presence: 'present', identity_intent: 'retain', change_depth: null, recorded_at: NOW.toISOString() } },
  })
  if (present.kind !== 'visual_landscape_assessment') throw new Error('kind')
  assert.equal(present.visual_comparison, 'available')
  assert.equal(present.alternatives[0]!.id, 'retain_improve_guidelines')
  assert.ok(!present.alternatives.some((a) => a.id === 'create'), 'an existing logo is not recreated')
  assert.ok(present.not_known.some((n) => n.code === 'legal_clearance'))
  assert.ok(present.prohibited_inferences.some((p) => p.code === 'legal_clearance'))
})

test('drafts are deterministic, owner-only and per brand', () => {
  const { ws } = seeded()
  assert.deepEqual(memo(ws, 'pricing'), memo(ws, 'pricing'))
  const other = workspace({ slug: 'northwind', now: () => NOW })
  assert.equal(getCompetitiveContext(other.ws, 'pricing', { capability: OFFLINE, now: NOW }).state, 'missing')
  process.env.BRAND_OS_AGENT_TOKEN = 'bos_at_test-not-a-real-token-000000'
  try {
    assert.equal(code(() => getCompetitiveContext(ws, 'marketing', { capability: OFFLINE })), 'refused')
    assert.throws(() => memo(ws, 'seo'))
  } finally {
    delete process.env.BRAND_OS_AGENT_TOKEN
  }
})

test('draft text exists in en, fa and tr with matching placeholders; drafts speak the chosen language', () => {
  const catalogs = [MEMO_TITLES, MEMO_HEADINGS, NOT_KNOWN, WARNINGS, SEO_NAME_STATUS, { propose: PROPOSE_EDIT }, ...Object.values(ALTERNATIVES).flatMap((a) => [{ t: a.title }, { o: a.trade_off }])]
  for (const catalog of catalogs) {
    for (const [key, text] of Object.entries(catalog as Record<string, Record<'en' | 'fa' | 'tr', string>>)) {
      for (const lang of ['en', 'fa', 'tr'] as const) assert.ok(text[lang]?.trim(), `${key}.${lang}`)
      assert.notEqual(text.fa, text.en, key)
      assert.notEqual(text.tr, text.en, key)
      const en = (text.en.match(/\{\w+\}/g) ?? []).sort()
      assert.deepEqual((text.fa.match(/\{\w+\}/g) ?? []).sort(), en, `${key} fa`)
      assert.deepEqual((text.tr.match(/\{\w+\}/g) ?? []).sort(), en, `${key} tr`)
    }
  }
  const { ws } = seeded()
  const fa = memo(ws, 'pricing', { lang: 'fa' })
  assert.ok([...fa.warnings, ...fa.not_known, ...fa.alternatives.map((a) => ({ text: a.title }))].every((x) => /[؀-ۿ]/.test(x.text)))
})

test('import-seo-names: only on command, never merges, keeps names as unverified seo_interview candidates', () => {
  const { root, ws, wf } = seeded()
  assert.deepEqual(importSeoNames(ws), { results: [], interview: 'not_answered' })
  recordAnswer(ws, { question_id: 'seo.competitors.named', value: 'unknown' })
  assert.deepEqual(importSeoNames(ws), { results: [], interview: 'not_answered' }, 'unknown is not a competitor called "unknown"')
  recordAnswer(ws, { question_id: 'seo.competitors.named', value: ['WORDFLIGHT', 'LexiLoop', 'lexi-loop'] })
  const interviewFile = path.join(root, 'brand', '.private', 'strategy', 'seo', 'interview.json')
  const interviewBefore = fs.readFileSync(interviewFile, 'utf8')
  assert.equal(scanCandidates(ws).records.length, 1, 'recording an SEO answer adds no candidate')
  const dry = importSeoNames(ws, { dryRun: true })
  assert.deepEqual(dry.results.map((r) => r.outcome), ['exists', 'would_add', 'exists'])
  assert.equal(scanCandidates(ws).records.length, 1, 'dry run writes nothing')
  const run = importSeoNames(ws)
  assert.deepEqual(run.results.map((r) => r.outcome), ['exists', 'added', 'exists'], 'lexi-loop is the same name: reported, not added')
  assert.equal(run.results[0]!.competitor_id, wf)
  const lexi = scanCandidates(ws).records.find((r) => r.display_name === 'LexiLoop')!
  assert.equal(lexi.source, 'seo_interview')
  assert.equal(lexi.status, 'candidate')
  assert.equal(lexi.domain_claim, null)
  assert.deepEqual(lexi.markets, [])
  assert.equal(scanCandidates(ws).records.find((r) => r.competitor_id === wf)!.display_name, 'WordFlight', 'existing record untouched')
  assert.deepEqual(importSeoNames(ws).results.map((r) => r.outcome), ['exists', 'exists', 'exists'], 'idempotent')
  assert.equal(fs.readFileSync(interviewFile, 'utf8'), interviewBefore, 'the SEO interview is only read')
})
