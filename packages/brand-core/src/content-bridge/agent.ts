import { appendAccessLog } from '../access-log.js'
import type { AuthContext } from '../auth.js'
import { preferenceView } from '../creative/context.js'
import { SURFACES } from '../creative/model.js'
import { scanPreferences } from '../creative/store.js'
import { readFacts, type CanonicalFact } from '../facts.js'
import { openWorkspace, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import { cleanPin, strategyAccess, type StaleInfo, type StrategyPin } from '../strategy/feed.js'
import { canonicalJson, CONTENT_CHANNELS, sha256Hex, StrategyError, type ContentChannel, type ContentChannelPlan, type StrategyRef } from '../strategy/model.js'
import { AGENT_NOTICE, AGENT_TEXT, REPORT_NOTICE } from './agent-i18n.js'
import { isoDate, parseDate, slotFactIds, validateWeekId, type ContentSlot, type SlotResearch, type WeekEntry } from './calendar-model.js'
import { approvedWeekEntry, buildCalendar, evaluateWeek, loadWeekRecord, type CalendarWeekView } from './calendar-store.js'
import { CONTENT_LANGS, fill, type ContentLang } from './i18n.js'
import { appendObservation, latestBySlot, OBSERVATION_LIMITS, OBSERVATION_STATUSES, readObservations, urlProblem, type ContentObservation, type ObservationStatus } from './observations.js'
import type { ContentStrategyView, ResolvedSource, SourcedRule } from './projection.js'

/**
 * Content agent tools (Content Bridge Slice C): what a local content or publishing agent may read of the approved
 * calendar, and the one thing it may write (a produced/published observation).
 *
 * - The gate is the Strategy Feed gate: `strategyAccess` with the `content-read` profile (agent kind `content`). The
 *   profile is fixed by the token; no argument chooses a brand, role, profile or revision state. Everyone else is denied.
 * - `content_calendar` serves only approved weeks whose status is `current` now (the Slice B `evaluateWeek` rule).
 *   Drafts, needs-review, superseded and tampered weeks are counted under `withheld`, never shown.
 * - `content_brief` is a read-only projection of one slot of a served week plus the served content strategy: voice,
 *   claims, audience, the resolved key message / offer / CTA, the channel plan, the cited competitive angle and the
 *   approved creative preferences by id. A pin that is not the served week revision gets `stale_pin` and no content.
 * - `content_report` appends an observation for a slot of the served, pinned week revision. It never edits the week,
 *   the strategy or a fact, and it grants no publication permission.
 * - Restricted facts (for example `business.marketing.budget`) are never resolved; a cited one is listed under
 *   `redacted`. Records of another brand are never read (the stores check `brand_slug`).
 * - Every call, allowed or not, appends one access-log line with ids only (never URLs or text).
 */

export const CONTENT_FEED_SCHEMA = 'brand-os/content-feed/v1' as const
export const CONTENT_BRIEF_SCHEMA = 'brand-os/content-brief/v1' as const
export const CONTENT_REPORT_SCHEMA = 'brand-os/content-report/v1' as const
export const CONTENT_TOOLS = ['content_calendar', 'content_brief', 'content_report'] as const
export type ContentTool = (typeof CONTENT_TOOLS)[number]

const MAX_RANGE_DAYS = 120
const SLOT_ID = /^s\d{2,3}$/
const RTL = new Set(['fa', 'ar', 'he', 'ur', 'ps', 'ckb'])

export interface SlotReport {
  slot_id: string
  status: ObservationStatus
  url: string | null
  reported_at: string
  observation_id: string
}

export interface AgentCalendarWeek extends CalendarWeekView {
  /** Latest produced/published observation per slot of this revision. Observations, not approvals. */
  reports: SlotReport[]
}

export interface AgentCalendarDocument {
  schema: typeof CONTENT_FEED_SCHEMA
  kind: 'content_calendar'
  brand_id: string
  agent_kind: 'content'
  lang: ContentLang
  range: { from: string | null; to: string | null }
  channel: ContentChannel | null
  weeks: AgentCalendarWeek[]
  withheld: Record<string, number>
  digests: {
    /** The Slice B calendar view digest (approved content only, without reports). */
    view_sha256: string
    /** sha256 of the canonical JSON of this document without this field. */
    feed_sha256: string
  }
  authorizes: []
  publication_permission: false
  schedule_permission: false
  spend_permission: false
  notice: string[]
}

export interface BriefFact {
  fact_id: string
  revision: string
  value: string
}

export interface ContentBriefDocument {
  schema: typeof CONTENT_BRIEF_SCHEMA
  kind: 'content_brief'
  brand_id: string
  agent_kind: 'content'
  lang: ContentLang
  week_id: string
  slot_id: string
  week_revision: number
  status: 'current'
  digests: {
    /** Pin these two when you produce and when you report. */
    content_sha256: string
    approval_digest: string
    /** The served content strategy revision the week was planned from. */
    strategy_content_sha256: string
    brief_sha256: string
  }
  strategy: StrategyRef
  slot: {
    date: string
    channel: ContentChannel
    format: ContentSlot['format']
    language: string
    direction: 'rtl' | 'ltr'
    pillar: { id: string; name: string } | null
    hook: string | null
    angle: string | null
    notes: string | null
    status: 'approved' | 'idea' | 'skipped'
  }
  channel_plan: Pick<ContentChannelPlan, 'role' | 'formats' | 'cadence'> | null
  objective: BriefFact[]
  key_message: BriefFact | null
  offer: BriefFact | null
  cta: BriefFact | null
  cta_rules: SourcedRule[]
  audience: ResolvedSource[]
  voice: { sources: ResolvedSource[]; do: SourcedRule[]; dont: SourcedRule[]; vocabulary: ContentStrategyView['voice']['vocabulary'] }
  claims: { banned: SourcedRule[]; availability: string | null; availability_rule: string | null }
  must_include: Array<{ field: 'key_message' | 'offer' | 'cta'; fact_id: string }>
  must_avoid: Array<{ kind: 'banned_claim' | 'voice_dont' | 'vocabulary_avoid' | 'availability'; text: string; source: string }>
  /** A competitive observation cited by id and note revision, with its confidence. Its text stays in the research note. */
  competitive_angle: SlotResearch | null
  creative: {
    /** The creative surface for this format, or null when creative memory has none (for example email or article). */
    surface: string | null
    /** Owner-approved series preferences for this surface, by id. Read them with creative_context (creative-read). */
    preferences: Array<{ preference_id: string; series: string }>
  }
  /** The latest produced/published observation for this slot of this revision. */
  report: SlotReport | null
  sources: { facts: Array<{ id: string; revision: string }>; research: string[] }
  redacted: Array<{ field: string; reason: 'restricted' }>
  missing: string[]
  authorizes: []
  publication_permission: false
  schedule_permission: false
  spend_permission: false
  notice: string[]
}

export interface ContentReportDocument {
  schema: typeof CONTENT_REPORT_SCHEMA
  kind: 'content_report'
  brand_id: string
  observation: ContentObservation
  duplicate: boolean
  message: string
  authorizes: []
  publication_permission: false
  notice: string[]
}

export interface ContentToolResult {
  tool: ContentTool
  status: 'ok' | 'denied' | 'not_found' | 'invalid' | 'stale_pin'
  brand_id: string
  agent_kind: 'content' | null
  reason?: string
  data: AgentCalendarDocument | ContentBriefDocument | ContentReportDocument | null
  stale?: StaleInfo
  authorizes: []
}

export interface ContentToolArgs {
  from?: unknown
  to?: unknown
  channel?: unknown
  week_id?: unknown
  slot_id?: unknown
  pin?: unknown
  status?: unknown
  url?: unknown
  lang?: unknown
}

/** The Strategy Feed gate, narrowed to the content agent kind. */
export function contentAccess(ctx: AuthContext, brandSlug: string): { allow: true } | { allow: false; reason: string } {
  const access = strategyAccess(ctx, brandSlug)
  if (!access.allow) return access.reason === 'cross-brand' ? access : { allow: false, reason: 'content tools need an owner-issued token with the content-read profile' }
  if (access.kind !== 'content') return { allow: false, reason: 'content tools need an owner-issued token with the content-read profile' }
  return { allow: true }
}

/** Recomputes the self digest of a received calendar or brief document. */
export function verifyContentDocument(doc: AgentCalendarDocument | ContentBriefDocument): boolean {
  if (doc.kind === 'content_calendar') {
    const { feed_sha256, ...digests } = doc.digests
    return sha256Hex(canonicalJson({ ...doc, digests })) === feed_sha256
  }
  const { brief_sha256, ...digests } = doc.digests
  return sha256Hex(canonicalJson({ ...doc, digests })) === brief_sha256
}

function valueText(fact: CanonicalFact): string {
  return typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value)
}

