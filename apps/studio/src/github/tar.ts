import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

/**
 * Safe extraction of a GitHub repository tarball.
 *
 * Only regular files whose repository-relative path passes `include` are written. Symlinks, hard links,
 * devices and anything else are skipped and reported, never created. Paths are normalized and refused
 * when absolute, when they contain `..`, a backslash or a NUL byte, or when they would leave `destRoot`.
 * Size and count limits stop a decompression bomb.
 */
export interface ExtractOptions {
  destRoot: string
  include: (relativePath: string) => boolean
  maxFiles?: number
  maxFileBytes?: number
  maxTotalBytes?: number
}

export interface ExtractReport {
  files: string[]
  /** Extracted files whose archive mode has an execute bit (written 0644 on disk regardless). */
  executables: string[]
  skipped: Array<{ path: string; reason: string }>
}

const BLOCK = 512

function field(header: Buffer, start: number, length: number): string {
  const raw = header.subarray(start, start + length)
  const end = raw.indexOf(0)
  return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8')
}

function octal(header: Buffer, start: number, length: number): number {
  const value = field(header, start, length).trim()
  if (!/^[0-7]*$/.test(value)) throw new Error('Corrupt archive header.')
  return value ? parseInt(value, 8) : 0
}

function parsePax(data: Buffer): Record<string, string> {
  const out: Record<string, string> = {}
  let offset = 0
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset)
    if (space === -1) break
    const length = Number(data.subarray(offset, space).toString('ascii'))
    if (!Number.isInteger(length) || length <= 0) break
    const record = data.subarray(space + 1, offset + length - 1).toString('utf8')
    const eq = record.indexOf('=')
    if (eq > 0) out[record.slice(0, eq)] = record.slice(eq + 1)
    offset += length
  }
  return out
}

/** Strips GitHub's `owner-repo-sha/` prefix and normalizes. Returns null for an unsafe path. */
export function repoRelative(archivePath: string): string | null {
  if (archivePath.includes('\0') || archivePath.includes('\\')) return null
  const parts = archivePath.split('/').filter((part) => part !== '' && part !== '.')
  if (parts.length < 2) return null
  const rest = parts.slice(1)
  if (rest.some((part) => part === '..')) return null
  if (archivePath.startsWith('/')) return null
  return rest.join('/')
}

export function extractTarGz(archive: Buffer, options: ExtractOptions): ExtractReport {
  const maxFiles = options.maxFiles ?? 20_000
  const maxFileBytes = options.maxFileBytes ?? 10 * 1024 * 1024
  const maxTotalBytes = options.maxTotalBytes ?? 200 * 1024 * 1024
  let tar: Buffer
  try {
    tar = zlib.gunzipSync(archive, { maxOutputLength: maxTotalBytes + 64 * 1024 * 1024 })
  } catch {
    throw new Error('The repository archive could not be decompressed or is too large.')
  }
  const root = path.resolve(options.destRoot)
  fs.mkdirSync(root, { recursive: true })
  const report: ExtractReport = { files: [], executables: [], skipped: [] }
  let offset = 0
  let total = 0
  let pendingPath: string | null = null
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK)
    if (header.every((byte) => byte === 0)) break
    const size = octal(header, 124, 12)
    const type = String.fromCharCode(header[156] ?? 0)
    const prefix = field(header, 345, 155)
    const name = field(header, 0, 100)
    const dataStart = offset + BLOCK
    const dataEnd = dataStart + size
    if (dataEnd > tar.length) throw new Error('Truncated archive.')
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK
    const data = tar.subarray(dataStart, dataEnd)
    if (type === 'g') continue
    if (type === 'x') {
      pendingPath = parsePax(data).path ?? null
      continue
    }
    if (type === 'L') {
      pendingPath = data.toString('utf8').replace(/\0+$/, '')
      continue
    }
    const archivePath = pendingPath ?? (prefix ? `${prefix}/${name}` : name)
    pendingPath = null
    if (type === '5') continue
    const relative = repoRelative(archivePath)
    if (relative === null) {
      report.skipped.push({ path: archivePath.slice(0, 200), reason: 'unsafe path' })
      continue
    }
    if (type !== '0' && type !== '\0' && type !== '7') {
      if (options.include(relative)) report.skipped.push({ path: relative, reason: type === '2' ? 'symlink' : type === '1' ? 'hard link' : 'not a regular file' })
      continue
    }
    if (!options.include(relative)) continue
    if (size > maxFileBytes) {
      report.skipped.push({ path: relative, reason: 'file too large' })
      continue
    }
    total += size
    if (total > maxTotalBytes) throw new Error('The repository archive is larger than Studio accepts.')
    if (report.files.length >= maxFiles) throw new Error('The repository archive has more files than Studio accepts.')
    const target = path.resolve(root, relative)
    if (!target.startsWith(root + path.sep)) {
      report.skipped.push({ path: relative, reason: 'unsafe path' })
      continue
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    // `wx` refuses to follow anything that already exists at the target, including a planted symlink.
    fs.writeFileSync(target, data, { mode: 0o644, flag: 'wx' })
    report.files.push(relative)
    if ((octal(header, 100, 8) & 0o111) !== 0) report.executables.push(relative)
  }
  return report
}

