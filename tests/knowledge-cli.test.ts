import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { ensureApprovalSecret } from '@brand-os/brand-core'
import { brandDir, TEST_DATA_KEY, treeText } from './helpers/knowledge.js'

const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')
const script = path.join(repo, 'scripts/knowledge.ts')

function cli(root: string, args: string[], env: Record<string, string | undefined> = {}, stdin?: string) {
  const base: Record<string, string | undefined> = { ...process.env, BRAND_OS_DATA_KEY: TEST_DATA_KEY, BRAND_OS_KNOWLEDGE_GH: 'off' }
  delete base.BRAND_OS_AGENT_TOKEN
  delete base.BRAND_OS_APPROVAL_PROOF
  const result = spawnSync(tsx, [script, ...args], { cwd: root, encoding: 'utf8', env: { ...base, ...env } as NodeJS.ProcessEnv, input: stdin ?? '' })
  let json: Record<string, unknown> | null = null
  try {
    json = JSON.parse(result.stdout) as Record<string, unknown>
  } catch {
    json = null
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json }
}

test('CLI: capture from stdin, list, show, search, edit with revision, append, archive and restore', () => {
  const root = brandDir()
  const captured = cli(root, ['capture', '--title', 'Pilot rank', '--file', '-', '--lang', 'fa', '--tags', 'mascot,gamification', '--question-ids', 'brand.gamification.streaks', '--json'], {}, 'بعد از ۷ روز پشت‌سرهم رتبه‌ی خلبان بالا برود.\n')
  assert.equal(captured.status, 0, captured.stderr)
  const id = captured.json!.id as string
  const revision = captured.json!.revision as string
  assert.equal(captured.json!.approval_state, 'unapproved_idea')
  assert.equal((cli(root, ['list', '--json']).json!.items as unknown[]).length, 1)
  const shown = cli(root, ['show', '--id', id, '--json']).json!
  assert.equal(shown.revision, revision)
  assert.match(String(shown.body), /رتبه‌ی خلبان/)
  assert.match(cli(root, ['show', '--id', id]).stdout, /NOT AN APPROVED BRAND FACT/)
  const hits = cli(root, ['search', '--query', 'mascot', '--json']).json!.items as Array<{ id: string }>
  assert.deepEqual(hits.map((hit) => hit.id), [id])

  const stale = cli(root, ['edit', '--id', id, '--expected-revision', '0'.repeat(64), '--title', 'x', '--json'])
  assert.equal(stale.status, 1)
  assert.equal((stale.json!.error as { code: string }).code, 'stale_revision')
  const missingRev = cli(root, ['edit', '--id', id, '--title', 'x'])
  assert.equal(missingRev.status, 2, 'no blind overwrite: --expected-revision is required')
  const edited = cli(root, ['edit', '--id', id, '--expected-revision', revision, '--insert-after', 'بالا برود.', '--text', ' (پیشنهاد)', '--add-tag', 'retention', '--json'])
  assert.equal(edited.status, 0, edited.stdout + edited.stderr)
  const appended = cli(root, ['append', '--id', id, '--text', 'Owner: maybe 5 days.', '--idempotency-key', 'k1', '--json'])
  const again = cli(root, ['append', '--id', id, '--text', 'Owner: maybe 5 days.', '--idempotency-key', 'k1', '--json'])
  assert.equal(appended.json!.duplicate, false)
  assert.equal(again.json!.duplicate, true)
  assert.equal(cli(root, ['archive', '--id', id]).status, 0)
  assert.equal((cli(root, ['list', '--json']).json!.items as unknown[]).length, 0)
  assert.equal(cli(root, ['restore', '--id', id]).status, 0)
  assert.equal((cli(root, ['history', '--id', id, '--json']).json!.items as unknown[]).length, 4)
  assert.equal(cli(root, ['doctor']).status, 0)
})

