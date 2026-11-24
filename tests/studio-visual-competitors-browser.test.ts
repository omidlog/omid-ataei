import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { SHARED_LANDSCAPE_PATH } from '@brand-os/brand-core/competitive'
import { illustrativeLandscape, illustrativePositioning } from '@brand-os/brand-core/visual'
import { Browser, findChrome, type Page } from './helpers/browser.js'
import { teardown } from './helpers/cleanup.js'
import { approve, editOutsideStudio } from './helpers/edits.js'
import { Client, freshTotp, OWNER_LOGIN, OWNER_PASSWORD, startStudio, type RunningStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

/**
 * Visual V2.2 in a real headless Chrome: the competitor comparison matrix at three widths in English and Persian,
 * light and dark, with no page overflow (the matrix scrolls inside its own region), no CSP violation, accessible
 * structure and AA contrast; and the print view printed to PDF: A4 portrait opener, A4 landscape matrix.
 *
 * Skips without Chrome (STUDIO_E2E_REQUIRED=1 makes that a failure). STUDIO_E2E_SCREENSHOTS=<dir> also saves
 * screenshots and the PDFs for visual review. The competitor data is the ILLUSTRATIVE fixture with fictional hosts.
 */
const chrome = findChrome()
if (!chrome && process.env.STUDIO_E2E_REQUIRED === '1') throw new Error('STUDIO_E2E_REQUIRED=1 but no Chrome was found (set CHROME_PATH).')
const skip = chrome ? false : 'no Chrome/Chromium found (set CHROME_PATH); browser E2E skipped'
const shots = process.env.STUDIO_E2E_SCREENSHOTS ? path.resolve(process.env.STUDIO_E2E_SCREENSHOTS) : null
const SLUG = 'acme-rivals'

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
  await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Acme Learning', slug: SLUG, profile: 'business', default_locale: 'en', locales: ['en', 'fa', 'tr'], owner: OWNER, repo: SLUG } })
  await s.studio.provisioning.settled()
  await s.studio.sync.settled()
  editOutsideStudio(s, SLUG, (engine, root) => {
    approve(engine, root, {
      'business.offer.summary': 'Guided ten-minute language lessons with a weekly live session.',
      'business.customer.primary_segment': 'Working adults learning a language for a job move.',
      'business.market.geography': 'Türkiye and the Gulf, online.',
      'business.offer.value_proposition': 'Fluency that fits a working day.',
      'brand.color.roles': 'primary #123A73; onPrimary #FFFFFF; surface #F7F5F2; accent #D5FE00',
    })
    engine.answerQuestion('business.sales.pricing', 'DRAFT-PRICE-CANARY')
    const json = JSON.stringify({ ...illustrativeLandscape(), positioning: illustrativePositioning(), brand_slug: SLUG }).replace(/([a-z-]+)\.example/g, '$1-fictional.app')
    fs.mkdirSync(path.dirname(path.join(root, SHARED_LANDSCAPE_PATH)), { recursive: true })
    fs.writeFileSync(path.join(root, SHARED_LANDSCAPE_PATH), json)
  })
  await s.studio.sync.refresh(SLUG)
  page = await browser.newPage()
  await page.viewport(1440, 900)
  await page.goto(`${s.url}/login`)
  await page.type('#login', OWNER_LOGIN)
  await page.type('#password', OWNER_PASSWORD)
  // A code for a step the API login above did not use: a reused code leaves the browser on /login.
  await page.type('#totp', await freshTotp(s.url))
  await page.navigation(() => page.click('button[type=submit]'))
  assert.notEqual(await page.eval<string>('location.pathname'), '/login', 'the browser signed in')
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
  await page.eval('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 700)))')
}

async function overflow(): Promise<{ scroll: number; client: number }> {
  return page.eval(`({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth })`)
}

async function structureIssues(): Promise<string[]> {
  return page.eval<string[]>(`(() => {
    const issues = []
    const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim()
    for (const el of document.querySelectorAll('button:not([hidden]), a[href]')) if (!name(el) && !el.querySelector('.visually-hidden')) issues.push('unnamed control: ' + el.outerHTML.slice(0, 120))
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id)
    for (const id of new Set(ids)) if (ids.filter((x) => x === id).length > 1) issues.push('duplicate id: ' + id)
    if (document.querySelectorAll('h1').length !== 1) issues.push('expected exactly one h1, found ' + document.querySelectorAll('h1').length)
    if (!document.documentElement.lang) issues.push('no lang on html')
    if (!document.querySelector('main')) issues.push('no main landmark')
    for (const a of document.querySelectorAll('.vz-cmp a[href^="#"]')) if (!document.getElementById(a.getAttribute('href').slice(1))) issues.push('in-page link without a target: ' + a.getAttribute('href'))
    return issues
  })()`)
}

