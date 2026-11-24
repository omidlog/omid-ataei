import type { SourceNote, SourceNoteStatus, SwotQuadrantId, TowsType, ValueFitZoneId } from './model.js'
import type { VisualLang } from './i18n.js'

/**
 * en/fa/tr text for SWOT / TOWS and the Value Proposition Canvas (Visual V3.2). Standard framework names stay
 * recognizable in every language (SWOT, TOWS, SO/ST/WO/WT). Item names, details and sources are brand values and are
 * shown as recorded, never translated; choice labels come from the entity specs (`entityOptionLabel`).
 */
export interface StrategyText {
  swotPageTitle: string
  swotTitle: string
  swotLead: string
  towsTitle: string
  towsLead: string
  vpcTitle: string
  vpcLead: string
  kicker: string
  quadrant: Record<SwotQuadrantId, { title: string; prompt: string; empty: string }>
  axisInternal: string
  axisExternal: string
  axisHelpful: string
  axisHarmful: string
  tows: Record<TowsType, { title: string; lead: string }>
  towsEmptyCell: string
  towsEmptyTitle: string
  towsUnplaced: string
  uses: string
  zone: Record<ValueFitZoneId, { title: string; prompt: string; empty: string }>
  valueMap: string
  customerProfile: string
  forSegment: string
  addresses: string
  fitTitle: string
  fitLead: string
  /** `{done}` of `{total}`. */
  painsRelieved: string
  gainsCreated: string
  fitColPain: string
  fitColRelievers: string
  fitColGain: string
  fitColCreators: string
  fitNoReliever: string
  fitNoCreator: string
  fitEmpty: string
  emptyBody: string
  sourcesTitle: string
  sourcesLead: string
  sourceKind: Record<SourceNote['kind'], string>
  sourceStatus: Record<SourceNoteStatus, string>
  /** `{count}` internal sources left out of the public edition. */
  sourcesHidden: string
  sourcesNone: string
  sourceMark: string
  idsTitle: string
  idsLead: string
  idsColItem: string
  idsColId: string
  idsColSources: string
  editHint: string
  openPrint: string
  openPrintPublic: string
  backToSwot: string
  backToVpc: string
  printTitle: string
  pageSources: string
  linkSwot: string
  linkVpc: string
  linksTitle: string
}

