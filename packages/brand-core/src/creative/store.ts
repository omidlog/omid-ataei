import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { AGENT_TOKEN_ENV } from '../agent-tokens.js'
import { approvalProofMatches } from '../private-store.js'
import { safetyBlocksSharing, safetyReport } from '../knowledge/safety.js'
import { captureNote, findNote, type LoadedNote } from '../knowledge/store.js'
import { KnowledgeError } from '../knowledge/model.js'
import { dirUsable, ensureDir, safeRead, withLock, writeVaultFile, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import {
  asAspects,
  asFeedbackSourceKind,
  asRights,
  asScopeLevel,
  asSurface,
  asVerdict,
  CREATIVE_LIMITS,
  CREATIVE_SCHEMA_VERSION,
  CreativeError,
  FEEDBACK_SOURCE_KINDS,
  newFeedbackId,
  newPreferenceId,
  preferenceDigest,
  shortText,
  validateAssetId,
  validatePreferenceId,
  validateProjectId,
  validateSeries,
  validateVariantId,
  type Aspect,
  type CreativePreference,
  type CreativeProject,
  type FeedbackEvent,
  type FeedbackSourceKind,
  type InspirationRights,
  type NoteRef,
  type PreferenceScope,
  type Surface,
  type Variant,
  type VariantAsset,
  type Verdict,
} from './model.js'

/**
 * Creative records live in brand/.private/creative (gitignored, excluded from Studio and docs builds). Paths are
 * built from validated ids only. Reads never follow symlinks; writes are atomic and 0600 (knowledge workspace
 * helpers). Every function refuses to run under an agent token: creative memory is the owner's local data and has no
 * agent profile yet.
 */

export const CREATIVE_DIRS = {
  root: 'brand/.private/creative',
  projects: 'brand/.private/creative/projects',
  preferences: 'brand/.private/creative/preferences',
  aspects: 'brand/.private/creative/aspect-proposals',
} as const

export function creativeDir(ws: KnowledgeWorkspace, key: keyof typeof CREATIVE_DIRS): string {
  return path.join(ws.root, ...CREATIVE_DIRS[key].split('/'))
}

/** An agent holding a token is not the owner. No creative read or write is answered for it. */
export function assertOwnerProcess(): void {
  if (process.env[AGENT_TOKEN_ENV]) {
    throw new CreativeError('refused', `Creative memory is the owner's local data. Refusing while ${AGENT_TOKEN_ENV} is set; no agent profile covers it.`)
  }
}

export function readRecord<T extends { kind: string; brand_slug: string }>(ws: KnowledgeWorkspace, file: string, kind: string): T | null {
  if (!dirUsable(ws, path.dirname(file))) return null
  let raw: Buffer | null
  try {
    raw = safeRead(file, 2 * 1024 * 1024)
  } catch (error) {
    if (error instanceof KnowledgeError) throw new CreativeError('unsafe_path', error.message)
    throw error
  }
  if (!raw) return null
  let doc: T
  try {
    doc = JSON.parse(raw.toString('utf8')) as T
  } catch {
    throw new CreativeError('invalid_record', `${path.basename(file)} is not valid JSON.`)
  }
  if (!doc || typeof doc !== 'object' || doc.kind !== kind) throw new CreativeError('invalid_record', `${path.basename(file)} is not a ${kind} record.`)
  if (doc.brand_slug !== ws.brandSlug) throw new CreativeError('wrong_brand', `${path.basename(file)} belongs to another brand. It is not read.`)
  return doc
}

export function writeRecord(ws: KnowledgeWorkspace, file: string, doc: unknown): void {
  ensureDir(ws, path.dirname(file))
  writeVaultFile(ws, file, `${JSON.stringify(doc, null, 2)}\n`, true)
}

function projectFile(ws: KnowledgeWorkspace, id: string): string {
  return path.join(creativeDir(ws, 'projects'), `${validateProjectId(id)}.json`)
}

function preferenceFile(ws: KnowledgeWorkspace, id: string): string {
  return path.join(creativeDir(ws, 'preferences'), `${validatePreferenceId(id)}.json`)
}

export function readProject(ws: KnowledgeWorkspace, id: string): CreativeProject {
  assertOwnerProcess()
  return loadProject(ws, id)
}

/**
 * Reads without the owner-process check. Only for callers that authorized the reader themselves (the
 * creative-read agent tool in agent.ts). Never export a write built on these.
 */
export function loadProject(ws: KnowledgeWorkspace, id: string): CreativeProject {
  const doc = readRecord<CreativeProject>(ws, projectFile(ws, id), 'creative_project')
  if (!doc) throw new CreativeError('not_found', `No creative project ${id} in this brand.`)
  if (doc.project_id !== id) throw new CreativeError('invalid_record', `The file for ${id} carries another project id.`)
  return doc
}

export function listProjects(ws: KnowledgeWorkspace): CreativeProject[] {
  assertOwnerProcess()
  return scanProjects(ws)
}

/** listProjects without the owner-process check (see loadProject). */
export function scanProjects(ws: KnowledgeWorkspace): CreativeProject[] {
  const folder = creativeDir(ws, 'projects')
  if (!dirUsable(ws, folder)) return []
  const out: CreativeProject[] = []
  for (const name of fs.readdirSync(folder).sort()) {
    const match = /^([a-z0-9][a-z0-9-]{2,39})\.json$/.exec(name)
    if (!match) continue
    try {
      out.push(loadProject(ws, match[1]!))
    } catch (error) {
      // Another brand's file, a symlink or a corrupt record is skipped, never partially read.
      if (!(error instanceof CreativeError)) throw error
    }
  }
  return out
}

export function readPreference(ws: KnowledgeWorkspace, id: string): CreativePreference {
  assertOwnerProcess()
  return loadPreference(ws, id)
}

/** readPreference without the owner-process check (see loadProject). */
export function loadPreference(ws: KnowledgeWorkspace, id: string): CreativePreference {
  const doc = readRecord<CreativePreference>(ws, preferenceFile(ws, id), 'creative_preference')
  if (!doc) throw new CreativeError('not_found', `No creative preference ${id} in this brand.`)
  if (doc.preference_id !== id) throw new CreativeError('invalid_record', `The file for ${id} carries another preference id.`)
  return doc
}

export function listPreferences(ws: KnowledgeWorkspace): CreativePreference[] {
  assertOwnerProcess()
  return scanPreferences(ws)
}

/** listPreferences without the owner-process check (see loadProject). */
export function scanPreferences(ws: KnowledgeWorkspace): CreativePreference[] {
  const folder = creativeDir(ws, 'preferences')
  if (!dirUsable(ws, folder)) return []
  const out: CreativePreference[] = []
  for (const name of fs.readdirSync(folder).sort()) {
    const match = /^(cp_[0-9a-f-]{36})\.json$/.exec(name)
    if (!match) continue
    try {
      out.push(loadPreference(ws, match[1]!))
    } catch (error) {
      if (!(error instanceof CreativeError)) throw error
    }
  }
  return out.sort((a, b) => a.created_at.localeCompare(b.created_at))
}

function lockName(projectId: string): string {
  return `creative-${projectId}`
}

export function updateProject(ws: KnowledgeWorkspace, id: string, change: (project: CreativeProject) => void): CreativeProject {
  return withLock(ws, lockName(validateProjectId(id)), () => {
    const project = readProject(ws, id)
    change(project)
    project.updated_at = ws.now().toISOString()
    writeRecord(ws, projectFile(ws, id), project)
    return project
  })
}

/**
 * A note the owner wrote (or an agent recorded from the owner) in this brand's local or shared Knowledge Inbox.
 * Restricted notes are never linked: their text must not reach retrieval.
 */
function linkableNote(ws: KnowledgeWorkspace, id: string): LoadedNote {
  let loaded: LoadedNote
  try {
    loaded = findNote(ws, id)
  } catch (error) {
    if (error instanceof KnowledgeError) throw new CreativeError(error.code === 'not_found' || error.code === 'invalid_id' ? 'not_found' : 'refused', `Knowledge note ${typeof id === 'string' ? id.slice(0, 80) : ''}: ${error.message}`)
    throw error
  }
  if (loaded.note.meta.classification !== 'internal') throw new CreativeError('refused', 'Restricted notes are never linked to creative projects.')
  return loaded
}

function refOf(loaded: LoadedNote): NoteRef {
  return { id: loaded.id, revision: loaded.revision }
}

// ---- projects and variants ---------------------------------------------------------------------------

export interface CreateProjectInput {
  project_id: string
  title: string
  surface: string
  series: string
  language?: string | null
  inspirations?: Array<{ note_id: string; rights?: string }>
}

export function createProject(ws: KnowledgeWorkspace, input: CreateProjectInput): CreativeProject {
  assertOwnerProcess()
  const id = validateProjectId(input.project_id)
  const title = shortText(input.title, CREATIVE_LIMITS.maxTitleChars, 'Title')
  if (!title) throw new CreativeError('invalid_input', 'A project needs a title.')
  const surface: Surface = asSurface(input.surface)
  const series = validateSeries(input.series)
  const language = input.language ? (/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(input.language) ? input.language : null) : null
  if (input.language && !language) throw new CreativeError('invalid_input', 'Language must be a code such as en, fa or tr.')
  const inspirations = (input.inspirations ?? []).map((item) => ({ note: refOf(linkableNote(ws, item.note_id)), rights: asRights(item.rights ?? 'unknown') as InspirationRights }))
  if (inspirations.length > CREATIVE_LIMITS.maxInspirations) throw new CreativeError('invalid_input', `At most ${CREATIVE_LIMITS.maxInspirations} inspirations.`)
  const now = ws.now().toISOString()
  const project: CreativeProject = {
    schema_version: CREATIVE_SCHEMA_VERSION,
    kind: 'creative_project',
    project_id: id,
    brand_slug: ws.brandSlug,
    title,
    surface,
    series,
    language,
    inspirations,
    variants: [],
    feedback: [],
    selection: null,
    created_at: now,
    updated_at: now,
  }
  return withLock(ws, lockName(id), () => {
    if (readRecord(ws, projectFile(ws, id), 'creative_project')) throw new CreativeError('exists', `Project ${id} already exists.`)
    writeRecord(ws, projectFile(ws, id), project)
    return project
  })
}

/** Looks the asset up in brand/assets/asset-manifest.yaml. Never accepts a path, URL or invented file. */
export function resolveAsset(root: string, asset: string): VariantAsset {
  if (asset === 'missing') return { state: 'missing' }
  const id = validateAssetId(asset)
  const file = path.join(root, 'brand', 'assets', 'asset-manifest.yaml')
  let rows: Array<Record<string, unknown>> = []
  try {
    rows = ((parse(fs.readFileSync(file, 'utf8')) as { assets?: Array<Record<string, unknown>> } | null)?.assets ?? []).filter((row) => row && typeof row === 'object')
  } catch {
    rows = []
  }
  const row = rows.find((item) => item.id === id)
  if (!row) throw new CreativeError('invalid_input', `Asset ${id} is not in brand/assets/asset-manifest.yaml. Register the real file there first, or use --asset missing.`)
  return { state: 'manifest', asset_id: id, checksum_sha256: typeof row.checksum_sha256 === 'string' ? row.checksum_sha256 : null, present: row.present === true }
}

export function addVariant(ws: KnowledgeWorkspace, input: { project_id: string; variant_id: string; asset: string; describe?: string | null }): Variant {
  assertOwnerProcess()
  const variantId = validateVariantId(input.variant_id)
  const asset = resolveAsset(ws.root, input.asset)
  const describe = shortText(input.describe, CREATIVE_LIMITS.maxDescribeChars, 'Description')
  let added: Variant | null = null
  updateProject(ws, input.project_id, (project) => {
    if (project.variants.some((item) => item.variant_id === variantId)) throw new CreativeError('exists', `Variant ${variantId} already exists in ${project.project_id}. Variants are never overwritten; add a new id.`)
    if (project.variants.length >= CREATIVE_LIMITS.maxVariants) throw new CreativeError('invalid_input', `At most ${CREATIVE_LIMITS.maxVariants} variants.`)
    added = { variant_id: variantId, status: 'draft', asset, describe, created_at: ws.now().toISOString() }
    project.variants.push(added)
  })
  return added!
}

// ---- feedback ------------------------------------------------------------------------------------------

export interface FeedbackInput {
  project_id: string
  variant_id: string
  /** Verbatim owner words. Stored as a new Knowledge note, never in the creative record. */
  text?: string
  /** Or an existing Knowledge note with the owner's words. */
  note_id?: string
  language?: string | null
  source_kind?: string
  verdict?: string
  keep?: string[]
  avoid?: string[]
}

export interface FeedbackResult {
  feedback: FeedbackEvent
  note: { id: string; revision: string; path: string; scope: string; captured: boolean }
  variant_status: Variant['status']
}

/**
 * Records owner feedback on one variant. The words go to the Knowledge Inbox (captureNote, local, tagged
 * creative-feedback, source.ref creative:<project>/<variant>); the project stores the note id and revision only.
 */
export function recordFeedback(ws: KnowledgeWorkspace, input: FeedbackInput): FeedbackResult {
  assertOwnerProcess()
  const projectId = validateProjectId(input.project_id)
  const variantId = validateVariantId(input.variant_id)
  const verdict: Verdict = asVerdict(input.verdict ?? 'observation')
  const keep: Aspect[] = asAspects(input.keep)
  const avoid: Aspect[] = asAspects(input.avoid)
  if (keep.some((aspect) => avoid.includes(aspect))) throw new CreativeError('invalid_input', 'An aspect cannot be both keep and avoid in one feedback.')
  if ((input.text === undefined) === (input.note_id === undefined)) throw new CreativeError('invalid_input', 'Give the owner’s words with --text/--file, or link an existing note with --note (not both).')
  const project = readProject(ws, projectId)
  if (!project.variants.some((item) => item.variant_id === variantId)) throw new CreativeError('not_found', `No variant ${variantId} in ${projectId}.`)
  if (verdict === 'reject' && project.selection?.variant_id === variantId) throw new CreativeError('refused', `${variantId} is the selected variant. Select another variant first, then reject this one.`)

  let note: FeedbackResult['note']
  let sourceKind: FeedbackSourceKind
  if (input.text !== undefined) {
    sourceKind = asFeedbackSourceKind(input.source_kind ?? 'owner_note')
    if (!input.text.trim()) throw new CreativeError('invalid_input', 'The feedback text is empty.')
    try {
      const captured = captureNote(ws, {
        title: `Creative feedback: ${projectId} variant ${variantId}`,
        body: input.text,
        kind: 'general',
        language: input.language ?? project.language,
        tags: ['creative-feedback', `proj-${projectId}`, `variant-${variantId.toLowerCase()}`],
        source: { kind: sourceKind, ref: `creative:${projectId}/${variantId}` },
      })
      note = { id: captured.id, revision: captured.revision, path: captured.path, scope: captured.scope, captured: true }
    } catch (error) {
      if (error instanceof KnowledgeError) throw new CreativeError(error.code === 'refused' ? 'refused' : 'invalid_input', error.message)
      throw error
    }
  } else {
    const loaded = linkableNote(ws, input.note_id!)
    const kind = loaded.note.meta.source.kind
    if (!(FEEDBACK_SOURCE_KINDS as readonly string[]).includes(kind)) {
      throw new CreativeError('refused', `Note ${loaded.id} is ${kind} (third-party material), not the owner's words. Link it as an inspiration instead.`)
    }
    if (input.source_kind !== undefined && input.source_kind !== kind) throw new CreativeError('invalid_input', `Note ${loaded.id} has source kind ${kind}; --source-kind cannot change it.`)
    sourceKind = kind as FeedbackSourceKind
    note = { id: loaded.id, revision: loaded.revision, path: loaded.path, scope: loaded.scope, captured: false }
  }

  const event: FeedbackEvent = {
    feedback_id: newFeedbackId(),
    variant_id: variantId,
    note: { id: note.id, revision: note.revision },
    source_kind: sourceKind,
    verdict,
    keep,
    avoid,
    recorded_at: ws.now().toISOString(),
  }
  let status: Variant['status'] = 'draft'
  updateProject(ws, projectId, (current) => {
    if (current.feedback.length >= CREATIVE_LIMITS.maxFeedback) throw new CreativeError('invalid_input', `At most ${CREATIVE_LIMITS.maxFeedback} feedback events per project.`)
    current.feedback.push(event)
    const variant = current.variants.find((item) => item.variant_id === variantId)!
    if (verdict === 'reject') variant.status = 'rejected'
    status = variant.status
  })
  return { feedback: event, note, variant_status: status }
}

/** Marks the owner's choice for this project. Not publication, not brand-wide approval, not measured performance. */
export function selectVariant(ws: KnowledgeWorkspace, input: { project_id: string; variant_id: string }): CreativeProject {
  assertOwnerProcess()
  const variantId = validateVariantId(input.variant_id)
  return updateProject(ws, input.project_id, (project) => {
    const variant = project.variants.find((item) => item.variant_id === variantId)
    if (!variant) throw new CreativeError('not_found', `No variant ${variantId} in ${project.project_id}.`)
    for (const item of project.variants) if (item.status === 'selected') item.status = 'draft'
    variant.status = 'selected'
    project.selection = { variant_id: variantId, meaning: 'owner_selected_for_this_project', selected_at: ws.now().toISOString() }
  })
}

// ---- scoped preferences ----------------------------------------------------------------------------------

export interface SuggestInput {
  project_id: string
  statement: string
  context?: string | null
  sources: string[]
  counterexamples?: Array<{ project_id?: string; variant_id: string }>
  supersedes?: string | null
}

function checkSafeLabel(text: string, field: string): void {
  const blocked = safetyBlocksSharing(safetyReport(text))
  if (blocked.length) throw new CreativeError('refused', `${field} looks like it contains ${blocked.join('; ')}. Nothing was written.`)
}

/**
 * A draft, project-scoped preference. It is labelled unverified and has no effect until the owner approves it.
 * Sources must be owner-words Knowledge notes; their current revisions are recorded.
 */
export function suggestPreference(ws: KnowledgeWorkspace, input: SuggestInput): CreativePreference {
  assertOwnerProcess()
  const project = readProject(ws, validateProjectId(input.project_id))
  const statement = shortText(input.statement, CREATIVE_LIMITS.maxStatementChars, 'Statement')
  if (!statement) throw new CreativeError('invalid_input', 'A preference needs a short statement.')
  const context = shortText(input.context, CREATIVE_LIMITS.maxContextChars, 'Context')
  checkSafeLabel(`${statement}\n${context ?? ''}`, 'The statement or context')
  const ids = [...new Set(input.sources ?? [])]
  if (ids.length === 0) throw new CreativeError('invalid_input', 'A preference needs at least one source note (--source kn_…).')
  if (ids.length > CREATIVE_LIMITS.maxSources) throw new CreativeError('invalid_input', `At most ${CREATIVE_LIMITS.maxSources} sources.`)
  const sources = ids.map((id) => {
    const loaded = linkableNote(ws, id)
    if (!(FEEDBACK_SOURCE_KINDS as readonly string[]).includes(loaded.note.meta.source.kind)) throw new CreativeError('refused', `Note ${loaded.id} is third-party material. A preference must rest on the owner's words.`)
    if (loaded.note.meta.status === 'archived') throw new CreativeError('refused', `Note ${loaded.id} is archived. Restore it or cite another note.`)
    return refOf(loaded)
  })
  const counterexamples = (input.counterexamples ?? []).map((item) => {
    const pid = validateProjectId(item.project_id ?? project.project_id)
    const vid = validateVariantId(item.variant_id)
    const owner = pid === project.project_id ? project : readProject(ws, pid)
    if (!owner.variants.some((variant) => variant.variant_id === vid)) throw new CreativeError('not_found', `No variant ${vid} in ${pid}.`)
    return { project_id: pid, variant_id: vid }
  })
  if (counterexamples.length > CREATIVE_LIMITS.maxCounterexamples) throw new CreativeError('invalid_input', `At most ${CREATIVE_LIMITS.maxCounterexamples} counterexamples.`)
  let supersedes: string | null = null
  if (input.supersedes) {
    const old = readPreference(ws, validatePreferenceId(input.supersedes))
    if (old.state !== 'approved') throw new CreativeError('refused', `${old.preference_id} is ${old.state}; only an approved preference can be superseded.`)
    supersedes = old.preference_id
  }
  const now = ws.now().toISOString()
  const pref: CreativePreference = {
    schema_version: CREATIVE_SCHEMA_VERSION,
    kind: 'creative_preference',
    preference_id: newPreferenceId(),
    brand_slug: ws.brandSlug,
    project_id: project.project_id,
    statement,
    context,
    scope: { level: 'project', project_id: project.project_id },
    sources,
    counterexamples,
    state: 'draft',
    supersedes,
    superseded_by: null,
    superseded_at: null,
    approval: null,
    created_at: now,
    updated_at: now,
  }
  writeRecord(ws, preferenceFile(ws, pref.preference_id), pref)
  return pref
}

/** Each source note's current state: same revision, edited since, archived, or gone. */
export function sourceStatus(ws: KnowledgeWorkspace, ref: NoteRef): { current: boolean; state: 'current' | 'stale' | 'archived' | 'missing'; loaded: LoadedNote | null } {
  let loaded: LoadedNote
  try {
    loaded = findNote(ws, ref.id)
  } catch (error) {
    if (error instanceof KnowledgeError) return { current: false, state: 'missing', loaded: null }
    throw error
  }
  if (loaded.note.meta.classification !== 'internal') return { current: false, state: 'missing', loaded: null }
  if (loaded.note.meta.status === 'archived') return { current: false, state: 'archived', loaded }
  return loaded.revision === ref.revision ? { current: true, state: 'current', loaded } : { current: false, state: 'stale', loaded }
}

export const BRAND_SCOPE_ROUTE =
  'A brand-wide rule is a brand fact. Creative preferences stop at project or series scope. To make it brand-wide, capture the rule in your own words as a Knowledge note, run brand:knowledge propose (drafts only), then brand:review and brand:approve.'

/**
 * Owner approval with the existing approval proof (brand/.private/approval-secret via BRAND_OS_APPROVAL_PROOF or the
 * hidden prompt). Scope: project (default) or series (the origin project's surface and series), named by the owner.
 * Approving a preference that supersedes another marks the old one superseded; both stay on disk.
 */
export function approvePreference(ws: KnowledgeWorkspace, input: { preference_id: string; proof: string | undefined; scope?: string }): { approved: CreativePreference; superseded: CreativePreference | null } {
  assertOwnerProcess()
  if (input.scope === 'brand') throw new CreativeError('refused', BRAND_SCOPE_ROUTE)
  const level = asScopeLevel(input.scope ?? 'project')
  if (!approvalProofMatches(ws.root, input.proof)) throw new CreativeError('proof', 'Approval refused: missing or wrong owner approval proof. Nothing was changed.')
  const id = validatePreferenceId(input.preference_id)
  return withLock(ws, 'creative-preferences', () => {
    const pref = readPreference(ws, id)
    if (pref.state !== 'draft') throw new CreativeError('refused', `${id} is ${pref.state}. Only a draft can be approved.`)
    for (const ref of pref.sources) {
      const status = sourceStatus(ws, ref)
      if (!status.current) throw new CreativeError('stale_source', `Source ${ref.id} is ${status.state} since this preference was suggested. Review it and suggest again. Nothing was approved.`)
    }
    const project = readProject(ws, pref.project_id)
    const scope: PreferenceScope = level === 'series' ? { level: 'series', surface: project.surface, series: project.series } : { level: 'project', project_id: project.project_id }
    let old: CreativePreference | null = null
    if (pref.supersedes) {
      old = readPreference(ws, pref.supersedes)
      if (old.state !== 'approved') throw new CreativeError('refused', `${old.preference_id} is ${old.state}; it cannot be superseded now.`)
    }
    const now = ws.now().toISOString()
    pref.scope = scope
    pref.state = 'approved'
    pref.approval = { approved_at: now, digest: preferenceDigest(pref), actor: 'owner' }
    pref.updated_at = now
    // The new approval is written first: if the second write fails, the old preference is still approved and
    // retrieval reports both, rather than leaving no approved preference at all.
    writeRecord(ws, preferenceFile(ws, pref.preference_id), pref)
    if (old) {
      old.state = 'superseded'
      old.superseded_by = pref.preference_id
      old.superseded_at = now
      old.updated_at = now
      writeRecord(ws, preferenceFile(ws, old.preference_id), old)
    }
    return { approved: pref, superseded: old }
  })
}
