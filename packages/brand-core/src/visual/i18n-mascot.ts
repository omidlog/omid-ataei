import type { VisualLang } from './i18n.js'
import type { MascotCategory, MascotGapReason, MascotStageSlot } from './model.js'

/**
 * en/fa/tr text for the mascot atlas and six-stage evolution sheet (Visual Blueprint V3.4). Labels and explanations
 * only: state names, stage names, usage notes and asset names are shown as recorded, never translated.
 */
export interface MascotText {
  kicker: string
  title: string
  lead: string
  contents: string
  atlasTitle: string
  atlasLead: string
  evolutionTitle: string
  evolutionLead: string
  ready: string
  waiting: string
  /** `{drawn}` of `{states}`. */
  atlasCount: string
  /** `{count}` states waiting. */
  awaitingCount: string
  /** `{count}` in review. */
  inReviewCount: string
  category: Record<MascotCategory, string>
  useLabel: string
  doLabel: string
  dontLabel: string
  /** `{count}` more approved variants. */
  variants: string
  coreSet: string
  badge: Record<'draft_tag' | 'internal_only', string>
  gap: Record<MascotGapReason, string>
  awaitingTitle: string
  awaitingLead: string
  awaitingKicker: string
  emptyTitle: string
  emptyBody: string
  emptyStepsTitle: string
  emptySteps: string[]
  moduleOffTitle: string
  moduleOffBody: string
  /** `{n}`. */
  stageLabel: string
  definition: Record<MascotStageSlot['definition'], string>
  stageNameHidden: string
  exampleConfigNote: string
  /** `{count}` stages recorded. */
  stagesRecorded: string
  evolutionEmptyTitle: string
  evolutionEmptyBody: string
  placeholderArt: string
  mockArt: string
  artworkFile: string
  neverNote: string
  openPrint: string
  openPrintPublic: string
  backToAtlas: string
  printTitle: string
  runningHead: string
  pageAtlas: string
  pageEvolution: string
  pageSources: string
  idsTitle: string
  idsLead: string
  colState: string
  colArtwork: string
  colAsset: string
  colStage: string
  noIds: string
  linkTitle: string
  linkBody: string
  linkLabel: string
}

