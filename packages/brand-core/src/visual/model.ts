/**
 * Semantic visual layer (Visual Blueprint P0, first slice).
 *
 * A `VisualDocument` is a versioned, renderer-neutral view model built from the same truth path as the document
 * model (`documents/model.ts` `itemFor`): approved facts, owner drafts, missing answers and withheld restricted
 * values. It is metadata and references, never a second fact store. The Studio page and the static print/PDF view
 * render the same document, so the screen and the export cannot disagree.
 *
 * The document is language-neutral. Values stay exactly as approved (never translated); every label, state name
 * and instruction comes from the renderer's en/fa/tr catalog (`visual/i18n.ts`).
 */

import type { JourneySwimlaneBlock, OkrTreeBlock, PlanDocumentKind, SostacBlock } from './model-plan.js'

export const VISUAL_SCHEMA = 'brand-os.visual-document/1'

/** Every state is shown as text plus an icon plus a colour, never colour alone. */
export const DATA_STATES = ['approved', 'assumption', 'recommendation', 'missing', 'withheld', 'stale', 'conflicting', 'not_applicable'] as const
export type DataState = (typeof DATA_STATES)[number]

/** What a page may say about a framework or standard. Only `informed_by` is used until a reviewed mapping exists. */
export const PERMITTED_CLAIMS = ['informed_by', 'aligned_with', 'verified_against', 'externally_certified', 'original_professional_template'] as const
export type PermittedClaim = (typeof PERMITTED_CLAIMS)[number]

export const PRINT_PROFILES = ['web_interactive', 'book_a4_portrait', 'canvas_a3_landscape', 'deck_16_9'] as const
export type PrintProfile = (typeof PRINT_PROFILES)[number]

export type VisualAudience = 'internal' | 'public'

/**
 * Registry metadata for one framework. It describes the method and what may be claimed about it; it holds no
 * brand facts. `verified_on` is the date a person last checked the source page, or null when nobody has.
 */
export interface FrameworkRef {
  framework_id: string
  title: string
  kind: 'formal_standard' | 'professional_framework' | 'editorial_template'
  authority: string
  edition: string
  source_url: string
  license_status: string
  permitted_claim: PermittedClaim
  verified_on: string | null
  /** Who checked the source on `verified_on` (a name or role), or `pending` when nobody has (V5.1). */
  reviewer: string
  /** Plain statement of what this rendering is and is not, printed next to the visual. */
  usage_note: string
}

/** One value inside a block: an approved fact, an owner draft, or a named gap. */
export interface VisualEntry {
  /** The question id that owns the field. */
  id: string
  label: string
  state: DataState
  /** Null when missing or withheld. Never filled in. */
  value: string | null
  sources: string[]
  version: number | null
  approved_at: string | null
  review_due: string | null
  /** Why the entry is in this state (owner said unknown, restricted, draft …), in English from the core model. */
  note: string | null
  /** For `missing` entries: why there is no value, so the renderer never says "not answered" about a hidden draft. */
  missing_reason: MissingReason | null
  /**
   * Visual V3.1: a list question (repeating_entity) with a visible value carries its items here, in the owner's
   * order; `value` is then the item names joined, for tables. Absent for every other entry.
   */
  items?: VisualEntityItem[]
  /** Visual V3.1: a list question whose stored value is not a list. `value` is the text as written; flagged. */
  legacy?: true
}

/** One item of a list question, as drawn on the canvas. Choice values are option keys; renderers label them. */
export interface VisualEntityItem {
  id: string
  name: string
  detail: string | null
  /** Choice fields that are set, e.g. `{ field: 'priority', value: 'primary' }`. */
  tags: Array<{ field: string; value: string }>
  links: string[]
  /**
   * Visual V3.2: source references the item cites, in the owner's order (lists whose spec allows them). In the
   * public edition only references shown in that edition remain. Renderers number them through a `source_notes` block.
   */
  sources?: string[]
}

