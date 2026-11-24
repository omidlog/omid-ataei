/**
 * Owner links from Assurance research notes to evidence-register entries (GAP-09 follow-up).
 *
 * A Knowledge research note is the owner's own writing, so the bridge counts it as `owner_stated`. The
 * evidence register (`evidence.ts`, `brand/interview/evidence-register.yaml`) already records sources
 * and lets only the owner, with the approval proof, mark one `verified`. This file lets the owner say
 * "this note rests on that register entry". It does not verify anything itself: the register's own
 * rules decide whether the entry counts (`isCurrent`, not owner testimony, the same claim).
 *
 * Storage: `brand/.private/assurance/evidence-links/<note_id>.json`, one file per note, inside the brand
 * workspace (gitignored; excluded from Studio, docs builds, the projection and every agent tool). It
 * holds ids, revisions and dates only, never text from the note or the register. Append-only revisions
 * (`link` / `unlink`), each a hash of its content and of the revision it supersedes, so an edited,
 * reordered or foreign history is refused rather than used.
 *
 * Rules:
 *
 * 1. **Owner only.** Every read and write refuses while `BRAND_OS_AGENT_TOKEN` is set.
 * 2. **A link is about one note revision.** When the note changes, the link no longer applies
 *    (`note_changed`) and the note is `owner_stated` again until the owner links it anew.
 * 3. **The register decides.** A link counts only while its entry is a verification from a source other
 *    than owner testimony, for a question the note is about, verified on or before the day assessed and
 *    not past its review date. Withdrawn, rejected, pending and expired entries do not count.
 * 4. **Dates only go forward**, as for judgments, so a snapshot as of an earlier day is reproducible.
 * 5. **Never a certification.** A qualifying link changes one input's independence. The claim level
 *    stays `internally_assessed` and `authorizes` stays empty.
 */

