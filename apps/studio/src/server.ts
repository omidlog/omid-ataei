import type { IncomingMessage, ServerResponse } from 'node:http'
import { safeEqual, SessionStore } from './auth/session.js'
import { TotpVerifier } from './auth/totp.js'
import { BodyTooLarge, first, parseCookies, parseForm, readBody, redirect, securityHeaders, sendJson, serializeCookie } from './http.js'
import { i18n, isLocale, type Locale } from './i18n/index.js'
import { accountRoutes } from './routes/account.js'
import { authRoutes } from './routes/auth.js'
import { BRAND_SECTIONS, brandRoutes, LEGACY_PATHS } from './routes/brands.js'
import { createCore, type RequestContext, type Route, type RouteInfo, type StudioDeps } from './routes/context.js'
import { requestGuards } from './routes/guards.js'
import { provisioningRoutes } from './routes/provisioning.js'
import { systemRoutes } from './routes/system.js'
import { visualRoutes } from './routes/visual.js'
import { PLAN_ROUTE_PATHS, planRoutes } from './routes/visual-plan.js'
import * as pages from './views/pages.js'

export type { RouteInfo, StudioDeps } from './routes/context.js'

/**
 * The Studio HTTP application.
 *
 * Read-only by construction: the route table below is the complete list of endpoints. The only
 * non-GET routes are sign-in, sign-out, the owner-only provisioning routes (create, retry, discard a
 * failed attempt from Studio's own registry), the cache refresh, the signed GitHub webhook, and
 * "Open update PR" (Studio's second GitHub write: a new `template-update/<sha>` branch and a pull
 * request in a brand repository; never the default branch, never a merge). None of them writes brand
 * facts, documents or assets. Every brand route resolves the slug through the
 * server-side registry, so a forged slug cannot select a repository.
 */
