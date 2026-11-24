import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { InterviewEngine } from '../engine.js'
import {
  cleanText,
  decodeNote,
  isNoteId,
  KNOWLEDGE_LIMITS,
  KnowledgeError,
  newNoteId,
  NOTE_FILENAME,
  NOTE_KINDS,
  NOTE_SCHEMA_VERSION,
  NOTE_STATUSES,
  parseNote,
  RESTRICTED_FILENAME,
  revisionOf,
  serializeNote,
  SOURCE_KINDS_NOTE,
  validateLanguage,
  validateLinks,
  validateQuestionIdShape,
  validateTags,
  validateTitle,
  type NoteClassification,
  type NoteKind,
  type NoteLink,
  type NoteMeta,
  type NoteScope,
  type NoteSourceKind,
  type NoteStatus,
  type ParsedNote,
} from './model.js'
import { credentialFindings } from './safety.js'
import {
  decryptNote,
  dirOf,
  dirUsable,
  encryptNote,
  ensureDir,
  noteFile,
  relativePath,
  restrictedKeyAvailable,
  safeRead,
  scopeDir,
  withLock,
  writeVaultFile,
  assertId,
  type KnowledgeWorkspace,
} from './workspace.js'

export interface LoadedNote {
  scope: NoteScope
  id: string
  /** Repository-relative path. */
  path: string
  file: string
  revision: string
  raw: string
  note: ParsedNote
}

export interface LoadProblem {
  scope: NoteScope
  path: string
  code: 'unexpected_file' | 'symlink' | 'unreadable' | 'invalid_note' | 'wrong_brand' | 'filename_mismatch' | 'leftover_temp' | 'key_required'
  message: string
  id?: string
}

export interface ScanResult {
  notes: LoadedNote[]
  problems: LoadProblem[]
  /** Restricted notes that exist but could not be decrypted because the key is absent. */
  restricted_locked: number
}

function loadFromRaw(ws: KnowledgeWorkspace, scope: NoteScope, file: string, plain: Buffer): LoadedNote {
  const text = decodeNote(plain)
  const note = parseNote(text)
  return { scope, id: note.meta.id, path: relativePath(ws, file), file, revision: revisionOf(plain), raw: text, note }
}

function problemFrom(ws: KnowledgeWorkspace, scope: NoteScope, file: string, error: unknown): LoadProblem {
  const known = error instanceof KnowledgeError
  const code: LoadProblem['code'] = known && error.code === 'unsafe_path' ? 'symlink' : known && (error.code === 'invalid_note' || error.code === 'too_large') ? 'invalid_note' : known && error.code === 'key_required' ? 'key_required' : 'unreadable'
  return { scope, path: relativePath(ws, file), code, message: known ? error.message : 'The file could not be read.' }
}

