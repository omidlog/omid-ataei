/**
 * Human-facing text of the Content Bridge (Slice A): generated proposal text, gap messages, projection labels and
 * notices, in en/fa/tr. Codes stay stable English tokens. Placeholders: {role} {facts} {channel} {part} {list} {id}
 * {n} {lang}. None of this text is brand voice: voice always comes from approved facts.
 */

export const CONTENT_LANGS = ['en', 'fa', 'tr'] as const
export type ContentLang = (typeof CONTENT_LANGS)[number]

type T = Record<ContentLang, string>
type Catalog = Record<string, T>

export function contentLang(value: unknown, fallback: ContentLang = 'en'): ContentLang {
  return typeof value === 'string' && (CONTENT_LANGS as readonly string[]).includes(value) ? (value as ContentLang) : fallback
}

export function fill(text: string, vars: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => (vars[key] === undefined ? `{${key}}` : String(vars[key])))
}

export const ROLE_LABELS: Catalog = {
  voice: { en: 'voice', fa: 'لحن', tr: 'ses tonu' },
  claims: { en: 'claims and forbidden language', fa: 'ادعاها و زبان ممنوع', tr: 'iddialar ve yasak dil' },
  audience: { en: 'audience', fa: 'مخاطب', tr: 'hedef kitle' },
  messaging: { en: 'messaging', fa: 'پیام‌ها', tr: 'mesajlar' },
  pillars: { en: 'content pillars', fa: 'ستون‌های محتوا', tr: 'içerik sütunları' },
  channels: { en: 'channels', fa: 'کانال‌ها', tr: 'kanallar' },
  offers: { en: 'offers', fa: 'پیشنهادها', tr: 'teklifler' },
  cta: { en: 'calls to action', fa: 'دعوت به اقدام', tr: 'eylem çağrıları' },
  languages: { en: 'content languages', fa: 'زبان‌های محتوا', tr: 'içerik dilleri' },
  objective: { en: 'marketing objective', fa: 'هدف بازاریابی', tr: 'pazarlama hedefi' },
}

export const CHANNEL_PARTS: Catalog = {
  role: { en: 'role', fa: 'نقش', tr: 'rolü' },
  formats: { en: 'formats', fa: 'قالب‌ها', tr: 'formatları' },
  cadence: { en: 'cadence', fa: 'تناوب انتشار', tr: 'yayın sıklığı' },
}

/** Fixed text of a generated proposal. It describes the process, never the brand. */
export const PROPOSAL_TEXT: Catalog = {
  title: { en: 'Content strategy', fa: 'استراتژی محتوا', tr: 'İçerik stratejisi' },
  objective: {
    en: 'Plan content that serves the approved facts cited here, in the approved voice, on the channels the owner names.',
    fa: 'محتوایی برنامه‌ریزی شود که در خدمت واقعیت‌های تأییدشدهٔ ارجاع‌داده‌شده در اینجا باشد، با لحن تأییدشده و در کانال‌هایی که مالک نام می‌برد.',
    tr: 'Burada atıf yapılan onaylı bilgilere hizmet eden içerik, onaylı ses tonuyla ve sahibin belirlediği kanallarda planlanır.',
  },
  rationale: {
    en: 'Derived from approved facts by brand:content strategy. The owner sets channel roles, formats and cadence before approving.',
    fa: 'با brand:content strategy از واقعیت‌های تأییدشده ساخته شد. مالک پیش از تأیید، نقش، قالب و تناوب هر کانال را تعیین می‌کند.',
    tr: 'brand:content strategy ile onaylı bilgilerden türetildi. Sahip, onaylamadan önce kanal rollerini, formatları ve sıklığı belirler.',
  },
  guardrail_facts: {
    en: 'Say only what approved facts support; a claim that is not an approved fact is not made.',
    fa: 'فقط چیزی گفته شود که واقعیت‌های تأییدشده پشتیبانی می‌کنند؛ ادعایی که واقعیت تأییدشده نیست، مطرح نمی‌شود.',
    tr: 'Yalnızca onaylı bilgilerin desteklediği söylenir; onaylı bilgi olmayan bir iddia yapılmaz.',
  },
  guardrail_voice: {
    en: 'Voice comes from the cited voice facts. An agent does not invent a tone, slogan or claim.',
    fa: 'لحن از واقعیت‌های لحنِ ارجاع‌داده‌شده می‌آید. عامل هوشمند لحن، شعار یا ادعایی نمی‌سازد.',
    tr: 'Ses tonu, atıf yapılan ses bilgilerine dayanır. Bir ajan ton, slogan veya iddia uydurmaz.',
  },
  non_goal_publish: {
    en: 'Posting, scheduling or publishing on any network',
    fa: 'ارسال، زمان‌بندی یا انتشار در هر شبکه‌ای',
    tr: 'Herhangi bir ağda paylaşım, zamanlama veya yayın',
  },
  non_goal_ads: {
    en: 'Ad spend or paid promotion',
    fa: 'هزینهٔ تبلیغات یا تبلیغ پولی',
    tr: 'Reklam harcaması veya ücretli tanıtım',
  },
}

