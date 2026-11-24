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
  AGENT_PROFILES,
  guestContext,
  issueAgentToken,
  operatorContext,
  readAccessLog,
  shareNote,
  type AgentProfile,
  type Visibility,
} from '@brand-os/brand-core'
import {
  addVariant,
  agentView,
  approvePreference,
  createProject,
  creativeContext,
  recordFeedback,
  runCreativeContextTool,
  selectVariant,
  suggestPreference,
  type AgentCreativeContext,
  type CreativeContext,
} from '@brand-os/brand-core/creative'
import { APPROVED_VISION, DRAFT_VISION_CANARY, pilitoBrand } from './helpers/creative.js'
import { TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'

/**
 * Sprint 2 item 1: the read-only creative_context MCP tool behind the creative-read profile.
 * Refusals (profile, brand, drafts, local note text, secrets), the access log, and the stdio server.
 */
useTestKey()
const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')
const PRIVATE: Visibility = { state: 'private', repository: 'acme/pilito', detail: 'test' }

const LOCAL_CANARY = 'LOCAL-FEEDBACK-CANARY خیلی بچگانه است'
const SHARED_WORDS = 'SHARED-FEEDBACK-WORDS زاویه‌ی دوربین خوب است'
const DRAFT_CANARY = 'DRAFT-PREFERENCE-CANARY bright neon'
const OLD_CANARY = 'SUPERSEDED-PREFERENCE-CANARY static camera'

/** B rejected (local note), E liked and selected (note shared), one approved preference, one draft, one superseded. */
function seeded(slug = 'pilito') {
  const brand = pilitoBrand(slug)
  const { ws, proof } = brand
  createProject(ws, { project_id: 'pilito-reel-1', title: 'Intro reels', surface: 'reel', series: 'onboarding', language: 'fa' })
  for (const v of ['B', 'E']) addVariant(ws, { project_id: 'pilito-reel-1', variant_id: v, asset: 'missing' })
  const b = recordFeedback(ws, { project_id: 'pilito-reel-1', variant_id: 'B', text: LOCAL_CANARY, verdict: 'reject', avoid: ['tone'] })
  const e = recordFeedback(ws, { project_id: 'pilito-reel-1', variant_id: 'E', text: SHARED_WORDS, verdict: 'like', keep: ['camera_angle'] })
  selectVariant(ws, { project_id: 'pilito-reel-1', variant_id: 'E' })
  const old = suggestPreference(ws, { project_id: 'pilito-reel-1', statement: OLD_CANARY, sources: [b.note.id] })
  approvePreference(ws, { preference_id: old.preference_id, proof, scope: 'series' })
  const current = suggestPreference(ws, { project_id: 'pilito-reel-1', statement: 'Use dynamic camera angles on onboarding reels', sources: [e.note.id], supersedes: old.preference_id })
  approvePreference(ws, { preference_id: current.preference_id, proof, scope: 'series' })
  const draft = suggestPreference(ws, { project_id: 'pilito-reel-1', statement: DRAFT_CANARY, sources: [e.note.id] })
  return { ...brand, b, e, old, current, draft }
}

function shareE(s: ReturnType<typeof seeded>) {
  shareNote(s.ws, s.e.note.id, { visibility: PRIVATE, dryRun: false, expectedRevision: s.e.note.revision })
}

const reader = (slug = 'pilito') => agentTokenContext(slug, 'agt_creative', 'creative-read')

test('creative_context answers only a creative-read token of this brand; everyone else is denied and logged', () => {
  const s = seeded()
  const denied = [
    guestContext('pilito'),
    agentContext('pilito'),
    operatorContext('pilito'),
    ...(Object.keys(AGENT_PROFILES) as AgentProfile[]).filter((p) => p !== 'creative-read').map((p) => agentTokenContext('pilito', `agt_${p}`, p)),
    agentTokenContext('northwind', 'agt_x', 'creative-read'),
  ]
  for (const ctx of denied) {
    const result = runCreativeContextTool(s.engine, ctx, { project_id: 'pilito-reel-1' })
    assert.equal(result.status, 'denied', ctx.principal_id)
    assert.equal(result.data, null)
    for (const canary of [LOCAL_CANARY, SHARED_WORDS, 'dynamic camera']) assert.ok(!JSON.stringify(result).includes(canary), `${ctx.principal_id} ${canary}`)
  }
  const log = readAccessLog(s.root).filter((line) => line.tool === 'creative_context')
  assert.equal(log.length, denied.length, 'one access-log line per denied call')
  assert.ok(log.every((line) => line.decision === 'deny' && line.returned_ids.length === 0))
  assert.equal(log.at(-1)!.reason, 'cross-brand')
})

test('a creative-read agent gets approved preferences and cited reasons only: no drafts, no superseded text, no local note text', () => {
  const s = seeded()
  const result = runCreativeContextTool(s.engine, reader(), { surface: 'reel', series: 'onboarding' })
  assert.equal(result.status, 'ok')
  const data = result.data!
  const text = JSON.stringify(result)
  assert.deepEqual(data.preferences.map((p) => p.preference_id), [s.current.preference_id])
  assert.equal(data.preferences[0]!.state, 'approved')
  assert.equal(data.preferences[0]!.supersedes, s.old.preference_id, 'the id of what was superseded is visible, not its text')
  // The draft is project-scoped (suggest default), so a series target does not even count it.
  assert.deepEqual(data.withheld.preferences, { draft: 0, superseded: 1, needs_review: 0, invalid_approval: 0 })
  const forProject = runCreativeContextTool(s.engine, reader(), { project_id: 'pilito-reel-1' }).data!
  assert.deepEqual(forProject.withheld.preferences, { draft: 1, superseded: 1, needs_review: 0, invalid_approval: 0 })
  assert.ok(!JSON.stringify(forProject).includes(DRAFT_CANARY))
  for (const canary of [DRAFT_CANARY, OLD_CANARY, LOCAL_CANARY, SHARED_WORDS, DRAFT_VISION_CANARY]) assert.ok(!text.includes(canary), canary)
  // Brand rules come through the agent's own profile (design modules): approved facts, never drafts.
  assert.ok(data.brand_rules.items.some((item) => item.value === APPROVED_VISION))
  // Reasons keep the structure (verdict, aspects, provenance) but not local note text.
  const b = data.references.find((ref) => ref.variant_id === 'B')!
  assert.equal(b.role, 'rejected')
  assert.deepEqual(b.reasons[0]!.avoid, ['tone'])
  assert.match(b.reasons[0]!.provenance, /^knowledge:kn_[0-9a-f-]+@[0-9a-f]{64}$/)
  assert.equal(b.reasons[0]!.quote, null)
  assert.equal(b.reasons[0]!.quote_withheld, 'local_note')
  const e = data.references.find((ref) => ref.variant_id === 'E')!
  assert.equal(e.role, 'selected')
  assert.equal(e.reasons[0]!.quote_withheld, 'local_note')
  // Explicit non-authority.
  assert.equal(data.performance, 'not_measured')
  assert.deepEqual(data.authorizes, [])
  assert.equal(data.execute_permission, false)
  assert.equal(data.publication_permission, false)
  assert.ok(!/best|performed|ctr/i.test(JSON.stringify(data.references)))
  // The owner's own CLI context still sees everything (the agent view is a projection, not a change).
  const owner = creativeContext(s.ws, s.engine, { surface: 'reel', series: 'onboarding' })
  assert.ok(JSON.stringify(owner).includes(LOCAL_CANARY))
})

test('a shared feedback note is quoted to the agent; the local one stays withheld', () => {
  const s = seeded()
  shareE(s)
  const data = runCreativeContextTool(s.engine, reader(), { project_id: 'pilito-reel-1' }).data!
  const e = data.references.find((ref) => ref.variant_id === 'E')!
  assert.equal(e.reasons[0]!.quote_withheld, null)
  assert.equal(e.reasons[0]!.quote, SHARED_WORDS)
  const b = data.references.find((ref) => ref.variant_id === 'B')!
  assert.equal(b.reasons[0]!.quote, null)
  assert.ok(!JSON.stringify(data).includes(LOCAL_CANARY))
})

test('agentView withholds secret-looking text even from shared notes and labels', () => {
  const s = seeded()
  shareE(s)
  const owner = creativeContext(s.ws, s.engine, { project_id: 'pilito-reel-1' })
  const secret = `api_key = sk-live_${'ABCDEFGH'.repeat(3)}`
  const tampered: CreativeContext = JSON.parse(JSON.stringify(owner)) as CreativeContext
  const e = tampered.references.find((ref) => ref.variant_id === 'E')!
  e.reasons[0]!.quote = secret
  e.describe = secret
  tampered.preferences.applied[0]!.context = secret
  tampered.inspirations.push({ project_id: 'pilito-reel-1', provenance: 'knowledge:kn_x@y', source_state: 'current', note_scope: 'shared', title: secret, rights: 'unknown', reuse: 'do_not_copy' })
  const view: AgentCreativeContext = agentView(tampered)
  assert.ok(!JSON.stringify(view).includes('sk-live_'))
  const ve = view.references.find((ref) => ref.variant_id === 'E')!
  assert.equal(ve.reasons[0]!.quote_withheld, 'unsafe')
  assert.equal(ve.describe, null)
  assert.equal(view.preferences.length, 0, 'a preference whose text looks like a secret is not served')
  assert.equal(view.inspirations.at(-1)!.title, null)
})

test('invalid arguments, unknown projects and another brand’s copied records are refused and logged', () => {
  const s = seeded()
  const ctx = reader()
  for (const args of [{ project_id: '../../etc/passwd' }, { surface: 'billboard', series: 'onboarding' }, { surface: 'reel', series: 'Bad Series!' }, {}]) {
    const result = runCreativeContextTool(s.engine, ctx, args)
    assert.equal(result.status, 'invalid', JSON.stringify(args))
  }
  assert.equal(runCreativeContextTool(s.engine, ctx, { project_id: 'no-such-project' }).status, 'not_found')
  // A misplaced copy of another brand's creative records is never read.
  const other = pilitoBrand('other-brand')
  fs.cpSync(path.join(s.root, 'brand/.private/creative'), path.join(other.root, 'brand/.private/creative'), { recursive: true })
  const crossCtx = reader('other-brand')
  assert.equal(runCreativeContextTool(other.engine, crossCtx, { project_id: 'pilito-reel-1' }).status, 'not_found')
  const series = runCreativeContextTool(other.engine, crossCtx, { surface: 'reel', series: 'onboarding' })
  assert.equal(series.status, 'ok')
  assert.deepEqual(series.data!.preferences, [])
  assert.deepEqual(series.data!.references, [])
  const log = readAccessLog(s.root).filter((line) => line.tool === 'creative_context')
  assert.equal(log.length, 5)
  assert.deepEqual(log.slice(0, 4).map((line) => line.decision), ['deny', 'deny', 'deny', 'deny'])
  assert.equal(log[0]!.requested_ids.length, 0, 'a path-like argument is never logged as an id')
  assert.equal(log[4]!.reason, 'not_found')
})

test('every allowed call appends one access-log line with ids only, never note text or statements', () => {
  const s = seeded()
  shareE(s)
  runCreativeContextTool(s.engine, reader(), { project_id: 'pilito-reel-1' })
  runCreativeContextTool(s.engine, reader(), { surface: 'reel', series: 'onboarding' })
  const lines = readAccessLog(s.root).filter((line) => line.tool === 'creative_context')
  assert.equal(lines.length, 2)
  const [first] = lines
  assert.equal(first!.decision, 'allow')
  assert.equal(first!.profile, 'creative-read')
  assert.equal(first!.principal, 'agent-token:agt_creative')
  assert.equal(first!.kind, 'creative')
  assert.deepEqual(first!.requested_ids, ['pilito-reel-1'])
  assert.ok(first!.returned_ids.includes(s.current.preference_id))
  assert.ok(first!.returned_ids.includes('pilito-reel-1/E'))
  assert.ok(first!.returned_ids.includes(s.e.note.id), 'a quoted shared note is listed as returned')
  assert.ok(first!.withheld_ids.includes(s.draft.preference_id))
  assert.ok(first!.withheld_ids.includes(s.old.preference_id))
  assert.ok(first!.withheld_ids.includes(s.b.note.id), 'a withheld local note is listed by id')
  const raw = fs.readFileSync(accessLogPath(s.root), 'utf8')
  for (const canary of [LOCAL_CANARY, SHARED_WORDS, DRAFT_CANARY, 'dynamic camera']) assert.ok(!raw.includes(canary), canary)
  assert.equal(fs.statSync(accessLogPath(s.root)).mode & 0o077, 0, 'the access log is owner-only')
})

test('over MCP stdio: creative_context is listed and read-only; creative-read is answered, design and guest are denied, arguments cannot raise privilege', async () => {
  const s = seeded()
  const env = (token?: string) => {
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) if (typeof value === 'string' && key !== 'BRAND_OS_AGENT_TOKEN' && key !== 'BRAND_OS_APPROVAL_PROOF') out[key] = value
    out.BRAND_OS_DATA_KEY = TEST_DATA_KEY
    if (token) out.BRAND_OS_AGENT_TOKEN = token
    return out
  }
  const connect = async (token?: string) => {
    const client = new Client({ name: 'creative-test', version: '0.0.1' })
    await client.connect(new StdioClientTransport({ command: tsx, args: [path.join(repo, 'scripts/mcp.ts')], cwd: s.root, env: env(token), stderr: 'pipe' }))
    return client
  }
  const parse = (result: unknown) => JSON.parse((result as { content: Array<{ text: string }> }).content[0]!.text) as { status: string; data: AgentCreativeContext | null }
  const creativeToken = issueAgentToken(s.root, { brandId: 'pilito', profile: 'creative-read', label: 'design agent' })
  const designToken = issueAgentToken(s.root, { brandId: 'pilito', profile: 'design', label: 'facts' })

  const client = await connect(creativeToken.token)
  try {
    const names = (await client.listTools()).tools.map((tool) => tool.name)
    assert.ok(names.includes('creative_context'))
    assert.ok(!names.some((name) => /^creative_/.test(name) && name !== 'creative_context'), 'one creative tool, no writes')
    const ok = parse(await client.callTool({ name: 'creative_context', arguments: { project_id: 'pilito-reel-1' } }))
    assert.equal(ok.status, 'ok')
    assert.equal(ok.data!.preferences[0]!.preference_id, s.current.preference_id)
    const sneaky = parse(await client.callTool({ name: 'creative_context', arguments: { project_id: 'pilito-reel-1', role: 'owner', profile: 'internal-read', include_drafts: true, brand_id: 'northwind' } as Record<string, unknown> }))
    assert.equal(sneaky.status, 'ok')
    const text = JSON.stringify(sneaky)
    for (const canary of [DRAFT_CANARY, LOCAL_CANARY]) assert.ok(!text.includes(canary), `extra arguments grant nothing: ${canary}`)
  } finally {
    await client.close()
  }
  for (const token of [designToken.token, undefined]) {
    const other = await connect(token)
    try {
      assert.equal(parse(await other.callTool({ name: 'creative_context', arguments: { project_id: 'pilito-reel-1' } })).status, 'denied')
    } finally {
      await other.close()
    }
  }
  const lines = readAccessLog(s.root).filter((line) => line.tool === 'creative_context')
  assert.deepEqual(lines.map((line) => line.decision), ['allow', 'allow', 'deny', 'deny'])
})
