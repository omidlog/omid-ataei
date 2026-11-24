import { asciiDigits } from './structured.js'
import type { LocalizedPrompt } from './types.js'
import { PLAN_ENTITY_SPECS } from './entities-plan.js'

/**
 * `repeating_entity` answers (Visual V3.1, owner decision D3): a list of structured items, each with its own fields,
 * a stable id and optional links to items of other repeating-entity questions.
 *
 * The answer ledger stores scalar values, so a list is stored as one canonical JSON string, exactly like the other
 * structured types store one canonical string (`structured.ts`). Normalizing the canonical form again yields the same
 * string, so a value is stable across approve, export and migration.
 *
 *   {"schema":"brand-os.entity-list/1","question":"business.model.segments","next":3,
 *    "items":[{"id":"seg-1","name":"Independent cafés","detail":"…","priority":"primary"},{"id":"seg-2",…}]}
 *
 * - `id` is `<prefix>-<n>`. It never changes when an item is edited or moved, and `next` only grows, so a removed
 *   item's id is never given to a new item (links that pointed at it stay recognisably broken, never silently
 *   re-targeted).
 * - `links` name items of the questions listed in the spec (`act-2`, `seg-1`). They are checked for form here;
 *   whether the target exists is resolved by the reader (the canvas marks a dangling link, it never invents one).
 * - A value that is not this canonical form is **legacy** free text: it is kept as written and flagged, never
 *   dropped and never rewritten silently (`readEntityList`, `entity-migration.ts`).
 *
 * Messages are English (the base language of the core validators); field and option labels are en/fa/tr.
 */

export const ENTITY_LIST_SCHEMA = 'brand-os.entity-list/1'

export interface EntityFieldSpec {
  key: string
  /** Visual V3.3: `number` (canonical decimal, Persian digits accepted) and `date` (YYYY-MM-DD) for structured key results. */
  kind: 'text' | 'choice' | 'number' | 'date'
  required: boolean
  /** Maximum characters for text; ignored for choices. */
  max: number
  options?: readonly string[]
  label: LocalizedPrompt
  /** Choice option labels, en/fa/tr. */
  option_labels?: Record<string, LocalizedPrompt>
  /** Visual V3.3: text this field refuses (e.g. a currency as a key-result unit), with the reason shown to the owner. */
  refuse?: { pattern: RegExp; message: string }
}

export interface EntitySpec {
  question_id: string
  /** Lower-case ASCII; item ids are `<prefix>-<n>`. */
  id_prefix: string
  max_items: number
  /** The first field is the item's name and is always required. */
  fields: readonly EntityFieldSpec[]
  /** Question ids whose items this list may link to. */
  links: readonly string[]
  /** Refuse money amounts in any field (cost items describe what costs money, never how much). */
  no_amounts?: boolean
  /** One item, for headings and CLI output. */
  item_label: LocalizedPrompt
  /**
   * Visual V3.2: items may cite where they come from (`sources`): an approved answer (question id), a knowledge note
   * (`kn_…`), an evidence record (`ev-0001`) or a public https page. Checked for form here; readers resolve them.
   */
  sources?: boolean
  /**
   * Visual V3.2: a choice field that narrows the link targets (a TOWS "SO" strategy links only to strengths and
   * opportunities). Option → allowed target question ids; an item without the choice may link to any `links` target.
   */
  link_rule?: { field: string; targets: Readonly<Record<string, readonly string[]>> }
  /** Visual V3.3: at most this many links per item (a key result belongs to one objective). Default `ENTITY_LIMITS.links`. */
  max_links?: number
}

export interface EntityItem {
  id: string
  fields: Record<string, string>
  links: string[]
  /** Visual V3.2: source references, only on lists whose spec allows them. Absent when there are none. */
  sources?: string[]
}

export interface EntityList {
  question: string
  next: number
  items: EntityItem[]
}

export type EntityRead =
  | { state: 'items'; list: EntityList }
  /** A stored value that is not a canonical list (older free text, or a hand edit). Kept verbatim. */
  | { state: 'legacy'; text: string }
  | { state: 'empty' }

export const ENTITY_LIMITS = { name: 120, detail: 400, links: 12, sources: 8, source_length: 300 } as const

const NAME: EntityFieldSpec = {
  key: 'name',
  kind: 'text',
  required: true,
  max: ENTITY_LIMITS.name,
  label: { en: 'Name', fa: 'نام', tr: 'Ad' },
}

function detail(label: LocalizedPrompt): EntityFieldSpec {
  return { key: 'detail', kind: 'text', required: false, max: ENTITY_LIMITS.detail, label }
}

function choice(key: string, label: LocalizedPrompt, options: Record<string, LocalizedPrompt>): EntityFieldSpec {
  return { key, kind: 'choice', required: false, max: 0, options: Object.keys(options), label, option_labels: options }
}

/**
 * Visual V3.2: one SWOT list. Every item names the point, says what it rests on and how sure the owner is; the
 * confidence names are plain words, never a score.
 */
