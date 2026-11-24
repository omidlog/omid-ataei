import { entityOptionLabel, entitySpec } from '@brand-os/brand-core'
import type {
  ListArea,
  SourceNote,
  SourceNotesBlock,
  StrategyText,
  SwotBlock,
  TowsMatrixBlock,
  TowsType,
  ValueFitZoneId,
  ValuePropositionCanvasBlock,
  VisualCatalog,
  VisualDocument,
  VisualEntityItem,
  VisualLang,
} from '@brand-os/brand-core/visual'
import { fillVisual, strategyText, visualCatalog } from '@brand-os/brand-core/visual'
import { html, join, type SafeHtml } from './html.js'
import { icon, type IconName } from './icons.js'
import { frameworkNote } from './visual-identity.js'
import { ghostChart, illustrativeStamp, stateChip } from './visual-primitives.js'

/**
 * SWOT / TOWS and Value Proposition Canvas renderers (Visual Blueprint V3.2). Editorial catalog-book plates in the
 * frameworks' standard topology (SWOT 2×2, TOWS matrix with S/W columns and O/T rows, the value map square beside
 * the customer profile circle), kept canonical in every language: the grid is LTR, the text inside follows the
 * locale. Items show their names, choice labels, linked item names and numbered sources; ids appear only in the
 * details disclosure and the print appendix. Read-only; classes only (strict CSP).
 */

export interface StrategyContext {
  cat: VisualCatalog
  lang: VisualLang
  mode: 'screen' | 'print'
  doc: VisualDocument
  /** Owner-only prompts (how to edit); the public edition leaves them out. */
  showNext: boolean
}

/** Print plates show this many items per area; the rest are counted and listed in full in the appendix. */
export const PRINT_AREA_ITEMS = 6
/** The canvas zones are smaller (half an A4 measure each): four items, then a count. */
export const PRINT_ZONE_ITEMS = 4

const AREA_ICON: Record<ListArea<string>['state'], IconName> = { complete: 'checkCircle', partial: 'clock', missing: 'circle', withheld: 'lock', not_applicable: 'skip' }

/** Two-digit plate and zone numbers in the reader's digits (Persian digits in fa). */
export function num2(lang: VisualLang, n: number): string {
  return new Intl.NumberFormat(lang, { minimumIntegerDigits: 2, useGrouping: false }).format(n)
}

function num(lang: VisualLang, n: number): string {
  return new Intl.NumberFormat(lang, { useGrouping: false }).format(n)
}

function areaChip(cat: VisualCatalog, state: ListArea<string>['state']): SafeHtml {
  return html`<span class="vz-zchip vz-zchip--${state}">${icon(AREA_ICON[state])}<span>${cat.zoneState[state]}</span></span>`
}

function notesOf(doc: VisualDocument): SourceNotesBlock | undefined {
  return doc.blocks.find((block): block is SourceNotesBlock => block.type === 'source_notes')
}

function noteNumbers(ctx: StrategyContext): Map<string, number> {
  return new Map((notesOf(ctx.doc)?.notes ?? []).map((note) => [note.ref, note.n]))
}

/** Superscript source numbers after an item; linked to the sources list on screen. */
function sourceMarks(ctx: StrategyContext, item: VisualEntityItem, numbers: Map<string, number>): SafeHtml {
  const ns = (item.sources ?? []).map((ref) => numbers.get(ref)).filter((n): n is number => n !== undefined)
  if (!ns.length) return html``
  const t = strategyText(ctx.lang)
  const marks = ns.map((n) => (ctx.mode === 'screen' ? html`<a href="#${ctx.doc.document_kind}-src-${n}">${num(ctx.lang, n)}</a>` : html`<span>${num(ctx.lang, n)}</span>`))
  return html`<sup class="vz-src" aria-label="${t.sourceMark} ${ns.map((n) => num(ctx.lang, n)).join(', ')}">${join(marks, '<span aria-hidden="true">,</span>')}</sup>`
}

