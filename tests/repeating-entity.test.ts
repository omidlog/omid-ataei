import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import YAML from 'yaml'
import {
  AGENT_TOKEN_ENV,
  allQuestions,
  applyEntityOperation,
  buildBusinessPlan,
  ENTITY_LIST_SCHEMA,
  ENTITY_QUESTION_IDS,
  ENTITY_SPECS,
  ensureApprovalSecret,
  entitySpec,
  InterviewEngine,
  isCanonicalEntityValue,
  latestAnswers,
  migrateEntityAnswers,
  normalizeEntityAnswer,
  normalizeStructured,
  parseStructured,
  readEntityList,
  renderDocumentMarkdown,
  serializeEntityList,
  validateEntityList,
  type EntityList,
} from '@brand-os/brand-core'
import { brandDir, TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

/**
 * Visual V3.1 (owner decision D3): the `repeating_entity` question type. All data is SYNTHETIC DEMO data for a mock
 * coffee roastery; no real brand appears here.
 */
useTestKey()

const SEGMENTS = 'business.model.segments'
const ACTIVITIES = 'business.model.key_activities'
const RESOURCES = 'business.model.key_resources'
const COSTS = 'business.model.cost_items'
const seg = entitySpec(SEGMENTS)!
const act = entitySpec(ACTIVITIES)!
const cost = entitySpec(COSTS)!

function brand(slug = 'entity-demo') {
  const root = brandDir({ slug })
  return { root, engine: new InterviewEngine(root), proof: ensureApprovalSecret(root) }
}

function list(value: unknown, spec = seg): EntityList {
  const read = readEntityList(spec, value)
  assert.equal(read.state, 'items', `not a list: ${String(value)}`)
  return (read as { list: EntityList }).list
}

function latest(engine: InterviewEngine, id: string) {
  return latestAnswers(engine.ledger().records).get(id)
}

// ---- validator and canonical form ------------------------------------------------------------------------

test('the four BMC list questions exist in the bank with canonical ids and a matching entity summary', () => {
  // V3.2 adds the SWOT / TOWS and Value Proposition Canvas lists (tests/visual-strategy.test.ts); Visual V3.3 adds the
  // journey stages and the structured OKR lists (tests/visual-plan.test.ts). The four BMC lists stay.
  assert.deepEqual([...ENTITY_QUESTION_IDS].filter((id) => id.startsWith('business.model.')).sort(), [ACTIVITIES, RESOURCES, COSTS, SEGMENTS].sort())
  assert.equal([...ENTITY_QUESTION_IDS].filter((id) => id.startsWith('business.swot.') || id.startsWith('business.fit.')).length, 11)
  const bank = new Map(allQuestions().map((question) => [question.id, question]))
  for (const id of ENTITY_QUESTION_IDS) {
    const question = bank.get(id)
    assert.ok(question, `${id} is in the question bank`)
    assert.equal(question.question_type, 'repeating_entity')
    assert.equal(question.completion_rule, 'structured')
    assert.equal(question.sensitivity, 'internal', 'list items are internal; amounts stay restricted elsewhere')
    assert.equal(question.required, false, 'optional, so existing brands keep their completeness')
    assert.deepEqual(question.entity, { id_prefix: ENTITY_SPECS[id]!.id_prefix, max_items: ENTITY_SPECS[id]!.max_items, fields: ENTITY_SPECS[id]!.fields.map((field) => field.key), links: [...ENTITY_SPECS[id]!.links] })
    for (const lang of ['en', 'fa', 'tr'] as const) assert.ok(question.prompt[lang].length > 5, `${id} ${lang} prompt`)
    for (const target of ENTITY_SPECS[id]!.links) assert.ok(ENTITY_SPECS[target], `${id} links only to list questions`)
  }
  // The committed bank and field registry are the materialized ones.
  const committed = YAML.parse(fs.readFileSync(path.resolve('brand/interview/question-bank/business.yaml'), 'utf8')) as { questions: Array<{ id: string; question_type: string }> }
  for (const id of ENTITY_QUESTION_IDS) assert.equal(committed.questions.find((question) => question.id === id)?.question_type, 'repeating_entity', `${id} committed`)
  const registry = YAML.parse(fs.readFileSync(path.resolve('brand/interview/field-registry.yaml'), 'utf8')) as { fields: Array<{ id: string; validator: string }> }
  for (const id of ENTITY_QUESTION_IDS) assert.equal(registry.fields.find((field) => field.id === id)?.validator, 'structured', `${id} in the field registry`)
  // Every field and choice option is labelled in en, fa and tr.
  for (const spec of Object.values(ENTITY_SPECS)) {
    for (const lang of ['en', 'fa', 'tr'] as const) {
      assert.ok(spec.item_label[lang])
      for (const field of spec.fields) {
        assert.ok(field.label[lang], `${spec.question_id}.${field.key} ${lang}`)
        for (const option of field.options ?? []) assert.ok(field.option_labels?.[option]?.[lang], `${spec.question_id}.${field.key}.${option} ${lang}`)
      }
    }
  }
})

test('owner lines become a canonical list; normalizing the canonical form again changes nothing', () => {
  const first = normalizeEntityAnswer(seg, 'Independent cafés | reliable weekly supply | Primary\nOffice kitchens | bulk orders | secondary')
  assert.ok(first.ok, first.ok ? '' : first.message)
  const parsed = JSON.parse(first.value) as Record<string, unknown>
  assert.equal(parsed.schema, ENTITY_LIST_SCHEMA)
  assert.equal(parsed.question, SEGMENTS)
  assert.equal(parsed.next, 3)
  assert.deepEqual(parsed.items, [
    { id: 'seg-1', name: 'Independent cafés', detail: 'reliable weekly supply', priority: 'primary' },
    { id: 'seg-2', name: 'Office kitchens', detail: 'bulk orders', priority: 'secondary' },
  ])
  // Round trip: canonical → normalize → identical string; parse → serialize → identical string.
  assert.deepEqual(normalizeEntityAnswer(seg, first.value), { ok: true, value: first.value })
  assert.equal(serializeEntityList(seg, list(first.value)), first.value)
  assert.ok(isCanonicalEntityValue(seg, first.value))
  // The generic structured path accepts the canonical list (it names its own question) and parses it.
  assert.deepEqual(normalizeStructured('repeating_entity', first.value), { ok: true, value: first.value })
  const structured = parseStructured('repeating_entity', first.value)
  assert.equal(structured?.type, 'repeating_entity')
  assert.equal(structured?.type === 'repeating_entity' ? structured.items.length : 0, 2)
  // Without a question the structured path never guesses one from free text.
  assert.equal(normalizeStructured('repeating_entity', 'Independent cafés').ok, false)
  assert.equal(parseStructured('repeating_entity', 'Independent cafés'), null)
})

test('Persian and Turkish text, Arabic-script separators and a dash for an empty part are accepted', () => {
  const out = normalizeEntityAnswer(seg, 'کافه‌های مستقل | تأمین هفتگی | primary؛ Ofis mutfakları | - | exploring')
  assert.ok(out.ok, out.ok ? '' : out.message)
  const items = list(out.value).items
  assert.equal(items[0]!.fields.name, 'کافه‌های مستقل')
  assert.equal(items[1]!.fields.name, 'Ofis mutfakları')
  assert.equal(items[1]!.fields.detail, undefined)
  assert.equal(items[1]!.fields.priority, 'exploring')
})

test('the validator refuses what a list cannot hold', () => {
  const refuse = (spec = seg, raw: string, pattern: RegExp) => {
    const out = normalizeEntityAnswer(spec, raw)
    assert.equal(out.ok, false, raw)
    assert.match(out.ok ? '' : out.message, pattern)
    assert.match(out.ok ? '' : out.message, /Format:/, 'every refusal shows the format')
  }
  refuse(seg, 'Cafés | needs | urgent', /priority “urgent” must be one of primary, secondary, exploring/)
  refuse(seg, 'Cafés | a | primary | extra', /more parts than/)
  refuse(seg, 'Cafés\ncafés', /listed twice/)
  refuse(seg, 'x'.repeat(121), /at most 120 characters/)
  refuse(seg, 'Cafés | links: act-1', /have no links/)
  refuse(act, 'Roasting | links: cost-1', /may link only to seg-…, res-…/)
  refuse(act, 'Roasting | links: nonsense', /not an item id/)
  refuse(seg, Array.from({ length: 13 }, (_, i) => `Segment ${i + 1}`).join('\n'), /At most 12 items/)
  // Cost items name what costs money, never how much, in any script or digit system.
  for (const amount of ['Rent | $2000 a month', 'Green coffee | 1,200 EUR', 'Rent | ۵۰۰ تومان', 'Kira | 3000 TL', 'Wages | USD 900', 'Hosting | ۵۰۰ تومن', 'Kira | 2000 lirası', 'Hosting | 500 dolar', 'Rent | 300 avro']) refuse(cost, amount, /money amount/)
  assert.ok(normalizeEntityAnswer(cost, 'Green coffee | rises with volume | variable | links: act-1').ok, 'a description without an amount is fine')
  // Canonical JSON is checked as strictly as lines.
  const bad = (items: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ schema: ENTITY_LIST_SCHEMA, question: SEGMENTS, items, ...extra })
  refuse(seg, bad([{ id: 'seg-1', name: 'A' }, { id: 'seg-1', name: 'B' }]), /listed twice/)
  refuse(seg, bad([{ id: 'act-1', name: 'A' }]), /needs an id such as seg-1/)
  refuse(seg, bad([{ id: 'seg-1', name: 'A', price: '10' }]), /unknown field “price”/)
  refuse(seg, bad([{ id: 'seg-4', name: 'A' }], { next: 2 }), /next must be greater/)
  refuse(seg, bad([]), /at least one item/)
  refuse(seg, JSON.stringify({ schema: ENTITY_LIST_SCHEMA, question: ACTIVITIES, items: [{ id: 'act-1', name: 'A' }] }), /belongs to business.model.key_activities/)
  refuse(seg, '{"schema":', /not valid JSON/)
  assert.equal(validateEntityList(seg, { question: SEGMENTS, items: [{ id: 'seg-1', name: 'A\u0007' }] }).ok, false, 'control characters')
})