/**
 * A link between two items on the canvas (activity → segment, cost → resource …). `resolved` when the target item
 * is visible in this edition; `unresolved` when it is not (removed, not answered, or not published), so the
 * renderer shows the reference without inventing a target.
 */
export interface CanvasLink {
  from: string
  from_zone: BmcZoneId
  to: string
  to_zone: BmcZoneId | null
  state: 'resolved' | 'unresolved'
}

export const MISSING_REASONS = ['unanswered', 'unknown', 'skipped', 'deprecated', 'not_published'] as const
export type MissingReason = (typeof MISSING_REASONS)[number]

export interface NextQuestion {
  id: string
  /** `existing`: a question in the bank that is not answered or not approved. `proposed`: not in the bank yet. */
  kind: 'existing' | 'proposed'
}

/** Fields every block carries, whatever it draws. */
export interface BlockBase {
  block_id: string
  framework_id: string | null
  /** Aggregate state of the block's entries. */
  data_state: 'complete' | 'partial' | 'missing'
  sources: string[]
  /** Latest approval date among the approved entries, or null. */
  as_of: string | null
  computed_from: string[]
  visibility: VisualAudience
  renderer_variant: string
  layout_constraints: { preserve_topology: boolean; min_print_pt: number; print_profile: PrintProfile }
}

export const BMC_ZONE_IDS = [
  'key_partners',
  'key_activities',
  'key_resources',
  'value_propositions',
  'customer_relationships',
  'channels',
  'customer_segments',
  'cost_structure',
  'revenue_streams',
] as const
export type BmcZoneId = (typeof BMC_ZONE_IDS)[number]

export interface BmcZone {
  zone_id: BmcZoneId
  /** 1–9 in the canonical reading order. */
  order: number
  state: 'complete' | 'partial' | 'missing' | 'withheld' | 'not_applicable'
  entries: VisualEntry[]
  /** What the owner can answer next to fill this zone. Never a guessed value. */
  next_questions: NextQuestion[]
  /** Existing questions that may inform the zone but do not answer it. Ids only; values are not copied. */
  related: string[]
}

export interface BusinessModelCanvasBlock extends BlockBase {
  type: 'business_model_canvas'
  zones: BmcZone[]
  /**
   * Links between zones. Until V3.1 every zone was prose (`single_prose_answers`). With list questions the canvas
   * reads the links the owner recorded on items; with no visible list items yet the reason is `no_list_items`.
   * Offers, channels and revenue streams are still prose, so they are never linked; nothing is inferred.
   */
  relationships: { modeled: false; reason: 'single_prose_answers' | 'no_list_items' } | { modeled: true; links: CanvasLink[] }
}

export interface CitationListBlock extends BlockBase {
  type: 'citation_list'
  items: Array<{ id: string; label: string; state: DataState; version: number | null; approved_at: string | null }>
}

/** One measured foreground/background pair. Thresholds are compared with the exact ratio, never a rounded one. */
export interface ContrastPair {
  foreground: string
  background: string
  /** WCAG 2 contrast ratio rounded down to two decimals (display only). */
  ratio: number
  /** ≥ 4.5 (normal text), ≥ 3 (large text), ≥ 7 (enhanced). A measurement of two colours, not an audit. */
  aa_normal: boolean
  aa_large: boolean
  aaa_normal: boolean
}

/**
 * Brand Book "Visual identity": the colour palette. Drawn only from the approved `brand.color.roles` fact; a draft,
 * a withheld value or a gap leaves `colors` empty and the renderer shows the designed "awaiting" page.
 */
export interface ColorPaletteBlock extends BlockBase {
  type: 'color_palette'
  /** The fact the palette is drawn from. `value` is null unless approved (or approved and review overdue). */
  source: VisualEntry
  colors: Array<{ role: string; hex: string; rgb: [number, number, number] }>
  /** Combinations the roles declare by name (`onPrimary` on `primary`), measured. */
  combinations: ContrastPair[]
  /** Every ordered pair, for the contrast grid; null when there are too many colours to draw legibly. */
  grid: { roles: string[]; ratios: number[][] } | null
}

