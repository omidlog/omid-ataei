import type { SharedCell, SharedCriterion, SharedLandscape, SharedLandscapeRead, SharedPlacement, SharedPositioning, SharedPrice, SharedSource } from '../competitive/share.js'
import { SHARED_CRITERIA, SHARED_LANDSCAPE_SCHEMA } from '../competitive/share.js'
import { parseStructured } from '../structured.js'
import { comparisonDocument, OWN_BRAND_FACTS, type OwnSource } from './competitors.js'
import { ILLUSTRATIVE_BRAND } from './fixtures.js'
import type { DataState, VisualDocument } from './model.js'

/**
 * ILLUSTRATIVE / MOCK DATA. Golden examples for the competitor comparison matrix and price strip renderers.
 *
 * Every competitor, host, label and price below is invented. The hosts use the reserved `.example` suffix, so none of
 * them can name a real business. Never read from or written to a brand repository and never a default answer; every
 * document has `illustrative: true`, which the renderers stamp on every page.
 *
 * `complete`: three reviewed competitors in two currencies, every cell state, an unpriced competitor.
 * `empty`: nothing shared yet (the designed empty state).
 * `no_axes`: the V2.2 landscape without a positioning section (the map's designed empty state).
 *
 * Positioning (V2.3): two invented axes in en/fa/tr; the own brand and two competitors placed (one stale, one with
 * disagreeing sources drawn as a range), one competitor not placed (unknown on one axis).
 */
export type ComparisonFixtureVariant = 'complete' | 'empty' | 'no_axes'

const OWN_VALUES: Record<SharedCriterion, { label: string; value: string | null; state: DataState }> = {
  offer: { label: 'Offer summary', value: 'Guided ten-minute language lessons with a weekly live session', state: 'approved' },
  audience: { label: 'Primary customer segment', value: 'Working adults learning a second language for their job', state: 'approved' },
  geography: { label: 'Target market', value: 'Türkiye and the Gulf, online', state: 'approved' },
  public_price: { label: 'Pricing', value: null, state: 'assumption' },
  public_message: { label: 'Value proposition', value: 'Fluency that fits a working day', state: 'approved' },
  visual_language: { label: 'Color roles', value: 'primary #123A73; onPrimary #FFFFFF; surface #F7F5F2; accent #D5FE00', state: 'approved' },
  observable_channels: { label: 'Marketing channels', value: null, state: 'missing' },
}

function own(): Record<string, OwnSource> {
  const out: Record<string, OwnSource> = {}
  for (const criterion of SHARED_CRITERIA) {
    const spec = OWN_VALUES[criterion]
    const approved = spec.state === 'approved'
    const id = OWN_BRAND_FACTS[criterion]
    out[criterion] = {
      entry: {
        id,
        label: spec.label,
        state: spec.state,
        value: spec.value,
        sources: [`fixture:${id}`],
        version: approved ? 1 : null,
        approved_at: approved ? '2026-10-02T09:00:00.000Z' : null,
        review_due: null,
        note: null,
        missing_reason: spec.state === 'missing' ? 'unanswered' : null,
      },
      structured: criterion === 'visual_language' && spec.value ? parseStructured('color', spec.value) : null,
    }
  }
  return out
}

const OWN_PAGE = (host: string, day: string): SharedSource => ({ source_class: 'competitor_own_page', host, observed_on: day })
const PRESS: SharedSource = { source_class: 'independent_reporting', host: 'trade-weekly.example', observed_on: '2026-10-28' }

function cells(spec: Partial<Record<SharedCriterion, Omit<SharedCell, 'criterion'>>>): SharedCell[] {
  return SHARED_CRITERIA.map((criterion) => ({ criterion, ...(spec[criterion] ?? { state: 'unknown', labels: [], sources: [] }) }))
}

function price(id: string, offer: string, amount: number, currency: string, market: string, extra: Partial<SharedPrice>, source: SharedSource): SharedPrice {
  return {
    competitor_id: id,
    offer_name: offer,
    amount,
    currency,
    market,
    billing_period: 'month',
    billing_commitment: 'monthly',
    tax_inclusion: 'unknown',
    promotion: 'none_observed',
    feature_scope: null,
    rate_label: 'standard_rate',
    state: 'observed',
    source,
    ...extra,
  }
}

const A = 'cmp_00000000-0000-4000-8000-00000000000a'
const B = 'cmp_00000000-0000-4000-8000-00000000000b'
const C = 'cmp_00000000-0000-4000-8000-00000000000c'

