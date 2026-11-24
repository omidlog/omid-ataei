/**
 * `brand:assets add` (BOS-03) and `brand:assets prune-examples` (BOS-12).
 *
 * `add` copies one file into `brand/assets/<kind>/`, writes its manifest record (checksum, media type, `status: draft`)
 * and returns the same publication verdict as `brand:assets check`. It never approves: approval stays the owner's
 * `brand:assets approve`, pinned to the exact bytes. A file that would fail the publication check is not written at all,
 * so the manifest never holds an unsafe file; the result says why and which flag fixes it (`--normalize` for SVG issues
 * the normalizer can fix, `--render png` to rasterize an SVG, or a fresh export).
 *
 * `prune-examples` removes template placeholders (manifest rows and their files) only when an approved real asset of
 * the same kind exists, or when the module the placeholder belongs to (the mascot) is off.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { VERSION as SVGO_VERSION } from 'svgo'
import { isMap, isSeq, parse, parseDocument, stringify } from 'yaml'
import { ASSET_SOURCE_DIR, checkAssets, inspectAssetForPublication, svgPublicationIssues, validateAssets, type SvgAssetReport } from './index.js'
import { NORMALIZER_NAME, NORMALIZER_VERSION, normalizeSvg } from './normalize.js'
import type { Resvg as ResvgClass } from '@resvg/resvg-js'
import type { SvgIssue } from './svg-check.js'

const MANIFEST = path.join('brand', 'assets', 'asset-manifest.yaml')

/** Asset kinds and their folder under `brand/assets/`. */
export const ASSET_KIND_FOLDERS = {
  logo: 'logo',
  icon: 'icons',
  mascot: 'mascot',
  illustration: 'illustrations',
  photo: 'photography',
  motion: 'motion',
  audio: 'audio',
} as const
export type AssetKind = keyof typeof ASSET_KIND_FOLDERS

const MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.json': 'application/json',
}
const PREVIEWABLE = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'])
const MAX_BYTES = 50 * 1024 * 1024
/** Identifier shape of manifest ids: `asset.<kind>.<name>` in lower case. */
const ID = /^asset(?:\.[a-z0-9][a-z0-9-]*){2,4}$/
export const RENDERER_NAME = 'brand-os-svg-render'
export const RENDERER_VERSION = '1.0.0'

export interface AddAssetOptions {
  id: string
  name: string
  kind?: string
  tags?: string[]
  visibility?: 'public' | 'internal'
  license?: string
  /** Rasterize an SVG to PNG; the SVG is kept under `brand/assets-src/`. */
  render?: 'png'
  /** Width of the PNG in pixels (default 1024). */
  size?: number
  /** Normalize an SVG whose problems the normalizer can fix; the original is kept under `brand/assets-src/`. */
  normalize?: boolean
  dryRun?: boolean
}

export interface AddAssetReport {
  ok: boolean
  id: string
  outcome: 'added' | 'would-add' | 'refused'
  reason: string
  /** Manifest path of the file (written or planned). */
  path?: string
  original?: string
  checksum_sha256?: string
  mime?: string
  /** The publication verdict and why (the same check as `brand:assets check`). */
  verdict?: { publishable: boolean; issues: SvgIssue[]; warnings: SvgIssue[] }
  /** What to do when the file is refused: one line each. */
  fixes?: string[]
  /** `brand:assets check` on the new record, run straight after writing it. */
  check?: SvgAssetReport | null
  /** `validate` errors that name this asset; empty when the record passes. */
  validation?: string[]
  record?: Record<string, unknown>
}

const sha256 = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex')

function kindFor(id: string, kind: string | undefined): AssetKind | null {
  const wanted = (kind ?? id.split('.')[1] ?? '').toLowerCase()
  const aliases: Record<string, AssetKind> = { icons: 'icon', illustrations: 'illustration', photography: 'photo', photos: 'photo', logos: 'logo' }
  const resolved = (aliases[wanted] ?? wanted) as AssetKind
  return resolved in ASSET_KIND_FOLDERS ? resolved : null
}

function readManifestText(root: string): string {
  return fs.readFileSync(path.join(root, MANIFEST), 'utf8')
}

function manifestIds(text: string): string[] {
  const assets = (parse(text) as { assets?: Array<{ id?: unknown }> } | null)?.assets ?? []
  return assets.map((asset) => asset.id).filter((id): id is string => typeof id === 'string')
}

/**
 * Append one record to the manifest without reformatting the rest. The new text is parsed again and must equal the
 * old list plus the record, or nothing is written.
 */
