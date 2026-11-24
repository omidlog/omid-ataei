import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { agentTokenContext } from '@brand-os/brand-core'
import { buildContentStrategy, contentStrategyView, detectChannels, isPlaceholderValue, parseCadence, splitItems } from '@brand-os/brand-core/content-bridge'
import { approveRevision, evaluate, loadRecord, parseProposal, proposeRevision, reviewRevision, runStrategyTool, StrategyError } from '@brand-os/brand-core/strategy'
import { trackedSnapshot } from './helpers/creative.js'
import { useTestKey } from './helpers/knowledge.js'
import { NOW, seoProposal, strategyBrand, type StrategyBrand } from './helpers/strategy.js'

/**
 * Content Bridge Slice A: the `content` strategy type, the proposer that derives it from approved facts with honest
 * gaps, and the owner's voice rules projection (approved v1 visible, draft v2 invisible until approved).
 */
useTestKey()

const VOICE = 'Warm and plain. VOICE-CANARY never sarcastic.'
const PAIRS = 'Say what happened and what to do next | Blame the learner; Use the learner’s words | Use internal jargon'
const FORBIDDEN = 'Guaranteed fluency; Fake awards; Shame'
const PILLARS = 'Learning stories; Product proof; Community voices'
const CHANNELS = 'Instagram and LinkedIn. No paid social, not TikTok.'
const SEGMENT = 'Adult beginners learning Turkish'
const PROMISE = 'Speak from day one'
const DRAFT_CANARY = 'DRAFT-PILLAR-CANARY'

function code(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof StrategyError) return error.code
    throw error
  }
  return 'no error'
}

function approveFacts(s: StrategyBrand, entries: Array<[string, string]>): void {
  for (const [id, value] of entries) {
    assert.equal(s.engine.changeAnswer(id, value).kind, 'recorded', id)
    assert.equal(s.engine.approve(id, 'owner', s.proof).kind, 'recorded', id)
  }
}

async function contentBrand(): Promise<StrategyBrand> {
  const s = await strategyBrand()
  approveFacts(s, [
    ['brand.personality.traits', 'Warm, precise, encouraging'],
    ['brand.verbal.voice', VOICE],
    ['brand.verbal.voice_pairs', PAIRS],
    ['brand.verbal.forbidden', FORBIDDEN],
    ['business.marketing.availability_claim', 'do-not-claim'],
    ['business.customer.primary_segment', SEGMENT],
    ['brand.strategy.promise', PROMISE],
    ['business.marketing.pillars', PILLARS],
    ['business.marketing.channels', CHANNELS],
  ])
  return s
}

function approve(s: StrategyBrand, id: string, revision: number, sha: string) {
  return approveRevision(s.ws, { strategy_id: id, revision, expected_sha256: sha, proof: s.proof })
}

test('missing facts are explicit gaps; nothing is invented and nothing is written', async () => {
  const s = await strategyBrand()
  const before = trackedSnapshot(s.root)
  const draft = buildContentStrategy(s.ws, { lang: 'en' })
  assert.deepEqual(trackedSnapshot(s.root), before)
  assert.ok(!fs.existsSync(path.join(s.root, 'brand/.private/strategy/records')), 'building a proposal stores nothing')
  const fields = draft.gaps.map((gap) => `${gap.field}:${gap.reason}`)
  for (const role of ['voice', 'claims', 'audience', 'messaging', 'pillars', 'channels', 'offers', 'cta', 'languages']) assert.ok(fields.includes(`${role}:not_approved`), role)
  assert.ok(!fields.includes('objective:not_approved'), 'business.marketing.objective is approved in the fixture')
  assert.ok(fields.includes('channels:owner_decision'))
  assert.match(draft.gaps.find((gap) => gap.field === 'channels' && gap.reason === 'owner_decision')!.text, /approve business\.marketing\.channels, brand\.social\.channels with/)
  assert.deepEqual(draft.block.pillars, [])
  assert.deepEqual(draft.block.channels, [])
  assert.deepEqual(draft.block.voice_rules, { do: [], dont: [] }, 'the proposer never writes voice')
  assert.deepEqual(draft.proposal.fact_refs, ['business.marketing.objective'])
  const voiceGap = draft.gaps.find((gap) => gap.field === 'voice')!
  assert.match(voiceGap.text, /No approved fact covers voice\. Answer brand\.verbal\.voice/)
  assert.ok(voiceGap.fact_ids.includes('brand.verbal.voice_pairs'))
  // Persian and Turkish gap text.
  assert.match(buildContentStrategy(s.ws, { lang: 'fa' }).gaps.find((gap) => gap.field === 'voice')!.text, /هیچ واقعیت تأییدشده‌ای/)
  assert.match(buildContentStrategy(s.ws, { lang: 'tr' }).gaps.find((gap) => gap.field === 'voice')!.text, /onaylı bir bilgi yok/)
  // Even a gap-only proposal is a valid draft the owner can store.
  const stored = proposeRevision(s.ws, { strategy_id: 'content-main', proposal: draft.proposal })
  assert.equal(stored.revision.content.type, 'content')
  assert.equal(stored.revision.content.content_strategy!.gaps.length, draft.gaps.length, 'gaps stay in the revision')
})

