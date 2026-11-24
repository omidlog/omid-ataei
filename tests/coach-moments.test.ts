import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AGENT_TOKEN_ENV } from '@brand-os/brand-core'
import {
  COACH_SILENCE_REASONS,
  coachAfterAnswer,
  coachAutoEnabled,
  coachBeforeApproval,
  coachI18nErrors,
  coachWorthiness,
  isStrategicQuestionId,
  renderAfterAnswer,
  renderBeforeApproval,
  type CoachSource,
} from '@brand-os/brand-core/coach'
import { answer, ANSWER_CANARY, assertUnchanged, coachBrand, defer, disposition, snapshot, SPECIFIC_SEGMENT, VAGUE_SEGMENT } from './helpers/coach.js'
import { useTestKey } from './helpers/knowledge.js'

/**
 * Coach moments: when the coach speaks on its own (docs-internal/COACH_UX_DECISION.md). SYNTHETIC DEMO data only.
 * Every test checks that a moment is advisory (`authorizes: []`), never quotes the owner and writes nothing.
 */
useTestKey()

const SEGMENT = 'business.customer.primary_segment'
const OWNER_ENV: NodeJS.ProcessEnv = {}

function vagueBrand() {
  const brand = coachBrand()
  answer(brand, 'business.stage.current', 'pre-revenue')
  answer(brand, SEGMENT, VAGUE_SEGMENT)
  return brand
}

test('moments: "important" is narrow — strategic free text or a measure, never restricted, choice or a name', () => {
  const brand = coachBrand()
  const q = (id: string) => brand.engine.question(id)!
  assert.equal(coachWorthiness(q(SEGMENT)), null)
  assert.equal(coachWorthiness(q('brand.strategy.differentiation')), null)
  assert.equal(coachWorthiness(q('business.identity.new_or_existing')), 'factual_type', 'a single choice is factual')
  assert.equal(coachWorthiness(q('business.identity.trade_name')), 'not_strategic', 'a name is not strategy')
  assert.equal(coachWorthiness(q('business.finance.runway')), 'restricted')
  assert.equal(isStrategicQuestionId('business.customer.primary_segment'), true)
  assert.equal(isStrategicQuestionId('brand.mascot.role'), false)
  assert.equal(isStrategicQuestionId('business.customerx.y'), false, 'a prefix must end at a dot')
  assert.equal(coachAutoEnabled({}), true, 'on by default')
  for (const off of ['off', 'OFF', '0', 'false', 'no']) assert.equal(coachAutoEnabled({ BRAND_OS_COACH: off }), false)
  assert.deepEqual(coachI18nErrors(), [])
})

test('after_answer: one note on the first vague strategic answer, in en, fa and tr, quoting nothing and writing nothing', () => {
  const brand = vagueBrand()
  const before = snapshot(brand.root)
  for (const locale of ['en', 'fa', 'tr'] as const) {
    const result = coachAfterAnswer(brand.engine, SEGMENT, { locale, env: OWNER_ENV })
    assert.equal(result.shown, true)
    assert.equal(result.silence, null)
    assert.equal(result.note?.question_id, SEGMENT)
    assert.equal(result.note?.criterion, 'specificity')
    assert.ok(result.note?.suggested_question, 'a gap inside the answer gets one clarifying question')
    assert.equal(result.authority, 'derived_advice')
    assert.deepEqual(result.authorizes, [])
    const text = renderAfterAnswer(result)
    assert.ok(text.split('\n').length <= 3, 'three lines at most')
    assert.ok(!JSON.stringify(result).includes(ANSWER_CANARY) && !text.includes(ANSWER_CANARY), 'never quotes the owner')
    assert.ok(!text.includes('Small businesses'))
    if (locale === 'fa') assert.match(text, /[؀-ۿ]/, 'Persian text')
    assert.ok(!/\d+\s*%|score/i.test(text), 'no score')
  }
  assertUnchanged(before, brand.root, 'after_answer')
})

