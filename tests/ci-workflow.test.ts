import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { parse } from 'yaml'
import { writeStarterWorkspace } from '@brand-os/brand-core'
import { docsBuildPlan } from '../scripts/build-docs.js'
import { docsAudience } from '../scripts/docs-audience.js'
import { cliAudience, prepareDocs } from '../scripts/prepare-docs.js'
import { codeChanged, isBrandContentOnly } from '../scripts/ci-scope.js'
import { parseTestArgs, suiteFiles } from '../scripts/test.js'
import { removeTempDir, tempDir } from './helpers/cleanup.js'

const REPO = path.resolve(import.meta.dirname, '..')

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  uses?: string
  'timeout-minutes'?: number
}

interface Job {
  if?: string
  'timeout-minutes'?: number
  steps: Step[]
}

interface Workflow {
  on: Record<string, unknown>
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean }
  jobs: Record<string, Job>
}

const WORKFLOWS = path.join(REPO, '.github/workflows')
const workflow = parse(fs.readFileSync(path.join(WORKFLOWS, 'validate.yml'), 'utf8')) as Workflow
const TEMPLATE = 'omidlog/brand-os-template'

interface Context {
  publish: 'public' | 'private'
  /** false: the change is brand content only. */
  code?: boolean
  repository?: string
}

/** Evaluates the few `if:` forms the workflows use; anything else fails the test so it gets extended. */
function holds(condition: string, context: Context): boolean {
  const { publish, code = true, repository = 'someone/acme-brand' } = context
  const normalized = condition.replace(/\s+/g, ' ').trim()
  switch (normalized) {
    case "steps.docs.outputs.publish == 'public'":
      return publish === 'public'
    case "steps.docs.outputs.publish != 'public'":
      return publish !== 'public'
    case "steps.scope.outputs.code == 'true'":
      return code
    case `github.repository == '${TEMPLATE}'`:
      return repository === TEMPLATE
    default:
      return assert.fail(`the test does not understand the condition "${condition}"; extend holds()`)
  }
}

/** The commands GitHub Actions would run in this situation (default: a brand repository, code changed). */
function commandsFor(publish: 'public' | 'private', context: Omit<Context, 'publish'> = {}): string[] {
  const full = { publish, ...context }
  const commands: string[] = []
  for (const job of Object.values(workflow.jobs)) {
    if (job.if !== undefined && !holds(job.if, full)) continue
    for (const step of job.steps) {
      if (!step.run) continue
      if (step.if !== undefined && !holds(step.if, full)) continue
      commands.push(step.run)
    }
  }
  return commands
}

/** Anything that runs Studio or its browser tests. */
const STUDIO = [/test:studio/, /test:full/, /test:e2e/, /tests\/studio-/, /--suite (studio|all)/]

/** Anything that builds or scans the PUBLIC docs. */
const PUBLIC_DOCS = [/--audience public/, /build:docs:nomascot/, /docs:build/, /scan-public/]

const scripts = (JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts as Record<string, string> & { build: string; ci: string; test: string }

function brand(publish: 'public' | 'private'): string {
  const root = tempDir(`brand-os-ci-${publish}-`)
  writeStarterWorkspace(root)
  fs.cpSync(path.join(REPO, 'brand/tokens'), path.join(root, 'brand/tokens'), { recursive: true })
  const file = path.join(root, 'brand/brand.config.yaml')
  const config = fs.readFileSync(file, 'utf8').replace(/publish_docs:\s*\w+/, `publish_docs: ${publish}`)
  assert.match(config, new RegExp(`publish_docs: ${publish}`))
  fs.writeFileSync(file, config)
  return root
}

test('every job of every workflow has a timeout, and each test step its own', () => {
  for (const file of fs.readdirSync(WORKFLOWS).filter((name) => /\.ya?ml$/.test(name))) {
    const { jobs } = parse(fs.readFileSync(path.join(WORKFLOWS, file), 'utf8')) as Workflow
    for (const [name, job] of Object.entries(jobs)) {
      const minutes = job['timeout-minutes']
      assert.ok(typeof minutes === 'number' && minutes > 0 && minutes <= 30, `${file}: job ${name} needs timeout-minutes <= 30`)
      for (const step of job.steps.filter((s) => /npm run test/.test(s.run ?? ''))) {
        const own = step['timeout-minutes'] ?? Infinity
        assert.ok(own < minutes, `${file}: "${step.run}" needs a timeout shorter than its job`)
      }
    }
  }
  const verify = workflow.jobs.verify!
  assert.equal(verify.steps.find((s) => s.run === 'npm run test')?.['timeout-minutes'], 18)
  assert.equal(workflow.jobs.studio?.steps.find((s) => s.run === 'npm run test:studio')?.['timeout-minutes'], 12)
})

test('validate runs once per change and a newer push cancels the older run', () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'push', 'workflow_dispatch'])
  assert.deepEqual((workflow.on.push as { branches?: string[] }).branches, ['main'], 'branches are checked through their pull request')
  assert.equal(workflow.concurrency?.['cancel-in-progress'], true)
  assert.match(workflow.concurrency?.group ?? '', /github\.event\.pull_request\.number \|\| github\.ref/)

  const image = parse(fs.readFileSync(path.join(WORKFLOWS, 'studio-image.yml'), 'utf8')) as Workflow
  assert.equal(image.concurrency?.['cancel-in-progress'], true)
})