/** WCAG AA text contrast against blended ancestor backgrounds (same method as studio-browser.test.ts). */
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

test('competitor matrix: three widths, en and fa, light and dark: no overflow, clean CSP, accessible, AA contrast', { skip }, async () => {
  for (const lang of ['en', 'fa'] as const) {
    await page.goto(`${s.url}/brands/${SLUG}/market/competitors?lang=${lang}`)
    for (const scheme of ['light', 'dark'] as const) {
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] })
      for (const width of [1440, 768, 390]) {
        await page.viewport(width, 900, width < 500)
        await page.goto(`${s.url}/brands/${SLUG}/market/competitors`)
        await settle()
        const where = `competitors ${lang} ${scheme} ${width}px`
        assert.equal(await page.eval<string>('document.documentElement.dir'), lang === 'fa' ? 'rtl' : 'ltr', where)
        const widths = await overflow()
        const wide = widths.scroll > widths.client + 1 ? await page.eval<string[]>(`[...document.querySelectorAll('main *')].filter((el) => !el.closest('.vz-cmp-scroll') && el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 6).map((el) => el.tagName + '.' + (el.className.baseVal ?? el.className))`) : []
        assert.ok(widths.scroll <= widths.client + 1, `${where}: page overflow ${widths.scroll} > ${widths.client} ${wide.join(' ')}`)
        assert.equal(await page.eval<number>(`document.querySelectorAll('.vz-cmp-table tbody tr').length`), 4, where)
        assert.equal(await page.eval<number>(`document.querySelectorAll('.vz-strip-item').length`), 4, where)
        // V2.3: the positioning map plots the evidenced three and lists the unknown one in the margin.
        assert.equal(await page.eval<number>(`document.querySelectorAll('.vz-pos-point').length`), 3, where)
        assert.equal(await page.eval<number>(`document.querySelectorAll('.vz-pos-margin li').length`), 1, where)
        if (shots && width === 1440 && scheme === 'light') {
          fs.mkdirSync(shots, { recursive: true })
          await page.viewport(width, 1400)
          await page.eval(`document.getElementById('cmp-map').scrollIntoView()`)
          await settle()
          await page.screenshot(path.join(shots, `positioning-${lang}-${width}.png`), '#cmp-map')
          await page.viewport(width, 900)
          await page.eval('window.scrollTo(0, 0)')
        }
        if (width === 1440) {
          assert.deepEqual(await structureIssues(), [], `${where}: structure`)
          assert.deepEqual(await contrastFailures('.vz-cmp'), [], `${where}: contrast`)
        }
        if (shots && [1440, 390].includes(width)) {
          fs.mkdirSync(shots, { recursive: true })
          await page.screenshot(path.join(shots, `competitors-${lang}-${scheme}-${width}.png`))
        }
      }
    }
  }
  await page.send('Emulation.setEmulatedMedia', { features: [] })
  await page.viewport(1440, 900)
  const html = await page.eval<string>('document.documentElement.outerHTML')
  assert.equal(html.includes('DRAFT-PRICE-CANARY'), false, 'a draft own price is never shown')
  assert.deepEqual(page.problems, [], 'no console error, exception or CSP violation')
})

interface MapLayout {
  dir: string
  lowLeft: number
  highLeft: number
  yAxisLeft: number
  plotLeft: number
  plotCentre: number
  highPointX: number
  lowPointX: number
}

