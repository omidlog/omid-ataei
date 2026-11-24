import fs from 'node:fs'
import path from 'node:path'
import { stdin as input, stdout as output } from 'node:process'
import readline from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { AGENT_TOKEN_ENV, KnowledgeError, openWorkspace, type KnowledgeWorkspace } from '@brand-os/brand-core'
import {
  AGENT_TEXT,
  approvedWeekEntry,
  approveWeek,
  brandSettings,
  buildContentStrategy,
  CAL_TEXT,
  CalendarError,
  CLI_TEXT,
  contentCalendar,
  contentLang,
  contentStrategyView,
  fill,
  listObservations,
  listWeeks,
  loadWeekRecord,
  parseCadence,
  parseChannels,
  parseFormats,
  planCalendar,
  problemText,
  proposeWeek,
  rejectWeek,
  reviewWeek,
  ROLE_LABELS,
  scanWeeks,
  shareWeek,
  validateWeekId,
  type CalendarView,
  type ContentObservation,
  type ContentLang,
  type ContentStrategyDraft,
  type ContentStrategyView,
  type PlanResult,
  type WeekReview,
  type WeekSummary,
} from '@brand-os/brand-core/content-bridge'
import { CONTENT_CHANNELS, proposeRevision, StrategyError, validateRevisionNumber, validateStrategyId, type ContentChannel } from '@brand-os/brand-core/strategy'

/**
 * brand:content — Content Bridge (Slice A): the brand's content strategy, derived from approved facts.
 *
 * `strategy` builds a proposal: voice, audience, messaging and claims are cited by fact id (never rewritten), and
 * whatever facts cannot decide is an explicit gap. It is stored, if asked, as a draft `content` strategy revision in
 * the existing strategy store; review and approval are the existing brand:strategy review / approve (owner proof,
 * hash-bound). `show` is the owner's voice rules projection of the approved revision. Nothing here posts, schedules
 * or publishes, and no agent reads content strategies yet.
 *
 * Slice B: `plan` drafts calendar weeks from the served content strategy (deterministic, offline), `week propose` stores
 * one (edited) week as a draft, `week review / approve / reject` is the owner's per-week approval (owner proof, the
 * reviewed hash), `calendar` shows approved weeks only, and `share` copies an approved week for Studio (you commit it).
 *
 * Slice C: agents read through the content_calendar / content_brief MCP tools (content-read token), never through this
 * command. `reports` shows the produced/published observations agents sent with content_report.
 */

const HELP = `brand:content <command> [options]

  strategy [--id content-main] [--channels instagram,linkedin] [--cadence instagram=3/week]
           [--formats instagram=reel+carousel] [--languages en,fa] [--markets tr]
           [--out <proposal.json>] [--store]
                                  propose a content strategy from approved facts, with explicit gaps.
                                  Without --out or --store nothing is written.
  show [--id <id>]                the approved content strategy with its voice rules, resolved from
                                  approved facts (drafts are never shown)

  plan --from YYYY-MM-DD --weeks N [--channels instagram,newsletter] [--strategy <id>] [--research]
       [--out <weeks.json>] [--store]
                                  draft calendar weeks (Monday to Sunday) from the served content strategy.
                                  Without --out or --store nothing is written.
  week propose --file <week.json> store one week (an item of the --out weeks list) as a draft
  week review  --week wk-YYYY-MM-DD --revision <n>
  week approve --week wk-YYYY-MM-DD --revision <n> --expect-sha <sha256>
                                  owner proof: BRAND_OS_APPROVAL_PROOF or hidden prompt
  week reject  --week wk-YYYY-MM-DD --revision <n>
  weeks                           every week and revision with its status
  calendar [--from D] [--to D] [--channel instagram]
                                  approved, current weeks only (drafts are never shown)
  share --week wk-YYYY-MM-DD [--dry-run]
                                  copy an approved week's summary to brand/content-calendar/shared (you commit it)
  reports [--week wk-YYYY-MM-DD]  produced/published reports from content agents (observations only)

Review and approve with: npm run brand:strategy -- review / approve (owner proof).
Options: --lang en|fa|tr (default: the brand default locale), --json. Refused while ${AGENT_TOKEN_ENV} is set.`

