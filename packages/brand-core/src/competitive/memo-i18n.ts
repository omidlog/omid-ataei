import type { CompetitiveLang } from './i18n.js'

/**
 * Human-facing text of the four Slice C drafts (marketing opportunity memo, pricing benchmark memo, SEO cited
 * supplement, visual landscape assessment). Codes are stable; text is en/fa/tr. Placeholders: {name} {offer}
 * {date} {field} {dimension}.
 */

type Catalog = Record<string, Record<CompetitiveLang, string>>

export const MEMO_TITLES: Catalog = {
  marketing_opportunity_memo: { en: 'Marketing opportunity assessment (draft)', fa: 'ارزیابی فرصت‌های بازاریابی (پیش‌نویس)', tr: 'Pazarlama fırsatı değerlendirmesi (taslak)' },
  pricing_benchmark_memo: { en: 'Pricing benchmark and options (draft)', fa: 'مقایسهٔ قیمت و گزینه‌های قیمت‌گذاری (پیش‌نویس)', tr: 'Fiyat karşılaştırması ve seçenekler (taslak)' },
  seo_competitor_supplement: { en: 'SEO competitor supplement, cited (draft)', fa: 'پیوست رقبا برای سئو، با استناد (پیش‌نویس)', tr: 'SEO rakip eki, kaynaklı (taslak)' },
  visual_landscape_assessment: { en: 'Visual landscape assessment (draft)', fa: 'ارزیابی چشم‌انداز بصری (پیش‌نویس)', tr: 'Görsel görünüm değerlendirmesi (taslak)' },
}

export const MEMO_HEADINGS: Catalog = {
  preamble: {
    en: 'Draft for the owner. It changes no brand fact, price, plan or asset and authorizes nothing. Context: {state}.',
    fa: 'پیش‌نویس برای مالک. هیچ واقعیت برند، قیمت، برنامه یا دارایی را تغییر نمی‌دهد و مجوز هیچ کاری نیست. وضعیت زمینه: {state}.',
    tr: 'Sahibi için taslak. Hiçbir marka bilgisini, fiyatı, planı veya varlığı değiştirmez ve hiçbir şeye yetki vermez. Bağlam: {state}.',
  },
  owner_inputs: { en: 'Owner decisions this draft is read against (cited by id and revision):', fa: 'تصمیم‌های مالک که این پیش‌نویس با آن‌ها سنجیده می‌شود (با شناسه و نسخه):', tr: 'Bu taslağın dayandığı sahip kararları (kimlik ve sürümle):' },
  observations: { en: 'Cited observations:', fa: 'مشاهده‌های مستند:', tr: 'Kaynaklı gözlemler:' },
  unresolved: { en: 'Unresolved (conflicting, stale or changed; not used as current):', fa: 'حل‌نشده (متناقض، قدیمی یا تغییرکرده؛ به‌عنوان دادهٔ فعلی استفاده نمی‌شود):', tr: 'Çözülmemiş (çelişkili, eski veya değişmiş; güncel sayılmaz):' },
  alternatives: { en: 'Alternatives (hypotheses for the owner to weigh):', fa: 'گزینه‌ها (فرضیه‌هایی برای سنجش مالک):', tr: 'Seçenekler (sahibinin tartacağı hipotezler):' },
  price_table: { en: 'Public prices (as advertised; listed, not ranked; no currency conversion): {state}{reason}', fa: 'قیمت‌های عمومی (همان‌طور که اعلام شده؛ فهرست‌شده، بدون رتبه‌بندی؛ بدون تبدیل ارز): {state}{reason}', tr: 'Açık fiyatlar (ilan edildiği gibi; listelenir, sıralanmaz; döviz çevirisi yok): {state}{reason}' },
  warnings: { en: 'Warnings:', fa: 'هشدارها:', tr: 'Uyarılar:' },
  owner_named: { en: 'Names from the SEO interview (owner assumptions, not search evidence):', fa: 'نام‌ها از مصاحبهٔ سئو (فرض‌های مالک، نه شواهد جست‌وجو):', tr: 'SEO görüşmesinden adlar (sahibin varsayımları, arama kanıtı değil):' },
  search_evidence: { en: 'Search evidence: rankings {rankings}; keyword gaps {gaps}.', fa: 'شواهد جست‌وجو: رتبه‌ها {rankings}؛ شکاف‌های کلیدواژه {gaps}.', tr: 'Arama kanıtı: sıralamalar {rankings}; anahtar kelime boşlukları {gaps}.' },
  visual: { en: 'Visual comparison: {state}.', fa: 'مقایسهٔ بصری: {state}.', tr: 'Görsel karşılaştırma: {state}.' },
  intake: { en: 'Identity intake hint (unapproved): logo {logo}, intent {intent}.', fa: 'اشارهٔ ورودی هویت (تأییدنشده): لوگو {logo}، قصد {intent}.', tr: 'Kimlik girişi ipucu (onaysız): logo {logo}, niyet {intent}.' },
  not_known: { en: 'Not known (never inferred here):', fa: 'نامعلوم (اینجا هرگز استنباط نمی‌شود):', tr: 'Bilinmiyor (burada asla çıkarılmaz):' },
  proposed_edits: { en: 'If the owner wants a change:', fa: 'اگر مالک تغییری بخواهد:', tr: 'Sahibi bir değişiklik isterse:' },
  next_research: { en: 'Next research:', fa: 'پژوهش بعدی:', tr: 'Sonraki araştırma:' },
  never: { en: 'Never inferred:', fa: 'هرگز استنباط نمی‌شود:', tr: 'Asla çıkarılmaz:' },
  sources: { en: 'Sources (Knowledge research notes):', fa: 'منابع (یادداشت‌های پژوهشی دانش):', tr: 'Kaynaklar (Bilgi araştırma notları):' },
  trade_off: { en: 'trade-off', fa: 'بده‌بستان', tr: 'ödünleşim' },
  depends_on: { en: 'depends on', fa: 'وابسته به', tr: 'bağlı olduğu' },
  approved: { en: 'approved', fa: 'تأییدشده', tr: 'onaylı' },
  missing: { en: 'not approved yet', fa: 'هنوز تأیید نشده', tr: 'henüz onaylanmadı' },
}

