import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'
import { FIXTURE_DRAFT_SENTINEL, FIXTURE_RESTRICTED_SENTINEL, fullBookText, illustrativeBook, illustrativeVisualIdentity, visualCatalog, type VisualLang } from '@brand-os/brand-core/visual'
import { html } from '../apps/studio/src/views/html.js'
import { layoutIdentityBook } from '../apps/studio/src/views/visual-print-book.js'
import { layoutFullBook } from '../apps/studio/src/views/visual-print-full.js'
import { exportVisual } from '../scripts/export-visual.js'
import { Browser, findChrome, type Page } from './helpers/browser.js'
import { removeTempDir, teardown, tempDir } from './helpers/cleanup.js'
import { decodePng, diffImages, downscale, encodePng, readPdf, squash, type Image } from './helpers/visual-qa.js'

/**
 * Visual Blueprint V1.3: visual QA in a real headless Chrome, on the ILLUSTRATIVE / MOCK DATA fixtures only.
 *
 * 1. Reference screenshots. The A3 Business Model Canvas and the A4 Brand Book "Visual identity" chapter (cover,
 *    contents, colour plate), en and fa, rendered through `brand:export-visual` (print media, built-in heights, so
 *    the layout is deterministic) and compared with the committed baselines in tests/visual-baselines/. Fonts are
 *    awaited and checked, animation and transitions are off, text is rasterised without hinting or sub-pixel AA.
 *    The comparison is tolerant: both images are averaged over 2 × 2 blocks, a pixel counts as changed when one
 *    channel moves by more than TOLERANCE, and a page fails when more than MAX_CHANGED of its pixels changed.
 *    On a mismatch the actual image, the baseline and a diff image (changes in red) are written to dist/visual-qa/
 *    (or VISUAL_QA_OUT) and the failure names them. Update the baselines with `npm run visual:baselines`.
 * 2. Digital PDF. The book is exported to PDF by the V1.2 path (measured two-pass layout) and read back: headings,
 *    contents entries and folios are in the text (Persian digits in fa), every contents number points at the page
 *    holding that section, and every font is embedded, including the bundled OFL Inter, Rajdhani and Vazirmatn.
 *    No bleed, crop marks or PDF/X: this is a digital PDF and the test claims nothing more.
 * 3. RTL. fa pages are dir=rtl; headings neither overflow nor break inside a word; contents leaders and page numbers
 *    and folios are mirrored; the canvas keeps its canonical left-to-right topology in every language.
 *
 * Skips without Chrome (STUDIO_E2E_REQUIRED=1 makes that a failure). Runs in the Studio (Chrome) CI job.
 */
const chrome = findChrome()
if (!chrome && process.env.STUDIO_E2E_REQUIRED === '1') throw new Error('STUDIO_E2E_REQUIRED=1 but no Chrome was found (set CHROME_PATH).')
const skip = chrome ? false : 'no Chrome/Chromium found (set CHROME_PATH); visual QA skipped'

const ROOT = path.resolve(import.meta.dirname, '..')
const BASELINES = path.join(ROOT, 'tests', 'visual-baselines')
const OUT = path.resolve(process.env.VISUAL_QA_OUT ?? path.join(ROOT, 'dist', 'visual-qa'))
const UPDATE = process.env.VISUAL_BASELINES_UPDATE === '1'
/** Block size of the averaging before comparison (and of the stored baselines). */
const SCALE = 2
/** Largest per-channel difference (0–255) that still counts as the same pixel, after averaging. */
const TOLERANCE = 48
/** Share of changed pixels a page may have before it fails. */
const MAX_CHANGED = 0.003
const LANGS = ['en', 'fa'] as const

/** Rendering flags that make text rasterisation the same on every Linux machine with the same Chrome. */
const DETERMINISTIC = ['--font-render-hinting=none', '--disable-lcd-text', '--disable-font-subpixel-positioning', '--force-color-profile=srgb', '--hide-scrollbars', '--allow-file-access-from-files']