function appendRecord(root: string, record: Record<string, unknown>): void {
  const file = path.join(root, MANIFEST)
  const text = readManifestText(root)
  const before = parse(text) as { assets?: unknown[] }
  const indent = /\n( *)- id:/.exec(text)?.[1] ?? '  '
  const item = stringify([record], { lineWidth: 0 })
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n')
  let next = Array.isArray(before.assets) && before.assets.length > 0 && /^assets:\s*$/m.test(text) ? `${text.replace(/\n*$/, '')}\n${item}\n` : null
  const expected = JSON.stringify([...(Array.isArray(before.assets) ? before.assets : []), record])
  if (!next || JSON.stringify((parse(next) as { assets?: unknown[] }).assets) !== expected) {
    // An empty or flow-style list: rewrite through the YAML document instead.
    const doc = parseDocument(text)
    const assets = doc.get('assets')
    if (isSeq(assets)) assets.add(doc.createNode(record))
    else doc.set('assets', doc.createNode([record]))
    next = doc.toString({ lineWidth: 0 })
  }
  if (JSON.stringify((parse(next) as { assets?: unknown[] }).assets) !== expected) throw new Error('Refusing to write asset-manifest.yaml: the new record did not round-trip.')
  fs.writeFileSync(file, next)
}

/** Rasterize SVG text to PNG with resvg (already a dependency for the normalizer's render check). */
export async function renderSvgToPng(svg: string, width: number): Promise<{ ok: true; png: Buffer; renderer: string } | { ok: false; message: string }> {
  let Resvg: typeof ResvgClass
  let version = 'unknown'
  try {
    ;({ Resvg } = await import('@resvg/resvg-js'))
    try {
      version = (JSON.parse(fs.readFileSync(createRequire(import.meta.url).resolve('@resvg/resvg-js/package.json'), 'utf8')) as { version?: string }).version ?? version
    } catch {
      // The version is informational only.
    }
  } catch (error) {
    return { ok: false, message: `--render needs the rasterizer @resvg/resvg-js, which could not be loaded (${error instanceof Error ? error.message.slice(0, 160) : 'unknown error'}). Run npm install, or export a PNG from your design tool and add that file instead. Nothing was written.` }
  }
  try {
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: 'rgba(0,0,0,0)', font: { loadSystemFonts: false } }).render().asPng()
    return { ok: true, png: Buffer.from(png), renderer: `resvg-js ${version}` }
  } catch (error) {
    return { ok: false, message: `The SVG could not be rendered: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown error'}. Nothing was written.` }
  }
}

