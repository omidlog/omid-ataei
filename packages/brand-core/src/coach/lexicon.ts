import type { Locale } from '../i18n.js'
import { asciiDigits } from '../structured.js'
import type { FieldQuestion } from '../types.js'

/**
 * The coach's own lexicon. Every term here is the coach's word, not the owner's: a finding may name the
 * term it matched, because that text comes from this file and never from the answer. The owner's wording
 * is never quoted, so a canary planted in an answer cannot appear in a result.
 *
 * English is the base; fa and tr are locale data with equal standing. Matching is case-insensitive on an
 * NFKC-normalized copy with ZWNJ removed and Persian/Arabic digits folded, and it is whole-phrase, so a
 * term inside a longer word does not count.
 */

/**
 * Phrases that stand in for a specific answer. They are a signal only in a *short* answer: a long,
 * detailed answer that happens to contain "etc." is not vague (see `QUALITY_THRESHOLDS.vagueWordGate`).
 */
export const VAGUE_MARKERS: Record<Locale, string[]> = {
  en: [
    'everyone',
    'anyone',
    'everybody',
    'all businesses',
    'all companies',
    'any business',
    'high quality',
    'best quality',
    'best in class',
    'world class',
    'world-class',
    'cutting edge',
    'cutting-edge',
    'state of the art',
    'innovative',
    'synergy',
    'various',
    'and more',
    'etc',
    'etc.',
    'many things',
    'a lot of things',
    'stuff',
    'things like that',
    'something like that',
    'good price',
    'great service',
  ],
  fa: [
    'همه',
    'همه افراد',
    'هر کسی',
    'هرکسی',
    'همه کسب‌وکارها',
    'همه شرکت‌ها',
    'باکیفیت',
    'با کیفیت بالا',
    'بهترین کیفیت',
    'بهترین در بازار',
    'در سطح جهانی',
    'نوآورانه',
    'و غیره',
    'و موارد مشابه',
    'چیزهای مختلف',
    'خیلی چیزها',
    'قیمت خوب',
    'خدمات خوب',
  ],
  tr: [
    'herkes',
    'her işletme',
    'tüm işletmeler',
    'tüm şirketler',
    'kaliteli',
    'yüksek kaliteli',
    'en iyi kalite',
    'dünya standartlarında',
    'yenilikçi',
    've benzeri',
    'vb',
    'vb.',
    'çeşitli şeyler',
    'bir sürü şey',
    'iyi fiyat',
    'iyi hizmet',
  ],
}

/** Values that are the template's own stand-ins, not an answer. */
const PLACEHOLDER = /^(tbd|to be decided|todo|n\/?a|none|-+|\.+|\?+|example|example only)$/i
const EXAMPLE_PREFIX = /^(example only|example|نمونه|örnek)\s*[:：-]/i

/**
 * Question ids whose answer is expected to carry a measure. Only these get the `measurability`
 * criterion, so a creative or qualitative brand answer is never penalised for having no numbers.
 */
const MEASURE_ID = /\.(objective|objectives|metric|metrics|kpi|kpis|okr|okrs|target|targets|baseline|budget|price|pricing|runway)$/

export const QUALITY_THRESHOLDS = {
  /** Content words below which a long_text answer cannot fill a document section. */
  longTextWords: 8,
  /** Content words below which a short_text answer says almost nothing. */
  shortTextWords: 2,
  /** A vague marker counts as a deficit only while the answer is this short or shorter. */
  vagueWordGate: 25,
} as const

/**
 * Folds the spellings an owner's keyboard may produce so a lexicon term matches however it was typed:
 * Arabic yeh / alef maksura / kaf to the Persian letters, tatweel and ZWNJ removed, and the combining dot that
 * lower-casing a Turkish `İ` leaves behind (`İ` → `i̇`) dropped, so `KALİTELİ` matches `kaliteli`.
 */
export function normalizeForMatch(text: string): string {
  return asciiDigits(text)
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[‌ـ]/g, '')
    .replace(/̇/g, '')
}

/** Whole-phrase, case-insensitive containment. `etc` does not match inside `etching`. */
export function containsTerm(text: string, term: string): boolean {
  const haystack = normalizeForMatch(text)
  const needle = normalizeForMatch(term)
  if (!needle) return false
  let index = haystack.indexOf(needle)
  while (index !== -1) {
    const before = index === 0 ? '' : (haystack[index - 1] ?? '')
    const after = haystack[index + needle.length] ?? ''
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) return true
    index = haystack.indexOf(needle, index + 1)
  }
  return false
}

/**
 * Vague markers the answer contains, across every locale (an owner may answer a fa question in English).
 * Returns the coach's own terms, so naming them in a reason leaks nothing.
 */
export function vagueMarkersIn(text: string): string[] {
  const found = new Set<string>()
  for (const terms of Object.values(VAGUE_MARKERS)) {
    for (const term of terms) if (containsTerm(text, term)) found.add(term)
  }
  return [...found].sort()
}

/** Whitespace-separated tokens that carry content. Punctuation-only tokens do not count. */
export function contentWordCount(text: string): number {
  return text
    .split(/\s+/)
    .map((token) => token.replace(/[\p{P}\p{S}]/gu, ''))
    .filter((token) => token.length > 0).length
}

export function isPlaceholderValue(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  return PLACEHOLDER.test(trimmed) || EXAMPLE_PREFIX.test(trimmed)
}

export function expectsMeasure(question: FieldQuestion): boolean {
  return question.question_type === 'number' || MEASURE_ID.test(question.id)
}

export function hasDigit(text: string): boolean {
  return /\d/.test(asciiDigits(text))
}

/**
 * Facts that are short by design: a tagline or a brand promise is good *because* it is a few words. For these the
 * specificity minimum is one content word (an empty answer still fires); the vague-term rule still applies, so
 * "best quality, for everyone" is still flagged. Owner decision for the Brand Runtime slice (2026-11-23).
 */
export const SHORT_BY_DESIGN_IDS: ReadonlySet<string> = new Set(['brand.verbal.tagline', 'brand.strategy.promise'])

export function minWordsFor(question: FieldQuestion): number {
  if (SHORT_BY_DESIGN_IDS.has(question.id)) return 1
  if (question.question_type === 'long_text') return QUALITY_THRESHOLDS.longTextWords
  if (question.question_type === 'short_text') return QUALITY_THRESHOLDS.shortTextWords
  return 1
}

/** Free-text question types the length and vagueness rules apply to. A choice or a boolean is exempt. */
export function isFreeText(question: FieldQuestion): boolean {
  return question.question_type === 'long_text' || question.question_type === 'short_text'
}
