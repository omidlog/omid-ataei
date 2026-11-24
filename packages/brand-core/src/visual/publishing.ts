import { moduleEnabled } from '../conditions.js'
import { buildNamedDocument, type DocumentKind, type DocumentModel, type PersonalDocumentKind } from '../documents/index.js'
import type { InterviewEngine } from '../engine.js'
import { readFacts } from '../facts.js'
import type { Visibility } from '../types.js'
import type { BookChapter, BookDocument } from './full-book.js'
import {
  DATA_STATES,
  type DataState,
  type LogoVariant,
  type MascotAtlasBlock,
  type MascotEvolutionBlock,
  type PrintProfile,
  type VisualAudience,
  type VisualDocument,
  type VisualEntry,
} from './model.js'

/**
 * Visual V4.1: export audience profiles, the redaction each one applies, and the Publishing gallery (document types ×
 * export profiles with their readiness).
 *
 * Redaction runs on the documents the existing builders produce; it never adds a value, only removes one. The rules:
 *
 * - A restricted question never carries a value in any profile (Studio, agents and exports alike).
 * - Finance questions (`business.finance.*`, a finance module, or a `financial` approval grant) carry a value only in
 *   the internal profile; public and investor see "withheld". No banded or ratio level exists yet
 *   (docs-internal/FINANCE_SECURITY_DESIGN.md §6), so nothing finer is ever emitted.
 * - A source under `.private` is never cited outside the internal profile, and an entry that cites one loses its value.
 * - Public and investor show approved values only (stale = approved but review overdue still counts). Drafts,
 *   estimates and suggestions lose their value.
 * - Draft marks never leave the owner (owner decision 2026-11-23): no badge survives outside the internal profile.
 *   Investor follows public for a draft-tagged asset (owner decision 2026-11-24): a published logo master that still
 *   carries a `draft` tag is drawn without any mark in both, and an unpublished one tagged `draft` is drawn in neither.
 *   The public edition comes from the public builders, which draw only published masters and never attach a mark; the
 *   investor profile (built from the internal edition) keeps a draft-tagged master only when it has no `internal_only`
 *   badge (that is, it is published). Mascot artwork tagged `draft` is never drawn in public (the mascot builder's
 *   rule), so investor does not draw it either.
 * - An entry whose question is unknown to the bank fails closed outside the internal profile.
 * - A document type a profile does not permit (competitor analysis outside internal; business and marketing plans in
 *   public) is refused: the redactor returns null.
 *
 * Gallery cells are counts only, never values, so the gallery itself can never leak what it measures.
 */

export const EXPORT_PROFILES = ['public', 'investor', 'internal'] as const
export type ExportProfile = (typeof EXPORT_PROFILES)[number]

export interface ExportProfileSpec {
  id: ExportProfile
  /** The edition the existing builders produce for this profile, before redaction. */
  edition: VisualAudience
  /** Data states whose values may be shown. Every other state loses its value. */
  shows: readonly DataState[]
  /** Finance questions may show a value. */
  finance_values: boolean
  /** Draft-tagged assets may be drawn and badges kept. */
  draft_marks: boolean
  /** Sources under `.private` may be cited. */
  private_sources: boolean
}

const APPROVED_ONLY: readonly DataState[] = ['approved', 'stale']

export const EXPORT_PROFILE_SPECS: Record<ExportProfile, ExportProfileSpec> = {
  public: { id: 'public', edition: 'public', shows: APPROVED_ONLY, finance_values: false, draft_marks: false, private_sources: false },
  investor: { id: 'investor', edition: 'internal', shows: APPROVED_ONLY, finance_values: false, draft_marks: false, private_sources: false },
  internal: { id: 'internal', edition: 'internal', shows: DATA_STATES, finance_values: true, draft_marks: true, private_sources: true },
}

/** Document types the gallery lists, with standard names in the renderer catalogs. */
export const PUBLISHING_DOCUMENT_TYPES = ['brand_book', 'visual_identity', 'business_model_canvas', 'mascot_atlas', 'competitor_comparison', 'business_plan', 'marketing_plan'] as const

