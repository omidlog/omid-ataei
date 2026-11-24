import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import YAML from 'yaml'
import { allQuestions, applyInit, ensureApprovalSecret, entitySpec, InterviewEngine, normalizeEntityAnswer, writeStarterWorkspace } from '@brand-os/brand-core'
import {
  buildPlanDocuments,
  frameworkRegistry,
  illustrativeJourney,
  illustrativeOkr,
  illustrativeSostac,
  JOURNEY_LANES,
  PLAN_QUESTIONS,
  PLAN_TEXT,
  SOSTAC_SPECS,
  SOSTAC_STAGES,
  VISUAL_LANGS,
  visualProfilePermits,
  type JourneySwimlaneBlock,
  type OkrTreeBlock,
  type SostacBlock,
  type VisualDocument,
} from '@brand-os/brand-core/visual'

/**
 * Visual V3.3: customer journey swimlane, SOSTAC overview and OKR tree. Built through the same truth path as the
 * canvas: approved facts, labelled drafts, named gaps; the public edition carries approved, published answers only;
 * key results are structured (target, unit, source) and progress is never computed without a baseline.
 */
process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')

const NOW = new Date('2026-11-24T00:00:00Z')

function brand(): { root: string; engine: InterviewEngine; proof: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-plan-'))
  writeStarterWorkspace(root)
  applyInit(root, { name: 'Plan Brand', slug: 'plan-brand', industry: 'education', language: 'en', languages: ['en', 'fa', 'tr'], mascot: false, gamification: false, publish: 'public' })
  return { root, engine: new InterviewEngine(root), proof: ensureApprovalSecret(root) }
}

function answer(engine: InterviewEngine, id: string, value: string): void {
  const result = engine.answerQuestion(id, value)
  assert.equal(result.kind, 'recorded', `${id}: ${result.message}`)
}

function approve(engine: InterviewEngine, proof: string, ids: string[]): void {
  const result = engine.approvals().approveBatch({ ids }, proof)
  assert.equal(result.approved, ids.length, JSON.stringify(result.results))
}

function journey(doc: VisualDocument): JourneySwimlaneBlock {
  const block = doc.blocks.find((item): item is JourneySwimlaneBlock => item.type === 'journey_swimlane')
  assert.ok(block)
  return block
}

function sostac(doc: VisualDocument): SostacBlock {
  const block = doc.blocks.find((item): item is SostacBlock => item.type === 'sostac_overview')
  assert.ok(block)
  return block
}

function okr(doc: VisualDocument): OkrTreeBlock {
  const block = doc.blocks.find((item): item is OkrTreeBlock => item.type === 'okr_tree')
  assert.ok(block)
  return block
}

// ---- structured list fields ---------------------------------------------------------------------------------

test('key results are structured: target, unit and source required; numbers canonical; money refused; one objective', () => {
  const spec = entitySpec('business.goals.key_results')!
  const ok = normalizeEntityAnswer(spec, 'Learners finishing week one | ۲۰ | 6 | learners | product analytics | 0 | 2026-11-20 | links: obj-1')
  assert.ok(ok.ok, ok.ok ? '' : ok.message)
  const item = (JSON.parse(ok.value) as { items: Array<Record<string, unknown>> }).items[0]!
  assert.deepEqual(item, { id: 'kr-1', name: 'Learners finishing week one', target: '20', current: '6', unit: 'learners', source: 'product analytics', baseline: '0', measured_on: '2026-11-20', links: ['obj-1'] })
  const again = normalizeEntityAnswer(spec, ok.value)
  assert.ok(again.ok && again.value === ok.value, 'canonical round trip')
  const decimal = normalizeEntityAnswer(spec, 'Decimal | 012.50 | ۳٫۵ | % | analytics')
  assert.ok(decimal.ok)
  assert.deepEqual((JSON.parse(decimal.value) as { items: Array<{ target: string; current: string }> }).items.map((kr) => [kr.target, kr.current]), [['12.5', '3.5']])
  // No free-text-only key result: target, unit and source are required.
  for (const line of ['Grow a lot', 'Grow | 40', 'Grow | 40 | | %', 'Grow | 40 | | | analytics']) assert.equal(normalizeEntityAnswer(spec, line).ok, false, line)
  for (const line of ['Grow | forty | | % | analytics', 'Grow | 1,000 | | % | analytics', 'Grow | 40 | | % | analytics | | 2026-02-30']) assert.equal(normalizeEntityAnswer(spec, line).ok, false, line)
  // Audit (Visual V3): spoken Persian and Turkish spellings and suffixes are currencies too.
  for (const unit of ['USD', '€', 'تومان', 'lira', 'تومن', 'هزار تومن', 'dolar', 'avro', 'Türk lirası', '₽']) {
    const refused = normalizeEntityAnswer(spec, `Revenue | 5000 | | ${unit} | billing`)
    assert.equal(refused.ok, false, unit)
    assert.match(refused.ok ? '' : refused.message, /restricted finance/)
  }
  for (const unit of ['learners', 'trials', 'نفر', 'öğrenci', 'Avrupa sales']) assert.ok(normalizeEntityAnswer(spec, `Grow | 40 | | ${unit} | analytics`).ok, `${unit} is not a currency`)
  assert.equal(normalizeEntityAnswer(spec, 'Grow | 40 | | % | analytics | links: obj-1, obj-2').ok, false, 'a key result belongs to one objective')
  assert.equal(normalizeEntityAnswer(spec, 'Grow | 40 | | % | analytics | links: seg-1').ok, false, 'key results link only to objectives')
})

