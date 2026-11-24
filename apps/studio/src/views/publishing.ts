import { coverageCells, isPersonalPublishingType, PERSONAL_PUBLISHING_KIND, publishingExportCommand, type CoverageState, type ExportProfile, type PublishingCell, type PublishingDocumentType, type PublishingReadiness } from '@brand-os/brand-core/visual'
import type { MessageKey } from '../i18n/index.js'
import type { StudioProjection } from '../projection.js'
import { badge, emptyState, type Tone } from './components.js'
import { html, type SafeHtml } from './html.js'
import { icon, type IconName } from './icons.js'
import { brandPath, type BrandView, type ViewContext } from './layout.js'
import { brandHeader, brandShell } from './pages.js'

/**
 * Visual V4.1: the Publishing gallery and the Command Center strip (R4).
 *
 * Both are read-only views over the sync-time projection. The gallery shows document types × export profiles with the
 * readiness measured on each profile's redacted output (`buildPublishingGallery` in core); it carries counts only,
 * links to the print views that already exist and shows, as text, the local export command where one exists (the full
 * Brand Book, and the personal documents' `brand:document` command for a personal brand). Nothing here exports, renders a file, runs a command, or writes.
 */

const READINESS: Record<PublishingReadiness, { tone: Tone; icon: IconName }> = {
  ready: { tone: 'success', icon: 'checkCircle' },
  partial: { tone: 'warning', icon: 'clock' },
  empty: { tone: 'neutral', icon: 'circle' },
  not_applicable: { tone: 'neutral', icon: 'skip' },
  blocked: { tone: 'neutral', icon: 'lock' },
}

/** Print views that exist today, by document type. The public edition is the same path with `?edition=public`. */
function printHref(slug: string, type: PublishingDocumentType, profile: ExportProfile): string | null {
  // No investor edition is printed yet; never fall back to the internal one, which shows labelled drafts.
  if (profile === 'investor') return null
  const edition = profile === 'public' ? '?edition=public' : ''
  if (type === 'business_model_canvas') return brandPath(slug, 'visual', `/print${edition}`)
  if (type === 'visual_identity') return `/brands/${slug}/brand/book/visual-identity/print${edition}`
  if (type === 'mascot_atlas') return `/brands/${slug}/brand/mascot/print${edition}`
  if (type === 'competitor_comparison' && profile === 'internal') return brandPath(slug, 'competitors', '/print')
  return null
}

/** The on-screen page of each document type, for the row heading. */
function pageHref(view: BrandView, type: PublishingDocumentType): string {
  const slug = view.record.slug
  // BOS-19: a personal document opens on the Personal Brand page with that document selected.
  if (isPersonalPublishingType(type)) return brandPath(slug, 'personal', `?doc=${PERSONAL_PUBLISHING_KIND[type]}`)
  switch (type) {
    case 'brand_book':
      return brandPath(slug, 'brand-book')
    case 'visual_identity':
      return `/brands/${slug}/brand/book/visual-identity`
    case 'business_model_canvas':
      return brandPath(slug, 'visual')
    case 'mascot_atlas':
      return `/brands/${slug}/brand/mascot`
    case 'competitor_comparison':
      return brandPath(slug, 'competitors')
    case 'business_plan':
      return brandPath(slug, 'business')
    case 'marketing_plan':
      return brandPath(slug, 'marketing')
  }
}

function galleryCell(ctx: ViewContext, view: BrandView, cell: PublishingCell): SafeHtml {
  const { i } = ctx
  const look = READINESS[cell.readiness]
  const state = badge(i.t(`publishing.readiness.${cell.readiness}` as MessageKey), look.tone, look.icon)
  if (cell.readiness === 'blocked') {
    return html`<td class="pub-cell pub-cell--blocked" data-readiness="blocked">${state}<p class="muted small">${i.t('publishing.blockedHint')}</p></td>`
  }
  const counts = html`<p class="pub-counts small"><span>${i.t('publishing.shown', { count: i.number(cell.shown) })}</span> · <span>${i.t('publishing.gaps', { count: i.number(cell.gaps) })}</span>${
    cell.redacted > 0 ? html` · <span class="pub-redacted">${icon('lock')} ${i.t('publishing.redacted', { count: i.number(cell.redacted) })}</span>` : ''
  }</p>`
  const href = cell.export === 'print' && cell.readiness !== 'not_applicable' ? printHref(view.record.slug, cell.document_type, cell.profile) : null
  // A local export command (the full Brand Book, V4.2) is shown as text to copy; Studio never runs it.
  const command = cell.export === 'command' && cell.readiness !== 'not_applicable' ? publishingExportCommand(cell.document_type, cell.profile) : null
  const action = href
    ? html`<a class="link-sm" href="${href}">${i.t('publishing.print')}</a>`
    : command
      ? html`<p class="muted small">${i.t('publishing.command')}</p><code class="mono pub-command" dir="ltr">${command}</code>`
      : html`<p class="muted small">${i.t(cell.export === 'planned' ? 'publishing.planned' : 'publishing.noExport')}</p>`
  return html`<td class="pub-cell" data-readiness="${cell.readiness}" data-export="${cell.export}">${state}${counts}${action}</td>`
}

