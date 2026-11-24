import crypto from 'node:crypto'
import path from 'node:path'
import { KnowledgeError } from '../knowledge/model.js'
import { credentialFindings } from '../knowledge/safety.js'
import { dirUsable, safeRead, withLock, writeVaultFile, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import { StrategyError } from '../strategy/model.js'
import { assertOwnerProcess } from '../strategy/store.js'
import { validateWeekId } from './calendar-model.js'

/**
 * Produced / published reports for calendar slots (Content Bridge Slice C): observations, never decisions.
 *
 * - An agent with the `content-read` token, or the owner, appends one observation: a slot of a served week was produced,
 *   or published at an https URL. The URL is validated and never fetched.
 * - Observations live next to, never inside, the calendar: `brand/.private/content/observations/<week_id>.json`
 *   (git-ignored). The approved week revision, its hash, the strategy and the facts are never changed by them, and
 *   nothing reads them to change strategy. They grant no publication, schedule or spend permission.
 * - Each observation pins the week revision and content hash it was reported against, so a report on a replaced week
 *   stays visibly tied to the old revision.
 * - Storage reuses the Knowledge vault helpers (lock, atomic private write, no symlinks), the same as the calendar.
 */

export const OBSERVATIONS_DIR = 'brand/.private/content/observations'
export const OBSERVATION_STATUSES = ['produced', 'published'] as const
export type ObservationStatus = (typeof OBSERVATION_STATUSES)[number]
export const OBSERVATION_LIMITS = { maxPerWeek: 400, maxUrlChars: 500, maxFileBytes: 512 * 1024 } as const
const OBSERVATION_ID = /^cob_[0-9a-f]{32}$/
const SLOT_ID = /^s\d{2,3}$/

export interface ContentObservation {
  observation_id: string
  week_id: string
  slot_id: string
  /** The served week revision and hash the report was made against. */
  week_revision: number
  week_content_sha256: string
  status: ObservationStatus
  /** https only; null for `produced` without a link. Never fetched. */
  url: string | null
  reported_at: string
  /** `agent-token:agt_…` or the owner process. */
  reporter: string
  profile: string | null
}

interface ObservationFile {
  schema_version: 1
  kind: 'content_observations'
  brand_slug: string
  week_id: string
  observations: ContentObservation[]
}

/** Why a URL is refused, as a stable code (the caller prints it in the reader's language), or null when it is fine. */
export type UrlProblem = 'url_not_https' | 'url_too_long' | 'url_invalid' | 'url_credentials' | 'url_host'

export function urlProblem(value: string): UrlProblem | null {
  if (value.length > OBSERVATION_LIMITS.maxUrlChars) return 'url_too_long'
  if (/\s/.test(value)) return 'url_invalid'
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'url_invalid'
  }
  if (url.protocol !== 'https:') return 'url_not_https'
  if (url.username || url.password) return 'url_credentials'
  const host = url.hostname.toLowerCase()
  // A public post has a public host name: no localhost, bare names or IP literals.
  if (!host.includes('.') || host.endsWith('.localhost') || host.endsWith('.local') || /^[\d.]+$/.test(host) || host.startsWith('[')) return 'url_host'
  if (credentialFindings(value).length) return 'url_credentials'
  return null
}

function observationsFile(ws: KnowledgeWorkspace, weekId: string): string {
  return path.join(ws.root, ...OBSERVATIONS_DIR.split('/'), `${validateWeekId(weekId)}.json`)
}

function emptyFile(ws: KnowledgeWorkspace, weekId: string): ObservationFile {
  return { schema_version: 1, kind: 'content_observations', brand_slug: ws.brandSlug, week_id: weekId, observations: [] }
}

function validObservation(item: unknown, weekId: string): item is ContentObservation {
  if (!item || typeof item !== 'object') return false
  const o = item as Record<string, unknown>
  return (
    typeof o.observation_id === 'string' &&
    OBSERVATION_ID.test(o.observation_id) &&
    o.week_id === weekId &&
    typeof o.slot_id === 'string' &&
    SLOT_ID.test(o.slot_id) &&
    typeof o.week_revision === 'number' &&
    typeof o.week_content_sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(o.week_content_sha256) &&
    (OBSERVATION_STATUSES as readonly unknown[]).includes(o.status) &&
    (o.url === null || (typeof o.url === 'string' && urlProblem(o.url) === null)) &&
    typeof o.reported_at === 'string' &&
    typeof o.reporter === 'string'
  )
}

