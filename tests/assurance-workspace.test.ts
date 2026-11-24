import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import YAML from 'yaml'
import { AGENT_TOKEN_ENV, archiveNote, captureNote, openWorkspace, RETRIEVE_KINDS } from '@brand-os/brand-core'
import { ASSURANCE_LANGS, CLAIM_LEVELS, FACT_PRESENCE, SUBJECT_FIELDS } from '@brand-os/brand-core/assurance'
import {
  assessWorkspace,
  AssuranceBridgeError,
  BRIDGE_HELP,
  BRIDGE_TEXT,
  buildAssuranceSnapshot,
  canonicalSnapshot,
  MISSING_KIND_TEXT,
  MISSING_KINDS,
  parseSnapshotFile,
  PRESENCE_TEXT,
  renderSnapshotSummary,
  renderVerifyResult,
  SUBJECT_FIELD_TEXT,
  SUBJECT_SOURCE_TEXT,
  verifyAssuranceSnapshot,
  WITHHELD_REVISION,
  type AssuranceSnapshot,
  type BridgeOptions,
} from '@brand-os/brand-core/assurance/workspace'
import { answer, approved, assertUnchanged, coachBrand, disposition, snapshot as treeSnapshot, type CoachBrand } from './helpers/coach.js'
import { useTestKey } from './helpers/knowledge.js'

/**
 * GAP-09: the owner-local bridge from a brand workspace's approved facts to the Assurance evaluator.
 *
 * Every brand below is a SYNTHETIC DEMO temp brand. No value describes a real company, person or number.
 */
useTestKey()

const AS_OF = new Date('2026-11-23T00:00:00.000Z')
const VALUE_CANARY = 'ASSURANCE-VALUE-CANARY-41d2'
const BUDGET_CANARY = 'ASSURANCE-BUDGET-CANARY-88e1 4321 EUR'
const NOTE_CANARY = 'ASSURANCE-NOTE-CANARY-0c7a'

function withoutAgentToken<T>(run: () => T): T {
  const saved = process.env[AGENT_TOKEN_ENV]
  delete process.env[AGENT_TOKEN_ENV]
  try {
    return run()
  } finally {
    if (saved !== undefined) process.env[AGENT_TOKEN_ENV] = saved
  }
}

function build(brand: CoachBrand, options: Partial<BridgeOptions> = {}): AssuranceSnapshot {
  return withoutAgentToken(() => buildAssuranceSnapshot(brand.root, { asOf: AS_OF, ...options }))
}

/** A SYNTHETIC DEMO selling company with the core positioning facts approved. */
function sellingCompany(): CoachBrand {
  const brand = coachBrand({ slug: 'assurance-demo' })
  approved(brand, 'business.stage.current', 'established')
  approved(brand, 'business.sales.motion', 'self-serve')
  approved(brand, 'business.customer.primary_segment', `SYNTHETIC DEMO segment ${VALUE_CANARY}`)
  approved(brand, 'business.offer.value_proposition', `SYNTHETIC DEMO value ${VALUE_CANARY}`)
  approved(brand, 'brand.strategy.differentiation', `SYNTHETIC DEMO difference ${VALUE_CANARY}`)
  return brand
}

function control(snapshot: AssuranceSnapshot, id: string) {
  const found = snapshot.controls.find((entry) => entry.control_id === id)
  assert.ok(found, `${id} in the snapshot`)
  return found
}

function approvedFacts(root: string): Record<string, { revision_hash: string }> {
  return (YAML.parse(fs.readFileSync(path.join(root, 'brand', 'instance', 'approved-facts.yaml'), 'utf8')) as { facts: Record<string, { revision_hash: string }> }).facts
}

/** `scoreable` must mean exactly what the existing evaluator decides; the bridge never second-guesses it. */
function assertScoreAgrees(snapshot: AssuranceSnapshot, completeness: { state: string; numerator: number | null }): void {
  assert.equal(snapshot.scoreable, completeness.state === 'scoreable', 'the bridge and the evaluator agree on whether a score exists')
  if (!snapshot.scoreable) assert.equal(completeness.numerator, null, 'no ratio when the snapshot is incomplete')
}