test('placeholder facts are gaps, restricted facts are never cited, and the budget never appears', async () => {
  const s = await strategyBrand()
  approveFacts(s, [
    ['business.marketing.pillars', 'TBD — no pillar approved'],
    ['business.marketing.channels', 'None yet.'],
    ['business.marketing.budget', 'Unknown. No approved spend. BUDGET-FACT-CANARY'],
  ])
  const draft = buildContentStrategy(s.ws, { lang: 'en' })
  const pillarGap = draft.gaps.find((gap) => gap.field === 'pillars')!
  assert.equal(pillarGap.reason, 'placeholder')
  assert.deepEqual(pillarGap.fact_ids, ['business.marketing.pillars'])
  assert.equal(draft.gaps.find((gap) => gap.field === 'channels' && gap.reason !== 'owner_decision')!.reason, 'placeholder')
  assert.deepEqual(draft.block.pillars, [])
  assert.ok(!JSON.stringify(draft).includes('business.marketing.budget'))
  assert.ok(!JSON.stringify(draft).includes('BUDGET-FACT-CANARY'))
  // A hand-written content proposal that cites a restricted fact is refused.
  const proposal = { ...draft.proposal, fact_refs: [...(draft.proposal.fact_refs as string[]), 'business.marketing.budget'] }
  assert.equal(code(() => proposeRevision(s.ws, { strategy_id: 'content-main', proposal })), 'refused')
})

test('helpers: list splitting, placeholder detection, channel detection skips negated clauses, cadence parsing', () => {
  assert.deepEqual(splitItems('1. Learning stories\n2. Product proof\n- Community'), ['Learning stories', 'Product proof', 'Community'])
  assert.deepEqual(splitItems('Stories, proof, community'), ['Stories', 'proof', 'community'])
  for (const value of ['TBD', 'none yet', 'Unknown.', 'نامشخص', 'Henüz yok', '']) assert.ok(isPlaceholderValue(value), value)
  for (const value of ['do-not-claim', 'No paid social', 'Learning stories']) assert.ok(!isPlaceholderValue(value), value)
  assert.deepEqual(detectChannels(CHANNELS), ['instagram', 'linkedin'])
  assert.deepEqual(detectChannels('Instagram now, YouTube later. Newsletter monthly.'), ['instagram', 'newsletter'])
  assert.deepEqual(detectChannels('اینستاگرام و لینکدین؛ بدون تیک‌تاک'), ['instagram', 'linkedin'])
  assert.deepEqual(detectChannels('Instagram ve LinkedIn, TikTok değil'), ['instagram', 'linkedin'])
  assert.deepEqual(parseCadence('instagram=3/week,newsletter=1/month'), { instagram: { per: 'week', target: 3 }, newsletter: { per: 'month', target: 1 } })
  assert.equal(code(() => parseCadence('instagram=often')), 'invalid_input')
  assert.equal(code(() => parseCadence('instagram=0/week')), 'invalid_input')
})

