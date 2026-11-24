import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  addPersonalStrategyQuestions,
  applyInit,
  brandApplicability,
  ensureApprovalSecret,
  InterviewEngine,
  isOpenAnswer,
  latestAnswers,
  nextReport,
  PERSONAL_FRAMEWORK_SOURCES,
  writeStarterWorkspace,
} from '@brand-os/brand-core'
import type { DocumentModel, InitInput } from '@brand-os/brand-core'
import type { VisualDocument, VisualEntry } from '@brand-os/brand-core/visual'
import { buildProjection, type StudioProjection } from '../apps/studio/src/projection.js'

/**
 * BOS-15: one definition of "applies". For three synthetic configurations the CLI (`brand:next`, completeness) and the
 * Studio projection agree item by item on applicable / answered / missing, and a missing framework item always has a
 * question behind it that `brand:next` asks. Synthetic data only (Alex Example); no real brand.
 */

process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')

const SLUG = 'alex-example'

function brand(extra: Partial<InitInput>): { root: string; engine: InterviewEngine; proof: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-applicability-'))
  writeStarterWorkspace(root)
  applyInit(root, { name: 'Alex Example', slug: SLUG, industry: 'consulting', language: 'en', languages: ['en', 'fa', 'tr'], mascot: false, gamification: false, publish: 'private', ...extra })
  return { root, engine: new InterviewEngine(root), proof: ensureApprovalSecret(root) }
}

/** Synthetic answers, approved. Only questions that apply are answered; the rest stay open on purpose. */
function answerAndApprove(engine: InterviewEngine, proof: string, answers: Record<string, string>): void {
  for (const [id, value] of Object.entries(answers)) {
    const result = engine.answerQuestion(id, value)
    assert.equal(result.kind, 'recorded', `${id}: ${result.message}`)
  }
  const approved = engine.approvals().approveBatch({ ids: Object.keys(answers) }, proof)
  assert.equal(approved.approved, Object.keys(answers).length, JSON.stringify(approved.results))
}

const PERSONAL_ANSWERS: Record<string, string> = {
  'personal.identity.public_name': 'Alex Example',
  'personal.identity.headline': 'Example advisor for sample teams',
  'personal.positioning.known_for': 'Sample positioning work',
  'personal.positioning.primary_audience': 'Founders of example studios',
  'personal.positioning.outcome': 'Clearer sample decisions',
  'personal.services.offers': 'Example workshop; sample advisory retainer',
  'personal.content.channels': 'Example newsletter',
  'personal.content.pillars': 'Sample pillar one; sample pillar two',
  'personal.goals.outcomes': 'Grow the example audience',
  'personal.governance.reviewer': 'Alex Example reviews every draft',
}

interface Seen {
  where: string
  id: string
  state: 'approved' | 'draft' | 'missing' | 'not_applicable' | 'withheld' | 'other'
  unanswered: boolean
  stands_for: string | null
  profile_na: boolean
}

function fromDocument(doc: DocumentModel | undefined, where: string): Seen[] {
  if (!doc) return []
  const out: Seen[] = []
  for (const section of doc.sections) {
    for (const item of section.items) {
      if (item.tag === 'recommendation') continue
      const state = item.withheld ? 'withheld' : item.tag === 'approved' ? 'approved' : item.tag === 'assumption' ? 'draft' : 'missing'
      out.push({ where: `${where}/${section.id}`, id: item.id, state, unanswered: item.tag === 'missing' && item.note === 'Not answered yet.', stands_for: item.stands_for ?? null, profile_na: false })
    }
    for (const row of section.not_applicable ?? []) out.push({ where: `${where}/${section.id}`, id: row.id, state: 'not_applicable', unanswered: false, stands_for: null, profile_na: true })
  }
  return out
}

function entriesOf(value: unknown, out: VisualEntry[] = []): VisualEntry[] {
  if (Array.isArray(value)) value.forEach((child) => entriesOf(child, out))
  else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.id === 'string' && typeof record.state === 'string' && 'missing_reason' in record && 'value' in record) out.push(record as unknown as VisualEntry)
    else Object.values(record).forEach((child) => entriesOf(child, out))
  }
  return out
}

function fromVisual(doc: VisualDocument | undefined, where: string): Seen[] {
  if (!doc) return []
  return entriesOf(doc.blocks.filter((block) => block.type !== 'citation_list')).map((entry) => ({
    where,
    id: entry.id,
    state: entry.state === 'approved' || entry.state === 'stale' ? 'approved' : entry.state === 'assumption' ? 'draft' : entry.state === 'missing' ? 'missing' : entry.state === 'not_applicable' ? 'not_applicable' : entry.state === 'withheld' ? 'withheld' : 'other',
    unanswered: entry.state === 'missing' && entry.missing_reason === 'unanswered',
    stands_for: entry.stands_for ?? null,
    profile_na: entry.na_reason === 'profile',
  }))
}

