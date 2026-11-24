import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { accessLogPath, agentTokenContext, editNote, findNote, guestContext, issueAgentToken, operatorContext, readAccessLog, type AuthContext } from '@brand-os/brand-core'
import {
  approveRevision,
  proposeRevision,
  runStrategyTool,
  STRATEGY_FEED_SCHEMA,
  verifyFeedDocument,
  withdrawRevision,
  type StrategyFeedDocument,
  type StrategyListItem,
  type StrategyToolArgs,
  type StrategyToolResult,
} from '@brand-os/brand-core/strategy'
import { TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'
import { adsProposal, BUDGET_CANARY, DRAFT_CANARY, NOW, RESTRICTED_NOTE_CANARY, seoProposal, strategyBrand, type StrategyBrand } from './helpers/strategy.js'

/**
 * Spec Sprint 3 gate: an approved v1 is consumable by a local mock Ads/SEO agent; v2 stays invisible until the owner
 * approves it; no drafts or cross-brand reads. Plus redaction, stable digests, stale-pin refusal, tamper, expiry,
 * the access log, the stdio MCP server and brand:query through the same gate.
 */
useTestKey()

const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')

const seoCtx = (brand = 'pilito'): AuthContext => agentTokenContext(brand, 'agt_seo', 'strategy-seo-read')
const adsCtx = (brand = 'pilito'): AuthContext => agentTokenContext(brand, 'agt_ads', 'strategy-ads-read')

function call(s: StrategyBrand, ctx: AuthContext, tool: 'strategy_list' | 'strategy_get', args: StrategyToolArgs = {}, now: Date = NOW): StrategyToolResult {
  return runStrategyTool(s.root, s.ws.brandSlug, ctx, tool, args, now)
}
const listOf = (result: StrategyToolResult) => (result.data as { strategies: StrategyListItem[]; withheld: Record<string, number> })
const docOf = (result: StrategyToolResult) => result.data as StrategyFeedDocument

function approve(s: StrategyBrand, id: string, revision: number, sha: string) {
  return approveRevision(s.ws, { strategy_id: id, revision, expected_sha256: sha, proof: s.proof })
}

function noCanaries(value: unknown, label: string): void {
  const json = JSON.stringify(value)
  for (const canary of [String(BUDGET_CANARY), RESTRICTED_NOTE_CANARY, DRAFT_CANARY]) assert.ok(!json.includes(canary), `${label}: ${canary} must not leak`)
}

test('gate: v1 approved is served to the SEO agent; v2 stays invisible until approved; then v1 pins are refused as stale', async () => {
  const s = await strategyBrand()
  const v1 = proposeRevision(s.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(s.research) })

  // Before approval: nothing is served, the draft is only counted.
  const before = call(s, seoCtx(), 'strategy_list')
  assert.equal(before.status, 'ok')
  assert.deepEqual(listOf(before), { strategies: [], withheld: { draft: 1 } })
  assert.equal(call(s, seoCtx(), 'strategy_get', { strategy_id: 'seo-discovery' }).status, 'not_found')

  approve(s, 'seo-discovery', 1, v1.revision.content_sha256)
  const listed = listOf(call(s, seoCtx(), 'strategy_list'))
  assert.deepEqual(listed.strategies.map((item) => [item.strategy_id, item.revision, item.status, item.content_sha256]), [['seo-discovery', 1, 'current', v1.revision.content_sha256]])
  const got = call(s, seoCtx(), 'strategy_get', { strategy_id: 'seo-discovery' })
  assert.equal(got.status, 'ok')
  const doc = docOf(got)
  assert.equal(doc.schema, STRATEGY_FEED_SCHEMA)
  assert.deepEqual([doc.revision, doc.type, doc.agent_kind, doc.status], [1, 'seo', 'seo', 'current'])
  assert.equal(doc.digests.content_sha256, v1.revision.content_sha256)
  assert.match(doc.digests.approval_digest, /^[0-9a-f]{64}$/)
  assert.match(doc.digests.source_sha256, /^[0-9a-f]{64}$/)
  assert.ok(verifyFeedDocument(doc), 'feed_sha256 verifies')
  assert.ok(!verifyFeedDocument({ ...doc, must_not_do: [] }), 'an altered document does not verify')
  // Stable: the same revision read twice is byte-identical.
  assert.equal(JSON.stringify(docOf(call(s, seoCtx(), 'strategy_get', { strategy_id: 'seo-discovery' }))), JSON.stringify(doc))
  // Redaction and explicit missing fields; no permission granted.
  noCanaries(got, 'approved v1')
  assert.ok(!('restricted' in doc))
  assert.deepEqual(doc.redacted.filter((item) => item.reason === 'restricted').map((item) => item.field), ['restricted.budget', 'restricted.notes'])
  assert.ok(doc.missing.includes('success_metrics[qualified_organic_sessions].baseline'))
  assert.deepEqual([doc.authorizes, doc.execute_permission, doc.spend_permission, doc.publication_permission], [[], false, false, false])
  assert.deepEqual(got.authorizes, [])
  assert.ok(doc.sources.research.every((ref) => /^knowledge:kn_[a-z0-9-]+@[0-9a-f]{64}$/.test(ref)))
  assert.deepEqual(doc.sources.facts.map((ref) => ref.id), ['business.marketing.objective', 'business.market.geography'])

  // v2 proposed with a canary: the feed still serves v1 and never shows v2.
  const v2 = proposeRevision(s.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(s.research, { title: DRAFT_CANARY }) })
  for (const result of [call(s, seoCtx(), 'strategy_list'), call(s, seoCtx(), 'strategy_get', { strategy_id: 'seo-discovery' })]) noCanaries(result, 'while v2 is a draft')
  assert.equal(docOf(call(s, seoCtx(), 'strategy_get', { strategy_id: 'seo-discovery' })).revision, 1)
  const pinV1 = { revision: 1, content_sha256: v1.revision.content_sha256 }
  assert.equal(call(s, seoCtx(), 'strategy_get', { strategy_id: 'seo-discovery', pin: pinV1 }).status, 'ok')
  // A pin to the draft reveals nothing about it.
  const draftPin = call(s, seoCtx(), 'strategy_get', { strategy_id: 'seo-discovery', pin: { revision: 2 } })
  assert.equal(draftPin.status, 'stale_pin')
  assert.equal(draftPin.stale!.pinned_state, 'unknown')
  assert.deepEqual(draftPin.stale!.current, pinV1)
  assert.equal(draftPin.data, null)
  noCanaries(draftPin, 'draft pin')

  // The owner approves v2: it is served, and a v1 pin is refused with a typed stale result and no content.
  approve(s, 'seo-discovery', 2, v2.revision.content_sha256)
  const now2 = docOf(call(s, seoCtx(), 'strategy_get', { strategy_id: 'seo-discovery' }))
  assert.deepEqual([now2.revision, now2.supersedes_revision, now2.title], [2, 1, DRAFT_CANARY])
  const stale = call(s, seoCtx(), 'strategy_get', { strategy_id: 'seo-discovery', pin: pinV1 })
  assert.equal(stale.status, 'stale_pin')
  assert.deepEqual(stale.stale, { pinned: pinV1, current: { revision: 2, content_sha256: v2.revision.content_sha256 }, pinned_state: 'superseded' })
  assert.equal(stale.data, null)
  assert.equal(call(s, seoCtx(), 'strategy_get', { strategy_id: 'seo-discovery', pin: { content_sha256: v1.revision.content_sha256 } }).status, 'stale_pin', 'a hash-only pin is checked too')

  // Withdrawal: nothing is served and v1 is not restored.
  withdrawRevision(s.ws, { strategy_id: 'seo-discovery', revision: 2, reason: 'Market changed', proof: s.proof })
  assert.equal(call(s, seoCtx(), 'strategy_get', { strategy_id: 'seo-discovery' }).status, 'not_found')
  assert.deepEqual(listOf(call(s, seoCtx(), 'strategy_list')), { strategies: [], withheld: { withdrawn: 1 } })
  const pinV2 = call(s, seoCtx(), 'strategy_get', { strategy_id: 'seo-discovery', pin: { revision: 2, content_sha256: v2.revision.content_sha256 } })
  assert.deepEqual([pinV2.status, pinV2.stale!.pinned_state, pinV2.stale!.current], ['stale_pin', 'withdrawn', null])
})

