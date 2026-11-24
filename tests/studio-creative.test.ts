import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { addVariant, createProject, recordFeedback } from '@brand-os/brand-core/creative'
import { studioPathAllowed } from '../apps/studio/src/github/tar.js'
import { pilitoBrand } from './helpers/creative.js'
import { useTestKey } from './helpers/knowledge.js'

/**
 * Creative learning records and their feedback notes are local only: Studio's archive filter never
 * lets them through. Split from tests/creative-security.test.ts because it needs apps/studio.
 */
useTestKey()

test('local only: Studio excludes creative records and feedback notes', () => {
  const { ws, root } = pilitoBrand('pilito')
  createProject(ws, { project_id: 'pilito-reel-1', title: 'Intro reels', surface: 'reel', series: 'onboarding', language: 'fa' })
  addVariant(ws, { project_id: 'pilito-reel-1', variant_id: 'C', asset: 'missing' })
  const c = recordFeedback(ws, { project_id: 'pilito-reel-1', variant_id: 'C', text: 'CREATIVE-FEEDBACK-CANARY', verdict: 'like', keep: ['camera_angle'] })
  for (const rel of ['brand/.private/creative/projects/pilito-reel-1.json', c.note.path]) {
    assert.ok(fs.existsSync(path.join(root, rel)), rel)
    assert.equal(studioPathAllowed(rel), false, `Studio excludes ${rel}`)
  }
})

// ---- Sprint 2 item 3: the read-only "Creative decisions" page ---------------------------------------------

function decision(slug: string, id: string, extra: Record<string, unknown> = {}): Buffer {
  return Buffer.from(
    JSON.stringify({
      schema_version: 1,
      kind: 'creative_decision',
      decision_id: id,
      brand_slug: slug,
      project_id: 'pilito-reel-1',
      statement: 'Dynamic <script>alert(1)</script> camera on onboarding reels',
      context: 'From the owner’s review of variants A–E.',
      scope: { level: 'series', label: 'series onboarding (reel)' },
      state: 'approved',
      approved_at: '2026-11-20T10:00:00.000Z',
      supersedes: null,
      superseded_by: null,
      superseded_at: null,
      sources: [`knowledge:kn_13d9016f-9920-4218-b663-b192a620bed3@${'a'.repeat(64)}`],
      counterexamples: [{ project_id: 'pilito-reel-1', variant_id: 'A' }],
      shared_at: '2026-11-20T11:00:00.000Z',
      ...extra,
    }),
  )
}

test('Studio path filter: only brand/creative/shared/cp_<uuid>.json passes; everything else under brand/creative stays out', () => {
  const id = 'cp_13d9016f-9920-4218-b663-b192a620bed3'
  assert.equal(studioPathAllowed(`brand/creative/shared/${id}.json`), true)
  for (const rel of [
    'brand/creative/projects/pilito-reel-1.json',
    'brand/creative/preferences/cp_x.json',
    'brand/creative/shared/README.md',
    `brand/creative/shared/nested/${id}.json`,
    `brand/Creative/shared/${id}.json`,
    'brand/creative',
    `brand/.private/creative/preferences/${id}.json`,
    'brand/.private/creative/aspect-proposals/ap_x.json',
  ]) {
    assert.equal(studioPathAllowed(rel), false, rel)
  }
})

