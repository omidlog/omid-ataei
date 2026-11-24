import type { DataState, VisualCatalog, VisualDocument, VisualLang } from '@brand-os/brand-core/visual'
import { fillVisual } from '@brand-os/brand-core/visual'
import { html, join, type SafeHtml } from './html.js'
import { icon, type IconName } from './icons.js'

/**
 * Shared visual primitives (Visual Blueprint V1.1). Every block renderer draws its states, legend, sources, empty
 * geometry and overview map with these, so a state looks and reads the same on every page and in print. No inline
 * style or script (strict CSP): classes from `static/visual.css`, SVG presentation attributes only.
 */

/** Every state is text plus an icon plus a colour, never colour alone. */
export const STATE_META: Record<DataState, { tone: string; icon: IconName }> = {
  approved: { tone: 'approved', icon: 'checkCircle' },
  stale: { tone: 'stale', icon: 'history' },
  assumption: { tone: 'draft', icon: 'clock' },
  recommendation: { tone: 'suggestion', icon: 'sparkle' },
  missing: { tone: 'missing', icon: 'circle' },
  withheld: { tone: 'withheld', icon: 'lock' },
  conflicting: { tone: 'conflict', icon: 'alert' },
  not_applicable: { tone: 'na', icon: 'skip' },
}

export function stateChip(cat: VisualCatalog, state: DataState): SafeHtml {
  const meta = STATE_META[state]
  return html`<span class="vz-chip vz-chip--${meta.tone}">${icon(meta.icon)}<span>${cat.state[state]}</span></span>`
}

export function legend(cat: VisualCatalog, states: DataState[]): SafeHtml {
  return html`<ul class="vz-legend" aria-label="${cat.text.statusLegend}">${states.map((state) => html`<li>${stateChip(cat, state)}</li>`)}</ul>`
}

/** Two-digit ordinal used for zone and plate numbers. */
export function two(n: number): string {
  return String(n).padStart(2, '0')
}

export function dateOnly(iso: string | null, lang: VisualLang): string | null {
  if (!iso) return null
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return null
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeZone: 'UTC' }).format(at)
}

export function illustrativeStamp(cat: VisualCatalog, doc: VisualDocument): SafeHtml {
  if (!doc.illustrative) return html``
  return html`<p class="vz-mock" role="note"><strong>${cat.text.illustrative}</strong> <span>${cat.text.illustrativeNote}</span></p>`
}

/**
 * Ghost geometry for content that is not there yet: a designed empty state, never a blank box and never a guessed
 * value. `lines` is the canvas gap; the other variants hint at the shape the approved content will take.
 */
export type GhostVariant = 'lines' | 'swatches' | 'specimen' | 'mark'

export function ghostChart(input: { title: string; body?: string | null; variant?: GhostVariant }): SafeHtml {
  const variant = input.variant ?? 'lines'
  const body = input.body ? html`<p class="vz-gap-body">${input.body}</p>` : ''
  if (variant === 'lines') return html`<div class="vz-gap"><span class="vz-gap-ghost" aria-hidden="true"></span><p class="vz-gap-title">${input.title}</p>${body}</div>`
  const shapes =
    variant === 'swatches'
      ? html`<span class="vz-ghost-swatches" aria-hidden="true"><span></span><span></span><span></span><span></span></span>`
      : variant === 'specimen'
        ? html`<span class="vz-ghost-specimen" aria-hidden="true"><span class="vz-ghost-aa">Aa</span><span class="vz-gap-ghost"></span></span>`
        : html`<span class="vz-ghost-mark" aria-hidden="true"><span></span></span>`
  return html`<div class="vz-gap vz-gap--${variant}">${shapes}<p class="vz-gap-title">${input.title}</p>${body}</div>`
}

/**
 * A quiet footnote under a specimen: which approved fact it was drawn from, its version and approval date. The
 * reader sees the plain label; the field id stays in the details and the print appendix.
 */
export function sourceFootnote(
  cat: VisualCatalog,
  lang: VisualLang,
  source: { label: string; state: DataState; version: number | null; approved_at: string | null } | null,
  extra: string[] = [],
): SafeHtml {
  if (!source) return html``
  const approved = dateOnly(source.approved_at, lang)
  const parts: SafeHtml[] = [html`<span class="vz-foot-label" dir="auto">${source.label}</span>`]
  if (source.version !== null) parts.push(html`<span>${fillVisual(cat.text.version, { version: source.version })}</span>`)
  if (approved) parts.push(html`<span>${fillVisual(cat.text.asOf, { date: approved })}</span>`)
  for (const item of extra) parts.push(html`<span>${item}</span>`)
  return html`<p class="vz-foot"><span class="vz-foot-kind">${cat.text.sourceShort}</span> ${join(parts, '<span class="vz-foot-sep" aria-hidden="true"> · </span>')} ${stateChip(cat, source.state)}</p>`
}

/** One cell of a topology-faithful overview map, in grid units. */
export interface MapCell {
  key: string
  x: number
  y: number
  w: number
  h: number
  num: string
  /** CSS state suffix (`vz-map--<state>`). */
  state: string
  label: string
  /** Fragment target when the map is linked. */
  href: string | null
}

/**
 * A small SVG map of a page's structure, drawn in the framework's own topology: the 30-second read of what is
 * filled. Linked cells jump to their section; unlinked (print) cells are labelled images.
 */
export function miniMap(label: string, cells: MapCell[], size: { cols: number; rows: number; unitX: number; unitY: number }, linked: boolean): SafeHtml {
  const { unitX, unitY } = size
  const shapes = cells.map((cell) => {
    const shape = html`<rect class="vz-map-cell vz-map--${cell.state}" x="${cell.x * unitX + 1}" y="${cell.y * unitY + 1}" width="${cell.w * unitX - 2}" height="${cell.h * unitY - 2}" rx="1.5"/><text class="vz-map-num" x="${cell.x * unitX + 4}" y="${cell.y * unitY + 9}">${cell.num}</text>`
    return linked && cell.href ? html`<a href="${cell.href}" aria-label="${cell.label}"><title>${cell.label}</title>${shape}</a>` : html`<g role="img" aria-label="${cell.label}">${shape}</g>`
  })
  const box = `0 0 ${size.cols * unitX} ${size.rows * unitY}`
  if (!linked) return html`<svg class="vz-map" viewBox="${box}" role="img" aria-label="${label}" dir="ltr">${shapes}</svg>`
  return html`<nav class="vz-map-nav" aria-label="${label}"><svg class="vz-map" viewBox="${box}" dir="ltr" focusable="false">${shapes}</svg></nav>`
}
