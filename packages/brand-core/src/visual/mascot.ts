import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import type { InterviewEngine } from '../engine.js'
import { frameworkRef } from './frameworks.js'
import type { LogoMasterCandidate } from './identity.js'
import {
  emptyStatusSummary,
  MASCOT_CATEGORIES,
  VISUAL_SCHEMA,
  type BlockBase,
  type MascotArtworkView,
  type MascotAtlasBlock,
  type MascotAtlasEntry,
  type MascotCategory,
  type MascotEvolutionBlock,
  type MascotGapReason,
  type MascotStageSlot,
  type VisualAudience,
  type VisualDocument,
} from './model.js'

/**
 * Mascot atlas and six-stage evolution sheet (Visual Blueprint V3.4). Built from the mascot catalog
 * (`brand/mascot/catalog.yaml`), the stage list (`brand/mascot/stages.yaml`) and the asset manifest, never from
 * prose and never generated. A state or stage is drawn only from approved artwork: the catalog row and the artwork
 * variant are approved (public edition: published), and the asset is approved, checksummed, previewable and not a
 * template example. Everything else is a named gap the renderer draws as a designed placeholder. Draft artwork is
 * never drawn; in the internal edition it is counted as "in review", in the public edition it is not mentioned.
 */

/** A manifest asset the caller (Studio) offers. Same shape as a logo candidate; the builder decides, never guesses. */
export type MascotAssetCandidate = LogoMasterCandidate

export const MASCOT_SHEET_STAGES = 6
const MAX_STATES = 300
const MAX_STAGES = 12
const FRONT_ANGLE = 'mascot.angle.front'
const USABLE = new Set(['approved', 'published'])
const IN_PROGRESS = new Set(['created', 'reviewed'])

type Row = Record<string, unknown>

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null
}

function texts(value: unknown, max: number, count: number): string[] {
  return Array.isArray(value) ? value.map((item) => text(item, max)).filter((item): item is string => item !== null).slice(0, count) : []
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => typeof item === 'object' && item !== null && !Array.isArray(item)) : []
}

function categoryOf(value: unknown): MascotCategory {
  return typeof value === 'string' && (MASCOT_CATEGORIES as readonly string[]).includes(value) ? (value as MascotCategory) : 'other'
}

/** Ranks the gaps so a slot reports the most advanced thing that exists (in review beats nothing drawn). */
const GAP_RANK: Record<MascotGapReason, number> = { not_previewable: 4, in_review: 3, example_only: 2, not_published: 1, not_drawn: 0 }

function better(a: MascotGapReason | null, b: MascotGapReason): MascotGapReason {
  return a === null || GAP_RANK[b] > GAP_RANK[a] ? b : a
}

interface Candidate {
  view: MascotArtworkView
  row_index: number
}

/**
 * One artwork variant: drawable (approved artwork, approved row, approved previewable non-example asset), or the
 * reason it is not. The public edition needs the artwork and the row published, the asset published, and no
 * `draft` tag on the file: a draft-tagged file stays out of public view until it is published without the tag.
 */
function judge(item: Row, rowStatus: string, assets: Map<string, MascotAssetCandidate>, audience: VisualAudience): { view: MascotArtworkView | null; gap: MascotGapReason | null } {
  const status = typeof item.status === 'string' ? item.status : 'defined'
  const asset = assets.get(String(item.asset_id))
  if (status === 'deprecated') return { view: null, gap: null }
  if (asset?.example) return { view: null, gap: 'example_only' }
  if (audience === 'public') {
    const published = status === 'published' && rowStatus === 'published' && asset?.approved && asset.published && !asset.tags.includes('draft')
    if (!published) return { view: null, gap: 'not_published' }
  }
  if (!USABLE.has(status) || !USABLE.has(rowStatus)) return { view: null, gap: IN_PROGRESS.has(status) || USABLE.has(status) ? 'in_review' : null }
  if (!asset || !asset.approved) return { view: null, gap: 'in_review' }
  if (!asset.preview_key || !asset.mime) return { view: null, gap: 'not_previewable' }
  const badges: MascotArtworkView['badges'] = []
  if (audience === 'internal' && asset.tags.includes('draft')) badges.push('draft_tag')
  if (audience === 'internal' && !(status === 'published' && asset.published)) badges.push('internal_only')
  return {
    view: {
      artwork_id: String(item.id).slice(0, 200),
      asset_id: asset.asset_id,
      name: asset.name,
      version: text(item.version, 40) ?? asset.version,
      stage: text(item.stage, 200) ?? 'any',
      angle: text(item.angle, 200),
      preview_key: asset.preview_key,
      mime: asset.mime,
      badges,
    },
    gap: null,
  }
}

