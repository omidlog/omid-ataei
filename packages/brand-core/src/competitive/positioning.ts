import crypto from 'node:crypto'
import path from 'node:path'
import { safetyBlocksSharing, safetyReport } from '../knowledge/safety.js'
import type { KnowledgeWorkspace } from '../knowledge/workspace.js'
import { DEFAULT_STALENESS_DAYS } from '../research/model.js'
import { evidenceFor, loadEvidence, type EvidenceSet } from '../research/store.js'
import { refState, sourceClass, type SourceClass } from './landscape.js'
import { COMPETITIVE_SCHEMA_VERSION, CompetitiveError, oneOf, validateCompetitorId, type EvidenceRef } from './model.js'
import { assertOwnerProcess, competitiveDir, locked, readCandidate, readJson, resolveEvidence, writeJson } from './store.js'

/**
 * Positioning axes and evidenced positions (Visual V2.3, owner decision D2).
 *
 * `brand/.private/competitive/axes.json` is an OWNER-ONLY record: the owner chooses the two axes, their labels and
 * their pole names. Nothing here suggests, ranks or invents an axis. `brand/.private/competitive/positions.json`
 * holds the owner's qualitative reading of a cited source: one band (low … high) on one axis, for one competitor or
 * for the own brand, citing a Knowledge research note and claim exactly like a competitor observation. There are no
 * numbers to fabricate: a band is a word, and it exists only with a source and a date.
 *
 * When the landscape is read, each (subject, axis) pair is judged against the notes as they are now:
 * - `evidenced`: at least one current source, all usable sources agree on one band;
 * - `stale`: the only sources are older than the research staleness threshold for market observations
 *   (DEFAULT_STALENESS_DAYS.market_observation, 90 days); still drawn, marked stale;
 * - `conflicting`: usable sources disagree on the band, or the research notes hold a contradicting excerpt; the
 *   recorded bands are drawn as a range, never resolved to one;
 * - `needs_review`: every cited source changed, was superseded, archived or lost its claim; not drawn;
 * - `unknown`: nothing recorded; not drawn.
 * A subject is plotted only when both axes are evidenced, stale or conflicting. Everything else is listed, not drawn.
 *
 * Studio never reads these files. Only `brand:competitive share` projects them (labels and states, no rationale, no
 * axis ids, no note ids) into the tracked shared landscape. Refused under an agent token.
 */

export const AXES_RECORD_PATH = 'brand/.private/competitive/axes.json'
export const POSITIONS_RECORD_PATH = 'brand/.private/competitive/positions.json'
export const AXIS_KEYS = ['x', 'y'] as const
export type AxisKey = (typeof AXIS_KEYS)[number]
/** Qualitative bands, low to high. Never a number: the map draws bands, not measurements. */
export const POSITION_BANDS = ['low', 'lower_mid', 'mid', 'upper_mid', 'high'] as const
export type PositionBand = (typeof POSITION_BANDS)[number]
export const PLACEMENT_STATES = ['evidenced', 'stale', 'conflicting', 'needs_review', 'unknown'] as const
export type PlacementState = (typeof PLACEMENT_STATES)[number]
/** The subject id of the brand itself in positions. */
export const OWN_SUBJECT = 'own'
/** The documented stale threshold: the research store's threshold for market observations. */
export const POSITION_STALE_DAYS = DEFAULT_STALENESS_DAYS.market_observation
export const POSITIONING_LANGS = ['en', 'fa', 'tr'] as const

export const POSITIONING_LIMITS = { maxAxisLabelChars: 60, maxPoleChars: 40, maxRationaleChars: 400, maxPositions: 800, maxSourcesPerPlacement: 6 } as const

const AXIS_ID = /^[a-z][a-z0-9_]{1,39}$/
export const POSITION_ID = /^pos_[0-9a-f-]{36}$/

/** An owner-written label in en (required) and, when the owner gives them, fa and tr. Never machine-translated. */
export interface LocalizedLabel {
  en: string
  fa: string | null
  tr: string | null
}

