import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'
import { BUDGET_CANARY, seoProposal, strategyBrand } from './helpers/strategy.js'

/** The Sprint 3 owner journey through the real brand:strategy CLI in a temporary brand (real clock, no network). */
useTestKey()

const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')

function cli(root: string, args: string[], env: Record<string, string | undefined> = {}): { status: number | null; json: Record<string, unknown>; stdout: string; stderr: string } {
  const base: Record<string, string | undefined> = { ...process.env, BRAND_OS_DATA_KEY: TEST_DATA_KEY, BRAND_OS_KNOWLEDGE_GH: 'off' }
  delete base.BRAND_OS_AGENT_TOKEN
  delete base.BRAND_OS_APPROVAL_PROOF
  const merged = { ...base, ...env }
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key]
  const result = spawnSync(tsx, [path.join(repo, 'scripts', 'strategy.ts'), ...args], { cwd: root, encoding: 'utf8', env: merged as NodeJS.ProcessEnv, input: '' })
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(result.stdout) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: result.status, json, stdout: result.stdout, stderr: result.stderr }
}

function errorCode(out: { json: Record<string, unknown> }): string | undefined {
  return (out.json.error as { code?: string } | undefined)?.code
}

test('journey: propose v1, review, approve with proof and hash, propose v2 with a diff, reject, withdraw', async () => {
  // Real clock: the proposal dates must contain today.
  const today = new Date()
  const s = await strategyBrand('pilito', today)
  const iso = (days: number) => new Date(today.getTime() + days * 86_400_000).toISOString().slice(0, 10)
  const dates = { valid_from: iso(-1), valid_until: iso(200), review_due_at: iso(90) }
  const v1 = path.join(s.root, 'v1.json')
  fs.writeFileSync(v1, JSON.stringify(seoProposal(s.research, dates)))

  const proposed = cli(s.root, ['propose', '--id', 'seo-discovery', '--file', v1, '--json'])
  assert.equal(proposed.status, 0, proposed.stdout + proposed.stderr)
  assert.equal(proposed.json.revision, 1)
  const sha = proposed.json.content_sha256 as string

  const review = cli(s.root, ['review', '--id', 'seo-discovery', '--revision', '1', '--json'])
  assert.equal(review.status, 0, review.stdout + review.stderr)
  const report = review.json.review as { blockers: string[]; approve_with: string; impact: { restricted_fields: string[] }; diff: Array<{ path: string; change: string }> }
  assert.deepEqual(report.blockers, [])
  assert.ok(report.approve_with.includes(`--expect-sha ${sha}`))
  assert.ok(report.impact.restricted_fields.includes('restricted.budget'))
  assert.ok(report.diff.every((item) => item.change === 'added'))
  const reviewText = cli(s.root, ['review', '--id', 'seo-discovery', '--revision', '1'])
  assert.match(reviewText.stdout, /Approve with: npm run brand:strategy -- approve/)

  // No proof, wrong proof, wrong hash: nothing is approved.
  assert.equal(errorCode(cli(s.root, ['approve', '--id', 'seo-discovery', '--revision', '1', '--expect-sha', sha, '--json'])), 'proof')
  assert.equal(errorCode(cli(s.root, ['approve', '--id', 'seo-discovery', '--revision', '1', '--expect-sha', sha, '--json'], { BRAND_OS_APPROVAL_PROOF: 'wrong-proof' })), 'proof')
  assert.equal(errorCode(cli(s.root, ['approve', '--id', 'seo-discovery', '--revision', '1', '--expect-sha', '0'.repeat(64), '--json'], { BRAND_OS_APPROVAL_PROOF: s.proof })), 'stale_revision')
  const approved = cli(s.root, ['approve', '--id', 'seo-discovery', '--revision', '1', '--expect-sha', sha, '--json'], { BRAND_OS_APPROVAL_PROOF: s.proof })
  assert.equal(approved.status, 0, approved.stdout + approved.stderr)
  assert.match(cli(s.root, ['approve', '--id', 'seo-discovery', '--revision', '1', '--expect-sha', sha], { BRAND_OS_APPROVAL_PROOF: s.proof }).stderr, /refused/)

  // v2 is a draft with a diff against v1; v1 stays approved.
  const v2 = path.join(s.root, 'v2.json')
  fs.writeFileSync(v2, JSON.stringify(seoProposal(s.research, { ...dates, title: 'Organic discovery, guides and glossary', non_goals: ['Paid search', 'Link buying'] })))
  const second = cli(s.root, ['propose', '--id', 'seo-discovery', '--file', v2, '--json'])
  assert.equal(second.status, 0, second.stdout + second.stderr)
  assert.equal(second.json.supersedes_revision, 1)
  const diff = (cli(s.root, ['review', '--id', 'seo-discovery', '--revision', '2', '--json']).json.review as { diff: Array<{ path: string; change: string }> }).diff
  assert.deepEqual(diff.map((item) => item.path), ['non_goals', 'title'])

  const listed = cli(s.root, ['list', '--json']).json.strategies as Array<{ current: number; revisions: Array<{ revision: number; state: string; effective: string }> }>
  assert.equal(listed[0]!.current, 1)
  assert.deepEqual(listed[0]!.revisions.map((rev) => [rev.revision, rev.state, rev.effective]), [
    [1, 'approved', 'current'],
    [2, 'draft', 'draft'],
  ])
  const shown = cli(s.root, ['show', '--id', 'seo-discovery', '--json'])
  assert.equal((shown.json.revision as { revision: number }).revision, 1, 'show defaults to the approved revision')
  assert.ok(shown.stdout.includes(String(BUDGET_CANARY)), 'the owner sees the restricted block')

  assert.equal(cli(s.root, ['reject', '--id', 'seo-discovery', '--revision', '2', '--json']).status, 0)
  assert.equal(errorCode(cli(s.root, ['approve', '--id', 'seo-discovery', '--revision', '2', '--expect-sha', 'f'.repeat(64), '--json'], { BRAND_OS_APPROVAL_PROOF: s.proof })), 'refused')

  assert.equal(errorCode(cli(s.root, ['withdraw', '--id', 'seo-discovery', '--revision', '1', '--reason', 'Market changed', '--json'])), 'proof')
  const withdrawn = cli(s.root, ['withdraw', '--id', 'seo-discovery', '--revision', '1', '--reason', 'Market changed', '--json'], { BRAND_OS_APPROVAL_PROOF: s.proof })
  assert.equal(withdrawn.status, 0, withdrawn.stdout + withdrawn.stderr)
  assert.equal((cli(s.root, ['list', '--json']).json.strategies as Array<{ current: number | null }>)[0]!.current, null)

  // Usage errors and the agent token.
  assert.equal(cli(s.root, ['propose', '--id', 'seo-discovery']).status, 2)
  assert.equal(cli(s.root, ['frobnicate']).status, 2)
  assert.equal(cli(s.root, ['propose', '--id', 'seo-x', '--file', v1, '--from-seo', v1]).status, 2)
  assert.equal(errorCode(cli(s.root, ['propose', '--id', 'seo-x', '--from-seo', v1, '--json'])), 'invalid_input', 'a proposal file is not an SEO draft')
  const agent = cli(s.root, ['list', '--json'], { BRAND_OS_AGENT_TOKEN: 'bos_agent_anything' })
  assert.equal(agent.status, 1)
  assert.equal(errorCode(agent), 'refused')
})
