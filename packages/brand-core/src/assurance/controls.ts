/**
 * Assessable controls.
 *
 * A control is a question the method asks about one brand, together with everything needed to answer
 * it the same way twice: when it applies, which approved facts and which evidence it needs, who owns
 * it, how sensitive it is, and whether a person has to judge it. Controls hold ids and rules only —
 * never a brand value, never a standard's clause text.
 *
 * The first method is ours: `brand-os.positioning-readiness`. It asks whether the positioning
 * decisions a brand has to make are recorded, evidenced and bounded by approved claims. It is not a
 * measure of brand strength, market share or compliance, and it is not ISO.
 */

import { canonicalJson, sha256Hex } from '../strategy/model.js'
import { POSITIONING_READINESS } from './registry.js'

/** The ten statuses. They are not grades on one scale: `not_applicable` is not a bad `complete`. */
export const CONTROL_STATUSES = [
  'applicable_complete',
  'applicable_partial',
  'applicable_missing',
  'not_applicable',
  'applicability_unknown',
  'evidence_insufficient',
  'conflicted',
  'needs_review',
  'blocked_by_license',
  'not_assessed',
] as const
export type ControlStatus = (typeof CONTROL_STATUSES)[number]

/** Statuses a human reviewer may choose for a `reviewer_judgment` control. The rest are the engine's. */
export const REVIEWABLE_STATUSES = ['applicable_complete', 'applicable_partial', 'applicable_missing', 'evidence_insufficient', 'not_applicable'] as const
export type ReviewableStatus = (typeof REVIEWABLE_STATUSES)[number]

export const CONTROL_DOMAINS = ['audience', 'offer', 'proof', 'governance', 'measurement'] as const
export type ControlDomain = (typeof CONTROL_DOMAINS)[number]

export const CRITICALITIES = ['critical', 'important', 'supporting'] as const
export type Criticality = (typeof CRITICALITIES)[number]

/** Observed process maturity, an original ordinal scale. Not an ISO maturity model. */
export const MATURITY_LEVELS = ['0', '1', '2', '3', '4'] as const
export type MaturityLevel = (typeof MATURITY_LEVELS)[number]
export const MATURITY_STATES = [...MATURITY_LEVELS, 'unknown', 'not_applicable', 'insufficient_evidence'] as const
export type MaturityState = (typeof MATURITY_STATES)[number]

// ---- applicability -----------------------------------------------------------------------------

export const SUBJECT_FIELDS = ['entity_kind', 'sells', 'stage', 'runs_paid_media'] as const
export type SubjectField = (typeof SUBJECT_FIELDS)[number]

/**
 * What the method needs to know about the assessed entity before it can decide what applies. Every
 * field may be `unknown`, and `unknown` is never treated as `no`.
 */
export interface AssessmentSubject {
  entity_kind: 'company' | 'person' | 'unknown'
  sells: 'yes' | 'no' | 'unknown'
  stage: 'new' | 'established' | 'unknown'
  runs_paid_media: 'yes' | 'no' | 'unknown'
}

export interface ApplicabilityCondition {
  field: SubjectField
  /** Subject values that make the control apply. `unknown` is never listed. */
  one_of: string[]
}

export interface ApplicabilityRule {
  rule_id: string
  /** All conditions must hold. An empty list means the control always applies. */
  conditions: ApplicabilityCondition[]
}

export type Applicability = 'applicable' | 'not_applicable' | 'unknown'

/**
 * Applicability is decided before anything else. A definite exclusion wins over an unknown field: if
 * one condition rules the control out, it is out whatever else we do not know.
 */
export function applicabilityOf(rule: ApplicabilityRule, subject: AssessmentSubject): Applicability {
  let unknown = false
  for (const condition of rule.conditions) {
    const value = subject[condition.field]
    if (value === 'unknown') {
      unknown = true
      continue
    }
    if (!condition.one_of.includes(value)) return 'not_applicable'
  }
  return unknown ? 'unknown' : 'applicable'
}

const ALWAYS: ApplicabilityRule = { rule_id: 'always', conditions: [] }
const SELLS: ApplicabilityRule = { rule_id: 'sells_something', conditions: [{ field: 'sells', one_of: ['yes'] }] }
const PAID_MEDIA: ApplicabilityRule = { rule_id: 'runs_paid_media', conditions: [{ field: 'runs_paid_media', one_of: ['yes'] }] }
const PERSON: ApplicabilityRule = { rule_id: 'person_brand', conditions: [{ field: 'entity_kind', one_of: ['person'] }] }

// ---- the control --------------------------------------------------------------------------------

