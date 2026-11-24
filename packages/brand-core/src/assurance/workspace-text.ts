/**
 * Human text for the owner-local workspace bridge (GAP-09), in en / fa / tr, and the plain-text
 * renderers for a snapshot and a verify result.
 *
 * Like `report.ts`, these print only what the snapshot carries: ids, revisions (shortened), states and
 * closed-vocabulary values. No brand value can be printed, because the snapshot holds none. The gap
 * report itself is the existing `renderGapReport`; nothing about it is redone here.
 */

import { CONTROL_TEXT, fill, type AssuranceLang } from './i18n.js'
import type { AssuranceSnapshot, JudgmentState, LinkItem, MissingItem, MissingKind, ReviewItem, SubjectSource, VerifyResult } from './workspace.js'
import type { Judgment, ReviewRevision } from './reviews.js'
import type { LinkRevision, LinkState } from './links.js'
import type { EvidenceStatus } from '../evidence.js'
import type { FactPresence } from './assess.js'
import type { SubjectField } from './controls.js'

type T = Record<AssuranceLang, string>
type Catalog = Record<string, T>

export const BRIDGE_TEXT: Catalog = {
  title: { en: 'Assurance snapshot — owner-local', fa: 'تصویر لحظه‌ای ارزیابی — فقط محلی و برای مالک', tr: 'Güvence anlık görüntüsü — yalnızca sahibin yerel ortamı' },
  disclaimer: {
    en: 'Internal assessment against Brand OS’s own method. It is not a certification, not a compliance statement and not an independent audit.',
    fa: 'ارزیابی داخلی بر پایهٔ متد خود Brand OS. این گواهی‌نامه، اظهارِ انطباق یا ممیزی مستقل نیست.',
    tr: 'Brand OS’un kendi yöntemine göre iç değerlendirme. Bir sertifika, uyumluluk beyanı veya bağımsız denetim değildir.',
  },
  brand: { en: 'Brand', fa: 'برند', tr: 'Marka' },
  digest: { en: 'Snapshot digest', fa: 'چکیدهٔ تصویر لحظه‌ای', tr: 'Anlık görüntü özeti' },
  bridge: { en: 'Bridge version', fa: 'نسخهٔ پل', tr: 'Köprü sürümü' },
  subject: { en: 'Subject', fa: 'موضوع ارزیابی', tr: 'Değerlendirilen' },
  reproduce: {
    en: 'Re-run with --as-of {as_of} --audience {audience}{paid} on the same workspace to get the same digest.',
    fa: 'برای گرفتن همین چکیده، روی همین فضای کاری دوباره با ‎--as-of {as_of} --audience {audience}{paid}‎ اجرا کنید.',
    tr: 'Aynı özeti almak için aynı çalışma alanında --as-of {as_of} --audience {audience}{paid} ile yeniden çalıştırın.',
  },
  paid_media_deprecated: {
    en: '--paid-media is deprecated. Answer the interview question business.marketing.paid_media instead; the flag is used only while that question has no approved answer.',
    fa: '‎--paid-media‎ منسوخ شده است. به جای آن به پرسش مصاحبهٔ business.marketing.paid_media پاسخ دهید؛ این گزینه فقط تا وقتی آن پرسش پاسخ تأییدشده ندارد به کار می‌رود.',
    tr: '--paid-media kullanımdan kaldırıldı. Bunun yerine business.marketing.paid_media görüşme sorusunu yanıtlayın; bu seçenek yalnızca o sorunun onaylı yanıtı yokken kullanılır.',
  },
  paid_media_ignored: {
    en: '--paid-media was ignored: the approved answer to business.marketing.paid_media is used.',
    fa: '‎--paid-media‎ نادیده گرفته شد: پاسخ تأییدشدهٔ business.marketing.paid_media به کار رفت.',
    tr: '--paid-media yok sayıldı: business.marketing.paid_media sorusunun onaylı yanıtı kullanıldı.',
  },
  paid_media_ignored_undecided: {
    en: '--paid-media was ignored: the approved interview answer to business.marketing.paid_media is "undecided", and that answer is used. Paid media stays unknown until you answer yes or no.',
    fa: '‎--paid-media‎ نادیده گرفته شد: پاسخ تأییدشدهٔ مصاحبه به business.marketing.paid_media «هنوز تصمیم نگرفته‌ام» (undecided) است و همان پاسخ به کار رفت. تا وقتی «بله» یا «نه» پاسخ ندهید، تبلیغات پولی نامعلوم می‌ماند.',
    tr: '--paid-media yok sayıldı: business.marketing.paid_media sorusunun onaylı görüşme yanıtı "kararsız" (undecided) ve bu yanıt kullanıldı. Evet ya da hayır yanıtlayana kadar ücretli medya bilinmiyor olarak kalır.',
  },
  personal_brand: {
    en: 'Personal brand (personal module): tracked separately, facets {facets}. It does not change whether this brand is a company or a person.',
    fa: 'برند شخصی (ماژول personal): جداگانه پیگیری می‌شود، وجه‌ها {facets}. این تعیین نمی‌کند که این برند شرکت است یا شخص.',
    tr: 'Kişisel marka (personal modülü): ayrı izlenir, yönler {facets}. Bu markanın şirket mi kişi mi olduğunu değiştirmez.',
  },
  no_facets: { en: 'none', fa: 'هیچ', tr: 'yok' },
  scoreable: {
    en: 'Nothing blocking: the existing evaluator may give a completeness ratio.',
    fa: 'هیچ مانعی نیست: ارزیاب موجود می‌تواند نسبت کامل‌بودن را بدهد.',
    tr: 'Engelleyen bir şey yok: mevcut değerlendirici bir tamlık oranı verebilir.',
  },
  not_scoreable: {
    en: 'No score. The snapshot is incomplete; these items must be resolved first:',
    fa: 'امتیازی داده نمی‌شود. تصویر لحظه‌ای ناقص است؛ اول این موارد باید حل شوند:',
    tr: 'Puan yok. Anlık görüntü eksik; önce şunlar çözülmeli:',
  },
  gaps: { en: 'Gaps (counted as not complete, never filled in):', fa: 'کمبودها (ناکامل شمرده می‌شوند و هرگز پر نمی‌شوند):', tr: 'Eksikler (tamamlanmamış sayılır, asla doldurulmaz):' },
  nothing_missing: { en: 'Nothing is missing.', fa: 'چیزی کم نیست.', tr: 'Eksik bir şey yok.' },
  authorizes: {
    en: 'authorizes: [] — this snapshot approves, publishes, spends and changes nothing.',
    fa: 'authorizes: [] — این تصویر لحظه‌ای هیچ چیزی را تأیید، منتشر، هزینه یا تغییر نمی‌دهد.',
    tr: 'authorizes: [] — bu anlık görüntü hiçbir şeyi onaylamaz, yayımlamaz, harcamaz veya değiştirmez.',
  },
  verify_title: { en: 'Snapshot verification', fa: 'راستی‌آزمایی تصویر لحظه‌ای', tr: 'Anlık görüntü doğrulaması' },
  verify_same: {
    en: 'Reproduced: the workspace gives the same digest as the kept snapshot.',
    fa: 'بازتولید شد: فضای کاری همان چکیدهٔ تصویر نگه‌داشته‌شده را می‌دهد.',
    tr: 'Yeniden üretildi: çalışma alanı saklanan anlık görüntüyle aynı özeti veriyor.',
  },
  verify_diff: {
    en: 'Not reproduced: the workspace changed since the snapshot was kept.',
    fa: 'بازتولید نشد: فضای کاری از زمان نگه‌داشتن این تصویر تغییر کرده است.',
    tr: 'Yeniden üretilemedi: anlık görüntü saklandığından beri çalışma alanı değişti.',
  },
  expected: { en: 'Kept digest', fa: 'چکیدهٔ نگه‌داشته', tr: 'Saklanan özet' },
  actual: { en: 'Digest now', fa: 'چکیدهٔ کنونی', tr: 'Şimdiki özet' },
  verify_unnamed: {
    en: 'No cited source changed. Either something was added since (an answer approved, a research note captured, or an owner judgment recorded for this day), or the kept file was edited.',
    fa: 'هیچ منبع ارجاع‌شده‌ای تغییر نکرده است. یا از آن زمان چیزی اضافه شده (پاسخی تأیید شده، یادداشت پژوهشی‌ای ثبت شده، یا داوری مالک برای همین روز ثبت شده)، یا فایل نگه‌داشته ویرایش شده است.',
    tr: 'Atıf yapılan hiçbir kaynak değişmedi. Ya o zamandan beri bir şey eklendi (bir yanıt onaylandı, bir araştırma notu eklendi veya bu gün için sahibin kararı kaydedildi) ya da saklanan dosya düzenlendi.',
  },
  changed_refs: { en: 'Cited sources that changed:', fa: 'منابع ارجاع‌شده‌ای که تغییر کرده‌اند:', tr: 'Değişen kaynaklar:' },
  refused_agent: {
    en: 'Assurance on a real brand is the owner’s local review. Refusing while BRAND_OS_AGENT_TOKEN is set; no agent profile covers it.',
    fa: 'ارزیابی روی برند واقعی بازبینی محلی مالک است. تا وقتی BRAND_OS_AGENT_TOKEN تنظیم است اجرا نمی‌شود؛ هیچ پروفایل عاملی آن را پوشش نمی‌دهد.',
    tr: 'Gerçek bir markada güvence, sahibin yerel incelemesidir. BRAND_OS_AGENT_TOKEN ayarlıyken reddedilir; hiçbir ajan profili bunu kapsamaz.',
  },
  not_a_brand: {
    en: 'This folder is not a Brand OS brand (brand/brand.config.yaml is missing). Run the command from the brand repository root.',
    fa: 'این پوشه برند Brand OS نیست (brand/brand.config.yaml وجود ندارد). فرمان را از ریشهٔ مخزن برند اجرا کنید.',
    tr: 'Bu klasör bir Brand OS markası değil (brand/brand.config.yaml yok). Komutu marka deposunun kökünden çalıştırın.',
  },
  invalid_pin: {
    en: 'The snapshot file could not be used: {reason}',
    fa: 'فایل تصویر لحظه‌ای قابل استفاده نبود: {reason}',
    tr: 'Anlık görüntü dosyası kullanılamadı: {reason}',
  },
  evidence_links: { en: 'Research notes linked to the evidence register:', fa: 'یادداشت‌های پژوهشیِ پیوندخورده به دفتر شواهد:', tr: 'Kanıt kaydına bağlı araştırma notları:' },
  invalid_link: {
    en: 'A stored evidence link or the evidence register could not be used, so nothing was built: {reason}',
    fa: 'یک پیوند شواهدِ ذخیره‌شده یا دفتر شواهد قابل استفاده نبود، پس چیزی ساخته نشد: {reason}',
    tr: 'Kayıtlı bir kanıt bağlantısı veya kanıt kaydı kullanılamadı, bu yüzden hiçbir şey oluşturulmadı: {reason}',
  },
  invalid_review: {
    en: 'A stored review judgment could not be used, so no snapshot was built: {reason}',
    fa: 'یک داوری بازبینیِ ذخیره‌شده قابل استفاده نبود، پس تصویر لحظه‌ای ساخته نشد: {reason}',
    tr: 'Kayıtlı bir inceleme kararı kullanılamadı, bu yüzden anlık görüntü oluşturulmadı: {reason}',
  },
  unexpected: {
    en: 'Unexpected error ({name}). The bridge is read-only, so nothing about the brand changed.',
    fa: 'خطای پیش‌بینی‌نشده ({name}). این پل فقط‌خواندنی است، پس چیزی در برند تغییر نکرد.',
    tr: 'Beklenmeyen hata ({name}). Köprü salt okunurdur, bu yüzden markada hiçbir şey değişmedi.',
  },
}

