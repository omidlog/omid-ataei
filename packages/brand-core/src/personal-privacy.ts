import { asciiDigits } from './structured.js'
import type { FieldQuestion } from './types.js'

/**
 * Privacy guard for Personal Brand OS.
 *
 * Brand OS does not collect highly personal data by default: no home address, personal phone,
 * birth date, government id or family details. This module recognises the common shapes of that
 * data so that
 * - personal-module answers and proposals that contain it are refused before they reach Git, and
 * - no fact that contains it can be published, whatever module it is in.
 *
 * It is a guard, not a classifier. It errs on the side of refusing, and a refusal names the kind of
 * data, never the matched text. It is not a legal compliance check (see docs-internal/PERSONAL_BRAND.md).
 */

export type PrivateDataKind = 'phone' | 'email' | 'birth_date' | 'government_id' | 'home_address' | 'family'

/** What kind of pattern triggered a finding. Closed vocabulary, so a refusal can name it without echoing text. */
export type PrivateDataTrigger = 'digit_run' | 'email_pattern' | 'cue_phrase' | 'category_with_value'

export interface PrivateDataLocation {
  /** 1-based line of the text. */
  line: number
  /** 1-based word within that line (words are separated by whitespace). */
  word: number
}

export interface PrivateDataFinding {
  kind: PrivateDataKind
  message: string
  trigger: PrivateDataTrigger
  /** Where the first match of this kind starts. Never the matched text. */
  location: PrivateDataLocation
}

type CueKind = Exclude<PrivateDataKind, 'phone' | 'email'>

/**
 * Locale data: phrases that introduce private details. English is the base; fa and tr are equal
 * optional locales. Matching is case-insensitive on a normalized copy of the text.
 *
 * Every phrase here states or introduces a value ("born on", "my address is", "همسرم"), so it is refused wherever
 * it appears. Category names that only *name* a kind of data live in `PRIVATE_CATEGORY_NAMES`.
 */
export const PRIVATE_CUES: Record<'en' | 'fa' | 'tr', Partial<Record<CueKind, string[]>>> = {
  en: {
    birth_date: ['born on', 'birthday is', 'dob:'],
    home_address: ['my address is', 'i live at'],
    family: ['my wife', 'my husband', 'my children', 'my kids', 'my son', 'my daughter'],
  },
  fa: {
    birth_date: ['متولد'],
    family: ['همسرم', 'فرزندانم', 'بچه‌هایم', 'پسرم', 'دخترم'],
  },
  tr: {
    birth_date: ['doğum tarihim', 'doğdum'],
    home_address: ['ev adresim'],
    family: ['eşim', 'çocuklarım', 'oğlum', 'kızım'],
  },
}

/**
 * Locale data: names of a category of private data ("date of birth", «تاریخ تولد», "doğum tarihi"). Outside the
 * privacy questions they are refused like a cue. In a `personal.privacy.*` question, whose purpose is to list
 * exactly these categories, a name alone is allowed; it is refused only when a value follows it in the same clause
 * (a digit, or a `:` / `=` with something after it).
 */
export const PRIVATE_CATEGORY_NAMES: Record<'en' | 'fa' | 'tr', Partial<Record<CueKind, string[]>>> = {
  en: {
    birth_date: ['date of birth'],
    government_id: ['passport number', 'passport no', 'national id', 'social security', 'ssn', 'id card number', 'tax id number'],
    home_address: ['home address', 'residential address'],
  },
  fa: {
    birth_date: ['تاریخ تولد'],
    government_id: ['کد ملی', 'شماره ملی', 'شماره پاسپورت', 'شماره گذرنامه'],
    home_address: ['آدرس منزل', 'نشانی منزل', 'آدرس خانه'],
  },
  tr: {
    birth_date: ['doğum tarihi'],
    government_id: ['tc kimlik', 't.c. kimlik', 'kimlik numarası', 'pasaport numarası'],
    home_address: ['ev adresi', 'ikamet adresi'],
  },
}

const MESSAGES: Record<PrivateDataKind, string> = {
  phone: 'a phone number',
  email: 'an email address outside a professional contact field',
  birth_date: 'a birth date',
  government_id: 'a government or tax identifier',
  home_address: 'a home address',
  family: 'family details',
}

const TRIGGERS: Record<PrivateDataTrigger, string> = {
  digit_run: 'a run of seven or more digits',
  email_pattern: 'a name@domain pattern',
  cue_phrase: 'a phrase that introduces this kind of data',
  category_with_value: 'a category name followed by a value',
}

/**
 * An email address: a local part of letters, digits and `._%+'-`, an `@`, and a dotted domain. The local part may
 * not contain `/` or `:`, so a profile URL such as `https://www.tiktok.com/@some.handle` (the `@` right after a
 * slash) is not an email. It may not follow another `@`, so a fediverse handle `@name@server.social` is not one either.
 * A bare `@handle` has no local part and never matches.
 */
const EMAIL_SOURCE = String.raw`(?<![@\p{L}\p{N}._%+'-])[\p{L}\p{N}._%+'-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.[a-z]{2,}`
const EMAIL = new RegExp(EMAIL_SOURCE, 'iu')
const EMAIL_ALL = new RegExp(EMAIL_SOURCE, 'giu')
// Seven or more digits, optionally with a leading + and spaces, dots, dashes or brackets between them.
const PHONE = /(?:\+|00)?\d(?:[\s().-]*\d){6,}/
// A year range or a single date is not a phone number; strip ISO-like dates and years first.
const DATES = /\b\d{4}-\d{2}(?:-\d{2})?\b|\b(?:19|20)\d{2}\s*[-–—]\s*(?:(?:19|20)\d{2}|present)\b|\b(?:19|20)\d{2}\b/gi
const URLS = /https?:\/\/\S+/gi
/** Where a clause ends, for "is a value named after this category?". */
const CLAUSE_END = /[,;\n،؛]|\.(?:\s|$)|\s(?:and|or|ve|veya|ya da|و|یا)\s/iu

