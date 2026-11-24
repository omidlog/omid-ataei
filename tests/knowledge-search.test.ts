import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import {
  archiveNote,
  backlinks,
  buildIndex,
  captureNote,
  editNote,
  findNote,
  knowledgeDoctor,
  listNotes,
  normalizeForSearch,
  relatedNotes,
  searchNotes,
  similarNotes,
  KnowledgeError,
} from '@brand-os/brand-core'
import { PERSIAN_IDEA, TURKISH_IDEA, useTestKey, workspace } from './helpers/knowledge.js'

useTestKey()

function code(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof KnowledgeError) return error.code
    throw error
  }
  return 'no error'
}

test('normalization unifies Persian letters, ZWNJ, digits and diacritics, and Turkish dotted/dotless i', () => {
  assert.equal(normalizeForSearch('كاكادو'), normalizeForSearch('کاکادو'))
  assert.equal(normalizeForSearch('يادگيري'), normalizeForSearch('یادگیری'))
  assert.equal(normalizeForSearch('رتبه‌ی'), normalizeForSearch('رتبهی'))
  assert.equal(normalizeForSearch('۷ روز'), '7 روز')
  assert.equal(normalizeForSearch('٧'), '7')
  assert.equal(normalizeForSearch('مُعَلِّم'), normalizeForSearch('معلم'))
  assert.equal(normalizeForSearch('İSTANBUL'), 'istanbul')
  assert.equal(normalizeForSearch('ıstanbul'), 'istanbul')
  assert.equal(normalizeForSearch('Rütbe Şehir'), 'rutbe sehir')
})

test('search finds a Persian idea by English tag, Persian variants, digits, and a Turkish idea by suffix and case', () => {
  const { ws } = workspace()
  const fa = captureNote(ws, { title: 'ارتقای رتبه‌ی خلبان', body: PERSIAN_IDEA, language: 'fa', tags: ['mascot', 'gamification', 'retention'] })
  const tr = captureNote(ws, { title: 'Maskot rütbesi', body: TURKISH_IDEA, language: 'tr', tags: ['maskot'] })
  const en = captureNote(ws, { title: 'Weekly streak email', body: 'Send a recap after a seven day streak.', language: 'en', tags: ['retention'] })
  const ids = (query: string) => searchNotes(ws, query).items.map((hit) => hit.id)
  assert.deepEqual(ids('mascot'), [fa.id], 'English tag finds the Persian note')
  assert.ok(ids('كاكادو').includes(fa.id), 'Arabic kaf/yeh variants match Persian text')
  assert.ok(ids('رتبهی').includes(fa.id), 'missing ZWNJ still matches')
  assert.ok(ids('7 روز').includes(fa.id), 'ASCII digits match Persian digits')
  assert.ok(ids('ISTANBUL').includes(tr.id), 'Turkish dotted İ in the note matches ASCII uppercase')
  assert.ok(ids('rutbe').includes(tr.id), 'diacritic-free query matches rütbe')
  assert.ok(ids('maskot').includes(tr.id) && ids('maskot')[0] === tr.id)
  assert.ok(ids('rütbe').includes(tr.id), 'prefix matches a suffixed Turkish word (rütbesi)')
  assert.deepEqual(ids('retention').sort(), [fa.id, en.id].sort())
  assert.deepEqual(ids('SEVEN DAY STREAK'), [en.id])
  assert.deepEqual(ids('nothing-like-this'), [])
})

test('ranking is title phrase > exact tag > body phrase > tokens, and snippets are real excerpts', () => {
  const { ws } = workspace()
  const body = captureNote(ws, { title: 'Unrelated heading', body: 'Line one.\nWe could add a referral loop here for growth.\nLine three.' })
  const tag = captureNote(ws, { title: 'Another heading', body: 'Nothing about it.', tags: ['referral'] })
  const title = captureNote(ws, { title: 'Referral loop', body: 'Short.' })
  const result = searchNotes(ws, 'referral loop')
  assert.deepEqual(result.items.map((hit) => hit.id), [title.id, tag.id, body.id])
  for (const hit of result.items) {
    assert.equal(hit.approval_state, 'unapproved_idea')
    assert.equal(hit.source_type, 'knowledge_note')
    if (hit.snippet) assert.ok(findNote(ws, hit.id).note.body.includes(hit.snippet), 'snippet is a substring of the note')
  }
  assert.equal(result.items[2]!.snippet, 'We could add a referral loop here for growth.')
  // Long lines are cut to the snippet size, still verbatim.
  const long = captureNote(ws, { title: 'Long', body: `${'filler '.repeat(400)}needle-word ${'tail '.repeat(400)}` })
  const hit = searchNotes(ws, 'needle-word', {}, { snippetChars: 100 }).items.find((item) => item.id === long.id)!
  assert.ok(hit.snippet!.length <= 100)
  assert.ok(findNote(ws, long.id).note.body.includes(hit.snippet!))
})

