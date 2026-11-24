import type { DocumentAudience } from '../documents/model.js'
import { illustrativeBusinessModelCanvas, ILLUSTRATIVE_BRAND } from './fixtures.js'
import { illustrativeVisualIdentity } from './fixtures-identity.js'
import { composeBook, type BookDocument, type BookKind } from './full-book.js'
import type { VisualLang } from './i18n.js'
import type { DataState, VisualEntry } from './model.js'

/**
 * ILLUSTRATIVE / MOCK DATA. Golden examples for the full Brand Book and the Business Report (Visual V4.2).
 *
 * Invented values for a fictional company, chosen so every page type appears: approved entries, a stale entry, a
 * draft (printed as "awaiting approval", never its value), a withheld restricted finance figure (never printed),
 * gaps, a chapter with no approved fact (designed "not yet available" page), planned chapters and chapters that
 * print as their own document. Never read from or written to a brand; every book has `illustrative: true`.
 * The draft and restricted values below are sentinels: tests assert they never reach the HTML or the PDF.
 */

const APPROVED_AT = '2026-10-02T09:00:00.000Z'
export const FIXTURE_DRAFT_SENTINEL = 'DRAFT-SENTINEL never printed'
export const FIXTURE_RESTRICTED_SENTINEL = 'RESTRICTED-SENTINEL 4,200,000'

type Values = Record<VisualLang, string>

interface Row {
  id: string
  label: string
  state: DataState
  value?: Values | string
  version?: number
}

function entry(row: Row, lang: VisualLang, audience: DocumentAudience): VisualEntry {
  const approved = row.state === 'approved' || row.state === 'stale'
  // The public edition shows approved facts only; everything else is "not published", exactly like itemFor.
  const state: DataState = audience === 'public' && !approved ? 'missing' : row.state
  const value = typeof row.value === 'string' ? row.value : (row.value?.[lang] ?? null)
  return {
    id: row.id,
    label: row.label,
    state,
    value: state === 'missing' || state === 'withheld' || state === 'not_applicable' ? null : value,
    sources: [`fixture:${row.id}`],
    version: approved ? (row.version ?? 1) : null,
    approved_at: approved ? APPROVED_AT : null,
    review_due: row.state === 'stale' ? '2026-11-01T00:00:00.000Z' : null,
    note: row.state === 'assumption' ? 'Owner draft. Not approved.' : row.state === 'withheld' ? 'Restricted. Approved, but the value is never shown in a document.' : null,
    missing_reason: state === 'missing' ? (audience === 'public' ? 'not_published' : 'unanswered') : null,
  }
}

const v = (en: string, fa: string, tr: string): Values => ({ en, fa, tr })

