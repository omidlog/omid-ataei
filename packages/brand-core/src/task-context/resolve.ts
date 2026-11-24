import fs from 'node:fs'
import path from 'node:path'
import { effectiveModelUse } from '@brand-os/asset-catalog'
import { appendAccessLog } from '../access-log.js'
import type { AuthContext } from '../auth.js'
import { isPlaceholderValue } from '../content-bridge/sources.js'
import { runCreativeContextTool } from '../creative/agent.js'
import { SERIES_ID } from '../creative/model.js'
import type { InterviewEngine } from '../engine.js'
import { readYaml } from '../fsutil.js'
import { brandRetrieve, type RetrievedItem } from '../query.js'
import { runStrategyTool, STRATEGY_PROFILES, type StrategyFeedDocument } from '../strategy/feed.js'
import type { AgentKind, StrategyType } from '../strategy/model.js'
import { taskText } from './i18n.js'
import {
  MAX_DELIVERABLE_COUNT,
  MAX_ITEMS_PER_KIND,
  NO_PERMISSIONS,
  packDigest,
  REQUEST_MODES,
  TASK_CONTEXT_SCHEMA,
  TASK_CONTEXT_TOOL,
  TASK_LOCALES,
  TASK_TYPES,
  type PackItem,
  type PackMissing,
  type PackSource,
  type RequestMode,
  type SectionName,
  type TaskContextPack,
  type TaskContextResult,
  type TaskLocale,
  type TaskType,
} from './model.js'
import { assetRole, taskFields, TASK_RECIPES, type AssetRole, type ModuleFlags } from './sources.js'

/**
 * The Task Context resolver: one authorized read over the canonical readers, rendered as a
 * `brand-os/task-context/v1` pack. Preflight audit and guide: `docs-internal/TASK_CONTEXT.md`.
 *
 * - The caller context is resolved by the process (`resolveAgentContext`) and passed in. **Every** reader is called
 *   with that same context: facts through `brandRetrieve`, strategy through `runStrategyTool`, creative preferences
 *   through `runCreativeContextTool`. No second context is built, nothing is merged across principals, and no
 *   argument can name a brand, role, profile, token or audience.
 * - Nothing is written. No approval, calendar week, strategy, fact, asset or token changes.
 * - Missing stays missing: an unreadable or unapproved source becomes a `missing[]` entry with the existing
 *   FieldQuestion id to ask, never a substitute value.
 * - One access-log line per call, ids only, never the request text.
 */

export interface TaskContextArgs {
  task_type?: unknown
  request_mode?: unknown
  channel?: unknown
  deliverable_count?: unknown
  locale?: unknown
  output_format?: unknown
  /** A creative-memory series for scoped preferences. Validated; it cannot select a brand or widen access. */
  scope_id?: unknown
}

const TYPE_OF_KIND: Record<AgentKind, StrategyType> = { seo: 'seo', ads: 'paid_media', content: 'content' }
const CHANNEL = /^[a-z][a-z0-9-]{1,19}$/
const OUTPUT_FORMAT = /^[A-Za-z0-9][A-Za-z0-9 x×:._-]{0,39}$/

export function taskContextAccess(ctx: AuthContext, brandSlug: string): { allow: boolean; reason: string } {
  if (ctx.brand_id !== brandSlug) return { allow: false, reason: 'cross-brand' }
  if (ctx.role !== 'agent' || ctx.profile === undefined) {
    return { allow: false, reason: 'task_context needs an owner-issued agent token of this brand (npm run brand:agent-token -- issue --profile <profile>)' }
  }
  return { allow: true, reason: 'allowed' }
}

function clean<T extends string>(value: unknown, allowed: readonly T[]): T | undefined | null {
  if (value === undefined || value === null || value === '') return undefined
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null
}

function cleanPattern(value: unknown, pattern: RegExp): string | undefined | null {
  if (value === undefined || value === null || value === '') return undefined
  return typeof value === 'string' && pattern.test(value) ? value : null
}

function cleanCount(value: unknown): number | undefined | null {
  if (value === undefined || value === null || value === '') return undefined
  const count = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(count) && count >= 1 && count <= MAX_DELIVERABLE_COUNT ? count : null
}

function packValue(value: unknown): PackItem['value'] {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value
  if (value !== null && typeof value === 'object') return value as Record<string, unknown>
  return null
}

