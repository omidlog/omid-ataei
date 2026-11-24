import { appendAccessLog } from '../access-log.js'
import type { AuthContext } from '../auth.js'
import type { InterviewEngine } from '../engine.js'
import { visualDnaText } from './i18n.js'
import {
  ASSET_ID_PATTERN,
  MAX_ASSET_IDS,
  REFERENCE_STATES,
  USE_SCOPES,
  VISUAL_DNA_LOCALES,
  VISUAL_DNA_PERMISSIONS,
  VISUAL_DNA_SCHEMA,
  VISUAL_DNA_TOOL,
  type ReferenceState,
  type UseScope,
  type VisualDnaLocale,
  type VisualDnaRequest,
  type VisualDnaResult,
} from './model.js'
import { resolveVisualDna } from './resolve.js'

/**
 * The one entry point the stdio MCP tool `visual_dna` and the CLI `brand:visual-dna resolve` share.
 *
 * - The caller context comes from the process and is passed in unchanged; no input names a brand, role, profile,
 *   token or audience. Creative references are read with the same context, so only a creative-read token gets them.
 * - Any owner-issued agent token of this brand and the owner process are answered. Guests, unprofiled agents and
 *   other brands are denied before any input is looked at.
 * - Input is checked strictly: asset ids are manifest ids, never paths or URLs.
 * - One `visual_dna` access-log line per call (ids only), plus the lines the readers it calls write themselves.
 *   A privileged read is not served if its audit line cannot be written.
 */

export interface VisualDnaToolInput {
  asset_ids?: unknown
  mascot?: unknown
  creative?: unknown
  use_scope?: unknown
  locale?: unknown
}

export function visualDnaAccess(ctx: AuthContext, brandSlug: string): { allow: boolean; reason: string } {
  if (ctx.brand_id !== brandSlug) return { allow: false, reason: 'cross-brand' }
  if (ctx.role === 'guest' || ctx.audience === 'public' || (ctx.role === 'agent' && ctx.profile === undefined)) {
    return { allow: false, reason: 'visual_dna needs an owner-issued agent token of this brand' }
  }
  return { allow: true, reason: 'allowed' }
}

function shortString(value: unknown, max: number): string | undefined | null {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || value.length > max) return null
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

/** Strict input check. Returns the request, or a reason it is invalid. */
export function parseVisualDnaInput(input: VisualDnaToolInput): { request: VisualDnaRequest } | { invalid: string } {
  const request: VisualDnaRequest = {}
  if (input.locale !== undefined) {
    if (!(VISUAL_DNA_LOCALES as readonly unknown[]).includes(input.locale)) return { invalid: 'locale is en, fa or tr.' }
    request.locale = input.locale as VisualDnaLocale
  }
  if (input.use_scope !== undefined) {
    if (!(USE_SCOPES as readonly unknown[]).includes(input.use_scope)) return { invalid: 'use_scope is public or internal.' }
    request.use_scope = input.use_scope as UseScope
  }
  if (input.asset_ids !== undefined) {
    if (!Array.isArray(input.asset_ids) || input.asset_ids.length > MAX_ASSET_IDS) return { invalid: `asset_ids is a list of at most ${MAX_ASSET_IDS} manifest ids.` }
    for (const id of input.asset_ids) {
      if (typeof id !== 'string' || !ASSET_ID_PATTERN.test(id)) return { invalid: 'An asset id is an id from brand/assets/asset-manifest.yaml. File paths and URLs are not accepted.' }
    }
    if (input.asset_ids.length > 0) request.asset_ids = input.asset_ids as string[]
  }
  if (input.mascot !== undefined) {
    if (typeof input.mascot !== 'object' || input.mascot === null || Array.isArray(input.mascot)) return { invalid: 'mascot is an object with emotion, stage, use_case or angle.' }
    const source = input.mascot as Record<string, unknown>
    if (Object.keys(source).some((key) => !['emotion', 'stage', 'use_case', 'angle'].includes(key))) return { invalid: 'mascot accepts emotion, stage, use_case and angle only.' }
    const mascot: NonNullable<VisualDnaRequest['mascot']> = {}
    for (const key of ['emotion', 'stage', 'use_case', 'angle'] as const) {
      const value = shortString(source[key], 100)
      if (value === null) return { invalid: `mascot.${key} is a short text.` }
      if (value !== undefined) mascot[key] = value
    }
    request.mascot = mascot
  }
  if (input.creative !== undefined) {
    if (typeof input.creative !== 'object' || input.creative === null || Array.isArray(input.creative)) return { invalid: 'creative is an object with project_id, or surface and series.' }
    const source = input.creative as Record<string, unknown>
    if (Object.keys(source).some((key) => !['project_id', 'surface', 'series'].includes(key))) return { invalid: 'creative accepts project_id, surface and series only.' }
    const creative: NonNullable<VisualDnaRequest['creative']> = {}
    for (const key of ['project_id', 'surface', 'series'] as const) {
      const value = shortString(source[key], 40)
      if (value === null) return { invalid: `creative.${key} is a short id.` }
      if (value !== undefined) creative[key] = value
    }
    request.creative = creative
  }
  if (!request.asset_ids && !request.mascot && !request.creative) return { invalid: 'Give asset_ids, mascot or creative.' }
  return { request }
}

