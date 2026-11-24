import fs from 'node:fs'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { writeAtomic } from '@brand-os/brand-core'
import { COACH_RULE_VERSION } from '@brand-os/brand-core/coach'
import type { CommitSummary, GitHubClient, PullSummary } from './github/client.js'
import { GitHubError } from './github/client.js'
import { IDENTITY_MASTER_RULE, ProjectionError, type PreviewFile, type StudioProjection } from './projection.js'
import { runProjectionJob, type ProjectionJob, type ProjectionReply } from './projection-worker.js'
import { countPullChanges, type PullChanges } from './pull-changes.js'
import type { BrandRecord, Registry } from './registry.js'

/**
 * Fetches the merged default branch of a registered brand repository and caches its safe projection.
 *
 * The canonical Studio view is the last successfully fetched default-branch commit. A failed refresh
 * keeps the previous projection and marks it stale with the error, so the owner never sees a blank page
 * or a silently outdated one. Pull requests are listed as non-canonical metadata only.
 */
export interface SyncStatus {
  state: 'never' | 'ok' | 'error'
  sha: string | null
  committed_at: string | null
  synced_at: string | null
  checked_at: string | null
  attempted_at: string | null
  repo_private: boolean | null
  last_error: { code: string; message: string; at: string } | null
}

/**
 * An open pull request with what it would change (BOS-02). `changes` is null when the file list could not be read.
 * Unmerged and never canonical: these are counts only, cached with the history.
 */
export interface PendingPull extends PullSummary {
  changes?: PullChanges | null
}

export interface History {
  commits: CommitSummary[]
  pulls: PendingPull[]
  error: string | null
}

/**
 * The name Studio shows for a brand (BOS-20): the synced `brand.name` once the merged config marks it approved;
 * before the first sync, or while the name is not approved, the name recorded when the brand was registered.
 */
export function brandDisplayName(record: BrandRecord, projection: StudioProjection | null): string {
  const name = projection?.brand.name_status === 'approved' && typeof projection.brand.name === 'string' ? projection.brand.name.trim() : ''
  return name ? name.slice(0, 200) : record.display_name
}

/** The record with its display name resolved from the sync cache (BOS-20). The registry itself is not changed. */
export function withDisplayName(record: BrandRecord, projection: StudioProjection | null): BrandRecord {
  const display_name = brandDisplayName(record, projection)
  return display_name === record.display_name ? record : { ...record, display_name }
}

export interface CachedBrand {
  status: SyncStatus
  projection: StudioProjection | null
  history: History | null
}

interface StateFile extends CachedBrand {
  schema_version: 1
  previews: Record<string, string>
}

export interface SyncDeps {
  registry: Registry
  github: GitHubClient
  dataDir: string
  ttlMs: number
  now?: () => Date
  log?: (line: string) => void
  /**
   * Where the tarball is extracted and the projection built. `worker` (the default) keeps the request
   * event loop free during a sync, so pages and /healthz keep answering (BOS-14). `inline` is for tests.
   */
  projection?: 'worker' | 'inline'
}

/** The worker entry next to this module: `projection-worker.ts` under tsx, `projection-worker.mjs` in the bundle. */
function workerUrl(): URL {
  const here = import.meta.url
  const ext = here.endsWith('.ts') ? '.ts' : here.endsWith('.mjs') ? '.mjs' : '.js'
  return new URL(`./projection-worker${ext}`, here)
}

const WORKER_TIMEOUT_MS = 5 * 60_000

/** The worker could not run the job at all (it failed to load or exited without replying), as opposed to a timeout. */
class WorkerUnavailable extends Error {}

function projectInWorker(job: ProjectionJob): Promise<ProjectionReply> {
  return new Promise((resolve, reject) => {
    // The archive is copied, not transferred, so the inline fallback can still read it.
    const worker = new Worker(workerUrl(), { workerData: { kind: 'studio-projection', job } })
    let done = false
    const timer = setTimeout(() => {
      finish(() => reject(new Error('The projection build took too long.')))
      void worker.terminate()
    }, WORKER_TIMEOUT_MS)
    const finish = (fn: () => void) => {
      if (done) return
      done = true
      clearTimeout(timer)
      fn()
    }
    worker.once('message', (reply: ProjectionReply) => finish(() => resolve(reply)))
    worker.once('error', (error) => finish(() => reject(new WorkerUnavailable(error instanceof Error ? error.message : String(error)))))
    worker.once('exit', (code) => finish(() => reject(new WorkerUnavailable(`The projection worker exited with code ${code} before replying.`))))
  })
}

