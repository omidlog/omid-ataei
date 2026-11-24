import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nameSuggestions } from '../apps/studio/src/provision.js'
import { Client, startStudio, type RunningStudio } from './helpers/studio-server.js'
import { harness, OWNER, request } from './helpers/studio.js'

/**
 * Failed provisioning UX: "Edit and retry", "Discard this attempt" and the wizard's read-only check
 * that a repository name is free before anything is created.
 */

const README = new Map([['README.md', Buffer.from('someone else')]])

async function failedAttempt(h: ReturnType<typeof harness>, repo = 'taken'): Promise<void> {
  h.github.addRepo(OWNER, repo, README)
  assert.ok(h.provisioning.start(request({ repo }), 'owner').ok)
  await h.provisioning.settled()
  assert.equal(h.registry.get('acme-learning')?.provisioning?.error?.code, 'destination_exists')
}

test('name suggestions: <base>-brand, then -2 … -5, never the taken name itself', () => {
  assert.deepEqual(nameSuggestions('acme', 'acme'), ['acme-brand', 'acme-brand-2', 'acme-brand-3', 'acme-brand-4', 'acme-brand-5'])
  assert.deepEqual(nameSuggestions('acme', 'ACME-brand'), ['acme-brand-2', 'acme-brand-3', 'acme-brand-4', 'acme-brand-5'])
})

test('checkName: free, taken on GitHub or in Studio with a free suggestion; only GET requests, only allowlisted owners', async () => {
  const h = harness()
  h.github.addRepo(OWNER, 'acme', README)
  h.github.addRepo(OWNER, 'acme-brand', README)
  assert.deepEqual(await h.provisioning.checkName({ owner: OWNER, repo: 'fresh-name' }), { state: 'free' })
  assert.deepEqual(await h.provisioning.checkName({ owner: OWNER, repo: 'acme', slug: 'acme' }), { state: 'taken', where: 'github', suggestion: 'acme-brand-2' })
  // A taken "<slug>-brand" suggests the next number, not "<slug>-brand-brand".
  assert.deepEqual(await h.provisioning.checkName({ owner: OWNER, repo: 'acme-brand', slug: 'acme' }), { state: 'taken', where: 'github', suggestion: 'acme-brand-2' })

  await failedAttempt(h, 'acme-brand-2')
  assert.deepEqual(await h.provisioning.checkName({ owner: OWNER, repo: 'acme-brand-2' }), { state: 'taken', where: 'studio', suggestion: 'acme-brand-3' })
  // The failed attempt being edited does not count against its own name in Studio (GitHub still decides).
  assert.deepEqual(await h.provisioning.checkName({ owner: OWNER, repo: 'acme-brand-2', retryOf: 'acme-learning' }), { state: 'taken', where: 'github', suggestion: 'acme-brand-3' })

  // Not a lookup service: other owners and invalid names are never sent to GitHub.
  const before = h.github.calls.length
  assert.deepEqual(await h.provisioning.checkName({ owner: 'someone-else', repo: 'x' }), { state: 'invalid' })
  assert.deepEqual(await h.provisioning.checkName({ owner: OWNER, repo: '../etc' }), { state: 'invalid' })
  assert.equal(h.github.calls.length, before)

  h.github.fail('GET', /\/repos\/brand-owner\/flaky$/, 401, 10)
  assert.deepEqual(await h.provisioning.checkName({ owner: OWNER, repo: 'flaky' }), { state: 'unknown' })

  const checks = h.github.calls.filter((call) => call.path.startsWith(`/repos/${OWNER}/`) && !call.path.includes('/generate'))
  assert.ok(checks.length > 0)
  assert.ok(h.github.calls.slice(before).every((call) => call.method === 'GET'), 'the name check only reads')
})

