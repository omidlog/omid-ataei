import { latestAnswers } from '../completeness.js'
import { itemFor, type DocumentAudience, type DocumentItem, type ItemContext } from '../documents/model.js'
import type { InterviewEngine } from '../engine.js'
import type { PersonalFacet } from '../types.js'
import { readEvidence } from '../evidence.js'
import { readFacts, type CanonicalFact } from '../facts.js'
import { BMC_FRAMEWORK } from './frameworks.js'
import { entitySpec, specForPrefix } from '../entities.js'
import type { StructuredValue } from '../structured.js'
import {
  BMC_ZONE_IDS,
  emptyStatusSummary,
  VISUAL_SCHEMA,
  type BmcZone,
  type BmcZoneId,
  type BusinessModelCanvasBlock,
  type CanvasLink,
  type CitationListBlock,
  type DataState,
  type MissingReason,
  type NextQuestion,
  type VisualDocument,
  type VisualEntityItem,
  type VisualEntry,
} from './model.js'

/**
 * Business Model Canvas from the existing question bank. Each zone lists the question ids that answer it today
 * (`questions`), the questions the bank does not have yet (`proposed`, see the P0 audit) and existing questions that
 * only inform it (`related`, ids only). No zone is ever filled from a related answer or a guess.
 */
export interface BmcZoneSpec {
  zone: BmcZoneId
  questions: string[]
  proposed: string[]
  related: string[]
}

export const BMC_ZONES: readonly BmcZoneSpec[] = [
  { zone: 'key_partners', questions: ['business.partners.channels', 'business.ops.vendors'], proposed: [], related: ['business.partners.risk_process'] },
  // Visual V3.1: the four list questions answer their zones. They stay in `proposed` so a brand on an older template
  // (without the questions) still sees them as proposed instead of an empty zone.
  { zone: 'key_activities', questions: ['business.model.key_activities'], proposed: ['business.model.key_activities'], related: ['business.ops.sop', 'business.product.mvp'] },
  { zone: 'key_resources', questions: ['business.model.key_resources'], proposed: ['business.model.key_resources'], related: ['business.ops.roles', 'business.engineering.stack'] },
  { zone: 'value_propositions', questions: ['business.offer.value_proposition', 'business.offer.summary'], proposed: [], related: ['business.problem.pains', 'business.product.jobs'] },
  { zone: 'customer_relationships', questions: ['business.sales.motion', 'business.cx.onboarding', 'business.cx.channels'], proposed: [], related: ['business.cx.churn'] },
  { zone: 'channels', questions: ['business.marketing.channels', 'business.sales.consumer_path'], proposed: [], related: ['brand.social.channels'] },
  { zone: 'customer_segments', questions: ['business.model.segments', 'business.customer.primary_segment', 'business.sales.buyer'], proposed: ['business.model.segments'], related: ['business.market.geography'] },
  { zone: 'cost_structure', questions: ['business.model.cost_items', 'business.finance.costs', 'business.finance.economics_note'], proposed: ['business.model.cost_items'], related: ['business.finance.basis'] },
  { zone: 'revenue_streams', questions: ['business.model.revenue', 'business.sales.pricing'], proposed: [], related: ['business.finance.currency'] },
]

/** Personal brands get a canvas only when a facet runs a business. */
const BUSINESS_FACETS: readonly PersonalFacet[] = ['founder-executive', 'consultant-expert']

const MAX_VALUE = 2000

function text(value: DocumentItem['value']): string | null {
  if (value === null || value === undefined || value === '') return null
  const out = String(value)
  return out.length > MAX_VALUE ? `${out.slice(0, MAX_VALUE)}…` : out
}

function isOverdue(fact: CanonicalFact | undefined, now: Date): boolean {
  if (!fact?.review_due) return false
  const due = Date.parse(fact.review_due)
  return Number.isFinite(due) && due < now.getTime()
}

/** Maps one document item to a visual entry. The item already applies audience, restriction and draft rules. */
/** Visual V3.1: the items of a list answer, as the canvas draws them. Choice values stay keys; renderers label them. */
export function entityItems(structured: StructuredValue | null): VisualEntityItem[] | null {
  if (structured?.type !== 'repeating_entity') return null
  const spec = entitySpec(structured.question)
  if (!spec) return null
  const choices = spec.fields.filter((field) => field.kind === 'choice')
  return structured.items.map((item) => ({
    id: item.id,
    name: item.fields.name ?? '',
    detail: item.fields.detail ?? null,
    tags: choices.filter((field) => item.fields[field.key] !== undefined).map((field) => ({ field: field.key, value: item.fields[field.key]! })),
    links: [...item.links],
    // Visual V3.2: source references (lists whose spec allows them); resolved and numbered by the reader.
    ...(item.sources?.length ? { sources: [...item.sources] } : {}),
  }))
}

