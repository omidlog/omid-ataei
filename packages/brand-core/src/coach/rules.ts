import type { FieldQuestion } from '../types.js'
import { answerText, isDisposition, liveAnswer, notApplicableReason, verificationOf, type CoachContext } from './context.js'
import { containsTerm, isFreeText, normalizeForMatch } from './lexicon.js'
import type { CoachRuleCheckRecord, CoachSourceRef } from './model.js'

/**
 * The narrow consistency rule registry (Coach PR 2, fixes pack GAP-08).
 *
 * Three verdicts, kept apart on purpose and never expressed as a number:
 *
 * - `confirmed_conflict` — **only** an open hit from the interview's own `findContradictions`. Two records that
 *   cannot both be true. This file does not add one; `consistency.ts` adapts that function unchanged.
 * - `potential_tension` — two records that *can* both be true but often pull apart. The rule fires on a narrow,
 *   declared condition, its guards recognise the usual legitimate explanation (an entry tier, a launch offer, a
 *   staged launch), and the finding is a question for the owner, never a correction.
 * - `needs_verification` — a sensitive claim with no current independent source. The coach never marks a claim
 *   verified; only `brand:evidence verify` can, and the coach reads that register through `claimVerification`.
 *
 * Every rule, including the adapted `findContradictions` rules, also reports a **rule check**: whether it was
 * evaluated, and if not, that it was `not_tested` because an input is open. Silence from an untested rule is
 * therefore visible as such and never reads as "consistent".
 *
 * Every rule declares its field ids, its exact condition and its guards here, and has positive and negative tests in
 * `tests/coach-rules.test.ts`. Matching uses the coach lexicon's whole-phrase, case-insensitive, NFKC matcher across
 * en/fa/tr. A finding names the rule and the question ids; it never quotes the owner's words, and a restricted
 * question is never read (restricted answers hold no value, and the rules skip restricted ids explicitly).
 */

/**
 * One rule's coverage. `outcome: no_finding` means evaluated and silent; `not_tested` means it could not run.
 * `question_ids`: for `not_tested`, the open inputs; otherwise the fields the rule read or fired on. Ids only.
 */
export type CoachRuleCheck = CoachRuleCheckRecord

export interface RegistryFinding {
  rule: string
  verdict: 'potential_tension' | 'needs_verification'
  /** The field ids the rule fired on, sorted. Never values. */
  relatedIds: string[]
  sourceRefs: CoachSourceRef[]
}

// ---- lexicon (the coach's words, never the owner's) -----------------------------------------------

/** Premium / luxury positioning words. */
export const PREMIUM_MARKERS: readonly string[] = [
  'premium',
  'luxury',
  'luxurious',
  'high-end',
  'high end',
  'upscale',
  'exclusive',
  'boutique',
  'لوکس',
  'پریمیوم',
  'ممتاز',
  'اعیانی',
  'انحصاری',
  'lüks',
  'seçkin',
  'üst segment',
  'ayrıcalıklı',
]

/** Wording that positions the price itself as the lowest or cheap. "Affordable" is deliberately absent. */
export const LOWEST_PRICE_MARKERS: readonly string[] = [
  'cheapest',
  'cheap',
  'lowest price',
  'lowest prices',
  'rock-bottom',
  'rock bottom',
  'bargain',
  'ارزان‌ترین',
  'ارزانترین',
  'ارزان',
  'ارزون',
  'کمترین قیمت',
  'پایین‌ترین قیمت',
  'en ucuz',
  'ucuz',
  'en düşük fiyat',
  'en düşük fiyatlar',
]

/**
 * The legitimate explanations of a low price next to a premium position. When the pricing answer names one, the
 * low price is a tier, a time-bound offer or a segment price, so the pair is a trade-off the owner already
 * explained and the rule stays silent (`guard_matched`).
 */
