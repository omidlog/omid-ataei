import fs from 'node:fs'
import path from 'node:path'
import { safetyBlocksSharing, safetyReport } from '../knowledge/safety.js'
import { writeVaultFile, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import { hostOf, type AdapterCapability } from '../research/model.js'
import { loadEvidence, type EvidenceSet } from '../research/store.js'
import { buildLandscape, type CandidateView, type ObservationView, type SourceClass } from './landscape.js'
import { rateLabel } from './memos.js'
import {
  BILLING_COMMITMENTS,
  BILLING_PERIODS,
  COMPETITIVE_LIMITS,
  COMPETITOR_ID,
  CompetitiveError,
  GEOGRAPHIES,
  PROMOTIONS,
  RELATIONSHIPS,
  TAX_INCLUSIONS,
  validateDomain,
  type BillingCommitment,
  type BillingPeriod,
  type Dimension,
  type Geography,
  type Promotion,
  type Relationship,
  type TaxInclusion,
} from './model.js'
import { assertOwnerProcess, scanCandidates } from './store.js'
import {
  OWN_SUBJECT,
  PLACEMENT_STATES,
  placementOf,
  POSITION_BANDS,
  POSITION_STALE_DAYS,
  positioningLandscape,
  POSITIONING_LIMITS,
  type AxisDefinition,
  type LocalizedLabel,
  type PlacementState,
  type PositionBand,
} from './positioning.js'

/**
 * Competitor share path (Visual V2.2, owner decision D1).
 *
 * `brand:competitive share` is the only way competitor data leaves `brand/.private/competitive`. It writes one tracked
 * file, `brand/competitive/shared/landscape.json`, that the owner reviews, commits and merges like any other change.
 * Studio reads only that file (tar allowlist) and draws the comparison matrix and price strip from it.
 *
 * The file is an ALLOW-LIST projection of the landscape, rebuilt field by field:
 *
 * - Only competitors the owner marked `owner_reviewed`. Candidates, disputed and archived records are counted, never
 *   named.
 * - Per competitor: id, display name, relationship, geographic relevance, markets, and the domain only while a source
 *   verifies it.
 * - Per comparison criterion: a cell state, at most three short recorder labels, and source labels (who is speaking,
 *   the public host for web sources, the observation date). Inferences (hypotheses) are never shared.
 * - Public prices exactly as recorded: amount, currency, market, period, commitment, tax, promotion and a rate label.
 *   Never converted, never ranked.
 *
 * Never shared: quotes or excerpts, Knowledge note ids and revisions, claim keys, URLs and paths, status reasons,
 * claimed but unverified domains, same-name reasons, gap texts, the target-market fact, scope, research adapter state,
 * private (owner testimony, first-party) source hosts. A label that matches a recorded quote, or that the knowledge
 * safety scan flags (credentials, contact or personal data, restricted financial passages), is dropped and counted.
 *
 * Positioning (V2.3, D2): when the owner chose axes, their labels and the evidenced placements of the own brand and
 * the shared competitors are added under `positioning` (see positioning.ts). Unknown stays unknown; stale and
 * conflicting placements are flagged, never resolved. Axis ids, rationale, note ids and claim keys never leave.
 *
 * Deterministic: the same records, notes and day produce the same bytes; nothing is rewritten when unchanged, and a
 * competitor that is no longer owner-reviewed (or was archived) disappears on the next run.
 */

export const SHARED_LANDSCAPE_SCHEMA = 'brand-os.competitive-shared-landscape/1'
export const SHARED_LANDSCAPE_DIR = 'brand/competitive/shared'
export const SHARED_LANDSCAPE_PATH = `${SHARED_LANDSCAPE_DIR}/landscape.json`

/** The standard comparison criteria, in reading order. Hypothesis dimensions are not criteria and are never shared. */
export const SHARED_CRITERIA = ['offer', 'audience', 'geography', 'public_price', 'public_message', 'visual_language', 'observable_channels'] as const satisfies readonly Dimension[]
export type SharedCriterion = (typeof SHARED_CRITERIA)[number]

export const SHARED_CELL_STATES = ['observed', 'unverified', 'historical', 'conflicting', 'needs_review', 'unknown'] as const
export type SharedCellState = (typeof SHARED_CELL_STATES)[number]
export const SHARED_PRICE_STATES = ['observed', 'unverified', 'historical', 'conflicting'] as const
export type SharedPriceState = (typeof SHARED_PRICE_STATES)[number]
export const SOURCE_CLASSES = ['competitor_own_page', 'platform_documentation', 'independent_reporting', 'analyst_inference', 'owner_statement', 'first_party_data'] as const satisfies readonly SourceClass[]
export const RATE_LABELS = ['standard_rate', 'promotional', 'promotion_unknown', 'monthly_rate_billed_annually', 'terms_unknown'] as const
export type RateLabel = (typeof RATE_LABELS)[number]
export const SHARED_ASSESSMENTS = ['owner_reviewed', 'needs_refresh'] as const

/** Source classes that speak from a public web page; only these carry a host. Owner and first-party sources never do. */
const PUBLIC_WEB_SOURCES: ReadonlySet<SourceClass> = new Set(['competitor_own_page', 'platform_documentation', 'independent_reporting', 'analyst_inference'])

export const SHARED_LIMITS = { maxLabelsPerCell: 3, maxSourcesPerCell: 6, maxPrices: 400, maxFileBytes: 512 * 1024 } as const

export interface SharedSource {
  source_class: SourceClass | null
  /** Public host of a web source (`rival.com`); null for owner or first-party sources. Never a URL or path. */
  host: string | null
  /** The date the source was read (YYYY-MM-DD). */
  observed_on: string
}

export interface SharedCell {
  criterion: SharedCriterion
  state: SharedCellState
  /** Short recorder labels (never quotes). Empty when the state is unknown or needs review. */
  labels: string[]
  sources: SharedSource[]
}

export interface SharedCompetitor {
  competitor_id: string
  display_name: string
  relationship: Relationship[]
  geographic_relevance: Geography[]
  markets: string[]
  official_domain: string | null
  assessment: (typeof SHARED_ASSESSMENTS)[number]
  cells: SharedCell[]
}

export interface SharedPrice {
  competitor_id: string
  offer_name: string
  amount: number
  currency: string
  market: string
  billing_period: BillingPeriod
  billing_commitment: BillingCommitment
  tax_inclusion: TaxInclusion
  promotion: Promotion
  feature_scope: string | null
  rate_label: RateLabel
  state: SharedPriceState
  source: SharedSource
}

export interface SharedLandscape {
  schema: typeof SHARED_LANDSCAPE_SCHEMA
  schema_version: 1
  kind: 'competitive_shared_landscape'
  brand_slug: string
  /** The latest observation date among shared sources; not a run time, so re-running gives the same bytes. */
  as_of: string | null
  criteria: SharedCriterion[]
  competitors: SharedCompetitor[]
  prices: { rows: SharedPrice[]; ranked: false; currency_conversion: 'none' }
  /** Records that are not owner-reviewed are counted here, never listed. */
  not_shared: { candidates: number; disputed: number; archived: number }
  /** Labels and scopes dropped because they matched a quote or failed the safety scan. */
  withheld_text: number
  authorizes: []
  /**
   * Visual V2.3 (D2): the owner's positioning axes (labels only) and evidenced placements. Present only when the owner
   * chose axes; a file without it is still a valid V2.2 file.
   */
  positioning?: SharedPositioning
}

/** One owner axis as shared: labels and pole names only. No axis id, no rationale. */
export interface SharedAxis {
  label: LocalizedLabel
  low: LocalizedLabel
  high: LocalizedLabel
}

/** A subject's place on one axis: state, the bands as recorded (a range when conflicting), and who said it when. */
export interface SharedPlacement {
  state: PlacementState
  bands: PositionBand[]
  sources: SharedSource[]
}

export interface SharedPositioning {
  axes: { x: SharedAxis; y: SharedAxis }
  bands: PositionBand[]
  /** Sources older than this many days are stale (the research threshold for market observations). */
  stale_after_days: number
  own: { x: SharedPlacement; y: SharedPlacement }
  /** One entry per shared competitor, in the competitors' order. */
  competitors: Array<{ competitor_id: string; x: SharedPlacement; y: SharedPlacement }>
}

// ---- text checks ------------------------------------------------------------------------------------

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/** Minimum normalized length for a containment match to count as copying a quote (short names and offers repeat). */
const QUOTE_MATCH_CHARS = 20

/** Every excerpt the owner's research notes hold, normalized. Used only to keep quotes out; never written. */
function quoteIndex(evidence: EvidenceSet): string[] {
  const out: string[] = []
  for (const item of evidence.items) for (const excerpt of item.source.excerpts) out.push(normalize(excerpt.quote))
  return out
}

/** True when the text is, or contains, a recorded quote of meaningful length. */
export function matchesQuote(text: string, quotes: string[]): boolean {
  const norm = normalize(text)
  if (!norm) return false
  return quotes.some((quote) => (norm.length >= QUOTE_MATCH_CHARS && quote.includes(norm)) || (quote.length >= QUOTE_MATCH_CHARS && norm.includes(quote)))
}

function unsafeText(text: string): boolean {
  return safetyBlocksSharing(safetyReport(text)).length > 0
}

// ---- projection --------------------------------------------------------------------------------------

const DAY = /^\d{4}-\d{2}-\d{2}$/

function dayOf(iso: string): string {
  const day = iso.slice(0, 10)
  return DAY.test(day) ? day : '0000-00-00'
}

function publicHost(evidence: EvidenceSet, view: ObservationView): string | null {
  if (!view.source_class || !PUBLIC_WEB_SOURCES.has(view.source_class)) return null
  const item = evidence.items.find((candidate) => candidate.note.id === view.evidence.note_id)
  if (!item) return null
  try {
    return validateDomain(hostOf(item.source.final_url || item.source.url))
  } catch {
    return null
  }
}

function sourceOf(evidence: EvidenceSet, view: ObservationView): SharedSource {
  return { source_class: view.source_class, host: publicHost(evidence, view), observed_on: dayOf(view.evidence.observed_at) }
}

function sourceKey(source: SharedSource): string {
  return `${source.source_class ?? '-'}|${source.host ?? '-'}|${source.observed_on}`
}

/** Shareable cell order: the same precedence as the landscape, without hypotheses. */
const CELL_ORDER: SharedCellState[] = ['conflicting', 'observed', 'unverified', 'historical', 'needs_review']

interface TextGate {
  quotes: string[]
  withheld: number
}

function gateText(gate: TextGate, text: string | null): string | null {
  if (!text) return null
  if (matchesQuote(text, gate.quotes) || unsafeText(text)) {
    gate.withheld += 1
    return null
  }
  return text
}

function cellFor(criterion: SharedCriterion, candidate: CandidateView, evidence: EvidenceSet, gate: TextGate): SharedCell {
  // Observed claims only: an inference stays the owner's private hypothesis.
  const views = candidate.observations.filter((view) => view.dimension === criterion && view.statement_kind === 'observed_claim' && view.cell !== 'hypothesis' && view.cell !== 'unknown')
  const state: SharedCellState = CELL_ORDER.find((s) => views.some((view) => view.cell === s)) ?? 'unknown'
  if (state === 'unknown' || state === 'needs_review') return { criterion, state, labels: [], sources: [] }
  // A source that changed, went missing or was superseded backs nothing here: its label and source stay private.
  const shown = views
    .filter((view) => view.cell !== 'needs_review')
    .sort((a, b) => b.evidence.observed_at.localeCompare(a.evidence.observed_at) || a.observation_id.localeCompare(b.observation_id))
  const labels: string[] = []
  for (const view of shown) {
    if (labels.length >= SHARED_LIMITS.maxLabelsPerCell) break
    const label = gateText(gate, view.label)
    if (label && !labels.includes(label)) labels.push(label)
  }
  const sources = new Map<string, SharedSource>()
  for (const view of shown) {
    const source = sourceOf(evidence, view)
    if (sources.size < SHARED_LIMITS.maxSourcesPerCell) sources.set(sourceKey(source), source)
  }
  return { criterion, state, labels, sources: [...sources.values()] }
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0)
}

