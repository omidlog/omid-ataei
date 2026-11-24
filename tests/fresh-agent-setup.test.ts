import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { AGENT_PROFILES, agentTokenPath, applyInit, listAgentTokens, writeFacts, writeStarterWorkspace } from '@brand-os/brand-core'
import type { RetrievedItem } from '@brand-os/brand-core'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

/**
 * GAP-11: the owner guide `docs-internal/AGENT_ONBOARDING*.md` walked end to end in a temporary brand, with the
 * same CLI commands and the same stdio MCP server a fresh Claude Code session starts. Nothing here is mocked:
 * every step is a child process, as the owner would run it.
 */

process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')

const REPO = path.resolve(import.meta.dirname, '..')
const SLUG = 'onboarding-brand'
const GUIDES = ['AGENT_ONBOARDING.md', 'AGENT_ONBOARDING.fa.md', 'AGENT_ONBOARDING.tr.md'].map((name) => path.join(REPO, 'docs-internal', name))

function fact(id: string, module: string, value: unknown, classification: 'internal' | 'restricted') {
  return {
    id,
    brand_id: SLUG,
    module,
    value,
    value_type: 'text',
    status: 'approved',
    classification,
    publication: 'unpublished' as const,
    source: { kind: 'interview', answer_ids: [], reference_ids: [], citation_paths: ['brand/instance/approved-facts.yaml'], observed_at: null },
    confidence: null,
    assumptions: [],
    owner: null,
    reviewer_id: 'owner',
    approved_at: '2026-11-20T00:00:00.000Z',
    version: 1,
    revision_hash: `${id}:1`,
    review_due: null,
    related_ids: [],
    private_ref: null,
  }
}

/** A synthetic private brand: one approved brand fact (design may read), one business fact (design may not), one restricted row. */
function freshBrand(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-fresh-agent-'))
  writeStarterWorkspace(root)
  applyInit(root, { name: 'Onboarding Brand', slug: SLUG, industry: 'education', language: 'en', languages: ['en', 'fa', 'tr'], mascot: false, gamification: false, publish: 'private' })
  writeFacts(root, 'approved', {
    'brand.strategy.purpose': fact('brand.strategy.purpose', 'brand-strategy', 'SYNTHETIC-PURPOSE', 'internal'),
    'business.offer.summary': fact('business.offer.summary', 'business-company', 'SYNTHETIC-OFFER-NOT-FOR-DESIGN', 'internal'),
    'business.finance.runway': fact('business.finance.runway', 'business-finance', null, 'restricted'),
  })
  return root
}

function childEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'BRAND_OS_AGENT_TOKEN' && key !== 'BRAND_OS_APPROVAL_PROOF') env[key] = value
  }
  return { ...env, ...extra }
}

type Json = { status: string; data: { items: RetrievedItem[] } }
const parse = (result: unknown): Json => JSON.parse((result as { content: Array<{ text: string }> }).content[0]?.text ?? '{}') as Json