test('filters: kind, status, tags, language, dates, scope, question id, archived; pagination is capped at 50', () => {
  let clock = Date.parse('2026-01-01T00:00:00Z')
  const { root, ws } = workspace({ now: () => new Date(clock) })
  const a = captureNote(ws, { title: 'Alpha', body: 'x', kind: 'research', tags: ['one'], language: 'en', question_ids: ['brand.gamification.streaks'] })
  clock = Date.parse('2026-06-01T00:00:00Z')
  const b = captureNote(ws, { title: 'Beta', body: 'x', kind: 'idea', tags: ['one', 'two'], language: 'fa' })
  clock = Date.parse('2026-01-02T00:00:00Z')
  archiveNote(ws, a.id)
  assert.equal(findNote(ws, a.id).note.meta.updated_at, '2026-01-02T00:00:00.000Z', 'archiving updates updated_at')
  assert.deepEqual(listNotes(ws).items.map((n) => n.id), [b.id])
  assert.deepEqual(listNotes(ws, { include_archived: true }).items.map((n) => n.id), [b.id, a.id])
  assert.deepEqual(listNotes(ws, { status: ['archived'] }).items.map((n) => n.id), [a.id])
  assert.deepEqual(listNotes(ws, { kind: ['research'], include_archived: true }).items.map((n) => n.id), [a.id])
  assert.deepEqual(listNotes(ws, { tags: ['one', 'two'] }).items.map((n) => n.id), [b.id])
  assert.deepEqual(listNotes(ws, { language: 'fa' }).items.map((n) => n.id), [b.id])
  assert.deepEqual(listNotes(ws, { question_id: 'brand.gamification.streaks', include_archived: true }).items.map((n) => n.id), [a.id])
  assert.deepEqual(listNotes(ws, { since: '2026-03-01', include_archived: true }).items.map((n) => n.id), [b.id])
  assert.deepEqual(listNotes(ws, { until: '2026-03-01', include_archived: true }).items.map((n) => n.id), [a.id])
  assert.equal(listNotes(ws, { scope: 'shared' }).total, 0)
  assert.equal(code(() => listNotes(ws, { since: 'not a date' })), 'invalid_input')
  // Pagination.
  const dir = path.join(root, 'brand/.private/knowledge/local')
  for (let i = 0; i < 60; i += 1) {
    const id = `kn_page-${String(i).padStart(3, '0')}`
    fs.writeFileSync(path.join(dir, `${id}.md`), `---\nschema_version: 1\nid: ${id}\nbrand_slug: example-brand\ntitle: Page ${i}\nupdated_at: 2026-02-01T00:00:00Z\n---\nbody\n`)
  }
  const first = listNotes(ws, {}, { limit: 500 })
  assert.equal(first.items.length, 50)
  assert.equal(first.total, 61)
  assert.equal(first.next_offset, 50)
  assert.equal(listNotes(ws, {}, { limit: 50, offset: 50 }).items.length, 11)
  assert.equal(searchNotes(ws, 'page', {}, { limit: 1000 }).items.length, 50)
})

test('a note for another brand in the folder is excluded from list and search and reported by doctor', () => {
  const { root, ws } = workspace({ slug: 'pilito' })
  captureNote(ws, { title: 'Pilito idea', body: 'mascot' })
  fs.writeFileSync(path.join(root, 'brand/.private/knowledge/local/kn_other-brand.md'), '---\nschema_version: 1\nid: kn_other-brand\nbrand_slug: northwind\ntitle: Northwind mascot secret\n---\nmascot OTHER-BRAND-CANARY\n')
  assert.equal(searchNotes(ws, 'mascot').total, 1)
  assert.equal(code(() => findNote(ws, 'kn_other-brand')), 'not_found')
  const report = knowledgeDoctor(ws)
  assert.ok(report.issues.some((issue) => issue.code === 'wrong_brand'))
  assert.ok(!JSON.stringify(report).includes('OTHER-BRAND-CANARY'))
})

