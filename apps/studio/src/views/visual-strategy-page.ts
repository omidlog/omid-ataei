import type { VisualDocument, VisualLang } from '@brand-os/brand-core/visual'
import { strategyText, visualCatalog } from '@brand-os/brand-core/visual'
import { studioAssets } from '../static-assets.js'
import { banner } from './components.js'
import { html, join, type SafeHtml } from './html.js'
import { icon } from './icons.js'
import { brandPath, type BrandView, type ViewContext } from './layout.js'
import { brandShell } from './pages.js'
import { frameworkNote } from './visual-identity.js'
import { legend } from './visual-primitives.js'
import { renderBlock } from './visual-registry.js'
import { strategyIds, strategyOpener, strategyPrintDocument, type StrategyContext } from './visual-strategy.js'

/**
 * "SWOT / TOWS" and "Value Proposition Canvas" pages (Visual V3.2) and their print views. GET only: no form and no
 * link that changes anything. Drawn from the merged commit's list answers through the projection; the page shows the
 * internal edition, the print view can show the public edition (approved, published lists only).
 */

export type StrategyPageKind = 'swot' | 'value-proposition'

function extraHead(): SafeHtml {
  return html`<link rel="stylesheet" href="${studioAssets.url('visual.css')}">`
}

function docsOf(view: BrandView, kind: StrategyPageKind): { internal: VisualDocument; public: VisualDocument } | null {
  const strategy = view.cached.projection?.visual?.strategy
  if (!strategy) return null
  return kind === 'swot' ? strategy.swot : strategy.value_proposition
}

/** The sibling page link, so the two Strategy Lab pages read as one set. */
function siblingLink(lang: VisualLang, slug: string, kind: StrategyPageKind): SafeHtml {
  const t = strategyText(lang)
  const other: StrategyPageKind = kind === 'swot' ? 'value-proposition' : 'swot'
  return html`<p class="vz-sibling"><span class="vz-muted">${t.linksTitle}:</span> <a href="${brandPath(slug, other)}">${other === 'swot' ? t.linkSwot : t.linkVpc}</a> · <a href="${brandPath(slug, 'visual')}">${visualCatalog(lang).text.canvasTitle}</a></p>`
}

export function strategyPage(ctx: ViewContext, view: BrandView, kind: StrategyPageKind, flash: string | null): SafeHtml {
  const lang = ctx.i.locale as VisualLang
  const cat = visualCatalog(lang)
  const t = strategyText(lang)
  const title = kind === 'swot' ? t.swotPageTitle : t.vpcTitle
  const p = view.cached.projection
  const shell = (body: SafeHtml) => brandShell(ctx, view, kind, title, body, flash, extraHead())
  if (!p) return shell(html``)
  const visual = p.visual
  if (visual === undefined) return shell(banner({ tone: 'info', body: cat.text.pending }))
  const docs = docsOf(view, kind)
  if (visual === null || !docs) return shell(banner({ tone: 'warning', body: cat.text.unavailable }))
  const doc = docs.internal
  const base = brandPath(view.record.slug, kind)
  const blockCtx = { cat, lang, mode: 'screen' as const, doc, idPrefix: kind === 'swot' ? 'st' : 'vpc', showNext: true, assetUrl: () => null }
  const sctx: StrategyContext = blockCtx
  const body = html`<div class="vz-screen vz-book vz-strategy">
      <div class="vz-toolbar">
        <p class="vz-edition-line"><span class="vz-edition vz-edition--internal">${cat.text.editionInternal}</span></p>
        <div class="vz-actions">
          <a class="btn btn-secondary btn-sm" href="${base}/print">${icon('book')}<span>${t.openPrint}</span></a>
          <a class="btn btn-ghost btn-sm" href="${base}/print?edition=public">${icon('globe')}<span>${t.openPrintPublic}</span></a>
        </div>
      </div>
      ${strategyOpener(sctx, true)}
      ${join(doc.blocks.map((block) => renderBlock(block, blockCtx)))}
      ${siblingLink(lang, view.record.slug, kind)}
      <details class="vz-details">
        <summary class="vz-details-summary">${icon('chevron', 'vz-details-icon')}<span>${cat.text.detailsTitle}</span></summary>
        <div class="vz-details-body">
          <p class="vz-details-lead">${cat.text.editionInternalNote}</p>
          ${legend(cat, ['approved', 'assumption', 'missing', 'withheld'])}
          <div class="vz-panels">${strategyIds(sctx)}${join(doc.framework_refs.map((ref) => frameworkNote(cat, ref, 'screen', lang)))}</div>
        </div>
      </details>
    </div>`
  return shell(body)
}

/** Print view (A4 portrait). Read-only; the only control is the browser's own print command. */
export function strategyPrintPage(ctx: ViewContext, view: BrandView, kind: StrategyPageKind, edition: 'internal' | 'public'): SafeHtml | null {
  const lang = ctx.i.locale as VisualLang
  const cat = visualCatalog(lang)
  const t = strategyText(lang)
  const docs = docsOf(view, kind)
  if (!docs) return null
  const doc = edition === 'public' ? docs.public : docs.internal
  const toolbar = html`<nav class="vz-print-toolbar" aria-label="${t.printTitle}">
    <a class="vz-print-back" href="${brandPath(view.record.slug, kind)}">${icon('chevron', 'vz-back-icon')}<span>${kind === 'swot' ? t.backToSwot : t.backToVpc}</span></a>
    <p class="vz-print-hint">${cat.text.printOnly}</p>
    <button type="button" class="vz-print-button" data-print hidden>${cat.text.printButton}</button>
  </nav>`
  return strategyPrintDocument(
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
