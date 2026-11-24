import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { SHARED_LANDSCAPE_PATH, type SharedLandscape } from '@brand-os/brand-core/competitive'
import { illustrativeLandscape } from '@brand-os/brand-core/visual'
import { studioPathAllowed } from '../apps/studio/src/github/tar.js'
import { editOutsideStudio } from './helpers/edits.js'
import { Client, startStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

/**
 * Visual V2.2 in Studio: the "Competitor comparison matrix" page and its print view are GET-only, drawn only from the
 * shared landscape file on the merged commit, keep ids out of the main view, escape every value, never show anything
 * else committed under brand/competitive, and work in en/fa/tr.
 */
const SLUG = 'acme-compare'
const DECOY = 'DECOY-COMPETITIVE-CANARY-5521'

function mainView(text: string): string {
  const body = text.split('<main')[1] ?? ''
  return body.split('<details class="vz-details"')[0] ?? body
}

/**
 * The golden fixture uses reserved `.example` hosts, which the strict reader refuses as not public. For the Studio
 * journey they become fictional public-looking names (`avenra-fictional.app`); still invented, never fetched.
 */
function shared(): SharedLandscape {
  const json = JSON.stringify({ ...illustrativeLandscape(), brand_slug: SLUG }).replace(/([a-z-]+)\.example/g, '$1-fictional.app')
  const doc = JSON.parse(json) as SharedLandscape
  doc.competitors = doc.competitors.map((c, i) => (i === 0 ? { ...c, display_name: 'Avenra <b>bold</b>' } : c))
  return doc
}

test('Studio: the competitor comparison matrix is read-only, shared-file-only, designed when empty, and localized', async () => {
  const s = await startStudio()
  try {
    const owner = new Client(s.url)
    await owner.login()
    const csrf = await owner.csrf('/brands/new')
    await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Acme Compare', slug: SLUG, profile: 'business', default_locale: 'en', locales: ['en', 'fa', 'tr'], owner: OWNER, repo: SLUG } })
    await s.studio.provisioning.settled()
    await s.studio.sync.settled()

    // 1. Nothing shared: one link from the Business model page (besides the sidebar entry), a designed empty matrix with the owner's steps.
    const canvas = await owner.page(`/brands/${SLUG}/strategy/business-model`)
    assert.equal((canvas.text.split('<main')[1]!.match(new RegExp(`href="/brands/${SLUG}/market/competitors"`, 'g')) ?? []).length, 1)
    let page = await owner.page(`/brands/${SLUG}/market/competitors`)
    assert.equal(page.res.status, 200)
    assert.match(page.text, /Competitor comparison matrix/)
    assert.match(page.text, /No competitor landscape shared yet/)
    assert.match(page.text, /class="vz-cmp-ghost"/)
    assert.match(page.text, /npm run brand:competitive -- share/)
    assert.equal(page.text.includes('vz-cmp-table'), false)

    // 2. The owner commits the shared file, plus files that must never reach Studio.
    editOutsideStudio(s, SLUG, (_engine, root) => {
      const write = (rel: string, data: string) => {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
        fs.writeFileSync(path.join(root, rel), data)
      }
      write(SHARED_LANDSCAPE_PATH, JSON.stringify(shared(), null, 2))
      write('brand/competitive/shared/notes.json', JSON.stringify({ quote: DECOY }))
      write('brand/competitive/candidates/cmp_00000000-0000-4000-8000-0000000000ff.json', JSON.stringify({ status_reason: DECOY }))
    })
    await s.studio.sync.refresh(SLUG)
    page = await owner.page(`/brands/${SLUG}/market/competitors`)
    assert.equal(page.res.status, 200)
    assert.equal(page.text.includes(DECOY), false, 'nothing else under brand/competitive reaches Studio')
    assert.match(page.text, /class="vz-cmp-table"/)
    assert.match(page.text, /Avenra &lt;b&gt;bold&lt;\/b&gt;/, 'names are escaped')
    assert.equal(page.text.includes('<b>bold</b>'), false)
    assert.match(page.text, /Kestrel Learn \(fictional\)/)
    assert.match(page.text, /Your brand/)
    assert.match(page.text, /Sources disagree/)
    assert.match(page.text, /Source needs review/)
    assert.match(page.text, /Published prices/)
    assert.match(page.text, /Monthly rate, billed annually/)
    assert.match(page.text, /No currency conversion/)
    assert.match(page.text, /No public price shared/)
    assert.match(page.text, /Competitor’s own page/)
    assert.match(page.text, /avenra-fictional\.app/)
    // Prices keep the shared order: AED, then TRY, then USD; within USD 9.99 before 7 (never sorted by amount).
    const order = ['>AED<', '>TRY<', '>USD<'].map((code) => page.text.indexOf(code))
    assert.ok(order.every((at) => at > 0) && order[0]! < order[1]! && order[1]! < order[2]!, order.join(','))
    assert.ok(page.text.indexOf('>9.99<') < page.text.indexOf('>7<'))
    const main = mainView(page.text)
    assert.doesNotMatch(main, /cmp_[0-9a-f-]{36}/, 'no competitor id in the main view')
    assert.doesNotMatch(main, /business\.[a-z_]+\.[a-z_]+|brand\.color\.roles/, 'no question id in the main view')
    assert.match(page.text, /<details class="vz-details"[\s\S]*cmp_00000000-0000-4000-8000-00000000000a/, 'ids live in the details')
    assert.match(page.text, /Not shown: 2 unreviewed candidate\(s\), 0 disputed, 1 archived\./)
    assert.doesNotMatch(page.text, /certified|compliant/i)
    assert.equal(/\sstyle="/.test(page.text), false, 'no inline style')
    assert.equal(/\son[a-z]+="/.test(page.text), false, 'no inline handler')
    assert.equal(/<form[^>]*method="post"/i.test(page.text.split('<main')[1] ?? ''), false, 'no write form')

    // 3. Print view on the existing print path: opener, landscape matrix, prices, sources. Internal only.
    const print = await owner.page(`/brands/${SLUG}/market/competitors/print`)
    assert.equal(print.res.status, 200)
    assert.match(print.text, /vz-book-body/)
    assert.equal((print.text.match(/class="vz-page vz-page--book/g) ?? []).length, 4)
    assert.match(print.text, /vz-page--cmp-wide/)
    assert.match(print.text, /Internal edition only/)
    assert.equal(/\sstyle="/.test(print.text), false)
    assert.equal((await owner.page(`/brands/${SLUG}/market/competitors/print?edition=public`)).text.includes('Public edition'), false, 'no public edition')

    // 4. Read-only: no other method, no other path; guests are sent to sign in.
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const pathname of [`/brands/${SLUG}/market/competitors`, `/brands/${SLUG}/market/competitors/print`]) {
        const res = await owner.request(method, pathname, { form: { _csrf: 'x' } })
        assert.ok([404, 405].includes(res.status), `${method} ${pathname} ${res.status}`)
      }
    }
    assert.equal((await owner.get(`/brands/${SLUG}/visual/competitors/share`)).status, 404)
    assert.equal((await new Client(s.url).get(`/brands/${SLUG}/market/competitors`)).status, 302)
    assert.equal((await owner.page(`/brands/${SLUG}/brand/book/visual-identity`)).res.status, 200, 'the identity chapter is untouched')

    // 5. Persian (RTL, Vazirmatn) and Turkish.
    await owner.get(`/brands/${SLUG}/market/competitors?lang=fa`)
    const fa = await owner.page(`/brands/${SLUG}/market/competitors`)
    assert.match(fa.text, /<html lang="fa" dir="rtl">/)
    assert.match(fa.text, /ماتریس مقایسهٔ رقبا/)
    assert.match(fa.text, /قیمت‌های منتشرشده/)
    await owner.get(`/brands/${SLUG}/market/competitors?lang=tr`)
    assert.match((await owner.page(`/brands/${SLUG}/market/competitors`)).text, /Rakip karşılaştırma matrisi/)
    await owner.get(`/brands/${SLUG}/market/competitors?lang=en`)

    // 6. A tampered file (an extra field) is withheld as a whole, with the reason.
    editOutsideStudio(s, SLUG, (_engine, root) => {
      fs.writeFileSync(path.join(root, SHARED_LANDSCAPE_PATH), JSON.stringify({ ...shared(), quote: DECOY }))
    })
    await s.studio.sync.refresh(SLUG)
    page = await owner.page(`/brands/${SLUG}/market/competitors`)
    assert.match(page.text, /The shared landscape was not shown/)
    assert.match(page.text, /not in the expected shape/)
    assert.equal(page.text.includes(DECOY), false)
    assert.equal(page.text.includes('Kestrel'), false)
  } finally {
    await s.close()
  }
})

test('sync: a cache written before the comparison existed is rebuilt at the same commit', async () => {
  const { harness, provisioned } = await import('./helpers/studio.js')
  const h = harness()
  const req = await provisioned(h)
  const file = path.join(h.dataDir, 'cache', req.slug, 'state.json')
  const state = JSON.parse(fs.readFileSync(file, 'utf8')) as { projection: { visual: Record<string, unknown> } }
  assert.ok(state.projection.visual.competitors)
  delete state.projection.visual.competitors
  fs.writeFileSync(file, JSON.stringify(state))
  assert.equal(h.sync.get(req.slug).projection!.visual?.competitors, undefined)
  const after = await h.sync.refresh(req.slug)
  assert.equal(after.projection!.visual?.competitors?.document_kind, 'competitor_comparison')
})

test('tar allowlist: Studio admits exactly the one shared landscape file under brand/competitive', () => {
  assert.equal(studioPathAllowed('brand/competitive/shared/landscape.json'), true)
  for (const rel of ['brand/competitive/shared/other.json', 'brand/competitive/shared/landscape.json.bak', 'brand/competitive/candidates/cmp_x.json', 'brand/competitive/scope.json', 'brand/Competitive/shared/landscape.json', 'brand/competitive/shared/sub/landscape.json', 'brand/.private/competitive/candidates/cmp_1.json']) {
    assert.equal(studioPathAllowed(rel), false, rel)
  }
})
