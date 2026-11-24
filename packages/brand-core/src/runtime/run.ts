import fs from 'node:fs'
import path from 'node:path'
import { effectiveModelUse } from '@brand-os/asset-catalog'
import { AGENT_TOKEN_ENV } from '../agent-tokens.js'
import { operatorContext } from '../auth.js'
import type { CoachSource } from '../coach/model.js'
import { InterviewEngine } from '../engine.js'
import { canonicalJson, sha256Hex } from '../strategy/model.js'
import { TASK_CONTEXT_SCHEMA, verifyPack, type TaskContextPack } from '../task-context/model.js'
import { ASSET_ID_PATTERN, MAX_ASSET_IDS, VisualDnaError, type VisualReference } from '../visual-dna/model.js'
import { readVerifiedAsset, type VerifiedAsset } from '../visual-dna/deliver.js'
import { resolveVisualDna } from '../visual-dna/resolve.js'
import { assuranceLayer, coachLayer, postChecks, setChecks } from './gate.js'
import {
  POST_FORMAT,
  RUNTIME_BATCH_SCHEMA,
  RUNTIME_PERMISSIONS,
  RUNTIME_POST_SCHEMA,
  RUNTIME_RENDERER,
  RUNTIME_RENDERER_VERSION,
  RuntimeError,
  SOCIAL_BATCH_COUNT,
  type BatchSummary,
  type CheckResult,
  type LayerReport,
  type PostManifest,
  type UsedAsset,
  type UsedSource,
} from './model.js'
import type { Outliner } from './outline.js'
import { assertPackShape } from './pack.js'
import { planSocialBatch } from './plan.js'
import { packAssetIds } from './production.js'
import { logoMarkup, renderPost, type EmbeddedLogo } from './render.js'

export interface ApprovedLogo {
  asset_id: string
  source_revision: string | null
  checksum_sha256: string
  model_use: UsedAsset['model_use']
  svg: string
}

export interface SocialBatchOptions {
  /** True only for the synthetic demo brand; stamps every post and the summary. */
  demo: boolean
  demoBanner?: string | null
  /** The approved logo, already read through `loadApprovedLogo`. Absent: posts carry no logo. */
  logo?: ApprovedLogo | null
  /**
   * Every logo `loadApprovedLogo` considered (its `considered`). Those not embedded are listed in each post manifest
   * with their reason code, so a withheld, changed or unpinned logo is visible instead of silently absent.
   */
  logoConsidered?: UsedAsset[] | null
  /** The owner-local coach source (the interview engine). Absent: the coach is reported as not called. */
  coach?: CoachSource | null
  /** The clock for the coach and the assessment. Injected so a run is reproducible. */
  now: Date
  /** Where the pack came from: the synthetic demo, or a pack file from `brand:query --tool task_context`. */
  origin?: 'demo' | 'pack_file'
  /**
   * Final export: convert text to outlines with the owner's font files (`createOutliner`). Absent: drafts keep live,
   * editable text. Final mode needs an approved type scale, so the outlined families are the approved ones.
   */
  final?: Outliner | null
}

export interface SocialBatchResult {
  /** Relative path → file text. Nothing is written until `writeBatch`. */
  files: Map<string, string>
  summary: BatchSummary
  manifests: PostManifest[]
}

const tally = (checks: Array<{ result: CheckResult }>): Record<CheckResult, number> => ({
  pass: checks.filter((entry) => entry.result === 'pass').length,
  warn: checks.filter((entry) => entry.result === 'warn').length,
  fail: checks.filter((entry) => entry.result === 'fail').length,
  not_tested: checks.filter((entry) => entry.result === 'not_tested').length,
})

/**
 * Reads the approved logo the pack names through the Visual DNA resolver (owner decision 6, 2026-11-23): the same
 * verdict `visual_dna` gives (approval for these bytes, rights, licence, size, safe path, no symlink, both SVG gates),
 * then the owner-local `readVerifiedAsset` for the renderer, which hashes and checks the very bytes it returns. The
 * asset must also still be the one the pack pinned: a newer file than the pack saw is `pack_pin_differs`, not used.
 * Anything else returns a reason code and no bytes.
 *
 * Owner-local: it opens the workspace the owner ran the pack in, as the local owner process, and is refused under an
 * agent token. Nothing is sent to a model. The only write is the resolver's own append-only access-log line in
 * `brand/.private/access-log.jsonl`, the audit trail every Visual DNA read leaves.
 */
