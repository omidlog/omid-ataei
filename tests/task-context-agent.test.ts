import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import Ajv from 'ajv'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import {
  allQuestions,
  buildTaskContext,
  issueAgentToken,
  readAccessLog,
  resolveAgentContext,
  revokeAgentToken,
  runTaskContextTool,
  verifyPack,
  type TaskContextPack,
} from '@brand-os/brand-core'
import { approveRevision, proposeRevision } from '@brand-os/brand-core/strategy'
import { approveFacts, BUDGET_FACT_CANARY, contentBrand, type ContentBrand } from './helpers/content.js'
import { listTree, TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'
import { adsProposal, BUDGET_CANARY, DRAFT_CANARY, RESTRICTED_NOTE_CANARY } from './helpers/strategy.js'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

/**
 * GAP-02: the `task_context` stdio MCP tool. A fresh Claude session with an owner-issued token makes one call and gets
 * the same pack the core builds for that caller. Checked here, through the real `scripts/mcp.ts` process:
 *
 * - the tool is listed with a bounded input schema;
 * - the Persian "ten Instagram posts" request becomes social_batch, count 10, instagram (FIX-02), schema-valid,
 *   digest-verified, `authorizes: []`, every permission false, no canary, and its digest equals the core pack's;
 * - the request text is in neither the result nor the access log, and nothing under brand/ is written but the log;
 * - guest, cross-brand and revoked callers are refused; forged role/token/brand arguments change nothing;
 * - profiles stay separate over MCP: a design token gets no paid strategy, an ads token does;
 * - an unclear request asks for task_type, and an out-of-range input is a schema error.
 *
 * Fixtures are SYNTHETIC DEMO brands in temporary directories. No real brand fact, strategy or asset is touched.
 */
useTestKey()

const repo = path.resolve(import.meta.dirname, '..')
const FA_REQUEST = '۱۰ پست اینستاگرام برای برند بساز'
const CANARIES = [BUDGET_FACT_CANARY, String(BUDGET_CANARY), RESTRICTED_NOTE_CANARY, DRAFT_CANARY, 'approval-secret', 'EXAMPLE-ONLY']

const validate = new Ajv({ allErrors: true, strict: false }).compile(JSON.parse(fs.readFileSync(path.join(repo, 'schemas/task-context.schema.json'), 'utf8')) as object)

interface Reply {
  tool: string
  status: string
  brand_id: string
  reason?: string
  candidates?: string[]
  data: TaskContextPack | null
  authorizes: unknown[]
}

function env(extra: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && key !== 'BRAND_OS_AGENT_TOKEN' && key !== 'BRAND_OS_APPROVAL_PROOF') out[key] = value
  }
  return { ...out, BRAND_OS_DATA_KEY: TEST_DATA_KEY, BRAND_OS_KNOWLEDGE_GH: 'off', ...extra }
}

async function session(root: string, token?: string): Promise<{ call: (args: Record<string, unknown>) => Promise<Reply>; raw: Client; close: () => Promise<void> }> {
  const client = new Client({ name: 'brand-os-task-context-test', version: '0.0.1' })
  await client.connect(new StdioClientTransport({ command: NODE, args: tsxArgs('scripts/mcp.ts'), cwd: root, env: env(token ? { BRAND_OS_AGENT_TOKEN: token } : {}), stderr: 'pipe' }))
  return {
    raw: client,
    call: async (args) => {
      const result = (await client.callTool({ name: 'task_context', arguments: args })) as { content: Array<{ text: string }>; isError?: boolean }
      assert.notEqual(result.isError, true, result.content[0]?.text)
      return JSON.parse(result.content[0]?.text ?? '{}') as Reply
    },
    close: () => client.close(),
  }
}

function pack(reply: Reply, label: string): TaskContextPack {
  assert.equal(reply.status, 'ok', `${label}: ${reply.reason ?? ''}`)
  const data = reply.data
  assert.ok(data, `${label}: pack`)
  assert.ok(validate(data) as boolean, `${label}: ${JSON.stringify(validate.errors)}`)
  assert.deepEqual(reply.authorizes, [])
  assert.deepEqual(data.authorizes, [])
  assert.deepEqual(data.permissions, { publish: false, schedule: false, spend: false, deploy: false })
  assert.ok(verifyPack(data), `${label}: digest verifies`)
  const json = JSON.stringify(reply)
  for (const canary of CANARIES) assert.ok(!json.includes(canary), `${label}: ${canary} must not appear`)
  return data
}

const items = (data: TaskContextPack, key: string) => Object.values(data.sections).flat().filter((item) => item.key === key)

async function brand(slug: string): Promise<ContentBrand> {
  const s = await contentBrand(slug)
  approveFacts(s, [
    ['business.identity.trade_name', 'Pilito'],
    ['brand.strategy.purpose', 'Help adults speak a new language from day one.'],
  ])
  return s
}

