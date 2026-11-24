import type { VisualLang } from '@brand-os/brand-core/visual'
import { competitorText, visualCatalog } from '@brand-os/brand-core/visual'
import { studioAssets } from '../static-assets.js'
import { banner } from './components.js'
import { html, join, type SafeHtml } from './html.js'
import { icon } from './icons.js'
import { brandPath, type BrandView, type ViewContext } from './layout.js'
import { brandShell } from './pages.js'
import { comparisonDetails, comparisonOpener, comparisonPrintDocument, comparisonSources, type ComparisonContext } from './visual-competitors.js'
import { positioningDetails } from './visual-positioning.js'
import { renderBlock } from './visual-registry.js'

/**
 * "Competitor comparison matrix" page (Visual V2.2) and its print view. GET only: no form and no link that changes
 * anything. Drawn from the merged commit's shared landscape (`brand/competitive/shared/landscape.json`) and approved
 * facts; Studio never reads `brand/.private`. Internal edition only.
 */

function extraHead(): SafeHtml {
  return html`<link rel="stylesheet" href="${studioAssets.url('visual.css')}">`
}

export function competitorsPage(ctx: ViewContext, view: BrandView, flash: string | null): SafeHtml {
  const lang = ctx.i.locale as VisualLang
  const cat = visualCatalog(lang)
  const t = competitorText(lang)
  const p = view.cached.projection
  const shell = (body: SafeHtml) => brandShell(ctx, view, 'competitors', t.title, body, flash, extraHead())
  if (!p) return shell(html``)
  const visual = p.visual
  if (visual === undefined) return shell(banner({ tone: 'info', body: cat.text.pending }))
  if (visual === null || !visual.competitors) return shell(banner({ tone: 'warning', body: cat.text.unavailable }))
  const doc = visual.competitors
  const base = brandPath(view.record.slug, 'competitors')
  const blockCtx = { cat, lang, mode: 'screen' as const, doc, idPrefix: 'cmp', showNext: true, assetUrl: () => null }
  const cctx: ComparisonContext = { cat, lang, mode: 'screen', doc, showNext: true }
  const body = html`<div class="vz-screen vz-book vz-cmp">
      <div class="vz-toolbar">
        <p class="vz-edition-line"><span class="vz-edition vz-edition--internal">${cat.text.editionInternal}</span></p>
        <div class="vz-actions">
          <a class="btn btn-secondary btn-sm" href="${base}/print">${icon('book')}<span>${t.openPrint}</span></a>
        </div>
      </div>
      ${comparisonOpener(cctx, true)}
      ${join(doc.blocks.map((block) => renderBlock(block, blockCtx)))}
      ${comparisonSources(cctx, doc.blocks.some((block) => block.type === 'positioning_map') ? 4 : 3)}
      <details class="vz-details">
        <summary class="vz-details-summary">${icon('chevron', 'vz-details-icon')}<span>${cat.text.detailsTitle}</span></summary>
        <div class="vz-details-body">
          <p class="vz-details-lead">${t.internalOnly}</p>
          ${comparisonDetails(cctx)}
          ${positioningDetails(cctx, doc.blocks.find((block) => block.type === 'positioning_map'))}
        </div>
      </details>
    </div>`
  return shell(body)
}

export function competitorsPrintPage(ctx: ViewContext, view: BrandView): SafeHtml | null {
  const lang = ctx.i.locale as VisualLang
  const cat = visualCatalog(lang)
  const t = competitorText(lang)
  const doc = view.cached.projection?.visual?.competitors
  if (!doc) return null
  const toolbar = html`<nav class="vz-print-toolbar" aria-label="${t.printTitle}">
    <a class="vz-print-back" href="${brandPath(view.record.slug, 'competitors')}">${icon('chevron', 'vz-back-icon')}<span>${t.backToMatrix}</span></a>
    <p class="vz-print-hint">${cat.text.printOnly}</p>
    <button type="button" class="vz-print-button" data-print hidden>${cat.text.printButton}</button>
  </nav>`
  return comparisonPrintDocument(
    {
      doc,
      lang,
      commit: view.cached.status.sha,
      head: html`<link rel="icon" href="/static/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${studioAssets.url('visual.css')}"><script src="${studioAssets.url('visual.js')}" defer></script>`,
      toolbar,
    },
    (block, blockCtx) => renderBlock(block, { ...blockCtx, idPrefix: 'p', assetUrl: () => null }),
  )
}

/** The one link into the page, shown on the Business model page. */
export function competitorsBanner(lang: VisualLang, slug: string): SafeHtml {
  const t = competitorText(lang)
  return banner({ tone: 'info', title: t.bannerTitle, body: t.bannerBody, actions: html`<a class="btn btn-secondary btn-sm" href="${brandPath(slug, 'competitors')}">${icon('layers')}<span>${t.bannerLink}</span></a>` })
}
