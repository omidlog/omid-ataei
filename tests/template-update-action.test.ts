import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { parse } from 'yaml'
import { classifyPath, parseSyncManifest, SYNC_MANIFEST_PATH } from '@brand-os/brand-core'
import { removeTempDir, tempDir } from './helpers/cleanup.js'

/** The brand-side "Template update" workflow: shape, secret guard and safety rules. The flow itself is in template-sync-e2e.test.ts. */
const REPO = path.resolve(import.meta.dirname, '..')
const WORKFLOW = '.github/workflows/template-update.yml'
const text = fs.readFileSync(path.join(REPO, WORKFLOW), 'utf8')

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  uses?: string
  env?: Record<string, string>
  with?: Record<string, unknown>
}
const workflow = parse(text) as {
  on: Record<string, unknown>
  permissions: Record<string, string>
  jobs: { update: { 'timeout-minutes': number; steps: Step[] } }
}
const steps = workflow.jobs.update.steps

test('the workflow is template-owned (core) in the sync manifest, as is its script', () => {
  const manifest = parseSyncManifest(fs.readFileSync(path.join(REPO, SYNC_MANIFEST_PATH), 'utf8'))
  assert.equal(classifyPath(manifest, WORKFLOW).kind, 'core')
  assert.equal(classifyPath(manifest, 'scripts/template-update-pr.ts').kind, 'core')
  assert.equal(classifyPath(manifest, 'docs/template-update-action.md').kind, 'core')
})

test('manual and scheduled triggers, least permissions, a job deadline', () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), ['schedule', 'workflow_dispatch'])
  assert.match(String((workflow.on.schedule as Array<{ cron: string }>)[0]!.cron), /^\S+ \S+ \S+ \S+ \S+$/)
  assert.deepEqual(workflow.permissions, { contents: 'write', 'pull-requests': 'write' })
  assert.ok(workflow.jobs.update['timeout-minutes'] <= 20)
})

test('every step after the setup check runs only when the secret is present', () => {
  assert.equal(steps[0]!.id, 'setup')
  assert.match(steps[0]!.env!.TEMPLATE_TOKEN!, /secrets\.BRAND_OS_TEMPLATE_TOKEN/)
  for (const step of steps.slice(1)) assert.equal(step.if, "steps.setup.outputs.enabled == 'true'", step.name ?? step.uses ?? step.run)
})

test('the setup check is a clear no-op without the secret', () => {
  const dir = tempDir('template-action-')
  try {
    const run = (token: string) => {
      const output = path.join(dir, `out-${token ? 'set' : 'empty'}`)
      fs.writeFileSync(output, '')
      const result = spawnSync('bash', ['-e', '-c', steps[0]!.run!], { encoding: 'utf8', env: { PATH: process.env.PATH, TEMPLATE_TOKEN: token, GITHUB_OUTPUT: output } })
      return { ...result, outputs: fs.readFileSync(output, 'utf8') }
    }
    const off = run('')
    assert.equal(off.status, 0)
    assert.match(off.stdout, /::notice title=Template update is off::.*BRAND_OS_TEMPLATE_TOKEN.*Nothing was done/)
    assert.equal(off.outputs.trim(), 'enabled=false')
    const on = run('ghp_example')
    assert.equal(on.status, 0)
    assert.equal(on.outputs.trim(), 'enabled=true')
    assert.doesNotMatch(on.stdout, /ghp_example/)
  } finally {
    removeTempDir(dir)
  }
})

test('never force-pushes, never merges, never prints the template token', () => {
  assert.doesNotMatch(text, /--force|push -f|\/merge|gh pr merge|auto-merge/)
  const clone = steps.find((step) => step.name === 'clone the template')!
  assert.match(clone.run!, /add-mask/)
  assert.doesNotMatch(clone.run!, /x-access-token:\$TEMPLATE_TOKEN@/)
  assert.match(clone.run!, /git -c "http\.extraheader=/)
  const open = steps.find((step) => step.name?.startsWith('open or update'))!
  assert.match(open.run!, /scripts\/template-update-pr\.ts --template/)
  const script = fs.readFileSync(path.join(REPO, 'scripts/template-update-pr.ts'), 'utf8')
  assert.doesNotMatch(script, /'--force'|'-f'|\/merge['`]/)
})