export interface TypeRole {
  role: string
  family: string
  fallback: string[]
  size_px: number | null
  line_height: number | null
}

/** Brand Book "Visual identity": type roles from the approved `brand.type.scale` fact, set in en/fa/tr specimens. */
export interface TypographySpecimenBlock extends BlockBase {
  type: 'typography_specimen'
  source: VisualEntry
  roles: TypeRole[]
  /** Languages the specimen is set in (the brand's supported locales among en/fa/tr). */
  scripts: Array<'en' | 'fa' | 'tr'>
}

/**
 * The approved master logo file: an approved, checksummed, non-example manifest asset tagged `logo`, resolved in this
 * order: named in the approved `brand.logo.masters` fact, tagged `master`, or the only approved previewable logo.
 */
export interface LogoMaster {
  asset_id: string
  name: string
  version: string | null
  /** Studio preview key (content hash). The file itself is served only by the existing asset route. */
  preview_key: string
  mime: string
  /** Intrinsic size when it could be read (SVG viewBox/width/height, PNG header); null otherwise. */
  width: number | null
  height: number | null
  /** How the master was found: named in `brand.logo.masters`, tagged `master`, or the only approved logo. */
  resolved_by: 'reference' | 'tag' | 'sole_logo'
  /** Internal edition only (always empty in public): the file still carries a `draft` tag, or it is not published. */
  badges: Array<'draft_tag' | 'internal_only'>
}

export interface LogoConstructionBlock extends BlockBase {
  type: 'logo_construction'
  /** `brand.logo.min_size` (structured logo_spec). Value null unless approved. */
  source: VisualEntry
  spec: { min_size_px: number; clear_space: { value: number; unit: 'px' | 'x' }; min_print_mm: number | null } | null
  master: LogoMaster | null
  /**
   * Why there is no master: none registered, only template examples, approved files that cannot be previewed, or
   * several approved logos and none named in `brand.logo.masters` (the builder never guesses between them).
   */
  master_state: 'approved' | 'missing' | 'example_only' | 'not_previewable' | 'ambiguous'
}

export type VisualBlock =
  | BusinessModelCanvasBlock
  | CitationListBlock
  | ColorPaletteBlock
  | TypographySpecimenBlock
  | LogoConstructionBlock
  | CompetitorMatrixBlock
  | PriceStripBlock
  | MascotAtlasBlock
  | MascotEvolutionBlock
  | PositioningMapBlock
  | SwotBlock
  | TowsMatrixBlock
  | ValuePropositionCanvasBlock
  | SourceNotesBlock
  | JourneySwimlaneBlock
  | SostacBlock
  | OkrTreeBlock

export interface VisualDocument {
  schema: typeof VISUAL_SCHEMA
  schema_version: 1
  document_kind: 'business_model_canvas' | 'visual_identity' | 'competitor_comparison' | 'mascot_atlas' | 'swot_tows' | 'value_proposition' | PlanDocumentKind
  brand_id: string
  brand_name: string
  audience: VisualAudience
  /** True only for golden examples built from fixtures. Renderers must stamp ILLUSTRATIVE / MOCK DATA. */
  illustrative: boolean
  origin: 'brand_repository' | 'illustrative_fixture'
  /** Latest approval date among cited facts. Not a render time, so the same commit renders the same document. */
  as_of: string | null
  classification: 'internal' | 'public'
  print_profile: PrintProfile
  status_summary: Record<DataState, number>
  framework_refs: FrameworkRef[]
  blocks: VisualBlock[]
}

export function emptyStatusSummary(): Record<DataState, number> {
  return Object.fromEntries(DATA_STATES.map((state) => [state, 0])) as Record<DataState, number>
}

// ---- Visual V2.2: competitor comparison matrix and price strip -------------------------------------------

