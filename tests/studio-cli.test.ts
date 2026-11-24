import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { parseEnv } from 'node:util'
import { verifyPassword } from '../apps/studio/src/auth/password.js'
import { base32Decode } from '../apps/studio/src/auth/totp.js'
import { loadConfig } from '../apps/studio/src/config.js'

/** The owner's server commands, run as real processes (the way an operator runs them). */
const ROOT = path.resolve(import.meta.dirname, '..')
const CLI = path.join(ROOT, 'apps/studio/src/cli.ts')
const PASSWORD = 'a long owner pass phrase'

function cli(args: string[], options: { input?: string; env?: NodeJS.ProcessEnv } = {}) {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, ...options.env }
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...args], { cwd: ROOT, input: options.input ?? '', env, encoding: 'utf8', timeout: 60_000 })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'studio-cli-'))
}

test('bootstrap-owner writes a 0600 env file with a verifiable hash, a new TOTP key and session secret; enrollment goes to stderr only', () => {
  const dir = tmp()
  try {
    const out = path.join(dir, 'owner.env')
    const run = cli(['bootstrap-owner', '--login', 'owner', '--out', out], { input: `${PASSWORD}\n` })
    assert.equal(run.status, 0, run.stderr)
    assert.equal(fs.statSync(out).mode & 0o777, 0o600)
    const text = fs.readFileSync(out, 'utf8')
    const env = parseEnv(text)
    assert.equal(env.STUDIO_OWNER_LOGIN, 'owner')
    assert.ok(verifyPassword(PASSWORD, env.STUDIO_OWNER_PASSWORD_HASH!), 'the hash verifies the password')
    assert.equal(text.includes(PASSWORD), false, 'the plain password is never written')
    assert.equal(base32Decode(env.STUDIO_OWNER_TOTP_SECRET!).length, 20)
    assert.equal(Buffer.from(env.STUDIO_SESSION_SECRET!, 'base64').length, 32)
    // Values are single-quoted so Docker Compose does not interpolate the `$` in scrypt hashes.
    for (const line of text.split('\n').filter((item) => item.startsWith('STUDIO_'))) assert.match(line, /^STUDIO_[A-Z_]+='[^']*'$/)
    // Enrollment instructions reach the owner's terminal (stderr), never stdout or the file.
    assert.match(run.stderr, new RegExp(`otpauth://totp/Brand%20OS%20Studio:owner\\?secret=${env.STUDIO_OWNER_TOTP_SECRET}`))
    assert.equal(run.stdout, '')
    // The file is a complete owner configuration for a remote Studio.
    const config = loadConfig({ ...env, STUDIO_HOST: '0.0.0.0', STUDIO_PUBLIC_ORIGIN: 'https://studio.example.test', STUDIO_DATA_DIR: dir })
    assert.equal(config.secureCookies, true)
    assert.equal(config.ownerTotpSecret, env.STUDIO_OWNER_TOTP_SECRET)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('bootstrap-owner refuses to overwrite, refuses weak or argv passwords, and writes nothing on failure', () => {
  const dir = tmp()
  try {
    const out = path.join(dir, 'owner.env')
    assert.equal(cli(['bootstrap-owner', '--login', 'owner', '--out', out], { input: `${PASSWORD}\n` }).status, 0)
    const before = fs.readFileSync(out, 'utf8')
    const again = cli(['bootstrap-owner', '--login', 'owner', '--out', out], { input: `${PASSWORD}\n` })
    assert.notEqual(again.status, 0)
    assert.match(again.stderr, /already exists/)
    assert.equal(fs.readFileSync(out, 'utf8'), before, 'existing file untouched')
    const forced = cli(['bootstrap-owner', '--login', 'owner', '--out', out, '--force'], { input: `${PASSWORD}\n` })
    assert.equal(forced.status, 0, forced.stderr)
    assert.notEqual(fs.readFileSync(out, 'utf8'), before, '--force rotates every secret')

    const weakOut = path.join(dir, 'weak.env')
    const weak = cli(['bootstrap-owner', '--login', 'owner', '--out', weakOut], { input: 'short\n' })
    assert.notEqual(weak.status, 0)
    assert.equal(fs.existsSync(weakOut), false)
    const argv = cli(['bootstrap-owner', '--login', 'owner', '--password', PASSWORD])
    assert.notEqual(argv.status, 0)
    assert.match(argv.stderr, /never accepted on the command line/)
    const badLogin = cli(['bootstrap-owner', '--login', 'bad login!'], { input: `${PASSWORD}\n` })
    assert.notEqual(badLogin.status, 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('bootstrap-owner without --out prints only env lines on stdout, so it can be redirected', () => {
  const run = cli(['bootstrap-owner', '--login', 'owner'], { input: `${PASSWORD}\n` })
  assert.equal(run.status, 0, run.stderr)
  const env = parseEnv(run.stdout)
  assert.deepEqual(Object.keys(env).sort(), ['STUDIO_OWNER_LOGIN', 'STUDIO_OWNER_PASSWORD_HASH', 'STUDIO_OWNER_TOTP_SECRET', 'STUDIO_SESSION_SECRET'])
  assert.equal(run.stdout.includes('otpauth://'), false)
})

test('check-config validates like the server and prints settings without any secret value', () => {
  const dir = tmp()
  try {
    const out = path.join(dir, 'owner.env')
    assert.equal(cli(['bootstrap-owner', '--login', 'owner', '--out', out], { input: `${PASSWORD}\n` }).status, 0)
    const owner = parseEnv(fs.readFileSync(out, 'utf8'))
    const secrets = { STUDIO_GITHUB_READ_TOKEN: 'read-token-value-0123456789', STUDIO_GITHUB_PROVISION_TOKEN: 'provision-token-value-0123456789', STUDIO_GITHUB_WEBHOOK_SECRET: 'webhook-secret-value-0123456789' }
    const env = { ...owner, ...secrets, STUDIO_HOST: '0.0.0.0', STUDIO_PORT: '4100', STUDIO_PUBLIC_ORIGIN: 'https://studio.example.test', STUDIO_TRUST_PROXY: '1', STUDIO_DATA_DIR: dir, STUDIO_ALLOWED_OWNERS: 'example-owner' }
    const ok = cli(['check-config'], { env })
    assert.equal(ok.status, 0, ok.stderr)
    assert.match(ok.stdout, /Configuration OK\./)
    assert.match(ok.stdout, /owner MFA\s+on/)
    assert.match(ok.stdout, /trust proxy\s+true/)
    assert.match(ok.stdout, /GitHub provision\s+configured/)
    for (const value of [...Object.values(secrets), owner.STUDIO_OWNER_PASSWORD_HASH!, owner.STUDIO_OWNER_TOTP_SECRET!, owner.STUDIO_SESSION_SECRET!]) {
      assert.equal(ok.stdout.includes(value) || ok.stderr.includes(value), false)
    }
    // Missing MFA on a public origin fails closed and names the variable, not the value.
    const bad = cli(['check-config'], { env: { ...env, STUDIO_OWNER_TOTP_SECRET: '' } })
    assert.equal(bad.status, 1)
    assert.match(bad.stderr, /STUDIO_OWNER_TOTP_SECRET is required/)
    for (const value of Object.values(secrets)) assert.equal(bad.stderr.includes(value), false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