/** fonts-liberation, a dependency of the google-chrome package, wherever the distribution puts it. */
const LIBERATION = ['/usr/share/fonts/truetype/liberation', '/usr/share/fonts/truetype/liberation2', '/usr/share/fonts/liberation', '/usr/share/fonts/liberation-sans'].filter((dir) => fs.existsSync(dir))

/**
 * A fontconfig that sees only the Liberation fonts. The pages draw with the bundled web fonts, but a character or a
 * line box can still reach a system fallback, and the fallback differs between machines (the first CI run moved the
 * Persian pages by about 3 %). With this file every machine falls back to the same faces.
 */
function isolatedFontconfig(dir: string): string {
  const file = path.join(dir, 'fonts.conf')
  const alias = (generic: string, family: string) => `<alias><family>${generic}</family><prefer><family>${family}</family></prefer></alias>`
  fs.mkdirSync(path.join(dir, 'fc-cache'), { recursive: true })
  fs.writeFileSync(file, `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>${LIBERATION.map((d) => `<dir>${d}</dir>`).join('')}<cachedir>${path.join(dir, 'fc-cache')}</cachedir>${alias('sans-serif', 'Liberation Sans')}${alias('serif', 'Liberation Serif')}${alias('monospace', 'Liberation Mono')}</fontconfig>\n`)
  return file
}

let browser: Browser
let page: Page
let work: string
const files = new Map<string, string>()

before(async () => {
  if (!chrome) return
  work = tempDir('visual-qa-')
  for (const doc of ['identity', 'bmc', 'brand-book', 'business-report'] as const) {
    const results = exportVisual({ root: ROOT, doc, langs: [...LANGS], edition: 'internal', profile: null, out: path.join(work, 'html'), fixture: true, pdf: false, chrome: null, log: () => {} })
    for (const result of results) files.set(`${doc}.${result.lang}`, result.html)
  }
  // This test file runs in its own process, so the variable reaches only the Chrome instances it starts.
  if (LIBERATION.length) process.env.FONTCONFIG_FILE = isolatedFontconfig(path.join(work, 'fontconfig'))
  browser = await Browser.launch(chrome, DETERMINISTIC)
  page = await browser.newPage()
}, { timeout: 120_000 })

after(async () => {
  if (!chrome) return
  await teardown(
    () => page?.close(),
    () => browser?.close(),
    () => removeTempDir(work),
  )
}, { timeout: 60_000 })

const FREEZE = `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }`

/** Opens an exported page in print media at the given width, waits for its fonts and freezes motion. */
async function open(key: string, width: number): Promise<void> {
  await page.send('Emulation.setEmulatedMedia', { media: 'print', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'light' }] })
  await page.viewport(width, 1200)
  await page.goto(pathToFileURL(files.get(key)!).href)
  await page.eval(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(FREEZE)}; document.head.append(s); return true })()`)
  // Every face the page uses must be loaded before a pixel is compared: a fallback font is a different picture.
  await page.eval(`document.fonts.ready.then(() => Promise.all([...document.fonts].map((f) => f.status === 'unloaded' ? f.load().catch(() => null) : null))).then(() => document.fonts.ready).then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))`)
  const failed = await page.eval<string[]>(`[...document.fonts].filter((f) => f.status === 'error').map((f) => f.family)`)
  assert.deepEqual(failed, [], `${key}: every bundled font face loads`)
}

async function capture(selector: string): Promise<Image> {
  const box = await page.eval<{ x: number; y: number; width: number; height: number } | null>(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height) }
  })()`)
  assert.ok(box && box.width > 0 && box.height > 0, `no element to capture: ${selector}`)
  const result = (await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...box, scale: 1 } }, 60_000)) as { data: string }
  return downscale(decodePng(Buffer.from(result.data, 'base64')), SCALE)
}

/**
 * Compares a capture with its baseline (one retry, so a frame caught mid-paint under load is not a failure).
 * Returns the failure message, or null; the tests compare every page before failing, so one run reports them all.
 */
