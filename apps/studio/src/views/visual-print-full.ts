import { entityOptionLabel, entitySpec } from '@brand-os/brand-core'
import type { BookChapter, BookDocument, DataState, VisualDocument, VisualEntityItem, VisualEntry, VisualLang } from '@brand-os/brand-core/visual'
import { bookText, emptyStatusSummary, entryLabel, fillVisual, fullBookText, VISUAL_SCHEMA, visualCatalog } from '@brand-os/brand-core/visual'
import { html, join, type SafeHtml } from './html.js'
import { icon } from './icons.js'
import { plateHead } from './visual-identity.js'
import { dateOnly, ghostChart, stateChip } from './visual-primitives.js'
import {
  appendixFlows,
  blockFlow,
  bookBuilder,
  bookGalley,
  colorFlows,
  digits,
  isBlock,
  layoutBook,
  logoFlows,
  renderBook,
  typeFlows,
  type BookFlow,
  type BookFrame,
  type BookLayout,
  type BookSection,
  type FlowBuilder,
  type Heights,
  type ShellInput,
} from './visual-print-book.js'

/**
 * Full Brand Book and Business Report (Visual V4.2) on the V1.2 `book_a4_portrait` engine. This file only turns a
 * `BookDocument` into book sections; the cover, imprint, contents with folios, running heads, notes, pagination and
 * the measured galley are the engine's (`visual-print-book.ts`), and the colour, type and logo plates are the
 * identity chapter's own flows. Read-only; no inline style or script (strict CSP); styles in `static/visual-book.css`.
 *
 * Only approved values are printed (the core model already removed every other value). A chapter with nothing
 * approved, a planned chapter and a chapter that prints on its own get a designed "not yet available" page.
 */

export interface FullBookInput {
  book: BookDocument
  lang: VisualLang
  commit: string | null
  /** The export read brand/ with changes not yet committed: the imprint says so next to the commit. */
  uncommitted?: boolean
  head: SafeHtml
  toolbar: SafeHtml
  assetUrl: (key: string) => string | null
  /** Measured heights from the export CLI's first pass; without them the built-in estimates are used. */
  heights?: Heights
}

function shell(input: FullBookInput): ShellInput {
  return { doc: input.book, lang: input.lang, commit: input.commit, uncommitted: input.uncommitted, head: input.head, toolbar: input.toolbar }
}

/** The document the plates and the appendix framework note come from; an empty shell when the book has neither. */
function baseDocument(book: BookDocument): VisualDocument {
  const doc = book.identity ?? book.canvas
  if (doc) return doc
  return {
    schema: VISUAL_SCHEMA,
    schema_version: 1,
    document_kind: 'visual_identity',
    brand_id: book.brand_id,
    brand_name: book.brand_name,
    audience: book.audience,
    illustrative: book.illustrative,
    origin: book.origin,
    as_of: book.as_of,
    classification: book.audience,
    print_profile: 'book_a4_portrait',
    status_summary: emptyStatusSummary(),
    framework_refs: [],
    blocks: [],
  }
}

export function fullBookFrame(book: BookDocument, lang: VisualLang): BookFrame {
  const t = fullBookText(lang).book[book.book_kind]
  return { title: t.title, kicker: t.kicker, lead: t.lead, contentsKicker: t.title, running: t.running, imprintDocument: t.title }
}

function chapterTitle(chapter: BookChapter, lang: VisualLang): string {
  const id = chapter.chapter_id
  const identity = visualCatalog(lang).identity
  if (id === 'color') return identity.colorTitle
  if (id === 'type') return identity.typeTitle
  if (id === 'logo') return identity.logoTitle
  return fullBookText(lang).chapter[id].title
}

/** Rough line count for the built-in estimate: generous, so an estimated page never overflows. */
function textMm(text: string, perLine = 72, lineMm = 6): number {
  return Math.max(1, Math.ceil(text.length / perLine)) * lineMm
}

function gapReason(entry: VisualEntry, lang: VisualLang): string {
  const t = fullBookText(lang)
  const cat = visualCatalog(lang)
  if (entry.state === 'assumption' || entry.state === 'recommendation') return t.draftNotPrinted
  if (entry.state === 'withheld') return t.withheldNotPrinted
  if (entry.state === 'not_applicable') return entry.na_reason === 'profile' ? t.notApplicableProfile : t.notApplicable
  return entry.missing_reason ? cat.missingReason[entry.missing_reason] : cat.text.noValueYet
}

function printed(entry: VisualEntry): boolean {
  return (entry.state === 'approved' || entry.state === 'stale') && entry.value !== null
}

/** Names of the list items this book prints, by item id, so a link reads as a name; an id is never printed. */
type ItemNames = Map<string, string>