test('an empty brand: no score, and every blocking item is named', () => {
  const brand = coachBrand({ slug: 'assurance-empty' })
  const result = withoutAgentToken(() => assessWorkspace(brand.root, { asOf: AS_OF }))
  const { snapshot, assessment } = result
  assert.equal(snapshot.complete, false)
  assert.equal(snapshot.scoreable, false)
  assert.equal(assessment.completeness.state, 'not_scoreable')
  assert.equal(assessment.completeness.numerator, null)
  assert.equal(assessment.completeness.denominator, null)
  assertScoreAgrees(snapshot, assessment.completeness)

  const blockingFields = snapshot.missing.filter((entry) => entry.kind === 'subject_field').map((entry) => entry.field)
  assert.deepEqual(blockingFields.sort(), ['runs_paid_media', 'sells'], 'sells and paid media decide applicability; stage decides nothing in this method')
  const paid = snapshot.missing.find((entry) => entry.field === 'runs_paid_media')
  assert.deepEqual(paid?.question_ids, ['business.marketing.paid_media'], 'paid media is an interview question now')
  assert.equal(paid?.flag, null, 'the deprecated --paid-media flag is no longer advertised as the way to close it')
  assert.deepEqual(snapshot.missing.find((entry) => entry.field === 'sells')?.question_ids, ['business.sales.motion'])
  assert.ok(snapshot.missing.some((entry) => entry.kind === 'reviewer_judgment' && entry.control_id === 'PRR-08' && entry.blocking))
  assert.ok(snapshot.missing.some((entry) => entry.kind === 'fact' && entry.question_ids[0] === 'business.customer.primary_segment' && entry.presence === 'absent' && !entry.blocking))
  assert.deepEqual(result.authorizes, [])
  assert.deepEqual(snapshot.authorizes, [])
})

test('approved facts are pinned at their revision; a draft or an unknown is never treated as approved', () => {
  const brand = sellingCompany()
  answer(brand, 'brand.strategy.promise', `SYNTHETIC DEMO draft ${VALUE_CANARY}`)
  disposition(brand, 'business.market.geography', 'unknown')
  const snapshot = build(brand, { paidMedia: 'no' })
  const facts = approvedFacts(brand.root)

  const segment = control(snapshot, 'PRR-01').facts[0]!
  assert.deepEqual(segment.ref, { id: 'business.customer.primary_segment', revision: facts['business.customer.primary_segment']!.revision_hash })
  assert.equal(segment.presence, 'approved')
  assert.equal(segment.state, 'current')

  const promise = control(snapshot, 'PRR-06').facts[0]!
  assert.equal(promise.presence, 'draft')
  assert.match(promise.ref.revision, /^answer:/)
  const geography = control(snapshot, 'PRR-02').facts[0]!
  assert.equal(geography.presence, 'unknown')

  const { assessment } = withoutAgentToken(() => assessWorkspace(brand.root, { asOf: AS_OF, paidMedia: 'no' }))
  const status = (id: string) => assessment.control_results.find((entry) => entry.control_id === id)
  assert.equal(status('PRR-01')?.status, 'applicable_complete')
  assert.equal(status('PRR-06')?.status, 'applicable_missing')
  assert.deepEqual(status('PRR-06')?.reason_codes, ['fact_not_approved'])
  assert.deepEqual(status('PRR-02')?.reason_codes, ['owner_said_unknown'])
  assert.equal(status('PRR-13')?.status, 'not_applicable', 'the owner stated no paid media')
  assert.equal(assessment.demo, false, 'a real workspace is not stamped as the synthetic demo')
  assertScoreAgrees(snapshot, assessment.completeness)

  const subject = Object.fromEntries(snapshot.subject_provenance.map((entry) => [entry.field, entry]))
  assert.equal(subject.sells?.value, 'yes')
  assert.equal(subject.sells?.source, 'approved_fact')
  assert.equal(subject.stage?.value, 'established')
  assert.equal(subject.runs_paid_media?.source, 'owner_flag')
  assert.equal(subject.entity_kind?.value, 'company')
})