const EN: StrategyText = {
  swotPageTitle: 'SWOT / TOWS',
  swotTitle: 'SWOT analysis',
  swotLead: 'Strengths and weaknesses inside the business, opportunities and threats outside it, each as its own item with its sources.',
  towsTitle: 'TOWS matrix',
  towsLead: 'Strategies that follow from the SWOT, each placed by its recorded type and linked to the items it uses.',
  vpcTitle: 'Value Proposition Canvas',
  vpcLead: 'The value map beside the customer profile. Fit is shown only where a reliever is linked to a pain or a creator to a gain.',
  kicker: 'Strategy Lab',
  quadrant: {
    strengths: { title: 'Strengths', prompt: 'Internal · helpful', empty: 'No strengths listed yet' },
    weaknesses: { title: 'Weaknesses', prompt: 'Internal · harmful', empty: 'No weaknesses listed yet' },
    opportunities: { title: 'Opportunities', prompt: 'External · helpful', empty: 'No opportunities listed yet' },
    threats: { title: 'Threats', prompt: 'External · harmful', empty: 'No threats listed yet' },
  },
  axisInternal: 'Internal',
  axisExternal: 'External',
  axisHelpful: 'Helpful',
  axisHarmful: 'Harmful',
  tows: {
    so: { title: 'SO strategies', lead: 'Use strengths to seize opportunities' },
    st: { title: 'ST strategies', lead: 'Use strengths to counter threats' },
    wo: { title: 'WO strategies', lead: 'Fix weaknesses by using opportunities' },
    wt: { title: 'WT strategies', lead: 'Reduce weaknesses and avoid threats' },
  },
  towsEmptyCell: 'No strategy of this type yet',
  towsEmptyTitle: 'No TOWS strategies listed yet',
  towsUnplaced: 'Strategies without a type (not placed in a cell)',
  uses: 'Uses',
  zone: {
    products_services: { title: 'Products & services', prompt: 'What you offer', empty: 'No products or services listed yet' },
    gain_creators: { title: 'Gain creators', prompt: 'How the offer creates gains', empty: 'No gain creators listed yet' },
    pain_relievers: { title: 'Pain relievers', prompt: 'How the offer relieves pains', empty: 'No pain relievers listed yet' },
    customer_jobs: { title: 'Customer jobs', prompt: 'What the customer is trying to get done', empty: 'No customer jobs listed yet' },
    gains: { title: 'Gains', prompt: 'Outcomes the customer wants', empty: 'No gains listed yet' },
    pains: { title: 'Pains', prompt: 'What annoys or blocks the customer', empty: 'No pains listed yet' },
  },
  valueMap: 'Value map',
  customerProfile: 'Customer profile',
  forSegment: 'For',
  addresses: 'Answers',
  fitTitle: 'Fit',
  fitLead: 'Read only from the links the owner recorded. Nothing is matched by wording and there is no score.',
  painsRelieved: '{done} of {total} pains have a linked reliever',
  gainsCreated: '{done} of {total} gains have a linked creator',
  fitColPain: 'Pain',
  fitColRelievers: 'Relieved by',
  fitColGain: 'Gain',
  fitColCreators: 'Created by',
  fitNoReliever: 'No reliever linked yet',
  fitNoCreator: 'No creator linked yet',
  fitEmpty: 'Fit appears once pains or gains are listed.',
  emptyBody: 'Nothing is filled in for you. The owner lists the items; each one can cite its sources.',
  sourcesTitle: 'Sources',
  sourcesLead: 'Numbered in reading order. A source is named, never quoted; an approved answer is cited by its label only.',
  sourceKind: { fact: 'Approved answer', knowledge: 'Knowledge note', evidence: 'Evidence record', web: 'Web page' },
  sourceStatus: {
    approved: 'Approved',
    shared: 'Shared note: an idea, not a fact',
    verified: 'Verified',
    recorded: 'Recorded, not verified',
    not_available: 'Not available in this edition',
  },
  sourcesHidden: '{count} internal sources are not shown in the public edition.',
  sourcesNone: 'No item cites a source yet.',
  sourceMark: 'Sources',
  idsTitle: 'Item ids and sources',
  idsLead: 'For editing in the brand repository. Ids never change when an item is edited or moved.',
  idsColItem: 'Item',
  idsColId: 'Id',
  idsColSources: 'Source references',
  editHint: 'Lists are edited in the brand repository: npm run brand:interview -- --question <id> --entity add|edit|move|remove|list (--sources ref,ref). Studio only shows them.',
  openPrint: 'Open print view',
  openPrintPublic: 'Print public edition',
  backToSwot: 'Back to SWOT / TOWS',
  backToVpc: 'Back to the Value Proposition Canvas',
  printTitle: 'Print view',
  pageSources: 'Sources and framework',
  linkSwot: 'SWOT / TOWS',
  linkVpc: 'Value Proposition Canvas',
  linksTitle: 'Also in Strategy Lab',
}