/** Reads every note in one scope. Notes for another brand are excluded and reported, never returned. */
export function scanScope(ws: KnowledgeWorkspace, scope: NoteScope, opts: { decrypt?: boolean } = {}): ScanResult {
  const result: ScanResult = { notes: [], problems: [], restricted_locked: 0 }
  const dir = scopeDir(ws, scope)
  let usable: boolean
  try {
    usable = dirUsable(ws, dir)
  } catch (error) {
    result.problems.push(problemFrom(ws, scope, dir, error))
    return result
  }
  if (!usable) return result
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  const canDecrypt = scope === 'restricted' && opts.decrypt === true && restrictedKeyAvailable()
  let scanned = 0
  for (const entry of entries) {
    const file = path.join(dir, entry.name)
    if (entry.name.startsWith('.') && entry.name.endsWith('.tmp')) {
      result.problems.push({ scope, path: relativePath(ws, file), code: 'leftover_temp', message: 'A temporary file from an interrupted write. It can be deleted.' })
      continue
    }
    const pattern = scope === 'restricted' ? RESTRICTED_FILENAME : NOTE_FILENAME
    if (!pattern.test(entry.name)) {
      result.problems.push({ scope, path: relativePath(ws, file), code: 'unexpected_file', message: 'Not a note file name; ignored.' })
      continue
    }
    if (entry.isSymbolicLink()) {
      result.problems.push({ scope, path: relativePath(ws, file), code: 'symlink', message: 'A symlink in the knowledge folder; ignored.' })
      continue
    }
    if (++scanned > KNOWLEDGE_LIMITS.maxNotesScanned) break
    if (scope === 'restricted') {
      if (!canDecrypt) {
        result.restricted_locked += 1
        continue
      }
      const id = entry.name.slice(0, -'.enc'.length)
      try {
        const sealed = safeRead(file, KNOWLEDGE_LIMITS.maxNoteBytes * 2)
        if (!sealed) continue
        const loaded = loadFromRaw(ws, scope, file, decryptNote(id, sealed))
        if (loaded.id !== id) {
          result.problems.push({ scope, path: relativePath(ws, file), code: 'filename_mismatch', message: 'The decrypted id does not match the file name; ignored.' })
          continue
        }
        if (!accept(ws, loaded, result)) continue
        result.notes.push(loaded)
      } catch (error) {
        result.problems.push(problemFrom(ws, scope, file, error))
      }
      continue
    }
    try {
      const raw = safeRead(file)
      if (!raw) continue
      const loaded = loadFromRaw(ws, scope, file, raw)
      if (`${loaded.id}.md` !== entry.name) {
        result.problems.push({ scope, path: loaded.path, code: 'filename_mismatch', id: loaded.id, message: 'The file name differs from the note id. The note still loads by id.' })
      }
      if (!accept(ws, loaded, result)) continue
      result.notes.push(loaded)
    } catch (error) {
      result.problems.push(problemFrom(ws, scope, file, error))
    }
  }
  return result
}

function accept(ws: KnowledgeWorkspace, loaded: LoadedNote, result: ScanResult): boolean {
  if (loaded.note.meta.brand_slug && loaded.note.meta.brand_slug !== ws.brandSlug) {
    result.problems.push({ scope: loaded.scope, path: loaded.path, code: 'wrong_brand', id: loaded.id, message: 'This note belongs to another brand. It is excluded.' })
    return false
  }
  return true
}

export function scanAll(ws: KnowledgeWorkspace, scopes: NoteScope[] = ['local', 'shared'], opts: { decrypt?: boolean } = {}): ScanResult {
  const out: ScanResult = { notes: [], problems: [], restricted_locked: 0 }
  for (const scope of scopes) {
    const part = scanScope(ws, scope, opts)
    out.notes.push(...part.notes)
    out.problems.push(...part.problems)
    out.restricted_locked += part.restricted_locked
  }
  return out
}

function loadById(ws: KnowledgeWorkspace, scope: NoteScope, id: string): LoadedNote | null {
  const file = noteFile(ws, scope, id)
  if (!dirUsable(ws, path.dirname(file))) return null
  const sealed = safeRead(file, scope === 'restricted' ? KNOWLEDGE_LIMITS.maxNoteBytes * 2 : KNOWLEDGE_LIMITS.maxNoteBytes)
  if (!sealed) return null
  const plain = scope === 'restricted' ? decryptNote(id, sealed) : sealed
  const loaded = loadFromRaw(ws, scope, file, plain)
  // The filename and the id inside are validated independently: a file named after one id that carries
  // another is not that note.
  if (loaded.id !== id) return null
  if (loaded.note.meta.brand_slug && loaded.note.meta.brand_slug !== ws.brandSlug) return null
  return loaded
}

/**
 * Finds a note by id. Restricted notes are looked up only when `includeRestricted` is set (owner CLI); then the
 * data key is required. A note that exists in two scopes (an interrupted share) is refused for writes.
 */
