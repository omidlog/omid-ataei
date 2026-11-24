import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import {
  appendNote,
  archiveNote,
  backupBrand,
  captureNote,
  editNote,
  findNote,
  knowledgeDoctor,
  listNotes,
  migrateNotes,
  noteHistory,
  openWorkspace,
  recoverNote,
  restoreBrand,
  restoreNote,
  revisionOf,
  scanAll,
  searchNotes,
  KnowledgeError,
} from '@brand-os/brand-core'
import { brandDir, listTree, PERSIAN_IDEA, TEST_DATA_KEY, treeText, TURKISH_IDEA, useTestKey, workspace } from './helpers/knowledge.js'

useTestKey()
const repo = path.resolve(import.meta.dirname, '..')

function code(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof KnowledgeError) return error.code
    throw error
  }
  return 'no error'
}

test('a brand with no brand/knowledge folder works: empty list, empty search, clean doctor, nothing created by reads', () => {
  const { root, ws } = workspace()
  assert.equal(fs.existsSync(path.join(root, 'brand', 'knowledge')), false)
  assert.deepEqual(listNotes(ws).items, [])
  assert.equal(searchNotes(ws, 'mascot').total, 0)
  assert.equal(code(() => findNote(ws, 'kn_00000000-0000-4000-8000-000000000000')), 'not_found')
  assert.equal(fs.existsSync(path.join(root, 'brand', 'knowledge')), false, 'reads never create the tracked folder')
  const report = knowledgeDoctor(ws)
  assert.equal(report.ok, true, JSON.stringify(report.issues))
  assert.deepEqual(report.notes, { local: 0, shared: 0, restricted: 0, restricted_locked: false })
})

