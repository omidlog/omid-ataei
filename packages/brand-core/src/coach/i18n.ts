import type { Locale } from '../i18n.js'
import { COACH_CRITERIA, COACH_FINDING_CODES, COACH_RULE_CHECK_OUTCOMES, COACH_STATUSES, type CoachCriterion, type CoachFindingCode, type CoachRuleCheckOutcome, type CoachStatus } from './model.js'

/** Tension rules that carry an explanatory question. Mirrors the tension entries of `COACH_REGISTRY_RULES`. */
export const COACH_TENSION_RULES = ['premium-vs-lowest-price', 'availability-held-back'] as const
export type CoachTensionRule = (typeof COACH_TENSION_RULES)[number]

/**
 * The coach's human text in en, fa (RTL) and tr.
 *
 * English is the base; fa and tr are locale data with equal standing and are written as professional
 * advice, not as word-for-word translations of the labels. Every finding code and every criterion has an
 * entry in all three locales; `tests/coach-core.test.ts` fails when one is missing.
 *
 * Placeholders are filled from closed-vocabulary values only: question ids, coach lexicon terms, document
 * paths, rule names, counts and criterion names. The owner's answer is never interpolated.
 */

export interface CoachPhrase {
  reason: string
  improvement: string | null
}

type Table = Record<CoachFindingCode, CoachPhrase>

const EN: Table = {
  question_not_applicable: {
    reason: '{question} does not apply to this brand right now ({why}; condition: {condition}), so it is not applicable rather than missing.',
    improvement: null,
  },
  answer_missing: {
    reason: '{question} has no live answer in the ledger, so there is nothing to assess yet.',
    improvement: 'Answer it when you are ready: npm run brand:interview -- --question {question}',
  },
  answer_disposition: {
    reason: '{question} is recorded as {status}. That is an explicit decision of yours, so the coach treats the field as settled and asks nothing further.',
    improvement: null,
  },
  placeholder_value: {
    reason: 'The stored value for {question} is one of the template placeholders, not a decision of yours.',
    improvement: 'Replace it with your own wording, or record unknown so the field is honestly open instead of looking answered.',
  },
  vague_terms: {
    reason: 'The answer to {question} is short and rests on general wording ({terms}). No document can turn that into a specific claim.',
    improvement: 'Name the one case you actually mean: which group, in which situation, with which problem.',
  },
  too_brief_for_output: {
    reason: 'The answer to {question} has {words} content word(s); below {min} there is not enough for the sections it feeds.',
    improvement: 'Add the missing half in one more sentence: what it is, who it is for, and why that matters here.',
  },
  linked_question_open: {
    reason: '{question} is answered, but the linked question(s) it builds on are still open: {ids}. The document section stays incomplete until they are settled.',
    improvement: 'Answer {ids} next. These are existing interview questions; the coach adds none.',
  },
  missing_measure: {
    reason: '{question} asks for a measure, and the stored answer carries no figure, period or unit.',
    improvement: 'State the figure you actually have, with its period and unit. If you do not have one, record unknown rather than an estimate that reads like a fact.',
  },
  evidence_not_verified: {
    reason: '{question} is a claim that needs verified evidence before public use, and the evidence register holds no current, independent source for it.',
    improvement: 'Record a source: npm run brand:evidence -- add --claim {question}. Verifying it stays your step.',
  },
  evidence_owner_stated_only: {
    reason: 'Only your own testimony supports {question}. That is a valid statement of yours; it is not independent verification, and publication needs the latter.',
    improvement: 'Add a source someone outside could check, then verify it: npm run brand:evidence -- add --claim {question}',
  },
  field_in_open_conflict: {
    reason: '{question} appears in {count} open contradiction(s) from the interview rules ({rules}). The coach reports them; it did not create or widen them.',
    improvement: 'Decide which field is right, then correct the other through the normal change flow so the diff is visible.',
  },
  meets_criteria: {
    reason: 'The answer to {question} passes every criterion the coach can check without a model: {criteria}. This is a check on the data, not a judgement of your decision.',
    improvement: null,
  },
  facet_ownership_separate: {
    reason: '{question} uses ownership wording. For a {facet} profile a role (founder, lead, adviser) never implies ownership: ownership is a separate statement that needs its own evidence.',
    improvement: 'Keep {question} to the role, and record ownership in {canonical} with an explicit ownership state.',
  },
  facet_companion_open: {
    reason: '{question} is answered, but for a {facet} profile it can only be used once {canonical} is settled, and that question is still open ({rubric}).',
    improvement: 'Answer {canonical} next: npm run brand:interview -- --question {canonical}',
  },
  facet_claim_undated: {
    reason: '{question} is a public track-record claim for a {facet} profile, and the answer gives no year. Undated numbers and history are not published.',
    improvement: 'Add the year (and the month for audience numbers) to each item, then record its source: npm run brand:evidence -- add --claim {question}',
  },
  follow_up_canonical: {
    reason: 'The gap after {question} is {criterion}, and the interview already owns a question for it: {canonical}. Asking that one keeps a single canonical answer.',
    improvement: 'Ask {canonical} next: npm run brand:interview -- --question {canonical}',
  },
  follow_up_clarify: {
    reason: 'One clarifying question would make {question} usable for {outputs}. The missing dimension is {criterion}, and no existing question covers it.',
    improvement: 'Answer in your own words, or reply skip, unknown or decide later — the coach will not ask again for this answer.',
  },
  follow_up_none: {
    reason: 'Nothing to ask about {question}: {why}',
    improvement: null,
  },
  consistency_rule: {
    reason: 'The interview rule {rule} reports a conflict between {ids}. This is the existing deterministic rule, reported unchanged.',
    improvement: 'Settle which field is right with the owner, then correct the other through the change flow.',
  },
  consistency_tension: {
    reason: 'Rule {rule}: {ids} can both be true, but they often pull in different directions. This is a possible trade-off, not a contradiction, and nothing is wrong unless you decide it is.',
    improvement: 'Answer the suggested question in one sentence, or leave it as it is: a deliberate trade-off is a valid decision.',
  },
  consistency_verification: {
    reason: 'Rule {rule}: {ids} makes a claim that needs a source, and the evidence register holds no current independent source for it. The claim stays unverified; the coach cannot verify anything.',
    improvement: 'Record a source and verify it: npm run brand:evidence -- add --claim {ids}. Until then, do not repeat the claim publicly.',
  },
  consistency_none: {
    reason: 'No contradiction, possible trade-off or unverified claim was found across the {count} answered question(s) the coach read. Rules that could not run are listed as not tested.',
    improvement: null,
  },
}

