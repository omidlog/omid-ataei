import type { OwnerLabel, PositioningMapBlock, PositioningPlacement, PositioningPoint, PositioningState, PositioningText, VisualLang } from '@brand-os/brand-core/visual'
import { fillVisual, positioningText } from '@brand-os/brand-core/visual'
import { html, join, type SafeHtml } from './html.js'
import { icon, type IconName } from './icons.js'
import { footnoteRefs, type ComparisonContext } from './visual-competitors.js'
import { two } from './visual-primitives.js'

/**
 * Positioning map renderer (Visual Blueprint V2.3, owner decision D2). The owner's two axes, a quiet band grid, and
 * only the subjects whose position on BOTH axes is backed by a dated source. A stale position wears a dashed ring; a
 * conflict is drawn as a dashed range box spanning the disagreeing bands, never resolved to one point. Everyone else
 * is listed in the "Not placed" margin with each axis's state. The SVG is explicit geometry (`dir="ltr"`); every word
 * lives in HTML around it so Persian sets in Vazirmatn and reads right to left. The vertical axis always runs low to
 * high, bottom to top. The horizontal axis follows the reading direction (owner decision, 2026-11-23): en/tr run low
 * to high left to right; fa is mirrored, low on the right and high on the left, with the vertical axis on the right
 * where the two low ends meet. No inline style or script (strict CSP); no technical id in the main view.
 */

/** True when the horizontal axis runs right to left (low on the right). Only Persian, the one right-to-left edition. */
export function mirrorsX(lang: VisualLang): boolean {
  return lang === 'fa'
}

const CELL = 96
const RANGE_INSET = 10

/** Every placement state is icon + text + tone, never colour alone. Tones reuse the matrix marks. */
const STATE_META: Record<PositioningState, { tone: string; icon: IconName }> = {
  evidenced: { tone: 'present', icon: 'checkCircle' },
  stale: { tone: 'historical', icon: 'history' },
  conflicting: { tone: 'conflicting', icon: 'alert' },
  needs_review: { tone: 'review', icon: 'refresh' },
  unknown: { tone: 'unknown', icon: 'circle' },
}

function ownerWords(label: OwnerLabel, lang: VisualLang): string {
  return (lang === 'fa' ? label.fa : lang === 'tr' ? label.tr : null) ?? label.en
}

function stateName(t: PositioningText, state: PositioningState, days: number | null): string {
  return fillVisual(t.state[state], { days: days ?? 90 })
}

function stateMark(t: PositioningText, state: PositioningState, days: number | null): SafeHtml {
  const meta = STATE_META[state]
  return html`<span class="vz-cmp-mark vz-cmp--${meta.tone}">${icon(meta.icon)}<span>${stateName(t, state, days)}</span></span>`
}

function bandName(t: PositioningText, band: string): string {
  return (t.band as Record<string, string>)[band] ?? band
}

function placeText(t: PositioningText, placement: PositioningPlacement): string {
  if (!placement.bands.length) return t.state.unknown
  const first = bandName(t, placement.bands[0] as string)
  const last = bandName(t, placement.bands[placement.bands.length - 1] as string)
  return first === last ? first : `${first} – ${last}`
}

function span(block: PositioningMapBlock, placement: PositioningPlacement): [number, number] {
  const idx = placement.bands.map((band) => block.bands.indexOf(band)).filter((i) => i >= 0)
  if (!idx.length) return [0, 0]
  return [Math.min(...idx), Math.max(...idx)]
}

function pointLabel(t: PositioningText, point: PositioningPoint): string {
  return point.kind === 'own_brand' ? `${t.ownBrand} · ${point.name}` : point.name
}

function pointState(point: PositioningPoint): PositioningState {
  const states = [point.x.state, point.y.state]
  if (states.includes('conflicting')) return 'conflicting'
  if (states.includes('stale')) return 'stale'
  return 'evidenced'
}

interface Placed {
  point: PositioningPoint
  cx: number
  cy: number
  range: { x0: number; y0: number; x1: number; y1: number } | null
}

