import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import {
  AGENT_TOKEN_ENV,
  allQuestions,
  ensureApprovalSecret,
  InterviewEngine,
  issueAgentToken,
  NAMED_FACT_TOOL_IDS,
  packDigest,
  readFacts,
  revokeAgentToken,
  verifyPack,
  type TaskContextPack,
} from '@brand-os/brand-core'
import { packAssetIds } from '@brand-os/brand-core/runtime'
import { ACCEPTANCE_SCHEMA, caseVerdict, NOT_COVERED, type AcceptanceReport, type CaseId, type CaseRecord, type CheckRecord, type Production, type Verdict } from './model.js'

/**
 * The pilot and workflow acceptance harness (fixes pack PR-F, `docs-internal/ACCEPTANCE.md`).
 *
 * It runs the four journeys of the fixes pack (single visual, ten Instagram posts, website brief, paid-ad brief) the
 * way an agent and the owner would: through the real stdio MCP server (`scripts/mcp.ts`) with an owner-issued token in
 * the server's environment, and through the real CLIs (`brand:runtime`, `brand:visual-dna`) as child processes.
 *
 * Safety rules of the harness itself:
 * - It never writes to the given checkout. It copies `brand/` into a temporary snapshot, issues short-lived tokens
 *   there, runs everything against the snapshot, and hashes the checkout's `brand/` before and after.
 * - Mutations needed by negative tests (a changed asset file, a changed approved fact) happen on separate copies.
 * - Evidence holds ids, counts, codes, exit codes and checksums. No brand sentence, token or path goes into a report.
 * - It calls no model and no network; it publishes, schedules, spends and deploys nothing.
 */

const REPO = path.resolve(import.meta.dirname, '..', '..')
const LOADER = pathToFileURL(path.join(REPO, 'node_modules', 'tsx', 'dist', 'loader.mjs')).href
/** The owner sentence of FIX-02, verbatim from acceptance-cases.json. */
export const FA_TEN_POSTS_REQUEST = '۱۰ پست اینستاگرام برای برند بساز'
const PROBE = 'acceptance-probe-unlisted'
const CHILD_TIMEOUT_MS = 150_000
const ARABIC_SCRIPT = /[؀-ۿ]/

export interface AcceptanceOptions {
  /** A brand checkout (the folder that contains brand/brand.config.yaml). Read only; never written. */
  root: string
  /** An empty or new directory outside any brand/ folder: artifacts and the report go here. */
  out: string
  origin: 'synthetic' | 'owner_brand'
  /** Extra strings that must never reach an agent (fixture canaries). */
  canaries?: string[]
  progress?: (line: string) => void
}

// ---------------------------------------------------------------------------------------------------------------------
// Child processes

interface Ran {
  code: number | null
  stdout: string
  stderr: string
}

function childEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && key !== AGENT_TOKEN_ENV && key !== 'BRAND_OS_APPROVAL_PROOF') env[key] = value
  }
  return { ...env, BRAND_OS_KNOWLEDGE_GH: 'off', ...extra }
}

function runScript(script: string, args: string[], opts: { cwd: string; env?: Record<string, string>; input?: string }): Promise<Ran> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', LOADER, path.join(REPO, script), ...args], { cwd: opts.cwd, env: opts.env ?? childEnv(), stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')))
    const timer = setTimeout(() => child.kill('SIGKILL'), CHILD_TIMEOUT_MS)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
    child.stdin.end(opts.input ?? '')
  })
}

interface Session {
  call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>
  close(): Promise<void>
}

/** A real stdio MCP session against `cwd`, the token (if any) only in the server's environment. Records every reply. */
async function mcpSession(cwd: string, transcript: string[], token?: string): Promise<Session> {
  const client = new Client({ name: 'brand-os-acceptance', version: '1.0.0' })
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--import', LOADER, path.join(REPO, 'scripts', 'mcp.ts')], cwd, env: childEnv(token ? { [AGENT_TOKEN_ENV]: token } : {}), stderr: 'pipe' }))
  return {
    async call(name, args) {
      const result = (await client.callTool({ name, arguments: args })) as { content: Array<{ text?: string }>; isError?: boolean }
      const text = result.content.map((part) => part.text ?? '').join('')
      transcript.push(text)
      if (result.isError) return { status: 'tool_error', error: text.slice(0, 200) }
      return JSON.parse(text) as Record<string, unknown>
    },
    close: () => client.close(),
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Files

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex')

/** sha256 over every file under dir (relative path + bytes; a symlink by its target text), minus `skip`. */
export function treeDigest(dir: string, skip: (rel: string) => boolean = () => false): string {
  const hash = createHash('sha256')
  if (!fs.existsSync(dir)) return hash.update('absent').digest('hex')
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name)
      const rel = path.relative(dir, full).split(path.sep).join('/')
      if (skip(rel)) continue
      if (entry.isSymbolicLink()) hash.update(`L:${rel}:${fs.readlinkSync(full)}\n`)
      else if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) hash.update(`F:${rel}:${sha256(fs.readFileSync(full))}\n`)
    }
  }
  walk(dir)
  return hash.digest('hex')
}

const ACCESS_LOG = '.private/access-log.jsonl'

function copyWorkspace(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true })
  fs.cpSync(path.join(from, 'brand'), path.join(to, 'brand'), { recursive: true, verbatimSymlinks: true })
  if (fs.existsSync(path.join(from, '.gitignore'))) fs.copyFileSync(path.join(from, '.gitignore'), path.join(to, '.gitignore'))
}

/** The real path of `target`, following links on the closest existing parent (the rest may not exist yet). */
function realPathOf(target: string): string {
  let existing = target
  const rest: string[] = []
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing)
    if (parent === existing) break
    rest.unshift(path.basename(existing))
    existing = parent
  }
  return path.join(fs.realpathSync(existing), ...rest)
}

function prepareOut(out: string, root: string): string {
  const full = path.resolve(out)
  // Checked on the typed and the real path, before anything is created: a linked parent cannot lead into brand/.
  const real = realPathOf(full)
  const realRoot = fs.realpathSync(root)
  for (const candidate of [full, real]) {
    if (candidate.split(path.sep).includes('brand')) throw new Error('--out must be outside any brand/ folder.')
  }
  if (real === realRoot || real.startsWith(`${realRoot}${path.sep}brand`)) throw new Error('--out must be outside the brand checkout.')
  if (fs.existsSync(full)) {
    if (fs.lstatSync(full).isSymbolicLink() || !fs.statSync(full).isDirectory()) throw new Error('--out must be a directory, not a link or a file.')
    if (fs.readdirSync(full).length > 0) throw new Error('--out must be empty.')
  }
  fs.mkdirSync(full, { recursive: true })
  return full
}

function harnessCommit(): string | null {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : null
}

// ---------------------------------------------------------------------------------------------------------------------
// Pack analysis (ids and counts only)

interface Envelope {
  tool?: string
  status?: string
  reason?: string
  data?: TaskContextPack | null
  authorizes?: unknown[]
}

const packOf = (reply: Record<string, unknown>): TaskContextPack | null => ((reply as Envelope).status === 'ok' ? ((reply as Envelope).data ?? null) : null)
const noPermissions = (permissions: Record<string, unknown> | undefined): boolean => !!permissions && Object.values(permissions).every((flag) => flag === false)
const short = (sha: string | null | undefined): string => (sha ? sha.slice(0, 12) : 'none')

