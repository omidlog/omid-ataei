/**
 * en/fa/tr text for the Brand Book "Visual identity" chapter (Visual Blueprint V2.1). Labels and explanations only;
 * colour roles, font families and asset names are brand values and are shown as approved, never translated.
 * Specimen lines are fixed language samples, not brand copy.
 */
export interface IdentityText {
  chapterKicker: string
  chapterTitle: string
  chapterLead: string
  familyLabel: string
  sourcesIntro: string
  scaleLabel: string
  mockMark: string
  openChapter: string
  openChapterHint: string
  backToChapter: string
  printTitle: string
  runningHead: string
  contents: string
  colorTitle: string
  colorLead: string
  rolesTitle: string
  combinationsTitle: string
  combinationsLead: string
  combinationsNone: string
  contrastTitle: string
  contrastLead: string
  gridTitle: string
  gridHint: string
  gridOmitted: string
  gridCorner: string
  ratio: string
  normalText: string
  largeText: string
  enhanced: string
  passes: string
  fails: string
  textOn: string
  sample: string
  typeTitle: string
  typeLead: string
  fallbackLabel: string
  sizeLabel: string
  lineHeightLabel: string
  sizeUnset: string
  fontNote: string
  scriptName: Record<'en' | 'fa' | 'tr', string>
  specimenLine: Record<'en' | 'fa' | 'tr', string>
  logoTitle: string
  logoLead: string
  clearSpace: string
  minSize: string
  minPrint: string
  clearSpaceX: string
  clearSpacePx: string
  notSet: string
  masterFile: string
  drawnAtMin: string
  constructionNote: string
  constructionUnknownSize: string
  awaitingKicker: string
  awaitingColorTitle: string
  awaitingColorBody: string
  awaitingTypeTitle: string
  awaitingTypeBody: string
  awaitingLogoTitle: string
  awaitingLogoBody: string
  awaitingSpec: string
  awaitingMaster: Record<'missing' | 'example_only' | 'not_previewable' | 'ambiguous', string>
  /** Internal edition only: notes on the master file itself (never shown in the public edition). */
  masterBadge: Record<'draft_tag' | 'internal_only', string>
  stepMasterAmbiguous: string
  awaitingDraft: string
  awaitingWithheld: string
  awaitingStepsTitle: string
  stepApprove: string
  stepMaster: string
  ready: string
  waiting: string
  pageColor: string
  pageType: string
  pageLogo: string
  pageSources: string
  plate: string
}

