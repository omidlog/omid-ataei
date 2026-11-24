import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { parse, stringify } from 'yaml'
import {
  addEvidence,
  applyInit,
  buildNamedDocument,
  ensureApprovalSecret,
  forgetKeychainProof,
  InterviewEngine,
  readEvidence,
  readFacts,
  readKeychainProof,
  readProposals,
  resolveApprovalProof,
  storeKeychainProof,
  writeStarterWorkspace,
  type KeychainRunner,
} from '@brand-os/brand-core'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')
const SLUG = 'pending-brand'
const PURPOSE = 'brand.strategy.purpose'
const VISION = 'brand.strategy.vision'
const TRADE_NAME = 'business.identity.trade_name'
const MISSION = 'brand.strategy.promise'
const ASSET = 'asset.photo.team'

function brand(): { root: string; engine: InterviewEngine; proof: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-pending-'))
  writeStarterWorkspace(root)
  applyInit(root, { name: 'Pending Brand', slug: SLUG, industry: 'education', language: 'en', languages: ['en'], mascot: false, gamification: false, publish: 'private' })
  return { root, engine: new InterviewEngine(root), proof: ensureApprovalSecret(root) }
}

function draft(engine: InterviewEngine, id: string, value: string): void {
  const result = engine.changeAnswer(id, value)
  assert.equal(result.kind, 'recorded', result.message)
}

/** Hash of every file under brand/ so a refused call can be shown to write nothing at all. */
function snapshot(root: string): string {
  const hash = crypto.createHash('sha256')
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else hash.update(`${path.relative(root, full)}\0`).update(fs.readFileSync(full))
    }
  }
  walk(path.join(root, 'brand'))
  return hash.digest('hex')
}

/** The CLI with no inherited proof or token, and the Keychain switched off so no test touches a real one. */
function cli(root: string, args: string[], env: Record<string, string> = {}, input = '') {
  const base: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && key !== 'BRAND_OS_AGENT_TOKEN' && key !== 'BRAND_OS_APPROVAL_PROOF') base[key] = value
  }
  return spawnSync(NODE, tsxArgs('scripts/brand.ts', args), { cwd: root, env: { ...base, BRAND_OS_KEYCHAIN: 'off', ...env }, input, encoding: 'utf8', timeout: 60_000 })
}

function addAsset(root: string, id: string, bytes: Buffer, checksum?: string): void {
  const rel = `brand/assets/photos/${id.split('.').at(-1)}.png`
  fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true })
  fs.writeFileSync(path.join(root, rel), bytes)
  const file = path.join(root, 'brand/assets/asset-manifest.yaml')
  const manifest = parse(fs.readFileSync(file, 'utf8')) as { assets: Array<Record<string, unknown>> }
  manifest.assets.push({
    id,
    name: `Team photo ${id}`,
    status: 'draft',
    owner: 'design',
    version: '0.1.0',
    visibility: 'internal',
    license: 'Owned by the brand',
    attribution: null,
    usage: 'About page.',
    restrictions: null,
    path: rel,
    present: true,
    checksum_sha256: checksum ?? crypto.createHash('sha256').update(bytes).digest('hex'),
    mime: 'image/png',
    preview: rel,
    tags: ['photo'],
  })
  fs.writeFileSync(file, stringify(manifest))
}

function assetStatus(root: string, id: string): string | undefined {
  const manifest = parse(fs.readFileSync(path.join(root, 'brand/assets/asset-manifest.yaml'), 'utf8')) as { assets: Array<{ id: string; status: string }> }
  return manifest.assets.find((item) => item.id === id)?.status
}

