import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import YAML from 'yaml'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import {
  allQuestions,
  applyInit,
  ensureApprovalSecret,
  getLogoRules,
  getMotionGuidelines,
  guestContext,
  InterviewEngine,
  issueAgentToken,
  NAMED_FACT_TOOL_IDS,
  resolveAgentContext,
  taskFields,
  writeStarterWorkspace,
  type AuthContext,
  type ToolResult,
} from '@brand-os/brand-core'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

/**
 * BUG-01: `get_logo_rules` and `get_motion_guidelines` asked for `brand.logo.primary`, `brand.logo.clearspace` and
 * `brand.motion.easing`, which no question owns, so both tools reported those fields missing even for a brand that had
 * answered and approved its logo and motion rules. These tests pin every id a named fact tool reads against the
 * question bank and the field registry, and check approved, draft, unanswered, guest and wrong-profile cases through
 * the core API and through the stdio MCP server.
 *
 * Fixtures are SYNTHETIC values in temporary directories. No real brand fact is touched.
 */
process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')

const repo = path.resolve(import.meta.dirname, '..')
const LEGACY_IDS = ['brand.logo.primary', 'brand.logo.clearspace', 'brand.motion.easing']

const MASTERS = 'SYNTH-MASTERS brand/assets/logo, SVG masters, versioned.'
const CLEAR_SPACE = 'SYNTH-CLEAR half the mark height on every side.'
const MISUSE = 'SYNTH-MISUSE never stretch, recolour or outline the mark.'
const PRINCIPLES = 'SYNTH-PRINCIPLES calm, purposeful, never bouncy.'
const DRAFT_MIN_SIZE = 'min-size: 24px; clear-space: 0.5x'
const DRAFT_REDUCED = 'SYNTH-DRAFT-REDUCED fade only.'

interface FactRow {
  id: string
  value: string | null
  missing?: true
  withheld?: true
  revision?: string
}
const facts = (result: ToolResult): FactRow[] => (result.data as { facts: FactRow[] }).facts
const row = (result: ToolResult, id: string): FactRow | undefined => facts(result).find((fact) => fact.id === id)

/** A private brand with some logo and motion rules approved, some only answered (draft) and some unanswered. */
function brand(slug = 'logo-brand'): { root: string; engine: InterviewEngine } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-named-ids-'))
  writeStarterWorkspace(root)
  applyInit(root, { name: 'Logo Brand', slug, industry: 'education', language: 'en', languages: ['en'], mascot: false, gamification: false, publish: 'private' })
  const engine = new InterviewEngine(root)
  const proof = ensureApprovalSecret(root)
  for (const [id, value] of [
    ['brand.logo.masters', MASTERS],
    ['brand.logo.clear_space', CLEAR_SPACE],
    ['brand.logo.misuse', MISUSE],
    ['brand.motion.principles', PRINCIPLES],
    ['brand.motion.duration', 'moderate'],
  ] as const) {
    assert.equal(engine.changeAnswer(id, value).kind, 'recorded', id)
    assert.equal(engine.approve(id, 'owner', proof).kind, 'recorded', id)
  }
  // Answered, never approved: these must stay out of every agent reply.
  assert.equal(engine.changeAnswer('brand.logo.min_size', DRAFT_MIN_SIZE).kind, 'recorded')
  assert.equal(engine.changeAnswer('brand.motion.reduced', DRAFT_REDUCED).kind, 'recorded')
  return { root, engine: new InterviewEngine(root) }
}

function agent(root: string, profile: 'design' | 'finance', slug = 'logo-brand'): { token: string; ctx: AuthContext } {
  const issued = issueAgentToken(root, { brandId: slug, profile, label: `${profile} named-tool test` })
  return { token: issued.token, ctx: resolveAgentContext(root, slug, issued.token) }
}

test('every id a named fact tool reads is an existing question and registry id', () => {
  const bank = new Set(allQuestions().map((question) => question.id))
  const registry = YAML.parse(fs.readFileSync(path.join(repo, 'brand/interview/field-registry.yaml'), 'utf8')) as { fields: Array<{ id: string }> }
  const fields = new Set(registry.fields.map((field) => field.id))
  for (const [tool, ids] of Object.entries(NAMED_FACT_TOOL_IDS)) {
    assert.ok(ids.length > 0, `${tool}: reads no ids`)
    assert.equal(new Set(ids).size, ids.length, `${tool}: duplicate id`)
    for (const id of ids) {
      assert.ok(bank.has(id), `${tool}: ${id} is not a question id`)
      assert.ok(fields.has(id), `${tool}: ${id} is not in brand/interview/field-registry.yaml`)
    }
  }
  // The ids that caused BUG-01 do not exist, and no named tool asks for them again.
  const referenced = new Set<string>(Object.values(NAMED_FACT_TOOL_IDS).flat())
  for (const id of LEGACY_IDS) {
    assert.ok(!bank.has(id), `${id} should still be absent from the bank`)
    assert.ok(!referenced.has(id), `${id} must not be requested`)
  }
})

test('logo and motion tools read the same ids as the Task Context logo_rules and motion_rules keys', () => {
  const byKey = new Map(taskFields({ personal: false, mascot: false }).map((field) => [field.key, field.fact_ids]))
  assert.deepEqual([...NAMED_FACT_TOOL_IDS.get_logo_rules], byKey.get('logo_rules'))
  assert.deepEqual([...NAMED_FACT_TOOL_IDS.get_motion_guidelines], byKey.get('motion_rules'))
})

