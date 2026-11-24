/**
 * Every human-facing string of the assurance layer, in en / fa / tr.
 *
 * The engine itself speaks only stable English codes (`applicable_missing`, `source_changed`, …).
 * Nothing here is brand voice and nothing here is a brand fact: these are labels for the method, its
 * statuses and its limits. A brand's own words are never translated by this file — or by anything else.
 *
 * `tests/assurance-i18n.test.ts` fails if a code the engine can emit has no entry in all three.
 */

export const ASSURANCE_LANGS = ['en', 'fa', 'tr'] as const
export type AssuranceLang = (typeof ASSURANCE_LANGS)[number]

type T = Record<AssuranceLang, string>
type Catalog = Record<string, T>

export function assuranceLang(value: unknown, fallback: AssuranceLang = 'en'): AssuranceLang {
  return typeof value === 'string' && (ASSURANCE_LANGS as readonly string[]).includes(value) ? (value as AssuranceLang) : fallback
}

export function fill(text: string, vars: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => (vars[key] === undefined ? `{${key}}` : String(vars[key])))
}

/** Control statuses. Text plus shape plus colour in any renderer — never colour alone. */
export const STATUS_TEXT: Catalog = {
  applicable_complete: { en: 'Complete', fa: 'کامل', tr: 'Tamam' },
  applicable_partial: { en: 'Partly recorded', fa: 'بخشی ثبت شده', tr: 'Kısmen kayıtlı' },
  applicable_missing: { en: 'Missing', fa: 'ثبت نشده', tr: 'Eksik' },
  not_applicable: { en: 'Does not apply', fa: 'موضوعیت ندارد', tr: 'Geçerli değil' },
  applicability_unknown: { en: 'Unclear whether it applies', fa: 'معلوم نیست موضوعیت دارد یا نه', tr: 'Geçerli olup olmadığı belirsiz' },
  evidence_insufficient: { en: 'Evidence not enough', fa: 'شواهد کافی نیست', tr: 'Kanıt yeterli değil' },
  conflicted: { en: 'Sources disagree', fa: 'منابع با هم نمی‌خوانند', tr: 'Kaynaklar çelişiyor' },
  needs_review: { en: 'Needs review', fa: 'نیاز به بازبینی', tr: 'Gözden geçirilmeli' },
  blocked_by_license: { en: 'Blocked: no right to assess', fa: 'مسدود: اجازهٔ ارزیابی نداریم', tr: 'Engelli: değerlendirme hakkı yok' },
  not_assessed: { en: 'Not assessed', fa: 'ارزیابی نشده', tr: 'Değerlendirilmedi' },
}

