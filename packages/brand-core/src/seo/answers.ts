import path from 'node:path'
import { KnowledgeError } from '../knowledge/model.js'
import { captureNote } from '../knowledge/store.js'
import { dirUsable, ensureDir, safeRead, withLock, writeVaultFile, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import { assertOwnerProcess } from '../research/store.js'
import { SeoError, validateAnswer, type AnswerValue, type Answers } from './interview.js'

/**
 * SEO interview answers: a small typed record in brand/.private/strategy/seo/interview.json (gitignored).
 *
 * The record holds closed-vocabulary values and, when the owner said more, a reference to a Knowledge note with
 * their verbatim words. It never holds the words themselves. A changed answer keeps its history.
 */

export const SEO_DIR = 'brand/.private/strategy/seo'
export const INTERVIEW_FILE = `${SEO_DIR}/interview.json`

export interface AnswerEntry {
  value: AnswerValue
  note: { id: string; revision: string } | null
  answered_at: string
  history: Array<{ value: AnswerValue; note: { id: string; revision: string } | null; answered_at: string }>
}

export interface InterviewRecord {
  schema_version: 1
  kind: 'seo_interview'
  brand_slug: string
  answers: Record<string, AnswerEntry>
  updated_at: string
}

function file(ws: KnowledgeWorkspace): string {
  return path.join(ws.root, ...INTERVIEW_FILE.split('/'))
}

export function readInterview(ws: KnowledgeWorkspace): InterviewRecord {
  assertOwnerProcess()
  const target = file(ws)
  const empty: InterviewRecord = { schema_version: 1, kind: 'seo_interview', brand_slug: ws.brandSlug, answers: {}, updated_at: ws.now().toISOString() }
  if (!dirUsable(ws, path.dirname(target))) return empty
  let raw: Buffer | null
  try {
    raw = safeRead(target, 1024 * 1024)
  } catch (error) {
    if (error instanceof KnowledgeError) throw new SeoError('refused', error.message)
    throw error
  }
  if (!raw) return empty
  let doc: InterviewRecord
  try {
    doc = JSON.parse(raw.toString('utf8')) as InterviewRecord
  } catch {
    throw new SeoError('invalid_record', 'interview.json is not valid JSON.')
  }
  if (doc?.kind !== 'seo_interview' || typeof doc.answers !== 'object') throw new SeoError('invalid_record', 'interview.json is not an SEO interview record.')
  if (doc.brand_slug !== ws.brandSlug) throw new SeoError('wrong_brand', 'interview.json belongs to another brand. It is not read.')
  return doc
}

export function answersOf(record: InterviewRecord): Answers {
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

/**
 * Records one answer. `words`, when given, are the owner's verbatim words: they become a local Knowledge note
 * (source owner_note, tag seo-interview) and the record cites its id and revision.
 */
export function recordAnswer(ws: KnowledgeWorkspace, input: { question_id: string; value: unknown; words?: string; language?: string | null }): { entry: AnswerEntry; changed_from: AnswerValue | null } {
  assertOwnerProcess()
  const value = validateAnswer(input.question_id, input.value)
  let note: AnswerEntry['note'] = null
  if (input.words !== undefined && input.words.trim()) {
    try {
      const captured = captureNote(ws, {
        title: `SEO interview: ${input.question_id}`,
        body: input.words,
        kind: 'meeting',
        language: input.language ?? null,
        tags: ['seo-interview'],
        source: { kind: 'owner_note', ref: `seo-interview:${input.question_id}` },
      })
      note = { id: captured.id, revision: captured.revision }
    } catch (error) {
      if (error instanceof KnowledgeError) throw new SeoError(error.code === 'refused' ? 'refused' : 'invalid_input', error.message)
      throw error
    }
  }
  return withLock(ws, 'seo-interview', () => {
    const record = readInterview(ws)
    const now = ws.now().toISOString()
    const previous = record.answers[input.question_id]
    const entry: AnswerEntry = {
      value,
      note,
      answered_at: now,
      history: previous ? [...previous.history, { value: previous.value, note: previous.note, answered_at: previous.answered_at }].slice(-20) : [],
    }
    record.answers[input.question_id] = entry
    record.updated_at = now
    ensureDir(ws, path.dirname(file(ws)))
    writeVaultFile(ws, file(ws), `${JSON.stringify(record, null, 2)}\n`, true)
    return { entry, changed_from: previous ? previous.value : null }
  })
}
