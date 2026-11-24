import type { CitationListBlock, ColorPaletteBlock, LogoConstructionBlock, TypographySpecimenBlock, VisualBlock, VisualDocument, VisualEntry, VisualLang } from '@brand-os/brand-core/visual'
import { bodyHeightMm, bookText, fillVisual, printProfile, visualCatalog } from '@brand-os/brand-core/visual'
import { html, join, type SafeHtml } from './html.js'
import { dateOnly, legend, two } from './visual-primitives.js'
import { renderBlock, type BlockContext } from './visual-registry.js'
import { comboList, contrastTable, footParts, frameworkNote, gridKey, plateHead, sourceRows, sourcesHead, swatchList, typeRoleItem, type IdentityContext } from './visual-identity.js'

/**
 * Print engine, profile `book_a4_portrait` (Visual Blueprint V1.2).
 *
 * The book is laid out by this renderer, not by the browser's fragmentation: every page is a fixed A4 sheet with a
 * running head, a body, numbered notes and a folio. Content is a list of flows (blocks that never split, and tables
 * that split between rows with the header repeated and a "continued" caption). A greedy paginator places the flows
 * by height, keeps headings with what follows, and starts each plate on a new page. Because the renderer decides
 * every break, the contents page carries real page numbers, and Chrome prints exactly one PDF page per sheet.
 *
 * Heights come from built-in estimates (Studio's print view) or from a measured pass in Chrome (`brand:export-visual`
 * renders the galley, measures every flow, then paginates with the measured heights). Same renderer either way.
 * Read-only: no inline style or script (strict CSP); layout lives in `static/visual-book.css`.
 */

const PROFILE = printProfile('book_a4_portrait')
/** Text block height in mm (sheet minus margins, running head, folio and their gaps). */
export const BOOK_BODY_MM = bodyHeightMm(PROFILE)
/** Vertical gap between flows (CSS `.bk-flows { row-gap }`). */
const GAP_MM = 5
/** Notes block: top rule and padding. */
const NOTES_RULE_MM = 5
/** "Continues on the next page" line under a split table. */
const CONTINUES_MM = 6
/** "<title>, continued" kicker at the top of a continuation page. */
const CONTINUED_MM = 9
/** Safety margin kept free on every page, so sub-millimetre rounding never pushes a flow into the folio. */
const SLACK_MM = 4

export interface BookNote {
  n: number
  body: SafeHtml
}

export type BookFlow =
  | { kind: 'block'; id: string; html: SafeHtml; mm: number; keepWithNext?: boolean; notes?: BookNote[] }
  | {
      kind: 'table'
      id: string
      headMm: number
      /** Estimated height of each body row. */
      rows: number[]
      /** Renders rows `[from, to)`: `index` 0 for the first part, `continues` when more rows follow on the next page. */
      render: (range: [number, number], part: { index: number; continues: boolean }) => SafeHtml
    }

export interface BookSection {
  id: string
  /** Running head and contents entry. */
  title: string
  /** Contents number ("01", as on the plate head); null for the appendix. */
  num: string | null
  /** Short state shown under the contents entry (ready / awaiting), or null. */
  state: { text: string; ready: boolean } | null
  flows: BookFlow[]
}

export interface BookPage {
  section: BookSection
  continued: boolean
  parts: Array<{ id: string; html: SafeHtml }>
  notes: BookNote[]
  /** Estimated or measured height used, in mm (for tests and the export report). */
  used: number
}

/** Measured heights in mm by flow id (`<id>`, table `<id>:head` and `<id>:r<i>`, notes `note:<n>`). */
export type Heights = ReadonlyMap<string, number>

function noteMm(note: BookNote, heights: Heights | undefined): number {
  return heights?.get(`note:${note.n}`) ?? 6
}

function notesMm(notes: BookNote[], heights: Heights | undefined): number {
  return notes.length ? NOTES_RULE_MM + notes.reduce((sum, note) => sum + noteMm(note, heights), 0) : 0
}