const OPTIONS = {
  json: { type: 'boolean', default: false },
  lang: { type: 'string' },
  id: { type: 'string' },
  channels: { type: 'string' },
  cadence: { type: 'string' },
  formats: { type: 'string' },
  languages: { type: 'string' },
  markets: { type: 'string' },
  out: { type: 'string' },
  store: { type: 'boolean', default: false },
  from: { type: 'string' },
  to: { type: 'string' },
  weeks: { type: 'string' },
  strategy: { type: 'string' },
  research: { type: 'boolean', default: false },
  file: { type: 'string' },
  week: { type: 'string' },
  revision: { type: 'string' },
  'expect-sha': { type: 'string' },
  channel: { type: 'string' },
  'dry-run': { type: 'boolean', default: false },
} as const

type Values = ReturnType<typeof parseArgs<{ args: string[]; options: typeof OPTIONS; allowPositionals: false; strict: true }>>['values']

const argv = process.argv.slice(2)
const command = argv[0]
const sub = command === 'week' ? argv[1] : undefined
const rest = argv.slice(command === 'week' ? 2 : 1)

function usage(message: string): never {
  console.error(`${message}\n\n${HELP}`)
  process.exit(2)
}

function codes(value: string | undefined, flag: string): string[] | undefined {
  if (!value) return undefined
  const list = value.split(',').map((item) => item.trim()).filter(Boolean)
  for (const item of list) if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(item)) throw new StrategyError('invalid_input', `${flag} takes language or market codes such as en,fa,tr (got ${item}).`)
  return list
}

function draftText(draft: ContentStrategyDraft, lang: ContentLang): string {
  const t = (key: string) => CLI_TEXT[key]![lang]
  const block = draft.block
  const lines = [t('draft_header'), '', `${t('sources')}:`]
  for (const source of draft.sources) lines.push(`  [${source.state}] ${source.fact_id} (${ROLE_LABELS[source.role]![lang]})`)
  lines.push('', `${t('pillars')}: ${block.pillars.map((p) => `${p.id} ${p.name}`).join(' · ') || '—'}`)
  lines.push(`${t('channels')}:`)
  for (const c of block.channels) lines.push(`  ${c.channel}: ${c.formats.join('+') || t('not_decided')}, ${c.cadence ? `${c.cadence.target}/${c.cadence.per}` : t('not_decided')}`)
  if (!block.channels.length) lines.push('  —')
  lines.push('', `${t('gaps')}:`)
  if (!draft.gaps.length) lines.push(`  ${t('no_gaps')}`)
  for (const gap of draft.gaps) lines.push(`  - [${gap.reason}] ${gap.field}: ${gap.text}`)
  lines.push('', `${t('notes')}:`, ...draft.notes.map((note) => `  ${note}`))
  return lines.join('\n')
}

