import { z } from 'zod'
import type { BrandConfig, Contradiction, FieldQuestion, LedgerFile, SessionState } from '../types.js'
import type { InterviewProfile } from '../profiles.js'

/**
 * Strategic Coach — the data contract (PR 1).
 *
 * The coach reads the existing interview (question bank, ledger, session, profile, evidence register,
 * `findContradictions`) and returns advice. It is **derived and advisory only**: `authority` is always
 * `derived_advice` and `authorizes` is always empty. Nothing here writes an answer, a fact, an approval,
 * a strategy, a calendar or an asset, and nothing here is a brand fact.
 *
 * Two invariants hold for every string this module and its siblings produce:
 * - **No owner words.** Finding text is built from closed vocabularies, question ids and the coach's own
 *   lexicon terms. The owner's answer is never quoted, echoed, summarised or digested into prose.
 * - **No restricted analysis.** A restricted question is refused (`CoachError('refused')`), not redacted,
 *   so a restricted value never reaches a reason, a log or a cache key.
 *
 * Trust v2 (the parallel control/assurance model) owns framework controls, maturity and evidence lineage.
 * The coach deliberately keeps its own `Coach*` vocabulary and does not define a second assessment or
 * control model; see `docs-internal/STRATEGIC_COACH.md` ("Boundaries").
 */

export const COACH_ENGINE_VERSION = 'coach/1'
/** Bumped whenever a rule changes its verdict for the same input, so cached advice can be invalidated. */
export const COACH_RULE_VERSION = 'coach-rules/5'
export const COACH_SCHEMA_VERSION = 1

export const COACH_MODES = ['follow_up', 'quality_review', 'consistency_review'] as const
export type CoachMode = (typeof COACH_MODES)[number]

/**
 * Explainable statuses, never a score. `insufficient_context` and `not_applicable` are first-class:
 * an unanswered question and an explicit `unknown` / `skip` / `not relevant` are not failures.
 */
export const COACH_STATUSES = ['ready', 'needs_clarification', 'evidence_missing', 'needs_review', 'not_applicable', 'insufficient_context'] as const
export type CoachStatus = (typeof COACH_STATUSES)[number]

/** The rubric. `measurability` applies only to questions that ask for a measure; see quality.ts. */
export const COACH_CRITERIA = ['relevance', 'specificity', 'completeness_for_output', 'measurability', 'evidence_support', 'clarity_coherence'] as const
export type CoachCriterion = (typeof COACH_CRITERIA)[number]

/**
 * Consistency verdicts. `confirmed_conflict` comes only from the existing deterministic `findContradictions`
 * rules. `potential_tension` (a strategic trade-off worth one question) and `needs_verification` (a sensitive
 * claim without a current independent source) come only from the narrow registry in `coach/rules.ts`. A rule
 * that could not run is reported as `not_tested` in `rule_checks`, never as silence.
 */
export const COACH_CONSISTENCY_VERDICTS = ['confirmed_conflict', 'potential_tension', 'needs_verification'] as const
export type CoachConsistencyVerdict = (typeof COACH_CONSISTENCY_VERDICTS)[number]

export const COACH_FINDING_TYPES = ['follow_up', 'quality', 'consistency'] as const
export type CoachFindingType = (typeof COACH_FINDING_TYPES)[number]

/** Not a number. `attention` means a human should look, `advice` is optional, `info` states a fact about the record. */
export const COACH_SEVERITIES = ['info', 'advice', 'attention'] as const
export type CoachSeverity = (typeof COACH_SEVERITIES)[number]

/** Closed vocabulary. Every code has en/fa/tr text in coach/i18n.ts; a missing entry fails a test. */
export const COACH_FINDING_CODES = [
  // quality_review
  'question_not_applicable',
  'answer_missing',
  'answer_disposition',
  'placeholder_value',
  'vague_terms',
  'too_brief_for_output',
  'linked_question_open',
  'missing_measure',
  'evidence_not_verified',
  'evidence_owner_stated_only',
  'field_in_open_conflict',
  'meets_criteria',
  // quality_review, personal facet rubrics (coach/facet-rubrics.ts)
  'facet_ownership_separate',
  'facet_companion_open',
  'facet_claim_undated',
  // follow_up
  'follow_up_canonical',
  'follow_up_clarify',
  'follow_up_none',
  // consistency_review
  'consistency_rule',
  'consistency_tension',
  'consistency_verification',
  'consistency_none',
] as const
export type CoachFindingCode = (typeof COACH_FINDING_CODES)[number]

/** What a finding points at. Ids only: never a value, never owner text. */
export const COACH_SOURCE_KINDS = ['question', 'answer', 'contradiction', 'evidence', 'profile', 'config'] as const
export type CoachSourceKind = (typeof COACH_SOURCE_KINDS)[number]

