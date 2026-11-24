/**
 * SVG normalizer (`brand:assets normalize`). A separate entry point (`@brand-os/asset-catalog/normalize`)
 * so that Studio, which bundles the main entry, never pulls in SVGO or the native rasterizer.
 *
 * What it does, and nothing more:
 * - runs SVGO with exactly five plugins: removeComments, removeMetadata, removeEditorsNSData,
 *   inlineStyles and convertStyleToAttrs. No plugin that changes a shape, a number or a path runs.
 *   Then it drops a UTF-8 `<?xml …?>` declaration (see dropUtf8Declaration);
 * - refuses the result unless every geometry attribute is byte-identical and the strict checker
 *   (both gates) passes on the output. SVGO only optimizes; the checker is the security gate;
 * - keeps the untouched original in brand/assets-src/ (never served), and records `derived_from`
 *   and `normalizer` in the manifest;
 * - carries an approval forward only when both files rasterize to identical pixels, recording
 *   `approval_carried_from`. Otherwise the asset goes back to draft and must be approved again.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { optimize, VERSION as SVGO_VERSION } from 'svgo'
import { isMap, isSeq, parseDocument } from 'yaml'
import type { Resvg as ResvgClass } from '@resvg/resvg-js'
import { ASSET_SOURCE_DIR, assetPathIsSafe, originalPathFor, patchManifestAsset, svgPublicationIssues } from './index.js'
import { checkSvg, geometrySignature } from './svg-check.js'
import type { SvgCheck, SvgIssue } from './svg-check.js'

export const NORMALIZER_NAME = 'brand-os-svg-normalizer'
export const NORMALIZER_VERSION = '1.0.0'
/** Render width for the approval render check. Large enough that a one-unit change shows. */
export const RENDER_WIDTH = 1024

const PLUGINS = [
  { name: 'removeComments', params: { preservePatterns: false } },
  'removeMetadata',
  'removeEditorsNSData',
  { name: 'inlineStyles', params: { onlyMatchedOnce: false } },
  'convertStyleToAttrs',
] as const

export type NormalizeResult =
  | { ok: true; output: string; changed: boolean; before: SvgCheck }
  | { ok: false; reason: 'not-fixable' | 'output-refused' | 'geometry-changed' | 'svgo-error'; message: string; issues: SvgIssue[]; before: SvgCheck }

/** Normalize SVG text. Pure: no files, no manifest. */
export function normalizeSvg(input: string): NormalizeResult {
  const before = checkSvg(input)
  if (before.ok && svgPublicationIssues(input).length === 0) return { ok: true, output: input, changed: false, before }
  if (!before.fixable) {
    return { ok: false, reason: 'not-fixable', message: 'The file has problems the normalizer must not touch. Fix the source file and export it again.', issues: before.issues.filter((issue) => !issue.fixable), before }
  }
  let output: string
  try {
    output = optimize(input, { multipass: false, js2svg: { pretty: true, indent: 2 }, plugins: [...PLUGINS] }).data
  } catch (error) {
    return { ok: false, reason: 'svgo-error', message: `SVGO could not read the file: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown error'}`, issues: [], before }
  }
  output = dropUtf8Declaration(output)
  if (!output.endsWith('\n')) output += '\n'
  const issues = svgPublicationIssues(output)
  if (issues.length > 0) return { ok: false, reason: 'output-refused', message: 'The normalized file still fails the SVG check, so nothing was written.', issues, before }
  const geometryBefore = geometrySignature(input)
  const geometryAfter = geometrySignature(output)
  if (geometryBefore.length !== geometryAfter.length || geometryBefore.some((entry, index) => entry !== geometryAfter[index])) {
    return { ok: false, reason: 'geometry-changed', message: 'A shape attribute changed during normalization, so nothing was written.', issues: [], before }
  }
  return { ok: true, output, changed: output !== input, before }
}

/**
 * Drops a leading `<?xml …?>` declaration when it declares UTF-8 or no encoding, which is what an
 * SVG without one means anyway. It carries nothing for rendering, and checkers older than this
 * package refuse any `<?`, so a normalized file is also accepted by brands that have not updated
 * yet. A declaration of another encoding is kept, because dropping it would change the text.
 */
