import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import {
  addVariant,
  approvePreference,
  buildStudioCreative,
  createProject,
  CreativeError,
  recordFeedback,
  selectVariant,
  shareDecision,
  suggestPreference,
  type SharedDecision,
} from '@brand-os/brand-core/creative'
import { creative, errorCode, ok, pilitoBrand } from './helpers/creative.js'
import { listTree, useTestKey } from './helpers/knowledge.js'

/**
 * Sprint 2 item 3 (core half): the owner explicitly shares a derived summary of an approved decision to
 * brand/creative/shared, and buildStudioCreative reads only well-formed, same-brand, safe files from there.
 */
useTestKey()

const FEEDBACK_CANARY = 'SHARE-FEEDBACK-CANARY زاویه‌ی دوربین خوب است'

function code(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof CreativeError) return error.code
    throw error
  }
  return 'no error'
}

function seeded() {
  const brand = pilitoBrand('pilito')
  const { ws, proof } = brand
  createProject(ws, { project_id: 'pilito-reel-1', title: 'Intro reels', surface: 'reel', series: 'onboarding' })
  for (const v of ['A', 'E']) addVariant(ws, { project_id: 'pilito-reel-1', variant_id: v, asset: 'missing' })
  const e = recordFeedback(ws, { project_id: 'pilito-reel-1', variant_id: 'E', text: FEEDBACK_CANARY, verdict: 'like', keep: ['camera_angle'] })
  selectVariant(ws, { project_id: 'pilito-reel-1', variant_id: 'E' })
  const pref = suggestPreference(ws, { project_id: 'pilito-reel-1', statement: 'Use dynamic camera angles on onboarding reels', sources: [e.note.id], counterexamples: [{ variant_id: 'A' }] })
  return { ...brand, e, pref, approve: (id: string) => approvePreference(ws, { preference_id: id, proof, scope: 'series' }) }
}

const sharedFile = (root: string, id: string) => path.join(root, 'brand/creative/shared', `${id}.json`)

test('only an approved decision can be shared, only by the owner, and dry-run writes nothing', () => {
  const s = seeded()
  assert.equal(code(() => shareDecision(s.ws, { preference_id: s.pref.preference_id, dryRun: false })), 'refused', 'a draft is never shared')
  s.approve(s.pref.preference_id)
  process.env.BRAND_OS_AGENT_TOKEN = 'bos_agent_anything'
  try {
    assert.equal(code(() => shareDecision(s.ws, { preference_id: s.pref.preference_id, dryRun: false })), 'refused')
  } finally {
    delete process.env.BRAND_OS_AGENT_TOKEN
  }
  const before = listTree(s.root)
  const preview = shareDecision(s.ws, { preference_id: s.pref.preference_id, dryRun: true })
  assert.equal(preview.written, false)
  assert.deepEqual(listTree(s.root), before, 'dry run writes nothing')
  const result = shareDecision(s.ws, { preference_id: s.pref.preference_id, dryRun: false })
  assert.equal(result.path, `brand/creative/shared/${s.pref.preference_id}.json`)
  const doc = JSON.parse(fs.readFileSync(sharedFile(s.root, s.pref.preference_id), 'utf8')) as SharedDecision
  assert.equal(doc.state, 'approved')
  assert.equal(doc.scope.level, 'series')
  assert.deepEqual(doc.sources, [`knowledge:${s.e.note.id}@${s.e.note.revision}`])
  assert.deepEqual(doc.counterexamples, [{ project_id: 'pilito-reel-1', variant_id: 'A' }])
  const raw = fs.readFileSync(sharedFile(s.root, s.pref.preference_id), 'utf8')
  assert.ok(!raw.includes('SHARE-FEEDBACK-CANARY'), 'no note text is shared')
  assert.ok(!raw.includes('.private'), 'no local path is shared')
  // Unlike creative records, the shared file is meant for Git (the owner commits it).
  const git = (args: string[]) => spawnSync('git', args, { cwd: s.root, encoding: 'utf8' })
  assert.equal(git(['init', '-q']).status, 0)
  assert.notEqual(git(['check-ignore', '-q', `brand/creative/shared/${s.pref.preference_id}.json`]).status, 0)
  assert.equal(git(['check-ignore', '-q', `brand/.private/creative/preferences/${s.pref.preference_id}.json`]).status, 0)
})

