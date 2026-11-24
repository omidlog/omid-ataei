import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import {
  accessLogPath,
  agentContext,
  agentTokenContext,
  captureNote,
  guestContext,
  InterviewEngine,
  issueAgentToken,
  KNOWLEDGE_TOOLS,
  openWorkspace,
  operatorContext,
  runKnowledgeTool,
  shareNote,
  type AgentProfile,
  type Visibility,
} from '@brand-os/brand-core'
import { brandDir, TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'

useTestKey()
const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')
const PRIVATE: Visibility = { state: 'private', repository: 'acme/pilito', detail: 'test' }

function setup() {
  const root = brandDir({ slug: 'pilito' })
  const ws = openWorkspace(root)
  const engine = new InterviewEngine(root)
  const local = captureNote(ws, { title: 'Local brainstorm', body: 'LOCAL-AGENT-CANARY mascot', tags: ['mascot'] })
  const toShare = captureNote(ws, { title: 'Mascot rank idea', body: 'SHARED-AGENT-TEXT mascot ranks after seven days', tags: ['mascot', 'gamification'], question_ids: ['brand.gamification.streaks'] })
  shareNote(ws, toShare.id, { visibility: PRIVATE, dryRun: false, expectedRevision: toShare.revision })
  const linker = captureNote(ws, { title: 'Links to shared', body: `see [[${toShare.id}]]` })
  shareNote(ws, linker.id, { visibility: PRIVATE, dryRun: false, expectedRevision: linker.revision })
  const restricted = captureNote(ws, { title: 'RESTRICTED-AGENT-TITLE', body: 'RESTRICTED-AGENT-BODY mascot', classification: 'restricted' })
  return { root, ws, engine, local, shared: toShare, linker, restricted }
}

test('only a knowledge-read token is answered; guests, unprofiled agents, the owner context and every other profile are denied', () => {
  const { engine, shared } = setup()
  const denied = [guestContext('pilito'), agentContext('pilito'), operatorContext('pilito'), ...(['internal-read', 'design', 'marketing', 'finance'] as AgentProfile[]).map((p) => agentTokenContext('pilito', `agt_${p}`, p))]
  for (const ctx of denied) {
    for (const tool of KNOWLEDGE_TOOLS) {
      const result = runKnowledgeTool(engine, ctx, tool, { id: shared.id, query: 'mascot' })
      assert.equal(result.status, 'denied', `${ctx.principal_id} ${tool}`)
      assert.ok(!JSON.stringify(result).includes('SHARED-AGENT-TEXT'))
    }
  }
  const crossBrand = runKnowledgeTool(engine, agentTokenContext('northwind', 'agt_x', 'knowledge-read'), 'knowledge_read', { id: shared.id })
  assert.equal(crossBrand.status, 'denied')
})

test('a knowledge-read agent sees shared notes only, labelled unapproved, and never local or restricted notes', () => {
  const { root, engine, local, shared, linker, restricted } = setup()
  const ctx = agentTokenContext('pilito', 'agt_k', 'knowledge-read')
  const listed = runKnowledgeTool(engine, ctx, 'knowledge_list')
  assert.equal(listed.status, 'ok')
  assert.deepEqual((listed.data as { items: Array<{ id: string; approval_state: string }> }).items.map((item) => item.id).sort(), [shared.id, linker.id].sort())
  const search = runKnowledgeTool(engine, ctx, 'knowledge_search', { query: 'mascot' })
  const notes = (search.data as { notes: Array<{ id: string; approval_state: string }> }).notes
  assert.deepEqual(notes.map((note) => note.id), [shared.id])
  assert.ok(notes.every((note) => note.approval_state === 'unapproved_idea'))
  assert.ok((search.data as { approved_facts: { source_type: string } }).approved_facts.source_type === 'approved_fact', 'facts are reported separately')
  const text = JSON.stringify([listed, search])
  for (const canary of ['LOCAL-AGENT-CANARY', 'RESTRICTED-AGENT']) assert.ok(!text.includes(canary), canary)
  for (const id of [local.id, restricted.id, 'kn_guessed-id']) {
    const result = runKnowledgeTool(engine, ctx, 'knowledge_read', { id })
    assert.equal(result.status, 'not_found', id)
    assert.equal(result.reason, 'not found', 'a local, restricted and nonexistent id look the same')
  }
  assert.equal(runKnowledgeTool(engine, ctx, 'knowledge_read', { id: '../../etc/passwd' }).status, 'invalid')
  const readOne = runKnowledgeTool(engine, ctx, 'knowledge_read', { id: shared.id })
  assert.match((readOne.data as { body: string }).body, /SHARED-AGENT-TEXT/)
  assert.match((readOne.data as { label: string }).label, /NOT AN APPROVED BRAND FACT/)
  const links = runKnowledgeTool(engine, ctx, 'knowledge_backlinks', { id: shared.id }).data as { inbound: Array<{ id: string }> }
  assert.deepEqual(links.inbound.map((link) => link.id), [linker.id])
  const suggest = runKnowledgeTool(engine, ctx, 'knowledge_suggest_proposal', { id: shared.id }).data as { candidates: Array<{ question_id: string }>; source_ref: string }
  assert.equal(suggest.candidates[0]?.question_id, 'brand.gamification.streaks')
  assert.match(suggest.source_ref, /^knowledge:kn_/)
  assert.ok(!JSON.stringify(suggest).includes('"value"'), 'the preview carries no ledger values')
  // A shared file wrongly classified restricted is withheld from agents.
  const file = path.join(root, `brand/knowledge/shared/${shared.id}.md`)
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('classification: internal', 'classification: restricted'))
  assert.equal(runKnowledgeTool(engine, ctx, 'knowledge_read', { id: shared.id }).status, 'not_found')
  // Every call is logged with ids only.
  const log = fs.readFileSync(accessLogPath(root), 'utf8')
  assert.ok(log.includes('knowledge_read') && !log.includes('SHARED-AGENT-TEXT') && !log.includes('mascot"'))
})