export function publishingPage(ctx: ViewContext, view: BrandView, flash: string | null): SafeHtml {
  const { i } = ctx
  const p = view.cached.projection
  const title = i.t('publishing.title')
  if (!p) return brandShell(ctx, view, 'publishing', title, html``, flash)
  const gallery = p.publishing
  if (!gallery) {
    const body = html`${brandHeader(ctx, view, title, i.t('publishing.subtitle'))}${emptyState({ icon: 'info', title: i.t('publishing.emptyTitle'), body: i.t('publishing.emptyBody') })}`
    return brandShell(ctx, view, 'publishing', title, body, flash)
  }
  const cell = (type: PublishingDocumentType, profile: ExportProfile) => gallery.cells.find((item) => item.document_type === type && item.profile === profile)
  const body = html`
    ${brandHeader(ctx, view, title, i.t('publishing.subtitle'))}
    <section class="card pub-profiles" aria-labelledby="pub-profiles-title">
      <h2 class="card-title" id="pub-profiles-title">${i.t('publishing.profiles')}</h2>
      <dl class="pub-profile-list">${gallery.profiles.map(
        (profile) => html`<div class="pub-profile" data-profile="${profile}"><dt>${icon(profile === 'internal' ? 'lock' : profile === 'investor' ? 'briefcase' : 'globe')} ${i.t(`publishing.profile.${profile}` as MessageKey)}</dt><dd class="muted small">${i.t(`publishing.profile.${profile}.rule` as MessageKey)}</dd></div>`,
      )}</dl>
    </section>
    <section class="card" aria-labelledby="pub-gallery-title">
      <h2 class="card-title" id="pub-gallery-title">${i.t('publishing.gallery')}</h2>
      <p class="card-hint muted">${i.t('publishing.galleryHint')}</p>
      <div class="table-wrap"><table class="table pub-table">
        <thead><tr><th scope="col">${i.t('publishing.documentType')}</th>${gallery.profiles.map((profile) => html`<th scope="col">${i.t(`publishing.profile.${profile}` as MessageKey)}</th>`)}</tr></thead>
        <tbody>${gallery.document_types.map(
          (type) => html`<tr data-document-type="${type}">
            <th scope="row"><a href="${pageHref(view, type)}">${i.t(`publishing.doc.${type}` as MessageKey)}</a></th>
            ${gallery.profiles.map((profile) => {
              const found = cell(type, profile)
              return found ? galleryCell(ctx, view, found) : html`<td></td>`
            })}
          </tr>`,
        )}</tbody>
      </table></div>
      <p class="muted small">${icon('info')} ${i.t('publishing.note')}</p>
    </section>`
  return brandShell(ctx, view, 'publishing', title, body, flash)
}

// ---- Command Center strip (R4) -------------------------------------------------------------------------------

const COVERAGE_ORDER: CoverageState[] = ['complete', 'partial', 'missing', 'withheld', 'not_applicable']

interface Framework {
  key: MessageKey
  href: string
  cells: Array<{ id: string; state: CoverageState }>
}

/** One row per framework or document the brand has: its zones, blocks or sections as a mini-map of states. */
function frameworks(view: BrandView, p: StudioProjection): Framework[] {
  const slug = view.record.slug
  const rows: Framework[] = []
  const book = p.documents['brand-book']
  if (book) rows.push({ key: 'publishing.doc.brand_book', href: brandPath(slug, 'brand-book'), cells: coverageCells(book) })
  if (p.visual?.bmc && p.visual.bmc.applies !== false) rows.push({ key: 'publishing.doc.business_model_canvas', href: brandPath(slug, 'visual'), cells: coverageCells(p.visual.bmc.internal) })
  if (p.visual?.identity) rows.push({ key: 'publishing.doc.visual_identity', href: `/brands/${slug}/brand/book/visual-identity`, cells: coverageCells(p.visual.identity.internal) })
  if (p.visual?.mascot && p.brand.modules.mascot) rows.push({ key: 'publishing.doc.mascot_atlas', href: `/brands/${slug}/brand/mascot`, cells: coverageCells(p.visual.mascot.internal) })
  const plan = p.documents['business-plan']
  if (plan) rows.push({ key: 'publishing.doc.business_plan', href: brandPath(slug, 'business'), cells: coverageCells(plan) })
  const marketing = p.documents['marketing-plan']
  if (marketing) rows.push({ key: 'publishing.doc.marketing_plan', href: brandPath(slug, 'marketing'), cells: coverageCells(marketing) })
  return rows
}