export function findNote(ws: KnowledgeWorkspace, id: string, opts: { includeRestricted?: boolean; scopes?: NoteScope[]; strict?: boolean } = {}): LoadedNote {
  assertId(id)
  const scopes = opts.scopes ?? (opts.includeRestricted ? (['shared', 'local', 'restricted'] as NoteScope[]) : (['shared', 'local'] as NoteScope[]))
  const found: LoadedNote[] = []
  for (const scope of scopes) {
    const direct = loadById(ws, scope, id)
    if (direct) found.push(direct)
  }
  if (found.length === 0 || opts.strict) {
    // A person may have renamed or copied the file; the id inside is what counts. Writes (strict) always
    // scan, so a second copy with the same id is found and the write refused.
    for (const scope of scopes.filter((item) => item !== 'restricted')) {
      for (const hit of scanScope(ws, scope).notes) if (hit.id === id && !found.some((note) => note.file === hit.file)) found.push(hit)
    }
  }
  if (found.length === 0) {
    if (!opts.includeRestricted && fs.existsSync(noteFile(ws, 'restricted', id))) {
      throw new KnowledgeError('not_found', `No readable note ${id} here. Restricted notes are shown only by the owner CLI with --scope restricted.`)
    }
    throw new KnowledgeError('not_found', `No note ${id} in this brand.`)
  }
  if (found.length > 1) throw new KnowledgeError('duplicate_id', `Note ${id} exists in more than one place (${found.map((note) => note.path).join(', ')}). Run brand:knowledge doctor.`)
  return found[0]!
}

export function noteExists(ws: KnowledgeWorkspace, id: string): boolean {
  if (!isNoteId(id)) return false
  for (const scope of ['shared', 'local', 'restricted'] as NoteScope[]) {
    try {
      if (fs.existsSync(noteFile(ws, scope, id))) return true
    } catch {
      return false
    }
  }
  return scanAll(ws).notes.some((note) => note.id === id)
}

// ---- snapshots ---------------------------------------------------------------------------------------

function snapshotDir(ws: KnowledgeWorkspace, id: string): string {
  assertId(id)
  return path.join(dirOf(ws, 'revisions'), id)
}

/** Keeps the previous bytes of a note before it is changed. Restricted snapshots stay encrypted. */
function snapshot(ws: KnowledgeWorkspace, loaded: LoadedNote): void {
  const dir = snapshotDir(ws, loaded.id)
  ensureDir(ws, dir)
  const stamp = ws.now().toISOString().replace(/[:.]/g, '-')
  const plain = Buffer.from(loaded.raw, 'utf8')
  const ext = loaded.scope === 'restricted' ? 'enc' : 'md'
  const name = `${stamp}_${loaded.revision.slice(0, 16)}_${crypto.randomBytes(3).toString('hex')}.${ext}`
  writeVaultFile(ws, path.join(dir, name), loaded.scope === 'restricted' ? encryptNote(loaded.id, plain, 'snapshot') : plain, true)
  const all = fs.readdirSync(dir).filter((entry) => /\.(md|enc)$/.test(entry)).sort()
  for (const old of all.slice(0, Math.max(0, all.length - KNOWLEDGE_LIMITS.snapshotsPerNote))) fs.rmSync(path.join(dir, old), { force: true })
}

export interface SnapshotInfo {
  revision: string
  saved_at: string
  file: string
}

export function noteHistory(ws: KnowledgeWorkspace, id: string): SnapshotInfo[] {
  const dir = snapshotDir(ws, id)
  if (!dirUsable(ws, dir)) return []
  const out: SnapshotInfo[] = []
  for (const name of fs.readdirSync(dir).sort().reverse()) {
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)_[0-9a-f]{16}_[0-9a-f]{6}\.(md|enc)$/.exec(name)
    if (!match) continue
    try {
      const sealed = safeRead(path.join(dir, name), KNOWLEDGE_LIMITS.maxNoteBytes * 2)
      if (!sealed) continue
      const plain = match[2] === 'enc' ? decryptNote(id, sealed, 'snapshot') : sealed
      const stamp = match[1]!.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, 'T$1:$2:$3.$4Z')
      out.push({ revision: revisionOf(plain), saved_at: stamp, file: name })
    } catch {
      // An unreadable snapshot is skipped; doctor reports nothing secret about it.
    }
  }
  return out
}

function readSnapshot(ws: KnowledgeWorkspace, id: string, revision: string): string {
  if (!/^[0-9a-f]{12,64}$/.test(revision)) throw new KnowledgeError('invalid_input', 'A revision is a sha256 hex string (at least 12 characters).')
  const hit = noteHistory(ws, id).find((item) => item.revision.startsWith(revision))
  if (!hit) throw new KnowledgeError('not_found', `No saved snapshot ${revision.slice(0, 16)} for ${id}.`)
  const sealed = safeRead(path.join(snapshotDir(ws, id), hit.file), KNOWLEDGE_LIMITS.maxNoteBytes * 2)!
  return decodeNote(hit.file.endsWith('.enc') ? decryptNote(id, sealed, 'snapshot') : sealed)
}

