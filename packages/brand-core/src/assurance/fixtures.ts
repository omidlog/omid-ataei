/**
 * SYNTHETIC DEMO — NOT A REAL BRAND.
 *
 * These fixtures exist so the assessment engine can be demonstrated and tested without touching a
 * brand repository. Everything in them is invented: the brand id, the fact ids' revisions and the
 * research note ids. There are no brand values here at all, because the engine never takes any —
 * a `ResolvedFact` carries an id, a revision and a state, and nothing else.
 *
 * No number produced from these fixtures describes any real company. Any renderer showing them must
 * carry the `demo_data` limitation, which says exactly that in en / fa / tr.
 */

import { sha256Hex, type EvidenceRef, type FactRef } from '../strategy/model.js'
import type { AssessmentInput, ControlInput, ResolvedEvidence, ResolvedFact } from './assess.js'
import { POSITIONING_READINESS } from './registry.js'
import { POSITIONING_READINESS_CONTROLS, type AssessmentSubject, type MaturityLevel } from './controls.js'

export const SYNTHETIC_DEMO_BRAND = 'synthetic-demo'
export const SYNTHETIC_DEMO_BANNER = 'SYNTHETIC DEMO — NOT A REAL BRAND'
/** One fixed instant, so a fixture run is the same run every time. */
export const SYNTHETIC_DEMO_AS_OF = new Date('2026-11-23T00:00:00.000Z')

/** A deterministic stand-in for a revision hash. It is the hash of a string that says it is a demo. */
function demoRevision(seed: string): string {
  return sha256Hex(`${SYNTHETIC_DEMO_BANNER}:${seed}`)
}

function fact(id: string, options: Partial<Omit<ResolvedFact, 'ref'>> = {}): ResolvedFact {
  return {
    ref: { id, revision: demoRevision(id) } satisfies FactRef,
    state: 'current',
    presence: 'approved',
    classification: 'internal',
    ...options,
  }
}

function note(seed: string, independence: ResolvedEvidence['independence']): ResolvedEvidence {
  const noteId = `kn_demo_${seed}`
  const revision = demoRevision(noteId)
  return { ref: { ref: `knowledge:${noteId}@${revision}`, note_id: noteId, revision } satisfies EvidenceRef, state: 'current', independence }
}

function input(controlId: string, options: Partial<Omit<ControlInput, 'control_id'>> = {}): ControlInput {
  return { control_id: controlId, facts: [], evidence: [], conflicts: [], review: null, maturity: null, ...options }
}

function questionsOf(controlId: string): string[] {
  return POSITIONING_READINESS_CONTROLS.find((control) => control.control_id === controlId)?.required_question_ids ?? []
}

/** Every required question of a control, approved and current. */
function allApproved(controlId: string, maturity: MaturityLevel | null = null): ControlInput {
  return input(controlId, { facts: questionsOf(controlId).map((id) => fact(id)), maturity })
}

const COMPANY: AssessmentSubject = { entity_kind: 'company', sells: 'yes', stage: 'established', runs_paid_media: 'no' }

/**
 * The twelve controls that apply to a selling company with no paid media, plus the three that do not.
 * It tells a deliberately ordinary story: most decisions recorded, no independent audience evidence,
 * no pricing stance, and two places where the sources disagree.
 */
function demoControls(): ControlInput[] {
  return [
    allApproved('PRR-01'),
    allApproved('PRR-02'),
    // No research note at all: missing data, not weak data.
    input('PRR-03'),
    allApproved('PRR-04'),
    allApproved('PRR-05'),
    allApproved('PRR-06'),
    // The pricing question was never answered.
    input('PRR-07', { facts: [fact('business.sales.pricing', { state: 'missing', presence: 'absent' })] }),
    // A judgment control whose sources disagree. The conflict is reported, never averaged away.
    input('PRR-08', { evidence: [note('differentiation', 'owner_stated')], conflicts: ['contradiction:demo-differentiation'] }),
    allApproved('PRR-09'),
    input('PRR-10', { facts: [fact('business.marketing.availability_claim')], conflicts: ['contradiction:demo-availability'] }),
    allApproved('PRR-11', '2'),
    allApproved('PRR-12'),
    allApproved('PRR-13'),
    input('PRR-14', { facts: [fact('business.marketing.budget', { classification: 'restricted' })] }),
    allApproved('PRR-15'),
  ]
}

function demoInput(subject: AssessmentSubject, audience: AssessmentInput['audience'], controls: ControlInput[]): AssessmentInput {
  return {
    brand_id: SYNTHETIC_DEMO_BRAND,
    method_id: POSITIONING_READINESS.method_id,
    subject,
    audience,
    as_of: SYNTHETIC_DEMO_AS_OF,
    controls,
    demo: true,
  }
}

/**
 * The main fixture: a selling company that does not run paid media. Twelve controls apply; eight are
 * complete, two have no data and two are conflicted. Completeness is scoreable here precisely because
 * nothing is unknown, unassessed or licence-blocked.
 */
export const SYNTHETIC_DEMO: AssessmentInput = demoInput(COMPANY, 'internal', demoControls())

/**
 * The same brand before anyone said whether it runs paid media. Two controls become
 * `applicability_unknown`, and that alone removes the completeness ratio: a denominator nobody can
 * define is not a denominator.
 */
export const SYNTHETIC_DEMO_UNKNOWN_SCOPE: AssessmentInput = demoInput({ ...COMPANY, runs_paid_media: 'unknown' }, 'internal', demoControls())

/**
 * The same brand after one cited fact changed. The dependent control goes to `needs_review` and the
 * ratio disappears — the earlier verdict is not quietly carried forward onto new data.
 */
export const SYNTHETIC_DEMO_CHANGED_SOURCE: AssessmentInput = demoInput(
  COMPANY,
  'internal',
  demoControls().map((control) => (control.control_id === 'PRR-04' ? input('PRR-04', { facts: [fact('business.offer.value_proposition', { state: 'changed' })] }) : control)),
)

/**
 * The same brand, now running paid media, assessed for an internal audience. The budget control reads
 * a restricted fact, so it is withheld: no value, no sources, and a reason that says why.
 */
export const SYNTHETIC_DEMO_RESTRICTED: AssessmentInput = demoInput({ ...COMPANY, runs_paid_media: 'yes' }, 'internal', demoControls())

export const SYNTHETIC_FIXTURES: Record<string, AssessmentInput> = {
  baseline: SYNTHETIC_DEMO,
  unknown_scope: SYNTHETIC_DEMO_UNKNOWN_SCOPE,
  changed_source: SYNTHETIC_DEMO_CHANGED_SOURCE,
  restricted: SYNTHETIC_DEMO_RESTRICTED,
}
