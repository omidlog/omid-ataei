import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
// @ts-expect-error plain JavaScript on purpose (runs before npm ci); see the file header.
import { minimumVersion, renderReport, runChecks, versionAtLeast } from '../scripts/doctor.mjs'
import { friendlyCliError } from '../scripts/cli-errors.js'

const repo = path.resolve(import.meta.dirname, '..')

interface Result {
  status: 'ok' | 'warn' | 'fail' | 'info'
  title: string
  detail?: string
  fix?: string
}

function fixture(t: { after: (fn: () => void) => void }): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-doctor-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const write = (file: string, body: unknown) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), typeof body === 'string' ? body : JSON.stringify(body))
  }
  write('package.json', { name: 'x', engines: { node: '>=22' }, workspaces: ['packages/*'], devDependencies: { tsx: '4.23.0', yaml: '2.9.1' } })
  write('package-lock.json', { packages: { 'node_modules/tsx': { version: '4.23.0' }, 'node_modules/yaml': { version: '2.9.1' } } })
  write('packages/core/package.json', { name: '@x/core' })
  write('node_modules/tsx/package.json', { version: '4.23.0' })
  write('node_modules/yaml/package.json', { version: '2.9.1' })
  write('node_modules/.package-lock.json', {})
  fs.mkdirSync(path.join(root, 'node_modules', '@x'), { recursive: true })
  fs.symlinkSync(path.join(root, 'packages', 'core'), path.join(root, 'node_modules', '@x', 'core'), 'dir')
  write('brand/brand.config.yaml', 'brand: {}\n')
  return root
}

const check = (results: Result[], pattern: RegExp) => results.find((result) => pattern.test(result.title))
const noGit = { git: () => '', env: { CHROME_PATH: '' } }

test('version helpers read >= ranges and compare major, minor and patch', () => {
  assert.deepEqual(minimumVersion('>=22'), [22, 0, 0])
  assert.deepEqual(minimumVersion('>= 22.12.1'), [22, 12, 1])
  assert.equal(minimumVersion('^22'), null)
  assert.equal(versionAtLeast('22.0.0', [22, 0, 0]), true)
  assert.equal(versionAtLeast('v24.1.0', [22, 12, 0]), true)
  assert.equal(versionAtLeast('22.11.9', [22, 12, 0]), false)
  assert.equal(versionAtLeast('20.19.0', [22, 0, 0]), false)
})

test('a healthy setup has no failures or warnings', (t) => {
  const root = fixture(t)
  const results: Result[] = runChecks({ root, nodeVersion: '22.12.0', ...noGit })
  assert.deepEqual(results.filter((result) => result.status === 'fail' || result.status === 'warn'), [])
  assert.match(renderReport(results), /Setup looks good\./)
})

test('old Node, missing install and outside the repository each fail with a plain fix', (t) => {
  const root = fixture(t)
  const old: Result[] = runChecks({ root, nodeVersion: '20.11.0', ...noGit })
  assert.equal(check(old, /Node 20\.11\.0 is too old/)?.status, 'fail')
  assert.match(check(old, /too old/)?.fix ?? '', /nvm install 22/)

  fs.rmSync(path.join(root, 'node_modules'), { recursive: true })
  const bare: Result[] = runChecks({ root, nodeVersion: '22.0.0', ...noGit })
  assert.equal(check(bare, /not installed/)?.fix, 'Run npm ci in the repository root.')
  assert.match(renderReport(bare), /1 problem\(s\) to fix/)

  const outside: Result[] = runChecks({ root: path.join(root, 'packages'), ...noGit })
  assert.equal(outside.length, 1)
  assert.equal(outside[0]?.status, 'fail')
  assert.match(outside[0]?.fix ?? '', /package\.json, AGENTS\.md and brand\//)
})

test('missing packages, version drift, a stale install and unlinked workspaces are reported', (t) => {
  const root = fixture(t)
  fs.writeFileSync(path.join(root, 'node_modules', 'yaml', 'package.json'), JSON.stringify({ version: '2.8.0' }))
  let results: Result[] = runChecks({ root, nodeVersion: '22.0.0', ...noGit })
  assert.equal(check(results, /differ from package-lock/)?.status, 'warn')
  assert.match(check(results, /differ from package-lock/)?.detail ?? '', /yaml 2\.8\.0 \(lock: 2\.9\.1\)/)

  fs.rmSync(path.join(root, 'node_modules', 'yaml'), { recursive: true })
  fs.rmSync(path.join(root, 'node_modules', '@x', 'core'))
  results = runChecks({ root, nodeVersion: '22.0.0', ...noGit, mtime: (file: string) => (file.endsWith('.package-lock.json') ? 0 : 10_000) })
  assert.equal(check(results, /missing/)?.detail, 'yaml')
  assert.equal(check(results, /not linked/)?.detail, '@x/core')
  assert.match(check(results, /not linked/)?.fix ?? '', /not inside packages\/ or apps\//)
  assert.equal(check(results, /changed after the last install/)?.status, 'warn')
})

test('no brand config, committed .env files, changed generated files and Chrome are reported', (t) => {
  const root = fixture(t)
  fs.rmSync(path.join(root, 'brand'), { recursive: true })
  const git = (args: string[]) => (args[0] === 'ls-files' ? ['README.md', 'apps/studio/.env.example', 'infra/.env', 'apps/x/.env.local', 'docs/env.md'].join('\0') : ' M llms.txt\n')
  const results: Result[] = runChecks({ root, nodeVersion: '22.0.0', git, env: { CHROME_PATH: path.join(root, 'no-chrome') } })
  assert.match(check(results, /No brand\/brand\.config\.yaml/)?.fix ?? '', /brand:init/)
  assert.equal(check(results, /Environment files are committed/)?.detail, 'infra/.env, apps/x/.env.local')
  assert.match(check(results, /Generated docs files/)?.fix ?? '', /^Unless you meant to regenerate them: git checkout -- apps\/docs\/generated apps\/docs\/src\/data llms\.txt llms-full\.txt$/)
  assert.equal(check(results, /CHROME_PATH points to a missing file/)?.status, 'warn')
  const offline: Result[] = runChecks({ root, nodeVersion: '22.0.0', git: () => null, env: {}, exists: (file: string) => !/chrom/i.test(file) && fs.existsSync(file) })
  assert.equal(check(offline, /Git checks skipped/)?.status, 'info')
  assert.equal(check(offline, /Chrome not found/)?.status, 'info')
})

test('npm run doctor runs with plain node and passes on this checkout', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
  assert.equal(pkg.scripts.doctor, 'node scripts/doctor.mjs', 'no tsx: it must work before npm ci')
  const run = spawnSync(process.execPath, [path.join(repo, 'scripts', 'doctor.mjs')], { cwd: os.tmpdir(), encoding: 'utf8' })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout, /^\[ok {2}\] Node /m)
  assert.match(run.stdout, /npm run brand:doctor/)
})

