/**
 * brand:export-visual — print engine export on the owner's machine (Visual Blueprint V1.2).
 *
 * Renders a visual document through the same renderers Studio uses and writes self-contained HTML (fonts and the
 * approved master embedded) and, when a local Chrome is available, a PDF. Studio never writes files; this command
 * is the only writer, and it writes only into the output folder (default dist/visual-export, which git ignores).
 *
 *   npm run brand:export-visual -- [--doc identity|bmc|brand-book|business-report] [--lang en|fa|tr|all] [--edition internal|public]
 *                                  [--profile book_a4_portrait|canvas_a3_landscape|deck_16_9]
 *                                  [--out <dir>] [--fixture] [--no-pdf]
 *
 * Book profile: with Chrome, a measured two-pass layout. Pass one prints every flow of the book in a galley and
 * measures its height in Chrome; pass two paginates with the measured heights (so the contents page numbers are
 * the printed ones), then Chrome prints the PDF and every page is checked for overflow. Without Chrome, the HTML
 * is paginated with the built-in estimates, exactly like Studio's print view.
 *
 * Reads approved data through Studio's projection (drafts are not carried, restricted values are withheld, secrets
 * refuse the export). Refused under an agent token. Never writes inside brand/ or a .private folder.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { AGENT_TOKEN_ENV, InterviewEngine } from '@brand-os/brand-core'
import {
  bookText,
  fillVisual,
  fullBookText,
  illustrativeBook,
  illustrativeBusinessModelCanvas,
  illustrativeVisualIdentity,
  isVisualLang,
  PRINT_PROFILE_SPECS,
  VISUAL_LANGS,
  type BookDocument,
  type PaperProfile,
  type VisualDocument,
  type VisualLang,
} from '@brand-os/brand-core/visual'
import { assertNoSecrets, buildProjection, type PreviewFile } from '../apps/studio/src/projection.js'
import { html, trusted, type SafeHtml } from '../apps/studio/src/views/html.js'
import { printDocument } from '../apps/studio/src/views/visual.js'
import { identityBookDocument, identityBookGalley, type BookInput, type Heights } from '../apps/studio/src/views/visual-print-book.js'
import { fullBookDocument, fullBookGalley } from '../apps/studio/src/views/visual-print-full.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const STATIC = path.join(ROOT, 'apps', 'studio', 'static')
const FONT_MIME: Record<string, string> = { '.woff2': 'font/woff2' }
const MAX_ASSET_BYTES = 8 * 1024 * 1024

const HELP = `brand:export-visual [options]

  --doc <doc>                   identity: Brand Book "Visual identity" chapter (default); bmc: Business Model Canvas;
                                brand-book: the full Brand Book; business-report: the Business Report
  --lang en|fa|tr|all           language of the labels (default: all of en, fa, tr the brand supports)
  --edition internal|public     internal (default) or the public edition (approved and published only);
                                the business report has no public edition
  --profile <id>                book_a4_portrait (identity, brand-book, business-report), canvas_a3_landscape (bmc);
                                deck_16_9 is planned
  --out <dir>                   output folder (default dist/visual-export); never inside brand/ or .private
  --fixture                     render the ILLUSTRATIVE / MOCK DATA fixture instead of this repository
  --no-pdf                      HTML only (no Chrome needed)

Writes <doc>.<edition>.<lang>.html (and .pdf). Refused while ${AGENT_TOKEN_ENV} is set.`

export class ExportError extends Error {
  constructor(
    readonly code: 'agent_token' | 'path' | 'planned' | 'no_document' | 'usage',
    message: string,
  ) {
    super(message)
  }
}

export const EXPORT_DOCS = ['identity', 'bmc', 'brand-book', 'business-report'] as const
export type ExportDoc = (typeof EXPORT_DOCS)[number]

/** The full books (Visual V4.2) and the projection key they are read from. */
const FULL_BOOKS = { 'brand-book': 'brand_book', 'business-report': 'business_report' } as const
type FullDoc = keyof typeof FULL_BOOKS
function isFullDoc(doc: ExportDoc): doc is FullDoc {
  return doc in FULL_BOOKS
}

