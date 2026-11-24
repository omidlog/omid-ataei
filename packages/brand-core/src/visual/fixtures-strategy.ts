import { ILLUSTRATIVE_BRAND } from './fixtures.js'
import type { VisualLang } from './i18n.js'
import type { DataState, VisualDocument } from './model.js'
import { SEGMENTS_QUESTION, SWOT_AREAS, swotTowsDocument, TOWS_AREA, VALUE_FIT_AREAS, valuePropositionDocument, type ResolvedSource, type StrategyEntry } from './strategy-lists.js'

/**
 * ILLUSTRATIVE / MOCK DATA. Golden examples for SWOT / TOWS and the Value Proposition Canvas (Visual V3.2), for the
 * same fictional company as the canvas fixture. They show every state: approved and draft lists, an empty quadrant,
 * a TOWS strategy linked to an item that is not visible, one without a type, a pain with no reliever, and each kind of
 * source (approved answer, shared knowledge note, evidence record, web page, a note that is not shared). Never read
 * from or written to a brand repository; every document built here has `illustrative: true`.
 */

type Text = Record<VisualLang, { name: string; detail?: string }>
interface FixtureItem {
  id: string
  tags?: Array<{ field: string; value: string }>
  links?: string[]
  sources?: string[]
  text: Text
}
interface FixtureList {
  id: string
  label: string
  state: DataState
  items?: FixtureItem[]
}

const APPROVED_AT = '2026-10-02T09:00:00.000Z'
const conf = (value: string) => [{ field: 'confidence', value }]

const SWOT: FixtureList[] = [
  {
    id: 'business.swot.strengths',
    label: 'Strengths',
    state: 'approved',
    items: [
      { id: 'str-1', tags: conf('evidenced'), sources: ['business.offer.summary', 'https://example.com/review-process?ref=fixture'], text: { en: { name: 'Teacher-reviewed lessons', detail: 'Every lesson is checked before release' }, fa: { name: 'درس‌های بازبینی‌شده توسط معلم', detail: 'هر درس پیش از انتشار بررسی می‌شود' }, tr: { name: 'Öğretmen kontrollü dersler', detail: 'Her ders yayından önce kontrol edilir' } } },
      { id: 'str-2', tags: conf('owner_view'), text: { en: { name: 'Ten-minute daily format' }, fa: { name: 'قالب روزانهٔ ده‌دقیقه‌ای' }, tr: { name: 'Günlük on dakikalık format' } } },
    ],
  },
  {
    id: 'business.swot.weaknesses',
    label: 'Weaknesses',
    state: 'assumption',
    items: [
      { id: 'wk-1', tags: conf('owner_view'), text: { en: { name: 'Small content team', detail: 'Two people write every course' }, fa: { name: 'تیم محتوای کوچک', detail: 'دو نفر همهٔ دوره‌ها را می‌نویسند' }, tr: { name: 'Küçük içerik ekibi', detail: 'Tüm kursları iki kişi yazıyor' } } },
      { id: 'wk-2', tags: conf('hypothesis'), sources: ['kn_example-offline-interviews', 'kn_example-private-note'], text: { en: { name: 'No offline mode' }, fa: { name: 'نبود حالت آفلاین' }, tr: { name: 'Çevrimdışı mod yok' } } },
    ],
  },
  {
    id: 'business.swot.opportunities',
    label: 'Opportunities',
    state: 'approved',
    items: [
      { id: 'opp-1', tags: conf('evidenced'), sources: ['https://example.org/upskilling-survey', 'ev-0001'], text: { en: { name: 'Employers fund upskilling' }, fa: { name: 'کارفرمایان هزینهٔ ارتقای مهارت را می‌دهند' }, tr: { name: 'İşverenler beceri gelişimini finanse ediyor' } } },
      { id: 'opp-2', tags: conf('hypothesis'), text: { en: { name: 'Remote hiring across borders' }, fa: { name: 'استخدام از راه دور فراتر از مرزها' }, tr: { name: 'Sınır ötesi uzaktan işe alım' } } },
    ],
  },
  { id: 'business.swot.threats', label: 'Threats', state: 'missing' },
  {
    id: 'business.swot.tows',
    label: 'TOWS strategies',
    state: 'assumption',
    items: [
      { id: 'tows-1', tags: [{ field: 'type', value: 'so' }], links: ['str-1', 'opp-1'], text: { en: { name: 'Team seats for employer upskilling budgets', detail: 'Sell reviewed courses to HR teams' }, fa: { name: 'صندلی تیمی برای بودجهٔ ارتقای مهارت کارفرمایان', detail: 'فروش دوره‌های بازبینی‌شده به تیم‌های منابع انسانی' }, tr: { name: 'İşveren beceri bütçeleri için ekip koltukları', detail: 'Kontrollü kursları İK ekiplerine sat' } } },
      { id: 'tows-2', tags: [{ field: 'type', value: 'wo' }], links: ['wk-1', 'opp-2'], text: { en: { name: 'Hire remote course writers' }, fa: { name: 'استخدام نویسندهٔ دوره از راه دور' }, tr: { name: 'Uzaktan kurs yazarı işe al' } } },
      { id: 'tows-3', tags: [{ field: 'type', value: 'wt' }], links: ['wk-2', 'thr-1'], text: { en: { name: 'Short offline lesson packs' }, fa: { name: 'بسته‌های کوتاه درس آفلاین' }, tr: { name: 'Kısa çevrimdışı ders paketleri' } } },
      { id: 'tows-4', links: ['str-2'], text: { en: { name: 'Weekly progress note for HR' }, fa: { name: 'گزارش هفتگی پیشرفت برای منابع انسانی' }, tr: { name: 'İK için haftalık ilerleme notu' } } },
    ],
  },
]

