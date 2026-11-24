/**
 * The deterministic evaluator.
 *
 * `assess()` is a pure function: inputs in, assessment out. It reads no file, opens no network
 * connection and takes its clock as an argument, so the same frozen inputs and the same rule version
 * produce byte-identical output for ever. That is the whole point — a result nobody can reproduce is
 * not evidence of anything.
 *
 * Three things it deliberately refuses to do:
 *
 * 1. **It never reads a brand value.** Inputs describe facts by id, revision and state. A result
 *    carries ids, revisions and reason codes. A restricted value cannot leak through a report
 *    because it was never in the engine.
 * 2. **It does not score unless the denominator is real.** Unknown applicability, an unassessed
 *    control, a licence block or a changed source all make the result `not_scoreable`, with
 *    `numerator` and `denominator` null so no renderer can print a ratio.
 * 3. **It does not guess.** `unknown`, `not_applicable`, `withheld`, `missing` and
 *    `insufficient_evidence` stay distinct, and none of them is zero.
 *
 * Nothing here is a certification, a compliance statement or an audit in the regulatory sense.
 */

import type { Audience } from '../auth.js'
import { canonicalJson, sha256Hex, type EvidenceRef, type FactRef } from '../strategy/model.js'
// The one vocabulary for "is the thing we cited still the thing we cited": current | changed | missing.
import type { RefState } from '../strategy/store.js'
import { assessable, type ClaimLevel, type ClaimCapReason } from './claims.js'
import {
  applicabilityOf,
  controlsForMethod,
  DEFAULT_CATALOG,
  type AssessableControl,
  type AssessmentSubject,
  type ControlDomain,
  type ControlStatus,
  type Criticality,
  type MaturityLevel,
  type MaturityState,
  type MethodCatalog,
  type ReviewableStatus,
  CONTROL_DOMAINS,
  REVIEWABLE_STATUSES,
  controlsDigest,
} from './controls.js'
import { methodById, methodClaim, methodDigest, METHOD_REGISTRY, type MethodEntry } from './registry.js'

export const ASSESSMENT_SCHEMA = 'brand-os.audit-assessment/1'

// ---- inputs -------------------------------------------------------------------------------------

/**
 * How the answer behind a cited fact stands. `unknown` is the owner saying they do not know; it is
 * an answer, and it is not a missing answer and not a zero.
 */
export const FACT_PRESENCE = ['approved', 'draft', 'unknown', 'not_applicable', 'absent'] as const
export type FactPresence = (typeof FACT_PRESENCE)[number]

export interface ResolvedFact {
  ref: FactRef
  /** Whether the pinned revision is still the approved one. */
  state: RefState
  presence: FactPresence
  classification: 'public' | 'internal' | 'restricted'
}

export const INDEPENDENCE = ['independent', 'owner_stated', 'anonymous'] as const
export type Independence = (typeof INDEPENDENCE)[number]

export interface ResolvedEvidence {
  ref: EvidenceRef
  state: RefState
  independence: Independence
}

/** Roles a control judgment may come from. `agent` is deliberately absent and cannot be added here. */
export const REVIEWER_ROLES = ['owner', 'editor', 'marketing', 'finance', 'design', 'external'] as const
export type ReviewerRole = (typeof REVIEWER_ROLES)[number]

export interface ControlReview {
  reviewer_id: string
  /** The reviewer's own role, not an agent's. An agent cannot supply this. */
  reviewer_role: ReviewerRole
  status: ReviewableStatus
  /** Why. A judgment without a written reason is not accepted. */
  rationale: string
  reviewed_at: string
}

export interface ControlInput {
  control_id: string
  facts: ResolvedFact[]
  evidence: ResolvedEvidence[]
  /** Ids of recorded contradictions touching this control. Ids only; never the conflicting text. */
  conflicts: string[]
  review: ControlReview | null
  /** Observed process maturity for a control that carries a maturity signal. */
  maturity: MaturityLevel | null
}

export interface AssessmentInput {
  brand_id: string
  method_id: string
  subject: AssessmentSubject
  /** The audience the result is built for. A restricted input is withheld from anything below it. */
  audience: Audience
  /** The clock, injected. Two runs with the same `as_of` are the same run. */
  as_of: Date
  controls: ControlInput[]
  /** True only for the synthetic fixtures. Renderers must stamp it. */
  demo?: boolean
}

// ---- outputs ------------------------------------------------------------------------------------

