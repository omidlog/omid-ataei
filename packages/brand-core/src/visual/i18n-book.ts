import type { VisualLang } from './i18n.js'

/**
 * en/fa/tr text for the print engine's book profile (Visual Blueprint V1.2): cover, imprint, contents, running
 * heads, folios, notes and continued tables, plus the owner's `brand:export-visual` messages. Labels only; brand
 * values are never translated. `{name}` placeholders are filled with `fillVisual`.
 */
export interface BookText {
  bookTitle: string
  coverKicker: string
  coverChapter: string
  imprintTitle: string
  imprintBrand: string
  imprintDocument: string
  imprintEdition: string
  imprintAsOf: string
  imprintCommit: string
  imprintTypeset: string
  typesetValue: string
  imprintFormat: string
  formatBook: string
  imprintRules: string
  imprintClaims: string
  imprintOrigin: string
  imprintOriginFixture: string
  contentsTitle: string
  contentsPage: string
  appendixTitle: string
  continued: string
  tableContinues: string
  notes: string
  noteRef: string
  folio: string
  printHint: string
  exportWrote: string
  exportNoChrome: string
  exportMeasured: string
  exportOverflow: string
  exportPlanned: string
  exportRefusedPath: string
  exportRefusedAgent: string
  exportNoDocument: string
  imprintUncommitted: string
  exportUncommitted: string
  exportMeasureFailed: string
}

const en: BookText = {
  bookTitle: 'Brand Book',
  coverKicker: 'Brand Book',
  coverChapter: 'Chapter',
  imprintTitle: 'Imprint',
  imprintBrand: 'Brand',
  imprintDocument: 'Document',
  imprintEdition: 'Edition',
  imprintAsOf: 'Facts as of',
  imprintCommit: 'Source commit',
  imprintTypeset: 'Typeset in',
  typesetValue: 'Inter, Rajdhani and Vazirmatn, under the SIL Open Font License 1.1',
  imprintFormat: 'Format',
  formatBook: 'A4 portrait book, {pages} pages',
  imprintRules: 'Every plate is drawn from approved facts and the approved master file only. Drafts are never printed, restricted values are withheld, and gaps stay visible as gaps.',
  imprintClaims: 'Framework and standard names show what informed the method. This book is not a certification and claims no conformance.',
  imprintOrigin: 'Composed by Brand OS from the brand repository at the commit above.',
  imprintOriginFixture: 'Composed by Brand OS from fictional example data. Nothing in it is a brand fact.',
  contentsTitle: 'Contents',
  contentsPage: 'Page',
  appendixTitle: 'Sources and framework',
  continued: '{title}, continued',
  tableContinues: 'Continues on the next page',
  notes: 'Notes',
  noteRef: 'Note {n}',
  folio: 'Page {n}',
  printHint: 'A4 portrait book. Print with the browser, margins "None" or "Default", background graphics on.',
  exportWrote: 'wrote {file}',
  exportNoChrome: 'No Chrome found (set CHROME_PATH) or --no-pdf given: HTML only, paginated with built-in estimates.',
  exportMeasured: 'measured {count} blocks in Chrome; pagination uses the measured heights',
  exportOverflow: 'warning: page {page} of {file} still overflows after measuring; please report it',
  exportPlanned: 'The {profile} profile is planned, not built yet. Nothing was written.',
  exportRefusedPath: 'Refused: the output folder must be outside brand/ and .private folders, so generated files never mix with brand truth.',
  exportRefusedAgent: 'Refused: brand:export-visual is an owner command and does not run under an agent token.',
  exportNoDocument: 'This brand has no {doc} document to export (the module may be off, or the brand has no answers yet).',
  imprintUncommitted: 'plus changes in brand/ not yet committed',
  exportUncommitted: 'note: brand/ has changes that are not committed yet. The export shows this working copy, and the imprint says so next to the commit.',
  exportMeasureFailed: 'warning: measuring in Chrome failed; pagination uses the built-in estimates, and the overflow check still runs',
}

