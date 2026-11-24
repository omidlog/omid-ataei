// `npm run doctor`: checks the local setup (Node version, install state, common mistakes) and says
// in plain English how to fix each problem. It is plain JavaScript on purpose: it has to run before
// `npm ci` (so without tsx) and on a Node version that is too old for the rest of the repository.
// For problems inside the brand files themselves, use `npm run brand:doctor`.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Tracked files the docs build rewrites (see README, "Before you commit"). */
export const GENERATED_PATHS = ['apps/docs/generated', 'apps/docs/src/data', 'llms.txt', 'llms-full.txt']

/** Where the browser tests look for Chrome when CHROME_PATH is not set (tests/helpers/browser.ts). */
export const CHROME_CANDIDATES = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

/** Smallest version allowed by a `>=X[.Y[.Z]]` engines range, or null when the range has another form. */
export function minimumVersion(range) {
  const match = /^\s*>=\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?\s*$/.exec(range || '')
  return match ? [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)] : null
}

export function versionAtLeast(version, minimum) {
  const parts = String(version).replace(/^v/, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  for (let index = 0; index < 3; index += 1) {
    if ((parts[index] || 0) !== minimum[index]) return (parts[index] || 0) > minimum[index]
  }
  return true
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function realpathOrNull(file) {
  try {
    return fs.realpathSync(file)
  } catch {
    return null
  }
}

function defaultGit(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

function workspacePackages(root, patterns) {
  const found = []
  for (const pattern of patterns || []) {
    if (!pattern.endsWith('/*')) continue
    const dir = path.join(root, pattern.slice(0, -2))
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const manifest = readJson(path.join(dir, entry.name, 'package.json'))
      if (manifest && manifest.name) found.push({ name: manifest.name, dir: path.join(dir, entry.name) })
    }
  }
  return found
}

/**
 * Runs every check. Each result is `{ status: 'ok' | 'warn' | 'fail' | 'info', title, detail?, fix? }`.
 * Inputs are injectable so tests can describe a broken setup without breaking the real one.
 */
export function runChecks(options = {}) {
  const root = options.root || process.cwd()
  const nodeVersion = options.nodeVersion || process.versions.node
  const env = options.env || process.env
  const git = options.git || ((args) => defaultGit(root, args))
  const exists = options.exists || fs.existsSync
  const results = []
  const add = (status, title, detail, fix) => results.push({ status, title, ...(detail ? { detail } : {}), ...(fix ? { fix } : {}) })

  const manifest = readJson(path.join(root, 'package.json'))
  if (!manifest || !manifest.workspaces) {
    add('fail', 'Not in the Brand OS repository root', `No Brand OS package.json in ${root}.`, 'Open a terminal in the folder that holds package.json, AGENTS.md and brand/, then run npm run doctor again.')
    return results
  }

  // 1. Node version.
  const minimum = minimumVersion(manifest.engines && manifest.engines.node)
  if (minimum && !versionAtLeast(nodeVersion, minimum)) {
    add('fail', `Node ${nodeVersion} is too old`, `This repository needs Node ${minimum.join('.')} or newer.`, `Install Node ${minimum[0]} or newer (for example: nvm install ${minimum[0]} && nvm use ${minimum[0]}), then run npm ci.`)
  } else {
    add('ok', `Node ${nodeVersion}`)
  }

  // 2. Dependencies installed, and installed from package-lock.json.
  const modules = path.join(root, 'node_modules')
  const lock = readJson(path.join(root, 'package-lock.json'))
  if (!exists(modules)) {
    add('fail', 'Dependencies are not installed', 'There is no node_modules folder.', 'Run npm ci in the repository root.')
  } else {
    const wanted = Object.keys(manifest.devDependencies || {}).concat(Object.keys(manifest.dependencies || {}))
    const missing = []
    const drifted = []
    for (const name of wanted) {
      const installed = readJson(path.join(modules, name, 'package.json'))
      if (!installed) {
        missing.push(name)
        continue
      }
      const locked = lock && lock.packages && lock.packages[`node_modules/${name}`]
      if (locked && locked.version && installed.version !== locked.version) drifted.push(`${name} ${installed.version} (lock: ${locked.version})`)
    }
    if (missing.length) {
      add('fail', 'Some dependencies are missing', missing.join(', '), 'Run npm ci in the repository root.')
    } else if (drifted.length) {
      add('warn', 'Installed versions differ from package-lock.json', drifted.join(', '), 'Run npm ci so everyone tests against the same versions.')
    } else {
      add('ok', `Dependencies installed (${wanted.length} root packages match package-lock.json)`)
    }

    // A pull that changed the lock file without a reinstall is the most common cause of odd failures.
    const installMarker = path.join(modules, '.package-lock.json')
    const lockFile = path.join(root, 'package-lock.json')
    if (exists(installMarker) && exists(lockFile)) {
      const stale = (options.mtime || ((file) => fs.statSync(file).mtimeMs))
      if (stale(lockFile) > stale(installMarker) + 1000) {
        add('warn', 'package-lock.json changed after the last install', 'This usually happens after git pull or a branch switch.', 'Run npm ci.')
      }
    }

    // 3. Workspace packages linked (fails when npm install ran inside a package folder instead of the root).
    const unlinked = []
    for (const pkg of workspacePackages(root, manifest.workspaces)) {
      const link = realpathOrNull(path.join(modules, pkg.name))
      if (link !== realpathOrNull(pkg.dir)) unlinked.push(pkg.name)
    }
    if (unlinked.length) {
      add('fail', 'Workspace packages are not linked', unlinked.join(', '), 'Run npm ci in the repository root (not inside packages/ or apps/).')
    } else {
      add('ok', 'Workspace packages linked')
    }
  }

  // 4. A brand to work on.
  if (!exists(path.join(root, 'brand', 'brand.config.yaml'))) {
    add('warn', 'No brand/brand.config.yaml', 'The brand:* commands need it.', 'Run npm run brand:init -- --name "Your Brand" --slug your-brand --yes')
  } else {
    add('ok', 'brand/brand.config.yaml found')
  }

  // 5. Git state: secrets that must never be committed, and generated files left over from a docs build.
  const tracked = git(['ls-files', '-z'])
  if (tracked === null) {
    add('info', 'Git checks skipped', 'git is not installed or this is not a git checkout.')
  } else {
    const envFiles = tracked.split('\0').filter((file) => /(^|\/)\.env(\.[^/]*)?$/.test(file) && !/\.example$/.test(file))
    if (envFiles.length) {
      add('fail', 'Environment files are committed', envFiles.join(', '), 'Remove them from git (git rm --cached <file>), keep them only on your machine, and rotate any secret they held.')
    } else {
      add('ok', 'No .env files committed')
    }
    const changed = git(['status', '--porcelain', '--', ...GENERATED_PATHS])
    if (changed && changed.trim()) {
      add('warn', 'Generated docs files are changed', 'A docs build (npm run ci or npm run build) rewrites them.', `Unless you meant to regenerate them: git checkout -- ${GENERATED_PATHS.join(' ')}`)
    }
  }

  // 6. Chrome for the browser tests (optional).
  const chrome = [env.CHROME_PATH, ...CHROME_CANDIDATES].find((candidate) => candidate && exists(candidate))
  if (env.CHROME_PATH && !exists(env.CHROME_PATH)) {
    add('warn', 'CHROME_PATH points to a missing file', env.CHROME_PATH, chrome ? `Fix CHROME_PATH or unset it. The browser tests use ${chrome} for now.` : 'Fix CHROME_PATH or unset it. Without Chrome the browser tests are skipped.')
  } else if (chrome) {
    add('ok', 'Chrome found for the browser tests')
  } else {
    add('info', 'Chrome not found', 'npm run test skips the browser tests; npm run test:e2e fails.', 'Install Google Chrome or Chromium, or set CHROME_PATH to its binary.')
  }

  return results
}

const LABELS = { ok: 'ok  ', warn: 'warn', fail: 'FAIL', info: 'info' }

export function renderReport(results) {
  const lines = []
  for (const result of results) {
    lines.push(`[${LABELS[result.status]}] ${result.title}`)
    if (result.detail) lines.push(`       ${result.detail}`)
    if (result.fix) lines.push(`       Fix: ${result.fix}`)
  }
  const failed = results.filter((result) => result.status === 'fail').length
  const warned = results.filter((result) => result.status === 'warn').length
  lines.push('')
  lines.push(failed ? `${failed} problem(s) to fix before the repository will work.` : warned ? `Setup works. ${warned} warning(s) worth a look.` : 'Setup looks good.')
  lines.push('Problems inside the brand files: npm run brand:doctor')
  return `${lines.join('\n')}\n`
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const results = runChecks({ root })
  process.stdout.write(renderReport(results))
  process.exitCode = results.some((result) => result.status === 'fail') ? 1 : 0
}