/**
 * BOS-19: the Personal Brand OS documents. The gallery lists them only for a brand with `modules.personal.enabled`, and
 * only those that apply (the Speaker Kit needs the speaker-author facet).
 */
export const PERSONAL_PUBLISHING_TYPES = [
  'personal_brand_book',
  'professional_bio',
  'linkedin_pack',
  'website_pack',
  'media_kit',
  'speaker_kit',
  'content_strategy',
  'portfolio_pack',
  'services_pack',
  'evidence_register',
] as const
export type PersonalPublishingType = (typeof PERSONAL_PUBLISHING_TYPES)[number]
export type PublishingDocumentType = (typeof PUBLISHING_DOCUMENT_TYPES)[number] | PersonalPublishingType

/** Gallery type → personal document kind (the `brand:document --type` value). */
export const PERSONAL_PUBLISHING_KIND: Record<PersonalPublishingType, PersonalDocumentKind> = {
  personal_brand_book: 'personal-brand-book',
  professional_bio: 'professional-bio',
  linkedin_pack: 'linkedin-pack',
  website_pack: 'website-pack',
  media_kit: 'media-kit',
  speaker_kit: 'speaker-kit',
  content_strategy: 'content-strategy',
  portfolio_pack: 'portfolio-pack',
  services_pack: 'services-pack',
  evidence_register: 'evidence-register',
}

export function isPersonalPublishingType(type: string): type is PersonalPublishingType {
  return (PERSONAL_PUBLISHING_TYPES as readonly string[]).includes(type)
}

/**
 * Which profiles may receive which document type. Anything not listed is refused by the redactor.
 *
 * Personal documents: the outward-facing packs have a public edition (published facts only, built by the public
 * builder). The content strategy and the evidence register (sources and permissions) are internal only, and no
 * personal document has an investor edition: a person's career history and evidence are not investor material.
 */
export const PROFILE_DOCUMENTS: Record<ExportProfile, readonly PublishingDocumentType[]> = {
  public: ['brand_book', 'visual_identity', 'business_model_canvas', 'mascot_atlas', 'personal_brand_book', 'professional_bio', 'linkedin_pack', 'website_pack', 'media_kit', 'speaker_kit', 'portfolio_pack', 'services_pack'],
  investor: ['brand_book', 'visual_identity', 'business_model_canvas', 'mascot_atlas', 'business_plan', 'marketing_plan'],
  internal: [...PUBLISHING_DOCUMENT_TYPES, ...PERSONAL_PUBLISHING_TYPES],
}

export function profilePermits(profile: ExportProfile, type: PublishingDocumentType): boolean {
  return PROFILE_DOCUMENTS[profile].includes(type)
}

/** What redaction needs to know about a question. Undefined: not in the bank (fails closed outside internal). */
export interface QuestionClass {
  sensitivity: Visibility
  finance: boolean
}
export type QuestionClassifier = (id: string) => QuestionClass | undefined

/** The classifier for a brand's question bank. */
export function questionClassifier(engine: InterviewEngine): QuestionClassifier {
  const byId = new Map(
    engine.questions().map((question) => [
      question.id,
      { sensitivity: question.sensitivity, finance: question.id.startsWith('business.finance.') || /(^|[.-])finance($|[.-])/.test(question.module) || question.approval_grant === 'financial' },
    ]),
  )
  return (id) => byId.get(id)
}

const PRIVATE_SOURCE = /(^|[/\\])\.private([/\\]|$)/

/** Why an entry lost its value; recorded in its note so a reader is told, never left guessing. */
type RedactionReason = 'restricted' | 'finance' | 'private_source' | 'not_approved' | 'unknown_question'

const REDACTION_NOTE: Record<RedactionReason, string> = {
  restricted: 'Restricted. Never shown in any export.',
  finance: 'Finance figure. Withheld outside the internal profile.',
  private_source: 'Cites an owner-only source. Withheld outside the internal profile.',
  not_approved: 'Not approved. Withheld outside the internal profile.',
  unknown_question: 'Not in the question bank. Withheld outside the internal profile.',
}

