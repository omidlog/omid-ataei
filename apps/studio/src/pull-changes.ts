import type { PullFile } from './github/client.js'

/**
 * BOS-02: what an open pull request would change, as counts only.
 *
 * Studio reads the pull request's file list (GET only) and counts the records it touches in the files that carry
 * brand facts, evidence and assets. Nothing from a branch is stored or shown: no value, no file name, no diff line.
 * The counts are unmerged and never canonical; the brand pages keep showing the merged default branch.
 */
export interface PullChanges {
  /** Files the pull request changes (as GitHub listed them). */
  files: number
  /** Answer-ledger records added, changed or removed. */
  facts: number
  /** Evidence register and evidence index entries. */
  evidence: number
  /** Asset manifest rows. */
  assets: number
  /** Every other changed file (asset files, documents, code). */
  other: number
  /** True when a count is a lower bound: GitHub left out a large diff or the file list was cut short. */
  partial: boolean
}

const FACT_FILES = new Set(['brand/interview/answer-ledger.yaml'])
const EVIDENCE_FILES = new Set(['brand/interview/evidence-register.yaml', 'brand/interview/evidence-index.yaml'])
const ASSET_FILES = new Set(['brand/assets/asset-manifest.yaml'])

/** A top-level list item of a brand YAML file (`  - answer_id: …`, `  - id: …`), as Brand OS writes them. */
const RECORD_START = /^ {0,2}- ([A-Za-z_][\w-]*):\s*(.*)$/

/**
 * Distinct records a unified diff touches. A changed line belongs to the nearest record start above it in the hunk;
 * a change before any record start in its hunk counts as one record for that hunk.
 */
export function recordsTouched(patch: string): number {
  const touched = new Set<string>()
  let current: string | null = null
  let hunk = 0
  let orphan = false
  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) {
      hunk += 1
      current = null
      orphan = false
      continue
    }
    if (line.startsWith('\\')) continue
    const marker = line[0]
    const body = line.slice(1)
    const start = RECORD_START.exec(body)
    if (start) current = `${start[1]}=${start[2]}`
    if (marker !== '+' && marker !== '-') continue
    if (current) touched.add(current)
    else if (!orphan) {
      orphan = true
      touched.add(`#hunk-${hunk}`)
    }
  }
  return touched.size
}

export function countPullChanges(files: PullFile[], truncated: boolean): PullChanges {
  const out: PullChanges = { files: files.length, facts: 0, evidence: 0, assets: 0, other: 0, partial: truncated }
  for (const file of files) {
    const kind = FACT_FILES.has(file.filename) ? 'facts' : EVIDENCE_FILES.has(file.filename) ? 'evidence' : ASSET_FILES.has(file.filename) ? 'assets' : 'other'
    if (kind === 'other') {
      out.other += 1
      continue
    }
    if (file.patch === null) {
      // GitHub omits the diff of a very large change: the file changed, the record count is unknown.
      out[kind] += 1
      out.partial = true
      continue
    }
    out[kind] += Math.max(1, recordsTouched(file.patch))
  }
  return out
}