export function createStudio(deps: StudioDeps): {
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  sessions: SessionStore
  routes: RouteInfo[]
} {
  const { config } = deps
  const now = deps.now ?? Date.now
  const sessions = new SessionStore(config.sessionTtlMs, config.idleTtlMs, now)
  const totp = config.ownerTotpSecret ? new TotpVerifier(config.ownerTotpSecret) : null
  const core = createCore(deps, sessions, totp)
  const { log, view, render, notFound } = core
  const sessionCookie = core.cookies.session
  const langCookie = core.cookies.lang

  const { clientIp, hostAllowed, sameOrigin } = requestGuards(config)

  /* ------------------------------------------------------------ handlers */

  const { health, staticFile, webhook } = systemRoutes(core)

  const { loginForm, login, logout } = authRoutes(core, { clientIp, sameOrigin })

  const { home, brands, refresh, openUpdatePull, assetFile, brandPage, legacyRedirect } = brandRoutes(core)

  const { newBrandForm, repoCheck, createBrand, provisioningStatus, provisioningJson, retryProvisioning, discardForm, discardProvisioning } = provisioningRoutes(core)

  const { account } = accountRoutes(core)

  const { visual } = visualRoutes(core)
  const { plan } = planRoutes(core)

  const SLUG = '([a-z0-9]+(?:-[a-z0-9]+)*)'
  const routes: Route[] = [
    { method: 'GET', pattern: /^\/healthz$/, auth: 'none', handle: health },
    { method: 'GET', pattern: /^\/static\/((?:fonts\/)?[a-z0-9.-]+)$/, auth: 'none', handle: staticFile },
    { method: 'GET', pattern: /^\/login$/, auth: 'none', handle: loginForm },
    { method: 'POST', pattern: /^\/login$/, auth: 'none', writes: 'creates an owner session', handle: login },
    { method: 'POST', pattern: /^\/logout$/, auth: 'session', writes: 'ends the owner session', handle: logout },
    { method: 'POST', pattern: /^\/webhooks\/github$/, auth: 'none', writes: 'marks a brand cache stale (signed GitHub push only)', handle: webhook },
    { method: 'GET', pattern: /^\/$/, auth: 'session', handle: home },
    { method: 'GET', pattern: /^\/account$/, auth: 'session', handle: account },
    { method: 'GET', pattern: /^\/brands$/, auth: 'session', handle: brands },
    { method: 'GET', pattern: /^\/brands\/new$/, auth: 'session', handle: newBrandForm },
    { method: 'GET', pattern: /^\/brands\/new\/repo-check\.json$/, auth: 'session', handle: repoCheck },
    { method: 'POST', pattern: /^\/brands\/new$/, auth: 'session', writes: 'provisions one new private brand repository (the first of two GitHub writes)', handle: createBrand },
    { method: 'GET', pattern: new RegExp(`^/brands/${SLUG}/provisioning$`), auth: 'session', handle: provisioningStatus },
    { method: 'GET', pattern: new RegExp(`^/brands/${SLUG}/provisioning\\.json$`), auth: 'session', handle: provisioningJson },
    { method: 'POST', pattern: new RegExp(`^/brands/${SLUG}/provisioning/retry$`), auth: 'session', writes: 'retries a failed provisioning of a new repository', handle: retryProvisioning },
    { method: 'GET', pattern: new RegExp(`^/brands/${SLUG}/provisioning/discard$`), auth: 'session', handle: discardForm },
    { method: 'POST', pattern: new RegExp(`^/brands/${SLUG}/provisioning/discard$`), auth: 'session', writes: "removes a failed provisioning attempt from Studio's registry (never calls GitHub)", handle: discardProvisioning },
    { method: 'POST', pattern: new RegExp(`^/brands/${SLUG}/refresh$`), auth: 'session', writes: 'refreshes the Studio read cache from GitHub', handle: refresh },
    {
      method: 'POST',
      pattern: new RegExp(`^/brands/${SLUG}/template-update$`),
      auth: 'session',
      writes: 'opens one template update pull request on a new template-update/<sha> branch in the brand repository (never the default branch, never a merge)',
      handle: openUpdatePull,
    },
    { method: 'GET', pattern: new RegExp(`^/brands/${SLUG}/assets/file/([0-9a-f]{64})$`), auth: 'session', handle: assetFile },
    { method: 'GET', pattern: new RegExp(`^/brands/${SLUG}/(strategy/business-model|brand/book/visual-identity|market/competitors|brand/mascot|strategy/swot-tows|strategy/value-proposition)(?:/(print))?$`), auth: 'session', handle: visual },
    // Visual V3.3: customer journey map, SOSTAC overview, OKR tree (and their print views).
    { method: 'GET', pattern: new RegExp(`^/brands/${SLUG}/(${PLAN_ROUTE_PATHS.join('|')})(?:/(print))?$`), auth: 'session', handle: plan },
    { method: 'GET', pattern: new RegExp(`^/brands/${SLUG}(?:/(${BRAND_SECTIONS.join('|')}))?$`), auth: 'session', handle: brandPage },
    // Old flat paths (before Visual V2.4): 301 to the stable path, for one release.
    { method: 'GET', pattern: new RegExp(`^/brands/${SLUG}/(${LEGACY_PATHS.join('|')})$`), auth: 'session', handle: legacyRedirect },
  ]

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    securityHeaders(res, config.secureCookies)
    let url: URL
    try {
      url = new URL(req.url ?? '/', 'http://studio.invalid')
    } catch {
      res.statusCode = 400
      res.end()
      return
    }
    if (url.pathname !== '/healthz' && !hostAllowed(req)) {
      res.statusCode = 421
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end('Misdirected request.\n')
      return
    }
    const cookies = parseCookies(req.headers.cookie)
    const method = req.method === 'HEAD' ? 'GET' : (req.method ?? 'GET')
    const lang = url.searchParams.get('lang')
    if (method === 'GET' && isLocale(lang)) {
      res.setHeader('Set-Cookie', serializeCookie(langCookie, lang, { secure: config.secureCookies, maxAgeSeconds: 365 * 86400 }))
      url.searchParams.delete('lang')
      const rest = url.searchParams.toString()
      return redirect(res, `${url.pathname}${rest ? `?${rest}` : ''}`, 302)
    }
    const locale: Locale = isLocale(cookies[langCookie]) ? (cookies[langCookie] as Locale) : 'en'
    const sessionId = cookies[sessionCookie] ?? null
    const session = sessions.get(sessionId ?? undefined)
    const ctx: RequestContext = { req, res, url, locale, i: i18n(locale), session, sessionId: session ? sessionId : null, form: {}, raw: Buffer.alloc(0) }
    const candidates = routes.filter((route) => route.pattern.test(url.pathname))
    const route = candidates.find((item) => item.method === method)
    try {
      if (!route) {
        if (candidates.length) {
          res.setHeader('Allow', [...new Set(candidates.map((item) => item.method))].join(', '))
          if (!session) return sendJson(res, 405, { error: 'method_not_allowed' })
          return render(ctx, 405, pages.errorPage(view(ctx), 'method'))
        }
        if (!session) return redirect(res, '/login', 302)
        return notFound(ctx)
      }
      if (route.auth === 'session' && !session) {
        // Guests learn nothing, not even whether a brand slug exists.
        if (method === 'GET' && !url.pathname.endsWith('.json')) return redirect(res, `/login?next=${encodeURIComponent(url.pathname)}`, 302)
        return sendJson(res, 401, { error: 'authentication_required' })
      }
      if (method === 'POST') {
        const isWebhook = route.handle === webhook
        try {
          ctx.raw = await readBody(req, isWebhook ? 1024 * 1024 : 32 * 1024)
        } catch (error) {
          if (error instanceof BodyTooLarge) return sendJson(res, 413, { error: 'too_large' })
          throw error
        }
        if (!isWebhook) {
          const type = req.headers['content-type'] ?? ''
          if (!type.startsWith('application/x-www-form-urlencoded')) return sendJson(res, 415, { error: 'unsupported_media_type' })
          ctx.form = parseForm(ctx.raw)
        }
        if (route.auth === 'session') {
          if (!sameOrigin(req) || !safeEqual(first(ctx.form._csrf), session!.csrf)) return render(ctx, 403, pages.errorPage(view(ctx), 'forbidden'))
        }
      }
      await route.handle(ctx, url.pathname.match(route.pattern)!)
    } catch (error) {
      log(`error on ${method} ${url.pathname}: ${error instanceof Error ? error.message : 'unknown'}`)
      if (!res.headersSent) {
        if (session) render(ctx, 500, pages.errorPage(view(ctx), 'server'))
        else sendJson(res, 500, { error: 'server_error' })
      } else res.end()
    }
  }

  return {
    handle,
    sessions,
    routes: routes.map((route) => ({ method: route.method, pattern: route.pattern.source, auth: route.auth, writes: route.writes ?? null })),
  }
}