function viewText(view: ContentStrategyView, lang: ContentLang): string {
  const t = (key: string) => CLI_TEXT[key]![lang]
  const lines = [
    `${view.strategy_id} r${view.revision} (${view.status}) ${view.digests.content_sha256.slice(0, 12)}`,
    `  ${view.languages.join(', ')} · ${view.validity.valid_from.slice(0, 10)} → ${view.validity.valid_until.slice(0, 10)}`,
    '',
    `${t('voice')}:`,
    ...view.voice.sources.map((src) => `  ${src.fact_id}: ${src.value}`),
    ...view.voice.do.map((rule) => `  ${t('do')}: ${rule.text}`),
    ...view.voice.dont.map((rule) => `  ${t('dont')}: ${rule.text}`),
    '',
    `${t('banned')}:`,
    ...view.claims.banned.map((rule) => `  - ${rule.text}`),
    ...(view.claims.availability_rule ? [`  - ${view.claims.availability_rule}`] : []),
    '',
    `${t('pillars')}: ${view.pillars.map((p) => p.name).join(' · ') || '—'}`,
    `${t('channels')}:`,
    ...view.channels.map((c) => `  ${c.channel}: ${c.role ?? t('not_decided')}; ${c.formats.join('+') || t('not_decided')}; ${c.cadence ? `${c.cadence.target}/${c.cadence.per}` : t('not_decided')}; ${c.languages.join(',') || t('all')}`),
    '',
    `${t('gaps')}:`,
    ...(view.gaps.length ? view.gaps.map((gap) => `  - ${gap.field}: ${gap.text}`) : [`  ${t('no_gaps')}`]),
    '',
    ...view.notice.map((line) => `note: ${line}`),
  ]
  return lines.join('\n')
}

async function ownerProof(): Promise<string | undefined> {
  const fromEnv = process.env.BRAND_OS_APPROVAL_PROOF?.trim()
  if (fromEnv) return fromEnv
  if (!input.isTTY) return undefined
  const { Writable } = await import('node:stream')
  let muted = false
  const sink = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) output.write(chunk, encoding)
      callback()
    },
  })
  const rl = readline.createInterface({ input, output: sink, terminal: true })
  try {
    const pending = rl.question('Owner approval proof (input hidden): ')
    muted = true
    const answer = await pending
    output.write('\n')
    return answer.trim() || undefined
  } finally {
    rl.close()
  }
}

function need(values: Values, key: 'from' | 'weeks' | 'file' | 'week' | 'revision' | 'expect-sha'): string {
  const value = values[key]
  if (!value) usage(`--${key} is required.`)
  return value
}

function channelOf(value: string): ContentChannel {
  if (!(CONTENT_CHANNELS as readonly string[]).includes(value)) throw new StrategyError('invalid_input', `--channel is one of ${CONTENT_CHANNELS.join(', ')}.`)
  return value as ContentChannel
}

function slotLine(slot: { id: string; date: string; channel: string; format: string | null; pillar: string | null; language: string; key_message: string | null; offer: string | null; cta: string | null; hook: string | null; research: { observation_id: string; confidence: string } | null }, t: (key: string) => string, pillarName?: string | null): string {
  const parts = [`${slot.id} ${slot.date} ${slot.channel}/${slot.format ?? t('not_decided')}`, `${pillarName ?? slot.pillar ?? '—'}`, slot.language]
  const cites = [slot.key_message, slot.offer, slot.cta].filter(Boolean).join(', ')
  if (cites) parts.push(cites)
  if (slot.hook) parts.push(`“${slot.hook}”`)
  if (slot.research) parts.push(`${slot.research.observation_id.slice(0, 11)} (${slot.research.confidence})`)
  return `  ${parts.join(' · ')}`
}

function planText(plan: PlanResult, lang: ContentLang): string {
  const t = (key: string) => (CAL_TEXT[key] ?? CLI_TEXT[key])![lang]
  const lines = [fill(t('plan_header'), { id: plan.strategy.strategy_id, rev: plan.strategy.revision }), ...plan.notes.map((note) => `${t('notes')}: ${note}`)]
  for (const week of plan.weeks) {
    const c = week.content
    lines.push('', `${t('week')} ${c.week_id} (${c.week_start} → ${c.week_end}): ${c.slots.length || t('no_slots')}`)
    for (const slot of c.slots) lines.push(slotLine(slot, t))
    for (const gap of week.gaps) lines.push(`  - ${gap}`)
  }
  return lines.join('\n')
}

