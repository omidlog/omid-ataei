import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  applyInit,
  applyTemplateUpdate,
  classifyPath,
  formatUpdatePlan,
  globToRegExp,
  parseSyncManifest,
  planTemplateUpdate,
  readTemplateRecord,
  SYNC_MANIFEST_PATH,
  TEMPLATE_RECORD_PATH,
  writeStarterWorkspace,
  writeTemplateRecord,
} from '@brand-os/brand-core'

const repo = path.resolve(import.meta.dirname, '..')
const manifestText = fs.readFileSync(path.join(repo, SYNC_MANIFEST_PATH), 'utf8')
const manifest = parseSyncManifest(manifestText)

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function initRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Test')
  git(dir, 'config', 'user.email', 'test@example.invalid')
  git(dir, 'config', 'commit.gpgsign', 'false')
}

function write(root: string, files: Record<string, string | null>): void {
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative)
    if (content === null) fs.rmSync(file, { force: true })
    else {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, content)
    }
  }
}

function commitAll(root: string, message: string): string {
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', message)
  return git(root, 'rev-parse', 'HEAD')
}

const PKG_V1 = '{\n  "name": "brand-os-template",\n  "version": "0.2.0",\n  "scripts": {\n    "test": "x"\n  }\n}\n'
const README_V1 = 'Title\n\nIntro line.\n\nMiddle.\n\nUsage line.\n'

/**
 * A template repository with one commit, and a brand repository created from it (no shared history, as
 * GitHub's "generate from template" does) whose record points at the template commit.
 */
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-sync-'))
  const template = path.join(dir, 'template')
  const brand = path.join(dir, 'brand')
  const files = {
    [SYNC_MANIFEST_PATH]: manifestText,
    'package.json': PKG_V1,
    'README.md': README_V1,
    'scripts/tool.ts': 'export const v = 1\n',
    'scripts/edited.ts': 'export const e = 1\n',
    'scripts/old.ts': 'export const old = 1\n',
    'brand/brand.config.yaml': 'brand:\n  name: EXAMPLE\n',
    'brand/content/guide.md': 'template guidance v1\n',
    'apps/docs/src/data/status.json': '{"generated":1}\n',
    'unlisted.txt': 'v1\n',
  }
  initRepo(template)
  write(template, files)
  const base = commitAll(template, 'template v1')
  initRepo(brand)
  write(brand, files)
  write(brand, { 'brand/brand.config.yaml': 'brand:\n  name: Northwind\n' })
  writeTemplateRecord(brand, { repository: 'example/brand-os-template', commit: base, version: '0.2.0', recorded_at: '2026-11-21T00:00:00.000Z', source: 'studio' })
  commitAll(brand, 'brand: initialize')
  return { dir, template, brand, base }
}

/** The template's second commit: core changes, a brand-file change, a shared-file change. */
function templateV2(template: string): string {
  write(template, {
    'package.json': PKG_V1.replace('"0.2.0"', '"0.3.0"'),
    'README.md': README_V1.replace('Usage line.', 'Usage line, improved.'),
    'scripts/tool.ts': 'export const v = 2\n',
    'scripts/edited.ts': 'export const e = 2\n',
    'scripts/old.ts': null,
    'scripts/new.ts': 'export const n = 1\n',
    'brand/content/guide.md': 'template guidance v2\n',
    'apps/docs/src/data/status.json': '{"generated":2}\n',
    'unlisted.txt': 'v2\n',
  })
  return commitAll(template, 'template v2')
}

function actions(plan: ReturnType<typeof planTemplateUpdate>): Record<string, string> {
  return Object.fromEntries(plan.changes.map((change) => [change.path, change.action]))
}

test('globs: ** crosses directories, * does not', () => {
  assert.ok(globToRegExp('brand/**').test('brand/a/b.yaml'))
  assert.ok(globToRegExp('apps/docs/src/data/*.json').test('apps/docs/src/data/status.json'))
  assert.ok(!globToRegExp('apps/docs/src/data/*.json').test('apps/docs/src/data/x/status.json'))
  assert.ok(globToRegExp('a/**/b.ts').test('a/b.ts'))
  assert.ok(globToRegExp('a/**/b.ts').test('a/x/y/b.ts'))
  assert.ok(!globToRegExp('package.json').test('apps/docs/package.json'))
  assert.ok(!globToRegExp('README.md').test('READMEXmd'))
})