export const COACH_LIMITS = {
  /** `quality_review` reports at most this many deficits (hard rule: "maximum 2 top deficits"). */
  maxDeficits: 2,
  /** `follow_up` returns 0 or 1 question. Never more. */
  maxFollowUps: 1,
  /** Defence against an enormous ledger: the consistency summary lists at most this many conflicts. */
  maxConsistencyFindings: 20,
  /** Answer text longer than this is truncated before the rules read it (bounded work, no model). */
  maxAnswerChars: 4000,
  maxReasonChars: 600,
} as const

export class CoachError extends Error {
  constructor(
    readonly code: 'refused' | 'not_found' | 'invalid_input' | 'invalid_output',
    message: string,
  ) {
    super(message)
    this.name = 'CoachError'
  }
}

/**
 * The read-only view of the interview that the coach is allowed to use. `InterviewEngine` satisfies it
 * structurally, so the coach can be handed the real engine while being unable, by type, to write: no
 * `submit`, `answerQuestion`, `approve`, `changeAnswer` or `recordProposal` is in scope.
 */
export interface CoachSource {
  workspaceRoot(): string
  config(): BrandConfig
  questions(): FieldQuestion[]
  question(id: string): FieldQuestion | undefined
  ledger(): LedgerFile
  session(): SessionState
  profile(): InterviewProfile | null
  eligible(opts?: { profile?: string }): FieldQuestion[]
}

/** A derived contradiction as the coach reports it. Shaped from `Contradiction`, never re-implemented. */
export type CoachContradiction = Pick<Contradiction, 'id' | 'rule' | 'severity' | 'fields'>

export interface CoachSourceRef {
  kind: CoachSourceKind
  id: string
  /** The ledger `answer_id` the finding was computed against, when the ref is an answer. */
  revision?: string
}

export interface CoachFinding {
  /** Stable for the same (mode, question, answer revision, code): re-running returns the same id. */
  id: string
  type: CoachFindingType
  code: CoachFindingCode
  status: CoachStatus
  severity: CoachSeverity
  /** The rubric criterion this finding assessed, when it came from the rubric. */
  criterion: CoachCriterion | null
  /** Set on consistency findings only. */
  verdict: CoachConsistencyVerdict | null
  question_id: string | null
  related_question_ids: string[]
  /**
   * An existing canonical question that already covers the gap. When set, the coach links to it instead
   * of inventing a second question, and `suggested_question` is null.
   */
  canonical_question_id: string | null
  /** The one clarifying question to ask, when no canonical question covers the gap. Localized. */
  suggested_question: string | null
  /** The missing dimension, in the coach's vocabulary. */
  missing_dimension: CoachCriterion | null
  /** Document paths (from `related_outputs`) this answer feeds, so the advice names what it improves. */
  improves_outputs: string[]
  /** Why, in the requested locale. Closed-vocabulary text: never the owner's words. */
  reason: string
  /** One concrete thing the owner could do. Localized, never a rewritten answer. */
  improvement: string | null
  /** True when acting on this finding means changing an approved fact, which needs the human change flow. */
  requires_change_request: boolean
  source_refs: CoachSourceRef[]
  /** PR 1 is deterministic only. `model_suggestion` is reserved for the optional provider in PR 3. */
  origin: 'deterministic' | 'model_suggestion'
}

export interface CoachResult {
  schema_version: typeof COACH_SCHEMA_VERSION
  kind: 'coach_result'
  brand_id: string
  mode: CoachMode
  locale: 'en' | 'fa' | 'tr'
  /** The assessed question, or null for a brand-wide `consistency_review`. */
  question_id: string | null
  /**
   * The exact ledger revision analysed. `digest` is a short sha256 over the record identity, so a cache
   * can tell stale advice from current advice without storing the answer.
   */
  answer_ref: { answer_id: string; status: string; digest: string } | null
  analysis_scope: {
    profile: string
    /** Question ids the analysis read. */
    questions: string[]
    /** Digest over every input the rules read, so the same inputs always give the same result. */
    context_digest: string
  }
  status: CoachStatus
  findings: CoachFinding[]
  generated_at: string
  engine_version: string
  rule_version: string
  /** Always `derived_advice`. The coach is never a source of truth. */
  authority: 'derived_advice'
  /** Always empty. Reading this result authorizes no write, approval, publication or spend. */
  authorizes: []
  source_refs: CoachSourceRef[]
  /** Machine-readable notes about how the analysis ran (for example that no model was called). */
  notes: string[]
  /**
   * `consistency_review` only: one entry per rule, saying whether it fired, stayed silent, was explained by a
   * guard, or was `not_tested` because an input is open. Ids only.
   */
  rule_checks?: CoachRuleCheckRecord[]
}

