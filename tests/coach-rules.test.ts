import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import Ajv from 'ajv'
import YAML from 'yaml'
import addFormats from 'ajv-formats'
import {
  assertedTerm,
  coachAnalyze,
  coachI18nErrors,
  COACH_LIMITS,
  COACH_REGISTRY_RULES,
  COACH_RULE_VERSION,
  COACH_TENSION_RULES,
  CoachResultSchema,
  facetRubrics,
  renderCoachResult,
  TENSION_QUESTIONS,
  type CoachResult,
} from '@brand-os/brand-core/coach'
import { addEvidence, InterviewEngine } from '@brand-os/brand-core'
import { answer, ANSWER_CANARY, approved, assertUnchanged, coachBrand, defer, disposition, snapshot, type CoachBrand } from './helpers/coach.js'
import { useTestKey } from './helpers/knowledge.js'

/**
 * Strategic Coach PR 2 (fixes pack GAP-08): the narrow consistency rule registry and the personal facet rubrics.
 *
 * Three verdicts are kept apart: `confirmed_conflict` (only `findContradictions`), `potential_tension` (a question
 * about a trade-off) and `needs_verification` (a claim without an independent source), and a rule that could not run
 * is reported `not_tested`. Every test has its no-false-positive twin. All data is SYNTHETIC DEMO.
 */
useTestKey()

const repo = path.resolve(import.meta.dirname, '..')
const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)
const validateJsonSchema = ajv.compile(JSON.parse(fs.readFileSync(path.join(repo, 'schemas', 'coach-result.schema.json'), 'utf8')) as object)

function contract(result: CoachResult, what: string): CoachResult {
  const parsed = CoachResultSchema.safeParse(result)
  assert.ok(parsed.success, `${what}: zod contract — ${parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 3))}`)
  assert.ok(validateJsonSchema(result), `${what}: json schema — ${JSON.stringify(validateJsonSchema.errors?.slice(0, 3))}`)
  assert.deepEqual(result.authorizes, [])
  assert.equal(result.authority, 'derived_advice')
  assert.equal(result.rule_version, COACH_RULE_VERSION)
  assert.ok(!/\d+(\.\d+)?\s*%/.test(JSON.stringify(result.findings)), `${what}: no percentage or confidence number`)
  return result
}

function run(brand: CoachBrand, mode: 'follow_up' | 'quality_review' | 'consistency_review', questionId: string | null = null, locale: 'en' | 'fa' | 'tr' = 'en'): CoachResult {
  return contract(coachAnalyze(brand.engine, { mode, questionId, locale }), `${mode} ${questionId ?? 'brand'} ${locale}`)
}

const codes = (result: CoachResult) => result.findings.map((finding) => finding.code)
const verdicts = (result: CoachResult) => result.findings.map((finding) => finding.verdict).filter(Boolean)
const check = (result: CoachResult, rule: string) => {
  const found = result.rule_checks?.find((item) => item.rule_id === rule)
  assert.ok(found, `rule check ${rule} is reported`)
  return found
}

const PREMIUM = `The calm, premium choice for small dental clinics that want fewer tools, not more. ${ANSWER_CANARY}`

// ---- potential_tension versus confirmed_conflict -----------------------------------------------------