/** Front angle first, then catalog order, then artwork id: deterministic, never a judgement about quality. */
function pick(candidates: Candidate[]): Candidate | null {
  const sorted = [...candidates].sort((a, b) => Number(b.view.angle === FRONT_ANGLE) - Number(a.view.angle === FRONT_ANGLE) || a.row_index - b.row_index || a.view.artwork_id.localeCompare(b.view.artwork_id))
  return sorted[0] ?? null
}

function base(input: { block_id: string; filled: number; total: number; sources: string[]; audience: VisualAudience; variant: string; computed_from: string[] }): BlockBase {
  return {
    block_id: input.block_id,
    framework_id: 'MASCOT-MODEL-SHEET',
    data_state: input.total > 0 && input.filled === input.total ? 'complete' : input.filled > 0 ? 'partial' : 'missing',
    sources: input.sources,
    as_of: null,
    computed_from: input.computed_from,
    visibility: input.audience,
    renderer_variant: input.variant,
    layout_constraints: { preserve_topology: false, min_print_pt: 7, print_profile: 'book_a4_portrait' },
  }
}

export interface MascotAtlasInput {
  brand_id: string
  brand_name: string
  audience: VisualAudience
  illustrative: boolean
  /** `modules.mascot.enabled`. */
  enabled: boolean
  /** Rows of `brand/mascot/catalog.yaml` `states` (untrusted; read defensively). */
  states: unknown
  /** Rows of `brand/mascot/stages.yaml` `stages`. */
  stages: unknown
  assets: MascotAssetCandidate[]
}

