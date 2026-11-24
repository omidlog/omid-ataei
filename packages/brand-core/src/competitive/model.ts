import crypto from 'node:crypto'
import { CLAIM_KEY } from '../research/model.js'

/**
 * Competitive landscape (Identity Slice B): a small, typed, per-brand competitor index.
 *
 * It is an index, not a notebook. Every third-party excerpt lives exactly once, in a Knowledge research note
 * (`brand:seo research …`, topic `market_observation`). A competitor record holds stable ids, owner-set
 * classifications, short recorder labels and evidence refs `{note_id, revision, claim_key, observed_at}`. It never
 * holds a quote. Trust, freshness and conflicts are computed when the landscape is read, never stored.
 *
 * A competitor record is not a brand fact. It cannot change `business.sales.pricing`, positioning, channels, the
 * logo or any approved asset; those keep their existing owners and the existing approval flow.
 * See docs-internal/COMPETITIVE.md.
 */

export const COMPETITIVE_SCHEMA_VERSION = 1
export const LANDSCAPE_SCHEMA = 'brand-os.competitive-landscape/1'

/** One dimension: how buyers relate the other business to this brand. A benchmark is not always a competitor. */
export const RELATIONSHIPS = ['direct', 'indirect', 'substitute', 'aspirational_benchmark'] as const
/** Another dimension, relative to the brand's approved target market. Never a stand-in for the relationship. */
export const GEOGRAPHIES = ['local', 'regional', 'international'] as const
/** `seo_interview`: imported on the owner's command from seo.competitors.named; still an owner assumption. */
export const CANDIDATE_SOURCES = ['owner_named', 'research_lead', 'seo_interview'] as const
/** Stored by the owner. `researched` and `needs_refresh` are computed from the evidence, never stored. */
export const STORED_STATUSES = ['candidate', 'owner_reviewed', 'disputed', 'archived'] as const
/** Assessment completeness, not the owner's acceptance of every observation. */
export const ASSESSMENTS = ['candidate', 'researched', 'owner_reviewed', 'needs_refresh', 'disputed', 'archived'] as const
export const DIMENSIONS = ['offer', 'audience', 'geography', 'public_price', 'public_message', 'visual_language', 'observable_channels', 'strength_hypothesis', 'weakness_hypothesis'] as const
/** What the research supports. `identity` covers logo and visual identity work. */
export const PURPOSES = ['identity', 'positioning', 'marketing', 'pricing', 'seo', 'expansion'] as const
export const STATEMENT_KINDS = ['observed_claim', 'inference'] as const

export const BILLING_PERIODS = ['month', 'year', 'one_time', 'unknown'] as const
export const BILLING_COMMITMENTS = ['monthly', 'annual', 'none', 'unknown'] as const
export const TAX_INCLUSIONS = ['included', 'excluded', 'unknown'] as const
export const PROMOTIONS = ['none_observed', 'promotional', 'unknown'] as const

export type Relationship = (typeof RELATIONSHIPS)[number]
export type Geography = (typeof GEOGRAPHIES)[number]
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number]
export type StoredStatus = (typeof STORED_STATUSES)[number]
export type Assessment = (typeof ASSESSMENTS)[number]
export type Dimension = (typeof DIMENSIONS)[number]
export type Purpose = (typeof PURPOSES)[number]
export type StatementKind = (typeof STATEMENT_KINDS)[number]
export type BillingPeriod = (typeof BILLING_PERIODS)[number]
export type BillingCommitment = (typeof BILLING_COMMITMENTS)[number]
export type TaxInclusion = (typeof TAX_INCLUSIONS)[number]
export type Promotion = (typeof PROMOTIONS)[number]

/** Which matrix dimensions each purpose needs. SEO also needs search evidence this index does not hold. */
export const PURPOSE_DIMENSIONS: Record<Purpose, Dimension[]> = {
  identity: ['visual_language', 'public_message'],
  positioning: ['offer', 'audience', 'public_message', 'strength_hypothesis', 'weakness_hypothesis'],
  marketing: ['public_message', 'observable_channels', 'audience'],
  pricing: ['public_price', 'offer'],
  seo: ['public_message'],
  expansion: ['geography', 'offer'],
}

export const COMPETITOR_ID = /^cmp_[0-9a-f-]{36}$/
export const OBSERVATION_ID = /^ob_[0-9a-f-]{36}$/
const MARKET = /^(?:[A-Z]{2}|GLOBAL)$/
const CURRENCY = /^[A-Z]{3}$/