const VPC: FixtureList[] = [
  {
    id: 'business.fit.products',
    label: 'Products and services',
    state: 'approved',
    items: [
      { id: 'prod-1', tags: [{ field: 'kind', value: 'digital' }], links: ['seg-1'], text: { en: { name: 'Mobile lesson app' }, fa: { name: 'اپ درس موبایلی' }, tr: { name: 'Mobil ders uygulaması' } } },
      { id: 'prod-2', tags: [{ field: 'kind', value: 'service' }], text: { en: { name: 'Team seat licence' }, fa: { name: 'مجوز صندلی تیمی' }, tr: { name: 'Ekip koltuğu lisansı' } } },
    ],
  },
  {
    id: 'business.fit.creators',
    label: 'Gain creators',
    state: 'approved',
    items: [{ id: 'gcr-1', links: ['gain-1', 'prod-1'], sources: ['business.offer.summary'], text: { en: { name: 'A certificate for each level', detail: 'Shareable with an employer' }, fa: { name: 'گواهی برای هر سطح', detail: 'قابل ارائه به کارفرما' }, tr: { name: 'Her seviye için sertifika', detail: 'İşverenle paylaşılabilir' } } }],
  },
  {
    id: 'business.fit.relievers',
    label: 'Pain relievers',
    state: 'assumption',
    items: [
      { id: 'rel-1', links: ['pain-1', 'prod-1'], text: { en: { name: 'Lessons that fit a commute' }, fa: { name: 'درس‌هایی به اندازهٔ مسیر رفت‌وآمد' }, tr: { name: 'Yolculuğa sığan dersler' } } },
      { id: 'rel-2', links: ['pain-2'], sources: ['ev-0001'], text: { en: { name: 'Teacher feedback within a day' }, fa: { name: 'بازخورد معلم ظرف یک روز' }, tr: { name: 'Bir gün içinde öğretmen geri bildirimi' } } },
    ],
  },
  {
    id: 'business.fit.jobs',
    label: 'Customer jobs',
    state: 'approved',
    items: [
      { id: 'job-1', tags: [{ field: 'kind', value: 'functional' }], links: ['seg-1'], text: { en: { name: 'Pass a job interview in a new language' }, fa: { name: 'قبولی در مصاحبهٔ شغلی به زبان تازه' }, tr: { name: 'Yeni bir dilde iş görüşmesini geçmek' } } },
      { id: 'job-2', tags: [{ field: 'kind', value: 'emotional' }], text: { en: { name: 'Feel ready to speak at work' }, fa: { name: 'آمادگی برای صحبت در محل کار' }, tr: { name: 'İşte konuşmaya hazır hissetmek' } } },
    ],
  },
  {
    id: 'business.fit.gains',
    label: 'Customer gains',
    state: 'approved',
    items: [
      { id: 'gain-1', tags: [{ field: 'relevance', value: 'desired' }], links: ['seg-1'], text: { en: { name: 'Progress to show an employer' }, fa: { name: 'پیشرفتی که بشود به کارفرما نشان داد' }, tr: { name: 'İşverene gösterilecek ilerleme' } } },
      { id: 'gain-2', tags: [{ field: 'relevance', value: 'expected' }], text: { en: { name: 'Confidence when speaking' }, fa: { name: 'اعتمادبه‌نفس هنگام صحبت' }, tr: { name: 'Konuşurken özgüven' } } },
    ],
  },
  {
    id: 'business.fit.pains',
    label: 'Customer pains',
    state: 'approved',
    items: [
      { id: 'pain-1', tags: [{ field: 'severity', value: 'extreme' }], links: ['seg-1', 'job-1'], sources: ['business.problem.pains'], text: { en: { name: 'No time after work' }, fa: { name: 'نبود وقت بعد از کار' }, tr: { name: 'İş sonrası zaman yok' } } },
      { id: 'pain-2', tags: [{ field: 'severity', value: 'moderate' }], text: { en: { name: 'Unsure if pronunciation is right' }, fa: { name: 'مطمئن نبودن از درستی تلفظ' }, tr: { name: 'Telaffuzun doğru olup olmadığından emin olmamak' } } },
      { id: 'pain-3', tags: [{ field: 'severity', value: 'light' }], text: { en: { name: 'Apps feel like games, not work' }, fa: { name: 'اپ‌ها شبیه بازی‌اند، نه کار' }, tr: { name: 'Uygulamalar iş gibi değil oyun gibi' } } },
    ],
  },
  {
    id: SEGMENTS_QUESTION,
    label: 'Customer segments',
    state: 'approved',
    items: [{ id: 'seg-1', text: { en: { name: 'Working adults changing jobs' }, fa: { name: 'بزرگسالان شاغل در حال تغییر شغل' }, tr: { name: 'İş değiştiren çalışan yetişkinler' } } }],
  },
]

