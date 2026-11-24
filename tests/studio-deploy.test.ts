import assert from 'node:assert/strict'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { parseEnv } from 'node:util'
import { parse as parseYaml } from 'yaml'
import { SERVER_TIMEOUTS } from '../apps/studio/src/listen.js'
import { Client, startStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

/**
 * Phase 10 deployment package (infra/production): static invariants of the Dockerfile, Compose file,
 * proxy snippet and env template; the production bundle running exactly as in the container; the
 * smoke-test script against it (and proving it catches a leaky server); backup and restore drill.
 * Docker itself is not required: the image build is covered by .github/workflows/studio-image.yml.
 */
const ROOT = path.resolve(import.meta.dirname, '..')
const INFRA = path.join(ROOT, 'infra/production')
const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8')
const tmp = (prefix: string): string => fs.mkdtempSync(path.join(os.tmpdir(), prefix))

function run(command: string, args: string[], options: { env?: NodeJS.ProcessEnv; input?: string; cwd?: string } = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd ?? ROOT, env: { ...process.env, ...options.env }, input: options.input ?? '', encoding: 'utf8', timeout: 120_000 })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

/** Every STUDIO_* variable the server reads. */
function configVariables(): string[] {
  return [...new Set([...read('apps/studio/src/config.ts').matchAll(/'(STUDIO_[A-Z_]+)'/g)].map((m) => m[1]!))].sort()
}

