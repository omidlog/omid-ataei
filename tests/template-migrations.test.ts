import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  applyTemplateUpdate,
  formatUpdatePlan,
  migrationFiles,
  MIGRATIONS_DIR,
  parseMigration,
  parseSyncManifest,
  pendingMigrations,
  planMigrations,
  planTemplateUpdate,
  SYNC_MANIFEST_PATH,
  writeTemplateRecord,
} from '@brand-os/brand-core'

/**
 * Template sync chunk 4: versioned migrations. Local git repositories in the test's temp dir for the
 * CLI path, no network. Studio's path is tested in tests/studio-template-migrations.test.ts.
 */
const repo = path.resolve(import.meta.dirname, '..')
const manifestText = fs.readFileSync(path.join(repo, SYNC_MANIFEST_PATH), 'utf8')
const manifest = parseSyncManifest(manifestText)
const sha = (text: string) => crypto.createHash('sha256').update(text).digest('hex')

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

const migration = (body: Record<string, unknown>) => JSON.stringify({ schema_version: 1, description: 'Remove old files.', ...body })

test('migrations: file names give the order, only new ones run, and only core paths are accepted', () => {
  assert.deepEqual(migrationFiles([`${MIGRATIONS_DIR}/0002-b.json`, `${MIGRATIONS_DIR}/0001-a.json`, `${MIGRATIONS_DIR}/README.md`, `${MIGRATIONS_DIR}/x.json`, 'scripts/0003-c.json']), ['0001-a.json', '0002-b.json'])
  assert.deepEqual(pendingMigrations(['0001-a.json'], ['0010-c.json', '0001-a.json', '0002-b.json']), ['0002-b.json', '0010-c.json'])
  assert.deepEqual(pendingMigrations(['0001-a.json'], ['0001-a.json']), [], 'idempotent: an applied migration never runs again')

  const ok = parseMigration('0001-remove-old.json', migration({ version: '0.3.0', operations: [{ op: 'delete', path: 'scripts/old.ts', sha256: [sha('x')] }] }), manifest)
  assert.deepEqual(ok, { id: '0001-remove-old', version: '0.3.0', description: 'Remove old files.', operations: [{ op: 'delete', path: 'scripts/old.ts', sha256: [sha('x')] }] })

  const refuse = (name: string, text: string, pattern: RegExp) => assert.throws(() => parseMigration(name, text, manifest), pattern)
  for (const target of ['brand/brand.config.yaml', 'brand/template-version.json', 'apps/docs/src/data/status.json', 'package.json', 'README.md', 'unlisted.txt']) {
    refuse('0001-x.json', migration({ operations: [{ op: 'delete', path: target }] }), /not a core file/)
  }
  refuse('0001-x.json', migration({ operations: [{ op: 'delete', path: 'scripts/../brand/x' }] }), /invalid path/)
  refuse('0001-x.json', migration({ operations: [{ op: 'delete', path: '/etc/passwd' }] }), /invalid path/)
  refuse('0001-x.json', migration({ operations: [{ op: 'run', path: 'scripts/x.ts' }] }), /only "delete"/)
  refuse('0001-x.json', migration({ operations: [{ op: 'delete', path: 'scripts/x.ts', sha256: ['nope'] }] }), /sha256/)
  refuse('0001-x.json', migration({ operations: [] }), /operations/)
  refuse('0001-x.json', JSON.stringify({ schema_version: 2, description: 'x', operations: [] }), /schema_version/)
  refuse('1-x.json', migration({ operations: [{ op: 'delete', path: 'scripts/x.ts' }] }), /file name/)
  refuse('0001-x.json', '{', /not valid JSON/)

  // Every migration this template ships parses and names core files only.
  const shipped = path.join(repo, MIGRATIONS_DIR)
  const names = migrationFiles(fs.readdirSync(shipped).map((name) => `${MIGRATIONS_DIR}/${name}`))
  for (const name of names) parseMigration(name, fs.readFileSync(path.join(shipped, name), 'utf8'), manifest)
  assert.equal(fs.readdirSync(shipped).filter((name) => name.endsWith('.json')).length, names.length, 'every .json file is named NNNN-name.json')
})