export interface ExportOptions {
  root: string
  doc: ExportDoc
  langs: VisualLang[]
  edition: 'internal' | 'public'
  profile: PaperProfile | null
  out: string
  fixture: boolean
  pdf: boolean
  /** Chrome binary; null means HTML only. */
  chrome: string | null
  log: (line: string) => void
}

export interface ExportedFile {
  lang: VisualLang
  html: string
  pdf: string | null
  pages: number | null
  measured: number
  overflow: number[]
}

export function findChrome(): string | null {
  const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  return candidates.filter((item): item is string => Boolean(item)).find((file) => fs.existsSync(file)) ?? null
}

function lstatOrNull(file: string): fs.Stats | null {
  try {
    return fs.lstatSync(file)
  } catch {
    return null
  }
}

/** The real path of `file`: the nearest existing ancestor resolved through links, plus the part not created yet. */
function realTarget(file: string): string | null {
  let existing = file
  while (!lstatOrNull(existing) && path.dirname(existing) !== existing) existing = path.dirname(existing)
  try {
    return path.join(fs.realpathSync(existing), path.relative(existing, file))
  } catch {
    return null
  }
}

/**
 * The output folder must not be the brand's truth: not inside brand/, not inside any .private folder. Checked on the
 * path as given and on its real path, so a link (the folder itself or a parent) cannot lead into either.
 */
export function checkOutput(root: string, out: string): string {
  const resolved = path.resolve(root, out)
  const refuse = (): never => {
    throw new ExportError('path', bookText('en').exportRefusedPath)
  }
  const real = realTarget(resolved)
  if (real === null) refuse()
  const brands = [path.resolve(root, 'brand'), realTarget(path.resolve(root, 'brand'))].filter((dir): dir is string => dir !== null)
  for (const candidate of [resolved, real!]) {
    if (brands.some((brand) => candidate === brand || candidate.startsWith(brand + path.sep))) refuse()
    if (candidate.split(path.sep).includes('.private')) refuse()
  }
  return resolved
}

/** An output file must not be a link left in the output folder (writing would follow it). */
function refuseLink(file: string): void {
  if (lstatOrNull(file)?.isSymbolicLink()) throw new ExportError('path', bookText('en').exportRefusedPath)
}

function writeOutput(file: string, data: string): void {
  refuseLink(file)
  fs.writeFileSync(file, data)
}

/** visual.css (+ visual-book.css) with every font embedded, so the HTML opens anywhere, offline. */
function embeddedStyles(book: boolean): string {
  let css = fs.readFileSync(path.join(STATIC, 'visual.css'), 'utf8')
  if (book) css += `\n${fs.readFileSync(path.join(STATIC, 'visual-book.css'), 'utf8')}`
  return css.replace(/url\("\/static\/fonts\/([a-z0-9-]+\.woff2)"\)/g, (_all, file: string) => {
    const bytes = fs.readFileSync(path.join(STATIC, 'fonts', file))
    return `url("data:${FONT_MIME[path.extname(file)]};base64,${bytes.toString('base64')}")`
  })
}

/** Approved previews only (the projection gives a key only to approved, inspected files), embedded as data URLs. */
function assetEmbedder(previews: PreviewFile[]): (key: string) => string | null {
  const byKey = new Map(previews.map((preview) => [preview.key, preview]))
  return (key) => {
    const preview = byKey.get(key)
    if (!preview) return null
    const stat = fs.statSync(preview.source)
    if (stat.size > MAX_ASSET_BYTES) return null
    return `data:${preview.mime};base64,${fs.readFileSync(preview.source).toString('base64')}`
  }
}

function commitOf(root: string): string | null {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
  const sha = result.status === 0 ? result.stdout.trim() : ''
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null
}

/**
 * The export reads the working copy, not the commit: true when brand/ has changes git has not committed (tracked or
 * new files; ignored ones such as .private do not count), so the imprint does not claim the commit alone.
 */
export function brandUncommitted(root: string): boolean {
  const result = spawnSync('git', ['status', '--porcelain', '--', 'brand'], { cwd: root, encoding: 'utf8' })
  return result.status === 0 && result.stdout.trim().length > 0
}