test('CLI: errors carry a code and never echo note text or secrets', () => {
  const root = brandDir()
  const canary = 'ERROR-PATH-CANARY'
  const refused = cli(root, ['capture', '--title', canary, '--text', `api_key=${'z'.repeat(24)} ${canary}`, '--json'])
  assert.equal(refused.status, 1)
  assert.equal((refused.json!.error as { code: string }).code, 'refused')
  assert.ok(!refused.stdout.includes(canary) && !refused.stdout.includes('zzzz'))
  const bad = cli(root, ['show', '--id', '../../etc/passwd'])
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /^invalid_id:/)
  assert.equal(cli(root, ['bogus']).status, 2)
  const notBrand = cli(fs.mkdtempSync(path.join(path.dirname(root), 'empty-')), ['list'])
  assert.match(notBrand.stderr, /not_a_brand/)
})

test('CLI: restricted notes need the data key, the owner proof, and no agent token', () => {
  const root = brandDir()
  const proof = ensureApprovalSecret(root)
  const args = ['capture', '--title', 'Valuation', '--text', 'CLI-RESTRICTED-CANARY', '--classification', 'restricted', '--json']
  assert.equal(cli(root, args).status, 1, 'no proof')
  assert.equal(cli(root, args, { BRAND_OS_APPROVAL_PROOF: 'wrong' }).status, 1)
  assert.equal(cli(root, args, { BRAND_OS_APPROVAL_PROOF: proof, BRAND_OS_AGENT_TOKEN: 'bos_at_anything' }).status, 1, 'agent token present')
  assert.equal(cli(root, args, { BRAND_OS_APPROVAL_PROOF: proof, BRAND_OS_DATA_KEY: '' }).status, 1, 'no key')
  const ok = cli(root, args, { BRAND_OS_APPROVAL_PROOF: proof })
  assert.equal(ok.status, 0, ok.stdout + ok.stderr)
  const id = ok.json!.id as string
  assert.ok(!treeText(path.join(root, 'brand')).includes('CLI-RESTRICTED-CANARY'))
  assert.equal(cli(root, ['show', '--id', id]).status, 1, 'not readable without --scope restricted')
  assert.equal(cli(root, ['show', '--id', id, '--scope', 'restricted']).status, 1, 'not readable without proof')
  const shown = cli(root, ['show', '--id', id, '--scope', 'restricted', '--json'], { BRAND_OS_APPROVAL_PROOF: proof })
  assert.match(String(shown.json!.body), /CLI-RESTRICTED-CANARY/)
  assert.ok(!cli(root, ['search', '--query', 'CLI-RESTRICTED-CANARY']).stdout.includes(id))
  assert.equal(cli(root, ['search', '--query', 'x', '--scope', 'restricted'], { BRAND_OS_APPROVAL_PROOF: proof }).status, 1)
})

test('CLI: share fails closed without a confirmed private remote, then shares the previewed revision', () => {
  const root = brandDir()
  spawnSync('git', ['-C', root, 'init', '-q'])
  const id = cli(root, ['capture', '--title', 'Onboarding tour', '--text', 'A gentle tour.', '--json']).json!.id as string
  const dry = cli(root, ['share', '--id', id, '--dry-run', '--json'])
  assert.equal(dry.status, 1)
  assert.match((dry.json!.blocked as string[]).join(' '), /could not be confirmed private/)
  spawnSync('git', ['-C', root, 'remote', 'add', 'origin', 'git@github.com:acme/pilito.git'])
  assert.equal(cli(root, ['share', '--id', id, '--dry-run', '--confirm-private', 'acme/wrong']).status, 1)
  const preview = cli(root, ['share', '--id', id, '--dry-run', '--confirm-private', 'acme/pilito', '--json'])
  assert.equal(preview.status, 0, preview.stdout)
  assert.equal(fs.existsSync(path.join(root, 'brand/knowledge')), false, 'dry run wrote nothing')
  const shared = cli(root, ['share', '--id', id, '--confirm-private', 'acme/pilito', '--expected-revision', preview.json!.revision as string, '--json'])
  assert.equal(shared.status, 0, shared.stdout)
  const status = spawnSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).stdout
  assert.ok(status.includes(`brand/knowledge/shared/${id}.md`))
  assert.ok(!status.includes('.private'))
})
