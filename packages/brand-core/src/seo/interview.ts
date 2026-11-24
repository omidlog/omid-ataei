/**
 * The SEO strategy interview: closed-vocabulary questions that branch on what the brand actually has.
 *
 * Every question says why it is asked and which decision it informs. A question that does not apply is skipped with
 * the reason (no website → no site-structure questions). `unknown` is always a real answer and is never filled in.
 * Budget is never asked: spend is restricted owner input and is not needed for an organic search strategy.
 */

export const UNKNOWN = 'unknown'

export type AnswerValue = string | string[]
export type Answers = Record<string, AnswerValue | undefined>

export type Stage = 'presence' | 'market' | 'resources' | 'measurement' | 'discovery'

export interface SeoQuestion {
  id: string
  stage: Stage
  prompt: { en: string; fa: string; tr: string }
  why_it_matters: string
  decision_informed: string
  /** Closed choices; null for a short free list (locales, competitor names). */
  choices: readonly string[] | null
  multi: boolean
  depends_on: string[]
  /** Null when the question applies; otherwise why it is skipped. */
  skip(answers: Answers): string | null
  evidence_needed: string | null
  priority: number
}

const web = (a: Answers) => single(a['seo.presence.web'])
const app = (a: Answers) => single(a['seo.presence.app'])
const hasWeb = (a: Answers) => web(a) !== undefined && web(a) !== 'none'
const hasApp = (a: Answers) => app(a) !== undefined && app(a) !== 'none'

