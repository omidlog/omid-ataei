import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import {
  buildStudioKnowledge,
  captureNote,
  filterStudioKnowledge,
  InterviewEngine,
  newNoteId,
  serializeNote,
  shareNote,
  type NoteMeta,
  type Visibility,
} from '@brand-os/brand-core'
import { studioPathAllowed } from '../apps/studio/src/github/tar.js'
import { Client, startStudio, type RunningStudio } from './helpers/studio-server.js'
import { harness, OWNER, provisioned } from './helpers/studio.js'
import { brandDir, listTree, PERSIAN_IDEA, useTestKey } from './helpers/knowledge.js'

const PRIVATE: Visibility = { state: 'private', repository: 'acme/acme-learning', detail: 'test' }
const FAKE_GITHUB_TOKEN = `ghp_${'A1b2C3d4E5'.repeat(4)}`

function note(slug: string, meta: Partial<NoteMeta>, body: string): { id: string; text: string } {
  const id = meta.id ?? newNoteId()
  const full: NoteMeta = {
    schema_version: 1,
    id,
    brand_slug: slug,
    title: 'A shared idea',
    kind: 'idea',
    status: 'inbox',
    classification: 'internal',
    language: 'en',
    tags: [],
    links: [],
    question_ids: [],
    source: { kind: 'owner_note', ref: null },
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    ...meta,
  }
  return { id, text: serializeNote({ meta: full, body }) }
}

test('core: the Studio projection holds shared notes only, withholds unsafe or malformed files by reason, and writes nothing', () => {
  useTestKey()
  const root = brandDir({ slug: 'acme-learning' })
  const ws = { root, brandSlug: 'acme-learning', now: () => new Date('2026-11-21T12:00:00Z') }
  const shared = path.join(root, 'brand', 'knowledge', 'shared')
  captureNote(ws, { title: 'Local only', body: 'LOCAL-CANARY stays on this computer.' })
  captureNote(ws, { title: 'Sealed', body: 'RESTRICTED-CANARY budget.', classification: 'restricted' })
  const a = captureNote(ws, { title: 'ارتقای رتبه‌ی خلبان', body: PERSIAN_IDEA, language: 'fa', tags: ['mascot', 'gamification'], question_ids: ['brand.strategy.purpose'] })
  shareNote(ws, a.id, { visibility: PRIVATE, dryRun: false, expectedRevision: a.revision })
  const b = captureNote(ws, { title: 'Weekly streak recap', body: `Builds on [[${a.id}]]. Send a recap after a seven day streak.`, tags: ['retention'], links: [{ id: a.id, relationship: 'supports' }] })
  shareNote(ws, b.id, { visibility: PRIVATE, dryRun: false, expectedRevision: b.revision })
  const archived = note('acme-learning', { title: 'Old banner idea', status: 'archived', question_ids: ['brand.unknown.thing'] }, 'An archived idea.')
  fs.writeFileSync(path.join(shared, `${archived.id}.md`), archived.text)
  // Files that reached the shared folder without `share` (hand-committed): each must be withheld.
  const other = note('other-brand', {}, 'OTHER-BRAND-CANARY')
  fs.writeFileSync(path.join(shared, `${other.id}.md`), other.text)
  const secret = note('acme-learning', { title: 'Deploy notes' }, `token ${FAKE_GITHUB_TOKEN}`)
  fs.writeFileSync(path.join(shared, `${secret.id}.md`), secret.text)
  const restricted = note('acme-learning', { classification: 'restricted' }, 'RESTRICTED-CLASS-CANARY')
  fs.writeFileSync(path.join(shared, `${restricted.id}.md`), restricted.text)
  fs.writeFileSync(path.join(shared, 'kn_broken-note.md'), '---\nid: [unclosed\n---\nMALFORMED-CANARY')
  const before = listTree(root)

  const engine = new InterviewEngine(root)
  const k = buildStudioKnowledge(engine)
  assert.deepEqual(listTree(root), before, 'building the projection writes nothing (no cache, no folders)')
  assert.deepEqual(k.notes.map((n) => n.id).sort(), [a.id, b.id, archived.id].sort())
  assert.equal(k.total, 3)
  assert.deepEqual(k.by_status, { inbox: 2, triaged: 0, active: 0, archived: 1 })
  const reasons = Object.fromEntries(k.withheld.map((item) => [path.basename(item.path), item.reason]))
  assert.equal(reasons[`${other.id}.md`], 'wrong_brand')
  assert.equal(reasons[`${secret.id}.md`], 'credentials')
  assert.equal(reasons[`${restricted.id}.md`], 'restricted_classification')
  assert.equal(reasons['kn_broken-note.md'], 'invalid_note')
  const json = JSON.stringify(k)
  for (const canary of ['LOCAL-CANARY', 'RESTRICTED-CANARY', 'OTHER-BRAND-CANARY', FAKE_GITHUB_TOKEN, 'RESTRICTED-CLASS-CANARY', 'MALFORMED-CANARY']) assert.equal(json.includes(canary), false, canary)

  const projectedA = k.notes.find((n) => n.id === a.id)!
  assert.equal(projectedA.approval_state, 'unapproved_idea')
  assert.equal(projectedA.body?.trim(), PERSIAN_IDEA)
  assert.deepEqual(projectedA.inbound.map((link) => [link.id, link.relationship]), [[b.id, 'supports']])
  assert.equal(projectedA.question_ids[0]!.known, true)
  assert.ok(projectedA.question_ids[0]!.label)
  const projectedArchived = k.notes.find((n) => n.id === archived.id)!
  assert.deepEqual(projectedArchived.question_ids, [{ id: 'brand.unknown.thing', label: null, module: null, known: false }], 'an unknown question id is shown as unknown, never invented')

  // Search over the projection: Arabic kaf/yeh variants find the Persian note; tags; archived hidden by default.
  assert.deepEqual(filterStudioKnowledge(k, { query: 'كاكادو' }).map((hit) => hit.note.id), [a.id])
  assert.deepEqual(filterStudioKnowledge(k, { tag: 'MASCOT' }).map((hit) => hit.note.id), [a.id])
  assert.equal(filterStudioKnowledge(k, { query: 'streak' })[0]!.note.id, b.id)
  assert.deepEqual(filterStudioKnowledge(k, { query: 'banner' }), [], 'archived notes need the archived filter')
  assert.deepEqual(filterStudioKnowledge(k, { query: 'banner', status: 'archived' }).map((hit) => hit.note.id), [archived.id])
  assert.deepEqual(filterStudioKnowledge(k, { query: 'LOCAL-CANARY' }), [])
})

