import type { EntityItem } from '../entities.js'
import { ILLUSTRATIVE_BRAND } from './fixtures.js'
import type { VisualLang } from './i18n.js'
import type { DataState, VisualDocument, VisualEntry } from './model.js'
import { journeyDocument, okrDocument, PLAN_QUESTIONS, sostacDocument, type PlanInput, type PlanSource } from './plan.js'

/**
 * ILLUSTRATIVE / MOCK DATA. Golden examples for the Visual V3.3 renderers: customer journey swimlane, SOSTAC overview
 * and OKR tree, for the same fictional company as the canvas fixture. Every value is invented so each state can be
 * reviewed (approved, draft, stale, missing, measured / no baseline / not measured key results, a key result above
 * target, a link to an item not shown). Never read from or written to a brand; documents carry `illustrative: true`,
 * which every page stamps.
 *
 * `variant: 'empty'` has the questions in the bank but nothing answered, for the designed empty states.
 */
export type PlanFixtureVariant = 'full' | 'empty'

type L = Record<VisualLang, string>
type ItemText = Record<VisualLang, Record<string, string>>

interface FixtureSource {
  id: string
  label: string
  state: DataState
  value?: L
  version?: number
  approved_at?: string
  review_due?: string
  /** List items: id, language-neutral fields (choices, numbers, dates), per-language text fields, links. */
  items?: Array<{ id: string; fields?: Record<string, string>; text: ItemText; links?: string[] }>
}

const APPROVED_AT = '2026-10-02T09:00:00.000Z'
const LATER = '2026-11-12T09:00:00.000Z'

function t(en: string, fa: string, tr: string): L {
  return { en, fa, tr }
}