const en: MascotText = {
  kicker: 'Brand Book · Character',
  title: 'Mascot atlas',
  lead: 'Every expression and pose of the character, drawn only from approved artwork, with when to use it and when not to. A state without approved artwork stays an empty frame until a file is approved.',
  contents: 'Contents',
  atlasTitle: 'Mascot atlas',
  atlasLead: 'Approved artwork by category: expressions, poses, product states, learning moments, props and campaigns. Each plate carries the recorded usage and the do and don’t notes.',
  evolutionTitle: 'Six-stage evolution sheet',
  evolutionLead: 'The character’s growth stages side by side, in order. A stage shows artwork only when an approved file is recorded for that stage; every other stage is a clear placeholder.',
  ready: 'Approved artwork',
  waiting: 'Awaiting approved artwork',
  atlasCount: '{drawn} of {states} states drawn from approved artwork',
  awaitingCount: '{count} waiting for artwork',
  inReviewCount: '{count} in review, not approved',
  category: {
    emotion: 'Expressions',
    action: 'Poses',
    ui: 'Product UI states',
    learning: 'Learning moments',
    prop: 'Prop interactions',
    seasonal: 'Seasonal and campaign',
    other: 'Other states',
  },
  useLabel: 'Use',
  doLabel: 'Do',
  dontLabel: 'Don’t use',
  variants: '{count} more approved variants',
  coreSet: 'Core set',
  badge: { draft_tag: 'File still tagged draft', internal_only: 'Internal only, not published' },
  gap: {
    in_review: 'Artwork in review, not approved',
    not_previewable: 'Approved, but the file cannot be previewed',
    example_only: 'Only a template placeholder',
    not_drawn: 'No artwork yet',
    not_published: 'Not published',
  },
  awaitingTitle: 'Not yet drawn',
  awaitingLead: 'These states are defined in the catalog but have no approved artwork. They are listed by name only; nothing is drawn in their place.',
  awaitingKicker: 'Awaiting approved artwork',
  emptyTitle: 'No approved mascot artwork yet',
  emptyBody: 'The catalog describes the character’s states, but none has an approved file. The atlas fills in plate by plate as artwork is approved; it never shows generated or placeholder art as the character.',
  emptyStepsTitle: 'To fill this page',
  emptySteps: [
    'Register the artwork file in the asset manifest and approve it with a checksum.',
    'Add the artwork to its state in the mascot catalog and move the artwork and the state to approved.',
    'Publish the artwork before it may appear in the public edition.',
  ],
  moduleOffTitle: 'The mascot module is off',
  moduleOffBody: 'This brand has no character. Turn the mascot module on in the brand configuration if one is planned.',
  stageLabel: 'Stage {n}',
  definition: { approved: 'Approved stage', draft: 'Draft stage definition', example: 'Example configuration', not_defined: 'Not defined' },
  stageNameHidden: 'Stage name not published',
  exampleConfigNote: 'The stage names come from the template’s example configuration. They are not a rule for this brand until the owner replaces or approves them.',
  stagesRecorded: '{count} stages recorded',
  evolutionEmptyTitle: 'No stage has approved artwork yet',
  evolutionEmptyBody: 'Each frame waits for an approved file recorded for its stage. Nothing is drawn in between.',
  placeholderArt: 'Empty frame: awaiting approved artwork',
  mockArt: 'Mock artwork (fictional)',
  artworkFile: 'Artwork file',
  neverNote: 'Drawn only from approved files in the asset manifest. Nothing on this page is generated, traced or inferred.',
  openPrint: 'Print or save as PDF',
  openPrintPublic: 'Public edition',
  backToAtlas: 'Back to the mascot atlas',
  printTitle: 'Mascot atlas, print view',
  runningHead: 'Brand Book · Mascot atlas',
  pageAtlas: 'Mascot atlas',
  pageEvolution: 'Evolution sheet',
  pageSources: 'Sources',
  idsTitle: 'Artwork and asset ids',
  idsLead: 'The catalog, artwork and asset ids behind each drawn plate.',
  colState: 'State',
  colArtwork: 'Artwork id',
  colAsset: 'Asset id',
  colStage: 'Stage',
  noIds: 'No artwork is drawn, so there are no ids to list.',
  linkTitle: 'Mascot atlas',
  linkBody: 'Every expression, pose and growth stage drawn from approved artwork only, as a printable book chapter.',
  linkLabel: 'Open the mascot atlas',
}

