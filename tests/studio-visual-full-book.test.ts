import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { FIXTURE_DRAFT_SENTINEL, FIXTURE_RESTRICTED_SENTINEL, fullBookText, illustrativeBook, VISUAL_LANGS, visualCatalog, type BookKind, type VisualLang } from '@brand-os/brand-core/visual'
import { html } from '../apps/studio/src/views/html.js'
import { fullBookDocument, fullBookGalley, layoutFullBook } from '../apps/studio/src/views/visual-print-full.js'
import { exportVisual, ExportError } from '../scripts/export-visual.js'

/**
 * Visual V4.2: the full Brand Book and the Business Report on the V1.2 book engine. Cover, imprint, contents whose
 * numbers are the printed folios (localized digits), running heads, the identity plates renumbered in the book,
 * designed "not yet available" pages, the ILLUSTRATIVE stamp on every page, no draft or restricted value anywhere,
 * technical ids only in the appendix, and the `brand:export-visual --doc brand-book|business-report` path.
 * The Chrome checks (screenshots, PDF text and fonts) are in studio-visual-qa.test.ts.
 */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-full-book-'))
after(() => fs.rmSync(tmp, { recursive: true, force: true }))

const KINDS: BookKind[] = ['brand_book', 'business_report']
const input = (kind: BookKind, lang: VisualLang, audience: 'internal' | 'public' = 'internal') => ({ book: illustrativeBook(kind, lang, audience), lang, commit: 'abcdef0123456789abcdef0123456789abcdef01', head: html``, toolbar: html``, assetUrl: () => null })

function sheets(page: string): string[] {
  return page.split('<section class="bk-sheet ').slice(1)
}

const digit = (lang: VisualLang, n: number) => new Intl.NumberFormat(lang, { useGrouping: false }).format(n)

test('full books: cover, imprint, contents with the printed folios, every chapter, stamps on every page', () => {
  for (const kind of KINDS) {
    for (const lang of VISUAL_LANGS) {
      const t = fullBookText(lang)
      const layout = layoutFullBook(input(kind, lang))
      const { html: doc, pageCount } = fullBookDocument(input(kind, lang))
      const page = doc.value
      const all = sheets(page)
      assert.equal(all.length, pageCount, `${kind} ${lang}: one sheet per page`)
      assert.match(page, new RegExp(`<html lang="${lang}" dir="${lang === 'fa' ? 'rtl' : 'ltr'}"`))
      assert.ok(all[0]!.includes(t.book[kind].title), `${kind} ${lang}: cover title`)
      assert.ok(all[2]!.includes('bk-contents--compact'), 'the long contents uses the compact rows')
      // Contents: every chapter and the appendix, each pointing at the sheet where the section starts.
      assert.equal(layout.sections.length, illustrativeBook(kind, lang).chapters.length + 1)
      for (const section of layout.sections) {
        const folio = layout.firstPage.get(section.id)!
        assert.ok(all[2]!.includes(`href="#bk-p${folio}"`) && all[2]!.includes(`>${digit(lang, folio)}</span>`), `${kind} ${lang}: contents names page ${folio} for ${section.id}`)
        assert.ok(all[folio - 1]!.includes(section.title.replaceAll('’', '&#39;').slice(0, 6)) || all[folio - 1]!.includes(section.title.slice(0, 6)), `${kind} ${lang}: ${section.id} starts on page ${folio}`)
      }
      // Every page from the contents on prints its folio in the reader's digits, and every page is stamped.
      all.forEach((sheet, i) => {
        if (i >= 2) assert.ok(sheet.includes(`<span class="bk-folio-num" aria-label="`) && sheet.includes(`>${digit(lang, i + 1)}</span></footer>`), `${kind} ${lang}: folio ${i + 1}`)
        if (i >= 3) assert.ok(sheet.includes(visualCatalog(lang).text.illustrative), `${kind} ${lang}: page ${i + 1} is stamped`)
      })
      assert.ok(all[0]!.includes(visualCatalog(lang).text.illustrative), 'cover stamped')
      // Chapter numbers use the reader's digits (Persian digits in fa).
      if (lang === 'fa') assert.ok(page.includes('<span class="bk-toc-num">۰۱</span>'), 'fa: Persian chapter numbers')
      assert.equal(/\sstyle=|<script/i.test(page), false, `${kind} ${lang}: no inline style or script (strict CSP)`)
    }
  }
})

test('full books: never a draft or restricted value, in any language or edition, also in the galley', () => {
  for (const kind of KINDS) {
    for (const lang of VISUAL_LANGS) {
      for (const audience of ['internal', 'public'] as const) {
        const page = fullBookDocument(input(kind, lang, audience)).html.value + fullBookGalley(input(kind, lang, audience)).value
        assert.equal(page.includes(FIXTURE_DRAFT_SENTINEL), false, `${kind} ${lang} ${audience}: draft value`)
        assert.equal(page.includes(FIXTURE_RESTRICTED_SENTINEL), false, `${kind} ${lang} ${audience}: restricted value`)
        const t = fullBookText(lang)
        if (audience === 'public') {
          assert.equal(page.includes(t.draftNotPrinted), false, `${kind} ${lang}: public shows no draft mark`)
          assert.equal(page.includes(t.withheldNotPrinted), false, `${kind} ${lang}: public shows no restricted mark`)
        }
      }
    }
  }
  const internal = fullBookDocument(input('business_report', 'en')).html.value
  assert.ok(internal.includes(fullBookText('en').withheldNotPrinted), 'internal: the restricted figure is named as never printed')
  assert.ok(internal.includes(fullBookText('en').draftNotPrinted), 'internal: the draft is named as awaiting approval')
})