test('editAndRetry replaces the failed attempt with the edited request (new repository name, new slug) and creates it', async () => {
  const h = harness()
  await failedAttempt(h)
  assert.deepEqual(h.provisioning.editAndRetry('acme-learning', request({ slug: 'acme-two', repo: 'acme-two-brand' }), 'owner'), { ok: true })
  await h.provisioning.settled()
  assert.equal(h.registry.get('acme-learning'), null, 'the failed record was replaced')
  const record = h.registry.get('acme-two')!
  assert.equal(record.provisioning?.state, 'ready')
  assert.equal(record.provisioning?.attempts, 2)
  assert.equal(record.repo.name, 'acme-two-brand')
  assert.ok(h.github.repo(OWNER, 'taken'), 'the existing repository is untouched')
  assert.equal(h.github.callsTo('DELETE', /./).length, 0)
  // Only a failed attempt can be edited, and never onto another brand's slug or repository.
  assert.deepEqual(h.provisioning.editAndRetry('acme-two', request({ slug: 'acme-two', repo: 'x' }), 'owner'), { ok: false, code: 'not_failed' })
  await failedAttempt(h)
  assert.deepEqual(h.provisioning.editAndRetry('acme-learning', request({ slug: 'acme-two', repo: 'new-name' }), 'owner'), { ok: false, code: 'duplicate' })
  assert.deepEqual(h.provisioning.editAndRetry('acme-learning', request({ repo: 'acme-two-brand' }), 'owner'), { ok: false, code: 'duplicate' })
  assert.deepEqual(h.provisioning.editAndRetry('nope', request(), 'owner'), { ok: false, code: 'unknown_brand' })
})

test('discardFailed removes only the failed registry entry and never calls GitHub', async () => {
  const h = harness()
  h.github.deleteForbidden = true
  h.github.fail('POST', /\/git\/commits$/, 500, 10)
  h.provisioning.start(request(), 'owner')
  await h.provisioning.settled()
  assert.equal(h.registry.get('acme-learning')?.provisioning?.cleanup, 'required')
  const calls = h.github.calls.length
  const result = h.provisioning.discardFailed('acme-learning')
  assert.equal(result.ok, true)
  assert.equal(h.registry.get('acme-learning'), null)
  assert.equal(h.github.calls.length, calls, 'no GitHub request at all')
  assert.ok(h.github.repo(OWNER, 'acme-learning-brand'), 'the repository on GitHub stays for the owner to handle')
  assert.deepEqual(h.provisioning.discardFailed('acme-learning'), { ok: false, code: 'unknown_brand' })
})

async function withStudio(fn: (s: RunningStudio, client: Client) => Promise<void>): Promise<void> {
  const s = await startStudio()
  try {
    const client = new Client(s.url)
    await client.login()
    await fn(s, client)
  } finally {
    await s.close()
  }
}

const FORM = { name: 'Acme Learning', slug: 'acme-learning', profile: 'business', default_locale: 'en', locales: ['en'], owner: OWNER }

test('server: a taken name is refused before submit with a suggestion, and nothing is created', async () => {
  await withStudio(async (s, client) => {
    s.github.addRepo(OWNER, 'acme-learning', README)
    const check = await client.get(`/brands/new/repo-check.json?owner=${OWNER}&repo=acme-learning&slug=acme-learning`)
    assert.equal(check.status, 200)
    assert.deepEqual(await check.json(), { state: 'taken', where: 'github', suggestion: 'acme-learning-brand' })

    const csrf = await client.csrf('/brands/new')
    const res = await client.request('POST', '/brands/new', { form: { _csrf: csrf, ...FORM, repo: 'acme-learning' } })
    assert.equal(res.status, 409)
    const text = await res.text()
    assert.match(text, /acme-learning already exists\. Try acme-learning-brand\./)
    assert.equal(s.studio.registry.list().length, 0)
    assert.equal(s.github.callsTo('POST', /\/generate$/).length, 0)

    const guest = new Client(s.url)
    assert.equal((await guest.get(`/brands/new/repo-check.json?owner=${OWNER}&repo=x`)).status, 401)
  })
})