test('gate: one slice per agent kind; guests, other profiles, the owner process and another brand are denied', async () => {
  const s = await strategyBrand()
  const seo = proposeRevision(s.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(s.research) })
  const ads = proposeRevision(s.ws, {
    strategy_id: 'paid-social-test',
    proposal: adsProposal(s.research, {
      recommendations: [
        { id: 'p1', priority: 'high', action: 'Run a two-week creative test with three onboarding reels', rationale: 'Learn which hook works first.', agent_kinds: ['ads'], evidence_refs: [], fact_refs: [] },
        { id: 'p2', priority: 'low', action: 'Mirror the winning hook in guide titles', rationale: 'Shared message.', agent_kinds: ['ads', 'seo'], evidence_refs: [], fact_refs: [] },
        { id: 'p3', priority: 'low', action: 'Keep a glossary for reel captions', rationale: 'SEO only.', agent_kinds: ['seo'], evidence_refs: [], fact_refs: [] },
      ],
    }),
  })
  approve(s, 'seo-discovery', 1, seo.revision.content_sha256)
  approve(s, 'paid-social-test', 1, ads.revision.content_sha256)

  assert.deepEqual(listOf(call(s, seoCtx(), 'strategy_list')).strategies.map((item) => item.strategy_id), ['seo-discovery'])
  assert.deepEqual(listOf(call(s, adsCtx(), 'strategy_list')).strategies.map((item) => item.strategy_id), ['paid-social-test'])
  assert.equal(call(s, adsCtx(), 'strategy_get', { strategy_id: 'seo-discovery' }).status, 'not_found', 'the Ads agent cannot read the SEO strategy')
  assert.equal(call(s, seoCtx(), 'strategy_get', { strategy_id: 'paid-social-test' }).status, 'not_found', 'the SEO agent cannot read the paid-media strategy')
  const adsDoc = docOf(call(s, adsCtx(), 'strategy_get', { strategy_id: 'paid-social-test' }))
  assert.deepEqual(adsDoc.recommendations.map((rec) => rec.id), ['p1', 'p2'])
  assert.ok(adsDoc.redacted.some((item) => item.field === 'recommendations[p3]' && item.reason === 'other_agent_kind'))
  noCanaries(adsDoc, 'ads slice')
  assert.ok(!JSON.stringify(adsDoc).includes('EUR'), 'no currency from the restricted budget')

  const marketing = agentTokenContext('pilito', 'agt_m', 'marketing')
  const unprofiled: AuthContext = { ...seoCtx(), profile: undefined }
  for (const ctx of [guestContext('pilito'), marketing, agentTokenContext('pilito', 'agt_k', 'internal-read'), unprofiled, operatorContext('pilito'), seoCtx('northwind')]) {
    for (const tool of ['strategy_list', 'strategy_get'] as const) {
      const result = call(s, ctx, tool, { strategy_id: 'seo-discovery' })
      assert.equal(result.status, 'denied', `${ctx.principal_id} ${ctx.profile ?? ctx.role} ${ctx.brand_id} ${tool}`)
      assert.equal(result.data, null)
    }
  }
  // Arguments cannot select anything else.
  assert.equal(call(s, seoCtx(), 'strategy_get', { strategy_id: '../paid-social-test' }).status, 'invalid')
  assert.equal(call(s, seoCtx(), 'strategy_get', { strategy_id: 'seo-discovery', pin: { revision: 'latest' } }).status, 'invalid')
  assert.equal(call(s, seoCtx(), 'strategy_get', {}).status, 'invalid')
  const sneaky = runStrategyTool(s.root, s.ws.brandSlug, seoCtx(), 'strategy_get', { strategy_id: 'paid-social-test', role: 'owner', profile: 'strategy-ads-read', brand_id: 'pilito', include_drafts: true } as StrategyToolArgs, NOW)
  assert.equal(sneaky.status, 'not_found')

  // Every call is logged with ids only; the log never holds a value.
  const lines = readAccessLog(s.root).filter((line) => line.tool.startsWith('strategy_'))
  assert.ok(lines.some((line) => line.decision === 'allow' && line.returned_ids.includes('seo-discovery:1')))
  assert.ok(lines.some((line) => line.decision === 'deny' && line.reason === 'cross-brand'))
  assert.ok(lines.filter((line) => line.decision === 'allow' && line.tool === 'strategy_get').every((line) => line.withheld_ids.some((id) => id.endsWith(':restricted.budget'))))
  const raw = fs.readFileSync(accessLogPath(s.root), 'utf8')
  for (const canary of [String(BUDGET_CANARY), RESTRICTED_NOTE_CANARY, 'two-week creative test']) assert.ok(!raw.includes(canary), canary)
})

