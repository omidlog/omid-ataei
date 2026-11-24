import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { checkSvg, effectiveModelUse, svgPublicationIssues, type ModelUse } from '@brand-os/asset-catalog'
import { canonicalJson, sha256Hex } from '../strategy/model.js'
import { verifyPack, type TaskContextPack, type TaskLocale, type TaskType } from '../task-context/model.js'
import { ASSET_ID_PATTERN, type ReferenceReason, type ReferenceState, type VisualReference } from '../visual-dna/model.js'
import { bannedRules, copyClaimConflicts } from './gate.js'
import { POST_FORMAT, RUNTIME_PERMISSIONS, RUNTIME_RENDERER, RUNTIME_RENDERER_VERSION, RuntimeError, SOCIAL_BATCH_COUNT, type BatchSummary, type CheckResult, type PostManifest, type ReportedCheck } from './model.js'
import { planSocialBatch } from './plan.js'
import { productionText, type ProductionCheckId, type ProductionVerdict } from './production-i18n.js'

/**
 * Production readiness (fixes pack PR-E, GAP-05). Guide: `docs-internal/BRAND_RUNTIME.md` § Production readiness.
 * Contract: `schemas/production-readiness.schema.json`.
 *
 * A SEPARATE projection over a `task_context` pack. It never changes `TaskContextPack.readiness`, which stays a
 * statement about context only: a pack can be `ready` while production is `not_ready` (no renderer for the task, a
 * required logo missing), and the projection says which.
 *
 * It owns no rule. Each check is a call into the layer that already owns it, and names that owner:
 *
 * | check | rule owner | hard |
 * | --- | --- | --- |
 * | `context.pack_integrity` | `task-context.pack` (`verifyPack`) | yes |
 * | `context.readiness`, `context.staleness` | `task-context.pack` (as built) | `blocked` only |
 * | `context.source_drift` | `task-context.pack` (`packSourceDrift`) | yes, only with `--root` (owner-local) |
 * | `renderer.available`, `output.format` | `runtime.renderers` (this file's registry) | yes |
 * | `plan.copy` | `runtime.plan` (`planSocialBatch` blockers) | yes |
 * | `copy.claims` | `content-bridge.claims` (`claimConflicts`) | yes |
 * | `asset.reference` | `visual-dna.resolver` | no: optional assets never block |
 * | `asset.required_logo` | `owner.task_input` + `visual-dna.resolver` | yes, only when the owner required it |
 * | `artifact.*`, lifted runtime checks | `asset-catalog`, `runtime.manifest`, `content-bridge.claims`, … | see `HARD_RUNTIME_CHECKS` |
 * | `coach.advice` | `strategic-coach` | no: advice |
 * | `review.*` | `human` | no: `needs_human_review` / `not_tested` |
 *
 * `production_ready: ready` means only "no deterministic blocker was found". It is not an approval and not a quality
 * verdict, carries no score, and human review is always required. Nothing here reads or returns asset bytes: asset
 * verdicts are Visual DNA metadata (owner decision 5, 2026-11-23).
 */

export const PRODUCTION_READINESS_SCHEMA = 'brand-os/production-readiness/v1' as const
export const PRODUCTION_READINESS_TOOL = 'production_readiness' as const

/** Assets the owner may mark as must-have for one task. A task input, never a brand fact. */
export const REQUIRABLE_ASSETS = ['logo'] as const
export type RequirableAsset = (typeof REQUIRABLE_ASSETS)[number]

export type RuleOwner =
  | 'task-context.pack'
  | 'runtime.renderers'
  | 'runtime.plan'
  | 'runtime.manifest'
  | 'content-bridge.claims'
  | 'visual-dna.resolver'
  | 'owner.task_input'
  | 'asset-catalog.svg-check'
  | 'asset-catalog.publication'
  | 'asset-catalog.normalize'
  | 'design-tokens.contrast'
  | 'strategic-coach'
  | 'human'

/** One verdict: which rule, whose rule, over what input, and whether it stops production. */
export interface GateCheck {
  check_id: ProductionCheckId
  rule_owner: RuleOwner
  /** What was checked, as ids and counts only (`pack:<sha12>`, `asset:<id>`, `posts:10`). Never brand text. */
  input: string
  verdict: ProductionVerdict
  /** A hard rule: its failure blocks production. Soft rules warn or ask for a person. */
  hard: boolean
  /** True when this result stops production. Only a hard rule can block. */
  blocks: boolean
  evidence: string[]
  label: string
}

