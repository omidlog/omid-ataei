import type { Dimension } from './model.js'

/**
 * Human-facing text of the competitive landscape: the gap checklist, the per-candidate review notes and the list of
 * inferences the landscape never supports. Codes are stable; text is en/fa/tr. Placeholders: {name} {dimension}
 * {reason} {note}.
 */

export const COMPETITIVE_LANGS = ['en', 'fa', 'tr'] as const
export type CompetitiveLang = (typeof COMPETITIVE_LANGS)[number]

type Catalog = Record<string, Record<CompetitiveLang, string>>

export const DIMENSION_LABELS: Record<Dimension, Record<CompetitiveLang, string>> = {
  offer: { en: 'offer', fa: 'پیشنهاد و محصول', tr: 'teklif' },
  audience: { en: 'audience', fa: 'مخاطب', tr: 'hedef kitle' },
  geography: { en: 'geography', fa: 'جغرافیا', tr: 'coğrafya' },
  public_price: { en: 'public price', fa: 'قیمت عمومی', tr: 'açık fiyat' },
  public_message: { en: 'public message', fa: 'پیام عمومی', tr: 'açık mesaj' },
  visual_language: { en: 'visual language', fa: 'زبان بصری', tr: 'görsel dil' },
  observable_channels: { en: 'observable channels', fa: 'کانال‌های قابل مشاهده', tr: 'gözlemlenebilir kanallar' },
  strength_hypothesis: { en: 'strength (hypothesis)', fa: 'نقطهٔ قوت (فرضیه)', tr: 'güçlü yön (hipotez)' },
  weakness_hypothesis: { en: 'weakness (hypothesis)', fa: 'نقطهٔ ضعف (فرضیه)', tr: 'zayıf yön (hipotez)' },
}