function linkNames(ctx: StrategyContext, links: string[], names: Record<string, string>): SafeHtml {
  return join(
    links.map((link) => (link in names ? html`<span class="vz-item-link" dir="auto">${names[link]!}</span>` : html`<span class="vz-item-link vz-item-link--hidden">${ctx.cat.entities.linkHidden}</span>`)),
    ', ',
  )
}

/** Link label by target kind: a segment reads "For", anything else "Answers" (VPC) or "Uses" (TOWS). */
function itemLinks(ctx: StrategyContext, t: StrategyText, item: VisualEntityItem, names: Record<string, string>, otherLabel: string): SafeHtml {
  if (!item.links.length) return html``
  const segments = item.links.filter((link) => link.startsWith('seg-'))
  const others = item.links.filter((link) => !link.startsWith('seg-'))
  const row = (label: string, links: string[]) => (links.length ? html`<span class="vz-item-links"><span class="vz-item-links-k">${label}:</span> ${linkNames(ctx, links, names)}</span>` : '')
  return html`${row(t.forSegment, segments)}${row(otherLabel, others)}`
}

function itemList(ctx: StrategyContext, questionId: string, items: VisualEntityItem[], names: Record<string, string>, linkLabel: string, limit = PRINT_AREA_ITEMS): SafeHtml {
  const t = strategyText(ctx.lang)
  const spec = entitySpec(questionId)
  const numbers = noteNumbers(ctx)
  const shown = ctx.mode === 'print' ? items.slice(0, limit) : items
  const more = items.length - shown.length
  return html`<ol class="vz-items vz-sitems" aria-label="${fillVisual(ctx.cat.entities.itemCount, { count: num(ctx.lang, items.length) })}">${shown.map(
    (item) => html`<li class="vz-item">
      <span class="vz-item-name" dir="auto">${item.name}</span>${sourceMarks(ctx, item, numbers)}${item.tags.map((tag) => html` <span class="vz-item-tag">${spec ? entityOptionLabel(spec, tag.field, tag.value, ctx.lang) : tag.value}</span>`)}
      ${item.detail ? html`<span class="vz-item-detail" dir="auto">${item.detail}</span>` : ''}
      ${itemLinks(ctx, t, item, names, linkLabel)}
    </li>`,
  )}</ol>${more > 0 ? html`<p class="vz-items-more">${fillVisual(ctx.cat.entities.moreItems, { count: num(ctx.lang, more) })}</p>` : ''}`
}

/** What an area shows: its items, a flagged legacy text, a withheld or not-applicable line, or the designed empty state. */
function areaBody(ctx: StrategyContext, area: ListArea<string>, emptyTitle: string, names: Record<string, string>, linkLabel: string, limit = PRINT_AREA_ITEMS): SafeHtml {
  const entry = area.entry
  if (entry?.items?.length) return itemList(ctx, entry.id, entry.items, names, linkLabel, limit)
  if (entry?.legacy && entry.value !== null) {
    return html`<p class="vz-entry-value" dir="auto">${entry.value}</p><p class="vz-legacy">${icon('alert')}<span>${ctx.cat.entities.legacy}</span><span class="vz-legacy-hint">${ctx.cat.entities.legacyHint}</span></p>`
  }
  if (entry?.state === 'withheld') return html`<p class="vz-entry-value vz-entry-value--withheld">${icon('lock')}<span>${ctx.cat.text.withheldValue}</span></p>`
  if (entry?.state === 'not_applicable') return html`<p class="vz-entry-value vz-entry-value--ghost">${ctx.cat.text.notApplicableZone}</p>`
  const t = strategyText(ctx.lang)
  const reason = entry?.missing_reason && entry.missing_reason !== 'unanswered' ? ctx.cat.missingReason[entry.missing_reason] : ctx.doc.audience === 'public' ? ctx.cat.missingReason.not_published : t.emptyBody
  return ghostChart({ title: emptyTitle, body: reason })
}

