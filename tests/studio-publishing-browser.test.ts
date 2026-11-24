import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { Browser, findChrome, type Page } from './helpers/browser.js'
import { teardown } from './helpers/cleanup.js'
import { approve, editOutsideStudio } from './helpers/edits.js'
import { Client, freshTotp, OWNER_LOGIN, OWNER_PASSWORD, startStudio, type RunningStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

/**
 * Visual V4.1 in a real headless Chrome: the Command Center and the Publishing gallery at 1440/768/390 px in English
 * and Persian, light and dark, with no page overflow, one h1, no duplicate ids and AA text contrast.
 *
 * Skips without Chrome (STUDIO_E2E_REQUIRED=1 makes that a failure). STUDIO_E2E_SCREENSHOTS=<dir> also saves
 * screenshots for visual review. SYNTHETIC DATA ONLY.
 */
const chrome = findChrome()
if (!chrome && process.env.STUDIO_E2E_REQUIRED === '1') throw new Error('STUDIO_E2E_REQUIRED=1 but no Chrome was found (set CHROME_PATH).')
const skip = chrome ? false : 'no Chrome/Chromium found (set CHROME_PATH); browser E2E skipped'
const shots = process.env.STUDIO_E2E_SCREENSHOTS ? path.resolve(process.env.STUDIO_E2E_SCREENSHOTS) : null
const SLUG = 'demo-learning'

let browser: Browser
let s: RunningStudio
let page: Page

before(async () => {
  if (!chrome) return
  browser = await Browser.launch(chrome)
  s = await startStudio()
  const owner = new Client(s.url)
  await owner.login()
  const csrf = await owner.csrf('/brands/new')
  await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Demo Learning', slug: SLUG, profile: 'business', default_locale: 'en', locales: ['en', 'fa', 'tr'], owner: OWNER, repo: SLUG } })
  await s.studio.provisioning.settled()
  await s.studio.sync.settled()
  editOutsideStudio(s, SLUG, (engine, root) => {
    approve(engine, root, {
      'business.offer.value_proposition': 'Busy adults reach a useful conversation level in ten minutes a day.',
      'business.customer.primary_segment': 'Working adults learning a language for a job move.',
      'business.model.revenue': 'Monthly and annual subscriptions.',
      'business.finance.costs': 'CANARY-RESTRICTED-COSTS',
      'brand.strategy.purpose': 'Make learning feel possible.',
      'brand.color.roles': 'primary #123A73; onPrimary #FFFFFF; surface #F7F5F2; onSurface #1B1F24',
    })
    engine.answerQuestion('brand.strategy.vision', 'A calmer classroom everywhere.')
  })
  await s.studio.sync.refresh(SLUG)
  page = await browser.newPage()
  await page.viewport(1440, 900)
  await page.goto(`${s.url}/login`)
  await page.type('#login', OWNER_LOGIN)
  await page.type('#password', OWNER_PASSWORD)
  await page.type('#totp', await freshTotp(s.url))
  await page.navigation(() => page.click('button[type=submit]'))
}, { timeout: 180_000 })

after(async () => {
  if (!chrome) return
  await teardown(
    () => page?.close(),
    () => browser?.close(),
    () => s?.close(),
  )
}, { timeout: 60_000 })

async function settle(): Promise<void> {
  await page.eval('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 500)))')
}

async function structureIssues(): Promise<string[]> {
  return page.eval<string[]>(`(() => {
    const issues = []
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id)
    for (const id of new Set(ids)) if (ids.filter((x) => x === id).length > 1) issues.push('duplicate id: ' + id)
    if (document.querySelectorAll('h1').length !== 1) issues.push('expected exactly one h1, found ' + document.querySelectorAll('h1').length)
    for (const el of document.querySelectorAll('a[href]')) if (!(el.textContent || el.getAttribute('aria-label') || '').trim()) issues.push('unnamed link: ' + el.outerHTML.slice(0, 100))
    return issues
  })()`)
}

/** WCAG AA text contrast against blended ancestor backgrounds (same method as studio-visual-browser.test.ts). */
async function contrastFailures(scope: string): Promise<string[]> {
  return page.eval<string[]>(`(() => {
    const parse = (value) => {
      const m = value.match(/^rgba?\\(([^)]+)\\)$/) || value.match(/^color\\(srgb ([^)]+)\\)$/)
      if (!m) return null
      const parts = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
      const scale = value.startsWith('color(') ? 255 : 1
      return { r: parts[0] * scale, g: parts[1] * scale, b: parts[2] * scale, a: parts.length > 3 ? parts[3] : 1 }
    }
    const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 })
    const background = (el) => {
      const layers = []
      for (let node = el; node; node = node.parentElement) {
        const bg = parse(getComputedStyle(node).backgroundColor)
        if (bg && bg.a > 0) { layers.push(bg); if (bg.a >= 1) break }
      }
      return layers.reverse().reduce((acc, layer) => over(layer, acc), { r: 255, g: 255, b: 255, a: 1 })
    }
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b) }
    const failures = []
    for (const el of document.querySelectorAll(${JSON.stringify(scope)} + ' *')) {
      if (['SCRIPT', 'STYLE'].includes(el.tagName) || el.closest('svg')) continue
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
      const style = getComputedStyle(el)
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0 || style.visibility === 'hidden' || el.closest('[hidden], [aria-hidden="true"], .visually-hidden')) continue
      const fg = parse(style.color)
      if (!fg) continue
      const bg = background(el)
      const [hi, lo] = [lum(over(fg, bg)), lum(bg)].sort((a, b) => b - a)
      const ratio = (hi + 0.05) / (lo + 0.05)
      const size = parseFloat(style.fontSize)
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
      if (ratio < (large ? 3 : 4.5)) failures.push(el.tagName.toLowerCase() + '.' + el.className + ' "' + el.textContent.trim().slice(0, 30) + '" ' + ratio.toFixed(2))
    }
    return failures
  })()`)
}

const PAGES = [
  { name: 'command-center', path: '', scope: '.cc-strip', check: `document.querySelectorAll('.cc-tile').length === 4 && document.querySelectorAll('.cc-map-row').length >= 4` },
  { name: 'publishing', path: '/governance/documents', scope: 'main', check: `document.querySelectorAll('.pub-table tbody tr').length === 7 && document.querySelectorAll('.pub-cell').length === 21` },
] as const

test('Command Center and Publishing gallery: no overflow, structure and AA contrast in en/fa, light/dark', { skip, timeout: 600_000 }, async () => {
  for (const lang of ['en', 'fa'] as const) {
    await page.goto(`${s.url}/brands/${SLUG}?lang=${lang}`)
    for (const scheme of ['light', 'dark'] as const) {
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] })
      for (const width of [1440, 768, 390]) {
        await page.viewport(width, 900, width < 500)
        for (const target of PAGES) {
          await page.goto(`${s.url}/brands/${SLUG}${target.path}`)
          await settle()
          const where = `${target.name} ${lang} ${scheme} ${width}px`
          assert.equal(await page.eval<string>('document.documentElement.dir'), lang === 'fa' ? 'rtl' : 'ltr', where)
          const widths = await page.eval<{ scroll: number; client: number }>(`({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth })`)
          const wide = widths.scroll > widths.client + 1 ? await page.eval<string[]>(`[...document.querySelectorAll('main *')].filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 || el.getBoundingClientRect().left < -1).slice(0, 8).map((el) => el.tagName + '.' + (el.className.baseVal ?? el.className) + ' ' + Math.round(el.getBoundingClientRect().width))`) : []
          assert.ok(widths.scroll <= widths.client + 1, `${where}: page overflow ${widths.scroll} > ${widths.client} ${wide.join(' | ')}`)
          assert.equal(await page.eval<boolean>(target.check), true, `${where}: content`)
          assert.equal(await page.eval<boolean>(`document.body.innerText.includes('CANARY-RESTRICTED-COSTS')`), false, `${where}: restricted value`)
          if (width === 1440) {
            assert.deepEqual(await structureIssues(), [], `${where}: structure`)
            assert.deepEqual(await contrastFailures(target.scope), [], `${where}: contrast`)
          }
          if (shots && width === 1440 && scheme === 'light') {
            fs.mkdirSync(shots, { recursive: true })
            await page.screenshot(path.join(shots, `${target.name}-${lang}-${scheme}-${width}.png`))
          }
        }
      }
    }
  }
  await page.send('Emulation.setEmulatedMedia', { features: [] })
})
