import { CONTENT_SOURCES } from '../content-bridge/sources.js'
import type { ContentSourceRole } from '../strategy/model.js'
import type { SectionName, TaskType } from './model.js'

/**
 * Which approved facts each pack key may come from, and which keys each task selects.
 *
 * The ids are not a new field map: where the Content Bridge already owns a role (voice, claims, audience, messaging,
 * pillars, channels, offers, CTA, languages, objective) this table reads `CONTENT_SOURCES` instead of restating it.
 * Only roles content has no need for (identity, sector, logo, colour, type, UI, motion, mascot, person) are listed
 * here. Every id is an existing FieldQuestion id; `tests/task-context.test.ts` fails if one leaves the question bank.
 *
 * A task selects a bounded subset of keys, so a 200-field brand does not become a context dump for one icon.
 */

export interface ModuleFlags {
  personal: boolean
  mascot: boolean
}

export interface TaskField {
  key: string
  section: SectionName
  /** Preference order. Every approved fact is listed, unless `first` is set. */
  fact_ids: string[]
  /** `brand_name`: a public name override replaces the trade name instead of appearing beside it. */
  first?: true
}

/** The ids the Content Bridge already assigns to a role, personal ids only when the personal module is on. */
function role(name: ContentSourceRole, flags: ModuleFlags): string[] {
  return CONTENT_SOURCES.filter((source) => source.role === name && (!source.personal || flags.personal)).map((source) => source.id)
}

function personalOnly(ids: string[], flags: ModuleFlags): string[] {
  return flags.personal ? ids : []
}

function mascotOnly(ids: string[], flags: ModuleFlags): string[] {
  return flags.mascot ? ids : []
}

/** Every field this engine knows, for the current module flags. */
export function taskFields(flags: ModuleFlags): TaskField[] {
  const fields: TaskField[] = [
    { key: 'brand_name', section: 'identity', fact_ids: ['brand.identity.public_name_override', 'business.identity.trade_name'], first: true },
    { key: 'sector', section: 'identity', fact_ids: ['business.identity.sector'] },
    { key: 'purpose', section: 'identity', fact_ids: ['brand.strategy.purpose'] },
    { key: 'values', section: 'identity', fact_ids: ['brand.strategy.values'] },
    // The `messaging` role, split into the two things a brief needs separately.
    { key: 'positioning', section: 'identity', fact_ids: ['brand.strategy.promise', 'brand.strategy.differentiation', ...personalOnly(['personal.positioning.known_for'], flags)] },
    { key: 'value_proposition', section: 'identity', fact_ids: ['business.offer.value_proposition', 'brand.verbal.tagline'] },
    { key: 'audience', section: 'identity', fact_ids: role('audience', flags) },
    { key: 'offer', section: 'identity', fact_ids: role('offers', flags) },
    { key: 'objective', section: 'identity', fact_ids: role('objective', flags) },
    { key: 'voice', section: 'identity', fact_ids: role('voice', flags) },
    { key: 'person', section: 'identity', fact_ids: personalOnly(['personal.identity.name_forms', 'personal.identity.headline'], flags) },
    { key: 'pillars', section: 'strategy', fact_ids: role('pillars', flags) },
    { key: 'channels', section: 'strategy', fact_ids: role('channels', flags) },
    { key: 'cta', section: 'strategy', fact_ids: role('cta', flags) },
    { key: 'color_roles', section: 'creative', fact_ids: ['brand.color.roles', 'brand.color.semantics', 'brand.color.themes'] },
    { key: 'type_rules', section: 'creative', fact_ids: ['brand.type.scale', 'brand.type.intent'] },
    { key: 'rtl_rules', section: 'creative', fact_ids: ['brand.type.rtl'] },
    { key: 'logo_rules', section: 'creative', fact_ids: ['brand.logo.masters', 'brand.logo.variants', 'brand.logo.clear_space', 'brand.logo.min_size', 'brand.logo.misuse'] },
    { key: 'mascot_rules', section: 'creative', fact_ids: mascotOnly(['brand.mascot.role', 'brand.mascot.personality', 'brand.mascot.forbidden'], flags) },
    { key: 'motion_rules', section: 'creative', fact_ids: ['brand.motion.principles', 'brand.motion.duration', 'brand.motion.reduced'] },
    { key: 'ui_components', section: 'production', fact_ids: ['brand.ui.components'] },
    { key: 'ui_states', section: 'production', fact_ids: ['brand.ui.states'] },
    { key: 'ui_platforms', section: 'production', fact_ids: ['brand.ui.platforms'] },
    { key: 'social_exports', section: 'production', fact_ids: ['brand.social.exports'] },
    { key: 'social_safe_area', section: 'production', fact_ids: ['brand.social.safe'] },
    { key: 'languages', section: 'production', fact_ids: role('languages', flags) },
    { key: 'banned_claims', section: 'production', fact_ids: role('claims', flags) },
  ]
  return fields.filter((field) => field.fact_ids.length > 0)
}