/** Gap messages. Keys: `<reason>` for role gaps, `channel_<part>` and `pillars_unnamed` for owner decisions. */
export const GAP_TEXT: Catalog = {
  not_approved: {
    en: 'No approved fact covers {role}. Answer {facts}, then approve it (brand:review, brand:approve).',
    fa: 'هیچ واقعیت تأییدشده‌ای {role} را پوشش نمی‌دهد. به {facts} پاسخ دهید و سپس تأییدش کنید (brand:review، brand:approve).',
    tr: '{role} için onaylı bir bilgi yok. {facts} sorusunu yanıtlayın, sonra onaylayın (brand:review, brand:approve).',
  },
  placeholder: {
    en: 'The approved fact for {role} says it is not decided yet ({facts}). Nothing is assumed in its place.',
    fa: 'واقعیت تأییدشده برای {role} می‌گوید هنوز تصمیمی گرفته نشده است ({facts}). چیزی به جای آن فرض نمی‌شود.',
    tr: '{role} için onaylı bilgi henüz karar verilmediğini söylüyor ({facts}). Yerine hiçbir şey varsayılmaz.',
  },
  channel_role: {
    en: 'Write what {channel} is for (role) in the proposal file before approving.',
    fa: 'پیش از تأیید، در فایل پیشنهاد بنویسید {channel} برای چیست (نقش).',
    tr: 'Onaylamadan önce öneri dosyasına {channel} kanalının ne için olduğunu (rol) yazın.',
  },
  channel_formats: {
    en: 'Choose the formats for {channel} (--formats or the proposal file).',
    fa: 'قالب‌های {channel} را انتخاب کنید (--formats یا فایل پیشنهاد).',
    tr: '{channel} için formatları seçin (--formats veya öneri dosyası).',
  },
  channel_cadence: {
    en: 'Decide how often {channel} posts (--cadence or the proposal file). It stays unknown until then.',
    fa: 'تعیین کنید {channel} هر چند وقت یک بار منتشر کند (--cadence یا فایل پیشنهاد). تا آن زمان نامشخص می‌ماند.',
    tr: '{channel} kanalının ne sıklıkla paylaşım yapacağına karar verin (--cadence veya öneri dosyası). O zamana kadar bilinmiyor kalır.',
  },
  pillars_unnamed: {
    en: 'The approved pillars ({facts}) could not be split into short names. Name the pillars in the proposal file.',
    fa: 'ستون‌های تأییدشده ({facts}) به نام‌های کوتاه تقسیم نشدند. نام ستون‌ها را در فایل پیشنهاد بنویسید.',
    tr: 'Onaylı sütunlar ({facts}) kısa adlara bölünemedi. Sütunları öneri dosyasında adlandırın.',
  },
  channels_none: {
    en: 'No channel was named. Name channels with --channels, or approve {facts} with the channels you use.',
    fa: 'هیچ کانالی نام برده نشد. با --channels کانال‌ها را نام ببرید یا {facts} را با کانال‌هایی که استفاده می‌کنید تأیید کنید.',
    tr: 'Hiç kanal belirtilmedi. Kanalları --channels ile belirtin veya kullandığınız kanallarla {facts} bilgisini onaylayın.',
  },
}