export function single(value: AnswerValue | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export function list(value: AnswerValue | undefined): string[] {
  if (value === undefined) return []
  return (Array.isArray(value) ? value : [value]).filter((item) => item !== UNKNOWN)
}

const always = () => null
const needsWeb = (a: Answers) => (web(a) === undefined ? 'Waiting for seo.presence.web.' : hasWeb(a) ? null : 'The brand has no website, so there is no site to configure.')

export const SEO_QUESTIONS: readonly SeoQuestion[] = [
  {
    id: 'seo.presence.web',
    stage: 'presence',
    prompt: {
      en: 'What website does the brand have today: none, a single landing page, a content site, a web app, or a shop?',
      fa: 'برند امروز چه وب‌سایتی دارد: هیچ، یک صفحهٔ فرود، سایت محتوایی، وب‌اپ یا فروشگاه؟',
      tr: 'Markanın bugün hangi web sitesi var: hiç, tek bir açılış sayfası, içerik sitesi, web uygulaması ya da mağaza?',
    },
    why_it_matters: 'Web search strategy for a brand without a site is a different strategy, not a smaller one.',
    decision_informed: 'Which strategy archetype applies (app-only, site-led, or both).',
    choices: ['none', 'landing_page', 'content_site', 'web_app', 'ecommerce'],
    multi: false,
    depends_on: [],
    skip: always,
    evidence_needed: 'The live URL, if any.',
    priority: 1,
  },
  {
    id: 'seo.presence.app',
    stage: 'presence',
    prompt: {
      en: 'Is there a mobile app, and on which stores?',
      fa: 'آیا اپ موبایل دارید و در کدام فروشگاه‌ها؟',
      tr: 'Bir mobil uygulama var mı, hangi mağazalarda?',
    },
    why_it_matters: 'Store search (ASO) and web search are different systems with different levers.',
    decision_informed: 'Whether store listings are the primary search surface.',
    choices: ['none', 'ios', 'android', 'ios_android'],
    multi: false,
    depends_on: [],
    skip: always,
    evidence_needed: 'Store listing URLs.',
    priority: 2,
  },
  {
    id: 'seo.business.model',
    stage: 'market',
    prompt: { en: 'Who buys: consumers, businesses, or both?', fa: 'چه کسی می‌خرد: مصرف‌کننده، کسب‌وکار یا هر دو؟', tr: 'Kim satın alıyor: tüketiciler, işletmeler ya da her ikisi?' },
    why_it_matters: 'B2B search is fewer, higher-intent queries across a buying committee; B2C is volume and immediacy.',
    decision_informed: 'Search intent model and which pages carry the strategy.',
    choices: ['b2c', 'b2b', 'both'],
    multi: false,
    depends_on: [],
    skip: always,
    evidence_needed: null,
    priority: 3,
  },
  {
    id: 'seo.goal.primary',
    stage: 'market',
    prompt: { en: 'What should search bring first: installs, sign-ups, leads, sales, or awareness?', fa: 'جست‌وجو اول چه چیزی باید بیاورد: نصب، ثبت‌نام، سرنخ فروش، فروش یا آگاهی؟', tr: 'Arama önce ne getirmeli: yükleme, kayıt, potansiyel müşteri, satış ya da bilinirlik?' },
    why_it_matters: 'The conversion defines which pages matter and what is measured.',
    decision_informed: 'Primary objective and leading indicators.',
    choices: ['app_installs', 'signups', 'leads', 'sales', 'awareness'],
    multi: false,
    depends_on: [],
    skip: always,
    evidence_needed: 'Current conversion definition.',
    priority: 4,
  },
  {
    id: 'seo.goal.timeframe',
    stage: 'market',
    prompt: { en: 'By when do you expect search to matter for that goal?', fa: 'انتظار دارید جست‌وجو تا چه زمانی برای این هدف اثر داشته باشد؟', tr: 'Aramanın bu hedef için ne zamana kadar etkili olmasını bekliyorsunuz?' },
    why_it_matters: 'Organic search is slow to show effects; an unrealistic horizon must be named, not accepted silently.',
    decision_informed: 'Whether the goal is feasible and what to do meanwhile.',
    choices: ['under_3_months', '3_to_12_months', 'over_12_months'],
    multi: false,
    depends_on: [],
    skip: always,
    evidence_needed: null,
    priority: 5,
  },
  {
    id: 'seo.market.locales',
    stage: 'market',
    prompt: { en: 'Which languages must people be able to find you in? (codes such as en, fa, tr)', fa: 'مردم باید به چه زبان‌هایی بتوانند شما را پیدا کنند؟ (کدهایی مانند en، fa، tr)', tr: 'İnsanlar sizi hangi dillerde bulabilmeli? (en, fa, tr gibi kodlar)' },
    why_it_matters: 'Each language is its own search market with its own queries and competitors.',
    decision_informed: 'Locale scope and, with a site, its structure.',
    choices: null,
    multi: true,
    depends_on: [],
    skip: always,
    evidence_needed: null,
    priority: 6,
  },
  {
    id: 'seo.web.locale_structure',
    stage: 'presence',
    prompt: { en: 'How are (or will) the language versions of the site be organised?', fa: 'نسخه‌های زبانی سایت چگونه سازمان‌دهی شده‌اند (یا می‌شوند)؟', tr: 'Sitenin dil sürümleri nasıl düzenleniyor (ya da düzenlenecek)?' },
    why_it_matters: 'Localized versions must be declared consistently; changing structure later is a migration.',
    decision_informed: 'International setup.',
    choices: ['single_language', 'subdirectories', 'subdomains', 'country_domains', 'undecided'],
    multi: false,
    depends_on: ['seo.presence.web', 'seo.market.locales'],
    skip: (a) => needsWeb(a) ?? (list(a['seo.market.locales']).length > 1 ? null : 'Only one language is in scope.'),
    evidence_needed: 'Current URL pattern per language.',
    priority: 7,
  },
  {
    id: 'seo.web.maturity',
    stage: 'presence',
    prompt: { en: 'Is the site new, established, or about to move domain or platform?', fa: 'سایت تازه است، جاافتاده است، یا در آستانهٔ انتقال دامنه یا پلتفرم؟', tr: 'Site yeni mi, oturmuş mu, yoksa alan adı ya da platform değişikliği mi yaklaşıyor?' },
    why_it_matters: 'A migration is the riskiest SEO event; a new site has no history to protect.',
    decision_informed: 'Whether migration safety comes before everything else.',
    choices: ['new', 'established', 'migrating'],
    multi: false,
    depends_on: ['seo.presence.web'],
    skip: needsWeb,
    evidence_needed: null,
    priority: 8,
  },
  {
    id: 'seo.web.control',
    stage: 'resources',
    prompt: { en: 'Can the team change titles, page text, redirects and robots rules on the site?', fa: 'آیا تیم می‌تواند عنوان‌ها، متن صفحه، ریدایرکت‌ها و قوانین robots سایت را تغییر دهد؟', tr: 'Ekip sitede başlıkları, sayfa metnini, yönlendirmeleri ve robots kurallarını değiştirebilir mi?' },
    why_it_matters: 'A plan that needs changes nobody can make is not a plan.',
    decision_informed: 'Which technical actions are feasible now.',
    choices: ['full', 'cms_limited', 'none'],
    multi: false,
    depends_on: ['seo.presence.web'],
    skip: needsWeb,
    evidence_needed: null,
    priority: 9,
  },
  {
    id: 'seo.data.search_console',
    stage: 'measurement',
    prompt: { en: 'Is the site verified in a search engine console (for example Google Search Console)? Do not paste any credentials.', fa: 'آیا سایت در کنسول موتور جست‌وجو (مثلاً Google Search Console) تأیید شده است؟ هیچ رمز یا کلیدی وارد نکنید.', tr: 'Site bir arama motoru konsolunda (örneğin Google Search Console) doğrulandı mı? Hiçbir kimlik bilgisi yapıştırmayın.' },
    why_it_matters: 'Without it there is no baseline: every search number in a plan would be invented.',
    decision_informed: 'Measurement plan and baseline.',
    choices: ['verified', 'not_set_up'],
    multi: false,
    depends_on: ['seo.presence.web'],
    skip: needsWeb,
    evidence_needed: 'An owner-made export, if verified.',
    priority: 10,
  },
  {
    id: 'seo.data.analytics',
    stage: 'measurement',
    prompt: { en: 'Is there any analytics that records the conversion?', fa: 'آیا ابزار تحلیلی هست که تبدیل را ثبت کند؟', tr: 'Dönüşümü kaydeden bir analitik var mı?' },
    why_it_matters: 'Search impressions are not outcomes; the conversion must be measurable.',
    decision_informed: 'Whether outcomes can be attributed at all.',
    choices: ['available', 'none'],
    multi: false,
    depends_on: [],
    skip: always,
    evidence_needed: null,
    priority: 11,
  },
  {
    id: 'seo.content.capacity',
    stage: 'resources',
    prompt: { en: 'How much new, useful content can the team really publish: none, a little (about two pieces a month), a steady flow, or a lot?', fa: 'تیم واقعاً چقدر محتوای تازه و مفید می‌تواند منتشر کند: هیچ، کم (حدود دو مطلب در ماه)، منظم یا زیاد؟', tr: 'Ekip gerçekte ne kadar yeni ve yararlı içerik yayınlayabilir: hiç, az (ayda yaklaşık iki), düzenli ya da çok?' },
    why_it_matters: 'Content-led strategies fail without production capacity.',
    decision_informed: 'Whether a content programme is feasible.',
    choices: ['none', 'low', 'medium', 'high'],
    multi: false,
    depends_on: [],
    skip: always,
    evidence_needed: null,
    priority: 12,
  },
  {
    id: 'seo.content.firsthand',
    stage: 'resources',
    prompt: { en: 'Does the brand have first-hand material others cannot copy: its own data, or real expertise?', fa: 'آیا برند مطالب دست‌اولی دارد که دیگران نمی‌توانند کپی کنند: دادهٔ خودش یا تخصص واقعی؟', tr: 'Markanın başkalarının kopyalayamayacağı birinci elden malzemesi var mı: kendi verisi ya da gerçek uzmanlık?' },
    why_it_matters: 'Differentiated, people-first material is what a content strategy can stand on.',
    decision_informed: 'Content differentiation and answer-worthiness.',
    choices: ['original_data', 'expertise', 'none'],
    multi: false,
    depends_on: [],
    skip: always,
    evidence_needed: 'Examples of the material.',
    priority: 13,
  },
  {
    id: 'seo.competitors.named',
    stage: 'market',
    prompt: { en: 'Which competitors or substitutes do people choose instead of you? Names only.', fa: 'مردم به‌جای شما کدام رقبا یا جایگزین‌ها را انتخاب می‌کنند؟ فقط نام.', tr: 'İnsanlar sizin yerinize hangi rakipleri ya da alternatifleri seçiyor? Yalnızca adlar.' },
    why_it_matters: 'Competitors are assumptions until their search presence is checked; names alone are not rankings.',
    decision_informed: 'Competitor assumptions to verify.',
    choices: null,
    multi: true,
    depends_on: [],
    skip: always,
    evidence_needed: 'A dated check of their search presence, if any.',
    priority: 14,
  },
  {
    id: 'seo.app.store_status',
    stage: 'presence',
    prompt: { en: 'Is the app live in the store, or not yet released?', fa: 'اپ در فروشگاه منتشر شده یا هنوز نه؟', tr: 'Uygulama mağazada yayında mı, yoksa henüz çıkmadı mı?' },
    why_it_matters: 'An unreleased product cannot be promised in search results or listings.',
    decision_informed: 'What can be claimed and when.',
    choices: ['live', 'prelaunch'],
    multi: false,
    depends_on: ['seo.presence.app'],
    skip: (a) => (app(a) === undefined ? 'Waiting for seo.presence.app.' : hasApp(a) ? null : 'There is no app.'),
    evidence_needed: 'Store listing URL.',
    priority: 15,
  },
  {
    id: 'seo.app.web_openness',
    stage: 'presence',
    prompt: { en: 'Would you build a small official website if search evidence supported it?', fa: 'اگر شواهد جست‌وجو پشتیبانی کند، یک وب‌سایت رسمی کوچک می‌سازید؟', tr: 'Arama kanıtları desteklerse küçük bir resmi web sitesi kurar mısınız?' },
    why_it_matters: 'Without a site, web search can only reach the brand through store pages and third parties.',
    decision_informed: 'Whether a minimal official site is an option.',
    choices: ['yes', 'no', 'later'],
    multi: false,
    depends_on: ['seo.presence.web', 'seo.presence.app'],
    skip: (a) => (web(a) === undefined ? 'Waiting for seo.presence.web.' : web(a) !== 'none' ? 'The brand already has a website.' : null),
    evidence_needed: null,
    priority: 16,
  },
  {
    id: 'seo.geo.interest',
    stage: 'discovery',
    prompt: { en: 'Does being found through AI answer engines (AI search features, chat assistants) matter for this brand?', fa: 'آیا دیده‌شدن در پاسخ‌های موتورهای هوش مصنوعی (قابلیت‌های جست‌وجوی هوش مصنوعی، دستیارهای گفت‌وگو) برای این برند مهم است؟', tr: 'Yapay zekâ yanıt motorlarında (yapay zekâ arama özellikleri, sohbet asistanları) bulunmak bu marka için önemli mi?' },
    why_it_matters: 'GEO work is only worth it where people ask assistants about this category.',
    decision_informed: 'Whether the plan includes an AI-discovery section.',
    choices: ['yes', 'no', 'unsure'],
    multi: false,
    depends_on: [],
    skip: always,
    evidence_needed: null,
    priority: 17,
  },
  {
    id: 'seo.geo.crawler_policy',
    stage: 'discovery',
    prompt: { en: 'What should AI crawlers be allowed to do with the site: search and training, search only, nothing, or undecided?', fa: 'خزنده‌های هوش مصنوعی اجازهٔ چه کاری با سایت داشته باشند: جست‌وجو و آموزش، فقط جست‌وجو، هیچ، یا هنوز تصمیم نگرفته‌اید؟', tr: 'Yapay zekâ tarayıcıları siteyle ne yapabilsin: arama ve eğitim, yalnızca arama, hiçbir şey ya da karar verilmedi?' },
    why_it_matters: 'Search visibility and model training are separate permissions; the owner decides, not the strategist.',
    decision_informed: 'Crawler access policy.',
    choices: ['allow_search_and_training', 'allow_search_block_training', 'block_all', 'undecided'],
    multi: false,
    depends_on: ['seo.presence.web', 'seo.geo.interest'],
    skip: (a) => needsWeb(a) ?? (single(a['seo.geo.interest']) === 'no' ? 'AI discovery is out of scope.' : null),
    evidence_needed: null,
    priority: 18,
  },
]

export const QUESTION_IDS = SEO_QUESTIONS.map((question) => question.id)

export function questionById(id: string): SeoQuestion | undefined {
  return SEO_QUESTIONS.find((question) => question.id === id)
}

const LOCALE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} .&'’-]{0,79}$/u

