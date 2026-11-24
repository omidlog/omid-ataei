import type { KnowledgeWorkspace } from '../knowledge/workspace.js'
import { canonicalJson, sha256Hex } from '../strategy/model.js'
import { DIMENSION_LABELS, fill, GAP_TEXT, PROHIBITED_TEXT, type CompetitiveLang } from './i18n.js'
import { buildLandscape, priceComparison, type CandidateView, type CellState, type Gap, type Landscape, type LandscapeOptions, type ObservationView, type PriceRow } from './landscape.js'
import { CompetitiveError, oneOf, PURPOSE_DIMENSIONS, PURPOSES, validateMarkets, type Dimension, type Purpose } from './model.js'

/**
 * CompetitiveContext (Identity Slice C): one read-only, deterministic projection of the landscape for one purpose.
 *
 * Marketing, pricing, SEO and identity drafts all read this, so they share the same competitor ids, the same cited
 * refs and the same ref states; there is no second store and no copied quote. It is built on `buildLandscape` and
 * filtered by `PURPOSE_DIMENSIONS` and, optionally, one market. When nothing usable exists the state says so
 * (`missing`, `candidate_only`, `evidence_insufficient`) instead of returning empty lists that would read as "no
 * competitors". It runs only in the owner's process (the store refuses agent tokens) and authorizes nothing.
 */

export const CONTEXT_SCHEMA = 'brand-os.competitive-context/1'

export type ContextState = 'missing' | 'candidate_only' | 'evidence_insufficient' | 'evidence_available'

/** Cells a draft may build on. Historical, conflicting and needs_review are shown, never used as current. */
export const USABLE_CELLS: readonly CellState[] = ['observed', 'unverified', 'hypothesis']

/** What each purpose's drafts must never infer. `brand_decision` applies to every purpose. */
export const PURPOSE_PROHIBITED: Record<Purpose, string[]> = {
  identity: ['legal_clearance', 'brand_decision'],
  positioning: ['ad_performance', 'brand_decision'],
  marketing: ['ad_performance', 'private_commercials', 'brand_decision'],
  pricing: ['private_commercials', 'currency_conversion', 'price_coordination', 'brand_decision'],
  seo: ['search_rankings', 'ad_performance', 'brand_decision'],
  expansion: ['private_commercials', 'brand_decision'],
}

export interface ContextObservation {
  competitor_id: string
  competitor_name: string
  observation_id: string
  dimension: Dimension
  statement_kind: ObservationView['statement_kind']
  label: string
  /** `knowledge:kn_…@<sha256>`: the research note and revision this observation cites. */
  ref: string
  note_id: string
  revision: string
  claim_key: string
  observed_at: string
  ref_state: ObservationView['ref_state']
  source_class: ObservationView['source_class']
  trust: ObservationView['trust']
  cell: CellState
  verified: boolean
  conflict: boolean
  /** True for observed, unverified (labelled) and hypothesis cells. Everything else is listed as unresolved. */
  usable: boolean
  price: ObservationView['price']
}

export interface ContextCompetitor {
  competitor_id: string
  display_name: string
  relationship: CandidateView['relationship']
  geographic_relevance: CandidateView['geographic_relevance']
  markets: string[]
  source: CandidateView['source']
  assessment: CandidateView['assessment']
  official_domain: string | null
  domain_state: CandidateView['domain_state']
  /** How the candidate relates to the requested market. `unfiltered` when no market was given. */
  market_match: 'unfiltered' | 'listed' | 'global' | 'unknown'
  observation_ids: string[]
}

export interface ResearchStep {
  code: 'record_source' | 'refresh_source' | 'resolve_conflict' | 'verify_domain' | 'classify' | 'enable_research' | 'approve_target_market' | 'add_candidates' | 'search_evidence'
  competitor_id: string | null
  dimension: Dimension | null
  text: string
}

