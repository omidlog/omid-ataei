import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { AGENT_TOKEN_ENV } from '@brand-os/brand-core'
import { BOOK_TEXT, bodyHeightMm, illustrativeBusinessModelCanvas, illustrativeVisualIdentity, PRINT_PROFILE_SPECS, VISUAL_LANGS, type VisualLang } from '@brand-os/brand-core/visual'
import { html, type SafeHtml } from '../apps/studio/src/views/html.js'
import { printDocument } from '../apps/studio/src/views/visual.js'
import { BOOK_BODY_MM, identityBookDocument, layoutIdentityBook, paginate, type BookSection } from '../apps/studio/src/views/visual-print-book.js'
import { brandUncommitted, checkOutput, exportVisual, ExportError, findChrome } from '../scripts/export-visual.js'
import { renderGolden } from '../scripts/visual-golden.js'

/**
 * Visual Blueprint V1.2, print engine profile `book_a4_portrait`: deterministic pagination (headings kept with what
 * follows, tables continued with a repeated header, notes on the page of their reference, no page without body
 * content), a book with cover, imprint, contents whose page numbers are the printed folios, running heads that
 * alternate verso/recto, and the owner's `brand:export-visual` command. The A3 canvas print is unchanged.
 */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-print-book-'))
after(() => fs.rmSync(tmp, { recursive: true, force: true }))

const block = (id: string, mm: number, extra: { keepWithNext?: boolean; notes?: Array<{ n: number; body: SafeHtml }> } = {}) => ({ kind: 'block' as const, id, html: html`<p>${id}</p>`, mm, ...extra })

function book(lang: VisualLang, variant: 'complete' | 'awaiting' = 'complete', edition: 'internal' | 'public' = 'internal'): string {
  return identityBookDocument({ doc: illustrativeVisualIdentity(edition, variant), lang, commit: 'abcdef0123456789abcdef0123456789abcdef01', head: html``, toolbar: html``, assetUrl: () => null }).html.value
}

function sheets(page: string): string[] {
  return page.split('<section class="bk-sheet ').slice(1)
}

test('profiles: book A4 portrait is ready, the canvas profile is kept, the 16:9 deck is a typed stub', () => {
  assert.equal(PRINT_PROFILE_SPECS.book_a4_portrait.status, 'ready')
  assert.deepEqual([PRINT_PROFILE_SPECS.book_a4_portrait.width_mm, PRINT_PROFILE_SPECS.book_a4_portrait.height_mm], [210, 297])
  assert.equal(PRINT_PROFILE_SPECS.canvas_a3_landscape.status, 'ready')
  assert.equal(PRINT_PROFILE_SPECS.deck_16_9.status, 'planned')
  assert.equal(BOOK_BODY_MM, bodyHeightMm(PRINT_PROFILE_SPECS.book_a4_portrait))
  // The stylesheet's sheet geometry matches the profile the paginator budgets with.
  const css = fs.readFileSync(path.resolve(import.meta.dirname, '../apps/studio/static/visual-book.css'), 'utf8')
  const m = PRINT_PROFILE_SPECS.book_a4_portrait
  assert.match(css, new RegExp(`padding-block: ${m.margin_mm.top}mm ${m.margin_mm.bottom}mm`))
  assert.match(css, new RegExp(`\\.bk-recto \\{ padding-inline: ${m.margin_mm.inner}mm ${m.margin_mm.outer}mm; \\}`))
  assert.match(css, new RegExp(`grid-template-rows: ${m.head_mm}mm minmax\\(0, 1fr\\) ${m.folio_mm}mm`))
  assert.match(css, new RegExp(`row-gap: ${m.gap_mm}mm`))
  for (const lang of VISUAL_LANGS) for (const key of Object.keys(BOOK_TEXT.en)) assert.ok(BOOK_TEXT[lang][key as keyof (typeof BOOK_TEXT)['en']].trim(), `${lang}.${key}`)
})

