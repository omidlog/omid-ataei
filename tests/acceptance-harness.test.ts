import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import Ajv from 'ajv'
import { ensureApprovalSecret } from '@brand-os/brand-core'
import { createDemoBrand, demoPack, openOwnerWorkspace, packSourceDrift, productionReadiness } from '@brand-os/brand-core/runtime'
import { createAcceptanceFixture } from '../scripts/acceptance/fixture.js'
import { leaks, runAcceptance, treeDigest } from '../scripts/acceptance/harness.js'
import { caseVerdict, type AcceptanceReport } from '../scripts/acceptance/model.js'
import { renderReport } from '../scripts/acceptance/report.js'
import { useTestKey } from './helpers/knowledge.js'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

/**
 * The pilot and workflow acceptance harness (fixes pack PR-F, docs-internal/ACCEPTANCE.md).
 *
 * The fixture is SYNTHETIC: the Runtime demo brand plus restricted canaries, a paid strategy, an approved motion fact
 * and a draft logo answer. No test reads a real brand. The four journeys run through the real stdio MCP server and the
 * real CLIs; the expected verdicts below are what the harness must record, including the honest NOT_TESTED.
 */

useTestKey()
const repo = path.resolve(import.meta.dirname, '..')
const validate = new Ajv({ allErrors: true, strict: false }).compile(JSON.parse(fs.readFileSync(path.join(repo, 'schemas/acceptance-report.schema.json'), 'utf8')) as object)
const temps: string[] = []
after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true })
})
const tempDir = (prefix: string): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  temps.push(dir)
  return dir
}

test('caseVerdict never rounds up: one FAIL fails, NOT_TESTED is not PASS, empty is NOT_TESTED', () => {
  const check = (verdict: 'PASS' | 'FAIL' | 'NOT_TESTED') => ({ id: 'x', fixes: 'FIX-02', verdict, evidence: [] })
  assert.equal(caseVerdict([]), 'NOT_TESTED')
  assert.equal(caseVerdict([check('PASS'), check('PASS')]), 'PASS')
  assert.equal(caseVerdict([check('PASS'), check('NOT_TESTED')]), 'NOT_TESTED')
  assert.equal(caseVerdict([check('NOT_TESTED'), check('FAIL'), check('PASS')]), 'FAIL')
})

test('leak check: a restricted value is found in a JSON reply also when JSON escapes it (audit O-10)', () => {
  const secrets = ['SYNTHETIC "quoted" budget', 'SYNTHETIC line one\nline two', 'SYNTHETIC back\\slash value', 'SYNTHETIC plain value']
  const replies = secrets.map((secret) => JSON.stringify({ ok: true, value: secret }))
  assert.deepEqual(leaks(replies, secrets), secrets)
  assert.deepEqual(leaks([JSON.stringify({ ok: true, value: 'nothing here' })], secrets), [])
})

test('production readiness: a cited fact changed since the pack was built blocks (owner-local source drift)', () => {
  const demo = createDemoBrand()
  try {
    const pack = demoPack(demo, 'fa')
    const engine = openOwnerWorkspace(demo.root, pack)
    assert.deepEqual(packSourceDrift(engine, pack), [])
    const current = productionReadiness({ pack, references: null, source_drift: [] })
    assert.equal(current.checks.find((check) => check.check_id === 'context.source_drift')?.verdict, 'pass')
    // Without --root nothing is compared and no check is added (existing projections are unchanged).
    assert.equal(productionReadiness({ pack, references: null }).checks.some((check) => check.check_id === 'context.source_drift'), false)

    const cited = pack.sources.find((source) => source.id === 'brand.strategy.purpose')
    assert.ok(cited, 'the demo pack cites brand.strategy.purpose')
    const proof = ensureApprovalSecret(demo.root)
    const change = demo.engine.requestChange('brand.strategy.purpose', 'SYNTHETIC DEMO purpose, revised')
    assert.equal(demo.engine.approveChange(change.id, proof, change.expected_version).kind, 'recorded')
    const drift = packSourceDrift(engine, pack)
    assert.deepEqual(drift, ['brand.strategy.purpose:revision_changed'])
    const stale = productionReadiness({ pack, references: null, source_drift: drift })
    assert.equal(stale.production_ready, 'not_ready')
    const blocker = stale.blockers.find((entry) => entry.check_id === 'context.source_drift')
    assert.equal(blocker?.code, 'stale_pack_sources')
    assert.equal(blocker?.rule_owner, 'task-context.pack')
    // The pack's own context fields are unchanged.
    assert.equal(stale.context.staleness, pack.staleness)
    assert.equal(stale.context.readiness, pack.readiness)
  } finally {
    demo.cleanup()
  }
})

