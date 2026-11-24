import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import type { ApprovalService, BatchItemResult, PendingKind, PlanDecision, PlanEntry, Selection } from './approval.js'
import { approveAssets } from './asset-approval.js'
import { readEvidence } from './evidence.js'
import { approvalProofMatches } from './private-store.js'

/**
 * `brand:approve --all-pending` (BOS-01): one proof for every pending fact, change proposal, evidence item and draft
 * asset. It owns no approval rule of its own. Facts and changes go through `ApprovalService.approveBatch`, evidence
 * through `ApprovalService.reviewEvidence`, assets through `approveAssets`; each keeps its own checks. This module
 * only lists what is pending, applies `--exclude`, and reports every item as approved, skipped, refused or stale.
 *
 * Invariants: a wrong or missing proof writes nothing (checked once, before any write); a dry run never needs a proof
 * and never writes; tentative drafts and template example assets are never approved in bulk.
 */

export const PENDING_KINDS: readonly PendingKind[] = ['fact', 'change', 'evidence', 'asset']

export type AllPendingOutcome = 'approved' | 'skipped' | 'refused' | 'stale'

export interface AllPendingItem {
  kind: PendingKind
  id: string
  question_id: string | null
  outcome: AllPendingOutcome
  reason: string
}

export interface AllPendingResult {
  mode: 'approve'
  dry_run: false
  ok: boolean
  /** `not_needed` when nothing was approvable: no proof was read and nothing was written. */
  proof: 'accepted' | 'rejected' | 'not_needed'
  approved: number
  counts: Record<AllPendingOutcome, number>
  results: AllPendingItem[]
  /** --exclude ids that matched nothing pending. */
  unmatched_excludes: string[]
}

export interface AllPendingPlan {
  entries: PlanEntry[]
  unmatched_excludes: string[]
}

const ASSET_PENDING = new Set(['draft', 'in_review'])

/** Template example and placeholder assets ship with every new brand. They are never approved in bulk. */
function isTemplateExample(asset: Record<string, unknown>): boolean {
  const tags = Array.isArray(asset.tags) ? asset.tags.map(String) : []
  const license = typeof asset.license === 'string' ? asset.license : ''
  const name = typeof asset.name === 'string' ? asset.name : ''
  return tags.includes('example') || tags.includes('placeholder') || /^EXAMPLE/i.test(license) || /^EXAMPLE\b/.test(name)
}

function assetEntries(root: string): PlanEntry[] {
  const file = path.join(root, 'brand', 'assets', 'asset-manifest.yaml')
  if (!fs.existsSync(file)) return []
  const manifest = parse(fs.readFileSync(file, 'utf8')) as { assets?: Array<Record<string, unknown>> } | null
  const entries: PlanEntry[] = []
  for (const asset of manifest?.assets ?? []) {
    const id = typeof asset.id === 'string' ? asset.id : null
    const status = typeof asset.status === 'string' ? asset.status : 'draft'
    if (!id || !ASSET_PENDING.has(status)) continue
    if (asset.present !== true) continue
    if (isTemplateExample(asset)) {
      entries.push({ kind: 'asset', id, question_id: null, decision: 'skip', reason: 'Template example or placeholder. Never approved in bulk; approve it by id with brand:assets approve only if it is really yours.' })
      continue
    }
    entries.push({ kind: 'asset', id, question_id: null, decision: 'approve', reason: 'Draft asset. Approval records these exact bytes after the checksum and SVG checks pass.' })
  }
  return entries
}

function evidenceEntries(root: string): PlanEntry[] {
  return readEvidence(root)
    .filter((item) => item.status === 'pending')
    .map((item) => ({
      kind: 'evidence' as const,
      id: item.id,
      question_id: item.claim_id,
      decision: 'approve' as const,
      reason: `Pending ${item.kind} (${item.source_type}) for ${item.claim_id}. Verifying marks it verified; it does not publish.`,
    }))
}

/** Everything pending, grouped by kind order, with `--exclude` applied. Reads only. */
export function planAllPending(approvals: ApprovalService, root: string, options: { exclude?: string[]; actor?: string } = {}): AllPendingPlan {
  const entries = [...approvals.approvalPlan({}, { actor: options.actor, skipTentative: true }), ...evidenceEntries(root), ...assetEntries(root)]
  const exclude = new Set((options.exclude ?? []).map((id) => id.trim()).filter(Boolean))
  const matched = new Set<string>()
  const planned = entries.map((entry): PlanEntry => {
    if (!exclude.has(entry.id)) return entry
    matched.add(entry.id)
    return { ...entry, decision: 'skip', reason: 'Excluded with --exclude.' }
  })
  planned.sort((a, b) => PENDING_KINDS.indexOf(a.kind) - PENDING_KINDS.indexOf(b.kind))
  return { entries: planned, unmatched_excludes: [...exclude].filter((id) => !matched.has(id)) }
}

