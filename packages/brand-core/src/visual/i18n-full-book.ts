import type { VisualLang } from './i18n.js'
import type { BookChapterId, BookKind, PlateChapterId, UnavailableReason } from './full-book.js'

/**
 * en/fa/tr text for the full Brand Book and the Business Report (Visual V4.2): covers, chapter titles and leads, the
 * designed "not yet available" page, entry states, and the field labels of the questions those books print. Labels
 * only: brand values are never translated. A question without a translated label falls back to the bank's English
 * label. `{name}` placeholders are filled with `fillVisual`.
 */
export interface FullBookText {
  book: Record<BookKind, { title: string; kicker: string; lead: string; running: string }>
  /** Text chapters; the colour, type and logo plates keep the identity chapter's own titles. */
  chapter: Record<Exclude<BookChapterId, PlateChapterId>, { title: string; lead: string }>
  unavailableKicker: string
  unavailableTitle: string
  unavailable: Record<UnavailableReason, string>
  separateWhere: Partial<Record<BookChapterId, string>>
  awaitingTitle: string
  stateReady: string
  stateUnavailable: string
  draftNotPrinted: string
  withheldNotPrinted: string
  notApplicable: string
  approvedOn: string
  rulesTitle: string
  sourcesIntro: string
  canvasNote: string
  zoneGap: string
  /** Field labels by question id. */
  labels: Record<string, string>
  exportUnknownDoc: string
  /** The Business Report is the business plan as a book; the business plan is never public. */
  exportReportNotPublic: string
}

const en: FullBookText = {
  book: {
    brand_book: {
      title: 'Brand Book',
      kicker: 'Brand Book · full edition',
      lead: 'The brand in one book: strategy, voice, visual identity and governance, drawn from approved facts only.',
      running: 'Brand Book',
    },
    business_report: {
      title: 'Business Report',
      kicker: 'Business Report',
      lead: 'The business in one report: offer, customer, model, product, plan and risks, drawn from approved facts only. Restricted figures are never printed.',
      running: 'Business Report',
    },
  },
  chapter: {
    overview: { title: 'Brand overview', lead: 'What the brand is called, what it offers and who it is for.' },
    strategy: { title: 'Strategy', lead: 'Purpose, vision, values, differentiation and the promise the brand keeps.' },
    verbal: { title: 'Verbal identity', lead: 'How the brand writes: name use, voice, do and don’t pairs and forbidden language.' },
    mascot: { title: 'Mascot', lead: 'The approved character, its states and its six-stage evolution.' },
    governance: { title: 'Governance', lead: 'Who approves brand changes, how versions and deprecations work, and the rules for AI use.' },
    motion: { title: 'Motion', lead: 'How the brand moves on screen: timing, easing and transitions.' },
    applications: { title: 'Applications', lead: 'The brand applied to social posts, documents and product screens.' },
    executive_summary: { title: 'Executive summary', lead: 'The business, its offer, its stage and the next milestone.' },
    customer_problem: { title: 'Customer and problem', lead: 'Who the customer is, where, and which pains the offer addresses.' },
    business_model: { title: 'Business model', lead: 'How the business earns money, sells, prices and defends its position.' },
    business_model_canvas: { title: 'Business Model Canvas', lead: 'The nine zones of the canvas with their approved entries, in the canonical order.' },
    competitors: { title: 'Competitive landscape', lead: 'Owner-reviewed competitors compared on cited, current observations.' },
    product: { title: 'Product', lead: 'What ships first, its public status and the roadmap.' },
    financials: { title: 'Financial plan', lead: 'Currency and basis. Restricted figures are never printed in any edition.' },
    goals: { title: 'Goals and KPIs', lead: 'Annual and quarterly goals and the north-star metric.' },
    risks: { title: 'Risks and dependencies', lead: 'Known risks and how they are reviewed.' },
  },
  unavailableKicker: 'Not yet available',
  unavailableTitle: '{chapter} is not in this edition yet',
  unavailable: {
    no_approved_facts: 'No approved facts for this chapter yet. Nothing is invented to fill it: the chapter appears when the owner approves its answers.',
    planned: 'This chapter is planned and not built yet. When it is, it will be drawn from approved facts only.',
    separate_print: 'This chapter needs its own page layout, so it prints as a separate document for now: {where}.',
    module_off: 'This module is turned off for the brand, so the chapter has nothing to show.',
  },
  separateWhere: {
    mascot: 'Studio, Assets, Mascot atlas, Print',
    competitors: 'Studio, Competitors, Print',
  },
  awaitingTitle: 'What would fill it',
  stateReady: 'Approved content',
  stateUnavailable: 'Not yet available',
  draftNotPrinted: 'Draft awaiting approval. Not printed.',
  withheldNotPrinted: 'Restricted. Never printed.',
  notApplicable: 'Marked not applicable',
  approvedOn: 'approved {date}',
  rulesTitle: 'Rules',
  sourcesIntro: 'Every entry this book cites, the fact or asset it is drawn from, its state and its approved version.',
  canvasNote: 'The full A3 canvas prints on its own: npm run brand:export-visual -- --doc bmc.',
  zoneGap: 'No approved entry yet',
  labels: {},
  exportUnknownDoc: '--doc must be identity, bmc, brand-book or business-report (got {doc}).',
  exportReportNotPublic: 'The Business Report is never public: it is the business plan, which only the internal edition may print. Use --edition internal.',
}