test('knowledge graph: the committed file has every edge the question bank defines (V3.3 journey and OKR links included)', () => {
  // `materialize` only writes missing files, so a new question's edges reach the committed graph only by regenerating it.
  const committed = YAML.parse(fs.readFileSync(path.resolve('brand/interview/knowledge-graph.yaml'), 'utf8')) as { edges: Array<{ from: string; to: string; relation: string }> }
  const key = (edge: { from: string; to: string; relation: string }) => `${edge.from} ${edge.relation} ${edge.to}`
  const have = new Set(committed.edges.map(key))
  const expected = allQuestions().flatMap((question) => [
    ...question.depends_on.map((from) => ({ from, to: question.id, relation: 'prerequisite' })),
    ...question.related_ids.map((to) => ({ from: question.id, to, relation: 'related' })),
  ])
  const missing = expected.filter((edge) => !have.has(key(edge))).map(key)
  assert.deepEqual(missing, [], 'regenerate brand/interview/knowledge-graph.yaml from the question bank')
  assert.equal(committed.edges.length, expected.length, 'no stale edges either')
})

test('journey stages: lanes and a standard emotion scale; links only to customer segments', () => {
  const spec = entitySpec('business.marketing.journey_stages')!
  assert.deepEqual(spec.fields.map((field) => field.key), ['name', 'goal', 'touchpoints', 'actions', 'emotion', 'pains', 'opportunities', 'evidence'])
  const ok = normalizeEntityAnswer(spec, 'Discover | find a course | search | reads reviews | Negative | too many apps | one-line promise | 12 interviews | links: seg-1')
  assert.ok(ok.ok, ok.ok ? '' : ok.message)
  assert.equal(normalizeEntityAnswer(spec, 'Discover | | | | furious').ok, false, 'emotion is one of the standard options')
  assert.equal(normalizeEntityAnswer(spec, 'Discover | links: obj-1').ok, false)
  for (const lang of VISUAL_LANGS) for (const key of ['very_positive', 'positive', 'neutral', 'negative', 'very_negative'] as const) assert.ok(PLAN_TEXT[lang].journey.emotion[key])
})

// ---- repository documents -----------------------------------------------------------------------------------

test('a fresh brand: every V3.3 question exists, every document is missing, nothing is invented', () => {
  const { engine } = brand()
  const bank = new Set(engine.questions().map((question) => question.id))
  for (const id of PLAN_QUESTIONS) assert.ok(bank.has(id), `${id} is a real question`)
  for (const spec of SOSTAC_SPECS) for (const id of spec.related) assert.ok(bank.has(id), `${spec.stage}: related ${id}`)
  assert.deepEqual(SOSTAC_SPECS.map((spec) => spec.stage), [...SOSTAC_STAGES])
  const docs = buildPlanDocuments(engine, 'internal', { now: NOW })
  assert.equal(journey(docs.journey).stages.length, 0)
  assert.equal(journey(docs.journey).data_state, 'missing')
  assert.deepEqual(sostac(docs.sostac).sections.map((section) => section.state), ['missing', 'missing', 'missing', 'missing', 'missing', 'missing'])
  assert.equal(okr(docs.okr).objectives.length, 0)
  assert.equal(okr(docs.okr).unlinked.length, 0)
  for (const doc of Object.values(docs)) {
    assert.equal(doc.illustrative, false)
    assert.equal(doc.print_profile, 'canvas_a3_landscape')
    assert.equal(doc.framework_refs[0]!.permitted_claim, 'informed_by')
  }
  assert.deepEqual(journey(docs.journey).next_questions.map((q) => q.id), ['business.marketing.journey_stages', 'business.marketing.journey'])
})

