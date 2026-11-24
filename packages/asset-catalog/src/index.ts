import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import Ajv from 'ajv'
import { isMap, isSeq, parse, parseDocument, stringify } from 'yaml'
import { checkSvg } from './svg-check.js'
import type { SvgIssue } from './svg-check.js'

export { analyzeDeclarations, checkSvg, EDITOR_NAMESPACES, geometrySignature, SVG_ISSUE_CODES, SVG_NS } from './svg-check.js'
export type { SvgCheck, SvgIssue, SvgIssueCode } from './svg-check.js'

export interface AssetRecord {
  id: string
  name: string
  status: string
  path: string
  present: boolean
  checksum_sha256?: string | null
  visibility?: string
  missing_reason?: string
  approved_by?: string
  approved_at?: string
  /** The exact bytes a person approved. A different checksum means the approval no longer applies. */
  approved_sha256?: string | null
  /** Set by `brand:assets normalize`: the untouched original, kept outside the served folder. */
  derived_from?: { path: string; sha256: string } | null
  normalizer?: { name: string; version: string; svgo?: string } | null
  /** Checksum of the approved bytes the approval was carried from after a pixel-identical render check. */
  approval_carried_from?: string | null
  render_check?: { result: string; renderer?: string; width?: number; height?: number; checked_at?: string } | null
  approval_reset?: Record<string, unknown> | null
  /**
   * Whether this file may be given to a model or an image/model provider. Absent means `not_allowed`:
   * nothing is sent anywhere unless a person recorded a wider value. See `effectiveModelUse`.
   */
  model_use?: ModelUse
}

/**
 * Model-use right of an asset. `not_allowed` is the default and the value of every record that does not
 * say otherwise. `local_only` permits a model running on the owner's machine; `external_allowed` permits a
 * third-party provider. Recording a value grants nothing by itself: no code path in this repository sends
 * an asset to any model today.
 */
export const MODEL_USE_VALUES = ['not_allowed', 'local_only', 'external_allowed'] as const
export type ModelUse = (typeof MODEL_USE_VALUES)[number]

/** The model-use right that applies: the recorded value when it is a known one, otherwise `not_allowed`. */
export function effectiveModelUse(record: object | null | undefined): ModelUse {
  const value = (record as { model_use?: unknown } | null | undefined)?.model_use
  return typeof value === 'string' && (MODEL_USE_VALUES as readonly string[]).includes(value) ? (value as ModelUse) : 'not_allowed'
}

/** Originals of normalized files live here. Nothing under it is ever served, copied or published. */
export const ASSET_SOURCE_DIR = 'brand/assets-src'

/** Where `brand:assets normalize` keeps the original of a manifest path. */
export function originalPathFor(assetPath: string): string {
  return `${ASSET_SOURCE_DIR}/${assetPath.replace(/^brand\/assets\//, '')}`
}

export function normalizeCommand(id: string): string {
  return `npm run brand:assets -- normalize ${id}`
}

export interface AssetManifest {
  schema_version: number
  assets: AssetRecord[]
}

export type PublicationRefusal = 'path' | 'missing' | 'symlink' | 'escape' | 'checksum' | 'active-svg'

export function inspectAssetForPublication(
  repoRoot: string,
  assetPath: string,
  expectedHash?: string | null,
): { ok: true; realPath: string } | { ok: false; reason: PublicationRefusal; issues?: SvgIssue[] } {
  let decoded = assetPath
  try {
    decoded = decodeURIComponent(assetPath)
  } catch {
    return { ok: false, reason: 'path' }
  }
  if (!decoded || decoded.includes('\0') || decoded.includes('..') || path.isAbsolute(decoded) || /^[a-z]+:/i.test(decoded)) {
    return { ok: false, reason: 'path' }
  }
  if (!assetPathIsSafe(repoRoot, assetPath)) return { ok: false, reason: 'path' }
  const full = path.resolve(repoRoot, assetPath)
  if (!fs.existsSync(full)) return { ok: false, reason: 'missing' }
  if (fs.lstatSync(full).isSymbolicLink()) return { ok: false, reason: 'symlink' }
  const realPath = fs.realpathSync(full)
  const assetsRoot = fs.realpathSync(path.resolve(repoRoot, 'brand', 'assets'))
  if (realPath !== assetsRoot && !realPath.startsWith(`${assetsRoot}${path.sep}`)) return { ok: false, reason: 'escape' }
  const bytes = fs.readFileSync(realPath)
  if (expectedHash && createHash('sha256').update(bytes).digest('hex') !== expectedHash) return { ok: false, reason: 'checksum' }
  if (realPath.toLowerCase().endsWith('.svg')) {
    const issues = svgPublicationIssues(bytes.toString('utf8'))
    if (issues.length > 0) return { ok: false, reason: 'active-svg', issues }
  }
  return { ok: true, realPath }
}

