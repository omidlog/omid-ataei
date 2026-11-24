import { contrastRatio } from '@brand-os/design-tokens'
import { latestAnswers } from '../completeness.js'
import { itemFor, type DocumentAudience, type ItemContext } from '../documents/model.js'
import type { InterviewEngine } from '../engine.js'
import { readEvidence } from '../evidence.js'
import { readFacts, type CanonicalFact } from '../facts.js'
import type { StructuredValue } from '../structured.js'
import { entryFromItem } from './bmc.js'
import { frameworkRef } from './frameworks.js'
import {
  emptyStatusSummary,
  VISUAL_SCHEMA,
  type BlockBase,
  type CitationListBlock,
  type ColorPaletteBlock,
  type ContrastPair,
  type LogoConstructionBlock,
  type LogoMaster,
  type LogoSystem,
  type LogoVariant,
  type MissingReason,
  type TypeRole,
  type TypographySpecimenBlock,
  type VisualAudience,
  type VisualDocument,
  type VisualEntry,
} from './model.js'

/**
 * Brand Book "Visual identity" chapter (Visual Blueprint V2.1): colour palette, typography specimen and logo
 * construction. Built through the same truth path as the documents (`itemFor`), but stricter: a specimen is drawn
 * only from an approved fact (or an approved one past its review date, labelled stale) and the logo only from the
 * approved master asset. Drafts, withheld values and gaps leave the block empty; the renderer draws the designed
 * "awaiting approved asset" page instead. Contrast is computed here from the approved hex values, never claimed.
 */

export const IDENTITY_QUESTIONS = { color: 'brand.color.roles', type: 'brand.type.scale', logo: 'brand.logo.min_size' } as const

/** Above this many colours the all-pairs grid stops being legible; the declared combinations are still measured. */
export const CONTRAST_GRID_MAX = 10

/** A manifest asset the caller (Studio) offers as a possible logo master. The builder decides; it never guesses. */
export interface LogoMasterCandidate {
  asset_id: string
  name: string
  version: string | null
  approved: boolean
  /** Approved and listed in the publication policy: only these count in the public edition. */
  published: boolean
  tags: string[]
  /** Template placeholders (tag `example`, an EXAMPLE licence) are never a master. */
  example: boolean
  /** Manifest `path` and `preview` of the asset, matched exactly against the `brand.logo.masters` fact. */
  paths?: string[]
  preview_key: string | null
  mime: string | null
  width: number | null
  height: number | null
}

export interface IdentityOptions {
  now?: Date
  masters?: LogoMasterCandidate[]
}

/** The approved `brand.logo.masters` text, used only to resolve the master; it is never rendered. */
function mastersReference(facts: Record<string, CanonicalFact>): string | null {
  const fact = facts[LOGO_MASTERS_FACT]
  return fact && fact.status === 'approved' && typeof fact.value === 'string' ? fact.value : null
}

const ROUND = (ratio: number) => Math.floor(ratio * 100) / 100