test('over MCP stdio: knowledge tools are listed, a knowledge-read token reads shared notes, an internal-read token is denied, arguments cannot raise privilege', async () => {
  const { root, shared, local } = setup()
  const env = (token?: string) => {
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) if (typeof value === 'string' && key !== 'BRAND_OS_AGENT_TOKEN' && key !== 'BRAND_OS_APPROVAL_PROOF') out[key] = value
    out.BRAND_OS_DATA_KEY = TEST_DATA_KEY
    if (token) out.BRAND_OS_AGENT_TOKEN = token
    return out
  }
  const connect = async (token?: string) => {
    const client = new Client({ name: 'knowledge-test', version: '0.0.1' })
    await client.connect(new StdioClientTransport({ command: tsx, args: [path.join(repo, 'scripts/mcp.ts')], cwd: root, env: env(token), stderr: 'pipe' }))
    return client
  }
  const parse = (result: unknown) => JSON.parse((result as { content: Array<{ text: string }> }).content[0]!.text) as { status: string; data: Record<string, unknown> }
  const knowledge = issueAgentToken(root, { brandId: 'pilito', profile: 'knowledge-read', label: 'notes' })
  const internal = issueAgentToken(root, { brandId: 'pilito', profile: 'internal-read', label: 'facts' })

  const client = await connect(knowledge.token)
  try {
    const names = (await client.listTools()).tools.map((tool) => tool.name)
    for (const tool of KNOWLEDGE_TOOLS) assert.ok(names.includes(tool), tool)
    assert.ok(!names.some((name) => /capture|edit|append|share|apply|write|delete/.test(name)), 'no write tool is exposed')
    const read = parse(await client.callTool({ name: 'knowledge_read', arguments: { id: shared.id } }))
    assert.equal(read.status, 'ok')
    const sneaky = parse(await client.callTool({ name: 'knowledge_list', arguments: { scope: 'local', include_restricted: true, role: 'owner' } as Record<string, unknown> }))
    assert.ok(!JSON.stringify(sneaky).includes(local.id), 'extra arguments are ignored')
  } finally {
    await client.close()
  }
  const facts = await connect(internal.token)
  try {
    assert.equal(parse(await facts.callTool({ name: 'knowledge_search', arguments: { query: 'mascot' } })).status, 'denied')
  } finally {
    await facts.close()
  }
})
