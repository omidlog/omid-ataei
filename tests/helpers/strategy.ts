import assert from 'node:assert/strict'
import { ensureApprovalSecret, InterviewEngine, openWorkspace, type KnowledgeWorkspace } from '@brand-os/brand-core'
import { loadEvidence } from '@brand-os/brand-core/research'
import { brandDir } from './knowledge.js'
import { recordOfficial } from './seo.js'

/** Fixed clock: a day after the research fixture was recorded. */
export const NOW = new Date('2026-11-23T09:00:00Z')

export const OBJECTIVE = 'Grow qualified trial sign-ups from organic and paid discovery.'
export const GEOGRAPHY = 'Turkey and the Persian-speaking diaspora'
export const BUDGET_CANARY = 987654
export const RESTRICTED_NOTE_CANARY = 'RESTRICTED-NOTE-CANARY partner rebate terms'
export const DRAFT_CANARY = 'DRAFT-V2-CANARY switch everything to video ads'

export interface StrategyBrand {
  root: string
  ws: KnowledgeWorkspace
  engine: InterviewEngine
  proof: string
  /** Research note ids recorded from the official SEO fixture, by URL fragment. */
  research: string[]
  at: (date: Date) => KnowledgeWorkspace
}

/**
 * A temp brand with two approved marketing facts, the owner's approval secret and the recorded official research
 * notes (Sprint 2 fixture, replayed, no network).
 */
export async function strategyBrand(slug = 'pilito', now: Date = NOW): Promise<StrategyBrand> {
  const root = brandDir({ slug })
  const engine = new InterviewEngine(root)
  const proof = ensureApprovalSecret(root)
  for (const [id, value] of [
    ['business.marketing.objective', OBJECTIVE],
    ['business.market.geography', GEOGRAPHY],
  ] as const) {
    assert.equal(engine.changeAnswer(id, value).kind, 'recorded', id)
    assert.equal(engine.approve(id, 'owner', proof).kind, 'recorded', id)
  }
  const ws = openWorkspace(root, { now: () => now })
  await recordOfficial(ws)
  const research = loadEvidence(ws).items.map((item) => item.note.id)
  assert.ok(research.length >= 2, 'research notes recorded')
  return { root, ws, engine, proof, research, at: (date: Date) => openWorkspace(root, { now: () => date }) }
}

/** A complete SEO proposal citing two approved facts and two research notes, with a restricted budget. */
export function seoProposal(research: string[], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Organic discovery for the language app',
    type: 'seo',
    locale: 'en',
    scope: { markets: ['tr', 'en-US'], channel: 'organic-search', period: '2027-H1' },
    valid_from: '2026-11-01',
    valid_until: '2027-06-30',
    review_due_at: '2027-03-31',
    objective: { statement: 'Test whether learners discover our guides through search.', status: 'hypothesis' },
    success_metrics: [{ id: 'qualified_organic_sessions', unit: 'sessions', baseline: null, target: null, measurement_source: 'search-console', status: 'needs_baseline' }],
    guardrails: ['No claim of features that are not approved facts'],
    constraints: ['Execution needs separate site-owner authorization'],
    must_do: ['Keep one canonical URL per guide'],
    must_not_do: ['Publish automatically', 'Assume traffic has increased'],
    non_goals: ['Paid search'],
    alternatives: [
      { id: 'a', description: 'Informational guides first', assessment: 'chosen', rationale: 'Fits current content capacity.' },
      { id: 'b', description: 'Product pages first', assessment: 'rejected', rationale: 'No approved feature list yet.' },
    ],
    selection_rationale: 'Guides match the approved objective and the recorded official guidance on helpful content.',
    recommendations: [
      { id: 'r1', priority: 'high', action: 'Write five people-first guides for beginner learners', rationale: 'Search guidance favours helpful content.', agent_kinds: ['seo'], evidence_refs: [research[0]], fact_refs: ['business.marketing.objective'] },
      { id: 'r2', priority: 'medium', action: 'Add hreflang between tr and en guides', rationale: 'Two markets in scope.', agent_kinds: ['seo'], evidence_refs: [], fact_refs: ['business.market.geography'] },
    ],
    fact_refs: ['business.marketing.objective', 'business.market.geography'],
    evidence_refs: research.slice(0, 2),
    assumptions: ['Demand exists in both markets (unverified)'],
    open_questions: ['Who edits the guides?'],
    restricted: { budget: { amount: BUDGET_CANARY, currency: 'EUR', period: '2027-H1' }, notes: RESTRICTED_NOTE_CANARY },
    ...overrides,
  }
}

/** A paid-media proposal for the Ads agent. */
export function adsProposal(research: string[], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return seoProposal(research, {
    title: 'Paid social test for trial sign-ups',
    type: 'paid_media',
    scope: { markets: ['tr'], channel: 'paid-social', period: '2027-Q1' },
    objective: { statement: 'Test whether short reels drive qualified trial sign-ups.', status: 'hypothesis' },
    non_goals: ['Brand awareness campaigns'],
    recommendations: [
      { id: 'p1', priority: 'high', action: 'Run a two-week creative test with three onboarding reels', rationale: 'Learn which hook works before scaling.', agent_kinds: ['ads'], evidence_refs: [], fact_refs: ['business.marketing.objective'] },
    ],
    evidence_refs: [],
    ...overrides,
  })
}
