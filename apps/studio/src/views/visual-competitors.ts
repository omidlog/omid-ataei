import type { ComparisonCell, ComparisonRow, ComparisonState, CompetitorMatrixBlock, CompetitorText, PositioningMapBlock, PriceStripBlock, PriceStripRow, VisualCatalog, VisualDocument, VisualLang } from '@brand-os/brand-core/visual'
import { competitorText, fillVisual, positioningText, visualCatalog } from '@brand-os/brand-core/visual'
import { html, join, safeHex, type SafeHtml } from './html.js'
import { icon, type IconName } from './icons.js'
import { dateOnly, illustrativeStamp, stateChip, two } from './visual-primitives.js'

/**
 * Competitor comparison matrix and price strip renderers (Visual Blueprint V2.2). Editorial book layout, the same
 * opener, plates, hairlines and type as the Visual identity chapter: luxury from typography and whitespace, a
 * standard matrix layout (rows businesses, columns criteria). Read-only; no inline style or script (strict CSP);
 * swatch colours are SVG presentation attributes. Competitor ids appear only in the details disclosure.
 */

export interface ComparisonContext {
  cat: VisualCatalog
  lang: VisualLang
  mode: 'screen' | 'print'
  doc: VisualDocument
  /** Owner-only steps; never printed. */
  showNext: boolean
}

/** Every cell state is an icon plus text plus a tone, never colour alone. */
const CELL_META: Record<ComparisonState, { tone: string; icon: IconName }> = {
  present: { tone: 'present', icon: 'checkCircle' },
  unverified: { tone: 'unverified', icon: 'info' },
  historical: { tone: 'historical', icon: 'history' },
  conflicting: { tone: 'conflicting', icon: 'alert' },
  needs_review: { tone: 'review', icon: 'refresh' },
  absent: { tone: 'absent', icon: 'skip' },
  unknown: { tone: 'unknown', icon: 'circle' },
}

function text(ctx: ComparisonContext): CompetitorText {
  return competitorText(ctx.lang)
}

function criterionLabel(t: CompetitorText, criterion: string): string {
  return (t.criteria as Record<string, string>)[criterion] ?? criterion
}

function cellMark(t: CompetitorText, state: ComparisonState): SafeHtml {
  const meta = CELL_META[state]
  return html`<span class="vz-cmp-mark vz-cmp--${meta.tone}">${icon(meta.icon)}<span>${t.cellState[state]}</span></span>`
}

export function footnoteRefs(ctx: ComparisonContext, notes: number[]): SafeHtml {
  if (!notes.length) return html``
  const fmt = new Intl.NumberFormat(ctx.lang)
  const items = notes.map((n) => (ctx.mode === 'screen' ? html`<a href="#cmp-fn-${n}" aria-label="${ctx.cat.text.sourceShort} ${fmt.format(n)}">${fmt.format(n)}</a>` : html`<span>${fmt.format(n)}</span>`))
  return html`<sup class="vz-cmp-fn">${join(items, '<span aria-hidden="true">,</span>')}</sup>`
}

function swatches(cell: ComparisonCell): SafeHtml {
  const hexes = cell.swatches.map(safeHex).filter((hex): hex is string => hex !== null)
  if (!hexes.length) return html``
  return html`<svg class="vz-cmp-swatches" viewBox="0 0 ${hexes.length * 18} 16" aria-hidden="true" focusable="false">${hexes.map((hex, i) => html`<circle cx="${i * 18 + 8}" cy="8" r="7" fill="${hex}" stroke="#121212" stroke-opacity="0.18"/>`)}</svg>`
}

function ownCellView(ctx: ComparisonContext, cell: ComparisonCell): SafeHtml {
  const t = text(ctx)
  const entry = cell.own
  if (!entry || cell.state !== 'present') return html`<td class="vz-cmp-cell vz-cmp-cell--own vz-cmp-cell--empty">${entry ? stateChip(ctx.cat, entry.state) : cellMark(t, 'unknown')}</td>`
  return html`<td class="vz-cmp-cell vz-cmp-cell--own">
    ${swatches(cell)}
    ${cell.labels.map((label) => html`<p class="vz-cmp-label" dir="auto">${label}</p>`)}
    ${entry.state === 'stale' ? stateChip(ctx.cat, 'stale') : ''}
  </td>`
}