test('get_logo_rules and get_motion_guidelines return approved values; drafts and unanswered fields stay missing', () => {
  const { root, engine } = brand()
  const { ctx } = agent(root, 'design')

  const logo = getLogoRules(engine, ctx)
  assert.equal(logo.tool, 'get_logo_rules')
  assert.notEqual(logo.status, 'denied')
  assert.deepEqual(facts(logo).map((fact) => fact.id), [...NAMED_FACT_TOOL_IDS.get_logo_rules])
  assert.equal(row(logo, 'brand.logo.masters')?.value, MASTERS)
  assert.equal(row(logo, 'brand.logo.clear_space')?.value, CLEAR_SPACE)
  assert.equal(row(logo, 'brand.logo.misuse')?.value, MISUSE)
  assert.ok(row(logo, 'brand.logo.masters')?.revision, 'approved facts carry a revision to cite')
  assert.deepEqual(row(logo, 'brand.logo.variants'), { id: 'brand.logo.variants', value: null, missing: true })
  assert.deepEqual(row(logo, 'brand.logo.min_size'), { id: 'brand.logo.min_size', value: null, missing: true })
  assert.equal(JSON.stringify(logo).includes(DRAFT_MIN_SIZE), false)
  // The master location is a rule string, never a logo file: the tool names no asset.
  assert.equal(JSON.stringify(logo).includes('asset_id'), false)

  const motion = getMotionGuidelines(engine, ctx)
  assert.deepEqual(facts(motion).map((fact) => fact.id), [...NAMED_FACT_TOOL_IDS.get_motion_guidelines])
  assert.equal(row(motion, 'brand.motion.principles')?.value, PRINCIPLES)
  assert.equal(row(motion, 'brand.motion.duration')?.value, 'moderate')
  assert.deepEqual(row(motion, 'brand.motion.reduced'), { id: 'brand.motion.reduced', value: null, missing: true })
  assert.equal(JSON.stringify(motion).includes(DRAFT_REDUCED), false)
})

test('a guest and a wrong-profile token get no logo or motion values', () => {
  const { root, engine } = brand()
  const values = [MASTERS, CLEAR_SPACE, MISUSE, PRINCIPLES]

  const guest = guestContext('logo-brand')
  for (const result of [getLogoRules(engine, guest), getMotionGuidelines(engine, guest), getLogoRules(engine), getMotionGuidelines(engine)]) {
    assert.equal(result.status, 'denied')
    assert.deepEqual(facts(result), [])
  }

  // finance covers business modules only; logo-system and motion are brand modules.
  const { ctx } = agent(root, 'finance')
  for (const result of [getLogoRules(engine, ctx), getMotionGuidelines(engine, ctx)]) {
    const json = JSON.stringify(result)
    for (const value of values) assert.equal(json.includes(value), false, `${result.tool}: ${value}`)
    for (const fact of facts(result)) assert.equal(fact.value, null, `${result.tool}: ${fact.id}`)
  }

  // A token of another brand is refused at resolution.
  const other = issueAgentToken(root, { brandId: 'other-brand', profile: 'design', label: 'cross brand' })
  assert.throws(() => resolveAgentContext(root, 'logo-brand', other.token))
})

test('the MCP get_logo_rules and get_motion_guidelines tools serve the canonical ids', async () => {
  const { root } = brand()
  const { token } = agent(root, 'design')
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && key !== 'BRAND_OS_AGENT_TOKEN' && key !== 'BRAND_OS_APPROVAL_PROOF') env[key] = value
  }
  const read = (result: unknown) => JSON.parse((result as { content: Array<{ text: string }> }).content[0]?.text ?? '{}') as ToolResult
  const connect = async (extra: Record<string, string>) => {
    const client = new Client({ name: 'brand-os-named-ids-test', version: '0.0.1' })
    await client.connect(new StdioClientTransport({ command: NODE, args: tsxArgs('scripts/mcp.ts'), cwd: root, env: { ...env, ...extra }, stderr: 'pipe' }))
    return client
  }

  const client = await connect({ BRAND_OS_AGENT_TOKEN: token })
  try {
    const logo = read(await client.callTool({ name: 'get_logo_rules', arguments: {} }))
    assert.equal(row(logo, 'brand.logo.masters')?.value, MASTERS)
    assert.equal(row(logo, 'brand.logo.clear_space')?.value, CLEAR_SPACE)
    assert.equal(row(logo, 'brand.logo.min_size')?.missing, true)
    const motion = read(await client.callTool({ name: 'get_motion_guidelines', arguments: {} }))
    assert.equal(row(motion, 'brand.motion.principles')?.value, PRINCIPLES)
    assert.equal(row(motion, 'brand.motion.reduced')?.missing, true)
    for (const id of LEGACY_IDS) assert.equal(JSON.stringify([logo, motion]).includes(id), false, id)
    assert.equal(JSON.stringify([logo, motion]).includes(token), false)
  } finally {
    await client.close()
  }

  const guest = await connect({})
  try {
    const denied = read(await guest.callTool({ name: 'get_logo_rules', arguments: {} }))
    assert.equal(denied.status, 'denied')
    assert.equal(JSON.stringify(denied).includes(MASTERS), false)
  } finally {
    await guest.close()
  }
})
