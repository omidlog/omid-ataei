import type { ContentLang } from './i18n.js'

/**
 * Human-facing text of the content calendar (Content Bridge Slice B) in en/fa/tr: gaps, blockers, notices and CLI
 * lines. Codes stay stable English tokens. None of this is brand voice.
 */

type T = Record<ContentLang, string>

export const CAL_TEXT: Record<string, T> = {
  // planner
  plan_several: {
    en: 'Several content strategies are served ({list}). Choose one with --strategy <id>.',
    fa: 'چند استراتژی محتوا ارائه می‌شود ({list}). یکی را با --strategy <id> انتخاب کنید.',
    tr: 'Birden fazla içerik stratejisi sunuluyor ({list}). --strategy <id> ile birini seçin.',
  },
  plan_aligned: {
    en: 'Weeks run Monday to Sunday: {from} was moved to the Monday {monday}.',
    fa: 'هفته‌ها از دوشنبه تا یکشنبه‌اند: {from} به دوشنبهٔ {monday} منتقل شد.',
    tr: 'Haftalar pazartesiden pazara sürer: {from}, {monday} pazartesisine alındı.',
  },
  plan_research: {
    en: '{n} competitive observations were cited as research angles, each with its confidence. Their text stays in the research notes.',
    fa: '{n} مشاهدهٔ رقابتی به‌عنوان زاویهٔ پژوهشی، هر کدام با میزان اطمینانش، ارجاع داده شد. متن آن‌ها در یادداشت‌های پژوهشی می‌ماند.',
    tr: '{n} rakip gözlemi, her biri güven düzeyiyle birlikte araştırma açısı olarak atıf yapıldı. Metinleri araştırma notlarında kalır.',
  },
  // gaps
  cal_gap_cadence_not_decided: {
    en: '{channel}: cadence is not decided in the approved strategy, so no slots were planned. Set it in a new strategy revision.',
    fa: '{channel}: تناوب انتشار در استراتژی تأییدشده تعیین نشده، پس هیچ جایگاهی برنامه‌ریزی نشد. آن را در نسخهٔ تازهٔ استراتژی تعیین کنید.',
    tr: '{channel}: onaylı stratejide yayın sıklığı belirlenmedi, bu yüzden hiç yer planlanmadı. Yeni bir strateji sürümünde belirleyin.',
  },
  cal_gap_formats_not_decided: {
    en: '{channel}: no formats are decided, so slots have no format. The owner or writer chooses one before producing.',
    fa: '{channel}: هیچ قالبی تعیین نشده، پس جایگاه‌ها قالب ندارند. مالک یا نویسنده پیش از تولید یکی را انتخاب می‌کند.',
    tr: '{channel}: hiçbir format belirlenmedi, bu yüzden yerlerin formatı yok. Sahip veya yazar üretimden önce birini seçer.',
  },
  cal_gap_no_pillars: {
    en: '{channel}: the strategy has no pillars, so slots have no pillar.',
    fa: '{channel}: استراتژی ستون محتوایی ندارد، پس جایگاه‌ها ستون ندارند.',
    tr: '{channel}: stratejinin içerik sütunu yok, bu yüzden yerlerin sütunu yok.',
  },
  cal_gap_no_key_message: {
    en: 'No approved messaging or offer fact is cited by the strategy, so slots have no key message.',
    fa: 'استراتژی هیچ واقعیت تأییدشده‌ای برای پیام یا پیشنهاد ارجاع نمی‌دهد، پس جایگاه‌ها پیام اصلی ندارند.',
    tr: 'Strateji onaylı bir mesaj veya teklif bilgisine atıf yapmıyor, bu yüzden yerlerin ana mesajı yok.',
  },
  cal_gap_channel_not_in_strategy: {
    en: '{channel} is not a channel of the approved strategy. Nothing was planned for it.',
    fa: '{channel} کانالی از استراتژی تأییدشده نیست. چیزی برایش برنامه‌ریزی نشد.',
    tr: '{channel} onaylı stratejinin bir kanalı değil. Onun için hiçbir şey planlanmadı.',
  },
  cal_gap_no_source: {
    en: '{channel}: some slots would cite no approved fact, so they were left out.',
    fa: '{channel}: برخی جایگاه‌ها به هیچ واقعیت تأییدشده‌ای ارجاع نمی‌دادند، پس کنار گذاشته شدند.',
    tr: '{channel}: bazı yerler hiçbir onaylı bilgiye atıf yapmayacaktı, bu yüzden dışarıda bırakıldı.',
  },
  cal_gap_no_research: {
    en: 'Research angles were asked for, but no usable competitive observation exists. Record sources with brand:competitive.',
    fa: 'زاویهٔ پژوهشی خواسته شد، اما هیچ مشاهدهٔ رقابتی قابل‌استفاده‌ای نیست. منابع را با brand:competitive ثبت کنید.',
    tr: 'Araştırma açıları istendi ama kullanılabilir bir rakip gözlemi yok. Kaynakları brand:competitive ile kaydedin.',
  },
  // blockers
  cal_block_strategy_not_served: {
    en: 'Content strategy {id}@{rev} is not served now (draft, needs review, expired or withdrawn). Approve a strategy, then plan again.',
    fa: 'استراتژی محتوای {id}@{rev} اکنون ارائه نمی‌شود (پیش‌نویس، نیازمند بازبینی، منقضی یا پس‌گرفته). استراتژی را تأیید کنید و دوباره برنامه‌ریزی کنید.',
    tr: '{id}@{rev} içerik stratejisi şu anda sunulmuyor (taslak, inceleme gerekli, süresi dolmuş veya geri çekilmiş). Bir stratejiyi onaylayın, sonra yeniden planlayın.',
  },
  cal_block_strategy_changed: {
    en: 'The week was planned from {id}@{rev}, but revision {now} is served now. Plan the week again.',
    fa: 'این هفته از {id}@{rev} برنامه‌ریزی شد، اما اکنون نسخهٔ {now} ارائه می‌شود. هفته را دوباره برنامه‌ریزی کنید.',
    tr: 'Hafta {id}@{rev} sürümünden planlandı, ama şimdi {now} sürümü sunuluyor. Haftayı yeniden planlayın.',
  },
  cal_block_fact_restricted: {
    en: 'Fact {fact} is restricted and is never cited by the calendar.',
    fa: 'واقعیت {fact} محرمانه است و تقویم هرگز به آن ارجاع نمی‌دهد.',
    tr: '{fact} bilgisi kısıtlıdır ve takvim ona asla atıf yapmaz.',
  },
  cal_block_fact_changed: {
    en: 'Fact {fact} is {state} since the week was planned.',
    fa: 'واقعیت {fact} از زمان برنامه‌ریزی این هفته {state} است.',
    tr: '{fact} bilgisi hafta planlandığından beri {state} durumunda.',
  },
  cal_block_research_changed: {
    en: 'Research source {ref} is {state} since it was cited.',
    fa: 'منبع پژوهشی {ref} از زمان ارجاع {state} است.',
    tr: '{ref} araştırma kaynağı atıf yapıldığından beri {state} durumunda.',
  },
  cal_block_language_not_in_strategy: {
    en: 'Slot {slot}: language {lang} is not a language of the strategy for this channel.',
    fa: 'جایگاه {slot}: زبان {lang} از زبان‌های استراتژی برای این کانال نیست.',
    tr: '{slot} yeri: {lang} dili bu kanal için stratejinin dillerinden biri değil.',
  },
  cal_block_slot_no_source: {
    en: 'Slot {slot} cites no approved fact. Every slot serves an approved fact.',
    fa: 'جایگاه {slot} به هیچ واقعیت تأییدشده‌ای ارجاع نمی‌دهد. هر جایگاه باید در خدمت یک واقعیت تأییدشده باشد.',
    tr: '{slot} yeri hiçbir onaylı bilgiye atıf yapmıyor. Her yer onaylı bir bilgiye hizmet eder.',
  },
  cal_block_fact_not_pinned: {
    en: 'Slot {slot} cites {fact}, which is not pinned in the week fact_refs.',
    fa: 'جایگاه {slot} به {fact} ارجاع می‌دهد که در fact_refs هفته ثبت نشده است.',
    tr: '{slot} yeri {fact} bilgisine atıf yapıyor, ama bu haftanın fact_refs listesinde sabitlenmemiş.',
  },
  cal_block_fact_not_in_strategy: {
    en: 'Slot {slot} cites {fact}, which the approved content strategy does not cite.',
    fa: 'جایگاه {slot} به {fact} ارجاع می‌دهد که استراتژی محتوای تأییدشده به آن ارجاع نمی‌دهد.',
    tr: '{slot} yeri {fact} bilgisine atıf yapıyor, ama onaylı içerik stratejisi buna atıf yapmıyor.',
  },
  cal_block_research_not_pinned: {
    en: 'Slot {slot} cites a research source that is not in the week research_refs.',
    fa: 'جایگاه {slot} به منبع پژوهشی‌ای ارجاع می‌دهد که در research_refs هفته نیست.',
    tr: '{slot} yeri, haftanın research_refs listesinde olmayan bir araştırma kaynağına atıf yapıyor.',
  },
  cal_block_channel_not_in_strategy: {
    en: 'Slot {slot}: {channel} is not a channel of the approved strategy.',
    fa: 'جایگاه {slot}: {channel} کانالی از استراتژی تأییدشده نیست.',
    tr: '{slot} yeri: {channel} onaylı stratejinin bir kanalı değil.',
  },
  cal_block_format_not_in_channel: {
    en: 'Slot {slot}: format {format} is not approved for {channel}.',
    fa: 'جایگاه {slot}: قالب {format} برای {channel} تأیید نشده است.',
    tr: '{slot} yeri: {format} formatı {channel} için onaylı değil.',
  },
  cal_block_pillar_unknown: {
    en: 'Slot {slot}: pillar {pillar} is not a pillar of the approved strategy.',
    fa: 'جایگاه {slot}: ستون {pillar} از ستون‌های استراتژی تأییدشده نیست.',
    tr: '{slot} yeri: {pillar} sütunu onaylı stratejinin bir sütunu değil.',
  },
  cal_block_banned_claim: {
    en: 'Slot {slot} {field} contradicts the banned claim "{rule}". Rewrite it.',
    fa: '{field} جایگاه {slot} با ادعای ممنوع «{rule}» در تضاد است. آن را بازنویسی کنید.',
    tr: '{slot} yerinin {field} alanı "{rule}" yasak iddiasıyla çelişiyor. Yeniden yazın.',
  },
  cal_block_availability_claim: {
    en: 'Slot {slot} {field} states availability, but the approved availability rule is {rule}. Rewrite it.',
    fa: '{field} جایگاه {slot} از در دسترس بودن می‌گوید، اما قاعدهٔ تأییدشدهٔ دسترسی {rule} است. آن را بازنویسی کنید.',
    tr: '{slot} yerinin {field} alanı bulunurluk belirtiyor, ama onaylı bulunurluk kuralı {rule}. Yeniden yazın.',
  },
  cal_block_integrity: {
    en: '{week} does not verify (edited after it was written or approved). It is not served.',
    fa: '{week} اعتبارسنجی نمی‌شود (پس از نوشتن یا تأیید ویرایش شده). ارائه نمی‌شود.',
    tr: '{week} doğrulanamıyor (yazıldıktan veya onaylandıktan sonra düzenlenmiş). Sunulmuyor.',
  },
  cal_block_not_draft: {
    en: 'Revision {rev} is {state}. Only a draft can be approved or rejected.',
    fa: 'نسخهٔ {rev} در وضعیت {state} است. فقط پیش‌نویس را می‌توان تأیید یا رد کرد.',
    tr: '{rev} sürümü {state} durumunda. Yalnızca taslak onaylanabilir veya reddedilebilir.',
  },
  cal_block_approved_changed: {
    en: 'The approved revision of this week changed since the draft (was {was}, now {now}). Plan or propose again.',
    fa: 'نسخهٔ تأییدشدهٔ این هفته پس از پیش‌نویس تغییر کرد (قبلاً {was}، اکنون {now}). دوباره برنامه‌ریزی یا پیشنهاد کنید.',
    tr: 'Bu haftanın onaylı sürümü taslaktan sonra değişti (önce {was}, şimdi {now}). Yeniden planlayın veya önerin.',
  },
  cal_block_week_past: {
    en: '{week} is over. A past week cannot be approved.',
    fa: '{week} تمام شده است. هفتهٔ گذشته را نمی‌توان تأیید کرد.',
    tr: '{week} sona erdi. Geçmiş bir hafta onaylanamaz.',
  },
  cal_block_share_not_approved: {
    en: '{week} has no approved revision. Approve it before sharing.',
    fa: '{week} نسخهٔ تأییدشده‌ای ندارد. پیش از اشتراک‌گذاری آن را تأیید کنید.',
    tr: '{week} için onaylı bir sürüm yok. Paylaşmadan önce onaylayın.',
  },
  cal_block_share_not_current: {
    en: '{week} is {status}, not current. Only a current approved week is shared.',
    fa: '{week} در وضعیت {status} است، نه جاری. فقط هفتهٔ تأییدشدهٔ جاری به اشتراک گذاشته می‌شود.',
    tr: '{week} {status} durumunda, güncel değil. Yalnızca güncel onaylı bir hafta paylaşılır.',
  },
  // CLI
  plan_header: { en: 'Draft calendar (not stored) from {id}@{rev}', fa: 'تقویم پیش‌نویس (ذخیره نشده) از {id}@{rev}', tr: '{id}@{rev} kaynaklı taslak takvim (kaydedilmedi)' },
  week: { en: 'Week', fa: 'هفته', tr: 'Hafta' },
  no_slots: { en: 'no slots', fa: 'بدون جایگاه', tr: 'yer yok' },
  stored_week: {
    en: 'Stored draft {id} revision {n}. Agents and the calendar view cannot see it. Review: npm run brand:content -- week review --week {id} --revision {n}',
    fa: 'پیش‌نویس {id} نسخهٔ {n} ذخیره شد. عامل‌ها و نمای تقویم آن را نمی‌بینند. بازبینی: npm run brand:content -- week review --week {id} --revision {n}',
    tr: '{id} taslağı, sürüm {n} kaydedildi. Ajanlar ve takvim görünümü onu göremez. İnceleme: npm run brand:content -- week review --week {id} --revision {n}',
  },
  written_plan: {
    en: 'Weeks written to {list}. Edit hooks, angles or status, then: npm run brand:content -- week propose --file <week.json> (one week per file, from the weeks list).',
    fa: 'هفته‌ها در {list} نوشته شدند. قلاب، زاویه یا وضعیت را ویرایش کنید، سپس: npm run brand:content -- week propose --file <week.json> (هر فایل یک هفته از فهرست weeks).',
    tr: 'Haftalar {list} dosyasına yazıldı. Kanca, açı veya durumu düzenleyin, sonra: npm run brand:content -- week propose --file <week.json> (dosya başına bir hafta, weeks listesinden).',
  },
  plan_store_hint: {
    en: 'Nothing was stored. Add --out <file> to edit first, or --store to store each week as a draft now.',
    fa: 'چیزی ذخیره نشد. برای ویرایش، --out <file> را اضافه کنید یا با --store هر هفته را همین حالا به‌عنوان پیش‌نویس ذخیره کنید.',
    tr: 'Hiçbir şey kaydedilmedi. Önce düzenlemek için --out <file> ekleyin veya her haftayı şimdi taslak olarak kaydetmek için --store kullanın.',
  },
  approved_week: {
    en: 'Approved {id} revision {n}. It authorizes no post, schedule, publication, ad or spend.',
    fa: '{id} نسخهٔ {n} تأیید شد. هیچ ارسال، زمان‌بندی، انتشار، تبلیغ یا هزینه‌ای را مجاز نمی‌کند.',
    tr: '{id} sürüm {n} onaylandı. Hiçbir paylaşım, zamanlama, yayın, reklam veya harcamaya izin vermez.',
  },
  rejected_week: { en: 'Rejected {id} revision {n}. It stays on disk and is never served.', fa: '{id} نسخهٔ {n} رد شد. روی دیسک می‌ماند و هرگز ارائه نمی‌شود.', tr: '{id} sürüm {n} reddedildi. Diskte kalır ve asla sunulmaz.' },
  none_calendar: { en: 'No approved calendar week is served in this range.', fa: 'در این بازه هیچ هفتهٔ تأییدشده‌ای از تقویم ارائه نمی‌شود.', tr: 'Bu aralıkta sunulan onaylı bir takvim haftası yok.' },
  blockers: { en: 'Blockers', fa: 'موانع', tr: 'Engeller' },
  no_blockers: { en: 'No blockers.', fa: 'مانعی نیست.', tr: 'Engel yok.' },
  shared_week: {
    en: 'Wrote {list}. Commit and merge it to show this week in Studio. Studio shows it as of this approval; brand:content calendar stays the current truth.',
    fa: '{list} نوشته شد. برای نمایش این هفته در Studio آن را کامیت و ادغام کنید. Studio آن را مطابق همین تأیید نشان می‌دهد؛ brand:content calendar همچنان منبع فعلی است.',
    tr: '{list} yazıldı. Bu haftayı Studio’da göstermek için commit edip birleştirin. Studio onu bu onay itibarıyla gösterir; güncel doğru brand:content calendar olarak kalır.',
  },
  shared_preview: { en: 'Preview only (--dry-run). Nothing was written.', fa: 'فقط پیش‌نمایش (--dry-run). چیزی نوشته نشد.', tr: 'Yalnızca önizleme (--dry-run). Hiçbir şey yazılmadı.' },
}