export const GAP_TEXT: Catalog = {
  research_unavailable: {
    en: 'Research cannot run here ({reason}). Add source URLs you trust, or record sources later; nothing is filled in meanwhile.',
    fa: 'پژوهش اینجا اجرا نمی‌شود ({reason}). نشانی منابعی را که به آن‌ها اعتماد دارید اضافه کنید یا بعداً منبع ثبت کنید؛ تا آن زمان چیزی حدس زده نمی‌شود.',
    tr: 'Araştırma burada çalışamıyor ({reason}). Güvendiğiniz kaynak adreslerini ekleyin ya da kaynakları sonra kaydedin; bu arada hiçbir şey tahminle doldurulmaz.',
  },
  scope_not_set: {
    en: 'Say what this research is for (identity, positioning, marketing, pricing, seo, expansion) so only the useful gaps are listed.',
    fa: 'بگویید این پژوهش برای چیست (هویت، جایگاه‌یابی، بازاریابی، قیمت‌گذاری، سئو، گسترش) تا فقط شکاف‌های مفید فهرست شوند.',
    tr: 'Bu araştırmanın ne için olduğunu söyleyin (kimlik, konumlandırma, pazarlama, fiyatlandırma, SEO, genişleme); böylece yalnızca işe yarar eksikler listelenir.',
  },
  target_market_unapproved: {
    en: 'The target market (business.market.geography) is not approved yet. Local, regional and international are judged against it; answer it in the interview first.',
    fa: 'بازار هدف (business.market.geography) هنوز تأیید نشده است. محلی، منطقه‌ای و بین‌المللی نسبت به آن سنجیده می‌شوند؛ ابتدا در مصاحبه به آن پاسخ دهید.',
    tr: 'Hedef pazar (business.market.geography) henüz onaylanmadı. Yerel, bölgesel ve uluslararası bu pazara göre değerlendirilir; önce görüşmede yanıtlayın.',
  },
  no_candidates: {
    en: 'No candidates yet. Who do buyers compare you with? Who solves the same job differently? Names only; each starts as an unverified candidate.',
    fa: 'هنوز نامزدی ثبت نشده است. خریداران شما را با چه کسانی مقایسه می‌کنند؟ چه کسی همین نیاز را به روش دیگری برآورده می‌کند؟ فقط نام؛ هر نام ابتدا یک نامزد تأییدنشده است.',
    tr: 'Henüz aday yok. Alıcılar sizi kimlerle karşılaştırıyor? Aynı işi başka yoldan kim çözüyor? Yalnızca adlar; her biri doğrulanmamış bir aday olarak başlar.',
  },
  relationship_unknown: {
    en: '{name}: is this a direct competitor, an indirect one, a substitute, or a reference brand you admire?',
    fa: '{name}: این رقیب مستقیم است، غیرمستقیم، جایگزین، یا برندی مرجع که آن را تحسین می‌کنید؟',
    tr: '{name}: doğrudan rakip mi, dolaylı rakip mi, ikame mi, yoksa örnek aldığınız bir marka mı?',
  },
  identity_unverified: {
    en: '{name}: the official website is not verified. Record a source fetched from its domain, then verify the domain.',
    fa: '{name}: وب‌سایت رسمی تأیید نشده است. منبعی را که از دامنهٔ آن دریافت شده ثبت کنید و سپس دامنه را تأیید کنید.',
    tr: '{name}: resmi web sitesi doğrulanmadı. Alan adından alınmış bir kaynak kaydedin, sonra alan adını doğrulayın.',
  },
  dimension_unknown: {
    en: '{name}: {dimension} is unknown. A dated source is needed; it stays unknown until then.',
    fa: '{name}: {dimension} نامعلوم است. یک منبع تاریخ‌دار لازم است؛ تا آن زمان نامعلوم می‌ماند.',
    tr: '{name}: {dimension} bilinmiyor. Tarihli bir kaynak gerekiyor; o zamana kadar bilinmiyor olarak kalır.',
  },
  evidence_needs_review: {
    en: '{name}: the source {note} for {dimension} {reason}. It is not used as current until re-checked.',
    fa: '{name}: منبع {note} برای {dimension} {reason}. تا بازبینی دوباره، به‌عنوان دادهٔ فعلی استفاده نمی‌شود.',
    tr: '{name}: {dimension} için {note} kaynağı {reason}. Yeniden kontrol edilene kadar güncel sayılmaz.',
  },
  evidence_conflicting: {
    en: '{name}: sources disagree about {dimension}. Both are kept; decide after reading them.',
    fa: '{name}: منابع دربارهٔ {dimension} با هم اختلاف دارند. هر دو نگه داشته می‌شوند؛ پس از خواندن آن‌ها تصمیم بگیرید.',
    tr: '{name}: kaynaklar {dimension} konusunda çelişiyor. İkisi de saklanır; okuduktan sonra karar verin.',
  },
  same_name_other_market: {
    en: '{name}: another candidate has the same name in a different market. They are kept apart; confirm they are different businesses.',
    fa: '{name}: نامزد دیگری با همین نام در بازار دیگری هست. جدا نگه داشته می‌شوند؛ تأیید کنید که دو کسب‌وکار متفاوت‌اند.',
    tr: '{name}: başka bir pazarda aynı adlı bir aday var. Ayrı tutulurlar; farklı işletmeler olduklarını doğrulayın.',
  },
  prices_not_comparable: {
    en: 'The recorded prices are not comparable as they stand ({reason}). They are listed, not ranked, and never converted between currencies.',
    fa: 'قیمت‌های ثبت‌شده در وضع فعلی قابل مقایسه نیستند ({reason}). فقط فهرست می‌شوند، رتبه‌بندی نمی‌شوند و هرگز بین ارزها تبدیل نمی‌شوند.',
    tr: 'Kaydedilen fiyatlar bu haliyle karşılaştırılamaz ({reason}). Sıralanmaz, yalnızca listelenir ve para birimleri arasında asla çevrilmez.',
  },
  seo_needs_search_evidence: {
    en: 'For SEO, competitor names are not search evidence. Rankings and keyword gaps stay unverified without search data.',
    fa: 'برای سئو، نام رقبا شواهد جست‌وجو نیست. رتبه‌ها و شکاف‌های کلیدواژه بدون دادهٔ جست‌وجو تأییدنشده می‌مانند.',
    tr: 'SEO için rakip adları arama kanıtı değildir. Sıralamalar ve anahtar kelime boşlukları arama verisi olmadan doğrulanmamış kalır.',
  },
}

export const REVIEW_REASONS: Catalog = {
  stale: { en: 'is older than its freshness limit (history, not current)', fa: 'از محدودهٔ تازگی‌اش قدیمی‌تر است (سابقه است، نه دادهٔ فعلی)', tr: 'tazelik sınırından eski (geçmiş kayıt, güncel değil)' },
  changed: { en: 'was edited after it was cited', fa: 'پس از استناد ویرایش شده است', tr: 'alıntılandıktan sonra düzenlendi' },
  superseded: { en: 'was replaced by a newer capture', fa: 'با دریافت تازه‌تری جایگزین شده است', tr: 'daha yeni bir kayıtla değiştirildi' },
  archived: { en: 'was archived', fa: 'بایگانی شده است', tr: 'arşivlendi' },
  missing: { en: 'can no longer be read', fa: 'دیگر خوانده نمی‌شود', tr: 'artık okunamıyor' },
  claim_missing: { en: 'no longer holds the cited claim', fa: 'دیگر ادعای استنادشده را ندارد', tr: 'alıntılanan iddiayı artık içermiyor' },
}

