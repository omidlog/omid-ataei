import fs from 'node:fs'
import path from 'node:path'
import { readFacts } from '../facts.js'
import { readYaml } from '../fsutil.js'
import { readIdentityIntake, type IdentityChoice } from '../identity-intake.js'
import type { KnowledgeWorkspace } from '../knowledge/workspace.js'
import { getCompetitiveContext, type CompetitiveContext, type ContextObservation, type ContextOptions, type ResearchStep } from './context.js'
import { fill, type CompetitiveLang } from './i18n.js'
import type { Gap, PriceRow } from './landscape.js'
import { ALTERNATIVES, DEPENDENCIES, NOT_KNOWN, PROPOSE_EDIT, WARNINGS } from './memo-i18n.js'
import { nameKey, oneOf, type Purpose } from './model.js'
import { seoNamedCompetitors } from './seo-bridge.js'

/**
 * The four Slice C drafts. Each one reads the same CompetitiveContext (same competitor ids, same cited refs, same
 * ref states) and the owner's approved decisions by fact id and revision. None of them copies a quote or a fact
 * value, writes a file, sets a price, edits a plan or decides for the brand: `status: draft`, `authorizes: []`.
 * Unusable evidence (conflicting, historical, needs_review) is listed under `unresolved`, never used as current.
 */

export const MEMO_SCHEMA = 'brand-os.competitive-memo/1'
export const MEMO_KINDS = ['marketing_opportunity_memo', 'pricing_benchmark_memo', 'seo_competitor_supplement', 'visual_landscape_assessment'] as const
export type MemoKind = (typeof MEMO_KINDS)[number]
export const MEMO_PURPOSES = ['marketing', 'pricing', 'seo', 'identity'] as const
export type MemoPurpose = (typeof MEMO_PURPOSES)[number]

/** Approved owner decisions each draft is read against. Cited by id and revision; the value is never copied. Budgets are never read. */
export const MEMO_FACTS: Record<MemoPurpose, string[]> = {
  marketing: ['business.marketing.objective', 'business.marketing.channels', 'business.marketing.pillars', 'business.customer.primary_segment', 'brand.strategy.differentiation', 'business.marketing.availability_claim'],
  pricing: ['business.sales.pricing', 'business.model.revenue', 'business.offer.value_proposition', 'business.market.geography'],
  seo: ['business.market.geography', 'brand.strategy.differentiation'],
  identity: ['brand.strategy.differentiation', 'business.customer.primary_segment', 'brand.logo.variants', 'brand.logo.masters'],
}

/** Fields a draft may suggest changing, through the existing propose → review → approve flow only. */
const EDITABLE: Record<MemoPurpose, string[]> = {
  marketing: ['business.marketing.channels', 'business.marketing.pillars', 'brand.strategy.differentiation'],
  pricing: ['business.sales.pricing'],
  seo: ['seo.competitors.named'],
  identity: ['brand.logo.*'],
}

const NOT_KNOWN_BY: Record<MemoPurpose, string[]> = {
  marketing: ['ad_spend', 'conversion', 'revenue', 'targeting', 'effectiveness'],
  pricing: ['price_paid', 'costs', 'revenue', 'willingness_to_pay', 'fx_tax'],
  seo: ['rankings', 'keyword_gaps', 'ai_visibility', 'revenue'],
  identity: ['legal_clearance', 'recognition', 'artwork', 'aesthetics'],
}

const KIND_OF: Record<MemoPurpose, MemoKind> = {
  marketing: 'marketing_opportunity_memo',
  pricing: 'pricing_benchmark_memo',
  seo: 'seo_competitor_supplement',
  identity: 'visual_landscape_assessment',
}

export interface FactCitation {
  fact_id: string
  state: 'approved' | 'missing'
  revision: string | null
}

export interface Alternative {
  id: string
  title: string
  trade_off: string
  status: 'hypothesis'
  depends_on: string[]
  /** Observation ids this alternative is read against. Empty when it rests on gaps, not evidence. */
  cites: string[]
}

export interface UnresolvedItem {
  competitor_id: string
  competitor_name: string
  observation_id: string
  dimension: ContextObservation['dimension']
  cell: ContextObservation['cell']
  ref_state: ContextObservation['ref_state']
  ref: string
}