/** A fact draft, a change proposal, a stale proposal, evidence, a good asset, a bad asset and a tentative draft. */
function mixed(): { root: string; engine: InterviewEngine; proof: string; change: string; stale: string } {
  const b = brand()
  draft(b.engine, VISION, 'Every adult learner keeps a daily practice.')
  draft(b.engine, TRADE_NAME, 'Pending Learners')
  // An approved fact with one live change and one stale change.
  draft(b.engine, PURPOSE, 'Help every learner practise.')
  assert.equal(b.engine.approve(PURPOSE, 'owner', b.proof).kind, 'recorded')
  const stale = b.engine.requestChange(PURPOSE, 'An older idea.').id
  const first = b.engine.approvals().approveChange(stale, b.proof, 1)
  assert.equal(first.kind, 'recorded', 'v2 is approved, so the next proposal against v1 would be stale')
  const staleAgain = b.engine.approvals().requestChange(PURPOSE, 'Another idea.')
  // Make the second proposal stale by hand-pinning it to version 1 (the approved version is now 2).
  const proposalsFile = path.join(b.root, 'brand/.private/proposals.json')
  const stored = JSON.parse(fs.readFileSync(proposalsFile, 'utf8')) as { proposals: Array<{ id: string; expected_version: number }> }
  stored.proposals.find((item) => item.id === staleAgain.id)!.expected_version = 1
  fs.writeFileSync(proposalsFile, JSON.stringify(stored))
  const change = b.engine.requestChange(PURPOSE, 'Help every adult learner practise a little each day.').id
  // A tentative draft from an interview proposal is never approved in bulk.
  const mission = b.engine.question(MISSION)!
  b.engine.recordProposal(mission, 'We may run evening classes.', { state: 'tentative', confidence: 0.5, quotation: 'We may run evening classes.', sourceReference: 'test', uncertainty: 'Owner said maybe.' })
  addEvidence(b.root, b.engine.questions(), { claim_id: VISION, kind: 'verification', source_type: 'link', reference: 'https://example.com/report' })
  addAsset(b.root, ASSET, Buffer.from('not really a png but bytes are bytes'))
  addAsset(b.root, 'asset.photo.bad', Buffer.from('other bytes'), '0'.repeat(64))
  return { ...b, change, stale: staleAgain.id }
}

// --- BOS-01 + BOS-07: dry run --------------------------------------------------------------

test('--all-pending --dry-run lists every kind, says it is a dry run, and writes nothing', () => {
  const b = mixed()
  const before = snapshot(b.root)
  const text = cli(b.root, ['approve', '--all-pending', '--dry-run'])
  assert.equal(text.status, 0, text.stderr)
  assert.match(text.stdout, /^DRY RUN: 6 items would be approved\. Nothing was changed\./)
  assert.match(text.stdout, /not the review queue and not an approval result/)
  assert.doesNotMatch(text.stdout, /Review queue|need a decision/, 'it is not the review queue')
  for (const heading of ['Facts (3)', 'Change proposals (2)', 'Evidence awaiting verification (1)', 'Draft assets (']) assert.ok(text.stdout.includes(heading), heading)
  assert.match(text.stdout, new RegExp(`would approve\\s+${VISION}`))
  assert.match(text.stdout, new RegExp(`would approve\\s+${b.change}`))
  assert.match(text.stdout, new RegExp(`would skip \\(stale\\)\\s+${b.stale}`))
  assert.match(text.stdout, new RegExp(`would skip\\s+${MISSION}\\s+Tentative`))
  assert.match(text.stdout, /would skip\s+asset\.logo\.example-wordmark\s+Template example/)
  assert.match(text.stdout, /would approve\s+ev-0001/)

  const json = cli(b.root, ['approve', '--all-pending', '--dry-run', '--json', '--exclude', `${TRADE_NAME},nope.id`])
  assert.equal(json.status, 0, json.stderr)
  const report = JSON.parse(json.stdout) as { mode: string; dry_run: boolean; nothing_changed: boolean; notice: string; would_approve: number; items: Array<{ id: string; kind: string; decision: string; reason: string }>; unmatched_excludes: string[] }
  assert.equal(report.mode, 'dry_run')
  assert.equal(report.dry_run, true)
  assert.equal(report.nothing_changed, true)
  assert.equal(report.notice, 'DRY RUN: 5 items would be approved. Nothing was changed.')
  assert.equal(report.would_approve, 5)
  const excluded = report.items.find((item) => item.id === TRADE_NAME)
  assert.deepEqual([excluded?.decision, excluded?.reason], ['would_skip', 'Excluded with --exclude.'])
  assert.deepEqual(report.unmatched_excludes, ['nope.id'])
  assert.ok(report.items.every((item) => item.decision === 'would_approve' || item.decision === 'would_skip'))
  assert.ok(!('state' in (report.items[0] as object)), 'no review-queue fields')
  assert.equal(snapshot(b.root), before, 'a dry run writes nothing')
})