test('approved facts become cited sources: pillars from the fact, detected channels, voice cited and not copied', async () => {
  const s = await contentBrand()
  const draft = buildContentStrategy(s.ws, { lang: 'en', cadence: { instagram: { per: 'week', target: 3 } }, formats: { instagram: ['reel', 'carousel'] } })
  assert.deepEqual(
    draft.block.pillars.map((p) => [p.id, p.name, p.fact_refs]),
    [
      ['p1', 'Learning stories', ['business.marketing.pillars']],
      ['p2', 'Product proof', ['business.marketing.pillars']],
      ['p3', 'Community voices', ['business.marketing.pillars']],
    ],
  )
  assert.deepEqual(draft.detected_channels, ['instagram', 'linkedin'], 'TikTok and paid social were negated')
  const instagram = draft.block.channels.find((c) => c.channel === 'instagram')!
  assert.deepEqual(instagram.cadence, { per: 'week', target: 3 })
  assert.deepEqual(instagram.formats, ['reel', 'carousel'])
  const linkedin = draft.block.channels.find((c) => c.channel === 'linkedin')!
  assert.equal(linkedin.cadence, null, 'cadence is never guessed')
  const fields = draft.gaps.map((gap) => gap.field)
  assert.ok(fields.includes('channels[linkedin].cadence') && fields.includes('channels[linkedin].formats') && fields.includes('channels[instagram].role'))
  assert.ok(!fields.includes('channels[instagram].cadence'))
  for (const role of ['voice', 'claims', 'audience', 'messaging', 'pillars', 'channels']) assert.ok(!draft.gaps.some((gap) => gap.field === role), role)
  assert.deepEqual(draft.block.sources.voice.sort(), ['brand.personality.traits', 'brand.verbal.voice', 'brand.verbal.voice_pairs'])
  const raw = JSON.stringify(draft.proposal)
  for (const value of [VOICE, 'VOICE-CANARY', 'Blame the learner', SEGMENT, PROMISE, 'Guaranteed fluency']) assert.ok(!raw.includes(value), `${value} is cited, not copied`)
  assert.doesNotThrow(() => parseProposal(draft.proposal))
})

test('approved v1 is visible in the voice rules projection; v2 stays invisible until the owner approves it', async () => {
  const s = await contentBrand()
  const draft = buildContentStrategy(s.ws, { lang: 'en', channels: ['instagram'] })
  assert.deepEqual(contentStrategyView(s.ws, { lang: 'en' }), { views: [], withheld: {} })
  const v1 = proposeRevision(s.ws, { strategy_id: 'content-main', proposal: draft.proposal }).revision
  assert.deepEqual(contentStrategyView(s.ws, { lang: 'en' }), { views: [], withheld: { draft: 1 } }, 'a draft is counted, never shown')
  const review = reviewRevision(s.ws, { strategy_id: 'content-main', revision: 1 })
  assert.deepEqual(review.blockers, [])
  assert.match(review.notice[0]!, /content-read agents read it through strategy_list/)
  approve(s, 'content-main', 1, v1.content_sha256)

  const first = contentStrategyView(s.ws, { lang: 'en' })
  assert.equal(first.views.length, 1)
  const view = first.views[0]!
  assert.equal(view.revision, 1)
  assert.equal(view.status, 'current')
  assert.deepEqual(view.authorizes, [])
  assert.equal(view.publication_permission, false)
  assert.equal(view.voice.sources.find((src) => src.fact_id === 'brand.verbal.voice')!.value, VOICE, 'voice resolved from the approved fact')
  assert.deepEqual(view.voice.do.map((rule) => rule.text), ['Say what happened and what to do next', 'Use the learner’s words'])
  assert.deepEqual(view.voice.dont.map((rule) => [rule.text, rule.source]), [
    ['Blame the learner', 'brand.verbal.voice_pairs'],
    ['Use internal jargon', 'brand.verbal.voice_pairs'],
  ])
  assert.deepEqual(view.claims.banned.map((rule) => rule.text), ['Guaranteed fluency', 'Fake awards', 'Shame'])
  assert.equal(view.claims.availability, 'do-not-claim')
  assert.equal(view.claims.availability_rule, 'Do not say or imply that the product is available.')
  assert.equal(view.audience[0]!.value, SEGMENT)
  assert.ok(view.gaps.some((gap) => gap.field === 'channels[instagram].cadence'), 'gaps stay visible after approval')
  assert.deepEqual(contentStrategyView(s.ws, { lang: 'en' }).views[0]!.digests, view.digests, 'deterministic')
  assert.match(contentStrategyView(s.ws, { lang: 'fa' }).views[0]!.claims.availability_rule!, /در دسترس/)

  // v2 adds a canary pillar. It is not visible until approved; v1 stays served.
  const block = { ...draft.block, pillars: [...draft.block.pillars, { id: 'p9', name: DRAFT_CANARY, fact_refs: ['business.marketing.pillars'] }] }
  const v2 = proposeRevision(s.ws, { strategy_id: 'content-main', proposal: { ...draft.proposal, content_strategy: block } }).revision
  assert.equal(v2.supersedes_revision, 1)
  const during = contentStrategyView(s.ws, { lang: 'en' })
  assert.equal(during.views[0]!.revision, 1)
  assert.deepEqual(during.withheld, { draft: 1 })
  assert.ok(!JSON.stringify(during).includes(DRAFT_CANARY))
  assert.ok(reviewRevision(s.ws, { strategy_id: 'content-main', revision: 2 }).diff.some((d) => d.path === 'content_strategy.pillars[p9].name'))
  approve(s, 'content-main', 2, v2.content_sha256)
  const after = contentStrategyView(s.ws, { lang: 'en' })
  assert.equal(after.views[0]!.revision, 2)
  assert.equal(after.views[0]!.supersedes_revision, 1)
  assert.ok(after.views[0]!.pillars.some((p) => p.name === DRAFT_CANARY))
  assert.deepEqual(loadRecord(s.ws, 'content-main').revisions.map((r) => r.state), ['superseded', 'approved'])

  // A cited voice fact changes: the strategy needs review and is not served.
  const change = s.engine.requestChange('brand.verbal.voice', 'Formal and distant')
  assert.equal(s.engine.approveChange(change.id, s.proof, change.expected_version).kind, 'recorded')
  const stale = contentStrategyView(s.ws, { lang: 'en' })
  assert.deepEqual(stale, { views: [], withheld: { needs_review: 1 } })
})