async function compare(name: string, selector: string): Promise<string | null> {
  const baselineFile = path.join(BASELINES, `${name}.png`)
  let actual = await capture(selector)
  if (UPDATE) {
    fs.mkdirSync(BASELINES, { recursive: true })
    fs.writeFileSync(baselineFile, encodePng(actual))
    return null
  }
  if (!fs.existsSync(baselineFile)) return `no baseline ${path.relative(ROOT, baselineFile)}: run \`npm run visual:baselines\` and review the images before committing them`
  const baseline = decodePng(fs.readFileSync(baselineFile))
  let diff = diffImages(baseline, actual, TOLERANCE)
  if (diff.ratio > MAX_CHANGED) {
    await page.eval('new Promise((r) => setTimeout(r, 500))')
    actual = await capture(selector)
    diff = diffImages(baseline, actual, TOLERANCE)
  }
  if (diff.ratio <= MAX_CHANGED) return null
  fs.mkdirSync(OUT, { recursive: true })
  const written = { actual: path.join(OUT, `${name}.actual.png`), baseline: path.join(OUT, `${name}.baseline.png`), diff: path.join(OUT, `${name}.diff.png`) }
  fs.writeFileSync(written.actual, encodePng(actual))
  fs.copyFileSync(baselineFile, written.baseline)
  fs.writeFileSync(written.diff, encodePng(diff.diff))
  const size = diff.sameSize ? '' : ` (size ${actual.width}×${actual.height}, baseline ${baseline.width}×${baseline.height})`
  return `${name}: ${(diff.ratio * 100).toFixed(2)}% of pixels changed (limit ${(MAX_CHANGED * 100).toFixed(2)}%)${size}.\n  diff: ${written.diff}\n  actual: ${written.actual}\n  baseline: ${written.baseline}`
}

function assertAllMatch(failures: Array<string | null>): void {
  const found = failures.filter((item): item is string => item !== null)
  assert.equal(found.length, 0, `${found.join('\n')}\nIf the change is intended, run \`npm run visual:baselines\` and commit the new images.`)
}

test('reference screenshots: A4 book cover, contents and colour plate, en and fa', { skip }, async (t) => {
  const version = (await page.send('Browser.getVersion')) as { product?: string }
  t.diagnostic(`${version.product ?? 'Chrome'}; fallback fonts: ${LIBERATION.length ? 'Liberation only' : 'system (fonts-liberation not found)'}`)
  const failures: Array<string | null> = []
  for (const lang of LANGS) {
    await open(`identity.${lang}`, 794)
    failures.push(await compare(`book-a4.cover.${lang}`, '#bk-p1'))
    failures.push(await compare(`book-a4.contents.${lang}`, '#bk-p3'))
    failures.push(await compare(`book-a4.chapter-colour.${lang}`, '#bk-p4'))
  }
  assertAllMatch(failures)
  assert.deepEqual(page.problems, [], 'no console error, exception or CSP violation')
})

test('reference screenshots: A3 Business Model Canvas, en and fa', { skip }, async () => {
  const failures: Array<string | null> = []
  for (const lang of LANGS) {
    // The printable width of A3 landscape (420 mm minus 2 × 14 mm margins), as in the print test.
    await open(`bmc.${lang}`, 1482)
    failures.push(await compare(`bmc-a3.canvas.${lang}`, '.vz-page--canvas'))
  }
  assertAllMatch(failures)
  assert.deepEqual(page.problems, [], 'no console error, exception or CSP violation')
})