/** Stable English codes. Human text in every locale lives in `assurance/i18n.ts`. */
export const REASON_CODES = [
  'license_blocked',
  'not_applicable_by_rule',
  'applicability_unknown',
  'no_input',
  'source_changed',
  'source_missing',
  'fact_not_approved',
  'owner_said_unknown',
  'owner_said_not_applicable',
  'withheld_for_audience',
  'conflict_recorded',
  'reviewer_required',
  'reviewer_rationale_missing',
  'reviewer_role_invalid',
  'reviewer_status_invalid',
  'evidence_below_minimum',
  'evidence_not_independent',
  'all_inputs_present',
] as const
export type ReasonCode = (typeof REASON_CODES)[number]

export const LIMITATION_CODES = [
  'internal_assessment_only',
  'owner_stated_evidence',
  'no_maturity_aggregate',
  'completeness_blocked',
  'restricted_inputs_withheld',
  'demo_data',
] as const
export type LimitationCode = (typeof LIMITATION_CODES)[number]

export interface ControlResult {
  control_id: string
  domain: ControlDomain
  status: ControlStatus
  criticality: Criticality
  reason_codes: ReasonCode[]
  /** Exactly what was consulted, by id and revision. Never a value. */
  source_refs: Array<{ kind: 'fact' | 'research_note'; id: string; revision: string; state: RefState }>
  /** Question ids that would move this control forward. Existing ids only; nothing is invented. */
  next_questions: string[]
  reviewer_id: string | null
}

export interface Completeness {
  state: 'scoreable' | 'not_scoreable'
  /** Null whenever the state is `not_scoreable`, so a ratio cannot be rendered. */
  numerator: number | null
  denominator: number | null
  excluded: number
  /** Why there is no number. Empty when there is one. */
  blocked_by: ReasonCode[]
}

export const EVIDENCE_QUALITIES = ['independently_verified', 'mixed', 'owner_stated', 'insufficient_evidence', 'not_assessed'] as const
export type EvidenceQuality = (typeof EVIDENCE_QUALITIES)[number]

export interface DomainMaturity {
  domain: ControlDomain
  state: MaturityState
  /** Controls that carry a maturity signal in this domain, and how many supplied one. */
  signals: number
  signal_controls: number
}

export interface AuditAssessment {
  schema: typeof ASSESSMENT_SCHEMA
  schema_version: 1
  id: string
  brand_id: string
  demo: boolean
  method_id: string
  method_edition: string | null
  method_rule_sha256: string
  evaluation_rule_version: string | null
  /** What this assessment may be called. Never raised by running it. */
  claim_level: ClaimLevel
  claim_capped_by: ClaimCapReason[]
  as_of: string
  audience: Audience
  subject: AssessmentSubject
  source_snapshot_digest: string
  control_results: ControlResult[]
  completeness: Completeness
  evidence_quality: EvidenceQuality
  evidence_coverage: { controls_with_independent_evidence: number; applicable_controls: number }
  maturity_by_domain: DomainMaturity[]
  /** Always null: no empirically published aggregation rule exists, so no single maturity number is shown. */
  maturity_aggregate: null
  limitations: LimitationCode[]
}

// ---- evaluation ---------------------------------------------------------------------------------

const AUDIENCE_RANK: Record<Audience, number> = { public: 0, internal: 1, restricted: 2 }

function byKey<T>(key: (value: T) => string): (a: T, b: T) => number {
  return (a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)
}

function refsOf(input: ControlInput | null): ControlResult['source_refs'] {
  if (!input) return []
  // Sorted, so the order a resolver happened to list sources in never changes the output.
  return [
    ...input.facts.map((fact) => ({ kind: 'fact' as const, id: fact.ref.id, revision: fact.ref.revision, state: fact.state })),
    ...input.evidence.map((item) => ({ kind: 'research_note' as const, id: item.ref.note_id, revision: item.ref.revision, state: item.state })),
  ].sort(byKey((ref) => `${ref.kind}\u0000${ref.id}\u0000${ref.revision}`))
}

/** Exactly the four subject fields, so nothing else a caller attached can ride along into the output. */
function subjectOf(subject: AssessmentSubject): AssessmentSubject {
  return { entity_kind: subject.entity_kind, sells: subject.sells, stage: subject.stage, runs_paid_media: subject.runs_paid_media }
}

function unmet(control: AssessableControl, input: ControlInput): string[] {
  const satisfied = new Set(input.facts.filter((fact) => fact.presence === 'approved' && fact.state === 'current').map((fact) => fact.ref.id))
  return control.required_question_ids.filter((id) => !satisfied.has(id))
}