test('a fresh MCP session lists task_context and turns the Persian ten-post request into one bounded pack', async () => {
  const s = await brand('pilito-mcp')
  const { token } = issueAgentToken(s.root, { brandId: 'pilito-mcp', profile: 'content-read', label: 'mcp test' })
  const before = listTree(path.join(s.root, 'brand')).filter((file) => !file.includes('access-log'))
  const agent = await session(s.root, token)
  try {
    const tools = await agent.raw.listTools()
    const tool = tools.tools.find((entry) => entry.name === 'task_context')
    assert.ok(tool, 'task_context is listed')
    assert.match(tool.description ?? '', /once per task/)
    assert.match(tool.description ?? '', /authorizes is always empty/)
    const props = (tool.inputSchema as { properties: Record<string, unknown> }).properties
    assert.deepEqual(Object.keys(props).sort(), ['channel', 'deliverable_count', 'locale', 'output_format', 'request', 'request_mode', 'scope_id', 'task_type'])

    const reply = await agent.call({ request: FA_REQUEST, locale: 'fa' })
    const data = pack(reply, 'fa social_batch')
    assert.equal(data.task.type, 'social_batch')
    assert.equal(data.task.deliverable_count, 10)
    assert.equal(data.task.channel, 'instagram')
    assert.equal(data.task.locale, 'fa')
    assert.equal(data.brand_id, 'pilito-mcp')
    assert.ok(items(data, 'brand_name').some((item) => item.state === 'approved' && item.value === 'Pilito'))
    // Every gap is an existing question id or a named source to ask for, never an invented field.
    const bank = new Set(allQuestions().map((question) => question.id))
    for (const entry of data.missing) {
      if (entry.suggested_question_id) assert.ok(bank.has(entry.suggested_question_id), entry.suggested_question_id)
    }

    // Same caller, same core: the MCP pack is byte-for-byte the pack buildTaskContext returns.
    const core = buildTaskContext(s.engine, resolveAgentContext(s.root, 'pilito-mcp', token), { task_type: 'social_batch', deliverable_count: 10, channel: 'instagram', locale: 'fa' })
    assert.equal(core.data?.digests.context_sha256, data.digests.context_sha256)

    // The request text and the token are never echoed or logged.
    assert.equal(JSON.stringify(reply).includes(FA_REQUEST), false)
    assert.equal(JSON.stringify(reply).includes(token), false)
    const log = readAccessLog(s.root).filter((line) => line.tool === 'task_context')
    assert.ok(log.length >= 1)
    assert.equal(JSON.stringify(log).includes(FA_REQUEST), false)
    assert.equal(JSON.stringify(log).includes(token), false)
    assert.ok(log.every((line) => line.query_sha256 === null))
  } finally {
    await agent.close()
  }
  // Reading context writes nothing but the access log: no calendar week, approval, fact or asset.
  assert.deepEqual(listTree(path.join(s.root, 'brand')).filter((file) => !file.includes('access-log')), before)
})

test('guest, cross-brand and revoked callers get nothing; forged arguments change nothing', async () => {
  const s = await brand('pilito-mcp-deny')

  const guest = await session(s.root)
  try {
    for (const args of [{ task_type: 'visual_design' }, { request: FA_REQUEST }, { request: 'make something nice' }]) {
      const reply = await guest.call(args)
      assert.equal(reply.status, 'denied', JSON.stringify(args))
      assert.equal(reply.data, null)
      assert.equal(JSON.stringify(reply).includes('Pilito'), false)
    }
  } finally {
    await guest.close()
  }
  assert.ok(readAccessLog(s.root).some((line) => line.tool === 'task_context' && line.decision === 'deny' && line.principal === 'anonymous'))

  // A token of another brand, or a revoked one, stops the server at startup without printing the token.
  const other = issueAgentToken(s.root, { brandId: 'other-brand', profile: 'design', label: 'cross brand' })
  const revoked = issueAgentToken(s.root, { brandId: 'pilito-mcp-deny', profile: 'design', label: 'revoked' })
  revokeAgentToken(s.root, revoked.record.id)
  for (const bad of [other.token, revoked.token]) {
    const run = spawnSync(NODE, tsxArgs('scripts/mcp.ts'), { cwd: s.root, env: env({ BRAND_OS_AGENT_TOKEN: bad }), input: '', encoding: 'utf8', timeout: 60_000 })
    assert.equal(run.status, 1)
    assert.equal(run.stderr.includes(bad), false)
    assert.equal(run.stdout.includes('Pilito'), false)
  }

  // A forged role, token, brand or audience argument is not part of the schema and changes nothing.
  const { token } = issueAgentToken(s.root, { brandId: 'pilito-mcp-deny', profile: 'design', label: 'forge test' })
  const agent = await session(s.root, token)
  try {
    const plain = pack(await agent.call({ task_type: 'visual_design' }), 'plain')
    const forged = pack(
      await agent.call({ task_type: 'visual_design', role: 'owner', token: 'bos_at_forged', brand_id: 'other-brand', audience: 'restricted', profile: 'internal-read', include_unapproved: true }),
      'forged',
    )
    assert.equal(forged.brand_id, 'pilito-mcp-deny')
    assert.equal(forged.digests.context_sha256, plain.digests.context_sha256)
  } finally {
    await agent.close()
  }
})

