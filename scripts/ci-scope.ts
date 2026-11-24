import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * Decides whether a change is brand content only (the fast CI path) or touches code.
 *
 * Brand content: brand/, docs/, docs-internal/, assets/, top-level *.md and llms(-full).txt. A change
 * made only of those skips the brand test suite; everything else (apps, packages, scripts, tests,
 * workflows, package files) is code. Anything unknown counts as code: a missing base commit, a failed
 * diff or an empty list never takes the fast path.
 *
 * Usage: tsx scripts/ci-scope.ts <base sha> [head]   (head defaults to HEAD)
 * In GitHub Actions it also writes `code=true|false` to $GITHUB_OUTPUT.
 */
export const BRAND_CONTENT = /^(brand|docs|docs-internal|assets)\/|^[^/]+\.md$|^llms(-full)?\.txt$/

export function isBrandContentOnly(paths: readonly string[]): boolean {
  const changed = paths.map((p) => p.trim()).filter(Boolean)
  return changed.length > 0 && changed.every((p) => BRAND_CONTENT.test(p) && !p.split('/').includes('..'))
}

/** The paths changed between two commits, or undefined when git cannot tell (e.g. the base is missing). */
export function changedPaths(base: string | undefined, head = 'HEAD', cwd = process.cwd()): string[] | undefined {
  if (!base || /^0+$/.test(base)) return undefined
  const diff = spawnSync('git', ['diff', '--name-only', base, head], { cwd, encoding: 'utf8' })
  if (diff.status !== 0) return undefined
  return diff.stdout.split('\n').filter(Boolean)
}

export function codeChanged(base: string | undefined, head = 'HEAD', cwd = process.cwd()): boolean {
  const paths = changedPaths(base, head, cwd)
  return paths === undefined || !isBrandContentOnly(paths)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const code = codeChanged(process.argv[2], process.argv[3])
  console.log(code ? 'code changed: running the full brand checks' : 'brand content only: skipping the brand test suite')
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `code=${code}\n`)
}