/** Words split over two lines and boxes wider than their container, for every heading on the page. */
const HEADING_ISSUES = `(() => {
  const issues = []
  const selector = 'h1, h2, h3, h4, .bk-cover-title, .bk-contents-title, .bk-toc-name, .bk-head-title, .bk-continued, .vz-zone-title, .vz-plate-title'
  for (const el of document.querySelectorAll(selector)) {
    const box = el.getBoundingClientRect()
    if (!box.width) continue
    if (el.scrollWidth > el.clientWidth + 1) issues.push('overflow: ' + el.className + ' "' + el.textContent.trim().slice(0, 40) + '"')
    const sheet = el.closest('.bk-sheet, .vz-page')
    if (sheet) { const s = sheet.getBoundingClientRect(); if (box.left < s.left - 1 || box.right > s.right + 1) issues.push('outside its page: ' + el.className) }
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const m of node.data.matchAll(/\\S+/g)) {
        const range = document.createRange()
        range.setStart(node, m.index)
        range.setEnd(node, m.index + m[0].length)
        const lines = new Set([...range.getClientRects()].filter((r) => r.width > 0.5).map((r) => Math.round(r.bottom)))
        if (lines.size > 1) issues.push('word broken over lines: "' + m[0] + '" in ' + el.className)
      }
    }
  }
  return issues
})()`

test('RTL: dir, headings without overflow or broken words, mirrored contents and folios, canonical canvas', { skip }, async () => {
  for (const lang of LANGS) {
    const rtl = lang === 'fa'
    await open(`identity.${lang}`, 794)
    assert.equal(await page.eval<string>('document.documentElement.dir'), rtl ? 'rtl' : 'ltr', `${lang}: book dir`)
    assert.equal(await page.eval<string>('document.documentElement.lang'), lang)
    assert.deepEqual(await page.eval<string[]>(HEADING_ISSUES), [], `${lang}: book headings`)
    // Contents: number, title, leader, page number run in reading order, so in Persian the page number is leftmost.
    const toc = await page.eval<Array<{ name: [number, number]; leader: [number, number]; page: [number, number]; text: string }>>(`[...document.querySelectorAll('.bk-toc-item')].map((li) => {
      const x = (sel) => { const r = li.querySelector(sel).getBoundingClientRect(); return [r.left, r.right] }
      return { name: x('.bk-toc-name'), leader: x('.bk-toc-leader'), page: x('.bk-toc-page'), text: li.querySelector('.bk-toc-page').textContent }
    })`)
    assert.ok(toc.length >= 4, `${lang}: contents entries`)
    for (const item of toc) {
      if (rtl) assert.ok(item.page[1] <= item.leader[0] + 1 && item.leader[1] <= item.name[0] + 1, `fa: page number, leader, title from left to right ${JSON.stringify(item)}`)
      else assert.ok(item.name[1] <= item.leader[0] + 1 && item.leader[1] <= item.page[0] + 1, `en: title, leader, page number from left to right ${JSON.stringify(item)}`)
      assert.match(item.text, rtl ? /^[۰-۹]+$/ : /^[0-9]+$/, `${lang}: contents page numbers in ${rtl ? 'Persian' : 'Latin'} digits`)
    }
    // Folios on the outer edge: recto right in English, left in Persian (binding on the right); verso the opposite.
    const folios = await page.eval<Array<{ folio: number; side: number; text: string }>>(`[...document.querySelectorAll('.bk-sheet')].filter((s) => s.querySelector('.bk-folio-num')).map((s) => {
      const sheet = s.getBoundingClientRect(); const n = s.querySelector('.bk-folio-num').getBoundingClientRect()
      return { folio: Number(s.dataset.folio), side: (n.left + n.right) / 2 - (sheet.left + sheet.right) / 2, text: s.querySelector('.bk-folio-num').textContent }
    })`)
    assert.ok(folios.length >= 5, `${lang}: folios`)
    for (const f of folios) {
      const right = f.folio % 2 === 1 ? !rtl : rtl
      assert.ok(right ? f.side > 0 : f.side < 0, `${lang}: folio ${f.folio} on the outer edge (${right ? 'right' : 'left'})`)
      assert.match(f.text, rtl ? /^[۰-۹]+$/ : /^[0-9]+$/, `${lang}: folio ${f.folio} digits`)
    }

    await open(`bmc.${lang}`, 1482)
    assert.equal(await page.eval<string>('document.documentElement.dir'), rtl ? 'rtl' : 'ltr', `${lang}: canvas dir`)
    assert.deepEqual(await page.eval<string[]>(HEADING_ISSUES), [], `${lang}: canvas headings`)
    // The canvas is a standard framework layout: never mirrored (owner decision), whatever the language.
    const order = await page.eval<number[]>(`['key_partners', 'key_activities', 'value_propositions', 'customer_relationships', 'customer_segments'].map((z) => document.querySelector('.vz-page--canvas .vz-cell--' + z).getBoundingClientRect().left)`)
    for (let i = 1; i < order.length; i += 1) assert.ok(order[i - 1]! < order[i]!, `${lang}: canonical left-to-right canvas ${order.join(',')}`)
    // The canvas grid and its legend stay on the fixed A3 page (overflow there would be clipped in print).
    const clipped = await page.eval<string[]>(`(() => { const page = document.querySelector('.vz-page--canvas').getBoundingClientRect(); return ['.vz-bmc', '.vz-print-under'].filter((sel) => { const r = document.querySelector('.vz-page--canvas ' + sel).getBoundingClientRect(); return r.bottom > page.bottom + 1 || r.right > page.right + 1 }) })()`)
    assert.deepEqual(clipped, [], `${lang}: canvas grid and legend fit the A3 page`)
  }
  assert.deepEqual(page.problems, [], 'no console error, exception or CSP violation')
})