export const PRICE_TIER_GUARDS: readonly string[] = [
  'entry',
  'entry-level',
  'entry level',
  'starter',
  'intro',
  'introductory',
  'launch offer',
  'launch price',
  'first month',
  'trial',
  'tier',
  'tiers',
  'plan',
  'plans',
  'student',
  'students',
  'nonprofit',
  'non-profit',
  'پلن',
  'طرح پایه',
  'ورودی',
  'آزمایشی',
  'ماه اول',
  'دانشجویی',
  'پیشنهاد افتتاحیه',
  'giriş',
  'başlangıç',
  'deneme',
  'ilk ay',
  'öğrenci',
  'paket',
  'lansman',
]

/**
 * Claims that need a source before anyone repeats them: guarantees, certifications, rankings, awards, proof.
 * Matched only in answers to questions that do not already declare `verified_evidence` (those are covered by
 * `evidence-claim-unverified`), and never in the fields whose job is to list such words as banned or as
 * needing a source.
 */
export const SENSITIVE_CLAIM_MARKERS: readonly string[] = [
  'guaranteed',
  'guarantee',
  'certified',
  'accredited',
  'clinically proven',
  'scientifically proven',
  'proven results',
  'number one',
  'number 1',
  'no. 1',
  '#1',
  'award-winning',
  'award winning',
  'market leader',
  'تضمینی',
  'تضمین',
  'گواهی‌شده',
  'دارای گواهی',
  'شماره یک',
  'رتبه اول',
  'برنده جایزه',
  'اثبات‌شده',
  'اثبات علمی',
  'garantili',
  'garanti',
  'sertifikalı',
  'akredite',
  'bir numara',
  'ödüllü',
  'klinik olarak kanıtlanmış',
  'bilimsel olarak kanıtlanmış',
  'pazar lideri',
]

/** A negation shortly before a sensitive term ("we never promise guaranteed results") is not a claim. */
const NEGATIONS: readonly string[] = ['not', 'no', 'never', 'without', "don't", 'dont', 'نه', 'هرگز', 'بدون', 'asla', 'değil', 'yok', 'olmadan']
const NEGATION_WINDOW_WORDS = 3
/** Negations that follow the word, with their personal endings: değil/değiliz, نیست/نیستیم. */
const NEGATION_STEMS_AFTER: readonly string[] = ['değil', 'degil', 'نیست'].map((word) => normalizeForMatch(word))

/** Fields whose purpose is to *list* banned or source-needing claims, so a marker there is not a claim. */
const CLAIM_LIST_FIELDS: ReadonlySet<string> = new Set([
  'brand.verbal.forbidden',
  'personal.governance.public_claim_policy',
  'business.marketing.availability_claim',
  // Lists of what never to show or publish (audit O-2): a marker there names something to avoid.
  'brand.mascot.forbidden',
  'personal.media.avoid',
  'personal.privacy.never_publish',
])

// ---- helpers ----------------------------------------------------------------------------------------

function markersIn(text: string, markers: readonly string[]): string[] {
  return markers.filter((term) => containsTerm(text, term))
}

/** The live, non-disposition, non-restricted answer text of an applicable question, or null otherwise. */
function liveText(ctx: CoachContext, id: string): string | null {
  const question = ctx.byId.get(id)
  if (!question || question.sensitivity === 'restricted') return null
  // A question the owner's config turned off is not_applicable: no rule reads it (as in quality_review).
  if (notApplicableReason(ctx, question) !== null) return null
  const answer = liveAnswer(ctx, id)
  if (!answer || isDisposition(answer)) return null
  const text = answerText(answer)
  return text ? text : null
}

/** True when the term occurs at least once *without* a negation in the preceding few words. */
export function assertedTerm(text: string, term: string): boolean {
  const words = normalizeForMatch(text)
    .split(/\s+/)
    .map((word) => word.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, ''))
    .filter(Boolean)
  const needle = normalizeForMatch(term).split(/\s+/).filter(Boolean)
  if (needle.length === 0) return false
  // Terms like "#1" or "no. 1" lose their symbols in the word split; they keep plain phrase containment.
  const stripped = needle.map((word) => word.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, ''))
  if (stripped.some((word, k) => word !== needle[k])) return containsTerm(text, term)
  const negations = new Set(NEGATIONS.map((word) => normalizeForMatch(word)))
  // Persian verbs negate with the prefix نمی (ZWNJ is already removed); Turkish often negates after the word.
  const negated = (word: string) => negations.has(word) || word.startsWith('نمی')
  for (let i = 0; i + stripped.length <= words.length; i++) {
    if (!stripped.every((word, k) => words[i + k] === word)) continue
    const before = words.slice(Math.max(0, i - NEGATION_WINDOW_WORDS), i)
    const after = words[i + stripped.length] ?? ''
    // Turkish and Persian also negate after the word: "ucuz değil", «ارزان نیست».
    if (!before.some(negated) && !NEGATION_STEMS_AFTER.some((stem) => after.startsWith(stem))) return true
  }
  return false
}

