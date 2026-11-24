import type { DocumentItem, DocumentModel, DocumentSection } from '@brand-os/brand-core'
import type { VisualBlock, VisualDocument, VisualLang } from '@brand-os/brand-core/visual'
import { visualCatalog } from '@brand-os/brand-core/visual'
import type { MessageKey } from '../i18n/index.js'
import { studioAssets } from '../static-assets.js'
import { banner, code, emptyState, itemValue, notApplicableList, shortSha, tagBadge } from './components.js'
import { html, join, type SafeHtml } from './html.js'
import { icon } from './icons.js'
import { brandPath, type BrandView, type ViewContext } from './layout.js'
import { brandShell } from './pages.js'
import { assetUrlFor } from './visual-page.js'
import { renderBlock, type BlockContext } from './visual-registry.js'

/**
 * Brand Book page (Visual V2.4, R3): an editorial chapter reader over the core `brand-book` document model, replacing
 * the generic `documentView` cards (which stay for Business OS prose and personal documents).
 *
 * - A book opener with a contents list (chapter number, title, state, dotted leader).
 * - One chapter per document section: chapter opener (number, title, lead, counts), approved values set as prose,
 *   do/don't pairs as a two-column spread, and the V2.1 specimen plates (colour, type, logo) drawn by the existing
 *   `VisualBlock` renderers from the visual identity document.
 * - Drafts are labelled "Draft, not approved" (and the logo master keeps its draft tag); nothing here says published.
 *   Template guidance is labelled as guidance; gaps name the question in words.
 * - A version footer per chapter (approved version, commit, date). Technical ids (source and question ids) only
 *   appear inside a details toggle.
 *
 * Read-only: no form, no write, no inline style or script (strict CSP). Classes live in `static/visual.css`.
 */

/** Chapters whose structured values are drawn by a V2.1 specimen plate instead of a generic value. */
const SPECIMENS: Record<string, { block: VisualBlock['type']; structured: string }> = {
  color: { block: 'color_palette', structured: 'color' },
  type: { block: 'typography_specimen', structured: 'font' },
  logo: { block: 'logo_construction', structured: 'logo_spec' },
}

const KNOWN_CHAPTERS = new Set(['overview', 'strategy', 'verbal', 'color', 'type', 'logo', 'governance'])

function chapterText(ctx: ViewContext, section: DocumentSection): { title: string; lead: string } {
  if (!KNOWN_CHAPTERS.has(section.id)) return { title: section.title, lead: section.purpose }
  return { title: ctx.i.t(`reader.ch.${section.id}.title` as MessageKey), lead: ctx.i.t(`reader.ch.${section.id}.lead` as MessageKey) }
}

/** Chapter numbers in the reader's own digits (Persian digits in Persian), always two wide. */
function ordinal(ctx: ViewContext, n: number): string {
  return new Intl.NumberFormat(ctx.i.locale, { minimumIntegerDigits: 2, useGrouping: false }).format(n)
}

function dateOf(ctx: ViewContext, iso: string | null): string | null {
  if (!iso) return null
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return null
  return new Intl.DateTimeFormat(ctx.i.locale, { dateStyle: 'long', timeZone: 'UTC' }).format(at)
}

function counts(section: DocumentSection): { approved: number; draft: number; open: number } {
  const approved = section.items.filter((item) => item.tag === 'approved').length
  const draft = section.items.filter((item) => item.tag === 'assumption').length
  return { approved, draft, open: section.items.length - approved - draft }
}

function stateText(ctx: ViewContext, section: DocumentSection): string {
  return ctx.i.t(`doc.section.${section.status}` as MessageKey)
}

/** Do/don't pairs as a two-column spread; each column says in words which side it is (never colour alone). */
function doDont(ctx: ViewContext, item: DocumentItem): SafeHtml | null {
  if (item.withheld || item.structured?.type !== 'voice_pairs') return null
  const { i } = ctx
  return html`<div class="vz-bk-dodont" role="table" aria-label="${item.label}">
    <div class="vz-bk-dodont-row vz-bk-dodont-head" role="row"><span role="columnheader">${icon('check')}${i.t('design.pairDo')}</span><span role="columnheader">${icon('close')}${i.t('design.pairDont')}</span></div>
    ${item.structured.pairs.map((pair) => html`<div class="vz-bk-dodont-row" role="row"><p class="vz-bk-do" role="cell" dir="auto">${pair.do}</p><p class="vz-bk-dont" role="cell" dir="auto">${pair.dont}</p></div>`)}
  </div>`
}

/**
 * The document model's item notes (English, from brand-core) mapped to the reader's localized marks, so an agent
 * suggestion, a tentative or estimated draft, and an owner's "unknown / skipped / not applicable" each say what they
 * are in the reader's language. An unlisted note falls back to the generic mark.
 */
