import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { MIGRATIONS_DIR, SYNC_MANIFEST_PATH } from '@brand-os/brand-core'
import { TemplateUpdateService } from '../apps/studio/src/template-update.js'
import { harness, OWNER, provisioned, TEMPLATE } from './helpers/studio.js'

/**
 * Template sync chunk 4: versioned migrations through Studio's update pull request (in-memory GitHub,
 * no network). The CLI path is tested in tests/template-migrations.test.ts.
 */
const repo = path.resolve(import.meta.dirname, '..')
const manifestText = fs.readFileSync(path.join(repo, SYNC_MANIFEST_PATH), 'utf8')
const sha = (text: string) => crypto.createHash('sha256').update(text).digest('hex')
const migration = (body: Record<string, unknown>) => JSON.stringify({ schema_version: 1, description: 'Remove old files.', ...body })

test('migrations: Studio\'s update pull request runs them and lists them in the body', async () => {
  const h = harness()
  try {
    h.github.pushEdit(TEMPLATE.owner, TEMPLATE.repo, (tree) => {
      tree.set(SYNC_MANIFEST_PATH, Buffer.from(manifestText))
      tree.set('scripts/tool.ts', Buffer.from('v1\n'))
    })
    const req = await provisioned(h)
    h.github.pushEdit(OWNER, req.repo, (tree) => tree.set('scripts/legacy.ts', Buffer.from('legacy\n')))
    const before = h.github.repo(OWNER, req.repo)!.head!
    h.github.pushEdit(TEMPLATE.owner, TEMPLATE.repo, (tree) => {
      tree.set('scripts/tool.ts', Buffer.from('v2\n'))
      tree.set(`${MIGRATIONS_DIR}/0001-remove-legacy.json`, Buffer.from(migration({ version: '0.3.0', description: 'Remove the legacy script.', operations: [{ op: 'delete', path: 'scripts/legacy.ts', sha256: [sha('legacy\n')] }] })))
    })
    const updates = new TemplateUpdateService({ registry: h.registry, github: h.provisionClient, templateOwner: TEMPLATE.owner, templateRepo: TEMPLATE.repo, allowedOwners: [OWNER], dataDir: h.dataDir })
    const result = await updates.openUpdatePull(req.slug, 'owner')
    assert.equal(result.ok && result.code, 'opened')
    const gh = h.github.repo(OWNER, req.repo)!
    assert.equal(gh.head, before, 'the default branch never moves')
    const tip = gh.branches.get(gh.pulls[0]!.head)!
    const files = h.github.treeAt(tip)
    assert.equal(files.has('scripts/legacy.ts'), false)
    assert.equal(files.get('scripts/tool.ts')?.toString(), 'v2\n')
    assert.deepEqual(files.get('brand/brand.config.yaml'), h.github.treeAt(before).get('brand/brand.config.yaml'))
    assert.match(gh.pulls[0]!.body!, /## Migrations \(1, in order\)\n- `0001-remove-legacy` \(0\.3\.0\): Remove the legacy script\. \(applied: scripts\/legacy\.ts\)/)
    const audit = fs.readFileSync(path.join(h.dataDir, 'audit.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    assert.deepEqual(audit.at(-1).migrations, ['0001-remove-legacy'])
  } finally {
    fs.rmSync(h.dataDir, { recursive: true, force: true })
  }
})