function areaMeta(ctx: StrategyContext, area: ListArea<string>): SafeHtml {
  const entry = area.entry
  if (!entry || entry.value === null) return areaChip(ctx.cat, area.state)
  return html`${stateChip(ctx.cat, entry.state)}${entry.version !== null ? html`<span class="vz-entry-version">${fillVisual(ctx.cat.text.version, { version: num(ctx.lang, entry.version) })}</span>` : ''}`
}

function plateHead(ctx: StrategyContext, n: number, id: string, title: string, lead: string, ready: boolean): SafeHtml {
  return html`<header class="vz-plate-head">
    <p class="vz-plate-num"><span>${num2(ctx.lang, n)}</span><span class="vz-plate-state${ready ? ' vz-plate-state--ready' : ''}">${ready ? ctx.cat.zoneState.complete : ctx.cat.zoneState.partial}</span></p>
    <h2 class="vz-plate-title" id="${id}-t">${title}</h2>
    <p class="vz-plate-lead">${lead}</p>
  </header>`
}

// ---- SWOT -------------------------------------------------------------------------------------------------------

export function swotView(block: SwotBlock, ctx: StrategyContext): SafeHtml {
  const t = strategyText(ctx.lang)
  const id = 'st-swot'
  const cells = block.quadrants.map((area) => {
    const q = t.quadrant[area.area_id]
    return html`<article class="vz-swot-q vz-swot-q--${area.area_id} vz-zstate--${area.state}" dir="${ctx.cat.dir}" aria-labelledby="${id}-${area.area_id}">
      <header class="vz-swot-head">
        <span class="vz-swot-letter" aria-hidden="true">${area.area_id.charAt(0).toUpperCase()}</span>
        <h3 class="vz-swot-title" id="${id}-${area.area_id}">${q.title}</h3>
        <p class="vz-swot-prompt">${q.prompt}</p>
        <p class="vz-swot-meta">${areaMeta(ctx, area)}</p>
      </header>
      ${areaBody(ctx, area, q.empty, {}, '')}
    </article>`
  })
  return html`<section class="vz-plate vz-plate--swot" id="${id}" aria-labelledby="${id}-t">
    ${plateHead(ctx, 1, id, t.swotTitle, t.swotLead, block.data_state === 'complete')}
    <div class="vz-swot" dir="ltr" role="group" aria-label="${t.swotTitle}">
      <span class="vz-swot-axis vz-swot-axis--helpful" dir="${ctx.cat.dir}">${t.axisHelpful}</span>
      <span class="vz-swot-axis vz-swot-axis--harmful" dir="${ctx.cat.dir}">${t.axisHarmful}</span>
      <span class="vz-swot-axis vz-swot-axis--internal" dir="${ctx.cat.dir}">${t.axisInternal}</span>
      <span class="vz-swot-axis vz-swot-axis--external" dir="${ctx.cat.dir}">${t.axisExternal}</span>
      ${cells}
    </div>
  </section>`
}

// ---- TOWS -------------------------------------------------------------------------------------------------------

/** TOWS cell positions in Weihrich's layout: internal factors as columns (S, W), external as rows (O, T). */
const TOWS_POSITION: Record<TowsType, string> = { so: 'vz-tows-so', wo: 'vz-tows-wo', st: 'vz-tows-st', wt: 'vz-tows-wt' }

function swotItemsOf(doc: VisualDocument, quadrant: SwotBlock['quadrants'][number]['area_id']): VisualEntityItem[] {
  const swot = doc.blocks.find((block): block is SwotBlock => block.type === 'swot')
  return swot?.quadrants.find((area) => area.area_id === quadrant)?.entry?.items ?? []
}

