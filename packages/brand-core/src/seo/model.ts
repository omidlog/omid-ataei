import type { AdapterCapability, Staleness, TrustAssessment } from '../research/model.js'
import type { AnswerValue } from './interview.js'

/**
 * The SEO strategy draft: a typed record plus its human-readable Markdown. It is a draft for owner review. It
 * approves nothing, publishes nothing and authorizes no website edit, spend or posting (Sprint 3 adds approval).
 */

export const SEO_STRATEGY_SCHEMA_VERSION = 1
export const STRATEGIST_VERSION = 'seo-strategist/1'

export type Archetype = 'app_only' | 'website' | 'website_and_app' | 'undetermined'
export type Action = 'do_now' | 'test' | 'defer' | 'do_not_do'
/**
 * cited: every platform statement it rests on has a usable, fresh, cited source.
 * brand_reasoned: it rests only on the owner's answers (no platform claim).
 * provisional: it needs a source that is missing, stale or contradicted.
 * blocked: a key owner answer is missing.
 */
export type DecisionStatus = 'cited' | 'brand_reasoned' | 'provisional' | 'blocked'
export type Level = 'low' | 'medium' | 'high'

export interface Citation {
  source_ref: string
  claim_key: string
}

export interface Decision {
  id: string
  title: string
  action: Action
  statement: string
  rationale: string
  /** Claim keys of platform statements this decision depends on. */
  requires: string[]
  citations: Citation[]
  missing_claims: string[]
  status: DecisionStatus
  confidence: Level
  decided_at: string
  review_trigger: string
  area: 'foundation' | 'content' | 'international' | 'store' | 'geo' | 'measurement' | 'guardrail'
  owner_decision: string | null
}

export interface Alternative {
  id: string
  title: string
  summary: string
  criteria: { evidence_strength: Level; feasibility: Level; time_to_signal: 'weeks' | 'months' | 'long'; brand_fit: Level; risk: Level }
  verdict: 'chosen' | 'secondary' | 'deferred' | 'rejected'
  rationale: string
}

export interface EvidenceGap {
  kind: 'unanswered_question' | 'unknown_answer' | 'missing_source' | 'stale_source' | 'conflicting_sources' | 'no_keyword_data' | 'no_baseline' | 'unverified_competitors' | 'unrealistic_goal' | 'research_unavailable'
  item: string
  why: string
  how_to_close: string
}

export interface PlanSource {
  ref: string
  provenance: string
  note_id: string
  revision: string
  url: string
  publisher: string
  title: string | null
  source_type: string
  retrieved_at: string
  page_last_updated: string | null
  trust: TrustAssessment
  staleness: Staleness
  /** The excerpts this plan quotes, verbatim, by claim key. */
  quotes: Array<{ claim_key: string; quote: string }>
}

export interface SeoStrategy {
  schema_version: number
  kind: 'seo_strategy_draft'
  strategist: string
  plan_id: string
  brand_slug: string
  created_at: string
  state: 'draft'
  approval: null
  authorizes: []
  research: {
    status: 'researched' | 'research_unavailable'
    adapter: AdapterCapability
    usable_sources: number
    fresh_sources: number
    stale_sources: number
    conflicts: string[]
  }
  label: 'provisional' | 'evidence_backed'
  confidence: { overall: Level | 'blocked'; reasons: string[] }
  archetype: Archetype
  brand_fit: {
    inputs: Array<{ question_id: string; value: AnswerValue; owner_words: string | null }>
    approved_facts: Array<{ id: string; revision: string | null }>
    observations: string[]
  }
  competitor_assumptions: Array<{ name: string; status: 'unverified_owner_assumption' }>
  alternatives: Alternative[]
  decisions: Decision[]
  geo: { included: boolean; reason: string }
  measurement: { primary_conversion: string; leading_indicators: string[]; baseline: 'not_measured' | 'available_to_owner'; notes: string[] }
  owner_decisions: string[]
  evidence_gaps: EvidenceGap[]
  sources: PlanSource[]
  starting_points: string[]
  markdown: string
}
