import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { parse } from 'yaml'
import {
  agentTokenContext,
  applyInit,
  buildDashboard,
  getBrandStatus,
  guestContext,
  identityIntakeRecord,
  InterviewEngine,
  planChanges,
  readIdentityIntake,
  readSyncManifest,
  validateIdentityChoice,
  writeStarterWorkspace,
} from '@brand-os/brand-core'
import type { BrandConfig, IdentityField } from '@brand-os/brand-core'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

// --reset backs up the ledger, which is encrypted with this key.
process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')

const repo = path.resolve(import.meta.dirname, '..')
const SLUG = 'intake-brand'

function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-intake-'))
  writeStarterWorkspace(root)
  return root
}

function base(slug = SLUG) {
  return { name: 'Intake Brand', slug, industry: 'TBD', language: 'en', languages: ['en'], mascot: false, gamification: false, publish: 'private' as const }
}

function config(root: string): BrandConfig {
  return parse(fs.readFileSync(path.join(root, 'brand/brand.config.yaml'), 'utf8')) as BrandConfig
}

function cli(root: string, args: string[]) {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) if (typeof value === 'string' && key !== 'BRAND_OS_AGENT_TOKEN' && key !== 'BRAND_OS_APPROVAL_PROOF') env[key] = value
  return spawnSync(NODE, tsxArgs('scripts/brand.ts', args), { cwd: root, env, encoding: 'utf8', timeout: 60_000 })
}

test('the five owner journeys validate, and evolve / rebrand without a depth read as undecided', () => {
  const ok: Array<[Partial<Record<IdentityField, unknown>>, string | null]> = [
    [{ logo_presence: 'absent', identity_intent: 'create' }, null],
    [{ logo_presence: 'present', identity_intent: 'retain' }, null],
    [{ logo_presence: 'present', identity_intent: 'evolve', change_depth: 'visual_refresh' }, 'visual_refresh'],
    [{ logo_presence: 'present', identity_intent: 'rebrand', change_depth: 'strategic_rebrand' }, 'strategic_rebrand'],
    [{ logo_presence: 'unknown', identity_intent: 'undecided' }, null],
    [{ logo_presence: 'in_progress', identity_intent: 'create' }, null],
    [{ logo_presence: 'present', identity_intent: 'evolve' }, 'undecided'],
    [{ logo_presence: 'absent', identity_intent: 'rebrand', change_depth: 'strategic_rebrand' }, 'strategic_rebrand'],
  ]
  for (const [input, depth] of ok) {
    const result = validateIdentityChoice(input)
    assert.ok(result.ok, JSON.stringify(input))
    assert.equal(result.value.change_depth, depth, JSON.stringify(input))
  }
  // Nothing given means unknown / undecided, never "absent" or "create".
  const empty = validateIdentityChoice({})
  assert.ok(empty.ok)
  assert.deepEqual(empty.value, { logo_presence: 'unknown', identity_intent: 'undecided', change_depth: null })
  assert.deepEqual(validateIdentityChoice({ logo_presence: '', identity_intent: '', change_depth: '' }), { ok: true, value: empty.value })
})

test('contradictions and unknown values are refused, not guessed', () => {
  const refused: Array<[Partial<Record<IdentityField, unknown>>, IdentityField, string]> = [
    [{ logo_presence: 'absent', identity_intent: 'retain' }, 'identity_intent', 'retain_without_logo'],
    [{ logo_presence: 'present', identity_intent: 'create' }, 'identity_intent', 'create_with_logo'],
    [{ logo_presence: 'absent', identity_intent: 'evolve', change_depth: 'logo_evolution' }, 'change_depth', 'logo_evolution_without_logo'],
    [{ logo_presence: 'present', identity_intent: 'retain', change_depth: 'visual_refresh' }, 'change_depth', 'change_depth_not_applicable'],
    [{ logo_presence: 'unknown', identity_intent: 'undecided', change_depth: 'undecided' }, 'change_depth', 'change_depth_not_applicable'],
    [{ logo_presence: 'yes' }, 'logo_presence', 'logo_presence_invalid'],
    [{ identity_intent: 'redesign' }, 'identity_intent', 'identity_intent_invalid'],
    [{ identity_intent: 'evolve', change_depth: 'total' }, 'change_depth', 'change_depth_invalid'],
    [{ logo_presence: ['present'] }, 'logo_presence', 'logo_presence_invalid'],
  ]
  for (const [input, field, code] of refused) {
    const result = validateIdentityChoice(input)
    assert.equal(result.ok, false, JSON.stringify(input))
    if (!result.ok) assert.equal(result.errors[field], code, JSON.stringify(input))
  }
  assert.throws(() => identityIntakeRecord({ logo_presence: 'absent', identity_intent: 'retain' }, 'brand_init'), /retain_without_logo/)
})