test('server: failed page offers Edit and retry (prefilled) and Discard (confirmed, Studio-only)', async () => {
  await withStudio(async (s, client) => {
    s.github.addRepo(OWNER, 'taken', README)
    // Simulate a name taken between the check and the create: provisioning fails with destination_exists.
    assert.ok(s.studio.provisioning.start(request({ repo: 'taken' }), 'owner').ok)
    await s.studio.provisioning.settled()

    const failed = await client.page('/brands/acme-learning/provisioning')
    assert.match(failed.text, /href="\/brands\/new\?retry=acme-learning"[^>]*>Edit and retry</)
    assert.match(failed.text, /href="\/brands\/acme-learning\/provisioning\/discard"[^>]*>Discard this attempt</)

    const edit = await client.page('/brands/new?retry=acme-learning')
    assert.match(edit.text, /name="retry_of" value="acme-learning"/)
    assert.match(edit.text, /id="repo" name="repo"[^>]*value="taken"/)
    assert.match(edit.text, /id="name" name="name"[^>]*value="Acme Learning"|value="Acme Learning"/)
    assert.match(edit.text, /data-repo-check[^>]*aria-live="polite"|aria-live="polite"[^>]*data-repo-check/)

    // Resubmitting the same taken name is caught before anything runs.
    let csrf = await client.csrf('/brands/new')
    let res = await client.request('POST', '/brands/new', { form: { _csrf: csrf, ...FORM, repo: 'taken', retry_of: 'acme-learning' } })
    assert.equal(res.status, 409)
    assert.match(await res.text(), /taken already exists/)

    csrf = await client.csrf('/brands/new')
    res = await client.request('POST', '/brands/new', { form: { _csrf: csrf, ...FORM, repo: 'acme-learning-brand', retry_of: 'acme-learning' } })
    assert.equal(res.status, 303)
    await s.studio.provisioning.settled()
    const record = s.studio.registry.get('acme-learning')!
    assert.equal(record.provisioning?.state, 'ready')
    assert.equal(record.repo.name, 'acme-learning-brand')
    assert.equal(record.provisioning?.attempts, 2)

    // A retry_of that no longer names a failed attempt is refused rather than guessed.
    csrf = await client.csrf('/brands/new')
    res = await client.request('POST', '/brands/new', { form: { _csrf: csrf, ...FORM, slug: 'other', repo: 'other', retry_of: 'acme-learning' } })
    assert.equal(res.status, 409)
    assert.match(await res.text(), /no longer exists or is not failed/)
  })
})

test('server: discard asks first, removes only the registry entry, and needs the CSRF token', async () => {
  await withStudio(async (s, client) => {
    s.github.addRepo(OWNER, 'taken', README)
    assert.ok(s.studio.provisioning.start(request({ repo: 'taken' }), 'owner').ok)
    await s.studio.provisioning.settled()
    const confirm = await client.page('/brands/acme-learning/provisioning/discard')
    assert.equal(confirm.res.status, 200)
    assert.match(confirm.text, /Nothing on GitHub is changed or deleted/)
    assert.match(confirm.text, /<form method="post" action="\/brands\/acme-learning\/provisioning\/discard"/)

    const forged = await client.request('POST', '/brands/acme-learning/provisioning/discard', { form: { _csrf: 'wrong' } })
    assert.equal(forged.status, 403)
    assert.ok(s.studio.registry.get('acme-learning'))

    const calls = s.github.calls.length
    const csrf = await client.csrf('/brands/acme-learning/provisioning/discard')
    const res = await client.request('POST', '/brands/acme-learning/provisioning/discard', { form: { _csrf: csrf } })
    assert.equal(res.status, 303)
    assert.equal(res.headers.get('location'), '/brands?discarded=1')
    assert.equal(s.studio.registry.get('acme-learning'), null)
    assert.equal(s.github.calls.length, calls, 'discarding never calls GitHub')
    assert.ok(s.github.repo(OWNER, 'taken'))
    assert.match((await client.page('/brands?discarded=1')).text, /Nothing on GitHub was changed/)
  })
})
