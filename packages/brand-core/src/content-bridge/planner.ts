import { buildCompetitiveMemo } from '../competitive/memos.js'
import type { ContextObservation } from '../competitive/context.js'
import { readFacts } from '../facts.js'
import type { KnowledgeWorkspace } from '../knowledge/workspace.js'
import { selectAdapter } from '../research/adapters.js'
import { StrategyError, type ContentChannel } from '../strategy/model.js'
import {
  addDays,
  CALENDAR_LIMITS,
  isoDate,
  mondayOf,
  parseDate,
  weekIdOf,
  type CalendarGap,
  type Confidence,
  type ContentSlot,
  type ContentWeekContent,
  type SlotResearch,
} from './calendar-model.js'
import { CAL_TEXT } from './calendar-i18n.js'
import { CLI_TEXT, fill, type ContentLang } from './i18n.js'
import { contentStrategyView, type ContentStrategyView } from './projection.js'

/**
 * `brand:content plan`: draft calendar weeks from the served content strategy (Content Bridge Slice B).
 *
 * - The only input is the content strategy view (`contentStrategyView`): the approved revision the owner projection
 *   serves now. Its revision and content hash are pinned in every week.
 * - Deterministic and offline: the same strategy, dates and options give the same weeks. Rotation (formats, pillars,
 *   languages, key messages) is indexed by the date, so week N+1 continues week N.
 * - Cadence: `n/week` gives n slots spread over the week; `n/month` gives n slots spread over each month, and a week
 *   gets the ones that fall in it. A `null` cadence gives no slots and a `cadence_not_decided` gap.
 * - Slots cite fact ids (pillar, channel, objective, key message or offer, CTA) and never copy fact text. Hook and
 *   angle stay null: the planner writes no copy, so it cannot write a banned claim.
 * - Optional research angles cite competitive observations (`buildCompetitiveMemo(ws, 'marketing')`) by id and note
 *   revision, with a confidence label. No research is fetched: the adapter is the offline one.
 * - Pure: it writes nothing.
 */

export interface PlanOptions {
  lang: ContentLang
  from: string
  weeks: number
  strategy_id?: string
  channels?: ContentChannel[]
  research?: boolean
  now?: Date
}

export interface PlannedWeek {
  content: ContentWeekContent
  /** Readable gap lines in the requested language. */
  gaps: string[]
}

export interface PlanResult {
  strategy: { strategy_id: string; revision: number; content_sha256: string; status: string }
  weeks: PlannedWeek[]
  notes: string[]
}

const MONDAY_EPOCH = Date.UTC(1970, 0, 5)

function weekIndex(monday: Date): number {
  return Math.round((monday.getTime() - MONDAY_EPOCH) / (7 * 86_400_000))
}

function pick<T>(list: readonly T[], index: number): T | null {
  return list.length ? list[((index % list.length) + list.length) % list.length]! : null
}

/** The served content strategy the planner uses: the one named, or the only one served. */
export function servedStrategy(ws: KnowledgeWorkspace, lang: ContentLang, strategyId?: string, now?: Date): ContentStrategyView {
  const { views } = contentStrategyView(ws, { lang, strategy_id: strategyId, now })
  if (!views.length) throw new StrategyError('refused', CLI_TEXT.none_approved![lang])
  if (views.length > 1) throw new StrategyError('invalid_input', fill(CAL_TEXT.plan_several![lang], { list: views.map((v) => v.strategy_id).join(', ') }))
  return views[0]!
}

function confidenceOf(obs: ContextObservation): Confidence {
  if (obs.cell === 'observed') return obs.verified ? 'high' : 'medium'
  return 'low'
}