function flowMm(flow: BookFlow, heights: Heights | undefined): number {
  if (flow.kind === 'block') return heights?.get(flow.id) ?? flow.mm
  return tableHeadMm(flow, heights) + flow.rows.reduce((sum, row, i) => sum + rowMm(flow, i, heights), 0)
}

function tableHeadMm(flow: Extract<BookFlow, { kind: 'table' }>, heights: Heights | undefined): number {
  return heights?.get(`${flow.id}:head`) ?? flow.headMm
}

function rowMm(flow: Extract<BookFlow, { kind: 'table' }>, i: number, heights: Heights | undefined): number {
  return heights?.get(`${flow.id}:r${i}`) ?? flow.rows[i]!
}

/**
 * The smallest piece of a table that may start a page at row `i`: its header and that row, plus the "continues" line
 * when more rows follow (the line is printed under the piece, so it must fit on the same page).
 */
function tablePieceMm(flow: Extract<BookFlow, { kind: 'table' }>, i: number, heights: Heights | undefined): number {
  if (i >= flow.rows.length) return tableHeadMm(flow, heights)
  return tableHeadMm(flow, heights) + rowMm(flow, i, heights) + (i + 1 < flow.rows.length ? CONTINUES_MM : 0)
}

/** The smallest piece of a flow that may start a page: the whole block, or a table's first piece. */
function firstPieceMm(flow: BookFlow, heights: Heights | undefined): number {
  if (flow.kind === 'block') return flowMm(flow, heights)
  return tablePieceMm(flow, 0, heights)
}

/**
 * Greedy pagination. Each section starts a new page. A block that does not fit moves to a new page (a block taller
 * than a whole page is placed alone and reported by the measured pass). A heading marked keep-with-next moves with
 * the first piece of what follows. A table fills the page row by row, repeats its header on the next page and says
 * it continues. Notes stay on the page of their reference. No page is ever created without body content.
 */
export function paginate(sections: BookSection[], heights?: Heights, budget = BOOK_BODY_MM - SLACK_MM): BookPage[] {
  const pages: BookPage[] = []
  for (const section of sections) {
    let page: BookPage = { section, continued: false, parts: [], notes: [], used: 0 }
    const used = () => page.used + (page.parts.length ? GAP_MM : 0)
    const fits = (mm: number, notes: BookNote[] = []) => used() + mm + notesMm([...page.notes, ...notes], heights) <= budget
    const turn = () => {
      pages.push(page)
      page = { section, continued: true, parts: [], notes: [], used: CONTINUED_MM }
    }
    const place = (id: string, part: SafeHtml, mm: number, notes: BookNote[] = []) => {
      page.used = used() + mm
      page.parts.push({ id, html: part })
      page.notes.push(...notes)
    }
    section.flows.forEach((flow, index) => {
      if (flow.kind === 'block') {
        const next = section.flows[index + 1]
        const need = flowMm(flow, heights) + (flow.keepWithNext && next ? GAP_MM + firstPieceMm(next, heights) : 0)
        if (!fits(need, flow.notes) && page.parts.length) turn()
        place(flow.id, flow.html, flowMm(flow, heights), flow.notes)
        return
      }
      let i = 0
      let part = 0
      while (i < flow.rows.length) {
        const head = tableHeadMm(flow, heights)
        if (!fits(tablePieceMm(flow, i, heights)) && page.parts.length) turn()
        let take = 0
        let mm = head
        while (i + take < flow.rows.length) {
          const more = i + take + 1 < flow.rows.length
          const next = mm + rowMm(flow, i + take, heights)
          if (take > 0 && !fits(next + (more ? CONTINUES_MM : 0))) break
          mm = next
          take += 1
        }
        const continues = i + take < flow.rows.length
        place(
          `${flow.id}:${part}`,
          flow.render([i, i + take], { index: part, continues }),
          mm + (continues ? CONTINUES_MM : 0),
        )
        i += take
        part += 1
        if (continues) turn()
      }
    })
    if (page.parts.length) pages.push(page)
  }
  return pages
}