test('paginate: keep-with-next, sections on new pages, continued tables with the header repeated, notes on their page', () => {
  const sections: BookSection[] = [
    {
      id: 'a',
      title: 'A',
      num: '01',
      state: null,
      flows: [
        block('a:head', 30, { keepWithNext: true, notes: [{ n: 1, body: html`n1` }] }),
        block('a:big', 180),
        block('a:sub', 10, { keepWithNext: true }),
        {
          kind: 'table',
          id: 'a:table',
          headMm: 10,
          rows: Array.from({ length: 40 }, () => 10),
          render: ([from, to], part) => html`<table>${part.index > 0 ? html`<caption>continued</caption>` : ''}<thead><tr><th>H</th></tr></thead><tbody>${Array.from({ length: to - from }, (_x, i) => html`<tr><td>${from + i}</td></tr>`)}</tbody></table>${part.continues ? 'more' : ''}`,
        },
      ],
    },
    { id: 'b', title: 'B', num: '02', state: null, flows: [block('b:one', 20)] },
  ]
  const pages = paginate(sections)
  // The heading stays with its table: page one holds head + big block only, so the sub heading opens page two.
  assert.deepEqual(pages[0]!.parts.map((part) => part.id), ['a:head', 'a:big'])
  assert.deepEqual(pages[0]!.notes.map((note) => note.n), [1], 'the note is on the page of its reference')
  assert.equal(pages[1]!.parts[0]!.id, 'a:sub')
  assert.equal(pages[1]!.continued, true)
  const parts = pages.flatMap((page) => page.parts).filter((part) => part.id.startsWith('a:table'))
  assert.ok(parts.length >= 2, 'the table continues')
  for (const [i, part] of parts.entries()) {
    assert.match(part.html.value, /<thead><tr><th>H<\/th><\/tr><\/thead>/, 'header on every part')
    assert.equal(/<caption>continued<\/caption>/.test(part.html.value), i > 0)
    assert.equal(part.html.value.endsWith('more'), i < parts.length - 1)
  }
  const rows = parts.flatMap((part) => [...part.html.value.matchAll(/<td>(\d+)<\/td>/g)].map((m) => Number(m[1])))
  assert.deepEqual(rows, Array.from({ length: 40 }, (_x, i) => i), 'every row once, in order')
  assert.ok(pages.every((page) => page.parts.length > 0), 'no page without body content (never a page holding only a note)')
  assert.ok(pages.every((page) => page.used <= BOOK_BODY_MM), 'every page within the text block')
  const b = pages.findIndex((page) => page.section.id === 'b')
  assert.equal(pages[b]!.continued, false, 'a new section starts a new page')
  // Measured heights replace the estimates.
  assert.equal(paginate(sections, new Map([['a:big', 20]]))[0]!.parts.length > 2, true)
  // A table's first row and its "continues" line fit together, or the table starts on the next page (with the
  // heading kept with it): the line is never pushed past the text block.
  const budget = BOOK_BODY_MM - 4
  const tight = (heading: boolean): BookSection[] => [
    {
      id: 't',
      title: 'T',
      num: '01',
      state: null,
      flows: [
        block('t:big', heading ? 190 : 200),
        ...(heading ? [block('t:sub', 5, { keepWithNext: true })] : []),
        { kind: 'table', id: 't:table', headMm: 10, rows: [25, 25, 25], render: ([from, to], part) => html`<p>${from}-${to}${part.continues ? ' more' : ''}</p>` },
      ],
    },
  ]
  for (const heading of [false, true]) {
    const laid = paginate(tight(heading))
    assert.ok(laid.every((page) => page.used <= budget), `every page within the budget (${laid.map((page) => page.used).join(', ')})`)
    assert.deepEqual(laid[0]!.parts.map((part) => part.id), ['t:big'], heading ? 'the heading moves with the table' : 'the table starts on the next page')
  }
})

