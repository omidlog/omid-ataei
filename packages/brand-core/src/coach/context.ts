import crypto from 'node:crypto'
import { AGENT_TOKEN_ENV } from '../agent-tokens.js'
import { isOpenAnswer, latestAnswers } from '../completeness.js'
import { findContradictions } from '../contradictions.js'
import { disabledModule, personalConfig, shouldSkip } from '../conditions.js'
import { claimVerification, readEvidence, type ClaimVerification, type EvidenceItem } from '../evidence.js'
import { UNIVERSAL_PROFILE } from '../profiles.js'
import { asciiDigits } from '../structured.js'
import type { AnswerRecord, BrandConfig, Contradiction, FieldQuestion, PersonalFacet } from '../types.js'
import { COACH_LIMITS, CoachError, type CoachSource } from './model.js'

/**
 * Reading the interview for the coach. Nothing in this file writes: the contradictions come from the
 * pure `findContradictions` (not the derived file, which the engine rewrites on its own schedule), and
 * the evidence register is read through `readEvidence`.
 *
 * `openCoachContext` is the single gate. It refuses an agent token and refuses restricted questions,
 * so neither a hosted agent nor a restricted value can reach a rule.
 */

export interface CoachContext {
  brandId: string
  root: string
  config: BrandConfig
  profileId: string
  questions: FieldQuestion[]
  byId: Map<string, FieldQuestion>
  answers: Map<string, AnswerRecord>
  contradictions: Contradiction[]
  evidence: EvidenceItem[]
  /** Question ids in the active interview profile, or null when the whole bank is in scope. */
  scope: Set<string> | null
  /**
   * Question ids the engine considers askable now: open, in profile, module enabled, `skip_when` false
   * and dependencies satisfied. The coach never recomputes eligibility; it reads the engine's answer.
   */
  eligibleIds: Set<string>
  /** Question ids the owner deferred with "decide later". A deferral is a decline, never reopened here. */
  deferred: Set<string>
  /** The last question the owner answered in this session, when there is one. */
  lastAnsweredId: string | null
  personalFacets: PersonalFacet[]
  now: Date
}

/**
 * MVP access rule: the coach is owner-local. Under `BRAND_OS_AGENT_TOKEN` every mode is denied, and no
 * MCP tool or `brand_retrieve` kind exposes it, until a separate narrow access review.
 */
export function assertOwnerProcess(): void {
  if (process.env[AGENT_TOKEN_ENV]) {
    throw new CoachError('refused', `The strategic coach is the owner's local, advisory analysis. Refusing while ${AGENT_TOKEN_ENV} is set; no agent profile covers it.`)
  }
}

export function openCoachContext(source: CoachSource, opts: { now?: Date } = {}): CoachContext {
  assertOwnerProcess()
  const config = source.config()
  const questions = source.questions()
  const ledger = source.ledger()
  const session = source.session()
  const profile = source.profile()
  const answers = latestAnswers(ledger.records)
  const last = session.last_answer_id ? ledger.records.find((record) => record.answer_id === session.last_answer_id) : undefined
  return {
    brandId: config.brand.slug,
    root: source.workspaceRoot(),
    config,
    profileId: profile ? profile.id : (config.brand.profile ?? UNIVERSAL_PROFILE),
    questions,
    byId: new Map(questions.map((question) => [question.id, question])),
    answers,
    // The same function the engine uses, called purely. The coach never adds to or re-implements these rules.
    contradictions: findContradictions(questions, answers, config.modules.mascot.enabled, config.modules.gamification.enabled),
    evidence: readEvidence(source.workspaceRoot()),
    scope: profile ? new Set(profile.question_ids) : null,
    eligibleIds: new Set(source.eligible().map((question) => question.id)),
    deferred: new Set(session.deferred),
    lastAnsweredId: last ? last.question_id : null,
    personalFacets: personalConfig(config).facets,
    now: opts.now ?? new Date(),
  }
}

/** The question, or a refusal. Restricted questions are refused outright, never analysed and redacted. */
export function coachQuestion(ctx: CoachContext, questionId: string): FieldQuestion {
  const question = ctx.byId.get(questionId)
  if (!question) throw new CoachError('not_found', `Unknown question ${questionId}. The coach only uses canonical question ids from the interview bank.`)
  if (question.sensitivity === 'restricted') {
    throw new CoachError('refused', `${questionId} is a restricted question. The coach does not analyse restricted answers, and no value or digest of one is produced.`)
  }
  return question
}