/** The observations of one week, oldest first. A missing file is empty; a corrupt or foreign file reads as empty. */
export function readObservations(ws: KnowledgeWorkspace, weekId: string): ContentObservation[] {
  const file = observationsFile(ws, weekId)
  if (!dirUsable(ws, path.dirname(file))) return []
  let raw: Buffer | null
  try {
    raw = safeRead(file, OBSERVATION_LIMITS.maxFileBytes)
  } catch (error) {
    if (error instanceof KnowledgeError) return []
    throw error
  }
  if (!raw) return []
  try {
    const doc = JSON.parse(raw.toString('utf8')) as ObservationFile
    if (doc?.kind !== 'content_observations' || doc.brand_slug !== ws.brandSlug || doc.week_id !== weekId || !Array.isArray(doc.observations)) return []
    return doc.observations.filter((item) => validObservation(item, weekId))
  } catch {
    return []
  }
}

/** The latest observation per slot of one week revision (a report against another revision is not carried over). */
export function latestBySlot(observations: ContentObservation[], revision: number, sha: string): Map<string, ContentObservation> {
  const out = new Map<string, ContentObservation>()
  for (const item of observations) if (item.week_revision === revision && item.week_content_sha256 === sha) out.set(item.slot_id, item)
  return out
}

export interface AppendInput {
  week_id: string
  slot_id: string
  week_revision: number
  week_content_sha256: string
  status: ObservationStatus
  url: string | null
  reporter: string
  profile: string | null
}

/**
 * Appends one observation. The caller has already checked that the slot belongs to the served revision. The same
 * report twice (slot, revision, status, URL) is not stored again: the earlier observation is returned.
 */
export function appendObservation(ws: KnowledgeWorkspace, input: AppendInput): { observation: ContentObservation; duplicate: boolean } {
  const weekId = validateWeekId(input.week_id)
  if (!SLOT_ID.test(input.slot_id)) throw new StrategyError('invalid_input', 'slot_id is not valid.')
  if (!(OBSERVATION_STATUSES as readonly string[]).includes(input.status)) throw new StrategyError('invalid_input', 'status must be produced or published.')
  if (input.url !== null && urlProblem(input.url)) throw new StrategyError('invalid_input', `url is refused (${urlProblem(input.url)}).`)
  if (input.status === 'published' && input.url === null) throw new StrategyError('invalid_input', 'A published report needs its https URL.')
  return withLock(ws, `content-obs-${weekId}`, () => {
    const file = observationsFile(ws, weekId)
    const doc = emptyFile(ws, weekId)
    doc.observations = readObservations(ws, weekId)
    const same = doc.observations.find(
      (item) => item.slot_id === input.slot_id && item.week_revision === input.week_revision && item.week_content_sha256 === input.week_content_sha256 && item.status === input.status && item.url === input.url,
    )
    if (same) return { observation: same, duplicate: true }
    if (doc.observations.length >= OBSERVATION_LIMITS.maxPerWeek) throw new StrategyError('invalid_input', `At most ${OBSERVATION_LIMITS.maxPerWeek} reports per week.`)
    const observation: ContentObservation = {
      observation_id: `cob_${crypto.randomUUID().replace(/-/g, '')}`,
      week_id: weekId,
      slot_id: input.slot_id,
      week_revision: input.week_revision,
      week_content_sha256: input.week_content_sha256,
      status: input.status,
      url: input.url,
      reported_at: ws.now().toISOString(),
      reporter: input.reporter,
      profile: input.profile,
    }
    doc.observations.push(observation)
    writeVaultFile(ws, file, `${JSON.stringify(doc, null, 2)}\n`, true)
    return { observation, duplicate: false }
  })
}

/** Owner overview: every observation of one week, or of every week with a file. */
export function listObservations(ws: KnowledgeWorkspace, weekIds: string[]): ContentObservation[] {
  assertOwnerProcess()
  return weekIds.flatMap((id) => readObservations(ws, id))
}
