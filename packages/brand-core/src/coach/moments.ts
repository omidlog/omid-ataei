import { AGENT_TOKEN_ENV } from '../agent-tokens.js'
import type { Locale } from '../i18n.js'
import type { FieldQuestion } from '../types.js'
import { followUpReview } from './analyze.js'
import { isDisposition, openCoachContext, type CoachContext } from './context.js'
import { chooseFollowUp } from './follow-up.js'
import { clarifyQuestion, coachUi, CRITERION_NAMES } from './i18n.js'
import { expectsMeasure, isFreeText } from './lexicon.js'
import { COACH_RULE_VERSION, CoachError, type CoachCriterion, type CoachSource, type CoachStatus } from './model.js'

/**
 * Coach moments — when the coach speaks **on its own**, and when it stays silent.
 *
 * Decision record: `docs-internal/COACH_UX_DECISION.md`. The owner should never have to know when to call the
 * coach, so the commands the owner already runs call it at three moments:
 *
 * - `after_answer`    — right after the interview records an answer (interactive and agent mode);
 * - `before_approval` — in `brand:approve`, after the queue is read and before the proof prompt;
 * - `studio_overview` — the Studio projection of the merged default branch.
 *
 * One policy filters all three, so "important" means the same thing everywhere. Everything here is a thin layer
 * over the existing deterministic `chooseFollowUp` / `followUpReview`: no new rule, no model call, no write, no
 * score, no owner words. A moment can never block its host command — every failure becomes silence.
 */

export const COACH_MOMENTS = ['after_answer', 'before_approval', 'studio_overview'] as const
export type CoachMoment = (typeof COACH_MOMENTS)[number]

/** Why a moment stayed quiet. Closed vocabulary, so a test (and an agent reading `--json`) can see the reason. */
export const COACH_SILENCE_REASONS = [
  'disabled',
  'agent_token',
  'restricted',
  'unknown_question',
  'factual_type',
  'not_strategic',
  'not_applicable',
  'unanswered',
  'disposition',
  'deferred',
  'already_coached',
  'ready',
  'declined_gap',
  'change_pending',
  'unavailable',
] as const
export type CoachSilenceReason = (typeof COACH_SILENCE_REASONS)[number]

/**
 * Question-id namespaces whose answers carry strategy: purpose, positioning and personality; customer, problem,
 * offer, model, market and plan; goals, growth, sales, marketing, product and finance; and a person's positioning,
 * services, story and goals. Everything else (names, legal, visual systems, mascot, operations, engineering,
 * channels' mechanics …) is factual or executional and never triggers a moment on its own. Namespaces rather than
 * modules, because the bank files `business.customer.primary_segment` under `business-company`.
 * Owner-tunable: this list is the definition of "important" (see the decision record).
 */
export const COACH_STRATEGIC_NAMESPACES: readonly string[] = [
  'brand.strategy',
  'brand.personality',
  'business.customer',
  'business.problem',
  'business.offer',
  'business.model',
  'business.market',
  'business.plan',
  'business.goals',
  'business.growth',
  'business.sales',
  'business.marketing',
  'business.product',
  'business.finance',
  'personal.positioning',
  'personal.services',
  'personal.story',
  'personal.goals',
]

export function isStrategicQuestionId(id: string): boolean {
  return COACH_STRATEGIC_NAMESPACES.some((ns) => id.startsWith(`${ns}.`))
}

/** The owner's off switch for the automatic moments (one shell). `npm run brand:coach` keeps working on demand. */
export const COACH_AUTO_ENV = 'BRAND_OS_COACH'

/** One note: a question id, the missing dimension, and exactly one next step. Never owner words, never a score. */
export interface CoachNote {
  question_id: string
  status: CoachStatus
  criterion: CoachCriterion
  /** An existing interview question that closes the gap. When set, `suggested_question` is null. */
  canonical_question_id: string | null
  /** The one clarifying question, localized, when no existing question closes the gap. */
  suggested_question: string | null
  /** True when the answer is already approved, so acting on it needs the change flow. */
  requires_change_request: boolean
}

export interface CoachMomentResult {
  kind: 'coach_moment'
  moment: CoachMoment
  locale: Locale
  /** True when there is a note to show. */
  shown: boolean
  silence: CoachSilenceReason | null
  note: CoachNote | null
  rule_version: string
  authority: 'derived_advice'
  authorizes: []
}