function sorted<T extends string>(values: Iterable<T>): T[] {
  return [...new Set(values)].sort()
}

/** One control. The order of the checks is the method: applicability and licence come before evidence. */
function evaluateControl(control: AssessableControl, input: ControlInput | null, subject: AssessmentSubject, audience: Audience, methodAssessable: boolean): ControlResult {
  const base = {
    control_id: control.control_id,
    domain: control.domain,
    criticality: control.decision_criticality,
    source_refs: refsOf(input),
    reviewer_id: input?.review?.reviewer_id ?? null,
  }
  const result = (status: ControlStatus, reasons: ReasonCode[], nextQuestions: string[] = []): ControlResult => ({
    ...base,
    status,
    reason_codes: sorted(reasons),
    next_questions: sorted(nextQuestions),
  })

  // 1. Licence. Not knowing a rule is not the same as failing it.
  if (!methodAssessable) return result('blocked_by_license', ['license_blocked'])

  // 2. Applicability, before any evidence is looked at.
  const applicability = applicabilityOf(control.applicability, subject)
  if (applicability === 'not_applicable') return result('not_applicable', ['not_applicable_by_rule'])
  if (applicability === 'unknown') return result('applicability_unknown', ['applicability_unknown'])

  // 3. Nothing was resolved for this control. Not assessed is not "failed".
  if (!input) return result('not_assessed', ['no_input'], control.required_question_ids)

  // 4. Audience. A restricted input is withheld: no value was ever read, and not even the list of
  // sources is emitted, so a withheld control cannot become a map of what the owner keeps private.
  const restrictedInput = control.privacy_classification === 'restricted' || input.facts.some((fact) => fact.classification === 'restricted')
  if (restrictedInput && AUDIENCE_RANK[audience] < AUDIENCE_RANK.restricted) {
    return { ...base, source_refs: [], status: 'evidence_insufficient', reason_codes: ['withheld_for_audience'], next_questions: [] }
  }

  // 5. A cited source that changed invalidates the verdict. No reviewer field can override this.
  const changed = [...input.facts.map((fact) => fact.state), ...input.evidence.map((item) => item.state)].includes('changed')
  if (changed) return result('needs_review', ['source_changed'], unmet(control, input))

  // 6. A recorded contradiction is reported, never averaged away.
  if (input.conflicts.length > 0) return result('conflicted', ['conflict_recorded'], unmet(control, input))

  // 7. Judgment controls need a person, with a role and a written reason.
  if (control.evaluation_mode === 'reviewer_judgment') {
    const review = input.review
    if (!review) return result('needs_review', ['reviewer_required'], unmet(control, input))
    if (!review.rationale.trim()) return result('needs_review', ['reviewer_rationale_missing'], unmet(control, input))
    if (!(REVIEWER_ROLES as readonly string[]).includes(review.reviewer_role)) return result('needs_review', ['reviewer_role_invalid'], unmet(control, input))
    if (!(REVIEWABLE_STATUSES as readonly string[]).includes(review.status)) return result('needs_review', ['reviewer_status_invalid'], unmet(control, input))
    return result(review.status, ['all_inputs_present'])
  }

  // 8. Deterministic evaluation of what is actually there.
  const reasons: ReasonCode[] = []
  const missing = unmet(control, input)
  for (const id of missing) {
    const fact = input.facts.find((entry) => entry.ref.id === id)
    if (!fact) reasons.push('source_missing')
    else if (fact.state === 'missing') reasons.push('source_missing')
    else if (fact.presence === 'unknown') reasons.push('owner_said_unknown')
    else if (fact.presence === 'not_applicable') reasons.push('owner_said_not_applicable')
    else reasons.push('fact_not_approved')
  }

  const usable = input.evidence.filter((item) => item.state === 'current')
  const need = control.required_evidence
  // `none`: nothing to weigh, which is missing data. `insufficient`: something was weighed and was
  // not enough — a different finding, with a different next step.
  let evidence: 'met' | 'insufficient' | 'none' = 'met'
  if (need) {
    const counted = need.independence === 'independent' ? usable.filter((item) => item.independence === 'independent') : usable
    if (usable.length === 0) {
      evidence = 'none'
      reasons.push('source_missing')
    } else if (counted.length < need.min) {
      evidence = 'insufficient'
      reasons.push(counted.length < usable.length ? 'evidence_not_independent' : 'evidence_below_minimum')
    }
  }

  const required = control.required_question_ids.length
  if (missing.length === 0 && evidence === 'met') return result('applicable_complete', ['all_inputs_present'])
  if (missing.length === 0 && evidence === 'insufficient') return result('evidence_insufficient', reasons, control.related_question_ids)
  if (required > 0 && missing.length < required) return result('applicable_partial', reasons, missing)
  return result('applicable_missing', reasons, missing.length > 0 ? missing : control.related_question_ids)
}