test('a nontechnical owner can set up, verify and revoke a fresh agent exactly as the guide says', async () => {
  const root = freshBrand()
  /** `npm run -s brand:… -- <args>`; `stdin` stands in for `< brand/.private/approval-secret`. */
  const brand = (args: string[], env: Record<string, string> = {}, stdin = '') =>
    spawnSync(NODE, tsxArgs('scripts/brand.ts', args), { cwd: root, env: childEnv(env), input: stdin, encoding: 'utf8', timeout: 60_000 })
  const secretFile = () => fs.readFileSync(path.join(root, 'brand/.private/approval-secret'), 'utf8')

  // Step 1: the owner creates the approval secret. Its value is never printed.
  const doctor = brand(['doctor', '--create-approval-secret'])
  assert.match(doctor.stdout, /Approval secret is at brand\/\.private\/approval-secret/)
  const secret = secretFile().trim()
  assert.ok(secret.length > 0)
  assert.equal(doctor.stdout.includes(secret), false, 'the secret is not echoed')
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(root, 'brand/.private/approval-secret')).mode & 0o777, 0o600)

  // Step 2: the owner issues one design token, reading the proof from the file (never from argv).
  const issued = brand(['agent-token', 'issue', '--profile', 'design', '--label', 'claude-code design'], {}, secretFile())
  assert.equal(issued.status, 0, issued.stderr)
  assert.match(issued.stdout, /shown once/)
  const token = issued.stdout.trim().split('\n').at(-1) ?? ''
  assert.match(token, /^bos_at_[A-Za-z0-9_-]{43}$/)
  const [record] = listAgentTokens(root)
  assert.ok(record && record.profile === 'design' && !record.revoked)
  assert.equal(fs.readFileSync(agentTokenPath(root), 'utf8').includes(token), false, 'only the hash is stored')

  // Step 3: quick check without Claude.
  const status = brand(['query', '--tool', 'get_brand_status'], { BRAND_OS_AGENT_TOKEN: token })
  assert.equal(status.status, 0, status.stderr)
  assert.equal((JSON.parse(status.stdout) as { status: string }).status, 'approved')
  assert.equal(status.stdout.includes(token) || status.stderr.includes(token), false)

  // Step 4: the agent host starts the stdio server with the token in its environment, as `claude mcp add` does.
  const connect = async (env: Record<string, string>) => {
    const client = new Client({ name: 'fresh-agent-onboarding-test', version: '0.0.1' })
    await client.connect(new StdioClientTransport({ command: NODE, args: tsxArgs('scripts/mcp.ts'), cwd: root, env: childEnv(env), stderr: 'pipe' }))
    return client
  }
  const agent = await connect({ BRAND_OS_AGENT_TOKEN: token })
  try {
    // The agent has only read tools: nothing that approves, publishes, writes facts or manages tokens.
    const names = (await agent.listTools()).tools.map((tool) => tool.name)
    assert.ok(names.includes('brand_retrieve') && names.includes('task_context'))
    for (const name of names) assert.doesNotMatch(name, /approve|publish|agent_token|issue|revoke|write|delete|reset|export/, name)

    // Allowed data: the approved brand fact in its profile.
    const allowed = parse(await agent.callTool({ name: 'brand_retrieve', arguments: { kind: 'facts', ids: ['brand.strategy.purpose'] } }))
    assert.equal(allowed.data.items.find((item) => item.id === 'brand.strategy.purpose')?.value, 'SYNTHETIC-PURPOSE')

    // Outside the design profile, restricted values, and forged owner arguments: nothing leaks.
    const forged = await agent.callTool({ name: 'brand_retrieve', arguments: { kind: 'facts', role: 'owner', audience: 'restricted', token: 'x', include_unapproved: true } })
    const forgedText = JSON.stringify(forged)
    assert.equal(forgedText.includes('SYNTHETIC-OFFER-NOT-FOR-DESIGN'), false)
    const restricted = parse(await agent.callTool({ name: 'brand_retrieve', arguments: { kind: 'facts', ids: ['business.finance.runway'] } }))
    assert.equal(restricted.data.items.some((item) => item.value !== null && item.value !== undefined), false)
  } finally {
    await agent.close()
  }

  // Step 5: owner-only actions are refused for anything holding the agent token and no proof.
  const approve = brand(['approve', '--module', 'brand-strategy'], { BRAND_OS_AGENT_TOKEN: token })
  assert.equal(approve.status, 2)
  assert.match(approve.stderr, /refuses to run while BRAND_OS_AGENT_TOKEN is set/)
  const publish = brand(['publish', '--module', 'brand-strategy'], { BRAND_OS_AGENT_TOKEN: token })
  assert.equal(publish.status, 2)
  const selfIssue = brand(['agent-token', 'issue', '--profile', 'internal-read', '--label', 'escalate'], { BRAND_OS_AGENT_TOKEN: token })
  assert.equal(selfIssue.status, 1)
  assert.match(selfIssue.stderr, /owner only/)
  const selfRevoke = brand(['agent-token', 'revoke', '--id', record.id], { BRAND_OS_AGENT_TOKEN: token, BRAND_OS_APPROVAL_PROOF: 'guessed-proof' })
  assert.equal(selfRevoke.status, 1)
  assert.equal(listAgentTokens(root).length, 1, 'no token was added')
  assert.equal(listAgentTokens(root)[0]?.revoked, false, 'no token was revoked by the agent')

  // Step 6: the owner revokes. The next server start fails closed; it does not fall back to guest.
  const listed = brand(['agent-token', 'list'], {}, secretFile())
  assert.match(listed.stdout, new RegExp(`${record.id}\\s+design\\s+active`))
  const revoke = brand(['agent-token', 'revoke', '--id', record.id], {}, secretFile())
  assert.equal(revoke.status, 0, revoke.stderr)
  assert.match(revoke.stdout, /Restart any MCP server/)
  assert.match(brand(['agent-token', 'list'], {}, secretFile()).stdout, new RegExp(`${record.id}\\s+design\\s+revoked`))
  const restarted = spawnSync(NODE, tsxArgs('scripts/mcp.ts'), { cwd: root, env: childEnv({ BRAND_OS_AGENT_TOKEN: token }), input: '', encoding: 'utf8', timeout: 60_000 })
  assert.equal(restarted.status, 1)
  assert.match(restarted.stderr, /revoked/)
  assert.equal(restarted.stderr.includes(token), false)
  const afterRevoke = brand(['query', '--tool', 'get_brand_status'], { BRAND_OS_AGENT_TOKEN: token })
  assert.equal(afterRevoke.status, 1)
  assert.equal(afterRevoke.stdout, '')
})

test('the guide exists in en, fa and tr and only names commands and profiles that exist', () => {
  const scripts = (JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts
  for (const file of GUIDES) {
    const text = fs.readFileSync(file, 'utf8')
    const name = path.basename(file)
    const runs = [...text.matchAll(/npm run (?:-s )?([a-z][a-z:-]*)/g)].map((match) => match[1] as string)
    assert.ok(runs.length >= 5, `${name} gives exact commands`)
    for (const script of runs) assert.ok(script in scripts, `${name}: npm run ${script} exists`)
    for (const [, profile] of text.matchAll(/--profile ([a-z-]+)/g)) assert.ok(profile && profile in AGENT_PROFILES, `${name}: profile ${profile}`)
    for (const step of ['brand:doctor -- --create-approval-secret', 'brand:agent-token -- issue', 'claude mcp add', 'brand:agent-token -- revoke', 'brand/.private/approval-secret'])
      assert.ok(text.includes(step), `${name} covers ${step}`)
    assert.doesNotMatch(text, /bos_at_[A-Za-z0-9_-]{20,}/, `${name} holds no token`)
    assert.doesNotMatch(text, /--proof\b/, `${name} never puts the proof on argv`)
    assert.ok(text.includes('AGENT_ONBOARDING_HOSTED.md'), `${name} links the hosted MCP note`)
  }
  assert.match(fs.readFileSync(GUIDES[1] as string, 'utf8'), /<div dir="rtl" lang="fa">/, 'Persian guide is right to left')
  const hosted = fs.readFileSync(path.join(REPO, 'docs-internal', 'AGENT_ONBOARDING_HOSTED.md'), 'utf8')
  assert.match(hosted, /new security review/i)
  assert.match(hosted, /not built/i)
})