function manifestRows(root: string): Array<Record<string, unknown>> {
  const file = path.join(root, 'brand', 'assets', 'asset-manifest.yaml')
  if (!fs.existsSync(file)) return []
  try {
    const doc = readYaml<{ assets?: Array<Record<string, unknown>> }>(file)
    return Array.isArray(doc.assets) ? doc.assets : []
  } catch {
    return []
  }
}

/** Collects the pack while it is built, so one place decides items, gaps, sources and redactions. */
class Builder {
  readonly sections: Record<SectionName, PackItem[]> = { identity: [], strategy: [], creative: [], production: [] }
  readonly missing: PackMissing[] = []
  readonly redacted: string[] = []
  readonly sources: PackSource[] = []
  notAuthorized = false
  needsReview = false

  item(section: SectionName, item: PackItem): void {
    this.sections[section].push(item)
  }

  approved(section: SectionName, key: string, item: RetrievedItem): void {
    this.item(section, { key, value: packValue(item.value), state: 'approved', source_id: item.id, source_revision: item.revision })
    this.source({ id: item.id, revision: item.revision, classification: item.classification, status: 'approved' })
  }

  gap(section: SectionName, key: string, entry: PackMissing, state: 'missing' | 'withheld' | 'not_applicable' = 'missing'): void {
    this.item(section, { key, value: null, state, source_id: null, source_revision: null })
    this.missing.push(entry)
    if (entry.reason === 'not_authorized') this.notAuthorized = true
  }

  source(source: PackSource): void {
    if (!this.sources.some((existing) => existing.id === source.id)) this.sources.push(source)
  }

  /**
   * A fact this caller may not read. Only the category is disclosed, never the fact id, its value or its revision:
   * a pack can be pasted into an issue or a screenshot, so it names no restricted field at all.
   */
  withheld(classification: PackSource['classification']): void {
    const label = classification === 'restricted' ? 'facts.restricted' : 'facts.not_authorized'
    if (!this.redacted.includes(label)) this.redacted.push(label)
  }

  /** True when at least one of these keys resolved to an approved value. */
  satisfied(keys: readonly string[]): boolean {
    return Object.values(this.sections).some((items) => items.some((item) => keys.includes(item.key) && item.state === 'approved'));
  }
}

function addFacts(builder: Builder, engine: InterviewEngine, ctx: AuthContext, flags: ModuleFlags, recipe: (typeof TASK_RECIPES)[TaskType]): void {
  const result = brandRetrieve(engine, ctx, { kind: 'facts' })
  const items = result.status === 'denied' ? [] : ((result.data as { items: RetrievedItem[] }).items ?? [])
  const byId = new Map(items.map((item) => [item.id, item]))
  const fields = new Map(taskFields(flags).map((field) => [field.key, field]))
  for (const key of recipe.keys) {
    const field = fields.get(key)
    if (!field) continue
    let found = 0
    let anyWithheld = false
    let placeholder = false
    for (const id of field.fact_ids) {
      const item = byId.get(id)
      if (!item) continue
      if (item.withheld) {
        anyWithheld = true
        builder.withheld(item.classification)
        continue
      }
      if (isPlaceholderValue(item.value)) {
        placeholder = true
        continue
      }
      builder.approved(field.section, key, item)
      found += 1
      if (field.first === true) break
    }
    if (found === 0) {
      builder.gap(
        field.section,
        key,
        {
          id: key,
          reason: placeholder ? 'owner_decision' : anyWithheld ? 'not_authorized' : 'not_approved',
          blocking: false,
          suggested_question_id: field.fact_ids[0] ?? null,
        },
        anyWithheld && !placeholder ? 'withheld' : 'missing',
      )
    }
  }
}

function addTokens(builder: Builder, engine: InterviewEngine, ctx: AuthContext): void {
  const result = brandRetrieve(engine, ctx, { kind: 'tokens' })
  const items = result.status === 'denied' ? [] : ((result.data as { items: RetrievedItem[] }).items ?? [])
  for (const item of items.slice(0, MAX_ITEMS_PER_KIND)) {
    builder.item('creative', {
      key: 'tokens',
      value: { id: item.id, type: (item.meta?.type as string | undefined) ?? null, value: packValue(item.value) },
      state: 'approved',
      source_id: item.id,
      source_revision: item.revision,
    })
    builder.source({ id: item.id, revision: item.revision, classification: item.classification, status: 'approved' })
  }
  if (items.length === 0) {
    // An EXAMPLE or generated token is never served: approval is the hash step `brand:tokens:approve`.
    builder.gap('creative', 'tokens', { id: 'tokens', reason: 'not_approved', blocking: false, suggested_question_id: null })
  }
}