export class SeoError extends Error {
  constructor(
    readonly code: 'invalid_input' | 'not_found' | 'refused' | 'invalid_record' | 'wrong_brand',
    message: string,
  ) {
    super(message)
    this.name = 'SeoError'
  }
}

/** Validates one answer. `unknown` is always allowed and stays unknown. */
export function validateAnswer(id: string, value: unknown): AnswerValue {
  const question = questionById(id)
  if (!question) throw new SeoError('not_found', `No SEO question ${String(id).slice(0, 80)}.`)
  if (value === UNKNOWN || (Array.isArray(value) && value.length === 1 && value[0] === UNKNOWN)) return UNKNOWN
  if (question.multi) {
    const items = (Array.isArray(value) ? value : String(value ?? '').split(',')).map((item) => String(item).trim()).filter(Boolean)
    if (items.length === 0 || items.length > 10) throw new SeoError('invalid_input', `${id} takes 1 to 10 items.`)
    const pattern = id === 'seo.market.locales' ? LOCALE : NAME
    for (const item of items) if (!pattern.test(item)) throw new SeoError('invalid_input', `"${item.slice(0, 80)}" is not a valid item for ${id}.`)
    return [...new Set(items)]
  }
  if (typeof value !== 'string' || !question.choices?.includes(value)) throw new SeoError('invalid_input', `${id} must be one of ${[...(question.choices ?? []), UNKNOWN].join(', ')}.`)
  return value
}

