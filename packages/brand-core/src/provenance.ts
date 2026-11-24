import type { AnswerRecord } from './types.js'

/**
 * Where an answer's value came from, as shown to the owner (BOS-06).
 *
 * `agent_suggested_owner_confirmed` is a value an agent proposed and the owner explicitly confirmed
 * (`brand:interview --answer … --origin agent_suggestion`), or an agent suggestion the owner approved.
 * It is never shown as owner-originated: the owner confirmed it, the agent wrote it.
 */
export type AnswerProvenance = 'owner' | 'agent_suggestion' | 'agent_suggested_owner_confirmed' | 'approved_import' | 'external_cited' | 'system' | 'none'

/** The `--origin` values `brand:interview --answer` accepts. `owner` is the default. */
export const ANSWER_ORIGINS = ['owner', 'agent_suggestion'] as const
export type AnswerOrigin = (typeof ANSWER_ORIGINS)[number]

export function answerProvenance(answer: Pick<AnswerRecord, 'source_type' | 'authority' | 'status'> & { suggested_by?: AnswerRecord['suggested_by'] } | null | undefined): AnswerProvenance {
  if (!answer || !answer.source_type) return 'none'
  if (answer.source_type === 'agent_suggestion') {
    const confirmed = answer.authority === 'confirmed_by_owner' || answer.status === 'approved'
    return confirmed ? 'agent_suggested_owner_confirmed' : 'agent_suggestion'
  }
  return answer.source_type
}

const LABELS: Record<AnswerProvenance, string> = {
  owner: 'Owner',
  agent_suggestion: 'Agent suggestion, not confirmed by the owner',
  agent_suggested_owner_confirmed: 'Agent-suggested, owner-confirmed',
  approved_import: 'Imported approved reference',
  external_cited: 'External cited source',
  system: 'System conversion',
  none: 'None',
}

/** English label for CLI and generated drafts. Studio has its own en/fa/tr strings. */
export function provenanceLabel(provenance: AnswerProvenance): string {
  return LABELS[provenance]
}