test('a brand repository never runs the Studio or browser suite, nor builds the Studio image', () => {
  for (const publish of ['public', 'private'] as const) {
    const commands = commandsFor(publish, { repository: 'someone/acme-brand' })
    for (const command of commands) for (const pattern of STUDIO) assert.doesNotMatch(command, pattern, `a brand repo must not run: ${command}`)
    assert.ok(commands.includes('npm run test'), 'it still runs the brand suite when code changed')
  }
  const image = parse(fs.readFileSync(path.join(WORKFLOWS, 'studio-image.yml'), 'utf8')) as Workflow
  for (const job of Object.values(image.jobs)) assert.equal(job.if, `github.repository == '${TEMPLATE}'`)

  // The template itself runs the Studio suite, in its own job next to the brand checks.
  const template = commandsFor('public', { repository: TEMPLATE })
  assert.ok(template.includes('npm run test:studio'))
  assert.equal(workflow.jobs.studio?.if, `github.repository == '${TEMPLATE}'`)
})

test('brand content only takes the fast path: no test suite, every brand check still runs', () => {
  for (const repository of ['someone/acme-brand', TEMPLATE]) {
    const fast = commandsFor('private', { code: false, repository })
    assert.ok(!fast.some((command) => /npm run test/.test(command)), `${repository}: brand content skips every test suite`)
    for (const check of ['npm run lint', 'npm run tokens:build', 'npm run prepare:docs', 'npm run typecheck', 'npm run validate']) {
      assert.ok(fast.includes(check), `${repository}: the fast path still runs ${check}`)
    }
    assert.ok(fast.some((command) => command.includes('--audience internal')))
  }
  const scope = workflow.jobs.verify!.steps.find((step) => step.id === 'scope')
  assert.ok(scope?.run?.includes('scripts/ci-scope.ts'), 'the scope step uses ci-scope')
  const order = workflow.jobs.verify!.steps.map((step) => step.id ?? step.run)
  assert.ok(order.indexOf('scope') < order.indexOf('npm run test'))
})

