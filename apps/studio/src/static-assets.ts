import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** The Studio's own CSS, script, icons and fonts. Nothing else lives here. */
export const STATIC_DIR = path.resolve(import.meta.dirname, '..', 'static')

export interface StaticAsset {
  body: Buffer
  /** Strong validator, quoted as HTTP requires. */
  etag: string
  /** Short content hash used in `?v=` so a page links to the exact bytes it was built with. */
  version: string
}

const ONE_YEAR = 365 * 86400
const ONE_WEEK = 7 * 86400
const FIVE_MINUTES = 300

/**
 * Reads each allowlisted static file once and keeps it in memory with its hash. The files ship with
 * the image and never change while the process runs, so a restart (every deploy) picks up new bytes.
 * Callers decide which names are allowed; this class never lists or reads anything it is not asked for.
 */
export class StaticAssets {
  readonly #dir: string
  readonly #cache = new Map<string, StaticAsset>()

  constructor(dir: string = STATIC_DIR) {
    this.#dir = dir
  }

  get(name: string): StaticAsset {
    const cached = this.#cache.get(name)
    if (cached) return cached
    const body = fs.readFileSync(path.join(this.#dir, name))
    const digest = crypto.createHash('sha256').update(body).digest('base64url')
    const asset = { body, etag: `"${digest.slice(0, 27)}"`, version: digest.slice(0, 12) }
    this.#cache.set(name, asset)
    return asset
  }

  /** `/static/<name>?v=<hash>`: safe to cache for a year, because new bytes mean a new URL. */
  url(name: string): string {
    return `/static/${name}?v=${this.get(name).version}`
  }
}

/** The process-wide instance the server and the page layout share. */
export const studioAssets = new StaticAssets()

/** True when the request's `If-None-Match` already names this exact version. */
export function notModified(req: IncomingMessage, etag: string): boolean {
  const header = req.headers['if-none-match']
  if (!header) return false
  return header
    .split(',')
    .map((item) => item.trim().replace(/^W\//, ''))
    .some((item) => item === etag || item === '*')
}

/**
 * Cache policy:
 * - a `?v=` that matches the current hash: one year, immutable (the URL changes when the bytes do);
 * - fonts: one week (their names are fixed and they are replaced only with a new name);
 * - everything else, or an old `?v=` from a page rendered before a deploy: five minutes.
 * Every response carries an ETag, so a stale copy is revalidated with a body-less 304.
 */
export function cacheControl(name: string, asset: StaticAsset, requestedVersion: string | null): string {
  if (requestedVersion && requestedVersion === asset.version) return `public, max-age=${ONE_YEAR}, immutable`
  if (name.startsWith('fonts/')) return `public, max-age=${ONE_WEEK}`
  return `public, max-age=${FIVE_MINUTES}`
}

export function sendStatic(req: IncomingMessage, res: ServerResponse, name: string, type: string, asset: StaticAsset, requestedVersion: string | null): void {
  res.setHeader('Content-Type', type)
  res.setHeader('Cache-Control', cacheControl(name, asset, requestedVersion))
  res.setHeader('ETag', asset.etag)
  if (notModified(req, asset.etag)) {
    res.statusCode = 304
    res.end()
    return
  }
  res.statusCode = 200
  res.setHeader('Content-Length', asset.body.length)
  res.end(req.method === 'HEAD' ? undefined : asset.body)
}
