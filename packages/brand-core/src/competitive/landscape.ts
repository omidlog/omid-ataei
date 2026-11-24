import { readFacts } from '../facts.js'
import { knowledgeRef } from '../knowledge/proposals.js'
import type { KnowledgeWorkspace } from '../knowledge/workspace.js'
import { hostOf, type AdapterCapability } from '../research/model.js'
import { evidenceFor, loadEvidence, type EvidenceItem, type EvidenceSet } from '../research/store.js'
import { DIMENSION_LABELS, fill, GAP_TEXT, PROHIBITED_TEXT, REVIEW_REASONS, type CompetitiveLang } from './i18n.js'
import {
  DIMENSIONS,
  hostMatchesDomain,
  LANDSCAPE_SCHEMA,
  priceCaveats,
  PURPOSE_DIMENSIONS,
  type Assessment,
  type CompetitorRecord,
  type Dimension,
  type EvidenceRef,
  type Observation,
  type PriceObservation,
  type Purpose,
} from './model.js'
import { readScope, scanCandidates } from './store.js'

/**
 * The landscape: a deterministic, provenance-aware read of the competitor index against the Knowledge research notes
 * as they are now. Ref states reuse the Strategy Feed's vocabulary (a cited source that changed means review, not a
 * silent update) and the research store's staleness, supersession and conflict rules. Nothing here writes, fetches or
 * decides anything for the brand; `authorizes` is always empty.
 */

export const TARGET_MARKET_FACT = 'business.market.geography'

export type RefState = 'current' | 'stale' | 'changed' | 'superseded' | 'archived' | 'missing' | 'claim_missing'
/** What a matrix cell may say. Insufficient evidence stays unknown, unverified, historical or needs_review. */
export type CellState = 'observed' | 'unverified' | 'hypothesis' | 'historical' | 'conflicting' | 'needs_review' | 'unknown'
/** Who is speaking in the cited source, relative to this competitor. A company's own page shows what it claims. */
export type SourceClass = 'competitor_own_page' | 'platform_documentation' | 'independent_reporting' | 'analyst_inference' | 'owner_statement' | 'first_party_data'

export interface ObservationView {
  observation_id: string
  dimension: Dimension
  statement_kind: Observation['statement_kind']
  label: string
  evidence: EvidenceRef & { ref: string }
  ref_state: RefState
  source_class: SourceClass | null
  trust: EvidenceItem['trust']['level'] | null
  conflict: boolean
  cell: CellState
  /** True only for a current, fresh, quote-verified, unconflicted observed claim. */
  verified: boolean
  price: (PriceObservation & { caveats: string[] }) | null
}

export interface CandidateView {
  competitor_id: string
  display_name: string
  relationship: CompetitorRecord['relationship']
  geographic_relevance: CompetitorRecord['geographic_relevance']
  markets: string[]
  source: CompetitorRecord['source']
  status: CompetitorRecord['status']
  status_reason: string | null
  assessment: Assessment
  /** The claimed domain while a current source fetched from it verifies it; otherwise null. */
  official_domain: string | null
  domain_state: 'not_claimed' | 'unverified' | 'verified' | 'needs_review'
  observations: ObservationView[]
  needs_review: string[]
}

export interface MatrixCell {
  competitor_id: string
  dimension: Dimension
  state: CellState
  observation_ids: string[]
}

export interface Gap {
  code: string
  competitor_id: string | null
  dimension: Dimension | null
  text: string
}

export interface PriceRow {
  competitor_id: string
  observation_id: string
  offer_name: string
  amount: number
  currency: string
  market: string
  billing_period: PriceObservation['billing_period']
  billing_commitment: PriceObservation['billing_commitment']
  tax_inclusion: PriceObservation['tax_inclusion']
  promotion: PriceObservation['promotion']
  observed_at: string
  cell: CellState
  caveats: string[]
}

export interface Landscape {
  schema: typeof LANDSCAPE_SCHEMA
  brand_slug: string
  generated_at: string
  lang: CompetitiveLang
  research: { adapter: string; state: AdapterCapability['state']; mode: AdapterCapability['mode']; reason: string | null }
  scope: { purposes: Purpose[]; dimensions: Dimension[]; set: boolean }
  /** The approved fact geography is judged against, by id and revision. Its value is not copied here. */
  target_market: { fact_id: string; state: 'approved' | 'missing'; revision: string | null }
  state: 'no_candidates' | 'candidate_only' | 'evidence_insufficient' | 'evidence_available'
  candidates: CandidateView[]
  matrix: MatrixCell[]
  prices: { rows: PriceRow[]; comparison: 'none' | 'single' | 'not_comparable' | 'terms_match'; reasons: string[]; ranked: false; currency_conversion: 'none' }
  gaps: Gap[]
  prohibited_inferences: Array<{ code: string; text: string }>
  skipped_files: number
  authorizes: []
}