function addAssets(builder: Builder, engine: InterviewEngine, ctx: AuthContext, roles: readonly AssetRole[]): void {
  const rows = manifestRows(engine.workspaceRoot())
  const wanted = new Map<string, AssetRole>()
  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : null
    if (!id) continue
    const found = assetRole(id, Array.isArray(row.tags) ? row.tags : [])
    if (roles.includes(found)) wanted.set(id, found)
  }
  // Candidate ids only: every one still goes through brandRetrieve, so approval, rights, checksum and the SVG gate
  // decide what comes back. Nothing unreadable is disclosed, not even its existence.
  const result = wanted.size > 0 ? brandRetrieve(engine, ctx, { kind: 'asset', ids: [...wanted.keys()] }) : null
  const items = result && result.status !== 'denied' ? ((result.data as { items: RetrievedItem[] }).items ?? []) : []
  for (const role of roles) {
    const mine = items.filter((item) => wanted.get(item.id) === role).slice(0, MAX_ITEMS_PER_KIND)
    for (const item of mine) {
      const value = item.value as Record<string, unknown>
      builder.item('creative', {
        key: `assets.${role}`,
        value: { id: item.id, name: value.name ?? null, path: value.path ?? null, checksum_sha256: value.checksum_sha256 ?? null, license: value.license ?? null, usage: value.usage ?? null, model_use: effectiveModelUse(value) },
        state: 'approved',
        source_id: item.id,
        source_revision: item.revision,
      })
      builder.source({ id: item.id, revision: item.revision, classification: item.classification, status: 'approved' })
    }
    if (mine.length === 0) {
      builder.gap('creative', `assets.${role}`, { id: `assets.${role}`, reason: 'asset_missing', blocking: false, suggested_question_id: null })
    }
  }
}

function addMascotArtwork(builder: Builder, engine: InterviewEngine, ctx: AuthContext): void {
  const result = brandRetrieve(engine, ctx, { kind: 'mascot' })
  const items = result.status === 'denied' ? [] : ((result.data as { items: RetrievedItem[] }).items ?? [])
  for (const item of items.slice(0, MAX_ITEMS_PER_KIND)) {
    const value = item.value as Record<string, unknown>
    builder.item('creative', {
      key: 'mascot_artwork',
      value: { id: item.id, state_id: value.state_id ?? null, emotion: value.emotion ?? null, stage: value.stage ?? null, angle: value.angle ?? null, asset: value.asset ?? null },
      state: 'approved',
      source_id: item.id,
      source_revision: item.revision,
    })
    builder.source({ id: item.id, revision: item.revision, classification: item.classification, status: 'approved' })
  }
  if (items.length === 0) {
    // No substitute pose. An exact emotion/stage/angle lookup stays with `brand_retrieve --kind mascot`.
    builder.gap('creative', 'mascot_artwork', { id: 'mascot_artwork', reason: 'asset_missing', blocking: false, suggested_question_id: null })
  }
}