export function loadApprovedLogo(root: string, pack: TaskContextPack): { logo: ApprovedLogo | null; considered: UsedAsset[]; references: VisualReference[] } {
  const items = Object.values(pack.sections).flat().filter((item) => item.key === 'assets.logo' && item.state === 'approved')
  const considered: UsedAsset[] = []
  const logoIds = items.map((item) => String(((item.value ?? {}) as Record<string, unknown>).id ?? item.source_id)).filter((id) => ASSET_ID_PATTERN.test(id))
  // Logos first, so the cap never drops the asset the renderer needs.
  const assetIds = [...new Set([...logoIds, ...packAssetIds(pack)])].slice(0, MAX_ASSET_IDS)
  if (items.length === 0 && assetIds.length === 0) return { logo: null, considered, references: [] }
  const ownerLocal = !process.env[AGENT_TOKEN_ENV]
  const engine = ownerLocal ? new InterviewEngine(root) : null
  const sameBrand = engine !== null && engine.config().brand.slug === pack.brand_id
  const ctx = sameBrand ? operatorContext(pack.brand_id) : null
  // Every approved asset of the pack, not only the logos: the same ids `brand:runtime readiness --root` resolves, so the
  // production-readiness.json a social-batch run writes has the same asset verdicts as that command.
  const references = engine && ctx ? resolveVisualDna(engine, ctx, { asset_ids: assetIds }).references : []
  let logo: ApprovedLogo | null = null
  for (const item of items) {
    const value = (item.value ?? {}) as Record<string, unknown>
    const assetId = String(value.id ?? item.source_id)
    const pinned = typeof value.checksum_sha256 === 'string' ? value.checksum_sha256 : null
    const base = { asset_id: assetId, source_revision: item.source_revision, checksum_sha256: pinned, model_use: effectiveModelUse(value), sent_to_model: false as const }
    const skip = (reason: string): void => {
      considered.push({ ...base, embedded: false, not_embedded_reason: reason })
    }
    if (logo) {
      skip('one_logo_per_post')
      continue
    }
    if (!ASSET_ID_PATTERN.test(assetId)) {
      skip('visual_dna:invalid:asset_id')
      continue
    }
    if (!engine || !ctx) {
      skip(ownerLocal ? 'visual_dna:other_brand' : 'visual_dna:owner_only')
      continue
    }
    const ref = references.find((entry) => entry.asset_id === assetId)
    if (!ref) {
      skip('visual_dna:missing:not_found')
      continue
    }
    if (ref.state !== 'approved' || !ref.asset) {
      skip(`visual_dna:${ref.state}:${ref.reason ?? 'unknown'}`)
      continue
    }
    if (!pinned || ref.asset.checksum_sha256 !== pinned) {
      skip('visual_dna:changed:pack_pin_differs')
      continue
    }
    if (!ref.asset.path.toLowerCase().endsWith('.svg')) {
      skip('not_svg')
      continue
    }
    let delivered: VerifiedAsset
    try {
      delivered = readVerifiedAsset(engine, ctx, assetId, 'renderer')
    } catch (error) {
      if (error instanceof VisualDnaError) {
        skip(`visual_dna_read:${error.code}`)
        continue
      }
      throw error
    }
    if (delivered.sha256 !== pinned) {
      skip('visual_dna:changed:pack_pin_differs')
      continue
    }
    logo = { asset_id: assetId, source_revision: item.source_revision, checksum_sha256: pinned, model_use: ref.model_use, svg: delivered.bytes.toString('utf8') }
    considered.push({ ...base, model_use: ref.model_use, embedded: true, not_embedded_reason: null })
  }
  return { logo, considered, references }
}

/** One warning per Coach result that is not `ready`: the status and finding codes only, never answer text. */
export function coachWarnings(layer: LayerReport): BatchSummary['warnings'] {
  if (layer.layer !== 'coach' || !layer.called) return []
  return layer.results
    .filter((entry) => entry.status !== 'ready')
    .map((entry) => ({
      layer: 'coach' as const,
      question_id: typeof entry.question_id === 'string' ? entry.question_id : null,
      status: String(entry.status),
      codes: Array.isArray(entry.codes) ? entry.codes.map(String) : [],
      blocks: false as const,
    }))
}

function dedupeSources(sources: Array<UsedSource | null>): UsedSource[] {
  const out: UsedSource[] = []
  for (const source of sources) if (source && !out.some((entry) => entry.source_id === source.source_id)) out.push(source)
  return out
}

