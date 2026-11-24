import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { AGENT_TOKEN_ENV } from '@brand-os/brand-core'
import { addCandidate, linkEvidence } from '@brand-os/brand-core/competitive'
import {
  approveWeek,
  buildContentStrategy,
  CalendarError,
  claimConflicts,
  containsClaim,
  contentCalendar,
  listWeeks,
  loadWeekRecord,
  planCalendar,
  proposeWeek,
  rejectWeek,
  reviewWeek,
  slotFactIds,
  type ContentWeekContent,
} from '@brand-os/brand-core/content-bridge'
import { approveRevision, proposeRevision, StrategyError } from '@brand-os/brand-core/strategy'
import { MESSAGE_QUOTE, wordflightSources } from './helpers/competitive.js'
import { trackedSnapshot } from './helpers/creative.js'
import { useTestKey } from './helpers/knowledge.js'
import { NOW, strategyBrand, type StrategyBrand } from './helpers/strategy.js'

/**
 * Content Bridge Slice B: the calendar planner and per-week owner approval. Cadence is respected, every slot cites a
 * source, slot text never contradicts a banned claim, text is en/fa/tr, and a draft week stays invisible.
 */
useTestKey()

const VOICE = 'Warm and plain. VOICE-CANARY never sarcastic.'
const PROMISE = 'Speak from day one. PROMISE-CANARY'
const OFFER = 'Free first lesson. OFFER-CANARY'
const HOOK_CANARY = 'DRAFT-HOOK-CANARY a short story from a learner'

function code(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof StrategyError) return error.code
    throw error
  }
  return 'no error'
}

function problems(fn: () => unknown): string[] {
  try {
    fn()
  } catch (error) {
    if (error instanceof CalendarError) return error.problems.map((p) => p.code)
    throw error
  }
  return []
}

function approveFacts(s: StrategyBrand, entries: Array<[string, string]>): void {
  for (const [id, value] of entries) {
    assert.equal(s.engine.changeAnswer(id, value).kind, 'recorded', id)
    assert.equal(s.engine.approve(id, 'owner', s.proof).kind, 'recorded', id)
  }
}

/** A brand with an approved content strategy: Instagram 3/week, a monthly newsletter, LinkedIn with no cadence. */
async function calendarBrand(): Promise<StrategyBrand & { sha: string }> {
  const s = await strategyBrand()
  approveFacts(s, [
    ['brand.verbal.voice', VOICE],
    ['brand.verbal.forbidden', 'Guaranteed fluency; Fake awards; Shame'],
    ['business.marketing.availability_claim', 'do-not-claim'],
    ['business.customer.primary_segment', 'Adult beginners learning Turkish'],
    ['brand.strategy.promise', PROMISE],
    ['business.offer.summary', OFFER],
    ['business.marketing.pillars', 'Learning stories; Product proof; Community voices'],
    ['business.marketing.channels', 'Instagram, LinkedIn and a newsletter.'],
  ])
  const sha = approveStrategy(s, { instagram: { per: 'week', target: 3 }, newsletter: { per: 'month', target: 1 } })
  return { ...s, sha }
}

function approveStrategy(s: StrategyBrand, cadence: Parameters<typeof buildContentStrategy>[1]['cadence'], extraPillar?: string): string {
  const draft = buildContentStrategy(s.ws, { lang: 'en', channels: ['instagram', 'linkedin', 'newsletter'], cadence, formats: { instagram: ['reel', 'carousel'], newsletter: ['email'] }, languages: ['en', 'fa'] })
  const block = extraPillar ? { ...draft.block, pillars: [...draft.block.pillars, { id: 'p9', name: extraPillar, fact_refs: ['business.marketing.pillars'] }] } : draft.block
  const rev = proposeRevision(s.ws, { strategy_id: 'content-main', proposal: { ...draft.proposal, content_strategy: block } }).revision
  approveRevision(s.ws, { strategy_id: 'content-main', revision: rev.revision, expected_sha256: rev.content_sha256, proof: s.proof })
  return rev.content_sha256
}

