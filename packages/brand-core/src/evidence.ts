import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import type { CanonicalFact } from './facts.js'
import { readFacts, writeFacts } from './facts.js'
import { ownedLocations, ownedMatch, type OwnedLocation } from './evidence-ownership.js'
import { readYaml, writeYaml } from './fsutil.js'
import { privateDataRefusal } from './personal-privacy.js'
import type { FieldQuestion, PublicationRequirement } from './types.js'

/**
 * Evidence & rights register (Personal Brand OS).
 *
 * `brand/interview/evidence-register.yaml` is Git-tracked and holds references only: what a source
 * is, which claim it supports, and its review state. Contents are never fetched or copied. Two kinds:
 * - verification: supports a factual claim (a degree, a talk, a result).
 * - permission: a right to publish (a client's consent for a case study, a photographer's licence).
 *
 * Rules:
 * - Anyone (including an agent) may record evidence. It starts `pending`.
 * - Only the owner, with the approval proof, marks it `verified` or `rejected`.
 * - Owner testimony is recorded and shown as owner-stated. It never counts as independent verification.
 * - A source the owner controls (the owner's own website, a venture they founded or own) is `owned: true`
 *   and shown as owner-published. It never counts as independent verification either. `owned` is also
 *   inferred on every read from the brand's own domains (`evidence-ownership.ts`); inference only ever
 *   marks a source as owned, never the reverse.
 * - A claim backed by an independent source and by the owner's own word is `partly_verified`, never
 *   `verified`: one independent item does not lift the owner-stated part.
 * - Verifying evidence that is already verified (or rejecting rejected evidence) changes nothing and writes nothing.
 * - Withdrawing evidence needs no proof (it only restricts) and unpublishes every claim whose
 *   publication gate no longer passes.
 * - A `review_due` date in the past makes the evidence stale: it stops counting. Verifying again does not move the
 *   date; the owner records a new entry with a later `review_due` and verifies that.
 */

export const EVIDENCE_KINDS = ['verification', 'permission'] as const
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]
export const EVIDENCE_SOURCES = ['owner_testimony', 'document', 'public_record', 'third_party', 'link'] as const
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number]
export const EVIDENCE_STATUSES = ['pending', 'verified', 'rejected', 'withdrawn'] as const
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number]

export interface EvidenceItem {
  id: string
  claim_id: string
  kind: EvidenceKind
  source_type: EvidenceSource
  /** A URL or a plain description of where the source is held. Never the content itself. */
  reference: string
  /**
   * True when the owner controls the source: their own website or profile, or a venture they founded or
   * own. Optional for registers written before v0.3 (absent means not recorded); `readEvidence` then
   * infers it from the brand's own domains. An owned source is owner-published, never independent.
   */
  owned?: boolean
  /** Optional short quotation from the source. */
  quote: string | null
  note: string | null
  /** For permissions: who granted it (a role or organization, not contact details). */
  granted_by: string | null
  /** For permissions: `public` allows public release; `internal` does not. */
  scope: 'public' | 'internal' | null
  status: EvidenceStatus
  recorded_at: string
  recorded_by: string
  verified_at: string | null
  verified_by: string | null
  review_due: string | null
  status_reason: string | null
}

export interface EvidenceFile {
  schema_version: 1
  note: string
  items: EvidenceItem[]
}

/**
 * How a claim is labelled. `verified`: only independent, current evidence. `partly_verified`: independent
 * evidence plus an owner-stated or owner-published part. `owner_published`: only sources the owner
 * controls. `owner_stated`: only the owner's testimony. `unverified`: needs evidence and has none.
 */
export const CLAIM_VERIFICATIONS = ['verified', 'partly_verified', 'owner_published', 'owner_stated', 'unverified', 'not_required'] as const
export type ClaimVerification = (typeof CLAIM_VERIFICATIONS)[number]

