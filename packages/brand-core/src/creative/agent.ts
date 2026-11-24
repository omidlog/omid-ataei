import { appendAccessLog } from '../access-log.js'
import type { AuthContext } from '../auth.js'
import type { InterviewEngine } from '../engine.js'
import { safetyBlocksSharing, safetyReport } from '../knowledge/safety.js'
import { openWorkspace } from '../knowledge/workspace.js'
import { buildCreativeContext, CONTEXT_NOTICE, type CitedReason, type CreativeContext, type PreferenceItem } from './context.js'
import { CreativeError, PROJECT_ID, SERIES_ID, SURFACES } from './model.js'

/**
 * Read-only `creative_context` for MCP agents.
 *
 * - Only an owner-issued token with the `creative-read` profile is answered. Guests, unprofiled agents, the owner
 *   process context and every other profile get `denied`. No argument can select a brand, role, profile or scope.
 * - Only approved, currently valid preferences are returned. Drafts, superseded, needs-review and tampered
 *   preferences are counted under `withheld`, never shown.
 * - A note's verbatim text is quoted only when the note is shared (brand/knowledge/shared) and passes the same safety
 *   check as sharing. Local note text stays on the owner's computer: `quote_withheld: local_note`.
 * - Records of another brand are skipped by the store; a token of another brand is denied.
 * - Every call, allowed or not, appends one access-log line with ids only.
 */

export const CREATIVE_AGENT_TOOL = 'creative_context' as const

export const CREATIVE_AGENT_NOTICE = [
  ...CONTEXT_NOTICE,
  'Read-only. This tool cannot record feedback, approve, share, publish or post. Ask the owner to change creative memory with brand:creative.',
]

export type QuoteWithheld = 'local_note' | 'archived' | 'missing' | 'unsafe'

export interface AgentReason extends Omit<CitedReason, 'note_scope'> {
  quote_withheld: QuoteWithheld | null
}

export interface AgentCreativeContext {
  schema_version: 1
  kind: 'creative_context'
  agent_profile: 'creative-read'
  brand_id: string
  target: CreativeContext['target']
  notice: string[]
  brand_rules: CreativeContext['brand_rules']
  preferences: Array<Omit<PreferenceItem, 'state'> & { state: 'approved' }>
  withheld: { preferences: { draft: number; superseded: number; needs_review: number; invalid_approval: number } }
  references: Array<Omit<CreativeContext['references'][number], 'reasons'> & { reasons: AgentReason[] }>
  inspirations: Array<Omit<CreativeContext['inspirations'][number], 'note_scope'>>
  performance: 'not_measured'
  authorizes: []
  execute_permission: false
  publication_permission: false
}

export interface CreativeToolResult {
  tool: typeof CREATIVE_AGENT_TOOL
  status: 'ok' | 'denied' | 'not_found' | 'invalid'
  brand_id: string
  reason?: string
  data: AgentCreativeContext | null
}

export interface CreativeToolArgs {
  project_id?: string
  surface?: string
  series?: string
}

export function creativeAccess(ctx: AuthContext, brandSlug: string): { allow: boolean; reason: string } {
  if (ctx.brand_id !== brandSlug) return { allow: false, reason: 'cross-brand' }
  if (ctx.role !== 'agent' || ctx.profile !== 'creative-read') {
    return { allow: false, reason: 'creative_context needs an owner-issued token with the creative-read profile' }
  }
  return { allow: true, reason: 'allowed' }
}

function unsafe(text: string | null): boolean {
  return text !== null && safetyBlocksSharing(safetyReport(text)).length > 0
}

function agentReason(reason: CitedReason): AgentReason {
  const { note_scope: scope, ...rest } = reason
  let withheld: QuoteWithheld | null = null
  if (reason.source_state === 'archived') withheld = 'archived'
  else if (reason.source_state === 'missing' || reason.quote === null) withheld = 'missing'
  else if (scope !== 'shared') withheld = 'local_note'
  else if (unsafe(reason.quote)) withheld = 'unsafe'
  return withheld ? { ...rest, quote: null, quote_truncated: false, quote_withheld: withheld } : { ...rest, quote_withheld: null }
}

