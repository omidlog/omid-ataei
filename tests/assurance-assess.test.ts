import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canonicalJson } from '@brand-os/brand-core/strategy'
import {
  assess,
  CONTROL_STATUSES,
  REFERENCED_METHODS,
  SYNTHETIC_DEMO,
  SYNTHETIC_DEMO_BANNER,
  SYNTHETIC_DEMO_BRAND,
  SYNTHETIC_DEMO_CHANGED_SOURCE,
  SYNTHETIC_DEMO_RESTRICTED,
  SYNTHETIC_DEMO_UNKNOWN_SCOPE,
  SYNTHETIC_FIXTURES,
  POSITIONING_READINESS_CONTROLS,
  type AssessmentInput,
  type AuditAssessment,
  type ControlInput,
  type ControlReview,
} from '@brand-os/brand-core/assurance'

/**
 * Trust v2 PR-A, milestone M1 (method): determinism, stale-source invalidation, no score on an
 * undefined denominator, distinct statuses, restricted inputs withheld, and no brand value — or
 * anything a caller smuggles in — ever reaching the output.
 */

const CANARY = 'CANARY-7f3a-RESTRICTED-VALUE-DO-NOT-LEAK'

function statusOf(assessment: AuditAssessment, controlId: string) {
  const result = assessment.control_results.find((entry) => entry.control_id === controlId)
  assert.ok(result, `${controlId} missing from the result`)
  return result
}

function withControl(base: AssessmentInput, controlId: string, patch: (input: ControlInput) => ControlInput): AssessmentInput {
  return { ...base, controls: base.controls.map((input) => (input.control_id === controlId ? patch(input) : input)) }
}

test('the synthetic fixture is loudly synthetic', () => {
  for (const [name, fixture] of Object.entries(SYNTHETIC_FIXTURES)) {
    assert.equal(fixture.brand_id, SYNTHETIC_DEMO_BRAND, name)
    assert.equal(fixture.demo, true, name)
    const result = assess(fixture)
    assert.equal(result.demo, true)
    assert.ok(result.limitations.includes('demo_data'), `${name} must carry the demo_data limitation`)
  }
  assert.equal(SYNTHETIC_DEMO_BANNER, 'SYNTHETIC DEMO — NOT A REAL BRAND')
})

test('baseline: eight of twelve applicable controls complete, three excluded, the rest distinct', () => {
  const result = assess(SYNTHETIC_DEMO)
  assert.deepEqual(result.completeness, { state: 'scoreable', numerator: 8, denominator: 12, excluded: 3, blocked_by: [] })
  const statuses = Object.fromEntries(result.control_results.map((entry) => [entry.control_id, entry.status]))
  assert.deepEqual(statuses, {
    'PRR-01': 'applicable_complete',
    'PRR-02': 'applicable_complete',
    'PRR-03': 'applicable_missing',
    'PRR-04': 'applicable_complete',
    'PRR-05': 'applicable_complete',
    'PRR-06': 'applicable_complete',
    'PRR-07': 'applicable_missing',
    'PRR-08': 'conflicted',
    'PRR-09': 'applicable_complete',
    'PRR-10': 'conflicted',
    'PRR-11': 'applicable_complete',
    'PRR-12': 'applicable_complete',
    'PRR-13': 'not_applicable',
    'PRR-14': 'not_applicable',
    'PRR-15': 'not_applicable',
  })
  assert.equal(result.claim_level, 'internally_assessed')
  assert.equal(result.evidence_quality, 'owner_stated')
  assert.deepEqual(result.evidence_coverage, { controls_with_independent_evidence: 0, applicable_controls: 12 })
  assert.equal(result.maturity_aggregate, null)
  assert.deepEqual(
    result.maturity_by_domain.map((entry) => [entry.domain, entry.state]),
    [
      ['audience', 'insufficient_evidence'],
      ['offer', 'not_applicable'],
      ['proof', 'insufficient_evidence'],
      ['governance', '2'],
      ['measurement', 'not_applicable'],
    ],
  )
  assert.deepEqual(result.limitations, ['demo_data', 'internal_assessment_only', 'no_maturity_aggregate', 'owner_stated_evidence'])
  // A missing control names the existing questions that would move it, nothing invented.
  assert.deepEqual(statusOf(result, 'PRR-07').next_questions, ['business.sales.pricing'])
  assert.deepEqual(statusOf(result, 'PRR-03').next_questions, ['business.customer.primary_segment'])
})