test('Studio: the Creative decisions page shows merged shared decisions read-only, escaped, and nothing else', async () => {
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

    const empty = await owner.page('/brands/acme-learning/brand/creative-decisions')
    assert.equal(empty.res.status, 200)
    assert.match(empty.text, /No shared creative decisions on this commit/)
    assert.equal((await owner.page('/brands/acme-learning')).text.includes('href="/brands/acme-learning/brand/creative-decisions"'), false, 'no nav entry before anything is shared')

    const current = 'cp_00000000-0000-4000-8000-000000000001'
    const old = 'cp_00000000-0000-4000-8000-000000000002'
    s.github.pushEdit(OWNER, 'acme-learning', (tree) => {
      tree.set(`brand/creative/shared/${current}.json`, decision('acme-learning', current, { supersedes: old }))
      tree.set(`brand/creative/shared/${old}.json`, decision('acme-learning', old, { statement: 'Static camera', state: 'superseded', superseded_by: current, superseded_at: '2026-11-20T10:00:00.000Z' }))
      tree.set('brand/creative/shared/cp_00000000-0000-4000-8000-000000000003.json', decision('beta-brand', 'cp_00000000-0000-4000-8000-000000000003', { statement: 'OTHER-BRAND-CANARY' }))
      // Committed by mistake: none of these may reach Studio.
      tree.set('brand/.private/creative/projects/pilito-reel-1.json', Buffer.from('{"PRIVATE-PROJECT-CANARY":1}'))
      tree.set('brand/creative/projects/leak.json', Buffer.from('{"PROJECT-CANARY":1}'))
      tree.set('brand/creative/shared/notes.md', Buffer.from('NOTES-CANARY'))
    })
    await s.studio.sync.refresh('acme-learning')

    const page = await owner.page('/brands/acme-learning/brand/creative-decisions')
    assert.equal(page.res.status, 200)
    assert.match(page.text, /Creative decisions/)
    assert.match(page.text, /Owner-approved/)
    assert.match(page.text, /not a measured performance result/)
    assert.match(page.text, /Dynamic &lt;script&gt;alert\(1\)&lt;\/script&gt; camera/)
    assert.equal(page.text.includes('<script>alert'), false, 'decision text is escaped')
    assert.match(page.text, /Superseded \(kept for history\)/)
    assert.match(page.text, /Static camera/)
    assert.match(page.text, new RegExp(`href="#${old}"`), 'supersession is linked within the page')
    assert.match(page.text, /Belongs to another brand/, 'another brand’s file is withheld with a reason')
    assert.match((await owner.page('/brands/acme-learning')).text, /href="\/brands\/acme-learning\/brand\/creative-decisions"/, 'nav entry once decisions exist')
    const everything = [page.text, fs.readFileSync(path.join(s.config.dataDir, 'cache', 'acme-learning', 'state.json'), 'utf8')].join('\n')
    for (const canary of ['OTHER-BRAND-CANARY', 'PRIVATE-PROJECT-CANARY', 'PROJECT-CANARY', 'NOTES-CANARY']) assert.equal(everything.includes(canary), false, canary)
    assert.equal(/<form[^>]*method="post"/i.test(page.text.split('<main')[1] ?? ''), false, 'no write form in the page body')
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await owner.request(method, '/brands/acme-learning/brand/creative-decisions', { form: { _csrf: 'x' } })
      assert.ok([404, 405].includes(res.status), `${method} ${res.status}`)
    }
    const guest = new Client(s.url)
    const res = await guest.get('/brands/acme-learning/brand/creative-decisions')
    assert.equal(res.status, 302)
    assert.equal((await res.text()).includes('Dynamic'), false)
    await owner.get('/brands/acme-learning/brand/creative-decisions?lang=fa')
    const fa = await owner.page('/brands/acme-learning/brand/creative-decisions')
    assert.match(fa.text, /dir="rtl"/)
    assert.match(fa.text, /تصمیم‌های خلاقانه/)
    await owner.get('/brands/acme-learning/brand/creative-decisions?lang=tr')
    assert.match((await owner.page('/brands/acme-learning/brand/creative-decisions')).text, /Yaratıcı kararlar/)
  } finally {
    await s.close()
  }
})

test('sync: a cache written before the creative projection existed is rebuilt at the same commit', async () => {
  const { harness, provisioned } = await import('./helpers/studio.js')
  const h = harness()
  const req = await provisioned(h)
  const file = path.join(h.dataDir, 'cache', req.slug, 'state.json')
  const state = JSON.parse(fs.readFileSync(file, 'utf8')) as { projection: Record<string, unknown> }
  assert.ok(state.projection.creative)
  delete state.projection.creative
  fs.writeFileSync(file, JSON.stringify(state))
  assert.equal(h.sync.get(req.slug).projection!.creative, undefined)
  const after = await h.sync.refresh(req.slug)
  assert.deepEqual(after.projection!.creative, { items: [], withheld: [], total: 0 })
})
