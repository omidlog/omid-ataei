import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { Browser, findChrome, type Page } from './helpers/browser.js'
import { closeServer, removeTempDir, teardown, tempDir } from './helpers/cleanup.js'
import { freshTotp, OWNER_LOGIN, OWNER_PASSWORD, startStudio, type RunningStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

/**
 * Real-browser tests of the PRODUCTION shape: headless Chrome talks HTTPS to a TLS-terminating
 * reverse proxy (standing in for Caddy: it keeps Host, replaces X-Forwarded-For) in front of Studio
 * configured exactly as on the VPS (https public origin, Secure __Host- cookies, trusted proxy, Host
 * allowlist). A second HTTPS site plays a hostile origin. Test hostnames are mapped to loopback inside
 * Chrome; the certificate is self-signed for this run. Nothing leaves the machine.
 *
 * Skips without Chrome or openssl (STUDIO_E2E_REQUIRED=1 turns a missing browser into a failure).
 */
const chrome = findChrome()
const hasOpenssl = spawnSync('openssl', ['version']).status === 0
if (!chrome && process.env.STUDIO_E2E_REQUIRED === '1') throw new Error('STUDIO_E2E_REQUIRED=1 but no Chrome was found (set CHROME_PATH).')
const skip = !chrome ? 'no Chrome/Chromium found (set CHROME_PATH)' : !hasOpenssl ? 'openssl not found' : false

const STUDIO_HOST = 'studio.example.test'
/** Same registrable domain as Studio (like a sibling subdomain of omidataei.com): same-site for cookies. */
const EVIL_HOST = 'evil.example.test'
/** A different registrable domain: cross-site. */
const CROSS_HOST = 'attacker.test'

let dir: string
let proxy: https.Server
let evil: https.Server
let s: RunningStudio
let browser: Browser
let page: Page
let origin: string
let evilOrigin: string
let crossOrigin: string

function listen(server: http.Server | https.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)))
}

before(async () => {
  if (skip) return
  dir = tempDir('studio-tls-')
  const made = spawnSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-days', '1', '-subj', `/CN=${STUDIO_HOST}`, '-addext', `subjectAltName=DNS:${STUDIO_HOST},DNS:${EVIL_HOST},DNS:${CROSS_HOST}`, '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem')], { encoding: 'utf8' })
  assert.equal(made.status, 0, made.stderr)
  const tls = { key: fs.readFileSync(path.join(dir, 'key.pem')), cert: fs.readFileSync(path.join(dir, 'cert.pem')) }

  // The proxy must know Studio's port and Studio must know the proxy's origin: bind the proxy first.
  let upstreamPort = 0
  proxy = https.createServer(tls, (req, res) => {
    const headers = { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress ?? '127.0.0.1' }
    const upstream = http.request({ host: '127.0.0.1', port: upstreamPort, method: req.method, path: req.url, headers }, (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers)
      answer.pipe(res)
    })
    upstream.on('error', () => {
      res.statusCode = 502
      res.end()
    })
    req.pipe(upstream)
  })
  const proxyPort = await listen(proxy)
  origin = `https://${STUDIO_HOST}:${proxyPort}`
  s = await startStudio({ publicOrigin: origin, secureCookies: true, trustProxy: true })
  upstreamPort = Number(new URL(s.url).port)

  // A hostile site that tries to make the owner's browser create a brand and read Studio data.
  evil = https.createServer(tls, (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    if (req.url === '/post') {
      res.end(`<!doctype html><form id="f" method="post" action="${origin}/brands/new"><input name="name" value="Evil"><input name="slug" value="evil-brand"><input name="profile" value="business"><input name="default_locale" value="en"><input name="locales" value="en"><input name="owner" value="${OWNER}"><input name="repo" value="evil-brand"></form><script>document.getElementById('f').submit()</script>`)
      return
    }
    res.end(`<!doctype html><title>evil</title><iframe id="frame" src="${origin}/brands"></iframe><script>
      window.readResult = fetch('${origin}/brands', { credentials: 'include' }).then((r) => 'read:' + r.status, (e) => 'blocked:' + e.name)
    </script>`)
  })
  const evilPort = await listen(evil)
  evilOrigin = `https://${EVIL_HOST}:${evilPort}`
  crossOrigin = `https://${CROSS_HOST}:${evilPort}`

  browser = await Browser.launch(chrome as string, [`--host-resolver-rules=MAP ${STUDIO_HOST} 127.0.0.1, MAP ${EVIL_HOST} 127.0.0.1, MAP ${CROSS_HOST} 127.0.0.1`, '--ignore-certificate-errors'])
  page = await browser.newPage()
  await page.viewport(1280, 900)
  await page.send('Network.enable')
}, { timeout: 120_000 })

after(async () => {
  if (skip) return
  // Every step runs even if one fails: a server left listening keeps the test process alive.
  await teardown(
    () => page?.close(),
    () => browser?.close(),
    () => s?.close(),
    () => proxy && closeServer(proxy),
    () => evil && closeServer(evil),
    () => dir && removeTempDir(dir),
  )
}, { timeout: 60_000 })