test('tension: premium positioning next to "cheapest" pricing is a question, never a confirmed conflict', () => {
  const brand = coachBrand()
  answer(brand, 'brand.strategy.differentiation', PREMIUM)
  answer(brand, 'business.sales.pricing', `The cheapest clinic software in the market, one price for everyone. ${ANSWER_CANARY}`)
  const before = snapshot(brand.root)

  for (const locale of ['en', 'fa', 'tr'] as const) {
    const result = run(brand, 'consistency_review', null, locale)
    assert.deepEqual(codes(result), ['consistency_tension'])
    const finding = result.findings[0]!
    assert.equal(finding.verdict, 'potential_tension')
    assert.equal(finding.status, 'needs_clarification')
    assert.equal(finding.severity, 'advice', 'a trade-off is advice, not attention')
    assert.equal(finding.suggested_question, TENSION_QUESTIONS[locale]['premium-vs-lowest-price'], 'it asks one explanatory question')
    assert.deepEqual(finding.related_question_ids, ['brand.strategy.differentiation', 'business.sales.pricing'])
    assert.equal(result.status, 'needs_clarification')
    assert.equal(check(result, 'premium-vs-lowest-price').outcome, 'potential_tension')
    assert.ok(!verdicts(result).includes('confirmed_conflict'))
    assert.ok(!JSON.stringify(result).includes(ANSWER_CANARY), 'the owner is never quoted')
    assert.ok(!renderCoachResult(result).includes(ANSWER_CANARY))
  }
  // A tension never reaches the per-field rubric as an open conflict.
  const quality = run(brand, 'quality_review', 'business.sales.pricing')
  assert.ok(!codes(quality).includes('field_in_open_conflict'))
  assertUnchanged(before, brand.root, 'tension review')
})

test('no false conflict: legitimate pricing and market trade-offs stay silent in en, fa and tr', () => {
  // SYNTHETIC DEMO. Each case is a premium (or luxury) position next to a price that is explained or plain.
  const cases: Array<{ name: string; positioning: string; pricing: string; geography?: string; basis: 'rule_silent' | 'guard_matched' }> = [
    { name: 'a plain entry figure', positioning: PREMIUM, pricing: 'Entry plan at 29 EUR a month per clinic, with the full plan at 180 EUR.', basis: 'rule_silent' },
    { name: 'affordable premium', positioning: PREMIUM, pricing: 'Affordable monthly pricing with no setup fee.', basis: 'rule_silent' },
    { name: 'two markets, two prices', positioning: PREMIUM, pricing: 'In Turkey 900 TRY a month, in Germany 59 EUR a month.', geography: 'Turkey first, then Germany.', basis: 'rule_silent' },
    { name: 'cheapest entry tier', positioning: PREMIUM, pricing: 'The cheapest entry plan is for students only; the clinic plan is priced as a premium service.', basis: 'guard_matched' },
    { name: 'launch offer', positioning: 'A luxury, boutique booking assistant for private clinics.', pricing: 'Bargain launch offer for the first month, then the standard rate.', basis: 'guard_matched' },
    { name: 'fa: luxury with a cheap entry plan', positioning: 'برند لوکس و آرام برای کلینیک‌های کوچک دندان‌پزشکی که ابزار کمتر می‌خواهند.', pricing: 'پلن ورودی ارزان برای ماه اول، سپس قیمت کامل.', basis: 'guard_matched' },
    { name: 'tr: premium with the cheapest starter package', positioning: 'Küçük diş klinikleri için sakin ve premium bir seçenek.', pricing: 'En ucuz başlangıç paketi öğrenciler için; klinik paketi tam fiyatlıdır.', basis: 'guard_matched' },
    { name: 'cheap without a premium claim', positioning: 'A simple booking assistant for small dental clinics in Istanbul.', pricing: 'The cheapest option in the market, on purpose.', basis: 'rule_silent' },
  ]
  for (const item of cases) {
    const brand = coachBrand()
    answer(brand, 'brand.strategy.differentiation', item.positioning)
    answer(brand, 'business.sales.pricing', item.pricing)
    if (item.geography) answer(brand, 'business.market.geography', item.geography)
    for (const locale of ['en', 'fa', 'tr'] as const) {
      const result = run(brand, 'consistency_review', null, locale)
      assert.deepEqual(codes(result), ['consistency_none'], `${item.name} (${locale}): no conflict and no tension`)
      assert.equal(result.status, 'ready', `${item.name}: ready`)
      const rule = check(result, 'premium-vs-lowest-price')
      assert.equal(rule.outcome, 'no_finding', `${item.name}: evaluated, nothing found`)
      assert.equal(rule.basis, item.basis, `${item.name}: basis`)
    }
  }
})

