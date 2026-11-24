import type { BusinessModelCanvasBlock, CitationListBlock, VisualDocument, VisualLang } from '@brand-os/brand-core/visual'
import { bookText, fillVisual, visualCatalog } from '@brand-os/brand-core/visual'
import { studioAssets } from '../static-assets.js'
import { banner, emptyState } from './components.js'
import { html, join, type SafeHtml } from './html.js'
import { icon } from './icons.js'
import { brandPath, type BrandView, type ViewContext } from './layout.js'
import { brandHeader, brandShell } from './pages.js'
import { renderBlock } from './visual-registry.js'
import { chapterOpener, frameworkNote } from './visual-identity.js'
import { identityBookDocument } from './visual-print-book.js'
import { competitorsBanner } from './visual-competitors-page.js'
import { detailsView, frameworkPanel, legend, miniMap, printDocument, relationshipsPanel, summaryView } from './visual.js'

/**
 * The read-only "Business model" page and its print view. GET only: no form, no link that changes anything. The
 * page shows the internal edition (approved, labelled drafts, gaps, withheld restricted values); the print view
 * can show the public edition, which leaves drafts out.
 */

function canvasBlock(doc: { blocks: Array<{ type: string }> }): BusinessModelCanvasBlock {
  return doc.blocks.find((block) => block.type === 'business_model_canvas') as BusinessModelCanvasBlock
}

function extraHead(): SafeHtml {
  return html`<link rel="stylesheet" href="${studioAssets.url('visual.css')}">`
}

export function visualPage(ctx: ViewContext, view: BrandView, flash: string | null): SafeHtml {
  const lang = ctx.i.locale as VisualLang
  const cat = visualCatalog(lang)
  const p = view.cached.projection
  const shell = (body: SafeHtml) => brandShell(ctx, view, 'visual', cat.text.canvasTitle, body, flash, extraHead())
  if (!p) return shell(html``)
  const header = brandHeader(ctx, view, cat.text.canvasTitle, cat.text.decisionBody)
  const visual = p.visual
  if (visual === undefined) return shell(html`${header}${banner({ tone: 'info', body: cat.text.pending })}`)
  if (visual === null) return shell(html`${header}${banner({ tone: 'warning', body: cat.text.unavailable })}`)
  if (!visual.bmc.applies) return shell(html`${header}${emptyState({ icon: 'briefcase', title: cat.text.notApplicableTitle, body: cat.text.notApplicableBody })}`)
  const doc = visual.bmc.internal
  const canvas = canvasBlock(doc)
  const base = brandPath(view.record.slug, 'visual')
  const asOf = doc.as_of ? new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeZone: 'UTC' }).format(Date.parse(doc.as_of)) : null
  const body = html`${header}
    <div class="vz-screen">
      <div class="vz-toolbar">
        <p class="vz-edition-line"><span class="vz-edition vz-edition--internal">${cat.text.editionInternal}</span></p>
        <div class="vz-actions">
          <a class="btn btn-secondary btn-sm" href="${base}/print">${icon('book')}<span>${cat.text.openPrint}</span></a>
          <a class="btn btn-ghost btn-sm" href="${base}/print?edition=public">${icon('globe')}<span>${cat.text.openPrintPublic}</span></a>
        </div>
      </div>
      <section class="vz-overview" aria-label="${cat.text.summaryTitle}">
        <div class="vz-overview-map">
          <p class="vz-overline">${cat.text.zoneIndex}</p>
          ${miniMap(cat, canvas, 'bmc', true)}
        </div>
        <div class="vz-overview-summary">
          <p class="vz-overline">${cat.text.summaryTitle} · ${asOf ? fillVisual(cat.text.asOf, { date: asOf }) : cat.text.asOfNone}</p>
          ${summaryView(cat, doc, lang)}
        </div>
      </section>
      ${renderBlock(canvas, { cat, lang, mode: 'screen', doc, idPrefix: 'bmc', showNext: true, assetUrl: () => null })}
      ${legend(cat, ['approved', 'stale', 'assumption', 'recommendation', 'withheld', 'missing', 'not_applicable'])}
      ${detailsView(cat, canvas, html`${relationshipsPanel(cat, canvas)}${frameworkPanel(cat, doc.framework_refs[0]!, lang, 'screen')}`, cat.text.editionInternalNote, true)}
      ${competitorsBanner(lang, view.record.slug)}
    </div>`
  return shell(body)
}

/** Full-page print document (A3 landscape). Read-only; the only control is the browser's own print command. */
export function visualPrintPage(ctx: ViewContext, view: BrandView, edition: 'internal' | 'public'): SafeHtml | null {
  const lang = ctx.i.locale as VisualLang
  const cat = visualCatalog(lang)
  const visual = view.cached.projection?.visual
  if (!visual || !visual.bmc.applies) return null
  const doc = edition === 'public' ? visual.bmc.public : visual.bmc.internal
  const toolbar = html`<nav class="vz-print-toolbar" aria-label="${cat.text.printTitle}">
    <a class="vz-print-back" href="${brandPath(view.record.slug, 'visual')}">${icon('chevron', 'vz-back-icon')}<span>${cat.text.backToCanvas}</span></a>
    <p class="vz-print-hint">${cat.text.printHint} ${cat.text.printOnly}</p>
    <button type="button" class="vz-print-button" data-print hidden>${cat.text.printButton}</button>
  </nav>`
  return printDocument({
    doc,
    lang,
    commit: view.cached.status.sha,
    head: html`<link rel="icon" href="/static/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${studioAssets.url('visual.css')}"><script src="${studioAssets.url('visual.js')}" defer></script>`,
    toolbar,
  })
}

