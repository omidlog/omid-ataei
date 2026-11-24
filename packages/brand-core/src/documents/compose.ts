/**
 * BOS-19: a composed draft paragraph per language for the personal pack documents (Professional Bio, LinkedIn Pack …).
 *
 * The composer is deterministic templating, not writing:
 *
 * - It uses only the facts it is given (approved facts the caller may read) and keeps each value verbatim.
 * - A fact goes into the edition of the language it is written in. The language is read from the script of the value
 *   (Arabic script → fa; Latin with Turkish letters → tr; other Latin → en; both scripts in similar measure → mixed).
 * - A fact written in another language is used only through an approved translation: the per-language forms the owner
 *   approved in a companion question (`personal.identity.localized_headline` for the headline,
 *   `personal.identity.name_forms` for the name), labelled `fa: …`, `tr: …`, `en: …`. Otherwise it is listed as
 *   untranslated and left out of that edition. Nothing is machine-translated.
 * - The only words it adds are the neutral connectors below (a lead-in such as "Known for:" and the dash between the
 *   name and the headline), defined per locale.
 * - The result is always a draft for the owner's approval. It carries no authority.
 */

export const DRAFT_LOCALES = ['en', 'fa', 'tr'] as const
export type DraftLocale = (typeof DRAFT_LOCALES)[number]
export const DRAFT_LABEL = 'Draft for owner approval'

export type FactLanguage = DraftLocale | 'mixed' | 'none'

/** A fact id → the companion question whose approved, language-labelled forms translate it. */
export const TRANSLATION_COMPANIONS: Readonly<Record<string, string>> = {
  'personal.identity.headline': 'personal.identity.localized_headline',
  'personal.identity.public_name': 'personal.identity.name_forms',
}

/** A name is not translated: the approved public name stands in every edition unless an approved form exists. */
const LANGUAGE_NEUTRAL: ReadonlySet<string> = new Set(['personal.identity.public_name'])

/** Neutral lead-ins, per locale. A value that already starts with its lead-in is not prefixed again. */
export const DRAFT_CONNECTORS: Readonly<Record<DraftLocale, Readonly<Record<string, string>>>> = {
  en: {
    'personal.positioning.known_for': 'Known for',
    'personal.identity.roles': 'Roles',
    'personal.identity.service_scope': 'Scope',
    'personal.identity.name_forms': 'Name forms',
    'personal.positioning.expertise': 'Expertise',
    'personal.positioning.primary_audience': 'Audience',
    'personal.positioning.boundaries': 'Boundaries',
    'personal.credibility.credentials': 'Credentials',
    'personal.credibility.awards': 'Recognition',
    'personal.experience.highlights': 'Highlights',
    'personal.story.turning_points': 'Turning points',
    'personal.services.offers': 'Services',
    'personal.content.pillars': 'Topics',
    'personal.speaking.topics': 'Speaking topics',
    'personal.contact.public_channels': 'Contact',
  },
  fa: {
    'personal.positioning.known_for': 'شناخته‌شده به‌عنوان',
    'personal.identity.roles': 'نقش‌ها',
    'personal.identity.service_scope': 'دامنهٔ کار',
    'personal.identity.name_forms': 'شکل‌های نام',
    'personal.positioning.expertise': 'تخصص',
    'personal.positioning.primary_audience': 'مخاطب',
    'personal.positioning.boundaries': 'مرزها',
    'personal.credibility.credentials': 'مدارک',
    'personal.credibility.awards': 'افتخارات',
    'personal.experience.highlights': 'دستاوردها',
    'personal.story.turning_points': 'نقطه‌های عطف',
    'personal.services.offers': 'خدمات',
    'personal.content.pillars': 'موضوع‌ها',
    'personal.speaking.topics': 'موضوع‌های سخنرانی',
    'personal.contact.public_channels': 'تماس',
  },
  tr: {
    'personal.positioning.known_for': 'Bilinen yönü',
    'personal.identity.roles': 'Roller',
    'personal.identity.service_scope': 'Kapsam',
    'personal.identity.name_forms': 'Ad biçimleri',
    'personal.positioning.expertise': 'Uzmanlık',
    'personal.positioning.primary_audience': 'Hedef kitle',
    'personal.positioning.boundaries': 'Sınırlar',
    'personal.credibility.credentials': 'Yeterlilikler',
    'personal.credibility.awards': 'Ödüller ve tanınma',
    'personal.experience.highlights': 'Öne çıkanlar',
    'personal.story.turning_points': 'Dönüm noktaları',
    'personal.services.offers': 'Hizmetler',
    'personal.content.pillars': 'Konular',
    'personal.speaking.topics': 'Konuşma konuları',
    'personal.contact.public_channels': 'İletişim',
  },
}