/** Why a control ended where it did. */
export const REASON_TEXT: Catalog = {
  license_blocked: {
    en: 'We hold no right to assess against this method, so it is neither passed nor failed.',
    fa: 'اجازهٔ ارزیابی بر اساس این متد را نداریم؛ پس نه قبول است و نه رد.',
    tr: 'Bu yönteme göre değerlendirme hakkımız yok; bu nedenle ne geçti ne kaldı.',
  },
  not_applicable_by_rule: {
    en: 'The method’s applicability rule rules this control out for this brand.',
    fa: 'قاعدهٔ موضوعیت این متد، این کنترل را برای این برند کنار می‌گذارد.',
    tr: 'Yöntemin geçerlilik kuralı bu kontrolü bu marka için kapsam dışı bırakıyor.',
  },
  applicability_unknown: {
    en: 'Whether it applies depends on something nobody has answered yet.',
    fa: 'موضوعیت داشتنش به چیزی بستگی دارد که هنوز کسی پاسخش نداده است.',
    tr: 'Geçerli olup olmadığı henüz yanıtlanmamış bir şeye bağlı.',
  },
  no_input: {
    en: 'Nothing was resolved for this control. Not assessed is not the same as failed.',
    fa: 'برای این کنترل چیزی خوانده نشد. «ارزیابی‌نشده» با «رد» یکی نیست.',
    tr: 'Bu kontrol için hiçbir şey çözümlenmedi. Değerlendirilmemiş, başarısız demek değildir.',
  },
  source_changed: {
    en: 'A cited source changed after it was pinned, so the earlier verdict no longer stands.',
    fa: 'منبعی که ارجاع داده شده بعد از پین‌شدن تغییر کرده است؛ پس حکم قبلی دیگر معتبر نیست.',
    tr: 'Atıf yapılan bir kaynak sabitlendikten sonra değişti; bu nedenle önceki sonuç geçerli değil.',
  },
  source_missing: {
    en: 'A required source is not there at all.',
    fa: 'منبعی که لازم بود اصلاً وجود ندارد.',
    tr: 'Gerekli bir kaynak hiç yok.',
  },
  fact_not_approved: {
    en: 'The answer exists as a draft. A draft is not an approved fact.',
    fa: 'پاسخ به‌صورت پیش‌نویس هست. پیش‌نویس، واقعیت تأییدشده نیست.',
    tr: 'Yanıt taslak olarak var. Taslak, onaylı bir bilgi değildir.',
  },
  owner_said_unknown: {
    en: 'The owner answered “unknown”. That is an answer, and nothing was invented in its place.',
    fa: 'مالک پاسخ داده «نمی‌دانم». این خودش یک پاسخ است و چیزی به جایش ساخته نشد.',
    tr: 'Sahip “bilmiyorum” dedi. Bu bir yanıttır ve yerine hiçbir şey uydurulmadı.',
  },
  owner_said_not_applicable: {
    en: 'The owner marked this not applicable.',
    fa: 'مالک این مورد را بی‌موضوعیت علامت زده است.',
    tr: 'Sahip bunu geçerli değil olarak işaretledi.',
  },
  withheld_for_audience: {
    en: 'The inputs are restricted. The result is withheld from this audience and no value was read.',
    fa: 'ورودی‌ها محرمانه‌اند. نتیجه از این مخاطب دریغ شده و هیچ مقداری خوانده نشد.',
    tr: 'Girdiler kısıtlı. Sonuç bu kitleden saklandı ve hiçbir değer okunmadı.',
  },
  conflict_recorded: {
    en: 'A recorded contradiction touches this control. Both sides are kept; nothing is averaged.',
    fa: 'یک تناقض ثبت‌شده به این کنترل مربوط است. هر دو طرف نگه داشته می‌شوند و چیزی میانگین نمی‌شود.',
    tr: 'Kayıtlı bir çelişki bu kontrolle ilgili. Her iki taraf da korunur; ortalama alınmaz.',
  },
  reviewer_required: {
    en: 'This control is a judgment. A person has to make it; the engine will not.',
    fa: 'این کنترل یک داوری است. یک انسان باید آن را انجام دهد؛ موتور این کار را نمی‌کند.',
    tr: 'Bu kontrol bir yargıdır. Bunu bir insan yapmalı; motor yapmaz.',
  },
  reviewer_rationale_missing: {
    en: 'A judgment without a written reason is not accepted.',
    fa: 'داوری بدون دلیل نوشته‌شده پذیرفته نمی‌شود.',
    tr: 'Yazılı gerekçesi olmayan bir yargı kabul edilmez.',
  },
  reviewer_role_invalid: {
    en: 'The reviewer’s role is not one that may judge a control.',
    fa: 'نقش بازبین از نقش‌هایی نیست که اجازهٔ داوری یک کنترل را دارند.',
    tr: 'İnceleyenin rolü, bir kontrolü yargılayabilecek roller arasında değil.',
  },
  reviewer_status_invalid: {
    en: 'A reviewer may not set this status; it belongs to the engine.',
    fa: 'بازبین نمی‌تواند این وضعیت را تعیین کند؛ این وضعیت از آنِ موتور است.',
    tr: 'Bir inceleyen bu durumu atayamaz; bu durum motora aittir.',
  },
  evidence_below_minimum: {
    en: 'Fewer current research notes than the control needs.',
    fa: 'تعداد یادداشت‌های پژوهشی معتبر کمتر از چیزی است که کنترل لازم دارد.',
    tr: 'Kontrolün ihtiyaç duyduğundan daha az güncel araştırma notu var.',
  },
  evidence_not_independent: {
    en: 'The notes that exist are the owner’s own statement, not independent evidence.',
    fa: 'یادداشت‌های موجود گفتهٔ خود مالک‌اند، نه شواهد مستقل.',
    tr: 'Mevcut notlar sahibin kendi beyanı, bağımsız kanıt değil.',
  },
  all_inputs_present: {
    en: 'Every input this control asks for is present and current.',
    fa: 'همهٔ ورودی‌هایی که این کنترل می‌خواهد موجود و به‌روز است.',
    tr: 'Bu kontrolün istediği tüm girdiler mevcut ve güncel.',
  },
}

export const DOMAIN_TEXT: Catalog = {
  audience: { en: 'Audience', fa: 'مخاطب', tr: 'Hedef kitle' },
  offer: { en: 'Offer', fa: 'پیشنهاد', tr: 'Teklif' },
  proof: { en: 'Proof and claims', fa: 'اثبات و ادعاها', tr: 'Kanıt ve iddialar' },
  governance: { en: 'Decisions', fa: 'تصمیم‌ها', tr: 'Kararlar' },
  measurement: { en: 'Measurement', fa: 'سنجش', tr: 'Ölçüm' },
}