/** Every framework item Studio shows: Brand Book, business and marketing plans, canvas, Strategy lab, plans. */
function studioItems(p: StudioProjection): Seen[] {
  const v = p.visual
  assert.ok(v, 'the visual projection was built')
  const items = [
    ...fromDocument(p.documents['brand-book'], 'brand-book'),
    ...fromDocument(p.documents['business-plan'], 'business-plan'),
    ...fromDocument(p.documents['marketing-plan'], 'marketing-plan'),
  ]
  if (v.bmc.applies) items.push(...fromVisual(v.bmc.internal, 'bmc'))
  if (v.plans?.applies) for (const [kind, doc] of Object.entries(v.plans.internal)) items.push(...fromVisual(doc as VisualDocument, kind))
  if (v.bmc.applies && v.strategy) {
    items.push(...fromVisual(v.strategy.swot.internal, 'swot'))
    items.push(...fromVisual(v.strategy.value_proposition.internal, 'vpc'))
  }
  return items
}

/** The CLI side of the agreement, checked item by item against what Studio shows. */
function assertAgreement(engine: InterviewEngine, p: StudioProjection): { missing: Seen[]; mapped: Seen[]; notApplicable: Seen[] } {
  const applicability = brandApplicability(engine)
  const report = nextReport(engine, { limit: 50 })
  const open = new Set(engine.queue(1000).map((question) => question.id))
  assert.equal(report.profile.open, open.size, 'brand:next open is the queue')
  const answers = latestAnswers(engine.ledger().records)
  const status = engine.statusReport()
  const items = studioItems(p)
  const missing: Seen[] = []
  const mapped: Seen[] = []
  const notApplicable: Seen[] = []
  for (const item of items) {
    const label = `${item.where} ${item.id}`
    if (item.profile_na) {
      notApplicable.push(item)
      assert.equal(item.state, 'not_applicable', `${label}: a question the profile does not ask is not applicable`)
      assert.equal(applicability.applies(item.id), false, `${label}: Studio says not applicable, the CLI must not ask it`)
      assert.ok(!open.has(item.id), `${label}: never counted as open`)
      continue
    }
    if (item.stands_for) {
      mapped.push(item)
      assert.equal(applicability.state(item.stands_for), 'mapped', `${label}: stands for ${item.stands_for}`)
      assert.ok(PERSONAL_FRAMEWORK_SOURCES.some((row) => row.target === item.stands_for && row.sources.includes(item.id)), `${label}: a listed mapping`)
    }
    if (item.state === 'approved') assert.equal(isOpenAnswer(answers.get(item.id)), false, `${label}: approved in Studio, answered for the CLI`)
    if (item.unanswered) {
      missing.push(item)
      // Invariant: Studio shows it missing ⇒ a question of the active profile that brand:next asks and open counts
      // (directly, or once the dependency it waits for, itself open, is answered).
      assert.equal(applicability.applies(item.id), true, `${label}: missing in Studio, so it must apply`)
      const question = engine.question(item.id)!
      const waiting = question.depends_on.some((dependency) => open.has(dependency) || isOpenAnswer(answers.get(dependency)))
      assert.ok(open.has(item.id) || waiting, `${label}: missing in Studio but brand:next does not ask it`)
      const score = status.modules.find((module) => module.module === question.module)
      assert.ok(score && score.applicable > 0, `${label}: completeness counts its module`)
    }
  }
  if (report.profile.open === 0) assert.deepEqual(missing.filter((item) => open.has(item.id)), [], 'open = 0 ⇒ nothing missing without a question')
  return { missing, mapped, notApplicable }
}

