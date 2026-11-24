import { ENTITY_TEXT, type EntityText } from './i18n-entities.js'
import { IDENTITY_TEXT, type IdentityText } from './i18n-identity.js'
import type { BmcZoneId, BmcZone, DataState, MissingReason, PermittedClaim } from './model.js'

/**
 * en/fa/tr text for the visual renderers (Studio page and the static print view share it). Labels and instructions
 * only: brand values are never translated here. Zone prompts are original Brand OS wording, not Strategyzer copy.
 */
export const VISUAL_LANGS = ['en', 'fa', 'tr'] as const
export type VisualLang = (typeof VISUAL_LANGS)[number]

export function isVisualLang(value: unknown): value is VisualLang {
  return typeof value === 'string' && (VISUAL_LANGS as readonly string[]).includes(value)
}

export interface VisualCatalog {
  dir: 'ltr' | 'rtl'
  /** Brand Book "Visual identity" chapter (V2.1). */
  identity: IdentityText
  /** Business Model Canvas list questions (V3.1). */
  entities: EntityText
  zone: Record<BmcZoneId, { title: string; prompt: string }>
  state: Record<DataState, string>
  zoneState: Record<BmcZone['state'], string>
  claim: Record<PermittedClaim, string>
  missingReason: Record<MissingReason, string>
  proposed: Record<string, string>
  text: {
    canvasTitle: string
    canvasKicker: string
    editionInternal: string
    editionPublic: string
    editionInternalNote: string
    editionPublicNote: string
    illustrative: string
    illustrativeNote: string
    asOf: string
    asOfNone: string
    asOfLabel: string
    commit: string
    classification: string
    classInternal: string
    classPublic: string
    zoneIndex: string
    zoneIndexHint: string
    nextQuestions: string
    proposedQuestion: string
    existingQuestion: string
    related: string
    relatedHint: string
    gapTitle: string
    gapBody: string
    withheldValue: string
    notApplicableZone: string
    /** BOS-15: the brand's interview profile does not ask this question (not an owner answer). */
    notApplicableProfile: string
    /** BOS-15: a personal answer standing in for a framework question; {id} is the personal question id. */
    standsFor: string
    /** BOS-15: a whole framework with nothing that applies to the brand's profile. */
    profileNotApplicableBody: string
    relationshipsTitle: string
    relationshipsBody: string
    sourcesTitle: string
    sourcesIntro: string
    colField: string
    colState: string
    colVersion: string
    colApproved: string
    colSources: string
    frameworkTitle: string
    licence: string
    sourceLink: string
    notVerified: string
    checked: string
    summaryTitle: string
    decisionTitle: string
    decisionBody: string
    printTitle: string
    printHint: string
    pageCanvas: string
    pageSources: string
    statusLegend: string
    noValueYet: string
    version: string
    openPrint: string
    openPrintPublic: string
    backToCanvas: string
    notApplicableTitle: string
    notApplicableBody: string
    runningHead: string
    pending: string
    unavailable: string
    printButton: string
    printOnly: string
    detailsTitle: string
    detailsFields: string
    sourceShort: string
  }
}