const FA: StrategyText = {
  swotPageTitle: 'SWOT / TOWS',
  swotTitle: 'تحلیل SWOT',
  swotLead: 'قوت‌ها و ضعف‌های درون کسب‌وکار، فرصت‌ها و تهدیدهای بیرون از آن؛ هر کدام یک مورد جدا با منابع خودش.',
  towsTitle: 'ماتریس TOWS',
  towsLead: 'راهبردهایی که از SWOT نتیجه می‌شوند؛ هر راهبرد در خانهٔ نوع ثبت‌شده‌اش و با پیوند به مواردی که از آن‌ها استفاده می‌کند.',
  vpcTitle: 'بوم ارزش پیشنهادی',
  vpcLead: 'نقشهٔ ارزش در کنار نیم‌رخ مشتری. تناسب فقط جایی نشان داده می‌شود که یک درمان به یک درد یا یک خالق دستاورد به یک دستاورد پیوند خورده باشد.',
  kicker: 'آزمایشگاه راهبرد',
  quadrant: {
    strengths: { title: 'قوت‌ها', prompt: 'درونی · سودمند', empty: 'هنوز قوتی ثبت نشده است' },
    weaknesses: { title: 'ضعف‌ها', prompt: 'درونی · زیان‌آور', empty: 'هنوز ضعفی ثبت نشده است' },
    opportunities: { title: 'فرصت‌ها', prompt: 'بیرونی · سودمند', empty: 'هنوز فرصتی ثبت نشده است' },
    threats: { title: 'تهدیدها', prompt: 'بیرونی · زیان‌آور', empty: 'هنوز تهدیدی ثبت نشده است' },
  },
  axisInternal: 'درونی',
  axisExternal: 'بیرونی',
  axisHelpful: 'سودمند',
  axisHarmful: 'زیان‌آور',
  tows: {
    so: { title: 'راهبردهای SO', lead: 'استفاده از قوت‌ها برای گرفتن فرصت‌ها' },
    st: { title: 'راهبردهای ST', lead: 'استفاده از قوت‌ها برای مقابله با تهدیدها' },
    wo: { title: 'راهبردهای WO', lead: 'رفع ضعف‌ها با کمک فرصت‌ها' },
    wt: { title: 'راهبردهای WT', lead: 'کم کردن ضعف‌ها و دوری از تهدیدها' },
  },
  towsEmptyCell: 'هنوز راهبردی از این نوع نیست',
  towsEmptyTitle: 'هنوز راهبرد TOWS ثبت نشده است',
  towsUnplaced: 'راهبردهای بدون نوع (در هیچ خانه‌ای قرار نگرفته‌اند)',
  uses: 'بر پایهٔ',
  zone: {
    products_services: { title: 'محصولات و خدمات', prompt: 'آنچه ارائه می‌دهید', empty: 'هنوز محصول یا خدمتی ثبت نشده است' },
    gain_creators: { title: 'خالقان دستاورد', prompt: 'پیشنهاد شما چطور دستاورد می‌سازد', empty: 'هنوز خالق دستاوردی ثبت نشده است' },
    pain_relievers: { title: 'درمان‌کننده‌های درد', prompt: 'پیشنهاد شما چطور درد را کم می‌کند', empty: 'هنوز درمانی برای درد ثبت نشده است' },
    customer_jobs: { title: 'کارهای مشتری', prompt: 'مشتری می‌خواهد چه کاری را انجام دهد', empty: 'هنوز کار مشتری ثبت نشده است' },
    gains: { title: 'دستاوردها', prompt: 'نتیجه‌هایی که مشتری می‌خواهد', empty: 'هنوز دستاوردی ثبت نشده است' },
    pains: { title: 'دردها', prompt: 'آنچه مشتری را آزار می‌دهد یا متوقف می‌کند', empty: 'هنوز دردی ثبت نشده است' },
  },
  valueMap: 'نقشهٔ ارزش',
  customerProfile: 'نیم‌رخ مشتری',
  forSegment: 'برای',
  addresses: 'پاسخ به',
  fitTitle: 'تناسب',
  fitLead: 'فقط از پیوندهایی خوانده می‌شود که مالک ثبت کرده است. هیچ چیز از روی واژه‌ها جفت نمی‌شود و امتیازی در کار نیست.',
  painsRelieved: '{done} از {total} درد، درمانِ پیوندخورده دارند',
  gainsCreated: '{done} از {total} دستاورد، خالقِ پیوندخورده دارند',
  fitColPain: 'درد',
  fitColRelievers: 'درمان با',
  fitColGain: 'دستاورد',
  fitColCreators: 'ساخته با',
  fitNoReliever: 'هنوز درمانی پیوند نخورده است',
  fitNoCreator: 'هنوز خالقی پیوند نخورده است',
  fitEmpty: 'تناسب وقتی دیده می‌شود که دردها یا دستاوردها ثبت شوند.',
  emptyBody: 'هیچ چیز به‌جای شما پر نمی‌شود. مالک موارد را فهرست می‌کند و هر مورد می‌تواند منابع خودش را ذکر کند.',
  sourcesTitle: 'منابع',
  sourcesLead: 'به ترتیب خواندن شماره‌گذاری شده‌اند. از منبع فقط نام برده می‌شود، نقل‌قول نمی‌شود؛ پاسخ تأییدشده فقط با عنوانش ذکر می‌شود.',
  sourceKind: { fact: 'پاسخ تأییدشده', knowledge: 'یادداشت دانش', evidence: 'سند شاهد', web: 'صفحهٔ وب' },
  sourceStatus: {
    approved: 'تأییدشده',
    shared: 'یادداشت اشتراکی: یک ایده، نه یک واقعیت',
    verified: 'راستی‌آزمایی‌شده',
    recorded: 'ثبت‌شده، راستی‌آزمایی‌نشده',
    not_available: 'در این نسخه در دسترس نیست',
  },
  sourcesHidden: '{count} منبع داخلی در نسخهٔ عمومی نشان داده نمی‌شود.',
  sourcesNone: 'هنوز هیچ موردی منبعی ذکر نکرده است.',
  sourceMark: 'منابع',
  idsTitle: 'شناسهٔ موارد و منابع',
  idsLead: 'برای ویرایش در مخزن برند. شناسه‌ها با ویرایش یا جابه‌جایی مورد تغییر نمی‌کنند.',
  idsColItem: 'مورد',
  idsColId: 'شناسه',
  idsColSources: 'ارجاع منابع',
  editHint: 'فهرست‌ها در مخزن برند ویرایش می‌شوند: npm run brand:interview -- --question <id> --entity add|edit|move|remove|list (--sources ref,ref). Studio فقط آن‌ها را نشان می‌دهد.',
  openPrint: 'باز کردن نمای چاپ',
  openPrintPublic: 'چاپ نسخهٔ عمومی',
  backToSwot: 'بازگشت به SWOT / TOWS',
  backToVpc: 'بازگشت به بوم ارزش پیشنهادی',
  printTitle: 'نمای چاپ',
  pageSources: 'منابع و چارچوب',
  linkSwot: 'SWOT / TOWS',
  linkVpc: 'بوم ارزش پیشنهادی',
  linksTitle: 'در آزمایشگاه راهبرد',
}