test('--module --dry-run is a dry-run plan too, not the review queue', () => {
  const b = brand()
  draft(b.engine, TRADE_NAME, 'Pending Learners')
  const before = snapshot(b.root)
  const dry = cli(b.root, ['approve', '--ids', `${TRADE_NAME},business.identity.legal_name,nope.id`, '--dry-run'])
  assert.equal(dry.status, 0, dry.stderr)
  assert.match(dry.stdout, /^DRY RUN: 1 item would be approved\. Nothing was changed\./)
  assert.match(dry.stdout, new RegExp(`would approve\\s+${TRADE_NAME}`))
  assert.match(dry.stdout, /would skip\s+business\.identity\.legal_name\s+No answer recorded\./)
  assert.match(dry.stdout, /would skip\s+nope\.id\s+No question or pending change has this id\./)
  assert.doesNotMatch(dry.stdout, /# Review queue/)
  assert.equal(snapshot(b.root), before)
})

// --- BOS-01: governance ----------------------------------------------------------------------

test('--all-pending refuses an agent token and a proof on argv; a wrong proof writes nothing', () => {
  const b = mixed()
  const before = snapshot(b.root)
  const asAgent = cli(b.root, ['approve', '--all-pending'], { BRAND_OS_AGENT_TOKEN: 'bos_agent_anything', BRAND_OS_APPROVAL_PROOF: b.proof })
  assert.equal(asAgent.status, 2)
  assert.match(asAgent.stderr, /BRAND_OS_AGENT_TOKEN/)
  const agentDry = cli(b.root, ['approve', '--all-pending', '--dry-run'], { BRAND_OS_AGENT_TOKEN: 'bos_agent_anything' })
  assert.equal(agentDry.status, 2, 'even the preview is an owner command')

  const onArgv = cli(b.root, ['approve', '--all-pending', '--proof', b.proof])
  assert.equal(onArgv.status, 2)
  assert.match(onArgv.stderr, /--proof is not accepted/)
  assert.ok(!`${onArgv.stdout}${onArgv.stderr}`.includes(b.proof), 'the proof is never echoed')

  const wrong = cli(b.root, ['approve', '--all-pending', '--json'], { BRAND_OS_APPROVAL_PROOF: 'not-the-proof' })
  assert.equal(wrong.status, 1)
  const rejected = JSON.parse(wrong.stdout) as { proof: string; approved: number; results: Array<{ outcome: string }> }
  assert.equal(rejected.proof, 'rejected')
  assert.equal(rejected.approved, 0)
  assert.ok(rejected.results.every((item) => item.outcome === 'refused'))
  const none = cli(b.root, ['approve', '--all-pending'], {}, '')
  assert.equal(none.status, 1)
  assert.match(none.stdout, /APPROVAL REFUSED: proof rejected\. Nothing was changed\./)
  assert.equal(snapshot(b.root), before, 'refused runs wrote nothing')

  const mixedFlags = cli(b.root, ['approve', '--all-pending', '--module', 'brand-strategy'])
  assert.equal(mixedFlags.status, 2)
  const stray = cli(b.root, ['approve', '--module', 'brand-strategy', '--exclude', VISION])
  assert.equal(stray.status, 2)
})

test('--all-pending approves a mixed batch with one proof and reports every item', () => {
  const b = mixed()
  // The proof arrives on piped stdin, as `< brand/.private/approval-secret` would send it.
  const run = cli(b.root, ['approve', '--all-pending', '--exclude', TRADE_NAME], {}, `${b.proof}\n`)
  assert.equal(run.status, 1, 'the bad asset is refused, so the run is not ok')
  assert.match(run.stdout, /^APPROVAL RESULT: 4 approved, \d+ skipped, 1 refused, 1 stale\. Nothing was published\./)
  const facts = readFacts(b.root, 'approved', SLUG)
  assert.equal(facts[VISION]?.version, 1)
  assert.equal(facts[TRADE_NAME], undefined, 'an excluded draft stays a draft')
  assert.equal(facts[MISSION], undefined, 'a tentative draft is never approved in bulk')
  assert.equal(facts[PURPOSE]?.version, 3, 'the live change replaced version 2')
  assert.equal(facts[PURPOSE]?.value, 'Help every adult learner practise a little each day.')
  const proposals = readProposals(b.root)
  assert.equal(proposals.find((item) => item.id === b.change)?.status, 'approved')
  assert.equal(proposals.find((item) => item.id === b.stale)?.status, 'pending', 'a stale proposal is left alone')
  assert.equal(readEvidence(b.root).find((item) => item.id === 'ev-0001')?.status, 'verified')
  assert.equal(assetStatus(b.root, ASSET), 'approved')
  assert.equal(assetStatus(b.root, 'asset.photo.bad'), 'draft', 'the checksum mismatch is refused by the asset rules')
  assert.equal(assetStatus(b.root, 'asset.logo.example-wordmark'), 'draft', 'template examples are never approved in bulk')
  for (const line of [new RegExp(`approved\\s+${VISION}`), new RegExp(`stale\\s+${b.stale}`), /refused\s+asset\.photo\.bad/, new RegExp(`skipped\\s+${TRADE_NAME}\\s+Excluded`)]) assert.match(run.stdout, line)
  const policy = parse(fs.readFileSync(path.join(b.root, 'brand/publication-policy.yaml'), 'utf8')) as { approved_fact_ids: string[] }
  assert.deepEqual(policy.approved_fact_ids, [], 'approval never publishes')

  const again = cli(b.root, ['approve', '--all-pending', '--json'], { BRAND_OS_APPROVAL_PROOF: b.proof })
  const second = JSON.parse(again.stdout) as { approved: number; results: Array<{ id: string; outcome: string }> }
  assert.equal(second.approved, 1, 'only the previously excluded draft is left')
  assert.equal(second.results.find((item) => item.id === TRADE_NAME)?.outcome, 'approved')
})

test('with nothing approvable, --all-pending reads no proof and changes nothing', () => {
  const b = brand()
  const before = snapshot(b.root)
  const run = cli(b.root, ['approve', '--all-pending', '--json'])
  assert.equal(run.status, 0, run.stderr)
  const result = JSON.parse(run.stdout) as { proof: string; approved: number }
  assert.deepEqual([result.proof, result.approved], ['not_needed', 0])
  assert.equal(snapshot(b.root), before)
})

// --- BOS-01: proof resolver and Keychain ------------------------------------------------------

function fakeKeychain(): { runner: KeychainRunner; calls: Array<{ args: string[]; stdin?: string }>; store: Map<string, string> } {
  const store = new Map<string, string>()
  const calls: Array<{ args: string[]; stdin?: string }> = []
  const runner: KeychainRunner = (args, stdin) => {
    calls.push({ args, stdin })
    const account = (list: string[]) => list[list.indexOf('-a') + 1] ?? ''
    if (args[0] === 'find-generic-password') {
      const value = store.get(account(args))
      return value === undefined ? { status: 44, stdout: '' } : { status: 0, stdout: `${value}\n` }
    }
    if (args[0] === 'delete-generic-password') return { status: store.delete(account(args)) ? 0 : 44, stdout: '' }
    if (args[0] === '-i' && stdin) {
      const match = stdin.match(/-a (\S+) .*-w "([^"]+)"/)
      if (!match) return { status: 1, stdout: '' }
      store.set(match[1]!, match[2]!)
      return { status: 0, stdout: '' }
    }
    return { status: 1, stdout: '' }
  }
  return { runner, calls, store }
}

