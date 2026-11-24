import { appendAccessLog } from '../access-log.js'
import type { AuthContext } from '../auth.js'
import type { InterviewEngine } from '../engine.js'
import { TASK_LOCALES, type TaskLocale, type TaskType } from '../task-context/model.js'
import { runTaskContextTool, type TaskContextToolInput } from '../task-context/agent.js'
import { taskContextAccess } from '../task-context/resolve.js'
import { runVisualDnaTool } from '../visual-dna/agent.js'
import { MAX_ASSET_IDS, type VisualReference } from '../visual-dna/model.js'
import { packAssetIds, PRODUCTION_READINESS_TOOL, productionReadiness, REQUIRABLE_ASSETS, type ProductionReadiness, type RequirableAsset } from './production.js'

/**
 * The one entry point the stdio MCP tool `production_readiness` uses. Pre-render only: it never renders, never reads
 * asset bytes and never sees an artifact (the artifact gate is owner-local, `brand:runtime readiness --batch`).
 *
 * - The caller context comes from the process and is passed in unchanged, to `task_context` and to `visual_dna`
 *   alike: the same identity, never a union of profiles. No input names a brand, role, profile, token or audience.
 * - Access is the `task_context` rule, checked first: guests, unprofiled agents and other brands are denied before
 *   any input is looked at.
 * - The pack is built by `task_context` itself (its own access-log line); asset verdicts come from `visual_dna` (its
 *   own line) when this token may call it, otherwise they are `not_tested`. One more line records this call: ids only.
 * - The request sentence, if given, is classified by `task_context` and dropped, exactly as there.
 */

export interface ProductionToolInput extends TaskContextToolInput {
  required_assets?: unknown
}

export interface ProductionToolRefusal {
  tool: typeof PRODUCTION_READINESS_TOOL
  status: 'denied' | 'invalid' | 'need_task_type' | 'not_applicable'
  brand_id: string
  reason: string
  candidates?: TaskType[]
  data: null
  authorizes: []
}

export type ProductionToolResult = { tool: typeof PRODUCTION_READINESS_TOOL; status: 'ok'; brand_id: string; data: ProductionReadiness; authorizes: [] } | ProductionToolRefusal

export function parseRequiredAssets(value: unknown): RequirableAsset[] | null {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > REQUIRABLE_ASSETS.length) return null
  if (!value.every((entry) => (REQUIRABLE_ASSETS as readonly unknown[]).includes(entry))) return null
  return [...new Set(value as RequirableAsset[])]
}

export function runProductionReadinessTool(engine: InterviewEngine, ctx: AuthContext, input: ProductionToolInput = {}): ProductionToolResult {
  const brandId = engine.config().brand.slug
  const root = engine.workspaceRoot()
  const log = (decision: 'allow' | 'deny', reason: string, requested: string[] = [], returned: string[] = []): boolean => {
    try {
      appendAccessLog(root, ctx, { tool: PRODUCTION_READINESS_TOOL, kind: 'task', requested_ids: requested, returned_ids: returned, withheld_ids: [], query_sha256: null, decision, reason })
      return true
    } catch {
      return false
    }
  }
  const refuse = (status: ProductionToolRefusal['status'], reason: string, extra: Partial<ProductionToolRefusal> = {}): ProductionToolRefusal => ({ tool: PRODUCTION_READINESS_TOOL, status, brand_id: brandId, reason, ...extra, data: null, authorizes: [] })

  const access = taskContextAccess(ctx, brandId)
  if (!access.allow) {
    log('deny', access.reason)
    return refuse('denied', access.reason)
  }
  const { required_assets: requiredInput, ...taskInput } = input
  const required = parseRequiredAssets(requiredInput)
  if (required === null) {
    log('deny', 'invalid')
    return refuse('invalid', `required_assets is a list of: ${REQUIRABLE_ASSETS.join(', ')}.`)
  }

  const built = runTaskContextTool(engine, ctx, taskInput, { taskTypeHint: 'task_type' })
  if (built.status === 'need_task_type') {
    log('deny', 'need_task_type')
    return refuse('need_task_type', built.reason, { candidates: built.candidates })
  }
  if (built.status !== 'ok' || !built.data) {
    log('deny', built.status)
    return refuse(built.status === 'ok' ? 'invalid' : built.status, built.reason ?? built.status)
  }
  const pack = built.data
  const locale: TaskLocale = (TASK_LOCALES as readonly unknown[]).includes(taskInput.locale) ? (taskInput.locale as TaskLocale) : pack.task.locale

  // Asset verdicts through visual_dna with the same caller. Metadata only; bytes never leave the owner's process.
  const ids = packAssetIds(pack).slice(0, MAX_ASSET_IDS)
  let references: VisualReference[] | null = null
  if (ids.length > 0) {
    const dna = runVisualDnaTool(engine, ctx, { asset_ids: ids, locale })
    references = dna.status === 'ok' ? dna.references : null
  } else references = []

  const data = productionReadiness({ pack, locale, required_assets: required, references })
  if (!log('allow', `production:${data.production_ready}`, [pack.task.type], data.blockers.map((blocker) => blocker.check_id))) {
    return refuse('denied', 'access log unavailable')
  }
  return { tool: PRODUCTION_READINESS_TOOL, status: 'ok', brand_id: brandId, data, authorizes: [] }
}