test('migrations: template:update deletes known core leftovers, reports edited ones, never touches brand files, and runs once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-migrate-'))
  try {
    const template = path.join(dir, 'template')
    const brand = path.join(dir, 'brand')
    const files = { [SYNC_MANIFEST_PATH]: manifestText, 'package.json': '{\n  "version": "0.2.0"\n}\n', 'scripts/tool.ts': 'v1\n', 'scripts/dropped.ts': 'dropped v1\n', 'brand/brand.config.yaml': 'brand:\n  name: EXAMPLE\n' }
    initRepo(template)
    write(template, files)
    const base = commitAll(template, 'template v1')
    initRepo(brand)
    write(brand, files)
    // Leftovers in core paths the template never tracked in this history (an older generator wrote them).
    write(brand, { 'brand/brand.config.yaml': 'brand:\n  name: Northwind\n', 'scripts/legacy-a.ts': 'legacy\n', 'scripts/legacy-b.ts': 'legacy, edited by the brand\n' })
    writeTemplateRecord(brand, { repository: 'example/brand-os-template', commit: base, version: '0.2.0', recorded_at: '2026-11-21T00:00:00.000Z', source: 'studio' })
    commitAll(brand, 'brand: initialize')

    write(template, {
      'package.json': '{\n  "version": "0.3.0"\n}\n',
      'scripts/tool.ts': 'v2\n',
      'scripts/dropped.ts': null,
      [`${MIGRATIONS_DIR}/0002-second.json`]: migration({ description: 'Nothing left to remove.', operations: [{ op: 'delete', path: 'scripts/never-existed.ts' }] }),
      [`${MIGRATIONS_DIR}/0001-remove-legacy.json`]: migration({
        version: '0.3.0',
        description: 'Remove the legacy scripts.',
        operations: [
          { op: 'delete', path: 'scripts/legacy-a.ts', sha256: [sha('legacy\n')] },
          { op: 'delete', path: 'scripts/legacy-b.ts', sha256: [sha('legacy\n')] },
          // Also removed by the template itself: the update decides, the migration leaves it alone.
          { op: 'delete', path: 'scripts/dropped.ts' },
        ],
      }),
    })
    const to = commitAll(template, 'template v2 with migrations')

    const plan = planTemplateUpdate({ brandRoot: brand, templateRoot: template })
    assert.deepEqual(
      plan.migrations?.map((run) => [run.id, run.result, run.paths]),
      [
        ['0001-remove-legacy', 'needs_person', ['scripts/legacy-a.ts', 'scripts/legacy-b.ts']],
        ['0002-second', 'done', []],
      ],
      'in order',
    )
    const byPath = Object.fromEntries(plan.changes.map((change) => [change.path, change]))
    assert.equal(byPath['scripts/legacy-a.ts']?.action, 'delete')
    assert.equal(byPath['scripts/legacy-b.ts']?.action, 'conflict')
    assert.match(byPath['scripts/legacy-b.ts']!.reason, /edited/)
    assert.equal(byPath['scripts/dropped.ts']?.reason, 'removed from the template')
    assert.match(formatUpdatePlan(plan), /Migrations: 2\n {2}0001-remove-legacy \(0\.3\.0\): Remove the legacy scripts\. \(needs a person/)

    const result = applyTemplateUpdate(brand, plan)
    assert.equal(result.branch, `template-update/${to.slice(0, 12)}`)
    assert.equal(fs.existsSync(path.join(brand, 'scripts/legacy-a.ts')), false)
    assert.equal(fs.readFileSync(path.join(brand, 'scripts/legacy-b.ts'), 'utf8'), 'legacy, edited by the brand\n')
    assert.equal(fs.readFileSync(path.join(brand, 'brand/brand.config.yaml'), 'utf8'), 'brand:\n  name: Northwind\n')
    const message = git(brand, 'log', '-1', '--format=%B')
    assert.match(message, /Migrations:\n- 0001-remove-legacy \(0\.3\.0\): Remove the legacy scripts\./)
    const touched = git(brand, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort()
    assert.equal(touched.some((file) => file.startsWith('brand/') && file !== 'brand/template-version.json'), false)

    // Merged: the next update from the new record runs no migration again.
    git(brand, 'checkout', '-q', 'main')
    git(brand, 'merge', '-q', '--ff-only', result.branch)
    const next = planTemplateUpdate({ brandRoot: brand, templateRoot: template })
    assert.equal(next.upToDate, true)
    assert.deepEqual(next.migrations, [])
    // Running the same migrations on the result again finds nothing more to delete.
    const again = planMigrations([parseMigration('0001-remove-legacy.json', fs.readFileSync(path.join(template, MIGRATIONS_DIR, '0001-remove-legacy.json'), 'utf8'), manifest)], [], {
      base: () => null,
      theirs: () => null,
      local: (relative) => (fs.existsSync(path.join(brand, relative)) ? fs.readFileSync(path.join(brand, relative)) : null),
    })
    assert.deepEqual(again.changes.map((change) => [change.path, change.action]), [['scripts/legacy-b.ts', 'conflict']], 'only the edited copy is still reported')

    // A template migration that names a brand file stops the update before anything is written.
    write(template, { [`${MIGRATIONS_DIR}/0003-bad.json`]: migration({ operations: [{ op: 'delete', path: 'brand/brand.config.yaml' }] }) })
    commitAll(template, 'template v3 with a bad migration')
    const head = git(brand, 'rev-parse', 'HEAD')
    assert.throws(() => planTemplateUpdate({ brandRoot: brand, templateRoot: template }), /not a core file/)
    assert.equal(git(brand, 'rev-parse', 'HEAD'), head)
    assert.equal(git(brand, 'status', '--porcelain'), '')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