const fa: BookText = {
  bookTitle: 'کتاب برند',
  coverKicker: 'کتاب برند',
  coverChapter: 'فصل',
  imprintTitle: 'شناسنامه',
  imprintBrand: 'برند',
  imprintDocument: 'سند',
  imprintEdition: 'ویرایش',
  imprintAsOf: 'اطلاعات تا تاریخ',
  imprintCommit: 'کامیت منبع',
  imprintTypeset: 'حروف‌چینی',
  typesetValue: 'Inter، Rajdhani و وزیرمتن، با مجوز SIL Open Font License 1.1',
  imprintFormat: 'قطع',
  formatBook: 'کتاب A4 عمودی، {pages} صفحه',
  imprintRules: 'هر صفحهٔ نمونه فقط از اطلاعات تأییدشده و فایل اصلی تأییدشده ساخته می‌شود. پیش‌نویس‌ها هرگز چاپ نمی‌شوند، مقادیر محرمانه پنهان می‌مانند و جاهای خالی خالی نشان داده می‌شوند.',
  imprintClaims: 'نام چارچوب‌ها و استانداردها فقط نشان می‌دهد روش از چه چیزی الهام گرفته است. این کتاب گواهی‌نامه نیست و ادعای انطباق ندارد.',
  imprintOrigin: 'این کتاب را Brand OS از مخزن برند در کامیت بالا ساخته است.',
  imprintOriginFixture: 'این کتاب را Brand OS از دادهٔ نمونهٔ خیالی ساخته است. هیچ‌چیز در آن اطلاعات برند نیست.',
  contentsTitle: 'فهرست',
  contentsPage: 'صفحه',
  appendixTitle: 'منابع و چارچوب',
  continued: '{title} (ادامه)',
  tableContinues: 'ادامه در صفحهٔ بعد',
  notes: 'یادداشت‌ها',
  noteRef: 'یادداشت {n}',
  folio: 'صفحهٔ {n}',
  printHint: 'کتاب A4 عمودی. با مرورگر چاپ کنید، حاشیه «هیچ» یا «پیش‌فرض» و گرافیک پس‌زمینه روشن.',
  exportWrote: '{file} نوشته شد',
  exportNoChrome: 'Chrome پیدا نشد (CHROME_PATH را تنظیم کنید) یا --no-pdf داده شد: فقط HTML، با صفحه‌بندی بر پایهٔ برآورد داخلی.',
  exportMeasured: '{count} بلوک در Chrome اندازه‌گیری شد؛ صفحه‌بندی از اندازه‌های واقعی استفاده می‌کند',
  exportOverflow: 'هشدار: صفحهٔ {page} از {file} پس از اندازه‌گیری هنوز سرریز دارد؛ لطفاً گزارش دهید',
  exportPlanned: 'پروفایل {profile} برنامه‌ریزی شده ولی هنوز ساخته نشده است. چیزی نوشته نشد.',
  exportRefusedPath: 'رد شد: پوشهٔ خروجی باید بیرون از brand/ و پوشه‌های .private باشد تا فایل‌های ساخته‌شده با اطلاعات اصلی برند قاطی نشوند.',
  exportRefusedAgent: 'رد شد: brand:export-visual فرمان مالک است و با توکن عامل اجرا نمی‌شود.',
  exportNoDocument: 'این برند سند {doc} برای خروجی ندارد (شاید ماژول خاموش است یا هنوز پاسخی ثبت نشده).',
  imprintUncommitted: 'به‌همراه تغییرهایی در brand/ که هنوز کامیت نشده‌اند',
  exportUncommitted: 'توجه: در brand/ تغییرهایی هست که هنوز کامیت نشده‌اند. خروجی همین نسخهٔ فعلی را نشان می‌دهد و شناسنامه هم کنار کامیت این را می‌گوید.',
  exportMeasureFailed: 'هشدار: اندازه‌گیری در Chrome انجام نشد؛ صفحه‌بندی از برآورد داخلی استفاده می‌کند و بررسی سرریز همچنان انجام می‌شود',
}