// V1.3 finding, left visible: on the ILLUSTRATIVE fixture (mock banner plus long fixture text) the canvas page's
// footer line is pushed about 7 mm below the fixed A3 page and clipped in print. Real Studio data fits (see
// studio-visual-browser.test.ts). Fixing the canvas print layout is outside V1.3; this test turns green when it is.
test('canvas print footer fits the A3 page on the fixture', { skip, todo: 'fixture canvas footer clipped by ~7 mm (V1.3 finding)' }, async () => {
  for (const lang of LANGS) {
    await open(`bmc.${lang}`, 1482)
    const fit = await page.eval<{ scroll: number; client: number }>(`(() => { const el = document.querySelector('.vz-page--canvas'); return { scroll: el.scrollHeight, client: el.clientHeight } })()`)
    assert.ok(fit.scroll <= fit.client + 1, `${lang}: canvas page overflows (${fit.scroll} > ${fit.client})`)
  }
})

/** Persian text in a PDF comes out in visual order and in presentation forms: compare normalized, either direction. */
function pdfHas(text: string, expected: string): boolean {
  // Lower case: running heads print titles in capitals (text-transform), the contents in title case.
  // "هٔ" is often one glyph (ۀ, U+06C0) in the PDF, which NFKC does not map back to ه + hamza: compare without it.
  const fold = (value: string) => value.normalize('NFKC').toLowerCase().replaceAll('\u06C0', '\u0647').replaceAll('\u0654', '')
  const flat = squash(fold(text))
  const want = squash(fold(expected))
  if (flat.includes(want)) return true
  const reversed = [...want].reverse().join('')
  return flat.includes(reversed) || flat.replaceAll('لا', 'ال').includes(reversed)
}

/** Every word of a heading appears on the page (Chrome writes each RTL word as its own run, in visual order). */
function pdfHasWords(text: string, expected: string): boolean {
  return expected.split(/\s+/).filter((word) => squash(word)).every((word) => pdfHas(text, word.replace(/[()،؛.,]/g, '')))
}

const BUNDLED = ['Inter', 'Rajdhani', 'Vazirmatn']