const FA: Table = {
  question_not_applicable: {
    reason: '{question} در حال حاضر به این برند مربوط نمی‌شود ({why}؛ شرط: {condition})؛ پس «نامرتبط» است، نه «جامانده».',
    improvement: null,
  },
  answer_missing: {
    reason: 'برای {question} هیچ پاسخ فعالی در دفتر ثبت نشده است؛ پس هنوز چیزی برای ارزیابی وجود ندارد.',
    improvement: 'هر وقت آماده بودید پاسخ دهید: npm run brand:interview -- --question {question}',
  },
  answer_disposition: {
    reason: '{question} با وضعیت {status} ثبت شده است. این تصمیم صریح خودتان است؛ پس مربی این فیلد را بسته‌شده می‌داند و پرسش دیگری نمی‌کند.',
    improvement: null,
  },
  placeholder_value: {
    reason: 'مقدار ذخیره‌شده برای {question} یکی از جانگهدارهای قالب است، نه تصمیم شما.',
    improvement: 'آن را با واژگان خودتان جایگزین کنید، یا unknown ثبت کنید تا فیلد صادقانه باز بماند و پاسخ‌داده‌شده به نظر نرسد.',
  },
  vague_terms: {
    reason: 'پاسخ {question} کوتاه است و بر واژگان عمومی تکیه دارد ({terms}). هیچ سندی نمی‌تواند از این متن یک ادعای مشخص بسازد.',
    improvement: 'همان یک مورد واقعی را نام ببرید: کدام گروه، در کدام موقعیت، با کدام مسئله.',
  },
  too_brief_for_output: {
    reason: 'پاسخ {question} {words} واژهٔ محتوایی دارد؛ کمتر از {min} واژه برای بخش‌هایی که این فیلد تغذیه می‌کند کافی نیست.',
    improvement: 'نیمهٔ جامانده را در یک جملهٔ دیگر اضافه کنید: چه چیزی، برای چه کسی، و چرا اینجا مهم است.',
  },
  linked_question_open: {
    reason: '{question} پاسخ دارد، اما پرسش‌های پیوندی که بر آن‌ها بنا شده هنوز باز است: {ids}. تا تعیین‌تکلیف آن‌ها، بخش سند ناقص می‌ماند.',
    improvement: 'در گام بعد به {ids} پاسخ دهید. این‌ها پرسش‌های موجود مصاحبه‌اند؛ مربی پرسشی نمی‌افزاید.',
  },
  missing_measure: {
    reason: '{question} یک سنجه می‌خواهد و پاسخ ذخیره‌شده هیچ رقم، دوره یا واحدی ندارد.',
    improvement: 'همان رقمی را بنویسید که واقعاً دارید، همراه با دوره و واحدش. اگر رقمی ندارید، به‌جای برآوردی که مثل واقعیت خوانده می‌شود، unknown ثبت کنید.',
  },
  evidence_not_verified: {
    reason: '{question} ادعایی است که پیش از استفادهٔ عمومی به شهود تأییدشده نیاز دارد و در دفتر شهود هیچ منبع مستقل و معتبری برای آن نیست.',
    improvement: 'یک منبع ثبت کنید: npm run brand:evidence -- add --claim {question}. تأیید آن گام خودتان می‌ماند.',
  },
  evidence_owner_stated_only: {
    reason: 'تنها گفتهٔ خودتان پشتیبان {question} است. این یک بیان معتبر از سوی شماست، اما تأیید مستقل نیست و انتشار به تأیید مستقل نیاز دارد.',
    improvement: 'منبعی اضافه کنید که کسی بیرون از سازمان بتواند بررسی کند، سپس تأییدش کنید: npm run brand:evidence -- add --claim {question}',
  },
  field_in_open_conflict: {
    reason: '{question} در {count} تناقض باز از قواعد مصاحبه دیده می‌شود ({rules}). مربی فقط گزارش می‌دهد؛ این تناقض‌ها را نساخته و بزرگ‌تر نکرده است.',
    improvement: 'تصمیم بگیرید کدام فیلد درست است، سپس دیگری را از مسیر عادی تغییر اصلاح کنید تا تفاوت دیده شود.',
  },
  meets_criteria: {
    reason: 'پاسخ {question} همهٔ معیارهایی را که مربی بدون مدل می‌تواند بسنجد می‌گذراند: {criteria}. این بررسیِ داده است، نه داوری دربارهٔ تصمیم شما.',
    improvement: null,
  },
  facet_ownership_separate: {
    reason: 'در {question} واژگان مالکیت آمده است. در پروفایل {facet}، نقش (بنیان‌گذار، مدیر، مشاور) هرگز به معنای مالکیت نیست؛ مالکیت جملهٔ جداگانه‌ای است که شاهد خودش را می‌خواهد.',
    improvement: '{question} را فقط به نقش محدود کنید و مالکیت را با وضعیت صریح در {canonical} ثبت کنید.',
  },
  facet_companion_open: {
    reason: '{question} پاسخ دارد، اما در پروفایل {facet} فقط وقتی قابل استفاده است که {canonical} روشن شده باشد، و آن پرسش هنوز باز است ({rubric}).',
    improvement: 'در گام بعد به {canonical} پاسخ دهید: npm run brand:interview -- --question {canonical}',
  },
  facet_claim_undated: {
    reason: '{question} در پروفایل {facet} یک ادعای عمومی دربارهٔ سابقه است و پاسخ هیچ سالی ندارد. عدد و سابقهٔ بدون تاریخ منتشر نمی‌شود.',
    improvement: 'برای هر مورد سال (و برای آمار مخاطب، ماه) را بنویسید و منبعش را ثبت کنید: npm run brand:evidence -- add --claim {question}',
  },
  follow_up_canonical: {
    reason: 'شکافِ بعد از {question} «{criterion}» است و مصاحبه از قبل پرسشی برای آن دارد: {canonical}. پرسیدن همان، یک پاسخ مرجع را حفظ می‌کند.',
    improvement: 'در گام بعد {canonical} را بپرسید: npm run brand:interview -- --question {canonical}',
  },
  follow_up_clarify: {
    reason: 'یک پرسش روشن‌کننده {question} را برای {outputs} قابل‌استفاده می‌کند. بُعد جامانده «{criterion}» است و هیچ پرسش موجودی آن را نمی‌پوشاند.',
    improvement: 'با واژگان خودتان پاسخ دهید، یا skip، unknown یا decide later بگویید — مربی برای این پاسخ دوباره نمی‌پرسد.',
  },
  follow_up_none: {
    reason: 'دربارهٔ {question} چیزی برای پرسیدن نیست: {why}',
    improvement: null,
  },
  consistency_rule: {
    reason: 'قاعدهٔ مصاحبهٔ {rule} یک تناقض میان {ids} گزارش می‌کند. این همان قاعدهٔ قطعیِ موجود است که بی‌تغییر بازگو می‌شود.',
    improvement: 'با مالک روشن کنید کدام فیلد درست است، سپس دیگری را از مسیر تغییر اصلاح کنید.',
  },
  consistency_tension: {
    reason: 'قاعدهٔ {rule}: {ids} می‌توانند هم‌زمان درست باشند، اما اغلب در دو جهت مختلف می‌کشند. این یک بده‌بستان احتمالی است، نه تناقض، و تا شما تصمیم نگیرید چیزی نادرست نیست.',
    improvement: 'به پرسش پیشنهادی در یک جمله پاسخ دهید، یا همین‌طور بگذارید بماند: بده‌بستانِ آگاهانه یک تصمیم معتبر است.',
  },
  consistency_verification: {
    reason: 'قاعدهٔ {rule}: {ids} ادعایی دارد که منبع می‌خواهد، و در دفتر شواهد هیچ منبع مستقل و به‌روزی برای آن نیست. این ادعا تأییدنشده می‌ماند؛ مربی نمی‌تواند چیزی را تأیید کند.',
    improvement: 'یک منبع ثبت و تأیید کنید: npm run brand:evidence -- add --claim {ids}. تا آن زمان این ادعا را در متن عمومی تکرار نکنید.',
  },
  consistency_none: {
    reason: 'در {count} پرسشِ پاسخ‌داده‌شده‌ای که مربی خواند، هیچ تناقض، بده‌بستان احتمالی یا ادعای تأییدنشده‌ای پیدا نشد. قاعده‌هایی که نتوانستند اجرا شوند «آزموده نشد» فهرست شده‌اند.',
    improvement: null,
  },
}

