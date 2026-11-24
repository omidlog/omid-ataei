import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Runs the test suite so that it always ends and leaves nothing behind:
 *
 * - every test gets a deadline (`--test-timeout`) and the runner exits even if a handle stays open
 *   (`--test-force-exit`);
 * - the whole run has a deadline (BRAND_OS_TEST_TIMEOUT_MS, default 15 minutes). When it passes, the
 *   runner and every process it started (Studio servers, Chrome and its helpers) are killed and the
 *   run fails with a clear message instead of hanging a CI job for hours;
 * - TMPDIR points at a fresh directory for the run, removed at the end, so no test can leave a
 *   directory in the system temp dir, whatever it does or however it fails.
 *
 * Usage: tsx scripts/test.ts [--suite brand|studio|all] [test files...]
 *
 * Suites (used when no files are given; default brand):
 * - brand:  every tests/*.test.ts except tests/studio-* (what a brand repository checks);
 * - studio: tests/studio-*.test.ts (Studio server, sync, provisioning, headless Chrome);
 * - all:    both.
 * Naming rule: any test that needs apps/studio is named tests/studio-*.test.ts.
 */
const PER_TEST_MS = 180_000
const totalMs = Number(process.env.BRAND_OS_TEST_TIMEOUT_MS ?? 15 * 60_000)

export type Suite = 'brand' | 'studio' | 'all'

/** The test files of a suite: studio is tests/studio-*.test.ts, brand is every other test. */
export function suiteFiles(suite: Suite, dir = 'tests'): string[] {
  return fs
    .readdirSync(dir)
    .sort()
    .filter((name) => name.endsWith('.test.ts'))
    .filter((name) => suite === 'all' || (suite === 'studio') === name.startsWith('studio-'))
    .map((name) => path.join(dir, name))
}

export function parseTestArgs(argv: string[]): { suite: Suite; files: string[] } {
  let suite: Suite = 'brand'
  const files: string[] = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!
    const value = arg === '--suite' ? (argv[++i] ?? '') : arg.startsWith('--suite=') ? arg.slice('--suite='.length) : undefined
    if (value === undefined) files.push(arg)
    else if (value === 'brand' || value === 'studio' || value === 'all') suite = value
    else throw new Error(`unknown suite "${value}" (brand, studio or all)`)
  }
  return { suite, files }
}

function main(): void {
  const { suite, files: given } = parseTestArgs(process.argv.slice(2))
  const files = given.length > 0 ? given : suiteFiles(suite)

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-test-'))
  const child = spawn(process.execPath, ['--import', 'tsx', '--test', `--test-timeout=${PER_TEST_MS}`, '--test-force-exit', ...files], {
    stdio: 'inherit',
    // Its own process group, so a timeout or Ctrl-C can stop every descendant at once.
    detached: true,
    env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp },
  })

  function killGroup(signal: NodeJS.Signals): void {
    try {
      if (child.pid) process.kill(-child.pid, signal)
    } catch {
      // already gone
    }
  }

  let timedOut = false
  const deadline = setTimeout(() => {
    timedOut = true
    console.error(`\n[test] the suite did not finish within ${totalMs / 1000} s; stopping it and every process it started.`)
    killGroup('SIGTERM')
    setTimeout(() => killGroup('SIGKILL'), 5_000).unref()
  }, totalMs)

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      killGroup(signal)
      setTimeout(() => killGroup('SIGKILL'), 5_000).unref()
    })
  }

  child.on('exit', (code, signal) => {
    clearTimeout(deadline)
    // Helpers (e.g. Chrome's) may outlive the runner; nothing of this run may keep going.
    killGroup('SIGKILL')
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch (error) {
      console.error(`[test] could not remove ${tmp}: ${(error as Error).message}`)
    }
    if (timedOut) process.exit(1)
    process.exit(code ?? (signal ? 1 : 0))
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