test('the proof resolver: env, then piped stdin, then Keychain, then the hidden prompt', async () => {
  const order: string[] = []
  const sources = (env: NodeJS.ProcessEnv, isTTY: boolean) => ({
    env,
    isTTY,
    readStdin: async () => (order.push('stdin'), 'from-stdin'),
    keychain: () => (order.push('keychain'), 'from-keychain'),
    prompt: async () => (order.push('prompt'), 'from-prompt'),
  })
  assert.deepEqual(await resolveApprovalProof(sources({ BRAND_OS_APPROVAL_PROOF: 'from-env' }, false)), { proof: 'from-env', source: 'env' })
  assert.equal(order.length, 0, 'the environment wins without reading anything else')
  assert.deepEqual(await resolveApprovalProof(sources({}, false)), { proof: 'from-stdin', source: 'stdin' })
  assert.deepEqual(await resolveApprovalProof({ ...sources({}, false), readStdin: async () => '' }), { proof: 'from-keychain', source: 'keychain' })
  assert.deepEqual(await resolveApprovalProof({ ...sources({}, true), keychain: () => undefined }), { proof: 'from-prompt', source: 'prompt' })
  order.length = 0
  const agent = await resolveApprovalProof({ ...sources({ BRAND_OS_AGENT_TOKEN: 'bos_agent_x' }, true), prompt: async () => undefined })
  assert.deepEqual(agent, { proof: undefined, source: 'none' })
  assert.ok(!(order as string[]).includes('keychain'), 'the Keychain is never consulted under an agent token')
})

