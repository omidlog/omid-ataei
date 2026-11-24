/**
 * Identity audit and logo brief (Identity Slice D): the owner's rebrand diagnosis and equity-preservation choices.
 *
 * This is a small typed record of closed-vocabulary answers. The owner's own words, and any recognition study, live
 * once in the Knowledge Inbox; the record cites their note id and revision, never the text. Nothing here is a brand
 * fact, a logo approval, a trademark statement or permission to change `brand.logo.*`, the name or an asset.
 */

export const UNKNOWN = 'unknown'

/** The identity path the owner confirms. The wizard's intake hint only pre-selects it. */
export const IDENTITY_PATHS = ['create', 'retain', 'evolve', 'rebrand', 'undecided'] as const
export type IdentityPath = (typeof IDENTITY_PATHS)[number]

/** Brief §3.5: the elements a rebrand audit looks at. */
export const EQUITY_COMPONENTS = ['name', 'logo_symbol', 'logo_wordmark', 'colors', 'typography', 'mascot', 'tone', 'tagline', 'imagery', 'other'] as const
export type EquityComponent = (typeof EQUITY_COMPONENTS)[number]

export const EQUITY_CHOICES = ['preserve', 'refine', 'replace', 'evaluate', 'unknown'] as const
export type EquityChoice = (typeof EQUITY_CHOICES)[number]

/**
 * How the owner knows an element is worth keeping. `measured_study` needs a cited Knowledge note (the study or its
 * summary); without one it is refused. A feeling of familiarity is `owner_reported`, a valid preference, not proof.
 */
export const EQUITY_EVIDENCE = ['measured_study', 'owner_reported', 'unknown'] as const
export type EquityEvidence = (typeof EQUITY_EVIDENCE)[number]

export type DiagnosisStage = 'path' | 'diagnosis' | 'rollout'

export interface DiagnosisQuestion {
  id: string
  stage: DiagnosisStage
  prompt: { en: string; fa: string; tr: string }
  why_it_matters: string
  choices: readonly string[]
  multi: boolean
  /** Paths this question applies to. Others skip it with a reason. */
  applies_to: readonly IdentityPath[]
  priority: number
}

const CHANGE_PATHS: readonly IdentityPath[] = ['evolve', 'rebrand', 'undecided']
const EXISTING_PATHS: readonly IdentityPath[] = ['retain', 'evolve', 'rebrand', 'undecided']
const ALL_PATHS: readonly IdentityPath[] = IDENTITY_PATHS

export const APPLICATIONS = ['app_icon', 'favicon', 'website_header', 'social_avatar', 'print', 'packaging', 'signage', 'motion', 'merchandise', 'email'] as const
export type Application = (typeof APPLICATIONS)[number]

/**
 * The owner diagnosis (brief §7 step 2). One question at a time, `unknown` is always a real answer, and nothing here
 * asks for budget, revenue or customer data.
 */