export const COMPETITIVE_LIMITS = {
  maxNameChars: 80,
  maxLabelChars: 200,
  maxReasonChars: 200,
  maxOfferChars: 80,
  maxScopeChars: 120,
  maxMarkets: 20,
  maxObservations: 100,
  maxCandidates: 200,
  maxDomainChars: 253,
  maxFileBytes: 512 * 1024,
} as const

export class CompetitiveError extends Error {
  constructor(
    readonly code: 'invalid_input' | 'not_found' | 'duplicate_candidate' | 'wrong_brand' | 'refused' | 'stale_source' | 'unsupported_claim' | 'unsafe_path' | 'invalid_record',
    message: string,
  ) {
    super(message)
    this.name = 'CompetitiveError'
  }
}

/**
 * A Knowledge research note at the revision that was read, and the claim in it this record relies on.
 * `observed_at` is the source's retrieval time, copied from the note, never typed in.
 */
export interface EvidenceRef {
  note_id: string
  revision: string
  claim_key: string
  observed_at: string
}

/** A public price as the competitor's page states it. Unknown is never zero; there is no currency conversion. */
export interface PriceObservation {
  offer_name: string
  amount: number
  currency: string
  billing_period: BillingPeriod
  billing_commitment: BillingCommitment
  market: string
  tax_inclusion: TaxInclusion
  promotion: Promotion
  feature_scope: string | null
}

export interface Observation {
  observation_id: string
  dimension: Dimension
  /** `observed_claim`: what the source says. `inference`: the recorder's hypothesis drawn from it. Never mixed. */
  statement_kind: StatementKind
  /** A short label written by the recorder. Not a quote; the quote stays in the note. */
  label: string
  evidence: EvidenceRef
  price: PriceObservation | null
  recorded_at: string
}

export interface CompetitorRecord {
  schema_version: number
  kind: 'competitive_candidate'
  competitor_id: string
  brand_slug: string
  display_name: string
  /** Normalized name used only to warn about duplicates. Records are never identified or merged by it. */
  name_key: string
  relationship: Relationship[]
  geographic_relevance: Geography[]
  markets: string[]
  source: CandidateSource
  status: StoredStatus
  status_reason: string | null
  /** What the owner typed. Shown as the official domain only while `domain_evidence` verifies it. */
  domain_claim: string | null
  domain_evidence: EvidenceRef | null
  /** Same-name candidates the owner said are different businesses, with the reason. */
  distinct_from: Array<{ competitor_id: string; reason: string }>
  observations: Observation[]
  created_at: string
  updated_at: string
}

export interface CompetitiveScope {
  schema_version: number
  kind: 'competitive_scope'
  brand_slug: string
  purposes: Purpose[]
  updated_at: string
}

export function newCompetitorId(): string {
  return `cmp_${crypto.randomUUID()}`
}

export function newObservationId(): string {
  return `ob_${crypto.randomUUID()}`
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T
  throw new CompetitiveError('invalid_input', `${field} must be one of ${allowed.join(', ')}.`)
}

export function listOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T[] {
  if (value === undefined || value === null || value === '') return []
  const items = typeof value === 'string' ? value.split(',').map((item) => item.trim()).filter(Boolean) : value
  if (!Array.isArray(items)) throw new CompetitiveError('invalid_input', `${field} must be a list.`)
  const out: T[] = []
  for (const item of items) {
    const v = oneOf(item, allowed, field)
    if (!out.includes(v)) out.push(v)
  }
  return out
}

export function validateCompetitorId(value: unknown): string {
  if (typeof value !== 'string' || !COMPETITOR_ID.test(value)) throw new CompetitiveError('invalid_input', 'A competitor id looks like cmp_<uuid>.')
  return value
}

export function validateObservationId(value: unknown): string {
  if (typeof value !== 'string' || !OBSERVATION_ID.test(value)) throw new CompetitiveError('invalid_input', 'An observation id looks like ob_<uuid>.')
  return value
}

export function validateClaimKey(value: unknown): string {
  if (typeof value !== 'string' || !CLAIM_KEY.test(value)) throw new CompetitiveError('invalid_input', 'claim_key must be a dotted id such as rival.pricing.pro_monthly.')
  return value
}

/** A short single-line label. Bounded so it cannot become a copy of a source. */
export function shortText(value: unknown, max: number, field: string, required = true): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new CompetitiveError('invalid_input', `${field} is required.`)
    return null
  }
  if (typeof value !== 'string') throw new CompetitiveError('invalid_input', `${field} must be text.`)
  const clean = value.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!clean) {
    if (required) throw new CompetitiveError('invalid_input', `${field} is required.`)
    return null
  }
  if (clean.length > max) throw new CompetitiveError('invalid_input', `${field} is longer than ${max} characters. Keep source text in a Knowledge research note and cite it.`)
  return clean
}