test('tension: a live product held back by cautious wording is a question; the honest cases are silent', () => {
  const held = coachBrand()
  answer(held, 'business.product.public_status', 'available')
  answer(held, 'business.marketing.availability_claim', 'coming-soon')
  const result = run(held, 'consistency_review')
  assert.deepEqual(codes(result), ['consistency_tension'])
  assert.equal(result.findings[0]!.verdict, 'potential_tension')
  assert.equal(check(result, 'availability-held-back').outcome, 'potential_tension')
  assert.equal(check(result, 'unshipped-marketed-as-available').outcome, 'no_finding')

  for (const [status, claim] of [
    ['beta', 'do-not-claim'],
    ['unshipped', 'coming-soon'],
    ['available', 'available'],
  ] as const) {
    const brand = coachBrand()
    answer(brand, 'business.product.public_status', status)
    answer(brand, 'business.marketing.availability_claim', claim)
    assert.deepEqual(codes(run(brand, 'consistency_review')), ['consistency_none'], `${status} + ${claim} is honest`)
  }

  // The opposite direction stays the existing confirmed conflict, reported once and never as a tension.
  const outrun = coachBrand()
  answer(outrun, 'business.product.public_status', 'unshipped')
  answer(outrun, 'business.marketing.availability_claim', 'available')
  const conflict = run(outrun, 'consistency_review')
  assert.deepEqual(codes(conflict), ['consistency_rule'])
  assert.equal(conflict.findings[0]!.verdict, 'confirmed_conflict')
  assert.equal(conflict.status, 'needs_review')
  assert.equal(check(conflict, 'unshipped-marketed-as-available').outcome, 'confirmed_conflict')
  assert.equal(check(conflict, 'availability-held-back').outcome, 'no_finding')
})

test('not_tested: a rule whose inputs are open says so, in en, fa and tr, instead of staying silent', () => {
  const empty = coachBrand()
  const result = run(empty, 'consistency_review')
  assert.equal(result.status, 'insufficient_context')
  for (const rule of COACH_REGISTRY_RULES) assert.equal(check(result, rule).outcome, 'not_tested', `${rule} is not tested on an empty brand`)
  assert.equal(check(result, 'name-divergence').outcome, 'not_tested')
  assert.equal(check(result, 'approved-placeholder').outcome, 'no_finding', 'a brand-wide scan always runs')

  const partial = coachBrand()
  answer(partial, 'business.sales.pricing', 'The cheapest option in the market.')
  const premium = check(run(partial, 'consistency_review'), 'premium-vs-lowest-price')
  assert.equal(premium.outcome, 'not_tested')
  assert.equal(premium.basis, 'inputs_open')
  assert.deepEqual(premium.question_ids, ['brand.strategy.differentiation', 'brand.strategy.promise', 'business.offer.value_proposition'])

  const words = { en: 'not tested', fa: 'آزموده نشد', tr: 'test edilmedi' } as const
  for (const locale of ['en', 'fa', 'tr'] as const) {
    const text = renderCoachResult(run(partial, 'consistency_review', null, locale))
    assert.ok(text.includes(words[locale]), `${locale}: not tested is said out loud`)
    assert.ok(!/\{\w+\}/.test(text), `${locale}: no unfilled placeholder`)
  }
})

// ---- needs_verification: sensitive claims stay unverified --------------------------------------------