function redactionReason(entry: VisualEntry, spec: ExportProfileSpec, classify: QuestionClassifier): RedactionReason | null {
  const known = classify(entry.id)
  if (known?.sensitivity === 'restricted') return 'restricted'
  if (spec.id === 'internal') return null
  if (!known) return 'unknown_question'
  if (known.finance && !spec.finance_values) return 'finance'
  if (!spec.private_sources && entry.sources.some((source) => PRIVATE_SOURCE.test(source))) return 'private_source'
  if (!spec.shows.includes(entry.state)) return 'not_approved'
  return null
}

function isEntry(value: unknown): value is VisualEntry {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string' && typeof record.state === 'string' && 'value' in record && Array.isArray(record.sources) && 'missing_reason' in record
}

/** States that never carried a value: nothing to redact, and counting them as redacted would lie. */
const EMPTY_STATES: ReadonlySet<DataState> = new Set(['missing', 'withheld', 'not_applicable'])

interface RedactionTally {
  redacted: number
  moves: Array<[DataState, DataState]>
}

function redactEntry(entry: VisualEntry, spec: ExportProfileSpec, classify: QuestionClassifier, tally: RedactionTally): VisualEntry {
  const sources = spec.private_sources ? entry.sources : entry.sources.filter((source) => !PRIVATE_SOURCE.test(source))
  const reason = redactionReason(entry, spec, classify)
  if (!reason) return { ...entry, sources }
  if (EMPTY_STATES.has(entry.state) && entry.value === null) return { ...entry, sources }
  tally.redacted += 1
  tally.moves.push([entry.state, 'withheld'])
  return { ...entry, state: 'withheld', value: null, sources, approved_at: null, review_due: null, version: null, note: REDACTION_NOTE[reason], missing_reason: null }
}

/** Deep copy with every visual entry redacted. Blocks are walked generically, so a new block type is covered too. */
function walk(value: unknown, spec: ExportProfileSpec, classify: QuestionClassifier, tally: RedactionTally): unknown {
  if (Array.isArray(value)) return value.map((item) => walk(item, spec, classify, tally))
  if (!value || typeof value !== 'object') return value
  if (isEntry(value)) return redactEntry(value, spec, classify, tally)
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) out[key] = walk(child, spec, classify, tally)
  return out
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] }

/** Derived drawings must follow their source fact: no palette, type scale or logo spec without the approved value. */
function clearDerived(block: Mutable<VisualDocument['blocks'][number]>, spec: ExportProfileSpec): void {
  if (block.type === 'color_palette' && block.source.value === null) {
    block.colors = []
    block.combinations = []
    block.grid = null
  }
  if (block.type === 'typography_specimen' && block.source.value === null) block.roles = []
  if (block.type === 'logo_construction') {
    if (block.source.value === null) block.spec = null
    if (!spec.draft_marks && block.master) {
      // Same as public: a draft-tagged master is drawn only when it is published (no `internal_only` badge).
      if (block.master.badges.includes('draft_tag') && block.master.badges.includes('internal_only')) {
        block.master = null
        block.master_state = 'missing'
      } else block.master = { ...block.master, badges: [] }
    }
    if (!spec.draft_marks) {
      // The logo system (BOS-16) follows the same rule per file; without a master there is no system. Candidate ids
      // are an owner hint and never leave the internal profile.
      const keep = (variant: LogoVariant | null): LogoVariant | null => (!variant || (variant.badges.includes('draft_tag') && variant.badges.includes('internal_only')) ? null : { ...variant, badges: [] })
      if (block.system !== undefined) {
        const system = block.master && block.system ? { on_light: keep(block.system.on_light), on_dark: keep(block.system.on_dark), icon: keep(block.system.icon) } : null
        block.system = system && (system.on_light || system.on_dark || system.icon) ? system : null
      }
      if (block.candidates !== undefined) block.candidates = []
    }
  }
  if (block.type === 'mascot_atlas' && !spec.draft_marks) redactAtlas(block)
  if (block.type === 'mascot_evolution' && !spec.draft_marks) redactEvolution(block)
}

