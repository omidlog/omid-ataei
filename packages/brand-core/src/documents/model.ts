import { brandApplicability, type FrameworkRef } from '../applicability.js'
import { allModules } from '../content/index.js'
import { latestAnswers } from '../completeness.js'
import type { InterviewEngine } from '../engine.js'
import { readFacts, type CanonicalFact } from '../facts.js'
import { factIsPublic } from '../publication.js'
import { isStructuredType, parseStructured, type StructuredType, type StructuredValue } from '../structured.js'
import { claimEvidence, evidenceFor, readEvidence, verificationNote, type ClaimVerification, type EvidenceItem } from '../evidence.js'
import { answerProvenance } from '../provenance.js'
import type { AnswerRecord, FieldQuestion, PersonalFacet } from '../types.js'
import type { ComposedDraft, DraftLocale } from './compose.js'

/**
 * Section model shared by the Brand Book, business plan and marketing plan.
 *
 * Every item carries exactly one tag:
 * - approved: a canonical approved fact (for the public audience: also published and public).
 * - assumption: an owner draft, estimate, or tentative proposal. Not a decision.
 * - recommendation: template guidance or an agent suggestion. Never a brand fact.
 * - missing: nothing usable. Nothing is invented to fill it.
 *
 * Each item lists its source ids so a reader can trace it to the ledger, the fact file or the template.
 * The public audience only ever receives approved+published items and missing placeholders.
 */

export const ITEM_TAGS = ['approved', 'assumption', 'recommendation', 'missing'] as const
export type ItemTag = (typeof ITEM_TAGS)[number]
export type DocumentAudience = 'public' | 'internal'
export const PERSONAL_DOCUMENT_KINDS = [
  'personal-brand-book',
  'professional-bio',
  'linkedin-pack',
  'website-pack',
  'media-kit',
  'speaker-kit',
  'content-strategy',
  'portfolio-pack',
  'services-pack',
  'evidence-register',
] as const
export type PersonalDocumentKind = (typeof PERSONAL_DOCUMENT_KINDS)[number]
export type DocumentKind = 'brand-book' | 'business-plan' | 'marketing-plan' | PersonalDocumentKind

export interface DocumentItem {
  id: string
  label: string
  tag: ItemTag
  kind: 'text' | StructuredType
  value: string | number | boolean | null
  structured: StructuredValue | null
  source_ids: string[]
  version: number | null
  withheld: boolean
  note: string | null
  /**
   * Personal claims only: verified (only independent, current evidence), partly_verified (independent
   * evidence plus an owner-stated part, named in the note), owner_published (only sources the owner
   * controls), owner_stated (the owner's word), unverified (needs evidence, has none) or not_required.
   * Null for non-personal items.
   */
  verification: ClaimVerification | null
  /**
   * Set to `agent_suggested_owner_confirmed` when an agent proposed the value and the owner confirmed it (BOS-06), so
   * a reader never takes it for owner-authored wording. Absent for owner-originated items and in public editions.
   */
  provenance?: 'agent_suggested_owner_confirmed' | null
  /**
   * BOS-15: the framework question this personal answer stands in for (a personal brand's own practice). `id` is the
   * personal question; its approval, verification and visibility rules decided the value. Absent otherwise.
   */
  stands_for?: string
}

export interface LengthReport {
  /** Guideline word range. A guideline, never a target to pad toward. */
  guideline: [number, number]
  /** Words in the approved values of this section, or in the composed draft when `basis` says so. */
  approved_words: number
  state: 'below' | 'within' | 'above'
  note: string
  /** BOS-19: personal documents count the composed draft of the first edition (`locale`), not the fact list. */
  basis?: 'approved_values' | 'composed_draft'
  locale?: DraftLocale
}

export interface DocumentSection {
  id: string
  title: string
  purpose: string
  /** `not_applicable`: no question of this section applies to the brand's profile (BOS-15). */
  status: 'complete' | 'partial' | 'missing' | 'not_applicable'
  items: DocumentItem[]
  length?: LengthReport
  /**
   * BOS-15: questions of this section the active profile does not ask and no personal answer stands in for. Labels and
   * ids only; they are "not applicable to this profile", never missing, and never counted as open.
   */
  not_applicable?: Array<{ id: string; label: string }>
  /**
   * BOS-19, personal documents: one composed draft paragraph per language edition, built only from the approved items
   * above (which stay as the Sources). Always a draft for the owner's approval.
   */
  drafts?: ComposedDraft[]
}