const EMPTY: SyncStatus = { state: 'never', sha: null, committed_at: null, synced_at: null, checked_at: null, attempted_at: null, repo_private: null, last_error: null }

export function brandIsReady(record: BrandRecord): boolean {
  return record.provisioning === null || record.provisioning.state === 'ready'
}

export class SyncService {
  private readonly running = new Map<string, Promise<CachedBrand>>()
  private readonly startedAt = new Map<string, string>()
  private readonly dirty = new Set<string>()
  private readonly now: () => Date

  constructor(private readonly deps: SyncDeps) {
    this.now = deps.now ?? (() => new Date())
    fs.mkdirSync(this.cacheRoot(), { recursive: true, mode: 0o700 })
  }

  private cacheRoot(): string {
    return path.join(this.deps.dataDir, 'cache')
  }

  /** Slugs come from the registry, are validated there, and are checked again here before touching the disk. */
  private dir(slug: string): string {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Invalid slug.')
    return path.join(this.cacheRoot(), slug)
  }

  /**
   * Every page view (and the brand list, once per brand) reads state.json. The parsed file is kept per
   * slug and reused while the file's inode, size and mtime are unchanged. Studio's own writes go
   * through writeState, which drops the copy (see there). Callers must not mutate the result.
   */
  private readonly parsed = new Map<string, { key: string; state: StateFile }>()

  private readState(slug: string): StateFile | null {
    const file = path.join(this.dir(slug), 'state.json')
    let stat: fs.Stats
    try {
      stat = fs.statSync(file)
    } catch {
      this.parsed.delete(slug)
      return null
    }
    const key = `${stat.ino}:${stat.size}:${stat.mtimeMs}`
    const hit = this.parsed.get(slug)
    if (hit?.key === key) return hit.state
    try {
      const state = JSON.parse(fs.readFileSync(file, 'utf8')) as StateFile
      this.parsed.set(slug, { key, state })
      return state
    } catch {
      this.parsed.delete(slug)
      return null
    }
  }

  /**
   * Writes state.json and drops the parsed copy. The inode/size/mtime key alone is not enough for
   * Studio's own writes: the temp file of a rename often reuses the inode the previous rename freed,
   * and two same-size writes inside one coarse mtime tick then look unchanged.
   */
  private writeState(slug: string, next: StateFile): void {
    fs.mkdirSync(this.dir(slug), { recursive: true, mode: 0o700 })
    writeAtomic(path.join(this.dir(slug), 'state.json'), JSON.stringify(next), { mode: 0o600 })
    this.parsed.delete(slug)
  }

  get(slug: string): CachedBrand {
    const state = this.readState(slug)
    if (!state) return { status: { ...EMPTY }, projection: null, history: null }
    return { status: { ...state.status }, projection: state.projection, history: state.history }
  }

  /** Stale when the last check is older than the TTL, when a refresh failed, or when a webhook said the branch moved. */
  isStale(slug: string, status: SyncStatus): boolean {
    if (status.state === 'never') return true
    if (this.dirty.has(slug)) return true
    if (status.last_error) return true
    if (!status.checked_at) return true
    return this.now().getTime() - Date.parse(status.checked_at) > this.deps.ttlMs
  }

  markDirty(slug: string): void {
    this.dirty.add(slug)
  }

  isRefreshing(slug: string): boolean {
    return this.running.has(slug)
  }

  /** When the running refresh of this brand started (ISO time), or null when none runs. */
  refreshStartedAt(slug: string): string | null {
    return this.running.has(slug) ? (this.startedAt.get(slug) ?? null) : null
  }

  async settled(): Promise<void> {
    await Promise.allSettled([...this.running.values()])
  }