test('Dockerfile: pinned base by digest, multi-stage, non-root runtime, health check, no secrets or brand content', () => {
  const text = read('infra/production/Dockerfile')
  assert.match(text, /^ARG NODE_IMAGE=node:\d+\.\d+\.\d+-bookworm-slim@sha256:[0-9a-f]{64}$/m, 'base image pinned by version and digest')
  const stages = [...text.matchAll(/^FROM (\S+) AS (\w+)$/gm)].map((m) => m[2])
  assert.deepEqual(stages, ['build', 'runtime'])
  const runtime = text.slice(text.indexOf('AS runtime'))
  assert.match(runtime, /^USER node$/m, 'runtime runs as the unprivileged node user')
  assert.equal(/^USER root/m.test(runtime), false)
  assert.match(runtime, /^HEALTHCHECK .*\n.*\/healthz/m)
  assert.match(runtime, /^CMD \["node", "\/app\/dist\/main\.mjs"\]$/m)
  assert.match(runtime, /STUDIO_HOST=0\.0\.0\.0/, 'listens on the container network; the host publishes it on the proxy gateway only')
  assert.match(runtime, /COPY --from=build \/out\/ \/app\//, 'only the bundle and static files reach the runtime image')
  assert.equal(/COPY \. /.test(text), false, 'never copies the whole context')
  assert.match(text, /npm ci --ignore-scripts --workspaces=false/, 'the docs app and install scripts are not part of the build')
  for (const secret of ['TOKEN', 'PASSWORD', 'SECRET', 'TOTP']) assert.equal(new RegExp(`^(ENV|ARG)[^\\n]*${secret}`, 'm').test(text), false, `no ${secret} baked into the image`)

  const ignore = read('.dockerignore').split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
  assert.equal(ignore[0], '*', '.dockerignore is an allowlist')
  const allowed = ignore.filter((line) => line.startsWith('!'))
  assert.deepEqual(allowed.sort(), ['!apps/studio/', '!package-lock.json', '!package.json', '!packages/', '!scripts/build-studio.ts', '!tsconfig.json'])
  for (const never of ['**/.env', '**/.env.*', '**/node_modules', '**/.studio-data']) assert.ok(ignore.includes(never), `${never} excluded`)
})

test('Compose: only 172.18.0.1:8083 published, hardened container, memory limit, health check, restart policy, persistent data', () => {
  const compose = parseYaml(read('infra/production/docker-compose.yml')) as { name: string; services: Record<string, Record<string, unknown>> }
  assert.equal(compose.name, 'brand-os-studio')
  assert.deepEqual(Object.keys(compose.services), ['studio'], 'one service; it reuses the existing edge Caddy')
  const studio = compose.services.studio!
  assert.deepEqual(studio.ports, ['172.18.0.1:8083:4100'], 'published only on the shared proxy gateway')
  assert.equal(JSON.stringify(compose).includes('0.0.0.0:'), false, 'nothing published on all interfaces')
  assert.equal(studio.restart, 'unless-stopped')
  assert.equal(studio.mem_limit, '512m')
  assert.equal(studio.memswap_limit, '512m')
  assert.ok(Number(studio.cpus) > 0 && Number(studio.cpus) <= 2)
  assert.ok(Number(studio.pids_limit) > 0)
  assert.equal(studio.read_only, true)
  assert.deepEqual(studio.cap_drop, ['ALL'])
  assert.deepEqual(studio.security_opt, ['no-new-privileges:true'])
  assert.equal(studio.init, true)
  assert.deepEqual(studio.volumes, ['./data:/data'], 'state lives in the persistent data directory')
  const health = studio.healthcheck as { test: string[]; interval: string }
  assert.ok(health.test.join(' ').includes('http://127.0.0.1:4100/healthz'))
  const env = studio.environment as Record<string, string>
  assert.deepEqual(env, { STUDIO_HOST: '0.0.0.0', STUDIO_PORT: '4100', STUDIO_DATA_DIR: '/data', STUDIO_TRUST_PROXY: '1' }, 'no secret is inline in the Compose file')
  const files = (studio.env_file as Array<{ path: string; required: boolean }>).map((item) => [item.path, item.required])
  assert.deepEqual(files, [['./.env', true], ['./secrets/owner.env', true]], 'fails closed without both env files')
  assert.match(String(studio.image), /^brand-os-studio:\$\{STUDIO_IMAGE_TAG:\?/, 'the image tag is required (immutable reviewed commit)')
  for (const forbidden of ['privileged', 'network_mode', 'pid', 'ipc', 'devices', 'cap_add']) assert.equal(forbidden in studio, false, `no ${forbidden}`)
  assert.equal(JSON.stringify(compose).includes('docker.sock'), false)
  const logging = studio.logging as { options: Record<string, string> }
  assert.ok(logging.options['max-size'] && logging.options['max-file'], 'log rotation')
})

test('Caddy snippet: one site block for studio.omidataei.com, security headers, no CSP override, keepalive below the app', () => {
  const text = read('infra/production/Caddyfile.studio')
  const body = text.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n')
  assert.deepEqual([...body.matchAll(/^(\S[^{]*)\{$/gm)].map((m) => m[1]!.trim()), ['studio.omidataei.com'], 'exactly one site, the Studio host')
  assert.match(body, /reverse_proxy 172\.18\.0\.1:8083 \{/)
  for (const header of [/Strict-Transport-Security "max-age=31536000/, /X-Content-Type-Options "nosniff"/, /X-Frame-Options "DENY"/, /Referrer-Policy "same-origin"/, /-Server/]) assert.match(body, header)
  assert.equal(/Content-Security-Policy/i.test(body), false, 'Studio owns its CSP (assets use a different sandboxing CSP)')
  assert.match(body, /encode @studio_static zstd gzip/, 'only static files are compressed (no BREACH on token pages)')
  assert.equal(/^\s*encode (zstd|gzip)/m.test(body), false)
  const keepalive = Number(body.match(/keepalive (\d+)s/)?.[1])
  assert.ok(keepalive * 1000 < SERVER_TIMEOUTS.keepAliveTimeout, 'Caddy drops idle upstream connections before Node does')
  assert.equal(/tls internal|trusted_proxies/.test(body), false, 'automatic Let\'s Encrypt; no blanket trusted proxies')
})

test('.env.example names every server setting, holds no values for secrets, and leaves owner sign-in to bootstrap-owner', () => {
  const env = parseEnv(read('infra/production/.env.example'))
  const compose = parseYaml(read('infra/production/docker-compose.yml')) as { services: { studio: { environment: Record<string, string> } } }
  const fixed = Object.keys(compose.services.studio.environment)
  const owner = ['STUDIO_OWNER_LOGIN', 'STUDIO_OWNER_PASSWORD_HASH', 'STUDIO_OWNER_TOTP_SECRET', 'STUDIO_SESSION_SECRET']
  for (const name of configVariables()) {
    assert.ok(name in env || fixed.includes(name) || owner.includes(name), `${name} is documented in .env.example, fixed in Compose, or written by bootstrap-owner`)
  }
  for (const name of owner) assert.equal(name in env, false, `${name} is not in the shared env file`)
  for (const [name, value] of Object.entries(env)) {
    if (/TOKEN|SECRET|PASSWORD|HASH/.test(name)) assert.equal(value, '', `${name} has no value`)
  }
  assert.equal(env.STUDIO_PUBLIC_ORIGIN, 'https://studio.omidataei.com')
  assert.equal(env.STUDIO_IMAGE_TAG, '')
  // The per-app example keeps documenting local development.
  assert.match(read('apps/studio/.env.example'), /STUDIO_HOST=127\.0\.0\.1/)
})

test('operator scripts are executable bash with strict mode', () => {
  for (const name of ['smoke-test.sh', 'backup.sh', 'restore.sh']) {
    const file = path.join(INFRA, name)
    assert.ok(fs.statSync(file).mode & 0o100, `${name} is executable`)
    const text = fs.readFileSync(file, 'utf8')
    assert.match(text, /^#!\/usr\/bin\/env bash\n/)
    assert.match(text, /^set -euo pipefail$/m)
    assert.equal(run('bash', ['-n', file]).status, 0, `${name} parses`)
  }
})

/** Builds the production bundle into a temp dir laid out like /app in the image. */
function buildBundle(): string {
  const app = tmp('studio-bundle-')
  const built = run(process.execPath, ['--import', 'tsx', 'scripts/build-studio.ts', '--outdir', path.join(app, 'dist')])
  assert.equal(built.status, 0, built.stderr)
  fs.cpSync(path.join(ROOT, 'apps/studio/static'), path.join(app, 'static'), { recursive: true })
  return app
}

async function freePort(): Promise<number> {
  const server = http.createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

/** SIGTERM, then SIGKILL after 15 s. Resolves at once if the process already exited (waiting on 'exit' then would hang forever). */
async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 15_000)
  await exited
  clearTimeout(timer)
}

async function waitFor(url: string, headers: Record<string, string> = {}): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(url, { headers })).ok) return
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`${url} did not come up`)
}

test('the production bundle runs as in the container and passes the smoke test; the bundle carries no brand data or secrets', async () => {
  const app = buildBundle()
  const data = tmp('studio-bundle-data-')
  try {
    const bundle = fs.readFileSync(path.join(app, 'dist/main.mjs'), 'utf8')
    // scripts/build-studio.ts already refuses brand/, docs and .env inputs; this checks the output too.
    for (const needle of ['BRAND_OS_APPROVAL_PROOF=', 'BRAND_OS_DATA_KEY=', ['BEGIN', 'PRIVATE KEY'].join(' ')]) assert.equal(bundle.includes(needle), false, `bundle does not contain ${needle}`)
    // Token-shaped strings (the code's own redaction patterns are regexes, not tokens).
    assert.equal(/\bgh[pousr]_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}\b/.test(bundle), false, 'no GitHub token in the bundle')

    const ownerFile = path.join(data, 'owner.env')
    const boot = run(process.execPath, [path.join(app, 'dist/cli.mjs'), 'bootstrap-owner', '--login', 'owner', '--out', ownerFile], { input: 'a long owner pass phrase\n' })
    assert.equal(boot.status, 0, boot.stderr)
    const port = await freePort()
    const env = {
      ...parseEnv(fs.readFileSync(ownerFile, 'utf8')),
      PATH: process.env.PATH,
      // As in docker-compose.yml, but on loopback for the test.
      STUDIO_HOST: '127.0.0.1',
      STUDIO_PORT: String(port),
      STUDIO_DATA_DIR: path.join(data, 'state'),
      STUDIO_TRUST_PROXY: '1',
      STUDIO_PUBLIC_ORIGIN: 'https://studio.example.test',
      STUDIO_GITHUB_WEBHOOK_SECRET: 'deploy-test-webhook-secret-0123',
      STUDIO_BUILD_REVISION: '0123456789abcdef0123456789abcdef01234567',
    }
    const check = run(process.execPath, [path.join(app, 'dist/cli.mjs'), 'check-config'], { env })
    assert.equal(check.status, 0, check.stderr)
    const server = spawn(process.execPath, [path.join(app, 'dist/main.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    server.stdout.on('data', (chunk: Buffer) => (log += chunk.toString()))
    server.stderr.on('data', (chunk: Buffer) => (log += chunk.toString()))
    try {
      await waitFor(`http://127.0.0.1:${port}/healthz`)
      const smoke = run('bash', [path.join(INFRA, 'smoke-test.sh'), '--base', `http://127.0.0.1:${port}`, '--host', 'studio.example.test', '--expect-https'])
      assert.equal(smoke.status, 0, smoke.stdout + smoke.stderr)
      assert.match(smoke.stdout, /Summary: \d+ passed, 0 failed/)
      assert.ok(Number(smoke.stdout.match(/Summary: (\d+) passed/)?.[1]) >= 40)
      assert.match(log, /build revision 0123456789abcdef/)
      for (const value of Object.values(parseEnv(fs.readFileSync(ownerFile, 'utf8')))) assert.equal(log.includes(value!), false, 'no secret in the log')
    } finally {
      await stop(server)
    }
    assert.match(log, /shutting down/, 'stops gracefully on SIGTERM (docker stop)')
  } finally {
    fs.rmSync(app, { recursive: true, force: true })
    fs.rmSync(data, { recursive: true, force: true })
  }
})

test('the smoke test fails loudly against a server that leaks data or lacks the security headers', async () => {
  const leaky = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.end(req.url === '/static/studio.js' ? 'const token = "ghp_x"' : '<form><input name="_csrf"><input name="password"></form> Brand Book of Acme')
  })
  await new Promise<void>((resolve) => leaky.listen(0, '127.0.0.1', resolve))
  try {
    const port = (leaky.address() as AddressInfo).port
    const smoke = spawn('bash', [path.join(INFRA, 'smoke-test.sh'), '--base', `http://127.0.0.1:${port}`, '--host', 'studio.example.test'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 120_000 })
    let out = ''
    smoke.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()))
    const status = await new Promise<number | null>((resolve) => smoke.once('exit', resolve))
    assert.notEqual(status, 0)
    for (const expected of ['FAIL  Content-Security-Policy', 'FAIL  X-Frame-Options', 'FAIL  anonymous GET /brands redirects', 'FAIL  anonymous POST /brands/new answers 401', 'FAIL  GET /dashboard serves nothing', 'FAIL  static script has no token', 'FAIL  foreign Host gets no Studio page']) {
      assert.ok(out.includes(expected), `reports: ${expected}`)
    }
  } finally {
    await new Promise<void>((resolve) => leaky.close(() => resolve()))
  }
})

test('backup and restore drill: Studio state survives a restart from a restored copy; unsafe archives are refused', async () => {
  const backups = tmp('studio-backups-')
  const restored = path.join(tmp('studio-restore-'), 'data')
  const s = await startStudio()
  let dataDir = ''
  try {
    dataDir = s.config.dataDir
    const client = new Client(s.url)
    await client.login()
    const csrf = await client.csrf('/brands/new')
    const created = await client.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Acme Learning', slug: 'acme-learning', profile: 'business', default_locale: 'en', locales: ['en'], owner: OWNER, repo: 'acme-learning' } })
    assert.equal(created.status, 303)
    await s.studio.provisioning.settled()
    await s.studio.sync.settled()
  } finally {
    // The drill backs up this directory after the server stops; the finally below removes it.
    await s.close({ keepData: true })
  }
  try {
    fs.mkdirSync(path.join(dataDir, 'work-sync-leftover'), { recursive: true })
    const backup = run('bash', [path.join(INFRA, 'backup.sh'), '--data', dataDir, '--dest', backups, '--keep', '2'])
    assert.equal(backup.status, 0, backup.stderr)
    const archives = fs.readdirSync(backups).filter((name) => name.endsWith('.tar.gz'))
    assert.equal(archives.length, 1)
    const archive = path.join(backups, archives[0]!)
    assert.equal(fs.statSync(archive).mode & 0o777, 0o600, 'archive is private')
    assert.ok(fs.existsSync(`${archive}.sha256`))
    const listing = run('tar', ['-tzf', archive]).stdout
    assert.match(listing, /registry\.json/)
    assert.equal(/work-sync-leftover|(^|\/)work\//m.test(listing), false, 'transient work directories are skipped')

    const restore = run('bash', [path.join(INFRA, 'restore.sh'), archive, restored])
    assert.equal(restore.status, 0, restore.stderr)
    assert.match(restore.stdout, /checksum ok/)
    assert.match(restore.stdout, /registry ok: 1 brand/)
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(restored, 'registry.json'), 'utf8')), JSON.parse(fs.readFileSync(path.join(dataDir, 'registry.json'), 'utf8')))
    // The server CLI reads the restored mapping, as in the isolated restore-drill container.
    const brands = run(process.execPath, ['--import', 'tsx', 'apps/studio/src/cli.ts', 'brands'], { env: { STUDIO_DATA_DIR: restored } })
    assert.match(brands.stdout, /^acme-learning\tbrand-owner\/acme-learning\tready$/m)
    // A new Studio process on the restored directory shows the brand and its last synced commit without GitHub.
    const again = await startStudio({ dataDir: restored }, { readToken: null })
    try {
      const client = new Client(again.url)
      await client.login()
      const list = await client.page('/brands')
      assert.match(list.text, /Acme Learning/)
    } finally {
      await again.close()
    }

    // Refusals: non-empty target, tampered archive, path traversal, links.
    assert.notEqual(run('bash', [path.join(INFRA, 'restore.sh'), archive, restored]).status, 0, 'non-empty target refused')
    const tampered = path.join(backups, 'tampered.tar.gz')
    fs.copyFileSync(archive, tampered)
    fs.writeFileSync(`${tampered}.sha256`, `${'0'.repeat(64)}  tampered.tar.gz\n`)
    const bad = run('bash', [path.join(INFRA, 'restore.sh'), tampered, path.join(tmp('studio-restore-'), 'x')])
    assert.notEqual(bad.status, 0)
    assert.match(bad.stderr, /checksum mismatch/)
    const evilDir = tmp('studio-evil-')
    fs.mkdirSync(path.join(evilDir, 'inner'))
    fs.writeFileSync(path.join(evilDir, 'escape.json'), '{}')
    const traversal = path.join(evilDir, 'traversal.tar.gz')
    assert.equal(run('tar', ['-P', '-czf', traversal, '-C', path.join(evilDir, 'inner'), '../escape.json']).status, 0)
    const refused = run('bash', [path.join(INFRA, 'restore.sh'), traversal, path.join(evilDir, 'target')])
    assert.notEqual(refused.status, 0)
    assert.match(refused.stderr, /unsafe path/)
    assert.equal(fs.existsSync(path.join(evilDir, 'target')), false, 'nothing extracted')
    fs.symlinkSync('/etc/passwd', path.join(evilDir, 'inner', 'link'))
    const linked = path.join(evilDir, 'link.tar.gz')
    assert.equal(run('tar', ['-czf', linked, '-C', path.join(evilDir, 'inner'), 'link']).status, 0)
    const linkRefused = run('bash', [path.join(INFRA, 'restore.sh'), linked, path.join(evilDir, 'target2')])
    assert.notEqual(linkRefused.status, 0)
    assert.match(linkRefused.stderr, /links and devices are not allowed/)

    // Retention keeps the newest N archives.
    for (let n = 0; n < 3; n += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1100))
      assert.equal(run('bash', [path.join(INFRA, 'backup.sh'), '--data', dataDir, '--dest', backups, '--keep', '2']).status, 0)
    }
    assert.equal(fs.readdirSync(backups).filter((name) => /^studio-data-.*\.tar\.gz$/.test(name)).length, 2)
  } finally {
    for (const dir of [backups, path.dirname(restored), dataDir]) fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('optional: the real Caddy (CADDY_BIN) accepts the snippet appended to an existing Caddyfile', { skip: process.env.CADDY_BIN ? false : 'set CADDY_BIN to a caddy binary to run' }, () => {
  const dir = tmp('studio-caddy-')
  try {
    const file = path.join(dir, 'Caddyfile')
    fs.writeFileSync(file, `existing.example {\n\treverse_proxy 172.18.0.1:8082\n}\n\n${read('infra/production/Caddyfile.studio')}`)
    const result = run(process.env.CADDY_BIN!, ['validate', '--config', file, '--adapter', 'caddyfile'], { env: { HOME: dir, XDG_DATA_HOME: dir, XDG_CONFIG_HOME: dir } })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(/"level":"warn"/.test(result.stderr), false, result.stderr)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