export interface CompetitiveContext {
  schema: typeof CONTEXT_SCHEMA
  brand_slug: string
  generated_at: string
  lang: CompetitiveLang
  purpose: Purpose
  dimensions: Dimension[]
  market: string | null
  research: Landscape['research']
  target_market: Landscape['target_market']
  state: ContextState
  competitors: ContextCompetitor[]
  observations: ContextObservation[]
  conflicts: Array<{ competitor_id: string; dimension: Dimension; observation_ids: string[] }>
  freshness: { usable: number; historical: number; needs_review: number; conflicting: number; oldest_observed_at: string | null; newest_observed_at: string | null }
  /** Present when the purpose looks at public prices. Listed, never ranked, never converted. */
  prices: Landscape['prices'] | null
  gaps: Gap[]
  next_research: ResearchStep[]
  /** Every cited ref, deduplicated and sorted. */
  source_refs: string[]
  /** sha256 over the cited refs, their states and the target-market revision. Changes when a cited source changes. */
  source_digest: string
  prohibited_inferences: Array<{ code: string; text: string }>
  /** Archived candidates and candidates outside the requested market. Counted, not listed. */
  excluded_candidates: number
  authorizes: []
}

export interface ContextOptions extends LandscapeOptions {
  /** One country code (TR, US…) or GLOBAL. Candidates with no market stay in, marked `unknown`. */
  market?: string | null
}

const STEP_OF: Record<string, ResearchStep['code']> = {
  dimension_unknown: 'record_source',
  evidence_needs_review: 'refresh_source',
  evidence_conflicting: 'resolve_conflict',
  identity_unverified: 'verify_domain',
  relationship_unknown: 'classify',
  research_unavailable: 'enable_research',
  target_market_unapproved: 'approve_target_market',
  no_candidates: 'add_candidates',
  seo_needs_search_evidence: 'search_evidence',
}

/** Landscape gaps that are recomputed here for the purpose (dimension, price and scope gaps). */
const RECOMPUTED = new Set(['dimension_unknown', 'prices_not_comparable', 'scope_not_set', 'seo_needs_search_evidence', 'no_candidates'])

function marketMatch(markets: string[], market: string | null): ContextCompetitor['market_match'] | null {
  if (!market) return 'unfiltered'
  if (!markets.length) return 'unknown'
  if (markets.includes(market)) return 'listed'
  if (markets.includes('GLOBAL')) return 'global'
  return null
}