function cellView(ctx: ComparisonContext, cell: ComparisonCell): SafeHtml {
  const t = text(ctx)
  return html`<td class="vz-cmp-cell vz-cmp-cell--${CELL_META[cell.state].tone}">
    ${cellMark(t, cell.state)}
    ${cell.labels.length ? html`<ul class="vz-cmp-labels">${cell.labels.map((label) => html`<li dir="auto">${label}</li>`)}</ul>` : ''}
    ${footnoteRefs(ctx, cell.footnotes)}
  </td>`
}

function rowHead(ctx: ComparisonContext, row: ComparisonRow): SafeHtml {
  const t = text(ctx)
  if (row.kind === 'own_brand') {
    return html`<th scope="row" class="vz-cmp-row-head vz-cmp-row-head--own"><span class="vz-cmp-own-kicker">${t.ownBrand}</span><span class="vz-cmp-name" dir="auto">${row.name}</span></th>`
  }
  const rel = row.relationship.map((r) => (t.relationship as Record<string, string>)[r] ?? r)
  return html`<th scope="row" class="vz-cmp-row-head">
    <span class="vz-cmp-name" dir="auto">${row.name}</span>
    ${rel.length ? html`<span class="vz-cmp-rel">${rel.join(' · ')}</span>` : ''}
    ${row.markets.length ? html`<span class="vz-cmp-markets"><span class="vz-vh">${t.markets}: </span><span dir="ltr">${row.markets.join(' · ')}</span></span>` : ''}
    ${row.official_domain ? html`<span class="vz-cmp-domain">${icon('shield')}<span class="vz-vh">${t.verifiedDomain}: </span><span dir="ltr">${row.official_domain}</span></span>` : ''}
    ${row.needs_refresh ? html`<span class="vz-cmp-refresh">${icon('history')}<span>${t.needsRefresh}</span></span>` : ''}
  </th>`
}

function plateHead(n: number, id: string, title: string, lead: string): SafeHtml {
  return html`<header class="vz-plate-head">
    <p class="vz-plate-num"><span>${two(n)}</span></p>
    <h2 class="vz-plate-title" id="${id}-t">${title}</h2>
    <p class="vz-plate-lead">${lead}</p>
  </header>`
}

/** The designed empty state: a ghost matrix, what it waits for and (owner only) the four steps to share. */
function emptyMatrix(ctx: ComparisonContext, block: CompetitorMatrixBlock): SafeHtml {
  const t = text(ctx)
  const withheld = block.share_state === 'withheld'
  const sharedEmpty = block.share_state === 'shared'
  const title = withheld ? t.withheldTitle : sharedEmpty ? t.sharedEmptyTitle : t.emptyTitle
  const reason = block.withheld_reason ? ((t.withheldReason as Record<string, string>)[block.withheld_reason] ?? block.withheld_reason) : ''
  const body = withheld ? fillVisual(t.withheldBody, { reason }) : sharedEmpty ? t.sharedEmptyBody : t.emptyBody
  const ghostRows = [0, 1, 2, 3]
  return html`<div class="vz-await vz-cmp-await">
    <div class="vz-await-art">
      <div class="vz-cmp-ghost" aria-hidden="true">
        <span class="vz-cmp-ghost-head"></span>${block.criteria.map(() => html`<span class="vz-cmp-ghost-col"></span>`)}
        ${ghostRows.map(() => html`<span class="vz-cmp-ghost-name"></span>${block.criteria.map(() => html`<span class="vz-cmp-ghost-dot"></span>`)}`)}
      </div>
    </div>
    <div class="vz-await-copy">
      <p class="vz-await-kicker">${icon(withheld ? 'alert' : 'clock')}<span>${t.pageMatrix}</span></p>
      <h3 class="vz-await-title">${title}</h3>
      <p class="vz-await-body">${body}</p>
      ${ctx.showNext && !withheld ? html`<div class="vz-await-steps"><p class="vz-await-steps-title">${t.emptyStepsTitle}</p><ol>${t.emptySteps.map((step) => html`<li dir="auto">${step}</li>`)}</ol></div>` : ''}
    </div>
  </div>`
}

