import type { BusinessModelCanvasBlock, VisualBlock, VisualCatalog, VisualDocument, VisualLang } from '@brand-os/brand-core/visual'
import type { SafeHtml } from './html.js'
import { canvasView, citationTable } from './visual.js'
import { colorPaletteView, identitySources, logoConstructionView, typographySpecimenView, type IdentityContext } from './visual-identity.js'
import { competitorMatrixView, priceStripView } from './visual-competitors.js'
import { positioningMapView } from './visual-positioning.js'
import { mascotAtlasView, mascotEvolutionView } from './visual-mascot.js'
import { sourceNotesView, swotView, towsView, valuePropositionView } from './visual-strategy.js'
import { journeyView, okrTreeView, sostacView } from './visual-plan.js'

/**
 * Renderer registry (Visual Blueprint V1.1): one renderer per block type. The map is typed over every
 * `VisualBlock['type']`, so adding a block type without a renderer fails the type check instead of rendering
 * nothing. Page and print compositions call `renderBlock`; they never switch on block types themselves.
 */
export interface BlockContext {
  cat: VisualCatalog
  lang: VisualLang
  mode: 'screen' | 'print'
  doc: VisualDocument
  /** Prefix for element ids, so two compositions could share a page. */
  idPrefix: string
  /** Owner-only prompts (next questions); the public edition leaves them out. */
  showNext: boolean
  /** URL of an approved asset preview by key, or null when the composition cannot serve files (golden examples). */
  assetUrl: (key: string) => string | null
  /** Print engine (V1.2): turns a plate's source line into a numbered note (see `IdentityContext.note`). */
  note?: IdentityContext['note']
  /** Full book (V4.2): plate numbers in the whole book (see `IdentityContext.plateNum`). */
  plateNum?: IdentityContext['plateNum']
}

type RendererMap = { [K in VisualBlock['type']]: (block: Extract<VisualBlock, { type: K }>, ctx: BlockContext) => SafeHtml }

function canvasOf(doc: VisualDocument): BusinessModelCanvasBlock | null {
  return doc.blocks.find((block): block is BusinessModelCanvasBlock => block.type === 'business_model_canvas') ?? null
}

const RENDERERS: RendererMap = {
  business_model_canvas: (block, ctx) => canvasView(ctx.cat, block, { lang: ctx.lang, mode: ctx.mode, showNext: ctx.showNext, idPrefix: ctx.idPrefix }),
  citation_list: (block, ctx) => {
    if (ctx.doc.document_kind === 'visual_identity') return identitySources(block, ctx)
    const canvas = canvasOf(ctx.doc)
    if (!canvas) throw new Error('A citation list needs the block it cites.')
    return citationTable(ctx.cat, block, canvas, ctx.lang, ctx.mode === 'print')
  },
  color_palette: colorPaletteView,
  typography_specimen: typographySpecimenView,
  logo_construction: logoConstructionView,
  competitor_matrix: competitorMatrixView,
  price_strip: priceStripView,
  positioning_map: positioningMapView,
  mascot_atlas: mascotAtlasView,
  mascot_evolution: mascotEvolutionView,
  swot: swotView,
  tows_matrix: towsView,
  value_proposition_canvas: valuePropositionView,
  source_notes: sourceNotesView,
  journey_swimlane: journeyView,
  sostac_overview: sostacView,
  okr_tree: okrTreeView,
}

export function renderBlock(block: VisualBlock, ctx: BlockContext): SafeHtml {
  const render = RENDERERS[block.type] as (block: VisualBlock, ctx: BlockContext) => SafeHtml
  return render(block, ctx)
}

export function rendererTypes(): string[] {
  return Object.keys(RENDERERS)
}
