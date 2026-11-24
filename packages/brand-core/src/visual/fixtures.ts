import { BMC_ZONES, canvasDocument } from './bmc.js'
import type { DataState, VisualDocument, VisualEntry } from './model.js'
import type { VisualLang } from './i18n.js'

/**
 * ILLUSTRATIVE / MOCK DATA. The golden example for the Business Model Canvas renderer.
 *
 * Every value below is invented for a fictional company so the renderer can be reviewed in every state (approved,
 * draft, stale, withheld, missing, not applicable, list items with links and an empty list zone). It is never read from or
 * written to a brand repository, never used as a default answer, and every document built from it has
 * `illustrative: true`, which the renderers stamp on every page.
 */
export const ILLUSTRATIVE_BRAND = { id: 'illustrative-example', name: 'Example Co. (fictional)' }

interface FixtureEntry {
  id: string
  label: string
  state: DataState
  value?: Record<VisualLang, string>
  version?: number
  approved_at?: string
  review_due?: string
  note?: string
  /** Visual V3.1: list items (repeating_entity). Ids, choice values and links are language-neutral. */
  list?: Array<{ id: string; tags: Array<{ field: string; value: string }>; links: string[]; text: Record<VisualLang, { name: string; detail?: string }> }>
}

const APPROVED_AT = '2026-10-02T09:00:00.000Z'

