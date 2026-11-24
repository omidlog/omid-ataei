import type { VisualLang } from '@brand-os/brand-core/visual'
import { mascotText, visualCatalog } from '@brand-os/brand-core/visual'
import { studioAssets } from '../static-assets.js'
import { banner } from './components.js'
import { html, join, type SafeHtml } from './html.js'
import { icon } from './icons.js'
import type { BrandView, ViewContext } from './layout.js'
import { brandShell } from './pages.js'
import { frameworkNote } from './visual-identity.js'
import { mascotIds, mascotOpener, mascotPrintDocument, type MascotContext } from './visual-mascot.js'
import { assetUrlFor } from './visual-page.js'
import { legend } from './visual-primitives.js'
import { renderBlock } from './visual-registry.js'

/**
 * "Mascot atlas" page (Visual V3.4) and its print view. GET only: no form and no link that changes anything. Drawn
 * from the merged commit's mascot catalog, stage list and asset manifest; only approved artwork is drawn, through
 * the existing asset route. The page shows the internal edition; the print view can show the public edition.
 */

function extraHead(): SafeHtml {
  return html`<link rel="stylesheet" href="${studioAssets.url('visual.css')}">`
}

export function mascotPage(ctx: ViewContext, view: BrandView, flash: string | null): SafeHtml {
  const lang = ctx.i.locale as VisualLang
  const cat = visualCatalog(lang)
  const t = mascotText(lang)
  const p = view.cached.projection
  const shell = (body: SafeHtml) => brandShell(ctx, view, 'assets', t.title, body, flash, extraHead())
  if (!p) return shell(html``)
  const visual = p.visual
  if (visual === undefined) return shell(banner({ tone: 'info', body: cat.text.pending }))
  if (visual === null || !visual.mascot) return shell(banner({ tone: 'warning', body: cat.text.unavailable }))
  const doc = visual.mascot.internal
  const base = `/brands/${view.record.slug}/brand/mascot`
  const blockCtx = { cat, lang, mode: 'screen' as const, doc, idPrefix: 'ma', showNext: true, assetUrl: assetUrlFor(view.record.slug) }
  const mctx: MascotContext = blockCtx
  const body = html`<div class="vz-screen vz-book vz-mascot">
      <div class="vz-toolbar">
        <p class="vz-edition-line"><span class="vz-edition vz-edition--internal">${cat.text.editionInternal}</span></p>
        <div class="vz-actions">
          <a class="btn btn-secondary btn-sm" href="${base}/print">${icon('book')}<span>${t.openPrint}</span></a>
          <a class="btn btn-ghost btn-sm" href="${base}/print?edition=public">${icon('globe')}<span>${t.openPrintPublic}</span></a>
        </div>
      </div>
      ${mascotOpener(mctx, true)}
      ${join(doc.blocks.map((block) => renderBlock(block, blockCtx)))}
      <details class="vz-details">
        <summary class="vz-details-summary">${icon('chevron', 'vz-details-icon')}<span>${cat.text.detailsTitle}</span></summary>
        <div class="vz-details-body">
          <p class="vz-details-lead">${cat.text.editionInternalNote}</p>
          ${legend(cat, ['approved', 'assumption', 'missing', 'withheld'])}
          <div class="vz-panels">${mascotIds(mctx)}${join(doc.framework_refs.map((ref) => frameworkNote(cat, ref, 'screen', lang)))}</div>
        </div>
      </details>
    </div>`
  return shell(body)
}

/** Print view (A4 portrait). Read-only; the only control is the browser's own print command. */
export function mascotPrintPage(ctx: ViewContext, view: BrandView, edition: 'internal' | 'public'): SafeHtml | null {
  const lang = ctx.i.locale as VisualLang
  const cat = visualCatalog(lang)
  const t = mascotText(lang)
  const mascot = view.cached.projection?.visual?.mascot
  if (!mascot) return null
  const doc = edition === 'public' ? mascot.public : mascot.internal
  const toolbar = html`<nav class="vz-print-toolbar" aria-label="${t.printTitle}">
    <a class="vz-print-back" href="/brands/${view.record.slug}/brand/mascot">${icon('chevron', 'vz-back-icon')}<span>${t.backToAtlas}</span></a>
    <p class="vz-print-hint">${cat.text.printOnly}</p>
    <button type="button" class="vz-print-button" data-print hidden>${cat.text.printButton}</button>
  </nav>`
  return mascotPrintDocument(
    {
      doc,
      lang,
      commit: view.cached.status.sha,
      head: html`<link rel="icon" href="/static/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${studioAssets.url('visual.css')}"><script src="${studioAssets.url('visual.js')}" defer></script>`,
      toolbar,
      assetUrl: assetUrlFor(view.record.slug),
    },
    (block, blockCtx) => renderBlock(block, { ...blockCtx, idPrefix: 'p' }),
  )
}
