import fs from 'node:fs'
import path from 'node:path'
import { readFacts, type CanonicalFact } from '../facts.js'
import { KnowledgeError } from '../knowledge/model.js'
import { parseKnowledgeRef } from '../knowledge/proposals.js'
import { dirUsable, ensureDir, safeRead, withLock, writeVaultFile, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import {
  approvalSeal,
  canonicalJson,
  newApprovalEventId,
  sha256Hex,
  StrategyError,
  validateRevisionNumber,
  validateSha,
  type ContentChannel,
} from '../strategy/model.js'
import { assertOwnerProcess, evidenceState, factState, readApprovalSecret, requireProof } from '../strategy/store.js'
import {
  CALENDAR_DIR,
  CALENDAR_LIMITS,
  CALENDAR_SCHEMA_VERSION,
  isoDate,
  parseDate,
  parseWeekContent,
  slotFactIds,
  validateWeekId,
  WEEK_APPROVAL_DOMAIN,
  weekApprovalDigest,
  weekContentDigest,
  type CalendarGap,
  type ContentSlot,
  type ContentWeekContent,
  type ContentWeekRecord,
  type ContentWeekRevision,
  type SlotViewStatus,
  type WeekEntry,
  type WeekStatus,
} from './calendar-model.js'
import { claimConflicts } from './claims.js'
import { CAL_NOTICE, CAL_TEXT } from './calendar-i18n.js'
import { fill, type ContentLang } from './i18n.js'
import { gapText } from './planner.js'
import { servedContentViews, type ContentStrategyView, type ResolvedSource } from './projection.js'

/**
 * Calendar weeks on disk (Content Bridge Slice B). One folder per week under brand/.private/content/calendar/ (git
 * ignored; never in Studio, docs builds or exports): record.json is the mutable index, r0001.json… are immutable,
 * hashed revisions. Owner process only; Slice C adds the agent read path through the existing gates.
 */

// ---- problems (en/fa/tr) -------------------------------------------------------------------------------

export interface CalendarProblem {
  code: string
  vars: Record<string, string | number>
}

export function problemText(problem: CalendarProblem, lang: ContentLang): string {
  const entry = CAL_TEXT[`cal_block_${problem.code}`]
  return entry ? fill(entry[lang], problem.vars) : problem.code
}

/** A refusal with its reasons as codes, so the CLI can print them in the owner's language. */
export class CalendarError extends StrategyError {
  constructor(
    code: ConstructorParameters<typeof StrategyError>[0],
    readonly problems: CalendarProblem[],
  ) {
    super(code, problems.map((problem) => problemText(problem, 'en')).join(' '))
  }
}

// ---- files ---------------------------------------------------------------------------------------------

function calendarRoot(ws: KnowledgeWorkspace): string {
  return path.join(ws.root, ...CALENDAR_DIR.split('/'))
}

function weekDir(ws: KnowledgeWorkspace, id: string): string {
  return path.join(calendarRoot(ws), validateWeekId(id))
}

function recordFile(ws: KnowledgeWorkspace, id: string): string {
  return path.join(weekDir(ws, id), 'record.json')
}

function revisionFile(ws: KnowledgeWorkspace, id: string, revision: number): string {
  return path.join(weekDir(ws, id), `r${String(validateRevisionNumber(revision)).padStart(4, '0')}.json`)
}

function readJson<T extends { kind: string; brand_slug: string }>(ws: KnowledgeWorkspace, file: string, kind: string): T | null {
  if (!dirUsable(ws, calendarRoot(ws)) || !dirUsable(ws, path.dirname(file))) return null
  let raw: Buffer | null
  try {
    raw = safeRead(file, CALENDAR_LIMITS.maxFileBytes)
  } catch (error) {
    if (error instanceof KnowledgeError) throw new StrategyError('unsafe_path', error.message)
    throw error
  }
  if (!raw) return null
  let doc: T
  try {
    doc = JSON.parse(raw.toString('utf8')) as T
  } catch {
    throw new StrategyError('invalid_record', `${path.basename(file)} is not valid JSON.`)
  }
  if (!doc || typeof doc !== 'object' || doc.kind !== kind) throw new StrategyError('invalid_record', `${path.basename(file)} is not a ${kind}.`)
  if (doc.brand_slug !== ws.brandSlug) throw new StrategyError('wrong_brand', `${path.basename(file)} belongs to another brand. It is not read.`)
  return doc
}

function writeJson(ws: KnowledgeWorkspace, file: string, doc: unknown): void {
  ensureDir(ws, path.dirname(file))
  writeVaultFile(ws, file, `${JSON.stringify(doc, null, 2)}\n`, true)
}

export function loadWeekRecord(ws: KnowledgeWorkspace, id: string): ContentWeekRecord {
  const doc = readJson<ContentWeekRecord>(ws, recordFile(ws, id), 'content_week_record')
  if (!doc) throw new StrategyError('not_found', `No calendar week ${id} in this brand.`)
  if (doc.week_id !== id || !Array.isArray(doc.revisions)) throw new StrategyError('invalid_record', `The record for ${id} is malformed or carries another id.`)
  return doc
}

function entryOf(record: ContentWeekRecord, revision: number): WeekEntry {
  const entry = record.revisions.find((item) => item.revision === revision)
  if (!entry) throw new StrategyError('not_found', `No revision ${revision} of ${record.week_id}.`)
  return entry
}

/** The one approved revision of a week, or null. Two approved revisions is integrity_failed (thrown). */
export function approvedWeekEntry(record: ContentWeekRecord): WeekEntry | null {
  const approved = record.revisions.filter((item) => item.state === 'approved')
  if (approved.length > 1) throw new StrategyError('integrity_failed', `${record.week_id} has ${approved.length} approved revisions. None is served.`)
  return approved[0] ?? null
}

/** A revision file whose bytes still hash to the recorded content hash. Anything else is integrity_failed. */
export function loadWeekRevision(ws: KnowledgeWorkspace, id: string, revision: number, entry?: WeekEntry): ContentWeekRevision {
  const doc = readJson<ContentWeekRevision>(ws, revisionFile(ws, id, revision), 'content_week_revision')
  if (!doc) throw new StrategyError('not_found', `No revision ${revision} of ${id}.`)
  if (doc.week_id !== id || doc.revision !== revision || !doc.content || typeof doc.content !== 'object') throw new StrategyError('integrity_failed', `Revision ${revision} of ${id} carries another id or number.`)
  const digest = weekContentDigest(doc)
  if (digest !== doc.content_sha256 || (entry && entry.content_sha256 !== digest)) throw new StrategyError('integrity_failed', `Revision ${revision} of ${id} changed after it was proposed (content hash mismatch). It is not served.`)
  return doc
}

/** Every week record of this brand, by week id. Corrupt, foreign or symlinked folders are skipped. */
export function scanWeeks(ws: KnowledgeWorkspace): ContentWeekRecord[] {
  const folder = calendarRoot(ws)
  if (!dirUsable(ws, folder)) return []
  const out: ContentWeekRecord[] = []
  for (const name of fs.readdirSync(folder).sort()) {
    try {
      validateWeekId(name)
      out.push(loadWeekRecord(ws, name))
    } catch (error) {
      if (!(error instanceof StrategyError)) throw error
    }
  }
  return out
}

// ---- checks against the brand ----------------------------------------------------------------------------

function strategyFacts(view: ContentStrategyView): Set<string> {
  const ids = new Set<string>()
  for (const p of view.pillars) for (const id of p.fact_refs) ids.add(id)
  for (const c of view.channels) for (const id of c.fact_refs) ids.add(id)
  const lists: ResolvedSource[][] = [view.voice.sources, view.claims.sources, view.cta.sources, view.audience, view.messaging, view.offers, view.objective, view.language_sources]
  for (const list of lists) for (const s of list) ids.add(s.fact_id)
  return ids
}

/** The served view of the pinned strategy, or null when it is not served. */
function pinnedView(ws: KnowledgeWorkspace, content: ContentWeekContent, now: Date, lang: ContentLang): ContentStrategyView | null {
  return servedContentViews(ws, { lang, strategy_id: content.strategy.strategy_id, now }).views[0] ?? null
}

/**
 * Everything that keeps a week from serving the approved strategy now: the pinned strategy revision is not the one
 * served, a slot uses a channel, format, pillar, language or fact the strategy does not, a cited fact or research
 * note changed, or slot text contradicts a banned claim or the availability rule.
 */
export function weekProblems(ws: KnowledgeWorkspace, content: ContentWeekContent, now: Date, lang: ContentLang = 'en'): { problems: CalendarProblem[]; view: ContentStrategyView | null } {
  const problems: CalendarProblem[] = []
  const pin = content.strategy
  const view = pinnedView(ws, content, now, lang)
  if (!view) problems.push({ code: 'strategy_not_served', vars: { id: pin.strategy_id, rev: pin.revision } })
  else if (view.revision !== pin.revision || view.digests.content_sha256 !== pin.content_sha256) problems.push({ code: 'strategy_changed', vars: { id: pin.strategy_id, rev: pin.revision, now: view.revision } })
  const facts = readFacts(ws.root, 'approved', ws.brandSlug)
  for (const ref of content.fact_refs) {
    if (facts[ref.id]?.classification === 'restricted') problems.push({ code: 'fact_restricted', vars: { fact: ref.id } })
    const state = factState(ws, ref, facts)
    if (state !== 'current') problems.push({ code: 'fact_changed', vars: { fact: ref.id, state } })
  }
  for (const ref of content.research_refs) {
    const parsed = parseKnowledgeRef(ref)
    const state = parsed ? evidenceState(ws, { ref, note_id: parsed.id, revision: parsed.revision }) : 'missing'
    if (state !== 'current') problems.push({ code: 'research_changed', vars: { ref, state } })
  }
  const pinned = new Set(content.fact_refs.map((ref) => ref.id))
  const cited = view && view.revision === pin.revision ? strategyFacts(view) : null
  for (const lang2 of content.languages) if (view && !view.languages.includes(lang2)) problems.push({ code: 'language_not_in_strategy', vars: { slot: '—', lang: lang2 } })
  for (const slot of content.slots) {
    const ids = slotFactIds(slot)
    if (!ids.length) problems.push({ code: 'slot_no_source', vars: { slot: slot.id } })
    for (const id of ids) {
      if (!pinned.has(id)) problems.push({ code: 'fact_not_pinned', vars: { slot: slot.id, fact: id } })
      else if (cited && !cited.has(id)) problems.push({ code: 'fact_not_in_strategy', vars: { slot: slot.id, fact: id } })
    }
    if (slot.research && !content.research_refs.includes(slot.research.ref)) problems.push({ code: 'research_not_pinned', vars: { slot: slot.id } })
    if (view) {
      const channel = view.channels.find((c) => c.channel === slot.channel)
      if (!channel) problems.push({ code: 'channel_not_in_strategy', vars: { slot: slot.id, channel: slot.channel } })
      else {
        if (slot.format !== null && !channel.formats.includes(slot.format)) problems.push({ code: 'format_not_in_channel', vars: { slot: slot.id, format: slot.format, channel: slot.channel } })
        const langs = channel.languages.length ? channel.languages : view.languages
        if (!langs.includes(slot.language)) problems.push({ code: 'language_not_in_strategy', vars: { slot: slot.id, lang: slot.language } })
      }
      if (slot.pillar !== null && !view.pillars.some((p) => p.id === slot.pillar)) problems.push({ code: 'pillar_unknown', vars: { slot: slot.id, pillar: slot.pillar } })
      for (const [field, value] of [['hook', slot.hook], ['angle', slot.angle], ['notes', slot.notes]] as const) {
        for (const conflict of claimConflicts(field, value, view.claims.banned, view.claims.availability)) {
          problems.push({ code: conflict.kind === 'banned' ? 'banned_claim' : 'availability_claim', vars: { slot: slot.id, field, rule: conflict.rule } })
        }
      }
    }
  }
  return { problems, view }
}

// ---- propose -------------------------------------------------------------------------------------------

export interface WeekProposeResult {
  record: ContentWeekRecord
  revision: ContentWeekRevision
  path: string
}

/**
 * Stores one week as a draft revision. Refused (nothing written) when the week does not serve the approved strategy
 * now or slot text contradicts a banned claim. A draft is never served; an approved revision stays served meanwhile.
 */
export function proposeWeek(ws: KnowledgeWorkspace, input: { week: unknown; lang?: ContentLang }): WeekProposeResult {
  assertOwnerProcess()
  const content = parseWeekContent(input.week)
  const { problems } = weekProblems(ws, content, ws.now(), input.lang ?? 'en')
  if (problems.length) throw new CalendarError('refused', problems)
  const id = content.week_id
  const now = ws.now().toISOString()
  return withLock(ws, `content-week-${id}`, () => {
    let record: ContentWeekRecord
    try {
      record = loadWeekRecord(ws, id)
    } catch (error) {
      if (!(error instanceof StrategyError) || error.code !== 'not_found') throw error
      record = { schema_version: CALENDAR_SCHEMA_VERSION, kind: 'content_week_record', week_id: id, brand_slug: ws.brandSlug, created_at: now, updated_at: now, revisions: [] }
    }
    if (record.revisions.length >= CALENDAR_LIMITS.maxRevisions) throw new StrategyError('invalid_input', `At most ${CALENDAR_LIMITS.maxRevisions} revisions per week.`)
    const number = record.revisions.reduce((max, item) => Math.max(max, item.revision), 0) + 1
    const approved = approvedWeekEntry(record)
    const base = { week_id: id, brand_slug: ws.brandSlug, revision: number, supersedes_revision: approved?.revision ?? null, content }
    const revision: ContentWeekRevision = { schema_version: CALENDAR_SCHEMA_VERSION, kind: 'content_week_revision', ...base, content_sha256: weekContentDigest(base), created_at: now }
    const file = revisionFile(ws, id, number)
    if (fs.existsSync(file)) throw new StrategyError('exists', `Revision file ${path.basename(file)} already exists. Revisions are never overwritten.`)
    writeJson(ws, file, revision)
    record.revisions.push({ revision: number, content_sha256: revision.content_sha256, state: 'draft', created_at: now, approval: null, superseded_by: null, superseded_at: null, rejected_at: null, withdrawn: null })
    record.updated_at = now
    writeJson(ws, recordFile(ws, id), record)
    return { record, revision, path: path.relative(ws.root, file).split(path.sep).join('/') }
  })
}

// ---- evaluation ----------------------------------------------------------------------------------------

function approvalVerifies(ws: KnowledgeWorkspace, record: ContentWeekRecord, entry: WeekEntry): boolean {
  const approval = entry.approval
  if (!approval || typeof approval.digest !== 'string' || typeof approval.seal !== 'string') return false
  const digest = weekApprovalDigest({ week_id: record.week_id, brand_slug: record.brand_slug, revision: entry.revision, content_sha256: entry.content_sha256, event_id: approval.event_id, approved_at: approval.approved_at })
  if (digest !== approval.digest) return false
  const secret = readApprovalSecret(ws)
  return secret !== null && approvalSeal(secret, digest, WEEK_APPROVAL_DOMAIN) === approval.seal
}

export interface WeekEvaluation {
  status: WeekStatus
  problems: CalendarProblem[]
  revision: ContentWeekRevision | null
  view: ContentStrategyView | null
}

/** Status of one revision now: integrity and seal, then the pinned strategy, facts, research and claims. */
export function evaluateWeek(ws: KnowledgeWorkspace, record: ContentWeekRecord, entry: WeekEntry, now: Date, lang: ContentLang = 'en'): WeekEvaluation {
  let revision: ContentWeekRevision
  try {
    revision = loadWeekRevision(ws, record.week_id, entry.revision, entry)
  } catch (error) {
    if (error instanceof StrategyError) return { status: 'integrity_failed', problems: [{ code: 'integrity', vars: { week: record.week_id } }], revision: null, view: null }
    throw error
  }
  if (entry.state !== 'approved') return { status: entry.state === 'withdrawn' ? 'superseded' : entry.state, problems: [], revision, view: null }
  if (!approvalVerifies(ws, record, entry)) return { status: 'integrity_failed', problems: [{ code: 'integrity', vars: { week: record.week_id } }], revision, view: null }
  const { problems, view } = weekProblems(ws, revision.content, now, lang)
  return { status: problems.length ? 'needs_review' : 'current', problems, revision, view }
}

// ---- review / approve / reject --------------------------------------------------------------------------

export interface WeekReview {
  week_id: string
  revision: number
  state: WeekEntry['state']
  content_sha256: string
  supersedes_revision: number | null
  current_approved: number | null
  slots: number
  gaps: Array<CalendarGap & { text: string }>
  blockers: string[]
  approve_with: string
  notice: string[]
}

export function reviewWeek(ws: KnowledgeWorkspace, input: { week_id: string; revision: number; lang?: ContentLang }): WeekReview {
  assertOwnerProcess()
  const lang = input.lang ?? 'en'
  const record = loadWeekRecord(ws, validateWeekId(input.week_id))
  const entry = entryOf(record, validateRevisionNumber(input.revision))
  const revision = loadWeekRevision(ws, record.week_id, entry.revision, entry)
  const current = approvedWeekEntry(record)
  const problems = blockersFor(ws, record, entry, revision, current)
  problems.push(...weekProblems(ws, revision.content, ws.now(), lang).problems)
  return {
    week_id: record.week_id,
    revision: entry.revision,
    state: entry.state,
    content_sha256: entry.content_sha256,
    supersedes_revision: revision.supersedes_revision,
    current_approved: current?.revision ?? null,
    slots: revision.content.slots.length,
    gaps: revision.content.gaps.map((gap) => ({ ...gap, text: gapText(gap, lang) })),
    blockers: problems.map((problem) => problemText(problem, lang)),
    approve_with: `npm run brand:content -- week approve --week ${record.week_id} --revision ${entry.revision} --expect-sha ${entry.content_sha256}`,
    notice: CAL_NOTICE[lang],
  }
}

function blockersFor(ws: KnowledgeWorkspace, record: ContentWeekRecord, entry: WeekEntry, revision: ContentWeekRevision, current: WeekEntry | null): CalendarProblem[] {
  const out: CalendarProblem[] = []
  if (entry.state !== 'draft') out.push({ code: 'not_draft', vars: { rev: entry.revision, state: entry.state } })
  if ((current?.revision ?? null) !== revision.supersedes_revision) out.push({ code: 'approved_changed', vars: { was: revision.supersedes_revision ?? '—', now: current?.revision ?? '—' } })
  if (revision.content.week_end < isoDate(ws.now())) out.push({ code: 'week_past', vars: { week: record.week_id } })
  return out
}

/**
 * Owner approval of one draft week: owner proof, the reviewed hash, and every check of `weekProblems` passing now.
 * The previously approved revision of the week becomes superseded; both stay on disk.
 */
export function approveWeek(ws: KnowledgeWorkspace, input: { week_id: string; revision: number; expected_sha256: string; proof: string | undefined; lang?: ContentLang }): { record: ContentWeekRecord; approved: WeekEntry; superseded: WeekEntry | null } {
  assertOwnerProcess()
  const id = validateWeekId(input.week_id)
  const number = validateRevisionNumber(input.revision)
  const expected = validateSha(input.expected_sha256, '--expect-sha')
  const secret = requireProof(ws, input.proof)
  return withLock(ws, `content-week-${id}`, () => {
    const record = loadWeekRecord(ws, id)
    const entry = entryOf(record, number)
    const revision = loadWeekRevision(ws, id, number, entry)
    if (revision.content_sha256 !== expected) throw new StrategyError('stale_revision', `Revision ${number} hashes to ${revision.content_sha256}, not the ${expected} you reviewed. Review it again. Nothing was approved.`)
    const current = approvedWeekEntry(record)
    const problems = [...blockersFor(ws, record, entry, revision, current), ...weekProblems(ws, revision.content, ws.now(), input.lang ?? 'en').problems]
    if (problems.length) throw new CalendarError('refused', problems)
    const now = ws.now().toISOString()
    const eventId = newApprovalEventId()
    const digest = weekApprovalDigest({ week_id: id, brand_slug: record.brand_slug, revision: number, content_sha256: revision.content_sha256, event_id: eventId, approved_at: now })
    entry.state = 'approved'
    entry.approval = { event_id: eventId, approved_at: now, actor: 'owner', digest, seal: approvalSeal(secret, digest, WEEK_APPROVAL_DOMAIN) }
    if (current) {
      current.state = 'superseded'
      current.superseded_by = number
      current.superseded_at = now
    }
    record.updated_at = now
    writeJson(ws, recordFile(ws, id), record)
    return { record, approved: entry, superseded: current }
  })
}

/** The owner declines a draft week. It stays on disk and is never served. */
export function rejectWeek(ws: KnowledgeWorkspace, input: { week_id: string; revision: number }): WeekEntry {
  assertOwnerProcess()
  const id = validateWeekId(input.week_id)
  const number = validateRevisionNumber(input.revision)
  return withLock(ws, `content-week-${id}`, () => {
    const record = loadWeekRecord(ws, id)
    const entry = entryOf(record, number)
    if (entry.state !== 'draft') throw new CalendarError('refused', [{ code: 'not_draft', vars: { rev: number, state: entry.state } }])
    const now = ws.now().toISOString()
    entry.state = 'rejected'
    entry.rejected_at = now
    record.updated_at = now
    writeJson(ws, recordFile(ws, id), record)
    return entry
  })
}

export interface WeekSummary {
  week_id: string
  current: number | null
  revisions: Array<{ revision: number; state: WeekEntry['state']; status: WeekStatus; content_sha256: string; slots: number; reasons: string[] }>
}

/** Owner overview of every week and revision. */
export function listWeeks(ws: KnowledgeWorkspace, lang: ContentLang = 'en', now: Date = ws.now()): WeekSummary[] {
  assertOwnerProcess()
  return scanWeeks(ws).map((record) => {
    let current: number | null = null
    try {
      current = approvedWeekEntry(record)?.revision ?? null
    } catch {
      current = null
    }
    return {
      week_id: record.week_id,
      current,
      revisions: [...record.revisions]
        .sort((a, b) => a.revision - b.revision)
        .map((entry) => {
          const result = evaluateWeek(ws, record, entry, now, lang)
          return { revision: entry.revision, state: entry.state, status: result.status, content_sha256: entry.content_sha256, slots: result.revision?.content.slots.length ?? 0, reasons: result.problems.map((p) => problemText(p, lang)) }
        }),
    }
  })
}

// ---- the owner's calendar view --------------------------------------------------------------------------

export const CALENDAR_VIEW_SCHEMA = 'brand-os/content-calendar/v1' as const

export interface CalendarSlotView extends Omit<ContentSlot, 'status'> {
  status: SlotViewStatus
  pillar_name: string | null
}

export interface CalendarWeekView {
  week_id: string
  week_start: string
  week_end: string
  revision: number
  status: 'current'
  digests: { content_sha256: string; approval_digest: string }
  approval: { approved_at: string; event_id: string; actor: 'owner' }
  strategy: ContentWeekContent['strategy']
  languages: string[]
  slots: CalendarSlotView[]
  gaps: Array<CalendarGap & { text: string }>
  /** Every non-restricted fact the week's slots cite, resolved now (at the pinned revision, or the week is not served). */
  facts: ResolvedSource[]
}

export interface CalendarView {
  schema: typeof CALENDAR_VIEW_SCHEMA
  kind: 'content_calendar'
  brand_id: string
  range: { from: string | null; to: string | null }
  channel: ContentChannel | null
  weeks: CalendarWeekView[]
  /** Weeks with nothing served now, counted by status. Never their slots. */
  withheld: Record<string, number>
  digests: { view_sha256: string }
  authorizes: []
  publication_permission: false
  notice: string[]
}

function valueText(fact: CanonicalFact): string {
  return typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value)
}