const BLOCKING: ControlStatus[] = ['applicability_unknown', 'not_assessed', 'blocked_by_license', 'needs_review']

function completenessOf(results: ControlResult[]): Completeness {
  const excluded = results.filter((entry) => entry.status === 'not_applicable').length
  const blockers = results.filter((entry) => BLOCKING.includes(entry.status))
  if (blockers.length > 0) {
    // A `needs_review` blocker carries its own reason: a changed source, or a judgment nobody has made yet.
    // Reporting every one as `source_changed` would tell the owner to re-check data that never moved.
    const codes = sorted(
      blockers.flatMap((entry): ReasonCode[] =>
        entry.status === 'applicability_unknown' ? ['applicability_unknown'] : entry.status === 'not_assessed' ? ['no_input'] : entry.status === 'blocked_by_license' ? ['license_blocked'] : entry.reason_codes,
      ),
    )
    return { state: 'not_scoreable', numerator: null, denominator: null, excluded, blocked_by: codes }
  }
  const applicable = results.filter((entry) => entry.status !== 'not_applicable')
  const complete = applicable.filter((entry) => entry.status === 'applicable_complete').length
  return { state: 'scoreable', numerator: complete, denominator: applicable.length, excluded, blocked_by: [] }
}

function evidenceQualityOf(inputs: ControlInput[], results: ControlResult[]): { quality: EvidenceQuality; coverage: AuditAssessment['evidence_coverage'] } {
  const applicable = results.filter((entry) => entry.status !== 'not_applicable' && entry.status !== 'blocked_by_license')
  const byId = new Map(inputs.map((input) => [input.control_id, input]))
  const usable = applicable.flatMap((entry) => (byId.get(entry.control_id)?.evidence ?? []).filter((item) => item.state === 'current'))
  const withIndependent = applicable.filter((entry) => (byId.get(entry.control_id)?.evidence ?? []).some((item) => item.state === 'current' && item.independence === 'independent')).length
  const coverage = { controls_with_independent_evidence: withIndependent, applicable_controls: applicable.length }
  if (applicable.length === 0) return { quality: 'not_assessed', coverage }
  if (usable.length === 0) return { quality: 'insufficient_evidence', coverage }
  const independent = usable.filter((item) => item.independence === 'independent').length
  if (independent === usable.length) return { quality: 'independently_verified', coverage }
  if (independent === 0) return { quality: 'owner_stated', coverage }
  return { quality: 'mixed', coverage }
}

/**
 * Maturity per domain, never averaged across domains. A domain is as mature as its weakest observed
 * signal: claiming the strongest would describe a brand nobody has.
 */
function maturityOf(controls: AssessableControl[], inputs: ControlInput[], results: ControlResult[]): DomainMaturity[] {
  const byId = new Map(inputs.map((input) => [input.control_id, input]))
  const status = new Map(results.map((entry) => [entry.control_id, entry.status]))
  return CONTROL_DOMAINS.map((domain) => {
    const signalControls = controls.filter((control) => control.domain === domain && control.maturity_signal)
    if (signalControls.length === 0) return { domain, state: 'not_applicable' as MaturityState, signals: 0, signal_controls: 0 }
    if (signalControls.every((control) => status.get(control.control_id) === 'not_applicable')) {
      return { domain, state: 'not_applicable' as MaturityState, signals: 0, signal_controls: signalControls.length }
    }
    if (signalControls.some((control) => status.get(control.control_id) === 'applicability_unknown')) {
      return { domain, state: 'unknown' as MaturityState, signals: 0, signal_controls: signalControls.length }
    }
    const levels = signalControls
      .filter((control) => status.get(control.control_id) === 'applicable_complete')
      .map((control) => byId.get(control.control_id)?.maturity ?? null)
      .filter((level): level is MaturityLevel => level !== null)
    if (levels.length === 0) return { domain, state: 'insufficient_evidence' as MaturityState, signals: 0, signal_controls: signalControls.length }
    const weakest = levels.reduce((low, level) => (Number(level) < Number(low) ? level : low), levels[0] as MaturityLevel)
    return { domain, state: weakest as MaturityState, signals: levels.length, signal_controls: signalControls.length }
  })
}

