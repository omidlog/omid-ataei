import { detectChannels } from '../content-bridge/sources.js'
import { detectLocale } from '../llm/rules.js'
import { asciiDigits } from '../structured.js'
import { MAX_DELIVERABLE_COUNT, TASK_LOCALES, TASK_TYPES, type TaskLocale, type TaskType } from './model.js'

/**
 * The deterministic task classifier: en, fa and tr keywords, no model, no network.
 *
 * - Strong cues are task nouns (`instagram`, `website`, `logo`, `ad`, `پست`, `سایت`, `reklam`). Weak cues are verbs
 *   that fit every task (`design`, `make`, `طراحی`, `tasarım`) and never decide a type on their own.
 * - Zero strong cues, or a tie between two types, returns `need_task_type`. The engine does not guess a task.
 * - The request text is used here and nowhere else: it is not stored, not logged and not echoed into the pack.
 *   An LLM classification path is deliberately absent in v1.
 */

export interface TaskIntent {
  status: 'ok'
  task_type: TaskType
  /** Only a count the request states, bounded. Never a default count. */
  deliverable_count: number | null
  channel: string | null
  locale: TaskLocale
  /** Which cue decided the type, for the CLI to show. Never the request text. */
  matched: string[]
}

export interface TaskIntentGap {
  status: 'need_task_type'
  reason: string
  locale: TaskLocale
  /** Types that tied, when a tie is why this is a gap. */
  candidates: TaskType[]
}

type Cue = [TaskType, RegExp]

/** Weight 2. A noun that names the deliverable. */
const STRONG: Cue[] = [
  ['social_batch', /\b(?:instagram|insta|reels?|carousels?|stories|social(?:\s|-)?media|posts?)\b/i],
  ['social_batch', /اینستاگرام|اینستا|پست|استوری|کاروسل|شبکه\s*اجتماعی|ریلز/u],
  ['social_batch', /\b(?:gönderi|paylaşım|sosyal\s*medya)\b/i],
  ['website_design', /\b(?:website|web\s?site|webpage|landing\s?page|homepage|sitemap)\b/i],
  ['website_design', /وب‌?سایت|وبسایت|سایت|لندینگ|صفحهٔ?\s*فرود/u],
  ['website_design', /\b(?:web\s?sitesi|açılış\s?sayfası)\b/i],
  ['product_ui', /\b(?:ui|ux|interface|app\s?screens?|dashboard|onboarding\s?flow|component\s?library)\b/i],
  ['product_ui', /رابط\s*کاربری|اپلیکیشن|صفحهٔ?\s*اپ|داشبورد/u],
  ['product_ui', /\b(?:arayüz|uygulama\s?ekranı|gösterge\s?paneli)\b/i],
  ['paid_campaign_brief', /\b(?:ads?|advert(?:s|ising|isement)?|campaigns?|paid\s?(?:media|social|search)|ppc)\b/i],
  ['paid_campaign_brief', /تبلیغ|کمپین|آگهی/u],
  ['paid_campaign_brief', /\b(?:reklam|kampanya)\b/i],
  ['brand_identity', /\b(?:logos?|wordmark|brand\s?identity|visual\s?identity|rebrand(?:ing)?)\b/i],
  ['brand_identity', /لوگو|هویت\s*(?:برند|بصری)|ری\s?برند/u],
  ['brand_identity', /\b(?:logo|marka\s?kimliği|görsel\s?kimlik)\b/i],
  ['personal_content', /\b(?:bio|biography|resume|cv|about\s?me|speaker\s?(?:kit|profile)|personal\s?(?:brand|site|page))\b/i],
  ['personal_content', /رزومه|بیوگرافی|زندگی‌?نامه|درباره\s*من|برند\s*شخصی|سخنران/u],
  ['personal_content', /\b(?:özgeçmiş|biyografi|hakkımda|kişisel\s?marka|konuşmacı)\b/i],
  ['visual_design', /\b(?:visuals?|graphics?|posters?|banners?|flyers?|illustrations?|key\s?visual)\b/i],
  ['visual_design', /گرافیک|طرح\s*گرافیکی|بنر|پوستر|تصویرسازی|ویژوال/u],
  ['visual_design', /\b(?:görsel|afiş|poster|banner|grafik)\b/i],
]