const TR: Table = {
  question_not_applicable: {
    reason: '{question} şu anda bu marka için geçerli değil ({why}; koşul: {condition}); yani eksik değil, uygulanamaz.',
    improvement: null,
  },
  answer_missing: {
    reason: '{question} için defterde canlı bir yanıt yok; bu yüzden değerlendirilecek bir şey de yok.',
    improvement: 'Hazır olduğunuzda yanıtlayın: npm run brand:interview -- --question {question}',
  },
  answer_disposition: {
    reason: '{question} {status} olarak kayıtlı. Bu sizin açık kararınız; koç alanı kapanmış sayar ve başka soru sormaz.',
    improvement: null,
  },
  placeholder_value: {
    reason: '{question} için saklanan değer şablonun yer tutucularından biri, sizin kararınız değil.',
    improvement: 'Kendi sözlerinizle değiştirin ya da unknown kaydedin; böylece alan yanıtlanmış görünmek yerine dürüstçe açık kalır.',
  },
  vague_terms: {
    reason: '{question} yanıtı kısa ve genel ifadelere dayanıyor ({terms}). Hiçbir belge bundan belirli bir iddia üretemez.',
    improvement: 'Gerçekte kastettiğiniz tek durumu adlandırın: hangi grup, hangi durumda, hangi sorunla.',
  },
  too_brief_for_output: {
    reason: '{question} yanıtında {words} içerik sözcüğü var; {min} sözcüğün altında, beslediği bölümler için yeterli değil.',
    improvement: 'Eksik yarıyı bir cümle daha ile ekleyin: nedir, kim için, ve burada neden önemli.',
  },
  linked_question_open: {
    reason: '{question} yanıtlandı, ama dayandığı bağlantılı soru(lar) hâlâ açık: {ids}. Bunlar çözülmedikçe belge bölümü eksik kalır.',
    improvement: 'Sırada {ids} var. Bunlar görüşmenin mevcut soruları; koç yeni soru eklemez.',
  },
  missing_measure: {
    reason: '{question} bir ölçü istiyor ve saklanan yanıtta sayı, dönem ya da birim yok.',
    improvement: 'Gerçekten sahip olduğunuz sayıyı dönemi ve birimiyle yazın. Sayı yoksa, olgu gibi okunan bir tahmin yerine unknown kaydedin.',
  },
  evidence_not_verified: {
    reason: '{question} kamuya açık kullanımdan önce doğrulanmış kanıt gerektiren bir iddia ve kanıt defterinde güncel, bağımsız bir kaynak yok.',
    improvement: 'Bir kaynak kaydedin: npm run brand:evidence -- add --claim {question}. Doğrulama sizin adımınız olarak kalır.',
  },
  evidence_owner_stated_only: {
    reason: '{question} yalnızca kendi beyanınıza dayanıyor. Bu sizin geçerli ifadenizdir; bağımsız doğrulama değildir ve yayın bunu gerektirir.',
    improvement: 'Dışarıdan birinin kontrol edebileceği bir kaynak ekleyin, sonra doğrulayın: npm run brand:evidence -- add --claim {question}',
  },
  field_in_open_conflict: {
    reason: '{question}, görüşme kurallarından gelen {count} açık çelişkide görünüyor ({rules}). Koç yalnızca bildirir; bu çelişkileri ne yarattı ne büyüttü.',
    improvement: 'Hangi alanın doğru olduğuna karar verin, sonra diğerini normal değişiklik akışıyla düzeltin ki fark görünür olsun.',
  },
  meets_criteria: {
    reason: '{question} yanıtı, koçun modelsiz denetleyebildiği tüm ölçütleri geçiyor: {criteria}. Bu veriye dair bir denetim, kararınıza dair bir yargı değil.',
    improvement: null,
  },
  facet_ownership_separate: {
    reason: '{question} sahiplik ifadesi içeriyor. {facet} profilinde bir rol (kurucu, yönetici, danışman) asla sahiplik anlamına gelmez; sahiplik kendi kanıtını gerektiren ayrı bir ifadedir.',
    improvement: '{question} alanını yalnızca role ayırın; sahipliği açık bir sahiplik durumuyla {canonical} içinde kaydedin.',
  },
  facet_companion_open: {
    reason: '{question} yanıtlanmış, ancak {facet} profilinde ancak {canonical} netleştiğinde kullanılabilir ve o soru hâlâ açık ({rubric}).',
    improvement: 'Sıradaki soru {canonical}: npm run brand:interview -- --question {canonical}',
  },
  facet_claim_undated: {
    reason: '{question}, {facet} profili için kamuya açık bir geçmiş iddiasıdır ve yanıtta yıl yok. Tarihsiz sayılar ve geçmiş yayımlanmaz.',
    improvement: 'Her maddeye yılı (kitle sayıları için ayı da) ekleyin ve kaynağını kaydedin: npm run brand:evidence -- add --claim {question}',
  },
  follow_up_canonical: {
    reason: '{question} sonrasındaki boşluk «{criterion}» ve görüşmede bunun için zaten bir soru var: {canonical}. Onu sormak tek bir asli yanıtı korur.',
    improvement: 'Sırada {canonical} olsun: npm run brand:interview -- --question {canonical}',
  },
  follow_up_clarify: {
    reason: 'Tek bir açıklayıcı soru {question} yanıtını {outputs} için kullanılabilir kılar. Eksik boyut «{criterion}» ve mevcut hiçbir soru onu kapsamıyor.',
    improvement: 'Kendi sözlerinizle yanıtlayın ya da skip, unknown veya decide later deyin — koç bu yanıt için bir daha sormaz.',
  },
  follow_up_none: {
    reason: '{question} hakkında sorulacak bir şey yok: {why}',
    improvement: null,
  },
  consistency_rule: {
    reason: 'Görüşme kuralı {rule}, {ids} arasında bir çelişki bildiriyor. Bu, mevcut belirlenimci kuralın olduğu gibi aktarılmasıdır.',
    improvement: 'Hangi alanın doğru olduğunu sahiple netleştirin, sonra diğerini değişiklik akışıyla düzeltin.',
  },
  consistency_tension: {
    reason: '{rule} kuralı: {ids} aynı anda doğru olabilir, ancak çoğu zaman farklı yönlere çeker. Bu bir çelişki değil, olası bir ödünleşimdir; siz öyle karar vermedikçe yanlış bir şey yok.',
    improvement: 'Önerilen soruyu tek cümleyle yanıtlayın ya da olduğu gibi bırakın: bilinçli bir ödünleşim geçerli bir karardır.',
  },
  consistency_verification: {
    reason: '{rule} kuralı: {ids} kaynak gerektiren bir iddia içeriyor ve kanıt kaydında bunun için güncel, bağımsız bir kaynak yok. İddia doğrulanmamış kalır; koç hiçbir şeyi doğrulayamaz.',
    improvement: 'Bir kaynak kaydedip doğrulayın: npm run brand:evidence -- add --claim {ids}. O zamana kadar iddiayı kamuya açık metinde tekrarlamayın.',
  },
  consistency_none: {
    reason: 'Koçun okuduğu {count} yanıtlanmış soruda çelişki, olası ödünleşim ya da doğrulanmamış iddia bulunmadı. Çalıştırılamayan kurallar test edilmedi olarak listelenir.',
    improvement: null,
  },
}