test('profiles stay separate over MCP: a design token gets no paid strategy, an ads token does', async () => {
  const s = await brand('pilito-mcp-paid')
  const ads = proposeRevision(s.ws, { strategy_id: 'ads-main', proposal: adsProposal(s.research) }).revision
  approveRevision(s.ws, { strategy_id: 'ads-main', revision: ads.revision, expected_sha256: ads.content_sha256, proof: s.proof })

  const design = issueAgentToken(s.root, { brandId: 'pilito-mcp-paid', profile: 'design', label: 'design' })
  const designer = await session(s.root, design.token)
  try {
    const data = pack(await designer.call({ task_type: 'paid_campaign_brief' }), 'paid under design')
    assert.equal(data.missing.find((entry) => entry.id === 'strategy.paid_media')?.reason, 'not_authorized')
    assert.equal(items(data, 'strategy.paid_media')[0]?.state, 'withheld')
    assert.notEqual(data.readiness, 'ready')
  } finally {
    await designer.close()
  }

  const adsToken = issueAgentToken(s.root, { brandId: 'pilito-mcp-paid', profile: 'strategy-ads-read', label: 'ads' })
  const marketer = await session(s.root, adsToken.token)
  try {
    const data = pack(await marketer.call({ task_type: 'paid_campaign_brief', deliverable_count: 3 }), 'paid under ads')
    const strategy = items(data, 'strategy.paid_media')
    assert.equal(strategy.length, 1)
    assert.equal(strategy[0]?.source_revision, ads.content_sha256)
    assert.ok(data.redacted.includes('strategy:ads-main.restricted.budget'))
    assert.equal(data.permissions.spend, false)
    // The content strategy of the same brand is not reachable from an ads token.
    assert.equal(items(data, 'strategy.content').length, 0)
  } finally {
    await marketer.close()
  }
})

test('an unclear request asks for task_type, and out-of-range input is refused by the schema', async () => {
  const s = await brand('pilito-mcp-vague')
  const { token } = issueAgentToken(s.root, { brandId: 'pilito-mcp-vague', profile: 'content-read', label: 'vague' })
  const agent = await session(s.root, token)
  try {
    const vague = await agent.call({ request: 'make something nice for us' })
    assert.equal(vague.status, 'need_task_type')
    assert.equal(vague.data, null)
    assert.deepEqual(vague.authorizes, [])
    assert.match(String(vague.reason), /: task_type visual_design\|social_batch\|/)
    assert.equal(JSON.stringify(vague).includes('make something nice'), false)

    // An explicit task_type wins over the classifier.
    const explicit = pack(await agent.call({ request: FA_REQUEST, task_type: 'website_design' }), 'explicit')
    assert.equal(explicit.task.type, 'website_design')

    for (const args of [{ task_type: 'publish_now' }, { task_type: 'social_batch', deliverable_count: 51 }, { task_type: 'social_batch', locale: 'de' }, { request: 'x'.repeat(501) }]) {
      const result = (await agent.raw.callTool({ name: 'task_context', arguments: args })) as { isError?: boolean }
      assert.equal(result.isError, true, JSON.stringify(args).slice(0, 80))
    }
  } finally {
    await agent.close()
  }
})

test('runTaskContextTool checks access before it classifies, for the CLI and MCP alike', async () => {
  const s = await brand('pilito-mcp-unit')
  const guest = runTaskContextTool(s.engine, { principal_id: 'anonymous', role: 'guest', brand_id: 'pilito-mcp-unit', audience: 'public', scopes: [] }, { request: 'make something nice' })
  assert.equal(guest.status, 'denied')
  const { token } = issueAgentToken(s.root, { brandId: 'pilito-mcp-unit', profile: 'content-read', label: 'unit' })
  const ctx = resolveAgentContext(s.root, 'pilito-mcp-unit', token)
  const cli = runTaskContextTool(s.engine, ctx, { request: 'make something nice' }, { taskTypeHint: '--task-type' })
  assert.equal(cli.status, 'need_task_type')
  assert.match(String(cli.reason), /--task-type/)
  const counted = runTaskContextTool(s.engine, ctx, { request: FA_REQUEST, deliverable_count: '4' })
  assert.equal(counted.status, 'ok')
  assert.equal(counted.status === 'ok' ? counted.data?.task.deliverable_count : null, 4, 'an explicit count wins over the request')
  // With no locale given, the pack speaks the language of the request; an explicit locale still wins.
  assert.equal(counted.status === 'ok' ? counted.data?.task.locale : null, 'fa', 'a Persian request gets a Persian pack')
  const explicit = runTaskContextTool(s.engine, ctx, { request: FA_REQUEST, locale: 'en' })
  assert.equal(explicit.status === 'ok' ? explicit.data?.task.locale : null, 'en', 'an explicit locale wins over the request')
  const english = runTaskContextTool(s.engine, ctx, { request: 'make 10 instagram posts' })
  assert.equal(english.status === 'ok' ? english.data?.task.locale : null, 'en')
})