export const NOTES: Catalog = {
  channels_detected: {
    en: 'Channels {list} were read from the wording of the approved channel facts. Check them; clauses with "no" or "not" were skipped.',
    fa: 'کانال‌های {list} از متن واقعیت‌های تأییدشدهٔ کانال خوانده شدند. بررسی‌شان کنید؛ عبارت‌های دارای «نه» یا «بدون» نادیده گرفته شدند.',
    tr: '{list} kanalları onaylı kanal bilgilerinin metninden okundu. Kontrol edin; "hayır" veya "değil" içeren ifadeler atlandı.',
  },
  channel_not_in_facts: {
    en: '{channel} is your choice; no approved channel fact mentions it, so it cites no fact.',
    fa: '{channel} انتخاب شماست؛ هیچ واقعیت تأییدشدهٔ کانالی به آن اشاره نمی‌کند، پس به واقعیتی ارجاع ندارد.',
    tr: '{channel} sizin seçiminiz; onaylı hiçbir kanal bilgisi ondan söz etmiyor, bu yüzden bir bilgiye atıf yapmıyor.',
  },
  languages_default: {
    en: 'Content languages default to the brand default locale ({lang}). Set them with --languages.',
    fa: 'زبان‌های محتوا به‌طور پیش‌فرض زبان اصلی برند ({lang}) است. با --languages تعیینشان کنید.',
    tr: 'İçerik dilleri varsayılan olarak markanın varsayılan dilidir ({lang}). --languages ile belirleyin.',
  },
  pillar_skipped: {
    en: 'A part of {id} was longer than a pillar name or was refused by the safety check; it was left out.',
    fa: 'بخشی از {id} بلندتر از نام یک ستون بود یا بررسی ایمنی آن را رد کرد؛ کنار گذاشته شد.',
    tr: '{id} bilgisinin bir bölümü sütun adı için fazla uzundu veya güvenlik denetiminden geçmedi; dışarıda bırakıldı.',
  },
  strategies_pinned: {
    en: 'Pinned the approved strategies served now: {list}. If one is replaced, this content strategy needs review.',
    fa: 'استراتژی‌های تأییدشدهٔ فعلی پین شدند: {list}. اگر یکی جایگزین شود، این استراتژی محتوا نیاز به بازبینی دارد.',
    tr: 'Şu anda sunulan onaylı stratejiler sabitlendi: {list}. Biri değişirse bu içerik stratejisinin gözden geçirilmesi gerekir.',
  },
  voice_not_copied: {
    en: 'Voice, audience, messaging and claims are cited by fact id and resolved at read time. Nothing was rewritten or invented.',
    fa: 'لحن، مخاطب، پیام‌ها و ادعاها با شناسهٔ واقعیت ارجاع داده شده‌اند و هنگام خواندن از واقعیت‌ها خوانده می‌شوند. چیزی بازنویسی یا ساخته نشد.',
    tr: 'Ses tonu, hedef kitle, mesajlar ve iddialar bilgi kimliğiyle atıf yapılır ve okuma anında çözülür. Hiçbir şey yeniden yazılmadı veya uydurulmadı.',
  },
}

export const AVAILABILITY_RULES: Catalog = {
  'do-not-claim': {
    en: 'Do not say or imply that the product is available.',
    fa: 'نگویید و القا نکنید که محصول در دسترس است.',
    tr: 'Ürünün mevcut olduğunu söylemeyin veya ima etmeyin.',
  },
  'coming-soon': {
    en: 'At most say "coming soon". Never say "available now".',
    fa: 'حداکثر بگویید «به‌زودی». هرگز نگویید «اکنون در دسترس است».',
    tr: 'En fazla "yakında" deyin. Asla "şimdi mevcut" demeyin.',
  },
  available: {
    en: 'Availability may be stated as approved.',
    fa: 'در دسترس بودن را می‌توان همان‌طور که تأیید شده بیان کرد.',
    tr: 'Bulunurluk onaylandığı şekilde belirtilebilir.',
  },
}

export const VIEW_NOTICE: Record<ContentLang, string[]> = {
  en: [
    'Owner view of the approved content strategy. Drafts are never shown; a draft is counted under withheld.',
    'Voice, audience, messaging and claims are the approved facts, resolved now at the cited revisions.',
    'It authorizes no post, schedule, publication, ad or spend (authorizes: []).',
  ],
  fa: [
    'نمای مالک از استراتژی محتوای تأییدشده. پیش‌نویس‌ها هرگز نشان داده نمی‌شوند و فقط زیر withheld شمرده می‌شوند.',
    'لحن، مخاطب، پیام‌ها و ادعاها همان واقعیت‌های تأییدشده‌اند که اکنون در نسخه‌های ارجاع‌داده‌شده خوانده شده‌اند.',
    'هیچ ارسال، زمان‌بندی، انتشار، تبلیغ یا هزینه‌ای را مجاز نمی‌کند (authorizes: []).',
  ],
  tr: [
    'Onaylı içerik stratejisinin sahip görünümü. Taslaklar asla gösterilmez; taslak withheld altında sayılır.',
    'Ses tonu, hedef kitle, mesajlar ve iddialar, atıf yapılan sürümlerde şimdi çözülen onaylı bilgilerdir.',
    'Hiçbir paylaşım, zamanlama, yayın, reklam veya harcamaya izin vermez (authorizes: []).',
  ],
}