export interface EvidenceRequirement {
  /** How many current research notes the control needs. Research notes are the only quote store. */
  min: number
  /** `independent`: the note must not be the owner's own statement about themselves. */
  independence: 'any' | 'independent'
}

export interface AssessableControl {
  control_id: string
  method_id: string
  domain: ControlDomain
  applicability: ApplicabilityRule
  /** Question ids that must be approved facts for this control to be complete. */
  required_question_ids: string[]
  /** Questions that inform the control without answering it. Never counted. */
  related_question_ids: string[]
  required_evidence: EvidenceRequirement | null
  evaluation_mode: 'deterministic' | 'reviewer_judgment'
  evaluation_rule_version: string
  decision_criticality: Criticality
  owner_role: 'owner' | 'marketing' | 'finance' | 'design' | 'editor'
  /** The highest classification of the inputs this control reads. Gates which audience may see a result. */
  privacy_classification: 'public' | 'internal' | 'restricted'
  /** Whether a completed control contributes an observed-maturity signal to its domain. */
  maturity_signal: boolean
  visualization: 'readiness_bar' | 'gap_matrix' | 'evidence_stack' | 'maturity_stair'
}

const M = POSITIONING_READINESS.method_id
const V = '1'

type ControlDefaults = 'method_id' | 'evaluation_rule_version' | 'related_question_ids' | 'required_evidence' | 'maturity_signal' | 'evaluation_mode'

function control(partial: Omit<AssessableControl, ControlDefaults> & Partial<Pick<AssessableControl, ControlDefaults>>): AssessableControl {
  return {
    method_id: M,
    evaluation_rule_version: V,
    related_question_ids: [],
    required_evidence: null,
    maturity_signal: false,
    evaluation_mode: 'deterministic',
    ...partial,
  }
}

/**
 * Fifteen controls. For a selling company that does not run paid media, twelve apply; a person brand
 * or a paid-media programme changes which twelve. Every required question id below is a real id in
 * the question bank — `tests/assurance-controls.test.ts` fails if one disappears.
 */
export const POSITIONING_READINESS_CONTROLS: AssessableControl[] = [
  control({
    control_id: 'PRR-01',
    domain: 'audience',
    applicability: ALWAYS,
    required_question_ids: ['business.customer.primary_segment'],
    decision_criticality: 'critical',
    owner_role: 'owner',
    privacy_classification: 'internal',
    visualization: 'readiness_bar',
  }),
  control({
    control_id: 'PRR-02',
    domain: 'audience',
    applicability: ALWAYS,
    required_question_ids: ['business.market.geography'],
    decision_criticality: 'important',
    owner_role: 'owner',
    privacy_classification: 'internal',
    visualization: 'readiness_bar',
  }),
  control({
    control_id: 'PRR-03',
    domain: 'audience',
    applicability: ALWAYS,
    required_question_ids: [],
    related_question_ids: ['business.customer.primary_segment'],
    required_evidence: { min: 1, independence: 'independent' },
    decision_criticality: 'critical',
    owner_role: 'marketing',
    privacy_classification: 'internal',
    maturity_signal: true,
    visualization: 'evidence_stack',
  }),
  control({
    control_id: 'PRR-04',
    domain: 'offer',
    applicability: ALWAYS,
    required_question_ids: ['business.offer.value_proposition'],
    decision_criticality: 'critical',
    owner_role: 'owner',
    privacy_classification: 'internal',
    visualization: 'readiness_bar',
  }),
  control({
    control_id: 'PRR-05',
    domain: 'offer',
    applicability: ALWAYS,
    required_question_ids: ['brand.strategy.differentiation'],
    decision_criticality: 'critical',
    owner_role: 'owner',
    privacy_classification: 'internal',
    visualization: 'readiness_bar',
  }),
  control({
    control_id: 'PRR-06',
    domain: 'offer',
    applicability: ALWAYS,
    required_question_ids: ['brand.strategy.promise'],
    decision_criticality: 'important',
    owner_role: 'owner',
    privacy_classification: 'internal',
    visualization: 'readiness_bar',
  }),
  control({
    control_id: 'PRR-07',
    domain: 'offer',
    applicability: SELLS,
    required_question_ids: ['business.sales.pricing'],
    decision_criticality: 'important',
    owner_role: 'owner',
    privacy_classification: 'internal',
    visualization: 'gap_matrix',
  }),
  control({
    control_id: 'PRR-08',
    domain: 'proof',
    applicability: ALWAYS,
    required_question_ids: [],
    related_question_ids: ['brand.strategy.differentiation'],
    required_evidence: { min: 1, independence: 'independent' },
    evaluation_mode: 'reviewer_judgment',
    decision_criticality: 'critical',
    owner_role: 'owner',
    privacy_classification: 'internal',
    maturity_signal: true,
    visualization: 'evidence_stack',
  }),
  control({
    control_id: 'PRR-09',
    domain: 'proof',
    applicability: ALWAYS,
    required_question_ids: ['brand.verbal.forbidden'],
    decision_criticality: 'important',
    owner_role: 'editor',
    privacy_classification: 'internal',
    visualization: 'readiness_bar',
  }),
  control({
    control_id: 'PRR-10',
    domain: 'proof',
    applicability: ALWAYS,
    required_question_ids: ['business.marketing.availability_claim'],
    decision_criticality: 'critical',
    owner_role: 'marketing',
    privacy_classification: 'internal',
    visualization: 'gap_matrix',
  }),
  control({
    control_id: 'PRR-11',
    domain: 'governance',
    applicability: ALWAYS,
    required_question_ids: ['brand.strategy.decision_rule'],
    decision_criticality: 'important',
    owner_role: 'owner',
    privacy_classification: 'internal',
    maturity_signal: true,
    visualization: 'maturity_stair',
  }),
  control({
    control_id: 'PRR-12',
    domain: 'governance',
    applicability: ALWAYS,
    required_question_ids: ['brand.strategy.purpose'],
    decision_criticality: 'supporting',
    owner_role: 'owner',
    privacy_classification: 'internal',
    visualization: 'readiness_bar',
  }),
  control({
    control_id: 'PRR-13',
    domain: 'measurement',
    applicability: PAID_MEDIA,
    required_question_ids: ['business.marketing.objective', 'business.marketing.attribution'],
    decision_criticality: 'important',
    owner_role: 'marketing',
    privacy_classification: 'internal',
    maturity_signal: true,
    visualization: 'maturity_stair',
  }),
  control({
    control_id: 'PRR-14',
    domain: 'measurement',
    applicability: PAID_MEDIA,
    required_question_ids: ['business.marketing.budget'],
    decision_criticality: 'supporting',
    owner_role: 'finance',
    // The budget is a restricted fact. The control exists so its absence is visible; its result is
    // withheld from every audience below `restricted`, and its value is never read.
    privacy_classification: 'restricted',
    visualization: 'gap_matrix',
  }),
  control({
    control_id: 'PRR-15',
    domain: 'audience',
    applicability: PERSON,
    required_question_ids: ['personal.positioning.known_for'],
    decision_criticality: 'critical',
    owner_role: 'owner',
    privacy_classification: 'public',
    visualization: 'readiness_bar',
  }),
]

