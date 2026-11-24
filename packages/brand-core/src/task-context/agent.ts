import type { AuthContext } from '../auth.js'
import type { InterviewEngine } from '../engine.js'
import { classifyTask } from './classify.js'
import { TASK_CONTEXT_TOOL, TASK_LOCALES, TASK_TYPES, type TaskContextResult, type TaskLocale, type TaskType } from './model.js'
import { buildTaskContext, taskContextAccess } from './resolve.js'

/**
 * The one entry point the CLI (`brand:query --tool task_context`) and the stdio MCP tool (`task_context`) share.
 *
 * - The caller context comes from the process (`resolveAgentContext` at startup) and is passed in unchanged. No input
 *   names a brand, role, profile, token or audience, and no second context is built or merged.
 * - Access is checked first, so a guest or a token of another brand gets `denied` before any request is classified.
 * - `request` (the owner's sentence) is classified by the deterministic en/fa/tr classifier and then dropped: it is
 *   not stored, logged, hashed or copied into the result. Explicit inputs win over what the classifier found.
 * - An unclear request returns `need_task_type` with the tied candidates, never a guessed task.
 */
export interface TaskContextToolInput {
  request?: string
  task_type?: string
  channel?: string
  deliverable_count?: number | string
  locale?: string
  request_mode?: string
  output_format?: string
  scope_id?: string
}

export interface TaskContextNeedType {
  tool: typeof TASK_CONTEXT_TOOL
  status: 'need_task_type'
  brand_id: string
  reason: string
  candidates: TaskType[]
  data: null
  authorizes: []
}

export type TaskContextToolResult = TaskContextResult | TaskContextNeedType

export interface TaskContextToolOptions {
  /** How the caller names the task-type input in the `need_task_type` reason: `--task-type` (CLI) or `task_type` (MCP). */
  taskTypeHint?: string
}

export function runTaskContextTool(engine: InterviewEngine, ctx: AuthContext, input: TaskContextToolInput, options: TaskContextToolOptions = {}): TaskContextToolResult {
  const { request, ...rest } = input
  // Denied callers are answered (and access-logged) by buildTaskContext itself, before the request is looked at.
  if (!taskContextAccess(ctx, engine.config().brand.slug).allow) return buildTaskContext(engine, ctx, rest)

  let taskType: unknown = rest.task_type
  let count: unknown = rest.deliverable_count
  let channel: unknown = rest.channel
  let requestLocale: unknown = rest.locale
  const locale = (TASK_LOCALES as readonly string[]).includes(String(rest.locale)) ? (rest.locale as TaskLocale) : undefined
  if (typeof request === 'string' && request.length > 0) {
    const intent = classifyTask(request, locale)
    if (intent.status === 'need_task_type') {
      const hint = options.taskTypeHint ?? 'task_type'
      return {
        tool: TASK_CONTEXT_TOOL,
        status: 'need_task_type',
        brand_id: engine.config().brand.slug,
        reason: `The request does not name one task (${intent.reason}). Ask for the task type instead of guessing: ${hint} ${TASK_TYPES.join('|')}.`,
        candidates: intent.candidates,
        data: null,
        authorizes: [],
      }
    }
    taskType ??= intent.task_type
    count ??= intent.deliverable_count ?? undefined
    channel ??= intent.channel ?? undefined
    // The language the request was written in, when the caller named none: a Persian request gets Persian labels.
    requestLocale ??= intent.locale
  }
  return buildTaskContext(engine, ctx, {
    task_type: taskType,
    request_mode: rest.request_mode,
    channel,
    deliverable_count: count,
    locale: requestLocale,
    output_format: rest.output_format,
    scope_id: rest.scope_id,
  })
}