/** Turns the owner's context into what a creative-read agent may see. Pure; tested with canaries. */
export function agentView(ctx: CreativeContext): AgentCreativeContext {
  const counts = { draft: 0, superseded: 0, needs_review: 0, invalid_approval: 0 }
  for (const pref of [...ctx.preferences.applied, ...ctx.preferences.not_applied]) {
    if (pref.state !== 'approved') counts[pref.state] += 1
  }
  const preferences = ctx.preferences.applied
    .filter((pref): pref is PreferenceItem & { state: 'approved' } => pref.state === 'approved')
    .filter((pref) => !unsafe(`${pref.statement}\n${pref.context ?? ''}`))
  return {
    schema_version: 1,
    kind: 'creative_context',
    agent_profile: 'creative-read',
    brand_id: ctx.brand_slug,
    target: ctx.target,
    notice: CREATIVE_AGENT_NOTICE,
    brand_rules: ctx.brand_rules,
    preferences,
    withheld: { preferences: counts },
    references: ctx.references.map((ref) => ({ ...ref, describe: unsafe(ref.describe) ? null : ref.describe, reasons: ref.reasons.map(agentReason) })),
    inspirations: ctx.inspirations.map(({ note_scope: scope, ...item }) => ({ ...item, title: scope === 'shared' && !unsafe(item.title) ? item.title : null })),
    performance: 'not_measured',
    authorizes: [],
    execute_permission: false,
    publication_permission: false,
  }
}

function cleanArg(value: unknown, pattern: RegExp): string | undefined | null {
  if (value === undefined || value === null || value === '') return undefined
  return typeof value === 'string' && pattern.test(value) ? value : null
}

export function runCreativeContextTool(engine: InterviewEngine, ctx: AuthContext, args: CreativeToolArgs = {}): CreativeToolResult {
  const brandSlug = engine.config().brand.slug
  const base = { tool: CREATIVE_AGENT_TOOL, brand_id: brandSlug }
  const projectId = cleanArg(args.project_id, PROJECT_ID)
  const series = cleanArg(args.series, SERIES_ID)
  const surface = typeof args.surface === 'string' && (SURFACES as readonly string[]).includes(args.surface) ? args.surface : args.surface === undefined ? undefined : null
  const log = (decision: 'allow' | 'deny', reason: string, returned: string[] = [], withheld: string[] = []) =>
    appendAccessLog(engine.workspaceRoot(), ctx, {
      tool: CREATIVE_AGENT_TOOL,
      kind: 'creative',
      requested_ids: projectId ? [projectId] : [],
      returned_ids: returned,
      withheld_ids: withheld,
      query_sha256: null,
      decision,
      reason,
    })
  const access = creativeAccess(ctx, brandSlug)
  if (!access.allow) {
    log('deny', access.reason)
    return { ...base, status: 'denied', reason: access.reason, data: null }
  }
  if (projectId === null || series === null || surface === null) {
    log('deny', 'invalid')
    return { ...base, status: 'invalid', reason: 'project_id, surface or series is not a valid value.', data: null }
  }
  try {
    const ws = openWorkspace(engine.workspaceRoot())
    const full = buildCreativeContext(ws, engine, { project_id: projectId, surface, series }, ctx)
    const view = agentView(full)
    const returned = [
      ...view.preferences.map((pref) => pref.preference_id),
      ...view.references.map((ref) => `${ref.project_id}/${ref.variant_id}`),
      ...view.references.flatMap((ref) => ref.reasons.filter((reason) => reason.quote !== null).map((reason) => reason.note_id)),
    ]
    const withheld = [
      ...[...full.preferences.applied, ...full.preferences.not_applied].map((pref) => pref.preference_id).filter((id) => !view.preferences.some((pref) => pref.preference_id === id)),
      ...view.references.flatMap((ref) => ref.reasons.filter((reason) => reason.quote_withheld !== null).map((reason) => reason.note_id)),
    ]
    log('allow', 'allowed', [...new Set(returned)], [...new Set(withheld)])
    return { ...base, status: 'ok', data: view }
  } catch (error) {
    if (error instanceof CreativeError) {
      // Another brand's record, a missing project and a corrupt record look the same to an agent.
      const notFound = error.code === 'not_found' || error.code === 'wrong_brand' || error.code === 'invalid_record' || error.code === 'unsafe_path'
      log('deny', notFound ? 'not_found' : error.code)
      return { ...base, status: notFound ? 'not_found' : 'invalid', reason: notFound ? 'not found' : error.message, data: null }
    }
    throw error
  }
}
