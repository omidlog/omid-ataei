import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  AUDIT_TEXT,
  auditVisualModules,
  catalogCheck,
  evaluateGate,
  frameworkClaimErrors,
  PENDING_VISUAL_MODULES,
  RELEASE_GATE_POLICY_PATH,
  standardVerification,
  VISUAL_MODULES,
  VISUAL_RUBRIC,
  type FrameworkRegistry,
  type ReleaseGatePolicy,
  type VisualAuditReport,
  type VisualModuleSpec,
} from '@brand-os/brand-core/visual'
import { runCrossBrandPilot } from '@brand-os/brand-core/visual/pilot'
import { PILOT_BRANDS } from '../packages/brand-core/src/visual/fixtures-pilot.js'
import registryJson from '../packages/brand-core/src/visual/frameworks.json' with { type: 'json' }

/**
 * Visual V5.1: standards verification, per-module audit on the 0–5 rubric, cross-brand pilot and release gate.
 * Scores come from checks on the checkout; nothing passes by default and modules still in flight are pending, never a
 * failure. V3.2 (SWOT/TOWS, Value Proposition Canvas) and V3.3 (journey, SOSTAC, OKR tree) are scored.
 */
const ROOT = path.resolve(import.meta.dirname, '..')
const registry = registryJson as unknown as FrameworkRegistry
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, RELEASE_GATE_POLICY_PATH), 'utf8')) as ReleaseGatePolicy
const TODAY = '2026-11-24'

function report(): VisualAuditReport {
  return auditVisualModules({ root: ROOT })
}

test('standards: every registry entry records a reviewer; a date and a reviewer come together or not at all', () => {
  for (const ref of registry.frameworks) {
    assert.equal(typeof ref.reviewer, 'string', `${ref.framework_id}: reviewer`)
    assert.equal(Boolean(ref.verified_on), standardVerification(ref) === 'verified', `${ref.framework_id}: verified_on only with a named reviewer`)
  }
  const base = registry.frameworks[0]!
  const errors = (change: Partial<typeof base>) => frameworkClaimErrors({ schema_version: 1, frameworks: [{ ...base, ...change }] })
  assert.match(errors({ verified_on: '2026-11-01', reviewer: 'pending' }).join(), /needs a named reviewer/)
  assert.match(errors({ verified_on: null, reviewer: 'A person' }).join(), /needs verified_on/)
  assert.match(errors({ verified_on: '2999-01-01', reviewer: 'A person' }).join(), /in the future/)
  assert.deepEqual(errors({ verified_on: '2026-11-01', reviewer: 'A person' }), [])
  assert.equal(standardVerification({ verified_on: '2026-11-01', reviewer: ' Pending ' }), 'pending')
})

test('audit: every declared module is scored from its checks, and the score follows the rubric exactly', () => {
  const result = report()
  assert.deepEqual(result.registry_errors, [])
  for (const spec of VISUAL_MODULES) {
    const module = result.modules.find((m) => m.id === spec.id)!
    assert.equal(module.status, 'present')
    assert.ok(Number.isInteger(module.score) && module.score! >= 0 && module.score! <= 5)
    let expected = 0
    for (const row of VISUAL_RUBRIC) {
      if (module.checks.some((check) => row.checks.includes(check.id) && check.status === 'fail')) break
      expected = row.level
    }
    assert.equal(module.score, expected, `${spec.id}: score is the highest fully passed level`)
    for (const check of module.checks) assert.ok(check.evidence.length > 0, `${spec.id}/${check.id}: evidence`)
    if (module.audience === 'public') assert.ok(module.score! >= policy.public_min_score, `${spec.id}: public module meets the threshold (${module.score})`)
  }
  assert.deepEqual(result.modules.filter((m) => m.audience === 'public').map((m) => m.id).sort(), ['brand_book', 'business_model_canvas', 'mascot_atlas', 'visual_identity'], 'public = what the V4.1 public profile permits')
})