export const MISSING_KIND_TEXT: Record<MissingKind, T> = {
  subject_field: { en: 'Scope not stated', fa: 'دامنه مشخص نشده', tr: 'Kapsam belirtilmedi' },
  fact: { en: 'No approved fact', fa: 'واقعیت تأییدشده‌ای نیست', tr: 'Onaylı bilgi yok' },
  evidence: { en: 'No research note', fa: 'یادداشت پژوهشی نیست', tr: 'Araştırma notu yok' },
  independent_evidence: {
    en: 'Only the owner’s own notes: link one to a verified evidence-register entry (brand:assurance-link)',
    fa: 'فقط یادداشت‌های خود مالک: یکی را به یک مدرک تأییدشده در دفتر شواهد پیوند دهید (brand:assurance-link)',
    tr: 'Yalnızca sahibin kendi notları: birini doğrulanmış bir kanıt kaydına bağlayın (brand:assurance-link)',
  },
  reviewer_judgment: { en: 'A person must judge this control', fa: 'یک انسان باید این کنترل را داوری کند', tr: 'Bu kontrolü bir kişi değerlendirmeli' },
  stale_judgment: {
    en: 'The owner’s judgment is out of date: what it was about changed. Judge it again (brand:assurance-review)',
    fa: 'داوری مالک کهنه شده است: چیزی که درباره‌اش بود تغییر کرده. دوباره داوری کنید (brand:assurance-review)',
    tr: 'Sahibin kararı güncel değil: değerlendirdiği şey değişti. Yeniden değerlendirin (brand:assurance-review)',
  },
  changed_source: { en: 'A cited source changed', fa: 'منبع ارجاع‌شده تغییر کرده', tr: 'Atıf yapılan kaynak değişti' },
}

export const PRESENCE_TEXT: Record<FactPresence, T> = {
  approved: { en: 'approved', fa: 'تأییدشده', tr: 'onaylı' },
  draft: { en: 'answered, not approved', fa: 'پاسخ داده شده، تأیید نشده', tr: 'yanıtlandı, onaylanmadı' },
  unknown: { en: 'owner said unknown', fa: 'مالک گفته نمی‌داند', tr: 'sahip bilinmiyor dedi' },
  not_applicable: { en: 'owner said not applicable', fa: 'مالک گفته مربوط نیست', tr: 'sahip uygulanamaz dedi' },
  absent: { en: 'not answered', fa: 'پاسخ داده نشده', tr: 'yanıtlanmadı' },
}