test('a tampered approval is not shared; sharing a superseding decision refreshes the shared old one', () => {
  const s = seeded()
  s.approve(s.pref.preference_id)
  shareDecision(s.ws, { preference_id: s.pref.preference_id, dryRun: false })
  const next = suggestPreference(s.ws, { project_id: 'pilito-reel-1', statement: 'Use a steady camera on onboarding reels', sources: [s.e.note.id], supersedes: s.pref.preference_id })
  s.approve(next.preference_id)
  const result = shareDecision(s.ws, { preference_id: next.preference_id, dryRun: false })
  assert.deepEqual(result.refreshed, [`brand/creative/shared/${s.pref.preference_id}.json`])
  const old = JSON.parse(fs.readFileSync(sharedFile(s.root, s.pref.preference_id), 'utf8')) as SharedDecision
  assert.equal(old.state, 'superseded')
  assert.equal(old.superseded_by, next.preference_id)
  // Hand-edited after approval: the digest no longer matches.
  const file = path.join(s.root, 'brand/.private/creative/preferences', `${next.preference_id}.json`)
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('steady camera', 'shaky camera'))
  assert.equal(code(() => shareDecision(s.ws, { preference_id: next.preference_id, dryRun: false })), 'refused')
})

test('buildStudioCreative keeps only valid, same-brand, safe decisions and withholds the rest by reason', () => {
  const s = seeded()
  s.approve(s.pref.preference_id)
  shareDecision(s.ws, { preference_id: s.pref.preference_id, dryRun: false })
  const dir = path.join(s.root, 'brand/creative/shared')
  const good = JSON.parse(fs.readFileSync(sharedFile(s.root, s.pref.preference_id), 'utf8')) as SharedDecision & Record<string, unknown>
  const id = (n: number) => `cp_00000000-0000-4000-8000-00000000000${n}`
  const put = (name: string, value: unknown) => fs.writeFileSync(path.join(dir, name), typeof value === 'string' ? value : JSON.stringify(value))
  // An extra field survives in the file but never reaches the projection.
  put(`${s.pref.preference_id}.json`, { ...good, quote: 'EXTRA-FIELD-CANARY' })
  put(`${id(1)}.json`, { ...good, decision_id: id(1), brand_slug: 'other-brand', statement: 'OTHER-BRAND-CANARY' })
  put(`${id(2)}.json`, { ...good, decision_id: id(3) })
  put(`${id(4)}.json`, { ...good, decision_id: id(4), statement: `token ghp_${'A1b2C3d4E5'.repeat(4)}` })
  put(`${id(5)}.json`, { ...good, decision_id: id(5), state: 'draft', statement: 'DRAFT-CANARY' })
  put(`${id(6)}.json`, '{not json')
  put('README.md', 'README-CANARY')
  fs.symlinkSync('/etc/passwd', path.join(dir, `${id(7)}.json`))
  const before = listTree(s.root)
  const c = buildStudioCreative(s.root, 'pilito')
  assert.deepEqual(listTree(s.root), before, 'building the projection writes nothing')
  assert.deepEqual(c.items.map((item) => item.decision_id), [s.pref.preference_id])
  assert.equal(c.total, 1)
  const reasons = Object.fromEntries(c.withheld.map((item) => [path.basename(item.path), item.reason]))
  assert.deepEqual(reasons, {
    [`${id(1)}.json`]: 'wrong_brand',
    [`${id(2)}.json`]: 'filename_mismatch',
    [`${id(4)}.json`]: 'unsafe_text',
    [`${id(5)}.json`]: 'invalid_record',
    [`${id(6)}.json`]: 'unreadable',
    [`${id(7)}.json`]: 'symlink',
    'README.md': 'unexpected_file',
  })
  const json = JSON.stringify(c)
  for (const canary of ['EXTRA-FIELD-CANARY', 'OTHER-BRAND-CANARY', 'ghp_', 'DRAFT-CANARY', 'README-CANARY', 'root:']) assert.ok(!json.includes(canary), canary)
  // No folder: an empty, clean state.
  fs.rmSync(dir, { recursive: true })
  assert.deepEqual(buildStudioCreative(s.root, 'pilito'), { items: [], withheld: [], total: 0 })
})

test('CLI: share --dry-run previews, share writes, a draft is refused', () => {
  const s = seeded()
  assert.equal(errorCode(creative(s.root, ['share', '--id', s.pref.preference_id, '--json'])), 'refused')
  s.approve(s.pref.preference_id)
  const preview = ok(creative(s.root, ['share', '--id', s.pref.preference_id, '--dry-run', '--json']))
  assert.equal(preview.written, false)
  assert.equal(fs.existsSync(sharedFile(s.root, s.pref.preference_id)), false)
  const text = creative(s.root, ['share', '--id', s.pref.preference_id])
  assert.equal(text.status, 0, text.stderr)
  assert.match(text.stdout, /Nothing was committed/)
  assert.ok(fs.existsSync(sharedFile(s.root, s.pref.preference_id)))
  assert.equal(errorCode(creative(s.root, ['share', '--id', s.pref.preference_id, '--json'], { BRAND_OS_AGENT_TOKEN: 'bos_agent_x' })), 'refused')
})
