import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { accessLogPath, agentTokenContext, guestContext, issueAgentToken, operatorContext, readAccessLog, type AuthContext } from '@brand-os/brand-core'
import { addCandidate, linkEvidence } from '@brand-os/brand-core/competitive'
import {
  approvedWeekEntry,
  approveWeek,
  buildBrief,
  CONTENT_BRIEF_SCHEMA,
  CONTENT_FEED_SCHEMA,
  evaluateWeek,
  listObservations,
  loadWeekRecord,
  proposeWeek,
  runContentTool,
  urlProblem,
  verifyContentDocument,
  type AgentCalendarDocument,
  type ContentBriefDocument,
  type ContentReportDocument,
  type ContentToolArgs,
  type ContentToolResult,
  type ContentWeekContent,
} from '@brand-os/brand-core/content-bridge'
import { addVariant, approvePreference, createProject, recordFeedback, suggestPreference } from '@brand-os/brand-core/creative'
import { runStrategyTool, StrategyError } from '@brand-os/brand-core/strategy'
import { MESSAGE_QUOTE, wordflightSources } from './helpers/competitive.js'
import { approvedWeek, AUDIENCE, BUDGET_FACT_CANARY, contentBrand, OFFER, plannedWeek, PROMISE, VOICE, type ContentBrand } from './helpers/content.js'
import { TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'
import { NOW } from './helpers/strategy.js'

/**
 * Content Bridge Slice C: content agents read the approved calendar through the Strategy Feed gate (content-read
 * profile), get one brief per slot, and report produced/published as observations. Drafts, needs-review weeks, other
 * profiles and other brands get nothing; restricted facts never leave; stale pins are refused; every call is logged.
 */
useTestKey()

const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')
const DRAFT_HOOK_CANARY = 'DRAFT-WEEK-CANARY a short story from a learner'
const V2_HOOK = 'V2-HOOK a learner’s first sentence'
const POST_URL = 'https://www.instagram.com/p/Cx1Ab2Cd3Ef/'

const contentCtx = (brand = 'pilito'): AuthContext => agentTokenContext(brand, 'agt_content', 'content-read')

function call(s: ContentBrand, ctx: AuthContext, tool: 'content_calendar' | 'content_brief' | 'content_report', args: ContentToolArgs = {}): ContentToolResult {
  return runContentTool(s.root, s.ws.brandSlug, ctx, tool, args, NOW)
}
const calOf = (result: ContentToolResult) => result.data as AgentCalendarDocument
const briefOf = (result: ContentToolResult) => result.data as ContentBriefDocument
const reportOf = (result: ContentToolResult) => result.data as ContentReportDocument

function never(value: unknown, label: string, extra: string[] = []): void {
  const json = JSON.stringify(value)
  for (const canary of [BUDGET_FACT_CANARY, 'business.marketing.budget', DRAFT_HOOK_CANARY, ...extra]) assert.ok(!json.includes(canary), `${label}: ${canary} must not appear`)
}

function withSlots(week: ContentWeekContent, change: (slot: ContentWeekContent['slots'][number], i: number) => ContentWeekContent['slots'][number]): ContentWeekContent {
  return { ...week, slots: week.slots.map(change) }
}

/** wk-2026-11-23 approved r1; wk-2026-11-30 stored as a draft with a canary hook. */
async function servedBrand(slug = 'pilito') {
  const s = await contentBrand(slug)
  const week = plannedWeek(s, '2026-11-23')
  const w1 = approvedWeek(s, week)
  proposeWeek(s.ws, { week: withSlots(plannedWeek(s, '2026-11-30'), (slot, i) => (i === 0 ? { ...slot, hook: DRAFT_HOOK_CANARY } : slot)) })
  return { s, week, w1 }
}

test('gate: a content-read agent sees only the approved, current week; drafts, other profiles and other brands get nothing', async () => {
  const { s, week, w1 } = await servedBrand()

  const got = call(s, contentCtx(), 'content_calendar')
  assert.equal(got.status, 'ok')
  assert.equal(got.agent_kind, 'content')
  const cal = calOf(got)
  assert.equal(cal.schema, CONTENT_FEED_SCHEMA)
  assert.deepEqual(cal.weeks.map((w) => [w.week_id, w.revision, w.status, w.digests.content_sha256]), [['wk-2026-11-23', 1, 'current', w1.sha]])
  assert.deepEqual(cal.withheld, { draft: 1 }, 'the draft week is counted, never shown')
  assert.equal(cal.weeks[0]!.slots.length, week.slots.length)
  assert.ok(cal.weeks[0]!.slots.every((slot) => slot.status === 'approved'))
  assert.deepEqual([cal.authorizes, cal.publication_permission, cal.schedule_permission, cal.spend_permission, got.authorizes], [[], false, false, false, []])
  assert.ok(verifyContentDocument(cal), 'feed_sha256 verifies')
  assert.ok(!verifyContentDocument({ ...cal, weeks: [] }), 'an altered document does not verify')
  assert.equal(JSON.stringify(calOf(call(s, contentCtx(), 'content_calendar'))), JSON.stringify(cal), 'stable: byte-identical on a second read')
  assert.ok(cal.weeks[0]!.facts.some((fact) => fact.value === PROMISE), 'cited fact values are resolved')
  never(got, 'calendar')

  // Filters, languages and bad arguments.
  const insta = calOf(call(s, contentCtx(), 'content_calendar', { channel: 'instagram', from: '2026-11-23', to: '2026-11-29' }))
  assert.equal(insta.weeks[0]!.slots.length, 3)
  assert.ok(insta.weeks[0]!.slots.every((slot) => slot.channel === 'instagram'))
  assert.deepEqual(calOf(call(s, contentCtx(), 'content_calendar', { from: '2026-12-01' })).weeks, [])
  assert.match(calOf(call(s, contentCtx(), 'content_calendar', { lang: 'fa' })).notice[1]!, /authorizes/)
  assert.match(calOf(call(s, contentCtx(), 'content_calendar', { lang: 'fa' })).notice[0]!, /فقط خواندنی/)
  assert.match(calOf(call(s, contentCtx(), 'content_calendar', { lang: 'tr' })).notice[0]!, /Salt okunur/)
  for (const args of [{ lang: 'de' }, { from: '2026-02-30' }, { channel: 'myspace' }, { from: '2026-12-01', to: '2026-11-01' }, { from: '2026-01-01', to: '2026-12-31' }]) {
    assert.equal(call(s, contentCtx(), 'content_calendar', args as ContentToolArgs).status, 'invalid', JSON.stringify(args))
  }
  assert.match(call(s, contentCtx(), 'content_calendar', { channel: 'myspace', lang: 'tr' }).reason!, /geçerli değil/)

  // The draft week: its brief is not found, and a pin to it reveals nothing.
  assert.equal(call(s, contentCtx(), 'content_brief', { week_id: 'wk-2026-11-30', slot_id: 's01' }).status, 'not_found')
  const draftPin = call(s, contentCtx(), 'content_brief', { week_id: 'wk-2026-11-30', slot_id: 's01', pin: { revision: 1 } })
  assert.deepEqual([draftPin.status, draftPin.stale?.pinned_state, draftPin.stale?.current, draftPin.data], ['stale_pin', 'unknown', null, null])
  never(draftPin, 'draft pin')
  assert.equal(call(s, contentCtx(), 'content_brief', { week_id: 'wk-2026-12-07', slot_id: 's01' }).status, 'not_found')
  assert.equal(call(s, contentCtx(), 'content_brief', { week_id: 'wk-2026-11-23', slot_id: 's99' }).status, 'not_found')
  assert.equal(call(s, contentCtx(), 'content_brief', { week_id: 'wk-2026-11-24', slot_id: 's01' }).status, 'invalid', 'not a Monday')

  // The content strategy is served to content-read through the same Strategy Feed tools; the SEO token sees nothing.
  const strategies = runStrategyTool(s.root, 'pilito', contentCtx(), 'strategy_list', {}, NOW)
  assert.deepEqual((strategies.data as { strategies: Array<{ strategy_id: string }> }).strategies.map((item) => item.strategy_id), ['content-main'])
  assert.equal(runStrategyTool(s.root, 'pilito', contentCtx(), 'strategy_get', { strategy_id: 'content-main' }, NOW).status, 'ok')
  never(runStrategyTool(s.root, 'pilito', contentCtx(), 'strategy_get', { strategy_id: 'content-main' }, NOW), 'strategy_get')
  assert.deepEqual(runStrategyTool(s.root, 'pilito', agentTokenContext('pilito', 'agt_seo', 'strategy-seo-read'), 'strategy_list', {}, NOW).data, { strategies: [], withheld: {} })

  // Everyone else is denied, for every tool, and each refusal is logged.
  const before = readAccessLog(s.root).length
  const others: AuthContext[] = [
    guestContext('pilito'),
    operatorContext('pilito'),
    ...(['internal-read', 'marketing', 'knowledge-read', 'creative-read', 'strategy-seo-read', 'strategy-ads-read'] as const).map((profile) => agentTokenContext('pilito', 'agt_other', profile)),
    { principal_id: 'agent-token:agt_np', role: 'agent', brand_id: 'pilito', audience: 'internal', scopes: ['read'] },
    contentCtx('northwind'),
  ]
  const pin = { revision: 1, content_sha256: w1.sha }
  for (const ctx of others) {
    for (const [tool, args] of [
      ['content_calendar', {}],
      ['content_brief', { week_id: 'wk-2026-11-23', slot_id: 's01' }],
      ['content_report', { week_id: 'wk-2026-11-23', slot_id: 's01', pin, status: 'produced' }],
    ] as const) {
      const result = call(s, ctx, tool, args)
      assert.equal(result.status, 'denied', `${ctx.principal_id}/${ctx.profile ?? ctx.role} ${tool}`)
      assert.equal(result.data, null)
    }
  }
  const denied = readAccessLog(s.root).slice(before)
  assert.equal(denied.length, others.length * 3)
  assert.ok(denied.every((line) => line.decision === 'deny' && line.kind === 'content'))
  assert.ok(denied.some((line) => line.reason === 'cross-brand'))
  assert.ok(!fs.existsSync(path.join(s.root, 'brand/.private/content/observations')), 'a denied report writes nothing')
  // Forged arguments grant nothing.
  const forged = call(s, contentCtx(), 'content_calendar', { brand_id: 'northwind', profile: 'internal-read', include_drafts: true } as ContentToolArgs)
  assert.deepEqual(calOf(forged).withheld, { draft: 1 })
  never(forged, 'forged arguments')
  never(fs.readFileSync(accessLogPath(s.root), 'utf8'), 'access log', [PROMISE, OFFER, VOICE])
})

test('a brief carries voice, claims, audience, the resolved message, the cited angle and creative preference ids; restricted facts are redacted', async () => {
  const s = await contentBrand()
  const { home } = wordflightSources(s.ws, NOW)
  const wf = addCandidate(s.ws, { display_name: 'WordFlight', relationship: 'direct', geography: 'international', markets: 'US', domain: 'wordflight-app.com' }).competitor_id
  linkEvidence(s.ws, { competitor_id: wf, note: home.note_id, claim_key: 'wordflight.message.five_minutes', dimension: 'public_message', label: 'Five minutes a day' })
  // An approved series preference for reels, and one for stories (another surface).
  createProject(s.ws, { project_id: 'pilito-reel-1', title: 'Intro reels', surface: 'reel', series: 'onboarding', language: 'en' })
  addVariant(s.ws, { project_id: 'pilito-reel-1', variant_id: 'A', asset: 'missing' })
  const note = recordFeedback(s.ws, { project_id: 'pilito-reel-1', variant_id: 'A', text: 'Camera angles feel alive', verdict: 'like', keep: ['camera_angle'] })
  const pref = suggestPreference(s.ws, { project_id: 'pilito-reel-1', statement: 'Use dynamic camera angles on onboarding reels', sources: [note.note.id] })
  approvePreference(s.ws, { preference_id: pref.preference_id, proof: s.proof, scope: 'series' })
  const draftPref = suggestPreference(s.ws, { project_id: 'pilito-reel-1', statement: 'DRAFT-PREFERENCE-CANARY neon', sources: [note.note.id] })

  const week = plannedWeek(s, '2026-11-23', { research: true })
  const w1 = approvedWeek(s, week)
  const reel = week.slots.find((slot) => slot.format === 'reel')!
  const pin = { revision: 1, content_sha256: w1.sha }
  const got = call(s, contentCtx(), 'content_brief', { week_id: week.week_id, slot_id: reel.id, pin })
  assert.equal(got.status, 'ok', got.reason)
  const brief = briefOf(got)
  assert.equal(brief.schema, CONTENT_BRIEF_SCHEMA)
  assert.deepEqual([brief.week_id, brief.slot_id, brief.week_revision, brief.status], [week.week_id, reel.id, 1, 'current'])
  assert.equal(brief.digests.content_sha256, w1.sha)
  assert.equal(brief.digests.strategy_content_sha256, s.strategySha)
  assert.deepEqual(brief.strategy, { strategy_id: 'content-main', revision: 1, content_sha256: s.strategySha })
  assert.ok(verifyContentDocument(brief))
  assert.equal(JSON.stringify(briefOf(call(s, contentCtx(), 'content_brief', { week_id: week.week_id, slot_id: reel.id, pin }))), JSON.stringify(brief), 'stable')
  assert.deepEqual([brief.slot.channel, brief.slot.format, brief.slot.status], ['instagram', 'reel', 'approved'])
  assert.ok(brief.slot.pillar && brief.slot.pillar.name.length > 0)
  assert.deepEqual(brief.channel_plan, { role: null, formats: ['reel', 'carousel'], cadence: { per: 'week', target: 3 } })
  assert.ok(brief.missing.includes('channel_plan.role') && brief.missing.includes('slot.hook'), 'unknowns are listed, never guessed')
  assert.ok(brief.voice.sources.some((src) => src.fact_id === 'brand.verbal.voice' && src.value === VOICE))
  assert.ok(brief.audience.some((src) => src.value === AUDIENCE))
  assert.deepEqual(brief.claims.banned.map((rule) => rule.text), ['Guaranteed fluency', 'Fake awards', 'Shame'])
  assert.ok(brief.must_avoid.some((item) => item.kind === 'banned_claim' && item.text === 'Guaranteed fluency'))
  assert.ok(brief.must_avoid.some((item) => item.kind === 'availability'))
  const message = brief.key_message ?? brief.offer
  assert.ok(message && [PROMISE, OFFER].includes(message.value), 'the key message or offer is resolved from the approved fact')
  assert.ok(brief.must_include.length >= 1)
  assert.ok(brief.objective.some((fact) => fact.fact_id === 'business.marketing.objective'))
  assert.ok(brief.sources.facts.every((ref) => week.fact_refs.some((pinned) => pinned.id === ref.id && pinned.revision === ref.revision)))
  assert.equal(brief.competitive_angle?.competitor_id, wf)
  assert.ok(['high', 'medium', 'low'].includes(brief.competitive_angle!.confidence))
  assert.deepEqual(brief.sources.research, [brief.competitive_angle!.ref])
  assert.deepEqual(brief.creative, { surface: 'reel', preferences: [{ preference_id: pref.preference_id, series: 'onboarding' }] })
  assert.deepEqual(brief.redacted, [])
  assert.equal(brief.report, null)
  assert.deepEqual([brief.authorizes, brief.publication_permission, brief.schedule_permission, brief.spend_permission], [[], false, false, false])
  never(got, 'brief', [MESSAGE_QUOTE, 'DRAFT-PREFERENCE-CANARY', draftPref.preference_id])

  // A Persian slot is right-to-left, and a Persian reader gets Persian notices.
  const fa = week.slots.find((slot) => slot.language === 'fa')!
  const faBrief = briefOf(call(s, contentCtx(), 'content_brief', { week_id: week.week_id, slot_id: fa.id, lang: 'fa' }))
  assert.equal(faBrief.slot.direction, 'rtl')
  assert.match(faBrief.notice[3]!, /داده است/)
  // A newsletter email has no creative surface.
  const email = week.slots.find((slot) => slot.format === 'email')
  if (email) assert.deepEqual(briefOf(call(s, contentCtx(), 'content_brief', { week_id: week.week_id, slot_id: email.id })).creative, { surface: null, preferences: [] })

  // Restricted: if a cited fact were restricted, it would be redacted and never resolved (pure builder, canary value).
  const record = loadWeekRecord(s.ws, week.week_id)
  const entry = approvedWeekEntry(record)!
  const evaluation = evaluateWeek(s.ws, record, entry, NOW)
  const served = { entry, revision: evaluation.revision!, view: evaluation.view! }
  const { readFacts } = await import('@brand-os/brand-core')
  const facts = readFacts(s.root, 'approved', 'pilito')
  const restricted = { ...facts, 'business.marketing.objective': { ...facts['business.marketing.objective']!, classification: 'restricted' as const, value: BUDGET_FACT_CANARY } }
  const redactedBrief = buildBrief(s.ws, served, reel, restricted, null, 'en')
  assert.deepEqual(redactedBrief.redacted, [{ field: 'business.marketing.objective', reason: 'restricted' }])
  assert.ok(!redactedBrief.objective.some((fact) => fact.fact_id === 'business.marketing.objective'))
  assert.ok(!redactedBrief.sources.facts.some((ref) => ref.id === 'business.marketing.objective'))
  assert.ok(!JSON.stringify(redactedBrief).includes(BUDGET_FACT_CANARY))
})

test('stale pins are refused with no content; a week that needs review is withheld and serves no brief', async () => {
  const { s, week, w1 } = await servedBrand()
  const pinV1 = { revision: 1, content_sha256: w1.sha }
  assert.equal(call(s, contentCtx(), 'content_brief', { week_id: week.week_id, slot_id: 's01', pin: pinV1 }).status, 'ok')
  assert.equal(call(s, contentCtx(), 'content_brief', { week_id: week.week_id, slot_id: 's01', pin: { revision: 'x' } }).status, 'invalid')

  // v2 is a draft: v1 stays served, a pin to v2 is unknown and shows nothing of it.
  const v2 = proposeWeek(s.ws, { week: withSlots(week, (slot, i) => (i === 0 ? { ...slot, hook: V2_HOOK } : slot)) }).revision
  const during = call(s, contentCtx(), 'content_brief', { week_id: week.week_id, slot_id: 's01', pin: { revision: 2 } })
  assert.deepEqual([during.status, during.stale!.pinned_state, during.stale!.current], ['stale_pin', 'unknown', pinV1])
  assert.ok(!JSON.stringify(during).includes('V2-HOOK'))
  assert.ok(!JSON.stringify(call(s, contentCtx(), 'content_calendar')).includes('V2-HOOK'))

  // The owner approves v2: it is served; a v1 pin is stale (revision + sha, or sha alone).
  approveWeek(s.ws, { week_id: week.week_id, revision: 2, expected_sha256: v2.content_sha256, proof: s.proof })
  assert.equal(briefOf(call(s, contentCtx(), 'content_brief', { week_id: week.week_id, slot_id: 's01' })).slot.hook, V2_HOOK)
  const stale = call(s, contentCtx(), 'content_brief', { week_id: week.week_id, slot_id: 's01', pin: pinV1 })
  assert.equal(stale.status, 'stale_pin')
  assert.deepEqual(stale.stale, { pinned: pinV1, current: { revision: 2, content_sha256: v2.content_sha256 }, pinned_state: 'superseded' })
  assert.equal(stale.data, null)
  assert.match(stale.reason!, /Do not produce or publish/)
  assert.equal(call(s, contentCtx(), 'content_brief', { week_id: week.week_id, slot_id: 's01', pin: { content_sha256: w1.sha } }).status, 'stale_pin')
  assert.match(call(s, contentCtx(), 'content_brief', { week_id: week.week_id, slot_id: 's01', pin: pinV1, lang: 'tr' }).reason!, /güncel haftayı/)

  // A cited fact changes: the strategy and so the week need review. Nothing is served; the pin is stale.
  const change = s.engine.requestChange('brand.strategy.promise', 'Talk from the first lesson.')
  assert.equal(s.engine.approveChange(change.id, s.proof, change.expected_version).kind, 'recorded')
  const held = calOf(call(s, contentCtx(), 'content_calendar'))
  assert.deepEqual(held.weeks, [])
  assert.deepEqual(held.withheld, { draft: 1, needs_review: 1 })
  assert.equal(call(s, contentCtx(), 'content_brief', { week_id: week.week_id, slot_id: 's01' }).status, 'not_found')
  const pinV2 = call(s, contentCtx(), 'content_brief', { week_id: week.week_id, slot_id: 's01', pin: { revision: 2, content_sha256: v2.content_sha256 } })
  assert.deepEqual([pinV2.status, pinV2.stale!.pinned_state, pinV2.stale!.current], ['stale_pin', 'needs_review', null])
  const log = readAccessLog(s.root)
  assert.ok(log.some((line) => line.reason === 'stale_pin:superseded'))
  assert.ok(log.some((line) => line.reason === 'not_servable:needs_review'))
})

test('reports: produced/published with an https URL are observations; the week, its hash and the strategy are unchanged', async () => {
  const { s, week, w1 } = await servedBrand()
  const pin = { revision: 1, content_sha256: w1.sha }
  const weekDir = path.join(s.root, 'brand/.private/content/calendar', week.week_id)
  const snapshot = () => Object.fromEntries(fs.readdirSync(weekDir).sort().map((name) => [name, fs.readFileSync(path.join(weekDir, name), 'utf8')]))
  const before = snapshot()
  const viewBefore = calOf(call(s, contentCtx(), 'content_calendar')).digests.view_sha256
  const report = (args: ContentToolArgs) => call(s, contentCtx(), 'content_report', { week_id: week.week_id, slot_id: 's01', pin, ...args })

  const produced = report({ status: 'produced' })
  assert.equal(produced.status, 'ok', produced.reason)
  const obs = reportOf(produced).observation
  assert.match(obs.observation_id, /^cob_[0-9a-f]{32}$/)
  assert.deepEqual([obs.week_id, obs.slot_id, obs.week_revision, obs.week_content_sha256, obs.status, obs.url, obs.reporter, obs.profile], [week.week_id, 's01', 1, w1.sha, 'produced', null, 'agent-token:agt_content', 'content-read'])
  assert.equal(obs.reported_at, NOW.toISOString())
  assert.deepEqual([reportOf(produced).authorizes, reportOf(produced).publication_permission, reportOf(produced).duplicate], [[], false, false])
  assert.match(reportOf(produced).notice[0]!, /observation only/)
  const again = report({ status: 'produced' })
  assert.deepEqual([reportOf(again).duplicate, reportOf(again).observation.observation_id], [true, obs.observation_id])

  // Refusals: nothing is written for any of them.
  const longUrl = `https://www.instagram.com/p/${'a'.repeat(500)}`
  const refusals: Array<[ContentToolArgs, RegExp]> = [
    [{ status: 'published' }, /needs the https URL/],
    [{ status: 'published', url: 'http://www.instagram.com/p/x/' }, /https:\/\//],
    [{ status: 'published', url: 'https://user:pw@instagram.com/p/x/' }, /password or access token/],
    [{ status: 'published', url: `https://www.instagram.com/p/x/?access_token=${'q'.repeat(12)}` }, /password or access token/],
    [{ status: 'published', url: 'https://localhost/p/x' }, /public domain/],
    [{ status: 'published', url: 'https://10.0.0.7/p/x' }, /public domain/],
    [{ status: 'published', url: longUrl }, /longer than 500/],
    [{ status: 'published', url: 'not a url' }, /not a valid address/],
    [{ status: 'scheduled', url: POST_URL }, /status/],
  ]
  for (const [args, reason] of refusals) {
    const result = report(args)
    assert.equal(result.status, 'invalid', JSON.stringify(args).slice(0, 80))
    assert.match(result.reason!, reason)
  }
  assert.match(report({ status: 'published', url: 'http://x.com/p', lang: 'fa' }).reason!, /https:\/\//)
  assert.match(report({ status: 'published', lang: 'tr' }).reason!, /https URL’sini/)
  assert.equal(call(s, contentCtx(), 'content_report', { week_id: week.week_id, slot_id: 's01', status: 'produced' }).status, 'invalid', 'a report needs a pin')
  assert.match(call(s, contentCtx(), 'content_report', { week_id: week.week_id, slot_id: 's01', status: 'produced', lang: 'fa' }).reason!, /pin/)
  assert.equal(call(s, contentCtx(), 'content_report', { week_id: 'wk-2026-11-30', slot_id: 's01', status: 'produced', pin: { revision: 1, content_sha256: 'a'.repeat(64) } }).status, 'stale_pin', 'a draft week is not reportable')
  assert.equal(report({ status: 'produced', pin: { revision: 1, content_sha256: 'b'.repeat(64) } }).status, 'stale_pin')
  assert.equal(urlProblem(POST_URL), null)

  const published = report({ status: 'published', url: POST_URL, lang: 'tr' })
  assert.equal(published.status, 'ok')
  assert.match(reportOf(published).message, /gözlemi olarak kaydedildi/)
  const pubId = reportOf(published).observation.observation_id

  // The week and the strategy are unchanged; the calendar shows the latest report per slot outside the view digest.
  assert.deepEqual(snapshot(), before, 'record.json and revisions are never edited by a report')
  const cal = calOf(call(s, contentCtx(), 'content_calendar'))
  assert.equal(cal.digests.view_sha256, viewBefore)
  assert.equal(cal.weeks[0]!.digests.content_sha256, w1.sha)
  assert.deepEqual(cal.weeks[0]!.reports, [{ slot_id: 's01', status: 'published', url: POST_URL, reported_at: NOW.toISOString(), observation_id: pubId }])
  assert.equal(briefOf(call(s, contentCtx(), 'content_brief', { week_id: week.week_id, slot_id: 's01' })).report!.observation_id, pubId)
  assert.deepEqual(listObservations(s.ws, [week.week_id]).map((item) => item.status), ['produced', 'published'])
  const file = path.join(s.root, 'brand/.private/content/observations', `${week.week_id}.json`)
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)

  // The access log has ids only: the observation id, never the URL.
  const lines = readAccessLog(s.root).filter((line) => line.tool === 'content_report')
  assert.ok(lines.some((line) => line.decision === 'allow' && line.returned_ids.includes(pubId)))
  assert.ok(!fs.readFileSync(accessLogPath(s.root), 'utf8').includes('instagram.com'))

  // A skipped slot is not reportable.
  const skippedWeek = withSlots(plannedWeek(s, '2026-11-30'), (slot, i) => (i === 0 ? { ...slot, status: 'skipped' } : slot))
  const w2 = approvedWeek(s, skippedWeek)
  const skipped = call(s, contentCtx(), 'content_report', { week_id: 'wk-2026-11-30', slot_id: 's01', pin: { revision: w2.revision, content_sha256: w2.sha }, status: 'produced' })
  assert.equal(skipped.status, 'invalid')
  assert.match(skipped.reason!, /skipped/)

  // Owner-only listing.
  process.env.BRAND_OS_AGENT_TOKEN = 'bos_at_x'
  try {
    assert.throws(() => listObservations(s.ws, [week.week_id]), (error: unknown) => error instanceof StrategyError && error.code === 'refused')
  } finally {
    delete process.env.BRAND_OS_AGENT_TOKEN
  }
})

test('gate over stdio MCP and brand:query: a mock Instagram agent reads the approved week, gets briefs and reports; nothing else leaks', async () => {
  const { s, w1 } = await servedBrand()
  const contentToken = issueAgentToken(s.root, { brandId: 'pilito', profile: 'content-read', label: 'mock instagram agent' }).token
  const marketingToken = issueAgentToken(s.root, { brandId: 'pilito', profile: 'marketing', label: 'facts only' }).token
  const env = (token?: string) => {
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) if (typeof value === 'string' && key !== 'BRAND_OS_AGENT_TOKEN' && key !== 'BRAND_OS_APPROVAL_PROOF') out[key] = value
    out.BRAND_OS_DATA_KEY = TEST_DATA_KEY
    if (token) out.BRAND_OS_AGENT_TOKEN = token
    return out
  }
  const connect = async (token?: string) => {
    const client = new Client({ name: 'mock-instagram-agent', version: '0.0.1' })
    await client.connect(new StdioClientTransport({ command: tsx, args: [path.join(repo, 'scripts/mcp.ts')], cwd: s.root, env: env(token), stderr: 'pipe' }))
    return client
  }
  const parse = (result: unknown) => JSON.parse((result as { content: Array<{ text: string }> }).content[0]!.text) as ContentToolResult
  const logStart = readAccessLog(s.root).length

  const agent = await connect(contentToken)
  let reported = ''
  try {
    const names = (await agent.listTools()).tools.map((tool) => tool.name)
    for (const name of ['content_calendar', 'content_brief', 'content_report']) assert.ok(names.includes(name), name)
    // 1. Read the approved Instagram slots.
    const cal = parse(await agent.callTool({ name: 'content_calendar', arguments: { channel: 'instagram' } }))
    assert.equal(cal.status, 'ok')
    const doc = calOf(cal)
    assert.ok(verifyContentDocument(doc))
    assert.deepEqual(doc.weeks.map((w) => w.week_id), ['wk-2026-11-23'], 'the draft week is invisible')
    assert.deepEqual(doc.withheld, { draft: 1 })
    const week = doc.weeks[0]!
    const pin = { revision: week.revision, content_sha256: week.digests.content_sha256 }
    assert.deepEqual(pin, { revision: 1, content_sha256: w1.sha })
    // 2. A brief per slot, pinned.
    for (const slot of week.slots) {
      const brief = parse(await agent.callTool({ name: 'content_brief', arguments: { week_id: week.week_id, slot_id: slot.id, pin } }))
      assert.equal(brief.status, 'ok')
      assert.equal(briefOf(brief).slot.channel, 'instagram')
      assert.ok(verifyContentDocument(briefOf(brief)))
      never(brief, `brief ${slot.id}`)
    }
    // 3. Report the first slot as published.
    const done = parse(await agent.callTool({ name: 'content_report', arguments: { week_id: week.week_id, slot_id: week.slots[0]!.id, pin, status: 'published', url: POST_URL } }))
    assert.equal(done.status, 'ok', done.reason)
    reported = reportOf(done).observation.observation_id
    assert.equal(reportOf(done).observation.reporter.startsWith('agent-token:agt_'), true)
    // The draft week stays invisible; forged arguments are stripped or refused.
    assert.equal(parse(await agent.callTool({ name: 'content_brief', arguments: { week_id: 'wk-2026-11-30', slot_id: 's01' } })).status, 'not_found')
    const forged = await agent.callTool({ name: 'content_calendar', arguments: { brand_id: 'northwind', include_drafts: true } }).catch((error: unknown) => error)
    assert.ok(forged instanceof Error || !JSON.stringify(forged).includes('DRAFT-WEEK-CANARY'))
    // No write tool except the report exists for this token.
    assert.ok(!names.some((name) => /approve|publish|schedule|post_/.test(name)))
  } finally {
    await agent.close()
  }

  // A marketing token and a guest get nothing from the content tools.
  for (const token of [marketingToken, undefined]) {
    const client = await connect(token)
    try {
      for (const [name, args] of [
        ['content_calendar', {}],
        ['content_brief', { week_id: 'wk-2026-11-23', slot_id: 's01' }],
        ['content_report', { week_id: 'wk-2026-11-23', slot_id: 's01', pin: { revision: 1, content_sha256: w1.sha }, status: 'produced' }],
      ] as const) {
        const result = parse(await client.callTool({ name, arguments: args }))
        assert.equal(result.status, 'denied', `${token ? 'marketing' : 'guest'} ${name}`)
        never(result, name, [PROMISE])
      }
    } finally {
      await client.close()
    }
  }

  // brand:query: the same gate, read tools only.
  const query = (args: string[], token?: string) => {
    const result = spawnSync(tsx, [path.join(repo, 'scripts/brand.ts'), 'query', ...args], { cwd: s.root, encoding: 'utf8', env: env(token) })
    return { status: result.status, json: (() => { try { return JSON.parse(result.stdout) as ContentToolResult } catch { return null } })(), stderr: result.stderr }
  }
  const viaQuery = query(['--tool', 'content_calendar', '--channel', 'instagram'], contentToken)
  assert.equal(viaQuery.status, 0, viaQuery.stderr)
  assert.equal(viaQuery.json!.status, 'ok')
  assert.deepEqual(calOf(viaQuery.json!).weeks[0]!.reports.map((r) => r.observation_id), [reported])
  const briefQuery = query(['--tool', 'content_brief', '--week', 'wk-2026-11-23', '--slot', 's01', '--pin-revision', '1', '--pin-sha', w1.sha, '--lang', 'fa'], contentToken)
  assert.equal(briefQuery.json!.status, 'ok', briefQuery.stderr)
  assert.match(briefOf(briefQuery.json!).notice[0]!, /فقط خواندنی/)
  assert.equal(query(['--tool', 'content_brief', '--week', 'wk-2026-11-23', '--slot', 's01', '--pin-sha', 'c'.repeat(64)], contentToken).json!.status, 'stale_pin')
  assert.equal(query(['--tool', 'content_calendar'], marketingToken).json!.status, 'denied')
  assert.equal(query(['--tool', 'content_calendar']).json!.status, 'denied')
  assert.notEqual(query(['--tool', 'content_report'], contentToken).status, 0, 'brand:query has no report tool')

  // Every call above appears in the access log, with ids only.
  const lines = readAccessLog(s.root).slice(logStart).filter((line) => line.kind === 'content')
  assert.ok(lines.length >= 3 + 3 + 6 + 5, `${lines.length} content lines`)
  assert.ok(lines.some((line) => line.tool === 'content_report' && line.returned_ids.includes(reported)))
  assert.ok(lines.filter((line) => line.decision === 'deny').every((line) => line.returned_ids.length === 0))
  never(fs.readFileSync(accessLogPath(s.root), 'utf8'), 'access log', [PROMISE, POST_URL])
})

test('brand:content reports shows agent reports to the owner (en/fa/tr, --json) and is refused under an agent token', async () => {
  const { s, week, w1 } = await servedBrand()
  const cli = (args: string[], extra: Record<string, string> = {}) => {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) if (typeof value === 'string' && key !== 'BRAND_OS_AGENT_TOKEN') env[key] = value
    env.BRAND_OS_DATA_KEY = TEST_DATA_KEY
    return spawnSync(tsx, [path.join(repo, 'scripts/content.ts'), ...args], { cwd: s.root, encoding: 'utf8', env: { ...env, ...extra }, input: '' })
  }
  assert.match(cli(['reports']).stdout, /No produced or published reports yet/)
  const pin = { revision: 1, content_sha256: w1.sha }
  call(s, contentCtx(), 'content_report', { week_id: week.week_id, slot_id: 's02', pin, status: 'published', url: POST_URL })

  const en = cli(['reports', '--lang', 'en'])
  assert.equal(en.status, 0, en.stderr)
  assert.match(en.stdout, /They change no week, strategy or fact/)
  assert.ok(en.stdout.includes(`${week.week_id} s02 r1 published ${POST_URL}`))
  assert.ok(!en.stdout.includes('not the one served now'))
  assert.match(cli(['reports', '--lang', 'fa']).stdout, /هیچ هفته، استراتژی یا واقعیتی/)
  assert.match(cli(['reports', '--lang', 'tr', '--week', week.week_id]).stdout, /Hiçbir haftayı/)
  const json = JSON.parse(cli(['reports', '--json']).stdout) as { ok: boolean; reports: Array<{ slot_id: string; current: boolean }> }
  assert.deepEqual(json.reports.map((item) => [item.slot_id, item.current]), [['s02', true]])

  // After the owner approves a v2 of the week, the report is shown as made against the older revision.
  const v2 = proposeWeek(s.ws, { week: withSlots(week, (slot, i) => (i === 0 ? { ...slot, hook: V2_HOOK } : slot)) }).revision
  approveWeek(s.ws, { week_id: week.week_id, revision: 2, expected_sha256: v2.content_sha256, proof: s.proof })
  assert.match(cli(['reports']).stdout, /reported against revision 1, not the one served now/)
  assert.equal(calOf(call(s, contentCtx(), 'content_calendar')).weeks[0]!.reports.length, 0, 'a v1 report is not carried over to v2')

  const refused = cli(['reports'], { BRAND_OS_AGENT_TOKEN: 'bos_at_x' })
  assert.notEqual(refused.status, 0)
  assert.ok(!refused.stdout.includes(POST_URL))
  assert.notEqual(cli(['reports', '--week', 'wk-2026-11-24']).status, 0, 'a week id must be a Monday')
})