test('verification: a guarantee, certification or ranking without a source stays unverified, and the coach verifies nothing', () => {
  const cases: Array<[string, string]> = [
    ['en', `Guaranteed results within two weeks for every clinic. ${ANSWER_CANARY}`],
    ['fa', 'نتیجهٔ تضمینی برای هر کلینیک در دو هفته.'],
    ['tr', 'Her klinik için iki haftada garantili sonuç.'],
    ['rank', 'The number one booking assistant for clinics in Istanbul.'],
  ]
  for (const [name, value] of cases) {
    const brand = coachBrand()
    answer(brand, 'brand.strategy.differentiation', value)
    const before = snapshot(brand.root)
    const result = run(brand, 'consistency_review')
    assert.deepEqual(codes(result), ['consistency_verification'], name)
    const finding = result.findings[0]!
    assert.equal(finding.verdict, 'needs_verification')
    assert.equal(finding.status, 'evidence_missing')
    assert.ok(finding.improvement?.includes('brand:evidence'), 'it names the real evidence command')
    assert.ok(!JSON.stringify(result).includes(ANSWER_CANARY))
    assert.equal(check(result, 'sensitive-claim-wording').outcome, 'needs_verification')
    assertUnchanged(before, brand.root, `verification ${name}`)
  }
})

test('verification: negated mentions and banned-claim lists are not claims', () => {
  const silent: Array<[string, string]> = [
    ['brand.strategy.differentiation', 'We never promise guaranteed results; we show the booking log instead.'],
    ['brand.strategy.differentiation', 'Sonuçlar garantili değil; kayıtları gösteriyoruz.'],
    ['brand.strategy.differentiation', 'هرگز نتیجهٔ تضمینی وعده نمی‌دهیم و فقط گزارش رزرو را نشان می‌دهیم.'],
    ['brand.verbal.forbidden', 'guaranteed, number one, clinically proven, #1'],
  ]
  for (const [id, value] of silent) {
    const brand = coachBrand()
    answer(brand, id, value)
    const result = run(brand, 'consistency_review')
    assert.deepEqual(codes(result), ['consistency_none'], `${id}: ${value}`)
  }
  assert.equal(assertedTerm('We do not offer a guarantee.', 'guarantee'), false)
  assert.equal(assertedTerm('A guarantee, not a promise.', 'guarantee'), true)
})

test('verification (audit O-2): never-publish and avoid lists name what to leave out, so they are not claims', () => {
  const silent: Array<[string, string]> = [
    ['personal.privacy.never_publish', 'Guaranteed results screenshots from old clients, and salary history.'],
    ['personal.media.avoid', 'Trophy shots with "number one" banners, certificates on the wall, guaranteed-results slides.'],
  ]
  for (const [id, value] of silent) {
    const brand = coachBrand({ personal: true })
    answer(brand, id, value)
    const result = run(brand, 'consistency_review')
    assert.ok(!verdicts(result).includes('needs_verification'), `${id}: ${JSON.stringify(codes(result))}`)
  }
})

test('verification: an evidence-gated claim stays unverified until an independent source is verified', () => {
  const brand = coachBrand({ personal: true })
  approved(brand, 'personal.credibility.credentials', 'Practice-management certificate from the Example Institute, 2024 (SYNTHETIC DEMO).')
  let result = run(brand, 'consistency_review')
  assert.deepEqual(codes(result), ['consistency_verification'])
  assert.equal(result.findings[0]!.requires_change_request, true, 'acting on an approved fact is a human change')
  assert.equal(check(result, 'evidence-claim-unverified').outcome, 'needs_verification')
  assert.equal(check(result, 'sensitive-claim-wording').outcome, 'not_tested', 'an evidence-gated field is not double-counted')

  // Owner testimony is a valid statement, but it is not independent verification.
  const testimony = addEvidence(brand.root, brand.engine.questions(), { claim_id: 'personal.credibility.credentials', kind: 'verification', source_type: 'owner_testimony', reference: 'Owner statement' })
  brand.engine.approvals().reviewEvidence(testimony.id, 'verified', brand.proof)
  result = run(brand, 'consistency_review')
  assert.deepEqual(codes(result), ['consistency_verification'], 'owner testimony alone keeps it unverified')

  const link = addEvidence(brand.root, brand.engine.questions(), { claim_id: 'personal.credibility.credentials', kind: 'verification', source_type: 'link', reference: 'https://institute.example.org/certificates' })
  const before = snapshot(brand.root)
  assert.deepEqual(codes(run(brand, 'consistency_review')), ['consistency_verification'], 'a pending source is not a verified one')
  assertUnchanged(before, brand.root, 'the coach never verifies a source')
  brand.engine.approvals().reviewEvidence(link.id, 'verified', brand.proof)
  // BOS-18: with the owner testimony still recorded the claim is only partly verified, so it still needs verification.
  assert.deepEqual(codes(run(brand, 'consistency_review')), ['consistency_verification'], 'a partly verified claim is not settled')
  brand.engine.approvals().withdrawEvidence(testimony.id, 'Covered by the independent source')
  result = run(brand, 'consistency_review')
  assert.deepEqual(codes(result), ['consistency_none'], 'an owner-verified independent source settles it')
})