interface Source {
  doc: VisualDocument | null
  book: BookDocument | null
  assetUrl: (key: string) => string | null
  commit: string | null
  uncommitted: boolean
}

/** The commit the export read and whether brand/ had uncommitted changes (logged once, so the owner sees it). */
function committed(options: ExportOptions): { commit: string | null; uncommitted: boolean } {
  const commit = commitOf(options.root)
  const uncommitted = commit !== null && brandUncommitted(options.root)
  if (uncommitted) options.log(bookText(options.langs[0] ?? 'en').exportUncommitted)
  return { commit, uncommitted }
}

function loadSource(options: ExportOptions): Source {
  const full = isFullDoc(options.doc) ? FULL_BOOKS[options.doc] : null
  if (options.fixture) {
    if (full) return { doc: null, book: illustrativeBook(full, 'en', options.edition), assetUrl: () => null, commit: null, uncommitted: false }
    const doc = options.doc === 'identity' ? illustrativeVisualIdentity(options.edition, 'complete') : illustrativeBusinessModelCanvas('en', options.edition)
    return { doc, book: null, assetUrl: () => null, commit: null, uncommitted: false }
  }
  const slug = new InterviewEngine(options.root).config().brand.slug
  const { projection, previews } = buildProjection(options.root, slug)
  const visual = projection.visual
  if (full) {
    const book = visual?.books?.[full]?.[options.edition] ?? null
    if (!book) throw new ExportError('no_document', fillVisual(bookText(options.langs[0] ?? 'en').exportNoDocument, { doc: options.doc }))
    return { doc: null, book, assetUrl: assetEmbedder(previews), ...committed(options) }
  }
  const doc = !visual ? null : options.doc === 'identity' ? (visual.identity?.[options.edition] ?? null) : visual.bmc.applies ? visual.bmc[options.edition] : null
  if (!doc) throw new ExportError('no_document', fillVisual(bookText(options.langs[0] ?? 'en').exportNoDocument, { doc: options.doc }))
  return { doc, book: null, assetUrl: assetEmbedder(previews), ...committed(options) }
}

