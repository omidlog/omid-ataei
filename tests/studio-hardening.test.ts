import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { test } from 'node:test'
import { SessionStore } from '../apps/studio/src/auth/session.js'
import { totpAt } from '../apps/studio/src/auth/totp.js'
import { createHttpServer, SERVER_TIMEOUTS } from '../apps/studio/src/listen.js'
import { Registry } from '../apps/studio/src/registry.js'
import { templateTree } from './helpers/fake-github.js'
import { Client, OWNER_LOGIN, OWNER_PASSWORD, startStudio, TOTP_SECRET, type RunningStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

/**
 * Phase 10 hardening: Studio as it runs in production, behind one TLS-terminating reverse proxy
 * (Caddy) that forwards plain HTTP, keeps the original Host and appends the client address to
 * X-Forwarded-For.
 */
const PUBLIC_HOST = 'studio.example.test'
const PUBLIC_ORIGIN = `https://${PUBLIC_HOST}`

interface RawResponse {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
}

/** A proxy-shaped client: sets Host, X-Forwarded-For and Origin like Caddy would, and keeps cookies. */
class ProxiedClient {
  cookies = new Map<string, string>()

  constructor(
    readonly port: number,
    readonly host = PUBLIC_HOST,
  ) {}

  request(method: string, pathname: string, options: { form?: Record<string, string>; forwardedFor?: string; origin?: string; host?: string } = {}): Promise<RawResponse> {
    const headers: Record<string, string> = { host: options.host ?? this.host }
    if (options.forwardedFor) headers['x-forwarded-for'] = options.forwardedFor
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
    let body = ''
    if (options.form) {
      body = new URLSearchParams(options.form).toString()
      headers['content-type'] = 'application/x-www-form-urlencoded'
      headers['content-length'] = String(Buffer.byteLength(body))
    }
    if (method !== 'GET') headers.origin = options.origin ?? PUBLIC_ORIGIN
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: this.port, method, path: pathname, headers }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          for (const line of res.headers['set-cookie'] ?? []) {
            const [pair = ''] = line.split(';')
            const index = pair.indexOf('=')
            const name = pair.slice(0, index)
            const value = pair.slice(index + 1)
            if (/Max-Age=0/i.test(line) || value === '') this.cookies.delete(name)
            else this.cookies.set(name, value)
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') })
        })
      })
      req.on('error', reject)
      req.end(body)
    })
  }

  async csrf(pathname: string, forwardedFor?: string): Promise<string> {
    const res = await this.request('GET', pathname, { forwardedFor })
    const match = res.body.match(/name="_csrf" value="([^"]+)"/)
    if (!match) throw new Error(`no csrf on ${pathname} (${res.status})`)
    return match[1]!
  }

  async login(forwardedFor: string, password = OWNER_PASSWORD, offsetMs = 0): Promise<RawResponse> {
    const csrf = await this.csrf('/login', forwardedFor)
    return this.request('POST', '/login', { forwardedFor, form: { _csrf: csrf, login: OWNER_LOGIN, password, totp: totpAt(TOTP_SECRET, Date.now() + offsetMs), next: '/brands' } })
  }
}

async function withProxiedStudio(fn: (s: RunningStudio, port: number) => Promise<void>): Promise<void> {
  const s = await startStudio({ publicOrigin: PUBLIC_ORIGIN, secureCookies: true, trustProxy: true })
  try {
    await fn(s, Number(new URL(s.url).port))
  } finally {
    await s.close()
  }
}