  /** Path of a cached approved preview file, or null. The key must be one this projection published. */
  previewFile(slug: string, key: string): { file: string; mime: string } | null {
    if (!/^[0-9a-f]{64}$/.test(key)) return null
    const state = this.readState(slug)
    const mime = state?.previews?.[key]
    if (!mime) return null
    const file = path.join(this.dir(slug), 'previews', key)
    return fs.existsSync(file) ? { file, mime } : null
  }

  /** One refresh per slug at a time; concurrent callers share the same promise. */
  refresh(slug: string): Promise<CachedBrand> {
    const current = this.running.get(slug)
    if (current) return current
    this.startedAt.set(slug, this.now().toISOString())
    const job = this.doRefresh(slug).finally(() => {
      this.running.delete(slug)
      this.startedAt.delete(slug)
    })
    this.running.set(slug, job)
    return job
  }

  /** Extract and build in a worker thread (default) or inline; rethrows a ProjectionError with its code. */
  private async project(job: ProjectionJob): Promise<{ projection: StudioProjection; previews: PreviewFile[] }> {
    let reply: ProjectionReply
    if (this.deps.projection === 'inline') reply = runProjectionJob(job)
    else {
      try {
        reply = await projectInWorker(job)
      } catch (error) {
        // A worker that cannot start (for example a TypeScript entry under a loader that does not reach worker
        // threads) must not break the sync: build inline once and say so. The bundled server always has the worker.
        if (!(error instanceof WorkerUnavailable)) throw error
        this.deps.log?.(`projection worker unavailable, building inline: ${error.message}`)
        reply = runProjectionJob(job)
      }
    }
    if (reply.ok) return { projection: reply.projection as StudioProjection, previews: reply.previews }
    if (reply.projectionCode) throw new ProjectionError(reply.projectionCode, reply.message)
    throw new Error(reply.message)
  }

  /**
   * BOS-02: counts what each open pull request would change, from its file list (GET only). A pull request whose
   * `updated_at` is unchanged keeps its cached counts, so a refresh costs one request per new or updated pull
   * request. After a GitHub error (a rate limit included) no further list is read in this sync; those pull requests
   * keep their earlier counts when still current, otherwise `null`.
   */
  private async pullChanges(owner: string, name: string, pulls: PullSummary[], previous: PendingPull[]): Promise<PendingPull[]> {
    const known = new Map(previous.map((pull) => [pull.number, pull]))
    let stopped = false
    const out: PendingPull[] = []
    for (const pull of pulls) {
      const before = known.get(pull.number)
      if (before?.changes && before.updated_at === pull.updated_at) {
        out.push({ ...pull, changes: before.changes })
        continue
      }
      if (stopped || pull.number < 1) {
        out.push({ ...pull, changes: null })
        continue
      }
      try {
        const listed = await this.deps.github.listPullFiles(owner, name, pull.number)
        out.push({ ...pull, changes: countPullChanges(listed.files, listed.truncated) })
      } catch (error) {
        stopped = true
        this.deps.log?.(`pull request files not read for ${owner}/${name}#${pull.number}: ${error instanceof GitHubError ? error.kind : 'error'}`)
        out.push({ ...pull, changes: null })
      }
    }
    return out
  }