function toReport(item: ContentObservation): SlotReport {
  return { slot_id: item.slot_id, status: item.status, url: item.url, reported_at: item.reported_at, observation_id: item.observation_id }
}

// ---- arguments -------------------------------------------------------------------------------------------

type Clean<T> = T | undefined | null

function cleanDate(value: unknown): Clean<string> {
  if (value === undefined || value === null || value === '') return undefined
  try {
    return isoDate(parseDate(value, 'date'))
  } catch {
    return null
  }
}

function cleanLang(value: unknown): ContentLang | null {
  if (value === undefined || value === null || value === '') return 'en'
  return typeof value === 'string' && (CONTENT_LANGS as readonly string[]).includes(value) ? (value as ContentLang) : null
}

function cleanWeek(value: unknown): Clean<string> {
  if (value === undefined || value === null) return undefined
  try {
    return validateWeekId(value)
  } catch {
    return null
  }
}

// ---- served week lookup ----------------------------------------------------------------------------------

interface Served {
  entry: WeekEntry
  revision: NonNullable<ReturnType<typeof evaluateWeek>['revision']>
  view: ContentStrategyView
}

type Lookup = { served: Served; stale: null } | { served: null; stale: StaleInfo | null; state: string }

/** The served revision of a week, checked against an optional pin the same way strategy_get checks one. */
function lookupWeek(ws: KnowledgeWorkspace, weekId: string, pin: StrategyPin | undefined, now: Date, lang: ContentLang): Lookup | null {
  let record
  try {
    record = loadWeekRecord(ws, weekId)
  } catch (error) {
    if (error instanceof StrategyError) return null
    throw error
  }
  let entry: WeekEntry | null
  let broken = false
  try {
    entry = approvedWeekEntry(record)
  } catch {
    entry = null
    broken = true
  }
  const result = entry ? evaluateWeek(ws, record, entry, now, lang) : null
  const servedOk = entry && result && result.status === 'current' && result.revision && result.view && entry.approval
  // Effective status names only (as in strategy_get): a week with no approved revision reads as draft.
  const state: StaleInfo['pinned_state'] = broken ? 'integrity_failed' : !entry ? 'draft' : result!.status === 'current' ? 'current' : result!.status === 'needs_review' ? 'needs_review' : 'integrity_failed'
  if (pin) {
    const matches = servedOk && (pin.revision === undefined || pin.revision === entry!.revision) && (pin.content_sha256 === undefined || pin.content_sha256 === entry!.content_sha256)
    if (!matches) {
      const pinned = record.revisions.find((item) => (pin.revision === undefined || item.revision === pin.revision) && (pin.content_sha256 === undefined || item.content_sha256 === pin.content_sha256))
      // A pin to a draft or rejected revision reveals nothing about it.
      const visible = pinned && ['approved', 'superseded'].includes(pinned.state)
      const pinnedState: StaleInfo['pinned_state'] = !visible ? 'unknown' : pinned.state === 'approved' ? state : 'superseded'
      return {
        served: null,
        state,
        stale: {
          pinned: { revision: pin.revision ?? null, content_sha256: pin.content_sha256 ?? null },
          current: servedOk ? { revision: entry!.revision, content_sha256: entry!.content_sha256 } : null,
          pinned_state: pinnedState,
        },
      }
    }
  }
  if (!servedOk) return { served: null, stale: null, state }
  return { served: { entry: entry!, revision: result!.revision!, view: result!.view! }, stale: null }
}

