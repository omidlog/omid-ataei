import { readFacts, type CanonicalFact } from '../facts.js'
import type { KnowledgeWorkspace } from '../knowledge/workspace.js'
import { parseStructured } from '../structured.js'
import { servable } from '../strategy/feed.js'
import { canonicalJson, sha256Hex, sourceDigest, type ContentGap, type ContentSourceRole, type ContentStrategyBlock, type EffectiveStatus, type StrategyContent, type StrategyRef } from '../strategy/model.js'
import { assertOwnerProcess, scanRecords } from '../strategy/store.js'
import { AVAILABILITY_RULES, VIEW_NOTICE, type ContentLang } from './i18n.js'
import { describeGap } from './propose.js'
import { splitItems } from './sources.js'

/**
 * The voice rules projection (Content Bridge Slice A): the owner's read-only view of the approved content strategy.
 *
 * - Only the one approved revision that the Strategy Feed rule would serve (`current` or `review_due`) is shown. A
 *   draft v2 is invisible (counted under `withheld`) until the owner approves it; v1 stays served meanwhile.
 * - Voice, audience, messaging, claims, offers and CTA are the approved facts the strategy cites, resolved now. A
 *   served strategy has every cited fact at its pinned revision (else it is needs_review and not served), so the text
 *   is exactly what the owner approved. Restricted facts are never resolved.
 * - Owner process only in Slice A. Slice C wraps it for agent profiles through the existing gates.
 */

export const CONTENT_VIEW_SCHEMA = 'brand-os/content-strategy-view/v1' as const

export interface ResolvedSource {
  fact_id: string
  revision: string
  value: string
}

export interface SourcedRule {
  text: string
  /** The fact id it came from, or `strategy` for an owner-written rule in the approved revision. */
  source: string
}

export interface ContentStrategyView {
  schema: typeof CONTENT_VIEW_SCHEMA
  kind: 'content_strategy_view'
  brand_id: string
  strategy_id: string
  revision: number
  status: 'current' | 'review_due'
  status_reasons: string[]
  digests: { content_sha256: string; approval_digest: string; source_sha256: string; view_sha256: string }
  approval: { approved_at: string; event_id: string; actor: 'owner' }
  supersedes_revision: number | null
  validity: { valid_from: string; valid_until: string; review_due_at: string }
  languages: string[]
  pillars: ContentStrategyBlock['pillars']
  channels: ContentStrategyBlock['channels']
  voice: { sources: ResolvedSource[]; do: SourcedRule[]; dont: SourcedRule[]; vocabulary: ContentStrategyBlock['vocabulary'] }
  claims: { sources: ResolvedSource[]; banned: SourcedRule[]; availability: string | null; availability_rule: string | null }
  cta: { sources: ResolvedSource[]; rules: SourcedRule[] }
  audience: ResolvedSource[]
  messaging: ResolvedSource[]
  offers: ResolvedSource[]
  objective: ResolvedSource[]
  language_sources: ResolvedSource[]
  strategy_refs: StrategyRef[]
  gaps: Array<ContentGap & { text: string }>
  authorizes: []
  publication_permission: false
  notice: string[]
}

export interface ContentViewResult {
  views: ContentStrategyView[]
  /** Content strategies with nothing served now, counted by status. Never their content. */
  withheld: Record<string, number>
}

function valueText(fact: CanonicalFact): string {
  return typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value)
}

function resolve(facts: Record<string, CanonicalFact>, ids: string[], brandSlug: string): ResolvedSource[] {
  const out: ResolvedSource[] = []
  for (const id of ids) {
    const fact = facts[id]
    if (!fact || fact.status !== 'approved' || fact.brand_id !== brandSlug || !fact.revision_hash || fact.classification === 'restricted') continue
    out.push({ fact_id: id, revision: fact.revision_hash, value: valueText(fact) })
  }
  return out
}