// ---- personal facet rubrics ---------------------------------------------------------------------------

test('facet founder-executive: a role never implies ownership; "product owner" is a role title', () => {
  const brand = coachBrand({ personal: true, facets: ['founder-executive'] })
  answer(brand, 'personal.experience.roles', `Co-founder and majority owner of Example Studio since 2019, leading product. ${ANSWER_CANARY}`)
  const result = run(brand, 'quality_review', 'personal.experience.roles')
  const finding = result.findings.find((item) => item.code === 'facet_ownership_separate')
  assert.ok(finding, `ownership wording is flagged: ${JSON.stringify(codes(result))}`)
  assert.equal(finding.canonical_question_id, 'personal.experience.relationships', 'it links to the canonical relationship list')
  assert.equal(finding.criterion, 'evidence_support')
  assert.ok(result.notes.some((note) => note === 'facet_rubrics_checked: founder-role-not-ownership'))
  assert.ok(!JSON.stringify(result).includes(ANSWER_CANARY))

  for (const value of ['Product owner at Example Studio from 2019 to 2022, then head of product until 2024.', 'Co-founder and product lead of Example Studio since 2019, responsible for the roadmap.']) {
    const clean = coachBrand({ personal: true, facets: ['founder-executive'] })
    answer(clean, 'personal.experience.roles', value)
    assert.ok(!codes(run(clean, 'quality_review', 'personal.experience.roles')).includes('facet_ownership_separate'), value)
  }

  // Without the facet the same words are not assessed by this rubric.
  const other = coachBrand({ personal: true, facets: ['speaker-author'] })
  answer(other, 'personal.experience.roles', 'Co-founder and majority owner of Example Studio since 2019, leading product.')
  assert.ok(!codes(run(other, 'quality_review', 'personal.experience.roles')).includes('facet_ownership_separate'))
})

test('facet consultant-expert: client work needs the confidentiality rule; a recorded or deferred rule is respected', () => {
  const engagement = 'Two-week discovery sprints and a monthly advisory retainer for clinic owners, run remotely with a written summary.'
  const open = coachBrand({ personal: true, facets: ['consultant-expert'] })
  answer(open, 'personal.consulting.engagements', engagement)
  const result = run(open, 'quality_review', 'personal.consulting.engagements')
  const finding = result.findings.find((item) => item.code === 'facet_companion_open')
  assert.ok(finding, JSON.stringify(codes(result)))
  assert.equal(finding.canonical_question_id, 'personal.consulting.confidentiality')
  assert.equal(finding.suggested_question, null, 'the existing question owns its own prompt')

  const settled = coachBrand({ personal: true, facets: ['consultant-expert'] })
  answer(settled, 'personal.consulting.engagements', engagement)
  answer(settled, 'personal.consulting.confidentiality', 'No client is named without written permission, and no client data leaves the engagement.')
  assert.ok(!codes(run(settled, 'quality_review', 'personal.consulting.engagements')).includes('facet_companion_open'))

  const deferred = coachBrand({ personal: true, facets: ['consultant-expert'] })
  answer(deferred, 'personal.consulting.engagements', engagement)
  defer(deferred, 'personal.consulting.confidentiality')
  assert.ok(!codes(run(deferred, 'quality_review', 'personal.consulting.engagements')).includes('facet_companion_open'), 'decide later is a decline')
})