interface CdpCookie {
  name: string
  secure: boolean
  httpOnly: boolean
  sameSite?: string
  domain: string
  path: string
}

async function cookies(): Promise<CdpCookie[]> {
  return ((await page.send('Network.getCookies', { urls: [origin] })) as { cookies: CdpCookie[] }).cookies
}

/** Each sign-in uses its own accepted TOTP step: replay protection refuses a code used twice. */
async function signIn(): Promise<void> {
  await page.goto(`${origin}/brands`)
  assert.equal(await page.eval<string>('location.pathname'), '/login')
  await page.type('#login', OWNER_LOGIN)
  await page.type('#password', OWNER_PASSWORD)
  await page.type('#totp', await freshTotp(origin))
  await page.navigation(() => page.click('button[type=submit]'))
}

test('production shape in a real browser: HTTPS sign-in sets Secure HttpOnly SameSite=Strict __Host- cookies; sign-out ends it', { skip }, async () => {
  await signIn()
  assert.equal(await page.eval<string>('location.pathname'), '/brands')
  assert.equal(await page.eval<boolean>('window.isSecureContext'), true)
  const session = (await cookies()).find((cookie) => cookie.name === '__Host-studio_session')
  assert.ok(session, 'session cookie set')
  assert.equal(session.secure, true)
  assert.equal(session.httpOnly, true)
  assert.equal(session.sameSite, 'Strict')
  assert.equal(session.path, '/')
  assert.equal(await page.eval<string>('document.cookie').then((value) => value.includes('studio_session')), false, 'scripts cannot read the session cookie')
  assert.deepEqual(page.problems, [], 'no CSP violation or script error behind TLS')

  await page.navigation(() => page.click('form[action="/logout"] button[type=submit]'))
  assert.equal(await page.eval<string>('location.pathname + location.search'), '/login?signed_out=1')
  assert.equal((await cookies()).some((cookie) => cookie.name === '__Host-studio_session'), false, 'cookie cleared')
  await page.goto(`${origin}/brands`)
  assert.equal(await page.eval<string>('location.pathname'), '/login', 'signed out for real')
})

test('production shape in a real browser: a hostile site cannot create a brand, read Studio, or frame it', { skip }, async () => {
  await signIn()
  assert.equal(await page.eval<string>('location.pathname'), '/brands')
  const reposBefore = s.github.repos.size

  // The status Studio answered to the forged post, as the browser received it.
  const statuses: number[] = []
  page.on('Network.responseReceived', (params) => {
    const response = params.response as { url: string; status: number }
    if (response.url === `${origin}/brands/new`) statuses.push(response.status)
  })

  // Same-site sibling: SameSite=Strict does not apply, the session cookie IS sent, and the CSRF token
  // plus Origin check refuse the post (403).
  await page.goto(`${evilOrigin}/post`)
  await page.waitFor(`location.href === ${JSON.stringify(`${origin}/brands/new`)} && document.readyState === 'complete'`)
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.deepEqual(statuses, [403], 'same-site forged post refused by CSRF/Origin')

  // Cross-site: SameSite=Strict keeps the cookie home, so Studio sees a guest (401).
  await page.goto(`${crossOrigin}/post`)
  await page.waitFor(`location.href === ${JSON.stringify(`${origin}/brands/new`)} && document.readyState === 'complete'`)
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.deepEqual(statuses, [403, 401], 'cross-site forged post arrives without the session cookie')
  await s.studio.provisioning.settled()
  assert.equal(s.studio.registry.get('evil-brand'), null, 'no brand registered')
  assert.equal(s.github.repos.size, reposBefore, 'no repository created')

  // Cross-origin read and framing.
  page.problems.length = 0
  await page.goto(`${evilOrigin}/`)
  assert.match(await page.eval<string>('window.readResult'), /^blocked:/, 'CORS blocks reading Studio from another origin')
  await page.waitFor(`window.readResult !== undefined`)
  await new Promise((resolve) => setTimeout(resolve, 500))
  const reported = page.problems.map((problem) => problem.text).join('\n')
  assert.match(reported, /blocked by CORS policy/, 'the browser blocked the cross-origin read')
  assert.match(reported, /frame-ancestors 'none'.*blocked/s, 'the browser refused to frame Studio')
  page.problems.length = 0

  // The owner is still signed in at home.
  await page.goto(`${origin}/brands`)
  assert.equal(await page.eval<string>('location.pathname'), '/brands')
})

test('production shape in a real browser: a foreign Host name gets 421 and no cookie', { skip }, async () => {
  const proxyPort = new URL(origin).port
  // Same server and certificate, different name: what a DNS-rebinding page would use.
  await page.goto(`https://${EVIL_HOST}:${proxyPort}/login`)
  assert.equal(await page.eval<string>('document.body.innerText.trim()'), 'Misdirected request.')
  const foreign = ((await page.send('Network.getCookies', { urls: [`https://${EVIL_HOST}:${proxyPort}`] })) as { cookies: CdpCookie[] }).cookies
  assert.equal(foreign.some((cookie) => cookie.name.includes('studio')), false)
})