export interface AxisDefinition {
  /** Stable owner-chosen id; positions cite it. A new meaning needs a new id. Never shared. */
  axis_id: string
  label: LocalizedLabel
  low: LocalizedLabel
  high: LocalizedLabel
  /** Why the owner chose this axis. Private; never shared. */
  rationale: string | null
}

export interface AxesRecord {
  schema_version: number
  kind: 'competitive_axes'
  brand_slug: string
  x: AxisDefinition
  y: AxisDefinition
  updated_at: string
}

export interface PositionRecord {
  position_id: string
  /** `own` or a competitor id. */
  subject: string
  axis_id: string
  band: PositionBand
  evidence: EvidenceRef
  recorded_at: string
}

export interface PositionsRecord {
  schema_version: number
  kind: 'competitive_positions'
  brand_slug: string
  positions: PositionRecord[]
  updated_at: string
}

// ---- validation -------------------------------------------------------------------------------------

function unsafe(text: string): string[] {
  return safetyBlocksSharing({ ...safetyReport(text), restricted_passages: 0 })
}

function oneLine(value: unknown, max: number, field: string, required: boolean): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new CompetitiveError('invalid_input', `${field} is required.`)
    return null
  }
  if (typeof value !== 'string') throw new CompetitiveError('invalid_input', `${field} must be text.`)
  const clean = value.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!clean) {
    if (required) throw new CompetitiveError('invalid_input', `${field} is required.`)
    return null
  }
  if ([...clean].some((ch) => ch.charCodeAt(0) < 32)) throw new CompetitiveError('invalid_input', `${field} must be a single line.`)
  if (clean.length > max) throw new CompetitiveError('invalid_input', `${field} is longer than ${max} characters. Keep axis names short.`)
  const blocked = unsafe(clean)
  if (blocked.length) throw new CompetitiveError('refused', `${field} looks like it contains ${blocked.join('; ')}.`)
  return clean
}

function localized(value: unknown, max: number, field: string): LocalizedLabel {
  const raw = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>
  const extra = Object.keys(raw).filter((key) => !(POSITIONING_LANGS as readonly string[]).includes(key))
  if (extra.length) throw new CompetitiveError('invalid_input', `${field} has unknown languages: ${extra.join(', ')}. Use en, fa, tr.`)
  return { en: oneLine(raw.en, max, `${field} (en)`, true)!, fa: oneLine(raw.fa, max, `${field} (fa)`, false), tr: oneLine(raw.tr, max, `${field} (tr)`, false) }
}

function axisDefinition(value: unknown, key: AxisKey): AxisDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CompetitiveError('invalid_input', `Axis ${key} is required.`)
  const raw = value as Record<string, unknown>
  const extra = Object.keys(raw).filter((k) => !['axis_id', 'label', 'low', 'high', 'rationale'].includes(k))
  if (extra.length) throw new CompetitiveError('invalid_input', `Axis ${key} has unknown fields: ${extra.join(', ')}.`)
  if (typeof raw.axis_id !== 'string' || !AXIS_ID.test(raw.axis_id)) throw new CompetitiveError('invalid_input', `Axis ${key} needs an axis_id such as price_level (lowercase letters, digits, underscores).`)
  const def: AxisDefinition = {
    axis_id: raw.axis_id,
    label: localized(raw.label, POSITIONING_LIMITS.maxAxisLabelChars, `Axis ${key} label`),
    low: localized(raw.low, POSITIONING_LIMITS.maxPoleChars, `Axis ${key} low pole`),
    high: localized(raw.high, POSITIONING_LIMITS.maxPoleChars, `Axis ${key} high pole`),
    rationale: oneLine(raw.rationale, POSITIONING_LIMITS.maxRationaleChars, `Axis ${key} rationale`, false),
  }
  if (def.low.en.toLowerCase() === def.high.en.toLowerCase()) throw new CompetitiveError('invalid_input', `Axis ${key}: the low and high poles need different names.`)
  return def
}

/**
 * Validates two owner-chosen axes. Pure; writes nothing. Both axes are required, with different ids and labels:
 * a positioning map has exactly two dimensions, and the owner names both.
 */