test('facet creator-educator: audience numbers carry a date; sponsorships need a disclosure rule', () => {
  const brand = coachBrand({ personal: true, facets: ['creator-educator'] })
  answer(brand, 'personal.creator.metrics', 'Newsletter subscribers: 1,200 (platform export).')
  const undated = run(brand, 'quality_review', 'personal.creator.metrics')
  assert.ok(codes(undated).includes('facet_claim_undated'), JSON.stringify(codes(undated)))

  for (const value of ['Newsletter subscribers: 1,200 as of 2025-01 (platform export).', 'مشترکان خبرنامه: ۱٬۲۰۰ نفر در مهر ۱۴۰۳ (خروجی پلتفرم).']) {
    const dated = coachBrand({ personal: true, facets: ['creator-educator'] })
    answer(dated, 'personal.creator.metrics', value)
    assert.ok(!codes(run(dated, 'quality_review', 'personal.creator.metrics')).includes('facet_claim_undated'), value)
  }

  // A count shaped like a year is not a date (audit O-1): the claim still has no date.
  for (const value of ['Newsletter subscribers 2000 (platform export).', '2000 subscribers on the newsletter.', 'Followers: 1450.', 'مشترکان خبرنامه: ۲۰۰۰ نفر (خروجی پلتفرم).', 'Bülten: 2000 abone (platform dışa aktarımı).']) {
    const count = coachBrand({ personal: true, facets: ['creator-educator'] })
    answer(count, 'personal.creator.metrics', value)
    assert.ok(codes(run(count, 'quality_review', 'personal.creator.metrics')).includes('facet_claim_undated'), value)
  }
  for (const value of ['Newsletter subscribers 2000 in March 2024 (platform export).', 'Since 2019: 2000+ readers.']) {
    const dated = coachBrand({ personal: true, facets: ['creator-educator'] })
    answer(dated, 'personal.creator.metrics', value)
    assert.ok(!codes(run(dated, 'quality_review', 'personal.creator.metrics')).includes('facet_claim_undated'), value)
  }

  answer(brand, 'personal.creator.sponsorship', 'Accept: software tools for clinics. Refuse: gambling, crypto trading and supplements.')
  const sponsor = run(brand, 'quality_review', 'personal.creator.sponsorship')
  assert.equal(sponsor.findings.find((item) => item.code === 'facet_companion_open')?.canonical_question_id, 'personal.creator.disclosure')
  answer(brand, 'personal.creator.disclosure', 'A "Sponsored" label in the first line of every paid post and video.')
  assert.ok(!codes(run(brand, 'quality_review', 'personal.creator.sponsorship')).includes('facet_companion_open'))
})

test('facet artist-designer and speaker-author: rights before portfolio, a year on every talk, "none" is valid', () => {
  const artist = coachBrand({ personal: true, facets: ['artist-designer'] })
  answer(artist, 'personal.artist.portfolio_taxonomy', 'Editorial illustration, packaging for small food brands, and personal ink studies grouped by series.')
  const rights = run(artist, 'quality_review', 'personal.artist.portfolio_taxonomy')
  assert.equal(rights.findings.find((item) => item.code === 'facet_companion_open')?.canonical_question_id, 'personal.artist.usage_rights')
  disposition(artist, 'personal.artist.usage_rights', 'unknown')
  assert.ok(!codes(run(artist, 'quality_review', 'personal.artist.portfolio_taxonomy')).includes('facet_companion_open'), 'an explicit unknown is a decision')

  const speaker = coachBrand({ personal: true, facets: ['speaker-author'] })
  answer(speaker, 'personal.speaking.prior_talks', 'Example Conf keynote on calm planning (recording link).')
  assert.ok(codes(run(speaker, 'quality_review', 'personal.speaking.prior_talks')).includes('facet_claim_undated'))
  answer(speaker, 'personal.speaking.prior_talks', 'Example Conf 2023 keynote on calm planning (recording link).')
  assert.ok(!codes(run(speaker, 'quality_review', 'personal.speaking.prior_talks')).includes('facet_claim_undated'))
  answer(speaker, 'personal.author.publications', 'None.')
  assert.ok(!codes(run(speaker, 'quality_review', 'personal.author.publications')).includes('facet_claim_undated'), '"none" is a valid answer')
})