test('gate: a copied record of another brand, edited bytes, a forged approval, expiry and a changed source are never served', async () => {
  const s = await strategyBrand()
  const v1 = proposeRevision(s.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(s.research) })
  approve(s, 'seo-discovery', 1, v1.revision.content_sha256)

  // Cross-brand: pilito's records copied into northwind's private folder are not read there.
  const other = await strategyBrand('northwind')
  fs.cpSync(path.join(s.root, 'brand/.private/strategy'), path.join(other.root, 'brand/.private/strategy'), { recursive: true })
  assert.deepEqual(listOf(call(other, seoCtx('northwind'), 'strategy_list')).strategies, [])
  assert.equal(call(other, seoCtx('northwind'), 'strategy_get', { strategy_id: 'seo-discovery' }).status, 'not_found')
  assert.equal(call(s, seoCtx('northwind'), 'strategy_get', { strategy_id: 'seo-discovery' }).status, 'denied', 'a northwind token is denied at pilito')

  // Dates: review_due is still served (labelled); expired and not-yet-valid are not.
  const reviewDue = docOf(call(s, seoCtx(), 'strategy_get', { strategy_id: 'seo-discovery' }, new Date('2027-04-15T00:00:00Z')))
  assert.equal(reviewDue.status, 'review_due')
  assert.equal(call(s, seoCtx(), 'strategy_get', { strategy_id: 'seo-discovery' }, new Date('2027-07-01T00:00:00Z')).status, 'not_found')
  assert.deepEqual(listOf(call(s, seoCtx(), 'strategy_list', {}, new Date('2027-07-01T00:00:00Z'))).withheld, { expired: 1 })
  assert.deepEqual(listOf(call(s, seoCtx(), 'strategy_list', {}, new Date('2026-10-01T00:00:00Z'))).withheld, { not_yet_valid: 1 })

  // A cited research note edited after approval: needs_review, not served.
  const note = findNote(s.ws, v1.revision.content.evidence_refs[0]!.note_id)
  editNote(s.ws, note.id, { expectedRevision: note.revision, ops: [{ op: 'set', add_tags: ['reviewed'] }] })
  assert.deepEqual(listOf(call(s, seoCtx(), 'strategy_list')).withheld, { needs_review: 1 })

  // Edited approved bytes and a draft forced into the registry as approved: integrity_failed, not served.
  const t = await strategyBrand('tamper')
  const tv = proposeRevision(t.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(t.research) })
  approve(t, 'seo-discovery', 1, tv.revision.content_sha256)
  const revFile = path.join(t.root, 'brand/.private/strategy/records/seo-discovery/r0001.json')
  const original = fs.readFileSync(revFile, 'utf8')
  fs.writeFileSync(revFile, original.replace('Publish automatically', 'Publish everything now'))
  assert.equal(call(t, seoCtx('tamper'), 'strategy_get', { strategy_id: 'seo-discovery' }).status, 'not_found')
  assert.deepEqual(listOf(call(t, seoCtx('tamper'), 'strategy_list')).withheld, { integrity_failed: 1 })
  fs.writeFileSync(revFile, original)
  assert.equal(call(t, seoCtx('tamper'), 'strategy_get', { strategy_id: 'seo-discovery' }).status, 'ok')
  const draft = proposeRevision(t.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(t.research, { title: DRAFT_CANARY }) })
  const recFile = path.join(t.root, 'brand/.private/strategy/records/seo-discovery/record.json')
  const record = JSON.parse(fs.readFileSync(recFile, 'utf8')) as { revisions: Array<Record<string, unknown>> }
  record.revisions[0]!.state = 'superseded'
  record.revisions[1]!.state = 'approved'
  record.revisions[1]!.approval = { event_id: 'apv_forged', approved_at: NOW.toISOString(), actor: 'owner', digest: 'a'.repeat(64), seal: 'b'.repeat(64) }
  fs.writeFileSync(recFile, JSON.stringify(record))
  const forged = call(t, seoCtx('tamper'), 'strategy_get', { strategy_id: 'seo-discovery' })
  assert.equal(forged.status, 'not_found')
  noCanaries(forged, 'forged approval')
  assert.equal(draft.revision.revision, 2)
})