export function towsView(block: TowsMatrixBlock, ctx: StrategyContext): SafeHtml {
  const t = strategyText(ctx.lang)
  const id = 'st-tows'
  const strategies = new Map((block.area.entry?.items ?? []).map((item) => [item.id, item]))
  const numbers = noteNumbers(ctx)
  const strategy = (item: VisualEntityItem) => html`<li class="vz-item">
    <span class="vz-item-name" dir="auto">${item.name}</span>${sourceMarks(ctx, item, numbers)}
    ${item.detail ? html`<span class="vz-item-detail" dir="auto">${item.detail}</span>` : ''}
    ${item.links.length ? html`<span class="vz-item-links"><span class="vz-item-links-k">${t.uses}:</span> ${linkNames(ctx, item.links, block.names)}</span>` : ''}
  </li>`
  const header = (quadrant: 'strengths' | 'weaknesses' | 'opportunities' | 'threats', cls: string) => {
    const items = swotItemsOf(ctx.doc, quadrant)
    const shown = ctx.mode === 'print' ? items.slice(0, 4) : items
    return html`<div class="vz-tows-h ${cls}" dir="${ctx.cat.dir}">
      <p class="vz-tows-h-title"><span class="vz-swot-letter" aria-hidden="true">${quadrant.charAt(0).toUpperCase()}</span><span>${t.quadrant[quadrant].title}</span></p>
      ${shown.length ? html`<ul class="vz-tows-h-items">${shown.map((item) => html`<li dir="auto">${item.name}</li>`)}</ul>${items.length > shown.length ? html`<p class="vz-items-more">${fillVisual(ctx.cat.entities.moreItems, { count: num(ctx.lang, items.length - shown.length) })}</p>` : ''}` : html`<p class="vz-tows-h-none">${t.quadrant[quadrant].empty}</p>`}
    </div>`
  }
  const cell = (type: TowsType) => {
    const items = block.cells[type].map((itemId) => strategies.get(itemId)).filter((item): item is VisualEntityItem => item !== undefined)
    const shown = ctx.mode === 'print' ? items.slice(0, PRINT_AREA_ITEMS) : items
    return html`<article class="vz-tows-cell ${TOWS_POSITION[type]}${items.length ? '' : ' is-empty'}" dir="${ctx.cat.dir}" aria-labelledby="${id}-${type}">
      <h3 class="vz-tows-title" id="${id}-${type}">${t.tows[type].title}</h3>
      <p class="vz-tows-lead">${t.tows[type].lead}</p>
      ${shown.length ? html`<ol class="vz-items vz-sitems">${shown.map(strategy)}</ol>${items.length > shown.length ? html`<p class="vz-items-more">${fillVisual(ctx.cat.entities.moreItems, { count: num(ctx.lang, items.length - shown.length) })}</p>` : ''}` : html`<p class="vz-tows-none">${t.towsEmptyCell}</p>`}
    </article>`
  }
  const hasItems = (block.area.entry?.items?.length ?? 0) > 0
  const unplaced = block.unplaced.map((itemId) => strategies.get(itemId)).filter((item): item is VisualEntityItem => item !== undefined)
  const body = hasItems
    ? html`<div class="vz-tows" dir="ltr" role="group" aria-label="${t.towsTitle}">
        <span class="vz-tows-corner" aria-hidden="true"></span>
        ${header('strengths', 'vz-tows-hs')}${header('weaknesses', 'vz-tows-hw')}
        ${header('opportunities', 'vz-tows-ho')}${cell('so')}${cell('wo')}
        ${header('threats', 'vz-tows-ht')}${cell('st')}${cell('wt')}
      </div>
      ${unplaced.length ? html`<section class="vz-tows-unplaced" aria-labelledby="${id}-unplaced"><h3 class="vz-sub" id="${id}-unplaced">${t.towsUnplaced}</h3><ol class="vz-items vz-sitems">${unplaced.map(strategy)}</ol></section>` : ''}
      <p class="vz-swot-meta">${areaMeta(ctx, block.area)}</p>`
    : html`<div class="vz-tows-empty">${areaBody(ctx, block.area, t.towsEmptyTitle, block.names, t.uses)}</div>`
  return html`<section class="vz-plate vz-plate--tows" id="${id}" aria-labelledby="${id}-t">
    ${plateHead(ctx, 2, id, t.towsTitle, t.towsLead, block.data_state === 'complete')}
    ${body}
  </section>`
}

