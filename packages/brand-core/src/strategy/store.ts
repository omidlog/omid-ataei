import fs from 'node:fs'
import path from 'node:path'
import { AGENT_TOKEN_ENV } from '../agent-tokens.js'
import { readFacts } from '../facts.js'
import { KnowledgeError } from '../knowledge/model.js'
import { knowledgeRef, parseKnowledgeRef } from '../knowledge/proposals.js'
import { findNote, type LoadedNote } from '../knowledge/store.js'
import { dirUsable, ensureDir, safeRead, withLock, writeVaultFile, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import { approvalProofMatches, approvalSecretPath } from '../private-store.js'
import {
  contentBlockFactIds,
  approvalDigest,
  approvalSeal,
  contentDigest,
  newApprovalEventId,
  parseProposal,
  STRATEGY_LIMITS,
  STRATEGY_SCHEMA_VERSION,
  StrategyError,
  text,
  TYPE_AGENT,
  validateRevisionNumber,
  validateSha,
  validateStrategyId,
  type AgentKind,
  type EffectiveStatus,
  type EvidenceRef,
  type FactRef,
  type ProposalInput,
  type RevisionEntry,
  type StrategyContent,
  type StrategyRef,
  type StrategyOrigin,
  type StrategyRecord,
  type StrategyRevision,
} from './model.js'

/**
 * Strategy records live in brand/.private/strategy/records/<strategy_id>/ (gitignored; excluded from Studio, docs
 * builds and public exports): record.json is the mutable index, r0001.json, r0002.json… are immutable revisions.
 * Paths come from validated ids only; reads never follow symlinks; writes are atomic and 0600 (Knowledge workspace
 * helpers). Owner functions refuse to run under an agent token. The `load*`/`scan*` readers skip that check and are
 * used only by the feed after its own profile check (feed.ts).
 */

export const STRATEGY_RECORDS_DIR = 'brand/.private/strategy/records'

export function assertOwnerProcess(): void {
  if (process.env[AGENT_TOKEN_ENV]) throw new StrategyError('refused', `Strategy records are written and approved by the owner. Refusing while ${AGENT_TOKEN_ENV} is set.`)
}

function recordsRoot(ws: KnowledgeWorkspace): string {
  return path.join(ws.root, ...STRATEGY_RECORDS_DIR.split('/'))
}

function strategyDir(ws: KnowledgeWorkspace, id: string): string {
  return path.join(recordsRoot(ws), validateStrategyId(id))
}

function recordFile(ws: KnowledgeWorkspace, id: string): string {
  return path.join(strategyDir(ws, id), 'record.json')
}

function revisionFile(ws: KnowledgeWorkspace, id: string, revision: number): string {
  return path.join(strategyDir(ws, id), `r${String(validateRevisionNumber(revision)).padStart(4, '0')}.json`)
}

function readJson<T extends { kind: string; brand_slug: string }>(ws: KnowledgeWorkspace, file: string, kind: string): T | null {
  if (!dirUsable(ws, recordsRoot(ws)) || !dirUsable(ws, path.dirname(file))) return null
  let raw: Buffer | null
  try {
    raw = safeRead(file, STRATEGY_LIMITS.maxFileBytes)
  } catch (error) {
    if (error instanceof KnowledgeError) throw new StrategyError('unsafe_path', error.message)
    throw error
  }
  if (!raw) return null
  let doc: T
  try {
    doc = JSON.parse(raw.toString('utf8')) as T
  } catch {
    throw new StrategyError('invalid_record', `${path.basename(file)} is not valid JSON.`)
  }
  if (!doc || typeof doc !== 'object' || doc.kind !== kind) throw new StrategyError('invalid_record', `${path.basename(file)} is not a ${kind}.`)
  if (doc.brand_slug !== ws.brandSlug) throw new StrategyError('wrong_brand', `${path.basename(file)} belongs to another brand. It is not read.`)
  return doc
}

function writeJson(ws: KnowledgeWorkspace, file: string, doc: unknown): void {
  ensureDir(ws, path.dirname(file))
  writeVaultFile(ws, file, `${JSON.stringify(doc, null, 2)}\n`, true)
}

// ---- readers -----------------------------------------------------------------------------------------

/** Record without the owner-process check. Only for callers that authorized the reader (feed.ts). */
export function loadRecord(ws: KnowledgeWorkspace, id: string): StrategyRecord {
  const doc = readJson<StrategyRecord>(ws, recordFile(ws, id), 'strategy_record')
  if (!doc) throw new StrategyError('not_found', `No strategy ${id} in this brand.`)
  if (doc.strategy_id !== id || !Array.isArray(doc.revisions)) throw new StrategyError('invalid_record', `The record for ${id} is malformed or carries another id.`)
  return doc
}

export function readRecord(ws: KnowledgeWorkspace, id: string): StrategyRecord {
  assertOwnerProcess()
  return loadRecord(ws, id)
}

/**
 * A revision file, checked: its id, brand and number match, its content hashes to its stored content_sha256, and
 * (when an index entry is given) to the hash the index recorded at proposal time. Any mismatch is integrity_failed.
 */
export function loadRevision(ws: KnowledgeWorkspace, id: string, revision: number, entry?: RevisionEntry): StrategyRevision {
  const doc = readJson<StrategyRevision>(ws, revisionFile(ws, id, revision), 'strategy_revision')
  if (!doc) throw new StrategyError('not_found', `No revision ${revision} of ${id}.`)
  if (doc.strategy_id !== id || doc.revision !== revision || !doc.content || typeof doc.content !== 'object') {
    throw new StrategyError('integrity_failed', `Revision ${revision} of ${id} carries another id or number.`)
  }
  const digest = contentDigest(doc)
  if (digest !== doc.content_sha256 || (entry && entry.content_sha256 !== digest)) {
    throw new StrategyError('integrity_failed', `Revision ${revision} of ${id} changed after it was proposed (content hash mismatch). It is not served.`)
  }
  return doc
}

export function readRevision(ws: KnowledgeWorkspace, id: string, revision: number): StrategyRevision {
  assertOwnerProcess()
  const record = loadRecord(ws, id)
  return loadRevision(ws, id, revision, entryOf(record, revision))
}

/** Every strategy record of this brand. Another brand's copy, a symlink or a corrupt file is skipped. */
export function scanRecords(ws: KnowledgeWorkspace): StrategyRecord[] {
  const folder = recordsRoot(ws)
  if (!dirUsable(ws, folder)) return []
  const out: StrategyRecord[] = []
  for (const name of fs.readdirSync(folder).sort()) {
    try {
      validateStrategyId(name)
      out.push(loadRecord(ws, name))
    } catch (error) {
      if (!(error instanceof StrategyError)) throw error
    }
  }
  return out
}

export function listRecords(ws: KnowledgeWorkspace): StrategyRecord[] {
  assertOwnerProcess()
  return scanRecords(ws)
}

export function entryOf(record: StrategyRecord, revision: number): RevisionEntry {
  const entry = record.revisions.find((item) => item.revision === revision)
  if (!entry) throw new StrategyError('not_found', `No revision ${revision} of ${record.strategy_id}.`)
  return entry
}

/** The one approved revision, or null. Two approved entries is a corrupt index: no revision is current. */
export function approvedEntry(record: StrategyRecord): RevisionEntry | null {
  const approved = record.revisions.filter((item) => item.state === 'approved')
  if (approved.length > 1) throw new StrategyError('integrity_failed', `${record.strategy_id} has ${approved.length} approved revisions. None is served until the owner repairs the record.`)
  return approved[0] ?? null
}

// ---- source refs ---------------------------------------------------------------------------------------

export type RefState = 'current' | 'changed' | 'missing'

/** An approved canonical fact at the cited revision_hash. */
export function factState(ws: KnowledgeWorkspace, ref: FactRef, facts = readFacts(ws.root, 'approved', ws.brandSlug)): RefState {
  const fact = facts[ref.id]
  if (!fact || fact.status !== 'approved' || fact.brand_id !== ws.brandSlug || !fact.revision_hash) return 'missing'
  return fact.revision_hash === ref.revision ? 'current' : 'changed'
}

function researchNote(ws: KnowledgeWorkspace, id: string): LoadedNote | null {
  try {
    const loaded = findNote(ws, id)
    const meta = loaded.note.meta
    if (meta.classification !== 'internal' || meta.kind !== 'research' || meta.brand_slug !== ws.brandSlug) return null
    return loaded
  } catch (error) {
    if (error instanceof KnowledgeError) return null
    throw error
  }
}

/** A research note at the cited revision. Archived counts as missing; an edit since is changed. */
export function evidenceState(ws: KnowledgeWorkspace, ref: EvidenceRef): RefState {
  const loaded = researchNote(ws, ref.note_id)
  if (!loaded || loaded.note.meta.status === 'archived') return 'missing'
  return loaded.revision === ref.revision ? 'current' : 'changed'
}

/**
 * An approved SEO or paid-media strategy cited by a content strategy: current while that exact revision is the one
 * served (current or review_due); changed when another revision replaced it; missing when nothing is served.
 */
export function strategyRefState(ws: KnowledgeWorkspace, ref: StrategyRef, now: Date = ws.now()): RefState {
  let record: StrategyRecord
  try {
    record = loadRecord(ws, ref.strategy_id)
  } catch (error) {
    if (error instanceof StrategyError) return 'missing'
    throw error
  }
  // Only SEO and paid-media strategies can be cited, so evaluation never recurses into another content strategy.
  if (record.type === 'content') return 'missing'
  let entry: RevisionEntry | null
  try {
    entry = approvedEntry(record)
  } catch {
    return 'missing'
  }
  if (!entry) return 'missing'
  if (entry.revision !== ref.revision || entry.content_sha256 !== ref.content_sha256) return 'changed'
  const status = evaluate(ws, record, entry, now).status
  return status === 'current' || status === 'review_due' ? 'current' : 'missing'
}

function resolveStrategyRef(ws: KnowledgeWorkspace, ref: StrategyRef): StrategyRef {
  const state = strategyRefState(ws, ref)
  if (state === 'current') return ref
  throw new StrategyError(state === 'changed' ? 'stale_source' : 'refused', `Strategy ${ref.strategy_id}@${ref.revision} is ${state === 'changed' ? 'no longer the approved revision' : 'not an approved, valid SEO or paid-media strategy of this brand'}. Cite the revision served now.`)
}

function resolveFacts(ws: KnowledgeWorkspace, ids: string[]): FactRef[] {
  const facts = readFacts(ws.root, 'approved', ws.brandSlug)
  return ids.map((id) => {
    const fact = facts[id]
    if (!fact || fact.status !== 'approved' || !fact.revision_hash) {
      throw new StrategyError('refused', `Fact ${id} is not an approved fact of this brand. A strategy cites approved facts only; approve it first (brand:review, brand:approve).`)
    }
    return { id, revision: fact.revision_hash }
  })
}

function resolveEvidence(ws: KnowledgeWorkspace, input: string): EvidenceRef {
  const pinned = parseKnowledgeRef(input)
  const id = pinned ? pinned.id : input
  const loaded = researchNote(ws, id)
  if (!loaded) throw new StrategyError('refused', `${id} is not a research note in this brand's Knowledge Inbox (restricted notes are never cited). Record sources with brand:seo research.`)
  if (loaded.note.meta.status === 'archived') throw new StrategyError('refused', `Research note ${id} is archived. Cite a current source.`)
  if (pinned && pinned.revision !== loaded.revision) throw new StrategyError('stale_source', `Research note ${id} changed since ${input} was read. Re-read it and cite the current revision.`)
  return { ref: knowledgeRef(loaded.id, loaded.revision), note_id: loaded.id, revision: loaded.revision }
}

// ---- propose -------------------------------------------------------------------------------------------

export interface ProposeResult {
  record: StrategyRecord
  revision: StrategyRevision
  path: string
}

/**
 * Stores a new draft revision. Facts and research notes are resolved to their current revisions; a recommendation
 * may cite only refs the strategy cites. If an approved revision exists, the draft records it as the one it would
 * supersede. Nothing is approved, and agents cannot see a draft.
 */
export function proposeRevision(ws: KnowledgeWorkspace, input: { strategy_id: string; proposal: unknown; origin?: StrategyOrigin }): ProposeResult {
  assertOwnerProcess()
  const id = validateStrategyId(input.strategy_id)
  const proposal: ProposalInput = parseProposal(input.proposal, input.origin)
  const now = ws.now().toISOString()
  if (proposal.valid_until <= now) throw new StrategyError('invalid_input', 'valid_until is in the past. An expired strategy cannot be proposed.')
  const factRefs = resolveFacts(ws, proposal.fact_ids)
  const evidenceRefs: EvidenceRef[] = []
  for (const item of proposal.evidence) {
    const ref = resolveEvidence(ws, item)
    if (!evidenceRefs.some((have) => have.note_id === ref.note_id)) evidenceRefs.push(ref)
  }
  const recommendations = proposal.recommendations.map((rec) => {
    for (const fact of rec.fact_refs) {
      if (!factRefs.some((ref) => ref.id === fact)) throw new StrategyError('invalid_input', `Recommendation ${rec.id} cites fact ${fact}, which is not in fact_refs.`)
    }
    const evidence = rec.evidence_refs.map((item) => {
      const noteId = parseKnowledgeRef(item)?.id ?? item
      const ref = evidenceRefs.find((have) => have.note_id === noteId)
      if (!ref) throw new StrategyError('invalid_input', `Recommendation ${rec.id} cites ${noteId}, which is not in evidence_refs.`)
      if (item.startsWith('knowledge:') && item !== ref.ref) throw new StrategyError('stale_source', `Recommendation ${rec.id} pins ${item}, but the note is now ${ref.ref}.`)
      return ref.ref
    })
    if (rec.agent_kinds.length === 0) throw new StrategyError('invalid_input', `Recommendation ${rec.id} names no agent_kinds. Name who may receive it (${TYPE_AGENT[proposal.type]}).`)
    return { ...rec, evidence_refs: evidence }
  })
  if (proposal.content_strategy) {
    for (const fact of contentBlockFactIds(proposal.content_strategy)) {
      if (!factRefs.some((ref) => ref.id === fact)) throw new StrategyError('invalid_input', `content_strategy cites fact ${fact}, which is not in fact_refs.`)
    }
    // A content strategy is read by content agents (Slice C). Restricted facts such as the budget never enter it.
    const facts = readFacts(ws.root, 'approved', ws.brandSlug)
    const restricted = factRefs.filter((ref) => facts[ref.id]?.classification === 'restricted').map((ref) => ref.id)
    if (restricted.length) throw new StrategyError('refused', `A content strategy cannot cite restricted facts (${restricted.join(', ')}). Nothing was written.`)
    for (const ref of proposal.content_strategy.strategy_refs) resolveStrategyRef(ws, ref)
  }
  const { fact_ids: _facts, evidence: _evidence, ...rest } = proposal
  void _facts
  void _evidence
  const content: StrategyContent = { ...rest, recommendations, fact_refs: factRefs, evidence_refs: evidenceRefs }

  return withLock(ws, `strategy-${id}`, () => {
    let record: StrategyRecord
    try {
      record = loadRecord(ws, id)
    } catch (error) {
      if (!(error instanceof StrategyError) || error.code !== 'not_found') throw error
      record = { schema_version: STRATEGY_SCHEMA_VERSION, kind: 'strategy_record', strategy_id: id, brand_slug: ws.brandSlug, type: proposal.type, created_at: now, updated_at: now, revisions: [] }
    }
    if (record.type !== proposal.type) throw new StrategyError('invalid_input', `${id} is a ${record.type} strategy; a revision cannot change its type to ${proposal.type}.`)
    if (record.revisions.length >= STRATEGY_LIMITS.maxRevisions) throw new StrategyError('invalid_input', `At most ${STRATEGY_LIMITS.maxRevisions} revisions per strategy.`)
    const number = record.revisions.reduce((max, item) => Math.max(max, item.revision), 0) + 1
    const approved = approvedEntry(record)
    const base = { strategy_id: id, brand_slug: ws.brandSlug, revision: number, supersedes_revision: approved?.revision ?? null, content }
    const revision: StrategyRevision = { schema_version: STRATEGY_SCHEMA_VERSION, kind: 'strategy_revision', ...base, content_sha256: contentDigest(base), created_at: now }
    const file = revisionFile(ws, id, number)
    if (fs.existsSync(file)) throw new StrategyError('exists', `Revision file ${path.basename(file)} already exists. Revisions are never overwritten.`)
    writeJson(ws, file, revision)
    record.revisions.push({ revision: number, content_sha256: revision.content_sha256, state: 'draft', created_at: now, approval: null, superseded_by: null, superseded_at: null, rejected_at: null, withdrawn: null })
    record.updated_at = now
    writeJson(ws, recordFile(ws, id), record)
    return { record, revision, path: path.relative(ws.root, file).split(path.sep).join('/') }
  })
}

// ---- evaluation ----------------------------------------------------------------------------------------

export interface RefReport {
  facts: Array<FactRef & { state: RefState }>
  evidence: Array<EvidenceRef & { state: RefState }>
  /** Cited SEO / paid-media strategies (content strategies only; empty otherwise). */
  strategies: Array<StrategyRef & { state: RefState }>
}

export function refReport(ws: KnowledgeWorkspace, content: StrategyContent, now: Date = ws.now()): RefReport {
  const facts = readFacts(ws.root, 'approved', ws.brandSlug)
  return {
    facts: content.fact_refs.map((ref) => ({ ...ref, state: factState(ws, ref, facts) })),
    evidence: content.evidence_refs.map((ref) => ({ ...ref, state: evidenceState(ws, ref) })),
    strategies: (content.content_strategy?.strategy_refs ?? []).map((ref) => ({ ...ref, state: strategyRefState(ws, ref, now) })),
  }
}

/** Human-readable list of cited sources that are not current. */
function staleRefs(refs: RefReport, style: 'state' | 'paren'): string[] {
  const fmt = (label: string, state: RefState) => (style === 'state' ? `${label} is ${state}` : `${label} (${state})`)
  return [
    ...refs.facts.filter((ref) => ref.state !== 'current').map((ref) => fmt(`fact ${ref.id}`, ref.state)),
    ...refs.evidence.filter((ref) => ref.state !== 'current').map((ref) => fmt(`research ${ref.note_id}`, ref.state)),
    ...refs.strategies.filter((ref) => ref.state !== 'current').map((ref) => fmt(`strategy ${ref.strategy_id}@${ref.revision}`, ref.state)),
  ]
}

export function readApprovalSecret(ws: KnowledgeWorkspace): string | null {
  const file = approvalSecretPath(ws.root)
  try {
    const stat = fs.lstatSync(file)
    if (!stat.isFile()) return null
    return fs.readFileSync(file, 'utf8').trim() || null
  } catch {
    return null
  }
}

/** True when the approval on this entry was made by the approval flow for exactly these bytes. */
export function approvalVerifies(ws: KnowledgeWorkspace, record: StrategyRecord, entry: RevisionEntry): boolean {
  const approval = entry.approval
  if (!approval || typeof approval.digest !== 'string' || typeof approval.seal !== 'string') return false
  const digest = approvalDigest({ strategy_id: record.strategy_id, brand_slug: record.brand_slug, revision: entry.revision, content_sha256: entry.content_sha256, event_id: approval.event_id, approved_at: approval.approved_at })
  if (digest !== approval.digest) return false
  const secret = readApprovalSecret(ws)
  return secret !== null && approvalSeal(secret, digest) === approval.seal
}

export interface Evaluation {
  status: EffectiveStatus
  reasons: string[]
  refs: RefReport | null
}

/**
 * The effective status of one revision now. Approved revisions are checked in order: integrity (file hash, approval
 * digest and seal), validity window, cited sources unchanged, review date. Only `current` and `review_due` are ever
 * served to an agent.
 */
export function evaluate(ws: KnowledgeWorkspace, record: StrategyRecord, entry: RevisionEntry, now: Date): Evaluation & { revision: StrategyRevision | null } {
  let revision: StrategyRevision
  try {
    revision = loadRevision(ws, record.strategy_id, entry.revision, entry)
  } catch (error) {
    if (error instanceof StrategyError) return { status: 'integrity_failed', reasons: [error.message], refs: null, revision: null }
    throw error
  }
  if (entry.state !== 'approved') return { status: entry.state, reasons: [], refs: null, revision }
  if (!approvalVerifies(ws, record, entry)) return { status: 'integrity_failed', reasons: ['The approval does not verify for these bytes (not made by brand:strategy approve, or edited since).'], refs: null, revision }
  const at = now.toISOString()
  const c = revision.content
  if (at < c.valid_from) return { status: 'not_yet_valid', reasons: [`Valid from ${c.valid_from}.`], refs: null, revision }
  if (at >= c.valid_until) return { status: 'expired', reasons: [`Expired at ${c.valid_until}. Propose and approve a new revision.`], refs: null, revision }
  const refs = refReport(ws, c, now)
  const changed = staleRefs(refs, 'state')
  if (changed.length) return { status: 'needs_review', reasons: [...changed, 'A cited source changed after approval. The approved bytes are unchanged; the owner must review and approve a new revision.'], refs, revision }
  if (at >= c.review_due_at) return { status: 'review_due', reasons: [`Review was due at ${c.review_due_at}. Still valid until ${c.valid_until}.`], refs, revision }
  return { status: 'current', reasons: [], refs, revision }
}

// ---- review (human diff) -------------------------------------------------------------------------------

export interface DiffEntry {
  path: string
  change: 'added' | 'removed' | 'changed'
  before: unknown
  after: unknown
}

function flatten(value: unknown, prefix: string, out: Map<string, unknown>): void {
  if (Array.isArray(value)) {
    const keyed = value.length > 0 && value.every((item) => item && typeof item === 'object' && !Array.isArray(item) && typeof (item as { id?: unknown }).id === 'string')
    const noteKeyed = value.length > 0 && value.every((item) => item && typeof item === 'object' && typeof (item as { note_id?: unknown }).note_id === 'string')
    if (keyed || noteKeyed) {
      for (const item of value as Array<Record<string, unknown>>) flatten(item, `${prefix}[${String(keyed ? item.id : item.note_id)}]`, out)
      return
    }
    out.set(prefix, value)
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) flatten(item, prefix ? `${prefix}.${key}` : key, out)
    return
  }
  out.set(prefix, value)
}

