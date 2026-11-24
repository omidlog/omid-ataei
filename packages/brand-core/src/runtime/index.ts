export * from './model.js'
export { LAYOUTS, paletteOf, planSocialBatch, scriptDirection } from './plan.js'
export type { Angle, BatchPlan, Layout, Palette, PostPlan } from './plan.js'
export { bidi, escapeXml, fitHeadline, localDigits, logoMarkup, POST_LABELS, renderPost, wrapText } from './render.js'
export type { EmbeddedLogo, RenderedPost } from './render.js'
export { assuranceLayer, bannedRules, coachLayer, copyClaimConflicts, postChecks, setChecks } from './gate.js'
export { loadApprovedLogo, runSocialBatch, writeBatch } from './run.js'
export type { ApprovedLogo, SocialBatchOptions, SocialBatchResult } from './run.js'
export { createDemoBrand, DEMO_BANNER, DEMO_BRAND_SLUG, DEMO_FACTS, DEMO_LOGO_ID, DEMO_LOGO_SVG, DEMO_NOW, demoPack } from './demo.js'
export type { DemoBrand } from './demo.js'
export { assertPackShape, MAX_PACK_BYTES, openOwnerWorkspace, packSourceDrift, readPackFile } from './pack.js'
export { CANVAS_SCALE, DEFAULT_STACKS, fontFamilyValue, SLOT_ROLES, typeSpecOf } from './type.js'
export type { SlotType, TypeSlot, TypeSpec } from './type.js'
export { createOutliner, drawnCodepoints, MAX_FONT_BYTES, readFontFile } from './outline.js'
export type { FontFile, Outliner } from './outline.js'
export {
  HARD_RUNTIME_CHECKS,
  MAX_BATCH_FILE_BYTES,
  packAssetIds,
  PRODUCTION_READINESS_SCHEMA,
  PRODUCTION_READINESS_TOOL,
  productionReadiness,
  readBatchDir,
  RENDERERS,
  REQUIRABLE_ASSETS,
} from './production.js'
export type { AssetVerdict, BatchArtifacts, GateCheck, ProductionInput, ProductionReadiness, RendererSpec, RequirableAsset, RuleOwner } from './production.js'
export { PRODUCTION_CHECK_IDS, PRODUCTION_TEXT, productionText } from './production-i18n.js'
export type { ProductionCheckId, ProductionText, ProductionVerdict } from './production-i18n.js'
export { parseRequiredAssets, runProductionReadinessTool } from './production-agent.js'
export type { ProductionToolInput, ProductionToolRefusal, ProductionToolResult } from './production-agent.js'