function itemNames(book: BookDocument): ItemNames {
  const names: ItemNames = new Map()
  for (const chapter of book.chapters) {
    const entries = chapter.kind === 'facts' || chapter.kind === 'plate' ? chapter.entries : chapter.kind === 'canvas' ? chapter.zones.flatMap((zone) => zone.entries) : []
    for (const entry of entries) if (printed(entry)) for (const item of entry.items ?? []) names.set(item.id, item.name)
  }
  return names
}

/**
 * Visual V3.1: an approved list answer prints as its items, in the owner's order, numbered in the page language:
 * name, labelled choices, detail, and links as the target item's name (or "not shown in this edition"). Item ids are
 * technical and never printed. Earlier free text kept on a list question prints as written, with its legacy note.
 */
function valueBody(entry: VisualEntry, names: ItemNames, lang: VisualLang, cls: string): SafeHtml {
  const cat = visualCatalog(lang)
  if (entry.items && entry.items.length) {
    const spec = entitySpec(entry.id)
    const label = (item: VisualEntityItem) => item.tags.map((tag) => html`<span class="fb-item-tag">${spec ? entityOptionLabel(spec, tag.field, tag.value, lang) : tag.value}</span>`)
    return html`<ol class="fb-items ${cls}">${entry.items.map(
      (item, i) => html`<li class="fb-item"><p class="fb-item-head"><span class="fb-item-num">${digits(lang, i + 1, 2)}</span><span class="fb-item-name" dir="auto">${item.name}</span>${label(item)}</p>${
        item.detail ? html`<p class="fb-item-detail" dir="auto">${item.detail}</p>` : ''
      }${
        item.links.length
          ? html`<p class="fb-item-links"><span class="fb-item-links-k">${cat.entities.linkTo}:</span> ${join(
              item.links.map((link) => (names.has(link) ? html`<span dir="auto">${names.get(link)!}</span>` : html`<span class="fb-item-link--hidden">${cat.entities.linkHidden}</span>`)),
              lang === 'fa' ? '، ' : ', ',
            )}</p>`
          : ''
      }</li>`,
    )}</ol>`
  }
  const value = html`<p class="fb-entry-value" dir="auto">${entry.value}</p>`
  return entry.legacy ? html`${value}<p class="fb-legacy">${cat.entities.legacy}</p>` : value
}

/** Built-in height estimate of a printed value (list items take a row each, plus detail and links lines). */
function valueMm(entry: VisualEntry, perLine: number, lineMm: number): number {
  if (!entry.items?.length) return textMm(entry.value ?? '', perLine, lineMm) + (entry.legacy ? lineMm : 0)
  return entry.items.reduce((sum, item) => sum + 2 + textMm(item.name, perLine, lineMm) + (item.detail ? textMm(item.detail, perLine, lineMm) : 0) + (item.links.length ? lineMm : 0), 0)
}

/** One entry: label, value and its approval line; or, for a gap, label and why there is no value. */
function entryFlow(id: string, entry: VisualEntry, lang: VisualLang, names: ItemNames = new Map()): BookFlow {
  const cat = visualCatalog(lang)
  const t = fullBookText(lang)
  const label = entryLabel(lang, entry.id, entry.label)
  if (!printed(entry)) {
    return blockFlow(id, html`<div class="fb-entry fb-entry--gap"><p class="fb-entry-label" dir="auto">${label}</p><p class="fb-entry-gap">${stateChip(cat, entry.state)}<span>${gapReason(entry, lang)}</span></p></div>`, 15)
  }
  const date = dateOnly(entry.approved_at, lang)
  const meta = [entry.version !== null ? fillVisual(cat.text.version, { version: digits(lang, entry.version) }) : null, date ? fillVisual(t.approvedOn, { date }) : null].filter((part): part is string => part !== null)
  return blockFlow(
    id,
    html`<div class="fb-entry"><p class="fb-entry-label" dir="auto">${label}</p>${valueBody(entry, names, lang, '')}<p class="fb-entry-meta">${stateChip(cat, entry.state)}${meta.map((part) => html`<span>${part}</span>`)}</p></div>`,
    18 + valueMm(entry, 72, 6),
  )
}

/** The public edition prints approved facts only; gaps are listed in the internal edition. */
function visible(entries: VisualEntry[], book: BookDocument): VisualEntry[] {
  return book.audience === 'public' ? entries.filter(printed) : entries
}

function head(id: string, num: string, title: string, lead: string, ready: boolean, lang: VisualLang): BookFlow {
  const t = fullBookText(lang)
  const state = ready ? html`<span class="vz-plate-state vz-plate-state--ready">${t.stateReady}</span>` : html`<span class="vz-plate-state">${t.stateUnavailable}</span>`
  return blockFlow(`${id}:head`, plateHead(num, `fb-${id}`, title, lead, state), lead ? 34 : 26, { keepWithNext: true })
}