/**
 * The renderers this repository actually ships, and exactly what each can produce. A task type with no entry is a
 * brief, not an artifact: production is `not_ready` with `renderer.available: fail` (GAP-05).
 */
export interface RendererSpec {
  task_type: TaskType
  name: string
  version: string
  /** Output-format slugs a `task_context` request may name for this renderer (null = unspecified is fine). */
  output_formats: string[]
  formats: Array<typeof POST_FORMAT>
  channels: string[]
  deliverable_count: number
  model: null
  network: false
}

export const RENDERERS: readonly RendererSpec[] = Object.freeze([
  {
    task_type: 'social_batch',
    name: RUNTIME_RENDERER,
    version: RUNTIME_RENDERER_VERSION,
    output_formats: ['svg', POST_FORMAT.id],
    formats: [POST_FORMAT],
    channels: ['instagram'],
    deliverable_count: SOCIAL_BATCH_COUNT,
    model: null,
    network: false,
  },
])

/**
 * Runtime checks that are objective and block when they fail: an unsafe SVG, a wrong format or count, a banned claim,
 * a pack that does not verify. Every other runtime `fail` (contrast below the WCAG-informed threshold, duplicates) is
 * reported as `needs_human_review`, never silently passed and never a hard block.
 */
export const HARD_RUNTIME_CHECKS: ReadonlySet<string> = new Set(['svg.allowlist', 'svg.publication_gate', 'post.format', 'copy.claims', 'pack.digest', 'set.count'])

export interface AssetVerdict {
  asset_id: string
  role: string
  required: boolean
  state: ReferenceState | 'not_tested'
  reason: ReferenceReason | 'pack_pin_differs' | 'not_resolved' | null
  pinned_sha256: string | null
  current_sha256: string | null
  model_use: ModelUse
  delivery: 'metadata_only' | 'none'
}

export interface ProductionReadiness {
  schema: typeof PRODUCTION_READINESS_SCHEMA
  tool: typeof PRODUCTION_READINESS_TOOL
  status: 'ok'
  brand_id: string
  locale: TaskLocale
  direction: 'ltr' | 'rtl'
  stage: 'pre_render' | 'artifact'
  production_ready: 'ready' | 'not_ready'
  meaning: string
  notice: string[]
  task: { type: TaskType; channel: string | null; deliverable_count: number; output_format: string | null; required_assets: RequirableAsset[] }
  /** The pack's own context fields, unchanged. `readiness` keeps its task_context meaning (context only). */
  context: { readiness: TaskContextPack['readiness']; staleness: TaskContextPack['staleness']; pack_sha256: string | null; pack_verified: boolean; missing: string[]; blocking_missing: string[] }
  asset_delivery: { status: 'verified' | 'not_tested'; resolver: 'visual_dna'; transport: 'metadata_only'; references: AssetVerdict[] }
  renderer: { status: 'available' | 'missing'; name: string | null; version: string | null; formats: string[]; model: null; network: false }
  critical_constraints: { required_assets: RequirableAsset[]; banned_claim_rules: number; availability_rule: boolean }
  review: { visual_taste: 'needs_human_review'; visual_similarity: 'not_tested'; semantic: 'not_tested'; human_review_required: true }
  checks: GateCheck[]
  blockers: Array<{ check_id: ProductionCheckId; rule_owner: RuleOwner; input: string; code: string }>
  /** sha256 over the pack digest, stage and every (check_id, input, verdict, blocks). Equal inputs, equal digest. */
  digest: string
  human_review_required: true
  authorizes: []
  permissions: typeof RUNTIME_PERMISSIONS
}

/** A rendered batch: in memory right after `runSocialBatch`, or read back from its output directory. */
export interface BatchArtifacts {
  summary: BatchSummary
  manifests: PostManifest[]
  /** Relative path → file content. Hashed as stored: a Buffer by its bytes, a string as UTF-8. */
  files: Map<string, string | Buffer>
}

export interface ProductionInput {
  pack: TaskContextPack
  locale?: TaskLocale
  required_assets?: RequirableAsset[]
  /** Visual DNA verdicts for the pack's assets under the caller's own context; null when not resolved. */
  references: VisualReference[] | null
  /** Present for the artifact stage. */
  batch?: BatchArtifacts | null
  /**
   * Owner-local only (`--root`): the pack's fact sources whose current approved revision differs from the pinned one
   * (`packSourceDrift`). Undefined or null: not compared, and no check is added. Non-empty blocks: rebuild the pack.
   */
  source_drift?: string[] | null
}