export function refState(evidence: EvidenceSet, ref: EvidenceRef): { state: RefState; item: EvidenceItem | null } {
  const item = evidence.items.find((candidate) => candidate.note.id === ref.note_id) ?? null
  if (!item) return { state: 'missing', item }
  if (item.archived) return { state: 'archived', item }
  if (item.superseded_by) return { state: 'superseded', item }
  if (item.note.revision !== ref.revision) return { state: 'changed', item }
  if (!item.source.excerpts.some((excerpt) => excerpt.claim_key === ref.claim_key && excerpt.stance === 'supports')) return { state: 'claim_missing', item }
  if (item.staleness.state === 'stale') return { state: 'stale', item }
  return { state: 'current', item }
}

export function sourceClass(item: EvidenceItem, domain: string | null): SourceClass {
  const type = item.source.source_type
  if (type === 'owner_testimony') return 'owner_statement'
  if (type === 'first_party_data') return 'first_party_data'
  if (type === 'official_policy' || type === 'official_product_docs') return 'platform_documentation'
  if (domain && hostMatchesDomain(hostOf(item.source.final_url), domain)) return 'competitor_own_page'
  if (type === 'expert_opinion') return 'analyst_inference'
  return 'independent_reporting'
}

/** Two current prices for the same offer, market and terms that disagree: both stay, flagged. */
function priceConflicts(observations: Observation[], usable: Set<string>): Set<string> {
  const out = new Set<string>()
  const priced = observations.filter((item) => item.price && usable.has(item.observation_id))
  for (const a of priced) {
    for (const b of priced) {
      if (a === b) continue
      const pa = a.price!
      const pb = b.price!
      const sameTerms = pa.offer_name.toLowerCase() === pb.offer_name.toLowerCase() && pa.market === pb.market && pa.currency === pb.currency && pa.billing_period === pb.billing_period && pa.billing_commitment === pb.billing_commitment
      if (sameTerms && pa.amount !== pb.amount) out.add(a.observation_id)
    }
  }
  return out
}

function viewObservations(record: CompetitorRecord, evidence: EvidenceSet): ObservationView[] {
  const states = new Map(record.observations.map((item) => [item.observation_id, refState(evidence, item.evidence)]))
  const usable = new Set(record.observations.filter((item) => states.get(item.observation_id)!.state === 'current').map((item) => item.observation_id))
  const priceClash = priceConflicts(record.observations, usable)
  return record.observations.map((item) => {
    const { state, item: source } = states.get(item.observation_id)!
    const claim = evidenceFor(evidence, item.evidence.claim_key)
    const conflict = claim.contradicting.length > 0 || priceClash.has(item.observation_id)
    let cell: CellState
    if (state !== 'current' && state !== 'stale') cell = 'needs_review'
    else if (conflict) cell = 'conflicting'
    else if (state === 'stale') cell = 'historical'
    else if (item.statement_kind === 'inference') cell = 'hypothesis'
    else if (!source!.source.quotes_verified || !source!.source.content_sha256) cell = 'unverified'
    else cell = 'observed'
    return {
      observation_id: item.observation_id,
      dimension: item.dimension,
      statement_kind: item.statement_kind,
      label: item.label,
      evidence: { ...item.evidence, ref: knowledgeRef(item.evidence.note_id, item.evidence.revision) },
      ref_state: state,
      source_class: source ? sourceClass(source, record.domain_claim) : null,
      trust: source ? source.trust.level : null,
      conflict,
      cell,
      verified: cell === 'observed',
      price: item.price ? { ...item.price, caveats: priceCaveats(item.price) } : null,
    }
  })
}

function domainState(record: CompetitorRecord, evidence: EvidenceSet): CandidateView['domain_state'] {
  if (!record.domain_claim) return 'not_claimed'
  if (!record.domain_evidence) return 'unverified'
  const { state, item } = refState(evidence, record.domain_evidence)
  if ((state !== 'current' && state !== 'stale') || !item) return 'needs_review'
  const hosts = [hostOf(item.source.url), hostOf(item.source.final_url)]
  return hosts.every((host) => hostMatchesDomain(host, record.domain_claim!)) ? 'verified' : 'needs_review'
}