/**
 * Approved, current weeks overlapping [from, to], optionally one channel. Drafts, rejected, superseded, stale and
 * tampered weeks are only counted under `withheld`.
 */
export function contentCalendar(ws: KnowledgeWorkspace, opts: CalendarOptions): CalendarView {
  assertOwnerProcess()
  return buildCalendar(ws, opts)
}

export interface CalendarOptions {
  lang: ContentLang
  from?: string
  to?: string
  channel?: ContentChannel
  now?: Date
}

/** The same view without the owner-process check. Callers authorize first (the agent tools use the Strategy Feed gate). */
export function buildCalendar(ws: KnowledgeWorkspace, opts: CalendarOptions): CalendarView {
  const now = opts.now ?? ws.now()
  const from = opts.from ? isoDate(parseDate(opts.from, '--from')) : null
  const to = opts.to ? isoDate(parseDate(opts.to, '--to')) : null
  const facts = readFacts(ws.root, 'approved', ws.brandSlug)
  const weeks: CalendarWeekView[] = []
  const withheld: Record<string, number> = {}
  const count = (status: string) => (withheld[status] = (withheld[status] ?? 0) + 1)
  for (const record of scanWeeks(ws)) {
    const start = record.week_id.slice(3)
    if (to && start > to) continue
    for (const entry of record.revisions) if (entry.state === 'draft') count('draft')
    let entry: WeekEntry | null
    try {
      entry = approvedWeekEntry(record)
    } catch {
      count('integrity_failed')
      continue
    }
    if (!entry) continue
    const result = evaluateWeek(ws, record, entry, now, opts.lang)
    const revision = result.revision
    if (result.status !== 'current' || !revision || !entry.approval) {
      count(result.status)
      continue
    }
    const c = revision.content
    if (from && c.week_end < from) continue
    const pillars = new Map((result.view?.pillars ?? []).map((p) => [p.id, p.name]))
    const slots = c.slots
      .filter((slot) => (!opts.channel || slot.channel === opts.channel) && (!from || slot.date >= from) && (!to || slot.date <= to))
      .map((slot) => ({ ...slot, status: (slot.status === 'planned' ? 'approved' : slot.status) as SlotViewStatus, pillar_name: slot.pillar ? (pillars.get(slot.pillar) ?? null) : null }))
    const ids = new Set(slots.flatMap(slotFactIds))
    const resolved: ResolvedSource[] = []
    for (const ref of c.fact_refs) {
      const fact = facts[ref.id]
      if (!ids.has(ref.id) || !fact || fact.classification === 'restricted') continue
      resolved.push({ fact_id: ref.id, revision: ref.revision, value: valueText(fact) })
    }
    weeks.push({
      week_id: c.week_id,
      week_start: c.week_start,
      week_end: c.week_end,
      revision: revision.revision,
      status: 'current',
      digests: { content_sha256: revision.content_sha256, approval_digest: entry.approval.digest },
      approval: { approved_at: entry.approval.approved_at, event_id: entry.approval.event_id, actor: 'owner' },
      strategy: c.strategy,
      languages: c.languages,
      slots,
      gaps: c.gaps.filter((gap) => !opts.channel || gap.channel === null || gap.channel === opts.channel).map((gap) => ({ ...gap, text: gapText(gap, opts.lang) })),
      facts: resolved,
    })
  }
  const doc = { schema: CALENDAR_VIEW_SCHEMA, kind: 'content_calendar' as const, brand_id: ws.brandSlug, range: { from, to }, channel: opts.channel ?? null, weeks, withheld, authorizes: [] as [], publication_permission: false as const, notice: CAL_NOTICE[opts.lang] }
  return { ...doc, digests: { view_sha256: sha256Hex(canonicalJson(doc)) } }
}
