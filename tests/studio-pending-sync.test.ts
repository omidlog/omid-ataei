import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { parse, stringify } from 'yaml'
import { ConfigError, loadConfig } from '../apps/studio/src/config.js'
import { HeadPollJob } from '../apps/studio/src/head-poll.js'
import { countPullChanges, recordsTouched } from '../apps/studio/src/pull-changes.js'
import { brandDisplayName } from '../apps/studio/src/sync.js'
import type { Scheduler } from '../apps/studio/src/template-update-job.js'
import { bidi, bidiMarkup, html, mixedDirection } from '../apps/studio/src/views/html.js'
import { itemValue } from '../apps/studio/src/views/components.js'
import { i18n } from '../apps/studio/src/i18n/index.js'
import type { FakePullFile } from './helpers/fake-github.js'
import { approve, editOutsideStudio } from './helpers/edits.js'
import { Client, startStudio, type RunningStudio } from './helpers/studio-server.js'
import { harness, OWNER, provisioned } from './helpers/studio.js'

/**
 * BOS-02 (open pull requests as counts), BOS-11 (default-branch poll, webhook guidance), BOS-20 (approved display
 * name everywhere) and BOS-21 (mixed Persian/Latin values in logical order).
 */

const LEDGER_PATCH = [
  '@@ -120,3 +120,21 @@ records:',
  '     approved_at: 2026-11-01T10:00:00.000Z',
  '     version: 1',
  '     superseded_by: null',
  '+  - answer_id: ans-0042',
  '+    question_id: brand.strategy.purpose',
  "+    value: 'BRANCH-ONLY-CANARY purpose'",
  '+    version: 1',
  '+  - answer_id: ans-0043',
  '+    question_id: brand.strategy.vision',
  "+    value: 'BRANCH-ONLY-CANARY vision'",
  '+    version: 1',
].join('\n')

const MANIFEST_PATCH = [
  '@@ -1,8 +1,8 @@',
  ' schema_version: 1',
  ' assets:',
  '   - id: asset.logo.primary',
  '     name: Primary logo',
  '-    status: draft',
  '+    status: approved',
  '     owner: design',
].join('\n')

const EVIDENCE_PATCH = ['@@ -0,0 +1,4 @@', '+schema_version: 1', '+items:', '+  - id: ev-0001', '+    claim: personal.credibility.credentials'].join('\n')

const PR_FILES: FakePullFile[] = [
  { filename: 'brand/interview/answer-ledger.yaml', patch: LEDGER_PATCH },
  { filename: 'brand/assets/asset-manifest.yaml', patch: MANIFEST_PATCH },
  { filename: 'brand/interview/evidence-register.yaml', status: 'added', patch: EVIDENCE_PATCH },
  { filename: 'brand/assets/logo/primary.svg', status: 'added' },
  { filename: 'docs/notes.md' },
]

/* ---------------------------------------------------------------- BOS-02 units */

test('BOS-02: records touched are counted per brand file; other files are counted, never read', () => {
  assert.equal(recordsTouched(LEDGER_PATCH), 2, 'two new ledger records')
  assert.equal(recordsTouched(MANIFEST_PATCH), 1, 'a changed field belongs to the manifest row above it')
  assert.equal(recordsTouched(EVIDENCE_PATCH), 2, 'the header lines before the first record count as one change, plus the record')
  assert.equal(recordsTouched('@@ -10,2 +10,2 @@\n-    note: a\n+    note: b'), 1, 'a change with no record line in its hunk still counts once')
  const counted = countPullChanges(PR_FILES.map((file) => ({ filename: file.filename, status: file.status ?? 'modified', patch: file.patch ?? '' })), false)
  assert.deepEqual(counted, { files: 5, facts: 2, evidence: 2, assets: 1, other: 2, partial: false })
  const large = countPullChanges([{ filename: 'brand/interview/answer-ledger.yaml', status: 'modified', patch: null }], false)
  assert.deepEqual(large, { files: 1, facts: 1, evidence: 0, assets: 0, other: 0, partial: true }, 'a diff GitHub left out is a lower bound')
  assert.equal(countPullChanges([], true).partial, true, 'a cut-off file list is a lower bound')
})