const en: VisualCatalog = {
  dir: 'ltr',
  identity: IDENTITY_TEXT.en,
  entities: ENTITY_TEXT.en,
  zone: {
    key_partners: { title: 'Key partners', prompt: 'Who do we depend on to deliver?' },
    key_activities: { title: 'Key activities', prompt: 'What must we do well, every week?' },
    key_resources: { title: 'Key resources', prompt: 'Which assets make the offer possible?' },
    value_propositions: { title: 'Value propositions', prompt: 'Why does the customer choose us?' },
    customer_relationships: { title: 'Customer relationships', prompt: 'How do we win, keep and support customers?' },
    channels: { title: 'Channels', prompt: 'How do customers find, buy and receive the offer?' },
    customer_segments: { title: 'Customer segments', prompt: 'Who do we create value for?' },
    cost_structure: { title: 'Cost structure', prompt: 'What drives our costs?' },
    revenue_streams: { title: 'Revenue streams', prompt: 'How does value turn into income?' },
  },
  state: {
    approved: 'Approved',
    assumption: 'Draft, not approved',
    recommendation: 'Suggestion, not a decision',
    missing: 'Missing',
    withheld: 'Withheld',
    stale: 'Approved, review overdue',
    conflicting: 'Conflicting',
    not_applicable: 'Not applicable',
  },
  zoneState: { complete: 'Complete', partial: 'Partial', missing: 'Missing', withheld: 'Withheld', not_applicable: 'Not applicable' },
  missingReason: { unanswered: 'Not answered yet', unknown: 'The owner said this is unknown', skipped: 'Skipped by the owner', deprecated: 'The last answer was deprecated', not_published: 'Not published' },
  claim: {
    informed_by: 'Informed by',
    aligned_with: 'Aligned with',
    verified_against: 'Verified against',
    externally_certified: 'Externally certified',
    original_professional_template: 'Original Brand OS template',
  },
  proposed: {
    'business.model.key_activities': 'Which activities must the business perform well to deliver each offer?',
    'business.model.key_resources': 'Which resources (people, systems, IP, assets) are essential to deliver each offer?',
    'business.model.segments': 'List each customer segment separately and say how it differs from the others.',
    'business.model.cost_items': 'List the main cost categories, fixed or variable, without amounts.',
  },
  text: {
    canvasTitle: 'Business Model Canvas',
    canvasKicker: 'Strategy · Business model',
    editionInternal: 'Internal edition',
    editionPublic: 'Public edition',
    editionInternalNote: 'Approved facts are canonical. Drafts are labelled and are not decisions. Restricted values are withheld. Gaps stay gaps.',
    editionPublicNote: 'Only approved, published, public facts. Drafts and restricted values are left out.',
    illustrative: 'ILLUSTRATIVE / MOCK DATA',
    illustrativeNote: 'A golden example built from invented fixture data. Not a real brand, not approved, not a template answer.',
    asOf: 'As of {date}',
    asOfNone: 'No approved fact yet',
    asOfLabel: 'Data as of',
    commit: 'Source commit',
    classification: 'Classification',
    classInternal: 'Internal. Owner and team only.',
    classPublic: 'Public',
    zoneIndex: 'Canvas zones',
    zoneIndexHint: 'Jump to a zone. The canvas keeps its nine-zone layout and scrolls sideways on small screens.',
    nextQuestions: 'To fill this zone',
    proposedQuestion: 'New question (proposed, not in the interview yet)',
    existingQuestion: 'Answer and approve',
    related: 'Related answers',
    relatedHint: 'These may inform the zone; they do not answer it.',
    gapTitle: 'No question owns this zone yet',
    gapBody: 'Nothing is shown here until the owner answers and approves it. Nothing was guessed.',
    withheldValue: 'Restricted value withheld',
    notApplicableZone: 'The owner marked this not applicable.',
    notApplicableProfile: 'Not applicable to this profile.',
    standsFor: 'From your personal answer {id}.',
    profileNotApplicableBody: 'Nothing in this framework applies to this brand’s interview profile and no personal answer stands in for it. For a full plan of a venture, set brand.profile to universal with the personal module on, or give the venture its own repository.',
    relationshipsTitle: 'Links between zones',
    relationshipsBody: 'Segments, offers, channels and revenue streams are single prose answers today, so no link between them is drawn. Linked entities are a planned interview change.',
    sourcesTitle: 'Sources and states',
    sourcesIntro: 'Every entry on the canvas, the question that owns it, its state and its approved version.',
    colField: 'Field',
    colState: 'State',
    colVersion: 'Version',
    colApproved: 'Approved on',
    colSources: 'Source ids',
    frameworkTitle: 'Framework',
    licence: 'Licence status',
    sourceLink: 'Reference',
    notVerified: 'Source page not re-checked by a person yet',
    checked: 'Source checked',
    summaryTitle: 'Coverage',
    decisionTitle: 'What this supports',
    decisionBody: 'A one-page read of how the business creates, delivers and captures value, with every gap named.',
    printTitle: 'Print or save as PDF',
    printHint: 'Use the browser’s Print command. The page is laid out for A3 landscape; the second page lists every source.',
    pageCanvas: 'Canvas',
    pageSources: 'Sources',
    statusLegend: 'States',
    noValueYet: 'Not answered yet',
    version: 'v{version}',
    openPrint: 'Print view (internal)',
    openPrintPublic: 'Print view (public)',
    backToCanvas: 'Back to the canvas',
    notApplicableTitle: 'Not used for this profile',
    notApplicableBody: 'A personal brand gets a Business Model Canvas only with the founder or consultant facet.',
    runningHead: 'Brand OS · Business Model Canvas',
    pending: 'This commit was synced before the canvas existed. Press Refresh to build it.',
    unavailable: 'The canvas could not be built from this commit. The rest of the brand is unaffected.',
    printButton: 'Print or save as PDF',
    printOnly: 'Studio is read-only: this view only prints what is already merged.',
    detailsTitle: 'Details and sources',
    detailsFields: 'Question ids',
    sourceShort: 'Source',
  },
}