export const SUBJECT_FIELD_TEXT: Record<SubjectField, T> = {
  entity_kind: { en: 'Company or person', fa: 'شرکت یا شخص', tr: 'Şirket veya kişi' },
  sells: { en: 'Sells something', fa: 'چیزی می‌فروشد', tr: 'Bir şey satıyor' },
  stage: { en: 'Stage', fa: 'مرحله', tr: 'Aşama' },
  runs_paid_media: { en: 'Runs paid media', fa: 'تبلیغات پولی اجرا می‌کند', tr: 'Ücretli medya kullanıyor' },
}

export const SUBJECT_SOURCE_TEXT: Record<SubjectSource, T> = {
  approved_fact: { en: 'from an approved fact', fa: 'از یک واقعیت تأییدشده', tr: 'onaylı bir bilgiden' },
  brand_config: { en: 'from brand.config.yaml', fa: 'از brand.config.yaml', tr: 'brand.config.yaml dosyasından' },
  owner_flag: {
    en: 'stated on the command line with the deprecated --paid-media',
    fa: 'اعلام‌شده در خط فرمان با گزینهٔ منسوخ ‎--paid-media‎',
    tr: 'kullanımdan kaldırılan --paid-media ile komut satırında belirtildi',
  },
  none: { en: 'not stated', fa: 'اعلام نشده', tr: 'belirtilmedi' },
}

/** The CLI's help, in three languages. Command names and flags stay as typed. */
export const BRIDGE_HELP: T = {
  en: `brand:assurance <command> [options]   owner-local, read-only

  snapshot [--as-of YYYY-MM-DD] [--audience public|internal|restricted]
           [--pin <snapshot.json>] [--lang en|fa|tr] [--json]
                     pin the brand's approved facts, research notes and contradictions for the
                     Positioning Readiness method, and list what is missing
  assess   (same options)
                     the snapshot, then the existing gap report for it
  verify --snapshot <snapshot.json> [--lang en|fa|tr] [--json]
                     rebuild a kept snapshot from the workspace now and say whether the digest is the same

Paid media comes from the interview question business.marketing.paid_media. --paid-media yes|no is
deprecated and used only while that question has no approved answer.
Nothing is written. Print to the terminal and redirect it yourself if you want to keep a snapshot.
No score is given while anything blocking is missing. This is an internal assessment, never a
certification or a compliance statement; authorizes is always empty. Refused while BRAND_OS_AGENT_TOKEN is set.`,
  fa: `brand:assurance <command> [options]   فقط محلی و فقط‌خواندنی، برای مالک

  snapshot [--as-of YYYY-MM-DD] [--audience public|internal|restricted]
           [--pin <snapshot.json>] [--lang en|fa|tr] [--json]
                     واقعیت‌های تأییدشده، یادداشت‌های پژوهشی و تناقض‌های برند را برای متد «آمادگی جایگاه‌یابی»
                     سنجاق می‌کند و آنچه کم است را فهرست می‌کند
  assess   (همان گزینه‌ها)
                     تصویر لحظه‌ای و سپس گزارش کمبودهای موجود برای آن
  verify --snapshot <snapshot.json> [--lang en|fa|tr] [--json]
                     تصویر نگه‌داشته را از فضای کاری کنونی دوباره می‌سازد و می‌گوید چکیده همان است یا نه

اجرای تبلیغات پولی از پرسش مصاحبهٔ business.marketing.paid_media خوانده می‌شود. ‎--paid-media yes|no‎ منسوخ است
و فقط تا وقتی آن پرسش پاسخ تأییدشده ندارد به کار می‌رود.
چیزی نوشته نمی‌شود. خروجی در ترمینال چاپ می‌شود؛ اگر می‌خواهید نگهش دارید خودتان آن را هدایت کنید.
تا وقتی موردی مانع کم است، امتیازی داده نمی‌شود. این ارزیابی داخلی است و هرگز گواهی‌نامه یا اظهار انطباق نیست؛
authorizes همیشه خالی است. تا وقتی BRAND_OS_AGENT_TOKEN تنظیم است اجرا نمی‌شود.`,
  tr: `brand:assurance <command> [options]   yalnızca sahibin yerel ortamı, salt okunur

  snapshot [--as-of YYYY-MM-DD] [--audience public|internal|restricted]
           [--pin <snapshot.json>] [--lang en|fa|tr] [--json]
                     markanın onaylı bilgilerini, araştırma notlarını ve çelişkilerini Konumlandırma Hazırlığı
                     yöntemi için sabitler ve eksikleri listeler
  assess   (aynı seçenekler)
                     anlık görüntü, ardından onun için mevcut eksik raporu
  verify --snapshot <snapshot.json> [--lang en|fa|tr] [--json]
                     saklanan bir anlık görüntüyü şimdiki çalışma alanından yeniden kurar ve özetin aynı olup olmadığını söyler

Ücretli medya bilgisi business.marketing.paid_media görüşme sorusundan gelir. --paid-media yes|no kullanımdan
kaldırıldı ve yalnızca o sorunun onaylı yanıtı yokken kullanılır.
Hiçbir şey yazılmaz. Çıktı terminale basılır; saklamak isterseniz kendiniz yönlendirin.
Engelleyen bir eksik varken puan verilmez. Bu bir iç değerlendirmedir; asla sertifika veya uyumluluk beyanı değildir;
authorizes her zaman boştur. BRAND_OS_AGENT_TOKEN ayarlıyken reddedilir.`,
}

/** List separator: Persian uses its own comma (U+060C). */
function comma(lang: AssuranceLang): string {
  return lang === 'fa' ? '، ' : ', '
}

function missingLine(entry: MissingItem, lang: AssuranceLang): string {
  const parts = [MISSING_KIND_TEXT[entry.kind][lang]]
  if (entry.control_id) parts.push(entry.control_id)
  if (entry.field) parts.push(SUBJECT_FIELD_TEXT[entry.field][lang])
  if (entry.question_ids.length > 0) parts.push(entry.question_ids.map((id) => `\`${id}\``).join(comma(lang)))
  if (entry.presence) parts.push(PRESENCE_TEXT[entry.presence][lang])
  if (entry.flag) parts.push(`\`${entry.flag}\``)
  return `- ${parts.join(' · ')}`
}