test('BOS-02: the GitHub client lists pull request files with GET only and pages through them', async () => {
  const h = harness()
  const req = await provisioned(h)
  const many: FakePullFile[] = Array.from({ length: 250 }, (_, index) => ({ filename: `docs/file-${index}.md` }))
  const number = h.github.openPull(OWNER, req.repo, { title: 'Many files', head: 'feat/many', files: many })
  const listed = await h.readClient.listPullFiles(OWNER, req.repo, number)
  assert.equal(listed.files.length, 250)
  assert.equal(listed.truncated, false)
  const capped = await h.readClient.listPullFiles(OWNER, req.repo, number, 2)
  assert.equal(capped.files.length, 200)
  assert.equal(capped.truncated, true)
  const calls = h.github.callsTo('GET', /\/pulls\/\d+\/files/)
  assert.equal(calls.length, 5)
  assert.ok(calls.every((call) => call.method === 'GET' && call.token !== null))
  await assert.rejects(h.readClient.listPullFiles(OWNER, req.repo, 0), /Invalid pull request number/)
})

test('BOS-02: the background sync counts each open pull request once, caches it with the history, and never stores branch content', async () => {
  const h = harness()
  const req = await provisioned(h)
  const number = h.github.openPull(OWNER, req.repo, { title: 'Approve purpose and logo', head: 'feat/purpose', files: PR_FILES })
  const first = await h.sync.refresh(req.slug)
  const pull = first.history!.pulls.find((item) => item.number === number)!
  assert.deepEqual(pull.changes, { files: 5, facts: 2, evidence: 2, assets: 1, other: 2, partial: false })
  assert.equal(h.github.callsTo('GET', /\/pulls\/\d+\/files/).length, 1)
  const state = fs.readFileSync(path.join(h.dataDir, 'cache', req.slug, 'state.json'), 'utf8')
  assert.equal(state.includes('BRANCH-ONLY-CANARY'), false, 'no diff text is cached')
  assert.equal(state.includes('docs/notes.md'), false, 'no branch file name is cached')
  assert.ok(state.includes('"facts":2'))

  // Unchanged pull request: the cached counts are reused, no further request.
  h.sync.markDirty(req.slug)
  await h.sync.refresh(req.slug)
  assert.equal(h.github.callsTo('GET', /\/pulls\/\d+\/files/).length, 1, 'counts are cached while the pull request is unchanged')

  // Updated pull request: counted again.
  const repo = h.github.repo(OWNER, req.repo)!
  repo.pulls[0]!.updated_at = new Date(Date.now() + 60_000).toISOString()
  repo.pulls[0]!.files = [{ filename: 'docs/other.md' }]
  h.sync.markDirty(req.slug)
  const second = await h.sync.refresh(req.slug)
  assert.deepEqual(second.history!.pulls[0]!.changes, { files: 1, facts: 0, evidence: 0, assets: 0, other: 1, partial: false })
  assert.equal(h.github.callsTo('GET', /\/pulls\/\d+\/files/).length, 2)
})

test('BOS-02: a rate limit stops further file reads in that sync; the history and earlier counts stay', async () => {
  const h = harness()
  const req = await provisioned(h)
  h.github.openPull(OWNER, req.repo, { title: 'One', head: 'feat/one', files: PR_FILES })
  h.github.openPull(OWNER, req.repo, { title: 'Two', head: 'feat/two', files: PR_FILES })
  h.github.fail('GET', /\/pulls\/\d+\/files/, 403, 10, { headers: { 'x-ratelimit-remaining': '0' } })
  const before = h.github.callsTo('GET', /\/pulls\/\d+\/files/).length
  const result = await h.sync.refresh(req.slug)
  assert.equal(result.status.last_error, null, 'the sync itself succeeds')
  assert.equal(result.history!.error, null)
  assert.equal(result.history!.pulls.length, 2)
  assert.ok(result.history!.pulls.every((pull) => pull.changes === null), 'unknown, not zero')
  // One pull request was tried (with the client's own bounded retries); the second was not requested at all.
  const tried = h.github.callsTo('GET', /\/pulls\/\d+\/files/).slice(before)
  assert.ok(tried.length >= 1)
  assert.ok(tried.every((call) => /\/pulls\/1\/files/.test(call.path)), 'no request for the second pull request after a rate limit')
})

