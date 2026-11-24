import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { approve, editOutsideStudio } from './helpers/edits.js'
import { Client, startStudio, type RunningStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

/**
 * Visual V3.3 in Studio: the customer journey map, SOSTAC® overview and OKR tree pages and their A3 print views are
 * GET-only, read the merged commit through the sync projection, keep drafts labelled (and out of the public edition),
 * keep ids out of the main view, escape every value and work in en/fa/tr with right-to-left Persian.
 */
const SLUG = 'plan-learning'
const PAGES = ['market/customer-journey', 'strategy/sostac', 'strategy/okrs'] as const

async function brandWithPlan(s: RunningStudio, owner: Client): Promise<string> {
  const csrf = await owner.csrf('/brands/new')
  await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Plan Learning', slug: SLUG, profile: 'business', default_locale: 'en', locales: ['en', 'fa', 'tr'], owner: OWNER, repo: SLUG } })
  await s.studio.provisioning.settled()
  await s.studio.sync.settled()
  const sha = editOutsideStudio(s, SLUG, (engine, root) => {
    // SYNTHETIC DEMO data, never a real brand.
    approve(engine, root, {
      'business.customer.primary_segment': 'Working adults',
      'business.model.segments': 'Working adults | short sessions | primary',
      'business.marketing.journey_stages':
        'Discover <script>alert(1)</script> | find a course | search, a friend | reads reviews | neutral | too many apps | promise on first screen | 12 interviews | links: seg-1, seg-5\nFirst week | keep the habit | reminder | misses day three | very_negative | wrong hour | pick the hour',
      'business.goals.annual': 'APPROVED-ANNUAL prove the segment',
      'business.goals.objectives': 'Build a daily habit | retention first | 2027 Q1\nClear price',
      'business.finance.costs': 'CANARY-RESTRICTED-COSTS 42000',
    })
    engine.answerQuestion('business.goals.key_results', 'DRAFT-KR active days | 40 | 26 | % | analytics | 12 | 2026-11-20 | links: obj-1\nPilots | 3 | | pilots | sales tracker | | | links: obj-2\nOrphan KR | 2 | 1 | channels | partner list | 0 | | links: obj-7')
    engine.answerQuestion('business.marketing.channels', 'DRAFT-CHANNEL founder posts')
  })
  await s.studio.sync.refresh(SLUG)
  return sha
}

function mainView(text: string): string {
  return (text.split('<main')[1] ?? '').split('<details')[0] ?? ''
}

test('Studio: journey map, SOSTAC overview and OKR tree are read-only, labelled, escaped and keep ids out of the main view', async () => {
  const s = await startStudio()
  try {
    const owner = new Client(s.url)
    await owner.login()
    const sha = await brandWithPlan(s, owner)

    const overview = await owner.page(`/brands/${SLUG}`)
    for (const pathname of PAGES) assert.match(overview.text, new RegExp(`href="/brands/${SLUG}/${pathname}"`), `nav entry ${pathname}`)

    const journey = await owner.page(`/brands/${SLUG}/market/customer-journey`)
    assert.equal(journey.res.status, 200)
    assert.match(journey.text, /Customer Journey Map/)
    assert.match(journey.text, /<table class="vz-jm vz-jm--n2">/)
    for (const lane of ['Touchpoints', 'Customer actions', 'Emotion', 'Pain points', 'Opportunities', 'Evidence']) assert.match(journey.text, new RegExp(`class="vz-jm-lane-name">${lane}<`), lane)
    assert.match(journey.text, /Discover &lt;script&gt;alert\(1\)&lt;\/script&gt;/, 'values are escaped')
    assert.equal(journey.text.includes('<script>alert'), false)
    assert.match(journey.text, /class="vz-jm-emo vz-jm-emo--neutral"/)
    assert.match(journey.text, /class="vz-jm-emo-label">Frustrated</, 'the emotion is text, not colour alone')
    assert.match(journey.text, /<polyline class="vz-jm-line"/, 'the emotion curve joins the stages')
    assert.match(journey.text, /class="vz-item-tag" dir="auto">Working adults</, 'a linked segment reads as its name')
    assert.match(journey.text, /an item not shown in this edition/, 'a link to a missing segment is said, never guessed')
    assert.match(journey.text, /<th scope="row">Journey hypothesis<\/th>/, 'the unanswered hypothesis is a named gap in the sources')

    const okr = await owner.page(`/brands/${SLUG}/strategy/okrs`)
    assert.equal(okr.res.status, 200)
    assert.match(okr.text, /OKR tree/)
    assert.match(okr.text, /APPROVED-ANNUAL prove the segment/)
    assert.match(okr.text, /class="vz-okr-obj-name" dir="auto">Build a daily habit</)
    assert.match(okr.text, /DRAFT-KR active days/)
    assert.match(okr.text, /Draft, not approved/, 'draft key results are labelled')
    assert.match(okr.text, /50% of the way from baseline to target/, '(26 − 12) ÷ (40 − 12)')
    assert.match(okr.text, /Not measured yet/)
    assert.match(okr.text, /Key results without a visible objective/)
    assert.match(okr.text, /Objective not shown in this edition/)
    assert.match(okr.text, /<rect class="vz-kr-fill" x="0" y="0" width="50"/)

    const sostac = await owner.page(`/brands/${SLUG}/strategy/sostac`)
    assert.equal(sostac.res.status, 200)
    assert.match(sostac.text, /SOSTAC® overview/)
    assert.deepEqual([...sostac.text.matchAll(/class="vz-sos vz-sos--([a-z]+) /g)].map((m) => m[1]), ['situation', 'objectives', 'strategy', 'tactics', 'action', 'control'])
    assert.match(sostac.text, /DRAFT-CHANNEL founder posts/)
    assert.match(sostac.text, /class="vz-item-name" dir="auto">Build a daily habit</, 'the objectives list appears under Objectives')

    for (const page of [journey, okr, sostac]) {
      const main = mainView(page.text)
      for (const id of ['seg-1', 'stage-1', 'obj-1', 'kr-1', 'business.goals', 'business.marketing']) assert.equal(main.includes(id), false, `${id} stays out of the main view`)
      assert.match(page.text, /<details class="vz-details">/)
      assert.match(page.text, /Informed by/)
      assert.doesNotMatch(page.text, /certified|compliant/i)
      assert.equal(/\sstyle="/.test(page.text), false, 'no inline style')
      assert.equal(/\son[a-z]+="/.test(page.text), false, 'no inline handler')
      assert.equal(/<form[^>]*method="post"/i.test(page.text.split('<main')[1] ?? ''), false, 'no write form in the page body')
      assert.equal(page.text.includes('brand-os.entity-list'), false)
    }
    assert.match(journey.text.split('<details')[1] ?? '', /stage-1/, 'item ids are in the details disclosure')
    assert.match(okr.text.split('<details')[1] ?? '', /business\.goals\.key_results/)

    for (const pathname of PAGES) {
      const print = await owner.page(`/brands/${SLUG}/${pathname}/print`)
      assert.equal(print.res.status, 200, pathname)
      assert.match(print.text, /vz-page--plan-main/)
      assert.match(print.text, /vz-page--plan-sources/)
      assert.match(print.text, /Page 1 of 2/)
      assert.match(print.text, new RegExp(sha.slice(0, 12)), 'the print view names the source commit')
      assert.equal(/<script(?![^>]*src="\/static\/visual\.js\?v=[A-Za-z0-9_-]+")/.test(print.text), false, 'only the static helper script')
      assert.equal(/\sstyle="/.test(print.text), false)
      // Audit (Visual V3): these are views of the marketing and business plans, which the V4.1 public profile never
      // receives (PROFILE_DOCUMENTS), so there is no public edition to link to or serve.
      const pub = await owner.get(`/brands/${SLUG}/${pathname}/print?edition=public`)
      assert.equal(pub.status, 404, `${pathname}: no public edition`)
      const body = await pub.text()
      for (const draft of ['DRAFT-KR', 'DRAFT-CHANNEL', 'APPROVED-ANNUAL', 'Build a daily habit', 'Discover']) assert.equal(body.includes(draft), false, `${pathname}: ${draft} is not served`)
    }
    for (const page of [journey, okr, sostac]) assert.equal(page.text.includes('print?edition=public'), false, 'no public print link on a plan view')

    const cache = fs.readFileSync(path.join(s.config.dataDir, 'cache', SLUG, 'state.json'), 'utf8')
    for (const text of [journey.text, okr.text, sostac.text, cache]) assert.equal(text.includes('CANARY-RESTRICTED-COSTS'), false, 'restricted value never reaches Studio')

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const pathname of PAGES.flatMap((p) => [`/brands/${SLUG}/${p}`, `/brands/${SLUG}/${p}/print`])) {
        const res = await owner.request(method, pathname, { form: { _csrf: 'x' } })
        assert.ok([404, 405].includes(res.status), `${method} ${pathname} ${res.status}`)
      }
    }
    assert.equal((await owner.get('/brands/no-such-brand/strategy/okrs')).status, 404)
    const guest = new Client(s.url)
    for (const pathname of PAGES) {
      const res = await guest.get(`/brands/${SLUG}/${pathname}`)
      assert.equal(res.status, 302)
      assert.equal((await res.text()).includes('Build a daily habit'), false)
    }

    // Persian: right-to-left, Persian labels and digits; the swimlane and the tree follow the page direction.
    await owner.get(`/brands/${SLUG}/market/customer-journey?lang=fa`)
    const fa = await owner.page(`/brands/${SLUG}/market/customer-journey`)
    assert.match(fa.text, /<html lang="fa" dir="rtl">/)
    assert.match(fa.text, /نقشهٔ سفر مشتری/)
    assert.match(fa.text, /مرحلهٔ ۱/, 'Persian digits')
    assert.match(fa.text, /class="vz-jm-lane-name">نقاط تماس</)
    assert.match(fa.text, /class="vz-jm-emo-label">بسیار ناراضی</)
    assert.equal(/<table class="vz-jm[^"]*" dir="ltr"/.test(fa.text), false, 'the swimlane is not forced left-to-right: it mirrors')
    assert.match(fa.text, /Discover/, 'values are never translated')
    const faOkr = await owner.page(`/brands/${SLUG}/strategy/okrs`)
    assert.match(faOkr.text, /درخت OKR/)
    assert.match(faOkr.text, /٪۵۰|۵۰٪/, 'percent in Persian digits')
    assert.match(faOkr.text, /<rect class="vz-kr-fill" x="50" y="0" width="50"/, 'the progress bar fills from the right in Persian')
    const faPrint = await owner.page(`/brands/${SLUG}/strategy/sostac/print`)
    assert.match(faPrint.text, /<html lang="fa" dir="rtl">/)
    assert.match(faPrint.text, /صفحهٔ ۱ از ۲/, 'Persian folios in Persian digits')
    assert.match(faPrint.text, /وضعیت/)
    await owner.get(`/brands/${SLUG}/strategy/sostac?lang=tr`)
    const tr = await owner.page(`/brands/${SLUG}/strategy/sostac`)
    assert.match(tr.text, /SOSTAC® genel bakışı/)
    assert.match(tr.text, /Durum/)
  } finally {
    await s.close()
  }
})

test('Studio: an empty brand gets designed empty states, and a personal brand without a business facet gets none of the pages', async () => {
  const s = await startStudio()
  try {
    const owner = new Client(s.url)
    await owner.login()
    const csrf = await owner.csrf('/brands/new')
    await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Empty Plan', slug: 'empty-plan', profile: 'business', default_locale: 'en', locales: ['en'], owner: OWNER, repo: 'empty-plan' } })
    await owner.request('POST', '/brands/new', { form: { _csrf: await owner.csrf('/brands/new'), name: 'Alex Example', slug: 'alex-example', profile: 'personal-brand', facets: ['speaker-author'], default_locale: 'en', locales: ['en'], owner: OWNER, repo: 'alex-example' } })
    await s.studio.provisioning.settled()
    await s.studio.sync.settled()
    const journey = await owner.page('/brands/empty-plan/market/customer-journey')
    assert.match(journey.text, /No journey stages recorded yet/)
    assert.match(journey.text, /How to fill this page/)
    assert.match(journey.text, /class="vz-plan-ghost vz-plan-ghost--journey"/)
    const okr = await owner.page('/brands/empty-plan/strategy/okrs')
    assert.match(okr.text, /No objectives or key results recorded yet/)
    const sostac = await owner.page('/brands/empty-plan/strategy/sostac')
    assert.equal((sostac.text.match(/class="vz-zchip vz-zchip--missing"/g) ?? []).length, 6)
    assert.equal((await owner.get('/brands/empty-plan/strategy/okrs/print?edition=public')).status, 404, 'the OKR tree is a business-plan view: never public')

    const personal = await owner.page('/brands/alex-example')
    for (const pathname of PAGES) assert.equal(personal.text.includes(`href="/brands/alex-example/${pathname}"`), false, pathname)
    assert.match((await owner.page('/brands/alex-example/strategy/okrs')).text, /Not used for this profile/)
    assert.equal((await owner.get('/brands/alex-example/strategy/okrs/print')).status, 404)
  } finally {
    await s.close()
  }
})

test('sync: a cache written before the V3.3 documents existed is rebuilt at the same commit', async () => {
  const { harness, provisioned } = await import('./helpers/studio.js')
  const h = harness()
  const req = await provisioned(h)
  const file = path.join(h.dataDir, 'cache', req.slug, 'state.json')
  const state = JSON.parse(fs.readFileSync(file, 'utf8')) as { projection: { visual: Record<string, unknown> } }
  assert.ok(state.projection.visual.plans)
  delete state.projection.visual.plans
  fs.writeFileSync(file, JSON.stringify(state))
  assert.equal(h.sync.get(req.slug).projection!.visual?.plans, undefined)
  const after = await h.sync.refresh(req.slug)
  assert.equal(after.projection!.visual?.plans?.internal.okr.document_kind, 'okr_tree')
  assert.equal(after.projection!.visual?.plans?.public.journey.audience, 'public')
})
