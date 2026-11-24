import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { approve, editOutsideStudio } from './helpers/edits.js'
import { Client, startStudio, type RunningStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

/**
 * Visual Blueprint P0 in Studio: the business model canvas page and its static print view are GET-only, read the
 * merged commit through the sync projection, keep drafts labelled (and out of the public edition), withhold
 * restricted values, escape every value and work in en/fa/tr.
 */
const SLUG = 'acme-learning'

async function brandWithFacts(s: RunningStudio, owner: Client): Promise<string> {
  const csrf = await owner.csrf('/brands/new')
  await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Acme Learning', slug: SLUG, profile: 'business', default_locale: 'en', locales: ['en', 'fa', 'tr'], owner: OWNER, repo: SLUG } })
  await s.studio.provisioning.settled()
  await s.studio.sync.settled()
  const sha = editOutsideStudio(s, SLUG, (engine, root) => {
    approve(engine, root, {
      'business.offer.value_proposition': 'Fluent <script>alert(1)</script> in ten minutes a day',
      'business.model.revenue': 'APPROVED-REVENUE subscriptions',
      'business.finance.costs': 'CANARY-RESTRICTED-COSTS 42000',
      // Visual V3.1 list questions (SYNTHETIC DEMO): an approved segment list.
      'business.customer.primary_segment': 'Working adults',
      'business.model.segments': 'Independent cafés | weekly supply | primary\nOffice kitchens',
    })
    engine.answerQuestion('business.sales.pricing', 'DRAFT-PRICING one paid tier')
    // A draft activity list linking to a visible segment and to one that does not exist (unresolved).
    engine.answerQuestion('business.model.key_activities', 'DRAFT-ACTIVITY roasting | small batches | production | links: seg-1, seg-9')
  })
  await s.studio.sync.refresh(SLUG)
  return sha
}

test('Studio: the canvas page and print view are read-only, labelled, escaped and localized', async () => {
  const s = await startStudio()
  try {
    const owner = new Client(s.url)
    await owner.login()
    const sha = await brandWithFacts(s, owner)

    const overview = await owner.page(`/brands/${SLUG}`)
    assert.match(overview.text, new RegExp(`href="/brands/${SLUG}/strategy/business-model"`), 'nav entry for a business brand')

    const page = await owner.page(`/brands/${SLUG}/strategy/business-model`)
    assert.equal(page.res.status, 200)
    assert.match(page.text, /Business Model Canvas/)
    assert.match(page.text, /Internal edition/)
    assert.equal((page.text.match(/class="vz-zone vz-zone--/g) ?? []).length, 9, 'exactly nine zones')
    for (const zone of ['key_partners', 'key_activities', 'key_resources', 'value_propositions', 'customer_relationships', 'channels', 'customer_segments', 'cost_structure', 'revenue_streams']) {
      assert.match(page.text, new RegExp(`id="bmc-zone-${zone}"`), zone)
    }
    assert.match(page.text, /Fluent &lt;script&gt;alert\(1\)&lt;\/script&gt; in ten minutes/, 'values are escaped')
    assert.equal(page.text.includes('<script>alert'), false)
    assert.match(page.text, /APPROVED-REVENUE subscriptions/)
    assert.match(page.text, /DRAFT-PRICING one paid tier/, 'the internal edition shows the draft …')
    assert.match(page.text, /Draft, not approved/, '… labelled as a draft')
    assert.match(page.text, /Restricted value withheld/)
    // Visual V3.1: list zones. Items in the owner's order, labelled choices, links by name, a designed empty list.
    assert.match(page.text, /class="vz-item-name" dir="auto">Independent cafés</)
    assert.match(page.text, /class="vz-item-tag">Primary</)
    assert.match(page.text, /DRAFT-ACTIVITY roasting/)
    assert.match(page.text, /Linked to:<\/span> <span class="vz-item-link" dir="auto">Independent cafés<\/span>, <span class="vz-item-link vz-item-link--hidden">an item not shown in this edition/)
    assert.match(page.text, /No key resources listed yet/, 'a designed empty list zone')
    assert.match(page.text, /class="vz-panel vz-links"/, 'the links panel lists recorded links')
    assert.equal(page.text.includes('brand-os.entity-list'), false, 'the stored list format never reaches the page')
    assert.equal((page.text.split('<details')[0] ?? '').includes('seg-1'), false, 'item ids stay out of the main view')
    assert.match(page.text, /business\.model\.key_activities/, 'the proposed question is named')
    assert.match(page.text, /Informed by/)
    assert.doesNotMatch(page.text, /certified|compliant/i)
    assert.match(page.text, /\/static\/visual\.css\?v=/)
    assert.equal(/\sstyle="/.test(page.text), false, 'no inline style')
    assert.equal(/\son[a-z]+="/.test(page.text), false, 'no inline handler')
    assert.equal(/<form[^>]*method="post"/i.test(page.text.split('<main')[1] ?? ''), false, 'no write form in the page body')

    const print = await owner.page(`/brands/${SLUG}/strategy/business-model/print`)
    assert.equal(print.res.status, 200)
    assert.match(print.text, /class="vz-print-body/)
    assert.match(print.text, /vz-page--canvas/)
    assert.match(print.text, /vz-page--sources/)
    assert.match(print.text, /DRAFT-PRICING/)
    assert.match(print.text, new RegExp(sha.slice(0, 12)), 'the print view names the source commit')
    assert.equal(/<script(?![^>]*src="\/static\/visual\.js\?v=[A-Za-z0-9_-]+")/.test(print.text), false, 'only the static helper script')
    assert.equal(/\sstyle="/.test(print.text), false)

    const pub = await owner.page(`/brands/${SLUG}/strategy/business-model/print?edition=public`)
    assert.equal(pub.res.status, 200)
    assert.match(pub.text, /Public edition/)
    assert.equal(pub.text.includes('DRAFT-PRICING'), false, 'the public edition leaves drafts out')
    assert.equal(pub.text.includes('DRAFT-ACTIVITY'), false, 'draft list items stay out of the public edition')
    assert.equal(pub.text.includes('Independent cafés'), false, 'approved but unpublished list items stay out too')
    assert.equal(pub.text.includes('APPROVED-REVENUE'), false, 'approved but unpublished internal facts stay out of the public edition')
    assert.match(pub.text, /Not published/)

    const cache = fs.readFileSync(path.join(s.config.dataDir, 'cache', SLUG, 'state.json'), 'utf8')
    for (const text of [page.text, print.text, pub.text, cache]) {
      assert.equal(text.includes('CANARY-RESTRICTED-COSTS'), false, 'restricted value never reaches Studio')
      assert.equal(text.includes('42000'), false)
    }

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const pathname of [`/brands/${SLUG}/strategy/business-model`, `/brands/${SLUG}/strategy/business-model/print`]) {
        const res = await owner.request(method, pathname, { form: { _csrf: 'x' } })
        assert.ok([404, 405].includes(res.status), `${method} ${pathname} ${res.status}`)
      }
    }
    assert.equal((await owner.get(`/brands/${SLUG}/visual/edit`)).status, 404)
    assert.equal((await owner.get('/brands/no-such-brand/strategy/business-model')).status, 404)

    const guest = new Client(s.url)
    for (const pathname of [`/brands/${SLUG}/strategy/business-model`, `/brands/${SLUG}/strategy/business-model/print`]) {
      const res = await guest.get(pathname)
      assert.equal(res.status, 302)
      assert.equal((await res.text()).includes('Fluent'), false)
    }

    // The business plan shows the list read-only: names first, ids and links behind a toggle, no write form.
    const business = await owner.page(`/brands/${SLUG}/strategy/business-plan`)
    assert.equal(business.res.status, 200)
    assert.match(business.text, /class="entity-name" dir="auto">Independent cafés/)
    assert.match(business.text, /<summary>Ids and links<\/summary>/)
    assert.match(business.text, /--entity add\|edit\|move\|remove/, 'edits happen in the brand repository')
    assert.equal(/<form[^>]*method="post"/i.test(business.text.split('<main')[1] ?? ''), false, 'no write form')

    await owner.get(`/brands/${SLUG}/strategy/business-model?lang=fa`)
    const fa = await owner.page(`/brands/${SLUG}/strategy/business-model`)
    assert.match(fa.text, /<html lang="fa" dir="rtl">/)
    assert.match(fa.text, /بوم مدل کسب‌وکار/)
    assert.match(fa.text, /class="vz-bmc" dir="ltr"/, 'the canvas keeps its canonical topology in Persian')
    assert.match(fa.text, /class="vz-cell vz-cell--key_partners" dir="rtl"/, 'text inside the zones is right-to-left')
    assert.match(fa.text, /هنوز منبع کلیدی‌ای فهرست نشده است/, 'the empty list zone in Persian')
    assert.match(fa.text, /class="vz-item-tag">اصلی</, 'choice labels are localized; item names are not translated')
    assert.match(fa.text, /Independent cafés/)
    const faPrint = await owner.page(`/brands/${SLUG}/strategy/business-model/print`)
    assert.match(faPrint.text, /<html lang="fa" dir="rtl">/)
    await owner.get(`/brands/${SLUG}/strategy/business-model?lang=tr`)
    assert.match((await owner.page(`/brands/${SLUG}/strategy/business-model`)).text, /İş Modeli Kanvası/)
  } finally {
    await s.close()
  }
})

test('Studio: a personal brand without a business facet has no canvas entry and a clear page', async () => {
  const s = await startStudio()
  try {
    const owner = new Client(s.url)
    await owner.login()
    const csrf = await owner.csrf('/brands/new')
    await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Alex Example', slug: 'alex-example', profile: 'personal-brand', facets: ['speaker-author'], default_locale: 'en', locales: ['en'], owner: OWNER, repo: 'alex-example' } })
    await s.studio.provisioning.settled()
    await s.studio.sync.settled()
    const overview = await owner.page('/brands/alex-example')
    assert.equal(overview.res.status, 200)
    assert.equal(overview.text.includes('href="/brands/alex-example/strategy/business-model"'), false)
    const page = await owner.page('/brands/alex-example/strategy/business-model')
    assert.equal(page.res.status, 200)
    assert.match(page.text, /Not used for this profile/)
    assert.equal((await owner.get('/brands/alex-example/strategy/business-model/print')).status, 404)
  } finally {
    await s.close()
  }
})

test('sync: a cache written before the visual projection existed is rebuilt at the same commit', async () => {
  const { harness, provisioned } = await import('./helpers/studio.js')
  const h = harness()
  const req = await provisioned(h)
  const file = path.join(h.dataDir, 'cache', req.slug, 'state.json')
  const state = JSON.parse(fs.readFileSync(file, 'utf8')) as { projection: Record<string, unknown> }
  assert.ok(state.projection.visual)
  delete state.projection.visual
  fs.writeFileSync(file, JSON.stringify(state))
  assert.equal(h.sync.get(req.slug).projection!.visual, undefined)
  const after = await h.sync.refresh(req.slug)
  assert.equal(after.projection!.visual?.bmc.internal.document_kind, 'business_model_canvas')
  assert.equal(after.projection!.visual?.bmc.public.audience, 'public')
})