/** Field-level diff between two contents. Lists of records are matched by id, so a reorder is not a change. */
export function diffContent(before: StrategyContent | null, after: StrategyContent): DiffEntry[] {
  const a = new Map<string, unknown>()
  const b = new Map<string, unknown>()
  if (before) flatten(before, '', a)
  flatten(after, '', b)
  const out: DiffEntry[] = []
  for (const [key, value] of b) {
    if (!a.has(key)) out.push({ path: key, change: 'added', before: null, after: value })
    else if (JSON.stringify(a.get(key)) !== JSON.stringify(value)) out.push({ path: key, change: 'changed', before: a.get(key), after: value })
  }
  for (const [key, value] of a) if (!b.has(key)) out.push({ path: key, change: 'removed', before: value, after: null })
  return out.sort((x, y) => x.path.localeCompare(y.path))
}

export interface ReviewReport {
  strategy_id: string
  revision: number
  state: RevisionEntry['state']
  content_sha256: string
  supersedes_revision: number | null
  /** The approved revision now, which may differ from supersedes_revision if it changed since the draft. */
  current_approved: number | null
  base: { revision: number; content_sha256: string } | null
  diff: DiffEntry[]
  refs: RefReport
  dates: { valid_from: string; valid_until: string; review_due_at: string }
  impact: { agent_kinds: AgentKind[]; recommendations: number; restricted_fields: string[] }
  blockers: string[]
  approve_with: string
  notice: string[]
}