test('brand:init without intake writes no onboarding block; older configs read as unknown / undecided', () => {
  const root = workspace()
  applyInit(root, base())
  const written = config(root)
  assert.equal(written.onboarding, undefined)
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'brand/brand.config.yaml'), 'utf8'), /onboarding|identity_intent/)
  const read = readIdentityIntake(written)
  assert.equal(read.state, 'not_recorded')
  assert.deepEqual(read.choice, { logo_presence: 'unknown', identity_intent: 'undecided', change_depth: null })
  assert.equal(readIdentityIntake(null).state, 'not_recorded')
})

test('an intake is stored as an unapproved hint only: no fact, ledger row, publication grant or asset', () => {
  const root = workspace()
  applyInit(root, { ...base(), identity: { choice: { logo_presence: 'present', identity_intent: 'evolve', change_depth: 'visual_refresh' }, source: 'studio_owner_wizard' } })
  const identity = config(root).onboarding?.identity
  assert.ok(identity)
  assert.equal(identity.authority, 'unapproved_owner_intake')
  assert.equal(identity.source, 'studio_owner_wizard')
  assert.equal(identity.schema_version, 1)
  assert.deepEqual([identity.logo_presence, identity.identity_intent, identity.change_depth], ['present', 'evolve', 'visual_refresh'])
  assert.equal(readIdentityIntake(config(root)).state, 'recorded')
  const yaml = (file: string) => parse(fs.readFileSync(path.join(root, file), 'utf8')) as Record<string, unknown>
  assert.deepEqual(yaml('brand/instance/approved-facts.yaml').facts, {})
  assert.deepEqual(yaml('brand/instance/draft-facts.yaml').facts, {})
  assert.deepEqual(yaml('brand/interview/answer-ledger.yaml').records, [])
  const policy = yaml('brand/publication-policy.yaml')
  for (const key of ['approved_fact_ids', 'approved_page_ids', 'approved_asset_ids', 'approved_token_ids']) assert.deepEqual(policy[key], [], key)
  for (const file of ['brand/instance', 'brand/interview', 'brand/assets/asset-manifest.yaml', 'brand/publication-policy.yaml']) {
    const target = path.join(root, file)
    const texts = fs.statSync(target).isDirectory() ? fs.readdirSync(target).filter((name) => name.endsWith('.yaml')).map((name) => fs.readFileSync(path.join(target, name), 'utf8')) : [fs.readFileSync(target, 'utf8')]
    for (const text of texts) assert.doesNotMatch(text, /identity_intent|visual_refresh|unapproved_owner_intake/, file)
  }
})

test('an invalid intake changes nothing; a re-init keeps the recorded intake unless a new one is given', () => {
  const root = workspace()
  const before = fs.readFileSync(path.join(root, 'brand/brand.config.yaml'), 'utf8')
  assert.throws(() => applyInit(root, { ...base(), identity: { choice: { logo_presence: 'absent', identity_intent: 'retain' }, source: 'brand_init' } }), /retain_without_logo/)
  assert.equal(fs.readFileSync(path.join(root, 'brand/brand.config.yaml'), 'utf8'), before)
  applyInit(root, { ...base(), identity: { choice: { logo_presence: 'present', identity_intent: 'retain' }, source: 'brand_init' } })
  applyInit(root, { ...base(), reset: true })
  assert.equal(config(root).onboarding?.identity?.identity_intent, 'retain')
  applyInit(root, { ...base(), reset: true, identity: { choice: { logo_presence: 'present', identity_intent: 'rebrand', change_depth: 'strategic_rebrand' }, source: 'brand_init' } })
  assert.equal(config(root).onboarding?.identity?.identity_intent, 'rebrand')
})

