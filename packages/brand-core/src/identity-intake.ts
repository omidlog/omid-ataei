import type { BrandConfig } from './types.js'

/**
 * Identity intake: the owner's self-reported answer to "is there a logo today, and what do you want to
 * do with the identity?" It is a routing hint for later interviews and the logo/rebrand brief. It is
 * never an approved brand fact, never a trademark statement, never a publication grant and never
 * permission to change `brand.logo.*`, the brand name, the strategy or an approved asset.
 *
 * Stored as the optional `onboarding.identity` block of `brand/brand.config.yaml`. That file is
 * brand-owned (template sync never touches `brand/**`), is not copied into public docs, and no MCP or
 * `brand:query` tool returns this block. A config without the block reads as unknown / undecided.
 */
export const LOGO_PRESENCE = ['absent', 'present', 'in_progress', 'unknown'] as const
export type LogoPresence = (typeof LOGO_PRESENCE)[number]

export const IDENTITY_INTENTS = ['create', 'retain', 'evolve', 'rebrand', 'undecided'] as const
export type IdentityIntent = (typeof IDENTITY_INTENTS)[number]

export const CHANGE_DEPTHS = ['logo_evolution', 'visual_refresh', 'strategic_rebrand', 'undecided'] as const
export type ChangeDepth = (typeof CHANGE_DEPTHS)[number]

export const IDENTITY_INTAKE_SOURCES = ['studio_owner_wizard', 'brand_init'] as const
export type IdentityIntakeSource = (typeof IDENTITY_INTAKE_SOURCES)[number]

export interface IdentityChoice {
  logo_presence: LogoPresence
  identity_intent: IdentityIntent
  /** Only for `evolve` and `rebrand`; otherwise null. */
  change_depth: ChangeDepth | null
}

export interface IdentityIntake extends IdentityChoice {
  schema_version: 1
  source: IdentityIntakeSource
  authority: 'unapproved_owner_intake'
  recorded_at: string
}

export type IdentityField = 'logo_presence' | 'identity_intent' | 'change_depth'

export type IdentityIntakeError =
  | 'logo_presence_invalid'
  | 'identity_intent_invalid'
  | 'change_depth_invalid'
  | 'change_depth_not_applicable'
  | 'retain_without_logo'
  | 'create_with_logo'
  | 'logo_evolution_without_logo'

export const DEFAULT_IDENTITY_CHOICE: Readonly<IdentityChoice> = Object.freeze({ logo_presence: 'unknown', identity_intent: 'undecided', change_depth: null })

/** `change_depth` is asked only when the owner wants to change something. */
export function changeDepthApplies(intent: IdentityIntent): boolean {
  return intent === 'evolve' || intent === 'rebrand'
}

function blank(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

function member<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
}

/**
 * Strict validation. A missing value means unknown / undecided (never `absent` or `create`).
 * Contradictions are refused, not guessed: no logo with "keep", a logo with "create new", a logo
 * evolution without a logo, and a change depth for an intent that changes nothing.
 * `evolve` or `rebrand` without a depth reads as `undecided`.
 */
export function validateIdentityChoice(input: Partial<Record<IdentityField, unknown>>): { ok: true; value: IdentityChoice } | { ok: false; errors: Partial<Record<IdentityField, IdentityIntakeError>> } {
  const errors: Partial<Record<IdentityField, IdentityIntakeError>> = {}
  const presence = blank(input.logo_presence) ? DEFAULT_IDENTITY_CHOICE.logo_presence : input.logo_presence
  const intent = blank(input.identity_intent) ? DEFAULT_IDENTITY_CHOICE.identity_intent : input.identity_intent
  if (!member(LOGO_PRESENCE, presence)) errors.logo_presence = 'logo_presence_invalid'
  if (!member(IDENTITY_INTENTS, intent)) errors.identity_intent = 'identity_intent_invalid'
  let depth: ChangeDepth | null = null
  if (!blank(input.change_depth)) {
    if (!member(CHANGE_DEPTHS, input.change_depth)) errors.change_depth = 'change_depth_invalid'
    else depth = input.change_depth
  }
  if (Object.keys(errors).length) return { ok: false, errors }
  const p = presence as LogoPresence
  const t = intent as IdentityIntent
  if (changeDepthApplies(t)) depth = depth ?? 'undecided'
  else if (depth !== null) errors.change_depth = 'change_depth_not_applicable'
  if (p === 'absent' && t === 'retain') errors.identity_intent = 'retain_without_logo'
  if (p === 'present' && t === 'create') errors.identity_intent = 'create_with_logo'
  if (p === 'absent' && depth === 'logo_evolution') errors.change_depth = 'logo_evolution_without_logo'
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, value: { logo_presence: p, identity_intent: t, change_depth: depth } }
}