function swotSpec(questionId: string, prefix: string, itemLabel: LocalizedPrompt): EntitySpec {
  return {
    question_id: questionId,
    id_prefix: prefix,
    max_items: 12,
    item_label: itemLabel,
    sources: true,
    fields: [
      NAME,
      detail({ en: 'What it rests on', fa: 'بر چه چیزی تکیه دارد', tr: 'Neye dayanıyor' }),
      choice('confidence', { en: 'Confidence', fa: 'اطمینان', tr: 'Güven' }, {
        evidenced: { en: 'Evidenced', fa: 'مستند', tr: 'Kanıtlı' },
        owner_view: { en: "Owner's view", fa: 'نظر مالک', tr: 'Sahibin görüşü' },
        hypothesis: { en: 'Hypothesis', fa: 'فرضیه', tr: 'Hipotez' },
      }),
    ],
    links: [],
  }
}

/**
 * Canonical repeating-entity questions. Ids are the ones the P0 audit proposed for the Business Model Canvas; option
 * names are the standard BMC categories (resource types, activity types, cost behaviour) or plain priorities.
 */
export const ENTITY_SPECS: Readonly<Record<string, EntitySpec>> = {
  'business.model.key_activities': {
    question_id: 'business.model.key_activities',
    id_prefix: 'act',
    max_items: 20,
    item_label: { en: 'Activity', fa: 'فعالیت', tr: 'Faaliyet' },
    fields: [
      NAME,
      detail({ en: 'What it involves', fa: 'شامل چه کاری است', tr: 'Neleri kapsıyor' }),
      choice('category', { en: 'Type', fa: 'نوع', tr: 'Tür' }, {
        production: { en: 'Production', fa: 'تولید', tr: 'Üretim' },
        problem_solving: { en: 'Problem solving', fa: 'حل مسئله', tr: 'Problem çözme' },
        platform: { en: 'Platform or network', fa: 'پلتفرم یا شبکه', tr: 'Platform veya ağ' },
      }),
    ],
    links: ['business.model.segments', 'business.model.key_resources'],
  },
  'business.model.key_resources': {
    question_id: 'business.model.key_resources',
    id_prefix: 'res',
    max_items: 20,
    item_label: { en: 'Resource', fa: 'منبع', tr: 'Kaynak' },
    fields: [
      NAME,
      detail({ en: 'Why it matters', fa: 'چرا مهم است', tr: 'Neden önemli' }),
      choice('category', { en: 'Type', fa: 'نوع', tr: 'Tür' }, {
        physical: { en: 'Physical', fa: 'فیزیکی', tr: 'Fiziksel' },
        intellectual: { en: 'Intellectual', fa: 'فکری', tr: 'Entelektüel' },
        human: { en: 'Human', fa: 'انسانی', tr: 'İnsan' },
        financial: { en: 'Financial', fa: 'مالی', tr: 'Finansal' },
      }),
    ],
    links: ['business.model.key_activities'],
  },
  'business.model.segments': {
    question_id: 'business.model.segments',
    id_prefix: 'seg',
    max_items: 12,
    item_label: { en: 'Segment', fa: 'بخش مشتری', tr: 'Segment' },
    fields: [
      NAME,
      detail({ en: 'Needs or jobs', fa: 'نیازها یا کارها', tr: 'İhtiyaçlar veya işler' }),
      choice('priority', { en: 'Priority', fa: 'اولویت', tr: 'Öncelik' }, {
        primary: { en: 'Primary', fa: 'اصلی', tr: 'Birincil' },
        secondary: { en: 'Secondary', fa: 'فرعی', tr: 'İkincil' },
        exploring: { en: 'Exploring', fa: 'در حال بررسی', tr: 'Keşif' },
      }),
    ],
    links: [],
  },
  'business.model.cost_items': {
    question_id: 'business.model.cost_items',
    id_prefix: 'cost',
    max_items: 20,
    no_amounts: true,
    item_label: { en: 'Cost item', fa: 'قلم هزینه', tr: 'Maliyet kalemi' },
    fields: [
      NAME,
      detail({ en: 'What drives it', fa: 'چه چیزی آن را تعیین می‌کند', tr: 'Neye bağlı' }),
      choice('behaviour', { en: 'Behaviour', fa: 'رفتار هزینه', tr: 'Davranış' }, {
        fixed: { en: 'Fixed', fa: 'ثابت', tr: 'Sabit' },
        variable: { en: 'Variable', fa: 'متغیر', tr: 'Değişken' },
        mixed: { en: 'Mixed', fa: 'ترکیبی', tr: 'Karma' },
      }),
    ],
    links: ['business.model.key_activities', 'business.model.key_resources'],
  },
  // ---- Visual V3.2: SWOT / TOWS ------------------------------------------------------------------------------
  'business.swot.strengths': swotSpec('business.swot.strengths', 'str', { en: 'Strength', fa: 'قوت', tr: 'Güçlü yön' }),
  'business.swot.weaknesses': swotSpec('business.swot.weaknesses', 'wk', { en: 'Weakness', fa: 'ضعف', tr: 'Zayıf yön' }),
  'business.swot.opportunities': swotSpec('business.swot.opportunities', 'opp', { en: 'Opportunity', fa: 'فرصت', tr: 'Fırsat' }),
  'business.swot.threats': swotSpec('business.swot.threats', 'thr', { en: 'Threat', fa: 'تهدید', tr: 'Tehdit' }),
  'business.swot.tows': {
    question_id: 'business.swot.tows',
    id_prefix: 'tows',
    max_items: 16,
    item_label: { en: 'TOWS strategy', fa: 'راهبرد TOWS', tr: 'TOWS stratejisi' },
    sources: true,
    fields: [
      NAME,
      detail({ en: 'What it means in practice', fa: 'در عمل یعنی چه', tr: 'Pratikte ne anlama geliyor' }),
      choice('type', { en: 'Strategy type', fa: 'نوع راهبرد', tr: 'Strateji türü' }, {
        so: { en: 'SO: use strengths to seize opportunities', fa: 'SO: استفاده از قوت‌ها برای گرفتن فرصت‌ها', tr: 'SO: güçlü yönlerle fırsatları yakala' },
        st: { en: 'ST: use strengths to counter threats', fa: 'ST: استفاده از قوت‌ها برای مقابله با تهدیدها', tr: 'ST: güçlü yönlerle tehditleri karşıla' },
        wo: { en: 'WO: fix weaknesses by using opportunities', fa: 'WO: رفع ضعف‌ها با کمک فرصت‌ها', tr: 'WO: fırsatlarla zayıf yönleri gider' },
        wt: { en: 'WT: reduce weaknesses and avoid threats', fa: 'WT: کم کردن ضعف‌ها و دوری از تهدیدها', tr: 'WT: zayıf yönleri azalt, tehditlerden kaçın' },
      }),
    ],
    links: ['business.swot.strengths', 'business.swot.weaknesses', 'business.swot.opportunities', 'business.swot.threats'],
    link_rule: {
      field: 'type',
      targets: {
        so: ['business.swot.strengths', 'business.swot.opportunities'],
        st: ['business.swot.strengths', 'business.swot.threats'],
        wo: ['business.swot.weaknesses', 'business.swot.opportunities'],
        wt: ['business.swot.weaknesses', 'business.swot.threats'],
      },
    },
  },
  // ---- Visual V3.2: Value Proposition Canvas (customer profile and value map) ---------------------------------
  'business.fit.jobs': {
    question_id: 'business.fit.jobs',
    id_prefix: 'job',
    max_items: 16,
    item_label: { en: 'Customer job', fa: 'کار مشتری', tr: 'Müşteri işi' },
    sources: true,
    fields: [
      NAME,
      detail({ en: 'When and why it matters', fa: 'کی و چرا مهم است', tr: 'Ne zaman ve neden önemli' }),
      choice('kind', { en: 'Job type', fa: 'نوع کار', tr: 'İş türü' }, {
        functional: { en: 'Functional', fa: 'کارکردی', tr: 'İşlevsel' },
        social: { en: 'Social', fa: 'اجتماعی', tr: 'Sosyal' },
        emotional: { en: 'Emotional', fa: 'احساسی', tr: 'Duygusal' },
      }),
    ],
    links: ['business.model.segments'],
  },
  'business.fit.pains': {
    question_id: 'business.fit.pains',
    id_prefix: 'pain',
    max_items: 16,
    item_label: { en: 'Pain', fa: 'درد', tr: 'Sıkıntı' },
    sources: true,
    fields: [
      NAME,
      detail({ en: 'What happens today', fa: 'امروز چه اتفاقی می‌افتد', tr: 'Bugün ne oluyor' }),
      choice('severity', { en: 'Severity', fa: 'شدت', tr: 'Şiddet' }, {
        extreme: { en: 'Extreme', fa: 'شدید', tr: 'Çok yüksek' },
        moderate: { en: 'Moderate', fa: 'متوسط', tr: 'Orta' },
        light: { en: 'Light', fa: 'خفیف', tr: 'Hafif' },
      }),
    ],
    links: ['business.model.segments', 'business.fit.jobs'],
  },
  'business.fit.gains': {
    question_id: 'business.fit.gains',
    id_prefix: 'gain',
    max_items: 16,
    item_label: { en: 'Gain', fa: 'دستاورد', tr: 'Kazanım' },
    sources: true,
    fields: [
      NAME,
      detail({ en: 'What the customer hopes for', fa: 'مشتری به چه چیزی امید دارد', tr: 'Müşteri neyi umuyor' }),
      choice('relevance', { en: 'Relevance', fa: 'اهمیت', tr: 'Önem' }, {
        required: { en: 'Required', fa: 'ضروری', tr: 'Zorunlu' },
        expected: { en: 'Expected', fa: 'مورد انتظار', tr: 'Beklenen' },
        desired: { en: 'Desired', fa: 'مطلوب', tr: 'İstenen' },
        unexpected: { en: 'Unexpected', fa: 'غیرمنتظره', tr: 'Beklenmedik' },
      }),
    ],
    links: ['business.model.segments', 'business.fit.jobs'],
  },
  'business.fit.products': {
    question_id: 'business.fit.products',
    id_prefix: 'prod',
    max_items: 12,
    item_label: { en: 'Product or service', fa: 'محصول یا خدمت', tr: 'Ürün veya hizmet' },
    sources: true,
    fields: [
      NAME,
      detail({ en: 'What the customer gets', fa: 'مشتری چه چیزی می‌گیرد', tr: 'Müşteri ne alıyor' }),
      choice('kind', { en: 'Kind', fa: 'گونه', tr: 'Tür' }, {
        physical: { en: 'Physical', fa: 'فیزیکی', tr: 'Fiziksel' },
        digital: { en: 'Digital', fa: 'دیجیتال', tr: 'Dijital' },
        service: { en: 'Service', fa: 'خدمت', tr: 'Hizmet' },
        financial: { en: 'Financial', fa: 'مالی', tr: 'Finansal' },
      }),
    ],
    links: ['business.model.segments', 'business.fit.jobs'],
  },
  'business.fit.relievers': {
    question_id: 'business.fit.relievers',
    id_prefix: 'rel',
    max_items: 16,
    item_label: { en: 'Pain reliever', fa: 'درمان درد', tr: 'Sıkıntı giderici' },
    sources: true,
    fields: [NAME, detail({ en: 'How it relieves the pain', fa: 'چطور درد را کم می‌کند', tr: 'Sıkıntıyı nasıl gideriyor' })],
    links: ['business.fit.pains', 'business.fit.products'],
  },
  'business.fit.creators': {
    question_id: 'business.fit.creators',
    id_prefix: 'gcr',
    max_items: 16,
    item_label: { en: 'Gain creator', fa: 'خالق دستاورد', tr: 'Kazanım yaratıcı' },
    sources: true,
    fields: [NAME, detail({ en: 'How it creates the gain', fa: 'چطور دستاورد را می‌سازد', tr: 'Kazanımı nasıl yaratıyor' })],
    links: ['business.fit.gains', 'business.fit.products'],
  },
  // Visual V3.3: customer journey stages and structured OKRs (entities-plan.ts).
  ...PLAN_ENTITY_SPECS,
}