test('digital PDF: headings, contents entries and folios in the text, Persian digits, bundled OFL fonts embedded', { skip, timeout: 600_000 }, async (t) => {
  const out = path.join(work, 'pdf')
  const results = exportVisual({ root: ROOT, doc: 'identity', langs: [...LANGS], edition: 'internal', profile: null, out, fixture: true, pdf: true, chrome, log: () => {} })
  for (const result of results) {
    const lang: VisualLang = result.lang
    const rtl = lang === 'fa'
    assert.ok(result.pdf && fs.existsSync(result.pdf), `${lang}: a PDF`)
    assert.deepEqual(result.overflow, [], `${lang}: no page overflows`)
    const pdf = readPdf(fs.readFileSync(result.pdf))
    assert.equal(pdf.pages.length, result.pages, `${lang}: page count`)
    for (const p of pdf.pages) assert.ok(Math.abs(p.width - 595.28) < 2 && Math.abs(p.height - 841.89) < 2, `${lang}: A4 portrait, got ${p.width}×${p.height}`)

    // The same layout the export used for its contents page: section titles and the page each starts on.
    const doc = illustrativeVisualIdentity('internal', 'complete')
    const cat = visualCatalog(lang)
    const layout = layoutIdentityBook({ doc, lang, commit: null, head: html``, toolbar: html``, assetUrl: () => null })
    const digits = (n: number) => new Intl.NumberFormat(rtl ? 'fa-IR' : 'en-US', { useGrouping: false }).format(n)
    const contents = pdf.pages[2]!.text
    const contentsLines = contents.split('\n').map((line) => line.trim())
    // The page number the printed contents gives each section, read from the exported (measured) HTML.
    const exported = fs.readFileSync(result.html, 'utf8')
    const tocPage = (title: string) => {
      const escaped = title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const m = exported.match(new RegExp(`<span class="bk-toc-name">${escaped}</span>.*?data-toc-page="(\\d+)"`))
      return m ? Number(m[1]) : null
    }
    assert.ok(pdfHasWords(pdf.pages[0]!.text, cat.identity.chapterTitle), `${lang}: cover title "${cat.identity.chapterTitle}"`)
    assert.ok(pdfHas(pdf.pages[0]!.text, 'ILLUSTRATIVE / MOCK DATA'), `${lang}: the fixture is stamped`)
    for (const section of layout.sections) {
      assert.ok(pdfHasWords(contents, section.title), `${lang}: contents lists "${section.title}"`)
      // The page the contents names holds the section's heading (titles are on their first page in the measured pass too).
      const target = pdf.pages.findIndex((p, i) => i >= 3 && pdfHasWords(p.text, section.title)) + 1
      assert.ok(target >= 4, `${lang}: "${section.title}" is printed`)
      // The entry's own number, not just the digit somewhere on the page: a contents off by one page fails here.
      assert.equal(tocPage(section.title), target, `${lang}: the contents entry for "${section.title}" names page ${target}`)
      assert.ok(contentsLines.includes(digits(target)), `${lang}: contents prints page ${digits(target)} for "${section.title}"`)
    }
    // Folios: every page from the contents on carries its number, in the reader's digits.
    pdf.pages.forEach((p, i) => {
      if (i < 2) return
      const lines = p.text.split('\n').map((line) => line.trim())
      assert.ok(lines.includes(digits(i + 1)), `${lang}: page ${i + 1} prints its folio ${digits(i + 1)}`)
    })

    // Fonts: every font in the file is embedded, and the bundled OFL faces the page uses are among them.
    const missing = pdf.fonts.filter((font) => !font.embedded).map((font) => font.name)
    assert.deepEqual(missing, [], `${lang}: every font is embedded`)
    const names = new Set(pdf.fonts.map((font) => font.name.split('-')[0]!))
    for (const family of BUNDLED) assert.ok(names.has(family), `${lang}: ${family} is embedded (fonts: ${[...names].join(', ')})`)
    if (rtl) for (const [i, p] of pdf.pages.entries()) assert.ok(p.fonts.some((name) => name.startsWith('Vazirmatn')), `fa: page ${i + 1} is set in Vazirmatn`)
    const fallback = [...names].filter((name) => !BUNDLED.includes(name))
    if (fallback.length) t.diagnostic(`${lang}: system fonts also embedded (not bundled): ${fallback.join(', ')}`)
  }
})

