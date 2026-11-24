import { readFacts } from '../facts.js'
import type { KnowledgeWorkspace } from '../knowledge/workspace.js'
import {
  CONTENT_CHANNELS,
  CONTENT_FORMATS,
  CONTENT_SOURCE_ROLES,
  parseProposal,
  STRATEGY_LIMITS,
  StrategyError,
  text,
  type ContentChannel,
  type ContentChannelPlan,
  type ContentFormat,
  type ContentGap,
  type ContentPillar,
  type ContentSourceRole,
  type ContentStrategyBlock,
  type StrategyRef,
} from '../strategy/model.js'
import { assertOwnerProcess, scanRecords } from '../strategy/store.js'
import { servable } from '../strategy/feed.js'
import { CHANNEL_PARTS, fill, GAP_TEXT, NOTES, PROPOSAL_TEXT, ROLE_LABELS, type ContentLang } from './i18n.js'
import { brandSettings, detectChannels, readSources, roleGaps, splitItems, type SourceReport } from './sources.js'

/**
 * `brand:content strategy`: a content strategy proposal derived from approved facts (Content Bridge Slice A).
 *
 * - Voice, audience, messaging, claims, offers and CTA are cited by fact id. Their text is not copied; the projection
 *   resolves it at read time, so the facts stay the one truth and the strategy goes needs_review if one changes.
 * - Pillar names come from the approved pillars fact (split mechanically) and cite it. Channels come from the owner
 *   (--channels) or are read from affirmative clauses of approved channel facts.
 * - Anything facts cannot decide (channel role, formats, cadence) or that no approved fact covers is an explicit gap.
 *   Nothing is guessed: cadence stays null until the owner writes it.
 * - Pure: it writes nothing. The CLI stores it through brand:strategy's proposeRevision, so approval is the existing
 *   brand:strategy review / approve.
 */

export interface ContentStrategyOptions {
  lang: ContentLang
  /** Owner-named channels. When given, detection is not used. */
  channels?: ContentChannel[]
  /** Content languages. Default: the brand default locale. */
  languages?: string[]
  markets?: string[]
  /** Owner decisions per channel: `instagram=3/week`. */
  cadence?: Partial<Record<ContentChannel, { per: 'week' | 'month'; target: number }>>
  formats?: Partial<Record<ContentChannel, ContentFormat[]>>
  valid_days?: number
  review_days?: number
}

export interface ContentStrategyDraft {
  /** A raw proposal for brand:strategy propose (it parses with parseProposal). */
  proposal: Record<string, unknown>
  block: ContentStrategyBlock
  sources: SourceReport[]
  gaps: Array<ContentGap & { text: string }>
  detected_channels: ContentChannel[]
  notes: string[]
}

function gapText(gap: ContentGap, lang: ContentLang): string {
  const facts = gap.fact_ids.join(', ') || '—'
  const channel = /^channels\[([a-z]+)\]\.(role|formats|cadence)$/.exec(gap.field)
  if (channel) return fill(GAP_TEXT[`channel_${channel[2]}`]![lang], { channel: channel[1]!, part: CHANNEL_PARTS[channel[2]!]![lang] })
  if (gap.field === 'pillars' && gap.reason === 'owner_decision') return fill(GAP_TEXT.pillars_unnamed![lang], { facts })
  if (gap.field === 'channels' && gap.reason === 'owner_decision') return fill(GAP_TEXT.channels_none![lang], { facts })
  const role = ROLE_LABELS[gap.field]?.[lang] ?? gap.field
  return fill(GAP_TEXT[gap.reason]![lang], { role, facts })
}

export function describeGap(gap: ContentGap, lang: ContentLang): string {
  return gapText(gap, lang)
}

function day(date: Date, plus: number): string {
  return new Date(date.getTime() + plus * 86_400_000).toISOString().slice(0, 10)
}

function pillarsFrom(reports: SourceReport[], values: Record<string, unknown>, notes: string[], lang: ContentLang): ContentPillar[] {
  const pillars: ContentPillar[] = []
  for (const report of reports.filter((r) => r.role === 'pillars' && r.state === 'approved')) {
    const value = values[report.fact_id]
    if (typeof value !== 'string') continue
    let skipped = false
    for (const item of splitItems(value)) {
      if (pillars.length >= STRATEGY_LIMITS.maxPillars) break
      let name: string
      try {
        name = text(item, 'pillar', 80)
      } catch (error) {
        if (!(error instanceof StrategyError)) throw error
        skipped = true
        continue
      }
      if (pillars.some((p) => p.name.toLowerCase() === name.toLowerCase())) continue
      pillars.push({ id: `p${pillars.length + 1}`, name, fact_refs: [report.fact_id] })
    }
    if (skipped) notes.push(fill(NOTES.pillar_skipped![lang], { id: report.fact_id }))
  }
  return pillars
}