function refused(engine: InterviewEngine, ctx: AuthContext, status: 'denied' | 'invalid', reason: string, locale: VisualDnaLocale): VisualDnaResult {
  return {
    schema: VISUAL_DNA_SCHEMA,
    tool: VISUAL_DNA_TOOL,
    status,
    brand_id: engine.config().brand.slug,
    principal: { role: ctx.role, profile: ctx.profile ?? null },
    reason,
    use_scope: 'public',
    locale,
    direction: locale === 'fa' ? 'rtl' : 'ltr',
    notice: [...visualDnaText(locale).notice],
    references: [],
    mascot: { status: 'not_requested', filters: null, explanation: [] },
    creative: { status: 'not_requested', target: null, preference_ids: [] },
    summary: Object.fromEntries(REFERENCE_STATES.map((state) => [state, 0])) as Record<ReferenceState, number>,
    digest: null,
    transport: { mcp: 'metadata_only', bytes: 'owner_local_only' },
    authorizes: [],
    permissions: { ...VISUAL_DNA_PERMISSIONS },
  }
}

export function runVisualDnaTool(engine: InterviewEngine, ctx: AuthContext, input: VisualDnaToolInput = {}): VisualDnaResult {
  const locale = (VISUAL_DNA_LOCALES as readonly unknown[]).includes(input.locale) ? (input.locale as VisualDnaLocale) : 'en'
  const root = engine.workspaceRoot()
  const log = (decision: 'allow' | 'deny', reason: string, requested: string[] = [], returned: string[] = [], withheld: string[] = []): boolean => {
    try {
      appendAccessLog(root, ctx, { tool: VISUAL_DNA_TOOL, kind: 'visual_dna', requested_ids: requested, returned_ids: returned, withheld_ids: withheld, query_sha256: null, decision, reason })
      return true
    } catch {
      return false
    }
  }
  const access = visualDnaAccess(ctx, engine.config().brand.slug)
  if (!access.allow) {
    log('deny', access.reason)
    return refused(engine, ctx, 'denied', access.reason, locale)
  }
  const parsed = parseVisualDnaInput(input)
  if ('invalid' in parsed) {
    log('deny', 'invalid')
    return refused(engine, ctx, 'invalid', parsed.invalid, locale)
  }
  const result = resolveVisualDna(engine, ctx, parsed.request)
  const ids = (states: ReferenceState[]) => [...new Set(result.references.filter((ref) => states.includes(ref.state) && ref.asset_id).map((ref) => ref.asset_id as string))]
  if (!log('allow', 'allowed', parsed.request.asset_ids ?? [], ids(['approved']), ids(['withheld', 'changed']))) {
    return refused(engine, ctx, 'denied', 'access log unavailable', locale)
  }
  return result
}