export const NOT_KNOWN: Catalog = {
  ad_spend: { en: 'Competitors’ ad spend and budgets.', fa: 'هزینه و بودجهٔ تبلیغات رقبا.', tr: 'Rakiplerin reklam harcaması ve bütçeleri.' },
  conversion: { en: 'Conversion rates, ROAS and CPA.', fa: 'نرخ تبدیل، ROAS و CPA.', tr: 'Dönüşüm oranları, ROAS ve CPA.' },
  revenue: { en: 'Revenue, market share and traffic.', fa: 'درآمد، سهم بازار و ترافیک.', tr: 'Gelir, pazar payı ve trafik.' },
  targeting: { en: 'Who their ads actually target.', fa: 'اینکه تبلیغاتشان واقعاً چه کسانی را هدف می‌گیرد.', tr: 'Reklamlarının gerçekte kimi hedeflediği.' },
  effectiveness: { en: 'Whether any observed message or channel actually works.', fa: 'اینکه آیا پیام یا کانال مشاهده‌شده واقعاً کار می‌کند.', tr: 'Gözlemlenen bir mesajın veya kanalın gerçekten işe yarayıp yaramadığı.' },
  price_paid: { en: 'What customers actually pay (private discounts, negotiated deals).', fa: 'آنچه مشتریان واقعاً می‌پردازند (تخفیف‌های خصوصی، قراردادهای مذاکره‌شده).', tr: 'Müşterilerin gerçekte ne ödediği (özel indirimler, pazarlıklı anlaşmalar).' },
  costs: { en: 'Competitors’ costs and margins.', fa: 'هزینه‌ها و حاشیهٔ سود رقبا.', tr: 'Rakiplerin maliyetleri ve marjları.' },
  willingness_to_pay: { en: 'Our buyers’ willingness to pay (needs customer evidence).', fa: 'تمایل خریداران ما به پرداخت (به شواهد مشتری نیاز دارد).', tr: 'Alıcılarımızın ödeme isteği (müşteri kanıtı gerekir).' },
  fx_tax: { en: 'Cross-currency or tax-inclusive comparison (no dated, cited rate and method).', fa: 'مقایسهٔ بین ارزها یا با احتساب مالیات (نرخ و روش تاریخ‌دار و مستند وجود ندارد).', tr: 'Para birimleri arası veya vergi dahil karşılaştırma (tarihli, kaynaklı kur ve yöntem yok).' },
  rankings: { en: 'Search rankings and positions.', fa: 'رتبه‌ها و جایگاه‌های جست‌وجو.', tr: 'Arama sıralamaları ve konumlar.' },
  keyword_gaps: { en: 'Keyword gaps and search volume.', fa: 'شکاف‌های کلیدواژه و حجم جست‌وجو.', tr: 'Anahtar kelime boşlukları ve arama hacmi.' },
  ai_visibility: { en: 'Visibility in AI answers (GEO); nothing is guaranteed.', fa: 'دیده‌شدن در پاسخ‌های هوش مصنوعی (GEO)؛ هیچ چیز تضمین‌شده نیست.', tr: 'Yapay zekâ yanıtlarındaki görünürlük (GEO); hiçbir şey garanti değildir.' },
  legal_clearance: { en: 'Trademark clearance and legal originality (needs qualified review).', fa: 'ثبت علامت تجاری و اصالت حقوقی (به بررسی کارشناس واجد شرایط نیاز دارد).', tr: 'Marka tescili ve hukuki özgünlük (yetkin bir incelemeye ihtiyaç var).' },
  recognition: { en: 'Measured recognition of the current identity (owner-reported unless a study is supplied).', fa: 'میزان شناخته‌شدن سنجیده‌شدهٔ هویت فعلی (گزارش مالک، مگر اینکه مطالعه‌ای ارائه شود).', tr: 'Mevcut kimliğin ölçülmüş tanınırlığı (bir çalışma sunulmadıkça sahibin beyanı).' },
  artwork: { en: 'Any competitor artwork, palette or motif not cited in a source.', fa: 'هر اثر هنری، پالت یا نقش‌مایهٔ رقیب که در منبعی مستند نشده است.', tr: 'Bir kaynakta alıntılanmamış rakip görseli, paleti veya motifi.' },
  aesthetics: { en: 'Which design is more beautiful; this is not graded.', fa: 'اینکه کدام طراحی زیباتر است؛ این امتیازدهی نمی‌شود.', tr: 'Hangi tasarımın daha güzel olduğu; bu puanlanmaz.' },
}