test('the manifest classifies brand, generated, shared and core paths', () => {
  assert.equal(classifyPath(manifest, 'brand/instance/approved-facts.yaml').kind, 'brand')
  assert.equal(classifyPath(manifest, TEMPLATE_RECORD_PATH).kind, 'brand')
  assert.equal(classifyPath(manifest, 'apps/docs/src/data/status.json').kind, 'brand')
  assert.equal(classifyPath(manifest, 'package.json').kind, 'merge')
  assert.equal(classifyPath(manifest, 'AGENTS.md').kind, 'merge')
  assert.equal(classifyPath(manifest, 'scripts/brand.ts').kind, 'core')
  assert.equal(classifyPath(manifest, 'apps/studio/src/provision.ts').kind, 'core')
  assert.equal(classifyPath(manifest, '.github/workflows/validate.yml').kind, 'core')
  assert.deepEqual(classifyPath(manifest, 'somewhere/else.txt'), { kind: 'brand', matched: false })
})

test('every tracked file in this template has a manifest rule', () => {
  const tracked = git(repo, 'ls-files').split('\n').filter(Boolean)
  const unmatched = tracked.filter((file) => !classifyPath(manifest, file).matched)
  assert.deepEqual(unmatched, [])
})

test('the manifest parser refuses bad kinds and escaping paths', () => {
  assert.throws(() => parseSyncManifest('{"schema_version":1,"rules":[{"kind":"owned","paths":["a"]}]}'), /unknown kind/)
  assert.throws(() => parseSyncManifest('{"schema_version":1,"rules":[{"kind":"core","paths":["../x"]}]}'), /invalid path/)
  assert.throws(() => parseSyncManifest('{"schema_version":1,"rules":[{"kind":"core","paths":["/etc"]}]}'), /invalid path/)
  assert.throws(() => parseSyncManifest('not json'), /not valid JSON/)
})