/** Pure given its inputs. */
export function buildView(input: {
  brandId: string
  strategyId: string
  revision: number
  status: 'current' | 'review_due'
  reasons: string[]
  content_sha256: string
  supersedes_revision: number | null
  approval: { approved_at: string; event_id: string; digest: string }
  content: Pick<StrategyContent, 'valid_from' | 'valid_until' | 'review_due_at' | 'fact_refs' | 'evidence_refs' | 'content_strategy'>
  facts: Record<string, CanonicalFact>
  lang: ContentLang
}): ContentStrategyView {
  const block = input.content.content_strategy!
  const pick = (role: ContentSourceRole) => resolve(input.facts, block.sources[role], input.brandId)
  const voice = pick('voice')
  const claims = pick('claims')
  const cta = pick('cta')
  const doRules: SourcedRule[] = []
  const dontRules: SourcedRule[] = []
  for (const source of voice) {
    const parsed = parseStructured('voice_pairs', source.value)
    if (parsed?.type !== 'voice_pairs') continue
    for (const pair of parsed.pairs) {
      doRules.push({ text: pair.do, source: source.fact_id })
      dontRules.push({ text: pair.dont, source: source.fact_id })
    }
  }
  for (const item of block.voice_rules.do) doRules.push({ text: item, source: 'strategy' })
  for (const item of block.voice_rules.dont) dontRules.push({ text: item, source: 'strategy' })
  const banned: SourcedRule[] = []
  let availability: string | null = null
  for (const source of claims) {
    if (source.fact_id === 'business.marketing.availability_claim') {
      availability = source.value
      continue
    }
    if (source.fact_id === 'brand.verbal.forbidden') for (const item of splitItems(source.value)) banned.push({ text: item, source: source.fact_id })
  }
  for (const item of block.banned_claims) banned.push({ text: item, source: 'strategy' })
  const doc: Omit<ContentStrategyView, 'digests'> & { digests: Omit<ContentStrategyView['digests'], 'view_sha256'> } = {
    schema: CONTENT_VIEW_SCHEMA,
    kind: 'content_strategy_view',
    brand_id: input.brandId,
    strategy_id: input.strategyId,
    revision: input.revision,
    status: input.status,
    status_reasons: input.reasons,
    digests: { content_sha256: input.content_sha256, approval_digest: input.approval.digest, source_sha256: sourceDigest(input.content) },
    approval: { approved_at: input.approval.approved_at, event_id: input.approval.event_id, actor: 'owner' },
    supersedes_revision: input.supersedes_revision,
    validity: { valid_from: input.content.valid_from, valid_until: input.content.valid_until, review_due_at: input.content.review_due_at },
    languages: block.languages,
    pillars: block.pillars,
    channels: block.channels,
    voice: { sources: voice, do: doRules, dont: dontRules, vocabulary: block.vocabulary },
    claims: { sources: claims, banned, availability, availability_rule: availability ? (AVAILABILITY_RULES[availability]?.[input.lang] ?? null) : null },
    cta: { sources: cta, rules: block.cta_rules.map((item) => ({ text: item, source: 'strategy' })) },
    audience: pick('audience'),
    messaging: pick('messaging'),
    offers: pick('offers'),
    objective: pick('objective'),
    language_sources: pick('languages'),
    strategy_refs: block.strategy_refs,
    gaps: block.gaps.map((gap) => ({ ...gap, text: describeGap(gap, input.lang) })),
    authorizes: [],
    publication_permission: false,
    notice: VIEW_NOTICE[input.lang],
  }
  return { ...doc, digests: { ...doc.digests, view_sha256: sha256Hex(canonicalJson(doc)) } }
}

/** Every served content strategy of this brand (or one id), as owner views. Drafts are only counted. */
export function contentStrategyView(ws: KnowledgeWorkspace, opts: { lang: ContentLang; strategy_id?: string; now?: Date }): ContentViewResult {
  assertOwnerProcess()
  return servedContentViews(ws, opts)
}

/**
 * The same views without the owner-process check. Callers authorize first: the owner CLI through
 * `contentStrategyView`, agents through the Strategy Feed gate (`content-bridge/agent.ts`).
 */
export function servedContentViews(ws: KnowledgeWorkspace, opts: { lang: ContentLang; strategy_id?: string; now?: Date }): ContentViewResult {
  const now = opts.now ?? ws.now()
  const facts = readFacts(ws.root, 'approved', ws.brandSlug)
  const views: ContentStrategyView[] = []
  const withheld: Record<string, number> = {}
  for (const record of scanRecords(ws)) {
    if (record.type !== 'content' || (opts.strategy_id && record.strategy_id !== opts.strategy_id)) continue
    const found = servable(ws, record, now)
    const drafts = record.revisions.filter((item) => item.state === 'draft').length
    if (drafts) withheld.draft = (withheld.draft ?? 0) + drafts
    if (!found.entry || !found.result?.revision || !found.entry.approval || !found.result.revision.content.content_strategy) {
      const status: EffectiveStatus = found.status
      if (status !== 'draft') withheld[status] = (withheld[status] ?? 0) + 1
      continue
    }
    const revision = found.result.revision
    views.push(
      buildView({
        brandId: ws.brandSlug,
        strategyId: record.strategy_id,
        revision: revision.revision,
        status: found.result.status as 'current' | 'review_due',
        reasons: found.result.reasons,
        content_sha256: found.entry.content_sha256,
        supersedes_revision: revision.supersedes_revision,
        approval: found.entry.approval,
        content: revision.content,
        facts,
        lang: opts.lang,
      }),
    )
  }
  return { views, withheld }
}