function firstWeek(s: StrategyBrand, opts: { research?: boolean } = {}): ContentWeekContent {
  return planCalendar(s.ws, { lang: 'en', from: '2026-11-23', weeks: 1, research: opts.research }).weeks[0]!.content
}

function withHook(week: ContentWeekContent, hook: string, field: 'hook' | 'angle' | 'notes' = 'hook'): ContentWeekContent {
  return { ...week, slots: week.slots.map((slot, i) => (i === 0 ? { ...slot, [field]: hook } : slot)) }
}

test('the planner respects cadence, cites a source in every slot, rotates pillars and languages, and writes nothing', async () => {
  const s = await calendarBrand()
  const before = trackedSnapshot(s.root)
  const plan = planCalendar(s.ws, { lang: 'en', from: '2026-11-25', weeks: 4 })
  assert.deepEqual(trackedSnapshot(s.root), before)
  assert.ok(!fs.existsSync(path.join(s.root, 'brand/.private/content')), 'planning stores nothing')
  assert.match(plan.notes[0]!, /2026-11-25 was moved to the Monday 2026-11-23/)
  assert.deepEqual(plan.weeks.map((w) => w.content.week_id), ['wk-2026-11-23', 'wk-2026-11-30', 'wk-2026-12-07', 'wk-2026-12-14'])
  assert.deepEqual(plan.strategy, { strategy_id: 'content-main', revision: 1, content_sha256: s.sha, status: 'current' })

  const all = plan.weeks.flatMap((w) => w.content.slots)
  for (const week of plan.weeks) {
    const c = week.content
    assert.equal(c.slots.filter((slot) => slot.channel === 'instagram').length, 3, `${c.week_id}: 3/week`)
    assert.equal(new Set(c.slots.filter((slot) => slot.channel === 'instagram').map((slot) => slot.date)).size, 3, 'spread over the week')
    assert.equal(c.slots.filter((slot) => slot.channel === 'linkedin').length, 0, 'a null cadence gives no slots')
    assert.ok(c.gaps.some((gap) => gap.channel === 'linkedin' && gap.reason === 'cadence_not_decided'))
    assert.match(week.gaps.find((line) => line.startsWith('linkedin'))!, /cadence is not decided/)
    assert.deepEqual(c.strategy, { strategy_id: 'content-main', revision: 1, content_sha256: s.sha })
    const pinned = new Set(c.fact_refs.map((ref) => ref.id))
    for (const slot of c.slots) {
      assert.ok(slotFactIds(slot).length > 0, `${slot.id} cites a fact`)
      for (const id of slotFactIds(slot)) assert.ok(pinned.has(id), `${slot.id} ${id} is pinned`)
      assert.ok(slot.date >= c.week_start && slot.date <= c.week_end)
      assert.equal(slot.hook, null, 'the planner writes no copy')
      assert.equal(slot.angle, null)
      assert.equal(slot.status, 'planned')
    }
  }
  assert.equal(all.filter((slot) => slot.channel === 'newsletter').length, 1, '1/month: one newsletter in these four weeks')
  assert.equal(all.find((slot) => slot.channel === 'newsletter')!.date, '2026-12-01')
  assert.deepEqual([...new Set(all.filter((slot) => slot.channel === 'instagram').map((slot) => slot.pillar))].sort(), ['p1', 'p2', 'p3'])
  assert.deepEqual([...new Set(all.map((slot) => slot.language))].sort(), ['en', 'fa'])
  assert.ok(all.every((slot) => slot.channel !== 'instagram' || ['reel', 'carousel'].includes(slot.format!)))
  assert.ok(all.some((slot) => slot.key_message === 'brand.strategy.promise') && all.some((slot) => slot.offer === 'business.offer.summary'), 'messaging and offers rotate')
  const raw = JSON.stringify(plan)
  for (const value of [VOICE, PROMISE, OFFER, 'Guaranteed fluency']) assert.ok(!raw.includes(value), `${value} is cited, never copied`)
  assert.deepEqual(planCalendar(s.ws, { lang: 'en', from: '2026-11-25', weeks: 4 }), plan, 'deterministic')
  // Week N+1 continues the rotation of week N.
  assert.deepEqual(planCalendar(s.ws, { lang: 'en', from: '2026-11-30', weeks: 1 }).weeks[0]!.content, plan.weeks[1]!.content)
  // Persian and Turkish text.
  assert.match(planCalendar(s.ws, { lang: 'fa', from: '2026-11-23', weeks: 1 }).weeks[0]!.gaps.join(' '), /تناوب انتشار/)
  assert.match(planCalendar(s.ws, { lang: 'tr', from: '2026-11-23', weeks: 1 }).weeks[0]!.gaps.join(' '), /yayın sıklığı/)
  // --channels: an unknown channel is a gap, not a guess.
  const only = planCalendar(s.ws, { lang: 'en', from: '2026-11-23', weeks: 1, channels: ['instagram', 'tiktok'] }).weeks[0]!.content
  assert.ok(only.slots.every((slot) => slot.channel === 'instagram'))
  assert.ok(only.gaps.some((gap) => gap.channel === 'tiktok' && gap.reason === 'channel_not_in_strategy'))
  assert.equal(code(() => planCalendar(s.ws, { lang: 'en', from: '2026-11-23', weeks: 13 })), 'invalid_input')
  assert.equal(code(() => planCalendar(s.ws, { lang: 'en', from: '2026-02-30', weeks: 1 })), 'invalid_input')
})

