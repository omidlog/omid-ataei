import type { InterviewEngine } from '../engine.js'
import { outboundLinks, type LinkRelationship, type NoteKind, type NoteStatus, NOTE_STATUSES } from './model.js'
import { safetyBlocksSharing, safetyReport } from './safety.js'
import { APPROVAL_STATE, buildIndex } from './search.js'
import type { LoadProblem } from './store.js'
import { normalizeForSearch, snippetFor, tokenize } from './text.js'
import { openWorkspace } from './workspace.js'

/**
 * The read-only Studio projection of a brand's shared notes.
 *
 * Studio builds it on the server from an extracted checkout of the merged default branch, where the
 * extraction already admits only `brand/knowledge/shared/*.md`. This function reads the shared scope
 * only (never local or restricted), writes nothing (no cache), and withholds every note that is not
 * clearly safe to show: wrong brand, restricted classification, anything the share checks would refuse
 * (credentials, personal private data, restricted financial or legal passages), malformed files. A
 * withheld note is listed by path and reason only, never with its text.
 */

export const STUDIO_KNOWLEDGE_LIMITS = {
  maxNotes: 1000,
  maxBodyChars: 12_000,
  /** Sum of all projected bodies; beyond it, notes keep their excerpt only. */
  maxTotalBodyChars: 3_000_000,
  excerptChars: 280,
  maxWithheld: 200,
} as const

export type WithheldReason =
  | 'invalid_note'
  | 'wrong_brand'
  | 'filename_mismatch'
  | 'unexpected_file'
  | 'symlink'
  | 'unreadable'
  | 'restricted_classification'
  | 'credentials'
  | 'personal_data'
  | 'restricted_passage'

export interface StudioNoteLink {
  id: string
  relationship: LinkRelationship
  /** Title only when the target is a projected shared note. */
  title: string | null
  exists: boolean
}

export interface StudioQuestionRef {
  id: string
  label: string | null
  module: string | null
  /** False for an id that is not in the brand's question bank (shown as unknown, never invented). */
  known: boolean
}

export interface StudioNote {
  id: string
  path: string
  title: string
  kind: NoteKind
  status: NoteStatus
  tags: string[]
  language: string | null
  source_kind: string
  created_at: string
  updated_at: string
  revision: string
  question_ids: StudioQuestionRef[]
  excerpt: string
  /** Null when the projection's body budget was used up; the excerpt and GitHub link remain. */
  body: string | null
  body_truncated: boolean
  outbound: StudioNoteLink[]
  inbound: StudioNoteLink[]
  approval_state: typeof APPROVAL_STATE
}

export interface StudioKnowledgeProjection {
  schema_version: 1
  total: number
  by_status: Record<NoteStatus, number>
  notes: StudioNote[]
  /** True when more notes exist than Studio projects. */
  truncated: boolean
  withheld: Array<{ path: string; reason: WithheldReason }>
}

const PROBLEM_REASON: Partial<Record<LoadProblem['code'], WithheldReason>> = {
  invalid_note: 'invalid_note',
  wrong_brand: 'wrong_brand',
  filename_mismatch: 'filename_mismatch',
  unexpected_file: 'unexpected_file',
  symlink: 'symlink',
  unreadable: 'unreadable',
}

