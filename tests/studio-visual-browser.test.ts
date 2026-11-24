import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { Browser, findChrome, type Page } from './helpers/browser.js'
import { teardown } from './helpers/cleanup.js'
import { parse, stringify } from 'yaml'
import { addApprovedAsset, approve, editOutsideStudio } from './helpers/edits.js'
import { Client, freshTotp, OWNER_LOGIN, OWNER_PASSWORD, startStudio, type RunningStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

/**
 * Visual Blueprint P0 in a real headless Chrome: the canvas page at five widths in English and Persian, light and
 * dark, with no page overflow, no CSP violation, accessible structure and AA contrast; and the print view printed
 * to PDF by the browser engine: A3 landscape, two pages, canvas page not overflowing, text extractable.
 *
 * Skips without Chrome (STUDIO_E2E_REQUIRED=1 makes that a failure). STUDIO_E2E_SCREENSHOTS=<dir> also saves
 * screenshots and the PDFs for visual review.
 */
const chrome = findChrome()
if (!chrome && process.env.STUDIO_E2E_REQUIRED === '1') throw new Error('STUDIO_E2E_REQUIRED=1 but no Chrome was found (set CHROME_PATH).')
const skip = chrome ? false : 'no Chrome/Chromium found (set CHROME_PATH); browser E2E skipped'
const shots = process.env.STUDIO_E2E_SCREENSHOTS ? path.resolve(process.env.STUDIO_E2E_SCREENSHOTS) : null
const SLUG = 'acme-learning'
const MARK = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"><rect width="300" height="100" rx="8" fill="#123A73"/><text x="150" y="64" font-size="40" text-anchor="middle" fill="#FFFFFF" font-family="sans-serif">ACME</text></svg>')

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
      'business.offer.value_proposition': 'Busy adults reach a useful conversation level in a new language in ten minutes a day. '.repeat(3).trim(),
      'business.customer.primary_segment': 'Working adults learning a language for a job move.',
      'business.model.revenue': 'Monthly and annual subscriptions.',
      'business.marketing.channels': 'App stores, short video, partner newsletters.',
      'business.finance.costs': 'CANARY-RESTRICTED-COSTS',
      // Visual identity chapter (V2.1): approved colour, type and logo rule.
      'brand.color.roles': 'primary #123A73; onPrimary #FFFFFF; surface #F7F5F2; onSurface #1B1F24; accent #D5FE00; onAccent #121212',
      'brand.type.scale': 'display: Rajdhani, Arial Narrow, sans-serif @ 48px/1.05; body: Inter, system-ui, sans-serif @ 16px/1.55',
      'brand.logo.min_size': 'min-size: 24px; clear-space: 0.5x; min-print: 10mm',
    })
    addApprovedAsset(root, { id: 'asset.logo.master', name: 'Acme master mark', file: 'brand/assets/logo/master.svg', data: MARK })
    const manifestFile = path.join(root, 'brand/assets/asset-manifest.yaml')
    const manifest = parse(fs.readFileSync(manifestFile, 'utf8')) as { assets: Array<Record<string, unknown>> }
    const master = manifest.assets.find((asset) => asset.id === 'asset.logo.master')!
    master.tags = ['logo', 'master']
    master.mime = 'image/svg+xml'
    fs.writeFileSync(manifestFile, stringify(manifest))
    engine.answerQuestion('business.sales.pricing', 'زبان فارسی: هفتهٔ اول رایگان، سپس یک پلن پولی.')
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
    for (const a of document.querySelectorAll('.vz-map a')) if (!document.getElementById(a.getAttribute('href').slice(1))) issues.push('mini-map link without a target: ' + a.getAttribute('href'))
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

