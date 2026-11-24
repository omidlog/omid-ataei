import fs from 'node:fs'
import path from 'node:path'
import { KNOWLEDGE_LIMITS, KnowledgeError, outboundLinks, type LinkRelationship, type NoteKind, type NoteScope, type NoteStatus } from './model.js'
import { scanAll, type LoadedNote, type LoadProblem } from './store.js'
import { normalizeForSearch, snippetFor, tokenize } from './text.js'
import { dirOf, dirUsable, safeRead, writeVaultFile, type KnowledgeWorkspace } from './workspace.js'

/**
 * Search MVP: an in-process inverted match over the brand's local and shared notes. Restricted notes are
 * never indexed, cached or snippeted. The optional disk cache (brand/.private/knowledge/cache) only stores
 * derived data keyed by file size and mtime; it is rebuilt when missing or corrupt and never authoritative.
 */

export const APPROVAL_STATE = 'unapproved_idea' as const
export const SOURCE_TYPE = 'knowledge_note' as const

export interface IndexedNote {
  loaded: LoadedNote
  title: string
  body: string
  tags: string[]
  titleTokens: Set<string>
  bodyTokens: Set<string>
  extraText: string
}

const CACHE_FORMAT = 'brand-os-knowledge-cache/1'

interface CacheFile {
  format: typeof CACHE_FORMAT
  brand_slug: string
  entries: Record<string, { size: number; mtimeMs: number; revision: string }>
}

export interface IndexState {
  notes: IndexedNote[]
  problems: LoadProblem[]
  cache: 'hit' | 'rebuilt' | 'corrupt_rebuilt' | 'disabled'
}

function index(loaded: LoadedNote): IndexedNote {
  const meta = loaded.note.meta
  const title = normalizeForSearch(meta.title)
  const body = normalizeForSearch(loaded.note.body)
  return {
    loaded,
    title,
    body,
    tags: meta.tags.map((tag) => normalizeForSearch(tag)),
    titleTokens: new Set(tokenize(title)),
    bodyTokens: new Set(tokenize(body)),
    extraText: normalizeForSearch([meta.source.kind, meta.source.ref ?? '', ...meta.question_ids, ...meta.links.map((link) => link.relationship)].join(' ')),
  }
}

function cachePath(ws: KnowledgeWorkspace): string {
  return path.join(dirOf(ws, 'cache'), 'index.json')
}

export function readCache(ws: KnowledgeWorkspace): { cache: CacheFile | null; corrupt: boolean } {
  try {
    if (!dirUsable(ws, dirOf(ws, 'cache'))) return { cache: null, corrupt: false }
    const raw = safeRead(cachePath(ws), 64 * 1024 * 1024)
    if (!raw) return { cache: null, corrupt: false }
    const doc = JSON.parse(raw.toString('utf8')) as CacheFile
    if (doc.format !== CACHE_FORMAT || doc.brand_slug !== ws.brandSlug || !doc.entries || typeof doc.entries !== 'object') return { cache: null, corrupt: true }
    return { cache: doc, corrupt: false }
  } catch {
    return { cache: null, corrupt: true }
  }
}

/**
 * Loads and indexes the notes. The cache records which file states have been indexed, so `doctor` can tell a
 * stale cache; the notes themselves are always re-read from disk, which keeps results correct even if the
 * cache is wrong.
 */
export function buildIndex(ws: KnowledgeWorkspace, opts: { scopes?: Array<'local' | 'shared'>; writeCache?: boolean } = {}): IndexState {
  const scan = scanAll(ws, opts.scopes ?? ['local', 'shared'])
  const notes = scan.notes.map(index)
  let state: IndexState['cache'] = 'disabled'
  if (opts.writeCache !== false) {
    const { cache, corrupt } = readCache(ws)
    const entries: CacheFile['entries'] = {}
    let same = Boolean(cache)
    for (const note of notes) {
      try {
        const stat = fs.lstatSync(note.loaded.file)
        entries[note.loaded.path] = { size: stat.size, mtimeMs: stat.mtimeMs, revision: note.loaded.revision }
        const old = cache?.entries[note.loaded.path]
        if (!old || old.revision !== note.loaded.revision) same = false
      } catch {
        same = false
      }
    }
    if (cache && Object.keys(cache.entries).length !== Object.keys(entries).length) same = false
    state = same ? 'hit' : corrupt ? 'corrupt_rebuilt' : 'rebuilt'
    if (!same) {
      try {
        writeVaultFile(ws, cachePath(ws), `${JSON.stringify({ format: CACHE_FORMAT, brand_slug: ws.brandSlug, entries })}\n`, true)
      } catch {
        // The cache is optional.
      }
    }
  }
  return { notes, problems: scan.problems, cache: state }
}