test('a hand-edited or contradictory intake is ignored and reads as unknown / undecided', () => {
  const good = identityIntakeRecord({ logo_presence: 'present', identity_intent: 'evolve', change_depth: 'logo_evolution' }, 'studio_owner_wizard', new Date('2026-11-22T00:00:00Z'))
  const cases: Array<[unknown, RegExp]> = [
    [{ ...good, logo_presence: 'absent', identity_intent: 'retain', change_depth: null }, /retain_without_logo/],
    [{ ...good, authority: 'approved' }, /authority/],
    [{ ...good, schema_version: 2 }, /schema_version/],
    [{ ...good, change_depth: undefined }, /change_depth missing/],
    [{ ...good, source: 'agent' }, /source/],
    [{ ...good, recorded_at: 'yesterday' }, /recorded_at/],
    ['present', /mapping/],
  ]
  for (const [identity, reason] of cases) {
    const read = readIdentityIntake({ onboarding: { identity } } as never)
    assert.equal(read.state, 'invalid', JSON.stringify(identity))
    if (read.state === 'invalid') assert.match(read.reason, reason)
    assert.deepEqual(read.choice, { logo_presence: 'unknown', identity_intent: 'undecided', change_depth: null })
  }
  assert.equal(readIdentityIntake({ onboarding: { identity: good } }).state, 'recorded')
})

test('guests, agents, the dashboard and the public projection never see the intake', () => {
  const root = workspace()
  applyInit(root, { ...base(), publish: 'public', identity: { choice: { logo_presence: 'present', identity_intent: 'rebrand', change_depth: 'strategic_rebrand' }, source: 'studio_owner_wizard' } })
  const engine = new InterviewEngine(root)
  const outputs = [
    getBrandStatus(engine, guestContext(SLUG)),
    getBrandStatus(engine, agentTokenContext(SLUG, 'agt_test', 'internal-read')),
    buildDashboard(engine, 'public'),
    buildDashboard(engine, 'internal'),
    engine.exportPublic(),
  ]
  for (const output of outputs) assert.doesNotMatch(JSON.stringify(output), /onboarding|identity_intent|logo_presence|strategic_rebrand|unapproved_owner_intake/)
})

test('a template update never touches brand.config.yaml, so the intake survives', () => {
  const manifest = readSyncManifest(repo)
  assert.ok(manifest)
  const changes = planChanges({ manifest, changed: ['brand/brand.config.yaml'], base: () => Buffer.from('a'), theirs: () => Buffer.from('b'), ours: () => Buffer.from('c') } as never)
  assert.equal(changes[0]?.action, 'skip')
})

test('brand:init CLI: no flags behaves as before; flags record a hint; a contradiction exits non-zero', () => {
  const plain = workspace()
  const first = cli(plain, ['init', '--name', 'Plain', '--slug', 'plain', '--yes'])
  assert.equal(first.status, 0, first.stderr)
  assert.doesNotMatch(first.stdout, /Identity intake/)
  assert.equal(config(plain).onboarding, undefined)

  const flagged = workspace()
  const second = cli(flagged, ['init', '--name', 'Flagged', '--slug', 'flagged', '--yes', '--logo-presence', 'present', '--identity-intent', 'evolve', '--change-depth', 'visual_refresh'])
  assert.equal(second.status, 0, second.stderr)
  assert.match(second.stdout, /Identity intake \(unapproved owner hint, not a brand fact\): logo present, intent evolve, depth visual_refresh/)
  assert.equal(config(flagged).onboarding?.identity?.source, 'brand_init')

  const bad = workspace()
  const third = cli(bad, ['init', '--name', 'Bad', '--slug', 'bad', '--yes', '--logo-presence', 'absent', '--identity-intent', 'retain'])
  assert.equal(third.status, 2)
  assert.match(third.stderr, /Identity intake refused \(identity_intent: retain_without_logo\)\. Nothing was written\./)
  assert.doesNotMatch(third.stderr, /\bat applyInit\b/, 'a plain message, not a stack trace')
  assert.notEqual(config(bad).brand.initialized, true)
})