// ---- Value Proposition Canvas -------------------------------------------------------------------------------------

function vpcZone(ctx: StrategyContext, block: ValuePropositionCanvasBlock, zoneId: ValueFitZoneId): SafeHtml {
  const t = strategyText(ctx.lang)
  const area = block.zones.find((zone) => zone.area_id === zoneId)
  if (!area) return html``
  const z = t.zone[zoneId]
  return html`<article class="vz-vpc-zone vz-vpc-zone--${zoneId} vz-zstate--${area.state}" dir="${ctx.cat.dir}" aria-labelledby="vpc-${zoneId}">
    <header class="vz-vpc-head">
      <span class="vz-zone-num" aria-hidden="true">${num2(ctx.lang, area.order)}</span>
      <h3 class="vz-vpc-title" id="vpc-${zoneId}">${z.title}</h3>
      <p class="vz-vpc-prompt">${z.prompt}</p>
      <p class="vz-swot-meta">${areaMeta(ctx, area)}</p>
    </header>
    ${areaBody(ctx, area, z.empty, block.names, t.addresses, PRINT_ZONE_ITEMS)}
  </article>`
}

function fitTable(ctx: StrategyContext, block: ValuePropositionCanvasBlock, heading = true): SafeHtml {
  const t = strategyText(ctx.lang)
  const rows = (fit: ValuePropositionCanvasBlock['fit']['pains'], colA: string, colB: string, none: string, summary: string) => {
    if (!fit.length) return html``
    const done = fit.filter((row) => row.addressed_by.length > 0).length
    return html`<div class="vz-fit-group">
      <p class="vz-fit-summary"><span class="vz-fit-count">${fillVisual(summary, { done: num(ctx.lang, done), total: num(ctx.lang, fit.length) })}</span></p>
      <table class="vz-table vz-fit-table">
        <thead><tr><th scope="col">${colA}</th><th scope="col">${colB}</th></tr></thead>
        <tbody>${fit.map((row) => html`<tr class="${row.addressed_by.length ? 'is-fit' : 'is-gap'}"><th scope="row"><span dir="auto">${block.names[row.id] ?? ctx.cat.entities.linkHidden}</span></th><td>${row.addressed_by.length ? html`<span class="vz-fit-mark" aria-hidden="true">${icon('checkCircle')}</span>${linkNames(ctx, row.addressed_by, block.names)}` : html`<span class="vz-fit-gap">${icon('circle')}<span>${none}</span></span>`}</td></tr>`)}</tbody>
      </table>
    </div>`
  }
  const any = block.fit.pains.length + block.fit.gains.length > 0
  return html`<section class="vz-fit" id="vpc-fit" aria-labelledby="vpc-fit-t">
    ${heading ? html`<h3 class="vz-sub" id="vpc-fit-t">${t.fitTitle}</h3><p class="vz-note">${t.fitLead}</p>` : ''}
    ${any ? html`<div class="vz-fit-grid">${rows(block.fit.pains, t.fitColPain, t.fitColRelievers, t.fitNoReliever, t.painsRelieved)}${rows(block.fit.gains, t.fitColGain, t.fitColCreators, t.fitNoCreator, t.gainsCreated)}</div>` : html`<p class="vz-note">${t.fitEmpty}</p>`}
  </section>`
}