test('after_answer: silent on a second revision, a ready answer, a disposition, a deferral and a restricted question', () => {
  const brand = vagueBrand()
  answer(brand, SEGMENT, `${VAGUE_SEGMENT} again`)
  assert.equal(coachAfterAnswer(brand.engine, SEGMENT, { env: OWNER_ENV }).silence, 'already_coached', 'never repeats for the same question')

  const ready = coachBrand()
  answer(ready, 'business.stage.current', 'pre-revenue')
  answer(ready, SEGMENT, SPECIFIC_SEGMENT)
  assert.equal(coachAfterAnswer(ready.engine, SEGMENT, { env: OWNER_ENV }).silence, 'ready')

  for (const word of ['unknown', 'skip', 'not relevant'] as const) {
    const settled = coachBrand()
    disposition(settled, SEGMENT, word)
    assert.equal(coachAfterAnswer(settled.engine, SEGMENT, { env: OWNER_ENV }).silence, 'disposition', word)
  }

  const deferred = coachBrand()
  defer(deferred, 'brand.strategy.differentiation')
  assert.equal(coachAfterAnswer(deferred.engine, 'brand.strategy.differentiation', { env: OWNER_ENV }).silence, 'deferred')

  const fresh = coachBrand()
  const before = snapshot(fresh.root)
  assert.equal(coachAfterAnswer(fresh.engine, 'business.finance.runway', { env: OWNER_ENV }).silence, 'restricted')
  assert.equal(coachAfterAnswer(fresh.engine, 'business.identity.trade_name', { env: OWNER_ENV }).silence, 'not_strategic')
  assert.equal(coachAfterAnswer(fresh.engine, 'business.identity.new_or_existing', { env: OWNER_ENV }).silence, 'factual_type')
  assert.equal(coachAfterAnswer(fresh.engine, SEGMENT, { env: OWNER_ENV }).silence, 'unanswered')
  assert.equal(coachAfterAnswer(fresh.engine, 'no.such.question', { env: OWNER_ENV }).silence, 'unknown_question')
  assertUnchanged(before, fresh.root, 'silent moments')
})

test('after_answer: the off switch and the agent token silence it; a broken source never throws', () => {
  const brand = vagueBrand()
  assert.equal(coachAfterAnswer(brand.engine, SEGMENT, { env: { BRAND_OS_COACH: 'off' } }).silence, 'disabled')
  assert.equal(coachAfterAnswer(brand.engine, SEGMENT, { env: { [AGENT_TOKEN_ENV]: 'agt_demo' } }).silence, 'agent_token')
  const broken = new Proxy(brand.engine, {
    get(target, key) {
      if (key === 'ledger') return () => {
        throw new Error('disk on fire')
      }
      return Reflect.get(target, key, target)
    },
  }) as CoachSource
  const result = coachAfterAnswer(broken, SEGMENT, { env: OWNER_ENV })
  assert.equal(result.shown, false)
  assert.equal(result.silence, 'unavailable')
  for (const reason of [result.silence]) assert.ok((COACH_SILENCE_REASONS as readonly string[]).includes(reason!))
})

test('before_approval: notes only for strategic drafts with a gap, capped, change proposals counted, nothing quoted', () => {
  const brand = vagueBrand()
  answer(brand, 'business.identity.trade_name', 'EXAMPLE Demo Co')
  answer(brand, 'brand.strategy.purpose', 'Quality.')
  answer(brand, 'brand.strategy.vision', 'Best.')
  const before = snapshot(brand.root)
  const draftIds = [SEGMENT, 'business.identity.trade_name', 'brand.strategy.purpose', 'brand.strategy.vision', 'business.stage.current']
  const result = coachBeforeApproval(brand.engine, { draftIds, changeIds: ['brand.strategy.values'] }, { env: OWNER_ENV, limit: 2 })
  assert.equal(result.notes.length, 2)
  assert.equal(result.more, 1)
  assert.equal(result.checked, 6)
  assert.equal(result.silent.change_pending, 1)
  assert.equal(result.silent.not_strategic, 1, 'the name stays silent')
  assert.equal(result.silent.factual_type, 1, 'the stage choice stays silent')
  assert.deepEqual(result.authorizes, [])
  const text = renderBeforeApproval(result)
  assert.match(text, /nothing is blocked/)
  assert.match(text, /1 more: npm run brand:coach/)
  assert.ok(!text.includes(ANSWER_CANARY) && !JSON.stringify(result).includes(ANSWER_CANARY))
  assert.ok(!text.includes('Quality.') && !text.includes('Best.'))
  for (const locale of ['fa', 'tr'] as const) assert.ok(renderBeforeApproval(coachBeforeApproval(brand.engine, { draftIds }, { env: OWNER_ENV, locale })).length > 0)
  assertUnchanged(before, brand.root, 'before_approval')

  assert.equal(renderBeforeApproval(coachBeforeApproval(brand.engine, { draftIds: ['business.identity.trade_name'] }, { env: OWNER_ENV })), '', 'no notes, no block')
  const off = coachBeforeApproval(brand.engine, { draftIds }, { env: { BRAND_OS_COACH: 'off' } })
  assert.equal(off.notes.length, 0)
  assert.equal(off.silent.disabled, draftIds.length)
  const agent = coachBeforeApproval(brand.engine, { draftIds }, { env: { [AGENT_TOKEN_ENV]: 'agt_demo' } })
  assert.equal(agent.silent.agent_token, draftIds.length)
})