const en: IdentityText = {
  chapterKicker: 'Brand Book · Chapter',
  chapterTitle: 'Visual identity',
  chapterLead: 'Colour, type and the logo, drawn only from approved facts and the approved master file. Where nothing is approved yet, the page says what it is waiting for.',
  familyLabel: 'Family',
  sourcesIntro: 'Every plate in this chapter, the fact or asset it is drawn from, its state and its approved version.',
  scaleLabel: 'Size',
  mockMark: 'MOCK MARK',
  openChapter: 'Visual identity chapter',
  openChapterHint: 'Colour palette, typography specimen and logo construction, drawn from approved facts only.',
  backToChapter: 'Back to the chapter',
  printTitle: 'Print view',
  runningHead: 'Brand Book · Visual identity',
  contents: 'In this chapter',
  colorTitle: 'Colour palette',
  colorLead: 'Each colour is a role. Roles survive a change of hue; the hex is the approved value today.',
  rolesTitle: 'Colour roles',
  combinationsTitle: 'Combinations',
  combinationsLead: 'Text and background pairs the roles declare by name (onPrimary on primary), with the measured ratio.',
  combinationsNone: 'No role is named as text on another (for example onPrimary on primary), so no combination is declared. The grid below measures every pair.',
  contrastTitle: 'Measured contrast',
  contrastLead: 'Computed from the approved hex values with the WCAG 2 contrast-ratio formula. A ratio measures two colours; it is not an accessibility audit of any product.',
  gridTitle: 'Contrast grid',
  gridHint: 'Text colour in the row, background in the column. Ratios rounded down.',
  gridOmitted: 'More than {count} colours: the grid is left out so it stays legible. The declared combinations are still measured.',
  gridCorner: 'Text ↓ · Background →',
  ratio: '{ratio}:1',
  normalText: 'Normal text 4.5:1',
  largeText: 'Large text 3:1',
  enhanced: 'Enhanced 7:1',
  passes: 'Meets',
  fails: 'Below',
  textOn: '{fg} on {bg}',
  sample: 'Sample text',
  typeTitle: 'Typography',
  typeLead: 'Type roles with their family, fallback and size, set in each language the brand supports.',
  fallbackLabel: 'Fallback',
  sizeLabel: '{size} px',
  lineHeightLabel: 'line height {value}',
  sizeUnset: 'Size not set',
  fontNote: 'Set by family name. If the face is not installed on this device the browser uses the fallback, and Persian lines use Vazirmatn where the face has no Arabic-script glyphs. Studio loads no font files from the brand.',
  scriptName: { en: 'English', fa: 'Persian', tr: 'Turkish' },
  specimenLine: { en: 'The quick brown fox jumps over the lazy dog 0123456789', fa: 'زبان فارسی، خطی پیوسته و خوش‌آهنگ ۰۱۲۳۴۵۶۷۸۹', tr: 'Pijamalı hasta yağız şoföre çabucak güvendi 0123456789' },
  logoTitle: 'Logo construction',
  logoLead: 'Clear space and minimum size, drawn around the approved master file.',
  clearSpace: 'Clear space',
  minSize: 'Minimum size on screen',
  minPrint: 'Minimum size in print',
  clearSpaceX: '{value} × mark height',
  clearSpacePx: '{value} px at minimum size',
  notSet: 'Not set',
  masterFile: 'Master file',
  drawnAtMin: 'At the approved minimum size, actual pixels',
  constructionNote: 'Clear space is measured from the edge of the mark on every side; the minimum size is measured along the mark height.',
  constructionUnknownSize: 'The master file does not state its proportions, so the drawing uses a square frame. Values are exact; the frame is not.',
  awaitingKicker: 'Awaiting approved asset',
  awaitingColorTitle: 'The palette is waiting for approved colour roles',
  awaitingColorBody: 'Swatches, combinations and measured contrast are drawn as soon as the colour roles are approved. Nothing here is drawn from a draft.',
  awaitingTypeTitle: 'The specimen is waiting for approved type roles',
  awaitingTypeBody: 'Each role is set in English, Persian and Turkish once the type roles are approved. Nothing here is set from a draft.',
  awaitingLogoTitle: 'Logo construction is waiting',
  awaitingLogoBody: 'Clear space and minimum size are drawn only around an approved master file, with an approved size rule. No logo is drawn or implied until then.',
  awaitingSpec: 'The size and clear-space rule is not approved yet.',
  awaitingMaster: {
    missing: 'No approved master file is registered.',
    example_only: 'Only template example placeholders are in the asset manifest. They are never used as a logo.',
    not_previewable: 'An approved master is registered but its file could not be safely read.',
    ambiguous: 'Several approved logo files are registered and none is named as the master, so none is drawn. Nothing is guessed.',
  },
  masterBadge: { draft_tag: 'Tagged draft', internal_only: 'Internal · not published' },
  stepMasterAmbiguous: 'Name the master file by its asset id or path in the approved “Master location” answer (brand.logo.masters).',
  awaitingDraft: 'A draft exists and is waiting for review.',
  awaitingWithheld: 'The value is restricted and withheld here.',
  awaitingStepsTitle: 'To complete this page',
  stepApprove: 'Answer and approve “{label}”.',
  stepMaster: 'Register the master in the asset manifest with the tag logo, a licence and a checksum, and approve it; name it in brand.logo.masters (or tag it master) if there is more than one logo.',
  ready: 'Drawn from approved data',
  waiting: 'Waiting',
  pageColor: 'Colour',
  pageType: 'Type',
  pageLogo: 'Logo',
  pageSources: 'Sources',
  plate: 'Plate {n}',
}