test('determinism: the same frozen inputs give byte-identical output, whatever order they arrive in', () => {
  const first = canonicalJson(assess(SYNTHETIC_DEMO))
  assert.equal(canonicalJson(assess(SYNTHETIC_DEMO)), first)
  const shuffled: AssessmentInput = {
    ...SYNTHETIC_DEMO,
    controls: [...SYNTHETIC_DEMO.controls].reverse().map((input) => ({ ...input, facts: [...input.facts].reverse(), evidence: [...input.evidence].reverse() })),
  }
  assert.equal(canonicalJson(assess(shuffled)), first)
  // A different clock is a different run, with a different id; the verdicts do not move.
  const later = assess({ ...SYNTHETIC_DEMO, as_of: new Date('2026-12-01T00:00:00.000Z') })
  assert.notEqual(later.id, assess(SYNTHETIC_DEMO).id)
  assert.deepEqual(later.control_results, assess(SYNTHETIC_DEMO).control_results)
  assert.match(assess(SYNTHETIC_DEMO).id, /^asm_[0-9a-f]{32}$/)
})

test('unknown applicability removes the ratio: a denominator nobody can define is not a denominator', () => {
  const result = assess(SYNTHETIC_DEMO_UNKNOWN_SCOPE)
  assert.equal(statusOf(result, 'PRR-13').status, 'applicability_unknown')
  assert.equal(statusOf(result, 'PRR-14').status, 'applicability_unknown')
  assert.deepEqual(result.completeness, { state: 'not_scoreable', numerator: null, denominator: null, excluded: 1, blocked_by: ['applicability_unknown'] })
  assert.ok(result.limitations.includes('completeness_blocked'))
  assert.equal(result.maturity_by_domain.find((entry) => entry.domain === 'measurement')?.state, 'unknown')
})

test('a changed source forces needs_review and removes the ratio; no reviewer can override it', () => {
  const result = assess(SYNTHETIC_DEMO_CHANGED_SOURCE)
  assert.equal(statusOf(result, 'PRR-04').status, 'needs_review')
  assert.deepEqual(statusOf(result, 'PRR-04').reason_codes, ['source_changed'])
  assert.equal(result.completeness.state, 'not_scoreable')
  assert.deepEqual(result.completeness.blocked_by, ['source_changed'])
  assert.notEqual(result.source_snapshot_digest, assess(SYNTHETIC_DEMO).source_snapshot_digest)

  const review: ControlReview = { reviewer_id: 'owner', reviewer_role: 'owner', status: 'applicable_complete', rationale: 'Looks fine to me.', reviewed_at: '2026-11-23' }
  const overridden = assess(withControl(SYNTHETIC_DEMO_CHANGED_SOURCE, 'PRR-04', (input) => ({ ...input, review })))
  assert.equal(statusOf(overridden, 'PRR-04').status, 'needs_review')
  // A changed research note invalidates a judgment control the same way.
  const noteChanged = assess(withControl(SYNTHETIC_DEMO, 'PRR-08', (input) => ({ ...input, conflicts: [], review, evidence: input.evidence.map((item) => ({ ...item, state: 'changed' as const })) })))
  assert.equal(statusOf(noteChanged, 'PRR-08').status, 'needs_review')
})

