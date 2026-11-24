/**
 * The owner-local bridge from a real brand workspace to the Assurance evaluator (GAP-09).
 *
 * `assess()` is pure and takes frozen inputs. This file builds those inputs from what the brand has
 * already approved, and nothing else:
 *
 * - **Facts** come from `brand/instance/approved-facts.yaml` through `readFacts`, pinned by their
 *   `revision_hash`. An answer that is not approved is never treated as approved; its presence
 *   (`draft`, `unknown`, `not_applicable`, `absent`) is read from the answer ledger.
 * - **Evidence** is the brand's internal research notes in the Knowledge Inbox whose `question_ids`
 *   touch the control, pinned by note revision. Restricted notes are never read.
 * - **Conflicts** are the interview's own deterministic contradictions (`findContradictions`), by id.
 * - **Subject** fields come from approved facts and `brand.config.yaml`. Whether the brand runs paid
 *   media is the interview question `business.marketing.paid_media`. The old `--paid-media` statement is
 *   a deprecated fallback, used only while that question has no approved answer.
 * - **Company or person** comes from `brand.profile` only. A person-centred brand is the
 *   `personal-brand` profile. Turning on the personal module for a company brand (a founder's personal
 *   brand) never makes the company a person: it is recorded separately in `personal_brand`, outside the
 *   assessed subject.
 * - **Independence** of a research note comes from the owner's link to an evidence-register entry
 *   (`links.ts`). A note is `independent` only while its link is in force on the day assessed and the
 *   register entry qualifies by the register's own rules; otherwise it stays `owner_stated`.
 * - **Reviews** for `reviewer_judgment` controls come from the owner's judgment store (`reviews.ts`). A
 *   judgment is used only while everything it was about (its basis) is unchanged; otherwise it is stale
 *   and the control is blocking again. The snapshot carries the revision id, never the owner's note.
 *
 * Rules this bridge keeps:
 *
 * 1. **Owner-local.** Refused while `BRAND_OS_AGENT_TOKEN` is set. No MCP tool, `brand_retrieve` kind,
 *    Studio route or agent profile reaches it.
 * 2. **Read-only.** Building, assessing and verifying write no file, cache or lock anywhere. The one
 *    write is `recordReview`, the owner's own judgment, to `brand/.private/assurance/reviews/`.
 * 3. **No values out.** The snapshot carries ids, revisions, states and closed-vocabulary subject
 *    values. A restricted fact below the `restricted` audience is not even pinned (`revision: withheld`).
 * 4. **Reproducible.** The digest is `sourceSnapshotDigest()` of the built input: the same workspace
 *    state, clock and options give the same digest, regardless of file order.
 * 5. **No score on an incomplete snapshot.** Everything that would make `assess()` refuse a ratio is
 *    listed as `blocking`; facts that are simply not approved are listed as `gaps`. The bridge never
 *    fills, guesses or pads an input to reach a score.
 * 6. **No certification.** The result is an internal assessment against Brand OS's own method. It is
 *    not a certification, a compliance statement or an independent audit, and `authorizes` is empty.
 */