const short = (sha: string | null | undefined): string => (sha ? sha.slice(0, 12) : 'none')
const hashOf = (content: string | Buffer): string => createHash('sha256').update(content).digest('hex')

function packAssets(pack: TaskContextPack): Array<{ id: string; role: string; pinned: string | null; model_use: ModelUse }> {
  const out: Array<{ id: string; role: string; pinned: string | null; model_use: ModelUse }> = []
  for (const item of Object.values(pack.sections).flat()) {
    if (!item.key.startsWith('assets.') || item.state !== 'approved') continue
    const value = (item.value ?? {}) as Record<string, unknown>
    const id = String(value.id ?? item.source_id ?? '')
    if (!id || out.some((entry) => entry.id === id)) continue
    out.push({ id, role: item.key.slice('assets.'.length), pinned: typeof value.checksum_sha256 === 'string' ? value.checksum_sha256 : null, model_use: effectiveModelUse(value) })
  }
  return out
}

/**
 * The asset ids of a pack that Visual DNA should resolve, in pack order. Only ids `visual_dna` accepts: one id it would
 * refuse (a manifest id with a space or a slash) must not void the verdicts of every other asset. Such an asset stays
 * `not_tested`, which blocks only when it is a required logo.
 */
export function packAssetIds(pack: TaskContextPack): string[] {
  return packAssets(pack)
    .map((asset) => asset.id)
    .filter((id) => ASSET_ID_PATTERN.test(id))
}

function assetVerdicts(pack: TaskContextPack, references: VisualReference[] | null, required: RequirableAsset[]): AssetVerdict[] {
  return packAssets(pack).map((asset) => {
    const isRequired = (required as string[]).includes(asset.role)
    const ref = references?.find((entry) => entry.via === 'asset' && entry.asset_id === asset.id)
    if (!references || !ref) {
      return { asset_id: asset.id, role: asset.role, required: isRequired, state: 'not_tested', reason: 'not_resolved', pinned_sha256: asset.pinned, current_sha256: null, model_use: asset.model_use, delivery: 'none' }
    }
    const current = ref.asset?.checksum_sha256 ?? null
    const stalePin = ref.state === 'approved' && current !== asset.pinned
    return {
      asset_id: asset.id,
      role: asset.role,
      required: isRequired,
      state: stalePin ? 'changed' : ref.state,
      reason: stalePin ? 'pack_pin_differs' : ref.reason,
      pinned_sha256: asset.pinned,
      current_sha256: current,
      model_use: ref.model_use,
      delivery: ref.delivery,
    }
  })
}

