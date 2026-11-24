import crypto from 'node:crypto'
import type { KnowledgeWorkspace } from '@brand-os/brand-core'
import { recordSource, validateSource, type Excerpt, type ResearchSource, type SourceType } from '@brand-os/brand-core/research'

/**
 * Fictional competitor sources for tests. Names, domains, prices and quotes are invented fixtures, not observations of
 * real businesses. They are recorded through the real research store, so they are ordinary Knowledge research notes.
 */

export const NOW = new Date('2026-11-22T10:00:00Z')

export const PRICE_QUOTE = 'Pro: 12 USD per month, billed annually. Taxes not included.'
export const PROMO_QUOTE = 'Launch offer: Pro for 6 USD per month for the first year, 50% off.'
export const MESSAGE_QUOTE = 'WordFlight helps you learn a language in five minutes a day.'
export const VISUAL_QUOTE = 'Our new logo is a paper plane in bright orange.'

export function source(opts: { url: string; publisher?: string; excerpts: Array<Partial<Excerpt> & { claim_key: string; quote: string }>; retrieved_at?: Date; verified?: boolean; source_type?: SourceType; topic?: ResearchSource['topic']; bytes?: string }): ResearchSource {
  return validateSource({
    url: opts.url,
    final_url: opts.url,
    publisher: opts.publisher ?? new URL(opts.url).hostname,
    title: null,
    source_type: opts.source_type ?? 'observational',
    topic: opts.topic ?? 'market_observation',
    language: 'en',
    retrieved_at: (opts.retrieved_at ?? NOW).toISOString(),
    page_last_updated: null,
    published_at: null,
    tool: 'test fixture',
    adapter: 'replay',
    query: null,
    content_sha256: opts.verified === false ? null : crypto.createHash('sha256').update(opts.bytes ?? opts.url + JSON.stringify(opts.excerpts)).digest('hex'),
    quotes_verified: opts.verified !== false,
    excerpts: opts.excerpts.map((item) => ({ claim: item.claim ?? `Fixture claim ${item.claim_key}`, stance: item.stance ?? 'supports', claim_key: item.claim_key, quote: item.quote })),
  })
}

export function record(ws: KnowledgeWorkspace, src: ResearchSource): { note_id: string; revision: string; provenance: string } {
  const out = recordSource(ws, src)
  return { note_id: out.note_id, revision: out.revision, provenance: out.provenance }
}

/** WordFlight's own pricing page and its home page, both fictional. */
export function wordflightSources(ws: KnowledgeWorkspace, at: Date = NOW) {
  const pricing = record(ws, source({ url: 'https://wordflight-app.com/pricing', excerpts: [{ claim_key: 'wordflight.pricing.pro', quote: PRICE_QUOTE }], retrieved_at: at }))
  const home = record(
    ws,
    source({
      url: 'https://www.wordflight-app.com/',
      excerpts: [
        { claim_key: 'wordflight.message.five_minutes', quote: MESSAGE_QUOTE },
        { claim_key: 'wordflight.visual.paper_plane', quote: VISUAL_QUOTE },
      ],
      retrieved_at: at,
    }),
  )
  return { pricing, home }
}