/** Asset roles, read from the manifest id and tags. `other` assets are never offered as a logo or a portrait. */
export const ASSET_ROLES = ['logo', 'icon', 'mascot', 'portrait', 'other'] as const
export type AssetRole = (typeof ASSET_ROLES)[number]

/** One requirement for readiness: satisfied when any of its keys resolved to an approved fact. */
export interface Requirement {
  id: string
  any_of: string[]
  blocking?: true
}

export interface TaskRecipe {
  /** Pack keys this task selects, in order. */
  keys: string[]
  /** Readiness requirements. `ready` needs every one. */
  requires: Requirement[]
  /** Asset roles worth listing for this task. */
  assets: AssetRole[]
  /** Hash-approved design tokens are part of the brief. */
  tokens: boolean
  /** Approved mascot artwork refs (mascot module only). */
  mascot_artwork: boolean
  /** The Strategy Feed kind this task would use, if the caller's token covers it. */
  strategy: 'content' | 'paid_media' | 'seo' | null
  /** Creative-memory surface, used only when the caller passes a scope_id and holds creative-read. */
  surface: 'post' | 'reel' | 'carousel' | 'story' | 'logo' | null
  /** The task asks for a batch of deliverables, so the on-demand rule applies. */
  batch: boolean
  requires_module?: 'personal'
}

const IDENTITY_CORE = ['brand_name', 'sector', 'purpose', 'positioning', 'value_proposition', 'audience']

/**
 * The one blocking requirement for a company task: the caller must be able to read something that identifies this
 * brand. A profile that cannot read the business modules still has the purpose and the positioning, so a design token
 * is not blocked for lacking the trade name — but a pack that identifies no brand at all is `blocked`, never a draft.
 */
const IDENTITY_ANCHOR: Requirement[] = [{ id: 'identity_anchor', any_of: ['brand_name', 'purpose', 'positioning'], blocking: true }]