const FIXTURE: FixtureEntry[] = [
  // Visual V3.1 list questions: approved segments, draft activities and cost items with links, resources missing
  // (the designed empty list zone), and one link to an item that does not exist (unresolved).
  {
    id: 'business.model.segments',
    label: 'Customer segments',
    state: 'approved',
    version: 1,
    approved_at: APPROVED_AT,
    list: [
      { id: 'seg-1', tags: [{ field: 'priority', value: 'primary' }], links: [], text: { en: { name: 'Working adults changing jobs', detail: 'Ten minutes a day, on the phone' }, fa: { name: 'بزرگسالان شاغل در حال تغییر شغل', detail: 'روزی ده دقیقه، روی گوشی' }, tr: { name: 'İş değiştiren çalışan yetişkinler', detail: 'Günde on dakika, telefonda' } } },
      { id: 'seg-2', tags: [{ field: 'priority', value: 'secondary' }], links: [], text: { en: { name: 'Employers buying team seats' }, fa: { name: 'کارفرمایانی که صندلی تیمی می‌خرند' }, tr: { name: 'Ekip koltuğu satın alan işverenler' } } },
    ],
  },
  {
    id: 'business.model.key_activities',
    label: 'Key activities',
    state: 'assumption',
    note: 'Owner draft. Not approved.',
    list: [
      { id: 'act-1', tags: [{ field: 'category', value: 'production' }], links: ['seg-1', 'res-1'], text: { en: { name: 'Lesson production', detail: 'Weekly, reviewed by a teacher' }, fa: { name: 'تولید درس', detail: 'هفتگی، با بازبینی معلم' }, tr: { name: 'Ders üretimi', detail: 'Haftalık, öğretmen kontrolünde' } } },
      { id: 'act-2', tags: [{ field: 'category', value: 'problem_solving' }], links: ['seg-2'], text: { en: { name: 'Partner onboarding' }, fa: { name: 'راه‌اندازی شریکان' }, tr: { name: 'Ortak katılımı' } } },
    ],
  },
  { id: 'business.model.key_resources', label: 'Key resources', state: 'missing', note: 'Not answered yet.' },
  {
    id: 'business.model.cost_items',
    label: 'Cost items',
    state: 'assumption',
    note: 'Owner draft. Not approved.',
    list: [
      { id: 'cost-1', tags: [{ field: 'behaviour', value: 'variable' }], links: ['act-1'], text: { en: { name: 'Content production' }, fa: { name: 'تولید محتوا' }, tr: { name: 'İçerik üretimi' } } },
      { id: 'cost-2', tags: [{ field: 'behaviour', value: 'variable' }], links: [], text: { en: { name: 'Cloud hosting', detail: 'Grows with active learners' }, fa: { name: 'میزبانی ابری', detail: 'با یادگیرندگان فعال رشد می‌کند' }, tr: { name: 'Bulut barındırma', detail: 'Aktif öğrenciyle büyür' } } },
    ],
  },
  {
    id: 'business.partners.channels',
    label: 'Partners',
    state: 'approved',
    version: 2,
    approved_at: APPROVED_AT,
    value: {
      en: 'Two regional training firms resell team seats. One payment provider handles billing.',
      fa: 'دو مؤسسهٔ آموزشی منطقه‌ای صندلی‌های تیمی را می‌فروشند. یک درگاه پرداخت صورت‌حساب را انجام می‌دهد.',
      tr: 'İki bölgesel eğitim firması ekip koltuklarını yeniden satıyor. Faturalamayı bir ödeme sağlayıcısı yapıyor.',
    },
  },
  {
    id: 'business.ops.vendors',
    label: 'Vendors',
    state: 'assumption',
    note: 'Owner draft. Not approved.',
    value: {
      en: 'Cloud hosting; two freelance illustrators.',
      fa: 'میزبانی ابری؛ دو تصویرگر آزادکار.',
      tr: 'Bulut barındırma; iki serbest illüstratör.',
    },
  },
  {
    id: 'business.offer.value_proposition',
    label: 'Value proposition',
    state: 'approved',
    version: 3,
    approved_at: APPROVED_AT,
    value: {
      en: 'Busy adults reach a useful conversation level in a new language in ten minutes a day.',
      fa: 'بزرگسالان پرمشغله با روزی ده دقیقه به سطح مکالمهٔ کاربردی در یک زبان تازه می‌رسند.',
      tr: 'Yoğun yetişkinler günde on dakikayla yeni bir dilde işe yarar konuşma seviyesine ulaşır.',
    },
  },
  {
    id: 'business.offer.summary',
    label: 'Offer',
    state: 'approved',
    version: 1,
    approved_at: APPROVED_AT,
    value: {
      en: 'Mobile app with short daily lessons, plus a team plan for employers.',
      fa: 'اپلیکیشن موبایل با درس‌های کوتاه روزانه، به‌علاوهٔ طرح تیمی برای کارفرمایان.',
      tr: 'Kısa günlük derslerle mobil uygulama ve işverenler için ekip planı.',
    },
  },
  {
    id: 'business.sales.motion',
    label: 'Sales motion',
    state: 'approved',
    version: 1,
    approved_at: APPROVED_AT,
    value: { en: 'Self-serve; partner-led for teams.', fa: 'سلف‌سرویس؛ برای تیم‌ها از طریق شریک.', tr: 'Self servis; ekipler için ortak üzerinden.' },
  },
  {
    id: 'business.cx.onboarding',
    label: 'Onboarding outcome',
    state: 'stale',
    version: 1,
    approved_at: '2026-03-01T09:00:00.000Z',
    review_due: '2026-09-01',
    value: {
      en: 'First lesson finished within the first session.',
      fa: 'اولین درس در همان جلسهٔ اول تمام شود.',
      tr: 'İlk ders ilk oturumda tamamlanır.',
    },
  },
  { id: 'business.cx.channels', label: 'Support channels', state: 'missing', note: 'Not answered yet.' },
  {
    id: 'business.marketing.channels',
    label: 'Channels',
    state: 'approved',
    version: 2,
    approved_at: APPROVED_AT,
    value: {
      en: 'App stores, short-form video, partner newsletters.',
      fa: 'فروشگاه‌های اپلیکیشن، ویدیوی کوتاه، خبرنامهٔ شرکا.',
      tr: 'Uygulama mağazaları, kısa video, ortak bültenleri.',
    },
  },
  { id: 'business.sales.consumer_path', label: 'Consumer purchase path', state: 'not_applicable', note: 'Marked not applicable by the owner.' },
  {
    id: 'business.customer.primary_segment',
    label: 'Primary customer',
    state: 'approved',
    version: 2,
    approved_at: APPROVED_AT,
    value: {
      en: 'Working adults, 25–45, learning a language for a job move.',
      fa: 'بزرگسالان شاغل ۲۵ تا ۴۵ ساله که برای تغییر شغل زبان می‌آموزند.',
      tr: 'İş değişikliği için dil öğrenen 25–45 yaş arası çalışan yetişkinler.',
    },
  },
  {
    id: 'business.sales.buyer',
    label: 'Buyer versus user',
    state: 'assumption',
    note: 'Owner draft. Not approved.',
    value: { en: 'Teams: HR buys, employees use.', fa: 'تیم‌ها: منابع انسانی می‌خرد، کارکنان استفاده می‌کنند.', tr: 'Ekipler: İK satın alır, çalışanlar kullanır.' },
  },
  { id: 'business.finance.costs', label: 'Cost drivers', state: 'withheld', version: 1, approved_at: APPROVED_AT, note: 'Restricted. Approved, but the value is never shown in a document.' },
  {
    id: 'business.finance.economics_note',
    label: 'Pricing economics note',
    state: 'approved',
    version: 1,
    approved_at: APPROVED_AT,
    value: {
      en: 'Content production is the largest variable cost; hosting scales with active learners.',
      fa: 'تولید محتوا بزرگ‌ترین هزینهٔ متغیر است؛ میزبانی با تعداد یادگیرندگان فعال رشد می‌کند.',
      tr: 'En büyük değişken maliyet içerik üretimi; barındırma aktif öğrenciyle ölçeklenir.',
    },
  },
  {
    id: 'business.model.revenue',
    label: 'Revenue model',
    state: 'approved',
    version: 1,
    approved_at: APPROVED_AT,
    value: {
      en: 'Monthly and annual subscriptions; per-seat team licences.',
      fa: 'اشتراک ماهانه و سالانه؛ مجوز تیمی به ازای هر کاربر.',
      tr: 'Aylık ve yıllık abonelik; koltuk başına ekip lisansı.',
    },
  },
  {
    id: 'business.sales.pricing',
    label: 'Pricing summary',
    state: 'assumption',
    note: 'Owner draft. Not approved.',
    value: {
      en: 'Free first week, then one paid tier (amount not decided).',
      fa: 'هفتهٔ اول رایگان، سپس یک پلن پولی (مبلغ هنوز تعیین نشده).',
      tr: 'İlk hafta ücretsiz, sonra tek ücretli paket (tutar belirlenmedi).',
    },
  },
]