test('facet rubrics: off when the personal module is off, absent from follow_up, and localized in en, fa and tr', () => {
  const company = coachBrand()
  answer(company, 'personal.experience.roles', 'Co-founder and majority owner of Example Studio since 2019, leading product.')
  const off = run(company, 'quality_review', 'personal.experience.roles')
  assert.ok(!codes(off).some((code) => code.startsWith('facet_')))

  const brand = coachBrand({ personal: true, facets: ['founder-executive'] })
  answer(brand, 'personal.experience.roles', 'Co-founder and majority owner of Example Studio since 2019, leading product.')
  // follow_up (and so the automatic moments) is unchanged: the facet rubric does not choose the follow-up.
  const followUp = run(brand, 'follow_up', 'personal.experience.roles')
  assert.ok(!codes(followUp).some((code) => code.startsWith('facet_')))
  const without = coachBrand({ personal: true, facets: ['speaker-author'] })
  answer(without, 'personal.experience.roles', 'Co-founder and majority owner of Example Studio since 2019, leading product.')
  const baseline = run(without, 'follow_up', 'personal.experience.roles')
  assert.deepEqual(
    followUp.findings.map((item) => [item.code, item.missing_dimension, item.canonical_question_id, item.suggested_question]),
    baseline.findings.map((item) => [item.code, item.missing_dimension, item.canonical_question_id, item.suggested_question]),
    'the follow-up is the same with or without the facet rubric',
  )

  for (const locale of ['fa', 'tr'] as const) {
    const result = run(brand, 'quality_review', 'personal.experience.roles', locale)
    const finding = result.findings.find((item) => item.code === 'facet_ownership_separate')!
    assert.ok(finding, locale)
    assert.notEqual(finding.reason, run(brand, 'quality_review', 'personal.experience.roles', 'en').findings.find((item) => item.code === 'facet_ownership_separate')!.reason, `${locale} is translated`)
    if (locale === 'fa') assert.match(finding.reason, /[؀-ۿ]/, 'Persian text is Persian')
    assert.ok(!/\{\w+\}/.test(finding.reason + (finding.improvement ?? '')), 'no unfilled placeholder')
  }

  assert.deepEqual(coachI18nErrors(), [])
  for (const rule of COACH_TENSION_RULES) for (const locale of ['en', 'fa', 'tr'] as const) assert.ok(TENSION_QUESTIONS[locale][rule].length > 20)
  const questionIds = new Set(brand.engine.questions().map((question) => question.id))
  for (const rubric of facetRubrics()) {
    for (const id of rubric.questions) assert.ok(questionIds.has(id), `${rubric.id}: ${id} is a canonical question`)
    if (rubric.canonical) assert.ok(questionIds.has(rubric.canonical), `${rubric.id}: ${rubric.canonical} is a canonical question`)
  }
})