test('no approved strategy: nothing is planned', async () => {
  const s = await strategyBrand()
  assert.equal(code(() => planCalendar(s.ws, { lang: 'en', from: '2026-11-23', weeks: 1 })), 'refused')
})

test('a week is approved by the owner; a draft week, and a draft v2, stay invisible until approved', async () => {
  const s = await calendarBrand()
  const week = firstWeek(s)
  assert.deepEqual(contentCalendar(s.ws, { lang: 'en' }).weeks, [])
  const v1 = proposeWeek(s.ws, { week }).revision
  assert.equal(v1.revision, 1)
  const hidden = contentCalendar(s.ws, { lang: 'en' })
  assert.deepEqual(hidden.weeks, [])
  assert.deepEqual(hidden.withheld, { draft: 1 }, 'a draft is counted, never shown')
  const review = reviewWeek(s.ws, { week_id: 'wk-2026-11-23', revision: 1 })
  assert.deepEqual(review.blockers, [])
  assert.match(review.approve_with, /week approve --week wk-2026-11-23 --revision 1 --expect-sha [0-9a-f]{64}/)
  assert.equal(code(() => approveWeek(s.ws, { week_id: 'wk-2026-11-23', revision: 1, expected_sha256: v1.content_sha256, proof: 'wrong' })), 'proof')
  assert.equal(code(() => approveWeek(s.ws, { week_id: 'wk-2026-11-23', revision: 1, expected_sha256: '0'.repeat(64), proof: s.proof })), 'stale_revision')
  approveWeek(s.ws, { week_id: 'wk-2026-11-23', revision: 1, expected_sha256: v1.content_sha256, proof: s.proof })

  const view = contentCalendar(s.ws, { lang: 'en' })
  assert.equal(view.weeks.length, 1)
  const served = view.weeks[0]!
  assert.equal(served.revision, 1)
  assert.deepEqual(view.authorizes, [])
  assert.equal(view.publication_permission, false)
  assert.ok(served.slots.every((slot) => slot.status === 'approved'))
  assert.ok(served.slots.every((slot) => slot.pillar_name !== null))
  assert.ok(served.facts.some((fact) => fact.fact_id === 'brand.strategy.promise' && fact.value === PROMISE), 'values resolved at read time')
  assert.deepEqual(contentCalendar(s.ws, { lang: 'en' }).digests, view.digests, 'deterministic')
  assert.ok(contentCalendar(s.ws, { lang: 'en', channel: 'newsletter' }).weeks[0]!.slots.length === 0)
  assert.deepEqual(contentCalendar(s.ws, { lang: 'en', from: '2026-12-01' }).weeks, [])
  assert.match(contentCalendar(s.ws, { lang: 'fa' }).notice[2]!, /authorizes/)

  // v2 adds a hook. It is invisible until approved; v1 stays served.
  const v2 = proposeWeek(s.ws, { week: withHook(week, HOOK_CANARY) }).revision
  assert.equal(v2.supersedes_revision, 1)
  const during = contentCalendar(s.ws, { lang: 'en' })
  assert.equal(during.weeks[0]!.revision, 1)
  assert.deepEqual(during.withheld, { draft: 1 })
  assert.ok(!JSON.stringify(during).includes('DRAFT-HOOK-CANARY'))
  approveWeek(s.ws, { week_id: 'wk-2026-11-23', revision: 2, expected_sha256: v2.content_sha256, proof: s.proof })
  assert.ok(JSON.stringify(contentCalendar(s.ws, { lang: 'en' })).includes('DRAFT-HOOK-CANARY'))
  assert.deepEqual(loadWeekRecord(s.ws, 'wk-2026-11-23').revisions.map((r) => r.state), ['superseded', 'approved'])

  // Reject a v3; it is never served and cannot be approved later.
  const v3 = proposeWeek(s.ws, { week }).revision
  rejectWeek(s.ws, { week_id: 'wk-2026-11-23', revision: 3 })
  assert.deepEqual(problems(() => approveWeek(s.ws, { week_id: 'wk-2026-11-23', revision: 3, expected_sha256: v3.content_sha256, proof: s.proof })), ['not_draft'])
  assert.deepEqual(listWeeks(s.ws)[0]!.revisions.map((r) => r.status), ['superseded', 'current', 'rejected'])
})