export const DIAGNOSIS_QUESTIONS: readonly DiagnosisQuestion[] = [
  {
    id: 'identity.path',
    stage: 'path',
    prompt: {
      en: 'What do you want to do with the brand identity: create a first one, keep the current one, evolve it, rebrand, or not decided yet?',
      fa: 'می‌خواهید با هویت برند چه کنید: اولین هویت را بسازید، هویت فعلی را نگه دارید، آن را تکامل دهید، برند را از نو بسازید، یا هنوز تصمیم نگرفته‌اید؟',
      tr: 'Marka kimliğiyle ne yapmak istiyorsunuz: ilk kimliği oluşturmak, mevcut olanı korumak, geliştirmek, yeniden markalaşmak mı, yoksa henüz karar vermediniz mi?',
    },
    why_it_matters: 'The wizard hint is only a starting point. The brief follows the path you confirm here.',
    choices: IDENTITY_PATHS,
    multi: false,
    applies_to: ALL_PATHS,
    priority: 0,
  },
  {
    id: 'identity.change.reasons',
    stage: 'diagnosis',
    prompt: {
      en: 'Why is a change being considered? Choose all that apply: new market, repositioning, the identity is not working, merger, readability, legal issue, looks outdated, personal dissatisfaction, other.',
      fa: 'چرا تغییر مطرح شده است؟ همهٔ موارد درست را انتخاب کنید: بازار جدید، جایگاه‌یابی دوباره، هویت فعلی کار نمی‌کند، ادغام، خوانایی، مسئلهٔ حقوقی، قدیمی به نظر می‌رسد، نارضایتی شخصی، دیگر.',
      tr: 'Değişiklik neden düşünülüyor? Uyanların hepsini seçin: yeni pazar, yeniden konumlandırma, kimlik işe yaramıyor, birleşme, okunabilirlik, hukuki sorun, eski görünüyor, kişisel memnuniyetsizlik, diğer.',
    },
    why_it_matters: 'The reason decides how much has to change. A readability problem rarely needs a new name.',
    choices: ['new_market', 'repositioning', 'identity_not_working', 'merger', 'readability', 'legal_issue', 'outdated', 'personal_dissatisfaction', 'other'],
    multi: true,
    applies_to: CHANGE_PATHS,
    priority: 10,
  },
  {
    id: 'identity.change.observed',
    stage: 'diagnosis',
    prompt: {
      en: 'Is the problem something you have observed (complaints, confusion, unreadable at small sizes), a personal preference, or both?',
      fa: 'آیا مشکل چیزی است که دیده‌اید (شکایت، سردرگمی، ناخوانا در اندازهٔ کوچک)، یک سلیقهٔ شخصی، یا هر دو؟',
      tr: 'Sorun gözlemlediğiniz bir şey mi (şikâyet, karışıklık, küçük boyutta okunmama), kişisel bir tercih mi, yoksa ikisi birden mi?',
    },
    why_it_matters: 'An observed failure can justify change; a preference alone often points to better usage rules instead.',
    choices: ['observed_problem', 'personal_preference', 'both'],
    multi: false,
    applies_to: CHANGE_PATHS,
    priority: 20,
  },
  {
    id: 'identity.success',
    stage: 'diagnosis',
    prompt: {
      en: 'What would success look like? Choose all that apply: recognizable at small sizes, consistent across channels, fits the new positioning, easier to produce, works in every script we use, customer feedback improves, the owner is satisfied.',
      fa: 'موفقیت چه شکلی دارد؟ همهٔ موارد درست را انتخاب کنید: در اندازهٔ کوچک قابل تشخیص، یکدست در همهٔ کانال‌ها، سازگار با جایگاه جدید، تولید آسان‌تر، کارکرد در همهٔ خط‌هایی که استفاده می‌کنیم، بهترشدن بازخورد مشتری، رضایت مالک.',
      tr: 'Başarı neye benzerdi? Uyanların hepsini seçin: küçük boyutta tanınır, tüm kanallarda tutarlı, yeni konumlandırmaya uygun, üretimi daha kolay, kullandığımız tüm yazı sistemlerinde çalışır, müşteri geri bildirimi iyileşir, sahibi memnun.',
    },
    why_it_matters: 'Success signals become the evaluation rubric. None of them is measured by this brief.',
    choices: ['small_size_recognition', 'channel_consistency', 'fits_positioning', 'easier_production', 'all_scripts', 'customer_feedback', 'owner_satisfaction'],
    multi: true,
    applies_to: ALL_PATHS,
    priority: 30,
  },
  {
    id: 'identity.must_not_change',
    stage: 'diagnosis',
    prompt: {
      en: 'What must not change? Choose all that apply (name, symbol, wordmark, colors, typography, mascot, tone, tagline, imagery), or none.',
      fa: 'چه چیزی نباید تغییر کند؟ همهٔ موارد درست را انتخاب کنید (نام، نماد، نوشتار لوگو، رنگ‌ها، تایپوگرافی، کاراکتر، لحن، شعار، تصویرسازی) یا هیچ‌کدام.',
      tr: 'Ne değişmemeli? Uyanların hepsini seçin (ad, sembol, yazı logosu, renkler, tipografi, maskot, ton, slogan, görsel dil) ya da hiçbiri.',
    },
    why_it_matters: 'These become preserve rows in the equity matrix and red lines for every route.',
    choices: ['name', 'logo_symbol', 'logo_wordmark', 'colors', 'typography', 'mascot', 'tone', 'tagline', 'imagery', 'none'],
    multi: true,
    applies_to: EXISTING_PATHS,
    priority: 40,
  },
  {
    id: 'identity.recognition',
    stage: 'diagnosis',
    prompt: {
      en: 'Do you have a recognition study or survey of the current identity, or is recognition your own impression?',
      fa: 'آیا مطالعه یا نظرسنجی‌ای دربارهٔ شناخته‌شدن هویت فعلی دارید، یا شناخته‌شدن برداشت خود شماست؟',
      tr: 'Mevcut kimliğin tanınırlığına dair bir çalışma veya anketiniz var mı, yoksa tanınırlık sizin kendi izleniminiz mi?',
    },
    why_it_matters: 'Without a study, recognition stays owner-reported. No recognition figure is ever invented.',
    choices: ['measured_study', 'owner_impression', 'none'],
    multi: false,
    applies_to: EXISTING_PATHS,
    priority: 50,
  },
  {
    id: 'identity.applications',
    stage: 'rollout',
    prompt: {
      en: 'Where will the logo actually be used? Choose all that apply: app icon, favicon, website header, social avatar, print, packaging, signage, motion, merchandise, email.',
      fa: 'لوگو واقعاً کجا استفاده می‌شود؟ همهٔ موارد درست را انتخاب کنید: آیکون اپ، فاوآیکون، سربرگ وب‌سایت، تصویر پروفایل شبکه‌های اجتماعی، چاپ، بسته‌بندی، تابلو، موشن، کالای تبلیغاتی، ایمیل.',
      tr: 'Logo gerçekte nerede kullanılacak? Uyanların hepsini seçin: uygulama simgesi, favicon, web sitesi başlığı, sosyal medya profil görseli, baskı, ambalaj, tabela, hareketli görsel, promosyon ürünü, e-posta.',
    },
    why_it_matters: 'Only real uses get application checks. An app-first brand needs a square icon long before signage.',
    choices: APPLICATIONS,
    multi: true,
    applies_to: ALL_PATHS,
    priority: 60,
  },
  {
    id: 'identity.scripts',
    stage: 'rollout',
    prompt: {
      en: 'Which writing systems must the wordmark or name work in? Latin, Persian/Arabic, other.',
      fa: 'نوشتار لوگو یا نام باید در کدام خط‌ها کار کند؟ لاتین، فارسی/عربی، دیگر.',
      tr: 'Yazı logosu veya ad hangi yazı sistemlerinde çalışmalı? Latin, Farsça/Arapça, diğer.',
    },
    why_it_matters: 'A right-to-left script changes wordmark, lockup and spacing decisions from the start.',
    choices: ['latin', 'perso_arabic', 'other'],
    multi: true,
    applies_to: ALL_PATHS,
    priority: 70,
  },
  {
    id: 'identity.rollout.constraints',
    stage: 'rollout',
    prompt: {
      en: 'What would make a change hard to roll out? Choose all that apply: printed stock, app store listing, signage, packaging, partner materials, none.',
      fa: 'چه چیزی اجرای تغییر را سخت می‌کند؟ همهٔ موارد درست را انتخاب کنید: موجودی چاپی، صفحهٔ اپ در فروشگاه، تابلو، بسته‌بندی، مواد همکاران، هیچ‌کدام.',
      tr: 'Bir değişikliği uygulamayı ne zorlaştırır? Uyanların hepsini seçin: basılı stok, uygulama mağazası sayfası, tabela, ambalaj, iş ortağı materyalleri, hiçbiri.',
    },
    why_it_matters: 'Migration cost and risk belong in the route trade-offs, not in a surprise after approval.',
    choices: ['printed_stock', 'app_store_listing', 'signage', 'packaging', 'partner_materials', 'none'],
    multi: true,
    applies_to: EXISTING_PATHS,
    priority: 80,
  },
]

