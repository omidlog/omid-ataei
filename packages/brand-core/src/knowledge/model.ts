import crypto from 'node:crypto'
import { parse, stringify } from 'yaml'

/**
 * Knowledge notes: the owner's unstructured ideas, research and meeting notes.
 *
 * A note is information to consider. It is never an approved or published brand fact, whoever wrote it.
 * The file is plain UTF-8 Markdown with YAML frontmatter. Identity is the `id` in the frontmatter, not the
 * filename or the title. The revision is computed by the reader (`sha256` of the raw bytes) and is never
 * stored inside the note, so a hand-edited revision field cannot be trusted by accident.
 */

export const NOTE_SCHEMA_VERSION = 1
export const NOTE_KINDS = ['idea', 'research', 'reference', 'meeting', 'decision_draft', 'general'] as const
export const NOTE_STATUSES = ['inbox', 'triaged', 'active', 'archived'] as const
export const NOTE_CLASSIFICATIONS = ['internal', 'restricted'] as const
export const NOTE_SCOPES = ['local', 'shared', 'restricted'] as const
export const LINK_RELATIONSHIPS = ['related', 'supports', 'contradicts', 'supersedes'] as const
/**
 * Where the words came from. `owner_note` and `meeting` are the owner's own words. `research` and
 * `imported_text` are third-party material: never owner authority. `agent_capture` is an agent recording
 * what the owner said in a conversation.
 */
export const SOURCE_KINDS_NOTE = ['owner_note', 'meeting', 'agent_capture', 'research', 'imported_text'] as const

export type NoteKind = (typeof NOTE_KINDS)[number]
export type NoteStatus = (typeof NOTE_STATUSES)[number]
export type NoteClassification = (typeof NOTE_CLASSIFICATIONS)[number]
export type NoteScope = (typeof NOTE_SCOPES)[number]
export type LinkRelationship = (typeof LINK_RELATIONSHIPS)[number]
export type NoteSourceKind = (typeof SOURCE_KINDS_NOTE)[number]

export const KNOWLEDGE_LIMITS = {
  /** Raw bytes of one note file. */
  maxNoteBytes: 1024 * 1024,
  maxTitleChars: 200,
  maxTags: 30,
  maxTagChars: 48,
  maxLinks: 100,
  maxQuestionIds: 50,
  maxSourceRefChars: 200,
  maxResults: 50,
  maxSnippetChars: 1000,
  defaultSnippetChars: 240,
  maxNotesScanned: 20_000,
  snapshotsPerNote: 20,
  idempotencyRetentionDays: 30,
  idempotencyMaxEntries: 5000,
} as const

/** New ids: `kn_` + a random UUID v4. Hand-written notes may use any id matching NOTE_ID. */
export const NOTE_ID = /^kn_[a-z0-9][a-z0-9-]{2,63}$/
/** Note filenames the store reads. One level deep, no hidden files. Same rule Studio applies. */
export const NOTE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.md$/
export const RESTRICTED_FILENAME = /^kn_[a-z0-9][a-z0-9-]{2,63}\.enc$/
const QUESTION_ID = /^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/
const TAG = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u
const LANGUAGE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/

export function newNoteId(): string {
  return `kn_${crypto.randomUUID()}`
}

export function isNoteId(value: unknown): value is string {
  return typeof value === 'string' && NOTE_ID.test(value)
}

export interface NoteLink {
  id: string
  relationship: LinkRelationship
}

export interface NoteSource {
  kind: NoteSourceKind
  ref: string | null
}

export interface NoteMeta {
  schema_version: number
  id: string
  brand_slug: string
  title: string
  kind: NoteKind
  status: NoteStatus
  classification: NoteClassification
  language: string | null
  tags: string[]
  links: NoteLink[]
  question_ids: string[]
  source: NoteSource
  created_at: string
  updated_at: string
  /** Status before archiving, so restore returns the note where it was. */
  archived_from?: Exclude<NoteStatus, 'archived'>
}

export interface ParsedNote {
  meta: NoteMeta
  body: string
  /** Keys a person added by hand. Kept on rewrite so editing a note never drops them. */
  extra: Record<string, unknown>
  /** Validation problems by field name. Never contains note text. */
  issues: string[]
}

