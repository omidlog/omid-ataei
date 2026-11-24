import type { VisualLang } from './i18n.js'

/**
 * en/fa/tr text for the competitor comparison matrix and price strip (Visual Blueprint V2.2). Labels and
 * explanations only: competitor names, recorder labels, offer names, hosts and amounts are shown as shared, never
 * translated. The page uses the recognized name "Competitor comparison matrix".
 */
export interface CompetitorText {
  kicker: string
  title: string
  lead: string
  navLabel: string
  ownBrand: string
  ownRowNote: string
  criteria: Record<'offer' | 'audience' | 'geography' | 'public_price' | 'public_message' | 'visual_language' | 'observable_channels', string>
  cellState: Record<'present' | 'unverified' | 'historical' | 'conflicting' | 'needs_review' | 'absent' | 'unknown', string>
  relationship: Record<'direct' | 'indirect' | 'substitute' | 'aspirational_benchmark', string>
  sourceClass: Record<'competitor_own_page' | 'platform_documentation' | 'independent_reporting' | 'analyst_inference' | 'owner_statement' | 'first_party_data' | 'unreadable', string>
  readOn: string
  markets: string
  verifiedDomain: string
  needsRefresh: string
  competitorCol: string
  matrixCaption: string
  sourcesTitle: string
  sourcesLead: string
  pricesTitle: string
  pricesLead: string
  period: Record<'month' | 'year' | 'one_time' | 'unknown', string>
  commitment: Record<'monthly' | 'annual' | 'none' | 'unknown', string>
  tax: Record<'included' | 'excluded' | 'unknown', string>
  rateLabel: Record<'standard_rate' | 'promotional' | 'promotion_unknown' | 'monthly_rate_billed_annually' | 'terms_unknown', string>
  priceState: Record<'observed' | 'unverified' | 'historical' | 'conflicting', string>
  market: string
  currencyGroup: string
  noConversion: string
  unpricedTitle: string
  unpricedBody: string
  noPrices: string
  emptyTitle: string
  emptyBody: string
  emptyStepsTitle: string
  emptySteps: string[]
  sharedEmptyTitle: string
  sharedEmptyBody: string
  withheldTitle: string
  withheldBody: string
  withheldReason: Record<'symlink' | 'unreadable' | 'invalid_record' | 'wrong_brand' | 'unsafe_text', string>
  notShared: string
  withheldText: string
  legendTitle: string
  neverTitle: string
  never: string[]
  detailsIds: string
  openPrint: string
  backToMatrix: string
  printTitle: string
  runningHead: string
  pageMatrix: string
  pagePrices: string
  pageSources: string
  bannerTitle: string
  bannerBody: string
  bannerLink: string
  internalOnly: string
  asOfNone: string
}

