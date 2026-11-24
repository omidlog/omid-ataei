import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { LOGO_ICON_TAGS, LOGO_MASTERS_FACT, masterReferenceTokens } from './visual/identity.js'

/**
 * BOS-16: the approved `brand.logo.masters` answer is machine-read. The master logo is found only by an exact asset id
 * or an exact manifest path in it (a file name works only when it names exactly one asset). This check runs when the
 * answer is recorded, before it is approved and in `validate`, and says which ids to name instead. It is a warning,
 * never a block, and it changes nothing.
 */

export interface LogoMastersCheck {
  /** `ok`: names at least one asset exactly. `unmatched`: names none exactly. `no_assets`: nothing real to name yet. */
  status: 'ok' | 'unmatched' | 'no_assets'
  /** Assets named by exact id or exact manifest path. */
  named: string[]
  /** Assets the text names only by a bare file name. */
  by_file_name: string[]
  /** Ids to name instead: the file-name matches, else every real logo and icon in the manifest. */
  candidates: string[]
  /** One-line warning in English (CLI and validate), null when there is nothing to say. */
  message: string | null
}

interface ManifestRow {
  id?: unknown
  path?: unknown
  preview?: unknown
  tags?: unknown
  license?: unknown
}

function tagsOf(row: ManifestRow): string[] {
  return Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.toLowerCase()) : []
}

/** A template placeholder: tagged `example` or `placeholder`, an EXAMPLE licence, or an example id. */
export function isExampleAsset(row: ManifestRow): boolean {
  const tags = tagsOf(row)
  return tags.includes('example') || tags.includes('placeholder') || /EXAMPLE/.test(String(row.license ?? '')) || /(^|\.)example[-.]/i.test(String(row.id ?? ''))
}

/** Logo and icon rows a `brand.logo.masters` answer can name: real (not example) assets tagged `logo` or an icon tag. */
function logoRows(rows: ManifestRow[]): Array<{ id: string; paths: string[] }> {
  return rows.flatMap((row) => {
    if (typeof row.id !== 'string' || isExampleAsset(row)) return []
    const tags = tagsOf(row)
    if (!tags.includes('logo') && !LOGO_ICON_TAGS.some((tag) => tags.includes(tag))) return []
    const paths = [row.path, row.preview].filter((item): item is string => typeof item === 'string' && item.length > 0).map((item) => item.replace(/^\.\//, ''))
    return [{ id: row.id, paths: [...new Set(paths)] }]
  })
}

export function checkLogoMastersReference(text: string | null | undefined, manifestRows: ManifestRow[]): LogoMastersCheck {
  const rows = logoRows(manifestRows)
  const empty: LogoMastersCheck = { status: 'no_assets', named: [], by_file_name: [], candidates: [], message: null }
  if (rows.length === 0 || typeof text !== 'string' || !text.trim()) return empty
  const tokens = new Set(masterReferenceTokens(text))
  const named = rows.filter((row) => tokens.has(row.id) || row.paths.some((file) => tokens.has(file))).map((row) => row.id)
  const byFile = rows.filter((row) => !named.includes(row.id) && row.paths.some((file) => tokens.has(file.split('/').pop() ?? ''))).map((row) => row.id)
  if (named.length) return { status: 'ok', named, by_file_name: byFile, candidates: [], message: null }
  const candidates = byFile.length ? byFile : rows.map((row) => row.id)
  const example = candidates[0]!
  const message = byFile.length
    ? `${LOGO_MASTERS_FACT} names no exact asset id or manifest path. Matching assets by file name: ${byFile.join(', ')}. Name the master by asset id (for example "${example}") or by its full manifest path.`
    : `${LOGO_MASTERS_FACT} names no exact asset id or manifest path, so no logo file is linked to it. Logo and icon assets in the manifest: ${candidates.join(', ')}. Name the master by asset id (for example "${example}") or by its full manifest path.`
  return { status: 'unmatched', named: [], by_file_name: byFile, candidates, message }
}

/** The same check against `brand/assets/asset-manifest.yaml` of a workspace. A missing or broken manifest says nothing. */
export function checkLogoMastersInRepo(root: string, text: string | null | undefined): LogoMastersCheck {
  let rows: ManifestRow[] = []
  try {
    const file = path.join(root, 'brand', 'assets', 'asset-manifest.yaml')
    if (fs.existsSync(file)) rows = ((parse(fs.readFileSync(file, 'utf8')) as { assets?: ManifestRow[] } | null)?.assets ?? []).filter((row) => row && typeof row === 'object')
  } catch {
    rows = []
  }
  return checkLogoMastersReference(text, rows)
}
