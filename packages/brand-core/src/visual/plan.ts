import { brandApplicability } from '../applicability.js'
import { latestAnswers } from '../completeness.js'
import { itemFor, type DocumentAudience, type ItemContext } from '../documents/model.js'
import type { InterviewEngine } from '../engine.js'
import { entitySpec, type EntityItem } from '../entities.js'
import { readEvidence } from '../evidence.js'
import { readFacts } from '../facts.js'
import { frameworkEntry, zoneState } from './bmc.js'
import { frameworkRef } from './frameworks.js'
import {
  emptyStatusSummary,
  VISUAL_SCHEMA,
  type BlockBase,
  type FrameworkRef,
  type NextQuestion,
  type VisualBlock,
  type VisualDocument,
  type VisualEntry,
} from './model.js'
import {
  JOURNEY_EMOTIONS,
  SOSTAC_STAGES,
  type JourneyEmotion,
  type JourneyStage,
  type JourneySwimlaneBlock,
  type OkrKeyResult,
  type OkrObjective,
  type OkrTreeBlock,
  type PlanDocumentKind,
  type PlanLink,
  type SostacBlock,
  type SostacSection,
  type SostacStage,
} from './model-plan.js'

/**
 * Visual V3.3: customer journey swimlane, SOSTAC overview and OKR tree, built from the question bank through the same
 * truth path as the canvas (`itemFor` → `entryFromItem`). The journey and the OKRs read the V3.1 list questions added
 * in V3.3 (`entities-plan.ts`); SOSTAC reads existing answers and lists, stage by stage. Nothing is written, nothing is
 * inferred from prose, and an item is only carried when its list is visible in this edition (public: approved and
 * published only).
 */

export const JOURNEY_QUESTION = 'business.marketing.journey_stages'
export const JOURNEY_HYPOTHESIS = 'business.marketing.journey'
export const SEGMENTS_QUESTION = 'business.model.segments'
export const OBJECTIVES_QUESTION = 'business.goals.objectives'
export const KEY_RESULTS_QUESTION = 'business.goals.key_results'
export const ANNUAL_OBJECTIVE = 'business.goals.annual'

export interface SostacStageSpec {
  stage: SostacStage
  questions: string[]
  related: string[]
}

/**
 * Which existing answers speak to each SOSTAC stage. `questions` fill the stage; `related` only inform it (ids, never
 * values). Restricted answers (the marketing budget) are not listed: an overview never needs a withheld figure.
 */
export const SOSTAC_SPECS: readonly SostacStageSpec[] = [
  { stage: 'situation', questions: ['business.stage.current', 'business.customer.primary_segment', 'business.problem.pains', 'business.market.geography'], related: [JOURNEY_HYPOTHESIS, 'business.plan.risks'] },
  { stage: 'objectives', questions: [OBJECTIVES_QUESTION, 'business.marketing.objective', ANNUAL_OBJECTIVE], related: ['business.goals.quarter', 'business.goals.north_star'] },
  { stage: 'strategy', questions: ['business.offer.value_proposition', 'brand.strategy.differentiation', 'business.marketing.pillars'], related: ['business.growth.loops'] },
  { stage: 'tactics', questions: ['business.marketing.channels', 'business.marketing.paid_media', 'business.sales.motion'], related: ['business.marketing.utm', JOURNEY_QUESTION] },
  { stage: 'action', questions: ['business.plan.milestone', 'business.ops.tracker', 'business.ops.roles'], related: ['business.growth.owner'] },
  { stage: 'control', questions: [KEY_RESULTS_QUESTION, 'business.goals.sources', 'business.marketing.attribution', 'business.goals.cadence'], related: ['business.goals.plan_vs_actual'] },
]

/** Every question a V3.3 document reads. */
export const PLAN_QUESTIONS: readonly string[] = [...new Set([JOURNEY_QUESTION, JOURNEY_HYPOTHESIS, SEGMENTS_QUESTION, OBJECTIVES_QUESTION, KEY_RESULTS_QUESTION, ANNUAL_OBJECTIVE, ...SOSTAC_SPECS.flatMap((spec) => spec.questions)])]

/** One answer as the V3.3 documents see it: the visual entry plus, for a visible list, its raw items in owner order. */
export interface PlanSource {
  entry: VisualEntry & { approved: boolean }
  /** Items of a visible list answer (all fields); null when hidden, not a list, or legacy text. */
  items: EntityItem[] | null
}

