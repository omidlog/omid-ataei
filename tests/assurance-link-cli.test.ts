import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { test } from 'node:test'
import { addEvidence, AGENT_TOKEN_ENV, captureNote, openWorkspace } from '@brand-os/brand-core'
import { approved, assertUnchanged, coachBrand, snapshot as treeSnapshot } from './helpers/coach.js'
import { TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

/**
 * `npm run brand:assurance-link` through the real CLI, in temporary SYNTHETIC DEMO brands, with no network
 * and no model. The owner lists notes, links one to a verified register entry, and `brand:assurance assess`
 * then counts it as independent evidence.
 */
useTestKey()

const TODAY = new Date().toISOString().slice(0, 10)
const NOTE_CANARY = 'LINK-CLI-NOTE-CANARY-0f3a'
const REF_CANARY = 'LINK-CLI-REFERENCE-CANARY-6b18'
const SEGMENT = 'business.customer.primary_segment'

function run(script: string, root: string, args: string[], env: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = { ...process.env, BRAND_OS_DATA_KEY: TEST_DATA_KEY }
  delete base[AGENT_TOKEN_ENV]
  const merged = { ...base, ...env }
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key]
  const result = spawnSync(NODE, tsxArgs(path.join('scripts', script), args), { cwd: root, encoding: 'utf8', env: merged as NodeJS.ProcessEnv, input: '' })
  let json: Record<string, unknown> | null = null
  try {
    json = JSON.parse(result.stdout) as Record<string, unknown>
  } catch {
    json = null
  }
  return { status: result.status, json, stdout: result.stdout, stderr: result.stderr }
}

const linkCli = (root: string, args: string[], env: Record<string, string | undefined> = {}) => run('assurance-link.ts', root, args, env)

function setup() {
  const brand = coachBrand({ slug: 'link-cli-demo' })
  approved(brand, SEGMENT, 'SYNTHETIC DEMO segment')
  const note = captureNote(openWorkspace(brand.root), { title: 'SYNTHETIC DEMO research', body: `SYNTHETIC DEMO ${NOTE_CANARY}`, kind: 'research', status: 'active', question_ids: [SEGMENT] })
  const entry = addEvidence(brand.root, brand.engine.questions(), { claim_id: SEGMENT, kind: 'verification', source_type: 'third_party', reference: `SYNTHETIC DEMO report ${REF_CANARY}` })
  assert.equal(brand.engine.approvals().reviewEvidence(entry.id, 'verified', brand.proof).ok, true)
  return { brand, note, entry }
}

test('link cli: help in three languages; usage errors exit 2; an agent is refused; nothing is written', () => {
  const { brand, note, entry } = setup()
  const before = treeSnapshot(brand.root)
  for (const lang of ['en', 'fa', 'tr']) {
    const help = linkCli(brand.root, ['help', '--lang', lang])
    assert.equal(help.status, 0)
    assert.match(help.stdout, /brand:assurance-link/)
  }
  assert.match(linkCli(brand.root, ['help', '--lang', 'fa']).stdout, /گواهی‌نامه/)
  assert.equal(linkCli(brand.root, []).status, 2)
  assert.equal(linkCli(brand.root, ['link', '--note', note.id]).status, 2, 'link needs --evidence')
  assert.equal(linkCli(brand.root, ['unlink']).status, 2)
  assert.equal(linkCli(brand.root, ['list', '--evidence', entry.id]).status, 2)
  const agent = linkCli(brand.root, ['link', '--note', note.id, '--evidence', entry.id], { [AGENT_TOKEN_ENV]: 'bos_agent_not-a-real-token' })
  assert.equal(agent.status, 1)
  assert.match(agent.stderr, /^refused:/)
  assertUnchanged(before, brand.root, 'usage errors and agent refusal')
})

test('link cli: list, link, then brand:assurance assess counts the note as independent; no text is echoed', () => {
  const { brand, note, entry } = setup()
  const listed = linkCli(brand.root, ['list', '--as-of', TODAY, '--json'])
  assert.equal(listed.status, 0, listed.stderr)
  assert.equal((listed.json?.items as Array<{ note_id: string }>)[0]!.note_id, note.id)

  const linked = linkCli(brand.root, ['link', '--note', note.id, '--evidence', entry.id, '--json'])
  assert.equal(linked.status, 0, linked.stderr)
  assert.equal(linked.json?.state, 'qualifies')
  assert.match(linkCli(brand.root, ['list', '--as-of', TODAY, '--lang', 'fa']).stdout, /شاهد مستقل حساب می‌شود/)

  const assessed = run('assurance.ts', brand.root, ['assess', '--as-of', TODAY, '--json'])
  assert.equal(assessed.status, 0, assessed.stderr)
  const snapshot = assessed.json?.snapshot as { evidence_links: Array<{ state: string }>; controls: Array<{ control_id: string; evidence: Array<{ independence: string }> }> }
  assert.equal(snapshot.evidence_links[0]!.state, 'qualifies')
  assert.deepEqual(snapshot.controls.find((control) => control.control_id === 'PRR-03')!.evidence.map((item) => item.independence), ['independent'])

  const unlinked = linkCli(brand.root, ['unlink', '--note', note.id, '--lang', 'tr'])
  assert.equal(unlinked.status, 0, unlinked.stderr)
  const refusal = linkCli(brand.root, ['link', '--note', note.id, '--evidence', 'ev-9999', '--json'])
  assert.equal(refusal.status, 1)
  assert.equal((refusal.json?.error as { code: string }).code, 'not_linkable')

  for (const out of [listed, linked, assessed, unlinked, refusal]) {
    assert.ok(!`${out.stdout}${out.stderr}`.includes(NOTE_CANARY), 'no note text')
    assert.ok(!`${out.stdout}${out.stderr}`.includes(REF_CANARY), 'no register reference')
  }
})
