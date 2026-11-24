import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { parse, stringify } from 'yaml'
import { Browser, findChrome, type Page } from './helpers/browser.js'
import { teardown } from './helpers/cleanup.js'
import { addApprovedAsset, editOutsideStudio } from './helpers/edits.js'
import { Client, freshTotp, OWNER_LOGIN, OWNER_PASSWORD, startStudio, type RunningStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

/**
 * Visual V3.4 in a real headless Chrome: the mascot atlas and six-stage evolution sheet at three widths in English
 * and Persian, light and dark, with no page overflow, no CSP violation, accessible structure, AA contrast and
 * Vazirmatn for Persian; and the print view printed to PDF on A4 portrait pages with embedded fonts.
 *
 * Skips without Chrome (STUDIO_E2E_REQUIRED=1 makes that a failure). STUDIO_E2E_SCREENSHOTS=<dir> also saves
 * screenshots and the PDFs for visual review. The artwork is fictional test geometry, not a character.
 */
const chrome = findChrome()
if (!chrome && process.env.STUDIO_E2E_REQUIRED === '1') throw new Error('STUDIO_E2E_REQUIRED=1 but no Chrome was found (set CHROME_PATH).')
const skip = chrome ? false : 'no Chrome/Chromium found (set CHROME_PATH); browser E2E skipped'
const shots = process.env.STUDIO_E2E_SCREENSHOTS ? path.resolve(process.env.STUDIO_E2E_SCREENSHOTS) : null
const SLUG = 'acme-atlas'
const ART = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><circle cx="200" cy="200" r="160" fill="#123A73"/></svg>')

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
  await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Acme Atlas', slug: SLUG, profile: 'business', default_locale: 'en', locales: ['en', 'fa', 'tr'], mascot: 'on', owner: OWNER, repo: SLUG } })
  await s.studio.provisioning.settled()
  await s.studio.sync.settled()
  editOutsideStudio(s, SLUG, (_engine, root) => {
    addApprovedAsset(root, { id: 'asset.mascot.joyful', name: 'Joyful front', file: 'brand/assets/mascot/joyful.svg', data: ART })
    const manifestFile = path.join(root, 'brand/assets/asset-manifest.yaml')
    const manifest = parse(fs.readFileSync(manifestFile, 'utf8')) as { assets: Array<Record<string, unknown>> }
    Object.assign(manifest.assets.find((asset) => asset.id === 'asset.mascot.joyful')!, { mime: 'image/svg+xml', tags: ['mascot'] })
    fs.writeFileSync(manifestFile, stringify(manifest))
    const catalogFile = path.join(root, 'brand/mascot/catalog.yaml')
    const catalog = parse(fs.readFileSync(catalogFile, 'utf8')) as { states: Array<Record<string, unknown>> }
    Object.assign(catalog.states.find((state) => state.id === 'mascot.emotion.joyful')!, { status: 'approved', artwork: [{ id: 'art.joyful.front', stage: 'example.stage.egg', asset_id: 'asset.mascot.joyful', status: 'approved', version: '1.0.0', angle: 'mascot.angle.front' }] })
    fs.writeFileSync(catalogFile, stringify(catalog))
  })
  await s.studio.sync.refresh(SLUG)
  page = await browser.newPage()
  await page.viewport(1440, 900)
  await page.goto(`${s.url}/login`)
  await page.type('#login', OWNER_LOGIN)
  await page.type('#password', OWNER_PASSWORD)
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
    for (const a of document.querySelectorAll('.vz-mascot a[href^="#"]')) if (!document.getElementById(a.getAttribute('href').slice(1))) issues.push('in-page link without a target: ' + a.getAttribute('href'))
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

test('mascot atlas: three widths, en and fa, light and dark: no overflow, clean CSP, accessible, AA contrast', { skip }, async () => {
  for (const lang of ['en', 'fa'] as const) {
    await page.goto(`${s.url}/brands/${SLUG}/brand/mascot?lang=${lang}`)
    for (const scheme of ['light', 'dark'] as const) {
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] })
      for (const width of [1440, 768, 390]) {
        await page.viewport(width, 900, width < 500)
        await page.goto(`${s.url}/brands/${SLUG}/brand/mascot`)
        await settle()
        const where = `mascot ${lang} ${scheme} ${width}px`
        assert.equal(await page.eval<string>('document.documentElement.dir'), lang === 'fa' ? 'rtl' : 'ltr', where)
        const widths = await overflow()
        assert.ok(widths.scroll <= widths.client + 1, `${where}: page overflow ${widths.scroll} > ${widths.client}`)
        assert.equal(await page.eval<number>(`document.querySelectorAll('.vz-mcard').length`), 1, where)
        assert.equal(await page.eval<number>(`document.querySelectorAll('.vz-stage').length`), 6, where)
        // The first plate is above the fold; later frames are lazy-loaded, so only their source is checked.
        await page.waitFor(`(() => { const img = document.querySelector('.vz-mcard .vz-mframe-img'); return img && img.complete && img.naturalWidth > 0 })()`)
        assert.equal(await page.eval<number>(`document.querySelectorAll('.vz-stage.is-drawn .vz-mframe-img[src*="/assets/file/"]').length`), 1, `${where}: stage one points at the approved file`)
        if (width === 1440) {
          assert.deepEqual(await structureIssues(), [], `${where}: structure`)
          assert.deepEqual(await contrastFailures('.vz-mascot'), [], `${where}: contrast`)
          if (lang === 'fa') assert.match(await page.eval<string>(`getComputedStyle(document.querySelector('.vz-opener-title')).fontFamily`), /Vazirmatn/, `${where}: Persian display face`)
        }
        if (shots && [1440, 390].includes(width)) {
          fs.mkdirSync(shots, { recursive: true })
          await page.screenshot(path.join(shots, `mascot-${lang}-${scheme}-${width}.png`))
        }
      }
    }
  }
  await page.send('Emulation.setEmulatedMedia', { features: [] })
  await page.viewport(1440, 900)
  assert.deepEqual(page.problems, [], 'no console error, exception or CSP violation')
})

test('mascot print view: A4 portrait book pages, fonts embedded', { skip }, async () => {
  for (const lang of ['en', 'fa'] as const) {
    await page.goto(`${s.url}/brands/${SLUG}/brand/mascot?lang=${lang}`)
    await page.goto(`${s.url}/brands/${SLUG}/brand/mascot/print`)
    await settle()
    const result = await page.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true }, 60_000)
    const pdf = Buffer.from(String(result.data), 'base64')
    const text = pdf.toString('latin1')
    const boxes = [...text.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])] as const)
    assert.ok(boxes.length > 0 && boxes.every(([w, h]) => Math.abs(w - 595.28) < 2 && Math.abs(h - 841.89) < 2), `${lang}: every page is A4 portrait`)
    const pages = (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length
    assert.ok(pages >= 4, `${lang}: opener, atlas, evolution sheet and sources (${pages})`)
    assert.ok(text.includes('/FontFile2') || text.includes('/FontFile'), `${lang}: fonts are embedded`)
    if (shots) fs.writeFileSync(path.join(shots, `mascot-print-${lang}.pdf`), pdf)
  }
  assert.deepEqual(page.problems, [], 'no console error, exception or CSP violation')
})