function refs(ids: string[]): CoachSourceRef[] {
  return ids.map((id): CoachSourceRef => ({ kind: 'question', id }))
}

// ---- tension rules ----------------------------------------------------------------------------------

interface RuleOutput {
  check: CoachRuleCheck
  findings: RegistryFinding[]
}

const POSITIONING_IDS = ['brand.strategy.differentiation', 'brand.strategy.promise', 'business.offer.value_proposition'] as const
const PRICING_ID = 'business.sales.pricing'

/**
 * `premium-vs-lowest-price` (potential_tension).
 * Fields: a positioning answer (`brand.strategy.differentiation`, `brand.strategy.promise`,
 * `business.offer.value_proposition`) and `business.sales.pricing`.
 * Fires when a positioning answer uses a premium word **and** the pricing answer positions the price as the
 * lowest or cheap. Guard: the pricing answer names a tier, plan, entry or launch offer, a trial, or a segment
 * price → a deliberate trade-off the owner explained, so nothing is reported. A plain figure (an entry plan at
 * 29 EUR next to a premium position) never fires: the coach cannot know what "low" means in that market.
 */
function premiumVsLowestPrice(ctx: CoachContext): RuleOutput {
  const rule = 'premium-vs-lowest-price'
  const positioning = POSITIONING_IDS.map((id) => [id, liveText(ctx, id)] as const).filter((entry): entry is readonly [typeof entry[0], string] => entry[1] !== null)
  const pricing = liveText(ctx, PRICING_ID)
  if (positioning.length === 0 || pricing === null) {
    const open = [...(positioning.length === 0 ? POSITIONING_IDS : []), ...(pricing === null ? [PRICING_ID] : [])]
    return { check: { rule_id: rule, kind: 'tension', outcome: 'not_tested', basis: 'inputs_open', question_ids: [...open].sort() }, findings: [] }
  }
  const read = [...positioning.map(([id]) => id), PRICING_ID].sort()
  const premium = positioning.filter(([, text]) => markersIn(text, PREMIUM_MARKERS).length > 0).map(([id]) => id)
  // "We are never cheap" is not a cheap price: a negated marker does not count.
  const lowest = LOWEST_PRICE_MARKERS.some((term) => assertedTerm(pricing, term))
  if (premium.length === 0 || !lowest) return { check: { rule_id: rule, kind: 'tension', outcome: 'no_finding', basis: 'rule_silent', question_ids: read }, findings: [] }
  if (markersIn(pricing, PRICE_TIER_GUARDS).length > 0) return { check: { rule_id: rule, kind: 'tension', outcome: 'no_finding', basis: 'guard_matched', question_ids: read }, findings: [] }
  const related = [...premium, PRICING_ID].sort()
  return {
    check: { rule_id: rule, kind: 'tension', outcome: 'potential_tension', basis: 'rule_fired', question_ids: related },
    findings: [{ rule, verdict: 'potential_tension', relatedIds: related, sourceRefs: refs(related) }],
  }
}

const STATUS_ID = 'business.product.public_status'
const AVAILABILITY_ID = 'business.marketing.availability_claim'

/**
 * `availability-held-back` (potential_tension).
 * Fields: `business.product.public_status`, `business.marketing.availability_claim` (both single choice).
 * Fires when the product is `available` while public marketing may only say `coming-soon` or nothing
 * (`do-not-claim`). That is allowed — a staged or quiet launch is a real strategy — so it is a question, never a
 * conflict. The reverse direction (marketing says available, product unshipped) is the existing
 * `unshipped-marketed-as-available` confirmed conflict and is not re-implemented here. `beta` or `unshipped` with a
 * cautious claim is the honest case and never fires.
 */
