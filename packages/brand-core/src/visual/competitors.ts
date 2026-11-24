import type { SharedCellState, SharedLandscape, SharedLandscapeRead, SharedPlacement, SharedSource } from '../competitive/share.js'
import { SHARED_CRITERIA } from '../competitive/share.js'
import { latestAnswers } from '../completeness.js'
import { itemFor, type ItemContext } from '../documents/model.js'
import type { InterviewEngine } from '../engine.js'
import { readEvidence } from '../evidence.js'
import { readFacts, type CanonicalFact } from '../facts.js'
import { DEFAULT_STALENESS_DAYS } from '../research/model.js'
import type { StructuredValue } from '../structured.js'
import { entryFromItem } from './bmc.js'
import {
  emptyStatusSummary,
  VISUAL_SCHEMA,
  type BlockBase,
  type ComparisonCell,
  type ComparisonRow,
  type ComparisonSource,
  type ComparisonState,
  type CompetitorMatrixBlock,
  type PositioningMapBlock,
  type PositioningPlacement,
  type PositioningPoint,
  type PriceStripBlock,
  type PriceStripRow,
  type VisualDocument,
  type VisualEntry,
} from './model.js'

/**
 * Competitor comparison matrix and price strip (Visual Blueprint V2.2).
 *
 * Competitor rows come only from the landscape the owner shared with `brand:competitive share` (read from the merged
 * commit by `readSharedLandscape`); nothing here reads `brand/.private`. The own-brand row is drawn from approved facts
 * through the same truth path as the documents (`itemFor`): a draft, a withheld value or a gap shows its state, never
 * a value. Prices stay grouped by currency in the order shared; nothing is ranked, converted or inferred. The page is
 * internal only: a comparison naming other businesses has no public edition.
 */

/** Which approved fact fills the own-brand cell for each standard criterion. */
export const OWN_BRAND_FACTS: Record<(typeof SHARED_CRITERIA)[number], string> = {
  offer: 'business.offer.summary',
  audience: 'business.customer.primary_segment',
  geography: 'business.market.geography',
  public_price: 'business.sales.pricing',
  public_message: 'business.offer.value_proposition',
  visual_language: 'brand.color.roles',
  observable_channels: 'business.marketing.channels',
}

const CELL_STATE: Record<SharedCellState, ComparisonState> = {
  observed: 'present',
  unverified: 'unverified',
  historical: 'historical',
  conflicting: 'conflicting',
  needs_review: 'needs_review',
  unknown: 'unknown',
}

const OWN_LABEL_CHARS = 160

function clip(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > OWN_LABEL_CHARS ? `${clean.slice(0, OWN_LABEL_CHARS - 1).trimEnd()}…` : clean
}

function drawable(entry: VisualEntry): boolean {
  return entry.state === 'approved' || entry.state === 'stale'
}

export interface OwnSource {
  entry: VisualEntry
  structured: StructuredValue | null
}

