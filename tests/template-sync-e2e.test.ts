import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { readTemplateRecord, SYNC_MANIFEST_PATH, TEMPLATE_RECORD_PATH, writeTemplateRecord } from '@brand-os/brand-core'
import { runTemplateUpdatePr, type FetchLike } from '../scripts/template-update-pr.js'
import { removeTempDir, tempDir } from './helpers/cleanup.js'
import { FakeGitHub } from './helpers/fake-github.js'

/**
 * Template sync end to end with a fake brand: local git repositories stand in for GitHub's git side
 * (a template repository and the brand's bare "origin"), FakeGitHub for its REST side. No network.
 *
 * create the brand from the template -> change the template (a core file, a shared file, a template copy of
 * a brand file, a migration) -> the Template update action opens the update PR -> merge it -> the record
 * has advanced and the next update is empty. Brand-owned files never change along the way.
 */
const REPO = path.resolve(import.meta.dirname, '..')
const OWNER = 'acme'
const BRAND = 'pilot-brand'
const TEMPLATE_REPOSITORY = 'acme/brand-os-template'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function configure(dir: string): void {
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

/** sha256 of every brand-owned file (everything under brand/ except the template version record). */
function brandFiles(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else {
        const relative = path.relative(root, full).split(path.sep).join('/')
        if (relative !== TEMPLATE_RECORD_PATH) out[relative] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')
      }
    }
  }
  walk(path.join(root, 'brand'))
  return out
}

/** brand/ files at a commit of the bare origin, for branches the working clone never checked out. */
function brandFilesAt(bare: string, ref: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const relative of git(bare, 'ls-tree', '-r', '--name-only', ref, '--', 'brand').split('\n').filter(Boolean)) {
    if (relative === TEMPLATE_RECORD_PATH) continue
    out[relative] = crypto.createHash('sha256').update(execFileSync('git', ['show', `${ref}:${relative}`], { cwd: bare })).digest('hex')
  }
  return out
}

interface World {
  root: string
  template: string
  bare: string
  brand: string
  github: FakeGitHub
  fetch: FetchLike
  created: string
  brandSnapshot: Record<string, string>
  run: (options?: { canPushWorkflows?: boolean }) => ReturnType<typeof runTemplateUpdatePr>
}

function createWorld(): World {
  const root = tempDir('template-e2e-')
  const template = path.join(root, 'template')
  const bare = path.join(root, 'brand.git')
  const brand = path.join(root, 'brand')

  // The template repository.
  fs.mkdirSync(template)
  git(template, 'init', '-q', '-b', 'main')
  configure(template)
  write(template, {
    [SYNC_MANIFEST_PATH]: fs.readFileSync(path.join(REPO, SYNC_MANIFEST_PATH), 'utf8'),
    'package.json': '{\n  "name": "brand-os-template",\n  "version": "0.2.0"\n}\n',
    'README.md': '# Brand OS\n\nIntro.\n\nUsage.\n',
    'scripts/hello.ts': "export const hello = 'v1'\n",
    'docs/old-guide.md': 'An old guide.\n',
    '.github/workflows/validate.yml': 'name: validate\n',
    'brand/brand.config.yaml': 'brand:\n  name: Template default\n',
  })
  const created = commitAll(template, 'template v1')

  // "Create brand from template": a copy without shared history (as GitHub's generate does) whose record
  // points at the template commit, pushed to the brand's origin.
  fs.mkdirSync(bare)
  git(bare, 'init', '-q', '--bare', '-b', 'main')
  fs.mkdirSync(brand)
  git(brand, 'init', '-q', '-b', 'main')
  configure(brand)
  for (const relative of git(template, 'ls-files').split('\n')) write(brand, { [relative]: fs.readFileSync(path.join(template, relative), 'utf8') })
  writeTemplateRecord(brand, { repository: TEMPLATE_REPOSITORY, commit: created, version: '0.2.0', recorded_at: '2026-11-21T00:00:00.000Z', source: 'studio' })
  write(brand, {
    'brand/brand.config.yaml': 'brand:\n  name: Pilot\n',
    'brand/instance/approved-facts.yaml': 'facts: []\n',
    'README.md': '# Pilot brand\n\nIntro.\n\nUsage.\n',
  })
  commitAll(brand, 'feat: create Pilot from the Brand OS template')
  git(brand, 'remote', 'add', 'origin', bare)
  git(brand, 'push', '-q', 'origin', 'main')

  const github = new FakeGitHub()
  github.addRepo(OWNER, BRAND, new Map())
  // GitHub knows the branches that were pushed to the brand's origin.
  const fetch: FetchLike = async (input, init) => {
    const repo = github.repo(OWNER, BRAND)!
    for (const line of git(bare, 'for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/heads').split('\n').filter(Boolean)) {
      const [name, sha] = line.split(' ') as [string, string]
      if (name !== 'main') repo.branches.set(name, sha)
    }
    return github.fetch(input, init)
  }
  const world: World = {
    root,
    template,
    bare,
    brand,
    github,
    fetch,
    created,
    brandSnapshot: brandFiles(brand),
    run: (options = {}) =>
      runTemplateUpdatePr({ brandRoot: brand, templateRoot: template, repository: `${OWNER}/${BRAND}`, token: 'brand-token', fetch, canPushWorkflows: options.canPushWorkflows, log: () => {} }),
  }
  return world
}