export const CRITICALITY_TEXT: Catalog = {
  critical: { en: 'Critical', fa: 'بحرانی', tr: 'Kritik' },
  important: { en: 'Important', fa: 'مهم', tr: 'Önemli' },
  supporting: { en: 'Supporting', fa: 'پشتیبان', tr: 'Destekleyici' },
}

/** An original ordinal scale. Not an ISO maturity model and not a grade. */
export const MATURITY_TEXT: Catalog = {
  '0': { en: '0 Unobserved — no process evidence (not proof of absence)', fa: '۰ مشاهده‌نشده — شواهدی از فرایند نیست (دلیل نبودنش هم نیست)', tr: '0 Gözlenmedi — süreç kanıtı yok (yokluğun kanıtı da değil)' },
  '1': { en: '1 Defined — an approved policy or written approach exists', fa: '۱ تعریف‌شده — سیاست تأییدشده یا رویکرد مکتوب وجود دارد', tr: '1 Tanımlı — onaylı bir politika veya yazılı yaklaşım var' },
  '2': { en: '2 Executed — credible evidence of one real instance', fa: '۲ اجراشده — شواهد قابل‌اتکا از یک نمونهٔ واقعی', tr: '2 Uygulandı — gerçek bir örneğe dair güvenilir kanıt' },
  '3': { en: '3 Measured — repeatable records with an owner and a definition', fa: '۳ سنجیده — سوابق تکرارپذیر با مالک و تعریف مشخص', tr: '3 Ölçüldü — sahibi ve tanımı olan tekrarlanabilir kayıtlar' },
  '4': { en: '4 Improved — a decision changed practice, with evidence after the change', fa: '۴ بهبودیافته — تصمیمی رویه را عوض کرده و شواهد بعد از تغییر هست', tr: '4 İyileştirildi — bir karar uygulamayı değiştirdi, değişim sonrası kanıt var' },
  unknown: { en: 'Unknown', fa: 'نامشخص', tr: 'Bilinmiyor' },
  not_applicable: { en: 'Does not apply', fa: 'موضوعیت ندارد', tr: 'Geçerli değil' },
  insufficient_evidence: { en: 'Not enough evidence (not zero)', fa: 'شواهد کافی نیست (صفر نیست)', tr: 'Yeterli kanıt yok (sıfır değil)' },
}

export const EVIDENCE_QUALITY_TEXT: Catalog = {
  independently_verified: { en: 'Independently evidenced', fa: 'دارای شواهد مستقل', tr: 'Bağımsız kanıtlı' },
  mixed: { en: 'Mixed: some independent, some owner-stated', fa: 'ترکیبی: بخشی مستقل، بخشی گفتهٔ مالک', tr: 'Karışık: bir kısmı bağımsız, bir kısmı sahip beyanı' },
  owner_stated: { en: 'Owner-stated only, not independently checked', fa: 'فقط گفتهٔ مالک، بدون بررسی مستقل', tr: 'Yalnızca sahip beyanı, bağımsız doğrulanmadı' },
  insufficient_evidence: { en: 'Not enough evidence to say', fa: 'شواهد برای اظهارنظر کافی نیست', tr: 'Söylemek için yeterli kanıt yok' },
  not_assessed: { en: 'Not assessed', fa: 'ارزیابی نشده', tr: 'Değerlendirilmedi' },
}

export const CLAIM_TEXT: Catalog = {
  reference_only: { en: 'Referenced only', fa: 'فقط ارجاع‌شده', tr: 'Yalnızca atıf' },
  informed_by: { en: 'Informed by', fa: 'الهام‌گرفته از', tr: 'Esinlenilen' },
  mapped_to: { en: 'Mapped to selected requirements', fa: 'نگاشته به الزامات انتخاب‌شده', tr: 'Seçili gerekliliklere eşlenmiş' },
  internally_assessed: { en: 'Internally assessed', fa: 'ارزیابی داخلی', tr: 'İç değerlendirme' },
  externally_reviewed: { en: 'Externally reviewed', fa: 'بازبینی‌شدهٔ مستقل', tr: 'Dışarıdan incelenmiş' },
  certified: { en: 'Certified', fa: 'گواهی‌شده', tr: 'Belgelendirilmiş' },
}