export const PROHIBITED_TEXT: Catalog = {
  ad_performance: {
    en: 'No ad spend, reach, conversions, ROAS, CAC or campaign effectiveness from visible ads or pages.',
    fa: 'هیچ برداشتی دربارهٔ هزینهٔ تبلیغات، دسترسی، تبدیل، ROAS، CAC یا اثربخشی کمپین از تبلیغات یا صفحه‌های قابل مشاهده نمی‌شود.',
    tr: 'Görünür reklamlardan ya da sayfalardan reklam harcaması, erişim, dönüşüm, ROAS, CAC veya kampanya etkinliği çıkarılmaz.',
  },
  private_commercials: {
    en: 'No private discounts, revenue, market share or traffic from a public price page.',
    fa: 'هیچ برداشتی دربارهٔ تخفیف خصوصی، درآمد، سهم بازار یا ترافیک از صفحهٔ قیمت عمومی نمی‌شود.',
    tr: 'Açık bir fiyat sayfasından özel indirim, gelir, pazar payı veya trafik çıkarılmaz.',
  },
  search_rankings: {
    en: 'No search rankings or keyword gaps from a list of names.',
    fa: 'هیچ رتبهٔ جست‌وجو یا شکاف کلیدواژه‌ای از یک فهرست نام استنباط نمی‌شود.',
    tr: 'Bir ad listesinden arama sıralaması veya anahtar kelime boşluğu çıkarılmaz.',
  },
  legal_clearance: {
    en: 'No trademark clearance, originality or legal-safety claim from a visual comparison.',
    fa: 'هیچ ادعای ثبت علامت تجاری، اصالت یا ایمنی حقوقی از مقایسهٔ بصری نمی‌شود.',
    tr: 'Görsel bir karşılaştırmadan marka tescili, özgünlük veya hukuki güvenlik iddiası çıkarılmaz.',
  },
  brand_decision: {
    en: 'A competitor observation never sets this brand’s price, positioning, channels or logo; the owner decides through the existing approval flow.',
    fa: 'مشاهدهٔ یک رقیب هرگز قیمت، جایگاه، کانال‌ها یا لوگوی این برند را تعیین نمی‌کند؛ مالک از راه فرایند تأیید موجود تصمیم می‌گیرد.',
    tr: 'Bir rakip gözlemi bu markanın fiyatını, konumunu, kanallarını veya logosunu asla belirlemez; sahibi mevcut onay akışıyla karar verir.',
  },
  currency_conversion: {
    en: 'No currency conversion or tax calculation without a dated, cited rate and method.',
    fa: 'هیچ تبدیل ارز یا محاسبهٔ مالیاتی بدون نرخ و روش تاریخ‌دار و مستند انجام نمی‌شود.',
    tr: 'Tarihli ve kaynaklı bir kur ve yöntem olmadan döviz çevirisi veya vergi hesabı yapılmaz.',
  },
  price_coordination: {
    en: 'No price matching or coordination with competitors. This brand sets its prices independently.',
    fa: 'هیچ تطبیق یا هماهنگی قیمت با رقبا انجام نمی‌شود. این برند قیمت‌هایش را مستقل تعیین می‌کند.',
    tr: 'Rakiplerle fiyat eşleme veya fiyat koordinasyonu yapılmaz. Bu marka fiyatlarını bağımsız belirler.',
  },
}

export function asLang(value: unknown): CompetitiveLang {
  return typeof value === 'string' && (COMPETITIVE_LANGS as readonly string[]).includes(value) ? (value as CompetitiveLang) : 'en'
}

export function fill(template: string, vars: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match)
}

/** Headings of the human-readable landscape printed by brand:competitive matrix. State values stay stable codes. */
export const HEADINGS: Catalog = {
  title: { en: 'Competitive landscape for {name} ({state}). Draft, owner-only; authorizes nothing.', fa: 'چشم‌انداز رقابتی {name} ({state}). پیش‌نویس، فقط برای مالک؛ هیچ مجوزی نمی‌دهد.', tr: '{name} için rekabet görünümü ({state}). Taslak, yalnızca sahibine özel; hiçbir şeye yetki vermez.' },
  research: { en: 'Research: {state}{reason}', fa: 'پژوهش: {state}{reason}', tr: 'Araştırma: {state}{reason}' },
  scope: { en: 'Scope: {purposes}. Target market fact {fact}: {state}.', fa: 'دامنه: {purposes}. واقعیت بازار هدف {fact}: {state}.', tr: 'Kapsam: {purposes}. Hedef pazar bilgisi {fact}: {state}.' },
  scope_not_set: { en: 'not set', fa: 'تعیین نشده', tr: 'belirlenmedi' },
  prices: { en: 'Public prices (listed, not ranked; no currency conversion): {state}{reason}', fa: 'قیمت‌های عمومی (فهرست‌شده، بدون رتبه‌بندی؛ بدون تبدیل ارز): {state}{reason}', tr: 'Açık fiyatlar (listelenir, sıralanmaz; döviz çevirisi yok): {state}{reason}' },
  gaps: { en: 'Gaps:', fa: 'شکاف‌ها:', tr: 'Eksikler:' },
  never: { en: 'Never inferred:', fa: 'هرگز استنباط نمی‌شود:', tr: 'Asla çıkarılmaz:' },
  observed_on: { en: 'observed {date}', fa: 'مشاهده‌شده در {date}', tr: '{date} tarihinde gözlemlendi' },
}