test('a draft subject answer does not set the subject', () => {
  const brand = coachBrand({ slug: 'assurance-draft-subject' })
  answer(brand, 'business.sales.motion', 'self-serve')
  answer(brand, 'business.stage.current', 'established')
  const snapshot = build(brand)
  assert.equal(snapshot.subject.sells, 'unknown')
  assert.equal(snapshot.subject.stage, 'unknown')
})

test('reproducible: the same workspace, clock and options give byte-identical snapshots and the same digest', () => {
  const brand = sellingCompany()
  const first = build(brand, { paidMedia: 'no' })
  const second = build(brand, { paidMedia: 'no' })
  assert.equal(canonicalSnapshot(first), canonicalSnapshot(second))
  assert.match(first.source_snapshot_digest, /^[0-9a-f]{64}$/)

  const a = withoutAgentToken(() => assessWorkspace(brand.root, { asOf: AS_OF, paidMedia: 'no' }))
  assert.equal(a.assessment.source_snapshot_digest, first.source_snapshot_digest, 'the assessment pins the bridge digest unchanged')

  assert.notEqual(build(brand, { paidMedia: 'no', asOf: new Date('2026-11-24T00:00:00Z') }).source_snapshot_digest, first.source_snapshot_digest, 'the clock is part of the input')
  assert.notEqual(build(brand, { paidMedia: 'yes' }).source_snapshot_digest, first.source_snapshot_digest, 'the owner statement is part of the input')
  approved(brand, 'brand.strategy.promise', 'SYNTHETIC DEMO promise')
  assert.notEqual(build(brand, { paidMedia: 'no' }).source_snapshot_digest, first.source_snapshot_digest, 'a newly approved fact changes the digest')
})

test('no brand value reaches the snapshot, the assessment or any rendered text', () => {
  const brand = sellingCompany()
  approved(brand, 'business.marketing.budget', BUDGET_CANARY)
  const ws = openWorkspace(brand.root, { now: () => AS_OF })
  captureNote(ws, { title: 'SYNTHETIC DEMO research', body: `Interview notes ${NOTE_CANARY}`, kind: 'research', status: 'active', question_ids: ['business.customer.primary_segment'] })
  for (const audience of ['public', 'internal', 'restricted'] as const) {
    const result = withoutAgentToken(() => assessWorkspace(brand.root, { asOf: AS_OF, paidMedia: 'yes', audience }))
    const texts = [JSON.stringify(result), ...ASSURANCE_LANGS.map((lang) => renderSnapshotSummary(result.snapshot, lang))]
    for (const text of texts) {
      for (const canary of [VALUE_CANARY, BUDGET_CANARY, '4321', NOTE_CANARY]) assert.ok(!text.includes(canary), `${audience}: ${canary} never appears`)
    }
  }
})

test('a restricted fact is withheld below the restricted audience: not even its revision is pinned', () => {
  const brand = sellingCompany()
  approved(brand, 'business.marketing.budget', BUDGET_CANARY)
  const internal = build(brand, { paidMedia: 'yes', audience: 'internal' })
  const budget = control(internal, 'PRR-14').facts[0]!
  assert.equal(budget.ref.revision, WITHHELD_REVISION)
  assert.equal(budget.classification, 'restricted')
  assert.ok(!internal.missing.some((entry) => entry.control_id === 'PRR-14'), 'a withheld control lists nothing, not even an open question')
  const { assessment } = withoutAgentToken(() => assessWorkspace(brand.root, { asOf: AS_OF, paidMedia: 'yes', audience: 'internal' }))
  const result = assessment.control_results.find((entry) => entry.control_id === 'PRR-14')
  assert.deepEqual(result?.reason_codes, ['withheld_for_audience'])
  assert.deepEqual(result?.source_refs, [])

  const restricted = build(brand, { paidMedia: 'yes', audience: 'restricted' })
  assert.equal(control(restricted, 'PRR-14').facts[0]!.ref.revision, approvedFacts(brand.root)['business.marketing.budget']!.revision_hash)
})