/** CLI lines. */
export const CLI_TEXT: Catalog = {
  draft_header: { en: 'Content strategy proposal (draft, not stored)', fa: 'پیشنهاد استراتژی محتوا (پیش‌نویس، ذخیره نشده)', tr: 'İçerik stratejisi önerisi (taslak, kaydedilmedi)' },
  sources: { en: 'Sources', fa: 'منابع', tr: 'Kaynaklar' },
  gaps: { en: 'Gaps (nothing is assumed in their place)', fa: 'کمبودها (چیزی به جای آن‌ها فرض نمی‌شود)', tr: 'Eksikler (yerlerine hiçbir şey varsayılmaz)' },
  no_gaps: { en: 'No gaps.', fa: 'کمبودی نیست.', tr: 'Eksik yok.' },
  pillars: { en: 'Pillars', fa: 'ستون‌ها', tr: 'Sütunlar' },
  channels: { en: 'Channels', fa: 'کانال‌ها', tr: 'Kanallar' },
  notes: { en: 'Notes', fa: 'یادداشت‌ها', tr: 'Notlar' },
  written: {
    en: 'Proposal written to {list}. Edit it, then: npm run brand:strategy -- propose --id {id} --file {list}',
    fa: 'پیشنهاد در {list} نوشته شد. ویرایشش کنید، سپس: npm run brand:strategy -- propose --id {id} --file {list}',
    tr: 'Öneri {list} dosyasına yazıldı. Düzenleyin, sonra: npm run brand:strategy -- propose --id {id} --file {list}',
  },
  stored: {
    en: 'Stored draft {id} revision {n}. Agents and the content view cannot see it. Review: npm run brand:strategy -- review --id {id} --revision {n}',
    fa: 'پیش‌نویس {id} نسخهٔ {n} ذخیره شد. عامل‌ها و نمای محتوا آن را نمی‌بینند. بازبینی: npm run brand:strategy -- review --id {id} --revision {n}',
    tr: '{id} taslağı, sürüm {n} kaydedildi. Ajanlar ve içerik görünümü onu göremez. İnceleme: npm run brand:strategy -- review --id {id} --revision {n}',
  },
  store_hint: {
    en: 'Nothing was stored. Add --out <file> to edit it first, or --store to store it as a draft now.',
    fa: 'چیزی ذخیره نشد. برای ویرایش، --out <file> را اضافه کنید یا با --store همین حالا آن را به‌عنوان پیش‌نویس ذخیره کنید.',
    tr: 'Hiçbir şey kaydedilmedi. Önce düzenlemek için --out <file> ekleyin veya şimdi taslak olarak kaydetmek için --store kullanın.',
  },
  none_approved: {
    en: 'No approved content strategy is served now.',
    fa: 'در حال حاضر هیچ استراتژی محتوای تأییدشده‌ای ارائه نمی‌شود.',
    tr: 'Şu anda sunulan onaylı bir içerik stratejisi yok.',
  },
  withheld: { en: 'Not shown', fa: 'نشان داده نشده', tr: 'Gösterilmeyen' },
  voice: { en: 'Voice', fa: 'لحن', tr: 'Ses tonu' },
  do: { en: 'Do', fa: 'انجام بده', tr: 'Yap' },
  dont: { en: 'Don’t', fa: 'انجام نده', tr: 'Yapma' },
  banned: { en: 'Never claim or say', fa: 'هرگز ادعا نکنید یا نگویید', tr: 'Asla iddia etmeyin veya söylemeyin' },
  not_decided: { en: 'not decided', fa: 'تعیین نشده', tr: 'karar verilmedi' },
  all: { en: 'all', fa: 'همه', tr: 'tümü' },
}
