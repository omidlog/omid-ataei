import {
  htmlToText,
  normalizeForQuote,
  RESEARCH_LIMITS,
  ResearchError,
  sha256,
  validateExcerpt,
  validateSource,
  validateUrl,
  type AdapterCapability,
  type Excerpt,
  type ResearchSource,
  type ResearchTopic,
  type SourceTier,
  type SourceType,
} from './model.js'

/**
 * Research adapters. Every adapter answers the same contract: a capability check that says whether research is
 * possible right now (and why not), and a retrieval that returns a fully provenanced source or a typed failure.
 * No adapter ever returns a source it did not fetch or replay, and none invents a date.
 */

export interface RetrieveRequest {
  url: string
  publisher: string
  source_type: SourceType
  tier?: SourceTier
  topic: ResearchTopic
  language?: string | null
  query?: string | null
  excerpts: Excerpt[]
}

export type RetrieveOutcome =
  | { ok: true; source: ResearchSource }
  | { ok: false; state: 'research_unavailable' | 'fetch_failed' | 'quote_not_found' | 'not_recorded'; url: string; reason: string }

export interface ResearchAdapter {
  readonly id: string
  capability(now?: Date): AdapterCapability
  retrieve(request: RetrieveRequest, now?: Date): Promise<RetrieveOutcome>
}

export const NETWORK_ENV = 'BRAND_OS_RESEARCH_NETWORK'

export const UNAVAILABLE_REASON = `No research adapter is available: live retrieval is off (set ${NETWORK_ENV}=on to allow it) and no recorded research bundle was given.`

/** The honest default. It never retrieves anything. */
export function unavailableAdapter(reason: string = UNAVAILABLE_REASON): ResearchAdapter {
  return {
    id: 'none',
    capability: (now = new Date()) => ({ adapter: 'none', state: 'unavailable', mode: 'none', network: false, reason, checked_at: now.toISOString() }),
    retrieve: async (request) => ({ ok: false, state: 'research_unavailable', url: request.url, reason }),
  }
}

export type FetchLike = (url: string, init: { signal: AbortSignal; redirect: 'follow'; headers: Record<string, string> }) => Promise<{
  ok: boolean
  status: number
  url: string
  headers: { get(name: string): string | null }
  arrayBuffer(): Promise<ArrayBuffer>
}>

/** "Last updated 2025-12-10 UTC." as the page states it. */
function pageLastUpdated(text: string): string | null {
  const match = /Last updated:?\s+(\d{4}-\d{2}-\d{2}(?:\s+UTC)?)/i.exec(text)
  return match ? `Last updated ${match[1]}` : null
}

function pageTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (!match) return null
  const title = normalizeForQuote(htmlToText(match[1]!))
  return title ? title.slice(0, RESEARCH_LIMITS.maxTitleChars) : null
}

/**
 * Live retrieval over HTTPS, opt-in. It fetches the page, hashes the bytes, and checks that every requested quote
 * is really on the page. A quote that is not found refuses the whole source: nothing unverified is recorded as
 * observed. The page text is used only for that check and is never stored or followed.
 */