export function validateAxes(input: { x: unknown; y: unknown }): { x: AxisDefinition; y: AxisDefinition } {
  const x = axisDefinition(input.x, 'x')
  const y = axisDefinition(input.y, 'y')
  if (x.axis_id === y.axis_id) throw new CompetitiveError('invalid_input', 'The two axes need different axis_id values.')
  if (x.label.en.toLowerCase() === y.label.en.toLowerCase()) throw new CompetitiveError('invalid_input', 'The two axes need different labels.')
  return { x, y }
}

function checkAxesRecord(doc: AxesRecord): AxesRecord {
  const keys = Object.keys(doc).sort().join(',')
  if (keys !== ['brand_slug', 'kind', 'schema_version', 'updated_at', 'x', 'y'].join(',')) throw new CompetitiveError('invalid_record', `${path.basename(AXES_RECORD_PATH)} has unexpected fields.`)
  if (doc.schema_version !== COMPETITIVE_SCHEMA_VERSION || typeof doc.updated_at !== 'string') throw new CompetitiveError('invalid_record', `${path.basename(AXES_RECORD_PATH)} has an unknown schema version.`)
  try {
    validateAxes({ x: doc.x, y: doc.y })
  } catch (error) {
    if (error instanceof CompetitiveError) throw new CompetitiveError('invalid_record', `${path.basename(AXES_RECORD_PATH)} is not valid: ${error.message}`)
    throw error
  }
  return doc
}

// ---- files -------------------------------------------------------------------------------------------

function axesFile(ws: KnowledgeWorkspace): string {
  return path.join(competitiveDir(ws, 'root'), 'axes.json')
}

function positionsFile(ws: KnowledgeWorkspace): string {
  return path.join(competitiveDir(ws, 'root'), 'positions.json')
}

/** The owner's axes, validated, or null when none were chosen. A hand-edited invalid file is refused, never guessed at. */
export function readAxes(ws: KnowledgeWorkspace): AxesRecord | null {
  assertOwnerProcess()
  const doc = readJson<AxesRecord>(ws, axesFile(ws), 'competitive_axes')
  return doc ? checkAxesRecord(doc) : null
}

/** `brand:competitive axes set`: the owner's two axes. Replaces the previous choice; positions keep citing axis ids. */
export function setAxes(ws: KnowledgeWorkspace, input: { x: unknown; y: unknown }): AxesRecord {
  assertOwnerProcess()
  const axes = validateAxes(input)
  const doc: AxesRecord = { schema_version: COMPETITIVE_SCHEMA_VERSION, kind: 'competitive_axes', brand_slug: ws.brandSlug, x: axes.x, y: axes.y, updated_at: ws.now().toISOString() }
  locked(ws, 'competitive-axes', () => writeJson(ws, axesFile(ws), doc))
  return doc
}

function checkPositions(doc: PositionsRecord): PositionsRecord {
  const bad = (why: string) => new CompetitiveError('invalid_record', `${path.basename(POSITIONS_RECORD_PATH)} is not valid: ${why}.`)
  if (doc.schema_version !== COMPETITIVE_SCHEMA_VERSION || !Array.isArray(doc.positions)) throw bad('unknown schema')
  if (doc.positions.length > POSITIONING_LIMITS.maxPositions) throw bad('too many positions')
  for (const p of doc.positions) {
    if (!p || typeof p !== 'object' || typeof p.position_id !== 'string' || !POSITION_ID.test(p.position_id)) throw bad('a position id is malformed')
    if (p.subject !== OWN_SUBJECT && (typeof p.subject !== 'string' || !/^cmp_[0-9a-f-]{36}$/.test(p.subject))) throw bad(`${p.position_id} has an unknown subject`)
    if (typeof p.axis_id !== 'string' || !AXIS_ID.test(p.axis_id)) throw bad(`${p.position_id} has a malformed axis id`)
    if (!(POSITION_BANDS as readonly string[]).includes(p.band)) throw bad(`${p.position_id} has an unknown band`)
    const e = p.evidence as EvidenceRef | undefined
    if (!e || typeof e.note_id !== 'string' || typeof e.revision !== 'string' || typeof e.claim_key !== 'string' || typeof e.observed_at !== 'string') throw bad(`${p.position_id} has no evidence`)
  }
  return doc
}