function packIntegrity(reply: Record<string, unknown>): { verdict: Verdict; evidence: string[] } {
  const envelope = reply as Envelope
  const pack = packOf(reply)
  if (!pack) return { verdict: 'FAIL', evidence: [`status:${envelope.status ?? 'none'}`, `reason:${envelope.reason ?? 'none'}`] }
  const verified = verifyPack(pack)
  const authorizes = Array.isArray(envelope.authorizes) && envelope.authorizes.length === 0 && pack.authorizes.length === 0
  const permissions = noPermissions(pack.permissions as unknown as Record<string, unknown>)
  return {
    verdict: verified && authorizes && permissions ? 'PASS' : 'FAIL',
    evidence: [`status:ok`, `readiness:${pack.readiness}`, `staleness:${pack.staleness}`, `digest_verified:${verified}`, `authorizes_empty:${authorizes}`, `permissions_false:${permissions}`, `pack:${short(pack.digests.context_sha256)}`],
  }
}

/** Every approved item traces to an approved source the pack lists, and every fact source to the current approved fact. */
function traceItems(pack: TaskContextPack, facts: Record<string, { status: string; revision_hash: string | null }>): { verdict: Verdict; evidence: string[] } {
  const sources = new Map(pack.sources.map((source) => [source.id, source.revision]))
  const problems: string[] = []
  let approved = 0
  let factItems = 0
  for (const item of Object.values(pack.sections).flat()) {
    if (item.state === 'owner_stated' && item.source_id !== null) problems.push(`owner_stated_with_source:${item.key}`)
    if (item.state !== 'approved') continue
    approved += 1
    if (!item.source_id) {
      problems.push(`approved_without_source:${item.key}`)
      continue
    }
    if (!sources.has(item.source_id)) problems.push(`source_not_listed:${item.key}`)
    const fact = facts[item.source_id]
    if (fact) {
      factItems += 1
      if (fact.status !== 'approved') problems.push(`fact_not_approved:${item.source_id}`)
      if (fact.revision_hash !== item.source_revision) problems.push(`revision_differs:${item.source_id}`)
    }
  }
  return { verdict: problems.length === 0 ? 'PASS' : 'FAIL', evidence: [`approved_items:${approved}`, `fact_items_traced:${factItems}`, ...problems.slice(0, 12)] }
}

function gaps(pack: TaskContextPack | null): { question_ids: string[]; other: number } {
  if (!pack) return { question_ids: [], other: 0 }
  const ids = [...new Set(pack.missing.map((entry) => entry.suggested_question_id).filter((id): id is string => typeof id === 'string'))].sort()
  return { question_ids: ids, other: pack.missing.filter((entry) => !entry.suggested_question_id).length }
}

/** Approved values keyed by (key, source, revision), for checking that a locale changes labels, never approved text. */
function approvedFingerprint(pack: TaskContextPack): string {
  const rows = Object.values(pack.sections)
    .flat()
    .filter((item) => item.state === 'approved')
    .map((item) => JSON.stringify([item.key, item.source_id, item.source_revision, item.value]))
    .sort()
  return sha256(rows.join('\n'))
}

/**
 * Secrets found in the transcript. Replies are JSON text, so a value with `"`, `\\` or a newline appears
 * escaped there; both the raw and the JSON-escaped form are searched.
 */
export function leaks(transcript: string[], secrets: string[]): string[] {
  const text = transcript.join('\n')
  return secrets.filter((secret) => secret.length >= 6 && (text.includes(secret) || text.includes(JSON.stringify(secret).slice(1, -1))))
}

// ---------------------------------------------------------------------------------------------------------------------
// Case bookkeeping

class CaseRun {
  readonly checks: CheckRecord[] = []
  readonly outputs: CaseRecord['outputs'] = []
  readonly transcript: string[] = []
  calls = 0
  production: Production = 'not_tested'
  pack: TaskContextPack | null = null
  private readonly started = Date.now()

  constructor(
    readonly id: CaseId,
    readonly journey: CaseRecord['journey'],
    readonly fixes: string[],
    readonly profile: string,
  ) {}

  add(id: string, fixes: string, verdict: Verdict, evidence: string[]): void {
    this.checks.push({ id, fixes, verdict, evidence: evidence.slice(0, 24) })
  }

  /** Runs one check; an exception is a FAIL with its error class, never a pass. */
  async check(id: string, fixes: string, body: () => Promise<{ verdict: Verdict; evidence: string[] }> | { verdict: Verdict; evidence: string[] }): Promise<void> {
    try {
      const result = await body()
      this.add(id, fixes, result.verdict, result.evidence)
    } catch (error) {
      this.add(id, fixes, 'FAIL', [`error:${error instanceof Error ? error.name : 'unknown'}`, `message:${error instanceof Error ? error.message.replace(/\/[^\s'"]+/g, '<path>').slice(0, 160) : ''}`])
    }
  }

  record(file: string, outRoot: string): void {
    const bytes = fs.readFileSync(file)
    this.outputs.push({ file: path.relative(outRoot, file).split(path.sep).join('/'), sha256: sha256(bytes), bytes: bytes.length })
  }