function addStrategy(builder: Builder, engine: InterviewEngine, ctx: AuthContext, type: StrategyType): string[] {
  const root = engine.workspaceRoot()
  const slug = engine.config().brand.slug
  const key = `strategy.${type}`
  const kind = ctx.profile ? STRATEGY_PROFILES[ctx.profile] : undefined
  if (!kind || TYPE_OF_KIND[kind] !== type) {
    builder.gap('strategy', key, { id: key, reason: 'not_authorized', blocking: false, suggested_question_id: null }, 'withheld')
    return []
  }
  const list = runStrategyTool(root, slug, ctx, 'strategy_list')
  if (list.status !== 'ok') {
    builder.gap('strategy', key, { id: key, reason: list.status === 'denied' ? 'not_authorized' : 'not_approved', blocking: false, suggested_question_id: null }, 'withheld')
    return []
  }
  const ids = (list.data as { strategies: Array<{ strategy_id: string; type: StrategyType }> }).strategies.filter((entry) => entry.type === type).map((entry) => entry.strategy_id)
  const rules: string[] = []
  let served = 0
  for (const strategyId of ids.slice(0, 2)) {
    const got = runStrategyTool(root, slug, ctx, 'strategy_get', { strategy_id: strategyId })
    if (got.status !== 'ok' || got.data === null) continue
    const doc = got.data as StrategyFeedDocument
    served += 1
    if (doc.status === 'review_due') builder.needsReview = true
    builder.item('strategy', {
      key,
      value: {
        strategy_id: doc.strategy_id,
        revision: doc.revision,
        status: doc.status,
        title: doc.title,
        objective: doc.objective.statement,
        scope: doc.scope,
        must_do: doc.must_do.slice(0, 8),
        must_not_do: doc.must_not_do.slice(0, 8),
        non_goals: doc.non_goals.slice(0, 8),
        recommendations: doc.recommendations.slice(0, 6).map((rec) => ({ id: rec.id, priority: rec.priority, action: rec.action })),
      },
      state: 'approved',
      source_id: `strategy:${doc.strategy_id}`,
      source_revision: doc.digests.content_sha256,
    })
    builder.source({ id: `strategy:${doc.strategy_id}`, revision: doc.digests.content_sha256, classification: 'internal', status: 'current' })
    for (const field of doc.redacted) builder.redacted.push(`strategy:${doc.strategy_id}.${field.field}`)
    rules.push(...doc.must_not_do, ...doc.guardrails)
  }
  if (served === 0) builder.gap('strategy', key, { id: key, reason: 'not_approved', blocking: false, suggested_question_id: null })
  return rules
}

function addCreativePreferences(builder: Builder, engine: InterviewEngine, ctx: AuthContext, surface: string, series: string): void {
  const result = runCreativeContextTool(engine, ctx, { surface, series })
  if (result.status !== 'ok' || result.data === null) {
    builder.gap('creative', 'creative_preferences', { id: 'creative_preferences', reason: result.status === 'denied' ? 'not_authorized' : 'not_approved', blocking: false, suggested_question_id: null }, 'withheld')
    return
  }
  const preferences = result.data.preferences.slice(0, MAX_ITEMS_PER_KIND)
  for (const preference of preferences) {
    builder.item('creative', {
      key: 'creative_preferences',
      // A scoped preference is not a brand-wide rule: its scope travels with it.
      value: { preference_id: preference.preference_id, statement: preference.statement, scope: preference.scope, context: preference.context },
      state: 'approved',
      source_id: `creative:${preference.preference_id}`,
      source_revision: null,
    })
    builder.source({ id: `creative:${preference.preference_id}`, revision: null, classification: 'internal', status: 'approved' })
  }
  if (preferences.length === 0) {
    builder.gap('creative', 'creative_preferences', { id: 'creative_preferences', reason: 'not_approved', blocking: false, suggested_question_id: null })
  }
}