const fa: MascotText = {
  kicker: 'کتاب برند · کاراکتر',
  title: 'اطلس ماسکات',
  lead: 'همهٔ حالت‌ها و ژست‌های کاراکتر، فقط از روی آثار تأییدشده، همراه با اینکه کجا به کار رود و کجا نه. حالتی که اثر تأییدشده ندارد تا تأیید یک فایل، قاب خالی می‌ماند.',
  contents: 'فهرست',
  atlasTitle: 'اطلس ماسکات',
  atlasLead: 'آثار تأییدشده به تفکیک دسته: حالت‌های چهره، ژست‌ها، وضعیت‌های محصول، لحظه‌های یادگیری، اشیا و کمپین‌ها. هر صفحه کاربرد ثبت‌شده و نکته‌های بایدها و نبایدها را دارد.',
  evolutionTitle: 'برگهٔ تکامل شش‌مرحله‌ای',
  evolutionLead: 'مرحله‌های رشد کاراکتر کنار هم و به ترتیب. هر مرحله فقط وقتی اثر نشان می‌دهد که فایلی تأییدشده برای همان مرحله ثبت شده باشد؛ بقیهٔ مرحله‌ها جای‌نگهدار روشن‌اند.',
  ready: 'اثر تأییدشده',
  waiting: 'در انتظار اثر تأییدشده',
  atlasCount: '{drawn} از {states} حالت از روی اثر تأییدشده',
  awaitingCount: '{count} حالت در انتظار اثر',
  inReviewCount: '{count} در حال بازبینی، تأییدنشده',
  category: {
    emotion: 'حالت‌های چهره',
    action: 'ژست‌ها',
    ui: 'وضعیت‌های رابط محصول',
    learning: 'لحظه‌های یادگیری',
    prop: 'تعامل با اشیا',
    seasonal: 'فصلی و کمپین',
    other: 'حالت‌های دیگر',
  },
  useLabel: 'کاربرد',
  doLabel: 'بایدها',
  dontLabel: 'نبایدها',
  variants: '{count} نسخهٔ تأییدشدهٔ دیگر',
  coreSet: 'مجموعهٔ اصلی',
  badge: { draft_tag: 'فایل هنوز برچسب پیش‌نویس دارد', internal_only: 'فقط داخلی، منتشرنشده' },
  gap: {
    in_review: 'اثر در حال بازبینی، تأییدنشده',
    not_previewable: 'تأییدشده، اما پیش‌نمایش فایل ممکن نیست',
    example_only: 'فقط جای‌نگهدار قالب',
    not_drawn: 'هنوز اثری نیست',
    not_published: 'منتشرنشده',
  },
  awaitingTitle: 'هنوز ترسیم نشده',
  awaitingLead: 'این حالت‌ها در کاتالوگ تعریف شده‌اند اما اثر تأییدشده ندارند. فقط نامشان آمده است و چیزی به جایشان کشیده نمی‌شود.',
  awaitingKicker: 'در انتظار اثر تأییدشده',
  emptyTitle: 'هنوز اثر تأییدشده‌ای از ماسکات نیست',
  emptyBody: 'کاتالوگ حالت‌های کاراکتر را توصیف می‌کند، اما هیچ‌کدام فایل تأییدشده ندارند. اطلس با تأیید هر اثر صفحه‌به‌صفحه پر می‌شود و هرگز اثر ساختگی یا جای‌نگهدار را به جای کاراکتر نشان نمی‌دهد.',
  emptyStepsTitle: 'برای پر شدن این صفحه',
  emptySteps: [
    'فایل اثر را در فهرست دارایی‌ها ثبت و با چک‌سام تأیید کنید.',
    'اثر را به حالتش در کاتالوگ ماسکات اضافه کنید و اثر و حالت را به «تأییدشده» ببرید.',
    'پیش از نمایش در نسخهٔ عمومی، اثر را منتشر کنید.',
  ],
  moduleOffTitle: 'ماژول ماسکات خاموش است',
  moduleOffBody: 'این برند کاراکتر ندارد. اگر کاراکتری در برنامه است، ماژول ماسکات را در پیکربندی برند روشن کنید.',
  stageLabel: 'مرحلهٔ {n}',
  definition: { approved: 'مرحلهٔ تأییدشده', draft: 'تعریف پیش‌نویس مرحله', example: 'پیکربندی نمونه', not_defined: 'تعریف‌نشده' },
  stageNameHidden: 'نام مرحله منتشر نشده',
  exampleConfigNote: 'نام مرحله‌ها از پیکربندی نمونهٔ قالب آمده است. تا مالک آن‌ها را جایگزین یا تأیید نکند، قاعده‌ای برای این برند نیستند.',
  stagesRecorded: '{count} مرحله ثبت شده',
  evolutionEmptyTitle: 'هنوز هیچ مرحله‌ای اثر تأییدشده ندارد',
  evolutionEmptyBody: 'هر قاب منتظر فایلی تأییدشده است که برای همان مرحله ثبت شده باشد. چیزی میان آن‌ها کشیده نمی‌شود.',
  placeholderArt: 'قاب خالی: در انتظار اثر تأییدشده',
  mockArt: 'اثر نمونه (ساختگی)',
  artworkFile: 'فایل اثر',
  neverNote: 'فقط از فایل‌های تأییدشدهٔ فهرست دارایی‌ها. هیچ چیز در این صفحه تولید، ردگیری یا حدس زده نشده است.',
  openPrint: 'چاپ یا ذخیره به PDF',
  openPrintPublic: 'نسخهٔ عمومی',
  backToAtlas: 'بازگشت به اطلس ماسکات',
  printTitle: 'اطلس ماسکات، نمای چاپی',
  runningHead: 'کتاب برند · اطلس ماسکات',
  pageAtlas: 'اطلس ماسکات',
  pageEvolution: 'برگهٔ تکامل',
  pageSources: 'منابع',
  idsTitle: 'شناسه‌های اثر و دارایی',
  idsLead: 'شناسه‌های کاتالوگ، اثر و دارایی پشت هر صفحهٔ ترسیم‌شده.',
  colState: 'حالت',
  colArtwork: 'شناسهٔ اثر',
  colAsset: 'شناسهٔ دارایی',
  colStage: 'مرحله',
  noIds: 'اثری ترسیم نشده، پس شناسه‌ای برای فهرست نیست.',
  linkTitle: 'اطلس ماسکات',
  linkBody: 'همهٔ حالت‌ها، ژست‌ها و مرحله‌های رشد، فقط از روی آثار تأییدشده، به شکل فصلی قابل چاپ از کتاب برند.',
  linkLabel: 'باز کردن اطلس ماسکات',
}