export const CLAIM_CAP_TEXT: Catalog = {
  rules_access: {
    en: 'We do not hold the rights to assess against this method, so it may only be cited.',
    fa: 'حق ارزیابی بر اساس این متد را نداریم؛ پس فقط می‌توان به آن ارجاع داد.',
    tr: 'Bu yönteme göre değerlendirme hakkımız yok; bu nedenle yalnızca atıf yapılabilir.',
  },
  edition_unverified: {
    en: 'Nobody recorded which edition was checked, so the edition cannot be cited as fact.',
    fa: 'کسی ثبت نکرده کدام ویرایش بررسی شده؛ پس ویرایش را نمی‌توان به‌عنوان واقعیت ذکر کرد.',
    tr: 'Hangi sürümün kontrol edildiği kayıtlı değil; bu yüzden sürüm bir olgu olarak anılamaz.',
  },
  source_unverified: {
    en: 'Nobody has opened the official source and confirmed its terms.',
    fa: 'کسی منبع رسمی را باز نکرده و شرایطش را تأیید نکرده است.',
    tr: 'Resmî kaynağı açıp koşullarını doğrulayan olmadı.',
  },
  no_attestation: {
    en: 'No named third party has attested this scope at the declared level (a review is not a certificate), so that level may not be claimed.',
    fa: 'هیچ شخص ثالث نام‌برده‌ای این دامنه را در سطح اعلام‌شده تأیید نکرده است (بازبینی، گواهینامه نیست)؛ پس آن سطح را نمی‌توان ادعا کرد.',
    tr: 'Adı belirtilmiş hiçbir üçüncü taraf bu kapsamı beyan edilen düzeyde doğrulamadı (inceleme, belge değildir); bu düzey iddia edilemez.',
  },
}

export const LIMITATION_TEXT: Catalog = {
  internal_assessment_only: {
    en: 'This is an internal assessment against a named method. It is not a certification, a compliance statement or an independent audit.',
    fa: 'این یک ارزیابی داخلی بر اساس یک متد نام‌برده است. گواهینامه، اعلام انطباق یا ممیزی مستقل نیست.',
    tr: 'Bu, adı belirtilmiş bir yönteme göre yapılan bir iç değerlendirmedir. Belgelendirme, uygunluk beyanı veya bağımsız denetim değildir.',
  },
  owner_stated_evidence: {
    en: 'Some evidence is the owner’s own statement. Approved is not the same as independently verified.',
    fa: 'بخشی از شواهد گفتهٔ خود مالک است. «تأییدشده» با «راستی‌آزمایی مستقل» یکی نیست.',
    tr: 'Bazı kanıtlar sahibin kendi beyanıdır. Onaylı olmak, bağımsız doğrulanmış olmakla aynı şey değildir.',
  },
  no_maturity_aggregate: {
    en: 'Maturity is reported per domain. There is no single maturity number, because no aggregation rule has been published.',
    fa: 'بلوغ برای هر حوزه جداگانه گزارش می‌شود. عدد واحد بلوغ وجود ندارد، چون قاعدهٔ تجمیعی منتشر نشده است.',
    tr: 'Olgunluk alan bazında raporlanır. Tek bir olgunluk sayısı yoktur, çünkü yayımlanmış bir toplama kuralı yok.',
  },
  completeness_blocked: {
    en: 'No completeness ratio is shown: at least one control is unassessed, licence-blocked, of unclear applicability, or waiting on a changed source.',
    fa: 'نسبت کامل‌بودن نشان داده نمی‌شود: دست‌کم یک کنترل ارزیابی‌نشده، از نظر مجوز مسدود، نامشخص از نظر موضوعیت، یا منتظر منبعی است که تغییر کرده.',
    tr: 'Tamamlanma oranı gösterilmiyor: en az bir kontrol değerlendirilmemiş, lisansla engellenmiş, geçerliliği belirsiz veya değişmiş bir kaynağı bekliyor.',
  },
  restricted_inputs_withheld: {
    en: 'At least one control reads restricted inputs and is withheld from this audience.',
    fa: 'دست‌کم یک کنترل ورودی محرمانه می‌خواند و از این مخاطب دریغ شده است.',
    tr: 'En az bir kontrol kısıtlı girdileri okuyor ve bu kitleden saklanıyor.',
  },
  demo_data: {
    en: 'SYNTHETIC DEMO — NOT A REAL BRAND. Every id below is invented for illustration.',
    fa: 'نمونهٔ ساختگی — یک برند واقعی نیست. همهٔ شناسه‌های زیر برای نمایش ساخته شده‌اند.',
    tr: 'SENTETİK DEMO — GERÇEK BİR MARKA DEĞİL. Aşağıdaki her kimlik gösterim için uydurulmuştur.',
  },
}

