import path from 'node:path'
import { readProject } from '../creative/store.js'
import { CreativeError } from '../creative/model.js'
import { KnowledgeError } from '../knowledge/model.js'
import { captureNote, findNote } from '../knowledge/store.js'
import { dirUsable, safeRead, withLock, writeVaultFile, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import { AGENT_TOKEN_ENV } from '../agent-tokens.js'
import { EQUITY_CHOICES, EQUITY_COMPONENTS, EQUITY_EVIDENCE, IdentityError, oneOf, validateAnswer, type AnswerValue, type Answers, type EquityChoice, type EquityComponent, type EquityEvidence } from './model.js'

/**
 * The identity audit record: brand/.private/identity/audit.json (gitignored, never in Studio, docs or MCP).
 *
 * It holds closed-vocabulary answers, equity choices, the linked Creative Learning project id and the owner's review
 * marks. Owner words become local Knowledge notes (source owner_note, tag identity-audit) and are cited by id and
 * revision. A changed answer keeps its history. Every function refuses to run under an agent token.
 */

export const IDENTITY_DIR = 'brand/.private/identity'
export const AUDIT_FILE = `${IDENTITY_DIR}/audit.json`

export interface NoteRef {
  id: string
  revision: string
}

export interface AnswerEntry {
  value: AnswerValue
  note: NoteRef | null
  answered_at: string
  history: Array<{ value: AnswerValue; note: NoteRef | null; answered_at: string }>
}

export interface EquityEntry {
  choice: EquityChoice
  evidence: EquityEvidence
  /** The owner's reason, in their words, as a Knowledge note. */
  note: NoteRef | null
  /** A recognition study (or its summary) in the Knowledge Inbox. Required for `measured_study`. */
  study: NoteRef | null
  recorded_at: string
  history: Array<{ choice: EquityChoice; evidence: EquityEvidence; note: NoteRef | null; study: NoteRef | null; recorded_at: string }>
}

export interface ReviewMark {
  reviewed_at: string
  /** Digest of the brief the owner read. */
  brief_digest: string
  /** Digest of every source revision the brief cited (facts, research, creative, audit). */
  sources_digest: string
}

export interface AuditRecord {
  schema_version: 1
  kind: 'identity_audit'
  brand_slug: string
  answers: Record<string, AnswerEntry>
  equity: Partial<Record<EquityComponent, EquityEntry>>
  /** A Creative Learning project (surface logo) that holds concept rounds and owner feedback. */
  creative_project_id: string | null
  reviews: ReviewMark[]
  updated_at: string
}

/** The identity audit is the owner's local data and has no agent profile. */
export function assertOwnerProcess(): void {
  if (process.env[AGENT_TOKEN_ENV]) throw new IdentityError('refused', `The identity audit and logo brief are the owner's local drafts. Refusing while ${AGENT_TOKEN_ENV} is set.`)
}

function file(ws: KnowledgeWorkspace): string {
  return path.join(ws.root, ...AUDIT_FILE.split('/'))
}

function empty(ws: KnowledgeWorkspace): AuditRecord {
  return { schema_version: 1, kind: 'identity_audit', brand_slug: ws.brandSlug, answers: {}, equity: {}, creative_project_id: null, reviews: [], updated_at: ws.now().toISOString() }
}

/** Reads the audit. A brand without one reads as empty (nothing answered), never as inferred answers. */
export function readAudit(ws: KnowledgeWorkspace): AuditRecord {
  assertOwnerProcess()
  const target = file(ws)
  if (!dirUsable(ws, path.dirname(target))) return empty(ws)
  let raw: Buffer | null
  try {
    raw = safeRead(target, 1024 * 1024)
  } catch (error) {
    if (error instanceof KnowledgeError) throw new IdentityError('refused', error.message)
    throw error
  }
  if (!raw) return empty(ws)
  let doc: AuditRecord
  try {
    doc = JSON.parse(raw.toString('utf8')) as AuditRecord
  } catch {
    throw new IdentityError('invalid_record', 'audit.json is not valid JSON.')
  }
  if (doc?.kind !== 'identity_audit' || doc.schema_version !== 1 || typeof doc.answers !== 'object' || typeof doc.equity !== 'object') throw new IdentityError('invalid_record', 'audit.json is not an identity audit record.')
  if (doc.brand_slug !== ws.brandSlug) throw new IdentityError('wrong_brand', 'audit.json belongs to another brand. It is not read.')
  return { ...doc, creative_project_id: doc.creative_project_id ?? null, reviews: Array.isArray(doc.reviews) ? doc.reviews : [] }
}

export function answersOf(record: AuditRecord): Answers {
  const out: Answers = {}
  for (const [id, entry] of Object.entries(record.answers)) {
    try {
      out[id] = validateAnswer(id, entry.value)
    } catch {
      // A hand-edited invalid value counts as unanswered, so the question is asked again.
    }
  }
  return out
}

function write(ws: KnowledgeWorkspace, record: AuditRecord): void {
  record.updated_at = ws.now().toISOString()
  writeVaultFile(ws, file(ws), `${JSON.stringify(record, null, 2)}\n`, true)
}

function ownerWords(ws: KnowledgeWorkspace, words: string | undefined, title: string, ref: string, language: string | null | undefined): NoteRef | null {
  if (words === undefined || !words.trim()) return null
  try {
    const captured = captureNote(ws, { title, body: words, kind: 'meeting', language: language ?? null, tags: ['identity-audit'], source: { kind: 'owner_note', ref } })
    return { id: captured.id, revision: captured.revision }
  } catch (error) {
    if (error instanceof KnowledgeError) throw new IdentityError(error.code === 'refused' ? 'refused' : 'invalid_input', error.message)
    throw error
  }
}

/** Records one diagnosis answer. `words`, when given, become a local Knowledge note that the answer cites. */
export function recordAnswer(ws: KnowledgeWorkspace, input: { question_id: string; value: unknown; words?: string; language?: string | null }): { entry: AnswerEntry; changed_from: AnswerValue | null } {
  assertOwnerProcess()
  const value = validateAnswer(input.question_id, input.value)
  const note = ownerWords(ws, input.words, `Identity audit: ${input.question_id}`, `identity-audit:${input.question_id}`, input.language)
  return withLock(ws, 'identity-audit', () => {
    const record = readAudit(ws)
    const previous = record.answers[input.question_id]
    const entry: AnswerEntry = {
      value,
      note,
      answered_at: ws.now().toISOString(),
      history: previous ? [...previous.history, { value: previous.value, note: previous.note, answered_at: previous.answered_at }].slice(-20) : [],
    }
    record.answers[input.question_id] = entry
    write(ws, record)
    return { entry, changed_from: previous ? previous.value : null }
  })
}

/**
 * Records the owner's preserve/refine/replace/evaluate/unknown choice for one element. `measured_study` is refused
 * without a cited study note: recognition is never asserted from a feeling or a visual comparison.
 */
export function setEquity(ws: KnowledgeWorkspace, input: { component: string; choice: string; evidence?: string; words?: string; study_note?: string; language?: string | null }): EquityEntry {
  assertOwnerProcess()
  const component = oneOf(input.component, EQUITY_COMPONENTS, 'Component')
  const choice = oneOf(input.choice, EQUITY_CHOICES, 'Choice')
  const evidence = oneOf(input.evidence ?? 'unknown', EQUITY_EVIDENCE, 'Evidence')
  let study: NoteRef | null = null
  if (input.study_note) {
    try {
      const loaded = findNote(ws, input.study_note.replace(/^knowledge:/, '').split('@')[0]!)
      if (loaded.note.meta.status === 'archived') throw new IdentityError('refused', `Note ${loaded.id} is archived. Cite a current study.`)
      study = { id: loaded.id, revision: loaded.revision }
    } catch (error) {
      if (error instanceof KnowledgeError) throw new IdentityError('not_found', error.message)
      throw error
    }
  }
  if (evidence === 'measured_study' && !study) throw new IdentityError('refused', 'measured_study needs --study-note <kn_…>: the study or its summary in the Knowledge Inbox. Otherwise use owner_reported.')
  if (evidence !== 'measured_study' && study) throw new IdentityError('invalid_input', 'A study note is only cited with --evidence measured_study.')
  const note = ownerWords(ws, input.words, `Identity audit: ${component}`, `identity-audit:equity/${component}`, input.language)
  return withLock(ws, 'identity-audit', () => {
    const record = readAudit(ws)
    const previous = record.equity[component]
    const entry: EquityEntry = {
      choice,
      evidence,
      note,
      study,
      recorded_at: ws.now().toISOString(),
      history: previous ? [...previous.history, { choice: previous.choice, evidence: previous.evidence, note: previous.note, study: previous.study, recorded_at: previous.recorded_at }].slice(-20) : [],
    }
    record.equity[component] = entry
    write(ws, record)
    return entry
  })
}

/** Links the Creative Learning project that holds logo concept rounds. It must exist and use the logo surface. */
export function linkCreativeProject(ws: KnowledgeWorkspace, projectId: string): AuditRecord {
  assertOwnerProcess()
  let surface: string
  try {
    surface = readProject(ws, projectId).surface
  } catch (error) {
    if (error instanceof CreativeError) throw new IdentityError(error.code === 'not_found' ? 'not_found' : 'invalid_input', error.message)
    throw error
  }
  if (surface !== 'logo') throw new IdentityError('invalid_input', `Project ${projectId} uses the ${surface} surface. Create logo concept rounds with brand:creative project --surface logo.`)
  return withLock(ws, 'identity-audit', () => {
    const record = readAudit(ws)
    record.creative_project_id = projectId
    write(ws, record)
    return record
  })
}

/** Records that the owner read this brief. It approves nothing; it lets a later brief show what changed since. */
export function markReviewed(ws: KnowledgeWorkspace, input: { brief_digest: string; sources_digest: string }): ReviewMark {
  assertOwnerProcess()
  if (!/^[0-9a-f]{64}$/.test(input.brief_digest) || !/^[0-9a-f]{64}$/.test(input.sources_digest)) throw new IdentityError('invalid_input', 'Digests are sha256 hex.')
  return withLock(ws, 'identity-audit', () => {
    const record = readAudit(ws)
    const mark: ReviewMark = { reviewed_at: ws.now().toISOString(), brief_digest: input.brief_digest, sources_digest: input.sources_digest }
    record.reviews = [...record.reviews, mark].slice(-50)
    write(ws, record)
    return mark
  })
}