test('tampering with a week or its approval stops it being served', async () => {
  const s = await calendarBrand()
  const week = firstWeek(s)
  const v1 = proposeWeek(s.ws, { week }).revision
  approveWeek(s.ws, { week_id: week.week_id, revision: 1, expected_sha256: v1.content_sha256, proof: s.proof })
  const dir = path.join(s.root, 'brand/.private/content/calendar', week.week_id)
  const recordPath = path.join(dir, 'record.json')
  const original = fs.readFileSync(recordPath, 'utf8')
  const record = JSON.parse(original)
  record.revisions[0].approval.seal = 'f'.repeat(64)
  fs.writeFileSync(recordPath, JSON.stringify(record))
  assert.deepEqual(contentCalendar(s.ws, { lang: 'en' }).withheld, { integrity_failed: 1 })
  fs.writeFileSync(recordPath, original)
  assert.equal(contentCalendar(s.ws, { lang: 'en' }).weeks.length, 1)
  const revPath = path.join(dir, 'r0001.json')
  const rev = JSON.parse(fs.readFileSync(revPath, 'utf8'))
  rev.content.slots[0].hook = 'Hand edit'
  fs.writeFileSync(revPath, JSON.stringify(rev))
  assert.deepEqual(contentCalendar(s.ws, { lang: 'en' }).withheld, { integrity_failed: 1 })
})