function changeTemplate(world: World, files: Record<string, string | null>, message: string): string {
  write(world.template, files)
  return commitAll(world.template, message)
}

/** A person merges the pull request on GitHub; the brand checkout pulls main. */
function mergePull(world: World, number: number): void {
  const pull = world.github.repo(OWNER, BRAND)!.pulls.find((item) => item.number === number)!
  git(world.brand, 'fetch', '-q', 'origin')
  git(world.brand, 'checkout', '-q', 'main')
  git(world.brand, 'merge', '-q', '--no-ff', '-m', `Merge pull request #${number}`, `origin/${pull.head}`)
  git(world.brand, 'push', '-q', 'origin', 'main')
  pull.state = 'closed'
}

const MIGRATION = JSON.stringify({ schema_version: 1, version: '0.3.0', description: 'Remove the old guide.', operations: [{ op: 'delete', path: 'docs/old-guide.md' }] }, null, 2)

test('fake brand end to end: create, change template, update PR, merge, next update is empty', async () => {
  const world = createWorld()
  try {
    const mainBefore = git(world.bare, 'rev-parse', 'main')
    const target = changeTemplate(
      world,
      {
        'scripts/hello.ts': "export const hello = 'v2'\n",
        'README.md': '# Brand OS\n\nIntro.\n\nUsage, now with an example.\n',
        'package.json': '{\n  "name": "brand-os-template",\n  "version": "0.3.0"\n}\n',
        'brand/brand.config.yaml': 'brand:\n  name: Template default v2\n',
        'brand/new-template-default.md': 'A template copy of a brand file.\n',
        '.brand-os/migrations/0001-remove-old-guide.json': `${MIGRATION}\n`,
      },
      'template v2: hello v2, README example, migration 0001',
    )
    const branch = `template-update/${target.slice(0, 12)}`

    // The action opens one update PR.
    const opened = await world.run()
    assert.equal(opened.code, 'opened', opened.message)
    assert.ok(opened.code === 'opened')
    assert.equal(opened.branch, branch)
    assert.equal(opened.pull.number, 1)
    const pulls = world.github.repo(OWNER, BRAND)!.pulls
    assert.equal(pulls.length, 1)
    assert.equal(pulls[0]!.base, 'main')
    assert.match(pulls[0]!.body!, /never merged automatically|Nothing is merged automatically/)
    assert.match(pulls[0]!.body!, /0001-remove-old-guide/)

    // The default branch did not move; the update lives on the new branch only.
    assert.equal(git(world.bare, 'rev-parse', 'main'), mainBefore)
    assert.equal(git(world.bare, 'show', `${branch}:scripts/hello.ts`), "export const hello = 'v2'")
    assert.match(git(world.bare, 'show', `${branch}:README.md`), /# Pilot brand[\s\S]*now with an example/)
    assert.equal(git(world.bare, 'ls-tree', '--name-only', branch, '--', 'docs/old-guide.md'), '', 'migration 0001 deleted the old guide')
    assert.deepEqual(brandFilesAt(world.bare, branch), world.brandSnapshot, 'brand-owned files are untouched on the update branch')
    assert.equal(JSON.parse(git(world.bare, 'show', `${branch}:${TEMPLATE_RECORD_PATH}`)).commit, target)
    // The checkout is back where it was and clean.
    assert.equal(git(world.brand, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main')
    assert.equal(git(world.brand, 'status', '--porcelain'), '')
    assert.deepEqual(brandFiles(world.brand), world.brandSnapshot)

    // A second run while the PR is open opens nothing.
    const again = await world.run()
    assert.equal(again.code, 'exists', again.message)
    assert.equal(world.github.callsTo('POST', /\/pulls$/).length, 1)

    // A person merges it.
    mergePull(world, 1)
    assert.equal(readTemplateRecord(world.brand)!.commit, target, 'the brand record advanced')
    assert.equal(fs.readFileSync(path.join(world.brand, 'scripts/hello.ts'), 'utf8'), "export const hello = 'v2'\n")
    assert.equal(fs.existsSync(path.join(world.brand, 'docs/old-guide.md')), false)
    assert.deepEqual(brandFiles(world.brand), world.brandSnapshot, 'brand-owned files are untouched after the merge')

    // The next update is empty: no new branch, no new PR.
    const branchesBefore = git(world.bare, 'for-each-ref', '--format=%(refname)', 'refs/heads')
    const next = await world.run()
    assert.equal(next.code, 'current', next.message)
    assert.equal(world.github.callsTo('POST', /\/pulls$/).length, 1)
    assert.equal(git(world.bare, 'for-each-ref', '--format=%(refname)', 'refs/heads'), branchesBefore)
    assert.deepEqual(brandFiles(world.brand), world.brandSnapshot)
  } finally {
    removeTempDir(world.root)
  }
})

test('a newer template supersedes an open update PR: still one open, the old branch kept', async () => {
  const world = createWorld()
  try {
    changeTemplate(world, { 'scripts/hello.ts': "export const hello = 'v2'\n" }, 'template v2')
    const first = await world.run()
    assert.equal(first.code, 'opened', first.message)
    const newer = changeTemplate(world, { 'scripts/hello.ts': "export const hello = 'v3'\n" }, 'template v3')
    const second = await world.run()
    assert.equal(second.code, 'opened', second.message)
    assert.ok(second.code === 'opened')
    assert.deepEqual(second.superseded, [1])
    const pulls = world.github.repo(OWNER, BRAND)!.pulls
    assert.deepEqual(pulls.filter((pull) => pull.state !== 'closed').map((pull) => pull.number), [2])
    assert.match(pulls[0]!.comments![0]!, /Superseded by #2/)
    // The new branch starts from main, not from the old update branch.
    assert.equal(git(world.bare, 'rev-parse', `template-update/${newer.slice(0, 12)}^`), git(world.bare, 'rev-parse', 'main'))
    assert.ok(git(world.bare, 'for-each-ref', '--format=%(refname:short)', 'refs/heads').includes((first as { branch: string }).branch))
    assert.deepEqual(brandFilesAt(world.bare, `template-update/${newer.slice(0, 12)}`), world.brandSnapshot)
  } finally {
    removeTempDir(world.root)
  }
})

test('workflow file changes need the optional PR token; a conflict is listed, not written', async () => {
  const world = createWorld()
  try {
    // The brand edited a core file the template also changes: needs a person.
    write(world.brand, { 'scripts/hello.ts': "export const hello = 'brand edit'\n" })
    commitAll(world.brand, 'brand edits a core file')
    git(world.brand, 'push', '-q', 'origin', 'main')
    changeTemplate(world, { '.github/workflows/validate.yml': 'name: validate v2\n', 'scripts/hello.ts': "export const hello = 'v2'\n" }, 'template v2 changes a workflow')

    const blocked = await world.run()
    assert.equal(blocked.code, 'blocked')
    assert.match(blocked.message, /workflow files.*BRAND_OS_PR_TOKEN.*Nothing was pushed/)
    assert.equal(git(world.bare, 'for-each-ref', '--format=%(refname:short)', 'refs/heads'), 'main')
    assert.equal(world.github.callsTo('POST', /\/pulls$/).length, 0)

    const opened = await world.run({ canPushWorkflows: true })
    assert.equal(opened.code, 'opened', opened.message)
    const pull = world.github.repo(OWNER, BRAND)!.pulls[0]!
    assert.match(pull.body!, /Needs a person[\s\S]*scripts\/hello\.ts/)
    assert.equal(git(world.bare, 'show', `${(opened as { branch: string }).branch}:scripts/hello.ts`), "export const hello = 'brand edit'")
    assert.deepEqual(brandFiles(world.brand), world.brandSnapshot)
  } finally {
    removeTempDir(world.root)
  }
})

test('the template repository itself never opens an update PR', async () => {
  const world = createWorld()
  try {
    changeTemplate(world, { 'scripts/hello.ts': "export const hello = 'v2'\n" }, 'template v2')
    const result = await runTemplateUpdatePr({ brandRoot: world.brand, templateRoot: world.template, repository: 'omidlog/brand-os-template', token: 't', fetch: world.fetch, log: () => {} })
    assert.equal(result.code, 'current')
    assert.match(result.message, /template itself/)
    assert.equal(world.github.calls.length, 0)
  } finally {
    removeTempDir(world.root)
  }
})