test('canvas page: five widths, en and fa, light and dark: no overflow, clean CSP, accessible, AA contrast', { skip }, async () => {
  for (const lang of ['en', 'fa'] as const) {
    await page.goto(`${s.url}/brands/${SLUG}/strategy/business-model?lang=${lang}`)
    for (const scheme of ['light', 'dark'] as const) {
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] })
      for (const width of [1920, 1440, 1024, 768, 390]) {
        await page.viewport(width, 900, width < 500)
        await page.goto(`${s.url}/brands/${SLUG}/strategy/business-model`)
        await settle()
        const where = `${lang} ${scheme} ${width}px`
        assert.equal(await page.eval<string>('document.documentElement.dir'), lang === 'fa' ? 'rtl' : 'ltr', where)
        const widths = await overflow()
        assert.ok(widths.scroll <= widths.client + 1, `${where}: page overflow ${widths.scroll} > ${widths.client}`)
        assert.equal(await page.eval<number>(`document.querySelectorAll('.vz-zone').length`), 9, where)
        // The canvas keeps its topology: partners left of the value proposition, segments to its right, in every language.
        const order = await page.eval<number[]>(`['key_partners', 'value_propositions', 'customer_segments'].map((z) => document.querySelector('.vz-cell--' + z).getBoundingClientRect().left)`)
        assert.ok(order[0]! < order[1]! && order[1]! < order[2]!, `${where}: canonical left-to-right topology`)
        if (width < 1100) assert.ok(await page.eval<boolean>(`(() => { const el = document.querySelector('.vz-scroll'); return el.scrollWidth > el.clientWidth })()`), `${where}: the canvas scrolls inside its region instead of stacking`)
        if (width === 1440) {
          assert.deepEqual(await structureIssues(), [], `${where}: structure`)
          assert.deepEqual(await contrastFailures('.vz-screen'), [], `${where}: contrast`)
        }
        if (shots && [1440, 768, 390].includes(width)) {
          fs.mkdirSync(shots, { recursive: true })
          await page.screenshot(path.join(shots, `visual-${lang}-${scheme}-${width}.png`))
        }
      }
    }
  }
  await page.send('Emulation.setEmulatedMedia', { features: [] })
  await page.viewport(1440, 900)
  // Keyboard: the mini-map links are focusable and jump to their zone.
  await page.goto(`${s.url}/brands/${SLUG}/strategy/business-model?lang=en`)
  await settle()
  await page.eval(`(() => { document.querySelector('.vz-map a[href="#bmc-zone-key_resources"]').focus(); location.hash = '#bmc-zone-key_resources'; return true })()`)
  await page.eval('new Promise((r) => setTimeout(r, 400))')
  assert.equal(await page.eval<string>(`getComputedStyle(document.querySelector('#bmc-zone-key_resources')).outlineStyle`), 'solid', 'the selected zone is outlined')
  const html = await page.eval<string>('document.documentElement.outerHTML')
  assert.equal(html.includes('CANARY-RESTRICTED-COSTS'), false)
  assert.deepEqual(page.problems, [], 'no console error, exception or CSP violation')
})

test('reduced motion: zones are visible immediately and carry no running animation', { skip }, async () => {
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await page.goto(`${s.url}/brands/${SLUG}/strategy/business-model?lang=en`)
  const durations = await page.eval<string[]>(`[...document.querySelectorAll('.vz-zone')].map((z) => getComputedStyle(z).animationDuration)`)
  assert.ok(durations.every((d) => parseFloat(d) <= 0.0001), durations.join(','))
  await page.send('Emulation.setEmulatedMedia', { features: [] })
})

test('print view: the browser engine prints an A3-landscape PDF, canvas on page one, sources on page two', { skip }, async () => {
  for (const [lang, edition] of [['en', 'internal'], ['fa', 'internal'], ['tr', 'public']] as const) {
    await page.goto(`${s.url}/brands/${SLUG}/strategy/business-model?lang=${lang}`)
    await page.goto(`${s.url}/brands/${SLUG}/visual/print${edition === 'public' ? '?edition=public' : ''}`)
    await settle()
    assert.equal(await page.eval<boolean>(`document.querySelector('[data-print]').hidden`), false, 'the print button appears with scripting')
    // Lay out at the printable width of A3 landscape (420 mm minus 2 × 14 mm margins ≈ 1482 CSS px).
    await page.viewport(1482, 1039)
    await page.send('Emulation.setEmulatedMedia', { media: 'print' })
    // In print, the fixed-height canvas page must hold all of its content (nothing clipped).
    const fit = await page.eval<{ scroll: number; client: number }>(`(() => { const el = document.querySelector('.vz-page--canvas'); return { scroll: el.scrollHeight, client: el.clientHeight } })()`)
    assert.ok(fit.scroll <= fit.client + 1, `${lang}: canvas page overflows in print (${fit.scroll} > ${fit.client})`)
    const result = await page.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true }, 60_000)
    await page.send('Emulation.setEmulatedMedia', { media: '' })
    await page.viewport(1440, 900)
    const pdf = Buffer.from(String(result.data), 'base64')
    const text = pdf.toString('latin1')
    const box = text.match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/)
    assert.ok(box, 'a media box')
    assert.ok(Math.abs(Number(box[1]) - 1190.55) < 2 && Math.abs(Number(box[2]) - 841.89) < 2, `${lang}: A3 landscape, got ${box[1]}×${box[2]}`)
    const pages = (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length
    assert.equal(pages, 2, `${lang}: canvas and sources on two pages`)
    assert.ok(text.includes('/FontFile2') || text.includes('/FontFile'), `${lang}: fonts are embedded`)
    if (shots) fs.writeFileSync(path.join(shots, `visual-print-${lang}-${edition}.pdf`), pdf)
  }
  assert.deepEqual(page.problems, [], 'no console error, exception or CSP violation')
})

