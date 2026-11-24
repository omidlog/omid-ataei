import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { editNote, findNote, openWorkspace, type KnowledgeWorkspace } from '@brand-os/brand-core'
import { loadEvidence, replayAdapter, unavailableAdapter } from '@brand-os/brand-core/research'
import {
  critiquePlan,
  draftSeoStrategy,
  interviewState,
  QUESTION_IDS,
  readInterview,
  recordAnswer,
  renderPlan,
  SeoError,
  type CriticReport,
  type SeoStrategy,
} from '@brand-os/brand-core/seo'
import { filesContaining } from './helpers/creative.js'
import { workspace } from './helpers/knowledge.js'
import { answerAll, APP_ONLY, officialBundle, PLAN_NOW, recordOfficial, WEBSITE } from './helpers/seo.js'

/**
 * The SEO strategist (Spec Sprint 2): conditional interview, a researched case replayed from real official pages
 * recorded on 2026-11-22, an offline case, materially different app-only vs website strategies, and an independent
 * critic that catches invented policy claims. No network.
 */

function brand(slug: string, now: Date = PLAN_NOW): { root: string; ws: KnowledgeWorkspace } {
  const { root } = workspace({ slug, now: () => now })
  return { root, ws: openWorkspace(root, { now: () => now }) }
}

async function researched(slug: string, answers: typeof APP_ONLY): Promise<{ root: string; ws: KnowledgeWorkspace; plan: SeoStrategy; critic: CriticReport }> {
  const { root, ws } = brand(slug)
  answerAll(ws, answers)
  await recordOfficial(ws)
  const { plan, critic } = draftSeoStrategy(ws, null, { adapter: replayAdapter(officialBundle()), save: false })
  return { root, ws, plan, critic }
}

function offline(slug: string, answers: typeof APP_ONLY): { ws: KnowledgeWorkspace; plan: SeoStrategy; critic: CriticReport } {
  const { ws } = brand(slug)
  answerAll(ws, answers)
  const { plan, critic } = draftSeoStrategy(ws, null, { adapter: unavailableAdapter(), save: false })
  return { ws, plan, critic }
}

const ids = (plan: SeoStrategy) => plan.decisions.map((decision) => decision.id)
const tampered = (plan: SeoStrategy, markdown: string): SeoStrategy => ({ ...plan, markdown })
const codes = (report: CriticReport) => report.blocking_findings.map((finding) => finding.code)

test('interview: branches on presence, skips with reasons, never asks budget, keeps unknown and history', () => {
  const start = interviewState({})
  assert.equal(start.next?.id, 'seo.presence.web')
  assert.ok(start.next?.why_asked && start.next.decision_informed)
  assert.ok(!QUESTION_IDS.some((id) => /budget|spend|revenue|price/.test(id)), 'restricted finance is never asked')
  assert.match(start.notice, /Budget is not asked/)
  assert.ok(start.skipped.some((item) => item.id === 'seo.web.control' && /Waiting/.test(item.reason)))

  const app = interviewState({ 'seo.presence.web': 'none', 'seo.presence.app': 'ios' })
  assert.ok(app.pending.includes('seo.app.web_openness') && app.pending.includes('seo.app.store_status'))
  for (const id of ['seo.web.control', 'seo.web.maturity', 'seo.data.search_console', 'seo.web.locale_structure', 'seo.geo.crawler_policy']) {
    assert.match(app.skipped.find((item) => item.id === id)?.reason ?? '', /no website/, `${id} is skipped for an app-only brand`)
  }
  const site = interviewState({ 'seo.presence.web': 'content_site', 'seo.presence.app': 'none', 'seo.market.locales': ['en', 'fa'] })
  assert.ok(site.pending.includes('seo.web.locale_structure'), 'two languages on a site → structure question')
  assert.ok(site.skipped.some((item) => item.id === 'seo.app.store_status'))
  assert.ok(interviewState({ 'seo.presence.web': 'content_site', 'seo.market.locales': ['en'] }).skipped.some((item) => item.id === 'seo.web.locale_structure' && /one language/.test(item.reason)))
  assert.ok(interviewState({ 'seo.presence.web': 'content_site', 'seo.geo.interest': 'no' }).skipped.some((item) => item.id === 'seo.geo.crawler_policy'))

  const { root, ws } = brand('seo-interview')
  assert.throws(() => recordAnswer(ws, { question_id: 'seo.presence.web', value: 'blog' }), (error: unknown) => error instanceof SeoError && error.code === 'invalid_input')
  assert.throws(() => recordAnswer(ws, { question_id: 'seo.budget.monthly', value: '1000' }), (error: unknown) => error instanceof SeoError && error.code === 'not_found')
  assert.throws(() => recordAnswer(ws, { question_id: 'seo.market.locales', value: 'english language' }), SeoError)
  recordAnswer(ws, { question_id: 'seo.goal.timeframe', value: 'unknown' })
  const words = 'Localized example (fa): فعلاً سایت نداریم، فقط اپ.'
  const first = recordAnswer(ws, { question_id: 'seo.presence.web', value: 'none', words, language: 'fa' })
  const changed = recordAnswer(ws, { question_id: 'seo.presence.web', value: 'landing_page' })
  assert.equal(changed.changed_from, 'none')
  const record = readInterview(ws)
  assert.equal(record.answers['seo.goal.timeframe']!.value, 'unknown', 'unknown is kept, never filled in')
  assert.equal(record.answers['seo.presence.web']!.history[0]!.value, 'none')
  // The owner's words live once, in their Knowledge note; the interview record only cites it.
  const note = findNote(ws, first.entry.note!.id)
  assert.deepEqual([note.note.meta.source.kind, note.note.meta.kind], ['owner_note', 'meeting'])
  assert.deepEqual(filesContaining(root, 'فعلاً سایت نداریم'), [path.join(root, note.path)])
})

