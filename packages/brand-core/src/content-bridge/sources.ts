import fs from 'node:fs'
import path from 'node:path'
import { readFacts, type CanonicalFact } from '../facts.js'
import { readYaml } from '../fsutil.js'
import type { KnowledgeWorkspace } from '../knowledge/workspace.js'
import { CONTENT_SOURCE_ROLES, type ContentChannel, type ContentSourceRole } from '../strategy/model.js'

/**
 * Which existing interview facts carry which part of a content strategy (Content Bridge Slice A). Ids only: the
 * questions live in content/*-modules.ts and the values in approved-facts.yaml. Personal-brand facts count only when
 * modules.personal.enabled is true. Restricted facts (for example business.marketing.budget) are never listed and are
 * skipped if a fact is classified restricted.
 */
export interface ContentSource {
  id: string
  role: ContentSourceRole
  personal?: true
}

export const CONTENT_SOURCES: readonly ContentSource[] = [
  { id: 'brand.verbal.voice', role: 'voice' },
  { id: 'brand.verbal.voice_pairs', role: 'voice' },
  { id: 'brand.personality.traits', role: 'voice' },
  { id: 'brand.verbal.name_use', role: 'voice' },
  { id: 'personal.content.channel_tone', role: 'voice', personal: true },
  { id: 'brand.verbal.forbidden', role: 'claims' },
  { id: 'business.marketing.availability_claim', role: 'claims' },
  { id: 'personal.governance.public_claim_policy', role: 'claims', personal: true },
  { id: 'business.customer.primary_segment', role: 'audience' },
  { id: 'business.sales.buyer', role: 'audience' },
  { id: 'personal.positioning.primary_audience', role: 'audience', personal: true },
  { id: 'brand.strategy.promise', role: 'messaging' },
  { id: 'brand.strategy.differentiation', role: 'messaging' },
  { id: 'business.offer.value_proposition', role: 'messaging' },
  { id: 'brand.verbal.tagline', role: 'messaging' },
  { id: 'personal.positioning.known_for', role: 'messaging', personal: true },
  { id: 'business.marketing.pillars', role: 'pillars' },
  { id: 'personal.content.pillars', role: 'pillars', personal: true },
  { id: 'business.marketing.channels', role: 'channels' },
  { id: 'brand.social.channels', role: 'channels' },
  { id: 'personal.content.channels', role: 'channels', personal: true },
  { id: 'business.offer.summary', role: 'offers' },
  { id: 'brand.campaign.offer_source', role: 'offers' },
  { id: 'personal.services.offers', role: 'offers', personal: true },
  { id: 'brand.social.cta', role: 'cta' },
  { id: 'personal.consulting.cta', role: 'cta', personal: true },
  { id: 'brand.verbal.localization', role: 'languages' },
  { id: 'brand.social.localization', role: 'languages' },
  { id: 'business.marketing.objective', role: 'objective' },
  { id: 'personal.goals.outcomes', role: 'objective', personal: true },
]

export type SourceState = 'approved' | 'placeholder' | 'missing' | 'restricted'

export interface SourceReport {
  fact_id: string
  role: ContentSourceRole
  state: SourceState
  revision: string | null
}

export interface BrandSettings {
  personal: boolean
  default_locale: string
}

export function brandSettings(ws: KnowledgeWorkspace): BrandSettings {
  try {
    const file = path.join(ws.root, 'brand', 'brand.config.yaml')
    const config = fs.existsSync(file) ? readYaml<{ brand?: { default_locale?: unknown }; modules?: { personal?: { enabled?: unknown } } }>(file) : null
    const locale = config?.brand?.default_locale
    return { personal: config?.modules?.personal?.enabled === true, default_locale: typeof locale === 'string' && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(locale) ? locale : 'en' }
  } catch {
    return { personal: false, default_locale: 'en' }
  }
}

export function activeSources(settings: BrandSettings): ContentSource[] {
  return CONTENT_SOURCES.filter((source) => !source.personal || settings.personal)
}

const PLACEHOLDER_WORD = /\b(?:TBD|TODO|EXAMPLE|PLACEHOLDER|LOREM)\b/i
/** First words that mean "not decided". Compared after lowercasing and trimming punctuation. */
const PLACEHOLDER_HEADS = new Set(['none', 'none yet', 'unknown', 'undecided', 'not decided', 'not yet', 'n/a', 'na', 'نامشخص', 'هیچ', 'ندارد', 'تعیین نشده', 'yok', 'bilinmiyor', 'belirsiz', 'henüz yok'])

/** True when an approved value says the thing is not decided. Such a value is a gap, never a source. */
export function isPlaceholderValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  const textValue = (typeof value === 'string' ? value : JSON.stringify(value)).normalize('NFC').trim()
  if (!textValue) return true
  if (PLACEHOLDER_WORD.test(textValue)) return true
  const words = textValue
    .toLowerCase()
    .split(/[\s.,;:!?،؛—–-]+/u)
    .filter(Boolean)
  return PLACEHOLDER_HEADS.has(words.slice(0, 2).join(' ')) || PLACEHOLDER_HEADS.has(words[0] ?? '')
}

