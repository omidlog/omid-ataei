import fs from 'node:fs'
import path from 'node:path'
import {
  classifyPath,
  formatMigrationRuns,
  isWriteAction,
  migrationFiles,
  migrationPaths,
  MIGRATIONS_DIR,
  parseMigration,
  pendingMigrations,
  planMigrations,
  parseSyncManifest,
  planChanges,
  SYNC_MANIFEST_PATH,
  TEMPLATE_RECORD_PATH,
  templateRecordText,
  updateCommitMessage,
  type PlannedChange,
  type UpdatePlan,
} from '@brand-os/brand-core'
import { GitHubError, type GitHubClient, type PullSummary, type TreeEntry } from './github/client.js'
import { extractTarGz } from './github/tar.js'
import type { StudioProjection } from './projection.js'
import type { BrandRecord, Registry } from './registry.js'
import { brandIsReady } from './sync.js'

/**
 * Template updates for brand repositories: Studio's second permitted GitHub write.
 *
 * - **Check** (read-only): compare the commit a brand recorded in `brand/template-version.json` (from the
 *   sync projection) with the template's default-branch head. The head is cached; errors and rate limits
 *   back off and never break a page.
 * - **Open update PR**: compute the update with the core `planChanges` (core and merge-carefully files
 *   only; brand-owned paths are classified and skipped before any brand content is read), write it as one
 *   commit on a NEW branch `template-update/<sha>` and open a pull request. Studio never moves the default
 *   branch, never merges, and links an existing open update pull request instead of opening another.
 *   The only `brand/` path written is the version record, exactly as `npm run template:update` does.
 */
export const UPDATE_BRANCH_PREFIX = 'template-update/'

export type UpdateState = 'current' | 'available' | 'untracked' | 'unknown'

export interface UpdateStatus {
  state: UpdateState
  /** Template commit the brand records. */
  from: string | null
  /** Template head Studio last saw. */
  to: string | null
  /** An open update pull request in the sync history, if any. */
  pull: PullSummary | null
}

export type OpenResult =
  | { ok: true; code: 'opened'; pull: PullSummary; branch: string; written: number; conflicts: number }
  | { ok: true; code: 'exists'; pull: PullSummary }
  | { ok: true; code: 'current' }
  | { ok: false; code: 'not_configured' | 'untracked' | 'busy' | 'failed'; message?: string; rateLimited?: boolean }

export interface TemplateUpdateDeps {
  registry: Registry
  /** The provisioning credential: reads the private template, writes branches and pull requests on allowlisted destinations. */
  github: GitHubClient
  templateOwner: string
  templateRepo: string
  allowedOwners: string[]
  dataDir: string
  now?: () => number
  log?: (line: string) => void
  /** How long a template head is trusted. */
  ttlMs?: number
}

interface HeadCache {
  sha: string | null
  at: number
  /** No new GitHub read before this time (TTL, or a back-off after an error). */
  until: number
  error: string | null
  rateLimited: boolean
}

const SHA_RE = /^[0-9a-f]{40}$/

function walk(root: string, base = root, out = new Map<string, string>()): Map<string, string> {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) walk(full, base, out)
    else if (entry.isFile()) out.set(path.relative(base, full).split(path.sep).join('/'), full)
  }
  return out
}

function readOrNull(file: string | undefined): Buffer | null {
  return file && fs.existsSync(file) ? fs.readFileSync(file) : null
}

function isSecretLike(relative: string): boolean {
  const base = relative.split('/').pop() ?? ''
  return base === '.env' || base.startsWith('.env.') || relative.startsWith('brand/.private/') || relative.startsWith('brand/restricted/')
}

export function isUpdatePull(pull: PullSummary): boolean {
  return pull.head_ref.startsWith(UPDATE_BRANCH_PREFIX)
}

export class TemplateUpdateService {
  private head: HeadCache | null = null
  private inflight: Promise<string | null> | null = null
  private readonly busy = new Set<string>()
  private readonly now: () => number
  private readonly ttlMs: number

  constructor(private readonly deps: TemplateUpdateDeps) {
    this.now = deps.now ?? Date.now
    this.ttlMs = deps.ttlMs ?? 10 * 60_000
  }

  get configured(): boolean {
    return this.deps.github.configured
  }

  get template(): string {
    return `${this.deps.templateOwner}/${this.deps.templateRepo}`
  }

  /** Whether Studio may open update pull requests in this brand's repository. */
  canOpen(record: BrandRecord): boolean {
    return this.configured && this.deps.allowedOwners.some((owner) => owner.toLowerCase() === record.repo.owner.toLowerCase())
  }

  isBusy(slug: string): boolean {
    return this.busy.has(slug)
  }

