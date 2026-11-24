import { brandApplicability } from '../applicability.js'
import { latestAnswers } from '../completeness.js'
import { itemFor, type DocumentAudience, type ItemContext } from '../documents/model.js'
import type { InterviewEngine } from '../engine.js'
import { sourceRefKind } from '../entities.js'
import { readEvidence, type EvidenceItem } from '../evidence.js'
import { readFacts } from '../facts.js'
import { canvasApplies, frameworkEntry } from './bmc.js'
import { frameworkRef } from './frameworks.js'
import {
  emptyStatusSummary,
  SWOT_QUADRANTS,
  TOWS_TYPES,
  VALUE_FIT_ZONES,
  VISUAL_SCHEMA,
  type BlockBase,
  type FitRow,
  type ItemLink,
  type ListArea,
  type NextQuestion,
  type SourceNote,
  type SourceNotesBlock,
  type SwotBlock,
  type SwotQuadrantId,
  type TowsMatrixBlock,
  type TowsType,
  type ValueFitZoneId,
  type ValuePropositionCanvasBlock,
  type VisualDocument,
  type VisualEntityItem,
  type VisualEntry,
} from './model.js'

/**
 * SWOT / TOWS and the Value Proposition Canvas (Visual Blueprint V3.2), built from the V3.1 list questions
 * (`repeating_entity`) through the same truth path as every visual: `itemFor` decides approved / draft / missing /
 * withheld, and the public edition shows approved, published lists only. Items keep the owner's order; links and
 * source references are resolved against what the edition shows and never guessed. Nothing here writes.
 */

export interface ListAreaSpec<Id extends string> {
  area: Id
  question: string
  /** Existing prose answers that inform the area; ids only, values are never copied. */
  related: string[]
}

export const SWOT_AREAS: ReadonlyArray<ListAreaSpec<SwotQuadrantId>> = [
  { area: 'strengths', question: 'business.swot.strengths', related: ['brand.strategy.differentiation', 'business.model.defensibility'] },
  { area: 'weaknesses', question: 'business.swot.weaknesses', related: ['business.plan.risks'] },
  { area: 'opportunities', question: 'business.swot.opportunities', related: ['business.market.geography'] },
  { area: 'threats', question: 'business.swot.threats', related: ['business.plan.risks', 'business.partners.risk_process'] },
]

export const TOWS_AREA: ListAreaSpec<'tows'> = { area: 'tows', question: 'business.swot.tows', related: ['business.goals.quarter'] }

/** Canonical Value Proposition Canvas order: value map (square) first, then the customer profile (circle). */
export const VALUE_FIT_AREAS: ReadonlyArray<ListAreaSpec<ValueFitZoneId>> = [
  { area: 'products_services', question: 'business.fit.products', related: ['business.offer.summary'] },
  { area: 'gain_creators', question: 'business.fit.creators', related: ['business.offer.value_proposition'] },
  { area: 'pain_relievers', question: 'business.fit.relievers', related: ['business.offer.value_proposition'] },
  { area: 'customer_jobs', question: 'business.fit.jobs', related: ['business.product.jobs'] },
  { area: 'gains', question: 'business.fit.gains', related: [] },
  { area: 'pains', question: 'business.fit.pains', related: ['business.problem.pains'] },
]

/** The segments list, read only so job, pain, gain and product links can name their segment. */
export const SEGMENTS_QUESTION = 'business.model.segments'

export const SWOT_TOWS_QUESTIONS: readonly string[] = [...SWOT_AREAS.map((spec) => spec.question), TOWS_AREA.question]
export const VALUE_FIT_QUESTIONS: readonly string[] = VALUE_FIT_AREAS.map((spec) => spec.question)

export type StrategyEntry = VisualEntry & { approved: boolean }

/** What a source reference resolves to in this edition (number and order are assigned by the composer). */
export type ResolvedSource = Omit<SourceNote, 'n'>

export interface StrategyListInput {
  brand_id: string
  brand_name: string
  audience: DocumentAudience
  illustrative: boolean
  /** Entries by question id; a question the bank does not have is absent. */
  entries: ReadonlyMap<string, StrategyEntry>
  /** Question ids in the bank (for proposed questions and related ids). */
  existing: ReadonlySet<string>
  resolve: (ref: string) => ResolvedSource
}

function stripApproved(entry: StrategyEntry): VisualEntry {
  const { approved: _approved, ...rest } = entry
  void _approved
  return rest
}

function areaState(entry: StrategyEntry | null): ListArea<string>['state'] {
  if (!entry) return 'missing'
  if (entry.state === 'not_applicable') return 'not_applicable'
  if (entry.approved) return 'complete'
  if (entry.state === 'withheld') return 'withheld'
  if (entry.state === 'missing') return 'missing'
  return 'partial'
}

