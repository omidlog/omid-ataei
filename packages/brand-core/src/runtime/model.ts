import type { ModelUse } from '@brand-os/asset-catalog'
import type { TaskLocale } from '../task-context/model.js'

/**
 * Brand Runtime, first vertical slice: `social_batch` → ten real SVG drafts, a per-post manifest and a batch summary.
 * Guide: `docs-internal/BRAND_RUNTIME.md`. Contracts: `schemas/runtime-post-manifest.schema.json`,
 * `schemas/runtime-batch.schema.json`.
 *
 * The Runtime is an orchestrator. It owns no store, no approval, no quality vocabulary and no brand fact:
 * - context comes from one `task_context` pack (`packages/brand-core/src/task-context`), verified by its digest;
 * - copy on a post is an approved fact from that pack, byte for byte, never generated or translated;
 * - quality results come from the layers that already own them — the SVG checker and normalizer and the
 *   publication gate (`@brand-os/asset-catalog`), the banned-claim guard (`content-bridge/claims.ts`), the
 *   Strategic Coach (`coach/`) and Assurance (`assurance/`). The Runtime calls them and reports what they say.
 *
 * Nothing is published, scheduled, spent, deployed or approved. Every output says so.
 */

export const RUNTIME_POST_SCHEMA = 'brand-os/runtime-post-manifest/v1' as const
export const RUNTIME_BATCH_SCHEMA = 'brand-os/runtime-batch/v1' as const
export const RUNTIME_RENDERER = 'brand-os-svg-post-renderer' as const
export const RUNTIME_RENDERER_VERSION = '1.1.0' as const

/** Instagram portrait post, 4:5. The only format this slice renders. */
export const POST_FORMAT = { id: 'instagram-portrait-1080x1350', width: 1080, height: 1350, media_type: 'image/svg+xml' } as const

/** The bounded batch this slice supports. A different count is refused, not padded or truncated. */
export const SOCIAL_BATCH_COUNT = 10

export const RUNTIME_PERMISSIONS = {
  publish: false,
  schedule: false,
  spend: false,
  deploy: false,
  approve: false,
} as const

/** A context-pack source a post used, pinned by the revision the pack carried. */
export interface UsedSource {
  key: string
  source_id: string
  source_revision: string | null
}

/** An asset the renderer embedded or considered. `sent_to_model` is always false: nothing calls a model. */
export interface UsedAsset {
  asset_id: string
  source_revision: string | null
  checksum_sha256: string | null
  model_use: ModelUse
  sent_to_model: false
  embedded: boolean
  /** Why the asset was not embedded, when it was not. A code, never a path the caller may not see. */
  not_embedded_reason: string | null
}

export type CheckResult = 'pass' | 'warn' | 'fail' | 'not_tested'

/**
 * One check result as reported by the layer that owns it. `layer` names that owner; the Runtime adds no verdict of
 * its own. `evidence` is a short machine-readable property of the artifact or the call (issue codes, a status).
 */
export interface ReportedCheck {
  check_id: string
  layer: 'asset-catalog.svg-check' | 'asset-catalog.publication' | 'asset-catalog.normalize' | 'content-bridge.claims' | 'design-tokens.contrast' | 'task-context.pack' | 'runtime.manifest'
  method: 'deterministic'
  result: CheckResult
  evidence: string[]
}

export interface PostManifest {
  schema: typeof RUNTIME_POST_SCHEMA
  post_id: string
  index: number
  brand_id: string
  demo: boolean
  state: 'draft'
  locale: TaskLocale
  direction: 'ltr' | 'rtl'
  angle: string
  layout: string
  format: typeof POST_FORMAT
  file: string
  sha256: string
  bytes: number
  renderer: { name: typeof RUNTIME_RENDERER; version: typeof RUNTIME_RENDERER_VERSION; model: null; network: false }
  context: { pack_schema: string; pack_sha256: string; task_type: 'social_batch' }
  sources: UsedSource[]
  assets: UsedAsset[]
  /** The type actually drawn: approved scale per slot (or renderer default, labelled), and the headline size used. */
  typography: PostTypography
  /** `draft`: live, editable text. `final`: text converted to outlines with owner-supplied font files (`outline.ts`). */
  export: PostExport
  checks: ReportedCheck[]
  human_review_required: true
  authorizes: []
  permissions: typeof RUNTIME_PERMISSIONS
}

export interface PostTypography {
  applied: boolean
  canvas_scale: number
  slots: Record<'headline' | 'label' | 'body', TypeSlotReport>
  headline: { start_px: number; drawn_px: number; reduced_to_fit: boolean }
}

export interface TypeSlotReport {
  role: string | null
  family_stack: string[]
  appended_generic: boolean
  size_px: number
  line_height: number
  weight: number
  family_source: 'approved' | 'renderer_default'
  size_source: 'approved' | 'renderer_default'
  line_height_source: 'approved' | 'renderer_default'
  weight_source: 'approved_token' | 'renderer_default'
}

export interface PostExport {
  mode: 'draft' | 'final'
  text: 'live' | 'outlined'
  /** The local outliner (no network, no model) and the exact font files it used, by digest. Null in draft mode. */
  outliner: { name: 'resvg-js'; version: string } | null
  fonts: Array<{ file_name: string; sha256: string; families: string[] }>
}

/** A layer the batch called, and what it returned, in its own vocabulary. */
export interface LayerReport {
  layer: 'coach' | 'assurance'
  called: boolean
  /** Why it was not called (`not_owner_process`, `not_requested`), when it was not. */
  skipped_reason: string | null
  results: Array<Record<string, unknown>>
  notes: string[]
}

export interface BatchSummary {
  schema: typeof RUNTIME_BATCH_SCHEMA
  job_id: string
  brand_id: string
  demo: boolean
  demo_banner: string | null
  task: { type: 'social_batch'; channel: 'instagram'; locale: TaskLocale; requested_count: number }
  status: 'drafted' | 'blocked'
  blockers: Array<{ code: string; detail: string }>
  /** Advice that never blocks: Coach results that are not `ready`, by question id, status and finding codes. */
  warnings: Array<{ layer: 'coach'; question_id: string | null; status: string; codes: string[]; blocks: false }>
  context: { origin: 'demo' | 'pack_file'; pack_schema: string; pack_sha256: string; pack_readiness: string; pack_staleness: string; pack_verified: boolean; missing: string[] }
  posts: Array<{ post_id: string; file: string; manifest: string; sha256: string; angle: string; layout: string; checks: Record<CheckResult, number> }>
  set_checks: ReportedCheck[]
  layers: LayerReport[]
  advisory: { visual_review: 'not_tested'; semantic_review: 'not_tested'; note: string }
  batch_sha256: string
  human_review_required: true
  authorizes: []
  permissions: typeof RUNTIME_PERMISSIONS
}

export class RuntimeError extends Error {
  constructor(
    readonly code: 'invalid_pack' | 'wrong_task' | 'unsafe_output' | 'refused' | 'invalid_font' | 'invalid_batch' | 'stale_pack',
    message: string,
  ) {
    super(message)
  }
}
