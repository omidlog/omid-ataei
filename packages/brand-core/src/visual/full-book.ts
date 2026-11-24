import { brandApplicability, type FrameworkRef } from '../applicability.js'
import { latestAnswers } from '../completeness.js'
import { BRAND_BOOK } from '../documents/brand-book.js'
import { BUSINESS_PLAN } from '../documents/business-plan.js'
import { type DocumentAudience, type DocumentSpec, type ItemContext } from '../documents/model.js'
import type { InterviewEngine } from '../engine.js'
import { readEvidence } from '../evidence.js'
import { readFacts } from '../facts.js'
import { BMC_ZONE_IDS, frameworkEntry } from './bmc.js'
import { IDENTITY_QUESTIONS } from './identity.js'
import type { BmcZoneId, DataState, VisualDocument, VisualEntry } from './model.js'

/**
 * Full Brand Book and Business Report (Visual V4.2): book-level documents for the V1.2 `book_a4_portrait` engine.
 *
 * A book is an ordered list of chapters assembled from what already exists: the Brand Book and business plan
 * document sections (through `itemFor`, the same truth path as every document), the "Visual identity" chapter
 * (V2.1) and the Business Model Canvas (P0). Nothing is composed or summarised:
 *
 * - Only approved values are carried. A draft keeps its label and state but loses its value (`value: null`), an
 *   agent or template recommendation is dropped, and a restricted value is withheld in every edition, so a
 *   restricted finance figure can never reach a PDF. The public edition carries approved, published facts only.
 * - A chapter with no approved value, a planned chapter and a chapter that prints as its own document become an
 *   `unavailable` chapter: the renderer draws a designed "not yet available" page, never filler.
 *
 * Language-neutral like every visual document: labels and states come from `i18n-full-book.ts`.
 */

export const BOOK_SCHEMA = 'brand-os.visual-book/1'
export const BOOK_KINDS = ['brand_book', 'business_report'] as const
export type BookKind = (typeof BOOK_KINDS)[number]

export const BOOK_CHAPTER_IDS = [
  'overview',
  'strategy',
  'verbal',
  'color',
  'type',
  'logo',
  'mascot',
  'governance',
  'motion',
  'applications',
  'executive_summary',
  'customer_problem',
  'business_model',
  'business_model_canvas',
  'competitors',
  'product',
  'financials',
  'goals',
  'risks',
] as const
export type BookChapterId = (typeof BOOK_CHAPTER_IDS)[number]
export type PlateChapterId = 'color' | 'type' | 'logo'

export const UNAVAILABLE_REASONS = ['no_approved_facts', 'planned', 'separate_print', 'module_off', 'not_applicable'] as const
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number]

/** Text chapter: approved entries print their value; every other entry prints its label and state only. */
export interface BookFactsChapter {
  kind: 'facts'
  chapter_id: BookChapterId
  entries: VisualEntry[]
}

/** A "Visual identity" plate (drawn from `BookDocument.identity`) followed by the section's other rules. */
export interface BookPlateChapter {
  kind: 'plate'
  chapter_id: PlateChapterId
  entries: VisualEntry[]
}

/** The canvas as a zone list (A4 portrait); the A3 canvas itself prints with `--doc bmc`. */
export interface BookCanvasChapter {
  kind: 'canvas'
  chapter_id: 'business_model_canvas'
  zones: Array<{ zone_id: BmcZoneId; order: number; entries: VisualEntry[] }>
}

export interface BookUnavailableChapter {
  kind: 'unavailable'
  chapter_id: BookChapterId
  reason: UnavailableReason
  /** Internal edition only: the fields that would fill the chapter, with their state (never a value). */
  awaiting: VisualEntry[]
}

export type BookChapter = BookFactsChapter | BookPlateChapter | BookCanvasChapter | BookUnavailableChapter

export interface BookDocument {
  schema: typeof BOOK_SCHEMA
  schema_version: 1
  book_kind: BookKind
  brand_id: string
  brand_name: string
  audience: DocumentAudience
  /** True only for golden examples. Renderers stamp ILLUSTRATIVE / MOCK DATA on every page. */
  illustrative: boolean
  origin: 'brand_repository' | 'illustrative_fixture'
  /** Latest approval date among the printed entries and plates. Not a render time. */
  as_of: string | null
  /** The "Visual identity" document the plates are drawn from (Brand Book), else null. */
  identity: VisualDocument | null
  /** The canvas document (Business Report), for its framework reference, else null. */
  canvas: VisualDocument | null
  chapters: BookChapter[]
}

/** An entry without any value: no text, no list items (Visual V3.1), no legacy mark. Label and state stay. */
function valueless(entry: VisualEntry): VisualEntry {
  const { items: _items, legacy: _legacy, ...rest } = entry
  return { ...rest, value: null }
}

/** Draft and recommendation values never reach a book; withheld stays withheld. A list's items go with its value. */
export function printableEntry(entry: VisualEntry): VisualEntry | null {
  if (entry.state === 'recommendation') return null
  if (entry.state === 'approved' || entry.state === 'stale') return entry
  return valueless(entry)
}