function area<Id extends string>(spec: ListAreaSpec<Id>, order: number, input: StrategyListInput, entry: VisualEntry | null): ListArea<Id> {
  const raw = input.entries.get(spec.question) ?? null
  const next: NextQuestion[] = []
  if (!raw) {
    if (!input.existing.has(spec.question)) next.push({ id: spec.question, kind: 'proposed' })
  } else if (!raw.approved && raw.state !== 'not_applicable') next.push({ id: raw.id, kind: 'existing' })
  return { area_id: spec.area, order, state: areaState(raw), entry, next_questions: next, related: spec.related.filter((id) => input.existing.has(id)) }
}

/**
 * Numbers every source reference on visible items in reading order. The public edition keeps only approved answers
 * and public web pages; anything else is taken off the item and counted, so the public page never names an internal
 * note, evidence record or unpublished answer.
 */
function numberSources(entries: Array<VisualEntry | null>, input: StrategyListInput): { entries: Array<VisualEntry | null>; notes: SourceNote[]; hidden: number } {
  const notes: SourceNote[] = []
  // Stored reference → the note's key (a web address loses its query and fragment), or null when not shown.
  const byRef = new Map<string, string | null>()
  const byKey = new Map<string, SourceNote>()
  const hiddenRefs = new Set<string>()
  const keyOf = (ref: string): string | null => {
    if (!byRef.has(ref)) {
      const resolved = input.resolve(ref)
      const shown = resolved.ref !== '' && (input.audience === 'internal' || (resolved.kind === 'fact' && resolved.status === 'approved') || (resolved.kind === 'web' && resolved.status === 'recorded'))
      if (shown) {
        if (!byKey.has(resolved.ref)) {
          const note: SourceNote = { n: notes.length + 1, ...resolved }
          notes.push(note)
          byKey.set(resolved.ref, note)
        }
        byRef.set(ref, resolved.ref)
      } else {
        byRef.set(ref, null)
        hiddenRefs.add(ref)
      }
    }
    return byRef.get(ref) ?? null
  }
  const out = entries.map((entry) => {
    if (!entry?.items) return entry
    const items: VisualEntityItem[] = entry.items.map((item) => {
      if (!item.sources?.length) return item
      const kept = [...new Set(item.sources.map(keyOf).filter((key): key is string => key !== null))]
      const { sources: _sources, ...rest } = item
      void _sources
      return kept.length ? { ...rest, sources: kept } : rest
    })
    return { ...entry, items }
  })
  return { entries: out, notes, hidden: hiddenRefs.size }
}

function baseBlock(input: StrategyListInput, block_id: string, framework: string, entries: StrategyEntry[], variant: string, computed_from: string[], areas: Array<ListArea<string>>): BlockBase {
  const approvedDates = entries.map((entry) => entry.approved_at).filter((at): at is string => typeof at === 'string' && Number.isFinite(Date.parse(at)))
  const asOf = approvedDates.length ? approvedDates.reduce((latest, at) => (Date.parse(at) > Date.parse(latest) ? at : latest)) : null
  const state: BlockBase['data_state'] = areas.length > 0 && areas.every((a) => a.state === 'complete') ? 'complete' : areas.some((a) => a.state !== 'missing') ? 'partial' : 'missing'
  return {
    block_id,
    framework_id: framework,
    data_state: state,
    sources: [...new Set(entries.flatMap((entry) => entry.sources))],
    as_of: asOf,
    computed_from,
    visibility: input.audience,
    renderer_variant: variant,
    layout_constraints: { preserve_topology: true, min_print_pt: 7, print_profile: 'book_a4_portrait' },
  }
}

function namesOf(entries: Array<VisualEntry | null>): Map<string, string> {
  return new Map(entries.flatMap((entry) => (entry?.items ?? []).map((item) => [item.id, item.name] as const)))
}

function linksOf(entries: Array<VisualEntry | null>, names: ReadonlyMap<string, string>): ItemLink[] {
  return entries.flatMap((entry) => (entry?.items ?? []).flatMap((item) => item.links.map((to) => ({ from: item.id, to, state: names.has(to) ? ('resolved' as const) : ('unresolved' as const) }))))
}