const CELL_RANK: CellState[] = ['conflicting', 'observed', 'hypothesis', 'unverified', 'historical', 'needs_review']

function cellOf(views: ObservationView[]): CellState {
  if (!views.length) return 'unknown'
  for (const state of CELL_RANK) if (views.some((view) => view.cell === state)) return state
  return 'unknown'
}

function assessmentOf(record: CompetitorRecord, views: ObservationView[]): Assessment {
  if (record.status === 'archived' || record.status === 'disputed') return record.status
  if (views.some((view) => view.cell === 'needs_review' || view.cell === 'historical')) return 'needs_refresh'
  if (record.status === 'owner_reviewed') return 'owner_reviewed'
  return views.length ? 'researched' : 'candidate'
}

/** Comparability of a set of price rows. Also used by the purpose projection on a market-filtered subset. */
export function priceComparison(rows: PriceRow[]): { comparison: Landscape['prices']['comparison']; reasons: string[] } {
  const current = rows.filter((row) => row.cell === 'observed' || row.cell === 'unverified')
  if (rows.length === 0) return { comparison: 'none', reasons: [] }
  if (rows.length === 1) return { comparison: 'single', reasons: [] }
  const reasons = new Set<string>()
  if (current.length < rows.length) reasons.add('some_prices_not_current')
  const distinct = (pick: (row: PriceRow) => string) => new Set(rows.map(pick)).size > 1
  if (distinct((row) => row.currency)) reasons.add('different_currencies')
  if (distinct((row) => row.market)) reasons.add('different_markets')
  if (distinct((row) => row.billing_period)) reasons.add('different_billing_periods')
  if (distinct((row) => row.billing_commitment)) reasons.add('different_commitments')
  for (const row of rows) for (const caveat of row.caveats) reasons.add(caveat)
  return reasons.size ? { comparison: 'not_comparable', reasons: [...reasons].sort() } : { comparison: 'terms_match', reasons: [] }
}

export interface LandscapeOptions {
  now?: Date
  lang?: CompetitiveLang
  /** The research adapter's capability for this run (selectAdapter(...).capability()). Never probed here. */
  capability: AdapterCapability
}