export interface DocumentModel {
  schema_version: 1
  kind: DocumentKind
  title: string
  brand_id: string
  audience: DocumentAudience
  note: string
  counts: Record<ItemTag, number>
  sections: DocumentSection[]
}

export interface SectionSpec {
  id: string
  title: string
  purpose: string
  questions: string[]
  /** Include the first guidance line of each module behind these questions as a recommendation (internal only). */
  guidance?: boolean
  /** Word guideline for composed text such as bio lengths. Reported, never padded. */
  words?: [number, number]
}

export interface DocumentSpec {
  kind: DocumentKind
  title: string
  sections: SectionSpec[]
  /** Personal documents need the personal module; a facet document also needs its facet. */
  requires?: { personal: true; facet?: PersonalFacet }
  /**
   * BOS-15: a framework document (Brand Book, business and marketing plans) reads its questions through
   * `brandApplicability`: each question shows itself, the personal answer standing in for it, or not applicable.
   */
  framework?: boolean
}

const MISSING_NOTES: Record<string, string> = {
  unknown: 'The owner said this is unknown. Nothing was invented.',
  skipped: 'Skipped by the owner.',
  not_applicable: 'Marked not applicable by the owner.',
  deprecated: 'The last answer was deprecated.',
}

function displayValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return JSON.stringify(value)
}

function kindOf(question: FieldQuestion): DocumentItem['kind'] {
  return isStructuredType(question.question_type) ? question.question_type : 'text'
}

function structured(question: FieldQuestion, value: unknown): StructuredValue | null {
  return isStructuredType(question.question_type) ? parseStructured(question.question_type, value) : null
}

/** Visual V3.1: a list question whose stored value is not a list. The text is kept and shown; this note flags it. */
export const LEGACY_ENTITY_NOTE = 'Legacy free text, kept as written. Not a list of items yet; brand:migrate can propose a conversion for review.'

function legacyNote(question: FieldQuestion, value: unknown, note: string | null): string | null {
  if (question.question_type !== 'repeating_entity' || value === null || value === undefined || value === '') return note
  if (structured(question, value)) return note
  return note ? `${note} ${LEGACY_ENTITY_NOTE}` : LEGACY_ENTITY_NOTE
}

function missing(question: FieldQuestion, note: string, sources: string[] = []): DocumentItem {
  return {
    id: question.id,
    label: question.label,
    tag: 'missing',
    kind: kindOf(question),
    value: null,
    structured: null,
    source_ids: [question.id, ...sources],
    version: null,
    withheld: false,
    note,
    verification: null,
  }
}

function fromFact(question: FieldQuestion, fact: CanonicalFact, withheld: boolean, answer?: AnswerRecord): DocumentItem {
  const confirmedSuggestion = answer && fact.source.answer_ids.includes(answer.answer_id) && answerProvenance(answer) === 'agent_suggested_owner_confirmed'
  return {
    ...(confirmedSuggestion ? { provenance: 'agent_suggested_owner_confirmed' as const } : {}),
    id: question.id,
    label: question.label,
    tag: 'approved',
    kind: kindOf(question),
    value: withheld ? null : displayValue(fact.value),
    structured: withheld ? null : structured(question, fact.value),
    source_ids: [fact.id, ...fact.source.answer_ids, ...(fact.revision_hash ? [`revision:${fact.revision_hash.slice(0, 16)}`] : [])],
    version: fact.version,
    withheld,
    note: withheld ? 'Restricted. Approved, but the value is never shown in a document.' : legacyNote(question, fact.value, null),
    verification: null,
  }
}