test('behind the proxy: secure __Host- cookies, HSTS, and sign-in works only for the https origin', async () => {
  await withProxiedStudio(async (_s, port) => {
    const client = new ProxiedClient(port)
    const form = await client.request('GET', '/login', { forwardedFor: '198.51.100.7' })
    assert.equal(form.status, 200)
    assert.match(form.headers['strict-transport-security'] ?? '', /max-age=31536000/)
    const nonce = (form.headers['set-cookie'] ?? []).find((line) => line.startsWith('__Host-studio_login='))
    assert.ok(nonce, 'login nonce cookie uses the __Host- prefix')
    for (const attribute of ['Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/']) assert.ok(nonce.includes(attribute), `nonce cookie has ${attribute}`)
    assert.equal(/Domain=/i.test(nonce), false, '__Host- cookies carry no Domain')

    // A downgraded or foreign Origin is refused even with a valid token.
    const csrf = await client.csrf('/login', '198.51.100.7')
    const downgraded = await client.request('POST', '/login', { forwardedFor: '198.51.100.7', origin: `http://${PUBLIC_HOST}`, form: { _csrf: csrf, login: OWNER_LOGIN, password: OWNER_PASSWORD, totp: totpAt(TOTP_SECRET, Date.now()) } })
    assert.equal(downgraded.status, 403)

    const ok = await client.login('198.51.100.7')
    assert.equal(ok.status, 303)
    assert.equal(ok.headers.location, '/brands')
    const session = (ok.headers['set-cookie'] ?? []).find((line) => line.startsWith('__Host-studio_session='))
    assert.ok(session, 'session cookie uses the __Host- prefix')
    for (const attribute of ['Secure', 'HttpOnly', 'SameSite=Strict']) assert.ok(session.includes(attribute), `session cookie has ${attribute}`)
    const brands = await client.request('GET', '/brands', { forwardedFor: '198.51.100.7' })
    assert.equal(brands.status, 200)

    // Sign-out ends the session server-side and clears the cookie.
    const csrfOut = brands.body.match(/name="_csrf" value="([^"]+)"/)![1]!
    const stolen = client.cookies.get('__Host-studio_session')!
    const out = await client.request('POST', '/logout', { forwardedFor: '198.51.100.7', form: { _csrf: csrfOut } })
    assert.equal(out.status, 303)
    const thief = new ProxiedClient(port)
    thief.cookies.set('__Host-studio_session', stolen)
    assert.equal((await thief.request('GET', '/brands')).status, 302)
  })
})

test('behind the proxy: only the public Host is served (no DNS rebinding or stray virtual hosts); /healthz stays reachable', async () => {
  await withProxiedStudio(async (_s, port) => {
    for (const host of ['evil.example', `127.0.0.1:${port}`, `${PUBLIC_HOST}.evil.example`, `evil.example:443`, 'localhost', '[::1]:80', '%%%']) {
      const client = new ProxiedClient(port, host)
      for (const pathname of ['/login', '/brands', '/static/studio.js']) {
        const res = await client.request('GET', pathname)
        assert.equal(res.status, 421, `${host}${pathname}`)
        assert.equal(res.headers['set-cookie'], undefined, 'no cookie for a foreign host')
      }
      const post = await client.request('POST', '/login', { form: { _csrf: 'x', login: OWNER_LOGIN, password: 'x' } })
      assert.equal(post.status, 421)
    }
    // The container health check calls 127.0.0.1 directly.
    const health = await new ProxiedClient(port, `127.0.0.1:${port}`).request('GET', '/healthz')
    assert.equal(health.status, 200)
    assert.equal(health.body, 'ok\n')
    // Host matching is by hostname and case-insensitive, as DNS is; the port depends on the proxy hop.
    assert.equal((await new ProxiedClient(port, PUBLIC_HOST.toUpperCase()).request('GET', '/login')).status, 200)
    assert.equal((await new ProxiedClient(port, `${PUBLIC_HOST}:443`).request('GET', '/login')).status, 200)
  })
})

test('behind the proxy: rate limits use the proxy-appended (rightmost) X-Forwarded-For hop, so a forged left hop cannot dodge them', async () => {
  await withProxiedStudio(async (_s, port) => {
    const attacker = new ProxiedClient(port)
    // Five failures from the same real address, each with a different forged left-hand entry.
    for (let n = 0; n < 5; n += 1) {
      const res = await attacker.login(`10.0.0.${n}, 203.0.113.9`, 'wrong password!!')
      assert.equal(res.status, 401)
    }
    const blocked = await attacker.login('10.9.9.9, 203.0.113.9', OWNER_PASSWORD)
    assert.equal(blocked.status, 429, 'still blocked: the forged hop is ignored')
    // A different client address (as appended by the proxy) is a separate bucket.
    const owner = new ProxiedClient(port)
    const ok = await owner.login('203.0.113.9, 198.51.100.20', OWNER_PASSWORD, 30_000)
    assert.equal(ok.status, 303)
  })
})