test('acceptance harness: four journeys on the synthetic fixture, real MCP and CLI, evidence per case', async () => {
  const fixture = createAcceptanceFixture()
  const out = path.join(tempDir('brand-os-acceptance-test-'), 'out')
  let report: AcceptanceReport
  const before = treeDigest(path.join(fixture.root, 'brand'))
  try {
    report = await runAcceptance({ root: fixture.root, out, origin: 'synthetic', canaries: fixture.canaries })
    assert.equal(treeDigest(path.join(fixture.root, 'brand')), before, 'the given checkout is never written')
  } finally {
    fixture.cleanup()
  }
  assert.ok(validate(report), JSON.stringify(validate.errors))
  const failed = report.cases.flatMap((record) => record.checks.filter((check) => check.verdict === 'FAIL').map((check) => `${record.case_id}/${check.id}: ${check.evidence.join(' ')}`))
  assert.deepEqual(failed, [])
  assert.equal(report.workspace.root_unchanged, true)
  assert.deepEqual(report.authorizes, [])

  const byId = Object.fromEntries(report.cases.map((record) => [record.case_id, record]))
  const verdictOf = (caseId: string, checkId: string) => byId[caseId]!.checks.find((check) => check.id === checkId)?.verdict

  // Journey 2: one visual. No renderer: an honest block, never artwork. Missing pose stays missing; drift detected.
  assert.equal(byId.single_visual!.verdict, 'PASS')
  assert.equal(byId.single_visual!.production, 'blocked')
  assert.equal(byId.single_visual!.outputs.length, 0)
  for (const id of ['legacy.logo_motion_ids', 'reference.approved_verified', 'reference.missing_stays_missing', 'reference.no_provider_upload', 'reference.checksum_drift', 'production.honest_block']) {
    assert.equal(verdictOf('single_visual', id), 'PASS', id)
  }

  // Journey 1: the owner's Persian sentence → social_batch × 10 → ten SVGs + ten manifests, pinned, RTL, no writes.
  const posts = byId.ten_instagram_posts!
  assert.equal(posts.verdict, 'PASS')
  assert.equal(posts.production, 'produced')
  assert.equal(posts.outputs.filter((file) => file.file.endsWith('.svg')).length, 10)
  for (const id of ['fresh_session.classified', 'mcp.gated', 'posts.ten_files', 'posts.pinned_and_cited', 'posts.rtl_for_persian_copy', 'posts.no_brand_writes', 'posts.no_publication', 'quality.banned_claim_fails', 'stale.tampered_pack_refused', 'stale.unsafe_output_refused', 'stale.changed_brand_refused']) {
    assert.equal(verdictOf('ten_instagram_posts', id), 'PASS', id)
  }
  const svgs = fs.readdirSync(path.join(out, 'ten-instagram-posts', 'batch', 'posts')).filter((name) => name.endsWith('.svg'))
  assert.equal(svgs.length, 10)

  // Journey 3: a brief, never a site. The drafted sitemap has no renderer: NOT_TESTED, not PASS.
  assert.equal(byId.website_brief!.verdict, 'NOT_TESTED')
  assert.equal(byId.website_brief!.production, 'brief_only')
  assert.equal(verdictOf('website_brief', 'brief.no_deployment_claim'), 'PASS')
  assert.equal(verdictOf('website_brief', 'brief.sitemap_sections_copy'), 'NOT_TESTED')

  // Journey 4: the paid strategy only under the ads profile, no budget, no spend.
  assert.equal(byId.paid_ad_brief!.verdict, 'PASS')
  for (const id of ['paid.profile_isolation', 'paid.strategy_served', 'paid.no_spend_or_publish', 'paid.no_budget_leak']) assert.equal(verdictOf('paid_ad_brief', id), 'PASS', id)

  // The report itself carries no canary, token or brand path.
  const written = fs.readFileSync(path.join(out, 'ten-instagram-posts', 'pack.json'), 'utf8')
  assert.ok(written.length > 0)
  const json = JSON.stringify(report)
  for (const canary of fixture.canaries) assert.equal(json.includes(canary), false, 'canary in report')
  assert.equal(json.includes(fixture.root), false, 'workspace path in report')
  assert.equal(json.includes(os.tmpdir()), false, 'temp path in report')

  // The printed summary in fa is RTL-marked; en and tr print too.
  assert.ok(renderReport(report, 'fa').startsWith('‏'))
  assert.ok(renderReport(report, 'tr').includes('Kabul raporu'))
})

