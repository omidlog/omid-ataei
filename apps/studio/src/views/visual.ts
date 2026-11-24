import { entityOptionLabel, entitySpec } from '@brand-os/brand-core'
import type { BmcZone, BusinessModelCanvasBlock, CitationListBlock, DataState, FrameworkRef, ListZone, VisualCatalog, VisualDocument, VisualEntityItem, VisualEntry, VisualLang } from '@brand-os/brand-core/visual'
import { fillVisual, visualCatalog } from '@brand-os/brand-core/visual'
import { html, join, type SafeHtml } from './html.js'
import { icon, type IconName } from './icons.js'
import { dateOnly, ghostChart, illustrativeStamp, legend, miniMap as mapView, STATE_META, stateChip, two } from './visual-primitives.js'

export { dateOnly, illustrativeStamp, legend, stateChip } from './visual-primitives.js'

/**
 * Renderers for semantic visual documents (Visual Blueprint P0). One renderer, two compositions: the Studio page
 * (screen) and the static print view (A3 landscape, saved as PDF by the browser). Both take the same
 * `VisualDocument`, so the export cannot show anything the page does not. Every value goes through the escaping
 * `html` template; there is no inline style or script (strict CSP), only classes from `static/visual.css`.
 */

const ZONE_ICON: Record<BmcZone['state'], IconName> = { complete: 'checkCircle', partial: 'clock', missing: 'circle', withheld: 'lock', not_applicable: 'skip' }

function zoneChip(cat: VisualCatalog, state: BmcZone['state']): SafeHtml {
  return html`<span class="vz-zchip vz-zchip--${state}">${icon(ZONE_ICON[state])}<span>${cat.zoneState[state]}</span></span>`
}

export interface CanvasOptions {
  lang: VisualLang
  mode: 'screen' | 'print'
  /** Next-question prompts are for the owner; the public edition leaves them out. */
  showNext: boolean
  /** Prefix for element ids, so two canvases could share a page. */
  idPrefix: string
}

/** Item names visible on this canvas, by item id, so a link reads as a name instead of a technical id. */
type ItemNames = Map<string, string>

function itemNames(block: BusinessModelCanvasBlock): ItemNames {
  return new Map(block.zones.flatMap((zone) => zone.entries.flatMap((entry) => (entry.items ?? []).map((item) => [item.id, item.name] as const))))
}

/**
 * Visual V3.1: a list answer drawn as items in the owner's order. Choice values are labelled in the page language;
 * names and details are shown as recorded. Links read as the target item's name; a target that is not on this
 * canvas is said to be not shown, never guessed.
 */
/** Print page 1 is one fixed A3 page: a long list shows its first items there; the full list is on page 2. */
const PRINT_ITEMS = 4

function itemsView(cat: VisualCatalog, entry: VisualEntry, items: VisualEntityItem[], names: ItemNames, lang: VisualLang, mode: CanvasOptions['mode']): SafeHtml {
  const spec = entitySpec(entry.id)
  const numbers = new Intl.NumberFormat(lang)
  const shown = mode === 'print' ? items.slice(0, PRINT_ITEMS) : items
  const more = items.length - shown.length
  return html`<ol class="vz-items" aria-label="${fillVisual(cat.entities.itemCount, { count: numbers.format(items.length) })}">${shown.map(
    (item) => html`<li class="vz-item">
      <span class="vz-item-name" dir="auto">${item.name}</span>${item.tags.map((tag) => html` <span class="vz-item-tag">${spec ? entityOptionLabel(spec, tag.field, tag.value, lang) : tag.value}</span>`)}
      ${item.detail ? html`<span class="vz-item-detail" dir="auto">${item.detail}</span>` : ''}
      ${item.links.length
        ? html`<span class="vz-item-links"><span class="vz-item-links-k">${cat.entities.linkTo}:</span> ${join(
            item.links.map((link) => (names.has(link) ? html`<span class="vz-item-link" dir="auto">${names.get(link)!}</span>` : html`<span class="vz-item-link vz-item-link--hidden">${cat.entities.linkHidden}</span>`)),
            ', ',
          )}</span>`
        : ''}
    </li>`,
  )}</ol>${more > 0 ? html`<p class="vz-items-more">${fillVisual(cat.entities.moreItems, { count: numbers.format(more) })}</p>` : ''}`
}