const en: CompetitorText = {
  kicker: 'Market and competition',
  title: 'Competitor comparison matrix',
  lead: 'How the competitors you reviewed compare with your brand on the same standard criteria. Drawn only from the landscape you shared; nothing is ranked, scored or converted.',
  navLabel: 'Competitor comparison',
  ownBrand: 'Your brand',
  ownRowNote: 'Your row shows approved facts only. Drafts and gaps show their state, never a value.',
  criteria: {
    offer: 'Offer',
    audience: 'Target audience',
    geography: 'Markets served',
    public_price: 'Public pricing',
    public_message: 'Key message',
    visual_language: 'Visual identity',
    observable_channels: 'Channels',
  },
  cellState: {
    present: 'Observed',
    unverified: 'Observed, source not verified',
    historical: 'Historical',
    conflicting: 'Sources disagree',
    needs_review: 'Source needs review',
    absent: 'Not offered (source states it)',
    unknown: 'Unknown',
  },
  relationship: { direct: 'Direct competitor', indirect: 'Indirect competitor', substitute: 'Substitute', aspirational_benchmark: 'Benchmark' },
  sourceClass: {
    competitor_own_page: 'Competitor’s own page',
    platform_documentation: 'Platform documentation',
    independent_reporting: 'Independent reporting',
    analyst_inference: 'Analyst view',
    owner_statement: 'Owner statement',
    first_party_data: 'First-party data',
    unreadable: 'Source not readable',
  },
  readOn: 'read {date}',
  markets: 'Markets',
  verifiedDomain: 'Verified domain',
  needsRefresh: 'Needs refresh',
  competitorCol: 'Business',
  matrixCaption: 'Rows are businesses, columns are standard comparison criteria. Row order is alphabetical, not a ranking.',
  sourcesTitle: 'Sources',
  sourcesLead: 'Who is speaking and when the source was read. Quotes stay in the owner’s private research notes.',
  pricesTitle: 'Published prices',
  pricesLead: 'As each competitor publishes them, grouped by currency. Never ranked, never converted.',
  period: { month: 'per month', year: 'per year', one_time: 'one-time', unknown: 'period unknown' },
  commitment: { monthly: 'billed monthly', annual: 'billed annually', none: 'no commitment', unknown: 'billing unknown' },
  tax: { included: 'tax included', excluded: 'tax excluded', unknown: 'tax unknown' },
  rateLabel: {
    standard_rate: 'Standard rate',
    promotional: 'Promotional',
    promotion_unknown: 'Promotion not known',
    monthly_rate_billed_annually: 'Monthly rate, billed annually',
    terms_unknown: 'Terms unknown',
  },
  priceState: { observed: 'Current', unverified: 'Current, not verified', historical: 'Historical', conflicting: 'Sources disagree' },
  market: 'Market {market}',
  currencyGroup: 'Prices in {currency}',
  noConversion: 'No currency conversion. Prices in different currencies, markets or terms are not comparable as they stand.',
  unpricedTitle: 'No public price shared',
  unpricedBody: 'Unknown stays unknown: no price is assumed.',
  noPrices: 'No public prices were shared.',
  emptyTitle: 'No competitor landscape shared yet',
  emptyBody: 'This matrix is drawn only from a file you write and commit yourself. Your competitor research stays private until then.',
  emptyStepsTitle: 'To share it',
  emptySteps: [
    'Review competitors in your local index: npm run brand:competitive -- list',
    'Mark each one you have checked: npm run brand:competitive -- status --id … --status owner_reviewed',
    'Write the shared file: npm run brand:competitive -- share',
    'Review the diff, then commit and merge it. Studio shows the matrix after the next sync.',
  ],
  sharedEmptyTitle: 'Shared, but no reviewed competitors yet',
  sharedEmptyBody: 'The shared landscape has no owner-reviewed competitors. Candidates are never shown here.',
  withheldTitle: 'The shared landscape was not shown',
  withheldBody: 'The shared competitor file on this commit did not pass Studio’s checks: {reason}. Run the share command again and commit the result.',
  withheldReason: {
    symlink: 'it is a symbolic link',
    unreadable: 'it could not be read',
    invalid_record: 'its contents are not in the expected shape',
    wrong_brand: 'it belongs to another brand',
    unsafe_text: 'it looks like it contains private data',
  },
  notShared: 'Not shown: {candidates} unreviewed candidate(s), {disputed} disputed, {archived} archived.',
  withheldText: '{count} label(s) were left out because they matched a source quote or looked private.',
  legendTitle: 'How to read the matrix',
  neverTitle: 'What this page never says',
  never: [
    'No ranking, score or winner.',
    'No currency conversion or price comparison across terms.',
    'No ad performance, market share or private commercial terms.',
    'Not a legal clearance, and it approves nothing.',
  ],
  detailsIds: 'Technical ids',
  openPrint: 'Print view',
  backToMatrix: 'Back to the comparison matrix',
  printTitle: 'Print or save as PDF',
  runningHead: 'Brand OS · Competitor comparison matrix',
  pageMatrix: 'Comparison matrix',
  pagePrices: 'Published prices',
  pageSources: 'Sources',
  bannerTitle: 'Competitor comparison matrix',
  bannerBody: 'See how the competitors you reviewed compare with your brand on standard criteria.',
  bannerLink: 'Open the matrix',
  internalOnly: 'Internal edition only: a comparison that names other businesses has no public edition.',
  asOfNone: 'Nothing shared yet',
}