// ---- writing -----------------------------------------------------------------------------------------

function persist(ws: KnowledgeWorkspace, scope: NoteScope, id: string, text: string, file?: string): { file: string; revision: string } {
  const plain = Buffer.from(text, 'utf8')
  if (plain.length > KNOWLEDGE_LIMITS.maxNoteBytes) throw new KnowledgeError('too_large', `The note would be larger than ${KNOWLEDGE_LIMITS.maxNoteBytes} bytes. Nothing was written.`)
  const target = file ?? noteFile(ws, scope, id)
  writeVaultFile(ws, target, scope === 'restricted' ? encryptNote(id, plain) : plain, scope !== 'shared')
  return { file: target, revision: revisionOf(plain) }
}

let questionCache: { root: string; ids: Set<string> } | null = null

/** Question ids that exist in this brand's question bank. Notes may only link to real ids. */
export function knownQuestionIds(ws: KnowledgeWorkspace): Set<string> {
  if (questionCache?.root === ws.root) return questionCache.ids
  const ids = new Set(new InterviewEngine(ws.root).questions().map((question) => question.id))
  questionCache = { root: ws.root, ids }
  return ids
}

/** Forget the cached question bank (tests switch brands in one process). */
export function resetKnowledgeCaches(): void {
  questionCache = null
}

function checkQuestionIds(ws: KnowledgeWorkspace, ids: string[]): string[] {
  const shaped = validateQuestionIdShape(ids)
  const known = knownQuestionIds(ws)
  const unknown = shaped.filter((id) => !known.has(id))
  if (unknown.length) throw new KnowledgeError('invalid_input', `Unknown question id(s): ${unknown.join(', ')}. Use ids from brand/interview/question-bank; nothing was invented.`)
  return shaped
}

function checkLinks(ws: KnowledgeWorkspace, links: NoteLink[], self: string): NoteLink[] {
  const valid = validateLinks(links, self)
  const missing = valid.filter((link) => !noteExists(ws, link.id))
  if (missing.length) throw new KnowledgeError('invalid_input', `Linked note(s) not found: ${missing.map((link) => link.id).join(', ')}.`)
  return valid
}

export interface CaptureInput {
  title?: string
  body: string
  kind?: NoteKind
  status?: Exclude<NoteStatus, 'archived'>
  language?: string | null
  tags?: string[]
  links?: NoteLink[]
  question_ids?: string[]
  source?: { kind?: NoteSourceKind; ref?: string | null }
  classification?: NoteClassification
}

export interface CaptureResult {
  id: string
  scope: NoteScope
  path: string
  revision: string
  title: string
  warnings: string[]
}