/**
 * Blocking problems that keep an SVG out of Studio, the docs build and MCP results. Two gates must
 * both pass: the XML allowlist in `checkSvg` and the older text-level regex gate, kept as defence in
 * depth. An empty list means the file may be published.
 */
export function svgPublicationIssues(svg: string): SvgIssue[] {
  const check = checkSvg(svg)
  if (!check.ok) return check.issues
  return legacySvgGatePasses(svg) ? [] : [{ code: 'legacy-gate', message: 'The file contains text that looks like an active SVG feature.', line: null, fixable: false }]
}

/** Text-level gate. Fails closed on anything that looks active, whatever the XML structure says. */
export function legacySvgGatePasses(svg: string): boolean {
  // The XML declaration is the only <? allowed, and only at the very start.
  const body = svg.replace(/^\uFEFF?\s*<\?xml\s[^?]*\?>/, '')
  if (!/^\s*<svg[\s>]/i.test(body) || !/<\/svg>\s*$/i.test(body)) return false
  if (/<!|<\?|<\s*\/?\s*(?:[\w.-]+:)?(?:script|foreignobject|iframe|object|embed|image|use|a|animate|set|style|audio|video|feimage)\b/i.test(body)) return false
  if (/\b(?:on[a-z]+|src|style)\s*=/i.test(body)) return false
  // href only as a reference to an element of this file; the XML check decides which elements may use it.
  if (/\bhref\s*=\s*(?!"#[A-Za-z_][\w.-]*"|'#[A-Za-z_][\w.-]*')/i.test(body)) return false
  if (/(?:javascript|data|vbscript)\s*:/i.test(body)) return false
  // url() only as url(#id) inside this file.
  if (/url\s*\(/i.test(body.replace(/url\(\s*#[A-Za-z_][\w.-]*\s*\)/g, ''))) return false
  if (/@import|expression\s*\(/i.test(body)) return false
  return true
}

export function assetPathIsSafe(repoRoot: string, assetPath: string): boolean {
  if (!assetPath || assetPath.includes('..') || path.isAbsolute(assetPath)) return false
  const full = path.resolve(repoRoot, assetPath)
  const root = path.resolve(repoRoot, 'brand', 'assets')
  return full === root || full.startsWith(`${root}${path.sep}`)
}

export function validateAssets(repoRoot: string): string[] {
  const errors: string[] = []
  const file = path.join(repoRoot, 'brand', 'assets', 'asset-manifest.yaml')
  const manifest = parse(fs.readFileSync(file, 'utf8')) as AssetManifest
  const schemaPath = path.join(repoRoot, 'schemas', 'asset.schema.json')
  const validate = fs.existsSync(schemaPath) ? new Ajv({ allErrors: true, strict: false }).compile(JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as object) : null
  const ids = new Set<string>()
  for (const asset of manifest.assets) {
    if (validate && !(validate(asset) as boolean)) errors.push(`${asset.id} failed the asset schema`)
    if (!assetPathIsSafe(repoRoot, asset.path)) errors.push(`${asset.id} has an unsafe path`)
    if (ids.has(asset.id)) errors.push(`Duplicate asset id ${asset.id}`)
    ids.add(asset.id)
    const full = path.join(repoRoot, asset.path)
    if (asset.present) {
      if (!fs.existsSync(full)) errors.push(`${asset.id} is present but ${asset.path} is missing`)
      else {
        const bytes = fs.readFileSync(full)
        const actual = createHash('sha256').update(bytes).digest('hex')
        if (asset.checksum_sha256 && actual !== asset.checksum_sha256) errors.push(`${asset.id} checksum mismatch`)
        if (asset.path.toLowerCase().endsWith('.svg') && assetPathIsSafe(repoRoot, asset.path)) {
          errors.push(...svgErrors(asset.id, svgPublicationIssues(bytes.toString('utf8'))))
        }
        const approved = asset.status === 'approved' || asset.status === 'published'
        if (approved && asset.approved_sha256 && asset.approved_sha256 !== actual) {
          errors.push(`${asset.id} is ${asset.status}, but its file is not the approved file (approved_sha256 differs). Approve the new file with npm run brand:assets -- approve --ids ${asset.id}`)
        }
      }
    } else if (asset.status === 'approved') {
      errors.push(`${asset.id} cannot be approved while present is false`)
    } else if (!asset.missing_reason) {
      errors.push(`${asset.id} is missing without missing_reason`)
    }
    errors.push(...derivationErrors(repoRoot, asset))
  }
  return errors
}

function svgErrors(id: string, issues: SvgIssue[]): string[] {
  if (issues.length === 0) return []
  const shown = issues.slice(0, 3).map((issue) => `${issue.code}${issue.line ? ` (line ${issue.line})` : ''}: ${issue.message}`)
  const more = issues.length > 3 ? ` (+${issues.length - 3} more; run npm run brand:assets -- check)` : ''
  const fix = issues.every((issue) => issue.fixable) ? ` Fixable: ${normalizeCommand(id)}` : ' Not fixable automatically: fix the source file and export it again.'
  return [`${id} fails the SVG check: ${shown.join('; ')}${more}.${fix}`]
}

function derivationErrors(repoRoot: string, asset: AssetRecord): string[] {
  const errors: string[] = []
  if (asset.derived_from) {
    const source = asset.derived_from
    const root = path.resolve(repoRoot, ASSET_SOURCE_DIR)
    const full = path.resolve(repoRoot, String(source.path ?? ''))
    if (typeof source.path !== 'string' || !source.path.startsWith(`${ASSET_SOURCE_DIR}/`) || source.path.includes('..') || !full.startsWith(`${root}${path.sep}`)) {
      errors.push(`${asset.id} derived_from.path must be inside ${ASSET_SOURCE_DIR}/`)
    } else if (!fs.existsSync(full)) errors.push(`${asset.id} derived_from.path ${source.path} is missing`)
    else if (createHash('sha256').update(fs.readFileSync(full)).digest('hex') !== source.sha256) errors.push(`${asset.id} derived_from.sha256 does not match ${source.path}`)
    if (!asset.normalizer?.version) errors.push(`${asset.id} has derived_from but no normalizer.version`)
  }
  if (asset.approval_carried_from && asset.render_check?.result !== 'identical') {
    errors.push(`${asset.id} carries an approval without an identical render_check`)
  }
  return errors
}

export interface SvgAssetReport {
  id: string
  path: string
  status: string
  ok: boolean
  fixable: boolean
  issues: SvgIssue[]
  warnings: SvgIssue[]
  /** The command to run when every issue is fixable, otherwise null. */
  fix: string | null
}

/** `brand:assets check`: every present SVG in the manifest, with the same verdict Studio, docs and MCP apply. */
export function checkAssets(repoRoot: string, ids?: string[]): SvgAssetReport[] {
  const manifest = parse(fs.readFileSync(path.join(repoRoot, 'brand', 'assets', 'asset-manifest.yaml'), 'utf8')) as AssetManifest
  const reports: SvgAssetReport[] = []
  for (const asset of manifest.assets ?? []) {
    if (ids && !ids.includes(asset.id)) continue
    if (!asset.present || typeof asset.path !== 'string' || !asset.path.toLowerCase().endsWith('.svg')) continue
    const full = path.join(repoRoot, asset.path)
    let issues: SvgIssue[]
    let warnings: SvgIssue[] = []
    if (!assetPathIsSafe(repoRoot, asset.path)) issues = [{ code: 'not-svg', message: 'The path is outside brand/assets.', line: null, fixable: false }]
    else if (!fs.existsSync(full)) issues = [{ code: 'not-svg', message: 'The file is missing.', line: null, fixable: false }]
    else {
      const text = fs.readFileSync(full, 'utf8')
      issues = svgPublicationIssues(text)
      warnings = checkSvg(text).warnings
    }
    const fixable = issues.length > 0 && issues.every((issue) => issue.fixable)
    reports.push({ id: asset.id, path: asset.path, status: asset.status, ok: issues.length === 0, fixable, issues, warnings, fix: fixable ? normalizeCommand(asset.id) : null })
  }
  return reports
}

/**
 * Change top-level keys of one manifest asset without reformatting anything else: only the lines of
 * the changed keys are rewritten (an undefined value deletes the key). The result is parsed again
 * and must equal the intended record exactly, or nothing is written.
 */
export function patchManifestAsset(repoRoot: string, id: string, changes: Record<string, unknown>): void {
  const file = path.join(repoRoot, 'brand', 'assets', 'asset-manifest.yaml')
  const text = fs.readFileSync(file, 'utf8')
  const doc = parseDocument(text)
  const assets = doc.get('assets')
  const node = isSeq(assets) ? assets.items.find((item) => isMap(item) && item.get('id') === id) : undefined
  if (!node || !isMap(node) || !node.range) throw new Error(`No asset ${id} in asset-manifest.yaml`)
  const intended: Record<string, unknown> = { ...(node.toJSON() as Record<string, unknown>) }
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete intended[key]
    else intended[key] = value
  }

  const [start, , end] = node.range
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const indent = start - lineStart
  const head = text.slice(0, lineStart)
  const firstLinePrefix = text.slice(lineStart, start) // "  - " before the first key
  const body = text.slice(start, end).replace(/\n+$/, '')
  const tail = text.slice(start + body.length)
  // Work on whole lines: the "- " marker of the first line becomes spaces and is restored at the end.
  const lines = `${' '.repeat(indent)}${body}`.split('\n')
  // Split the item into key blocks: a block starts at a line indented exactly `indent` with "key:".
  const blocks: Array<{ key: string | null; lines: string[] }> = []
  for (const line of lines) {
    const match = new RegExp(`^ {${indent}}([A-Za-z0-9_-]+):(?:\\s|$)`).exec(line)
    if (match) blocks.push({ key: match[1]!, lines: [line] })
    else if (blocks.length) blocks.at(-1)!.lines.push(line)
    else blocks.push({ key: null, lines: [line] })
  }
  const render = (key: string, value: unknown): string[] =>
    stringify({ [key]: value }, { lineWidth: 0 }).replace(/\n$/, '').split('\n').map((line) => `${' '.repeat(indent)}${line}`)
  for (const [key, value] of Object.entries(changes)) {
    const index = blocks.findIndex((block) => block.key === key)
    if (value === undefined) {
      if (index >= 0) blocks.splice(index, 1)
    } else if (index >= 0) {
      // Keep trailing blank lines that belonged to the old block.
      const old = blocks[index]!.lines
      let last = old.length - 1
      while (last > 0 && !old[last]!.trim()) last -= 1
      const trailing = old.slice(last + 1)
      blocks[index] = { key, lines: [...render(key, value), ...trailing] }
    } else {
      let at = blocks.length
      while (at > 0 && blocks[at - 1]!.lines.every((line) => !line.trim())) at -= 1
      blocks.splice(at, 0, { key, lines: render(key, value) })
    }
  }
  const rebuilt = firstLinePrefix + blocks.flatMap((block) => block.lines).join('\n').slice(indent)
  const next = head + rebuilt + tail

  const check = parseDocument(next)
  const after = check.get('assets')
  const item = isSeq(after) ? after.items.find((entry) => isMap(entry) && entry.get('id') === id) : undefined
  const others = (value: unknown): unknown => (value as { assets: Array<{ id: string }> }).assets.filter((asset) => asset.id !== id)
  if (check.errors.length > 0 || !isMap(item) || JSON.stringify(item.toJSON()) !== JSON.stringify(intended) || JSON.stringify(others(check.toJSON())) !== JSON.stringify(others(doc.toJSON()))) {
    throw new Error(`Refusing to write asset-manifest.yaml: the edit of ${id} did not round-trip`)
  }
  fs.writeFileSync(file, next)
}