test('no slot may contradict a banned claim or the availability rule (en/fa/tr)', async () => {
  const s = await calendarBrand()
  const week = firstWeek(s)
  assert.deepEqual(problems(() => proposeWeek(s.ws, { week: withHook(week, 'Fluency guaranteed in 30 days!') })), ['banned_claim'])
  assert.deepEqual(problems(() => proposeWeek(s.ws, { week: withHook(week, 'We won fake awards', 'angle') })), ['banned_claim'])
  assert.deepEqual(problems(() => proposeWeek(s.ws, { week: withHook(week, 'Available now on iOS', 'notes') })), ['availability_claim'])
  assert.deepEqual(problems(() => proposeWeek(s.ws, { week: withHook(week, 'اپلیکیشن هم‌اکنون در دسترس است') })), ['availability_claim'])
  assert.deepEqual(problems(() => proposeWeek(s.ws, { week: withHook(week, 'Uygulama şimdi mevcut') })), ['availability_claim'])
  const error = (() => {
    try {
      proposeWeek(s.ws, { week: withHook(week, 'Fluency guaranteed'), lang: 'fa' })
    } catch (e) {
      return e as CalendarError
    }
    return null
  })()
  assert.ok(error instanceof CalendarError)
  assert.ok(!fs.existsSync(path.join(s.root, 'brand/.private/content/calendar')), 'a refused week writes nothing')
  // A clean hook, and "coming soon" under do-not-claim, are fine.
  assert.equal(proposeWeek(s.ws, { week: withHook(week, 'Coming soon: a story from a learner') }).revision.revision, 1)
  // Helpers.
  assert.ok(containsClaim('Guaranteed FLUENCY.', 'Guaranteed fluency'))
  assert.ok(!containsClaim('Fluency takes practice', 'Guaranteed fluency'))
  assert.deepEqual(claimConflicts('hook', 'Out now', [], 'coming-soon').map((c) => c.kind), ['availability'])
  assert.deepEqual(claimConflicts('hook', 'Coming soon', [], 'coming-soon'), [])
  assert.deepEqual(claimConflicts('hook', 'Available now', [], 'available'), [])
})

test('slots must serve the approved strategy: unknown format, pillar, fact or channel is refused', async () => {
  const s = await calendarBrand()
  const week = firstWeek(s)
  const edit = (patch: Record<string, unknown>) => ({ ...week, slots: week.slots.map((slot, i) => (i === 0 ? { ...slot, ...patch } : slot)) })
  assert.deepEqual(problems(() => proposeWeek(s.ws, { week: edit({ format: 'live' }) })), ['format_not_in_channel'])
  assert.deepEqual(problems(() => proposeWeek(s.ws, { week: edit({ pillar: 'p7' }) })), ['pillar_unknown'])
  assert.deepEqual(problems(() => proposeWeek(s.ws, { week: edit({ channel: 'tiktok' }) })), ['channel_not_in_strategy'])
  assert.deepEqual(problems(() => proposeWeek(s.ws, { week: edit({ cta: 'brand.social.cta' }) })), ['fact_not_pinned'])
  assert.deepEqual(problems(() => proposeWeek(s.ws, { week: edit({ fact_refs: [], objective: [], key_message: null, offer: null, cta: null }) })), ['slot_no_source'])
  assert.equal(code(() => proposeWeek(s.ws, { week: { ...week, extra: 1 } })), 'invalid_input', 'unknown keys are refused')
  assert.equal(code(() => proposeWeek(s.ws, { week: edit({ date: '2026-12-01' }) })), 'invalid_input', 'a slot stays inside its week')
  // A fact the strategy does not cite, even if approved and pinned, is refused.
  approveFacts(s, [['brand.social.cta', 'Try a free lesson']])
  const ctaRev = planCalendar(s.ws, { lang: 'en', from: '2026-11-23', weeks: 1 }).weeks[0]!.content
  assert.ok(!ctaRev.fact_refs.some((ref) => ref.id === 'brand.social.cta'), 'the planner only cites facts the strategy cites')
})