test('ids are stable: re-typing a list keeps ids by name, and removed ids are never reused', () => {
  const first = normalizeEntityAnswer(seg, 'Cafés\nOffices')
  assert.ok(first.ok)
  const retyped = normalizeEntityAnswer(seg, 'Offices | bulk\nBakeries\nCafés', first.value)
  assert.ok(retyped.ok)
  assert.deepEqual(list(retyped.value).items.map((item) => [item.id, item.fields.name]), [['seg-2', 'Offices'], ['seg-3', 'Bakeries'], ['seg-1', 'Cafés']])
  // An explicit id addresses an item even when its name changes.
  const renamed = normalizeEntityAnswer(seg, 'seg-1: Independent cafés\nseg-2: Offices', retyped.value)
  assert.ok(renamed.ok)
  assert.deepEqual(list(renamed.value).items.map((item) => item.id), ['seg-1', 'seg-2'])
  assert.equal(list(renamed.value).next, 4, 'seg-3 was removed; its number is not given out again')
  const added = applyEntityOperation(seg, list(renamed.value), { op: 'add', fields: { name: 'Hotels' } })
  assert.ok(added.ok)
  assert.equal(added.value.item_id, 'seg-4')
})

test('add, edit, move and remove are pure operations that return a canonical list', () => {
  let current: EntityList | null = null
  const step = (operation: Parameters<typeof applyEntityOperation>[2]) => {
    const out = applyEntityOperation(act, current, operation)
    assert.ok(out.ok, out.ok ? '' : out.message)
    current = out.value.list
    assert.ok(isCanonicalEntityValue(act, out.value.value))
    return out.value.item_id
  }
  assert.equal(step({ op: 'add', fields: { name: 'Roasting', category: 'production' }, links: ['seg-1'] }), 'act-1')
  assert.equal(step({ op: 'add', fields: { name: 'Delivery' } }), 'act-2')
  assert.equal(step({ op: 'add', fields: { name: 'Barista training' }, position: 1 }), 'act-3')
  assert.deepEqual(current!.items.map((item) => item.id), ['act-3', 'act-1', 'act-2'])
  step({ op: 'move', id: 'act-2', position: 1 })
  assert.deepEqual(current!.items.map((item) => item.id), ['act-2', 'act-3', 'act-1'])
  step({ op: 'edit', id: 'act-1', fields: { detail: 'small batches', category: '' }, links: ['seg-1', 'res-1'] })
  const edited = current!.items.find((item) => item.id === 'act-1')!
  assert.deepEqual(edited.fields, { name: 'Roasting', detail: 'small batches' }, 'an empty value clears an optional field')
  assert.deepEqual(edited.links, ['seg-1', 'res-1'])
  step({ op: 'remove', id: 'act-3' })
  assert.deepEqual(current!.items.map((item) => item.id), ['act-2', 'act-1'])
  // Refusals leave nothing half-applied.
  const before = JSON.stringify(current)
  for (const [operation, pattern] of [
    [{ op: 'edit', id: 'act-9', fields: {} }, /No item act-9/],
    [{ op: 'move', id: 'act-1', position: 5 }, /Position must be 1 to 2/],
    [{ op: 'edit', id: 'act-1', fields: { name: '' } }, /needs a name/],
    [{ op: 'add', fields: { name: 'Roasting' } }, /listed twice/],
    [{ op: 'add', fields: { price: '3' } }, /Unknown field “price”/],
  ] as const) {
    const out = applyEntityOperation(act, current, operation as Parameters<typeof applyEntityOperation>[2])
    assert.equal(out.ok, false)
    assert.match(out.ok ? '' : out.message, pattern)
  }
  assert.equal(JSON.stringify(current), before)
  step({ op: 'remove', id: 'act-2' })
  const last = applyEntityOperation(act, current, { op: 'remove', id: 'act-1' })
  assert.equal(last.ok, false, 'the last item is not removed; "none" is a disposition, not an empty list')
  assert.match(last.ok ? '' : last.message, /not relevant or unknown/)
})