const fa: VisualCatalog = {
  dir: 'rtl',
  identity: IDENTITY_TEXT.fa,
  entities: ENTITY_TEXT.fa,
  zone: {
    key_partners: { title: 'شرکای کلیدی', prompt: 'برای ارائه به چه کسانی وابسته‌ایم؟' },
    key_activities: { title: 'فعالیت‌های کلیدی', prompt: 'چه کارهایی را باید هر هفته خوب انجام دهیم؟' },
    key_resources: { title: 'منابع کلیدی', prompt: 'کدام دارایی‌ها ارائهٔ پیشنهاد را ممکن می‌کنند؟' },
    value_propositions: { title: 'ارزش پیشنهادی', prompt: 'مشتری چرا ما را انتخاب می‌کند؟' },
    customer_relationships: { title: 'ارتباط با مشتری', prompt: 'چگونه مشتری را جذب، حفظ و پشتیبانی می‌کنیم؟' },
    channels: { title: 'کانال‌ها', prompt: 'مشتری چگونه پیشنهاد را پیدا می‌کند، می‌خرد و دریافت می‌کند؟' },
    customer_segments: { title: 'بخش‌های مشتری', prompt: 'برای چه کسانی ارزش می‌سازیم؟' },
    cost_structure: { title: 'ساختار هزینه', prompt: 'چه چیزی هزینه‌های ما را می‌سازد؟' },
    revenue_streams: { title: 'جریان‌های درآمد', prompt: 'ارزش چگونه به درآمد تبدیل می‌شود؟' },
  },
  state: {
    approved: 'تأییدشده',
    assumption: 'پیش‌نویس، تأییدنشده',
    recommendation: 'پیشنهاد، نه تصمیم',
    missing: 'ثبت‌نشده',
    withheld: 'محرمانه، نمایش داده نمی‌شود',
    stale: 'تأییدشده، بازبینی عقب افتاده',
    conflicting: 'متناقض',
    not_applicable: 'موضوعیت ندارد',
  },
  zoneState: { complete: 'کامل', partial: 'ناقص', missing: 'ثبت‌نشده', withheld: 'محرمانه', not_applicable: 'موضوعیت ندارد' },
  missingReason: { unanswered: 'هنوز پاسخی ثبت نشده', unknown: 'مالک گفته نامعلوم است', skipped: 'مالک از آن گذشته است', deprecated: 'آخرین پاسخ کنار گذاشته شده', not_published: 'منتشر نشده' },
  claim: {
    informed_by: 'با الهام از',
    aligned_with: 'هم‌راستا با',
    verified_against: 'بررسی‌شده در برابر',
    externally_certified: 'دارای گواهی مستقل',
    original_professional_template: 'قالب اختصاصی Brand OS',
  },
  proposed: {
    'business.model.key_activities': 'کسب‌وکار برای ارائهٔ هر پیشنهاد باید کدام فعالیت‌ها را خوب انجام دهد؟',
    'business.model.key_resources': 'برای ارائهٔ هر پیشنهاد، کدام منابع (افراد، سامانه‌ها، دارایی فکری، تجهیزات) ضروری‌اند؟',
    'business.model.segments': 'هر بخش مشتری را جدا بنویسید و بگویید با بقیه چه فرقی دارد.',
    'business.model.cost_items': 'دسته‌های اصلی هزینه را، ثابت یا متغیر، بدون مبلغ فهرست کنید.',
  },
  text: {
    canvasTitle: 'بوم مدل کسب‌وکار',
    canvasKicker: 'استراتژی · مدل کسب‌وکار',
    editionInternal: 'نسخهٔ داخلی',
    editionPublic: 'نسخهٔ عمومی',
    editionInternalNote: 'واقعیت‌های تأییدشده مرجع‌اند. پیش‌نویس‌ها برچسب دارند و تصمیم نیستند. مقادیر محرمانه نمایش داده نمی‌شوند. جاهای خالی خالی می‌مانند.',
    editionPublicNote: 'فقط واقعیت‌های تأییدشده، منتشرشده و عمومی. پیش‌نویس‌ها و مقادیر محرمانه حذف شده‌اند.',
    illustrative: 'ILLUSTRATIVE / MOCK DATA · نمونهٔ ساختگی',
    illustrativeNote: 'نمونهٔ مرجع ساخته‌شده از داده‌های ساختگی. برند واقعی نیست، تأیید نشده و پاسخ پیش‌فرض نیست.',
    asOf: 'به‌روز تا {date}',
    asOfNone: 'هنوز هیچ واقعیتی تأیید نشده',
    asOfLabel: 'تاریخ داده‌ها',
    commit: 'کامیت منبع',
    classification: 'سطح دسترسی',
    classInternal: 'داخلی؛ فقط مالک و تیم.',
    classPublic: 'عمومی',
    zoneIndex: 'بخش‌های بوم',
    zoneIndexHint: 'به یک بخش بروید. بوم چیدمان نُه‌بخشی خود را حفظ می‌کند و در صفحه‌های کوچک افقی پیمایش می‌شود.',
    nextQuestions: 'برای تکمیل این بخش',
    proposedQuestion: 'پرسش جدید (پیشنهادی، هنوز در مصاحبه نیست)',
    existingQuestion: 'پاسخ دهید و تأیید کنید',
    related: 'پاسخ‌های مرتبط',
    relatedHint: 'ممکن است به این بخش کمک کنند، اما پاسخ آن نیستند.',
    gapTitle: 'هنوز هیچ پرسشی مالک این بخش نیست',
    gapBody: 'تا وقتی مالک پاسخ ندهد و تأیید نکند، اینجا چیزی نمایش داده نمی‌شود. هیچ چیزی حدس زده نشده است.',
    withheldValue: 'مقدار محرمانه نمایش داده نمی‌شود',
    notApplicableZone: 'مالک این مورد را نامرتبط اعلام کرده است.',
    notApplicableProfile: 'در این نمایه موضوعیت ندارد.',
    standsFor: 'از پاسخ شخصی شما {id}.',
    profileNotApplicableBody: 'هیچ بخشی از این چارچوب در نمایهٔ مصاحبهٔ این برند موضوعیت ندارد و پاسخ شخصی‌ای جای آن را نمی‌گیرد. برای برنامهٔ کامل یک کسب‌وکار، brand.profile را universal بگذارید و ماژول شخصی را روشن نگه دارید، یا برای آن کسب‌وکار مخزن جداگانه بسازید.',
    relationshipsTitle: 'پیوند میان بخش‌ها',
    relationshipsBody: 'بخش‌های مشتری، پیشنهادها، کانال‌ها و جریان‌های درآمد اکنون هر کدام یک پاسخ متنی‌اند؛ بنابراین هیچ پیوندی میانشان رسم نمی‌شود. موجودیت‌های پیوندی تغییر برنامه‌ریزی‌شدهٔ مصاحبه است.',
    sourcesTitle: 'منابع و وضعیت‌ها',
    sourcesIntro: 'هر مورد روی بوم، پرسشی که مالک آن است، وضعیت و نسخهٔ تأییدشده‌اش.',
    colField: 'فیلد',
    colState: 'وضعیت',
    colVersion: 'نسخه',
    colApproved: 'تاریخ تأیید',
    colSources: 'شناسهٔ منابع',
    frameworkTitle: 'چارچوب',
    licence: 'وضعیت مجوز',
    sourceLink: 'مرجع',
    notVerified: 'صفحهٔ مرجع هنوز توسط یک فرد دوباره بررسی نشده است',
    checked: 'بررسی منبع',
    summaryTitle: 'پوشش',
    decisionTitle: 'این بوم به چه تصمیمی کمک می‌کند',
    decisionBody: 'نمایی یک‌صفحه‌ای از این‌که کسب‌وکار چگونه ارزش می‌سازد، می‌رساند و درآمد می‌گیرد؛ با نام بردن از هر جای خالی.',
    printTitle: 'چاپ یا ذخیره به‌صورت PDF',
    printHint: 'از فرمان «چاپ» مرورگر استفاده کنید. صفحه برای A3 افقی چیده شده است؛ صفحهٔ دوم همهٔ منابع را فهرست می‌کند.',
    pageCanvas: 'بوم',
    pageSources: 'منابع',
    statusLegend: 'وضعیت‌ها',
    noValueYet: 'هنوز پاسخی ثبت نشده',
    version: 'نسخهٔ {version}',
    openPrint: 'نمای چاپ (داخلی)',
    openPrintPublic: 'نمای چاپ (عمومی)',
    backToCanvas: 'بازگشت به بوم',
    notApplicableTitle: 'برای این نمایه استفاده نمی‌شود',
    notApplicableBody: 'برند شخصی فقط با جنبهٔ «بنیان‌گذار» یا «مشاور» بوم مدل کسب‌وکار می‌گیرد.',
    runningHead: 'Brand OS · بوم مدل کسب‌وکار',
    pending: 'این کامیت پیش از وجود بوم همگام شده است. برای ساختن آن «به‌روزرسانی» را بزنید.',
    unavailable: 'بوم از این کامیت ساخته نشد. بقیهٔ برند تحت تأثیر نیست.',
    printButton: 'چاپ یا ذخیره به‌صورت PDF',
    printOnly: 'Studio فقط‌خواندنی است: این نما فقط آنچه ادغام شده را چاپ می‌کند.',
    detailsTitle: 'جزئیات و منابع',
    detailsFields: 'شناسهٔ پرسش‌ها',
    sourceShort: 'منبع',
  },
}