export interface InterviewState {
  /** The one question to ask now, or null when the interview is complete. */
  next: { id: string; stage: Stage; prompt: SeoQuestion['prompt']; why_asked: string; decision_informed: string; choices: readonly string[] | null; multi: boolean } | null
  pending: string[]
  answered: string[]
  unknown: string[]
  skipped: Array<{ id: string; reason: string }>
  complete: boolean
  notice: string
}

export const INTERVIEW_NOTICE = 'One question at a time. "unknown" is a real answer and is never filled in. Budget is not asked: spend is restricted owner input and an organic search plan does not need it.'

/** Which questions apply given the answers so far, and the single next one to ask. */
export function interviewState(answers: Answers): InterviewState {
  const pending: SeoQuestion[] = []
  const answered: string[] = []
  const unknown: string[] = []
  const skipped: InterviewState['skipped'] = []
  for (const question of [...SEO_QUESTIONS].sort((a, b) => a.priority - b.priority)) {
    const reason = question.skip(answers)
    if (reason) {
      skipped.push({ id: question.id, reason })
      continue
    }
    const value = answers[question.id]
    if (value === undefined) pending.push(question)
    else {
      answered.push(question.id)
      if (value === UNKNOWN) unknown.push(question.id)
    }
  }
  const first = pending[0]
  return {
    next: first ? { id: first.id, stage: first.stage, prompt: first.prompt, why_asked: first.why_it_matters, decision_informed: first.decision_informed, choices: first.choices, multi: first.multi } : null,
    pending: pending.map((question) => question.id),
    answered,
    unknown,
    skipped,
    complete: pending.length === 0 && !skipped.some((item) => item.reason.startsWith('Waiting')),
    notice: INTERVIEW_NOTICE,
  }
}
