import type { VisualLang } from './i18n.js'

/**
 * en/fa/tr text for the positioning map (Visual Blueprint V2.3, owner decision D2). Explanations and state names only:
 * axis labels and pole names are the owner's own words, shown in the reader's language when the owner wrote one and
 * in English otherwise; they are never machine-translated. Competitor names are shown as shared.
 */
export interface PositioningText {
  title: string
  lead: string
  page: string
  ownBrand: string
  band: Record<'low' | 'lower_mid' | 'mid' | 'upper_mid' | 'high', string>
  state: Record<'evidenced' | 'stale' | 'conflicting' | 'needs_review' | 'unknown', string>
  axisX: string
  axisY: string
  keyTitle: string
  keyName: string
  keyPlace: string
  keyState: string
  keySources: string
  mapAria: string
  pointAria: string
  rangeNote: string
  staleNote: string
  unknownTitle: string
  unknownBody: string
  noPointsTitle: string
  noPointsBody: string
  emptyTitle: string
  emptyBody: string
  emptyStepsTitle: string
  emptySteps: string[]
  withheldTitle: string
  withheldBody: string
  ownerWords: string
  notAMeasurement: string
}

const en: PositioningText = {
  title: 'Positioning map',
  lead: 'Where your brand and the competitors you reviewed sit on the two axes you chose. A business is placed only where a dated source supports both positions.',
  page: 'Positioning map',
  ownBrand: 'Your brand',
  band: { low: 'Low', lower_mid: 'Lower-mid', mid: 'Mid', upper_mid: 'Upper-mid', high: 'High' },
  state: { evidenced: 'Evidenced', stale: 'Source older than {days} days', conflicting: 'Sources disagree', needs_review: 'Source needs review', unknown: 'Unknown' },
  axisX: 'Horizontal axis',
  axisY: 'Vertical axis',
  keyTitle: 'Who is where',
  keyName: 'Business',
  keyPlace: 'Position',
  keyState: 'Evidence',
  keySources: 'Sources',
  mapAria: 'Positioning map: {x} across, {y} up. {count} placed.',
  pointAria: '{name}: {x}, {y}. {state}.',
  rangeNote: 'A dashed box is a range: the sources disagree, so both readings are drawn and none is chosen.',
  staleNote: 'A dashed ring marks a position whose only sources are older than {days} days. It is still drawn, but it needs a fresh look.',
  unknownTitle: 'Not placed',
  unknownBody: 'No dated source supports a position on both axes yet. Unknown stays unknown; nothing is estimated.',
  noPointsTitle: 'No positions with sources yet',
  noPointsBody: 'Your axes are shared, but no business has a dated source for both of them. Record positions from your research notes, then share again.',
  emptyTitle: 'No positioning axes shared yet',
  emptyBody: 'This map uses only the two axes you choose and positions you back with a source. The tool never suggests an axis or a position.',
  emptyStepsTitle: 'To draw it',
  emptySteps: [
    'Choose your two axes and name their ends: npm run brand:competitive -- axes set …',
    'Record each position from a research note: npm run brand:competitive -- position add …',
    'Write the shared file: npm run brand:competitive -- share',
    'Review the diff, then commit and merge it. Studio shows the map after the next sync.',
  ],
  withheldTitle: 'The shared file was not shown',
  withheldBody: 'The map uses the same shared file as the matrix, and that file did not pass its checks.',
  ownerWords: 'Axis names are your own words.',
  notAMeasurement: 'Positions are qualitative bands read from sources, not measurements or scores.',
}

const fa: PositioningText = {
  title: 'نقشهٔ جایگاه‌یابی',
  lead: 'برند شما و رقبایی که بررسی کرده‌اید روی دو محوری که خودتان انتخاب کرده‌اید کجا قرار می‌گیرند. هر کسب‌وکار فقط وقتی روی نقشه می‌آید که منبعی تاریخ‌دار هر دو جایگاهش را تأیید کند.',
  page: 'نقشهٔ جایگاه‌یابی',
  ownBrand: 'برند شما',
  band: { low: 'کم', lower_mid: 'متوسط رو به پایین', mid: 'متوسط', upper_mid: 'متوسط رو به بالا', high: 'زیاد' },
  state: { evidenced: 'دارای منبع', stale: 'منبع قدیمی‌تر از {days} روز', conflicting: 'منابع با هم اختلاف دارند', needs_review: 'منبع نیاز به بازبینی دارد', unknown: 'نامعلوم' },
  axisX: 'محور افقی',
  axisY: 'محور عمودی',
  keyTitle: 'چه کسی کجاست',
  keyName: 'کسب‌وکار',
  keyPlace: 'جایگاه',
  keyState: 'پشتوانه',
  keySources: 'منابع',
  mapAria: 'نقشهٔ جایگاه‌یابی: {x} در افق، {y} در عمود. {count} مورد روی نقشه.',
  pointAria: '{name}: {x}، {y}. {state}.',
  rangeNote: 'کادر خط‌چین یعنی بازه: منابع با هم اختلاف دارند، پس هر دو خوانش کشیده می‌شود و هیچ‌کدام انتخاب نمی‌شود.',
  staleNote: 'حلقهٔ خط‌چین یعنی تنها منابع این جایگاه قدیمی‌تر از {days} روز هستند. هنوز نشان داده می‌شود، اما باید دوباره بررسی شود.',
  unknownTitle: 'روی نقشه نیامده',
  unknownBody: 'هنوز منبع تاریخ‌داری برای جایگاه روی هر دو محور نیست. نامعلوم، نامعلوم می‌ماند؛ هیچ تخمینی زده نمی‌شود.',
  noPointsTitle: 'هنوز جایگاهی با منبع ثبت نشده',
  noPointsBody: 'محورهای شما به اشتراک گذاشته شده‌اند، اما هیچ کسب‌وکاری برای هر دو محور منبع تاریخ‌دار ندارد. جایگاه‌ها را از یادداشت‌های پژوهشی ثبت کنید و دوباره به اشتراک بگذارید.',
  emptyTitle: 'هنوز محوری برای جایگاه‌یابی به اشتراک گذاشته نشده',
  emptyBody: 'این نقشه فقط از دو محوری که خودتان انتخاب می‌کنید و جایگاه‌هایی که با منبع پشتیبانی می‌کنید ساخته می‌شود. ابزار هرگز محور یا جایگاهی پیشنهاد نمی‌دهد.',
  emptyStepsTitle: 'برای ساختن آن',
  emptySteps: [
    'دو محور خود را انتخاب و دو سرشان را نام‌گذاری کنید: npm run brand:competitive -- axes set …',
    'هر جایگاه را از یک یادداشت پژوهشی ثبت کنید: npm run brand:competitive -- position add …',
    'فایل اشتراکی را بنویسید: npm run brand:competitive -- share',
    'diff را بررسی کنید، سپس commit و merge کنید. Studio پس از همگام‌سازی بعدی نقشه را نشان می‌دهد.',
  ],
  withheldTitle: 'فایل اشتراکی نمایش داده نشد',
  withheldBody: 'نقشه از همان فایل اشتراکیِ ماتریس استفاده می‌کند و آن فایل در بررسی‌ها پذیرفته نشد.',
  ownerWords: 'نام محورها واژه‌های خود شماست.',
  notAMeasurement: 'جایگاه‌ها بازه‌هایی کیفی‌اند که از منابع خوانده شده‌اند، نه اندازه‌گیری یا امتیاز.',
}