export class KnowledgeError extends Error {
  constructor(
    readonly code:
      | 'not_found'
      | 'invalid_id'
      | 'invalid_input'
      | 'invalid_note'
      | 'too_large'
      | 'stale_revision'
      | 'anchor_missing'
      | 'anchor_ambiguous'
      | 'locked'
      | 'unsafe_path'
      | 'refused'
      | 'key_required'
      | 'not_a_brand'
      | 'duplicate_id',
    message: string,
  ) {
    super(message)
    this.name = 'KnowledgeError'
  }
}

export function revisionOf(raw: Buffer | string): string {
  return crypto.createHash('sha256').update(typeof raw === 'string' ? Buffer.from(raw, 'utf8') : raw).digest('hex')
}

/** Normalizes user-supplied text: removes a BOM, applies NFC. Content is otherwise preserved byte for byte. */
export function cleanText(text: string): string {
  return text.replace(/^\uFEFF/, '').normalize('NFC')
}

/** Refuses binary data and invalid UTF-8. Returns the decoded text. */
export function decodeNote(raw: Buffer): string {
  if (raw.length > KNOWLEDGE_LIMITS.maxNoteBytes) throw new KnowledgeError('too_large', `The note is larger than ${KNOWLEDGE_LIMITS.maxNoteBytes} bytes.`)
  if (raw.includes(0)) throw new KnowledgeError('invalid_note', 'The note contains binary data (a NUL byte).')
  const text = raw.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(raw)) throw new KnowledgeError('invalid_note', 'The note is not valid UTF-8.')
  return text
}

export function normalizeTag(tag: string): string {
  return tag.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g, '-')
}

export function validateTags(tags: string[]): string[] {
  const out: string[] = []
  for (const raw of tags) {
    const tag = normalizeTag(raw)
    if (!tag) continue
    if (tag.length > KNOWLEDGE_LIMITS.maxTagChars || !TAG.test(tag)) throw new KnowledgeError('invalid_input', `Tag "${tag.slice(0, 48)}" is not allowed. Use letters, digits, - and _.`)
    if (!out.includes(tag)) out.push(tag)
  }
  if (out.length > KNOWLEDGE_LIMITS.maxTags) throw new KnowledgeError('invalid_input', `At most ${KNOWLEDGE_LIMITS.maxTags} tags.`)
  return out
}

export function validateTitle(title: string): string {
  const clean = cleanText(title).replace(/\s+/g, ' ').trim()
  if (!clean) throw new KnowledgeError('invalid_input', 'A note needs a title.')
  if (clean.length > KNOWLEDGE_LIMITS.maxTitleChars) throw new KnowledgeError('invalid_input', `The title is longer than ${KNOWLEDGE_LIMITS.maxTitleChars} characters.`)
  return clean
}

export function validateLanguage(language: string | null | undefined): string | null {
  if (language === null || language === undefined || language === '') return null
  if (!LANGUAGE.test(language)) throw new KnowledgeError('invalid_input', 'Language must be a code such as en, fa or tr.')
  return language
}

export function validateQuestionIdShape(ids: string[]): string[] {
  const out = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (out.length > KNOWLEDGE_LIMITS.maxQuestionIds) throw new KnowledgeError('invalid_input', `At most ${KNOWLEDGE_LIMITS.maxQuestionIds} question ids.`)
  for (const id of out) if (!QUESTION_ID.test(id) || id.length > 120) throw new KnowledgeError('invalid_input', `"${id.slice(0, 120)}" is not a question id.`)
  return out
}

export function validateLinks(links: NoteLink[], self?: string): NoteLink[] {
  const out: NoteLink[] = []
  for (const link of links) {
    if (!isNoteId(link.id)) throw new KnowledgeError('invalid_input', 'A link must point at a note id (kn_…).')
    if (!(LINK_RELATIONSHIPS as readonly string[]).includes(link.relationship)) throw new KnowledgeError('invalid_input', `Relationship must be one of ${LINK_RELATIONSHIPS.join(', ')}.`)
    if (link.id === self) throw new KnowledgeError('invalid_input', 'A note cannot link to itself.')
    if (!out.some((item) => item.id === link.id && item.relationship === link.relationship)) out.push({ id: link.id, relationship: link.relationship })
  }
  if (out.length > KNOWLEDGE_LIMITS.maxLinks) throw new KnowledgeError('invalid_input', `At most ${KNOWLEDGE_LIMITS.maxLinks} links.`)
  return out
}

