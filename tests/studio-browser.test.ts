import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { Browser, findChrome, type Page } from './helpers/browser.js'
import { teardown } from './helpers/cleanup.js'
import { approve, editOutsideStudio } from './helpers/edits.js'
import { freshTotp, OWNER_LOGIN, OWNER_PASSWORD, startStudio, type RunningStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'
import { newNoteId, serializeNote } from '@brand-os/brand-core'

/**
 * Browser end-to-end tests: a real headless Chrome drives Studio (loopback server, in-memory GitHub,
 * no network). They cover what HTTP-level tests cannot: the progressive-enhancement script, focus and
 * keyboard behavior, CSP enforcement in a real engine, responsive layout and RTL mirroring.
 *
 * Without Chrome they skip with a reason; STUDIO_E2E_REQUIRED=1 turns a missing browser into a failure.
 * STUDIO_E2E_SCREENSHOTS=<dir> saves desktop/tablet/mobile screenshots in English and Persian for review.
 */
const chrome = findChrome()
if (!chrome && process.env.STUDIO_E2E_REQUIRED === '1') throw new Error('STUDIO_E2E_REQUIRED=1 but no Chrome was found (set CHROME_PATH).')
const skip = chrome ? false : 'no Chrome/Chromium found (set CHROME_PATH); browser E2E skipped'
const shots = process.env.STUDIO_E2E_SCREENSHOTS ? path.resolve(process.env.STUDIO_E2E_SCREENSHOTS) : null

let browser: Browser
let s: RunningStudio
let page: Page

before(async () => {
  if (!chrome) return
  browser = await Browser.launch(chrome)
  s = await startStudio()
  page = await browser.newPage()
  await page.viewport(1440, 900)
}, { timeout: 120_000 })

after(async () => {
  if (!chrome) return
  // Every step runs even if one fails: a server left listening keeps the test process alive.
  await teardown(
    () => page?.close(),
    () => browser?.close(),
    () => s?.close(),
  )
}, { timeout: 60_000 })

/** Every page must render with no console error, uncaught exception or CSP violation. */
function assertClean(where: string): void {
  assert.deepEqual(page.problems, [], `${where}: browser problems`)
}

async function text(selector: string): Promise<string> {
  return page.eval<string>(`(document.querySelector(${JSON.stringify(selector)})?.textContent ?? '').replace(/\\s+/g, ' ').trim()`)
}

/** No horizontal scrolling: nothing may overflow the viewport width. */
async function assertNoOverflow(where: string): Promise<void> {
  const widths = await page.eval<{ scroll: number; client: number }>(`({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth })`)
  assert.ok(widths.scroll <= widths.client + 1, `${where}: horizontal overflow ${widths.scroll} > ${widths.client}`)
}

/** Static accessibility checks run in the rendered DOM. */
async function assertAccessible(where: string): Promise<void> {
  const issues = await page.eval<string[]>(`(() => {
    const issues = []
    const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim() || [...el.querySelectorAll('img[alt]')].map((i) => i.alt).join('')
    for (const el of document.querySelectorAll('button, a[href]')) if (!name(el) && !el.querySelector('.visually-hidden')) issues.push('unnamed control: ' + el.outerHTML.slice(0, 120))
    for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
      const labelled = el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')
      if (!labelled) issues.push('unlabelled field: ' + el.outerHTML.slice(0, 120))
    }
    for (const el of document.querySelectorAll('img')) if (!el.hasAttribute('alt')) issues.push('img without alt: ' + el.outerHTML.slice(0, 120))
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id)
    for (const id of new Set(ids)) if (ids.filter((x) => x === id).length > 1) issues.push('duplicate id: ' + id)
    if (document.querySelectorAll('h1').length !== 1) issues.push('expected exactly one h1, found ' + document.querySelectorAll('h1').length)
    if (!document.documentElement.lang) issues.push('no lang on html')
    if (!document.querySelector('main')) issues.push('no main landmark')
    return issues
  })()`)
  assert.deepEqual(issues, [], `${where}: accessibility issues`)
}

async function capture(name: string): Promise<void> {
  if (!shots) return
  for (const [label, width, height, mobile] of [['desktop', 1440, 900, false], ['tablet', 1024, 768, false], ['mobile', 390, 844, true]] as const) {
    await page.viewport(width, height, mobile)
    await page.screenshot(path.join(shots, `${name}-${label}.png`))
  }
  await page.viewport(1440, 900)
}

test('owner journey in a real browser: sign in, step through the wizard, watch provisioning, copy the starter prompt', { skip }, async () => {
  await page.goto(`${s.url}/brands`)
  assert.match(await page.eval<string>('location.pathname'), /^\/login$/)
  await assertAccessible('login')
  assert.equal(await page.eval<boolean>(`(() => { const img = document.querySelector('.plain-aside .product-logo'); return img.complete && img.naturalWidth > 0 && img.alt === 'Omid Ataei' })()`), true, 'the sign-in page shows the omidataei.com logo')
  assert.deepEqual(await contrastFailures(), [], 'login: text contrast')
  await capture('login')
  await page.type('#login', OWNER_LOGIN)
  await page.type('#password', OWNER_PASSWORD)
  await page.type('#totp', await freshTotp(s.url))
  await page.navigation(() => page.click('button[type=submit]'))
  assert.equal(await page.eval<string>('location.pathname'), '/brands')
  assert.match(await text('main'), /No brands yet/)
  await assertAccessible('brands (empty)')
  await capture('brands-empty')
  assertClean('sign-in')

  await page.navigation(() => page.click('main a[href="/brands/new"]'))
  // The script turns the form into steps: only the first is visible, with Next/Back navigation.
  await page.waitFor(`!document.querySelector('[data-wizard-nav]').hidden`)
  assert.deepEqual(await page.eval<boolean[]>(`[...document.querySelectorAll('[data-step]')].map((s) => s.hidden)`), [false, true, true, true, true])
  await assertAccessible('wizard')
  await capture('wizard')
  // Next refuses an empty required name, using the browser's own validation.
  await page.click('[data-wizard-next]')
  assert.equal(await page.eval<boolean>(`document.querySelector('[data-step="basics"]').hidden`), false)
  await page.type('#name', 'Acme Learning')
  assert.equal(await page.eval<string>(`document.querySelector('#slug').value`), 'acme-learning', 'the slug follows the name')
  await page.click('[data-wizard-next]')
  assert.equal(await page.eval<boolean>(`document.querySelector('[data-step="profile"]').hidden`), false)
  assert.equal(await page.eval<string>('document.activeElement.name'), 'profile', 'focus moves into the new step')
  // Identity questions: the change depth appears only for refine / rebrand, and hiding it clears it.
  const depthCollapsed = () => page.eval<string>(`document.querySelector('[data-change-depth]').getAttribute('data-collapsed')`)
  const checkedValue = (name: string) => page.eval<string | null>(`document.querySelector('input[name="${name}"]:checked')?.value ?? null`)
  assert.equal(await depthCollapsed(), 'true')
  assert.equal(await checkedValue('logo_presence'), 'unknown')
  await page.click('input[name="logo_presence"][value="present"]')
  await page.click('input[name="identity_intent"][value="evolve"]')
  assert.equal(await depthCollapsed(), 'false')
  assert.equal(await checkedValue('change_depth'), 'undecided', 'a newly shown depth starts at undecided')
  await page.click('input[name="change_depth"][value="strategic_rebrand"]')
  await page.click('input[name="identity_intent"][value="retain"]')
  assert.equal(await depthCollapsed(), 'true')
  assert.equal(await checkedValue('change_depth'), null, 'a hidden depth is cleared, not submitted')
  await page.click('input[name="identity_intent"][value="evolve"]')
  await page.click('input[name="change_depth"][value="visual_refresh"]')
  await assertAccessible('wizard identity questions')
  await page.click('[data-wizard-next]')
  await page.click('[data-wizard-next]')
  assert.equal(await page.eval<string>(`document.querySelector('#repo').value`), 'acme-learning')
  await page.click('[data-wizard-next]')
  assert.equal(await text('[data-review-field="repo"]'), `${OWNER}/acme-learning`)
  assert.equal(await text('[data-review-field="profile"]'), 'Business or startup')
  assert.equal(await text('[data-review-field="logo_presence"]'), 'We have a logo')
  assert.equal(await text('[data-review-field="identity_intent"]'), 'Refine it')
  assert.equal(await text('[data-review-field="change_depth"]'), 'Wider visual refresh')
  assert.equal(await page.eval<boolean>(`document.querySelector('[data-wizard-next]').hidden`), true)
  await page.navigation(() => page.click('[data-submit]'))
  assert.equal(await page.eval<string>('location.pathname'), '/brands/acme-learning/provisioning')
  // Provisioning runs against the in-memory GitHub; the page polls its JSON and reloads when done.
  await s.studio.provisioning.settled()
  await page.waitFor(`document.querySelector('[data-provisioning]')?.getAttribute('data-state') === 'ready'`, 20_000)
  await s.studio.sync.settled()
  assert.match(await text('main'), /The private repository is ready/)
  assert.equal(s.github.repo(OWNER, 'acme-learning')?.private, true)
  assert.deepEqual(s.studio.registry.get('acme-learning')?.provisioning?.request.identity, { logo_presence: 'present', identity_intent: 'evolve', change_depth: 'visual_refresh' })
  await assertAccessible('provisioning')
  await capture('provisioning-ready')

  // Copy buttons put the exact text on the clipboard (or select it) and announce the result.
  await page.click('[data-copy-target]')
  await page.waitFor(`document.querySelector('[data-toast-region] .toast')`)
  assert.match(await text('[data-toast-region]'), /Copied|Press/)
  assertClean('wizard and provisioning')
})

test('every brand page renders cleanly, without overflow, at desktop, tablet and mobile widths', { skip }, async () => {
  editOutsideStudio(s, 'acme-learning', (engine, root) => approve(engine, root, { 'brand.strategy.purpose': 'Learning should feel possible.' }))
  await s.studio.sync.refresh('acme-learning')
  const pages = ['', '/brand/book', '/brand/design-system', '/brand/assets', '/strategy/business-plan', '/governance/history', '/governance/github']
  for (const [width, height, mobile] of [[1440, 900, false], [1024, 768, false], [390, 844, true]] as const) {
    await page.viewport(width, height, mobile)
    for (const section of pages) {
      await page.goto(`${s.url}/brands/acme-learning${section}`)
      await assertNoOverflow(`${section || '/'} @${width}`)
      if (width === 1440) await assertAccessible(section || 'overview')
    }
    for (const other of ['/brands', '/brands/new', '/account']) {
      await page.goto(`${s.url}${other}`)
      await assertNoOverflow(`${other} @${width}`)
    }
  }
  await page.viewport(1440, 900)
  for (const section of pages) {
    await page.goto(`${s.url}/brands/acme-learning${section}`)
    await capture(`brand${section.replaceAll('/', '-') || '-overview'}`)
  }
  for (const other of ['brands', 'account']) {
    await page.goto(`${s.url}/${other}`)
    await capture(other)
  }
  // The canonical commit is visible on every brand page.
  const sha = s.studio.sync.get('acme-learning').status.sha!
  await page.goto(`${s.url}/brands/acme-learning`)
  assert.ok((await text('.topbar')).includes(sha.slice(0, 7)))
  assertClean('brand pages')
})

/**
 * WCAG AA text contrast in the rendered page: every visible element with its own text, against the
 * background colours of its ancestors blended together (gradients and images are not counted).
 */
async function contrastFailures(): Promise<string[]> {
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
    for (const el of document.querySelectorAll('body *')) {
      if (!['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
        const style = getComputedStyle(el)
        const box = el.getBoundingClientRect()
        if (box.width === 0 || box.height === 0 || style.visibility === 'hidden' || el.closest('[hidden], [aria-hidden="true"], .visually-hidden, .skip-link')) continue
        const fg = parse(style.color)
        if (!fg) continue
        const bg = background(el)
        const [hi, lo] = [lum(over(fg, bg)), lum(bg)].sort((a, b) => b - a)
        const ratio = (hi + 0.05) / (lo + 0.05)
        const size = parseFloat(style.fontSize)
        const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
        if (ratio < (large ? 3 : 4.5)) failures.push(el.tagName.toLowerCase() + '.' + el.className + ' "' + el.textContent.trim().slice(0, 30) + '" ' + ratio.toFixed(2))
      }
    }
    return failures
  })()`)
}

test('the omidataei.com identity: self-hosted fonts, the logo on sign-in and in the shell, AA contrast in light and dark', { skip }, async () => {
  await page.viewport(1440, 900)
  await page.goto(`${s.url}/brands/acme-learning`)
  assert.equal(await page.eval<string>(`document.querySelector('link[rel=icon]').getAttribute('href')`), '/static/favicon.svg')
  const logo = await page.eval<{ src: string; alt: string; loaded: boolean }>(`(() => { const img = document.querySelector('.sidebar .product-logo'); return { src: img.getAttribute('src'), alt: img.alt, loaded: img.complete && img.naturalWidth > 0 } })()`)
  assert.deepEqual(logo, { src: '/static/logo-omid-ataei-white.svg', alt: 'Omid Ataei', loaded: true }, 'the shell shows the omidataei.com logo')
  await page.eval('document.fonts.ready.then(() => true)')
  const fonts = await page.eval<{ h1: string; body: string; display: boolean; text: boolean }>(`({
    h1: getComputedStyle(document.querySelector('h1')).fontFamily,
    body: getComputedStyle(document.body).fontFamily,
    display: document.fonts.check('600 36px "Studio Rajdhani"'),
    text: [...document.fonts].some((f) => f.family.includes('Studio Inter') && f.status === 'loaded'),
  })`)
  assert.match(fonts.h1, /^"Studio Rajdhani"/, 'headings use the site display face')
  assert.match(fonts.body, /^"Studio Inter"/, 'body text uses Inter')
  assert.ok(fonts.display && fonts.text, 'both faces load from the Studio origin')
  // The active page carries the lime signal.
  assert.equal(await page.eval<string>(`getComputedStyle(document.querySelector('.nav-link.is-active .icon')).color`), 'rgb(213, 254, 0)')

  for (const scheme of ['light', 'dark'] as const) {
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] })
    for (const pathname of ['/brands', '/brands/acme-learning', '/brands/acme-learning/brand/design-system', '/brands/acme-learning/governance/history', '/brands/new', '/account']) {
      await page.goto(`${s.url}${pathname}`)
      assert.deepEqual(await contrastFailures(), [], `${scheme} ${pathname}: text contrast`)
    }
    if (shots) {
      for (const pathname of ['/brands', '/brands/acme-learning']) {
        await page.goto(`${s.url}${pathname}`)
        await page.screenshot(path.join(shots, `${scheme}${pathname.replaceAll('/', '-')}.png`))
      }
    }
  }
  await page.send('Emulation.setEmulatedMedia', { features: [] })

  await page.goto(`${s.url}/brands/acme-learning?lang=fa`)
  await page.eval('document.fonts.ready.then(() => true)')
  assert.match(await page.eval<string>(`getComputedStyle(document.body).fontFamily`), /^"Studio Vazirmatn"/, 'Persian uses Vazirmatn')
  assert.equal(await page.eval<boolean>(`document.fonts.check('400 14px "Studio Vazirmatn"', 'سلام')`), true)
  await page.goto(`${s.url}/brands?lang=en`)
  assertClean('identity')
})

test('keyboard: skip link first, visible focus, and the mobile drawer opens, traps Escape and returns focus', { skip }, async () => {
  await page.viewport(1440, 900)
  await page.goto(`${s.url}/brands/acme-learning`)
  await page.press('Tab')
  assert.equal(await page.eval<string>('document.activeElement.className'), 'skip-link')
  assert.equal(await page.eval<boolean>(`(() => { const r = document.activeElement.getBoundingClientRect(); return r.width > 0 && r.top >= 0 })()`), true, 'the skip link becomes visible on focus')
  await page.press('Enter')
  assert.equal(await page.eval<string>('document.activeElement.id'), 'main')
  await page.press('Tab')
  const outline = await page.eval<string>(`getComputedStyle(document.activeElement).outlineStyle`)
  assert.notEqual(outline, 'none', 'focused controls show a focus ring')

  await page.viewport(390, 844, true)
  await page.goto(`${s.url}/brands/acme-learning/governance/github`)
  const offscreen = await page.eval<boolean>(`(() => { const r = document.getElementById('sidebar').getBoundingClientRect(); return r.right <= 0 || r.left >= innerWidth || getComputedStyle(document.getElementById('sidebar')).visibility === 'hidden' })()`)
  assert.equal(offscreen, true, 'the sidebar is a closed drawer on mobile')
  await page.click('[data-drawer-open]')
  await page.waitFor(`document.getElementById('sidebar').classList.contains('is-open')`)
  assert.equal(await page.eval<string>(`document.querySelector('[data-drawer-open]').getAttribute('aria-expanded')`), 'true')
  assert.equal(await page.eval<boolean>(`document.getElementById('sidebar').contains(document.activeElement)`), true, 'focus moves into the drawer')
  assert.equal(await page.eval<boolean>(`document.querySelector('.main-col').inert`), true, 'the page behind the open drawer is inert')
  // Tabbing past the last control in the drawer never lands on the page behind it.
  for (let step = 0; step < 40; step += 1) await page.press('Tab')
  assert.equal(await page.eval<boolean>(`!document.querySelector('.main-col').contains(document.activeElement)`), true, 'Tab stays out of the inert page')
  await page.press('Escape')
  await page.waitFor(`!document.getElementById('sidebar').classList.contains('is-open')`)
  assert.equal(await page.eval<boolean>(`document.querySelector('.main-col').inert`), false, 'closing the drawer restores the page')
  assert.equal(await page.eval<boolean>(`document.activeElement.matches('[data-drawer-open]')`), true, 'focus returns to the menu button')
  // A drawer left open while the window widens to desktop closes, so the page never stays inert.
  await page.click('[data-drawer-open]')
  await page.waitFor(`document.getElementById('sidebar').classList.contains('is-open')`)
  await page.viewport(1440, 900)
  await page.waitFor(`!document.querySelector('.main-col').inert`)
  await page.viewport(390, 844, true)
  // The handoff copy actions are reachable and usable on a phone.
  await assertNoOverflow('handoff @390')
  assert.equal(await page.eval<number>(`document.querySelectorAll('[data-copy-target]').length`) >= 2, true)
  await page.viewport(1440, 900)
  assertClean('keyboard')
})

test('Persian mirrors the layout right-to-left while code, SHAs and URLs stay left-to-right; Turkish stays LTR', { skip }, async () => {
  await page.viewport(1440, 900)
  await page.goto(`${s.url}/brands/acme-learning?lang=en`)
  const enSidebar = await page.eval<{ left: number; right: number }>(`(() => { const r = document.getElementById('sidebar').getBoundingClientRect(); return { left: r.left, right: r.right } })()`)
  assert.ok(enSidebar.left < 10, 'English: the sidebar is on the left')

  await page.goto(`${s.url}/brands/acme-learning?lang=fa`)
  assert.equal(await page.eval<string>('document.documentElement.dir'), 'rtl')
  const faSidebar = await page.eval<{ left: number; right: number; width: number }>(`(() => { const r = document.getElementById('sidebar').getBoundingClientRect(); return { left: r.left, right: r.right, width: document.documentElement.clientWidth } })()`)
  assert.ok(faSidebar.right > faSidebar.width - 10, 'Persian: the sidebar is mirrored to the right')
  const directions = await page.eval<string[]>(`[...document.querySelectorAll('.mono, code')].map((el) => getComputedStyle(el).direction)`)
  assert.ok(directions.length > 0 && directions.every((dir) => dir === 'ltr'), 'code stays left-to-right inside RTL')
  const align = await page.eval<string>(`getComputedStyle(document.querySelector('h1')).textAlign`)
  assert.ok(align === 'start' || align === 'right', `headings align to the start (right) in RTL, got ${align}`)
  for (const section of ['', '/brand/book', '/brand/design-system', '/governance/github']) {
    await page.goto(`${s.url}/brands/acme-learning${section}`)
    await assertNoOverflow(`fa ${section || '/'}`)
    await capture(`fa-brand${section.replaceAll('/', '-') || '-overview'}`)
  }
  await page.goto(`${s.url}/brands/new`)
  await capture('fa-wizard')
  await page.viewport(390, 844, true)
  await page.goto(`${s.url}/brands/acme-learning`)
  await page.click('[data-drawer-open]')
  await page.waitFor(`document.getElementById('sidebar').classList.contains('is-open')`)
  const drawer = await page.eval<{ left: number; right: number; width: number }>(`(() => { const r = document.getElementById('sidebar').getBoundingClientRect(); return { left: r.left, right: r.right, width: document.documentElement.clientWidth } })()`)
  assert.ok(drawer.right > drawer.width - 2, 'Persian: the mobile drawer opens from the right')
  await page.press('Escape')

  await page.viewport(1440, 900)
  await page.goto(`${s.url}/brands?lang=tr`)
  assert.equal(await page.eval<string>('document.documentElement.dir'), 'ltr')
  assert.equal(await page.eval<string>('document.documentElement.lang'), 'tr')
  await page.goto(`${s.url}/brands?lang=en`)
  assertClean('locales')
})

test('BOS-21: a mixed Persian/English value (parentheses, a file name, a URL) reads in logical order in the English and the Persian UI', { skip }, async () => {
  const mixed = 'Wordmark تیره (logo-omid-ataei-black.svg) برای پس‌زمینهٔ روشن؛ نمونه در https://omidataei.com/work (۲۰۲۴).'
  editOutsideStudio(s, 'acme-learning', (engine, root) => approve(engine, root, { 'brand.strategy.vision': mixed }))
  s.studio.sync.markDirty('acme-learning')
  await s.studio.sync.refresh('acme-learning')
  await page.viewport(1440, 900)
  for (const lang of ['en', 'fa'] as const) {
    await page.goto(`${s.url}/brands/acme-learning/brand/book?lang=${lang}`)
    const layout = await page.eval<{ found: boolean; direction: string; align: string; runs: Array<{ text: string; left: number; right: number; top: number; direction: string; bidi: string }>; openParen: number; closeParen: number }>(`(() => {
      const el = [...document.querySelectorAll('[data-bidi="mixed"]')].find((node) => node.textContent.includes('logo-omid-ataei-black.svg'))
      if (!el) return { found: false, direction: '', align: '', runs: [], openParen: 0, closeParen: 0 }
      const style = getComputedStyle(el)
      const runs = [...el.querySelectorAll('bdi.bidi-run')].map((run) => { const r = run.getBoundingClientRect(); const s = getComputedStyle(run); return { text: run.textContent, left: r.left, right: r.right, top: r.top, direction: s.direction, bidi: s.unicodeBidi } })
      const file = [...el.querySelectorAll('bdi.bidi-run')].find((run) => run.textContent.includes('.svg'))
      const charRect = (node, index) => { const range = document.createRange(); range.setStart(node, index); range.setEnd(node, index + 1); return range.getBoundingClientRect() }
      const before = file.previousSibling
      const after = file.nextSibling
      return { found: true, direction: style.direction, align: style.textAlign, runs, openParen: charRect(before, before.textContent.length - 1).left, closeParen: charRect(after, 0).right }
    })()`)
    assert.ok(layout.found, `${lang}: the mixed value is marked`)
    assert.equal(layout.direction, 'rtl', `${lang}: a mostly Persian value reads right to left inside the ${lang} UI`)
    assert.ok(layout.align === 'start' || layout.align === 'right', `${lang}: Persian keeps RTL alignment, got ${layout.align}`)
    const [wordmark, file, url] = layout.runs
    assert.deepEqual(layout.runs.map((run) => run.text), ['Wordmark', 'logo-omid-ataei-black.svg', 'https://omidataei.com/work'])
    assert.ok(layout.runs.every((run) => run.direction === 'ltr' && run.bidi === 'isolate'), `${lang}: Latin runs are isolated left-to-right`)
    // Logical order in right-to-left lines: a later run sits further left on the same line, or on a later line.
    const follows = (a: { left: number; right: number; top: number }, b: { left: number; right: number; top: number }): boolean => (Math.abs(a.top - b.top) < 3 ? a.left > b.right : b.top > a.top)
    assert.ok(follows(wordmark!, file!), `${lang}: Wordmark comes first (right), then the file name`)
    assert.ok(follows(file!, url!), `${lang}: then the URL`)
    // The parentheses wrap the file name: "(" on its right, ")" on its left.
    assert.ok(layout.openParen >= file!.right - 1, `${lang}: the opening parenthesis precedes the file name`)
    assert.ok(layout.closeParen <= file!.left + 1, `${lang}: the closing parenthesis follows the file name`)
    await assertNoOverflow(`${lang} mixed value`)
    await capture(`${lang}-bidi-mixed`)
  }
  await page.goto(`${s.url}/brands?lang=en`)
  assertClean('mixed fa/en values')
})

test('failed provisioning: Edit and retry is prefilled, the live name check suggests a free name (keyboard, RTL), Discard asks first', { skip }, async () => {
  await page.viewport(1440, 900)
  await page.goto(`${s.url}/brands?lang=en`)
  s.github.addRepo(OWNER, 'beta', new Map([['README.md', Buffer.from('someone else')]]))
  const base = { name: 'Beta Studio', slug: 'beta', profile: 'business' as const, facets: [], default_locale: 'en' as const, locales: ['en' as const], mascot: false, gamification: false, owner: OWNER }
  assert.ok(s.studio.provisioning.start({ ...base, repo: 'beta' }, 'owner').ok)
  await s.studio.provisioning.settled()

  await page.goto(`${s.url}/brands/beta/provisioning`)
  assert.match(await text('main'), /could not be created/)
  await assertAccessible('provisioning failed')
  await page.navigation(() => page.click('[data-edit-retry]'))
  assert.equal(await page.eval<string>('location.pathname + location.search'), '/brands/new?retry=beta')
  assert.match(await text('h1'), /Edit and retry/)
  assert.equal(await page.eval<string>(`document.querySelector('#name').value`), 'Beta Studio')
  assert.equal(await page.eval<string>(`document.querySelector('#repo').value`), 'beta')
  // The prefilled name is checked at once; the result is announced politely and offers a free name.
  await page.waitFor(`document.querySelector('[data-repo-check]').getAttribute('data-state') === 'taken'`)
  assert.equal(await page.eval<string>(`document.querySelector('[data-repo-check]').getAttribute('aria-live')`), 'polite')
  assert.match(await text('[data-repo-check]'), /beta already exists on GitHub\. Try beta-brand\./)
  for (let k = 0; k < 3; k += 1) await page.click('[data-wizard-next]')
  assert.equal(await page.eval<boolean>(`document.querySelector('[data-step="repository"]').hidden`), false)
  await assertAccessible('wizard edit and retry')
  // Keyboard: the suggestion is a real button; Enter applies it and the name is checked again.
  await page.eval(`document.querySelector('[data-use-suggestion]').focus()`)
  await page.press('Enter')
  assert.equal(await page.eval<string>(`document.querySelector('#repo').value`), 'beta-brand')
  assert.equal(await page.eval<string>('document.activeElement.id'), 'repo', 'focus returns to the repository field')
  await page.waitFor(`document.querySelector('[data-repo-check]').getAttribute('data-state') === 'free'`)
  assert.match(await text('[data-repo-check]'), /beta-brand is free\./)
  assertClean('edit and retry')

  // Persian: the message reads right-to-left while the repository names stay isolated left-to-right.
  await page.goto(`${s.url}/brands/new?retry=beta&lang=fa`)
  await page.waitFor(`document.querySelector('[data-repo-check]').getAttribute('data-state') === 'taken'`)
  assert.equal(await page.eval<string>(`getComputedStyle(document.querySelector('[data-repo-check]')).direction`), 'rtl')
  assert.deepEqual(await page.eval<string[]>(`[...document.querySelectorAll('[data-repo-check] bdi')].map((el) => el.dir + ':' + el.textContent)`), ['ltr:beta', 'ltr:beta-brand', 'ltr:beta-brand'])
  await assertNoOverflow('fa edit and retry')
  await capture('fa-wizard-name-taken')
  await page.goto(`${s.url}/brands/new?retry=beta&lang=en`)
  await page.waitFor(`document.querySelector('[data-repo-check]').getAttribute('data-state') === 'taken'`)
  await page.eval(`(() => { const r = document.querySelector('#repo'); r.value = 'beta-brand'; r.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  for (let k = 0; k < 4; k += 1) await page.click('[data-wizard-next]')
  await page.navigation(() => page.click('[data-submit]'))
  assert.equal(await page.eval<string>('location.pathname'), '/brands/beta/provisioning')
  await s.studio.provisioning.settled()
  await page.waitFor(`document.querySelector('[data-provisioning]')?.getAttribute('data-state') === 'ready'`, 20_000)
  await s.studio.sync.settled()
  assert.equal(s.github.repo(OWNER, 'beta-brand')?.private, true)
  assert.ok(s.github.repo(OWNER, 'beta'), 'the repository that was in the way is untouched')

  // Discard: a confirmation page first, then only Studio's record goes; GitHub is never called.
  assert.ok(s.studio.provisioning.start({ ...base, slug: 'gamma', name: 'Gamma', repo: 'beta' }, 'owner').ok)
  await s.studio.provisioning.settled()
  await page.goto(`${s.url}/brands/gamma/provisioning`)
  await page.navigation(() => page.click('[data-discard]'))
  assert.equal(await page.eval<string>('location.pathname'), '/brands/gamma/provisioning/discard')
  assert.match(await text('main'), /Nothing on GitHub is changed or deleted/)
  await assertAccessible('discard confirmation')
  assert.ok(s.studio.registry.get('gamma'), 'opening the confirmation changes nothing')
  const calls = s.github.calls.length
  await page.navigation(() => page.click('[data-discard-confirm]'))
  assert.equal(await page.eval<string>('location.pathname + location.search'), '/brands?discarded=1')
  assert.match(await text('main'), /The failed attempt was discarded/)
  assert.equal(s.studio.registry.get('gamma'), null)
  assert.equal(s.github.calls.length, calls, 'discarding never calls GitHub')
  assertClean('discard')
})

test('the browser enforces the CSP: an injected inline script never runs and no page loads a third-party origin', { skip }, async () => {
  const origins = new Set<string>()
  page.on('Network.requestWillBeSent', (params) => origins.add(new URL((params.request as { url: string }).url).origin))
  await page.send('Network.enable')
  for (const pathname of ['/brands', '/brands/acme-learning', '/brands/acme-learning/brand/design-system', '/brands/acme-learning/brand/assets', '/brands/acme-learning/governance/github', '/account']) await page.goto(`${s.url}${pathname}`)
  assert.deepEqual([...origins], [s.url], 'only the Studio origin is contacted')
  // Even if markup were injected, the CSP (script-src 'self', no inline) stops it from executing.
  await page.eval(`(() => { const el = document.createElement('div'); el.innerHTML = '<img src=x onerror="window.__pwned=1">'; document.body.appendChild(el); const sc = document.createElement('script'); sc.textContent = 'window.__pwned2 = 1'; document.body.appendChild(sc) })()`)
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.equal(await page.eval<unknown>('window.__pwned ?? window.__pwned2 ?? null'), null)
  // Those blocked attempts are exactly the CSP reports we expect; clear them so other checks stay strict.
  assert.ok(page.problems.length > 0 && page.problems.every((problem) => /Content Security Policy|net::ERR|Failed to load/i.test(problem.text)), JSON.stringify(page.problems))
  page.problems.length = 0
  await page.send('Network.disable')
})

test('Knowledge page: shared notes render without overflow, accessibly and with AA contrast in English and Persian, and never fetch note images', { skip }, async () => {
  const id = newNoteId()
  const other = newNoteId()
  const meta = (noteId: string, title: string, language: string, extra: Record<string, unknown> = {}) => ({
    schema_version: 1, id: noteId, brand_slug: 'acme-learning', title, kind: 'idea' as const, status: 'inbox' as const, classification: 'internal' as const, language,
    tags: ['mascot', 'gamification', 'retention'], links: [], question_ids: ['brand.strategy.purpose'], source: { kind: 'owner_note' as const, ref: null },
    created_at: '2026-11-20T10:00:00.000Z', updated_at: '2026-11-21T10:00:00.000Z', ...extra,
  })
  const persian = 'بعد از ۷ روز یادگیری پشت‌سرهم، رتبه‌ی خلبان کاکادو را ارتقا بده. این یک فرضیه است، نه یک قانون تأییدشده.\n' + 'x'.repeat(400) + '\n<img src="https://evil.example/pixel.png"> ![remote](https://evil.example/md.png)'
  s.github.pushEdit(OWNER, 'acme-learning', (tree) => {
    tree.set(`brand/knowledge/shared/${id}.md`, Buffer.from(serializeNote({ meta: meta(id, 'ارتقای رتبه‌ی خلبان کاکادو بعد از هفت روز یادگیری پشت‌سرهم', 'fa'), body: persian })))
    tree.set(`brand/knowledge/shared/${other}.md`, Buffer.from(serializeNote({ meta: meta(other, 'Weekly streak recap', 'en', { status: 'triaged', links: [{ id, relationship: 'supports' }] }), body: `Builds on [[${id}]].` })))
  })
  await s.studio.sync.refresh('acme-learning')
  const origins = new Set<string>()
  page.on('Network.requestWillBeSent', (params) => origins.add(new URL((params.request as { url: string }).url).origin))
  await page.send('Network.enable')
  for (const lang of ['en', 'fa'] as const) {
    await page.viewport(1440, 900)
    await page.goto(`${s.url}/brands/acme-learning/market/knowledge?lang=${lang}`)
    for (const [width, height, mobile] of [[1440, 900, false], [1024, 768, false], [390, 844, true]] as const) {
      await page.viewport(width, height, mobile)
      for (const pathname of ['/knowledge', `/knowledge?note=${id}`, `/knowledge?note=${other}`, '/knowledge?q=kakadu', '/knowledge?tag=mascot']) {
        await page.goto(`${s.url}/brands/acme-learning${pathname}`)
        await assertNoOverflow(`${lang} ${pathname} @${width}`)
        if (width === 1440) {
          await assertAccessible(`${lang} ${pathname}`)
          assert.deepEqual(await contrastFailures(), [], `${lang} ${pathname}: text contrast`)
        }
      }
    }
    await page.viewport(1440, 900)
    await page.goto(`${s.url}/brands/acme-learning/market/knowledge?note=${id}`)
    assert.equal(await page.eval<number>('document.querySelectorAll(".note-body img, .note-body a[href^=\'http\']").length'), 0, 'note markup is text')
    await capture(`${lang}-knowledge-note`)
    await page.goto(`${s.url}/brands/acme-learning/market/knowledge`)
    await capture(`${lang}-knowledge`)
    if (lang === 'fa') assert.equal(await page.eval<string>('document.documentElement.dir'), 'rtl')
  }
  assert.deepEqual([...origins], [s.url], 'only the Studio origin is contacted; note images are never fetched')
  await page.send('Network.disable')
  await page.goto(`${s.url}/brands?lang=en`)
  assertClean('knowledge pages')
})

// Runs last: it moves the shared fake template forward, which changes the overview of every later page.
test('template updates: the indicator is visible, accessible and RTL-safe, and "Open update PR" opens one pull request', { skip }, async () => {
  s.github.pushEdit('omidlog', 'brand-os-template', (tree) => {
    tree.set('.brand-os/sync.json', Buffer.from(JSON.stringify({ schema_version: 1, template: { repository: 'omidlog/brand-os-template' }, record: 'brand/template-version.json', rules: [{ kind: 'brand', paths: ['brand/**'] }, { kind: 'core', paths: ['scripts/**', '.brand-os/**'] }] })))
    tree.set('scripts/fix.ts', Buffer.from('export const fixed = true\n'))
  }, 'fix: template release')
  await s.studio.templateUpdates.templateHead({ force: true })
  await page.viewport(1440, 900)
  await page.goto(`${s.url}/brands?lang=en`)
  assert.match(await text('.brand-card-badges'), /Updates available/)
  await assertAccessible('brands with update')

  await page.goto(`${s.url}/brands/acme-learning`)
  assert.equal(await page.eval<string>(`document.getElementById('template-update').dataset.updateState`), 'available')
  assert.match(await text('#template-update'), /Updates available/)
  assert.equal(await page.eval<string>(`document.querySelector('#template-update button').getAttribute('aria-describedby')`), 'update-hint')
  await assertAccessible('overview with update')
  assert.deepEqual(await contrastFailures(), [], 'update panel: text contrast')
  for (const [width, height, mobile] of [[1024, 768, false], [390, 844, true]] as const) {
    await page.viewport(width, height, mobile)
    await assertNoOverflow(`update panel ${width}`)
  }
  await page.viewport(1440, 900)
  await page.goto(`${s.url}/brands/acme-learning?lang=fa`)
  assert.equal(await page.eval<string>('document.documentElement.dir'), 'rtl')
  assert.match(await text('#template-update'), /به‌روزرسانی موجود است/)
  assert.equal(await page.eval<string>(`getComputedStyle(document.querySelector('#template-update .mono')).direction`), 'ltr')
  await assertNoOverflow('fa update panel')
  await capture('fa-template-update')
  await page.goto(`${s.url}/brands/acme-learning?lang=en`)
  await capture('template-update')

  await page.click('#template-update button[type=submit]')
  await page.waitFor(`location.search.includes('update=opened')`)
  assert.match(await text('#template-update [role=status]'), /Update pull request #1 is open/)
  assert.equal(await page.eval<string>(`document.querySelector('#template-update [role=status] a').getAttribute('href')`), `https://github.com/${OWNER}/acme-learning/pull/1`)
  const repo = s.github.repo(OWNER, 'acme-learning')!
  assert.equal(repo.pulls.length, 1)
  assert.ok(repo.pulls[0]!.head.startsWith('template-update/'))
  assertClean('template update')
})