test('Keychain storage: opt-in, macOS only, secret on stdin not argv, never printed, removable', () => {
  const b = brand()
  const fake = fakeKeychain()
  const darwin = { runner: fake.runner, platform: 'darwin' as const, env: {} }
  assert.equal(readKeychainProof(SLUG, darwin), undefined, 'no entry, no proof')
  const stored = storeKeychainProof(b.root, SLUG, darwin)
  assert.equal(stored.outcome, 'stored')
  assert.ok(!stored.message.includes(b.proof), 'the value is never in the message')
  const add = fake.calls.find((call) => call.args[0] === '-i')
  assert.ok(add && !add.args.join(' ').includes(b.proof), 'the secret never reaches argv')
  assert.ok(add?.stdin?.includes('-s brand-os-approval') && add.stdin.includes(`-a ${SLUG}`))
  assert.equal(readKeychainProof(SLUG, darwin), b.proof)
  assert.equal(readKeychainProof(SLUG, { ...darwin, env: { BRAND_OS_AGENT_TOKEN: 'bos_agent_x' } }), undefined, 'never under an agent token')
  assert.equal(readKeychainProof(SLUG, { ...darwin, platform: 'linux' }), undefined, 'macOS only')
  assert.equal(readKeychainProof(SLUG, { ...darwin, env: { BRAND_OS_KEYCHAIN: 'off' } }), undefined)
  assert.equal(storeKeychainProof(b.root, SLUG, { ...darwin, env: { BRAND_OS_AGENT_TOKEN: 'bos_agent_x' } }).outcome, 'refused')
  assert.equal(storeKeychainProof(b.root, SLUG, { ...darwin, platform: 'linux' }).outcome, 'unsupported')
  assert.equal(forgetKeychainProof(SLUG, darwin).outcome, 'removed')
  assert.equal(readKeychainProof(SLUG, darwin), undefined)
  assert.equal(forgetKeychainProof(SLUG, darwin).outcome, 'not_found')
})

test('brand:doctor refuses Keychain storage under an agent token', () => {
  const b = brand()
  const run = cli(b.root, ['doctor', '--store-proof-keychain'], { BRAND_OS_AGENT_TOKEN: 'bos_agent_x' })
  assert.equal(run.status, 2)
  assert.match(run.stderr, /Refusing while BRAND_OS_AGENT_TOKEN is set/)
  assert.ok(!`${run.stdout}${run.stderr}`.includes(b.proof))
})

// --- BOS-04: --change -------------------------------------------------------------------------