/** Builds the projection. Pure: no file is read, nothing is written, nothing is sent anywhere. */
export function productionReadiness(input: ProductionInput): ProductionReadiness {
  const { pack, batch } = input
  const locale = input.locale ?? pack.task.locale
  const text = productionText(locale)
  const required = [...new Set(input.required_assets ?? [])].filter((entry) => (REQUIRABLE_ASSETS as readonly string[]).includes(entry)).sort() as RequirableAsset[]
  const checks: GateCheck[] = []
  const add = (check_id: ProductionCheckId, rule_owner: RuleOwner, inputLabel: string, verdict: ProductionVerdict, hard: boolean, evidence: string[], blocksOverride?: boolean): void => {
    const blocks = blocksOverride ?? (hard && verdict === 'fail')
    checks.push({ check_id, rule_owner, input: inputLabel, verdict, hard, blocks, evidence: evidence.slice(0, 20), label: text.checks[check_id] ?? check_id })
  }
  const packSha = pack.digests?.context_sha256 ?? null
  const packInput = `pack:${short(packSha)}`

  // Context: the pack's own integrity and readiness, as task_context built them.
  const verified = verifyPack(pack)
  add('context.pack_integrity', 'task-context.pack', packInput, verified ? 'pass' : 'fail', true, [`context_sha256:${packSha ?? 'none'}`, `verified:${verified}`])
  const blockingMissing = pack.missing.filter((entry) => entry.blocking).map((entry) => entry.id)
  add('context.readiness', 'task-context.pack', packInput, pack.readiness === 'blocked' ? 'fail' : pack.readiness === 'partial' ? 'warn' : 'pass', true, [`readiness:${pack.readiness}`, ...blockingMissing.map((id) => `blocking_missing:${id}`)])
  add('context.staleness', 'task-context.pack', packInput, pack.staleness === 'current' ? 'pass' : 'warn', false, [`staleness:${pack.staleness}`])
  if (Array.isArray(input.source_drift)) {
    const drift = input.source_drift
    add('context.source_drift', 'task-context.pack', packInput, drift.length > 0 ? 'fail' : 'pass', true, drift.length > 0 ? ['code:stale_pack_sources', ...drift] : [`sources_compared:${pack.sources.length}`])
  }

  // Renderer and format: only what this repository can actually produce.
  const renderer = RENDERERS.find((spec) => spec.task_type === pack.task.type) ?? null
  add('renderer.available', 'runtime.renderers', `task_type:${pack.task.type}`, renderer ? 'pass' : 'fail', true, renderer ? [`renderer:${renderer.name}@${renderer.version}`, 'model:none', 'network:none'] : [`task_type:${pack.task.type}`, 'deliverable:brief_only'])
  if (renderer) {
    const problems: string[] = []
    if (pack.task.deliverable_count !== renderer.deliverable_count) problems.push(`count:${pack.task.deliverable_count}!=${renderer.deliverable_count}`)
    if (pack.task.output_format !== null && !renderer.output_formats.includes(pack.task.output_format)) problems.push(`output_format:${pack.task.output_format}`)
    if (pack.task.channel !== null && !renderer.channels.includes(pack.task.channel)) problems.push(`channel:${pack.task.channel}`)
    add('output.format', 'runtime.renderers', `format:${renderer.formats.map((format) => format.id).join(',')}`, problems.length > 0 ? 'fail' : 'pass', true, problems.length > 0 ? problems : [`format:${POST_FORMAT.id}`, `count:${renderer.deliverable_count}`])
  } else {
    add('output.format', 'runtime.renderers', `output_format:${pack.task.output_format ?? 'none'}`, 'not_tested', true, ['no_renderer'])
  }

  // Copy: the runtime's own plan and the banned-claim guard, over the copy it would draw. Not on a pack that does not
  // verify: its text is not the text task_context built.
  const rendersHere = renderer !== null && verified && !checks.some((check) => check.check_id === 'output.format' && check.verdict === 'fail')
  const plan = rendersHere ? planSocialBatch(pack) : null
  const rules = bannedRules(pack)
  if (!batch) {
    if (plan) {
      add('plan.copy', 'runtime.plan', packInput, plan.blockers.length > 0 ? 'fail' : 'pass', true, plan.blockers.length > 0 ? plan.blockers.map((blocker) => `blocker:${blocker.code}`) : [`messages:${plan.available_messages}`, `posts:${plan.posts.length}`])
      const conflicts = plan.posts.flatMap((post) => copyClaimConflicts(pack, post).conflicts.map((conflict) => `${post.post_id}:${conflict.kind}:${conflict.field}:${conflict.source}`))
      const untested = rules.banned.length === 0 && rules.availability === null
      add('copy.claims', 'content-bridge.claims', `posts:${plan.posts.length}`, plan.posts.length === 0 || untested ? 'not_tested' : conflicts.length > 0 ? 'fail' : 'pass', true, conflicts.length > 0 ? conflicts : [`rules:${rules.banned.length}`, `availability:${rules.availability ?? 'none'}`])
    } else {
      add('plan.copy', 'runtime.plan', packInput, 'not_tested', true, [renderer ? 'pack_not_renderable' : 'no_renderer'])
      add('copy.claims', 'content-bridge.claims', packInput, 'not_tested', true, [renderer ? 'pack_not_renderable' : 'no_renderer'])
    }
  }

  // Assets: Visual DNA verdicts. Optional assets never block; a required logo does.
  const assets = assetVerdicts(pack, input.references, required)
  for (const asset of assets) {
    const verdict: ProductionVerdict = asset.state === 'not_tested' ? 'not_tested' : asset.state === 'approved' ? 'pass' : 'fail'
    add('asset.reference', 'visual-dna.resolver', `asset:${asset.asset_id}`, verdict, false, [`role:${asset.role}`, `state:${asset.state}`, ...(asset.reason ? [`reason:${asset.reason}`] : []), `pinned:${short(asset.pinned_sha256)}`, `current:${short(asset.current_sha256)}`, `required:${asset.required}`])
  }
  if (required.includes('logo')) {
    const logos = assets.filter((asset) => asset.role === 'logo')
    const usable = logos.find((asset) => asset.state === 'approved' && input.references?.find((ref) => ref.via === 'asset' && ref.asset_id === asset.asset_id)?.asset?.path.toLowerCase().endsWith('.svg'))
    if (usable) add('asset.required_logo', 'owner.task_input', `asset:${usable.asset_id}`, 'pass', true, ['required:logo', `asset:${usable.asset_id}`])
    else if (logos.length === 0) add('asset.required_logo', 'owner.task_input', 'role:logo', 'fail', true, ['required:logo', 'code:missing_required_logo'])
    else if (logos.every((asset) => asset.state === 'not_tested')) add('asset.required_logo', 'owner.task_input', 'role:logo', 'not_tested', true, ['required:logo', 'code:required_logo_not_verified', 'resolver:not_run'], true)
    else add('asset.required_logo', 'owner.task_input', 'role:logo', 'fail', true, ['required:logo', 'code:required_logo_unusable', ...logos.map((asset) => `${asset.asset_id}:${asset.state}:${asset.reason ?? 'not_svg'}`)])
  }

  if (batch) artifactChecks(add, pack, batch, required)
  else add('artifact.checks', 'runtime.manifest', 'artifacts:none', 'not_tested', false, ['no_artifact_yet'])

  add('review.visual_taste', 'human', 'artifacts', 'needs_human_review', false, ['method:none', 'score:none'])
  add('review.semantic', 'human', 'copy', 'not_tested', false, ['method:none', 'score:none'])

  const blockers = checks.filter((check) => check.blocks).map((check) => ({ check_id: check.check_id, rule_owner: check.rule_owner, input: check.input, code: blockerCode(check) }))
  const state = blockers.length > 0 ? 'not_ready' : 'ready'
  const stage = batch ? 'artifact' : 'pre_render'
  return {
    schema: PRODUCTION_READINESS_SCHEMA,
    tool: PRODUCTION_READINESS_TOOL,
    status: 'ok',
    brand_id: pack.brand_id,
    locale,
    direction: locale === 'fa' ? 'rtl' : 'ltr',
    stage,
    production_ready: state,
    meaning: text.meaning[state],
    notice: [...text.notice],
    task: { type: pack.task.type, channel: pack.task.channel, deliverable_count: pack.task.deliverable_count, output_format: pack.task.output_format, required_assets: required },
    context: { readiness: pack.readiness, staleness: pack.staleness, pack_sha256: packSha, pack_verified: verified, missing: pack.missing.map((entry) => entry.id), blocking_missing: blockingMissing },
    asset_delivery: { status: input.references ? 'verified' : 'not_tested', resolver: 'visual_dna', transport: 'metadata_only', references: assets },
    renderer: renderer ? { status: 'available', name: renderer.name, version: renderer.version, formats: renderer.formats.map((format) => format.id), model: null, network: false } : { status: 'missing', name: null, version: null, formats: [], model: null, network: false },
    critical_constraints: { required_assets: required, banned_claim_rules: rules.banned.length, availability_rule: rules.availability !== null },
    review: { visual_taste: 'needs_human_review', visual_similarity: 'not_tested', semantic: 'not_tested', human_review_required: true },
    checks,
    blockers,
    digest: sha256Hex(canonicalJson({ pack: packSha, stage, checks: checks.map((check) => [check.check_id, check.input, check.verdict, check.blocks]) })),
    human_review_required: true,
    authorizes: [],
    permissions: RUNTIME_PERMISSIONS,
  }
}

