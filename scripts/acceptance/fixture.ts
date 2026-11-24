import { createDemoBrand, DEMO_NOW, type DemoBrand } from '@brand-os/brand-core/runtime'
import { ensureApprovalSecret, openWorkspace } from '@brand-os/brand-core'
import { approveRevision, proposeRevision } from '@brand-os/brand-core/strategy'

/**
 * SYNTHETIC ACCEPTANCE FIXTURE — NOT A REAL BRAND.
 *
 * The Runtime's synthetic demo brand (`createDemoBrand`: approved Persian facts, an approved demo logo with no
 * model_use, an approved content strategy) plus what journeys 3 and 4 need to be tested at all:
 *
 * - a restricted, approved `business.marketing.budget` fact whose value is a canary that must never reach an agent;
 * - an approved `paid_media` strategy whose restricted budget block carries a second canary;
 * - an approved `brand.motion.principles` fact (FIX-01 positive case);
 * - a draft, unapproved `brand.logo.clear_space` answer that the named logo tool must withhold.
 *
 * Everything lives in a fresh temp directory and is removed by `cleanup()`. No real brand is read.
 */

export const FIXTURE_BUDGET_FACT_CANARY = 'ACCEPTANCE-BUDGET-FACT-CANARY 7310 EUR'
export const FIXTURE_BUDGET_AMOUNT_CANARY = 7310731
export const FIXTURE_RESTRICTED_NOTE_CANARY = 'ACCEPTANCE-RESTRICTED-NOTE-CANARY'
/** An approved motion principle (synthetic), so get_motion_guidelines has an approved value to serve (FIX-01). */
export const FIXTURE_MOTION_PRINCIPLES = 'SYNTHETIC: short, calm transitions; no flashing'
/** A DRAFT (never approved) logo clear-space answer: get_logo_rules must not serve it (FIX-01). */
export const FIXTURE_DRAFT_LOGO_CANARY = 'ACCEPTANCE-DRAFT-LOGO-CANARY clear space 3x'

export interface AcceptanceFixture extends DemoBrand {
  /** Strings that must never appear in any agent-visible output. */
  canaries: string[]
}

export function createAcceptanceFixture(): AcceptanceFixture {
  const demo = createDemoBrand()
  try {
    const proof = ensureApprovalSecret(demo.root)
    const recorded = demo.engine.changeAnswer('business.marketing.budget', FIXTURE_BUDGET_FACT_CANARY)
    if (recorded.kind !== 'recorded') throw new Error(`fixture budget fact was not recorded (${recorded.kind})`)
    const approved = demo.engine.approve('business.marketing.budget', 'owner', proof)
    if (approved.kind !== 'recorded') throw new Error(`fixture budget fact was not approved (${approved.kind})`)

    const motion = demo.engine.changeAnswer('brand.motion.principles', FIXTURE_MOTION_PRINCIPLES)
    if (motion.kind !== 'recorded' || demo.engine.approve('brand.motion.principles', 'owner', proof).kind !== 'recorded') throw new Error('fixture motion fact was not approved')
    const draft = demo.engine.changeAnswer('brand.logo.clear_space', FIXTURE_DRAFT_LOGO_CANARY)
    if (draft.kind !== 'recorded') throw new Error(`fixture draft logo answer was not recorded (${draft.kind})`)

    const ws = openWorkspace(demo.root, { now: () => DEMO_NOW })
    const revision = proposeRevision(ws, { strategy_id: 'paid-acceptance', proposal: paidProposal() }).revision
    approveRevision(ws, { strategy_id: 'paid-acceptance', revision: revision.revision, expected_sha256: revision.content_sha256, proof })
    return { ...demo, canaries: [FIXTURE_BUDGET_FACT_CANARY, String(FIXTURE_BUDGET_AMOUNT_CANARY), FIXTURE_RESTRICTED_NOTE_CANARY, FIXTURE_DRAFT_LOGO_CANARY] }
  } catch (error) {
    demo.cleanup()
    throw error
  }
}

/** A complete, approvable paid-media proposal citing two approved demo facts. Illustrative only. */
function paidProposal(): Record<string, unknown> {
  return {
    title: 'Synthetic paid social test',
    type: 'paid_media',
    locale: 'en',
    scope: { markets: ['en-US'], channel: 'paid-social', period: '2027-Q1' },
    valid_from: '2026-11-01',
    valid_until: '2030-12-31',
    review_due_at: '2030-06-30',
    objective: { statement: 'Test whether short educational posts drive trial sign-ups (synthetic).', status: 'hypothesis' },
    success_metrics: [{ id: 'trial_signups', unit: 'sign-ups', baseline: null, target: null, measurement_source: 'synthetic', status: 'needs_baseline' }],
    guardrails: ['No claim that is not an approved fact'],
    constraints: ['Execution needs separate owner authorization'],
    must_do: ['Use approved copy only'],
    must_not_do: ['Spend or publish automatically'],
    non_goals: ['Brand awareness campaigns'],
    alternatives: [
      { id: 'a', description: 'Short educational posts', assessment: 'chosen', rationale: 'Matches the approved objective.' },
      { id: 'b', description: 'Discount offers', assessment: 'rejected', rationale: 'No approved price claim.' },
    ],
    selection_rationale: 'Educational posts match the approved objective.',
    recommendations: [
      { id: 'p1', priority: 'high', action: 'Test three creative hooks for two weeks', rationale: 'Learn before scaling.', agent_kinds: ['ads'], evidence_refs: [], fact_refs: ['business.marketing.objective'] },
    ],
    fact_refs: ['business.marketing.objective', 'business.market.geography'],
    evidence_refs: [],
    assumptions: ['Demand exists (unverified)'],
    open_questions: ['Who reviews the creatives?'],
    restricted: { budget: { amount: FIXTURE_BUDGET_AMOUNT_CANARY, currency: 'EUR', period: '2027-Q1' }, notes: FIXTURE_RESTRICTED_NOTE_CANARY },
  }
}
