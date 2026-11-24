/**
 * Locale data for the question bank's help text: `why_it_matters` and the example, in Persian and Turkish.
 *
 * English stays the base in each question's own definition (`why`, `example`); this table holds only the fa and tr
 * versions, keyed by question id. `fq` copies them into `why_it_matters_i18n` and `examples_i18n`, and the example
 * keeps its "EXAMPLE ONLY:" marker in every language. A choice or boolean example is an option value, so it stays
 * literal in every language. `tests/question-help-i18n.test.ts` fails when a question has no entry.
 */
export interface QuestionHelpLocale {
  why: string
  example: string
}

export const QUESTION_HELP_I18N: Record<string, { fa: QuestionHelpLocale; tr: QuestionHelpLocale }> = {
  "brand.personality.traits": {
    fa: { why: "لحن، رفتار ماسکات و حرکت همگی از شخصیت برند پیروی می‌کنند. فهرست ویژگی‌هایی که مرز نداشته باشد، به‌سادگی نادرست به کار می‌رود.", example: "آرام و دقیق. نه کنایه‌آمیز. این فقط یک نمونه است." },
    tr: { why: "Ses tonu, maskot davranışı ve hareket kişilikten beslenir. Sınırları olmayan bir özellik listesi yanlış kullanılır.", example: "Sakin ve titiz. Alaycı değil. Bu yalnızca bir örnektir." },
  },
  "brand.strategy.purpose": {
    fa: { why: "هدف، جمله‌ای راهبردی با افق بلندمدت است، نه تیتر یک کمپین.", example: "ناشناخته. هنوز برای ادعای یک هدف اجتماعی زود است." },
    tr: { why: "Amaç, bir kampanya başlığı değil, uzun vadeli bir strateji cümlesidir.", example: "Bilinmiyor. Toplumsal bir amaç iddia etmek için henüz çok erken." },
  },
  "brand.strategy.vision": {
    fa: { why: "چشم‌انداز پیش‌بینی نیست و نباید مثل یک شاخص روی نمودار برود.", example: "فقط یک آرمان: این حوزه کمتر ترسناک به نظر برسد. پیش‌بینی نیست." },
    tr: { why: "Vizyon bir tahmin değildir ve bir metrik gibi grafiğe dökülmemelidir.", example: "Yalnızca bir özlem: bu kategori daha az göz korkutucu hissettirsin. Bir tahmin değildir." },
  },
  "brand.strategy.values": {
    fa: { why: "ارزش‌هایی که هیچ‌وقت تصمیمی را تغییر نمی‌دهند، فقط تزئین‌اند.", example: "ناشناخته. هنوز هیچ ارزشی در برابر یک تصمیم واقعی سنجیده نشده است." },
    tr: { why: "Hiçbir kararı değiştirmeyen değerler yalnızca süstür.", example: "Bilinmiyor. Henüz hiçbir değer bir karar karşısında sınanmadı." },
  },
  "brand.strategy.differentiation": {
    fa: { why: "مقایسه با رقبا بدون منبع، به تبلیغ گمراه‌کننده تبدیل می‌شود.", example: "فرضیه: جلسه‌ها کوتاه‌تر از کلاس حضوری‌اند. تأیید نشده." },
    tr: { why: "Kaynaksız rekabet karşılaştırmaları yanıltıcı reklama dönüşür.", example: "Hipotez: oturumlar bir sınıftakinden daha kısa. Doğrulanmadı." },
  },
  "brand.strategy.promise": {
    fa: { why: "وعده یک تعهد عمومی است. «ناشناخته» از یک صفت عالی توخالی امن‌تر است.", example: "هیچ وعده‌ای تأیید نشده است." },
    tr: { why: "Söz, kamuya açık bir taahhüttür. «Bilinmiyor» demek, içi boş bir üstünlük iddiasından daha güvenlidir.", example: "Onaylanmış bir söz yok." },
  },
  "brand.strategy.decision_rule": {
    fa: { why: "حاکمیت برند پیش از آنکه کتابخانهٔ دارایی‌ها پر شود، به یک قاعده نیاز دارد.", example: "هر چیزی را که ادعای قابلیتی را دارد که product.public_status اجازه نمی‌دهد، رد کنید." },
    tr: { why: "Yönetişim, varlık kütüphanesi dolmadan önce bir kurala ihtiyaç duyar.", example: "product.public_status alanının izin vermediği bir özelliği iddia eden her şeyi reddedin." },
  },
  "brand.strategy.experience": {
    fa: { why: "اصول تجربه، کتاب برند را به وضعیت‌های رابط کاربری و متن‌های پشتیبانی پیوند می‌دهد.", example: "دربارهٔ پیشرفت راستش را بگویید. کسی را به خاطر اشتباه شرمنده نکنید. فقط یک نمونه است." },
    tr: { why: "İlkeler, marka kitabını arayüz durumlarına ve destek metinlerine bağlar.", example: "İlerleme konusunda doğruyu söyleyin. Bir hata yüzünden kimseyi utandırmayın. Yalnızca örnektir." },
  },
  "brand.verbal.name_use": {
    fa: { why: "لوگو و لحن از یک املای واحد شروع می‌شوند.", example: "از نام تجاری کامل استفاده کنید. تلفظ را مالک بعداً مشخص می‌کند." },
    tr: { why: "Logo ve ses tonu tek bir yazımdan yola çıkar.", example: "Ticari adın tamamını kullanın. Telaffuzu sahibi daha sonra belirleyecek." },
  },
  "brand.identity.public_name_override": {
    fa: { why: "داشتن دو نام فقط وقتی مجاز است که این تفاوت عمدی باشد.", example: "same" },
    tr: { why: "İki ad ancak aradaki fark bilinçli olduğunda kabul edilir.", example: "same" },
  },
  "brand.verbal.tagline": {
    fa: { why: "جای خالی شعار در ترکیب لوگو نباید با یک شعار پرکننده پر شود.", example: "none" },
    tr: { why: "Boş logo kilitlenmelerine dolgu niyetine bir slogan konmamalıdır.", example: "none" },
  },
  "brand.verbal.voice": {
    fa: { why: "لحن هر کانال، نسخهٔ تطبیق‌یافتهٔ یک لحن پایه است. پیام‌های خطا معمولاً جایی‌اند که برندها از شخصیت خود خارج می‌شوند.", example: "ساده و مشخص. پیام خطا می‌گوید چه اتفاقی افتاد و قدم بعدی چیست. فقط یک نمونه است." },
    tr: { why: "Kanal tonu, temel bir sesi uyarlar. Markalar karakterden en çok hata mesajlarında çıkar.", example: "Sade ve net. Hata mesajları ne olduğunu ve sırada ne yapılacağını söyler. Yalnızca örnektir." },
  },
  "brand.verbal.forbidden": {
    fa: { why: "زبان ممنوع یک چک‌لیست بازبینی است، نه یک حس کلی.", example: "نه «تسلط تضمینی»، نه جایزهٔ ساختگی، نه شرمنده‌کردن." },
    tr: { why: "Yasaklı dil bir his değil, bir inceleme kontrol listesidir.", example: "“Garantili akıcılık” yok, sahte ödül yok, utandırma yok." },
  },
  "brand.verbal.localization": {
    fa: { why: "پورتال می‌تواند رابط را به fa-IR و tr-TR نشان دهد، بی‌آنکه ادعاهای تأییدشده ترجمه شوند.", example: "فقط انگلیسی، تا وقتی مالک زبان دیگری را تأیید کند." },
    tr: { why: "Portal, onaylı iddiaları çevirmeden arayüzü fa-IR ve tr-TR olarak gösterebilir.", example: "Sahibi başka bir dili onaylayana kadar yalnızca İngilizce." },
  },
  "brand.verbal.microcopy": {
    fa: { why: "متن‌های رابط محصول نباید لحن دومی بسازند.", example: "اول فعل. تا وقتی قاعده‌ای برای جشن‌گرفتن نداریم، علامت تعجب نه." },
    tr: { why: "Ürün arayüzü metinleri ikinci bir ses icat etmemelidir.", example: "Önce fiil. Bir kutlama kuralı oluşana kadar ünlem işareti yok." },
  },
  "brand.verbal.voice_pairs": {
    fa: { why: "نمونه‌های جفتی سریع‌ترین راه است تا نویسنده یا یک ایجنت لحن برند را بشنود. کتاب برند آن‌ها را کنار هم نشان می‌دهد.", example: "بگویید چه اتفاقی افتاد و قدم بعدی چیست | کاربر را مقصر خطا بدانید; از واژه‌های خود یادگیرنده استفاده کنید | از اصطلاحات داخلی استفاده کنید" },
    tr: { why: "Eşleştirilmiş örnekler, bir yazarın ya da bir ajanın sesi duymasının en hızlı yoludur. Marka Kitabı bunları yan yana gösterir.", example: "Ne olduğunu ve sırada ne yapılacağını söyleyin | Hata için kullanıcıyı suçlayın; Öğrencinin kendi kelimelerini kullanın | Şirket içi jargon kullanın" },
  },
  "brand.logo.variants": {
    fa: { why: "فهرست نسخه‌ها دامنهٔ کار طراح را مشخص می‌کند؛ اثر هنری از خودش نمی‌سازد.", example: "هنوز هیچ. شاید بعداً یک لوگوتایپ لازم شود." },
    tr: { why: "Varyant listesi tasarımcının kapsamını belirler. Kendi başına çizim üretmez.", example: "Henüz yok. İleride bir yazı logo gerekebilir." },
  },
  "brand.logo.clear_space": {
    fa: { why: "تعیین عددی حریم لوگو بدون فایل مستر، دقتی ساختگی است.", example: "هنوز مشخص نشده" },
    tr: { why: "Ana dosya olmadan sayısal bir boşluk alanı vermek sahte bir kesinliktir.", example: "Belirlenecek" },
  },
  "brand.logo.min_size": {
    fa: { why: "مشکلات فاویکن و چاپ از حداقل‌هایی می‌آیند که بیان نشده‌اند. این مقادیر پس از تأیید به توکن‌های پیش‌نویس لوگو تبدیل می‌شوند، اما فقط وقتی فایل مستر وجود داشته باشد.", example: "min-size: 24px; clear-space: 0.5x; min-print: 10mm" },
    tr: { why: "Favicon ve baskı sorunları belirtilmemiş alt sınırlardan kaynaklanır. Değerler onaydan sonra taslak logo token'larına dönüşür, ancak yalnızca bir ana dosya varsa.", example: "min-size: 24px; clear-space: 0.5x; min-print: 10mm" },
  },
  "brand.logo.misuse": {
    fa: { why: "برخی ممنوعیت‌ها (کشیدن حروف، رنگ تأییدنشده، نشان ثبت جعلی) به طرح نهایی نیازی ندارند.", example: "لوگو را نکشید، رنگش را عوض نکنید و نشان ثبت به آن اضافه نکنید." },
    tr: { why: "Bazı yasaklar (gerilmiş yazı, onaysız renk, sahte tescil işareti) nihai çizim gerektirmez.", example: "Logoyu germeyin, rengini değiştirmeyin ve tescil işareti eklemeyin." },
  },
  "brand.logo.masters": {
    fa: { why: "کتاب برند و خروجی‌ها لوگوی اصلی را فقط با شناسهٔ دقیق دارایی یا مسیر آن در مانیفست پیدا می‌کنند.", example: "هنوز نه. فقط جای‌نگهدار EXAMPLE در مخزن هست." },
    tr: { why: "Marka kitabı ve dışa aktarımlar ana logoyu yalnızca tam varlık kimliği ya da manifestteki yolu ile bulur.", example: "Henüz değil. Depoda yalnızca EXAMPLE yer tutucusu var." },
  },
  "brand.color.roles": {
    fa: { why: "نقش‌ها با تغییر فام رنگ باقی می‌مانند. نقش و کد hex تأییدشده به یک توکن پیش‌نویس تبدیل می‌شود؛ پیش از انتشار هنوز به تأیید توکن و بررسی کنتراست نیاز دارد.", example: "primary #123A73; onPrimary #FFFFFF; surface #F7F5F2" },
    tr: { why: "Roller bir renk tonu değişikliğinden sonra da geçerli kalır. Onaylı bir rol ve hex değeri taslak bir token'a dönüşür; yayımlanmadan önce yine token onayı ve kontrast denetimi gerekir.", example: "primary #123A73; onPrimary #FFFFFF; surface #F7F5F2" },
  },
  "brand.color.semantic_map": {
    fa: { why: "نام نقش‌های رنگی مال خودتان است. هر نقش تأییدشده یک توکن پیش‌نویس زیر color.brand-role می‌شود؛ این جواب می‌گوید جایگاه‌های تمپلیت (primary، canvas، text …) از کدام نقش استفاده کنند. هیچ‌وقت حدس زده نمی‌شود: نگاشت پیشنهادی تا تأیید شما فقط پیشنهاد می‌ماند.", example: "primary = brand-blue; onPrimary = white; canvas = paper; text = ink" },
    tr: { why: "Rol adları size aittir. Onaylanan her rol color.brand-role altında taslak bir token olur; bu yanıt şablon yuvalarının (primary, canvas, text …) hangi rolü kullanacağını söyler. Asla tahmin edilmez: önerilen eşleme siz onaylayana kadar yalnızca öneridir.", example: "primary = brand-blue; onPrimary = white; canvas = paper; text = ink" },
  },
  "brand.color.themes": {
    fa: { why: "فایل‌های توکن، روشن و تیره را گروه‌بندی می‌کنند، چون تصمیم محصول این را می‌گوید.", example: "both" },
    tr: { why: "Token dosyaları açık ve koyu temayı ürün kararı öyle dediği için gruplar.", example: "both" },
  },
  "brand.color.semantics": {
    fa: { why: "رنگ معنایی یک قرارداد معنایی است، نه تزئین.", example: "رنگ خطر یعنی عمل مخرب یا مسدودکننده. هشدار یعنی قابل بازگشت. فام‌های دقیق هنوز مشخص نشده." },
    tr: { why: "Anlamsal renk bir süsleme değil, bir anlam sözleşmesidir.", example: "Tehlike, yıkıcı ya da engelleyici demektir. Uyarı, geri alınabilir demektir. Kesin tonlar belirlenecek." },
  },
  "brand.color.contrast": {
    fa: { why: "آزمون‌های توکن، جفت‌رنگ‌ها را با معیاری که انتخاب می‌کنید می‌سنجند. پیش‌فرض قالب در توکن‌ها برای متن بدنه AA است.", example: "WCAG 2.2 AA for text. Large display text may use the large-text threshold." },
    tr: { why: "Token testleri renk çiftlerini seçtiğiniz eşiğe göre denetler. Token'lardaki şablon varsayılanı gövde metni için AA'dır.", example: "WCAG 2.2 AA for text. Large display text may use the large-text threshold." },
  },
  "brand.color.print": {
    fa: { why: "کد hex صفحه‌نمایش، مشخصات چاپ نیست.", example: "فعلاً موضوعیت ندارد" },
    tr: { why: "Ekran hex değeri bir baskı spesifikasyonu değildir.", example: "şimdilik geçerli değil" },
  },
  "brand.type.intent": {
    fa: { why: "یک حس می‌تواند به طراح خط بدهد. فایل فونت غیرقانونی نمی‌تواند.", example: "تیترهای آرام و ادیتوریال و متن بدنهٔ بسیار خوانا. خانواده‌های فونت هنوز مشخص نشده." },
    tr: { why: "Bir his, tasarımcıya yön verir. Korsan bir dosya vermez.", example: "Sakin, editoryal başlıklar ve çok okunaklı gövde metni. Yazı aileleri belirlenecek." },
  },
  "brand.type.license": {
    fa: { why: "فایل‌های بدون مجوز نمی‌توانند دارایی تأییدشده باشند.", example: "هیچ خانواده‌ای انتخاب نشده. فقط فونت‌های جایگزین سیستمی." },
    tr: { why: "Lisanssız dosyalar onaylı varlık olamaz.", example: "Seçilmiş bir yazı ailesi yok. Yalnızca sistem yedek fontları." },
  },
  "brand.type.scale": {
    fa: { why: "مقیاس توکن باید با نقش‌های واقعی هماهنگ باشد. خانواده، جایگزین و اندازهٔ تأییدشده به توکن‌های پیش‌نویس تایپوگرافی تبدیل می‌شوند.", example: "body: Inter, system-ui, sans-serif @ 16px/1.5; display: Georgia, serif @ 40px/1.2" },
    tr: { why: "Token ölçeği gerçek rollerle örtüşmelidir. Onaylı bir aile, yedek font ve boyut taslak tipografi token'larına dönüşür.", example: "body: Inter, system-ui, sans-serif @ 16px/1.5; display: Georgia, serif @ 40px/1.2" },
  },
  "brand.type.rtl": {
    fa: { why: "فارسیِ راست‌به‌چپ و ترکیِ لاتین نیازهای متفاوتی در فونت و نشانه‌گذاری دارند.", example: "اول لاتین. خط عربی‌فارسی و ترکی هنوز زبان رسمی برند نیستند." },
    tr: { why: "Sağdan sola yazılan Farsça ile Latin alfabeli Türkçenin font ve noktalama ihtiyaçları farklıdır.", example: "Önce Latin. Arap alfabesi ve Türkçe henüz resmî marka dilleri değil." },
  },
  "brand.type.fallback": {
    fa: { why: "محصولات روی دستگاه‌هایی اجرا می‌شوند که فونت برند را ندارند.", example: "فونت سنس سیستمی برای بدنه. Georgia برای تیترها تا وقتی مجوز تهیه شود." },
    tr: { why: "Ürünler, marka fontu yüklü olmayan cihazlarda da çalışır.", example: "Gövde için sistem arayüzü sans fontu. Lisans alınana kadar başlıklarda Georgia." },
  },
  "brand.mascot.enabled": {
    fa: { why: "پاسخ «نه» پرسش‌های مسکات را حذف و این ماژول را پنهان می‌کند، اما کاتالوگ را از قالب پاک نمی‌کند.", example: "no" },
    tr: { why: "Burada hayır demek maskot sorularını kaldırır ve modülü gizler. Kataloğu şablondan silmez.", example: "no" },
  },
  "brand.mascot.role": {
    fa: { why: "نقش مشخص، جاهایی را که شخصیت ظاهر می‌شود محدود می‌کند.", example: "راهنمایی برای حالت‌های خالی؛ نه سخنگوی ادعاهای حقوقی." },
    tr: { why: "Bir rol, karakterin nerede görüneceğini sınırlar.", example: "Boş durumlar için bir rehber. Hukuki iddiaların sözcüsü değil." },
  },
  "brand.mascot.personality": {
    fa: { why: "شخصیت، برند دوم نیست.", example: "کنجکاو، هرگز بدجنس. وقتی ویژگی‌های برند تعریف شد، باید با آن‌ها هم هماهنگ باشد." },
    tr: { why: "Karakter ikinci bir marka değildir.", example: "Meraklı, asla kaba değil. Marka özellikleri belirlendiğinde onlarla da uyumlu olmalı." },
  },
  "brand.mascot.anatomy": {
    fa: { why: "اگر ساختار بدن ثابت نباشد، حالت‌های چهره بی‌فایده‌اند.", example: "TBD. هنوز شیت مدل تأییدشده‌ای وجود ندارد. تعداد اندام‌ها را از خودتان نسازید." },
    tr: { why: "Vücut planı tutarsızsa ifadelerin bir faydası olmaz.", example: "TBD. Onaylı model paftası yok. Uzuv sayısı uydurmayın." },
  },
  "brand.mascot.forbidden": {
    fa: { why: "پیش از آنکه حجم تولید بالا برود، راهنمای شخصیت به فهرست ممنوعه‌ها نیاز دارد.", example: "بدون اندام اضافه، بدون کپی از شخصیت‌های دیگر، بدون کلیشه‌های ناامن." },
    tr: { why: "Üretim hacmi büyümeden önce karakter rehberinin bir yasaklar listesine ihtiyacı var.", example: "Fazladan uzuv yok, kopya karakter yok, güvensiz stereotip yok." },
  },
  "brand.mascot.palette": {
    fa: { why: "رنگ شخصیت یک تصمیم توکنی است، نه یک فایل PNG یک‌باره.", example: "از نقش‌های معنایی استفاده کنید. تا پیش از تأیید، هیچ hex اختصاصی تعریف نشود." },
    tr: { why: "Karakter rengi tek seferlik bir PNG değil, bir token kararıdır.", example: "Anlamsal rolleri kullanın. Onaya kadar özel hex yok." },
  },
  "brand.mascot.emotion_priority": {
    fa: { why: "کاتالوگ بلند فقط فهرست کارهای آینده است؛ اولویت تعیین می‌کند اولین شیت مدل چه باشد.", example: "joyful، curious، determined. بقیه در فهرست کارهای آینده می‌مانند." },
    tr: { why: "Uzun katalog bir bekleyen iş listesidir. İlk model paftasını öncelik belirler.", example: "joyful, curious, determined. Diğerleri bekleyen listede kalır." },
  },
  "brand.mascot.situation_map": {
    fa: { why: "حالت‌های رابط کاربری باید از صفحه‌های واقعی درخواست شوند، نه از یک پوستر عمومی.", example: "خالی، موفقیت و خطا. حالت بارگذاری می‌تواند فقط تایپوگرافیک بماند." },
    tr: { why: "Arayüz durumları genel bir posterden değil, gerçek ekranlardan istenmeli.", example: "Boş, başarı ve hata. Yükleniyor durumu tipografik kalabilir." },
  },
  "brand.mascot.intensity": {
    fa: { why: "فیلد emotion_intensity در کاتالوگ به یک مقیاس مشترک نیاز دارد.", example: "از کم، متوسط، زیاد استفاده کنید. امتیاز عددی اضافه نکنید." },
    tr: { why: "Katalogdaki emotion_intensity alanının ortak bir ölçeğe ihtiyacı var.", example: "Düşük, orta, yüksek kullanın. Sayısal puan eklemeyin." },
  },
  "brand.mascot.angles": {
    fa: { why: "درخواست هشت زاویه از روز اول، برندهایی را که فقط نمای روبه‌رو لازم دارند متوقف می‌کند.", example: "اول نمای روبه‌رو و سه‌رخ جلو-چپ. شش زاویهٔ دیگر تعریف‌شده می‌مانند ولی تولید نمی‌شوند." },
    tr: { why: "İlk günden sekiz açı istemek, yalnızca önden görünüme ihtiyacı olan markaları tıkar.", example: "Önce ön ve sol ön üç çeyrek. Diğer altısı tanımlı kalır ama üretilmez." },
  },
  "brand.mascot.mvp": {
    fa: { why: "کاتالوگ یک زیرمجموعهٔ MVP را علامت‌گذاری می‌کند تا تولید سراغ کشیدن هر 90 حالت نرود.", example: "از idهای MVP علامت‌خورده در brand/mascot/catalog.yaml استفاده کنید." },
    tr: { why: "Katalog bir MVP alt kümesini işaretler; böylece üretim 90 durumun hepsini çizmeye kalkışmaz.", example: "brand/mascot/catalog.yaml içindeki işaretli MVP id'lerini kullanın." },
  },
  "brand.mascot.stage_count": {
    fa: { why: "فایل نمونه شش مرحله دارد تا درستی ساختار داده نشان داده شود. تعداد مرحله‌ها را برند شما انتخاب می‌کند.", example: "1" },
    tr: { why: "Örnek dosyada şemanın çalıştığını göstermek için altı aşama var. Aşama sayısını markanız seçer.", example: "1" },
  },
  "brand.mascot.stage_story": {
    fa: { why: "تکامل بدون قواعد پیوستگی، شخصیت دیگری می‌سازد.", example: "در حالت تک‌مرحله‌ای کاربرد ندارد. فهرست تخم تا کاپیتان فقط یک پیکربندی نمونه است." },
    tr: { why: "Süreklilik kuralları olmayan bir evrim, farklı bir karakter ortaya çıkarır.", example: "Tek aşamada geçerli değil. Yumurtadan kaptana liste yalnızca örnek bir yapılandırmadır." },
  },
  "brand.mascot.continuity": {
    fa: { why: "قابل‌شناسایی بودن یک الزام برند است، نه یک عادت طراحی.", example: "تا وقتی شیت مدلی وجود ندارد، TBD." },
    tr: { why: "Tanınırlık bir çizim alışkanlığı değil, bir marka gereksinimidir.", example: "Bir model paftası olana kadar TBD." },
  },
  "brand.mascot.unlocks": {
    fa: { why: "مشخصات، ساختن اقتصاد بازی از خود را ممنوع می‌کند.", example: "فقط جای‌نگهدار. بدون مقدار XP." },
    tr: { why: "Şartname uydurma oyun ekonomisini yasaklar.", example: "Yalnızca yer tutucu. XP değeri yok." },
  },
  "brand.mascot.transition": {
    fa: { why: "حرکت و دسترس‌پذیری بخشی از تکامل‌اند، نه مرحلهٔ پرداخت بعدی.", example: "محوشدن متقاطع. در حالت حرکت کاهش‌یافته، تصویر ثابت جدید بلافاصله نمایش داده می‌شود." },
    tr: { why: "Hareket ve erişilebilirlik sonradan yapılacak bir rötuş değil, evrimin parçasıdır.", example: "Çapraz geçiş. Azaltılmış harekette yeni durağan görsel hemen gösterilir." },
  },
  "brand.illustration.shapes": {
    fa: { why: "بدون این، هر تأمین‌کننده سبک خودش را می‌سازد.", example: "هنوز مشخص نشده. هیچ سبکی تأیید نشده است." },
    tr: { why: "Bu olmadan her tedarikçi kendi stilini icat eder.", example: "Belirlenecek. Onaylı bir stil yok." },
  },
  "brand.illustration.light": {
    fa: { why: "ناهماهنگی نور باعث می‌شود یک مجموعه شبیه چند برند متفاوت به نظر برسد.", example: "هنوز مشخص نشده." },
    tr: { why: "Işık uyumsuzlukları bir seriyi birkaç farklı marka gibi gösterir.", example: "Belirlenecek." },
  },
  "brand.illustration.complexity": {
    fa: { why: "جاهای کوچک در رابط کاربری نمی‌توانند ترکیب‌بندی یک پوستر را دوباره به کار ببرند.", example: "ناشناخته. بعداً برای هر قالب تصمیم گرفته می‌شود." },
    tr: { why: "Küçük arayüz alanları bir posterin kompozisyonunu yeniden kullanamaz.", example: "Bilinmiyor. Daha sonra her şablon için ayrı karar verilecek." },
  },
  "brand.illustration.character": {
    fa: { why: "این دروازه کمک می‌کند برندهای بدون کاراکتر، بدون کاراکتر بمانند.", example: "فقط اگر ماژول ماسکات فعال باشد و شناسهٔ آن وضعیت وجود داشته باشد." },
    tr: { why: "Bu kapı, karaktersiz markaların karaktersiz kalmasını sağlar.", example: "Yalnızca maskot modülü etkinse ve durum kimliği mevcutsa." },
  },
  "brand.illustration.unacceptable": {
    fa: { why: "فهرست «نکن‌ها» بخشی از هدایت هنری است.", example: "نه تصویر استوک بدون مجوز، نه صحنهٔ خشن، نه رابط ساختگی از قابلیت‌هایی که هنوز عرضه نشده‌اند." },
    tr: { why: "Yapılmayacaklar listesi sanat yönetiminin bir parçasıdır.", example: "Lisanssız stok görsel yok, kanlı sahne yok, henüz yayımlanmamış özelliklerin sahte arayüzü yok." },
  },
  "brand.icons.grid": {
    fa: { why: "گرید همان چیزی است که یک مجموعهٔ آیکون را از پوشه‌ای پر از SVG جدا می‌کند.", example: "هنوز مشخص نشده. تا وقتی گریدی انتخاب نکرده‌اید، وانمود نکنید گرید 24px دارید." },
    tr: { why: "Bir set ile bir klasör dolusu SVG arasındaki fark ızgaradır.", example: "Belirlenecek. Bir ızgara seçene kadar 24px ızgara varmış gibi davranmayın." },
  },
  "brand.icons.stroke": {
    fa: { why: "ضخامت خط سریع‌تر از رنگ از مسیر خارج می‌شود.", example: "تصمیم گرفته نشده." },
    tr: { why: "Çizgi kalınlığı renkten daha hızlı kayar.", example: "Karar verilmedi." },
  },
  "brand.icons.metaphor": {
    fa: { why: "استعاره‌های فرهنگی و مرتبط با ماسکات به یک منبع صریح نیاز دارند.", example: "فقط اشیای معمولی، تا وقتی فهرست استعاره‌ها تأیید شود." },
    tr: { why: "Kültürel ve maskot metaforları açık bir kaynağa ihtiyaç duyar.", example: "Bir metafor listesi onaylanana kadar yalnızca sıradan nesneler." },
  },
  "brand.icons.badges": {
    fa: { why: "طرح‌های گیمیفیکیشن نباید به آیکون‌های کاربردی نشت کنند.", example: "نشان‌ها اختیاری‌اند و تا وقتی قواعد گیمیفیکیشن وجود نداشته باشد، خالی می‌مانند." },
    tr: { why: "Oyunlaştırma görselleri işlevsel ikonlara sızmamalıdır.", example: "Rozetler isteğe bağlıdır ve oyunlaştırma kuralları oluşana kadar boş kalır." },
  },
  "brand.icons.naming": {
    fa: { why: "مانیفست دارایی‌ها بر پایهٔ شناسه‌های پایدار کار می‌کند.", example: "icon.<group>.<name>، منبع SVG، تا درخواست نشده PNG نه." },
    tr: { why: "Varlık manifestosu kararlı kimliklere dayanır.", example: "icon.<group>.<name>, SVG kaynak, istenmedikçe PNG yok." },
  },
  "brand.layout.grid": {
    fa: { why: "یک گرید به‌ندرت هم برای استوری، هم رابط کاربری و هم پوستر جواب می‌دهد.", example: "گرید محصول هنوز مشخص نشده. گرید چاپی نداریم." },
    tr: { why: "Tek bir ızgara nadiren hem bir hikâyeye, hem bir arayüze hem de bir postere uyar.", example: "Ürün ızgarası belirlenecek. Baskı ızgarası yok." },
  },
  "brand.layout.density": {
    fa: { why: "تراکم روی اندازهٔ حروف، استفاده از ماسکات و وضعیت‌های خالی اثر می‌گذارد.", example: "Comfortable. Exact density TBD." },
    tr: { why: "Yoğunluk yazı boyutunu, maskot kullanımını ve boş durumları değiştirir.", example: "Comfortable. Exact density TBD." },
  },
  "brand.layout.breakpoints": {
    fa: { why: "قواعد واکنش‌گرا بدون فهرست دستگاه‌ها فقط شعارند.", example: "موبایل و وب دسکتاپ. بقیه ناشناخته." },
    tr: { why: "Cihaz listesi olmayan duyarlı tasarım kuralları sadece slogandır.", example: "Telefon ve masaüstü web. Diğerleri bilinmiyor." },
  },
  "brand.layout.hierarchy": {
    fa: { why: "قالب‌های کمپین و رابط کاربری این قاعده را مشترک دارند.", example: "یک پیام اصلی، یک اقدام اصلی، و بقیه کم‌رنگ‌تر." },
    tr: { why: "Kampanya şablonları ve arayüz bu kuralı paylaşır.", example: "Tek ana mesaj, tek ana eylem, geri kalan her şey daha geri planda." },
  },
  "brand.layout.mascot_zone": {
    fa: { why: "صفحه‌آرایی معمولاً جایی است که ماسکات با متن برخورد می‌کند.", example: "اگر ماسکات غیرفعال باشد موضوعیت ندارد. در غیر این صورت هنوز مشخص نشده." },
    tr: { why: "Maskotlar en çok yerleşimde metinle çakışır.", example: "Maskot devre dışıysa geçerli değil. Aksi hâlde belirlenecek." },
  },
  "brand.ui.platforms": {
    fa: { why: "نباید به‌طور ضمنی هم کیت وب و هم کیت نیتیو را با هم وعده داد.", example: "تصمیم گرفته نشده. سایت مستندات فقط از توکن‌های EXAMPLE استفاده می‌کند." },
    tr: { why: "Bir web kiti ile bir yerel (native) kit aynı anda ima edilmemelidir.", example: "Karar verilmedi. Doküman sitesi yalnızca EXAMPLE token'larını kullanıyor." },
  },
  "brand.ui.components": {
    fa: { why: "فهرست کامپوننت‌ها باید با اولویت واقعی هماهنگ باشد، نه با هر ویجت ممکن.", example: "دکمه، فیلد متنی، پنجرهٔ گفتگو. بقیه بعداً." },
    tr: { why: "Bileşen dizini her olası widget'ı değil, gerçek bir önceliği yansıtmalıdır.", example: "Düğme, metin alanı, iletişim kutusu. Diğerleri sonra." },
  },
  "brand.ui.states": {
    fa: { why: "نبودِ وضعیت فوکوس یا بارگذاری، هم در دسترس‌پذیری و هم در کنترل کیفیت برند رد می‌شود.", example: "پیش‌فرض، hover، focus-visible، فعال، غیرفعال، در حال بارگذاری، خطا." },
    tr: { why: "Eksik odak veya yükleme durumları hem erişilebilirlikte hem de marka kalite kontrolünde başarısız olur.", example: "Varsayılan, hover, focus-visible, etkin, devre dışı, yükleniyor, hata." },
  },
  "brand.ui.onboarding": {
    fa: { why: "درخواست‌های ماسکات و حرکت باید به یک الگوی واقعی وصل باشند.", example: "هیچ الگویی طراحی نشده. متن وضعیت خالی هنوز مشخص نشده." },
    tr: { why: "Maskot ve hareket talepleri gerçek bir kalıba bağlanmalıdır.", example: "Tasarlanmış bir kalıp yok. Boş durum metni belirlenecek." },
  },
  "brand.ui.a11y": {
    fa: { why: "هدف دسترس‌پذیری محصول اینجا عینی و مشخص می‌شود.", example: "فوکوس قابل‌مشاهده، هدف حداقل 24px برای ناحیهٔ لمس، هیچ اطلاعاتی فقط با رنگ منتقل نشود. هنوز ممیزی نشده." },
    tr: { why: "Ürünün erişilebilirlik niyeti burada somutlaşır.", example: "Görünür odak, en az 24px dokunma hedefi, hiçbir bilgi yalnızca renkle verilmez. Henüz denetlenmedi." },
  },
  "brand.ui.handoff": {
    fa: { why: "وقتی نام‌ها از هم فاصله بگیرند، نگاشت فیگما به کد شکست می‌خورد.", example: "از شناسه‌های brand/content/12-product-ui-system/components.yaml استفاده کنید. فایل فیگما تنظیم نشده است." },
    tr: { why: "Adlar birbirinden saptığında Figma'dan koda eşleme başarısız olur.", example: "brand/content/12-product-ui-system/components.yaml içindeki kimlikleri kullanın. Figma dosyası ayarlanmadı." },
  },
  "brand.motion.principles": {
    fa: { why: "منحنی‌های easing بدون اصول، در لحظهٔ نادرست کپی می‌شوند.", example: "سریع و بی‌سروصدا. هرگز کاربر را با لرزاندن شرمنده نکنید. فقط یک نمونه است." },
    tr: { why: "İlkeleri olmayan easing eğrileri yanlış anlara kopyalanır.", example: "Hızlı ve sessiz. Kullanıcıyı asla bir sallama efektiyle utandırmayın. Yalnızca örnektir." },
  },
  "brand.motion.duration": {
    fa: { why: "مصاحبه نیت را ثبت می‌کند. اعداد در فایل توکن نگه داشته می‌شوند.", example: "Quick. Token values remain EXAMPLE until approved." },
    tr: { why: "Görüşme niyeti kaydeder. Sayılar token dosyasında tutulur.", example: "Quick. Token values remain EXAMPLE until approved." },
  },
  "brand.motion.reduced": {
    fa: { why: "دسترس‌پذیری بخشی از سیستم حرکت است، نه یک پانویس.", example: "محو تدریجی یا تغییر فوری وضعیت. بدون پارالاکس." },
    tr: { why: "Erişilebilirlik bir dipnot değil, hareket sisteminin bir parçasıdır.", example: "Çapraz geçiş veya anında durum değişikliği. Paralaks yok." },
  },
  "brand.motion.logo": {
    fa: { why: "هویت حرکتی می‌تواند بدون انیمیشن کوتاه لوگو هم وجود داشته باشد.", example: "none" },
    tr: { why: "Bir hareket kimliği, logo animasyonu olmadan da var olabilir.", example: "none" },
  },
  "brand.motion.formats": {
    fa: { why: "Lottie، Rive، CSS، SVG و ویدئو مسیرهای بازبینی متفاوتی دارند.", example: "فقط CSS و SVG تا وقتی کاراکتری وجود داشته باشد." },
    tr: { why: "Lottie, Rive, CSS, SVG ve video farklı inceleme süreçlerinden geçer.", example: "Bir karakter oluşana kadar yalnızca CSS ve SVG." },
  },
  "brand.sonic.needed": {
    fa: { why: "«نه» هم یک هویت صوتی کامل است.", example: "no" },
    tr: { why: "«Hayır» da eksiksiz bir ses kimliğidir.", example: "no" },
  },
  "brand.sonic.logo": {
    fa: { why: "توصیف یک صدا، ضبط مستر آن نیست.", example: "none" },
    tr: { why: "Bir tanım, ana kayıt yerine geçmez.", example: "none" },
  },
  "brand.sonic.cues": {
    fa: { why: "صدای موفقیت برای هر کلیک، خودش به مشکل برند تبدیل می‌شود.", example: "به‌طور پیش‌فرض بی‌صدا." },
    tr: { why: "Her tıklamada çalan başarı sesleri bir marka sorununa dönüşür.", example: "Varsayılan olarak sessiz." },
  },
  "brand.sonic.rights": {
    fa: { why: "برندینگ صوتی به همان اندازه که مسئلهٔ خلاقیت است، مسئلهٔ مجوز هم هست.", example: "هیچ صدایی بدون مجوز کتبی یا ضبط اصلی‌ای که مالکیتش با مالک برند است منتشر نمی‌شود." },
    tr: { why: "Ses markalaması yaratıcı olduğu kadar bir lisans meselesidir.", example: "Yazılı bir lisans ya da sahibine ait özgün bir kayıt olmadan hiçbir ses yayımlanmaz." },
  },
  "brand.sonic.fallback": {
    fa: { why: "هم دسترس‌پذیری و هم سیاست پخش خودکار، مسیری بی‌صدا را لازم می‌کنند.", example: "فقط زیرنویس یا وضعیت دیداری. هیچ اطلاعاتی نباید فقط در صدا وجود داشته باشد." },
    tr: { why: "Hem erişilebilirlik hem de otomatik oynatma politikaları sessiz bir yol gerektirir.", example: "Yalnızca altyazı veya görsel durum. Yalnızca seste bulunan bir bilgi olmamalı." },
  },
  "brand.photo.direction": {
    fa: { why: "حال‌وهوایی که قاعده نداشته باشد، به پوشه‌ای تصادفی از عکس‌های استوک تبدیل می‌شود.", example: "تصمیم گرفته نشده. عکاسی‌ای برنامه‌ریزی نشده است." },
    tr: { why: "Kuralı olmayan bir atmosfer rastgele bir stok fotoğraf klasörüne dönüşür.", example: "Karar verilmedi. Planlanmış bir çekim yok." },
  },
  "brand.photo.lighting": {
    fa: { why: "محدودیت‌ها جلوی سبکی را می‌گیرند که تیم نمی‌تواند تکرارش کند.", example: "هنوز مشخص نشده" },
    tr: { why: "Kısıtlar, ekibin tekrarlayamayacağı bir stili önler.", example: "Belirlenecek" },
  },
  "brand.photo.grade": {
    fa: { why: "اصلاح رنگی که با پالت رابط کاربری درگیر شود، سیستم را می‌شکند.", example: "هیچ اصلاح رنگی تأیید نشده. آبیِ EXAMPLE رابط کاربری را به‌عنوان LUT به کار نبرید." },
    tr: { why: "Arayüz paletiyle çatışan bir renk düzenlemesi sistemi bozar.", example: "Onaylı bir renk düzenlemesi yok. EXAMPLE arayüz mavisini LUT olarak uygulamayın." },
  },
  "brand.photo.compositing": {
    fa: { why: "ترکیب تصویر (کامپوزیت) مسئلهٔ حقوق و پیوستگی است.", example: "نه، تا وقتی هم فوتیج و هم کاراکتر تأیید شوند." },
    tr: { why: "Kompozit, bir haklar ve süreklilik meselesidir.", example: "Hayır, hem görüntü hem de karakter onaylanana kadar." },
  },
  "brand.photo.subtitles": {
    fa: { why: "ویدئوی شبکه‌های اجتماعی و ویدئوی محصول این پیش‌تنظیم‌ها را مشترک دارند.", example: "برای گفتار، زیرنویس الزامی است. نواحی امن هنوز مشخص نشده." },
    tr: { why: "Sosyal medya ve ürün videoları bu ön ayarları paylaşır.", example: "Konuşmalar için altyazı zorunlu. Güvenli alanlar belirlenecek." },
  },
  "brand.social.channels": {
    fa: { why: "تولید قالب از برنامه پیروی می‌کند، نه از چک‌لیست پلتفرم‌ها.", example: "هنوز هیچ." },
    tr: { why: "Şablon üretimi bir platform kontrol listesini değil, planı izler.", example: "Henüz yok." },
  },
  "brand.social.safe": {
    fa: { why: "عناصر رابط پلتفرم‌های اجتماعی، قالب‌های بی‌دقت را برش می‌دهند.", example: "هنوز مشخص نشده" },
    tr: { why: "Sosyal platformlardaki arayüz öğeleri özensiz şablonları kırpar.", example: "Belirlenecek" },
  },
  "brand.social.cta": {
    fa: { why: "دعوت به اقدام جایی است که قابلیت‌های عرضه‌نشده و فوریت ساختگی سر بر می‌آورند.", example: "بدون فوریت و بدون «اکنون در دسترس» تا وقتی ادعاها اجازه دهند." },
    tr: { why: "Eylem çağrıları, yayımlanmamış özelliklerin ve sahte aciliyetin ortaya çıktığı yerdir.", example: "İddialar izin verene kadar aciliyet yok ve “şimdi kullanılabilir” yok." },
  },
  "brand.social.templates": {
    fa: { why: "پوشهٔ قالب‌ها نباید 30 فایل خالی داشته باشد که به‌عنوان یک سیستم معرفی شوند.", example: "هیچ، تا وقتی کانالی انتخاب شود." },
    tr: { why: "Şablon klasörü, bir sistem gibi sunulan 30 boş dosya içermemelidir.", example: "Bir kanal seçilene kadar yok." },
  },
  "brand.social.localization": {
    fa: { why: "شبکه‌های اجتماعی سریع‌ترین راه برای انتشار یک ترجمهٔ تأییدنشده‌اند.", example: "فقط یک زبان تأییدشده." },
    tr: { why: "Sosyal medya, onaylanmamış bir çeviriyi yayımlamanın en hızlı yoludur.", example: "Yalnızca onaylı tek bir dil." },
  },
  "brand.social.exports": {
    fa: { why: "ابعادِ کپی‌شدهٔ پلتفرم‌ها کهنه می‌شوند. تاریخ بررسی را ثبت کنید.", example: "هیچ‌کدام بررسی نشده." },
    tr: { why: "Kopyalanan platform boyutları eskir. Kontrol ettiğiniz tarihi kaydedin.", example: "Hiçbiri kontrol edilmedi." },
  },
  "brand.campaign.owner": {
    fa: { why: "بریف‌های بدون مالک به تأییدهای ناخواسته تبدیل می‌شوند.", example: "بنیان‌گذار، تا وقتی یک مسئول بازاریابی وجود داشته باشد." },
    tr: { why: "Sahibi olmayan brifler kazara verilmiş onaylara dönüşür.", example: "Bir pazarlama sorumlusu olana kadar kurucu." },
  },
  "brand.campaign.naming": {
    fa: { why: "تحلیل‌ها و پوشه‌های دارایی از همین نام استفاده می‌کنند.", example: "هنوز مشخص نشده. از final_v7 استفاده نکنید." },
    tr: { why: "Analitik ve varlık klasörleri bu adı paylaşır.", example: "Belirlenecek. final_v7 kullanmayın." },
  },
  "brand.campaign.offer_source": {
    fa: { why: "این همان پیوندی است که فروش و محصول را به کار خلاقانه وصل می‌کند.", example: "business.sales.pricing و business.product.public_status. هرگز یک اسلاید." },
    tr: { why: "Bu, satış ve üründen yaratıcı işe uzanan etki bağlantısıdır.", example: "business.sales.pricing ve business.product.public_status. Asla bir slayt değil." },
  },
  "brand.campaign.cobrand": {
    fa: { why: "برند مشترک یک تصمیم حقوقی و اعتباری است.", example: "یک رکورد شریک با نام مشخص و مجوز کتبی. هنوز هیچ‌کدام وجود ندارد." },
    tr: { why: "Ortak markalama bir haklar ve itibar kararıdır.", example: "Adı belirtilmiş bir ortak kaydı ve yazılı izin. Henüz hiçbiri yok." },
  },
  "brand.campaign.seasonal": {
    fa: { why: "نسخه‌های فصلی ماسکات نباید مناسبت ساختگی بسازند.", example: "تا وقتی بازاری انتخاب نشده، خارج از دامنه است." },
    tr: { why: "Maskotun mevsimsel varyantları bayram icat etmemelidir.", example: "Bir pazar seçilene kadar kapsam dışı." },
  },
  "brand.print.scope": {
    fa: { why: "قواعد چاپی خالی نباید شبیه دفترچهٔ تولید به نظر برسند.", example: "هیچ." },
    tr: { why: "Boş baskı kuralları bir üretim kılavuzu gibi görünmemelidir.", example: "Yok." },
  },
  "brand.print.color": {
    fa: { why: "این بخش از راهبرد چاپی ماژول رنگ استفاده می‌کند.", example: "موضوعیت ندارد. هیچ مقدار Pantone ساختگی‌ای ساخته نشده است." },
    tr: { why: "Bu bölüm, renk modülünün baskı stratejisini kullanır.", example: "Geçerli değil. Uydurma Pantone değeri yok." },
  },
  "brand.print.bleed": {
    fa: { why: "میلی‌مترهای کلی و عمومی به نقص چاپ تبدیل می‌شوند.", example: "هنوز مشخص نشده" },
    tr: { why: "Genel geçer milimetre değerleri baskı hatasına dönüşür.", example: "Belirlenecek" },
  },
  "brand.print.merch": {
    fa: { why: "کالاهای فیزیکی از عمر یک کمپین بیشتر دوام می‌آورند و به مسیر مجوز نیاز دارند.", example: "بدون کالای تبلیغاتی." },
    tr: { why: "Fiziksel ürünler bir kampanyadan daha uzun yaşar ve bir lisans yoluna ihtiyaç duyar.", example: "Promosyon ürünü yok." },
  },
  "brand.print.vendor": {
    fa: { why: "یادداشت‌های تولید مفیدند. قیمت‌ها و حساب‌ها جای دیگری با دسترسی محدود نگه داشته می‌شوند.", example: "هنوز چیزی نیست." },
    tr: { why: "Üretim notları faydalıdır. Fiyatlar ve hesaplar başka bir yerde kısıtlı tutulur.", example: "Henüz bir şey yok." },
  },
  "brand.applications.surfaces": {
    fa: { why: "گالری‌ای از همهٔ کانال‌ها، پیاده‌سازی مرجع نیست.", example: "هیچ. خود پورتال فقط پوستهٔ یک قالب است." },
    tr: { why: "Her kanalın yer aldığı bir galeri, bir referans uygulama değildir.", example: "Yok. Portalın kendisi yalnızca bir şablon kabuğudur." },
  },
  "brand.applications.launch": {
    fa: { why: "مشخصات، نمونهٔ چندکاناله را فقط وقتی می‌خواهد که دارایی‌های منبع وجود داشته باشند.", example: "no" },
    tr: { why: "Spesifikasyon, kanallar arası bir örneği yalnızca kaynak varlıklar mevcutsa ister.", example: "no" },
  },
  "brand.applications.consistency": {
    fa: { why: "کاربردها جایی‌اند که تناقض‌ها علنی می‌شوند.", example: "قیمت، وضعیت یک قابلیت یا نامی که با رکورد مرجع یکی نیست." },
    tr: { why: "Uygulamalar, çelişkilerin kamuya açık hâle geldiği yerdir.", example: "Kanonik kayıtla uyuşmayan bir fiyat, özellik durumu veya ad." },
  },
  "brand.applications.reviewer": {
    fa: { why: "نمونه‌ها جایی‌اند که قیمت یا قابلیت تأییدنشده راحت‌تر از همه بیرون می‌زند.", example: "تأییدکنندهٔ برند. هنوز هیچ نمونهٔ بیرونی‌ای تأیید نشده است." },
    tr: { why: "Onaylanmamış bir fiyat ya da özellik en kolay örneklerden sızar.", example: "Marka onaylayıcısı. Henüz onaylanmış harici bir örnek yok." },
  },
  "brand.applications.edges": {
    fa: { why: "ماکاپ‌های مسیر ایده‌آل، قواعدی را که مردم به آن نیاز دارند پنهان می‌کنند.", example: "بدون لوگو، بدون ماسکات، و با حرکت کاهش‌یافته." },
    tr: { why: "Yalnızca ideal senaryoyu gösteren maketler insanların ihtiyaç duyduğu kuralları gizler.", example: "Logo yok, maskot yok ve azaltılmış hareket." },
  },
  "brand.gov.approver": {
    fa: { why: "فرمان تأیید، همین فرد را ثبت می‌کند. وجود یک دپارتمان را فرض نمی‌گیرد.", example: "بنیان‌گذار، که به‌عنوان مالک ثبت شده است." },
    tr: { why: "Onay komutu bu kişiyi kaydeder. Bir departman varsaymaz.", example: "Sahip olarak kaydedilen kurucu." },
  },
  "brand.gov.versioning": {
    fa: { why: "دارایی‌ها و مستندات به روایت نسخه‌گذاری مشترکی نیاز دارند.", example: "Semver برای سیستم. 0.1.0 همین قالب است. تأییدهای برند از 0.1.0 پیش‌نویس شروع می‌شوند." },
    tr: { why: "Varlıklar ve belgeler ortak bir sürüm hikâyesine ihtiyaç duyar.", example: "Sistem için Semver. 0.1.0 bu şablondur. Marka onayları 0.1.0 taslak ile başlar." },
  },
  "brand.gov.deprecation": {
    fa: { why: "دفتر ثبت فقط افزودنی است. منسوخ‌کردن یک رکورد جدید است.", example: "آن را منسوخ علامت بزنید، به شناسهٔ جایگزین ارجاع دهید و فایل را نگه دارید." },
    tr: { why: "Kayıt defteri yalnızca eklemeye açıktır. Kullanımdan kaldırma yeni bir kayıttır.", example: "Kullanımdan kaldırıldı olarak işaretleyin, yerine geçen kimliği gösterin, dosyayı saklayın." },
  },
  "brand.gov.license": {
    fa: { why: "کد قالب MIT است. محتوای برند شما به‌طور خودکار MIT نیست.", example: "تصمیم گرفته نشده. تا وقتی مجوزی انتخاب شود، همهٔ فایل‌های برند را با همهٔ حقوق محفوظ برای مالک در نظر بگیرید." },
    tr: { why: "Şablon kodu MIT lisanslıdır. Marka içeriğiniz kendiliğinden MIT olmaz.", example: "Karar verilmedi. Bir lisans seçilene kadar tüm marka dosyalarını, tüm hakları sahibine ait olarak kabul edin." },
  },
  "brand.gov.ai": {
    fa: { why: "ثبت منشأ نمی‌گذارد یک پیشنهاد با واقعیتی که مالک اعلام کرده اشتباه گرفته شود.", example: "source_type agent_suggestion، status draft، هرگز به‌طور خودکار تأیید نمی‌شود." },
    tr: { why: "Köken bilgisi, bir önerinin sahibin beyan ettiği bir olguyla karıştırılmasını önler.", example: "source_type agent_suggestion, status draft, asla otomatik olarak onaylanmaz." },
  },
  "brand.gov.cadence": {
    fa: { why: "کتابخانه‌ای که تاریخ بازبینی ندارد، به بایگانی تأییدهای کهنه تبدیل می‌شود.", example: "هر وقت پیشنهاد تغییر کند، و پس از اولین تأیید دست‌کم سالی یک بار." },
    tr: { why: "İnceleme tarihi olmayan bir kütüphane, eskimiş onayların arşivine dönüşür.", example: "Teklif değiştiğinde ve bir şey onaylandıktan sonra en az yılda bir kez." },
  },
  "brand.gamification.enabled": {
    fa: { why: "خاموش کردن این گزینه ماژول را پنهان می‌کند و بقیهٔ پرسش‌ها را رد می‌کند.", example: "no" },
    tr: { why: "Bunu kapatmak modülü gizler ve kalan soruları atlar.", example: "no" },
  },
  "brand.gamification.model": {
    fa: { why: "طراحی بصری می‌تواند پیش از وجود اقتصاد بازی شروع شود، به شرطی که آن اقتصاد را از خود نسازد.", example: "فقط یک نشانگر پیشرفت. بدون امتیاز." },
    tr: { why: "Görsel tasarım, ekonomiyi uydurmadığı sürece ekonomi var olmadan başlayabilir.", example: "Yalnızca bir ilerleme göstergesi. Puan yok." },
  },
  "brand.gamification.streaks": {
    fa: { why: "رابط‌های زنجیره به‌راحتی تنبیهی می‌شوند. برند می‌تواند بدون تعریف مکانیک، این را ممنوع کند.", example: "تا وقتی محصول زنجیره‌ای تعریف نکرده، زنجیره‌ای در کار نیست. بدون متن شرمنده‌کننده." },
    tr: { why: "Seri arayüzleri kolayca cezalandırıcı hâle gelir. Marka, mekaniği tanımlamadan bunu yasaklayabilir.", example: "Ürün tanımlayana kadar seri yok. Utandırıcı metin yok." },
  },
  "brand.gamification.ethics": {
    fa: { why: "مشخصات، محدودیت‌های ضددستکاری را الزامی می‌کند، نه یک خیال‌پردازی امتیازی.", example: "بدون کمیابی ساختگی، بدون احتمال‌های پنهان، بدون تنبیه برای استراحت." },
    tr: { why: "Şartname bir puan fantezisi değil, manipülasyon karşıtı kısıtlar ister.", example: "Sahte kıtlık yok, gizli olasılık yok, dinlenmeye ceza yok." },
  },
  "brand.gamification.failure": {
    fa: { why: "شکست یک لحظهٔ برند است و به قواعد مسکات و لحن مربوط می‌شود.", example: "خنثی و مشخص. یک گام بعدی پیشنهاد دهید. بدون صدای بوق خطا." },
    tr: { why: "Başarısızlık bir marka anıdır. Maskot ve ses kurallarına bağlanır.", example: "Tarafsız ve net. Bir sonraki adımı önerin. Hata zili yok." },
  },
  "brand.gamification.mascot_link": {
    fa: { why: "تغییر مرحله در اختیار ماژول مسکات است؛ این فیلد فقط آن‌ها را به هم پیوند می‌دهد.", example: "no" },
    tr: { why: "Aşama değişiklikleri maskot modülüne aittir. Bu alan yalnızca bağlantı kurar.", example: "no" },
  },
  "business.identity.new_or_existing": {
    fa: { why: "کسب‌وکارهای موجود باید شواهد را وارد کنند، نه اینکه تاریخچه را از نو بنویسند. از کسب‌وکارهای تازه نباید معیارهای تاریخی خواست.", example: "existing" },
    tr: { why: "Mevcut işletmeler geçmişi yeniden yazmak yerine kanıtlarını içe aktarmalıdır. Yeni girişimlerden geçmişe ait metrikler istenmemelidir.", example: "existing" },
  },
  "business.identity.trade_name": {
    fa: { why: "نام تجاری، نام رسمی و عمومی برند است. لوگو، دامنه و متن‌ها همه به آن ارجاع می‌دهند.", example: "Northwind Language Club" },
    tr: { why: "Ticari ad, markanın esas kamuya açık adıdır. Logo, alan adı ve metinlerin tamamı buna dayanır.", example: "Northwind Language Club" },
  },
  "business.identity.legal_name": {
    fa: { why: "قراردادها و فاکتورها از نام حقوقی استفاده می‌کنند. این نام ممکن است با نام تجاری متفاوت باشد.", example: "Northwind Studio LLC" },
    tr: { why: "Sözleşmeler ve faturalarda yasal unvan kullanılır. Bu unvan ticari addan farklı olabilir.", example: "Northwind Studio LLC" },
  },
  "business.identity.sector": {
    fa: { why: "پرسش‌های بعدی با حوزهٔ فعالیت تطبیق پیدا می‌کنند. مصاحبهٔ آموزش، SaaS، آژانس و سازمان غیرانتفاعی یکسان نیست.", example: "education" },
    tr: { why: "Sonraki sorular sektöre göre uyarlanır. Eğitim, SaaS, ajans ve kâr amacı gütmeyen kuruluş görüşmeleri aynı değildir.", example: "education" },
  },
  "business.offer.summary": {
    fa: { why: "بازاریابی، محصول و فروش همگی از همین سابقهٔ پیشنهاد استفاده می‌کنند.", example: "یک اپلیکیشن تمرین موبایلی برای کسانی که مکالمهٔ روزمره یاد می‌گیرند." },
    tr: { why: "Pazarlama, ürün ve satış ekiplerinin tümü bu teklif kaydını kullanır.", example: "Günlük konuşma öğrenenler için bir mobil pratik uygulaması." },
  },
  "business.stage.current": {
    fa: { why: "شرکت‌های در مرحلهٔ ایده و شرکت‌های جاافتاده نباید با یک معیار شواهد سنجیده شوند.", example: "pre-revenue" },
    tr: { why: "Fikir aşamasındaki şirketler ile yerleşik şirketler aynı kanıt çıtasına zorlanmamalıdır.", example: "pre-revenue" },
  },
  "business.market.geography": {
    fa: { why: "انطباق با مقررات، زبان، قیمت‌گذاری و پشتیبانی همگی به جغرافیا بستگی دارند.", example: "ابتدا ترکیه و آلمان؛ بازارهای دیگر هنوز مشخص نیستند." },
    tr: { why: "Mevzuata uyum, dil, fiyatlandırma ve destek tamamen coğrafyaya bağlıdır.", example: "Önce Türkiye ve Almanya; diğer pazarlar henüz belirlenmedi." },
  },
  "business.customer.primary_segment": {
    fa: { why: "جایگاه‌یابی، الزامات محصول، بازاریابی و پیام‌های برند به این پاسخ وابسته‌اند.", example: "زبان‌آموزان مستقل 18 تا 35 ساله" },
    tr: { why: "Konumlandırma, ürün gereksinimleri, pazarlama ve marka mesajları buna bağlıdır.", example: "18–35 yaş arası bağımsız dil öğrenenler" },
  },
  "business.offer.value_proposition": {
    fa: { why: "جایگاه‌یابی تأییدشده فقط در یک جا نگهداری می‌شود. تبلیغات و فروش فقط می‌توانند همین عبارت یا نسخهٔ تأییدشدهٔ دیگری از آن را تکرار کنند.", example: "تمرین کوتاه و روزانهٔ مکالمه، بدون برنامهٔ زمانی کلاس." },
    tr: { why: "Onaylı konumlandırma tek bir yerde tutulur. Reklamlar ve satış yalnızca bu ifadeyi veya onaylı bir varyantını tekrarlayabilir.", example: "Sınıf programına bağlı kalmadan kısa, günlük konuşma pratiği." },
  },
  "business.problem.pains": {
    fa: { why: "برنامه‌ای که حدس را پژوهش فرض کند، برند و نقشهٔ راه را به بیراهه می‌برد.", example: "فقط فرضیه: زبان‌آموزان اپلیکیشن‌هایی را که حس کتاب دستور زبان می‌دهند رها می‌کنند." },
    tr: { why: "Bir tahmini araştırma gibi ele alan plan, markayı ve yol haritasını yanlış yönlendirir.", example: "Yalnızca hipotez: Öğrenenler dilbilgisi kitabı gibi hissettiren uygulamaları bırakıyor." },
  },
  "business.model.revenue": {
    fa: { why: "قیمت‌گذاری، امور مالی و شیوه‌های فروش به این انتخاب وابسته‌اند.", example: "بین اشتراک و دورهٔ گروهی پولی هنوز تصمیم گرفته نشده است." },
    tr: { why: "Fiyatlandırma, finans ve satış yaklaşımları bu seçime bağlıdır.", example: "Abonelik ile ücretli grup programı arasında henüz karar verilmedi." },
  },
  "business.model.defensibility": {
    fa: { why: "روایت‌های سرمایه‌گذاری و راهبردی نباید یک امید را به مزیت رقابتی پایدار ارتقا دهند.", example: "نامشخص. شبکهٔ توزیع هنوز مزیت رقابتی پایدار نیست." },
    tr: { why: "Yatırımcı ve strateji anlatıları bir umudu rekabet avantajına dönüştürmemelidir.", example: "Bilinmiyor. Dağıtım henüz bir rekabet avantajı değil." },
  },
  "business.plan.milestone": {
    fa: { why: "اهداف، استخدام و رونمایی‌های برند باید به یک نقطهٔ عطف واقعی اشاره کنند.", example: "یک نسخهٔ بتای خصوصی با 20 زبان‌آموز که یک هفته را کامل کنند." },
    tr: { why: "Hedefler, işe alımlar ve marka lansmanları gerçek bir kilometre taşına dayanmalıdır.", example: "Bir haftayı tamamlayan 20 öğrenenle kapalı beta." },
  },
  "business.plan.risks": {
    fa: { why: "فهرست ریسک‌ها از ریسک‌هایی شروع می‌شود که مالک می‌شناسد، نه از یک فهرست کلی.", example: "رد شدن در فروشگاه اپلیکیشن و مبهم بودن مقررات آموزشی." },
    tr: { why: "Risk kaydı genel bir listeden değil, sahibin fark ettiği risklerden başlar.", example: "Uygulama mağazası reddi ve belirsiz eğitim mevzuatı." },
  },
  "business.model.segments": {
    fa: { why: "بوم مدل کسب‌وکار، هدف‌گیری و پیشنهادها به هر بخش مشتری به‌عنوان یک مورد جداگانه نیاز دارند، نه یک پاراگراف.", example: "کافه‌های مستقل | تأمین هفتگی و قابل‌اعتماد می‌خواهند | primary" },
    tr: { why: "İş Modeli Kanvası, hedefleme ve teklifler her segmente tek bir paragraf olarak değil, ayrı bir öğe olarak ihtiyaç duyar.", example: "Bağımsız kafeler | güvenilir haftalık tedarik istiyor | primary" },
  },
  "business.model.key_activities": {
    fa: { why: "عملیات، استخدام و هزینه‌ها از کارهایی ناشی می‌شوند که کسب‌وکار باید هر هفته به‌خوبی انجام دهد.", example: "برشته‌کاری هفتگی | دسته‌های کوچک، با کنترل کیفیت | production | links: seg-1" },
    tr: { why: "Operasyon, işe alım ve maliyetler, işletmenin her hafta iyi yapması gereken işlerden doğar.", example: "Haftalık kavurma | küçük partiler, kalite kontrollü | production | links: seg-1" },
  },
  "business.model.key_resources": {
    fa: { why: "منبعی که پیشنهاد به آن وابسته است، ریسکی است که باید محافظت شود و هزینه‌ای است که باید برنامه‌ریزی شود.", example: "تجهیزات برشته‌کاری | ملکی، یک دستگاه | physical | links: act-1" },
    tr: { why: "Teklifin bağlı olduğu bir kaynak, korunması gereken bir risk ve planlanması gereken bir maliyettir.", example: "Kavurma ekipmanı | kendi mülkü, tek makine | physical | links: act-1" },
  },
  "business.model.cost_items": {
    fa: { why: "بوم نشان می‌دهد چه چیزهایی هزینه دارند. مبالغ در پاسخ‌های مالی محرمانه باقی می‌مانند.", example: "قهوهٔ سبز | با افزایش حجم بالا می‌رود | variable | links: act-1" },
    tr: { why: "Kanvas neyin maliyet yarattığını gösterir. Tutarlar kısıtlı finans yanıtlarında kalır.", example: "Çiğ kahve | hacimle artar | variable | links: act-1" },
  },
  "business.swot.strengths": {
    fa: { why: "نقطهٔ قوت در SWOT درونی است و همین امروز واقعی است؛ راهبردها بر پایهٔ آن ساخته می‌شوند.", example: "هر دسته طبق سفارش برشته می‌شود | گزارش هفتگی برشته‌کاری | evidenced | sources: business.offer.summary" },
    tr: { why: "SWOT'taki bir güçlü yön içseldir ve bugün gerçektir; stratejiler bunun üzerine kurulur.", example: "Her parti siparişe göre kavrulur | haftalık kavurma kaydı | evidenced | sources: business.offer.summary" },
  },
  "business.swot.weaknesses": {
    fa: { why: "نام بردن صادقانه از نقاط ضعف است که راهبردهای WO و WT را ممکن می‌کند.", example: "فقط یک برشته‌کار، بدون پشتیبان | یک دستگاه | owner_view" },
    tr: { why: "WO ve WT stratejilerini mümkün kılan, zayıf yönleri dürüstçe adlandırmaktır.", example: "Tek kavurucu, yedeği yok | tek makine | owner_view" },
  },
  "business.swot.opportunities": {
    fa: { why: "فرصت‌ها بیرونی‌اند: بازار، مشتریان، فناوری، مقررات. برای هر فرصت باید ذکر شود کجا دیده شده است.", example: "کافه‌های بیشتری از تولیدکنندگان محلی خرید می‌کنند | نظرسنجی صنفی | evidenced | sources: https://example.com/report" },
    tr: { why: "Fırsatlar dışsaldır: pazar, müşteriler, teknoloji, mevzuat. Her birinin nerede görüldüğü belirtilmelidir.", example: "Daha fazla kafe yerel alım yapıyor | sektör anketi | evidenced | sources: https://example.com/report" },
  },
  "business.swot.threats": {
    fa: { why: "تهدیدها بیرونی‌اند. نام بردن زودهنگام از آن‌ها به راهبردهای ST و WT امکان می‌دهد به آن‌ها پاسخ دهند.", example: "افزایش قیمت قهوهٔ سبز | اطلاعیهٔ تأمین‌کننده | evidenced" },
    tr: { why: "Tehditler dışsaldır. Onları erken adlandırmak, ST ve WT stratejilerinin bunlara yanıt vermesini sağlar.", example: "Çiğ kahve fiyatları artıyor | tedarikçi bildirimi | evidenced" },
  },
  "business.swot.tows": {
    fa: { why: "TOWS چهار فهرست SWOT را به اقدام تبدیل می‌کند: راهبردهای SO، ST، WO و WT که هر کدام تا موارد خود قابل ردیابی‌اند.", example: "اشتراک ویژهٔ کافه‌های محلی | تحویل هفتگی | so | links: str-1, opp-1" },
    tr: { why: "TOWS, dört SWOT listesini eyleme dönüştürür: her biri kendi öğelerine kadar izlenebilen SO, ST, WO ve WT stratejileri.", example: "Yerel kafelere abonelik sunmak | haftalık teslimat | so | links: str-1, opp-1" },
  },
  "business.fit.jobs": {
    fa: { why: "بوم ارزش پیشنهادی از مشتری شروع می‌شود: کارهایی که برای انجامشان یک محصول را به کار می‌گیرد.", example: "ثابت نگه‌داشتن منوی اسپرسو | هر شیفت صبح | functional | links: seg-1" },
    tr: { why: "Değer Önerisi Kanvası müşteriden başlar: bir ürünü kullanarak yapmak istediği işlerden.", example: "Espresso menüsünü tutarlı tutmak | her sabah vardiyası | functional | links: seg-1" },
  },
  "business.fit.pains": {
    fa: { why: "دردها همان چیزی‌اند که تسکین‌دهنده‌ها باید به آن‌ها پاسخ دهند؛ دردِ بی‌پاسخ، شکافی آشکار در تناسب است.", example: "دانه‌ها کهنه می‌رسند | تأمین‌کننده ماهانه ارسال می‌کند | extreme | links: seg-1, job-1" },
    tr: { why: "Sıkıntılar, sıkıntı gidericilerin yanıt vermesi gereken şeylerdir; yanıtsız bir sıkıntı uyumda görünür bir boşluktur.", example: "Çekirdekler bayat geliyor | tedarikçi aylık gönderiyor | extreme | links: seg-1, job-1" },
  },
  "business.fit.gains": {
    fa: { why: "دستاوردها همان چیزی‌اند که خلق‌کننده‌های دستاورد باید فراهم کنند: ضروری، مورد انتظار، مطلوب یا غیرمنتظره.", example: "مشتریان همیشگی کیفیت را حس می‌کنند | بازگشت مکرر | desired | links: seg-1" },
    tr: { why: "Kazanımlar, kazanım yaratıcılarının sağlaması gereken şeylerdir: zorunlu, beklenen, arzu edilen veya beklenmedik.", example: "Müdavimler kaliteyi fark ediyor | tekrar ziyaretler | desired | links: seg-1" },
  },
  "business.fit.products": {
    fa: { why: "نقشهٔ ارزش، پیش از آنکه بگوید چگونه دردها را تسکین می‌دهد و دستاورد می‌آفریند، آنچه را عرضه می‌کنید فهرست می‌کند.", example: "تحویل هفتگی قهوهٔ تازه‌برشته | بسته‌های 1 kg | physical | links: seg-1" },
    tr: { why: "Değer haritası, sıkıntıları nasıl giderdiğini ve kazanım nasıl yarattığını söylemeden önce sunduklarınızı listeler.", example: "Haftalık taze kavrulmuş kahve teslimatı | 1 kg paketler | physical | links: seg-1" },
  },
  "business.fit.relievers": {
    fa: { why: "تناسب فقط زمانی دیده می‌شود که هر تسکین‌دهنده به یک درد پیوند داده شود؛ هیچ چیز خودکار تطبیق داده نمی‌شود.", example: "برشته‌شده در 48 ساعت پیش از تحویل | بسته‌های تاریخ‌دار | links: pain-1, prod-1" },
    tr: { why: "Uyum ancak her sıkıntı giderici bir sıkıntıya bağlandığında görünür; hiçbir şey otomatik eşleştirilmez.", example: "Teslimattan önceki 48 saat içinde kavrulmuş | tarihli paketler | links: pain-1, prod-1" },
  },
  "business.fit.creators": {
    fa: { why: "تناسب فقط زمانی دیده می‌شود که هر خلق‌کننده به یک دستاورد پیوند داده شود؛ هیچ چیز خودکار تطبیق داده نمی‌شود.", example: "کارت خاستگاه برای پیشخوان | یادداشت‌های چشایی برای هر دسته | links: gain-1, prod-1" },
    tr: { why: "Uyum ancak her kazanım yaratıcısı bir kazanıma bağlandığında görünür; hiçbir şey otomatik eşleştirilmez.", example: "Tezgâh için menşe kartı | her parti için tadım notları | links: gain-1, prod-1" },
  },
  "business.marketing.objective": {
    fa: { why: "اهداف پیش از انتخاب کانال‌ها می‌آیند.", example: "بفهمیم بخش اصلی مشتریان پیشنهاد را درک می‌کند یا نه. هنوز هدف رشدی تعیین نشده است." },
    tr: { why: "Hedefler kanal seçiminden önce gelir.", example: "Birincil segmentin teklifi anlayıp anlamadığını öğrenmek. Henüz büyüme hedefi yok." },
  },
  "business.marketing.channels": {
    fa: { why: "برنامه‌ای که همهٔ کانال‌ها را فهرست کند، برنامه نیست.", example: "فقط یادداشت‌هایی به قلم بنیان‌گذار. بدون تبلیغات پولی در شبکه‌های اجتماعی." },
    tr: { why: "Her kanalı listeleyen bir plan, plan değildir.", example: "Yalnızca kurucunun yazdığı notlar. Ücretli sosyal medya yok." },
  },
  "business.marketing.journey": {
    fa: { why: "قیف‌ها تا وقتی اندازه‌گیری وجود ندارد، فرضیه‌اند.", example: "فراتر از مرحلهٔ آگاهی نامشخص است. ماندگاری اندازه‌گیری نشده است." },
    tr: { why: "Ölçüm olana kadar hunilere hipotez gözüyle bakılır.", example: "Farkındalık sonrası bilinmiyor. Elde tutma ölçülmedi." },
  },
  "business.marketing.pillars": {
    fa: { why: "قالب‌های شبکه‌های اجتماعی و کمپین‌ها محورها را به ارث می‌برند و موضوع تازه از خود نمی‌سازند.", example: "TBD — هیچ محوری تأیید نشده است." },
    tr: { why: "Sosyal medya ve kampanya şablonları tema icat etmek yerine içerik sütunlarını devralır.", example: "TBD — onaylı içerik sütunu yok." },
  },
  "business.marketing.budget": {
    fa: { why: "ادعای بودجه بدون واحد پول و تاریخ قابل استفاده نیست و اطلاعاتی حساس است.", example: "نامشخص. هیچ هزینه‌ای تأیید نشده است." },
    tr: { why: "Para birimi ve tarih içermeyen bir bütçe beyanı kullanılamaz ve hassas bir bilgidir.", example: "Bilinmiyor. Onaylı harcama yok." },
  },
  "business.marketing.attribution": {
    fa: { why: "قواعد گزارش‌دهی باید پیش از آنکه داشبوردی مرجع حقیقت تلقی شود انتخاب شوند.", example: "Undecided. Do not imply last-click." },
    tr: { why: "Bir gösterge paneli doğru kabul edilmeden önce raporlama kuralları seçilmelidir.", example: "Undecided. Do not imply last-click." },
  },
  "business.marketing.availability_claim": {
    fa: { why: "این پاسخ باید با product.public_status هماهنگ بماند.", example: "do-not-claim" },
    tr: { why: "Bu yanıt product.public_status ile tutarlı kalmalıdır.", example: "do-not-claim" },
  },
  "business.marketing.utm": {
    fa: { why: "یک طبقه‌بندی مشترک مانع می‌شود هر کانال نام‌های منبع خودش را بسازد.", example: "هنوز هیچ" },
    tr: { why: "Ortak bir sınıflandırma, her kanalın kendi kaynak adlarını uydurmasını önler.", example: "henüz yok" },
  },
  "business.marketing.paid_media": {
    fa: { why: "بررسی‌های سنجش رسانهٔ پولی فقط وقتی اعمال می‌شوند که رسانهٔ پولی فعال باشد. پاسخ فقط بله یا خیر است، هرگز بودجه؛ بودجه محرمانه می‌ماند.", example: "no" },
    tr: { why: "Ücretli medya ölçüm kontrolleri yalnızca ücretli medya yürütülürken uygulanır. Yanıt evet ya da hayırdır, asla bir bütçe değildir; bütçe kısıtlı kalır.", example: "no" },
  },
  "business.marketing.journey_stages": {
    fa: { why: "نقشهٔ سفر مشتری نشان می‌دهد مشتریان در هر مرحله کجا دچار مشکل می‌شوند، تا اصلاحات و محتوا به‌جای کل قیف، لحظه‌ای واقعی را هدف بگیرند.", example: "کشف | یافتن گزینه‌ای قابل‌اعتماد | Instagram، یک دوست | نظرات را می‌خواند | خنثی | گزینه‌های بیش از حد | راهنمای مقایسهٔ کوتاه | 12 مصاحبه | links: seg-1" },
    tr: { why: "Bir yolculuk haritası, müşterilerin aşama aşama nerede zorlandığını gösterir; böylece düzeltmeler ve içerik tüm huni yerine gerçek bir anı hedefler.", example: "Keşif | güvenilir bir seçenek bulmak | Instagram, bir arkadaş | yorumları okur | nötr | çok fazla seçenek | kısa karşılaştırma rehberi | 12 görüşme | links: seg-1" },
  },
  "business.product.portfolio": {
    fa: { why: "یک خلاصهٔ پیشنهاد ممکن است محصول دومی را پنهان کند که بازاریابی ناخواسته وعده‌اش را بدهد.", example: "یک اپلیکیشن تمرین. داشبورد معلم فقط در حد ایده است." },
    tr: { why: "Tek bir teklif özeti, pazarlamanın yanlışlıkla vaat edebileceği ikinci bir ürünü gizleyebilir.", example: "Tek bir pratik uygulaması. Öğretmen paneli yalnızca bir fikir." },
  },
  "business.product.jobs": {
    fa: { why: "کارها، سابقهٔ بخش مشتری را به الزامات محصول و تجربهٔ کاربری پیوند می‌دهند.", example: "گنجاندن تمرین مکالمه در مسیر رفت‌وآمد روزانه." },
    tr: { why: "İşler, segment kaydını ürün gereksinimlerine ve UX'e bağlar.", example: "Konuşma pratiğini işe gidiş gelişe sığdırmak." },
  },
  "business.product.mvp": {
    fa: { why: "موارد خارج از هدف، مانع می‌شوند سیستم برند قابلیت‌هایی را به تصویر بکشد که در محدوده نیستند.", example: "یک چرخهٔ درس. بدون فید اجتماعی." },
    tr: { why: "Hedef dışı maddeler, marka sisteminin kapsam dışı özellikleri görselleştirmesini engeller.", example: "Tek bir ders döngüsü. Sosyal akış yok." },
  },
  "business.product.public_status": {
    fa: { why: "ادعاهای بازاریابی دربارهٔ دسترس‌پذیری با این فیلد سنجیده می‌شوند.", example: "unshipped" },
    tr: { why: "Pazarlamadaki erişilebilirlik beyanları bu alana göre kontrol edilir.", example: "unshipped" },
  },
  "business.product.roadmap": {
    fa: { why: "خلاقیت رونمایی باید بداند کدام موارد هنوز واقعی نیستند.", example: "اکنون: نمونهٔ اولیه. بعدی: نامشخص. بعدتر: نامشخص." },
    tr: { why: "Lansman içerikleri hangi öğelerin henüz gerçek olmadığını bilmelidir.", example: "Şimdi: prototip. Sonra: bilinmiyor. Daha sonra: bilinmiyor." },
  },
  "business.product.accessibility": {
    fa: { why: "نیت، گواهی‌نامه نیست. ماژول رابط کاربری همان سطحی را که تعیین می‌کنید به ارث می‌برد.", example: "هدف WCAG 2.2 AA است. هیچ ممیزی‌ای انجام نشده است." },
    tr: { why: "Niyet bir sertifika değildir. UI modülü belirttiğiniz çıtayı devralır.", example: "Hedef WCAG 2.2 AA. Herhangi bir denetim yapılmadı." },
  },
  "business.product.activation": {
    fa: { why: "طراحی فرایند آشنایی کاربر و آزمایش‌های رشد به یک تعریف واحد نیاز دارند.", example: "تعریف نشده. نرخ تکمیل جعل نکنید." },
    tr: { why: "Kullanıcı karşılama tasarımı ve büyüme deneyleri tek bir tanıma ihtiyaç duyar.", example: "Tanımlanmadı. Tamamlanma oranı uydurulmamalı." },
  },
  "business.product.learning_model": {
    fa: { why: "برندهای آموزشی به پرسش‌هایی دربارهٔ یادگیری، تمرین و پیشرفت نیاز دارند. از حوزه‌های دیگر نباید این‌ها را پرسید.", example: "نامشخص. تکرار فاصله‌دار را فرض نکنید." },
    tr: { why: "Eğitim markaları öğrenme, pratik ve ilerleme sorularına ihtiyaç duyar. Diğer sektörlere bu sorular sorulmamalıdır.", example: "Bilinmiyor. Aralıklı tekrar varsayılmamalı." },
  },
  "business.product.learning_languages": {
    fa: { why: "زبان محتوا و زبان رابط کاربری دو واقعیت رسمی جداگانه‌اند.", example: "نامشخص. هیچ برنامهٔ درسی‌ای تأیید نشده است." },
    tr: { why: "İçerik dili ve arayüz dili ayrı esas bilgilerdir.", example: "Bilinmiyor. Onaylı müfredat yok." },
  },
  "business.product.evidence_policy": {
    fa: { why: "یادداشت‌های اکتشاف فقط وقتی مفیدند که رضایت و حداقل‌سازی داده صریح باشند.", example: "شناسه و تاریخ مطالعه را ذکر کنید. ضبط‌ها را در درایوی نگه دارید که برایش رضایت گرفته شده است." },
    tr: { why: "Keşif notları yalnızca rıza ve veri minimizasyonu açıkça belirtildiğinde işe yarar.", example: "Çalışma kimliğini ve tarihini belirtin. Kayıtları rıza alınmış sürücüde saklayın." },
  },
  "business.sales.motion": {
    fa: { why: "متن‌های فروش، فیلدهای CRM و استخدام از شیوهٔ فروش پیروی می‌کنند.", example: "undecided" },
    tr: { why: "Satış senaryoları, CRM alanları ve işe alımlar satış modelini izler.", example: "undecided" },
  },
  "business.sales.buyer": {
    fa: { why: "پرسوناهای برند نباید زیاد شوند. این فیلد فقط جدایی واقعی خریدار و کاربر را ثبت می‌کند.", example: "same" },
    tr: { why: "Marka personaları çoğaltılmamalıdır. Bu alan yalnızca gerçek bir ayrımı kaydeder.", example: "same" },
  },
  "business.sales.pricing": {
    fa: { why: "این تنها سابقهٔ قیمت‌گذاری است. تبلیغات و پیشنهادهای قیمت فروش به آن ارجاع می‌دهند.", example: "نامشخص. هیچ قیمتی تأیید نشده است." },
    tr: { why: "Bu tek fiyatlandırma kaydıdır. Reklamlar ve satış teklifleri buna atıfta bulunur.", example: "Bilinmiyor. Onaylı fiyat yok." },
  },
  "business.sales.discount": {
    fa: { why: "تخفیف‌های بی‌صاحب به وعده‌های ناخواستهٔ برند تبدیل می‌شوند.", example: "هیچ سیاست تخفیفی وجود ندارد." },
    tr: { why: "Sahibi olmayan indirimler istemeden verilmiş marka vaatlerine dönüşür.", example: "İndirim politikası yok." },
  },
  "business.sales.stages": {
    fa: { why: "پیش‌بینی فروش بدون تعریف مراحلی که می‌شناسید بی‌معناست.", example: "تا وقتی شیوهٔ فروش مشخص نشده، کاربرد ندارد." },
    tr: { why: "Tanıdığınız aşama tanımları olmadan tahminleme anlamsızdır.", example: "Bir satış modeli oluşana kadar geçerli değil." },
  },
  "business.sales.cycle": {
    fa: { why: "یک خاطرهٔ پراکنده معیار نیست. یا تاریخش را ثبت کنید یا کنارش بگذارید.", example: "نامشخص. هیچ معامله‌ای بسته نشده است." },
    tr: { why: "Hatırlanan bir anekdot metrik değildir. Ya tarihlendirin ya da çıkarın.", example: "Bilinmiyor. Kapanmış anlaşma yok." },
  },
  "business.sales.b2b_packaging": {
    fa: { why: "بسته‌بندی پلن‌های SaaS یک واقعیت فروش است. برندهای آموزشی و مصرفی نباید به زور در این قالب قرار بگیرند.", example: "نامشخص. هیچ سطحی تأیید نشده است." },
    tr: { why: "SaaS paketleme bir satış gerçeğidir. Eğitim ve tüketici markaları zorla bu kalıba sokulmamalıdır.", example: "Bilinmiyor. Onaylanmış bir paket yok." },
  },
  "business.sales.consumer_path": {
    fa: { why: "طراحی‌های فروشگاه اپلیکیشن و دیوار پرداخت باید با مسیری واقعی منطبق باشند.", example: "کاربرد ندارد" },
    tr: { why: "Uygulama mağazası ve ödeme duvarı tasarımları gerçek bir satın alma yoluyla örtüşmelidir.", example: "geçerli değil" },
  },
  "business.cx.onboarding": {
    fa: { why: "الگوهای تجربهٔ کاربری و حالت‌های ماسکوت به یک نتیجهٔ واقعی نیاز دارند، نه یک جشن کلی.", example: "فرد یک تمرین کوتاه را تمام می‌کند و می‌داند قدم بعدی چیست. صفحه‌ها هنوز مشخص نشده‌اند." },
    tr: { why: "UX kalıpları ve maskot durumları genel bir kutlamaya değil, gerçek bir sonuca ihtiyaç duyar.", example: "Kişi kısa bir alıştırmayı bitirir ve sırada ne olduğunu bilir. Ekranlar henüz belirlenmedi." },
  },
  "business.cx.channels": {
    fa: { why: "سایت نباید کانالی را تبلیغ کند که کسی آن را پیگیری نمی‌کند.", example: "فقط ایمیل. بدون تلفن." },
    tr: { why: "Site, kimsenin takip etmediği bir kanalın reklamını yapmamalıdır.", example: "Yalnızca e-posta. Telefon yok." },
  },
  "business.cx.sla": {
    fa: { why: "یک SLA ضمنی، یک وعدهٔ عمومی است.", example: "none" },
    tr: { why: "Örtük bir SLA, kamuya verilmiş bir sözdür.", example: "none" },
  },
  "business.cx.feedback_metric": {
    fa: { why: "نام بردن از NPS با داشتن امتیاز آن یکی نیست.", example: "none yet" },
    tr: { why: "NPS'ten söz etmek, bir puana sahip olmakla aynı şey değildir.", example: "none yet" },
  },
  "business.cx.churn": {
    fa: { why: "لحن برند، لحظهٔ رفتن مشتری را هم در بر می‌گیرد.", example: "لغو اشتراک در یک مرحله تأیید شود. بدون متن‌های عذاب‌وجدان‌آور." },
    tr: { why: "Marka tonu, birinin ayrıldığı anı da kapsar.", example: "İptal tek adımda onaylanır. Suçluluk duygusu uyandıran metin yok." },
  },
  "business.cx.case_study": {
    fa: { why: "محتوای حمایتی تا زمانی که یک فرد مشخص موافقت نکرده، محدود است.", example: "تأیید کتبی از مشتری. بدون نقل‌قول از تیکت‌های پشتیبانی." },
    tr: { why: "Savunuculuk içeriği, adı belli bir kişi onay verene kadar kısıtlıdır.", example: "Müşteriden yazılı onay. Destek kayıtlarından alıntı yok." },
  },
  "business.ops.roles": {
    fa: { why: "وقتی همهٔ نقش‌ها خیالی باشند، مسیرهای تأیید از کار می‌افتند.", example: "یک بنیان‌گذار مسئول برند، محصول و پشتیبانی است." },
    tr: { why: "Her rol hayali olduğunda onay süreçleri işlemez.", example: "Tek bir kurucu marka, ürün ve desteği üstleniyor." },
  },
  "business.ops.decisions": {
    fa: { why: "عامل مصاحبه بدون این مدل مجوز، هیچ پیش‌نویسی را ارتقا نمی‌دهد.", example: "تا زمانی که متخصصی در کار نباشد، بنیان‌گذار هر چهار مورد را تأیید می‌کند." },
    tr: { why: "Görüşme ajanı bu yetki modeli olmadan hiçbir taslağı yükseltmez.", example: "Bir uzman gelene kadar dördünü de kurucu onaylar." },
  },
  "business.ops.sop": {
    fa: { why: "فهرست‌برداری از پرریسک‌ترین تحویل کار شروع می‌شود، نه از یک کتابخانهٔ خالی با 40 SOP.", example: "اینکه یک ادعای برند چگونه تأیید می‌شود." },
    tr: { why: "Envanter, 40 SOP'lik boş bir kütüphaneyle değil, en riskli devir teslimle başlar.", example: "Bir marka iddiasının nasıl onaylandığı." },
  },
  "business.ops.vendors": {
    fa: { why: "یادداشت‌های تأمین نباید به انباری از قراردادها تبدیل شوند.", example: "هنوز تأمین‌کننده‌ای نداریم." },
    tr: { why: "Satın alma notları bir sözleşme yığınına dönüşmemelidir.", example: "Henüz tedarikçi yok." },
  },
  "business.ops.cadence": {
    fa: { why: "ریتمی که رعایتش نمی‌کنید نباید به‌عنوان سیاست مستند شود.", example: "هیچ. تصمیم‌ها در گزارش مصاحبه گرفته می‌شوند." },
    tr: { why: "Sürdürmediğiniz bir toplantı düzeni politika olarak belgelenmemelidir.", example: "Yok. Kararlar görüşme kaydında alınıyor." },
  },
  "business.ops.tracker": {
    fa: { why: "اجرا در ابزار پیگیری کارها می‌ماند. این مخزن فقط به آن لینک می‌دهد.", example: "none" },
    tr: { why: "Yürütme, görev takip aracında kalır. Bu depo yalnızca ona bağlantı verir.", example: "none" },
  },
  "business.finance.currency": {
    fa: { why: "ارزهای مختلف بدون انتخاب یک ارز گزارش‌دهی قابل مقایسه نیستند.", example: "نامشخص" },
    tr: { why: "Bir raporlama para birimi seçilmeden karışık para birimleri karşılaştırılamaz.", example: "bilinmiyor" },
  },
  "business.finance.basis": {
    fa: { why: "پاسخ‌های مبتنی بر مبنای نقدی و تعهدی نباید بی‌صدا با هم مخلوط شوند.", example: "undecided" },
    tr: { why: "Nakit esaslı ve tahakkuk esaslı yanıtlar sessizce birbirine karıştırılmamalıdır.", example: "undecided" },
  },
  "business.finance.revenue_figure": {
    fa: { why: "ارقام واقعیِ محدود نباید حدس زده یا منتشر شوند.", example: "نامشخص" },
    tr: { why: "Kısıtlı gerçekleşen rakamlar tahmin edilmemeli veya yayımlanmamalıdır.", example: "bilinmiyor" },
  },
  "business.finance.costs": {
    fa: { why: "اقتصاد واحد به دسته‌بندی نیاز دارد، نه به خروجی حساب بانکی.", example: "نامشخص. هنوز مدل هزینه‌ای وجود ندارد." },
    tr: { why: "Birim ekonomisi bir banka dökümüne değil, kategorilere ihtiyaç duyar.", example: "Bilinmiyor. Henüz bir maliyet modeli yok." },
  },
  "business.finance.runway": {
    fa: { why: "رانوی یک برآورد حساس است، نه یک مقدار پیش‌فرض قالب.", example: "نامشخص" },
    tr: { why: "Nakit ömrü hassas bir tahmindir, asla bir şablon varsayılanı değildir.", example: "bilinmiyor" },
  },
  "business.finance.economics_note": {
    fa: { why: "بحث حاشیهٔ سودی که قیمتی از خودش بسازد، رکورد مرجع را دوشاخه می‌کند.", example: "تا قیمتی وجود نداشته باشد، قابل ارزیابی نیست." },
    tr: { why: "Fiyat uyduran bir kâr marjı tartışması, kanonik kaydı ikiye böler.", example: "Bir fiyat belirlenene kadar değerlendirilemez." },
  },
  "business.finance.system": {
    fa: { why: "اتصال‌دهنده‌ها از دفترهای کپی‌شده بهترند.", example: "هنوز هیچ" },
    tr: { why: "Bağlayıcılar, kopyalanmış defterlerden daha iyidir.", example: "henüz yok" },
  },
  "business.finance.scenarios": {
    fa: { why: "سناریوهای خالی باید خالی بمانند.", example: "زود است. هنوز حالت پایه‌ای وجود ندارد." },
    tr: { why: "Boş senaryolar boş kalmalıdır.", example: "Erken. Temel senaryo yok." },
  },
  "business.engineering.stack": {
    fa: { why: "مستندات برند و محصول نباید به پلتفرمی اشاره کنند که ندارید.", example: "تصمیم‌گیری نشده. هنوز استک عملیاتی وجود ندارد." },
    tr: { why: "Marka ve ürün belgeleri sahip olmadığınız bir platformu ima etmemelidir.", example: "Karar verilmedi. Canlı ortam için bir teknoloji yığını yok." },
  },
  "business.engineering.environments": {
    fa: { why: "ادعاهای مربوط به انتشار و پیش‌نمایش به این موضوع بستگی دارند.", example: "فقط محلی" },
    tr: { why: "Sürüm ve önizleme iddiaları buna bağlıdır.", example: "yalnızca yerel" },
  },
  "business.engineering.data_classes": {
    fa: { why: "متن‌های حریم خصوصی و خودداری مصاحبه از جمع‌آوری اطلاعات محرمانه، از این فهرست پیروی می‌کنند.", example: "هنوز هیچ" },
    tr: { why: "Gizlilik metinleri ve görüşmenin gizli bilgi toplamayı reddetmesi bu listeye dayanır.", example: "henüz yok" },
  },
  "business.engineering.secrets": {
    fa: { why: "قالب، قرار دادن اطلاعات محرمانه در Git را ممنوع می‌کند. تأیید کنید که برند این قاعده را حفظ خواهد کرد.", example: "یک ابزار مدیریت بیرون از Git. هیچ چیز محرمانه‌ای کامیت نمی‌شود." },
    tr: { why: "Şablon, gizli bilgilerin Git'e konmasını yasaklar. Markanın bu kurala uyacağını onaylayın.", example: "Git dışında bir yönetici araç. Gizli hiçbir şey commit edilmez." },
  },
  "business.engineering.reliability": {
    fa: { why: "صفحهٔ SLO با درصدهای دسترس‌پذیری ساختگی، یک ادعای نادرست است.", example: "none" },
    tr: { why: "Uydurma dokuzlarla dolu bir SLO sayfası yanlış bir iddiadır.", example: "none" },
  },
  "business.engineering.repos": {
    fa: { why: "حقیقت فنی در همان مخزن‌ها می‌ماند.", example: "none" },
    tr: { why: "Mühendislik gerçeği o depolarda kalır.", example: "none" },
  },
  "business.legal.entity": {
    fa: { why: "قراردادها و فاکتورها به یک شخص حقوقی واقعی وابسته‌اند.", example: "هنوز شخص حقوقی تشکیل نشده است." },
    tr: { why: "Sözleşmeler ve faturalar gerçek bir tüzel kişiliğe bağlıdır.", example: "Henüz tüzel kişilik kurulmadı." },
  },
  "business.legal.trademark": {
    fa: { why: "ترکیب‌بندی‌های لوگو نباید به علامت تجاری ثبت‌شده اشاره کنند.", example: "No search and no filing." },
    tr: { why: "Logo kilitlenmeleri tescilli bir marka olduğunu ima etmemelidir.", example: "No search and no filing." },
  },
  "business.legal.privacy": {
    fa: { why: "ماتریس انطباق با دامنهٔ شناخته‌شده شروع می‌شود، نه با فهرستی کپی‌شده از قوانین.", example: "نامشخص. هنوز مشاور حقوقی بررسی نکرده است." },
    tr: { why: "Uyumluluk matrisi, kopyalanmış bir mevzuat listesiyle değil, bilinen kapsamla başlar.", example: "Bilinmiyor. Hukuk danışmanı incelemedi." },
  },
  "business.legal.consent": {
    fa: { why: "ایمیل و تبلیغات نمی‌توانند رضایت را فرض بگیرند.", example: "تصمیم‌گیری نشده" },
    tr: { why: "E-posta ve reklamlar rızayı varsayamaz.", example: "karar verilmedi" },
  },
  "business.legal.third_party": {
    fa: { why: "ماژول‌های توکن و صوتی نمی‌توانند دارایی‌های بدون مجوز را منتشر کنند.", example: "هیچ دارایی شخص ثالثی انتخاب نشده است." },
    tr: { why: "Token ve ses modülleri lisanssız varlıklarla yayına çıkamaz.", example: "Üçüncü taraf varlık seçilmedi." },
  },
  "business.legal.counsel": {
    fa: { why: "این پاسخ، هر ادعای آینده دربارهٔ بررسی حقوقی را کنترل می‌کند. پیش‌فرض قالب «خیر» است.", example: "no" },
    tr: { why: "Bu yanıt, gelecekteki her inceleme iddiasının önünde bir kapıdır. Şablonun varsayılanı hayırdır.", example: "no" },
  },
  "business.growth.loops": {
    fa: { why: "نمودار حلقه‌ای که وانمود کند ارجاع وجود دارد، داستان برند را آلوده می‌کند.", example: "هنوز هیچ حلقه‌ای واقعی نیست. فعال‌سازی یک فرضیه است." },
    tr: { why: "Tavsiye mekanizması varmış gibi davranan bir döngü şeması marka hikâyesini bozar.", example: "Henüz gerçek bir döngü yok. Aktivasyon bir hipotez." },
  },
  "business.growth.hypothesis": {
    fa: { why: "بک‌لاگ خالی یک وضعیت معتبر است.", example: "تا پایدار شدن پیشنهاد، بک‌لاگ خالی می‌ماند." },
    tr: { why: "Boş bir iş listesi geçerli bir durumdur.", example: "Teklif netleşene kadar iş listesi boş." },
  },
  "business.growth.guardrail": {
    fa: { why: "مرزهای محافظ بخشی از برند هستند، نه یک پانویس آماری.", example: "بدون پیش‌فرض‌های پنهان. بدون کاهش کنتراست." },
    tr: { why: "Koruma sınırları markanın bir parçasıdır, istatistiksel bir dipnot değil.", example: "Gizli varsayılan yok. Kontrast düşürülmez." },
  },
  "business.growth.owner": {
    fa: { why: "آزمایش‌های بی‌مالک با قواعد تأییدشدهٔ برند تداخل پیدا می‌کنند.", example: "بنیان‌گذار. فعلاً هیچ‌کس دیگر." },
    tr: { why: "Sahibi olmayan testler onaylanmış marka kurallarıyla çakışır.", example: "Kurucu. Şimdilik başka kimse yok." },
  },
  "business.growth.results_policy": {
    fa: { why: "این همان کنترلی است که جلوی معناداری ساختگی را می‌گیرد.", example: "yes" },
    tr: { why: "Uydurma anlamlılığı engelleyen kontrol budur.", example: "yes" },
  },
  "business.growth.replication": {
    fa: { why: "یک آزمون پرنویز نباید لحن برند را بازنویسی کند.", example: "نامشخص. هنوز آزمونی انجام نشده، پس قاعدهٔ ارتقایی جز تأیید مالک وجود ندارد." },
    tr: { why: "Gürültülü tek bir test markanın sesini yeniden yazmamalıdır.", example: "Bilinmiyor. Henüz test yok, bu yüzden sahip onayı dışında bir yükseltme kuralı yok." },
  },
  "business.goals.annual": {
    fa: { why: "OKRهای بدون هدف کیفی، به انبوهی از عدد تبدیل می‌شوند.", example: "پیش از ساختن یک برند کامل، مشخص کنیم که بخش اصلی بازار واقعی است یا نه." },
    tr: { why: "Bir hedefi olmayan OKR'ler bir sayı yığınına dönüşür.", example: "Tam bir marka kurmadan önce birincil segmentin gerçek olup olmadığına karar vermek." },
  },
  "business.goals.quarter": {
    fa: { why: "یک قالب نباید نمایش OKR فصلی را تحمیل کند.", example: "استفاده نمی‌شود" },
    tr: { why: "Bir şablon, çeyreklik OKR gösterisini dayatmamalıdır.", example: "kullanılmıyor" },
  },
  "business.goals.north_star": {
    fa: { why: "هم‌راستایی بازاریابی به یک تعریف نیاز دارد، نه یک شعار.", example: "none" },
    tr: { why: "Pazarlama uyumu bir slogana değil, bir tanıma ihtiyaç duyar.", example: "none" },
  },
  "business.goals.sources": {
    fa: { why: "KPI بدون منبع، یک جمله است، نه یک سنجه.", example: "none" },
    tr: { why: "Kaynağı olmayan bir KPI bir ölçü değil, bir cümledir.", example: "none" },
  },
  "business.goals.cadence": {
    fa: { why: "بازبینی‌ها جایی هستند که برنامه‌ها دیگر وانمود نمی‌کنند نتیجه‌اند.", example: "هر وقت یک نقطهٔ عطف بسته شود. هنوز داشبورد هفتگی نداریم." },
    tr: { why: "Gözden geçirmeler, planların sonuçmuş gibi davranmayı bıraktığı yerdir.", example: "Bir kilometre taşı kapandığında. Henüz haftalık pano yok." },
  },
  "business.goals.plan_vs_actual": {
    fa: { why: "مشخصات، ارائهٔ یک تصویر لحظه‌ای قدیمی به‌عنوان عملکرد فعلی را ممنوع می‌کند.", example: "پیش از هر عدد، برچسب هدف، پیش‌بینی یا واقعی به‌همراه تاریخ بیاید. ارقام واقعی اینجا کپی نمی‌شوند." },
    tr: { why: "Belirtim, eski bir anlık görüntünün güncel performans olarak sunulmasını yasaklar.", example: "Her sayının önüne hedef, tahmin veya gerçekleşen ibaresi ve bir tarih ekleyin. Gerçekleşen rakamlar buraya kopyalanmaz." },
  },
  "business.goals.objectives": {
    fa: { why: "نتایج کلیدی زیر یک هدف قرار می‌گیرند؛ بدون آن به انبوهی از عدد تبدیل می‌شوند.", example: "اثبات واقعی بودن بخش اصلی بازار | پیش از ساختن یک برند کامل | 2027 Q1" },
    tr: { why: "Anahtar sonuçlar bir hedefin altında yer alır; hedef olmadan bir sayı yığınına dönüşürler.", example: "Birincil segmentin gerçek olduğunu kanıtlamak | tam bir marka kurmadan önce | 2027 Q1" },
  },
  "business.goals.key_results": {
    fa: { why: "نتیجهٔ کلیدیِ بدون مقدار هدف، واحد و منبع، یک جمله است، نه یک سنجه. پیشرفت فقط از یک خط پایهٔ ثبت‌شده محاسبه می‌شود.", example: "یادگیرندگانی که هفتهٔ اول را تمام می‌کنند | 20 | 6 | یادگیرنده | تحلیل‌های محصول | 0 | 2026-11-20 | links: obj-1" },
    tr: { why: "Hedefi, birimi ve kaynağı olmayan bir anahtar sonuç bir ölçü değil, bir cümledir. İlerleme yalnızca kayıtlı bir başlangıç değerinden çizilir.", example: "İlk haftayı tamamlayan öğrenciler | 20 | 6 | öğrenci | ürün analitiği | 0 | 2026-11-20 | links: obj-1" },
  },
  "business.partners.channels": {
    fa: { why: "قواعد بازاریابی مشترک نباید شرکای خیالی را توصیف کنند.", example: "هیچ." },
    tr: { why: "Ortak pazarlama kuralları hayali ortakları tanımlamamalıdır.", example: "Yok." },
  },
  "business.partners.share": {
    fa: { why: "شرایط تقسیم درآمد، فرض‌های تجاری محدود هستند.", example: "none" },
    tr: { why: "Gelir paylaşımı koşulları kısıtlı ticari varsayımlardır.", example: "none" },
  },
  "business.partners.risk_process": {
    fa: { why: "ثبت ریسکی که ریتم بازبینی ندارد، به داستانی کهنه و ساختگی تبدیل می‌شود.", example: "هر وقت یک نقطهٔ عطف تغییر کند، بنیان‌گذار آن را بازبینی می‌کند." },
    tr: { why: "Gözden geçirme düzeni olmayan bir risk kaydı eskimiş bir kurguya dönüşür.", example: "Bir kilometre taşı değiştiğinde kurucu gözden geçirir." },
  },
  "business.partners.narrative": {
    fa: { why: "طرح کلی ارائه، نمایی از رکوردهای مرجع است، نه منبع جدیدی از حقیقت.", example: "هنوز شواهدی نداریم و قیمتی هم تعیین نکرده‌ایم." },
    tr: { why: "Sunum taslağı kanonik kayıtlara bir bakıştır, yeni bir doğruluk kaynağı değil.", example: "Henüz kanıt aşamasındayız ve bir fiyat belirlemedik." },
  },
  "business.partners.diligence": {
    fa: { why: "فهرستی که اتاق داده را در خود جای دهد، به نسخهٔ عمومی نشت خواهد کرد.", example: "اتاق داده‌ای وجود ندارد. فهرست خالی است." },
    tr: { why: "Veri odasını içine gömen bir dizin, herkese açık bir derlemeye sızar.", example: "Veri odası yok. Dizin boş." },
  },
  "business.partners.board_home": {
    fa: { why: "مجموعه‌های محدود نباید در پورتال مستندات کپی شوند.", example: "هنوز هیچ‌جا." },
    tr: { why: "Kısıtlı koleksiyonlar doküman portalına kopyalanmamalıdır.", example: "Henüz hiçbir yerde." },
  },
  "personal.identity.public_name": {
    fa: { why: "هر بیوگرافی، پروفایل و معرفی از یک نام رسمی و واحد شروع می‌شود.", example: "Alex Example" },
    tr: { why: "Her biyografi, profil ve tanıtım tek bir resmî addan yola çıkar.", example: "Alex Example" },
  },
  "personal.identity.headline": {
    fa: { why: "این تیتر در بیوگرافی‌ها، لینکدین، برگه‌های معرفی سخنران و بخش اصلی وب‌سایت دوباره به کار می‌رود.", example: "مشاور استراتژی محصول برای تیم‌های نوپا" },
    tr: { why: "Başlık; biyografilerde, LinkedIn'de, konuşmacı tanıtım sayfalarında ve web sitesinin ana bölümünde yeniden kullanılır.", example: "Erken aşama ekipler için ürün stratejisi danışmanı" },
  },
  "personal.identity.roles": {
    fa: { why: "نقش‌ها تعیین می‌کنند کدام جنبه‌ها و اسناد مرتبط هستند.", example: "مشاور و تسهیل‌گر کارگاه؛ استراتژی محصول؛ فناوری آموزشی." },
    tr: { why: "Roller, hangi yönlerin ve belgelerin ilgili olduğunu belirler.", example: "Danışman ve atölye kolaylaştırıcısı; ürün stratejisi; eğitim teknolojisi." },
  },
  "personal.identity.name_forms": {
    fa: { why: "مخاطبان چندزبانه نام را با بیش از یک خط می‌بینند. هر شکل نام باید تأیید شده باشد، نه حدسی.", example: "شکل کوتاه: Alex E. آوانویسی تأییدشده توسط مالک." },
    tr: { why: "Farklı dillerden oluşan kitleler adı birden fazla yazı sisteminde görür. Her biçim tahmin edilmemeli, onaylanmalıdır.", example: "Kısa biçim: Alex E. Sahibi tarafından onaylanmış transliterasyon." },
  },
  "personal.identity.localized_headline": {
    fa: { why: "ادعای ترجمه‌شده، ادعایی تازه است و هرگز به‌طور خودکار تأیید نمی‌شود.", example: "tr: Erken aşama ekipler için ürün stratejisi danışmanı (پیش‌نویس)." },
    tr: { why: "Çevrilmiş bir iddia yeni bir iddiadır. Asla otomatik olarak onaylanmaz.", example: "tr: Erken aşama ekipler için ürün stratejisi danışmanı (taslak)." },
  },
  "personal.identity.service_scope": {
    fa: { why: "محدوده‌ی خدمات به رسیدن به مخاطب درست کمک می‌کند؛ نشانی دقیق، خصوصی است.", example: "اروپا و به‌صورت دورکاری." },
    tr: { why: "Hizmet kapsamı doğru kitleye ulaşmaya yardımcı olur; kesin bir adres ise özeldir.", example: "Avrupa ve uzaktan." },
  },
  "personal.identity.pronouns": {
    fa: { why: "فقط وقتی ثبت می‌شود که خودتان بگویید. هرگز از روی نام حدس زده نمی‌شود.", example: "صرف‌نظر شد." },
    tr: { why: "Yalnızca kendiliğinden belirtildiğinde kaydedilir. Asla addan çıkarım yapılmaz.", example: "Atlandı." },
  },
  "personal.positioning.known_for": {
    fa: { why: "جمله‌ی جایگاه‌یابی، پایه‌ی بیوگرافی‌ها و تیترهاست.", example: "شناخته‌شده نزد بنیان‌گذاران استارتاپ‌های نوپا برای کشف محصول به شیوه‌ای کاربردی." },
    tr: { why: "Konumlandırma cümlesi, biyografilerin ve başlıkların dayanağıdır.", example: "Erken aşama girişim kurucuları arasında pratik ürün keşfiyle tanınır." },
  },
  "personal.positioning.primary_audience": {
    fa: { why: "هر کانال و سندی برای مخاطبی مشخص نوشته می‌شود.", example: "بنیان‌گذاران استارتاپ‌های مرحله‌ی بذر که مدیر محصول ندارند." },
    tr: { why: "Her kanal ve belge belirli biri için yazılır.", example: "Ürün lideri olmayan tohum aşamasındaki girişim kurucuları." },
  },
  "personal.positioning.expertise": {
    fa: { why: "تخصص بدون شاهد، «تأییدنشده» برچسب می‌خورد.", example: "کشف محصول (نمونه‌کار)، پژوهش قیمت‌گذاری (یک مطالعه‌ی موردی)." },
    tr: { why: "Kanıtı olmayan uzmanlık «doğrulanmamış» olarak etiketlenir.", example: "Ürün keşfi (portfolyo), fiyatlandırma araştırması (bir vaka çalışması)." },
  },
  "personal.positioning.outcome": {
    fa: { why: "نتایجی که وعده داده می‌شوند باید قابل نشان‌دادن باشند؛ وگرنه فرضیه‌اند.", example: "یک نقشه‌ی راه اولویت‌بندی‌شده در پایان همکاری. بدون وعده‌ی عملکرد." },
    tr: { why: "Vaat edilen sonuçlar gösterilebilir olmalıdır; aksi hâlde birer hipotezdir.", example: "Çalışmanın sonunda önceliklendirilmiş bir yol haritası. Performans vaadi yok." },
  },
  "personal.positioning.perspective": {
    fa: { why: "دیدگاه، یک فرد را از یک عنوان شغلی متمایز می‌کند.", example: "بیشتر نقشه‌های راه شکست می‌خورند، چون هیچ‌کس تصمیم‌های گرفته‌شده را ثبت نکرده است." },
    tr: { why: "Bir bakış açısı, kişiyi bir iş unvanından ayırır.", example: "Yol haritalarının çoğu, kimse alınan kararları yazıya dökmediği için başarısız olur." },
  },
  "personal.services.offers": {
    fa: { why: "ایده‌ای برای آینده که به‌عنوان خدمت منتشر شود، ادعایی نادرست است.", example: "موجود: اسپرینت کشف دوهفته‌ای. ایده: دوره‌ی آنلاین (ارائه نمی‌شود)." },
    tr: { why: "Hizmet olarak yayımlanan bir gelecek fikri yanlış bir iddiadır.", example: "Mevcut: iki haftalık keşif sprinti. Fikir: çevrim içi kurs (sunulmuyor)." },
  },
  "personal.positioning.boundaries": {
    fa: { why: "مرزها مانع می‌شوند که یک عامل هوشمند تخصص شما را بیش از واقع جلوه دهد.", example: "وکیل نیست، مشاور سرمایه‌گذاری نیست." },
    tr: { why: "Sınırlar, bir ajanın uzmanlığı abartmasını engeller.", example: "Avukat değil, yatırım danışmanı değil." },
  },
  "personal.story.origin": {
    fa: { why: "سرگذشت آغاز، ستون فقرات بیوگرافی بلند است و هرگز ساختگی نیست.", example: "پنج سال تدریس کردم، بعد برای مدرسه‌ام یک ابزار زمان‌بندی ساختم." },
    tr: { why: "Başlangıç hikâyesi uzun biyografinin omurgasıdır. Asla uydurulmaz.", example: "Beş yıl öğretmenlik yaptım, ardından okulum için bir planlama aracı geliştirdim." },
  },
  "personal.story.turning_points": {
    fa: { why: "نقطه‌های عطف، داستان را به‌جای کلی، مشخص می‌کنند.", example: "یک عرضه‌ی ناموفق به من یاد داد اول قیمت‌گذاری را بیازمایم." },
    tr: { why: "Dönüm noktaları hikâyeyi genel olmaktan çıkarıp özgün kılar.", example: "Başarısız bir lansman bana önce fiyatlandırmayı test etmeyi öğretti." },
  },
  "personal.story.motivation": {
    fa: { why: "انگیزه، لحن و محتوا را یکدست نگه می‌دارد.", example: "دوست دارم تصمیم‌های سخت را آرام و قابل‌تحمل کنم." },
    tr: { why: "Motivasyon, ses tonunu ve içeriği tutarlı tutar.", example: "Zor kararların sakin hissettirmesini sağlamayı seviyorum." },
  },
  "personal.story.timeline": {
    fa: { why: "گاه‌شمار تاریخ‌دار جلوی سال‌های متناقض در بیوگرافی‌ها را می‌گیرد.", example: "2016 نخستین نقش محصول؛ 2021 فعالیت مستقل." },
    tr: { why: "Tarihli bir zaman çizelgesi, biyografiler arasında çelişen yılları önler.", example: "2016 ilk ürün rolü; 2021 bağımsız çalışma." },
  },
  "personal.story.next_chapter": {
    fa: { why: "آرزوها برای محتوا مفیدند، اما نباید دستاورد به نظر برسند.", example: "آرزو: نوشتن کتابی کوتاه درباره‌ی کشف محصول." },
    tr: { why: "Hedefler içerik için faydalıdır ama başarı gibi okunmamalıdır.", example: "Hedef: keşif üzerine kısa bir kitap yazmak." },
  },
  "personal.experience.relationships": {
    fa: { why: "یک فرد می‌تواند شرکتی را بنیان بگذارد، در آن کار کند یا به آن مشاوره بدهد، بی‌آنکه مالکش باشد. نوع رابطه و تاریخ‌ها این را صریح می‌کنند.", example: "استخدام | Example Corp | 2016 | 2020؛ مشاوره | Example Labs | 2022 | تاکنون" },
    tr: { why: "Bir kişi bir şirketi sahibi olmadan kurabilir, orada çalışabilir ya da ona danışmanlık yapabilir. İlişki türü ve tarihler bunu açıkça gösterir.", example: "çalıştı | Example Corp | 2016 | 2020; danışmanlık | Example Labs | 2022 | günümüz" },
  },
  "personal.experience.roles": {
    fa: { why: "مسئولیت‌ها همان چیزی است که سوابق کاری لینکدین و مطالعه‌های موردی نقل می‌کنند.", example: "Example Corp: هدایت کشف محصول برای دو خط محصول." },
    tr: { why: "Sorumluluklar, LinkedIn deneyim kayıtlarının ve vaka çalışmalarının alıntıladığı bilgilerdir.", example: "Example Corp: iki ürün hattı için keşif çalışmalarına liderlik ettim." },
  },
  "personal.experience.highlights": {
    fa: { why: "نتایج عددی رایج‌ترین ادعای ساختگی‌اند.", example: "هدایت بازطراحی فرایند آشنایی کاربران جدید (لینک مطالعه‌ی موردی عمومی)." },
    tr: { why: "Sayısal sonuçlar en sık uydurulan iddialardır.", example: "Kullanıcı karşılama akışının yeniden tasarımına liderlik ettim (herkese açık vaka çalışması bağlantısı)." },
  },
  "personal.credibility.credentials": {
    fa: { why: "تحصیلات تأییدنشده هرگز نباید به‌عنوان تأییدشده منتشر شود.", example: "گواهی Example Studies، Example Institute، 2018 (لینک ثبت رسمی)." },
    tr: { why: "Doğrulanmamış eğitim bilgisi asla doğrulanmış olarak yayımlanmamalıdır.", example: "Example Studies sertifikası, Example Institute, 2018 (sicil bağlantısı)." },
  },
  "personal.credibility.awards": {
    fa: { why: "جوایز فقط با منبعی مستقل منتشر می‌شوند.", example: "هیچ." },
    tr: { why: "Ödüller yalnızca bağımsız bir kaynakla yayımlanır.", example: "Yok." },
  },
  "personal.credibility.evidence": {
    fa: { why: "هر ادعای عمومی باید به منبعی برسد یا آشکارا «اظهارِ مالک» باشد.", example: "ضبط سخنرانی (سابقه‌ی سخنرانی)؛ مدخل ثبت رسمی (گواهی)." },
    tr: { why: "Her kamuya açık iddia bir kaynağa dayanmalı ya da açıkça sahibinin beyanı olarak görünmelidir.", example: "Konuşma kaydı (konuşmacılık geçmişi); sicil kaydı (sertifika)." },
  },
  "personal.portfolio.projects": {
    fa: { why: "پروژه‌ی مشتری بدون اجازه قابل انتشار نیست.", example: "بازطراحی فرایند آشنایی Example، 2022، طراح ارشد، نتیجه‌ی کیفی، اجازه‌ی مشتری در انتظار." },
    tr: { why: "İzin alınmamış bir müşteri projesi yayımlanamaz.", example: "Example karşılama akışı yeniden tasarımı, 2022, baş tasarımcı, nitel sonuç, müşteri izni bekleniyor." },
  },
  "personal.reputation.testimonials": {
    fa: { why: "توصیه‌نامه‌ها به اجازه‌ی نویسنده‌شان نیاز دارند. هیچ متنی از طرف آن‌ها نوشته نمی‌شود.", example: "هنوز هیچ." },
    tr: { why: "Referanslar, veren kişinin iznini gerektirir. Onlar adına hiçbir şey taslak olarak yazılmaz.", example: "Henüz yok." },
  },
  "personal.reputation.conflicts": {
    fa: { why: "قواعد افشا هم از شخص محافظت می‌کنند و هم از مخاطب.", example: "مشاور Example Labs: هنگام صحبت درباره‌ی حوزه‌ی کاری آن‌ها افشا شود." },
    tr: { why: "Açıklama kuralları hem kişiyi hem de kitleyi korur.", example: "Example Labs danışmanı: onların kategorisi konuşulurken belirtilmeli." },
  },
  "personal.governance.public_claim_policy": {
    fa: { why: "این سیاست به هر عامل هوشمند می‌گوید چه چیزی را رد کند.", example: "نام مشتریان، اعداد، مدارک تحصیلی، اشاره‌های رسانه‌ای." },
    tr: { why: "Bu politika, her ajana neyi reddetmesi gerektiğini söyler.", example: "Müşteri adları, rakamlar, diplomalar, basında çıkan haberler." },
  },
  "personal.content.pillars": {
    fa: { why: "محورهای محتوایی، محتوا را منسجم نگه می‌دارند و آن را به جایگاه‌یابی پیوند می‌دهند.", example: "کشف محصول؛ پژوهش قیمت‌گذاری؛ آیین‌های آرام تیمی." },
    tr: { why: "İçerik sütunları içeriği tutarlı tutar ve konumlandırmaya bağlar.", example: "Keşif; fiyatlandırma araştırması; sakin ekip ritüelleri." },
  },
  "personal.content.channels": {
    fa: { why: "کانال‌هایی با اهداف متفاوت به قالب‌های متفاوت نیاز دارند.", example: "لینکدین: اعتماد مشتری. خبرنامه: عمق. وب‌سایت: درخواست‌ها." },
    tr: { why: "Farklı hedefleri olan kanallar farklı formatlar gerektirir.", example: "LinkedIn: müşteri güveni. Bülten: derinlik. Web sitesi: talepler." },
  },
  "personal.content.channel_tone": {
    fa: { why: "لحن مخصوص هر پلتفرم، گونه‌ای از همان یک صداست، نه صدایی دوم.", example: "اینستاگرام: کوتاه‌تر و گرم‌تر." },
    tr: { why: "Platforma özgü ses, ikinci bir ses değil, tek bir sesin varyasyonu olarak kalır.", example: "Instagram: daha kısa ve daha sıcak." },
  },
  "personal.goals.outcomes": {
    fa: { why: "نتیجه‌ی مطلوب، برنامه‌ی سنجش را تعیین می‌کند.", example: "دو گفت‌وگوی واجد شرایط با مشتری در هر ماه." },
    tr: { why: "Hedeflenen sonuç, ölçüm planını belirler.", example: "Ayda iki nitelikli müşteri görüşmesi." },
  },
  "personal.goals.kpis": {
    fa: { why: "عدد مبنا بدون تاریخ را بعداً نمی‌توان مقایسه کرد.", example: "تعداد فرم‌های درخواست، ماهانه. هنوز عدد مبنایی وجود ندارد." },
    tr: { why: "Tarihi olmayan bir başlangıç değeri daha sonra karşılaştırılamaz.", example: "Talep formu sayısı, aylık. Henüz başlangıç değeri yok." },
  },
  "personal.media.photo_guidelines": {
    fa: { why: "پرتره‌ها پراستفاده‌ترین دارایی شخصی‌اند.", example: "نور طبیعی، فضاهای کاری، بدون پس‌زمینه‌ی استودیویی." },
    tr: { why: "Portreler en çok yeniden kullanılan kişisel varlıktır.", example: "Doğal ışık, çalışma ortamları, stüdyo fonu yok." },
  },
  "personal.media.avoid": {
    fa: { why: "فهرست صریحِ موارد ممنوع، جلوی تصاویر ناهماهنگ با برند یا خصوصی را می‌گیرد.", example: "عکس‌های تعطیلات، تصاویر همراه خانواده، چهره‌ی ساخته‌شده با هوش مصنوعی." },
    tr: { why: "Açık bir hariç tutma listesi, markaya uymayan veya özel görselleri önler.", example: "Tatil fotoğrafları, aileyle çekilmiş görseller, yapay zekâyla üretilmiş benzerlik." },
  },
  "personal.media.portraits": {
    fa: { why: "بدون سابقه‌ی حقوق انتشار، هیچ پرتره‌ای را نمی‌توان به‌طور عمومی منتشر کرد.", example: "عکس پرسنلی 2024 اثر Example Photographer، مجوز برای وب و مطبوعات." },
    tr: { why: "Hak kaydı olmadan bir portre kamuya açık olarak yayımlanamaz.", example: "Vesikalık 2024, Example Photographer, web ve basın için lisanslı." },
  },
  "personal.media.presentation": {
    fa: { why: "ظاهر یکدست باعث می‌شود پرتره‌ها جایگزین‌پذیر باشند.", example: "رنگ‌های ساده، بدون لوگوی شرکت‌های دیگر." },
    tr: { why: "Tutarlı bir görünüm, portrelerin birbirinin yerine kullanılabilmesini sağlar.", example: "Düz renkler, başka şirketlerin logoları yok." },
  },
  "personal.media.visual_templates": {
    fa: { why: "قالب‌ها هویت بصری را به کاری تکرارپذیر تبدیل می‌کنند.", example: "قالب اصلی اسلاید و طرح کارت نقل‌قول." },
    tr: { why: "Şablonlar görsel kimliği tekrarlanabilir bir işe dönüştürür.", example: "Slayt ana şablonu ve bir alıntı kartı düzeni." },
  },
  "personal.privacy.boundaries": {
    fa: { why: "عامل‌های هوشمند به فهرستی صریح از موارد ممنوع نیاز دارند.", example: "سلامت، محل سکونت، بستگان." },
    tr: { why: "Ajanların neyi reddedeceklerine dair açık bir listeye ihtiyacı vardır.", example: "Sağlık, ev konumu, akrabalar." },
  },
  "personal.privacy.never_publish": {
    fa: { why: "منابع اغلب بیش از آنچه فرد می‌خواهد عمومی شود، اطلاعات دارند.", example: "نام کارفرمایان پیشین پیش از 2015؛ سابقه‌ی حقوق و دستمزد." },
    tr: { why: "Kaynaklar çoğu zaman kişinin kamuya açık olmasını istediğinden fazlasını içerir.", example: "2015 öncesi eski işveren adları; maaş geçmişi." },
  },
  "personal.contact.public_channels": {
    fa: { why: "راه ارتباط عمومی از اطلاعات تماس خصوصی جداست و اطلاعات خصوصی گردآوری نمی‌شود.", example: "https://example.com/contact" },
    tr: { why: "Kamuya açık iletişim, özel iletişim verilerinden ayrıdır; özel veriler toplanmaz.", example: "https://example.com/contact" },
  },
  "personal.governance.reviewer": {
    fa: { why: "تأیید نهایی با خود فرد است. بازبین‌ها فقط نظر می‌دهند.", example: "هیچ‌کس. همه‌چیز را خودم بازبینی می‌کنم." },
    tr: { why: "Onay kişinin kendisinde kalır. İnceleyenler yalnızca yorum yapar.", example: "Kimse. Her şeyi kendim incelerim." },
  },
  "personal.privacy.availability": {
    fa: { why: "در دسترس بودن تغییر می‌کند؛ ادعای کهنه گمراه‌کننده است.", example: "پذیرش دو مشتری مشاوره از فصل آینده." },
    tr: { why: "Müsaitlik değişir; güncelliğini yitirmiş bir iddia yanıltır.", example: "Gelecek çeyrekten itibaren iki danışmanlık müşterisi kabul ediliyor." },
  },
  "personal.founder.ventures": {
    fa: { why: "ادعاهای بنیان‌گذاری از پرتکرارترین ادعاها هستند، پس باید دقیق باشند.", example: "Example Studio: هم‌بنیان‌گذار، مدیر محصول." },
    tr: { why: "Kuruculuk iddiaları en çok tekrarlanan iddialar arasındadır; bu yüzden kesin olmalıdır.", example: "Example Studio: kurucu ortak, ürün lideri." },
  },
  "personal.founder.narrative": {
    fa: { why: "روایت بنیان‌گذار در رسانه‌ها، ارائه به سرمایه‌گذار و صفحه‌های «درباره‌ی ما» دوباره به کار می‌رود.", example: "مدام می‌دیدم معلم‌ها ساعت‌ها وقتشان را صرف زمان‌بندی می‌کنند." },
    tr: { why: "Kurucu anlatısı basında, yatırımcı sunumlarında ve hakkımızda sayfalarında yeniden kullanılır.", example: "Öğretmenlerin planlama işlerine saatler kaybettiğini sürekli görüyordum." },
  },
  "personal.founder.sectors": {
    fa: { why: "حوزه‌ها تعیین می‌کنند کدام فرصت‌های رسانه‌ای و اجتماعی مناسب‌اند.", example: "فناوری آموزشی، ابزارهای کسب‌وکارهای کوچک." },
    tr: { why: "Sektörler, hangi basın ve topluluk fırsatlarının uygun olduğunu belirler.", example: "Eğitim teknolojisi, küçük işletme araçları." },
  },
  "personal.founder.leadership_topics": {
    fa: { why: "محتوای رهبری به نمونه‌های زیسته نیاز دارد، نه توصیه‌های کلی.", example: "استخدام نخستین تیم محصول؛ اجرای چرخه‌های برنامه‌ریزی آرام." },
    tr: { why: "Liderlik içeriği genel tavsiyelere değil, yaşanmış örneklere ihtiyaç duyar.", example: "İlk ürün ekibini işe almak; sakin planlama döngüleri yürütmek." },
  },
  "personal.founder.investor_relations": {
    fa: { why: "اظهارات درباره‌ی تأمین مالی مشمول مقررات‌اند و اغلب محرمانه.", example: "بگویید «با حمایت سرمایه‌گذاران فرشته»؛ بدون ذکر مبلغ." },
    tr: { why: "Finansmanla ilgili açıklamalar düzenlemeye tabidir ve çoğu zaman gizlidir.", example: "“Melek yatırımcılar tarafından destekleniyor” deyin; tutar belirtmeyin." },
  },
  "personal.consulting.methodology": {
    fa: { why: "روشی که نام دارد، یک خدمت را ملموس می‌کند.", example: "مصاحبه، ترسیم نقشه‌ی تصمیم‌ها، اولویت‌بندی، تحویل یک برنامه." },
    tr: { why: "Adı konmuş bir yöntem, bir hizmeti somut hâle getirir.", example: "Görüşme yap, kararları haritalandır, önceliklendir, bir plan teslim et." },
  },
  "personal.consulting.engagements": {
    fa: { why: "قالب‌های همکاری پیش از نخستین تماس، انتظارات را روشن می‌کنند.", example: "اسپرینت دوهفته‌ای؛ قرارداد مشاوره‌ی ماهانه." },
    tr: { why: "Çalışma biçimleri, ilk görüşmeden önce beklentileri belirler.", example: "İki haftalık sprint; aylık danışmanlık anlaşması." },
  },
  "personal.consulting.target_clients": {
    fa: { why: "معیارهای تناسب، جذب مشتری را صادقانه نگه می‌دارند.", example: "تیم‌های نرم‌افزاری مرحله‌ی بذر؛ نه آژانس‌ها." },
    tr: { why: "Uygunluk kriterleri, müşteri kazanımını dürüst tutar.", example: "Tohum aşamasındaki yazılım ekipleri; ajanslar değil." },
  },
  "personal.consulting.pricing_policy": {
    fa: { why: "قیمت ساختگی یا کهنه، ادعای عمومی نادرست است.", example: "On request." },
    tr: { why: "Uydurulmuş veya güncelliğini yitirmiş bir fiyat, yanlış bir kamuya açık iddiadır.", example: "On request." },
  },
  "personal.consulting.confidentiality": {
    fa: { why: "نام و جزئیات مشتریان خصوصی است، مگر آنکه اجازه ثبت شده باشد.", example: "نام هیچ مشتری‌ای بدون اجازه‌ی کتبی برده نمی‌شود." },
    tr: { why: "Müşteri adları ve ayrıntıları, izin kaydedilmedikçe özeldir.", example: "Yazılı izin olmadan hiçbir müşterinin adı verilmez." },
  },
  "personal.consulting.cta": {
    fa: { why: "در هر صفحه، یک گام بعدی روشن.", example: "یک تماس معرفی 20 دقیقه‌ای رزرو کنید." },
    tr: { why: "Her sayfada tek ve net bir sonraki adım.", example: "20 dakikalık bir tanışma görüşmesi ayarlayın." },
  },
  "personal.creator.series": {
    fa: { why: "مجموعه‌ها تقویم محتوایی را ممکن می‌کنند.", example: "ویدیوی کوتاه هفتگی، مقاله‌ی بلند ماهانه." },
    tr: { why: "Seriler bir yayın takvimini mümkün kılar.", example: "Haftalık kısa video, aylık uzun makale." },
  },
  "personal.creator.audience_segments": {
    fa: { why: "اسپانسرها و ویراستاران می‌پرسند مخاطب کیست.", example: "لینکدین: بنیان‌گذاران. یوتیوب: دانشجویان." },
    tr: { why: "Sponsorlar ve editörler kitlenin kim olduğunu sorar.", example: "LinkedIn: kurucular. YouTube: öğrenciler." },
  },
  "personal.creator.metrics": {
    fa: { why: "آمار بدون تاریخ یا منبع منتشر نمی‌شود.", example: "1,200 مشترک خبرنامه تا 2025-01 (خروجی پلتفرم)." },
    tr: { why: "Tarihsiz veya kaynaksız metrikler yayımlanmaz.", example: "2025-01 itibarıyla 1,200 bülten abonesi (platform dışa aktarımı)." },
  },
  "personal.creator.sponsorship": {
    fa: { why: "فهرست موارد ردشده، اعتماد مخاطب را حفظ می‌کند.", example: "می‌پذیرم: ابزارهای نرم‌افزاری. نمی‌پذیرم: قمار، معامله‌ی رمزارز." },
    tr: { why: "Bir ret listesi kitlenin güvenini korur.", example: "Kabul: yazılım araçları. Ret: kumar, kripto para alım satımı." },
  },
  "personal.creator.disclosure": {
    fa: { why: "افشا در بسیاری از جاها الزامی قانونی و شرط اعتماد است.", example: "برچسب «حمایت‌شده» در خط اول هر پست پولی." },
    tr: { why: "Açıklama yapmak birçok yerde hem yasal bir gereklilik hem de güven şartıdır.", example: "Her ücretli gönderinin ilk satırında “Sponsorlu” etiketi." },
  },
  "personal.artist.practice": {
    fa: { why: "بیانیه‌ی رویکرد هنری، پایه‌ی بیوگرافی هنرمند است.", example: "آثار هندسی آرام درباره‌ی فضاهای عمومی." },
    tr: { why: "Pratik beyanı, sanatçı biyografisinin dayanağıdır.", example: "Kamusal alanlar üzerine sakin geometrik çalışmalar." },
  },
  "personal.artist.aesthetic": {
    fa: { why: "ویراستاران و کیوریتورها همین واژگان را دوباره به کار می‌برند.", example: "استفاده شود: خویشتن‌دار، معمارانه. پرهیز شود: مینیمالیستی." },
    tr: { why: "Editörler ve küratörler bu kelime dağarcığını yeniden kullanır.", example: "Kullanın: ölçülü, mimari. Kaçının: minimalist." },
  },
  "personal.artist.portfolio_taxonomy": {
    fa: { why: "دسته‌بندی، پیمایش نمونه‌کارها را ممکن می‌کند.", example: "هویت بصری، تحریریه، پروژه‌های شخصی." },
    tr: { why: "Bir sınıflandırma, portfolyoyu gezilebilir kılar.", example: "Kimlik, editoryal, kişisel projeler." },
  },
  "personal.artist.exhibitions": {
    fa: { why: "سابقه‌ی نمایشگاه‌ها را کیوریتورها بررسی می‌کنند.", example: "نمایشگاه گروهی، Example Gallery، 2023 (صفحه‌ی گالری)." },
    tr: { why: "Sergi geçmişi küratörler tarafından kontrol edilir.", example: "Karma sergi, Example Gallery, 2023 (galeri sayfası)." },
  },
  "personal.artist.usage_rights": {
    fa: { why: "حقوق استفاده تعیین می‌کند چه چیزی و توسط چه کسی منتشر شود.", example: "ذکر نام الزامی است؛ استفاده‌ی تجاری بدون مجوز ممنوع." },
    tr: { why: "Haklar, neyin ve kim tarafından yayımlanabileceğini belirler.", example: "Kaynak gösterilmesi zorunlu; lisans olmadan ticari kullanım yok." },
  },
  "personal.speaking.topics": {
    fa: { why: "برگزارکنندگان بر اساس موضوع جست‌وجو می‌کنند.", example: "کشف محصول؛ پژوهش قیمت‌گذاری." },
    tr: { why: "Organizatörler konuya göre arama yapar.", example: "Ürün keşfi; fiyatlandırma araştırması." },
  },
  "personal.speaking.abstracts": {
    fa: { why: "چکیده‌ها عیناً در برنامه‌ی رویدادها کپی می‌شوند.", example: "تصمیم پیش از نقشه‌ی راه: چرا تیم‌ها کار اشتباه را برنامه‌ریزی می‌کنند." },
    tr: { why: "Özetler etkinlik programlarına kelimesi kelimesine kopyalanır.", example: "Yol haritasından önce kararlar: ekipler neden yanlış işi planlar." },
  },
  "personal.speaking.languages": {
    fa: { why: "زبان، یکی از محدودیت‌های دعوت به سخنرانی است.", example: "انگلیسی و ترکی." },
    tr: { why: "Dil, konuşmacı davetinde bir kısıttır.", example: "İngilizce ve Türkçe." },
  },
  "personal.speaking.prior_talks": {
    fa: { why: "سابقه‌ی سخنرانیِ تأییدنشده به‌عنوان تأییدشده منتشر نمی‌شود.", example: "Example Conf 2023 (لینک ضبط)." },
    tr: { why: "Doğrulanmamış konuşmacılık geçmişi doğrulanmış olarak yayımlanmaz.", example: "Example Conf 2023 (kayıt bağlantısı)." },
  },
  "personal.speaking.introduction": {
    fa: { why: "وقتی متن معرفی در دست نباشد، مجری‌ها بداهه‌گویی می‌کنند.", example: "Alex Example به تیم‌های نوپا کمک می‌کند پیش از ساختن، تصمیم بگیرند." },
    tr: { why: "Bir tanıtım metni verilmediğinde sunucular doğaçlama yapar.", example: "Alex Example, erken aşama ekiplerin bir şey inşa etmeden önce karar vermesine yardımcı olur." },
  },
  "personal.author.publications": {
    fa: { why: "سابقه‌ی انتشارات را ویراستاران و برگزارکنندگان بررسی می‌کنند.", example: "هیچ." },
    tr: { why: "Yayın geçmişi editörler ve organizatörler tarafından kontrol edilir.", example: "Yok." },
  },
}