/** Assembles the atlas document; shared by the repository builder and the illustrative fixture. */
export function mascotAtlasDocument(input: MascotAtlasInput): VisualDocument {
  const assets = new Map(input.assets.map((asset) => [asset.asset_id, asset]))
  const states = input.enabled ? rows(input.states).slice(0, MAX_STATES) : []
  const byStage = new Map<string, Candidate[]>()
  const stageGaps = new Map<string, MascotGapReason>()
  const entries: MascotAtlasEntry[] = []
  states.forEach((state, row_index) => {
    const rowStatus = typeof state.status === 'string' ? state.status : 'defined'
    if (rowStatus === 'deprecated') return
    const drawable: Candidate[] = []
    let gap: MascotGapReason | null = null
    for (const item of rows(state.artwork).slice(0, 50)) {
      const judged = judge(item, rowStatus, assets, input.audience)
      const stage = text(item.stage, 200) ?? 'any'
      if (judged.view) {
        drawable.push({ view: judged.view, row_index })
        if (stage !== 'any') byStage.set(stage, [...(byStage.get(stage) ?? []), { view: judged.view, row_index }])
      } else if (judged.gap) {
        gap = better(gap, judged.gap)
        if (stage !== 'any') stageGaps.set(stage, better(stageGaps.get(stage) ?? null, judged.gap))
      }
    }
    const chosen = pick(drawable)
    const name = text(state.name, 120) ?? text(state.id, 120) ?? '—'
    const fallbackGap: MascotGapReason = input.audience === 'public' ? 'not_published' : 'not_drawn'
    entries.push({
      state_id: String(state.id ?? '').slice(0, 200),
      category: categoryOf(state.category),
      name,
      mvp: state.mvp === true,
      artwork: chosen?.view ?? null,
      variants: Math.max(0, drawable.length - 1),
      gap: chosen ? null : (gap ?? fallbackGap),
      usage: chosen ? text(state.usage, 400) : null,
      do: chosen ? texts(state.do, 300, 8) : [],
      dont: chosen ? texts(state.dont, 300, 8) : [],
    })
  })
  const drawn = entries.filter((entry) => entry.artwork).length
  const inReview = entries.filter((entry) => entry.gap === 'in_review').length
  const atlasSources = [...new Set(entries.flatMap((entry) => (entry.artwork ? [`asset:${entry.artwork.asset_id}`] : [])))]
  const atlas: MascotAtlasBlock = {
    ...base({ block_id: 'mascot-atlas', filled: drawn, total: entries.length, sources: atlasSources, audience: input.audience, variant: 'mascot.atlas.v1', computed_from: ['brand/mascot/catalog.yaml', 'brand/assets/asset-manifest.yaml'] }),
    type: 'mascot_atlas',
    module_enabled: input.enabled,
    entries,
    counts: { states: entries.length, drawn, in_review: inReview, awaiting: entries.length - drawn },
  }

  const recorded = (input.enabled ? rows(input.stages) : [])
    .filter((stage) => text(stage.id, 200) !== null && stage.status !== 'deprecated')
    .map((stage, index) => ({ stage, order: typeof stage.order === 'number' && Number.isFinite(stage.order) ? stage.order : 1000 + index }))
    .sort((a, b) => a.order - b.order)
    .slice(0, MAX_STAGES)
  const slots: MascotStageSlot[] = recorded.map(({ stage }, index) => {
    const id = text(stage.id, 200)!
    const definition: MascotStageSlot['definition'] = stage.configuration === 'example' ? 'example' : typeof stage.status === 'string' && USABLE.has(stage.status) ? 'approved' : 'draft'
    const chosen = pick(byStage.get(id) ?? [])
    const fallbackGap: MascotGapReason = input.audience === 'public' ? 'not_published' : 'not_drawn'
    return {
      order: index + 1,
      stage_id: id,
      name: input.audience === 'public' && definition !== 'approved' ? null : (text(stage.name, 120) ?? id),
      definition,
      summary: definition === 'approved' ? text(stage.summary, 400) : null,
      artwork: chosen?.view ?? null,
      gap: chosen ? null : (stageGaps.get(id) ?? fallbackGap),
    }
  })
  for (let order = slots.length + 1; order <= MASCOT_SHEET_STAGES; order += 1) {
    slots.push({ order, stage_id: null, name: null, definition: 'not_defined', summary: null, artwork: null, gap: input.audience === 'public' ? 'not_published' : 'not_drawn' })
  }
  const stageDrawn = slots.filter((slot) => slot.artwork).length
  const evolution: MascotEvolutionBlock = {
    ...base({
      block_id: 'mascot-evolution',
      filled: stageDrawn,
      total: slots.length,
      sources: [...new Set(slots.flatMap((slot) => (slot.artwork ? [`asset:${slot.artwork.asset_id}`] : [])))],
      audience: input.audience,
      variant: 'mascot.evolution.v1',
      computed_from: ['brand/mascot/stages.yaml', 'brand/mascot/catalog.yaml', 'brand/assets/asset-manifest.yaml'],
    }),
    type: 'mascot_evolution',
    module_enabled: input.enabled,
    slots,
    recorded: recorded.length,
    example_configuration: recorded.some(({ stage }) => stage.configuration === 'example'),
  }
  const summary = emptyStatusSummary()
  summary.approved = drawn
  summary.missing = entries.length - drawn
  return {
    schema: VISUAL_SCHEMA,
    schema_version: 1,
    document_kind: 'mascot_atlas',
    brand_id: input.brand_id,
    brand_name: input.brand_name,
    audience: input.audience,
    illustrative: input.illustrative,
    origin: input.illustrative ? 'illustrative_fixture' : 'brand_repository',
    as_of: null,
    classification: input.audience === 'public' ? 'public' : 'internal',
    print_profile: 'book_a4_portrait',
    status_summary: summary,
    framework_refs: [frameworkRef('MASCOT-MODEL-SHEET')],
    blocks: [atlas, evolution],
  }
}

function readRows(root: string, relative: string, key: string): unknown {
  const file = path.join(root, relative)
  if (!fs.existsSync(file)) return []
  const doc = parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown> | null
  return doc && typeof doc === 'object' ? doc[key] : []
}

/** The atlas for one brand repository and audience. Reads only; writes nothing. */
export function buildMascotAtlas(engine: InterviewEngine, audience: VisualAudience, options: { assets?: MascotAssetCandidate[] } = {}): VisualDocument {
  const root = engine.workspaceRoot()
  const config = engine.config()
  const enabled = config.modules.mascot.enabled === true
  return mascotAtlasDocument({
    brand_id: config.brand.slug,
    brand_name: String(config.brand.name ?? config.brand.slug),
    audience,
    illustrative: false,
    enabled,
    states: enabled ? readRows(root, 'brand/mascot/catalog.yaml', 'states') : [],
    stages: enabled ? readRows(root, 'brand/mascot/stages.yaml', 'stages') : [],
    assets: options.assets ?? [],
  })
}