test('--change files a chg- proposal against the approved version and prints the diff and impact', () => {
  const b = brand()
  draft(b.engine, PURPOSE, 'Help every learner practise.')
  assert.equal(b.engine.approve(PURPOSE, 'owner', b.proof).kind, 'recorded')
  const run = cli(b.root, ['interview', '--question', PURPOSE, '--change', 'Help every adult learner practise daily.', '--reason', 'Narrower audience', '--json'])
  assert.equal(run.status, 0, run.stderr)
  const out = JSON.parse(run.stdout) as { ok: boolean; kind: string; change_id: string; expected_version: number; approved: { version: number; value: string }; proposed_value: string; reason: string; impact: { documents: string[]; questions: string[] } }
  assert.equal(out.kind, 'change_proposed')
  assert.match(out.change_id, /^chg-[0-9a-f]{12}$/)
  assert.equal(out.expected_version, 1)
  assert.deepEqual(out.approved, { version: 1, value: 'Help every learner practise.' })
  assert.equal(out.proposed_value, 'Help every adult learner practise daily.')
  assert.equal(out.reason, 'Narrower audience')
  assert.ok(out.impact.documents.length + out.impact.questions.length > 0, 'impacted ids are listed')
  assert.equal(readFacts(b.root, 'approved', SLUG)[PURPOSE]?.value, 'Help every learner practise.', 'the approved revision stays canonical')
  assert.equal(readProposals(b.root).find((item) => item.id === out.change_id)?.reason, 'Narrower audience')

  const text = cli(b.root, ['interview', '--question', PURPOSE, '--change', 'A competing idea.'])
  assert.equal(text.status, 0, text.stderr)
  assert.match(text.stdout, /- approved v1: Help every learner practise\./)
  assert.match(text.stdout, /\+ proposed \(chg-[0-9a-f]{12}\): A competing idea\./)
  assert.match(text.stdout, /Impacted documents: /)

  // Stale handling is unchanged: approve the first change, the competing one is now stale.
  assert.equal(b.engine.approvals().approveChange(out.change_id, b.proof, 1).kind, 'recorded')
  const review = cli(b.root, ['review', '--ids', PURPOSE])
  assert.match(review.stdout, /\(stale\): A competing idea\./)
  assert.match(review.stdout, /Reason: Narrower audience|Approved v2/)

  const disposition = cli(b.root, ['interview', '--question', PURPOSE, '--change', 'unknown', '--json'])
  assert.equal(disposition.status, 1)
  const restricted = cli(b.root, ['interview', '--question', 'business.finance.costs', '--change', '1000 a month'])
  assert.equal(restricted.status, 1)
  assert.match(restricted.stderr, /restricted/)
})

// --- BOS-06: --origin agent_suggestion -------------------------------------------------------