/** The owner's landscape: candidates, matrix, prices (listed, never ranked), gaps and prohibited inferences. */
export function buildLandscape(ws: KnowledgeWorkspace, opts: LandscapeOptions): Landscape {
  const now = opts.now ?? ws.now()
  const lang = opts.lang ?? 'en'
  const t = (code: string, vars: Record<string, string> = {}) => fill(GAP_TEXT[code]![lang], vars)
  const dim = (d: Dimension) => DIMENSION_LABELS[d][lang]
  const scan = scanCandidates(ws)
  const evidence = loadEvidence(ws, { now })
  const scope = readScope(ws)
  const purposes = scope?.purposes ?? []
  const dimensions = purposes.length ? DIMENSIONS.filter((d) => purposes.some((p) => PURPOSE_DIMENSIONS[p].includes(d))) : [...DIMENSIONS]
  const fact = readFacts(ws.root, 'approved', ws.brandSlug)[TARGET_MARKET_FACT]
  const targetApproved = Boolean(fact && fact.status === 'approved' && fact.revision_hash)

  const gaps: Gap[] = []
  const gap = (code: string, vars: Record<string, string> = {}, competitor: string | null = null, dimension: Dimension | null = null) => gaps.push({ code, competitor_id: competitor, dimension, text: t(code, vars) })
  if (opts.capability.state !== 'available') gap('research_unavailable', { reason: opts.capability.reason ?? 'unavailable' })
  if (!scope) gap('scope_not_set')
  if (!targetApproved) gap('target_market_unapproved')
  if (purposes.includes('seo')) gap('seo_needs_search_evidence')

  const candidates: CandidateView[] = []
  const matrix: MatrixCell[] = []
  const priceRows: PriceRow[] = []
  const active = scan.records.filter((record) => record.status !== 'archived')
  if (!active.length) gap('no_candidates')

  for (const record of scan.records) {
    const views = viewObservations(record, evidence)
    const domain = domainState(record, evidence)
    const needs: string[] = []
    const vars = { name: record.display_name }
    const isActive = record.status !== 'archived'
    if (isActive && !record.relationship.length) {
      gap('relationship_unknown', vars, record.competitor_id)
      needs.push(t('relationship_unknown', vars))
    }
    if (isActive && domain !== 'verified') {
      gap('identity_unverified', vars, record.competitor_id)
      needs.push(t('identity_unverified', vars))
    }
    if (isActive && record.distinct_from.length) needs.push(t('same_name_other_market', vars))
    for (const view of views) {
      if (!isActive) break
      if (view.cell === 'needs_review' || view.cell === 'historical') {
        const text = t('evidence_needs_review', { ...vars, dimension: dim(view.dimension), note: view.evidence.note_id, reason: REVIEW_REASONS[view.ref_state]![lang] })
        gaps.push({ code: 'evidence_needs_review', competitor_id: record.competitor_id, dimension: view.dimension, text })
        needs.push(text)
      }
    }
    for (const d of DIMENSIONS) {
      const inDim = views.filter((view) => view.dimension === d)
      const state = cellOf(inDim)
      matrix.push({ competitor_id: record.competitor_id, dimension: d, state, observation_ids: inDim.map((view) => view.observation_id) })
      if (!isActive) continue
      if (state === 'conflicting') {
        const text = t('evidence_conflicting', { ...vars, dimension: dim(d) })
        gaps.push({ code: 'evidence_conflicting', competitor_id: record.competitor_id, dimension: d, text })
        needs.push(text)
      }
      if (state === 'unknown' && dimensions.includes(d)) gap('dimension_unknown', { ...vars, dimension: dim(d) }, record.competitor_id, d)
    }
    if (isActive) {
      for (const view of views) {
        if (!view.price) continue
        const { caveats, ...price } = view.price
        priceRows.push({
          competitor_id: record.competitor_id,
          observation_id: view.observation_id,
          offer_name: price.offer_name,
          amount: price.amount,
          currency: price.currency,
          market: price.market,
          billing_period: price.billing_period,
          billing_commitment: price.billing_commitment,
          tax_inclusion: price.tax_inclusion,
          promotion: price.promotion,
          observed_at: view.evidence.observed_at,
          cell: view.cell,
          caveats: view.cell === 'historical' ? [...caveats, 'historical'] : caveats,
        })
      }
    }
    candidates.push({
      competitor_id: record.competitor_id,
      display_name: record.display_name,
      relationship: record.relationship,
      geographic_relevance: record.geographic_relevance,
      markets: record.markets,
      source: record.source,
      status: record.status,
      status_reason: record.status_reason,
      assessment: assessmentOf(record, views),
      official_domain: domain === 'verified' ? record.domain_claim : null,
      domain_state: domain,
      observations: views,
      needs_review: needs,
    })
  }

  const prices = priceComparison(priceRows)
  if (prices.comparison === 'not_comparable') gap('prices_not_comparable', { reason: prices.reasons.join(', ') })

  const usable = candidates.filter((c) => c.status !== 'archived').flatMap((c) => c.observations).filter((v) => v.cell === 'observed' || v.cell === 'unverified' || v.cell === 'hypothesis')
  const unknownInScope = gaps.some((g) => g.code === 'dimension_unknown')
  const state: Landscape['state'] = !active.length ? 'no_candidates' : !usable.length ? 'candidate_only' : unknownInScope ? 'evidence_insufficient' : 'evidence_available'

  return {
    schema: LANDSCAPE_SCHEMA,
    brand_slug: ws.brandSlug,
    generated_at: now.toISOString(),
    lang,
    research: { adapter: opts.capability.adapter, state: opts.capability.state, mode: opts.capability.mode, reason: opts.capability.reason },
    scope: { purposes, dimensions, set: Boolean(scope) },
    target_market: { fact_id: TARGET_MARKET_FACT, state: targetApproved ? 'approved' : 'missing', revision: targetApproved ? fact!.revision_hash! : null },
    state,
    candidates,
    matrix,
    prices: { rows: priceRows, comparison: prices.comparison, reasons: prices.reasons, ranked: false, currency_conversion: 'none' },
    gaps,
    prohibited_inferences: Object.entries(PROHIBITED_TEXT).map(([code, text]) => ({ code, text: text[lang] })),
    skipped_files: scan.skipped.length,
    authorizes: [],
  }
}