export const ALTERNATIVES: Record<string, { title: Record<CompetitiveLang, string>; trade_off: Record<CompetitiveLang, string> }> = {
  differentiate: {
    title: { en: 'Lead with a message the cited competitors do not claim', fa: 'با پیامی پیش بروید که رقبای مستندشده ادعا نمی‌کنند', tr: 'Kaynaklı rakiplerin iddia etmediği bir mesajla öne çıkın' },
    trade_off: { en: 'Distinct, but the message is untested and needs proof; it may address a smaller need.', fa: 'متمایز است، اما پیام آزموده نشده و به اثبات نیاز دارد؛ شاید نیاز کوچک‌تری را پوشش دهد.', tr: 'Farklıdır ama mesaj denenmemiştir ve kanıt ister; daha küçük bir ihtiyaca hitap edebilir.' },
  },
  match_with_proof: {
    title: { en: 'Answer the buyer question the cited competitors answer, with proof', fa: 'به همان پرسش خریدار که رقبای مستندشده پاسخ می‌دهند، با اثبات پاسخ دهید', tr: 'Kaynaklı rakiplerin yanıtladığı alıcı sorusunu kanıtla yanıtlayın' },
    trade_off: { en: 'Meets an expectation buyers already have, but competes head-on where competitors are established.', fa: 'انتظاری را که خریداران از قبل دارند برآورده می‌کند، اما در جایی که رقبا جاافتاده‌اند رودررو رقابت می‌کند.', tr: 'Alıcıların zaten sahip olduğu bir beklentiyi karşılar ama rakiplerin yerleşik olduğu yerde doğrudan rekabet eder.' },
  },
  channel_test: {
    title: { en: 'Test a channel where no competitor use was observed', fa: 'کانالی را بیازمایید که استفادهٔ رقبا در آن مشاهده نشده است', tr: 'Rakip kullanımı gözlemlenmeyen bir kanalı deneyin' },
    trade_off: { en: 'Less crowded, but not observing a competitor there is not proof of an opportunity.', fa: 'شلوغی کمتری دارد، اما مشاهده‌نکردن رقیب در آنجا دلیل وجود فرصت نیست.', tr: 'Daha az kalabalıktır ama orada rakip gözlemlememek bir fırsatın kanıtı değildir.' },
  },
  gather_evidence: {
    title: { en: 'Hold changes and close the listed research gaps first', fa: 'تغییرات را نگه دارید و ابتدا شکاف‌های پژوهشی فهرست‌شده را ببندید', tr: 'Değişiklikleri bekletin ve önce listelenen araştırma eksiklerini kapatın' },
    trade_off: { en: 'Slower, but avoids building on unknowns.', fa: 'کندتر است، اما از بنا کردن روی ناشناخته‌ها جلوگیری می‌کند.', tr: 'Daha yavaştır ama bilinmeyenler üzerine kurmaktan kaçınır.' },
  },
  value_based: {
    title: { en: 'Value-based pricing', fa: 'قیمت‌گذاری بر پایهٔ ارزش', tr: 'Değere dayalı fiyatlandırma' },
    trade_off: { en: 'Ties price to the value buyers get, but needs evidence of that value and of willingness to pay.', fa: 'قیمت را به ارزشی که خریدار می‌گیرد پیوند می‌دهد، اما به شواهد آن ارزش و تمایل به پرداخت نیاز دارد.', tr: 'Fiyatı alıcının elde ettiği değere bağlar ama bu değerin ve ödeme isteğinin kanıtını ister.' },
  },
  tiered: {
    title: { en: 'Tiered plans', fa: 'طرح‌های چندسطحی', tr: 'Kademeli planlar' },
    trade_off: { en: 'Serves different segments, but adds complexity and needs clear feature boundaries.', fa: 'بخش‌های مختلف را پوشش می‌دهد، اما پیچیدگی می‌افزاید و به مرز روشن ویژگی‌ها نیاز دارد.', tr: 'Farklı segmentlere hizmet eder ama karmaşıklık ekler ve net özellik sınırları ister.' },
  },
  premium: {
    title: { en: 'Premium position', fa: 'جایگاه ممتاز', tr: 'Premium konum' },
    trade_off: { en: 'Signals quality and protects margin, but needs proof buyers accept it and shrinks the reachable market.', fa: 'نشانهٔ کیفیت است و حاشیهٔ سود را حفظ می‌کند، اما به اثبات پذیرش خریداران نیاز دارد و بازار در دسترس را کوچک می‌کند.', tr: 'Kalite işareti verir ve marjı korur ama alıcıların kabul ettiğine dair kanıt ister ve erişilebilir pazarı daraltır.' },
  },
  entry_level: {
    title: { en: 'Entry-level offer', fa: 'پیشنهاد سطح ورودی', tr: 'Giriş seviyesi teklif' },
    trade_off: { en: 'Lowers the barrier to try, but depends on costs and an upgrade path; a low price is hard to raise later.', fa: 'مانع امتحان کردن را کم می‌کند، اما به هزینه‌ها و مسیر ارتقا وابسته است؛ قیمت پایین را بعداً سخت می‌شود بالا برد.', tr: 'Denemenin önündeki engeli düşürür ama maliyetlere ve bir yükseltme yoluna bağlıdır; düşük bir fiyatı sonra yükseltmek zordur.' },
  },
  retain_improve_guidelines: {
    title: { en: 'Retain the current identity and improve its usage guidelines', fa: 'هویت فعلی را نگه دارید و راهنمای استفادهٔ آن را بهتر کنید', tr: 'Mevcut kimliği koruyun ve kullanım kılavuzunu iyileştirin' },
    trade_off: { en: 'Keeps whatever recognition exists at low cost; right when the audit finds no confusing similarity and the identity serves its uses.', fa: 'هر میزان شناخته‌شدنی را که وجود دارد با هزینهٔ کم حفظ می‌کند؛ وقتی درست است که ممیزی شباهت گمراه‌کننده‌ای نیابد و هویت کاربردهایش را پوشش دهد.', tr: 'Var olan tanınırlığı düşük maliyetle korur; denetim kafa karıştırıcı bir benzerlik bulmadığında ve kimlik kullanımlarına hizmet ettiğinde doğrudur.' },
  },
  evolve: {
    title: { en: 'Evolve: refine the identity and keep its recognizable cues', fa: 'تکامل: هویت را پالایش کنید و نشانه‌های آشنای آن را نگه دارید', tr: 'Evrim: kimliği inceltin ve tanınan ipuçlarını koruyun' },
    trade_off: { en: 'Fixes specific problems with less recognition risk; needs a clear list of what to preserve.', fa: 'مشکلات مشخص را با ریسک کمتر برای شناخته‌شدن رفع می‌کند؛ به فهرست روشنی از آنچه باید حفظ شود نیاز دارد.', tr: 'Belirli sorunları daha az tanınırlık riskiyle çözer; neyin korunacağına dair net bir liste ister.' },
  },
  rebrand: {
    title: { en: 'Broad rebrand', fa: 'بازبرندسازی گسترده', tr: 'Kapsamlı yeniden markalama' },
    trade_off: { en: 'Only with a stated reason (new market, repositioning, a failing identity, a legal issue); highest cost and recognition risk.', fa: 'فقط با دلیلی روشن (بازار جدید، جایگاه‌یابی دوباره، هویت ناکارآمد، مشکل حقوقی)؛ بیشترین هزینه و ریسک شناخته‌شدن.', tr: 'Yalnızca belirtilmiş bir nedenle (yeni pazar, yeniden konumlandırma, işlemeyen kimlik, hukuki sorun); en yüksek maliyet ve tanınırlık riski.' },
  },
  create: {
    title: { en: 'Create a first identity', fa: 'ساخت نخستین هویت', tr: 'İlk kimliği oluşturun' },
    trade_off: { en: 'No existing recognition to lose; competitor conventions show what to avoid copying, not what to copy.', fa: 'شناخته‌شدنی برای از دست دادن وجود ندارد؛ قراردادهای رقبا نشان می‌دهند از چه چیزی نباید تقلید کرد، نه از چه چیزی باید تقلید کرد.', tr: 'Kaybedilecek bir tanınırlık yoktur; rakip alışkanlıkları neyin kopyalanacağını değil, neyin kopyalanmaması gerektiğini gösterir.' },
  },
}

