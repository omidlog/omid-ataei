import { DIMENSION_LABELS, fill } from './i18n.js'
import { MEMO_HEADINGS, MEMO_TITLES, SEO_NAME_STATUS } from './memo-i18n.js'
import type { CompetitiveMemo, PricingRow } from './memos.js'

/**
 * Plain-text rendering of a Slice C draft in the draft's language. Quotes are never printed (the draft holds none);
 * every observation shows its cited ref. State values and codes stay stable English tokens.
 */

const RATE_TERMS: Record<PricingRow['rate_label'], string> = {
  standard_rate: 'standard_rate',
  promotional: 'PROMOTIONAL',
  promotion_unknown: 'promotion_unknown',
  monthly_rate_billed_annually: 'monthly_rate_billed_annually',
  terms_unknown: 'terms_unknown',
}

export function renderMemo(memo: CompetitiveMemo): string {
  const lang = memo.lang
  const h = (key: string, vars: Record<string, string> = {}) => fill(MEMO_HEADINGS[key]![lang], vars)
  const dim = (d: keyof typeof DIMENSION_LABELS) => DIMENSION_LABELS[d][lang]
  const lines: string[] = [`${MEMO_TITLES[memo.kind]![lang]} — ${memo.brand_slug}${memo.market ? ` (${memo.market})` : ''}`, h('preamble', { state: memo.context.state }), '']

  lines.push(h('owner_inputs'), ...memo.owner_inputs.map((f) => `  - ${f.fact_id}: ${f.state === 'approved' ? `${h('approved')} @${f.revision}` : h('missing')}`), '')

  if (memo.kind === 'visual_landscape_assessment') {
    lines.push(h('visual', { state: memo.visual_comparison }), h('intake', { logo: memo.intake.choice.logo_presence, intent: memo.intake.choice.identity_intent }), '')
  }
  if (memo.kind === 'seo_competitor_supplement') {
    lines.push(h('owner_named'))
    for (const n of memo.owner_named) lines.push(`  - ${n.name}: ${n.status}; ${n.competitor_id ? fill(SEO_NAME_STATUS.matched_candidate![lang], { id: n.competitor_id }) : SEO_NAME_STATUS.not_in_index![lang]}`)
    lines.push(h('search_evidence', { rankings: memo.search_evidence.rankings, gaps: memo.search_evidence.keyword_gaps }), '')
  }
  if (memo.kind === 'pricing_benchmark_memo') {
    lines.push(h('price_table', { state: memo.prices.comparison, reason: memo.prices.reasons.length ? ` — ${memo.prices.reasons.join(', ')}` : '' }))
    for (const r of memo.prices.rows) {
      lines.push(`  - ${r.competitor_name} ${r.offer_name}: ${r.amount} ${r.currency} [${RATE_TERMS[r.rate_label]}; period ${r.billing_period}; commitment ${r.billing_commitment}; tax ${r.tax_inclusion}] ${r.market}, ${r.observed_at.slice(0, 10)}, ${r.status} ${r.ref}`)
    }
    lines.push('')
  }

  if (memo.observations.length) {
    lines.push(h('observations'))
    for (const o of memo.observations) lines.push(`  - ${o.competitor_name} · ${dim(o.dimension)} · ${o.statement_kind}: ${o.label} — ${o.cell}, ${o.source_class ?? '?'}, ${o.observed_at.slice(0, 10)} ${o.ref} ${o.claim_key}`)
    lines.push('')
  }
  if (memo.unresolved.length) {
    lines.push(h('unresolved'), ...memo.unresolved.map((u) => `  - ${u.competitor_name} · ${dim(u.dimension)}: ${u.cell} (${u.ref_state}) ${u.ref}`), '')
  }
  if (memo.warnings.length) lines.push(h('warnings'), ...memo.warnings.map((w) => `  ! ${w.text}`), '')
  if (memo.alternatives.length) {
    lines.push(h('alternatives'))
    for (const a of memo.alternatives) {
      lines.push(`  - [${a.id}] ${a.title}`, `      ${h('trade_off')}: ${a.trade_off}`)
      if (a.depends_on.length) lines.push(`      ${h('depends_on')}: ${a.depends_on.join(', ')}`)
    }
    lines.push('')
  }
  lines.push(h('not_known'), ...memo.not_known.map((n) => `  - ${n.text}`), '')
  if (memo.next_research.length) lines.push(h('next_research'), ...memo.next_research.map((s) => `  - ${s.text}`), '')
  lines.push(h('proposed_edits'), ...memo.proposed_edits.map((e) => `  - ${e.text}`), '')
  lines.push(h('never'), ...memo.prohibited_inferences.map((p) => `  - ${p.text}`))
  if (memo.source_refs.length) lines.push('', h('sources'), ...memo.source_refs.map((ref) => `  - ${ref}`))
  return lines.join('\n')
}
