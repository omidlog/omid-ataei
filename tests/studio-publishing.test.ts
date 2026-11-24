import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { parse, stringify } from 'yaml'
import { addApprovedAsset, approve, editOutsideStudio } from './helpers/edits.js'
import { Client, startStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

/**
 * Visual V4.1: the Command Center strip (R4) and the Publishing gallery. Both are GET-only views of the sync-time
 * projection. The gallery lists document types × export profiles with readiness measured after redaction; restricted
 * and finance values, drafts and draft marks never reach the public edition. SYNTHETIC DATA ONLY.
 */
const SLUG = 'demo-publishing'
const RESTRICTED = 'SENTINEL-RESTRICTED-COSTS'
const FINANCE = 'SENTINEL-FINANCE-CURRENCY'
const DRAFT = 'SENTINEL-DRAFT-VISION'

function main(text: string): string {
  return text.split('<main')[1] ?? ''
}

test('Studio: Command Center strip, Publishing gallery, and public editions without restricted, finance or draft data', async () => {
  const s = await startStudio()
  try {
    const owner = new Client(s.url)
    await owner.login()
    const csrf = await owner.csrf('/brands/new')
    await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Demo Publishing', slug: SLUG, profile: 'business', default_locale: 'en', locales: ['en', 'fa', 'tr'], owner: OWNER, repo: SLUG } })
    await s.studio.provisioning.settled()
    await s.studio.sync.settled()
    const wordmark = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 160"><rect width="640" height="160" fill="#0B6E4F"/></svg>')
    const checksum = crypto.createHash('sha256').update(wordmark).digest('hex')
    editOutsideStudio(s, SLUG, (engine, root) => {
      approve(engine, root, {
        'business.offer.value_proposition': 'Calm lessons for busy parents',
        'business.finance.currency': FINANCE,
        'business.finance.costs': RESTRICTED,
        'brand.color.roles': 'primary: #0B6E4F\nbackground: #FFFFFF\ntext: #111111',
        'brand.logo.min_size': 'min-size: 80px; clear-space: 0.4x',
        'brand.logo.masters': 'This repository: brand/assets/logo/demo-wordmark.svg (asset.logo.demo-wordmark).',
      })
      engine.answerQuestion('brand.strategy.vision', DRAFT)
      addApprovedAsset(root, { id: 'asset.logo.demo-wordmark', name: 'Demo wordmark', file: 'brand/assets/logo/demo-wordmark.svg', data: wordmark })
      const file = path.join(root, 'brand/assets/asset-manifest.yaml')
      const manifest = parse(fs.readFileSync(file, 'utf8')) as { assets: Array<Record<string, unknown>> }
      const asset = manifest.assets.find((item) => item.id === 'asset.logo.demo-wordmark')!
      asset.mime = 'image/svg+xml'
      asset.preview = asset.path
      asset.tags = ['logo', 'wordmark', 'draft']
      fs.writeFileSync(file, stringify(manifest))
    })
    await s.studio.sync.refresh(SLUG)

    // Command Center: the 30-second strip leads, with the mini-map per framework; the update panel moved lower.
    const home = await owner.page(`/brands/${SLUG}`)
    assert.equal(home.res.status, 200)
    const cc = main(home.text)
    assert.match(cc, /<h2 class="card-title" id="cc-title">At a glance<\/h2>/)
    for (const tile of ['decisions', 'review-due', 'contradictions', 'exports']) assert.match(cc, new RegExp(`data-tile="${tile}"`), tile)
    assert.match(cc, /<a class="cc-tile cc-tile--warning" data-tile="decisions" href="\/brands\/demo-publishing\/governance\/history#review-title">/)
    assert.match(cc, /<a class="cc-map-name" href="\/brands\/demo-publishing\/strategy\/business-model">Business Model Canvas<\/a>/)
    assert.match(cc, /<a class="cc-map-name" href="\/brands\/demo-publishing\/brand\/book">Brand Book<\/a>/)
    assert.match(cc, /of 9 complete/)
    assert.ok(cc.indexOf('id="cc-title"') < cc.indexOf('class="stat-grid"'), 'the strip comes before the older panels')
    assert.match(home.text, /<title>Command Center · Demo Publishing/)
    assert.ok(home.text.split('<main')[0]!.includes('<span>Command Center</span>'))

    // The gallery: seven document types × three audiences, counts only.
    const page = await owner.page(`/brands/${SLUG}/governance/documents`)
    assert.equal(page.res.status, 200)
    const g = main(page.text)
    assert.equal([...g.matchAll(/<tr data-document-type="/g)].length, 7)
    assert.equal([...g.matchAll(/<td class="pub-cell/g)].length, 21)
    assert.match(g, /<th scope="col">Public<\/th><th scope="col">Investor<\/th><th scope="col">Internal<\/th>/)
    const row = (type: string) => g.split(`<tr data-document-type="${type}">`)[1]!.split('</tr>')[0]!
    assert.equal([...row('competitor_comparison').matchAll(/data-readiness="blocked"/g)].length, 2, 'competitor analysis is internal only')
    assert.equal([...row('business_plan').matchAll(/data-readiness="blocked"/g)].length, 1, 'the business plan is never public')
    assert.match(row('competitor_comparison'), /Nothing to show yet/)
    assert.ok(row('business_model_canvas').includes(`href="/brands/${SLUG}/strategy/business-model/print?edition=public"`))
    assert.ok(row('visual_identity').includes(`href="/brands/${SLUG}/brand/book/visual-identity/print?edition=public"`))
    assert.match(row('business_plan'), /hidden for this audience/, 'the investor plan counts the finance values it hides')
    // The full Brand Book shows its real local export command (V4.2) as text, in public and internal; investor has none.
    const bookCells = row('brand_book').split('<td ').slice(1)
    for (const index of [0, 2]) assert.equal(bookCells[index]!.includes('Print layout not built yet'), false, 'the Brand Book is no longer "not built"')
    assert.match(bookCells[0]!, /<code class="mono pub-command" dir="ltr">npm run brand:export-visual -- --doc brand-book --edition public<\/code>/)
    assert.match(bookCells[0]!, /Export with this command \(run locally\)/)
    assert.match(bookCells[2]!, /<code class="mono pub-command" dir="ltr">npm run brand:export-visual -- --doc brand-book --edition internal<\/code>/)
    assert.equal(bookCells[1]!.includes('brand:export-visual'), false, 'no investor edition of the Brand Book')
    assert.equal(row('business_plan').includes('brand:export-visual'), false, 'the Business Report is not offered here')
    // No investor edition is printed yet: an investor cell never links to a print view (the internal one shows drafts).
    for (const type of ['brand_book', 'visual_identity', 'business_model_canvas', 'mascot_atlas', 'business_plan', 'marketing_plan']) {
      const investor = row(type).split('<td ')[2]!
      assert.equal(investor.includes('/print'), false, `${type}: investor cell links to no print view`)
    }
    for (const secret of [RESTRICTED, FINANCE, DRAFT, 'Calm lessons']) assert.equal(page.text.includes(secret), false, `gallery carries no value: ${secret}`)
    assert.equal(g.includes('<form'), false)

    // Public editions: no restricted, finance or draft value, and no draft mark; the owner still sees the tag.
    for (const print of ['/strategy/business-model/print?edition=public', '/brand/book/visual-identity/print?edition=public', '/brand/mascot/print?edition=public']) {
      const res = await owner.page(`/brands/${SLUG}${print}`)
      assert.equal(res.res.status, 200, print)
      for (const secret of [RESTRICTED, FINANCE, DRAFT]) assert.equal(res.text.includes(secret), false, `${print}: ${secret}`)
      assert.equal(res.text.includes('data-badge="draft_tag"'), false, `${print}: no draft mark in public`)
    }
    const ownerIdentity = await owner.page(`/brands/${SLUG}/brand/book/visual-identity`)
    assert.match(ownerIdentity.text, /data-badge="draft_tag"/, 'the owner still sees the draft tag')
    assert.ok(ownerIdentity.text.includes(`/brands/${SLUG}/assets/file/${checksum}`))

    // GET only; guests sign in first; forged slugs are 404.
    for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await owner.request(method, `/brands/${SLUG}/governance/documents`, { form: { _csrf: 'x' } })).status, 405, method)
    const guest = new Client(s.url)
    assert.equal((await guest.get(`/brands/${SLUG}/governance/documents`)).headers.get('location'), `/login?next=${encodeURIComponent(`/brands/${SLUG}/governance/documents`)}`)
    assert.equal((await owner.get('/brands/not-registered/governance/documents')).status, 404)

    // Persian: RTL, Persian digits, standard names.
    await owner.get(`/brands/${SLUG}/governance/documents?lang=fa`)
    const fa = await owner.page(`/brands/${SLUG}/governance/documents`)
    assert.match(fa.text, /<html lang="fa" dir="rtl">/)
    assert.match(fa.text, /گالری انتشار/)
    assert.match(fa.text, /بوم مدل کسب‌وکار/)
    assert.match(fa.text, /سرمایه‌گذار/)
    assert.match(fa.text, /[۰-۹]+ نمایش/)
    assert.match(fa.text, /خروجی با این دستور/)
    assert.match(fa.text, /<code class="mono pub-command" dir="ltr">npm run brand:export-visual -- --doc brand-book --edition public<\/code>/, 'the command stays LTR inside RTL')
    for (const english of ['Print view', 'Export with this command', 'Not for this audience', 'Nothing to show yet', 'Investor', 'Document types × audiences']) assert.equal(main(fa.text).includes(english), false, `fa: no English left: ${english}`)
    const faHome = await owner.page(`/brands/${SLUG}`)
    assert.match(faHome.text, /مرکز فرمان/)
    assert.match(faHome.text, /از [۰-۹]+ کامل/)
    await owner.get(`/brands/${SLUG}/governance/documents?lang=tr`)
    const tr = await owner.page(`/brands/${SLUG}/governance/documents`)
    assert.match(tr.text, /Yayın galerisi/)
    assert.match(tr.text, /Yatırımcı/)
    assert.match(tr.text, /Bu komutla dışa aktarın/)
  } finally {
    await s.close()
  }
})