test('common brand CLI failures get a plain message and no stack trace', () => {
  const unknown = Object.assign(new TypeError("Unknown option '--modul'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- \"--modul\"'"), { code: 'ERR_PARSE_ARGS_UNKNOWN_OPTION' })
  assert.deepEqual(friendlyCliError(unknown, 'review', repo), {
    message: 'brand:review does not know the option --modul. Check the spelling against the usage in README.md (npm run help lists the commands).\nWith npm run, options go after a lone --, for example: npm run brand:review -- --module identity',
    exitCode: 2,
  })
  const missing = Object.assign(new TypeError("Option '--module <value>' argument missing"), { code: 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' })
  assert.match(friendlyCliError(missing, 'review', repo)?.message ?? '', /^brand:review: --module needs a value right after it\./)
  const flag = Object.assign(new TypeError("Option '--json' does not take an argument"), { code: 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' })
  assert.match(friendlyCliError(flag, 'review', repo)?.message ?? '', /--json is a switch and takes no value/)
  const extra = Object.assign(new TypeError("Unexpected argument 'extra'. This command does not take positional arguments"), { code: 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL' })
  assert.match(friendlyCliError(extra, 'review', repo)?.message ?? '', /extra value "extra"/)
  const config = Object.assign(new Error('ENOENT'), { code: 'ENOENT', path: '/tmp/elsewhere/brand/brand.config.yaml' })
  assert.match(friendlyCliError(config, 'status', '/tmp/elsewhere')?.message ?? '', /^No brand\/brand\.config\.yaml in \/tmp\/elsewhere\.\nRun brand commands from the repository root/)
  assert.equal(friendlyCliError(new Error('something else'), 'status', repo), null)
  assert.equal(friendlyCliError('not an error', 'status', repo), null)
})

test('brand CLI: a mistyped option and a missing brand config exit cleanly with the plain message', () => {
  const tsx = path.join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  const typo = spawnSync(process.execPath, [tsx, path.join(repo, 'scripts', 'brand.ts'), 'review', '--modul', 'identity'], { cwd: repo, encoding: 'utf8' })
  assert.equal(typo.status, 2, typo.stderr)
  assert.match(typo.stderr, /brand:review does not know the option --modul\./)
  assert.doesNotMatch(typo.stderr, /\n\s+at /, 'no stack trace')
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-cli-empty-'))
  try {
    const outside = spawnSync(process.execPath, [tsx, path.join(repo, 'scripts', 'brand.ts'), 'status'], { cwd: empty, encoding: 'utf8' })
    assert.equal(outside.status, 1, outside.stderr)
    assert.match(outside.stderr, /No brand\/brand\.config\.yaml in /)
    assert.doesNotMatch(outside.stderr, /\n\s+at /, 'no stack trace')
  } finally {
    fs.rmSync(empty, { recursive: true, force: true })
  }
})