export interface CoachApprovalNotes {
  kind: 'coach_moment'
  moment: 'before_approval' | 'studio_overview'
  locale: Locale
  /** Up to `limit` notes, in the order the ids were given. */
  notes: CoachNote[]
  /** Notes found beyond the limit. */
  more: number
  /** How many ids were checked, and how many stayed silent (by reason). */
  checked: number
  silent: Partial<Record<CoachSilenceReason, number>>
  rule_version: string
  authority: 'derived_advice'
  authorizes: []
}

/** False when the owner turned the automatic moments off for this shell. */
export function coachAutoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[COACH_AUTO_ENV]?.trim().toLowerCase()
  return !(value === 'off' || value === '0' || value === 'false' || value === 'no')
}

/**
 * Whether a question is worth an unprompted note: not restricted, free text or a measure, and strategic (by id namespace,
 * or because it is a public claim that needs verified evidence). Pure; reads the question only.
 */
export function coachWorthiness(question: FieldQuestion): CoachSilenceReason | null {
  if (question.sensitivity === 'restricted') return 'restricted'
  if (!isFreeText(question) && !expectsMeasure(question)) return 'factual_type'
  const evidenceClaim = (question.publication_requires ?? []).includes('verified_evidence')
  if (!evidenceClaim && !isStrategicQuestionId(question.id)) return 'not_strategic'
  return null
}

/** Revisions of this question that carried a value (dispositions do not count). */
function valueRevisions(source: CoachSource, questionId: string): number {
  return source.ledger().records.filter((record) => record.question_id === questionId && record.value !== null && record.value !== undefined && !isDisposition(record)).length
}

function noteFor(ctx: CoachContext, question: FieldQuestion, locale: Locale): { note: CoachNote | null; silence: CoachSilenceReason | null } {
  const choice = chooseFollowUp(ctx, question, locale)
  if (choice.kind === 'none') {
    const silence: Record<NonNullable<typeof choice.noneReason>, CoachSilenceReason> = {
      question_inapplicable: 'not_applicable',
      answer_open: 'unanswered',
      answer_settled: 'disposition',
      quality_ready: 'ready',
      already_deferred: 'declined_gap',
    }
    return { note: null, silence: silence[choice.noneReason ?? 'quality_ready'] }
  }
  // Run the full, validated follow-up so the note is exactly what `brand:coach analyze --mode follow_up` says.
  const finding = followUpReview(ctx, question.id, { locale, now: ctx.now }).findings[0]
  if (!finding || !finding.criterion || finding.code === 'follow_up_none') return { note: null, silence: 'ready' }
  return {
    silence: null,
    note: {
      question_id: question.id,
      status: finding.status,
      criterion: finding.criterion,
      canonical_question_id: finding.canonical_question_id,
      suggested_question: finding.suggested_question,
      requires_change_request: finding.requires_change_request,
    },
  }
}

function base(moment: CoachMoment, locale: Locale) {
  return { kind: 'coach_moment' as const, moment, locale, rule_version: COACH_RULE_VERSION, authority: 'derived_advice' as const, authorizes: [] as [] }
}

/** Shared gate: the off switch and the agent token are checked before anything is read. */
function gate(env: NodeJS.ProcessEnv): CoachSilenceReason | null {
  if (!coachAutoEnabled(env)) return 'disabled'
  if (env[AGENT_TOKEN_ENV]) return 'agent_token'
  return null
}

/**
 * Moment 1 — right after an answer is recorded. 0 or 1 note, and only on the **first** revision of the question
 * that carried a value: re-answering (including after the coach's own question) never triggers it again, so the
 * coach cannot loop or nag. Never throws.
 */
export function coachAfterAnswer(source: CoachSource, questionId: string, opts: { locale?: Locale; now?: Date; env?: NodeJS.ProcessEnv } = {}): CoachMomentResult {
  const locale = opts.locale ?? 'en'
  const silent = (silence: CoachSilenceReason): CoachMomentResult => ({ ...base('after_answer', locale), shown: false, silence, note: null })
  const closed = gate(opts.env ?? process.env)
  if (closed) return silent(closed)
  try {
    const question = source.question(questionId)
    if (!question) return silent('unknown_question')
    const unworthy = coachWorthiness(question)
    if (unworthy) return silent(unworthy)
    if (source.session().deferred.includes(questionId)) return silent('deferred')
    if (valueRevisions(source, questionId) > 1) return silent('already_coached')
    const ctx = openCoachContext(source, { now: opts.now })
    const { note, silence } = noteFor(ctx, question, locale)
    return note ? { ...base('after_answer', locale), shown: true, silence: null, note } : silent(silence ?? 'ready')
  } catch (error) {
    return silent(error instanceof CoachError && error.code === 'refused' ? 'agent_token' : 'unavailable')
  }
}

