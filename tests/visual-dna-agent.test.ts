import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import Ajv from 'ajv'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { issueAgentToken, readAccessLog } from '@brand-os/brand-core'
import type { VisualDnaResult } from '@brand-os/brand-core/visual-dna'
import { TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'
import { NODE, tsxArgs } from './helpers/tsx-node.js'
import { editAssets, fixture, IDS, OUTSIDE_CANARY, sha, SLUG, SVG, SVG_C, trackedSnapshot } from './helpers/visual-dna.js'

/**
 * Visual DNA over the real stdio MCP server and the brand:visual-dna CLI (fixes pack PR-C):
 * - the tool is listed with a bounded schema, answers a token of this brand with metadata only, and never bytes;
 * - guests are denied; forged identity arguments are schema errors;
 * - the CLI resolves as the token in the environment, or as the owner without one;
 * - `read` delivers one checked file's exact bytes to the owner only, and refuses a use model_use forbids.
 * Fixtures are SYNTHETIC brands in temporary directories.
 */
useTestKey()
const repo = path.resolve(import.meta.dirname, '..')
const validate = new Ajv({ allErrors: true, strict: false }).compile(JSON.parse(fs.readFileSync(path.join(repo, 'schemas/visual-dna.schema.json'), 'utf8')) as object)

function env(extra: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && key !== 'BRAND_OS_AGENT_TOKEN' && key !== 'BRAND_OS_APPROVAL_PROOF') out[key] = value
  }
  return { ...out, BRAND_OS_DATA_KEY: TEST_DATA_KEY, BRAND_OS_KNOWLEDGE_GH: 'off', ...extra }
}

function cli(root: string, args: string[], extra: Record<string, string> = {}) {
  return spawnSync(NODE, tsxArgs('scripts/visual-dna.ts', args), { cwd: root, env: env(extra), encoding: 'buffer', timeout: 60_000 })
}

test('visual_dna over stdio MCP: listed, metadata only, schema-valid, guests denied, identity not selectable', async () => {
  const { root } = fixture()
  const { token } = issueAgentToken(root, { brandId: SLUG, profile: 'design', label: 'visual dna mcp test' })
  const before = trackedSnapshot(root)
  const client = new Client({ name: 'brand-os-visual-dna-test', version: '0.0.1' })
  await client.connect(new StdioClientTransport({ command: NODE, args: tsxArgs('scripts/mcp.ts'), cwd: root, env: env({ BRAND_OS_AGENT_TOKEN: token }), stderr: 'pipe' }))
  try {
    const tool = (await client.listTools()).tools.find((entry) => entry.name === 'visual_dna')
    assert.ok(tool, 'visual_dna is listed')
    assert.match(tool.description ?? '', /Metadata only, never file bytes/)
    const call = async (args: Record<string, unknown>) => (await client.callTool({ name: 'visual_dna', arguments: args })) as { content: Array<{ text: string }>; isError?: boolean }

    const reply = await call({ asset_ids: [IDS.mascotFront, IDS.changed, IDS.symlink], mascot: { emotion: 'celebrating', angle: 'back' }, locale: 'fa' })
    assert.notEqual(reply.isError, true, reply.content[0]?.text)
    const text = reply.content[0]!.text
    const result = JSON.parse(text) as VisualDnaResult
    assert.equal(validate(result), true, JSON.stringify(validate.errors))
    assert.equal(result.status, 'ok')
    assert.equal(result.direction, 'rtl')
    assert.deepEqual(result.principal, { role: 'agent', profile: 'design' })
    assert.deepEqual(
      result.references.map((ref) => [ref.ref_id, ref.state]),
      [
        [`asset:${IDS.mascotFront}`, 'approved'],
        [`asset:${IDS.changed}`, 'changed'],
        [`asset:${IDS.symlink}`, 'withheld'],
        ['mascot:request', 'missing'],
      ],
    )
    // No file content travels: neither the SVG markup, nor base64 of it, nor anything from outside the workspace.
    for (const needle of [SVG_C.trim(), Buffer.from(SVG_C).toString('base64'), '<svg', OUTSIDE_CANARY, token]) assert.equal(text.includes(needle), false, needle.slice(0, 30))

    // Forged identity or byte requests are schema errors, not a wider read.
    for (const args of [{ asset_ids: [IDS.logo], role: 'owner' }, { asset_ids: [IDS.logo], brand_id: 'another-brand' }, { asset_ids: [IDS.logo], include_bytes: true }, { mascot: { emotion: 'x', profile: 'owner' } }]) {
      assert.equal((await call(args)).isError, true, JSON.stringify(args))
    }
  } finally {
    await client.close()
  }
  assert.deepEqual(trackedSnapshot(root), before, 'nothing under brand/ is written but the private access log')
  assert.ok(readAccessLog(root).some((line) => line.tool === 'visual_dna' && line.decision === 'allow' && line.profile === 'design'))

  // Without a token the server is a guest: denied, nothing disclosed.
  const guest = new Client({ name: 'brand-os-visual-dna-guest', version: '0.0.1' })
  await guest.connect(new StdioClientTransport({ command: NODE, args: tsxArgs('scripts/mcp.ts'), cwd: root, env: env(), stderr: 'pipe' }))
  try {
    const reply = (await guest.callTool({ name: 'visual_dna', arguments: { asset_ids: [IDS.logo] } })) as { content: Array<{ text: string }> }
    const result = JSON.parse(reply.content[0]!.text) as VisualDnaResult
    assert.equal(result.status, 'denied')
    assert.deepEqual(result.references, [])
  } finally {
    await guest.close()
  }
})