/** The bridge's header: what was pinned, how to reproduce it, and what is missing. Ids only. */
export function renderSnapshotSummary(snapshot: AssuranceSnapshot, lang: AssuranceLang): string {
  const lines: string[] = [`# ${BRIDGE_TEXT.title![lang]}`, '', `> ${BRIDGE_TEXT.disclaimer![lang]}`, '']
  lines.push(`- ${BRIDGE_TEXT.brand![lang]}: \`${snapshot.brand_id}\``)
  lines.push(`- ${BRIDGE_TEXT.bridge![lang]}: \`${snapshot.bridge_version}\``)
  lines.push(`- ${BRIDGE_TEXT.digest![lang]}: \`${snapshot.source_snapshot_digest}\``)
  const paid = snapshot.paid_media_statement === 'unknown' ? '' : ` --paid-media ${snapshot.paid_media_statement}`
  lines.push(`- ${fill(BRIDGE_TEXT.reproduce![lang], { as_of: snapshot.as_of.slice(0, 10), audience: snapshot.audience, paid })}`)
  lines.push(`- ${BRIDGE_TEXT.subject![lang]}:`)
  for (const entry of snapshot.subject_provenance) {
    lines.push(`  - ${SUBJECT_FIELD_TEXT[entry.field][lang]}: \`${entry.value}\` (${SUBJECT_SOURCE_TEXT[entry.source][lang]}${entry.question_id ? `${comma(lang)}\`${entry.question_id}\`` : ''})`)
  }
  // A company brand's founder: tracked beside the company, never folded into the subject.
  if (snapshot.personal_brand.enabled && snapshot.personal_brand.brand_entity_kind === 'company') {
    const facets = snapshot.personal_brand.facets.length > 0 ? snapshot.personal_brand.facets.map((facet) => `\`${facet}\``).join(comma(lang)) : BRIDGE_TEXT.no_facets![lang]
    lines.push(`- ${fill(BRIDGE_TEXT.personal_brand![lang], { facets })}`)
  }
  lines.push('')
  const blocking = snapshot.missing.filter((entry) => entry.blocking)
  const gaps = snapshot.missing.filter((entry) => !entry.blocking)
  if (blocking.length > 0) {
    lines.push(BRIDGE_TEXT.not_scoreable![lang])
    for (const entry of blocking) lines.push(missingLine(entry, lang))
  } else {
    lines.push(BRIDGE_TEXT.scoreable![lang])
  }
  lines.push('')
  if (gaps.length > 0) {
    lines.push(BRIDGE_TEXT.gaps![lang])
    for (const entry of gaps) lines.push(missingLine(entry, lang))
  } else if (blocking.length === 0) {
    lines.push(BRIDGE_TEXT.nothing_missing![lang])
  }
  // Snapshots kept before bridge version 3 have no links at all.
  const links = snapshot.evidence_links ?? []
  if (links.length > 0) {
    lines.push('', BRIDGE_TEXT.evidence_links![lang])
    for (const link of links) lines.push(`- \`${link.note_id}\` → \`${link.evidence_id}\` · ${LINK_STATE_TEXT[link.state][lang]}`)
  }
  lines.push('', `- ${BRIDGE_TEXT.authorizes![lang]}`, '')
  return lines.join('\n')
}

export function renderVerifyResult(result: VerifyResult, lang: AssuranceLang): string {
  const lines: string[] = [`# ${BRIDGE_TEXT.verify_title![lang]}`, '', `> ${BRIDGE_TEXT.disclaimer![lang]}`, '']
  lines.push(result.reproduced ? BRIDGE_TEXT.verify_same![lang] : BRIDGE_TEXT.verify_diff![lang], '')
  lines.push(`- ${BRIDGE_TEXT.expected![lang]}: \`${result.expected_digest}\``)
  lines.push(`- ${BRIDGE_TEXT.actual![lang]}: \`${result.actual_digest}\``)
  if (result.changed.length > 0) {
    lines.push('', BRIDGE_TEXT.changed_refs![lang])
    for (const ref of result.changed) lines.push(`- \`${ref.kind}:${ref.id}\` (${ref.state})`)
  } else if (!result.reproduced) {
    lines.push('', BRIDGE_TEXT.verify_unnamed![lang])
  }
  lines.push('', `- ${BRIDGE_TEXT.authorizes![lang]}`, '')
  return lines.join('\n')
}

// ---- owner review judgments (brand:assurance-review) ---------------------------------------------

export const JUDGMENT_TEXT: Record<Judgment, T> = {
  yes: { en: 'yes', fa: 'بله', tr: 'evet' },
  partly: { en: 'partly', fa: 'تا حدی', tr: 'kısmen' },
  no: { en: 'no', fa: 'خیر', tr: 'hayır' },
}

export const JUDGMENT_STATE_TEXT: Record<JudgmentState, T> = {
  needs_judgment: { en: 'Needs your judgment', fa: 'به داوری شما نیاز دارد', tr: 'Kararınızı bekliyor' },
  judged: { en: 'Judged, still current', fa: 'داوری شده و هنوز معتبر است', tr: 'Değerlendirildi, hâlâ geçerli' },
  stale: { en: 'Judged, but out of date: judge it again', fa: 'داوری شده اما کهنه است: دوباره داوری کنید', tr: 'Değerlendirildi ama güncel değil: yeniden değerlendirin' },
}

/** The plain question each judgment control asks the owner. Every `reviewer_judgment` control has one. */
export const REVIEW_PROMPT: Record<string, T> = {
  'PRR-08': {
    en: 'Is the differentiation claim actually backed by the cited evidence? Answer yes, partly or no, with a short note.',
    fa: 'آیا ادعای تمایز واقعاً با شواهد ارجاع‌شده پشتیبانی می‌شود؟ با بله، تا حدی یا خیر و یک یادداشت کوتاه پاسخ دهید.',
    tr: 'Farklılaşma iddiası atıf yapılan kanıtlarla gerçekten destekleniyor mu? Evet, kısmen veya hayır diye ve kısa bir notla yanıtlayın.',
  },
}