/** Pack in, ten SVG drafts + manifests + summary out, in memory. Deterministic for the same pack and options. */
export function runSocialBatch(pack: TaskContextPack, opts: SocialBatchOptions): SocialBatchResult {
  if (pack?.schema !== TASK_CONTEXT_SCHEMA) throw new RuntimeError('invalid_pack', `Expected a ${TASK_CONTEXT_SCHEMA} pack.`)
  assertPackShape(pack)
  if (!verifyPack(pack)) throw new RuntimeError('invalid_pack', 'The pack digest does not verify: it changed after task_context built it. Build a new pack.')
  if (pack.task.type !== 'social_batch') throw new RuntimeError('wrong_task', `This runtime slice renders social_batch packs only (got ${pack.task.type}).`)
  if (pack.task.deliverable_count !== SOCIAL_BATCH_COUNT) throw new RuntimeError('wrong_task', `This slice renders exactly ${SOCIAL_BATCH_COUNT} posts (the pack asks for ${pack.task.deliverable_count}).`)
  if (pack.authorizes.length !== 0 || Object.values(pack.permissions).some(Boolean)) throw new RuntimeError('invalid_pack', 'A pack never authorizes anything.')

  const plan = planSocialBatch(pack)
  if (opts.final && plan.posts.length > 0 && !plan.type.applied) {
    throw new RuntimeError('refused', 'Final export outlines the approved type, and this pack has no approved brand.type.scale. Drafts (without --final) still render.')
  }
  const finalFamilies = [...new Set(Object.values(plan.type.slots).map((slot) => slot.family_stack[0]!))].sort()
  const exportInfo: PostManifest['export'] = opts.final ? opts.final.report() : { mode: 'draft', text: 'live', outliner: null, fonts: [] }
  const typography = (headline: { start: number; size: number; reduced: boolean }): PostManifest['typography'] => ({
    applied: plan.type.applied,
    canvas_scale: plan.type.canvas_scale,
    slots: plan.type.slots,
    headline: { start_px: headline.start, drawn_px: headline.size, reduced_to_fit: headline.reduced },
  })
  const packSha = pack.digests.context_sha256!
  const embedded: EmbeddedLogo | null = opts.logo ? logoMarkup(opts.logo.asset_id, opts.logo.svg) : null
  const logoAssets: UsedAsset[] = [
    ...(opts.logo
      ? [{ asset_id: opts.logo.asset_id, source_revision: opts.logo.source_revision, checksum_sha256: opts.logo.checksum_sha256, model_use: opts.logo.model_use, sent_to_model: false as const, embedded: embedded !== null, not_embedded_reason: embedded ? null : 'no_viewbox' }]
      : []),
    ...(opts.logoConsidered ?? []).filter((asset) => !asset.embedded && asset.asset_id !== opts.logo?.asset_id).map((asset) => ({ ...asset, embedded: false, sent_to_model: false as const })),
  ]

  const files = new Map<string, string>()
  const manifests: PostManifest[] = []
  for (const post of plan.posts) {
    const draft = renderPost(plan, post, { demo: opts.demo, logo: embedded })
    const rendered = opts.final ? { ...draft, svg: opts.final.outline(draft.svg, finalFamilies) } : draft
    const sha256 = sha256Hex(rendered.svg)
    const file = `posts/${post.post_id}.svg`
    const manifest: PostManifest = {
      schema: RUNTIME_POST_SCHEMA,
      post_id: post.post_id,
      index: post.index,
      brand_id: pack.brand_id,
      demo: opts.demo,
      state: 'draft',
      locale: plan.locale,
      direction: plan.direction,
      angle: post.angle,
      layout: post.layout,
      format: POST_FORMAT,
      file,
      sha256,
      bytes: Buffer.byteLength(rendered.svg, 'utf8'),
      renderer: { name: RUNTIME_RENDERER, version: RUNTIME_RENDERER_VERSION, model: null, network: false },
      context: { pack_schema: pack.schema, pack_sha256: packSha, task_type: 'social_batch' },
      sources: dedupeSources([post.message_source, post.brand_source, post.cta_source, plan.palette.source, plan.type.source, ...plan.type.weight_sources]),
      assets: logoAssets,
      typography: typography(rendered.headline),
      export: exportInfo,
      checks: postChecks(pack, plan, post, rendered),
      human_review_required: true,
      authorizes: [],
      permissions: RUNTIME_PERMISSIONS,
    }
    files.set(file, rendered.svg)
    files.set(`posts/${post.post_id}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`)
    manifests.push(manifest)
  }

  const usedQuestionIds = [...new Set(manifests.flatMap((manifest) => manifest.sources.map((source) => source.source_id)))].filter((id) => /^[a-z]+\.[a-z_]+\.[a-z_]+$/.test(id)).sort()
  const blockers = [...plan.blockers]
  const set = setChecks(
    pack,
    manifests.map((manifest, i) => ({ post: plan.posts[i]!, sha256: manifest.sha256 })),
  )
  const layers = [coachLayer(opts.coach ?? null, usedQuestionIds, opts.now), assuranceLayer(pack, pack.brand_id, opts.now, opts.demo)]
  // Coach findings are advice about the answers behind the copy. They are surfaced as warnings and never block a draft
  // (owner decision 4); `status` depends only on the plan's blockers and the post count.
  const warnings = coachWarnings(layers[0]!)
  const batchSha = sha256Hex(canonicalJson(manifests.map((manifest) => ({ post_id: manifest.post_id, sha256: manifest.sha256 }))))
  const summary: BatchSummary = {
    schema: RUNTIME_BATCH_SCHEMA,
    job_id: `social-batch-${packSha.slice(0, 12)}`,
    brand_id: pack.brand_id,
    demo: opts.demo,
    demo_banner: opts.demo ? (opts.demoBanner ?? null) : null,
    task: { type: 'social_batch', channel: 'instagram', locale: plan.locale, requested_count: pack.task.deliverable_count },
    status: blockers.length > 0 || manifests.length !== SOCIAL_BATCH_COUNT ? 'blocked' : 'drafted',
    blockers,
    warnings,
    context: {
      origin: opts.origin ?? (opts.demo ? 'demo' : 'pack_file'),
      pack_schema: pack.schema,
      pack_sha256: packSha,
      pack_readiness: pack.readiness,
      pack_staleness: pack.staleness,
      pack_verified: true,
      missing: pack.missing.map((entry) => entry.id),
    },
    posts: manifests.map((manifest) => ({
      post_id: manifest.post_id,
      file: manifest.file,
      manifest: `posts/${manifest.post_id}.manifest.json`,
      sha256: manifest.sha256,
      angle: manifest.angle,
      layout: manifest.layout,
      checks: tally(manifest.checks),
    })),
    set_checks: set,
    layers,
    advisory: {
      visual_review: 'not_tested',
      semantic_review: 'not_tested',
      note: 'No model reviewed these drafts. Taste, clarity and brand feel need a person; nothing here is a quality score.',
    },
    batch_sha256: batchSha,
    human_review_required: true,
    authorizes: [],
    permissions: RUNTIME_PERMISSIONS,
  }
  files.set('batch-summary.json', `${JSON.stringify(summary, null, 2)}\n`)
  return { files, summary, manifests }
}