  /** The cached template head without waiting; starts a background read when it is due. */
  peekHead(): string | null {
    if (this.configured && (!this.head || this.now() >= this.head.until)) void this.templateHead().catch(() => null)
    return this.head?.sha ?? null
  }

  /**
   * The template's default-branch head (GET only). Cached for the TTL; a failure keeps the last good
   * value and backs off (longer after a rate limit) so a broken GitHub never slows every page.
   */
  templateHead(options: { force?: boolean } = {}): Promise<string | null> {
    if (!this.configured) return Promise.resolve(null)
    if (!options.force && this.head && this.now() < this.head.until) return Promise.resolve(this.head.sha)
    if (this.inflight) return this.inflight
    const job = (async () => {
      const at = this.now()
      try {
        const repo = await this.deps.github.getRepo(this.deps.templateOwner, this.deps.templateRepo)
        if (!repo) throw new GitHubError('not_found', 404, 'The template repository is not reachable.')
        const head = await this.deps.github.getBranchHead(this.deps.templateOwner, this.deps.templateRepo, repo.default_branch)
        this.head = { sha: head.sha, at, until: at + this.ttlMs, error: null, rateLimited: false }
      } catch (error) {
        const limited = error instanceof GitHubError && error.kind === 'rate_limited'
        const message = error instanceof GitHubError ? error.message : 'The template could not be read.'
        this.head = { sha: this.head?.sha ?? null, at: this.head?.at ?? at, until: at + (limited ? 15 * 60_000 : 2 * 60_000), error: message, rateLimited: limited }
        this.deps.log?.(`template head check failed: ${error instanceof GitHubError ? error.kind : 'internal'}`)
      }
      return this.head.sha
    })().finally(() => {
      this.inflight = null
    })
    this.inflight = job
    return job
  }

  /** Outcome of the last template head read: an error message (null when it worked) and whether GitHub rate-limited it. */
  get headError(): { error: string | null; rateLimited: boolean } {
    return { error: this.head?.error ?? null, rateLimited: this.head?.rateLimited ?? false }
  }

  /** Compares a brand's recorded template commit with a template head. Pure. */
  status(projection: StudioProjection | null, head: string | null, pulls: PullSummary[] = []): UpdateStatus {
    const pull = pulls.find(isUpdatePull) ?? null
    const record = projection?.template
    if (record === undefined) return { state: 'unknown', from: null, to: head, pull }
    if (record === null || !record.commit) return { state: 'untracked', from: null, to: head, pull }
    if (record.repository && record.repository.toLowerCase() !== this.template.toLowerCase()) return { state: 'unknown', from: record.commit, to: head, pull }
    if (!head) return { state: 'unknown', from: record.commit, to: null, pull }
    const same = head === record.commit || (record.commit.length < 40 && head.startsWith(record.commit))
    return { state: same ? 'current' : 'available', from: record.commit, to: head, pull }
  }

  /** Opens (never merges) one update pull request for a brand. Idempotent; one run per brand at a time. */
  async openUpdatePull(slug: string, actor: string): Promise<OpenResult> {
    const record = this.deps.registry.get(slug)
    if (!record || !brandIsReady(record)) return { ok: false, code: 'failed', message: 'The brand is not ready.' }
    if (!this.canOpen(record)) {
      this.audit({ actor, slug, record, result: 'not_configured' })
      return { ok: false, code: 'not_configured' }
    }
    if (this.busy.has(slug)) return { ok: false, code: 'busy' }
    this.busy.add(slug)
    const work = fs.mkdtempSync(path.join(this.deps.dataDir, 'work-update-'))
    let details: Record<string, unknown> = {}
    try {
      const result = await this.run(record, work, (extra) => (details = { ...details, ...extra }))
      this.audit({ actor, slug, record, result: result.code, ...details, pull: 'pull' in result ? result.pull.number : null, message: result.ok ? undefined : result.message })
      return result
    } catch (error) {
      const message = error instanceof GitHubError ? error.message : error instanceof Error && error.name === 'UpdateError' ? error.message : 'The update could not be prepared.'
      this.audit({ actor, slug, record, result: 'failed', ...details, message })
      this.deps.log?.(`template update failed for ${slug}: ${error instanceof GitHubError ? error.kind : 'internal'}`)
      return { ok: false, code: 'failed', message, rateLimited: error instanceof GitHubError && error.kind === 'rate_limited' }
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
      this.busy.delete(slug)
    }
  }

  private async findOpenUpdatePull(owner: string, name: string): Promise<PullSummary | null> {
    for (let page = 1; page <= 3; page += 1) {
      const pulls = await this.deps.github.listOpenPulls(owner, name, 100, page)
      const found = pulls.find(isUpdatePull)
      if (found) return found
      if (pulls.length < 100) break
    }
    return null
  }