/** The purpose projection of the owner's landscape. Pure for the same records, notes, clock and capability. */
export function getCompetitiveContext(ws: KnowledgeWorkspace, purpose: Purpose, opts: ContextOptions): CompetitiveContext {
  const chosen = oneOf(purpose, PURPOSES, 'purpose')
  let market: string | null = null
  if (opts.market) {
    const markets = validateMarkets(opts.market)
    if (markets.length !== 1) throw new CompetitiveError('invalid_input', 'Give one market (TR, US…) or GLOBAL.')
    market = markets[0]!
  }
  const view = buildLandscape(ws, opts)
  const lang = view.lang
  const dimensions = PURPOSE_DIMENSIONS[chosen]
  const t = (code: string, vars: Record<string, string> = {}) => fill(GAP_TEXT[code]![lang], vars)

  const competitors: ContextCompetitor[] = []
  const observations: ContextObservation[] = []
  let excluded = 0
  for (const c of view.candidates) {
    const match = c.status === 'archived' ? null : marketMatch(c.markets, market)
    if (!match) {
      excluded += 1
      continue
    }
    const mine = c.observations.filter((o) => dimensions.includes(o.dimension) && (!market || !o.price || o.price.market === market))
    competitors.push({
      competitor_id: c.competitor_id,
      display_name: c.display_name,
      relationship: c.relationship,
      geographic_relevance: c.geographic_relevance,
      markets: c.markets,
      source: c.source,
      assessment: c.assessment,
      official_domain: c.official_domain,
      domain_state: c.domain_state,
      market_match: match,
      observation_ids: mine.map((o) => o.observation_id),
    })
    for (const o of mine) {
      observations.push({
        competitor_id: c.competitor_id,
        competitor_name: c.display_name,
        observation_id: o.observation_id,
        dimension: o.dimension,
        statement_kind: o.statement_kind,
        label: o.label,
        ref: o.evidence.ref,
        note_id: o.evidence.note_id,
        revision: o.evidence.revision,
        claim_key: o.evidence.claim_key,
        observed_at: o.evidence.observed_at,
        ref_state: o.ref_state,
        source_class: o.source_class,
        trust: o.trust,
        cell: o.cell,
        verified: o.verified,
        conflict: o.conflict,
        usable: USABLE_CELLS.includes(o.cell),
        price: o.price,
      })
    }
  }
  const included = new Set(competitors.map((c) => c.competitor_id))

  // Gaps: keep the landscape's brand-wide and per-candidate gaps for included candidates and purpose dimensions;
  // recompute the dimension, price and SEO gaps for this purpose (the landscape scopes them to the owner's scope).
  const gaps: Gap[] = view.gaps.filter((g) => !RECOMPUTED.has(g.code) && (!g.competitor_id || included.has(g.competitor_id)) && (!g.dimension || dimensions.includes(g.dimension)))
  if (!competitors.length) gaps.push({ code: 'no_candidates', competitor_id: null, dimension: null, text: t('no_candidates') })
  if (chosen === 'seo') gaps.push({ code: 'seo_needs_search_evidence', competitor_id: null, dimension: null, text: t('seo_needs_search_evidence') })
  const conflicts: CompetitiveContext['conflicts'] = []
  for (const c of competitors) {
    for (const d of dimensions) {
      const cell = view.matrix.find((m) => m.competitor_id === c.competitor_id && m.dimension === d)
      const inDim = observations.filter((o) => o.competitor_id === c.competitor_id && o.dimension === d)
      if (!inDim.length) gaps.push({ code: 'dimension_unknown', competitor_id: c.competitor_id, dimension: d, text: t('dimension_unknown', { name: c.display_name, dimension: DIMENSION_LABELS[d][lang] }) })
      if (cell?.state === 'conflicting') conflicts.push({ competitor_id: c.competitor_id, dimension: d, observation_ids: inDim.filter((o) => o.conflict).map((o) => o.observation_id) })
    }
  }

  let prices: CompetitiveContext['prices'] = null
  if (dimensions.includes('public_price')) {
    const rows: PriceRow[] = view.prices.rows.filter((row) => included.has(row.competitor_id) && (!market || row.market === market))
    const comparison = priceComparison(rows)
    prices = { rows, comparison: comparison.comparison, reasons: comparison.reasons, ranked: false, currency_conversion: 'none' }
    if (comparison.comparison === 'not_comparable') gaps.push({ code: 'prices_not_comparable', competitor_id: null, dimension: 'public_price', text: t('prices_not_comparable', { reason: comparison.reasons.join(', ') }) })
  }

  const usable = observations.filter((o) => o.usable)
  const state: ContextState = !competitors.length ? 'missing' : !usable.length ? 'candidate_only' : gaps.some((g) => g.code === 'dimension_unknown') ? 'evidence_insufficient' : 'evidence_available'
  const dates = observations.map((o) => o.observed_at).sort()
  const source_refs = [...new Set(observations.map((o) => o.ref))].sort()
  const source_digest = sha256Hex(
    canonicalJson({
      purpose: chosen,
      market,
      target: view.target_market.revision,
      refs: observations.map((o) => [o.observation_id, o.ref, o.claim_key, o.ref_state, o.cell]).sort(),
    }),
  )

  return {
    schema: CONTEXT_SCHEMA,
    brand_slug: view.brand_slug,
    generated_at: view.generated_at,
    lang,
    purpose: chosen,
    dimensions,
    market,
    research: view.research,
    target_market: view.target_market,
    state,
    competitors,
    observations,
    conflicts,
    freshness: {
      usable: usable.length,
      historical: observations.filter((o) => o.cell === 'historical').length,
      needs_review: observations.filter((o) => o.cell === 'needs_review').length,
      conflicting: observations.filter((o) => o.cell === 'conflicting').length,
      oldest_observed_at: dates[0] ?? null,
      newest_observed_at: dates[dates.length - 1] ?? null,
    },
    prices,
    gaps,
    next_research: gaps.filter((g) => STEP_OF[g.code]).map((g) => ({ code: STEP_OF[g.code]!, competitor_id: g.competitor_id, dimension: g.dimension, text: g.text })),
    source_refs,
    source_digest,
    prohibited_inferences: PURPOSE_PROHIBITED[chosen].map((code) => ({ code, text: PROHIBITED_TEXT[code]![lang] })),
    excluded_candidates: excluded,
    authorizes: [],
  }
}