test('full books: designed not-yet-available pages, renumbered identity plates, ids only in the appendix', () => {
  const page = fullBookDocument(input('brand_book', 'en')).html.value
  const all = sheets(page)
  const t = fullBookText('en')
  for (const chapter of ['Mascot', 'Motion', 'Applications']) assert.ok(page.includes(`${chapter} is not in this edition yet`), chapter)
  assert.ok(page.includes(t.unavailable.planned) && page.includes('Studio, Assets, Mascot atlas, Print'))
  // The colour plate is chapter 04 of the full book (01 in the identity chapter on its own).
  const colour = all.find((sheet) => sheet.includes('id="vi-color-t"') || sheet.includes('vi-color'))
  assert.ok(colour && colour.includes('<p class="vz-plate-num"><span>04</span>'), 'colour plate numbered 04')
  const appendix = all.findIndex((sheet) => sheet.includes('bk-sheet--appendix') || sheet.startsWith('bk-recto bk-sheet--appendix') || sheet.startsWith('bk-verso bk-sheet--appendix'))
  assert.ok(appendix > 3)
  for (const sheet of all.slice(0, appendix)) assert.equal(/business\.|brand\.(strategy|verbal|gov|color|type|logo)\./.test(sheet.replace(/aria-label="[^"]*"/g, '')), false, 'no question id before the appendix')
  assert.ok(all.slice(appendix).join('').includes('brand.strategy.purpose'), 'the appendix lists the ids')
})

test('brand:export-visual --doc brand-book|business-report writes self-contained HTML; unknown docs are refused', () => {
  for (const doc of ['brand-book', 'business-report'] as const) {
    const results = exportVisual({ root: process.cwd(), doc, langs: ['en', 'fa'], edition: 'internal', profile: null, out: path.join(tmp, 'out'), fixture: true, pdf: false, chrome: null, log: () => {} })
    assert.equal(results.length, 2)
    for (const result of results) {
      const page = fs.readFileSync(result.html, 'utf8')
      assert.ok(path.basename(result.html).startsWith(`${doc}.internal.`))
      assert.ok(page.includes('data:font/woff2;base64,'), 'fonts embedded')
      assert.ok(page.includes('.fb-entry'), 'full-book styles included')
      assert.equal(page.includes(FIXTURE_RESTRICTED_SENTINEL), false)
    }
  }
  assert.throws(() => exportVisual({ root: process.cwd(), doc: 'brand-book', langs: ['en'], edition: 'internal', profile: 'canvas_a3_landscape', out: path.join(tmp, 'x'), fixture: true, pdf: false, chrome: null, log: () => {} }), (error: unknown) => error instanceof ExportError && error.code === 'usage')
  // The Business Report is the business plan as a book: never public, not even the fixture.
  assert.throws(() => exportVisual({ root: process.cwd(), doc: 'business-report', langs: ['fa'], edition: 'public', profile: null, out: path.join(tmp, 'p'), fixture: true, pdf: false, chrome: null, log: () => {} }), (error: unknown) => error instanceof ExportError && error.code === 'usage' && error.message.includes('--edition internal'))
  assert.throws(() => exportVisual({ root: process.cwd(), doc: 'business-report', langs: ['en'], edition: 'internal', profile: null, out: 'brand/out', fixture: true, pdf: false, chrome: null, log: () => {} }), (error: unknown) => error instanceof ExportError && error.code === 'path')
})

test('full books: an approved list prints as items (labelled choices, page-language numbers), never an item id or a draft item', () => {
  const expected = { en: ['Working adults changing jobs', 'Primary', '01'], fa: ['بزرگسالان شاغل در حال تغییر شغل', 'اصلی', '۰۱'], tr: ['İş değiştiren çalışan yetişkinler', 'Birincil', '01'] } as const
  for (const lang of VISUAL_LANGS) {
    for (const audience of ['internal', 'public'] as const) {
      const page = fullBookDocument(input('business_report', lang, audience)).html.value
      const [name, priority, num] = expected[lang]
      assert.ok(page.includes(`<span class="fb-item-name" dir="auto">${name}</span>`), `${lang} ${audience}: segment printed as an item`)
      assert.ok(page.includes(`<span class="fb-item-tag">${priority}</span>`), `${lang} ${audience}: choice printed with its ${lang} label`)
      assert.ok(page.includes(`<span class="fb-item-num">${num}</span>`), `${lang} ${audience}: item numbered in the page language`)
      assert.equal(/\b(seg|act|res|cost)-\d+\b/.test(page), false, `${lang} ${audience}: no item id is printed`)
      for (const draft of ['Lesson production', 'Cloud hosting', 'تولید درس', 'Ders üretimi']) assert.equal(page.includes(draft), false, `${lang} ${audience}: draft item ${draft} not printed`)
    }
  }
})