// ---- the brief -------------------------------------------------------------------------------------------

function creativeFor(ws: KnowledgeWorkspace, format: ContentSlot['format']): ContentBriefDocument['creative'] {
  const surface = format && (SURFACES as readonly string[]).includes(format) ? format : null
  if (!surface) return { surface: null, preferences: [] }
  const preferences: ContentBriefDocument['creative']['preferences'] = []
  for (const pref of scanPreferences(ws)) {
    if (pref.scope.level !== 'series' || pref.scope.surface !== surface) continue
    if (preferenceView(ws, pref).state !== 'approved') continue
    preferences.push({ preference_id: pref.preference_id, series: pref.scope.series })
  }
  return { surface, preferences }
}

/** Builds one slot's brief. Pure apart from reading creative preferences; restricted facts are never resolved. */
export function buildBrief(ws: KnowledgeWorkspace, served: Served, slot: ContentSlot, facts: Record<string, CanonicalFact>, report: SlotReport | null, lang: ContentLang): ContentBriefDocument {
  const { entry, revision, view } = served
  const c = revision.content
  const pinned = new Map(c.fact_refs.map((ref) => [ref.id, ref.revision]))
  const redacted: ContentBriefDocument['redacted'] = []
  const one = (id: string | null): BriefFact | null => {
    if (!id) return null
    const fact = facts[id]
    if (!fact || fact.status !== 'approved' || fact.brand_id !== ws.brandSlug) return null
    if (fact.classification === 'restricted') {
      if (!redacted.some((item) => item.field === id)) redacted.push({ field: id, reason: 'restricted' })
      return null
    }
    return { fact_id: id, revision: pinned.get(id) ?? fact.revision_hash ?? '', value: valueText(fact) }
  }
  const objective = slot.objective.map(one).filter((item): item is BriefFact => item !== null)
  const keyMessage = one(slot.key_message)
  const offer = one(slot.offer)
  const cta = one(slot.cta)
  for (const id of slot.fact_refs) one(id)
  const pillar = slot.pillar ? view.pillars.find((p) => p.id === slot.pillar) : undefined
  const plan = view.channels.find((ch) => ch.channel === slot.channel)
  const mustAvoid: ContentBriefDocument['must_avoid'] = [
    ...view.claims.banned.map((rule) => ({ kind: 'banned_claim' as const, text: rule.text, source: rule.source })),
    ...(view.claims.availability_rule ? [{ kind: 'availability' as const, text: view.claims.availability_rule, source: 'business.marketing.availability_claim' }] : []),
    ...view.voice.dont.map((rule) => ({ kind: 'voice_dont' as const, text: rule.text, source: rule.source })),
    ...view.voice.vocabulary.avoid.map((word) => ({ kind: 'vocabulary_avoid' as const, text: word, source: 'strategy' })),
  ]
  const missing: string[] = []
  if (slot.format === null) missing.push('slot.format')
  if (slot.pillar === null) missing.push('slot.pillar')
  if (!keyMessage && !offer) missing.push('slot.key_message')
  if (!cta && !view.cta.rules.length) missing.push('slot.cta')
  if (slot.hook === null) missing.push('slot.hook')
  if (!view.audience.length) missing.push('audience')
  if (!view.voice.sources.length && !view.voice.do.length && !view.voice.dont.length) missing.push('voice')
  if (plan && plan.role === null) missing.push('channel_plan.role')
  const ids = slotFactIds(slot)
  const doc: Omit<ContentBriefDocument, 'digests'> & { digests: Omit<ContentBriefDocument['digests'], 'brief_sha256'> } = {
    schema: CONTENT_BRIEF_SCHEMA,
    kind: 'content_brief',
    brand_id: ws.brandSlug,
    agent_kind: 'content',
    lang,
    week_id: c.week_id,
    slot_id: slot.id,
    week_revision: revision.revision,
    status: 'current',
    digests: { content_sha256: revision.content_sha256, approval_digest: entry.approval!.digest, strategy_content_sha256: c.strategy.content_sha256 },
    strategy: c.strategy,
    slot: {
      date: slot.date,
      channel: slot.channel,
      format: slot.format,
      language: slot.language,
      direction: RTL.has(slot.language.split('-')[0]!) ? 'rtl' : 'ltr',
      pillar: pillar ? { id: pillar.id, name: pillar.name } : null,
      hook: slot.hook,
      angle: slot.angle,
      notes: slot.notes,
      status: slot.status === 'planned' ? 'approved' : slot.status,
    },
    channel_plan: plan ? { role: plan.role, formats: plan.formats, cadence: plan.cadence } : null,
    objective,
    key_message: keyMessage,
    offer,
    cta,
    cta_rules: view.cta.rules,
    audience: view.audience,
    voice: { sources: view.voice.sources, do: view.voice.do, dont: view.voice.dont, vocabulary: view.voice.vocabulary },
    claims: { banned: view.claims.banned, availability: view.claims.availability, availability_rule: view.claims.availability_rule },
    must_include: [keyMessage && { field: 'key_message' as const, fact_id: keyMessage.fact_id }, offer && { field: 'offer' as const, fact_id: offer.fact_id }, cta && { field: 'cta' as const, fact_id: cta.fact_id }].filter(
      (item): item is { field: 'key_message' | 'offer' | 'cta'; fact_id: string } => Boolean(item),
    ),
    must_avoid: mustAvoid,
    competitive_angle: slot.research,
    creative: creativeFor(ws, slot.format),
    report,
    sources: { facts: c.fact_refs.filter((ref) => ids.includes(ref.id) && !redacted.some((item) => item.field === ref.id)), research: slot.research ? [slot.research.ref] : [] },
    redacted,
    missing,
    authorizes: [],
    publication_permission: false,
    schedule_permission: false,
    spend_permission: false,
    notice: AGENT_NOTICE[lang],
  }
  return { ...doc, digests: { ...doc.digests, brief_sha256: sha256Hex(canonicalJson(doc)) } }
}