/**
 * The public edition never shows a draft, restricted or other internal mark (owner decision: draft marks stay hidden
 * from public until published): anything not approved reads "not published", whatever the source document said.
 */
function printable(entries: VisualEntry[], audience: DocumentAudience): VisualEntry[] {
  return entries
    .map(printableEntry)
    .filter((entry): entry is VisualEntry => entry !== null)
    .map((entry) => (audience === 'public' && entry.state !== 'approved' && entry.state !== 'stale' && entry.na_reason !== 'profile' ? { ...valueless(entry), state: 'missing' as const, note: null, missing_reason: 'not_published' as const } : entry))
}

function hasValue(entries: VisualEntry[]): boolean {
  return entries.some((entry) => (entry.state === 'approved' || entry.state === 'stale') && entry.value !== null)
}

function unavailable(chapter_id: BookChapterId, reason: UnavailableReason, audience: DocumentAudience, awaiting: VisualEntry[] = []): BookUnavailableChapter {
  return { kind: 'unavailable', chapter_id, reason, awaiting: audience === 'internal' ? awaiting : [] }
}

/** BOS-15: every entry is a question the profile does not ask (and nothing stands in for it). */
function profileNotApplicable(entries: VisualEntry[]): boolean {
  return entries.length > 0 && entries.every((entry) => entry.na_reason === 'profile')
}

function factsChapter(chapter_id: BookChapterId, entries: VisualEntry[], audience: DocumentAudience): BookChapter {
  const kept = printable(entries, audience)
  if (hasValue(kept)) return { kind: 'facts', chapter_id, entries: kept }
  return unavailable(chapter_id, profileNotApplicable(kept) ? 'not_applicable' : 'no_approved_facts', audience, kept)
}

/** Section id of the Brand Book / business plan spec behind each text chapter. */
const BRAND_BOOK_SECTIONS: Partial<Record<BookChapterId, string>> = { overview: 'overview', strategy: 'strategy', verbal: 'verbal', color: 'color', type: 'type', logo: 'logo', governance: 'governance' }
const REPORT_SECTIONS: Partial<Record<BookChapterId, string>> = {
  executive_summary: 'executive-summary',
  customer_problem: 'customer-problem',
  business_model: 'business-model',
  product: 'product',
  financials: 'financials',
  goals: 'goals',
  risks: 'risks',
}

/** Drawn on the plate itself (or a technical pointer), so not repeated under the plate's rules. */
const ON_PLATE = new Set<string>([...Object.values(IDENTITY_QUESTIONS), 'brand.logo.masters'])

export interface BookInput {
  kind: BookKind
  audience: DocumentAudience
  brand_id: string
  brand_name: string
  illustrative: boolean
  /** Entries per spec section id (`overview`, `executive-summary`, …), in question order. */
  sections: Record<string, VisualEntry[]>
  identity?: VisualDocument | null
  canvas?: VisualDocument | null
  /** Mascot module state: off, or on (the atlas prints as its own A4 document today). */
  mascot?: 'off' | 'on'
  /** An owner-reviewed competitor comparison exists (internal only; it prints as its own document today). */
  competitors?: boolean
}

function latest(dates: Array<string | null | undefined>): string | null {
  return dates.filter((date): date is string => Boolean(date)).sort().at(-1) ?? null
}

/**
 * The canvas document a report keeps for its framework reference and citations. Its zone block is dropped: the
 * canvas chapter carries the printable zones, and the source block still holds draft values and list items (with
 * their ids) for the owner's own canvas, which a book never carries.
 */
function referenceOnly(canvas: VisualDocument): VisualDocument {
  return { ...canvas, blocks: canvas.blocks.filter((block) => block.type !== 'business_model_canvas') }
}