function entryView(cat: VisualCatalog, entry: VisualEntry, names: ItemNames = new Map(), lang: VisualLang = 'en', mode: CanvasOptions['mode'] = 'screen'): SafeHtml {
  const meta = STATE_META[entry.state]
  const body =
    entry.items && entry.items.length
      ? itemsView(cat, entry, entry.items, names, lang, mode)
      : entry.legacy && entry.value !== null
        ? html`<p class="vz-entry-value" dir="auto">${entry.value}</p><p class="vz-legacy">${icon('alert')}<span>${cat.entities.legacy}</span><span class="vz-legacy-hint">${cat.entities.legacyHint}</span></p>`
        : entry.state === 'withheld'
      ? html`<p class="vz-entry-value vz-entry-value--withheld">${icon('lock')}<span>${cat.text.withheldValue}</span></p>`
      : entry.state === 'not_applicable'
        ? html`<p class="vz-entry-value vz-entry-value--ghost">${cat.text.notApplicableZone}</p>`
        : entry.value === null
          ? html`<p class="vz-entry-value vz-entry-value--ghost">${entry.missing_reason ? cat.missingReason[entry.missing_reason] : cat.text.noValueYet}</p>`
          : html`<p class="vz-entry-value" dir="auto">${entry.value}</p>`
  return html`<li class="vz-entry vz-entry--${meta.tone}">
    ${body}
    <p class="vz-entry-meta"><span class="vz-entry-label" dir="auto">${entry.label}</span>${stateChip(cat, entry.state)}${entry.version !== null ? html`<span class="vz-entry-version">${fillVisual(cat.text.version, { version: entry.version })}</span>` : ''}</p>
  </li>`
}

function nextList(cat: VisualCatalog, zone: BmcZone): SafeHtml {
  if (!zone.next_questions.length) return html``
  return html`<div class="vz-next">
    <p class="vz-next-title"><span>${cat.text.nextQuestions}</span></p>
    <ul>${zone.next_questions.map((q) =>
      q.kind === 'proposed'
        ? html`<li class="vz-next-item vz-next-item--proposed"><span class="vz-next-kind">${cat.text.proposedQuestion}</span><span class="vz-next-prompt">${cat.proposed[q.id] ?? ''}</span><code class="vz-code" dir="ltr">${q.id}</code></li>`
        : html`<li class="vz-next-item"><span class="vz-next-kind">${cat.text.existingQuestion}</span><code class="vz-code" dir="ltr">${q.id}</code></li>`,
    )}</ul>
  </div>`
}

/**
 * The canvas cell itself carries only the reading: title, the canonical prompt and the entries. Question ids, the
 * questions still to answer and related answers live in the collapsible details (screen) or on print page 2.
 */
/** A list zone (V3.1) where nothing is visible yet: the designed empty state instead of a "missing" row. */
function emptyListZone(zone: BmcZone): boolean {
  return zone.zone_id in LIST_ZONES && zone.entries.some((entry) => entitySpec(entry.id)) && zone.entries.every((entry) => entry.value === null && entry.state !== 'withheld')
}

const LIST_ZONES: Record<ListZone, true> = { key_activities: true, key_resources: true, customer_segments: true, cost_structure: true }