function redactAtlas(block: Mutable<MascotAtlasBlock>): void {
  block.entries = block.entries.map((entry) => {
    if (entry.gap === 'in_review') return { ...entry, gap: 'not_published' }
    if (!entry.artwork) return entry
    if (entry.artwork.badges.includes('draft_tag')) return { ...entry, artwork: null, variants: 0, gap: 'not_published', usage: null, do: [], dont: [] }
    return { ...entry, artwork: { ...entry.artwork, badges: [] } }
  })
  const drawn = block.entries.filter((entry) => entry.artwork).length
  block.counts = { states: block.entries.length, drawn, in_review: 0, awaiting: block.entries.length - drawn }
}

function redactEvolution(block: Mutable<MascotEvolutionBlock>): void {
  block.slots = block.slots.map((slot) => {
    // Only an approved stage definition is named outside the owner's profile (the public builder's own rule).
    const base = slot.definition === 'approved' ? slot : { ...slot, name: null, summary: null }
    if (base.gap === 'in_review') return { ...base, gap: 'not_published' as const }
    if (!base.artwork) return base
    if (base.artwork.badges.includes('draft_tag')) return { ...base, artwork: null, gap: 'not_published' as const }
    return { ...base, artwork: { ...base.artwork, badges: [] } }
  })
}

/**
 * Document kinds the gallery publishes. Visual V3.2's SWOT / TOWS and Value Proposition Canvas are not gallery types
 * yet (their lists are internal); a kind without an entry is never redacted for a profile, so it is never exported.
 */
const VISUAL_TYPE: Partial<Record<VisualDocument['document_kind'], PublishingDocumentType>> = {
  business_model_canvas: 'business_model_canvas',
  visual_identity: 'visual_identity',
  competitor_comparison: 'competitor_comparison',
  mascot_atlas: 'mascot_atlas',
  // Visual V3.3: the journey map and SOSTAC overview are views of the marketing plan, the OKR tree of the business plan.
  customer_journey: 'marketing_plan',
  sostac_overview: 'marketing_plan',
  okr_tree: 'business_plan',
}

/**
 * Whether a profile may receive a visual document kind at all (the gate `redactVisualDocument` applies first). Studio
 * asks this before offering or serving an edition, so a view of a plan never reaches a profile its plan may not.
 */
export function visualProfilePermits(profile: ExportProfile, kind: VisualDocument['document_kind']): boolean {
  const type = VISUAL_TYPE[kind]
  return type !== undefined && profilePermits(profile, type)
}

export interface RedactedVisual {
  profile: ExportProfile
  document: VisualDocument
  /** Entries that had a value and lost it to this profile. */
  redacted: number
}

/**
 * The document as the profile may receive it, or null when the profile does not permit this document type, or the
 * document was built for a wider audience than the profile allows (a public profile never starts from an internal
 * edition: the public builders already apply publication rules redaction cannot re-derive).
 */
export function redactVisualDocument(doc: VisualDocument, profile: ExportProfile, classify: QuestionClassifier): RedactedVisual | null {
  const spec = EXPORT_PROFILE_SPECS[profile]
  const type = VISUAL_TYPE[doc.document_kind]
  if (!type || !profilePermits(profile, type)) return null
  if (spec.edition === 'public' && doc.audience !== 'public') return null
  const tally: RedactionTally = { redacted: 0, moves: [] }
  const blocks = (walk(doc.blocks, spec, classify, tally) as VisualDocument['blocks']).map((block) => {
    const copy = { ...block } as Mutable<VisualDocument['blocks'][number]>
    clearDerived(copy, spec)
    return copy as VisualDocument['blocks'][number]
  })
  const status_summary = { ...doc.status_summary }
  for (const [from, to] of tally.moves) {
    if (status_summary[from] > 0) status_summary[from] -= 1
    status_summary[to] += 1
  }
  const document: VisualDocument = { ...doc, framework_refs: doc.framework_refs.map((ref) => ({ ...ref })), blocks, status_summary }
  return { profile, document, redacted: tally.redacted }
}

const DOCUMENT_TYPE: Partial<Record<DocumentKind, PublishingDocumentType>> = {
  'brand-book': 'brand_book',
  'business-plan': 'business_plan',
  'marketing-plan': 'marketing_plan',
  ...Object.fromEntries(Object.entries(PERSONAL_PUBLISHING_KIND).map(([type, kind]) => [kind, type as PersonalPublishingType])),
}