export const TASK_RECIPES: Record<TaskType, TaskRecipe> = {
  visual_design: {
    keys: [...IDENTITY_CORE, 'voice', 'offer', 'banned_claims', 'languages', 'color_roles', 'type_rules', 'rtl_rules', 'logo_rules', 'mascot_rules', 'motion_rules', 'social_exports', 'social_safe_area'],
    requires: [
      ...IDENTITY_ANCHOR,
      { id: 'audience', any_of: ['audience'] },
      { id: 'voice', any_of: ['voice'] },
      { id: 'visual_language', any_of: ['color_roles', 'type_rules', 'tokens'] },
      { id: 'logo', any_of: ['logo_rules', 'assets.logo'] },
    ],
    assets: ['logo', 'icon', 'mascot'],
    tokens: true,
    mascot_artwork: true,
    strategy: null,
    surface: 'post',
    batch: false,
  },
  social_batch: {
    keys: [...IDENTITY_CORE, 'voice', 'offer', 'objective', 'pillars', 'channels', 'cta', 'banned_claims', 'languages', 'color_roles', 'type_rules', 'logo_rules', 'mascot_rules', 'social_exports', 'social_safe_area'],
    requires: [
      ...IDENTITY_ANCHOR,
      { id: 'audience', any_of: ['audience'] },
      { id: 'voice', any_of: ['voice'] },
      { id: 'messaging', any_of: ['positioning', 'value_proposition'] },
      { id: 'claims_policy', any_of: ['banned_claims'] },
      { id: 'content_strategy', any_of: ['strategy.content'] },
    ],
    assets: ['logo', 'icon', 'mascot'],
    tokens: true,
    mascot_artwork: true,
    strategy: 'content',
    surface: 'post',
    batch: true,
  },
  website_design: {
    keys: [...IDENTITY_CORE, 'values', 'voice', 'offer', 'objective', 'cta', 'channels', 'banned_claims', 'languages', 'color_roles', 'type_rules', 'rtl_rules', 'logo_rules', 'ui_components', 'ui_states', 'ui_platforms'],
    requires: [
      ...IDENTITY_ANCHOR,
      { id: 'audience', any_of: ['audience'] },
      { id: 'offer', any_of: ['value_proposition', 'offer'] },
      { id: 'objective', any_of: ['objective'] },
      { id: 'conversion_action', any_of: ['cta'] },
      { id: 'visual_language', any_of: ['color_roles', 'type_rules', 'tokens'] },
    ],
    assets: ['logo', 'icon'],
    tokens: true,
    mascot_artwork: false,
    strategy: 'seo',
    surface: null,
    batch: false,
  },
  product_ui: {
    keys: ['brand_name', 'sector', 'audience', 'voice', 'color_roles', 'type_rules', 'rtl_rules', 'logo_rules', 'mascot_rules', 'motion_rules', 'ui_components', 'ui_states', 'ui_platforms'],
    requires: [
      ...IDENTITY_ANCHOR,
      { id: 'audience', any_of: ['audience'] },
      { id: 'components', any_of: ['ui_components'] },
      { id: 'states', any_of: ['ui_states'] },
      { id: 'visual_language', any_of: ['color_roles', 'type_rules', 'tokens'] },
    ],
    assets: ['logo', 'icon', 'mascot'],
    tokens: true,
    mascot_artwork: true,
    strategy: null,
    surface: null,
    batch: false,
  },
  paid_campaign_brief: {
    keys: [...IDENTITY_CORE, 'offer', 'objective', 'channels', 'cta', 'banned_claims', 'languages', 'color_roles', 'type_rules', 'logo_rules', 'social_exports'],
    requires: [
      ...IDENTITY_ANCHOR,
      { id: 'audience', any_of: ['audience'] },
      { id: 'messaging', any_of: ['value_proposition', 'positioning'] },
      { id: 'objective', any_of: ['objective'] },
      { id: 'claims_policy', any_of: ['banned_claims'] },
      { id: 'paid_strategy', any_of: ['strategy.paid_media'] },
    ],
    assets: ['logo', 'icon'],
    tokens: true,
    mascot_artwork: false,
    strategy: 'paid_media',
    surface: null,
    batch: true,
  },
  brand_identity: {
    keys: [...IDENTITY_CORE, 'values', 'voice', 'color_roles', 'type_rules', 'rtl_rules', 'logo_rules', 'mascot_rules', 'motion_rules'],
    requires: [
      ...IDENTITY_ANCHOR,
      { id: 'purpose', any_of: ['purpose'] },
      { id: 'values', any_of: ['values'] },
      { id: 'positioning', any_of: ['positioning', 'value_proposition'] },
      { id: 'audience', any_of: ['audience'] },
    ],
    assets: ['logo', 'icon', 'mascot'],
    tokens: true,
    mascot_artwork: true,
    strategy: null,
    surface: 'logo',
    batch: false,
  },
  personal_content: {
    keys: ['person', 'audience', 'voice', 'positioning', 'offer', 'objective', 'cta', 'banned_claims', 'languages'],
    requires: [
      { id: 'person', any_of: ['person'], blocking: true },
      { id: 'audience', any_of: ['audience'] },
      { id: 'voice', any_of: ['voice'] },
    ],
    assets: ['portrait'],
    tokens: false,
    mascot_artwork: false,
    strategy: null,
    surface: null,
    batch: false,
    requires_module: 'personal',
  },
}

/** The asset role a manifest row plays, from its id and its tags. Unknown rows are `other`. */
export function assetRole(id: string, tags: readonly unknown[] = []): AssetRole {
  const words = [id, ...tags.map((tag) => String(tag))].join(' ').toLowerCase()
  if (/\bportrait\b|\bheadshot\b|photo\.person/.test(words)) return 'portrait'
  if (/mascot/.test(words)) return 'mascot'
  if (/\blogo\b|wordmark|lockup|monogram/.test(words)) return 'logo'
  if (/\bicon\b|\bmark\b|favicon/.test(words)) return 'icon'
  return 'other'
}