/** `--link kn_x` or `--link kn_x:supports`. */
export function parseLinkArg(value: string): NoteLink {
  const [id = '', relationship = 'related'] = value.split(':')
  return { id: id.trim(), relationship: relationship.trim() as LinkRelationship }
}

const KNOWN_KEYS = new Set([
  'schema_version',
  'id',
  'brand_slug',
  'title',
  'kind',
  'status',
  'classification',
  'language',
  'tags',
  'links',
  'question_ids',
  'source',
  'created_at',
  'updated_at',
  'archived_from',
])

function splitFrontmatter(text: string): { yaml: string; body: string } | null {
  const clean = text.replace(/^\uFEFF/, '')
  if (!clean.startsWith('---\n') && !clean.startsWith('---\r\n')) return null
  const rest = clean.slice(clean.indexOf('\n') + 1)
  const match = /^---[ \t]*\r?$/m.exec(rest)
  if (!match) return null
  const yaml = rest.slice(0, match.index)
  let body = rest.slice(match.index + match[0].length)
  body = body.replace(/^\r?\n/, '')
  if (body.startsWith('\n')) body = body.slice(1)
  return { yaml, body }
}

function isoOr(value: unknown, fallback: string, issues: string[], field: string): string {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString()
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  issues.push(`${field}: missing or not a timestamp`)
  return fallback
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T, issues: string[], field: string): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T
  if (value !== undefined) issues.push(`${field}: must be one of ${allowed.join(', ')}`)
  else issues.push(`${field}: missing`)
  return fallback
}

/**
 * Lenient parser: a hand-written note with only an id and a title still loads. Missing or invalid fields get
 * safe defaults and an entry in `issues` (shown by `doctor`, fixed by `migrate`). An unusable note (no
 * frontmatter, no valid id, unreadable YAML) throws without echoing its content.
 */