/** `brand:assets add`. Agents may run it; it only ever writes a `draft` record. */
export async function addAsset(root: string, source: string, options: AddAssetOptions): Promise<AddAssetReport> {
  const id = options.id.trim()
  const refuse = (reason: string, extra: Partial<AddAssetReport> = {}): AddAssetReport => ({ ok: false, id, outcome: 'refused', reason, ...extra })
  if (!ID.test(id)) return refuse('The id must look like asset.<kind>.<name> in lower case, for example asset.logo.wordmark-dark.')
  const name = options.name.trim()
  if (!name || name.length > 200) return refuse('--name is required (at most 200 characters).')
  const kind = kindFor(id, options.kind)
  if (!kind) return refuse(`Unknown kind. Use --kind ${Object.keys(ASSET_KIND_FOLDERS).join('|')}, or an id like asset.logo.<name>.`)
  if (options.visibility && options.visibility !== 'public' && options.visibility !== 'internal') return refuse('--visibility must be public or internal.')
  const size = options.size ?? 1024
  if (options.render && options.render !== 'png') return refuse('--render supports png only.')
  if (!Number.isInteger(size) || size < 16 || size > 8192) return refuse('--size must be a whole number of pixels between 16 and 8192.')
  if (options.render && options.normalize) return refuse('Use either --render or --normalize, not both.')

  const full = path.resolve(source)
  if (!fs.existsSync(full)) return refuse(`${source} does not exist.`)
  const stat = fs.lstatSync(full)
  if (stat.isSymbolicLink() || !stat.isFile()) return refuse(`${source} is not a regular file (symbolic links are refused).`)
  if (stat.size === 0 || stat.size > MAX_BYTES) return refuse(`${source} is empty or larger than ${MAX_BYTES / 1024 / 1024} MB.`)
  const sourceExt = path.extname(full).toLowerCase()
  if (!MIME[sourceExt]) return refuse(`Unsupported file type ${sourceExt || '(none)'}. Supported: ${Object.keys(MIME).join(', ')}.`)
  if (options.render && sourceExt !== '.svg') return refuse('--render rasterizes an SVG; this file is not one.')
  if (options.normalize && sourceExt !== '.svg') return refuse('--normalize applies to SVG files only.')

  let text: string
  try {
    text = readManifestText(root)
  } catch {
    return refuse(`${MANIFEST} is missing or unreadable.`)
  }
  if (manifestIds(text).includes(id)) return refuse(`${id} is already in the manifest. Nothing was changed.`)

  const folder = `brand/assets/${ASSET_KIND_FOLDERS[kind]}`
  const bytes = fs.readFileSync(full)
  const base = path.basename(full, sourceExt).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || id.split('.').pop()!
  let output: Buffer = bytes
  let ext = sourceExt
  let original: { path: string; bytes: Buffer } | null = null
  let derivation: Record<string, unknown> = {}

  if (sourceExt === '.svg') {
    const svg = bytes.toString('utf8')
    const issues = svgPublicationIssues(svg)
    if (options.render) {
      const rendered = await renderSvgToPng(svg, size)
      if (!rendered.ok) return refuse(rendered.message)
      output = rendered.png
      ext = '.png'
      original = { path: `${ASSET_SOURCE_DIR}/${ASSET_KIND_FOLDERS[kind]}/${base}.svg`, bytes }
      derivation = { normalizer: { name: RENDERER_NAME, version: `${RENDERER_VERSION} (${rendered.renderer}, ${size}px PNG)` } }
    } else if (issues.length > 0) {
      const fixable = issues.every((issue) => issue.fixable)
      if (!options.normalize) {
        const fixes = [
          ...(fixable ? ['Add it with --normalize: the normalizer fixes these issues without changing the drawing and keeps the original under brand/assets-src/.'] : []),
          'Add it with --render png --size 1024: the SVG is kept under brand/assets-src/ and a PNG is published instead.',
          'Or fix the source file in your design tool (expand symbols, embed no raster, keep every url(#id) target in the file) and export it again.',
        ]
        return refuse('The SVG fails the publication check, so nothing was written.', { verdict: { publishable: false, issues, warnings: [] }, fixes })
      }
      const normalized = normalizeSvg(svg)
      if (!normalized.ok) {
        return refuse(`${normalized.message} Nothing was written.`, {
          verdict: { publishable: false, issues: normalized.issues.length ? normalized.issues : issues, warnings: [] },
          fixes: ['Add it with --render png --size 1024 to publish a PNG instead, or fix the source file and export it again.'],
        })
      }
      output = Buffer.from(normalized.output, 'utf8')
      original = { path: `${ASSET_SOURCE_DIR}/${ASSET_KIND_FOLDERS[kind]}/${base}.svg`, bytes }
      derivation = { normalizer: { name: NORMALIZER_NAME, version: NORMALIZER_VERSION, svgo: SVGO_VERSION } }
    }
  }

  const relative = `${folder}/${base}${ext}`
  const target = path.join(root, relative)
  const checksum = sha256(output)
  const mime = MIME[ext]!
  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isSymbolicLink() || sha256(fs.readFileSync(target)) !== checksum) return refuse(`${relative} already exists with different content. Rename the file or choose another id; nothing was overwritten.`)
  }
  if (manifestIds(text).length && (parse(text) as { assets?: Array<{ path?: unknown }> }).assets?.some((asset) => asset.path === relative)) {
    return refuse(`${relative} is already recorded under another id. Nothing was changed.`)
  }
  if (original) {
    const originalFull = path.join(root, original.path)
    if (fs.existsSync(originalFull) && sha256(fs.readFileSync(originalFull)) !== sha256(original.bytes)) return refuse(`${original.path} already exists with different content. Nothing was written.`)
  }

  const kindTag = kind === 'photo' ? 'photography' : kind
  const tags = [...new Set([kindTag, ...(options.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter((tag) => /^[a-z0-9][a-z0-9-]{0,40}$/.test(tag))])]
  const record: Record<string, unknown> = {
    id,
    name,
    status: 'draft',
    visibility: options.visibility ?? 'internal',
    ...(options.license ? { license: options.license.slice(0, 300) } : {}),
    path: relative,
    present: true,
    checksum_sha256: checksum,
    mime,
    ...(PREVIEWABLE.has(ext) ? { preview: relative } : {}),
    tags,
    ...(original ? { derived_from: { path: original.path, sha256: sha256(original.bytes) } } : {}),
    ...derivation,
  }
  const verdictIssues = ext === '.svg' ? svgPublicationIssues(output.toString('utf8')) : []
  const report: AddAssetReport = {
    ok: true,
    id,
    outcome: options.dryRun ? 'would-add' : 'added',
    reason: options.dryRun ? 'Dry run: nothing was written.' : 'Added as a draft. The owner approves the exact file with npm run brand:assets -- approve --ids ' + id,
    path: relative,
    ...(original ? { original: original.path } : {}),
    checksum_sha256: checksum,
    mime,
    verdict: { publishable: verdictIssues.length === 0, issues: verdictIssues, warnings: [] },
    record,
  }
  if (options.dryRun) return report

  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (!fs.existsSync(target)) fs.writeFileSync(target, output)
  if (original) {
    const originalFull = path.join(root, original.path)
    fs.mkdirSync(path.dirname(originalFull), { recursive: true })
    if (!fs.existsSync(originalFull)) fs.writeFileSync(originalFull, original.bytes)
  }
  appendRecord(root, record)

  // `check` straight away, then the publication inspection Studio and the docs apply, then the manifest validation.
  const check = ext === '.svg' ? (checkAssets(root, [id])[0] ?? null) : null
  const inspected = PREVIEWABLE.has(ext) ? inspectAssetForPublication(root, relative, checksum) : { ok: true as const }
  report.check = check
  report.verdict = {
    publishable: inspected.ok && (check?.ok ?? true),
    issues: check?.issues ?? (inspected.ok ? [] : (inspected.issues ?? [{ code: 'not-svg', message: `Refused by the publication inspection (${inspected.reason}).`, line: null, fixable: false }])),
    warnings: check?.warnings ?? [],
  }
  report.validation = validateAssets(root).filter((error) => error.startsWith(`${id} `))
  if (report.validation.length) report.ok = false
  return report
}

