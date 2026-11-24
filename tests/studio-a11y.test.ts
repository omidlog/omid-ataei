import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { LOCALES } from '../apps/studio/src/i18n/index.js'
import { Client, startStudio, type RunningStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

/**
 * Structural accessibility and right-to-left checks that need no browser: the stylesheet keeps
 * logical properties, focus and reduced-motion rules, and every rendered page in every locale has
 * one skip link to a focusable main, one h1, labelled navigation landmarks and the right lang/dir.
 * The real-browser checks (focus order, drawer, contrast) live in studio-browser.test.ts.
 */

const CSS = fs.readFileSync(path.join(import.meta.dirname, '..', 'apps', 'studio', 'static', 'studio.css'), 'utf8')
const JS = fs.readFileSync(path.join(import.meta.dirname, '..', 'apps', 'studio', 'static', 'studio.js'), 'utf8')

/** CSS rules as [selector, body] with comments removed; nested @media bodies are flattened. */
function rules(css: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push([match[1]!.trim(), match[2]!])
  return out
}

test('studio.css uses logical properties: no physical left/right except in rules scoped to a direction', () => {
  // Physical property names, or a physical keyword as the value of float/text-align/clear.
  const physical = /(?:^|;)\s*(?:(?:(?:margin|padding|border)-(?:left|right)(?:-\w+)?|left|right)\s*:|(?:float|clear|text-align)\s*:\s*(?:left|right)\b)/
  const offenders = rules(CSS)
    .filter(([selector, body]) => physical.test(body) && !/\[dir=/.test(selector))
    .map(([selector]) => selector)
  assert.deepEqual(offenders, [], 'use inline-start/end, inset-inline or margin-inline instead')
  // Origins and translations that point one way must have a right-to-left counterpart.
  for (const [selector, body] of rules(CSS)) {
    if (/\[dir=/.test(selector)) continue
    const mirrored = (sel: string): boolean => rules(CSS).some(([other]) => other.includes('[dir="rtl"]') && other.includes(sel))
    if (/transform-origin:\s*(left|right)/.test(body) || /translateX\(-?100%\)/.test(body)) {
      const target = selector.split(',')[0]!.trim()
      assert.ok(mirrored(target), `${target} has a one-way origin or translation with no [dir="rtl"] rule`)
    }
  }
})

test('studio.css keeps a visible focus ring, a reduced-motion override and forced-colors support', () => {
  assert.match(CSS, /:focus-visible\s*\{[^}]*outline:\s*2px solid/, 'a global outline-based focus ring')
  for (const [selector, body] of rules(CSS)) {
    if (/outline:\s*(none|0)/.test(body)) {
      // Only programmatic focus targets (tabindex=-1 landmarks) and inputs whose wrapper draws the ring may drop it.
      assert.match(selector, /^\.(main|plain-main):focus$|input:focus-visible$/, `${selector} removes the focus outline`)
    }
  }
  const motion = CSS.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/)
  assert.ok(motion, 'a prefers-reduced-motion block')
  assert.match(motion[1]!, /transition-duration:\s*0\.01ms !important/)
  assert.match(motion[1]!, /animation-duration:\s*0\.01ms !important/)
  assert.match(motion[1]!, /scroll-behavior:\s*auto !important/)
  assert.match(CSS, /@media \(forced-colors: active\)/)
  assert.doesNotMatch(JS, /behavior:\s*['"]smooth['"]/, 'scripted smooth scrolling would ignore the reduced-motion setting')
})

test('the mobile drawer makes the page behind it inert and closes when the window widens', () => {
  assert.match(JS, /behind\.inert = true/)
  assert.match(JS, /behind\.inert = false/)
  assert.match(JS, /matchMedia\('\(min-width: 961px\)'\)/)
  assert.match(CSS, /@media \(max-width: 960px\)/, 'the script breakpoint matches the stylesheet')
})

function landmarks(htmlText: string, where: string): void {
  const skip = htmlText.match(/<a class="skip-link" href="#(\w+)">/g) ?? []
  assert.equal(skip.length, 1, `${where}: one skip link`)
  assert.ok(htmlText.indexOf('class="skip-link"') < htmlText.indexOf('<main'), `${where}: the skip link comes before main`)
  assert.match(htmlText, /<main id="main"[^>]*tabindex="-1"/, `${where}: the skip target is a focusable main`)
  assert.equal((htmlText.match(/<main\b/g) ?? []).length, 1, `${where}: one main landmark`)
  assert.equal((htmlText.match(/<h1\b/g) ?? []).length, 1, `${where}: one h1`)
  for (const nav of htmlText.match(/<nav\b[^>]*>/g) ?? []) assert.match(nav, /aria-label="[^"]+"/, `${where}: unlabelled ${nav}`)
  for (const aside of htmlText.match(/<aside\b[^>]*>/g) ?? []) assert.match(aside, /aria-label="[^"]+"/, `${where}: unlabelled ${aside}`)
  // Headings never skip a level going down (h2 straight to h4).
  let previous = 0
  for (const match of htmlText.matchAll(/<h([1-6])\b/g)) {
    const level = Number(match[1])
    assert.ok(level <= previous + 1, `${where}: h${previous} is followed by h${level}`)
    previous = level
  }
}

async function withStudio(fn: (s: RunningStudio) => Promise<void>): Promise<void> {
  const s = await startStudio()
  try {
    await fn(s)
  } finally {
    await s.close()
  }
}

test('every page in every locale: one skip link to a focusable main, one h1, labelled landmarks, heading order, lang and dir', async () => {
  await withStudio(async (s) => {
    const guest = new Client(s.url)
    const owner = new Client(s.url)
    await owner.login()
    const csrf = await owner.csrf('/brands/new')
    await owner.request('POST', '/brands/new', {
      form: { _csrf: csrf, name: 'Acme Learning', slug: 'acme-learning', profile: 'business', default_locale: 'en', locales: ['en'], owner: OWNER, repo: 'acme-learning' },
    })
    await s.studio.provisioning.settled()
    await s.studio.sync.settled()
    const pages = ['/brands', '/brands/new', '/account', '/brands/acme-learning', '/brands/acme-learning/brand/book', '/brands/acme-learning/brand/design-system', '/brands/acme-learning/brand/assets', '/brands/acme-learning/strategy/business-plan', '/brands/acme-learning/governance/history', '/brands/acme-learning/governance/github', '/brands/acme-learning/provisioning']
    for (const locale of LOCALES) {
      const dir = locale === 'fa' ? 'rtl' : 'ltr'
      await guest.get(`/login?lang=${locale}`)
      const login = await guest.page('/login')
      assert.match(login.text, new RegExp(`<html lang="${locale}" dir="${dir}">`), `${locale} /login`)
      landmarks(login.text, `${locale} /login`)
      await owner.get(`/brands?lang=${locale}`)
      for (const pathname of pages) {
        const { res, text } = await owner.page(pathname)
        if (res.status !== 200) continue // provisioning redirects once the brand is ready
        assert.match(text, new RegExp(`<html lang="${locale}" dir="${dir}">`), `${locale} ${pathname}`)
        landmarks(text, `${locale} ${pathname}`)
      }
    }
  })
})

test('studio.css: links and scrollers inside an overflow-clipping container draw their focus ring inside', () => {
  // `.breadcrumbs ol` clips overflow for the ellipsis; the shared ring (offset 3px) would be cut off.
  assert.match(CSS, /\.breadcrumbs ol \{[^}]*overflow: hidden/)
  for (const selector of ['.breadcrumbs a:focus-visible', '.table-wrap:focus-visible']) {
    const rule = CSS.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? ''
    assert.match(rule, /outline-offset: -\d+px/, `${selector} uses an inset focus ring`)
  }
  assert.match(CSS, /\.chip:hover:not\(\[aria-pressed="true"\]\) \{/, 'filter chips have a hover state')
})