/** Rendered positions: the x poles, the y-axis column, the plot, and the fixture's high-x (Kestrel) and low-x (Avenra) points. */
async function mapLayout(): Promise<MapLayout> {
  return page.eval<MapLayout>(`(() => {
    const map = document.querySelector('#cmp-map')
    const box = (sel) => map.querySelector(sel).getBoundingClientRect()
    const point = (name) => [...map.querySelectorAll('.vz-pos-point')].find((g) => g.getAttribute('aria-label').startsWith(name)).getBoundingClientRect()
    const plot = box('.vz-pos-plot')
    const centre = (r) => r.left + r.width / 2
    return {
      dir: map.querySelector('.vz-pos-chart').getAttribute('dir'),
      lowLeft: box('.vz-pos-xaxis .vz-pos-pole--low').left,
      highLeft: box('.vz-pos-xaxis .vz-pos-pole--high').left,
      yAxisLeft: box('.vz-pos-yaxis').left,
      plotLeft: plot.left,
      plotCentre: centre(plot),
      highPointX: centre(point('Kestrel')),
      lowPointX: centre(point('Avenra')),
    }
  })()`)
}

function assertDirection(where: string, lang: string, l: MapLayout): void {
  if (lang === 'fa') {
    assert.equal(l.dir, 'rtl', where)
    assert.ok(l.lowLeft > l.highLeft, `${where}: low pole on the right`)
    assert.ok(l.yAxisLeft > l.plotLeft, `${where}: vertical axis on the right`)
    assert.ok(l.highPointX < l.plotCentre && l.lowPointX > l.plotCentre, `${where}: high x on the left, low x on the right`)
  } else {
    assert.equal(l.dir, 'ltr', where)
    assert.ok(l.lowLeft < l.highLeft, `${where}: low pole on the left`)
    assert.ok(l.yAxisLeft < l.plotLeft, `${where}: vertical axis on the left`)
    assert.ok(l.highPointX > l.plotCentre && l.lowPointX < l.plotCentre, `${where}: high x on the right, low x on the left`)
  }
}

test('positioning map: fa mirrors the horizontal axis, en and tr run left to right, on screen and in the print view', { skip }, async () => {
  await page.viewport(1440, 900)
  for (const lang of ['en', 'tr', 'fa'] as const) {
    await page.goto(`${s.url}/brands/${SLUG}/market/competitors?lang=${lang}`)
    await page.goto(`${s.url}/brands/${SLUG}/market/competitors`)
    await settle()
    assertDirection(`screen ${lang}`, lang, await mapLayout())
    await page.goto(`${s.url}/brands/${SLUG}/market/competitors/print`)
    await page.send('Emulation.setEmulatedMedia', { media: 'print' })
    await settle()
    assertDirection(`print ${lang}`, lang, await mapLayout())
    if (shots) {
      // About an A4 page wide, so the print layout is what the PDF shows.
      fs.mkdirSync(shots, { recursive: true })
      await page.viewport(800, 1400)
      await page.eval(`document.getElementById('cmp-map').scrollIntoView()`)
      await settle()
      await page.screenshot(path.join(shots, `positioning-print-${lang}.png`), '#cmp-map')
      await page.viewport(1440, 900)
    }
    await page.send('Emulation.setEmulatedMedia', { media: '' })
  }
  assert.deepEqual(page.problems, [], 'no console error, exception or CSP violation')
})

test('competitor print view: A4 portrait opener and an A4 landscape matrix page, fonts embedded', { skip }, async () => {
  for (const lang of ['en', 'fa'] as const) {
    await page.goto(`${s.url}/brands/${SLUG}/market/competitors?lang=${lang}`)
    await page.goto(`${s.url}/brands/${SLUG}/market/competitors/print`)
    await settle()
    const result = await page.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true }, 60_000)
    const pdf = Buffer.from(String(result.data), 'base64')
    const text = pdf.toString('latin1')
    const boxes = [...text.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])] as const)
    assert.ok(boxes.some(([w, h]) => Math.abs(w - 595.28) < 2 && Math.abs(h - 841.89) < 2), `${lang}: an A4 portrait page`)
    assert.ok(boxes.some(([w, h]) => Math.abs(w - 841.89) < 2 && Math.abs(h - 595.28) < 2), `${lang}: an A4 landscape matrix page`)
    const pages = (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length
    assert.ok(pages >= 5, `${lang}: opener, matrix, prices, positioning map and sources (${pages})`)
    assert.ok(text.includes('/FontFile2') || text.includes('/FontFile'), `${lang}: fonts are embedded`)
    if (shots) fs.writeFileSync(path.join(shots, `competitors-print-${lang}.pdf`), pdf)
  }
  assert.deepEqual(page.problems, [], 'no console error, exception or CSP violation')
})