function outcomeOf(decision: Exclude<PlanDecision, 'approve'>): AllPendingOutcome {
  return decision === 'stale' ? 'stale' : decision === 'refuse' ? 'refused' : 'skipped'
}

function fromBatch(item: BatchItemResult | undefined): Pick<AllPendingItem, 'outcome' | 'reason'> {
  if (!item) return { outcome: 'refused', reason: 'No result was reported for this item.' }
  if (item.outcome === 'approved') return { outcome: 'approved', reason: item.reason }
  if (item.outcome === 'stale') return { outcome: 'stale', reason: item.reason }
  if (item.outcome === 'skipped') return { outcome: 'skipped', reason: item.reason }
  return { outcome: 'refused', reason: item.reason }
}

/**
 * Approve the plan with one proof. A wrong or missing proof refuses every item before anything is written.
 * Each kind is handed to its own existing approval path; nothing here decides whether an item may be approved.
 */
export function approveAllPending(approvals: ApprovalService, root: string, plan: AllPendingPlan, proof: string | undefined, actor = 'owner'): AllPendingResult {
  const counts: Record<AllPendingOutcome, number> = { approved: 0, skipped: 0, refused: 0, stale: 0 }
  const finish = (results: AllPendingItem[], proofState: AllPendingResult['proof']): AllPendingResult => {
    for (const item of results) counts[item.outcome] += 1
    return {
      mode: 'approve',
      dry_run: false,
      ok: proofState !== 'rejected' && counts.refused === 0,
      proof: proofState,
      approved: counts.approved,
      counts,
      results,
      unmatched_excludes: plan.unmatched_excludes,
    }
  }
  const unchanged = (entry: PlanEntry): AllPendingItem => ({ kind: entry.kind, id: entry.id, question_id: entry.question_id, outcome: entry.decision === 'approve' ? 'refused' : outcomeOf(entry.decision), reason: entry.reason })
  if (!plan.entries.some((entry) => entry.decision === 'approve')) return finish(plan.entries.map(unchanged), 'not_needed')
  if (!approvalProofMatches(root, proof)) {
    return finish(
      plan.entries.map((entry) => ({ kind: entry.kind, id: entry.id, question_id: entry.question_id, outcome: 'refused', reason: 'Approval proof rejected. Nothing was changed.' })),
      'rejected',
    )
  }
  const byId = new Map<string, Pick<AllPendingItem, 'outcome' | 'reason'>>()
  const factIds = plan.entries.filter((entry) => entry.decision === 'approve' && (entry.kind === 'fact' || entry.kind === 'change')).map((entry) => entry.id)
  if (factIds.length > 0) {
    const batch = approvals.approveBatch({ ids: factIds } satisfies Selection, proof, actor)
    for (const id of factIds) byId.set(`fact:${id}`, fromBatch(batch.results.find((item) => item.id === id)))
  }
  for (const entry of plan.entries.filter((item) => item.decision === 'approve' && item.kind === 'evidence')) {
    try {
      const reviewed = approvals.reviewEvidence(entry.id, 'verified', proof, null, actor)
      byId.set(`evidence:${entry.id}`, { outcome: reviewed.ok ? 'approved' : 'refused', reason: reviewed.message + (reviewed.unpublished.length ? ` Unpublished: ${reviewed.unpublished.join(', ')}.` : '') })
    } catch (error) {
      byId.set(`evidence:${entry.id}`, { outcome: 'refused', reason: error instanceof Error ? error.message : 'Evidence review failed.' })
    }
  }
  const assetIds = plan.entries.filter((entry) => entry.decision === 'approve' && entry.kind === 'asset').map((entry) => entry.id)
  if (assetIds.length > 0) {
    const assets = approveAssets(root, assetIds, proof, actor)
    for (const id of assetIds) {
      const item = assets.results.find((result) => result.id === id)
      byId.set(`asset:${id}`, !item ? { outcome: 'refused', reason: 'No result was reported for this asset.' } : item.outcome === 'approved' ? { outcome: 'approved', reason: item.reason } : item.outcome === 'unchanged' ? { outcome: 'skipped', reason: item.reason } : { outcome: 'refused', reason: item.reason })
    }
  }
  const results = plan.entries.map((entry): AllPendingItem => {
    const base = { kind: entry.kind, id: entry.id, question_id: entry.question_id }
    if (entry.decision !== 'approve') return { ...base, outcome: outcomeOf(entry.decision), reason: entry.reason }
    const done = byId.get(`${entry.kind === 'change' ? 'fact' : entry.kind}:${entry.id}`)
    return { ...base, ...(done ?? { outcome: 'refused' as const, reason: 'No result was reported for this item.' }) }
  })
  return finish(results, 'accepted')
}