test('Visual identity chapter: five widths, en and fa, light and dark: no overflow, clean CSP, accessible, AA contrast', { skip }, async () => {
  for (const lang of ['en', 'fa'] as const) {
    await page.goto(`${s.url}/brands/${SLUG}/brand/book/visual-identity?lang=${lang}`)
    for (const scheme of ['light', 'dark'] as const) {
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] })
      for (const width of [1920, 1440, 1024, 768, 390]) {
        await page.viewport(width, 900, width < 500)
        await page.goto(`${s.url}/brands/${SLUG}/brand/book/visual-identity`)
        await settle()
        const where = `identity ${lang} ${scheme} ${width}px`
        const widths = await overflow()
        const wide = widths.scroll > widths.client + 1 ? await page.eval<string[]>(`[...document.querySelectorAll('main *')].filter((el) => !el.closest('.vz-grid-wrap') && el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 6).map((el) => el.tagName + '.' + (el.className.baseVal ?? el.className))`) : []
        assert.ok(widths.scroll <= widths.client + 1, `${where}: page overflow ${widths.scroll} > ${widths.client} ${wide.join(' ')}`)
        assert.equal(await page.eval<number>(`document.querySelectorAll('.vz-plate').length`), 3, where)
        assert.ok(await page.eval<boolean>(`document.querySelector('.vz-construct image').getBoundingClientRect().width > 0`), `${where}: the approved master is drawn`)
        if (width === 1440) {
          assert.deepEqual(await structureIssues(), [], `${where}: structure`)
          assert.deepEqual(await contrastFailures('.vz-book'), [], `${where}: contrast`)
        }
        if (shots && [1440, 390].includes(width)) {
          fs.mkdirSync(shots, { recursive: true })
          await page.screenshot(path.join(shots, `identity-${lang}-${scheme}-${width}.png`))
        }
      }
    }
  }
  await page.send('Emulation.setEmulatedMedia', { features: [] })
  await page.viewport(1440, 900)
  assert.deepEqual(page.problems, [], 'no console error, exception or CSP violation')
})

test('Visual identity print view: A4 portrait PDF with the chapter opener, plates and appendix', { skip }, async () => {
  for (const lang of ['en', 'fa'] as const) {
    await page.goto(`${s.url}/brands/${SLUG}/brand/book/visual-identity?lang=${lang}`)
    await page.goto(`${s.url}/brands/${SLUG}/brand/book/visual-identity/print`)
    await settle()
    const result = await page.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true }, 60_000)
    const pdf = Buffer.from(String(result.data), 'base64')
    const text = pdf.toString('latin1')
    const box = text.match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/)
    assert.ok(box, 'a media box')
    assert.ok(Math.abs(Number(box[1]) - 595.28) < 2 && Math.abs(Number(box[2]) - 841.89) < 2, `${lang}: A4 portrait, got ${box[1]}×${box[2]}`)
    const pages = (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length
    assert.ok(pages >= 7, `${lang}: cover, imprint, contents, three plates and the appendix (${pages})`)
    // Print engine V1.2: the renderer laid out every page, so Chrome prints exactly one PDF page per sheet.
    assert.equal(pages, await page.eval<number>(`document.querySelectorAll('.bk-sheet').length`), `${lang}: one PDF page per sheet (no spill, no orphan page)`)
    assert.ok(text.includes('/FontFile2') || text.includes('/FontFile'), `${lang}: fonts are embedded`)
    if (shots) fs.writeFileSync(path.join(shots, `identity-print-${lang}.pdf`), pdf)
    await page.send('Emulation.setEmulatedMedia', { media: 'print' })
    const book = await page.eval<{ overflow: number[]; toc: Array<[number, number]>; folioSide: Array<[number, string]> }>(`(() => {
      const sheets = [...document.querySelectorAll('.bk-sheet')]
      const overflow = sheets.filter((s) => { const b = s.querySelector('.bk-body'); return b.scrollHeight > b.clientHeight + 1 }).map((s) => Number(s.dataset.folio))
      const toc = [...document.querySelectorAll('.bk-toc a')].map((a) => [Number(a.querySelector('[data-toc-page]').dataset.tocPage), Number(document.querySelector(a.getAttribute('href')).dataset.folio)])
      const folioSide = sheets.filter((s) => s.querySelector('.bk-folio-num')).map((s) => { const r = s.getBoundingClientRect(); const f = s.querySelector('.bk-folio-num').getBoundingClientRect(); return [Number(s.dataset.folio), f.left - r.left < r.width / 2 ? 'left' : 'right'] })
      return { overflow, toc, folioSide }
    })()`)
    await page.send('Emulation.setEmulatedMedia', { media: '' })
    assert.deepEqual(book.overflow, [], `${lang}: no text block overflows its A4 sheet`)
    assert.ok(book.toc.length === 4 && book.toc.every(([shown, actual]) => shown === actual), `${lang}: contents page numbers are the printed folios ${JSON.stringify(book.toc)}`)
    // Folios sit on the outer edge: right on recto in a left-to-right book; mirrored (left on recto) in Persian.
    for (const [folio, side] of book.folioSide) {
      const recto = folio % 2 === 1
      const outer = lang === 'fa' ? (recto ? 'left' : 'right') : recto ? 'right' : 'left'
      assert.equal(side, outer, `${lang} page ${folio}: folio on the outer edge`)
    }
  }
  assert.deepEqual(page.problems, [], 'no console error, exception or CSP violation')
})

