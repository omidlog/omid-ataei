import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { readAccessLog } from '@brand-os/brand-core'
import {
  CONTENT_BRIEF_SCHEMA,
  CONTENT_FEED_SCHEMA,
  CONTENT_REPORT_SCHEMA,
  verifyContentDocument,
  type AgentCalendarDocument,
  type ContentBriefDocument,
  type ContentReportDocument,
  type ContentToolResult,
} from '@brand-os/brand-core/content-bridge'
import { approveFacts, AUDIENCE, BUDGET_FACT_CANARY, OFFER, PROMISE, VOICE } from './helpers/content.js'
import { TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'
import { strategyBrand } from './helpers/strategy.js'

/**
 * Content Bridge Slice D: the documented journey, end to end through the real CLIs and the stdio MCP server (real
 * clock), plus checks that the content-planner skill and the integration guide name only commands, tools and schemas
 * that exist. Set CONTENT_JOURNEY_TRANSCRIPT=<file> to write the transcript used in the guide's demo.
 */
useTestKey()

const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')
const SKILL = path.join(repo, 'agent-skills/content-planner/SKILL.md')
const GUIDE = path.join(repo, 'docs-internal/CONTENT_AGENT_INTEGRATION.md')
const POST_URL = 'https://www.instagram.com/p/Cx1Ab2Cd3Ef/'

const transcript: string[] = []

function env(extra: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const merged: Record<string, string | undefined> = { ...process.env, BRAND_OS_DATA_KEY: TEST_DATA_KEY, BRAND_OS_KNOWLEDGE_GH: 'off', BRAND_OS_AGENT_TOKEN: undefined, BRAND_OS_APPROVAL_PROOF: undefined, ...extra }
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key]
  return merged as NodeJS.ProcessEnv
}

/** Runs `npm run <npmScript> -- <args>` the way package.json maps it, and records it in the transcript. */
function run(root: string, npmScript: string, args: string[], extra: Record<string, string | undefined> = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
  const mapped = pkg.scripts[npmScript]
  assert.ok(mapped, `npm script ${npmScript}`)
  const [, file, ...fixed] = mapped.split(' ')
  const result = spawnSync(tsx, [path.join(repo, file!), ...fixed, ...args], { cwd: root, encoding: 'utf8', env: env(extra), input: '' })
  const shown = args.map((arg) => (/^[0-9a-f]{64}$/.test(arg) ? `${arg.slice(0, 12)}…` : /\s/.test(arg) ? `"${arg}"` : arg)).join(' ')
  const prefix = extra.BRAND_OS_AGENT_TOKEN ? 'BRAND_OS_AGENT_TOKEN=… ' : extra.BRAND_OS_APPROVAL_PROOF ? 'BRAND_OS_APPROVAL_PROOF=… ' : ''
  transcript.push(`$ ${prefix}npm run ${npmScript} -- ${shown}`, (result.stdout + result.stderr).trimEnd(), `(exit ${result.status})`, '')
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(result.stdout) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: result.status, json, stdout: result.stdout, stderr: result.stderr }
}