/**
 * The eligibility guard. Null when the question applies under the current config and answers; otherwise
 * why it does not. A question that does not apply is `not_applicable`, never "missing": the coach must not
 * push the owner to answer a question their own configuration turned off.
 */
export function notApplicableReason(ctx: CoachContext, question: FieldQuestion): 'module_disabled' | 'skip_condition' | null {
  const conditionCtx = { config: ctx.config, answers: ctx.answers }
  if (disabledModule(question.id, conditionCtx)) return 'module_disabled'
  if (shouldSkip(question.skip_when, conditionCtx)) return 'skip_condition'
  return null
}

/** True when the answer is an explicit owner disposition: `unknown`, `skip` or `not relevant`. */
export function isDisposition(answer: AnswerRecord | undefined): boolean {
  return answer?.status === 'unknown' || answer?.status === 'skipped' || answer?.status === 'not_applicable'
}

/** The live answer for a question, or undefined when the question is still open (see `isOpenAnswer`). */
export function liveAnswer(ctx: CoachContext, questionId: string): AnswerRecord | undefined {
  const answer = ctx.answers.get(questionId)
  return isOpenAnswer(answer) ? undefined : answer
}

/**
 * The answer text the rules read: trimmed, Persian/Arabic digits folded to ASCII so a number is a number
 * in every locale, and truncated so work stays bounded. Never returned to a caller or put in a finding.
 */
export function answerText(answer: AnswerRecord | undefined): string {
  if (!answer || answer.value === null || answer.value === undefined) return ''
  return asciiDigits(String(answer.value)).trim().slice(0, COACH_LIMITS.maxAnswerChars)
}

export function verificationOf(ctx: CoachContext, question: FieldQuestion): ClaimVerification {
  return claimVerification(question, ctx.evidence, ctx.now)
}

/** Open contradictions that name this question id among their fields. */
export function conflictsFor(ctx: CoachContext, questionId: string): Contradiction[] {
  return ctx.contradictions.filter((item) => item.status === 'open' && item.fields.includes(questionId))
}

/**
 * Declared prerequisites of this question that are still unanswered in the active scope.
 *
 * Only `depends_on` counts. `related_ids` is a cross-reference between fields, not a dependency; treating
 * it as one would report a deficit on almost every answer in a young brand, which is noise rather than
 * advice. An answered question with an open prerequisite is a real state, because an agent-driven
 * interview may answer questions in any order.
 */
export function openLinked(ctx: CoachContext, question: FieldQuestion): string[] {
  const inScope = (id: string) => !ctx.scope || ctx.scope.has(id)
  return [...new Set(question.depends_on)].filter((id) => inScope(id) && ctx.byId.has(id) && isOpenAnswer(ctx.answers.get(id))).sort()
}

function sha(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 16)
}

/**
 * A short digest of one answer revision. `answer_id` already identifies the revision; the hash binds the
 * status and value so that a cache keyed on it expires when the record changes. Restricted answers never
 * reach this function (they are refused earlier), so no restricted value is ever hashed.
 */
export function answerDigest(answer: AnswerRecord): string {
  return sha([answer.answer_id, answer.status, answer.last_updated ?? '', String(answer.value ?? '')].join('\u0000'))
}

/**
 * A digest over every input the rules read for this analysis: the rule version, the brand, the profile and
 * each question id with its answer revision and status. Equal digests mean equal results; a changed answer
 * or a bumped rule version changes it, so stale advice is recognisable without storing anything.
 */
export function contextDigest(ctx: CoachContext, ruleVersion: string, questionIds: string[]): string {
  const parts = [ruleVersion, ctx.brandId, ctx.profileId]
  for (const id of [...questionIds].sort()) {
    const answer = ctx.answers.get(id)
    parts.push(`${id}=${answer ? `${answer.answer_id}:${answer.status}:${answerDigest(answer)}` : 'open'}`)
  }
  for (const item of ctx.contradictions) parts.push(`con:${item.id}:${item.status}`)
  return sha(parts.join('\n'))
}