/** Method labels. Each entry's own `title` is the issuer's English name and is never translated. */
export const METHOD_TEXT: Catalog = {
  'brand-os.positioning-readiness': {
    en: 'Brand OS Positioning Readiness rubric — an original Brand OS method. Not ISO, not a certification.',
    fa: 'روبریک آمادگی جایگاه‌یابی Brand OS — متدی اصیل از Brand OS. نه ISO است و نه گواهینامه.',
    tr: 'Brand OS Konumlandırma Hazırlığı rubriği — özgün bir Brand OS yöntemi. ISO değildir, belgelendirme değildir.',
  },
}

/** One label, one intent and one next step per control. */
export const CONTROL_TEXT: Record<string, { label: T; intent: T; remediation: T }> = {
  'PRR-01': {
    label: { en: 'Primary segment named', fa: 'بخش اصلی مخاطب نام‌برده شده', tr: 'Birincil segment adlandırılmış' },
    intent: {
      en: 'Who the brand is for is an approved fact, not an assumption in someone’s head.',
      fa: 'اینکه برند برای چه کسی است یک واقعیت تأییدشده باشد، نه فرضی در ذهن کسی.',
      tr: 'Markanın kime hitap ettiği onaylı bir bilgi olmalı, birinin kafasındaki varsayım değil.',
    },
    remediation: {
      en: 'Answer the primary segment question, review it and approve it.',
      fa: 'به پرسش بخش اصلی مخاطب پاسخ دهید، بازبینی و سپس تأییدش کنید.',
      tr: 'Birincil segment sorusunu yanıtlayın, gözden geçirin ve onaylayın.',
    },
  },
  'PRR-02': {
    label: { en: 'Market scope named', fa: 'دامنهٔ بازار نام‌برده شده', tr: 'Pazar kapsamı adlandırılmış' },
    intent: {
      en: 'Where the brand operates bounds every later claim about competitors and demand.',
      fa: 'اینکه برند کجا فعال است، حد و مرز هر ادعای بعدی دربارهٔ رقبا و تقاضا را تعیین می‌کند.',
      tr: 'Markanın nerede faaliyet gösterdiği, rakipler ve talep hakkındaki sonraki her iddianın sınırını çizer.',
    },
    remediation: {
      en: 'Answer the market geography question and approve it.',
      fa: 'به پرسش جغرافیای بازار پاسخ دهید و تأییدش کنید.',
      tr: 'Pazar coğrafyası sorusunu yanıtlayın ve onaylayın.',
    },
  },
  'PRR-03': {
    label: { en: 'Audience evidence exists', fa: 'شواهدی دربارهٔ مخاطب وجود دارد', tr: 'Hedef kitle kanıtı var' },
    intent: {
      en: 'At least one independent research note supports the audience choice; the owner’s belief is not evidence.',
      fa: 'دست‌کم یک یادداشت پژوهشی مستقل از انتخاب مخاطب پشتیبانی کند؛ باور مالک شاهد نیست.',
      tr: 'Hedef kitle seçimini en az bir bağımsız araştırma notu desteklemeli; sahibin inancı kanıt değildir.',
    },
    remediation: {
      en: 'Capture an independent source as a research note in the Knowledge Inbox and cite it.',
      fa: 'یک منبع مستقل را به‌صورت یادداشت پژوهشی در Knowledge Inbox ثبت کنید و به آن ارجاع دهید.',
      tr: 'Bağımsız bir kaynağı Knowledge Inbox’ta araştırma notu olarak kaydedin ve atıf yapın.',
    },
  },
  'PRR-04': {
    label: { en: 'Value proposition stated', fa: 'ارزش پیشنهادی بیان شده', tr: 'Değer önerisi belirtilmiş' },
    intent: {
      en: 'What the brand offers, in the owner’s approved words.',
      fa: 'اینکه برند چه چیزی ارائه می‌دهد، با واژه‌های تأییدشدهٔ خود مالک.',
      tr: 'Markanın ne sunduğu, sahibin onaylı kendi sözleriyle.',
    },
    remediation: {
      en: 'Answer the value proposition question and approve it.',
      fa: 'به پرسش ارزش پیشنهادی پاسخ دهید و تأییدش کنید.',
      tr: 'Değer önerisi sorusunu yanıtlayın ve onaylayın.',
    },
  },
  'PRR-05': {
    label: { en: 'Differentiation stated', fa: 'تمایز بیان شده', tr: 'Farklılaşma belirtilmiş' },
    intent: {
      en: 'What makes this brand a different choice, written down rather than implied.',
      fa: 'اینکه چه چیزی این برند را گزینه‌ای متفاوت می‌کند، نوشته شده باشد نه القا شده.',
      tr: 'Bu markayı farklı bir seçenek yapan şeyin ima edilmesi değil, yazılı olması.',
    },
    remediation: {
      en: 'Answer the differentiation question and approve it.',
      fa: 'به پرسش تمایز پاسخ دهید و تأییدش کنید.',
      tr: 'Farklılaşma sorusunu yanıtlayın ve onaylayın.',
    },
  },
  'PRR-06': {
    label: { en: 'Promise stated', fa: 'وعدهٔ برند بیان شده', tr: 'Vaat belirtilmiş' },
    intent: {
      en: 'What a customer may expect every time, as an approved fact.',
      fa: 'اینکه مشتری هر بار چه انتظاری می‌تواند داشته باشد، به‌صورت واقعیت تأییدشده.',
      tr: 'Müşterinin her seferinde ne bekleyebileceği, onaylı bir bilgi olarak.',
    },
    remediation: {
      en: 'Answer the brand promise question and approve it.',
      fa: 'به پرسش وعدهٔ برند پاسخ دهید و تأییدش کنید.',
      tr: 'Marka vaadi sorusunu yanıtlayın ve onaylayın.',
    },
  },
  'PRR-07': {
    label: { en: 'Pricing position recorded', fa: 'جایگاه قیمتی ثبت شده', tr: 'Fiyat konumu kayıtlı' },
    intent: {
      en: 'For a brand that sells: the pricing stance is a decision on record, not a number in a spreadsheet.',
      fa: 'برای برندی که می‌فروشد: موضع قیمتی تصمیمی ثبت‌شده باشد، نه عددی در یک صفحهٔ گسترده.',
      tr: 'Satış yapan bir marka için: fiyat duruşu bir tabloda sayı değil, kayıtlı bir karar olmalı.',
    },
    remediation: {
      en: 'Answer the pricing question and approve it.',
      fa: 'به پرسش قیمت‌گذاری پاسخ دهید و تأییدش کنید.',
      tr: 'Fiyatlandırma sorusunu yanıtlayın ve onaylayın.',
    },
  },
  'PRR-08': {
    label: { en: 'Differentiation evidence reviewed', fa: 'شواهد تمایز بازبینی شده', tr: 'Farklılaşma kanıtı incelenmiş' },
    intent: {
      en: 'A person judged whether the cited evidence actually supports the differentiation claim. The engine will not judge this.',
      fa: 'یک انسان داوری کند که شواهد ارجاع‌شده واقعاً ادعای تمایز را پشتیبانی می‌کند یا نه. موتور این داوری را نمی‌کند.',
      tr: 'Atıf yapılan kanıtın farklılaşma iddiasını gerçekten destekleyip desteklemediğine bir insan karar vermeli. Motor bunu yargılamaz.',
    },
    remediation: {
      en: 'Cite independent evidence, then record a reviewer’s judgment with a written reason.',
      fa: 'به شواهد مستقل ارجاع دهید و سپس داوری یک بازبین را با دلیل نوشته‌شده ثبت کنید.',
      tr: 'Bağımsız kanıta atıf yapın, ardından bir inceleyenin yargısını yazılı gerekçeyle kaydedin.',
    },
  },
  'PRR-09': {
    label: { en: 'Claim guardrails recorded', fa: 'حدود ادعاها ثبت شده', tr: 'İddia sınırları kayıtlı' },
    intent: {
      en: 'The words and claims this brand will never use are approved, so content tools can refuse them.',
      fa: 'واژه‌ها و ادعاهایی که این برند هرگز استفاده نمی‌کند تأیید شده باشند تا ابزارهای محتوا بتوانند ردشان کنند.',
      tr: 'Bu markanın asla kullanmayacağı sözler ve iddialar onaylı olmalı ki içerik araçları onları reddedebilsin.',
    },
    remediation: {
      en: 'Answer the forbidden-language question and approve it.',
      fa: 'به پرسش زبان ممنوع پاسخ دهید و تأییدش کنید.',
      tr: 'Yasak dil sorusunu yanıtlayın ve onaylayın.',
    },
  },
  'PRR-10': {
    label: { en: 'Availability claim gate set', fa: 'دروازهٔ ادعای در دسترس بودن تعیین شده', tr: 'Bulunurluk iddiası sınırı belirlenmiş' },
    intent: {
      en: 'What may be said about availability is decided, so nothing ships claiming a product that is not ready.',
      fa: 'تعیین شده باشد دربارهٔ در دسترس بودن چه می‌توان گفت، تا چیزی با ادعای محصولی که آماده نیست منتشر نشود.',
      tr: 'Bulunurluk hakkında ne söylenebileceği kararlaştırılmalı ki hazır olmayan bir ürün iddiasıyla hiçbir şey yayımlanmasın.',
    },
    remediation: {
      en: 'Answer the availability claim question and approve it.',
      fa: 'به پرسش ادعای در دسترس بودن پاسخ دهید و تأییدش کنید.',
      tr: 'Bulunurluk iddiası sorusunu yanıtlayın ve onaylayın.',
    },
  },
  'PRR-11': {
    label: { en: 'Decision rule recorded', fa: 'قاعدهٔ تصمیم ثبت شده', tr: 'Karar kuralı kayıtlı' },
    intent: {
      en: 'How the brand decides when two good options conflict, written down before it is needed.',
      fa: 'اینکه برند وقتی دو گزینهٔ خوب با هم در تعارض‌اند چگونه تصمیم می‌گیرد، پیش از نیاز نوشته شده باشد.',
      tr: 'Marka iki iyi seçenek çatıştığında nasıl karar verir — ihtiyaç duyulmadan önce yazılmış olmalı.',
    },
    remediation: {
      en: 'Answer the decision rule question and approve it.',
      fa: 'به پرسش قاعدهٔ تصمیم پاسخ دهید و تأییدش کنید.',
      tr: 'Karar kuralı sorusunu yanıtlayın ve onaylayın.',
    },
  },
  'PRR-12': {
    label: { en: 'Purpose recorded', fa: 'هدف ثبت شده', tr: 'Amaç kayıtlı' },
    intent: {
      en: 'Why the brand exists, in the owner’s approved words.',
      fa: 'اینکه برند چرا وجود دارد، با واژه‌های تأییدشدهٔ مالک.',
      tr: 'Markanın neden var olduğu, sahibin onaylı sözleriyle.',
    },
    remediation: {
      en: 'Answer the purpose question and approve it.',
      fa: 'به پرسش هدف پاسخ دهید و تأییدش کنید.',
      tr: 'Amaç sorusunu yanıtlayın ve onaylayın.',
    },
  },
  'PRR-13': {
    label: { en: 'Objective and attribution defined', fa: 'هدف و مدل انتساب تعریف شده', tr: 'Hedef ve atıf tanımlı' },
    intent: {
      en: 'For a brand running paid media: the objective and the attribution definition exist, so results can be compared at all.',
      fa: 'برای برندی که تبلیغات پولی اجرا می‌کند: هدف و تعریف انتساب موجود باشد تا اصلاً بتوان نتایج را مقایسه کرد.',
      tr: 'Ücretli medya yürüten bir marka için: hedef ve atıf tanımı olmalı ki sonuçlar karşılaştırılabilsin.',
    },
    remediation: {
      en: 'Answer the marketing objective and attribution questions and approve them.',
      fa: 'به پرسش‌های هدف بازاریابی و انتساب پاسخ دهید و تأییدشان کنید.',
      tr: 'Pazarlama hedefi ve atıf sorularını yanıtlayın ve onaylayın.',
    },
  },
  'PRR-14': {
    label: { en: 'Budget envelope recorded', fa: 'سقف بودجه ثبت شده', tr: 'Bütçe zarfı kayıtlı' },
    intent: {
      en: 'For a brand running paid media: a budget envelope exists. The figure is restricted and is never read by this engine or shown in a report.',
      fa: 'برای برندی که تبلیغات پولی اجرا می‌کند: سقف بودجه‌ای وجود داشته باشد. خود رقم محرمانه است و نه این موتور آن را می‌خواند و نه در گزارشی نشان داده می‌شود.',
      tr: 'Ücretli medya yürüten bir marka için: bir bütçe zarfı olmalı. Rakam kısıtlıdır; bu motor onu okumaz ve bir raporda gösterilmez.',
    },
    remediation: {
      en: 'The owner answers the budget question in the interactive interview. No agent can.',
      fa: 'مالک در مصاحبهٔ تعاملی به پرسش بودجه پاسخ می‌دهد. هیچ عاملی نمی‌تواند.',
      tr: 'Bütçe sorusunu etkileşimli görüşmede sahip yanıtlar. Hiçbir ajan yanıtlayamaz.',
    },
  },
  'PRR-15': {
    label: { en: 'Personal positioning recorded', fa: 'جایگاه‌یابی شخصی ثبت شده', tr: 'Kişisel konumlandırma kayıtlı' },
    intent: {
      en: 'For a person-centred brand: what this person is known for is an approved fact.',
      fa: 'برای برند شخص‌محور: اینکه این شخص برای چه شناخته می‌شود یک واقعیت تأییدشده باشد.',
      tr: 'Kişi merkezli bir marka için: bu kişinin neyle tanındığı onaylı bir bilgi olmalı.',
    },
    remediation: {
      en: 'Answer the “known for” question and approve it.',
      fa: 'به پرسش «شناخته‌شده برای چه» پاسخ دهید و تأییدش کنید.',
      tr: '“Neyle tanınıyor” sorusunu yanıtlayın ve onaylayın.',
    },
  },
}

