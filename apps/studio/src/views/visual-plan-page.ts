import type { VisualDocument, VisualLang } from '@brand-os/brand-core/visual'
import { fillVisual, planText, visualCatalog, visualProfilePermits } from '@brand-os/brand-core/visual'
import { studioAssets } from '../static-assets.js'
import { banner, emptyState } from './components.js'
import { html, type SafeHtml } from './html.js'
import { icon } from './icons.js'
import { brandPath, type BrandSection, type BrandView, type ViewContext } from './layout.js'
import { brandHeader, brandShell } from './pages.js'
import { dateOnly, legend } from './visual-primitives.js'
import { planIdsPanel, planPrintDocument, planSourcesTable, planTitles } from './visual-plan.js'
import { renderBlock } from './visual-registry.js'
import { frameworkNote } from './visual-identity.js'

/**
 * Visual V3.3 pages: Customer Journey Map (`/market/customer-journey`), SOSTAC® overview (`/strategy/sostac`) and OKR
 * tree (`/strategy/okrs`), each with an A3 print view (`/print`). GET only: no form and no link that changes anything.
 * The page and the print view show the internal edition. These are views of the marketing plan (journey, SOSTAC) and
 * the business plan (OKR), which the V4.1 public profile never receives (`PROFILE_DOCUMENTS`), so no public edition is
 * offered or served: `?edition=public` answers 404, like the public Business Report.
 */

export type PlanKind = 'journey' | 'sostac' | 'okr'

export const PLAN_PATHS: Record<PlanKind, string> = { journey: 'market/customer-journey', sostac: 'strategy/sostac', okr: 'strategy/okrs' }

const SECTION: Record<PlanKind, BrandSection> = { journey: 'journey', sostac: 'sostac', okr: 'okr' }

function extraHead(): SafeHtml {
  return html`<link rel="stylesheet" href="${studioAssets.url('visual.css')}">`
}

function docOf(view: BrandView, kind: PlanKind, edition: 'internal' | 'public'): VisualDocument | null {
  const plans = view.cached.projection?.visual?.plans
  if (!plans || !plans.applies) return null
  const doc = plans[edition][kind]
  return edition === 'public' && !visualProfilePermits('public', doc.document_kind) ? null : doc
}

export function planPage(ctx: ViewContext, view: BrandView, kind: PlanKind, flash: string | null): SafeHtml {
  const lang = ctx.i.locale as VisualLang
  const cat = visualCatalog(lang)
  const t = planText(lang)
  const kindOf = { journey: 'customer_journey', sostac: 'sostac_overview', okr: 'okr_tree' } as const
  const titles = planTitles(lang, kindOf[kind])
  const p = view.cached.projection
  const shell = (body: SafeHtml) => brandShell(ctx, view, SECTION[kind], titles.title, body, flash, extraHead())
  if (!p) return shell(html``)
  const header = brandHeader(ctx, view, titles.title, titles.lead)
  const visual = p.visual
  if (visual === undefined) return shell(html`${header}${banner({ tone: 'info', body: cat.text.pending })}`)
  if (visual === null || !visual.plans) return shell(html`${header}${banner({ tone: 'warning', body: cat.text.unavailable })}`)
  if (!visual.plans.applies) return shell(html`${header}${emptyState({ icon: 'briefcase', title: cat.text.notApplicableTitle, body: cat.text.notApplicableBody })}`)
  const doc = visual.plans.internal[kind]
  const base = brandPath(view.record.slug, SECTION[kind])
  const asOf = dateOnly(doc.as_of, lang)
  const blockCtx = { cat, lang, mode: 'screen' as const, doc, idPrefix: kind, showNext: true, assetUrl: () => null }
  const body = html`${header}
    <div class="vz-screen vz-plan-screen">
      <div class="vz-toolbar">
        <p class="vz-edition-line"><span class="vz-edition vz-edition--internal">${cat.text.editionInternal}</span> <span class="vz-muted">${asOf ? fillVisual(cat.text.asOf, { date: asOf }) : cat.text.asOfNone}</span></p>
        <div class="vz-actions">
          <a class="btn btn-secondary btn-sm" href="${base}/print">${icon('book')}<span>${t.common.openPrint}</span></a>
          ${visualProfilePermits('public', doc.document_kind) ? html`<a class="btn btn-ghost btn-sm" href="${base}/print?edition=public">${icon('globe')}<span>${t.common.openPrintPublic}</span></a>` : ''}
        </div>
      </div>
      ${doc.blocks.map((block) => renderBlock(block, blockCtx))}
      ${legend(cat, ['approved', 'stale', 'assumption', 'withheld', 'missing', 'not_applicable'])}
      <details class="vz-details">
        <summary class="vz-details-summary">${icon('chevron', 'vz-details-icon')}<span>${cat.text.detailsTitle}</span></summary>
        <div class="vz-details-body">
          <p class="vz-details-lead">${cat.text.editionInternalNote}</p>
          <div class="vz-panels">${planSourcesTable(cat, lang, doc)}${planIdsPanel(cat, lang, doc)}${doc.framework_refs.map((ref) => frameworkNote(cat, ref, 'screen', lang))}</div>
        </div>
      </details>
    </div>`
  return shell(body)
}

/** Print view (A3 landscape). Read-only; the only control is the browser's own print command. */
export function planPrintPage(ctx: ViewContext, view: BrandView, kind: PlanKind, edition: 'internal' | 'public'): SafeHtml | null {
  const lang = ctx.i.locale as VisualLang
  const cat = visualCatalog(lang)
  const t = planText(lang)
  const doc = docOf(view, kind, edition)
  if (!doc) return null
  const titles = planTitles(lang, doc.document_kind)
  const toolbar = html`<nav class="vz-print-toolbar" aria-label="${t.common.printTitle}">
    <a class="vz-print-back" href="${brandPath(view.record.slug, SECTION[kind])}">${icon('chevron', 'vz-back-icon')}<span>${titles.back}</span></a>
    <p class="vz-print-hint">${t.common.printHint} ${cat.text.printOnly}</p>
    <button type="button" class="vz-print-button" data-print hidden>${cat.text.printButton}</button>
  </nav>`
  return planPrintDocument({
    doc,
    lang,
    commit: view.cached.status.sha,
    head: html`<link rel="icon" href="/static/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${studioAssets.url('visual.css')}"><script src="${studioAssets.url('visual.js')}" defer></script>`,
    toolbar,
    render: (block, blockCtx) => renderBlock(block, blockCtx),
  })
}