export interface NoteFilters {
  kind?: NoteKind[]
  status?: NoteStatus[]
  tags?: string[]
  language?: string
  since?: string
  until?: string
  scope?: 'local' | 'shared' | 'all'
  question_id?: string
  include_archived?: boolean
}

export interface NoteSummary {
  id: string
  scope: NoteScope
  path: string
  title: string
  kind: NoteKind
  status: NoteStatus
  tags: string[]
  language: string | null
  question_ids: string[]
  source_kind: string
  created_at: string
  updated_at: string
  revision: string
  source_type: typeof SOURCE_TYPE
  approval_state: typeof APPROVAL_STATE
}

export function summarize(loaded: LoadedNote): NoteSummary {
  const meta = loaded.note.meta
  return {
    id: loaded.id,
    scope: loaded.scope,
    path: loaded.path,
    title: meta.title,
    kind: meta.kind,
    status: meta.status,
    tags: meta.tags,
    language: meta.language,
    question_ids: meta.question_ids,
    source_kind: meta.source.kind,
    created_at: meta.created_at,
    updated_at: meta.updated_at,
    revision: loaded.revision,
    source_type: SOURCE_TYPE,
    approval_state: APPROVAL_STATE,
  }
}

function timeOf(value: string | undefined, label: string): number | null {
  if (!value) return null
  const t = Date.parse(value)
  if (Number.isNaN(t)) throw new KnowledgeError('invalid_input', `--${label} must be a date such as 2026-11-01.`)
  return t
}

function matchesFilters(note: IndexedNote, filters: NoteFilters): boolean {
  const meta = note.loaded.note.meta
  const scope = filters.scope ?? 'all'
  if (scope !== 'all' && note.loaded.scope !== scope) return false
  if (filters.status?.length) {
    if (!filters.status.includes(meta.status)) return false
  } else if (!filters.include_archived && meta.status === 'archived') return false
  if (filters.kind?.length && !filters.kind.includes(meta.kind)) return false
  if (filters.tags?.length) {
    const wanted = filters.tags.map((tag) => normalizeForSearch(tag))
    if (!wanted.every((tag) => note.tags.includes(tag))) return false
  }
  if (filters.language && meta.language !== filters.language) return false
  if (filters.question_id && !meta.question_ids.includes(filters.question_id)) return false
  const since = timeOf(filters.since, 'since')
  const until = timeOf(filters.until, 'until')
  const updated = Date.parse(meta.updated_at)
  if (since !== null && updated < since) return false
  if (until !== null && updated > until) return false
  return true
}

function byRecent(a: IndexedNote, b: IndexedNote): number {
  return b.loaded.note.meta.updated_at.localeCompare(a.loaded.note.meta.updated_at) || a.loaded.id.localeCompare(b.loaded.id)
}

function page<T>(items: T[], limit: number | undefined, offset: number | undefined): { items: T[]; total: number; offset: number; limit: number; next_offset: number | null } {
  const size = Math.max(1, Math.min(KNOWLEDGE_LIMITS.maxResults, Math.floor(limit ?? 20)))
  const start = Math.max(0, Math.floor(offset ?? 0))
  const slice = items.slice(start, start + size)
  return { items: slice, total: items.length, offset: start, limit: size, next_offset: start + size < items.length ? start + size : null }
}