export interface RedactedDocument {
  profile: ExportProfile
  document: DocumentModel
  redacted: number
}

/** A prose document (Brand Book, business plan, marketing plan) under the same rules, or null when not permitted. */
export function redactDocumentModel(model: DocumentModel, profile: ExportProfile, classify: QuestionClassifier): RedactedDocument | null {
  const spec = EXPORT_PROFILE_SPECS[profile]
  const type = DOCUMENT_TYPE[model.kind]
  if (!type || !profilePermits(profile, type)) return null
  if (spec.edition === 'public' && model.audience !== 'public') return null
  let redacted = 0
  const sections = model.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      const sources = spec.private_sources ? [...item.source_ids] : item.source_ids.filter((source) => !PRIVATE_SOURCE.test(source))
      const state: DataState = item.withheld ? 'withheld' : item.tag === 'approved' ? 'approved' : item.tag === 'missing' ? 'missing' : item.tag
      const reason = redactionReason({ id: item.id, state, value: item.value === null ? null : String(item.value), sources: item.source_ids } as VisualEntry, spec, classify)
      const hasValue = item.value !== null || item.structured !== null
      if (!reason || !hasValue) return { ...item, source_ids: sources }
      redacted += 1
      return { ...item, value: null, structured: null, source_ids: sources, version: null, withheld: true, tag: item.tag === 'approved' ? item.tag : ('missing' as const), note: REDACTION_NOTE[reason] }
    }),
  }))
  // A composed draft (personal documents, BOS-19) is built from the values above. When any value was removed, every
  // draft goes too (fail closed): a draft may also use a translation companion from another section.
  const cleaned = redacted > 0 ? sections.map(({ drafts: _drafts, ...section }) => section) : sections
  return { profile, document: { ...model, sections: cleaned }, redacted }
}

export interface RedactedBook {
  profile: ExportProfile
  document: BookDocument
  redacted: number
}

/**
 * A full book (V4.2 Brand Book or Business Report) under the same rules, or null when not permitted. The Business
 * Report is the business plan as a book, so it follows the business plan's permission (never public). The public
 * edition never carries a withheld mark: a removed value reads "not published", like every other public gap. A facts
 * or canvas chapter left without any value becomes a designed "not yet available" chapter, as `composeBook` does.
 */
export function redactBook(book: BookDocument, profile: ExportProfile, classify: QuestionClassifier): RedactedBook | null {
  const spec = EXPORT_PROFILE_SPECS[profile]
  if (!profilePermits(profile, book.book_kind === 'brand_book' ? 'brand_book' : 'business_plan')) return null
  if (spec.edition === 'public' && book.audience !== 'public') return null
  const tally: RedactionTally = { redacted: 0, moves: [] }
  const entries = (list: VisualEntry[]): VisualEntry[] =>
    list.map((entry) => {
      const out = redactEntry(entry, spec, classify, tally)
      return book.audience === 'public' && out.state === 'withheld' ? { ...out, state: 'missing' as const, note: null, missing_reason: 'not_published' as const } : out
    })
  const valued = (list: VisualEntry[]) => list.some((entry) => (entry.state === 'approved' || entry.state === 'stale') && entry.value !== null)
  const gap = (chapter_id: BookChapter['chapter_id'], awaiting: VisualEntry[]): BookChapter => ({ kind: 'unavailable', chapter_id, reason: 'no_approved_facts', awaiting: book.audience === 'internal' ? awaiting : [] })
  const chapters = book.chapters.map((chapter): BookChapter => {
    if (chapter.kind === 'facts') {
      const kept = entries(chapter.entries)
      return valued(kept) ? { ...chapter, entries: kept } : gap(chapter.chapter_id, kept)
    }
    if (chapter.kind === 'plate') return { ...chapter, entries: entries(chapter.entries) }
    if (chapter.kind === 'canvas') {
      const zones = chapter.zones.map((zone) => ({ ...zone, entries: entries(zone.entries) }))
      return valued(zones.flatMap((zone) => zone.entries)) ? { ...chapter, zones } : gap(chapter.chapter_id, zones.flatMap((zone) => zone.entries))
    }
    return { ...chapter, awaiting: entries(chapter.awaiting) }
  })
  const embedded = (doc: VisualDocument | null): VisualDocument | null => (doc ? (redactVisualDocument(doc, profile, classify)?.document ?? null) : null)
  const identity = embedded(book.identity)
  const canvas = embedded(book.canvas)
  const printed = chapters.flatMap((chapter) => (chapter.kind === 'facts' || chapter.kind === 'plate' ? chapter.entries : chapter.kind === 'canvas' ? chapter.zones.flatMap((zone) => zone.entries) : []))
  const as_of = [...printed.map((entry) => (entry.value !== null ? entry.approved_at : null)), book.book_kind === 'brand_book' ? identity?.as_of : null].filter((date): date is string => Boolean(date)).sort().at(-1) ?? null
  return { profile, document: { ...book, identity, canvas, chapters, as_of }, redacted: tally.redacted }
}