export const COACH_TEXT: Record<Locale, Table> = { en: EN, fa: FA, tr: TR }

/**
 * The one clarifying question the coach asks when no canonical question covers the gap: the general wording per
 * criterion. A question family can override it (`CLARIFY_FAMILY_QUESTIONS`), so a boundaries question never gets
 * an audience-style follow-up. Read it through `clarifyQuestion`, never by indexing this table directly.
 */
export const CLARIFY_QUESTIONS: Record<Locale, Record<CoachCriterion, string>> = {
  en: {
    relevance: 'Setting the placeholder aside: in one sentence, what is your actual answer here?',
    specificity: 'Can you name one concrete example (a situation, a piece of work or a result) that shows what you mean?',
    completeness_for_output: 'What would you add so this can be used without anyone guessing the rest?',
    measurability: 'What figure do you actually have for this, and over what period?',
    evidence_support: 'Which public source, such as a registry, a publication or a client\'s own page, could someone else check for this claim?',
    clarity_coherence: 'Of the two statements that disagree, which one should stand, and why?',
  },
  fa: {
    relevance: 'جانگهدار را کنار بگذاریم: در یک جمله، پاسخ واقعی شما اینجا چیست؟',
    specificity: 'می‌توانید یک نمونهٔ مشخص بیاورید، مثلاً یک موقعیت، یک کار یا یک نتیجه، که منظورتان را نشان دهد؟',
    completeness_for_output: 'چه چیزی اضافه می‌کنید تا بتوان این را بدون حدس‌زدن بقیه‌اش به کار برد؟',
    measurability: 'واقعاً چه رقمی برای این دارید و در چه دوره‌ای؟',
    evidence_support: 'کس دیگری این ادعا را از کدام منبع عمومی می‌تواند بررسی کند؟ مثلاً یک ثبت رسمی، یک نشریه یا صفحهٔ خود مشتری.',
    clarity_coherence: 'از آن دو گزاره که با هم نمی‌خوانند، کدام باید بماند و چرا؟',
  },
  tr: {
    relevance: 'Yer tutucuyu bir yana bırakalım: tek cümleyle, buradaki gerçek yanıtınız nedir?',
    specificity: 'Ne demek istediğinizi gösteren somut bir örnek verebilir misiniz: bir durum, bir iş ya da bir sonuç?',
    completeness_for_output: 'Geri kalanı kimse tahmin etmeden kullanılabilsin diye ne eklerdiniz?',
    measurability: 'Bunun için gerçekte hangi sayıya sahipsiniz ve hangi dönem için?',
    evidence_support: 'Bu iddiayı başka biri hangi kamuya açık kaynaktan kontrol edebilir? Örneğin bir sicil kaydı, bir yayın ya da müşterinin kendi sayfası.',
    clarity_coherence: 'Birbiriyle çelişen iki ifadeden hangisi kalmalı ve neden?',
  },
}