export interface MethodCatalog {
  controls: AssessableControl[]
}

export const DEFAULT_CATALOG: MethodCatalog = { controls: POSITIONING_READINESS_CONTROLS }

export function controlsForMethod(methodId: string, catalog: MethodCatalog = DEFAULT_CATALOG): AssessableControl[] {
  return catalog.controls.filter((entry) => entry.method_id === methodId)
}

export function controlById(controlId: string, catalog: MethodCatalog = DEFAULT_CATALOG): AssessableControl | null {
  return catalog.controls.find((entry) => entry.control_id === controlId) ?? null
}

/** Digest of the exact rules a run used. A changed control changes it, so results cannot drift silently. */
export function controlsDigest(controls: AssessableControl[]): string {
  return sha256Hex(canonicalJson([...controls].sort((a, b) => (a.control_id < b.control_id ? -1 : 1))))
}

const CONTROL_ID = /^[A-Z]{2,6}-\d{2}$/

export function controlErrors(controls: AssessableControl[] = POSITIONING_READINESS_CONTROLS): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  for (const entry of controls) {
    const where = entry.control_id || '(no id)'
    if (!CONTROL_ID.test(entry.control_id)) errors.push(`${where}: control_id must match ${String(CONTROL_ID)}`)
    if (seen.has(entry.control_id)) errors.push(`${where}: duplicate control_id`)
    seen.add(entry.control_id)
    if (entry.required_question_ids.length === 0 && entry.required_evidence === null) {
      errors.push(`${where}: a control with neither a required question nor required evidence can never be completed`)
    }
    for (const condition of entry.applicability.conditions) {
      if (condition.one_of.includes('unknown')) errors.push(`${where}: applicability must not treat "unknown" as a value that makes a control apply`)
      if (condition.one_of.length === 0) errors.push(`${where}: applicability condition on ${condition.field} lists no value`)
    }
    const overlap = entry.related_question_ids.filter((id) => entry.required_question_ids.includes(id))
    if (overlap.length > 0) errors.push(`${where}: ${overlap.join(', ')} is both required and merely related`)
    if (entry.required_evidence && entry.required_evidence.min < 1) errors.push(`${where}: required_evidence.min must be at least 1`)
  }
  return errors
}