test('(a) personal brand without a business facet: frameworks do not apply, the Brand Book maps the person', () => {
  const { root, engine, proof } = brand({ profile: 'personal-brand', facets: ['speaker-author'] })
  answerAndApprove(engine, proof, PERSONAL_ANSWERS)
  const applicability = brandApplicability(engine)
  assert.equal(applicability.frameworks, false)
  assert.equal(applicability.practice, false)
  const { projection } = buildProjection(root, SLUG)
  assert.equal(projection.visual?.bmc.applies, false)
  assert.equal(projection.visual?.plans?.applies, false)
  // No business question applies and none is mapped: the business plan is not applicable as a whole; the marketing
  // plan keeps only the shared brand questions the profile asks (promise, voice pairs, forbidden language).
  assert.ok(projection.documents['business-plan']!.sections.every((section) => section.status === 'not_applicable'), 'business plan is not applicable')
  assert.equal(projection.documents['business-plan']!.counts.missing, 0)
  const marketingItems = projection.documents['marketing-plan']!.sections.flatMap((section) => section.items)
  assert.ok(marketingItems.every((item) => item.id.startsWith('brand.') || item.id.startsWith('template:') || item.stands_for?.startsWith('brand.')), marketingItems.map((item) => item.id).join())
  const cells = projection.publishing!.cells.filter((cell) => cell.document_type === 'business_plan' && cell.readiness !== 'blocked')
  assert.ok(cells.length > 0 && cells.every((cell) => cell.readiness === 'not_applicable'))
  // The Brand Book shows the person: public name and approver come from personal answers, with their ids.
  const book = projection.documents['brand-book']!
  const overview = book.sections.find((section) => section.id === 'overview')!
  const name = overview.items.find((item) => item.id === 'personal.identity.public_name')
  assert.equal(name?.stands_for, 'brand.identity.public_name_override')
  assert.equal(name?.tag, 'approved')
  assert.ok(overview.not_applicable?.some((row) => row.id === 'business.identity.trade_name'), 'a company trade name is not applicable, not missing')
  // No business facet: the practice rows do not apply, so the primary customer is not mapped onto the audience.
  assert.ok(!overview.items.some((item) => item.id === 'personal.positioning.primary_audience'))
  // Coverage maths: business modules with no applicable question say so instead of 100 %.
  const business = projection.modules.filter((module) => module.group === 'business')
  assert.ok(business.length > 0 && business.every((module) => module.applicable === 0))
  assert.equal(projection.overview.groups.find((group) => group.group === 'business')?.applicable, 0)
  const report = nextReport(engine, { limit: 50 })
  assert.equal(report.frameworks.applies, false)
  assert.match(report.frameworks.note ?? '', /universal/)
  assertAgreement(engine, projection)
})

test('(b) personal brand with business facets: the frameworks describe the person’s practice from personal answers', () => {
  const { root, engine, proof } = brand({ profile: 'personal-brand', facets: ['founder-executive', 'consultant-expert'] })
  answerAndApprove(engine, proof, { ...PERSONAL_ANSWERS, 'personal.consulting.engagements': 'Example two-week sprint' })
  const applicability = brandApplicability(engine)
  assert.equal(applicability.frameworks, true)
  assert.equal(applicability.practice, true)
  // Purpose, vision, values and promise apply to a person: the profile asks them.
  for (const id of ['brand.strategy.purpose', 'brand.strategy.vision', 'brand.strategy.values', 'brand.strategy.promise']) assert.equal(applicability.applies(id), true, id)
  const report = nextReport(engine, { limit: 50 })
  assert.ok(report.next.some((question) => question.id === 'brand.strategy.purpose'))
  assert.equal(report.frameworks.practice, true)
  assert.match(report.frameworks.note ?? '', /universal/)
  assert.ok(report.suggested_actions.some((line) => /own practice/.test(line)))

  const { projection } = buildProjection(root, SLUG)
  const v = projection.visual!
  assert.equal(v.bmc.applies, true)
  const zones = (v.bmc.internal.blocks.find((block) => block.type === 'business_model_canvas') as Extract<VisualDocument['blocks'][number], { type: 'business_model_canvas' }>).zones
  const segments = zones.find((zone) => zone.zone_id === 'customer_segments')!
  const audience = segments.entries.find((entry) => entry.id === 'personal.positioning.primary_audience')
  assert.equal(audience?.stands_for, 'business.customer.primary_segment')
  assert.equal(audience?.state, 'approved')
  assert.equal(audience?.value, 'Founders of example studios')
  const value = zones.find((zone) => zone.zone_id === 'value_propositions')!
  assert.deepEqual(value.entries.map((entry) => entry.id), ['personal.positioning.outcome', 'personal.services.offers', 'personal.consulting.engagements'])
  assert.equal(zones.find((zone) => zone.zone_id === 'key_partners')!.state, 'not_applicable', 'ventures stay relationships, never key partners')
  assert.ok(zones.every((zone) => zone.next_questions.every((question) => applicability.applies(question.id))), 'every next question is one brand:next asks')
  // Public edition: an unpublished personal answer is never shown, mapped or not.
  for (const entry of entriesOf(v.bmc.public.blocks)) if (entry.stands_for) assert.equal(entry.value, null, `${entry.id} is not published`)
  // OKR: the outcome and the measurement are the personal answers, cited by id.
  const okr = v.plans!.internal.okr.blocks[0] as Extract<VisualDocument['blocks'][number], { type: 'okr_tree' }>
  assert.equal(okr.root?.id, 'personal.goals.outcomes')
  assert.equal(okr.root?.stands_for, 'business.goals.annual')
  // Marketing plan: content pillars and the primary customer come from the personal answers.
  const marketing = projection.documents['marketing-plan']!
  const pillars = marketing.sections.flatMap((section) => section.items).find((item) => item.id === 'personal.content.pillars')
  assert.equal(pillars?.stands_for, 'business.marketing.pillars')
  assert.equal(marketing.sections.find((section) => section.id === 'measurement')?.status, 'not_applicable')
  // Command Center: business modules are not applicable; the canvas row counts only what applies.
  assert.ok(projection.modules.filter((module) => module.group === 'business').every((module) => module.applicable === 0))
  const { missing, mapped, notApplicable } = assertAgreement(engine, projection)
  assert.ok(mapped.length > 0 && notApplicable.length > 0)
  assert.ok(missing.every((item) => !item.id.startsWith('business.')), 'no business question is missing for a personal profile')

  // Answer every open question (synthetic "unknown" is a real answer): open = 0 and nothing is missing unanswered.
  for (const question of engine.queue(1000)) engine.answerQuestion(question.id, 'unknown')
  for (let round = 0; round < 5 && engine.queue(1000).length > 0; round += 1) for (const question of engine.queue(1000)) engine.answerQuestion(question.id, 'unknown')
  assert.equal(nextReport(engine, { limit: 50 }).profile.open, 0)
  const after = assertAgreement(engine, buildProjection(root, SLUG).projection)
  assert.deepEqual(after.missing.map((item) => `${item.where} ${item.id}`), [], 'open = 0 ⇒ no applicable framework item is missing without a question')
})