/**
 * Writes a batch into `outDir` and nowhere else. Refuses a directory that is not empty, a symlinked directory, and any
 * directory inside a `brand/` tree (an output is never a brand file). Every path is checked to stay under `outDir`.
 */
export function writeBatch(outDir: string, result: SocialBatchResult): string[] {
  const target = path.resolve(outDir)
  const insideBrand = (dir: string): boolean => dir.split(path.sep).includes('brand')
  const refuseBrand = (): never => {
    throw new RuntimeError('unsafe_output', 'The output directory may not be inside a brand/ folder.')
  }
  if (insideBrand(target)) refuseBrand()
  const lstat = (file: string): fs.Stats | null => {
    try {
      return fs.lstatSync(file)
    } catch {
      return null
    }
  }
  const stat = lstat(target)
  if (stat) {
    // lstat, not exists: a dangling link is still a link, and is refused like any other.
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new RuntimeError('unsafe_output', 'The output path must be a real directory.')
    if (fs.readdirSync(target).length > 0) throw new RuntimeError('unsafe_output', 'The output directory must be empty. Nothing was overwritten.')
  }
  // A linked parent must not lead into a brand/ folder either: resolve the nearest existing ancestor before anything
  // is created, and check the real path of the directory again once it exists.
  let existing = target
  while (!lstat(existing) && path.dirname(existing) !== existing) existing = path.dirname(existing)
  let realExisting: string
  try {
    realExisting = fs.realpathSync(existing)
  } catch {
    throw new RuntimeError('unsafe_output', 'The output path goes through a broken link.')
  }
  if (insideBrand(path.join(realExisting, path.relative(existing, target)))) refuseBrand()
  fs.mkdirSync(target, { recursive: true })
  const real = fs.realpathSync(target)
  if (insideBrand(real)) refuseBrand()
  const written: string[] = []
  for (const [relative, text] of [...result.files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const full = path.resolve(real, relative)
    if (!full.startsWith(`${real}${path.sep}`)) throw new RuntimeError('unsafe_output', `Refusing to write outside the output directory: ${relative}`)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, text, { flag: 'wx' })
    written.push(relative)
  }
  return written
}
