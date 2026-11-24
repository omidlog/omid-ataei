import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { ConfigError, loadConfig } from '../apps/studio/src/config.js'
import { TemplateUpdateService } from '../apps/studio/src/template-update.js'
import { JOB_ACTOR, TemplateUpdateJob, type Scheduler } from '../apps/studio/src/template-update-job.js'
import type { FakeGitHub } from './helpers/fake-github.js'
import { harness, OWNER, provisioned, TEMPLATE, type Harness } from './helpers/studio.js'

/**
 * Template sync chunk 3: the periodic check. A fake scheduler stands in for real timers, the in-memory
 * GitHub (tests/helpers/fake-github.ts) for the network. No timer, server or repository outlives a test.
 */
const MANIFEST = fs.readFileSync(path.resolve(import.meta.dirname, '..', '.brand-os', 'sync.json'))
const HOUR = 3600_000
const INTERVAL = 6 * HOUR

function seedTemplate(github: FakeGitHub): void {
  github.pushEdit(TEMPLATE.owner, TEMPLATE.repo, (tree) => {
    tree.set('.brand-os/sync.json', MANIFEST)
    tree.set('scripts/tool.ts', Buffer.from('export const tool = 1\n'))
  })
}

function releaseTemplate(github: FakeGitHub): string {
  return github.pushEdit(TEMPLATE.owner, TEMPLATE.repo, (tree) => tree.set('scripts/tool.ts', Buffer.from('export const tool = 2\n')), 'feat: template release')
}

/** Fake timers: callbacks run only when the test fires them. */
class FakeScheduler implements Scheduler {
  pending = new Map<number, { callback: () => void; ms: number }>()
  private next = 1
  setTimeout(callback: () => void, ms: number): unknown {
    const id = this.next++
    this.pending.set(id, { callback, ms })
    return id
  }
  clearTimeout(handle: unknown): void {
    this.pending.delete(handle as number)
  }
  /** The single pending delay. */
  get delay(): number | null {
    const [entry] = this.pending.values()
    return entry?.ms ?? null
  }
  /** Fires the pending timer and waits until its run has finished and scheduled the next one. */
  async fire(job: TemplateUpdateJob): Promise<void> {
    const first = [...this.pending.entries()][0]
    assert.ok(first, 'a timer is pending')
    const [id, entry] = first
    this.pending.delete(id)
    entry.callback()
    await job.settled()
    await new Promise((resolve) => setImmediate(resolve))
  }
}

interface Setup {
  h: Harness
  updates: TemplateUpdateService
  scheduler: FakeScheduler
  job: TemplateUpdateJob
  clock: { now: number }
}

async function setup(options: { autoOpen: boolean; random?: number; allowedOwners?: string[] }): Promise<Setup> {
  const h = harness()
  seedTemplate(h.github)
  await provisioned(h)
  const clock = { now: 1_000_000 }
  const updates = new TemplateUpdateService({ registry: h.registry, github: h.provisionClient, templateOwner: TEMPLATE.owner, templateRepo: TEMPLATE.repo, allowedOwners: options.allowedOwners ?? [OWNER], dataDir: h.dataDir, now: () => clock.now })
  const scheduler = new FakeScheduler()
  const job = new TemplateUpdateJob({ registry: h.registry, sync: h.sync, updates, dataDir: h.dataDir, intervalMs: INTERVAL, autoOpen: options.autoOpen, scheduler, random: () => options.random ?? 0.5, now: () => clock.now, initialDelayMs: 60_000 })
  return { h, updates, scheduler, job, clock }
}

function audit(h: Harness): Array<Record<string, unknown>> {
  const file = path.join(h.dataDir, 'audit.jsonl')
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>) : []
}

const writes = (h: Harness) => h.github.calls.filter((call) => call.method !== 'GET').length

test('template check job: off by default, check only, shows the brand behind without writing anything', async () => {
  const s = await setup({ autoOpen: false })
  try {
    releaseTemplate(s.h.github)
    const before = writes(s.h)
    assert.equal(s.job.start(), true)
    assert.equal(s.scheduler.delay, 60_000, 'first run after the initial delay')
    await s.scheduler.fire(s.job)
    assert.equal(s.job.last?.ok, true)
    assert.deepEqual(s.job.last?.brands.map((b) => [b.slug, b.state, b.action]), [['acme-learning', 'available', 'none']])
    assert.equal(writes(s.h), before, 'check only: no branch, commit or pull request')
    assert.equal(s.h.github.repo(OWNER, 'acme-learning-brand')!.pulls.length, 0)
    const entry = audit(s.h).at(-1)!
    assert.equal(entry.action, 'template_update_check')
    assert.equal(entry.actor, JOB_ACTOR)
    assert.equal(entry.auto_open, false)
    assert.equal(entry.available, 1)
    assert.equal(entry.opened, 0)
    // Next run: the interval, with jitter (random 0.5 = exactly the interval).
    assert.equal(s.scheduler.delay, INTERVAL)
    assert.equal(s.scheduler.pending.size, 1, 'exactly one timer')
  } finally {
    await s.job.stop()
    assert.equal(s.scheduler.pending.size, 0, 'stop cancels the timer')
    fs.rmSync(s.h.dataDir, { recursive: true, force: true })
  }
})