test('Brand Book reader (V2.4): four widths, en and fa, light and dark: no overflow, clean CSP, accessible, AA contrast', { skip }, async () => {
  // A do/don't spread and an unapproved owner draft, so both editorial forms are drawn.
  editOutsideStudio(s, SLUG, (engine, root) => {
    approve(engine, root, { 'brand.verbal.voice_pairs': 'Say what happened | Blame the user\nInvite the next step | Lecture the learner' })
    engine.answerQuestion('brand.strategy.vision', 'A calmer classroom everywhere.')
  })
  await s.studio.sync.refresh(SLUG)
  for (const lang of ['en', 'fa'] as const) {
    await page.goto(`${s.url}/brands/${SLUG}/brand/book?lang=${lang}`)
    for (const scheme of ['light', 'dark'] as const) {
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] })
      for (const width of [1440, 1024, 768, 390]) {
        await page.viewport(width, 900, width < 500)
        await page.goto(`${s.url}/brands/${SLUG}/brand/book`)
        await settle()
        const where = `book ${lang} ${scheme} ${width}px`
        const widths = await overflow()
        const wide = widths.scroll > widths.client + 1 ? await page.eval<string[]>(`[...document.querySelectorAll('main *')].filter((el) => !el.closest('.vz-grid-wrap') && el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 6).map((el) => el.tagName + '.' + (el.className.baseVal ?? el.className))`) : []
        assert.ok(widths.scroll <= widths.client + 1, `${where}: page overflow ${widths.scroll} > ${widths.client} ${wide.join(' ')}`)
        assert.equal(await page.eval<number>(`document.querySelectorAll('.vz-bk-chapter').length`), 7, where)
        assert.equal(await page.eval<number>(`document.querySelectorAll('.vz-bk-specimen .vz-plate').length`), 3, `${where}: three specimen plates`)
        // The plate heads step aside inside a chapter; the chapter opener titles the specimen.
        assert.equal(await page.eval<boolean>(`[...document.querySelectorAll('.vz-bk-specimen .vz-plate-head')].every((el) => el.getBoundingClientRect().height === 0)`), true, where)
        assert.ok(await page.eval<boolean>(`document.querySelector('.vz-bk-specimen .vz-construct image').getBoundingClientRect().width > 0`), `${where}: the approved master is drawn`)
        // Ids stay closed behind the toggle.
        assert.equal(await page.eval<boolean>(`[...document.querySelectorAll('.vz-bk-ids')].every((el) => !el.open)`), true, where)
        if (width === 1440) {
          assert.deepEqual(await structureIssues(), [], `${where}: structure`)
          assert.deepEqual(await contrastFailures('.vz-bk'), [], `${where}: contrast`)
        }
        if (shots && [1440, 390].includes(width)) {
          fs.mkdirSync(shots, { recursive: true })
          await page.screenshot(path.join(shots, `book-${lang}-${scheme}-${width}.png`))
        }
      }
    }
  }
  await page.send('Emulation.setEmulatedMedia', { features: [] })
  await page.viewport(1440, 900)
  assert.deepEqual(page.problems, [], 'no console error, exception or CSP violation')
})