/** Builds the redacted landscape from the owner's records. Pure for the same records, notes and day; writes nothing. */
export function buildSharedLandscape(ws: KnowledgeWorkspace, opts: { capability: AdapterCapability; now?: Date }): SharedLandscape {
  assertOwnerProcess()
  const now = opts.now ?? ws.now()
  // Midnight UTC: freshness is judged per day, so re-running within a day cannot change the file.
  const day = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`)
  const landscape = buildLandscape(ws, { capability: opts.capability, now: day, lang: 'en' })
  const evidence = loadEvidence(ws, { now: day })
  const gate: TextGate = { quotes: quoteIndex(evidence), withheld: 0 }
  const notShared = { candidates: 0, disputed: 0, archived: 0 }
  const competitors: SharedCompetitor[] = []
  const prices: SharedPrice[] = []
  for (const candidate of landscape.candidates) {
    if (candidate.status !== 'owner_reviewed') {
      if (candidate.status === 'candidate') notShared.candidates += 1
      else if (candidate.status === 'disputed') notShared.disputed += 1
      else notShared.archived += 1
      continue
    }
    if (unsafeText(candidate.display_name)) throw new CompetitiveError('refused', `A competitor name looks like it contains private data (${candidate.competitor_id}). Nothing was shared.`)
    competitors.push({
      competitor_id: candidate.competitor_id,
      display_name: candidate.display_name,
      relationship: [...candidate.relationship],
      geographic_relevance: [...candidate.geographic_relevance],
      markets: [...candidate.markets],
      official_domain: candidate.domain_state === 'verified' ? candidate.official_domain : null,
      assessment: candidate.assessment === 'needs_refresh' ? 'needs_refresh' : 'owner_reviewed',
      cells: SHARED_CRITERIA.map((criterion) => cellFor(criterion, candidate, evidence, gate)),
    })
    for (const view of candidate.observations) {
      if (!view.price || view.statement_kind !== 'observed_claim') continue
      if (!(SHARED_PRICE_STATES as readonly string[]).includes(view.cell)) continue
      const offer = gateText(gate, view.price.offer_name)
      if (!offer) continue
      prices.push({
        competitor_id: candidate.competitor_id,
        offer_name: offer,
        amount: view.price.amount,
        currency: view.price.currency,
        market: view.price.market,
        billing_period: view.price.billing_period,
        billing_commitment: view.price.billing_commitment,
        tax_inclusion: view.price.tax_inclusion,
        promotion: view.price.promotion,
        feature_scope: gateText(gate, view.price.feature_scope),
        rate_label: rateLabel(view.price),
        state: view.cell as SharedPriceState,
        source: sourceOf(evidence, view),
      })
    }
  }
  competitors.sort((a, b) => compareText(a.display_name, b.display_name) || compareText(a.competitor_id, b.competitor_id))
  const nameOf = new Map(competitors.map((c) => [c.competitor_id, c.display_name]))
  // Listed, never ranked: grouped by currency, then by competitor name and offer. The amount is never a sort key.
  prices.sort((a, b) => compareText(a.currency, b.currency) || compareText(nameOf.get(a.competitor_id)!, nameOf.get(b.competitor_id)!) || compareText(a.offer_name, b.offer_name) || compareText(a.market, b.market) || compareText(a.source.observed_on, b.source.observed_on))
  const positioning = sharedPositioning(ws, evidence, day, competitors, gate)
  const placements = positioning ? [positioning.own, ...positioning.competitors].flatMap((p) => [...p.x.sources, ...p.y.sources]) : []
  const days = [...competitors.flatMap((c) => c.cells.flatMap((cell) => cell.sources.map((s) => s.observed_on))), ...prices.map((p) => p.source.observed_on), ...placements.map((s) => s.observed_on)].sort()
  const doc: SharedLandscape = {
    schema: SHARED_LANDSCAPE_SCHEMA,
    schema_version: 1,
    kind: 'competitive_shared_landscape',
    brand_slug: ws.brandSlug,
    as_of: days.length ? days[days.length - 1]! : null,
    criteria: [...SHARED_CRITERIA],
    competitors,
    prices: { rows: prices.slice(0, SHARED_LIMITS.maxPrices), ranked: false, currency_conversion: 'none' },
    not_shared: notShared,
    withheld_text: gate.withheld,
    authorizes: [],
  }
  if (positioning) doc.positioning = positioning
  return doc
}

function hostOfNote(evidence: EvidenceSet, noteId: string): string | null {
  const item = evidence.items.find((candidate) => candidate.note.id === noteId)
  if (!item) return null
  try {
    return validateDomain(hostOf(item.source.final_url || item.source.url))
  } catch {
    return null
  }
}

function sharedAxis(axis: AxisDefinition, gate: TextGate): SharedAxis {
  const check = (label: LocalizedLabel): LocalizedLabel => {
    for (const text of [label.en, label.fa, label.tr]) {
      if (text && (matchesQuote(text, gate.quotes) || unsafeText(text))) throw new CompetitiveError('refused', 'An axis label looks like a source quote or private data. Nothing was shared; edit the axes and run share again.')
    }
    return { en: label.en, fa: label.fa, tr: label.tr }
  }
  return { label: check(axis.label), low: check(axis.low), high: check(axis.high) }
}

/**
 * Axes (labels only) and placements for the own brand and the shared competitors. Positions of anyone not shared
 * stay private. The owner's rationale, the axis ids, the note ids and claim keys never leave.
 */
function sharedPositioning(ws: KnowledgeWorkspace, evidence: EvidenceSet, day: Date, competitors: SharedCompetitor[], gate: TextGate): SharedPositioning | null {
  const domains = new Map(scanCandidates(ws).records.map((r) => [r.competitor_id, r.domain_claim]))
  const { axes, views } = positioningLandscape(ws, { now: day, domains, publicHost: (noteId) => hostOfNote(evidence, noteId), evidence })
  if (!axes) return null
  const place = (subject: string, axisId: string): SharedPlacement => {
    const p = placementOf(views.filter((v) => v.subject === subject && v.axis_id === axisId))
    return { state: p.state, bands: [...p.bands], sources: p.sources.map((s) => ({ source_class: s.source_class, host: s.host, observed_on: s.observed_on })) }
  }
  const both = (subject: string) => ({ x: place(subject, axes.x.axis_id), y: place(subject, axes.y.axis_id) })
  return {
    axes: { x: sharedAxis(axes.x, gate), y: sharedAxis(axes.y, gate) },
    bands: [...POSITION_BANDS],
    stale_after_days: POSITION_STALE_DAYS,
    own: both(OWN_SUBJECT),
    competitors: competitors.map((c) => ({ competitor_id: c.competitor_id, ...both(c.competitor_id) })),
  }
}

export function serializeSharedLandscape(doc: SharedLandscape): string {
  return `${JSON.stringify(doc, null, 2)}\n`
}

/**
 * `brand:competitive share`: writes (or with `dryRun`, previews) the redacted landscape. Unchanged content is not
 * rewritten. Nothing is committed or pushed; the owner reviews the diff and commits it.
 */
export function shareLandscape(ws: KnowledgeWorkspace, input: { capability: AdapterCapability; dryRun: boolean; now?: Date }): { path: string; landscape: SharedLandscape; written: boolean; changed: boolean } {
  assertOwnerProcess()
  const landscape = buildSharedLandscape(ws, { capability: input.capability, now: input.now })
  const text = serializeSharedLandscape(landscape)
  if (!validSharedLandscape(JSON.parse(text))) throw new CompetitiveError('invalid_record', 'The shared landscape did not pass its own shape check. Nothing was written.')
  const file = path.join(ws.root, ...SHARED_LANDSCAPE_PATH.split('/'))
  let previous: string | null = null
  try {
    const stat = fs.lstatSync(file)
    if (stat.isSymbolicLink() || !stat.isFile()) throw new CompetitiveError('unsafe_path', `${SHARED_LANDSCAPE_PATH} is not a regular file. Nothing was written.`)
    previous = fs.readFileSync(file, 'utf8')
  } catch (error) {
    if (error instanceof CompetitiveError) throw error
    previous = null
  }
  const changed = previous !== text
  if (changed && !input.dryRun) writeVaultFile(ws, file, text, false)
  return { path: SHARED_LANDSCAPE_PATH, landscape, written: changed && !input.dryRun, changed }
}

// ---- reading (Studio) --------------------------------------------------------------------------------

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const MARKET = /^(?:[A-Z]{2}|GLOBAL)$/
const CURRENCY = /^[A-Z]{3}$/
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/

function isObj(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** Exactly these keys, no more: an extra field (a pasted quote, a note id) withholds the whole file. */
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value)
  return own.length === keys.length && own.every((key) => keys.includes(key))
}

const KEYS = {
  root: ['schema', 'schema_version', 'kind', 'brand_slug', 'as_of', 'criteria', 'competitors', 'prices', 'not_shared', 'withheld_text', 'authorizes'],
  competitor: ['competitor_id', 'display_name', 'relationship', 'geographic_relevance', 'markets', 'official_domain', 'assessment', 'cells'],
  cell: ['criterion', 'state', 'labels', 'sources'],
  source: ['source_class', 'host', 'observed_on'],
  prices: ['rows', 'ranked', 'currency_conversion'],
  price: ['competitor_id', 'offer_name', 'amount', 'currency', 'market', 'billing_period', 'billing_commitment', 'tax_inclusion', 'promotion', 'feature_scope', 'rate_label', 'state', 'source'],
  not_shared: ['candidates', 'disputed', 'archived'],
  positioning: ['axes', 'bands', 'stale_after_days', 'own', 'competitors'],
  axes: ['x', 'y'],
  axis: ['label', 'low', 'high'],
  localized: ['en', 'fa', 'tr'],
  pair: ['x', 'y'],
  placed: ['competitor_id', 'x', 'y'],
  placement: ['state', 'bands', 'sources'],
} as const

function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && ![...value].some((ch) => ch.charCodeAt(0) < 32)
}

function enumList<T extends string>(value: unknown, allowed: readonly T[]): value is T[] {
  return Array.isArray(value) && value.length <= allowed.length && value.every((item) => (allowed as readonly string[]).includes(item as string))
}

function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100_000
}

function validHost(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try {
    return validateDomain(value) === value
  } catch {
    return false
  }
}

function validSource(value: unknown): value is SharedSource {
  if (!isObj(value) || !exactKeys(value, KEYS.source)) return false
  if (!(value.source_class === null || (SOURCE_CLASSES as readonly unknown[]).includes(value.source_class))) return false
  if (value.host !== null && !validHost(value.host)) return false
  return typeof value.observed_on === 'string' && ISO_DAY.test(value.observed_on)
}

function validCell(value: unknown, criterion: SharedCriterion): value is SharedCell {
  return (
    isObj(value) &&
    exactKeys(value, KEYS.cell) &&
    value.criterion === criterion &&
    (SHARED_CELL_STATES as readonly unknown[]).includes(value.state) &&
    Array.isArray(value.labels) &&
    value.labels.length <= SHARED_LIMITS.maxLabelsPerCell &&
    value.labels.every((label) => text(label, COMPETITIVE_LIMITS.maxLabelChars)) &&
    Array.isArray(value.sources) &&
    value.sources.length <= SHARED_LIMITS.maxSourcesPerCell &&
    value.sources.every(validSource)
  )
}

function validCompetitor(value: unknown): value is SharedCompetitor {
  return (
    isObj(value) &&
    exactKeys(value, KEYS.competitor) &&
    typeof value.competitor_id === 'string' &&
    COMPETITOR_ID.test(value.competitor_id) &&
    text(value.display_name, COMPETITIVE_LIMITS.maxNameChars) &&
    enumList(value.relationship, RELATIONSHIPS) &&
    enumList(value.geographic_relevance, GEOGRAPHIES) &&
    Array.isArray(value.markets) &&
    value.markets.length <= COMPETITIVE_LIMITS.maxMarkets &&
    value.markets.every((m) => typeof m === 'string' && MARKET.test(m)) &&
    (value.official_domain === null || validHost(value.official_domain)) &&
    (SHARED_ASSESSMENTS as readonly unknown[]).includes(value.assessment) &&
    Array.isArray(value.cells) &&
    value.cells.length === SHARED_CRITERIA.length &&
    value.cells.every((cell, index) => validCell(cell, SHARED_CRITERIA[index]!))
  )
}

function validPrice(value: unknown, ids: Set<string>): value is SharedPrice {
  return (
    isObj(value) &&
    exactKeys(value, KEYS.price) &&
    typeof value.competitor_id === 'string' &&
    ids.has(value.competitor_id) &&
    text(value.offer_name, COMPETITIVE_LIMITS.maxOfferChars) &&
    typeof value.amount === 'number' &&
    Number.isFinite(value.amount) &&
    value.amount >= 0 &&
    value.amount <= 1e12 &&
    typeof value.currency === 'string' &&
    CURRENCY.test(value.currency) &&
    typeof value.market === 'string' &&
    MARKET.test(value.market) &&
    value.market !== 'GLOBAL' &&
    (BILLING_PERIODS as readonly unknown[]).includes(value.billing_period) &&
    (BILLING_COMMITMENTS as readonly unknown[]).includes(value.billing_commitment) &&
    (TAX_INCLUSIONS as readonly unknown[]).includes(value.tax_inclusion) &&
    (PROMOTIONS as readonly unknown[]).includes(value.promotion) &&
    (value.feature_scope === null || text(value.feature_scope, COMPETITIVE_LIMITS.maxScopeChars)) &&
    (RATE_LABELS as readonly unknown[]).includes(value.rate_label) &&
    (SHARED_PRICE_STATES as readonly unknown[]).includes(value.state) &&
    validSource(value.source)
  )
}

function validLocalized(value: unknown, max: number): value is LocalizedLabel {
  return isObj(value) && exactKeys(value, KEYS.localized) && text(value.en, max) && (value.fa === null || text(value.fa, max)) && (value.tr === null || text(value.tr, max))
}

function validAxis(value: unknown): value is SharedAxis {
  return isObj(value) && exactKeys(value, KEYS.axis) && validLocalized(value.label, POSITIONING_LIMITS.maxAxisLabelChars) && validLocalized(value.low, POSITIONING_LIMITS.maxPoleChars) && validLocalized(value.high, POSITIONING_LIMITS.maxPoleChars)
}

/** Bands in order, unique; none for unknown or needs_review; one for evidenced or stale; one or more when conflicting. */
function validPlacement(value: unknown): value is SharedPlacement {
  if (!isObj(value) || !exactKeys(value, KEYS.placement)) return false
  if (!(PLACEMENT_STATES as readonly unknown[]).includes(value.state)) return false
  const bands = value.bands
  if (!Array.isArray(bands) || !bands.every((b) => (POSITION_BANDS as readonly unknown[]).includes(b))) return false
  const order = bands.map((b) => POSITION_BANDS.indexOf(b as PositionBand))
  if (!order.every((n, i) => i === 0 || n > order[i - 1]!)) return false
  const sources = value.sources
  if (!Array.isArray(sources) || sources.length > POSITIONING_LIMITS.maxSourcesPerPlacement || !sources.every(validSource)) return false
  if (value.state === 'unknown' || value.state === 'needs_review') return bands.length === 0 && sources.length === 0
  if (value.state === 'conflicting') return bands.length >= 1 && sources.length >= 1
  return bands.length === 1 && sources.length >= 1
}

function validPair(value: unknown, keys: readonly string[]): value is { x: SharedPlacement; y: SharedPlacement } & Record<string, unknown> {
  return isObj(value) && exactKeys(value, keys) && validPlacement(value.x) && validPlacement(value.y)
}

function validPositioning(value: unknown, ids: Set<string>): value is SharedPositioning {
  if (!isObj(value) || !exactKeys(value, KEYS.positioning)) return false
  const axes = value.axes
  if (!isObj(axes) || !exactKeys(axes, KEYS.axes) || !validAxis(axes.x) || !validAxis(axes.y)) return false
  if (!Array.isArray(value.bands) || value.bands.length !== POSITION_BANDS.length || !value.bands.every((b, i) => b === POSITION_BANDS[i])) return false
  if (!(typeof value.stale_after_days === 'number' && Number.isInteger(value.stale_after_days) && value.stale_after_days > 0 && value.stale_after_days <= 3650)) return false
  if (!validPair(value.own, KEYS.pair)) return false
  const list = value.competitors
  if (!Array.isArray(list) || list.length > ids.size) return false
  const seen = new Set<string>()
  for (const entry of list) {
    if (!isObj(entry) || !validPair(entry, KEYS.placed) || typeof entry.competitor_id !== 'string' || !ids.has(entry.competitor_id) || seen.has(entry.competitor_id)) return false
    seen.add(entry.competitor_id)
  }
  return true
}

/** Strict shape check: anything unexpected withholds the whole file rather than showing part of it. */
export function validSharedLandscape(value: unknown): value is SharedLandscape {
  if (!isObj(value)) return false
  const hasPositioning = Object.prototype.hasOwnProperty.call(value, 'positioning')
  const prices = value.prices as Record<string, unknown> | undefined
  const notShared = value.not_shared as Record<string, unknown> | undefined
  if (
    !(
      exactKeys(value, hasPositioning ? [...KEYS.root, 'positioning'] : KEYS.root) &&
      value.schema === SHARED_LANDSCAPE_SCHEMA &&
      value.schema_version === 1 &&
      value.kind === 'competitive_shared_landscape' &&
      typeof value.brand_slug === 'string' &&
      SLUG.test(value.brand_slug) &&
      (value.as_of === null || (typeof value.as_of === 'string' && ISO_DAY.test(value.as_of))) &&
      Array.isArray(value.criteria) &&
      value.criteria.length === SHARED_CRITERIA.length &&
      value.criteria.every((c, i) => c === SHARED_CRITERIA[i]) &&
      Array.isArray(value.competitors) &&
      value.competitors.length <= COMPETITIVE_LIMITS.maxCandidates &&
      value.competitors.every(validCompetitor) &&
      isObj(prices) &&
      exactKeys(prices, KEYS.prices) &&
      prices.ranked === false &&
      prices.currency_conversion === 'none' &&
      Array.isArray(prices.rows) &&
      prices.rows.length <= SHARED_LIMITS.maxPrices &&
      isObj(notShared) &&
      exactKeys(notShared, KEYS.not_shared) &&
      count(notShared.candidates) &&
      count(notShared.disputed) &&
      count(notShared.archived) &&
      count(value.withheld_text) &&
      Array.isArray(value.authorizes) &&
      value.authorizes.length === 0
    )
  ) {
    return false
  }
  const ids = new Set((value.competitors as SharedCompetitor[]).map((c) => c.competitor_id))
  if (ids.size !== (value.competitors as SharedCompetitor[]).length) return false
  if (hasPositioning && !validPositioning(value.positioning, ids)) return false
  return (prices.rows as unknown[]).every((row) => validPrice(row, ids))
}

export type SharedLandscapeRead =
  | { state: 'not_shared' }
  | { state: 'withheld'; reason: 'symlink' | 'unreadable' | 'invalid_record' | 'wrong_brand' | 'unsafe_text' }
  | { state: 'shared'; landscape: SharedLandscape }

/**
 * Reads `brand/competitive/shared/landscape.json` from a checkout (Studio: the extracted merged commit). A symlink,
 * oversized, malformed, other-brand or unsafe file is withheld as a whole. The result is rebuilt from the listed fields
 * only, so an extra field someone committed (a quote, a note) never reaches a page.
 */
export function readSharedLandscape(root: string, brandSlug: string): SharedLandscapeRead {
  const file = path.join(root, ...SHARED_LANDSCAPE_PATH.split('/'))
  let stat: fs.Stats
  try {
    stat = fs.lstatSync(file)
  } catch {
    return { state: 'not_shared' }
  }
  if (stat.isSymbolicLink()) return { state: 'withheld', reason: 'symlink' }
  if (!stat.isFile() || stat.size > SHARED_LIMITS.maxFileBytes) return { state: 'withheld', reason: 'unreadable' }
  let doc: unknown
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return { state: 'withheld', reason: 'unreadable' }
  }
  if (!validSharedLandscape(doc)) return { state: 'withheld', reason: 'invalid_record' }
  if (doc.brand_slug !== brandSlug) return { state: 'withheld', reason: 'wrong_brand' }
  const copySource = (s: SharedSource): SharedSource => ({ source_class: s.source_class, host: s.host, observed_on: s.observed_on })
  const landscape: SharedLandscape = {
    schema: SHARED_LANDSCAPE_SCHEMA,
    schema_version: 1,
    kind: 'competitive_shared_landscape',
    brand_slug: doc.brand_slug,
    as_of: doc.as_of,
    criteria: [...SHARED_CRITERIA],
    competitors: doc.competitors.map((c) => ({
      competitor_id: c.competitor_id,
      display_name: c.display_name,
      relationship: [...c.relationship],
      geographic_relevance: [...c.geographic_relevance],
      markets: [...c.markets],
      official_domain: c.official_domain,
      assessment: c.assessment,
      cells: c.cells.map((cell) => ({ criterion: cell.criterion, state: cell.state, labels: [...cell.labels], sources: cell.sources.map(copySource) })),
    })),
    prices: {
      rows: doc.prices.rows.map((p) => ({
        competitor_id: p.competitor_id,
        offer_name: p.offer_name,
        amount: p.amount,
        currency: p.currency,
        market: p.market,
        billing_period: p.billing_period,
        billing_commitment: p.billing_commitment,
        tax_inclusion: p.tax_inclusion,
        promotion: p.promotion,
        feature_scope: p.feature_scope,
        rate_label: p.rate_label,
        state: p.state,
        source: copySource(p.source),
      })),
      ranked: false,
      currency_conversion: 'none',
    },
    not_shared: { candidates: doc.not_shared.candidates, disputed: doc.not_shared.disputed, archived: doc.not_shared.archived },
    withheld_text: doc.withheld_text,
    authorizes: [],
  }
  if (doc.positioning) {
    const pos = doc.positioning
    const loc = (l: LocalizedLabel): LocalizedLabel => ({ en: l.en, fa: l.fa, tr: l.tr })
    const axis = (a: SharedAxis): SharedAxis => ({ label: loc(a.label), low: loc(a.low), high: loc(a.high) })
    const placed = (p: SharedPlacement): SharedPlacement => ({ state: p.state, bands: [...p.bands], sources: p.sources.map(copySource) })
    landscape.positioning = {
      axes: { x: axis(pos.axes.x), y: axis(pos.axes.y) },
      bands: [...POSITION_BANDS],
      stale_after_days: pos.stale_after_days,
      own: { x: placed(pos.own.x), y: placed(pos.own.y) },
      competitors: pos.competitors.map((c) => ({ competitor_id: c.competitor_id, x: placed(c.x), y: placed(c.y) })),
    }
  }
  const axisTexts = landscape.positioning ? [landscape.positioning.axes.x, landscape.positioning.axes.y].flatMap((a) => [a.label, a.low, a.high]).flatMap((l) => [l.en, l.fa ?? '', l.tr ?? '']) : []
  const texts = [...axisTexts, ...landscape.competitors.flatMap((c) => [c.display_name, ...c.cells.flatMap((cell) => cell.labels)]), ...landscape.prices.rows.flatMap((p) => [p.offer_name, p.feature_scope ?? ''])]
  if (texts.some((t) => t && unsafeText(t))) return { state: 'withheld', reason: 'unsafe_text' }
  return { state: 'shared', landscape }
}