test('research notes are cited by id and revision, always owner-stated; restricted and archived notes are not', () => {
  const brand = sellingCompany()
  const ws = openWorkspace(brand.root, { now: () => AS_OF })
  const research = captureNote(ws, { title: 'SYNTHETIC DEMO research', body: 'SYNTHETIC DEMO interview summary', kind: 'research', status: 'active', question_ids: ['business.customer.primary_segment'] })
  captureNote(ws, { title: 'SYNTHETIC DEMO idea', body: 'not research', kind: 'idea', question_ids: ['business.customer.primary_segment'] })
  captureNote(ws, { title: 'SYNTHETIC DEMO secret', body: 'restricted research', kind: 'research', classification: 'restricted', question_ids: ['business.customer.primary_segment'] })
  const archived = captureNote(ws, { title: 'SYNTHETIC DEMO old', body: 'old research', kind: 'research', status: 'active', question_ids: ['business.customer.primary_segment'] })
  archiveNote(ws, archived.id)

  const snapshot = build(brand, { paidMedia: 'no' })
  const evidence = control(snapshot, 'PRR-03').evidence
  assert.deepEqual(evidence.map((item) => item.ref.note_id), [research.id])
  assert.equal(evidence[0]!.independence, 'owner_stated', 'the bridge cannot verify independence, so it never claims it')
  assert.ok(!snapshot.missing.some((entry) => entry.kind === 'evidence' && entry.control_id === 'PRR-03'))
})

test('a pinned fact that changed since the kept snapshot makes the result needs_review, blocking, and verify names it', () => {
  const brand = sellingCompany()
  const kept = build(brand, { paidMedia: 'no' })
  const keptText = JSON.stringify(kept)

  const same = withoutAgentToken(() => verifyAssuranceSnapshot(brand.root, keptText))
  assert.equal(same.reproduced, true)
  assert.equal(same.actual_digest, kept.source_snapshot_digest)
  assert.deepEqual(same.changed, [])

  // The owner changes an approved fact through the existing change flow.
  const change = brand.engine.requestChange('business.offer.value_proposition', 'SYNTHETIC DEMO a different value')
  assert.equal(brand.engine.approveChange(change.id, brand.proof, change.expected_version).kind, 'recorded')

  const pinned = build(brand, { paidMedia: 'no', pins: parseSnapshotFile(keptText).pins })
  assert.equal(control(pinned, 'PRR-04').facts[0]!.state, 'changed')
  assert.ok(pinned.missing.some((entry) => entry.kind === 'changed_source' && entry.blocking && entry.question_ids.includes('business.offer.value_proposition')))
  const result = withoutAgentToken(() => assessWorkspace(brand.root, { asOf: AS_OF, paidMedia: 'no', pins: parseSnapshotFile(keptText).pins }))
  assert.equal(result.assessment.control_results.find((entry) => entry.control_id === 'PRR-04')?.status, 'needs_review')
  assertScoreAgrees(result.snapshot, result.assessment.completeness)

  const verify = withoutAgentToken(() => verifyAssuranceSnapshot(brand.root, keptText))
  assert.equal(verify.reproduced, false)
  assert.deepEqual(verify.changed, [{ kind: 'fact', id: 'business.offer.value_proposition', state: 'changed' }])
  assert.deepEqual(verify.authorizes, [])
  for (const lang of ASSURANCE_LANGS) assert.match(renderVerifyResult(verify, lang), /business\.offer\.value_proposition/)
})

test('a pinned research note that was archived since is reported missing, not silently dropped', () => {
  const brand = sellingCompany()
  const ws = openWorkspace(brand.root, { now: () => AS_OF })
  const note = captureNote(ws, { title: 'SYNTHETIC DEMO research', body: 'SYNTHETIC DEMO findings', kind: 'research', status: 'active', question_ids: ['business.customer.primary_segment'] })
  const kept = JSON.stringify(build(brand, { paidMedia: 'no' }))
  archiveNote(ws, note.id)
  const verify = withoutAgentToken(() => verifyAssuranceSnapshot(brand.root, kept))
  assert.equal(verify.reproduced, false)
  assert.deepEqual(verify.changed, [{ kind: 'research_note', id: note.id, state: 'missing' }])
})