  finish(): CaseRecord {
    const g = gaps(this.pack)
    return {
      case_id: this.id,
      journey: this.journey,
      fixes: this.fixes,
      profile: this.profile,
      verdict: caseVerdict(this.checks),
      production: this.production,
      pack_sha256: this.pack?.digests.context_sha256 ?? null,
      metrics: {
        tool_calls: this.calls,
        owner_questions: g.question_ids.length,
        question_ids: g.question_ids,
        other_gaps: g.other,
        artifacts: this.outputs.length,
        seconds: Math.round((Date.now() - this.started) / 100) / 10,
      },
      outputs: this.outputs,
      checks: this.checks,
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The run

interface Context {
  snap: string
  out: string
  slug: string
  tokens: Record<'content' | 'design' | 'marketing' | 'ads', string>
  facts: Record<string, { status: string; revision_hash: string | null; value: unknown; classification: string }>
  bank: Set<string>
  /** Draft (unapproved) values that differ from the approved one: never served by a named fact tool. */
  drafts: Record<string, string>
  secrets: string[]
  /** Restricted values only (budget facts, fixture canaries): the no-leak checks of journey 4. */
  restricted: string[]
  tmp: string
}

export async function runAcceptance(opts: AcceptanceOptions): Promise<AcceptanceReport> {
  if (process.env[AGENT_TOKEN_ENV]) throw new Error(`The acceptance harness is an owner-local run. Refusing while ${AGENT_TOKEN_ENV} is set.`)
  const root = path.resolve(opts.root)
  if (!fs.existsSync(path.join(root, 'brand', 'brand.config.yaml'))) throw new Error('The root has no brand/brand.config.yaml.')
  const out = prepareOut(opts.out, root)
  const progress = opts.progress ?? (() => {})
  const started = new Date()
  const rootBefore = treeDigest(path.join(root, 'brand'))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-acceptance-'))
  try {
    const snap = path.join(tmp, 'ws')
    copyWorkspace(root, snap)
    const engine = new InterviewEngine(snap)
    const slug = engine.config().brand.slug
    const label = 'acceptance harness (temporary snapshot)'
    const issue = (profile: Parameters<typeof issueAgentToken>[1]['profile']): string => issueAgentToken(snap, { brandId: slug, profile, label }).token
    const tokens = { content: issue('content-read'), design: issue('design'), marketing: issue('marketing'), ads: issue('strategy-ads-read') }
    const revoked = issueAgentToken(snap, { brandId: slug, profile: 'content-read', label })
    revokeAgentToken(snap, revoked.record.id)
    const otherBrand = issueAgentToken(snap, { brandId: `${slug}-other-brand`, profile: 'content-read', label }).token

    const facts = readFacts(snap, 'approved', slug) as unknown as Context['facts']
    const drafts: Record<string, string> = {}
    for (const [id, fact] of Object.entries(readFacts(snap, 'draft', slug) as unknown as Context['facts'])) {
      const value = fact.value === null || fact.value === undefined ? '' : String(fact.value)
      if (value.length >= 6 && value !== String(facts[id]?.value ?? '')) drafts[id] = value
    }
    const restricted = [
      ...Object.values(facts)
        .filter((fact) => fact.classification === 'restricted' && fact.value !== null && fact.value !== undefined)
        .map((fact) => (typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value))),
      ...(opts.canaries ?? []),
    ].filter((value) => value.length >= 6)
    const approvalSecret = path.join(snap, 'brand', '.private')
    const privateValues = fs.existsSync(approvalSecret) ? privateSecrets(approvalSecret) : []
    const ctx: Context = {
      snap,
      out,
      slug,
      tokens,
      facts,
      bank: new Set(allQuestions().map((question) => question.id)),
      drafts,
      secrets: [...Object.values(tokens), revoked.token, otherBrand, ...privateValues, ...restricted],
      restricted,
      tmp,
    }

    progress('acceptance: starting MCP sessions')
    const cases: CaseRecord[] = []
    progress('acceptance: journey 2 — single visual')
    cases.push(await singleVisual(ctx))
    progress('acceptance: journey 1 — ten Instagram posts')
    cases.push(await tenPosts(ctx, revoked.token, otherBrand))
    progress('acceptance: journey 3 — website brief')
    cases.push(await websiteBrief(ctx))
    progress('acceptance: journey 4 — paid-ad brief')
    cases.push(await paidBrief(ctx))

    const rootAfter = treeDigest(path.join(root, 'brand'))
    const totals: Record<Verdict, number> = { PASS: 0, FAIL: 0, NOT_TESTED: 0 }
    for (const record of cases) totals[record.verdict] += 1
    const rootUnchanged = rootBefore === rootAfter
    // A run that changed the checkout's brand/ failed, whatever its cases say.
    const verdict: Verdict = totals.FAIL > 0 || !rootUnchanged ? 'FAIL' : totals.NOT_TESTED > 0 ? 'NOT_TESTED' : 'PASS'
    return {
      schema: ACCEPTANCE_SCHEMA,
      origin: opts.origin,
      brand_id: slug,
      harness_commit: harnessCommit(),
      started_at: started.toISOString(),
      finished_at: new Date().toISOString(),
      verdict,
      totals,
      cases,
      workspace: { snapshot: true, root_unchanged: rootUnchanged },
      not_covered: [...NOT_COVERED],
      authorizes: [],
      permissions: { publish: false, schedule: false, spend: false, deploy: false },
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/** Secret-looking values under .private (approval secret, token hashes): they must never appear in an agent reply. */
function privateSecrets(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === 'access-log.jsonl') continue
    const text = fs.readFileSync(path.join(dir, entry.name), 'utf8')
    for (const match of text.matchAll(/[A-Za-z0-9+/_=-]{32,}/g)) out.push(match[0])
  }
  return out.slice(0, 200)
}

// ---------------------------------------------------------------------------------------------------------------------
// Journey 2 (FIX-03): one visual

async function singleVisual(ctx: Context): Promise<CaseRecord> {
  const run = new CaseRun('single_visual', 2, ['FIX-01', 'FIX-03', 'FIX-05', 'FIX-06'], 'design')
  const session = await mcpSession(ctx.snap, run.transcript, ctx.tokens.design)
  try {
    const reply = await session.call('task_context', { task_type: 'visual_design', locale: 'en' })
    run.calls += 1
    run.pack = packOf(reply)
    await run.check('context.pack', 'FIX-03', () => packIntegrity(reply))
    await run.check('context.no_invented_facts', 'FIX-02', () => (run.pack ? traceItems(run.pack, ctx.facts) : { verdict: 'FAIL', evidence: ['no_pack'] }))

    const ids = run.pack ? packAssetIds(run.pack) : []
    const dna = (await session.call('visual_dna', { asset_ids: ids.slice(0, 20), mascot: { emotion: PROBE, stage: PROBE, angle: PROBE }, locale: 'en' })) as {
      status?: string
      references?: Array<{ via: string; asset_id: string | null; state: string; reason: string | null; asset: { checksum_sha256: string; path: string } | null; rights: unknown; model_use: string; delivery: string; sent_to_model: boolean }>
      mascot?: { status: string }
      permissions?: Record<string, unknown>
    }
    run.calls += 1
    const refs = dna.references ?? []
    const approved = refs.filter((ref) => ref.via === 'asset' && ref.state === 'approved')
    await run.check('reference.approved_verified', 'FIX-03', () => {
      if (dna.status !== 'ok') return { verdict: 'FAIL', evidence: [`visual_dna:${dna.status ?? 'none'}`] }
      const states = refs.filter((ref) => ref.via === 'asset').map((ref) => `${ref.state}${ref.reason ? `:${ref.reason}` : ''}`)
      if (ids.length === 0) return { verdict: 'NOT_TESTED', evidence: ['assets_in_pack:0', 'no approved asset to verify'] }
      if (approved.length === 0) return { verdict: 'NOT_TESTED', evidence: [`assets_in_pack:${ids.length}`, 'approved:0', ...states] }
      const bad = approved.filter((ref) => !/^[0-9a-f]{64}$/.test(ref.asset?.checksum_sha256 ?? '') || !ref.rights || !ref.model_use || ref.delivery !== 'metadata_only' || ref.sent_to_model !== false)
      return { verdict: bad.length === 0 && noPermissions(dna.permissions) ? 'PASS' : 'FAIL', evidence: [`assets_in_pack:${ids.length}`, `approved:${approved.length}`, ...states, ...approved.map((ref) => `model_use:${ref.model_use}`), `bad:${bad.length}`] }
    })
    await run.check('reference.missing_stays_missing', 'FIX-03', () => {
      const mascotApproved = refs.filter((ref) => ref.via === 'mascot' && ref.state === 'approved').length
      const status = dna.mascot?.status ?? 'none'
      // An error reply has no mascot section: that is not "missing stays missing", it is no answer.
      if (dna.status !== 'ok' || !dna.mascot) return { verdict: 'FAIL', evidence: [`visual_dna:${dna.status ?? 'none'}`, `mascot:${status}`] }
      return { verdict: status !== 'resolved' && mascotApproved === 0 ? 'PASS' : 'FAIL', evidence: [`mascot:${status}`, `mascot_refs_approved:${mascotApproved}`, 'request:unlisted emotion/stage/angle'] }
    })

    const first = approved[0]
    await run.check('reference.no_provider_upload', 'FIX-03', async () => {
      if (!first?.asset_id) return { verdict: 'NOT_TESTED', evidence: ['no approved asset reference'] }
      const read = await runScript('scripts/visual-dna.ts', ['read', first.asset_id, '--for', 'external_provider', '--json'], { cwd: ctx.snap })
      run.calls += 1
      const parsed = safeJson(read.stdout) as { status?: string; error?: { code?: string }; upload_authorized?: boolean } | null
      if (first.model_use === 'external_allowed') {
        // Allowed by the record: the owner gets a verdict, still with no upload authorized.
        return { verdict: read.code === 0 && parsed?.upload_authorized === false ? 'PASS' : 'FAIL', evidence: [`model_use:${first.model_use}`, `exit:${read.code}`, `upload_authorized:${String(parsed?.upload_authorized)}`] }
      }
      return { verdict: read.code !== 0 && parsed?.status === 'refused' ? 'PASS' : 'FAIL', evidence: [`model_use:${first.model_use}`, `exit:${read.code}`, `refused:${parsed?.error?.code ?? 'no'}`] }
    })

    await run.check('reference.checksum_drift', 'FIX-05', async () => {
      if (!first?.asset_id || !first.asset) return { verdict: 'NOT_TESTED', evidence: ['no approved asset reference'] }
      const drift = path.join(ctx.tmp, 'drift')
      copyWorkspace(ctx.snap, drift)
      const file = path.join(drift, first.asset.path)
      // One changed byte that keeps the SVG well-formed: a space before the closing tag.
      const bytes = fs.readFileSync(file, 'utf8')
      const at = bytes.lastIndexOf('</svg>')
      fs.writeFileSync(file, at >= 0 ? `${bytes.slice(0, at)} ${bytes.slice(at)}` : `${bytes} `)
      const driftSession = await mcpSession(drift, run.transcript, ctx.tokens.design)
      try {
        const again = (await driftSession.call('visual_dna', { asset_ids: [first.asset_id] })) as { references?: Array<{ state: string; reason: string | null }> }
        run.calls += 1
        const ref = again.references?.[0]
        return { verdict: ref?.state === 'changed' ? 'PASS' : 'FAIL', evidence: [`state:${ref?.state ?? 'none'}`, `reason:${ref?.reason ?? 'none'}`] }
      } finally {
        await driftSession.close()
      }
    })

    // FIX-01: the legacy named logo/motion tools read real question ids and serve approved values only.
    await run.check('legacy.logo_motion_ids', 'FIX-01', async () => {
      const guest = await mcpSession(ctx.snap, run.transcript)
      const problems: string[] = []
      const evidence: string[] = []
      try {
        for (const tool of ['get_logo_rules', 'get_motion_guidelines'] as const) {
          const reply = (await session.call(tool, {})) as { status?: string; data?: { facts?: Array<{ id: string; value: unknown; revision?: string; withheld?: boolean; missing?: boolean }> } }
          const guestReply = (await guest.call(tool, {})) as { status?: string; data?: { facts?: Array<{ id: string; value: unknown }> } }
          run.calls += 2
          const rows = reply.data?.facts ?? []
          const expected = [...NAMED_FACT_TOOL_IDS[tool]]
          if (JSON.stringify(rows.map((row) => row.id)) !== JSON.stringify(expected)) problems.push(`${tool}:ids_differ`)
          for (const id of expected) if (!ctx.bank.has(id)) problems.push(`${tool}:not_in_bank:${id}`)
          let served = 0
          for (const row of rows) {
            if (row.value === null || row.value === undefined) continue
            served += 1
            const fact = ctx.facts[row.id]
            if (!fact || fact.status !== 'approved' || fact.revision_hash !== row.revision || String(fact.value) !== String(row.value)) problems.push(`${tool}:served_not_approved:${row.id}`)
          }
          const draftLeaks = expected.filter((id) => ctx.drafts[id] && JSON.stringify(reply).includes(ctx.drafts[id]!))
          for (const id of draftLeaks) problems.push(`${tool}:draft_served:${id}`)
          // A guest (no token) reads published public facts at most: never an internal or restricted value.
          const guestServed = (guestReply.data?.facts ?? []).filter((row) => row.value !== null && row.value !== undefined)
          for (const row of guestServed) if (ctx.facts[row.id]?.classification !== 'public') problems.push(`${tool}:guest_served_non_public:${row.id}`)
          evidence.push(`${tool}:${reply.status ?? 'none'}:ids:${rows.length}:served:${served}:drafts_checked:${expected.filter((id) => ctx.drafts[id]).length}`, `${tool}:guest:${guestReply.status ?? 'none'}:served:${guestServed.length}`)
        }
      } finally {
        await guest.close()
      }
      return { verdict: problems.length === 0 ? 'PASS' : 'FAIL', evidence: [...evidence, ...problems.slice(0, 10)] }
    })

    const prod = productionOf(await session.call('production_readiness', { task_type: 'visual_design', locale: 'fa' }))
    run.calls += 1
    await run.check('production.honest_block', 'FIX-06', () => honestBrief(prod, 'rtl'))
    run.production = prod.production_ready === 'ready' ? 'produced' : 'blocked'
    await run.check('no_secrets', 'FIX-02', () => noLeak(run.transcript, ctx.secrets))
  } finally {
    await session.close()
  }
  return run.finish()
}

interface ProductionReply {
  status?: string
  production_ready?: string
  direction?: string
  checks?: Array<{ check_id: string; verdict: string; blocks: boolean; evidence: string[] }>
  review?: { visual_taste: string; semantic: string }
  authorizes?: unknown[]
  permissions?: Record<string, unknown>
}

/** MCP wraps the projection in an envelope ({ status, data, authorizes }); the CLI prints the projection itself. */
function productionOf(reply: Record<string, unknown>): ProductionReply {
  const envelope = reply as Envelope & { data?: unknown }
  if (envelope.data && typeof envelope.data === 'object') {
    const data = envelope.data as ProductionReply
    return { ...data, authorizes: Array.isArray(envelope.authorizes) && envelope.authorizes.length === 0 ? data.authorizes : ['envelope_not_empty'] }
  }
  return { status: envelope.status ?? 'none' }
}

const checkOf = (reply: ProductionReply, id: string) => reply.checks?.find((entry) => entry.check_id === id)

/** No renderer: production is not_ready and says the deliverable is a brief; nothing claims artwork or authorizes. */
function honestBrief(prod: ProductionReply, direction: 'rtl' | 'ltr'): { verdict: Verdict; evidence: string[] } {
  const renderer = checkOf(prod, 'renderer.available')
  const ok =
    prod.status === 'ok' &&
    prod.production_ready === 'not_ready' &&
    renderer?.verdict === 'fail' &&
    renderer.evidence.includes('deliverable:brief_only') &&
    prod.review?.visual_taste === 'needs_human_review' &&
    Array.isArray(prod.authorizes) &&
    prod.authorizes.length === 0 &&
    noPermissions(prod.permissions) &&
    prod.direction === direction
  return { verdict: ok ? 'PASS' : 'FAIL', evidence: [`production:${prod.production_ready ?? prod.status ?? 'none'}`, `renderer:${renderer?.verdict ?? 'none'}`, ...(renderer?.evidence ?? []).slice(0, 2), `visual_taste:${prod.review?.visual_taste ?? 'none'}`, `direction:${prod.direction ?? 'none'}`] }
}

function noLeak(transcript: string[], secrets: string[]): { verdict: Verdict; evidence: string[] } {
  const found = leaks(transcript, secrets)
  return { verdict: found.length === 0 ? 'PASS' : 'FAIL', evidence: [`replies_scanned:${transcript.length}`, `secrets_checked:${secrets.length}`, `leaked:${found.length}`] }
}

const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Journey 1 (FIX-02, FIX-04, FIX-05, FIX-06): ten Instagram posts

async function tenPosts(ctx: Context, revokedToken: string, otherBrandToken: string): Promise<CaseRecord> {
  const run = new CaseRun('ten_instagram_posts', 1, ['FIX-02', 'FIX-04', 'FIX-05', 'FIX-06'], 'content-read')
  const dir = path.join(ctx.out, 'ten-instagram-posts')
  fs.mkdirSync(dir)
  const [session, guest, revokedStart, otherStart] = await Promise.all([
    mcpSession(ctx.snap, run.transcript, ctx.tokens.content),
    mcpSession(ctx.snap, run.transcript),
    runScript('scripts/mcp.ts', [], { cwd: ctx.snap, env: childEnv({ [AGENT_TOKEN_ENV]: revokedToken }) }),
    runScript('scripts/mcp.ts', [], { cwd: ctx.snap, env: childEnv({ [AGENT_TOKEN_ENV]: otherBrandToken }) }),
  ])
  try {
    // A fresh session's first and only context call: the owner's Persian sentence.
    const reply = await session.call('task_context', { request: FA_TEN_POSTS_REQUEST, locale: 'fa' })
    run.calls += 1
    run.pack = packOf(reply)
    const pack = run.pack
    await run.check('fresh_session.classified', 'FIX-02', () => {
      const task = pack?.task
      const ok = task?.type === 'social_batch' && task.deliverable_count === 10 && task.channel === 'instagram'
      return { verdict: ok ? 'PASS' : 'FAIL', evidence: [`status:${String((reply as Envelope).status)}`, `task_type:${task?.type ?? 'none'}`, `count:${task?.deliverable_count ?? 'none'}`, `channel:${task?.channel ?? 'none'}`, 'request_text_in_reply:' + String(JSON.stringify(reply).includes(FA_TEN_POSTS_REQUEST))] }
    })
    await run.check('context.pack', 'FIX-02', () => packIntegrity(reply))
    await run.check('context.no_invented_facts', 'FIX-02', () => (pack ? traceItems(pack, ctx.facts) : { verdict: 'FAIL', evidence: ['no_pack'] }))
    await run.check('context.gaps_are_existing_questions', 'FIX-02', () => gapCheck(pack, ctx.bank))
    const guestReply = await guest.call('task_context', { task_type: 'social_batch', deliverable_count: 10, channel: 'instagram' })
    run.calls += 1
    await run.check('mcp.gated', 'FIX-02', () => {
      const ok = (guestReply as Envelope).status === 'denied' && (guestReply as Envelope).data === null && refused(revokedStart, /was revoked/) && refused(otherStart, /does not match an issued token|belongs to another brand/)
      return { verdict: ok ? 'PASS' : 'FAIL', evidence: [`guest:${String((guestReply as Envelope).status)}`, `revoked_token_server_exit:${revokedStart.code}`, `revoked_reason:${refused(revokedStart, /was revoked/)}`, `other_brand_token_server_exit:${otherStart.code}`, `other_brand_reason:${refused(otherStart, /does not match an issued token|belongs to another brand/)}`] }
    })

    // Same request in en and tr: labels may change, approved values may not.
    const locales: Record<string, string> = {}
    for (const locale of ['en', 'tr'] as const) {
      const other = packOf(await session.call('task_context', { task_type: 'social_batch', deliverable_count: 10, channel: 'instagram', locale }))
      run.calls += 1
      locales[locale] = other ? approvedFingerprint(other) : 'none'
    }
    await run.check('copy.locales_unchanged', 'FIX-04', () => {
      if (!pack) return { verdict: 'FAIL', evidence: ['no_pack'] }
      const fa = approvedFingerprint(pack)
      const ok = locales.en === fa && locales.tr === fa
      return { verdict: ok ? 'PASS' : 'FAIL', evidence: [`fa:${short(fa)}`, `en:${short(locales.en)}`, `tr:${short(locales.tr)}`] }
    })
    if (!pack) {
      run.add('posts.ten_files', 'FIX-04', 'FAIL', ['no_pack'])
      return run.finish()
    }

    const packFile = path.join(dir, 'pack.json')
    fs.writeFileSync(packFile, `${JSON.stringify(reply, null, 2)}\n`, { flag: 'wx' })
    run.record(packFile, ctx.out)

    // The owner renders it (no token in this shell), with the owner checkout for Coach and logo.
    const skipLog = (rel: string): boolean => rel === ACCESS_LOG
    const brandBefore = treeDigest(path.join(ctx.snap, 'brand'), skipLog)
    const postsDir = path.join(dir, 'batch')
    const rendered = await runScript('scripts/runtime.ts', ['social-batch', '--pack', packFile, '--root', ctx.snap, '--out', postsDir, '--json'], { cwd: ctx.tmp })
    run.calls += 1
    const brandAfter = treeDigest(path.join(ctx.snap, 'brand'), skipLog)
    const summary = safeJson(rendered.stdout) as BatchSummaryReply | null
    const manifests = readManifests(postsDir)
    const svgs = fs.existsSync(path.join(postsDir, 'posts')) ? fs.readdirSync(path.join(postsDir, 'posts')).filter((name) => name.endsWith('.svg')).sort() : []
    for (const name of svgs) run.record(path.join(postsDir, 'posts', name), ctx.out)
    for (const name of ['batch-summary.json', 'production-readiness.json']) if (fs.existsSync(path.join(postsDir, name))) run.record(path.join(postsDir, name), ctx.out)

    const drafted = summary?.status === 'drafted'
    await run.check('posts.ten_files', 'FIX-04', () => {
      if (rendered.code !== 0) return { verdict: 'FAIL', evidence: [`exit:${rendered.code}`, `stderr_code:${errorCode(rendered.stderr)}`] }
      if (!drafted) return { verdict: 'NOT_TESTED', evidence: [`status:${summary?.status ?? 'none'}`, ...(summary?.blockers ?? []).map((blocker) => `blocked:${blocker.code}`)] }
      const shaOk = manifests.every((manifest) => fs.existsSync(path.join(postsDir, manifest.file)) && sha256(fs.readFileSync(path.join(postsDir, manifest.file))) === manifest.sha256)
      const ok = svgs.length === 10 && manifests.length === 10 && shaOk && new Set(manifests.map((manifest) => manifest.sha256)).size === 10
      return { verdict: ok ? 'PASS' : 'FAIL', evidence: [`exit:${rendered.code}`, `svg:${svgs.length}`, `manifests:${manifests.length}`, `sha_match:${shaOk}`, `batch:${short(summary?.batch_sha256)}`] }
    })
    await run.check('posts.blocked_without_padding', 'FIX-04', () => {
      if (drafted) return { verdict: 'PASS', evidence: ['status:drafted', 'blockers:0'] }
      // A blocked plan writes no post: nothing is padded or synthesized.
      return { verdict: svgs.length === 0 ? 'PASS' : 'FAIL', evidence: [`status:${summary?.status ?? 'none'}`, `svg_written:${svgs.length}`] }
    })
    await run.check('posts.pinned_and_cited', 'FIX-04', () => {
      if (!drafted) return { verdict: 'NOT_TESTED', evidence: ['no posts'] }
      const revisions = new Map(pack.sources.map((source) => [source.id, source.revision]))
      const approvedText = Object.values(pack.sections).flat().filter((item) => item.state === 'approved').map((item) => String(item.value))
      const problems: string[] = []
      let rtl = 0
      for (const manifest of manifests) {
        if (manifest.context.pack_sha256 !== pack.digests.context_sha256) problems.push(`${manifest.post_id}:pack_pin`)
        if (manifest.sources.length === 0) problems.push(`${manifest.post_id}:no_sources`)
        for (const source of manifest.sources) if (!revisions.has(source.source_id) || revisions.get(source.source_id) !== source.source_revision) problems.push(`${manifest.post_id}:source:${source.source_id}`)
        const svg = fs.readFileSync(path.join(postsDir, manifest.file), 'utf8')
        const message = unescapeXml(/<desc id="d">([^<]*)<\/desc>/.exec(svg)?.[1] ?? '')
        if (!message || !approvedText.some((value) => value === message || value.includes(message))) problems.push(`${manifest.post_id}:copy_not_approved_text`)
        if (manifest.direction === 'rtl') rtl += 1
      }
      return { verdict: problems.length === 0 ? 'PASS' : 'FAIL', evidence: [`posts:${manifests.length}`, `pack:${short(pack.digests.context_sha256)}`, `rtl_posts:${rtl}`, ...problems.slice(0, 10)] }
    })
    await run.check('posts.rtl_for_persian_copy', 'FIX-04', () => {
      if (!drafted) return { verdict: 'NOT_TESTED', evidence: ['no posts'] }
      const persian = manifests.filter((manifest) => ARABIC_SCRIPT.test(unescapeXml(/<desc id="d">([^<]*)<\/desc>/.exec(fs.readFileSync(path.join(postsDir, manifest.file), 'utf8'))?.[1] ?? '')))
      if (persian.length === 0) return { verdict: 'NOT_TESTED', evidence: ['no Persian copy in this brand'] }
      const wrong = persian.filter((manifest) => manifest.direction !== 'rtl').length
      return { verdict: wrong === 0 ? 'PASS' : 'FAIL', evidence: [`persian_posts:${persian.length}`, `not_rtl:${wrong}`] }
    })
    await run.check('posts.no_brand_writes', 'FIX-04', () => ({ verdict: brandBefore === brandAfter ? 'PASS' : 'FAIL', evidence: [`brand_tree_unchanged:${brandBefore === brandAfter}`, 'excluded:.private/access-log.jsonl'] }))
    await run.check('posts.no_publication', 'FIX-04', () => {
      if (!summary) return { verdict: 'FAIL', evidence: ['no summary'] }
      const ok =
        Array.isArray(summary.authorizes) &&
        summary.authorizes.length === 0 &&
        noPermissions(summary.permissions) &&
        manifests.every((manifest) => manifest.authorizes.length === 0 && noPermissions(manifest.permissions) && manifest.renderer.model === null && manifest.renderer.network === false && manifest.state === 'draft')
      return { verdict: ok ? 'PASS' : 'FAIL', evidence: ['authorizes:[]', 'permissions:false', 'model:none', 'network:none', `state:${manifests[0]?.state ?? 'none'}`] }
    })

    // Artifact gate over the bytes on disk, re-read by the CLI.
    const gate = await runScript('scripts/runtime.ts', ['readiness', '--pack', packFile, '--root', ctx.snap, '--batch', postsDir, '--json'], { cwd: ctx.tmp })
    run.calls += 1
    const gated = safeJson(gate.stdout) as ProductionReply & { stage?: string } | null
    await run.check('quality.gate_ran_on_bytes', 'FIX-06', () => {
      if (!drafted) return { verdict: 'NOT_TESTED', evidence: ['no posts'] }
      const svgCheck = gated ? checkOf(gated, 'artifact.svg_safety') : undefined
      const ok = !!gated && gated.stage === 'artifact' && !!svgCheck && gated.review?.visual_taste === 'needs_human_review' && gated.review.semantic === 'not_tested' && (gate.code === 0) === (gated.production_ready === 'ready')
      return { verdict: ok ? 'PASS' : 'FAIL', evidence: [`exit:${gate.code}`, `stage:${gated?.stage ?? 'none'}`, `production:${gated?.production_ready ?? 'none'}`, `svg_safety:${svgCheck?.verdict ?? 'none'}`, `visual_taste:${gated?.review?.visual_taste ?? 'none'}`] }
    })
    await run.check('quality.svg_safe', 'FIX-06', () => {
      if (!drafted) return { verdict: 'NOT_TESTED', evidence: ['no posts'] }
      const verdict = gated ? checkOf(gated, 'artifact.svg_safety')?.verdict : undefined
      return { verdict: verdict === 'pass' ? 'PASS' : 'FAIL', evidence: [`artifact.svg_safety:${verdict ?? 'none'}`] }
    })
    run.production = drafted && rendered.code === 0 ? 'produced' : 'blocked'

    // FIX-06: a banned claim in the copy is a hard fail (a pack whose copy carries a banned phrase, digest recomputed).
    await run.check('quality.banned_claim_fails', 'FIX-06', async () => {
      const banned = bannedPhrase(pack)
      if (!banned) return { verdict: 'NOT_TESTED', evidence: ['no approved banned-claim rule in this pack'] }
      const copy = withPhrase(pack, banned)
      if (!copy) return { verdict: 'NOT_TESTED', evidence: ['no approved message to carry the phrase'] }
      const file = path.join(ctx.tmp, 'banned-pack.json')
      fs.writeFileSync(file, JSON.stringify(copy))
      const result = await runScript('scripts/runtime.ts', ['readiness', '--pack', file, '--json'], { cwd: ctx.tmp })
      run.calls += 1
      const parsed = safeJson(result.stdout) as ProductionReply | null
      const claims = parsed ? checkOf(parsed, 'copy.claims') : undefined
      return { verdict: result.code === 3 && claims?.verdict === 'fail' && claims.blocks ? 'PASS' : 'FAIL', evidence: [`exit:${result.code}`, `copy.claims:${claims?.verdict ?? 'none'}`, `blocks:${String(claims?.blocks)}`] }
    })

    // FIX-05: tampered pack, unsafe output paths, and a brand that changed after the pack was built.
    await run.check('stale.tampered_pack_refused', 'FIX-05', async () => {
      const tampered = JSON.parse(JSON.stringify(reply)) as Envelope
      const item = Object.values(tampered.data!.sections).flat().find((entry) => entry.state === 'approved' && typeof entry.value === 'string')
      if (!item) return { verdict: 'NOT_TESTED', evidence: ['no approved text item'] }
      item.value = `${String(item.value)} (changed)`
      const file = path.join(ctx.tmp, 'tampered-pack.json')
      fs.writeFileSync(file, JSON.stringify(tampered))
      const target = path.join(ctx.tmp, 'tampered-out')
      const result = await runScript('scripts/runtime.ts', ['social-batch', '--pack', file, '--out', target], { cwd: ctx.tmp })
      run.calls += 1
      const written = fs.existsSync(target) ? fs.readdirSync(target).length : 0
      return { verdict: result.code !== 0 && written === 0 ? 'PASS' : 'FAIL', evidence: [`exit:${result.code}`, `code:${errorCode(result.stderr)}`, `files_written:${written}`] }
    })
    await run.check('stale.unsafe_output_refused', 'FIX-05', async () => {
      const real = path.join(ctx.tmp, 'link-target')
      fs.mkdirSync(real)
      const link = path.join(ctx.tmp, 'link-out')
      fs.symlinkSync(real, link)
      const busy = path.join(ctx.tmp, 'busy-out')
      fs.mkdirSync(busy)
      fs.writeFileSync(path.join(busy, 'keep.txt'), 'existing file\n')
      const inBrand = path.join(ctx.snap, 'brand', 'acceptance-out')
      const results = await Promise.all([link, busy, inBrand].map((target) => runScript('scripts/runtime.ts', ['social-batch', '--pack', packFile, '--out', target], { cwd: ctx.tmp })))
      run.calls += results.length
      const ok = results.every((result) => result.code !== 0) && fs.readdirSync(real).length === 0 && fs.readdirSync(busy).length === 1 && !fs.existsSync(inBrand)
      return { verdict: ok ? 'PASS' : 'FAIL', evidence: [`symlink_exit:${results[0]?.code}`, `non_empty_exit:${results[1]?.code}`, `inside_brand_exit:${results[2]?.code}`, `symlink_target_files:${fs.readdirSync(real).length}`] }
    })
    await run.check('stale.changed_brand_refused', 'FIX-05', async () => {
      const stale = path.join(ctx.tmp, 'stale')
      copyWorkspace(ctx.snap, stale)
      const changed = changeCitedFact(stale, pack, ctx.facts)
      if (!changed) return { verdict: 'NOT_TESTED', evidence: ['no cited free-text fact could be changed'] }
      const target = path.join(ctx.tmp, 'stale-out')
      const [readiness, render] = await Promise.all([
        runScript('scripts/runtime.ts', ['readiness', '--pack', packFile, '--root', stale, '--json'], { cwd: ctx.tmp }),
        runScript('scripts/runtime.ts', ['social-batch', '--pack', packFile, '--root', stale, '--out', target], { cwd: ctx.tmp }),
      ])
      run.calls += 2
      const parsed = safeJson(readiness.stdout) as ProductionReply | null
      const posts = fs.existsSync(path.join(target, 'posts')) ? fs.readdirSync(path.join(target, 'posts')).length : 0
      const drift = parsed ? checkOf(parsed, 'context.source_drift') : undefined
      const ok = parsed?.production_ready === 'not_ready' && drift?.verdict === 'fail' && drift.blocks && readiness.code === 3 && render.code !== 0 && errorCode(render.stderr) === 'stale_pack' && posts === 0
      return { verdict: ok ? 'PASS' : 'FAIL', evidence: [`changed:${changed}`, `readiness:${parsed?.production_ready ?? 'none'}`, `source_drift:${drift?.verdict ?? 'none'}`, `readiness_exit:${readiness.code}`, `render_exit:${render.code}`, `render_code:${errorCode(render.stderr)}`, `posts_written:${posts}`] }
    })
    await run.check('no_secrets', 'FIX-02', () => noLeak(run.transcript, ctx.secrets))
  } finally {
    await Promise.all([session.close(), guest.close()])
  }
  return run.finish()
}

interface BatchSummaryReply {
  status: string
  blockers: Array<{ code: string }>
  batch_sha256: string
  authorizes: unknown[]
  permissions: Record<string, unknown>
}

interface ManifestReply {
  post_id: string
  file: string
  sha256: string
  state: string
  direction: string
  context: { pack_sha256: string }
  sources: Array<{ source_id: string; source_revision: string | null }>
  renderer: { model: unknown; network: unknown }
  authorizes: unknown[]
  permissions: Record<string, unknown>
}

function readManifests(dir: string): ManifestReply[] {
  const posts = path.join(dir, 'posts')
  if (!fs.existsSync(posts)) return []
  return fs
    .readdirSync(posts)
    .filter((name) => name.endsWith('.manifest.json'))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(posts, name), 'utf8')) as ManifestReply)
}