export interface PlanInput {
  brand_id: string
  brand_name: string
  audience: DocumentAudience
  illustrative: boolean
  /** Answers by question id. A question absent here is not in this brand's bank (an older template). */
  sources: ReadonlyMap<string, PlanSource>
  /** Question ids in this brand's bank. */
  existing: ReadonlySet<string>
}

/** A gap entry for a question this brand's bank does not have; the label is a placeholder the renderer replaces. */
function absentEntry(id: string): VisualEntry & { approved: boolean } {
  return { id, label: id, state: 'missing', value: null, sources: [], version: null, approved_at: null, review_due: null, note: null, missing_reason: 'unanswered', approved: false }
}

function publicEntry(entry: VisualEntry & { approved: boolean }): VisualEntry {
  const { approved: _approved, ...rest } = entry
  void _approved
  return rest
}

function latest(entries: VisualEntry[]): string | null {
  const dates = entries.map((entry) => entry.approved_at).filter((at): at is string => typeof at === 'string' && Number.isFinite(Date.parse(at)))
  return dates.length ? dates.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)) : null
}

function blockState(entries: Array<VisualEntry & { approved: boolean }>): BlockBase['data_state'] {
  if (entries.length && entries.every((entry) => entry.approved)) return 'complete'
  return entries.some((entry) => entry.value !== null || entry.state === 'withheld') ? 'partial' : 'missing'
}

/** What the owner can answer next: unapproved existing questions, and list questions this bank does not have yet. */
function nextFor(ids: readonly string[], input: PlanInput): NextQuestion[] {
  const out: NextQuestion[] = []
  for (const id of ids) {
    const source = input.sources.get(id)
    if (!input.existing.has(id)) {
      if (entitySpec(id)) out.push({ id, kind: 'proposed' })
      continue
    }
    // BOS-15: the entry's own id, so a personal answer standing in for this question is what the owner is asked.
    if (source && !source.entry.approved && source.entry.state !== 'not_applicable' && !out.some((item) => item.id === source.entry.id)) out.push({ id: source.entry.id, kind: 'existing' })
  }
  return out
}

/** Entries in order, each answer once (several framework questions can be stood in for by one personal answer). */
function unique(entries: Array<VisualEntry & { approved: boolean }>): Array<VisualEntry & { approved: boolean }> {
  const seen = new Set<string>()
  return entries.filter((entry) => (seen.has(entry.id) ? false : (seen.add(entry.id), true)))
}

function base(input: PlanInput, kind: PlanDocumentKind, entries: Array<VisualEntry & { approved: boolean }>, computedFrom: string[]): BlockBase {
  return {
    block_id: kind,
    framework_id: FRAMEWORK_OF[kind],
    data_state: blockState(entries),
    sources: [...new Set(entries.flatMap((entry) => entry.sources))],
    as_of: latest(entries),
    computed_from: computedFrom,
    visibility: input.audience,
    renderer_variant: `${kind}.v1`,
    layout_constraints: { preserve_topology: kind !== 'okr_tree', min_print_pt: 7, print_profile: 'canvas_a3_landscape' },
  }
}

const FRAMEWORK_OF: Record<PlanDocumentKind, string> = { customer_journey: 'CUSTOMER-JOURNEY-MAP', sostac_overview: 'SOSTAC', okr_tree: 'OKR' }

function documentOf(input: PlanInput, kind: PlanDocumentKind, block: VisualBlock, entries: VisualEntry[]): VisualDocument {
  const summary = emptyStatusSummary()
  for (const entry of entries) summary[entry.state] += 1
  const refs: FrameworkRef[] = [frameworkRef(FRAMEWORK_OF[kind])]
  return {
    schema: VISUAL_SCHEMA,
    schema_version: 1,
    document_kind: kind,
    brand_id: input.brand_id,
    brand_name: input.brand_name,
    audience: input.audience,
    illustrative: input.illustrative,
    origin: input.illustrative ? 'illustrative_fixture' : 'brand_repository',
    as_of: latest(entries),
    classification: input.audience === 'public' ? 'public' : 'internal',
    print_profile: 'canvas_a3_landscape',
    status_summary: summary,
    framework_refs: refs,
    blocks: [block],
  }
}

function source(input: PlanInput, id: string): PlanSource {
  return input.sources.get(id) ?? { entry: absentEntry(id), items: null }
}

function field(item: EntityItem, key: string): string | null {
  const value = item.fields[key]
  return value === undefined || value === '' ? null : value
}