const fa: FullBookText = {
  book: {
    brand_book: {
      title: 'کتاب برند',
      kicker: 'کتاب برند · ویرایش کامل',
      lead: 'برند در یک کتاب: راهبرد، لحن، هویت بصری و حاکمیت، فقط از اطلاعات تأییدشده.',
      running: 'کتاب برند',
    },
    business_report: {
      title: 'گزارش کسب‌وکار',
      kicker: 'گزارش کسب‌وکار',
      lead: 'کسب‌وکار در یک گزارش: پیشنهاد، مشتری، مدل، محصول، برنامه و ریسک‌ها، فقط از اطلاعات تأییدشده. ارقام محرمانه هرگز چاپ نمی‌شوند.',
      running: 'گزارش کسب‌وکار',
    },
  },
  chapter: {
    overview: { title: 'نمای کلی برند', lead: 'نام برند، آنچه عرضه می‌کند و برای چه کسی است.' },
    strategy: { title: 'راهبرد', lead: 'هدف، چشم‌انداز، ارزش‌ها، تمایز و قولی که برند نگه می‌دارد.' },
    verbal: { title: 'هویت کلامی', lead: 'برند چطور می‌نویسد: کاربرد نام، لحن، جفت‌های «بگو و نگو» و واژه‌های ممنوع.' },
    mascot: { title: 'شخصیت برند (ماسکات)', lead: 'شخصیت تأییدشده، حالت‌هایش و تکامل شش‌مرحله‌ای آن.' },
    governance: { title: 'حاکمیت', lead: 'چه کسی تغییرات برند را تأیید می‌کند، نسخه‌ها و کنارگذاشتن‌ها چطور کار می‌کنند و قواعد استفاده از هوش مصنوعی.' },
    motion: { title: 'حرکت', lead: 'برند روی صفحه چطور حرکت می‌کند: زمان‌بندی، شتاب و گذارها.' },
    applications: { title: 'کاربردها', lead: 'برند روی پست‌های اجتماعی، اسناد و صفحه‌های محصول.' },
    executive_summary: { title: 'خلاصهٔ مدیریتی', lead: 'کسب‌وکار، پیشنهادش، مرحله‌اش و نقطهٔ عطف بعدی.' },
    customer_problem: { title: 'مشتری و مسئله', lead: 'مشتری کیست، کجاست و پیشنهاد کدام دردها را حل می‌کند.' },
    business_model: { title: 'مدل کسب‌وکار', lead: 'کسب‌وکار چطور درآمد دارد، می‌فروشد، قیمت می‌گذارد و از جایگاهش دفاع می‌کند.' },
    business_model_canvas: { title: 'بوم مدل کسب‌وکار', lead: 'نُه بخش بوم با مدخل‌های تأییدشده، به ترتیب استاندارد.' },
    competitors: { title: 'چشم‌انداز رقابتی', lead: 'رقبایی که مالک بررسی کرده، بر پایهٔ مشاهده‌های مستند و به‌روز.' },
    product: { title: 'محصول', lead: 'اول چه چیزی عرضه می‌شود، وضعیت عمومی آن و نقشهٔ راه.' },
    financials: { title: 'برنامهٔ مالی', lead: 'واحد پول و مبنای حسابداری. ارقام محرمانه در هیچ ویرایشی چاپ نمی‌شوند.' },
    goals: { title: 'اهداف و شاخص‌ها', lead: 'هدف‌های سالانه و فصلی و شاخص ستارهٔ قطبی.' },
    risks: { title: 'ریسک‌ها و وابستگی‌ها', lead: 'ریسک‌های شناخته‌شده و روش بازبینی آن‌ها.' },
  },
  unavailableKicker: 'هنوز در دسترس نیست',
  unavailableTitle: '«{chapter}» هنوز در این ویرایش نیست',
  unavailable: {
    no_approved_facts: 'هنوز اطلاعات تأییدشده‌ای برای این فصل نیست. چیزی برای پر کردن آن ساخته نمی‌شود: وقتی مالک پاسخ‌ها را تأیید کند، فصل ظاهر می‌شود.',
    planned: 'این فصل برنامه‌ریزی شده ولی هنوز ساخته نشده است. وقتی ساخته شود، فقط از اطلاعات تأییدشده خواهد بود.',
    separate_print: 'این فصل صفحه‌آرایی خودش را لازم دارد، پس فعلاً جداگانه چاپ می‌شود: {where}.',
    module_off: 'این ماژول برای برند خاموش است، پس این فصل چیزی برای نشان دادن ندارد.',
  },
  separateWhere: {
    mascot: 'Studio، دارایی‌ها، اطلس ماسکات، چاپ',
    competitors: 'Studio، رقبا، چاپ',
  },
  awaitingTitle: 'چه چیزی آن را پر می‌کند',
  stateReady: 'محتوای تأییدشده',
  stateUnavailable: 'هنوز در دسترس نیست',
  draftNotPrinted: 'پیش‌نویس در انتظار تأیید. چاپ نمی‌شود.',
  withheldNotPrinted: 'محرمانه. هرگز چاپ نمی‌شود.',
  notApplicable: 'نامربوط علامت خورده',
  approvedOn: 'تأیید {date}',
  rulesTitle: 'قواعد',
  sourcesIntro: 'همهٔ مدخل‌هایی که این کتاب به آن‌ها ارجاع می‌دهد، اطلاعات یا فایلی که از آن آمده‌اند، وضعیت و نسخهٔ تأییدشدهٔ آن‌ها.',
  canvasNote: 'بوم کامل A3 جداگانه چاپ می‌شود: npm run brand:export-visual -- --doc bmc.',
  zoneGap: 'هنوز مدخل تأییدشده‌ای نیست',
  labels: {
    'business.identity.trade_name': 'نام تجاری',
    'brand.identity.public_name_override': 'نام عمومی جایگزین',
    'brand.verbal.tagline': 'شعار',
    'business.offer.summary': 'پیشنهاد',
    'business.customer.primary_segment': 'مشتری اصلی',
    'brand.strategy.purpose': 'هدف',
    'brand.strategy.vision': 'چشم‌انداز',
    'brand.strategy.values': 'ارزش‌ها',
    'brand.strategy.differentiation': 'تمایز',
    'brand.strategy.promise': 'قول برند',
    'brand.personality.traits': 'شخصیت',
    'brand.strategy.decision_rule': 'قاعدهٔ تصمیم',
    'brand.verbal.name_use': 'کاربرد نام',
    'brand.verbal.voice': 'لحن',
    'brand.verbal.voice_pairs': 'بگو و نگوی لحن',
    'brand.verbal.forbidden': 'واژه‌های ممنوع',
    'brand.verbal.microcopy': 'اصل متن‌های کوتاه',
    'brand.verbal.localization': 'بومی‌سازی',
    'brand.color.roles': 'نقش‌های رنگ',
    'brand.color.themes': 'تم‌ها',
    'brand.color.semantics': 'رنگ‌های معنایی',
    'brand.color.contrast': 'هدف کنتراست',
    'brand.type.intent': 'هدف حروف',
    'brand.type.scale': 'نقش‌ها و مقیاس حروف',
    'brand.type.fallback': 'سیاست حروف جایگزین',
    'brand.type.license': 'وضعیت مجوز',
    'brand.type.rtl': 'راست‌به‌چپ و زبان‌ها',
    'brand.logo.variants': 'نسخه‌های لازم',
    'brand.logo.min_size': 'کمینهٔ اندازه و فضای خالی',
    'brand.logo.clear_space': 'فضای خالی',
    'brand.logo.misuse': 'قواعد استفادهٔ نادرست',
    'brand.logo.masters': 'محل فایل اصلی',
    'brand.gov.approver': 'تأییدکنندهٔ برند',
    'brand.gov.versioning': 'نسخه‌گذاری',
    'brand.gov.deprecation': 'کنارگذاشتن',
    'brand.gov.license': 'مجوز محتوا',
    'brand.gov.ai': 'منشأ هوش مصنوعی',
    'brand.gov.cadence': 'دورهٔ نگهداری',
    'business.offer.value_proposition': 'ارزش پیشنهادی',
    'business.stage.current': 'مرحلهٔ فعلی',
    'business.plan.milestone': 'نقطهٔ عطف بعدی',
    'business.problem.pains': 'دردهای مشتری',
    'business.market.geography': 'جغرافیا',
    'business.model.revenue': 'مدل درآمد',
    'business.sales.motion': 'روش فروش',
    'business.sales.pricing': 'خلاصهٔ قیمت‌گذاری',
    'business.model.defensibility': 'دفاع‌پذیری',
    'business.model.segments': 'بخش‌های مشتری',
    'business.model.key_activities': 'فعالیت‌های کلیدی',
    'business.model.key_resources': 'منابع کلیدی',
    'business.model.cost_items': 'اقلام هزینه',
    'business.product.mvp': 'مرز نسخهٔ اول',
    'business.product.public_status': 'وضعیت عمومی',
    'business.product.roadmap': 'افق نقشهٔ راه',
    'business.finance.currency': 'واحد پول گزارش',
    'business.finance.basis': 'مبنای حسابداری',
    'business.finance.revenue_figure': 'رقم درآمد',
    'business.finance.costs': 'عوامل هزینه',
    'business.finance.runway': 'مدت دوام نقدینگی',
    'business.goals.annual': 'هدف سالانه',
    'business.goals.quarter': 'تمرکز فصلی',
    'business.goals.north_star': 'تعریف ستارهٔ قطبی',
    'business.plan.risks': 'ریسک‌های اصلی',
    'business.partners.risk_process': 'بازبینی ریسک',
    'business.partners.channels': 'همکاران',
    'business.ops.vendors': 'تأمین‌کنندگان',
    'business.cx.onboarding': 'نتیجهٔ شروع کار مشتری',
    'business.cx.channels': 'کانال‌های پشتیبانی',
    'business.marketing.channels': 'کانال‌ها',
    'business.sales.consumer_path': 'مسیر خرید مشتری',
    'business.sales.buyer': 'خریدار در برابر کاربر',
    'business.finance.economics_note': 'یادداشت اقتصاد قیمت‌گذاری',
  },
  exportUnknownDoc: '--doc باید identity، bmc، brand-book یا business-report باشد (داده شد: {doc}).',
  exportReportNotPublic: 'گزارش کسب‌وکار هرگز عمومی نیست: این همان برنامهٔ کسب‌وکار است و فقط نسخهٔ داخلی چاپ می‌شود. از --edition internal استفاده کنید.',
}