function documentShell(input: StrategyListInput, kind: VisualDocument['document_kind'], framework: string, entries: StrategyEntry[], blocks: VisualDocument['blocks']): VisualDocument {
  const summary = emptyStatusSummary()
  for (const entry of entries) summary[entry.state] += 1
  const dates = entries.map((entry) => entry.approved_at).filter((at): at is string => typeof at === 'string' && Number.isFinite(Date.parse(at)))
  return {
    schema: VISUAL_SCHEMA,
    schema_version: 1,
    document_kind: kind,
    brand_id: input.brand_id,
    brand_name: input.brand_name,
    audience: input.audience,
    illustrative: input.illustrative,
    origin: input.illustrative ? 'illustrative_fixture' : 'brand_repository',
    as_of: dates.length ? dates.reduce((latest, at) => (Date.parse(at) > Date.parse(latest) ? at : latest)) : null,
    classification: input.audience === 'public' ? 'public' : 'internal',
    print_profile: 'book_a4_portrait',
    status_summary: summary,
    framework_refs: [frameworkRef(framework)],
    blocks,
  }
}

function notesBlock(input: StrategyListInput, block_id: string, framework: string, numbered: { notes: SourceNote[]; hidden: number }, computed_from: string[]): SourceNotesBlock {
  return {
    type: 'source_notes',
    block_id,
    framework_id: framework,
    data_state: numbered.notes.length ? 'complete' : 'missing',
    sources: numbered.notes.map((note) => note.ref),
    as_of: null,
    computed_from,
    visibility: input.audience,
    renderer_variant: 'source_notes.numbered.v1',
    layout_constraints: { preserve_topology: false, min_print_pt: 7, print_profile: 'book_a4_portrait' },
    notes: numbered.notes,
    hidden: numbered.hidden,
  }
}

/** SWOT quadrants and the TOWS matrix in one document. */
export function swotTowsDocument(input: StrategyListInput): VisualDocument {
  const specs = [...SWOT_AREAS, TOWS_AREA]
  const raw = specs.map((spec) => input.entries.get(spec.question) ?? null)
  const numbered = numberSources(raw.map((entry) => (entry ? stripApproved(entry) : null)), input)
  const swotEntries = numbered.entries.slice(0, 4)
  const towsEntry = numbered.entries[4] ?? null
  const quadrants = SWOT_AREAS.map((spec, index) => area(spec, index + 1, input, swotEntries[index] ?? null))
  const present = raw.filter((entry): entry is StrategyEntry => entry !== null)
  const swot: SwotBlock = {
    ...baseBlock(input, 'swot', 'SWOT', present.filter((entry) => entry.id !== TOWS_AREA.question), 'swot.quadrants.v1', SWOT_AREAS.map((spec) => spec.question), quadrants),
    type: 'swot',
    quadrants,
  }
  const names = namesOf(swotEntries)
  const towsArea = area(TOWS_AREA, 5, input, towsEntry)
  const cells = Object.fromEntries(TOWS_TYPES.map((type) => [type, [] as string[]])) as Record<TowsType, string[]>
  const unplaced: string[] = []
  for (const item of towsEntry?.items ?? []) {
    const type = item.tags.find((tag) => tag.field === 'type')?.value as TowsType | undefined
    if (type && (TOWS_TYPES as readonly string[]).includes(type)) cells[type].push(item.id)
    else unplaced.push(item.id)
  }
  const tows: TowsMatrixBlock = {
    ...baseBlock(input, 'tows', 'TOWS', present.filter((entry) => entry.id === TOWS_AREA.question), 'tows.matrix.v1', [TOWS_AREA.question, ...SWOT_AREAS.map((spec) => spec.question)], [towsArea]),
    type: 'tows_matrix',
    area: towsArea,
    cells,
    unplaced,
    links: linksOf([towsEntry], names),
    names: Object.fromEntries(names),
  }
  return documentShell(input, 'swot_tows', 'SWOT', present, [swot, tows, notesBlock(input, 'swot-sources', 'SWOT', numbered, ['swot', 'tows'])])
}

/** The Value Proposition Canvas: value map, customer profile, the recorded fit and the item sources. */
export function valuePropositionDocument(input: StrategyListInput): VisualDocument {
  const raw = VALUE_FIT_AREAS.map((spec) => input.entries.get(spec.question) ?? null)
  const numbered = numberSources(raw.map((entry) => (entry ? stripApproved(entry) : null)), input)
  const zones = VALUE_FIT_AREAS.map((spec, index) => area(spec, index + 1, input, numbered.entries[index] ?? null))
  const segments = input.entries.get(SEGMENTS_QUESTION) ?? null
  const names = namesOf([...numbered.entries, segments])
  const byZone = (zone: ValueFitZoneId): VisualEntityItem[] => zones.find((z) => z.area_id === zone)?.entry?.items ?? []
  const fitRows = (targets: VisualEntityItem[], from: VisualEntityItem[]): FitRow[] => targets.map((target) => ({ id: target.id, addressed_by: from.filter((item) => item.links.includes(target.id)).map((item) => item.id) }))
  const present = raw.filter((entry): entry is StrategyEntry => entry !== null)
  const block: ValuePropositionCanvasBlock = {
    ...baseBlock(input, 'vpc', 'VPC', present, 'vpc.square_circle.v1', [...VALUE_FIT_QUESTIONS, SEGMENTS_QUESTION], zones),
    type: 'value_proposition_canvas',
    zones,
    fit: { pains: fitRows(byZone('pains'), byZone('pain_relievers')), gains: fitRows(byZone('gains'), byZone('gain_creators')) },
    links: linksOf(numbered.entries, names),
    names: Object.fromEntries(names),
  }
  return documentShell(input, 'value_proposition', 'VPC', present, [block, notesBlock(input, 'vpc-sources', 'VPC', numbered, ['vpc'])])
}