test('tension (audit): a negated cheap price is not a cheap price, in en, fa and tr', () => {
  const pricing = [
    `We are never cheap; one monthly price of 400 EUR. ${ANSWER_CANARY}`,
    `ما ارزان نیستیم؛ یک قیمت ماهانه ۴۰۰ یورو. ${ANSWER_CANARY}`,
    `ارزان نیست؛ یک قیمت ماهانه ۴۰۰ یورو. ${ANSWER_CANARY}`,
    `Ucuz değil; aylık tek fiyat 400 EUR. ${ANSWER_CANARY}`,
  ]
  for (const value of pricing) {
    const brand = coachBrand()
    answer(brand, 'brand.strategy.differentiation', PREMIUM)
    answer(brand, 'business.sales.pricing', value)
    const result = run(brand, 'consistency_review')
    assert.equal(check(result, 'premium-vs-lowest-price').outcome, 'no_finding', value)
    assert.ok(!verdicts(result).includes('potential_tension'), value)
  }
})

test('applicability (audit): rules do not read a question the owner config turned off', () => {
  const brand = coachBrand({ personal: true })
  approved(brand, 'personal.credibility.credentials', 'Practice-management certificate from the Example Institute, 2024 (SYNTHETIC DEMO).')
  assert.equal(check(run(brand, 'consistency_review'), 'evidence-claim-unverified').outcome, 'needs_verification')
  const file = path.join(brand.root, 'brand', 'brand.config.yaml')
  const config = YAML.parse(fs.readFileSync(file, 'utf8')) as { modules: { personal: { enabled: boolean } } }
  config.modules.personal.enabled = false
  fs.writeFileSync(file, YAML.stringify(config))
  const off: CoachBrand = { ...brand, engine: new InterviewEngine(brand.root) }
  const result = run(off, 'consistency_review')
  assert.notEqual(check(result, 'evidence-claim-unverified').outcome, 'needs_verification')
  assert.ok(!verdicts(result).includes('needs_verification'), JSON.stringify(codes(result)))
})

test('cap (audit O-3): many unverified claims never push the only tension out of the findings', () => {
  const brand = coachBrand({ personal: true })
  answer(brand, 'brand.strategy.differentiation', PREMIUM)
  answer(brand, 'business.sales.pricing', 'The cheapest clinic software in the market, one price for everyone.')
  const skip = new Set(['brand.strategy.differentiation', 'business.sales.pricing'])
  let recorded = 0
  for (const question of brand.engine.questions()) {
    if (recorded >= 80) break
    if (skip.has(question.id) || (question.question_type !== 'long_text' && question.question_type !== 'short_text')) continue
    if (brand.engine.changeAnswer(question.id, 'Guaranteed results for every clinic.').kind === 'recorded') recorded += 1
  }
  const result = run(brand, 'consistency_review')
  const unverified = result.findings.filter((finding) => finding.verdict === 'needs_verification').length
  assert.ok(unverified >= COACH_LIMITS.maxConsistencyFindings - 1, `the cap is reached (${unverified} unverified)`)
  assert.equal(check(result, 'premium-vs-lowest-price').outcome, 'potential_tension')
  assert.ok(codes(result).includes('consistency_tension'), 'the tension rule_checks names is in the findings')
  assert.ok(result.findings.length <= COACH_LIMITS.maxConsistencyFindings)
})

test('scoped rule_checks (audit O-4): brand-wide checks with no question ids stay in a scoped review', () => {
  const brand = coachBrand()
  answer(brand, 'brand.strategy.differentiation', PREMIUM)
  const whole = run(brand, 'consistency_review')
  const scoped = run(brand, 'consistency_review', 'brand.strategy.differentiation')
  const brandWide = (whole.rule_checks ?? []).filter((item) => item.question_ids.length === 0).map((item) => item.rule_id)
  assert.ok(brandWide.includes('approved-placeholder') && brandWide.includes('module-disabled-with-approval'), JSON.stringify(brandWide))
  const scopedIds = (scoped.rule_checks ?? []).map((item) => item.rule_id)
  for (const rule of brandWide) assert.ok(scopedIds.includes(rule), `${rule} is reported in the scoped review`)
})
