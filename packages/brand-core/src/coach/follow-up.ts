import type { Locale } from '../i18n.js'
import type { FieldQuestion } from '../types.js'
import { isDisposition, liveAnswer, type CoachContext } from './context.js'
import type { NoFollowUpReason } from './i18n.js'
import type { CoachCriterion } from './model.js'
import { assessAnswer, topDeficit, type QualityAssessment, type QualityFinding } from './quality.js'

/**
 * `follow_up` — Smart Follow-up. Returns **0 or 1** highest-value clarifying question.
 *
 * Fatigue rules, all enforced here:
 * - an explicit `unknown` / `skip` / `not relevant` is never reopened;
 * - an unanswered question gets no follow-up (the question itself comes first);
 * - an answer that passes the rubric gets no follow-up;
 * - when an existing canonical question already covers the gap, the coach **links to its id** instead of
 *   writing a second question, so there is never a parallel Q&A bank;
 * - when that canonical question is on the owner's `decide later` list, the coach treats the deferral as a
 *   decline and asks nothing — it does not re-dress the same gap as a new question.
 *
 * The function is pure and idempotent for a given (question, answer revision), which is what makes "at
 * most one automatic follow-up per answered question" hold without any new storage: re-running returns the
 * same single suggestion, and answering, skipping or deferring the target makes it return none.
 */

export interface FollowUpChoice {
  kind: 'canonical' | 'clarify' | 'none'
  /** The missing dimension, when there is one. */
  criterion: CoachCriterion | null
  /** The existing question to ask instead of a new one. */
  canonicalId: string | null
  /** Why there is nothing to ask. Set only when `kind` is `none`. */
  noneReason: NoFollowUpReason | null
  /** The rubric deficit that motivated the follow-up. */
  deficit: QualityFinding | null
  /** The assessment the choice was made from, so a caller does not recompute it. */
  assessment: QualityAssessment
}

const PRIORITY_BAND: Record<FieldQuestion['priority'], number> = { critical: 0, high: 1, medium: 2, low: 3 }

/**
 * Existing questions that would close this exact gap, best first.
 *
 * Only the ids the deficit itself names count — the open questions this answer builds on, or the other
 * fields a contradiction names. A merely adjacent question is not offered: when the gap is inside the
 * answer (it is vague, it carries no figure, it has no evidence), no other question can close it, so the
 * coach asks its own single clarifying question instead of pointing at a loosely related one.
 *
 * A candidate must be in the active profile, open, eligible under the current config and answers, not
 * restricted, and not already settled by a disposition.
 */
function canonicalCandidates(ctx: CoachContext, question: FieldQuestion, deficit: QualityFinding): FieldQuestion[] {
  const askable = new Map(ctx.questions.filter((item) => item.sensitivity !== 'restricted').map((item) => [item.id, item]))
  const inScope = (id: string) => !ctx.scope || ctx.scope.has(id)
  const usable = (id: string): FieldQuestion | null => {
    if (id === question.id) return null
    const candidate = askable.get(id)
    if (!candidate || !inScope(id) || !ctx.eligibleIds.has(id)) return null
    if (liveAnswer(ctx, id) || isDisposition(ctx.answers.get(id))) return null
    return candidate
  }
  return sort(deficit.relatedIds.map(usable).filter((item): item is FieldQuestion => item !== null))
}

function sort(questions: FieldQuestion[]): FieldQuestion[] {
  return [...questions].sort((a, b) => PRIORITY_BAND[a.priority] - PRIORITY_BAND[b.priority] || a.order - b.order || a.id.localeCompare(b.id))
}

export function chooseFollowUp(ctx: CoachContext, question: FieldQuestion, locale: Locale = 'en'): FollowUpChoice {
  const assessment = assessAnswer(ctx, question, locale)
  const base = { criterion: null, canonicalId: null, deficit: null, assessment } as const
  if (assessment.findings[0]?.code === 'question_not_applicable') return { ...base, kind: 'none', noneReason: 'question_inapplicable' }
  if (!assessment.answer) return { ...base, kind: 'none', noneReason: 'answer_open' }
  if (assessment.settled) return { ...base, kind: 'none', noneReason: 'answer_settled' }

  const deficit = topDeficit(assessment)
  if (!deficit || deficit.criterion === null) return { ...base, kind: 'none', noneReason: 'quality_ready' }

  const candidates = canonicalCandidates(ctx, question, deficit)
  const first = candidates.find((candidate) => !ctx.deferred.has(candidate.id))
  if (first) return { kind: 'canonical', criterion: deficit.criterion, canonicalId: first.id, noneReason: null, deficit, assessment }
  // Every candidate is deferred: the owner already declined this gap. Do not re-ask it in other words.
  if (candidates.length > 0) return { ...base, kind: 'none', noneReason: 'already_deferred', deficit, criterion: deficit.criterion }

  return { kind: 'clarify', criterion: deficit.criterion, canonicalId: null, noneReason: null, deficit, assessment }
}