export const ENTITY_QUESTION_IDS: readonly string[] = Object.keys(ENTITY_SPECS)

export function entitySpec(questionId: string): EntitySpec | null {
  return ENTITY_SPECS[questionId] ?? null
}

/** The spec whose items use this id prefix (`seg` → segments). */
export function specForPrefix(prefix: string): EntitySpec | null {
  return Object.values(ENTITY_SPECS).find((spec) => spec.id_prefix === prefix) ?? null
}

type Result<T> = { ok: true; value: T } | { ok: false; message: string }

/** Owner-facing input format, shown in errors, the interview and `--help`. */
export function entityFormat(spec: EntitySpec): string {
  const positional = spec.fields.map((field) => (field.kind === 'choice' ? `${field.key} (${(field.options ?? []).join('/')})` : field.key)).join(' | ')
  const links = spec.links.length ? ` [| links: ${spec.links.map((id) => `${ENTITY_SPECS[id]?.id_prefix ?? '?'}-1`).join(', ')}]` : ''
  const sources = spec.sources ? ' [| sources: business.offer.summary, kn_…, ev-0001, https://…]' : ''
  return `one ${spec.item_label.en.toLowerCase()} per line or ;: [${spec.id_prefix}-N:] ${positional}${links}${sources}. Only the name is required.`
}