export function competitorMatrixView(block: CompetitorMatrixBlock, ctx: ComparisonContext): SafeHtml {
  const t = text(ctx)
  const competitors = block.rows.filter((row) => row.kind === 'competitor')
  const id = 'cmp-matrix'
  const head = plateHead(1, id, t.pageMatrix, t.matrixCaption)
  if (!competitors.length) return html`<section class="vz-plate vz-cmp-plate" id="${id}" aria-labelledby="${id}-t">${head}${emptyMatrix(ctx, block)}</section>`
  const table = html`<table class="vz-cmp-table">
      <caption class="vz-vh">${t.title}</caption>
      <thead><tr><th scope="col" class="vz-cmp-corner">${t.competitorCol}</th>${block.criteria.map((criterion) => html`<th scope="col">${criterionLabel(t, criterion)}</th>`)}</tr></thead>
      <tbody>${block.rows.map((row) => html`<tr class="vz-cmp-row${row.kind === 'own_brand' ? ' vz-cmp-row--own' : ''}">${rowHead(ctx, row)}${row.cells.map((cell) => (row.kind === 'own_brand' ? ownCellView(ctx, cell) : cellView(ctx, cell)))}</tr>`)}</tbody>
    </table>`
  const states: ComparisonState[] = ['present', 'unverified', 'historical', 'conflicting', 'needs_review', 'unknown']
  return html`<section class="vz-plate vz-cmp-plate" id="${id}" aria-labelledby="${id}-t">
    ${head}
    ${ctx.mode === 'screen' ? html`<div class="vz-cmp-scroll" role="region" aria-labelledby="${id}-t" tabindex="0">${table}</div>` : table}
    <div class="vz-cmp-under">
      <ul class="vz-legend vz-cmp-legend" aria-label="${t.legendTitle}">${states.map((state) => html`<li>${cellMark(t, state)}</li>`)}</ul>
      <p class="vz-note">${t.ownRowNote}</p>
    </div>
  </section>`
}

function priceItem(ctx: ComparisonContext, row: PriceStripRow): SafeHtml {
  const t = text(ctx)
  const fmt = new Intl.NumberFormat(ctx.lang, { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(row.amount) ? 0 : 2 })
  const terms = [
    (t.period as Record<string, string>)[row.billing_period] ?? row.billing_period,
    (t.commitment as Record<string, string>)[row.billing_commitment] ?? row.billing_commitment,
    (t.tax as Record<string, string>)[row.tax_inclusion] ?? row.tax_inclusion,
    fillVisual(t.market, { market: row.market }),
  ]
  const rate = (t.rateLabel as Record<string, string>)[row.rate_label] ?? row.rate_label
  const state = (t.priceState as Record<string, string>)[row.state] ?? row.state
  const standard = row.rate_label === 'standard_rate'
  return html`<li class="vz-strip-item vz-strip--${row.state}">
    <p class="vz-strip-who"><span class="vz-strip-name" dir="auto">${row.competitor_name}</span><span class="vz-strip-offer" dir="auto">${row.offer_name}</span></p>
    <p class="vz-strip-amount" dir="ltr"><span class="vz-strip-num">${fmt.format(row.amount)}</span><span class="vz-strip-cur">${row.currency}</span></p>
    <p class="vz-strip-terms">${terms.join(' · ')}</p>
    ${row.feature_scope ? html`<p class="vz-strip-scope" dir="auto">${row.feature_scope}</p>` : ''}
    <p class="vz-strip-tags"><span class="vz-tag${standard ? '' : ' vz-tag--caveat'}">${rate}</span><span class="vz-tag vz-tag--${row.state}">${state}</span>${footnoteRefs(ctx, [row.footnote])}</p>
  </li>`
}

