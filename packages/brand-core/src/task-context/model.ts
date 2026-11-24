import { canonicalJson, sha256Hex } from '../strategy/model.js'

/**
 * The Task Context Pack contract, `brand-os/task-context/v1` (`schemas/task-context.schema.json`).
 *
 * A pack is purpose-specific, read-only context for one task, assembled fresh from the canonical readers on every
 * call. It stores nothing, writes nothing and authorizes nothing: `authorizes` is always `[]` and every permission
 * flag is always `false`. Guide and preflight audit: `docs-internal/TASK_CONTEXT.md`.
 */

export const TASK_CONTEXT_SCHEMA = 'brand-os/task-context/v1' as const
export const TASK_CONTEXT_TOOL = 'task_context' as const

/** The bounded task enum. An unknown or ambiguous request is `need_task_type`, never a guess. */
export const TASK_TYPES = ['visual_design', 'social_batch', 'website_design', 'product_ui', 'paid_campaign_brief', 'brand_identity', 'personal_content'] as const
export type TaskType = (typeof TASK_TYPES)[number]

/** v1 asks for context only. No mode executes, publishes or spends. */
export const REQUEST_MODES = ['draft', 'inspect', 'plan'] as const
export type RequestMode = (typeof REQUEST_MODES)[number]

export const TASK_LOCALES = ['en', 'fa', 'tr'] as const
export type TaskLocale = (typeof TASK_LOCALES)[number]

export const MAX_DELIVERABLE_COUNT = 50
export const MAX_ITEMS_PER_KIND = 24

export type ItemState = 'approved' | 'owner_stated' | 'recommendation' | 'missing' | 'withheld' | 'stale' | 'not_applicable'
export type MissingReason = 'not_answered' | 'not_approved' | 'not_authorized' | 'asset_missing' | 'stale_source' | 'owner_decision' | 'not_applicable'
export type SourceStatus = 'approved' | 'current' | 'stale' | 'missing' | 'withheld' | 'not_applicable'
export type SectionName = 'identity' | 'strategy' | 'creative' | 'production'

/**
 * One piece of context. A key may appear more than once when the field is a set (`voice`, `logo_rules`,
 * `banned_claims`, …): each item then carries its own source. `owner_stated` with `source_id: null` marks an input the
 * caller supplied with the request — a task input, never a brand fact.
 */
export interface PackItem {
  key: string
  value: string | number | boolean | Record<string, unknown> | unknown[] | null
  state: ItemState
  source_id: string | null
  source_revision: string | null
}

export interface PackMissing {
  id: string
  reason: MissingReason
  blocking: boolean
  /** An existing FieldQuestion id the owner can answer. Never a new question. */
  suggested_question_id: string | null
}

export interface PackSource {
  id: string
  revision: string | null
  classification: 'public' | 'internal' | 'restricted'
  status: SourceStatus
}

export interface TaskContextPack {
  schema: typeof TASK_CONTEXT_SCHEMA
  brand_id: string
  task: {
    type: TaskType
    request_mode: RequestMode
    channel: string | null
    locale: TaskLocale
    deliverable_count: number
    output_format: string | null
    scope_id: string | null
  }
  readiness: 'ready' | 'partial' | 'blocked'
  staleness: 'current' | 'needs_review' | 'stale_pin' | 'unknown'
  sections: Record<SectionName, PackItem[]>
  guardrails: string[]
  missing: PackMissing[]
  /** Safe metadata only: ids and field names of what was withheld, never a value. */
  redacted: string[]
  sources: PackSource[]
  digests: { context_sha256: string | null }
  authorizes: []
  permissions: { publish: false; schedule: false; spend: false; deploy: false }
}

export interface TaskContextResult {
  tool: typeof TASK_CONTEXT_TOOL
  status: 'ok' | 'denied' | 'invalid' | 'not_applicable'
  brand_id: string
  reason?: string
  data: TaskContextPack | null
  authorizes: []
}

export const NO_PERMISSIONS = { publish: false, schedule: false, spend: false, deploy: false } as const

/** sha256 over the canonical JSON of the pack without its own digest. Equal sources give an equal digest. */
export function packDigest(pack: Omit<TaskContextPack, 'digests'> & { digests?: unknown }): string {
  const { digests: _ignored, ...rest } = pack
  return sha256Hex(canonicalJson(rest))
}

/** Recomputes the digest of a received pack, so a consumer can detect a pack changed in transit or by hand. */
export function verifyPack(pack: TaskContextPack): boolean {
  return packDigest(pack) === pack.digests.context_sha256
}