function blockerCode(check: GateCheck): string {
  const code = check.evidence.find((entry) => entry.startsWith('code:'))
  if (code) return code.slice('code:'.length)
  return `${check.check_id}:${check.verdict}`
}

const RESULT_VERDICT = (result: CheckResult, hard: boolean): ProductionVerdict => (result === 'fail' ? (hard ? 'fail' : 'needs_human_review') : result)

type Add = (check_id: ProductionCheckId, rule_owner: RuleOwner, input: string, verdict: ProductionVerdict, hard: boolean, evidence: string[], blocksOverride?: boolean) => void

/** Artifact-stage checks: the batch's own results, lifted with their owner, plus re-checks on the actual bytes. */
function artifactChecks(add: Add, pack: TaskContextPack, batch: BatchArtifacts, required: RequirableAsset[]): void {
  const { summary, manifests, files } = batch
  const packSha = pack.digests?.context_sha256 ?? null
  const posts = `posts:${manifests.length}`

  const unpinned = manifests.filter((manifest) => manifest.context.pack_sha256 !== packSha).map((manifest) => manifest.post_id)
  if (summary.context.pack_sha256 !== packSha) unpinned.unshift('batch-summary')
  add('artifact.pack_pin', 'task-context.pack', `pack:${short(packSha)}`, unpinned.length > 0 ? 'fail' : 'pass', true, unpinned.length > 0 ? unpinned.map((id) => `not_pinned:${id}`) : [`posts:${manifests.length}`, `pack:${short(packSha)}`])

  const listed = summary.posts.map((post) => post.post_id).join(',') === manifests.map((manifest) => manifest.post_id).join(',')
  const wrong: string[] = listed ? [] : ['summary_manifest_mismatch']
  const unsafe: string[] = []
  for (const manifest of manifests) {
    const content = files.get(manifest.file)
    if (content === undefined) {
      wrong.push(`missing:${manifest.post_id}`)
      continue
    }
    const summaryEntry = summary.posts.find((post) => post.post_id === manifest.post_id)
    const actual = hashOf(content)
    if (actual !== manifest.sha256 || summaryEntry?.sha256 !== manifest.sha256) wrong.push(`sha256:${manifest.post_id}`)
    const svg = typeof content === 'string' ? content : content.toString('utf8')
    const structural = checkSvg(svg)
    if (!structural.ok) unsafe.push(...structural.issues.map((issue) => `${manifest.post_id}:${issue.code}`))
    unsafe.push(...svgPublicationIssues(svg).map((issue) => `${manifest.post_id}:${issue.code}`))
  }
  const batchSha = sha256Hex(canonicalJson(manifests.map((manifest) => ({ post_id: manifest.post_id, sha256: manifest.sha256 }))))
  if (batchSha !== summary.batch_sha256) wrong.push('batch_sha256')
  add('artifact.file_sha256', 'runtime.manifest', posts, wrong.length > 0 ? 'fail' : 'pass', true, wrong.length > 0 ? wrong : [`batch_sha256:${short(summary.batch_sha256)}`])
  add('artifact.svg_safety', 'asset-catalog.publication', posts, unsafe.length > 0 ? 'fail' : 'pass', true, unsafe.length > 0 ? [...new Set(unsafe)] : ['issues:0'])

  if (required.includes('logo')) {
    const without = manifests.filter((manifest) => !manifest.assets.some((asset) => asset.embedded)).map((manifest) => manifest.post_id)
    add('artifact.required_logo', 'owner.task_input', posts, without.length > 0 || manifests.length === 0 ? 'fail' : 'pass', true, without.length > 0 ? ['code:missing_required_logo', ...without.map((id) => `no_logo:${id}`)] : manifests.length === 0 ? ['code:missing_required_logo', 'posts:0'] : ['required:logo', `embedded:${manifests.length}`])
  }

  // The runtime's own results, one line per check id, in its owner's terms. A hard check that failed anywhere blocks.
  const byId = new Map<string, { layer: ReportedCheck['layer']; results: CheckResult[]; failed: string[] }>()
  for (const manifest of manifests) {
    for (const check of manifest.checks) {
      const entry = byId.get(check.check_id) ?? { layer: check.layer, results: [], failed: [] }
      entry.results.push(check.result)
      if (check.result === 'fail' || check.result === 'warn') entry.failed.push(`${manifest.post_id}:${check.result}`)
      byId.set(check.check_id, entry)
    }
  }
  const worst = (results: CheckResult[]): CheckResult => (results.includes('fail') ? 'fail' : results.includes('warn') ? 'warn' : results.length > 0 && results.every((result) => result === 'not_tested') ? 'not_tested' : 'pass')
  for (const [id, entry] of byId) {
    const hard = HARD_RUNTIME_CHECKS.has(id)
    add(id as ProductionCheckId, entry.layer as RuleOwner, posts, RESULT_VERDICT(worst(entry.results), hard), hard, entry.failed.length > 0 ? entry.failed : [`results:${entry.results.length}`])
  }
  for (const check of summary.set_checks) {
    const hard = HARD_RUNTIME_CHECKS.has(check.check_id)
    add(check.check_id as ProductionCheckId, check.layer as RuleOwner, 'batch', RESULT_VERDICT(check.result, hard), hard, check.evidence)
  }
  add('plan.copy', 'runtime.plan', 'batch', summary.blockers.length > 0 ? 'fail' : 'pass', true, summary.blockers.length > 0 ? summary.blockers.map((blocker) => `blocker:${blocker.code}`) : [`status:${summary.status}`])

  const coach = summary.layers.find((layer) => layer.layer === 'coach')
  add('coach.advice', 'strategic-coach', coach?.called ? `questions:${coach.results.length}` : 'not_called', !coach?.called ? 'not_tested' : summary.warnings.length > 0 ? 'warn' : 'pass', false, coach?.called ? summary.warnings.map((warning) => `${warning.question_id ?? 'brand'}:${warning.status}`) : [`skipped:${coach?.skipped_reason ?? 'not_requested'}`])
}