test('a recorded contradiction on a judgment control is a finding, not a missing judgment', () => {
  const brand = coachBrand({ slug: 'assurance-conflict' })
  // SYNTHETIC DEMO: approving a placeholder is an existing interview contradiction rule (`approved-placeholder`).
  approved(brand, 'brand.strategy.differentiation', 'TBD')
  const result = withoutAgentToken(() => assessWorkspace(brand.root, { asOf: AS_OF, paidMedia: 'no' }))
  const prr08 = control(result.snapshot, 'PRR-08')
  assert.deepEqual(prr08.conflicts, ['con-approved-placeholder-brand.strategy.differentiation'])
  assert.ok(!result.snapshot.missing.some((entry) => entry.kind === 'reviewer_judgment' && entry.control_id === 'PRR-08'))
  assert.equal(result.assessment.control_results.find((entry) => entry.control_id === 'PRR-08')?.status, 'conflicted')
  assertScoreAgrees(result.snapshot, result.assessment.completeness)
})

test('never a certification: the claim stays internal and the limitation says so', () => {
  const brand = sellingCompany()
  const { snapshot, assessment } = withoutAgentToken(() => assessWorkspace(brand.root, { asOf: AS_OF, paidMedia: 'no' }))
  assert.equal(assessment.claim_level, 'internally_assessed')
  assert.ok(CLAIM_LEVELS.indexOf(assessment.claim_level) < CLAIM_LEVELS.indexOf('externally_reviewed'))
  assert.ok(assessment.limitations.includes('internal_assessment_only'))
  assert.equal(snapshot.disclaimer, 'internal_assessment_not_certification')
  for (const lang of ASSURANCE_LANGS) assert.ok(renderSnapshotSummary(snapshot, lang).includes(BRIDGE_TEXT.disclaimer![lang]))
  assert.match(BRIDGE_TEXT.disclaimer!.en, /not a certification, not a compliance statement/)
})

test('owner-local: refused while an agent token is set, before anything is read', () => {
  const brand = sellingCompany()
  const saved = process.env[AGENT_TOKEN_ENV]
  process.env[AGENT_TOKEN_ENV] = 'bos_agent_not-a-real-token'
  try {
    assert.throws(() => buildAssuranceSnapshot(brand.root, { asOf: AS_OF }), (error: unknown) => error instanceof AssuranceBridgeError && error.code === 'refused')
    assert.throws(() => assessWorkspace(brand.root, { asOf: AS_OF }), (error: unknown) => error instanceof AssuranceBridgeError && error.code === 'refused')
    assert.throws(() => verifyAssuranceSnapshot(brand.root, '{}'), (error: unknown) => error instanceof AssuranceBridgeError && error.code === 'refused')
  } finally {
    if (saved === undefined) delete process.env[AGENT_TOKEN_ENV]
    else process.env[AGENT_TOKEN_ENV] = saved
  }
})

test('no agent surface reaches the bridge: no MCP tool, no brand_retrieve kind, no Studio import', () => {
  const repo = path.resolve(import.meta.dirname, '..')
  const mcp = fs.readFileSync(path.join(repo, 'scripts', 'mcp.ts'), 'utf8')
  assert.ok(!/assurance/i.test(mcp), 'the MCP server neither imports nor registers anything from Assurance')
  assert.ok(!(RETRIEVE_KINDS as readonly string[]).some((kind) => /assur|audit/.test(kind)))
  const studio = path.join(repo, 'apps', 'studio')
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && fs.readFileSync(file, 'utf8').includes('assurance/workspace')) offenders.push(path.relative(repo, file))
    }
  }
  if (fs.existsSync(studio)) walk(studio)
  assert.deepEqual(offenders, [])
})