/**
 * Question families whose clarifying question differs from the general one. Derived from the question id only,
 * so a moment rendered later (in another locale) picks the same family.
 *
 * - `audience`: who the brand serves (segments, buyers, target clients, their pains);
 * - `boundaries`: what is off-limits (boundaries, things to avoid or never publish, misuse, guardrails);
 * - `general`: everything else.
 *
 * Audit (coach-rules/6): only `specificity` is family-specific. `relevance`, `completeness_for_output`,
 * `measurability` and `clarity_coherence` are worded for any question; `evidence_support` names no company, so it
 * fits a person as well as a business.
 */
export const COACH_QUESTION_FAMILIES = ['audience', 'boundaries', 'general'] as const
export type CoachQuestionFamily = (typeof COACH_QUESTION_FAMILIES)[number]

const AUDIENCE_ID = /(?:^|[._])(?:audience|segment|segments|customer|buyer|target_clients|persona|personas|icp|pains)(?:$|[._])/
const BOUNDARIES_ID = /(?:^|[._])(?:boundaries|never_publish|avoid|forbidden|misuse|unacceptable|guardrail|confidentiality|public_claim_policy)(?:$|[._])/

export function questionFamily(questionId: string): CoachQuestionFamily {
  if (BOUNDARIES_ID.test(questionId)) return 'boundaries'
  if (AUDIENCE_ID.test(questionId)) return 'audience'
  return 'general'
}

export const CLARIFY_FAMILY_QUESTIONS: Record<Locale, Record<Exclude<CoachQuestionFamily, 'general'>, Partial<Record<CoachCriterion, string>>>> = {
  en: {
    audience: { specificity: 'Which single group or situation do you mean, and what is their main problem?' },
    boundaries: { specificity: 'Which specific topics, requests or uses are off-limits, and what should happen when someone asks for one?' },
  },
  fa: {
    audience: { specificity: 'کدام یک گروه یا موقعیت را در نظر دارید و مسئلهٔ اصلی‌شان چیست؟' },
    boundaries: { specificity: 'دقیقاً کدام موضوع‌ها، درخواست‌ها یا کاربردها خارج از محدوده‌اند و وقتی کسی یکی از آن‌ها را بخواهد چه باید کرد؟' },
  },
  tr: {
    audience: { specificity: 'Hangi tek grubu ya da durumu kastediyorsunuz ve ana sorunları nedir?' },
    boundaries: { specificity: 'Tam olarak hangi konular, talepler ya da kullanımlar kapsam dışında ve biri bunlardan birini istediğinde ne yapılmalı?' },
  },
}