test('the cache is derived: removing or corrupting it rebuilds with identical results', () => {
  const { root, ws } = workspace()
  captureNote(ws, { title: 'Cache one', body: 'mascot progression' })
  captureNote(ws, { title: 'Cache two', body: 'mascot colours' })
  const first = searchNotes(ws, 'mascot').items.map((hit) => [hit.id, hit.score])
  assert.equal(buildIndex(ws).cache, 'hit')
  const cache = path.join(root, 'brand/.private/knowledge/cache/index.json')
  fs.rmSync(cache)
  assert.equal(buildIndex(ws).cache, 'rebuilt')
  fs.writeFileSync(cache, '{not json')
  const report = knowledgeDoctor(ws)
  assert.ok(report.issues.some((issue) => issue.code === 'cache_corrupt'))
  assert.equal(buildIndex(ws).cache, 'hit', 'doctor rebuilt it')
  assert.deepEqual(searchNotes(ws, 'mascot').items.map((hit) => [hit.id, hit.score]), first)
  // A stale entry (file edited outside the store) is detected.
  const note = searchNotes(ws, 'progression').items[0]!
  const file = path.join(root, note.path)
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('progression', 'progression edited by hand'))
  assert.ok(knowledgeDoctor(ws).issues.some((issue) => issue.code === 'cache_stale'))
})

test('links: typed links and [[kn_…]] body links give backlinks; broken links are detected; links to missing notes are refused', () => {
  const { root, ws } = workspace()
  const base = captureNote(ws, { title: 'Mascot ranks', body: 'Ranks for the pilot.', question_ids: ['brand.gamification.streaks'], tags: ['mascot'] })
  const supports = captureNote(ws, { title: 'Survey says kids like ranks', body: 'Evidence.', links: [{ id: base.id, relationship: 'supports' }] })
  const mentions = captureNote(ws, { title: 'Weekly plan', body: `See [[${base.id}]] for the rank idea.` })
  const sibling = captureNote(ws, { title: 'Streak freeze', body: 'Allow one missed day.', question_ids: ['brand.gamification.streaks'] })
  const view = backlinks(ws, base.id)
  assert.deepEqual(view.inbound.map((link) => [link.id, link.relationship]).sort(), [[supports.id, 'supports'], [mentions.id, 'related']].sort())
  assert.deepEqual(view.question_ids, ['brand.gamification.streaks'])
  assert.equal(backlinks(ws, supports.id).outbound[0]?.title, 'Mascot ranks')
  const related = relatedNotes(ws, base.id)
  assert.deepEqual(related.related.map((item) => item.id), [sibling.id])
  assert.deepEqual(related.related[0]!.shared_question_ids, ['brand.gamification.streaks'])

  assert.equal(code(() => captureNote(ws, { title: 'x', body: 'y', links: [{ id: 'kn_does-not-exist', relationship: 'related' }] })), 'invalid_input')
  assert.equal(code(() => captureNote(ws, { title: 'x', body: 'y', links: [{ id: base.id, relationship: 'likes' as 'related' }] })), 'invalid_input')
  // A title change keeps id and backlinks.
  const current = findNote(ws, base.id)
  editNote(ws, base.id, { expectedRevision: current.revision, ops: [{ op: 'set', title: 'Pilot ranks v2' }] })
  assert.equal(backlinks(ws, supports.id).outbound[0]?.title, 'Pilot ranks v2')
  assert.equal(backlinks(ws, base.id).inbound.length, 2)
  // Deleting a target by hand leaves a broken link that doctor reports.
  fs.rmSync(path.join(root, findNote(ws, mentions.id).path))
  fs.writeFileSync(path.join(root, 'brand/.private/knowledge/local/kn_dangling.md'), `---\nschema_version: 1\nid: kn_dangling\nbrand_slug: example-brand\ntitle: Dangling\n---\n[[kn_gone-away]]\n`)
  assert.deepEqual(backlinks(ws, 'kn_dangling').broken, ['kn_gone-away'])
  assert.ok(knowledgeDoctor(ws).issues.some((issue) => issue.code === 'broken_link' && issue.id === 'kn_dangling'))
})

test('possible duplicates are suggested by title and tags, never merged', () => {
  const { ws } = workspace()
  const a = captureNote(ws, { title: 'Mascot rank after seven days', body: 'one', tags: ['mascot'] })
  const b = captureNote(ws, { title: 'mascot RANK after seven days', body: 'two', tags: ['mascot'] })
  captureNote(ws, { title: 'Pricing page copy', body: 'three' })
  const similar = similarNotes(ws, a.id)
  assert.deepEqual(similar.map((item) => item.id), [b.id])
  assert.equal(similar[0]!.similarity, 1)
  assert.equal(listNotes(ws).total, 3, 'both notes remain')
})
