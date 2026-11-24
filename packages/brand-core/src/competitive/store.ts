import fs from 'node:fs'
import path from 'node:path'
import { AGENT_TOKEN_ENV } from '../agent-tokens.js'
import { KnowledgeError, NOTE_ID } from '../knowledge/model.js'
import { parseKnowledgeRef } from '../knowledge/proposals.js'
import { safetyBlocksSharing, safetyReport } from '../knowledge/safety.js'
import { dirUsable, safeRead, withLock, writeVaultFile, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import { hostOf, type Excerpt } from '../research/model.js'
import { loadEvidence, type EvidenceItem, type EvidenceSet } from '../research/store.js'
import {
  CANDIDATE_SOURCES,
  COMPETITIVE_LIMITS,
  COMPETITIVE_SCHEMA_VERSION,
  CompetitiveError,
  DIMENSIONS,
  GEOGRAPHIES,
  hostMatchesDomain,
  listOf,
  nameKey,
  newCompetitorId,
  newObservationId,
  oneOf,
  priceSupport,
  PURPOSES,
  RELATIONSHIPS,
  shortText,
  STATEMENT_KINDS,
  STORED_STATUSES,
  validateClaimKey,
  validateCompetitorId,
  validateDomain,
  validateMarkets,
  validatePrice,
  type CandidateSource,
  type CompetitiveScope,
  type CompetitorRecord,
  type EvidenceRef,
  type Observation,
  type Purpose,
  type StoredStatus,
} from './model.js'

/**
 * Competitor records live in brand/.private/competitive (gitignored; Studio, docs builds, the public projection and
 * every agent tool exclude brand/.private). One JSON file per candidate, named by its validated id. Reads never follow
 * symlinks and refuse other brands' files; writes are atomic, 0600 and serialized per candidate (Knowledge workspace
 * helpers). Every function refuses to run under an agent token: no agent profile covers draft dossiers.
 */

export const COMPETITIVE_DIRS = {
  root: 'brand/.private/competitive',
  candidates: 'brand/.private/competitive/candidates',
} as const

/** Research notes a competitor record may cite: market observations recorded through brand:seo research. */
export const COMPETITIVE_TOPIC = 'market_observation'

export function competitiveDir(ws: KnowledgeWorkspace, key: keyof typeof COMPETITIVE_DIRS): string {
  return path.join(ws.root, ...COMPETITIVE_DIRS[key].split('/'))
}

function scopeFile(ws: KnowledgeWorkspace): string {
  return path.join(competitiveDir(ws, 'root'), 'scope.json')
}

function candidateFile(ws: KnowledgeWorkspace, id: string): string {
  return path.join(competitiveDir(ws, 'candidates'), `${validateCompetitorId(id)}.json`)
}

export function assertOwnerProcess(): void {
  if (process.env[AGENT_TOKEN_ENV]) {
    throw new CompetitiveError('refused', `Competitor dossiers are the owner's local drafts. Refusing while ${AGENT_TOKEN_ENV} is set; no agent profile covers them.`)
  }
}

/** dirUsable, with a symlinked or non-directory segment reported as this module's unsafe_path. */
function usable(ws: KnowledgeWorkspace, dir: string): boolean {
  try {
    return dirUsable(ws, dir)
  } catch (error) {
    if (error instanceof KnowledgeError) throw new CompetitiveError('unsafe_path', error.message)
    throw error
  }
}

export function readJson<T extends { kind: string; brand_slug: string }>(ws: KnowledgeWorkspace, file: string, kind: string): T | null {
  if (!usable(ws, path.dirname(file))) return null
  let raw: Buffer | null
  try {
    raw = safeRead(file, COMPETITIVE_LIMITS.maxFileBytes)
  } catch (error) {
    if (error instanceof KnowledgeError) throw new CompetitiveError('unsafe_path', error.message)
    throw error
  }
  if (!raw) return null
  let doc: T
  try {
    doc = JSON.parse(raw.toString('utf8')) as T
  } catch {
    throw new CompetitiveError('invalid_record', `${path.basename(file)} is not valid JSON.`)
  }
  if (!doc || typeof doc !== 'object' || doc.kind !== kind) throw new CompetitiveError('invalid_record', `${path.basename(file)} is not a ${kind} record.`)
  if (doc.brand_slug !== ws.brandSlug) throw new CompetitiveError('wrong_brand', `${path.basename(file)} belongs to another brand. It is not read.`)
  return doc
}

export function writeJson(ws: KnowledgeWorkspace, file: string, doc: unknown): void {
  try {
    writeVaultFile(ws, file, `${JSON.stringify(doc, null, 2)}\n`, true)
  } catch (error) {
    if (error instanceof KnowledgeError) throw new CompetitiveError('unsafe_path', error.message)
    throw error
  }
}

export function locked<T>(ws: KnowledgeWorkspace, name: string, run: () => T): T {
  try {
    return withLock(ws, name, run)
  } catch (error) {
    if (error instanceof KnowledgeError) throw new CompetitiveError(error.code === 'unsafe_path' ? 'unsafe_path' : 'refused', error.message)
    throw error
  }
}

// ---- reads -----------------------------------------------------------------------------------------------

export function readCandidate(ws: KnowledgeWorkspace, id: string): CompetitorRecord {
  assertOwnerProcess()
  const doc = readJson<CompetitorRecord>(ws, candidateFile(ws, id), 'competitive_candidate')
  if (!doc) throw new CompetitiveError('not_found', `No competitor ${id} in this brand.`)
  if (doc.competitor_id !== id) throw new CompetitiveError('invalid_record', `The file for ${id} carries another competitor id.`)
  return doc
}

export interface CandidateScan {
  records: CompetitorRecord[]
  /** Files that were not read (another brand's, a symlink, corrupt). Named only, never partially read. */
  skipped: Array<{ file: string; reason: string }>
}

export function scanCandidates(ws: KnowledgeWorkspace): CandidateScan {
  assertOwnerProcess()
  const folder = competitiveDir(ws, 'candidates')
  const out: CandidateScan = { records: [], skipped: [] }
  if (!usable(ws, folder)) return out
  for (const name of fs.readdirSync(folder).sort()) {
    const match = /^(cmp_[0-9a-f-]{36})\.json$/.exec(name)
    if (!match) continue
    try {
      out.records.push(readCandidate(ws, match[1]!))
    } catch (error) {
      if (!(error instanceof CompetitiveError)) throw error
      out.skipped.push({ file: name, reason: error.code })
    }
  }
  out.records.sort((a, b) => a.display_name.localeCompare(b.display_name) || a.competitor_id.localeCompare(b.competitor_id))
  return out
}

export function readScope(ws: KnowledgeWorkspace): CompetitiveScope | null {
  assertOwnerProcess()
  return readJson<CompetitiveScope>(ws, scopeFile(ws), 'competitive_scope')
}

// ---- scope -----------------------------------------------------------------------------------------------

/** What this research is for. It scopes the gap checklist; it decides nothing about the brand. */
export function setScope(ws: KnowledgeWorkspace, purposes: unknown): CompetitiveScope {
  assertOwnerProcess()
  const list = listOf(purposes, PURPOSES, 'purposes') as Purpose[]
  if (!list.length) throw new CompetitiveError('invalid_input', `Name at least one purpose: ${PURPOSES.join(', ')}.`)
  const doc: CompetitiveScope = { schema_version: COMPETITIVE_SCHEMA_VERSION, kind: 'competitive_scope', brand_slug: ws.brandSlug, purposes: [...list].sort(), updated_at: ws.now().toISOString() }
  locked(ws, 'competitive-scope', () => writeJson(ws, scopeFile(ws), doc))
  return doc
}

// ---- candidates ------------------------------------------------------------------------------------------

export interface AddCandidateInput {
  display_name: string
  relationship?: unknown
  geography?: unknown
  markets?: unknown
  source?: CandidateSource
  domain?: string | null
  /** Required when a candidate with the same name exists: its id, and why this is a different business. */
  distinct_from?: string | null
  reason?: string | null
}

function marketsOverlap(a: string[], b: string[]): boolean {
  // Unknown markets cannot prove two same-name businesses are different.
  if (!a.length || !b.length || a.includes('GLOBAL') || b.includes('GLOBAL')) return true
  return a.some((market) => b.includes(market))
}

/**
 * A name the owner (or a research lead) mentioned becomes a `candidate`: no verified domain, no evidence. A second
 * candidate with the same normalized name is refused unless the owner names the existing one and says why they are
 * different businesses, and their markets do not overlap. Nothing is ever merged automatically.
 */
export function addCandidate(ws: KnowledgeWorkspace, input: AddCandidateInput): CompetitorRecord {
  assertOwnerProcess()
  const display = shortText(input.display_name, COMPETITIVE_LIMITS.maxNameChars, 'Name')!
  const key = nameKey(display)
  if (!key) throw new CompetitiveError('invalid_input', 'A name needs at least one letter or digit.')
  const blocked = safetyBlocksSharing({ ...safetyReport(display), restricted_passages: 0 })
  if (blocked.length) throw new CompetitiveError('refused', `The name looks like it contains ${blocked.join('; ')}.`)
  const markets = validateMarkets(input.markets)
  const relationship = listOf(input.relationship, RELATIONSHIPS, 'relationship')
  const geography = listOf(input.geography, GEOGRAPHIES, 'geography')
  const domain = input.domain ? validateDomain(input.domain) : null
  const source = oneOf(input.source ?? 'owner_named', CANDIDATE_SOURCES, 'source')
  return locked(ws, 'competitive-index', () => {
    const existing = scanCandidates(ws).records
    if (existing.length >= COMPETITIVE_LIMITS.maxCandidates) throw new CompetitiveError('refused', `At most ${COMPETITIVE_LIMITS.maxCandidates} candidates per brand.`)
    const sameName = existing.filter((record) => record.name_key === key)
    const distinct: CompetitorRecord['distinct_from'] = []
    if (sameName.length) {
      const other = input.distinct_from ? validateCompetitorId(input.distinct_from) : null
      const reason = shortText(input.reason, COMPETITIVE_LIMITS.maxReasonChars, 'reason', false)
      const named = sameName.find((record) => record.competitor_id === other)
      if (!named || !reason || sameName.length > 1) {
        throw new CompetitiveError('duplicate_candidate', `A candidate with this name exists (${sameName.map((record) => record.competitor_id).join(', ')}). Use it, or pass --distinct-from <id> --reason "<why this is another business>".`)
      }
      if (marketsOverlap(named.markets, markets)) {
        throw new CompetitiveError('duplicate_candidate', `${named.competitor_id} has the same name and an overlapping or unknown market. Two records for one business are refused; give disjoint markets for both or use the existing record.`)
      }
      distinct.push({ competitor_id: named.competitor_id, reason })
    }
    const now = ws.now().toISOString()
    const record: CompetitorRecord = {
      schema_version: COMPETITIVE_SCHEMA_VERSION,
      kind: 'competitive_candidate',
      competitor_id: newCompetitorId(),
      brand_slug: ws.brandSlug,
      display_name: display,
      name_key: key,
      relationship,
      geographic_relevance: geography,
      markets,
      source,
      status: 'candidate',
      status_reason: null,
      domain_claim: domain,
      domain_evidence: null,
      distinct_from: distinct,
      observations: [],
      created_at: now,
      updated_at: now,
    }
    writeJson(ws, candidateFile(ws, record.competitor_id), record)
    return record
  })
}

function updateCandidate(ws: KnowledgeWorkspace, id: string, change: (record: CompetitorRecord) => void): CompetitorRecord {
  validateCompetitorId(id)
  return locked(ws, `competitive-${id.slice(4, 40)}`, () => {
    const record = readCandidate(ws, id)
    change(record)
    record.updated_at = ws.now().toISOString()
    writeJson(ws, candidateFile(ws, id), record)
    return record
  })
}

export function setStatus(ws: KnowledgeWorkspace, input: { competitor_id: string; status: unknown; reason?: string | null }): CompetitorRecord {
  assertOwnerProcess()
  const status = oneOf(input.status, STORED_STATUSES, 'status') as StoredStatus
  const reason = shortText(input.reason, COMPETITIVE_LIMITS.maxReasonChars, 'reason', false)
  if ((status === 'disputed' || status === 'archived') && !reason) throw new CompetitiveError('invalid_input', `${status} needs --reason (for example why this business is excluded).`)
  return updateCandidate(ws, input.competitor_id, (record) => {
    record.status = status
    record.status_reason = reason
  })
}

export function classifyCandidate(ws: KnowledgeWorkspace, input: { competitor_id: string; relationship?: unknown; geography?: unknown; markets?: unknown }): CompetitorRecord {
  assertOwnerProcess()
  const relationship = input.relationship === undefined ? null : listOf(input.relationship, RELATIONSHIPS, 'relationship')
  const geography = input.geography === undefined ? null : listOf(input.geography, GEOGRAPHIES, 'geography')
  const markets = input.markets === undefined ? null : validateMarkets(input.markets)
  return updateCandidate(ws, input.competitor_id, (record) => {
    if (relationship) record.relationship = relationship
    if (geography) record.geographic_relevance = geography
    if (markets) record.markets = markets
  })
}

// ---- evidence --------------------------------------------------------------------------------------------

export interface ResolvedEvidence {
  ref: EvidenceRef
  item: EvidenceItem
  excerpt: Excerpt
}

/**
 * A research note of this brand at its current revision, holding a supporting excerpt for `claim_key`. Ordinary
 * notes, restricted notes, other brands' notes, archived or superseded sources, a pinned revision that has since
 * changed and a claim the source does not support are all refused. Nothing is copied from the note.
 */
export function resolveEvidence(ws: KnowledgeWorkspace, input: string, claimKey: string, evidence: EvidenceSet = loadEvidence(ws)): ResolvedEvidence {
  const pinned = typeof input === 'string' ? parseKnowledgeRef(input) : null
  const id = pinned ? pinned.id : input
  if (typeof id !== 'string' || !NOTE_ID.test(id)) throw new CompetitiveError('invalid_input', 'Cite a research note as kn_<id> or knowledge:kn_<id>@<sha256>.')
  const key = validateClaimKey(claimKey)
  const item = evidence.items.find((candidate) => candidate.note.id === id)
  if (!item) throw new CompetitiveError('refused', `${id} is not a research note of this brand. Record the source first (npm run brand:seo -- research capture, topic ${COMPETITIVE_TOPIC}); restricted and ordinary notes are never cited.`)
  if (item.source.topic !== COMPETITIVE_TOPIC) throw new CompetitiveError('refused', `${id} is a ${item.source.topic} source. Competitor evidence is recorded with topic ${COMPETITIVE_TOPIC}.`)
  if (item.archived) throw new CompetitiveError('stale_source', `${id} is archived. Cite a current source.`)
  if (item.superseded_by) throw new CompetitiveError('stale_source', `${id} was superseded by ${item.superseded_by}. Cite the newer note.`)
  if (pinned && pinned.revision !== item.note.revision) throw new CompetitiveError('stale_source', `${id} changed since ${input} was read. Re-read it and cite the current revision.`)
  const excerpt = item.source.excerpts.find((candidate) => candidate.claim_key === key && candidate.stance === 'supports')
  if (!excerpt) throw new CompetitiveError('unsupported_claim', `${id} has no supporting excerpt for ${key}. Nothing is recorded without a quote that says it.`)
  return { ref: { note_id: item.note.id, revision: item.note.revision, claim_key: key, observed_at: item.source.retrieved_at }, item, excerpt }
}

export interface LinkEvidenceInput {
  competitor_id: string
  note: string
  claim_key: string
  dimension: unknown
  statement_kind?: unknown
  label: string
  price?: Record<string, unknown> | null
}

/**
 * Adds one observation: a dimension, a short label and the cited claim. A public price is accepted only when the
 * cited quote shows the amount, the currency and every stated term (see priceSupport). Linking the same claim to the
 * same dimension twice returns the existing observation.
 */
export function linkEvidence(ws: KnowledgeWorkspace, input: LinkEvidenceInput): { record: CompetitorRecord; observation: Observation; outcome: 'linked' | 'existing' } {
  assertOwnerProcess()
  const dimension = oneOf(input.dimension, DIMENSIONS, 'dimension')
  const kind = oneOf(input.statement_kind ?? 'observed_claim', STATEMENT_KINDS, 'statement_kind')
  if ((dimension === 'strength_hypothesis' || dimension === 'weakness_hypothesis') && kind !== 'inference') {
    throw new CompetitiveError('invalid_input', `${dimension} is a hypothesis: record it with statement_kind inference.`)
  }
  const label = shortText(input.label, COMPETITIVE_LIMITS.maxLabelChars, 'label')!
  const blocked = safetyBlocksSharing({ ...safetyReport(label), restricted_passages: 0 })
  if (blocked.length) throw new CompetitiveError('refused', `The label looks like it contains ${blocked.join('; ')}.`)
  const resolved = resolveEvidence(ws, input.note, input.claim_key)
  let price = null
  if (dimension === 'public_price') {
    if (!input.price) throw new CompetitiveError('invalid_input', 'A public_price observation needs the price terms (amount, currency, market, period…).')
    if (kind !== 'observed_claim') throw new CompetitiveError('invalid_input', 'A price is an observed claim, never an inference.')
    price = validatePrice(input.price)
    const support = priceSupport(price, resolved.excerpt.quote)
    if (!support.ok) throw new CompetitiveError('unsupported_claim', `The cited quote does not support this price: ${support.problems.join('; ')}. Nothing was recorded.`)
  } else if (input.price) {
    throw new CompetitiveError('invalid_input', 'Price terms belong to a public_price observation only.')
  }
  let outcome: 'linked' | 'existing' = 'linked'
  let observation: Observation | null = null
  const record = updateCandidate(ws, input.competitor_id, (current) => {
    const same = current.observations.find((item) => item.dimension === dimension && item.evidence.note_id === resolved.ref.note_id && item.evidence.claim_key === resolved.ref.claim_key && item.evidence.revision === resolved.ref.revision)
    if (same) {
      outcome = 'existing'
      observation = same
      return
    }
    if (current.observations.length >= COMPETITIVE_LIMITS.maxObservations) throw new CompetitiveError('refused', `At most ${COMPETITIVE_LIMITS.maxObservations} observations per competitor.`)
    observation = { observation_id: newObservationId(), dimension, statement_kind: kind, label, evidence: resolved.ref, price, recorded_at: ws.now().toISOString() }
    current.observations.push(observation)
  })
  return { record, observation: observation!, outcome }
}

/**
 * Links a source fetched from the claimed domain as identity evidence. The domain counts as verified only while that
 * note stays current and its fetched URL is on the domain; the landscape re-checks this on every read. Two candidates
 * claiming the same domain are refused, never merged.
 */
export function verifyDomain(ws: KnowledgeWorkspace, input: { competitor_id: string; domain?: string | null; note: string; claim_key: string }): CompetitorRecord {
  assertOwnerProcess()
  const id = validateCompetitorId(input.competitor_id)
  const current = readCandidate(ws, id)
  const domain = input.domain ? validateDomain(input.domain) : current.domain_claim
  if (!domain) throw new CompetitiveError('invalid_input', 'Give --domain: the bare domain this business uses.')
  const resolved = resolveEvidence(ws, input.note, input.claim_key)
  const hosts = [hostOf(resolved.item.source.url), hostOf(resolved.item.source.final_url)]
  if (!hosts.every((host) => hostMatchesDomain(host, domain))) throw new CompetitiveError('unsupported_claim', `${resolved.ref.note_id} was not fetched from ${domain}. A domain is verified only by a source retrieved from it.`)
  const clash = scanCandidates(ws).records.find((record) => record.competitor_id !== id && record.domain_claim === domain && record.status !== 'archived')
  if (clash) throw new CompetitiveError('duplicate_candidate', `${clash.competitor_id} (${clash.display_name}) already claims ${domain}. Archive one record; they are never merged automatically.`)
  return updateCandidate(ws, id, (record) => {
    record.domain_claim = domain
    record.domain_evidence = resolved.ref
  })
}