// ---- the tool runner -------------------------------------------------------------------------------------

/**
 * Runs one content tool for an already-resolved caller (MCP server or brand:query). `root` is the brand workspace.
 * Arguments outside ContentToolArgs are ignored; nothing in them can widen access.
 */
export function runContentTool(root: string, brandSlug: string, ctx: AuthContext, tool: ContentTool, args: ContentToolArgs = {}, now?: Date): ContentToolResult {
  const lang = cleanLang(args.lang)
  const t = (key: string, vars: Record<string, string | number> = {}) => fill(AGENT_TEXT[key]![lang ?? 'en'], vars)
  const weekId = cleanWeek(args.week_id)
  const slotId = args.slot_id === undefined || args.slot_id === null ? undefined : typeof args.slot_id === 'string' && SLOT_ID.test(args.slot_id) ? args.slot_id : null
  const requested = weekId ? [slotId ? `${weekId}:${slotId}` : weekId] : []
  const access = contentAccess(ctx, brandSlug)
  const base = { tool, brand_id: brandSlug, agent_kind: access.allow ? ('content' as const) : null, authorizes: [] as [] }
  const log = (decision: 'allow' | 'deny', reason: string, returned: string[] = [], withheld: string[] = []) =>
    appendAccessLog(root, ctx, { tool, kind: 'content', requested_ids: requested, returned_ids: returned, withheld_ids: withheld, query_sha256: null, decision, reason }, now)
  if (!access.allow) {
    log('deny', access.reason)
    return { ...base, status: 'denied', reason: t('denied'), data: null }
  }
  const invalid = (field: string): ContentToolResult => {
    log('deny', 'invalid')
    return { ...base, status: 'invalid', reason: t('invalid', { field }), data: null }
  }
  if (!(CONTENT_TOOLS as readonly string[]).includes(tool)) return invalid('tool')
  if (lang === null) return invalid('lang')
  const ws = openWorkspace(root, now ? { now: () => now } : {})
  const at = ws.now()

  if (tool === 'content_calendar') {
    const from = cleanDate(args.from)
    const to = cleanDate(args.to)
    const channel = args.channel === undefined || args.channel === null || args.channel === '' ? undefined : typeof args.channel === 'string' && (CONTENT_CHANNELS as readonly string[]).includes(args.channel) ? (args.channel as ContentChannel) : null
    if (from === null) return invalid('from')
    if (to === null) return invalid('to')
    if (channel === null) return invalid('channel')
    if (from && to && (to < from || (Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_RANGE_DAYS)) return invalid(`from/to (to on or after from, at most ${MAX_RANGE_DAYS} days)`)
    const view = buildCalendar(ws, { lang, from, to, channel, now: at })
    const weeks: AgentCalendarWeek[] = view.weeks.map((week) => {
      const latest = latestBySlot(readObservations(ws, week.week_id), week.revision, week.digests.content_sha256)
      return { ...week, reports: week.slots.flatMap((slot) => (latest.has(slot.id) ? [toReport(latest.get(slot.id)!)] : [])) }
    })
    const doc: Omit<AgentCalendarDocument, 'digests'> & { digests: Omit<AgentCalendarDocument['digests'], 'feed_sha256'> } = {
      schema: CONTENT_FEED_SCHEMA,
      kind: 'content_calendar',
      brand_id: brandSlug,
      agent_kind: 'content',
      lang,
      range: view.range,
      channel: view.channel,
      weeks,
      withheld: view.withheld,
      digests: { view_sha256: view.digests.view_sha256 },
      authorizes: [],
      publication_permission: false,
      schedule_permission: false,
      spend_permission: false,
      notice: AGENT_NOTICE[lang],
    }
    const out: AgentCalendarDocument = { ...doc, digests: { ...doc.digests, feed_sha256: sha256Hex(canonicalJson(doc)) } }
    log('allow', 'allowed', weeks.map((week) => `${week.week_id}:${week.revision}`))
    return { ...base, status: 'ok', data: out }
  }

  // content_brief and content_report address one slot of one week.
  const pin = cleanPin(args.pin)
  if (!weekId) return invalid('week_id')
  if (!slotId) return invalid('slot_id')
  if (pin === null) return invalid('pin')
  let status: ObservationStatus | null = null
  let url: string | null = null
  if (tool === 'content_report') {
    if (!pin || pin.revision === undefined || pin.content_sha256 === undefined) {
      log('deny', 'invalid')
      return { ...base, status: 'invalid', reason: t('pin_required'), data: null }
    }
    status = typeof args.status === 'string' && (OBSERVATION_STATUSES as readonly string[]).includes(args.status) ? (args.status as ObservationStatus) : null
    if (!status) return invalid('status (produced or published)')
    if (args.url !== undefined && args.url !== null && args.url !== '') {
      if (typeof args.url !== 'string') return invalid('url')
      const problem = urlProblem(args.url)
      if (problem) {
        log('deny', `invalid:${problem}`)
        return { ...base, status: 'invalid', reason: t(problem, { max: OBSERVATION_LIMITS.maxUrlChars }), data: null }
      }
      url = args.url
    }
    if (status === 'published' && !url) {
      log('deny', 'invalid:url_required')
      return { ...base, status: 'invalid', reason: t('url_required'), data: null }
    }
  }

  const found = lookupWeek(ws, weekId, pin, at, lang)
  if (!found) {
    // A missing week, another brand's copy and a corrupt record look the same to an agent.
    log('deny', 'not_found')
    return { ...base, status: 'not_found', reason: t('not_found'), data: null }
  }
  if (!found.served) {
    if (found.stale) {
      log('deny', `stale_pin:${found.stale.pinned_state}`, [], [`${weekId}:${pin?.revision ?? 'sha'}`])
      return { ...base, status: 'stale_pin', reason: t('stale_pin'), stale: found.stale, data: null }
    }
    log('deny', `not_servable:${found.state}`, [], [weekId])
    return { ...base, status: 'not_found', reason: t('not_found'), data: null }
  }
  const served = found.served
  const slot = served.revision.content.slots.find((item) => item.id === slotId)
  if (!slot) {
    log('deny', 'not_found')
    return { ...base, status: 'not_found', reason: t('not_found'), data: null }
  }
  const observations = readObservations(ws, weekId)
  const latest = latestBySlot(observations, served.revision.revision, served.revision.content_sha256).get(slotId)

  if (tool === 'content_brief') {
    const facts = readFacts(root, 'approved', ws.brandSlug)
    const doc = buildBrief(ws, served, slot, facts, latest ? toReport(latest) : null, lang)
    log('allow', 'allowed', [`${weekId}:${doc.week_revision}:${slotId}`], doc.redacted.map((item) => item.field))
    return { ...base, status: 'ok', data: doc }
  }

  if (slot.status === 'skipped') {
    log('deny', 'invalid:skipped')
    return { ...base, status: 'invalid', reason: t('slot_skipped', { slot: slotId }), data: null }
  }
  const { observation, duplicate } = appendObservation(ws, {
    week_id: weekId,
    slot_id: slotId,
    week_revision: served.revision.revision,
    week_content_sha256: served.revision.content_sha256,
    status: status!,
    url,
    reporter: ctx.principal_id,
    profile: ctx.profile ?? null,
  })
  log('allow', duplicate ? 'duplicate' : 'recorded', [observation.observation_id])
  const message = duplicate ? t('duplicate', { id: observation.observation_id }) : t('recorded', { status: status!, week: weekId, slot: slotId, id: observation.observation_id })
  const data: ContentReportDocument = { schema: CONTENT_REPORT_SCHEMA, kind: 'content_report', brand_id: brandSlug, observation, duplicate, message, authorizes: [], publication_permission: false, notice: REPORT_NOTICE[lang] }
  return { ...base, status: 'ok', data }
}