export function sourceState(fact: CanonicalFact | undefined, brandSlug: string): SourceState {
  if (!fact || fact.status !== 'approved' || fact.brand_id !== brandSlug || !fact.revision_hash) return 'missing'
  if (fact.classification === 'restricted') return 'restricted'
  return isPlaceholderValue(fact.value) ? 'placeholder' : 'approved'
}

/** The state of every catalog fact for this brand now. */
export function readSources(ws: KnowledgeWorkspace, settings: BrandSettings = brandSettings(ws), facts: Record<string, CanonicalFact> = readFacts(ws.root, 'approved', ws.brandSlug)): SourceReport[] {
  return activeSources(settings).map((source) => {
    const fact = facts[source.id]
    const state = sourceState(fact, ws.brandSlug)
    return { fact_id: source.id, role: source.role, state, revision: state === 'approved' || state === 'placeholder' ? fact!.revision_hash : null }
  })
}

/** Roles with no usable approved fact: not_approved when none is approved, placeholder when only placeholders are. */
export function roleGaps(reports: SourceReport[]): Array<{ role: ContentSourceRole; reason: 'not_approved' | 'placeholder'; fact_ids: string[] }> {
  const out: Array<{ role: ContentSourceRole; reason: 'not_approved' | 'placeholder'; fact_ids: string[] }> = []
  for (const role of CONTENT_SOURCE_ROLES) {
    const mine = reports.filter((r) => r.role === role && r.state !== 'restricted')
    if (mine.some((r) => r.state === 'approved')) continue
    const placeholders = mine.filter((r) => r.state === 'placeholder')
    out.push(placeholders.length ? { role, reason: 'placeholder', fact_ids: placeholders.map((r) => r.fact_id) } : { role, reason: 'not_approved', fact_ids: mine.map((r) => r.fact_id) })
  }
  return out
}

// ---- reading list-like approved text ---------------------------------------------------------------------

/** Splits an approved list-like value (lines, semicolons, bullets; short comma lists) into items. */
export function splitItems(value: string): string[] {
  let parts = value.split(/\r?\n|[;؛•·|]/u)
  if (parts.length === 1) {
    const commas = value.split(/[,،]/u)
    if (commas.length > 1 && commas.every((part) => part.trim().length <= 40)) parts = commas
  }
  return parts
    .map((part) =>
      part
        .replace(/^\s*(?:[-*–]|\d+[.)])\s*/u, '')
        .trim()
        .replace(/[.。]$/u, '')
        .trim(),
    )
    .filter(Boolean)
}

const CHANNEL_WORDS: Array<[ContentChannel, RegExp]> = [
  ['instagram', /instagram|\binsta\b|اینستاگرام|اینستا/iu],
  ['x', /twitter|\bx\.com\b|\bX\b|توییتر|توئیتر/u],
  ['x', /\btwitter\b/i],
  ['linkedin', /linked\s?in|لینکدین|لینکداین/iu],
  ['facebook', /facebook|فیسبوک|فیس‌بوک/iu],
  ['tiktok', /tik\s?tok|تیک\s?‌?تاک/iu],
  ['youtube', /you\s?tube|یوتیوب|یوتوب/iu],
  ['threads', /\bThreads\b|threads\.net/u],
  ['telegram', /telegram|تلگرام/iu],
  ['pinterest', /pinterest|پینترست/iu],
  ['newsletter', /newsletter|\be-?mail\b|خبرنامه|ایمیل|bülten|e-?posta/iu],
  ['blog', /\bblog|وبلاگ|بلاگ/iu],
  ['podcast', /podcast|پادکست/iu],
  ['website', /\bweb\s?site\b|وب‌?سایت|وبسایت|web sitesi/iu],
]

/** A clause that names a channel the brand does not use, has paused or only might use later. */
const NEGATION = /\b(?:no|not|without|never|don'?t|doesn'?t|isn'?t|aren'?t|except|stopped|paused|later|maybe|değil|yok|hayır|olmadan|asla)\b|(?:^|\s)(?:نه|بدون|هرگز|نمی|نیست|فعلا|فعلاً)/iu

/**
 * Channels an approved text names in an affirmative clause. Clauses are split on sentence punctuation, commas and
 * "but"; any clause with a negation is skipped, so "Instagram, but not TikTok" yields only instagram.
 */
export function detectChannels(value: string): ContentChannel[] {
  const found: ContentChannel[] = []
  for (const clause of value.split(/[.;،؛,\n]|\bbut\b|\bama\b|\bfakat\b|\sولی\s|\sاما\s/iu)) {
    if (!clause.trim() || NEGATION.test(clause)) continue
    for (const [channel, pattern] of CHANNEL_WORDS) if (pattern.test(clause) && !found.includes(channel)) found.push(channel)
  }
  return found
}
