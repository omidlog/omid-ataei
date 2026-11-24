import type { IdentityField, IdentityIntakeSource } from './identity-intake.js'
import type { AnswerRecord, Status } from './types.js'

/** Result and input types of the interview engine. Re-exported from engine.ts. */

export interface StepResult {
  kind: 'recorded' | 'info' | 'exit' | 'error' | 'impact'
  message: string
  questionId?: string
  status?: Status
  impact?: ImpactReport
}

export interface ImpactReport {
  questionId: string
  previous: { value: AnswerRecord['value']; status: Status } | null
  proposedPreview: string
  requiresConfirmation: boolean
  impactedDocuments: string[]
  impactedQuestions: string[]
  approvalsPreserved: boolean
}

export interface InitInput {
  name: string
  slug: string
  industry: string
  sector?: string
  language: string
  languages: string[]
  website?: string | null
  mascot: boolean
  gamification: boolean
  publish: 'public' | 'private'
  profile?: string
  /** Turn on the Personal Brand OS module. Implied by `profile: personal-brand`. */
  personal?: boolean
  /** Personal facets, for example founder-executive and consultant-expert. Needs the personal module. */
  facets?: string[]
  reset?: boolean
  /** The template commit this brand starts from, for template sync. Studio passes the template head. */
  template?: { repository: string | null; commit: string | null; version: string | null; source: string }
  /**
   * Optional identity intake (logo today, intent, change depth). Written to `onboarding.identity` in
   * brand.config.yaml as an unapproved owner hint. Absent: nothing is written and an existing record is kept.
   */
  identity?: { choice: Partial<Record<IdentityField, unknown>>; source: IdentityIntakeSource }
}