/** The golden example document. Values are the fixture's own `lang` text; the renderer labels them as mock. */
export function illustrativeBusinessModelCanvas(lang: VisualLang = 'en', audience: 'internal' | 'public' = 'internal'): VisualDocument {
  const byId = new Map(FIXTURE.map((entry) => [entry.id, entry]))
  const existing = new Set([...FIXTURE.map((entry) => entry.id), ...BMC_ZONES.flatMap((zone) => zone.related)])
  const zones = BMC_ZONES.map((spec) => ({
    spec,
    existing,
    entries: spec.questions.flatMap((id) => {
      const fixture = byId.get(id)
      if (!fixture) return []
      const approved = fixture.state === 'approved' || fixture.state === 'stale' || (fixture.state === 'withheld' && fixture.approved_at !== undefined)
      // The public edition of the fixture follows the same rule as a real brand: drafts are left out.
      const hidden = audience === 'public' && !approved
      const items = hidden || !fixture.list ? null : fixture.list.map((item) => ({ id: item.id, name: item.text[lang].name, detail: item.text[lang].detail ?? null, tags: item.tags, links: item.links }))
      const entry: VisualEntry & { approved: boolean } = {
        id: fixture.id,
        label: fixture.label,
        state: hidden ? 'missing' : fixture.state,
        value: items ? items.map((item) => item.name).join(' · ') : hidden || !fixture.value ? null : fixture.value[lang],
        ...(items ? { items } : {}),
        sources: [`fixture:${fixture.id}`],
        version: approved ? (fixture.version ?? null) : null,
        approved_at: approved ? (fixture.approved_at ?? null) : null,
        review_due: fixture.review_due ?? null,
        note: hidden ? 'Not published.' : (fixture.note ?? null),
        missing_reason: hidden ? 'not_published' : fixture.state === 'missing' ? 'unanswered' : null,
        approved,
      }
      return [entry]
    }),
  }))
  return canvasDocument({ brand_id: ILLUSTRATIVE_BRAND.id, brand_name: ILLUSTRATIVE_BRAND.name, audience, illustrative: true, zones })
}