export function liveAdapter(opts: { fetchImpl?: FetchLike; enabled?: boolean; tool?: string } = {}): ResearchAdapter {
  const enabled = opts.enabled ?? process.env[NETWORK_ENV] === 'on'
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  const tool = opts.tool ?? 'brand-os live https fetch'
  return {
    id: 'live',
    capability: (now = new Date()) =>
      enabled
        ? { adapter: 'live', state: 'available', mode: 'live', network: true, reason: null, checked_at: now.toISOString() }
        : { adapter: 'live', state: 'unavailable', mode: 'none', network: false, reason: `Live retrieval is off. Set ${NETWORK_ENV}=on to allow HTTPS fetches.`, checked_at: now.toISOString() },
    async retrieve(request, now = new Date()) {
      const url = validateUrl(request.url)
      if (!enabled) return { ok: false, state: 'research_unavailable', url, reason: `Live retrieval is off. Set ${NETWORK_ENV}=on to allow HTTPS fetches.` }
      const excerpts = request.excerpts.map(validateExcerpt)
      let bytes: Buffer
      let finalUrl: string
      let contentType: string
      try {
        // Without accept-language some documentation hosts serve a random locale, and every quote would fail.
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(RESEARCH_LIMITS.fetchTimeoutMs), redirect: 'follow', headers: { accept: 'text/html,text/plain', 'accept-language': request.language ?? 'en' } })
        if (!response.ok) return { ok: false, state: 'fetch_failed', url, reason: `HTTP ${response.status}` }
        finalUrl = validateUrl(response.url || url, 'final_url')
        contentType = response.headers.get('content-type') ?? ''
        if (!/^text\/(html|plain)\b/i.test(contentType)) return { ok: false, state: 'fetch_failed', url, reason: `Unsupported content type ${contentType.slice(0, 60) || 'none'}.` }
        const declared = Number(response.headers.get('content-length') ?? '0')
        if (declared > RESEARCH_LIMITS.maxPageBytes) return { ok: false, state: 'fetch_failed', url, reason: 'The page is larger than the research limit.' }
        bytes = Buffer.from(await response.arrayBuffer())
        if (bytes.length > RESEARCH_LIMITS.maxPageBytes) return { ok: false, state: 'fetch_failed', url, reason: 'The page is larger than the research limit.' }
      } catch (error) {
        if (error instanceof ResearchError) return { ok: false, state: 'fetch_failed', url, reason: error.message }
        return { ok: false, state: 'fetch_failed', url, reason: error instanceof Error ? error.name : 'fetch error' }
      }
      const html = bytes.toString('utf8')
      const text = /html/i.test(contentType) ? htmlToText(html) : html
      const haystack = normalizeForQuote(text)
      const missing = excerpts.filter((excerpt) => !haystack.includes(normalizeForQuote(excerpt.quote)))
      if (missing.length) return { ok: false, state: 'quote_not_found', url, reason: `${missing.length} quote(s) are not on the fetched page (${missing.map((item) => item.claim_key).join(', ')}). Nothing was recorded.` }
      const source = validateSource({
        url,
        final_url: finalUrl,
        publisher: request.publisher,
        title: /html/i.test(contentType) ? pageTitle(html) : null,
        source_type: request.source_type,
        tier: request.tier,
        topic: request.topic,
        language: request.language ?? null,
        retrieved_at: now.toISOString(),
        page_last_updated: pageLastUpdated(normalizeForQuote(text)),
        published_at: null,
        tool,
        adapter: 'live',
        query: request.query ?? null,
        content_sha256: sha256(bytes),
        quotes_verified: true,
        excerpts,
      })
      return { ok: true, source }
    },
  }
}

export const BUNDLE_SCHEMA = 'brand-os.research-bundle/1'

export interface ResearchBundle {
  schema: typeof BUNDLE_SCHEMA
  /** Who or what recorded the bundle, and when. Replays keep the original retrieval dates. */
  recorded_with: string
  recorded_at: string
  note: string | null
  sources: ResearchSource[]
}

export function parseBundle(raw: unknown): ResearchBundle {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ResearchError('invalid_bundle', 'A research bundle must be a JSON object.')
  const doc = raw as Record<string, unknown>
  if (doc.schema !== BUNDLE_SCHEMA) throw new ResearchError('invalid_bundle', `A research bundle needs "schema": "${BUNDLE_SCHEMA}".`)
  if (typeof doc.recorded_with !== 'string' || !doc.recorded_with.trim() || doc.recorded_with.length > 160) throw new ResearchError('invalid_bundle', 'recorded_with must name the recording tool.')
  if (typeof doc.recorded_at !== 'string' || Number.isNaN(Date.parse(doc.recorded_at))) throw new ResearchError('invalid_bundle', 'recorded_at must be an ISO date.')
  if (!Array.isArray(doc.sources) || doc.sources.length === 0 || doc.sources.length > 100) throw new ResearchError('invalid_bundle', 'sources must list 1 to 100 recorded sources.')
  const sources = doc.sources.map((item, index) => {
    try {
      return validateSource(item)
    } catch (error) {
      throw new ResearchError('invalid_bundle', `sources[${index}]: ${error instanceof Error ? error.message : 'invalid'}`)
    }
  })
  for (const source of sources) {
    if (Date.parse(source.retrieved_at) > Date.parse(doc.recorded_at)) throw new ResearchError('invalid_bundle', `${source.url} claims a retrieval after the bundle was recorded.`)
  }
  return { schema: BUNDLE_SCHEMA, recorded_with: doc.recorded_with.trim(), recorded_at: new Date(doc.recorded_at).toISOString(), note: typeof doc.note === 'string' ? doc.note.slice(0, 500) : null, sources }
}