const unescapeXml = (text: string): string => text.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** A server that refused to start for the expected reason, not one that crashed for another. */
function refused(started: Ran, reason: RegExp): boolean {
  return started.code !== 0 && started.code !== null && reason.test(started.stderr)
}

/** The error code a CLI printed (`code: message`), never the message itself. */
function errorCode(stderr: string): string {
  const match = /^([a-z_]+):/m.exec(stderr)
  return match?.[1] ?? 'none'
}

function gapCheck(pack: TaskContextPack | null, bank: Set<string>): { verdict: Verdict; evidence: string[] } {
  if (!pack) return { verdict: 'FAIL', evidence: ['no_pack'] }
  const g = gaps(pack)
  const unknown = g.question_ids.filter((id) => !bank.has(id))
  return { verdict: unknown.length === 0 ? 'PASS' : 'FAIL', evidence: [`owner_questions:${g.question_ids.length}`, `other_gaps:${g.other}`, `unknown_question_ids:${unknown.length}`, ...unknown.slice(0, 5)] }
}

/** The first banned phrase of the pack's approved banned-claim rule (split like the Content Bridge does). */
function bannedPhrase(pack: TaskContextPack): string | null {
  const rule = Object.values(pack.sections)
    .flat()
    .find((item) => item.key === 'banned_claims' && item.state === 'approved' && typeof item.value === 'string' && item.source_id !== 'business.marketing.availability_claim')
  if (!rule) return null
  const phrase = String(rule.value)
    .split(/[;\n؛،,]/)
    .map((part) => part.trim())
    .find((part) => part.length >= 3)
  return phrase ?? null
}