export function parseNote(text: string): ParsedNote {
  const split = splitFrontmatter(text)
  if (!split) throw new KnowledgeError('invalid_note', 'The note has no YAML frontmatter (it must start with ---).')
  let doc: unknown
  try {
    doc = parse(split.yaml, { maxAliasCount: 0 })
  } catch {
    throw new KnowledgeError('invalid_note', 'The note frontmatter is not valid YAML.')
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new KnowledgeError('invalid_note', 'The note frontmatter is not a mapping.')
  const raw = doc as Record<string, unknown>
  if (!isNoteId(raw.id)) throw new KnowledgeError('invalid_note', 'The note has no valid id (kn_…).')
  const issues: string[] = []
  const epoch = new Date(0).toISOString()
  if (raw.schema_version !== NOTE_SCHEMA_VERSION) issues.push('schema_version: missing or unsupported')
  let title = typeof raw.title === 'string' ? raw.title.replace(/\s+/g, ' ').trim() : ''
  if (!title) {
    issues.push('title: missing')
    title = raw.id
  } else if (title.length > KNOWLEDGE_LIMITS.maxTitleChars) {
    issues.push('title: too long')
    title = title.slice(0, KNOWLEDGE_LIMITS.maxTitleChars)
  }
  let tags: string[] = []
  if (raw.tags !== undefined) {
    try {
      tags = validateTags(Array.isArray(raw.tags) ? raw.tags.map(String) : [])
      if (!Array.isArray(raw.tags)) issues.push('tags: must be a list')
    } catch {
      issues.push('tags: invalid')
    }
  }
  let links: NoteLink[] = []
  if (raw.links !== undefined) {
    try {
      if (!Array.isArray(raw.links)) throw new Error('not a list')
      links = validateLinks(
        raw.links.map((item) => (typeof item === 'string' ? parseLinkArg(item) : { id: String((item as NoteLink)?.id ?? ''), relationship: ((item as NoteLink)?.relationship ?? 'related') as LinkRelationship })),
        raw.id,
      )
    } catch {
      issues.push('links: invalid')
    }
  }
  let questionIds: string[] = []
  if (raw.question_ids !== undefined) {
    try {
      questionIds = validateQuestionIdShape(Array.isArray(raw.question_ids) ? raw.question_ids.map(String) : [])
    } catch {
      issues.push('question_ids: invalid')
    }
  }
  let language: string | null = null
  try {
    language = validateLanguage(typeof raw.language === 'string' ? raw.language : null)
  } catch {
    issues.push('language: invalid')
  }
  const sourceRaw = raw.source && typeof raw.source === 'object' ? (raw.source as Record<string, unknown>) : {}
  if (!raw.source) issues.push('source: missing')
  const source: NoteSource = {
    kind: oneOf(sourceRaw.kind, SOURCE_KINDS_NOTE, 'owner_note', raw.source ? issues : [], 'source.kind'),
    ref: typeof sourceRaw.ref === 'string' ? sourceRaw.ref.slice(0, KNOWLEDGE_LIMITS.maxSourceRefChars) : null,
  }
  const createdAt = isoOr(raw.created_at, epoch, issues, 'created_at')
  const status = oneOf(raw.status, NOTE_STATUSES, 'inbox', issues, 'status')
  const meta: NoteMeta = {
    schema_version: NOTE_SCHEMA_VERSION,
    id: raw.id,
    brand_slug: typeof raw.brand_slug === 'string' ? raw.brand_slug : '',
    title,
    kind: oneOf(raw.kind, NOTE_KINDS, 'general', issues, 'kind'),
    status,
    classification: oneOf(raw.classification, NOTE_CLASSIFICATIONS, 'internal', issues, 'classification'),
    language,
    tags,
    links,
    question_ids: questionIds,
    source,
    created_at: createdAt,
    updated_at: isoOr(raw.updated_at, createdAt, issues, 'updated_at'),
  }
  if (!meta.brand_slug) issues.push('brand_slug: missing')
  if (status === 'archived') {
    const from = raw.archived_from
    meta.archived_from = typeof from === 'string' && ['inbox', 'triaged', 'active'].includes(from) ? (from as NoteMeta['archived_from']) : 'inbox'
  }
  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) if (!KNOWN_KEYS.has(key)) extra[key] = value
  return { meta, body: split.body, extra, issues }
}

/** Deterministic serialization with a fixed key order. */
export function serializeNote(note: { meta: NoteMeta; body: string; extra?: Record<string, unknown> }): string {
  const m = note.meta
  const ordered: Record<string, unknown> = {
    schema_version: NOTE_SCHEMA_VERSION,
    id: m.id,
    brand_slug: m.brand_slug,
    title: m.title,
    kind: m.kind,
    status: m.status,
    ...(m.status === 'archived' && m.archived_from ? { archived_from: m.archived_from } : {}),
    classification: m.classification,
    language: m.language,
    tags: m.tags,
    links: m.links,
    question_ids: m.question_ids,
    source: { kind: m.source.kind, ref: m.source.ref },
    created_at: m.created_at,
    updated_at: m.updated_at,
    ...(note.extra ?? {}),
  }
  const yaml = stringify(ordered, { lineWidth: 0 })
  const body = note.body.endsWith('\n') || note.body === '' ? note.body : `${note.body}\n`
  return `---\n${yaml}---\n\n${body}`
}

/** `[[kn_…]]` references in a body. */
export function bodyLinks(body: string): string[] {
  const out = new Set<string>()
  for (const match of body.matchAll(/\[\[(kn_[a-z0-9][a-z0-9-]{2,63})\]\]/g)) out.add(match[1]!)
  return [...out]
}

/** Every note this note points at, typed links first. */
export function outboundLinks(note: ParsedNote): NoteLink[] {
  const out = [...note.meta.links]
  for (const id of bodyLinks(note.body)) if (id !== note.meta.id && !out.some((link) => link.id === id)) out.push({ id, relationship: 'related' })
  return out
}