export const CAL_NOTICE: Record<ContentLang, string[]> = {
  en: [
    'Owner view of approved calendar weeks. Drafts are never shown; they are counted under withheld.',
    'Slots cite approved facts by id; the values are read now. Hooks and angles are owner text, checked against the banned claims.',
    'An approved week authorizes no post, schedule, publication, ad or spend (authorizes: []).',
  ],
  fa: [
    'نمای مالک از هفته‌های تأییدشدهٔ تقویم. پیش‌نویس‌ها هرگز نشان داده نمی‌شوند و فقط زیر withheld شمرده می‌شوند.',
    'جایگاه‌ها با شناسه به واقعیت‌های تأییدشده ارجاع می‌دهند و مقدارها همین حالا خوانده می‌شوند. قلاب‌ها و زاویه‌ها متن مالک‌اند و با ادعاهای ممنوع سنجیده می‌شوند.',
    'هفتهٔ تأییدشده هیچ ارسال، زمان‌بندی، انتشار، تبلیغ یا هزینه‌ای را مجاز نمی‌کند (authorizes: []).',
  ],
  tr: [
    'Onaylı takvim haftalarının sahip görünümü. Taslaklar asla gösterilmez; withheld altında sayılır.',
    'Yerler onaylı bilgilere kimlikle atıf yapar; değerler şimdi okunur. Kancalar ve açılar sahip metnidir ve yasak iddialara karşı denetlenir.',
    'Onaylı bir hafta hiçbir paylaşım, zamanlama, yayın, reklam veya harcamaya izin vermez (authorizes: []).',
  ],
}