const TR: StrategyText = {
  swotPageTitle: 'SWOT / TOWS',
  swotTitle: 'SWOT analizi',
  swotLead: 'İşletmenin içindeki güçlü ve zayıf yönler, dışındaki fırsatlar ve tehditler; her biri kaynaklarıyla ayrı bir madde.',
  towsTitle: 'TOWS matrisi',
  towsLead: 'SWOT analizinden çıkan stratejiler; her biri kayıtlı türüne göre yerleşir ve kullandığı maddelere bağlanır.',
  vpcTitle: 'Değer Önerisi Kanvası',
  vpcLead: 'Değer haritası, müşteri profilinin yanında. Uyum yalnızca bir giderici bir sıkıntıya ya da bir yaratıcı bir kazanıma bağlandığında gösterilir.',
  kicker: 'Strateji Laboratuvarı',
  quadrant: {
    strengths: { title: 'Güçlü yönler', prompt: 'İç · yararlı', empty: 'Henüz güçlü yön yazılmadı' },
    weaknesses: { title: 'Zayıf yönler', prompt: 'İç · zararlı', empty: 'Henüz zayıf yön yazılmadı' },
    opportunities: { title: 'Fırsatlar', prompt: 'Dış · yararlı', empty: 'Henüz fırsat yazılmadı' },
    threats: { title: 'Tehditler', prompt: 'Dış · zararlı', empty: 'Henüz tehdit yazılmadı' },
  },
  axisInternal: 'İç',
  axisExternal: 'Dış',
  axisHelpful: 'Yararlı',
  axisHarmful: 'Zararlı',
  tows: {
    so: { title: 'SO stratejileri', lead: 'Güçlü yönlerle fırsatları yakala' },
    st: { title: 'ST stratejileri', lead: 'Güçlü yönlerle tehditleri karşıla' },
    wo: { title: 'WO stratejileri', lead: 'Fırsatlarla zayıf yönleri gider' },
    wt: { title: 'WT stratejileri', lead: 'Zayıf yönleri azalt, tehditlerden kaçın' },
  },
  towsEmptyCell: 'Bu türde henüz strateji yok',
  towsEmptyTitle: 'Henüz TOWS stratejisi yazılmadı',
  towsUnplaced: 'Türü olmayan stratejiler (bir hücreye yerleşmedi)',
  uses: 'Dayanak',
  zone: {
    products_services: { title: 'Ürünler ve hizmetler', prompt: 'Ne sunuyorsunuz', empty: 'Henüz ürün veya hizmet yazılmadı' },
    gain_creators: { title: 'Kazanım yaratıcılar', prompt: 'Teklif kazanımı nasıl yaratıyor', empty: 'Henüz kazanım yaratıcı yazılmadı' },
    pain_relievers: { title: 'Sıkıntı gidericiler', prompt: 'Teklif sıkıntıyı nasıl gideriyor', empty: 'Henüz sıkıntı giderici yazılmadı' },
    customer_jobs: { title: 'Müşteri işleri', prompt: 'Müşteri neyi halletmeye çalışıyor', empty: 'Henüz müşteri işi yazılmadı' },
    gains: { title: 'Kazanımlar', prompt: 'Müşterinin istediği sonuçlar', empty: 'Henüz kazanım yazılmadı' },
    pains: { title: 'Sıkıntılar', prompt: 'Müşteriyi rahatsız eden veya durduran şeyler', empty: 'Henüz sıkıntı yazılmadı' },
  },
  valueMap: 'Değer haritası',
  customerProfile: 'Müşteri profili',
  forSegment: 'Kimin için',
  addresses: 'Yanıtladığı',
  fitTitle: 'Uyum',
  fitLead: 'Yalnızca sahibin kaydettiği bağlantılardan okunur. Hiçbir şey kelimelere göre eşleştirilmez ve puan verilmez.',
  painsRelieved: '{total} sıkıntının {done} tanesinin bağlı bir gidericisi var',
  gainsCreated: '{total} kazanımın {done} tanesinin bağlı bir yaratıcısı var',
  fitColPain: 'Sıkıntı',
  fitColRelievers: 'Gideren',
  fitColGain: 'Kazanım',
  fitColCreators: 'Yaratan',
  fitNoReliever: 'Henüz bağlı giderici yok',
  fitNoCreator: 'Henüz bağlı yaratıcı yok',
  fitEmpty: 'Uyum, sıkıntılar veya kazanımlar yazıldığında görünür.',
  emptyBody: 'Sizin yerinize hiçbir şey doldurulmaz. Maddeleri sahibi yazar; her madde kaynaklarını belirtebilir.',
  sourcesTitle: 'Kaynaklar',
  sourcesLead: 'Okuma sırasına göre numaralanır. Kaynak adıyla anılır, alıntılanmaz; onaylı bir yanıt yalnızca etiketiyle anılır.',
  sourceKind: { fact: 'Onaylı yanıt', knowledge: 'Bilgi notu', evidence: 'Kanıt kaydı', web: 'Web sayfası' },
  sourceStatus: {
    approved: 'Onaylı',
    shared: 'Paylaşılan not: bir fikir, olgu değil',
    verified: 'Doğrulandı',
    recorded: 'Kaydedildi, doğrulanmadı',
    not_available: 'Bu sürümde yok',
  },
  sourcesHidden: '{count} iç kaynak herkese açık sürümde gösterilmez.',
  sourcesNone: 'Henüz hiçbir madde kaynak belirtmedi.',
  sourceMark: 'Kaynaklar',
  idsTitle: 'Madde kimlikleri ve kaynaklar',
  idsLead: 'Marka deposunda düzenlemek için. Bir madde düzenlendiğinde veya taşındığında kimliği değişmez.',
  idsColItem: 'Madde',
  idsColId: 'Kimlik',
  idsColSources: 'Kaynak referansları',
  editHint: 'Listeler marka deposunda düzenlenir: npm run brand:interview -- --question <id> --entity add|edit|move|remove|list (--sources ref,ref). Studio yalnızca gösterir.',
  openPrint: 'Baskı görünümünü aç',
  openPrintPublic: 'Herkese açık sürümü yazdır',
  backToSwot: 'SWOT / TOWS sayfasına dön',
  backToVpc: 'Değer Önerisi Kanvasına dön',
  printTitle: 'Baskı görünümü',
  pageSources: 'Kaynaklar ve çerçeve',
  linkSwot: 'SWOT / TOWS',
  linkVpc: 'Değer Önerisi Kanvası',
  linksTitle: 'Strateji Laboratuvarında',
}

export const STRATEGY_TEXT: Record<VisualLang, StrategyText> = { en: EN, fa: FA, tr: TR }

export function strategyText(lang: VisualLang): StrategyText {
  return STRATEGY_TEXT[lang]
}