export function validateMarkets(value: unknown): string[] {
  const items = value === undefined || value === null || value === '' ? [] : typeof value === 'string' ? value.split(',').map((item) => item.trim()) : value
  if (!Array.isArray(items)) throw new CompetitiveError('invalid_input', 'Markets must be a list.')
  const out: string[] = []
  for (const item of items) {
    const code = typeof item === 'string' ? item.trim().toUpperCase() : ''
    if (!MARKET.test(code)) throw new CompetitiveError('invalid_input', 'A market is a two-letter country code (TR, IR, DE) or GLOBAL.')
    if (!out.includes(code)) out.push(code)
  }
  if (out.length > COMPETITIVE_LIMITS.maxMarkets) throw new CompetitiveError('invalid_input', `At most ${COMPETITIVE_LIMITS.maxMarkets} markets.`)
  return out.sort()
}

/** Case-folded letters and digits only. Used to warn about duplicates; never to merge records. */
export function nameKey(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

const BLOCKED_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home', '.corp', '.test', '.invalid', '.example', '.onion']

/**
 * A bare public domain name (`rival.com`, `www.rival.com.tr`). URLs, paths, ports, IP addresses, localhost and
 * private-use suffixes are refused: the index stores a name, and nothing ever fetches it.
 */
export function validateDomain(value: unknown): string {
  if (typeof value !== 'string') throw new CompetitiveError('invalid_input', 'A domain must be text.')
  const domain = value.trim().toLowerCase().replace(/\.$/, '')
  if (!domain || domain.length > COMPETITIVE_LIMITS.maxDomainChars) throw new CompetitiveError('invalid_input', 'A domain is required.')
  if (/[/:@?#\s\\]/.test(domain)) throw new CompetitiveError('invalid_input', 'Give a bare domain such as rival.com, not a URL.')
  if (/^\d+(?:\.\d+){3}$/.test(domain) || domain.includes('[')) throw new CompetitiveError('invalid_input', 'An IP address is not a competitor domain.')
  const labels = domain.split('.')
  if (labels.length < 2 || !labels.every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label)) || !/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(labels[labels.length - 1]!)) {
    throw new CompetitiveError('invalid_input', 'That is not a public domain name.')
  }
  if (domain === 'localhost' || BLOCKED_HOST_SUFFIXES.some((suffix) => `.${domain}`.endsWith(suffix))) throw new CompetitiveError('invalid_input', 'Local and private-use domains are refused.')
  return domain
}

/** The host is the domain itself or one of its subdomains. */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase()
  return h === domain || h.endsWith(`.${domain}`)
}

// ---- public price support ----------------------------------------------------------------------------

const DIGITS: Record<string, string> = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '٬': ',', '٫': '.' }

function asciiDigits(text: string): string {
  return text.normalize('NFKC').replace(/[۰-۹٠-٩٬٫]/g, (ch) => DIGITS[ch] ?? ch)
}

/** Every number a reader could see in the text, under both decimal conventions (1,234.50 and 1.234,50). */
export function numbersIn(text: string): number[] {
  const out = new Set<number>()
  const ascii = asciiDigits(text)
  for (const match of ascii.matchAll(/\d+/g)) out.add(Number(match[0]))
  for (const match of ascii.matchAll(/\d+(?:[.,\s]\d+)*/g)) {
    const token = match[0].replace(/\s/g, '')
    const dotDecimal = Number(token.replace(/,/g, ''))
    const commaDecimal = Number(token.replace(/\./g, '').replace(',', '.'))
    const plain = Number(token.replace(/[.,]/g, ''))
    for (const n of [dotDecimal, commaDecimal, plain]) if (Number.isFinite(n)) out.add(n)
  }
  return [...out]
}

const CURRENCY_CUES: Record<string, RegExp> = {
  USD: /\$|\busd\b|us\s?\$/i,
  EUR: /€|\beur\b|\beuro/i,
  GBP: /£|\bgbp\b/i,
  TRY: /₺|\btry\b|\btl\b|türk lirası/i,
  IRR: /\birr\b|ریال|rial/i,
  AED: /\baed\b|درهم|dirham/i,
}

const PERIOD_CUES: Record<'month' | 'year' | 'one_time', RegExp> = {
  month: /month|\/\s?mo\b|\bmo\b|\bmonthly|\baylık|\bay\b|\/\s?ay\b|ماه/i,
  year: /year|\/\s?yr\b|annual|\byıl|yearly|سال/i,
  one_time: /one[-\s]?time|lifetime|once|tek seferlik|ömür boyu|یک\s?بار/i,
}

