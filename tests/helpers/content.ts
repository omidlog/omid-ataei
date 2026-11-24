import assert from 'node:assert/strict'
import { approveWeek, buildContentStrategy, planCalendar, proposeWeek, type ContentWeekContent } from '@brand-os/brand-core/content-bridge'
import { approveRevision, proposeRevision } from '@brand-os/brand-core/strategy'
import { strategyBrand, type StrategyBrand } from './strategy.js'

/** Canaries for the content agent tests: values that are approved (shown resolved) and values that must never leak. */
export const VOICE = 'Warm and plain. VOICE-CANARY never sarcastic.'
export const PROMISE = 'Speak from day one. PROMISE-CANARY'
export const OFFER = 'Free first lesson. OFFER-CANARY'
export const AUDIENCE = 'Adult beginners learning Turkish'
export const BUDGET_FACT_CANARY = 'BUDGET-FACT-CANARY 4400 EUR a month'

export function approveFacts(s: StrategyBrand, entries: Array<[string, string]>): void {
  for (const [id, value] of entries) {
    assert.equal(s.engine.changeAnswer(id, value).kind, 'recorded', id)
    assert.equal(s.engine.approve(id, 'owner', s.proof).kind, 'recorded', id)
  }
}

export interface ContentBrand extends StrategyBrand {
  strategySha: string
}

/**
 * A temp brand with an approved content strategy (Instagram 3/week reel+carousel, a monthly newsletter, LinkedIn
 * without cadence; en and fa) and an approved restricted budget fact that must never reach an agent.
 */
export async function contentBrand(slug = 'pilito'): Promise<ContentBrand> {
  const s = await strategyBrand(slug)
  approveFacts(s, [
    ['brand.verbal.voice', VOICE],
    ['brand.verbal.forbidden', 'Guaranteed fluency; Fake awards; Shame'],
    ['business.marketing.availability_claim', 'do-not-claim'],
    ['business.customer.primary_segment', AUDIENCE],
    ['brand.strategy.promise', PROMISE],
    ['business.offer.summary', OFFER],
    ['business.marketing.pillars', 'Learning stories; Product proof; Community voices'],
    ['business.marketing.channels', 'Instagram, LinkedIn and a newsletter.'],
    ['business.marketing.budget', BUDGET_FACT_CANARY],
  ])
  const draft = buildContentStrategy(s.ws, {
    lang: 'en',
    channels: ['instagram', 'linkedin', 'newsletter'],
    cadence: { instagram: { per: 'week', target: 3 }, newsletter: { per: 'month', target: 1 } },
    formats: { instagram: ['reel', 'carousel'], newsletter: ['email'] },
    languages: ['en', 'fa'],
  })
  const rev = proposeRevision(s.ws, { strategy_id: 'content-main', proposal: { ...draft.proposal, content_strategy: draft.block } }).revision
  approveRevision(s.ws, { strategy_id: 'content-main', revision: rev.revision, expected_sha256: rev.content_sha256, proof: s.proof })
  return { ...s, strategySha: rev.content_sha256 }
}

/** The planner's week (offline, deterministic). */
export function plannedWeek(s: StrategyBrand, from: string, opts: { research?: boolean } = {}): ContentWeekContent {
  return planCalendar(s.ws, { lang: 'en', from, weeks: 1, research: opts.research }).weeks[0]!.content
}

/** Stores a week as a draft and approves it with the owner proof. Returns the approved revision and hash. */
export function approvedWeek(s: StrategyBrand, week: ContentWeekContent): { revision: number; sha: string } {
  const rev = proposeWeek(s.ws, { week }).revision
  approveWeek(s.ws, { week_id: week.week_id, revision: rev.revision, expected_sha256: rev.content_sha256, proof: s.proof })
  return { revision: rev.revision, sha: rev.content_sha256 }
}