// ---- Coverage mini-map (Command Center) --------------------------------------------------------------------

export type CoverageState = 'complete' | 'partial' | 'missing' | 'withheld' | 'not_applicable'

/** One cell per zone (canvas), block (identity, atlas) or section (prose): its state, never its value. */
export function coverageCells(doc: VisualDocument | DocumentModel): Array<{ id: string; state: CoverageState }> {
  if ('sections' in doc) return doc.sections.map((section) => ({ id: section.id, state: section.status }))
  const cells: Array<{ id: string; state: CoverageState }> = []
  for (const block of doc.blocks) {
    if (block.type === 'business_model_canvas') for (const zone of block.zones) cells.push({ id: zone.zone_id, state: zone.state })
    else if (block.type === 'citation_list') continue
    else cells.push({ id: block.block_id, state: block.data_state })
  }
  return cells
}

// ---- Publishing gallery --------------------------------------------------------------------------------------

export const PUBLISHING_READINESS = ['ready', 'partial', 'empty', 'not_applicable', 'blocked'] as const
export type PublishingReadiness = (typeof PUBLISHING_READINESS)[number]

/**
 * How the cell can be exported today: an existing print view in Studio, a command the owner runs locally (Studio shows
 * it as text and never runs it), a composer still planned, or nothing.
 */
export type PublishingExport = 'print' | 'command' | 'planned' | 'none'

export interface PublishingCell {
  document_type: PublishingDocumentType
  profile: ExportProfile
  readiness: PublishingReadiness
  /** Values the profile shows, gaps it still has, and values this profile removed. Counts only. */
  shown: number
  gaps: number
  redacted: number
  export: PublishingExport
  paper: PrintProfile | null
}

export interface PublishingGallery {
  schema: 'brand-os.publishing-gallery/1'
  profiles: ExportProfile[]
  document_types: PublishingDocumentType[]
  cells: PublishingCell[]
  /** Approved facts whose review date has passed (counted, not listed). */
  review_due: number
}

/** Print views that exist today, by document type and the edition they serve. Investor has no composer yet. */
const PRINT_VIEWS: Partial<Record<PublishingDocumentType, readonly ExportProfile[]>> = {
  business_model_canvas: ['public', 'internal'],
  visual_identity: ['public', 'internal'],
  mascot_atlas: ['public', 'internal'],
  competitor_comparison: ['internal'],
}

/**
 * Local export commands that exist today (`brand:export-visual`, V4.2), by document type and profile. The full Brand
 * Book prints in the internal and public editions; there is no investor edition, and the Business Report is internal
 * only (owner decision 2026-11-24), so neither is listed for investor.
 */
const EXPORT_COMMANDS: Partial<Record<PublishingDocumentType, Partial<Record<ExportProfile, string>>>> = {
  brand_book: {
    public: 'npm run brand:export-visual -- --doc brand-book --edition public',
    internal: 'npm run brand:export-visual -- --doc brand-book --edition internal',
  },
  // Personal documents export as Markdown through the existing local command; Studio shows it as text only.
  ...Object.fromEntries(
    PERSONAL_PUBLISHING_TYPES.map((type) => [
      type,
      Object.fromEntries(
        (['public', 'internal'] as const)
          .filter((profile) => PROFILE_DOCUMENTS[profile].includes(type))
          .map((profile) => [profile, `npm run brand:document -- --type ${PERSONAL_PUBLISHING_KIND[type]} --audience ${profile}`]),
      ),
    ]),
  ),
}

