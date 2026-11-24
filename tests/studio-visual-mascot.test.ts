import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { parse, stringify } from 'yaml'
import { addApprovedAsset, editOutsideStudio } from './helpers/edits.js'
import { Client, startStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

/**
 * Visual Blueprint V3.4 in Studio: the mascot atlas and six-stage evolution sheet are GET-only, draw approved artwork
 * only (through the existing asset route), show designed empty frames otherwise, keep a draft-tagged file out of the
 * public edition, keep ids out of the main view, escape every value and work in en/fa/tr.
 */
const SLUG = 'acme-mascot'
const ART = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><circle cx="200" cy="200" r="160" fill="#123A73"/></svg>')
const WAVE = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect x="80" y="80" width="240" height="240" fill="#0B6E4F"/></svg>')

function mainView(text: string): string {
  const body = text.split('<main')[1] ?? ''
  return body.split('<details class="vz-details"')[0] ?? body
}

function sha(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

test('Studio: the mascot atlas is read-only, approved-only, designed when empty, public-safe and localized', async () => {
  const s = await startStudio()
  try {
    const owner = new Client(s.url)
    await owner.login()
    const csrf = await owner.csrf('/brands/new')
    await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Acme Mascot', slug: SLUG, profile: 'business', default_locale: 'en', locales: ['en', 'fa', 'tr'], mascot: 'on', owner: OWNER, repo: SLUG } })
    await s.studio.provisioning.settled()
    await s.studio.sync.settled()

    // 1. One link from the Assets page; the template catalog has no artwork, so the atlas is the designed empty state.
    const assets = await owner.page(`/brands/${SLUG}/brand/assets`)
    assert.equal((assets.text.match(new RegExp(`href="/brands/${SLUG}/brand/mascot"`, 'g')) ?? []).length, 1, 'exactly one link')
    let page = await owner.page(`/brands/${SLUG}/brand/mascot`)
    assert.equal(page.res.status, 200)
    assert.match(page.text, /Mascot atlas/)
    assert.match(page.text, /Six-stage evolution sheet/)
    assert.match(page.text, /No approved mascot artwork yet/)
    assert.equal((page.text.match(/class="vz-stage[ "]/g) ?? []).length, 6, 'six stage frames')
    assert.match(page.text, /Example configuration/)
    assert.equal(page.text.includes('vz-mframe-img'), false, 'nothing drawn')
    assert.doesNotMatch(mainView(page.text), /mascot\.(emotion|action|angle)\.|example\.stage\.|asset\.mascot/, 'no ids in the main view')

    // 2. Approved artwork for one state (stage one), artwork in review for another, a draft-tagged approved file.
    editOutsideStudio(s, SLUG, (_engine, root) => {
      addApprovedAsset(root, { id: 'asset.mascot.joyful', name: 'Joyful <b>front</b>', file: 'brand/assets/mascot/joyful.svg', data: ART })
      addApprovedAsset(root, { id: 'asset.mascot.waving', name: 'Waving front', file: 'brand/assets/mascot/waving.svg', data: WAVE })
      addApprovedAsset(root, { id: 'asset.mascot.curious', name: 'Curious sketch', file: 'brand/assets/mascot/curious.svg', data: WAVE, status: 'draft' })
      const manifestFile = path.join(root, 'brand/assets/asset-manifest.yaml')
      const manifest = parse(fs.readFileSync(manifestFile, 'utf8')) as { assets: Array<Record<string, unknown>> }
      for (const asset of manifest.assets.filter((item) => String(item.id).startsWith('asset.mascot.') && item.id !== 'asset.mascot.placeholder-frame')) {
        asset.mime = 'image/svg+xml'
        asset.tags = asset.id === 'asset.mascot.waving' ? ['mascot', 'draft'] : ['mascot']
      }
      fs.writeFileSync(manifestFile, stringify(manifest))
      const catalogFile = path.join(root, 'brand/mascot/catalog.yaml')
      const catalog = parse(fs.readFileSync(catalogFile, 'utf8')) as { states: Array<Record<string, unknown>> }
      const row = (id: string) => catalog.states.find((state) => state.id === id)!
      Object.assign(row('mascot.emotion.joyful'), { status: 'approved', usage: 'Use after a <script>real</script> success.', artwork: [{ id: 'art.joyful.front', stage: 'example.stage.egg', asset_id: 'asset.mascot.joyful', status: 'approved', version: '1.0.0', angle: 'mascot.angle.front' }] })
      Object.assign(row('mascot.action.waving'), { status: 'approved', artwork: [{ id: 'art.waving.front', stage: 'any', asset_id: 'asset.mascot.waving', status: 'approved', version: '1.0.0' }] })
      Object.assign(row('mascot.emotion.curious'), { status: 'reviewed', artwork: [{ id: 'art.curious.sketch', stage: 'any', asset_id: 'asset.mascot.curious', status: 'reviewed', version: '0.1.0' }] })
      fs.writeFileSync(catalogFile, stringify(catalog))
    })
    await s.studio.sync.refresh(SLUG)
    page = await owner.page(`/brands/${SLUG}/brand/mascot`)
    assert.equal(page.res.status, 200)
    assert.ok(page.text.includes(`<img class="vz-mframe-img" src="/brands/${SLUG}/assets/file/${sha(ART)}"`), 'approved art through the existing asset route')
    assert.ok(page.text.includes(sha(WAVE)), 'an approved file still tagged draft is drawn internally')
    assert.match(page.text, /data-badge="draft_tag">File still tagged draft</)
    assert.match(page.text, /2 of \d+ states drawn from approved artwork/)
    assert.match(page.text, /Not yet drawn/)
    assert.match(page.text, /Curious<\/span><span class="vz-chip vz-chip--draft" data-gap="in_review"/, 'art in review is named, never drawn')
    assert.match(page.text, /Don’t use/)
    assert.match(page.text, /Joyful &lt;b&gt;front&lt;\/b&gt;/, 'asset names are escaped')
    assert.match(page.text, /&lt;script&gt;real&lt;\/script&gt;/, 'usage notes are escaped')
    assert.equal(page.text.includes('<b>front</b>'), false)
    assert.match(page.text, /class="vz-stage is-drawn"/, 'stage one is drawn from its approved artwork')
    assert.equal((page.text.match(/class="vz-stage is-drawn"/g) ?? []).length, 1)
    const main = mainView(page.text)
    assert.doesNotMatch(main, /mascot\.(emotion|action|angle)\.|art\.joyful|asset\.mascot|example\.stage\./, 'no ids in the main view')
    assert.match(page.text, /<details class="vz-details"[\s\S]*mascot\.emotion\.joyful[\s\S]*asset\.mascot\.joyful/, 'ids live in the details')
    assert.match(page.text, /Original Brand OS template/)
    assert.doesNotMatch(page.text, /certified|compliant/i)
    assert.equal(/\sstyle="/.test(page.text), false, 'no inline style')
    assert.equal(/\son[a-z]+="/.test(page.text), false, 'no inline handler')
    assert.equal(/<form[^>]*method="post"/i.test(page.text.split('<main')[1] ?? ''), false, 'no write form')

    // 3. Print view (A4 book pages) and the public edition: nothing is published, so nothing is drawn or named.
    const print = await owner.page(`/brands/${SLUG}/brand/mascot/print`)
    assert.equal(print.res.status, 200)
    assert.match(print.text, /vz-book-body/)
    assert.equal((print.text.match(/class="vz-page vz-page--book/g) ?? []).length, 4, 'opener, atlas, evolution, appendix')
    assert.ok(print.text.includes(sha(ART)))
    assert.equal(/\sstyle="/.test(print.text), false)
    assert.equal(/<script(?![^>]*src="\/static\/visual\.js\?v=[A-Za-z0-9_-]+")/.test(print.text), false)
    const pub = await owner.page(`/brands/${SLUG}/brand/mascot/print?edition=public`)
    assert.equal(pub.res.status, 200)
    assert.match(pub.text, /Public edition/)
    assert.equal(pub.text.includes(sha(ART)), false, 'approved but unpublished art stays out of the public edition')
    assert.equal(pub.text.includes(sha(WAVE)), false, 'a draft-tagged file stays out of the public edition')
    assert.equal(pub.text.includes('File still tagged draft'), false)
    assert.equal(pub.text.includes('in review'), false, 'public never says something is in review')
    assert.equal(pub.text.includes('Egg / emergence'), false, 'example stage names are not published')

    // 4. Read-only: no other method, no other path; guests are sent to sign in.
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const pathname of [`/brands/${SLUG}/brand/mascot`, `/brands/${SLUG}/brand/mascot/print`]) {
        const res = await owner.request(method, pathname, { form: { _csrf: 'x' } })
        assert.ok([404, 405].includes(res.status), `${method} ${pathname} ${res.status}`)
      }
    }
    assert.equal((await owner.get(`/brands/${SLUG}/brand/mascot/edit`)).status, 404)
    assert.equal((await new Client(s.url).get(`/brands/${SLUG}/brand/mascot`)).status, 302)

    // 5. Persian (RTL, Vazirmatn through visual.css) and Turkish.
    await owner.get(`/brands/${SLUG}/brand/mascot?lang=fa`)
    const fa = await owner.page(`/brands/${SLUG}/brand/mascot`)
    assert.match(fa.text, /<html lang="fa" dir="rtl">/)
    assert.match(fa.text, /اطلس ماسکات/)
    // One Persian spelling everywhere (owner decision 2026-11-24): Studio's nav and labels match the book and atlas.
    assert.match(fa.text, /دارایی‌ها و ماسکات/)
    assert.equal(fa.text.includes('مسکات'), false, 'no "مسکات" left in Studio')
    assert.match(fa.text, /برگهٔ تکامل شش‌مرحله‌ای/)
    assert.ok(fa.text.includes(sha(ART)))
    await owner.get(`/brands/${SLUG}/brand/mascot?lang=tr`)
    const tr = await owner.page(`/brands/${SLUG}/brand/mascot`)
    assert.match(tr.text, /Maskot atlası/)
    assert.match(tr.text, /Altı aşamalı gelişim sayfası/)
  } finally {
    await s.close()
  }
})

test('sync: a cache written before the mascot atlas existed is rebuilt at the same commit', async () => {
  const { harness, provisioned } = await import('./helpers/studio.js')
  const h = harness()
  const req = await provisioned(h)
  const file = path.join(h.dataDir, 'cache', req.slug, 'state.json')
  const state = JSON.parse(fs.readFileSync(file, 'utf8')) as { projection: { visual: Record<string, unknown> } }
  assert.ok(state.projection.visual.mascot)
  delete state.projection.visual.mascot
  fs.writeFileSync(file, JSON.stringify(state))
  const after = await h.sync.refresh(req.slug)
  assert.equal(after.projection!.visual?.mascot?.internal.document_kind, 'mascot_atlas')
  assert.equal(after.projection!.visual?.mascot?.public.audience, 'public')
})