/** Approved previews are served by the existing asset route (session-only, GET). */
export function assetUrlFor(slug: string): (key: string) => string | null {
  return (key) => (/^[0-9a-f]{64}$/.test(key) ? `/brands/${slug}/assets/file/${key}` : null)
}

/**
 * Brand Book "Visual identity" chapter (V2.1): read-only. The page shows the internal edition; every plate is drawn
 * from approved data only, or is the designed "awaiting approved asset" page. Ids are in the details disclosure.
 */
export function identityPage(ctx: ViewContext, view: BrandView, flash: string | null): SafeHtml {
  const lang = ctx.i.locale as VisualLang
  const cat = visualCatalog(lang)
  const t = cat.identity
  const p = view.cached.projection
  const shell = (body: SafeHtml) => brandShell(ctx, view, 'brand-book', t.chapterTitle, body, flash, extraHead())
  if (!p) return shell(html``)
  const visual = p.visual
  if (visual === undefined) return shell(banner({ tone: 'info', body: cat.text.pending }))
  if (visual === null || !visual.identity) return shell(banner({ tone: 'warning', body: cat.text.unavailable }))
  const doc: VisualDocument = visual.identity.internal
  const base = brandPath(view.record.slug, 'brand-book', '/visual-identity')
  const blockCtx = { cat, lang, mode: 'screen' as const, doc, idPrefix: 'vi', showNext: true, assetUrl: assetUrlFor(view.record.slug) }
  const plates = doc.blocks.filter((block) => block.type !== 'citation_list')
  const citations = doc.blocks.find((block): block is CitationListBlock => block.type === 'citation_list')
  const body = html`<div class="vz-screen vz-book">
      <div class="vz-toolbar">
        <p class="vz-edition-line"><span class="vz-edition vz-edition--internal">${cat.text.editionInternal}</span></p>
        <div class="vz-actions">
          <a class="btn btn-secondary btn-sm" href="${base}/print">${icon('book')}<span>${cat.text.openPrint}</span></a>
          <a class="btn btn-ghost btn-sm" href="${base}/print?edition=public">${icon('globe')}<span>${cat.text.openPrintPublic}</span></a>
        </div>
      </div>
      ${chapterOpener(blockCtx, true)}
      ${join(plates.map((block) => renderBlock(block, blockCtx)))}
      <details class="vz-details">
        <summary class="vz-details-summary">${icon('chevron', 'vz-details-icon')}<span>${cat.text.detailsTitle}</span></summary>
        <div class="vz-details-body">
          <p class="vz-details-lead">${cat.text.editionInternalNote}</p>
          ${legend(cat, ['approved', 'stale', 'assumption', 'withheld', 'missing'])}
          <div class="vz-panels">${citations ? renderBlock(citations, blockCtx) : ''}${join(doc.framework_refs.map((ref) => frameworkNote(cat, ref, 'screen', lang)))}</div>
        </div>
      </details>
    </div>`
  return shell(body)
}

/**
 * Print view of the chapter: the print engine's `book_a4_portrait` profile (V1.2): cover, imprint, contents with
 * page numbers, running heads, notes and folios. Read-only; the only control is the browser's own print command.
 */
export function identityPrintPage(ctx: ViewContext, view: BrandView, edition: 'internal' | 'public'): SafeHtml | null {
  const lang = ctx.i.locale as VisualLang
  const cat = visualCatalog(lang)
  const identity = view.cached.projection?.visual?.identity
  if (!identity) return null
  const doc = edition === 'public' ? identity.public : identity.internal
  const toolbar = html`<nav class="vz-print-toolbar" aria-label="${cat.identity.printTitle}">
    <a class="vz-print-back" href="${brandPath(view.record.slug, 'brand-book', '/visual-identity')}">${icon('chevron', 'vz-back-icon')}<span>${cat.identity.backToChapter}</span></a>
    <p class="vz-print-hint">${bookText(lang).printHint} ${cat.text.printOnly}</p>
    <button type="button" class="vz-print-button" data-print hidden>${cat.text.printButton}</button>
  </nav>`
  return identityBookDocument({
    doc,
    lang,
    commit: view.cached.status.sha,
    head: html`<link rel="icon" href="/static/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${studioAssets.url('visual.css')}"><link rel="stylesheet" href="${studioAssets.url('visual-book.css')}"><script src="${studioAssets.url('visual.js')}" defer></script>`,
    toolbar,
    assetUrl: assetUrlFor(view.record.slug),
  }).html
}