export const ITEM_NOTE_KEYS: Record<string, MessageKey> = {
  'Agent suggestion. Not approved and not an owner decision.': 'reader.suggestionNote',
  'Tentative. The owner described this as possible, not decided.': 'reader.tentativeNote',
  'Estimate. Not approved.': 'reader.estimateNote',
  'The owner said this is unknown. Nothing was invented.': 'reader.gapUnknown',
  'Skipped by the owner.': 'reader.gapSkipped',
  'Marked not applicable by the owner.': 'reader.gapNotApplicable',
  'The last answer was deprecated.': 'reader.gapDeprecated',
}

function noteKey(item: DocumentItem): MessageKey | null {
  return item.note ? (ITEM_NOTE_KEYS[item.note.replace(/ Restricted value withheld\.$/, '')] ?? null) : null
}

/** One item set as editorial prose. Drafts and guidance say so in words; a gap says what is missing. */
function entry(ctx: ViewContext, item: DocumentItem): SafeHtml {
  const { i } = ctx
  const pairs = doDont(ctx, item)
  const known = noteKey(item)
  const template = item.id.startsWith('template:')
  const note =
    item.tag === 'assumption'
      ? html`<p class="vz-bk-mark vz-bk-mark--draft">${icon('clock')}<span>${i.t(known ?? 'reader.draftNote')}</span></p>`
      : item.tag === 'recommendation' && template
        ? html`<p class="vz-bk-mark vz-bk-mark--guidance">${icon('sparkle')}<span>${i.t('reader.guidanceNote')}</span></p>`
        : item.tag === 'recommendation'
          ? html`<p class="vz-bk-mark vz-bk-mark--draft">${icon('sparkle')}<span>${i.t(known ?? 'reader.suggestionNote')}</span></p>`
          : ''
  const value = item.tag === 'missing' && !item.withheld ? html`<p class="vz-bk-gap">${icon('circle')}<span>${i.t(known ?? 'reader.gap')}</span></p>` : (pairs ?? itemValue(i, item))
  return html`<article class="vz-bk-entry vz-bk-entry--${item.tag}">
    <header class="vz-bk-entry-head">
      <h3 class="vz-bk-entry-label" dir="auto">${item.label}</h3>
      ${item.tag === 'approved' || (item.tag === 'missing' && !item.withheld) ? '' : tagBadge(i, item.tag)}
    </header>
    <div class="vz-bk-entry-value">${value}</div>
    ${note}
    ${item.stands_for ? html`<p class="vz-bk-mark">${icon('user')}<span>${i.t('reader.fromPersonal')}</span></p>` : ''}
    ${item.note && item.value !== null && !item.withheld && item.tag === 'approved' ? html`<p class="vz-bk-entry-note" dir="auto">${item.note}</p>` : ''}
  </article>`
}

/** The technical ids of a chapter, only inside a details toggle. */
function chapterIds(ctx: ViewContext, section: DocumentSection, idPrefix: string): SafeHtml {
  const rows = section.items.filter((item) => item.source_ids.length > 0 || item.id)
  if (!rows.length) return html``
  return html`<details class="vz-details vz-bk-ids">
    <summary class="vz-details-summary">${icon('chevron', 'vz-details-icon')}<span>${ctx.i.t('reader.ids')}</span></summary>
    <div class="vz-details-body">
      <p class="vz-details-lead">${ctx.i.t('reader.idsLead')}</p>
      <dl class="vz-bk-id-list" id="${idPrefix}-ids">${rows.map(
        (item) => html`<div><dt dir="auto">${item.label}</dt><dd>${join([item.id, ...(item.stands_for ? [item.stands_for] : []), ...item.source_ids.filter((id) => id !== item.id)].map((id) => code(id, 'source-id')), ' ')}</dd></div>`,
      )}</dl>
    </div>
  </details>`
}

function chapterFooter(ctx: ViewContext, view: BrandView, n: number, title: string, section: DocumentSection): SafeHtml {
  const { i } = ctx
  const versions = section.items.filter((item) => item.tag === 'approved' && item.version !== null).map((item) => item.version as number)
  const version = versions.length ? i.t('reader.version', { version: i.number(Math.max(...versions)) }) : i.t('reader.versionNone')
  const status = view.cached.status
  const date = dateOf(ctx, status.committed_at ?? status.synced_at)
  const parts = [`${i.t('reader.chapter', { n: ordinal(ctx, n) })} · ${title}`, version]
  if (status.sha) parts.push(i.t('reader.commit', { sha: shortSha(status.sha) }))
  if (date) parts.push(date)
  return html`<footer class="vz-bk-foot"><p>${join(parts.map((part) => html`<span dir="auto">${part}</span>`), '<span aria-hidden="true"> · </span>')}</p></footer>`
}

