import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import {
  appendNote,
  archiveNote,
  captureNote,
  confirmVisibility,
  detectVisibility,
  editNote,
  findNote,
  githubRepoFromRemote,
  knowledgeDoctor,
  listNotes,
  noteHistory,
  openWorkspace,
  safetyReport,
  scanAll,
  searchNotes,
  shareNote,
  unshareNote,
  KnowledgeError,
  type Visibility,
} from '@brand-os/brand-core'
import { prepareDocs } from '../scripts/prepare-docs.js'
import { scanPublicTree } from '../scripts/scan-public.js'
import { brandDir, listTree, treeText, useTestKey, workspace } from './helpers/knowledge.js'

useTestKey()
const PRIVATE: Visibility = { state: 'private', repository: 'acme/pilito', detail: 'test' }

function code(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof KnowledgeError) return error.code
    throw error
  }
  return 'no error'
}

test('ids that try to escape the workspace are refused before any path is built', () => {
  const { ws } = workspace()
  const attempts = [
    '../../etc/passwd',
    'kn_../../x',
    'kn_..%2f..%2fx',
    'kn_abc%2e%2e',
    'kn_abc\0.md',
    '/etc/passwd',
    'C:\\Windows\\x',
    'KN_ABCDEF',
    'kn_ABCDEF',
    'kn_abc/def',
    'kn_abc\\def',
    'kn_',
    '',
    `kn_${'a'.repeat(80)}`,
  ]
  for (const id of attempts) {
    assert.equal(code(() => findNote(ws, id)), 'invalid_id', JSON.stringify(id))
    assert.equal(code(() => editNote(ws, id, { expectedRevision: '0'.repeat(64), ops: [{ op: 'set', title: 'x' }] })), 'invalid_id', JSON.stringify(id))
    assert.equal(code(() => appendNote(ws, id, { text: 'x' })), 'invalid_id', JSON.stringify(id))
    assert.equal(code(() => archiveNote(ws, id)), 'invalid_id', JSON.stringify(id))
  }
})

test('symlinks, hard links and symlinked folders are never followed', () => {
  const { root, ws } = workspace()
  const outside = path.join(root, '..', `${path.basename(root)}-outside.md`)
  fs.writeFileSync(outside, '---\nschema_version: 1\nid: kn_evil-link\nbrand_slug: example-brand\ntitle: Outside\n---\nOUTSIDE-CANARY\n')
  captureNote(ws, { title: 'Real note', body: 'inside' })
  const local = path.join(root, 'brand/.private/knowledge/local')
  fs.symlinkSync(outside, path.join(local, 'kn_evil-link.md'))
  assert.equal(code(() => findNote(ws, 'kn_evil-link')), 'unsafe_path')
  assert.ok(scanAll(ws).problems.some((p) => p.code === 'symlink'))
  assert.ok(!JSON.stringify(searchNotes(ws, 'OUTSIDE')).includes('OUTSIDE-CANARY'))
  fs.rmSync(path.join(local, 'kn_evil-link.md'))
  // A hard link is a second name for a file that may live elsewhere.
  fs.linkSync(outside, path.join(local, 'kn_evil-link.md'))
  assert.equal(code(() => findNote(ws, 'kn_evil-link')), 'unsafe_path')
  assert.equal(searchNotes(ws, 'OUTSIDE').total, 0)
  fs.rmSync(path.join(local, 'kn_evil-link.md'))
  // A symlinked shared folder is refused for reads and writes.
  const elsewhere = fs.mkdtempSync(path.join(path.dirname(root), 'elsewhere-'))
  fs.mkdirSync(path.join(root, 'brand/knowledge'), { recursive: true })
  fs.symlinkSync(elsewhere, path.join(root, 'brand/knowledge/shared'))
  assert.ok(scanAll(ws).problems.some((p) => p.code === 'symlink'))
  const local2 = captureNote(ws, { title: 'To share', body: 'fine' })
  assert.equal(code(() => shareNote(ws, local2.id, { visibility: PRIVATE, dryRun: false, expectedRevision: local2.revision })), 'unsafe_path')
  assert.deepEqual(fs.readdirSync(elsewhere), [], 'nothing was written through the link')
  assert.ok(knowledgeDoctor(ws).issues.some((i) => i.code === 'symlink'))
  // A symlinked private knowledge folder stops capture.
  const other = brandDir()
  fs.mkdirSync(path.join(other, 'brand/.private'), { recursive: true })
  fs.symlinkSync(elsewhere, path.join(other, 'brand/.private/knowledge'))
  assert.equal(code(() => captureNote(openWorkspace(other), { title: 'x', body: 'y' })), 'unsafe_path')
})