test('ci-scope: only brand content is content; anything else or an unknown base is code', () => {
  assert.equal(isBrandContentOnly(['brand/instance/approved-facts.yaml', 'docs/intro.md', 'docs-internal/STUDIO.md', 'assets/logo.svg', 'README.md', 'llms.txt', 'llms-full.txt']), true)
  for (const code of ['apps/studio/src/server.ts', 'packages/brand-core/src/index.ts', 'scripts/test.ts', 'tests/ci-workflow.test.ts', '.github/workflows/validate.yml', 'package.json', 'package-lock.json', 'docs/../apps/x.ts', 'nested/README.md']) {
    assert.equal(isBrandContentOnly(['brand/brand.config.yaml', code]), false, code)
  }
  assert.equal(isBrandContentOnly([]), false, 'an empty diff is not proof of brand content')

  const repo = tempDir('brand-os-ci-scope-')
  try {
    const git = (...args: string[]) => {
      const result = spawnSync('git', ['-c', 'user.name=ci', '-c', 'user.email=ci@example.invalid', ...args], { cwd: repo, encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
      return result.stdout.trim()
    }
    git('init', '-q')
    fs.mkdirSync(path.join(repo, 'brand'))
    fs.writeFileSync(path.join(repo, 'brand/facts.yaml'), 'a: 1\n')
    git('add', '.')
    git('commit', '-qm', 'base')
    const base = git('rev-parse', 'HEAD')
    fs.writeFileSync(path.join(repo, 'brand/facts.yaml'), 'a: 2\n')
    git('commit', '-qam', 'content')
    assert.equal(codeChanged(base, 'HEAD', repo), false)
    fs.mkdirSync(path.join(repo, 'scripts'))
    fs.writeFileSync(path.join(repo, 'scripts/x.ts'), '')
    git('add', '.')
    git('commit', '-qm', 'code')
    assert.equal(codeChanged(base, 'HEAD', repo), true)
    assert.equal(codeChanged(undefined, 'HEAD', repo), true, 'no base: code')
    assert.equal(codeChanged('0'.repeat(40), 'HEAD', repo), true, 'a new branch (zero sha): code')
    assert.equal(codeChanged('f'.repeat(40), 'HEAD', repo), true, 'a base git cannot find: code')
  } finally {
    removeTempDir(repo)
  }
})

test('test suites: brand excludes tests/studio-*, studio is exactly those, and npm scripts pick them', () => {
  const brandSuite = suiteFiles('brand', path.join(REPO, 'tests')).map((file) => path.basename(file))
  const studioSuite = suiteFiles('studio', path.join(REPO, 'tests')).map((file) => path.basename(file))
  const all = suiteFiles('all', path.join(REPO, 'tests'))
  assert.ok(brandSuite.includes('ci-workflow.test.ts'))
  assert.ok(!brandSuite.some((name) => name.startsWith('studio-')))
  assert.ok(studioSuite.length > 0 && studioSuite.every((name) => name.startsWith('studio-')))
  for (const name of ['studio-browser.test.ts', 'studio-browser-production.test.ts', 'studio-deploy.test.ts']) assert.ok(studioSuite.includes(name), name)
  assert.equal(all.length, brandSuite.length + studioSuite.length)

  // Naming rule: a test that needs apps/studio is a studio-* test, so brand repos never load it.
  for (const name of brandSuite) {
    const source = fs.readFileSync(path.join(REPO, 'tests', name), 'utf8')
    assert.doesNotMatch(source, /from ['"][^'"]*(apps\/studio|@brand-os\/studio)/, `${name} uses Studio: rename it tests/studio-*.test.ts`)
  }

  assert.deepEqual(parseTestArgs([]), { suite: 'brand', files: [] })
  assert.deepEqual(parseTestArgs(['--suite', 'studio']), { suite: 'studio', files: [] })
  assert.deepEqual(parseTestArgs(['--suite=all', 'tests/a.test.ts']), { suite: 'all', files: ['tests/a.test.ts'] })
  assert.throws(() => parseTestArgs(['--suite', 'nope']), /unknown suite/)
  assert.match(scripts.test, /--suite brand/)
  assert.match(scripts['test:studio'] ?? '', /--suite studio/)
  assert.match(scripts['test:full'] ?? '', /--suite all/)
  assert.match(scripts.ci, /npm run test:full/, 'the template\'s own ci runs everything')
})

test('a private-docs brand: CI skips every public docs build and scan, and its remaining docs steps succeed', () => {
  const root = brand('private')
  try {
    assert.equal(docsAudience(root), 'private')

    // The workflow step writes the audience for the `if:` conditions.
    const output = path.join(root, 'github-output')
    const cli = spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/docs-audience.ts'), root], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: output },
      timeout: 60_000,
    })
    assert.equal(cli.status, 0, cli.stderr)
    assert.equal(cli.stdout.trim(), 'private')
    assert.equal(fs.readFileSync(output, 'utf8'), 'publish=private\n')

    const commands = commandsFor('private')
    for (const command of commands) {
      for (const pattern of PUBLIC_DOCS) assert.doesNotMatch(command, pattern, `a private brand must not run: ${command}`)
    }
    assert.ok(commands.includes('npm run prepare:docs'))
    assert.ok(commands.some((command) => command.includes('--audience internal')), 'the internal docs build still compiles')

    // What those commands do: prepare:docs (no audience) picks internal, and a public build is refused.
    assert.doesNotThrow(() => prepareDocs(root, { rootIndex: false }))
    assert.throws(() => prepareDocs(root, { audience: 'public', rootIndex: false }), /publish_docs is private/)
  } finally {
    removeTempDir(root)
  }
})

test('prepare:docs CLI on a private brand: no flag prepares internal with a notice; an explicit public request is refused', () => {
  const root = brand('private')
  const env = { ...process.env }
  delete env.DOCS_AUDIENCE
  const run = (args: string[], extra: Record<string, string> = {}) =>
    // cwd is the brand (prepareDocs reads process.cwd()), so tsx is loaded from the template by URL.
    spawnSync(process.execPath, ['--import', pathToFileURL(path.join(REPO, 'node_modules/tsx/dist/esm/index.mjs')).href, path.join(REPO, 'scripts/prepare-docs.ts'), ...args], {
      cwd: root,
      encoding: 'utf8',
      env: { ...env, ...extra },
      timeout: 120_000,
    })
  try {
    // Exactly what validate.yml runs: `npm run prepare:docs`, no audience.
    const plain = run([])
    assert.equal(plain.status, 0, plain.stderr)
    assert.match(plain.stdout, /brand\.publish_docs is private: skipping the public docs build; preparing the internal audience instead/)
    assert.match(plain.stdout, /Prepared docs \(internal\)/)

    const internal = run([], { DOCS_AUDIENCE: 'internal' })
    assert.equal(internal.status, 0, internal.stderr)
    assert.match(internal.stdout, /Prepared docs \(internal\)/)

    // The guard: no flag, no environment variable can force a public build of a private brand.
    const flag = run(['--audience', 'public'])
    assert.notEqual(flag.status, 0)
    assert.match(flag.stderr, /publish_docs is private/)

    const fromEnv = run([], { DOCS_AUDIENCE: 'public' })
    assert.notEqual(fromEnv.status, 0)
    assert.match(fromEnv.stderr, /publish_docs is private/)
  } finally {
    removeTempDir(root)
  }
})

test('prepare-docs cliAudience: undefined only when neither flag nor a known DOCS_AUDIENCE is given', () => {
  assert.equal(cliAudience(undefined, undefined), undefined)
  assert.equal(cliAudience(undefined, 'staging'), undefined)
  assert.equal(cliAudience(undefined, 'internal'), 'internal')
  assert.equal(cliAudience(undefined, 'public'), 'public')
  assert.equal(cliAudience('internal', 'public'), 'internal')
  assert.equal(cliAudience('public', 'internal'), 'public')
})

test('a public-docs brand: CI builds and scans the public docs, with and without the mascot', () => {
  const root = brand('public')
  try {
    assert.equal(docsAudience(root), 'public')
    const commands = commandsFor('public').join('\n')
    for (const pattern of [/npm run build -w @brand-os\/docs/, /build:docs:nomascot/, /scan-public/]) assert.match(commands, pattern)
  } finally {
    removeTempDir(root)
  }
})


test('npm run build / ci: every docs build goes through build-docs, which follows publish_docs like CI', () => {
  for (const name of ['build', 'ci']) assert.doesNotMatch(scripts[name] ?? '', /--audience public/, `${name} must not force a public build`)
  for (const name of ['docs:build', 'docs:build:fa', 'build:docs:nomascot']) assert.match(scripts[name] ?? '', /scripts\/build-docs\.ts/, `${name} uses build-docs`)
  assert.match(scripts.build, /docs:build/)
  assert.match(scripts.ci, /npm run build\b/)
  assert.match(scripts.ci, /build:docs:nomascot/)

  const isPublic = (step: { args: string[] }) => step.args.join(' ').includes('--audience public')
  const priv = brand('private')
  const pub = brand('public')
  try {
    const main = docsBuildPlan(priv)
    assert.equal(main.audience, 'private')
    assert.ok(!main.steps.some(isPublic), 'a private brand never prepares public docs')
    assert.ok(main.steps.some((step) => step.args.join(' ').includes('--audience internal')), 'it compiles the internal docs instead')
    assert.match(main.note ?? '', /publish_docs is private/)
    const nomascot = docsBuildPlan(priv, { nomascot: true })
    assert.deepEqual(nomascot.steps, [])
    assert.match(nomascot.note ?? '', /no public docs build/)

    const fa = docsBuildPlan(pub, { extra: ['--locale', 'fa'] })
    assert.equal(fa.audience, 'public')
    assert.ok(fa.steps.some(isPublic))
    assert.deepEqual(fa.steps.at(-1)?.args.slice(-2), ['--locale', 'fa'])
    const pubNomascot = (docsBuildPlan(pub, { nomascot: true }).steps[0]?.args ?? []).join(' ')
    assert.match(pubNomascot, /--audience public --mascot false --gamification false/)

    // The CLI itself: a private brand's nomascot build exits 0 without building anything.
    const cli = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), path.join(REPO, 'scripts/build-docs.ts'), '--nomascot'], { cwd: priv, encoding: 'utf8', timeout: 60_000 })
    assert.equal(cli.status, 0, cli.stderr)
    assert.match(cli.stdout, /publish_docs is private/)
  } finally {
    removeTempDir(priv)
    removeTempDir(pub)
  }
})