export function measurePair(foreground: { role: string; hex: string }, background: { role: string; hex: string }): ContrastPair {
  const exact = contrastRatio(foreground.hex, background.hex)
  return { foreground: foreground.role, background: background.role, ratio: ROUND(exact), aa_normal: exact >= 4.5, aa_large: exact >= 3, aaa_normal: exact >= 7 }
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Combinations a palette declares by name: `onX` is the text colour for background `x`. Nothing else is inferred. */
export function declaredCombinations(colors: Array<{ role: string; hex: string }>): ContrastPair[] {
  const byRole = new Map(colors.map((color) => [color.role.toLowerCase(), color]))
  const pairs: ContrastPair[] = []
  for (const color of colors) {
    const match = color.role.match(/^on[-_]?([A-Za-z0-9].*)$/)
    if (!match) continue
    const background = byRole.get((match[1] ?? '').toLowerCase())
    if (background && background !== color) pairs.push(measurePair(color, background))
  }
  return pairs
}

export function contrastGrid(colors: Array<{ role: string; hex: string }>): ColorPaletteBlock['grid'] {
  if (colors.length < 2 || colors.length > CONTRAST_GRID_MAX) return null
  return { roles: colors.map((color) => color.role), ratios: colors.map((fg) => colors.map((bg) => ROUND(contrastRatio(fg.hex, bg.hex)))) }
}

function drawable(entry: VisualEntry): boolean {
  return entry.state === 'approved' || entry.state === 'stale'
}

/** Never carry a draft or withheld value into the identity document: it would be one renderer bug from the page. */
function strict(entry: VisualEntry): VisualEntry {
  return drawable(entry) ? entry : { ...entry, value: null }
}

function base(input: { block_id: string; framework_id: string | null; entry: VisualEntry; filled: boolean; audience: VisualAudience; variant: string }): BlockBase {
  return {
    block_id: input.block_id,
    framework_id: input.framework_id,
    data_state: input.filled ? (input.entry.state === 'approved' ? 'complete' : 'partial') : 'missing',
    sources: [...input.entry.sources],
    as_of: drawable(input.entry) ? input.entry.approved_at : null,
    computed_from: [input.entry.id],
    visibility: input.audience,
    renderer_variant: input.variant,
    layout_constraints: { preserve_topology: false, min_print_pt: 7, print_profile: 'book_a4_portrait' },
  }
}

/** The approved fact that names where the master logo lives (free text; asset ids and paths are matched exactly). */
export const LOGO_MASTERS_FACT = 'brand.logo.masters'

/**
 * Tokens of the `brand.logo.masters` free text that could be an asset id or a manifest path. Split on whitespace,
 * quotes, brackets and list punctuation; a trailing sentence `.` or `:` is dropped. Matching is exact, never fuzzy.
 */
export function masterReferenceTokens(text: string | null | undefined): string[] {
  if (typeof text !== 'string' || !text) return []
  const tokens: string[] = []
  for (const raw of text.slice(0, 4000).split(/[\s,;()[\]{}<>"'`|]+/)) {
    const token = raw.replace(/[.:]+$/, '').replace(/^\.\//, '')
    if (token && !tokens.includes(token)) tokens.push(token)
  }
  return tokens
}

/** File name of a manifest path (`brand/assets/logo/x.svg` gives `x.svg`). */
function baseName(file: string): string {
  return file.replace(/^\.\//, '').split('/').pop() ?? ''
}

/**
 * Index of the first token that names this asset: its exact id, an exact manifest `path`/`preview`, or (BOS-16) a bare
 * file name, but only a file name that belongs to exactly one offered asset. A folder, a prefix or a near miss never
 * matches. -1 when the text does not name it.
 */
function referenceIndex(asset: LogoMasterCandidate, tokens: string[], uniqueNames: Set<string> = new Set()): number {
  const paths = (asset.paths ?? []).map((item) => item.replace(/^\.\//, ''))
  const names = [asset.asset_id, ...paths, ...paths.map(baseName).filter((name) => uniqueNames.has(name))].filter(Boolean)
  const hits = names.map((name) => tokens.indexOf(name)).filter((index) => index >= 0)
  return hits.length ? Math.min(...hits) : -1
}

/** File names that belong to exactly one offered asset (a name shared by two files names neither). */
function uniqueBaseNames(candidates: LogoMasterCandidate[]): Set<string> {
  const owners = new Map<string, Set<string>>()
  for (const asset of candidates) {
    for (const file of asset.paths ?? []) {
      const name = baseName(file)
      if (!name.includes('.')) continue
      owners.set(name, (owners.get(name) ?? new Set()).add(asset.asset_id))
    }
  }
  return new Set([...owners].filter(([, ids]) => ids.size === 1).map(([name]) => name))
}

/** Tags that mark the icon / mark of a logo system. */
export const LOGO_ICON_TAGS = ['icon', 'mark', 'logomark', 'favicon'] as const
/** Tags that place a logo file on a light or a dark background. */
export const LOGO_PLATE_TAGS = { on_light: 'on-light', on_dark: 'on-dark' } as const
/** File-name words of the documented convention: dark ink goes on a light plate, light ink on a dark plate. */
const DARK_INK = new Set(['dark', 'black'])
const LIGHT_INK = new Set(['light', 'white', 'reversed', 'reverse', 'inverse', 'inverted', 'negative'])

function nameWords(asset: LogoMasterCandidate): string[] {
  const names = [asset.asset_id.split('.').pop() ?? '', ...(asset.paths ?? []).map((file) => baseName(file).replace(/\.[A-Za-z0-9]+$/, ''))]
  return names.flatMap((name) => name.toLowerCase().split(/[-_.\s]+/)).filter(Boolean)
}

/**
 * The role of a file in the logo system, never guessed beyond two documented rules: a tag (`on-light`, `on-dark`, or
 * one of `icon` / `mark` / `logomark` / `favicon`), else, for a file tagged `logo`, the file-name convention (a name
 * with `dark` or `black` is dark ink for a light plate; `light`, `white`, `reversed`, `inverse` or `negative` is light
 * ink for a dark plate; both or neither: no role).
 */
export function logoVariantRole(asset: Pick<LogoMasterCandidate, 'asset_id' | 'tags' | 'paths'>): { role: LogoVariant['role']; by: LogoVariant['role_by'] } | null {
  const tags = asset.tags.map((tag) => tag.toLowerCase())
  const onLight = tags.includes(LOGO_PLATE_TAGS.on_light)
  const onDark = tags.includes(LOGO_PLATE_TAGS.on_dark)
  if (onLight !== onDark) return { role: onLight ? 'on_light' : 'on_dark', by: 'tag' }
  if (onLight && onDark) return null
  if (LOGO_ICON_TAGS.some((tag) => tags.includes(tag))) return { role: 'icon', by: 'tag' }
  if (!tags.includes('logo')) return null
  const words = nameWords(asset as LogoMasterCandidate)
  const dark = words.some((word) => DARK_INK.has(word))
  const light = words.some((word) => LIGHT_INK.has(word))
  if (dark === light) return null
  return { role: dark ? 'on_light' : 'on_dark', by: 'file_name' }
}

function badgesFor(asset: LogoMasterCandidate, audience: VisualAudience): LogoMaster['badges'] {
  const badges: LogoMaster['badges'] = []
  if (audience === 'internal' && asset.tags.includes('draft')) badges.push('draft_tag')
  if (audience === 'internal' && !asset.published) badges.push('internal_only')
  return badges
}

/** The result of resolving the master logo and the system around it. */
export interface LogoResolution {
  master: LogoMaster | null
  state: LogoConstructionBlock['master_state']
  system: LogoSystem | null
  /** Internal only: the asset ids to choose from when the state is `ambiguous` or `not_previewable`. */
  candidates: string[]
}

/**
 * Picks the master, deterministically and never guessing. Only approved, non-example, previewable assets tagged
 * `logo` qualify; the public edition also needs the asset published. Among those, in order:
 * 1. the assets named in the approved `brand.logo.masters` fact (exact asset id, exact manifest path, or a file name
 *    that belongs to exactly one asset), first named wins;
 * 2. assets tagged `master` (first by id);
 * 3. the only approved logo;
 * 4. a light/dark pair (BOS-16): exactly two approved logos, one for light and one for dark backgrounds (tags
 *    `on-light` / `on-dark`, or the file-name convention): one logo system, the on-light file is the master.
 * Anything else with several approved logos is `ambiguous`, no master. With a master, the system lists the light and
 * dark plates and the icon (see `logoVariantRole`).
 */
export function pickMaster(candidates: LogoMasterCandidate[], audience: VisualAudience, reference: string | null = null): LogoResolution {
  const logos = candidates.filter((asset) => asset.tags.includes('logo'))
  const real = logos.filter((asset) => !asset.example)
  const allowed = (asset: LogoMasterCandidate) => !asset.example && asset.approved && (audience === 'internal' || asset.published)
  const isReady = (asset: LogoMasterCandidate) => Boolean(asset.preview_key && asset.mime)
  const eligible = real.filter(allowed)
  const byId = (a: LogoMasterCandidate, b: LogoMasterCandidate) => a.asset_id.localeCompare(b.asset_id)
  const previewable = (assets: LogoMasterCandidate[]) => assets.filter(isReady).sort(byId)
  const tokens = masterReferenceTokens(reference)
  const unique = uniqueBaseNames(candidates)
  const namedOrder = (assets: LogoMasterCandidate[]) =>
    assets
      .map((asset) => ({ asset, index: referenceIndex(asset, tokens, unique) }))
      .filter((item) => item.index >= 0)
      .sort((a, b) => a.index - b.index || byId(a.asset, b.asset))
      .map((item) => item.asset)
  const ids = (assets: LogoMasterCandidate[]) => (audience === 'internal' ? assets.map((asset) => asset.asset_id).sort() : [])
  const none = (state: LogoConstructionBlock['master_state'], offered: LogoMasterCandidate[] = []): LogoResolution => ({ master: null, state, system: null, candidates: ids(offered) })
  const choose = (chosen: LogoMasterCandidate, resolved_by: LogoMaster['resolved_by']): LogoResolution => {
    const master: LogoMaster = { asset_id: chosen.asset_id, name: chosen.name, version: chosen.version, preview_key: chosen.preview_key!, mime: chosen.mime!, width: chosen.width, height: chosen.height, resolved_by, badges: badgesFor(chosen, audience) }
    return { master, state: 'approved', system: logoSystem(chosen), candidates: [] }
  }
  const variant = (asset: LogoMasterCandidate, role: LogoVariant['role'], by: LogoVariant['role_by']): LogoVariant => ({
    role,
    asset_id: asset.asset_id,
    name: asset.name,
    version: asset.version,
    preview_key: asset.preview_key!,
    mime: asset.mime!,
    width: asset.width,
    height: asset.height,
    role_by: by,
    badges: badgesFor(asset, audience),
  })
  /** One file per role: the master for its own role; else the first named, else the only one. Several: none. */
  const logoSystem = (master: LogoMasterCandidate): LogoSystem | null => {
    const pool = candidates.filter((asset) => allowed(asset) && isReady(asset))
    const pick = (role: LogoVariant['role']): LogoVariant | null => {
      const masterRole = logoVariantRole(master)
      if (role !== 'icon' && masterRole?.role === role) return variant(master, role, masterRole.by)
      const matching = pool.filter((asset) => asset.asset_id !== master.asset_id && logoVariantRole(asset)?.role === role && (role === 'icon' || asset.tags.includes('logo')))
      const chosen = namedOrder(matching)[0] ?? (matching.length === 1 ? matching[0] : undefined)
      return chosen ? variant(chosen, role, logoVariantRole(chosen)!.by) : null
    }
    const system: LogoSystem = { on_light: pick('on_light'), on_dark: pick('on_dark'), icon: pick('icon') }
    return system.on_light || system.on_dark || system.icon ? system : null
  }
  const named = namedOrder(eligible)
  const namedReady = named.filter(isReady)
  if (namedReady[0]) return choose(namedReady[0], 'reference')
  if (named.length) return none('not_previewable', named)
  const tagged = eligible.filter((asset) => asset.tags.includes('master'))
  const taggedReady = previewable(tagged)
  if (taggedReady[0]) return choose(taggedReady[0], 'tag')
  if (tagged.length) return none('not_previewable', tagged)
  const ready = previewable(eligible)
  if (ready.length === 1) return choose(ready[0]!, 'sole_logo')
  if (ready.length === 2) {
    const roles = ready.map((asset) => logoVariantRole(asset)?.role)
    const light = ready[roles.indexOf('on_light')]
    if (light && roles.includes('on_dark')) return choose(light, 'pair')
  }
  if (ready.length > 1) return none('ambiguous', ready)
  if (eligible.length) return none('not_previewable', eligible)
  if (logos.length && !real.length) return none('example_only')
  return none('missing')
}

/** Assembles the chapter from three source entries; shared by the repository builder and the illustrative fixture. */
export function identityDocument(input: {
  brand_id: string
  brand_name: string
  audience: VisualAudience
  illustrative: boolean
  color: { entry: VisualEntry; structured: StructuredValue | null }
  type: { entry: VisualEntry; structured: StructuredValue | null }
  logo: { entry: VisualEntry; structured: StructuredValue | null }
  masters: LogoMasterCandidate[]
  /** Approved `brand.logo.masters` free text naming the master asset(s); null when not approved. */
  masters_reference?: string | null
  scripts: Array<'en' | 'fa' | 'tr'>
}): VisualDocument {
  const guide = frameworkRef('BRAND-IDENTITY-GUIDE')
  const wcag = frameworkRef('WCAG-CONTRAST')
  const colorEntry = strict(input.color.entry)
  const colors = drawable(colorEntry) && input.color.structured?.type === 'color' ? input.color.structured.colors.map((color) => ({ role: color.role, hex: color.hex, rgb: rgb(color.hex) })) : []
  const palette: ColorPaletteBlock = {
    ...base({ block_id: 'color-palette', framework_id: wcag.framework_id, entry: colorEntry, filled: colors.length > 0, audience: input.audience, variant: 'palette.book.v1' }),
    type: 'color_palette',
    source: colorEntry,
    colors,
    combinations: declaredCombinations(colors),
    grid: contrastGrid(colors),
  }
  const typeEntry = strict(input.type.entry)
  const roles: TypeRole[] = drawable(typeEntry) && input.type.structured?.type === 'font' ? input.type.structured.fonts.map((font) => ({ role: font.role, family: font.family, fallback: [...font.fallback], size_px: font.size_px, line_height: font.line_height })) : []
  const specimen: TypographySpecimenBlock = {
    ...base({ block_id: 'typography', framework_id: guide.framework_id, entry: typeEntry, filled: roles.length > 0, audience: input.audience, variant: 'type.specimen.v1' }),
    type: 'typography_specimen',
    source: typeEntry,
    roles,
    scripts: input.scripts.length ? input.scripts : ['en'],
  }
  const logoEntry = strict(input.logo.entry)
  const spec = drawable(logoEntry) && input.logo.structured?.type === 'logo_spec' ? { min_size_px: input.logo.structured.logo.min_size_px, clear_space: { ...input.logo.structured.logo.clear_space }, min_print_mm: input.logo.structured.logo.min_print_mm } : null
  const { master, state, system, candidates } = pickMaster(input.masters, input.audience, input.masters_reference ?? null)
  const construction: LogoConstructionBlock = {
    ...base({ block_id: 'logo-construction', framework_id: guide.framework_id, entry: logoEntry, filled: spec !== null && master !== null, audience: input.audience, variant: 'logo.construction.v1' }),
    type: 'logo_construction',
    source: logoEntry,
    spec,
    master,
    master_state: state,
    system,
    candidates,
  }
  if (master) construction.sources = [...construction.sources, `asset:${master.asset_id}`]
  for (const item of [system?.on_light, system?.on_dark, system?.icon]) {
    if (item && !construction.sources.includes(`asset:${item.asset_id}`)) construction.sources.push(`asset:${item.asset_id}`)
  }
  const entries = [colorEntry, typeEntry, logoEntry]
  const summary = emptyStatusSummary()
  for (const entry of entries) summary[entry.state] += 1
  const dates = entries.filter(drawable).map((entry) => entry.approved_at).filter((at): at is string => typeof at === 'string' && Number.isFinite(Date.parse(at)))
  const asOf = dates.length ? dates.reduce((latest, at) => (Date.parse(at) > Date.parse(latest) ? at : latest)) : null
  const sources = [...new Set([...palette.sources, ...specimen.sources, ...construction.sources])]
  const filled = [palette, specimen, construction].filter((block) => block.data_state !== 'missing').length
  const citations: CitationListBlock = {
    type: 'citation_list',
    block_id: 'identity-sources',
    framework_id: guide.framework_id,
    data_state: filled === 3 ? 'complete' : filled > 0 ? 'partial' : 'missing',
    sources,
    as_of: asOf,
    computed_from: ['color-palette', 'typography', 'logo-construction'],
    visibility: input.audience,
    renderer_variant: 'citations.table.v1',
    layout_constraints: { preserve_topology: false, min_print_pt: 7, print_profile: 'book_a4_portrait' },
    items: entries.map((entry) => ({ id: entry.id, label: entry.label, state: entry.state, version: entry.version, approved_at: entry.approved_at })),
  }
  return {
    schema: VISUAL_SCHEMA,
    schema_version: 1,
    document_kind: 'visual_identity',
    brand_id: input.brand_id,
    brand_name: input.brand_name,
    audience: input.audience,
    illustrative: input.illustrative,
    origin: input.illustrative ? 'illustrative_fixture' : 'brand_repository',
    as_of: asOf,
    classification: input.audience === 'public' ? 'public' : 'internal',
    print_profile: 'book_a4_portrait',
    status_summary: summary,
    framework_refs: [guide, wcag],
    blocks: [palette, specimen, construction, citations],
  }
}

function missingReason(audience: DocumentAudience, status: string | undefined): MissingReason {
  if (audience === 'public') return 'not_published'
  if (status === 'unknown' || status === 'skipped' || status === 'deprecated') return status
  return 'unanswered'
}

/** The chapter for one brand repository and audience. Reads only; writes nothing. */
export function buildVisualIdentity(engine: InterviewEngine, audience: DocumentAudience, options: IdentityOptions = {}): VisualDocument {
  const root = engine.workspaceRoot()
  const config = engine.config()
  const brandId = config.brand.slug
  const now = options.now ?? new Date()
  const facts = readFacts(root, 'approved', brandId)
  const answers = latestAnswers(engine.ledger().records)
  const context: ItemContext = { facts, answers, audience, root, brandId, evidence: readEvidence(root), now }
  const source = (id: string): { entry: VisualEntry; structured: StructuredValue | null } => {
    const question = engine.question(id)
    if (!question) {
      const entry: VisualEntry = { id, label: id, state: 'missing', value: null, sources: [], version: null, approved_at: null, review_due: null, note: null, missing_reason: 'unanswered' }
      return { entry, structured: null }
    }
    const item = itemFor(question, context)
    const fact: CanonicalFact | undefined = facts[id]
    const { approved: _approved, ...entry } = entryFromItem(item, fact, false, now, missingReason(audience, answers.get(id)?.status))
    void _approved
    return { entry, structured: item.structured }
  }
  const locales = (config.brand.supported_locales ?? []).filter((lang): lang is 'en' | 'fa' | 'tr' => lang === 'en' || lang === 'fa' || lang === 'tr')
  return identityDocument({
    brand_id: brandId,
    brand_name: String(config.brand.name ?? brandId),
    audience,
    illustrative: false,
    color: source(IDENTITY_QUESTIONS.color),
    type: source(IDENTITY_QUESTIONS.type),
    logo: source(IDENTITY_QUESTIONS.logo),
    masters: options.masters ?? [],
    masters_reference: mastersReference(facts),
    scripts: locales,
  })
}

/**
 * Intrinsic size of an image file for the construction drawing: SVG viewBox (or width/height) and the PNG header.
 * Anything else returns null and the drawing uses a neutral frame with a note; nothing is guessed.
 */
export function imageSize(bytes: Buffer, mime: string): { width: number; height: number } | null {
  if (mime === 'image/png' && bytes.length >= 24 && bytes.toString('ascii', 1, 4) === 'PNG') {
    const width = bytes.readUInt32BE(16)
    const height = bytes.readUInt32BE(20)
    return width > 0 && height > 0 ? { width, height } : null
  }
  if (mime === 'image/svg+xml') {
    const head = bytes.toString('utf8', 0, Math.min(bytes.length, 8192))
    const tag = head.match(/<svg\b[^>]*>/i)?.[0]
    if (!tag) return null
    const box = tag.match(/\bviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i)
    if (box) {
      const width = Number(box[1])
      const height = Number(box[2])
      if (width > 0 && height > 0) return { width, height }
    }
    const w = tag.match(/\bwidth\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i)
    const h = tag.match(/\bheight\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i)
    if (w && h && Number(w[1]) > 0 && Number(h[1]) > 0) return { width: Number(w[1]), height: Number(h[1]) }
  }
  return null
}

/**
 * BOS-16: a Brand Book chapter whose central artefact is missing is never "complete". The logo chapter is capped at
 * `partial` while the identity chapter has no drawn master (missing, ambiguous, not previewable, examples only) or no
 * identity document could be built. Other chapters keep their status.
 */
export function logoChapterStatus<S extends 'complete' | 'partial' | 'missing' | 'not_applicable'>(status: S, identity: Pick<VisualDocument, 'blocks'> | null | undefined): S | 'partial' {
  if (status !== 'complete') return status
  const block = identity?.blocks.find((item): item is LogoConstructionBlock => item.type === 'logo_construction')
  return block?.master ? status : 'partial'
}
