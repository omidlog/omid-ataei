import fs from 'node:fs'
import path from 'node:path'
import { parse, stringify } from 'yaml'
import { latestAnswers } from './completeness.js'
import { ENGINE_VERSION } from './backup.js'
import { entitySpec, isCanonicalEntityValue, parseEntityLines, readEntityList, serializeEntityList, type EntitySpec } from './entities.js'
import type { InterviewEngine } from './engine.js'
import { writeAtomic } from './fsutil.js'

/**
 * Answer migration for `repeating_entity` questions (Visual V3.1, D3).
 *
 * A list question may hold a value that is not a canonical list: free text typed before the question became a list,
 * an imported answer or a hand edit. This migration never drops or rewrites such a value silently:
 *
 * - **Canonical already**: nothing to do.
 * - **Convertible** (the text reads as one item per line or `;`, within the item limits): a draft that is not
 *   approved is superseded by a `system` draft holding the list, with the original text kept as its raw answer and in
 *   the superseded ledger record. An **approved** fact is never touched: a pending change proposal is filed instead,
 *   and the owner approves or ignores it like any other change.
 * - **Not convertible** (too long, too many items, a money amount in a cost item …): the value stays exactly as it
 *   is and is reported as `legacy`. Readers show it as flagged legacy text (documents, Studio, canvas).
 *
 * Running it again finds nothing new to do: a converted draft is canonical, and a proposal already pending with the
 * same list is not filed twice. `dryRun` reports without writing.
 */

export interface EntityMigrationReport {
  converted: Array<{ question_id: string; outcome: 'draft' | 'proposal'; id: string | null; items: number; from_status: string }>
  legacy: Array<{ question_id: string; status: string; reason: string }>
  unchanged: string[]
  dry_run: boolean
}

function conversion(spec: EntitySpec, value: unknown): { ok: true; canonical: string; items: number } | { ok: false; reason: string } {
  const read = readEntityList(spec, value)
  if (read.state === 'items') {
    const canonical = serializeEntityList(spec, read.list)
    return { ok: true, canonical, items: read.list.items.length }
  }
  if (read.state === 'empty') return { ok: false, reason: 'empty' }
  if (read.text.trim().startsWith('{')) return { ok: false, reason: 'The value looks like a list but is not a valid one, so it was left as written.' }
  const parsed = parseEntityLines(spec, read.text, null)
  if (!parsed.ok) return { ok: false, reason: parsed.message }
  return { ok: true, canonical: serializeEntityList(spec, parsed.value), items: parsed.value.items.length }
}

export function migrateEntityAnswers(engine: InterviewEngine, options: { dryRun?: boolean } = {}): EntityMigrationReport {
  const dryRun = options.dryRun === true
  const report: EntityMigrationReport = { converted: [], legacy: [], unchanged: [], dry_run: dryRun }
  const answers = latestAnswers(engine.ledger().records)
  const pending = engine.approvals().pendingChanges()
  for (const question of engine.questions()) {
    if (question.question_type !== 'repeating_entity' || question.sensitivity === 'restricted') continue
    const spec = entitySpec(question.id)
    const latest = answers.get(question.id)
    if (!spec || !latest || latest.value === null || latest.value === undefined || latest.value === '') {
      report.unchanged.push(question.id)
      continue
    }
    if (isCanonicalEntityValue(spec, latest.value)) {
      report.unchanged.push(question.id)
      continue
    }
    const converted = conversion(spec, latest.value)
    if (!converted.ok) {
      report.legacy.push({ question_id: question.id, status: latest.status, reason: converted.reason })
      continue
    }
    const approved = latest.status === 'approved'
    if (approved && pending.some((change) => change.question_id === question.id && change.proposed_value === converted.canonical)) {
      report.unchanged.push(question.id)
      continue
    }
    if (dryRun) {
      report.converted.push({ question_id: question.id, outcome: approved ? 'proposal' : 'draft', id: null, items: converted.items, from_status: latest.status })
      continue
    }
    const recorded = engine.recordEntityConversion(question.id, converted.canonical, String(latest.value))
    report.converted.push({ question_id: question.id, outcome: recorded.outcome, id: recorded.id, items: converted.items, from_status: latest.status })
  }
  if (!dryRun && report.converted.length > 0) appendMigrationLog(engine.workspaceRoot(), report)
  return report
}

function appendMigrationLog(root: string, report: EntityMigrationReport): void {
  const file = path.join(root, 'brand', 'migrations.yaml')
  const log = fs.existsSync(file) ? (parse(fs.readFileSync(file, 'utf8')) as { schema_version?: number; applied?: unknown[] } | null) : null
  const next = log && Array.isArray(log.applied) ? log : { schema_version: 1, applied: [] as unknown[] }
  next.applied!.push({
    id: `repeating-entity@${ENGINE_VERSION}`,
    touched: ['brand/interview/answer-ledger.yaml', ...(report.converted.some((item) => item.outcome === 'proposal') ? ['brand/.private/proposals.json'] : [])],
    converted: report.converted.map((item) => `${item.question_id}:${item.outcome}`),
  })
  writeAtomic(file, stringify(next, { lineWidth: 100 }))
}

/** Plain lines for the CLI. Ids and statuses only; values are never printed. */
export function formatEntityMigration(report: EntityMigrationReport): string[] {
  const lines: string[] = []
  for (const item of report.converted) {
    lines.push(
      item.outcome === 'proposal'
        ? `List ${item.question_id}: approved free text left unchanged; ${item.id ? `filed change proposal ${item.id}` : 'would file a change proposal'} with ${item.items} item(s) for the owner to review.`
        : `List ${item.question_id}: ${report.dry_run ? 'would convert' : 'converted'} ${item.from_status} free text to a draft list of ${item.items} item(s). The original text is kept in the ledger. Not approved.`,
    )
  }
  for (const item of report.legacy) lines.push(`List ${item.question_id}: kept as legacy free text (${item.status}). ${item.reason}`)
  return lines
}
