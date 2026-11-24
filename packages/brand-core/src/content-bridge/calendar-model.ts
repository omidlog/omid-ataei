import { COMPETITOR_ID, OBSERVATION_ID } from '../competitive/model.js'
import {
  canonicalJson,
  FACT_ID,
  ITEM_ID as PILLAR_ID,
  LOCALE,
  CONTENT_CHANNELS,
  CONTENT_FORMATS,
  sha256Hex,
  StrategyError,
  text,
  validateRevisionNumber,
  validateSha,
  validateStrategyId,
  type ContentChannel,
  type ContentFormat,
  type FactRef,
  type RevisionEntry,
  type StrategyRef,
} from '../strategy/model.js'

/**
 * The content calendar (Content Bridge Slice B): dated slots planned from the served content strategy, approved by the
 * owner one week at a time.
 *
 * - A week is a small record with immutable revisions, like a strategy: `brand/.private/content/calendar/<week_id>/`
 *   holds `record.json` (the mutable index, the same RevisionEntry shape) and `r0001.json`… (hashed, never edited).
 * - A week pins the content strategy revision it was planned from and the revision_hash of every fact a slot cites.
 *   Slots cite facts by id (key message, offer, CTA, objective, pillar); fact text is never copied.
 * - Approval is the strategy approval: owner proof, the reviewed hash, an HMAC seal keyed by the approval secret, here
 *   under its own domain so a week seal never verifies as a strategy seal.
 * - Nothing here posts, schedules or publishes. An approved week authorizes nothing (`authorizes: []`).
 */

export const CALENDAR_SCHEMA_VERSION = 1
export const CALENDAR_DIR = 'brand/.private/content/calendar'
export const WEEK_APPROVAL_DOMAIN = 'brand-os/content-week-approval/v1'
export const WEEK_ID = /^wk-(\d{4}-\d{2}-\d{2})$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const SLOT_ID = /^s\d{2,3}$/
const RESEARCH_REF = /^knowledge:kn_[a-z0-9][a-z0-9-]{2,63}@[0-9a-f]{64}$/

export const CALENDAR_LIMITS = { maxWeeks: 12, maxSlots: 120, maxGaps: 60, maxHookChars: 200, maxAngleChars: 280, maxNoteChars: 280, maxFileBytes: 512 * 1024, maxRevisions: 200 } as const

/** Stored slot states. `approved` is never stored: a planned slot reads as approved while its week is the served approval. */
export const SLOT_STATES = ['idea', 'planned', 'skipped'] as const
export type SlotState = (typeof SLOT_STATES)[number]
/** What a reader sees. `produced` and `published` arrive as agent observations in Slice C. */
export type SlotViewStatus = 'idea' | 'approved' | 'skipped'

export const CALENDAR_GAP_REASONS = ['cadence_not_decided', 'formats_not_decided', 'no_pillars', 'no_key_message', 'channel_not_in_strategy', 'no_source', 'no_research'] as const
export type CalendarGapReason = (typeof CALENDAR_GAP_REASONS)[number]

export const CONFIDENCE = ['high', 'medium', 'low'] as const
export type Confidence = (typeof CONFIDENCE)[number]

/** An optional research angle: a competitive observation cited by id and note revision, never its text. */
export interface SlotResearch {
  observation_id: string
  ref: string
  competitor_id: string
  dimension: string
  /** From the observation's cell: verified observed → high, observed → medium, unverified or hypothesis → low. */
  confidence: Confidence
  basis: string
}

export interface ContentSlot {
  id: string
  date: string
  channel: ContentChannel
  /** Null when the strategy names no formats for the channel (a gap). */
  format: ContentFormat | null
  /** A pillar id of the pinned strategy, or null when it has none (a gap). */
  pillar: string | null
  language: string
  /** Fact ids. The values are resolved at read time. */
  objective: string[]
  key_message: string | null
  offer: string | null
  cta: string | null
  /** Owner- or writer-supplied. The planner leaves these null: it never writes copy. */
  hook: string | null
  angle: string | null
  notes: string | null
  research: SlotResearch | null
  status: SlotState
  /** Every fact this slot serves. Each is pinned in the week's fact_refs. */
  fact_refs: string[]
}

export interface CalendarGap {
  channel: ContentChannel | null
  reason: CalendarGapReason
}

/** Everything the owner reviews and approves for one week. Hashed canonically into content_sha256. */
export interface ContentWeekContent {
  schema: 1
  week_id: string
  week_start: string
  week_end: string
  /** The served content strategy revision this week was planned from. */
  strategy: StrategyRef
  languages: string[]
  slots: ContentSlot[]
  gaps: CalendarGap[]
  fact_refs: FactRef[]
  research_refs: string[]
}

export interface ContentWeekRevision {
  schema_version: number
  kind: 'content_week_revision'
  week_id: string
  brand_slug: string
  revision: number
  supersedes_revision: number | null
  content: ContentWeekContent
  content_sha256: string
  created_at: string
}