export function listNotes(ws: KnowledgeWorkspace, filters: NoteFilters = {}, paging: { limit?: number; offset?: number } = {}, state?: IndexState) {
  const built = state ?? buildIndex(ws, { scopes: filters.scope && filters.scope !== 'all' ? [filters.scope] : undefined })
  const matched = built.notes.filter((note) => matchesFilters(note, filters)).sort(byRecent)
  const result = page(matched.map((note) => summarize(note.loaded)), paging.limit, paging.offset)
  return { ...result, problems: built.problems.length, notice: 'Notes are unapproved ideas, not brand facts.' }
}

export interface SearchHit extends NoteSummary {
  score: number
  matched: string[]
  snippet: string | null
}

/**
 * Ranking: title phrase > exact tag > body phrase > token matches (title before body; prefix matches for
 * suffixing languages such as Turkish) > linked question id or source metadata. Ties: most recent first.
 */
export function scoreNote(note: IndexedNote, phrase: string, tokens: string[]): { score: number; matched: string[] } {
  if (!phrase) return { score: 1, matched: [] }
  let score = 0
  const matched = new Set<string>()
  if (note.title.includes(phrase)) {
    score += 100
    matched.add('title')
  }
  if (note.tags.includes(phrase) || tokens.some((token) => note.tags.includes(token))) {
    score += 50 * Math.max(1, tokens.filter((token) => note.tags.includes(token)).length)
    matched.add('tag')
  }
  if (note.body.includes(phrase)) {
    score += 20
    matched.add('body')
  }
  for (const token of tokens) {
    if (note.titleTokens.has(token)) {
      score += 10
      matched.add('title')
    } else if (token.length >= 3 && [...note.titleTokens].some((word) => word.startsWith(token))) {
      score += 6
      matched.add('title')
    }
    if (note.bodyTokens.has(token)) {
      score += 5
      matched.add('body')
    } else if (token.length >= 3 && [...note.bodyTokens].some((word) => word.startsWith(token))) {
      score += 3
      matched.add('body')
    }
    if (note.extraText.includes(token)) {
      score += 3
      matched.add('metadata')
    }
  }
  return { score, matched: [...matched] }
}