  private async doRefresh(slug: string): Promise<CachedBrand> {
    const record = this.deps.registry.get(slug)
    if (!record || !brandIsReady(record)) throw new Error('Brand is not ready.')
    const previous = this.readState(slug)
    const at = this.now().toISOString()
    const status: SyncStatus = { ...(previous?.status ?? EMPTY), attempted_at: at }
    const { owner, name, default_branch: branch } = record.repo
    const work = fs.mkdtempSync(path.join(this.deps.dataDir, 'work-sync-'))
    try {
      const repo = await this.deps.github.getRepo(owner, name)
      if (!repo) throw new GitHubError('not_found', 404, 'The repository is not reachable with the Studio read access.')
      if (record.repo.id !== null && repo.id !== record.repo.id) {
        throw new ProjectionError('slug_mismatch', 'The repository at this name is not the one Studio registered. It may have been deleted and recreated.')
      }
      status.repo_private = repo.private
      const head = await this.deps.github.getBranchHead(owner, name, repo.default_branch || branch)
      let projection = previous?.projection ?? null
      let previews = previous?.previews ?? {}
      // Visual V3.3: a cache written before the journey, SOSTAC and OKR documents existed is rebuilt once at the same commit.
      if (projection?.visual && projection.visual.plans === undefined) projection = null
      // BOS-15: a cache written before the shared applicability rule (module `applicable` counts) is rebuilt once at the same commit.
      if (projection && projection.modules.some((module) => (module as { applicable?: number }).applicable === undefined)) projection = null
      // A cache written before the knowledge, creative, calendar, coach or visual projection (or the current master-logo rule, the competitor matrix, the mascot atlas, SWOT / TOWS and the Value Proposition Canvas, the positioning map or the current coach rule version) existed is rebuilt once at the same commit.
      if (!projection || previous?.status.sha !== head.sha || projection.knowledge === undefined || projection.creative === undefined || projection.calendar === undefined || projection.coach === undefined || (projection.coach !== null && projection.coach.rule_version !== COACH_RULE_VERSION) || projection.visual === undefined || projection.publishing === undefined || (projection.visual !== null && projection.visual.identity?.master_rule !== IDENTITY_MASTER_RULE) || (projection.visual !== null && projection.visual.competitors === undefined) || (projection.visual !== null && projection.visual.mascot === undefined) || (projection.visual !== null && projection.visual.strategy === undefined) || (projection.visual?.competitors !== undefined && !projection.visual.competitors.blocks.some((block) => block.type === 'positioning_map'))) {
        const archive = await this.deps.github.getTarball(owner, name, head.sha)
        const checkout = path.join(work, 'checkout')
        const built = await this.project({ archive: new Uint8Array(archive), checkout, slug })
        projection = built.projection
        const previewDir = path.join(this.dir(slug), 'previews')
        fs.rmSync(previewDir, { recursive: true, force: true })
        fs.mkdirSync(previewDir, { recursive: true, mode: 0o700 })
        previews = {}
        for (const preview of built.previews) {
          await fs.promises.copyFile(preview.source, path.join(previewDir, preview.key))
          previews[preview.key] = preview.mime
        }
        status.synced_at = at
        status.sha = head.sha
        status.committed_at = head.committed_at
      }
      let history: History
      try {
        const [commits, pulls] = await Promise.all([this.deps.github.listCommits(owner, name, repo.default_branch || branch), this.deps.github.listOpenPulls(owner, name)])
        history = { commits, pulls: await this.pullChanges(owner, name, pulls, previous?.history?.pulls ?? []), error: null }
      } catch (error) {
        history = { commits: previous?.history?.commits ?? [], pulls: previous?.history?.pulls ?? [], error: error instanceof GitHubError ? error.message : 'History could not be read.' }
      }
      status.state = 'ok'
      status.checked_at = at
      status.last_error = null
      this.dirty.delete(slug)
      const next: StateFile = { schema_version: 1, status, projection, history, previews }
      this.writeState(slug, next)
      return { status, projection, history }
    } catch (error) {
      const code = error instanceof ProjectionError ? error.code : error instanceof GitHubError ? `github_${error.kind}` : 'internal'
      const message = error instanceof ProjectionError || error instanceof GitHubError ? error.message : 'The repository could not be read.'
      status.last_error = { code, message, at }
      status.state = previous?.projection ? 'ok' : 'error'
      // A repository that now belongs to another brand must not keep showing its old projection.
      const keep = code === 'slug_mismatch' ? null : previous
      const next: StateFile = { schema_version: 1, status, projection: keep?.projection ?? null, history: keep?.history ?? null, previews: keep?.previews ?? {} }
      if (code === 'slug_mismatch') {
        status.state = 'error'
        fs.rmSync(path.join(this.dir(slug), 'previews'), { recursive: true, force: true })
      }
      this.writeState(slug, next)
      this.deps.log?.(`sync failed for ${slug}: ${code}`)
      return { status, projection: next.projection, history: next.history }
    } finally {
      await fs.promises.rm(work, { recursive: true, force: true })
    }
  }
}