test('journey: owner plans and approves a week, issues a content-read token; an agent reads, briefs and reports; the owner reads reports and revokes', async () => {
  const s = await strategyBrand('pilito', new Date())
  const today = new Date().toISOString().slice(0, 10)
  // The owner answered and approved these facts with brand:interview / brand:approve.
  approveFacts(s, [
    ['brand.verbal.voice', VOICE],
    ['brand.verbal.forbidden', 'Guaranteed fluency; Fake awards; Shame'],
    ['business.marketing.availability_claim', 'do-not-claim'],
    ['business.customer.primary_segment', AUDIENCE],
    ['brand.strategy.promise', PROMISE],
    ['business.offer.summary', OFFER],
    ['business.marketing.pillars', 'Learning stories; Product proof; Community voices'],
    ['business.marketing.channels', 'Instagram and a newsletter.'],
    ['business.marketing.budget', BUDGET_FACT_CANARY],
  ])
  const proof = { BRAND_OS_APPROVAL_PROOF: s.proof }

  // 1. Owner: content strategy from approved facts, approved through brand:strategy.
  const strategy = run(s.root, 'brand:content', ['strategy', '--channels', 'instagram,newsletter', '--cadence', 'instagram=3/week,newsletter=1/month', '--formats', 'instagram=reel+carousel,newsletter=email', '--store', '--json'])
  assert.equal(strategy.status, 0, strategy.stdout + strategy.stderr)
  const strategySha = (strategy.json.stored as { content_sha256: string }).content_sha256
  assert.equal(run(s.root, 'brand:strategy', ['review', '--id', 'content-main', '--revision', '1']).status, 0)
  // An agent token cannot approve, and approval without the proof is refused.
  assert.equal(run(s.root, 'brand:strategy', ['approve', '--id', 'content-main', '--revision', '1', '--expect-sha', strategySha]).status, 1)
  assert.equal(run(s.root, 'brand:strategy', ['approve', '--id', 'content-main', '--revision', '1', '--expect-sha', strategySha], proof).status, 0)
  const show = run(s.root, 'brand:content', ['show'])
  assert.equal(show.status, 0, show.stderr)
  assert.ok(!show.stdout.includes(BUDGET_FACT_CANARY))

  // 2. Owner: plan one week, store it as a draft, review and approve it.
  const planned = run(s.root, 'brand:content', ['plan', '--from', today, '--weeks', '1', '--store', '--json'])
  assert.equal(planned.status, 0, planned.stdout + planned.stderr)
  const week = (planned.json.stored as Array<{ week_id: string; revision: number; content_sha256: string }>)[0]!
  const review = run(s.root, 'brand:content', ['week', 'review', '--week', week.week_id, '--revision', '1'])
  assert.match(review.stdout, /No blockers\./)
  assert.equal(run(s.root, 'brand:content', ['week', 'approve', '--week', week.week_id, '--revision', '1', '--expect-sha', week.content_sha256], proof).status, 0)
  assert.match(run(s.root, 'brand:content', ['calendar']).stdout, new RegExp(`${week.week_id} r1 \\(current\\)`))

  // 3. Owner: issue a content-read token (proof required; never on the command line).
  assert.equal(run(s.root, 'brand:agent-token', ['issue', '--profile', 'content-read', '--label', 'instagram agent']).status, 1)
  const issued = run(s.root, 'brand:agent-token', ['issue', '--profile', 'content-read', '--label', 'instagram agent', '--json'], proof)
  assert.equal(issued.status, 0, issued.stderr)
  const token = issued.json.token as string
  const tokenId = issued.json.id as string
  assert.equal(issued.json.profile, 'content-read')
  transcript[transcript.length - 3] = transcript[transcript.length - 3]!.replace(token, '<token, shown once>')
  const agent = { BRAND_OS_AGENT_TOKEN: token }

  // 4. Agent without MCP: calendar, then a pinned brief; a wrong pin is refused.
  const calendar = run(s.root, 'brand:query', ['--tool', 'content_calendar', '--channel', 'instagram'], agent)
  assert.equal(calendar.status, 0, calendar.stderr)
  const cal = calendar.json as unknown as ContentToolResult
  assert.equal(cal.status, 'ok')
  const doc = cal.data as AgentCalendarDocument
  assert.equal(doc.schema, CONTENT_FEED_SCHEMA)
  assert.ok(verifyContentDocument(doc))
  assert.deepEqual(doc.authorizes, [])
  assert.equal(doc.publication_permission, false)
  const served = doc.weeks[0]!
  assert.equal(served.week_id, week.week_id)
  const pin = { revision: served.revision, content_sha256: served.digests.content_sha256 }
  assert.equal(pin.content_sha256, week.content_sha256)
  const slot = served.slots[0]!
  const brief = run(s.root, 'brand:query', ['--tool', 'content_brief', '--week', week.week_id, '--slot', slot.id, '--pin-revision', String(pin.revision), '--pin-sha', pin.content_sha256], agent)
  const briefDoc = (brief.json as unknown as ContentToolResult).data as ContentBriefDocument
  assert.equal(briefDoc.schema, CONTENT_BRIEF_SCHEMA)
  assert.ok(verifyContentDocument(briefDoc))
  assert.ok(briefDoc.must_avoid.some((item) => item.text === 'Guaranteed fluency'))
  const stale = run(s.root, 'brand:query', ['--tool', 'content_brief', '--week', week.week_id, '--slot', slot.id, '--pin-revision', '1', '--pin-sha', 'c'.repeat(64)], agent)
  assert.equal((stale.json as unknown as ContentToolResult).status, 'stale_pin')
  assert.equal((stale.json as unknown as ContentToolResult).data, null)
  const fa = run(s.root, 'brand:query', ['--tool', 'content_calendar', '--channel', 'instagram', '--lang', 'fa'], agent)
  assert.equal(((fa.json as unknown as ContentToolResult).data as AgentCalendarDocument).lang, 'fa')
  for (const out of [calendar.stdout, brief.stdout, stale.stdout, fa.stdout]) assert.ok(!out.includes(BUDGET_FACT_CANARY) && !out.includes('business.marketing.budget'))

  // 5. Agent over stdio MCP: report the published slot. The report is the only write.
  const client = new Client({ name: 'external-content-bot', version: '0.0.1' })
  await client.connect(new StdioClientTransport({ command: tsx, args: [path.join(repo, 'scripts/mcp.ts')], cwd: s.root, env: env(agent) as Record<string, string>, stderr: 'pipe' }))
  try {
    const names = (await client.listTools()).tools.map((tool) => tool.name)
    assert.ok(!names.some((name) => /approve|publish|schedule|post_/.test(name)))
    const args = { week_id: week.week_id, slot_id: slot.id, pin, status: 'published', url: POST_URL }
    const raw = await client.callTool({ name: 'content_report', arguments: args })
    const reported = JSON.parse((raw as { content: Array<{ text: string }> }).content[0]!.text) as ContentToolResult
    transcript.push(`MCP content_report ${JSON.stringify({ ...args, pin: { revision: pin.revision, content_sha256: `${pin.content_sha256.slice(0, 12)}…` } })}`, JSON.stringify(reported, null, 2), '')
    assert.equal(reported.status, 'ok', reported.reason)
    assert.equal((reported.data as ContentReportDocument).schema, CONTENT_REPORT_SCHEMA)
  } finally {
    await client.close()
  }

  // 6. Owner: reports (en/fa/tr), then revoke. A revoked token makes the next server start fail; no token is denied.
  assert.match(run(s.root, 'brand:content', ['reports']).stdout, new RegExp(`${week.week_id} ${slot.id} r1 published ${POST_URL.replace(/[.?/]/g, '\\$&')}`))
  assert.match(run(s.root, 'brand:content', ['reports', '--lang', 'fa']).stdout, /گزارش/)
  assert.match(run(s.root, 'brand:content', ['reports', '--lang', 'tr']).stdout, /Raporlar/)
  assert.equal(run(s.root, 'brand:content', ['reports'], agent).status, 1, 'reports are owner-only')
  assert.equal(run(s.root, 'brand:agent-token', ['revoke', '--id', tokenId], proof).status, 0)
  assert.notEqual(run(s.root, 'brand:query', ['--tool', 'content_calendar'], agent).status, 0, 'a revoked token is refused at startup')
  const guest = run(s.root, 'brand:query', ['--tool', 'content_calendar'])
  assert.equal((guest.json as unknown as ContentToolResult).status, 'denied')

  // Every agent read was logged with ids only.
  const log = readAccessLog(s.root).filter((line) => (line as { kind?: string }).kind === 'content')
  assert.ok(log.length >= 5)
  assert.ok(!JSON.stringify(log).includes(POST_URL))

  if (process.env.CONTENT_JOURNEY_TRANSCRIPT) fs.writeFileSync(process.env.CONTENT_JOURNEY_TRANSCRIPT, transcript.join('\n'))
})