function normalize(text: string): string {
  // ZWNJ is optional in Persian typing, so it is ignored on both sides of a match.
  return asciiDigits(text).normalize('NFKC').toLocaleLowerCase('en').replace(/\u200c/g, '')
}

/** Replaces each match with spaces of the same length, so later positions still point at the original words. */
function blank(text: string, pattern: RegExp): string {
  return text.replace(pattern, (match) => ' '.repeat(match.length))
}

function locate(text: string, index: number): PrivateDataLocation {
  const before = text.slice(0, index)
  const lines = before.split('\n')
  const current = lines[lines.length - 1] ?? ''
  const words = current.split(/\s+/).filter(Boolean).length
  // A match that starts mid-word belongs to that word; one that starts after whitespace starts the next word.
  const startsWord = current.length === 0 || /\s$/.test(current)
  return { line: lines.length, word: startsWord ? words + 1 : Math.max(1, words) }
}

export interface PrivateDataOptions {
  /** A professional contact field: an email address is allowed. */
  allowEmail?: boolean
  /** A `personal.privacy.*` question: naming a category without a value is allowed. */
  allowCategoryNames?: boolean
}

/** Every kind of private data the text appears to contain, with what triggered it and where. */
export function privateDataFindings(text: string, options: PrivateDataOptions = {}): PrivateDataFinding[] {
  const lower = normalize(text)
  const found = new Map<PrivateDataKind, PrivateDataFinding>()
  const add = (kind: PrivateDataKind, trigger: PrivateDataTrigger, index: number) => {
    if (!found.has(kind)) found.set(kind, { kind, message: MESSAGES[kind], trigger, location: locate(lower, index) })
  }
  const forPhone = blank(blank(blank(lower, EMAIL_ALL), URLS), DATES)
  const phone = PHONE.exec(forPhone)
  if (phone) add('phone', 'digit_run', phone.index)
  if (!options.allowEmail) {
    const email = EMAIL.exec(lower)
    if (email) add('email', 'email_pattern', email.index)
  }
  for (const cues of Object.values(PRIVATE_CUES)) {
    for (const [kind, phrases] of Object.entries(cues) as Array<[CueKind, string[]]>) {
      for (const phrase of phrases) {
        const index = phraseIndex(lower, phrase)
        if (index !== -1) add(kind, 'cue_phrase', index)
      }
    }
  }
  for (const names of Object.values(PRIVATE_CATEGORY_NAMES)) {
    for (const [kind, phrases] of Object.entries(names) as Array<[CueKind, string[]]>) {
      for (const phrase of phrases) {
        const needle = normalize(phrase)
        for (const index of phraseIndexes(lower, needle)) {
          if (!options.allowCategoryNames) {
            add(kind, 'cue_phrase', index)
            break
          }
          if (valueFollows(lower.slice(index + needle.length))) {
            add(kind, 'category_with_value', index)
            break
          }
        }
      }
    }
  }
  const order: PrivateDataKind[] = ['phone', 'email', 'birth_date', 'government_id', 'home_address', 'family']
  return order.flatMap((kind) => (found.has(kind) ? [found.get(kind)!] : []))
}

/** True when the rest of the clause after a category name carries a value: a digit, or `:` / `=` and some text. */
function valueFollows(rest: string): boolean {
  const end = rest.search(CLAUSE_END)
  const clause = (end === -1 ? rest : rest.slice(0, end)).slice(0, 80)
  return /\d/.test(clause) || /^\s*[:=：]\s*\S/.test(rest)
}

function phraseIndex(text: string, phrase: string): number {
  return phraseIndexes(text, normalize(phrase))[0] ?? -1
}

function phraseIndexes(text: string, needle: string): number[] {
  const out: number[] = []
  let index = text.indexOf(needle)
  while (index !== -1) {
    const before = index === 0 ? '' : text[index - 1] ?? ''
    const after = text[index + needle.length] ?? ''
    // Whole-phrase match: a cue inside a longer word (for example "ssn" in "lessn") does not count.
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) out.push(index)
    index = text.indexOf(needle, index + 1)
  }
  return out
}

/** `personal.privacy.*` questions exist to list categories of private data, so naming one is not a value. */
export function namesPrivacyCategories(questionId: string): boolean {
  return questionId.startsWith('personal.privacy.')
}

function describe(finding: PrivateDataFinding): string {
  return `${finding.message} (${TRIGGERS[finding.trigger]} in line ${finding.location.line}, word ${finding.location.word})`
}

/**
 * Plain-language refusal, or null when nothing private was found. It names the kind of data, the kind of pattern
 * and where it starts (line and word), and never echoes the matched text.
 */
export function privateDataRefusal(question: Pick<FieldQuestion, 'id' | 'contact_field'>, value: unknown): string | null {
  if (value === null || value === undefined) return null
  const findings = privateDataFindings(String(value), { allowEmail: question.contact_field === true, allowCategoryNames: namesPrivacyCategories(question.id) })
  if (findings.length === 0) return null
  return `${question.id} looks like it contains ${findings.map(describe).join(', ')}. Brand OS does not store or publish private personal data by default. Use a professional contact link instead, or leave it out. Nothing was saved.`
}