function servedStrategies(ws: KnowledgeWorkspace): StrategyRef[] {
  const out: StrategyRef[] = []
  const now = ws.now()
  for (const record of scanRecords(ws)) {
    if (record.type === 'content') continue
    const found = servable(ws, record, now)
    if (found.entry) out.push({ strategy_id: record.strategy_id, revision: found.entry.revision, content_sha256: found.entry.content_sha256 })
  }
  return out
}

/** Builds the proposal. Owner process only (it reads approved facts and strategy records); writes nothing. */
export function buildContentStrategy(ws: KnowledgeWorkspace, opts: ContentStrategyOptions): ContentStrategyDraft {
  assertOwnerProcess()
  const lang = opts.lang
  const settings = brandSettings(ws)
  const facts = readFacts(ws.root, 'approved', ws.brandSlug)
  const reports = readSources(ws, settings, facts)
  const values = Object.fromEntries(reports.filter((r) => r.state === 'approved').map((r) => [r.fact_id, facts[r.fact_id]!.value]))
  const notes: string[] = []
  const gaps: ContentGap[] = roleGaps(reports).map((gap) => ({ field: gap.role, reason: gap.reason, fact_ids: gap.fact_ids }))

  const sources = Object.fromEntries(CONTENT_SOURCE_ROLES.map((role) => [role, reports.filter((r) => r.role === role && r.state === 'approved').map((r) => r.fact_id)])) as Record<ContentSourceRole, string[]>

  // Pillars: named from the approved pillars fact. If it exists but could not be split, the owner names them.
  const pillars = pillarsFrom(reports, values, notes, lang)
  if (!pillars.length && sources.pillars.length) gaps.push({ field: 'pillars', reason: 'owner_decision', fact_ids: sources.pillars })

  // Channels: the owner's list, else affirmative mentions in approved channel facts.
  const channelFacts = reports.filter((r) => r.role === 'channels' && r.state === 'approved')
  const mentions = new Map<ContentChannel, string[]>()
  for (const report of channelFacts) {
    const value = values[report.fact_id]
    if (typeof value !== 'string') continue
    for (const channel of detectChannels(value)) mentions.set(channel, [...(mentions.get(channel) ?? []), report.fact_id])
  }
  const detected = CONTENT_CHANNELS.filter((channel) => mentions.has(channel))
  const chosen = opts.channels?.length ? [...new Set(opts.channels)] : detected
  if (!opts.channels?.length && detected.length) notes.push(fill(NOTES.channels_detected![lang], { list: detected.join(', ') }))
  // Name the channel questions whatever their state, so the message always says what to answer.
  if (!chosen.length) gaps.push({ field: 'channels', reason: 'owner_decision', fact_ids: reports.filter((r) => r.role === 'channels' && r.state !== 'restricted').map((r) => r.fact_id) })
  const channels: ContentChannelPlan[] = chosen.map((channel) => {
    const refs = mentions.get(channel) ?? []
    if (opts.channels?.length && !refs.length) notes.push(fill(NOTES.channel_not_in_facts![lang], { channel }))
    const formats = [...new Set(opts.formats?.[channel] ?? [])]
    const cadence = opts.cadence?.[channel] ?? null
    gaps.push({ field: `channels[${channel}].role`, reason: 'owner_decision', fact_ids: [] })
    if (!formats.length) gaps.push({ field: `channels[${channel}].formats`, reason: 'owner_decision', fact_ids: [] })
    if (!cadence) gaps.push({ field: `channels[${channel}].cadence`, reason: 'owner_decision', fact_ids: [] })
    return { channel, role: null, formats, cadence, languages: [], pillars: [], fact_refs: refs }
  })

  const languages = opts.languages?.length ? [...new Set(opts.languages)] : [settings.default_locale]
  if (!opts.languages?.length) notes.push(fill(NOTES.languages_default![lang], { lang: settings.default_locale }))

  const strategyRefs = servedStrategies(ws)
  if (strategyRefs.length) notes.push(fill(NOTES.strategies_pinned![lang], { list: strategyRefs.map((r) => `${r.strategy_id}@${r.revision}`).join(', ') }))
  notes.push(NOTES.voice_not_copied![lang])

  const block: ContentStrategyBlock = {
    schema: 1,
    languages,
    pillars,
    channels,
    sources,
    voice_rules: { do: [], dont: [] },
    vocabulary: { prefer: [], avoid: [] },
    banned_claims: [],
    cta_rules: [],
    strategy_refs: strategyRefs,
    gaps: gaps.slice(0, STRATEGY_LIMITS.maxGaps),
  }
  const factIds = [...new Set([...Object.values(sources).flat(), ...pillars.flatMap((p) => p.fact_refs), ...channels.flatMap((c) => c.fact_refs)])]
  const now = ws.now()
  const proposal: Record<string, unknown> = {
    title: PROPOSAL_TEXT.title![lang],
    type: 'content',
    locale: lang,
    scope: { markets: opts.markets?.length ? opts.markets : [settings.default_locale], channel: 'content', period: null },
    valid_from: day(now, 0),
    valid_until: day(now, opts.valid_days ?? 180),
    review_due_at: day(now, opts.review_days ?? 90),
    objective: { statement: PROPOSAL_TEXT.objective![lang], status: 'hypothesis' },
    success_metrics: [],
    guardrails: [PROPOSAL_TEXT.guardrail_facts![lang], PROPOSAL_TEXT.guardrail_voice![lang]],
    constraints: [],
    must_do: [],
    must_not_do: [],
    non_goals: [PROPOSAL_TEXT.non_goal_publish![lang], PROPOSAL_TEXT.non_goal_ads![lang]],
    alternatives: [],
    selection_rationale: PROPOSAL_TEXT.rationale![lang],
    recommendations: [],
    fact_refs: factIds,
    evidence_refs: [],
    assumptions: [],
    open_questions: [],
    restricted: null,
    origin: { kind: 'manual' },
    content_strategy: block,
  }
  // A generator bug must never produce something brand:strategy propose would refuse later.
  parseProposal(proposal)
  return { proposal, block, sources: reports, gaps: block.gaps.map((gap) => ({ ...gap, text: gapText(gap, lang) })), detected_channels: detected, notes }
}

