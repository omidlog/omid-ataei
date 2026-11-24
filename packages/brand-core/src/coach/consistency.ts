import { isOpenAnswer } from '../completeness.js'
import type { Contradiction } from '../types.js'
import type { CoachContext } from './context.js'
import { COACH_LIMITS, type CoachConsistencyVerdict, type CoachSourceRef } from './model.js'

/**
 * `consistency_review` — the confirmed-conflict part: an **adapter** over the interview's existing deterministic rules.
 *
 * `findContradictions` stays the only implementation of those rules; this file reports what it returns and
 * adds nothing. That is what keeps the acceptance promise "existing deterministic contradictions remain
 * identical" true by construction rather than by comparison.
 *
 * Verdicts in this version:
 * - `confirmed_conflict` — an open rule hit from `findContradictions`. Evidence-supported and logical.
 * - `potential_tension` and `needs_verification` are **not** produced here. They come only from the narrow
 *   registry in `rules.ts` (PR 2), which also reports `not_tested` per rule, so a reader never mistakes
 *   silence for "no strategic tension exists".
 *
 * A restricted field never reaches a finding: restricted answers hold no value in the ledger, and the
 * fields a contradiction names are reported as ids only.
 */

export interface ConsistencyFinding {
  contradiction: Contradiction
  verdict: CoachConsistencyVerdict
  /** The other fields the rule names, as ids. Never values. */
  relatedIds: string[]
  sourceRefs: CoachSourceRef[]
}

/**
 * Open deterministic conflicts, worst first, bounded by `COACH_LIMITS.maxConsistencyFindings`. With a
 * `questionId` only the conflicts naming that field are kept, and the cap is applied after that filter, so a
 * field's conflict is never lost because other fields' conflicts filled the cap first.
 */
export function consistencyFindings(ctx: CoachContext, questionId: string | null = null): ConsistencyFinding[] {
  const rank = { high: 0, medium: 1, low: 2 } as const
  return ctx.contradictions
    .filter((item) => item.status === 'open' && (questionId === null || item.fields.includes(questionId)))
    .sort((a, b) => rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id))
    .slice(0, COACH_LIMITS.maxConsistencyFindings)
    .map((contradiction) => ({
      contradiction,
      verdict: 'confirmed_conflict' as const,
      relatedIds: [...contradiction.fields].sort(),
      sourceRefs: [
        { kind: 'contradiction' as const, id: contradiction.id },
        ...contradiction.fields.filter((id) => ctx.byId.has(id)).map((id): CoachSourceRef => ({ kind: 'question', id })),
      ],
    }))
}

/**
 * Question ids that currently hold a live answer: what a consistency review actually read. A ledger record
 * that is still open (`unanswered`, `deprecated`) is not an answer, and an id the bank no longer has is not a
 * question, so neither counts — otherwise a brand with no live answer would read as "consistent".
 */
export function answeredIds(ctx: CoachContext): string[] {
  return [...ctx.answers.entries()]
    .filter(([id, answer]) => {
      const question = ctx.byId.get(id)
      return question !== undefined && question.sensitivity !== 'restricted' && !isOpenAnswer(answer)
    })
    .map(([id]) => id)
    .sort()
}
