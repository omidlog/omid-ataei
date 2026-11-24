import crypto from 'node:crypto'

/**
 * Research evidence: the capability contract every research adapter answers, and the record of one retrieved
 * source.
 *
 * Raw research lives only in the Knowledge Inbox: one `kind: research` note per retrieved source, whose body holds
 * the provenance block below. Nothing here is a second note store or index. A strategy cites a source as
 * `knowledge:kn_…@<sha256>`; trust and staleness are computed when the note is read, never stored.
 *
 * A source states what a platform or author SAYS. It is never measured evidence that a tactic works for this brand.
 */

export const RESEARCH_SCHEMA_VERSION = 1
export const RESEARCH_BLOCK = 'research-record'
export const RESEARCH_TAG = 'research-source'

/** Spec §5.1 evidence kinds. */
export const SOURCE_TYPES = ['official_policy', 'official_product_docs', 'study', 'observational', 'expert_opinion', 'first_party_data', 'owner_testimony'] as const
export const SOURCE_TIERS = ['primary', 'secondary'] as const
export const STANCES = ['supports', 'contradicts', 'context'] as const
/** Topic classes with their own staleness rule (spec §5.1: configurable by topic, no universal TTL). */
export const RESEARCH_TOPICS = ['search_platform_guidance', 'ai_search_features', 'crawler_controls', 'international_search', 'app_store_guidance', 'market_observation'] as const

export type SourceType = (typeof SOURCE_TYPES)[number]
export type SourceTier = (typeof SOURCE_TIERS)[number]
export type Stance = (typeof STANCES)[number]
export type ResearchTopic = (typeof RESEARCH_TOPICS)[number]

export const RESEARCH_LIMITS = {
  maxQuoteChars: 500,
  maxClaimChars: 200,
  maxExcerpts: 8,
  maxUrlChars: 200,
  maxTitleChars: 160,
  maxPublisherChars: 80,
  maxPageBytes: 3 * 1024 * 1024,
  fetchTimeoutMs: 15_000,
} as const

/** Default maximum age per topic, in days. Fast-moving AI search guidance ages fastest. */
export const DEFAULT_STALENESS_DAYS: Record<ResearchTopic, number> = {
  search_platform_guidance: 180,
  ai_search_features: 60,
  crawler_controls: 90,
  international_search: 365,
  app_store_guidance: 180,
  market_observation: 90,
}

/**
 * Hosts whose pages may be labelled official. A blog cannot be labelled official_policy by accident: the label is
 * refused unless the URL is on the platform's own documentation host.
 */
export const OFFICIAL_HOSTS: Record<string, string> = {
  'developers.google.com': 'Google',
  'support.google.com': 'Google',
  'search.google.com': 'Google',
  'developer.apple.com': 'Apple',
  'developers.openai.com': 'OpenAI',
  'platform.openai.com': 'OpenAI',
  'www.bing.com': 'Microsoft',
  'learn.microsoft.com': 'Microsoft',
}

/** Claim keys are dotted lowercase ids: `google.ai_features.no_special_markup`. */
export const CLAIM_KEY = /^[a-z0-9_]+(?:\.[a-z0-9_]+){1,5}$/

export class ResearchError extends Error {
  constructor(
    readonly code: 'research_unavailable' | 'fetch_failed' | 'quote_not_found' | 'invalid_input' | 'invalid_bundle' | 'refused' | 'not_found',
    message: string,
  ) {
    super(message)
    this.name = 'ResearchError'
  }
}

/** What an adapter can do right now. `unavailable` always carries a reason a person can act on. */
export interface AdapterCapability {
  adapter: string
  state: 'available' | 'unavailable'
  /** `live`: fetches over the network now. `replay`: returns sources recorded earlier, with their original dates. */
  mode: 'live' | 'replay' | 'none'
  network: boolean
  reason: string | null
  checked_at: string
}

export interface Excerpt {
  claim_key: string
  /** A short label of what the quote says, written by whoever recorded it. Not a quote. */
  claim: string
  stance: Stance
  /** Verbatim text from the page. */
  quote: string
}