test('two brands are isolated: neither can find, search, link or edit the other’s notes', () => {
  const a = workspace({ slug: 'pilito' })
  const b = workspace({ slug: 'northwind' })
  const idea = captureNote(a.ws, { title: 'Pilito mascot', body: 'PILITO-ONLY mascot rank', tags: ['mascot'] })
  assert.equal(searchNotes(b.ws, 'mascot').total, 0)
  assert.equal(code(() => findNote(b.ws, idea.id)), 'not_found')
  assert.equal(code(() => editNote(b.ws, idea.id, { expectedRevision: idea.revision, ops: [{ op: 'set', title: 'x' }] })), 'not_found')
  assert.equal(code(() => captureNote(b.ws, { title: 'x', body: 'y', links: [{ id: idea.id, relationship: 'related' }] })), 'invalid_input')
  // Copying the file into brand B does not make it B's note.
  fs.mkdirSync(path.join(b.root, 'brand/.private/knowledge/local'), { recursive: true })
  fs.copyFileSync(path.join(a.root, idea.path), path.join(b.root, idea.path))
  assert.equal(code(() => findNote(b.ws, idea.id)), 'not_found')
  assert.equal(listNotes(b.ws).total, 0)
})

test('share: dry run writes nothing; unknown or public visibility, credentials, personal data and restricted notes are refused', () => {
  const { root, ws } = workspace()
  const ok = captureNote(ws, { title: 'Shareable idea', body: 'A gentle onboarding tour.', tags: ['ux'] })
  const dry = shareNote(ws, ok.id, { visibility: PRIVATE, dryRun: true })
  assert.equal(dry.ok, true)
  assert.equal(dry.content, fs.readFileSync(path.join(root, ok.path), 'utf8'), 'the preview shows exactly what becomes tracked')
  assert.equal(dry.to, `brand/knowledge/shared/${ok.id}.md`)
  assert.ok(dry.warnings.some((w) => w.includes('Git history permanently')))
  assert.equal(fs.existsSync(path.join(root, 'brand/knowledge')), false)

  const unknown = shareNote(ws, ok.id, { visibility: { state: 'unknown', repository: null, detail: 'no remote' }, dryRun: false, expectedRevision: ok.revision })
  assert.equal(unknown.ok, false)
  assert.equal(shareNote(ws, ok.id, { visibility: { state: 'public', repository: 'acme/pilito', detail: '' }, dryRun: false, expectedRevision: ok.revision }).ok, false)
  assert.equal(fs.existsSync(path.join(root, 'brand/knowledge')), false)

  const personal = captureNote(ws, { title: 'Contact', body: 'My home address is 12 Example Street.' })
  assert.match(shareNote(ws, personal.id, { visibility: PRIVATE, dryRun: true }).blocked.join(' '), /personal private data/)
  const money = captureNote(ws, { title: 'Money', body: 'Our revenue was high this year.' })
  assert.match(shareNote(ws, money.id, { visibility: PRIVATE, dryRun: true }).blocked.join(' '), /restricted financial/)
  const sealed = captureNote(ws, { title: 'Sealed', body: 'x', classification: 'restricted' })
  assert.equal(code(() => shareNote(ws, sealed.id, { visibility: PRIVATE, dryRun: true })), 'not_found')
  // A credential added by hand to a local file is caught at share time too.
  const sneaky = captureNote(ws, { title: 'Sneaky', body: 'clean' })
  fs.appendFileSync(path.join(root, sneaky.path), `\nkey sk-ant-${'x'.repeat(30)}\n`)
  const blocked = shareNote(ws, sneaky.id, { visibility: PRIVATE, dryRun: true })
  assert.match(blocked.blocked.join(' '), /possible credentials/)
  assert.ok(!JSON.stringify(blocked.blocked).includes('xxxxxxxx'), 'the finding names a kind, not the secret')

  // Apply needs the previewed revision; a change in between is refused.
  assert.equal(code(() => shareNote(ws, ok.id, { visibility: PRIVATE, dryRun: false })), 'invalid_input')
  const moved = shareNote(ws, ok.id, { visibility: PRIVATE, dryRun: false, expectedRevision: dry.revision })
  assert.equal(moved.result?.scope, 'shared')
  assert.equal(fs.existsSync(path.join(root, ok.path)), false)
  assert.equal(findNote(ws, ok.id).scope, 'shared')
  assert.equal(findNote(ws, ok.id).revision, ok.revision, 'content is moved byte-for-byte')
  assert.equal(fs.statSync(path.join(root, moved.to)).mode & 0o777, 0o644, 'shared files are ordinary tracked files')
  assert.equal(code(() => shareNote(ws, ok.id, { visibility: PRIVATE, dryRun: true })), 'refused')
  const back = unshareNote(ws, ok.id, { expectedRevision: ok.revision })
  assert.equal(back.scope, 'local')
  assert.match(back.warning, /Earlier commits still contain it/)
  assert.ok(noteHistory(ws, ok.id).length >= 1)
})

