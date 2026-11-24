import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { TemplateUpdateService, UPDATE_BRANCH_PREFIX } from '../apps/studio/src/template-update.js'
import type { FakeGitHub } from './helpers/fake-github.js'
import { harness, OWNER, PROVISION_TOKEN, READ_TOKEN, provisioned, TEMPLATE, type Harness } from './helpers/studio.js'
import { Client, startStudio } from './helpers/studio-server.js'

/**
 * Studio's second write: "Updates available" and "Open update PR". Everything runs against the
 * in-memory GitHub (tests/helpers/fake-github.ts); no network, no real repository or pull request.
 */
const MANIFEST = fs.readFileSync(path.resolve(import.meta.dirname, '..', '.brand-os', 'sync.json'))

/** Gives the fake template a sync manifest and a few core files before any brand is created. */
function seedTemplate(github: FakeGitHub): void {
  github.pushEdit(TEMPLATE.owner, TEMPLATE.repo, (tree) => {
    tree.set('.brand-os/sync.json', MANIFEST)
    tree.set('scripts/tool.ts', Buffer.from('export const tool = 1\n'))
    tree.set('scripts/edited.ts', Buffer.from('export const edited = 1\n'))
    tree.set('package.json', Buffer.from('{\n  "name": "brand-os-template",\n  "version": "0.2.0"\n}\n'))
  })
}

/** A template release: a core update, a new core file, a shared file, a brand file and a core file the brand edited. */
function releaseTemplate(github: FakeGitHub): string {
  return github.pushEdit(TEMPLATE.owner, TEMPLATE.repo, (tree) => {
    tree.set('scripts/tool.ts', Buffer.from('export const tool = 2\n'))
    tree.set('scripts/new.ts', Buffer.from('export const added = true\n'))
    tree.set('scripts/edited.ts', Buffer.from('export const edited = 2\n'))
    tree.set('package.json', Buffer.from('{\n  "name": "brand-os-template",\n  "version": "0.3.0"\n}\n'))
    tree.set('brand/brand.config.yaml', Buffer.from('# template example that must never reach a brand\n'))
  }, 'feat: template release')
}

function service(h: Harness, allowedOwners = [OWNER]): TemplateUpdateService {
  return new TemplateUpdateService({ registry: h.registry, github: h.provisionClient, templateOwner: TEMPLATE.owner, templateRepo: TEMPLATE.repo, allowedOwners, dataDir: h.dataDir })
}

async function brandWithRelease(): Promise<{ h: Harness; repo: string; before: string; to: string }> {
  const h = harness()
  seedTemplate(h.github)
  const req = await provisioned(h)
  // The brand edits one core file itself; the update must report it, not overwrite it.
  h.github.pushEdit(OWNER, req.repo, (tree) => tree.set('scripts/edited.ts', Buffer.from('export const edited = "mine"\n')))
  const before = h.github.repo(OWNER, req.repo)!.head!
  const to = releaseTemplate(h.github)
  return { h, repo: req.repo, before, to }
}