test('journey: stages in owner order with lanes, emotion and segment names; a link to a hidden segment is unresolved', () => {
  const { engine, proof } = brand()
  answer(engine, 'business.model.segments', 'Working adults | short sessions | primary')
  answer(engine, 'business.marketing.journey_stages', 'Discover | find a course | search, a friend | reads reviews | neutral | too many apps | promise on first screen | 12 interviews | links: seg-1, seg-4\nFirst week | keep the habit | reminder | misses day three | very_negative | wrong hour')
  approve(engine, proof, ['business.model.segments', 'business.marketing.journey_stages'])
  const doc = buildPlanDocuments(engine, 'internal', { now: NOW }).journey
  const block = journey(doc)
  assert.equal(block.source.state, 'approved')
  assert.equal(block.data_state, 'partial', 'the prose hypothesis is still unanswered')
  assert.deepEqual(block.stages.map((stage) => [stage.order, stage.name, stage.emotion]), [[1, 'Discover', 'neutral'], [2, 'First week', 'very_negative']])
  assert.deepEqual(block.stages[0]!.lanes, { touchpoints: 'search, a friend', actions: 'reads reviews', pains: 'too many apps', opportunities: 'promise on first screen' })
  assert.equal(block.stages[0]!.evidence, '12 interviews')
  assert.deepEqual(block.stages[0]!.segments, [{ id: 'seg-1', name: 'Working adults' }, { id: 'seg-4', name: null }])
  assert.deepEqual(block.stages[1]!.lanes.opportunities, null, 'an empty lane stays empty')
  assert.equal(JSON.stringify(doc).includes('brand-os.entity-list'), false, 'the stored JSON never reaches the document')
  assert.deepEqual(JOURNEY_LANES, ['touchpoints', 'actions', 'emotion', 'pains', 'opportunities'])
})

test('OKR tree: key results under their objective; progress only from a baseline; unlinked key results kept apart', () => {
  const { engine, proof } = brand()
  answer(engine, 'business.goals.annual', 'Prove the segment is real.')
  answer(engine, 'business.goals.objectives', 'Build a daily habit | retention first | 2027 Q1\nClear price')
  answer(
    engine,
    'business.goals.key_results',
    [
      'Active 5 of 7 days | 40 | 26 | % | analytics | 12 | 2026-11-20 | links: obj-1',
      'Finish week one | 20 | 6 | learners | lesson log | | | links: obj-1',
      'Pilots signed | 3 | | pilots | sales tracker | | | links: obj-2',
      'Price questions | 5 | 4 | questions | help desk | 9 | | links: obj-2',
      'Partners live | 2 | 1 | channels | partner list | 0 | | links: obj-7',
      'Unattached | 10 | | % | survey',
    ].join('\n'),
  )
  approve(engine, proof, ['business.goals.annual', 'business.goals.objectives'])
  const block = okr(buildPlanDocuments(engine, 'internal', { now: NOW }).okr)
  assert.equal(block.root?.state, 'approved')
  assert.equal(block.objectives_source.state, 'approved')
  assert.equal(block.key_results_source.state, 'assumption', 'draft key results are labelled, never shown as approved')
  assert.deepEqual(block.objectives.map((objective) => [objective.name, objective.period, objective.key_results.map((kr) => kr.name)]), [
    ['Build a daily habit', '2027 Q1', ['Active 5 of 7 days', 'Finish week one']],
    ['Clear price', null, ['Pilots signed', 'Price questions']],
  ])
  const [active, week, pilots, price] = [...block.objectives[0]!.key_results, ...block.objectives[1]!.key_results]
  assert.equal(active!.measure, 'measured')
  assert.equal(active!.progress, (26 - 12) / (40 - 12))
  assert.equal(week!.measure, 'no_baseline')
  assert.equal(week!.progress, null, 'no baseline, no progress: zero is never assumed')
  assert.equal(pilots!.measure, 'not_measured')
  assert.equal(pilots!.current, null, 'a missing current value stays missing')
  assert.equal(price!.progress, (4 - 9) / (5 - 9), 'a key result that goes down is measured from its baseline')
  assert.deepEqual(block.unlinked.map((kr) => [kr.name, kr.objective]), [
    ['Partners live', { id: 'obj-7', name: null }],
    ['Unattached', null],
  ])
})