function dropUtf8Declaration(svg: string): string {
  const match = /^\uFEFF?\s*<\?xml\s([^?]*)\?>\s*/.exec(svg)
  if (!match) return svg
  const encoding = /\bencoding\s*=\s*["']([^"']+)["']/i.exec(match[1]!)?.[1]
  return encoding === undefined || /^utf-?8$/i.test(encoding) ? svg.slice(match[0].length) : svg
}

export interface RenderCheck {
  result: 'identical' | 'different' | 'unavailable'
  renderer: string
  width?: number
  height?: number
  detail?: string
}

/** Rasterize both files with resvg and compare every RGBA byte. Any failure is "unavailable", never "identical". */
export async function renderCompare(a: string, b: string, width = RENDER_WIDTH): Promise<RenderCheck> {
  let Resvg: typeof ResvgClass
  let renderer = 'resvg'
  try {
    ;({ Resvg } = await import('@resvg/resvg-js'))
    renderer = `resvg-js ${packageVersion('@resvg/resvg-js') ?? 'unknown'}`
  } catch (error) {
    return { result: 'unavailable', renderer, detail: `The rasterizer could not be loaded: ${error instanceof Error ? error.message.slice(0, 160) : 'unknown error'}` }
  }
  try {
    const options = { fitTo: { mode: 'width' as const, value: width }, background: 'rgba(0,0,0,0)' }
    const left = new Resvg(a, options).render()
    const right = new Resvg(b, options).render()
    if (left.width !== right.width || left.height !== right.height) {
      return { result: 'different', renderer, width: left.width, height: left.height, detail: `Sizes differ: ${left.width}x${left.height} and ${right.width}x${right.height}.` }
    }
    const same = Buffer.from(left.pixels).equals(Buffer.from(right.pixels))
    return { result: same ? 'identical' : 'different', renderer, width: left.width, height: left.height }
  } catch (error) {
    return { result: 'unavailable', renderer, detail: `Rendering failed: ${error instanceof Error ? error.message.slice(0, 160) : 'unknown error'}` }
  }
}

function packageVersion(name: string): string | null {
  try {
    const file = createRequire(import.meta.url).resolve(`${name}/package.json`)
    return (JSON.parse(fs.readFileSync(file, 'utf8')) as { version?: string }).version ?? null
  } catch {
    return null
  }
}

export interface NormalizeAssetReport {
  ok: boolean
  id: string
  outcome: 'normalized' | 'would-normalize' | 'unchanged' | 'refused'
  reason: string
  path?: string
  original?: string
  checksum_before?: string
  checksum_after?: string
  approval?: 'carried' | 'reset' | 'not-approved'
  render_check?: RenderCheck
  issues?: SvgIssue[]
}

const sha256 = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex')