/**
 * Moment 2 (and the Studio card) — notes for the drafts about to be approved. `draftIds` are question ids whose
 * queue item is a plain draft; pass change proposals as `changeIds` so they are counted as `change_pending` (the
 * coach reads the ledger revision, not the proposed text, and must not advise on the wrong value). Never throws.
 */
export function coachBeforeApproval(
  source: CoachSource,
  input: { draftIds: string[]; changeIds?: string[] },
  opts: { locale?: Locale; now?: Date; env?: NodeJS.ProcessEnv; limit?: number; moment?: 'before_approval' | 'studio_overview' } = {},
): CoachApprovalNotes {
  const locale = opts.locale ?? 'en'
  const limit = Math.max(0, opts.limit ?? 3)
  const result: CoachApprovalNotes = { ...base(opts.moment ?? 'before_approval', locale), moment: opts.moment ?? 'before_approval', notes: [], more: 0, checked: 0, silent: {} }
  const ids = [...new Set(input.draftIds)]
  const changes = [...new Set(input.changeIds ?? [])].filter((id) => !ids.includes(id))
  const count = (reason: CoachSilenceReason, n = 1) => {
    if (n > 0) result.silent[reason] = (result.silent[reason] ?? 0) + n
  }
  result.checked = ids.length + changes.length
  count('change_pending', changes.length)
  const closed = gate(opts.env ?? process.env)
  if (closed) {
    count(closed, ids.length)
    return result
  }
  let ctx: CoachContext
  try {
    ctx = openCoachContext(source, { now: opts.now })
  } catch (error) {
    count(error instanceof CoachError && error.code === 'refused' ? 'agent_token' : 'unavailable', ids.length)
    return result
  }
  for (const id of ids) {
    try {
      const question = ctx.byId.get(id)
      if (!question) {
        count('unknown_question')
        continue
      }
      const unworthy = coachWorthiness(question)
      if (unworthy) {
        count(unworthy)
        continue
      }
      const { note, silence } = noteFor(ctx, question, locale)
      if (!note) count(silence ?? 'ready')
      else if (result.notes.length < limit) result.notes.push(note)
      else result.more += 1
    } catch {
      count('unavailable')
    }
  }
  return result
}

// ---- text -----------------------------------------------------------------------------------------------------

function nextStep(note: CoachNote, locale: Locale): string {
  if (note.canonical_question_id) return `${coachUi(locale, 'momentAnswerFirst')} ${note.canonical_question_id}`
  // The clarifying question is a closed table keyed by criterion and question family (both derived from the note),
  // so it is re-read in the requested locale rather than reusing `suggested_question`, which is in the locale the
  // note was computed in.
  return clarifyQuestion(locale, note.criterion, note.question_id)
}

/** The interview's short note: three lines at most, in the session locale. Empty when the moment is silent. */
export function renderAfterAnswer(result: CoachMomentResult): string {
  if (!result.shown || !result.note) return ''
  const { locale, note } = result
  const lines = [
    `${coachUi(locale, 'momentTitle')} — ${note.question_id}: ${CRITERION_NAMES[locale][note.criterion]}`,
    `  ${note.canonical_question_id ? coachUi(locale, 'useExisting') : coachUi(locale, 'momentAsk')}: ${note.canonical_question_id ?? clarifyQuestion(locale, note.criterion, note.question_id)}`,
    `  ${note.requires_change_request ? coachUi(locale, 'changeFlow') : coachUi(locale, 'momentAfterHint').replace('{question}', note.question_id)}`,
  ]
  return lines.join('\n')
}

/** The approve-time block. Empty when there are no notes. */
export function renderBeforeApproval(result: CoachApprovalNotes): string {
  if (result.notes.length === 0) return ''
  const { locale } = result
  const lines = [coachUi(locale, 'momentApproveTitle')]
  for (const note of result.notes) lines.push(`- ${note.question_id} (${CRITERION_NAMES[locale][note.criterion]}): ${nextStep(note, locale)}`)
  if (result.more > 0) lines.push(coachUi(locale, 'momentMore').replace('{count}', String(result.more)))
  lines.push(coachUi(locale, 'momentApproveFoot'))
  return lines.join('\n')
}

/** The note as display strings, for a surface (Studio) that renders its own layout. */
export function coachNoteText(note: CoachNote, locale: Locale): { criterion: string; next: string } {
  return { criterion: CRITERION_NAMES[locale][note.criterion], next: nextStep(note, locale) }
}