/** Headings and fixed lines of the printed gap report. */
export const REPORT_TEXT: Catalog = {
  title: { en: 'Positioning readiness — gap report', fa: 'آمادگی جایگاه‌یابی — گزارش کمبودها', tr: 'Konumlandırma hazırlığı — eksik raporu' },
  method: { en: 'Method', fa: 'متد', tr: 'Yöntem' },
  claim: { en: 'What this may be called', fa: 'این را چه می‌توان نامید', tr: 'Buna ne denebilir' },
  as_of: { en: 'As of', fa: 'تا تاریخ', tr: 'Tarih itibarıyla' },
  audience: { en: 'Audience', fa: 'مخاطب', tr: 'Kitle' },
  rule_version: { en: 'Rule version', fa: 'نسخهٔ قاعده', tr: 'Kural sürümü' },
  rule_digest: { en: 'Rule digest', fa: 'چکیدهٔ قاعده', tr: 'Kural özeti' },
  source_digest: { en: 'Source snapshot digest', fa: 'چکیدهٔ تصویر منابع', tr: 'Kaynak anlık görüntü özeti' },
  completeness: { en: 'Completeness', fa: 'کامل‌بودن', tr: 'Tamamlanma' },
  completeness_value: { en: '{n} of {d} applicable controls complete, {x} excluded as not applicable', fa: '{n} از {d} کنترل دارای موضوعیت کامل است، {x} مورد به‌دلیل بی‌موضوعیتی کنار گذاشته شد', tr: '{d} geçerli kontrolden {n} tanesi tamam, {x} tanesi geçerli olmadığı için hariç' },
  not_scoreable: { en: 'No ratio is shown. Reasons:', fa: 'هیچ نسبتی نشان داده نمی‌شود. دلایل:', tr: 'Hiçbir oran gösterilmiyor. Nedenler:' },
  evidence: { en: 'Evidence', fa: 'شواهد', tr: 'Kanıt' },
  coverage: { en: '{n} of {d} applicable controls have independent evidence', fa: '{n} از {d} کنترل دارای موضوعیت، شواهد مستقل دارد', tr: '{d} geçerli kontrolden {n} tanesinin bağımsız kanıtı var' },
  maturity: { en: 'Observed maturity by domain', fa: 'بلوغ مشاهده‌شده به تفکیک حوزه', tr: 'Alana göre gözlenen olgunluk' },
  no_maturity_signal: { en: 'This method observes no maturity signal in this domain', fa: 'این متد در این حوزه نشانه‌ای از بلوغ نمی‌سنجد', tr: 'Bu yöntem bu alanda olgunluk sinyali gözlemlemiyor' },
  controls: { en: 'Controls', fa: 'کنترل‌ها', tr: 'Kontroller' },
  next: { en: 'Next', fa: 'گام بعد', tr: 'Sonraki' },
  next_questions: { en: 'Questions that would move this forward', fa: 'پرسش‌هایی که این را جلو می‌برند', tr: 'Bunu ilerletecek sorular' },
  sources: { en: 'Sources consulted (ids and revisions only)', fa: 'منابع بررسی‌شده (فقط شناسه و نسخه)', tr: 'Başvurulan kaynaklar (yalnızca kimlik ve sürüm)' },
  limits: { en: 'Limits of this report', fa: 'محدودیت‌های این گزارش', tr: 'Bu raporun sınırları' },
  authorizes: {
    en: 'This report authorizes nothing: no approval, no publication, no spend, no price change.',
    fa: 'این گزارش هیچ چیز را مجاز نمی‌کند: نه تأییدی، نه انتشاری، نه هزینه‌ای، نه تغییر قیمتی.',
    tr: 'Bu rapor hiçbir şeye izin vermez: onay yok, yayın yok, harcama yok, fiyat değişikliği yok.',
  },
  none: { en: 'none', fa: 'هیچ', tr: 'yok' },
}