/** Fixture sources: what each reference resolves to. One knowledge note is deliberately not shared. */
function resolveFixture(ref: string): ResolvedSource {
  if (ref === 'business.offer.summary') return { kind: 'fact', ref, label: 'Offer summary', host: null, url: null, status: 'approved' }
  if (ref === 'business.problem.pains') return { kind: 'fact', ref, label: 'Customer pains', host: null, url: null, status: 'approved' }
  if (ref === 'kn_example-offline-interviews') return { kind: 'knowledge', ref, label: 'Interview notes: offline use (fictional)', host: null, url: null, status: 'shared' }
  if (ref === 'ev-0001') return { kind: 'evidence', ref, label: null, host: null, url: null, status: 'verified' }
  if (ref.startsWith('https://')) {
    const url = new URL(ref)
    const address = `${url.origin}${url.pathname}`
    return { kind: 'web', ref: address, label: null, host: url.hostname, url: address, status: 'recorded' }
  }
  return { kind: ref.startsWith('kn_') ? 'knowledge' : 'fact', ref, label: null, host: null, url: null, status: 'not_available' }
}

function entries(lists: FixtureList[], lang: VisualLang, audience: 'internal' | 'public'): Map<string, StrategyEntry> {
  const out = new Map<string, StrategyEntry>()
  for (const list of lists) {
    const approved = list.state === 'approved'
    const hidden = (audience === 'public' && !approved) || list.state === 'missing'
    const items = hidden || !list.items ? null : list.items.map((item) => ({ id: item.id, name: item.text[lang].name, detail: item.text[lang].detail ?? null, tags: item.tags ?? [], links: item.links ?? [], ...(item.sources ? { sources: item.sources } : {}) }))
    out.set(list.id, {
      id: list.id,
      label: list.label,
      state: hidden ? 'missing' : list.state,
      value: items ? items.map((item) => item.name).join(' · ') : null,
      ...(items ? { items } : {}),
      sources: [`fixture:${list.id}`],
      version: approved ? 1 : null,
      approved_at: approved ? APPROVED_AT : null,
      review_due: null,
      note: hidden && audience === 'public' ? 'Not published.' : list.state === 'assumption' ? 'Owner draft. Not approved.' : null,
      missing_reason: hidden ? (audience === 'public' ? 'not_published' : 'unanswered') : null,
      approved,
    })
  }
  return out
}

function existing(lists: FixtureList[], related: string[]): Set<string> {
  return new Set([...lists.map((list) => list.id), ...related])
}

export function illustrativeSwotTows(lang: VisualLang = 'en', audience: 'internal' | 'public' = 'internal'): VisualDocument {
  return swotTowsDocument({
    brand_id: ILLUSTRATIVE_BRAND.id,
    brand_name: ILLUSTRATIVE_BRAND.name,
    audience,
    illustrative: true,
    entries: entries(SWOT, lang, audience),
    existing: existing(SWOT, [...SWOT_AREAS, TOWS_AREA].flatMap((spec) => spec.related)),
    resolve: resolveFixture,
  })
}

export function illustrativeValueProposition(lang: VisualLang = 'en', audience: 'internal' | 'public' = 'internal'): VisualDocument {
  return valuePropositionDocument({
    brand_id: ILLUSTRATIVE_BRAND.id,
    brand_name: ILLUSTRATIVE_BRAND.name,
    audience,
    illustrative: true,
    entries: entries(VPC, lang, audience),
    existing: existing(VPC, VALUE_FIT_AREAS.flatMap((spec) => spec.related)),
    resolve: resolveFixture,
  })
}