// ---------------------------------------------------------------------------------------------------------------
// Identity chapter flows

export interface BookInput {
  doc: VisualDocument
  lang: VisualLang
  commit: string | null
  /** The export read brand/ with changes not yet committed: the imprint says so next to the commit. */
  uncommitted?: boolean
  head: SafeHtml
  toolbar: SafeHtml
  assetUrl: (key: string) => string | null
  /** Measured heights from the export CLI's first pass; Studio uses the built-in estimates. */
  heights?: Heights
}

export function digits(lang: VisualLang, n: number, min = 1): string {
  return new Intl.NumberFormat(lang, { minimumIntegerDigits: min, useGrouping: false }).format(n)
}

const px = (value: number) => value * 0.2646

/** One type role's estimated height: true-size specimen lines per script, or the meta column, whichever is taller. */
function typeRoleMm(block: TypographySpecimenBlock, role: TypographySpecimenBlock['roles'][number]): number {
  const size = role.size_px ?? 16
  const line = Math.ceil(size * (role.line_height ?? 1.3) + 18)
  const specimen = block.scripts.reduce((sum, _script) => sum + px(line + 18), 0) + px(10) * Math.max(0, block.scripts.length - 1)
  return Math.max(specimen, 52) + 4
}

export interface FlowBuilder {
  ctx: BlockContext
  notes: BookNote[]
}

export function blockFlow(id: string, content: SafeHtml, mm: number, extra: { keepWithNext?: boolean; notes?: BookNote[] } = {}): BookFlow {
  return { kind: 'block', id, html: content, mm, ...extra }
}