const fa: CompetitorText = {
  kicker: 'بازار و رقابت',
  title: 'ماتریس مقایسهٔ رقبا',
  lead: 'رقبایی که بررسی کرده‌اید، با معیارهای استاندارد یکسان کنار برند شما. فقط از چشم‌انداز به‌اشتراک‌گذاشته‌شده ساخته می‌شود؛ هیچ رتبه‌بندی، امتیازدهی یا تبدیل ارزی در کار نیست.',
  navLabel: 'مقایسهٔ رقبا',
  ownBrand: 'برند شما',
  ownRowNote: 'ردیف شما فقط واقعیت‌های تأییدشده را نشان می‌دهد. پیش‌نویس‌ها و جاهای خالی فقط وضعیتشان را نشان می‌دهند، نه مقدار را.',
  criteria: {
    offer: 'پیشنهاد',
    audience: 'مخاطب هدف',
    geography: 'بازارهای تحت پوشش',
    public_price: 'قیمت‌گذاری عمومی',
    public_message: 'پیام اصلی',
    visual_language: 'هویت بصری',
    observable_channels: 'کانال‌ها',
  },
  cellState: {
    present: 'مشاهده‌شده',
    unverified: 'مشاهده‌شده، منبع تأییدنشده',
    historical: 'قدیمی',
    conflicting: 'منابع ناهمخوان',
    needs_review: 'منبع نیاز به بازبینی دارد',
    absent: 'ارائه نمی‌شود (به گفتهٔ منبع)',
    unknown: 'نامعلوم',
  },
  relationship: { direct: 'رقیب مستقیم', indirect: 'رقیب غیرمستقیم', substitute: 'جایگزین', aspirational_benchmark: 'الگوی مرجع' },
  sourceClass: {
    competitor_own_page: 'صفحهٔ خود رقیب',
    platform_documentation: 'مستندات پلتفرم',
    independent_reporting: 'گزارش مستقل',
    analyst_inference: 'دیدگاه تحلیلگر',
    owner_statement: 'اظهار مالک',
    first_party_data: 'دادهٔ دست‌اول',
    unreadable: 'منبع خوانا نیست',
  },
  readOn: 'خوانده‌شده در {date}',
  markets: 'بازارها',
  verifiedDomain: 'دامنهٔ تأییدشده',
  needsRefresh: 'نیاز به به‌روزرسانی',
  competitorCol: 'کسب‌وکار',
  matrixCaption: 'ردیف‌ها کسب‌وکارها و ستون‌ها معیارهای استاندارد مقایسه‌اند. ترتیب ردیف‌ها الفبایی است، نه رتبه‌بندی.',
  sourcesTitle: 'منابع',
  sourcesLead: 'چه کسی سخن می‌گوید و منبع کی خوانده شده است. نقل‌قول‌ها در یادداشت‌های پژوهشی خصوصی مالک می‌مانند.',
  pricesTitle: 'قیمت‌های منتشرشده',
  pricesLead: 'همان‌طور که هر رقیب منتشر کرده، به تفکیک ارز. هرگز رتبه‌بندی یا تبدیل نمی‌شود.',
  period: { month: 'ماهانه', year: 'سالانه', one_time: 'یک‌باره', unknown: 'دورهٔ نامعلوم' },
  commitment: { monthly: 'صورت‌حساب ماهانه', annual: 'صورت‌حساب سالانه', none: 'بدون تعهد', unknown: 'نحوهٔ صورت‌حساب نامعلوم' },
  tax: { included: 'با مالیات', excluded: 'بدون مالیات', unknown: 'وضعیت مالیات نامعلوم' },
  rateLabel: {
    standard_rate: 'نرخ استاندارد',
    promotional: 'تبلیغاتی',
    promotion_unknown: 'وضعیت تخفیف نامعلوم',
    monthly_rate_billed_annually: 'نرخ ماهانه با پرداخت سالانه',
    terms_unknown: 'شرایط نامعلوم',
  },
  priceState: { observed: 'جاری', unverified: 'جاری، تأییدنشده', historical: 'قدیمی', conflicting: 'منابع ناهمخوان' },
  market: 'بازار {market}',
  currencyGroup: 'قیمت‌ها به {currency}',
  noConversion: 'هیچ تبدیل ارزی انجام نمی‌شود. قیمت‌ها با ارز، بازار یا شرایط متفاوت، همان‌طور که هستند قابل مقایسه نیستند.',
  unpricedTitle: 'قیمت عمومی به اشتراک گذاشته نشده',
  unpricedBody: 'نامعلوم، نامعلوم می‌ماند: هیچ قیمتی فرض نمی‌شود.',
  noPrices: 'هیچ قیمت عمومی‌ای به اشتراک گذاشته نشده است.',
  emptyTitle: 'هنوز چشم‌انداز رقبا به اشتراک گذاشته نشده',
  emptyBody: 'این ماتریس فقط از فایلی ساخته می‌شود که خودتان می‌نویسید و commit می‌کنید. تا آن زمان پژوهش رقبا خصوصی می‌ماند.',
  emptyStepsTitle: 'برای اشتراک‌گذاری',
  emptySteps: [
    'رقبا را در فهرست محلی خود مرور کنید: npm run brand:competitive -- list',
    'هر رقیبی را که بررسی کرده‌اید علامت بزنید: npm run brand:competitive -- status --id … --status owner_reviewed',
    'فایل اشتراکی را بنویسید: npm run brand:competitive -- share',
    'تغییرات را مرور کنید، سپس commit و merge کنید. Studio پس از همگام‌سازی بعدی ماتریس را نشان می‌دهد.',
  ],
  sharedEmptyTitle: 'به اشتراک گذاشته شده، اما هنوز رقیب بررسی‌شده‌ای نیست',
  sharedEmptyBody: 'چشم‌انداز اشتراکی هیچ رقیب بررسی‌شده توسط مالک ندارد. نامزدها هرگز اینجا نشان داده نمی‌شوند.',
  withheldTitle: 'چشم‌انداز اشتراکی نمایش داده نشد',
  withheldBody: 'فایل اشتراکی رقبا در این commit از بررسی‌های Studio عبور نکرد: {reason}. فرمان اشتراک‌گذاری را دوباره اجرا و نتیجه را commit کنید.',
  withheldReason: {
    symlink: 'یک پیوند نمادین است',
    unreadable: 'خوانده نشد',
    invalid_record: 'محتوای آن ساختار مورد انتظار را ندارد',
    wrong_brand: 'متعلق به برند دیگری است',
    unsafe_text: 'به نظر می‌رسد دادهٔ خصوصی دارد',
  },
  notShared: 'نمایش داده نشده: {candidates} نامزد بررسی‌نشده، {disputed} مورد مناقشه، {archived} بایگانی‌شده.',
  withheldText: '{count} برچسب کنار گذاشته شد، چون با نقل‌قول منبع یکی بود یا خصوصی به نظر می‌رسید.',
  legendTitle: 'راهنمای خواندن ماتریس',
  neverTitle: 'آنچه این صفحه هرگز نمی‌گوید',
  never: [
    'هیچ رتبه‌بندی، امتیاز یا برنده‌ای.',
    'هیچ تبدیل ارزی یا مقایسهٔ قیمت با شرایط متفاوت.',
    'هیچ دادهٔ عملکرد تبلیغات، سهم بازار یا شرایط تجاری خصوصی.',
    'مجوز حقوقی نیست و هیچ چیزی را تأیید نمی‌کند.',
  ],
  detailsIds: 'شناسه‌های فنی',
  openPrint: 'نمای چاپی',
  backToMatrix: 'بازگشت به ماتریس مقایسه',
  printTitle: 'چاپ یا ذخیره به‌صورت PDF',
  runningHead: 'Brand OS · ماتریس مقایسهٔ رقبا',
  pageMatrix: 'ماتریس مقایسه',
  pagePrices: 'قیمت‌های منتشرشده',
  pageSources: 'منابع',
  bannerTitle: 'ماتریس مقایسهٔ رقبا',
  bannerBody: 'ببینید رقبایی که بررسی کرده‌اید با معیارهای استاندارد چگونه کنار برند شما قرار می‌گیرند.',
  bannerLink: 'باز کردن ماتریس',
  internalOnly: 'فقط نسخهٔ داخلی: مقایسه‌ای که نام کسب‌وکارهای دیگر را می‌برد نسخهٔ عمومی ندارد.',
  asOfNone: 'هنوز چیزی به اشتراک گذاشته نشده',
}

