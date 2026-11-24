import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { agentTokenContext, archiveNote, brandRetrieve, captureNote, editNote, guestContext, openWorkspace, runKnowledgeTool, searchBrandDocs } from '@brand-os/brand-core'
import {
  addVariant,
  approvePreference,
  createProject,
  CreativeError,
  creativeContext,
  listProjects,
  readPreference,
  readProject,
  recordFeedback,
  selectVariant,
  suggestPreference,
} from '@brand-os/brand-core/creative'
import { addManifestRows, creative, errorCode, pilitoBrand } from './helpers/creative.js'
import { useTestKey } from './helpers/knowledge.js'

useTestKey()

const SECRET_FEEDBACK = 'CREATIVE-FEEDBACK-CANARY زاویه‌ی دوربین'

function code(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof CreativeError) return error.code
    throw error
  }
  return 'no error'
}

/** A project with A–C, feedback on B (rejected) and C (liked camera), C selected. */
function seeded(slug = 'pilito') {
  const brand = pilitoBrand(slug)
  const { ws } = brand
  createProject(ws, { project_id: 'pilito-reel-1', title: 'Intro reels', surface: 'reel', series: 'onboarding', language: 'fa' })
  for (const v of ['A', 'B', 'C']) addVariant(ws, { project_id: 'pilito-reel-1', variant_id: v, asset: 'missing' })
  const b = recordFeedback(ws, { project_id: 'pilito-reel-1', variant_id: 'B', text: 'خیلی بچگانه است.', verdict: 'reject', avoid: ['tone'] })
  const c = recordFeedback(ws, { project_id: 'pilito-reel-1', variant_id: 'C', text: SECRET_FEEDBACK, verdict: 'like', keep: ['camera_angle'] })
  selectVariant(ws, { project_id: 'pilito-reel-1', variant_id: 'C' })
  return { ...brand, b, c }
}

test('cross-brand: another brand cannot read the project, its preferences or its feedback notes', () => {
  const a = seeded('pilito')
  const pref = suggestPreference(a.ws, { project_id: 'pilito-reel-1', statement: 'Dynamic camera on onboarding reels', sources: [a.c.note.id] })
  const other = pilitoBrand('other-brand')
  // Copy the private records and the note files into the other brand's checkout, as a misplaced sync would.
  for (const rel of ['brand/.private/creative', 'brand/.private/knowledge/local']) {
    fs.cpSync(path.join(a.root, rel), path.join(other.root, rel), { recursive: true })
  }
  assert.equal(code(() => readProject(other.ws, 'pilito-reel-1')), 'wrong_brand')
  assert.equal(code(() => readPreference(other.ws, pref.preference_id)), 'wrong_brand')
  assert.deepEqual(listProjects(other.ws), [], 'another brand’s records are skipped, never partly read')
  const ctx = creativeContext(other.ws, other.engine, { surface: 'reel', series: 'onboarding' })
  assert.deepEqual(ctx.references, [])
  assert.deepEqual([...ctx.preferences.applied, ...ctx.preferences.not_applied], [])
  assert.ok(!JSON.stringify(ctx).includes('CREATIVE-FEEDBACK-CANARY'))
  // The other brand cannot link pilito's note either: the Knowledge store excludes wrong-brand notes.
  createProject(other.ws, { project_id: 'other-reel', title: 'x', surface: 'reel', series: 'onboarding' })
  addVariant(other.ws, { project_id: 'other-reel', variant_id: 'A', asset: 'missing' })
  assert.notEqual(code(() => recordFeedback(other.ws, { project_id: 'other-reel', variant_id: 'A', note_id: a.c.note.id })), 'no error')
  // A creative context with an engine from a different brand is refused.
  assert.equal(code(() => creativeContext(a.ws, other.engine, { surface: 'reel', series: 'onboarding' })), 'wrong_brand')
})

test('agents: creative memory refuses any agent token; knowledge-read MCP tools and guests never see local feedback', () => {
  const { root, engine, c } = seeded()
  const token = { BRAND_OS_AGENT_TOKEN: 'bos_agent_anything' }
  for (const args of [['context', '--project', 'pilito-reel-1'], ['list'], ['show', '--project', 'pilito-reel-1'], ['feedback', '--project', 'pilito-reel-1', '--variant', 'A', '--text', 'x']]) {
    const result = creative(root, [...args, '--json'], token)
    assert.equal(errorCode(result), 'refused', args.join(' '))
    assert.ok(!result.stdout.includes('CREATIVE-FEEDBACK-CANARY'))
  }
  process.env.BRAND_OS_AGENT_TOKEN = 'bos_agent_anything'
  try {
    assert.throws(() => readProject(openWorkspace(root), 'pilito-reel-1'), (e: unknown) => e instanceof CreativeError && e.code === 'refused')
  } finally {
    delete process.env.BRAND_OS_AGENT_TOKEN
  }
  // The read-only knowledge MCP profile reads shared notes only; the feedback note is local.
  const reader = agentTokenContext('pilito', 'tok', 'knowledge-read')
  const read = runKnowledgeTool(engine, reader, 'knowledge_read', { id: c.note.id })
  assert.notEqual(read.status, 'ok')
  const search = runKnowledgeTool(engine, reader, 'knowledge_search', { query: 'CREATIVE-FEEDBACK-CANARY' })
  assert.deepEqual((search.data as { notes: unknown[] }).notes, [], 'local feedback notes are not served (the query itself is echoed, not note text)')
  // Guests (public MCP / docs) and the design agent see approved facts only, nothing creative.
  for (const ctx of [guestContext('pilito'), agentTokenContext('pilito', 'tok', 'design')]) {
    assert.ok(!JSON.stringify(searchBrandDocs(engine, 'camera', ctx)).includes('CREATIVE-FEEDBACK-CANARY'))
    assert.ok(!JSON.stringify(brandRetrieve(engine, ctx, { kind: 'facts' })).includes('CREATIVE-FEEDBACK-CANARY'))
  }
})