const tr: MascotText = {
  kicker: 'Marka Kitabı · Karakter',
  title: 'Maskot atlası',
  lead: 'Karakterin tüm ifadeleri ve pozları, yalnızca onaylı çizimlerden; ne zaman kullanılacağı ve ne zaman kullanılmayacağıyla. Onaylı çizimi olmayan bir durum, bir dosya onaylanana kadar boş çerçeve olarak kalır.',
  contents: 'İçindekiler',
  atlasTitle: 'Maskot atlası',
  atlasLead: 'Kategoriye göre onaylı çizimler: ifadeler, pozlar, ürün durumları, öğrenme anları, nesneler ve kampanyalar. Her levha kayıtlı kullanımı ve yapılacaklar ile yapılmayacaklar notlarını taşır.',
  evolutionTitle: 'Altı aşamalı gelişim sayfası',
  evolutionLead: 'Karakterin gelişim aşamaları yan yana ve sırayla. Bir aşama yalnızca o aşama için kayıtlı onaylı bir dosya varsa çizim gösterir; diğer her aşama açık bir yer tutucudur.',
  ready: 'Onaylı çizim',
  waiting: 'Onaylı çizim bekleniyor',
  atlasCount: '{states} durumdan {drawn} tanesi onaylı çizimden',
  awaitingCount: '{count} durum çizim bekliyor',
  inReviewCount: '{count} incelemede, onaylanmadı',
  category: {
    emotion: 'İfadeler',
    action: 'Pozlar',
    ui: 'Ürün arayüzü durumları',
    learning: 'Öğrenme anları',
    prop: 'Nesne etkileşimleri',
    seasonal: 'Sezonluk ve kampanya',
    other: 'Diğer durumlar',
  },
  useLabel: 'Kullanım',
  doLabel: 'Yapın',
  dontLabel: 'Kullanmayın',
  variants: '{count} onaylı varyant daha',
  coreSet: 'Temel set',
  badge: { draft_tag: 'Dosya hâlâ taslak etiketli', internal_only: 'Yalnızca iç kullanım, yayımlanmadı' },
  gap: {
    in_review: 'Çizim incelemede, onaylanmadı',
    not_previewable: 'Onaylı, ancak dosya önizlenemiyor',
    example_only: 'Yalnızca şablon yer tutucusu',
    not_drawn: 'Henüz çizim yok',
    not_published: 'Yayımlanmadı',
  },
  awaitingTitle: 'Henüz çizilmedi',
  awaitingLead: 'Bu durumlar katalogda tanımlı ama onaylı çizimleri yok. Yalnızca adlarıyla listelenir; yerlerine hiçbir şey çizilmez.',
  awaitingKicker: 'Onaylı çizim bekleniyor',
  emptyTitle: 'Henüz onaylı maskot çizimi yok',
  emptyBody: 'Katalog karakterin durumlarını tanımlıyor, ancak hiçbirinin onaylı dosyası yok. Atlas, çizimler onaylandıkça levha levha dolar; üretilmiş ya da yer tutucu bir görseli asla karakter olarak göstermez.',
  emptyStepsTitle: 'Bu sayfayı doldurmak için',
  emptySteps: [
    'Çizim dosyasını varlık manifestosuna kaydedin ve sağlama toplamıyla onaylayın.',
    'Çizimi maskot kataloğundaki durumuna ekleyin; çizimi ve durumu onaylı yapın.',
    'Genel sürümde görünmeden önce çizimi yayımlayın.',
  ],
  moduleOffTitle: 'Maskot modülü kapalı',
  moduleOffBody: 'Bu markanın bir karakteri yok. Planlanıyorsa marka yapılandırmasında maskot modülünü açın.',
  stageLabel: '{n}. aşama',
  definition: { approved: 'Onaylı aşama', draft: 'Taslak aşama tanımı', example: 'Örnek yapılandırma', not_defined: 'Tanımlanmadı' },
  stageNameHidden: 'Aşama adı yayımlanmadı',
  exampleConfigNote: 'Aşama adları şablonun örnek yapılandırmasından gelir. Sahip bunları değiştirene ya da onaylayana kadar bu marka için bir kural değildir.',
  stagesRecorded: '{count} aşama kayıtlı',
  evolutionEmptyTitle: 'Henüz hiçbir aşamanın onaylı çizimi yok',
  evolutionEmptyBody: 'Her çerçeve, kendi aşaması için kayıtlı onaylı bir dosya bekler. Aralarına hiçbir şey çizilmez.',
  placeholderArt: 'Boş çerçeve: onaylı çizim bekleniyor',
  mockArt: 'Örnek çizim (kurgusal)',
  artworkFile: 'Çizim dosyası',
  neverNote: 'Yalnızca varlık manifestosundaki onaylı dosyalardan çizilir. Bu sayfadaki hiçbir şey üretilmemiş, kopyalanmamış ya da tahmin edilmemiştir.',
  openPrint: 'Yazdır veya PDF olarak kaydet',
  openPrintPublic: 'Genel sürüm',
  backToAtlas: 'Maskot atlasına dön',
  printTitle: 'Maskot atlası, baskı görünümü',
  runningHead: 'Marka Kitabı · Maskot atlası',
  pageAtlas: 'Maskot atlası',
  pageEvolution: 'Gelişim sayfası',
  pageSources: 'Kaynaklar',
  idsTitle: 'Çizim ve varlık kimlikleri',
  idsLead: 'Çizilen her levhanın arkasındaki katalog, çizim ve varlık kimlikleri.',
  colState: 'Durum',
  colArtwork: 'Çizim kimliği',
  colAsset: 'Varlık kimliği',
  colStage: 'Aşama',
  noIds: 'Çizim gösterilmiyor, bu yüzden listelenecek kimlik yok.',
  linkTitle: 'Maskot atlası',
  linkBody: 'Tüm ifadeler, pozlar ve gelişim aşamaları yalnızca onaylı çizimlerden, yazdırılabilir bir kitap bölümü olarak.',
  linkLabel: 'Maskot atlasını aç',
}

export const MASCOT_TEXT: Record<VisualLang, MascotText> = { en, fa, tr }

export function mascotText(lang: VisualLang): MascotText {
  return MASCOT_TEXT[lang] ?? en
}