// ---- engine: drafts, approval flow and legacy values -------------------------------------------------------

test('item operations record drafts; an approved list changes only through a change proposal', () => {
  const { engine, proof } = brand()
  const added = engine.entityOperation(SEGMENTS, { op: 'add', fields: { name: 'Independent cafés', priority: 'primary' } })
  assert.equal(added.kind, 'recorded', added.message)
  assert.equal(added.item_id, 'seg-1')
  assert.equal(added.status, 'draft', 'nothing is approved by an operation')
  engine.entityOperation(SEGMENTS, { op: 'add', fields: { name: 'Office kitchens' } })
  assert.equal(list(latest(engine, SEGMENTS)?.value).items.length, 2)

  const approved = engine.approve(SEGMENTS, 'owner', proof)
  assert.equal(approved.kind, 'recorded', approved.message)
  const factBefore = fs.readFileSync(path.join(engine.workspaceRoot(), 'brand', 'instance', 'approved-facts.yaml'), 'utf8')

  const moved = engine.entityOperation(SEGMENTS, { op: 'move', id: 'seg-2', position: 1 })
  assert.equal(moved.kind, 'impact', 'an approved list is not overwritten')
  assert.match(moved.message, /Proposal chg-[0-9a-f]+ is pending/)
  assert.equal(fs.readFileSync(path.join(engine.workspaceRoot(), 'brand', 'instance', 'approved-facts.yaml'), 'utf8'), factBefore, 'the approved fact is untouched')
  const pending = engine.approvals().pendingChanges()
  assert.equal(pending.length, 1)
  // The proposal holds the canonical list, so approving it keeps the ids the owner reviewed.
  assert.deepEqual(list(pending[0]!.proposed_value).items.map((item) => item.id), ['seg-2', 'seg-1'])
  const applied = engine.approveChange(pending[0]!.id, proof, pending[0]!.expected_version)
  assert.equal(applied.kind, 'recorded', applied.message)
  assert.deepEqual(list(latest(engine, SEGMENTS)?.value).items.map((item) => item.id), ['seg-2', 'seg-1'])
})