/** Builds the stored record. Throws on an invalid choice, so nothing contradictory is ever written. */
export function identityIntakeRecord(input: Partial<Record<IdentityField, unknown>>, source: IdentityIntakeSource, now: Date = new Date()): IdentityIntake {
  const checked = validateIdentityChoice(input)
  if (!checked.ok) {
    const detail = Object.entries(checked.errors).map(([field, code]) => `${field}: ${code}`).join(', ')
    throw new Error(`Invalid identity intake (${detail}).`)
  }
  return { schema_version: 1, source, authority: 'unapproved_owner_intake', ...checked.value, recorded_at: now.toISOString() }
}

export type IdentityIntakeRead =
  | { state: 'not_recorded'; choice: IdentityChoice; intake: null }
  | { state: 'recorded'; choice: IdentityChoice; intake: IdentityIntake }
  | { state: 'invalid'; choice: IdentityChoice; intake: null; reason: string }

/**
 * Reads `onboarding.identity` from a brand config. Older brands have no block: that is
 * `not_recorded` with unknown / undecided defaults, never an inferred logo status. A hand-edited or
 * contradictory block is `invalid` and also falls back to the defaults.
 */
export function readIdentityIntake(config: Pick<BrandConfig, 'onboarding'> | null | undefined): IdentityIntakeRead {
  const defaults = (): IdentityChoice => ({ ...DEFAULT_IDENTITY_CHOICE })
  const raw = (config?.onboarding as { identity?: unknown } | undefined)?.identity
  if (raw === undefined || raw === null) return { state: 'not_recorded', choice: defaults(), intake: null }
  if (typeof raw !== 'object' || Array.isArray(raw)) return { state: 'invalid', choice: defaults(), intake: null, reason: 'onboarding.identity is not a mapping' }
  const record = raw as Record<string, unknown>
  if (record.schema_version !== 1) return { state: 'invalid', choice: defaults(), intake: null, reason: 'unsupported schema_version' }
  if (record.authority !== 'unapproved_owner_intake') return { state: 'invalid', choice: defaults(), intake: null, reason: 'authority must be unapproved_owner_intake' }
  if (!member(IDENTITY_INTAKE_SOURCES, record.source)) return { state: 'invalid', choice: defaults(), intake: null, reason: 'unknown source' }
  if (typeof record.recorded_at !== 'string' || Number.isNaN(Date.parse(record.recorded_at))) return { state: 'invalid', choice: defaults(), intake: null, reason: 'recorded_at is not a date' }
  // A stored record must be explicit: evolve / rebrand need their depth written out.
  const intent = record.identity_intent
  if (member(IDENTITY_INTENTS, intent) && changeDepthApplies(intent) && !member(CHANGE_DEPTHS, record.change_depth)) {
    return { state: 'invalid', choice: defaults(), intake: null, reason: 'change_depth missing' }
  }
  const checked = validateIdentityChoice({ logo_presence: record.logo_presence, identity_intent: intent, change_depth: record.change_depth })
  if (!checked.ok || blank(record.logo_presence) || blank(intent)) {
    const detail = checked.ok ? 'missing value' : Object.values(checked.errors).join(', ')
    return { state: 'invalid', choice: defaults(), intake: null, reason: detail }
  }
  const intake: IdentityIntake = { schema_version: 1, source: record.source, authority: 'unapproved_owner_intake', ...checked.value, recorded_at: record.recorded_at }
  return { state: 'recorded', choice: { ...checked.value }, intake }
}
