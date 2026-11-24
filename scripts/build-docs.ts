import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { tokenCssBuildNote } from '@brand-os/brand-core'
import { docsAudience } from './docs-audience.js'

/**
 * Builds the docs the way CI (.github/workflows/validate.yml) does, following brand.publish_docs:
 *
 * - `public` brand: the public projection and Docusaurus build (with `--nomascot`, mascot and
 *   gamification hidden).
 * - `private` brand (the default for brands Studio creates): no public build at all, because
 *   prepare-docs refuses one. The default variant compiles the internal audience instead, exactly as
 *   CI does; it is never deployed. The `--nomascot` variant has nothing to do and says so.
 *
 * Usage: tsx scripts/build-docs.ts [--nomascot] [-- <extra docusaurus build args>]
 */
export interface DocsBuildStep {
  label: string
  command: string
  args: string[]
}

export function docsBuildPlan(root: string, options: { nomascot?: boolean; extra?: string[] } = {}): { audience: 'public' | 'private'; steps: DocsBuildStep[]; note?: string } {
  const audience = docsAudience(root)
  const build: DocsBuildStep = { label: 'docusaurus build', command: 'npm', args: ['run', 'build', '-w', '@brand-os/docs', ...(options.extra?.length ? ['--', ...options.extra] : [])] }
  if (audience === 'public') {
    const prepare = ['tsx', 'scripts/prepare-docs.ts', '--audience', 'public', ...(options.nomascot ? ['--mascot', 'false', '--gamification', 'false'] : [])]
    return { audience, steps: [{ label: 'prepare public docs', command: 'npx', args: prepare }, build] }
  }
  if (options.nomascot) return { audience, steps: [], note: 'brand.publish_docs is private: no public docs build (with or without the mascot).' }
  return {
    audience,
    steps: [{ label: 'prepare internal docs', command: 'npx', args: ['tsx', 'scripts/prepare-docs.ts', '--audience', 'internal'] }, build],
    note: 'brand.publish_docs is private: skipping the public docs build; compiling the internal docs instead (never deploy them).',
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2)
  const separator = argv.indexOf('--')
  const flags = separator === -1 ? argv : argv.slice(0, separator)
  const extra = separator === -1 ? [] : argv.slice(separator + 1)
  const plan = docsBuildPlan(process.cwd(), { nomascot: flags.includes('--nomascot'), extra })
  if (plan.note) console.log(`[docs] ${plan.note}`)
  const tokenNote = plan.steps.length > 0 ? tokenCssBuildNote(process.cwd()) : null
  if (tokenNote) console.log(`[docs] note: ${tokenNote}`)
  for (const step of plan.steps) {
    console.log(`[docs] ${step.label}: ${step.command} ${step.args.join(' ')}`)
    const result = spawnSync(step.command, step.args, { stdio: 'inherit' })
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
}