/** What the owner reads before approving: the diff against the revision this one supersedes, sources and blockers. */
export function reviewRevision(ws: KnowledgeWorkspace, input: { strategy_id: string; revision: number }): ReviewReport {
  assertOwnerProcess()
  const record = loadRecord(ws, validateStrategyId(input.strategy_id))
  const entry = entryOf(record, validateRevisionNumber(input.revision))
  const revision = loadRevision(ws, record.strategy_id, entry.revision, entry)
  const baseNumber = revision.supersedes_revision
  const base = baseNumber !== null ? loadRevision(ws, record.strategy_id, baseNumber, entryOf(record, baseNumber)) : null
  const refs = refReport(ws, revision.content)
  const current = approvedEntry(record)
  const blockers: string[] = []
  if (entry.state !== 'draft') blockers.push(`Revision ${entry.revision} is ${entry.state}; only a draft can be approved.`)
  if ((current?.revision ?? null) !== revision.supersedes_revision) {
    blockers.push(`The approved revision changed since this draft was proposed (was ${revision.supersedes_revision ?? 'none'}, now ${current?.revision ?? 'none'}). Propose again.`)
  }
  for (const ref of refs.facts) if (ref.state !== 'current') blockers.push(`Fact ${ref.id} is ${ref.state} since it was cited.`)
  for (const ref of refs.evidence) if (ref.state !== 'current') blockers.push(`Research note ${ref.note_id} is ${ref.state} since it was cited.`)
  for (const ref of refs.strategies) if (ref.state !== 'current') blockers.push(`Strategy ${ref.strategy_id}@${ref.revision} is ${ref.state} since it was cited.`)
  if (ws.now().toISOString() >= revision.content.valid_until) blockers.push('valid_until has passed.')
  const c = revision.content
  return {
    strategy_id: record.strategy_id,
    revision: entry.revision,
    state: entry.state,
    content_sha256: entry.content_sha256,
    supersedes_revision: revision.supersedes_revision,
    current_approved: current?.revision ?? null,
    base: base ? { revision: base.revision, content_sha256: base.content_sha256 } : null,
    diff: diffContent(base?.content ?? null, c),
    refs,
    dates: { valid_from: c.valid_from, valid_until: c.valid_until, review_due_at: c.review_due_at },
    impact: {
      agent_kinds: [...new Set(c.recommendations.flatMap((rec) => rec.agent_kinds))].sort(),
      recommendations: c.recommendations.length,
      restricted_fields: c.restricted ? Object.entries(c.restricted).filter(([, value]) => value !== null).map(([key]) => `restricted.${key}`) : [],
    },
    blockers,
    approve_with: `npm run brand:strategy -- approve --id ${record.strategy_id} --revision ${entry.revision} --expect-sha ${entry.content_sha256}`,
    notice: [
      record.type === 'content'
        ? 'Approving makes this the content strategy the owner projection (brand:content show) serves; the calendar planner plans from it, and content-read agents read it through strategy_list / strategy_get. It authorizes no post, publication, schedule, ad or spend.'
        : 'Approving makes this revision the one agents with a matching strategy profile can read. It authorizes no ad, spend, publication or website change.',
      base ? `On approval, revision ${base.revision} becomes superseded. It stays on disk for audit.` : 'This is the first revision of this strategy.',
      'Restricted fields are never sent to an agent.',
    ],
  }
}