// ---------------------------------------------------------------------------------------------------------------
// Visual V4.2: the full Brand Book and the Business Report (same engine, same harness, same thresholds).

test('reference screenshots: full Brand Book (cover, contents, a chapter) and Business Report (contents, a chapter), en and fa', { skip }, async () => {
  const failures: Array<string | null> = []
  for (const lang of LANGS) {
    await open(`brand-book.${lang}`, 794)
    failures.push(await compare(`brand-book-a4.cover.${lang}`, '#bk-p1'))
    failures.push(await compare(`brand-book-a4.contents.${lang}`, '#bk-p3'))
    failures.push(await compare(`brand-book-a4.chapter-strategy.${lang}`, '#bk-p5'))
    await open(`business-report.${lang}`, 794)
    failures.push(await compare(`business-report-a4.contents.${lang}`, '#bk-p3'))
    failures.push(await compare(`business-report-a4.chapter-summary.${lang}`, '#bk-p4'))
  }
  assertAllMatch(failures)
  assert.deepEqual(page.problems, [], 'no console error, exception or CSP violation')
})

test('RTL and fit: full books have no overflowing page or heading, mirrored contents in Persian digits', { skip }, async () => {
  for (const doc of ['brand-book', 'business-report'] as const) {
    for (const lang of LANGS) {
      const rtl = lang === 'fa'
      await open(`${doc}.${lang}`, 794)
      assert.equal(await page.eval<string>('document.documentElement.dir'), rtl ? 'rtl' : 'ltr', `${doc} ${lang}: dir`)
      assert.deepEqual(await page.eval<string[]>(HEADING_ISSUES), [], `${doc} ${lang}: headings`)
      // Built-in estimates (no measured pass here): still no page may overflow its text block.
      const overflow = await page.eval<number[]>(`[...document.querySelectorAll('.bk-sheet')].filter((s) => { const b = s.querySelector('.bk-body'); return b && b.scrollHeight > b.clientHeight + 1 }).map((s) => Number(s.dataset.folio))`)
      assert.deepEqual(overflow, [], `${doc} ${lang}: pages overflowing with built-in estimates`)
      const toc = await page.eval<Array<{ name: [number, number]; page: [number, number]; text: string }>>(`[...document.querySelectorAll('.bk-toc-item')].map((li) => {
        const x = (sel) => { const r = li.querySelector(sel).getBoundingClientRect(); return [r.left, r.right] }
        return { name: x('.bk-toc-name'), page: x('.bk-toc-page'), text: li.querySelector('.bk-toc-page').textContent }
      })`)
      assert.ok(toc.length >= 10, `${doc} ${lang}: contents entries (${toc.length})`)
      for (const item of toc) {
        assert.ok(rtl ? item.page[1] <= item.name[0] : item.name[1] <= item.page[0], `${doc} ${lang}: contents order ${JSON.stringify(item)}`)
        assert.match(item.text, rtl ? /^[۰-۹]+$/ : /^[0-9]+$/, `${doc} ${lang}: contents digits`)
      }
    }
  }
  assert.deepEqual(page.problems, [], 'no console error, exception or CSP violation')
})