const tr: FullBookText = {
  book: {
    brand_book: {
      title: 'Marka Kitabı',
      kicker: 'Marka Kitabı · tam sürüm',
      lead: 'Marka tek kitapta: strateji, ses, görsel kimlik ve yönetişim, yalnızca onaylı bilgilerden.',
      running: 'Marka Kitabı',
    },
    business_report: {
      title: 'İş Raporu',
      kicker: 'İş Raporu',
      lead: 'İşletme tek raporda: teklif, müşteri, model, ürün, plan ve riskler, yalnızca onaylı bilgilerden. Kısıtlı rakamlar asla basılmaz.',
      running: 'İş Raporu',
    },
  },
  chapter: {
    overview: { title: 'Markaya genel bakış', lead: 'Markanın adı, ne sunduğu ve kimin için olduğu.' },
    strategy: { title: 'Strateji', lead: 'Amaç, vizyon, değerler, farklılaşma ve markanın tuttuğu söz.' },
    verbal: { title: 'Sözel kimlik', lead: 'Markanın nasıl yazdığı: ad kullanımı, ses, yap ve yapma çiftleri, yasak dil.' },
    mascot: { title: 'Maskot', lead: 'Onaylı karakter, durumları ve altı aşamalı evrimi.' },
    governance: { title: 'Yönetişim', lead: 'Marka değişikliklerini kimin onayladığı, sürüm ve kullanımdan kaldırmanın nasıl işlediği ve yapay zekâ kuralları.' },
    motion: { title: 'Hareket', lead: 'Markanın ekranda nasıl hareket ettiği: zamanlama, yumuşatma ve geçişler.' },
    applications: { title: 'Uygulamalar', lead: 'Markanın sosyal gönderilerde, belgelerde ve ürün ekranlarında uygulanışı.' },
    executive_summary: { title: 'Yönetici özeti', lead: 'İşletme, teklifi, aşaması ve bir sonraki kilometre taşı.' },
    customer_problem: { title: 'Müşteri ve sorun', lead: 'Müşterinin kim olduğu, nerede olduğu ve teklifin hangi sıkıntıları çözdüğü.' },
    business_model: { title: 'İş modeli', lead: 'İşletmenin nasıl gelir elde ettiği, sattığı, fiyatladığı ve konumunu koruduğu.' },
    business_model_canvas: { title: 'İş Modeli Kanvası', lead: 'Kanvasın dokuz alanı ve onaylı girdileri, standart sırayla.' },
    competitors: { title: 'Rekabet ortamı', lead: 'Sahibin incelediği rakipler, kaynaklı ve güncel gözlemlerle karşılaştırılır.' },
    product: { title: 'Ürün', lead: 'İlk neyin çıkacağı, kamuya açık durumu ve yol haritası.' },
    financials: { title: 'Finansal plan', lead: 'Para birimi ve muhasebe esası. Kısıtlı rakamlar hiçbir sürümde basılmaz.' },
    goals: { title: 'Hedefler ve KPI’lar', lead: 'Yıllık ve çeyreklik hedefler ve kuzey yıldızı metriği.' },
    risks: { title: 'Riskler ve bağımlılıklar', lead: 'Bilinen riskler ve nasıl gözden geçirildikleri.' },
  },
  unavailableKicker: 'Henüz mevcut değil',
  unavailableTitle: '{chapter} henüz bu sürümde yok',
  unavailable: {
    no_approved_facts: 'Bu bölüm için henüz onaylı bilgi yok. Boşluğu doldurmak için hiçbir şey uydurulmaz: sahip yanıtları onayladığında bölüm görünür.',
    planned: 'Bu bölüm planlandı ama henüz yapılmadı. Yapıldığında yalnızca onaylı bilgilerden çizilecek.',
    separate_print: 'Bu bölümün kendi sayfa düzenine ihtiyacı var, bu yüzden şimdilik ayrı bir belge olarak basılıyor: {where}.',
    module_off: 'Bu modül marka için kapalı, bu yüzden bölümde gösterilecek bir şey yok.',
  },
  separateWhere: {
    mascot: 'Studio, Varlıklar, Maskot atlası, Yazdır',
    competitors: 'Studio, Rakipler, Yazdır',
  },
  awaitingTitle: 'Onu ne doldurur',
  stateReady: 'Onaylı içerik',
  stateUnavailable: 'Henüz mevcut değil',
  draftNotPrinted: 'Onay bekleyen taslak. Basılmaz.',
  withheldNotPrinted: 'Kısıtlı. Asla basılmaz.',
  notApplicable: 'Uygulanamaz olarak işaretlendi',
  approvedOn: '{date} onaylandı',
  rulesTitle: 'Kurallar',
  sourcesIntro: 'Bu kitabın andığı her girdi, dayandığı bilgi ya da dosya, durumu ve onaylı sürümü.',
  canvasNote: 'Tam A3 kanvas ayrı basılır: npm run brand:export-visual -- --doc bmc.',
  zoneGap: 'Henüz onaylı girdi yok',
  labels: {
    'business.identity.trade_name': 'Ticari ad',
    'brand.identity.public_name_override': 'Kamuya açık ad',
    'brand.verbal.tagline': 'Slogan',
    'business.offer.summary': 'Teklif',
    'business.customer.primary_segment': 'Birincil müşteri',
    'brand.strategy.purpose': 'Amaç',
    'brand.strategy.vision': 'Vizyon',
    'brand.strategy.values': 'Değerler',
    'brand.strategy.differentiation': 'Farklılaşma',
    'brand.strategy.promise': 'Marka sözü',
    'brand.personality.traits': 'Kişilik',
    'brand.strategy.decision_rule': 'Karar kuralı',
    'brand.verbal.name_use': 'Ad kullanımı',
    'brand.verbal.voice': 'Ses tonu',
    'brand.verbal.voice_pairs': 'Ses için yap ve yapma',
    'brand.verbal.forbidden': 'Yasak dil',
    'brand.verbal.microcopy': 'Mikro metin ilkesi',
    'brand.verbal.localization': 'Yerelleştirme',
    'brand.color.roles': 'Renk rolleri',
    'brand.color.themes': 'Temalar',
    'brand.color.semantics': 'Anlamsal renkler',
    'brand.color.contrast': 'Kontrast hedefi',
    'brand.type.intent': 'Yazı amacı',
    'brand.type.scale': 'Yazı rolleri ve ölçeği',
    'brand.type.fallback': 'Yedek yazı politikası',
    'brand.type.license': 'Lisans durumu',
    'brand.type.rtl': 'Sağdan sola ve diller',
    'brand.logo.variants': 'Gereken varyantlar',
    'brand.logo.min_size': 'En küçük boyut ve boşluk',
    'brand.logo.clear_space': 'Boş alan',
    'brand.logo.misuse': 'Yanlış kullanım kuralları',
    'brand.logo.masters': 'Ana dosyanın yeri',
    'brand.gov.approver': 'Marka onaylayıcısı',
    'brand.gov.versioning': 'Sürümleme',
    'brand.gov.deprecation': 'Kullanımdan kaldırma',
    'brand.gov.license': 'İçerik lisansı',
    'brand.gov.ai': 'Yapay zekâ kökeni',
    'brand.gov.cadence': 'Bakım sıklığı',
    'business.offer.value_proposition': 'Değer önerisi',
    'business.stage.current': 'Faaliyet aşaması',
    'business.plan.milestone': 'Sonraki kilometre taşı',
    'business.problem.pains': 'Müşteri sıkıntıları',
    'business.market.geography': 'Coğrafya',
    'business.model.revenue': 'Gelir modeli',
    'business.sales.motion': 'Satış yaklaşımı',
    'business.sales.pricing': 'Fiyatlandırma özeti',
    'business.model.defensibility': 'Savunulabilirlik',
    'business.model.segments': 'Müşteri segmentleri',
    'business.model.key_activities': 'Kilit faaliyetler',
    'business.model.key_resources': 'Kilit kaynaklar',
    'business.model.cost_items': 'Maliyet kalemleri',
    'business.product.mvp': 'MVP sınırı',
    'business.product.public_status': 'Kamuya açık durum',
    'business.product.roadmap': 'Yol haritası ufku',
    'business.finance.currency': 'Raporlama para birimi',
    'business.finance.basis': 'Muhasebe esası',
    'business.finance.revenue_figure': 'Gelir rakamı',
    'business.finance.costs': 'Maliyet etkenleri',
    'business.finance.runway': 'Nakit ömrü',
    'business.goals.annual': 'Yıllık hedef',
    'business.goals.quarter': 'Çeyrek odağı',
    'business.goals.north_star': 'Kuzey yıldızı tanımı',
    'business.plan.risks': 'Başlıca riskler',
    'business.partners.risk_process': 'Risk incelemesi',
    'business.partners.channels': 'Ortaklar',
    'business.ops.vendors': 'Tedarikçiler',
    'business.cx.onboarding': 'Başlangıç sonucu',
    'business.cx.channels': 'Destek kanalları',
    'business.marketing.channels': 'Kanallar',
    'business.sales.consumer_path': 'Tüketici satın alma yolu',
    'business.sales.buyer': 'Alıcı ve kullanıcı',
    'business.finance.economics_note': 'Fiyatlandırma ekonomisi notu',
  },
  exportUnknownDoc: '--doc identity, bmc, brand-book veya business-report olmalı (verilen: {doc}).',
  exportReportNotPublic: 'İş Raporu hiçbir zaman herkese açık değildir: iş planının kendisidir ve yalnızca iç sürüm basılabilir. --edition internal kullanın.',
}

export const FULL_BOOK_TEXT: Record<VisualLang, FullBookText> = { en, fa, tr }

export function fullBookText(lang: VisualLang): FullBookText {
  return FULL_BOOK_TEXT[lang]
}

/** The field label in the reader's language; the bank's English label when no translation exists. */
export function entryLabel(lang: VisualLang, id: string, fallback: string): string {
  return FULL_BOOK_TEXT[lang].labels[id] ?? fallback
}