test('answers through the interview keep ids from the previous list, and dispositions stay dispositions', () => {
  const { engine } = brand()
  assert.equal(engine.answerQuestion(ACTIVITIES, 'Roasting | links: seg-1\nDelivery').kind, 'recorded')
  assert.equal(engine.changeAnswer(ACTIVITIES, 'Delivery | to offices\nRoasting\nTraining').kind, 'recorded')
  assert.deepEqual(list(latest(engine, ACTIVITIES)?.value, act).items.map((item) => item.id), ['act-2', 'act-1', 'act-3'])
  assert.equal(engine.answerQuestion(RESOURCES, 'unknown').status, 'unknown', 'unknown is a real answer, not a list')
  assert.equal(latest(engine, RESOURCES)?.value, null)
  const bad = engine.answerQuestion(COSTS, 'Rent | €900')
  assert.equal(bad.kind, 'error')
  assert.equal(latest(engine, COSTS), undefined, 'a refused list records nothing')
  // Without a previous value (a change proposal being approved) a canonical list keeps its ids.
  const canonical = normalizeEntityAnswer(seg, 'Cafés\nOffices')
  assert.ok(canonical.ok)
  assert.deepEqual(normalizeEntityAnswer(seg, canonical.value, null), { ok: true, value: canonical.value })
})