import { AGENT_TOKEN_ENV } from '../agent-tokens.js'
import type { Audience } from '../auth.js'
import { latestAnswers } from '../completeness.js'
import { personalConfig } from '../conditions.js'
import { findContradictions } from '../contradictions.js'
import { InterviewEngine } from '../engine.js'
import { isIndependentSource, readEvidence, type EvidenceItem } from '../evidence.js'
import { readFacts, type CanonicalFact } from '../facts.js'
import { scanAll } from '../knowledge/store.js'
import { openWorkspace, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import { canonicalJson, type EvidenceRef, type FactRef } from '../strategy/model.js'
import { evidenceState, factState, type RefState } from '../strategy/store.js'
import type { AnswerRecord, FieldQuestion } from '../types.js'
import { assess, sourceSnapshotDigest, type AssessmentInput, type AuditAssessment, type ControlInput, type ControlReview, type FactPresence, type ResolvedEvidence, type ResolvedFact } from './assess.js'
import { applicabilityOf, controlsForMethod, DEFAULT_CATALOG, type AssessableControl, type AssessmentSubject, type SubjectField } from './controls.js'
import { methodById, POSITIONING_READINESS } from './registry.js'
import { appendLink, assertOwnerLink, AssuranceLinkError, linkAsOf, linkState, readLinkHistory, type LinkRevision, type LinkState } from './links.js'
import { appendReview, AssuranceReviewError, assertOwnerReview, basisDigest, JUDGMENT_STATUS, readReviewHistory, reviewAsOf, type Judgment, type ReviewBasis, type ReviewRevision } from './reviews.js'

export const SNAPSHOT_SCHEMA = 'brand-os.assurance-snapshot/1'
/** Version of the mapping from a workspace to assessment inputs. A changed mapping is a visible change. */
export const BRIDGE_VERSION = 'brand-os.assurance-bridge/4'
/** The revision written for a restricted fact the audience may not see. Never a hash of anything. */
export const WITHHELD_REVISION = 'withheld'
/** Bound on a `--pin` / `verify` snapshot file, so a hostile file cannot exhaust memory. */
export const MAX_SNAPSHOT_BYTES = 1024 * 1024

const AUDIENCE_RANK: Record<Audience, number> = { public: 0, internal: 1, restricted: 2 }

export class AssuranceBridgeError extends Error {
  constructor(
    readonly code: 'refused' | 'not_a_brand' | 'invalid_input' | 'invalid_pin' | 'invalid_review' | 'invalid_link',
    message: string,
  ) {
    super(message)
    this.name = 'AssuranceBridgeError'
  }
}

/** Owner-local: an agent process never reaches the bridge. Same rule as the Strategic Coach. */
export function assertOwnerAssurance(env: NodeJS.ProcessEnv = process.env): void {
  if (env[AGENT_TOKEN_ENV]) {
    throw new AssuranceBridgeError('refused', `Assurance on a real brand is the owner's local review. Refusing while ${AGENT_TOKEN_ENV} is set; no agent profile covers it.`)
  }
}

// ---- options and output -------------------------------------------------------------------------

export type PaidMediaStatement = 'yes' | 'no' | 'unknown'

/** Revisions a previous snapshot cited. Re-checked against the workspace now: current, changed or missing. */
export interface SnapshotPins {
  facts: FactRef[]
  /** Research notes by the control that cited them, so a note deleted since is still reported, as missing. */
  evidence: Array<EvidenceRef & { control_id: string }>
  /** The brand and method the kept snapshot was built for. When set, pins from another brand or method are refused. */
  brand_id?: string
  method_id?: string
}

export interface BridgeOptions {
  /** The clock, injected. Required: a snapshot without a fixed clock is not reproducible. */
  asOf: Date
  audience?: Audience
  /**
   * Deprecated: the old `--paid-media` statement. The answer now comes from the approved interview
   * question `business.marketing.paid_media`; this is only a fallback while that has no approved answer
   * (an approved `undecided` is an answer: the statement is then ignored).
   */
  paidMedia?: PaidMediaStatement
  pins?: SnapshotPins | null
  method_id?: string
}

export type SubjectSource = 'approved_fact' | 'brand_config' | 'owner_flag' | 'none'

export interface SubjectProvenance {
  field: SubjectField
  value: string
  source: SubjectSource
  /** The approved fact the value came from, by id and revision. Never the fact's value. */
  question_id: string | null
}

export const MISSING_KINDS = ['subject_field', 'fact', 'evidence', 'independent_evidence', 'reviewer_judgment', 'stale_judgment', 'changed_source'] as const
export type MissingKind = (typeof MISSING_KINDS)[number]

export interface MissingItem {
  kind: MissingKind
  /** True when this item alone keeps `assess()` from giving a completeness ratio. */
  blocking: boolean
  control_id: string | null
  /** A subject field, for `subject_field`. */
  field: SubjectField | null
  /** Existing question ids that would close the item. Nothing is invented. */
  question_ids: string[]
  /** For `fact`: how the answer stands now. Never its value. */
  presence: FactPresence | null
  /** For `subject_field` with no canonical question: the command-line statement that sets it. */
  flag: string | null
}

/** The question that states whether the brand runs paid media. */
export const PAID_MEDIA_QUESTION = 'business.marketing.paid_media'

/**
 * A founder's (or any person's) personal brand inside a company brand repository. Tracked beside the
 * company, never folded into it: it does not change `subject.entity_kind` and is not part of the digest.
 */
export interface PersonalBrandRecord {
  /** `modules.personal.enabled` in brand.config.yaml. */
  enabled: boolean
  /** The selected facets, sorted. Facet ids only. */
  facets: string[]
  /** `person` only for the `personal-brand` profile, where the brand is the person; else `company`. */
  brand_entity_kind: 'company' | 'person'
  /** Always false: the personal module never changes what the brand is. */
  changes_subject: false
}

/**
 * A research note's link to an evidence-register entry, as it stands on the snapshot day. Ids and a
 * closed-vocabulary state only: never the note's or the register entry's text. Not part of the digest;
 * what it changes (a note's independence) is.
 */
export interface EvidenceLinkRecord {
  note_id: string
  evidence_id: string
  link_revision: string
  state: LinkState
}

export interface AssuranceSnapshot {
  schema: typeof SNAPSHOT_SCHEMA
  bridge_version: typeof BRIDGE_VERSION
  brand_id: string
  method_id: string
  as_of: string
  audience: Audience
  /** The deprecated `--paid-media` statement as given (`unknown` when not given). The subject uses the approved answer first. */
  paid_media_statement: PaidMediaStatement
  subject: AssessmentSubject
  subject_provenance: SubjectProvenance[]
  controls: ControlInput[]
  /** The personal module, kept separate from the assessed subject. */
  personal_brand: PersonalBrandRecord
  /** Research notes linked to the evidence register by the owner, and whether each link counts today. */
  evidence_links: EvidenceLinkRecord[]
  /** `sourceSnapshotDigest()` of exactly these inputs. Same workspace state + same options = same digest. */
  source_snapshot_digest: string
  /** True only when nothing is missing at all. */
  complete: boolean
  /** True when no blocking item is listed, so `assess()` can give a ratio. */
  scoreable: boolean
  missing: MissingItem[]
  authorizes: []
  disclaimer: 'internal_assessment_not_certification'
}

export interface BridgeResult {
  snapshot: AssuranceSnapshot
  assessment: AuditAssessment
  authorizes: []
}

// ---- reading the workspace ----------------------------------------------------------------------

interface Workspace {
  root: string
  brandId: string
  ws: KnowledgeWorkspace
  /** `brand.profile: personal-brand`: the brand itself is a person. */
  personProfile: boolean
  personal: { enabled: boolean; facets: string[] }
  mascot: boolean
  gamification: boolean
  questions: Map<string, FieldQuestion>
  facts: Record<string, CanonicalFact>
  answers: Map<string, AnswerRecord>
  contradictions: Array<{ id: string; fields: string[] }>
  notes: Array<{ id: string; revision: string; question_ids: string[] }>
  /** Evidence-register entries by id. Read once; only ids, kinds, states and dates are used. */
  register: Map<string, EvidenceItem>
  /** Owner link histories by note id, for notes that have one. */
  links: Map<string, LinkRevision[]>
}

function openBrand(root: string, now?: () => Date): Workspace {
  let ws: KnowledgeWorkspace
  try {
    ws = openWorkspace(root, now ? { now } : {})
  } catch {
    throw new AssuranceBridgeError('not_a_brand', 'This folder is not a Brand OS brand (brand/brand.config.yaml is missing or has no slug). Run the command from the brand repository root.')
  }
  const engine = new InterviewEngine(ws.root)
  const config = engine.config()
  const questionList = engine.questions()
  const questions = new Map(questionList.map((question) => [question.id, question]))
  let records: AnswerRecord[] = []
  try {
    records = engine.ledger().records ?? []
  } catch {
    records = []
  }
  const answers = latestAnswers(records)
  const mascot = config.modules?.mascot?.enabled === true
  const gamification = config.modules?.gamification?.enabled === true
  // The interview's own rules, called purely. Ids and field lists only; the message is never kept.
  const contradictions = findContradictions(questionList, answers, mascot, gamification)
    .filter((entry) => entry.status === 'open')
    .map((entry) => ({ id: entry.id, fields: [...entry.fields] }))
  // Only shared and local scopes: restricted notes are never decrypted or read here.
  const notes = scanAll(ws, ['local', 'shared'])
    .notes.filter((loaded) => {
      const meta = loaded.note.meta
      return meta.kind === 'research' && meta.classification === 'internal' && meta.status !== 'archived' && meta.brand_slug === ws.brandSlug
    })
    .map((loaded) => ({ id: loaded.id, revision: loaded.revision, question_ids: [...loaded.note.meta.question_ids] }))
  let register: EvidenceItem[]
  try {
    register = readEvidence(ws.root)
  } catch {
    throw new AssuranceBridgeError('invalid_link', 'The evidence register (brand/interview/evidence-register.yaml) could not be read.')
  }
  const links = new Map<string, LinkRevision[]>()
  for (const note of notes) {
    const history = linkHistoryOf(ws, note.id)
    if (history.length > 0) links.set(note.id, history)
  }
  return {
    root: ws.root,
    brandId: ws.brandSlug,
    ws,
    personProfile: config.brand?.profile === 'personal-brand',
    personal: { enabled: personalConfig(config).enabled === true, facets: [...personalConfig(config).facets].sort() },
    mascot,
    gamification,
    questions,
    facts: readFacts(ws.root, 'approved', ws.brandSlug),
    answers,
    contradictions,
    notes,
    register: new Map(register.map((entry) => [entry.id, entry])),
    links,
  }
}

function linkHistoryOf(ws: KnowledgeWorkspace, noteId: string): LinkRevision[] {
  try {
    return readLinkHistory(ws, noteId)
  } catch (error) {
    if (error instanceof AssuranceLinkError) {
      if (error.code === 'refused') throw new AssuranceBridgeError('refused', error.message)
      throw new AssuranceBridgeError('invalid_link', error.message)
    }
    throw error
  }
}

/** The owner's link for a note in force on `day`, and whether the register entry counts that day. */
function noteLink(w: Workspace, noteId: string, day: string): { link: LinkRevision; state: LinkState } | null {
  const note = w.notes.find((entry) => entry.id === noteId)
  const link = note ? linkAsOf(w.links.get(noteId) ?? [], day) : null
  if (!note || !link) return null
  return { link, state: linkState(link, note, w.register.get(link.evidence_id!), day) }
}

function approvedFact(w: Workspace, id: string): CanonicalFact | null {
  const fact = w.facts[id]
  if (!fact || fact.status !== 'approved' || fact.brand_id !== w.brandId || !fact.revision_hash) return null
  return fact
}

/** An approved single-choice value, only for internal enum questions the subject is derived from. */
function approvedChoice(w: Workspace, id: string): string | null {
  const fact = approvedFact(w, id)
  if (!fact || fact.classification === 'restricted') return null
  return typeof fact.value === 'string' ? fact.value : null
}

// ---- subject ------------------------------------------------------------------------------------

function deriveSubject(w: Workspace, paidMedia: PaidMediaStatement): { subject: AssessmentSubject; provenance: SubjectProvenance[] } {
  const provenance: SubjectProvenance[] = []

  // Only the profile says the brand is a person. The personal module on a company brand is the
  // founder's own brand, tracked in `personal_brand`; it never turns the company into a person.
  const entity: AssessmentSubject['entity_kind'] = w.personProfile ? 'person' : 'company'
  provenance.push({ field: 'entity_kind', value: entity, source: 'brand_config', question_id: null })

  let sells: AssessmentSubject['sells'] = 'unknown'
  const motion = approvedChoice(w, 'business.sales.motion')
  if (motion === 'not-applicable') sells = 'no'
  else if (motion && motion !== 'undecided') sells = 'yes'
  provenance.push({ field: 'sells', value: sells, source: sells === 'unknown' ? 'none' : 'approved_fact', question_id: sells === 'unknown' ? null : 'business.sales.motion' })

  let stage: AssessmentSubject['stage'] = 'unknown'
  let stageSource: string | null = null
  const current = approvedChoice(w, 'business.stage.current')
  if (current === 'established') [stage, stageSource] = ['established', 'business.stage.current']
  else if (current === 'idea' || current === 'pre-revenue') [stage, stageSource] = ['new', 'business.stage.current']
  else {
    const newOrExisting = approvedChoice(w, 'business.identity.new_or_existing')
    if (newOrExisting === 'new') [stage, stageSource] = ['new', 'business.identity.new_or_existing']
    else if (newOrExisting === 'existing') [stage, stageSource] = ['established', 'business.identity.new_or_existing']
  }
  provenance.push({ field: 'stage', value: stage, source: stageSource ? 'approved_fact' : 'none', question_id: stageSource })

  // The approved interview answer wins, `undecided` included (owner decision, 2026-11-24): an approved
  // `undecided` keeps paid media `unknown` and the deprecated statement is ignored. The statement only
  // fills the gap while the question has no approved answer at all.
  let runsPaid: PaidMediaStatement = 'unknown'
  const answered = approvedChoice(w, PAID_MEDIA_QUESTION)
  if (answered === 'yes' || answered === 'no' || answered === 'undecided') {
    runsPaid = answered === 'undecided' ? 'unknown' : answered
    provenance.push({ field: 'runs_paid_media', value: runsPaid, source: 'approved_fact', question_id: PAID_MEDIA_QUESTION })
  } else {
    runsPaid = paidMedia
    provenance.push({ field: 'runs_paid_media', value: runsPaid, source: runsPaid === 'unknown' ? 'none' : 'owner_flag', question_id: null })
  }

  return { subject: { entity_kind: entity, sells, stage, runs_paid_media: runsPaid }, provenance }
}

/** Which existing questions would settle a subject field, so a missing item points somewhere real. */
const SUBJECT_QUESTIONS: Record<SubjectField, { question_ids: string[]; flag: string | null }> = {
  entity_kind: { question_ids: [], flag: null },
  sells: { question_ids: ['business.sales.motion'], flag: null },
  stage: { question_ids: ['business.stage.current'], flag: null },
  runs_paid_media: { question_ids: [PAID_MEDIA_QUESTION], flag: null },
}

// ---- controls -----------------------------------------------------------------------------------

function presenceOf(answer: AnswerRecord | undefined): FactPresence {
  if (!answer) return 'absent'
  if (answer.status === 'unknown') return 'unknown'
  if (answer.status === 'not_applicable') return 'not_applicable'
  if (answer.status === 'draft' || answer.status === 'in_review' || answer.status === 'approved') return 'draft'
  return 'absent'
}

function classificationOf(w: Workspace, id: string, fact: CanonicalFact | null): ResolvedFact['classification'] {
  const sensitivity = w.questions.get(id)?.sensitivity
  if (sensitivity === 'restricted' || fact?.classification === 'restricted') return 'restricted'
  if (fact?.classification === 'public' && sensitivity !== 'internal') return 'public'
  return 'internal'
}

function resolveFact(w: Workspace, id: string, audience: Audience, pins: Map<string, string>): ResolvedFact {
  const fact = approvedFact(w, id)
  const classification = classificationOf(w, id, fact)
  // Below the restricted audience a restricted fact is not pinned: not its revision, not its presence.
  if (classification === 'restricted' && AUDIENCE_RANK[audience] < AUDIENCE_RANK.restricted) {
    return { ref: { id, revision: WITHHELD_REVISION }, state: 'current', presence: 'approved', classification }
  }
  const pinned = pins.get(id)
  if (pinned !== undefined) {
    // A previous snapshot cited this revision: is it still the approved one?
    const state: RefState = factState(w.ws, { id, revision: pinned }, w.facts)
    return { ref: { id, revision: pinned }, state, presence: state === 'missing' ? presenceOf(w.answers.get(id)) : 'approved', classification }
  }
  if (fact) return { ref: { id, revision: fact.revision_hash! }, state: 'current', presence: 'approved', classification }
  const answer = w.answers.get(id)
  const presence = presenceOf(answer)
  // An answer that exists but is not approved is current as an answer: the engine then names why it is
  // not usable (`owner_said_unknown`, `fact_not_approved`, ...). Its answer id stands in for a revision.
  if (answer && presence !== 'absent') return { ref: { id, revision: `answer:${answer.answer_id}` }, state: 'current', presence, classification }
  return { ref: { id, revision: '' }, state: 'missing', presence: 'absent', classification }
}

function resolveEvidence(w: Workspace, control: AssessableControl, pins: Map<string, Map<string, string>>, day: string): ResolvedEvidence[] {
  if (!control.required_evidence) return []
  const ids = new Set([...control.required_question_ids, ...control.related_question_ids])
  const pinned = pins.get(control.control_id) ?? new Map<string, string>()
  const out = new Map<string, ResolvedEvidence>()
  const add = (noteId: string, revision: string, isPinned: boolean) => {
    const ref: EvidenceRef = { ref: `knowledge:${noteId}@${revision}`, note_id: noteId, revision }
    // A note is the owner's own writing: owner-stated, unless the owner linked this very revision to a
    // register entry that qualifies on the day assessed (`links.ts`). Nothing else raises it. The entry
    // verifies one question, so the note is independent only for a control that names that question; for
    // the note's other questions it stays the owner's own statement.
    const current = w.notes.find((entry) => entry.id === noteId)
    const linked = current && current.revision === revision ? noteLink(w, noteId, day) : null
    const claim = linked ? w.register.get(linked.link.evidence_id!)?.claim_id : undefined
    const independent = linked?.state === 'qualifies' && claim !== undefined && ids.has(claim)
    out.set(noteId, { ref, state: isPinned ? evidenceState(w.ws, ref) : 'current', independence: independent ? 'independent' : 'owner_stated' })
  }
  for (const note of w.notes.filter((entry) => entry.question_ids.some((id) => ids.has(id)))) add(note.id, pinned.get(note.id) ?? note.revision, pinned.has(note.id))
  // A note the previous snapshot cited and that is gone (archived, deleted, retagged) stays visible.
  for (const [noteId, revision] of pinned) if (!out.has(noteId)) add(noteId, revision, true)
  return [...out.values()].sort((a, b) => (a.ref.note_id < b.ref.note_id ? -1 : 1))
}

function controlInput(w: Workspace, control: AssessableControl, audience: Audience, factPins: Map<string, string>, notePins: Map<string, Map<string, string>>, review: ControlReview | null, day: string): ControlInput {
  const touched = new Set([...control.required_question_ids, ...control.related_question_ids])
  return {
    control_id: control.control_id,
    facts: control.required_question_ids.map((id) => resolveFact(w, id, audience, factPins)),
    evidence: resolveEvidence(w, control, notePins, day),
    conflicts: w.contradictions
      .filter((entry) => entry.fields.some((field) => touched.has(field)))
      .map((entry) => entry.id)
      .sort(),
    // The owner's current judgment, or null: then a judgment control stays `needs_review` and is blocking.
    review,
    maturity: null,
  }
}

// ---- owner judgments ----------------------------------------------------------------------------

/**
 * What a judgment on this control is about, as it stands now: every fact the control names (required and
 * related) by approved revision, `none` when not approved, and the research notes it cites. Unpinned on
 * purpose: a judgment is checked against the workspace, not against an older snapshot.
 */
function reviewBasisOf(w: Workspace, control: AssessableControl, day: string): ReviewBasis {
  const ids = [...new Set([...control.required_question_ids, ...control.related_question_ids])].sort()
  return {
    facts: ids.map((id) => ({ id, revision: approvedFact(w, id)?.revision_hash ?? 'none' })),
    // A note that counts as independent through a register link is a different basis from the same note
    // as the owner's own statement: `+<evidence id>` marks it, so linking or losing a link makes a
    // judgment stale. An unlinked note keeps its plain revision, so earlier judgments are unchanged.
    evidence: resolveEvidence(w, control, new Map(), day).map((note) => {
      const linked = note.independence === 'independent' ? noteLink(w, note.ref.note_id, day) : null
      return { note_id: note.ref.note_id, revision: linked ? `${note.ref.revision}+${linked.link.evidence_id}` : note.ref.revision }
    }),
  }
}

function historyOf(w: Workspace, controlId: string): ReviewRevision[] {
  try {
    return readReviewHistory(w.ws, controlId)
  } catch (error) {
    if (error instanceof AssuranceReviewError) {
      if (error.code === 'refused') throw new AssuranceBridgeError('refused', error.message)
      throw new AssuranceBridgeError('invalid_review', error.message)
    }
    throw error
  }
}

export type JudgmentState = 'needs_judgment' | 'judged' | 'stale'

/** The judgment that applies on `day`, and whether its basis still matches the workspace. */
function currentJudgment(w: Workspace, control: AssessableControl, day: string): { state: JudgmentState; revision: ReviewRevision | null; history: ReviewRevision[]; basis: ReviewBasis } {
  if (control.evaluation_mode !== 'reviewer_judgment') return { state: 'needs_judgment', revision: null, history: [], basis: { facts: [], evidence: [] } }
  const history = historyOf(w, control.control_id)
  const basis = reviewBasisOf(w, control, day)
  const revision = reviewAsOf(history, day)
  if (!revision) return { state: 'needs_judgment', revision: null, history, basis }
  return { state: revision.basis_digest === basisDigest(basis) ? 'judged' : 'stale', revision, history, basis }
}

/**
 * The engine's review input. `reviewer_id` names the revision, so a new judgment changes the digest.
 * `rationale` is a reference to the private note, which the store guarantees is non-empty; the note
 * itself never enters a snapshot.
 */
function reviewOf(control: AssessableControl, revision: ReviewRevision): ControlReview {
  return {
    reviewer_id: `owner:${revision.revision}`,
    reviewer_role: 'owner',
    status: JUDGMENT_STATUS[revision.judgment],
    rationale: `assurance-review:${control.control_id}@${revision.revision}`,
    reviewed_at: `${revision.reviewed_on}T00:00:00.000Z`,
  }
}

export interface ReviewItem {
  control_id: string
  state: JudgmentState
  /** The judgment in force, if any. The note is included only when the owner asked for it. */
  latest: { revision: string; judgment: Judgment; reviewed_on: string; note: string | null } | null
  revisions: number
  /** What a judgment made now would be about. Ids only; `approved` says whether the fact is approved. */
  basis_now: { facts: Array<{ id: string; approved: boolean }>; notes: string[] }
  /** For a stale judgment: the fact or note ids whose revision changed, appeared or disappeared since. */
  changed: string[]
  /** Open contradictions touching the control: the engine reports `conflicted` before any judgment. */
  conflicts: string[]
}

function changedSince(before: ReviewBasis, now: ReviewBasis): string[] {
  const key = (basis: ReviewBasis) => new Map([...basis.facts.map((ref) => [ref.id, ref.revision] as const), ...basis.evidence.map((ref) => [ref.note_id, ref.revision] as const)])
  const a = key(before)
  const b = key(now)
  return [...new Set([...a.keys(), ...b.keys()])].filter((id) => a.get(id) !== b.get(id)).sort()
}

/** The controls that need a person's judgment under a method, and where each stands. Read-only. */
export function listReviewItems(root: string, options: { asOf: Date; showNotes?: boolean; method_id?: string }): { brand_id: string; as_of: string; items: ReviewItem[]; authorizes: [] } {
  assertOwnerAssurance()
  if (!(options.asOf instanceof Date) || Number.isNaN(options.asOf.getTime())) throw new AssuranceBridgeError('invalid_input', 'as_of must be a valid date.')
  const method = methodById(options.method_id ?? POSITIONING_READINESS.method_id)
  if (!method) throw new AssuranceBridgeError('invalid_input', 'No such method in the registry.')
  const w = openBrand(root)
  const day = options.asOf.toISOString().slice(0, 10)
  const items = controlsForMethod(method.method_id, DEFAULT_CATALOG)
    .filter((control) => control.evaluation_mode === 'reviewer_judgment')
    .sort((a, b) => (a.control_id < b.control_id ? -1 : 1))
    .map((control): ReviewItem => {
      const judged = currentJudgment(w, control, day)
      const touched = new Set([...control.required_question_ids, ...control.related_question_ids])
      return {
        control_id: control.control_id,
        state: judged.state,
        latest: judged.revision ? { revision: judged.revision.revision, judgment: judged.revision.judgment, reviewed_on: judged.revision.reviewed_on, note: options.showNotes ? judged.revision.note : null } : null,
        revisions: judged.history.length,
        basis_now: { facts: judged.basis.facts.map((ref) => ({ id: ref.id, approved: ref.revision !== 'none' })), notes: judged.basis.evidence.map((ref) => ref.note_id) },
        changed: judged.state === 'stale' && judged.revision ? changedSince(judged.revision.basis, judged.basis) : [],
        conflicts: w.contradictions.filter((entry) => entry.fields.some((field) => touched.has(field))).map((entry) => entry.id).sort(),
      }
    })
  return { brand_id: w.brandId, as_of: options.asOf.toISOString(), items, authorizes: [] }
}

export interface RecordReviewInput {
  control_id: string
  judgment: unknown
  note: unknown
  reviewed_on?: string
  expected_revision?: string | null
  method_id?: string
}

/**
 * Records the owner's judgment on one `reviewer_judgment` control, with its basis taken from the
 * workspace now. The only write in Assurance, and only to `brand/.private/assurance/reviews/`.
 */
export function recordReview(root: string, input: RecordReviewInput, opts: { now?: () => Date } = {}): { control_id: string; revision: ReviewRevision; authorizes: [] } {
  assertOwnerAssurance()
  assertOwnerReview()
  const method = methodById(input.method_id ?? POSITIONING_READINESS.method_id)
  if (!method) throw new AssuranceBridgeError('invalid_input', 'No such method in the registry.')
  const control = controlsForMethod(method.method_id, DEFAULT_CATALOG).find((entry) => entry.control_id === input.control_id)
  if (!control || control.evaluation_mode !== 'reviewer_judgment') {
    throw new AssuranceReviewError('not_reviewable', `${String(input.control_id)} is not a control that needs a person's judgment. Run list to see which ones do.`)
  }
  const w = openBrand(root, opts.now)
  const revision = appendReview(w.ws, {
    control_id: control.control_id,
    judgment: input.judgment,
    note: input.note,
    ...(input.reviewed_on !== undefined ? { reviewed_on: input.reviewed_on } : {}),
    ...(input.expected_revision !== undefined ? { expected_revision: input.expected_revision } : {}),
    basis: reviewBasisOf(w, control, w.ws.now().toISOString().slice(0, 10)),
  })
  return { control_id: control.control_id, revision, authorizes: [] }
}

// ---- owner evidence links (brand:assurance-link) -------------------------------------------------

export interface LinkCandidate {
  evidence_id: string
  claim_id: string
  /** The register's own status. Only `verified` entries from an independent source can qualify. */
  status: EvidenceItem['status']
  independent_source: boolean
}

export interface LinkItem {
  note_id: string
  /** The note's current revision. A link is about exactly this revision. */
  revision: string
  question_ids: string[]
  /** Controls of the method that would cite this note. */
  control_ids: string[]
  /** The link in force on the day, and whether it counts. */
  link: { evidence_id: string; revision: string; linked_on: string; state: LinkState } | null
  revisions: number
  /** Register entries for a question this note is about. Ids, claim ids and states only, never the reference text. */
  candidates: LinkCandidate[]
}

/** The brand's research notes, their links and the register entries they could link to. Read-only. */
export function listEvidenceLinks(root: string, options: { asOf: Date; method_id?: string }): { brand_id: string; as_of: string; items: LinkItem[]; authorizes: [] } {
  assertOwnerAssurance()
  assertOwnerLink()
  if (!(options.asOf instanceof Date) || Number.isNaN(options.asOf.getTime())) throw new AssuranceBridgeError('invalid_input', 'as_of must be a valid date.')
  const method = methodById(options.method_id ?? POSITIONING_READINESS.method_id)
  if (!method) throw new AssuranceBridgeError('invalid_input', 'No such method in the registry.')
  const w = openBrand(root)
  const day = options.asOf.toISOString().slice(0, 10)
  const controls = controlsForMethod(method.method_id, DEFAULT_CATALOG).filter((control) => control.required_evidence)
  const items = [...w.notes]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((note): LinkItem => {
      const linked = noteLink(w, note.id, day)
      return {
        note_id: note.id,
        revision: note.revision,
        question_ids: [...note.question_ids].sort(),
        control_ids: controls
          .filter((control) => [...control.required_question_ids, ...control.related_question_ids].some((id) => note.question_ids.includes(id)))
          .map((control) => control.control_id)
          .sort(),
        link: linked ? { evidence_id: linked.link.evidence_id!, revision: linked.link.revision, linked_on: linked.link.linked_on, state: linked.state } : null,
        revisions: w.links.get(note.id)?.length ?? 0,
        candidates: [...w.register.values()]
          .filter((entry) => entry.kind === 'verification' && note.question_ids.includes(entry.claim_id))
          .map((entry) => ({ evidence_id: entry.id, claim_id: entry.claim_id, status: entry.status, independent_source: isIndependentSource(entry) }))
          .sort((a, b) => (a.evidence_id < b.evidence_id ? -1 : 1)),
      }
    })
  return { brand_id: w.brandId, as_of: options.asOf.toISOString(), items, authorizes: [] }
}

export interface LinkEvidenceInput {
  note_id: string
  /** The register entry for `link`; omitted for `unlink`. */
  evidence_id?: string
  linked_on?: string
  expected_revision?: string | null
}

function linkableNote(w: Workspace, noteId: string) {
  const note = w.notes.find((entry) => entry.id === noteId)
  if (!note) throw new AssuranceLinkError('not_linkable', `${noteId} is not an internal, active research note of this brand. Run list to see which notes can be linked.`)
  return note
}

/**
 * Links a research note, at its current revision, to an evidence-register entry. The entry must be a
 * verification from a source other than owner testimony, for a question the note is about, and not
 * withdrawn or rejected. A pending entry may be linked: it counts once the owner verifies it with
 * `brand:evidence verify`. Writes only `brand/.private/assurance/evidence-links/<note_id>.json`.
 */
export function linkEvidence(root: string, input: LinkEvidenceInput, opts: { now?: () => Date } = {}): { note_id: string; revision: LinkRevision; state: LinkState; authorizes: [] } {
  assertOwnerAssurance()
  assertOwnerLink()
  const w = openBrand(root, opts.now)
  const note = linkableNote(w, input.note_id)
  const entry = typeof input.evidence_id === 'string' ? w.register.get(input.evidence_id) : undefined
  if (!entry) throw new AssuranceLinkError('not_linkable', `No evidence-register entry ${String(input.evidence_id)}. Record one with brand:evidence add.`)
  if (entry.kind !== 'verification') throw new AssuranceLinkError('not_linkable', `${entry.id} is a permission, not evidence for a claim.`)
  if (entry.source_type === 'owner_testimony') throw new AssuranceLinkError('not_linkable', `${entry.id} is owner testimony. It never counts as independent evidence.`)
  if (entry.owned === true) throw new AssuranceLinkError('not_linkable', `${entry.id} is a source the owner controls (owner-published). It never counts as independent evidence.`)
  if (!note.question_ids.includes(entry.claim_id)) throw new AssuranceLinkError('not_linkable', `${entry.id} supports ${entry.claim_id}, which this note is not about.`)
  if (entry.status === 'withdrawn' || entry.status === 'rejected') throw new AssuranceLinkError('not_linkable', `${entry.id} was ${entry.status}. Record a new entry instead.`)
  const revision = appendLink(w.ws, {
    note_id: note.id,
    action: 'link',
    evidence_id: entry.id,
    note_revision: note.revision,
    ...(input.linked_on !== undefined ? { linked_on: input.linked_on } : {}),
    ...(input.expected_revision !== undefined ? { expected_revision: input.expected_revision } : {}),
  })
  // The state reported is today's, also for a backdated link (`--date`): that is what the owner acts on.
  return { note_id: note.id, revision, state: linkState(revision, note, entry, w.ws.now().toISOString().slice(0, 10)), authorizes: [] }
}

/** Removes a note's link (a new `unlink` revision; history stays). The note is owner-stated again. */
export function unlinkEvidence(root: string, input: LinkEvidenceInput, opts: { now?: () => Date } = {}): { note_id: string; revision: LinkRevision; authorizes: [] } {
  assertOwnerAssurance()
  assertOwnerLink()
  const w = openBrand(root, opts.now)
  // A note that was archived or retagged may still be unlinked: removing a link only restricts.
  const revision = appendLink(w.ws, {
    note_id: input.note_id,
    action: 'unlink',
    evidence_id: null,
    note_revision: null,
    ...(input.linked_on !== undefined ? { linked_on: input.linked_on } : {}),
    ...(input.expected_revision !== undefined ? { expected_revision: input.expected_revision } : {}),
  })
  return { note_id: input.note_id, revision, authorizes: [] }
}

// ---- what is missing ----------------------------------------------------------------------------

function item(kind: MissingKind, blocking: boolean, fields: Partial<Omit<MissingItem, 'kind' | 'blocking'>>): MissingItem {
  return { kind, blocking, control_id: null, field: null, question_ids: [], presence: null, flag: null, ...fields }
}

function missingOf(controls: AssessableControl[], inputs: ControlInput[], subject: AssessmentSubject, audience: Audience, stale: Set<string>): MissingItem[] {
  const out: MissingItem[] = []
  const unknownFields = new Set<SubjectField>()
  const byId = new Map(inputs.map((input) => [input.control_id, input]))

  for (const control of controls) {
    const applicability = applicabilityOf(control.applicability, subject)
    if (applicability === 'not_applicable') continue
    if (applicability === 'unknown') {
      for (const condition of control.applicability.conditions) if (subject[condition.field] === 'unknown') unknownFields.add(condition.field)
      continue
    }
    const input = byId.get(control.control_id)
    if (!input) continue
    // Withheld controls stay silent, as in the engine: not even which question is open.
    const restricted = control.privacy_classification === 'restricted' || input.facts.some((fact) => fact.classification === 'restricted')
    if (restricted && AUDIENCE_RANK[audience] < AUDIENCE_RANK.restricted) continue

    const changed = [
      ...input.facts.filter((fact) => fact.state === 'changed').map((fact) => fact.ref.id),
      ...input.evidence.filter((note) => note.state === 'changed').map((note) => note.ref.note_id),
    ]
    if (changed.length > 0) out.push(item('changed_source', true, { control_id: control.control_id, question_ids: input.facts.filter((fact) => fact.state === 'changed').map((fact) => fact.ref.id).sort() }))

    for (const fact of input.facts) {
      if (fact.presence === 'approved' && fact.state === 'current') continue
      if (fact.state === 'changed') continue
      out.push(item('fact', false, { control_id: control.control_id, question_ids: [fact.ref.id], presence: fact.presence }))
    }
    if (control.required_evidence && !input.evidence.some((note) => note.state === 'current')) {
      out.push(item('evidence', false, { control_id: control.control_id, question_ids: [...control.related_question_ids, ...control.required_question_ids].sort() }))
    } else if (control.required_evidence?.independence === 'independent' && !input.evidence.some((note) => note.state === 'current' && note.independence === 'independent')) {
      // Notes exist, but each is the owner's own statement. Not blocking: the evaluator counts it as not
      // complete. A note linked to a verified register entry (brand:assurance-link) would close it.
      out.push(item('independent_evidence', false, { control_id: control.control_id, question_ids: [...control.related_question_ids, ...control.required_question_ids].sort() }))
    }
    // Same order as the engine: a changed source or a recorded conflict is reported before any judgment is asked for.
    if (control.evaluation_mode === 'reviewer_judgment' && !input.review && changed.length === 0 && input.conflicts.length === 0) {
      out.push(item(stale.has(control.control_id) ? 'stale_judgment' : 'reviewer_judgment', true, { control_id: control.control_id }))
    }
  }

  for (const field of [...unknownFields].sort()) {
    const where = SUBJECT_QUESTIONS[field]
    out.push(item('subject_field', true, { field, question_ids: where.question_ids, flag: where.flag }))
  }
  const order = (entry: MissingItem) => `${entry.blocking ? 0 : 1}\u0000${MISSING_KINDS.indexOf(entry.kind)}\u0000${entry.control_id ?? ''}\u0000${entry.field ?? ''}\u0000${entry.question_ids.join(',')}`
  return out.sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0))
}