export const REVIEW_TEXT: Catalog = {
  title: { en: 'Owner review judgments — owner-local', fa: 'داوری‌های بازبینی مالک — فقط محلی', tr: 'Sahip inceleme kararları — yalnızca yerel' },
  intro: {
    en: 'These controls need a person’s judgment. Until each has a current one, the assessment gives no score.',
    fa: 'این کنترل‌ها به داوری یک انسان نیاز دارند. تا وقتی هر کدام داوری معتبر نداشته باشد، ارزیابی امتیازی نمی‌دهد.',
    tr: 'Bu kontroller bir kişinin kararını gerektirir. Her birinin geçerli bir kararı olana kadar değerlendirme puan vermez.',
  },
  none: { en: 'No control under this method needs a person’s judgment.', fa: 'هیچ کنترلی در این متد به داوری انسان نیاز ندارد.', tr: 'Bu yöntemde bir kişinin kararını gerektiren kontrol yok.' },
  question: { en: 'Question', fa: 'پرسش', tr: 'Soru' },
  state: { en: 'State', fa: 'وضعیت', tr: 'Durum' },
  latest: { en: 'Judgment in force', fa: 'داوری جاری', tr: 'Geçerli karar' },
  note: { en: 'Your note', fa: 'یادداشت شما', tr: 'Notunuz' },
  revisions: { en: 'Recorded revisions', fa: 'نسخه‌های ثبت‌شده', tr: 'Kayıtlı sürümler' },
  facts_now: { en: 'Facts it is about', fa: 'واقعیت‌هایی که درباره‌شان است', tr: 'İlgili bilgiler' },
  notes_now: { en: 'Research notes it is about', fa: 'یادداشت‌های پژوهشی مربوط', tr: 'İlgili araştırma notları' },
  no_notes: { en: 'none yet (capture one with brand:knowledge)', fa: 'هنوز هیچ (با brand:knowledge ثبت کنید)', tr: 'henüz yok (brand:knowledge ile ekleyin)' },
  approved: { en: 'approved', fa: 'تأییدشده', tr: 'onaylı' },
  not_approved: { en: 'not approved', fa: 'تأیید نشده', tr: 'onaylanmadı' },
  owner_stated: {
    en: 'Research notes count as the owner’s own statements, not independent evidence, unless linked to a verified evidence-register entry (brand:assurance-link).',
    fa: 'یادداشت‌های پژوهشی گفتهٔ خود مالک شمرده می‌شوند، نه شواهد مستقل؛ مگر اینکه به یک مدرک تأییدشده در دفتر شواهد پیوند خورده باشند (brand:assurance-link).',
    tr: 'Araştırma notları, doğrulanmış bir kanıt kaydına bağlanmadıkça (brand:assurance-link) bağımsız kanıt değil, sahibin kendi beyanı sayılır.',
  },
  changed: { en: 'Changed since the judgment', fa: 'تغییرکرده از زمان داوری', tr: 'Karardan beri değişenler' },
  conflicts: {
    en: 'Open contradictions (reported before any judgment)',
    fa: 'تناقض‌های باز (پیش از هر داوری گزارش می‌شوند)',
    tr: 'Açık çelişkiler (her karardan önce raporlanır)',
  },
  how: {
    en: 'Record one: npm run brand:assurance-review -- record --control {control} --judgment yes|partly|no --note "…" [--date YYYY-MM-DD]',
    fa: 'ثبت داوری: ‎npm run brand:assurance-review -- record --control {control} --judgment yes|partly|no --note "…" [--date YYYY-MM-DD]‎',
    tr: 'Kaydetmek için: npm run brand:assurance-review -- record --control {control} --judgment yes|partly|no --note "…" [--date YYYY-MM-DD]',
  },
  recorded: {
    en: 'Recorded {control}: {judgment} on {date} (revision {revision}). Run brand:assurance assess to see the result.',
    fa: 'برای {control} ثبت شد: {judgment} در {date} (نسخهٔ {revision}). برای دیدن نتیجه brand:assurance assess را اجرا کنید.',
    tr: '{control} kaydedildi: {date} tarihinde {judgment} (sürüm {revision}). Sonucu görmek için brand:assurance assess çalıştırın.',
  },
  stored: {
    en: 'Stored privately in brand/.private/assurance/reviews/ (gitignored, never read by agents, Studio or docs).',
    fa: 'به‌طور خصوصی در brand/.private/assurance/reviews/ ذخیره شد (در git نیست و عامل‌ها، Studio و مستندات آن را نمی‌خوانند).',
    tr: 'brand/.private/assurance/reviews/ içinde gizli olarak saklandı (git dışında; ajanlar, Studio ve belgeler okumaz).',
  },
  refused_agent: {
    en: 'Review judgments are the owner’s own. Refusing while BRAND_OS_AGENT_TOKEN is set; no agent profile covers them.',
    fa: 'داوری‌های بازبینی فقط مال مالک است. تا وقتی BRAND_OS_AGENT_TOKEN تنظیم است اجرا نمی‌شود؛ هیچ پروفایل عاملی آن را پوشش نمی‌دهد.',
    tr: 'İnceleme kararları yalnızca sahibe aittir. BRAND_OS_AGENT_TOKEN ayarlıyken reddedilir; hiçbir ajan profili bunu kapsamaz.',
  },
  rejected: { en: 'Not recorded: {reason}', fa: 'ثبت نشد: {reason}', tr: 'Kaydedilmedi: {reason}' },
  unexpected: {
    en: 'Unexpected error ({name}). A judgment is written in one atomic step: either it was recorded in full or not at all. Run list to check.',
    fa: 'خطای پیش‌بینی‌نشده ({name}). داوری در یک گام اتمی نوشته می‌شود: یا کامل ثبت شده یا اصلاً ثبت نشده. برای اطمینان list را اجرا کنید.',
    tr: 'Beklenmeyen hata ({name}). Bir karar tek bir atomik adımda yazılır: ya tamamen kaydedildi ya da hiç kaydedilmedi. Kontrol için list çalıştırın.',
  },
}

export const REVIEW_HELP: T = {
  en: `brand:assurance-review <command> [options]   owner-local; refused while BRAND_OS_AGENT_TOKEN is set

  list   [--as-of YYYY-MM-DD] [--show-notes] [--lang en|fa|tr] [--json]
                     the controls that need a person's judgment, and where each stands
  record --control <id> --judgment yes|partly|no --note "<short reason>" [--date YYYY-MM-DD]
         [--expect <revision>|none] [--lang en|fa|tr] [--json]
                     record your judgment; it is about the facts and research notes cited now,
                     and goes out of date by itself when any of them changes

Judgments are versioned in brand/.private/assurance/reviews/ (gitignored). A new judgment adds a
revision; nothing is overwritten. The note stays there and never appears in a snapshot.
This is an internal assessment, never a certification or a compliance statement; authorizes is always empty.`,
  fa: `brand:assurance-review <command> [options]   فقط محلی برای مالک؛ تا وقتی BRAND_OS_AGENT_TOKEN تنظیم است اجرا نمی‌شود

  list   [--as-of YYYY-MM-DD] [--show-notes] [--lang en|fa|tr] [--json]
                     کنترل‌هایی که به داوری انسان نیاز دارند و وضعیت هر کدام
  record --control <id> --judgment yes|partly|no --note "<دلیل کوتاه>" [--date YYYY-MM-DD]
         [--expect <revision>|none] [--lang en|fa|tr] [--json]
                     داوری خود را ثبت کنید؛ داوری دربارهٔ واقعیت‌ها و یادداشت‌های پژوهشیِ کنونی است
                     و با تغییر هر کدام خودبه‌خود کهنه می‌شود

داوری‌ها با نسخه در brand/.private/assurance/reviews/ نگه داشته می‌شوند (بیرون از git). هر داوری تازه یک نسخه
اضافه می‌کند و چیزی بازنویسی نمی‌شود. یادداشت همان‌جا می‌ماند و هرگز در تصویر لحظه‌ای نمی‌آید.
این ارزیابی داخلی است و هرگز گواهی‌نامه یا اظهار انطباق نیست؛ authorizes همیشه خالی است.`,
  tr: `brand:assurance-review <command> [options]   yalnızca sahibin yerel ortamı; BRAND_OS_AGENT_TOKEN ayarlıyken reddedilir

  list   [--as-of YYYY-MM-DD] [--show-notes] [--lang en|fa|tr] [--json]
                     bir kişinin kararını gerektiren kontroller ve her birinin durumu
  record --control <id> --judgment yes|partly|no --note "<kısa gerekçe>" [--date YYYY-MM-DD]
         [--expect <revision>|none] [--lang en|fa|tr] [--json]
                     kararınızı kaydedin; karar şu an atıf yapılan bilgiler ve araştırma notları hakkındadır
                     ve bunlardan biri değişince kendiliğinden güncelliğini yitirir

Kararlar brand/.private/assurance/reviews/ içinde sürümlü tutulur (git dışında). Yeni karar bir sürüm
ekler; hiçbir şeyin üzerine yazılmaz. Not orada kalır ve hiçbir anlık görüntüde görünmez.
Bu bir iç değerlendirmedir; asla sertifika veya uyumluluk beyanı değildir; authorizes her zaman boştur.`,
}