/** Between the name and the headline. */
const NAME_HEADLINE_SEPARATOR = ' — '

/** Language labels the owner may use inside a companion answer (`fa: …`, `Türkçe: …`, `ترکی: …`). */
const LANGUAGE_LABELS: Record<DraftLocale, string[]> = {
  en: ['en', 'english', 'ingilizce', 'İngilizce', 'انگلیسی'],
  fa: ['fa', 'farsi', 'persian', 'farsça', 'فارسی', 'پارسی'],
  tr: ['tr', 'turkish', 'türkçe', 'turkce', 'ترکی استانبولی', 'ترکی'],
}

const ARABIC_LETTER = /[\p{Script=Arabic}]/u
const LATIN_LETTER = /[\p{Script=Latin}]/u
const TURKISH_LETTER = /[ğĞşŞıİ]/

/** The language a fact value is written in, read from its script. URLs and e-mail addresses do not count. */
export function factLanguage(text: string): FactLanguage {
  const plain = text.replace(/https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+/giu, ' ')
  let arabic = 0
  let latin = 0
  for (const char of plain) {
    if (!/\p{L}/u.test(char)) continue
    if (ARABIC_LETTER.test(char)) arabic += 1
    else if (LATIN_LETTER.test(char)) latin += 1
  }
  if (arabic + latin === 0) return 'none'
  if (arabic === 0) return TURKISH_LETTER.test(plain) ? 'tr' : 'en'
  return arabic / (arabic + latin) >= 0.5 ? 'fa' : 'mixed'
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const LABEL_PATTERN = new RegExp(
  `(^|[\\s.;؛،|(])(${DRAFT_LOCALES.flatMap((locale) => LANGUAGE_LABELS[locale])
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join('|')})\\s*[:：]`,
  'giu',
)

function localeOfLabel(label: string): DraftLocale | null {
  const forms = new Set([label.toLowerCase(), label.toLocaleLowerCase('tr')])
  for (const locale of DRAFT_LOCALES) {
    if (LANGUAGE_LABELS[locale].some((item) => forms.has(item.toLowerCase()) || forms.has(item.toLocaleLowerCase('tr')))) return locale
  }
  return null
}

function trimSegment(text: string): string {
  return text.trim().replace(/[\s.;؛،,|]+$/u, '').trim()
}

/**
 * The language-labelled forms inside an approved answer: `fa: … tr: …`. Only text that starts with a label, or holds
 * at least two labels, is read as labelled; anything else returns no forms and is treated as an ordinary fact.
 */
export function localizedSegments(text: string): Partial<Record<DraftLocale, string>> {
  const found: Array<{ locale: DraftLocale; start: number; end: number }> = []
  for (const match of text.matchAll(LABEL_PATTERN)) {
    const locale = localeOfLabel(match[2] ?? '')
    if (!locale) continue
    const start = (match.index ?? 0) + (match[1] ?? '').length
    found.push({ locale, start, end: (match.index ?? 0) + match[0].length })
  }
  const startsLabelled = found.length > 0 && text.slice(0, found[0]!.start).trim() === ''
  if (found.length === 0 || (!startsLabelled && found.length < 2)) return {}
  const out: Partial<Record<DraftLocale, string>> = {}
  found.forEach((item, index) => {
    const next = found[index + 1]
    const segment = trimSegment(text.slice(item.end, next ? next.start : text.length))
    if (segment && out[item.locale] === undefined) out[item.locale] = segment
  })
  return out
}

export function countWords(text: string): number {
  return text.split(/\s+/u).filter((word) => /[\p{L}\p{N}]/u.test(word)).length
}

export interface ComposeSource {
  id: string
  label: string
  value: string
  /** A structured answer (lists, relationships …) is never put into prose; it stays a Source. */
  structured?: boolean
}

export interface UntranslatedFact {
  id: string
  label: string
  /** The language the approved value is written in. */
  written_in: FactLanguage
}

export interface ComposedDraft {
  locale: DraftLocale
  label: typeof DRAFT_LABEL
  status: 'draft'
  /** Empty when no fact in this section is approved in this language. */
  text: string
  words: number
  /** Fact ids used, in order. */
  used: string[]
  /** Facts used through an approved language form held by a companion question. */
  translations: Array<{ id: string; from: string }>
  /** Approved facts left out of this edition: not in this language and with no approved translation. */
  untranslated: UntranslatedFact[]
  /** Structured answers kept as Sources only. */
  not_composed: string[]
  length: { guideline: [number, number]; state: 'below' | 'within' | 'above' } | null
}

function sentence(text: string): string {
  const clean = text.trim().replace(/[\s;؛،,:|]+$/u, '')
  return /[.!?؟…]$/u.test(clean) ? clean : `${clean}.`
}

function withLead(locale: DraftLocale, id: string, text: string): string {
  const lead = DRAFT_CONNECTORS[locale][id]
  if (!lead) return text
  const normalized = text.trim().toLocaleLowerCase()
  if (normalized.startsWith(lead.toLocaleLowerCase())) return text
  return `${lead}: ${text}`
}

const COMPANION_IDS: ReadonlySet<string> = new Set(Object.values(TRANSLATION_COMPANIONS))

/**
 * One composed draft per locale for a section. `companions` holds the approved values of the companion questions the
 * caller may read (they need not be in the section). The order of `sources` is the order of the paragraph.
 */
export function composeDrafts(sources: ComposeSource[], companions: Readonly<Record<string, string>>, locales: readonly DraftLocale[], guideline?: [number, number]): ComposedDraft[] {
  return locales.map((locale) => {
    const pieces: Array<{ id: string; text: string }> = []
    const draft: ComposedDraft = { locale, label: DRAFT_LABEL, status: 'draft', text: '', words: 0, used: [], translations: [], untranslated: [], not_composed: [], length: null }
    const viaCompanion = new Set<string>()
    for (const source of sources) {
      const value = source.value.trim()
      if (!value) continue
      if (source.structured) {
        draft.not_composed.push(source.id)
        continue
      }
      const language = factLanguage(value)
      const companionId = TRANSLATION_COMPANIONS[source.id]
      const form = companionId && companions[companionId] ? localizedSegments(companions[companionId]!)[locale] : undefined
      // A companion in the section itself contributes its form for this locale, unless its fact already did.
      if (COMPANION_IDS.has(source.id)) {
        const own = localizedSegments(value)
        if (Object.keys(own).length > 0) {
          if (viaCompanion.has(source.id)) continue
          const segment = own[locale]
          if (segment) {
            pieces.push({ id: source.id, text: segment })
            draft.used.push(source.id)
          } else if (!sources.some((item) => TRANSLATION_COMPANIONS[item.id] === source.id && draft.used.includes(item.id))) {
            draft.untranslated.push({ id: source.id, label: source.label, written_in: 'mixed' })
          }
          continue
        }
      }
      let text: string | null = null
      if (LANGUAGE_NEUTRAL.has(source.id)) {
        text = form ?? value
        if (form && companionId) {
          draft.translations.push({ id: source.id, from: companionId })
          viaCompanion.add(companionId)
        }
      } else if (language === locale || language === 'none') {
        text = value
      } else if (form && companionId) {
        text = form
        draft.translations.push({ id: source.id, from: companionId })
        viaCompanion.add(companionId)
      }
      if (text === null) {
        draft.untranslated.push({ id: source.id, label: source.label, written_in: language })
        continue
      }
      pieces.push({ id: source.id, text })
      draft.used.push(source.id)
    }
    const sentences: string[] = []
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index]!
      const next = pieces[index + 1]
      if (piece.id === 'personal.identity.public_name' && next?.id === 'personal.identity.headline') {
        sentences.push(sentence(`${piece.text.trim()}${NAME_HEADLINE_SEPARATOR}${next.text.trim()}`))
        index += 1
        continue
      }
      sentences.push(sentence(withLead(locale, piece.id, piece.text)))
    }
    draft.text = sentences.join(' ')
    draft.words = countWords(draft.text)
    if (guideline) {
      const [min, max] = guideline
      draft.length = { guideline, state: draft.words < min ? 'below' : draft.words > max ? 'above' : 'within' }
    }
    return draft
  })
}

/** The editions a brand offers: its supported locales that have a composer, the default locale first. */
export function draftLocales(supported: readonly string[], defaultLocale: string | undefined): DraftLocale[] {
  const known = DRAFT_LOCALES.filter((locale) => supported.includes(locale))
  const list = known.length > 0 ? known : [...DRAFT_LOCALES]
  const first = list.find((locale) => locale === defaultLocale)
  return first ? [first, ...list.filter((locale) => locale !== first)] : list
}