const BRAND_BOOK_ROWS: Record<string, Row[]> = {
  overview: [
    { id: 'business.identity.trade_name', label: 'Trade name', state: 'approved', value: ILLUSTRATIVE_BRAND.name, version: 1 },
    { id: 'brand.verbal.tagline', label: 'Tagline', state: 'approved', version: 2, value: v('Ten minutes a day, a new language for life.', 'روزی ده دقیقه، یک زبان تازه برای همیشه.', 'Günde on dakika, ömür boyu yeni bir dil.') },
    { id: 'business.offer.summary', label: 'Offer', state: 'approved', version: 3, value: v('A mobile course that teaches conversation through short daily dialogues with a friendly tutor character.', 'دورهٔ موبایلی که با گفت‌وگوهای کوتاه روزانه و یک شخصیت معلم مهربان، مکالمه یاد می‌دهد.', 'Kısa günlük diyaloglar ve sevimli bir öğretmen karakteriyle konuşma öğreten bir mobil kurs.') },
    { id: 'business.customer.primary_segment', label: 'Primary customer', state: 'approved', version: 1, value: v('Busy adults aged 25–45 who relocate for work.', 'بزرگسالان پرمشغلهٔ ۲۵ تا ۴۵ ساله که برای کار مهاجرت می‌کنند.', 'İş için taşınan 25–45 yaş arası yoğun yetişkinler.') },
  ],
  strategy: [
    { id: 'brand.strategy.purpose', label: 'Purpose', state: 'approved', version: 2, value: v('Make starting a life in a new country less lonely.', 'شروع زندگی در کشوری تازه را کمتر تنها کنیم.', 'Yeni bir ülkede hayata başlamayı daha az yalnız kılmak.') },
    { id: 'brand.strategy.vision', label: 'Vision', state: 'assumption', value: FIXTURE_DRAFT_SENTINEL },
    { id: 'brand.strategy.values', label: 'Values', state: 'approved', version: 1, value: v('Warmth over polish; progress over perfection; honest about effort.', 'گرمی پیش از ظاهر؛ پیشرفت پیش از کمال؛ صداقت دربارهٔ تلاش.', 'Cilalıktan önce sıcaklık; mükemmellikten önce ilerleme; emek konusunda dürüstlük.') },
    { id: 'brand.strategy.differentiation', label: 'Differentiation', state: 'stale', version: 1, value: v('Dialogues are written for real errands (a bank, a clinic, a landlord), not tourist phrases.', 'گفت‌وگوها برای کارهای واقعی (بانک، درمانگاه، صاحب‌خانه) نوشته شده‌اند، نه جمله‌های توریستی.', 'Diyaloglar turist cümleleri için değil, gerçek işler (banka, klinik, ev sahibi) için yazılır.') },
    { id: 'brand.strategy.promise', label: 'Brand promise', state: 'missing' },
  ],
  verbal: [
    { id: 'brand.verbal.voice', label: 'Tone of voice', state: 'approved', version: 1, value: v('Calm, encouraging, plain words. Never sarcastic.', 'آرام، دلگرم‌کننده، واژه‌های ساده. هرگز طعنه‌آمیز نیست.', 'Sakin, cesaretlendirici, sade kelimeler. Asla alaycı değil.') },
    { id: 'brand.verbal.forbidden', label: 'Forbidden language', state: 'approved', version: 1, value: v('"Fluent in 7 days", "guaranteed", "native-like".', '«مسلط در ۷ روز»، «تضمینی»، «مثل زبان مادری».', '"7 günde akıcı", "garantili", "ana dili gibi".') },
    { id: 'brand.verbal.microcopy', label: 'Microcopy principle', state: 'missing' },
  ],
  color: [{ id: 'brand.color.contrast', label: 'Contrast target', state: 'approved', version: 1, value: v('Body text at least 4.5:1 against its background.', 'متن بدنه دست‌کم ۴٫۵ به ۱ نسبت به پس‌زمینه.', 'Gövde metni arka plana karşı en az 4,5:1.') }],
  type: [{ id: 'brand.type.rtl', label: 'RTL and locales', state: 'approved', version: 1, value: v('Persian is set in Vazirmatn, right to left.', 'فارسی با وزیرمتن و راست‌به‌چپ حروف‌چینی می‌شود.', 'Farsça Vazirmatn ile sağdan sola dizilir.') }],
  logo: [{ id: 'brand.logo.misuse', label: 'Misuse rules', state: 'missing' }],
  governance: [
    { id: 'brand.gov.approver', label: 'Brand approver', state: 'missing' },
    { id: 'brand.gov.versioning', label: 'Versioning', state: 'assumption', value: FIXTURE_DRAFT_SENTINEL },
  ],
}