export const EVIDENCE_LIMITS = { reference: 500, quote: 400, note: 400, grantedBy: 120 } as const
const NOTE = 'References only. Contents are not fetched or stored. Status changes to verified or rejected need the owner approval proof.'

export function evidencePath(root: string): string {
  return path.join(root, 'brand', 'interview', 'evidence-register.yaml')
}

/** The register exactly as stored. Used by the write paths, so an inferred flag is never written back on its own. */
function readStoredEvidence(root: string): EvidenceItem[] {
  const file = evidencePath(root)
  if (!fs.existsSync(file)) return []
  const doc = readYaml<Partial<EvidenceFile> | null>(file)
  if (!doc || !Array.isArray(doc.items)) throw new Error('Invalid evidence register: expected items')
  return doc.items
}

/**
 * Mark every item whose reference points at one of the owner's own locations as `owned: true`. Items the
 * register already marks owned stay owned. Nothing is ever marked not owned.
 */
export function withOwnership(items: EvidenceItem[], locations: OwnedLocation[]): EvidenceItem[] {
  return items.map((item) => (item.owned === true || !ownedMatch(item.reference, locations) ? item : { ...item, owned: true }))
}

/** The register for reading: every item with `owned` resolved against the brand's own domains. */
export function readEvidence(root: string): EvidenceItem[] {
  const items = readStoredEvidence(root)
  return items.length ? withOwnership(items, ownedLocations(root)) : items
}

/** True for a verification whose source is independent of the owner: not testimony and not owner-controlled. */
export function isIndependentSource(item: Pick<EvidenceItem, 'kind' | 'source_type' | 'owned'>): boolean {
  return item.kind === 'verification' && item.source_type !== 'owner_testimony' && item.owned !== true
}

function writeEvidence(root: string, items: EvidenceItem[]): void {
  writeYaml(evidencePath(root), { schema_version: 1, note: NOTE, items } satisfies EvidenceFile)
}