/**
 * Replays sources recorded earlier (by the live adapter or by hand). It never touches the network. Each replayed
 * source keeps its original `retrieved_at`, so staleness is judged against when the page was really read, and its
 * `adapter` says `replay` so nobody mistakes it for a fresh fetch.
 */
export function replayAdapter(bundle: ResearchBundle): ResearchAdapter {
  return {
    id: 'replay',
    capability: (now = new Date()) => ({ adapter: 'replay', state: 'available', mode: 'replay', network: false, reason: `Replaying ${bundle.sources.length} source(s) recorded ${bundle.recorded_at.slice(0, 10)} with ${bundle.recorded_with}.`, checked_at: now.toISOString() }),
    async retrieve(request) {
      const url = validateUrl(request.url)
      const source = bundle.sources.find((item) => item.url === url)
      if (!source) return { ok: false, state: 'not_recorded', url, reason: 'This URL is not in the recorded bundle. Nothing is invented for it.' }
      return { ok: true, source: { ...source, adapter: 'replay', tool: source.tool } }
    },
  }
}

/** Replays every source of a bundle in order. */
export async function replayAll(bundle: ResearchBundle, now?: Date): Promise<RetrieveOutcome[]> {
  const adapter = replayAdapter(bundle)
  const out: RetrieveOutcome[] = []
  for (const source of bundle.sources) {
    out.push(await adapter.retrieve({ url: source.url, publisher: source.publisher, source_type: source.source_type, tier: source.tier, topic: source.topic, excerpts: source.excerpts }, now))
  }
  return out
}

/** The adapter for this run: a recorded bundle when given, else live when opted in, else unavailable. */
export function selectAdapter(opts: { bundle?: ResearchBundle | null; env?: NodeJS.ProcessEnv; fetchImpl?: FetchLike } = {}): ResearchAdapter {
  if (opts.bundle) return replayAdapter(opts.bundle)
  const env = opts.env ?? process.env
  if (env[NETWORK_ENV] === 'on') return liveAdapter({ enabled: true, fetchImpl: opts.fetchImpl })
  return unavailableAdapter()
}

/** A capture request file: `{ "requests": [RetrieveRequest…] }`. Quotes are what the recorder expects to find. */
export function parseRequests(raw: unknown): RetrieveRequest[] {
  const list = (raw as { requests?: unknown } | null)?.requests
  if (!Array.isArray(list) || list.length === 0 || list.length > 100) throw new ResearchError('invalid_input', 'A request file needs "requests": a list of 1 to 100 sources to retrieve.')
  return list.map((item, index) => {
    if (!item || typeof item !== 'object') throw new ResearchError('invalid_input', `requests[${index}] must be an object.`)
    const req = item as Record<string, unknown>
    if (!Array.isArray(req.excerpts) || req.excerpts.length === 0) throw new ResearchError('invalid_input', `requests[${index}] needs excerpts to verify.`)
    return {
      url: validateUrl(req.url),
      publisher: String(req.publisher ?? ''),
      source_type: req.source_type as SourceType,
      tier: req.tier as SourceTier | undefined,
      topic: req.topic as ResearchTopic,
      language: typeof req.language === 'string' ? req.language : null,
      query: typeof req.query === 'string' ? req.query : null,
      excerpts: req.excerpts.map(validateExcerpt),
    }
  })
}

/** Retrieves each request with one adapter. Failures stay failures; nothing is filled in. */
export async function retrieveAll(adapter: ResearchAdapter, requests: RetrieveRequest[], now?: Date): Promise<RetrieveOutcome[]> {
  const out: RetrieveOutcome[] = []
  for (const request of requests) out.push(await adapter.retrieve(request, now))
  return out
}

/** A bundle of successfully retrieved sources, for replay in tests or offline sessions. */
export function toBundle(sources: ResearchSource[], recordedWith: string, now: Date, note: string | null = null): ResearchBundle {
  return parseBundle({ schema: BUNDLE_SCHEMA, recorded_with: recordedWith, recorded_at: now.toISOString(), note, sources })
}