function availabilityHeldBack(ctx: CoachContext): RuleOutput {
  const rule = 'availability-held-back'
  const status = liveText(ctx, STATUS_ID)
  const claim = liveText(ctx, AVAILABILITY_ID)
  const read = [AVAILABILITY_ID, STATUS_ID]
  if (status === null || claim === null) {
    return { check: { rule_id: rule, kind: 'tension', outcome: 'not_tested', basis: 'inputs_open', question_ids: read.filter((id) => liveText(ctx, id) === null) }, findings: [] }
  }
  if (status !== 'available' || (claim !== 'coming-soon' && claim !== 'do-not-claim')) {
    return { check: { rule_id: rule, kind: 'tension', outcome: 'no_finding', basis: 'rule_silent', question_ids: read }, findings: [] }
  }
  return {
    check: { rule_id: rule, kind: 'tension', outcome: 'potential_tension', basis: 'rule_fired', question_ids: read },
    findings: [{ rule, verdict: 'potential_tension', relatedIds: read, sourceRefs: refs(read) }],
  }
}

// ---- verification rules -----------------------------------------------------------------------------

function requiresEvidence(question: FieldQuestion): boolean {
  return question.publication_requires?.includes('verified_evidence') === true
}

/**
 * `evidence-claim-unverified` (needs_verification).
 * Fields: every answered question that declares `publication_requires: verified_evidence` (credentials, awards,
 * highlights, founder ventures, audience metrics, exhibitions, talks, publications, …).
 * Fires when `claimVerification` is `unverified` or `owner_stated`. The claim stays unverified until the owner
 * verifies a source with `brand:evidence`; the coach never upgrades it.
 */
function evidenceClaimUnverified(ctx: CoachContext): RuleOutput {
  const rule = 'evidence-claim-unverified'
  const inputs = ctx.questions.filter((question) => requiresEvidence(question) && liveText(ctx, question.id) !== null)
  if (inputs.length === 0) return { check: { rule_id: rule, kind: 'verification', outcome: 'not_tested', basis: 'inputs_open', question_ids: [] }, findings: [] }
  const findings: RegistryFinding[] = []
  for (const question of [...inputs].sort((a, b) => a.id.localeCompare(b.id))) {
    if (verificationOf(ctx, question) === 'verified') continue
    findings.push({ rule, verdict: 'needs_verification', relatedIds: [question.id], sourceRefs: [{ kind: 'question', id: question.id }, { kind: 'evidence', id: question.id }] })
  }
  const ids = inputs.map((question) => question.id).sort()
  if (findings.length === 0) return { check: { rule_id: rule, kind: 'verification', outcome: 'no_finding', basis: 'rule_silent', question_ids: ids }, findings }
  return { check: { rule_id: rule, kind: 'verification', outcome: 'needs_verification', basis: 'rule_fired', question_ids: findings.map((item) => item.relatedIds[0]!) }, findings }
}

/**
 * `sensitive-claim-wording` (needs_verification).
 * Fields: every answered, non-restricted free-text question that does **not** declare `verified_evidence`,
 * except the fields that list banned or source-needing claims (`brand.verbal.forbidden`,
 * `personal.governance.public_claim_policy`).
 * Fires when the answer asserts a guarantee, certification, ranking, award or proof (`SENSITIVE_CLAIM_MARKERS`)
 * that is not negated in the three words before it, and the evidence register holds no independent source for
 * that field. Guard: a negated mention ("we never promise guaranteed results") is not a claim.
 */
