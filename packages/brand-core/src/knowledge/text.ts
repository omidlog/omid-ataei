/**
 * Search normalization for English, Persian and Turkish. Only used for matching: stored notes keep their
 * original text.
 *
 * - NFKC, then Persian/Arabic letter unification (ي→ی, ى→ی, ك→ک, ة→ه, أ/إ/ٱ→ا, ؤ→و, ئ→ی).
 * - Arabic diacritics and tatweel removed; ZWNJ and ZWJ removed, so `می\u200Cخواهم` and `میخواهم` match.
 * - Persian and Arabic-Indic digits become ASCII digits.
 * - Latin letters are case-folded and stripped of diacritics; Turkish dotless ı and dotted İ both fold to i,
 *   so `İstanbul`, `istanbul` and `ISTANBUL` match, and `şehir` matches `sehir`.
 */

const ARABIC_MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g
const JOINERS = /\u200C|\u200D|[\u200E\u200F\u2066-\u2069\u202A-\u202E]/g
const LETTERS: Record<string, string> = {
  'ي': 'ی',
  'ى': 'ی',
  'ئ': 'ی',
  'ك': 'ک',
  'ة': 'ه',
  'أ': 'ا',
  'إ': 'ا',
  'ٱ': 'ا',
  'آ': 'ا',
  'ؤ': 'و',
}

export function normalizeForSearch(text: string): string {
  let out = text.normalize('NFKC')
  out = out.replace(/[يىئكةأإٱآؤ]/g, (ch) => LETTERS[ch] ?? ch)
  out = out.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  out = out.replace(ARABIC_MARKS, '').replace(JOINERS, '')
  out = out.replace(/[İIı]/g, 'i')
  out = out.toLowerCase()
  // Latin diacritics only: decompose, drop combining marks, recompose. Arabic-script marks were removed above.
  out = out.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC')
  return out.replace(/\s+/g, ' ').trim()
}

export function tokenize(normalized: string): string[] {
  return normalized.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 0)
}

export function tokensOf(text: string): string[] {
  return tokenize(normalizeForSearch(text))
}

/**
 * A real excerpt of `body`: the first line that matches, trimmed to `max` characters. The snippet is always
 * a substring of the original text, so a search result can never show words the note does not contain.
 */
export function snippetFor(body: string, phrase: string, tokens: string[], max: number): string | null {
  const lines = body.split('\n')
  let best: string | null = null
  for (const line of lines) {
    const norm = normalizeForSearch(line)
    if (!norm) continue
    if ((phrase && norm.includes(phrase)) || tokens.some((token) => norm.includes(token))) {
      best = line
      break
    }
  }
  if (best === null) {
    best = lines.find((line) => line.trim()) ?? null
    if (best === null) return null
  }
  const trimmed = best.trim()
  if (trimmed.length <= max) return trimmed
  // Locate the match approximately (normalization can change lengths) and cut a window of original text.
  const norm = normalizeForSearch(trimmed)
  const target = phrase && norm.includes(phrase) ? phrase : tokens.find((token) => norm.includes(token)) ?? ''
  const ratio = target ? norm.indexOf(target) / Math.max(1, norm.length) : 0
  const centre = Math.floor(ratio * trimmed.length)
  const start = Math.max(0, Math.min(trimmed.length - max, centre - Math.floor(max / 3)))
  return trimmed.slice(start, start + max)
}