function day(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** True when the evidence counts today: verified and not past its review date. */
export function isCurrent(item: EvidenceItem, now: Date): boolean {
  return item.status === 'verified' && (!item.review_due || item.review_due >= day(now))
}

export interface AddEvidenceInput {
  claim_id: string
  kind: EvidenceKind
  source_type: EvidenceSource
  reference: string
  quote?: string | null
  note?: string | null
  granted_by?: string | null
  scope?: 'public' | 'internal' | null
  review_due?: string | null
  recorded_by?: string
  /** The owner controls the source. When false or absent it is still inferred from the brand's own domains. */
  owned?: boolean
}

/** Record a source for a claim. It starts pending; nothing becomes verified here. */
export function addEvidence(root: string, questions: FieldQuestion[], input: AddEvidenceInput, now = new Date()): EvidenceItem {
  const question = questions.find((item) => item.id === input.claim_id)
  if (!question) throw new Error(`Unknown claim ${input.claim_id}. Use a question id.`)
  if (question.sensitivity === 'restricted') throw new Error('Restricted claims do not take evidence in the Git-tracked register.')
  if (!(EVIDENCE_KINDS as readonly string[]).includes(input.kind)) throw new Error(`Kind must be one of ${EVIDENCE_KINDS.join(', ')}.`)
  if (!(EVIDENCE_SOURCES as readonly string[]).includes(input.source_type)) throw new Error(`Source must be one of ${EVIDENCE_SOURCES.join(', ')}.`)
  const reference = input.reference.trim()
  if (!reference || reference.length > EVIDENCE_LIMITS.reference) throw new Error(`Reference must be 1 to ${EVIDENCE_LIMITS.reference} characters.`)
  const quote = input.quote?.trim() || null
  const note = input.note?.trim() || null
  const grantedBy = input.granted_by?.trim() || null
  if (quote && quote.length > EVIDENCE_LIMITS.quote) throw new Error(`Quote must be at most ${EVIDENCE_LIMITS.quote} characters.`)
  if (note && note.length > EVIDENCE_LIMITS.note) throw new Error(`Note must be at most ${EVIDENCE_LIMITS.note} characters.`)
  if (grantedBy && grantedBy.length > EVIDENCE_LIMITS.grantedBy) throw new Error(`Granted by must be at most ${EVIDENCE_LIMITS.grantedBy} characters.`)
  if (input.review_due && !/^\d{4}-\d{2}-\d{2}$/.test(input.review_due)) throw new Error('Review date must be YYYY-MM-DD.')
  if (input.kind === 'permission' && !input.scope) throw new Error('A permission needs a scope: public or internal.')
  // The register is tracked in Git: the same privacy rules as personal answers apply.
  for (const text of [reference, quote, note, grantedBy]) {
    const refusal = text ? privateDataRefusal({ id: input.claim_id, contact_field: false }, text) : null
    if (refusal) throw new Error(refusal.replace('Nothing was saved.', 'Nothing was recorded.'))
  }
  const items = readStoredEvidence(root)
  // Owner testimony is already the owner's word; `owned` describes a published source.
  const owned = input.source_type !== 'owner_testimony' && (input.owned === true || ownedMatch(reference, ownedLocations(root)) !== null)
  const item: EvidenceItem = {
    id: `ev-${String(items.length + 1).padStart(4, '0')}`,
    claim_id: input.claim_id,
    kind: input.kind,
    source_type: input.source_type,
    reference,
    owned,
    quote,
    note,
    granted_by: grantedBy,
    scope: input.kind === 'permission' ? (input.scope ?? null) : null,
    status: 'pending',
    recorded_at: now.toISOString(),
    recorded_by: input.recorded_by ?? 'owner',
    verified_at: null,
    verified_by: null,
    review_due: input.review_due ?? null,
    status_reason: null,
  }
  writeEvidence(root, [...items, item])
  return item
}

/**
 * Owner review. The caller has already checked the approval proof. Reviewing an item that already has
 * this decision is a no-op: nothing is written, so `verified_at` does not move and Git stays clean.
 * `unchanged` says so.
 */
export function reviewEvidence(root: string, id: string, decision: 'verified' | 'rejected', actor: string, now = new Date(), reason: string | null = null): EvidenceItem & { unchanged?: boolean } {
  const items = readStoredEvidence(root)
  const item = items.find((entry) => entry.id === id)
  if (!item) throw new Error(`No evidence ${id}.`)
  if (item.status === 'withdrawn') throw new Error(`${id} was withdrawn. Record a new item instead.`)
  if (item.status === decision) return { ...item, unchanged: true }
  item.status = decision
  item.verified_at = now.toISOString()
  item.verified_by = actor
  item.status_reason = reason
  writeEvidence(root, items)
  return item
}

/** Withdraw evidence (for example a client revoked consent). Needs no proof: it only restricts. */
export function withdrawEvidence(root: string, id: string, reason: string, now = new Date()): EvidenceItem {
  const items = readStoredEvidence(root)
  const item = items.find((entry) => entry.id === id)
  if (!item) throw new Error(`No evidence ${id}.`)
  item.status = 'withdrawn'
  item.status_reason = reason.trim().slice(0, EVIDENCE_LIMITS.note) || 'Withdrawn.'
  item.verified_at = item.verified_at ?? null
  item.verified_by = item.verified_by ?? null
  item.status_reason = `${item.status_reason} (${now.toISOString().slice(0, 10)})`
  writeEvidence(root, items)
  return item
}

/**
 * Current evidence for a claim, split by what it can prove. `independent` excludes owner testimony and
 * owner-controlled sources. `testimony` and `owner_published` are the owner's own word (pending included,
 * withdrawn and rejected excluded).
 */
export function evidenceFor(claimId: string, items: EvidenceItem[], now: Date) {
  const mine = items.filter((item) => item.claim_id === claimId)
  const live = (item: EvidenceItem) => item.status !== 'withdrawn' && item.status !== 'rejected'
  return {
    all: mine,
    independent: mine.filter((item) => isIndependentSource(item) && isCurrent(item, now)),
    testimony: mine.filter((item) => item.kind === 'verification' && item.source_type === 'owner_testimony' && live(item)),
    owner_published: mine.filter((item) => item.kind === 'verification' && item.source_type !== 'owner_testimony' && item.owned === true && live(item)),
    permissions: mine.filter((item) => item.kind === 'permission' && item.scope === 'public' && isCurrent(item, now)),
  }
}

/**
 * How a claim is labelled wherever it is shown. Owner testimony and owner-published sources are never shown
 * as verified. A claim with an independent source and an owner part is `partly_verified`: the weakest part
 * decides, so one independent item never makes a mixed claim `verified`.
 */
export function claimVerification(question: Pick<FieldQuestion, 'id' | 'publication_requires'>, items: EvidenceItem[], now: Date): ClaimVerification {
  return claimEvidence(question, items, now).verification
}

export interface ClaimEvidence {
  verification: ClaimVerification
  /** Independent, current sources. */
  independent: EvidenceItem[]
  /** The owner's own part: testimony and owner-controlled sources that are not withdrawn or rejected. */
  owner_parts: EvidenceItem[]
}

/** The label plus the items behind it, so a surface can name the owner-stated part of a mixed claim. */
export function claimEvidence(question: Pick<FieldQuestion, 'id' | 'publication_requires'>, items: EvidenceItem[], now: Date): ClaimEvidence {
  const found = evidenceFor(question.id, items, now)
  const ownerParts = [...found.testimony, ...found.owner_published].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  let verification: ClaimVerification
  if (found.independent.length) verification = ownerParts.length ? 'partly_verified' : 'verified'
  else if (found.owner_published.length) verification = 'owner_published'
  else if (found.testimony.length) verification = 'owner_stated'
  else verification = question.publication_requires?.includes('verified_evidence') ? 'unverified' : 'not_required'
  return { verification, independent: found.independent, owner_parts: ownerParts }
}

/** One owner part, named for an internal reader: id, kind of source, and what it says or where it is. */
export function ownerPartLabel(item: EvidenceItem): string {
  const kind = item.source_type === 'owner_testimony' ? 'owner testimony' : 'owner-published'
  const what = item.quote ?? item.note ?? item.reference
  return `${item.id} (${kind}: ${what})`
}

/**
 * The English note shown next to a personal claim. `detail` names the owner-stated part of a mixed claim by
 * evidence id and content; leave it off for a public reader, who never sees register entries.
 */
export function verificationNote(summary: ClaimEvidence, detail = true): string | null {
  switch (summary.verification) {
    case 'verified':
      return 'Verified by an independent, current source.'
    case 'partly_verified': {
      const base = 'Partly verified. An independent, current source supports part of this claim; the rest is the owner\'s own word and is not independently verified.'
      return detail && summary.owner_parts.length ? `${base} Owner-stated part: ${summary.owner_parts.map(ownerPartLabel).join('; ')}.` : base
    }
    case 'owner_published':
      return 'Owner-published. Not independently verified: the only source is one the owner controls.'
    case 'owner_stated':
      return 'Owner-stated. Not independently verified.'
    case 'unverified':
      return 'Unverified. Needs a source before public release.'
    default:
      return null
  }
}

/** Reasons a claim cannot be published today, beyond approval and classification. Empty means none. */
export function publicationBlockers(question: Pick<FieldQuestion, 'id' | 'publication_requires' | 'contact_field'>, value: unknown, items: EvidenceItem[], now: Date): string[] {
  const blockers: string[] = []
  const found = evidenceFor(question.id, items, now)
  const requires: PublicationRequirement[] = question.publication_requires ?? []
  if (requires.includes('verified_evidence') && found.independent.length === 0) {
    blockers.push(
      found.owner_published.length
        ? 'Only sources the owner controls (owner-published, for example their own website) support this claim. Publication needs an independent source verified with brand:evidence verify.'
        : found.testimony.length
          ? 'Only owner testimony supports this claim. Publication needs an independent source verified with brand:evidence verify.'
          : 'No verified, current evidence. Record a source with brand:evidence add and verify it.',
    )
  }
  if (requires.includes('rights_permission') && found.permissions.length === 0) {
    blockers.push('No verified, current public-use permission. Record it with brand:evidence add --kind permission --scope public and verify it.')
  }
  if (question.id.startsWith('personal.') && value !== null && value !== undefined) {
    const refusal = privateDataRefusal(question, value)
    if (refusal) blockers.push('The value looks like it contains private personal data. It cannot be published.')
  }
  return blockers
}

/** Publication requirements by question id, read from the workspace question bank. */
type Requirement = Pick<FieldQuestion, 'id' | 'publication_requires' | 'contact_field'>
const requirementCache = new Map<string, { key: string; value: Map<string, Requirement> }>()

export function requirementsFrom(root: string): Map<string, Requirement> {
  const dir = path.join(root, 'brand', 'interview', 'question-bank')
  const out = new Map<string, Requirement>()
  if (!fs.existsSync(dir)) return out
  const names = fs.readdirSync(dir).filter((entry) => entry.endsWith('.yaml')).sort()
  // Re-read only when a bank file changed, so the public build can call this per fact.
  const key = names.map((name) => {
    const stat = fs.statSync(path.join(dir, name))
    return `${name}:${stat.size}:${stat.mtimeMs}`
  }).join('|')
  const cached = requirementCache.get(dir)
  if (cached?.key === key) return cached.value
  requirementCache.set(dir, { key, value: out })
  for (const name of names) {
    const doc = parse(fs.readFileSync(path.join(dir, name), 'utf8')) as { questions?: FieldQuestion[] } | null
    for (const question of doc?.questions ?? []) {
      if (question.id.startsWith('personal.') || question.publication_requires?.length) {
        out.set(question.id, { id: question.id, publication_requires: question.publication_requires, contact_field: question.contact_field })
      }
    }
  }
  return out
}

/** Gate used by every public projection. Facts without personal or publication requirements always pass. */
export function gatePasses(root: string, id: string, value: unknown, now = new Date()): boolean {
  const question = requirementsFrom(root).get(id)
  if (!question) return true
  return publicationBlockers(question, value, readEvidence(root), now).length === 0
}

/**
 * Unpublish every published fact whose gate fails now (after a withdrawal, a rejection or an expired
 * review date). Restricting needs no proof. Returns the ids that were unpublished.
 */
export function unpublishBlocked(root: string, brandId: string, now = new Date()): string[] {
  const facts = readFacts(root, 'approved', brandId)
  const items = readEvidence(root)
  const requirements = requirementsFrom(root)
  const removed: string[] = []
  for (const [id, fact] of Object.entries(facts) as Array<[string, CanonicalFact]>) {
    const question = requirements.get(id)
    if (!question || fact.publication !== 'published') continue
    if (publicationBlockers(question, fact.value, items, now).length > 0) {
      fact.publication = 'unpublished'
      removed.push(id)
    }
  }
  const policyFile = path.join(root, 'brand', 'publication-policy.yaml')
  const policy = fs.existsSync(policyFile) ? readYaml<Record<string, unknown>>(policyFile) : null
  const listed = Array.isArray(policy?.approved_fact_ids) ? (policy.approved_fact_ids as string[]) : []
  const stale = listed.filter((id) => {
    const question = requirements.get(id)
    return question !== undefined && !removed.includes(id) && publicationBlockers(question, facts[id]?.value, items, now).length > 0
  })
  removed.push(...stale)
  if (removed.length) {
    writeFacts(root, 'approved', facts)
    if (policy) {
      policy.approved_fact_ids = listed.filter((id) => !removed.includes(id))
      writeYaml(policyFile, policy)
    }
  }
  return removed
}