export function priceStripView(block: PriceStripBlock, ctx: ComparisonContext): SafeHtml {
  const t = text(ctx)
  const id = 'cmp-prices'
  const matrix = ctx.doc.blocks.find((b): b is CompetitorMatrixBlock => b.type === 'competitor_matrix')
  const anyCompetitor = matrix ? matrix.rows.some((row) => row.kind === 'competitor') : false
  if (!anyCompetitor) return html``
  return html`<section class="vz-plate vz-cmp-plate" id="${id}" aria-labelledby="${id}-t">
    ${plateHead(2, id, t.pricesTitle, t.pricesLead)}
    ${block.groups.length
      ? join(
          block.groups.map(
            (group) => html`<section class="vz-strip-group" aria-label="${fillVisual(t.currencyGroup, { currency: group.currency })}">
              <header class="vz-strip-head"><span class="vz-strip-code" dir="ltr">${group.currency}</span><span class="vz-strip-rule" aria-hidden="true"></span></header>
              <ol class="vz-strip">${group.rows.map((row) => priceItem(ctx, row))}</ol>
            </section>`,
          ),
        )
      : html`<p class="vz-note">${t.noPrices}</p>`}
    ${block.unpriced.length ? html`<div class="vz-strip-unpriced"><p class="vz-sub">${t.unpricedTitle}</p><ul>${block.unpriced.map((name) => html`<li><span dir="auto">${name}</span>${cellMark(t, 'unknown')}</li>`)}</ul><p class="vz-note">${t.unpricedBody}</p></div>` : ''}
    <p class="vz-note vz-strip-noconv">${icon('info')}<span>${t.noConversion}</span></p>
  </section>`
}

/** Numbered sources: who is speaking, the public host, when it was read. No quotes, note ids or URLs. */
export function comparisonSources(ctx: ComparisonContext, n: number): SafeHtml {
  const t = text(ctx)
  const matrix = ctx.doc.blocks.find((b): b is CompetitorMatrixBlock => b.type === 'competitor_matrix')
  if (!matrix || !matrix.footnotes.length) return html``
  const fmt = new Intl.NumberFormat(ctx.lang)
  return html`<section class="vz-plate vz-cmp-plate" id="cmp-sources" aria-labelledby="cmp-sources-t">
    ${plateHead(n, 'cmp-sources', t.sourcesTitle, t.sourcesLead)}
    <ol class="vz-cmp-notes">${matrix.footnotes.map((note) => {
      const who = note.source_class ? ((t.sourceClass as Record<string, string>)[note.source_class] ?? note.source_class) : t.sourceClass.unreadable
      const day = dateOnly(`${note.observed_on}T00:00:00Z`, ctx.lang)
      return html`<li id="cmp-fn-${note.n}"><span class="vz-cmp-note-n">${fmt.format(note.n)}</span><span class="vz-cmp-note-who">${who}</span>${note.host ? html`<span class="vz-cmp-note-host" dir="ltr">${note.host}</span>` : ''}${day ? html`<span class="vz-cmp-note-day">${fillVisual(t.readOn, { date: day })}</span>` : ''}</li>`
    })}</ol>
  </section>`
}

export function comparisonNever(ctx: ComparisonContext): SafeHtml {
  const t = text(ctx)
  return html`<section class="vz-panel vz-cmp-never" aria-labelledby="cmp-never-t">
    <h2 class="vz-panel-title" id="cmp-never-t">${t.neverTitle}</h2>
    <ul>${t.never.map((line) => html`<li>${line}</li>`)}</ul>
    <p class="vz-muted">${t.internalOnly}</p>
  </section>`
}