const TAX_CUE = /\btax|\bvat\b|\bkdv\b|vergi|مالیات|ارزش افزوده/i
const PROMOTION_CUE = /discount|%\s?off|\boff\b|\bsave\b|\bsale\b|promo|limited|first (?:month|year)|introductory|\bintro\b|launch offer|indirim|kampanya|fırsat|تخفیف|حراج|ویژه/i

export interface PriceSupport {
  ok: boolean
  problems: string[]
}

/**
 * Whether the cited quote really supports the typed price. The amount must appear in the quote, the currency must be
 * named or shown by its sign, a stated period, commitment or tax basis needs a cue in the quote (otherwise it must be
 * `unknown`), and a quote that reads like a promotion cannot be recorded as `none_observed`.
 */
export function priceSupport(price: PriceObservation, quote: string): PriceSupport {
  const problems: string[] = []
  const text = asciiDigits(quote)
  if (!numbersIn(text).some((n) => Math.abs(n - price.amount) < 1e-9)) problems.push(`the amount ${price.amount} does not appear in the quote`)
  const currencyCue = CURRENCY_CUES[price.currency]
  if (!(currencyCue ? currencyCue.test(text) : new RegExp(`\\b${price.currency}\\b`, 'i').test(text))) problems.push(`the currency ${price.currency} is not shown in the quote`)
  if (price.billing_period !== 'unknown' && !PERIOD_CUES[price.billing_period].test(text)) problems.push(`the quote does not state a ${price.billing_period} period; use unknown`)
  if (price.billing_commitment === 'annual' && !PERIOD_CUES.year.test(text)) problems.push('the quote does not state an annual commitment; use unknown')
  if (price.billing_commitment === 'monthly' && !PERIOD_CUES.month.test(text)) problems.push('the quote does not state a monthly commitment; use unknown')
  if (price.tax_inclusion !== 'unknown' && !TAX_CUE.test(text)) problems.push('the quote says nothing about tax; use unknown')
  if (price.promotion === 'none_observed' && PROMOTION_CUE.test(text)) problems.push('the quote reads like a promotion; record promotion as promotional or unknown')
  return { ok: problems.length === 0, problems }
}

export function validatePrice(raw: Record<string, unknown>): PriceObservation {
  const amount = typeof raw.amount === 'number' ? raw.amount : typeof raw.amount === 'string' && raw.amount.trim() !== '' ? Number(raw.amount) : NaN
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e12) throw new CompetitiveError('invalid_input', 'amount must be a number as shown on the page. Unknown is not zero: leave the price out instead.')
  const currency = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : ''
  if (!CURRENCY.test(currency)) throw new CompetitiveError('invalid_input', 'currency must be a three-letter code such as USD, EUR or TRY. Prices are never converted.')
  const markets = validateMarkets(raw.market)
  if (markets.length !== 1 || markets[0] === 'GLOBAL') throw new CompetitiveError('invalid_input', 'A price needs the one country market it was observed for (TR, US…).')
  return {
    offer_name: shortText(raw.offer_name, COMPETITIVE_LIMITS.maxOfferChars, 'offer_name')!,
    amount,
    currency,
    billing_period: oneOf(raw.billing_period ?? 'unknown', BILLING_PERIODS, 'billing_period'),
    billing_commitment: oneOf(raw.billing_commitment ?? 'unknown', BILLING_COMMITMENTS, 'billing_commitment'),
    market: markets[0]!,
    tax_inclusion: oneOf(raw.tax_inclusion ?? 'unknown', TAX_INCLUSIONS, 'tax_inclusion'),
    promotion: oneOf(raw.promotion ?? 'unknown', PROMOTIONS, 'promotion'),
    feature_scope: shortText(raw.feature_scope, COMPETITIVE_LIMITS.maxScopeChars, 'feature_scope', false),
  }
}

/** Why a price cannot be compared with others as-is. Empty means its terms are all known; it is still never sorted. */
export function priceCaveats(price: PriceObservation): string[] {
  const out: string[] = []
  if (price.billing_period === 'unknown') out.push('billing_period_unknown')
  if (price.billing_commitment === 'unknown') out.push('billing_commitment_unknown')
  if (price.billing_commitment === 'annual' && price.billing_period === 'month') out.push('monthly_rate_billed_annually')
  if (price.tax_inclusion === 'unknown') out.push('tax_unknown')
  if (price.promotion !== 'none_observed') out.push(price.promotion === 'promotional' ? 'promotional_price' : 'promotion_unknown')
  if (!price.feature_scope) out.push('feature_scope_unknown')
  return out
}
