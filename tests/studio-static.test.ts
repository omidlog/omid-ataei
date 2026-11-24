import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { IncomingMessage } from 'node:http'
import { cacheControl, notModified, StaticAssets, STATIC_DIR } from '../apps/studio/src/static-assets.js'
import { Client, startStudio } from './helpers/studio-server.js'

/** Studio static files: read once into memory, validated with an ETag, cached for a year only under a matching `?v=`. */

function req(ifNoneMatch?: string): IncomingMessage {
  return { headers: ifNoneMatch === undefined ? {} : { 'if-none-match': ifNoneMatch } } as IncomingMessage
}

test('StaticAssets reads each file once, hashes its bytes and builds versioned URLs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-static-'))
  try {
    fs.writeFileSync(path.join(dir, 'a.css'), 'body{color:red}')
    const assets = new StaticAssets(dir)
    const first = assets.get('a.css')
    const digest = crypto.createHash('sha256').update('body{color:red}').digest('base64url')
    assert.equal(first.version, digest.slice(0, 12))
    assert.match(first.etag, /^"[A-Za-z0-9_-]{27}"$/)
    assert.equal(assets.url('a.css'), `/static/a.css?v=${first.version}`)
    // The bytes stay in memory: a change on disk is picked up on the next start, not mid-process.
    fs.writeFileSync(path.join(dir, 'a.css'), 'body{color:blue}')
    assert.equal(assets.get('a.css'), first)
    const fresh = new StaticAssets(dir).get('a.css')
    assert.notEqual(fresh.version, first.version)
    assert.notEqual(fresh.etag, first.etag)
    assert.throws(() => assets.get('missing.css'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('If-None-Match matching accepts lists, weak validators and *, and nothing else', () => {
  const etag = '"abc"'
  assert.equal(notModified(req(), etag), false)
  assert.equal(notModified(req('"abc"'), etag), true)
  assert.equal(notModified(req('"x", W/"abc"'), etag), true)
  assert.equal(notModified(req('*'), etag), true)
  assert.equal(notModified(req('"abcd"'), etag), false)
  assert.equal(notModified(req('abc'), etag), false)
})

test('cache policy: a year only for a matching version, a week for fonts, five minutes otherwise', () => {
  const asset = { body: Buffer.from('x'), etag: '"e"', version: 'v1' }
  assert.equal(cacheControl('studio.css', asset, 'v1'), 'public, max-age=31536000, immutable')
  assert.equal(cacheControl('studio.css', asset, 'old'), 'public, max-age=300')
  assert.equal(cacheControl('studio.css', asset, null), 'public, max-age=300')
  assert.equal(cacheControl('fonts/inter-var.woff2', asset, null), 'public, max-age=604800')
  assert.equal(cacheControl('fonts/inter-var.woff2', asset, 'v1'), 'public, max-age=31536000, immutable')
})

test('the server links versioned CSS and JS, answers 304 to a matching ETag and keeps the CSP', async () => {
  const s = await startStudio()
  try {
    const client = new Client(s.url)
    const login = await client.get('/login')
    const page = await login.text()
    const assets = new StaticAssets(STATIC_DIR)
    const cssUrl = assets.url('studio.css')
    const jsUrl = assets.url('studio.js')
    assert.ok(page.includes(`href="${cssUrl}"`), 'stylesheet link carries the content hash')
    assert.ok(page.includes(`src="${jsUrl}"`), 'script tag carries the content hash')

    const css = await client.get(cssUrl)
    assert.equal(css.status, 200)
    assert.equal(css.headers.get('content-type'), 'text/css; charset=utf-8')
    assert.equal(css.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    assert.match(css.headers.get('content-security-policy') ?? '', /default-src 'none'/)
    const etag = css.headers.get('etag') ?? ''
    assert.equal(etag, assets.get('studio.css').etag)
    assert.equal(Buffer.from(await css.arrayBuffer()).equals(fs.readFileSync(path.join(STATIC_DIR, 'studio.css'))), true)

    const revalidated = await client.request('GET', '/static/studio.css', { headers: { 'if-none-match': etag } })
    assert.equal(revalidated.status, 304)
    assert.equal(revalidated.headers.get('etag'), etag)
    assert.equal(revalidated.headers.get('cache-control'), 'public, max-age=300', 'the plain name keeps the short cache')
    assert.equal((await revalidated.arrayBuffer()).byteLength, 0)

    const changed = await client.request('GET', '/static/studio.js', { headers: { 'if-none-match': '"something-else"' } })
    assert.equal(changed.status, 200)
    assert.ok((await changed.text()).length > 0)

    const stale = await client.get('/static/studio.js?v=000000000000')
    assert.equal(stale.status, 200)
    assert.equal(stale.headers.get('cache-control'), 'public, max-age=300', 'an old version is not pinned for a year')

    const font = await client.request('GET', '/static/fonts/inter-var.woff2', { headers: { 'if-none-match': assets.get('fonts/inter-var.woff2').etag } })
    assert.equal(font.status, 304)
    assert.equal(font.headers.get('cache-control'), 'public, max-age=604800')

    // The allowlist still decides what exists; a query string does not widen it.
    assert.notEqual((await client.get('/static/fonts/OFL.txt?v=1')).status, 200)
    assert.equal((await client.get('/static/server.ts?v=1')).status, 404)
  } finally {
    await s.close()
  }
})