function chapter(ctx: ViewContext, view: BrandView, section: DocumentSection, n: number, identity: VisualDocument | null): SafeHtml {
  const { i } = ctx
  const { title, lead } = chapterText(ctx, section)
  const id = `bk-${section.id}`
  const c = counts(section)
  const specimen = SPECIMENS[section.id]
  const block = specimen && identity ? identity.blocks.find((item) => item.type === specimen.block) : undefined
  // A specimen plate draws the structured colour, type or logo values; the rest of the chapter stays prose.
  const items = block ? section.items.filter((item) => item.structured?.type !== specimen!.structured) : section.items
  const lang = (ctx.i.locale as VisualLang) ?? 'en'
  const blockCtx: BlockContext | null =
    block && identity ? { cat: visualCatalog(lang), lang, mode: 'screen', doc: identity, idPrefix: `bk-${section.id}`, showNext: true, assetUrl: assetUrlFor(view.record.slug) } : null
  return html`<section class="vz-bk-chapter" id="${id}" aria-labelledby="${id}-t">
    <header class="vz-bk-opener">
      <p class="vz-bk-num">${i.t('reader.chapter', { n: ordinal(ctx, n) })}</p>
      <h2 class="vz-bk-title" id="${id}-t">${title}</h2>
      <p class="vz-bk-lead">${lead}</p>
      <p class="vz-bk-counts"><span class="vz-bk-state vz-bk-state--${section.status}">${stateText(ctx, section)}</span><span aria-hidden="true"> · </span><span>${i.t('reader.counts', { approved: i.number(c.approved), draft: i.number(c.draft), open: i.number(c.open) })}</span></p>
    </header>
    ${block && blockCtx ? html`<figure class="vz-bk-specimen" aria-label="${i.t('reader.specimen')}: ${title}">${renderBlock(block, blockCtx)}</figure>` : ''}
    ${items.length ? html`<div class="vz-bk-entries">${items.map((item) => entry(ctx, item))}</div>` : ''}
    ${notApplicableList(i, section)}
    ${chapterFooter(ctx, view, n, title, section)}
    ${chapterIds(ctx, section, id)}
  </section>`
}

function opener(ctx: ViewContext, view: BrandView, model: DocumentModel): SafeHtml {
  const { i } = ctx
  const status = view.cached.status
  const date = dateOf(ctx, status.committed_at ?? status.synced_at)
  const brandName = view.cached.projection?.brand.name ?? view.record.display_name
  return html`<header class="vz-opener vz-bk-book-opener">
    <p class="vz-kicker"><span class="vz-kicker-bar" aria-hidden="true"></span>${i.t('reader.kicker')}</p>
    <h1 class="vz-opener-title">${i.t('book.title')}</h1>
    <p class="vz-opener-brand" dir="auto">${brandName}</p>
    <p class="vz-opener-lead">${i.t('reader.lead')}</p>
    <nav class="vz-toc" aria-label="${i.t('reader.contents')}">
      <p class="vz-toc-title">${i.t('reader.contents')}</p>
      <ol>${model.sections.map((section, index) => {
        const ready = section.status === 'complete'
        return html`<li class="vz-toc-item${ready ? ' is-ready' : ''}"><a href="#bk-${section.id}"><span class="vz-toc-num">${ordinal(ctx, index + 1)}</span><span class="vz-toc-name">${chapterText(ctx, section).title}</span><span class="vz-toc-leader" aria-hidden="true"></span><span class="vz-toc-state">${stateText(ctx, section)}</span></a></li>`
      })}</ol>
    </nav>
    <p class="vz-opener-asof">${date ? i.t('reader.asOf', { date }) : i.t('reader.asOfNone')}</p>
  </header>`
}

export function brandBookPage(ctx: ViewContext, view: BrandView, flash: string | null): SafeHtml {
  const { i } = ctx
  const p = view.cached.projection
  const head = html`<link rel="stylesheet" href="${studioAssets.url('visual.css')}">`
  const shell = (body: SafeHtml) => brandShell(ctx, view, 'brand-book', i.t('book.title'), body, flash, head)
  if (!p) return shell(html``)
  const model = p.documents['brand-book']
  if (!model || model.sections.length === 0) return shell(emptyState({ icon: 'book', title: i.t('book.title'), body: i.t('doc.empty') }))
  const identity = p.visual?.identity?.internal ?? null
  const chapterPath = brandPath(view.record.slug, 'brand-book', '/visual-identity')
  const toolbar = html`<div class="vz-toolbar">
    <p class="vz-edition-line"><span class="vz-edition vz-edition--internal">${i.t('reader.edition')}</span></p>
    ${p.visual?.identity
      ? html`<div class="vz-actions">
          <a class="btn btn-secondary btn-sm" href="${chapterPath}">${icon('layers')}<span>${i.t('reader.openIdentity')}</span></a>
          <a class="btn btn-ghost btn-sm" href="${chapterPath}/print">${icon('book')}<span>${i.t('reader.printIdentity')}</span></a>
        </div>`
      : ''}
  </div>`
  const body = html`<div class="vz-screen vz-book vz-bk">
    ${toolbar}
    ${opener(ctx, view, model)}
    ${model.sections.map((section, index) => chapter(ctx, view, section, index + 1, identity))}
    ${p.visual === null ? banner({ tone: 'warning', body: visualCatalog((ctx.i.locale as VisualLang) ?? 'en').text.unavailable }) : ''}
  </div>`
  return shell(body)
}
