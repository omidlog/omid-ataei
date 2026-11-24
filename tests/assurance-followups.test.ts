import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import YAML from 'yaml'
import { AGENT_TOKEN_ENV, allQuestions } from '@brand-os/brand-core'
import {
  assessWorkspace,
  BRIDGE_HELP,
  BRIDGE_TEXT,
  buildAssuranceSnapshot,
  PAID_MEDIA_QUESTION,
  renderSnapshotSummary,
  verifyAssuranceSnapshot,
  type AssuranceSnapshot,
  type BridgeOptions,
} from '@brand-os/brand-core/assurance/workspace'
import { answer, approved, coachBrand, type CoachBrand } from './helpers/coach.js'
import { useTestKey } from './helpers/knowledge.js'

/**
 * GAP-09 follow-ups (owner decisions 4 and 5, 2026-11-23):
 *
 * 4. "Does the brand run paid media?" is the interview question `business.marketing.paid_media`. The old
 *    `--paid-media` statement is a deprecated fallback, used only while that question has no approved answer.
 * 5. The personal module never turns a company brand into a person. Only the `personal-brand` profile is a
 *    person; a founder's personal brand inside a company repository is recorded separately.
 *
 * Every brand below is a SYNTHETIC DEMO temp brand.
 */
useTestKey()

const AS_OF = new Date('2026-11-23T00:00:00.000Z')
const REPO = path.resolve(import.meta.dirname, '..')

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

function paidSource(snapshot: AssuranceSnapshot) {
  return snapshot.subject_provenance.find((entry) => entry.field === 'runs_paid_media')
}

function setConfig(root: string, mutate: (config: { brand: Record<string, unknown>; modules: Record<string, unknown> }) => void): void {
  const file = path.join(root, 'brand', 'brand.config.yaml')
  const config = YAML.parse(fs.readFileSync(file, 'utf8')) as { brand: Record<string, unknown>; modules: Record<string, unknown> }
  mutate(config)
  fs.writeFileSync(file, YAML.stringify(config))
}

// ---- 4. paid media is an interview question -------------------------------------------------------

test('paid media is a fixed interview question in en, fa and tr, in the business marketing module', () => {
  const question = allQuestions().find((entry) => entry.id === PAID_MEDIA_QUESTION)
  assert.ok(question, 'the question exists in the bank source')
  assert.equal(question.module, 'business-marketing')
  assert.equal(question.question_type, 'single_choice')
  assert.deepEqual(question.options, ['undecided', 'yes', 'no'])
  assert.equal(question.sensitivity, 'internal', 'a yes or no is not the budget; the budget stays restricted')
  for (const lang of ['en', 'fa', 'tr'] as const) assert.ok(question.prompt[lang] && question.prompt[lang]!.trim().length > 10, `${lang} prompt`)
  assert.match(question.prompt.fa!, /[؀-ۿ]/, 'the Persian prompt is in Persian script')

  // The committed bank and field registry carry it too (no drift between source and YAML).
  const bank = YAML.parse(fs.readFileSync(path.join(REPO, 'brand/interview/question-bank/business.yaml'), 'utf8')) as { questions: Array<{ id: string; prompt: Record<string, string> }> }
  const committed = bank.questions.find((entry) => entry.id === PAID_MEDIA_QUESTION)
  assert.ok(committed)
  assert.deepEqual(committed.prompt, question.prompt)
  const registry = fs.readFileSync(path.join(REPO, 'brand/interview/field-registry.yaml'), 'utf8')
  assert.ok(registry.includes(`id: ${PAID_MEDIA_QUESTION}`))
})

test('the approved interview answer sets runs_paid_media, with its question as provenance', () => {
  for (const value of ['yes', 'no'] as const) {
    const brand = coachBrand({ slug: `assurance-paid-${value}` })
    approved(brand, PAID_MEDIA_QUESTION, value)
    const snapshot = build(brand)
    assert.equal(snapshot.subject.runs_paid_media, value)
    assert.deepEqual(paidSource(snapshot), { field: 'runs_paid_media', value, source: 'approved_fact', question_id: PAID_MEDIA_QUESTION })
    assert.equal(snapshot.paid_media_statement, 'unknown', 'no flag was given')
    assert.ok(!snapshot.missing.some((entry) => entry.field === 'runs_paid_media'), 'an answered question is not missing')
  }
})