/** A local mock execution agent: reads its slice, checks digests and permissions, plans tasks, re-checks the pin before acting. */
async function mockAgent(client: Client, expectKind: 'seo' | 'ads'): Promise<{ strategy: string; revision: number; tasks: string[]; pin: { revision: number; content_sha256: string } }> {
  const parse = (result: unknown) => JSON.parse((result as { content: Array<{ text: string }> }).content[0]!.text) as StrategyToolResult
  const list = parse(await client.callTool({ name: 'strategy_list', arguments: {} }))
  assert.equal(list.status, 'ok', JSON.stringify(list))
  const item = listOf(list).strategies[0]!
  const pin = { revision: item.revision, content_sha256: item.content_sha256 }
  const got = parse(await client.callTool({ name: 'strategy_get', arguments: { strategy_id: item.strategy_id, pin } }))
  assert.equal(got.status, 'ok')
  const doc = docOf(got)
  assert.ok(verifyFeedDocument(doc))
  assert.equal(doc.agent_kind, expectKind)
  assert.equal(doc.spend_permission || doc.execute_permission || doc.publication_permission, false)
  const tasks = doc.recommendations.map((rec) => `[${rec.priority}] ${rec.action} (needs owner authorization to execute)`)
  // Before acting the agent re-reads with its pin; a replaced revision would come back stale_pin.
  assert.equal(parse(await client.callTool({ name: 'strategy_get', arguments: { strategy_id: item.strategy_id, pin } })).status, 'ok')
  return { strategy: item.strategy_id, revision: item.revision, tasks, pin }
}