/** Chrome's serialized DOM after scripts ran and fonts loaded (virtual time), or null when Chrome failed. */
function dumpDom(chrome: string, file: string): string | null {
  try {
    return execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files', '--window-size=1200,2000', '--virtual-time-budget=15000', '--dump-dom', pathToFileURL(file).href], { encoding: 'utf8', timeout: 120_000, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

function readResult(dom: string | null, id: string): unknown {
  if (!dom) return null
  const match = dom.match(new RegExp(`<pre id="${id}">([^<]*)</pre>`))
  if (!match) return null
  return JSON.parse(match[1]!.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&'))
}

/** Pass one: every flow's height in millimetres, measured in Chrome after the fonts loaded. */
const MEASURE = `document.fonts.ready.then(() => {
  const mm = (px) => (px * 25.4) / 96
  const out = {}
  for (const el of document.querySelectorAll('[data-flow]')) out[el.dataset.flow] = mm(el.getBoundingClientRect().height)
  for (const el of document.querySelectorAll('[data-flow-table]')) {
    const id = el.dataset.flowTable
    let sum = 0
    el.querySelectorAll('tbody > tr').forEach((tr, i) => { const h = mm(tr.getBoundingClientRect().height); out[id + ':r' + i] = h; sum += h })
    out[id + ':head'] = mm(el.getBoundingClientRect().height) - sum
  }
  for (const el of document.querySelectorAll('[data-note]')) out['note:' + el.dataset.note] = mm(el.getBoundingClientRect().height) + 1
  const pre = document.createElement('pre'); pre.id = 'bk-measure'; pre.textContent = JSON.stringify(out); document.body.append(pre)
})`

/** Check after the final layout: folios of pages whose text block overflows. */
const CHECK = `document.fonts.ready.then(() => {
  const bad = [...document.querySelectorAll('.bk-sheet')].filter((s) => { const b = s.querySelector('.bk-body'); return b && b.scrollHeight > b.clientHeight + 1 }).map((s) => Number(s.dataset.folio))
  const pre = document.createElement('pre'); pre.id = 'bk-check'; pre.textContent = JSON.stringify(bad); document.body.append(pre)
})`

/** Pass one of the book: render the galley, measure every flow in Chrome, return the heights (null on failure). */
export function measureBook(chrome: string, input: BookInput, galleyFile: string): Heights | undefined {
  return measureGalley(chrome, identityBookGalley(input).value, galleyFile)
}

/** Measures any book galley (identity chapter or full book) in Chrome. */
export function measureGalley(chrome: string, galley: string, galleyFile: string): Heights | undefined {
  writeOutput(galleyFile, withScript(galley, MEASURE))
  try {
    const result = readResult(dumpDom(chrome, galleyFile), 'bk-measure') as Record<string, number> | null
    return result ? new Map(Object.entries(result).filter(([, value]) => Number.isFinite(value))) : undefined
  } finally {
    fs.rmSync(galleyFile, { force: true })
  }
}

function withScript(page: string, script: string): string {
  return page.replace('</body>', `<script>${script}</script>\n</body>`)
}

function printPdf(chrome: string, htmlFile: string, pdfFile: string): number | null {
  refuseLink(pdfFile)
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--no-pdf-header-footer', '--allow-file-access-from-files', `--print-to-pdf=${pdfFile}`, pathToFileURL(htmlFile).href], { stdio: 'ignore', timeout: 120_000 })
  const text = fs.readFileSync(pdfFile).toString('latin1')
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length || null
}

/** A path for messages: relative inside the repository, absolute outside it. */
function shown(root: string, file: string): string {
  const relative = path.relative(root, file)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : file
}

export function exportVisual(options: ExportOptions): ExportedFile[] {
  if (process.env[AGENT_TOKEN_ENV]) throw new ExportError('agent_token', bookText('en').exportRefusedAgent)
  const bookLike = options.doc !== 'bmc'
  const profile = options.profile ?? (bookLike ? 'book_a4_portrait' : 'canvas_a3_landscape')
  const spec = PRINT_PROFILE_SPECS[profile]
  const t = bookText(options.langs[0] ?? 'en')
  if (spec.status === 'planned') throw new ExportError('planned', fillVisual(t.exportPlanned, { profile }))
  const expected = bookLike ? 'book_a4_portrait' : 'canvas_a3_landscape'
  if (profile !== expected) throw new ExportError('usage', `--profile ${profile} does not apply to --doc ${options.doc} (use ${expected}).`)
  // The Business Report is the business plan as a book; no profile prints the business plan publicly (Visual V4.1).
  if (options.doc === 'business-report' && options.edition === 'public') throw new ExportError('usage', fullBookText(options.langs[0] ?? 'en').exportReportNotPublic)
  const out = checkOutput(options.root, options.out)
  const source = loadSource(options)
  fs.mkdirSync(out, { recursive: true })
  // Once the folder exists its real path is known: check again, in case a link appeared on the way.
  checkOutput(options.root, out)
  const book = bookLike
  const head = html`<style>${trusted(embeddedStyles(book))}</style>`
  const chrome = options.pdf ? options.chrome : null
  if (!chrome) options.log(t.exportNoChrome)
  const results: ExportedFile[] = []
  for (const lang of options.langs) {
    const name = `${options.doc}.${options.edition}.${lang}`
    const htmlFile = path.join(out, `${name}.html`)
    let page: SafeHtml
    let measured = 0
    if (source.book) {
      // Full Brand Book / Business Report (V4.2). Fixture values are invented per language, like the canvas fixture.
      const full = options.fixture && isFullDoc(options.doc) ? illustrativeBook(FULL_BOOKS[options.doc], lang, options.edition) : source.book
      const input = { book: full, lang, commit: source.commit, uncommitted: source.uncommitted, head, toolbar: html``, assetUrl: source.assetUrl }
      const heights = chrome ? measureGalley(chrome, fullBookGalley(input).value, path.join(out, `.${name}.galley.html`)) : undefined
      if (heights) {
        measured = heights.size
        options.log(fillVisual(bookText(lang).exportMeasured, { count: measured }))
      } else if (chrome) options.log(bookText(lang).exportMeasureFailed)
      page = fullBookDocument({ ...input, heights }).html
    } else if (book) {
      const doc = source.doc!
      const input = { doc, lang, commit: source.commit, uncommitted: source.uncommitted, head, toolbar: html``, assetUrl: source.assetUrl }
      const heights = chrome ? measureBook(chrome, input, path.join(out, `.${name}.galley.html`)) : undefined
      if (heights) {
        measured = heights.size
        options.log(fillVisual(bookText(lang).exportMeasured, { count: measured }))
      } else if (chrome) options.log(bookText(lang).exportMeasureFailed)
      page = identityBookDocument({ ...input, heights }).html
    } else {
      const doc = options.fixture ? illustrativeBusinessModelCanvas(lang, options.edition) : source.doc!
      page = printDocument({ doc, lang, commit: source.commit, head, toolbar: html`` })
    }
    assertNoSecrets(page.value)
    writeOutput(htmlFile, page.value)
    options.log(fillVisual(bookText(lang).exportWrote, { file: shown(options.root, htmlFile) }))
    let pdf: string | null = null
    let pages: number | null = null
    let overflow: number[] = []
    if (chrome) {
      pdf = path.join(out, `${name}.pdf`)
      pages = printPdf(chrome, htmlFile, pdf)
      options.log(fillVisual(bookText(lang).exportWrote, { file: shown(options.root, pdf) }))
      if (book) {
        const checkFile = path.join(out, `.${name}.check.html`)
        writeOutput(checkFile, withScript(page.value, CHECK))
        overflow = (readResult(dumpDom(chrome, checkFile), 'bk-check') as number[] | null) ?? []
        fs.rmSync(checkFile, { force: true })
        for (const folio of overflow) options.log(fillVisual(bookText(lang).exportOverflow, { page: folio, file: path.basename(htmlFile) }))
      }
    }
    results.push({ lang, html: htmlFile, pdf, pages, measured, overflow })
  }
  return results
}

function langsFor(root: string, value: string | undefined, fixture: boolean): VisualLang[] {
  if (value && value !== 'all') {
    if (!isVisualLang(value)) throw new ExportError('usage', `--lang must be en, fa, tr or all (got ${value}).`)
    return [value]
  }
  if (fixture) return [...VISUAL_LANGS]
  const supported = new InterviewEngine(root).config().brand.supported_locales ?? []
  const langs = VISUAL_LANGS.filter((lang) => supported.includes(lang))
  return langs.length ? langs : ['en']
}

function main(): number {
  const { values } = parseArgs({
    options: {
      doc: { type: 'string' },
      lang: { type: 'string' },
      edition: { type: 'string' },
      profile: { type: 'string' },
      out: { type: 'string' },
      root: { type: 'string' },
      fixture: { type: 'boolean' },
      'no-pdf': { type: 'boolean' },
      help: { type: 'boolean' },
    },
  })
  if (values.help) {
    console.log(HELP)
    return 0
  }
  try {
    const root = path.resolve(values.root ?? process.cwd())
    const doc = values.doc ?? 'identity'
    if (!(EXPORT_DOCS as readonly string[]).includes(doc)) throw new ExportError('usage', fillVisual(fullBookText('en').exportUnknownDoc, { doc }))
    const edition = values.edition ?? 'internal'
    if (edition !== 'internal' && edition !== 'public') throw new ExportError('usage', `--edition must be internal or public (got ${edition}).`)
    const profile = values.profile ?? null
    if (profile !== null && !(profile in PRINT_PROFILE_SPECS)) throw new ExportError('usage', `--profile must be one of ${Object.keys(PRINT_PROFILE_SPECS).join(', ')}.`)
    exportVisual({
      root,
      doc: doc as ExportDoc,
      langs: langsFor(root, values.lang, Boolean(values.fixture)),
      edition,
      profile: profile as PaperProfile | null,
      out: values.out ?? path.join('dist', 'visual-export'),
      fixture: Boolean(values.fixture),
      pdf: !values['no-pdf'],
      chrome: findChrome(),
      log: (line) => console.log(line),
    })
    return 0
  } catch (error) {
    if (error instanceof ExportError) {
      console.error(error.message)
      return error.code === 'usage' ? 64 : 2
    }
    throw error
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main()