  private async run(record: BrandRecord, work: string, note: (extra: Record<string, unknown>) => void): Promise<OpenResult> {
    const gh = this.deps.github
    const { owner, name } = record.repo
    const repo = await gh.getRepo(owner, name)
    if (!repo) throw updateError('The brand repository is not reachable with the provisioning access.')
    if (record.repo.id !== null && repo.id !== record.repo.id) throw updateError('The repository at this name is not the one Studio registered.')
    if (!repo.private) throw updateError('The brand repository is public. Studio does not write to it.')

    // Idempotent: an open update pull request is linked, never duplicated.
    const existing = await this.findOpenUpdatePull(owner, name)
    if (existing) return { ok: true, code: 'exists', pull: existing }

    const head = await gh.getBranchHead(owner, name, repo.default_branch)
    const brandArchive = await gh.getTarball(owner, name, head.sha)
    const brandMeta = path.join(work, 'brand-meta')
    extractTarGz(brandArchive, { destRoot: brandMeta, include: (p) => p === TEMPLATE_RECORD_PATH || p === SYNC_MANIFEST_PATH })
    let from: string | null = null
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(brandMeta, TEMPLATE_RECORD_PATH), 'utf8')) as { commit?: unknown }
      from = typeof raw.commit === 'string' && SHA_RE.test(raw.commit) ? raw.commit : null
    } catch {
      from = null
    }
    if (!from) return { ok: false, code: 'untracked' }
    const to = await this.templateHead({ force: true })
    if (!to || this.head?.error) throw updateError('The template head could not be read.')
    note({ from, to })
    if (from === to) return { ok: true, code: 'current' }

    // Both template commits, in full (the template is Studio's own source; it holds no brand data).
    const t = this.deps
    const baseDir = path.join(work, 'template-base')
    const targetDir = path.join(work, 'template-target')
    extractTarGz(await gh.getTarball(t.templateOwner, t.templateRepo, from), { destRoot: baseDir, include: (p) => !isSecretLike(p) })
    const target = extractTarGz(await gh.getTarball(t.templateOwner, t.templateRepo, to), { destRoot: targetDir, include: (p) => !isSecretLike(p) })
    const executables = new Set(target.executables)
    const baseFiles = walk(baseDir)
    const targetFiles = walk(targetDir)
    const changed: string[] = []
    for (const relative of new Set([...baseFiles.keys(), ...targetFiles.keys()])) {
      const a = readOrNull(baseFiles.get(relative))
      const b = readOrNull(targetFiles.get(relative))
      if (a === null || b === null || !a.equals(b)) changed.push(relative)
    }

    const manifestFile = targetFiles.get(SYNC_MANIFEST_PATH) ?? path.join(brandMeta, SYNC_MANIFEST_PATH)
    if (!fs.existsSync(manifestFile)) throw updateError(`Neither the brand nor the template has ${SYNC_MANIFEST_PATH}.`)
    const manifest = parseSyncManifest(fs.readFileSync(manifestFile, 'utf8'))

    // Versioned migrations new since the brand's commit. parseMigration refuses any path that is not core.
    const migrations = pendingMigrations(migrationFiles(baseFiles.keys()), migrationFiles(targetFiles.keys())).map((name) =>
      parseMigration(name, fs.readFileSync(targetFiles.get(`${MIGRATIONS_DIR}/${name}`)!, 'utf8'), manifest),
    )

    // Only core and merge-carefully paths of the brand are extracted; brand-owned content is never read.
    const needed = new Set([...changed, ...migrationPaths(migrations)].filter((relative) => classifyPath(manifest, relative).kind !== 'brand' && !isSecretLike(relative)))
    const brandDir = path.join(work, 'brand')
    extractTarGz(brandArchive, { destRoot: brandDir, include: (p) => needed.has(p) })
    const brandFiles = walk(brandDir)
    const sources = {
      base: (relative: string) => readOrNull(baseFiles.get(relative)),
      theirs: (relative: string) => readOrNull(targetFiles.get(relative)),
      local: (relative: string) => (needed.has(relative) ? readOrNull(brandFiles.get(relative)) : null),
    }
    const { changes, runs } = planMigrations(migrations, planChanges({ manifest, changed, ...sources }), sources)
    let version: string | null = null
    try {
      const pkg = JSON.parse(fs.readFileSync(targetFiles.get('package.json') ?? '', 'utf8')) as { version?: unknown }
      version = typeof pkg.version === 'string' ? pkg.version.slice(0, 40) : null
    } catch {
      version = null
    }
    const plan: UpdatePlan = { repository: this.template, from, to, version, changes, upToDate: false, migrations: runs }
    const writes = changes.filter((change) => isWriteAction(change.action))
    const conflicts = changes.filter((change) => change.action === 'conflict')
    const branch = `${UPDATE_BRANCH_PREFIX}${to.slice(0, 12)}`
    note({ branch, written: writes.length, conflicts: conflicts.length, migrations: runs.map((run) => run.id) })

    // A branch left by an earlier attempt for the same template commit is reused, never moved.
    if (!(await gh.getBranchRef(owner, name, branch))) {
      const entries: TreeEntry[] = []
      for (const change of writes) {
        if (change.action === 'delete') entries.push({ path: change.path, mode: '100644', type: 'blob', sha: null })
        else entries.push({ path: change.path, mode: executables.has(change.path) && change.action !== 'merge' ? '100755' : '100644', type: 'blob', sha: await gh.createBlob(owner, name, change.content!) })
      }
      const recordText = templateRecordText({ repository: this.template, commit: to, version, recorded_at: new Date(this.now()).toISOString(), source: 'studio' })
      entries.push({ path: TEMPLATE_RECORD_PATH, mode: '100644', type: 'blob', sha: await gh.createBlob(owner, name, Buffer.from(recordText)) })
      const tree = await gh.createTree(owner, name, head.tree_sha, entries)
      const commit = await gh.createCommit(owner, name, { message: updateCommitMessage(plan), tree, parent: head.sha })
      await gh.createBranch(owner, name, branch, commit)
    }
    let pull: PullSummary
    try {
      pull = await gh.createPull(owner, name, { title: `Update Brand OS template to ${version ?? to.slice(0, 12)}`, body: pullBody(plan, writes, conflicts), head: branch, base: repo.default_branch })
    } catch (error) {
      // Opened meanwhile (another tab, the periodic job): link it.
      const raced = error instanceof GitHubError && error.kind === 'invalid' ? await this.findOpenUpdatePull(owner, name) : null
      if (raced) return { ok: true, code: 'exists', pull: raced }
      throw error
    }
    return { ok: true, code: 'opened', pull, branch, written: writes.length, conflicts: conflicts.length }
  }

  /** Append-only audit trail of every update request, in Studio's data directory. Never holds a token. */
  private audit(entry: { actor: string; slug: string; record: BrandRecord; result: string } & Record<string, unknown>): void {
    const { record, ...rest } = entry
    const line = JSON.stringify({ at: new Date(this.now()).toISOString(), action: 'template_update_pull', repository: `${record.repo.owner}/${record.repo.name}`, ...rest })
    try {
      fs.appendFileSync(path.join(this.deps.dataDir, 'audit.jsonl'), `${line}\n`, { mode: 0o600 })
    } catch {
      this.deps.log?.('audit log could not be written')
    }
    this.deps.log?.(`template update ${entry.result} for ${entry.slug} by ${entry.actor}`)
  }
}