test('a new strategy revision, or a changed fact, puts an approved week in needs_review', async () => {
  const s = await calendarBrand()
  const week = firstWeek(s)
  const v1 = proposeWeek(s.ws, { week }).revision
  approveWeek(s.ws, { week_id: week.week_id, revision: 1, expected_sha256: v1.content_sha256, proof: s.proof })
  approveStrategy(s, { instagram: { per: 'week', target: 2 }, newsletter: { per: 'month', target: 1 } }, 'New pillar')
  const after = contentCalendar(s.ws, { lang: 'en' })
  assert.deepEqual(after.weeks, [])
  assert.deepEqual(after.withheld, { needs_review: 1 })
  assert.match(listWeeks(s.ws)[0]!.revisions[0]!.reasons.join(' '), /planned from content-main@1, but revision 2 is served now/)
  const replanned = firstWeek(s)
  assert.equal(replanned.strategy.revision, 2)
  assert.equal(replanned.slots.filter((slot) => slot.channel === 'instagram').length, 2, 'the new cadence')
  const v2 = proposeWeek(s.ws, { week: replanned }).revision
  approveWeek(s.ws, { week_id: week.week_id, revision: 2, expected_sha256: v2.content_sha256, proof: s.proof })
  assert.equal(contentCalendar(s.ws, { lang: 'en' }).weeks[0]!.revision, 2)
  // A cited fact changes: the strategy is no longer served, so the week is not either.
  const change = s.engine.requestChange('brand.strategy.promise', 'Speak from week one')
  assert.equal(s.engine.approveChange(change.id, s.proof, change.expected_version).kind, 'recorded')
  assert.deepEqual(contentCalendar(s.ws, { lang: 'en' }).weeks, [])
  assert.deepEqual(problems(() => proposeWeek(s.ws, { week: replanned })), ['strategy_not_served', 'fact_changed'])
})

test('optional research angles cite competitive observations with confidence, never their text', async () => {
  const s = await calendarBrand()
  const none = firstWeek(s, { research: true })
  assert.ok(none.gaps.some((gap) => gap.reason === 'no_research'))
  assert.ok(none.slots.every((slot) => slot.research === null))
  const { home } = wordflightSources(s.ws, NOW)
  const wf = addCandidate(s.ws, { display_name: 'WordFlight', relationship: 'direct', geography: 'international', markets: 'US', domain: 'wordflight-app.com' }).competitor_id
  linkEvidence(s.ws, { competitor_id: wf, note: home.note_id, claim_key: 'wordflight.message.five_minutes', dimension: 'public_message', label: 'Five minutes a day' })
  const week = firstWeek(s, { research: true })
  const angles = week.slots.map((slot) => slot.research).filter((r) => r !== null)
  assert.equal(angles.length, week.slots.length)
  assert.equal(angles[0]!.competitor_id, wf)
  assert.ok(['high', 'medium', 'low'].includes(angles[0]!.confidence))
  assert.deepEqual(week.research_refs, [angles[0]!.ref])
  assert.ok(!JSON.stringify(week).includes(MESSAGE_QUOTE), 'the quote stays in the research note')
  assert.deepEqual(firstWeek(s).research_refs, [], 'research is opt-in')
  const v1 = proposeWeek(s.ws, { week }).revision
  approveWeek(s.ws, { week_id: week.week_id, revision: 1, expected_sha256: v1.content_sha256, proof: s.proof })
  assert.equal(contentCalendar(s.ws, { lang: 'en' }).weeks.length, 1)
})

test('the calendar is owner-only', async () => {
  const s = await calendarBrand()
  process.env[AGENT_TOKEN_ENV] = 'bos_agent_test'
  try {
    assert.equal(code(() => contentCalendar(s.ws, { lang: 'en' })), 'refused')
    assert.equal(code(() => proposeWeek(s.ws, { week: {} })), 'refused')
    assert.equal(code(() => planCalendar(s.ws, { lang: 'en', from: '2026-11-23', weeks: 1 })), 'refused')
  } finally {
    delete process.env[AGENT_TOKEN_ENV]
  }
})