test('digital PDF: full books, contents point at the printed pages, folios, fonts embedded, no draft or restricted value', { skip, timeout: 900_000 }, async (t) => {
  const out = path.join(work, 'pdf-full')
  for (const doc of ['brand-book', 'business-report'] as const) {
    const kind = doc === 'brand-book' ? 'brand_book' : 'business_report'
    const results = exportVisual({ root: ROOT, doc, langs: [...LANGS], edition: 'internal', profile: null, out, fixture: true, pdf: true, chrome, log: () => {} })
    for (const result of results) {
      const lang: VisualLang = result.lang
      const rtl = lang === 'fa'
      assert.ok(result.pdf && fs.existsSync(result.pdf), `${doc} ${lang}: a PDF`)
      assert.deepEqual(result.overflow, [], `${doc} ${lang}: no page overflows after measuring`)
      const pdf = readPdf(fs.readFileSync(result.pdf))
      assert.equal(pdf.pages.length, result.pages, `${doc} ${lang}: page count`)
      for (const p of pdf.pages) assert.ok(Math.abs(p.width - 595.28) < 2 && Math.abs(p.height - 841.89) < 2, `${doc} ${lang}: A4 portrait`)
      const all = pdf.pages.map((p) => p.text).join('\n')
      assert.equal(all.includes(FIXTURE_DRAFT_SENTINEL) || all.includes('DRAFT-SENTINEL'), false, `${doc} ${lang}: no draft value in the PDF`)
      assert.equal(all.includes('RESTRICTED-SENTINEL') || all.includes('4,200,000'), false, `${doc} ${lang}: no restricted value in the PDF`)
      assert.equal(FIXTURE_RESTRICTED_SENTINEL.includes('RESTRICTED-SENTINEL'), true)
      assert.ok(pdfHasWords(pdf.pages[0]!.text, fullBookText(lang).book[kind].title), `${doc} ${lang}: cover title`)
      assert.ok(pdfHas(pdf.pages[0]!.text, 'ILLUSTRATIVE / MOCK DATA'), `${doc} ${lang}: the fixture is stamped`)
      const digits = (n: number) => new Intl.NumberFormat(rtl ? 'fa-IR' : 'en-US', { useGrouping: false }).format(n)
      const layout = layoutFullBook({ book: illustrativeBook(kind, lang), lang, commit: null, head: html``, toolbar: html``, assetUrl: () => null })
      const contents = pdf.pages[2]!.text
      for (const section of layout.sections) {
        assert.ok(pdfHasWords(contents, section.title), `${doc} ${lang}: contents lists "${section.title}"`)
        // The appendix's printed heading is the sources table title; its running head is only on recto pages.
        const heading = section.id === 'appendix' ? visualCatalog(lang).text.sourcesTitle : section.title
        const target = pdf.pages.findIndex((p, i) => i >= 3 && pdfHasWords(p.text, heading)) + 1
        assert.ok(target >= 4, `${doc} ${lang}: "${section.title}" is printed`)
        assert.ok(pdfHas(contents, digits(target)), `${doc} ${lang}: contents shows page ${digits(target)} for "${section.title}"`)
      }
      pdf.pages.forEach((p, i) => {
        if (i < 2) return
        assert.ok(p.text.split('\n').map((line) => line.trim()).includes(digits(i + 1)), `${doc} ${lang}: page ${i + 1} prints its folio ${digits(i + 1)}`)
      })
      assert.deepEqual(pdf.fonts.filter((font) => !font.embedded).map((font) => font.name), [], `${doc} ${lang}: every font is embedded`)
      const names = new Set(pdf.fonts.map((font) => font.name.split('-')[0]!))
      // The Brand Book's type specimens use all three faces. The report uses Inter with Rajdhani for display in
      // en, and Vazirmatn for both in fa (the Persian display face is Vazirmatn, owner decision).
      const expected = doc === 'brand-book' ? BUNDLED : rtl ? ['Inter', 'Vazirmatn'] : ['Inter', 'Rajdhani']
      for (const family of expected) assert.ok(names.has(family), `${doc} ${lang}: ${family} embedded (fonts: ${[...names].join(', ')})`)
      if (rtl) for (const [i, p] of pdf.pages.entries()) assert.ok(p.fonts.some((name) => name.startsWith('Vazirmatn')), `${doc} fa: page ${i + 1} is set in Vazirmatn`)
      const fallback = [...names].filter((name) => !BUNDLED.includes(name))
      if (fallback.length) t.diagnostic(`${doc} ${lang}: system fonts also embedded (not bundled): ${fallback.join(', ')}`)
    }
  }
})