test('read-only: building, assessing and verifying write nothing in the workspace', () => {
  const brand = sellingCompany()
  const ws = openWorkspace(brand.root, { now: () => AS_OF })
  captureNote(ws, { title: 'SYNTHETIC DEMO research', body: 'SYNTHETIC DEMO findings', kind: 'research', status: 'active', question_ids: ['business.customer.primary_segment'] })
  const before = treeSnapshot(brand.root)
  const kept = JSON.stringify(build(brand, { paidMedia: 'no' }))
  withoutAgentToken(() => assessWorkspace(brand.root, { asOf: AS_OF, paidMedia: 'yes', audience: 'restricted' }))
  withoutAgentToken(() => verifyAssuranceSnapshot(brand.root, kept))
  assertUnchanged(before, brand.root, 'the bridge')
})

test('a kept snapshot file is data: malformed, foreign or oversized files are refused without echoing them', () => {
  const brand = sellingCompany()
  const other = coachBrand({ slug: 'assurance-other' })
  const foreign = JSON.stringify(build(other))
  assert.throws(() => withoutAgentToken(() => verifyAssuranceSnapshot(brand.root, foreign)), /different brand/)
  for (const bad of ['not json', '{"schema":"something-else"}', JSON.stringify({ schema: 'brand-os.assurance-snapshot/1' }), 'x'.repeat(1024 * 1024 + 1)]) {
    assert.throws(
      () => parseSnapshotFile(bad),
      (error: unknown) => error instanceof AssuranceBridgeError && error.code === 'invalid_pin' && !error.message.includes(bad.slice(0, 20)),
    )
  }
  const hostile = JSON.parse(foreign) as AssuranceSnapshot
  ;(hostile.controls[0]!.facts as unknown[]).push({ ref: { id: '../../etc/passwd', revision: 'x' } })
  assert.throws(() => parseSnapshotFile(JSON.stringify(hostile)), /malformed/)
  // The wrapped `assess --json` output is accepted too.
  const wrapped = JSON.stringify(withoutAgentToken(() => assessWorkspace(brand.root, { asOf: AS_OF })))
  assert.equal(parseSnapshotFile(wrapped).brand_id, 'assurance-demo')
})

test('every bridge string has en, fa and tr text', () => {
  const catalogs: Array<[string, Record<string, Record<string, string>>, readonly string[] | null]> = [
    ['BRIDGE_TEXT', BRIDGE_TEXT, null],
    ['MISSING_KIND_TEXT', MISSING_KIND_TEXT, MISSING_KINDS],
    ['PRESENCE_TEXT', PRESENCE_TEXT, FACT_PRESENCE],
    ['SUBJECT_FIELD_TEXT', SUBJECT_FIELD_TEXT, SUBJECT_FIELDS],
    ['SUBJECT_SOURCE_TEXT', SUBJECT_SOURCE_TEXT, ['approved_fact', 'brand_config', 'owner_flag', 'none']],
    ['BRIDGE_HELP', { help: BRIDGE_HELP }, null],
  ]
  for (const [name, catalog, keys] of catalogs) {
    if (keys) assert.deepEqual(Object.keys(catalog).sort(), [...keys].sort(), `${name} covers every code`)
    for (const [key, text] of Object.entries(catalog)) {
      for (const lang of ASSURANCE_LANGS) assert.ok(text[lang]?.trim(), `${name}.${key}.${lang}`)
      assert.notEqual(text.fa, text.en, `${name}.${key} is translated into Persian`)
      assert.match(text.fa!, /[؀-ۿ]/, `${name}.${key}.fa is written in Persian script`)
    }
  }
})

test('no score because a person has not judged PRR-08 says exactly that, not that a source changed', () => {
  const brand = sellingCompany()
  const { assessment } = withoutAgentToken(() => assessWorkspace(brand.root, { asOf: AS_OF, paidMedia: 'no' }))
  assert.deepEqual(assessment.completeness.blocked_by, ['reviewer_required'])
})
