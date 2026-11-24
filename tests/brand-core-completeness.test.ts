import assert from 'node:assert/strict'
import { test } from 'node:test'
import { completeness, isOpenAnswer, latestAnswers } from '../packages/brand-core/src/completeness.js'
import type { ConditionContext } from '../packages/brand-core/src/conditions.js'
import type { AnswerRecord, BrandConfig, FieldQuestion } from '../packages/brand-core/src/types.js'

/** Direct tests for brand-core completeness.ts: coverage and approval per module and overall. */

function config(overrides: { mascot?: boolean; personal?: boolean } = {}): BrandConfig {
  return {
    brand: { profile: 'universal', sector: 'education' },
    capabilities: { app: true },
    modules: {
      mascot: { enabled: overrides.mascot ?? false, note: '' },
      gamification: { enabled: false, note: '' },
      personal: { enabled: overrides.personal ?? false, facets: [] },
    },
  } as unknown as BrandConfig
}

function question(id: string, extra: Partial<FieldQuestion> = {}): FieldQuestion {
  return { id, module: id.split('.').slice(0, 2).join('.'), required: true, ...extra } as FieldQuestion
}

function answer(questionId: string, status: AnswerRecord['status'], extra: Partial<AnswerRecord> = {}): AnswerRecord {
  return { answer_id: `a-${questionId}-${status}`, question_id: questionId, value: status === 'unanswered' ? null : 'x', status, superseded_by: null, ...extra } as AnswerRecord
}

function ctx(cfg: BrandConfig, ...records: AnswerRecord[]): ConditionContext {
  return { config: cfg, answers: new Map(records.map((record) => [record.question_id, record])) }
}

test('no questions: coverage and approval are 1 (nothing is missing) and no modules are listed', () => {
  const report = completeness([], ctx(config()))
  assert.deepEqual(report, { required: 0, requiredUnanswered: 0, requiredApproved: 0, coverage: 1, approval: 1, modules: [] })
})

test('every answer status lands in exactly one bucket', () => {
  const ids = ['approved', 'draft', 'in_review', 'unknown', 'skipped', 'not_applicable', 'unanswered', 'missing']
  const questions = ids.map((id) => question(`brand.core.${id}`))
  const records = ids.filter((id) => id !== 'missing').map((id) => answer(`brand.core.${id}`, id as AnswerRecord['status']))
  const report = completeness(questions, ctx(config(), ...records))
  const [core] = report.modules
  assert.ok(core)
  assert.equal(core.module, 'brand.core')
  assert.equal(core.required, 8)
  assert.equal(core.requiredApproved, 1)
  assert.equal(core.requiredDraft, 2, 'draft and in_review')
  assert.equal(core.requiredUnresolved, 3, 'unknown, skipped and not_applicable are real answers, not gaps')
  assert.equal(core.requiredUnanswered, 2, 'an unanswered record and no record at all')
  assert.equal(core.coverage, 6 / 8)
  assert.equal(core.approval, 1 / 8)
  assert.equal(report.coverage, 6 / 8)
  assert.equal(report.approval, 1 / 8)
})

test('a retracted (deprecated) required answer reopens the question: it is unanswered again, not covered', () => {
  // brand:retract supersedes the approved record and appends a deprecated one with no value.
  // The question needs an answer again, so it counts as missing; the old records stay in the ledger.
  const report = completeness([question('brand.core.claim')], ctx(config(), answer('brand.core.claim', 'deprecated', { value: null })))
  assert.equal(report.requiredUnanswered, 1)
  assert.equal(report.requiredApproved, 0)
  assert.equal(report.coverage, 0)
  assert.equal(report.approval, 0)
  const [core] = report.modules
  assert.equal(core?.requiredUnresolved, 0, 'a retraction is not an owner disposition like unknown or skipped')
  assert.equal(core?.requiredDraft, 0)
})

test('re-answering a retracted required question makes it covered again', () => {
  const retracted = answer('brand.core.claim', 'deprecated', { answer_id: 'c2', value: null, superseded_by: 'c3' })
  const reanswered = answer('brand.core.claim', 'draft', { answer_id: 'c3', value: 'corrected claim' })
  const original = answer('brand.core.claim', 'approved', { answer_id: 'c1', value: 'wrong claim', superseded_by: 'c2' })
  const live = latestAnswers([original, retracted, reanswered])
  assert.equal(live.get('brand.core.claim')?.answer_id, 'c3')
  const report = completeness([question('brand.core.claim')], { config: config(), answers: live })
  assert.equal(report.requiredUnanswered, 0)
  assert.equal(report.coverage, 1)
  assert.equal(report.modules[0]?.requiredDraft, 1)
})

test('a retracted optional answer is open again but never changes coverage', () => {
  const questions = [question('brand.core.a'), question('brand.core.extra', { required: false })]
  const report = completeness(questions, ctx(config(), answer('brand.core.a', 'approved'), answer('brand.core.extra', 'deprecated', { value: null })))
  assert.equal(report.required, 1)
  assert.equal(report.modules[0]?.optionalOpen, 1, 'the retracted optional question is open again')
  assert.equal(report.coverage, 1)
  assert.equal(report.approval, 1)
})