export function valuePropositionView(block: ValuePropositionCanvasBlock, ctx: StrategyContext): SafeHtml {
  const t = strategyText(ctx.lang)
  const id = 'vpc-canvas'
  return html`<section class="vz-plate vz-plate--vpc" id="${id}" aria-labelledby="${id}-t">
    ${plateHead(ctx, 1, id, t.vpcTitle, t.vpcLead, block.data_state === 'complete')}
    <div class="vz-vpc" dir="ltr" role="group" aria-label="${t.vpcTitle}">
      <div class="vz-vpc-map" role="group" aria-label="${t.valueMap}">
        <p class="vz-vpc-label" dir="${ctx.cat.dir}">${t.valueMap}</p>
        ${vpcZone(ctx, block, 'products_services')}${vpcZone(ctx, block, 'gain_creators')}${vpcZone(ctx, block, 'pain_relievers')}
      </div>
      <span class="vz-vpc-fit" aria-hidden="true"><span></span><span></span></span>
      <div class="vz-vpc-profile" role="group" aria-label="${t.customerProfile}">
        <p class="vz-vpc-label" dir="${ctx.cat.dir}">${t.customerProfile}</p>
        ${vpcZone(ctx, block, 'gains')}${vpcZone(ctx, block, 'pains')}${vpcZone(ctx, block, 'customer_jobs')}
      </div>
    </div>
    ${ctx.mode === 'screen' ? fitTable(ctx, block) : ''}
  </section>`
}

/** Print only: the fit gets its own plate, so the canvas keeps a whole A4 page. */
export function fitPlate(block: ValuePropositionCanvasBlock, ctx: StrategyContext): SafeHtml {
  const t = strategyText(ctx.lang)
  const id = 'vpc-fitplate'
  const total = block.fit.pains.length + block.fit.gains.length
  const done = [...block.fit.pains, ...block.fit.gains].filter((row) => row.addressed_by.length).length
  return html`<section class="vz-plate vz-plate--fit" id="${id}" aria-labelledby="vpc-fit-t">
    ${plateHead(ctx, 2, 'vpc-fit', t.fitTitle, t.fitLead, total > 0 && done === total)}
    ${fitTable(ctx, block, false)}
  </section>`
}

// ---- sources, opener, ids, print -----------------------------------------------------------------------------------

function noteLine(ctx: StrategyContext, t: StrategyText, note: SourceNote): SafeHtml {
  const name =
    note.kind === 'web'
      ? note.host
        ? ctx.mode === 'screen' && note.url
          ? html`<a href="${note.url}" target="_blank" rel="noopener noreferrer nofollow" dir="ltr">${note.host}</a>`
          : html`<span dir="ltr">${note.host}</span>`
        : html``
      : note.label
        ? html`<span dir="auto">${note.label}</span>`
        : html``
  return html`<li class="vz-snote vz-snote--${note.status}" id="${ctx.doc.document_kind}-src-${note.n}">
    <span class="vz-snote-n">${num(ctx.lang, note.n)}</span>
    <span class="vz-snote-body"><span class="vz-snote-kind">${t.sourceKind[note.kind]}</span>${name}<span class="vz-snote-status">${t.sourceStatus[note.status]}</span></span>
  </li>`
}

export function sourceNotesView(block: SourceNotesBlock, ctx: StrategyContext): SafeHtml {
  const t = strategyText(ctx.lang)
  return html`<section class="vz-plate vz-plate--snotes" id="${ctx.doc.document_kind}-sources" aria-labelledby="${ctx.doc.document_kind}-sources-t">
    <h2 class="vz-sub" id="${ctx.doc.document_kind}-sources-t">${t.sourcesTitle}</h2>
    <p class="vz-note">${t.sourcesLead}</p>
    ${block.notes.length ? html`<ol class="vz-snotes">${block.notes.map((note) => noteLine(ctx, t, note))}</ol>` : html`<p class="vz-note">${t.sourcesNone}</p>`}
    ${block.hidden > 0 ? html`<p class="vz-note">${fillVisual(t.sourcesHidden, { count: num(ctx.lang, block.hidden) })}</p>` : ''}
  </section>`
}