function fail<T>(spec: EntitySpec, message: string): Result<T> {
  return { ok: false, message: `${message} Format: ${entityFormat(spec)} Or answer unknown or skip.` }
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/
// Turkish `dolar`/`avro`/`lira` take suffixes (`2000 lirası`), so they need no trailing boundary; `تومن` is spoken Persian.
const AMOUNT =
  /[$€£¥₺﷼₹₽₩₪]|\d[\d.,]*\s*(?:(?:usd|eur|gbp|try|tl|irr|irt|toman|tomans|rial|rials|dollars?|euros?)\b|lira|dolar|avro)|\b(?:usd|eur|gbp|try|tl|irr|irt)\s*\d|تومان|تومن|ریال|لیر|دلار|یورو/i

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function itemIdPattern(prefix: string): RegExp {
  return new RegExp(`^${prefix}-([1-9]\\d{0,4})$`)
}

const LINK_ID = /^([a-z]{2,8})-([1-9]\d{0,4})$/

function checkField(spec: EntitySpec, field: EntityFieldSpec, raw: unknown, where: string): Result<string | null> {
  if (raw === undefined || raw === null || raw === '') {
    if (field.required) return fail(spec, `${where} needs a ${field.key}.`)
    return { ok: true, value: null }
  }
  if (typeof raw !== 'string') return fail(spec, `${where}: ${field.key} must be text.`)
  if (CONTROL.test(raw)) return fail(spec, `${where}: ${field.key} contains control characters.`)
  const value = cleanText(raw)
  if (!value) {
    if (field.required) return fail(spec, `${where} needs a ${field.key}.`)
    return { ok: true, value: null }
  }
  if (field.kind === 'choice') {
    const option = (field.options ?? []).find((candidate) => candidate === value.toLowerCase().replace(/[\s-]+/g, '_'))
    if (!option) return fail(spec, `${where}: ${field.key} “${value}” must be one of ${(field.options ?? []).join(', ')}.`)
    return { ok: true, value: option }
  }
  if (field.kind === 'number' || field.kind === 'date') return checkMeasure(spec, field, value, where)
  if (field.refuse && field.refuse.pattern.test(asciiDigits(value))) return fail(spec, `${where}: ${field.key} ${field.refuse.message}`)
  if (value.length > field.max) return fail(spec, `${where}: ${field.key} is at most ${field.max} characters.`)
  if (spec.no_amounts && AMOUNT.test(asciiDigits(value))) {
    return fail(spec, `${where}: ${field.key} looks like a money amount. Cost items name what costs money, never how much; amounts belong in the restricted business.finance.costs answer.`)
  }
  return { ok: true, value }
}

/**
 * Visual V3.3: a number is stored as its canonical decimal (`012.50` → `12.5`; Persian and Arabic digits and the
 * Arabic decimal separator are accepted). Thousands separators are refused rather than guessed. A date is a real
 * calendar day, `YYYY-MM-DD`.
 */
function checkMeasure(spec: EntitySpec, field: EntityFieldSpec, value: string, where: string): Result<string | null> {
  const ascii = asciiDigits(value).replace(/[٫]/g, '.').replace(/\s+/g, '')
  if (field.kind === 'date') {
    const at = /^\d{4}-\d{2}-\d{2}$/.test(ascii) ? Date.parse(`${ascii}T00:00:00Z`) : Number.NaN
    const ok = Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === ascii
    return ok ? { ok: true, value: ascii } : fail(spec, `${where}: ${field.key} “${value}” must be a date such as 2026-11-30.`)
  }
  if (!/^-?\d{1,12}(?:\.\d{1,4})?$/.test(ascii)) return fail(spec, `${where}: ${field.key} “${value}” must be a plain number such as 40 or 12.5 (no thousands separators, no unit).`)
  return { ok: true, value: String(Number(ascii)) }
}

function checkLinks(spec: EntitySpec, raw: unknown, where: string, fields: Record<string, string> = {}): Result<string[]> {
  if (raw === undefined || raw === null) return { ok: true, value: [] }
  if (!Array.isArray(raw)) return fail(spec, `${where}: links must be a list of item ids.`)
  // Visual V3.2: a rule choice (TOWS type) narrows the targets; without the choice every `links` target is allowed.
  const ruled = spec.link_rule ? spec.link_rule.targets[fields[spec.link_rule.field] ?? ''] : undefined
  const allowed = new Set((ruled ?? spec.links).map((id) => ENTITY_SPECS[id]?.id_prefix).filter((prefix): prefix is string => Boolean(prefix)))
  const out: string[] = []
  for (const link of raw) {
    const id = typeof link === 'string' ? link.trim().toLowerCase() : ''
    const match = id.match(LINK_ID)
    if (!match) return fail(spec, `${where}: link “${String(link)}” is not an item id such as seg-1.`)
    if (!allowed.has(match[1] ?? '')) {
      if (ruled && spec.link_rule) {
        return fail(spec, `${where}: ${fields[spec.link_rule.field]!.toUpperCase()} items link only to ${[...allowed].map((prefix) => `${prefix}-…`).join(', ')}.`)
      }
      return fail(spec, allowed.size ? `${where}: ${spec.item_label.en.toLowerCase()}s may link only to ${[...allowed].map((prefix) => `${prefix}-…`).join(', ')}.` : `${where}: ${spec.item_label.en.toLowerCase()}s have no links.`)
    }
    if (!out.includes(id)) out.push(id)
  }
  const maxLinks = spec.max_links ?? ENTITY_LIMITS.links
  if (out.length > maxLinks) return fail(spec, `${where}: at most ${maxLinks} link${maxLinks === 1 ? '' : 's'}.`)
  return { ok: true, value: out }
}

/** Visual V3.2: source reference forms. Ids are checked for form only; readers resolve them and never guess. */
const SOURCE_FACT = /^(?:brand|business|personal)\.[a-z0-9_]+(?:\.[a-z0-9_]+){1,4}$/
const SOURCE_NOTE = /^kn_[a-z0-9][a-z0-9-]{2,63}$/
const SOURCE_EVIDENCE = /^ev-\d{4,6}$/

export type SourceRefKind = 'fact' | 'knowledge' | 'evidence' | 'web'

/** The kind of a stored source reference, or null when it is not one of the four forms. */
export function sourceRefKind(ref: string): SourceRefKind | null {
  if (SOURCE_FACT.test(ref)) return 'fact'
  if (SOURCE_NOTE.test(ref)) return 'knowledge'
  if (SOURCE_EVIDENCE.test(ref)) return 'evidence'
  if (/^https:\/\//i.test(ref)) {
    try {
      const url = new URL(ref)
      if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) return null
      return 'web'
    } catch {
      return null
    }
  }
  return null
}

