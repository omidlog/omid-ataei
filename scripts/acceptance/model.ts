/**
 * The acceptance report contract, `brand-os/acceptance-report/v1` (`schemas/acceptance-report.schema.json`).
 *
 * A report records what the harness actually ran and saw. Every check is PASS, FAIL or NOT_TESTED, with evidence made
 * of ids, counts, codes, exit codes and checksums only, never brand text. A case is PASS only when every one of its
 * checks passed; one FAIL makes it FAIL; otherwise it is NOT_TESTED. Nothing is ever rounded up to a pass.
 */

export const ACCEPTANCE_SCHEMA = 'brand-os/acceptance-report/v1' as const

export type Verdict = 'PASS' | 'FAIL' | 'NOT_TESTED'

/** What the journey actually delivered. `brief_only` and `blocked` are honest outcomes, not production successes. */
export type Production = 'produced' | 'brief_only' | 'blocked' | 'not_tested'

export type CaseId = 'single_visual' | 'ten_instagram_posts' | 'website_brief' | 'paid_ad_brief'

export interface CheckRecord {
  id: string
  /** Which acceptance-cases.json case this check covers (FIX-02 … FIX-08). */
  fixes: string
  verdict: Verdict
  evidence: string[]
}

export interface CaseRecord {
  case_id: CaseId
  journey: 1 | 2 | 3 | 4
  fixes: string[]
  /** The agent profile the journey ran under (the token lives only in the MCP server's environment). */
  profile: string
  verdict: Verdict
  production: Production
  pack_sha256: string | null
  metrics: {
    /** Tool calls the scripted agent made (MCP and CLI). */
    tool_calls: number
    /** Existing question ids the pack says the owner still has to answer (missing[] with a question id). */
    owner_questions: number
    question_ids: string[]
    /** Gaps without a question id (not authorized for this profile, no strategy, no asset). */
    other_gaps: number
    artifacts: number
    seconds: number
  }
  outputs: Array<{ file: string; sha256: string; bytes: number }>
  checks: CheckRecord[]
}

export interface AcceptanceReport {
  schema: typeof ACCEPTANCE_SCHEMA
  origin: 'synthetic' | 'owner_brand'
  brand_id: string
  /** The Brand OS commit the harness ran from, when known. */
  harness_commit: string | null
  started_at: string
  finished_at: string
  verdict: Verdict
  totals: Record<Verdict, number>
  cases: CaseRecord[]
  workspace: {
    /** The harness works on a temporary snapshot of brand/; the given checkout is hashed before and after. */
    snapshot: true
    root_unchanged: boolean | null
  }
  /** Things this harness cannot test by construction, stated so nobody reads silence as a pass. */
  not_covered: string[]
  authorizes: []
  permissions: { publish: false; schedule: false; spend: false; deploy: false }
}

export const NOT_COVERED = [
  'live_claude_session: the scripted agent makes the tool calls a skill-following session would; a real model session (prompts, extra questions it might still ask) is a pilot observation, not a CI result',
  'visual_taste_and_similarity: no person or model looked at the artwork; production readiness reports needs_human_review',
  'semantic_persuasion: not_tested by design',
  'image_or_site_or_ad_renderer: only social_batch has a renderer; other journeys end in a brief',
  'owner_change_requests: recorded by the owner after reviewing outputs, not by the harness',
] as const

/** The case verdict rule: any FAIL → FAIL; all PASS → PASS; otherwise NOT_TESTED. An empty case is NOT_TESTED. */
export function caseVerdict(checks: CheckRecord[]): Verdict {
  if (checks.some((check) => check.verdict === 'FAIL')) return 'FAIL'
  if (checks.length > 0 && checks.every((check) => check.verdict === 'PASS')) return 'PASS'
  return 'NOT_TESTED'
}