/** The clarifying question for this criterion and this question's family, in the locale. */
export function clarifyQuestion(locale: Locale, criterion: CoachCriterion, questionId: string): string {
  const family = questionFamily(questionId)
  const override = family === 'general' ? undefined : CLARIFY_FAMILY_QUESTIONS[locale][family][criterion]
  return override ?? CLARIFY_QUESTIONS[locale][criterion]
}

export const CRITERION_NAMES: Record<Locale, Record<CoachCriterion, string>> = {
  en: {
    relevance: 'relevance',
    specificity: 'specificity',
    completeness_for_output: 'completeness for the documents it feeds',
    measurability: 'measurability',
    evidence_support: 'evidence support',
    clarity_coherence: 'clarity and internal coherence',
  },
  fa: {
    relevance: 'ارتباط با پرسش',
    specificity: 'مشخص‌بودن',
    completeness_for_output: 'کامل‌بودن برای اسنادی که تغذیه می‌کند',
    measurability: 'قابل‌سنجش‌بودن',
    evidence_support: 'پشتیبانی شهود',
    clarity_coherence: 'روشنی و سازگاری درونی',
  },
  tr: {
    relevance: 'soruyla ilgililik',
    specificity: 'belirlilik',
    completeness_for_output: 'beslediği belgeler için bütünlük',
    measurability: 'ölçülebilirlik',
    evidence_support: 'kanıt desteği',
    clarity_coherence: 'açıklık ve iç tutarlılık',
  },
}

export const STATUS_NAMES: Record<Locale, Record<CoachStatus, string>> = {
  en: {
    ready: 'ready',
    needs_clarification: 'needs clarification',
    evidence_missing: 'evidence missing',
    needs_review: 'needs review',
    not_applicable: 'not applicable',
    insufficient_context: 'insufficient context',
  },
  fa: {
    ready: 'آماده',
    needs_clarification: 'نیازمند روشن‌سازی',
    evidence_missing: 'شهود موجود نیست',
    needs_review: 'نیازمند بازبینی',
    not_applicable: 'نامرتبط',
    insufficient_context: 'زمینهٔ کافی نیست',
  },
  tr: {
    ready: 'hazır',
    needs_clarification: 'açıklama gerekiyor',
    evidence_missing: 'kanıt eksik',
    needs_review: 'inceleme gerekiyor',
    not_applicable: 'uygulanamaz',
    insufficient_context: 'bağlam yetersiz',
  },
}

/** Reasons the coach has nothing to ask. Interpolated into `follow_up_none`. */
export const NO_FOLLOW_UP_REASONS = ['question_inapplicable', 'answer_settled', 'answer_open', 'quality_ready', 'already_deferred'] as const
export type NoFollowUpReason = (typeof NO_FOLLOW_UP_REASONS)[number]

export const NO_FOLLOW_UP_TEXT: Record<Locale, Record<NoFollowUpReason, string>> = {
  en: {
    question_inapplicable: 'the question does not apply to this brand under its current configuration and answers.',
    answer_settled: 'you recorded an explicit decision (unknown, skip or not relevant), and the coach never reopens one.',
    answer_open: 'the question has no live answer yet, so a follow-up would come before the question itself.',
    quality_ready: 'the answer passes every criterion the coach can check, so one more question would only add fatigue.',
    already_deferred: 'the question that would close the gap is on your "decide later" list, which the coach treats as a decline.',
  },
  fa: {
    question_inapplicable: 'این پرسش با تنظیمات و پاسخ‌های فعلی این برند مرتبط نیست.',
    answer_settled: 'شما تصمیم صریحی ثبت کرده‌اید (unknown، skip یا نامرتبط) و مربی هرگز آن را بازنمی‌کند.',
    answer_open: 'این پرسش هنوز پاسخ فعالی ندارد؛ پس پرسش تکمیلی پیش از خودِ پرسش می‌آمد.',
    quality_ready: 'پاسخ همهٔ معیارهای قابل‌سنجش مربی را می‌گذراند؛ یک پرسش بیشتر فقط خستگی می‌افزاید.',
    already_deferred: 'پرسشی که این شکاف را می‌بست در فهرست «بعداً تصمیم می‌گیرم» شماست و مربی آن را انصراف می‌داند.',
  },
  tr: {
    question_inapplicable: 'soru, bu markanın mevcut yapılandırması ve yanıtlarıyla geçerli değil.',
    answer_settled: 'açık bir karar kaydettiniz (unknown, skip ya da ilgisiz) ve koç bunu asla yeniden açmaz.',
    answer_open: 'sorunun henüz canlı bir yanıtı yok; ek soru, sorunun kendisinden önce gelmiş olurdu.',
    quality_ready: 'yanıt koçun denetleyebildiği tüm ölçütleri geçiyor; bir soru daha yalnızca yorgunluk katardı.',
    already_deferred: 'boşluğu kapatacak soru «sonra karar ver» listenizde ve koç bunu bir ret sayar.',
  },
}