/** Usable marketing observations, sorted by id, read offline from the competitive landscape. */
export function researchAngles(ws: KnowledgeWorkspace, lang: ContentLang, now: Date): SlotResearch[] {
  const memo = buildCompetitiveMemo(ws, 'marketing', { capability: selectAdapter({ env: {} }).capability(now), lang, now })
  return memo.observations
    .filter((obs) => obs.usable && !obs.conflict)
    .sort((a, b) => a.observation_id.localeCompare(b.observation_id))
    .map((obs) => ({ observation_id: obs.observation_id, ref: obs.ref, competitor_id: obs.competitor_id, dimension: obs.dimension, confidence: confidenceOf(obs), basis: obs.cell }))
}

/** Dates (with a rotation index) a channel cadence puts in one week. */
function slotDates(monday: Date, cadence: { per: 'week' | 'month'; target: number }): Array<{ date: string; seq: number }> {
  const out: Array<{ date: string; seq: number }> = []
  if (cadence.per === 'week') {
    const base = weekIndex(monday) * cadence.target
    for (let i = 0; i < cadence.target; i++) out.push({ date: isoDate(addDays(monday, Math.floor((i * 7) / cadence.target))), seq: base + i })
    return out
  }
  for (let d = 0; d < 7; d++) {
    const day = addDays(monday, d)
    const year = day.getUTCFullYear()
    const month = day.getUTCMonth()
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    for (let k = 0; k < cadence.target; k++) {
      if (Math.floor((k * days) / cadence.target) + 1 === day.getUTCDate()) out.push({ date: isoDate(day), seq: (year * 12 + month) * cadence.target + k })
    }
  }
  return out
}

export function gapText(gap: CalendarGap, lang: ContentLang): string {
  return fill(CAL_TEXT[`cal_gap_${gap.reason}`]![lang], { channel: gap.channel ?? '—' })
}

/** Plans one week from a strategy view. Pure given its inputs. */
export function planWeek(view: ContentStrategyView, monday: Date, opts: { channels?: ContentChannel[]; research?: SlotResearch[] | null; revisions: Record<string, string> }): ContentWeekContent {
  const gaps: CalendarGap[] = []
  const slots: Array<Omit<ContentSlot, 'id'> & { order: number }> = []
  const keyPool = [...view.messaging.map((s) => ({ id: s.fact_id, offer: false })), ...view.offers.map((s) => ({ id: s.fact_id, offer: true }))]
  const ctas = view.cta.sources.map((s) => s.fact_id)
  const objective = view.objective.map((s) => s.fact_id)
  const channels = opts.channels ?? view.channels.map((c) => c.channel)
  for (const name of channels) {
    if (!view.channels.some((c) => c.channel === name)) gaps.push({ channel: name, reason: 'channel_not_in_strategy' })
  }
  view.channels.forEach((channel, order) => {
    if (!channels.includes(channel.channel)) return
    if (!channel.cadence) {
      gaps.push({ channel: channel.channel, reason: 'cadence_not_decided' })
      return
    }
    if (!channel.formats.length) gaps.push({ channel: channel.channel, reason: 'formats_not_decided' })
    const pillarIds = channel.pillars.length ? channel.pillars : view.pillars.map((p) => p.id)
    if (!pillarIds.length) gaps.push({ channel: channel.channel, reason: 'no_pillars' })
    const langs = channel.languages.length ? channel.languages : view.languages
    let skipped = false
    for (const { date, seq } of slotDates(monday, channel.cadence)) {
      const pillar = pick(pillarIds, seq)
      const key = pick(keyPool, seq)
      const cta = pick(ctas, seq)
      const pillarFacts = view.pillars.find((p) => p.id === pillar)?.fact_refs ?? []
      const factRefs = [...new Set([...pillarFacts, ...channel.fact_refs])]
      const cited = [...factRefs, ...objective, ...(key ? [key.id] : []), ...(cta ? [cta] : [])]
      if (!cited.length) {
        skipped = true
        continue
      }
      slots.push({
        order,
        date,
        channel: channel.channel,
        format: pick(channel.formats, seq),
        pillar,
        language: pick(langs, seq)!,
        objective,
        key_message: key && !key.offer ? key.id : null,
        offer: key && key.offer ? key.id : null,
        cta,
        hook: null,
        angle: null,
        notes: null,
        research: opts.research?.length ? pick(opts.research, seq) : null,
        status: 'planned',
        fact_refs: factRefs,
      })
    }
    if (skipped) gaps.push({ channel: channel.channel, reason: 'no_source' })
  })
  if (slots.length && !keyPool.length) gaps.push({ channel: null, reason: 'no_key_message' })
  if (opts.research && !opts.research.length) gaps.push({ channel: null, reason: 'no_research' })
  slots.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date.localeCompare(b.date)))
  if (slots.length > CALENDAR_LIMITS.maxSlots) throw new StrategyError('invalid_input', `A week would have ${slots.length} slots; at most ${CALENDAR_LIMITS.maxSlots}. Lower the cadence.`)
  const finished: ContentSlot[] = slots.map(({ order: _order, ...slot }, i) => {
    void _order
    return { id: `s${String(i + 1).padStart(2, '0')}`, ...slot }
  })
  const ids = [...new Set(finished.flatMap((slot) => [...slot.fact_refs, ...slot.objective, ...[slot.key_message, slot.offer, slot.cta].filter((id): id is string => id !== null)]))].sort()
  const factRefs = ids.map((id) => {
    const revision = opts.revisions[id]
    if (!revision) throw new StrategyError('stale_source', `Fact ${id} is no longer approved. The content strategy needs review before planning.`)
    return { id, revision }
  })
  return {
    schema: 1,
    week_id: weekIdOf(monday),
    week_start: isoDate(monday),
    week_end: isoDate(addDays(monday, 6)),
    strategy: { strategy_id: view.strategy_id, revision: view.revision, content_sha256: view.digests.content_sha256 },
    languages: view.languages,
    slots: finished,
    gaps,
    fact_refs: factRefs,
    research_refs: [...new Set(finished.map((slot) => slot.research?.ref).filter((ref): ref is string => !!ref))].sort(),
  }
}