const REPORT_ROWS: Record<string, Row[]> = {
  'executive-summary': [
    { id: 'business.identity.trade_name', label: 'Trade name', state: 'approved', value: ILLUSTRATIVE_BRAND.name, version: 1 },
    { id: 'business.offer.summary', label: 'Offer', state: 'approved', version: 3, value: v('A mobile course that teaches conversation through short daily dialogues with a friendly tutor character.', 'دورهٔ موبایلی که با گفت‌وگوهای کوتاه روزانه و یک شخصیت معلم مهربان، مکالمه یاد می‌دهد.', 'Kısa günlük diyaloglar ve sevimli bir öğretmen karakteriyle konuşma öğreten bir mobil kurs.') },
    { id: 'business.stage.current', label: 'Operating stage', state: 'approved', version: 1, value: v('Paid pilot with two partner firms.', 'آزمایش پولی با دو شرکت همکار.', 'İki ortak firmayla ücretli pilot.') },
    { id: 'business.plan.milestone', label: 'Next milestone', state: 'assumption', value: FIXTURE_DRAFT_SENTINEL },
  ],
  'customer-problem': [
    { id: 'business.customer.primary_segment', label: 'Primary customer', state: 'approved', version: 1, value: v('Busy adults aged 25–45 who relocate for work.', 'بزرگسالان پرمشغلهٔ ۲۵ تا ۴۵ ساله که برای کار مهاجرت می‌کنند.', 'İş için taşınan 25–45 yaş arası yoğun yetişkinler.') },
    { id: 'business.problem.pains', label: 'Customer pains', state: 'approved', version: 2, value: v('No time for classes; textbook phrases fail at real appointments.', 'وقتی برای کلاس نیست؛ جمله‌های کتابی در قرارهای واقعی کار نمی‌کنند.', 'Ders için zaman yok; ders kitabı cümleleri gerçek randevularda işe yaramıyor.') },
    { id: 'business.market.geography', label: 'Geography', state: 'missing' },
  ],
  'business-model': [
    { id: 'business.model.revenue', label: 'Revenue model', state: 'approved', version: 1, value: v('Monthly subscription; team seats sold through partners.', 'اشتراک ماهانه؛ صندلی‌های تیمی از طریق همکاران فروخته می‌شود.', 'Aylık abonelik; ekip koltukları ortaklar üzerinden satılır.') },
    { id: 'business.sales.pricing', label: 'Pricing summary', state: 'missing' },
  ],
  product: [{ id: 'business.product.mvp', label: 'MVP boundary', state: 'approved', version: 1, value: v('Three languages, forty dialogues each, offline audio.', 'سه زبان، هر کدام چهل گفت‌وگو، صدای آفلاین.', 'Üç dil, her biri kırk diyalog, çevrimdışı ses.') }],
  financials: [
    { id: 'business.finance.currency', label: 'Reporting currency', state: 'approved', version: 1, value: 'EUR' },
    { id: 'business.finance.revenue_figure', label: 'Revenue figure', state: 'withheld', value: FIXTURE_RESTRICTED_SENTINEL },
    { id: 'business.finance.runway', label: 'Runway', state: 'withheld', value: FIXTURE_RESTRICTED_SENTINEL },
  ],
  goals: [
    { id: 'business.goals.annual', label: 'Annual objective', state: 'missing' },
    { id: 'business.goals.north_star', label: 'North star definition', state: 'assumption', value: FIXTURE_DRAFT_SENTINEL },
  ],
  risks: [{ id: 'business.plan.risks', label: 'Top risks', state: 'approved', version: 1, value: v('Partner concentration: two partners bring most team seats.', 'تمرکز همکار: بیشتر صندلی‌های تیمی از دو همکار می‌آید.', 'Ortak yoğunluğu: ekip koltuklarının çoğu iki ortaktan geliyor.') }],
}

/** The ILLUSTRATIVE full Brand Book or Business Report, in one language (values are invented per language). */
export function illustrativeBook(kind: BookKind, lang: VisualLang = 'en', audience: DocumentAudience = 'internal'): BookDocument {
  const rows = kind === 'brand_book' ? BRAND_BOOK_ROWS : REPORT_ROWS
  const sections = Object.fromEntries(Object.entries(rows).map(([id, list]) => [id, list.map((row) => entry(row, lang, audience))]))
  return composeBook({
    kind,
    audience,
    brand_id: ILLUSTRATIVE_BRAND.id,
    brand_name: ILLUSTRATIVE_BRAND.name,
    illustrative: true,
    sections,
    identity: kind === 'brand_book' ? illustrativeVisualIdentity(audience, 'complete') : null,
    canvas: kind === 'business_report' ? illustrativeBusinessModelCanvas(lang, audience) : null,
    mascot: 'on',
    competitors: true,
  })
}