test('(c) universal with personal on: the whole bank applies and nothing is mapped', () => {
  const { root, engine, proof } = brand({ personal: true, facets: ['consultant-expert'] })
  answerAndApprove(engine, proof, { 'personal.identity.public_name': 'Alex Example', 'business.customer.primary_segment': 'Example studios' })
  const applicability = brandApplicability(engine)
  assert.equal(applicability.exclusive, false)
  assert.equal(applicability.frameworks, true)
  assert.equal(applicability.practice, false)
  assert.equal(applicability.state('business.customer.primary_segment'), 'applies')
  assert.equal(applicability.state('business.identity.trade_name'), 'applies')
  const report = nextReport(engine, { limit: 50 })
  assert.equal(report.frameworks.note, null)
  const { projection } = buildProjection(root, SLUG)
  const { mapped, notApplicable, missing } = assertAgreement(engine, projection)
  assert.deepEqual(mapped, [], 'a venture plan uses the business questions themselves')
  assert.ok(missing.some((item) => item.id === 'business.identity.trade_name'), 'the venture’s trade name is asked and shown as missing')
  assert.ok(notApplicable.every((item) => !engine.question(item.id)?.id.startsWith('business.identity.')))
  const zones = (projection.visual!.bmc.internal.blocks.find((block) => block.type === 'business_model_canvas') as Extract<VisualDocument['blocks'][number], { type: 'business_model_canvas' }>).zones
  assert.equal(zones.find((zone) => zone.zone_id === 'customer_segments')!.entries.find((entry) => entry.id === 'business.customer.primary_segment')?.state, 'approved')
  assert.ok(projection.modules.filter((module) => module.group === 'business').some((module) => module.applicable > 0))
})

test('brand:migrate adds the strategy questions to an older personal-brand profile, once, keeping the owner’s text', () => {
  const { root, engine } = brand({ profile: 'personal-brand', facets: ['consultant-expert'] })
  const file = path.join(root, 'brand', 'interview', 'profiles', 'personal-brand.yaml')
  const strategy = ['brand.strategy.purpose', 'brand.strategy.vision', 'brand.strategy.values', 'brand.strategy.promise']
  const older = fs.readFileSync(file, 'utf8').split('\n').filter((line) => !strategy.some((id) => line.trim() === `- ${id}`)).join('\n').replace('exclusive: true', '# owner note\nexclusive: true')
  fs.writeFileSync(file, older)
  assert.ok(strategy.every((id) => !brandApplicability(engine).applies(id)), 'an older profile does not ask them')
  assert.equal(addPersonalStrategyQuestions(root), 'brand/interview/profiles/personal-brand.yaml')
  assert.equal(addPersonalStrategyQuestions(root), null, 'idempotent')
  const text = fs.readFileSync(file, 'utf8')
  assert.match(text, /# owner note/)
  assert.ok(text.indexOf('brand.strategy.promise') < text.indexOf('brand.personality.traits'))
  const after = brandApplicability(engine)
  assert.ok(strategy.every((id) => after.applies(id)))
  assert.ok(strategy.every((id) => engine.queue(1000).some((question) => question.id === id)), 'brand:next asks them')
})
