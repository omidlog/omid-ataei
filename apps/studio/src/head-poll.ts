import type { GitHubClient } from './github/client.js'
import { GitHubError } from './github/client.js'
import type { Registry } from './registry.js'
import { brandIsReady, type SyncService } from './sync.js'
import type { Scheduler } from './template-update-job.js'

/**
 * BOS-11: a light poll of each brand's default-branch head, so a merged change shows up without Refresh.
 *
 * Every interval Studio makes one GET per ready brand (`git/ref/heads/<default branch>`, read credential) and
 * compares the commit with the one in the sync cache. When it moved, the brand is marked dirty and a background
 * refresh runs (the same read-only refresh as the button). Nothing else is read and nothing is written to GitHub.
 *
 * - Off when the interval is 0 or there is no read credential; started only by `main.ts`, never by tests or the CLI.
 * - One run at a time, brands one after another, on an `unref`'d timer: pages and /healthz never wait for it.
 * - A brand that was never synced, or whose refresh is already running, is skipped (its first view reads it).
 * - Errors double the wait (up to an hour); a rate limit ends the run and waits at least 15 minutes.
 */
export interface HeadPollDeps {
  registry: Registry
  sync: SyncService
  github: GitHubClient
  intervalMs: number
  maxBackoffMs?: number
  rateLimitBackoffMs?: number
  scheduler?: Scheduler
  log?: (line: string) => void
}

export interface HeadPollRun {
  checked: number
  moved: string[]
  rateLimited: boolean
  failed: number
}

const realScheduler: Scheduler = {
  setTimeout(callback, ms) {
    const handle = setTimeout(callback, ms)
    handle.unref()
    return handle
  },
  clearTimeout(handle) {
    clearTimeout(handle as NodeJS.Timeout)
  },
}

export class HeadPollJob {
  private timer: unknown = null
  private running: Promise<HeadPollRun> | null = null
  private stopped = true
  private failures = 0
  private readonly scheduler: Scheduler
  /** Delay chosen for the next run (ms), for diagnostics and tests. */
  nextDelayMs: number | null = null
  last: HeadPollRun | null = null

  constructor(private readonly deps: HeadPollDeps) {
    this.scheduler = deps.scheduler ?? realScheduler
  }

  get active(): boolean {
    return !this.stopped
  }

  start(): boolean {
    if (!this.stopped) return true
    if (this.deps.intervalMs <= 0 || !this.deps.github.configured) {
      this.deps.log?.('branch head poll is off (no interval or no read access)')
      return false
    }
    this.stopped = false
    this.failures = 0
    this.schedule(this.deps.intervalMs)
    this.deps.log?.(`branch head poll started (every ${Math.round(this.deps.intervalMs / 1000)} s)`)
    return true
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer)
    this.timer = null
    this.nextDelayMs = null
    if (this.running) await this.running.catch(() => undefined)
  }

  private schedule(ms: number): void {
    if (this.stopped) return
    this.nextDelayMs = ms
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null
      void this.runOnce().then((run) => {
        if (run.rateLimited) this.failures += 1
        else if (run.failed > 0 && run.failed === run.checked) this.failures += 1
        else this.failures = 0
        const max = this.deps.maxBackoffMs ?? 60 * 60_000
        let next = this.failures === 0 ? this.deps.intervalMs : Math.min(max, this.deps.intervalMs * 2 ** this.failures)
        if (run.rateLimited) next = Math.max(next, this.deps.rateLimitBackoffMs ?? 15 * 60_000)
        this.schedule(next)
      })
    }, ms)
  }

  /** One pass over the ready brands. Shared when called while a pass runs. */
  runOnce(): Promise<HeadPollRun> {
    if (this.running) return this.running
    const job = this.pass().finally(() => {
      this.running = null
    })
    this.running = job
    return job
  }

  private async pass(): Promise<HeadPollRun> {
    const run: HeadPollRun = { checked: 0, moved: [], rateLimited: false, failed: 0 }
    for (const record of this.deps.registry.list()) {
      if (!brandIsReady(record)) continue
      const cached = this.deps.sync.get(record.slug)
      if (cached.status.state === 'never' || !cached.status.sha || this.deps.sync.isRefreshing(record.slug)) continue
      run.checked += 1
      let head: string | null
      try {
        head = await this.deps.github.getBranchRef(record.repo.owner, record.repo.name, record.repo.default_branch)
      } catch (error) {
        run.failed += 1
        if (error instanceof GitHubError && error.kind === 'rate_limited') {
          run.rateLimited = true
          this.deps.log?.('branch head poll: GitHub rate limit; waiting before the next check')
          break
        }
        continue
      }
      if (head && head !== cached.status.sha) {
        run.moved.push(record.slug)
        this.deps.sync.markDirty(record.slug)
        this.deps.log?.(`branch head poll: ${record.slug} moved; refreshing`)
        void this.deps.sync.refresh(record.slug).catch(() => undefined)
      }
    }
    this.last = run
    return run
  }
}