export function entryFromItem(item: DocumentItem, fact: CanonicalFact | undefined, notApplicable: boolean, now: Date, missingReason: MissingReason = 'unanswered'): VisualEntry & { approved: boolean } {
  const approved = item.tag === 'approved'
  let state: DataState
  if (item.withheld) state = 'withheld'
  else if (approved) state = isOverdue(fact, now) ? 'stale' : 'approved'
  else if (item.tag === 'assumption') state = 'assumption'
  else if (item.tag === 'recommendation') state = 'recommendation'
  else state = notApplicable ? 'not_applicable' : 'missing'
  const hidden = state === 'withheld' || state === 'missing' || state === 'not_applicable'
  const items = hidden ? null : entityItems(item.structured)
  const legacy = !hidden && item.kind === 'repeating_entity' && items === null && item.value !== null && item.value !== ''
  return {
    id: item.id,
    label: item.label,
    state,
    value: hidden ? null : items ? text(items.map((entry) => entry.name).join(' · ')) : text(item.value),
    sources: [...item.source_ids],
    version: item.version,
    approved_at: approved ? (fact?.approved_at ?? null) : null,
    review_due: approved ? (fact?.review_due ?? null) : null,
    note: item.note,
    missing_reason: state === 'missing' ? missingReason : null,
    ...(items ? { items } : {}),
    ...(legacy ? { legacy: true as const } : {}),
    approved,
  }
}

/** The zone a list item id belongs to (`seg-2` → customer segments), from the entity specs and the zone table. */
function zoneOfItem(id: string): BmcZoneId | null {
  const spec = specForPrefix(id.split('-')[0] ?? '')
  if (!spec) return null
  return BMC_ZONES.find((zone) => zone.questions.includes(spec.question_id))?.zone ?? null
}

/**
 * Links recorded on visible list items. A link whose target is not visible in this edition (removed, unanswered,
 * withheld or unpublished) is kept as `unresolved`; nothing is inferred from prose answers.
 */
export function canvasRelationships(zones: Array<{ spec: BmcZoneSpec; entries: VisualEntry[] }>): BusinessModelCanvasBlock['relationships'] {
  const visible = new Map<string, BmcZoneId>()
  for (const { spec, entries } of zones) for (const entry of entries) for (const item of entry.items ?? []) visible.set(item.id, spec.zone)
  if (visible.size === 0) {
    const lists = zones.some(({ spec }) => spec.questions.some((id) => entitySpec(id)))
    return { modeled: false, reason: lists ? 'no_list_items' : 'single_prose_answers' }
  }
  const links: CanvasLink[] = []
  for (const { spec, entries } of zones) {
    for (const entry of entries) {
      for (const item of entry.items ?? []) {
        for (const target of item.links) {
          const resolved = visible.get(target)
          links.push({ from: item.id, from_zone: spec.zone, to: target, to_zone: resolved ?? zoneOfItem(target), state: resolved ? 'resolved' : 'unresolved' })
        }
      }
    }
  }
  return { modeled: true, links }
}

export function zoneState(entries: Array<VisualEntry & { approved: boolean }>, gap: boolean): BmcZone['state'] {
  if (gap) return 'missing'
  const considered = entries.filter((entry) => entry.state !== 'not_applicable')
  if (considered.length === 0) return entries.length > 0 ? 'not_applicable' : 'missing'
  if (considered.every((entry) => entry.approved)) return 'complete'
  const visible = considered.some((entry) => entry.value !== null)
  if (!visible && considered.some((entry) => entry.state === 'withheld')) return 'withheld'
  if (considered.some((entry) => entry.state !== 'missing')) return 'partial'
  return 'missing'
}

/** Public gaps are "not published" whatever the reason, so a public page never hints at a hidden draft. */
function missingReason(audience: DocumentAudience, status: string | undefined): MissingReason {
  if (audience === 'public') return 'not_published'
  if (status === 'unknown' || status === 'skipped' || status === 'deprecated') return status
  return 'unanswered'
}

export interface BmcOptions {
  /** Clock for `stale` (an approved fact past its `review_due`). Defaults to now. */
  now?: Date
}

/** Strips the internal `approved` helper flag before the entry leaves this module. */
function publicEntry(entry: VisualEntry & { approved: boolean }): VisualEntry {
  const { approved: _approved, ...rest } = entry
  void _approved
  return rest
}