/**
 * What a comparison cell may say. `present` and `unverified` come from a cited, current observation; `absent` only
 * when a source states it (the competitor index records no absence today, so the share path never emits it and
 * silence is never read as absence); `unknown` stays unknown.
 */
export const COMPARISON_STATES = ['present', 'unverified', 'historical', 'conflicting', 'needs_review', 'absent', 'unknown'] as const
export type ComparisonState = (typeof COMPARISON_STATES)[number]

/** One numbered source footnote: who is speaking, the public host for web sources, and when it was read. */
export interface ComparisonSource {
  n: number
  source_class: string | null
  host: string | null
  observed_on: string
}

export interface ComparisonCell {
  criterion: string
  state: ComparisonState
  /** Short recorder labels (competitors) or the approved value (own brand). Never a quote. */
  labels: string[]
  /** Approved colour swatches for the own brand's visual identity cell; empty otherwise. */
  swatches: string[]
  footnotes: number[]
  /** Own brand only: the approved fact the cell is drawn from (value null unless approved). */
  own: VisualEntry | null
}

export interface ComparisonRow {
  row_id: string
  kind: 'own_brand' | 'competitor'
  name: string
  relationship: string[]
  markets: string[]
  official_domain: string | null
  needs_refresh: boolean
  cells: ComparisonCell[]
}

export interface CompetitorMatrixBlock extends BlockBase {
  type: 'competitor_matrix'
  criteria: string[]
  rows: ComparisonRow[]
  footnotes: ComparisonSource[]
  /** Whether the owner shared a landscape on this commit, and whether Studio could show it. */
  share_state: 'not_shared' | 'shared' | 'withheld'
  withheld_reason: string | null
  not_shared: { candidates: number; disputed: number; archived: number } | null
  withheld_text: number
}

export interface PriceStripRow {
  competitor_id: string
  competitor_name: string
  offer_name: string
  amount: number
  currency: string
  market: string
  billing_period: string
  billing_commitment: string
  tax_inclusion: string
  promotion: string
  feature_scope: string | null
  rate_label: string
  state: string
  footnote: number
}

/** Published prices, grouped by currency in the order recorded. Never ranked, never converted. */
export interface PriceStripBlock extends BlockBase {
  type: 'price_strip'
  groups: Array<{ currency: string; rows: PriceStripRow[] }>
  /** Competitors with no shared public price: unknown stays unknown. */
  unpriced: string[]
  ranked: false
  currency_conversion: 'none'
}

// ---- Visual V2.3: positioning map ----------------------------------------------------------------------

/** Where a subject sits on one axis. Only evidenced, stale and conflicting placements are drawn. */
export const POSITIONING_STATES = ['evidenced', 'stale', 'conflicting', 'needs_review', 'unknown'] as const
export type PositioningState = (typeof POSITIONING_STATES)[number]

/** An owner-written label: English always, Persian and Turkish when the owner gave them. Never machine-translated. */
export interface OwnerLabel {
  en: string
  fa: string | null
  tr: string | null
}

export interface PositioningAxis {
  label: OwnerLabel
  low: OwnerLabel
  high: OwnerLabel
}

export interface PositioningPlacement {
  state: PositioningState
  /** Qualitative bands as recorded, low to high: one, or the disagreeing range. Never a number. */
  bands: string[]
}

export interface PositioningPoint {
  subject_id: string
  kind: 'own_brand' | 'competitor'
  name: string
  /** Key number for plotted competitors (1…n); null for the own brand and for subjects not plotted. */
  n: number | null
  x: PositioningPlacement
  y: PositioningPlacement
  footnotes: number[]
}

/**
 * The positioning map: the owner's two axes, subjects plotted only where both axes have a dated source, and a margin
 * list of everyone else. Stale and conflicting placements are marked; a conflict is drawn as a range, never resolved.
 */