function titleFromBody(body: string): string {
  const line = body.split('\n').map((item) => item.replace(/^#+\s*/, '').trim()).find(Boolean) ?? ''
  return line.length > 80 ? `${line.slice(0, 79)}…` : line
}

/**
 * Creates a note. Default scope is local (untracked, private). `classification: restricted` stores it
 * encrypted instead. Text that looks like a credential is refused unless it goes to the encrypted store.
 */
export function captureNote(ws: KnowledgeWorkspace, input: CaptureInput): CaptureResult {
  const body = cleanText(input.body ?? '')
  const title = validateTitle(input.title?.trim() ? input.title : titleFromBody(body))
  const classification = input.classification ?? 'internal'
  if (!['internal', 'restricted'].includes(classification)) throw new KnowledgeError('invalid_input', 'Classification must be internal or restricted.')
  const kind = input.kind ?? 'idea'
  if (!(NOTE_KINDS as readonly string[]).includes(kind)) throw new KnowledgeError('invalid_input', `Kind must be one of ${NOTE_KINDS.join(', ')}.`)
  const status = input.status ?? 'inbox'
  if (!['inbox', 'triaged', 'active'].includes(status)) throw new KnowledgeError('invalid_input', 'A new note starts as inbox, triaged or active.')
  const sourceKind = input.source?.kind ?? 'owner_note'
  if (!(SOURCE_KINDS_NOTE as readonly string[]).includes(sourceKind)) throw new KnowledgeError('invalid_input', `Source kind must be one of ${SOURCE_KINDS_NOTE.join(', ')}.`)
  const sourceRef = input.source?.ref ? cleanText(input.source.ref).slice(0, KNOWLEDGE_LIMITS.maxSourceRefChars) : null
  const scope: NoteScope = classification === 'restricted' ? 'restricted' : 'local'
  const warnings: string[] = []
  if (scope !== 'restricted') {
    const credentials = credentialFindings(`${title}\n${body}\n${sourceRef ?? ''}`)
    if (credentials.length) {
      throw new KnowledgeError('refused', `This text looks like it contains ${credentials.join(', ')}. Plain-text notes never hold secrets. Remove it, or capture with --classification restricted (encrypted, needs BRAND_OS_DATA_KEY). Nothing was written.`)
    }
  }
  const id = newNoteId()
  const now = ws.now().toISOString()
  const meta: NoteMeta = {
    schema_version: NOTE_SCHEMA_VERSION,
    id,
    brand_slug: ws.brandSlug,
    title,
    kind,
    status,
    classification,
    language: validateLanguage(input.language),
    tags: validateTags(input.tags ?? []),
    links: checkLinks(ws, input.links ?? [], id),
    question_ids: checkQuestionIds(ws, input.question_ids ?? []),
    source: { kind: sourceKind, ref: sourceRef },
    created_at: now,
    updated_at: now,
  }
  const text = serializeNote({ meta, body })
  if (scope === 'restricted' && !restrictedKeyAvailable()) {
    throw new KnowledgeError('key_required', 'BRAND_OS_DATA_KEY is required to store a restricted note (it is encrypted). Nothing was written.')
  }
  const file = noteFile(ws, scope, id)
  if (fs.existsSync(file)) throw new KnowledgeError('duplicate_id', 'Id collision. Nothing was written; try again.')
  const saved = persist(ws, scope, id, text)
  return { id, scope, path: relativePath(ws, saved.file), revision: saved.revision, title, warnings }
}

export type EditOp =
  | { op: 'replace'; find: string; replace: string }
  | { op: 'insert_after'; anchor: string; text: string }
  | { op: 'insert_before'; anchor: string; text: string }
  | { op: 'replace_body'; body: string }
  | {
      op: 'set'
      title?: string
      kind?: NoteKind
      status?: Exclude<NoteStatus, 'archived'>
      language?: string | null
      tags?: string[]
      add_tags?: string[]
      remove_tags?: string[]
      question_ids?: string[]
      links?: NoteLink[]
      add_links?: NoteLink[]
      source_ref?: string | null
    }

export interface WriteResult {
  id: string
  scope: NoteScope
  path: string
  previous_revision: string
  revision: string
  changed: boolean
}

function uniqueIndex(body: string, anchor: string): number {
  if (!anchor) throw new KnowledgeError('invalid_input', 'An empty anchor matches everywhere. Nothing was changed.')
  const first = body.indexOf(anchor)
  if (first === -1) throw new KnowledgeError('anchor_missing', 'The anchor text was not found in the note. Nothing was changed.')
  if (body.indexOf(anchor, first + 1) !== -1) throw new KnowledgeError('anchor_ambiguous', 'The anchor text appears more than once. Use a longer, unique anchor. Nothing was changed.')
  return first
}

function applyOps(ws: KnowledgeWorkspace, note: ParsedNote, ops: EditOp[]): { meta: NoteMeta; body: string } {
  const meta: NoteMeta = structuredClone(note.meta)
  let body = note.body
  for (const op of ops) {
    if (op.op === 'replace') {
      const at = uniqueIndex(body, op.find)
      body = body.slice(0, at) + cleanText(op.replace) + body.slice(at + op.find.length)
    } else if (op.op === 'insert_after') {
      const at = uniqueIndex(body, op.anchor) + op.anchor.length
      body = body.slice(0, at) + cleanText(op.text) + body.slice(at)
    } else if (op.op === 'insert_before') {
      const at = uniqueIndex(body, op.anchor)
      body = body.slice(0, at) + cleanText(op.text) + body.slice(at)
    } else if (op.op === 'replace_body') {
      body = cleanText(op.body)
    } else if (op.op === 'set') {
      if (op.title !== undefined) meta.title = validateTitle(op.title)
      if (op.kind !== undefined) {
        if (!(NOTE_KINDS as readonly string[]).includes(op.kind)) throw new KnowledgeError('invalid_input', `Kind must be one of ${NOTE_KINDS.join(', ')}.`)
        meta.kind = op.kind
      }
      if (op.status !== undefined) {
        if (!(NOTE_STATUSES as readonly string[]).includes(op.status) || op.status === ('archived' as NoteStatus)) {
          throw new KnowledgeError('invalid_input', 'Use archive and restore to move a note in or out of archived.')
        }
        if (meta.status === 'archived') throw new KnowledgeError('invalid_input', 'The note is archived. Restore it first.')
        meta.status = op.status
      }
      if (op.language !== undefined) meta.language = validateLanguage(op.language)
      if (op.tags !== undefined) meta.tags = validateTags(op.tags)
      if (op.add_tags) meta.tags = validateTags([...meta.tags, ...op.add_tags])
      if (op.remove_tags) {
        const remove = new Set(validateTags(op.remove_tags))
        meta.tags = meta.tags.filter((tag) => !remove.has(tag))
      }
      if (op.question_ids !== undefined) meta.question_ids = checkQuestionIds(ws, op.question_ids)
      if (op.links !== undefined) meta.links = checkLinks(ws, op.links, meta.id)
      if (op.add_links) meta.links = checkLinks(ws, [...meta.links, ...op.add_links], meta.id)
      if (op.source_ref !== undefined) meta.source = { ...meta.source, ref: op.source_ref ? cleanText(op.source_ref).slice(0, KNOWLEDGE_LIMITS.maxSourceRefChars) : null }
    } else {
      throw new KnowledgeError('invalid_input', 'Unknown edit operation.')
    }
  }
  return { meta, body }
}

function assertRevision(loaded: LoadedNote, expected: string | undefined, required: boolean): void {
  if (expected === undefined || expected === '') {
    if (required) throw new KnowledgeError('invalid_input', `This change needs --expected-revision. The current revision of ${loaded.id} is ${loaded.revision}.`)
    return
  }
  if (!/^[0-9a-f]{64}$/.test(expected)) throw new KnowledgeError('invalid_input', 'The expected revision must be the full 64-character sha256 from show.')
  if (expected !== loaded.revision) {
    throw new KnowledgeError('stale_revision', `The note changed since you read it (current revision ${loaded.revision}). Nothing was written. Read it again and redo the edit.`)
  }
}

function credentialGuard(scope: NoteScope, text: string): void {
  if (scope === 'restricted') return
  const found = credentialFindings(text)
  if (found.length) throw new KnowledgeError('refused', `The result would contain ${found.join(', ')} in a plain-text note. Nothing was written.`)
}

function commit(ws: KnowledgeWorkspace, loaded: LoadedNote, next: { meta: NoteMeta; body: string }): WriteResult {
  const text = serializeNote({ meta: next.meta, body: next.body, extra: loaded.note.extra })
  if (text === loaded.raw) return { id: loaded.id, scope: loaded.scope, path: loaded.path, previous_revision: loaded.revision, revision: loaded.revision, changed: false }
  credentialGuard(loaded.scope, text)
  if (Buffer.byteLength(text, 'utf8') > KNOWLEDGE_LIMITS.maxNoteBytes) throw new KnowledgeError('too_large', `The note would be larger than ${KNOWLEDGE_LIMITS.maxNoteBytes} bytes. Nothing was written.`)
  snapshot(ws, loaded)
  const saved = persist(ws, loaded.scope, loaded.id, text, loaded.file)
  return { id: loaded.id, scope: loaded.scope, path: loaded.path, previous_revision: loaded.revision, revision: saved.revision, changed: true }
}

function mutate(
  ws: KnowledgeWorkspace,
  id: string,
  opts: { expectedRevision?: string; requireRevision: boolean; includeRestricted?: boolean },
  change: (loaded: LoadedNote) => { meta: NoteMeta; body: string } | 'noop',
): WriteResult {
  assertId(id)
  return withLock(ws, id, () => {
    const loaded = findNote(ws, id, { includeRestricted: opts.includeRestricted, strict: true })
    assertRevision(loaded, opts.expectedRevision, opts.requireRevision)
    const next = change(loaded)
    if (next === 'noop') return { id, scope: loaded.scope, path: loaded.path, previous_revision: loaded.revision, revision: loaded.revision, changed: false }
    next.meta.updated_at = ws.now().toISOString()
    return commit(ws, loaded, next)
  })
}

/**
 * Revision-checked edit. Every operation is applied to a copy; if any fails (stale revision, missing or
 * ambiguous anchor, invalid metadata) nothing is written.
 */
export function editNote(ws: KnowledgeWorkspace, id: string, input: { expectedRevision: string; ops: EditOp[]; includeRestricted?: boolean }): WriteResult {
  if (!Array.isArray(input.ops) || input.ops.length === 0) throw new KnowledgeError('invalid_input', 'No edit given.')
  return mutate(ws, id, { expectedRevision: input.expectedRevision, requireRevision: true, includeRestricted: input.includeRestricted }, (loaded) => applyOps(ws, loaded.note, input.ops))
}

// ---- append with idempotency --------------------------------------------------------------------------

interface IdempotencyFile {
  format: 'brand-os-knowledge-idempotency/1'
  entries: Record<string, { note_id: string; at: string; revision: string }>
}

function idempotencyFile(ws: KnowledgeWorkspace): string {
  return path.join(dirOf(ws, 'privateRoot'), 'idempotency.json')
}

function readIdempotency(ws: KnowledgeWorkspace): IdempotencyFile {
  const empty: IdempotencyFile = { format: 'brand-os-knowledge-idempotency/1', entries: {} }
  try {
    if (!dirUsable(ws, dirOf(ws, 'privateRoot'))) return empty
    const raw = safeRead(idempotencyFile(ws), 8 * 1024 * 1024)
    if (!raw) return empty
    const doc = JSON.parse(raw.toString('utf8')) as IdempotencyFile
    return doc.format === empty.format && doc.entries && typeof doc.entries === 'object' ? doc : empty
  } catch {
    return empty
  }
}

function idempotencyHash(ws: KnowledgeWorkspace, id: string, key: string): string {
  return crypto.createHash('sha256').update(`${ws.brandSlug}\0${id}\0${key}`).digest('hex')
}

export interface AppendResult extends WriteResult {
  duplicate: boolean
}

/**
 * Appends a paragraph. With an idempotency key, a retry of the same append (same note, same key) within 30
 * days does nothing and reports `duplicate: true`. The key is stored only as a hash.
 */
export function appendNote(ws: KnowledgeWorkspace, id: string, input: { text: string; idempotencyKey?: string; expectedRevision?: string; includeRestricted?: boolean }): AppendResult {
  const text = cleanText(input.text ?? '').replace(/\s+$/, '')
  if (!text) throw new KnowledgeError('invalid_input', 'Nothing to append.')
  const key = input.idempotencyKey
  if (key !== undefined && (key.length < 1 || key.length > 200)) throw new KnowledgeError('invalid_input', 'An idempotency key is 1–200 characters.')
  return withLock(ws, '_idempotency', () => {
    const store = readIdempotency(ws)
    const hash = key ? idempotencyHash(ws, id, key) : null
    if (hash && store.entries[hash]) {
      const current = findNote(ws, id, { includeRestricted: input.includeRestricted })
      return { id, scope: current.scope, path: current.path, previous_revision: current.revision, revision: current.revision, changed: false, duplicate: true }
    }
    const result = mutate(ws, id, { expectedRevision: input.expectedRevision, requireRevision: false, includeRestricted: input.includeRestricted }, (loaded) => {
      const body = loaded.note.body.replace(/\s+$/, '')
      return { meta: structuredClone(loaded.note.meta), body: body ? `${body}\n\n${text}\n` : `${text}\n` }
    })
    if (hash) {
      const cutoff = ws.now().getTime() - KNOWLEDGE_LIMITS.idempotencyRetentionDays * 86_400_000
      const kept = Object.entries(store.entries)
        .filter(([, entry]) => Date.parse(entry.at) >= cutoff)
        .sort((a, b) => a[1].at.localeCompare(b[1].at))
        .slice(-(KNOWLEDGE_LIMITS.idempotencyMaxEntries - 1))
      const entries = Object.fromEntries(kept)
      entries[hash] = { note_id: id, at: ws.now().toISOString(), revision: result.revision }
      writeVaultFile(ws, idempotencyFile(ws), `${JSON.stringify({ format: store.format, entries })}\n`, true)
    }
    return { ...result, duplicate: false }
  })
}

// ---- archive / restore / recover ----------------------------------------------------------------------

/** Reversible. Nothing is deleted; approved facts that cite the note are not touched. */
export function archiveNote(ws: KnowledgeWorkspace, id: string, opts: { expectedRevision?: string; includeRestricted?: boolean } = {}): WriteResult {
  return mutate(ws, id, { expectedRevision: opts.expectedRevision, requireRevision: false, includeRestricted: opts.includeRestricted }, (loaded) => {
    if (loaded.note.meta.status === 'archived') return 'noop'
    const meta = structuredClone(loaded.note.meta)
    meta.archived_from = meta.status as Exclude<NoteStatus, 'archived'>
    meta.status = 'archived'
    return { meta, body: loaded.note.body }
  })
}

export function restoreNote(ws: KnowledgeWorkspace, id: string, opts: { expectedRevision?: string; includeRestricted?: boolean } = {}): WriteResult {
  return mutate(ws, id, { expectedRevision: opts.expectedRevision, requireRevision: false, includeRestricted: opts.includeRestricted }, (loaded) => {
    if (loaded.note.meta.status !== 'archived') return 'noop'
    const meta = structuredClone(loaded.note.meta)
    meta.status = meta.archived_from ?? 'inbox'
    delete meta.archived_from
    return { meta, body: loaded.note.body }
  })
}

/** Puts a saved snapshot back. The current text is itself snapshotted first, so recovery is reversible. */
export function recoverNote(ws: KnowledgeWorkspace, id: string, input: { revision: string; expectedRevision: string; includeRestricted?: boolean }): WriteResult {
  return mutate(ws, id, { expectedRevision: input.expectedRevision, requireRevision: true, includeRestricted: input.includeRestricted }, () => {
    const old = parseNote(readSnapshot(ws, id, input.revision))
    if (old.meta.id !== id) throw new KnowledgeError('invalid_note', 'That snapshot belongs to another note.')
    return { meta: { ...old.meta, status: old.meta.status }, body: old.body }
  })
}

/** Moves a note between local and shared. Used by share/unshare; keeps id, metadata and body. */
export function moveNote(ws: KnowledgeWorkspace, loaded: LoadedNote, to: 'local' | 'shared', expectedRevision: string): WriteResult {
  return withLock(ws, loaded.id, () => {
    const current = findNote(ws, loaded.id, { strict: true })
    assertRevision(current, expectedRevision, true)
    if (current.scope === to) throw new KnowledgeError('refused', `The note is already ${to}.`)
    if (current.scope === 'restricted') throw new KnowledgeError('refused', 'Restricted notes never move out of the encrypted store.')
    const target = noteFile(ws, to, current.id)
    if (fs.existsSync(target)) throw new KnowledgeError('duplicate_id', `${relativePath(ws, target)} already exists. Nothing was moved.`)
    snapshot(ws, current)
    const saved = persist(ws, to, current.id, current.raw, target)
    fs.rmSync(current.file, { force: true })
    return { id: current.id, scope: to, path: relativePath(ws, saved.file), previous_revision: current.revision, revision: saved.revision, changed: true }
  })
}

export function ensureLocalDirs(ws: KnowledgeWorkspace): void {
  ensureDir(ws, dirOf(ws, 'local'))
}