test('a draft or undecided answer is never treated as approved: paid media stays unknown and points at the question', () => {
  const draft = coachBrand({ slug: 'assurance-paid-draft' })
  answer(draft, PAID_MEDIA_QUESTION, 'yes')
  const undecided = coachBrand({ slug: 'assurance-paid-undecided' })
  approved(undecided, PAID_MEDIA_QUESTION, 'undecided')
  for (const brand of [draft, undecided]) {
    const snapshot = build(brand)
    assert.equal(snapshot.subject.runs_paid_media, 'unknown')
    // A draft is no answer; an approved `undecided` is the interview answer (owner decision, 2026-11-24).
    assert.deepEqual(
      paidSource(snapshot),
      brand === draft
        ? { field: 'runs_paid_media', value: 'unknown', source: 'none', question_id: null }
        : { field: 'runs_paid_media', value: 'unknown', source: 'approved_fact', question_id: PAID_MEDIA_QUESTION },
    )
    const missing = snapshot.missing.find((entry) => entry.field === 'runs_paid_media')
    assert.ok(missing?.blocking)
    assert.deepEqual(missing.question_ids, [PAID_MEDIA_QUESTION])
    assert.equal(missing.flag, null)
  }
})

test('deprecated --paid-media: still works while unanswered, and never overrides an approved answer', () => {
  const unanswered = coachBrand({ slug: 'assurance-paid-alias' })
  const viaFlag = build(unanswered, { paidMedia: 'yes' })
  assert.equal(viaFlag.subject.runs_paid_media, 'yes', 'existing callers keep working')
  assert.equal(paidSource(viaFlag)?.source, 'owner_flag')

  const answered = coachBrand({ slug: 'assurance-paid-wins' })
  approved(answered, PAID_MEDIA_QUESTION, 'no')
  const plain = build(answered)
  const contradicted = build(answered, { paidMedia: 'yes' })
  assert.equal(contradicted.subject.runs_paid_media, 'no', 'the recorded answer wins')
  assert.equal(paidSource(contradicted)?.source, 'approved_fact')
  assert.equal(contradicted.source_snapshot_digest, plain.source_snapshot_digest, 'the flag cannot change what is assessed once the question is answered')
})

test('owner decision 2026-11-24: an approved undecided answer wins over --paid-media yes|no', () => {
  const brand = coachBrand({ slug: 'assurance-paid-undecided-wins' })
  approved(brand, PAID_MEDIA_QUESTION, 'undecided')
  const plain = build(brand)
  for (const flag of ['yes', 'no'] as const) {
    const flagged = build(brand, { paidMedia: flag })
    assert.equal(flagged.subject.runs_paid_media, 'unknown', `--paid-media ${flag} does not fill an undecided answer`)
    assert.deepEqual(paidSource(flagged), { field: 'runs_paid_media', value: 'unknown', source: 'approved_fact', question_id: PAID_MEDIA_QUESTION })
    assert.equal(flagged.paid_media_statement, flag, 'the statement is still recorded as given')
    assert.equal(flagged.source_snapshot_digest, plain.source_snapshot_digest, 'the flag cannot change what is assessed')
    const missing = flagged.missing.find((entry) => entry.field === 'runs_paid_media')
    assert.ok(missing?.blocking, 'the gap stays open and blocking')
    assert.deepEqual(missing.question_ids, [PAID_MEDIA_QUESTION])
  }
  // Without any interview answer the flag still works as before.
  const unanswered = coachBrand({ slug: 'assurance-paid-undecided-control' })
  assert.equal(build(unanswered, { paidMedia: 'no' }).subject.runs_paid_media, 'no')
})

test('a snapshot kept with the deprecated flag still verifies', () => {
  const brand = coachBrand({ slug: 'assurance-paid-verify' })
  approved(brand, 'business.sales.motion', 'self-serve')
  const kept = JSON.stringify(build(brand, { paidMedia: 'no' }))
  const result = withoutAgentToken(() => verifyAssuranceSnapshot(brand.root, kept))
  assert.equal(result.reproduced, true)
  assert.deepEqual(result.authorizes, [])
})