/** The one explanatory question per tension rule, asked instead of reporting a conflict. */
export const TENSION_QUESTIONS: Record<Locale, Record<CoachTensionRule, string>> = {
  en: {
    'premium-vs-lowest-price': 'Is the low price a deliberate entry or launch offer for a premium brand, or is the brand moving towards a value position? Which one should the documents say?',
    'availability-held-back': 'The product is recorded as available, but public wording may not say so yet. Is this a deliberate staged or quiet launch, and until when?',
  },
  fa: {
    'premium-vs-lowest-price': 'آیا قیمت پایین یک پیشنهاد ورودی یا افتتاحیهٔ آگاهانه برای یک برند ممتاز است، یا برند به سمت جایگاه «به‌صرفه» می‌رود؟ اسناد کدام را بگویند؟',
    'availability-held-back': 'محصول «در دسترس» ثبت شده، اما متن عمومی هنوز اجازه ندارد این را بگوید. آیا این یک عرضهٔ مرحله‌ای یا بی‌سروصدای آگاهانه است، و تا چه زمانی؟',
  },
  tr: {
    'premium-vs-lowest-price': 'Düşük fiyat, premium bir marka için bilinçli bir giriş ya da lansman teklifi mi, yoksa marka uygun fiyat konumuna mı kayıyor? Belgeler hangisini söylemeli?',
    'availability-held-back': 'Ürün mevcut olarak kayıtlı, ancak kamuya açık metin bunu henüz söyleyemiyor. Bu bilinçli, aşamalı ya da sessiz bir lansman mı ve ne zamana kadar?',
  },
}

/** How a rule check is named to a person. `not_tested` is said out loud, never left as silence. */
export const RULE_OUTCOME_NAMES: Record<Locale, Record<CoachRuleCheckOutcome, string>> = {
  en: {
    confirmed_conflict: 'confirmed conflict',
    potential_tension: 'possible trade-off (a question, not an error)',
    needs_verification: 'needs a verified source',
    no_finding: 'checked, nothing found',
    not_tested: 'not tested (an input is still open)',
  },
  fa: {
    confirmed_conflict: 'تناقض قطعی',
    potential_tension: 'بده‌بستان احتمالی (یک پرسش، نه خطا)',
    needs_verification: 'به منبع تأییدشده نیاز دارد',
    no_finding: 'بررسی شد، چیزی پیدا نشد',
    not_tested: 'آزموده نشد (یکی از ورودی‌ها هنوز باز است)',
  },
  tr: {
    confirmed_conflict: 'kesin çelişki',
    potential_tension: 'olası ödünleşim (bir soru, hata değil)',
    needs_verification: 'doğrulanmış kaynak gerekiyor',
    no_finding: 'denetlendi, bulgu yok',
    not_tested: 'test edilmedi (bir girdi hâlâ açık)',
  },
}

export const COACH_UI: Record<Locale, Record<string, string>> = {
  en: {
    title: 'Strategic coach',
    advisory: 'Advisory only. Nothing here is a brand fact, an approval or a change. The coach wrote nothing.',
    mode: 'Mode',
    question: 'Question',
    status: 'Status',
    findings: 'Findings',
    none: 'No findings.',
    ask: 'Suggested question',
    useExisting: 'Use the existing question',
    improvement: 'Next step',
    improves: 'Improves',
    sources: 'Read',
    noModel: 'No model was called. Every finding is deterministic.',
    changeFlow: 'This field is approved. Changing it needs the human change flow, not the coach.',
    momentTitle: 'Coach (optional, nothing was changed)',
    momentAsk: 'Worth one more sentence',
    momentAfterHint: 'Add detail with "change {question}: …", or just continue. This note will not come back for this answer.',
    momentAnswerFirst: 'answer the existing question first:',
    momentApproveTitle: 'Coach notes before you approve (advisory; nothing is blocked):',
    momentMore: '{count} more: npm run brand:coach -- analyze --mode quality_review --question <id>',
    momentApproveFoot: 'Approving is your decision. The coach changed nothing and authorizes nothing.',
    theInterview: 'the interview',
    nextNoAnswer: 'Answer a question first (npm run brand:interview), or name one: npm run brand:coach -- analyze --mode follow_up --question <id>',
    module_disabled: 'its module is turned off',
    skip_condition: 'an earlier answer makes it unnecessary',
    ruleChecks: 'Rules checked',
    ruleGuard: 'a recognised exception applied',
  },
  fa: {
    title: 'مربی راهبردی',
    advisory: 'فقط مشورتی. هیچ‌چیزِ اینجا واقعیت برند، تأیید یا تغییر نیست. مربی چیزی ننوشت.',
    mode: 'حالت',
    question: 'پرسش',
    status: 'وضعیت',
    findings: 'یافته‌ها',
    none: 'یافته‌ای نیست.',
    ask: 'پرسش پیشنهادی',
    useExisting: 'از پرسش موجود استفاده کنید',
    improvement: 'گام بعد',
    improves: 'بهبود می‌دهد',
    sources: 'خوانده‌شده',
    noModel: 'هیچ مدلی فراخوانده نشد. همهٔ یافته‌ها قطعی‌اند.',
    changeFlow: 'این فیلد تأییدشده است. تغییرش به مسیر انسانیِ تغییر نیاز دارد، نه به مربی.',
    momentTitle: 'مربی (اختیاری، چیزی تغییر نکرد)',
    momentAsk: 'یک جملهٔ دیگر ارزشش را دارد',
    momentAfterHint: 'با «change {question}: …» جزئیات بیفزایید یا همین‌طور ادامه دهید. این یادداشت برای این پاسخ دوباره نمی‌آید.',
    momentAnswerFirst: 'به پرسش موجود پاسخ دهید:',
    momentApproveTitle: 'یادداشت‌های مربی پیش از تأیید (مشورتی؛ چیزی مسدود نمی‌شود):',
    momentMore: '{count} مورد دیگر: npm run brand:coach -- analyze --mode quality_review --question <id>',
    momentApproveFoot: 'تأیید تصمیم شماست. مربی چیزی را تغییر نداد و اجازهٔ هیچ کاری نمی‌دهد.',
    theInterview: 'مصاحبه',
    nextNoAnswer: 'اول به یک پرسش پاسخ دهید (npm run brand:interview)، یا پرسشی را نام ببرید: npm run brand:coach -- analyze --mode follow_up --question <id>',
    module_disabled: 'ماژول آن خاموش است',
    skip_condition: 'یک پاسخ قبلی آن را غیرلازم کرده است',
    ruleChecks: 'قاعده‌های بررسی‌شده',
    ruleGuard: 'یک استثنای شناخته‌شده اعمال شد',
  },
  tr: {
    title: 'Stratejik koç',
    advisory: 'Yalnızca tavsiye. Buradaki hiçbir şey marka olgusu, onay ya da değişiklik değildir. Koç hiçbir şey yazmadı.',
    mode: 'Kip',
    question: 'Soru',
    status: 'Durum',
    findings: 'Bulgular',
    none: 'Bulgu yok.',
    ask: 'Önerilen soru',
    useExisting: 'Mevcut soruyu kullanın',
    improvement: 'Sonraki adım',
    improves: 'İyileştirdiği',
    sources: 'Okunan',
    noModel: 'Hiçbir model çağrılmadı. Tüm bulgular belirlenimcidir.',
    changeFlow: 'Bu alan onaylı. Değiştirmek koçu değil, insan değişiklik akışını gerektirir.',
    momentTitle: 'Koç (isteğe bağlı, hiçbir şey değişmedi)',
    momentAsk: 'Bir cümle daha değer',
    momentAfterHint: 'Ayrıntı eklemek için "change {question}: …" yazın ya da devam edin. Bu not bu yanıt için bir daha gelmez.',
    momentAnswerFirst: 'mevcut soruyu yanıtlayın:',
    momentApproveTitle: 'Onaylamadan önce koç notları (tavsiye; hiçbir şey engellenmez):',
    momentMore: '{count} tane daha: npm run brand:coach -- analyze --mode quality_review --question <id>',
    momentApproveFoot: 'Onaylamak sizin kararınız. Koç hiçbir şeyi değiştirmedi ve hiçbir şeye yetki vermez.',
    theInterview: 'görüşme',
    nextNoAnswer: 'Önce bir soruyu yanıtlayın (npm run brand:interview) ya da bir soru belirtin: npm run brand:coach -- analyze --mode follow_up --question <id>',
    module_disabled: 'modülü kapalı',
    skip_condition: 'önceki bir yanıt onu gereksiz kılıyor',
    ruleChecks: 'Denetlenen kurallar',
    ruleGuard: 'tanınmış bir istisna uygulandı',
  },
}