function reviewText(review: WeekReview, lang: ContentLang): string {
  const t = (key: string) => (CAL_TEXT[key] ?? CLI_TEXT[key])![lang]
  return [
    `${review.week_id} r${review.revision} (${review.state}) ${review.content_sha256}`,
    `  supersedes: ${review.supersedes_revision ?? '—'} · approved now: ${review.current_approved ?? '—'} · slots: ${review.slots}`,
    '',
    `${t('gaps')}:`,
    ...(review.gaps.length ? review.gaps.map((gap) => `  - ${gap.text}`) : [`  ${t('no_gaps')}`]),
    '',
    `${t('blockers')}:`,
    ...(review.blockers.length ? review.blockers.map((line) => `  - ${line}`) : [`  ${t('no_blockers')}`]),
    '',
    ...review.notice.map((line) => `note: ${line}`),
    '',
    review.blockers.length ? '' : review.approve_with,
  ].join('\n').trimEnd()
}

function weeksText(list: WeekSummary[]): string {
  if (!list.length) return '—'
  return list
    .map((week) => [`${week.week_id} (approved: ${week.current ?? '—'})`, ...week.revisions.map((r) => `  r${r.revision} ${r.state} → ${r.status} · ${r.slots} slots · ${r.content_sha256.slice(0, 12)}${r.reasons.length ? `\n    ${r.reasons.join('\n    ')}` : ''}`)].join('\n'))
    .join('\n')
}

function calendarText(view: CalendarView, lang: ContentLang): string {
  const t = (key: string) => (CAL_TEXT[key] ?? CLI_TEXT[key])![lang]
  const lines: string[] = []
  if (!view.weeks.length) lines.push(t('none_calendar'))
  for (const week of view.weeks) {
    lines.push(`${week.week_id} r${week.revision} (${week.status}) ${week.digests.content_sha256.slice(0, 12)} · ${week.strategy.strategy_id}@${week.strategy.revision}`)
    for (const slot of week.slots) lines.push(slotLine(slot, t, slot.pillar_name))
    for (const fact of week.facts) lines.push(`    ${fact.fact_id}: ${fact.value}`)
    for (const gap of week.gaps) lines.push(`  - ${gap.text}`)
    lines.push('')
  }
  const withheld = Object.entries(view.withheld).map(([status, n]) => `${status}: ${n}`).join(', ')
  if (withheld) lines.push(`${t('withheld')}: ${withheld}`)
  lines.push(...view.notice.map((line) => `note: ${line}`))
  return lines.join('\n')
}

function reportsText(items: Array<ContentObservation & { current: boolean }>, lang: ContentLang): string {
  const t = (key: string) => AGENT_TEXT[key]![lang]
  if (!items.length) return t('reports_none')
  const lines = [t('reports_header'), '']
  for (const item of items) {
    const old = item.current ? '' : ` ${fill(t('reports_old_revision'), { rev: item.week_revision })}`
    lines.push(`${item.week_id} ${item.slot_id} r${item.week_revision} ${item.status} ${item.url ?? '—'} · ${item.reported_at} · ${item.reporter}${old}`)
  }
  return lines.join('\n')
}

/** Observations with a flag: reported against the week revision served as approved now, or an older one. */
function reportsOf(ws: KnowledgeWorkspace, week: string | undefined): Array<ContentObservation & { current: boolean }> {
  const ids = week ? [validateWeekId(week)] : scanWeeks(ws).map((record) => record.week_id)
  return listObservations(ws, ids).map((item) => {
    let current = false
    try {
      const entry = approvedWeekEntry(loadWeekRecord(ws, item.week_id))
      current = entry !== null && entry.revision === item.week_revision && entry.content_sha256 === item.week_content_sha256
    } catch {
      current = false
    }
    return { ...item, current }
  })
}