/* ---------------------------------------------------------------- BOS-11 units */

class ManualScheduler implements Scheduler {
  pending: Array<{ callback: () => void; ms: number }> = []
  setTimeout(callback: () => void, ms: number): unknown {
    const entry = { callback, ms }
    this.pending.push(entry)
    return entry
  }
  clearTimeout(handle: unknown): void {
    this.pending = this.pending.filter((entry) => entry !== handle)
  }
}

test('BOS-11: the head poll makes one GET per brand and refreshes only a brand whose default branch moved', async () => {
  const h = harness()
  const req = await provisioned(h)
  const poll = new HeadPollJob({ registry: h.registry, sync: h.sync, github: h.readClient, intervalMs: 180_000 })
  const callsBefore = h.github.calls.length
  const quiet = await poll.runOnce()
  assert.deepEqual(quiet, { checked: 1, moved: [], rateLimited: false, failed: 0 })
  const quietCalls = h.github.calls.slice(callsBefore)
  assert.equal(quietCalls.length, 1, 'one request per brand')
  assert.equal(quietCalls[0]!.method, 'GET')
  assert.match(quietCalls[0]!.path, /\/git\/ref\/heads\/main$/)

  const sha = editOutsideStudio(h, req.repo, (engine, root) => approve(engine, root, { 'brand.strategy.purpose': 'Merged without pressing Refresh' }))
  const moved = await poll.runOnce()
  assert.deepEqual(moved.moved, [req.slug])
  await h.sync.settled()
  assert.equal(h.sync.get(req.slug).status.sha, sha, 'the merged commit appears without Refresh')
  assert.ok(h.github.calls.slice(callsBefore).every((call) => call.method === 'GET'), 'the poll and its refresh only read')
})