export function readPositions(ws: KnowledgeWorkspace): PositionRecord[] {
  assertOwnerProcess()
  const doc = readJson<PositionsRecord>(ws, positionsFile(ws), 'competitive_positions')
  return doc ? checkPositions(doc).positions : []
}

function writePositions(ws: KnowledgeWorkspace, positions: PositionRecord[]): void {
  const doc: PositionsRecord = { schema_version: COMPETITIVE_SCHEMA_VERSION, kind: 'competitive_positions', brand_slug: ws.brandSlug, positions, updated_at: ws.now().toISOString() }
  writeJson(ws, positionsFile(ws), doc)
}

export interface AddPositionInput {
  /** `own` or a competitor id. */
  subject: string
  axis_id: string
  band: unknown
  note: string
  claim_key: string
}

/**
 * `brand:competitive position add`: one band on one of the owner's axes, citing a research note and claim. The note
 * is checked like any competitor evidence (this brand, topic market_observation, current revision, a supporting
 * excerpt). Nothing is copied from it. The same subject, axis and claim at the same revision returns the existing
 * position; a different band from the same claim is a conflict the owner must see, so it is recorded, not replaced.
 */
export function addPosition(ws: KnowledgeWorkspace, input: AddPositionInput): { position: PositionRecord; outcome: 'recorded' | 'existing' } {
  assertOwnerProcess()
  const axes = readAxes(ws)
  if (!axes) throw new CompetitiveError('refused', 'Choose the two axes first: npm run brand:competitive -- axes set …')
  const axisIds = [axes.x.axis_id, axes.y.axis_id]
  if (!axisIds.includes(input.axis_id)) throw new CompetitiveError('invalid_input', `axis must be one of your axes: ${axisIds.join(', ')}.`)
  const band = oneOf(input.band, POSITION_BANDS, 'band')
  const subject = input.subject === OWN_SUBJECT ? OWN_SUBJECT : validateCompetitorId(input.subject)
  if (subject !== OWN_SUBJECT) readCandidate(ws, subject)
  const resolved = resolveEvidence(ws, input.note, input.claim_key)
  return locked(ws, 'competitive-positions', () => {
    const positions = readPositions(ws)
    const same = positions.find((p) => p.subject === subject && p.axis_id === input.axis_id && p.band === band && p.evidence.note_id === resolved.ref.note_id && p.evidence.claim_key === resolved.ref.claim_key && p.evidence.revision === resolved.ref.revision)
    if (same) return { position: same, outcome: 'existing' as const }
    if (positions.length >= POSITIONING_LIMITS.maxPositions) throw new CompetitiveError('refused', `At most ${POSITIONING_LIMITS.maxPositions} positions per brand.`)
    const position: PositionRecord = { position_id: `pos_${crypto.randomUUID()}`, subject, axis_id: input.axis_id, band, evidence: resolved.ref, recorded_at: ws.now().toISOString() }
    writePositions(ws, [...positions, position])
    return { position, outcome: 'recorded' as const }
  })
}

/** `brand:competitive position remove`: the owner withdraws one position. */
export function removePosition(ws: KnowledgeWorkspace, positionId: string): PositionRecord {
  assertOwnerProcess()
  if (typeof positionId !== 'string' || !POSITION_ID.test(positionId)) throw new CompetitiveError('invalid_input', 'A position id looks like pos_<uuid>.')
  return locked(ws, 'competitive-positions', () => {
    const positions = readPositions(ws)
    const found = positions.find((p) => p.position_id === positionId)
    if (!found) throw new CompetitiveError('not_found', `No position ${positionId} in this brand.`)
    writePositions(
      ws,
      positions.filter((p) => p.position_id !== positionId),
    )
    return found
  })
}

// ---- reading against the evidence ---------------------------------------------------------------------

export interface PlacementSource {
  source_class: SourceClass | null
  /** Public host of a web source; null for owner or first-party sources. Never a URL. */
  host: string | null
  observed_on: string
}