/** A copy of the pack with the banned phrase appended to every approved identity sentence, digest recomputed. */
function withPhrase(pack: TaskContextPack, phrase: string): TaskContextPack | null {
  const copy = JSON.parse(JSON.stringify(pack)) as TaskContextPack
  let changed = 0
  for (const item of copy.sections.identity) {
    if (item.state === 'approved' && typeof item.value === 'string' && item.key !== 'brand_name' && item.key !== 'sector') {
      item.value = `${item.value} ${phrase}`
      changed += 1
    }
  }
  if (changed === 0) return null
  copy.digests = { context_sha256: packDigest(copy) }
  return copy
}

/** Changes one approved free-text fact the pack cites, in a copy, through the owner's own change-and-approve flow. */
function changeCitedFact(root: string, pack: TaskContextPack, facts: Context['facts']): string | null {
  const engine = new InterviewEngine(root)
  const proof = ensureApprovalSecret(root)
  const cited = Object.values(pack.sections)
    .flat()
    .filter((item) => item.state === 'approved' && item.source_id && typeof facts[item.source_id]?.value === 'string')
    .map((item) => item.source_id!)
  const preferred = ['brand.strategy.purpose', 'brand.verbal.tagline', 'brand.strategy.promise', 'brand.strategy.differentiation']
  const order = [...new Set([...preferred.filter((id) => cited.includes(id)), ...cited])]
  for (const id of order) {
    // An approved fact changes only through a change request the owner approves (the normal owner flow).
    try {
      const change = engine.requestChange(id, `${String(facts[id]!.value)} (revised)`)
      if (engine.approveChange(change.id, proof, change.expected_version).kind === 'recorded') return id
    } catch {
      continue
    }
  }
  return null
}