/** One retrieved source, exactly as recorded. This is the provenance block stored in the research note. */
export interface ResearchSource {
  schema_version: number
  url: string
  final_url: string
  publisher: string
  title: string | null
  source_type: SourceType
  tier: SourceTier
  topic: ResearchTopic
  language: string | null
  /** When the page was fetched. For a replayed bundle this is the original fetch time, never the replay time. */
  retrieved_at: string
  /** A date the page itself states ("Last updated …"), verbatim, or null. Never guessed. */
  page_last_updated: string | null
  published_at: string | null
  /** The tool that fetched the bytes, and the adapter that delivered them here. */
  tool: string
  adapter: string
  query: string | null
  /** sha256 of the fetched bytes: the revision of the source itself. Null only when the recorder had no bytes. */
  content_sha256: string | null
  /** True when every quote was checked against the fetched text by the adapter that fetched it. */
  quotes_verified: boolean
  excerpts: Excerpt[]
}

export interface TrustAssessment {
  level: 'high' | 'medium' | 'low'
  /** What the source can support: what a platform says, a measured effect, or a hypothesis. */
  supports: 'platform_statement' | 'measured_effect' | 'hypothesis' | 'brand_specific'
  reason: string
}

export interface Staleness {
  state: 'fresh' | 'stale'
  age_days: number
  max_age_days: number
  topic: ResearchTopic
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T
  throw new ResearchError('invalid_input', `${field} must be one of ${allowed.join(', ')}.`)
}

function bounded(value: unknown, max: number, field: string, required = true): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ResearchError('invalid_input', `${field} is required.`)
    return null
  }
  if (typeof value !== 'string') throw new ResearchError('invalid_input', `${field} must be text.`)
  const clean = value.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!clean && required) throw new ResearchError('invalid_input', `${field} is required.`)
  if (clean.length > max) throw new ResearchError('invalid_input', `${field} is longer than ${max} characters. Store a bounded excerpt, not the article.`)
  return clean || null
}

function isoDate(value: unknown, field: string, required: boolean): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ResearchError('invalid_input', `${field} is required.`)
    return null
  }
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new ResearchError('invalid_input', `${field} must be an ISO date.`)
  return new Date(value).toISOString()
}

export function validateUrl(value: unknown, field = 'url'): string {
  if (typeof value !== 'string' || value.length > RESEARCH_LIMITS.maxUrlChars) throw new ResearchError('invalid_input', `${field} must be an https URL of at most ${RESEARCH_LIMITS.maxUrlChars} characters.`)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ResearchError('invalid_input', `${field} is not a URL.`)
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw new ResearchError('invalid_input', `${field} must be https without credentials.`)
  return url.toString()
}

export function hostOf(url: string): string {
  return new URL(url).hostname.toLowerCase()
}

export function validateExcerpt(raw: unknown): Excerpt {
  if (!raw || typeof raw !== 'object') throw new ResearchError('invalid_input', 'An excerpt must be an object.')
  const item = raw as Record<string, unknown>
  if (typeof item.claim_key !== 'string' || !CLAIM_KEY.test(item.claim_key)) throw new ResearchError('invalid_input', 'claim_key must be a dotted id such as google.ai_features.no_special_markup.')
  return {
    claim_key: item.claim_key,
    claim: bounded(item.claim, RESEARCH_LIMITS.maxClaimChars, 'claim')!,
    stance: oneOf(item.stance ?? 'supports', STANCES, 'stance'),
    quote: bounded(item.quote, RESEARCH_LIMITS.maxQuoteChars, 'quote')!,
  }
}