/** Upper bounds for reading a batch directory back. A runtime post is a few kilobytes. */
export const MAX_BATCH_FILE_BYTES = 5_000_000
const BATCH_PATH = /^posts\/post-\d{2}\.(svg|manifest\.json)$/

function readInside(root: string, relative: string): Buffer {
  if (relative !== 'batch-summary.json' && !BATCH_PATH.test(relative)) throw new RuntimeError('invalid_batch', `Unexpected file name in the batch: ${relative.slice(0, 80)}`)
  const full = path.resolve(root, relative)
  if (!full.startsWith(`${root}${path.sep}`)) throw new RuntimeError('invalid_batch', 'A batch file points outside the batch directory.')
  let stat: fs.Stats
  try {
    stat = fs.lstatSync(full)
  } catch {
    throw new RuntimeError('invalid_batch', `A batch file is missing: ${relative}`)
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new RuntimeError('invalid_batch', `A batch file must be a regular file, not a link: ${relative}`)
  if (stat.size > MAX_BATCH_FILE_BYTES) throw new RuntimeError('invalid_batch', `A batch file is larger than ${MAX_BATCH_FILE_BYTES} bytes: ${relative}`)
  return fs.readFileSync(full)
}

/**
 * Reads a batch `brand:runtime social-batch` wrote, for the artifact gate. Read-only. Refuses a symlinked directory or
 * file, a name outside the runtime's own layout, an oversized file and malformed JSON. The SVG files are returned as
 * raw bytes so their checksum is the checksum of what is on disk.
 */
export function readBatchDir(dir: string): BatchArtifacts {
  const target = path.resolve(dir)
  if (!fs.existsSync(target) || fs.lstatSync(target).isSymbolicLink() || !fs.statSync(target).isDirectory()) throw new RuntimeError('invalid_batch', 'The batch path must be a real directory.')
  const root = fs.realpathSync(target)
  const json = (relative: string): unknown => {
    try {
      return JSON.parse(readInside(root, relative).toString('utf8'))
    } catch (error) {
      if (error instanceof RuntimeError) throw error
      throw new RuntimeError('invalid_batch', `${relative} is not valid JSON.`)
    }
  }
  const summary = json('batch-summary.json') as BatchSummary
  if (!summary || typeof summary !== 'object' || !Array.isArray(summary.posts) || !summary.context || !Array.isArray(summary.set_checks) || !Array.isArray(summary.layers)) throw new RuntimeError('invalid_batch', 'batch-summary.json is not a runtime batch summary.')
  if (summary.posts.length > SOCIAL_BATCH_COUNT * 5) throw new RuntimeError('invalid_batch', 'The batch lists too many posts.')
  const manifests: PostManifest[] = []
  const files = new Map<string, string | Buffer>()
  for (const post of summary.posts) {
    const manifest = json(String(post.manifest)) as PostManifest
    if (!manifest || typeof manifest !== 'object' || manifest.post_id !== post.post_id || !Array.isArray(manifest.checks) || !Array.isArray(manifest.assets) || !manifest.context) throw new RuntimeError('invalid_batch', `${String(post.manifest)} is not this post's manifest.`)
    manifests.push(manifest)
    files.set(manifest.file, readInside(root, String(manifest.file)))
  }
  return { summary, manifests, files }
}