const FIXTURE: FixtureSource[] = [
  {
    id: 'business.model.segments',
    label: 'Customer segments',
    state: 'approved',
    version: 1,
    approved_at: APPROVED_AT,
    items: [
      { id: 'seg-1', fields: { priority: 'primary' }, text: { en: { name: 'Working adults changing jobs' }, fa: { name: 'بزرگسالان شاغل در حال تغییر شغل' }, tr: { name: 'İş değiştiren çalışan yetişkinler' } } },
      { id: 'seg-2', fields: { priority: 'secondary' }, text: { en: { name: 'Employers buying team seats' }, fa: { name: 'کارفرمایانی که صندلی تیمی می‌خرند' }, tr: { name: 'Ekip koltuğu satın alan işverenler' } } },
    ],
  },
  {
    id: 'business.marketing.journey_stages',
    label: 'Customer journey stages',
    state: 'approved',
    version: 2,
    approved_at: LATER,
    items: [
      {
        id: 'stage-1',
        fields: { emotion: 'neutral' },
        links: ['seg-1'],
        text: {
          en: { name: 'Discover', goal: 'Find a course that fits a busy week', touchpoints: 'Search, a friend’s post', actions: 'Reads two reviews', pains: 'Too many similar apps', opportunities: 'A one-line promise on the first screen', evidence: '12 owner interviews' },
          fa: { name: 'کشف', goal: 'پیدا کردن دوره‌ای که با هفتهٔ شلوغ جور باشد', touchpoints: 'جست‌وجو، پست یک دوست', actions: 'دو نقد را می‌خواند', pains: 'اپ‌های مشابه زیاد', opportunities: 'یک وعدهٔ یک‌خطی در صفحهٔ اول', evidence: '۱۲ گفت‌وگوی مالک' },
          tr: { name: 'Keşif', goal: 'Yoğun bir haftaya uyan bir kurs bulmak', touchpoints: 'Arama, bir arkadaşın paylaşımı', actions: 'İki yorum okuyor', pains: 'Çok sayıda benzer uygulama', opportunities: 'İlk ekranda tek satırlık bir vaat', evidence: 'Sahibin 12 görüşmesi' },
        },
      },
      {
        id: 'stage-2',
        fields: { emotion: 'negative' },
        links: ['seg-1', 'seg-2'],
        text: {
          en: { name: 'Compare', goal: 'Know the real price', touchpoints: 'Pricing page', actions: 'Opens three tabs', pains: 'Price only after sign-up' },
          fa: { name: 'مقایسه', goal: 'دانستن قیمت واقعی', touchpoints: 'صفحهٔ قیمت', actions: 'سه زبانه باز می‌کند', pains: 'قیمت فقط بعد از ثبت‌نام' },
          tr: { name: 'Karşılaştırma', goal: 'Gerçek fiyatı öğrenmek', touchpoints: 'Fiyat sayfası', actions: 'Üç sekme açıyor', pains: 'Fiyat ancak kayıttan sonra' },
        },
      },
      {
        id: 'stage-3',
        fields: { emotion: 'positive' },
        text: {
          en: { name: 'Sign up', goal: 'Start in under a minute', touchpoints: 'App store, onboarding', actions: 'Picks a goal', opportunities: 'Skip the long placement test' },
          fa: { name: 'ثبت‌نام', goal: 'شروع در کمتر از یک دقیقه', touchpoints: 'فروشگاه اپ، آشنایی اولیه', actions: 'یک هدف انتخاب می‌کند', opportunities: 'حذف آزمون تعیین سطح طولانی' },
          tr: { name: 'Kayıt', goal: 'Bir dakikadan kısa sürede başlamak', touchpoints: 'Uygulama mağazası, ilk kullanım', actions: 'Bir hedef seçiyor', opportunities: 'Uzun seviye testini atlamak' },
        },
      },
      {
        id: 'stage-4',
        fields: { emotion: 'very_negative' },
        text: {
          en: { name: 'First week', goal: 'Keep a daily habit', touchpoints: 'Push reminder, lesson', actions: 'Misses day three', pains: 'Reminders at the wrong hour', opportunities: 'Let the learner pick the reminder time' },
          fa: { name: 'هفتهٔ اول', goal: 'حفظ عادت روزانه', touchpoints: 'یادآور، درس', actions: 'روز سوم را از دست می‌دهد', pains: 'یادآور در ساعت نامناسب', opportunities: 'انتخاب ساعت یادآور با خود یادگیرنده' },
          tr: { name: 'İlk hafta', goal: 'Günlük alışkanlığı sürdürmek', touchpoints: 'Hatırlatma bildirimi, ders', actions: 'Üçüncü günü kaçırıyor', pains: 'Yanlış saatte gelen hatırlatmalar', opportunities: 'Hatırlatma saatini öğrenci seçsin' },
        },
      },
      {
        id: 'stage-5',
        fields: { emotion: 'very_positive' },
        links: ['seg-9'],
        text: {
          en: { name: 'Recommend', goal: 'Share a visible win', touchpoints: 'Certificate, share card', actions: 'Posts a streak', opportunities: 'A team invite after week four' },
          fa: { name: 'توصیه', goal: 'به اشتراک گذاشتن یک موفقیت', touchpoints: 'گواهی، کارت اشتراک', actions: 'رکورد روزهای پیاپی را منتشر می‌کند', opportunities: 'دعوت تیمی بعد از هفتهٔ چهارم' },
          tr: { name: 'Tavsiye', goal: 'Görünür bir başarıyı paylaşmak', touchpoints: 'Sertifika, paylaşım kartı', actions: 'Seri gününü paylaşıyor', opportunities: 'Dördüncü haftadan sonra ekip daveti' },
        },
      },
    ],
  },
  {
    id: 'business.marketing.journey',
    label: 'Journey hypothesis',
    state: 'assumption',
    value: t(
      'Awareness comes from friends; conversion breaks at the price page; retention is unmeasured.',
      'آگاهی از راه دوستان می‌آید؛ تبدیل در صفحهٔ قیمت می‌شکند؛ نگهداشت هنوز اندازه‌گیری نشده است.',
      'Farkındalık arkadaşlardan geliyor; dönüşüm fiyat sayfasında kırılıyor; elde tutma ölçülmedi.',
    ),
  },
  {
    id: 'business.goals.annual',
    label: 'Annual objective',
    state: 'approved',
    version: 1,
    approved_at: APPROVED_AT,
    value: t('Prove that working adults finish a course on their phone.', 'ثابت کنیم بزرگسالان شاغل یک دوره را روی گوشی تمام می‌کنند.', 'Çalışan yetişkinlerin bir kursu telefonda bitirdiğini kanıtlamak.'),
  },
  {
    id: 'business.goals.objectives',
    label: 'Objectives (OKR)',
    state: 'approved',
    version: 1,
    approved_at: APPROVED_AT,
    items: [
      { id: 'obj-1', fields: { period: '2027 Q1' }, text: { en: { name: 'Learners build a daily habit', detail: 'Retention before growth' }, fa: { name: 'یادگیرندگان عادت روزانه بسازند', detail: 'نگهداشت پیش از رشد' }, tr: { name: 'Öğrenciler günlük alışkanlık kazansın', detail: 'Büyümeden önce elde tutma' } } },
      { id: 'obj-2', fields: { period: '2027 Q1' }, text: { en: { name: 'Employers see value in team seats' }, fa: { name: 'کارفرمایان ارزش صندلی تیمی را ببینند' }, tr: { name: 'İşverenler ekip koltuklarının değerini görsün' } } },
      { id: 'obj-3', fields: { period: '2027 Q2' }, text: { en: { name: 'A clear price before sign-up' }, fa: { name: 'قیمت روشن پیش از ثبت‌نام' }, tr: { name: 'Kayıttan önce net fiyat' } } },
    ],
  },
  {
    id: 'business.goals.key_results',
    label: 'Key results (OKR)',
    state: 'assumption',
    items: [
      { id: 'kr-1', fields: { target: '40', current: '26', baseline: '12', measured_on: '2026-11-20' }, links: ['obj-1'], text: { en: { name: 'Learners active on 5 of 7 days', unit: '%', source: 'Product analytics' }, fa: { name: 'یادگیرندگان فعال در ۵ روز از ۷ روز', unit: '٪', source: 'تحلیل محصول' }, tr: { name: '7 günün 5’inde aktif öğrenciler', unit: '%', source: 'Ürün analitiği' } } },
      { id: 'kr-2', fields: { target: '20', current: '6' }, links: ['obj-1'], text: { en: { name: 'Learners finishing week one', unit: 'learners', source: 'Lesson log' }, fa: { name: 'یادگیرندگانی که هفتهٔ اول را تمام می‌کنند', unit: 'نفر', source: 'گزارش درس‌ها' }, tr: { name: 'İlk haftayı bitiren öğrenciler', unit: 'öğrenci', source: 'Ders kaydı' } } },
      { id: 'kr-3', fields: { target: '3' }, links: ['obj-2'], text: { en: { name: 'Employer pilots signed', unit: 'pilots', source: 'Sales tracker' }, fa: { name: 'پایلوت‌های امضاشده با کارفرمایان', unit: 'پایلوت', source: 'ردیاب فروش' }, tr: { name: 'İmzalanan işveren pilotları', unit: 'pilot', source: 'Satış takibi' } } },
      { id: 'kr-4', fields: { target: '5', current: '4', baseline: '9', measured_on: '2026-11-18' }, links: ['obj-3'], text: { en: { name: 'Support questions about price per week', unit: 'questions', source: 'Help desk' }, fa: { name: 'پرسش‌های پشتیبانی دربارهٔ قیمت در هفته', unit: 'پرسش', source: 'میز پشتیبانی' }, tr: { name: 'Haftalık fiyat soruları', unit: 'soru', source: 'Destek masası' } } },
      { id: 'kr-5', fields: { target: '2', current: '1', baseline: '0' }, links: ['obj-9'], text: { en: { name: 'Partner channels live', unit: 'channels', source: 'Partner list' }, fa: { name: 'کانال‌های شریک فعال', unit: 'کانال', source: 'فهرست شریکان' }, tr: { name: 'Canlı ortak kanallar', unit: 'kanal', source: 'Ortak listesi' } } },
    ],
  },
  { id: 'business.stage.current', label: 'Business stage', state: 'approved', version: 1, approved_at: APPROVED_AT, value: t('Private beta', 'نسخهٔ آزمایشی خصوصی', 'Özel beta') },
  { id: 'business.customer.primary_segment', label: 'Primary customer', state: 'approved', version: 3, approved_at: APPROVED_AT, value: t('Working adults changing jobs', 'بزرگسالان شاغل در حال تغییر شغل', 'İş değiştiren çalışan yetişkinler') },
  { id: 'business.problem.pains', label: 'Customer pains', state: 'stale', version: 1, approved_at: '2026-03-01T09:00:00.000Z', review_due: '2026-09-01', value: t('No time for classes; apps feel like games, not progress.', 'برای کلاس وقت ندارند؛ اپ‌ها حس بازی می‌دهند، نه پیشرفت.', 'Derse zaman yok; uygulamalar ilerleme değil oyun gibi.') },
  { id: 'business.market.geography', label: 'Markets', state: 'missing' },
  { id: 'business.marketing.objective', label: 'Marketing objective', state: 'assumption', value: t('Learn whether the price page is the main drop-off.', 'بفهمیم آیا صفحهٔ قیمت اصلی‌ترین نقطهٔ ریزش است.', 'Fiyat sayfasının ana kayıp noktası olup olmadığını öğrenmek.') },
  { id: 'business.offer.value_proposition', label: 'Value proposition', state: 'approved', version: 2, approved_at: APPROVED_AT, value: t('Ten minutes a day, built around a real job move.', 'روزی ده دقیقه، ساخته‌شده حول یک تغییر شغل واقعی.', 'Günde on dakika, gerçek bir iş değişikliği etrafında.') },
  { id: 'brand.strategy.differentiation', label: 'Differentiation', state: 'missing' },
  { id: 'business.marketing.pillars', label: 'Content pillars', state: 'assumption', value: t('Career stories; five-minute grammar.', 'داستان‌های شغلی؛ دستور زبان پنج‌دقیقه‌ای.', 'Kariyer hikâyeleri; beş dakikalık dilbilgisi.') },
  { id: 'business.marketing.channels', label: 'Channels', state: 'approved', version: 1, approved_at: APPROVED_AT, value: t('Founder posts and partner newsletters. No paid social.', 'پست‌های بنیان‌گذار و خبرنامهٔ شریکان. بدون تبلیغ پولی در شبکه‌های اجتماعی.', 'Kurucu paylaşımları ve ortak bültenleri. Ücretli sosyal medya yok.') },
  { id: 'business.marketing.paid_media', label: 'Paid media', state: 'approved', version: 1, approved_at: APPROVED_AT, value: t('no', 'no', 'no') },
  { id: 'business.sales.motion', label: 'Sales motion', state: 'missing' },
  { id: 'business.plan.milestone', label: 'Next milestone', state: 'approved', version: 1, approved_at: APPROVED_AT, value: t('Twenty learners finish week one.', 'بیست یادگیرنده هفتهٔ اول را تمام کنند.', 'Yirmi öğrenci ilk haftayı bitirsin.') },
  { id: 'business.ops.tracker', label: 'Task tracker', state: 'assumption', value: t('A shared board in the team’s tracker.', 'یک برد مشترک در ابزار پیگیری تیم.', 'Ekibin takip aracında ortak bir pano.') },
  { id: 'business.ops.roles', label: 'Roles', state: 'missing' },
  { id: 'business.goals.sources', label: 'Metric sources', state: 'approved', version: 1, approved_at: APPROVED_AT, value: t('Product analytics; help desk.', 'تحلیل محصول؛ میز پشتیبانی.', 'Ürün analitiği; destek masası.') },
  { id: 'business.marketing.attribution', label: 'Attribution', state: 'approved', version: 1, approved_at: APPROVED_AT, value: t('self-reported', 'self-reported', 'self-reported') },
  { id: 'business.goals.cadence', label: 'Review cadence', state: 'assumption', value: t('Every second Friday.', 'هر دو هفته یک‌بار، جمعه.', 'İki haftada bir cuma.') },
]