export interface PruneItem {
  id: string
  kind: string
  outcome: 'removed' | 'would-remove' | 'kept'
  reason: string
  /** Files removed (or that would be), relative to the repository. */
  files: string[]
}

export interface PruneReport {
  ok: boolean
  dry_run: boolean
  items: PruneItem[]
}

interface Row {
  id?: unknown
  path?: unknown
  preview?: unknown
  status?: unknown
  tags?: unknown
  license?: unknown
  present?: unknown
  checksum_sha256?: unknown
}

function tagsOf(row: Row): string[] {
  return Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.toLowerCase()) : []
}

function isPlaceholder(row: Row): boolean {
  const tags = tagsOf(row)
  return tags.includes('example') || tags.includes('placeholder') || /EXAMPLE/.test(String(row.license ?? '')) || /(^|\.)example[-.]/i.test(String(row.id ?? ''))
}

/** An unfilled template slot: no file, nothing started (for example the mascot turnaround). */
function isEmptySlot(row: Row): boolean {
  return row.present !== true && (row.status === 'not_started' || tagsOf(row).includes('missing'))
}

function kindOf(row: Row): string {
  const parts = typeof row.path === 'string' ? row.path.split('/') : []
  return parts[0] === 'brand' && parts[1] === 'assets' && parts.length > 3 ? parts[2]! : (tagsOf(row)[0] ?? 'asset')
}

/** Asset kinds that belong to a module that can be switched off. */
const MODULE_KINDS: Record<string, 'mascot'> = { mascot: 'mascot' }

/**
 * `brand:assets prune-examples`: remove template placeholders whose place a real approved asset has taken, and the
 * placeholders and empty slots of a module that is off. A row referenced by the mascot catalog, a file another row
 * still uses, or a file whose bytes no longer match the manifest is kept, with the reason.
 */