function zoneView(cat: VisualCatalog, zone: BmcZone, opts: CanvasOptions, names: ItemNames = new Map()): SafeHtml {
  const title = cat.zone[zone.zone_id]
  const id = `${opts.idPrefix}-zone-${zone.zone_id}`
  const gap = zone.entries.length === 0
  const emptyList = !gap && emptyListZone(zone)
  return html`<article class="vz-zone vz-zone--${zone.zone_id} vz-zstate--${zone.state} vz-o${zone.order}" id="${id}" aria-labelledby="${id}-t" tabindex="-1">
    <header class="vz-zone-head">
      <span class="vz-zone-num" aria-hidden="true">${two(zone.order)}</span>
      <h3 class="vz-zone-title" id="${id}-t">${title.title}</h3>
      ${zoneChip(cat, zone.state)}
    </header>
    <p class="vz-zone-prompt">${title.prompt}</p>
    ${gap
      ? ghostChart({ title: cat.text.gapTitle })
      : emptyList
        ? ghostChart({ title: cat.entities.emptyTitle[zone.zone_id as ListZone], body: cat.entities.emptyBody })
        : html`<ul class="vz-entries">${zone.entries.map((entry) => entryView(cat, entry, names, opts.lang, opts.mode))}</ul>`}
  </article>`
}

/**
 * "Details and sources" for the Studio page: everything technical or explanatory that would crowd the canvas.
 * Closed by default; the same facts are on print page 2.
 */
export function detailsView(cat: VisualCatalog, block: BusinessModelCanvasBlock, panels: SafeHtml, editionNote: string, showNext: boolean): SafeHtml {
  const zones = block.zones.filter((zone) => zone.entries.length || zone.next_questions.length || zone.related.length)
  return html`<details class="vz-details">
    <summary class="vz-details-summary">${icon('chevron', 'vz-details-icon')}<span>${cat.text.detailsTitle}</span></summary>
    <div class="vz-details-body">
      <p class="vz-details-lead">${editionNote} ${cat.text.gapBody}</p>
      <p class="vz-muted vz-small">${cat.text.zoneIndexHint}</p>
      <ol class="vz-details-zones">${zones.map((zone) => html`<li class="vz-details-zone">
        <p class="vz-details-zone-title"><span class="vz-zone-ref">${two(zone.order)}</span> ${cat.zone[zone.zone_id].title}</p>
        ${zone.entries.length ? html`<p class="vz-details-ids"><span class="vz-muted">${cat.text.detailsFields}:</span> ${join(zone.entries.map((entry) => html`<code class="vz-code" dir="ltr">${entry.id}</code>`), ' ')}</p>` : ''}
        ${showNext ? nextList(cat, zone) : ''}
        ${showNext && zone.related.length
          ? html`<p class="vz-related"><span>${cat.text.related}:</span> ${join(zone.related.map((rid) => html`<code class="vz-code" dir="ltr">${rid}</code>`), ' ')} <span class="vz-related-hint">${cat.text.relatedHint}</span></p>`
          : ''}
      </li>`)}</ol>
      <div class="vz-panels">${panels}</div>
    </div>
  </details>`
}

/** The nine-zone canvas. The grid keeps the canonical topology in every language (text inside follows the locale). */
export function canvasView(cat: VisualCatalog, block: BusinessModelCanvasBlock, opts: CanvasOptions): SafeHtml {
  const names = itemNames(block)
  const grid = html`<div class="vz-bmc" dir="ltr" role="group" aria-label="${cat.text.canvasTitle}">
    ${block.zones.map((zone) => html`<div class="vz-cell vz-cell--${zone.zone_id}" dir="${cat.dir}">${zoneView(cat, zone, opts, names)}</div>`)}
  </div>`
  if (opts.mode === 'print') return grid
  return html`<div class="vz-scroll" tabindex="0" role="region" aria-label="${cat.text.canvasTitle}">${grid}</div>`
}

/** Canonical 10×3 Business Model Canvas geometry for the mini-map: x, y, width, height in grid units. */
const BMC_GEOMETRY: Record<string, [number, number, number, number]> = {
  key_partners: [0, 0, 2, 2],
  key_activities: [2, 0, 2, 1],
  key_resources: [2, 1, 2, 1],
  value_propositions: [4, 0, 2, 2],
  customer_relationships: [6, 0, 2, 1],
  channels: [6, 1, 2, 1],
  customer_segments: [8, 0, 2, 2],
  cost_structure: [0, 2, 5, 1],
  revenue_streams: [5, 2, 5, 1],
}