export interface MemoBase {
  schema: typeof MEMO_SCHEMA
  kind: MemoKind
  status: 'draft'
  brand_slug: string
  generated_at: string
  lang: CompetitiveLang
  purpose: MemoPurpose
  market: string | null
  context: { state: CompetitiveContext['state']; source_digest: string; research_state: CompetitiveContext['research']['state'] }
  owner_inputs: FactCitation[]
  observations: ContextObservation[]
  unresolved: UnresolvedItem[]
  alternatives: Alternative[]
  warnings: Array<{ code: string; observation_id: string | null; text: string }>
  not_known: Array<{ code: string; text: string }>
  proposed_edits: Array<{ field: string; text: string }>
  gaps: Gap[]
  next_research: ResearchStep[]
  source_refs: string[]
  prohibited_inferences: CompetitiveContext['prohibited_inferences']
  authorizes: []
}

export interface PricingRow extends PriceRow {
  competitor_name: string
  ref: string
  source_class: ContextObservation['source_class']
  feature_scope: string | null
  /** What this number is: an advertised price, never what customers pay. */
  price_kind: 'publicly_advertised'
  /** How to read the number. Only `standard_rate` is a standard price at the stated terms. */
  rate_label: 'standard_rate' | 'promotional' | 'promotion_unknown' | 'monthly_rate_billed_annually' | 'terms_unknown'
  status: 'current' | 'historical' | 'needs_review' | 'conflicting'
  business_model: 'unknown'
}

export type CompetitiveMemo =
  | (MemoBase & { kind: 'marketing_opportunity_memo' })
  | (MemoBase & { kind: 'pricing_benchmark_memo'; prices: { rows: PricingRow[]; comparison: string; reasons: string[]; ranked: false; currency_conversion: 'none'; priced_recommendation: false } })
  | (MemoBase & {
      kind: 'seo_competitor_supplement'
      owner_named: Array<{ name: string; status: 'unverified_owner_assumption'; competitor_id: string | null }>
      search_evidence: { rankings: 'unverified'; keyword_gaps: 'unverified' }
      seo_interview: 'read' | 'not_answered' | 'unreadable'
    })
  | (MemoBase & {
      kind: 'visual_landscape_assessment'
      visual_comparison: 'available' | 'unavailable'
      similarity: 'not_assessed'
      intake: { state: 'recorded' | 'not_recorded' | 'invalid'; choice: IdentityChoice; authority: 'unapproved_owner_intake' }
    })

export interface MemoOptions extends ContextOptions {
  /** The brand's identity intake hint, if the caller already read it. Otherwise read from brand.config.yaml. */
  identityIntake?: ReturnType<typeof readIdentityIntake>
}

function cite(ws: KnowledgeWorkspace, ids: string[]): FactCitation[] {
  const facts = readFacts(ws.root, 'approved', ws.brandSlug)
  return ids.map((id) => {
    const fact = facts[id]
    const approved = Boolean(fact && fact.status === 'approved' && fact.revision_hash)
    return { fact_id: id, state: approved ? 'approved' : 'missing', revision: approved ? fact!.revision_hash! : null }
  })
}

function alternative(id: string, lang: CompetitiveLang, depends_on: string[], cites: string[]): Alternative {
  const entry = ALTERNATIVES[id]!
  return { id, title: entry.title[lang], trade_off: entry.trade_off[lang], status: 'hypothesis', depends_on, cites }
}

function base(ws: KnowledgeWorkspace, purpose: MemoPurpose, ctx: CompetitiveContext): MemoBase {
  const lang = ctx.lang
  return {
    schema: MEMO_SCHEMA,
    kind: KIND_OF[purpose],
    status: 'draft',
    brand_slug: ctx.brand_slug,
    generated_at: ctx.generated_at,
    lang,
    purpose,
    market: ctx.market,
    context: { state: ctx.state, source_digest: ctx.source_digest, research_state: ctx.research.state },
    owner_inputs: cite(ws, MEMO_FACTS[purpose]),
    observations: ctx.observations.filter((o) => o.usable),
    unresolved: ctx.observations
      .filter((o) => !o.usable)
      .map((o) => ({ competitor_id: o.competitor_id, competitor_name: o.competitor_name, observation_id: o.observation_id, dimension: o.dimension, cell: o.cell, ref_state: o.ref_state, ref: o.ref })),
    alternatives: [],
    warnings: [],
    not_known: NOT_KNOWN_BY[purpose].map((code) => ({ code, text: NOT_KNOWN[code]![lang] })),
    proposed_edits: EDITABLE[purpose].map((field) => ({ field, text: fill(PROPOSE_EDIT[lang], { field }) })),
    gaps: ctx.gaps,
    next_research: ctx.next_research,
    source_refs: ctx.source_refs,
    prohibited_inferences: ctx.prohibited_inferences,
    authorizes: [],
  }
}

