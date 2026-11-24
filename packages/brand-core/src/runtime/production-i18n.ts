import type { TaskLocale } from '../task-context/model.js'

/**
 * Fixed production-readiness text in en (base), fa (RTL, set in Vazirmatn wherever it is rendered) and tr. Only these
 * labels and guardrail lines are translated. Ids, codes and brand data are never translated.
 */

export const PRODUCTION_CHECK_IDS = [
  'context.pack_integrity',
  'context.readiness',
  'context.staleness',
  'context.source_drift',
  'renderer.available',
  'output.format',
  'plan.copy',
  'copy.claims',
  'asset.reference',
  'asset.required_logo',
  'artifact.checks',
  'artifact.pack_pin',
  'artifact.file_sha256',
  'artifact.svg_safety',
  'artifact.required_logo',
  'svg.allowlist',
  'svg.publication_gate',
  'svg.normalized',
  'post.format',
  'post.headline_fit',
  'post.signoff_fit',
  'color.contrast',
  'pack.digest',
  'pack.staleness',
  'set.count',
  'set.distinct_files',
  'set.distinct_messages',
  'set.layout_variety',
  'coach.advice',
  'review.visual_taste',
  'review.semantic',
] as const
export type ProductionCheckId = (typeof PRODUCTION_CHECK_IDS)[number]

export type ProductionVerdict = 'pass' | 'warn' | 'fail' | 'not_tested' | 'needs_human_review'

export interface ProductionText {
  notice: string[]
  /** What `production_ready: ready` means, so nobody reads it as "approved" or "good". */
  meaning: Record<'ready' | 'not_ready', string>
  states: Record<'ready' | 'not_ready', string>
  verdicts: Record<ProductionVerdict, string>
  checks: Record<ProductionCheckId, string>
  labels: { production: string; stage: string; context: string; renderer: string; blocks: string; owner: string; input: string; none: string; human_review: string
    /** social-batch: the drafts were written but production is not_ready, so the command exits 3 (PR-E owner decision 3). */
    not_ready_exit: string
  }
}