export const DEPENDENCIES: Catalog = {
  costs: { en: 'our costs', fa: 'هزینه‌های ما', tr: 'maliyetlerimiz' },
  willingness_to_pay: { en: 'willingness to pay', fa: 'تمایل به پرداخت', tr: 'ödeme isteği' },
  customer_evidence: { en: 'customer evidence', fa: 'شواهد مشتری', tr: 'müşteri kanıtı' },
  business_model: { en: 'business model', fa: 'مدل کسب‌وکار', tr: 'iş modeli' },
}

export const WARNINGS: Catalog = {
  no_current_price: {
    en: 'No current competitor price is recorded for this scope. Nothing here is a priced recommendation.',
    fa: 'هیچ قیمت فعلی از رقبا برای این دامنه ثبت نشده است. هیچ‌چیز اینجا پیشنهاد قیمت نیست.',
    tr: 'Bu kapsam için güncel bir rakip fiyatı kaydedilmedi. Buradaki hiçbir şey fiyatlı bir öneri değildir.',
  },
  historical_price: {
    en: '{name} {offer} was observed {date} and is historical. Refresh it before treating it as a current market price.',
    fa: '{name} {offer} در {date} مشاهده شده و قدیمی است. پیش از اینکه آن را قیمت فعلی بازار بدانید، تازه‌اش کنید.',
    tr: '{name} {offer} {date} tarihinde gözlemlendi ve geçmiş kayıttır. Güncel piyasa fiyatı saymadan önce yenileyin.',
  },
  promotional_price: {
    en: '{name} {offer} is a promotional price, not a standard rate.',
    fa: '{name} {offer} قیمت تبلیغاتی است، نه نرخ استاندارد.',
    tr: '{name} {offer} bir kampanya fiyatıdır, standart ücret değildir.',
  },
  promotion_unknown: {
    en: '{name} {offer}: whether this is a promotion is unknown; do not read it as a standard rate.',
    fa: '{name} {offer}: معلوم نیست این قیمت تبلیغاتی است یا نه؛ آن را نرخ استاندارد ندانید.',
    tr: '{name} {offer}: bunun bir kampanya olup olmadığı bilinmiyor; standart ücret olarak okumayın.',
  },
  monthly_rate_billed_annually: {
    en: '{name} {offer} is a monthly rate billed annually, not a month-to-month price.',
    fa: '{name} {offer} نرخ ماهانه‌ای است که سالانه پرداخت می‌شود، نه قیمت ماه‌به‌ماه.',
    tr: '{name} {offer} yıllık faturalanan aylık bir ücrettir, aydan aya fiyat değildir.',
  },
  price_needs_review: {
    en: '{name} {offer}: its source changed, was replaced or can no longer be read. It is not used until re-checked.',
    fa: '{name} {offer}: منبع آن تغییر کرده، جایگزین شده یا دیگر خوانده نمی‌شود. تا بازبینی دوباره استفاده نمی‌شود.',
    tr: '{name} {offer}: kaynağı değişti, yenisiyle değiştirildi veya artık okunamıyor. Yeniden kontrol edilene kadar kullanılmaz.',
  },
  price_conflicting: {
    en: '{name} {offer}: sources disagree about this price. Both are kept; neither is used as current.',
    fa: '{name} {offer}: منابع دربارهٔ این قیمت اختلاف دارند. هر دو نگه داشته می‌شوند؛ هیچ‌کدام دادهٔ فعلی شمرده نمی‌شود.',
    tr: '{name} {offer}: kaynaklar bu fiyat konusunda çelişiyor. İkisi de saklanır; hiçbiri güncel sayılmaz.',
  },
  visual_unavailable: {
    en: 'No current cited visual observation exists. Visual comparison is unavailable; no palette, motif or similarity is assumed.',
    fa: 'هیچ مشاهدهٔ بصری مستند و فعلی وجود ندارد. مقایسهٔ بصری در دسترس نیست؛ هیچ پالت، نقش‌مایه یا شباهتی فرض نمی‌شود.',
    tr: 'Güncel, kaynaklı bir görsel gözlem yok. Görsel karşılaştırma yapılamıyor; hiçbir palet, motif veya benzerlik varsayılmaz.',
  },
  similarity_not_assessed: {
    en: 'Similarity to competitor marks is not assessed here. A visual comparison is a risk signal, never legal clearance.',
    fa: 'شباهت به نشان‌های رقبا اینجا ارزیابی نمی‌شود. مقایسهٔ بصری فقط نشانهٔ ریسک است، هرگز تأیید حقوقی نیست.',
    tr: 'Rakip işaretlerine benzerlik burada değerlendirilmez. Görsel karşılaştırma bir risk işaretidir, asla hukuki onay değildir.',
  },
  seo_interview_unreadable: {
    en: 'The SEO interview record could not be read; owner-named competitors are not shown.',
    fa: 'رکورد مصاحبهٔ سئو خوانده نشد؛ رقبایی که مالک نام برده نمایش داده نمی‌شوند.',
    tr: 'SEO görüşme kaydı okunamadı; sahibin adlandırdığı rakipler gösterilmiyor.',
  },
}

export const PROPOSE_EDIT: Record<CompetitiveLang, string> = {
  en: '{field}: propose the change with brand:knowledge propose, then brand:review and brand:approve. This draft writes nothing.',
  fa: '{field}: تغییر را با brand:knowledge propose پیشنهاد دهید، سپس brand:review و brand:approve. این پیش‌نویس چیزی نمی‌نویسد.',
  tr: '{field}: değişikliği brand:knowledge propose ile önerin, ardından brand:review ve brand:approve. Bu taslak hiçbir şey yazmaz.',
}

export const SEO_NAME_STATUS: Catalog = {
  matched_candidate: { en: 'in the competitor index as {id}', fa: 'در فهرست رقبا با شناسهٔ {id}', tr: 'rakip dizininde {id} olarak' },
  not_in_index: { en: 'not in the competitor index (brand:competitive import-seo-names adds it as a candidate)', fa: 'در فهرست رقبا نیست (brand:competitive import-seo-names آن را به‌عنوان نامزد اضافه می‌کند)', tr: 'rakip dizininde yok (brand:competitive import-seo-names onu aday olarak ekler)' },
}