const fa: IdentityText = {
  chapterKicker: 'کتاب برند · فصل',
  chapterTitle: 'هویت بصری',
  chapterLead: 'رنگ، حروف و لوگو، فقط از واقعیت‌های تأییدشده و فایل اصلی تأییدشده. جایی که هنوز چیزی تأیید نشده، صفحه می‌گوید منتظر چیست.',
  familyLabel: 'خانواده',
  sourcesIntro: 'هر صفحهٔ این فصل، واقعیت یا دارایی‌ای که از آن رسم شده، وضعیت و نسخهٔ تأییدشدهٔ آن.',
  scaleLabel: 'اندازه',
  mockMark: 'نشانهٔ ساختگی',
  openChapter: 'فصل هویت بصری',
  openChapterHint: 'پالت رنگ، نمونهٔ حروف و ساختار لوگو، فقط از واقعیت‌های تأییدشده.',
  backToChapter: 'بازگشت به فصل',
  printTitle: 'نمای چاپ',
  runningHead: 'کتاب برند · هویت بصری',
  contents: 'در این فصل',
  colorTitle: 'پالت رنگ',
  colorLead: 'هر رنگ یک نقش است. نقش با تغییر فام باقی می‌ماند؛ کد hex مقدار تأییدشدهٔ امروز است.',
  rolesTitle: 'نقش‌های رنگ',
  combinationsTitle: 'ترکیب‌ها',
  combinationsLead: 'جفت‌های متن و زمینه که نام نقش‌ها اعلام می‌کنند (onPrimary روی primary)، با نسبت سنجیده.',
  combinationsNone: 'هیچ نقشی به‌عنوان متن روی نقش دیگر نام‌گذاری نشده (مثلاً onPrimary روی primary)، پس ترکیبی اعلام نشده است. جدول زیر همهٔ جفت‌ها را می‌سنجد.',
  contrastTitle: 'کنتراست سنجیده',
  contrastLead: 'با فرمول نسبت کنتراست WCAG 2 از کدهای hex تأییدشده محاسبه شده است. نسبت، دو رنگ را می‌سنجد؛ ممیزی دسترس‌پذیری هیچ محصولی نیست.',
  gridTitle: 'جدول کنتراست',
  gridHint: 'رنگ متن در ردیف، زمینه در ستون. نسبت‌ها رو به پایین گرد شده‌اند.',
  gridOmitted: 'بیش از {count} رنگ: جدول برای خوانایی حذف شده است. ترکیب‌های اعلام‌شده همچنان سنجیده می‌شوند.',
  gridCorner: 'متن ↓ · زمینه ←',
  ratio: '{ratio}:1',
  normalText: 'متن عادی 4.5:1',
  largeText: 'متن درشت 3:1',
  enhanced: 'سطح بالاتر 7:1',
  passes: 'برآورده',
  fails: 'کمتر',
  textOn: '{fg} روی {bg}',
  sample: 'متن نمونه',
  typeTitle: 'حروف‌نگاری',
  typeLead: 'نقش‌های حروف با خانواده، جایگزین و اندازه، در هر زبانی که برند پشتیبانی می‌کند.',
  fallbackLabel: 'جایگزین',
  sizeLabel: '{size} px',
  lineHeightLabel: 'ارتفاع خط {value}',
  sizeUnset: 'اندازه تعیین نشده',
  fontNote: 'با نام خانواده نمایش داده می‌شود. اگر قلم روی این دستگاه نصب نباشد، مرورگر از جایگزین استفاده می‌کند و سطرهای فارسی، جایی که قلم نویسه‌های عربی‌خط ندارد، با وزیرمتن نمایش داده می‌شوند. Studio هیچ فایل قلمی از برند بارگذاری نمی‌کند.',
  scriptName: { en: 'انگلیسی', fa: 'فارسی', tr: 'ترکی' },
  specimenLine: en.specimenLine,
  logoTitle: 'ساختار لوگو',
  logoLead: 'فضای خالی و کمترین اندازه، پیرامون فایل اصلی تأییدشده.',
  clearSpace: 'فضای خالی',
  minSize: 'کمترین اندازه روی صفحه',
  minPrint: 'کمترین اندازه در چاپ',
  clearSpaceX: '{value} × ارتفاع نشانه',
  clearSpacePx: '{value} px در کمترین اندازه',
  notSet: 'تعیین نشده',
  masterFile: 'فایل اصلی',
  drawnAtMin: 'در کمترین اندازهٔ تأییدشده، پیکسل واقعی',
  constructionNote: 'فضای خالی از لبهٔ نشانه در هر چهار سو سنجیده می‌شود؛ کمترین اندازه در امتداد ارتفاع نشانه سنجیده می‌شود.',
  constructionUnknownSize: 'فایل اصلی تناسب خود را اعلام نمی‌کند، پس نقشه از قاب مربعی استفاده می‌کند. مقادیر دقیق‌اند؛ قاب نه.',
  awaitingKicker: 'در انتظار دارایی تأییدشده',
  awaitingColorTitle: 'پالت منتظر نقش‌های رنگ تأییدشده است',
  awaitingColorBody: 'نمونه‌رنگ‌ها، ترکیب‌ها و کنتراست سنجیده به‌محض تأیید نقش‌های رنگ رسم می‌شوند. هیچ چیز اینجا از پیش‌نویس رسم نمی‌شود.',
  awaitingTypeTitle: 'نمونهٔ حروف منتظر نقش‌های حروف تأییدشده است',
  awaitingTypeBody: 'پس از تأیید نقش‌های حروف، هر نقش به انگلیسی، فارسی و ترکی چیده می‌شود. هیچ چیز اینجا از پیش‌نویس چیده نمی‌شود.',
  awaitingLogoTitle: 'ساختار لوگو در انتظار است',
  awaitingLogoBody: 'فضای خالی و کمترین اندازه فقط پیرامون یک فایل اصلی تأییدشده و با قاعدهٔ اندازهٔ تأییدشده رسم می‌شوند. تا آن زمان هیچ لوگویی رسم یا القا نمی‌شود.',
  awaitingSpec: 'قاعدهٔ اندازه و فضای خالی هنوز تأیید نشده است.',
  awaitingMaster: {
    missing: 'هیچ فایل اصلی تأییدشده‌ای ثبت نشده است.',
    example_only: 'در فهرست دارایی‌ها فقط نمونه‌های جای‌نگهدار قالب هست. این‌ها هرگز به‌عنوان لوگو به کار نمی‌روند.',
    not_previewable: 'یک فایل اصلی تأییدشده ثبت شده، اما فایل آن به‌طور امن خوانده نشد.',
    ambiguous: 'چند فایل لوگوی تأییدشده ثبت شده و هیچ‌کدام به‌عنوان فایل اصلی نام برده نشده، پس هیچ‌کدام رسم نمی‌شود. هیچ چیز حدس زده نمی‌شود.',
  },
  masterBadge: { draft_tag: 'برچسب پیش‌نویس', internal_only: 'داخلی · منتشرنشده' },
  stepMasterAmbiguous: 'فایل اصلی را با شناسهٔ دارایی یا مسیر آن در پاسخ تأییدشدهٔ «محل فایل اصلی» (brand.logo.masters) نام ببرید.',
  awaitingDraft: 'یک پیش‌نویس هست و منتظر بازبینی است.',
  awaitingWithheld: 'این مقدار محدود است و اینجا نمایش داده نمی‌شود.',
  awaitingStepsTitle: 'برای کامل‌شدن این صفحه',
  stepApprove: '«{label}» را پاسخ دهید و تأیید کنید.',
  stepMaster: 'فایل اصلی را با برچسب logo، مجوز و checksum در فهرست دارایی‌ها ثبت و تأیید کنید؛ اگر بیش از یک لوگو هست، آن را در brand.logo.masters نام ببرید (یا برچسب master بزنید).',
  ready: 'رسم‌شده از دادهٔ تأییدشده',
  waiting: 'در انتظار',
  pageColor: 'رنگ',
  pageType: 'حروف',
  pageLogo: 'لوگو',
  pageSources: 'منابع',
  plate: 'صفحهٔ {n}',
}