/** A topology-faithful mini-map: the 30-second read of which zones are filled. Each zone links to its cell. */
export function miniMap(cat: VisualCatalog, block: BusinessModelCanvasBlock, idPrefix: string, linked: boolean): SafeHtml {
  const cells = block.zones.map((zone) => {
    const [x, y, w, h] = BMC_GEOMETRY[zone.zone_id] ?? [0, 0, 1, 1]
    return { key: zone.zone_id, x, y, w, h, num: two(zone.order), state: zone.state, label: `${two(zone.order)} ${cat.zone[zone.zone_id].title}: ${cat.zoneState[zone.state]}`, href: `#${idPrefix}-zone-${zone.zone_id}` }
  })
  return mapView(cat.text.zoneIndex, cells, { cols: 10, rows: 3, unitX: 20, unitY: 16 }, linked)
}

export function summaryView(cat: VisualCatalog, doc: VisualDocument, lang: VisualLang): SafeHtml {
  const numbers = new Intl.NumberFormat(lang)
  const order: DataState[] = ['approved', 'stale', 'assumption', 'recommendation', 'withheld', 'missing', 'not_applicable', 'conflicting']
  return html`<dl class="vz-summary">${order
    .filter((state) => doc.status_summary[state] > 0 || state === 'approved' || state === 'missing')
    .map((state) => html`<div class="vz-summary-item vz-summary--${STATE_META[state].tone}"><dt>${stateChip(cat, state)}</dt><dd>${numbers.format(doc.status_summary[state])}</dd></div>`)}</dl>`
}

export function frameworkPanel(cat: VisualCatalog, ref: FrameworkRef, lang: VisualLang, mode: 'screen' | 'print'): SafeHtml {
  return html`<section class="vz-panel vz-framework" aria-labelledby="vz-fw-${ref.framework_id}">
    <h2 class="vz-panel-title" id="vz-fw-${ref.framework_id}">${cat.text.frameworkTitle}</h2>
    <p class="vz-claim"><span class="vz-claim-kind">${cat.claim[ref.permitted_claim]}</span> <span dir="ltr">${ref.title}</span> <span class="vz-muted" dir="ltr">· ${ref.authority} · ${ref.edition}</span></p>
    <p class="vz-muted" dir="ltr">${ref.usage_note}</p>
    <dl class="vz-meta">
      <div><dt>${cat.text.licence}</dt><dd><code class="vz-code" dir="ltr">${ref.license_status}</code></dd></div>
      <div><dt>${cat.text.sourceLink}</dt><dd>${mode === 'screen' ? html`<a href="${ref.source_url}" target="_blank" rel="noopener noreferrer" dir="ltr">${ref.source_url}</a>` : html`<span dir="ltr">${ref.source_url}</span>`}</dd></div>
      <div><dt>${cat.text.checked}</dt><dd>${ref.verified_on ? dateOnly(ref.verified_on, lang) : cat.text.notVerified}</dd></div>
    </dl>
  </section>`
}

/**
 * Links between zones (V3.1): the links the owner recorded on list items, by item name and zone. Without list items
 * the panel says why nothing is drawn. Item ids stay out of the main view; they are in the details and sources.
 */