// ---- 5. a company brand stays a company -----------------------------------------------------------

test('regression: the personal module on a company brand keeps the subject a company', () => {
  const brand = coachBrand({ slug: 'assurance-founder', personal: true })
  const { snapshot, assessment } = withoutAgentToken(() => assessWorkspace(brand.root, { asOf: AS_OF }))
  assert.equal(snapshot.subject.entity_kind, 'company')
  assert.equal(assessment.subject.entity_kind, 'company')
  assert.deepEqual(snapshot.subject_provenance.find((entry) => entry.field === 'entity_kind'), { field: 'entity_kind', value: 'company', source: 'brand_config', question_id: null })
  // The founder's personal brand is its own record, beside the company.
  assert.deepEqual(snapshot.personal_brand, { enabled: true, facets: ['consultant-expert', 'founder-executive'], brand_entity_kind: 'company', changes_subject: false })
  // The person-only control stays out of a company's assessment.
  assert.equal(assessment.control_results.find((entry) => entry.control_id === 'PRR-15')?.status, 'not_applicable')
})

test('regression: turning the personal module on or off never changes a company brand assessment', () => {
  const brand = coachBrand({ slug: 'assurance-toggle' })
  approved(brand, 'business.sales.motion', 'self-serve')
  approved(brand, PAID_MEDIA_QUESTION, 'no')
  const off = build(brand)
  setConfig(brand.root, (config) => {
    config.modules.personal = { enabled: true, facets: ['founder-executive'] }
  })
  const on = build(brand)
  assert.equal(off.personal_brand.enabled, false)
  assert.equal(on.personal_brand.enabled, true)
  assert.deepEqual(on.subject, off.subject)
  assert.equal(on.source_snapshot_digest, off.source_snapshot_digest, 'same company, same digest')
  assert.deepEqual(on.missing, off.missing)
})

test('only the personal-brand profile makes the brand a person', () => {
  const brand = coachBrand({ slug: 'assurance-person', personal: true })
  setConfig(brand.root, (config) => {
    config.brand.profile = 'personal-brand'
  })
  const { snapshot, assessment } = withoutAgentToken(() => assessWorkspace(brand.root, { asOf: AS_OF }))
  assert.equal(snapshot.subject.entity_kind, 'person')
  assert.equal(snapshot.personal_brand.brand_entity_kind, 'person')
  assert.equal(snapshot.personal_brand.changes_subject, false)
  assert.notEqual(assessment.control_results.find((entry) => entry.control_id === 'PRR-15')?.status, 'not_applicable')
})

// ---- text ----------------------------------------------------------------------------------------

test('new text exists in en, fa and tr, and the summary names the separate personal brand', () => {
  for (const key of ['paid_media_deprecated', 'paid_media_ignored', 'paid_media_ignored_undecided', 'personal_brand', 'no_facets']) {
    for (const lang of ['en', 'fa', 'tr'] as const) assert.ok(BRIDGE_TEXT[key]?.[lang]?.trim(), `${key}.${lang}`)
    assert.match(BRIDGE_TEXT[key]!.fa, /[؀-ۿ]/, `${key}.fa is Persian`)
  }
  for (const lang of ['en', 'fa', 'tr'] as const) assert.ok(BRIDGE_HELP[lang].includes(PAID_MEDIA_QUESTION), `help names the question in ${lang}`)

  const founder = coachBrand({ slug: 'assurance-founder-text', personal: true })
  const snapshot = build(founder)
  for (const lang of ['en', 'fa', 'tr'] as const) {
    const text = renderSnapshotSummary(snapshot, lang)
    assert.ok(text.includes('`founder-executive`'), `${lang}: the facet is listed`)
    assert.ok(!text.includes('--paid-media'), `${lang}: the reproduce line does not ask for the deprecated flag`)
  }
  assert.ok(!renderSnapshotSummary(build(coachBrand({ slug: 'assurance-plain-text' })), 'en').includes('Personal brand'), 'nothing about a personal brand when the module is off')
})