test('dry run plans core updates, skips brand files and reports a locally edited core file', () => {
  const { template, brand, base } = fixture()
  write(brand, { 'scripts/edited.ts': 'export const e = "brand fix"\n' })
  commitAll(brand, 'brand: local edit to a core file')
  const head = git(brand, 'rev-parse', 'HEAD')
  const to = templateV2(template)

  const plan = planTemplateUpdate({ brandRoot: brand, templateRoot: template })
  assert.equal(plan.from, base)
  assert.equal(plan.to, to)
  assert.equal(plan.version, '0.3.0')
  assert.equal(plan.repository, 'omidlog/brand-os-template')
  assert.deepEqual(actions(plan), {
    // Shared files the brand never edited are plain updates.
    'README.md': 'update',
    'apps/docs/src/data/status.json': 'skip',
    'brand/content/guide.md': 'skip',
    'package.json': 'update',
    'scripts/edited.ts': 'conflict',
    'scripts/new.ts': 'add',
    'scripts/old.ts': 'delete',
    'scripts/tool.ts': 'update',
    'unlisted.txt': 'skip',
  })
  const text = formatUpdatePlan(plan)
  assert.match(text, /Dry run: nothing was changed/)
  assert.match(text, /scripts\/edited\.ts \(the brand edited this file/)
  assert.match(text, /unlisted\.txt \(no manifest rule/)
  // A dry run changes nothing.
  assert.equal(git(brand, 'rev-parse', 'HEAD'), head)
  assert.equal(git(brand, 'status', '--porcelain'), '')
  assert.equal(git(brand, 'branch', '--list'), '* main')
})

test('apply writes only core and merged files on a new branch and moves the record', () => {
  const { template, brand } = fixture()
  write(brand, {
    'scripts/edited.ts': 'export const e = "brand fix"\n',
    'README.md': README_V1.replace('Title', 'Northwind'),
    'package.json': PKG_V1.replace('"test": "x"', '"test": "brand"'),
  })
  const mainHead = commitAll(brand, 'brand: local edits')
  const to = templateV2(template)
  const plan = planTemplateUpdate({ brandRoot: brand, templateRoot: template })
  assert.equal(actions(plan)['package.json'], 'merge')
  const result = applyTemplateUpdate(brand, plan, { now: () => new Date('2026-11-21T12:00:00Z') })

  assert.equal(result.branch, `template-update/${to.slice(0, 12)}`)
  assert.ok(result.commit)
  assert.equal(git(brand, 'rev-parse', '--abbrev-ref', 'HEAD'), result.branch)
  assert.equal(git(brand, 'rev-parse', 'main'), mainHead, 'main is never moved')
  const read = (file: string) => fs.readFileSync(path.join(brand, file), 'utf8')
  assert.equal(read('scripts/tool.ts'), 'export const v = 2\n')
  assert.equal(read('scripts/new.ts'), 'export const n = 1\n')
  assert.ok(!fs.existsSync(path.join(brand, 'scripts/old.ts')))
  // Brand-owned, generated and unlisted files are untouched; the edited core file is left for a person.
  assert.equal(read('brand/brand.config.yaml'), 'brand:\n  name: Northwind\n')
  assert.equal(read('brand/content/guide.md'), 'template guidance v1\n')
  assert.equal(read('apps/docs/src/data/status.json'), '{"generated":1}\n')
  assert.equal(read('unlisted.txt'), 'v1\n')
  assert.equal(read('scripts/edited.ts'), 'export const e = "brand fix"\n')
  // Shared files keep both sides.
  assert.match(read('README.md'), /^Northwind\n/)
  assert.match(read('README.md'), /Usage line, improved\./)
  assert.match(read('package.json'), /"version": "0\.3\.0"/)
  assert.match(read('package.json'), /"test": "brand"/)

  const record = readTemplateRecord(brand)
  assert.equal(record?.commit, to)
  assert.equal(record?.version, '0.3.0')
  assert.equal(record?.source, 'template:update')
  assert.equal(record?.recorded_at, '2026-11-21T12:00:00.000Z')
  assert.equal(git(brand, 'status', '--porcelain'), '')
  const message = git(brand, 'log', '-1', '--format=%B')
  assert.match(message, /^chore\(template\): update Brand OS template to 0\.3\.0/)
  assert.match(message, /scripts\/edited\.ts: the brand edited this file/)
  const touched = git(brand, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort()
  assert.deepEqual(touched, ['README.md', TEMPLATE_RECORD_PATH, 'package.json', 'scripts/new.ts', 'scripts/old.ts', 'scripts/tool.ts'])

  // After the update the brand is current: the next plan from the new record is empty.
  git(brand, 'checkout', '-q', 'main')
  git(brand, 'merge', '-q', '--ff-only', result.branch)
  const next = planTemplateUpdate({ brandRoot: brand, templateRoot: template })
  assert.equal(next.upToDate, true)
  assert.deepEqual(next.changes, [])
  assert.match(formatUpdatePlan(next), /Nothing to do/)
})

test('a shared file edited on the same lines is a conflict and is not written', () => {
  const { template, brand } = fixture()
  write(brand, { 'README.md': README_V1.replace('Usage line.', 'Brand usage line.') })
  commitAll(brand, 'brand: readme')
  templateV2(template)
  const plan = planTemplateUpdate({ brandRoot: brand, templateRoot: template })
  assert.equal(actions(plan)['README.md'], 'conflict')
  applyTemplateUpdate(brand, plan)
  assert.match(fs.readFileSync(path.join(brand, 'README.md'), 'utf8'), /Brand usage line\./)
  assert.doesNotMatch(fs.readFileSync(path.join(brand, 'README.md'), 'utf8'), /<<<<<<<|improved/)
})

test('a core file the brand already has at the new version is current, a different new file is a conflict', () => {
  const { template, brand } = fixture()
  write(brand, { 'scripts/tool.ts': 'export const v = 2\n', 'scripts/new.ts': 'brand file\n' })
  commitAll(brand, 'brand: early copy')
  templateV2(template)
  const plan = planTemplateUpdate({ brandRoot: brand, templateRoot: template })
  assert.equal(actions(plan)['scripts/tool.ts'], 'current')
  assert.equal(actions(plan)['scripts/new.ts'], 'conflict')
})

test('the template manifest of the target commit decides, so a template can add a core path', () => {
  const { template, brand } = fixture()
  const next = JSON.parse(manifestText) as { rules: Array<{ kind: string; paths: string[] }> }
  next.rules.push({ kind: 'core', paths: ['unlisted.txt'] })
  write(template, { [SYNC_MANIFEST_PATH]: `${JSON.stringify(next, null, 2)}\n`, 'unlisted.txt': 'v2\n' })
  commitAll(template, 'template: unlisted becomes core')
  const plan = planTemplateUpdate({ brandRoot: brand, templateRoot: template })
  assert.equal(actions(plan)['unlisted.txt'], 'update')
  assert.equal(actions(plan)[SYNC_MANIFEST_PATH], 'update')
})

test('refusals: no recorded commit, unknown commit, dirty tree, existing branch, bad branch name', () => {
  const { template, brand, base } = fixture()
  templateV2(template)
  writeTemplateRecord(brand, { repository: null, commit: null, version: null, recorded_at: '', source: 'brand:init' })
  commitAll(brand, 'brand: record without commit')
  assert.throws(() => planTemplateUpdate({ brandRoot: brand, templateRoot: template }), /Pass --base/)
  assert.throws(() => planTemplateUpdate({ brandRoot: brand, templateRoot: template, base: 'deadbeefdeadbeef' }), /does not contain commit/)
  const plan = planTemplateUpdate({ brandRoot: brand, templateRoot: template, base })
  assert.equal(plan.from, base)

  write(brand, { 'brand/notes.md': 'uncommitted\n' })
  assert.throws(() => applyTemplateUpdate(brand, plan), /uncommitted changes/)
  fs.rmSync(path.join(brand, 'brand/notes.md'))
  git(brand, 'branch', 'taken')
  assert.throws(() => applyTemplateUpdate(brand, plan, { branch: 'taken' }), /already exists/)
  assert.throws(() => applyTemplateUpdate(brand, plan, { branch: '--force' }), /Invalid branch/)
  assert.throws(() => applyTemplateUpdate(brand, plan, { branch: 'a..b' }), /Invalid branch/)
  assert.equal(git(brand, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main')
})

test('brand initialization writes the template record and keeps a known commit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-sync-init-'))
  writeStarterWorkspace(root)
  const input = { name: 'Northwind', slug: 'northwind', industry: 'TBD', language: 'en', languages: ['en'], mascot: false, gamification: false, publish: 'private' as const }
  applyInit(root, { ...input, template: { repository: 'example/brand-os-template', commit: 'abc1234def', version: '0.2.0', source: 'studio' } })
  const first = readTemplateRecord(root)
  assert.equal(first?.commit, 'abc1234def')
  assert.equal(first?.source, 'studio')

  // A record that is already there (for example Studio's) keeps its commit when brand:init runs.
  const kept = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-sync-init-'))
  writeStarterWorkspace(kept)
  writeTemplateRecord(kept, { repository: 'example/brand-os-template', commit: 'abc1234def', version: '0.2.0', recorded_at: '', source: 'studio' })
  applyInit(kept, input)
  const again = readTemplateRecord(kept)
  assert.equal(again?.commit, 'abc1234def')
  assert.equal(again?.repository, 'example/brand-os-template')

  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-sync-init-'))
  writeStarterWorkspace(fresh)
  applyInit(fresh, input)
  const record = readTemplateRecord(fresh)
  assert.equal(record?.commit, null)
  assert.equal(record?.source, 'brand:init')
})

test('template:update CLI: dry run by default, --apply makes the branch, --json is machine readable', () => {
  const { template, brand } = fixture()
  const to = templateV2(template)
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, ['--import', 'tsx', path.join(repo, 'scripts/template-update.ts'), '--template', template, '--repo', brand, ...args], { cwd: repo, encoding: 'utf8' })

  const dry = cli()
  assert.equal(dry.status, 0, dry.stderr)
  assert.match(dry.stdout, /Dry run/)
  assert.equal(git(brand, 'branch', '--list'), '* main')

  const json = cli('--json')
  const parsed = JSON.parse(json.stdout) as { to: string; applied: unknown; changes: Array<{ path: string; action: string; content?: unknown }> }
  assert.equal(parsed.to, to)
  assert.equal(parsed.applied, null)
  assert.ok(parsed.changes.every((change) => change.content === undefined))

  const applied = cli('--apply', '--branch', 'template-update/test')
  assert.equal(applied.status, 0, applied.stderr)
  assert.match(applied.stdout, /Committed \d+ file\(s\) on branch template-update\/test/)
  assert.equal(git(brand, 'rev-parse', '--abbrev-ref', 'HEAD'), 'template-update/test')

  const missing = spawnSync(process.execPath, ['--import', 'tsx', path.join(repo, 'scripts/template-update.ts')], { cwd: repo, encoding: 'utf8' })
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /needs --template/)
})