export function strategyOpener(ctx: StrategyContext, linked: boolean): SafeHtml {
  const t = strategyText(ctx.lang)
  const swot = ctx.doc.document_kind === 'swot_tows'
  const plates: Array<[string, string, boolean]> = swot
    ? [
        ['st-swot', t.swotTitle, ctx.doc.blocks.some((block) => block.type === 'swot' && block.data_state === 'complete')],
        ['st-tows', t.towsTitle, ctx.doc.blocks.some((block) => block.type === 'tows_matrix' && block.data_state === 'complete')],
      ]
    : [
        ['vpc-canvas', t.vpcTitle, ctx.doc.blocks.some((block) => block.type === 'value_proposition_canvas' && block.data_state === 'complete')],
        ['vpc-fit', t.fitTitle, ctx.doc.blocks.some((block) => block.type === 'value_proposition_canvas' && block.fit.pains.length + block.fit.gains.length > 0 && [...block.fit.pains, ...block.fit.gains].every((row) => row.addressed_by.length > 0))],
      ]
  return html`<header class="vz-opener">
    <p class="vz-kicker"><span class="vz-kicker-bar" aria-hidden="true"></span>${t.kicker}</p>
    <h1 class="vz-opener-title">${swot ? t.swotPageTitle : t.vpcTitle}</h1>
    <p class="vz-opener-brand" dir="auto">${ctx.doc.brand_name}</p>
    <p class="vz-opener-lead">${swot ? t.swotLead : t.vpcLead}</p>
    <nav class="vz-toc" aria-label="${ctx.cat.text.zoneIndex}">
      <ol>${plates.map(([target, title, ready], index) => html`<li class="vz-toc-item${ready ? ' is-ready' : ''}">${linked ? html`<a href="#${target}">` : ''}<span class="vz-toc-num">${num2(ctx.lang, index + 1)}</span><span class="vz-toc-name">${title}</span><span class="vz-toc-leader" aria-hidden="true"></span><span class="vz-toc-state">${ready ? ctx.cat.zoneState.complete : ctx.cat.zoneState.partial}</span>${linked ? html`</a>` : ''}</li>`)}</ol>
    </nav>
  </header>`
}

/** Every visible item with its id and source references: the details disclosure on screen, the print appendix. */
export function strategyIds(ctx: StrategyContext): SafeHtml {
  const t = strategyText(ctx.lang)
  const rows: Array<{ question: string; item: VisualEntityItem }> = []
  for (const block of ctx.doc.blocks) {
    const areas: Array<ListArea<string>> = block.type === 'swot' ? block.quadrants : block.type === 'tows_matrix' ? [block.area] : block.type === 'value_proposition_canvas' ? block.zones : []
    for (const area of areas) for (const item of area.entry?.items ?? []) rows.push({ question: area.entry!.id, item })
  }
  const questions = [...new Set(ctx.doc.blocks.flatMap((block) => (block.type === 'swot' ? block.quadrants : block.type === 'tows_matrix' ? [block.area] : block.type === 'value_proposition_canvas' ? block.zones : []).map((area) => area.entry?.id).filter((qid): qid is string => Boolean(qid))))]
  return html`<section class="vz-panel vz-sources" aria-labelledby="${ctx.doc.document_kind}-ids-t">
    <h2 class="vz-panel-title" id="${ctx.doc.document_kind}-ids-t">${t.idsTitle}</h2>
    <p class="vz-muted">${t.idsLead}</p>
    ${questions.length ? html`<p class="vz-details-ids"><span class="vz-muted">${ctx.cat.text.detailsFields}:</span> ${join(questions.map((qid) => html`<code class="vz-code" dir="ltr">${qid}</code>`), ' ')}</p>` : ''}
    ${rows.length
      ? html`<table class="vz-table">
      <thead><tr><th scope="col">${t.idsColItem}</th><th scope="col">${t.idsColId}</th><th scope="col">${t.idsColSources}</th></tr></thead>
      <tbody>${rows.map(({ item }) => html`<tr><th scope="row"><span class="vz-entry-label" dir="auto">${item.name}</span></th><td><code class="vz-code" dir="ltr">${item.id}</code></td><td>${item.sources?.length ? join(item.sources.map((ref) => html`<code class="vz-code" dir="ltr">${ref}</code>`), ' ') : '—'}</td></tr>`)}</tbody>
    </table>`
      : ''}
    ${ctx.showNext ? html`<p class="vz-note" dir="auto">${t.editHint}</p>` : ''}
  </section>`
}