test('legacy free text is shown as written and flagged; operations refuse to overwrite it', () => {
  const { root, engine } = brand()
  const legacy = 'We sell to cafés and offices, mostly in the city centre, and sometimes to hotels when they ask us. '.repeat(3)
  plantLegacy(root, SEGMENTS, legacy, 'draft')
  const engine2 = new InterviewEngine(root)
  assert.deepEqual(readEntityList(seg, legacy), { state: 'legacy', text: legacy })
  const refused = engine2.entityOperation(SEGMENTS, { op: 'add', fields: { name: 'Hotels' } })
  assert.equal(refused.kind, 'error')
  assert.match(refused.message, /legacy free text/)
  assert.equal(latest(engine2, SEGMENTS)?.value, legacy, 'unchanged')
  const plan = buildBusinessPlan(engine2, 'internal')
  const item = plan.sections.flatMap((section) => section.items).find((entry) => entry.id === SEGMENTS)
  assert.ok(item, 'the business plan lists the canvas list questions')
  assert.equal(item.value, legacy, 'the text is shown as written')
  assert.equal(item.structured, null)
  assert.match(item.note ?? '', /Legacy free text/)
  assert.match(renderDocumentMarkdown(plan), /Legacy free text/)
  void engine
})

test('documents show a list as a table of items with ids and links', () => {
  const { engine } = brand('entity-docs')
  engine.answerQuestion(SEGMENTS, 'Independent cafés | weekly supply | primary')
  engine.answerQuestion(ACTIVITIES, 'Roasting | small batches | production | links: seg-1')
  const plan = buildBusinessPlan(engine, 'internal')
  const section = plan.sections.find((entry) => entry.id === 'canvas-lists')!
  assert.deepEqual(section.items.map((entry) => entry.id), [SEGMENTS, ACTIVITIES, RESOURCES, COSTS])
  const segments = section.items[0]!
  assert.equal(segments.tag, 'assumption', 'a draft list is an owner draft, not approved')
  assert.equal(segments.structured?.type, 'repeating_entity')
  const markdown = renderDocumentMarkdown(plan)
  assert.match(markdown, /\| Id \| Name \| Needs or jobs \| Priority \| Links \|/)
  assert.match(markdown, /\| `seg-1` \| Independent cafés \| weekly supply \| Primary \| — \|/)
  assert.match(markdown, /\| `act-1` \| Roasting \| small batches \| Production \| `seg-1` \|/)
  assert.equal(section.items[2]!.tag, 'missing', 'an unanswered list is a named gap')
})

/** Writes a value into the ledger the way an older engine (free-text question) would have stored it. */
function plantLegacy(root: string, id: string, value: string, status: 'draft' | 'approved'): void {
  const file = path.join(root, 'brand', 'interview', 'answer-ledger.yaml')
  const ledger = YAML.parse(fs.readFileSync(file, 'utf8')) as { records: Array<Record<string, unknown>> }
  ledger.records.push({
    answer_id: `ans-${String(ledger.records.length + 1).padStart(4, '0')}`,
    question_id: id,
    value,
    raw_answer: value,
    source_type: 'owner',
    source_reference: null,
    authority: 'confirmed_by_owner',
    confidence: null,
    status,
    last_updated: '2026-01-01T00:00:00.000Z',
    reviewed_by: null,
    visibility: 'internal',
    uncertainty: null,
    session_id: 'legacy',
    normalized: value,
    superseded_by: null,
    disposition_reason: null,
    private_ref: null,
  })
  fs.writeFileSync(file, YAML.stringify(ledger))
}

// ---- migration ---------------------------------------------------------------------------------------------

