import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { approve, editOutsideStudio } from './helpers/edits.js'
import { Client, startStudio, type RunningStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

/**
 * Visual V3.2 in Studio: the SWOT / TOWS and Value Proposition Canvas pages and their print views are GET-only,
 * read the merged commit through the projection, keep drafts labelled and out of the public edition, show item
 * sources as numbered notes, keep ids out of the main view and work in en/fa/tr. SYNTHETIC DEMO data only.
 */
const SLUG = 'acme-roastery'

async function brandWithLists(s: RunningStudio, owner: Client): Promise<string> {
  const csrf = await owner.csrf('/brands/new')
  await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Acme Roastery', slug: SLUG, profile: 'business', default_locale: 'en', locales: ['en', 'fa', 'tr'], owner: OWNER, repo: SLUG } })
  await s.studio.provisioning.settled()
  await s.studio.sync.settled()
  const sha = editOutsideStudio(s, SLUG, (engine, root) => {
    approve(engine, root, {
      'business.offer.summary': 'APPROVED-OFFER weekly roast',
      'business.finance.costs': 'CANARY-RESTRICTED-COSTS 42000',
      'business.swot.strengths': 'Roasts <b>to</b> order | weekly log | evidenced | sources: business.offer.summary, https://example.com/roast-log?token=CANARY-QUERY#frag, kn_private-research\nSmall team | | owner_view',
      'business.swot.opportunities': 'More cafés buy local | trade survey | evidenced | sources: https://example.org/survey',
      'business.model.segments': 'Independent cafés | weekly supply | primary',
      'business.fit.pains': 'Stale beans | monthly shipping | extreme | links: seg-1\nLate delivery | | moderate',
    })
    engine.answerQuestion('business.swot.weaknesses', 'DRAFT-WEAKNESS one roaster | | owner_view')
    engine.answerQuestion('business.swot.tows', 'Café subscription | weekly | so | links: str-1, opp-1\nBackup roaster | | wt | links: wk-1, thr-3\nOpen idea | | | links: str-2')
    engine.answerQuestion('business.fit.relievers', 'DRAFT-RELIEVER roasted within 48 h | | links: pain-1')
  })
  await s.studio.sync.refresh(SLUG)
  return sha
}

function main(text: string): string {
  return text.split('<details')[0] ?? ''
}

test('Studio: SWOT / TOWS and the Value Proposition Canvas are read-only, sourced, localized pages', async () => {
  const s = await startStudio()
  try {
    const owner = new Client(s.url)
    await owner.login()
    const sha = await brandWithLists(s, owner)

    const overview = await owner.page(`/brands/${SLUG}`)
    assert.match(overview.text, new RegExp(`href="/brands/${SLUG}/strategy/swot-tows"`), 'nav entry for SWOT / TOWS')
    assert.match(overview.text, new RegExp(`href="/brands/${SLUG}/strategy/value-proposition"`), 'nav entry for the Value Proposition Canvas')

    const swot = await owner.page(`/brands/${SLUG}/strategy/swot-tows`)
    assert.equal(swot.res.status, 200)
    assert.match(swot.text, /SWOT analysis/)
    assert.match(swot.text, /TOWS matrix/)
    assert.match(swot.text, /Internal edition/)
    assert.match(swot.text, /class="vz-swot" dir="ltr"/)
    for (const quadrant of ['strengths', 'weaknesses', 'opportunities', 'threats']) assert.match(swot.text, new RegExp(`vz-swot-q--${quadrant}`), quadrant)
    assert.match(swot.text, /Roasts &lt;b&gt;to&lt;\/b&gt; order/, 'item names are escaped')
    assert.equal(swot.text.includes('<b>to</b>'), false)
    assert.match(swot.text, /class="vz-item-tag">Evidenced</, 'choice labels are localized')
    assert.match(swot.text, /DRAFT-WEAKNESS one roaster/, 'the internal edition shows the draft …')
    assert.match(swot.text, /Draft, not approved/, '… labelled as a draft')
    assert.match(swot.text, /No threats listed yet/, 'a designed empty quadrant')
    // TOWS: placed by type, links by name, an unresolved link said plainly, an untyped strategy left unplaced.
    assert.match(swot.text, /class="vz-tows" dir="ltr"/)
    assert.match(swot.text, /SO strategies/)
    assert.match(swot.text, /Uses:<\/span> <span class="vz-item-link" dir="auto">Roasts &lt;b&gt;to&lt;\/b&gt; order<\/span>, <span class="vz-item-link" dir="auto">More cafés buy local<\/span>/)
    assert.match(swot.text, /an item not shown in this edition/)
    assert.match(swot.text, /Strategies without a type/)
    // Sources: numbered marks on the item, a numbered list, a label for an approved answer, a host for a web page.
    assert.match(swot.text, /<sup class="vz-src"[^>]*><a href="#swot_tows-src-1">1<\/a>/)
    assert.match(swot.text, /id="swot_tows-src-1"[\s\S]*?Approved answer[\s\S]*?Offer/)
    assert.match(swot.text, /<a href="https:\/\/example\.com\/roast-log" target="_blank" rel="noopener noreferrer nofollow" dir="ltr">example\.com<\/a>/)
    assert.match(swot.text, /Not available in this edition/, 'a knowledge note that is not shared is never guessed')
    assert.equal(swot.text.includes('APPROVED-OFFER'), false, 'a cited answer is named, never quoted')
    // Ids stay out of the main view; they are in the details.
    for (const id of ['str-1', 'tows-1', 'business.swot.strengths', 'kn_private-research', 'brand-os.entity-list']) assert.equal(main(swot.text).includes(id), false, `${id} not in the main view`)
    assert.match(swot.text, /<code class="vz-code" dir="ltr">str-1<\/code>/, 'ids in the details disclosure')
    assert.match(swot.text, /--entity add\|edit\|move\|remove\|list/)
    assert.match(swot.text, /Informed by/)
    assert.doesNotMatch(swot.text, /certified|compliant/i)
    assert.equal(/\sstyle="/.test(swot.text), false, 'no inline style')
    assert.equal(/\son[a-z]+="/.test(swot.text), false, 'no inline handler')
    assert.equal(/<form[^>]*method="post"/i.test(swot.text.split('<main')[1] ?? ''), false, 'no write form')

    const vpc = await owner.page(`/brands/${SLUG}/strategy/value-proposition`)
    assert.equal(vpc.res.status, 200)
    assert.match(vpc.text, /Value Proposition Canvas/)
    assert.match(vpc.text, /class="vz-vpc" dir="ltr"/)
    for (const zone of ['products_services', 'gain_creators', 'pain_relievers', 'customer_jobs', 'gains', 'pains']) assert.match(vpc.text, new RegExp(`vz-vpc-zone--${zone}`), zone)
    assert.match(vpc.text, /For:<\/span> <span class="vz-item-link" dir="auto">Independent cafés<\/span>/, 'a segment link reads as its name')
    assert.match(vpc.text, /1 of 2 pains have a linked reliever/)
    assert.match(vpc.text, /No reliever linked yet/)
    assert.match(vpc.text, /No gain creators listed yet/)
    assert.match(vpc.text, /DRAFT-RELIEVER/)
    assert.equal(main(vpc.text).includes('pain-1'), false)

    const print = await owner.page(`/brands/${SLUG}/strategy/swot-tows/print`)
    assert.equal(print.res.status, 200)
    assert.match(print.text, /vz-page--sbook/)
    assert.match(print.text, /DRAFT-WEAKNESS/)
    assert.match(print.text, new RegExp(sha.slice(0, 12)))
    assert.equal(/<script(?![^>]*src="\/static\/visual\.js\?v=[A-Za-z0-9_-]+")/.test(print.text), false, 'only the static helper script')
    assert.equal(/\sstyle="/.test(print.text), false)
    const vpcPrint = await owner.page(`/brands/${SLUG}/strategy/value-proposition/print`)
    assert.equal(vpcPrint.res.status, 200)
    assert.match(vpcPrint.text, /vz-plate--fit/, 'the fit has its own plate in print')

    // Public edition: these lists are internal, so nothing of them is published; designed empty states instead.
    for (const pathname of ['swot-tows', 'value-proposition']) {
      const pub = await owner.page(`/brands/${SLUG}/strategy/${pathname}/print?edition=public`)
      assert.equal(pub.res.status, 200)
      assert.match(pub.text, /Public edition/)
      for (const hidden of ['DRAFT-WEAKNESS', 'DRAFT-RELIEVER', 'Roasts &lt;b&gt;', 'Stale beans', 'kn_private-research', 'example.com']) assert.equal(pub.text.includes(hidden), false, `${pathname}: ${hidden}`)
      assert.match(pub.text, /Not published/)
    }

    const cache = fs.readFileSync(path.join(s.config.dataDir, 'cache', SLUG, 'state.json'), 'utf8')
    for (const text of [swot.text, vpc.text, print.text, cache]) {
      assert.equal(text.includes('CANARY-RESTRICTED-COSTS'), false, 'restricted value never reaches Studio')
      assert.equal(text.includes('CANARY-QUERY'), false, 'a source address keeps no query string')
    }
    assert.match(cache, /"strategy":\{"swot"/, 'the projection carries the documents')

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const pathname of [`/brands/${SLUG}/strategy/swot-tows`, `/brands/${SLUG}/strategy/value-proposition/print`]) {
        const res = await owner.request(method, pathname, { form: { _csrf: 'x' } })
        assert.ok([404, 405].includes(res.status), `${method} ${pathname} ${res.status}`)
      }
    }
    const guest = new Client(s.url)
    for (const pathname of [`/brands/${SLUG}/strategy/swot-tows`, `/brands/${SLUG}/strategy/value-proposition/print`]) {
      const res = await guest.get(pathname)
      assert.equal(res.status, 302)
      assert.equal((await res.text()).includes('Roasts'), false)
    }

    await owner.get(`/brands/${SLUG}/strategy/swot-tows?lang=fa`)
    const fa = await owner.page(`/brands/${SLUG}/strategy/swot-tows`)
    assert.match(fa.text, /<html lang="fa" dir="rtl">/)
    assert.match(fa.text, /تحلیل SWOT/)
    assert.match(fa.text, /class="vz-swot" dir="ltr"/, 'the SWOT keeps its standard topology in Persian')
    assert.match(fa.text, /class="vz-swot-q vz-swot-q--strengths[^"]*" dir="rtl"/, 'text inside the quadrants is right-to-left')
    assert.match(fa.text, /class="vz-item-tag">مستند</)
    assert.match(fa.text, /هنوز تهدیدی ثبت نشده است/)
    assert.match(fa.text, /<a href="#swot_tows-src-1">۱<\/a>/, 'source marks in Persian digits')
    const faVpc = await owner.page(`/brands/${SLUG}/strategy/value-proposition/print`)
    assert.match(faVpc.text, /<html lang="fa" dir="rtl">/)
    assert.match(faVpc.text, /بوم ارزش پیشنهادی/)
    assert.match(faVpc.text, /۱ از ۲ درد، درمانِ پیوندخورده دارند/, 'fit counts in Persian digits')
    await owner.get(`/brands/${SLUG}/strategy/value-proposition?lang=tr`)
    assert.match((await owner.page(`/brands/${SLUG}/strategy/value-proposition`)).text, /Değer Önerisi Kanvası/)
  } finally {
    await s.close()
  }
})