export const PRODUCTION_TEXT: Record<TaskLocale, ProductionText> = {
  en: {
    notice: [
      'Production readiness is a separate view. It does not change the task_context readiness, which is about context only.',
      'Only objective, deterministic rules block: a wrong digest or checksum, blocked usage rights, a banned claim, a missing renderer or format, a missing required logo, an unsafe file.',
      'Visual taste, visual similarity and persuasion are not tested here. A person reviews every draft. There is no score.',
      'It authorizes nothing: no publication, schedule, spend, deployment, approval or upload. No asset bytes are given to an agent.',
    ],
    meaning: {
      ready: 'No deterministic blocker was found. This is not approval and not a quality verdict: human review is still required.',
      not_ready: 'At least one deterministic rule blocks production. The blockers name the rule, its owner and the input.',
    },
    states: { ready: 'ready', not_ready: 'not ready' },
    verdicts: { pass: 'pass', warn: 'warn', fail: 'fail', not_tested: 'not tested', needs_human_review: 'needs human review' },
    checks: {
      'context.pack_integrity': 'Context pack digest',
      'context.readiness': 'Context readiness (task_context)',
      'context.staleness': 'Context freshness',
      'context.source_drift': 'Cited facts unchanged since the pack was built',
      'renderer.available': 'Verified renderer for this task',
      'output.format': 'Supported output format and count',
      'plan.copy': 'Approved copy and palette for every deliverable',
      'copy.claims': 'Banned claims in the copy',
      'asset.reference': 'Asset reference (Visual DNA)',
      'asset.required_logo': 'Required logo',
      'artifact.checks': 'Artifact checks',
      'artifact.pack_pin': 'Artifacts pinned to this pack',
      'artifact.file_sha256': 'Artifact file checksums',
      'artifact.svg_safety': 'Artifact SVG safety (re-checked on the bytes)',
      'artifact.required_logo': 'Required logo in every artifact',
      'svg.allowlist': 'SVG allowlist',
      'svg.publication_gate': 'SVG publication gate',
      'svg.normalized': 'SVG already normalized',
      'post.format': 'Post format',
      'post.headline_fit': 'Headline fit',
      'post.signoff_fit': 'Sign-off fit',
      'color.contrast': 'Colour contrast',
      'pack.digest': 'Pack digest (batch)',
      'pack.staleness': 'Pack freshness (batch)',
      'set.count': 'Deliverable count',
      'set.distinct_files': 'Distinct files',
      'set.distinct_messages': 'Distinct messages',
      'set.layout_variety': 'Layout variety',
      'coach.advice': 'Strategic Coach advice',
      'review.visual_taste': 'Visual taste and similarity',
      'review.semantic': 'Persuasion and meaning',
    },
    labels: { production: 'production', stage: 'stage', context: 'context', renderer: 'renderer', blocks: 'blocks', owner: 'owner', input: 'input', none: 'none', human_review: 'Human review required. Nothing was approved, published, scheduled, spent or deployed; authorizes: [].', not_ready_exit: 'The drafts were written, but production is not ready: exit code 3. See production-readiness.json.' },
  },
  fa: {
    notice: [
      'آمادگی تولید یک نمای جداگانه است و معنای readiness در task_context را، که فقط دربارهٔ کانتکست است، تغییر نمی‌دهد.',
      'فقط قاعده‌های عینی و قطعی جلوی کار را می‌گیرند: digest یا checksum نادرست، حق استفادهٔ مسدود، ادعای ممنوع، نبودِ renderer یا قالب، نبودِ لوگوی الزامی، فایل ناامن.',
      'سلیقهٔ بصری، شباهت بصری و قدرت اقناع اینجا آزموده نمی‌شوند. هر پیش‌نویس را یک انسان بازبینی می‌کند. هیچ امتیازی در کار نیست.',
      'این خروجی هیچ مجوزی نمی‌دهد: نه انتشار، نه زمان‌بندی، نه هزینه، نه استقرار، نه تأیید و نه آپلود. هیچ بایتی از asset به agent داده نمی‌شود.',
    ],
    meaning: {
      ready: 'هیچ مانع قطعی‌ای پیدا نشد. این به معنای تأیید یا کیفیت نیست: بازبینی انسانی همچنان لازم است.',
      not_ready: 'دست‌کم یک قاعدهٔ قطعی جلوی تولید را گرفته است. هر مانع، قاعده، مالک آن و ورودی را نام می‌برد.',
    },
    states: { ready: 'آماده', not_ready: 'آماده نیست' },
    verdicts: { pass: 'قبول', warn: 'هشدار', fail: 'رد', not_tested: 'آزموده نشد', needs_human_review: 'نیازمند بازبینی انسانی' },
    checks: {
      'context.pack_integrity': 'digest بستهٔ کانتکست',
      'context.readiness': 'آمادگی کانتکست (task_context)',
      'context.staleness': 'به‌روز بودن کانتکست',
      'context.source_drift': 'factهای استنادشده از زمان ساخت بسته تغییر نکرده‌اند',
      'renderer.available': 'renderer تأییدشده برای این کار',
      'output.format': 'قالب و تعداد خروجیِ پشتیبانی‌شده',
      'plan.copy': 'متن و پالت تأییدشده برای همهٔ خروجی‌ها',
      'copy.claims': 'ادعاهای ممنوع در متن',
      'asset.reference': 'مرجع asset (Visual DNA)',
      'asset.required_logo': 'لوگوی الزامی',
      'artifact.checks': 'بررسی‌های خروجی',
      'artifact.pack_pin': 'سنجاق بودن خروجی‌ها به همین بسته',
      'artifact.file_sha256': 'checksum فایل‌های خروجی',
      'artifact.svg_safety': 'ایمنی SVG خروجی (دوباره روی خود بایت‌ها)',
      'artifact.required_logo': 'لوگوی الزامی در همهٔ خروجی‌ها',
      'svg.allowlist': 'فهرست مجاز SVG',
      'svg.publication_gate': 'دروازهٔ انتشار SVG',
      'svg.normalized': 'نرمال‌سازی SVG',
      'post.format': 'قالب پست',
      'post.headline_fit': 'جا شدن تیتر',
      'post.signoff_fit': 'جا شدن امضا',
      'color.contrast': 'کنتراست رنگ',
      'pack.digest': 'digest بسته (دسته)',
      'pack.staleness': 'به‌روز بودن بسته (دسته)',
      'set.count': 'تعداد خروجی',
      'set.distinct_files': 'یکتا بودن فایل‌ها',
      'set.distinct_messages': 'یکتا بودن پیام‌ها',
      'set.layout_variety': 'تنوع چیدمان',
      'coach.advice': 'توصیهٔ Strategic Coach',
      'review.visual_taste': 'سلیقه و شباهت بصری',
      'review.semantic': 'اقناع و معنا',
    },
    labels: { production: 'تولید', stage: 'مرحله', context: 'کانتکست', renderer: 'renderer', blocks: 'مانع', owner: 'مالک', input: 'ورودی', none: 'هیچ', human_review: 'بازبینی انسانی لازم است. هیچ چیزی تأیید، منتشر، زمان‌بندی، هزینه یا مستقر نشد؛ authorizes: [].', not_ready_exit: 'پیش‌نویس‌ها نوشته شدند، اما تولید آماده نیست: کد خروج ۳ (exit 3). production-readiness.json را ببینید.' },
  },
  tr: {
    notice: [
      'Üretime hazırlık ayrı bir görünümdür. Yalnızca bağlamla ilgili olan task_context readiness alanının anlamını değiştirmez.',
      'Yalnızca nesnel, belirlenimci kurallar engeller: yanlış özet veya sağlama toplamı, engelli kullanım hakları, yasaklı iddia, eksik oluşturucu veya biçim, eksik zorunlu logo, güvensiz dosya.',
      'Görsel beğeni, görsel benzerlik ve ikna gücü burada test edilmez. Her taslağı bir insan inceler. Puan yoktur.',
      'Hiçbir şeye yetki vermez: yayın, zamanlama, harcama, dağıtım, onay veya yükleme yok. Bir ajana varlık baytı verilmez.',
    ],
    meaning: {
      ready: 'Belirlenimci bir engel bulunmadı. Bu bir onay veya kalite yargısı değildir: insan incelemesi yine gereklidir.',
      not_ready: 'En az bir belirlenimci kural üretimi engelliyor. Engeller kuralı, sahibini ve girdiyi adlandırır.',
    },
    states: { ready: 'hazır', not_ready: 'hazır değil' },
    verdicts: { pass: 'geçti', warn: 'uyarı', fail: 'başarısız', not_tested: 'test edilmedi', needs_human_review: 'insan incelemesi gerekli' },
    checks: {
      'context.pack_integrity': 'Bağlam paketi özeti',
      'context.readiness': 'Bağlam hazırlığı (task_context)',
      'context.staleness': 'Bağlam güncelliği',
      'context.source_drift': 'Atıf yapılan bilgiler paket oluşturulduğundan beri değişmedi',
      'renderer.available': 'Bu görev için doğrulanmış oluşturucu',
      'output.format': 'Desteklenen çıktı biçimi ve sayısı',
      'plan.copy': 'Her çıktı için onaylı metin ve palet',
      'copy.claims': 'Metindeki yasaklı iddialar',
      'asset.reference': 'Varlık referansı (Visual DNA)',
      'asset.required_logo': 'Zorunlu logo',
      'artifact.checks': 'Çıktı kontrolleri',
      'artifact.pack_pin': 'Çıktıların bu pakete sabitlenmesi',
      'artifact.file_sha256': 'Çıktı dosyası sağlama toplamları',
      'artifact.svg_safety': 'Çıktı SVG güvenliği (baytlar üzerinde yeniden)',
      'artifact.required_logo': 'Her çıktıda zorunlu logo',
      'svg.allowlist': 'SVG izin listesi',
      'svg.publication_gate': 'SVG yayın kapısı',
      'svg.normalized': 'SVG normalleştirilmiş',
      'post.format': 'Gönderi biçimi',
      'post.headline_fit': 'Başlığın sığması',
      'post.signoff_fit': 'İmzanın sığması',
      'color.contrast': 'Renk kontrastı',
      'pack.digest': 'Paket özeti (toplu)',
      'pack.staleness': 'Paket güncelliği (toplu)',
      'set.count': 'Çıktı sayısı',
      'set.distinct_files': 'Farklı dosyalar',
      'set.distinct_messages': 'Farklı mesajlar',
      'set.layout_variety': 'Yerleşim çeşitliliği',
      'coach.advice': 'Strategic Coach tavsiyesi',
      'review.visual_taste': 'Görsel beğeni ve benzerlik',
      'review.semantic': 'İkna ve anlam',
    },
    labels: { production: 'üretim', stage: 'aşama', context: 'bağlam', renderer: 'oluşturucu', blocks: 'engeller', owner: 'sahip', input: 'girdi', none: 'yok', human_review: 'İnsan incelemesi gerekli. Hiçbir şey onaylanmadı, yayınlanmadı, zamanlanmadı, harcanmadı veya dağıtılmadı; authorizes: [].', not_ready_exit: 'Taslaklar yazıldı, ancak üretim hazır değil: çıkış kodu 3. production-readiness.json dosyasına bakın.' },
  },
}

export function productionText(locale: TaskLocale): ProductionText {
  return PRODUCTION_TEXT[locale] ?? PRODUCTION_TEXT.en
}