/** Parses `instagram=3/week,linkedin=1/month`. */
export function parseCadence(value: string): NonNullable<ContentStrategyOptions['cadence']> {
  const out: NonNullable<ContentStrategyOptions['cadence']> = {}
  for (const part of value.split(',').map((item) => item.trim()).filter(Boolean)) {
    const match = /^([a-z]+)=(\d{1,2})\/(week|month)$/.exec(part)
    if (!match || !(CONTENT_CHANNELS as readonly string[]).includes(match[1]!)) throw new StrategyError('invalid_input', `--cadence takes channel=n/week or channel=n/month, for example instagram=3/week (got ${part}).`)
    const target = Number(match[2])
    if (target < 1 || target > STRATEGY_LIMITS.maxCadence) throw new StrategyError('invalid_input', `--cadence target must be 1 to ${STRATEGY_LIMITS.maxCadence}.`)
    out[match[1] as ContentChannel] = { per: match[3] as 'week' | 'month', target }
  }
  return out
}

/** Parses `instagram=reel+carousel,linkedin=post`. */
export function parseFormats(value: string): NonNullable<ContentStrategyOptions['formats']> {
  const out: NonNullable<ContentStrategyOptions['formats']> = {}
  for (const part of value.split(',').map((item) => item.trim()).filter(Boolean)) {
    const [channel, list] = part.split('=')
    const formats = (list ?? '').split('+').filter(Boolean)
    if (!channel || !(CONTENT_CHANNELS as readonly string[]).includes(channel) || !formats.length || !formats.every((f) => (CONTENT_FORMATS as readonly string[]).includes(f))) {
      throw new StrategyError('invalid_input', `--formats takes channel=format+format, formats ${CONTENT_FORMATS.join(', ')} (got ${part}).`)
    }
    out[channel as ContentChannel] = formats as ContentFormat[]
  }
  return out
}

export function parseChannels(value: string): ContentChannel[] {
  const list = value.split(',').map((item) => item.trim()).filter(Boolean)
  for (const item of list) if (!(CONTENT_CHANNELS as readonly string[]).includes(item)) throw new StrategyError('invalid_input', `Unknown channel ${item}. Channels: ${CONTENT_CHANNELS.join(', ')}.`)
  return list as ContentChannel[]
}