/**
 * The only repository paths Studio ever reads. Everything that Brand OS keeps local or private is
 * excluded even if someone committed it by mistake.
 */
const EXCLUDED_PREFIXES = ['brand/.private/', 'brand/restricted/', 'brand/exports/', 'brand/generated/artifacts/']
const EXCLUDED_NAMES = new Set(['approval-secret', 'agent-tokens.json', 'access-log.jsonl', 'store.json'])

/**
 * `brand/knowledge/` holds the owner's notes. Only explicitly shared notes, one level deep under
 * `brand/knowledge/shared/` and named `*.md`, may reach Studio. Caches, link registries, READMEs and any
 * other file there stay out even if committed. The check is case-insensitive so `brand/Knowledge/` on a
 * case-insensitive checkout cannot slip past it.
 */
const SHARED_NOTE = /^brand\/knowledge\/shared\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.md$/

export function studioKnowledgePathAllowed(relative: string): boolean {
  return SHARED_NOTE.test(relative)
}

/**
 * `brand/creative/` may only contribute decisions the owner explicitly shared with `brand:creative share`:
 * `brand/creative/shared/cp_<uuid>.json`, one level deep. Creative projects, feedback and drafts live under
 * `brand/.private/creative` and are excluded above; anything else committed under `brand/creative/` stays out.
 */
const SHARED_DECISION = /^brand\/creative\/shared\/cp_[0-9a-f-]{36}\.json$/

export function studioCreativePathAllowed(relative: string): boolean {
  return SHARED_DECISION.test(relative)
}

/**
 * `brand/content-calendar/` may only contribute weeks the owner explicitly shared with `brand:content share`:
 * `brand/content-calendar/shared/wk-YYYY-MM-DD.json`, one level deep. Drafts and week records live under
 * `brand/.private/content` and are excluded above; anything else committed under `brand/content-calendar/` stays out.
 */
const SHARED_WEEK = /^brand\/content-calendar\/shared\/wk-\d{4}-\d{2}-\d{2}\.json$/

export function studioCalendarPathAllowed(relative: string): boolean {
  return SHARED_WEEK.test(relative)
}

/**
 * `brand/competitive/` may only contribute the redacted landscape the owner wrote with `brand:competitive share`
 * (Visual V2.2, D1): exactly `brand/competitive/shared/landscape.json`. Competitor records stay in
 * `brand/.private/competitive` (excluded above); anything else committed under `brand/competitive/` stays out.
 */
const SHARED_LANDSCAPE = /^brand\/competitive\/shared\/landscape\.json$/

export function studioCompetitivePathAllowed(relative: string): boolean {
  return SHARED_LANDSCAPE.test(relative)
}

export function studioPathAllowed(relative: string): boolean {
  if (!relative.startsWith('brand/')) return false
  if (relative.toLowerCase().startsWith('brand/competitive/') || relative.toLowerCase() === 'brand/competitive') return studioCompetitivePathAllowed(relative)
  if (relative.toLowerCase().startsWith('brand/content-calendar/') || relative.toLowerCase() === 'brand/content-calendar') return studioCalendarPathAllowed(relative)
  if (relative.toLowerCase().startsWith('brand/creative/') || relative.toLowerCase() === 'brand/creative') return studioCreativePathAllowed(relative)
  // Checked first: nothing below may re-admit a knowledge path.
  if (relative.toLowerCase().startsWith('brand/knowledge/') || relative.toLowerCase() === 'brand/knowledge') return studioKnowledgePathAllowed(relative)
  if (EXCLUDED_PREFIXES.some((prefix) => relative.startsWith(prefix))) return false
  const base = relative.split('/').pop() ?? ''
  if (base === '.env' || base.startsWith('.env.')) return false
  if (EXCLUDED_NAMES.has(base)) return false
  return true
}