test('a restricted input is withheld from a lower audience: no sources, a reason, and never counted as complete', () => {
  const internal = assess(SYNTHETIC_DEMO_RESTRICTED)
  const budget = statusOf(internal, 'PRR-14')
  assert.equal(budget.status, 'evidence_insufficient')
  assert.deepEqual(budget.reason_codes, ['withheld_for_audience'])
  assert.deepEqual(budget.source_refs, [])
  assert.deepEqual(budget.next_questions, [])
  assert.ok(internal.limitations.includes('restricted_inputs_withheld'))
  assert.equal(internal.completeness.numerator, 9)
  assert.equal(internal.completeness.denominator, 14)
  assert.ok(!canonicalJson(internal).includes('business.marketing.budget'), 'not even the id of a withheld input is emitted')

  const owner = assess({ ...SYNTHETIC_DEMO_RESTRICTED, audience: 'restricted' })
  assert.equal(statusOf(owner, 'PRR-14').status, 'applicable_complete')
  assert.equal(owner.completeness.numerator, 10)

  // A restricted fact inside a control classified lower is withheld too: the fact's own label wins.
  const leaked = assess(withControl(SYNTHETIC_DEMO, 'PRR-01', (input) => ({ ...input, facts: input.facts.map((fact) => ({ ...fact, classification: 'restricted' as const })) })))
  assert.deepEqual(statusOf(leaked, 'PRR-01').reason_codes, ['withheld_for_audience'])
  const publicView = assess({ ...SYNTHETIC_DEMO_RESTRICTED, audience: 'public' })
  assert.equal(statusOf(publicView, 'PRR-14').status, 'evidence_insufficient')
})

test('privacy canary: nothing a caller attaches beyond ids, revisions and states reaches the output', () => {
  const smuggled = JSON.parse(JSON.stringify(SYNTHETIC_DEMO_RESTRICTED), (key, value) => (key === 'as_of' ? new Date(value as string) : value)) as AssessmentInput
  const tainted = smuggled as unknown as { subject: Record<string, unknown>; controls: Array<Record<string, unknown> & { facts: Array<Record<string, unknown>>; evidence: Array<Record<string, unknown>> }> }
  tainted.subject.secret = CANARY
  for (const control of tainted.controls) {
    control.note = CANARY
    for (const fact of control.facts) fact.value = CANARY
    for (const item of control.evidence) item.quote = CANARY
  }
  const review: ControlReview = { reviewer_id: 'owner', reviewer_role: 'owner', status: 'applicable_partial', rationale: CANARY, reviewed_at: '2026-11-23' }
  const withReview = withControl(smuggled, 'PRR-08', (input) => ({ ...input, conflicts: [], review }))
  for (const audience of ['public', 'internal', 'restricted'] as const) {
    const output = canonicalJson(assess({ ...withReview, audience }))
    assert.ok(!output.includes(CANARY), `canary leaked for audience ${audience}`)
  }
  // The smuggled fields do not even change the snapshot digest: they were never part of the input contract.
  assert.equal(assess(smuggled).source_snapshot_digest, assess(SYNTHETIC_DEMO_RESTRICTED).source_snapshot_digest)
})

test('judgment controls need a person with a role and a written reason; an agent cannot be that person', () => {
  const judged = (review: ControlReview | null) => statusOf(assess(withControl(SYNTHETIC_DEMO, 'PRR-08', (input) => ({ ...input, conflicts: [], review }))), 'PRR-08')
  assert.deepEqual(judged(null).reason_codes, ['reviewer_required'])
  const good: ControlReview = { reviewer_id: 'rev-1', reviewer_role: 'external', status: 'applicable_partial', rationale: 'One owner-stated note; no independent source yet.', reviewed_at: '2026-11-23' }
  assert.equal(judged(good).status, 'applicable_partial')
  assert.equal(judged(good).reviewer_id, 'rev-1')
  assert.deepEqual(judged({ ...good, rationale: '  ' }).reason_codes, ['reviewer_rationale_missing'])
  assert.deepEqual(judged({ ...good, reviewer_role: 'agent' as unknown as ControlReview['reviewer_role'] }).reason_codes, ['reviewer_role_invalid'])
  assert.deepEqual(judged({ ...good, status: 'certified' as unknown as ControlReview['status'] }).reason_codes, ['reviewer_status_invalid'])
  for (const review of [null, { ...good, rationale: '' }]) assert.equal(judged(review).status, 'needs_review')
})