// ---- approve / reject / withdraw ----------------------------------------------------------------------

/** Owner approval proof check shared by strategy and content-week approvals. Returns the approval secret. */
export function requireProof(ws: KnowledgeWorkspace, proof: string | undefined): string {
  if (!approvalProofMatches(ws.root, proof)) throw new StrategyError('proof', 'Refused: missing or wrong owner approval proof. Nothing was changed.')
  const secret = readApprovalSecret(ws)
  if (!secret) throw new StrategyError('proof', 'The approval secret is unreadable. Nothing was changed.')
  return secret
}

/**
 * Owner approval of one draft revision. `expected_sha256` must be the content hash the owner reviewed (TOCTOU guard).
 * Refused when a cited source changed, the dates are past, or the approved revision changed since the draft. The
 * previously approved revision becomes superseded; both stay on disk.
 */
export function approveRevision(ws: KnowledgeWorkspace, input: { strategy_id: string; revision: number; expected_sha256: string; proof: string | undefined }): { record: StrategyRecord; approved: RevisionEntry; superseded: RevisionEntry | null } {
  assertOwnerProcess()
  const id = validateStrategyId(input.strategy_id)
  const number = validateRevisionNumber(input.revision)
  const expected = validateSha(input.expected_sha256, '--expect-sha')
  const secret = requireProof(ws, input.proof)
  return withLock(ws, `strategy-${id}`, () => {
    const record = loadRecord(ws, id)
    const entry = entryOf(record, number)
    if (entry.state !== 'draft') throw new StrategyError('refused', `Revision ${number} is ${entry.state}. Only a draft can be approved.`)
    const revision = loadRevision(ws, id, number, entry)
    if (revision.content_sha256 !== expected) throw new StrategyError('stale_revision', `Revision ${number} hashes to ${revision.content_sha256}, not the ${expected} you reviewed. Review it again. Nothing was approved.`)
    const current = approvedEntry(record)
    if ((current?.revision ?? null) !== revision.supersedes_revision) {
      throw new StrategyError('stale_revision', `The approved revision changed since this draft was proposed (was ${revision.supersedes_revision ?? 'none'}, now ${current?.revision ?? 'none'}). Propose again from the current one.`)
    }
    const now = ws.now().toISOString()
    if (now >= revision.content.valid_until) throw new StrategyError('refused', 'valid_until has passed. An expired strategy cannot be approved.')
    const refs = refReport(ws, revision.content)
    const stale = staleRefs(refs, 'paren')
    if (stale.length) throw new StrategyError('stale_source', `Cited sources changed since the proposal: ${stale.join(', ')}. Propose a new revision. Nothing was approved.`)
    const eventId = newApprovalEventId()
    const digest = approvalDigest({ strategy_id: id, brand_slug: record.brand_slug, revision: number, content_sha256: revision.content_sha256, event_id: eventId, approved_at: now })
    entry.state = 'approved'
    entry.approval = { event_id: eventId, approved_at: now, actor: 'owner', digest, seal: approvalSeal(secret, digest) }
    if (current) {
      current.state = 'superseded'
      current.superseded_by = number
      current.superseded_at = now
    }
    record.updated_at = now
    // One write: the index flips both entries together, so there is never a moment with two approved revisions.
    writeJson(ws, recordFile(ws, id), record)
    return { record, approved: entry, superseded: current }
  })
}