export function illustrativeLandscape(): SharedLandscape {
  const avenra = OWN_PAGE('avenra.example', '2026-11-14')
  const kestrel = OWN_PAGE('kestrel-learn.example', '2026-11-18')
  return {
    schema: SHARED_LANDSCAPE_SCHEMA,
    schema_version: 1,
    kind: 'competitive_shared_landscape',
    brand_slug: ILLUSTRATIVE_BRAND.id,
    as_of: '2026-11-18',
    criteria: [...SHARED_CRITERIA],
    competitors: [
      {
        competitor_id: A,
        display_name: 'Avenra (fictional)',
        relationship: ['direct'],
        geographic_relevance: ['international'],
        markets: ['TR', 'US'],
        official_domain: 'avenra.example',
        assessment: 'owner_reviewed',
        cells: cells({
          offer: { state: 'observed', labels: ['Self-paced app, three plans'], sources: [avenra] },
          audience: { state: 'observed', labels: ['Students and travellers'], sources: [avenra] },
          public_price: { state: 'observed', labels: ['Plans listed on own pricing page'], sources: [avenra] },
          public_message: { state: 'conflicting', labels: ['Learn anywhere', 'Exam-focused'], sources: [avenra, PRESS] },
          visual_language: { state: 'observed', labels: ['Orange accent, rounded type'], sources: [avenra] },
          observable_channels: { state: 'unverified', labels: ['Short-video ads'], sources: [PRESS] },
        }),
      },
      {
        competitor_id: B,
        display_name: 'Kestrel Learn (fictional)',
        relationship: ['direct', 'substitute'],
        geographic_relevance: ['regional'],
        markets: ['AE', 'TR'],
        official_domain: 'kestrel-learn.example',
        assessment: 'needs_refresh',
        cells: cells({
          offer: { state: 'observed', labels: ['Live group classes'], sources: [kestrel] },
          geography: { state: 'observed', labels: ['Gulf and Türkiye'], sources: [kestrel] },
          public_price: { state: 'historical', labels: ['Monthly plan, older page'], sources: [OWN_PAGE('kestrel-learn.example', '2026-06-02')] },
          public_message: { state: 'observed', labels: ['Speak in 30 days'], sources: [kestrel] },
          observable_channels: { state: 'needs_review', labels: [], sources: [] },
        }),
      },
      {
        competitor_id: C,
        display_name: 'Moraq Studio (fictional)',
        relationship: ['indirect'],
        geographic_relevance: ['local'],
        markets: ['TR'],
        official_domain: null,
        assessment: 'owner_reviewed',
        cells: cells({
          offer: { state: 'observed', labels: ['One-to-one tutoring'], sources: [PRESS] },
          audience: { state: 'observed', labels: ['Corporate teams'], sources: [PRESS] },
        }),
      },
    ],
    prices: {
      rows: [
        price(B, 'Monthly', 180, 'AED', 'AE', { billing_commitment: 'unknown', promotion: 'unknown', rate_label: 'promotion_unknown', state: 'historical' }, OWN_PAGE('kestrel-learn.example', '2026-06-02')),
        price(A, 'Pro', 249, 'TRY', 'TR', { promotion: 'promotional', rate_label: 'promotional', feature_scope: 'First three months' }, avenra),
        price(A, 'Plus', 9.99, 'USD', 'US', { billing_commitment: 'monthly', tax_inclusion: 'excluded' }, avenra),
        price(A, 'Pro', 7, 'USD', 'US', { billing_commitment: 'annual', rate_label: 'monthly_rate_billed_annually' }, avenra),
      ],
      ranked: false,
      currency_conversion: 'none',
    },
    not_shared: { candidates: 2, disputed: 0, archived: 1 },
    withheld_text: 1,
    authorizes: [],
  }
}

const placed = (state: SharedPlacement['state'], bands: SharedPlacement['bands'], sources: SharedSource[]): SharedPlacement => ({ state, bands, sources })
const NONE: SharedPlacement = { state: 'unknown', bands: [], sources: [] }

/** ILLUSTRATIVE / MOCK DATA: invented axes and placements. Never an axis suggestion for a real brand. */
export function illustrativePositioning(): SharedPositioning {
  const avenra = OWN_PAGE('avenra.example', '2026-11-14')
  const kestrel = OWN_PAGE('kestrel-learn.example', '2026-11-18')
  const owner: SharedSource = { source_class: 'owner_statement', host: null, observed_on: '2026-11-10' }
  return {
    axes: {
      x: { label: { en: 'Guidance', fa: 'میزان راهنمایی', tr: 'Rehberlik' }, low: { en: 'Self-paced', fa: 'خودآموز', tr: 'Kendi hızında' }, high: { en: 'Live teacher', fa: 'معلم زنده', tr: 'Canlı öğretmen' } },
      y: { label: { en: 'Price level', fa: 'سطح قیمت', tr: 'Fiyat düzeyi' }, low: { en: 'Budget', fa: 'اقتصادی', tr: 'Ekonomik' }, high: { en: 'Premium', fa: 'ممتاز', tr: 'Premium' } },
    },
    bands: ['low', 'lower_mid', 'mid', 'upper_mid', 'high'],
    stale_after_days: 90,
    own: { x: placed('evidenced', ['mid'], [owner]), y: placed('evidenced', ['upper_mid'], [owner]) },
    competitors: [
      { competitor_id: A, x: placed('evidenced', ['low'], [avenra]), y: placed('conflicting', ['lower_mid', 'mid'], [avenra, PRESS]) },
      { competitor_id: B, x: placed('evidenced', ['high'], [kestrel]), y: placed('stale', ['high'], [OWN_PAGE('kestrel-learn.example', '2026-06-02')]) },
      { competitor_id: C, x: placed('evidenced', ['high'], [PRESS]), y: NONE },
    ],
  }
}

export function illustrativeCompetitorComparison(variant: ComparisonFixtureVariant = 'complete'): VisualDocument {
  const landscape = illustrativeLandscape()
  if (variant === 'complete') landscape.positioning = illustrativePositioning()
  const read: SharedLandscapeRead = variant === 'empty' ? { state: 'not_shared' } : { state: 'shared', landscape }
  return comparisonDocument({ brand_id: ILLUSTRATIVE_BRAND.id, brand_name: ILLUSTRATIVE_BRAND.name, illustrative: true, read, own: own() })
}