function marketingMemo(ws: KnowledgeWorkspace, ctx: CompetitiveContext): CompetitiveMemo {
  const memo = base(ws, 'marketing', ctx)
  const lang = ctx.lang
  const messages = memo.observations.filter((o) => o.dimension === 'public_message' || o.dimension === 'audience').map((o) => o.observation_id)
  const channels = memo.observations.filter((o) => o.dimension === 'observable_channels').map((o) => o.observation_id)
  memo.alternatives.push(alternative('differentiate', lang, ['brand.strategy.differentiation', 'business.marketing.objective'], messages))
  memo.alternatives.push(alternative('match_with_proof', lang, ['business.customer.primary_segment', 'business.marketing.availability_claim'], messages))
  if (channels.length) memo.alternatives.push(alternative('channel_test', lang, ['business.marketing.channels', 'business.marketing.objective'], channels))
  if (ctx.state !== 'evidence_available') memo.alternatives.push(alternative('gather_evidence', lang, [], []))
  return { ...memo, kind: 'marketing_opportunity_memo' }
}

/** How to read one public price. Shared with the competitor share path (V2.2). */
export function rateLabel(row: Pick<PriceRow, 'promotion' | 'billing_commitment' | 'billing_period'>): PricingRow['rate_label'] {
  if (row.promotion === 'promotional') return 'promotional'
  if (row.promotion === 'unknown') return 'promotion_unknown'
  if (row.billing_commitment === 'annual' && row.billing_period === 'month') return 'monthly_rate_billed_annually'
  if (row.billing_period === 'unknown' || row.billing_commitment === 'unknown') return 'terms_unknown'
  return 'standard_rate'
}

function rowStatus(row: PriceRow): PricingRow['status'] {
  if (row.cell === 'historical') return 'historical'
  if (row.cell === 'conflicting') return 'conflicting'
  if (row.cell === 'needs_review') return 'needs_review'
  return 'current'
}

function pricingMemo(ws: KnowledgeWorkspace, ctx: CompetitiveContext): CompetitiveMemo {
  const memo = base(ws, 'pricing', ctx)
  const lang = ctx.lang
  const byId = new Map(ctx.observations.map((o) => [o.observation_id, o]))
  const rows: PricingRow[] = (ctx.prices?.rows ?? []).map((row) => {
    const o = byId.get(row.observation_id)
    return { ...row, competitor_name: o?.competitor_name ?? row.competitor_id, ref: o?.ref ?? '', source_class: o?.source_class ?? null, feature_scope: o?.price?.feature_scope ?? null, price_kind: 'publicly_advertised', rate_label: rateLabel(row), status: rowStatus(row), business_model: 'unknown' }
  })
  const warn = (code: string, row: PricingRow | null) => memo.warnings.push({ code, observation_id: row?.observation_id ?? null, text: fill(WARNINGS[code]![lang], row ? { name: row.competitor_name, offer: row.offer_name, date: row.observed_at.slice(0, 10) } : {}) })
  if (!rows.some((row) => row.status === 'current')) warn('no_current_price', null)
  for (const row of rows) {
    if (row.status === 'historical') warn('historical_price', row)
    if (row.status === 'needs_review') warn('price_needs_review', row)
    if (row.status === 'conflicting') warn('price_conflicting', row)
    if (row.rate_label === 'promotional') warn('promotional_price', row)
    if (row.rate_label === 'promotion_unknown') warn('promotion_unknown', row)
    if (row.billing_commitment === 'annual' && row.billing_period === 'month') warn('monthly_rate_billed_annually', row)
  }
  const current = rows.filter((row) => row.status === 'current').map((row) => row.observation_id)
  const deps = ['costs', 'willingness_to_pay', 'customer_evidence', 'business_model'].map((d) => DEPENDENCIES[d]![lang])
  for (const id of ['value_based', 'tiered', 'premium', 'entry_level']) memo.alternatives.push(alternative(id, lang, deps, current))
  if (ctx.state !== 'evidence_available') memo.alternatives.push(alternative('gather_evidence', lang, [], []))
  return {
    ...memo,
    kind: 'pricing_benchmark_memo',
    prices: { rows, comparison: ctx.prices?.comparison ?? 'none', reasons: ctx.prices?.reasons ?? [], ranked: false, currency_conversion: 'none', priced_recommendation: false },
  }
}