test('no agent reads a content strategy in Slice A; other types cannot carry the block; old hashes are unchanged', async () => {
  const s = await contentBrand()
  const draft = buildContentStrategy(s.ws, { lang: 'en' })
  const v1 = proposeRevision(s.ws, { strategy_id: 'content-main', proposal: draft.proposal }).revision
  approve(s, 'content-main', 1, v1.content_sha256)
  for (const profile of ['strategy-seo-read', 'strategy-ads-read'] as const) {
    const ctx = agentTokenContext('pilito', 'agt_x', profile)
    const list = runStrategyTool(s.root, 'pilito', ctx, 'strategy_list', {}, NOW)
    assert.deepEqual(list.data, { strategies: [], withheld: {} }, profile)
    assert.equal(runStrategyTool(s.root, 'pilito', ctx, 'strategy_get', { strategy_id: 'content-main' }, NOW).status, 'not_found')
  }
  process.env.BRAND_OS_AGENT_TOKEN = 'bos_at_x'
  try {
    assert.equal(code(() => contentStrategyView(s.ws, { lang: 'en' })), 'refused', 'owner process only')
    assert.equal(code(() => buildContentStrategy(s.ws, { lang: 'en' })), 'refused')
  } finally {
    delete process.env.BRAND_OS_AGENT_TOKEN
  }
  assert.equal(code(() => parseProposal(seoProposal(s.research, { content_strategy: draft.block }))), 'invalid_input')
  const { content_strategy: _block, ...noBlock } = draft.proposal
  void _block
  assert.equal(code(() => parseProposal(noBlock)), 'invalid_input')
  const unknownKey = { ...draft.proposal, content_strategy: { ...draft.block, publish: true } }
  assert.equal(code(() => parseProposal(unknownKey)), 'invalid_input')
  const outside = { ...draft.proposal, fact_refs: ['business.marketing.objective'] }
  assert.equal(code(() => proposeRevision(s.ws, { strategy_id: 'content-x', proposal: outside })), 'invalid_input', 'block facts must be in fact_refs')
  const seo = proposeRevision(s.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(s.research) }).revision
  assert.ok(!('content_strategy' in seo.content), 'non-content revisions carry no new key, so their hash is unchanged')
})

test('a cited SEO strategy is pinned; replacing it puts the content strategy in needs_review', async () => {
  const s = await contentBrand()
  const seo1 = proposeRevision(s.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(s.research) }).revision
  approve(s, 'seo-discovery', 1, seo1.content_sha256)
  const draft = buildContentStrategy(s.ws, { lang: 'en' })
  assert.deepEqual(draft.block.strategy_refs, [{ strategy_id: 'seo-discovery', revision: 1, content_sha256: seo1.content_sha256 }])
  const c1 = proposeRevision(s.ws, { strategy_id: 'content-main', proposal: draft.proposal }).revision
  approve(s, 'content-main', 1, c1.content_sha256)
  assert.equal(contentStrategyView(s.ws, { lang: 'en' }).views[0]!.strategy_refs[0]!.strategy_id, 'seo-discovery')
  const seo2 = proposeRevision(s.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(s.research, { review_due_at: '2027-02-28' }) }).revision
  approve(s, 'seo-discovery', 2, seo2.content_sha256)
  const record = loadRecord(s.ws, 'content-main')
  const result = evaluate(s.ws, record, record.revisions[0]!, NOW)
  assert.equal(result.status, 'needs_review')
  assert.ok(result.reasons.some((r) => r.includes('strategy seo-discovery@1 is changed')))
  // A stale pin cannot be proposed again.
  assert.equal(code(() => proposeRevision(s.ws, { strategy_id: 'content-main', proposal: draft.proposal })), 'stale_source')
})
