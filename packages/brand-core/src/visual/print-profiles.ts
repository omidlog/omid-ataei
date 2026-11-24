import type { PrintProfile } from './model.js'

/**
 * Print engine profiles (Visual Blueprint V1.2). One typed record per paper profile: the sheet size, the margins
 * and whether a composer exists for it. Renderers read the geometry from here, so the page box, the paginator's
 * budget and the stylesheet agree. Holds no brand data.
 *
 * - `book_a4_portrait`: the Brand Book (cover, imprint, contents with page numbers, running heads, folios,
 *   numbered notes, tables that continue with a repeated header). Inner and outer margins swap on verso pages.
 * - `canvas_a3_landscape`: the business model canvas print view (unchanged since P0).
 * - `deck_16_9`: a typed stub. The geometry is fixed so the next slice cannot drift, but no composer exists yet.
 */
export type PaperProfile = Exclude<PrintProfile, 'web_interactive'>

export interface PrintProfileSpec {
  id: PaperProfile
  /** `ready`: a composer renders it. `planned`: geometry only; the export CLI refuses it with a clear message. */
  status: 'ready' | 'planned'
  orientation: 'portrait' | 'landscape'
  width_mm: number
  height_mm: number
  /** CSS named page used by the composer. */
  named_page: string
  /** Book margins: `inner` is the binding side (inline-start on a recto page in reading direction). */
  margin_mm: { top: number; bottom: number; inner: number; outer: number }
  /** Running head and folio bands inside the margin box, and the gap between bands and body. */
  head_mm: number
  folio_mm: number
  gap_mm: number
}

export const PRINT_PROFILE_SPECS: Record<PaperProfile, PrintProfileSpec> = {
  book_a4_portrait: {
    id: 'book_a4_portrait',
    status: 'ready',
    orientation: 'portrait',
    width_mm: 210,
    height_mm: 297,
    named_page: 'bk-a4',
    margin_mm: { top: 12, bottom: 11, inner: 22, outer: 17 },
    head_mm: 9,
    folio_mm: 8,
    gap_mm: 6,
  },
  canvas_a3_landscape: {
    id: 'canvas_a3_landscape',
    status: 'ready',
    orientation: 'landscape',
    width_mm: 420,
    height_mm: 297,
    named_page: 'auto',
    margin_mm: { top: 10, bottom: 12, inner: 14, outer: 14 },
    head_mm: 0,
    folio_mm: 0,
    gap_mm: 6,
  },
  deck_16_9: {
    id: 'deck_16_9',
    status: 'planned',
    orientation: 'landscape',
    width_mm: 338.67,
    height_mm: 190.5,
    named_page: 'bk-deck',
    margin_mm: { top: 12, bottom: 12, inner: 16, outer: 16 },
    head_mm: 0,
    folio_mm: 6,
    gap_mm: 6,
  },
}

/** Height of the text block of one sheet in millimetres: the paginator's budget before notes. */
export function bodyHeightMm(spec: PrintProfileSpec): number {
  return spec.height_mm - spec.margin_mm.top - spec.margin_mm.bottom - spec.head_mm - spec.folio_mm - 2 * spec.gap_mm
}

/** Width of the text block of one sheet in millimetres. */
export function bodyWidthMm(spec: PrintProfileSpec): number {
  return spec.width_mm - spec.margin_mm.inner - spec.margin_mm.outer
}

export function printProfile(id: PaperProfile): PrintProfileSpec {
  return PRINT_PROFILE_SPECS[id]
}