const tr: VisualCatalog = {
  dir: 'ltr',
  identity: IDENTITY_TEXT.tr,
  entities: ENTITY_TEXT.tr,
  zone: {
    key_partners: { title: 'Kilit ortaklar', prompt: 'Teslimat için kime bağlıyız?' },
    key_activities: { title: 'Kilit faaliyetler', prompt: 'Her hafta neyi iyi yapmalıyız?' },
    key_resources: { title: 'Kilit kaynaklar', prompt: 'Teklifi hangi varlıklar mümkün kılıyor?' },
    value_propositions: { title: 'Değer önerileri', prompt: 'Müşteri bizi neden seçiyor?' },
    customer_relationships: { title: 'Müşteri ilişkileri', prompt: 'Müşteriyi nasıl kazanıyor, tutuyor ve destekliyoruz?' },
    channels: { title: 'Kanallar', prompt: 'Müşteri teklifi nasıl buluyor, satın alıyor ve teslim alıyor?' },
    customer_segments: { title: 'Müşteri segmentleri', prompt: 'Kimin için değer yaratıyoruz?' },
    cost_structure: { title: 'Maliyet yapısı', prompt: 'Maliyetlerimizi ne belirliyor?' },
    revenue_streams: { title: 'Gelir akışları', prompt: 'Değer nasıl gelire dönüşüyor?' },
  },
  state: {
    approved: 'Onaylı',
    assumption: 'Taslak, onaylanmadı',
    recommendation: 'Öneri, karar değil',
    missing: 'Eksik',
    withheld: 'Gizli tutuldu',
    stale: 'Onaylı, gözden geçirme gecikti',
    conflicting: 'Çelişkili',
    not_applicable: 'Uygulanmaz',
  },
  zoneState: { complete: 'Tamam', partial: 'Kısmi', missing: 'Eksik', withheld: 'Gizli', not_applicable: 'Uygulanmaz' },
  missingReason: { unanswered: 'Henüz yanıtlanmadı', unknown: 'Sahip bunun bilinmediğini söyledi', skipped: 'Sahip atladı', deprecated: 'Son yanıt kullanımdan kaldırıldı', not_published: 'Yayımlanmadı' },
  claim: {
    informed_by: 'Esinlenilen kaynak',
    aligned_with: 'Uyumlu',
    verified_against: 'Karşılaştırılarak doğrulandı',
    externally_certified: 'Bağımsız sertifikalı',
    original_professional_template: 'Özgün Brand OS şablonu',
  },
  proposed: {
    'business.model.key_activities': 'İşletme her teklifi sunmak için hangi faaliyetleri iyi yapmalı?',
    'business.model.key_resources': 'Her teklifi sunmak için hangi kaynaklar (insanlar, sistemler, fikri mülkiyet, varlıklar) gerekli?',
    'business.model.segments': 'Her müşteri segmentini ayrı yazın ve diğerlerinden farkını belirtin.',
    'business.model.cost_items': 'Ana maliyet kalemlerini, sabit veya değişken, tutar vermeden listeleyin.',
  },
  text: {
    canvasTitle: 'İş Modeli Kanvası',
    canvasKicker: 'Strateji · İş modeli',
    editionInternal: 'İç sürüm',
    editionPublic: 'Kamuya açık sürüm',
    editionInternalNote: 'Onaylı bilgiler esastır. Taslaklar etiketlidir ve karar değildir. Kısıtlı değerler gizlenir. Boşluklar boş kalır.',
    editionPublicNote: 'Yalnızca onaylı, yayımlanmış ve kamuya açık bilgiler. Taslaklar ve kısıtlı değerler çıkarıldı.',
    illustrative: 'ILLUSTRATIVE / MOCK DATA · TEMSİLİ ÖRNEK',
    illustrativeNote: 'Uydurma test verisiyle hazırlanmış örnek. Gerçek bir marka değil, onaylı değil, hazır cevap değil.',
    asOf: '{date} itibarıyla',
    asOfNone: 'Henüz onaylı bilgi yok',
    asOfLabel: 'Veri tarihi',
    commit: 'Kaynak commit',
    classification: 'Sınıflandırma',
    classInternal: 'İç kullanım. Yalnızca sahip ve ekip.',
    classPublic: 'Kamuya açık',
    zoneIndex: 'Kanvas alanları',
    zoneIndexHint: 'Bir alana gidin. Kanvas dokuz alanlı düzenini korur ve küçük ekranlarda yatay kayar.',
    nextQuestions: 'Bu alanı doldurmak için',
    proposedQuestion: 'Yeni soru (önerilen, henüz görüşmede yok)',
    existingQuestion: 'Yanıtlayın ve onaylayın',
    related: 'İlgili yanıtlar',
    relatedHint: 'Bu alanı besleyebilirler ama onu yanıtlamazlar.',
    gapTitle: 'Bu alanın henüz bir sorusu yok',
    gapBody: 'Sahip yanıtlayıp onaylayana kadar burada hiçbir şey gösterilmez. Hiçbir şey tahmin edilmedi.',
    withheldValue: 'Kısıtlı değer gizlendi',
    notApplicableZone: 'Sahip bunu uygulanmaz olarak işaretledi.',
    notApplicableProfile: 'Bu profil için geçerli değil.',
    standsFor: 'Kişisel yanıtınızdan: {id}.',
    profileNotApplicableBody: 'Bu çerçevenin hiçbir parçası bu markanın görüşme profili için geçerli değil ve yerine geçen bir kişisel yanıt yok. Bir girişimin tam planı için brand.profile değerini universal yapıp kişisel modülü açık tutun ya da girişime ayrı bir depo açın.',
    relationshipsTitle: 'Alanlar arası bağlantılar',
    relationshipsBody: 'Segmentler, teklifler, kanallar ve gelir akışları bugün tek metin yanıtlarıdır; bu yüzden aralarında bağlantı çizilmez. Bağlantılı varlıklar planlanan bir görüşme değişikliğidir.',
    sourcesTitle: 'Kaynaklar ve durumlar',
    sourcesIntro: 'Kanvastaki her kayıt, ona sahip olan soru, durumu ve onaylı sürümü.',
    colField: 'Alan',
    colState: 'Durum',
    colVersion: 'Sürüm',
    colApproved: 'Onay tarihi',
    colSources: 'Kaynak kimlikleri',
    frameworkTitle: 'Çerçeve',
    licence: 'Lisans durumu',
    sourceLink: 'Kaynak',
    notVerified: 'Kaynak sayfa henüz bir kişi tarafından yeniden kontrol edilmedi',
    checked: 'Kaynak kontrolü',
    summaryTitle: 'Kapsam',
    decisionTitle: 'Neyi destekler',
    decisionBody: 'İşletmenin değeri nasıl yarattığını, sunduğunu ve gelire çevirdiğini tek sayfada, her boşluğu adıyla göstererek okutur.',
    printTitle: 'Yazdır veya PDF olarak kaydet',
    printHint: 'Tarayıcının Yazdır komutunu kullanın. Sayfa A3 yatay için düzenlendi; ikinci sayfa tüm kaynakları listeler.',
    pageCanvas: 'Kanvas',
    pageSources: 'Kaynaklar',
    statusLegend: 'Durumlar',
    noValueYet: 'Henüz yanıtlanmadı',
    version: 's{version}',
    openPrint: 'Baskı görünümü (iç)',
    openPrintPublic: 'Baskı görünümü (kamuya açık)',
    backToCanvas: 'Kanvasa dön',
    notApplicableTitle: 'Bu profil için kullanılmıyor',
    notApplicableBody: 'Kişisel marka, iş modeli kanvasını yalnızca kurucu veya danışman yönüyle alır.',
    runningHead: 'Brand OS · İş Modeli Kanvası',
    pending: 'Bu commit kanvas eklenmeden önce eşitlendi. Oluşturmak için Yenile’ye basın.',
    unavailable: 'Kanvas bu commit’ten oluşturulamadı. Markanın geri kalanı etkilenmedi.',
    printButton: 'Yazdır veya PDF olarak kaydet',
    printOnly: 'Studio salt okunurdur: bu görünüm yalnızca birleştirilmiş olanı yazdırır.',
    detailsTitle: 'Ayrıntılar ve kaynaklar',
    detailsFields: 'Soru kimlikleri',
    sourceShort: 'Kaynak',
  },
}

const CATALOGS: Record<VisualLang, VisualCatalog> = { en, fa, tr }

export function visualCatalog(lang: VisualLang): VisualCatalog {
  return CATALOGS[lang]
}

export function fillVisual(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match))
}
