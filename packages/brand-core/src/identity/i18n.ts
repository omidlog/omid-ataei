/**
 * Human-facing text of the identity audit and logo brief (Identity Slice D). Codes are stable English tokens; text is
 * en/fa/tr. Placeholders: {component} {path} {field} {list} {use}.
 */

export const IDENTITY_LANGS = ['en', 'fa', 'tr'] as const
export type IdentityLang = (typeof IDENTITY_LANGS)[number]

type T = Record<IdentityLang, string>
type Catalog = Record<string, T>

export function fillText(text: string, vars: Record<string, string> = {}): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`)
}

export const COMPONENT_LABELS: Catalog = {
  name: { en: 'name', fa: 'نام', tr: 'ad' },
  logo_symbol: { en: 'logo symbol', fa: 'نماد لوگو', tr: 'logo sembolü' },
  logo_wordmark: { en: 'wordmark', fa: 'نوشتار لوگو', tr: 'yazı logosu' },
  colors: { en: 'colors', fa: 'رنگ‌ها', tr: 'renkler' },
  typography: { en: 'typography', fa: 'تایپوگرافی', tr: 'tipografi' },
  mascot: { en: 'mascot', fa: 'کاراکتر', tr: 'maskot' },
  tone: { en: 'tone', fa: 'لحن', tr: 'ton' },
  tagline: { en: 'tagline', fa: 'شعار', tr: 'slogan' },
  imagery: { en: 'imagery', fa: 'تصویرسازی', tr: 'görsel dil' },
  other: { en: 'other', fa: 'دیگر', tr: 'diğer' },
}

export const CONCLUSIONS: Catalog = {
  create_first_identity: {
    en: 'There is no current logo to preserve: this brief prepares a first identity. No master exists yet and none is implied.',
    fa: 'لوگوی فعلی‌ای برای حفظ وجود ندارد: این بریف برای ساختن اولین هویت است. هنوز فایل اصلی‌ای وجود ندارد و چیزی فرض نشده است.',
    tr: 'Korunacak mevcut bir logo yok: bu brief ilk kimliği hazırlar. Henüz ana dosya yok ve varmış gibi davranılmaz.',
  },
  retain_improve_usage: {
    en: 'Keeping the current identity and improving its usage rules is a valid conclusion here: nothing in the audit justifies a costly change.',
    fa: 'نگه‌داشتن هویت فعلی و بهترکردن قواعد استفاده از آن در اینجا نتیجه‌ای معتبر است: چیزی در این بررسی تغییر پرهزینه را توجیه نمی‌کند.',
    tr: 'Mevcut kimliği koruyup kullanım kurallarını iyileştirmek burada geçerli bir sonuçtur: denetimde maliyetli bir değişikliği haklı kılan bir şey yok.',
  },
  change_requested: {
    en: 'The owner marked elements for change. The routes below compare how much to change; the current identity stays canonical until a new one is approved.',
    fa: 'مالک بخش‌هایی را برای تغییر علامت زده است. مسیرهای زیر میزان تغییر را مقایسه می‌کنند؛ هویت فعلی تا تأیید هویت جدید معتبر می‌ماند.',
    tr: 'Sahip bazı öğeleri değişiklik için işaretledi. Aşağıdaki yollar ne kadar değişeceğini karşılaştırır; yenisi onaylanana kadar mevcut kimlik geçerli kalır.',
  },
  owner_decision_required: {
    en: 'The identity path is not decided. Confirm it first (brand:identity answer --question identity.path); the routes below are for comparison only.',
    fa: 'مسیر هویت هنوز روشن نیست. ابتدا آن را تأیید کنید (brand:identity answer --question identity.path)؛ مسیرهای زیر فقط برای مقایسه‌اند.',
    tr: 'Kimlik yolu belirlenmedi. Önce onu onaylayın (brand:identity answer --question identity.path); aşağıdaki yollar yalnızca karşılaştırma içindir.',
  },
}

export const PATH_SOURCE: Catalog = {
  owner_confirmed: { en: 'confirmed by the owner in the identity audit', fa: 'تأییدشده توسط مالک در بررسی هویت', tr: 'sahip tarafından kimlik denetiminde onaylandı' },
  intake_hint_unconfirmed: { en: 'from the onboarding hint, not yet confirmed', fa: 'از اشارهٔ ورود اولیه، هنوز تأیید نشده', tr: 'ilk kurulum ipucundan, henüz onaylanmadı' },
  none: { en: 'not recorded', fa: 'ثبت نشده', tr: 'kaydedilmedi' },
}

type RouteText = { title: T; why: T; why_not: T }

export const ROUTES: Record<string, RouteText> = {
  wordmark_led: {
    title: { en: 'Wordmark-led identity', fa: 'هویت مبتنی بر نوشتار لوگو', tr: 'Yazı logosu odaklı kimlik' },
    why: { en: 'Builds recognition of the name itself; works well when the name is short and must be remembered.', fa: 'خود نام را به خاطر سپردنی می‌کند؛ وقتی نام کوتاه است و باید در ذهن بماند خوب کار می‌کند.', tr: 'Adın kendisini tanıtır; ad kısa ve akılda kalması gerektiğinde iyi çalışır.' },
    why_not: { en: 'Weak at icon sizes (app icon, favicon, avatar) unless a reduced mark is added; hard when the name must work in several scripts.', fa: 'در اندازهٔ آیکون (آیکون اپ، فاوآیکون، آواتار) ضعیف است مگر نشانهٔ کوچک‌شده‌ای اضافه شود؛ وقتی نام باید در چند خط کار کند دشوار است.', tr: 'Küçültülmüş bir işaret eklenmedikçe simge boyutlarında (uygulama simgesi, favicon, avatar) zayıftır; ad birkaç yazı sisteminde çalışmalıysa zordur.' },
  },
  symbol_and_wordmark: {
    title: { en: 'Symbol plus wordmark', fa: 'نماد به‌همراه نوشتار لوگو', tr: 'Sembol artı yazı logosu' },
    why: { en: 'A symbol carries small sizes and the wordmark carries the name; the most flexible system across uses.', fa: 'نماد در اندازه‌های کوچک کار می‌کند و نوشتار، نام را منتقل می‌کند؛ انعطاف‌پذیرترین سیستم برای کاربردهای مختلف.', tr: 'Sembol küçük boyutları, yazı logosu adı taşır; kullanım alanları arasında en esnek sistemdir.' },
    why_not: { en: 'A new symbol needs time and exposure before it means anything; more parts to govern.', fa: 'نماد جدید پیش از معنا پیدا کردن به زمان و دیده‌شدن نیاز دارد؛ اجزای بیشتری برای مدیریت.', tr: 'Yeni bir sembolün anlam kazanması için zaman ve görünürlük gerekir; yönetilecek daha çok parça vardır.' },
  },
  character_mark: {
    title: { en: 'Character-led mark (mascot module is enabled)', fa: 'نشان مبتنی بر کاراکتر (ماژول کاراکتر فعال است)', tr: 'Karakter odaklı işaret (maskot modülü açık)' },
    why: { en: 'Uses the brand character for warmth and memorability, especially in apps and social.', fa: 'از کاراکتر برند برای گرما و به‌یادماندنی‌بودن استفاده می‌کند، به‌ویژه در اپ و شبکه‌های اجتماعی.', tr: 'Sıcaklık ve akılda kalıcılık için marka karakterini kullanır; özellikle uygulamalarda ve sosyal medyada.' },
    why_not: { en: 'Detail breaks at small sizes; ties the identity to one character. Optional: the brand does not need a mascot.', fa: 'جزئیات در اندازهٔ کوچک از بین می‌رود؛ هویت را به یک کاراکتر گره می‌زند. اختیاری است: برند به کاراکتر نیاز ندارد.', tr: 'Ayrıntılar küçük boyutta kaybolur; kimliği tek bir karaktere bağlar. İsteğe bağlıdır: markanın maskota ihtiyacı yoktur.' },
  },
  monogram_icon: {
    title: { en: 'Monogram or compact icon with a wordmark', fa: 'مونوگرام یا آیکون فشرده به‌همراه نوشتار', tr: 'Monogram veya kompakt simge artı yazı logosu' },
    why: { en: 'Prioritizes a square, compact mark for app icon, favicon and avatar uses.', fa: 'نشانهٔ مربعی و فشرده را برای آیکون اپ، فاوآیکون و آواتار در اولویت قرار می‌دهد.', tr: 'Uygulama simgesi, favicon ve avatar için kare, kompakt bir işarete öncelik verir.' },
    why_not: { en: 'Letter monograms are common and easily confused; distinctiveness must be checked against the landscape.', fa: 'مونوگرام‌های حرفی رایج‌اند و به‌راحتی با هم اشتباه می‌شوند؛ متمایزبودن باید با چشم‌انداز رقبا سنجیده شود.', tr: 'Harf monogramları yaygındır ve kolayca karıştırılır; ayırt edicilik rakip görünümüne karşı kontrol edilmelidir.' },
  },
  retain_improve_usage: {
    title: { en: 'Retain the identity, improve usage rules', fa: 'هویت را نگه دارید، قواعد استفاده را بهتر کنید', tr: 'Kimliği koruyun, kullanım kurallarını iyileştirin' },
    why: { en: 'Keeps whatever recognition exists at the lowest cost; fixes inconsistency with clear space, minimum size, color and misuse rules.', fa: 'هر میزان شناخته‌شدنی را که وجود دارد با کمترین هزینه حفظ می‌کند؛ ناهماهنگی را با قواعد فضای خالی، حداقل اندازه، رنگ و موارد ممنوع رفع می‌کند.', tr: 'Var olan tanınırlığı en düşük maliyetle korur; tutarsızlığı boşluk, en küçük boyut, renk ve yanlış kullanım kurallarıyla giderir.' },
    why_not: { en: 'Does not solve a real structural problem (unreadable mark, legal issue, wrong positioning).', fa: 'مشکل ساختاری واقعی (نشان ناخوانا، مسئلهٔ حقوقی، جایگاه نادرست) را حل نمی‌کند.', tr: 'Gerçek bir yapısal sorunu (okunmayan işaret, hukuki sorun, yanlış konumlandırma) çözmez.' },
  },
  evolve_preserve_equity: {
    title: { en: 'Evolve while preserving recognizable cues', fa: 'تکامل با حفظ نشانه‌های شناخته‌شده', tr: 'Tanınır ipuçlarını koruyarak geliştirme' },
    why: { en: 'Refines what the owner marked for change and keeps what is marked preserve, so continuity is visible.', fa: 'آنچه مالک برای تغییر علامت زده را بهبود می‌دهد و آنچه برای حفظ علامت خورده را نگه می‌دارد تا پیوستگی دیده شود.', tr: 'Sahibin değişiklik için işaretlediğini iyileştirir, korunacak olanı tutar; böylece süreklilik görünür kalır.' },
    why_not: { en: 'May be too subtle to signal a real change; still has migration cost for every asset.', fa: 'ممکن است برای نشان‌دادن تغییر واقعی بیش از حد جزئی باشد؛ همچنان برای هر دارایی هزینهٔ جابه‌جایی دارد.', tr: 'Gerçek bir değişikliği göstermek için fazla ince kalabilir; her varlık için yine geçiş maliyeti vardır.' },
  },
  full_rebrand: {
    title: { en: 'Full rebrand', fa: 'بازسازی کامل برند', tr: 'Tam yeniden markalaşma' },
    why: { en: 'Clean break for a new market, repositioning, merger or legal issue.', fa: 'گسستی روشن برای بازار جدید، جایگاه‌یابی دوباره، ادغام یا مسئلهٔ حقوقی.', tr: 'Yeni pazar, yeniden konumlandırma, birleşme veya hukuki sorun için temiz bir kopuş.' },
    why_not: { en: 'Resets any recognition the current identity has; the highest migration cost and risk.', fa: 'هر میزان شناخته‌شدن هویت فعلی را از بین می‌برد؛ بیشترین هزینه و ریسک جابه‌جایی.', tr: 'Mevcut kimliğin tanınırlığını sıfırlar; en yüksek geçiş maliyeti ve riski.' },
  },
}

export const RISKS: Catalog = {
  possible_recognition_loss: { en: 'Changing {component} may lose recognition the owner believes it has (not measured unless a study is cited).', fa: 'تغییر {component} ممکن است شناخته‌شدنی را که مالک به آن باور دارد از بین ببرد (سنجیده نشده مگر مطالعه‌ای مستند شود).', tr: '{component} değişirse sahibin var olduğuna inandığı tanınırlık kaybolabilir (bir çalışma gösterilmedikçe ölçülmemiştir).' },
  name_change_legal_and_migration: { en: 'A name change needs a legal search and touches domains, stores, accounts and every document.', fa: 'تغییر نام به جست‌وجوی حقوقی نیاز دارد و دامنه‌ها، فروشگاه‌ها، حساب‌ها و همهٔ اسناد را درگیر می‌کند.', tr: 'Ad değişikliği hukuki araştırma gerektirir; alan adlarını, mağazaları, hesapları ve her belgeyi etkiler.' },
  needs_research: { en: 'The value of {component} is not known yet; decide after evidence or owner review.', fa: 'ارزش {component} هنوز معلوم نیست؛ پس از شواهد یا بررسی مالک تصمیم بگیرید.', tr: '{component} öğesinin değeri henüz bilinmiyor; kanıt veya sahip incelemesinden sonra karar verin.' },
  preserve_conflict: { en: '{component} is listed as must-not-change but marked {choice}. Resolve this before any concept work.', fa: '{component} در فهرست «نباید تغییر کند» است اما {choice} علامت خورده. پیش از هر کار طراحی این را روشن کنید.', tr: '{component} değişmemeli listesinde ama {choice} olarak işaretli. Tasarım çalışmasından önce bunu çözün.' },
  approved_assets_canonical: { en: 'Approved assets stay canonical until a new master is approved and the references are updated.', fa: 'دارایی‌های تأییدشده تا تأیید فایل اصلی جدید و به‌روزشدن ارجاع‌ها معتبر می‌مانند.', tr: 'Onaylı varlıklar yeni ana dosya onaylanıp referanslar güncellenene kadar geçerli kalır.' },
  rollout_printed_stock: { en: 'Printed stock must be used up or replaced.', fa: 'موجودی چاپی باید مصرف یا جایگزین شود.', tr: 'Basılı stok tüketilmeli veya değiştirilmeli.' },
  rollout_app_store_listing: { en: 'App store icon and screenshots change together; plan a release.', fa: 'آیکون و تصاویر صفحهٔ اپ در فروشگاه با هم تغییر می‌کنند؛ برای انتشار برنامه‌ریزی کنید.', tr: 'Uygulama mağazası simgesi ve ekran görüntüleri birlikte değişir; bir sürüm planlayın.' },
  rollout_signage: { en: 'Signage changes are slow and costly.', fa: 'تغییر تابلوها کند و پرهزینه است.', tr: 'Tabela değişiklikleri yavaş ve maliyetlidir.' },
  rollout_packaging: { en: 'Packaging needs new production files and stock transition.', fa: 'بسته‌بندی به فایل‌های تولید جدید و گذار موجودی نیاز دارد.', tr: 'Ambalaj yeni üretim dosyaları ve stok geçişi gerektirir.' },
  rollout_partner_materials: { en: 'Partners hold copies of the current logo; they need the new files and a date.', fa: 'همکاران نسخه‌هایی از لوگوی فعلی دارند؛ به فایل‌های جدید و یک تاریخ نیاز دارند.', tr: 'İş ortaklarında mevcut logonun kopyaları var; yeni dosyalara ve bir tarihe ihtiyaçları olacak.' },
  recognition_reset: { en: 'Recognition starts again from zero.', fa: 'شناخته‌شدن دوباره از صفر شروع می‌شود.', tr: 'Tanınırlık sıfırdan başlar.' },
  conflicts_with_preserve: { en: 'Conflicts with elements marked preserve: {list}.', fa: 'با بخش‌هایی که برای حفظ علامت خورده‌اند در تضاد است: {list}.', tr: 'Korunacak olarak işaretlenen öğelerle çelişir: {list}.' },
  too_subtle: { en: 'The change may not be noticed.', fa: 'ممکن است تغییر دیده نشود.', tr: 'Değişiklik fark edilmeyebilir.' },
  problem_persists: { en: 'The observed problem would remain.', fa: 'مشکل مشاهده‌شده باقی می‌ماند.', tr: 'Gözlemlenen sorun kalır.' },
  small_size_detail: { en: 'Detail must survive the smallest real use.', fa: 'جزئیات باید در کوچک‌ترین کاربرد واقعی باقی بماند.', tr: 'Ayrıntılar en küçük gerçek kullanımda da korunmalı.' },
  similarity_unchecked: { en: 'Similarity to other marks is not assessed here; it needs a visual check and a legal search.', fa: 'شباهت به نشان‌های دیگر اینجا سنجیده نمی‌شود؛ به بررسی بصری و جست‌وجوی حقوقی نیاز دارد.', tr: 'Diğer işaretlere benzerlik burada değerlendirilmez; görsel kontrol ve hukuki araştırma gerekir.' },
}

export const RED_LINES: Catalog = {
  no_tracing: { en: 'No tracing, copying or close imitation of another company’s logo, including competitors in the landscape.', fa: 'هیچ ردگیری، کپی یا تقلید نزدیک از لوگوی شرکت دیگر، از جمله رقبای موجود در چشم‌انداز.', tr: 'Rakipler dahil başka bir şirketin logosunun kopyalanması, üzerinden çizilmesi veya yakın taklidi yok.' },
  inspiration_rights: { en: 'Inspiration is reference only; use it only when its rights are own or licensed, and never reproduce it.', fa: 'الهام فقط مرجع است؛ فقط وقتی حق استفاده متعلق به خود یا دارای مجوز است از آن استفاده کنید و هرگز آن را بازتولید نکنید.', tr: 'İlham yalnızca referanstır; hakları size ait veya lisanslıysa kullanın ve asla yeniden üretmeyin.' },
  no_fake_files: { en: 'No placeholder or generated file is presented as the brand’s logo; the EXAMPLE assets are not a mark.', fa: 'هیچ فایل نمونه یا تولیدشده‌ای به‌عنوان لوگوی برند ارائه نمی‌شود؛ دارایی‌های EXAMPLE نشان برند نیستند.', tr: 'Hiçbir yer tutucu veya üretilmiş dosya markanın logosu olarak sunulmaz; EXAMPLE varlıklar bir işaret değildir.' },
  no_trademark_claim: { en: 'No claim of uniqueness, registration or legal clearance without qualified review.', fa: 'بدون بررسی کارشناس واجد شرایط، هیچ ادعایی دربارهٔ یکتایی، ثبت یا مجوز حقوقی نمی‌شود.', tr: 'Yetkin bir inceleme olmadan benzersizlik, tescil veya hukuki uygunluk iddiası yok.' },
  keep_preserved: { en: 'Do not change elements marked preserve: {list}.', fa: 'بخش‌هایی را که برای حفظ علامت خورده‌اند تغییر ندهید: {list}.', tr: 'Korunacak olarak işaretlenen öğeleri değiştirmeyin: {list}.' },
}

export const RUBRIC: Catalog = {
  strategic_fit: { en: 'Strategic fit: does it express the approved differentiation and personality?', fa: 'تناسب راهبردی: آیا تمایز و شخصیت تأییدشده را بیان می‌کند؟', tr: 'Stratejik uyum: onaylı farklılaşmayı ve kişiliği ifade ediyor mu?' },
  distinctiveness: { en: 'Distinctiveness: is it clearly different from the cited landscape?', fa: 'متمایزبودن: آیا به‌روشنی با چشم‌انداز مستند متفاوت است؟', tr: 'Ayırt edicilik: kaynaklı rakip görünümünden açıkça farklı mı?' },
  legibility: { en: 'Legibility: readable at the smallest real use and in every required script?', fa: 'خوانایی: در کوچک‌ترین کاربرد واقعی و در همهٔ خط‌های لازم خواناست؟', tr: 'Okunabilirlik: en küçük gerçek kullanımda ve gereken tüm yazı sistemlerinde okunuyor mu?' },
  versatility: { en: 'Versatility: works in one color, reversed and on every listed use?', fa: 'انعطاف‌پذیری: در یک رنگ، معکوس و در همهٔ کاربردهای فهرست‌شده کار می‌کند؟', tr: 'Çok yönlülük: tek renkte, ters renkte ve listelenen her kullanımda çalışıyor mu?' },
  meaningfulness: { en: 'Meaningfulness: can the owner explain why it fits the brand?', fa: 'معناداری: آیا مالک می‌تواند توضیح دهد چرا با برند سازگار است؟', tr: 'Anlamlılık: sahip, markaya neden uyduğunu açıklayabiliyor mu?' },
  longevity: { en: 'Longevity: does it avoid short-lived trends?', fa: 'ماندگاری: آیا از مدهای زودگذر دوری می‌کند؟', tr: 'Kalıcılık: kısa ömürlü trendlerden kaçınıyor mu?' },
  feasibility: { en: 'Feasibility: can it be produced and governed with the team and budget the owner has?', fa: 'امکان‌پذیری: با تیم و منابعی که مالک دارد قابل تولید و مدیریت است؟', tr: 'Uygulanabilirlik: sahibin ekibi ve kaynaklarıyla üretilip yönetilebilir mi?' },
  legal_risk_review: { en: 'Legal-risk review: has a qualified person checked name and mark similarity? (Not done by this brief.)', fa: 'بررسی ریسک حقوقی: آیا فردی واجد شرایط شباهت نام و نشان را بررسی کرده است؟ (این بریف انجام نمی‌دهد.)', tr: 'Hukuki risk incelemesi: yetkin biri ad ve işaret benzerliğini kontrol etti mi? (Bu brief yapmaz.)' },
}

export const APPLICATION_CHECKS: Catalog = {
  square_crop: { en: '{use}: works in a square crop without the wordmark.', fa: '{use}: در برش مربعی و بدون نوشتار کار می‌کند.', tr: '{use}: yazı logosu olmadan kare kırpmada çalışır.' },
  circle_crop: { en: '{use}: works inside a circle crop.', fa: '{use}: درون برش دایره‌ای کار می‌کند.', tr: '{use}: daire kırpma içinde çalışır.' },
  smallest_size: { en: '{use}: test at the smallest size the platform shows; record the measured minimum only after a master exists.', fa: '{use}: در کوچک‌ترین اندازه‌ای که پلتفرم نشان می‌دهد آزمایش کنید؛ حداقل اندازهٔ سنجیده را فقط پس از وجود فایل اصلی ثبت کنید.', tr: '{use}: platformun gösterdiği en küçük boyutta test edin; ölçülen en küçük boyutu yalnızca ana dosya olduktan sonra kaydedin.' },
  horizontal_lockup: { en: '{use}: a horizontal lockup that fits a header height.', fa: '{use}: ترکیب افقی که در ارتفاع سربرگ جا شود.', tr: '{use}: başlık yüksekliğine sığan yatay bir yerleşim.' },
  dark_light: { en: '{use}: check on light and dark backgrounds, including dark mode.', fa: '{use}: روی پس‌زمینهٔ روشن و تیره، از جمله حالت تیره، بررسی کنید.', tr: '{use}: açık ve koyu arka planlarda, karanlık mod dahil, kontrol edin.' },
  one_color: { en: '{use}: one-color and reversed versions.', fa: '{use}: نسخهٔ تک‌رنگ و معکوس.', tr: '{use}: tek renk ve ters renk sürümleri.' },
  print_color: { en: '{use}: check spot/CMYK conversion and the substrate before production.', fa: '{use}: پیش از تولید، تبدیل رنگ اسپات/CMYK و جنس سطح چاپ را بررسی کنید.', tr: '{use}: üretimden önce spot/CMYK dönüşümünü ve baskı yüzeyini kontrol edin.' },
  distance: { en: '{use}: legibility at viewing distance.', fa: '{use}: خوانایی از فاصلهٔ دید.', tr: '{use}: izleme mesafesinden okunabilirlik.' },
  motion_states: { en: '{use}: start and end frames, and a reduced-motion version.', fa: '{use}: فریم آغاز و پایان، و نسخهٔ کاهش حرکت.', tr: '{use}: başlangıç ve bitiş kareleri ile azaltılmış hareket sürümü.' },
  simplified: { en: '{use}: a simplified version for embroidery or small objects.', fa: '{use}: نسخهٔ ساده‌شده برای گلدوزی یا اشیای کوچک.', tr: '{use}: nakış veya küçük nesneler için sadeleştirilmiş sürüm.' },
  raster_fallback: { en: '{use}: a raster fallback that survives email clients and dark mode.', fa: '{use}: نسخهٔ رستری جایگزین که در برنامه‌های ایمیل و حالت تیره سالم بماند.', tr: '{use}: e-posta istemcilerinde ve karanlık modda bozulmayan bir raster yedek.' },
  rtl_lockup: { en: 'Persian/Arabic: a right-to-left lockup and spacing that do not mirror the symbol by accident.', fa: 'فارسی/عربی: ترکیب و فاصله‌گذاری راست‌به‌چپ که نماد را ناخواسته قرینه نکند.', tr: 'Farsça/Arapça: sembolü yanlışlıkla aynalamayan sağdan sola yerleşim ve boşluklar.' },
  contrast: { en: 'Contrast against every background the mark is placed on.', fa: 'کنتراست در برابر هر پس‌زمینه‌ای که نشان روی آن قرار می‌گیرد.', tr: 'İşaretin yerleştirildiği her arka planla kontrast.' },
  formats: { en: 'Masters as safe SVG plus exports, registered in brand/assets/asset-manifest.yaml with license and checksum.', fa: 'فایل‌های اصلی به‌صورت SVG امن به‌همراه خروجی‌ها، ثبت‌شده در brand/assets/asset-manifest.yaml با مجوز و checksum.', tr: 'Ana dosyalar güvenli SVG ve dışa aktarımlar olarak, lisans ve checksum ile brand/assets/asset-manifest.yaml dosyasına kayıtlı.' },
}

export const USE_LABELS: Catalog = {
  app_icon: { en: 'App icon', fa: 'آیکون اپ', tr: 'Uygulama simgesi' },
  favicon: { en: 'Favicon', fa: 'فاوآیکون', tr: 'Favicon' },
  website_header: { en: 'Website header', fa: 'سربرگ وب‌سایت', tr: 'Web sitesi başlığı' },
  social_avatar: { en: 'Social avatar', fa: 'تصویر پروفایل اجتماعی', tr: 'Sosyal medya profil görseli' },
  print: { en: 'Print', fa: 'چاپ', tr: 'Baskı' },
  packaging: { en: 'Packaging', fa: 'بسته‌بندی', tr: 'Ambalaj' },
  signage: { en: 'Signage', fa: 'تابلو', tr: 'Tabela' },
  motion: { en: 'Motion', fa: 'موشن', tr: 'Hareketli görsel' },
  merchandise: { en: 'Merchandise', fa: 'کالای تبلیغاتی', tr: 'Promosyon ürünü' },
  email: { en: 'Email', fa: 'ایمیل', tr: 'E-posta' },
}

export const MISSING: Catalog = {
  path_unconfirmed: { en: 'The identity path is not confirmed by the owner.', fa: 'مسیر هویت توسط مالک تأیید نشده است.', tr: 'Kimlik yolu sahip tarafından onaylanmadı.' },
  diagnosis_pending: { en: 'Diagnosis questions still open: {list}.', fa: 'پرسش‌های بررسی هنوز باز است: {list}.', tr: 'Hâlâ açık tanı soruları: {list}.' },
  fact_missing: { en: '{field} is not approved yet; the brief does not fill it in.', fa: '{field} هنوز تأیید نشده است؛ بریف آن را پر نمی‌کند.', tr: '{field} henüz onaylanmadı; brief onu doldurmaz.' },
  no_master: { en: 'No approved logo master exists. Nothing in this brief is a logo file.', fa: 'هیچ فایل اصلی تأییدشده‌ای برای لوگو وجود ندارد. هیچ چیز در این بریف فایل لوگو نیست.', tr: 'Onaylı bir logo ana dosyası yok. Bu brief’teki hiçbir şey logo dosyası değildir.' },
  visual_unavailable: { en: 'No current, cited visual observation: visual comparison is unavailable (a research gap, not a finding).', fa: 'هیچ مشاهدهٔ بصری فعلی و مستندی نیست: مقایسهٔ بصری در دسترس نیست (شکاف پژوهشی، نه یافته).', tr: 'Güncel, kaynaklı görsel gözlem yok: görsel karşılaştırma yapılamıyor (bir araştırma boşluğu, bulgu değil).' },
  no_creative_project: { en: 'No Creative Learning project is linked for concept rounds (brand:creative project --surface logo, then brand:identity link-creative).', fa: 'هیچ پروژهٔ یادگیری خلاق برای دورهای طراحی پیوند نشده است (brand:creative project --surface logo، سپس brand:identity link-creative).', tr: 'Konsept turları için bağlı bir Yaratıcı Öğrenme projesi yok (brand:creative project --surface logo, ardından brand:identity link-creative).' },
  legal_review: { en: 'Name and mark legal search: required, not performed.', fa: 'جست‌وجوی حقوقی نام و نشان: لازم است، انجام نشده.', tr: 'Ad ve işaret için hukuki araştırma: gerekli, yapılmadı.' },
  equity_unknown: { en: 'Equity is unknown for: {list}. No recognition figure is assumed.', fa: 'ارزش برند برای این موارد نامعلوم است: {list}. هیچ رقمی برای شناخته‌شدن فرض نمی‌شود.', tr: 'Şu öğeler için marka değeri bilinmiyor: {list}. Hiçbir tanınırlık rakamı varsayılmaz.' },
}

export const HANDOFF: Catalog = {
  select: { en: 'Run concept rounds in Creative Learning (brand:creative feedback/select). Selecting a concept is not approving a mark.', fa: 'دورهای طراحی را در یادگیری خلاق اجرا کنید (brand:creative feedback/select). انتخاب یک طرح به معنای تأیید نشان نیست.', tr: 'Konsept turlarını Yaratıcı Öğrenme’de yürütün (brand:creative feedback/select). Bir konsepti seçmek işareti onaylamak değildir.' },
  register: { en: 'Register the real artwork in brand/assets/asset-manifest.yaml with license, rights and checksum, and run npm run validate.', fa: 'اثر واقعی را با مجوز، حقوق و checksum در brand/assets/asset-manifest.yaml ثبت کنید و npm run validate را اجرا کنید.', tr: 'Gerçek çizimi lisans, haklar ve checksum ile brand/assets/asset-manifest.yaml dosyasına kaydedin ve npm run validate çalıştırın.' },
  approve: { en: 'Change brand.logo.* (and any name, color or type decision) only through brand:propose or brand:knowledge propose, then brand:review and brand:approve.', fa: 'brand.logo.* (و هر تصمیم دربارهٔ نام، رنگ یا حروف) را فقط از راه brand:propose یا brand:knowledge propose و سپس brand:review و brand:approve تغییر دهید.', tr: 'brand.logo.* (ve ad, renk veya yazı kararlarını) yalnızca brand:propose veya brand:knowledge propose, ardından brand:review ve brand:approve ile değiştirin.' },
  specify: { en: 'The logo-designer skill then specifies lockups, clear space and minimum sizes from the approved master.', fa: 'سپس مهارت logo-designer ترکیب‌ها، فضای خالی و حداقل اندازه‌ها را از فایل اصلی تأییدشده مشخص می‌کند.', tr: 'Ardından logo-designer becerisi onaylı ana dosyadan yerleşimleri, boşluğu ve en küçük boyutları belirler.' },
  legal: { en: 'A qualified person runs the trademark search before launch.', fa: 'پیش از عرضه، فردی واجد شرایط جست‌وجوی علامت تجاری را انجام می‌دهد.', tr: 'Lansmandan önce yetkin biri marka araştırmasını yapar.' },
  canonical: { en: 'Until then the current identity and its approved assets remain canonical.', fa: 'تا آن زمان هویت فعلی و دارایی‌های تأییدشدهٔ آن معتبر می‌مانند.', tr: 'O zamana kadar mevcut kimlik ve onaylı varlıkları geçerli kalır.' },
}

export const NEXT_STEP: Catalog = {
  confirm_path: { en: 'Confirm the identity path.', fa: 'مسیر هویت را تأیید کنید.', tr: 'Kimlik yolunu onaylayın.' },
  answer_diagnosis: { en: 'Answer the next diagnosis question: {field}.', fa: 'به پرسش بعدی بررسی پاسخ دهید: {field}.', tr: 'Sonraki tanı sorusunu yanıtlayın: {field}.' },
  record_visuals: { en: 'Record cited visual sources for the competitors (brand:seo research, then brand:competitive link --dimension visual_language).', fa: 'منابع بصری مستند رقبا را ثبت کنید (brand:seo research، سپس brand:competitive link --dimension visual_language).', tr: 'Rakipler için kaynaklı görsel kaynakları kaydedin (brand:seo research, ardından brand:competitive link --dimension visual_language).' },
  concept_round: { en: 'Run a concept round for the preferred route and record owner feedback.', fa: 'برای مسیر ترجیحی یک دور طراحی اجرا کنید و بازخورد مالک را ثبت کنید.', tr: 'Tercih edilen yol için bir konsept turu yapın ve sahibin geri bildirimini kaydedin.' },
  approve_artwork: { en: 'Register and approve the selected real artwork through the existing asset and approval flow.', fa: 'اثر واقعی انتخاب‌شده را از مسیر موجود دارایی و تأیید ثبت و تأیید کنید.', tr: 'Seçilen gerçek çizimi mevcut varlık ve onay akışıyla kaydedin ve onaylayın.' },
}

export const BRIEF_HEADINGS: Catalog = {
  title: { en: 'Logo and identity brief (draft)', fa: 'بریف لوگو و هویت (پیش‌نویس)', tr: 'Logo ve kimlik brief’i (taslak)' },
  preamble: { en: 'Draft for the owner. It approves nothing, changes no brand fact, logo or asset, and authorizes nothing (authorizes: []).', fa: 'پیش‌نویس برای مالک. چیزی را تأیید نمی‌کند، هیچ واقعیت برند، لوگو یا دارایی را تغییر نمی‌دهد و مجوز هیچ کاری نیست (authorizes: []).', tr: 'Sahibi için taslak. Hiçbir şeyi onaylamaz, hiçbir marka bilgisini, logoyu veya varlığı değiştirmez ve hiçbir şeye yetki vermez (authorizes: []).' },
  status: { en: 'Status', fa: 'وضعیت', tr: 'Durum' },
  path: { en: 'Identity path', fa: 'مسیر هویت', tr: 'Kimlik yolu' },
  conclusion: { en: 'Audit conclusion', fa: 'نتیجهٔ بررسی', tr: 'Denetim sonucu' },
  problem: { en: 'Problem definition and desired outcome', fa: 'تعریف مسئله و نتیجهٔ مطلوب', tr: 'Sorun tanımı ve istenen sonuç' },
  canonical: { en: 'Audience, geography, personality, differentiation (approved facts, by id)', fa: 'مخاطب، جغرافیا، شخصیت، تمایز (واقعیت‌های تأییدشده، با شناسه)', tr: 'Hedef kitle, coğrafya, kişilik, farklılaşma (onaylı bilgiler, kimlikle)' },
  assets: { en: 'Existing assets', fa: 'دارایی‌های موجود', tr: 'Mevcut varlıklar' },
  equity: { en: 'Equity preservation matrix', fa: 'جدول حفظ ارزش برند', tr: 'Marka değeri koruma tablosu' },
  migration: { en: 'Migration risks', fa: 'ریسک‌های جابه‌جایی', tr: 'Geçiş riskleri' },
  landscape: { en: 'Competitor visual landscape (identity projection only)', fa: 'چشم‌انداز بصری رقبا (فقط برش هویت)', tr: 'Rakip görsel görünümü (yalnızca kimlik projeksiyonu)' },
  routes: { en: 'Conceptual routes', fa: 'مسیرهای مفهومی', tr: 'Kavramsal yollar' },
  applications: { en: 'Uses and application checks', fa: 'کاربردها و بررسی‌های اجرا', tr: 'Kullanımlar ve uygulama kontrolleri' },
  production: { en: 'Accessibility, small-size, one-color and production checks', fa: 'بررسی‌های دسترس‌پذیری، اندازهٔ کوچک، تک‌رنگ و تولید', tr: 'Erişilebilirlik, küçük boyut, tek renk ve üretim kontrolleri' },
  red_lines: { en: 'Inspiration rights and red lines', fa: 'حقوق الهام و خطوط قرمز', tr: 'İlham hakları ve kırmızı çizgiler' },
  rubric: { en: 'Evaluation rubric (unweighted unless the owner chooses weights)', fa: 'معیار ارزیابی (بدون وزن، مگر مالک وزن تعیین کند)', tr: 'Değerlendirme ölçütleri (sahip ağırlık seçmedikçe ağırlıksız)' },
  iteration: { en: 'Concept rounds (Creative Learning)', fa: 'دورهای طراحی (یادگیری خلاق)', tr: 'Konsept turları (Yaratıcı Öğrenme)' },
  decision: { en: 'Decision record', fa: 'سابقهٔ تصمیم', tr: 'Karar kaydı' },
  handoff: { en: 'Approval handoff', fa: 'مسیر تأیید', tr: 'Onay devri' },
  missing: { en: 'Missing and unknown', fa: 'موارد ناموجود و نامعلوم', tr: 'Eksik ve bilinmeyen' },
  not_known: { en: 'Not known (never inferred here)', fa: 'نامعلوم (اینجا هرگز استنباط نمی‌شود)', tr: 'Bilinmiyor (burada asla çıkarılmaz)' },
  never: { en: 'Never inferred', fa: 'هرگز استنباط نمی‌شود', tr: 'Asla çıkarılmaz' },
  why: { en: 'why', fa: 'چرا', tr: 'neden' },
  why_not: { en: 'why not', fa: 'چرا نه', tr: 'neden olmasın' },
  risks: { en: 'risks', fa: 'ریسک‌ها', tr: 'riskler' },
  preserves: { en: 'preserves', fa: 'حفظ می‌کند', tr: 'korur' },
  changes: { en: 'may change', fa: 'ممکن است تغییر دهد', tr: 'değiştirebilir' },
  attributes: { en: 'brand attributes (approved facts)', fa: 'ویژگی‌های برند (واقعیت‌های تأییدشده)', tr: 'marka özellikleri (onaylı bilgiler)' },
  approved: { en: 'approved', fa: 'تأییدشده', tr: 'onaylı' },
  missing_fact: { en: 'not approved yet', fa: 'هنوز تأیید نشده', tr: 'henüz onaylanmadı' },
  min_size_unset: { en: 'Minimum size: not set until a master exists and is measured.', fa: 'حداقل اندازه: تا وجود و سنجش فایل اصلی تعیین نمی‌شود.', tr: 'En küçük boyut: ana dosya olup ölçülene kadar belirlenmez.' },
  min_size_fact: { en: 'Minimum size: see approved fact {field}.', fa: 'حداقل اندازه: واقعیت تأییدشدهٔ {field} را ببینید.', tr: 'En küçük boyut: onaylı bilgi {field}.' },
  to_confirm: { en: 'Uses not answered yet; confirm which apply:', fa: 'کاربردها هنوز پاسخ داده نشده‌اند؛ تأیید کنید کدام‌ها صدق می‌کنند:', tr: 'Kullanımlar henüz yanıtlanmadı; hangilerinin geçerli olduğunu onaylayın:' },
  selection: { en: 'Selected for this project (not an approved mark): {field}', fa: 'انتخاب‌شده برای این پروژه (نشان تأییدشده نیست): {field}', tr: 'Bu proje için seçildi (onaylı işaret değil): {field}' },
  review_state: { en: 'Owner review: {field}', fa: 'بررسی مالک: {field}', tr: 'Sahip incelemesi: {field}' },
  reviewer: { en: 'Reviewer fact', fa: 'واقعیت بازبین', tr: 'İnceleyen bilgisi' },
  open_concerns: { en: 'Open concerns', fa: 'نگرانی‌های باز', tr: 'Açık konular' },
  next_revision: { en: 'Next revision', fa: 'بازبینی بعدی', tr: 'Sonraki revizyon' },
  sources: { en: 'Source revisions', fa: 'نسخه‌های منابع', tr: 'Kaynak sürümleri' },
}