export function coachUi(locale: Locale, key: string): string {
  return COACH_UI[locale][key] ?? COACH_UI.en[key] ?? key
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => vars[name] ?? `{${name}}`)
}

/** The localized reason and improvement for one finding code, with placeholders filled. */
export function coachText(locale: Locale, code: CoachFindingCode, vars: Record<string, string> = {}): CoachPhrase {
  const phrase = COACH_TEXT[locale][code] ?? COACH_TEXT.en[code]
  return { reason: fill(phrase.reason, vars), improvement: phrase.improvement === null ? null : fill(phrase.improvement, vars) }
}

/** Every code, criterion and status has text in every locale. Asserted by `tests/coach-core.test.ts` and `tests/coach-moments.test.ts`. */
export function coachI18nErrors(): string[] {
  const errors: string[] = []
  for (const locale of ['en', 'fa', 'tr'] as const) {
    for (const code of COACH_FINDING_CODES) {
      const phrase = COACH_TEXT[locale][code]
      if (!phrase || !phrase.reason.trim()) errors.push(`coach text ${locale}.${code} is missing`)
      if (phrase && COACH_TEXT.en[code].improvement === null !== (phrase.improvement === null)) {
        errors.push(`coach text ${locale}.${code} disagrees with en about having an improvement line`)
      }
    }
    for (const criterion of COACH_CRITERIA) {
      if (!CLARIFY_QUESTIONS[locale][criterion]?.trim()) errors.push(`coach clarify question ${locale}.${criterion} is missing`)
      for (const family of ['audience', 'boundaries'] as const) {
        const hasEn = CLARIFY_FAMILY_QUESTIONS.en[family][criterion] !== undefined
        const text = CLARIFY_FAMILY_QUESTIONS[locale][family][criterion]
        if (hasEn !== (text !== undefined) || (text !== undefined && !text.trim())) errors.push(`coach clarify question ${locale}.${family}.${criterion} disagrees with en`)
      }
      if (!CRITERION_NAMES[locale][criterion]?.trim()) errors.push(`coach criterion name ${locale}.${criterion} is missing`)
    }
    for (const status of COACH_STATUSES) {
      if (!STATUS_NAMES[locale][status]?.trim()) errors.push(`coach status name ${locale}.${status} is missing`)
    }
    for (const reason of NO_FOLLOW_UP_REASONS) {
      if (!NO_FOLLOW_UP_TEXT[locale][reason]?.trim()) errors.push(`coach no-follow-up reason ${locale}.${reason} is missing`)
    }
    for (const rule of COACH_TENSION_RULES) {
      if (!TENSION_QUESTIONS[locale][rule]?.trim()) errors.push(`coach tension question ${locale}.${rule} is missing`)
    }
    for (const outcome of COACH_RULE_CHECK_OUTCOMES) {
      if (!RULE_OUTCOME_NAMES[locale][outcome]?.trim()) errors.push(`coach rule outcome ${locale}.${outcome} is missing`)
    }
    for (const key of Object.keys(COACH_UI.en)) {
      if (!COACH_UI[locale][key]?.trim()) errors.push(`coach ui string ${locale}.${key} is missing`)
    }
  }
  return errors
}