/** Weight 1. Fits any task, so it only breaks nothing and adds no decision on its own. */
const WEAK: RegExp[] = [/\b(?:design|create|make|build|draft|produce|need|want)\b/i, /بساز|طراحی|درست\s*کن|می‌?خواهم|لازم\s*دارم|بنویس/u, /\b(?:tasarla|oluştur|yap|hazırla|istiyorum)\b/i]

/** `\b` is ASCII-only, so a Persian word needs its own boundaries. */
function word(text: string): RegExp {
  return new RegExp(`(?:^|[\\s،؛,.:(\\-])${text}(?=[\\s،؛,.:)\\-]|$)`, 'u')
}

const COUNT_WORDS: Array<[number, RegExp[]]> = [
  [1, [/\b(?:one|a|an|single)\b/i, word('یک'), /\bbir\b/i]],
  [2, [/\btwo\b/i, word('دو'), /\biki\b/i]],
  [3, [/\bthree\b/i, word('سه'), /\büç\b/i]],
  [5, [/\bfive\b/i, word('پنج'), /\bbeş\b/i]],
  // Turkish "on" (ten) is left out on purpose: it is also an English preposition, so it would miscount.
  [10, [/\bten\b/i, word('ده')]],
]

function countIn(text: string): number | null {
  const digits = asciiDigits(text).match(/(?:^|\D)(\d{1,3})(?:\D|$)/)
  if (digits) {
    const value = Number(digits[1])
    if (Number.isInteger(value) && value >= 1 && value <= MAX_DELIVERABLE_COUNT) return value
    return null
  }
  for (const [value, patterns] of COUNT_WORDS) if (patterns.some((pattern) => pattern.test(text))) return value
  return null
}

function locale(text: string): TaskLocale {
  const detected = detectLocale(text)
  return (TASK_LOCALES as readonly string[]).includes(detected) ? (detected as TaskLocale) : 'en'
}

/**
 * Classifies a free-form request. Deterministic for the same input; the only inputs are the text and the optional
 * locale hint the caller gave.
 */
export function classifyTask(request: string, localeHint?: TaskLocale): TaskIntent | TaskIntentGap {
  const text = request.normalize('NFC').slice(0, 500)
  const at = localeHint ?? locale(text)
  if (!text.trim()) return { status: 'need_task_type', reason: 'empty_request', locale: at, candidates: [] }
  const scores = new Map<TaskType, number>()
  const matched: string[] = []
  for (const [type, pattern] of STRONG) {
    const hit = text.match(pattern)
    if (!hit) continue
    scores.set(type, (scores.get(type) ?? 0) + 2)
    matched.push(hit[0].trim().toLowerCase())
  }
  const weak = WEAK.some((pattern) => pattern.test(text))
  if (scores.size === 0) {
    return { status: 'need_task_type', reason: weak ? 'no_task_noun' : 'no_task_cue', locale: at, candidates: [] }
  }
  const best = Math.max(...scores.values())
  const leaders = [...scores.entries()].filter(([, score]) => score === best).map(([type]) => type)
  if (leaders.length > 1) {
    return { status: 'need_task_type', reason: 'ambiguous', locale: at, candidates: TASK_TYPES.filter((type) => leaders.includes(type)) }
  }
  const type = leaders[0]!
  // A channel is only meaningful where the task has one. "Build our website" names a task, not a channel.
  const channels = type === 'social_batch' || type === 'paid_campaign_brief' ? detectChannels(text) : []
  return {
    status: 'ok',
    task_type: type,
    deliverable_count: countIn(text),
    channel: channels[0] ?? null,
    locale: at,
    matched: [...new Set(matched)].slice(0, 6),
  }
}