async function run(ws: KnowledgeWorkspace, values: Values): Promise<void> {
  const lang = contentLang(values.lang, contentLang(brandSettings(ws).default_locale.slice(0, 2)))
  if (values.lang && values.lang !== lang) usage('--lang is en, fa or tr.')
  const print = (data: unknown, text: () => string) => console.log(values.json ? JSON.stringify(data, null, 2) : text())
  switch (command) {
    case 'strategy': {
      const id = validateStrategyId(values.id ?? 'content-main')
      const draft = buildContentStrategy(ws, {
        lang,
        channels: values.channels ? parseChannels(values.channels) : undefined,
        cadence: values.cadence ? parseCadence(values.cadence) : undefined,
        formats: values.formats ? parseFormats(values.formats) : undefined,
        languages: codes(values.languages, '--languages'),
        markets: codes(values.markets, '--markets'),
      })
      const after: string[] = []
      let stored: { revision: number; content_sha256: string; path: string } | null = null
      if (values.out) {
        const out = path.resolve(values.out)
        if (fs.existsSync(out)) throw new StrategyError('exists', 'The --out file exists. Choose a new path; nothing was overwritten.')
        fs.writeFileSync(out, `${JSON.stringify(draft.proposal, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
        after.push(fill(CLI_TEXT.written![lang], { list: values.out, id }))
      }
      if (values.store) {
        const result = proposeRevision(ws, { strategy_id: id, proposal: draft.proposal })
        stored = { revision: result.revision.revision, content_sha256: result.revision.content_sha256, path: result.path }
        after.push(fill(CLI_TEXT.stored![lang], { id, n: result.revision.revision }))
      }
      if (!values.out && !values.store) after.push(CLI_TEXT.store_hint![lang])
      print({ ok: true, strategy_id: id, stored, gaps: draft.gaps, sources: draft.sources, notes: draft.notes, proposal: draft.proposal }, () => [draftText(draft, lang), '', ...after].join('\n'))
      return
    }
    case 'show': {
      const result = contentStrategyView(ws, { lang, strategy_id: values.id ? validateStrategyId(values.id) : undefined })
      print({ ok: true, ...result }, () => {
        const withheld = Object.entries(result.withheld).map(([status, n]) => `${status}: ${n}`).join(', ')
        const body = result.views.length ? result.views.map((view) => viewText(view, lang)).join('\n\n') : CLI_TEXT.none_approved![lang]
        return withheld ? `${body}\n${CLI_TEXT.withheld![lang]}: ${withheld}` : body
      })
      return
    }
    case 'plan': {
      const weeks = Number(need(values, 'weeks'))
      const plan = planCalendar(ws, {
        lang,
        from: need(values, 'from'),
        weeks,
        strategy_id: values.strategy ? validateStrategyId(values.strategy) : undefined,
        channels: values.channels ? parseChannels(values.channels) : undefined,
        research: values.research,
      })
      const after: string[] = []
      const stored: Array<{ week_id: string; revision: number; content_sha256: string }> = []
      if (values.out) {
        const out = path.resolve(values.out)
        if (fs.existsSync(out)) throw new StrategyError('exists', 'The --out file exists. Choose a new path; nothing was overwritten.')
        fs.writeFileSync(out, `${JSON.stringify({ weeks: plan.weeks.map((w) => w.content) }, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
        after.push(fill(CAL_TEXT.written_plan![lang], { list: values.out }))
      }
      if (values.store) {
        for (const week of plan.weeks) {
          const result = proposeWeek(ws, { week: week.content, lang })
          stored.push({ week_id: week.content.week_id, revision: result.revision.revision, content_sha256: result.revision.content_sha256 })
          after.push(fill(CAL_TEXT.stored_week![lang], { id: week.content.week_id, n: result.revision.revision }))
        }
      }
      if (!values.out && !values.store) after.push(CAL_TEXT.plan_store_hint![lang])
      print({ ok: true, stored, ...plan }, () => [planText(plan, lang), '', ...after].join('\n'))
      return
    }
    case 'week': {
      switch (sub) {
        case 'propose': {
          const file = path.resolve(need(values, 'file'))
          let week: unknown
          try {
            week = JSON.parse(fs.readFileSync(file, 'utf8'))
          } catch {
            throw new StrategyError('invalid_input', 'The --file is not readable JSON.')
          }
          const result = proposeWeek(ws, { week, lang })
          const id = result.revision.week_id
          print({ ok: true, week_id: id, revision: result.revision.revision, content_sha256: result.revision.content_sha256, path: result.path }, () => fill(CAL_TEXT.stored_week![lang], { id, n: result.revision.revision }))
          return
        }
        case 'review': {
          const review = reviewWeek(ws, { week_id: need(values, 'week'), revision: validateRevisionNumber(Number(need(values, 'revision'))), lang })
          print({ ok: true, review }, () => reviewText(review, lang))
          return
        }
        case 'approve': {
          const proof = await ownerProof()
          const result = approveWeek(ws, { week_id: need(values, 'week'), revision: validateRevisionNumber(Number(need(values, 'revision'))), expected_sha256: need(values, 'expect-sha'), proof, lang })
          print({ ok: true, week_id: result.record.week_id, approved: result.approved.revision, superseded: result.superseded?.revision ?? null }, () => fill(CAL_TEXT.approved_week![lang], { id: result.record.week_id, n: result.approved.revision }))
          return
        }
        case 'reject': {
          const week = need(values, 'week')
          const entry = rejectWeek(ws, { week_id: week, revision: validateRevisionNumber(Number(need(values, 'revision'))) })
          print({ ok: true, week_id: week, rejected: entry.revision }, () => fill(CAL_TEXT.rejected_week![lang], { id: week, n: entry.revision }))
          return
        }
        default:
          usage(sub ? `Unknown week command ${sub}.` : 'week needs propose, review, approve or reject.')
      }
      return
    }
    case 'weeks': {
      const list = listWeeks(ws, lang)
      print({ ok: true, weeks: list }, () => weeksText(list))
      return
    }
    case 'calendar': {
      const view = contentCalendar(ws, { lang, from: values.from, to: values.to, channel: values.channel ? channelOf(values.channel) : undefined })
      print({ ok: true, ...view }, () => calendarText(view, lang))
      return
    }
    case 'share': {
      const result = shareWeek(ws, { week_id: need(values, 'week'), dryRun: values['dry-run'] })
      print({ ok: true, ...result }, () => (result.written ? fill(CAL_TEXT.shared_week![lang], { list: result.path }) : `${CAL_TEXT.shared_preview![lang]}\n${JSON.stringify(result.week, null, 2)}`))
      return
    }
    case 'reports': {
      const items = reportsOf(ws, values.week)
      print({ ok: true, reports: items }, () => reportsText(items, lang))
      return
    }
    default:
      usage(command ? `Unknown command ${command}.` : 'No command given.')
  }
}

if (!command || command === 'help' || command === '--help') {
  console.log(HELP)
  process.exit(command ? 0 : 2)
}

let values: Values
try {
  values = parseArgs({ args: rest, options: OPTIONS, allowPositionals: false, strict: true }).values
} catch (error) {
  usage((error as Error).message)
}

try {
  await run(openWorkspace(process.cwd()), values)
} catch (error) {
  if (error instanceof CalendarError) {
    const lang = contentLang(values.lang)
    const lines = error.problems.map((problem) => problemText(problem, lang))
    if (values.json) console.log(JSON.stringify({ ok: false, error: { code: error.code, problems: error.problems, message: lines.join(' ') } }, null, 2))
    else console.error(`${error.code}:\n${lines.map((line) => `  - ${line}`).join('\n')}`)
    process.exit(1)
  }
  if (error instanceof StrategyError || error instanceof KnowledgeError) {
    if (values.json) console.log(JSON.stringify({ ok: false, error: { code: error.code, message: error.message } }, null, 2))
    else console.error(`${error.code}: ${error.message}`)
    process.exit(1)
  }
  console.error(`Unexpected error (${(error as Error)?.name ?? 'Error'}). Nothing was approved or published.`)
  process.exit(1)
}