test('SOSTAC: six stages in canonical order from existing answers; list answers carry their items', () => {
  const { engine, proof } = brand()
  answer(engine, 'business.customer.primary_segment', 'Working adults.')
  answer(engine, 'business.marketing.channels', 'Founder posts only.')
  answer(engine, 'business.goals.objectives', 'Build a daily habit')
  approve(engine, proof, ['business.customer.primary_segment', 'business.goals.objectives'])
  const block = sostac(buildPlanDocuments(engine, 'internal', { now: NOW }).sostac)
  assert.deepEqual(block.sections.map((section) => [section.order, section.stage]), SOSTAC_STAGES.map((stage, index) => [index + 1, stage]))
  const by = Object.fromEntries(block.sections.map((section) => [section.stage, section]))
  assert.equal(by.situation!.state, 'partial')
  assert.equal(by.tactics!.entries.find((entry) => entry.id === 'business.marketing.channels')?.state, 'assumption')
  assert.deepEqual(by.objectives!.entries.find((entry) => entry.id === 'business.goals.objectives')?.items?.map((item) => item.name), ['Build a daily habit'])
  assert.equal(by.control!.state, 'missing')
  assert.ok(by.control!.next_questions.some((q) => q.id === 'business.goals.key_results'))
  assert.equal(JSON.stringify(block).includes('business.marketing.budget'), false, 'the restricted budget is never read')
})

test('public edition: drafts never appear; an approved internal answer is not published', () => {
  const { engine, proof } = brand()
  answer(engine, 'business.marketing.journey_stages', 'DRAFT-STAGE-CANARY | goal | touch')
  answer(engine, 'business.goals.objectives', 'DRAFT-OBJECTIVE-CANARY')
  answer(engine, 'business.goals.key_results', 'DRAFT-KR-CANARY | 10 | 2 | % | analytics | links: obj-1')
  answer(engine, 'business.marketing.channels', 'DRAFT-CHANNEL-CANARY')
  answer(engine, 'business.offer.value_proposition', 'APPROVED-INTERNAL-CANARY')
  approve(engine, proof, ['business.offer.value_proposition'])
  const pub = buildPlanDocuments(engine, 'public', { now: NOW })
  const text = JSON.stringify(pub)
  assert.equal(text.includes('CANARY'), false, 'nothing that is not approved and published reaches the public edition')
  assert.equal(journey(pub.journey).stages.length, 0)
  assert.equal(okr(pub.okr).objectives.length + okr(pub.okr).unlinked.length, 0)
  for (const doc of Object.values(pub)) {
    assert.equal(doc.audience, 'public')
    assert.equal(doc.classification, 'public')
  }
  assert.ok(sostac(pub.sostac).sections.every((section) => section.entries.every((entry) => entry.value === null)))
  assert.ok(sostac(pub.sostac).sections.flatMap((section) => section.entries).every((entry) => entry.missing_reason === null || entry.missing_reason === 'not_published'))
  // The internal edition shows the same drafts, labelled.
  const internal = buildPlanDocuments(engine, 'internal', { now: NOW })
  assert.equal(journey(internal.journey).source.state, 'assumption')
  assert.ok(JSON.stringify(internal).includes('DRAFT-STAGE-CANARY'))
})

test('a list holding legacy free text is flagged and never parsed into stages or key results', () => {
  const { root } = brand()
  const file = path.join(root, 'brand', 'interview', 'answer-ledger.yaml')
  const ledger = YAML.parse(fs.readFileSync(file, 'utf8')) as { records: Array<Record<string, unknown>> }
  const legacy = (id: string, n: number, value: string) => ({ answer_id: `ans-90${n}`, question_id: id, value, raw_answer: value, source_type: 'owner', source_reference: null, authority: 'confirmed_by_owner', confidence: null, status: 'draft', last_updated: '2026-01-01T00:00:00.000Z', reviewed_by: null, visibility: 'internal', uncertainty: null, session_id: 'legacy', normalized: null, superseded_by: null, disposition_reason: null, private_ref: null })
  ledger.records.push(legacy('business.marketing.journey_stages', 1, 'People find us, then they try us.'), legacy('business.goals.key_results', 2, 'Grow a lot this year.'))
  fs.writeFileSync(file, YAML.stringify(ledger))
  const docs = buildPlanDocuments(new InterviewEngine(root), 'internal', { now: NOW })
  assert.equal(journey(docs.journey).legacy, true)
  assert.equal(journey(docs.journey).stages.length, 0)
  assert.equal(journey(docs.journey).source.value, 'People find us, then they try us.')
  assert.equal(okr(docs.okr).legacy.key_results, true)
  assert.equal(okr(docs.okr).unlinked.length, 0)
})