/** Owner details: counts of what is not shown and the technical ids. Never on the main view. */
export function comparisonDetails(ctx: ComparisonContext): SafeHtml {
  const t = text(ctx)
  const matrix = ctx.doc.blocks.find((b): b is CompetitorMatrixBlock => b.type === 'competitor_matrix')
  if (!matrix) return html``
  const competitors = matrix.rows.filter((row) => row.kind === 'competitor')
  const own = matrix.rows.find((row) => row.kind === 'own_brand')
  return html`<div class="vz-panels">
    ${comparisonNever(ctx)}
    <section class="vz-panel" aria-labelledby="cmp-ids-t">
      <h2 class="vz-panel-title" id="cmp-ids-t">${t.detailsIds}</h2>
      ${matrix.not_shared ? html`<p class="vz-muted">${fillVisual(t.notShared, { candidates: matrix.not_shared.candidates, disputed: matrix.not_shared.disputed, archived: matrix.not_shared.archived })}</p>` : ''}
      ${matrix.withheld_text ? html`<p class="vz-muted">${fillVisual(t.withheldText, { count: matrix.withheld_text })}</p>` : ''}
      <table class="vz-table">
        <tbody>
          ${competitors.map((row) => html`<tr><th scope="row"><span dir="auto">${row.name}</span></th><td><code class="vz-code" dir="ltr">${row.row_id}</code></td></tr>`)}
          ${own ? own.cells.map((cell) => html`<tr><th scope="row">${t.ownBrand} · ${criterionLabel(t, cell.criterion)}</th><td><code class="vz-code" dir="ltr">${cell.own?.id ?? '—'}</code> ${cell.own ? stateChip(ctx.cat, cell.own.state) : ''}</td></tr>`) : ''}
        </tbody>
      </table>
    </section>
  </div>`
}

/** Opener: kicker, title, brand, lead, as-of, and a contents list with dotted leaders. */
export function comparisonOpener(ctx: ComparisonContext, linked: boolean): SafeHtml {
  const t = text(ctx)
  const matrix = ctx.doc.blocks.find((b): b is CompetitorMatrixBlock => b.type === 'competitor_matrix')
  const strip = ctx.doc.blocks.find((b): b is PriceStripBlock => b.type === 'price_strip')
  const count = matrix ? matrix.rows.filter((row) => row.kind === 'competitor').length : 0
  const prices = strip ? strip.groups.reduce((sum, g) => sum + g.rows.length, 0) : 0
  const map = ctx.doc.blocks.find((b): b is PositioningMapBlock => b.type === 'positioning_map')
  const placed = map?.axes ? map.points.length : 0
  const fmt = new Intl.NumberFormat(ctx.lang)
  const asOf = dateOnly(ctx.doc.as_of ? `${ctx.doc.as_of.slice(0, 10)}T00:00:00Z` : null, ctx.lang)
  const items: Array<[string, string, string, boolean]> = [
    ['cmp-matrix', t.pageMatrix, count ? fmt.format(count) : '—', count > 0],
    ['cmp-prices', t.pagePrices, prices ? fmt.format(prices) : '—', prices > 0],
    ...(map ? [['cmp-map', positioningText(ctx.lang).page, placed ? fmt.format(placed) : '—', Boolean(map.axes)] as [string, string, string, boolean]] : []),
    ['cmp-sources', t.pageSources, matrix?.footnotes.length ? fmt.format(matrix.footnotes.length) : '—', (matrix?.footnotes.length ?? 0) > 0],
  ]
  return html`<header class="vz-opener">
    <p class="vz-kicker"><span class="vz-kicker-bar" aria-hidden="true"></span>${t.kicker}</p>
    <h1 class="vz-opener-title">${t.title}</h1>
    <p class="vz-opener-brand" dir="auto">${ctx.doc.brand_name}</p>
    <p class="vz-opener-lead">${t.lead}</p>
    <nav class="vz-toc" aria-label="${ctx.cat.identity.contents}">
      <p class="vz-toc-title">${ctx.cat.identity.contents}</p>
      <ol>${items.map(([target, title, value, ready], index) => html`<li class="vz-toc-item${ready ? ' is-ready' : ''}">${linked && ready ? html`<a href="#${target}">` : ''}<span class="vz-toc-num">${two(index + 1)}</span><span class="vz-toc-name">${title}</span><span class="vz-toc-leader" aria-hidden="true"></span><span class="vz-toc-state">${value}</span>${linked && ready ? html`</a>` : ''}</li>`)}</ol>
    </nav>
    <p class="vz-opener-asof">${asOf ? fillVisual(ctx.cat.text.asOf, { date: asOf }) : t.asOfNone}</p>
  </header>`
}

