import type { Locale } from '../i18n.js'
import type { AnswerRecord, FieldQuestion } from '../types.js'
import { answerText, conflictsFor, coachQuestion, isDisposition, liveAnswer, notApplicableReason, openLinked, verificationOf, type CoachContext } from './context.js'
import { coachUi, CRITERION_NAMES } from './i18n.js'
import { contentWordCount, expectsMeasure, hasDigit, isFreeText, isPlaceholderValue, minWordsFor, QUALITY_THRESHOLDS, vagueMarkersIn } from './lexicon.js'
import { COACH_LIMITS, type CoachCriterion, type CoachFindingCode, type CoachSourceRef, type CoachStatus } from './model.js'

/**
 * `quality_review` — the deterministic rubric.
 *
 * It judges **the data, not the person**: every verdict is a named criterion with a reason that cites the
 * question it assessed. There is no score, no percentage and no confidence number, and a valid creative or
 * qualitative answer is never penalised for having no figures — `measurability` applies only to questions
 * that ask for a measure (`coach/lexicon.ts`).
 *
 * An explicit `unknown`, `skip` or `not relevant` is a real answer: it short-circuits to `not_applicable`
 * with no deficits, so the coach cannot turn a decision into required re-questioning.
 */

/** Order in which deficits are reported. The first two reach the owner (`COACH_LIMITS.maxDeficits`). */
const CRITERION_PRIORITY: readonly CoachCriterion[] = ['relevance', 'evidence_support', 'clarity_coherence', 'specificity', 'completeness_for_output', 'measurability']

/** Worst-first. The assessment's status is the first of these that any finding carries. */
const STATUS_PRIORITY: readonly CoachStatus[] = ['insufficient_context', 'not_applicable', 'needs_review', 'evidence_missing', 'needs_clarification', 'ready']

export interface QualityFinding {
  code: CoachFindingCode
  criterion: CoachCriterion | null
  status: CoachStatus
  /** Placeholder values for the localized text. Closed-vocabulary only; never owner words. */
  vars: Record<string, string>
  relatedIds: string[]
  sourceRefs: CoachSourceRef[]
  /** An existing question that closes this gap (set by the facet rubrics), reported as `canonical_question_id`. */
  canonicalId?: string
}

export interface QualityAssessment {
  question: FieldQuestion
  answer: AnswerRecord | undefined
  status: CoachStatus
  /** Every finding the rubric produced, in criterion-priority order. */
  findings: QualityFinding[]
  /** The criteria that applied to this question, so the result can say what was actually checked. */
  checked: CoachCriterion[]
  /** True when the owner recorded an explicit disposition, or the question has no live answer. */
  settled: boolean
  /** True when the live answer is approved, so acting on a deficit needs the human change flow. */
  approved: boolean
}

function criterionList(locale: Locale, criteria: readonly CoachCriterion[]): string {
  return criteria.map((criterion) => CRITERION_NAMES[locale][criterion]).join(', ')
}

/**
 * Assesses one answer. Pure: it reads the context and returns findings, and it writes nothing. The same
 * context and question always give the same result, which is what makes the advice idempotent.
 */