test('researched case: app-only and website brands get materially different, cited strategies', async () => {
  const app = await researched('seo-app', APP_ONLY)
  const site = await researched('seo-site', WEBSITE)
  for (const { plan, critic } of [app, site]) {
    assert.equal(plan.research.status, 'researched')
    assert.equal(plan.research.adapter.mode, 'replay')
    assert.equal(critic.verdict, 'pass', JSON.stringify(critic.blocking_findings))
    assert.deepEqual([plan.state, plan.approval, plan.authorizes], ['draft', null, []])
    assert.ok(plan.alternatives.length >= 3)
  }
  assert.equal(app.plan.archetype, 'app_only')
  assert.equal(site.plan.archetype, 'website')
  assert.equal(app.plan.alternatives.find((alt) => alt.verdict === 'chosen')?.id, 'alt.store-first')
  assert.equal(site.plan.alternatives.find((alt) => alt.verdict === 'chosen')?.id, 'alt.foundation')

  // No site work for the brand without a website; no store work in the website plan.
  assert.ok(ids(app.plan).includes('app.store-first') && ids(app.plan).includes('app.promo-text'))
  assert.ok(!ids(app.plan).some((id) => id.startsWith('site.')))
  assert.equal(app.plan.decisions.find((decision) => decision.id === 'app.no-site-work')?.action, 'do_not_do')
  assert.ok(ids(site.plan).includes('site.eligibility') && ids(site.plan).includes('site.locales') && ids(site.plan).includes('site.firsthand-content'))
  assert.ok(!ids(site.plan).some((id) => id.startsWith('app.')))
  const shared = ids(app.plan).filter((id) => ids(site.plan).includes(id))
  assert.deepEqual(shared.sort(), ['guard.no-guarantees', 'measure.baseline'], 'only the guardrail and the baseline are common')
  assert.notEqual(app.plan.measurement.leading_indicators[0], site.plan.measurement.leading_indicators[0])

  // Website GEO: evidence-backed, crawler choice from the owner, cited to OpenAI's own page.
  assert.equal(site.plan.geo.included, true)
  const crawler = site.plan.decisions.find((decision) => decision.id === 'geo.crawler-policy')!
  assert.equal(crawler.status, 'cited')
  assert.match(crawler.statement, /OAI-SearchBot/)
  assert.ok(site.plan.sources.some((source) => source.url === 'https://developers.openai.com/api/docs/bots'))
  // App GEO: a labelled hypothesis, no crawler decision (there is no site).
  assert.ok(ids(app.plan).includes('geo.entity-consistency') && !ids(app.plan).includes('geo.crawler-policy'))

  // Citations: verbatim quote, URL, retrieval date, page date, kn_…@sha256.
  const store = app.plan.decisions.find((decision) => decision.id === 'app.promo-text')!
  assert.equal(store.status, 'cited')
  assert.match(app.plan.markdown, /> “In addition, keep in mind that promotional text doesn’t affect your app’s search ranking so it should not be used to display keywords\.” — Apple Developer, retrieved 2026-11-22, page states no date \[S\d\]/)
  assert.match(site.plan.markdown, /page says “Last updated 2025-12-10 UTC”/)
  assert.match(site.plan.markdown, /`knowledge:kn_[a-z0-9-]+@[0-9a-f]{64}`/)
  for (const decision of [...app.plan.decisions, ...site.plan.decisions]) assert.equal(decision.decided_at, PLAN_NOW.toISOString())
  // Evidence that is not in the bundle is a gap, not an invention: Google Play has no recorded source.
  const play = app.plan.decisions.find((decision) => decision.id === 'app.store-first')!
  assert.deepEqual([play.status, play.missing_claims], ['provisional', ['google_play.store_listing.metadata']])
  assert.ok(app.plan.evidence_gaps.some((gap) => gap.kind === 'missing_source' && gap.item === 'google_play.store_listing.metadata'))
  assert.equal(app.plan.label, 'provisional')
  assert.equal(site.plan.label, 'evidence_backed')
  for (const plan of [app.plan, site.plan]) {
    assert.ok(plan.evidence_gaps.some((gap) => gap.kind === 'no_keyword_data'))
    assert.ok(plan.evidence_gaps.some((gap) => gap.kind === 'unverified_competitors'))
    assert.match(plan.markdown, /## Evidence-gap checklist\n\n- \[ \] /)
  }
})

test('offline case: research_unavailable, provisional, nothing quoted, no policy, volume or ranking claims', () => {
  for (const answers of [APP_ONLY, WEBSITE]) {
    const { plan, critic } = offline(`seo-offline-${answers === APP_ONLY ? 'app' : 'site'}`, answers)
    assert.equal(plan.research.status, 'research_unavailable')
    assert.equal(plan.research.adapter.state, 'unavailable')
    assert.equal(plan.label, 'provisional')
    assert.equal(plan.confidence.overall, 'low')
    assert.deepEqual(plan.sources, [])
    assert.ok(plan.starting_points.length > 0, 'official starting points are listed as pointers')
    assert.equal(plan.evidence_gaps[0]!.kind, 'research_unavailable')
    for (const decision of plan.decisions) {
      assert.notEqual(decision.status, 'cited')
      if (decision.requires.length) assert.equal(decision.status, 'provisional', decision.id)
    }
    assert.match(plan.markdown, /\*\*research_unavailable\.\*\* No source was checked/)
    assert.doesNotMatch(plan.markdown, /^> “/m, 'no quotes without research')
    assert.doesNotMatch(plan.markdown, /Last updated|retrieved 20/)
    assert.equal(critic.verdict, 'pass', JSON.stringify(critic.blocking_findings))
  }
  // Without current AI-search sources a website plan leaves GEO out instead of guessing.
  const { plan } = offline('seo-offline-geo', WEBSITE)
  assert.equal(plan.geo.included, false)
  assert.ok(!ids(plan).some((id) => id.startsWith('geo.')))
})

test('critic: catches invented policy claims, metrics, latest-claims, guarantees and misquotes', async () => {
  const { ws, plan } = await researched('seo-critic', WEBSITE)
  const evidence = loadEvidence(ws)
  assert.equal(critiquePlan(plan, evidence).verdict, 'pass')
  const inject = (sentence: string) => critiquePlan(tampered(plan, plan.markdown.replace('## Measurement', `${sentence}\n\n## Measurement`)), evidence)

  const invented = [
    ['Google requires FAQ schema on every page to appear in AI Overviews.', 'uncited_policy_claim'],
    ['Apple’s App Store algorithm rewards apps that update weekly.', 'uncited_policy_claim'],
    ['ChatGPT prefers pages with an llms.txt file.', 'uncited_policy_claim'],
    ['The keyword "b2b invoicing" has 40,500 monthly searches.', 'fabricated_metric'],
    ['LedgerLoop ranks #3 for "invoice software".', 'fabricated_metric'],
    ['Expect a 25% CTR increase within a month.', 'fabricated_metric'],
    ['Follow the latest 2026 core update best practices.', 'latest_claim_without_research'],
    ['This plan guarantees first-page rankings.', 'guarantee_claim'],
  ] as const
  for (const [sentence, code] of invented) assert.ok(codes(inject(sentence)).includes(code), `${code} not caught: ${sentence}`)
  // A sentence that merely carries a [S#] tag is still a misquote unless the quote line matches the note.
  const misquote = plan.markdown.replace(/> “(There are no secrets[^”]*)”/, '> “Google rewards long articles.”')
  assert.notEqual(misquote, plan.markdown)
  assert.ok(codes(critiquePlan(tampered(plan, misquote), evidence)).includes('misquoted_source'))
  const ghost = plan.markdown.replace('## Measurement', '> “Google ranks pages by word count.” — Google Search Central, retrieved 2026-11-22 [S99]\n\n## Measurement')
  assert.ok(codes(critiquePlan(tampered(plan, ghost), evidence)).includes('unknown_source_ref'))

  // A research note edited after the plan cited it: the citation no longer holds.
  const cited = plan.sources[0]!
  const loaded = findNote(ws, cited.note_id)
  editNote(ws, cited.note_id, { expectedRevision: loaded.revision, ops: [{ op: 'set', add_tags: ['reviewed'] }] })
  assert.ok(codes(critiquePlan(plan, loadEvidence(ws))).includes('edited_source'))
})

test('critic: stale sources, offline plans that pretend research, and website work for an app-only brand', async () => {
  const { ws, plan } = await researched('seo-critic-2', APP_ONLY)
  const later = loadEvidence(ws, { now: new Date('2027-08-01T00:00:00Z') })
  assert.ok(codes(critiquePlan(plan, later)).includes('stale_citation'), 'the same plan read nine months later is stale')

  const withSiteWork: SeoStrategy = {
    ...plan,
    decisions: [...plan.decisions, { ...plan.decisions[0]!, id: 'x.sitemap', action: 'do_now', title: 'Submit an XML sitemap', statement: 'Submit an XML sitemap and add hreflang tags.' }],
  }
  assert.ok(codes(critiquePlan(withSiteWork, loadEvidence(ws))).includes('assumes_nonexistent_website'))

  const off = offline('seo-critic-3', APP_ONLY)
  const pretending: SeoStrategy = { ...off.plan, label: 'evidence_backed', decisions: off.plan.decisions.map((decision) => ({ ...decision, status: decision.requires.length ? 'cited' : decision.status })) }
  pretending.markdown = renderPlan(pretending)
  assert.ok(codes(critiquePlan(pretending, loadEvidence(off.ws))).includes('offline_claims_research'))
  const latest = tampered(off.plan, off.plan.markdown.replace('## Measurement', 'Apply the current Google ranking guidelines from this year’s update.\n\n## Measurement'))
  const report = codes(critiquePlan(latest, loadEvidence(off.ws)))
  assert.ok(report.includes('latest_claim_without_research') && report.includes('uncited_policy_claim'))
  const approved = critiquePlan({ ...off.plan, authorizes: ['publish'] as never, approval: {} as never }, loadEvidence(off.ws))
  assert.ok(codes(approved).includes('authorizes_action'))
})

test('drafts are local and gitignored; agents are refused; the interview stays brand-scoped', async () => {
  const { root, ws } = brand('seo-local')
  answerAll(ws, WEBSITE)
  await recordOfficial(ws)
  const { saved } = draftSeoStrategy(ws, null, { adapter: replayAdapter(officialBundle()) })
  assert.match(saved!.markdown, /^brand\/\.private\/strategy\/seo\/drafts\/seo_\d{8}_[0-9a-f]{12}\.md$/)
  assert.equal(fs.statSync(path.join(root, saved!.json)).mode & 0o777, 0o600)
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8')
  assert.match(ignore, /^brand\/\.private\/$/m)
  // A quote lives in its research note and in derived local drafts only; nothing under tracked brand/ paths.
  const quote = 'You don\'t need to create new machine readable files, AI text files, or markup to appear in these features.'
  for (const file of filesContaining(path.join(root, 'brand'), quote)) assert.match(path.relative(root, file), /^brand\/\.private\//)

  process.env.BRAND_OS_AGENT_TOKEN = 'bos_agent_anything'
  try {
    assert.throws(() => draftSeoStrategy(ws, null, { adapter: unavailableAdapter(), save: false }), /Refusing while BRAND_OS_AGENT_TOKEN is set/)
    assert.throws(() => recordAnswer(ws, { question_id: 'seo.presence.web', value: 'none' }), /Refusing/)
  } finally {
    delete process.env.BRAND_OS_AGENT_TOKEN
  }
  // Another brand's interview file is not read.
  const other = brand('seo-other')
  fs.mkdirSync(path.join(other.root, 'brand/.private/strategy/seo'), { recursive: true })
  fs.copyFileSync(path.join(root, 'brand/.private/strategy/seo/interview.json'), path.join(other.root, 'brand/.private/strategy/seo/interview.json'))
  assert.throws(() => readInterview(other.ws), (error: unknown) => error instanceof SeoError && error.code === 'wrong_brand')
})
