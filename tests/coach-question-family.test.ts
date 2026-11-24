import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addEvidence, allQuestions } from '@brand-os/brand-core'
import {
  CLARIFY_FAMILY_QUESTIONS,
  CLARIFY_QUESTIONS,
  clarifyQuestion,
  coachAfterAnswer,
  coachAnalyze,
  coachBeforeApproval,
  coachI18nErrors,
  COACH_CRITERIA,
  COACH_RULE_VERSION,
  questionFamily,
  renderBeforeApproval,
} from '@brand-os/brand-core/coach'
import { answer, ANSWER_CANARY, coachBrand } from './helpers/coach.js'
import { useTestKey } from './helpers/knowledge.js'

/**
 * BOS-08: the coach's clarifying question fits the question it follows up, and a claim with verified evidence gets no
 * evidence_support note. SYNTHETIC DEMO data only.
 */
useTestKey()

const AUDIENCE_EN = CLARIFY_FAMILY_QUESTIONS.en.audience.specificity!
const OWNER_ENV: NodeJS.ProcessEnv = {}

test('BOS-08: every criterion × question family has a question in en, fa and tr, and the rule version moved', () => {
  assert.deepEqual(coachI18nErrors(), [])
  assert.equal(COACH_RULE_VERSION, 'coach-rules/6')
  for (const locale of ['en', 'fa', 'tr'] as const) {
    for (const criterion of COACH_CRITERIA) {
      for (const id of ['business.customer.primary_segment', 'personal.positioning.boundaries', 'personal.positioning.known_for']) {
        assert.ok(clarifyQuestion(locale, criterion, id).trim(), `${locale} ${criterion} ${id}`)
      }
    }
  }
  // Nothing outside the audience family gets the audience question, for any criterion and any bank question.
  for (const question of allQuestions()) {
    const family = questionFamily(question.id)
    for (const locale of ['en', 'fa', 'tr'] as const) {
      const audience = CLARIFY_FAMILY_QUESTIONS[locale].audience.specificity
      for (const criterion of COACH_CRITERIA) {
        if (family !== 'audience') assert.notEqual(clarifyQuestion(locale, criterion, question.id), audience, `${question.id} ${criterion} ${locale}`)
      }
    }
  }
  assert.equal(questionFamily('personal.positioning.boundaries'), 'boundaries')
  assert.equal(questionFamily('personal.privacy.never_publish'), 'boundaries')
  assert.equal(questionFamily('personal.media.avoid'), 'boundaries')
  assert.equal(questionFamily('business.customer.primary_segment'), 'audience')
  assert.equal(questionFamily('personal.positioning.primary_audience'), 'audience')
  assert.equal(questionFamily('personal.consulting.target_clients'), 'audience')
  assert.equal(questionFamily('personal.positioning.known_for'), 'general')
  // evidence_support names no company, so it fits a person too.
  for (const locale of ['en', 'fa', 'tr'] as const) assert.ok(!/company|شرکت|şirket/i.test(CLARIFY_QUESTIONS[locale].evidence_support), locale)
})

test('BOS-08: a brief boundaries answer gets a boundaries question, never an audience one', () => {
  const brand = coachBrand({ personal: true })
  answer(brand, 'personal.positioning.boundaries', `legal ${ANSWER_CANARY}`)
  for (const locale of ['en', 'fa', 'tr'] as const) {
    const result = coachAnalyze(brand.engine, { mode: 'follow_up', questionId: 'personal.positioning.boundaries', locale })
    const finding = result.findings[0]!
    assert.equal(finding.code, 'follow_up_clarify', JSON.stringify(result.findings))
    assert.equal(finding.criterion, 'specificity')
    assert.equal(finding.suggested_question, CLARIFY_FAMILY_QUESTIONS[locale].boundaries.specificity)
    assert.notEqual(finding.suggested_question, CLARIFY_FAMILY_QUESTIONS[locale].audience.specificity)
    assert.ok(!JSON.stringify(result).includes(ANSWER_CANARY))
  }
  // The approve-time note re-reads the question in the requested locale and keeps the family.
  const notes = coachBeforeApproval(brand.engine, { draftIds: ['personal.positioning.boundaries'] }, { env: OWNER_ENV })
  assert.equal(notes.notes.length, 1)
  const text = renderBeforeApproval(notes)
  assert.ok(text.includes(CLARIFY_FAMILY_QUESTIONS.en.boundaries.specificity!))
  assert.ok(!text.includes(AUDIENCE_EN))

  // A general question gets the general wording; an audience question keeps the audience one.
  const general = coachBrand({ personal: true })
  answer(general, 'personal.positioning.known_for', 'strategy')
  assert.equal(coachAnalyze(general.engine, { mode: 'follow_up', questionId: 'personal.positioning.known_for' }).findings[0]!.suggested_question, CLARIFY_QUESTIONS.en.specificity)
  const audience = coachBrand()
  answer(audience, 'business.stage.current', 'pre-revenue')
  answer(audience, 'business.customer.primary_segment', 'everyone')
  assert.equal(coachAnalyze(audience.engine, { mode: 'follow_up', questionId: 'business.customer.primary_segment' }).findings[0]!.suggested_question, AUDIENCE_EN)
})

test('BOS-08: no evidence_support note for a claim that already has verified evidence', () => {
  const brand = coachBrand({ personal: true, facets: ['founder-executive'] })
  answer(brand, 'personal.founder.ventures', 'Example Studio (SYNTHETIC DEMO): co-founder and owner, product lead since 2019, building scheduling software for clinics.')
  const evidenceCodes = (mode: 'follow_up' | 'quality_review' | 'consistency_review') =>
    coachAnalyze(brand.engine, { mode, questionId: 'personal.founder.ventures' }).findings.filter((finding) => finding.criterion === 'evidence_support' || finding.verdict === 'needs_verification').map((finding) => finding.code)

  // Without a verified source, the claim gets an evidence note.
  assert.ok(evidenceCodes('quality_review').length > 0)
  const unverified = coachAfterAnswer(brand.engine, 'personal.founder.ventures', { env: OWNER_ENV })
  assert.equal(unverified.note?.criterion, 'evidence_support')

  const source = addEvidence(brand.root, brand.engine.questions(), { claim_id: 'personal.founder.ventures', kind: 'verification', source_type: 'public_record', reference: 'https://registry.example.org/companies/00000000' })
  brand.engine.approvals().reviewEvidence(source.id, 'verified', brand.proof)

  assert.deepEqual(evidenceCodes('quality_review'), [], 'quality_review, including the founder facet rubric')
  assert.deepEqual(evidenceCodes('follow_up'), [])
  assert.deepEqual(evidenceCodes('consistency_review'), [])
  const after = coachAfterAnswer(brand.engine, 'personal.founder.ventures', { env: OWNER_ENV })
  assert.notEqual(after.note?.criterion, 'evidence_support')
  const approval = coachBeforeApproval(brand.engine, { draftIds: ['personal.founder.ventures'] }, { env: OWNER_ENV })
  assert.ok(approval.notes.every((note) => note.criterion !== 'evidence_support'))
})