/** Builds one pack. `ctx` is the resolved caller; nothing in `args` can change who that is. */
export function buildTaskContext(engine: InterviewEngine, ctx: AuthContext, args: TaskContextArgs): TaskContextResult {
  const config = engine.config()
  const brandSlug = config.brand.slug
  const base = { tool: TASK_CONTEXT_TOOL, brand_id: brandSlug, authorizes: [] as [] }
  const taskType = clean<TaskType>(args.task_type, TASK_TYPES)
  const mode = clean<RequestMode>(args.request_mode, REQUEST_MODES)
  const locale = clean<TaskLocale>(args.locale, TASK_LOCALES)
  const channel = cleanPattern(args.channel, CHANNEL)
  const outputFormat = cleanPattern(args.output_format, OUTPUT_FORMAT)
  const scopeId = cleanPattern(args.scope_id, SERIES_ID)
  const count = cleanCount(args.deliverable_count)
  const log = (decision: 'allow' | 'deny', reason: string, returned: string[] = [], withheld: string[] = []): void => {
    // Ids and fixed metadata only. The request text, if the caller classified one, is never logged.
    appendAccessLog(engine.workspaceRoot(), ctx, {
      tool: TASK_CONTEXT_TOOL,
      kind: 'task',
      requested_ids: taskType ? [taskType] : [],
      returned_ids: returned,
      withheld_ids: withheld,
      query_sha256: null,
      decision,
      reason,
    })
  }

  const access = taskContextAccess(ctx, brandSlug)
  if (!access.allow) {
    log('deny', access.reason)
    return { ...base, status: 'denied', reason: access.reason, data: null }
  }
  if (!taskType || mode === null || locale === null || channel === null || outputFormat === null || scopeId === null || count === null) {
    log('deny', 'invalid')
    return {
      ...base,
      status: 'invalid',
      reason: `task_type is required and must be one of: ${TASK_TYPES.join(', ')}. request_mode is draft, inspect or plan; locale is en, fa or tr; deliverable_count is 1 to ${MAX_DELIVERABLE_COUNT}; channel, output_format and scope_id are short slugs.`,
      data: null,
    }
  }

  const recipe = TASK_RECIPES[taskType]
  const flags: ModuleFlags = { personal: config.modules.personal?.enabled === true, mascot: config.modules.mascot.enabled === true }
  if (recipe.requires_module === 'personal' && !flags.personal) {
    log('deny', 'not_applicable')
    return { ...base, status: 'not_applicable', reason: 'The personal module is off for this brand (modules.personal.enabled). A person is not a company: nothing here is substituted for one.', data: null }
  }

  const at: TaskLocale = locale ?? 'en'
  const text = taskText(at)
  const builder = new Builder()
  addFacts(builder, engine, ctx, flags, recipe)
  if (recipe.tokens) addTokens(builder, engine, ctx)
  addAssets(builder, engine, ctx, recipe.assets)
  if (recipe.mascot_artwork && flags.mascot) addMascotArtwork(builder, engine, ctx)
  const strategyRules = recipe.strategy ? addStrategy(builder, engine, ctx, recipe.strategy) : []
  if (recipe.surface && scopeId) addCreativePreferences(builder, engine, ctx, recipe.surface, scopeId)

  // The caller's own task inputs. Not brand facts, so they carry no source and are labelled owner_stated.
  for (const [key, value] of [
    ['request_mode', mode ?? 'draft'],
    ['locale', at],
    ['channel', channel ?? recipe.surface ?? null],
    ['deliverable_count', count ?? 1],
    ['output_format', outputFormat ?? null],
  ] as Array<[string, PackItem['value']]>) {
    builder.item('production', { key, value, state: 'owner_stated', source_id: null, source_revision: null })
  }

  const claims = builder.sections.production.filter((item) => item.key === 'banned_claims' && item.state === 'approved')
  const guardrails = [
    ...text.notice,
    text.no_substitute,
    ...(recipe.batch ? [text.on_demand] : []),
    ...(builder.notAuthorized ? [text.not_authorized] : []),
    ...claims.map((item) => String(item.value)),
    ...strategyRules,
  ]
    .map((line) => line.slice(0, 600))
    .filter((line, index, all) => line.length > 0 && all.indexOf(line) === index)

  // A gap blocks only when it belongs to an unsatisfied blocking requirement: with the purpose approved, a missing
  // trade name is a gap to report, not a reason to refuse the whole task.
  const unmet = recipe.requires.filter((requirement) => !builder.satisfied(requirement.any_of))
  const blockingKeys = new Set(unmet.filter((requirement) => requirement.blocking === true).flatMap((requirement) => requirement.any_of))
  for (const entry of builder.missing) if (blockingKeys.has(entry.id)) entry.blocking = true
  const blocked = blockingKeys.size > 0
  const ready = unmet.length === 0
  const pack: Omit<TaskContextPack, 'digests'> = {
    schema: TASK_CONTEXT_SCHEMA,
    brand_id: brandSlug,
    task: {
      type: taskType,
      request_mode: mode ?? 'draft',
      channel: channel ?? null,
      locale: at,
      deliverable_count: count ?? 1,
      output_format: outputFormat ?? null,
      scope_id: scopeId ?? null,
    },
    readiness: blocked ? 'blocked' : ready ? 'ready' : 'partial',
    staleness: builder.needsReview ? 'needs_review' : 'current',
    sections: builder.sections,
    guardrails,
    missing: builder.missing,
    redacted: [...new Set(builder.redacted)],
    sources: builder.sources,
    authorizes: [],
    permissions: NO_PERMISSIONS,
  }
  const full: TaskContextPack = { ...pack, digests: { context_sha256: packDigest(pack) } }
  log('allow', `${full.readiness}:${full.staleness}`, full.sources.map((source) => source.id), full.redacted)
  return { ...base, status: 'ok', data: full }
}
