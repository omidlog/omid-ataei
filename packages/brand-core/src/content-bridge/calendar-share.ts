import fs from 'node:fs'
import path from 'node:path'
import { safetyBlocksSharing, safetyReport } from '../knowledge/safety.js'
import { writeVaultFile, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import { CONTENT_CHANNELS, CONTENT_FORMATS, StrategyError } from '../strategy/model.js'
import { assertOwnerProcess } from '../strategy/store.js'
import { CALENDAR_GAP_REASONS, CONFIDENCE, validateWeekId, WEEK_ID, type CalendarGap, type Confidence, type SlotViewStatus } from './calendar-model.js'
import { CalendarError, evaluateWeek, loadWeekRecord, type CalendarProblem } from './calendar-store.js'

/**
 * Sharing an approved calendar week with Studio (Content Bridge Slice B), the same pattern as `brand:creative share`:
 * the owner explicitly copies a derived summary of one approved, current week to
 * `brand/content-calendar/shared/wk-YYYY-MM-DD.json`, a tracked file committed and merged like any other change.
 * Studio's read-only "Content calendar" page shows only these files from the merged default branch.
 *
 * The summary holds dates, channels, formats, pillar names, languages, cited fact ids, the approved hook and angle,
 * and research observation ids with confidence. Never fact values, notes, research quotes or note refs, drafts, or
 * local paths. The private week record stays the truth; the file says when it was shared.
 */

export const SHARED_CALENDAR_DIR = 'brand/content-calendar/shared'
export const SHARED_WEEK_FILE = /^wk-\d{4}-\d{2}-\d{2}\.json$/

export interface SharedSlot {
  id: string
  date: string
  channel: string
  format: string | null
  pillar: string | null
  pillar_name: string | null
  language: string
  key_message: string | null
  offer: string | null
  cta: string | null
  hook: string | null
  angle: string | null
  research: { observation_id: string; confidence: Confidence } | null
  status: SlotViewStatus
}

export interface SharedContentWeek {
  schema_version: 1
  kind: 'content_week'
  week_id: string
  brand_slug: string
  revision: number
  content_sha256: string
  approved_at: string
  week_start: string
  week_end: string
  strategy: { strategy_id: string; revision: number }
  languages: string[]
  slots: SharedSlot[]
  gaps: CalendarGap[]
  shared_at: string
}

/** Writes (or with `dryRun`, previews) the shared summary of the approved, current revision of one week. */
export function shareWeek(ws: KnowledgeWorkspace, input: { week_id: string; dryRun: boolean }): { path: string; week: SharedContentWeek; written: boolean } {
  assertOwnerProcess()
  const id = validateWeekId(input.week_id)
  const record = loadWeekRecord(ws, id)
  const entry = record.revisions.find((item) => item.state === 'approved')
  if (!entry) throw new CalendarError('refused', [{ code: 'share_not_approved', vars: { week: id } }])
  const result = evaluateWeek(ws, record, entry, ws.now())
  if (result.status !== 'current' || !result.revision || !entry.approval) {
    const problems: CalendarProblem[] = [{ code: 'share_not_current', vars: { week: id, status: result.status } }, ...result.problems]
    throw new CalendarError('refused', problems)
  }
  const c = result.revision.content
  const pillars = new Map((result.view?.pillars ?? []).map((p) => [p.id, p.name]))
  const week: SharedContentWeek = {
    schema_version: 1,
    kind: 'content_week',
    week_id: id,
    brand_slug: ws.brandSlug,
    revision: entry.revision,
    content_sha256: entry.content_sha256,
    approved_at: entry.approval.approved_at,
    week_start: c.week_start,
    week_end: c.week_end,
    strategy: { strategy_id: c.strategy.strategy_id, revision: c.strategy.revision },
    languages: c.languages,
    slots: c.slots.map((slot) => ({
      id: slot.id,
      date: slot.date,
      channel: slot.channel,
      format: slot.format,
      pillar: slot.pillar,
      pillar_name: slot.pillar ? (pillars.get(slot.pillar) ?? null) : null,
      language: slot.language,
      key_message: slot.key_message,
      offer: slot.offer,
      cta: slot.cta,
      hook: slot.hook,
      angle: slot.angle,
      research: slot.research ? { observation_id: slot.research.observation_id, confidence: slot.research.confidence } : null,
      status: slot.status === 'planned' ? 'approved' : slot.status,
    })),
    gaps: c.gaps,
    shared_at: ws.now().toISOString(),
  }
  const blocked = safetyBlocksSharing(safetyReport(sharedText(week)))
  if (blocked.length) throw new StrategyError('refused', `The week text looks like it contains ${blocked.join('; ')}. Nothing was shared.`)
  const rel = `${SHARED_CALENDAR_DIR}/${id}.json`
  if (!input.dryRun) writeVaultFile(ws, path.join(ws.root, ...rel.split('/')), `${JSON.stringify(week, null, 2)}\n`, false)
  return { path: rel, week, written: !input.dryRun }
}

function sharedText(week: SharedContentWeek): string {
  return week.slots.flatMap((slot) => [slot.hook ?? '', slot.angle ?? '', slot.pillar_name ?? '']).join('\n')
}

// ---- Studio projection ---------------------------------------------------------------------------------

export type WithheldWeekReason = 'symlink' | 'unreadable' | 'invalid_record' | 'wrong_brand' | 'filename_mismatch' | 'unexpected_file' | 'unsafe_text'

export interface StudioCalendarProjection {
  weeks: SharedContentWeek[]
  withheld: Array<{ path: string; reason: WithheldWeekReason }>
  total: number
}

export const STUDIO_CALENDAR_LIMITS = { maxWeeks: 60, maxFileBytes: 256 * 1024 } as const

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const SHORT_ID = /^[a-z0-9][a-z0-9_.-]{0,119}$/

function str(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function nullable(value: unknown, test: (v: unknown) => boolean): boolean {
  return value === null || test(value)
}

function validSlot(value: unknown): value is SharedSlot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const s = value as Record<string, unknown>
  const research = s.research as Record<string, unknown> | null
  return (
    str(s.id, 4) &&
    /^s\d{2,3}$/.test(s.id) &&
    typeof s.date === 'string' &&
    DAY.test(s.date) &&
    typeof s.channel === 'string' &&
    (CONTENT_CHANNELS as readonly string[]).includes(s.channel) &&
    nullable(s.format, (v) => typeof v === 'string' && (CONTENT_FORMATS as readonly string[]).includes(v)) &&
    nullable(s.pillar, (v) => typeof v === 'string' && SHORT_ID.test(v)) &&
    nullable(s.pillar_name, (v) => str(v, 80)) &&
    str(s.language, 12) &&
    nullable(s.key_message, (v) => typeof v === 'string' && SHORT_ID.test(v)) &&
    nullable(s.offer, (v) => typeof v === 'string' && SHORT_ID.test(v)) &&
    nullable(s.cta, (v) => typeof v === 'string' && SHORT_ID.test(v)) &&
    nullable(s.hook, (v) => str(v, 200)) &&
    nullable(s.angle, (v) => str(v, 280)) &&
    (research === null || (!!research && typeof research === 'object' && typeof research.observation_id === 'string' && /^ob_[0-9a-f-]{36}$/.test(research.observation_id) && (CONFIDENCE as readonly string[]).includes(research.confidence as string))) &&
    (s.status === 'idea' || s.status === 'approved' || s.status === 'skipped')
  )
}

/** Strict shape check: anything unexpected is withheld, not partially shown. */
export function validSharedWeek(value: unknown): value is SharedContentWeek {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const d = value as Record<string, unknown>
  const strategy = d.strategy as Record<string, unknown> | null
  return (
    d.schema_version === 1 &&
    d.kind === 'content_week' &&
    typeof d.week_id === 'string' &&
    WEEK_ID.test(d.week_id) &&
    str(d.brand_slug, 80) &&
    Number.isInteger(d.revision) &&
    typeof d.content_sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(d.content_sha256) &&
    typeof d.approved_at === 'string' &&
    ISO.test(d.approved_at) &&
    typeof d.week_start === 'string' &&
    d.week_id === `wk-${d.week_start}` &&
    typeof d.week_end === 'string' &&
    DAY.test(d.week_end) &&
    !!strategy &&
    typeof strategy === 'object' &&
    str(strategy.strategy_id, 48) &&
    Number.isInteger(strategy.revision) &&
    Array.isArray(d.languages) &&
    d.languages.length <= 10 &&
    d.languages.every((item) => str(item, 12)) &&
    Array.isArray(d.slots) &&
    d.slots.length <= 120 &&
    d.slots.every(validSlot) &&
    (d.slots as SharedSlot[]).every((slot) => slot.date >= (d.week_start as string) && slot.date <= (d.week_end as string)) &&
    Array.isArray(d.gaps) &&
    d.gaps.length <= 60 &&
    d.gaps.every((gap) => !!gap && typeof gap === 'object' && (CALENDAR_GAP_REASONS as readonly string[]).includes((gap as CalendarGap).reason) && nullable((gap as CalendarGap).channel, (v) => typeof v === 'string' && (CONTENT_CHANNELS as readonly string[]).includes(v))) &&
    typeof d.shared_at === 'string' &&
    ISO.test(d.shared_at)
  )
}

/**
 * Reads `brand/content-calendar/shared/*.json` from a checkout (Studio: the extracted merged commit). Symlinks,
 * oversized, malformed, misnamed, other-brand and secret-looking files are withheld with a reason. Only the listed
 * fields are kept, so an extra field in a committed file never reaches the page.
 */
export function buildStudioCalendar(root: string, brandSlug: string): StudioCalendarProjection {
  const dir = path.join(root, ...SHARED_CALENDAR_DIR.split('/'))
  const out: StudioCalendarProjection = { weeks: [], withheld: [], total: 0 }
  let stat: fs.Stats | undefined
  try {
    stat = fs.lstatSync(dir)
  } catch {
    return out
  }
  if (!stat.isDirectory()) return out
  for (const name of fs.readdirSync(dir).sort()) {
    const rel = `${SHARED_CALENDAR_DIR}/${name}`
    const file = path.join(dir, name)
    const entry = fs.lstatSync(file)
    if (entry.isSymbolicLink()) {
      out.withheld.push({ path: rel, reason: 'symlink' })
      continue
    }
    if (!SHARED_WEEK_FILE.test(name) || !entry.isFile()) {
      out.withheld.push({ path: rel, reason: 'unexpected_file' })
      continue
    }
    if (entry.size > STUDIO_CALENDAR_LIMITS.maxFileBytes) {
      out.withheld.push({ path: rel, reason: 'unreadable' })
      continue
    }
    let doc: unknown
    try {
      doc = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      out.withheld.push({ path: rel, reason: 'unreadable' })
      continue
    }
    if (!validSharedWeek(doc)) {
      out.withheld.push({ path: rel, reason: 'invalid_record' })
      continue
    }
    if (doc.brand_slug !== brandSlug) {
      out.withheld.push({ path: rel, reason: 'wrong_brand' })
      continue
    }
    if (`${doc.week_id}.json` !== name) {
      out.withheld.push({ path: rel, reason: 'filename_mismatch' })
      continue
    }
    if (safetyBlocksSharing(safetyReport(sharedText(doc))).length) {
      out.withheld.push({ path: rel, reason: 'unsafe_text' })
      continue
    }
    out.weeks.push({
      schema_version: 1,
      kind: 'content_week',
      week_id: doc.week_id,
      brand_slug: doc.brand_slug,
      revision: doc.revision,
      content_sha256: doc.content_sha256,
      approved_at: doc.approved_at,
      week_start: doc.week_start,
      week_end: doc.week_end,
      strategy: { strategy_id: doc.strategy.strategy_id, revision: doc.strategy.revision },
      languages: [...doc.languages],
      slots: doc.slots.map((s) => ({
        id: s.id,
        date: s.date,
        channel: s.channel,
        format: s.format,
        pillar: s.pillar,
        pillar_name: s.pillar_name,
        language: s.language,
        key_message: s.key_message,
        offer: s.offer,
        cta: s.cta,
        hook: s.hook,
        angle: s.angle,
        research: s.research ? { observation_id: s.research.observation_id, confidence: s.research.confidence } : null,
        status: s.status,
      })),
      gaps: doc.gaps.map((gap) => ({ channel: gap.channel, reason: gap.reason })),
      shared_at: doc.shared_at,
    })
  }
  out.weeks.sort((a, b) => a.week_start.localeCompare(b.week_start))
  out.total = out.weeks.length
  out.weeks = out.weeks.slice(-STUDIO_CALENDAR_LIMITS.maxWeeks)
  return out
}