export interface Placement {
  state: PlacementState
  /** Bands as recorded, low to high. One when evidenced or stale; the recorded range when conflicting; none otherwise. */
  bands: PositionBand[]
  sources: PlacementSource[]
}

export interface PositionView {
  position_id: string
  subject: string
  axis_id: string
  band: PositionBand
  ref: string
  claim_key: string
  observed_on: string
  /** How this one citation reads now. */
  state: 'current' | 'stale' | 'conflicting' | 'needs_review'
  source: PlacementSource
}

const PUBLIC_WEB: ReadonlySet<SourceClass> = new Set(['competitor_own_page', 'platform_documentation', 'independent_reporting', 'analyst_inference'])

function dayOf(iso: string): string {
  const day = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '0000-00-00'
}

/** Each position as it reads now. `domains` maps competitor ids to their claimed domain (own-page detection). */
export function viewPositions(evidence: EvidenceSet, positions: PositionRecord[], domains: Map<string, string | null>, publicHost: (noteId: string) => string | null): PositionView[] {
  return positions.map((p) => {
    const { state: ref, item } = refState(evidence, p.evidence)
    const contradicted = evidenceFor(evidence, p.evidence.claim_key).contradicting.length > 0
    const state: PositionView['state'] = ref !== 'current' && ref !== 'stale' ? 'needs_review' : contradicted ? 'conflicting' : ref === 'stale' ? 'stale' : 'current'
    const cls = item ? sourceClass(item, p.subject === OWN_SUBJECT ? null : (domains.get(p.subject) ?? null)) : null
    return {
      position_id: p.position_id,
      subject: p.subject,
      axis_id: p.axis_id,
      band: p.band,
      ref: `knowledge:${p.evidence.note_id}@${p.evidence.revision}`,
      claim_key: p.evidence.claim_key,
      observed_on: dayOf(p.evidence.observed_at),
      state,
      source: { source_class: cls, host: cls && PUBLIC_WEB.has(cls) ? publicHost(p.evidence.note_id) : null, observed_on: dayOf(p.evidence.observed_at) },
    }
  })
}

/** Aggregates one subject's citations on one axis. Disagreement is shown as a range, never resolved. */
export function placementOf(views: PositionView[]): Placement {
  const usable = views.filter((v) => v.state !== 'needs_review')
  if (!usable.length) return { state: views.length ? 'needs_review' : 'unknown', bands: [], sources: [] }
  const bands = POSITION_BANDS.filter((band) => usable.some((v) => v.band === band))
  const state: PlacementState = bands.length > 1 || usable.some((v) => v.state === 'conflicting') ? 'conflicting' : usable.every((v) => v.state === 'stale') ? 'stale' : 'evidenced'
  const sources = new Map<string, PlacementSource>()
  for (const v of [...usable].sort((a, b) => b.observed_on.localeCompare(a.observed_on) || a.position_id.localeCompare(b.position_id))) {
    const key = `${v.source.source_class ?? '-'}|${v.source.host ?? '-'}|${v.source.observed_on}`
    if (sources.size < POSITIONING_LIMITS.maxSourcesPerPlacement) sources.set(key, v.source)
  }
  return { state, bands, sources: [...sources.values()] }
}

/** Loads the owner's axes and positions with their current reading, for the CLI and the share path. */
export function positioningLandscape(
  ws: KnowledgeWorkspace,
  opts: { now?: Date; domains: Map<string, string | null>; publicHost: (noteId: string) => string | null; evidence?: EvidenceSet },
): { axes: AxesRecord | null; views: PositionView[]; retired: number } {
  assertOwnerProcess()
  const axes = readAxes(ws)
  const positions = readPositions(ws)
  if (!axes) return { axes, views: [], retired: positions.length }
  const ids = new Set([axes.x.axis_id, axes.y.axis_id])
  const current = positions.filter((p) => ids.has(p.axis_id))
  const evidence = opts.evidence ?? loadEvidence(ws, { now: opts.now ?? ws.now() })
  return { axes, views: viewPositions(evidence, current, opts.domains, opts.publicHost), retired: positions.length - current.length }
}