function sensitiveClaimWording(ctx: CoachContext): RuleOutput {
  const rule = 'sensitive-claim-wording'
  const candidates = ctx.questions.filter((question) => isFreeText(question) && !requiresEvidence(question) && !CLAIM_LIST_FIELDS.has(question.id) && liveText(ctx, question.id) !== null)
  if (candidates.length === 0) return { check: { rule_id: rule, kind: 'verification', outcome: 'not_tested', basis: 'inputs_open', question_ids: [] }, findings: [] }
  const findings: RegistryFinding[] = []
  let guarded = false
  for (const question of [...candidates].sort((a, b) => a.id.localeCompare(b.id))) {
    const text = liveText(ctx, question.id)!
    const mentioned = markersIn(text, SENSITIVE_CLAIM_MARKERS)
    if (mentioned.length === 0) continue
    if (!mentioned.some((term) => assertedTerm(text, term))) {
      guarded = true
      continue
    }
    if (verificationOf(ctx, question) === 'verified') continue
    findings.push({ rule, verdict: 'needs_verification', relatedIds: [question.id], sourceRefs: [{ kind: 'question', id: question.id }, { kind: 'evidence', id: question.id }] })
  }
  if (findings.length > 0) return { check: { rule_id: rule, kind: 'verification', outcome: 'needs_verification', basis: 'rule_fired', question_ids: findings.map((item) => item.relatedIds[0]!) }, findings }
  // Only the read count is reported for a silent brand-wide scan; listing every free-text id would be noise.
  return { check: { rule_id: rule, kind: 'verification', outcome: 'no_finding', basis: guarded ? 'guard_matched' : 'rule_silent', question_ids: [] }, findings }
}

// ---- adapted contradiction rules: coverage only ---------------------------------------------------

/**
 * Inputs of the existing `findContradictions` rules, so their coverage can be reported. The rules themselves are
 * not re-implemented: a confirmed conflict comes only from that function (see `consistency.ts`). Rules with no
 * field inputs (`approved-placeholder`, `module-disabled-with-approval`) scan every approved answer and are always
 * evaluated.
 */
export const CONTRADICTION_RULE_INPUTS: Record<string, readonly string[]> = {
  'name-divergence': ['business.identity.trade_name', 'brand.identity.public_name_override'],
  'unshipped-marketed-as-available': [AVAILABILITY_ID, STATUS_ID],
  'approved-placeholder': [],
  'module-disabled-with-approval': [],
}

function contradictionChecks(ctx: CoachContext): CoachRuleCheck[] {
  return Object.entries(CONTRADICTION_RULE_INPUTS).map(([rule, inputs]) => {
    const hits = ctx.contradictions.filter((item) => item.status === 'open' && item.rule === rule)
    if (hits.length > 0) {
      return { rule_id: rule, kind: 'contradiction' as const, outcome: 'confirmed_conflict' as const, basis: 'rule_fired' as const, question_ids: [...new Set(hits.flatMap((item) => item.fields))].sort() }
    }
    const open = inputs.filter((id) => liveText(ctx, id) === null)
    if (open.length > 0) return { rule_id: rule, kind: 'contradiction' as const, outcome: 'not_tested' as const, basis: 'inputs_open' as const, question_ids: [...open].sort() }
    return { rule_id: rule, kind: 'contradiction' as const, outcome: 'no_finding' as const, basis: 'rule_silent' as const, question_ids: [...inputs].sort() }
  })
}

/** Every registered rule id, in report order. A test asserts each has en/fa/tr text. */
export const COACH_REGISTRY_RULES = ['premium-vs-lowest-price', 'availability-held-back', 'evidence-claim-unverified', 'sensitive-claim-wording'] as const
export type CoachRegistryRule = (typeof COACH_REGISTRY_RULES)[number]

/**
 * Runs the registry. Pure: reads the context, writes nothing. Returns the tension and verification findings and a
 * check for every rule (adapted contradiction rules first), so a reader can see what was and was not tested.
 */
export function registryReview(ctx: CoachContext): { findings: RegistryFinding[]; checks: CoachRuleCheck[] } {
  const outputs = [premiumVsLowestPrice(ctx), availabilityHeldBack(ctx), evidenceClaimUnverified(ctx), sensitiveClaimWording(ctx)]
  const rank = { needs_verification: 0, potential_tension: 1 } as const
  const findings = outputs.flatMap((output) => output.findings).sort((a, b) => rank[a.verdict] - rank[b.verdict] || a.rule.localeCompare(b.rule) || a.relatedIds.join().localeCompare(b.relatedIds.join()))
  return { findings, checks: [...contradictionChecks(ctx), ...outputs.map((output) => output.check)] }
}