function seoMemo(ws: KnowledgeWorkspace, ctx: CompetitiveContext): CompetitiveMemo {
  const memo = base(ws, 'seo', ctx)
  let names: string[] = []
  let state: 'read' | 'not_answered' | 'unreadable' = 'read'
  try {
    names = seoNamedCompetitors(ws)
    if (!names.length) state = 'not_answered'
  } catch {
    state = 'unreadable'
    memo.warnings.push({ code: 'seo_interview_unreadable', observation_id: null, text: WARNINGS.seo_interview_unreadable![ctx.lang] })
  }
  const index = new Map(ctx.competitors.map((c) => [nameKey(c.display_name), c.competitor_id]))
  const owner_named = names.map((name) => ({ name, status: 'unverified_owner_assumption' as const, competitor_id: index.get(nameKey(name)) ?? null }))
  return { ...memo, kind: 'seo_competitor_supplement', owner_named, search_evidence: { rankings: 'unverified', keyword_gaps: 'unverified' }, seo_interview: state }
}

function readIntake(ws: KnowledgeWorkspace): ReturnType<typeof readIdentityIntake> {
  const file = path.join(ws.root, 'brand', 'brand.config.yaml')
  try {
    return readIdentityIntake(fs.existsSync(file) ? readYaml<Parameters<typeof readIdentityIntake>[0]>(file) : null)
  } catch {
    return readIdentityIntake(null)
  }
}

function identityMemo(ws: KnowledgeWorkspace, ctx: CompetitiveContext, intake: ReturnType<typeof readIdentityIntake>): CompetitiveMemo {
  const memo = base(ws, 'identity', ctx)
  const lang = ctx.lang
  const visual = memo.observations.filter((o) => o.dimension === 'visual_language').map((o) => o.observation_id)
  const available = visual.length > 0
  if (!available) memo.warnings.push({ code: 'visual_unavailable', observation_id: null, text: WARNINGS.visual_unavailable![lang] })
  memo.warnings.push({ code: 'similarity_not_assessed', observation_id: null, text: WARNINGS.similarity_not_assessed![lang] })
  // The intake is a routing hint, not a decision: it only decides which routes are worth listing.
  const presence = intake.choice.logo_presence
  const routes = presence === 'absent' ? ['create'] : presence === 'unknown' ? ['create', 'retain_improve_guidelines', 'evolve', 'rebrand'] : ['retain_improve_guidelines', 'evolve', 'rebrand']
  for (const id of routes) memo.alternatives.push(alternative(id, lang, ['brand.strategy.differentiation'], visual))
  if (ctx.state !== 'evidence_available') memo.alternatives.push(alternative('gather_evidence', lang, [], []))
  return {
    ...memo,
    kind: 'visual_landscape_assessment',
    visual_comparison: available ? 'available' : 'unavailable',
    similarity: 'not_assessed',
    intake: { state: intake.state, choice: intake.choice, authority: 'unapproved_owner_intake' },
  }
}

/** A draft for one purpose. Reads only; same inputs, same output. */
export function buildCompetitiveMemo(ws: KnowledgeWorkspace, purpose: MemoPurpose | Purpose, opts: MemoOptions): CompetitiveMemo {
  const p = oneOf(purpose, MEMO_PURPOSES, 'purpose')
  const ctx = getCompetitiveContext(ws, p, opts)
  if (p === 'marketing') return marketingMemo(ws, ctx)
  if (p === 'pricing') return pricingMemo(ws, ctx)
  if (p === 'seo') return seoMemo(ws, ctx)
  return identityMemo(ws, ctx, opts.identityIntake ?? readIntake(ws))
}