/** Everything the run depended on, hashed. Two runs with the same digest consulted the same world. */
export function sourceSnapshotDigest(input: AssessmentInput): string {
  return sha256Hex(
    canonicalJson({
      brand_id: input.brand_id,
      method_id: input.method_id,
      subject: subjectOf(input.subject),
      audience: input.audience,
      as_of: input.as_of.toISOString(),
      controls: [...input.controls]
        .sort((a, b) => (a.control_id < b.control_id ? -1 : 1))
        .map((control) => ({
          control_id: control.control_id,
          facts: control.facts
            .map((fact) => ({ id: fact.ref.id, revision: fact.ref.revision, state: fact.state, presence: fact.presence, classification: fact.classification }))
            .sort(byKey((fact) => `${fact.id}\u0000${fact.revision}`)),
          evidence: control.evidence
            .map((item) => ({ note_id: item.ref.note_id, revision: item.ref.revision, state: item.state, independence: item.independence }))
            .sort(byKey((item) => `${item.note_id}\u0000${item.revision}`)),
          conflicts: [...control.conflicts].sort(),
          review: control.review ? { reviewer_id: control.review.reviewer_id, status: control.review.status, reviewed_at: control.review.reviewed_at } : null,
          maturity: control.maturity,
        })),
    }),
  )
}

export function methodRuleDigest(method: MethodEntry, controls: AssessableControl[]): string {
  return sha256Hex(canonicalJson({ method: methodDigest(method), controls: controlsDigest(controls) }))
}

export class AssuranceError extends Error {
  constructor(
    readonly code: 'unknown_method' | 'no_controls',
    message: string,
  ) {
    super(message)
    this.name = 'AssuranceError'
  }
}

/**
 * Assess one brand against one method. Pure: no file, no network, no clock of its own.
 *
 * The result is an internal assessment against a named method at a named edition. It is not a
 * certification, not a compliance statement and not an independent audit.
 */
export function assess(input: AssessmentInput, catalog: MethodCatalog = DEFAULT_CATALOG, registry: MethodEntry[] = METHOD_REGISTRY): AuditAssessment {
  const method = methodById(input.method_id, registry)
  if (!method) throw new AssuranceError('unknown_method', `No method ${input.method_id} in the registry.`)
  const controls = controlsForMethod(method.method_id, catalog)
  if (controls.length === 0) throw new AssuranceError('no_controls', `Method ${method.method_id} has no controls, so there is nothing to assess.`)

  const claim = methodClaim(method)
  const methodAssessable = assessable(method)
  const byId = new Map(input.controls.map((control) => [control.control_id, control]))

  const results = [...controls]
    .sort((a, b) => (a.control_id < b.control_id ? -1 : 1))
    .map((control) => evaluateControl(control, byId.get(control.control_id) ?? null, input.subject, input.audience, methodAssessable))

  const completeness = completenessOf(results)
  const { quality, coverage } = evidenceQualityOf(input.controls, results)

  const limitations: LimitationCode[] = ['internal_assessment_only', 'no_maturity_aggregate']
  if (completeness.state === 'not_scoreable') limitations.push('completeness_blocked')
  if (quality === 'owner_stated' || quality === 'mixed') limitations.push('owner_stated_evidence')
  if (results.some((entry) => entry.reason_codes.includes('withheld_for_audience'))) limitations.push('restricted_inputs_withheld')
  if (input.demo) limitations.push('demo_data')

  const snapshot = sourceSnapshotDigest(input)
  const asOf = input.as_of.toISOString()
  return {
    schema: ASSESSMENT_SCHEMA,
    schema_version: 1,
    id: `asm_${sha256Hex(canonicalJson({ brand_id: input.brand_id, method_id: method.method_id, as_of: asOf, snapshot })).slice(0, 32)}`,
    brand_id: input.brand_id,
    demo: input.demo === true,
    method_id: method.method_id,
    method_edition: method.edition,
    method_rule_sha256: methodRuleDigest(method, controls),
    evaluation_rule_version: method.evaluation_rule_version,
    claim_level: claim.level,
    claim_capped_by: claim.capped_by,
    as_of: asOf,
    audience: input.audience,
    subject: subjectOf(input.subject),
    source_snapshot_digest: snapshot,
    control_results: results,
    completeness,
    evidence_quality: quality,
    evidence_coverage: coverage,
    maturity_by_domain: maturityOf(controls, input.controls, results),
    maturity_aggregate: null,
    limitations: sorted(limitations),
  }
}