const tr: PositioningText = {
  title: 'Konumlandırma haritası',
  lead: 'Markanızın ve incelediğiniz rakiplerin, seçtiğiniz iki eksende nerede durduğu. Bir işletme yalnızca tarihli bir kaynak iki konumu da desteklediğinde haritaya yerleştirilir.',
  page: 'Konumlandırma haritası',
  ownBrand: 'Markanız',
  band: { low: 'Düşük', lower_mid: 'Orta-alt', mid: 'Orta', upper_mid: 'Orta-üst', high: 'Yüksek' },
  state: { evidenced: 'Kaynaklı', stale: 'Kaynak {days} günden eski', conflicting: 'Kaynaklar çelişiyor', needs_review: 'Kaynak gözden geçirilmeli', unknown: 'Bilinmiyor' },
  axisX: 'Yatay eksen',
  axisY: 'Dikey eksen',
  keyTitle: 'Kim nerede',
  keyName: 'İşletme',
  keyPlace: 'Konum',
  keyState: 'Dayanak',
  keySources: 'Kaynaklar',
  mapAria: 'Konumlandırma haritası: yatayda {x}, dikeyde {y}. {count} yerleştirildi.',
  pointAria: '{name}: {x}, {y}. {state}.',
  rangeNote: 'Kesikli kutu bir aralıktır: kaynaklar çelişiyor, bu yüzden iki okuma da çizilir ve hiçbiri seçilmez.',
  staleNote: 'Kesikli halka, tek kaynakları {days} günden eski olan bir konumu gösterir. Hâlâ çizilir ama yeniden bakılmalıdır.',
  unknownTitle: 'Yerleştirilmedi',
  unknownBody: 'Henüz iki eksende de konumu destekleyen tarihli bir kaynak yok. Bilinmeyen bilinmeyen kalır; hiçbir şey tahmin edilmez.',
  noPointsTitle: 'Henüz kaynaklı konum yok',
  noPointsBody: 'Eksenleriniz paylaşıldı, ancak hiçbir işletmenin iki eksen için de tarihli kaynağı yok. Konumları araştırma notlarınızdan kaydedin ve yeniden paylaşın.',
  emptyTitle: 'Henüz konumlandırma ekseni paylaşılmadı',
  emptyBody: 'Bu harita yalnızca sizin seçtiğiniz iki ekseni ve bir kaynakla desteklediğiniz konumları kullanır. Araç asla eksen ya da konum önermez.',
  emptyStepsTitle: 'Çizmek için',
  emptySteps: [
    'İki ekseninizi seçin ve uçlarını adlandırın: npm run brand:competitive -- axes set …',
    'Her konumu bir araştırma notundan kaydedin: npm run brand:competitive -- position add …',
    'Paylaşılan dosyayı yazın: npm run brand:competitive -- share',
    'Farkı inceleyin, sonra commit edip birleştirin. Studio haritayı bir sonraki eşitlemeden sonra gösterir.',
  ],
  withheldTitle: 'Paylaşılan dosya gösterilmedi',
  withheldBody: 'Harita, matrisle aynı paylaşılan dosyayı kullanır ve o dosya denetimlerden geçemedi.',
  ownerWords: 'Eksen adları sizin kendi sözlerinizdir.',
  notAMeasurement: 'Konumlar kaynaklardan okunan niteliksel bantlardır; ölçüm ya da puan değildir.',
}

export const POSITIONING_TEXT: Record<VisualLang, PositioningText> = { en, fa, tr }

export function positioningText(lang: VisualLang): PositioningText {
  return POSITIONING_TEXT[lang] ?? en
}