const tr: CompetitorText = {
  kicker: 'Pazar ve rekabet',
  title: 'Rakip karşılaştırma matrisi',
  lead: 'İncelediğiniz rakiplerin aynı standart ölçütlerde markanızla karşılaştırması. Yalnızca paylaştığınız rekabet görünümünden çizilir; sıralama, puanlama veya kur dönüşümü yoktur.',
  navLabel: 'Rakip karşılaştırması',
  ownBrand: 'Markanız',
  ownRowNote: 'Sizin satırınız yalnızca onaylı bilgileri gösterir. Taslaklar ve boşluklar değeri değil, yalnızca durumu gösterir.',
  criteria: {
    offer: 'Teklif',
    audience: 'Hedef kitle',
    geography: 'Hizmet verilen pazarlar',
    public_price: 'Açık fiyatlandırma',
    public_message: 'Ana mesaj',
    visual_language: 'Görsel kimlik',
    observable_channels: 'Kanallar',
  },
  cellState: {
    present: 'Gözlendi',
    unverified: 'Gözlendi, kaynak doğrulanmadı',
    historical: 'Eski',
    conflicting: 'Kaynaklar çelişiyor',
    needs_review: 'Kaynak gözden geçirilmeli',
    absent: 'Sunulmuyor (kaynak belirtiyor)',
    unknown: 'Bilinmiyor',
  },
  relationship: { direct: 'Doğrudan rakip', indirect: 'Dolaylı rakip', substitute: 'İkame', aspirational_benchmark: 'Örnek alınan' },
  sourceClass: {
    competitor_own_page: 'Rakibin kendi sayfası',
    platform_documentation: 'Platform belgeleri',
    independent_reporting: 'Bağımsız haber',
    analyst_inference: 'Analist görüşü',
    owner_statement: 'Sahip beyanı',
    first_party_data: 'Birinci taraf verisi',
    unreadable: 'Kaynak okunamadı',
  },
  readOn: '{date} tarihinde okundu',
  markets: 'Pazarlar',
  verifiedDomain: 'Doğrulanmış alan adı',
  needsRefresh: 'Yenilenmeli',
  competitorCol: 'İşletme',
  matrixCaption: 'Satırlar işletmeler, sütunlar standart karşılaştırma ölçütleridir. Satır sırası alfabetiktir, sıralama değildir.',
  sourcesTitle: 'Kaynaklar',
  sourcesLead: 'Kimin konuştuğu ve kaynağın ne zaman okunduğu. Alıntılar sahibin özel araştırma notlarında kalır.',
  pricesTitle: 'Yayımlanan fiyatlar',
  pricesLead: 'Her rakibin yayımladığı şekliyle, para birimine göre gruplanmış. Asla sıralanmaz, asla dönüştürülmez.',
  period: { month: 'aylık', year: 'yıllık', one_time: 'tek seferlik', unknown: 'dönem bilinmiyor' },
  commitment: { monthly: 'aylık faturalı', annual: 'yıllık faturalı', none: 'taahhütsüz', unknown: 'faturalama bilinmiyor' },
  tax: { included: 'vergi dahil', excluded: 'vergi hariç', unknown: 'vergi bilinmiyor' },
  rateLabel: {
    standard_rate: 'Standart fiyat',
    promotional: 'Kampanyalı',
    promotion_unknown: 'Kampanya durumu bilinmiyor',
    monthly_rate_billed_annually: 'Aylık fiyat, yıllık faturalı',
    terms_unknown: 'Koşullar bilinmiyor',
  },
  priceState: { observed: 'Güncel', unverified: 'Güncel, doğrulanmadı', historical: 'Eski', conflicting: 'Kaynaklar çelişiyor' },
  market: 'Pazar {market}',
  currencyGroup: '{currency} fiyatları',
  noConversion: 'Kur dönüşümü yapılmaz. Farklı para birimi, pazar veya koşullardaki fiyatlar olduğu haliyle karşılaştırılamaz.',
  unpricedTitle: 'Açık fiyat paylaşılmadı',
  unpricedBody: 'Bilinmeyen bilinmeyen olarak kalır: hiçbir fiyat varsayılmaz.',
  noPrices: 'Açık fiyat paylaşılmadı.',
  emptyTitle: 'Henüz rekabet görünümü paylaşılmadı',
  emptyBody: 'Bu matris yalnızca sizin yazıp commit ettiğiniz bir dosyadan çizilir. O zamana kadar rakip araştırmanız özel kalır.',
  emptyStepsTitle: 'Paylaşmak için',
  emptySteps: [
    'Yerel dizininizdeki rakipleri gözden geçirin: npm run brand:competitive -- list',
    'İncelediğiniz her birini işaretleyin: npm run brand:competitive -- status --id … --status owner_reviewed',
    'Paylaşılan dosyayı yazın: npm run brand:competitive -- share',
    'Farkı inceleyin, sonra commit edip birleştirin. Studio matrisi bir sonraki eşitlemeden sonra gösterir.',
  ],
  sharedEmptyTitle: 'Paylaşıldı, ama henüz incelenmiş rakip yok',
  sharedEmptyBody: 'Paylaşılan görünümde sahibin incelediği rakip yok. Adaylar burada hiç gösterilmez.',
  withheldTitle: 'Paylaşılan rekabet görünümü gösterilmedi',
  withheldBody: 'Bu commit’teki paylaşılan rakip dosyası Studio denetimlerinden geçmedi: {reason}. Paylaşma komutunu yeniden çalıştırıp sonucu commit edin.',
  withheldReason: {
    symlink: 'sembolik bağlantı',
    unreadable: 'okunamadı',
    invalid_record: 'içeriği beklenen yapıda değil',
    wrong_brand: 'başka bir markaya ait',
    unsafe_text: 'özel veri içeriyor gibi görünüyor',
  },
  notShared: 'Gösterilmeyen: {candidates} incelenmemiş aday, {disputed} itirazlı, {archived} arşivlenmiş.',
  withheldText: '{count} etiket bir kaynak alıntısıyla eşleştiği veya özel göründüğü için çıkarıldı.',
  legendTitle: 'Matris nasıl okunur',
  neverTitle: 'Bu sayfanın asla söylemedikleri',
  never: [
    'Sıralama, puan veya kazanan yok.',
    'Kur dönüşümü veya farklı koşullardaki fiyatların karşılaştırması yok.',
    'Reklam performansı, pazar payı veya özel ticari koşullar yok.',
    'Hukuki uygunluk onayı değildir ve hiçbir şeyi onaylamaz.',
  ],
  detailsIds: 'Teknik kimlikler',
  openPrint: 'Baskı görünümü',
  backToMatrix: 'Karşılaştırma matrisine dön',
  printTitle: 'Yazdır veya PDF olarak kaydet',
  runningHead: 'Brand OS · Rakip karşılaştırma matrisi',
  pageMatrix: 'Karşılaştırma matrisi',
  pagePrices: 'Yayımlanan fiyatlar',
  pageSources: 'Kaynaklar',
  bannerTitle: 'Rakip karşılaştırma matrisi',
  bannerBody: 'İncelediğiniz rakiplerin standart ölçütlerde markanızla nasıl karşılaştırıldığını görün.',
  bannerLink: 'Matrisi aç',
  internalOnly: 'Yalnızca iç sürüm: başka işletmeleri adıyla anan bir karşılaştırmanın kamuya açık sürümü yoktur.',
  asOfNone: 'Henüz paylaşılan bir şey yok',
}

export const COMPETITOR_TEXT: Record<VisualLang, CompetitorText> = { en, fa, tr }

export function competitorText(lang: VisualLang): CompetitorText {
  return COMPETITOR_TEXT[lang]
}
