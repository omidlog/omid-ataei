import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { test } from 'node:test'
import { issueAgentToken } from '@brand-os/brand-core'
import { approveFacts, contentBrand } from './helpers/content.js'
import { TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'

/**
 * `npm run brand:query -- --tool task_context` through the real CLI process: the token comes from the environment,
 * the classifier runs in the CLI, and a guest is refused. Fixtures are SYNTHETIC DEMO brands in temp directories.
 */
useTestKey()

const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')

function query(root: string, args: string[], token?: string) {
  const env: Record<string, string> = { ...process.env, BRAND_OS_DATA_KEY: TEST_DATA_KEY, BRAND_OS_KNOWLEDGE_GH: 'off' } as Record<string, string>
  delete env.BRAND_OS_APPROVAL_PROOF
  if (token) env.BRAND_OS_AGENT_TOKEN = token
  else delete env.BRAND_OS_AGENT_TOKEN
  const result = spawnSync(tsx, [path.join(repo, 'scripts', 'brand.ts'), 'query', '--tool', 'task_context', ...args], { cwd: root, encoding: 'utf8', env, input: '' })
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(result.stdout) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: result.status, json, stdout: result.stdout, stderr: result.stderr }
}

test('brand:query task_context: token from the environment, classifier in the CLI, guest refused', async () => {
  const s = await contentBrand('pilito-cli')
  approveFacts(s, [
    ['business.identity.trade_name', 'Pilito'],
    ['brand.strategy.purpose', 'Help adults speak a new language from day one.'],
  ])
  const { token } = issueAgentToken(s.root, { brandId: 'pilito-cli', profile: 'content-read', label: 'cli test' })

  // A guest gets denied and learns nothing about the brand.
  const guest = query(s.root, ['--task-type', 'visual_design'])
  assert.equal(guest.status, 0)
  assert.equal(guest.json.status, 'denied')
  assert.equal(guest.json.data, null)
  assert.ok(!guest.stdout.includes('Pilito'), 'no brand value for a guest')

  // The Persian request is classified in the CLI: ten Instagram posts, on-demand, nothing written.
  const fa = query(s.root, ['--request', '۱۰ پست اینستاگرام برای محصول بساز', '--locale', 'fa'], token)
  assert.equal(fa.status, 0, fa.stderr)
  assert.equal(fa.json.status, 'ok', JSON.stringify(fa.json).slice(0, 400))
  const pack = fa.json.data as { task: Record<string, unknown>; readiness: string; permissions: Record<string, boolean>; authorizes: unknown[]; guardrails: string[] }
  assert.equal(pack.task.type, 'social_batch')
  assert.equal(pack.task.deliverable_count, 10)
  assert.equal(pack.task.channel, 'instagram')
  assert.equal(pack.task.locale, 'fa')
  assert.deepEqual(pack.authorizes, [])
  assert.deepEqual(pack.permissions, { publish: false, schedule: false, spend: false, deploy: false })
  assert.ok(pack.guardrails.some((line) => line.includes('درخواست موردی')), 'Persian on-demand rule')

  // An unclear request asks for the task type instead of guessing one.
  const vague = query(s.root, ['--request', 'make something nice for us'], token)
  assert.equal(vague.json.status, 'need_task_type')
  assert.equal(vague.json.data, null)
  assert.match(String(vague.json.reason), /--task-type/)

  // A forged argument is not a privilege: --include-unapproved is refused by the existing CLI guard.
  const forged = query(s.root, ['--task-type', 'visual_design', '--include-unapproved'], token)
  assert.equal(forged.json.status, 'ok')
  assert.match(forged.stderr, /--include-unapproved is ignored/)

  // The same call twice gives the same digest.
  const first = query(s.root, ['--task-type', 'website_design'], token)
  const second = query(s.root, ['--task-type', 'website_design'], token)
  const digest = (result: typeof first): unknown => (result.json.data as { digests: { context_sha256: string } }).digests.context_sha256
  assert.equal(digest(first), digest(second))
  assert.match(String(digest(first)), /^[0-9a-f]{64}$/)
})