export interface ComparisonPrintInput {
  doc: VisualDocument
  lang: VisualLang
  commit: string | null
  head: SafeHtml
  toolbar: SafeHtml
}

/**
 * Static print view (existing print path: browser Print → PDF). Opener on A4 portrait, the matrix on an A4
 * landscape named page so seven criteria stay legible, then prices and sources on A4 portrait. Not the V1.2 engine.
 */
export function comparisonPrintDocument(input: ComparisonPrintInput, render: (block: VisualDocument['blocks'][number], ctx: ComparisonContext) => SafeHtml): SafeHtml {
  const { doc, lang } = input
  const cat = visualCatalog(lang)
  const t = competitorText(lang)
  const ctx: ComparisonContext = { cat, lang, mode: 'print', doc, showNext: false }
  const foot = (label: string) => html`<footer class="vz-print-foot"><span>${t.runningHead}</span><span dir="auto">${doc.brand_name}</span><span>${cat.text.classInternal}</span><span>${label}</span></footer>`
  const matrix = doc.blocks.find((block) => block.type === 'competitor_matrix')
  const strip = doc.blocks.find((block) => block.type === 'price_strip')
  const stripHtml = strip ? render(strip, ctx) : html``
  const map = doc.blocks.find((block) => block.type === 'positioning_map')
  const mapTitle = positioningText(lang).page
  return html`<!doctype html>
<html lang="${lang}" dir="${cat.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="same-origin">
<title>${t.title} · ${doc.brand_name}</title>
${input.head}
</head>
<body class="vz-print-body vz-book-body${doc.illustrative ? ' vz-is-mock' : ''}">
${input.toolbar}
<main class="vz-print" id="main">
  <section class="vz-page vz-page--book vz-page--opener" aria-label="${t.title}">
    ${illustrativeStamp(cat, doc)}
    ${comparisonOpener(ctx, false)}
    <dl class="vz-print-meta vz-book-meta">
      <div><dt>${cat.text.classification}</dt><dd><span class="vz-edition vz-edition--internal">${cat.text.editionInternal}</span></dd></div>
      <div><dt>${cat.text.commit}</dt><dd><code class="vz-code" dir="ltr">${input.commit ? input.commit.slice(0, 12) : '—'}</code></dd></div>
    </dl>
    ${foot(t.title)}
  </section>
  ${matrix ? html`<section class="vz-page vz-page--book vz-page--cmp-wide" aria-label="${t.pageMatrix}">${illustrativeStamp(cat, doc)}${render(matrix, ctx)}${foot(t.pageMatrix)}</section>` : ''}
  ${stripHtml.toString().trim() ? html`<section class="vz-page vz-page--book vz-page--plate" aria-label="${t.pagePrices}">${illustrativeStamp(cat, doc)}${stripHtml}${foot(t.pagePrices)}</section>` : ''}
  ${map && map.type === 'positioning_map' && map.axes ? html`<section class="vz-page vz-page--book vz-page--plate vz-page--pos" aria-label="${mapTitle}">${illustrativeStamp(cat, doc)}${render(map, ctx)}${foot(mapTitle)}</section>` : ''}
  <section class="vz-page vz-page--book vz-page--appendix" aria-label="${t.pageSources}">
    ${illustrativeStamp(cat, doc)}
    ${comparisonSources(ctx, map ? 4 : 3)}
    ${comparisonNever(ctx)}
    ${foot(t.pageSources)}
  </section>
</main>
</body>
</html>`
}