export type AnswerValue = string | string[]
export type Answers = Record<string, AnswerValue | undefined>

export class IdentityError extends Error {
  constructor(
    readonly code: 'invalid_input' | 'not_found' | 'refused' | 'invalid_record' | 'wrong_brand',
    message: string,
  ) {
    super(message)
    this.name = 'IdentityError'
  }
}

export function questionById(id: string): DiagnosisQuestion | undefined {
  return DIAGNOSIS_QUESTIONS.find((q) => q.id === id)
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T
  throw new IdentityError('invalid_input', `${field} must be one of ${allowed.join(', ')}.`)
}

/** Validates one diagnosis answer. `unknown` is always allowed and stays unknown. */
export function validateAnswer(id: string, value: unknown): AnswerValue {
  const question = questionById(id)
  if (!question) throw new IdentityError('not_found', `No identity question ${String(id).slice(0, 80)}.`)
  if (value === UNKNOWN || (Array.isArray(value) && value.length === 1 && value[0] === UNKNOWN)) return UNKNOWN
  if (question.multi) {
    const items = (Array.isArray(value) ? value : String(value ?? '').split(',')).map((item) => String(item).trim()).filter(Boolean)
    if (!items.length) throw new IdentityError('invalid_input', `${id} needs at least one choice: ${[...question.choices, UNKNOWN].join(', ')}.`)
    for (const item of items) if (!question.choices.includes(item)) throw new IdentityError('invalid_input', `${id}: "${item.slice(0, 40)}" is not one of ${[...question.choices, UNKNOWN].join(', ')}.`)
    const unique = [...new Set(items)]
    if (unique.includes('none') && unique.length > 1) throw new IdentityError('invalid_input', `${id}: "none" cannot be combined with other choices.`)
    return unique
  }
  if (typeof value !== 'string' || !question.choices.includes(value)) throw new IdentityError('invalid_input', `${id} must be one of ${[...question.choices, UNKNOWN].join(', ')}.`)
  return value
}

