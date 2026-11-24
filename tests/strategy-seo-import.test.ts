import assert from 'node:assert/strict'
import { test } from 'node:test'
import { InterviewEngine } from '@brand-os/brand-core'
import { replayAdapter } from '@brand-os/brand-core/research'
import { draftSeoStrategy } from '@brand-os/brand-core/seo'
import { proposalFromSeoDraft, proposeRevision, StrategyError } from '@brand-os/brand-core/strategy'
import { useTestKey } from './helpers/knowledge.js'
import { answerAll, officialBundle, WEBSITE } from './helpers/seo.js'
import { strategyBrand } from './helpers/strategy.js'

/** Sprint 2 SEO draft -> Sprint 3 strategy proposal: citations carried as pinned refs, no quotes, critic re-run. */
useTestKey()

test('an SEO strategist draft becomes an editable proposal citing the same pinned research notes', async () => {
  const s = await strategyBrand('ledger')
  answerAll(s.ws, WEBSITE)
  const { plan } = draftSeoStrategy(s.ws, new InterviewEngine(s.root), { adapter: replayAdapter(officialBundle()), save: false })
  const imported = proposalFromSeoDraft(s.ws, { plan })
  assert.equal(imported.critic.verdict, 'pass')
  const proposal = imported.proposal as { recommendations: Array<{ evidence_refs: string[] }>; origin: { kind: string; plan_id: string }; type: string }
  assert.equal(proposal.type, 'seo')
  assert.deepEqual([proposal.origin.kind, proposal.origin.plan_id], ['seo_draft', plan.plan_id])
  assert.ok(proposal.recommendations.length > 0)
  assert.ok(proposal.recommendations.some((rec) => rec.evidence_refs.length > 0), 'cited decisions keep their sources')
  for (const ref of proposal.recommendations.flatMap((rec) => rec.evidence_refs)) assert.match(ref, /^knowledge:kn_[a-z0-9-]+@[0-9a-f]{64}$/)
  // No research quote is copied into the proposal.
  const json = JSON.stringify(imported.proposal)
  const quotes = plan.sources.flatMap((source) => source.quotes.map((item) => item.quote)).filter((quote) => quote.length > 30)
  assert.ok(quotes.length > 0, 'the plan quotes its sources')
  for (const quote of quotes) assert.ok(!json.includes(quote), 'quote not copied')

  const { revision } = proposeRevision(s.ws, { strategy_id: 'seo-from-draft', proposal: imported.proposal })
  assert.deepEqual(revision.content.origin, { kind: 'seo_draft', plan_id: plan.plan_id, strategist: plan.strategist })
  assert.ok(revision.content.evidence_refs.length > 0)
})

test('a draft of another brand, a non-draft file and a draft the critic blocks are refused', async () => {
  const s = await strategyBrand('ledger')
  answerAll(s.ws, WEBSITE)
  const { plan } = draftSeoStrategy(s.ws, null, { adapter: replayAdapter(officialBundle()), save: false })
  const refused = (raw: unknown): string => {
    try {
      proposalFromSeoDraft(s.ws, raw)
    } catch (error) {
      if (error instanceof StrategyError) return error.code
      throw error
    }
    return 'no error'
  }
  assert.equal(refused({ plan: { ...plan, brand_slug: 'other-brand' } }), 'wrong_brand')
  assert.equal(refused({ hello: 'world' }), 'invalid_input')
  const forged = { ...plan, markdown: plan.markdown.replace('## Measurement', 'Google requires 2,000 words per page and rewards daily updates.\n\n## Measurement') }
  assert.equal(refused({ plan: forged }), 'refused')
})