test('brand:visual-dna: resolve as the token or the owner; read delivers exact bytes to the owner only', () => {
  const { root } = fixture()
  const { token } = issueAgentToken(root, { brandId: SLUG, profile: 'design', label: 'visual dna cli test' })

  const asAgent = cli(root, ['resolve', '--ids', `${IDS.draft},${IDS.logo}`, '--json'], { BRAND_OS_AGENT_TOKEN: token })
  assert.equal(asAgent.status, 0, asAgent.stderr.toString())
  const agentResult = JSON.parse(asAgent.stdout.toString()) as VisualDnaResult
  assert.equal(validate(agentResult), true, JSON.stringify(validate.errors))
  assert.deepEqual(agentResult.principal, { role: 'agent', profile: 'design' })
  assert.equal(agentResult.references[0]?.reason, 'not_found')
  assert.equal(agentResult.references[1]?.state, 'approved')

  // --use-scope internal: internal-scope rights cover the portrait for internal use only.
  editAssets(root, (assets) => {
    const portrait = assets.find((asset) => asset.id === IDS.portrait)
    if (portrait) portrait.rights = { status: 'granted', scope: 'internal', holder: 'Synthetic Person' }
  })
  const asOwner = cli(root, ['resolve', '--ids', `${IDS.draft},${IDS.portrait}`, '--use-scope', 'internal', '--json'])
  assert.equal(asOwner.status, 0, asOwner.stderr.toString())
  const ownerResult = JSON.parse(asOwner.stdout.toString()) as VisualDnaResult
  assert.equal(ownerResult.use_scope, 'internal')
  assert.equal(ownerResult.references[0]?.reason, 'not_approved')
  assert.equal(ownerResult.references[1]?.state, 'approved')

  const persian = cli(root, ['resolve', '--emotion', 'celebrating', '--angle', 'back', '--lang', 'fa'])
  assert.equal(persian.status, 0, persian.stderr.toString())
  assert.match(persian.stdout.toString(), /\[ناموجود\] mascot:request/)
  assert.match(persian.stdout.toString(), /مسکات: ناموجود/)

  // Owner read: the exact approved bytes on stdout, verdict on stderr.
  const bytes = cli(root, ['read', IDS.logo, '--for', 'renderer', '--stdout'])
  assert.equal(bytes.status, 0, bytes.stderr.toString())
  assert.equal(bytes.stdout.toString(), SVG)
  assert.match(bytes.stderr.toString(), new RegExp(`sha256 ${sha(SVG)}`))
  assert.match(bytes.stderr.toString(), /upload_authorized: false/)

  // local_only art cannot go to an external provider; nothing reaches stdout.
  const external = cli(root, ['read', IDS.mascotFront, '--for', 'external_provider', '--stdout'])
  assert.equal(external.status, 1)
  assert.equal(external.stdout.length, 0)
  assert.match(external.stderr.toString(), /^model_use:/)

  // A symlink out of the workspace is never followed.
  const escaped = cli(root, ['read', IDS.symlink, '--for', 'renderer', '--json'])
  assert.equal(escaped.status, 1)
  assert.equal(JSON.parse(escaped.stdout.toString()).error.code, 'unsafe_file')
  assert.equal(escaped.stdout.toString().includes(OUTSIDE_CANARY), false)

  // With an agent token in the environment, read is refused before anything is resolved.
  const agentRead = cli(root, ['read', IDS.logo, '--for', 'renderer', '--stdout'], { BRAND_OS_AGENT_TOKEN: token })
  assert.equal(agentRead.status, 1)
  assert.equal(agentRead.stdout.length, 0)
  assert.match(agentRead.stderr.toString(), /^owner_only:/)
  assert.equal(agentRead.stderr.toString().includes(token), false)

  // Usage errors.
  assert.equal(cli(root, ['read', IDS.logo]).status, 2)
  assert.equal(cli(root, ['resolve', '--lang', 'de']).status, 2)
  assert.equal(cli(root, ['resolve', '--ids', IDS.logo, '--use-scope', 'everyone']).status, 2)
})