/** Assembles the document from zones; shared by the repository builder and the illustrative fixture. */
export function canvasDocument(input: {
  brand_id: string
  brand_name: string
  audience: DocumentAudience
  illustrative: boolean
  zones: Array<{ spec: BmcZoneSpec; entries: Array<VisualEntry & { approved: boolean }>; existing: Set<string> }>
}): VisualDocument {
  const summary = emptyStatusSummary()
  const zones: BmcZone[] = input.zones.map(({ spec, entries, existing }, index) => {
    for (const entry of entries) summary[entry.state] += 1
    const next: NextQuestion[] = []
    for (const entry of entries) if (!entry.approved && entry.state !== 'not_applicable') next.push({ id: entry.id, kind: 'existing' })
    for (const id of spec.proposed) if (!existing.has(id)) next.push({ id, kind: 'proposed' })
    return {
      zone_id: spec.zone,
      order: index + 1,
      state: zoneState(entries, spec.questions.length === 0 || entries.length === 0),
      entries: entries.map(publicEntry),
      next_questions: next,
      related: spec.related.filter((id) => existing.has(id)),
    }
  })
  const all = input.zones.flatMap((zone) => zone.entries)
  const approvedDates = all.map((entry) => entry.approved_at).filter((at): at is string => typeof at === 'string' && Number.isFinite(Date.parse(at)))
  const asOf = approvedDates.length ? approvedDates.reduce((latest, at) => (Date.parse(at) > Date.parse(latest) ? at : latest)) : null
  const sources = [...new Set(all.flatMap((entry) => entry.sources))]
  const blockState: BusinessModelCanvasBlock['data_state'] = zones.every((zone) => zone.state === 'complete') ? 'complete' : zones.some((zone) => zone.state !== 'missing') ? 'partial' : 'missing'
  const visibility = input.audience
  const canvas: BusinessModelCanvasBlock = {
    type: 'business_model_canvas',
    block_id: 'bmc',
    framework_id: BMC_FRAMEWORK.framework_id,
    data_state: blockState,
    sources,
    as_of: asOf,
    computed_from: BMC_ZONES.flatMap((zone) => zone.questions),
    visibility,
    renderer_variant: 'bmc.nine_zone.v1',
    layout_constraints: { preserve_topology: true, min_print_pt: 7, print_profile: 'canvas_a3_landscape' },
    zones,
    relationships: canvasRelationships(input.zones),
  }
  const citations: CitationListBlock = {
    type: 'citation_list',
    block_id: 'bmc-sources',
    framework_id: BMC_FRAMEWORK.framework_id,
    data_state: blockState,
    sources,
    as_of: asOf,
    computed_from: ['bmc'],
    visibility,
    renderer_variant: 'citations.table.v1',
    layout_constraints: { preserve_topology: false, min_print_pt: 7, print_profile: 'canvas_a3_landscape' },
    items: all.map((entry) => ({ id: entry.id, label: entry.label, state: entry.state, version: entry.version, approved_at: entry.approved_at })),
  }
  return {
    schema: VISUAL_SCHEMA,
    schema_version: 1,
    document_kind: 'business_model_canvas',
    brand_id: input.brand_id,
    brand_name: input.brand_name,
    audience: input.audience,
    illustrative: input.illustrative,
    origin: input.illustrative ? 'illustrative_fixture' : 'brand_repository',
    as_of: asOf,
    classification: input.audience === 'public' ? 'public' : 'internal',
    print_profile: 'canvas_a3_landscape',
    status_summary: summary,
    framework_refs: [BMC_FRAMEWORK],
    blocks: [canvas, citations],
  }
}

/** True when the canvas applies to this brand: every business brand, and personal brands with a business facet. */
export function canvasApplies(engine: InterviewEngine): boolean {
  const config = engine.config()
  const personal = config.modules.personal?.enabled === true || config.brand.profile === 'personal-brand'
  if (!personal) return true
  const facets: readonly PersonalFacet[] = config.modules.personal?.facets ?? []
  return facets.some((facet) => BUSINESS_FACETS.includes(facet))
}

/**
 * The canvas for one brand repository and audience. `internal` shows approved facts, labelled drafts and gaps, with
 * restricted values withheld; `public` shows only approved, public, published facts (drafts are left out).
 */
export function buildBusinessModelCanvas(engine: InterviewEngine, audience: DocumentAudience, options: BmcOptions = {}): VisualDocument {
  const root = engine.workspaceRoot()
  const config = engine.config()
  const brandId = config.brand.slug
  const now = options.now ?? new Date()
  const facts = readFacts(root, 'approved', brandId)
  const answers = latestAnswers(engine.ledger().records)
  const context: ItemContext = { facts, answers, audience, root, brandId, evidence: readEvidence(root), now }
  const existing = new Set(engine.questions().map((question) => question.id))
  const zones = BMC_ZONES.map((spec) => {
    const entries = spec.questions.flatMap((id) => {
      const question = engine.question(id)
      if (!question) return []
      const item = itemFor(question, context)
      const answer = answers.get(id)
      const notApplicable = item.tag === 'missing' && audience === 'internal' && answer?.status === 'not_applicable'
      return [entryFromItem(item, facts[id], notApplicable, now, missingReason(audience, answer?.status))]
    })
    return { spec, entries, existing }
  })
  return canvasDocument({ brand_id: brandId, brand_name: String(config.brand.name ?? brandId), audience, illustrative: false, zones })
}

export { BMC_ZONE_IDS }