export function pruneExampleAssets(root: string, options: { dryRun?: boolean; modules?: { mascot?: boolean } } = {}): PruneReport {
  const file = path.join(root, MANIFEST)
  const text = fs.readFileSync(file, 'utf8')
  const doc = parseDocument(text)
  const assets = doc.get('assets')
  if (!isSeq(assets)) return { ok: true, dry_run: Boolean(options.dryRun), items: [] }
  const rows = (assets.toJSON() as Row[]).filter((row) => row && typeof row === 'object')
  const realApprovedKinds = new Set(rows.filter((row) => !isPlaceholder(row) && (row.status === 'approved' || row.status === 'published')).map(kindOf))
  const catalog = ['brand/mascot/catalog.yaml', 'brand/mascot/stages.yaml'].map((name) => path.join(root, name)).filter((name) => fs.existsSync(name)).map((name) => fs.readFileSync(name, 'utf8')).join('\n')
  const items: PruneItem[] = []
  const remove = new Set<string>()
  for (const row of rows) {
    if (typeof row.id !== 'string') continue
    const kind = kindOf(row)
    const module = MODULE_KINDS[kind]
    const moduleOff = module !== undefined && options.modules?.[module] === false
    const placeholder = isPlaceholder(row)
    if (!placeholder && !(moduleOff && isEmptySlot(row))) continue
    if (!moduleOff && !realApprovedKinds.has(kind)) {
      items.push({ id: row.id, kind, outcome: 'kept', reason: `No approved real ${kind} asset yet; the example stays until one is approved.`, files: [] })
      continue
    }
    if (new RegExp(`(^|[^A-Za-z0-9._-])${row.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9._-])`).test(catalog)) {
      items.push({ id: row.id, kind, outcome: 'kept', reason: 'Referenced by brand/mascot; remove the reference first.', files: [] })
      continue
    }
    const files = [...new Set([row.path, row.preview].filter((item): item is string => typeof item === 'string' && item.length > 0))]
    const removable: string[] = []
    let blocked: string | null = null
    for (const relative of files) {
      const full = path.resolve(root, relative)
      const assetsRoot = path.resolve(root, 'brand', 'assets')
      if (!full.startsWith(`${assetsRoot}${path.sep}`)) {
        blocked = `${relative} is outside brand/assets.`
        break
      }
      if (!fs.existsSync(full)) continue
      if (fs.lstatSync(full).isSymbolicLink()) {
        blocked = `${relative} is a symbolic link.`
        break
      }
      if (rows.some((other) => other.id !== row.id && (other.path === relative || other.preview === relative))) continue
      if (relative === row.path && typeof row.checksum_sha256 === 'string' && sha256(fs.readFileSync(full)) !== row.checksum_sha256) {
        blocked = `${relative} no longer matches the manifest checksum, so it may not be the template file.`
        break
      }
      removable.push(relative)
    }
    if (blocked) {
      items.push({ id: row.id, kind, outcome: 'kept', reason: `${blocked} Nothing was removed for this asset.`, files: [] })
      continue
    }
    const reason = moduleOff ? `The ${module} module is off.` : `An approved real ${kind} asset exists.`
    items.push({ id: row.id, kind, outcome: options.dryRun ? 'would-remove' : 'removed', reason, files: removable })
    remove.add(row.id)
  }
  if (options.dryRun || remove.size === 0) return { ok: true, dry_run: Boolean(options.dryRun), items }

  // Cut whole items out of the text so the rest of the manifest keeps its formatting; verify by parsing again.
  const nodes = assets.items as Array<{ range?: [number, number, number] | null } | null>
  const ranges: Array<readonly [number, number]> = []
  nodes.forEach((item, index) => {
    if (!isMap(item) || !item.range || !remove.has(String(item.get('id')))) return
    const start = text.lastIndexOf('\n', item.range[0] - 1) + 1
    const nextRange = nodes[index + 1]?.range
    const end = nextRange ? text.lastIndexOf('\n', nextRange[0] - 1) + 1 : item.range[2]
    ranges.push([start, end] as const)
  })
  let next = text
  for (const [start, end] of [...ranges].sort((a, b) => b[0] - a[0])) next = next.slice(0, start) + next.slice(end)
  if (!next.endsWith('\n')) next += '\n'
  const expected = rows.filter((row) => !remove.has(String(row.id)))
  const parsed = parse(next) as { assets?: unknown[] } | null
  if (JSON.stringify(parsed?.assets ?? []) !== JSON.stringify(expected)) {
    const fallback = parseDocument(text)
    const seq = fallback.get('assets')
    if (isSeq(seq)) seq.items = seq.items.filter((item) => !(isMap(item) && remove.has(String(item.get('id')))))
    next = fallback.toString({ lineWidth: 0 })
    if (JSON.stringify((parse(next) as { assets?: unknown[] }).assets ?? []) !== JSON.stringify(expected)) throw new Error('Refusing to write asset-manifest.yaml: the prune did not round-trip.')
  }
  fs.writeFileSync(file, next)
  for (const item of items) {
    if (item.outcome !== 'removed') continue
    for (const relative of item.files) fs.rmSync(path.join(root, relative), { force: true })
  }
  return { ok: true, dry_run: false, items }
}