/** `npm run brand:x -- sub …` mentions in a Markdown file. */
function commandsIn(text: string): Array<{ script: string; sub: string | null }> {
  return [...text.matchAll(/npm run (?:-s )?([a-z]+:[a-z:-]+)(?: -- ([a-z-]+))?/g)].map((m) => ({ script: m[1]!, sub: m[2] ?? null }))
}

test('the content-planner skill and the integration guide name only real commands, tools and schemas', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
  const mcp = fs.readFileSync(path.join(repo, 'scripts/mcp.ts'), 'utf8')
  const mcpTools = new Set([...mcp.matchAll(/registerTool\(\s*'([a-z_]+)'/g)].map((m) => m[1]!))
  const queryTools = new Set([...fs.readFileSync(path.join(repo, 'scripts/brand.ts'), 'utf8').matchAll(/^\s{4}([a-z_]+): (?:async )?\(\)/gm)].map((m) => m[1]!))
  const sources: Record<string, string> = {
    'brand:content': fs.readFileSync(path.join(repo, 'scripts/content.ts'), 'utf8'),
    'brand:strategy': fs.readFileSync(path.join(repo, 'scripts/strategy.ts'), 'utf8'),
  }
  for (const file of [SKILL, GUIDE]) {
    const text = fs.readFileSync(file, 'utf8')
    const label = path.relative(repo, file)
    const commands = commandsIn(text)
    assert.ok(commands.length > 5, `${label} shows commands`)
    for (const { script, sub } of commands) {
      assert.ok(pkg.scripts[script], `${label}: npm script ${script}`)
      if (sub && sources[script]) assert.ok(sources[script]!.includes(`'${sub}'`), `${label}: ${script} has command ${sub}`)
      if (script === 'brand:agent-token' && sub) assert.ok(['issue', 'list', 'revoke'].includes(sub), `${label}: agent-token ${sub}`)
    }
    for (const m of text.matchAll(/`((?:content|strategy|creative)_[a-z_]+)`/g)) {
      const name = m[1]!
      assert.ok(mcpTools.has(name) || name === 'content_strategy', `${label}: tool ${name} exists in the MCP server`)
    }
    for (const m of text.matchAll(/--tool ([a-z_]+)/g)) assert.ok(queryTools.has(m[1]!), `${label}: brand:query --tool ${m[1]}`)
    for (const schema of text.matchAll(/brand-os\/content-[a-z-]+\/v\d/g)) assert.ok([CONTENT_FEED_SCHEMA, CONTENT_BRIEF_SCHEMA, CONTENT_REPORT_SCHEMA, 'brand-os/content-strategy-view/v1'].includes(schema[0] as never), `${label}: schema ${schema[0]}`)
    // Neither document may tell an agent to approve, or show the proof or a token on the command line.
    assert.ok(!/--proof\b/.test(text), `${label}: no --proof flag`)
    assert.ok(!/bos_at_[A-Za-z0-9]{8,}/.test(text), `${label}: no real-looking token`)
  }
  const skill = fs.readFileSync(SKILL, 'utf8')
  for (const tool of ['content_calendar', 'content_brief', 'content_report']) assert.ok(skill.includes(tool), `skill names ${tool}`)
  for (const word of ['stale_pin', 'not_found', 'authorizes: []', 'never approve']) assert.ok(skill.includes(word), `skill covers ${word}`)
  const guide = fs.readFileSync(GUIDE, 'utf8')
  for (const word of [CONTENT_FEED_SCHEMA, CONTENT_BRIEF_SCHEMA, CONTENT_REPORT_SCHEMA, 'publication_permission', 'restart', 'revoke', '--lang fa', '--lang tr']) assert.ok(guide.includes(word), `guide covers ${word}`)
})