function tile(input: { label: string; value: string; hint: string; href: string | null; tone: Tone; iconName: IconName; id: string }): SafeHtml {
  const inner = html`<p class="cc-tile-label">${icon(input.iconName)} ${input.label}</p><p class="cc-tile-value">${input.value}</p><p class="cc-tile-hint muted small">${input.hint}</p>`
  return input.href
    ? html`<a class="cc-tile cc-tile--${input.tone}" data-tile="${input.id}" href="${input.href}">${inner}</a>`
    : html`<div class="cc-tile cc-tile--${input.tone}" data-tile="${input.id}">${inner}</div>`
}

/**
 * The 30-second strip at the top of the Command Center: decisions needed, review due, contradictions and exports
 * ready, then a coverage mini-map per framework. States are said in words, never by colour alone.
 */
export function commandStrip(ctx: ViewContext, view: BrandView): SafeHtml {
  const { i } = ctx
  const p = view.cached.projection
  if (!p) return html``
  const slug = view.record.slug
  const o = p.overview
  const permitted = p.publishing?.cells.filter((cell) => cell.readiness !== 'blocked' && cell.readiness !== 'not_applicable') ?? []
  const ready = permitted.filter((cell) => cell.readiness === 'ready').length
  const reviewDue = p.publishing?.review_due ?? null
  const rows = frameworks(view, p)
  return html`<section class="card cc-strip" aria-labelledby="cc-title">
    <div class="card-head"><h2 class="card-title" id="cc-title">${i.t('command.glance')}</h2></div>
    <div class="cc-tiles">
      ${tile({ id: 'decisions', label: i.t('command.decisions'), value: i.number(o.pending_review), hint: i.t('command.decisionsHint'), href: o.pending_review ? brandPath(slug, 'history', '#review-title') : null, tone: o.pending_review ? 'warning' : 'success', iconName: o.pending_review ? 'alert' : 'checkCircle' })}
      ${tile({ id: 'review-due', label: i.t('command.reviewDue'), value: reviewDue === null ? '—' : i.number(reviewDue), hint: i.t('command.reviewDueHint'), href: null, tone: reviewDue ? 'warning' : 'success', iconName: reviewDue ? 'clock' : 'checkCircle' })}
      ${tile({ id: 'contradictions', label: i.t('command.contradictions'), value: i.number(o.contradictions), hint: i.t('command.contradictionsHint'), href: o.contradictions ? brandPath(slug, 'history', '#contradictions') : null, tone: o.contradictions ? 'danger' : 'success', iconName: o.contradictions ? 'alert' : 'checkCircle' })}
      ${tile({ id: 'exports', label: i.t('command.exports'), value: p.publishing ? i.t('common.of', { done: i.number(ready), total: i.number(permitted.length) }) : '—', hint: i.t('command.exportsHint'), href: brandPath(slug, 'publishing'), tone: 'neutral', iconName: 'book' })}
    </div>
    <h3 class="cc-sub" id="cc-coverage">${i.t('command.coverage')}</h3>
    ${rows.length
      ? html`<ul class="cc-map" aria-labelledby="cc-coverage">${rows.map((row) => {
          const counts = Object.fromEntries(COVERAGE_ORDER.map((state) => [state, row.cells.filter((cell) => cell.state === state).length])) as Record<CoverageState, number>
          const considered = row.cells.length - counts.not_applicable
          return html`<li class="cc-map-row">
            <a class="cc-map-name" href="${row.href}">${i.t(row.key)}</a>
            <span class="cc-map-cells" aria-hidden="true">${row.cells.map((cell) => html`<span class="cc-cell cc-cell--${cell.state}" title="${i.t(`command.state.${cell.state}` as MessageKey)}"></span>`)}</span>
            <span class="cc-map-text small">${considered === 0 ? i.t('doc.notApplicableTitle') : i.t('command.complete', { done: i.number(counts.complete), total: i.number(considered) })}${counts.partial ? html` · ${i.t('command.partial', { count: i.number(counts.partial) })}` : ''}${counts.missing ? html` · ${i.t('command.missing', { count: i.number(counts.missing) })}` : ''}</span>
          </li>`
        })}</ul>
        <p class="cc-legend muted small" aria-hidden="true">${COVERAGE_ORDER.slice(0, 4).map((state) => html`<span class="cc-legend-item"><span class="cc-cell cc-cell--${state}"></span>${i.t(`command.state.${state}` as MessageKey)}</span>`)}</p>`
      : html`<p class="muted">${i.t('command.coverageEmpty')}</p>`}
  </section>`
}