export interface PositioningMapBlock extends BlockBase {
  type: 'positioning_map'
  /** Null until the owner chose axes and shared them. */
  axes: { x: PositioningAxis; y: PositioningAxis } | null
  bands: string[]
  stale_after_days: number | null
  points: PositioningPoint[]
  unplotted: PositioningPoint[]
  share_state: 'not_shared' | 'shared' | 'withheld'
}

// ---- Visual V3.4: mascot atlas and six-stage evolution sheet ------------------------------------------------

/**
 * One piece of mascot artwork the atlas may draw: an artwork variant from the catalog whose lifecycle is approved
 * (public: published), backed by an approved, checksummed, previewable, non-example manifest asset. Nothing else is
 * ever drawn; the file itself is served only by the existing asset route.
 */
export interface MascotArtworkView {
  artwork_id: string
  asset_id: string
  /** Manifest name of the asset (shown as recorded, never translated). */
  name: string
  version: string | null
  /** Stage id from `stages.yaml`, or `any`. */
  stage: string
  angle: string | null
  preview_key: string
  mime: string
  /** Internal edition only (always empty in public): the file still carries a `draft` tag, or it is not published. */
  badges: Array<'draft_tag' | 'internal_only'>
}

/**
 * Why a slot shows no artwork. `in_review`: artwork exists but is not approved yet (internal edition only).
 * `not_previewable`: approved but the file cannot be previewed. `example_only`: only template placeholders.
 * `not_drawn`: no artwork at all. `not_published`: public edition, nothing published for this slot.
 */
export const MASCOT_GAP_REASONS = ['in_review', 'not_previewable', 'example_only', 'not_drawn', 'not_published'] as const
export type MascotGapReason = (typeof MASCOT_GAP_REASONS)[number]

export const MASCOT_CATEGORIES = ['emotion', 'action', 'ui', 'learning', 'prop', 'seasonal', 'other'] as const
export type MascotCategory = (typeof MASCOT_CATEGORIES)[number]

/** One catalog state (expression, pose, UI state …). Notes are carried only when its artwork is drawn. */
export interface MascotAtlasEntry {
  state_id: string
  category: MascotCategory
  name: string
  mvp: boolean
  /** The primary approved artwork (front angle first, then artwork id), or null. */
  artwork: MascotArtworkView | null
  /** Further approved variants of this state (other angles or stages), counted, not drawn. */
  variants: number
  gap: MascotGapReason | null
  /** Recorded usage line, "do" and "don't" notes of an approved state; empty unless `artwork` is set. */
  usage: string | null
  do: string[]
  dont: string[]
}

export interface MascotAtlasBlock extends BlockBase {
  type: 'mascot_atlas'
  /** `modules.mascot.enabled`. When false the page says the module is off and draws nothing. */
  module_enabled: boolean
  entries: MascotAtlasEntry[]
  counts: { states: number; drawn: number; in_review: number; awaiting: number }
}

/** One slot of the evolution sheet, in stage order. Slots past the recorded stages (up to six) are placeholders. */
export interface MascotStageSlot {
  order: number
  stage_id: string | null
  /** Recorded stage name; null in the public edition unless the definition is approved, and for placeholders. */
  name: string | null
  definition: 'approved' | 'draft' | 'example' | 'not_defined'
  /** Recorded summary of an approved definition only. */
  summary: string | null
  artwork: MascotArtworkView | null
  gap: MascotGapReason | null
}

export interface MascotEvolutionBlock extends BlockBase {
  type: 'mascot_evolution'
  module_enabled: boolean
  /** At least six slots (the sheet's standard length); more when the brand records more stages. */
  slots: MascotStageSlot[]
  recorded: number
  /** Any recorded stage still says `configuration: example` (the template's example configuration). */
  example_configuration: boolean
}

// ---- Visual V3.2: SWOT / TOWS and the Value Proposition Canvas --------------------------------------------------

