import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { Browser, findChrome, type Page } from './helpers/browser.js'
import { teardown } from './helpers/cleanup.js'
import { ANSWER_CANARY, RESTRICTED_CANARY, VAGUE_SEGMENT } from './helpers/coach.js'
import { editOutsideStudio } from './helpers/edits.js'
import { Client, startStudio, type RunningStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

/**
 * The Studio Overview coach card (docs-internal/COACH_UX_DECISION.md, moment `studio_overview`). SYNTHETIC DEMO
 * data. It appears on its own after a sync when merged drafts have a gap, hides when there is nothing to say, never
 * quotes an answer or a restricted value, and adds no route. With Chrome, it is also rendered in en and fa (RTL);
 * STUDIO_E2E_SCREENSHOTS=<dir> saves the screenshots.
 */
const chrome = findChrome()
const shots = process.env.STUDIO_E2E_SCREENSHOTS ? path.resolve(process.env.STUDIO_E2E_SCREENSHOTS) : null
const SLUG = 'acme-learning'
const QUIET = 'quiet-brand'

let s: RunningStudio
let owner: Client

async function provision(slug: string): Promise<void> {
  const csrf = await owner.csrf('/brands/new')
  await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: slug, slug, profile: 'business', default_locale: 'en', locales: ['en', 'fa', 'tr'], owner: OWNER, repo: slug } })
  await s.studio.provisioning.settled()
  await s.studio.sync.settled()
}

before(async () => {
  s = await startStudio()
  owner = new Client(s.url)
  await owner.login()
  await provision(SLUG)
  editOutsideStudio(s, SLUG, (engine) => {
    engine.answerQuestion('business.stage.current', 'pre-revenue')
    engine.answerQuestion('business.customer.primary_segment', VAGUE_SEGMENT)
    engine.answerQuestion('brand.strategy.purpose', `Quality. ${ANSWER_CANARY}`)
    engine.answerQuestion('business.identity.trade_name', `EXAMPLE Demo ${ANSWER_CANARY}`)
    engine.answerQuestion('business.finance.runway', 'unknown')
  })
  await s.studio.sync.refresh(SLUG)
  await provision(QUIET)
}, { timeout: 180_000 })

after(async () => {
  await teardown(() => s?.close())
}, { timeout: 60_000 })

test('projection: notes for merged strategic drafts with a gap; ids and closed text only', () => {
  const coach = s.studio.sync.get(SLUG).projection?.coach
  assert.ok(coach, 'the coach ran during sync')
  assert.deepEqual(coach.authorizes, [])
  assert.equal(coach.authority, 'derived_advice')
  const ids = coach.notes.map((note) => note.question_id)
  assert.ok(ids.includes('business.customer.primary_segment'))
  assert.ok(ids.includes('brand.strategy.purpose'))
  assert.ok(!ids.includes('business.identity.trade_name'), 'a name is not strategy')
  assert.ok(!ids.some((id) => id.startsWith('business.finance.runway')), 'restricted never analysed')
  for (const note of coach.notes) for (const locale of ['en', 'fa', 'tr'] as const) assert.ok(note.text[locale].next.length > 0)
  const segment = coach.notes.find((note) => note.question_id === 'business.customer.primary_segment')!
  assert.match(segment.text.fa.next, /[\u0600-\u06FF]/, 'the fa next step is Persian, not the en text')
  assert.notEqual(segment.text.tr.next, segment.text.en.next)
  const json = JSON.stringify(coach)
  assert.ok(!json.includes(ANSWER_CANARY) && !json.includes(RESTRICTED_CANARY) && !json.includes('Small businesses'), 'never quotes the owner')
  assert.ok(!/score|percent|confidence/i.test(json), 'no score')
})

test('overview: the card appears on its own in en and fa, and hides when there is nothing to say', async () => {
  const en = await owner.page(`/brands/${SLUG}?lang=en`).then(() => owner.page(`/brands/${SLUG}`))
  assert.equal(en.res.status, 200)
  assert.match(en.text, /Before you approve: coach notes/)
  assert.match(en.text, /npm run brand:coach -- analyze --mode follow_up --question business\.customer\.primary_segment/)
  assert.ok(!en.text.slice(en.text.indexOf('coach-title')).split('</section>')[0]!.includes(ANSWER_CANARY), 'the card quotes no answer')

  await owner.page(`/brands/${SLUG}?lang=fa`)
  const fa = await owner.page(`/brands/${SLUG}`)
  assert.match(fa.text, /پیش از تأیید: یادداشت‌های مربی/)
  assert.match(fa.text, /dir="rtl"/)
  assert.match(fa.text, /کدام یک گروه یا موقعیت/, 'the note itself is Persian')
  await owner.page(`/brands/${SLUG}?lang=en`)

  const quiet = await owner.page(`/brands/${QUIET}`)
  assert.equal(quiet.res.status, 200)
  assert.ok(!quiet.text.includes('coach-title'), 'silence is the default: no drafts, no card')
})

test('browser: the card renders in en and fa (RTL) without overflow or CSP problems', { skip: chrome ? false : 'no Chrome/Chromium found; browser check skipped', timeout: 180_000 }, async () => {
  const browser = await Browser.launch(chrome!)
  let page: Page | undefined
  try {
    page = await browser.newPage()
    await page.viewport(1280, 1400)
    // Reuse the owner session from the HTTP client: a second sign-in in the same TOTP step would be a replay.
    for (const [name, value] of owner.cookies) await page.send('Network.setCookie', { name, value, url: s.url })
    for (const lang of ['en', 'fa'] as const) {
      await page.goto(`${s.url}/brands/${SLUG}?lang=${lang}`)
      await page.waitFor(`!!document.querySelector('.coach-card')`)
      await page.eval('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 500)))')
      const dir: string = await page.eval<string>('document.documentElement.dir')
      assert.equal(dir, lang === 'fa' ? 'rtl' : 'ltr')
      const fits: boolean = await page.eval<boolean>('document.documentElement.scrollWidth <= document.documentElement.clientWidth')
      assert.ok(fits, `${lang}: no horizontal overflow`)
      if (shots) {
        fs.mkdirSync(shots, { recursive: true })
        await page.eval('window.scrollTo(0, 0)')
        await page.screenshot(path.join(shots, `coach-overview-${lang}.png`))
      }
    }
    assert.deepEqual(page.problems, [], 'no console error or CSP violation')
  } finally {
    await teardown(
      () => page?.close(),
      () => browser.close(),
    )
  }
})