test('gate over stdio MCP and brand:query: mock SEO and Ads agents consume approved v1; drafts, other kinds and other tokens get nothing', async () => {
  // Real clock: the MCP server and the CLI read the system time.
  const today = new Date()
  const iso = (days: number) => new Date(today.getTime() + days * 86_400_000).toISOString().slice(0, 10)
  const dates = { valid_from: iso(-1), valid_until: iso(200), review_due_at: iso(90) }
  const s = await strategyBrand('pilito', today)
  const seo = proposeRevision(s.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(s.research, dates) })
  const ads = proposeRevision(s.ws, { strategy_id: 'paid-social-test', proposal: adsProposal(s.research, dates) })
  approve(s, 'seo-discovery', 1, seo.revision.content_sha256)
  approve(s, 'paid-social-test', 1, ads.revision.content_sha256)
  proposeRevision(s.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(s.research, { ...dates, title: DRAFT_CANARY }) })

  const seoToken = issueAgentToken(s.root, { brandId: 'pilito', profile: 'strategy-seo-read', label: 'mock seo agent' }).token
  const adsToken = issueAgentToken(s.root, { brandId: 'pilito', profile: 'strategy-ads-read', label: 'mock ads agent' }).token
  const marketingToken = issueAgentToken(s.root, { brandId: 'pilito', profile: 'marketing', label: 'facts only' }).token
  const env = (token?: string) => {
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) if (typeof value === 'string' && key !== 'BRAND_OS_AGENT_TOKEN' && key !== 'BRAND_OS_APPROVAL_PROOF') out[key] = value
    out.BRAND_OS_DATA_KEY = TEST_DATA_KEY
    if (token) out.BRAND_OS_AGENT_TOKEN = token
    return out
  }
  const connect = async (token?: string) => {
    const client = new Client({ name: 'strategy-test', version: '0.0.1' })
    await client.connect(new StdioClientTransport({ command: tsx, args: [path.join(repo, 'scripts/mcp.ts')], cwd: s.root, env: env(token), stderr: 'pipe' }))
    return client
  }
  const parse = (result: unknown) => JSON.parse((result as { content: Array<{ text: string }> }).content[0]!.text) as StrategyToolResult

  const seoClient = await connect(seoToken)
  try {
    const names = (await seoClient.listTools()).tools.map((tool) => tool.name)
    assert.deepEqual(names.filter((name) => name.startsWith('strategy_')).sort(), ['strategy_get', 'strategy_list'], 'two read tools, no writes')
    const run = await mockAgent(seoClient, 'seo')
    assert.deepEqual([run.strategy, run.revision], ['seo-discovery', 1])
    assert.equal(run.tasks.length, 2)
    const sneaky = parse(await seoClient.callTool({ name: 'strategy_get', arguments: { strategy_id: 'paid-social-test', role: 'owner', brand_id: 'pilito', profile: 'strategy-ads-read' } as Record<string, unknown> }))
    assert.equal(sneaky.status, 'not_found', 'extra arguments grant nothing')
    noCanaries(parse(await seoClient.callTool({ name: 'strategy_get', arguments: { strategy_id: 'seo-discovery' } })), 'mcp seo')
  } finally {
    await seoClient.close()
  }
  const adsClient = await connect(adsToken)
  try {
    const run = await mockAgent(adsClient, 'ads')
    assert.deepEqual([run.strategy, run.revision, run.tasks.length], ['paid-social-test', 1, 1])
  } finally {
    await adsClient.close()
  }
  for (const token of [marketingToken, undefined]) {
    const other = await connect(token)
    try {
      for (const name of ['strategy_list', 'strategy_get']) assert.equal(parse(await other.callTool({ name, arguments: { strategy_id: 'seo-discovery' } })).status, 'denied')
    } finally {
      await other.close()
    }
  }

  // brand:query goes through the same gate.
  const query = (args: string[], token?: string) => {
    const result = spawnSync(tsx, [path.join(repo, 'scripts/brand.ts'), 'query', ...args], { cwd: s.root, encoding: 'utf8', env: env(token) })
    return { status: result.status, json: (() => { try { return JSON.parse(result.stdout) as StrategyToolResult } catch { return null } })(), stderr: result.stderr }
  }
  const viaQuery = query(['--tool', 'strategy_get', '--id', 'seo-discovery', '--pin-revision', '1', '--pin-sha', seo.revision.content_sha256], seoToken)
  assert.equal(viaQuery.status, 0, viaQuery.stderr)
  assert.equal(viaQuery.json!.status, 'ok')
  assert.equal(docOf(viaQuery.json!).revision, 1)
  noCanaries(viaQuery.json, 'brand:query')
  assert.equal(query(['--tool', 'strategy_get', '--id', 'seo-discovery', '--pin-revision', '2'], seoToken).json!.status, 'stale_pin')
  assert.equal(query(['--tool', 'strategy_list'], adsToken).json!.status, 'ok')
  assert.equal(query(['--tool', 'strategy_get', '--id', 'seo-discovery']).json!.status, 'denied', 'no token: guest')
  assert.equal(query(['--tool', 'strategy_get', '--id', 'seo-discovery'], marketingToken).json!.status, 'denied')
})
