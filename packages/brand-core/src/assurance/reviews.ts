/**
 * Owner review judgments for `reviewer_judgment` controls (GAP-09 follow-up).
 *
 * Some controls cannot be decided by the engine. PRR-08 asks whether the cited evidence actually supports
 * the differentiation claim, and only a person can say. Until now nothing recorded that judgment, so
 * every real brand got "no score". This file stores the owner's judgment as data the bridge can read.
 *
 * Storage: `brand/.private/assurance/reviews/<control_id>.json`, one file per control, inside the brand
 * workspace (never the template repo). `brand/.private` is gitignored and excluded from Studio, docs
 * builds, the public projection and every agent tool. The file is versioned in place: an append-only
 * list of revisions, each with a content hash that also covers the previous revision's id, so a
 * rewritten or reordered history is detected and refused rather than silently used.
 *
 * Rules:
 *
 * 1. **Owner only.** Every read and write refuses while `BRAND_OS_AGENT_TOKEN` is set. No MCP tool,
 *    Studio route or agent profile reaches it. A judgment's role is always `owner`; `agent` is not a
 *    reviewer role in the engine and cannot be written here.
 * 2. **A judgment is about what was there.** Each revision records its basis: the ids and revisions of
 *    the facts and research notes the control cites at that moment. If any of them changes, the judgment
 *    is stale and is not used: the control is blocking again until the owner judges it anew.
 * 3. **A note is required** and stays in this private file. A note that looks like a credential is refused. The snapshot carries only a reference to
 *    the revision, never the note text.
 * 4. **Dates only go forward.** A revision's `reviewed_on` may not be in the future and may not be earlier
 *    than the previous revision's, so a snapshot `--as-of` an earlier day is reproduced by the revisions
 *    that existed for it.
 * 5. **Never a certification.** A judgment lets the existing evaluator give a completeness ratio. It
 *    raises no claim level and `authorizes` stays empty.
 */