/** A list area (SWOT quadrant, canvas zone) drawn from one list question. Same states as a canvas zone. */
export interface ListArea<Id extends string> {
  area_id: Id
  /** 1… in the framework's canonical reading order. */
  order: number
  state: BmcZone['state']
  /** The list answer; null when this template has no such question (an older bank). */
  entry: VisualEntry | null
  next_questions: NextQuestion[]
  /** Existing prose answers that inform the area but do not answer it. Ids only; values are not copied. */
  related: string[]
}

/** A link from one visible item to another item, resolved against what this edition shows. */
export interface ItemLink {
  from: string
  to: string
  state: 'resolved' | 'unresolved'
}

export const SWOT_QUADRANTS = ['strengths', 'weaknesses', 'opportunities', 'threats'] as const
export type SwotQuadrantId = (typeof SWOT_QUADRANTS)[number]

/** SWOT: internal/external × helpful/harmful, in the standard 2×2 order (S W / O T). */
export interface SwotBlock extends BlockBase {
  type: 'swot'
  quadrants: Array<ListArea<SwotQuadrantId>>
}

export const TOWS_TYPES = ['so', 'st', 'wo', 'wt'] as const
export type TowsType = (typeof TOWS_TYPES)[number]

/**
 * TOWS matrix: strategies from `business.swot.tows`, placed in the cell their recorded type names (SO, ST, WO, WT).
 * A strategy without a type is listed as unplaced, never guessed into a cell. Links read as SWOT item names.
 */
export interface TowsMatrixBlock extends BlockBase {
  type: 'tows_matrix'
  area: ListArea<'tows'>
  cells: Record<TowsType, string[]>
  unplaced: string[]
  links: ItemLink[]
  /** Item names of the SWOT lists visible in this edition, by id, so links read as names. */
  names: Record<string, string>
}

export const VALUE_FIT_ZONES = ['products_services', 'gain_creators', 'pain_relievers', 'customer_jobs', 'gains', 'pains'] as const
export type ValueFitZoneId = (typeof VALUE_FIT_ZONES)[number]

/** One pain or gain and the visible value-map items linked to it. Nothing is matched by wording. */
export interface FitRow {
  id: string
  addressed_by: string[]
}

/**
 * Value Proposition Canvas (Strategyzer topology): the value map (square: products and services, gain creators,
 * pain relievers) beside the customer profile (circle: gains, pains, customer jobs). Fit is read only from links the
 * owner recorded (a reliever → a pain, a creator → a gain), as counts, never a score.
 */
export interface ValuePropositionCanvasBlock extends BlockBase {
  type: 'value_proposition_canvas'
  zones: Array<ListArea<ValueFitZoneId>>
  fit: { pains: FitRow[]; gains: FitRow[] }
  links: ItemLink[]
  /** Names of visible items (all six lists and customer segments), by id, so links read as names. */
  names: Record<string, string>
}

export const SOURCE_NOTE_STATUSES = ['approved', 'shared', 'verified', 'recorded', 'not_available'] as const
export type SourceNoteStatus = (typeof SOURCE_NOTE_STATUSES)[number]

/**
 * One numbered source an item cites. `fact`: an approved answer (label only, never its value). `knowledge`: a
 * shared knowledge note (title only; an idea, not a fact). `evidence`: an evidence record (status only). `web`: a
 * public https page (host; `url` without query or fragment). `not_available`: not visible in this edition.
 */
export interface SourceNote {
  n: number
  kind: 'fact' | 'knowledge' | 'evidence' | 'web'
  ref: string
  label: string | null
  host: string | null
  url: string | null
  status: SourceNoteStatus
}

export interface SourceNotesBlock extends BlockBase {
  type: 'source_notes'
  notes: SourceNote[]
  /** Public edition: item sources left out because they are internal (knowledge notes, evidence, unpublished answers). */
  hidden: number
}
// ---- Visual V3.3: customer journey swimlane, SOSTAC overview, OKR tree (types in model-plan.ts) --------------
export * from './model-plan.js'