export function relationshipsPanel(cat: VisualCatalog, block?: BusinessModelCanvasBlock): SafeHtml {
  const rel = block?.relationships
  if (!block || !rel || !rel.modeled) {
    const body = rel && !rel.modeled && rel.reason === 'no_list_items' ? cat.entities.linksNoneNoItems : cat.entities.linksNoneProse
    return html`<section class="vz-panel vz-limits" aria-labelledby="vz-links-title">
    <h2 class="vz-panel-title" id="vz-links-title">${cat.entities.linksTitle}</h2>
    <p>${body}</p>
  </section>`
  }
  const names = itemNames(block)
  const zoneTitle = (zone: BmcZone['zone_id'] | null) => (zone ? cat.zone[zone].title : '—')
  return html`<section class="vz-panel vz-links" aria-labelledby="vz-links-title">
    <h2 class="vz-panel-title" id="vz-links-title">${cat.entities.linksTitle}</h2>
    <p class="vz-muted">${cat.entities.linksLead}</p>
    ${rel.links.length === 0
      ? html`<p>${cat.entities.linksEmpty}</p>`
      : html`<table class="vz-table vz-links-table">
      <thead><tr><th scope="col">${cat.entities.linksColFrom}</th><th scope="col">${cat.entities.linksColTo}</th><th scope="col">${cat.entities.linksColState}</th></tr></thead>
      <tbody>${rel.links.map(
        (link) => html`<tr class="vz-link vz-link--${link.state}">
          <td><span class="vz-zone-ref">${zoneTitle(link.from_zone)}</span> <span dir="auto">${names.get(link.from) ?? ''}</span></td>
          <td><span class="vz-zone-ref">${zoneTitle(link.to_zone)}</span> ${link.state === 'resolved' ? html`<span dir="auto">${names.get(link.to) ?? ''}</span>` : html`<span class="vz-muted">${cat.entities.linkHidden}</span>`}</td>
          <td>${link.state === 'resolved' ? cat.entities.linkResolved : cat.entities.linkUnresolved}</td>
        </tr>`,
      )}</tbody>
    </table>`}
  </section>`
}

export function citationTable(cat: VisualCatalog, block: CitationListBlock, canvas: BusinessModelCanvasBlock, lang: VisualLang, withValues: boolean): SafeHtml {
  const entries = new Map(canvas.zones.flatMap((zone) => zone.entries.map((entry) => [entry.id, { entry, zone }] as const)))
  return html`<section class="vz-panel vz-sources" aria-labelledby="vz-sources-title">
    <h2 class="vz-panel-title" id="vz-sources-title">${cat.text.sourcesTitle}</h2>
    <p class="vz-muted">${cat.text.sourcesIntro}</p>
    <table class="vz-table">
      <thead><tr><th scope="col">${cat.text.colField}</th><th scope="col">${cat.text.colState}</th>${withValues ? html`<th scope="col">${cat.text.canvasTitle}</th>` : ''}<th scope="col">${cat.text.colVersion}</th><th scope="col">${cat.text.colApproved}</th><th scope="col">${cat.text.colSources}</th></tr></thead>
      <tbody>${block.items.map((item) => {
        const found = entries.get(item.id)
        return html`<tr>
          <th scope="row"><span class="vz-zone-ref">${found ? `${two(found.zone.order)} ${cat.zone[found.zone.zone_id].title}` : ''}</span><span class="vz-entry-label" dir="auto">${item.label}</span><code class="vz-code" dir="ltr">${item.id}</code></th>
          <td>${stateChip(cat, item.state)}</td>
          ${withValues ? html`<td class="vz-table-value" dir="auto">${found?.entry.value ?? '—'}</td>` : ''}
          <td>${item.version !== null ? fillVisual(cat.text.version, { version: item.version }) : '—'}</td>
          <td>${dateOnly(item.approved_at, lang) ?? '—'}</td>
          <td>${join((found?.entry.sources ?? []).slice(0, 4).map((source) => html`<code class="vz-code" dir="ltr">${source}</code>`), ' ')}</td>
        </tr>`
      })}</tbody>
    </table>
  </section>`
}

function blocks(doc: VisualDocument): { canvas: BusinessModelCanvasBlock; citations: CitationListBlock } {
  const canvas = doc.blocks.find((block): block is BusinessModelCanvasBlock => block.type === 'business_model_canvas')
  const citations = doc.blocks.find((block): block is CitationListBlock => block.type === 'citation_list')
  if (!canvas || !citations) throw new Error('A business model canvas document needs a canvas and a citation block.')
  return { canvas, citations }
}

export interface PrintInput {
  doc: VisualDocument
  lang: VisualLang
  commit: string | null
  /** Stylesheet links (Studio: hashed `/static/visual.css`). The golden script inlines its own. */
  head: SafeHtml
  /** Screen-only toolbar (back link, print button). Hidden in print. */
  toolbar: SafeHtml
}