test('BOS-11: the head poll is off without an interval or read access, backs off after a rate limit, and stops cleanly', async () => {
  const h = harness()
  await provisioned(h)
  assert.equal(new HeadPollJob({ registry: h.registry, sync: h.sync, github: h.readClient, intervalMs: 0 }).start(), false, 'interval 0 is off')
  const scheduler = new ManualScheduler()
  const poll = new HeadPollJob({ registry: h.registry, sync: h.sync, github: h.readClient, intervalMs: 120_000, scheduler })
  assert.equal(poll.start(), true)
  assert.equal(scheduler.pending.length, 1)
  assert.equal(poll.nextDelayMs, 120_000)
  h.github.fail('GET', /\/git\/ref\/heads\//, 429, 10, { headers: { 'retry-after': '1' } })
  scheduler.pending.shift()!.callback()
  await poll.runOnce()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(poll.last?.rateLimited, true)
  assert.ok((poll.nextDelayMs ?? 0) >= 15 * 60_000, `waits at least 15 minutes after a rate limit, got ${poll.nextDelayMs}`)
  await poll.stop()
  assert.equal(scheduler.pending.length, 0)
  assert.equal(poll.active, false)
})

test('BOS-11: STUDIO_HEAD_POLL_SECONDS defaults to 3 minutes, 0 turns it off, and short intervals are refused', () => {
  const base = { STUDIO_OWNER_LOGIN: 'owner', STUDIO_OWNER_PASSWORD_HASH: 'scrypt$x', STUDIO_SESSION_SECRET: Buffer.alloc(32, 1).toString('base64') }
  assert.equal(loadConfig(base).headPollMs, 180_000)
  assert.equal(loadConfig({ ...base, STUDIO_HEAD_POLL_SECONDS: '0' }).headPollMs, 0)
  assert.equal(loadConfig({ ...base, STUDIO_HEAD_POLL_SECONDS: '300' }).headPollMs, 300_000)
  assert.throws(() => loadConfig({ ...base, STUDIO_HEAD_POLL_SECONDS: '30' }), (error: unknown) => error instanceof ConfigError && /STUDIO_HEAD_POLL_SECONDS/.test(error.message))
  assert.throws(() => loadConfig({ ...base, STUDIO_HEAD_POLL_SECONDS: 'soon' }), ConfigError)
})

/* ---------------------------------------------------------------- BOS-20 / BOS-21 units */

test('BOS-20: the display name is the synced brand.name only once it is approved', () => {
  const record = { display_name: 'omid ataei' } as Parameters<typeof brandDisplayName>[0]
  const projection = (name: string, status: string) => ({ brand: { name, name_status: status } }) as unknown as Parameters<typeof brandDisplayName>[1]
  assert.equal(brandDisplayName(record, null), 'omid ataei', 'before the first sync: the registry name')
  assert.equal(brandDisplayName(record, projection('Omid Ataei', 'approved')), 'Omid Ataei')
  assert.equal(brandDisplayName(record, projection('Working Name', 'working')), 'omid ataei', 'an unapproved name is not shown as the brand name')
  assert.equal(brandDisplayName(record, projection('  ', 'approved')), 'omid ataei')
})

const MIXED = 'Wordmark تیره (logo-omid-ataei-black.svg) برای پس‌زمینهٔ روشن؛ نمونه در https://omidataei.com/work (۲۰۲۴).'

test('BOS-21: mixed Persian/English values get the direction of most of their words and isolated Latin runs', () => {
  assert.equal(mixedDirection(MIXED), 'rtl', 'a Latin first word does not make a Persian sentence left-to-right')
  assert.equal(mixedDirection('Founder of سازمان نمونه (since 2020)'), 'ltr')
  assert.equal(mixedDirection('Only English (file.svg)'), null)
  assert.equal(mixedDirection('فقط فارسی'), null)
  const markup = bidiMarkup(MIXED)
  assert.match(markup, /<bdi class="bidi-run" dir="ltr">Wordmark<\/bdi> تیره \(<bdi class="bidi-run" dir="ltr">logo-omid-ataei-black\.svg<\/bdi>\) برای/)
  assert.match(markup, /<bdi class="bidi-run" dir="ltr">https:\/\/omidataei\.com\/work<\/bdi> \(۲۰۲۴\)\.$/, 'the URL is isolated without the closing punctuation')
  assert.equal(bidiMarkup('<b>Acme</b> شرکت').includes('<b>'), false, 'runs are escaped')
  assert.equal(bidi('Acme شرکت').value, '<bdi dir="rtl"><bdi class="bidi-run" dir="ltr">Acme</bdi> شرکت</bdi>')

  // The central rule: any value placed straight inside a dir="auto" element.
  assert.equal(html`<p class="item-text" dir="auto">${MIXED}</p>`.value.startsWith('<p class="item-text" dir="rtl" data-bidi="mixed"><bdi class="bidi-run" dir="ltr">Wordmark</bdi>'), true)
  assert.equal(html`<p dir="auto">${'Plain English (file.svg)'}</p>`.value, '<p dir="auto">Plain English (file.svg)</p>', 'English-only values are unchanged')
  assert.equal(html`<p dir="auto">${'فقط فارسی'}</p>`.value, '<p dir="auto">فقط فارسی</p>', 'Persian-only values keep dir="auto"')
  assert.equal(html`<textarea dir="auto">${MIXED}</textarea>`.value.includes('<bdi'), false, 'no markup inside a textarea')
  assert.equal(html`<p dir="auto" title="${MIXED}">x</p>`.value.includes('<bdi'), false, 'attributes are only escaped')

  // The shared value helper the document pages use.
  for (const locale of ['en', 'fa'] as const) {
    const out = itemValue(i18n(locale), { id: 'brand.visual.logo_variants', value: MIXED, withheld: false, structured: null, kind: 'text', note: null } as unknown as Parameters<typeof itemValue>[1]).value
    assert.match(out, /^<p class="item-text" dir="rtl" data-bidi="mixed">/, locale)
    assert.match(out, /<bdi class="bidi-run" dir="ltr">logo-omid-ataei-black\.svg<\/bdi>/, locale)
  }
  const css = fs.readFileSync(path.resolve(import.meta.dirname, '../apps/studio/static/studio.css'), 'utf8')
  assert.match(css, /\.bidi-run, \[data-bidi\] \{ unicode-bidi: isolate; \}/)
  assert.match(fs.readFileSync(path.resolve(import.meta.dirname, '../apps/studio/static/visual.css'), 'utf8'), /\.bidi-run, \[data-bidi\] \{ unicode-bidi: isolate; \}/, 'print views isolate too')
})

/* ---------------------------------------------------------------- server */

async function withStudio(fn: (s: RunningStudio, client: Client) => Promise<void>, githubOverrides = {}): Promise<void> {
  const s = await startStudio({}, githubOverrides)
  try {
    const client = new Client(s.url)
    await client.login()
    const csrf = await client.csrf('/brands/new')
    await client.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'acme learning', slug: 'acme-learning', profile: 'business', default_locale: 'en', locales: ['en', 'fa'], owner: OWNER, repo: 'acme-learning' } })
    await s.studio.provisioning.settled()
    await s.studio.sync.settled()
    await fn(s, client)
  } finally {
    await s.close()
  }
}