test('template update: opens one pull request on a new branch with core changes only, never touching main or brand files', async () => {
  const { h, repo, before, to } = await brandWithRelease()
  try {
    const updates = service(h)
    const start = h.github.calls.length
    const result = await updates.openUpdatePull('acme-learning', 'owner')
    const calls = h.github.calls.slice(start)
    assert.equal(result.ok, true)
    assert.equal(result.ok && result.code, 'opened')
    const gh = h.github.repo(OWNER, repo)!
    const branch = `${UPDATE_BRANCH_PREFIX}${to.slice(0, 12)}`
    // The default branch did not move; the update lives on its own branch with one commit on top of it.
    assert.equal(gh.head, before)
    const tip = gh.branches.get(branch)
    assert.ok(tip, 'update branch created')
    assert.equal(h.github.commits.get(tip)!.parent, before)
    const files = h.github.treeAt(tip)
    const main = h.github.treeAt(before)
    assert.equal(files.get('scripts/tool.ts')?.toString(), 'export const tool = 2\n')
    assert.equal(files.get('scripts/new.ts')?.toString(), 'export const added = true\n')
    assert.match(files.get('package.json')!.toString(), /0\.3\.0/)
    // Edited by the brand: left alone and reported.
    assert.equal(files.get('scripts/edited.ts')?.toString(), 'export const edited = "mine"\n')
    // Brand-owned: untouched, byte for byte.
    assert.deepEqual(files.get('brand/brand.config.yaml'), main.get('brand/brand.config.yaml'))
    for (const [file, data] of files) if (file.startsWith('brand/') && file !== 'brand/template-version.json') assert.deepEqual(data, main.get(file), file)
    const record = JSON.parse(files.get('brand/template-version.json')!.toString())
    assert.equal(record.commit, to)
    assert.equal(record.source, 'studio')
    assert.equal(record.version, '0.3.0')
    // The pull request targets the default branch and lists the file that needs a person.
    assert.equal(gh.pulls.length, 1)
    assert.equal(gh.pulls[0]!.head, branch)
    assert.equal(gh.pulls[0]!.base, 'main')
    assert.match(gh.pulls[0]!.body!, /Needs a person \(1, not changed\)[\s\S]*scripts\/edited\.ts/)
    assert.match(gh.pulls[0]!.body!, /never merges/)
    // Writes use the provisioning credential; nothing merges or moves a branch.
    for (const call of calls) assert.equal(call.token, PROVISION_TOKEN, `${call.method} ${call.path}`)
    assert.equal(calls.some((c) => /\/merge$/.test(c.path) || c.method === 'PUT' || c.method === 'PATCH' || c.method === 'DELETE'), false)
    // No decoy secret reached a blob.
    for (const blob of h.github.blobs.values()) assert.equal(blob.toString().includes('DECOY'), false)
    // Audited, without any token.
    const audit = fs.readFileSync(path.join(h.dataDir, 'audit.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    assert.equal(audit.at(-1).result, 'opened')
    assert.equal(audit.at(-1).actor, 'owner')
    assert.equal(audit.at(-1).pull, 1)
    assert.equal(audit.at(-1).conflicts, 1)
    const raw = fs.readFileSync(path.join(h.dataDir, 'audit.jsonl'), 'utf8')
    assert.equal(raw.includes(PROVISION_TOKEN) || raw.includes(READ_TOKEN), false)

    // Idempotent: a second request links the open pull request and writes nothing.
    const writesBefore = h.github.calls.filter((c) => c.method === 'POST').length
    const again = await updates.openUpdatePull('acme-learning', 'owner')
    assert.equal(again.ok && again.code, 'exists')
    assert.equal(again.ok && again.code === 'exists' && again.pull.number, 1)
    assert.equal(h.github.calls.filter((c) => c.method === 'POST').length, writesBefore)
    assert.equal(gh.pulls.length, 1)

    // A branch left behind (pull request closed) is reused, never moved or recreated.
    gh.pulls.length = 0
    const commitsBefore = h.github.callsTo('POST', /\/git\/commits$/).length
    const resumed = await updates.openUpdatePull('acme-learning', 'owner')
    assert.equal(resumed.ok && resumed.code, 'opened')
    assert.equal(h.github.callsTo('POST', /\/git\/commits$/).length, commitsBefore)
    assert.equal(gh.branches.get(branch), tip)
    assert.equal(gh.head, before)
  } finally {
    fs.rmSync(h.dataDir, { recursive: true, force: true })
  }
})

test('template update: status compares the recorded commit with the template head', async () => {
  const h = harness()
  try {
    seedTemplate(h.github)
    await provisioned(h)
    const updates = service(h)
    const projection = h.sync.get('acme-learning').projection
    const head = await updates.templateHead()
    assert.equal(projection?.template?.commit, head)
    assert.equal(updates.status(projection, head).state, 'current')
    const to = releaseTemplate(h.github)
    assert.equal(await updates.templateHead(), head, 'cached within the TTL')
    assert.equal(await updates.templateHead({ force: true }), to)
    const available = updates.status(projection, to)
    assert.equal(available.state, 'available')
    assert.equal(available.from, head)
    assert.equal(updates.status(projection, to, [{ number: 7, title: 'x', html_url: 'https://github.com/a/b/pull/7', head_ref: `${UPDATE_BRANCH_PREFIX}abc`, draft: false, updated_at: null }]).pull?.number, 7)
    assert.equal(updates.status(projection ? { ...projection, template: null } : null, to).state, 'untracked')
    assert.equal(updates.status(projection ? { ...projection, template: undefined } : null, to).state, 'unknown')
    assert.equal(updates.status(projection, null).state, 'unknown')
    // Nothing to do when the brand is already on the head.
    const fresh = harness()
    seedTemplate(fresh.github)
    await provisioned(fresh)
    const current = await service(fresh).openUpdatePull('acme-learning', 'owner')
    assert.equal(current.ok && current.code, 'current')
    assert.equal(fresh.github.callsTo('POST', /\/git\/refs$|\/pulls$/).length, 0)
    fs.rmSync(fresh.dataDir, { recursive: true, force: true })
  } finally {
    fs.rmSync(h.dataDir, { recursive: true, force: true })
  }
})

test('template update: rate limits and errors degrade to "unknown" and back off without failing', async () => {
  const h = harness()
  try {
    seedTemplate(h.github)
    await provisioned(h)
    let clock = 1_000_000
    const updates = new TemplateUpdateService({ registry: h.registry, github: h.provisionClient, templateOwner: TEMPLATE.owner, templateRepo: TEMPLATE.repo, allowedOwners: [OWNER], dataDir: h.dataDir, now: () => clock })
    h.github.fail('GET', /^\/repos\/omidlog\/brand-os-template\/commits\//, 403, 20, { headers: { 'x-ratelimit-remaining': '0' } })
    assert.equal(await updates.templateHead(), null)
    assert.equal(updates.status(h.sync.get('acme-learning').projection, null).state, 'unknown')
    const reads = h.github.callsTo('GET', /brand-os-template\/commits\//).length
    clock += 5 * 60_000
    assert.equal(await updates.templateHead(), null)
    assert.equal(updates.peekHead(), null)
    assert.equal(h.github.callsTo('GET', /brand-os-template\/commits\//).length, reads, 'backs off after a rate limit')
    h.github.faults.length = 0
    clock += 11 * 60_000
    assert.match((await updates.templateHead()) ?? '', /^[0-9a-f]{40}$/)
    // Opening while GitHub fails reports a failure and never leaves a branch or pull request.
    releaseTemplate(h.github)
    h.github.fail('POST', /\/pulls$/, 500, 10)
    const failed = await updates.openUpdatePull('acme-learning', 'owner')
    assert.equal(failed.ok, false)
    assert.equal(!failed.ok && failed.code, 'failed')
    assert.equal(h.github.repo(OWNER, 'acme-learning-brand')!.pulls.length, 0)
    assert.match(fs.readFileSync(path.join(h.dataDir, 'audit.jsonl'), 'utf8'), /"result":"failed"/)
  } finally {
    fs.rmSync(h.dataDir, { recursive: true, force: true })
  }
})

test('template update: refuses brands outside the allowed accounts, without a record, and concurrent runs', async () => {
  const { h, repo } = await brandWithRelease()
  try {
    const denied = await service(h, []).openUpdatePull('acme-learning', 'owner')
    assert.equal(!denied.ok && denied.code, 'not_configured')
    const updates = service(h)
    const [a, b] = await Promise.all([updates.openUpdatePull('acme-learning', 'owner'), updates.openUpdatePull('acme-learning', 'owner')])
    assert.deepEqual([a, b].map((r) => r.code).sort(), ['busy', 'opened'])
    assert.equal(h.github.repo(OWNER, repo)!.pulls.length, 1)
    // A brand without a template record cannot be updated by Studio.
    h.github.repo(OWNER, repo)!.pulls.length = 0
    h.github.pushEdit(OWNER, repo, (tree) => tree.delete('brand/template-version.json'))
    const untracked = await updates.openUpdatePull('acme-learning', 'owner')
    assert.equal(!untracked.ok && untracked.code, 'untracked')
  } finally {
    fs.rmSync(h.dataDir, { recursive: true, force: true })
  }
})

test('Studio routes: "Updates available" on the list and overview, and "Open update PR" is owner-only, CSRF-protected and idempotent', async () => {
  const s = await startStudio()
  try {
    seedTemplate(s.github)
    const client = new Client(s.url)
    await client.login()
    const csrf = await client.csrf('/brands/new')
    await client.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Acme Learning', slug: 'acme-learning', profile: 'business', default_locale: 'en', locales: ['en'], owner: OWNER, repo: 'acme-learning' } })
    await s.studio.provisioning.settled()
    await s.studio.sync.settled()
    await s.studio.templateUpdates.templateHead({ force: true })
    let page = await client.page('/brands/acme-learning')
    assert.match(page.text, /data-update-state="current"/)
    assert.equal(page.text.includes('action="/brands/acme-learning/template-update"'), false)
    assert.equal((await client.page('/brands')).text.includes('Updates available'), false)

    releaseTemplate(s.github)
    await s.studio.templateUpdates.templateHead({ force: true })
    assert.match((await client.page('/brands')).text, /Updates available/)
    page = await client.page('/brands/acme-learning')
    assert.match(page.text, /data-update-state="available"/)
    assert.match(page.text, /action="\/brands\/acme-learning\/template-update"/)
    for (const lang of ['fa', 'tr']) {
      await client.get(`/brands?lang=${lang}`)
      const localized = await client.page('/brands/acme-learning')
      assert.match(localized.text, lang === 'fa' ? /به‌روزرسانی موجود است/ : /Güncelleme var/)
      assert.match(localized.text, lang === 'fa' ? /dir="rtl"/ : /dir="ltr"/)
    }
    await client.get('/brands?lang=en')

    // Guests, a missing CSRF token and a foreign Origin are refused before anything reaches GitHub.
    const guest = new Client(s.url)
    assert.equal((await guest.request('POST', '/brands/acme-learning/template-update', { form: { _csrf: 'x' } })).status, 401)
    const token = await client.csrf('/brands/acme-learning')
    assert.equal((await client.request('POST', '/brands/acme-learning/template-update', { form: { _csrf: 'forged' } })).status, 403)
    assert.equal((await client.request('POST', '/brands/acme-learning/template-update', { form: { _csrf: token }, origin: 'https://evil.example' })).status, 403)
    assert.equal(s.github.callsTo('POST', /\/pulls$/).length, 0)

    const opened = await client.request('POST', '/brands/acme-learning/template-update', { form: { _csrf: token } })
    assert.equal(opened.status, 303)
    assert.equal(opened.headers.get('location'), '/brands/acme-learning?update=opened&pr=1#template-update')
    const flash = await client.page('/brands/acme-learning?update=opened&pr=1')
    assert.match(flash.text, /Update pull request #1 is open/)
    assert.match(flash.text, /href="https:\/\/github.com\/brand-owner\/acme-learning\/pull\/1"/)
    const again = await client.request('POST', '/brands/acme-learning/template-update', { form: { _csrf: token } })
    assert.equal(again.headers.get('location'), '/brands/acme-learning?update=exists&pr=1#template-update')
    assert.equal(s.github.repo(OWNER, 'acme-learning')!.pulls.length, 1)
    // After the next sync the open update pull request replaces the button.
    await s.studio.sync.refresh('acme-learning')
    page = await client.page('/brands/acme-learning')
    assert.match(page.text, /data-update-state="pull"/)
    assert.equal(page.text.includes('action="/brands/acme-learning/template-update"'), false)
    assert.match((await client.page('/brands')).text, /Update PR open/)
  } finally {
    await s.close()
  }
})