export function single(value: AnswerValue | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export function list(value: AnswerValue | undefined): string[] {
  if (value === undefined || value === UNKNOWN) return []
  return (Array.isArray(value) ? value : [value]).filter((item) => item !== UNKNOWN && item !== 'none')
}

export interface DiagnosisState {
  path: IdentityPath | null
  next: { id: string; stage: DiagnosisStage; prompt: DiagnosisQuestion['prompt']; why_asked: string; choices: readonly string[]; multi: boolean } | null
  answered: string[]
  unknown: string[]
  pending: string[]
  skipped: Array<{ id: string; reason: string }>
  complete: boolean
}

/** Which diagnosis questions apply for the confirmed path, and the one to ask now. */
export function diagnosisState(answers: Answers): DiagnosisState {
  const raw = single(answers['identity.path'])
  const path = raw && raw !== UNKNOWN ? (raw as IdentityPath) : null
  const answered: string[] = []
  const unknown: string[] = []
  const pending: DiagnosisQuestion[] = []
  const skipped: DiagnosisState['skipped'] = []
  for (const q of [...DIAGNOSIS_QUESTIONS].sort((a, b) => a.priority - b.priority)) {
    if (q.id !== 'identity.path' && !path) {
      skipped.push({ id: q.id, reason: 'Waiting for identity.path.' })
      continue
    }
    if (path && !q.applies_to.includes(path)) {
      skipped.push({ id: q.id, reason: `Not asked for the ${path} path.` })
      continue
    }
    const value = answers[q.id]
    if (value === undefined) pending.push(q)
    else if (value === UNKNOWN) unknown.push(q.id)
    else answered.push(q.id)
  }
  const first = pending[0]
  return {
    path,
    next: first ? { id: first.id, stage: first.stage, prompt: first.prompt, why_asked: first.why_it_matters, choices: first.choices, multi: first.multi } : null,
    answered,
    unknown,
    pending: pending.map((q) => q.id),
    skipped,
    complete: pending.length === 0 && path !== null,
  }
}