test('--origin agent_suggestion records agent origin with explicit owner confirmation, visible everywhere', () => {
  const b = brand()
  const run = cli(b.root, ['interview', '--question', VISION, '--answer', 'Every adult keeps a daily practice.', '--origin', 'agent_suggestion', '--json'])
  assert.equal(run.status, 0, run.stderr)
  assert.equal((JSON.parse(run.stdout) as { origin: string }).origin, 'agent_suggestion')
  const alias = cli(b.root, ['interview', '--question', TRADE_NAME, '--answer', 'Pending Learners', '--suggested-by', 'agent'])
  assert.equal(alias.status, 0, alias.stderr)
  const owner = cli(b.root, ['interview', '--question', PURPOSE, '--answer', 'Help every learner practise.'])
  assert.equal(owner.status, 0, owner.stderr)
  const bad = cli(b.root, ['interview', '--question', MISSION, '--answer', 'x y z', '--origin', 'model'])
  assert.equal(bad.status, 2)

  const ledger = parse(fs.readFileSync(path.join(b.root, 'brand/interview/answer-ledger.yaml'), 'utf8')) as { records: Array<Record<string, unknown>> }
  const latest = (id: string) => ledger.records.filter((item) => item.question_id === id).at(-1)!
  assert.deepEqual([latest(VISION).source_type, latest(VISION).authority, latest(VISION).suggested_by], ['agent_suggestion', 'confirmed_by_owner', 'agent'])
  assert.deepEqual([latest(TRADE_NAME).source_type, latest(TRADE_NAME).suggested_by], ['agent_suggestion', 'agent'])
  assert.deepEqual([latest(PURPOSE).source_type, latest(PURPOSE).suggested_by], ['owner', undefined])
  assert.equal(ledger.records.some((item) => item.question_id === MISSION), false, 'a bad --origin records nothing')

  const review = cli(b.root, ['review', '--ids', `${VISION},${PURPOSE}`])
  assert.match(review.stdout, /Origin: Agent-suggested, owner-confirmed/)
  assert.equal((review.stdout.match(/Agent-suggested, owner-confirmed/g) ?? []).length, 1, 'the owner answer is not labelled')
  const json = cli(b.root, ['review', '--ids', VISION, '--json'])
  assert.equal((JSON.parse(json.stdout) as { items: Array<{ draft: { provenance: string } }> }).items[0]?.draft.provenance, 'agent_suggested_owner_confirmed')

  const drafts = fs.readdirSync(path.join(b.root, 'brand/generated/drafts'), { recursive: true }).map(String).filter((name) => name.endsWith('.md'))
  const text = drafts.map((name) => fs.readFileSync(path.join(b.root, 'brand/generated/drafts', name), 'utf8')).join('\n')
  assert.match(text, /Origin: agent-suggested, owner-confirmed/)

  const engine = new InterviewEngine(b.root)
  const items = () => buildNamedDocument(engine, 'brand-book', 'internal').sections.flatMap((section) => section.items)
  assert.equal(items().find((item) => item.id === VISION)?.provenance, 'agent_suggested_owner_confirmed')
  assert.equal(items().find((item) => item.id === VISION)?.tag, 'assumption', 'a confirmed suggestion is a draft, not template guidance')
  assert.equal(items().find((item) => item.id === PURPOSE)?.provenance, undefined)
  // Approval keeps the agent origin.
  assert.equal(engine.approve(VISION, 'owner', b.proof).kind, 'recorded')
  assert.equal(items().find((item) => item.id === VISION)?.provenance, 'agent_suggested_owner_confirmed')
  const approvedRecord = (parse(fs.readFileSync(path.join(b.root, 'brand/interview/answer-ledger.yaml'), 'utf8')) as { records: Array<Record<string, unknown>> }).records.filter((item) => item.question_id === VISION).at(-1)!
  assert.deepEqual([approvedRecord.status, approvedRecord.source_type, approvedRecord.suggested_by], ['approved', 'agent_suggestion', 'agent'])
  const publicItems = buildNamedDocument(engine, 'brand-book', 'public').sections.flatMap((section) => section.items)
  assert.ok(publicItems.every((item) => item.provenance === undefined), 'public editions carry no provenance metadata')
})

// --- BOS-01: docs never put a placeholder next to a `<` redirect ------------------------------

test('docs and CLI help never show a <placeholder> in a command that uses a < redirect', () => {
  const repo = path.resolve(import.meta.dirname, '..')
  const files = ['README.md', 'AGENTS.md']
  for (const dir of ['docs-internal', 'agent-skills', 'scripts']) {
    for (const name of fs.readdirSync(path.join(repo, dir), { recursive: true }).map(String)) {
      if (/\.(md|ts)$/.test(name)) files.push(path.join(dir, name))
    }
  }
  const offenders: string[] = []
  for (const file of files) {
    for (const [index, line] of fs.readFileSync(path.join(repo, file), 'utf8').split('\n').entries()) {
      // A redirect: ` < path` (a `<` followed by a space and a path-like word). A placeholder: `<word>` or `<a,b>`.
      if (/\s<\s+[\w./~$-]/.test(line) && /<[A-Za-z][\w.,…-]*>/.test(line)) offenders.push(`${file}:${index + 1}`)
    }
  }
  assert.deepEqual(offenders, [])
})
