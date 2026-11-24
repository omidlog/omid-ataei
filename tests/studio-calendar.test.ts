import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { buildStudioCalendar } from '@brand-os/brand-core/content-bridge'
import { studioPathAllowed } from '../apps/studio/src/github/tar.js'

/**
 * Content Bridge Slice B: the read-only Studio "Content calendar" page. Only approved weeks the owner shared with
 * `brand:content share` and merged reach Studio; drafts and week records under brand/.private never do.
 */

function week(slug: string, start: string, extra: Record<string, unknown> = {}): Buffer {
  const end = new Date(Date.parse(`${start}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10)
  return Buffer.from(
    JSON.stringify({
      schema_version: 1,
      kind: 'content_week',
      week_id: `wk-${start}`,
      brand_slug: slug,
      revision: 1,
      content_sha256: 'b'.repeat(64),
      approved_at: '2026-11-20T10:00:00.000Z',
      week_start: start,
      week_end: end,
      strategy: { strategy_id: 'content-main', revision: 1 },
      languages: ['en'],
      slots: [
        {
          id: 's01',
          date: start,
          channel: 'instagram',
          format: 'reel',
          pillar: 'learning-stories',
          pillar_name: 'Learning stories',
          language: 'en',
          key_message: 'brand.strategy.promise',
          offer: null,
          cta: null,
          hook: 'Hook <script>alert(1)</script> from day one',
          angle: null,
          research: { observation_id: 'ob_13d9016f-9920-4218-b663-b192a620bed3', confidence: 'medium' },
          status: 'approved',
        },
      ],
      gaps: [{ channel: 'linkedin', reason: 'cadence_not_decided' }],
      shared_at: '2026-11-20T11:00:00.000Z',
      ...extra,
    }),
  )
}

test('Studio path filter: only brand/content-calendar/shared/wk-YYYY-MM-DD.json passes', () => {
  assert.equal(studioPathAllowed('brand/content-calendar/shared/wk-2026-11-23.json'), true)
  for (const rel of [
    'brand/content-calendar/shared/README.md',
    'brand/content-calendar/shared/nested/wk-2026-11-23.json',
    'brand/content-calendar/drafts/wk-2026-11-23.json',
    'brand/Content-Calendar/shared/wk-2026-11-23.json',
    'brand/content-calendar',
    'brand/.private/content/weeks/wk-2026-11-23.json',
    'brand/.private/content/drafts/wk-2026-11-23.json',
  ]) {
    assert.equal(studioPathAllowed(rel), false, rel)
  }
})

test('buildStudioCalendar keeps valid, same-brand, safe weeks and withholds the rest by reason', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cal-studio-'))
  const dir = path.join(root, 'brand/content-calendar/shared')
  assert.deepEqual(buildStudioCalendar(root, 'acme'), { weeks: [], withheld: [], total: 0 })
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'wk-2026-11-30.json'), week('acme', '2026-11-30', { EXTRA_FIELD_CANARY: 1 }))
  fs.writeFileSync(path.join(dir, 'wk-2026-11-23.json'), week('acme', '2026-11-23'))
  fs.writeFileSync(path.join(dir, 'wk-2026-12-07.json'), week('beta', '2026-12-07'))
  fs.writeFileSync(path.join(dir, 'wk-2026-12-14.json'), week('acme', '2026-12-21'))
  fs.writeFileSync(path.join(dir, 'wk-2026-12-28.json'), week('acme', '2026-12-28', { status: 'draft', slots: [{ id: 'bad' }] }))
  fs.writeFileSync(path.join(dir, 'wk-2027-01-04.json'), '{not json')
  fs.writeFileSync(path.join(dir, 'notes.md'), 'x')
  fs.symlinkSync(path.join(dir, 'wk-2026-11-23.json'), path.join(dir, 'wk-2027-01-11.json'))
  const c = buildStudioCalendar(root, 'acme')
  assert.deepEqual(c.weeks.map((w) => w.week_id), ['wk-2026-11-23', 'wk-2026-11-30'])
  assert.equal(c.total, 2)
  assert.equal(JSON.stringify(c).includes('EXTRA_FIELD_CANARY'), false, 'extra fields are dropped')
  assert.deepEqual(
    Object.fromEntries(c.withheld.map((w) => [path.basename(w.path), w.reason])),
    {
      'notes.md': 'unexpected_file',
      'wk-2026-12-07.json': 'wrong_brand',
      'wk-2026-12-14.json': 'filename_mismatch',
      'wk-2026-12-28.json': 'invalid_record',
      'wk-2027-01-04.json': 'unreadable',
      'wk-2027-01-11.json': 'symlink',
    },
  )
})

test('Studio: the Content calendar page shows merged shared weeks read-only, escaped, and nothing else', async () => {
  const { startStudio, Client } = await import('./helpers/studio-server.js')
  const { OWNER } = await import('./helpers/studio.js')
  const s = await startStudio()
  try {
    const owner = new Client(s.url)
    await owner.login()
    const csrf = await owner.csrf('/brands/new')
    await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Acme Learning', slug: 'acme-learning', profile: 'business', default_locale: 'en', locales: ['en', 'fa', 'tr'], owner: OWNER, repo: 'acme-learning' } })
    await s.studio.provisioning.settled()
    await s.studio.sync.settled()

    const empty = await owner.page('/brands/acme-learning/market/content-calendar')
    assert.equal(empty.res.status, 200)
    assert.match(empty.text, /No shared calendar weeks on this commit/)
    assert.equal((await owner.page('/brands/acme-learning')).text.includes('href="/brands/acme-learning/market/content-calendar"'), false, 'no nav entry before anything is shared')

    s.github.pushEdit(OWNER, 'acme-learning', (tree) => {
      tree.set('brand/content-calendar/shared/wk-2026-11-23.json', week('acme-learning', '2026-11-23'))
      tree.set('brand/content-calendar/shared/wk-2026-11-30.json', week('beta-brand', '2026-11-30', { languages: ['en'], slots: [], gaps: [] }))
      // Committed by mistake: none of these may reach Studio.
      tree.set('brand/.private/content/weeks/wk-2026-12-07.json', Buffer.from('{"PRIVATE-WEEK-CANARY":1}'))
      tree.set('brand/content-calendar/drafts/wk-2026-12-07.json', Buffer.from('{"DRAFT-CANARY":1}'))
      tree.set('brand/content-calendar/shared/notes.md', Buffer.from('NOTES-CANARY'))
    })
    await s.studio.sync.refresh('acme-learning')

    const page = await owner.page('/brands/acme-learning/market/content-calendar')
    assert.equal(page.res.status, 200)
    assert.match(page.text, /Content calendar/)
    assert.match(page.text, /Owner-approved/)
    assert.match(page.text, /It authorizes nothing/)
    assert.match(page.text, /Hook &lt;script&gt;alert\(1\)&lt;\/script&gt; from day one/)
    assert.equal(page.text.includes('<script>alert'), false, 'slot text is escaped')
    assert.match(page.text, /Learning stories/)
    assert.match(page.text, /brand\.strategy\.promise/)
    assert.match(page.text, /Cadence not decided/)
    assert.match(page.text, /Medium confidence/)
    assert.match(page.text, /Belongs to another brand/, 'another brand’s file is withheld with a reason')
    assert.match((await owner.page('/brands/acme-learning')).text, /href="\/brands\/acme-learning\/market\/content-calendar"/, 'nav entry once weeks exist')
    const everything = [page.text, fs.readFileSync(path.join(s.config.dataDir, 'cache', 'acme-learning', 'state.json'), 'utf8')].join('\n')
    for (const canary of ['PRIVATE-WEEK-CANARY', 'DRAFT-CANARY', 'NOTES-CANARY']) assert.equal(everything.includes(canary), false, canary)
    assert.equal(/<form[^>]*method="post"/i.test(page.text.split('<main')[1] ?? ''), false, 'no write form in the page body')
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await owner.request(method, '/brands/acme-learning/market/content-calendar', { form: { _csrf: 'x' } })
      assert.ok([404, 405].includes(res.status), `${method} ${res.status}`)
    }
    const guest = new Client(s.url)
    const res = await guest.get('/brands/acme-learning/market/content-calendar')
    assert.equal(res.status, 302)
    assert.equal((await res.text()).includes('Hook'), false)
    await owner.get('/brands/acme-learning/market/content-calendar?lang=fa')
    const fa = await owner.page('/brands/acme-learning/market/content-calendar')
    assert.match(fa.text, /dir="rtl"/)
    assert.match(fa.text, /تقویم محتوا/)
    await owner.get('/brands/acme-learning/market/content-calendar?lang=tr')
    assert.match((await owner.page('/brands/acme-learning/market/content-calendar')).text, /İçerik takvimi/)
  } finally {
    await s.close()
  }
})

test('sync: a cache written before the calendar projection existed is rebuilt at the same commit', async () => {
  const { harness, provisioned } = await import('./helpers/studio.js')
  const h = harness()
  const req = await provisioned(h)
  const file = path.join(h.dataDir, 'cache', req.slug, 'state.json')
  const state = JSON.parse(fs.readFileSync(file, 'utf8')) as { projection: Record<string, unknown> }
  assert.ok(state.projection.calendar)
  delete state.projection.calendar
  fs.writeFileSync(file, JSON.stringify(state))
  assert.equal(h.sync.get(req.slug).projection!.calendar, undefined)
  const after = await h.sync.refresh(req.slug)
  assert.deepEqual(after.projection!.calendar, { weeks: [], withheld: [], total: 0 })
})
