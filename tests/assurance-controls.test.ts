import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allQuestions } from '@brand-os/brand-core'
import {
  applicabilityOf,
  controlErrors,
  controlsDigest,
  controlsForMethod,
  POSITIONING_READINESS,
  POSITIONING_READINESS_CONTROLS,
  type AssessableControl,
  type AssessmentSubject,
} from '@brand-os/brand-core/assurance'

/**
 * Trust v2 PR-A: the assessable control contract. Controls name existing question ids only, never
 * invent questions, classify their inputs at least as high as the question bank does, and decide
 * applicability before anything else, with `unknown` never read as `no`.
 */

const RANK = { public: 0, internal: 1, restricted: 2 } as const
const COMPANY: AssessmentSubject = { entity_kind: 'company', sells: 'yes', stage: 'established', runs_paid_media: 'no' }

test('the shipped controls satisfy every invariant', () => {
  assert.deepEqual(controlErrors(), [])
  assert.equal(controlsForMethod(POSITIONING_READINESS.method_id).length, POSITIONING_READINESS_CONTROLS.length)
  for (const control of POSITIONING_READINESS_CONTROLS) {
    assert.equal(control.method_id, POSITIONING_READINESS.method_id)
    assert.equal(control.evaluation_rule_version, POSITIONING_READINESS.evaluation_rule_version)
  }
})

test('every question a control names is a real question in the bank — nothing is invented', () => {
  const bank = new Map(allQuestions().map((question) => [question.id, question]))
  for (const control of POSITIONING_READINESS_CONTROLS) {
    for (const id of [...control.required_question_ids, ...control.related_question_ids]) {
      assert.ok(bank.has(id), `${control.control_id} names ${id}, which is not in the question bank`)
    }
  }
})

test('a control is classified at least as high as the most sensitive question it reads', () => {
  const bank = new Map(allQuestions().map((question) => [question.id, question]))
  for (const control of POSITIONING_READINESS_CONTROLS) {
    for (const id of control.required_question_ids) {
      const sensitivity = bank.get(id)!.sensitivity
      assert.ok(RANK[control.privacy_classification] >= RANK[sensitivity], `${control.control_id} reads ${id} (${sensitivity}) but is classified ${control.privacy_classification}`)
    }
  }
  // The budget control exists so its absence is visible, and it is the one restricted control.
  assert.deepEqual(
    POSITIONING_READINESS_CONTROLS.filter((control) => control.privacy_classification === 'restricted').map((control) => control.control_id),
    ['PRR-14'],
  )
})

test('twelve controls apply to a selling company without paid media; a person brand or paid media changes which', () => {
  const applying = (subject: AssessmentSubject) => POSITIONING_READINESS_CONTROLS.filter((control) => applicabilityOf(control.applicability, subject) === 'applicable').map((control) => control.control_id)
  assert.equal(applying(COMPANY).length, 12)
  assert.ok(!applying(COMPANY).includes('PRR-13') && !applying(COMPANY).includes('PRR-15'))
  assert.ok(applying({ ...COMPANY, runs_paid_media: 'yes' }).includes('PRR-14'))
  assert.ok(applying({ ...COMPANY, entity_kind: 'person' }).includes('PRR-15'))
  assert.ok(!applying({ ...COMPANY, sells: 'no' }).includes('PRR-07'))
})

test('applicability: unknown is never no, and a definite exclusion wins over an unknown', () => {
  const rule = { rule_id: 'both', conditions: [{ field: 'sells' as const, one_of: ['yes'] }, { field: 'runs_paid_media' as const, one_of: ['yes'] }] }
  assert.equal(applicabilityOf(rule, { ...COMPANY, sells: 'yes', runs_paid_media: 'yes' }), 'applicable')
  assert.equal(applicabilityOf(rule, { ...COMPANY, sells: 'yes', runs_paid_media: 'unknown' }), 'unknown')
  assert.equal(applicabilityOf(rule, { ...COMPANY, sells: 'no', runs_paid_media: 'unknown' }), 'not_applicable')
  assert.equal(applicabilityOf({ rule_id: 'always', conditions: [] }, { entity_kind: 'unknown', sells: 'unknown', stage: 'unknown', runs_paid_media: 'unknown' }), 'applicable')
})

test('controlErrors rejects a control that could never be completed or that treats unknown as a value', () => {
  const base = POSITIONING_READINESS_CONTROLS[0]!
  const bad = (patch: Partial<AssessableControl>) => controlErrors([{ ...base, ...patch }]).join('\n')
  assert.match(bad({ required_question_ids: [], required_evidence: null }), /can never be completed/)
  assert.match(bad({ applicability: { rule_id: 'x', conditions: [{ field: 'sells', one_of: ['unknown'] }] } }), /unknown/)
  assert.match(bad({ applicability: { rule_id: 'x', conditions: [{ field: 'sells', one_of: [] }] } }), /lists no value/)
  assert.match(bad({ related_question_ids: [...base.required_question_ids] }), /both required and merely related/)
  assert.match(bad({ required_evidence: { min: 0, independence: 'any' } }), /at least 1/)
  assert.match(bad({ control_id: 'prr-1' }), /control_id must match/)
  assert.match(controlErrors([base, base]).join('\n'), /duplicate/)
})

test('the rule digest is order-independent and changes when any rule changes', () => {
  const digest = controlsDigest(POSITIONING_READINESS_CONTROLS)
  assert.equal(controlsDigest([...POSITIONING_READINESS_CONTROLS].reverse()), digest)
  const edited = POSITIONING_READINESS_CONTROLS.map((control) => (control.control_id === 'PRR-01' ? { ...control, decision_criticality: 'supporting' as const } : control))
  assert.notEqual(controlsDigest(edited), digest)
})