function updateError(message: string): Error {
  const error = new Error(message)
  error.name = 'UpdateError'
  return error
}

function list(changes: PlannedChange[], max = 200, withReason = false): string {
  const lines = changes.slice(0, max).map((change) => `- \`${change.path}\`${withReason ? `: ${change.reason}` : ''}`)
  if (changes.length > max) lines.push(`- … and ${changes.length - max} more`)
  return lines.join('\n')
}

export function pullBody(plan: UpdatePlan, writes: PlannedChange[], conflicts: PlannedChange[]): string {
  const skipped = plan.changes.filter((change) => change.action === 'skip').length
  const parts = [
    `Brand OS template update from \`${plan.from.slice(0, 12)}\` to \`${plan.to.slice(0, 12)}\`${plan.version ? ` (version ${plan.version})` : ''}.`,
    '',
    'Opened by Brand OS Studio. Studio never merges this pull request and never changes brand-owned files; the only `brand/` file changed is `brand/template-version.json`.',
    '',
    `## Changed (${writes.length})`,
    writes.length ? list(writes) : 'No template files needed changes; only the version record moves forward.',
  ]
  if (conflicts.length) parts.push('', `## Needs a person (${conflicts.length}, not changed)`, list(conflicts, 200, true))
  if (plan.migrations?.length) parts.push('', `## Migrations (${plan.migrations.length}, in order)`, ...formatMigrationRuns(plan.migrations))
  parts.push('', `Brand-owned paths skipped: ${skipped}.`, '', '## Before merging', '', '1. Check out this branch and run `npm ci`, `npm run brand:migrate` and `npm run ci`.', '2. Resolve the files that need a person, if any (compare with the template).', '3. Merge on GitHub when you are satisfied.')
  return parts.join('\n')
}