test('audit: level 5 needs verified standards; an unverified cited entry keeps a module at 4 at most', () => {
  for (const module of report().modules.filter((m) => m.status === 'present')) {
    const standards = module.checks.find((check) => check.id === 'standards')!
    if (module.cites.some((cite) => cite.verification !== 'verified')) {
      assert.equal(standards.status, 'fail')
      assert.ok(module.score! <= 4, module.id)
    }
  }
})

test('audit: V3.2 and V3.3 modules are scored like the others, cite their own frameworks, and are internal', () => {
  const result = report()
  const expected: Record<string, string[]> = {
    swot_tows: ['SWOT', 'TOWS'],
    value_proposition: ['VPC'],
    customer_journey: ['CUSTOMER-JOURNEY-MAP'],
    sostac_overview: ['SOSTAC'],
    okr_tree: ['OKR'],
  }
  for (const [id, frameworks] of Object.entries(expected)) {
    const module = result.modules.find((m) => m.id === id)
    assert.ok(module, `${id} is declared`)
    assert.equal(module.status, 'present', id)
    assert.equal(module.audience, 'internal', `${id}: the V4.1 public profile does not permit it`)
    assert.ok(module.score !== null && module.score >= 4, `${id}: ${module.score}`)
    assert.deepEqual(module.cites.map((cite) => cite.framework_id), frameworks, `${id}: cites`)
    const redaction = module.checks.find((check) => check.id === 'redaction')!
    assert.equal(redaction.status, 'pass', `${id}: ${redaction.evidence}`)
    assert.match(redaction.evidence, /public edition carries no draft/, `${id}: its Studio public edition is inspected, not waved through`)
    for (const check of ['print', 'rtl', 'empty_state'] as const) assert.equal(module.checks.find((c) => c.id === check)!.status, 'pass', `${id}/${check}`)
  }
  assert.deepEqual(PENDING_VISUAL_MODULES, [], 'no V3.x module is pending any more')
  assert.deepEqual(result.modules.filter((m) => m.status !== 'present'), [])
  const gate = evaluateGate(result, policy, { release: false, today: TODAY })
  assert.equal(gate.ok, true)
  for (const id of ['SWOT', 'TOWS', 'VPC', 'CUSTOMER-JOURNEY-MAP', 'SOSTAC', 'OKR']) assert.match(gate.release_blockers.join('\n'), new RegExp(`^${id}:`, 'm'), `${id}: unverified, would stop a release`)
})

test('audit: an internal module whose public edition shows a draft fails redaction and drops below 4', () => {
  const spec = VISUAL_MODULES.find((m) => m.id === 'okr_tree')!
  const leaky: VisualModuleSpec = {
    ...spec,
    id: 'leaky_okr_tree',
    public_fixture: () => [{ id: 'kr-1', state: 'draft', value: 'DRAFT-KR', badges: ['draft'] }],
  }
  const module = auditVisualModules({ root: ROOT, modules: [leaky], pending: [] }).modules[0]!
  const redaction = module.checks.find((check) => check.id === 'redaction')!
  assert.equal(redaction.status, 'fail')
  assert.match(redaction.evidence, /kr-1 \(draft\) carries a value/)
  assert.match(redaction.evidence, /draft or internal badge in public/)
  assert.equal(module.score, 3)
  assert.equal(module.next, 'redaction')
})

test('audit: a module still in flight is pending (or "landed, not yet scored") and never part of the gate failures', () => {
  const pending = [
    { id: 'future_module', title: 'Future module', slice: 'V9.9', probe: /no-such-visual-source-token-xyz/ },
    { id: 'landed_module', title: 'Landed module', slice: 'V9.9', probe: /buildSwotTows/ },
  ]
  const result = auditVisualModules({ root: ROOT, pending })
  assert.equal(result.modules.find((m) => m.id === 'future_module')!.status, 'pending')
  assert.equal(result.modules.find((m) => m.id === 'landed_module')!.status, 'unregistered')
  const gate = evaluateGate(result, policy, { release: false, today: TODAY })
  assert.equal(gate.ok, true)
  assert.deepEqual(gate.pending, ['future_module (V9.9)'])
  assert.match(gate.notes.join(), /landed_module \(V9\.9\) seems to have landed/)
})