function fromDraft(question: FieldQuestion, answer: AnswerRecord): DocumentItem {
  const restricted = question.sensitivity === 'restricted'
  const confirmed = answerProvenance(answer) === 'agent_suggested_owner_confirmed'
  const suggestion = answer.source_type === 'agent_suggestion' && !confirmed
  const note = confirmed
    ? 'Agent-suggested, owner-confirmed. Not approved.'
    : suggestion
    ? 'Agent suggestion. Not approved and not an owner decision.'
    : answer.proposal_state === 'tentative'
      ? 'Tentative. The owner described this as possible, not decided.'
      : answer.authority === 'estimated'
        ? 'Estimate. Not approved.'
        : 'Owner draft. Not approved.'
  return {
    id: question.id,
    label: question.label,
    tag: suggestion ? 'recommendation' : 'assumption',
    ...(confirmed ? { provenance: 'agent_suggested_owner_confirmed' as const } : {}),
    kind: kindOf(question),
    value: restricted ? null : displayValue(answer.value),
    structured: restricted ? null : structured(question, answer.value),
    source_ids: [question.id, answer.answer_id],
    version: null,
    withheld: restricted,
    note: restricted ? `${note} Restricted value withheld.` : legacyNote(question, answer.value, note),
    verification: null,
  }
}

export interface ItemContext {
  facts: Record<string, CanonicalFact>
  answers: Map<string, AnswerRecord>
  audience: DocumentAudience
  root: string
  brandId: string
  evidence?: EvidenceItem[]
  now?: Date
}

/** An item with its personal verification label and evidence ids, when the claim is personal. */
export function itemFor(question: FieldQuestion, context: ItemContext): DocumentItem {
  const item = baseItemFor(question, context)
  if (!question.id.startsWith('personal.') || item.tag === 'missing' || item.tag === 'recommendation') return item
  const evidence = context.evidence ?? []
  const now = context.now ?? new Date()
  const summary = claimEvidence(question, evidence, now)
  const verification = summary.verification
  const found = evidenceFor(question.id, evidence, now)
  // The owner's own part is cited too, so a reader sees which evidence is not independent.
  const ownerIds = verification === 'partly_verified' || verification === 'owner_published' ? summary.owner_parts : []
  const ids = context.audience === 'public' ? [] : [...found.independent, ...ownerIds, ...found.permissions].map((entry) => `evidence:${entry.id}`)
  // A public reader never sees register entries, so the owner part is not named there.
  const label = verificationNote(summary, context.audience !== 'public')
  return {
    ...item,
    verification,
    source_ids: [...item.source_ids, ...ids],
    note: label ? (item.note ? `${item.note} ${label}` : label) : item.note,
  }
}

function baseItemFor(question: FieldQuestion, context: ItemContext): DocumentItem {
  const fact = context.facts[question.id]
  // A restricted fact is approved with a null value and a private_ref; it is shown as approved and withheld.
  const hasValue = fact ? (fact.value !== null && fact.value !== undefined) || Boolean(fact.private_ref) : false
  const approved = fact && fact.status === 'approved' && hasValue ? fact : null
  if (context.audience === 'public') {
    // Public: only approved, public, published facts. No drafts, no recommendations, no restricted values.
    if (question.sensitivity === 'restricted') return missing(question, 'Not published.')
    if (approved && factIsPublic(context.root, question.id, approved, context.brandId)) return fromFact(question, approved, false)
    return missing(question, 'Not published.')
  }
  const restricted = question.sensitivity === 'restricted' || approved?.classification === 'restricted'
  if (approved) return fromFact(question, approved, restricted, context.answers.get(question.id))
  const answer = context.answers.get(question.id)
  if (answer && (answer.status === 'draft' || answer.status === 'in_review') && (answer.value !== null || answer.private_ref)) {
    return fromDraft(question, answer)
  }
  if (answer && MISSING_NOTES[answer.status]) return missing(question, MISSING_NOTES[answer.status] ?? 'Missing.', [answer.answer_id])
  return missing(question, 'Not answered yet.')
}

function words(text: string): number {
  return text.split(/\s+/u).filter((word) => /[\p{L}\p{N}]/u.test(word)).length
}