test('local only: creative records and feedback notes are gitignored, owner-only and absent from Git-visible files (Studio exclusion: tests/studio-creative.test.ts)', () => {
  const { root, c } = seeded()
  const files = [`brand/.private/creative/projects/pilito-reel-1.json`, c.note.path]
  for (const rel of files) {
    assert.ok(fs.existsSync(path.join(root, rel)), rel)
    assert.equal((fs.statSync(path.join(root, rel)).mode & 0o077), 0, `${rel} is owner-only`)
  }
  const git = (args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(git(['init', '-q']).status, 0)
  for (const rel of files) assert.equal(git(['check-ignore', '-q', rel]).status, 0, `${rel} is gitignored`)
  git(['add', '-A'])
  const staged = git(['diff', '--cached', '--name-only']).stdout
  assert.ok(!staged.includes('.private'), 'nothing private is staged by git add -A')
  const stagedText = git(['grep', '--cached', '-l', 'CREATIVE-FEEDBACK-CANARY'])
  assert.equal(stagedText.stdout.trim(), '', 'the feedback text is in no Git-visible file')
})

test('restricted and third-party notes: never feedback, never preference sources', () => {
  const { ws } = seeded()
  const restricted = captureNote(ws, { title: 'Budget', body: 'RESTRICTED-CANARY', classification: 'restricted' })
  assert.equal(code(() => recordFeedback(ws, { project_id: 'pilito-reel-1', variant_id: 'A', note_id: restricted.id })), 'not_found', 'restricted notes are invisible to linking')
  assert.notEqual(code(() => suggestPreference(ws, { project_id: 'pilito-reel-1', statement: 'x', sources: [restricted.id] })), 'no error')
  assert.equal(code(() => createProject(ws, { project_id: 'pilito-reel-9', title: 'x', surface: 'reel', series: 'onboarding', inspirations: [{ note_id: restricted.id }] })), 'not_found')
  const research = captureNote(ws, { title: 'Competitor', body: 'Their reel uses drones.', source: { kind: 'research' } })
  assert.equal(code(() => recordFeedback(ws, { project_id: 'pilito-reel-1', variant_id: 'A', note_id: research.id })), 'refused')
  assert.equal(code(() => suggestPreference(ws, { project_id: 'pilito-reel-1', statement: 'Use drones', sources: [research.id] })), 'refused')
  const owner = captureNote(ws, { title: 'Mine', body: 'I like it.', source: { kind: 'owner_note' } })
  assert.equal(code(() => recordFeedback(ws, { project_id: 'pilito-reel-1', variant_id: 'A', note_id: owner.id, source_kind: 'meeting' })), 'invalid_input', 'the note’s own source kind cannot be relabelled')
  assert.equal(code(() => suggestPreference(ws, { project_id: 'pilito-reel-1', statement: `api_key=${'z'.repeat(24)}`, sources: [owner.id] })), 'refused', 'credential-like text is refused')
  assert.equal(code(() => suggestPreference(ws, { project_id: 'pilito-reel-1', statement: 'x'.repeat(201), sources: [owner.id] })), 'invalid_input', 'statements stay short; the words live in the note')
})

test('stale and archived sources: approval refused; an approved preference stops applying; tampering voids approval', () => {
  const { ws, engine, proof, c, b } = seeded()
  const pref = suggestPreference(ws, { project_id: 'pilito-reel-1', statement: 'Dynamic camera', sources: [c.note.id] })
  editNote(ws, c.note.id, { expectedRevision: c.note.revision, ops: [{ op: 'set', title: 'Edited' }] })
  assert.equal(code(() => approvePreference(ws, { preference_id: pref.preference_id, proof })), 'stale_source')
  assert.equal(readPreference(ws, pref.preference_id).state, 'draft')

  const owner = captureNote(ws, { title: 'Camera', body: 'Dynamic camera, please.', source: { kind: 'owner_note' } })
  const good = suggestPreference(ws, { project_id: 'pilito-reel-1', statement: 'Dynamic camera', sources: [owner.id] })
  approvePreference(ws, { preference_id: good.preference_id, proof })
  assert.deepEqual(creativeContext(ws, engine, { project_id: 'pilito-reel-1' }).preferences.applied.map((p) => p.preference_id), [good.preference_id])
  editNote(ws, owner.id, { expectedRevision: owner.revision, ops: [{ op: 'set', title: 'Changed' }] })
  let ctx = creativeContext(ws, engine, { project_id: 'pilito-reel-1' })
  assert.equal(ctx.preferences.applied.length, 0)
  assert.equal(ctx.preferences.not_applied.find((p) => p.preference_id === good.preference_id)?.state, 'needs_review')

  // Hand-editing an approved record (statement widened) voids the approval digest.
  const owner2 = captureNote(ws, { title: 'Light', body: 'Warm light.', source: { kind: 'owner_note' } })
  const light = suggestPreference(ws, { project_id: 'pilito-reel-1', statement: 'Warm light', sources: [owner2.id] })
  approvePreference(ws, { preference_id: light.preference_id, proof })
  const file = path.join(ws.root, 'brand/.private/creative/preferences', `${light.preference_id}.json`)
  const record = JSON.parse(fs.readFileSync(file, 'utf8')) as { statement: string }
  record.statement = 'Warm light on every brand asset'
  fs.writeFileSync(file, JSON.stringify(record))
  ctx = creativeContext(ws, engine, { project_id: 'pilito-reel-1' })
  assert.equal(ctx.preferences.not_applied.find((p) => p.preference_id === light.preference_id)?.state, 'invalid_approval')

  // An archived feedback note: the reason stays cited but its text is no longer quoted.
  archiveNote(ws, b.note.id)
  const reason = creativeContext(ws, engine, { project_id: 'pilito-reel-1' }).references.find((r) => r.variant_id === 'B')!.reasons[0]!
  assert.equal(reason.source_state, 'archived')
  assert.equal(reason.quote, null)
})

test('no auto-approval and no silent promotion: drafts stay drafts, brand scope is refused, supersession needs an approved target', () => {
  const { ws, proof, c } = seeded()
  const pref = suggestPreference(ws, { project_id: 'pilito-reel-1', statement: 'Dynamic camera', sources: [c.note.id] })
  assert.equal(pref.state, 'draft')
  assert.deepEqual(pref.scope, { level: 'project', project_id: 'pilito-reel-1' })
  assert.equal(pref.approval, null)
  assert.equal(code(() => approvePreference(ws, { preference_id: pref.preference_id, proof: undefined })), 'proof')
  assert.equal(code(() => approvePreference(ws, { preference_id: pref.preference_id, proof, scope: 'brand' })), 'refused')
  assert.equal(code(() => approvePreference(ws, { preference_id: pref.preference_id, proof, scope: 'global' })), 'invalid_input')
  assert.equal(code(() => suggestPreference(ws, { project_id: 'pilito-reel-1', statement: 'y', sources: [c.note.id], supersedes: pref.preference_id })), 'refused', 'only an approved preference can be superseded')
  approvePreference(ws, { preference_id: pref.preference_id, proof })
  assert.equal(code(() => approvePreference(ws, { preference_id: pref.preference_id, proof })), 'refused', 'approval is not repeated')
})

test('assets: paths, URLs and unknown ids refused; manifest changes are reported, never silently trusted', () => {
  const { root, ws, engine } = seeded()
  addManifestRows(root, [{ id: 'reel.d', name: 'D', present: true, checksum_sha256: 'a'.repeat(64) }])
  for (const bad of ['../x.png', '/etc/passwd', 'https://cdn.example/x.png', 'C:\\x.png', 'not-in-manifest']) {
    assert.equal(code(() => addVariant(ws, { project_id: 'pilito-reel-1', variant_id: 'D', asset: bad })), 'invalid_input', bad)
  }
  addVariant(ws, { project_id: 'pilito-reel-1', variant_id: 'D', asset: 'reel.d' })
  recordFeedback(ws, { project_id: 'pilito-reel-1', variant_id: 'D', text: 'Good pacing.', verdict: 'observation', keep: ['pacing'] })
  const asset = () => creativeContext(ws, engine, { project_id: 'pilito-reel-1' }).references.find((r) => r.variant_id === 'D')!.asset
  assert.equal(asset().state, 'manifest')
  const file = path.join(root, 'brand/assets/asset-manifest.yaml')
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('a'.repeat(64), 'b'.repeat(64)))
  assert.equal(asset().state, 'changed')
  assert.equal(creativeContext(ws, engine, { project_id: 'pilito-reel-1' }).references.find((r) => r.variant_id === 'B')!.asset.state, 'missing')
})

test('selection authorizes nothing: no publish, post or ad command exists and context says so', () => {
  const { root, ws, engine } = seeded()
  for (const cmd of ['publish', 'post', 'ads', 'promote']) assert.equal(creative(root, [cmd]).status, 2, cmd)
  const ctx = creativeContext(ws, engine, { project_id: 'pilito-reel-1' })
  assert.deepEqual(ctx.authorizes, [])
  assert.equal(ctx.performance, 'not_measured')
  assert.equal(readProject(ws, 'pilito-reel-1').selection?.meaning, 'owner_selected_for_this_project')
})