/** The static print view: page 1 the canvas, page 2 sources, framework and limits. A3 landscape, no motion. */
export function printDocument(input: PrintInput): SafeHtml {
  const { doc, lang } = input
  const cat = visualCatalog(lang)
  const { canvas, citations } = blocks(doc)
  const internal = doc.audience === 'internal'
  const asOf = dateOnly(doc.as_of, lang)
  const edition = internal ? cat.text.editionInternal : cat.text.editionPublic
  const head = html`<header class="vz-print-head">
      <div class="vz-print-titles">
        <p class="vz-kicker"><span class="vz-kicker-bar" aria-hidden="true"></span>${cat.text.canvasKicker}</p>
        <h1 class="vz-print-title">${cat.text.canvasTitle}</h1>
        <p class="vz-print-brand" dir="auto">${doc.brand_name}</p>
      </div>
      <dl class="vz-print-meta">
        <div><dt>${cat.text.classification}</dt><dd><span class="vz-edition vz-edition--${doc.audience}">${edition}</span></dd></div>
        <div><dt>${cat.text.asOfLabel}</dt><dd>${asOf ? fillVisual(cat.text.asOf, { date: asOf }) : cat.text.asOfNone}</dd></div>
        <div><dt>${cat.text.commit}</dt><dd><code class="vz-code" dir="ltr">${input.commit ? input.commit.slice(0, 12) : '—'}</code></dd></div>
      </dl>
    </header>`
  const foot = (page: string, n: number) =>
    html`<footer class="vz-print-foot"><span>${cat.text.runningHead}</span><span dir="auto">${doc.brand_name}</span><span>${internal ? cat.text.classInternal : cat.text.classPublic}</span><span>${page} · <bdi dir="ltr">${n}</bdi></span></footer>`
  return html`<!doctype html>
<html lang="${lang}" dir="${cat.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="same-origin">
<title>${cat.text.canvasTitle} · ${doc.brand_name}</title>
${input.head}
</head>
<body class="vz-print-body${doc.illustrative ? ' vz-is-mock' : ''}">
${input.toolbar}
<main class="vz-print" id="main">
  <section class="vz-page vz-page--canvas" aria-label="${cat.text.pageCanvas}">
    ${illustrativeStamp(cat, doc)}
    ${head}
    ${canvasView(cat, canvas, { lang, mode: 'print', showNext: false, idPrefix: 'p' })}
    <div class="vz-print-under">
      ${legend(cat, ['approved', 'stale', 'assumption', 'withheld', 'missing', 'not_applicable'])}
      <p class="vz-attrib"><span class="vz-claim-kind">${cat.claim.informed_by}</span> <span dir="ltr">Business Model Canvas · Strategyzer</span></p>
    </div>
    ${foot(cat.text.pageCanvas, 1)}
  </section>
  <section class="vz-page vz-page--sources" aria-label="${cat.text.pageSources}">
    ${foot(cat.text.pageSources, 2)}
    ${illustrativeStamp(cat, doc)}
    <div class="vz-sources-grid">
      <div class="vz-main">
        ${citationTable(cat, citations, canvas, lang, true)}
        ${internal ? html`<section class="vz-panel vz-next-panel"><h2 class="vz-panel-title">${cat.text.nextQuestions}</h2><ul class="vz-next-all">${canvas.zones
          .filter((zone) => zone.next_questions.length)
          .map((zone) => html`<li><strong>${two(zone.order)} ${cat.zone[zone.zone_id].title}</strong> ${join(zone.next_questions.map((q) => html`<code class="vz-code" dir="ltr">${q.id}</code>`), ' ')}</li>`)}</ul></section>` : ''}
      </div>
      <div class="vz-side">
        <section class="vz-panel"><h2 class="vz-panel-title">${cat.text.summaryTitle}</h2>${summaryView(cat, doc, lang)}${miniMap(cat, canvas, 'p', false)}<p class="vz-muted vz-edition-note">${internal ? cat.text.editionInternalNote : cat.text.editionPublicNote} ${cat.text.gapBody}</p></section>
        ${frameworkPanel(cat, doc.framework_refs[0]!, lang, 'print')}
        ${relationshipsPanel(cat, canvas)}
      </div>
    </div>
  </section>
</main>
</body>
</html>`
}