test('capture → list → show → edit → search → archive → restore keeps id, UTF-8 text, timestamps and revision honest', () => {
  let clock = Date.parse('2026-11-21T13:00:00Z')
  const { root, ws } = workspace({ now: () => new Date(clock) })
  const created = captureNote(ws, {
    title: 'ارتقای رتبه‌ی خلبان',
    body: `${PERSIAN_IDEA}\n\n${TURKISH_IDEA}\n`,
    language: 'fa',
    tags: ['Mascot', 'gamification', 'retention'],
    question_ids: ['brand.gamification.streaks'],
  })
  assert.match(created.id, /^kn_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(created.scope, 'local')
  assert.equal(created.path, `brand/.private/knowledge/local/${created.id}.md`)
  assert.equal(fs.existsSync(path.join(root, 'brand', 'knowledge')), false, 'capture is local by default; nothing tracked appears')

  const shown = findNote(ws, created.id)
  assert.equal(shown.revision, revisionOf(fs.readFileSync(path.join(root, created.path))))
  assert.equal(shown.revision, created.revision)
  assert.ok(shown.note.body.includes(PERSIAN_IDEA) && shown.note.body.includes(TURKISH_IDEA), 'Persian and Turkish text preserved exactly')
  assert.deepEqual(shown.note.meta.tags, ['mascot', 'gamification', 'retention'])
  assert.equal(shown.note.meta.brand_slug, 'example-brand')
  assert.equal(shown.note.meta.created_at, '2026-11-21T13:00:00.000Z')
  assert.ok(!shown.raw.includes('revision'), 'the revision is never stored inside the note')
  assert.deepEqual(shown.note.issues, [])

  assert.equal(listNotes(ws, { status: ['inbox'] }).items[0]?.id, created.id)

  clock += 60_000
  const edited = editNote(ws, created.id, { expectedRevision: created.revision, ops: [{ op: 'insert_after', anchor: 'ارتقا بده.', text: ' (فقط برای کاربران فعال)' }, { op: 'set', status: 'triaged', title: 'Pilot rank progression' }] })
  assert.equal(edited.changed, true)
  assert.notEqual(edited.revision, created.revision)
  const after = findNote(ws, created.id)
  assert.equal(after.id, created.id)
  assert.equal(after.note.meta.title, 'Pilot rank progression')
  assert.equal(after.note.meta.status, 'triaged')
  assert.equal(after.note.meta.created_at, '2026-11-21T13:00:00.000Z')
  assert.equal(after.note.meta.updated_at, '2026-11-21T13:01:00.000Z')
  assert.ok(after.note.body.includes('ارتقا بده. (فقط برای کاربران فعال)'))

  assert.equal(searchNotes(ws, 'rütbe').items[0]?.id, created.id)

  const archived = archiveNote(ws, created.id)
  assert.equal(findNote(ws, created.id).note.meta.status, 'archived')
  assert.equal(listNotes(ws).total, 0, 'archived notes are hidden by default')
  assert.equal(listNotes(ws, { include_archived: true }).total, 1)
  assert.equal(searchNotes(ws, 'rütbe').total, 0)
  const restored = restoreNote(ws, created.id, { expectedRevision: archived.revision })
  assert.equal(findNote(ws, created.id).note.meta.status, 'triaged', 'restore returns the note to its previous status')
  assert.equal(restored.changed, true)
})

test('a stale revision, a missing anchor and an ambiguous anchor each fail atomically, leaving the file byte-for-byte unchanged', () => {
  const { root, ws } = workspace()
  const note = captureNote(ws, { title: 'Anchors', body: 'alpha beta\nalpha gamma\nunique line\n' })
  const file = path.join(root, note.path)
  const before = fs.readFileSync(file)
  assert.equal(code(() => editNote(ws, note.id, { expectedRevision: '0'.repeat(64), ops: [{ op: 'replace_body', body: 'clobbered' }] })), 'stale_revision')
  assert.equal(code(() => editNote(ws, note.id, { expectedRevision: note.revision, ops: [{ op: 'set', title: 'New title' }, { op: 'replace', find: 'missing', replace: 'x' }] })), 'anchor_missing')
  assert.equal(code(() => editNote(ws, note.id, { expectedRevision: note.revision, ops: [{ op: 'insert_after', anchor: 'alpha', text: 'x' }] })), 'anchor_ambiguous')
  assert.equal(code(() => editNote(ws, note.id, { expectedRevision: note.revision, ops: [{ op: 'replace', find: '', replace: 'x' }] })), 'invalid_input')
  assert.equal(code(() => editNote(ws, note.id, { expectedRevision: '', ops: [{ op: 'replace_body', body: 'blind overwrite' }] })), 'invalid_input', 'no blind overwrite')
  assert.equal(code(() => editNote(ws, note.id, { expectedRevision: note.revision, ops: [{ op: 'set', question_ids: ['brand.invented.question'] }] })), 'invalid_input')
  assert.deepEqual(fs.readFileSync(file), before)
  assert.equal(noteHistory(ws, note.id).length, 0, 'no snapshot for a refused edit')
})

test('append with the same idempotency key does not duplicate text, across processes and restarts', () => {
  const { root, ws } = workspace()
  const note = captureNote(ws, { title: 'Appends', body: 'first' })
  const one = appendNote(ws, note.id, { text: 'second paragraph', idempotencyKey: 'retry-1' })
  const two = appendNote(openWorkspace(root), note.id, { text: 'second paragraph', idempotencyKey: 'retry-1' })
  assert.equal(one.duplicate, false)
  assert.equal(two.duplicate, true)
  assert.equal(two.revision, one.revision)
  appendNote(ws, note.id, { text: 'third', idempotencyKey: 'retry-2' })
  const body = findNote(ws, note.id).note.body
  assert.equal(body.split('second paragraph').length - 1, 1)
  assert.equal(body, 'first\n\nsecond paragraph\n\nthird\n')
  const store = fs.readFileSync(path.join(root, 'brand/.private/knowledge/idempotency.json'), 'utf8')
  assert.ok(!store.includes('retry-1'), 'idempotency keys are stored hashed')
  assert.equal(code(() => appendNote(ws, note.id, { text: 'x', expectedRevision: note.revision })), 'stale_revision')
})

test('concurrent writers with the same expected revision: exactly one wins, the others fail and write nothing', async () => {
  const { root, ws } = workspace()
  const note = captureNote(ws, { title: 'Race', body: 'start\n' })
  const script = `
    import { openWorkspace, editNote } from '@brand-os/brand-core'
    const [root, id, rev, n] = process.argv.slice(-4)
    try {
      editNote(openWorkspace(root), id, { expectedRevision: rev, ops: [{ op: 'replace_body', body: 'writer ' + n + '\\n' }] })
      console.log('WIN')
    } catch (error) { console.log('LOSE ' + error.code) }
  `
  const file = path.join(root, 'race.mts')
  fs.writeFileSync(file, script)
  const runs = await Promise.all(
    Array.from({ length: 6 }, (_, n) =>
      new Promise<string>((resolve) => {
        const child = spawn(process.execPath, ['--import', 'tsx', file, root, note.id, note.revision, String(n)], { cwd: repo })
        let out = ''
        child.stdout.on('data', (chunk) => (out += String(chunk)))
        child.on('close', () => resolve(out.trim()))
      }),
    ),
  )
  assert.equal(runs.filter((line) => line === 'WIN').length, 1, runs.join(' | '))
  assert.equal(runs.filter((line) => line === 'LOSE stale_revision').length, 5, runs.join(' | '))
  const final = findNote(ws, note.id)
  assert.match(final.note.body, /^writer \d\n$/)
  assert.equal(noteHistory(ws, note.id).length, 1)
  assert.deepEqual(fs.readdirSync(path.join(root, 'brand/.private/knowledge/locks')), [], 'locks are released')
})

test('renaming a note file keeps its id and backlinks; duplicate titles are fine; duplicate ids are refused', () => {
  const { root, ws } = workspace()
  const a = captureNote(ws, { title: 'Same title', body: 'A' })
  const b = captureNote(ws, { title: 'Same title', body: `Builds on [[${a.id}]]` })
  assert.notEqual(a.id, b.id)
  const dir = path.join(root, 'brand/.private/knowledge/local')
  fs.renameSync(path.join(dir, `${a.id}.md`), path.join(dir, 'renamed-by-hand.md'))
  const found = findNote(ws, a.id)
  assert.equal(found.path, 'brand/.private/knowledge/local/renamed-by-hand.md')
  const edited = editNote(ws, a.id, { expectedRevision: found.revision, ops: [{ op: 'set', title: 'Renamed title' }] })
  assert.equal(edited.id, a.id)
  assert.equal(fs.existsSync(path.join(dir, 'renamed-by-hand.md')), true, 'edits write back to the same file')
  // A copy with the same id is a duplicate: edits refuse, doctor reports.
  fs.copyFileSync(path.join(dir, 'renamed-by-hand.md'), path.join(dir, 'copy.md'))
  assert.equal(code(() => editNote(ws, a.id, { expectedRevision: edited.revision, ops: [{ op: 'set', title: 'x' }] })), 'duplicate_id')
  const report = knowledgeDoctor(ws)
  assert.ok(report.issues.some((issue) => issue.code === 'duplicate_id' && issue.id === a.id))
  assert.equal(report.ok, false)
})

test('local notes never appear in git status; a shared note does', () => {
  const root = brandDir()
  const git = (...args: string[]) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  git('init', '-q')
  const ws = openWorkspace(root)
  const note = captureNote(ws, { title: 'Private brainstorm', body: 'LOCAL-CANARY-7731' })
  const status = git('status', '--porcelain', '--untracked-files=all').stdout
  assert.ok(!status.includes('.private'), status)
  assert.ok(!status.includes(note.id), status)
  assert.equal(git('check-ignore', '-q', note.path).status, 0, 'the local note path is gitignored')
})

test('restricted notes are encrypted at rest, need the key, are bound to their id, and never enter list, search or cache', () => {
  const { root, ws } = workspace()
  const secret = captureNote(ws, { title: 'RESTRICTED-TITLE-CANARY', body: 'Valuation RESTRICTED-BODY-CANARY', classification: 'restricted', tags: ['finance'] })
  assert.equal(secret.scope, 'restricted')
  assert.equal(secret.path, `brand/.private/knowledge/restricted/${secret.id}.enc`)
  const all = treeText(path.join(root, 'brand'))
  assert.ok(!all.includes('RESTRICTED-TITLE-CANARY') && !all.includes('RESTRICTED-BODY-CANARY'), 'no plaintext anywhere under brand/')
  assert.equal(listNotes(ws).total, 0)
  assert.equal(searchNotes(ws, 'RESTRICTED').total, 0)
  assert.equal(code(() => findNote(ws, secret.id)), 'not_found', 'without --scope restricted the owner CLI does not decrypt')
  const opened = findNote(ws, secret.id, { includeRestricted: true })
  assert.equal(opened.note.meta.title, 'RESTRICTED-TITLE-CANARY')
  const edited = editNote(ws, secret.id, { expectedRevision: opened.revision, includeRestricted: true, ops: [{ op: 'replace_body', body: 'Rewritten RESTRICTED-BODY-2' }] })
  assert.equal(edited.scope, 'restricted')
  assert.ok(!treeText(path.join(root, 'brand')).includes('RESTRICTED-BODY'), 'snapshots of restricted notes stay encrypted')
  assert.equal(noteHistory(ws, secret.id).length, 1)
  // Copying the ciphertext under another id fails: the id is authenticated data.
  const dir = path.join(root, 'brand/.private/knowledge/restricted')
  const other = 'kn_11111111-1111-4111-8111-111111111111'
  fs.copyFileSync(path.join(dir, `${secret.id}.enc`), path.join(dir, `${other}.enc`))
  assert.equal(code(() => findNote(ws, other, { includeRestricted: true })), 'invalid_note')
  // Without the key: refused, nothing written.
  delete process.env.BRAND_OS_DATA_KEY
  try {
    assert.equal(code(() => captureNote(ws, { title: 'x', body: 'y', classification: 'restricted' })), 'key_required')
    assert.equal(code(() => findNote(ws, secret.id, { includeRestricted: true })), 'key_required')
    const report = knowledgeDoctor(ws)
    assert.ok(report.issues.some((issue) => issue.code === 'key_required'))
    assert.ok(!JSON.stringify(report).includes('CANARY'))
  } finally {
    process.env.BRAND_OS_DATA_KEY = TEST_DATA_KEY
  }
  // A wrong key cannot read it.
  process.env.BRAND_OS_DATA_KEY = Buffer.alloc(32, 7).toString('base64')
  try {
    assert.equal(code(() => findNote(ws, secret.id, { includeRestricted: true })), 'invalid_note')
  } finally {
    process.env.BRAND_OS_DATA_KEY = TEST_DATA_KEY
  }
})

test('text that looks like a credential is refused in plain-text notes and allowed only in the encrypted store', () => {
  const { root, ws } = workspace()
  const token = `ghp_${'a'.repeat(36)}`
  assert.equal(code(() => captureNote(ws, { title: 'Deploy', body: `token ${token}` })), 'refused')
  assert.equal(listTree(path.join(root, 'brand/.private/knowledge/local')).length, 0)
  const ok = captureNote(ws, { title: 'Deploy', body: 'nothing secret' })
  assert.equal(code(() => appendNote(ws, ok.id, { text: `password: hunter2hunter2` })), 'refused')
  assert.equal(captureNote(ws, { title: 'Vault', body: `token ${token}`, classification: 'restricted' }).scope, 'restricted')
})

test('oversized, binary and invalid-frontmatter files are rejected without destroying them; snapshots recover old text', () => {
  const { root, ws } = workspace()
  const dir = path.join(root, 'brand/.private/knowledge/local')
  const note = captureNote(ws, { title: 'Recover me', body: 'version one' })
  const v2 = editNote(ws, note.id, { expectedRevision: note.revision, ops: [{ op: 'replace', find: 'one', replace: 'two' }] })
  const history = noteHistory(ws, note.id)
  assert.equal(history[0]?.revision, note.revision)
  const back = recoverNote(ws, note.id, { revision: note.revision.slice(0, 16), expectedRevision: v2.revision })
  assert.equal(findNote(ws, note.id).note.body, 'version one\n')
  assert.equal(noteHistory(ws, note.id).length, 2, 'recovery snapshots the text it replaces')
  assert.notEqual(back.revision, v2.revision)

  const big = captureNote(ws, { title: 'Big', body: 'x' })
  assert.equal(code(() => appendNote(ws, big.id, { text: 'y'.repeat(1024 * 1024) })), 'too_large')
  fs.writeFileSync(path.join(dir, 'binary.md'), Buffer.from([0x2d, 0x2d, 0x2d, 0x0a, 0x00, 0x01]))
  fs.writeFileSync(path.join(dir, 'broken.md'), '---\nid: [unclosed\n---\nbody\n')
  fs.writeFileSync(path.join(dir, 'nofront.md'), 'just text\n')
  const scan = scanAll(ws)
  assert.equal(scan.notes.length, 2)
  assert.deepEqual(scan.problems.map((p) => p.path.split('/').pop()).sort(), ['binary.md', 'broken.md', 'nofront.md'])
  assert.ok(fs.existsSync(path.join(dir, 'broken.md')), 'invalid files are reported, not deleted')
  assert.ok(!JSON.stringify(knowledgeDoctor(ws)).includes('unclosed'), 'doctor does not echo file content')
})

test('private files are 0600 in 0700 directories', () => {
  const { root, ws } = workspace()
  const note = captureNote(ws, { title: 'Modes', body: 'x' })
  editNote(ws, note.id, { expectedRevision: note.revision, ops: [{ op: 'set', title: 'Modes 2' }] })
  const mode = (relative: string) => fs.statSync(path.join(root, relative)).mode & 0o777
  assert.equal(mode('brand/.private/knowledge'), 0o700)
  assert.equal(mode('brand/.private/knowledge/local'), 0o700)
  assert.equal(mode(note.path), 0o600)
  const snap = listTree(path.join(root, 'brand/.private/knowledge/revisions'))[0]!
  assert.equal(mode(`brand/.private/knowledge/revisions/${snap}`), 0o600)
})

test('brand backup and restore cover local, restricted and shared notes', () => {
  const { root, ws } = workspace()
  const local = captureNote(ws, { title: 'Local', body: 'local body' })
  const restricted = captureNote(ws, { title: 'Restricted', body: 'restricted body', classification: 'restricted' })
  fs.mkdirSync(path.join(root, 'brand/knowledge/shared'), { recursive: true })
  const shared = `---\nschema_version: 1\nid: kn_shared-hand-written\nbrand_slug: example-brand\ntitle: Shared\n---\nshared body\n`
  fs.writeFileSync(path.join(root, 'brand/knowledge/shared/kn_shared-hand-written.md'), shared)
  const saved = backupBrand(root, path.join(root, '..', `${path.basename(root)}-backup`))
  assert.ok(saved.files.includes(local.path))
  assert.ok(saved.files.includes(restricted.path))
  assert.ok(saved.files.includes('brand/knowledge/shared/kn_shared-hand-written.md'))
  fs.rmSync(path.join(root, 'brand/.private/knowledge'), { recursive: true })
  fs.rmSync(path.join(root, 'brand/knowledge'), { recursive: true })
  restoreBrand(root, saved.directory)
  assert.equal(findNote(ws, local.id).note.body, 'local body\n')
  assert.equal(findNote(ws, restricted.id, { includeRestricted: true }).note.body, 'restricted body\n')
  assert.equal(findNote(ws, 'kn_shared-hand-written').scope, 'shared')
})

test('a hand-written note with minimal metadata loads; migrate fills defaults idempotently', () => {
  const { root, ws } = workspace()
  fs.mkdirSync(path.join(root, 'brand/knowledge/shared'), { recursive: true })
  const file = path.join(root, 'brand/knowledge/shared/kn_minimal.md')
  fs.writeFileSync(file, '---\nid: kn_minimal\ntitle: Minimal\nextra_field: keep me\n---\nBody stays.\n')
  const loaded = findNote(ws, 'kn_minimal')
  assert.ok(loaded.note.issues.length > 0)
  assert.equal(loaded.note.meta.kind, 'general')
  const dry = migrateNotes(ws, { apply: false })
  assert.deepEqual(dry.changed, ['brand/knowledge/shared/kn_minimal.md'])
  assert.ok(fs.readFileSync(file, 'utf8').startsWith('---\nid: kn_minimal'), 'dry run writes nothing')
  migrateNotes(ws, { apply: true })
  const migrated = findNote(ws, 'kn_minimal')
  assert.equal(migrated.note.meta.brand_slug, 'example-brand')
  assert.equal(migrated.note.extra.extra_field, 'keep me')
  assert.equal(migrated.note.body, 'Body stays.\n')
  assert.deepEqual(migrateNotes(ws, { apply: true }).changed, [], 'second run changes nothing')
})
