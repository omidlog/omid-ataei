import type { KnowledgeWorkspace } from '../knowledge/workspace.js'
import { answersOf, readInterview } from '../seo/answers.js'
import { UNKNOWN } from '../seo/interview.js'
import { CompetitiveError, nameKey } from './model.js'
import { addCandidate, assertOwnerProcess, scanCandidates } from './store.js'

/**
 * Bridges `seo.competitors.named` (owner assumptions from the SEO interview) into the competitor index, only when the
 * owner runs the command. Each new name becomes a `candidate` with source `seo_interview`: no domain, no market, no
 * evidence. A name that already matches a candidate is reported, never merged or changed. The SEO interview record is
 * only read. Nothing here turns a name into search evidence.
 */

/** The owner's answer to seo.competitors.named, or [] when unanswered or answered `unknown`. */
export function seoNamedCompetitors(ws: KnowledgeWorkspace): string[] {
  const value = answersOf(readInterview(ws))['seo.competitors.named']
  if (!value || value === UNKNOWN) return []
  return Array.isArray(value) ? value : [value]
}

export interface SeoImportResult {
  name: string
  outcome: 'added' | 'would_add' | 'exists' | 'refused'
  competitor_id: string | null
  reason: string | null
}

export function importSeoNames(ws: KnowledgeWorkspace, opts: { dryRun?: boolean } = {}): { results: SeoImportResult[]; interview: 'read' | 'not_answered' } {
  assertOwnerProcess()
  const names = seoNamedCompetitors(ws)
  if (!names.length) return { results: [], interview: 'not_answered' }
  const results: SeoImportResult[] = []
  const seen = new Map<string, string | null>()
  for (const record of scanCandidates(ws).records) if (!seen.has(record.name_key)) seen.set(record.name_key, record.competitor_id)
  for (const name of names) {
    const key = nameKey(name)
    if (seen.has(key)) {
      results.push({ name, outcome: 'exists', competitor_id: seen.get(key) ?? null, reason: null })
      continue
    }
    if (opts.dryRun) {
      seen.set(key, null)
      results.push({ name, outcome: 'would_add', competitor_id: null, reason: null })
      continue
    }
    try {
      const record = addCandidate(ws, { display_name: name, source: 'seo_interview' })
      seen.set(key, record.competitor_id)
      results.push({ name, outcome: 'added', competitor_id: record.competitor_id, reason: null })
    } catch (error) {
      if (!(error instanceof CompetitiveError)) throw error
      results.push({ name, outcome: 'refused', competitor_id: null, reason: `${error.code}: ${error.message}` })
    }
  }
  return { results, interview: 'read' }
}