test('book: cover, imprint, contents with real page numbers, running heads and folios, notes; ids only in the appendix', () => {
  for (const lang of VISUAL_LANGS) {
    const page = book(lang)
    const all = sheets(page)
    const layout = layoutIdentityBook({ doc: illustrativeVisualIdentity('internal', 'complete'), lang, commit: null, head: html``, toolbar: html``, assetUrl: () => null })
    assert.equal(all.length, layout.pageCount, lang)
    assert.match(all[0]!, /^bk-recto bk-sheet--cover/)
    assert.match(all[1]!, /^bk-verso bk-sheet--imprint/)
    assert.match(all[2]!, /^bk-recto bk-sheet--contents/)
    assert.equal((page.match(/<h1[\s>]/g) ?? []).length, 1, 'one h1 (the cover title)')
    // Contents: every entry's page number is the folio of the sheet it points to.
    const entries = [...all[2]!.matchAll(/href="#bk-p(\d+)".*?data-toc-page="(\d+)">([^<]+)</g)]
    assert.equal(entries.length, 4, `${lang}: three plates and the appendix`)
    for (const [, target, number, shown] of entries) {
      assert.equal(target, number)
      assert.match(all[Number(number) - 1]!, new RegExp(`data-folio="${number}"`))
      assert.equal(shown, new Intl.NumberFormat(lang, { useGrouping: false }).format(Number(number)), `${lang}: folio digits follow the language`)
    }
    // Running heads: book title on verso, section title on recto; folios on every page after the imprint.
    const body = all.slice(3)
    for (const [i, sheet] of body.entries()) {
      const folio = i + 4
      assert.match(sheet, new RegExp(`^bk-${folio % 2 ? 'recto' : 'verso'} `))
      const head = sheet.match(/<span class="bk-head-title" dir="auto">(.*?)<\/span><\/header>/s)?.[1] ?? ''
      if (folio % 2 === 0) assert.ok(head.startsWith(BOOK_TEXT[lang].bookTitle), `${lang} p${folio}: verso head`)
      else assert.ok(!head.startsWith(BOOK_TEXT[lang].bookTitle) && head.length > 0, `${lang} p${folio}: recto head`)
      assert.match(sheet, /class="bk-folio-num"/)
      assert.match(sheet, /ILLUSTRATIVE|MOCK|نمونه|ÖRNEK/i, 'every page of a fixture is stamped')
    }
    // Numbered notes: three plates, three notes, each on the page of its reference.
    for (const n of [1, 2, 3]) {
      const holder = all.find((sheet) => sheet.includes(`id="bk-ref-${n}"`))
      assert.ok(holder?.includes(`id="bk-note-${n}"`), `${lang}: note ${n} on its page`)
    }
    // Technical ids stay in the appendix (and the imprint's commit); plates show plain labels.
    const appendixStart = all.findIndex((sheet) => sheet.includes('bk-sheet--appendix'))
    for (const sheet of all.slice(0, appendixStart)) assert.doesNotMatch(sheet, /brand\.(color|type|logo)\.|fixture\.logo/, `${lang}: no ids before the appendix`)
    assert.match(all.slice(appendixStart).join(''), /brand\.color\.roles/)
    assert.equal(/\sstyle="/.test(page), false, 'no inline style (strict CSP)')
    assert.equal(/<script/.test(page), false)
  }
  const fa = book('fa')
  assert.match(fa, /<html lang="fa" dir="rtl">/)
  assert.match(fa, /data-toc-page="4">۴</, 'Persian folio digits')
  // The awaiting variant: designed pages, no drafted value, still a complete book.
  const awaiting = book('en', 'awaiting')
  assert.match(awaiting, /vz-await/)
  assert.doesNotMatch(awaiting, /#123A73/, 'a draft palette is never printed')
  assert.equal((book('en', 'complete', 'public').match(/class="bk-sheet /g) ?? []).length > 5, true)
  // An export from a working copy with uncommitted brand/ changes does not claim the commit alone.
  assert.doesNotMatch(book('en'), /bk-imprint-uncommitted/)
  for (const lang of VISUAL_LANGS) {
    const dirty = identityBookDocument({ doc: illustrativeVisualIdentity('internal', 'complete'), lang, commit: 'abcdef0123456789abcdef0123456789abcdef01', uncommitted: true, head: html``, toolbar: html``, assetUrl: () => null }).html.value
    assert.ok(dirty.includes(`<span class="bk-imprint-uncommitted">${BOOK_TEXT[lang].imprintUncommitted}</span>`), `${lang}: imprint notes uncommitted changes`)
  }
})

test('canvas A3 print: the renderer output is byte-for-byte unchanged, and the canvas golden carries no book CSS', () => {
  // Re-pinned in Visual V3.1: the illustrative canvas now carries list items, links and the links panel (an
  // intended change to the canvas renderer). The book engine still adds nothing to the canvas output.
  const pinned: Record<string, string> = {
    'en.internal': '39605e0d27ea1600d0ea79e2786df8c2ac22af030201ed4a96d6aa3704f03edb',
    'en.public': 'a49248f1095b4fe21ff5de810c86d84252fa9e637410c3f86ed86274b8941e9d',
    'fa.internal': '6d722764bb1900ac03a4e316528e67d09fa8fc63ebda59fd037ef3444f1a970e',
    'fa.public': 'ea15d7d2ef4998a2c9e4428738de59803f0a07be63bdcded7c54d6c99f7e1faf',
    'tr.internal': 'f3d5cd55e4819417a9e25b04a6354fd98b5e126ab710eff22a86f75a4d8eba1d',
    'tr.public': '61ceebaf4a96c9b234b2aac462bee037ae0c3c878e4f50bee3cd4cb1105cebd1',
  }
  for (const lang of VISUAL_LANGS) {
    for (const edition of ['internal', 'public'] as const) {
      const out = printDocument({ doc: illustrativeBusinessModelCanvas(lang, edition), lang, commit: null, head: html``, toolbar: html`` }).value
      assert.equal(createHash('sha256').update(out).digest('hex'), pinned[`${lang}.${edition}`], `${lang} ${edition}`)
    }
  }
  assert.doesNotMatch(renderGolden('en', 'internal'), /bk-sheet|bk-a4/)
})

test('brand:export-visual: writes HTML locally, refuses brand/ and .private, an agent token and the planned deck', () => {
  const root = path.resolve(import.meta.dirname, '..')
  const logs: string[] = []
  const base = { root, doc: 'identity' as const, langs: ['en', 'fa'] as VisualLang[], edition: 'internal' as const, profile: null, fixture: true, pdf: false, chrome: null, log: (line: string) => logs.push(line) }
  const out = path.join(tmp, 'html')
  const files = exportVisual({ ...base, out })
  assert.deepEqual(files.map((file) => path.basename(file.html)), ['identity.internal.en.html', 'identity.internal.fa.html'])
  const en = fs.readFileSync(files[0]!.html, 'utf8')
  assert.match(en, /class="bk-sheet bk-recto bk-sheet--cover"/)
  assert.match(en, /url\("data:font\/woff2;base64,/, 'fonts embedded: the file opens offline')
  assert.doesNotMatch(en, /url\("\/static\//)
  assert.ok(logs.some((line) => line.includes('Chrome')), 'says it fell back to estimates')
  const bmc = exportVisual({ ...base, doc: 'bmc', langs: ['tr'], out })
  assert.match(fs.readFileSync(bmc[0]!.html, 'utf8'), /vz-page--canvas/)
  for (const bad of ['brand', 'brand/exports', path.join(tmp, '.private', 'x')]) assert.throws(() => checkOutput(root, bad), (error: unknown) => error instanceof ExportError && error.code === 'path', bad)
  // A link cannot lead there either: the folder itself or a parent linked into brand/ or a .private folder.
  fs.mkdirSync(path.join(tmp, 'real', '.private'), { recursive: true })
  fs.symlinkSync(path.join(root, 'brand'), path.join(tmp, 'to-brand'))
  fs.symlinkSync(path.join(tmp, 'real', '.private'), path.join(tmp, 'to-private'))
  fs.symlinkSync(path.join(tmp, 'nowhere'), path.join(tmp, 'dangling'))
  for (const bad of ['to-brand', 'to-brand/exports', 'to-private', 'to-private/new/folder']) assert.throws(() => checkOutput(root, path.join(tmp, bad)), (error: unknown) => error instanceof ExportError && error.code === 'path', `linked: ${bad}`)
  assert.equal(checkOutput(root, path.join(tmp, 'fresh', 'out')), path.join(tmp, 'fresh', 'out'), 'a new folder outside brand/ is fine')
  // A link left in the output folder in place of an output file is not followed.
  const linked = path.join(tmp, 'linked-out')
  fs.mkdirSync(linked)
  fs.symlinkSync(path.join(tmp, 'victim.txt'), path.join(linked, 'identity.internal.en.html'))
  assert.throws(() => exportVisual({ ...base, langs: ['en'], out: linked }), (error: unknown) => error instanceof ExportError && error.code === 'path')
  assert.equal(fs.existsSync(path.join(tmp, 'victim.txt')), false, 'nothing written through the link')
  // Uncommitted brand/ changes are detected (ignored files such as .private do not count).
  const repo = path.join(tmp, 'repo')
  fs.mkdirSync(path.join(repo, 'brand'), { recursive: true })
  fs.writeFileSync(path.join(repo, '.gitignore'), '.private/\n')
  fs.writeFileSync(path.join(repo, 'brand', 'facts.yaml'), 'a: 1\n')
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, stdio: 'ignore' })
  git('init', '-q')
  git('add', '.')
  git('commit', '-q', '-m', 'init')
  assert.equal(brandUncommitted(repo), false, 'clean')
  fs.mkdirSync(path.join(repo, 'brand', '.private'))
  fs.writeFileSync(path.join(repo, 'brand', '.private', 'secret.yaml'), 'x: 1\n')
  assert.equal(brandUncommitted(repo), false, 'an ignored .private file is not a change')
  fs.writeFileSync(path.join(repo, 'brand', 'facts.yaml'), 'a: 2\n')
  assert.equal(brandUncommitted(repo), true, 'an edited fact is')
  assert.throws(() => exportVisual({ ...base, out, profile: 'deck_16_9' }), (error: unknown) => error instanceof ExportError && error.code === 'planned')
  process.env[AGENT_TOKEN_ENV] = 'bos_at_test'
  try {
    assert.throws(() => exportVisual({ ...base, out }), (error: unknown) => error instanceof ExportError && error.code === 'agent_token')
  } finally {
    delete process.env[AGENT_TOKEN_ENV]
  }
})

const chrome = findChrome()
test('brand:export-visual with Chrome: measured two-pass layout, one PDF page per sheet, no page overflows', { skip: chrome ? false : 'no Chrome/Chromium found (set CHROME_PATH)' }, () => {
  const root = path.resolve(import.meta.dirname, '..')
  const logs: string[] = []
  const [fa] = exportVisual({ root, doc: 'identity', langs: ['fa'], edition: 'internal', profile: null, fixture: true, pdf: true, chrome, out: path.join(tmp, 'pdf'), log: (line) => logs.push(line) })
  assert.ok(fa!.measured > 20, `measured flows: ${fa!.measured}`)
  const count = (fs.readFileSync(fa!.html, 'utf8').match(/class="bk-sheet /g) ?? []).length
  assert.equal(fa!.pages, count, 'Chrome printed exactly one page per sheet')
  assert.deepEqual(fa!.overflow, [], 'no text block overflows')
  assert.deepEqual(fs.readdirSync(path.join(tmp, 'pdf')).sort(), ['identity.internal.fa.html', 'identity.internal.fa.pdf'], 'the galley and check files are removed')
})
