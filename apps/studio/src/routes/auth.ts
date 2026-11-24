import crypto from 'node:crypto'
import { verifyPassword } from '../auth/password.js'
import { RateLimiter } from '../auth/rate-limit.js'
import { loginCsrfToken, safeEqual } from '../auth/session.js'
import { first, parseCookies, redirect, safeLocalPath, serializeCookie } from '../http.js'
import * as pages from '../views/pages.js'
import type { Handler, RequestContext, StudioCore } from './context.js'
import type { RequestGuards } from './guards.js'

/** Sign-in and sign-out: the login nonce, CSRF, rate limits, password and authenticator code checks. */
export function authRoutes(core: StudioCore, guards: Pick<RequestGuards, 'clientIp' | 'sameOrigin'>): { loginForm: Handler; login: Handler; logout: Handler } {
  const { config, sessions, totp, now, log, view, render } = core
  const { clientIp, sameOrigin } = guards
  const sessionCookie = core.cookies.session
  const loginCookie = core.cookies.login
  const loginLimiter = new RateLimiter(5, 15 * 60_000, now)
  const globalLoginLimiter = new RateLimiter(30, 15 * 60_000, now)

  function showLogin(ctx: RequestContext, options: { error?: string; status?: number; login?: string; invalid?: 'credentials' | 'totp' } = {}): void {
    const nonce = crypto.randomBytes(24).toString('base64url')
    ctx.res.setHeader('Set-Cookie', serializeCookie(loginCookie, nonce, { secure: config.secureCookies, maxAgeSeconds: 900 }))
    const next = safeLocalPath(ctx.url.searchParams.get('next') ?? first(ctx.form.next), '/brands')
    const notice = ctx.url.searchParams.get('signed_out') === '1' ? ctx.i.t('login.signedOut') : undefined
    render(ctx, options.status ?? 200, pages.loginPage(view(ctx), { csrf: loginCsrfToken(config.sessionSecret, nonce), totp: totp !== null, notice, error: options.error, next, login: options.login, invalid: options.invalid }))
  }

  const loginForm: Handler = (ctx) => {
    if (ctx.session) return redirect(ctx.res, '/brands')
    showLogin(ctx)
  }

  const login: Handler = (ctx) => {
    const ip = clientIp(ctx.req)
    if (loginLimiter.blocked(ip) || globalLoginLimiter.blocked('all')) {
      return showLogin(ctx, { error: ctx.i.t('login.rateLimited', { minutes: 15 }), status: 429 })
    }
    const nonce = parseCookies(ctx.req.headers.cookie)[loginCookie]
    if (!nonce || !safeEqual(first(ctx.form._csrf), loginCsrfToken(config.sessionSecret, nonce)) || !sameOrigin(ctx.req)) {
      return showLogin(ctx, { error: ctx.i.t('login.expired'), status: 403 })
    }
    const submitted = first(ctx.form.login).trim()
    const loginOk = safeEqual(submitted, config.ownerLogin)
    // Always run the password check so timing does not reveal whether the login name matched.
    const passwordOk = verifyPassword(first(ctx.form.password), config.ownerPasswordHash)
    const totpResult = totp ? totp.check(first(ctx.form.totp).trim(), now()) : 'ok'
    if (!(loginOk && passwordOk && totpResult === 'ok')) {
      loginLimiter.take(ip)
      globalLoginLimiter.take('all')
      log(`login failed from ${ip}`)
      const error = ctx.i.t(totpResult === 'reused' ? 'login.codeUsed' : 'login.failed')
      return showLogin(ctx, { error, status: 401, login: submitted.slice(0, 64), invalid: totpResult === 'reused' ? 'totp' : 'credentials' })
    }
    loginLimiter.reset(ip)
    if (ctx.sessionId) sessions.destroy(ctx.sessionId)
    const created = sessions.create(config.ownerLogin)
    ctx.res.setHeader('Set-Cookie', [
      serializeCookie(sessionCookie, created.id, { secure: config.secureCookies, maxAgeSeconds: Math.floor(config.sessionTtlMs / 1000) }),
      serializeCookie(loginCookie, '', { secure: config.secureCookies, maxAgeSeconds: 0 }),
    ])
    log('login ok')
    redirect(ctx.res, safeLocalPath(first(ctx.form.next), '/brands'))
  }

  const logout: Handler = (ctx) => {
    sessions.destroy(ctx.sessionId ?? undefined)
    ctx.res.setHeader('Set-Cookie', serializeCookie(sessionCookie, '', { secure: config.secureCookies, maxAgeSeconds: 0 }))
    redirect(ctx.res, '/login?signed_out=1')
  }

  return { loginForm, login, logout }
}