/** Notes registered while rendering a flow belong to that flow (and so to its page). */
export function take(builder: FlowBuilder): BookNote[] {
  return builder.notes.splice(0, builder.notes.length)
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function subHead(title: string, lead: string | null): SafeHtml {
  return html`<h3 class="vz-sub">${title}</h3>${lead ? html`<p class="vz-note">${lead}</p>` : ''}`
}

export function colorFlows(block: ColorPaletteBlock, builder: FlowBuilder): BookFlow[] {
  const { ctx } = builder
  const t = ctx.cat.identity
  if (block.colors.length === 0) return [blockFlow('color:await', renderBlock(block, ctx), 165, { notes: take(builder) })]
  const head = plateHead(ctx.plateNum?.(1) ?? 1, 'vi-color', t.colorTitle, t.colorLead, html`<span class="vz-plate-state vz-plate-state--ready">${t.ready}</span>`, ctx.note!(block.source))
  const flows: BookFlow[] = [blockFlow('color:head', head, 34, { keepWithNext: true, notes: take(builder) }), blockFlow('color:roles', subHead(t.rolesTitle, null), 4, { keepWithNext: true })]
  chunks(block.colors, 4).forEach((row, i) => flows.push(blockFlow(`color:sw${i}`, swatchList(block, ctx, row), 47)))
  flows.push(blockFlow('color:combos', subHead(t.combinationsTitle, t.combinationsLead), 15, { keepWithNext: true }))
  if (block.combinations.length) chunks(block.combinations, 2).forEach((row, i) => flows.push(blockFlow(`color:cb${i}`, comboList(block, ctx, row), 26)))
  else flows.push(blockFlow('color:cb-none', html`<p class="vz-note">${t.combinationsNone}</p>`, 8))
  flows.push(blockFlow('color:contrast', subHead(t.contrastTitle, t.contrastLead), 15, { keepWithNext: true }))
  const grid = block.grid
  if (!grid) {
    flows.push(blockFlow('color:grid-none', html`<p class="vz-note">${fillVisual(t.gridOmitted, { count: 10 })}</p>`, 8))
    return flows
  }
  const b = bookText(ctx.lang)
  flows.push({
    kind: 'table',
    id: 'color:grid',
    headMm: 17.5,
    rows: grid.roles.map(() => 7.2),
    render: ([from, to], part) => {
      const caption = part.index === 0 ? null : fillVisual(b.continued, { title: t.contrastTitle })
      return html`${contrastTable(block, ctx, [from, to], caption)}${part.continues ? html`<p class="bk-continues">${b.tableContinues}</p>` : gridKey()}`
    },
  })
  return flows
}

export function typeFlows(block: TypographySpecimenBlock, builder: FlowBuilder): BookFlow[] {
  const { ctx } = builder
  const t = ctx.cat.identity
  if (block.roles.length === 0) return [blockFlow('type:await', renderBlock(block, ctx), 165, { notes: take(builder) })]
  const head = plateHead(ctx.plateNum?.(2) ?? 2, 'vi-type', t.typeTitle, t.typeLead, html`<span class="vz-plate-state vz-plate-state--ready">${t.ready}</span>`, ctx.note!(block.source))
  const flows: BookFlow[] = [blockFlow('type:head', head, 34, { keepWithNext: true, notes: take(builder) })]
  block.roles.forEach((role, i) => flows.push(blockFlow(`type:r${i}`, html`<ol class="vz-type-roles" start="${i + 1}">${typeRoleItem(block, role, ctx)}</ol>`, typeRoleMm(block, role))))
  flows.push(blockFlow('type:note', html`<p class="vz-note vz-type-note">${t.fontNote}</p>`, 13.5))
  return flows
}

export function logoFlows(block: LogoConstructionBlock, builder: FlowBuilder): BookFlow[] {
  const ready = block.spec !== null && block.master !== null
  const content = renderBlock(block, builder.ctx)
  return [blockFlow(ready ? 'logo:plate' : 'logo:await', content, ready ? 205 : 165, { notes: take(builder) })]
}

export function appendixFlows(doc: Pick<VisualDocument, 'audience' | 'framework_refs'>, citations: Pick<CitationListBlock, 'items'> | undefined, builder: FlowBuilder, intro?: string): BookFlow[] {
  const { ctx } = builder
  const cat = ctx.cat
  const b = bookText(ctx.lang)
  const internal = doc.audience === 'internal'
  const flows: BookFlow[] = [
    blockFlow('appendix:head', html`<header class="bk-appendix-head"><h2 class="bk-appendix-title" id="bk-sources-t">${cat.text.sourcesTitle}</h2><p class="vz-note">${intro ?? cat.identity.sourcesIntro}</p></header>`, 24, { keepWithNext: true }),
  ]
  if (citations) {
    const rows = sourceRows(citations, ctx)
    const all = [...rows.items, ...(rows.master ? [rows.master] : [])]
    flows.push({
      kind: 'table',
      id: 'appendix:sources',
      headMm: 6,
      rows: all.map(() => 9.5),
      render: ([from, to], info) =>
        html`<table class="vz-table bk-table">${info.index > 0 ? html`<caption class="bk-caption">${fillVisual(b.continued, { title: cat.text.sourcesTitle })}</caption>` : ''}${sourcesHead(cat)}<tbody>${all.slice(from, to)}</tbody></table>${info.continues ? html`<p class="bk-continues">${b.tableContinues}</p>` : ''}`,
    })
  }
  flows.push(blockFlow('appendix:legend', legend(cat, ['approved', 'stale', 'assumption', 'withheld', 'missing']), 7))
  doc.framework_refs.forEach((ref, i) => flows.push(blockFlow(`appendix:fw${i}`, frameworkNote(cat, ref, 'print', ctx.lang), 54)))
  flows.push(blockFlow('appendix:edition', html`<p class="vz-muted vz-edition-note">${internal ? cat.text.editionInternalNote : cat.text.editionPublicNote}</p>`, 8))
  return flows
}

export function isBlock<T extends VisualBlock['type']>(type: T) {
  return (block: VisualBlock): block is Extract<VisualBlock, { type: T }> => block.type === type
}

/** Shell fields every book shares (the identity `VisualDocument` and the full-book document both have them). */
export type BookMeta = Pick<VisualDocument, 'brand_name' | 'audience' | 'illustrative' | 'as_of'>

/**
 * The renderer context and note register of one book: notes are numbered across the whole book, and a note belongs
 * to the flow that registered it. `doc` is the visual document the plates are drawn from.
 */
export function bookBuilder(input: { doc: VisualDocument; lang: VisualLang; assetUrl: (key: string) => string | null }, plateNum?: (n: number) => string): FlowBuilder {
  const { doc, lang } = input
  const cat = visualCatalog(lang)
  const b = bookText(lang)
  const notes: BookNote[] = []
  let counter = 0
  const note = (entry: VisualEntry, extra: string[] = []): SafeHtml => {
    counter += 1
    const n = counter
    const icx: IdentityContext = { cat, lang, mode: 'print', doc, showNext: false, assetUrl: input.assetUrl }
    notes.push({ n, body: footParts(icx, entry, extra) })
    return html`<sup class="bk-ref"><a href="#bk-note-${n}" id="bk-ref-${n}" aria-label="${fillVisual(b.noteRef, { n: digits(lang, n) })}">${digits(lang, n)}</a></sup>`
  }
  const ctx: BlockContext = { cat, lang, mode: 'print', doc, idPrefix: 'bk', showNext: false, assetUrl: input.assetUrl, note, ...(plateNum ? { plateNum } : {}) }
  return { ctx, notes }
}

/** The identity chapter as book sections, in reading order, with notes numbered across the book. */
export function identitySections(input: BookInput): BookSection[] {
  const { doc, lang } = input
  const cat = visualCatalog(lang)
  const t = cat.identity
  const b = bookText(lang)
  const builder = bookBuilder(input)
  const color = doc.blocks.find(isBlock('color_palette'))
  const type = doc.blocks.find(isBlock('typography_specimen'))
  const logo = doc.blocks.find(isBlock('logo_construction'))
  const citations = doc.blocks.find(isBlock('citation_list'))
  const state = (ready: boolean) => ({ text: ready ? t.ready : t.waiting, ready })
  const sections: BookSection[] = []
  if (color) sections.push({ id: 'color', title: t.colorTitle, num: two(1), state: state(color.colors.length > 0), flows: colorFlows(color, builder) })
  if (type) sections.push({ id: 'type', title: t.typeTitle, num: two(2), state: state(type.roles.length > 0), flows: typeFlows(type, builder) })
  if (logo) sections.push({ id: 'logo', title: t.logoTitle, num: two(3), state: state(logo.spec !== null && logo.master !== null), flows: logoFlows(logo, builder) })
  sections.push({ id: 'appendix', title: b.appendixTitle, num: null, state: null, flows: appendixFlows(doc, citations, builder) })
  return sections
}

// ---------------------------------------------------------------------------------------------------------------
// Sheets

/** More contents entries than this switch the contents page to its compact rows. */
const COMPACT_TOC = 7

/** Front matter: cover (1), imprint (2), contents (3). Body pages start at 4. */
const FRONT = 3

interface SheetFrame {
  folio: number
  kind: string
  label: string
  runningHead: SafeHtml | null
  showFolio: boolean
  body: SafeHtml
  notes: BookNote[]
}

/** What a book says about itself on its cover, imprint, contents and running heads. */
export interface BookFrame {
  /** Cover title, document title. */
  title: string
  /** Cover kicker line. */
  kicker: string
  /** Cover and contents lead. */
  lead: string
  /** Kicker above the contents title. */
  contentsKicker: string
  /** Verso running head (followed by the brand name). */
  running: string
  /** Imprint "Document" line. */
  imprintDocument: string
}

/** Fields the shell (sheets, cover, imprint, contents) needs: the identity `BookInput` and the full book both fit. */
export interface ShellInput {
  doc: BookMeta
  lang: VisualLang
  commit: string | null
  /** The export read brand/ with changes not yet committed: the imprint says so next to the commit. */
  uncommitted?: boolean
  head: SafeHtml
  toolbar: SafeHtml
}

function sheet(input: ShellInput, frame: SheetFrame): SafeHtml {
  const { doc, lang } = input
  const cat = visualCatalog(lang)
  const b = bookText(lang)
  const side = frame.folio % 2 === 1 ? 'recto' : 'verso'
  const classification = doc.audience === 'internal' ? cat.text.classInternal : cat.text.classPublic
  const notes = frame.notes.length
    ? html`<aside class="bk-notes" aria-label="${b.notes}"><ol>${frame.notes.map((note) => html`<li id="bk-note-${note.n}"><a class="bk-note-num" href="#bk-ref-${note.n}">${digits(lang, note.n)}</a><span class="bk-note-body vz-foot">${note.body}</span></li>`)}</ol></aside>`
    : ''
  return html`<section class="bk-sheet bk-${side} bk-sheet--${frame.kind}" id="bk-p${frame.folio}" data-folio="${frame.folio}" aria-label="${frame.label}">
    <header class="bk-head">${frame.runningHead ? html`<span class="bk-head-class">${classification}${doc.illustrative ? html` · <strong>${cat.text.illustrative}</strong>` : ''}</span><span class="bk-head-title" dir="auto">${frame.runningHead}</span>` : ''}</header>
    <div class="bk-body"><div class="bk-flows">${frame.body}</div>${notes}</div>
    <footer class="bk-folio">${frame.showFolio ? html`<span class="bk-folio-num" aria-label="${fillVisual(b.folio, { n: digits(lang, frame.folio) })}">${digits(lang, frame.folio)}</span>` : ''}</footer>
  </section>`
}

function mockStamp(input: ShellInput): SafeHtml {
  const cat = visualCatalog(input.lang)
  if (!input.doc.illustrative) return html``
  return html`<p class="vz-mock bk-mock" role="note"><strong>${cat.text.illustrative}</strong> <span>${cat.text.illustrativeNote}</span></p>`
}

function cover(input: ShellInput, frame: BookFrame): SafeHtml {
  const { doc, lang } = input
  const cat = visualCatalog(lang)
  const asOf = dateOnly(doc.as_of, lang)
  const edition = doc.audience === 'internal' ? cat.text.editionInternal : cat.text.editionPublic
  return html`<div class="bk-cover">
    <p class="bk-cover-kicker"><span class="vz-kicker-bar" aria-hidden="true"></span>${frame.kicker}</p>
    <div class="bk-cover-main">
      <p class="bk-cover-brand" dir="auto">${doc.brand_name}</p>
      <h1 class="bk-cover-title">${frame.title}</h1>
      <p class="bk-cover-lead">${frame.lead}</p>
    </div>
    ${mockStamp(input)}
    <dl class="bk-cover-meta">
      <div><dt>${cat.text.classification}</dt><dd><span class="vz-edition vz-edition--${doc.audience}">${edition}</span></dd></div>
      <div><dt>${cat.text.asOfLabel}</dt><dd>${asOf ? fillVisual(cat.text.asOf, { date: asOf }) : cat.text.asOfNone}</dd></div>
    </dl>
  </div>`
}

function imprint(input: ShellInput, frame: BookFrame, pageCount: number): SafeHtml {
  const { doc, lang } = input
  const cat = visualCatalog(lang)
  const b = bookText(lang)
  const asOf = dateOnly(doc.as_of, lang)
  const edition = doc.audience === 'internal' ? cat.text.editionInternal : cat.text.editionPublic
  return html`<div class="bk-imprint">
    ${mockStamp(input)}
    <h2 class="bk-imprint-title">${b.imprintTitle}</h2>
    <dl class="bk-imprint-list">
      <div><dt>${b.imprintBrand}</dt><dd dir="auto">${doc.brand_name}</dd></div>
      <div><dt>${b.imprintDocument}</dt><dd>${frame.imprintDocument}</dd></div>
      <div><dt>${b.imprintEdition}</dt><dd>${edition}</dd></div>
      <div><dt>${b.imprintAsOf}</dt><dd>${asOf ?? cat.text.asOfNone}</dd></div>
      <div><dt>${b.imprintCommit}</dt><dd><code class="vz-code" dir="ltr">${input.commit ? input.commit.slice(0, 12) : '—'}</code>${input.commit && input.uncommitted ? html` <span class="bk-imprint-uncommitted">${b.imprintUncommitted}</span>` : ''}</dd></div>
      <div><dt>${b.imprintFormat}</dt><dd>${fillVisual(b.formatBook, { pages: digits(lang, pageCount) })}</dd></div>
      <div><dt>${b.imprintTypeset}</dt><dd>${b.typesetValue}</dd></div>
    </dl>
    <p class="bk-imprint-text">${b.imprintRules}</p>
    <p class="bk-imprint-text">${b.imprintClaims}</p>
    <p class="bk-imprint-text bk-imprint-origin">${doc.illustrative ? b.imprintOriginFixture : b.imprintOrigin}</p>
  </div>`
}

function contents(input: ShellInput, frame: BookFrame, sections: BookSection[], firstPage: Map<string, number>): SafeHtml {
  const { lang } = input
  const b = bookText(lang)
  // A long contents (the full books) sets tighter rows so every entry fits on page 3; short books keep the airy rows.
  return html`<div class="bk-contents${sections.length > COMPACT_TOC ? ' bk-contents--compact' : ''}">
    <p class="vz-kicker"><span class="vz-kicker-bar" aria-hidden="true"></span>${frame.contentsKicker}</p>
    <h2 class="bk-contents-title">${b.contentsTitle}</h2>
    <p class="bk-contents-lead">${frame.lead}</p>
    <nav class="bk-toc" aria-label="${b.contentsTitle}">
      <p class="bk-toc-col" aria-hidden="true"><span></span><span>${b.contentsPage}</span></p>
      <ol>${sections.map((section) => {
        const page = firstPage.get(section.id)!
        return html`<li class="bk-toc-item${section.num ? '' : ' bk-toc-item--appendix'}"><a href="#bk-p${page}"><span class="bk-toc-num">${section.num ?? ''}</span><span class="bk-toc-name">${section.title}</span><span class="bk-toc-leader" aria-hidden="true"></span><span class="bk-toc-page" data-toc-page="${page}">${digits(lang, page)}</span>${section.state ? html`<span class="bk-toc-state${section.state.ready ? ' is-ready' : ''}">${section.state.text}</span>` : ''}</a></li>`
      })}</ol>
    </nav>
  </div>`
}

export interface BookLayout {
  sections: BookSection[]
  pages: BookPage[]
  firstPage: Map<string, number>
  pageCount: number
}

/** Paginates sections after the front matter: the pages and the first page of every section (contents numbers). */
export function layoutBook(sections: BookSection[], heights?: Heights): BookLayout {
  const pages = paginate(sections, heights)
  const firstPage = new Map<string, number>()
  pages.forEach((page, i) => {
    if (!firstPage.has(page.section.id)) firstPage.set(page.section.id, FRONT + 1 + i)
  })
  return { sections, pages, firstPage, pageCount: FRONT + pages.length }
}

/** Layout result: the pages and the first page of every section (the contents page numbers). */
export function layoutIdentityBook(input: BookInput): BookLayout {
  return layoutBook(identitySections(input), input.heights)
}

function documentShell(input: ShellInput, title: string, bodyClass: string, main: SafeHtml): SafeHtml {
  const cat = visualCatalog(input.lang)
  return html`<!doctype html>
<html lang="${input.lang}" dir="${cat.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="same-origin">
<title>${title}</title>
${input.head}
</head>
<body class="${bodyClass}${input.doc.illustrative ? ' vz-is-mock' : ''}">
${input.toolbar}
${main}
</body>
</html>`
}

/**
 * Any book on the A4 portrait profile: cover, imprint, contents with page numbers, then the laid-out pages with
 * running heads (book title on verso, section title on recto), numbered notes and folios in the reader's digits.
 */
export function renderBook(input: ShellInput, frame: BookFrame, layout: BookLayout): { html: SafeHtml; pageCount: number } {
  const { doc, lang } = input
  const b = bookText(lang)
  const bookHead = html`${frame.running} · <span dir="auto">${doc.brand_name}</span>`
  const sheets: SafeHtml[] = [
    sheet(input, { folio: 1, kind: 'cover', label: frame.title, runningHead: null, showFolio: false, body: cover(input, frame), notes: [] }),
    sheet(input, { folio: 2, kind: 'imprint', label: b.imprintTitle, runningHead: null, showFolio: false, body: imprint(input, frame, layout.pageCount), notes: [] }),
    sheet(input, { folio: 3, kind: 'contents', label: b.contentsTitle, runningHead: null, showFolio: true, body: contents(input, frame, layout.sections, layout.firstPage), notes: [] }),
  ]
  layout.pages.forEach((page, i) => {
    const folio = FRONT + 1 + i
    const running = folio % 2 === 0 ? bookHead : html`${page.section.title}`
    const kicker = page.continued ? html`<p class="bk-continued">${fillVisual(b.continued, { title: page.section.title })}</p>` : ''
    const body = html`${kicker}${join(page.parts.map((part) => html`<div class="bk-flow" data-flow="${part.id}">${part.html}</div>`))}`
    sheets.push(sheet(input, { folio, kind: page.section.id === 'appendix' ? 'appendix' : 'plate', label: fillVisual(b.folio, { n: digits(lang, folio) }), runningHead: running, showFolio: true, body, notes: page.notes }))
  })
  const main = html`<main class="vz-print bk-book" id="main">${join(sheets)}</main>`
  return { html: documentShell(input, `${frame.title} · ${doc.brand_name}`, 'vz-print-body vz-book-body bk-doc', main), pageCount: layout.pageCount }
}

function identityFrame(lang: VisualLang): BookFrame {
  const cat = visualCatalog(lang)
  const b = bookText(lang)
  return { title: cat.identity.chapterTitle, kicker: b.coverKicker, lead: cat.identity.chapterLead, contentsKicker: cat.identity.chapterKicker, running: b.bookTitle, imprintDocument: `${b.bookTitle} · ${cat.identity.chapterTitle}` }
}

/**
 * The Visual identity chapter as an A4 portrait book: cover, imprint, contents with page numbers, the plates with
 * running heads, numbered notes and folios, and the sources appendix. Folio digits follow the reader's language.
 */
export function identityBookDocument(input: BookInput): { html: SafeHtml; pageCount: number } {
  return renderBook(input, identityFrame(input.lang), layoutIdentityBook(input))
}

/**
 * The galley for the measured pass: every flow at the text-block width, every note at the notes width, in one long
 * column. The export CLI measures it in Chrome and paginates the book with those heights.
 */
export function bookGalley(input: ShellInput, sections: BookSection[]): SafeHtml {
  const all: SafeHtml[] = []
  const notes: BookNote[] = []
  for (const section of sections) {
    for (const flow of section.flows) {
      if (flow.kind === 'block') {
        all.push(html`<div class="bk-flow" data-flow="${flow.id}">${flow.html}</div>`)
        notes.push(...(flow.notes ?? []))
      } else {
        all.push(html`<div class="bk-flow" data-flow-table="${flow.id}" data-rows="${flow.rows.length}">${flow.render([0, flow.rows.length], { index: 0, continues: false })}</div>`)
      }
    }
  }
  const lang = input.lang
  const noteList = html`<aside class="bk-notes"><ol>${notes.map((note) => html`<li data-note="${note.n}"><a class="bk-note-num">${digits(lang, note.n)}</a><span class="bk-note-body vz-foot">${note.body}</span></li>`)}</ol></aside>`
  const main = html`<main class="vz-print bk-book" id="main"><section class="bk-sheet bk-recto bk-galley"><header class="bk-head"></header><div class="bk-body"><div class="bk-flows">${join(all)}</div>${noteList}</div><footer class="bk-folio"></footer></section></main>`
  return documentShell(input, 'galley', 'vz-print-body vz-book-body bk-doc', main)
}

export function identityBookGalley(input: BookInput): SafeHtml {
  return bookGalley(input, identitySections(input))
}