/** Grid geometry: band centres; points that land on the same spot are spread side by side, never stacked. */
function layout(block: PositioningMapBlock, mirror: boolean): { size: number; placed: Placed[] } {
  const n = Math.max(block.bands.length, 1)
  const size = n * CELL
  const raw = block.points.map((point) => {
    const [x0, x1] = span(block, point.x)
    const [y0, y1] = span(block, point.y)
    const cx = ((x0 + x1) / 2 + 0.5) * CELL
    const cy = size - ((y0 + y1) / 2 + 0.5) * CELL
    const range = x0 !== x1 || y0 !== y1 ? { x0: x0 * CELL + RANGE_INSET, x1: (x1 + 1) * CELL - RANGE_INSET, y0: size - (y1 + 1) * CELL + RANGE_INSET, y1: size - y0 * CELL - RANGE_INSET } : null
    return { point, cx, cy, range }
  })
  const groups = new Map<string, Placed[]>()
  for (const item of raw) {
    const key = `${item.cx},${item.cy}`
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  for (const group of groups.values()) group.forEach((item, k) => (item.cx += (k - (group.length - 1) / 2) * 34))
  // Mirror last, so side-by-side neighbours also read in the reading direction.
  if (mirror)
    for (const item of raw) {
      item.cx = size - item.cx
      if (item.range) item.range = { ...item.range, x0: size - item.range.x1, x1: size - item.range.x0 }
    }
  return { size, placed: raw }
}

function marker(ctx: ComparisonContext, t: PositioningText, block: PositioningMapBlock, item: Placed): SafeHtml {
  const { point, cx, cy } = item
  const fmt = new Intl.NumberFormat(ctx.lang)
  const state = pointState(point)
  const aria = fillVisual(t.pointAria, { name: pointLabel(t, point), x: placeText(t, point.x), y: placeText(t, point.y), state: stateName(t, state, block.stale_after_days) })
  const ring = state === 'stale' ? html`<circle class="vz-pos-stale" cx="${cx}" cy="${cy}" r="21"/>` : ''
  const shape =
    point.kind === 'own_brand'
      ? html`<rect class="vz-pos-own" x="${cx - 12}" y="${cy - 12}" width="24" height="24" transform="rotate(45 ${cx} ${cy})"/>`
      : html`<circle class="vz-pos-dot" cx="${cx}" cy="${cy}" r="14"/><text class="vz-pos-num" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central">${fmt.format(point.n ?? 0)}</text>`
  return html`<g class="vz-pos-point vz-pos-point--${state}" role="img" aria-label="${aria}"><title>${aria}</title>${ring}${shape}</g>`
}

function plot(ctx: ComparisonContext, t: PositioningText, block: PositioningMapBlock): SafeHtml {
  const mirror = mirrorsX(ctx.lang)
  const { size, placed } = layout(block, mirror)
  const n = block.bands.length
  const lines = Array.from({ length: Math.max(n - 1, 0) }, (_, i) => (i + 1) * CELL)
  const mid = size / 2
  const x = block.axes ? ownerWords(block.axes.x.label, ctx.lang) : ''
  const y = block.axes ? ownerWords(block.axes.y.label, ctx.lang) : ''
  const label = fillVisual(t.mapAria, { x, y, count: new Intl.NumberFormat(ctx.lang).format(block.points.length) })
  const ranges = placed.filter((item) => item.range).map((item) => html`<rect class="vz-pos-range" x="${item.range!.x0}" y="${item.range!.y0}" width="${item.range!.x1 - item.range!.x0}" height="${item.range!.y1 - item.range!.y0}" rx="6"/>`)
  // Own brand last so it is drawn on top.
  const order = [...placed.filter((p) => p.point.kind !== 'own_brand'), ...placed.filter((p) => p.point.kind === 'own_brand')]
  return html`<svg class="vz-pos-svg" viewBox="-2 -2 ${size + 4} ${size + 4}" role="group" aria-label="${label}" dir="ltr" data-x-direction="${mirror ? 'rtl' : 'ltr'}" focusable="false">
    <rect class="vz-pos-field" x="0" y="0" width="${size}" height="${size}"/>
    ${lines.map((at) => html`<line class="vz-pos-grid" x1="${at}" y1="0" x2="${at}" y2="${size}"/><line class="vz-pos-grid" x1="0" y1="${at}" x2="${size}" y2="${at}"/>`)}
    <line class="vz-pos-cross" x1="${mid}" y1="0" x2="${mid}" y2="${size}"/><line class="vz-pos-cross" x1="0" y1="${mid}" x2="${size}" y2="${mid}"/>
    <rect class="vz-pos-frame-line" x="0" y="0" width="${size}" height="${size}"/>
    ${ranges}
    ${order.map((item) => marker(ctx, t, block, item))}
  </svg>`
}

function figure(ctx: ComparisonContext, t: PositioningText, block: PositioningMapBlock): SafeHtml {
  const axes = block.axes!
  const words = (l: OwnerLabel) => ownerWords(l, ctx.lang)
  const mirror = mirrorsX(ctx.lang)
  // The chart grid follows the x direction: in fa the vertical axis column sits on the right and the x poles swap
  // sides (low on the right). DOM order stays low, name, high for every language.
  return html`<figure class="vz-pos-figure">
    <div class="vz-pos-chart${mirror ? ' vz-pos-chart--mirrored' : ''}" dir="${mirror ? 'rtl' : 'ltr'}">
      <div class="vz-pos-yaxis">
        <p class="vz-pos-pole vz-pos-pole--high" dir="auto">${words(axes.y.high)}</p>
        <p class="vz-pos-axis-name"><span class="vz-vh">${t.axisY}: </span><span class="vz-pos-arrow" aria-hidden="true">↑</span><span dir="auto">${words(axes.y.label)}</span></p>
        <p class="vz-pos-pole vz-pos-pole--low" dir="auto">${words(axes.y.low)}</p>
      </div>
      <div class="vz-pos-plot">${plot(ctx, t, block)}</div>
      <div class="vz-pos-xaxis">
        <p class="vz-pos-pole vz-pos-pole--low" dir="auto">${words(axes.x.low)}</p>
        <p class="vz-pos-axis-name"><span class="vz-vh">${t.axisX}: </span><span dir="auto">${words(axes.x.label)}</span><span class="vz-pos-arrow" aria-hidden="true">${mirror ? '←' : '→'}</span></p>
        <p class="vz-pos-pole vz-pos-pole--high" dir="auto">${words(axes.x.high)}</p>
      </div>
    </div>
    <figcaption class="vz-pos-caption">
      <p class="vz-note">${t.notAMeasurement} ${t.ownerWords}</p>
      ${block.points.some((p) => p.x.state === 'conflicting' || p.y.state === 'conflicting') ? html`<p class="vz-note vz-pos-note"><span class="vz-pos-swatch vz-pos-swatch--range" aria-hidden="true"></span><span>${t.rangeNote}</span></p>` : ''}
      ${block.points.some((p) => p.x.state === 'stale' || p.y.state === 'stale') ? html`<p class="vz-note vz-pos-note"><span class="vz-pos-swatch vz-pos-swatch--stale" aria-hidden="true"></span><span>${fillVisual(t.staleNote, { days: block.stale_after_days ?? 90 })}</span></p>` : ''}
    </figcaption>
  </figure>`
}

function keyMark(ctx: ComparisonContext, point: PositioningPoint): SafeHtml {
  if (point.kind === 'own_brand') return html`<span class="vz-pos-key-own" aria-hidden="true"></span>`
  return html`<span class="vz-pos-key-dot" aria-hidden="true">${new Intl.NumberFormat(ctx.lang).format(point.n ?? 0)}</span>`
}

function axisStates(ctx: ComparisonContext, t: PositioningText, block: PositioningMapBlock, point: PositioningPoint): SafeHtml {
  const axes = block.axes!
  const states = [...new Set([point.x.state, point.y.state])]
  if (states.length === 1) return stateMark(t, states[0] as PositioningState, block.stale_after_days)
  return html`<span class="vz-pos-states"><span class="vz-pos-state-line"><span class="vz-pos-axis-tag" dir="auto">${ownerWords(axes.x.label, ctx.lang)}</span>${stateMark(t, point.x.state, block.stale_after_days)}</span><span class="vz-pos-state-line"><span class="vz-pos-axis-tag" dir="auto">${ownerWords(axes.y.label, ctx.lang)}</span>${stateMark(t, point.y.state, block.stale_after_days)}</span></span>`
}

function keyTable(ctx: ComparisonContext, t: PositioningText, block: PositioningMapBlock): SafeHtml {
  const axes = block.axes!
  const own = block.points.filter((p) => p.kind === 'own_brand')
  const rows = [...own, ...block.points.filter((p) => p.kind !== 'own_brand')]
  return html`<table class="vz-pos-key">
    <caption class="vz-sub">${t.keyTitle}</caption>
    <thead><tr><th scope="col" class="vz-pos-key-n"><span class="vz-vh">#</span></th><th scope="col">${t.keyName}</th><th scope="col">${t.keyPlace}</th><th scope="col">${t.keyState}</th><th scope="col">${t.keySources}</th></tr></thead>
    <tbody>${rows.map(
      (point) => html`<tr class="${point.kind === 'own_brand' ? 'vz-pos-key-row--own' : ''}">
        <td class="vz-pos-key-n">${keyMark(ctx, point)}</td>
        <th scope="row">${point.kind === 'own_brand' ? html`<span class="vz-cmp-own-kicker">${t.ownBrand}</span>` : ''}<span class="vz-pos-key-name" dir="auto">${point.name}</span></th>
        <td><span class="vz-pos-place"><span class="vz-pos-axis-tag" dir="auto">${ownerWords(axes.x.label, ctx.lang)}</span><span>${placeText(t, point.x)}</span></span><span class="vz-pos-place"><span class="vz-pos-axis-tag" dir="auto">${ownerWords(axes.y.label, ctx.lang)}</span><span>${placeText(t, point.y)}</span></span></td>
        <td>${axisStates(ctx, t, block, point)}</td>
        <td>${footnoteRefs(ctx, point.footnotes)}</td>
      </tr>`,
    )}</tbody>
  </table>`
}

function margin(ctx: ComparisonContext, t: PositioningText, block: PositioningMapBlock): SafeHtml {
  if (!block.unplotted.length || !block.axes) return html``
  const axes = block.axes
  return html`<aside class="vz-pos-margin" aria-labelledby="pos-unknown-t">
    <p class="vz-sub" id="pos-unknown-t">${t.unknownTitle}</p>
    <ul>${block.unplotted.map(
      (point) => html`<li>
        <span class="vz-pos-margin-name">${point.kind === 'own_brand' ? html`<span class="vz-cmp-own-kicker">${t.ownBrand}</span>` : ''}<span dir="auto">${point.name}</span></span>
        <span class="vz-pos-state-line"><span class="vz-pos-axis-tag" dir="auto">${ownerWords(axes.x.label, ctx.lang)}</span>${stateMark(t, point.x.state, block.stale_after_days)}</span>
        <span class="vz-pos-state-line"><span class="vz-pos-axis-tag" dir="auto">${ownerWords(axes.y.label, ctx.lang)}</span>${stateMark(t, point.y.state, block.stale_after_days)}</span>
      </li>`,
    )}</ul>
    <p class="vz-note">${t.unknownBody}</p>
  </aside>`
}

/** The designed empty state: a ghost 2×2, what the map waits for and (owner only) the four steps. */
function awaiting(ctx: ComparisonContext, t: PositioningText, block: PositioningMapBlock): SafeHtml {
  const withheld = block.share_state === 'withheld'
  return html`<div class="vz-await vz-pos-await">
    <div class="vz-await-art"><div class="vz-pos-ghost" aria-hidden="true"><span></span><span></span><span></span><span></span></div></div>
    <div class="vz-await-copy">
      <p class="vz-await-kicker">${icon(withheld ? 'alert' : 'clock')}<span>${t.page}</span></p>
      <h3 class="vz-await-title">${withheld ? t.withheldTitle : t.emptyTitle}</h3>
      <p class="vz-await-body">${withheld ? t.withheldBody : t.emptyBody}</p>
      ${ctx.showNext && !withheld ? html`<div class="vz-await-steps"><p class="vz-await-steps-title">${t.emptyStepsTitle}</p><ol>${t.emptySteps.map((step) => html`<li dir="auto">${step}</li>`)}</ol></div>` : ''}
    </div>
  </div>`
}

export const POSITIONING_PLATE = 3

export function positioningMapView(block: PositioningMapBlock, ctx: ComparisonContext): SafeHtml {
  const t = positioningText(ctx.lang)
  const id = 'cmp-map'
  const head = html`<header class="vz-plate-head">
    <p class="vz-plate-num"><span>${two(POSITIONING_PLATE)}</span></p>
    <h2 class="vz-plate-title" id="${id}-t">${t.title}</h2>
    <p class="vz-plate-lead">${t.lead}</p>
  </header>`
  if (!block.axes) return html`<section class="vz-plate vz-cmp-plate vz-pos-plate" id="${id}" aria-labelledby="${id}-t">${head}${awaiting(ctx, t, block)}</section>`
  return html`<section class="vz-plate vz-cmp-plate vz-pos-plate" id="${id}" aria-labelledby="${id}-t">
    ${head}
    <div class="vz-pos-layout">
      ${figure(ctx, t, block)}
      <div class="vz-pos-side">
        ${block.points.length ? keyTable(ctx, t, block) : html`<div class="vz-pos-nopoints"><p class="vz-sub">${t.noPointsTitle}</p><p class="vz-note">${t.noPointsBody}</p></div>`}
        ${margin(ctx, t, block)}
      </div>
    </div>
  </section>`
}

/** Owner details: which shared competitor id sits behind each key number. Never on the main view. */
export function positioningDetails(ctx: ComparisonContext, block: PositioningMapBlock | undefined): SafeHtml {
  if (!block || !block.axes) return html``
  const t = positioningText(ctx.lang)
  const all = [...block.points, ...block.unplotted].filter((p) => p.kind === 'competitor')
  if (!all.length) return html``
  return html`<section class="vz-panel" aria-labelledby="pos-ids-t">
    <h2 class="vz-panel-title" id="pos-ids-t">${t.title}</h2>
    <table class="vz-table"><tbody>${join(all.map((p) => html`<tr><th scope="row">${p.n !== null ? html`<span>${new Intl.NumberFormat(ctx.lang).format(p.n)} · </span>` : ''}<span dir="auto">${p.name}</span></th><td><code class="vz-code" dir="ltr">${p.subject_id}</code></td></tr>`))}</tbody></table>
  </section>`
}