function checkSources(spec: EntitySpec, raw: unknown, where: string): Result<string[]> {
  if (raw === undefined || raw === null) return { ok: true, value: [] }
  if (!spec.sources) return fail(spec, `${where}: ${spec.item_label.en.toLowerCase()}s do not take sources.`)
  if (!Array.isArray(raw)) return fail(spec, `${where}: sources must be a list.`)
  const out: string[] = []
  for (const entry of raw) {
    const ref = typeof entry === 'string' ? entry.trim() : ''
    const normalized = /^https:/i.test(ref) ? ref : ref.toLowerCase()
    if (!normalized || normalized.length > ENTITY_LIMITS.source_length || CONTROL.test(normalized) || /\s/.test(normalized) || !sourceRefKind(normalized)) {
      return fail(spec, `${where}: source “${String(entry).slice(0, 80)}” must be an answer id (business.offer.summary), a knowledge note (kn_…), an evidence record (ev-0001) or an https link without a user name or password.`)
    }
    if (!out.includes(normalized)) out.push(normalized)
  }
  if (out.length > ENTITY_LIMITS.sources) return fail(spec, `${where}: at most ${ENTITY_LIMITS.sources} sources.`)
  return { ok: true, value: out }
}

/** Validates a parsed list and returns it in canonical order. Shared by every input path. */
export function validateEntityList(spec: EntitySpec, input: { question?: unknown; next?: unknown; items?: unknown }): Result<EntityList> {
  if (input.question !== spec.question_id) return fail(spec, `This list belongs to ${String(input.question)}, not ${spec.question_id}.`)
  if (!Array.isArray(input.items) || input.items.length === 0) return fail(spec, 'A list needs at least one item. To say there are none, answer not relevant or unknown.')
  if (input.items.length > spec.max_items) return fail(spec, `At most ${spec.max_items} items.`)
  const pattern = itemIdPattern(spec.id_prefix)
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  let highest = 0
  const items: EntityItem[] = []
  for (const [index, raw] of (input.items as unknown[]).entries()) {
    const where = `Item ${index + 1}`
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail(spec, `${where} is not an object.`)
    const record = raw as Record<string, unknown>
    const allowedKeys = new Set(['id', 'links', ...(spec.sources ? ['sources'] : []), ...spec.fields.map((field) => field.key)])
    const unknown = Object.keys(record).find((key) => !allowedKeys.has(key))
    if (unknown) return fail(spec, `${where} has an unknown field “${unknown}”. Fields: ${spec.fields.map((field) => field.key).join(', ')}.`)
    const id = typeof record.id === 'string' ? record.id : ''
    const match = id.match(pattern)
    if (!match) return fail(spec, `${where} needs an id such as ${spec.id_prefix}-1.`)
    if (seenIds.has(id)) return fail(spec, `${where}: id ${id} is listed twice.`)
    seenIds.add(id)
    highest = Math.max(highest, Number(match[1]))
    const fields: Record<string, string> = {}
    for (const field of spec.fields) {
      const checked = checkField(spec, field, record[field.key], `${where} (${id})`)
      if (!checked.ok) return checked
      if (checked.value !== null) fields[field.key] = checked.value
    }
    const nameKey = (fields.name ?? '').toLocaleLowerCase()
    if (seenNames.has(nameKey)) return fail(spec, `${where}: “${fields.name}” is listed twice.`)
    seenNames.add(nameKey)
    const links = checkLinks(spec, record.links, `${where} (${id})`, fields)
    if (!links.ok) return links
    const sources = checkSources(spec, record.sources, `${where} (${id})`)
    if (!sources.ok) return sources
    items.push({ id, fields, links: links.value, ...(sources.value.length ? { sources: sources.value } : {}) })
  }
  const next = typeof input.next === 'number' && Number.isInteger(input.next) ? input.next : highest + 1
  if (next <= highest || next > 99999) return fail(spec, `next must be greater than every item number (${highest}).`)
  return { ok: true, value: { question: spec.question_id, next, items } }
}

