import type { AuditCheckId, CheckStatus } from './audit.js'
import type { VisualLang } from './i18n.js'

/** Text for the V5.1 module audit and release gate report (`npm run visual:audit`). Ids stay as they are. */
export interface AuditText {
  title: string
  headers: { module: string; slice: string; audience: string; score: string; next: string }
  audience: { public: string; internal: string }
  status: Record<CheckStatus | 'pending' | 'unregistered', string>
  checks: Record<AuditCheckId, string>
  standards: { title: string; verified: string; pending: string; reviewer: string; checked: string; citedBy: string }
  gate: { passed: string; failed: string; release: string; ci: string; blockers: string; overridden: string; pendingModules: string; notes: string; threshold: string }
  pilot: { title: string; passed: string; failed: string }
  none: string
}

const en: AuditText = {
  title: 'Visual module audit (0–5 rubric)',
  headers: { module: 'Module', slice: 'Slice', audience: 'Audience', score: 'Score', next: 'Next check to pass' },
  audience: { public: 'public', internal: 'internal' },
  status: { pass: 'pass', fail: 'fail', 'n/a': 'n/a', pending: 'pending (not built yet)', unregistered: 'landed, not yet scored' },
  checks: {
    model: 'model and builder',
    core_tests: 'core tests',
    i18n: 'English, Persian and Turkish text',
    empty_state: 'designed empty state',
    studio_tests: 'Studio renderer tests',
    print: 'print view',
    rtl: 'right-to-left check',
    redaction: 'public redaction',
    visual_qa: 'reference screenshots',
    standards: 'standards verified',
  },
  standards: { title: 'Cited frameworks and standards', verified: 'verified', pending: 'not verified yet', reviewer: 'Reviewer', checked: 'Checked on', citedBy: 'Cited by' },
  gate: {
    passed: 'Release gate passed',
    failed: 'Release gate failed',
    release: 'release mode',
    ci: 'CI mode',
    blockers: 'Would stop a release',
    overridden: 'Overridden by the owner',
    pendingModules: 'Pending modules (other slices, never a failure)',
    notes: 'Notes',
    threshold: 'Lowest score a public module may have',
  },
  pilot: { title: 'Cross-brand pilot (two synthetic brands)', passed: 'Pilot passed', failed: 'Pilot failed' },
  none: 'none',
}

const fa: AuditText = {
  title: 'ممیزی ماژول‌های بصری (معیار ۰ تا ۵)',
  headers: { module: 'ماژول', slice: 'مرحله', audience: 'مخاطب', score: 'امتیاز', next: 'بررسی بعدی برای قبولی' },
  audience: { public: 'عمومی', internal: 'داخلی' },
  status: { pass: 'قبول', fail: 'رد', 'n/a': 'لازم نیست', pending: 'در انتظار (هنوز ساخته نشده)', unregistered: 'رسیده، هنوز امتیاز نگرفته' },
  checks: {
    model: 'مدل و سازنده',
    core_tests: 'آزمون‌های هسته',
    i18n: 'متن انگلیسی، فارسی و ترکی',
    empty_state: 'حالت خالیِ طراحی‌شده',
    studio_tests: 'آزمون‌های نمایش در استودیو',
    print: 'نمای چاپی',
    rtl: 'بررسی راست‌به‌چپ',
    redaction: 'پنهان‌سازی در نسخهٔ عمومی',
    visual_qa: 'تصاویر مرجع',
    standards: 'استانداردهای بررسی‌شده',
  },
  standards: { title: 'چارچوب‌ها و استانداردهای استنادشده', verified: 'بررسی‌شده', pending: 'هنوز بررسی نشده', reviewer: 'بررسی‌کننده', checked: 'تاریخ بررسی', citedBy: 'استفاده در' },
  gate: {
    passed: 'دروازهٔ انتشار قبول شد',
    failed: 'دروازهٔ انتشار رد شد',
    release: 'حالت انتشار',
    ci: 'حالت CI',
    blockers: 'جلوی انتشار را می‌گیرد',
    overridden: 'با اجازهٔ مالک نادیده گرفته شد',
    pendingModules: 'ماژول‌های در انتظار (مراحل دیگر، هرگز باعث رد نمی‌شوند)',
    notes: 'یادداشت‌ها',
    threshold: 'کمترین امتیاز مجاز برای ماژول عمومی',
  },
  pilot: { title: 'آزمون دو برند (دو برند ساختگی)', passed: 'آزمون دو برند قبول شد', failed: 'آزمون دو برند رد شد' },
  none: 'هیچ',
}

const tr: AuditText = {
  title: 'Görsel modül denetimi (0–5 ölçeği)',
  headers: { module: 'Modül', slice: 'Aşama', audience: 'Hedef kitle', score: 'Puan', next: 'Geçilecek sonraki kontrol' },
  audience: { public: 'herkese açık', internal: 'iç' },
  status: { pass: 'geçti', fail: 'kaldı', 'n/a': 'gerekmez', pending: 'beklemede (henüz yapılmadı)', unregistered: 'geldi, henüz puanlanmadı' },
  checks: {
    model: 'model ve oluşturucu',
    core_tests: 'çekirdek testleri',
    i18n: 'İngilizce, Farsça ve Türkçe metin',
    empty_state: 'tasarlanmış boş durum',
    studio_tests: 'Studio görüntüleme testleri',
    print: 'baskı görünümü',
    rtl: 'sağdan sola kontrolü',
    redaction: 'herkese açık sürümde gizleme',
    visual_qa: 'referans ekran görüntüleri',
    standards: 'doğrulanmış standartlar',
  },
  standards: { title: 'Atıf yapılan çerçeveler ve standartlar', verified: 'doğrulandı', pending: 'henüz doğrulanmadı', reviewer: 'İnceleyen', checked: 'Kontrol tarihi', citedBy: 'Kullanan' },
  gate: {
    passed: 'Yayın kapısı geçildi',
    failed: 'Yayın kapısı geçilemedi',
    release: 'yayın modu',
    ci: 'CI modu',
    blockers: 'Bir yayını durdurur',
    overridden: 'Sahip tarafından istisna tanındı',
    pendingModules: 'Bekleyen modüller (diğer aşamalar, asla hata sayılmaz)',
    notes: 'Notlar',
    threshold: 'Herkese açık bir modülün alabileceği en düşük puan',
  },
  pilot: { title: 'Çapraz marka pilotu (iki sentetik marka)', passed: 'Pilot geçti', failed: 'Pilot geçemedi' },
  none: 'yok',
}

export const AUDIT_TEXT: Record<VisualLang, AuditText> = { en, fa, tr }