test('isOpenAnswer: only a missing, unanswered or retracted record needs an answer', () => {
  assert.equal(isOpenAnswer(undefined), true)
  assert.equal(isOpenAnswer(answer('q', 'unanswered')), true)
  assert.equal(isOpenAnswer(answer('q', 'deprecated', { value: null })), true)
  for (const status of ['approved', 'draft', 'in_review', 'unknown', 'skipped', 'not_applicable'] as const) {
    assert.equal(isOpenAnswer(answer('q', status)), false, status)
  }
})

test('optional questions never change coverage; open optional ones are counted separately', () => {
  const questions = [question('brand.core.a'), question('brand.core.b', { required: false }), question('brand.core.c', { required: false })]
  const report = completeness(questions, ctx(config(), answer('brand.core.a', 'approved'), answer('brand.core.b', 'draft')))
  const [core] = report.modules
  assert.ok(core)
  assert.equal(core.required, 1)
  assert.equal(core.optionalOpen, 1, 'only c is open')
  assert.equal(report.coverage, 1)
  assert.equal(report.approval, 1)
})

test('required_when decides whether a required question is mandatory', () => {
  const questions = [
    question('brand.core.app_name', { required_when: 'config.capabilities.app == true' }),
    question('brand.core.store_name', { required_when: 'config.capabilities.store == true' }),
    question('brand.core.detail', { required_when: 'answers[brand.core.kind] == detailed' }),
  ]
  const plain = completeness(questions, ctx(config()))
  assert.equal(plain.required, 1, 'only the app question applies; store is off and kind is unanswered')
  assert.equal(plain.modules[0]?.optionalOpen, 2)
  const detailed = completeness(questions, ctx(config(), answer('brand.core.kind', 'draft', { value: 'detailed' })))
  assert.equal(detailed.required, 2)
})

test('skip_when, switched-off modules and an exclusive scope count as not applicable, never as missing', () => {
  const questions = [
    question('brand.mascot.name'),
    question('personal.identity.name'),
    question('brand.core.skipped', { skip_when: 'answers[brand.core.kind] == simple' }),
    question('brand.core.outside'),
    question('brand.core.inside'),
  ]
  const scope = new Set(['brand.mascot.name', 'personal.identity.name', 'brand.core.skipped', 'brand.core.inside'])
  const report = completeness(questions, ctx(config(), answer('brand.core.kind', 'draft', { value: 'simple' })), scope)
  const byModule = Object.fromEntries(report.modules.map((score) => [score.module, score]))
  assert.equal(byModule['brand.mascot']?.notApplicable, 1)
  assert.equal(byModule['brand.mascot']?.coverage, 1, 'a module with nothing required is complete')
  assert.equal(byModule['personal.identity']?.notApplicable, 1)
  assert.equal(byModule['brand.core']?.notApplicable, 2, 'skip_when and outside the scope')
  assert.equal(report.required, 1)
  assert.equal(report.requiredUnanswered, 1)
  assert.equal(report.coverage, 0)

  const enabled = completeness(questions, ctx(config({ mascot: true, personal: true })))
  assert.equal(enabled.required, 5, 'without a scope and with the modules on, everything is required')
})

test('totals add up across modules and modules keep first-seen order', () => {
  const questions = [question('brand.voice.tone'), question('business.identity.name'), question('brand.voice.words')]
  const report = completeness(questions, ctx(config(), answer('brand.voice.tone', 'approved'), answer('business.identity.name', 'draft')))
  assert.deepEqual(
    report.modules.map((score) => [score.module, score.required, score.coverage, score.approval]),
    [
      ['brand.voice', 2, 0.5, 0.5],
      ['business.identity', 1, 1, 0],
    ],
  )
  assert.equal(report.required, 3)
  assert.equal(report.requiredUnanswered, 1)
  assert.equal(report.requiredApproved, 1)
  assert.equal(report.coverage, 2 / 3)
  assert.equal(report.approval, 1 / 3)
})

test('latestAnswers keeps the last live record per question and ignores superseded ones', () => {
  const first = answer('brand.core.a', 'draft', { answer_id: 'a1', superseded_by: 'a2' })
  const second = answer('brand.core.a', 'approved', { answer_id: 'a2' })
  const stale = answer('brand.core.b', 'draft', { answer_id: 'b1', superseded_by: 'b2' })
  const latest = latestAnswers([first, second, stale])
  assert.equal(latest.get('brand.core.a')?.answer_id, 'a2')
  assert.equal(latest.has('brand.core.b'), false, 'a question whose only record is superseded has no live answer')
  const later = latestAnswers([answer('brand.core.c', 'draft', { answer_id: 'c1' }), answer('brand.core.c', 'unknown', { answer_id: 'c2' })])
  assert.equal(later.get('brand.core.c')?.answer_id, 'c2', 'with two live records the later one wins')
})