/** `brand:assets normalize <id>`: normalize one manifest asset in place, keeping the original. */
export async function normalizeAsset(
  root: string,
  id: string,
  options: { dryRun?: boolean; now?: () => Date; render?: (a: string, b: string) => Promise<RenderCheck> } = {},
): Promise<NormalizeAssetReport> {
  const now = options.now ?? (() => new Date())
  const render_ = options.render ?? renderCompare
  const refuse = (reason: string, extra: Partial<NormalizeAssetReport> = {}): NormalizeAssetReport => ({ ok: false, id, outcome: 'refused', reason, ...extra })
  const manifestFile = path.join(root, 'brand', 'assets', 'asset-manifest.yaml')
  const doc = parseDocument(fs.readFileSync(manifestFile, 'utf8'))
  if (doc.errors.length > 0) return refuse(`asset-manifest.yaml does not parse: ${doc.errors[0]!.message}`)
  const assets = doc.get('assets')
  const node = isSeq(assets) ? assets.items.find((item) => isMap(item) && item.get('id') === id) : undefined
  if (!node || !isMap(node)) return refuse('No asset with this id in brand/assets/asset-manifest.yaml.')
  const record = node.toJSON() as Record<string, unknown>
  const assetPath = typeof record.path === 'string' ? record.path : ''
  if (record.present !== true) return refuse('The asset is not present.')
  if (!assetPath.toLowerCase().endsWith('.svg')) return refuse('Only SVG files can be normalized.')
  if (!assetPathIsSafe(root, assetPath)) return refuse('The asset path is outside brand/assets.')
  const full = path.join(root, assetPath)
  if (!fs.existsSync(full) || fs.lstatSync(full).isSymbolicLink()) return refuse('The file is missing or is a symbolic link.')
  const current = fs.readFileSync(full)
  const currentSha = sha256(current)
  if (typeof record.checksum_sha256 === 'string' && record.checksum_sha256 !== currentSha) {
    return refuse('The file does not match checksum_sha256 in the manifest. Resolve that first; nothing was changed.')
  }

  // Source: the kept original when the asset was normalized before, else the current file.
  let source = current
  let originalPath = originalPathFor(assetPath)
  const derived = record.derived_from as { path?: unknown; sha256?: unknown } | null | undefined
  if (derived) {
    const kept = typeof derived.path === 'string' ? derived.path : ''
    const keptFull = path.resolve(root, kept)
    if (!kept.startsWith(`${ASSET_SOURCE_DIR}/`) || kept.includes('..') || !keptFull.startsWith(path.resolve(root, ASSET_SOURCE_DIR) + path.sep)) return refuse('derived_from.path is not inside brand/assets-src.')
    if (!fs.existsSync(keptFull) || fs.lstatSync(keptFull).isSymbolicLink()) return refuse(`The original ${kept} is missing.`)
    source = fs.readFileSync(keptFull)
    if (sha256(source) !== derived.sha256) return refuse(`The original ${kept} does not match derived_from.sha256.`)
    originalPath = kept
  }

  const result = normalizeSvg(source.toString('utf8'))
  if (!result.ok) return refuse(result.message, { issues: result.issues, path: assetPath })
  if (result.output === current.toString('utf8')) {
    return { ok: true, id, outcome: 'unchanged', reason: result.changed ? 'Already normalized with this normalizer.' : 'The file already passes the SVG check. Nothing to do.', path: assetPath, checksum_before: currentSha, checksum_after: currentSha }
  }
  const output = Buffer.from(result.output, 'utf8')
  const nextSha = sha256(output)

  const status = typeof record.status === 'string' ? record.status : 'draft'
  const approved = status === 'approved' || status === 'published'
  // The approved bytes are the current file; compare against exactly those.
  const render = approved ? await render_(current.toString('utf8'), result.output) : undefined
  const approval: NormalizeAssetReport['approval'] = !approved ? 'not-approved' : render?.result === 'identical' ? 'carried' : 'reset'

  const report: NormalizeAssetReport = {
    ok: true,
    id,
    outcome: options.dryRun ? 'would-normalize' : 'normalized',
    reason:
      approval === 'carried'
        ? 'Normalized. The render check is pixel-identical, so the approval is carried to the new file.'
        : approval === 'reset'
          ? `Normalized. The render check was ${render?.result}, so the asset is back to draft and needs approval again.`
          : 'Normalized. The asset was not approved, so no render check was needed.',
    path: assetPath,
    original: originalPath,
    checksum_before: currentSha,
    checksum_after: nextSha,
    approval,
    ...(render ? { render_check: render } : {}),
  }
  if (options.dryRun) return report

  // The original is written once and never overwritten with different bytes.
  const originalFull = path.join(root, originalPath)
  if (!derived) {
    if (fs.existsSync(originalFull)) {
      if (sha256(fs.readFileSync(originalFull)) !== currentSha) return refuse(`${originalPath} already exists with different content. Nothing was changed.`)
    } else {
      fs.mkdirSync(path.dirname(originalFull), { recursive: true })
      fs.writeFileSync(originalFull, current)
    }
  }
  fs.writeFileSync(full, output)

  const at = now().toISOString()
  const changes: Record<string, unknown> = {
    checksum_sha256: nextSha,
    derived_from: { path: originalPath, sha256: sha256(source) },
    normalizer: { name: NORMALIZER_NAME, version: NORMALIZER_VERSION, svgo: SVGO_VERSION },
  }
  if (render) changes.render_check = { ...render, checked_at: at }
  if (approval === 'carried') {
    Object.assign(changes, { approved_sha256: nextSha, approval_carried_from: currentSha, approval_reset: undefined })
  } else if (approval === 'reset') {
    Object.assign(changes, {
      status: 'draft',
      approval_reset: { from_status: status, from_sha256: currentSha, ...(typeof record.approved_by === 'string' ? { approved_by: record.approved_by } : {}), reason: `normalize: render check ${render?.result}`, at },
      approved_by: undefined,
      approved_at: undefined,
      approved_sha256: undefined,
      approval_carried_from: undefined,
    })
  }
  patchManifestAsset(root, id, changes)
  return report
}