/** `?lang=` sets the language cookie and redirects; the page is then read in that language. */
async function pageIn(client: Client, pathname: string, lang: string): Promise<{ res: Response; text: string }> {
  await client.get(`${pathname}?lang=${lang}`)
  return client.page(pathname)
}

async function refresh(s: RunningStudio, client: Client): Promise<void> {
  const csrf = await client.csrf('/brands/acme-learning')
  await client.request('POST', '/brands/acme-learning/refresh', { form: { _csrf: csrf, return: '/brands/acme-learning' } })
  await s.studio.sync.settled()
}

test('BOS-02: the overview says how many changes wait in open pull requests, links each, counts them, and labels them unmerged', async () => {
  await withStudio(async (s, client) => {
    const overviewBefore = await client.page('/brands/acme-learning')
    assert.doesNotMatch(overviewBefore.text, /id="pending-pulls"/, 'no banner without open pull requests')
    const n1 = s.github.openPull(OWNER, 'acme-learning', { title: 'Approve purpose <b>and</b> logo', head: 'feat/purpose', files: PR_FILES })
    const n2 = s.github.openPull(OWNER, 'acme-learning', { title: 'Docs only', head: 'docs/only', files: [{ filename: 'docs/readme.md' }], draft: true })
    s.studio.sync.markDirty('acme-learning')
    await refresh(s, client)

    const overview = await client.page('/brands/acme-learning')
    const card = overview.text.match(/<section class="card pending-card"[\s\S]*?<\/section>/)?.[0] ?? ''
    assert.match(card, /2 changes are waiting in open pull requests/)
    assert.match(card, /Unmerged, not canonical/)
    assert.ok(card.includes(`href="https://github.com/${OWNER}/acme-learning/pull/${n1}"`))
    assert.ok(card.includes(`href="https://github.com/${OWNER}/acme-learning/pull/${n2}"`))
    assert.match(card, /Approve purpose &lt;b&gt;and&lt;\/b&gt; logo/, 'pull request titles are escaped')
    assert.match(card, /Facts: 2<\/span>.*Evidence: 2<\/span>.*Assets: 1<\/span>.*Other files: 2<\/span>/s)
    assert.match(card, /Other files: 1/)
    assert.match(card, /Draft/)
    for (const leak of ['BRANCH-ONLY-CANARY', 'docs/notes.md', 'primary.svg']) assert.equal(overview.text.includes(leak), false, `${leak} never reaches the page`)
    // The merged view is unchanged: no unmerged value is presented as brand truth.
    assert.doesNotMatch(overview.text, /BRANCH-ONLY/)

    const other = await client.page('/brands/acme-learning/governance/github')
    assert.match(other.text, /<p class="pending-line" data-pending-pulls="2">.*2 changes are waiting in open pull requests.*Unmerged, not canonical.*href="\/brands\/acme-learning#pending-pulls"/s)
    const history = await client.page('/brands/acme-learning/governance/history')
    assert.match(history.text, /data-pull-changes="1"/)

    const fa = await pageIn(client, '/brands/acme-learning', 'fa')
    assert.match(fa.text, /۲ تغییر در درخواست‌های ادغام باز منتظر است/)
    assert.match(fa.text, /ادغام‌نشده، غیرمعتبر/)
    const tr = await pageIn(client, '/brands/acme-learning', 'tr')
    assert.match(tr.text, /2 değişiklik açık çekme isteklerinde bekliyor/)
  })
})