test('brand:acceptance CLI: usage errors and an unsafe --out are refused before anything runs', () => {
  const env = { ...process.env }
  delete env.BRAND_OS_AGENT_TOKEN
  const cli = (args: string[]) => spawnSync(NODE, tsxArgs('scripts/acceptance.ts', args), { cwd: repo, encoding: 'utf8', env, input: '', timeout: 120_000 })
  assert.equal(cli(['--out', path.join(tempDir('acc-cli-'), 'o')]).status, 2, 'neither --demo nor --root')
  assert.equal(cli(['--demo']).status, 2, 'no --out')
  assert.equal(cli(['--demo', '--out', path.join(tempDir('acc-cli-'), 'o'), '--lang', 'de']).status, 2, 'unknown language')
  const busy = tempDir('acc-cli-busy-')
  fs.writeFileSync(path.join(busy, 'keep.txt'), 'x')
  const refused = cli(['--demo', '--out', busy])
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /acceptance_failed: --out must be empty/)
  assert.deepEqual(fs.readdirSync(busy), ['keep.txt'])
  const tokened = spawnSync(NODE, tsxArgs('scripts/acceptance.ts', ['--demo', '--out', path.join(tempDir('acc-cli-'), 'o')]), { cwd: repo, encoding: 'utf8', env: { ...env, BRAND_OS_AGENT_TOKEN: 'not-a-real-token' }, input: '', timeout: 120_000 })
  assert.notEqual(tokened.status, 0, 'refused under an agent token')
})

test('--out through a linked parent folder that leads into brand/ is refused before anything is created (audit)', async () => {
  const fixture = createAcceptanceFixture()
  try {
    const linkParent = path.join(tempDir('acc-link-'), 'via')
    fs.symlinkSync(path.join(fixture.root, 'brand'), linkParent)
    const before = treeDigest(path.join(fixture.root, 'brand'))
    await assert.rejects(runAcceptance({ root: fixture.root, out: path.join(linkParent, 'acc', 'out'), origin: 'synthetic', canaries: fixture.canaries }), /outside any brand\/ folder/)
    assert.equal(fs.existsSync(path.join(fixture.root, 'brand', 'acc')), false, 'nothing created inside brand/')
    assert.equal(treeDigest(path.join(fixture.root, 'brand')), before)
    const linkRoot = path.join(tempDir('acc-link-'), 'root')
    fs.symlinkSync(fixture.root, linkRoot)
    await assert.rejects(runAcceptance({ root: fixture.root, out: linkRoot, origin: 'synthetic', canaries: fixture.canaries }), /outside the brand checkout/)
  } finally {
    fixture.cleanup()
  }
})