// ---------------------------------------------------------------------------------------------------------------------
// Journey 3 (FIX-07): website brief

async function websiteBrief(ctx: Context): Promise<CaseRecord> {
  const run = new CaseRun('website_brief', 3, ['FIX-07'], 'marketing')
  const session = await mcpSession(ctx.snap, run.transcript, ctx.tokens.marketing)
  try {
    const replies: Record<string, Record<string, unknown>> = {}
    for (const locale of ['fa', 'en', 'tr'] as const) {
      replies[locale] = await session.call('task_context', { task_type: 'website_design', locale })
      run.calls += 1
    }
    const fa = replies.fa!
    run.pack = packOf(fa)
    const pack = run.pack
    await run.check('context.pack', 'FIX-07', () => packIntegrity(fa))
    await run.check('context.no_invented_facts', 'FIX-07', () => (pack ? traceItems(pack, ctx.facts) : { verdict: 'FAIL', evidence: ['no_pack'] }))
    await run.check('brief.gaps_are_existing_questions', 'FIX-07', () => {
      const result = gapCheck(pack, ctx.bank)
      const cta = pack ? Object.values(pack.sections).flat().find((item) => item.key === 'cta') : undefined
      return { ...result, evidence: [...result.evidence, `cta:${cta?.state ?? 'absent'}`] }
    })
    await run.check('brief.locales_unchanged', 'FIX-07', () => {
      const prints = (['fa', 'en', 'tr'] as const).map((locale) => {
        const p = packOf(replies[locale]!)
        return p ? approvedFingerprint(p) : 'none'
      })
      const ok = prints[0] !== 'none' && prints.every((print) => print === prints[0])
      return { verdict: ok ? 'PASS' : 'FAIL', evidence: prints.map((print, index) => `${['fa', 'en', 'tr'][index]}:${short(print)}`) }
    })
    const prod = productionOf(await session.call('production_readiness', { task_type: 'website_design', locale: 'fa' }))
    run.calls += 1
    await run.check('brief.no_deployment_claim', 'FIX-07', () => honestBrief(prod, 'rtl'))
    run.production = prod.production_ready === 'ready' ? 'produced' : 'brief_only'
    // No sitemap/section brief renderer exists: the agent drafts it from the pack and a person reviews it.
    run.add('brief.sitemap_sections_copy', 'FIX-07', 'NOT_TESTED', ['no brief renderer in this repository', 'the pack is the cited input; the drafted brief needs human review'])
    await run.check('no_secrets', 'FIX-02', () => noLeak(run.transcript, ctx.secrets))
  } finally {
    await session.close()
  }
  return run.finish()
}