test('migration: convertible drafts become reviewable drafts, approved text gets a proposal, the rest stays legacy', () => {
  const { root } = brand('entity-migrate')
  // Older engines stored these answers as free text. One was approved: plant it the way an older ledger holds it.
  plantLegacy(root, ACTIVITIES, 'Roasting; Delivery; Barista training', 'approved')
  const ledgerFile = path.join(root, 'brand', 'interview', 'answer-ledger.yaml')
  plantLegacy(root, SEGMENTS, 'Independent cafés\nOffice kitchens', 'draft')
  const prose = `${'We roast, we deliver, we train, and we keep the machines running for every customer. '.repeat(2)}`
  plantLegacy(root, RESOURCES, prose, 'draft')
  plantLegacy(root, COSTS, 'Rent | $2000 a month', 'draft')
  const ledgerBefore = fs.readFileSync(ledgerFile, 'utf8')

  const dry = migrateEntityAnswers(new InterviewEngine(root), { dryRun: true })
  assert.equal(fs.readFileSync(ledgerFile, 'utf8'), ledgerBefore, 'a dry run writes nothing')
  assert.deepEqual(dry.converted.map((item) => [item.question_id, item.outcome]).sort(), [[ACTIVITIES, 'proposal'], [SEGMENTS, 'draft']])

  const report = migrateEntityAnswers(new InterviewEngine(root))
  assert.deepEqual(report.converted.map((item) => [item.question_id, item.outcome, item.items]).sort(), [[ACTIVITIES, 'proposal', 3], [SEGMENTS, 'draft', 2]])
  assert.deepEqual(report.legacy.map((item) => item.question_id).sort(), [RESOURCES, COSTS].sort())
  assert.match(report.legacy.find((item) => item.question_id === COSTS)!.reason, /money amount/)

  const after = new InterviewEngine(root)
  // Drafts: the converted list is a system draft; the original text is the raw answer and the superseded record.
  const segAnswer = latest(after, SEGMENTS)!
  assert.equal(segAnswer.status, 'draft')
  assert.equal(segAnswer.source_type, 'system')
  assert.equal(segAnswer.raw_answer, 'Independent cafés\nOffice kitchens')
  assert.deepEqual(list(segAnswer.value).items.map((item) => item.fields.name), ['Independent cafés', 'Office kitchens'])
  const history = after.ledger().records.filter((record) => record.question_id === SEGMENTS)
  assert.equal(history.length, 2)
  assert.equal(history[0]!.value, 'Independent cafés\nOffice kitchens', 'the old record is kept, only superseded')
  assert.equal(history[0]!.superseded_by !== null, true)
  // Approved: the fact is untouched; a pending proposal holds the canonical list.
  assert.equal(latest(after, ACTIVITIES)!.value, 'Roasting; Delivery; Barista training')
  assert.equal(latest(after, ACTIVITIES)!.status, 'approved')
  const pending = after.approvals().pendingChanges()
  assert.equal(pending.length, 1)
  assert.equal(pending[0]!.question_id, ACTIVITIES)
  assert.deepEqual(list(pending[0]!.proposed_value, act).items.map((item) => item.fields.name), ['Roasting', 'Delivery', 'Barista training'])
  // Legacy: byte-identical.
  assert.equal(latest(after, RESOURCES)!.value, prose)
  assert.equal(latest(after, COSTS)!.value, 'Rent | $2000 a month')
  // Logged once.
  const log = YAML.parse(fs.readFileSync(path.join(root, 'brand', 'migrations.yaml'), 'utf8')) as { applied: Array<{ id: string; converted?: string[] }> }
  assert.ok(log.applied.some((entry) => entry.id.startsWith('repeating-entity@') && entry.converted?.includes(`${SEGMENTS}:draft`)))

  // Idempotent: a second run converts nothing and files no second proposal.
  const ledgerAfter = fs.readFileSync(ledgerFile, 'utf8')
  const again = migrateEntityAnswers(new InterviewEngine(root))
  assert.deepEqual(again.converted, [])
  assert.equal(again.legacy.length, 2, 'legacy values are reported every time until the owner deals with them')
  assert.equal(fs.readFileSync(ledgerFile, 'utf8'), ledgerAfter)
  assert.equal(new InterviewEngine(root).approvals().pendingChanges().length, 1)
})

// ---- CLI ----------------------------------------------------------------------------------------------------

function cli(root: string, args: string[], env: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = { ...process.env, BRAND_OS_DATA_KEY: TEST_DATA_KEY, ...env }
  delete base.BRAND_OS_APPROVAL_PROOF
  if (!(AGENT_TOKEN_ENV in env)) delete base[AGENT_TOKEN_ENV]
  for (const key of Object.keys(base)) if (base[key] === undefined) delete base[key]
  const result = spawnSync(NODE, tsxArgs(path.join('scripts', 'brand.ts'), args), { cwd: root, encoding: 'utf8', env: base as NodeJS.ProcessEnv, input: '' })
  let json: Record<string, unknown> | null = null
  try {
    json = JSON.parse(result.stdout) as Record<string, unknown>
  } catch {
    json = null
  }
  return { status: result.status, json, stdout: result.stdout, stderr: result.stderr }
}