export const COACH_RULE_CHECK_KINDS = ['contradiction', 'tension', 'verification'] as const
export const COACH_RULE_CHECK_OUTCOMES = ['confirmed_conflict', 'potential_tension', 'needs_verification', 'no_finding', 'not_tested'] as const
export type CoachRuleCheckOutcome = (typeof COACH_RULE_CHECK_OUTCOMES)[number]
export const COACH_RULE_CHECK_BASES = ['rule_fired', 'rule_silent', 'guard_matched', 'inputs_open'] as const

export interface CoachRuleCheckRecord {
  rule_id: string
  kind: (typeof COACH_RULE_CHECK_KINDS)[number]
  outcome: CoachRuleCheckOutcome
  basis: (typeof COACH_RULE_CHECK_BASES)[number]
  question_ids: string[]
}

// ---- output validation ----------------------------------------------------------------------------

const QUESTION_ID = /^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/

const SourceRefSchema = z
  .object({ kind: z.enum(COACH_SOURCE_KINDS), id: z.string().min(1).max(200), revision: z.string().min(1).max(40).optional() })
  .strict()

const RuleCheckSchema = z
  .object({
    rule_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
    kind: z.enum(COACH_RULE_CHECK_KINDS),
    outcome: z.enum(COACH_RULE_CHECK_OUTCOMES),
    basis: z.enum(COACH_RULE_CHECK_BASES),
    question_ids: z.array(z.string().regex(QUESTION_ID)).max(100),
  })
  .strict()

const FindingSchema = z
  .object({
    id: z.string().min(1).max(200),
    type: z.enum(COACH_FINDING_TYPES),
    code: z.enum(COACH_FINDING_CODES),
    status: z.enum(COACH_STATUSES),
    severity: z.enum(COACH_SEVERITIES),
    criterion: z.enum(COACH_CRITERIA).nullable(),
    verdict: z.enum(COACH_CONSISTENCY_VERDICTS).nullable(),
    question_id: z.string().regex(QUESTION_ID).nullable(),
    related_question_ids: z.array(z.string().regex(QUESTION_ID)).max(50),
    canonical_question_id: z.string().regex(QUESTION_ID).nullable(),
    suggested_question: z.string().min(1).max(COACH_LIMITS.maxReasonChars).nullable(),
    missing_dimension: z.enum(COACH_CRITERIA).nullable(),
    improves_outputs: z.array(z.string().min(1).max(200)).max(20),
    reason: z.string().min(1).max(COACH_LIMITS.maxReasonChars),
    improvement: z.string().min(1).max(COACH_LIMITS.maxReasonChars).nullable(),
    requires_change_request: z.boolean(),
    source_refs: z.array(SourceRefSchema).max(50),
    origin: z.enum(['deterministic', 'model_suggestion']),
  })
  .strict()

export const CoachResultSchema = z
  .object({
    schema_version: z.literal(COACH_SCHEMA_VERSION),
    kind: z.literal('coach_result'),
    brand_id: z.string().min(1).max(100),
    mode: z.enum(COACH_MODES),
    locale: z.enum(['en', 'fa', 'tr']),
    question_id: z.string().regex(QUESTION_ID).nullable(),
    answer_ref: z
      .object({ answer_id: z.string().min(1).max(40), status: z.string().min(1).max(40), digest: z.string().regex(/^[0-9a-f]{16}$/) })
      .strict()
      .nullable(),
    analysis_scope: z
      .object({
        profile: z.string().min(1).max(100),
        questions: z.array(z.string().regex(QUESTION_ID)).max(1000),
        context_digest: z.string().regex(/^[0-9a-f]{16}$/),
      })
      .strict(),
    status: z.enum(COACH_STATUSES),
    findings: z.array(FindingSchema).max(COACH_LIMITS.maxConsistencyFindings + COACH_LIMITS.maxDeficits + 1),
    generated_at: z.string().min(20).max(30),
    engine_version: z.string().min(1).max(40),
    rule_version: z.string().min(1).max(40),
    authority: z.literal('derived_advice'),
    authorizes: z.tuple([]),
    source_refs: z.array(SourceRefSchema).max(200),
    notes: z.array(z.string().min(1).max(COACH_LIMITS.maxReasonChars)).max(20),
    rule_checks: z.array(RuleCheckSchema).max(30).optional(),
  })
  .strict()

/**
 * Validates a result against the contract before it leaves the library. A rule that produced an
 * out-of-vocabulary code, a numeric score or a non-empty `authorizes` fails here rather than reaching
 * the CLI, a file or an agent.
 */
export function validateCoachResult(result: unknown): CoachResult {
  const parsed = CoachResultSchema.safeParse(result)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw new CoachError('invalid_output', `The coach produced a result that does not match the contract: ${first ? `${first.path.join('.')} ${first.message}` : 'unknown field'}.`)
  }
  return parsed.data as CoachResult
}

export function isCoachMode(value: unknown): value is CoachMode {
  return typeof value === 'string' && (COACH_MODES as readonly string[]).includes(value)
}