test('the health check fails when the data directory is not writable', { skip: process.getuid?.() === 0 ? 'root ignores directory permissions' : false }, async () => {
  const s = await startStudio()
  try {
    assert.equal((await fetch(`${s.url}/healthz`)).status, 200)
    fs.chmodSync(s.config.dataDir, 0o500)
    const res = await fetch(`${s.url}/healthz`)
    assert.equal(res.status, 503)
    assert.equal(await res.text(), 'unavailable\n')
  } finally {
    fs.chmodSync(s.config.dataDir, 0o700)
    await s.close()
  }
})

test('sessions expire after the idle and the absolute timeout, and session ids are not stored in clear', () => {
  let clock = 1_000_000
  const store = new SessionStore(60 * 60_000, 10 * 60_000, () => clock)
  const idle = store.create('owner')
  clock += 9 * 60_000
  assert.ok(store.get(idle.id), 'active before the idle timeout')
  clock += 11 * 60_000
  assert.equal(store.get(idle.id), null, 'idle session expired')

  const absolute = store.create('owner')
  for (let minutes = 0; minutes < 60; minutes += 5) {
    clock += 5 * 60_000
    store.get(absolute.id)
  }
  clock += 60_000
  assert.equal(store.get(absolute.id), null, 'absolute lifetime ends even for an active session')
  assert.equal(store.get('x'.repeat(500)), null)
  const internal = (store as unknown as { sessions: Map<string, unknown> }).sessions
  const fresh = store.create('owner')
  assert.equal(internal.has(fresh.id), false, 'the map is keyed by a hash, not the cookie value')
})

test('the HTTP listener keeps upstream connections open longer than the proxy pool and bounds slow clients', async () => {
  const server = createHttpServer(async (_req, res) => {
    res.end('ok')
  })
  assert.equal(server.keepAliveTimeout, SERVER_TIMEOUTS.keepAliveTimeout)
  assert.ok(server.keepAliveTimeout > 30_000, 'longer than the Caddy upstream keepalive (30s)')
  assert.equal(server.headersTimeout, 20_000)
  assert.equal(server.requestTimeout, 60_000)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  // An oversized header block is refused before it reaches Studio.
  const status = await new Promise<number>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/', headers: { 'x-big': 'a'.repeat(32 * 1024) } }, (res) => {
      res.resume()
      resolve(res.statusCode ?? 0)
    })
    req.on('error', reject)
    req.end()
  })
  assert.equal(status, 431)
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

test('a brand registered by the server CLI next to the live server is seen at once and never overwritten by a later provisioning', async () => {
  const s = await startStudio()
  try {
    const client = new Client(s.url)
    await client.login()
    // What `docker compose exec studio node dist/cli.mjs register ...` does: a second process, same file.
    const cli = new Registry(s.config.dataDir)
    s.github.addRepo(OWNER, 'existing-brand', templateTree(), { private: true })
    const existing = s.github.repo(OWNER, 'existing-brand')!
    cli.upsert({
      slug: 'existing-brand',
      display_name: 'Existing Brand',
      profile: 'business',
      repo: { owner: OWNER, name: 'existing-brand', id: existing.id, html_url: `https://github.com/${OWNER}/existing-brand`, default_branch: 'main' },
      source: 'registered',
      created_at: new Date().toISOString(),
      created_by: 'server-cli',
      provisioning: null,
    })
    assert.match((await client.page('/brands')).text, /Existing Brand/, 'the live server sees the CLI registration without a restart')

    // The server then provisions a new brand: its save must keep the CLI's row.
    const csrf = await client.csrf('/brands/new')
    const created = await client.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Acme Learning', slug: 'acme-learning', profile: 'business', default_locale: 'en', locales: ['en'], owner: OWNER, repo: 'acme-learning' } })
    assert.equal(created.status, 303)
    await s.studio.provisioning.settled()
    await s.studio.sync.settled()
    const onDisk = JSON.parse(fs.readFileSync(path.join(s.config.dataDir, 'registry.json'), 'utf8')) as { brands: Array<{ slug: string }> }
    assert.deepEqual(onDisk.brands.map((brand) => brand.slug).sort(), ['acme-learning', 'existing-brand'])

    // And an unregister from the CLI takes effect in the live server.
    assert.equal(new Registry(s.config.dataDir).remove('existing-brand'), true)
    assert.equal((await client.get('/brands/existing-brand')).status, 404)
    assert.equal(s.studio.registry.get('acme-learning')?.slug, 'acme-learning')
  } finally {
    await s.close()
  }
})