/** The list of controls that need a judgment. Ids, states and dates; the note only if the owner asked. */
export function renderReviewList(result: { brand_id: string; items: ReviewItem[] }, lang: AssuranceLang): string {
  const lines: string[] = [`# ${REVIEW_TEXT.title![lang]}`, '', `> ${BRIDGE_TEXT.disclaimer![lang]}`, '', `- ${BRIDGE_TEXT.brand![lang]}: \`${result.brand_id}\``, '']
  if (result.items.length === 0) {
    lines.push(REVIEW_TEXT.none![lang], '')
    return lines.join('\n')
  }
  lines.push(REVIEW_TEXT.intro![lang], '')
  for (const entry of result.items) {
    const label = CONTROL_TEXT[entry.control_id]?.label[lang] ?? entry.control_id
    lines.push(`## ${entry.control_id} — ${label}`, '')
    lines.push(`- ${REVIEW_TEXT.question![lang]}: ${REVIEW_PROMPT[entry.control_id]?.[lang] ?? CONTROL_TEXT[entry.control_id]?.intent[lang] ?? ''}`)
    lines.push(`- ${REVIEW_TEXT.state![lang]}: **${JUDGMENT_STATE_TEXT[entry.state][lang]}**`)
    if (entry.latest) {
      lines.push(`- ${REVIEW_TEXT.latest![lang]}: ${JUDGMENT_TEXT[entry.latest.judgment][lang]} · ${entry.latest.reviewed_on} · \`${entry.latest.revision}\``)
      if (entry.latest.note !== null) lines.push(`- ${REVIEW_TEXT.note![lang]}: ${entry.latest.note}`)
    }
    lines.push(`- ${REVIEW_TEXT.revisions![lang]}: ${entry.revisions}`)
    lines.push(`- ${REVIEW_TEXT.facts_now![lang]}: ${entry.basis_now.facts.map((fact) => `\`${fact.id}\` (${fact.approved ? REVIEW_TEXT.approved![lang] : REVIEW_TEXT.not_approved![lang]})`).join(comma(lang)) || '—'}`)
    lines.push(`- ${REVIEW_TEXT.notes_now![lang]}: ${entry.basis_now.notes.map((id) => `\`${id}\``).join(comma(lang)) || REVIEW_TEXT.no_notes![lang]}`)
    if (entry.changed.length > 0) lines.push(`- ${REVIEW_TEXT.changed![lang]}: ${entry.changed.map((id) => `\`${id}\``).join(comma(lang))}`)
    if (entry.conflicts.length > 0) lines.push(`- ${REVIEW_TEXT.conflicts![lang]}: ${entry.conflicts.map((id) => `\`${id}\``).join(comma(lang))}`)
    lines.push(`- ${fill(REVIEW_TEXT.how![lang], { control: entry.control_id })}`, '')
  }
  lines.push(`> ${REVIEW_TEXT.owner_stated![lang]}`, '', `- ${BRIDGE_TEXT.authorizes![lang]}`, '')
  return lines.join('\n')
}

export function renderRecorded(result: { control_id: string; revision: ReviewRevision }, lang: AssuranceLang): string {
  return [
    fill(REVIEW_TEXT.recorded![lang], {
      control: result.control_id,
      judgment: JUDGMENT_TEXT[result.revision.judgment][lang],
      date: result.revision.reviewed_on,
      revision: result.revision.revision,
    }),
    REVIEW_TEXT.stored![lang],
    BRIDGE_TEXT.disclaimer![lang],
    '',
  ].join('\n')
}

// ---- owner evidence links (brand:assurance-link) -------------------------------------------------

export const LINK_STATE_TEXT: Record<LinkState, T> = {
  qualifies: { en: 'counts as independent evidence', fa: 'شاهد مستقل حساب می‌شود', tr: 'bağımsız kanıt sayılır' },
  note_changed: {
    en: 'does not count: the note changed since it was linked; link it again',
    fa: 'حساب نمی‌شود: یادداشت پس از پیوند تغییر کرده؛ دوباره پیوند دهید',
    tr: 'sayılmaz: not bağlandıktan sonra değişti; yeniden bağlayın',
  },
  entry_missing: { en: 'does not count: the register entry is gone', fa: 'حساب نمی‌شود: مدرک در دفتر شواهد دیگر نیست', tr: 'sayılmaz: kayıt artık yok' },
  not_independent: {
    en: 'does not count: owner testimony or a permission is never independent evidence',
    fa: 'حساب نمی‌شود: گفتهٔ خود مالک یا یک مجوز هرگز شاهد مستقل نیست',
    tr: 'sayılmaz: sahibin beyanı veya bir izin asla bağımsız kanıt değildir',
  },
  claim_mismatch: {
    en: 'does not count: the entry supports a question this note is not about',
    fa: 'حساب نمی‌شود: این مدرک پشتوانهٔ پرسشی است که یادداشت دربارهٔ آن نیست',
    tr: 'sayılmaz: kayıt bu notun ilgili olmadığı bir soruyu destekliyor',
  },
  not_verified: {
    en: 'does not count yet: the owner has not verified the entry (brand:evidence verify)',
    fa: 'هنوز حساب نمی‌شود: مالک این مدرک را تأیید نکرده است (brand:evidence verify)',
    tr: 'henüz sayılmaz: sahip kaydı doğrulamadı (brand:evidence verify)',
  },
  expired: { en: 'does not count: past its review date; add a new entry with a later review date, verify it and link the note to it', fa: 'حساب نمی‌شود: تاریخ بازبینی‌اش گذشته؛ یک مورد تازه با تاریخ بازبینی دیرتر ثبت کنید، تأییدش کنید و یادداشت را به آن پیوند دهید', tr: 'sayılmaz: inceleme tarihi geçti; daha geç inceleme tarihli yeni bir kayıt ekleyin, doğrulayın ve notu ona bağlayın' },
  withdrawn: { en: 'does not count: the entry was withdrawn', fa: 'حساب نمی‌شود: مدرک پس گرفته شده است', tr: 'sayılmaz: kayıt geri çekildi' },
  rejected: { en: 'does not count: the owner rejected the entry', fa: 'حساب نمی‌شود: مالک این مدرک را رد کرده است', tr: 'sayılmaz: sahip kaydı reddetti' },
}

/** The evidence register's own status words, so a Persian or Turkish list does not show English tokens. */
export const EVIDENCE_STATUS_TEXT: Record<EvidenceStatus, T> = {
  pending: { en: 'pending', fa: 'در انتظار تأیید', tr: 'onay bekliyor' },
  verified: { en: 'verified', fa: 'تأییدشده', tr: 'doğrulandı' },
  rejected: { en: 'rejected', fa: 'ردشده', tr: 'reddedildi' },
  withdrawn: { en: 'withdrawn', fa: 'پس‌گرفته‌شده', tr: 'geri çekildi' },
}

export const LINK_TEXT: Catalog = {
  title: { en: 'Evidence links for research notes — owner-local', fa: 'پیوند یادداشت‌های پژوهشی به شواهد — فقط محلی', tr: 'Araştırma notları için kanıt bağlantıları — yalnızca yerel' },
  intro: {
    en: 'A research note is your own statement. Link it to a verified entry in the evidence register and the assessment counts it as independent evidence while that entry stays verified and current.',
    fa: 'یادداشت پژوهشی گفتهٔ خود شماست. آن را به یک مدرک تأییدشده در دفتر شواهد پیوند دهید تا ارزیابی، تا وقتی آن مدرک تأییدشده و معتبر است، آن را شاهد مستقل حساب کند.',
    tr: 'Bir araştırma notu sizin kendi beyanınızdır. Onu kanıt kaydındaki doğrulanmış bir girişe bağlayın; o giriş doğrulanmış ve güncel kaldıkça değerlendirme onu bağımsız kanıt sayar.',
  },
  none: { en: 'This brand has no internal research notes yet (capture one with brand:knowledge).', fa: 'این برند هنوز یادداشت پژوهشی داخلی ندارد (با brand:knowledge ثبت کنید).', tr: 'Bu markanın henüz iç araştırma notu yok (brand:knowledge ile ekleyin).' },
  questions: { en: 'About', fa: 'دربارهٔ', tr: 'Konu' },
  controls: { en: 'Cited by', fa: 'ارجاع‌شده در', tr: 'Atıf yapan' },
  link: { en: 'Link in force', fa: 'پیوند جاری', tr: 'Geçerli bağlantı' },
  no_link: { en: 'not linked: counts as your own statement', fa: 'پیوند ندارد: گفتهٔ خود شما حساب می‌شود', tr: 'bağlı değil: sizin beyanınız sayılır' },
  revisions: { en: 'Recorded revisions', fa: 'نسخه‌های ثبت‌شده', tr: 'Kayıtlı sürümler' },
  candidates: { en: 'Register entries for these questions', fa: 'مدارک دفتر شواهد برای این پرسش‌ها', tr: 'Bu sorular için kanıt kayıtları' },
  no_candidates: {
    en: 'none (record one with brand:evidence add, then verify it)',
    fa: 'هیچ (با brand:evidence add ثبت و سپس تأیید کنید)',
    tr: 'yok (brand:evidence add ile ekleyip doğrulayın)',
  },
  testimony: { en: 'owner testimony, cannot count', fa: 'گفتهٔ مالک، حساب نمی‌شود', tr: 'sahip beyanı, sayılamaz' },
  how: {
    en: 'Link: npm run brand:assurance-link -- link --note {note} --evidence ev-NNNN [--date YYYY-MM-DD]',
    fa: 'پیوند: ‎npm run brand:assurance-link -- link --note {note} --evidence ev-NNNN [--date YYYY-MM-DD]‎',
    tr: 'Bağlamak için: npm run brand:assurance-link -- link --note {note} --evidence ev-NNNN [--date YYYY-MM-DD]',
  },
  unconfirmed: {
    en: 'Unapproved answers still lower the score and are not removed. A link changes only whether a note counts as independent.',
    fa: 'پاسخ‌های تأییدنشده همچنان امتیاز را پایین می‌آورند و حذف نمی‌شوند. پیوند فقط تعیین می‌کند که یادداشت شاهد مستقل حساب شود یا نه.',
    tr: 'Onaylanmamış yanıtlar puanı düşürmeye devam eder ve kaldırılmaz. Bir bağlantı yalnızca notun bağımsız kanıt sayılıp sayılmadığını değiştirir.',
  },
  linked: {
    en: 'Linked {note} to {evidence} on {date} (revision {revision}): {state}.',
    fa: '{note} در {date} به {evidence} پیوند خورد (نسخهٔ {revision}): {state}.',
    tr: '{note}, {date} tarihinde {evidence} kaydına bağlandı (sürüm {revision}): {state}.',
  },
  unlinked: {
    en: 'Removed the link of {note} on {date} (revision {revision}). The note counts as your own statement again.',
    fa: 'پیوند {note} در {date} برداشته شد (نسخهٔ {revision}). یادداشت دوباره گفتهٔ خود شما حساب می‌شود.',
    tr: '{note} notunun bağlantısı {date} tarihinde kaldırıldı (sürüm {revision}). Not yeniden sizin beyanınız sayılır.',
  },
  stored: {
    en: 'Stored privately in brand/.private/assurance/evidence-links/ (gitignored, never read by agents, Studio or docs). Run brand:assurance assess to see the result.',
    fa: 'به‌طور خصوصی در brand/.private/assurance/evidence-links/ ذخیره شد (در git نیست و عامل‌ها، Studio و مستندات آن را نمی‌خوانند). برای دیدن نتیجه brand:assurance assess را اجرا کنید.',
    tr: 'brand/.private/assurance/evidence-links/ içinde gizli olarak saklandı (git dışında; ajanlar, Studio ve belgeler okumaz). Sonucu görmek için brand:assurance assess çalıştırın.',
  },
  refused_agent: {
    en: 'Evidence links are the owner’s own. Refusing while BRAND_OS_AGENT_TOKEN is set; no agent profile covers them.',
    fa: 'پیوندهای شواهد فقط مال مالک است. تا وقتی BRAND_OS_AGENT_TOKEN تنظیم است اجرا نمی‌شود؛ هیچ پروفایل عاملی آن را پوشش نمی‌دهد.',
    tr: 'Kanıt bağlantıları yalnızca sahibe aittir. BRAND_OS_AGENT_TOKEN ayarlıyken reddedilir; hiçbir ajan profili bunu kapsamaz.',
  },
  rejected: { en: 'Not recorded: {reason}', fa: 'ثبت نشد: {reason}', tr: 'Kaydedilmedi: {reason}' },
  unexpected: {
    en: 'Unexpected error ({name}). A link is written in one atomic step: either it was recorded in full or not at all. Run list to check.',
    fa: 'خطای پیش‌بینی‌نشده ({name}). پیوند در یک گام اتمی نوشته می‌شود: یا کامل ثبت شده یا اصلاً ثبت نشده. برای اطمینان list را اجرا کنید.',
    tr: 'Beklenmeyen hata ({name}). Bir bağlantı tek bir atomik adımda yazılır: ya tamamen kaydedildi ya da hiç kaydedilmedi. Kontrol için list çalıştırın.',
  },
}

export const LINK_HELP: T = {
  en: `brand:assurance-link <command> [options]   owner-local; refused while BRAND_OS_AGENT_TOKEN is set

  list   [--as-of YYYY-MM-DD] [--lang en|fa|tr] [--json]
                     your research notes, their links and the register entries they could link to
  link   --note <kn_…> --evidence <ev-NNNN> [--date YYYY-MM-DD] [--expect <revision>|none]
         [--lang en|fa|tr] [--json]
                     link a note, as it is now, to an evidence-register entry
  unlink --note <kn_…> [--date YYYY-MM-DD] [--expect <revision>|none] [--lang en|fa|tr] [--json]
                     remove the link; the note counts as your own statement again

A linked note counts as independent evidence only while the entry is verified (brand:evidence verify),
not owner testimony, about a question the note is about and not past its review date, and while the
note is unchanged. Links are versioned in brand/.private/assurance/evidence-links/ (gitignored).
This is an internal assessment, never a certification or a compliance statement; authorizes is always empty.`,
  fa: `brand:assurance-link <command> [options]   فقط محلی برای مالک؛ تا وقتی BRAND_OS_AGENT_TOKEN تنظیم است اجرا نمی‌شود

  list   [--as-of YYYY-MM-DD] [--lang en|fa|tr] [--json]
                     یادداشت‌های پژوهشی شما، پیوندهایشان و مدارکی از دفتر شواهد که می‌توانند به آن‌ها وصل شوند
  link   --note <kn_…> --evidence <ev-NNNN> [--date YYYY-MM-DD] [--expect <revision>|none]
         [--lang en|fa|tr] [--json]
                     یک یادداشت را، همان‌طور که اکنون هست، به یک مدرک در دفتر شواهد پیوند دهید
  unlink --note <kn_…> [--date YYYY-MM-DD] [--expect <revision>|none] [--lang en|fa|tr] [--json]
                     پیوند را بردارید؛ یادداشت دوباره گفتهٔ خود شما حساب می‌شود

یادداشت پیوندخورده فقط وقتی شاهد مستقل حساب می‌شود که مدرک تأیید شده باشد (brand:evidence verify)، گفتهٔ خود مالک نباشد،
دربارهٔ پرسشی باشد که یادداشت به آن می‌پردازد، تاریخ بازبینی‌اش نگذشته باشد و یادداشت تغییر نکرده باشد.
پیوندها با نسخه در brand/.private/assurance/evidence-links/ نگه داشته می‌شوند (بیرون از git).
این ارزیابی داخلی است و هرگز گواهی‌نامه یا اظهار انطباق نیست؛ authorizes همیشه خالی است.`,
  tr: `brand:assurance-link <command> [options]   yalnızca sahibin yerel ortamı; BRAND_OS_AGENT_TOKEN ayarlıyken reddedilir

  list   [--as-of YYYY-MM-DD] [--lang en|fa|tr] [--json]
                     araştırma notlarınız, bağlantıları ve bağlanabilecekleri kanıt kayıtları
  link   --note <kn_…> --evidence <ev-NNNN> [--date YYYY-MM-DD] [--expect <revision>|none]
         [--lang en|fa|tr] [--json]
                     bir notu, şimdiki hâliyle, bir kanıt kaydına bağlayın
  unlink --note <kn_…> [--date YYYY-MM-DD] [--expect <revision>|none] [--lang en|fa|tr] [--json]
                     bağlantıyı kaldırın; not yeniden sizin beyanınız sayılır

Bağlı bir not yalnızca kayıt doğrulanmışsa (brand:evidence verify), sahip beyanı değilse, notun ilgili olduğu
bir soruya aitse, inceleme tarihi geçmemişse ve not değişmemişse bağımsız kanıt sayılır.
Bağlantılar brand/.private/assurance/evidence-links/ içinde sürümlü tutulur (git dışında).
Bu bir iç değerlendirmedir; asla sertifika veya uyumluluk beyanı değildir; authorizes her zaman boştur.`,
}

/** The owner's research notes and their links. Ids, states and dates only; never note or register text. */
export function renderLinkList(result: { brand_id: string; items: LinkItem[] }, lang: AssuranceLang): string {
  const lines: string[] = [`# ${LINK_TEXT.title![lang]}`, '', `> ${BRIDGE_TEXT.disclaimer![lang]}`, '', `- ${BRIDGE_TEXT.brand![lang]}: \`${result.brand_id}\``, '']
  if (result.items.length === 0) {
    lines.push(LINK_TEXT.none![lang], '')
    return lines.join('\n')
  }
  lines.push(LINK_TEXT.intro![lang], '')
  for (const entry of result.items) {
    lines.push(`## \`${entry.note_id}\``, '')
    lines.push(`- ${LINK_TEXT.questions![lang]}: ${entry.question_ids.map((id) => `\`${id}\``).join(comma(lang)) || '—'}`)
    lines.push(`- ${LINK_TEXT.controls![lang]}: ${entry.control_ids.join(comma(lang)) || '—'}`)
    lines.push(`- ${LINK_TEXT.link![lang]}: ${entry.link ? `\`${entry.link.evidence_id}\` · ${entry.link.linked_on} · \`${entry.link.revision}\` · **${LINK_STATE_TEXT[entry.link.state][lang]}**` : LINK_TEXT.no_link![lang]}`)
    lines.push(`- ${LINK_TEXT.revisions![lang]}: ${entry.revisions}`)
    const candidates = entry.candidates.map((candidate) => `\`${candidate.evidence_id}\` (\`${candidate.claim_id}\`${comma(lang)}${EVIDENCE_STATUS_TEXT[candidate.status][lang]}${candidate.independent_source ? '' : `${comma(lang)}${LINK_TEXT.testimony![lang]}`})`)
    lines.push(`- ${LINK_TEXT.candidates![lang]}: ${candidates.join(comma(lang)) || LINK_TEXT.no_candidates![lang]}`)
    lines.push(`- ${fill(LINK_TEXT.how![lang], { note: entry.note_id })}`, '')
  }
  lines.push(`> ${LINK_TEXT.unconfirmed![lang]}`, '', `- ${BRIDGE_TEXT.authorizes![lang]}`, '')
  return lines.join('\n')
}

export function renderLinked(result: { note_id: string; revision: LinkRevision; state?: LinkState }, lang: AssuranceLang): string {
  const head =
    result.revision.action === 'link'
      ? fill(LINK_TEXT.linked![lang], {
          note: result.note_id,
          evidence: result.revision.evidence_id ?? '',
          date: result.revision.linked_on,
          revision: result.revision.revision,
          state: result.state ? LINK_STATE_TEXT[result.state][lang] : '',
        })
      : fill(LINK_TEXT.unlinked![lang], { note: result.note_id, date: result.revision.linked_on, revision: result.revision.revision })
  return [head, LINK_TEXT.stored![lang], BRIDGE_TEXT.disclaimer![lang], ''].join('\n')
}
