import fs from 'node:fs'
import { DeliveryLog, parsePush, verifyWebhookSignature } from '../github/webhook.js'
import { sendJson } from '../http.js'
import { sendStatic, studioAssets } from '../static-assets.js'
import { brandIsReady } from '../sync.js'
import type { Handler, StudioCore } from './context.js'

const STATIC_FILES: Record<string, string> = {
  'studio.css': 'text/css; charset=utf-8',
  'studio.js': 'text/javascript; charset=utf-8',
  'visual.css': 'text/css; charset=utf-8',
  'visual.js': 'text/javascript; charset=utf-8',
  'visual-book.css': 'text/css; charset=utf-8',
  'favicon.svg': 'image/svg+xml',
  'logo-omid-ataei-white.svg': 'image/svg+xml',
  'fonts/inter-var.woff2': 'font/woff2',
  'fonts/rajdhani-medium.woff2': 'font/woff2',
  'fonts/rajdhani-semibold.woff2': 'font/woff2',
  'fonts/rajdhani-bold.woff2': 'font/woff2',
  'fonts/vazirmatn-var.woff2': 'font/woff2',
}

/** Routes that need no session: the health check, static files and the signed GitHub webhook. */
export function systemRoutes(core: StudioCore): { health: Handler; staticFile: Handler; webhook: Handler } {
  const { config, registry, sync, log, notFound } = core
  const deliveries = new DeliveryLog()

  /** Liveness and readiness in one: the process answers and its data directory is writable. Reveals nothing else. */
  const health: Handler = (ctx) => {
    let ok = true
    try {
      fs.accessSync(config.dataDir, fs.constants.W_OK)
    } catch {
      ok = false
    }
    ctx.res.statusCode = ok ? 200 : 503
    ctx.res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    ctx.res.setHeader('Cache-Control', 'no-store')
    ctx.res.end(ok ? 'ok\n' : 'unavailable\n')
  }

  const staticFile: Handler = (ctx, match) => {
    const name = match[1] ?? ''
    const type = STATIC_FILES[name]
    if (!type) return notFound(ctx)
    // Served from memory with an ETag; see static-assets.ts for the cache policy.
    sendStatic(ctx.req, ctx.res, name, type, studioAssets.get(name), ctx.url.searchParams.get('v'))
  }

  const webhook: Handler = (ctx) => {
    if (!verifyWebhookSignature(config.github.webhookSecret, ctx.raw, ctx.req.headers['x-hub-signature-256'] as string | undefined)) {
      log('webhook signature rejected')
      return sendJson(ctx.res, 401, { error: 'invalid_signature' })
    }
    const delivery = ctx.req.headers['x-github-delivery'] as string | undefined
    if (!deliveries.firstTime(delivery)) return sendJson(ctx.res, 200, { status: 'duplicate' })
    const event = ctx.req.headers['x-github-event']
    if (event === 'ping') return sendJson(ctx.res, 200, { status: 'pong' })
    if (event !== 'push') return sendJson(ctx.res, 202, { status: 'ignored' })
    let body: unknown
    try {
      body = JSON.parse(ctx.raw.toString('utf8'))
    } catch {
      return sendJson(ctx.res, 400, { error: 'invalid_json' })
    }
    const push = parsePush(body)
    if (!push) return sendJson(ctx.res, 400, { error: 'invalid_push' })
    const record = registry.byRepository(push.repositoryId, push.fullName)
    if (!record || !brandIsReady(record) || push.ref !== `refs/heads/${record.repo.default_branch}`) return sendJson(ctx.res, 202, { status: 'ignored' })
    // The payload is only a hint. Studio fetches the branch itself with its own read access.
    sync.markDirty(record.slug)
    void sync.refresh(record.slug).catch(() => undefined)
    log(`webhook push for ${record.slug}`)
    sendJson(ctx.res, 202, { status: 'refreshing' })
  }

  return { health, staticFile, webhook }
}