test('BOS-11: /healthz never waits for GitHub, and the account page explains the webhook only while none is configured', async () => {
  await withStudio(async (s, client) => {
    s.github.fail('GET', /.*/, 500, 1000)
    s.studio.sync.markDirty('acme-learning')
    void s.studio.sync.refresh('acme-learning')
    const started = performance.now()
    const health = await fetch(`${s.url}/healthz`)
    assert.equal(health.status, 200)
    assert.ok(performance.now() - started < 500, '/healthz does not depend on the sync or GitHub')
    await s.studio.sync.settled()
    s.github.faults.length = 0

    const account = await client.page('/account')
    const guide = account.text.match(/<section class="card" id="webhook-setup"[\s\S]*?<\/section>/)?.[0] ?? ''
    assert.ok(guide.includes(`${s.url}/webhooks/github`), 'payload URL')
    assert.match(guide, /application\/json/)
    assert.match(guide, /Just the push event/)
    assert.match(guide, /STUDIO_GITHUB_WEBHOOK_SECRET/)
    assert.match(account.text, /Default-branch check<\/dt><dd>Off/, 'tests run without the poll')
    const fa = await pageIn(client, '/account', 'fa')
    assert.match(fa.text, /راه‌اندازی وب‌هوک push/)
  }, { webhookSecret: null })

  await withStudio(async (s, client) => {
    const account = await client.page('/account')
    assert.doesNotMatch(account.text, /id="webhook-setup"/)
    assert.equal(account.text.includes(s.config.github.webhookSecret!), false, 'the secret is never shown')
  })
})

test('BOS-20: after a sync with an approved brand.name, every surface shows it instead of the registry name', async () => {
  await withStudio(async (s, client) => {
    const before = await client.page('/brands')
    assert.match(before.text, /class="brand-card-title" dir="auto">acme learning</, 'the registry name before the name is approved')
    s.github.pushEdit(OWNER, 'acme-learning', (tree) => {
      const config = parse(tree.get('brand/brand.config.yaml')!.toString('utf8')) as { brand: Record<string, unknown> }
      config.brand.name = 'Acme Learning Co.'
      config.brand.name_status = 'approved'
      tree.set('brand/brand.config.yaml', Buffer.from(stringify(config)))
    }, 'feat(brand): approve the name')
    await refresh(s, client)

    const list = await client.page('/brands')
    assert.match(list.text, /class="brand-card-title" dir="auto">Acme Learning Co\.</, 'brand list')
    assert.match(list.text, /class="brand-link-name" dir="auto">Acme Learning Co\.</, 'sidebar switcher')
    for (const pathname of ['/brands/acme-learning', '/brands/acme-learning/governance/github', '/brands/acme-learning/governance/history', '/brands/acme-learning/strategy/business-model']) {
      const page = await client.page(pathname)
      assert.equal(page.res.status, 200, pathname)
      assert.match(page.text, /<title>[^<]*Acme Learning Co\./, `${pathname}: page title`)
      assert.match(page.text, /<a href="\/brands\/acme-learning" dir="auto">Acme Learning Co\.<\/a>|<span dir="auto" aria-current="page">Acme Learning Co\.<\/span>/, `${pathname}: breadcrumb`)
      assert.equal(/>acme learning</.test(page.text), false, `${pathname}: the registry name is gone`)
    }
    const handoff = await client.page('/brands/acme-learning/governance/github')
    assert.match(handoff.text, /<div class="eyebrow">.*<span dir="auto">Acme Learning Co\.<\/span>/s, 'GitHub & Claude Code header')
  })
})

test('BOS-21: a merged mixed fa/en value renders with dir and isolated runs in the English and the Persian UI', async () => {
  await withStudio(async (s, client) => {
    editOutsideStudio(s, 'acme-learning', (engine, root) => approve(engine, root, { 'brand.strategy.purpose': MIXED }))
    await refresh(s, client)
    for (const lang of ['en', 'fa']) {
      const page = await pageIn(client, '/brands/acme-learning/brand/book', lang)
      assert.equal(page.res.status, 200)
      assert.match(page.text, /dir="rtl" data-bidi="mixed"><bdi class="bidi-run" dir="ltr">Wordmark<\/bdi> تیره \(<bdi class="bidi-run" dir="ltr">logo-omid-ataei-black\.svg<\/bdi>\)/, `${lang}: brand book`)
      assert.match(page.text, /<bdi class="bidi-run" dir="ltr">https:\/\/omidataei\.com\/work<\/bdi>/, `${lang}: URL isolated`)
    }
  })
})