test('audit: a missing test file, builder or catalog fails its check; nothing passes by default', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-visual-audit-'))
  try {
    const spec: VisualModuleSpec = {
      ...VISUAL_MODULES[0]!,
      id: 'empty_root_module',
      builder: { file: 'nope.ts', export: 'buildNothing' },
      core_tests: ['tests/missing.test.ts'],
      catalogs: ['no-such-catalog'],
    }
    const result = auditVisualModules({ root: tmp, modules: [spec], pending: [] })
    const module = result.modules[0]!
    assert.equal(module.score, 0)
    assert.equal(module.next, 'model')
    for (const id of ['model', 'core_tests', 'i18n', 'studio_tests', 'print', 'rtl', 'visual_qa'] as const) assert.equal(module.checks.find((check) => check.id === id)!.status, 'fail', id)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('catalog check: missing key, empty string or Latin-only Persian fails', () => {
  const en = { a: 'Hello', b: 'World' }
  assert.equal(catalogCheck('x', { en, fa: { a: 'سلام', b: 'جهان' }, tr: { a: 'Merhaba', b: 'Dünya' } }).ok, true)
  assert.equal(catalogCheck('x', { en, fa: { a: 'سلام' }, tr: { a: 'Merhaba', b: 'Dünya' } }).ok, false)
  assert.equal(catalogCheck('x', { en, fa: { a: 'سلام', b: ' ' }, tr: { a: 'Merhaba', b: 'Dünya' } }).ok, false)
  assert.equal(catalogCheck('x', { en, fa: { a: 'Hello', b: 'World' }, tr: { a: 'Merhaba', b: 'Dünya' } }).ok, false)
  assert.equal(catalogCheck('x', { en, fa: { a: 'سلام', b: 'جهان' } }).ok, false)
  assert.equal(catalogCheck('audit', AUDIT_TEXT).ok, true, AUDIT_TEXT.fa.title)
})

function withScore(base: VisualAuditReport, id: string, score: number): VisualAuditReport {
  return { ...base, modules: base.modules.map((m) => (m.id === id ? { ...m, score, next: 'i18n' } : m)) }
}

test('gate: a public module below the threshold fails; a valid owner override passes and is listed', () => {
  const base = report()
  assert.equal(evaluateGate(base, policy, { release: false, today: TODAY }).ok, true, 'the shipped checkout passes CI mode')
  const low = withScore(base, 'mascot_atlas', 2)
  const failed = evaluateGate(low, policy, { release: false, today: TODAY })
  assert.equal(failed.ok, false)
  assert.match(failed.failures.join(), /mascot_atlas: public module scores 2\/5/)
  const internalLow = evaluateGate(withScore(base, 'competitor_comparison', 1), policy, { release: false, today: TODAY })
  assert.equal(internalLow.ok, true, 'internal modules are reported, not gated')
  const override = { target: 'module:mascot_atlas', reason: 'Artwork in review this month', approved_by: 'Owner name', approved_on: '2026-11-20', expires_on: '2026-12-31' }
  const waived = evaluateGate(low, { ...policy, overrides: [override] }, { release: false, today: TODAY })
  assert.equal(waived.ok, true)
  assert.match(waived.overridden.join(), /overridden by Owner name/)
  for (const bad of [{ approved_by: 'pending' }, { expires_on: '2026-11-01' }, { approved_on: '2027-01-01' }, { reason: 'short' }, { target: 'everything' }]) {
    const result = evaluateGate(low, { ...policy, overrides: [{ ...override, ...bad }] }, { release: false, today: TODAY })
    assert.equal(result.ok, false, JSON.stringify(bad))
  }
})

test('gate: unverified cited external standards block a release; editorial templates and CI mode only report them', () => {
  const base = report()
  const ci = evaluateGate(base, policy, { release: false, today: TODAY })
  const release = evaluateGate(base, policy, { release: true, today: TODAY })
  const external = base.standards.filter((s) => s.cited_by.length > 0 && s.kind !== 'editorial_template' && s.verification !== 'verified').map((s) => s.framework_id)
  assert.equal(ci.release_blockers.length, external.length)
  assert.equal(release.ok, external.length === 0)
  for (const id of external) assert.match(release.failures.join('\n'), new RegExp(`^${id}:`, 'm'))
  assert.equal(release.failures.some((line) => /BRAND-IDENTITY-GUIDE|MASCOT-MODEL-SHEET/.test(line)), false, 'Brand OS layouts are not external standards')
  assert.equal(evaluateGate(base, { ...policy, standards_block: 'always' }, { release: false, today: TODAY }).ok, external.length === 0)
  const verified: VisualAuditReport = { ...base, standards: base.standards.map((s) => ({ ...s, verification: 'verified' as const })) }
  assert.equal(evaluateGate(verified, policy, { release: true, today: TODAY }).ok, true)
  const waived = evaluateGate(base, { ...policy, overrides: external.map((id) => ({ target: `standard:${id}`, reason: 'Source check booked with the reviewer', approved_by: 'Owner name', approved_on: '2026-11-20', expires_on: '2026-12-31' })) }, { release: true, today: TODAY })
  assert.equal(waived.ok, true)
})

test('gate policy as shipped: threshold 4, unverified standards block a release only, no override', () => {
  assert.equal(policy.public_min_score, 4)
  assert.equal(policy.standards_block, 'release')
  assert.deepEqual(policy.overrides, [], 'only the owner adds an override')
})

test('cross-brand pilot: two synthetic brands, same modules, own values only, no drafts in public', () => {
  const previous = process.env.BRAND_OS_DATA_KEY
  process.env.BRAND_OS_DATA_KEY = crypto.randomBytes(32).toString('base64')
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-visual-pilot-'))
  try {
    const result = runCrossBrandPilot(base, { root: ROOT })
    assert.deepEqual(result.checks.filter((check) => check.status !== 'pass'), [])
    assert.equal(result.ok, true)
    assert.deepEqual(result.brands.map((brand) => brand.slug), PILOT_BRANDS.map((brand) => brand.slug))
    assert.ok(result.brands.every((brand) => brand.documents === 9))
    for (const brand of PILOT_BRANDS) assert.match(brand.name, /\(synthetic\)$/, 'pilot brands say they are synthetic')
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
    if (previous === undefined) delete process.env.BRAND_OS_DATA_KEY
    else process.env.BRAND_OS_DATA_KEY = previous
  }
})

test('command: JSON report, gate exit codes, and --out never writes into brand/ or .private', () => {
  const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/visual-audit.ts', ...args], { cwd: ROOT, encoding: 'utf8' })
  const json = run('--json')
  assert.equal(json.status, 0, json.stderr)
  const parsed = JSON.parse(json.stdout) as VisualAuditReport
  assert.equal(parsed.schema, 'brand-os.visual-audit/1')
  assert.equal(run('--gate').status, 0)
  const release = run('--release')
  const unverified = parsed.standards.some((s) => s.cited_by.length > 0 && s.kind !== 'editorial_template' && s.verification !== 'verified')
  assert.equal(release.status, unverified ? 1 : 0)
  const fa = run('--lang', 'fa')
  assert.match(fa.stdout, /ممیزی ماژول‌های بصری/)
  for (const out of ['brand/audit.md', 'docs/.private/audit.md']) {
    const refused = run('--md', '--out', out)
    assert.equal(refused.status, 2)
    assert.match(refused.stderr, /may not write/)
  }
})
