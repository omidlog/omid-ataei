import type { AcceptanceReport, CaseId, Production, Verdict } from './model.js'

/** The printed summary of an acceptance report in en, fa (RTL) or tr. Ids and evidence stay as recorded. */

export const ACCEPTANCE_LOCALES = ['en', 'fa', 'tr'] as const
export type AcceptanceLocale = (typeof ACCEPTANCE_LOCALES)[number]

const RLM = '‏'

const TEXT: Record<AcceptanceLocale, { title: string; origin: Record<AcceptanceReport['origin'], string>; verdict: Record<Verdict, string>; production: Record<Production, string>; cases: Record<CaseId, string>; root: (unchanged: boolean | null) => string; questions: string; calls: string; artifacts: string; notCovered: string; authorizes: string }> = {
  en: {
    title: 'Acceptance report',
    origin: { synthetic: 'synthetic fixture', owner_brand: 'owner brand (temporary snapshot)' },
    verdict: { PASS: 'PASS', FAIL: 'FAIL', NOT_TESTED: 'NOT_TESTED' },
    production: { produced: 'drafts produced', brief_only: 'brief only', blocked: 'blocked', not_tested: 'not tested' },
    cases: { single_visual: '1 single visual', ten_instagram_posts: '2 ten Instagram posts', website_brief: '3 website brief', paid_ad_brief: '4 paid-ad brief' },
    root: (unchanged) => `Checkout brand/ unchanged: ${unchanged === null ? 'unknown' : unchanged ? 'yes' : 'NO'}`,
    questions: 'owner questions',
    calls: 'tool calls',
    artifacts: 'files',
    notCovered: 'Not covered by this harness',
    authorizes: 'This report authorizes nothing: no publication, schedule, spend or deployment.',
  },
  fa: {
    title: 'گزارش پذیرش',
    origin: { synthetic: 'برند ساختگی آزمایشی', owner_brand: 'برند مالک (کپی موقت)' },
    verdict: { PASS: 'قبول (PASS)', FAIL: 'رد (FAIL)', NOT_TESTED: 'آزموده نشد (NOT_TESTED)' },
    production: { produced: 'پیش‌نویس ساخته شد', brief_only: 'فقط brief', blocked: 'مسدود', not_tested: 'آزموده نشد' },
    cases: { single_visual: '۱ یک تصویر', ten_instagram_posts: '۲ ده پست اینستاگرام', website_brief: '۳ brief وب‌سایت', paid_ad_brief: '۴ brief تبلیغ پولی' },
    root: (unchanged) => `پوشهٔ brand/ دست نخورد: ${unchanged === null ? 'نامعلوم' : unchanged ? 'بله' : 'خیر'}`,
    questions: 'پرسش از مالک',
    calls: 'فراخوانی ابزار',
    artifacts: 'فایل',
    notCovered: 'آنچه این ابزار نمی‌آزماید',
    authorizes: 'این گزارش هیچ مجوزی نمی‌دهد: نه انتشار، نه زمان‌بندی، نه هزینه، نه استقرار.',
  },
  tr: {
    title: 'Kabul raporu',
    origin: { synthetic: 'sentetik test markası', owner_brand: 'sahibin markası (geçici kopya)' },
    verdict: { PASS: 'GEÇTİ (PASS)', FAIL: 'KALDI (FAIL)', NOT_TESTED: 'TEST EDİLMEDİ (NOT_TESTED)' },
    production: { produced: 'taslaklar üretildi', brief_only: 'yalnızca brief', blocked: 'engellendi', not_tested: 'test edilmedi' },
    cases: { single_visual: '1 tek görsel', ten_instagram_posts: '2 on Instagram gönderisi', website_brief: '3 web sitesi brief', paid_ad_brief: '4 ücretli reklam brief' },
    root: (unchanged) => `brand/ klasörü değişmedi: ${unchanged === null ? 'bilinmiyor' : unchanged ? 'evet' : 'HAYIR'}`,
    questions: 'sahip soruları',
    calls: 'araç çağrısı',
    artifacts: 'dosya',
    notCovered: 'Bu aracın test etmedikleri',
    authorizes: 'Bu rapor hiçbir şeye yetki vermez: yayın, zamanlama, harcama veya dağıtım yok.',
  },
}

export function renderReport(report: AcceptanceReport, locale: AcceptanceLocale = 'en'): string {
  const t = TEXT[locale]
  const mark = locale === 'fa' ? RLM : ''
  const lines: string[] = []
  lines.push(`${mark}${t.title} — ${report.brand_id} — ${t.origin[report.origin]} — ${t.verdict[report.verdict]}`)
  lines.push(`${mark}PASS ${report.totals.PASS} · FAIL ${report.totals.FAIL} · NOT_TESTED ${report.totals.NOT_TESTED}`)
  lines.push(`${mark}${t.root(report.workspace.root_unchanged)}`)
  for (const record of report.cases) {
    lines.push('')
    lines.push(`${mark}${t.cases[record.case_id]} [${record.fixes.join(', ')}] — ${t.verdict[record.verdict]} — ${t.production[record.production]}`)
    lines.push(`${mark}  ${record.profile} · ${t.calls}: ${record.metrics.tool_calls} · ${t.questions}: ${record.metrics.owner_questions} · ${t.artifacts}: ${record.metrics.artifacts}`)
    for (const check of record.checks) lines.push(`${mark}  [${check.verdict}] ${check.id} (${check.fixes}) ${check.evidence.join(' ')}`)
  }
  lines.push('')
  lines.push(`${mark}${t.notCovered}:`)
  for (const item of report.not_covered) lines.push(`${mark}  - ${item.split(':')[0]}`)
  lines.push(`${mark}${t.authorizes}`)
  return lines.join('\n')
}
