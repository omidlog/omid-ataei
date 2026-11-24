export * from './model.js'
export { asLang, COMPETITIVE_LANGS, DIMENSION_LABELS, fill, GAP_TEXT, HEADINGS, PROHIBITED_TEXT, REVIEW_REASONS } from './i18n.js'
export type { CompetitiveLang } from './i18n.js'
export { buildLandscape, priceComparison, TARGET_MARKET_FACT } from './landscape.js'
export type { CandidateView, CellState, Gap, Landscape, LandscapeOptions, MatrixCell, ObservationView, PriceRow, RefState, SourceClass } from './landscape.js'
export {
  addCandidate,
  assertOwnerProcess,
  classifyCandidate,
  COMPETITIVE_DIRS,
  COMPETITIVE_TOPIC,
  linkEvidence,
  readCandidate,
  readScope,
  resolveEvidence,
  scanCandidates,
  setScope,
  setStatus,
  verifyDomain,
} from './store.js'
export type { AddCandidateInput, CandidateScan, LinkEvidenceInput, ResolvedEvidence } from './store.js'
export { CONTEXT_SCHEMA, getCompetitiveContext, PURPOSE_PROHIBITED, USABLE_CELLS } from './context.js'
export type { CompetitiveContext, ContextCompetitor, ContextObservation, ContextOptions, ContextState, ResearchStep } from './context.js'
export { buildCompetitiveMemo, MEMO_FACTS, MEMO_KINDS, MEMO_PURPOSES, MEMO_SCHEMA } from './memos.js'
export type { Alternative, CompetitiveMemo, FactCitation, MemoBase, MemoKind, MemoOptions, MemoPurpose, PricingRow, UnresolvedItem } from './memos.js'
export { ALTERNATIVES, DEPENDENCIES, MEMO_HEADINGS, MEMO_TITLES, NOT_KNOWN, PROPOSE_EDIT, SEO_NAME_STATUS, WARNINGS } from './memo-i18n.js'
export { importSeoNames, seoNamedCompetitors } from './seo-bridge.js'
export type { SeoImportResult } from './seo-bridge.js'
export { renderMemo } from './render.js'
export {
  buildSharedLandscape,
  matchesQuote,
  RATE_LABELS,
  readSharedLandscape,
  serializeSharedLandscape,
  SHARED_CELL_STATES,
  SHARED_CRITERIA,
  SHARED_LANDSCAPE_DIR,
  SHARED_LANDSCAPE_PATH,
  SHARED_LANDSCAPE_SCHEMA,
  SHARED_LIMITS,
  SHARED_PRICE_STATES,
  shareLandscape,
  SOURCE_CLASSES,
  validSharedLandscape,
} from './share.js'
export type { RateLabel, SharedCell, SharedCellState, SharedCompetitor, SharedCriterion, SharedLandscape, SharedLandscapeRead, SharedPrice, SharedPriceState, SharedSource } from './share.js'
export type { SharedAxis, SharedPlacement, SharedPositioning } from './share.js'
export {
  addPosition,
  AXES_RECORD_PATH,
  AXIS_KEYS,
  OWN_SUBJECT,
  PLACEMENT_STATES,
  placementOf,
  POSITION_BANDS,
  POSITION_STALE_DAYS,
  positioningLandscape,
  POSITIONING_LANGS,
  POSITIONING_LIMITS,
  POSITIONS_RECORD_PATH,
  readAxes,
  readPositions,
  removePosition,
  setAxes,
  validateAxes,
} from './positioning.js'
export type { AddPositionInput, AxesRecord, AxisDefinition, AxisKey, LocalizedLabel, Placement, PlacementSource, PlacementState, PositionBand, PositionRecord, PositionView } from './positioning.js'