// ---- the bridge ---------------------------------------------------------------------------------

/** Only approved revisions are pins. A withheld, unanswered or draft entry is re-read as it is now. */
function isApprovedPin(revision: string): boolean {
  return revision !== '' && revision !== WITHHELD_REVISION && !revision.startsWith('answer:')
}

function pinMaps(pins: SnapshotPins | null | undefined): { facts: Map<string, string>; notes: Map<string, Map<string, string>> } {
  const notes = new Map<string, Map<string, string>>()
  for (const ref of pins?.evidence ?? []) {
    const forControl = notes.get(ref.control_id) ?? new Map<string, string>()
    forControl.set(ref.note_id, ref.revision)
    notes.set(ref.control_id, forControl)
  }
  return {
    facts: new Map((pins?.facts ?? []).filter((ref) => isApprovedPin(ref.revision)).map((ref) => [ref.id, ref.revision])),
    notes,
  }
}

/**
 * Build the snapshot for one brand. Reads the workspace, writes nothing, and refuses an agent process.
 */
export function buildAssuranceSnapshot(root: string, options: BridgeOptions): AssuranceSnapshot {
  assertOwnerAssurance()
  if (!(options.asOf instanceof Date) || Number.isNaN(options.asOf.getTime())) throw new AssuranceBridgeError('invalid_input', 'as_of must be a valid date.')
  const audience = options.audience ?? 'internal'
  if (!(audience in AUDIENCE_RANK)) throw new AssuranceBridgeError('invalid_input', 'audience must be public, internal or restricted.')
  const paidMedia = options.paidMedia ?? 'unknown'
  if (!['yes', 'no', 'unknown'].includes(paidMedia)) throw new AssuranceBridgeError('invalid_input', 'paid media must be yes, no or unknown.')
  const methodId = options.method_id ?? POSITIONING_READINESS.method_id
  const method = methodById(methodId)
  if (!method) throw new AssuranceBridgeError('invalid_input', `No method ${methodId} in the registry.`)

  const w = openBrand(root)
  // Revisions kept for another brand or method say nothing about this one: refuse rather than report them as changed.
  if (options.pins?.brand_id !== undefined && options.pins.brand_id !== w.brandId) throw new AssuranceBridgeError('invalid_pin', 'The snapshot file belongs to a different brand.')
  if (options.pins?.method_id !== undefined && options.pins.method_id !== method.method_id) throw new AssuranceBridgeError('invalid_pin', 'The snapshot file was built for a different method.')
  const { subject, provenance } = deriveSubject(w, paidMedia)
  const controls = [...controlsForMethod(method.method_id, DEFAULT_CATALOG)].sort((a, b) => (a.control_id < b.control_id ? -1 : 1))
  const pins = pinMaps(options.pins)
  const day = options.asOf.toISOString().slice(0, 10)
  const stale = new Set<string>()
  const inputs = controls.map((control) => {
    const judged = currentJudgment(w, control, day)
    if (judged.state === 'stale') stale.add(control.control_id)
    return controlInput(w, control, audience, pins.facts, pins.notes, judged.state === 'judged' ? reviewOf(control, judged.revision!) : null, day)
  })
  const evidenceLinks: EvidenceLinkRecord[] = []
  for (const note of w.notes) {
    const linked = noteLink(w, note.id, day)
    if (linked) evidenceLinks.push({ note_id: note.id, evidence_id: linked.link.evidence_id!, link_revision: linked.link.revision, state: linked.state })
  }
  evidenceLinks.sort((a, b) => (a.note_id < b.note_id ? -1 : a.note_id > b.note_id ? 1 : 0))
  const input: AssessmentInput = { brand_id: w.brandId, method_id: method.method_id, subject, audience, as_of: options.asOf, controls: inputs }
  const missing = missingOf(controls, inputs, subject, audience, stale)

  return {
    schema: SNAPSHOT_SCHEMA,
    bridge_version: BRIDGE_VERSION,
    brand_id: w.brandId,
    method_id: method.method_id,
    as_of: options.asOf.toISOString(),
    audience,
    paid_media_statement: paidMedia,
    subject,
    subject_provenance: provenance,
    controls: inputs,
    personal_brand: { enabled: w.personal.enabled, facets: w.personal.facets, brand_entity_kind: subject.entity_kind === 'person' ? 'person' : 'company', changes_subject: false },
    evidence_links: evidenceLinks,
    source_snapshot_digest: sourceSnapshotDigest(input),
    complete: missing.length === 0,
    scoreable: !missing.some((entry) => entry.blocking),
    missing,
    authorizes: [],
    disclaimer: 'internal_assessment_not_certification',
  }
}