test('cli: brand:interview --entity adds, edits, moves, lists and removes items as drafts', () => {
  const { root } = brand('entity-cli')
  const add1 = cli(root, ['interview', '--question', SEGMENTS, '--entity', 'add', '--field', 'name=Independent cafés', '--field', 'priority=primary', '--json'])
  assert.equal(add1.status, 0, add1.stderr)
  assert.equal(add1.json?.item_id, 'seg-1')
  assert.equal(add1.json?.status, 'draft')
  assert.equal(cli(root, ['interview', '--question', SEGMENTS, '--entity', 'add', '--field', 'name=Office kitchens', '--position', '1', '--json']).json?.item_id, 'seg-2')
  assert.equal(cli(root, ['interview', '--question', SEGMENTS, '--entity', 'edit', '--item', 'seg-1', '--field', 'detail=weekly supply', '--json']).status, 0)
  assert.equal(cli(root, ['interview', '--question', SEGMENTS, '--entity', 'move', '--item', 'seg-1', '--position', '1', '--json']).status, 0)
  const listed = cli(root, ['interview', '--question', SEGMENTS, '--entity', 'list', '--json'])
  assert.equal(listed.status, 0)
  assert.equal(listed.json?.state, 'items')
  assert.deepEqual((listed.json?.items as Array<{ id: string }>).map((item) => item.id), ['seg-1', 'seg-2'])
  const text = cli(root, ['interview', '--question', SEGMENTS, '--entity', 'list'])
  assert.match(text.stdout, /1\. seg-1 · Independent cafés — weekly supply · Primary/)
  assert.match(text.stdout, /Format: one segment per line/)
  assert.equal(cli(root, ['interview', '--question', SEGMENTS, '--entity', 'remove', '--item', 'seg-2', '--json']).status, 0)
  // Links and the whole-list answer path.
  const acts = cli(root, ['interview', '--question', ACTIVITIES, '--answer', 'Roasting | small batches | production | links: seg-1', '--json'])
  assert.equal(acts.status, 0, acts.stdout)
  const link = cli(root, ['interview', '--question', ACTIVITIES, '--entity', 'edit', '--item', 'act-1', '--links', 'none', '--json'])
  assert.equal(link.status, 0)
  assert.deepEqual(list(latest(new InterviewEngine(root), ACTIVITIES)?.value, act).items[0]!.links, [])
  // Refusals: unknown item, bad field, bad operation, a question that is not a list.
  const missing = cli(root, ['interview', '--question', SEGMENTS, '--entity', 'remove', '--item', 'seg-9', '--json'])
  assert.equal(missing.status, 1)
  assert.match(String(missing.json?.message), /No item seg-9/)
  assert.equal(cli(root, ['interview', '--question', SEGMENTS, '--entity', 'add', '--field', 'nameonly']).status, 1)
  assert.equal(cli(root, ['interview', '--question', SEGMENTS, '--entity', 'approve']).status, 2, 'there is no approve operation')
  assert.equal(cli(root, ['interview', '--question', 'business.model.revenue', '--entity', 'list', '--json']).status, 1)
  // Nothing was approved along the way.
  const facts = YAML.parse(fs.readFileSync(path.join(root, 'brand', 'instance', 'approved-facts.yaml'), 'utf8')) as { facts: Record<string, unknown> }
  assert.equal(facts.facts[SEGMENTS], undefined)
})

test('cli: brand:migrate reports list conversions and legacy text by id, never by value', () => {
  const { root } = brand('entity-cli-migrate')
  plantLegacy(root, SEGMENTS, 'Independent cafés; Office kitchens', 'draft')
  plantLegacy(root, COSTS, 'Rent | $2000 a month', 'draft')
  const out = cli(root, ['migrate'])
  assert.equal(out.status, 0, out.stderr)
  assert.match(out.stdout, /List business.model.segments: converted draft free text to a draft list of 2 item\(s\)/)
  assert.match(out.stdout, /List business.model.cost_items: kept as legacy free text \(draft\)/)
  assert.doesNotMatch(out.stdout, /Independent cafés|Office kitchens/, 'values are not printed')
})