// ---------------------------------------------------------------------------------------------------------------------
// Journey 4 (FIX-08): paid-ad brief

async function paidBrief(ctx: Context): Promise<CaseRecord> {
  const run = new CaseRun('paid_ad_brief', 4, ['FIX-08'], 'strategy-ads-read')
  const [ads, design] = await Promise.all([mcpSession(ctx.snap, run.transcript, ctx.tokens.ads), mcpSession(ctx.snap, run.transcript, ctx.tokens.design)])
  try {
    const reply = await ads.call('task_context', { task_type: 'paid_campaign_brief', locale: 'en' })
    const wrong = await design.call('task_context', { task_type: 'paid_campaign_brief', locale: 'en' })
    run.calls += 2
    run.pack = packOf(reply)
    const pack = run.pack
    const designPack = packOf(wrong)
    await run.check('context.pack', 'FIX-08', () => packIntegrity(reply))
    await run.check('context.no_invented_facts', 'FIX-08', () => (pack ? traceItems(pack, ctx.facts) : { verdict: 'FAIL', evidence: ['no_pack'] }))
    const paid = (p: TaskContextPack | null) => (p ? Object.values(p.sections).flat().find((item) => item.key === 'strategy.paid_media') : undefined)
    const paidMissing = (p: TaskContextPack | null) => p?.missing.find((entry) => entry.id === 'strategy.paid_media')
    await run.check('paid.profile_isolation', 'FIX-08', () => {
      const designItem = paid(designPack)
      const ok = designItem?.state === 'withheld' && paidMissing(designPack)?.reason === 'not_authorized' && paidMissing(pack)?.reason !== 'not_authorized'
      return { verdict: ok ? 'PASS' : 'FAIL', evidence: [`design:${designItem?.state ?? 'absent'}:${paidMissing(designPack)?.reason ?? 'none'}`, `ads:${paid(pack)?.state ?? 'absent'}:${paidMissing(pack)?.reason ?? 'served'}`] }
    })
    await run.check('paid.strategy_served', 'FIX-08', () => {
      const item = paid(pack)
      if (item?.state === 'approved') return { verdict: 'PASS', evidence: [`strategy:${item.source_id}`, `revision:${short(item.source_revision)}`] }
      return { verdict: 'NOT_TESTED', evidence: [`ads:${item?.state ?? 'absent'}:${paidMissing(pack)?.reason ?? 'none'}`, 'no approved, current paid_media strategy'] }
    })
    const prod = productionOf(await ads.call('production_readiness', { task_type: 'paid_campaign_brief', locale: 'tr' }))
    run.calls += 1
    await run.check('paid.no_spend_or_publish', 'FIX-08', () => {
      const brief = honestBrief(prod, 'ltr')
      const packsOk = [pack, designPack].every((p) => !!p && p.authorizes.length === 0 && noPermissions(p.permissions as unknown as Record<string, unknown>))
      return { verdict: brief.verdict === 'PASS' && packsOk ? 'PASS' : 'FAIL', evidence: [...brief.evidence, `packs_authorize_nothing:${packsOk}`] }
    })
    run.production = prod.production_ready === 'ready' ? 'produced' : 'brief_only'
    await run.check('paid.no_budget_leak', 'FIX-08', () => {
      const served = [pack, designPack].some((p) => p && Object.values(p.sections).flat().some((item) => item.source_id === 'business.marketing.budget' && item.state === 'approved'))
      const found = leaks(run.transcript, ctx.restricted)
      if (ctx.restricted.length === 0) return { verdict: served ? 'FAIL' : 'NOT_TESTED', evidence: ['restricted_values_recorded:0', `budget_fact_served:${served}`, 'nothing restricted to leak in this brand'] }
      return { verdict: !served && found.length === 0 ? 'PASS' : 'FAIL', evidence: [`restricted_values_checked:${ctx.restricted.length}`, `leaked:${found.length}`, `budget_fact_served:${served}`, `redacted:${(pack?.redacted ?? []).filter((entry) => entry.includes('restricted')).length}`] }
    })
    await run.check('no_secrets', 'FIX-02', () => noLeak(run.transcript, ctx.secrets))
  } finally {
    await Promise.all([ads.close(), design.close()])
  }
  return run.finish()
}