export function searchNotes(
  ws: KnowledgeWorkspace,
  query: string,
  filters: NoteFilters = {},
  paging: { limit?: number; offset?: number; snippetChars?: number } = {},
  state?: IndexState,
) {
  if (typeof query !== 'string' || query.length > 500) throw new KnowledgeError('invalid_input', 'A search query is at most 500 characters.')
  const phrase = normalizeForSearch(query)
  const tokens = [...new Set(tokenize(phrase))]
  const built = state ?? buildIndex(ws, { scopes: filters.scope && filters.scope !== 'all' ? [filters.scope] : undefined })
  const snippetChars = Math.max(40, Math.min(KNOWLEDGE_LIMITS.maxSnippetChars, paging.snippetChars ?? KNOWLEDGE_LIMITS.defaultSnippetChars))
  const hits = built.notes
    .filter((note) => matchesFilters(note, filters))
    .map((note) => ({ note, ...scoreNote(note, phrase, tokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || byRecent(a.note, b.note))
  const result = page(hits, paging.limit, paging.offset)
  return {
    query,
    ...result,
    items: result.items.map(
      (item): SearchHit => ({
        ...summarize(item.note.loaded),
        score: item.score,
        matched: item.matched,
        snippet: snippetFor(item.note.loaded.note.body, phrase, tokens, snippetChars),
      }),
    ),
    cache: built.cache,
    notice: 'Results are unapproved ideas (approval_state unapproved_idea), never verified brand facts.',
  }
}

// ---- duplicates, links, backlinks ---------------------------------------------------------------------

function signature(note: IndexedNote): Set<string> {
  return new Set([...note.titleTokens, ...note.tags.map((tag) => `#${tag}`)])
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let common = 0
  for (const item of a) if (b.has(item)) common += 1
  return common / (a.size + b.size - common)
}

/** Possible duplicates by normalized title and tags. Suggestions only; nothing is merged. */
export function similarNotes(ws: KnowledgeWorkspace, id: string, opts: { threshold?: number; limit?: number } = {}, state?: IndexState) {
  const built = state ?? buildIndex(ws)
  const target = built.notes.find((note) => note.loaded.id === id)
  if (!target) throw new KnowledgeError('not_found', `No note ${id} in this brand's local or shared notes.`)
  const sig = signature(target)
  const threshold = opts.threshold ?? 0.5
  return built.notes
    .filter((note) => note.loaded.id !== id)
    .map((note) => ({ note, similarity: note.title === target.title ? 1 : jaccard(sig, signature(note)) }))
    .filter((item) => item.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity || byRecent(a.note, b.note))
    .slice(0, Math.min(KNOWLEDGE_LIMITS.maxResults, opts.limit ?? 10))
    .map((item) => ({ id: item.note.loaded.id, title: item.note.loaded.note.meta.title, scope: item.note.loaded.scope, similarity: Math.round(item.similarity * 100) / 100 }))
}

export interface LinkView {
  id: string
  relationship: LinkRelationship
  exists: boolean
  /** Title and scope only for notes the caller may read; otherwise null. */
  title: string | null
  scope: NoteScope | null
}

/**
 * Outbound links (typed `links` plus `[[kn_…]]` in the body), inbound backlinks, and linked question ids.
 * `visible` limits which notes' titles may be shown (Studio and agents see shared notes only).
 */
export function backlinks(ws: KnowledgeWorkspace, id: string, opts: { visibleScopes?: NoteScope[] } = {}, state?: IndexState) {
  const built = state ?? buildIndex(ws)
  const visible = new Set(opts.visibleScopes ?? ['local', 'shared'])
  const byId = new Map(built.notes.map((note) => [note.loaded.id, note]))
  const target = byId.get(id)
  if (!target || !visible.has(target.loaded.scope)) throw new KnowledgeError('not_found', `No note ${id} in this brand.`)
  const view = (other: string, relationship: LinkRelationship): LinkView => {
    const hit = byId.get(other)
    const shown = hit && visible.has(hit.loaded.scope)
    return { id: other, relationship, exists: Boolean(hit), title: shown ? hit.loaded.note.meta.title : null, scope: shown ? hit.loaded.scope : null }
  }
  const outbound = outboundLinks(target.loaded.note).map((link) => view(link.id, link.relationship))
  const inbound: LinkView[] = []
  for (const note of built.notes) {
    if (note.loaded.id === id || !visible.has(note.loaded.scope)) continue
    const link = outboundLinks(note.loaded.note).find((item) => item.id === id)
    if (link) inbound.push(view(note.loaded.id, link.relationship))
  }
  return {
    id,
    outbound,
    inbound,
    broken: outbound.filter((link) => !link.exists).map((link) => link.id),
    question_ids: target.loaded.note.meta.question_ids,
  }
}

/** Links, backlinks, and notes that share a question id or tags with this one. */
export function relatedNotes(ws: KnowledgeWorkspace, id: string, state?: IndexState) {
  const built = state ?? buildIndex(ws)
  const links = backlinks(ws, id, {}, built)
  const target = built.notes.find((note) => note.loaded.id === id)!
  const meta = target.loaded.note.meta
  const linked = new Set([...links.outbound, ...links.inbound].map((link) => link.id))
  const shared = built.notes
    .filter((note) => note.loaded.id !== id && !linked.has(note.loaded.id) && note.loaded.note.meta.status !== 'archived')
    .map((note) => {
      const questions = note.loaded.note.meta.question_ids.filter((q) => meta.question_ids.includes(q))
      const tags = note.tags.filter((tag) => target.tags.includes(tag))
      return { note, questions, tags, score: questions.length * 3 + tags.length }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || byRecent(a.note, b.note))
    .slice(0, 20)
    .map((item) => ({ id: item.note.loaded.id, title: item.note.loaded.note.meta.title, scope: item.note.loaded.scope, shared_question_ids: item.questions, shared_tags: item.tags }))
  return { ...links, related: shared }
}