// ---- framework, text, fixtures ------------------------------------------------------------------------------

test('framework registry: journey map, SOSTAC and OKR are "informed by", never certified', () => {
  for (const id of ['CUSTOMER-JOURNEY-MAP', 'SOSTAC', 'OKR']) {
    const ref = frameworkRegistry().get(id)
    assert.ok(ref, id)
    assert.equal(ref.permitted_claim, 'informed_by')
    assert.equal(ref.verified_on, null, 'nobody has checked the source page yet')
  }
  assert.match(frameworkRegistry().get('SOSTAC')!.usage_note, /registered trade mark of PR Smith/)
})

test('text catalogs: fa and tr define every key en defines, and every cited answer has a plain label', () => {
  const keys = (value: unknown, prefix = ''): string[] =>
    value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value).flatMap(([key, inner]) => keys(inner, `${prefix}${key}.`)) : [prefix]
  const en = keys(PLAN_TEXT.en).sort()
  for (const lang of ['fa', 'tr'] as const) assert.deepEqual(keys(PLAN_TEXT[lang]).sort(), en, lang)
  for (const lang of VISUAL_LANGS) {
    for (const id of PLAN_QUESTIONS) assert.ok(PLAN_TEXT[lang].labels[id], `${lang} label for ${id}`)
    assert.equal(PLAN_TEXT[lang].journey.emptySteps.length, PLAN_TEXT.en.journey.emptySteps.length)
  }
})

test('golden fixtures: illustrative, every state, public edition drops drafts, empty variant draws nothing', () => {
  for (const lang of VISUAL_LANGS) {
    const j = illustrativeJourney(lang)
    const s = illustrativeSostac(lang)
    const o = illustrativeOkr(lang)
    for (const doc of [j, s, o]) {
      assert.equal(doc.illustrative, true)
      assert.equal(doc.origin, 'illustrative_fixture')
    }
    assert.equal(journey(j).stages.length, 5)
    assert.ok(journey(j).stages.some((stage) => stage.segments.some((link) => link.name === null)), 'one unresolved segment link')
    const tree = okr(o)
    assert.deepEqual(new Set([...tree.objectives.flatMap((objective) => objective.key_results), ...tree.unlinked].map((kr) => kr.measure)), new Set(['measured', 'no_baseline', 'not_measured']))
    assert.ok(tree.objectives.flatMap((objective) => objective.key_results).some((kr) => (kr.progress ?? 0) > 0 && (kr.progress ?? 0) < 1))
    assert.equal(tree.unlinked.length, 1)
    const states = new Set(sostac(s).sections.flatMap((section) => section.entries.map((entry) => entry.state)))
    for (const state of ['approved', 'assumption', 'stale', 'missing'] as const) assert.ok(states.has(state), `${lang} SOSTAC fixture has ${state}`)
    const pub = [illustrativeJourney(lang, 'public'), illustrativeSostac(lang, 'public'), illustrativeOkr(lang, 'public')]
    assert.equal(okr(pub[2]!).key_results_source.value, null, 'draft key results are not in the public edition')
    assert.ok(sostac(pub[1]!).sections.flatMap((section) => section.entries).every((entry) => entry.state !== 'assumption'))
    const empty = [illustrativeJourney(lang, 'internal', 'empty'), illustrativeOkr(lang, 'internal', 'empty')]
    assert.equal(journey(empty[0]!).stages.length, 0)
    assert.equal(okr(empty[1]!).objectives.length, 0)
  }
})

test('publishing profiles: the journey, SOSTAC and OKR views follow their plan (never public; investor and internal)', () => {
  for (const kind of ['customer_journey', 'sostac_overview', 'okr_tree'] as const) {
    assert.equal(visualProfilePermits('public', kind), false, `${kind} public`)
    assert.equal(visualProfilePermits('investor', kind), true, `${kind} investor`)
    assert.equal(visualProfilePermits('internal', kind), true, `${kind} internal`)
  }
  // Not gallery types yet (V3.2): no profile receives them through the publishing path.
  for (const kind of ['swot_tows', 'value_proposition'] as const) assert.equal(visualProfilePermits('internal', kind), false, kind)
  assert.equal(visualProfilePermits('public', 'business_model_canvas'), true)
})