/** Draft weeks from `from` (aligned to its Monday) for `weeks` weeks. Writes nothing. */
export function planCalendar(ws: KnowledgeWorkspace, opts: PlanOptions): PlanResult {
  const now = opts.now ?? ws.now()
  if (!Number.isInteger(opts.weeks) || opts.weeks < 1 || opts.weeks > CALENDAR_LIMITS.maxWeeks) throw new StrategyError('invalid_input', `--weeks must be 1 to ${CALENDAR_LIMITS.maxWeeks}.`)
  const from = parseDate(opts.from, '--from')
  const monday = mondayOf(from)
  const view = servedStrategy(ws, opts.lang, opts.strategy_id, now)
  const facts = readFacts(ws.root, 'approved', ws.brandSlug)
  const revisions: Record<string, string> = {}
  for (const [id, fact] of Object.entries(facts)) if (fact.status === 'approved' && fact.revision_hash && fact.classification !== 'restricted') revisions[id] = fact.revision_hash
  const research = opts.research ? researchAngles(ws, opts.lang, now) : null
  const notes: string[] = []
  if (isoDate(monday) !== opts.from) notes.push(fill(CAL_TEXT.plan_aligned![opts.lang], { from: opts.from, monday: isoDate(monday) }))
  if (research?.length) notes.push(fill(CAL_TEXT.plan_research![opts.lang], { n: research.length }))
  const weeks: PlannedWeek[] = []
  for (let w = 0; w < opts.weeks; w++) {
    const content = planWeek(view, addDays(monday, 7 * w), { channels: opts.channels, research, revisions })
    weeks.push({ content, gaps: content.gaps.map((gap) => gapText(gap, opts.lang)) })
  }
  return { strategy: { strategy_id: view.strategy_id, revision: view.revision, content_sha256: view.digests.content_sha256, status: view.status }, weeks, notes }
}