/** The frozen engine input a snapshot stands for. */
export function snapshotInput(snapshot: AssuranceSnapshot): AssessmentInput {
  return {
    brand_id: snapshot.brand_id,
    method_id: snapshot.method_id,
    subject: snapshot.subject,
    audience: snapshot.audience,
    as_of: new Date(snapshot.as_of),
    controls: snapshot.controls,
  }
}

/** Snapshot plus the existing evaluator's assessment of it. Nothing about the evaluation is redone here. */
export function assessWorkspace(root: string, options: BridgeOptions): BridgeResult {
  const snapshot = buildAssuranceSnapshot(root, options)
  return { snapshot, assessment: assess(snapshotInput(snapshot)), authorizes: [] }
}

// ---- reading a previous snapshot ----------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const PIN_ID = /^[A-Za-z0-9_.:-]{1,200}$/

/**
 * Parses a snapshot file the owner kept, as data. Only ids, revisions and the options are taken from it;
 * anything else in the file is ignored. A malformed file is refused without echoing its content.
 */
export function parseSnapshotFile(text: string): { brand_id: string; method_id: string; as_of: Date; audience: Audience; paid_media: PaidMediaStatement; digest: string; pins: SnapshotPins; links: Array<{ note_id: string; evidence_id: string; link_revision: string; state: string }> } {
  if (text.length > MAX_SNAPSHOT_BYTES) throw new AssuranceBridgeError('invalid_pin', 'The snapshot file is too large.')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new AssuranceBridgeError('invalid_pin', 'The snapshot file is not JSON.')
  }
  // `brand:assurance assess --json` wraps the snapshot; accept both shapes.
  const doc = isRecord(raw) && isRecord(raw.snapshot) ? raw.snapshot : raw
  if (!isRecord(doc) || doc.schema !== SNAPSHOT_SCHEMA) throw new AssuranceBridgeError('invalid_pin', `The file is not a ${SNAPSHOT_SCHEMA} snapshot.`)
  const asOf = new Date(String(doc.as_of))
  const audience = doc.audience
  const paid = doc.paid_media_statement
  if (typeof doc.brand_id !== 'string' || typeof doc.method_id !== 'string' || typeof doc.source_snapshot_digest !== 'string' || Number.isNaN(asOf.getTime())) {
    throw new AssuranceBridgeError('invalid_pin', 'The snapshot file is missing its brand, method, digest or date.')
  }
  if (audience !== 'public' && audience !== 'internal' && audience !== 'restricted') throw new AssuranceBridgeError('invalid_pin', 'The snapshot file has no valid audience.')
  if (paid !== 'yes' && paid !== 'no' && paid !== 'unknown') throw new AssuranceBridgeError('invalid_pin', 'The snapshot file has no valid paid-media statement.')
  if (!Array.isArray(doc.controls)) throw new AssuranceBridgeError('invalid_pin', 'The snapshot file has no controls.')
  const facts: FactRef[] = []
  const evidence: SnapshotPins['evidence'] = []
  for (const control of doc.controls) {
    if (!isRecord(control) || typeof control.control_id !== 'string' || !PIN_ID.test(control.control_id)) throw new AssuranceBridgeError('invalid_pin', 'A control in the snapshot file is malformed.')
    for (const fact of Array.isArray(control.facts) ? control.facts : []) {
      const ref = isRecord(fact) && isRecord(fact.ref) ? fact.ref : null
      if (!ref || typeof ref.id !== 'string' || typeof ref.revision !== 'string' || !PIN_ID.test(ref.id) || ref.revision.length > 200) throw new AssuranceBridgeError('invalid_pin', 'A fact reference in the snapshot file is malformed.')
      facts.push({ id: ref.id, revision: ref.revision })
    }
    for (const note of Array.isArray(control.evidence) ? control.evidence : []) {
      const ref = isRecord(note) && isRecord(note.ref) ? note.ref : null
      if (!ref || typeof ref.note_id !== 'string' || typeof ref.revision !== 'string' || !PIN_ID.test(ref.note_id) || ref.revision.length > 200) throw new AssuranceBridgeError('invalid_pin', 'An evidence reference in the snapshot file is malformed.')
      evidence.push({ ref: `knowledge:${ref.note_id}@${ref.revision}`, note_id: ref.note_id, revision: ref.revision, control_id: control.control_id })
    }
  }
  // Snapshots kept before bridge version 3 have no `evidence_links`: nothing to compare.
  const links: Array<{ note_id: string; evidence_id: string; link_revision: string; state: string }> = []
  for (const link of Array.isArray(doc.evidence_links) ? doc.evidence_links : []) {
    if (!isRecord(link) || typeof link.note_id !== 'string' || !PIN_ID.test(link.note_id) || typeof link.evidence_id !== 'string' || !PIN_ID.test(link.evidence_id) || typeof link.link_revision !== 'string' || !PIN_ID.test(link.link_revision) || typeof link.state !== 'string' || !PIN_ID.test(link.state)) {
      throw new AssuranceBridgeError('invalid_pin', 'An evidence link in the snapshot file is malformed.')
    }
    links.push({ note_id: link.note_id, evidence_id: link.evidence_id, link_revision: link.link_revision, state: link.state })
  }
  return { brand_id: doc.brand_id, method_id: doc.method_id, as_of: asOf, audience, paid_media: paid, digest: doc.source_snapshot_digest, pins: { facts, evidence, brand_id: doc.brand_id, method_id: doc.method_id }, links }
}