import path from 'node:path'
import { AGENT_TOKEN_ENV } from '../agent-tokens.js'
import { KnowledgeError } from '../knowledge/model.js'
import { credentialFindings } from '../knowledge/safety.js'
import { dirUsable, safeRead, withLock, writeVaultFile, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import { canonicalJson, sha256Hex } from '../strategy/model.js'
import type { ReviewableStatus } from './controls.js'

export const REVIEW_SCHEMA = 'brand-os.assurance-review/1'
export const REVIEWS_DIR = 'brand/.private/assurance/reviews'
export const REVIEW_LIMITS = { maxNoteChars: 500, maxRevisions: 500, maxFileBytes: 512 * 1024 } as const

/** The owner's answer to "is this supported?". Three words, mapped onto the engine's own statuses. */
export const JUDGMENTS = ['yes', 'partly', 'no'] as const
export type Judgment = (typeof JUDGMENTS)[number]

export const JUDGMENT_STATUS: Record<Judgment, ReviewableStatus> = {
  yes: 'applicable_complete',
  partly: 'applicable_partial',
  no: 'evidence_insufficient',
}

/** What the judgment was about: ids and revisions only. `none` stands for a fact that was not approved. */
export interface ReviewBasis {
  facts: Array<{ id: string; revision: string }>
  evidence: Array<{ note_id: string; revision: string }>
}

export interface ReviewRevision {
  revision: string
  /** The revision this one replaces, or null for the first. Part of the hashed content. */
  supersedes: string | null
  judgment: Judgment
  /** The owner's short reason. Private: never copied into a snapshot, report or log. */
  note: string
  /** The day the owner made the judgment, YYYY-MM-DD. */
  reviewed_on: string
  /** When it was written, from the workspace clock. */
  recorded_at: string
  reviewer_role: 'owner'
  basis: ReviewBasis
  basis_digest: string
}

export interface ReviewFile {
  kind: 'assurance_review'
  schema: typeof REVIEW_SCHEMA
  brand_slug: string
  control_id: string
  revisions: ReviewRevision[]
}

export class AssuranceReviewError extends Error {
  constructor(
    readonly code: 'refused' | 'invalid_input' | 'invalid_record' | 'unsafe_path' | 'wrong_brand' | 'locked' | 'not_reviewable',
    message: string,
  ) {
    super(message)
    this.name = 'AssuranceReviewError'
  }
}

export function assertOwnerReview(env: NodeJS.ProcessEnv = process.env): void {
  if (env[AGENT_TOKEN_ENV]) {
    throw new AssuranceReviewError('refused', `Review judgments are the owner's own. Refusing while ${AGENT_TOKEN_ENV} is set; no agent profile covers them.`)
  }
}

const CONTROL_ID = /^[A-Z]{2,8}-\d{1,4}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const REVISION = /^rev_[0-9a-f]{24}$/

function controlFile(ws: KnowledgeWorkspace, controlId: string): string {
  if (!CONTROL_ID.test(controlId)) throw new AssuranceReviewError('invalid_input', 'A control id looks like PRR-08.')
  return path.join(ws.root, ...REVIEWS_DIR.split('/'), `${controlId}.json`)
}

export function basisDigest(basis: ReviewBasis): string {
  return sha256Hex(canonicalJson(normalBasis(basis)))
}

export function normalBasis(basis: ReviewBasis): ReviewBasis {
  return {
    facts: [...basis.facts].map((ref) => ({ id: ref.id, revision: ref.revision })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    evidence: [...basis.evidence].map((ref) => ({ note_id: ref.note_id, revision: ref.revision })).sort((a, b) => (a.note_id < b.note_id ? -1 : a.note_id > b.note_id ? 1 : 0)),
  }
}

function revisionId(controlId: string, body: Omit<ReviewRevision, 'revision'>): string {
  return `rev_${sha256Hex(canonicalJson({ control_id: controlId, ...body })).slice(0, 24)}`
}

/** A real calendar day, YYYY-MM-DD. */
export function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Trimmed, bounded, single paragraph without control characters. */
export function cleanNote(value: unknown): string {
  if (typeof value !== 'string') throw new AssuranceReviewError('invalid_input', 'A judgment needs a short written note.')
  const note = value.replace(/\s+/g, ' ').trim()
  if (!note) throw new AssuranceReviewError('invalid_input', 'A judgment needs a short written note.')
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(note)) throw new AssuranceReviewError('invalid_input', 'The note has control characters.')
  if ([...note].length > REVIEW_LIMITS.maxNoteChars) throw new AssuranceReviewError('invalid_input', `The note is longer than ${REVIEW_LIMITS.maxNoteChars} characters.`)
  // The note is stored in plain text, like a Knowledge note, so the same credential check applies. Kinds only; never the text.
  const credentials = credentialFindings(note)
  if (credentials.length > 0) throw new AssuranceReviewError('invalid_input', `The note looks like it contains ${credentials.join(', ')}. A judgment note never holds a secret. Nothing was written.`)
  return note
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Checks one revision's shape and recomputes its hash. Anything off is refused, never repaired. */
function checkedRevision(controlId: string, raw: unknown, previous: ReviewRevision | null): ReviewRevision {
  const bad = (why: string) => new AssuranceReviewError('invalid_record', `The ${controlId} review history is not valid (${why}). It was not used.`)
  if (!isRecord(raw)) throw bad('a revision is not an object')
  const basis = raw.basis
  if (!isRecord(basis) || !Array.isArray(basis.facts) || !Array.isArray(basis.evidence)) throw bad('a basis is malformed')
  for (const ref of basis.facts) if (!isRecord(ref) || typeof ref.id !== 'string' || typeof ref.revision !== 'string') throw bad('a basis fact is malformed')
  for (const ref of basis.evidence) if (!isRecord(ref) || typeof ref.note_id !== 'string' || typeof ref.revision !== 'string') throw bad('a basis note is malformed')
  if (!(JUDGMENTS as readonly unknown[]).includes(raw.judgment)) throw bad('unknown judgment')
  if (raw.reviewer_role !== 'owner') throw bad('the reviewer is not the owner')
  if (!isDay(raw.reviewed_on) || typeof raw.recorded_at !== 'string' || typeof raw.note !== 'string' || typeof raw.revision !== 'string' || !REVISION.test(raw.revision)) throw bad('a field is malformed')
  if (raw.supersedes !== (previous?.revision ?? null)) throw bad('the chain of revisions is broken')
  if (previous && raw.reviewed_on < previous.reviewed_on) throw bad('dates go backwards')
  const normal = normalBasis(basis as unknown as ReviewBasis)
  const body: Omit<ReviewRevision, 'revision'> = {
    supersedes: previous?.revision ?? null,
    judgment: raw.judgment as Judgment,
    note: raw.note,
    reviewed_on: raw.reviewed_on,
    recorded_at: raw.recorded_at,
    reviewer_role: 'owner',
    basis: normal,
    basis_digest: basisDigest(normal),
  }
  if (raw.basis_digest !== body.basis_digest) throw bad('a basis digest does not match')
  if (revisionId(controlId, body) !== raw.revision) throw bad('a revision hash does not match')
  return { revision: raw.revision, ...body }
}

function wrap<T>(run: () => T): T {
  try {
    return run()
  } catch (error) {
    if (error instanceof KnowledgeError) throw new AssuranceReviewError(error.code === 'locked' ? 'locked' : 'unsafe_path', error.message)
    throw error
  }
}

/** The full, checked history of one control, oldest first. Empty when nothing was ever recorded. */
export function readReviewHistory(ws: KnowledgeWorkspace, controlId: string): ReviewRevision[] {
  assertOwnerReview()
  const file = controlFile(ws, controlId)
  const raw = wrap(() => (dirUsable(ws, path.dirname(file)) ? safeRead(file, REVIEW_LIMITS.maxFileBytes) : null))
  if (!raw) return []
  let doc: unknown
  try {
    doc = JSON.parse(raw.toString('utf8'))
  } catch {
    throw new AssuranceReviewError('invalid_record', `The ${controlId} review history is not JSON. It was not used.`)
  }
  if (!isRecord(doc) || doc.kind !== 'assurance_review' || doc.schema !== REVIEW_SCHEMA || doc.control_id !== controlId || !Array.isArray(doc.revisions)) {
    throw new AssuranceReviewError('invalid_record', `The ${controlId} review history is not a ${REVIEW_SCHEMA} file. It was not used.`)
  }
  if (doc.brand_slug !== ws.brandSlug) throw new AssuranceReviewError('wrong_brand', `The ${controlId} review history belongs to another brand. It was not used.`)
  if (doc.revisions.length > REVIEW_LIMITS.maxRevisions) throw new AssuranceReviewError('invalid_record', `The ${controlId} review history has too many revisions.`)
  const out: ReviewRevision[] = []
  for (const entry of doc.revisions) out.push(checkedRevision(controlId, entry, out.at(-1) ?? null))
  return out
}

/** The latest revision made on or before `day` (YYYY-MM-DD), or null. Dates never go backwards, so this is reproducible. */
export function reviewAsOf(history: ReviewRevision[], day: string): ReviewRevision | null {
  for (let index = history.length - 1; index >= 0; index -= 1) if (history[index]!.reviewed_on <= day) return history[index]!
  return null
}

export interface AppendReviewInput {
  control_id: string
  judgment: unknown
  note: unknown
  /** YYYY-MM-DD. Defaults to today in UTC. */
  reviewed_on?: string
  basis: ReviewBasis
  /** If set, the write is refused unless this is still the latest revision (or `null`: none yet). */
  expected_revision?: string | null
}

/**
 * Appends one revision. Callers pass the basis computed from the workspace right now; this function only
 * validates, chains and writes. Serialized per control with the Knowledge lock; atomic, mode 0600.
 */
export function appendReview(ws: KnowledgeWorkspace, input: AppendReviewInput): ReviewRevision {
  assertOwnerReview()
  if (!(JUDGMENTS as readonly unknown[]).includes(input.judgment)) throw new AssuranceReviewError('invalid_input', 'The judgment must be yes, partly or no.')
  const note = cleanNote(input.note)
  const now = ws.now()
  const today = now.toISOString().slice(0, 10)
  const reviewedOn = input.reviewed_on ?? today
  if (!isDay(reviewedOn)) throw new AssuranceReviewError('invalid_input', 'The date must be a real calendar day, YYYY-MM-DD.')
  if (reviewedOn > today) throw new AssuranceReviewError('invalid_input', 'The date may not be in the future.')
  const file = controlFile(ws, input.control_id)
  const lockName = `assurance-review-${input.control_id.toLowerCase()}`
  return wrap(() =>
    withLock(ws, lockName, () => {
      const history = readReviewHistory(ws, input.control_id)
      const latest = history.at(-1) ?? null
      if (input.expected_revision !== undefined && input.expected_revision !== (latest?.revision ?? null)) {
        throw new AssuranceReviewError('invalid_input', 'Another judgment was recorded since you looked. List again and retry.')
      }
      if (history.length >= REVIEW_LIMITS.maxRevisions) throw new AssuranceReviewError('invalid_input', 'This control has too many recorded revisions.')
      if (latest && reviewedOn < latest.reviewed_on) throw new AssuranceReviewError('invalid_input', `The date may not be earlier than the last judgment (${latest.reviewed_on}).`)
      const basis = normalBasis(input.basis)
      const body: Omit<ReviewRevision, 'revision'> = {
        supersedes: latest?.revision ?? null,
        judgment: input.judgment as Judgment,
        note,
        reviewed_on: reviewedOn,
        recorded_at: now.toISOString(),
        reviewer_role: 'owner',
        basis,
        basis_digest: basisDigest(basis),
      }
      const revision: ReviewRevision = { revision: revisionId(input.control_id, body), ...body }
      const doc: ReviewFile = { kind: 'assurance_review', schema: REVIEW_SCHEMA, brand_slug: ws.brandSlug, control_id: input.control_id, revisions: [...history, revision] }
      writeVaultFile(ws, file, `${JSON.stringify(doc, null, 2)}\n`, true)
      return revision
    }),
  )
}