function unavailableFlows(chapter: Extract<BookChapter, { kind: 'unavailable' }>, num: string, lang: VisualLang): BookFlow[] {
  const t = fullBookText(lang)
  const cat = visualCatalog(lang)
  const title = chapterTitle(chapter, lang)
  const lead = chapter.chapter_id in t.chapter ? t.chapter[chapter.chapter_id as keyof typeof t.chapter].lead : ''
  const where = t.separateWhere[chapter.chapter_id] ?? ''
  const awaiting = chapter.awaiting
  const body = html`<div class="fb-unavailable">
    <div class="fb-unavailable-art">${ghostChart({ title: t.unavailableKicker, variant: 'lines' })}</div>
    <div class="fb-unavailable-copy">
      <p class="fb-unavailable-kicker">${icon('clock')}<span>${t.unavailableKicker}</span></p>
      <h3 class="fb-unavailable-title">${fillVisual(t.unavailableTitle, { chapter: title })}</h3>
      <p class="fb-unavailable-body">${fillVisual(t.unavailable[chapter.reason], { where })}</p>
      ${awaiting.length ? html`<p class="fb-unavailable-sub">${t.awaitingTitle}</p><ul class="fb-unavailable-list">${awaiting.map((entry) => html`<li>${stateChip(cat, entry.state)}<span dir="auto">${entryLabel(lang, entry.id, entry.label)}</span></li>`)}</ul>` : ''}
    </div>
  </div>`
  return [head(chapter.chapter_id, num, title, lead, false, lang), blockFlow(`${chapter.chapter_id}:unavailable`, body, 92 + awaiting.length * 8)]
}

function canvasFlows(chapter: Extract<BookChapter, { kind: 'canvas' }>, book: BookDocument, num: string, lang: VisualLang): BookFlow[] {
  const t = fullBookText(lang)
  const cat = visualCatalog(lang)
  const flows: BookFlow[] = [head(chapter.chapter_id, num, t.chapter.business_model_canvas.title, t.chapter.business_model_canvas.lead, true, lang)]
  const names = itemNames(book)
  for (const zone of chapter.zones) {
    const entries = visible(zone.entries, book)
    const items = entries.map((entry) =>
      printed(entry)
        ? html`<li class="fb-zone-entry">${valueBody(entry, names, lang, 'fb-items--zone')}<p class="fb-entry-meta">${stateChip(cat, entry.state)}<span dir="auto">${entryLabel(lang, entry.id, entry.label)}</span></p></li>`
        : html`<li class="fb-zone-entry fb-zone-entry--gap">${stateChip(cat, entry.state)}<span dir="auto">${entryLabel(lang, entry.id, entry.label)}</span><span>${gapReason(entry, lang)}</span></li>`,
    )
    const mm = 14 + entries.reduce((sum, entry) => sum + (printed(entry) ? 12 + valueMm(entry, 72, 5.5) : 9), 0)
    flows.push(
      blockFlow(
        `canvas:${zone.zone_id}`,
        html`<section class="fb-zone"><h3 class="fb-zone-title"><span class="fb-zone-num">${digits(lang, zone.order, 2)}</span><span>${cat.zone[zone.zone_id].title}</span></h3>${items.length ? html`<ul class="fb-zone-list">${items}</ul>` : html`<p class="fb-zone-gap">${t.zoneGap}</p>`}</section>`,
        items.length ? mm : 22,
      ),
    )
  }
  flows.push(blockFlow('canvas:note', html`<p class="vz-note fb-canvas-note">${t.canvasNote}</p>`, 12))
  return flows
}

function rulesFlows(id: string, entries: VisualEntry[], lang: VisualLang, names: ItemNames): BookFlow[] {
  if (!entries.length) return []
  const t = fullBookText(lang)
  return [blockFlow(`${id}:rules`, html`<h3 class="vz-sub fb-rules-title">${t.rulesTitle}</h3>`, 10, { keepWithNext: true }), ...entries.map((entry, i) => entryFlow(`${id}:r${i}`, entry, lang, names))]
}

function plateFlows(chapter: Extract<BookChapter, { kind: 'plate' }>, book: BookDocument, builder: FlowBuilder, lang: VisualLang): BookFlow[] {
  const identity = book.identity
  const rules = rulesFlows(chapter.chapter_id, visible(chapter.entries, book), lang, itemNames(book))
  if (!identity) return rules
  if (chapter.chapter_id === 'color') {
    const block = identity.blocks.find(isBlock('color_palette'))
    return [...(block ? colorFlows(block, builder) : []), ...rules]
  }
  if (chapter.chapter_id === 'type') {
    const block = identity.blocks.find(isBlock('typography_specimen'))
    return [...(block ? typeFlows(block, builder) : []), ...rules]
  }
  const block = identity.blocks.find(isBlock('logo_construction'))
  return [...(block ? logoFlows(block, builder) : []), ...rules]
}