/** Same entry shape as a strategy revision (draft → approved → superseded, or rejected). `withdrawn` stays null. */
export type WeekEntry = RevisionEntry

export interface ContentWeekRecord {
  schema_version: number
  kind: 'content_week_record'
  week_id: string
  brand_slug: string
  created_at: string
  updated_at: string
  revisions: WeekEntry[]
}

export type WeekStatus = 'current' | 'needs_review' | 'integrity_failed' | 'draft' | 'rejected' | 'superseded'

// ---- dates -------------------------------------------------------------------------------------------

export function parseDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !DATE.test(value)) throw new StrategyError('invalid_input', `${field} must be a date like 2026-12-07.`)
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new StrategyError('invalid_input', `${field} is not a real date (${value}).`)
  return date
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

/** The Monday on or before a date (weeks run Monday to Sunday, UTC). */
export function mondayOf(date: Date): Date {
  return addDays(date, -((date.getUTCDay() + 6) % 7))
}

export function weekIdOf(monday: Date): string {
  return `wk-${isoDate(monday)}`
}

/** A week id, checked: `wk-` and a real Monday. */
export function validateWeekId(value: unknown): string {
  const match = typeof value === 'string' ? WEEK_ID.exec(value) : null
  if (!match) throw new StrategyError('invalid_input', 'A week id is wk-YYYY-MM-DD, the Monday the week starts (for example wk-2026-12-07).')
  const date = parseDate(match[1], 'week id')
  if (date.getUTCDay() !== 1) throw new StrategyError('invalid_input', `${String(value)} does not start on a Monday.`)
  return value as string
}

// ---- digests -----------------------------------------------------------------------------------------

export function weekContentDigest(rev: Pick<ContentWeekRevision, 'week_id' | 'brand_slug' | 'revision' | 'supersedes_revision' | 'content'>): string {
  return sha256Hex(canonicalJson({ kind: 'content_week', week_id: rev.week_id, brand_slug: rev.brand_slug, revision: rev.revision, supersedes_revision: rev.supersedes_revision, content: rev.content }))
}

export function weekApprovalDigest(input: { week_id: string; brand_slug: string; revision: number; content_sha256: string; event_id: string; approved_at: string }): string {
  return sha256Hex(canonicalJson({ kind: 'content_week_approval', ...input }))
}

// ---- strict parse of a week file (owner edits) ---------------------------------------------------------

type Raw = Record<string, unknown>

function objectOf(value: unknown, field: string, keys: readonly string[]): Raw {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StrategyError('invalid_input', `${field} must be an object.`)
  const o = value as Raw
  for (const key of Object.keys(o)) if (!keys.includes(key)) throw new StrategyError('invalid_input', `${field} has an unknown key ${key}.`)
  return o
}

function listOf(value: unknown, field: string, max: number): unknown[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new StrategyError('invalid_input', `${field} must be a list.`)
  if (value.length > max) throw new StrategyError('invalid_input', `${field} has more than ${max} items.`)
  return value
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) throw new StrategyError('invalid_input', `${field} must be one of ${allowed.join(', ')}.`)
  return value as T
}

function matching(value: unknown, pattern: RegExp, field: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) throw new StrategyError('invalid_input', `${field} is not valid.`)
  return value
}

function nullableFact(value: unknown, field: string): string | null {
  return value === null || value === undefined ? null : matching(value, FACT_ID, field)
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined || value === '') return null
  return text(value, field, max)
}

function parseResearch(value: unknown, field: string): SlotResearch | null {
  if (value === null || value === undefined) return null
  const r = objectOf(value, field, ['observation_id', 'ref', 'competitor_id', 'dimension', 'confidence', 'basis'])
  return {
    observation_id: matching(r.observation_id, OBSERVATION_ID, `${field}.observation_id`),
    ref: matching(r.ref, RESEARCH_REF, `${field}.ref`),
    competitor_id: matching(r.competitor_id, COMPETITOR_ID, `${field}.competitor_id`),
    dimension: matching(r.dimension, /^[a-z_]{2,40}$/, `${field}.dimension`),
    confidence: oneOf(r.confidence, CONFIDENCE, `${field}.confidence`),
    basis: matching(r.basis, /^[a-z_]{2,40}$/, `${field}.basis`),
  }
}

/**
 * Strict shape parse of a week's content. Unknown keys are refused at every level and text goes through the strategy
 * text check (no money, credentials, personal data or placeholders). Whether the slots serve the pinned strategy and
 * its facts is checked by the store against the brand, not here.
 */