// ---- dry run (BOS-07) -------------------------------------------------------------------------

export interface DryRunItem {
  kind: PendingKind
  id: string
  question_id: string | null
  decision: 'would_approve' | 'would_skip'
  /** Set when the item would be skipped because its proposal is stale or the reviewer is refused. */
  because: 'stale' | 'refused' | 'skipped' | null
  reason: string
}

export interface DryRunReport {
  mode: 'dry_run'
  dry_run: true
  nothing_changed: true
  notice: string
  would_approve: number
  would_skip: number
  items: DryRunItem[]
  unmatched_excludes: string[]
}

export function dryRunNotice(count: number): string {
  return `DRY RUN: ${count} item${count === 1 ? '' : 's'} would be approved. Nothing was changed.`
}

/** A preview that cannot be mistaken for the review queue or for an approval result. */
export function dryRunReport(entries: PlanEntry[], unmatchedExcludes: string[] = []): DryRunReport {
  const items = entries.map((entry): DryRunItem => ({
    kind: entry.kind,
    id: entry.id,
    question_id: entry.question_id,
    decision: entry.decision === 'approve' ? 'would_approve' : 'would_skip',
    because: entry.decision === 'approve' ? null : entry.decision === 'stale' ? 'stale' : entry.decision === 'refuse' ? 'refused' : 'skipped',
    reason: entry.reason,
  }))
  const count = items.filter((item) => item.decision === 'would_approve').length
  return { mode: 'dry_run', dry_run: true, nothing_changed: true, notice: dryRunNotice(count), would_approve: count, would_skip: items.length - count, items, unmatched_excludes: unmatchedExcludes }
}

const KIND_TITLES: Record<PendingKind, string> = { fact: 'Facts', change: 'Change proposals', evidence: 'Evidence awaiting verification', asset: 'Draft assets' }

function grouped<T extends { kind: PendingKind }>(items: T[], line: (item: T) => string): string[] {
  const lines: string[] = []
  for (const kind of PENDING_KINDS) {
    const rows = items.filter((item) => item.kind === kind)
    if (rows.length === 0) continue
    lines.push('', `${KIND_TITLES[kind]} (${rows.length})`, ...rows.map(line))
  }
  return lines
}

export function formatDryRun(report: DryRunReport): string {
  const lines = [report.notice, 'This is a preview: not the review queue and not an approval result. No proof was read.']
  if (report.items.length === 0) lines.push('', 'Nothing is pending.')
  lines.push(...grouped(report.items, (item) => `  ${(item.decision === 'would_approve' ? 'would approve' : `would skip${item.because === 'stale' ? ' (stale)' : item.because === 'refused' ? ' (refused)' : ''}`).padEnd(24)} ${item.id}  ${item.reason}`))
  if (report.unmatched_excludes.length) lines.push('', `--exclude matched nothing pending: ${report.unmatched_excludes.join(', ')}`)
  lines.push('', `${report.notice} Run the same command without --dry-run to approve.`)
  return lines.join('\n')
}

export function formatAllPending(result: AllPendingResult): string {
  const lines =
    result.proof === 'rejected'
      ? ['APPROVAL REFUSED: proof rejected. Nothing was changed.']
      : result.proof === 'not_needed'
        ? ['NOTHING TO APPROVE: no proof was read and nothing was changed.']
      : [`APPROVAL RESULT: ${result.counts.approved} approved, ${result.counts.skipped} skipped, ${result.counts.refused} refused, ${result.counts.stale} stale. Nothing was published.`]
  if (result.results.length === 0) lines.push('', 'Nothing is pending.')
  lines.push(...grouped(result.results, (item) => `  ${item.outcome.padEnd(9)} ${item.id}  ${item.reason}`))
  if (result.unmatched_excludes.length) lines.push('', `--exclude matched nothing pending: ${result.unmatched_excludes.join(', ')}`)
  return lines.join('\n')
}