export interface StrategyListOptions {
  now?: Date
  /** Shared knowledge notes Studio can see on this commit (id → title). Anything else is "not shared". */
  sharedNotes?: ReadonlyMap<string, string>
}

const MAX_HOST = 120
const MAX_URL = 200

/** A web source shown as its host; the address keeps origin and path only (no query, no fragment). */
function webSource(ref: string): ResolvedSource {
  try {
    const url = new URL(ref)
    const address = `${url.origin}${url.pathname}`
    return { kind: 'web', ref: address.slice(0, MAX_URL), label: null, host: url.hostname.slice(0, MAX_HOST), url: address.length > MAX_URL ? null : address, status: 'recorded' }
  } catch {
    return { kind: 'web', ref: '', label: null, host: null, url: null, status: 'not_available' }
  }
}

function inputFor(engine: InterviewEngine, audience: DocumentAudience, questions: readonly string[], options: StrategyListOptions): StrategyListInput {
  const root = engine.workspaceRoot()
  const config = engine.config()
  const brandId = config.brand.slug
  const now = options.now ?? new Date()
  const facts = readFacts(root, 'approved', brandId)
  const answers = latestAnswers(engine.ledger().records)
  let evidence: EvidenceItem[] = []
  try {
    evidence = readEvidence(root)
  } catch {
    evidence = []
  }
  const context: ItemContext = { facts, answers, audience, root, brandId, evidence, now }
  const existing = new Set(engine.questions().map((question) => question.id))
  const entries = new Map<string, StrategyEntry>()
  const applicability = brandApplicability(engine)
  for (const id of questions) {
    if (!engine.question(id)) continue
    // BOS-15: the question itself, the personal answer standing in for it (one per area), or not applicable.
    const ref = applicability.refs(id)[0]
    const entry = ref ? frameworkEntry(engine, context, ref, now) : null
    if (entry) entries.set(id, entry)
  }
  const evidenceById = new Map(evidence.map((record) => [record.id, record]))
  const resolve = (ref: string): ResolvedSource => {
    const kind = sourceRefKind(ref)
    if (kind === 'web') return webSource(ref)
    if (kind === 'knowledge') {
      const title = options.sharedNotes?.get(ref) ?? null
      return { kind, ref, label: title ? title.slice(0, 200) : null, host: null, url: null, status: title ? 'shared' : 'not_available' }
    }
    if (kind === 'evidence') {
      const record = evidenceById.get(ref)
      const status = record?.status === 'verified' ? 'verified' : record?.status === 'pending' ? 'recorded' : 'not_available'
      return { kind, ref, label: null, host: null, url: null, status }
    }
    const question = engine.question(ref)
    if (!question) return { kind: 'fact', ref, label: null, host: null, url: null, status: 'not_available' }
    const item = itemFor(question, context)
    const approved = item.tag === 'approved' && !item.withheld
    return { kind: 'fact', ref, label: question.label, host: null, url: null, status: approved ? 'approved' : 'not_available' }
  }
  return { brand_id: brandId, brand_name: String(config.brand.name ?? brandId), audience, illustrative: false, entries, existing, resolve }
}

/** SWOT / TOWS for one brand repository and audience. Applies where the canvas applies. */
export function buildSwotTows(engine: InterviewEngine, audience: DocumentAudience, options: StrategyListOptions = {}): VisualDocument {
  return swotTowsDocument(inputFor(engine, audience, SWOT_TOWS_QUESTIONS, options))
}

/** Value Proposition Canvas for one brand repository and audience; segments are read only to name links. */
export function buildValueProposition(engine: InterviewEngine, audience: DocumentAudience, options: StrategyListOptions = {}): VisualDocument {
  return valuePropositionDocument(inputFor(engine, audience, [...VALUE_FIT_QUESTIONS, SEGMENTS_QUESTION], options))
}

/** Same rule as the canvas: every business brand, and personal brands with a business facet. */
export const strategyListsApply = canvasApplies

export { SWOT_QUADRANTS, VALUE_FIT_ZONES }
