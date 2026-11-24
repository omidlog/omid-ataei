import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import YAML from 'yaml'
import {
  brandRetrieve,
  ENTITY_QUESTION_IDS,
  ensureApprovalSecret,
  InterviewEngine,
  issueAgentToken,
  resolveAgentContext,
  taskFields,
} from '@brand-os/brand-core'
import { coachAnalyze } from '@brand-os/brand-core/coach'
import { brandDir, useTestKey } from './helpers/knowledge.js'

/**
 * Visual V3.1: the list question ids are canonical for every reader. brand_retrieve returns approved lists with their
 * items (never drafts), the Coach reads them without quoting an item, and every id is a question and registry id
 * (the same check Task Context runs on its own ids). SYNTHETIC DEMO data only.
 */
useTestKey()

const SEGMENTS = 'business.model.segments'
const ACTIVITIES = 'business.model.key_activities'
const CANARY = 'ENTITY-ITEM-CANARY'

function brand() {
  const root = brandDir({ slug: 'entity-readers' })
  const engine = new InterviewEngine(root)
  const proof = ensureApprovalSecret(root)
  assert.equal(engine.answerQuestion('business.customer.primary_segment', 'Working adults').kind, 'recorded')
  assert.equal(engine.answerQuestion(SEGMENTS, `Independent cafés | weekly supply | primary\n${CANARY} kitchens`).kind, 'recorded')
  assert.equal(engine.approvals().approveBatch({ ids: ['business.customer.primary_segment', SEGMENTS] }, proof).approved, 2)
  assert.equal(engine.answerQuestion(ACTIVITIES, 'DRAFT-ACTIVITY roasting | links: seg-1').kind, 'recorded')
  return { root, engine: new InterviewEngine(root) }
}

test('the list ids are canonical: question bank, field registry, and none collides with a Task Context id', () => {
  const registry = YAML.parse(fs.readFileSync(path.resolve('brand/interview/field-registry.yaml'), 'utf8')) as { fields: Array<{ id: string; module: string }> }
  // Visual V3.3: the journey stages live in the marketing module and the OKR lists in the goals module.
  const moduleOf = (id: string) => (id.startsWith('business.marketing.') ? 'business-marketing' : id.startsWith('business.goals.') ? 'business-goals' : 'business-company')
  for (const id of ENTITY_QUESTION_IDS) assert.equal(registry.fields.find((field) => field.id === id)?.module, moduleOf(id), id)
  // Task Context packs do not read list questions yet (an owner decision for a later slice); none of its ids is a list.
  const taskIds = taskFields({ personal: true, mascot: true }).flatMap((field) => field.fact_ids)
  for (const id of ENTITY_QUESTION_IDS) assert.equal(taskIds.includes(id), false, id)
})

test('brand_retrieve returns an approved list with its items in meta; a draft list is never returned', () => {
  const { root, engine } = brand()
  const issued = issueAgentToken(root, { brandId: 'entity-readers', profile: 'marketing', label: 'entity reader test' })
  const ctx = resolveAgentContext(root, 'entity-readers', issued.token)
  const result = brandRetrieve(engine, ctx, { kind: 'facts', module: 'business-company' }) as unknown as { status: string; data: { items: Array<{ id: string; value: unknown; meta?: { type?: string; entity?: { state: string; items: Array<Record<string, unknown>> } } }> } }
  assert.equal(result.status, 'approved', JSON.stringify(result).slice(0, 300))
  const segments = result.data.items.find((item) => item.id === SEGMENTS)
  assert.ok(segments, 'the approved list is returned')
  assert.equal(segments.meta?.type, 'repeating_entity')
  assert.deepEqual(segments.meta?.entity?.items.map((item) => [item.id, item.name, item.priority ?? null]), [
    ['seg-1', 'Independent cafés', 'primary'],
    ['seg-2', `${CANARY} kitchens`, null],
  ])
  assert.equal(result.data.items.some((item) => item.id === ACTIVITIES), false, 'a draft list is not an approved fact')
  assert.equal(JSON.stringify(result).includes('DRAFT-ACTIVITY'), false)
  // The design profile has no business modules, so it gets no list.
  const design = issueAgentToken(root, { brandId: 'entity-readers', profile: 'design', label: 'entity design test' })
  const denied = brandRetrieve(engine, resolveAgentContext(root, 'entity-readers', design.token), { kind: 'facts', ids: [SEGMENTS] })
  assert.equal(JSON.stringify(denied).includes(CANARY), false)
})

test('the Coach reads a list question by its canonical id, writes nothing and never quotes an item', () => {
  const { root, engine } = brand()
  const ledger = fs.readFileSync(path.join(root, 'brand', 'interview', 'answer-ledger.yaml'), 'utf8')
  for (const mode of ['follow_up', 'quality_review'] as const) {
    for (const id of [SEGMENTS, ACTIVITIES, 'business.model.cost_items']) {
      const result = coachAnalyze(engine, { mode, questionId: id })
      assert.deepEqual(result.authorizes, [], `${mode} ${id}`)
      const text = JSON.stringify(result)
      assert.equal(text.includes(CANARY), false, `${mode} ${id}: no item is quoted`)
      assert.equal(text.includes('brand-os.entity-list'), false)
      for (const finding of result.findings) if (finding.canonical_question_id) assert.ok(engine.question(finding.canonical_question_id), finding.canonical_question_id)
    }
  }
  const consistency = coachAnalyze(engine, { mode: 'consistency_review' })
  assert.equal(JSON.stringify(consistency).includes(CANARY), false)
  assert.equal(fs.readFileSync(path.join(root, 'brand', 'interview', 'answer-ledger.yaml'), 'utf8'), ledger, 'the Coach writes nothing')
})