/** The canonical stored string. Field order follows the spec; empty optional fields and empty links are left out. */
export function serializeEntityList(spec: EntitySpec, list: EntityList): string {
  const items = list.items.map((item) => {
    const out: Record<string, unknown> = { id: item.id }
    for (const field of spec.fields) if (item.fields[field.key] !== undefined) out[field.key] = item.fields[field.key]
    if (item.links.length) out.links = [...item.links]
    if (item.sources?.length) out.sources = [...item.sources]
    return out
  })
  return JSON.stringify({ schema: ENTITY_LIST_SCHEMA, question: spec.question_id, next: list.next, items })
}

function parseCanonical(spec: EntitySpec, value: string): Result<EntityList> | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{')) return null
  let raw: unknown
  try {
    raw = JSON.parse(trimmed)
  } catch {
    return fail(spec, 'The list is not valid JSON.')
  }
  const record = raw as { schema?: unknown; question?: unknown; next?: unknown; items?: unknown } | null
  if (!record || typeof record !== 'object' || record.schema !== ENTITY_LIST_SCHEMA) return fail(spec, `The list needs schema ${ENTITY_LIST_SCHEMA}.`)
  return validateEntityList(spec, record)
}

function splitItems(raw: string): string[] {
  return raw
    .split(/[;؛\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * Owner text → list. One item per line (or `;`): `name | detail | category | links: seg-1, seg-2`, with an optional
 * leading `seg-2:` to keep or address an id. An item without an id keeps the id of the previous item with the same
 * name, so re-typing a list does not re-number it; anything else gets the next free id.
 */
export function parseEntityLines(spec: EntitySpec, raw: string, previous: EntityList | null): Result<EntityList> {
  const lines = splitItems(raw)
  if (lines.length === 0) return fail(spec, 'No items found.')
  if (lines.length > spec.max_items) return fail(spec, `At most ${spec.max_items} items.`)
  const byName = new Map((previous?.items ?? []).map((item) => [(item.fields.name ?? '').toLocaleLowerCase(), item.id]))
  const idHead = new RegExp(`^(${spec.id_prefix}-[1-9]\\d{0,4})\\s*:\\s*`, 'i')
  let next = previous?.next ?? 1
  const drafts: Array<Record<string, unknown>> = []
  const used = new Set<string>()
  for (const line of lines) {
    let rest = line
    let id: string | null = null
    const head = rest.match(idHead)
    if (head) {
      id = (head[1] ?? '').toLowerCase()
      rest = rest.slice(head[0].length)
    }
    const parts = rest.split('|').map((part) => part.trim())
    let links: string[] | undefined
    let sources: string[] | undefined
    // Trailing `links: …` and (V3.2) `sources: …` parts, in either order.
    for (let guard = 0; guard < 2 && parts.length > 1; guard += 1) {
      const last = parts[parts.length - 1] ?? ''
      const linkMatch = links === undefined ? last.match(/^(?:links?|→|->)\s*:?\s*(.*)$/i) : null
      const sourceMatch = sources === undefined ? last.match(/^(?:sources?)\s*:\s*(.*)$/i) : null
      if (linkMatch) links = (linkMatch[1] ?? '').split(/[,،\s]+/).map((part) => part.trim()).filter(Boolean)
      else if (sourceMatch) sources = (sourceMatch[1] ?? '').split(/[,،\s]+/).map((part) => part.trim()).filter(Boolean)
      else break
      parts.pop()
    }
    if (parts.length > spec.fields.length) return fail(spec, `“${line}” has more parts than ${spec.fields.map((field) => field.key).join(' | ')}.`)
    const record: Record<string, unknown> = {}
    spec.fields.forEach((field, index) => {
      const part = parts[index]
      if (part !== undefined && part !== '' && part !== '-') record[field.key] = part
    })
    const name = cleanText(String(record.name ?? '')).toLocaleLowerCase()
    id ??= byName.get(name) ?? null
    if (id && used.has(id)) id = null
    if (!id) {
      id = `${spec.id_prefix}-${next}`
      next += 1
    }
    used.add(id)
    drafts.push({ id, ...record, ...(links ? { links } : {}), ...(sources ? { sources } : {}) })
  }
  const highest = Math.max(0, ...[...used].map((id) => Number(id.split('-')[1])))
  return validateEntityList(spec, { question: spec.question_id, next: Math.max(next, highest + 1), items: drafts })
}

/** Validates an owner's answer (canonical JSON or lines) and returns the canonical stored string. */
export function normalizeEntityAnswer(spec: EntitySpec, raw: string, previous: unknown = null): Result<string> {
  const value = raw.trim()
  if (!value) return { ok: false, message: 'Empty answer. Use unknown or skip.' }
  const canonical = parseCanonical(spec, value)
  const prior = readEntityList(spec, previous)
  const parsed = canonical ?? parseEntityLines(spec, value, prior.state === 'items' ? prior.list : null)
  if (!parsed.ok) return parsed
  return { ok: true, value: serializeEntityList(spec, parsed.value) }
}

/** Reads a stored value. Never throws and never rewrites: anything that is not a canonical list is legacy. */
export function readEntityList(spec: EntitySpec, value: unknown): EntityRead {
  if (value === null || value === undefined || value === '') return { state: 'empty' }
  if (typeof value !== 'string') return { state: 'legacy', text: JSON.stringify(value) }
  const parsed = parseCanonical(spec, value)
  if (parsed?.ok) return { state: 'items', list: parsed.value }
  return { state: 'legacy', text: value }
}

/** True when a stored value is already the canonical string (normalizing it changes nothing). */
export function isCanonicalEntityValue(spec: EntitySpec, value: unknown): boolean {
  const read = readEntityList(spec, value)
  return read.state === 'items' && serializeEntityList(spec, read.list) === value
}

// ---- item operations (add, edit, move, remove) -------------------------------------------------------------

export type EntityOperation =
  | { op: 'add'; fields: Record<string, string>; links?: string[]; sources?: string[]; position?: number }
  | { op: 'edit'; id: string; fields: Record<string, string>; links?: string[]; sources?: string[] }
  | { op: 'move'; id: string; position: number }
  | { op: 'remove'; id: string }

export const ENTITY_OPERATIONS = ['add', 'edit', 'move', 'remove'] as const

/**
 * Applies one operation to the current list and returns the new canonical list. Pure: the caller records the result
 * through the normal interview change flow (a draft, or a change proposal when the list is approved).
 */
export function applyEntityOperation(spec: EntitySpec, current: EntityList | null, operation: EntityOperation): Result<{ list: EntityList; value: string; item_id: string }> {
  const items: EntityItem[] = (current?.items ?? []).map((item) => ({ id: item.id, fields: { ...item.fields }, links: [...item.links], ...(item.sources ? { sources: [...item.sources] } : {}) }))
  let next = current?.next ?? 1
  const find = (id: string): number => items.findIndex((item) => item.id === id.trim().toLowerCase())
  const keys = new Set(spec.fields.map((field) => field.key))
  const unknownKey = 'fields' in operation ? Object.keys(operation.fields).find((key) => !keys.has(key)) : undefined
  if (unknownKey) return fail(spec, `Unknown field “${unknownKey}”. Fields: ${spec.fields.map((field) => field.key).join(', ')}.`)
  let itemId: string
  switch (operation.op) {
    case 'add': {
      itemId = `${spec.id_prefix}-${next}`
      next += 1
      const at = operation.position === undefined ? items.length : Math.min(Math.max(Math.trunc(operation.position) - 1, 0), items.length)
      items.splice(at, 0, { id: itemId, fields: { ...operation.fields }, links: operation.links ?? [], ...(operation.sources?.length ? { sources: operation.sources } : {}) })
      break
    }
    case 'edit': {
      const index = find(operation.id)
      if (index === -1) return fail(spec, `No item ${operation.id}.`)
      const item = items[index]!
      itemId = item.id
      for (const [key, value] of Object.entries(operation.fields)) {
        if (value.trim() === '') delete item.fields[key]
        else item.fields[key] = value
      }
      if (operation.links !== undefined) item.links = operation.links
      if (operation.sources !== undefined) {
        if (operation.sources.length) item.sources = operation.sources
        else delete item.sources
      }
      break
    }
    case 'move': {
      const index = find(operation.id)
      if (index === -1) return fail(spec, `No item ${operation.id}.`)
      if (!Number.isInteger(operation.position) || operation.position < 1 || operation.position > items.length) return fail(spec, `Position must be 1 to ${items.length}.`)
      const [item] = items.splice(index, 1)
      items.splice(operation.position - 1, 0, item!)
      itemId = item!.id
      break
    }
    case 'remove': {
      const index = find(operation.id)
      if (index === -1) return fail(spec, `No item ${operation.id}.`)
      if (items.length === 1) return fail(spec, `${operation.id} is the last item. To say there are none, answer not relevant or unknown instead.`)
      itemId = items[index]!.id
      items.splice(index, 1)
      break
    }
  }
  const checked = validateEntityList(spec, { question: spec.question_id, next, items: items.map((item) => ({ id: item.id, ...item.fields, ...(item.links.length ? { links: item.links } : {}), ...(item.sources?.length ? { sources: item.sources } : {}) })) })
  if (!checked.ok) return checked
  return { ok: true, value: { list: checked.value, value: serializeEntityList(spec, checked.value), item_id: itemId } }
}

// ---- display ------------------------------------------------------------------------------------------------

type Lang = 'en' | 'fa' | 'tr'

/** Localized label of a choice value (`primary` → "Primary"); the stored value when it has no label. */
export function entityOptionLabel(spec: EntitySpec, key: string, value: string, lang: Lang = 'en'): string {
  const field = spec.fields.find((candidate) => candidate.key === key)
  return field?.option_labels?.[value]?.[lang] ?? value
}

/** One readable line per item (`seg-1 · Independent cafés — needs … · Primary → act-2`). Values are never translated. */
export function entityLines(spec: EntitySpec, list: EntityList, lang: Lang = 'en'): string[] {
  return list.items.map((item, index) => {
    const extras = spec.fields
      .slice(1)
      .filter((field) => item.fields[field.key] !== undefined)
      .map((field) => (field.kind === 'choice' ? entityOptionLabel(spec, field.key, item.fields[field.key]!, lang) : item.fields[field.key]!))
    return `${index + 1}. ${item.id} · ${item.fields.name ?? ''}${extras.length ? ` — ${extras.join(' · ')}` : ''}${item.links.length ? ` → ${item.links.join(', ')}` : ''}${item.sources?.length ? ` [${item.sources.join(', ')}]` : ''}`
  })
}