function num(item: EntityItem, key: string): number | null {
  const value = field(item, key)
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function names(src: PlanSource): Map<string, string> {
  return new Map((src.items ?? []).map((item) => [item.id, item.fields.name ?? ''] as const))
}

function linkOf(id: string, visible: Map<string, string>): PlanLink {
  return { id, name: visible.get(id) ?? null }
}

/** True when a list question holds text that is not a list (V3.1 legacy), so the renderer flags it. */
function isLegacy(src: PlanSource): boolean {
  return src.entry.legacy === true
}

// ---- Customer journey ----------------------------------------------------------------------------------------

export function journeyDocument(input: PlanInput): VisualDocument {
  const list = source(input, JOURNEY_QUESTION)
  const hypothesis = input.existing.has(JOURNEY_HYPOTHESIS) ? source(input, JOURNEY_HYPOTHESIS) : null
  const segments = names(source(input, SEGMENTS_QUESTION))
  const stages: JourneyStage[] = (list.items ?? []).map((item, index) => {
    const emotion = field(item, 'emotion')
    return {
      id: item.id,
      order: index + 1,
      name: item.fields.name ?? '',
      goal: field(item, 'goal'),
      lanes: { touchpoints: field(item, 'touchpoints'), actions: field(item, 'actions'), pains: field(item, 'pains'), opportunities: field(item, 'opportunities') },
      emotion: emotion && (JOURNEY_EMOTIONS as readonly string[]).includes(emotion) ? (emotion as JourneyEmotion) : null,
      evidence: field(item, 'evidence'),
      segments: item.links.map((id) => linkOf(id, segments)),
    }
  })
  const entries = [list.entry, ...(hypothesis ? [hypothesis.entry] : [])]
  const block: JourneySwimlaneBlock = {
    ...base(input, 'customer_journey', entries, [JOURNEY_QUESTION, JOURNEY_HYPOTHESIS, SEGMENTS_QUESTION]),
    type: 'journey_swimlane',
    source: publicEntry(list.entry),
    hypothesis: hypothesis ? publicEntry(hypothesis.entry) : null,
    stages,
    legacy: isLegacy(list),
    next_questions: nextFor([JOURNEY_QUESTION, JOURNEY_HYPOTHESIS], input),
  }
  return documentOf(input, 'customer_journey', block, entries.map(publicEntry))
}

// ---- SOSTAC --------------------------------------------------------------------------------------------------

export function sostacDocument(input: PlanInput): VisualDocument {
  const all: Array<VisualEntry & { approved: boolean }> = []
  const sections: SostacSection[] = SOSTAC_SPECS.map((spec, index) => {
    const entries = unique(spec.questions.filter((id) => input.existing.has(id)).map((id) => source(input, id).entry))
    all.push(...entries)
    return {
      stage: spec.stage,
      order: index + 1,
      state: zoneState(entries, entries.length === 0),
      entries: entries.map(publicEntry),
      next_questions: nextFor(spec.questions, input),
      related: spec.related.filter((id) => input.existing.has(id)),
    }
  })
  if (sections.map((section) => section.stage).join() !== SOSTAC_STAGES.join()) throw new Error('SOSTAC stages out of order')
  const block: SostacBlock = { ...base(input, 'sostac_overview', all, SOSTAC_SPECS.flatMap((spec) => spec.questions)), type: 'sostac_overview', sections }
  return documentOf(input, 'sostac_overview', block, all.map(publicEntry))
}

// ---- OKR tree ------------------------------------------------------------------------------------------------

/** Progress from the recorded baseline only. A baseline of zero is never assumed: a key result may go down. */
export function keyResultOf(item: EntityItem, objectives: Map<string, string>): OkrKeyResult | null {
  const target = num(item, 'target')
  const unit = field(item, 'unit')
  const src = field(item, 'source')
  // The validator requires these; a list that lacks them is not drawn as a measure (never filled in).
  if (target === null || unit === null || src === null) return null
  const current = num(item, 'current')
  const baseline = num(item, 'baseline')
  const measure: OkrKeyResult['measure'] = current === null ? 'not_measured' : baseline === null ? 'no_baseline' : 'measured'
  const progress = measure === 'measured' && target !== baseline ? (current! - baseline!) / (target - baseline!) : null
  const link = item.links[0]
  return {
    id: item.id,
    name: item.fields.name ?? '',
    target,
    current,
    baseline,
    unit,
    source: src,
    measured_on: field(item, 'measured_on'),
    measure,
    progress,
    objective: link ? linkOf(link, objectives) : null,
  }
}

export function okrDocument(input: PlanInput): VisualDocument {
  const objectivesSrc = source(input, OBJECTIVES_QUESTION)
  const resultsSrc = source(input, KEY_RESULTS_QUESTION)
  const root = input.existing.has(ANNUAL_OBJECTIVE) ? source(input, ANNUAL_OBJECTIVE) : null
  const visible = names(objectivesSrc)
  const results = (resultsSrc.items ?? []).map((item) => keyResultOf(item, visible)).filter((kr): kr is OkrKeyResult => kr !== null)
  const objectives: OkrObjective[] = (objectivesSrc.items ?? []).map((item) => ({
    id: item.id,
    name: item.fields.name ?? '',
    detail: field(item, 'detail'),
    period: field(item, 'period'),
    key_results: results.filter((kr) => kr.objective?.id === item.id),
  }))
  const unlinked = results.filter((kr) => !kr.objective || !visible.has(kr.objective.id))
  const entries = unique([objectivesSrc.entry, resultsSrc.entry, ...(root ? [root.entry] : [])])
  const block: OkrTreeBlock = {
    ...base(input, 'okr_tree', entries, [OBJECTIVES_QUESTION, KEY_RESULTS_QUESTION, ANNUAL_OBJECTIVE]),
    type: 'okr_tree',
    root: root ? publicEntry(root.entry) : null,
    objectives_source: publicEntry(objectivesSrc.entry),
    key_results_source: publicEntry(resultsSrc.entry),
    objectives,
    unlinked,
    legacy: { objectives: isLegacy(objectivesSrc), key_results: isLegacy(resultsSrc) },
    next_questions: nextFor([OBJECTIVES_QUESTION, KEY_RESULTS_QUESTION, ANNUAL_OBJECTIVE], input),
  }
  return documentOf(input, 'okr_tree', block, entries.map(publicEntry))
}

// ---- repository builder --------------------------------------------------------------------------------------

export interface PlanOptions {
  /** Clock for `stale` (an approved fact past its `review_due`). Defaults to now. */
  now?: Date
}

/** Reads every V3.3 question once for one edition. Restricted values are withheld by `itemFor`, never carried. */
export function planSources(engine: InterviewEngine, audience: DocumentAudience, options: PlanOptions = {}): PlanInput {
  const root = engine.workspaceRoot()
  const config = engine.config()
  const brandId = config.brand.slug
  const now = options.now ?? new Date()
  const facts = readFacts(root, 'approved', brandId)
  const answers = latestAnswers(engine.ledger().records)
  const context: ItemContext = { facts, answers, audience, root, brandId, evidence: readEvidence(root), now }
  const existing = new Set(engine.questions().map((question) => question.id))
  const applicability = brandApplicability(engine)
  const sources = new Map<string, PlanSource>()
  for (const id of PLAN_QUESTIONS) {
    if (!engine.question(id)) continue
    // BOS-15: a framework question shows itself, the personal answer standing in for it, or not applicable. The
    // plan documents read one answer per question, so a question with several stand-ins shows the first.
    const ref = applicability.refs(id)[0]
    const entry = ref ? frameworkEntry(engine, context, ref, now) : null
    if (!entry) continue
    const visible = entry.value !== null && entry.state !== 'withheld' && !entry.legacy
    const question = visible ? engine.question(entry.id) : undefined
    const structured = question ? itemFor(question, context).structured : null
    const items = structured?.type === 'repeating_entity' ? structured.items.map((one) => ({ id: one.id, fields: { ...one.fields }, links: [...one.links] })) : null
    sources.set(id, { entry, items })
  }
  return { brand_id: brandId, brand_name: String(config.brand.name ?? brandId), audience, illustrative: false, sources, existing }
}

export interface PlanDocuments {
  journey: VisualDocument
  sostac: VisualDocument
  okr: VisualDocument
}

/** The three V3.3 documents for one edition. `internal`: approved, labelled drafts, gaps; `public`: approved and published only. */
export function buildPlanDocuments(engine: InterviewEngine, audience: DocumentAudience, options: PlanOptions = {}): PlanDocuments {
  const input = planSources(engine, audience, options)
  return { journey: journeyDocument(input), sostac: sostacDocument(input), okr: okrDocument(input) }
}
