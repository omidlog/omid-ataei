import fs from 'node:fs'
import path from 'node:path'
import type { Registry } from './registry.js'
import { brandIsReady, type SyncService } from './sync.js'
import type { TemplateUpdateService, UpdateState } from './template-update.js'

/**
 * The periodic template check (template sync, chunk 3).
 *
 * Every interval (with jitter) Studio reads the template head once through the cached
 * {@link TemplateUpdateService} and compares it with the commit every registered brand records. With
 * `autoOpen` off (the default) that is all it does: the result feeds the "Updates available" indicator.
 * With `autoOpen` on it also asks the service to open an update pull request for each brand that is
 * behind, which links an already open `template-update/*` pull request instead of opening a second one.
 * It never pushes to a default branch and never merges.
 *
 * - Runs in the background on a timer; a page request never waits for it.
 * - One run at a time; brands are handled one after another.
 * - Errors and rate limits back off exponentially (rate limits wait at least an hour).
 * - `stop()` cancels the timer and waits for the current brand to finish.
 * - Every run is appended to the audit log (`action: template_update_check`); pull requests it opens
 *   are audited by the service with the actor `periodic-job`.
 */
export const JOB_ACTOR = 'periodic-job'

export interface Scheduler {
  setTimeout(callback: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

const realScheduler: Scheduler = {
  setTimeout(callback, ms) {
    const handle = setTimeout(callback, ms)
    // Never keeps the process alive on its own.
    handle.unref()
    return handle
  },
  clearTimeout(handle) {
    clearTimeout(handle as NodeJS.Timeout)
  },
}

export interface TemplateUpdateJobDeps {
  registry: Registry
  sync: SyncService
  updates: TemplateUpdateService
  dataDir: string
  /** Time between runs. */
  intervalMs: number
  /** Open update pull requests automatically. Off: check only. */
  autoOpen: boolean
  /** Share of the interval added or removed at random (0.1 = ±10 %). */
  jitter?: number
  /** Longest wait after repeated failures. */
  maxBackoffMs?: number
  /** Shortest wait after a rate limit. */
  rateLimitBackoffMs?: number
  /** Delay before the first run after start. */
  initialDelayMs?: number
  scheduler?: Scheduler
  random?: () => number
  now?: () => number
  log?: (line: string) => void
}

export interface BrandCheck {
  slug: string
  state: UpdateState | 'skipped'
  /** What the job did: nothing, linked an open pull request, opened one, or failed. */
  action: 'none' | 'linked' | 'opened' | 'failed' | 'not_allowed'
  pull?: number
}

export interface RunSummary {
  ok: boolean
  rateLimited: boolean
  head: string | null
  brands: BrandCheck[]
}

export class TemplateUpdateJob {
  private timer: unknown = null
  private running: Promise<RunSummary> | null = null
  private stopped = true
  /** Set by stop(): a run in progress ends after the brand it is on. */
  private halting = false
  private failures = 0
  private readonly scheduler: Scheduler
  private readonly random: () => number
  private readonly now: () => number
  /** Result of the last finished run, for diagnostics. */
  last: RunSummary | null = null
  /** Delay chosen for the next run (ms), for diagnostics and tests. */
  nextDelayMs: number | null = null

  constructor(private readonly deps: TemplateUpdateJobDeps) {
    this.scheduler = deps.scheduler ?? realScheduler
    this.random = deps.random ?? Math.random
    this.now = deps.now ?? Date.now
  }

  get active(): boolean {
    return !this.stopped
  }

  /** Starts the timer. Does nothing when the interval is 0 or Studio has no provisioning access. */
  start(): boolean {
    if (!this.stopped) return true
    if (this.deps.intervalMs <= 0 || !this.deps.updates.configured) {
      this.deps.log?.('template check job is off (no interval or no provisioning access)')
      return false
    }
    this.stopped = false
    this.halting = false
    this.failures = 0
    this.schedule(this.deps.initialDelayMs ?? this.jittered(Math.min(this.deps.intervalMs, 5 * 60_000)))
    this.deps.log?.(`template check job started (every ${Math.round(this.deps.intervalMs / 60_000)} min, ${this.deps.autoOpen ? 'opens update pull requests' : 'check only'})`)
    return true
  }

  /** Cancels the next run and waits for a run in progress to reach a safe point. */
  async stop(): Promise<void> {
    this.stopped = true
    this.halting = true
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer)
    this.timer = null
    this.nextDelayMs = null
    if (this.running) await this.running.catch(() => undefined)
  }

  /** Whether a run is in progress. */
  get busy(): boolean {
    return this.running !== null
  }

  /** Waits for a run in progress, if any. */
  async settled(): Promise<void> {
    if (this.running) await this.running.catch(() => undefined)
  }

  private jittered(ms: number): number {
    const share = Math.min(Math.max(this.deps.jitter ?? 0.1, 0), 0.5)
    return Math.max(1_000, Math.round(ms * (1 + share * (this.random() * 2 - 1))))
  }

  private schedule(ms: number): void {
    if (this.stopped) return
    this.nextDelayMs = ms
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null
      void this.runOnce().then((summary) => this.schedule(this.delayAfter(summary)))
    }, ms)
  }

  /** The next wait: the jittered interval, doubled per consecutive failure, at least an hour after a rate limit. */
  private delayAfter(summary: RunSummary): number {
    if (summary.ok) {
      this.failures = 0
      return this.jittered(this.deps.intervalMs)
    }
    this.failures += 1
    const max = this.deps.maxBackoffMs ?? 24 * 3600_000
    let wait = Math.min(this.deps.intervalMs * 2 ** this.failures, max)
    if (summary.rateLimited) wait = Math.max(wait, this.deps.rateLimitBackoffMs ?? 3600_000)
    return this.jittered(wait)
  }

  /** One pass over every brand. Concurrent callers share the same run. */
  runOnce(): Promise<RunSummary> {
    if (this.running) return this.running
    const run = this.pass()
      .catch((): RunSummary => ({ ok: false, rateLimited: false, head: null, brands: [] }))
      .then((summary) => {
        this.last = summary
        this.audit(summary)
        return summary
      })
      .finally(() => {
        this.running = null
      })
    this.running = run
    return run
  }

  private async pass(): Promise<RunSummary> {
    const { updates, registry, sync } = this.deps
    const head = await updates.templateHead()
    const headError = updates.headError
    if (!head || headError.error) return { ok: false, rateLimited: headError.rateLimited, head, brands: [] }
    const summary: RunSummary = { ok: true, rateLimited: false, head, brands: [] }
    for (const record of registry.list()) {
      if (this.halting) break
      if (!brandIsReady(record)) {
        summary.brands.push({ slug: record.slug, state: 'skipped', action: 'none' })
        continue
      }
      let cached = sync.get(record.slug)
      // A stale cache could hide a merged or closed update pull request; re-read it (read credential, GET only).
      if (sync.isStale(record.slug, cached.status)) cached = await sync.refresh(record.slug).catch(() => cached)
      const status = updates.status(cached.projection, head, cached.history?.pulls ?? [])
      const check: BrandCheck = { slug: record.slug, state: status.state, action: 'none' }
      summary.brands.push(check)
      if (status.pull) {
        check.action = 'linked'
        check.pull = status.pull.number
        continue
      }
      if (status.state !== 'available' || !this.deps.autoOpen) continue
      if (!updates.canOpen(record)) {
        check.action = 'not_allowed'
        continue
      }
      const result = await updates.openUpdatePull(record.slug, JOB_ACTOR)
      if (result.ok && (result.code === 'opened' || result.code === 'exists')) {
        check.action = result.code === 'opened' ? 'opened' : 'linked'
        check.pull = result.pull.number
        // The next sync shows the pull request; mark the cache so the next view refreshes it.
        sync.markDirty(record.slug)
      } else if (!result.ok && result.code !== 'busy') {
        check.action = 'failed'
        summary.ok = false
        if (result.rateLimited) {
          summary.rateLimited = true
          break
        }
      }
    }
    return summary
  }

  private audit(summary: RunSummary): void {
    const count = (action: BrandCheck['action']) => summary.brands.filter((brand) => brand.action === action).length
    const line = JSON.stringify({
      at: new Date(this.now()).toISOString(),
      action: 'template_update_check',
      actor: JOB_ACTOR,
      auto_open: this.deps.autoOpen,
      result: summary.ok ? 'ok' : summary.rateLimited ? 'rate_limited' : 'failed',
      head: summary.head,
      brands: summary.brands.length,
      available: summary.brands.filter((brand) => brand.state === 'available').length,
      opened: count('opened'),
      linked: count('linked'),
      failed: count('failed'),
    })
    try {
      fs.appendFileSync(path.join(this.deps.dataDir, 'audit.jsonl'), `${line}\n`, { mode: 0o600 })
    } catch {
      this.deps.log?.('audit log could not be written')
    }
    this.deps.log?.(`template check ${summary.ok ? 'done' : 'failed'}: ${summary.brands.length} brands, ${count('opened')} opened, ${count('linked')} linked`)
  }
}
