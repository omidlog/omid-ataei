import path from 'node:path'
import { parseArgs } from 'node:util'
import { applyTemplateUpdate, formatUpdatePlan, planTemplateUpdate } from '@brand-os/brand-core'

/**
 * npm run template:update -- --template <path to a local template clone> [--to <ref>] [--base <commit>]
 *                            [--apply] [--branch <name>] [--json] [--repo <brand repo, default cwd>]
 *
 * Dry run by default. With --apply, writes core and cleanly merged files on a new branch and commits.
 * Never touches brand-owned files, never pushes, never merges. See docs/template-sync.md.
 */
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    template: { type: 'string' },
    to: { type: 'string' },
    base: { type: 'string' },
    branch: { type: 'string' },
    repo: { type: 'string' },
    apply: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  },
})

if (!values.template) {
  console.error('template:update needs --template <path to a local clone of the Brand OS template>. Example: npm run template:update -- --template ../brand-os-template')
  process.exit(1)
}

try {
  const brandRoot = path.resolve(values.repo ?? process.cwd())
  const plan = planTemplateUpdate({ brandRoot, templateRoot: path.resolve(values.template), to: values.to, base: values.base })
  const applied = values.apply && !plan.upToDate ? applyTemplateUpdate(brandRoot, plan, { branch: values.branch }) : undefined
  if (values.json) {
    const changes = plan.changes.map(({ content: _content, ...rest }) => rest)
    console.log(JSON.stringify({ ...plan, changes, applied: applied ?? null }, null, 2))
  } else console.log(formatUpdatePlan(plan, applied))
  if (plan.changes.some((change) => change.action === 'conflict')) process.exitCode = 2
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