import path from 'node:path'
import { AGENT_TOKEN_ENV } from '../agent-tokens.js'
import { isCurrent, type EvidenceItem } from '../evidence.js'
import { KnowledgeError, NOTE_ID } from '../knowledge/model.js'
import { dirUsable, safeRead, withLock, writeVaultFile, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import { canonicalJson, sha256Hex } from '../strategy/model.js'
import { isDay } from './reviews.js'

export const LINK_SCHEMA = 'brand-os.assurance-evidence-link/1'
export const LINKS_DIR = 'brand/.private/assurance/evidence-links'
export const LINK_LIMITS = { maxRevisions: 500, maxFileBytes: 256 * 1024 } as const

export const LINK_ACTIONS = ['link', 'unlink'] as const
export type LinkAction = (typeof LINK_ACTIONS)[number]

/** Evidence-register ids, as `addEvidence` writes them. */
export const EVIDENCE_ID = /^ev-\d{4,6}$/

export interface LinkRevision {
  revision: string
  supersedes: string | null
  action: LinkAction
  /** The register entry, for `link`; null for `unlink`. */
  evidence_id: string | null
  /** The note revision the owner linked, for `link`; null for `unlink`. */
  note_revision: string | null
  /** The day the owner made the link, YYYY-MM-DD. */
  linked_on: string
  recorded_at: string
  actor_role: 'owner'
}

export interface LinkFile {
  kind: 'assurance_evidence_link'
  schema: typeof LINK_SCHEMA
  brand_slug: string
  note_id: string
  revisions: LinkRevision[]
}

/**
 * Where a link stands on a given day. Only `qualifies` makes a note independent; every other state
 * leaves it `owner_stated` and names why.
 */
export const LINK_STATES = ['qualifies', 'note_changed', 'entry_missing', 'not_independent', 'claim_mismatch', 'not_verified', 'expired', 'withdrawn', 'rejected'] as const
export type LinkState = (typeof LINK_STATES)[number]

export class AssuranceLinkError extends Error {
  constructor(
    readonly code: 'refused' | 'invalid_input' | 'invalid_record' | 'unsafe_path' | 'wrong_brand' | 'locked' | 'not_linkable',
    message: string,
  ) {
    super(message)
    this.name = 'AssuranceLinkError'
  }
}

export function assertOwnerLink(env: NodeJS.ProcessEnv = process.env): void {
  if (env[AGENT_TOKEN_ENV]) {
    throw new AssuranceLinkError('refused', `Evidence links are the owner's own. Refusing while ${AGENT_TOKEN_ENV} is set; no agent profile covers them.`)
  }
}

const REVISION = /^lnk_[0-9a-f]{24}$/

function noteFile(ws: KnowledgeWorkspace, noteId: string): string {
  if (!NOTE_ID.test(noteId)) throw new AssuranceLinkError('invalid_input', 'A research note id looks like kn_….')
  return path.join(ws.root, ...LINKS_DIR.split('/'), `${noteId}.json`)
}

function revisionId(noteId: string, body: Omit<LinkRevision, 'revision'>): string {
  return `lnk_${sha256Hex(canonicalJson({ note_id: noteId, ...body })).slice(0, 24)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function checkedRevision(noteId: string, raw: unknown, previous: LinkRevision | null): LinkRevision {
  const bad = (why: string) => new AssuranceLinkError('invalid_record', `The evidence-link history of ${noteId} is not valid (${why}). It was not used.`)
  if (!isRecord(raw)) throw bad('a revision is not an object')
  if (!(LINK_ACTIONS as readonly unknown[]).includes(raw.action)) throw bad('unknown action')
  if (raw.actor_role !== 'owner') throw bad('the actor is not the owner')
  if (!isDay(raw.linked_on) || typeof raw.recorded_at !== 'string' || typeof raw.revision !== 'string' || !REVISION.test(raw.revision)) throw bad('a field is malformed')
  if (raw.action === 'link') {
    if (typeof raw.evidence_id !== 'string' || !EVIDENCE_ID.test(raw.evidence_id) || typeof raw.note_revision !== 'string' || raw.note_revision.length === 0 || raw.note_revision.length > 200) throw bad('a link is malformed')
  } else if (raw.evidence_id !== null || raw.note_revision !== null) throw bad('an unlink carries a link')
  if (raw.supersedes !== (previous?.revision ?? null)) throw bad('the chain of revisions is broken')
  if (previous && raw.linked_on < previous.linked_on) throw bad('dates go backwards')
  const body: Omit<LinkRevision, 'revision'> = {
    supersedes: previous?.revision ?? null,
    action: raw.action as LinkAction,
    evidence_id: raw.evidence_id as string | null,
    note_revision: raw.note_revision as string | null,
    linked_on: raw.linked_on,
    recorded_at: raw.recorded_at,
    actor_role: 'owner',
  }
  if (revisionId(noteId, body) !== raw.revision) throw bad('a revision hash does not match')
  return { revision: raw.revision, ...body }
}

function wrap<T>(run: () => T): T {
  try {
    return run()
  } catch (error) {
    if (error instanceof KnowledgeError) throw new AssuranceLinkError(error.code === 'locked' ? 'locked' : 'unsafe_path', error.message)
    throw error
  }
}

/** The checked link history of one note, oldest first. Empty when the note was never linked. */
export function readLinkHistory(ws: KnowledgeWorkspace, noteId: string): LinkRevision[] {
  assertOwnerLink()
  const file = noteFile(ws, noteId)
  const raw = wrap(() => (dirUsable(ws, path.dirname(file)) ? safeRead(file, LINK_LIMITS.maxFileBytes) : null))
  if (!raw) return []
  let doc: unknown
  try {
    doc = JSON.parse(raw.toString('utf8'))
  } catch {
    throw new AssuranceLinkError('invalid_record', `The evidence-link history of ${noteId} is not JSON. It was not used.`)
  }
  if (!isRecord(doc) || doc.kind !== 'assurance_evidence_link' || doc.schema !== LINK_SCHEMA || doc.note_id !== noteId || !Array.isArray(doc.revisions)) {
    throw new AssuranceLinkError('invalid_record', `The evidence-link history of ${noteId} is not a ${LINK_SCHEMA} file. It was not used.`)
  }
  if (doc.brand_slug !== ws.brandSlug) throw new AssuranceLinkError('wrong_brand', `The evidence-link history of ${noteId} belongs to another brand. It was not used.`)
  if (doc.revisions.length > LINK_LIMITS.maxRevisions) throw new AssuranceLinkError('invalid_record', `The evidence-link history of ${noteId} has too many revisions.`)
  const out: LinkRevision[] = []
  for (const entry of doc.revisions) out.push(checkedRevision(noteId, entry, out.at(-1) ?? null))
  return out
}

/** The link in force on `day`: the latest revision made on or before it, if that is a `link`. */
export function linkAsOf(history: LinkRevision[], day: string): LinkRevision | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const revision = history[index]!
    if (revision.linked_on <= day) return revision.action === 'link' ? revision : null
  }
  return null
}

/**
 * Whether a link counts on `day`, judged by the evidence register's own rules. Pure: the caller passes
 * the note's revision and question ids and the register entry (or undefined when it is gone).
 */
export function linkState(link: LinkRevision, note: { revision: string; question_ids: string[] }, entry: EvidenceItem | undefined, day: string): LinkState {
  if (link.note_revision !== note.revision) return 'note_changed'
  if (!entry) return 'entry_missing'
  if (entry.kind !== 'verification' || entry.source_type === 'owner_testimony') return 'not_independent'
  if (!note.question_ids.includes(entry.claim_id)) return 'claim_mismatch'
  if (entry.status === 'withdrawn') return 'withdrawn'
  if (entry.status === 'rejected') return 'rejected'
  if (entry.status !== 'verified' || !entry.verified_at || entry.verified_at.slice(0, 10) > day) return 'not_verified'
  // The register's own test for "counts today", on the assessed day.
  if (!isCurrent(entry, new Date(`${day}T00:00:00.000Z`))) return 'expired'
  return 'qualifies'
}

export interface AppendLinkInput {
  note_id: string
  action: LinkAction
  evidence_id: string | null
  note_revision: string | null
  /** YYYY-MM-DD. Defaults to today in UTC. */
  linked_on?: string
  /** If set, the write is refused unless this is still the latest revision (or `null`: none yet). */
  expected_revision?: string | null
}

/** Appends one revision. Callers have checked the note and the entry; this validates, chains and writes. */
export function appendLink(ws: KnowledgeWorkspace, input: AppendLinkInput): LinkRevision {
  assertOwnerLink()
  if (!(LINK_ACTIONS as readonly unknown[]).includes(input.action)) throw new AssuranceLinkError('invalid_input', 'The action must be link or unlink.')
  if (input.action === 'link' && (typeof input.evidence_id !== 'string' || !EVIDENCE_ID.test(input.evidence_id) || !input.note_revision)) {
    throw new AssuranceLinkError('invalid_input', 'A link needs an evidence id like ev-0001.')
  }
  const now = ws.now()
  const today = now.toISOString().slice(0, 10)
  const linkedOn = input.linked_on ?? today
  if (!isDay(linkedOn)) throw new AssuranceLinkError('invalid_input', 'The date must be a real calendar day, YYYY-MM-DD.')
  if (linkedOn > today) throw new AssuranceLinkError('invalid_input', 'The date may not be in the future.')
  const file = noteFile(ws, input.note_id)
  return wrap(() =>
    // Lock names are short; a long note id is hashed into one.
    withLock(ws, `assurance-link-${sha256Hex(input.note_id).slice(0, 24)}`, () => {
      const history = readLinkHistory(ws, input.note_id)
      const latest = history.at(-1) ?? null
      if (input.expected_revision !== undefined && input.expected_revision !== (latest?.revision ?? null)) {
        throw new AssuranceLinkError('invalid_input', 'Another link was recorded since you looked. List again and retry.')
      }
      if (input.action === 'unlink' && latest?.action !== 'link') throw new AssuranceLinkError('invalid_input', 'This note has no link to remove.')
      if (history.length >= LINK_LIMITS.maxRevisions) throw new AssuranceLinkError('invalid_input', 'This note has too many recorded link revisions.')
      if (latest && linkedOn < latest.linked_on) throw new AssuranceLinkError('invalid_input', `The date may not be earlier than the last change (${latest.linked_on}).`)
      const body: Omit<LinkRevision, 'revision'> = {
        supersedes: latest?.revision ?? null,
        action: input.action,
        evidence_id: input.action === 'link' ? input.evidence_id : null,
        note_revision: input.action === 'link' ? input.note_revision : null,
        linked_on: linkedOn,
        recorded_at: now.toISOString(),
        actor_role: 'owner',
      }
      const revision: LinkRevision = { revision: revisionId(input.note_id, body), ...body }
      const doc: LinkFile = { kind: 'assurance_evidence_link', schema: LINK_SCHEMA, brand_slug: ws.brandSlug, note_id: input.note_id, revisions: [...history, revision] }
      writeVaultFile(ws, file, `${JSON.stringify(doc, null, 2)}\n`, true)
      return revision
    }),
  )
}