export interface VerifyResult {
  reproduced: boolean
  expected_digest: string
  actual_digest: string
  /**
   * Refs whose pinned revision is no longer the approved one, or no longer there, and evidence links that
   * changed. Ids only. It can be empty while `reproduced` is false: then nothing cited changed, but something
   * was added since (an answer approved, a research note captured, or an owner judgment recorded on or
   * before the snapshot's day).
   */
  changed: Array<{ kind: 'fact' | 'research_note' | 'evidence_link'; id: string; state: RefState }>
  snapshot: AssuranceSnapshot
  authorizes: []
}

/**
 * Rebuild a kept snapshot from the workspace as it is now, with the same clock, audience and statement.
 * `reproduced` is true exactly when nothing it cited has changed.
 */
export function verifyAssuranceSnapshot(root: string, text: string): VerifyResult {
  assertOwnerAssurance()
  const kept = parseSnapshotFile(text)
  const brand = openWorkspace(root).brandSlug
  if (kept.brand_id !== brand) throw new AssuranceBridgeError('invalid_pin', 'The snapshot file belongs to a different brand.')
  // First the snapshot as it would be built today, unpinned, with the kept options.
  const fresh = buildAssuranceSnapshot(root, { asOf: kept.as_of, audience: kept.audience, paidMedia: kept.paid_media, method_id: kept.method_id })
  // Then the kept refs re-checked, so a change is named rather than only detected.
  const pinned = buildAssuranceSnapshot(root, { asOf: kept.as_of, audience: kept.audience, paidMedia: kept.paid_media, method_id: kept.method_id, pins: kept.pins })
  const changed = new Map<string, VerifyResult['changed'][number]>()
  for (const control of pinned.controls) {
    for (const fact of control.facts) if (fact.state !== 'current' && isApprovedPin(fact.ref.revision) && kept.pins.facts.some((ref) => ref.id === fact.ref.id && ref.revision === fact.ref.revision)) changed.set(`fact:${fact.ref.id}`, { kind: 'fact', id: fact.ref.id, state: fact.state })
    for (const note of control.evidence) if (note.state !== 'current') changed.set(`note:${note.ref.note_id}`, { kind: 'research_note', id: note.ref.note_id, state: note.state })
  }
  // A link added, removed or no longer counting (an entry withdrawn, expired, a note changed) is named
  // by its note id. Snapshots kept before links existed list none, so only new links show up for them.
  const nowLinks = new Map(pinned.evidence_links.map((link) => [link.note_id, link]))
  const keptLinks = new Map(kept.links.map((link) => [link.note_id, link]))
  for (const [noteId, link] of keptLinks) {
    const now = nowLinks.get(noteId)
    if (!now) changed.set(`link:${noteId}`, { kind: 'evidence_link', id: noteId, state: 'missing' })
    else if (now.evidence_id !== link.evidence_id || now.link_revision !== link.link_revision || now.state !== link.state) changed.set(`link:${noteId}`, { kind: 'evidence_link', id: noteId, state: 'changed' })
  }
  for (const noteId of nowLinks.keys()) if (!keptLinks.has(noteId)) changed.set(`link:${noteId}`, { kind: 'evidence_link', id: noteId, state: 'changed' })
  return {
    reproduced: fresh.source_snapshot_digest === kept.digest,
    expected_digest: kept.digest,
    actual_digest: fresh.source_snapshot_digest,
    changed: [...changed.values()].sort((a, b) => (`${a.kind}:${a.id}` < `${b.kind}:${b.id}` ? -1 : 1)),
    snapshot: pinned,
    authorizes: [],
  }
}

/** Canonical JSON of a snapshot, so two runs can be compared byte for byte. */
export function canonicalSnapshot(snapshot: AssuranceSnapshot): string {
  return canonicalJson(snapshot)
}