function excerptOf(body: string, max: number): string {
  const text = body.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function buildStudioKnowledge(engine: InterviewEngine): StudioKnowledgeProjection {
  const ws = openWorkspace(engine.workspaceRoot())
  const state = buildIndex(ws, { scopes: ['shared'], writeCache: false })
  const withheld: StudioKnowledgeProjection['withheld'] = []
  for (const problem of state.problems) {
    const reason = PROBLEM_REASON[problem.code]
    if (reason) withheld.push({ path: problem.path, reason })
  }
  const questions = new Map(engine.questions().map((question) => [question.id, question]))
  const safe = state.notes.filter((note) => {
    const loaded = note.loaded
    if (loaded.note.meta.classification !== 'internal') {
      withheld.push({ path: loaded.path, reason: 'restricted_classification' })
      return false
    }
    const report = safetyReport(`${loaded.note.meta.title}\n${loaded.note.meta.tags.join(' ')}\n${loaded.note.meta.source.ref ?? ''}\n${loaded.note.body}`)
    if (safetyBlocksSharing(report).length) {
      withheld.push({ path: loaded.path, reason: report.credentials.length ? 'credentials' : report.personal.length ? 'personal_data' : 'restricted_passage' })
      return false
    }
    return true
  })
  safe.sort((a, b) => b.loaded.note.meta.updated_at.localeCompare(a.loaded.note.meta.updated_at) || a.loaded.id.localeCompare(b.loaded.id))
  const projected = safe.slice(0, STUDIO_KNOWLEDGE_LIMITS.maxNotes)
  const titles = new Map(projected.map((note) => [note.loaded.id, note.loaded.note.meta.title]))
  const allIds = new Set(state.notes.map((note) => note.loaded.id))
  const linkView = (id: string, relationship: LinkRelationship): StudioNoteLink => ({ id, relationship, title: titles.get(id) ?? null, exists: allIds.has(id) })
  const inbound = new Map<string, StudioNoteLink[]>()
  for (const note of projected) {
    for (const link of outboundLinks(note.loaded.note)) {
      if (!titles.has(link.id) || link.id === note.loaded.id) continue
      const list = inbound.get(link.id) ?? []
      list.push(linkView(note.loaded.id, link.relationship))
      inbound.set(link.id, list)
    }
  }
  let budget: number = STUDIO_KNOWLEDGE_LIMITS.maxTotalBodyChars
  const byStatus = Object.fromEntries(NOTE_STATUSES.map((status) => [status, 0])) as Record<NoteStatus, number>
  for (const note of safe) byStatus[note.loaded.note.meta.status] += 1
  const notes: StudioNote[] = projected.map(({ loaded }) => {
    const meta = loaded.note.meta
    const full = loaded.note.body
    const cut = full.length > STUDIO_KNOWLEDGE_LIMITS.maxBodyChars ? full.slice(0, STUDIO_KNOWLEDGE_LIMITS.maxBodyChars) : full
    const body = cut.length <= budget ? cut : null
    if (body !== null) budget -= body.length
    return {
      id: loaded.id,
      path: loaded.path,
      title: meta.title,
      kind: meta.kind,
      status: meta.status,
      tags: meta.tags,
      language: meta.language,
      source_kind: meta.source.kind,
      created_at: meta.created_at,
      updated_at: meta.updated_at,
      revision: loaded.revision,
      question_ids: meta.question_ids.map((id) => {
        const question = questions.get(id)
        return { id, label: question?.label ?? null, module: question?.module ?? null, known: Boolean(question) }
      }),
      excerpt: excerptOf(full, STUDIO_KNOWLEDGE_LIMITS.excerptChars),
      body,
      body_truncated: body === null || cut.length < full.length,
      outbound: outboundLinks(loaded.note).map((link) => linkView(link.id, link.relationship)),
      inbound: inbound.get(loaded.id) ?? [],
      approval_state: APPROVAL_STATE,
    }
  })
  return {
    schema_version: 1,
    total: safe.length,
    by_status: byStatus,
    notes,
    truncated: safe.length > notes.length,
    withheld: withheld.sort((a, b) => a.path.localeCompare(b.path)).slice(0, STUDIO_KNOWLEDGE_LIMITS.maxWithheld),
  }
}

export interface StudioKnowledgeFilter {
  query?: string
  status?: NoteStatus | null
  tag?: string | null
  kind?: NoteKind | null
}

/**
 * Search and filter over an already safe projection, so it can never reach a note that was withheld or
 * never projected. Ranking matches the CLI: title phrase > exact tag > body phrase > token matches.
 * Archived notes appear only when the archived status is asked for.
 */
export function filterStudioKnowledge(projection: StudioKnowledgeProjection, filter: StudioKnowledgeFilter): Array<{ note: StudioNote; snippet: string | null }> {
  const phrase = normalizeForSearch((filter.query ?? '').slice(0, 200))
  const tokens = tokenize(phrase).slice(0, 20)
  const tag = filter.tag ? normalizeForSearch(filter.tag) : null
  const out: Array<{ note: StudioNote; snippet: string | null; score: number }> = []
  for (const note of projection.notes) {
    if (filter.status ? note.status !== filter.status : note.status === 'archived') continue
    if (filter.kind && note.kind !== filter.kind) continue
    const tags = note.tags.map((item) => normalizeForSearch(item))
    if (tag && !tags.includes(tag)) continue
    if (!phrase) {
      out.push({ note, snippet: null, score: 0 })
      continue
    }
    const title = normalizeForSearch(note.title)
    const text = normalizeForSearch(note.body ?? note.excerpt)
    const words = new Set(tokenize(`${title} ${tags.join(' ')} ${text} ${note.question_ids.map((q) => q.id).join(' ')}`))
    const present = tokens.filter((token) => words.has(token) || [...words].some((word) => word.startsWith(token)))
    let score = 0
    if (title.includes(phrase)) score += 100
    if (tags.includes(phrase)) score += 60
    if (text.includes(phrase)) score += 30
    score += present.length * 5
    if (present.length < tokens.length && score < 30) continue
    if (score === 0) continue
    out.push({ note, snippet: snippetFor(note.body ?? note.excerpt, phrase, tokens, 240), score })
  }
  out.sort((a, b) => b.score - a.score || b.note.updated_at.localeCompare(a.note.updated_at) || a.note.id.localeCompare(b.note.id))
  return out.map(({ note, snippet }) => ({ note, snippet }))
}