/** Word count of approved values against a guideline. Short stays short: nothing is invented to fill it. */
export function lengthReport(items: DocumentItem[], guideline: [number, number]): LengthReport {
  const approved = items.filter((item) => item.tag === 'approved' && !item.withheld && item.value !== null)
  const count = approved.reduce((sum, item) => sum + words(String(item.value)), 0)
  const [min, max] = guideline
  const state = count < min ? 'below' : count > max ? 'above' : 'within'
  const note =
    state === 'below'
      ? `Approved material is ${count} words, below the ${min}–${max} guideline. It is not padded: approve more facts to lengthen it.`
      : state === 'above'
        ? `Approved material is ${count} words, above the ${min}–${max} guideline. Choose which approved facts to leave out; nothing is rewritten automatically.`
        : `Approved material is ${count} words, within the ${min}–${max} guideline.`
  return { guideline, approved_words: count, state, note }
}

function sectionStatus(items: DocumentItem[], notApplicable = 0): DocumentSection['status'] {
  const facts = items.filter((item) => item.tag !== 'recommendation')
  if (facts.length === 0 && notApplicable > 0) return 'not_applicable'
  const approved = facts.filter((item) => item.tag === 'approved').length
  if (facts.length > 0 && approved === facts.length) return 'complete'
  if (facts.some((item) => item.tag !== 'missing')) return 'partial'
  return 'missing'
}

export function buildDocument(engine: InterviewEngine, spec: DocumentSpec, audience: DocumentAudience): DocumentModel {
  const root = engine.workspaceRoot()
  const config = engine.config()
  const brandId = config.brand.slug
  const context: ItemContext = {
    facts: readFacts(root, 'approved', brandId),
    answers: latestAnswers(engine.ledger().records),
    audience,
    root,
    brandId,
    evidence: readEvidence(root),
    now: new Date(),
  }
  const modules = new Map(allModules().map((module) => [module.id, module]))
  const applicability = spec.framework ? brandApplicability(engine) : null
  const resolve = (ids: readonly string[]): FrameworkRef[] => {
    const known = ids.filter((id) => engine.question(id))
    if (!applicability) return known.map((id) => ({ id, stands_for: null, profile_na: false }))
    return applicability.refsFor(known)
  }
  const sections: DocumentSection[] = spec.sections.map((section) => {
    const items: DocumentItem[] = []
    const moduleIds: string[] = []
    const notApplicable: Array<{ id: string; label: string }> = []
    for (const ref of resolve(section.questions)) {
      const question = engine.question(ref.id)
      if (!question) continue
      if (ref.profile_na) {
        notApplicable.push({ id: question.id, label: question.label })
        continue
      }
      const item = itemFor(question, context)
      items.push(ref.stands_for ? { ...item, stands_for: ref.stands_for } : item)
      // Template guidance follows the framework questions that apply, not the personal answers standing in.
      if (!ref.stands_for && !moduleIds.includes(question.module)) moduleIds.push(question.module)
    }
    if (audience === 'internal' && section.guidance) {
      for (const moduleId of moduleIds) {
        const guidance = modules.get(moduleId)?.guidance[0]
        if (!guidance) continue
        items.push({
          id: `template:${moduleId}#guidance-1`,
          label: `${modules.get(moduleId)?.title ?? moduleId} guidance`,
          tag: 'recommendation',
          kind: 'text',
          value: guidance,
          structured: null,
          source_ids: [`template:${moduleId}`],
          version: null,
          withheld: false,
          note: 'Template guidance. Not a brand decision.',
          verification: null,
        })
      }
    }
    const built: DocumentSection = { id: section.id, title: section.title, purpose: section.purpose, status: sectionStatus(items, notApplicable.length), items }
    if (notApplicable.length) built.not_applicable = notApplicable
    if (section.words) built.length = lengthReport(items, section.words)
    return built
  })
  const counts: Record<ItemTag, number> = { approved: 0, assumption: 0, recommendation: 0, missing: 0 }
  for (const section of sections) for (const item of section.items) counts[item.tag] += 1
  return {
    schema_version: 1,
    kind: spec.kind,
    title: spec.title,
    brand_id: brandId,
    audience,
    note:
      audience === 'public'
        ? 'Public edition. Only approved and published facts are shown. Everything else is listed as missing.'
        : 'Internal edition. Approved facts are canonical. Assumptions and recommendations are not decisions. Missing items stay missing.',
    counts,
    sections,
  }
}