export function assessAnswer(ctx: CoachContext, question: FieldQuestion, locale: Locale = 'en'): QualityAssessment {
  const answer = liveAnswer(ctx, question.id)
  const ref: CoachSourceRef[] = [{ kind: 'question', id: question.id }]
  const answerRef = (): CoachSourceRef[] => (answer ? [...ref, { kind: 'answer', id: answer.answer_id, revision: answer.answer_id }] : ref)

  // Eligibility first: a question the owner's own configuration or earlier answers turned off is not
  // applicable, never "missing". The coach must not push anyone to answer it.
  const inapplicable = notApplicableReason(ctx, question)
  if (inapplicable) {
    return {
      question,
      answer,
      status: 'not_applicable',
      findings: [
        {
          code: 'question_not_applicable',
          criterion: null,
          status: 'not_applicable',
          vars: { question: question.id, why: coachUi(locale, inapplicable), condition: question.skip_when ?? '—' },
          relatedIds: [],
          sourceRefs: [...ref, { kind: 'config', id: inapplicable }],
        },
      ],
      checked: [],
      settled: true,
      approved: answer?.status === 'approved',
    }
  }

  if (!answer) {
    return {
      question,
      answer: undefined,
      status: 'insufficient_context',
      findings: [{ code: 'answer_missing', criterion: null, status: 'insufficient_context', vars: { question: question.id }, relatedIds: [], sourceRefs: ref }],
      checked: [],
      settled: true,
      approved: false,
    }
  }
  if (isDisposition(ctx.answers.get(question.id))) {
    return {
      question,
      answer,
      status: 'not_applicable',
      findings: [{ code: 'answer_disposition', criterion: null, status: 'not_applicable', vars: { question: question.id, status: answer.status }, relatedIds: [], sourceRefs: answerRef() }],
      checked: [],
      settled: true,
      approved: answer.status === 'approved',
    }
  }

  const text = answerText(answer)
  const findings: QualityFinding[] = []
  const checked: CoachCriterion[] = []

  // relevance — the stored value is a decision of the owner's, not one of the template's placeholders.
  checked.push('relevance')
  if (isPlaceholderValue(text)) {
    findings.push({ code: 'placeholder_value', criterion: 'relevance', status: 'needs_review', vars: { question: question.id }, relatedIds: [], sourceRefs: answerRef() })
  }

  // evidence_support — only where the question itself declares a publication requirement.
  if (question.publication_requires?.includes('verified_evidence')) {
    checked.push('evidence_support')
    const verification = verificationOf(ctx, question)
    if (verification === 'unverified') {
      findings.push({ code: 'evidence_not_verified', criterion: 'evidence_support', status: 'evidence_missing', vars: { question: question.id }, relatedIds: [], sourceRefs: [...answerRef(), { kind: 'evidence', id: question.id }] })
    } else if (verification === 'owner_stated') {
      findings.push({ code: 'evidence_owner_stated_only', criterion: 'evidence_support', status: 'evidence_missing', vars: { question: question.id }, relatedIds: [], sourceRefs: [...answerRef(), { kind: 'evidence', id: question.id }] })
    }
  }

  // clarity_coherence — the existing deterministic contradiction rules, reported, never re-implemented.
  checked.push('clarity_coherence')
  const conflicts = conflictsFor(ctx, question.id)
  if (conflicts.length > 0) {
    findings.push({
      code: 'field_in_open_conflict',
      criterion: 'clarity_coherence',
      status: 'needs_review',
      vars: { question: question.id, count: String(conflicts.length), rules: conflicts.map((item) => item.rule).join(', ') },
      relatedIds: [...new Set(conflicts.flatMap((item) => item.fields))].filter((id) => id !== question.id).sort(),
      sourceRefs: [...answerRef(), ...conflicts.map((item): CoachSourceRef => ({ kind: 'contradiction', id: item.id }))],
    })
  }

  // specificity — free text only, and a general phrase counts only while the answer is short.
  if (isFreeText(question)) {
    checked.push('specificity')
    const words = contentWordCount(text)
    const min = minWordsFor(question)
    if (words < min) {
      findings.push({ code: 'too_brief_for_output', criterion: 'specificity', status: 'needs_clarification', vars: { question: question.id, words: String(words), min: String(min) }, relatedIds: [], sourceRefs: answerRef() })
    } else {
      const markers = vagueMarkersIn(text)
      if (markers.length > 0 && words <= QUALITY_THRESHOLDS.vagueWordGate) {
        findings.push({ code: 'vague_terms', criterion: 'specificity', status: 'needs_clarification', vars: { question: question.id, terms: markers.join(', ') }, relatedIds: [], sourceRefs: answerRef() })
      }
    }
  }

  // completeness_for_output — a declared prerequisite this answer builds on is still open.
  const linked = openLinked(ctx, question)
  if (question.depends_on.length > 0) checked.push('completeness_for_output')
  if (linked.length > 0) {
    findings.push({
      code: 'linked_question_open',
      criterion: 'completeness_for_output',
      status: 'needs_clarification',
      vars: { question: question.id, ids: linked.join(', ') },
      relatedIds: linked,
      sourceRefs: [...answerRef(), ...linked.map((id): CoachSourceRef => ({ kind: 'question', id }))],
    })
  }

  // measurability — only for questions that ask for a measure.
  if (expectsMeasure(question)) {
    checked.push('measurability')
    if (!hasDigit(text)) {
      findings.push({ code: 'missing_measure', criterion: 'measurability', status: 'needs_clarification', vars: { question: question.id }, relatedIds: [], sourceRefs: answerRef() })
    }
  }

  findings.sort((a, b) => {
    const rank = (criterion: CoachCriterion | null) => (criterion === null ? -1 : CRITERION_PRIORITY.indexOf(criterion))
    return rank(a.criterion) - rank(b.criterion)
  })

  if (findings.length === 0) {
    findings.push({
      code: 'meets_criteria',
      criterion: null,
      status: 'ready',
      vars: { question: question.id, criteria: criterionList(locale, checked) },
      relatedIds: [],
      sourceRefs: answerRef(),
    })
  }

  const status = STATUS_PRIORITY.find((candidate) => findings.some((finding) => finding.status === candidate)) ?? 'ready'
  return { question, answer, status, findings, checked, settled: false, approved: answer.status === 'approved' }
}

/** The at most two deficits the owner sees. A `ready`, `not_applicable` or missing answer reports one note. */
export function topFindings(assessment: QualityAssessment): QualityFinding[] {
  if (assessment.settled || assessment.status === 'ready') return assessment.findings.slice(0, 1)
  return assessment.findings.filter((finding) => finding.status !== 'ready').slice(0, COACH_LIMITS.maxDeficits)
}

/** The highest-priority deficit, used by the follow-up chooser to decide what to ask about. */
export function topDeficit(assessment: QualityAssessment): QualityFinding | null {
  if (assessment.settled) return null
  return assessment.findings.find((finding) => finding.status !== 'ready' && finding.criterion !== null) ?? null
}

/** Convenience for callers that already hold the context: assess by id, refusing restricted questions. */
export function assessById(ctx: CoachContext, questionId: string, locale: Locale = 'en'): QualityAssessment {
  return assessAnswer(ctx, coachQuestion(ctx, questionId), locale)
}