const tr: BookText = {
  bookTitle: 'Marka Kitabı',
  coverKicker: 'Marka Kitabı',
  coverChapter: 'Bölüm',
  imprintTitle: 'Künye',
  imprintBrand: 'Marka',
  imprintDocument: 'Belge',
  imprintEdition: 'Sürüm',
  imprintAsOf: 'Bilgilerin tarihi',
  imprintCommit: 'Kaynak commit',
  imprintTypeset: 'Dizgi',
  typesetValue: 'Inter, Rajdhani ve Vazirmatn, SIL Open Font License 1.1 ile',
  imprintFormat: 'Biçim',
  formatBook: 'A4 dikey kitap, {pages} sayfa',
  imprintRules: 'Her levha yalnızca onaylı bilgilerden ve onaylı ana dosyadan çizilir. Taslaklar asla basılmaz, kısıtlı değerler gizlenir, boşluklar boşluk olarak görünür.',
  imprintClaims: 'Çerçeve ve standart adları yönteme neyin yol gösterdiğini belirtir. Bu kitap bir sertifika değildir ve uygunluk iddiası taşımaz.',
  imprintOrigin: 'Brand OS tarafından, yukarıdaki commit anındaki marka deposundan derlendi.',
  imprintOriginFixture: 'Brand OS tarafından kurgusal örnek verilerle derlendi. İçindekilerin hiçbiri marka bilgisi değildir.',
  contentsTitle: 'İçindekiler',
  contentsPage: 'Sayfa',
  appendixTitle: 'Kaynaklar ve çerçeve',
  continued: '{title} (devam)',
  tableContinues: 'Sonraki sayfada devam ediyor',
  notes: 'Notlar',
  noteRef: 'Not {n}',
  folio: 'Sayfa {n}',
  printHint: 'A4 dikey kitap. Tarayıcıyla yazdırın; kenar boşluğu "Yok" veya "Varsayılan", arka plan grafikleri açık.',
  exportWrote: '{file} yazıldı',
  exportNoChrome: 'Chrome bulunamadı (CHROME_PATH ayarlayın) veya --no-pdf verildi: yalnızca HTML, yerleşik tahminlerle sayfalandı.',
  exportMeasured: "Chrome'da {count} blok ölçüldü; sayfalama ölçülen yükseklikleri kullanıyor",
  exportOverflow: 'uyarı: {file} dosyasının {page}. sayfası ölçümden sonra hâlâ taşıyor; lütfen bildirin',
  exportPlanned: '{profile} profili planlandı ama henüz yapılmadı. Hiçbir şey yazılmadı.',
  exportRefusedPath: 'Reddedildi: çıktı klasörü brand/ ve .private klasörlerinin dışında olmalı; üretilen dosyalar marka gerçeğiyle karışmaz.',
  exportRefusedAgent: 'Reddedildi: brand:export-visual bir sahip komutudur ve ajan belirteciyle çalışmaz.',
  exportNoDocument: 'Bu markanın dışa aktarılacak {doc} belgesi yok (modül kapalı olabilir ya da henüz yanıt yok).',
  imprintUncommitted: 've brand/ içinde henüz commit edilmemiş değişiklikler',
  exportUncommitted: 'not: brand/ içinde henüz commit edilmemiş değişiklikler var. Dışa aktarım bu çalışma kopyasını gösterir; künye bunu commit bilgisinin yanında belirtir.',
  exportMeasureFailed: "uyarı: Chrome'da ölçüm başarısız oldu; sayfalama yerleşik tahminleri kullanıyor, taşma denetimi yine çalışıyor",
}

export const BOOK_TEXT: Record<VisualLang, BookText> = { en, fa, tr }

export function bookText(lang: VisualLang): BookText {
  return BOOK_TEXT[lang]
}