/** The local command that exports this document for this profile, or null when none exists. Text only. */
export function publishingExportCommand(type: PublishingDocumentType, profile: ExportProfile): string | null {
  if (!profilePermits(profile, type)) return null
  return EXPORT_COMMANDS[type]?.[profile] ?? null
}

function exportOf(type: PublishingDocumentType, profile: ExportProfile): PublishingExport {
  if (!profilePermits(profile, type)) return 'none'
  if (PRINT_VIEWS[type]?.includes(profile)) return 'print'
  return publishingExportCommand(type, profile) ? 'command' : 'planned'
}

/**
 * BOS-15: true when every entry of a visual document is a question the brand's interview profile does not ask and no
 * personal answer stands in for (`na_reason: 'profile'`). The framework is then "not applicable to this profile".
 */
export function visualNotApplicable(doc: VisualDocument): boolean {
  let entries = 0
  let notApplicable = 0
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!value || typeof value !== 'object') return
    if (isEntry(value)) {
      entries += 1
      if (value.na_reason === 'profile') notApplicable += 1
      return
    }
    for (const child of Object.values(value)) visit(child)
  }
  for (const block of doc.blocks) visit(block)
  return entries > 0 && entries === notApplicable
}

function countVisual(doc: VisualDocument): { shown: number; gaps: number } {
  let shown = 0
  let gaps = 0
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!value || typeof value !== 'object') return
    if (isEntry(value)) {
      if (value.state === 'not_applicable') return
      if (value.value !== null) shown += 1
      else gaps += 1
      return
    }
    for (const child of Object.values(value)) visit(child)
  }
  for (const block of doc.blocks) {
    if (block.type === 'citation_list') continue
    if (block.type === 'mascot_atlas') {
      shown += block.entries.filter((entry) => entry.artwork).length
      gaps += block.entries.filter((entry) => !entry.artwork).length
      continue
    }
    if (block.type === 'mascot_evolution') {
      shown += block.slots.filter((slot) => slot.artwork).length
      gaps += block.slots.filter((slot) => !slot.artwork && slot.stage_id).length
      continue
    }
    if (block.type === 'competitor_matrix') {
      for (const row of block.rows) for (const cell of row.cells) {
        if (cell.own) visit(cell.own)
        else if (cell.state === 'unknown') gaps += 1
        else shown += 1
      }
      continue
    }
    visit(block)
  }
  return { shown, gaps }
}

function countDocument(model: DocumentModel): { shown: number; gaps: number } {
  let shown = 0
  let gaps = 0
  for (const section of model.sections) for (const item of section.items) {
    if (item.tag === 'recommendation' && item.value === null) continue
    if (item.value !== null || item.structured !== null) shown += 1
    else gaps += 1
  }
  return { shown, gaps }
}

function readiness(counts: { shown: number; gaps: number }): PublishingReadiness {
  if (counts.shown === 0) return 'empty'
  return counts.gaps === 0 ? 'ready' : 'partial'
}

export interface PublishingInput {
  bmc?: { applies: boolean; internal: VisualDocument; public: VisualDocument } | null
  identity?: { internal: VisualDocument; public: VisualDocument } | null
  mascot?: { internal: VisualDocument; public: VisualDocument } | null
  competitors?: VisualDocument | null
  /** Override for tests; defaults to the brand's own question bank. */
  classify?: QuestionClassifier
  now?: Date
}

/**
 * Document types × export profiles with their readiness, measured on the redacted output each profile would receive.
 * A document that could not be built is counted as empty, never filled in.
 */