export function parseWeekContent(raw: unknown): ContentWeekContent {
  const w = objectOf(raw, 'week', ['schema', 'week_id', 'week_start', 'week_end', 'strategy', 'languages', 'slots', 'gaps', 'fact_refs', 'research_refs'])
  if (w.schema !== 1) throw new StrategyError('invalid_input', 'week.schema must be 1.')
  const weekId = validateWeekId(w.week_id)
  const start = isoDate(parseDate(w.week_start, 'week.week_start'))
  const end = isoDate(parseDate(w.week_end, 'week.week_end'))
  if (`wk-${start}` !== weekId || isoDate(addDays(parseDate(start, 'week_start'), 6)) !== end) throw new StrategyError('invalid_input', 'week_start and week_end must be the Monday and Sunday of week_id.')
  const s = objectOf(w.strategy, 'week.strategy', ['strategy_id', 'revision', 'content_sha256'])
  const strategy = { strategy_id: validateStrategyId(s.strategy_id), revision: validateRevisionNumber(s.revision), content_sha256: validateSha(s.content_sha256, 'week.strategy.content_sha256') }
  const languages = listOf(w.languages, 'week.languages', 10).map((item, i) => matching(item, LOCALE, `week.languages[${i}]`))
  if (!languages.length) throw new StrategyError('invalid_input', 'week.languages needs at least one language.')
  const ids = new Set<string>()
  const slots = listOf(w.slots, 'week.slots', CALENDAR_LIMITS.maxSlots).map((item, i): ContentSlot => {
    const f = `week.slots[${i}]`
    const o = objectOf(item, f, ['id', 'date', 'channel', 'format', 'pillar', 'language', 'objective', 'key_message', 'offer', 'cta', 'hook', 'angle', 'notes', 'research', 'status', 'fact_refs'])
    const id = matching(o.id, SLOT_ID, `${f}.id`)
    if (ids.has(id)) throw new StrategyError('invalid_input', `week.slots has ${id} twice.`)
    ids.add(id)
    const date = isoDate(parseDate(o.date, `${f}.date`))
    if (date < start || date > end) throw new StrategyError('invalid_input', `${f}.date ${date} is outside ${weekId}.`)
    const language = matching(o.language, LOCALE, `${f}.language`)
    if (!languages.includes(language)) throw new StrategyError('invalid_input', `${f}.language ${language} is not in week.languages.`)
    return {
      id,
      date,
      channel: oneOf(o.channel, CONTENT_CHANNELS, `${f}.channel`),
      format: o.format === null || o.format === undefined ? null : oneOf(o.format, CONTENT_FORMATS, `${f}.format`),
      pillar: o.pillar === null || o.pillar === undefined ? null : matching(o.pillar, PILLAR_ID, `${f}.pillar`),
      language,
      objective: [...new Set(listOf(o.objective, `${f}.objective`, 10).map((id2, j) => matching(id2, FACT_ID, `${f}.objective[${j}]`)))],
      key_message: nullableFact(o.key_message, `${f}.key_message`),
      offer: nullableFact(o.offer, `${f}.offer`),
      cta: nullableFact(o.cta, `${f}.cta`),
      hook: optionalText(o.hook, `${f}.hook`, CALENDAR_LIMITS.maxHookChars),
      angle: optionalText(o.angle, `${f}.angle`, CALENDAR_LIMITS.maxAngleChars),
      notes: optionalText(o.notes, `${f}.notes`, CALENDAR_LIMITS.maxNoteChars),
      research: parseResearch(o.research, `${f}.research`),
      status: oneOf(o.status, SLOT_STATES, `${f}.status`),
      fact_refs: [...new Set(listOf(o.fact_refs, `${f}.fact_refs`, 30).map((id2, j) => matching(id2, FACT_ID, `${f}.fact_refs[${j}]`)))],
    }
  })
  const gaps = listOf(w.gaps, 'week.gaps', CALENDAR_LIMITS.maxGaps).map((item, i) => {
    const g = objectOf(item, `week.gaps[${i}]`, ['channel', 'reason'])
    return { channel: g.channel === null || g.channel === undefined ? null : oneOf(g.channel, CONTENT_CHANNELS, `week.gaps[${i}].channel`), reason: oneOf(g.reason, CALENDAR_GAP_REASONS, `week.gaps[${i}].reason`) }
  })
  const factRefs = listOf(w.fact_refs, 'week.fact_refs', 60).map((item, i) => {
    const r = objectOf(item, `week.fact_refs[${i}]`, ['id', 'revision'])
    return { id: matching(r.id, FACT_ID, `week.fact_refs[${i}].id`), revision: matching(r.revision, /^[A-Za-z0-9_.:-]{1,200}$/, `week.fact_refs[${i}].revision`) }
  })
  const researchRefs = [...new Set(listOf(w.research_refs, 'week.research_refs', 60).map((item, i) => matching(item, RESEARCH_REF, `week.research_refs[${i}]`)))]
  return { schema: 1, week_id: weekId, week_start: start, week_end: end, strategy, languages, slots, gaps, fact_refs: factRefs, research_refs: researchRefs }
}

/** Every fact id a slot cites, in one list. */
export function slotFactIds(slot: Pick<ContentSlot, 'fact_refs' | 'objective' | 'key_message' | 'offer' | 'cta'>): string[] {
  return [...new Set([...slot.fact_refs, ...slot.objective, ...[slot.key_message, slot.offer, slot.cta].filter((id): id is string => id !== null)])]
}