export interface StrategyPrintInput {
  doc: VisualDocument
  lang: VisualLang
  commit: string | null
  head: SafeHtml
  toolbar: SafeHtml
}

/** Static print view, A4 portrait (the book's named page): opener, one page per plate, then sources and the appendix. */
export function strategyPrintDocument(input: StrategyPrintInput, render: (block: VisualDocument['blocks'][number], ctx: StrategyContext) => SafeHtml): SafeHtml {
  const { doc, lang } = input
  const cat = visualCatalog(lang)
  const t = strategyText(lang)
  const ctx: StrategyContext = { cat, lang, mode: 'print', doc, showNext: false }
  const internal = doc.audience === 'internal'
  const edition = internal ? cat.text.editionInternal : cat.text.editionPublic
  const title = doc.document_kind === 'swot_tows' ? t.swotPageTitle : t.vpcTitle
  // Folios come from the page margin box (`@page vz-sbook`), in the reader's digits; the running foot names the plate.
  const foot = (label: string) => html`<footer class="vz-print-foot"><span>${t.kicker}</span><span dir="auto">${doc.brand_name}</span><span>${internal ? cat.text.classInternal : cat.text.classPublic}</span><span>${label}</span></footer>`
  const plates = doc.blocks.filter((block) => block.type !== 'source_notes')
  const notes = notesOf(doc)
  const plateLabel = (block: VisualDocument['blocks'][number]) => (block.type === 'swot' ? t.swotTitle : block.type === 'tows_matrix' ? t.towsTitle : t.vpcTitle)
  return html`<!doctype html>
<html lang="${lang}" dir="${cat.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="same-origin">
<title>${title} · ${doc.brand_name}</title>
${input.head}
</head>
<body class="vz-print-body vz-book-body${doc.illustrative ? ' vz-is-mock' : ''}">
${input.toolbar}
<main class="vz-print" id="main">
  <section class="vz-page vz-page--book vz-page--sbook vz-page--opener" aria-label="${title}">
    ${illustrativeStamp(cat, doc)}
    ${strategyOpener(ctx, false)}
    <dl class="vz-print-meta vz-book-meta">
      <div><dt>${cat.text.classification}</dt><dd><span class="vz-edition vz-edition--${doc.audience}">${edition}</span></dd></div>
      <div><dt>${cat.text.commit}</dt><dd><code class="vz-code" dir="ltr">${input.commit ? input.commit.slice(0, 12) : '—'}</code></dd></div>
    </dl>
    ${foot(title)}
  </section>
  ${plates.map((block) => html`<section class="vz-page vz-page--book vz-page--sbook vz-page--plate vz-page--strategy" aria-label="${plateLabel(block)}">${illustrativeStamp(cat, doc)}${render(block, ctx)}${foot(plateLabel(block))}</section>${block.type === 'value_proposition_canvas' ? html`<section class="vz-page vz-page--book vz-page--sbook vz-page--plate vz-page--strategy" aria-label="${t.fitTitle}">${illustrativeStamp(cat, doc)}${fitPlate(block, ctx)}${foot(t.fitTitle)}</section>` : ''}`)}
  <section class="vz-page vz-page--book vz-page--sbook vz-page--appendix" aria-label="${t.pageSources}">
    ${illustrativeStamp(cat, doc)}
    ${notes ? render(notes, ctx) : ''}
    ${strategyIds(ctx)}
    ${join(doc.framework_refs.map((ref) => frameworkNote(cat, ref, 'print', lang)))}
    <p class="vz-muted vz-edition-note">${internal ? cat.text.editionInternalNote : cat.text.editionPublicNote}</p>
    ${foot(t.pageSources)}
  </section>
</main>
</body>
</html>`
}