export function buildPublishingGallery(engine: InterviewEngine, input: PublishingInput): PublishingGallery {
  const classify = input.classify ?? questionClassifier(engine)
  const cells: PublishingCell[] = []
  const prose: Partial<Record<PublishingDocumentType, DocumentKind>> = { brand_book: 'brand-book', business_plan: 'business-plan', marketing_plan: 'marketing-plan' }
  const editions = (type: PublishingDocumentType): { internal: VisualDocument; public: VisualDocument } | null => {
    if (type === 'business_model_canvas') return input.bmc ?? null
    if (type === 'visual_identity') return input.identity ?? null
    if (type === 'mascot_atlas') return input.mascot ?? null
    if (type === 'competitor_comparison') return input.competitors ? { internal: input.competitors, public: input.competitors } : null
    return null
  }
  const proseCache = new Map<string, DocumentModel>()
  const proseDoc = (kind: DocumentKind, edition: VisualAudience): DocumentModel => {
    const key = `${kind}:${edition}`
    if (!proseCache.has(key)) proseCache.set(key, buildNamedDocument(engine, kind, edition))
    return proseCache.get(key)!
  }
  // BOS-19: personal documents, for a personal brand, when they apply (a facet document needs its facet).
  for (const type of PERSONAL_PUBLISHING_TYPES) prose[type] = PERSONAL_PUBLISHING_KIND[type]
  const personal = moduleEnabled({ optional: 'personal' }, engine.config())
  const personalTypes = personal ? PERSONAL_PUBLISHING_TYPES.filter((type) => proseDoc(PERSONAL_PUBLISHING_KIND[type], 'internal').sections.length > 0) : []
  const documentTypes: PublishingDocumentType[] = [...PUBLISHING_DOCUMENT_TYPES, ...personalTypes]
  for (const type of documentTypes) {
    for (const profile of EXPORT_PROFILES) {
      const spec = EXPORT_PROFILE_SPECS[profile]
      const base = { document_type: type, profile, export: exportOf(type, profile), redacted: 0 }
      if (!profilePermits(profile, type)) {
        cells.push({ ...base, readiness: 'blocked', shown: 0, gaps: 0, paper: null })
        continue
      }
      const kind = prose[type]
      if (kind) {
        const redacted = redactDocumentModel(proseDoc(kind, spec.edition), profile, classify)
        const counts = redacted ? countDocument(redacted.document) : { shown: 0, gaps: 0 }
        // BOS-15: a document whose every section is not applicable to the brand's profile is not applicable, not empty.
        const sections = redacted?.document.sections ?? []
        const notApplicable = sections.length > 0 && sections.every((section) => section.status === 'not_applicable')
        cells.push({ ...base, ...counts, redacted: redacted?.redacted ?? 0, readiness: notApplicable ? 'not_applicable' : readiness(counts), paper: 'book_a4_portrait' })
        continue
      }
      const pair = editions(type)
      const source = pair ? pair[spec.edition] : null
      const result = source ? redactVisualDocument(source, profile, classify) : null
      if (!result) {
        cells.push({ ...base, readiness: 'empty', shown: 0, gaps: 0, paper: null })
        continue
      }
      // A comparison with no shared competitors is only the own-brand row: nothing to compare, so it is empty.
      const unshared = result.document.blocks.some((block) => block.type === 'competitor_matrix' && block.share_state !== 'shared')
      const counts = unshared ? { shown: 0, gaps: 0 } : countVisual(result.document)
      const notApplicable =
        (type === 'business_model_canvas' && input.bmc?.applies === false) ||
        (type === 'mascot_atlas' && result.document.blocks.some((block) => block.type === 'mascot_atlas' && !block.module_enabled))
      cells.push({ ...base, ...counts, redacted: result.redacted, readiness: notApplicable ? 'not_applicable' : readiness(counts), paper: result.document.print_profile })
    }
  }
  return { schema: 'brand-os.publishing-gallery/1', profiles: [...EXPORT_PROFILES], document_types: documentTypes, cells, review_due: reviewDue(engine, input.now ?? new Date()) }
}

function reviewDue(engine: InterviewEngine, now: Date): number {
  try {
    let due = 0
    for (const fact of Object.values(readFacts(engine.workspaceRoot(), 'approved', engine.config().brand.slug))) {
      const at = fact.review_due ? Date.parse(fact.review_due) : NaN
      if (Number.isFinite(at) && at < now.getTime()) due += 1
    }
    return due
  } catch {
    return 0
  }
}