test('template check job: with the flag on it opens one pull request per brand and links it on later runs', async () => {
  const s = await setup({ autoOpen: true })
  try {
    const gh = s.h.github.repo(OWNER, 'acme-learning-brand')!
    const main = gh.head
    const start = s.h.github.calls.length
    // Current brand: nothing to do.
    s.job.start()
    await s.scheduler.fire(s.job)
    assert.deepEqual(s.job.last?.brands.map((b) => b.state), ['current'])
    assert.equal(gh.pulls.length, 0)

    releaseTemplate(s.h.github)
    s.clock.now += 11 * 60_000 // past the cached head's TTL
    await s.scheduler.fire(s.job)
    assert.deepEqual(s.job.last?.brands.map((b) => [b.state, b.action, b.pull]), [['available', 'opened', 1]])
    assert.equal(gh.pulls.length, 1)
    assert.match(gh.pulls[0]!.head, /^template-update\//)
    assert.equal(gh.head, main, 'the default branch never moves')
    const opened = audit(s.h).find((entry) => entry.action === 'template_update_pull')!
    assert.equal(opened.actor, JOB_ACTOR)
    assert.equal(opened.result, 'opened')

    // Before the sync cache knows about it: the service finds the open pull request and links it.
    const posts = s.h.github.callsTo('POST', /./).length
    await s.scheduler.fire(s.job)
    assert.deepEqual(s.job.last?.brands.map((b) => [b.action, b.pull]), [['linked', 1]])
    // After a sync: linked straight from the cache, without asking GitHub for anything new.
    await s.h.sync.refresh('acme-learning')
    await s.scheduler.fire(s.job)
    assert.deepEqual(s.job.last?.brands.map((b) => [b.action, b.pull]), [['linked', 1]])
    assert.equal(s.h.github.callsTo('POST', /./).length, posts, 'no second branch, commit or pull request')
    assert.equal(gh.pulls.length, 1)
    assert.equal(s.h.github.calls.slice(start).some((c) => /\/merge$/.test(c.path) || c.method === 'PUT' || c.method === 'PATCH' || c.method === 'DELETE'), false, 'never merges or moves a ref')
    assert.equal(audit(s.h).filter((entry) => entry.action === 'template_update_check').at(-1)!.linked, 1)

    // A pull request opened by hand meanwhile is linked too, never duplicated.
    gh.pulls.length = 0
    gh.pulls.push({ number: 9, title: 'Manual update', head: 'template-update/manual', draft: false, base: 'main' })
    await s.h.sync.refresh('acme-learning')
    await s.scheduler.fire(s.job)
    assert.deepEqual(s.job.last?.brands.map((b) => [b.action, b.pull]), [['linked', 9]])
    assert.equal(gh.pulls.length, 1)
  } finally {
    await s.job.stop()
    fs.rmSync(s.h.dataDir, { recursive: true, force: true })
  }
})

test('template check job: brands outside the allowed accounts are reported, never written to', async () => {
  const s = await setup({ autoOpen: true, allowedOwners: [] })
  try {
    releaseTemplate(s.h.github)
    const summary = await s.job.runOnce()
    assert.deepEqual(summary.brands.map((b) => [b.state, b.action]), [['available', 'not_allowed']])
    assert.equal(s.h.github.repo(OWNER, 'acme-learning-brand')!.pulls.length, 0)
  } finally {
    await s.job.stop()
    fs.rmSync(s.h.dataDir, { recursive: true, force: true })
  }
})

test('template check job: jitter, exponential back-off on errors, at least an hour after a rate limit, reset on success', async () => {
  const s = await setup({ autoOpen: false, random: 1 })
  try {
    s.job.start()
    // Errors: the template head cannot be read.
    s.h.github.fail('GET', /^\/repos\/omidlog\/brand-os-template\/commits\//, 500, 1000)
    await s.scheduler.fire(s.job)
    assert.equal(s.job.last?.ok, false)
    assert.equal(s.scheduler.delay, Math.round(INTERVAL * 2 * 1.1), 'doubled, plus 10% jitter')
    assert.equal(audit(s.h).at(-1)!.result, 'failed')
    s.clock.now += 3 * HOUR // past the service's own back-off
    await s.scheduler.fire(s.job)
    assert.equal(s.scheduler.delay, Math.round(INTERVAL * 4 * 1.1))
    s.clock.now += 3 * HOUR
    for (let i = 0; i < 6; i += 1) {
      await s.scheduler.fire(s.job)
      s.clock.now += 3 * HOUR
    }
    assert.equal(s.scheduler.delay, Math.round(24 * HOUR * 1.1), 'capped at a day')

    // Success resets the back-off.
    s.h.github.faults.length = 0
    s.clock.now += HOUR
    await s.scheduler.fire(s.job)
    assert.equal(s.job.last?.ok, true)
    assert.equal(s.scheduler.delay, Math.round(INTERVAL * 1.1))
  } finally {
    await s.job.stop()
    fs.rmSync(s.h.dataDir, { recursive: true, force: true })
  }

  // Rate limit with a short interval: waits at least an hour. Jitter low end: 0.9 of the wait.
  const r = await setup({ autoOpen: false, random: 0 })
  try {
    const job = new TemplateUpdateJob({ registry: r.h.registry, sync: r.h.sync, updates: r.updates, dataDir: r.h.dataDir, intervalMs: 15 * 60_000, autoOpen: false, scheduler: r.scheduler, random: () => 0, now: () => r.clock.now, initialDelayMs: 1_000 })
    job.start()
    r.h.github.fail('GET', /^\/repos\/omidlog\/brand-os-template\/commits\//, 403, 1000, { headers: { 'x-ratelimit-remaining': '0' } })
    await r.scheduler.fire(job)
    assert.equal(job.last?.rateLimited, true)
    assert.equal(r.scheduler.delay, Math.round(HOUR * 0.9))
    assert.equal(audit(r.h).at(-1)!.result, 'rate_limited')
    await job.stop()
  } finally {
    await r.job.stop()
    fs.rmSync(r.h.dataDir, { recursive: true, force: true })
  }
})

test('template check job: never blocks, shares one run, stops cleanly mid-run, and stays off without access or interval', async () => {
  const s = await setup({ autoOpen: false })
  try {
    // A second brand, so a stop can land between brands.
    await provisioned(s.h, { slug: 'second-brand', name: 'Second Brand', repo: 'second-brand' })
    s.job.start()
    const first = s.job.runOnce()
    assert.equal(s.job.runOnce(), first, 'one run at a time')
    assert.equal(s.job.busy, true)
    const stopping = s.job.stop()
    assert.equal(s.scheduler.pending.size, 0)
    await stopping
    assert.equal(s.job.busy, false)
    assert.ok((await first).brands.length <= 2)
    assert.equal(s.scheduler.pending.size, 0, 'nothing scheduled after stop')
    assert.equal(s.job.active, false)

    const off = new TemplateUpdateJob({ registry: s.h.registry, sync: s.h.sync, updates: s.updates, dataDir: s.h.dataDir, intervalMs: 0, autoOpen: true, scheduler: s.scheduler })
    assert.equal(off.start(), false)
    const unconfigured = new TemplateUpdateService({ registry: s.h.registry, github: new (s.h.provisionClient.constructor as new (o: { token: null }) => typeof s.h.provisionClient)({ token: null }), templateOwner: TEMPLATE.owner, templateRepo: TEMPLATE.repo, allowedOwners: [], dataDir: s.h.dataDir })
    const noAccess = new TemplateUpdateJob({ registry: s.h.registry, sync: s.h.sync, updates: unconfigured, dataDir: s.h.dataDir, intervalMs: INTERVAL, autoOpen: true, scheduler: s.scheduler })
    assert.equal(noAccess.start(), false)
    assert.equal(s.scheduler.pending.size, 0)
  } finally {
    await s.job.stop()
    fs.rmSync(s.h.dataDir, { recursive: true, force: true })
  }
})

test('template check job: real timers are unref\'d, so a started job never keeps Node alive', async () => {
  const s = await setup({ autoOpen: false })
  try {
    const job = new TemplateUpdateJob({ registry: s.h.registry, sync: s.h.sync, updates: s.updates, dataDir: s.h.dataDir, intervalMs: INTERVAL, autoOpen: false })
    assert.equal(job.start(), true)
    assert.ok(job.nextDelayMs! >= 1_000 && job.nextDelayMs! <= 5.5 * 60_000)
    await job.stop()
    assert.equal(job.nextDelayMs, null)
  } finally {
    fs.rmSync(s.h.dataDir, { recursive: true, force: true })
  }
})

test('config: STUDIO_TEMPLATE_CHECK_MINUTES and STUDIO_TEMPLATE_AUTO_PR', () => {
  const base = { STUDIO_OWNER_LOGIN: 'owner', STUDIO_OWNER_PASSWORD_HASH: 'scrypt$x', STUDIO_SESSION_SECRET: Buffer.alloc(32, 1).toString('base64') }
  const defaults = loadConfig(base)
  assert.deepEqual(defaults.templateCheck, { intervalMs: 360 * 60_000, autoOpen: false }, 'checks every 6 hours, never opens by default')
  assert.deepEqual(loadConfig({ ...base, STUDIO_TEMPLATE_CHECK_MINUTES: '0', STUDIO_TEMPLATE_AUTO_PR: '1' }).templateCheck, { intervalMs: 0, autoOpen: true })
  assert.equal(loadConfig({ ...base, STUDIO_TEMPLATE_AUTO_PR: 'true' }).templateCheck.autoOpen, true)
  assert.throws(() => loadConfig({ ...base, STUDIO_TEMPLATE_CHECK_MINUTES: '5' }), (error: unknown) => error instanceof ConfigError && /at least 15/.test(error.message))
  assert.throws(() => loadConfig({ ...base, STUDIO_TEMPLATE_AUTO_PR: 'yes' }), (error: unknown) => error instanceof ConfigError && /STUDIO_TEMPLATE_AUTO_PR/.test(error.message))
})