test('core: a brand without brand/knowledge projects an empty, clean state', () => {
  const root = brandDir({ slug: 'acme-learning' })
  fs.rmSync(path.join(root, 'brand', 'knowledge'), { recursive: true, force: true })
  const before = listTree(root)
  const k = buildStudioKnowledge(new InterviewEngine(root))
  assert.deepEqual({ total: k.total, notes: k.notes, withheld: k.withheld, truncated: k.truncated }, { total: 0, notes: [], withheld: [], truncated: false })
  assert.deepEqual(listTree(root), before)
})

async function withStudio(fn: (s: RunningStudio, owner: Client) => Promise<void>): Promise<void> {
  const s = await startStudio()
  try {
    const owner = new Client(s.url)
    await owner.login()
    for (const [name, slug] of [['Acme Learning', 'acme-learning'], ['Beta Brand', 'beta-brand']]) {
      const csrf = await owner.csrf('/brands/new')
      await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: name!, slug: slug!, profile: 'business', default_locale: 'en', locales: ['en', 'fa', 'tr'], owner: OWNER, repo: slug! } })
      await s.studio.provisioning.settled()
      await s.studio.sync.settled()
    }
    await fn(s, owner)
  } finally {
    await s.close()
  }
}

test('Studio: the Knowledge page shows merged shared notes read-only, labelled as unverified ideas, and nothing else', async () => {
  await withStudio(async (s, owner) => {
    // Before any shared note: no navigation entry, an honest empty page.
    const empty = await owner.page('/brands/acme-learning/market/knowledge')
    assert.equal(empty.res.status, 200)
    assert.match(empty.text, /No shared notes on this commit/)
    assert.equal((await owner.page('/brands/acme-learning')).text.includes('href="/brands/acme-learning/market/knowledge"'), false)

    const a = note('acme-learning', { title: 'Pilot <script>alert(1)</script> rank', tags: ['mascot'], question_ids: ['brand.strategy.purpose'], status: 'triaged' }, 'After seven days <img src=https://evil.example/x.png onerror=alert(1)> promote the pilot.\nSecond line.')
    const b = note('acme-learning', { title: 'Streak recap', tags: ['retention'], links: [{ id: a.id, relationship: 'related' }] }, `See [[${a.id}]] and [[kn_not-projected]].`)
    const other = note('beta-brand', {}, 'BETA-ONLY')
    const sha = s.github.pushEdit(OWNER, 'acme-learning', (tree) => {
      tree.set(`brand/knowledge/shared/${a.id}.md`, Buffer.from(a.text))
      tree.set(`brand/knowledge/shared/${b.id}.md`, Buffer.from(b.text))
      // Committed by mistake: none of these may reach Studio.
      tree.set('brand/.private/knowledge/local/kn_local-one.md', Buffer.from(note('acme-learning', { id: 'kn_local-one' }, 'LOCAL-CANARY').text))
      tree.set('brand/knowledge/.cache/index.json', Buffer.from('{"CACHE-CANARY":1}'))
      tree.set('brand/knowledge/README.md', Buffer.from('README-CANARY'))
      tree.set('brand/knowledge/shared/nested/kn_nested.md', Buffer.from('NESTED-CANARY'))
      tree.set('brand/Knowledge/shared/kn_case.md', Buffer.from('CASE-CANARY'))
      tree.set(`brand/knowledge/shared/${other.id}.md`, Buffer.from(other.text))
    })
    s.github.pushEdit(OWNER, 'beta-brand', (tree) => tree.set(`brand/knowledge/shared/${other.id}.md`, Buffer.from(other.text)))
    for (const file of ['brand/.private/knowledge/local/kn_local-one.md', 'brand/knowledge/.cache/index.json', 'brand/knowledge/README.md', 'brand/knowledge/shared/nested/kn_nested.md', 'brand/Knowledge/shared/kn_case.md']) {
      assert.equal(studioPathAllowed(file), false, file)
    }
    await s.studio.sync.refresh('acme-learning')
    await s.studio.sync.refresh('beta-brand')
    assert.equal(s.studio.sync.get('acme-learning').status.sha, sha)

    const list = await owner.page('/brands/acme-learning/market/knowledge')
    assert.equal(list.res.status, 200)
    assert.match(list.text, /Unverified idea/)
    assert.match(list.text, /Not an approved brand fact/)
    assert.match(list.text, /Streak recap/)
    assert.match(list.text, /Pilot &lt;script&gt;alert\(1\)&lt;\/script&gt; rank/)
    assert.equal(/<script>alert|<img src=https:\/\/evil/.test(list.text), false, 'note text is escaped, never markup')
    assert.match(list.text, /<form class="kn-filters" method="get"/)
    assert.equal(/<form[^>]*method="post"[^>]*action="\/brands\/acme-learning\/knowledge/i.test(list.text), false)
    assert.match((await owner.page('/brands/acme-learning')).text, /href="\/brands\/acme-learning\/market\/knowledge"/, 'the navigation entry appears once notes exist')
    assert.match(list.text, /Belongs to another brand/, 'a note for another brand is withheld with a reason')

    const detail = await owner.page(`/brands/acme-learning/market/knowledge?note=${a.id}`)
    assert.equal(detail.res.status, 200)
    assert.match(detail.text, /&lt;img src=https:\/\/evil\.example\/x\.png onerror=alert\(1\)&gt;/)
    assert.match(detail.text, new RegExp(`href="/brands/acme-learning/market/knowledge\\?note=${b.id}"`), 'backlink from the other shared note')
    assert.match(detail.text, /href="\/brands\/acme-learning\/brand\/book"/, 'a linked question points at its brand section')
    assert.match(detail.text, new RegExp(`https://github\\.com/${OWNER}/acme-learning/blob/${sha}/brand/knowledge/shared/${a.id}\\.md`))
    assert.match(detail.text, new RegExp(`show --id ${a.id} --json`), 'starter prompt names the note id')
    const linked = await owner.page(`/brands/acme-learning/market/knowledge?note=${b.id}`)
    assert.match(linked.text, new RegExp(`href="/brands/acme-learning/market/knowledge\\?note=${a.id}"`))
    assert.match(linked.text, /\[\[kn_not-projected\]\]/, 'a link to a note Studio does not have stays plain text')

    const search = await owner.page('/brands/acme-learning/market/knowledge?q=recap')
    assert.match(search.text, /1 matching notes/)
    const tag = await owner.page('/brands/acme-learning/market/knowledge?tag=mascot')
    assert.match(tag.text, /Pilot &lt;script&gt;/)
    assert.equal(tag.text.includes('Streak recap'), false)

    for (const query of ['?note=kn_does-not-exist', '?note=..%2F..%2Fetc%2Fpasswd', `?note=${other.id}`, '?note=kn_local-one']) {
      assert.equal((await owner.page(`/brands/acme-learning/market/knowledge${query}`)).res.status, 404, query)
    }
    assert.equal((await owner.page(`/brands/beta-brand/market/knowledge?note=${a.id}`)).res.status, 404, 'another brand cannot show this note')
    assert.equal((await owner.page(`/brands/beta-brand/market/knowledge?note=${other.id}`)).res.status, 200)

    const everything = [list.text, detail.text, linked.text, search.text, fs.readFileSync(path.join(s.config.dataDir, 'cache', 'acme-learning', 'state.json'), 'utf8')].join('\n')
    for (const canary of ['LOCAL-CANARY', 'CACHE-CANARY', 'README-CANARY', 'NESTED-CANARY', 'CASE-CANARY', 'BETA-ONLY']) assert.equal(everything.includes(canary), false, canary)

    // Read only: no write method is routed for the page.
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await owner.request(method, '/brands/acme-learning/market/knowledge', { form: { _csrf: 'x' } })
      assert.ok([404, 405].includes(res.status), `${method} ${res.status}`)
    }
    // Guests: identical redirect for a real and a forged brand.
    const guest = new Client(s.url)
    for (const pathname of ['/brands/acme-learning/market/knowledge', `/brands/acme-learning/market/knowledge?note=${a.id}`, '/brands/zzz-forged/market/knowledge']) {
      const res = await guest.get(pathname)
      assert.equal(res.status, 302, pathname)
      assert.equal((await res.text()).includes('Pilot'), false)
    }

    // Persian and Turkish catalogs, right-to-left for Persian.
    await owner.get('/brands/acme-learning/market/knowledge?lang=fa')
    const fa = await owner.page('/brands/acme-learning/market/knowledge')
    assert.match(fa.text, /dir="rtl"/)
    assert.match(fa.text, /ایده‌ی تأییدنشده/)
    await owner.get('/brands/acme-learning/market/knowledge?lang=tr')
    assert.match((await owner.page('/brands/acme-learning/market/knowledge')).text, /Doğrulanmamış fikir/)
  })
})

test('sync: a cache written before the knowledge projection existed is rebuilt at the same commit', async () => {
  const h = harness()
  const req = await provisioned(h)
  const file = path.join(h.dataDir, 'cache', req.slug, 'state.json')
  const state = JSON.parse(fs.readFileSync(file, 'utf8')) as { projection: Record<string, unknown> }
  assert.ok(state.projection.knowledge)
  delete state.projection.knowledge
  fs.writeFileSync(file, JSON.stringify(state))
  assert.equal(h.sync.get(req.slug).projection!.knowledge, undefined)
  const after = await h.sync.refresh(req.slug)
  assert.deepEqual(after.projection!.knowledge!.notes, [])
})