/** Pure: assembles a book from entries and visual documents. The engine wrapper and the fixtures both use it. */
export function composeBook(input: BookInput): BookDocument {
  const { audience } = input
  const section = (id: string | undefined) => (id ? (input.sections[id] ?? []) : [])
  const chapters: BookChapter[] = []
  if (input.kind === 'brand_book') {
    for (const id of ['overview', 'strategy', 'verbal'] as const) chapters.push(factsChapter(id, section(BRAND_BOOK_SECTIONS[id]), audience))
    for (const id of ['color', 'type', 'logo'] as const) {
      if (!input.identity) chapters.push(factsChapter(id, section(BRAND_BOOK_SECTIONS[id]), audience))
      else chapters.push({ kind: 'plate', chapter_id: id, entries: printable(section(BRAND_BOOK_SECTIONS[id]).filter((entry) => !ON_PLATE.has(entry.id)), audience) })
    }
    chapters.push(unavailable('mascot', input.mascot === 'on' ? 'separate_print' : 'module_off', audience))
    chapters.push(factsChapter('governance', section(BRAND_BOOK_SECTIONS.governance), audience))
    chapters.push(unavailable('motion', 'planned', audience))
    chapters.push(unavailable('applications', 'planned', audience))
  } else {
    for (const id of ['executive_summary', 'customer_problem', 'business_model'] as const) chapters.push(factsChapter(id, section(REPORT_SECTIONS[id]), audience))
    const block = input.canvas?.blocks.find((item) => item.type === 'business_model_canvas')
    if (block && block.type === 'business_model_canvas') {
      const zones = BMC_ZONE_IDS.map((zone_id) => {
        const zone = block.zones.find((item) => item.zone_id === zone_id)
        return { zone_id, order: zone?.order ?? BMC_ZONE_IDS.indexOf(zone_id) + 1, entries: printable(zone?.entries ?? [], audience) }
      })
      const all = zones.flatMap((zone) => zone.entries)
      chapters.push(hasValue(all) ? { kind: 'canvas', chapter_id: 'business_model_canvas', zones } : unavailable('business_model_canvas', profileNotApplicable(all) ? 'not_applicable' : 'no_approved_facts', audience, all))
    } else chapters.push(unavailable('business_model_canvas', 'no_approved_facts', audience))
    // Competitor data is internal by design (owner-reviewed, cited observations); the public report leaves it out.
    if (audience === 'internal') chapters.push(unavailable('competitors', input.competitors ? 'separate_print' : 'no_approved_facts', audience))
    for (const id of ['product', 'financials', 'goals', 'risks'] as const) chapters.push(factsChapter(id, section(REPORT_SECTIONS[id]), audience))
  }
  const printed = chapters.flatMap((chapter) => (chapter.kind === 'facts' || chapter.kind === 'plate' ? chapter.entries : chapter.kind === 'canvas' ? chapter.zones.flatMap((zone) => zone.entries) : []))
  return {
    schema: BOOK_SCHEMA,
    schema_version: 1,
    book_kind: input.kind,
    brand_id: input.brand_id,
    brand_name: input.brand_name,
    audience,
    illustrative: input.illustrative,
    origin: input.illustrative ? 'illustrative_fixture' : 'brand_repository',
    as_of: latest([...printed.map((entry) => (entry.value !== null ? entry.approved_at : null)), input.kind === 'brand_book' ? input.identity?.as_of : null]),
    identity: input.kind === 'brand_book' ? (input.identity ?? null) : null,
    canvas: input.kind === 'business_report' && input.canvas ? referenceOnly(input.canvas) : null,
    chapters,
  }
}

/** Entries of every section of a document spec, through `itemFor` (approved facts, drafts, gaps, withheld). */
function specEntries(engine: InterviewEngine, spec: DocumentSpec, audience: DocumentAudience, now: Date): Record<string, VisualEntry[]> {
  const root = engine.workspaceRoot()
  const brandId = engine.config().brand.slug
  const facts = readFacts(root, 'approved', brandId)
  const answers = latestAnswers(engine.ledger().records)
  const context: ItemContext = { facts, answers, audience, root, brandId, evidence: readEvidence(root), now }
  const out: Record<string, VisualEntry[]> = {}
  // BOS-15: the same applicability as the documents and Studio: itself, a personal answer standing in, or not applicable.
  const applicability = brandApplicability(engine)
  const resolve = (ids: readonly string[]): FrameworkRef[] => {
    const known = ids.filter((id) => engine.question(id))
    return applicability.refsFor(known)
  }
  for (const section of spec.sections) {
    out[section.id] = resolve(section.questions).flatMap((ref) => {
      const question = engine.question(ref.id)
      const framed = question ? frameworkEntry(engine, context, ref, now) : null
      if (!question || !framed) return []
      const { approved: _approved, ...entry } = framed
      // Defence in depth: a restricted question never carries a value into a book, whatever the fact says.
      return [question.sensitivity === 'restricted' ? { ...valueless(entry), state: (audience === 'public' ? 'missing' : 'withheld') as DataState, missing_reason: audience === 'public' ? ('not_published' as const) : null } : entry]
    })
  }
  return out
}

export interface BuildBookOptions {
  identity?: VisualDocument | null
  canvas?: VisualDocument | null
  competitors?: VisualDocument | null
  now?: Date
}

/** The full Brand Book or Business Report of this brand, in one edition. Reads only; writes nothing. */
export function buildBook(engine: InterviewEngine, kind: BookKind, audience: DocumentAudience, options: BuildBookOptions = {}): BookDocument {
  const config = engine.config()
  const now = options.now ?? new Date()
  const spec = kind === 'brand_book' ? BRAND_BOOK : BUSINESS_PLAN
  const rows = options.competitors?.blocks.find((block) => block.type === 'competitor_matrix')
  return composeBook({
    kind,
    audience,
    brand_id: config.brand.slug,
    brand_name: String(config.brand.name ?? config.brand.slug),
    illustrative: false,
    sections: specEntries(engine, spec, audience, now),
    identity: options.identity ?? null,
    canvas: options.canvas ?? null,
    mascot: config.modules.mascot.enabled ? 'on' : 'off',
    competitors: Boolean(rows && rows.type === 'competitor_matrix' && rows.rows.some((row) => row.kind === 'competitor')),
  })
}