test('a week record edited to two approved revisions serves nothing; a pin to it reports integrity_failed', async () => {
  const { s, week, w1 } = await servedBrand()
  const v2 = proposeWeek(s.ws, { week: withSlots(week, (slot, i) => (i === 0 ? { ...slot, hook: V2_HOOK } : slot)) }).revision
  const file = path.join(s.root, 'brand/.private/content/calendar', week.week_id, 'record.json')
  const record = JSON.parse(fs.readFileSync(file, 'utf8')) as { revisions: Array<{ state: string }> }
  record.revisions[1]!.state = 'approved'
  fs.writeFileSync(file, JSON.stringify(record))
  const cal = calOf(call(s, contentCtx(), 'content_calendar'))
  assert.deepEqual(cal.weeks, [])
  assert.equal(cal.withheld.integrity_failed, 1)
  const pinned = call(s, contentCtx(), 'content_brief', { week_id: week.week_id, slot_id: 's01', pin: { revision: 1, content_sha256: w1.sha } })
  assert.deepEqual([pinned.status, pinned.stale!.pinned_state, pinned.stale!.current, pinned.data], ['stale_pin', 'integrity_failed', null, null])
  assert.equal(call(s, contentCtx(), 'content_brief', { week_id: week.week_id, slot_id: 's01' }).status, 'not_found')
  assert.equal(call(s, contentCtx(), 'content_report', { week_id: week.week_id, slot_id: 's01', status: 'produced', pin: { revision: 2, content_sha256: v2.content_sha256 } }).status, 'stale_pin')
  assert.ok(!JSON.stringify(cal).includes('V2-HOOK'))
})