/** Strict validation of a source record. Official labels need an official host; official sources are primary. */
export function validateSource(raw: unknown): ResearchSource {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ResearchError('invalid_input', 'A research source must be an object.')
  const item = raw as Record<string, unknown>
  const url = validateUrl(item.url)
  const finalUrl = validateUrl(item.final_url ?? item.url, 'final_url')
  const sourceType = oneOf(item.source_type, SOURCE_TYPES, 'source_type')
  const tier = oneOf(item.tier ?? (sourceType.startsWith('official_') ? 'primary' : 'secondary'), SOURCE_TIERS, 'tier')
  if (sourceType.startsWith('official_')) {
    const host = hostOf(finalUrl)
    if (!OFFICIAL_HOSTS[host]) throw new ResearchError('refused', `${host} is not a recognised official documentation host. Label it expert_opinion, observational or study instead.`)
    if (tier !== 'primary') throw new ResearchError('invalid_input', 'Official documentation about its own platform is a primary source.')
  }
  const excerpts = Array.isArray(item.excerpts) ? item.excerpts.map(validateExcerpt) : []
  if (excerpts.length === 0) throw new ResearchError('invalid_input', 'A source needs at least one excerpt (a verbatim quote with a claim key).')
  if (excerpts.length > RESEARCH_LIMITS.maxExcerpts) throw new ResearchError('invalid_input', `At most ${RESEARCH_LIMITS.maxExcerpts} excerpts per source.`)
  const sha = item.content_sha256
  if (sha !== null && sha !== undefined && (typeof sha !== 'string' || !/^[0-9a-f]{64}$/.test(sha))) throw new ResearchError('invalid_input', 'content_sha256 must be a sha256 hex digest or null.')
  const language = item.language === undefined || item.language === null ? null : String(item.language)
  if (language !== null && !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(language)) throw new ResearchError('invalid_input', 'language must be a code such as en.')
  return {
    schema_version: RESEARCH_SCHEMA_VERSION,
    url,
    final_url: finalUrl,
    publisher: bounded(item.publisher, RESEARCH_LIMITS.maxPublisherChars, 'publisher')!,
    title: bounded(item.title, RESEARCH_LIMITS.maxTitleChars, 'title', false),
    source_type: sourceType,
    tier,
    topic: oneOf(item.topic, RESEARCH_TOPICS, 'topic'),
    language,
    retrieved_at: isoDate(item.retrieved_at, 'retrieved_at', true)!,
    page_last_updated: bounded(item.page_last_updated, 80, 'page_last_updated', false),
    published_at: isoDate(item.published_at, 'published_at', false),
    tool: bounded(item.tool, 120, 'tool')!,
    adapter: bounded(item.adapter, 60, 'adapter')!,
    query: bounded(item.query, 200, 'query', false),
    content_sha256: typeof sha === 'string' ? sha : null,
    quotes_verified: item.quotes_verified === true,
    excerpts,
  }
}

/**
 * How far a source can be trusted, and for what. Official docs are high trust for what the platform says, not for
 * whether a tactic works. Opinions and observations are hypotheses, never policy.
 */
export function trustOf(source: Pick<ResearchSource, 'source_type' | 'tier' | 'quotes_verified' | 'content_sha256'>): TrustAssessment {
  const unverified = !source.quotes_verified || !source.content_sha256
  const cap = (level: TrustAssessment['level']): TrustAssessment['level'] => (unverified && level === 'high' ? 'medium' : level)
  const suffix = unverified ? ' Quotes were not checked against fetched bytes, so trust is capped at medium.' : ''
  switch (source.source_type) {
    case 'official_policy':
    case 'official_product_docs':
      return { level: cap('high'), supports: 'platform_statement', reason: `The platform's own published documentation: it states what the platform says, not a measured effect.${suffix}` }
    case 'study':
      return { level: 'medium', supports: 'measured_effect', reason: `A study: check its method and date; it is not platform policy.${suffix}` }
    case 'first_party_data':
      return { level: cap('high'), supports: 'brand_specific', reason: `This brand's own data: relevant to this brand only.${suffix}` }
    case 'owner_testimony':
      return { level: 'medium', supports: 'brand_specific', reason: `The owner's statement: their word, not independently verified.${suffix}` }
    default:
      return { level: 'low', supports: 'hypothesis', reason: `${source.tier === 'secondary' ? 'A secondary source' : 'An opinion or observation'}: a hypothesis to test, never platform policy.${suffix}` }
  }
}

export function stalenessOf(source: Pick<ResearchSource, 'retrieved_at' | 'topic'>, now: Date, overrides: Partial<Record<ResearchTopic, number>> = {}): Staleness {
  const max = overrides[source.topic] ?? DEFAULT_STALENESS_DAYS[source.topic]
  const age = Math.max(0, Math.floor((now.getTime() - Date.parse(source.retrieved_at)) / 86_400_000))
  return { state: age > max ? 'stale' : 'fresh', age_days: age, max_age_days: max, topic: source.topic }
}

/**
 * Normalises page text and quotes for comparison: NFKC, curly quotes and dashes to ASCII, whitespace collapsed,
 * no space before punctuation (tag stripping leaves "Google ." where the page shows "Google.").
 */
export function normalizeForQuote(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?)])/g, '$1')
    .replace(/([(])\s+/g, '$1')
    .trim()
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…' }

/** Visible text of an HTML page. Scripts and styles are dropped; the page is data, never instructions. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity: string) => {
      if (entity[0] === '#') {
        const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' '
      }
      return ENTITIES[entity.toLowerCase()] ?? match
    })
}

export function sha256(bytes: Buffer | string): string {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}
