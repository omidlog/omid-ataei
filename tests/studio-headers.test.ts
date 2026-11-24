import assert from 'node:assert/strict'
import { test } from 'node:test'
import { totpAt } from '../apps/studio/src/auth/totp.js'
import { Client, OWNER_LOGIN, OWNER_PASSWORD, startStudio, TOTP_SECRET, type RunningStudio } from './helpers/studio-server.js'

/**
 * Every Studio response, whatever its kind, carries the same security headers. The browser test
 * checks some of them in Chrome; this pins all of them without a browser, on every response kind.
 */
const ALWAYS: Record<string, string | RegExp> = {
  'content-security-policy': /^default-src 'none'; .*frame-ancestors 'none'/,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'x-robots-tag': 'noindex, nofollow',
}

function assertSecurityHeaders(res: Response, label: string): void {
  for (const [name, expected] of Object.entries(ALWAYS)) {
    const value = res.headers.get(name)
    if (typeof expected === 'string') assert.equal(value, expected, `${label}: ${name}`)
    else assert.match(value ?? '', expected, `${label}: ${name}`)
  }
  assert.equal(res.headers.get('x-powered-by'), null, `${label}: no X-Powered-By`)
  assert.equal(res.headers.get('access-control-allow-origin'), null, `${label}: no CORS`)
}

async function withStudio(fn: (s: RunningStudio) => Promise<void>): Promise<void> {
  const s = await startStudio()
  try {
    await fn(s)
  } finally {
    await s.close()
  }
}

test('every response kind carries the full security header set; dynamic responses are never cached', async () => {
  await withStudio(async (s) => {
    const guest = new Client(s.url)
    const kinds: Array<[label: string, method: string, path: string, status: number, cache: RegExp | null]> = [
      ['sign-in page', 'GET', '/login', 200, /^no-store$/],
      ['guest redirect', 'GET', '/brands', 302, /^no-store$/],
      ['guest JSON', 'GET', '/brands/acme/provisioning.json', 401, /^no-store$/],
      ['health check', 'GET', '/healthz', 200, /^no-store$/],
      ['static CSS', 'GET', '/static/studio.css', 200, /max-age=/],
      ['unknown static file', 'GET', '/static/nope.js', 404, /^no-store$/],
      ['unknown page (guest)', 'GET', '/nope', 302, /^no-store$/],
      ['wrong method', 'PUT', '/login', 405, /^no-store$/],
      ['language switch', 'GET', '/login?lang=fa', 302, /^no-store$/],
    ]
    for (const [label, method, path, status, cache] of kinds) {
      const res = await guest.request(method, path)
      await res.arrayBuffer()
      assert.equal(res.status, status, label)
      assertSecurityHeaders(res, label)
      if (cache) assert.match(res.headers.get('cache-control') ?? '', cache, `${label}: cache-control`)
      assert.equal(res.headers.get('strict-transport-security'), null, `${label}: no HSTS over plain http`)
    }

    const owner = new Client(s.url)
    await owner.login()
    const missing = await owner.get('/brands/no-such-brand')
    await missing.text()
    assert.equal(missing.status, 404)
    assertSecurityHeaders(missing, 'unknown brand (owner)')
    assert.equal(missing.headers.get('cache-control'), 'no-store')
    for (const path of ['/brands', '/brands/new', '/account']) {
      const res = await owner.get(path)
      await res.text()
      assert.equal(res.status, 200, path)
      assertSecurityHeaders(res, path)
      assert.equal(res.headers.get('cache-control'), 'no-store', `${path}: signed-in pages are never cached`)
    }
  })
})

test('cookies: exact flags and lifetimes for the sign-in nonce, session, sign-out and language', async () => {
  await withStudio(async (s) => {
    const client = new Client(s.url)
    const form = await client.get('/login')
    await form.text()
    const nonce = form.headers.getSetCookie()
    assert.equal(nonce.length, 1)
    assert.match(nonce[0] ?? '', /^studio_login=[^;]+; Path=\/; SameSite=Strict; HttpOnly; Max-Age=900$/)

    const csrf = await client.csrf('/login')
    const login = await client.request('POST', '/login', { form: { _csrf: csrf, login: OWNER_LOGIN, password: OWNER_PASSWORD, totp: totpAt(TOTP_SECRET, Date.now()), next: '/brands' } })
    assert.equal(login.status, 303)
    const cookies = login.headers.getSetCookie()
    const ttl = Math.floor(s.config.sessionTtlMs / 1000)
    assert.ok(cookies.some((line) => new RegExp(`^studio_session=[A-Za-z0-9_-]{32,}; Path=/; SameSite=Strict; HttpOnly; Max-Age=${ttl}$`).test(line)), cookies.join(' | '))
    assert.ok(cookies.includes('studio_login=; Path=/; SameSite=Strict; HttpOnly; Max-Age=0'), 'the used nonce is cleared')
    for (const line of cookies) assert.doesNotMatch(line, /Domain=|Expires=/i, 'host-only cookies with a Max-Age')

    const csrfOut = await client.csrf('/account')
    const logout = await client.request('POST', '/logout', { form: { _csrf: csrfOut } })
    assert.equal(logout.status, 303)
    assert.deepEqual(logout.headers.getSetCookie(), ['studio_session=; Path=/; SameSite=Strict; HttpOnly; Max-Age=0'])
    assert.equal((await client.get('/brands')).status, 302, 'the old session no longer works')

    const lang = await client.get('/login?lang=tr')
    assert.deepEqual(lang.headers.getSetCookie(), [`studio_lang=tr; Path=/; SameSite=Strict; HttpOnly; Max-Age=${365 * 86400}`])
    assert.equal(lang.headers.get('location'), '/login')
    const bogus = await client.get('/login?lang=xx')
    await bogus.text()
    assert.deepEqual(bogus.headers.getSetCookie().filter((line) => line.startsWith('studio_lang=')), [], 'an unknown language sets no cookie')
  })
})