function plateReady(book: BookDocument, id: 'color' | 'type' | 'logo'): boolean {
  const identity = book.identity
  if (!identity) return false
  if (id === 'color') return (identity.blocks.find(isBlock('color_palette'))?.colors.length ?? 0) > 0
  if (id === 'type') return (identity.blocks.find(isBlock('typography_specimen'))?.roles.length ?? 0) > 0
  const logo = identity.blocks.find(isBlock('logo_construction'))
  return Boolean(logo && logo.spec !== null && logo.master !== null)
}

/** Every entry the book cites, once, for the sources appendix (identity citations first). */
function citations(book: BookDocument, lang: VisualLang): Array<{ id: string; label: string; state: DataState; version: number | null; approved_at: string | null }> {
  const seen = new Map<string, { id: string; label: string; state: DataState; version: number | null; approved_at: string | null }>()
  const cited = book.identity?.blocks.find(isBlock('citation_list'))
  for (const item of cited?.items ?? []) seen.set(item.id, { ...item, label: entryLabel(lang, item.id, item.label) })
  for (const chapter of book.chapters) {
    const entries = chapter.kind === 'facts' || chapter.kind === 'plate' ? chapter.entries : chapter.kind === 'canvas' ? chapter.zones.flatMap((zone) => zone.entries) : []
    for (const entry of visible(entries, book)) {
      if (!seen.has(entry.id)) seen.set(entry.id, { id: entry.id, label: entryLabel(lang, entry.id, entry.label), state: entry.state, version: entry.version, approved_at: entry.approved_at })
    }
  }
  return [...seen.values()]
}

/** The book's chapters as engine sections, numbered in reading order, then the sources appendix. */
export function fullBookSections(input: FullBookInput): BookSection[] {
  const { book, lang } = input
  const t = fullBookText(lang)
  const cat = visualCatalog(lang)
  const base = baseDocument(book)
  const plateNumbers = new Map<number, string>()
  book.chapters.forEach((chapter, i) => {
    const plate = { color: 1, type: 2, logo: 3 }[chapter.chapter_id as 'color' | 'type' | 'logo']
    if (chapter.kind === 'plate' && plate) plateNumbers.set(plate, digits(lang, i + 1, 2))
  })
  const names = itemNames(book)
  const builder = bookBuilder({ doc: base, lang, assetUrl: input.assetUrl }, (n) => plateNumbers.get(n) ?? digits(lang, n, 2))
  const sections: BookSection[] = book.chapters.map((chapter, i) => {
    const num = digits(lang, i + 1, 2)
    const title = chapterTitle(chapter, lang)
    if (chapter.kind === 'unavailable') return { id: chapter.chapter_id, title, num, state: { text: t.stateUnavailable, ready: false }, flows: unavailableFlows(chapter, num, lang) }
    if (chapter.kind === 'canvas') return { id: chapter.chapter_id, title, num, state: { text: t.stateReady, ready: true }, flows: canvasFlows(chapter, book, num, lang) }
    if (chapter.kind === 'plate') {
      const ready = plateReady(book, chapter.chapter_id)
      return { id: chapter.chapter_id, title, num, state: { text: ready ? cat.identity.ready : cat.identity.waiting, ready }, flows: plateFlows(chapter, book, builder, lang) }
    }
    const lead = t.chapter[chapter.chapter_id as keyof typeof t.chapter].lead
    const flows = [head(chapter.chapter_id, num, title, lead, true, lang), ...visible(chapter.entries, book).map((entry, j) => entryFlow(`${chapter.chapter_id}:e${j}`, entry, lang, names))]
    return { id: chapter.chapter_id, title, num, state: { text: t.stateReady, ready: true }, flows }
  })
  sections.push({ id: 'appendix', title: bookText(lang).appendixTitle, num: null, state: null, flows: appendixFlows({ audience: book.audience, framework_refs: base.framework_refs }, { items: citations(book, lang) }, builder, t.sourcesIntro) })
  return sections
}

export function layoutFullBook(input: FullBookInput): BookLayout {
  return layoutBook(fullBookSections(input), input.heights)
}

/** The full Brand Book or Business Report as an A4 portrait book. */
export function fullBookDocument(input: FullBookInput): { html: SafeHtml; pageCount: number } {
  return renderBook(shell(input), fullBookFrame(input.book, input.lang), layoutFullBook(input))
}

/** The galley for the export CLI's measured pass. */
export function fullBookGalley(input: FullBookInput): SafeHtml {
  return bookGalley(shell(input), fullBookSections(input))
}