test('missing, unknown, not applicable, draft and insufficient evidence stay distinct findings', () => {
  const fact = (presence: 'draft' | 'unknown' | 'not_applicable' | 'absent', state: 'current' | 'missing' = 'current') =>
    statusOf(
      assess(withControl(SYNTHETIC_DEMO, 'PRR-01', (input) => ({ ...input, facts: input.facts.map((entry) => ({ ...entry, presence, state })) }))),
      'PRR-01',
    )
  assert.deepEqual(fact('draft').reason_codes, ['fact_not_approved'])
  assert.deepEqual(fact('unknown').reason_codes, ['owner_said_unknown'])
  assert.deepEqual(fact('not_applicable').reason_codes, ['owner_said_not_applicable'])
  assert.deepEqual(fact('absent', 'missing').reason_codes, ['source_missing'])
  for (const presence of ['draft', 'unknown', 'not_applicable'] as const) assert.equal(fact(presence).status, 'applicable_missing')

  const evidence = (independence: 'independent' | 'owner_stated' | 'anonymous', count: number) =>
    statusOf(
      assess(
        withControl(SYNTHETIC_DEMO, 'PRR-03', (input) => ({
          ...input,
          evidence: Array.from({ length: count }, (_, i) => ({ ref: { ref: `knowledge:kn_demo_${i}@r${i}`, note_id: `kn_demo_${i}`, revision: `r${i}` }, state: 'current' as const, independence })),
        })),
      ),
      'PRR-03',
    )
  assert.equal(evidence('independent', 1).status, 'applicable_complete')
  assert.equal(evidence('owner_stated', 2).status, 'evidence_insufficient')
  assert.deepEqual(evidence('owner_stated', 2).reason_codes, ['evidence_not_independent'])
  assert.equal(evidence('independent', 0).status, 'applicable_missing')

  // Partial: one of two required questions approved.
  const partial = assess(
    withControl({ ...SYNTHETIC_DEMO, subject: { ...SYNTHETIC_DEMO.subject, runs_paid_media: 'yes' } }, 'PRR-13', (input) => ({ ...input, facts: input.facts.slice(0, 1) })),
  )
  assert.equal(statusOf(partial, 'PRR-13').status, 'applicable_partial')
  assert.deepEqual(statusOf(partial, 'PRR-13').next_questions, ['business.marketing.attribution'])
})

test('a control with no resolved input is not assessed, and that blocks the ratio rather than counting as a fail', () => {
  const result = assess({ ...SYNTHETIC_DEMO, controls: SYNTHETIC_DEMO.controls.filter((input) => input.control_id !== 'PRR-02') })
  assert.equal(statusOf(result, 'PRR-02').status, 'not_assessed')
  assert.deepEqual(result.completeness.blocked_by, ['no_input'])
  assert.equal(result.completeness.numerator, null)
})

test('a method we cannot assess against yields blocked_by_license everywhere, and no ratio', () => {
  const method = REFERENCED_METHODS.find((entry) => entry.method_id === 'w3c.prov-o')!
  const controls = POSITIONING_READINESS_CONTROLS.slice(0, 3).map((control) => ({ ...control, method_id: method.method_id }))
  const result = assess({ ...SYNTHETIC_DEMO, method_id: method.method_id }, { controls })
  assert.ok(result.control_results.every((entry) => entry.status === 'blocked_by_license'))
  assert.equal(result.claim_level, 'informed_by', 'an open source may shape our work, but its rules are not ours to assess against')
  assert.deepEqual(result.completeness.blocked_by, ['license_blocked'])
  assert.equal(result.evidence_quality, 'not_assessed')
})

test('every status the evaluator can emit is one of the ten, and the fixtures reach most of them', () => {
  const seen = new Set<string>()
  for (const fixture of Object.values(SYNTHETIC_FIXTURES)) for (const entry of assess(fixture).control_results) seen.add(entry.status)
  for (const status of seen) assert.ok((CONTROL_STATUSES as readonly string[]).includes(status))
  for (const status of ['applicable_complete', 'applicable_missing', 'not_applicable', 'applicability_unknown', 'evidence_insufficient', 'conflicted', 'needs_review']) {
    assert.ok(seen.has(status), `the fixtures should demonstrate ${status}`)
  }
})