const tr: IdentityText = {
  chapterKicker: 'Marka Kitabı · Bölüm',
  chapterTitle: 'Görsel kimlik',
  chapterLead: 'Renk, yazı ve logo; yalnızca onaylı bilgilerden ve onaylı ana dosyadan çizilir. Henüz onaylı bir şey yoksa sayfa neyi beklediğini söyler.',
  familyLabel: 'Aile',
  sourcesIntro: 'Bu bölümdeki her levha, çizildiği bilgi veya varlık, durumu ve onaylı sürümü.',
  scaleLabel: 'Boyut',
  mockMark: 'SAHTE İŞARET',
  openChapter: 'Görsel kimlik bölümü',
  openChapterHint: 'Renk paleti, yazı örneği ve logo yapısı; yalnızca onaylı bilgilerden.',
  backToChapter: 'Bölüme dön',
  printTitle: 'Baskı görünümü',
  runningHead: 'Marka Kitabı · Görsel kimlik',
  contents: 'Bu bölümde',
  colorTitle: 'Renk paleti',
  colorLead: 'Her renk bir roldür. Roller ton değişse de kalır; hex bugünkü onaylı değerdir.',
  rolesTitle: 'Renk rolleri',
  combinationsTitle: 'Kombinasyonlar',
  combinationsLead: 'Rollerin adıyla bildirdiği metin ve zemin çiftleri (primary üzerinde onPrimary), ölçülen oranla.',
  combinationsNone: 'Hiçbir rol başka bir rolün üzerindeki metin olarak adlandırılmamış (ör. primary üzerinde onPrimary), bu yüzden kombinasyon bildirilmedi. Aşağıdaki tablo her çifti ölçer.',
  contrastTitle: 'Ölçülen kontrast',
  contrastLead: 'Onaylı hex değerlerinden WCAG 2 kontrast oranı formülüyle hesaplanır. Bir oran iki rengi ölçer; hiçbir ürünün erişilebilirlik denetimi değildir.',
  gridTitle: 'Kontrast tablosu',
  gridHint: 'Satırda metin rengi, sütunda zemin. Oranlar aşağı yuvarlanır.',
  gridOmitted: '{count} renkten fazla: tablo okunaklı kalsın diye çıkarıldı. Bildirilen kombinasyonlar yine ölçülür.',
  gridCorner: 'Metin ↓ · Zemin →',
  ratio: '{ratio}:1',
  normalText: 'Normal metin 4.5:1',
  largeText: 'Büyük metin 3:1',
  enhanced: 'Gelişmiş 7:1',
  passes: 'Karşılıyor',
  fails: 'Altında',
  textOn: '{bg} üzerinde {fg}',
  sample: 'Örnek metin',
  typeTitle: 'Tipografi',
  typeLead: 'Aile, yedek ve boyutuyla yazı rolleri; markanın desteklediği her dilde dizilmiş.',
  fallbackLabel: 'Yedek',
  sizeLabel: '{size} px',
  lineHeightLabel: 'satır yüksekliği {value}',
  sizeUnset: 'Boyut belirlenmedi',
  fontNote: 'Aile adıyla dizilir. Yazı tipi bu cihazda yüklü değilse tarayıcı yedeği kullanır; Farsça satırlar, yazı tipinde Arap alfabesi glifleri yoksa Vazirmatn ile gösterilir. Studio markadan hiçbir yazı tipi dosyası yüklemez.',
  scriptName: { en: 'İngilizce', fa: 'Farsça', tr: 'Türkçe' },
  specimenLine: en.specimenLine,
  logoTitle: 'Logo yapısı',
  logoLead: 'Onaylı ana dosyanın çevresinde boşluk ve en küçük boyut.',
  clearSpace: 'Boşluk',
  minSize: 'Ekranda en küçük boyut',
  minPrint: 'Baskıda en küçük boyut',
  clearSpaceX: '{value} × işaret yüksekliği',
  clearSpacePx: 'en küçük boyutta {value} px',
  notSet: 'Belirlenmedi',
  masterFile: 'Ana dosya',
  drawnAtMin: 'Onaylı en küçük boyutta, gerçek piksel',
  constructionNote: 'Boşluk her yönde işaretin kenarından ölçülür; en küçük boyut işaret yüksekliği boyunca ölçülür.',
  constructionUnknownSize: 'Ana dosya oranlarını belirtmiyor, bu yüzden çizim kare bir çerçeve kullanır. Değerler kesindir; çerçeve değildir.',
  awaitingKicker: 'Onaylı varlık bekleniyor',
  awaitingColorTitle: 'Palet onaylı renk rollerini bekliyor',
  awaitingColorBody: 'Renk örnekleri, kombinasyonlar ve ölçülen kontrast, renk rolleri onaylanınca çizilir. Burada hiçbir şey taslaktan çizilmez.',
  awaitingTypeTitle: 'Yazı örneği onaylı yazı rollerini bekliyor',
  awaitingTypeBody: 'Yazı rolleri onaylanınca her rol İngilizce, Farsça ve Türkçe dizilir. Burada hiçbir şey taslaktan dizilmez.',
  awaitingLogoTitle: 'Logo yapısı bekliyor',
  awaitingLogoBody: 'Boşluk ve en küçük boyut yalnızca onaylı bir ana dosyanın çevresinde, onaylı bir boyut kuralıyla çizilir. O zamana kadar hiçbir logo çizilmez veya ima edilmez.',
  awaitingSpec: 'Boyut ve boşluk kuralı henüz onaylanmadı.',
  awaitingMaster: {
    missing: 'Kayıtlı onaylı bir ana dosya yok.',
    example_only: 'Varlık listesinde yalnızca şablon örnek yer tutucuları var. Bunlar asla logo olarak kullanılmaz.',
    not_previewable: 'Onaylı bir ana dosya kayıtlı, ancak dosyası güvenle okunamadı.',
    ambiguous: 'Birden çok onaylı logo dosyası kayıtlı ve hiçbiri ana dosya olarak adlandırılmamış, bu yüzden hiçbiri çizilmiyor. Tahmin yapılmaz.',
  },
  masterBadge: { draft_tag: 'Taslak etiketli', internal_only: 'Dahili · yayımlanmadı' },
  stepMasterAmbiguous: 'Ana dosyayı, onaylı “Ana dosya konumu” yanıtında (brand.logo.masters) varlık kimliği veya yoluyla adlandırın.',
  awaitingDraft: 'Bir taslak var ve incelemeyi bekliyor.',
  awaitingWithheld: 'Değer kısıtlı ve burada gösterilmiyor.',
  awaitingStepsTitle: 'Bu sayfayı tamamlamak için',
  stepApprove: '“{label}” sorusunu yanıtlayın ve onaylayın.',
  stepMaster: 'Ana dosyayı varlık listesine logo etiketi, lisans ve checksum ile kaydedip onaylayın; birden çok logo varsa brand.logo.masters içinde adlandırın (veya master etiketi verin).',
  ready: 'Onaylı veriden çizildi',
  waiting: 'Bekliyor',
  pageColor: 'Renk',
  pageType: 'Yazı',
  pageLogo: 'Logo',
  pageSources: 'Kaynaklar',
  plate: 'Levha {n}',
}

export const IDENTITY_TEXT: Record<'en' | 'fa' | 'tr', IdentityText> = { en, fa, tr }