/** The owner declines a draft. It stays on disk, is never served, and cannot be approved later. */
export function rejectRevision(ws: KnowledgeWorkspace, input: { strategy_id: string; revision: number }): RevisionEntry {
  assertOwnerProcess()
  const id = validateStrategyId(input.strategy_id)
  const number = validateRevisionNumber(input.revision)
  return withLock(ws, `strategy-${id}`, () => {
    const record = loadRecord(ws, id)
    const entry = entryOf(record, number)
    if (entry.state !== 'draft') throw new StrategyError('refused', `Revision ${number} is ${entry.state}. Only a draft can be rejected.`)
    const now = ws.now().toISOString()
    entry.state = 'rejected'
    entry.rejected_at = now
    record.updated_at = now
    writeJson(ws, recordFile(ws, id), record)
    return entry
  })
}

/**
 * The owner withdraws the approved revision (owner proof). Agents then get no current revision for this strategy:
 * an older approved revision is never silently restored. Approve a new revision to replace it.
 */
export function withdrawRevision(ws: KnowledgeWorkspace, input: { strategy_id: string; revision: number; reason: string; proof: string | undefined }): RevisionEntry {
  assertOwnerProcess()
  const id = validateStrategyId(input.strategy_id)
  const number = validateRevisionNumber(input.revision)
  const reason = text(input.reason, 'reason', 200)
  requireProof(ws, input.proof)
  return withLock(ws, `strategy-${id}`, () => {
    const record = loadRecord(ws, id)
    const entry = entryOf(record, number)
    if (entry.state !== 'approved') throw new StrategyError('refused', `Revision ${number} is ${entry.state}. Only the approved revision can be withdrawn.`)
    const now = ws.now().toISOString()
    entry.state = 'withdrawn'
    entry.withdrawn = { at: now, reason }
    record.updated_at = now
    writeJson(ws, recordFile(ws, id), record)
    return entry
  })
}

export interface StrategySummary {
  strategy_id: string
  type: StrategyRecord['type']
  title: string | null
  revisions: Array<{ revision: number; state: RevisionEntry['state']; effective: EffectiveStatus; content_sha256: string; reasons: string[] }>
  current: number | null
}

/** Owner overview: every revision with its stored and effective status. */
export function summarize(ws: KnowledgeWorkspace, record: StrategyRecord, now: Date = ws.now()): StrategySummary {
  let title: string | null = null
  const revisions = [...record.revisions]
    .sort((a, b) => a.revision - b.revision)
    .map((entry) => {
      const result = evaluate(ws, record, entry, now)
      if (result.revision) title = result.revision.content.title
      return { revision: entry.revision, state: entry.state, effective: result.status, content_sha256: entry.content_sha256, reasons: result.reasons }
    })
  let current: number | null = null
  try {
    current = approvedEntry(record)?.revision ?? null
  } catch {
    current = null
  }
  return { strategy_id: record.strategy_id, type: record.type, title, revisions, current }
}