function ownCell(criterion: string, source: OwnSource): ComparisonCell {
  const entry = drawable(source.entry) ? source.entry : { ...source.entry, value: null }
  const swatches = drawable(entry) && source.structured?.type === 'color' ? source.structured.colors.map((color) => color.hex).filter((hex) => /^#[0-9a-fA-F]{6}$/.test(hex)).slice(0, 6) : []
  const label = drawable(entry) ? (source.structured?.type === 'color' ? source.structured.colors.map((color) => color.role).join(' · ') : entry.value ? clip(entry.value) : '') : ''
  return { criterion, state: drawable(entry) ? 'present' : 'unknown', labels: label ? [label] : [], swatches, footnotes: [], own: entry }
}

function blockBase(id: string, filled: 'complete' | 'partial' | 'missing', asOf: string | null, sources: string[]): BlockBase {
  return {
    block_id: id,
    framework_id: null,
    data_state: filled,
    sources,
    as_of: asOf,
    computed_from: ['brand/competitive/shared/landscape.json'],
    visibility: 'internal',
    renderer_variant: id === 'competitor-matrix' ? 'matrix.book.v1' : id === 'positioning-map' ? 'positioning.map.v1' : 'prices.strip.v1',
    layout_constraints: { preserve_topology: false, min_print_pt: 7, print_profile: 'book_a4_portrait' },
  }
}

/**
 * True when every source is surely older than `maxDays` at `now`. The shared file keeps only the day a source was
 * read, so one day is given back: a source is never called stale here before the research store would call it stale.
 */
function staleAt(sources: SharedSource[], now: Date, maxDays: number): boolean {
  if (!sources.length) return false
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`)
  const newest = sources.map((s) => Date.parse(`${s.observed_on}T00:00:00Z`)).reduce((a, b) => Math.max(a, b))
  if (!Number.isFinite(newest)) return false
  return Math.floor((today - newest) / 86_400_000) - 1 > maxDays
}

/**
 * The shared file freezes each state on the day the owner ran `share`. When the page is built later, a state that was
 * current then but whose newest source has since passed the stale threshold reads as stale (matrix and prices:
 * historical; map: stale). States only go down: nothing is upgraded, resolved or re-ranked, and conflicts stay.
 */
function agedLandscape(landscape: SharedLandscape, now: Date): SharedLandscape {
  const maxDays = DEFAULT_STALENESS_DAYS.market_observation
  const current: ReadonlySet<string> = new Set(['observed', 'unverified'])
  const aged = structuredClone(landscape)
  for (const competitor of aged.competitors) for (const cell of competitor.cells) if (current.has(cell.state) && staleAt(cell.sources, now, maxDays)) cell.state = 'historical'
  for (const row of aged.prices.rows) if (current.has(row.state) && staleAt([row.source], now, maxDays)) row.state = 'historical'
  const pos = aged.positioning
  if (pos) {
    for (const pair of [pos.own, ...pos.competitors]) for (const p of [pair.x, pair.y]) if (p.state === 'evidenced' && staleAt(p.sources, now, pos.stale_after_days)) p.state = 'stale'
  }
  return aged
}

/**
 * Assembles the comparison from the shared landscape and the own-brand sources; shared by the builder and fixtures.
 * With `now`, states are aged to that day (see agedLandscape); without it (golden fixtures) they are drawn as shared.
 */
export function comparisonDocument(input: { brand_id: string; brand_name: string; illustrative: boolean; read: SharedLandscapeRead; own: Record<string, OwnSource>; now?: Date }): VisualDocument {
  const criteria = [...SHARED_CRITERIA]
  const landscape: SharedLandscape | null = input.read.state === 'shared' ? (input.now ? agedLandscape(input.read.landscape, input.now) : input.read.landscape) : null
  const footnotes: ComparisonSource[] = []
  const noteFor = (source: SharedSource): number => {
    const found = footnotes.find((item) => item.source_class === source.source_class && item.host === source.host && item.observed_on === source.observed_on)
    if (found) return found.n
    const n = footnotes.length + 1
    footnotes.push({ n, source_class: source.source_class, host: source.host, observed_on: source.observed_on })
    return n
  }
  const ownRow: ComparisonRow = {
    row_id: 'own',
    kind: 'own_brand',
    name: input.brand_name,
    relationship: [],
    markets: [],
    official_domain: null,
    needs_refresh: false,
    cells: criteria.map((criterion) => ownCell(criterion, input.own[criterion] ?? { entry: missingEntry(OWN_BRAND_FACTS[criterion]), structured: null })),
  }
  const rows: ComparisonRow[] = [ownRow]
  for (const competitor of landscape?.competitors ?? []) {
    rows.push({
      row_id: competitor.competitor_id,
      kind: 'competitor',
      name: competitor.display_name,
      relationship: [...competitor.relationship],
      markets: [...competitor.markets],
      official_domain: competitor.official_domain,
      needs_refresh: competitor.assessment === 'needs_refresh',
      cells: competitor.cells.map((cell) => ({ criterion: cell.criterion, state: CELL_STATE[cell.state], labels: [...cell.labels], swatches: [], footnotes: cell.sources.map(noteFor), own: null })),
    })
  }
  const nameOf = new Map((landscape?.competitors ?? []).map((c) => [c.competitor_id, c.display_name]))
  const groups: PriceStripBlock['groups'] = []
  for (const price of landscape?.prices.rows ?? []) {
    const row: PriceStripRow = {
      competitor_id: price.competitor_id,
      competitor_name: nameOf.get(price.competitor_id) ?? '',
      offer_name: price.offer_name,
      amount: price.amount,
      currency: price.currency,
      market: price.market,
      billing_period: price.billing_period,
      billing_commitment: price.billing_commitment,
      tax_inclusion: price.tax_inclusion,
      promotion: price.promotion,
      feature_scope: price.feature_scope,
      rate_label: price.rate_label,
      state: price.state,
      footnote: noteFor(price.source),
    }
    // Groups keep the shared order (currency, then name): the amount never decides a position.
    const group = groups.find((g) => g.currency === price.currency)
    if (group) group.rows.push(row)
    else groups.push({ currency: price.currency, rows: [row] })
  }
  const priced = new Set((landscape?.prices.rows ?? []).map((p) => p.competitor_id))
  const unpriced = (landscape?.competitors ?? []).filter((c) => !priced.has(c.competitor_id)).map((c) => c.display_name)
  const competitorCells = rows.filter((r) => r.kind === 'competitor').flatMap((r) => r.cells)
  const known = competitorCells.filter((cell) => cell.state !== 'unknown').length
  const matrixState: BlockBase['data_state'] = !competitorCells.length || !known ? 'missing' : known === competitorCells.length ? 'complete' : 'partial'
  const asOf = landscape?.as_of ?? null
  const ownSources = Object.values(input.own).flatMap((source) => (drawable(source.entry) ? source.entry.sources : []))
  const matrix: CompetitorMatrixBlock = {
    ...blockBase('competitor-matrix', matrixState, asOf, [...new Set(ownSources)]),
    type: 'competitor_matrix',
    criteria,
    rows,
    footnotes,
    share_state: input.read.state,
    withheld_reason: input.read.state === 'withheld' ? input.read.reason : null,
    not_shared: landscape ? { ...landscape.not_shared } : null,
    withheld_text: landscape?.withheld_text ?? 0,
  }
  const strip: PriceStripBlock = {
    ...blockBase('price-strip', groups.length ? (unpriced.length ? 'partial' : 'complete') : 'missing', asOf, []),
    type: 'price_strip',
    groups,
    unpriced,
    ranked: false,
    currency_conversion: 'none',
  }
  const map = positioningMap(landscape, input.read.state, input.brand_name, noteFor)
  const summary = emptyStatusSummary()
  for (const cell of ownRow.cells) if (cell.own) summary[cell.own.state] += 1
  return {
    schema: VISUAL_SCHEMA,
    schema_version: 1,
    document_kind: 'competitor_comparison',
    brand_id: input.brand_id,
    brand_name: input.brand_name,
    audience: 'internal',
    illustrative: input.illustrative,
    origin: input.illustrative ? 'illustrative_fixture' : 'brand_repository',
    as_of: asOf,
    classification: 'internal',
    print_profile: 'book_a4_portrait',
    status_summary: summary,
    framework_refs: [],
    blocks: [matrix, strip, map],
  }
}

const DRAWN: ReadonlySet<string> = new Set(['evidenced', 'stale', 'conflicting'])

/**
 * Positioning map (V2.3, D2) from the shared landscape's optional positioning section. A subject is plotted only when
 * both axes are evidenced, stale or conflicting; everyone else goes to the margin list with each axis's state. The
 * own brand comes first; competitors keep the shared (alphabetical) order. Footnotes join the matrix's numbering.
 */
function positioningMap(landscape: SharedLandscape | null, shareState: SharedLandscapeRead['state'], brandName: string, noteFor: (source: SharedSource) => number): PositioningMapBlock {
  const pos = landscape?.positioning ?? null
  const points: PositioningPoint[] = []
  const unplotted: PositioningPoint[] = []
  if (pos && landscape) {
    const names = new Map(landscape.competitors.map((c) => [c.competitor_id, c.display_name]))
    const placed = (p: SharedPlacement): PositioningPlacement => ({ state: p.state, bands: [...p.bands] })
    const subjects = [{ subject_id: 'own', kind: 'own_brand' as const, name: brandName, x: pos.own.x, y: pos.own.y }, ...pos.competitors.map((c) => ({ subject_id: c.competitor_id, kind: 'competitor' as const, name: names.get(c.competitor_id) ?? '', x: c.x, y: c.y }))]
    for (const s of subjects) {
      const drawn = DRAWN.has(s.x.state) && DRAWN.has(s.y.state)
      const point: PositioningPoint = { subject_id: s.subject_id, kind: s.kind, name: s.name, n: null, x: placed(s.x), y: placed(s.y), footnotes: [] }
      if (drawn) {
        point.footnotes = [...new Set([...s.x.sources, ...s.y.sources].map(noteFor))].sort((a, b) => a - b)
        if (s.kind === 'competitor') point.n = points.filter((p) => p.kind === 'competitor').length + 1
        points.push(point)
      } else {
        unplotted.push(point)
      }
    }
  }
  const competitorsTotal = pos ? pos.competitors.length + 1 : 0
  const state: BlockBase['data_state'] = !points.length ? 'missing' : points.length === competitorsTotal ? 'complete' : 'partial'
  return {
    ...blockBase('positioning-map', state, landscape?.as_of ?? null, []),
    type: 'positioning_map',
    axes: pos ? { x: pos.axes.x, y: pos.axes.y } : null,
    bands: pos ? [...pos.bands] : [],
    stale_after_days: pos?.stale_after_days ?? null,
    points,
    unplotted,
    share_state: shareState,
  }
}

function missingEntry(id: string): VisualEntry {
  return { id, label: id, state: 'missing', value: null, sources: [], version: null, approved_at: null, review_due: null, note: null, missing_reason: 'unanswered' }
}

/** The comparison for one brand repository. `read` is `readSharedLandscape(root, slug)`. Reads only; writes nothing. */
export function buildCompetitorComparison(engine: InterviewEngine, read: SharedLandscapeRead, options: { now?: Date } = {}): VisualDocument {
  const root = engine.workspaceRoot()
  const config = engine.config()
  const brandId = config.brand.slug
  const now = options.now ?? new Date()
  const facts = readFacts(root, 'approved', brandId)
  const answers = latestAnswers(engine.ledger().records)
  const context: ItemContext = { facts, answers, audience: 'internal', root, brandId, evidence: readEvidence(root), now }
  const own: Record<string, OwnSource> = {}
  for (const [criterion, id] of Object.entries(OWN_BRAND_FACTS)) {
    const question = engine.question(id)
    if (!question) {
      own[criterion] = { entry: missingEntry(id), structured: null }
      continue
    }
    const item = itemFor(question, context)
    const fact: CanonicalFact | undefined = facts[id]
    const status = answers.get(id)?.status
    const { approved: _approved, ...entry } = entryFromItem(item, fact, false, now, status === 'unknown' || status === 'skipped' || status === 'deprecated' ? status : 'unanswered')
    void _approved
    own[criterion] = { entry, structured: item.structured }
  }
  return comparisonDocument({ brand_id: brandId, brand_name: String(config.brand.name ?? brandId), illustrative: false, read, own, now })
}
