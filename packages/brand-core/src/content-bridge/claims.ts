import type { SourcedRule } from './projection.js'

/**
 * The banned-claim check for calendar text (Content Bridge Slice B). Slot text (hook, angle, notes) is written by the
 * owner or a writer, never by the planner, so it is checked against the approved strategy before a week is stored and
 * again before it is approved:
 *
 * - every banned claim of the served strategy view (`brand.verbal.forbidden` items plus owner-written banned claims):
 *   the phrase appears, or every significant word of it appears (so "Fluency guaranteed" matches "Guaranteed fluency");
 * - the approved availability rule (`business.marketing.availability_claim`): `do-not-claim` refuses any availability
 *   wording, `coming-soon` refuses "available now" wording, `available` refuses nothing.
 *
 * It is a guard, not a judge: a match is refused and the owner rewrites the text. It never edits text.
 */

export interface ClaimConflict {
  /** `banned` (with the banned phrase and its source) or `availability` (with the approved rule value). */
  kind: 'banned' | 'availability'
  rule: string
  source: string
  field: string
}

/** Lowercase, NFKC, no punctuation or zero-width joiners, single spaces, padded so word matches need boundaries. */
export function normalizeClaimText(value: string): string {
  const lower = value
    .normalize('NFKC')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .toLowerCase()
    .replace(/\u200c|\u200d|\u0640/g, '')
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
  return ` ${lower.replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim()} `
}

function words(normalized: string): string[] {
  return normalized.trim().split(' ').filter((word) => [...word].length >= 4)
}

/** True when the banned phrase, or all of its significant words, appear in the text. */
export function containsClaim(textValue: string, banned: string): boolean {
  const t = normalizeClaimText(textValue)
  const b = normalizeClaimText(banned)
  if (b.trim().length < 2) return false
  if (t.includes(b)) return true
  const significant = words(b)
  return significant.length >= 2 && significant.every((word) => t.includes(` ${word} `))
}

/** Availability wording per language. Matched on normalized text with word boundaries. */
const AVAILABLE_NOW = ['available now', 'available today', 'now available', 'out now', 'in stock', 'buy now', 'order now', 'shop now', 'download now', 'هم اکنون در دسترس', 'اکنون در دسترس', 'الان در دسترس', 'موجود است', 'همین حالا بخرید', 'şimdi mevcut', 'şimdi satışta', 'hemen satın al', 'stokta', 'şimdi indir']
/** For `do-not-claim`: any wording that says the product can be had. "Coming soon" or a waitlist does not. */
const ANY_AVAILABILITY = [...AVAILABLE_NOW, 'available', 'launched', 'pre order', 'preorder', 'در دسترس', 'موجود', 'پیش خرید', 'mevcut', 'satışta', 'ön sipariş']

export function availabilityConflict(textValue: string, rule: string | null): string | null {
  if (!rule || rule === 'available') return null
  const t = normalizeClaimText(textValue)
  const list = rule === 'coming-soon' ? AVAILABLE_NOW : ANY_AVAILABILITY
  return list.find((phrase) => t.includes(normalizeClaimText(phrase))) ?? null
}

/** Conflicts of one piece of text with the banned claims and the availability rule. */
export function claimConflicts(field: string, value: string | null, banned: SourcedRule[], availability: string | null): ClaimConflict[] {
  if (!value) return []
  const out: ClaimConflict[] = []
  for (const rule of banned) if (containsClaim(value, rule.text)) out.push({ kind: 'banned', rule: rule.text, source: rule.source, field })
  const hit = availabilityConflict(value, availability)
  if (hit) out.push({ kind: 'availability', rule: availability!, source: 'business.marketing.availability_claim', field })
  return out
}