function itemsFor(source: FixtureSource, lang: VisualLang): EntityItem[] {
  return (source.items ?? []).map((item) => {
    const fields: Record<string, string> = {}
    for (const [key, value] of Object.entries({ ...(item.fields ?? {}), ...item.text[lang] })) if (value !== '') fields[key] = value
    return { id: item.id, fields, links: [...(item.links ?? [])] }
  })
}

function sourceFor(fixture: FixtureSource, lang: VisualLang, edition: 'internal' | 'public', variant: PlanFixtureVariant): PlanSource {
  // Public edition: only approved (or stale approved) answers; everything else is "not published". Empty: nothing answered.
  const approved = fixture.state === 'approved' || fixture.state === 'stale'
  const hidden = variant === 'empty' || (edition === 'public' && !approved) || fixture.state === 'missing'
  const items = !hidden && fixture.items ? itemsFor(fixture, lang) : null
  const value = hidden ? null : items ? items.map((item) => item.fields.name ?? '').join(' · ') : (fixture.value?.[lang] ?? null)
  const entry: VisualEntry & { approved: boolean } = {
    id: fixture.id,
    label: fixture.label,
    state: hidden ? 'missing' : fixture.state,
    value,
    sources: hidden ? [] : [`fixture:${fixture.id}`],
    version: hidden ? null : (fixture.version ?? null),
    approved_at: hidden || !approved ? null : (fixture.approved_at ?? null),
    review_due: hidden || !approved ? null : (fixture.review_due ?? null),
    note: hidden ? null : approved ? null : 'Owner draft. Not approved.',
    missing_reason: hidden ? (edition === 'public' ? 'not_published' : 'unanswered') : null,
    ...(items ? { items: items.map((item) => ({ id: item.id, name: item.fields.name ?? '', detail: item.fields.detail ?? item.fields.goal ?? null, tags: [], links: [...item.links] })) } : {}),
    approved: !hidden && approved && fixture.state === 'approved',
  }
  return { entry, items }
}

function fixtureInput(lang: VisualLang, edition: 'internal' | 'public', variant: PlanFixtureVariant): PlanInput {
  const sources = new Map<string, PlanSource>()
  for (const fixture of FIXTURE) sources.set(fixture.id, sourceFor(fixture, lang, edition, variant))
  return { brand_id: ILLUSTRATIVE_BRAND.id, brand_name: ILLUSTRATIVE_BRAND.name, audience: edition, illustrative: true, sources, existing: new Set(PLAN_QUESTIONS) }
}

export function illustrativeJourney(lang: VisualLang, edition: 'internal' | 'public' = 'internal', variant: PlanFixtureVariant = 'full'): VisualDocument {
  return journeyDocument(fixtureInput(lang, edition, variant))
}

export function illustrativeSostac(lang: VisualLang, edition: 'internal' | 'public' = 'internal', variant: PlanFixtureVariant = 'full'): VisualDocument {
  return sostacDocument(fixtureInput(lang, edition, variant))
}

export function illustrativeOkr(lang: VisualLang, edition: 'internal' | 'public' = 'internal', variant: PlanFixtureVariant = 'full'): VisualDocument {
  return okrDocument(fixtureInput(lang, edition, variant))
}