test('links to other notes never look like phone numbers or long numbers to the share checks', () => {
  const ids = ['kn_00000000-0000-4000-8000-000000000000', 'kn_12345678-9012-4345-8678-901234567890', 'kn_98765432-1098-4765-a432-109876543210']
  for (const id of ids) {
    const report = safetyReport(`Builds on [[${id}]] and ${id}.`)
    assert.deepEqual(report.personal, [], id)
    assert.equal(report.restricted_passages, 0, id)
  }
  assert.deepEqual(safetyReport('Call me on +90 532 123 45 67').personal, ['phone'], 'real phone numbers are still caught')
})

test('visibility detection fails closed and owner confirmation must name the origin repository', () => {
  assert.equal(githubRepoFromRemote('https://github.com/acme/pilito.git'), 'acme/pilito')
  assert.equal(githubRepoFromRemote('git@github.com:acme/pilito.git'), 'acme/pilito')
  assert.equal(githubRepoFromRemote('https://gitlab.com/acme/pilito.git'), null)
  const root = brandDir()
  assert.equal(detectVisibility(root, { BRAND_OS_KNOWLEDGE_GH: 'off' }).state, 'unknown', 'not a git repository')
  spawnSync('git', ['-C', root, 'init', '-q'])
  assert.equal(detectVisibility(root, { BRAND_OS_KNOWLEDGE_GH: 'off' }).state, 'unknown', 'no origin')
  spawnSync('git', ['-C', root, 'remote', 'add', 'origin', 'https://github.com/acme/pilito.git'])
  const detected = detectVisibility(root, { BRAND_OS_KNOWLEDGE_GH: 'off' })
  assert.deepEqual([detected.state, detected.repository], ['unknown', 'acme/pilito'])
  assert.equal(confirmVisibility(detected, 'acme/other').state, 'unknown')
  assert.equal(confirmVisibility(detected, 'acme/pilito').state, 'private')
  assert.equal(confirmVisibility({ state: 'public', repository: 'acme/pilito', detail: '' }, 'acme/pilito').state, 'public', 'a public repository cannot be confirmed private')
  assert.equal(confirmVisibility({ state: 'unknown', repository: null, detail: '' }, 'acme/pilito').state, 'unknown')
})

test('public and internal docs builds and the public scan never contain knowledge notes', () => {
  const { root, ws } = workspace()
  fs.cpSync(path.join(path.resolve(import.meta.dirname, '..'), 'brand/tokens'), path.join(root, 'brand/tokens'), { recursive: true })
  captureNote(ws, { title: 'LOCAL-NOTE-CANARY', body: 'LOCAL-NOTE-CANARY body' })
  const shared = captureNote(ws, { title: 'SHARED-NOTE-CANARY', body: 'SHARED-NOTE-CANARY body' })
  shareNote(ws, shared.id, { visibility: PRIVATE, dryRun: false, expectedRevision: shared.revision })
  captureNote(ws, { title: 'RESTRICTED_CANARY_DO_NOT_PUBLISH', body: 'x', classification: 'restricted' })
  for (const audience of ['public', 'internal'] as const) {
    prepareDocs(root, { audience, mascot: false, gamification: false, rootIndex: false })
    const docs = path.join(root, 'apps/docs')
    const text = treeText(docs)
    assert.ok(!text.includes('LOCAL-NOTE-CANARY'), audience)
    assert.ok(!text.includes('SHARED-NOTE-CANARY'), audience)
    assert.ok(!listTree(docs).some((file) => file.includes('knowledge')), audience)
    assert.deepEqual(scanPublicTree(path.join(docs, 'docs')), [])
  }
})
