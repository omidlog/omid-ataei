import type { VisualLang } from './i18n.js'
import type { JourneyEmotion, JourneyLane, KrMeasure, SostacStage } from './model-plan.js'

/**
 * en/fa/tr text for the Visual V3.3 pages: customer journey swimlane, SOSTAC overview and OKR tree. Labels and
 * explanations only: stage names, lane text, objectives, key results, units and sources are shown as recorded and
 * never translated. Framework names stay standard (owner decision): Customer Journey Map, SOSTAC®, OKR.
 */
export interface PlanText {
  common: {
    openPrint: string
    openPrintPublic: string
    printTitle: string
    printHint: string
    sourcesTitle: string
    sourcesLead: string
    /** Column heads of the sources table. */
    colAnswer: string
    colState: string
    colVersion: string
    colApproved: string
    idsTitle: string
    idsLead: string
    nextTitle: string
    nextLead: string
    relatedTitle: string
    pageMain: string
    pageSources: string
    /** `{page}` of `{pages}`. */
    folio: string
    legacyTitle: string
    legacyBody: string
    notInBank: string
    emptyStepsTitle: string
    /** `{count}` items. */
    countItems: string
    linkHidden: string
    noValue: string
  }
  journey: {
    kicker: string
    title: string
    lead: string
    back: string
    stagesLabel: string
    lanesLabel: string
    /** `{n}`. */
    stageNum: string
    goal: string
    evidence: string
    forSegments: string
    lane: Record<JourneyLane, string>
    laneHint: Record<JourneyLane, string>
    emotion: Record<JourneyEmotion, string>
    emotionNone: string
    curveLabel: string
    hypothesisTitle: string
    emptyTitle: string
    emptyBody: string
    emptySteps: string[]
    emptyPublic: string
  }
  sostac: {
    kicker: string
    title: string
    lead: string
    back: string
    stage: Record<SostacStage, { title: string; prompt: string }>
    flowLabel: string
    stageEmpty: string
    toOkr: string
    toJourney: string
    emptyPublic: string
  }
  okr: {
    kicker: string
    title: string
    lead: string
    back: string
    treeLabel: string
    root: string
    rootMissing: string
    objective: string
    keyResult: string
    period: string
    target: string
    current: string
    baseline: string
    source: string
    measuredOn: string
    measure: Record<KrMeasure, string>
    /** `{pct}` of the way from baseline to target. */
    progress: string
    exceeded: string
    behind: string
    noKeyResults: string
    unlinkedTitle: string
    unlinkedLead: string
    objectiveHidden: string
    noObjective: string
    emptyTitle: string
    emptyBody: string
    emptySteps: string[]
    emptyPublic: string
    /** `{objectives}` objectives, `{results}` key results. */
    counts: string
    planNote: string
  }
  /** Plain labels of the answers these pages cite, by question id (the id itself stays in the details). */
  labels: Record<string, string>
}

const EN: PlanText = {
  common: {
    openPrint: 'Print view',
    openPrintPublic: 'Public print view',
    printTitle: 'Print view',
    printHint: 'A3 landscape. Use the browser’s Print command and choose “Save as PDF”.',
    sourcesTitle: 'Sources',
    sourcesLead: 'Every answer this page is drawn from, with its state, version and approval date.',
    colAnswer: 'Answer',
    colState: 'State',
    colVersion: 'Version',
    colApproved: 'Approved',
    idsTitle: 'Question and item ids',
    idsLead: 'For the interview command and for agents. Ids never appear in the main view.',
    nextTitle: 'Next questions',
    nextLead: 'What the owner can answer or approve next to complete this page.',
    relatedTitle: 'Related answers',
    pageMain: 'Overview',
    pageSources: 'Sources and method',
    folio: 'Page {page} of {pages}',
    legacyTitle: 'Written as free text',
    legacyBody: 'This answer is text, not a list of items, so it is shown as written. Re-enter it as a list in the interview to draw it.',
    notInBank: 'This question is not in this brand’s question bank yet (older template). A template update adds it.',
    emptyStepsTitle: 'How to fill this page',
    countItems: '{count} items',
    linkHidden: 'an item not shown in this edition',
    noValue: '—',
  },
  journey: {
    kicker: 'Market · Customer journey',
    title: 'Customer Journey Map',
    lead: 'The recorded stages of the customer journey, read across five lanes: touchpoints, customer actions, emotion, pain points and opportunities.',
    back: 'Back to the journey map',
    stagesLabel: 'Journey stages',
    lanesLabel: 'Lanes',
    stageNum: 'Stage {n}',
    goal: 'Customer goal',
    evidence: 'Evidence',
    forSegments: 'For',
    lane: { touchpoints: 'Touchpoints', actions: 'Customer actions', emotion: 'Emotion', pains: 'Pain points', opportunities: 'Opportunities' },
    laneHint: {
      touchpoints: 'Where the customer meets the brand',
      actions: 'What the customer does',
      emotion: 'How the customer feels',
      pains: 'What gets in the way',
      opportunities: 'What the brand could improve',
    },
    emotion: { very_positive: 'Delighted', positive: 'Positive', neutral: 'Neutral', negative: 'Negative', very_negative: 'Frustrated' },
    emotionNone: 'Not recorded',
    curveLabel: 'Emotion curve across the stages',
    hypothesisTitle: 'Journey hypothesis',
    emptyTitle: 'No journey stages recorded yet',
    emptyBody: 'The map is drawn from the owner’s list of journey stages. Nothing is guessed from the funnel hypothesis.',
    emptySteps: [
      'Run the interview for “Customer journey stages” and add the stages in order.',
      'For each stage, record touchpoints, what the customer does, how they feel, pains and opportunities.',
      'Approve the list; the map updates on the next sync.',
    ],
    emptyPublic: 'No approved, published journey stages yet.',
  },
  sostac: {
    kicker: 'Strategy · Marketing plan',
    title: 'SOSTAC® overview',
    lead: 'The marketing plan read in the six SOSTAC® stages, from where the business is now to how progress is checked.',
    back: 'Back to the SOSTAC® overview',
    stage: {
      situation: { title: 'Situation', prompt: 'Where are we now?' },
      objectives: { title: 'Objectives', prompt: 'Where do we want to be?' },
      strategy: { title: 'Strategy', prompt: 'How do we get there?' },
      tactics: { title: 'Tactics', prompt: 'Which channels and tools?' },
      action: { title: 'Action', prompt: 'Who does what, and when?' },
      control: { title: 'Control', prompt: 'How do we measure and review?' },
    },
    flowLabel: 'The six SOSTAC® stages in order',
    stageEmpty: 'No answer speaks to this stage yet.',
    toOkr: 'Objectives and key results are drawn as a tree on the OKR page.',
    toJourney: 'Customer journey stages are drawn on the journey map.',
    emptyPublic: 'Nothing approved and published for this stage yet.',
  },
  okr: {
    kicker: 'Strategy · Goals',
    title: 'OKR tree',
    lead: 'Objectives with their measurable key results. Every key result has a target, a unit and the system that measures it.',
    back: 'Back to the OKR tree',
    treeLabel: 'Objectives and key results',
    root: 'Annual objective',
    rootMissing: 'No annual objective recorded',
    objective: 'Objective',
    keyResult: 'Key result',
    period: 'Period',
    target: 'Target',
    current: 'Current',
    baseline: 'Baseline',
    source: 'Measured in',
    measuredOn: 'Measured on',
    measure: { measured: 'Measured', no_baseline: 'No baseline', not_measured: 'Not measured yet' },
    progress: '{pct} of the way from baseline to target',
    exceeded: 'Target reached',
    behind: 'Below the baseline',
    noKeyResults: 'No key result recorded for this objective yet.',
    unlinkedTitle: 'Key results without a visible objective',
    unlinkedLead: 'They link to no objective, or to one not shown in this edition. They are listed here, never moved under another objective.',
    objectiveHidden: 'Objective not shown in this edition',
    noObjective: 'No objective linked',
    emptyTitle: 'No objectives or key results recorded yet',
    emptyBody: 'The tree is drawn from the owner’s objectives and structured key results. A key result needs a target, a unit and a source; nothing is estimated.',
    emptySteps: [
      'Add the objectives for the period (“Objectives (OKR)”).',
      'Add key results with a target, a unit and the system that measures them, each linked to one objective.',
      'Record the current value and a baseline when you have them; progress is drawn only from a baseline.',
    ],
    emptyPublic: 'No approved, published objectives yet.',
    counts: '{objectives} objectives · {results} key results',
    planNote: 'Targets are plans, not results. Current values are as recorded on the date shown.',
  },
  labels: {
    'business.marketing.journey_stages': 'Customer journey stages',
    'business.marketing.journey': 'Journey hypothesis',
    'business.model.segments': 'Customer segments',
    'business.goals.objectives': 'Objectives',
    'business.goals.key_results': 'Key results',
    'business.goals.annual': 'Annual objective',
    'business.stage.current': 'Business stage',
    'business.customer.primary_segment': 'Primary customer',
    'business.problem.pains': 'Customer pains',
    'business.market.geography': 'Markets',
    'business.marketing.objective': 'Marketing objective',
    'business.offer.value_proposition': 'Value proposition',
    'brand.strategy.differentiation': 'Differentiation',
    'business.marketing.pillars': 'Content pillars',
    'business.marketing.channels': 'Channels',
    'business.marketing.paid_media': 'Paid media',
    'business.sales.motion': 'Sales motion',
    'business.plan.milestone': 'Next milestone',
    'business.ops.tracker': 'Task tracker',
    'business.ops.roles': 'Roles',
    'business.goals.sources': 'Metric sources',
    'business.marketing.attribution': 'Attribution',
    'business.goals.cadence': 'Review cadence',
  },
}

const FA: PlanText = {
  common: {
    openPrint: 'نمای چاپ',
    openPrintPublic: 'نمای چاپ عمومی',
    printTitle: 'نمای چاپ',
    printHint: 'A3 افقی. از فرمان «چاپ» مرورگر استفاده کنید و «ذخیره به‌صورت PDF» را انتخاب کنید.',
    sourcesTitle: 'منابع',
    sourcesLead: 'همهٔ پاسخ‌هایی که این صفحه از آن‌ها ساخته شده، با وضعیت، نسخه و تاریخ تأیید.',
    colAnswer: 'پاسخ',
    colState: 'وضعیت',
    colVersion: 'نسخه',
    colApproved: 'تأیید',
    idsTitle: 'شناسهٔ پرسش‌ها و موارد',
    idsLead: 'برای فرمان مصاحبه و برای عامل‌ها. شناسه‌ها هرگز در نمای اصلی دیده نمی‌شوند.',
    nextTitle: 'پرسش‌های بعدی',
    nextLead: 'آنچه مالک می‌تواند برای کامل شدن این صفحه پاسخ دهد یا تأیید کند.',
    relatedTitle: 'پاسخ‌های مرتبط',
    pageMain: 'نمای کلی',
    pageSources: 'منابع و روش',
    folio: 'صفحهٔ {page} از {pages}',
    legacyTitle: 'به‌صورت متن آزاد نوشته شده',
    legacyBody: 'این پاسخ متن است، نه فهرستی از موارد، پس همان‌طور که نوشته شده نمایش داده می‌شود. برای رسم آن، در مصاحبه دوباره آن را به‌صورت فهرست وارد کنید.',
    notInBank: 'این پرسش هنوز در بانک پرسش این برند نیست (قالب قدیمی‌تر). به‌روزرسانی قالب آن را اضافه می‌کند.',
    emptyStepsTitle: 'چگونه این صفحه را کامل کنید',
    countItems: '{count} مورد',
    linkHidden: 'موردی که در این نسخه نمایش داده نمی‌شود',
    noValue: '—',
  },
  journey: {
    kicker: 'بازار · سفر مشتری',
    title: 'نقشهٔ سفر مشتری',
    lead: 'مرحله‌های ثبت‌شدهٔ سفر مشتری، در پنج ردیف: نقاط تماس، اقدام‌های مشتری، احساس، نقاط درد و فرصت‌ها.',
    back: 'بازگشت به نقشهٔ سفر مشتری',
    stagesLabel: 'مرحله‌های سفر',
    lanesLabel: 'ردیف‌ها',
    stageNum: 'مرحلهٔ {n}',
    goal: 'هدف مشتری',
    evidence: 'شواهد',
    forSegments: 'برای',
    lane: { touchpoints: 'نقاط تماس', actions: 'اقدام‌های مشتری', emotion: 'احساس', pains: 'نقاط درد', opportunities: 'فرصت‌ها' },
    laneHint: {
      touchpoints: 'جایی که مشتری با برند روبه‌رو می‌شود',
      actions: 'کاری که مشتری انجام می‌دهد',
      emotion: 'حسی که مشتری دارد',
      pains: 'آنچه مانع می‌شود',
      opportunities: 'آنچه برند می‌تواند بهتر کند',
    },
    emotion: { very_positive: 'بسیار راضی', positive: 'مثبت', neutral: 'خنثی', negative: 'منفی', very_negative: 'بسیار ناراضی' },
    emotionNone: 'ثبت نشده',
    curveLabel: 'منحنی احساس در طول مرحله‌ها',
    hypothesisTitle: 'فرضیهٔ سفر مشتری',
    emptyTitle: 'هنوز هیچ مرحله‌ای از سفر مشتری ثبت نشده',
    emptyBody: 'نقشه از فهرست مرحله‌های سفر که مالک ثبت کرده ساخته می‌شود. هیچ چیز از فرضیهٔ قیف حدس زده نمی‌شود.',
    emptySteps: [
      'مصاحبه را برای «مرحله‌های سفر مشتری» اجرا کنید و مرحله‌ها را به ترتیب اضافه کنید.',
      'برای هر مرحله نقاط تماس، کار مشتری، احساس او، دردها و فرصت‌ها را ثبت کنید.',
      'فهرست را تأیید کنید؛ نقشه در همگام‌سازی بعدی به‌روز می‌شود.',
    ],
    emptyPublic: 'هنوز هیچ مرحلهٔ تأییدشده و منتشرشده‌ای وجود ندارد.',
  },
  sostac: {
    kicker: 'راهبرد · برنامهٔ بازاریابی',
    title: 'نمای کلی SOSTAC®',
    lead: 'برنامهٔ بازاریابی در شش مرحلهٔ SOSTAC®، از وضعیت فعلی کسب‌وکار تا شیوهٔ سنجش پیشرفت.',
    back: 'بازگشت به نمای کلی SOSTAC®',
    stage: {
      situation: { title: 'وضعیت', prompt: 'اکنون کجا هستیم؟' },
      objectives: { title: 'اهداف', prompt: 'می‌خواهیم به کجا برسیم؟' },
      strategy: { title: 'راهبرد', prompt: 'چگونه به آنجا می‌رسیم؟' },
      tactics: { title: 'تاکتیک‌ها', prompt: 'با کدام کانال‌ها و ابزارها؟' },
      action: { title: 'اقدام', prompt: 'چه کسی، چه کاری، چه زمانی؟' },
      control: { title: 'کنترل', prompt: 'چگونه می‌سنجیم و مرور می‌کنیم؟' },
    },
    flowLabel: 'شش مرحلهٔ SOSTAC® به ترتیب',
    stageEmpty: 'هنوز هیچ پاسخی به این مرحله مربوط نیست.',
    toOkr: 'اهداف و نتیجه‌های کلیدی در صفحهٔ OKR به‌صورت درخت رسم شده‌اند.',
    toJourney: 'مرحله‌های سفر مشتری روی نقشهٔ سفر رسم شده‌اند.',
    emptyPublic: 'هنوز چیزی برای این مرحله تأیید و منتشر نشده است.',
  },
  okr: {
    kicker: 'راهبرد · اهداف',
    title: 'درخت OKR',
    lead: 'هدف‌ها با نتیجه‌های کلیدی قابل‌اندازه‌گیری‌شان. هر نتیجهٔ کلیدی یک عدد هدف، یک واحد و سامانهٔ اندازه‌گیری دارد.',
    back: 'بازگشت به درخت OKR',
    treeLabel: 'هدف‌ها و نتیجه‌های کلیدی',
    root: 'هدف سالانه',
    rootMissing: 'هدف سالانه‌ای ثبت نشده',
    objective: 'هدف',
    keyResult: 'نتیجهٔ کلیدی',
    period: 'دوره',
    target: 'هدف عددی',
    current: 'مقدار فعلی',
    baseline: 'مقدار پایه',
    source: 'منبع اندازه‌گیری',
    measuredOn: 'تاریخ اندازه‌گیری',
    measure: { measured: 'اندازه‌گیری‌شده', no_baseline: 'بدون مقدار پایه', not_measured: 'هنوز اندازه‌گیری نشده' },
    progress: '{pct} از مسیر مقدار پایه تا هدف',
    exceeded: 'هدف محقق شد',
    behind: 'پایین‌تر از مقدار پایه',
    noKeyResults: 'هنوز نتیجهٔ کلیدی برای این هدف ثبت نشده.',
    unlinkedTitle: 'نتیجه‌های کلیدی بدون هدفِ قابل‌نمایش',
    unlinkedLead: 'به هیچ هدفی پیوند ندارند، یا به هدفی که در این نسخه نمایش داده نمی‌شود. این‌جا فهرست شده‌اند و هرگز زیر هدف دیگری جابه‌جا نمی‌شوند.',
    objectiveHidden: 'هدفی که در این نسخه نمایش داده نمی‌شود',
    noObjective: 'به هیچ هدفی پیوند ندارد',
    emptyTitle: 'هنوز هیچ هدف یا نتیجهٔ کلیدی ثبت نشده',
    emptyBody: 'درخت از هدف‌ها و نتیجه‌های کلیدی ساخت‌یافتهٔ مالک ساخته می‌شود. هر نتیجهٔ کلیدی یک هدف عددی، یک واحد و یک منبع لازم دارد؛ هیچ چیز تخمین زده نمی‌شود.',
    emptySteps: [
      'هدف‌های این دوره را اضافه کنید («هدف‌ها (OKR)»).',
      'نتیجه‌های کلیدی را با هدف عددی، واحد و سامانهٔ اندازه‌گیری اضافه کنید و هر کدام را به یک هدف پیوند دهید.',
      'مقدار فعلی و مقدار پایه را اگر دارید ثبت کنید؛ پیشرفت فقط از مقدار پایه رسم می‌شود.',
    ],
    emptyPublic: 'هنوز هیچ هدف تأییدشده و منتشرشده‌ای وجود ندارد.',
    counts: '{objectives} هدف · {results} نتیجهٔ کلیدی',
    planNote: 'هدف‌های عددی برنامه‌اند، نه نتیجه. مقدارهای فعلی همان‌اند که در تاریخ نشان‌داده‌شده ثبت شده‌اند.',
  },
  labels: {
    'business.marketing.journey_stages': 'مرحله‌های سفر مشتری',
    'business.marketing.journey': 'فرضیهٔ سفر مشتری',
    'business.model.segments': 'بخش‌های مشتری',
    'business.goals.objectives': 'هدف‌ها',
    'business.goals.key_results': 'نتیجه‌های کلیدی',
    'business.goals.annual': 'هدف سالانه',
    'business.stage.current': 'مرحلهٔ کسب‌وکار',
    'business.customer.primary_segment': 'مشتری اصلی',
    'business.problem.pains': 'دردهای مشتری',
    'business.market.geography': 'بازارها',
    'business.marketing.objective': 'هدف بازاریابی',
    'business.offer.value_proposition': 'ارزش پیشنهادی',
    'brand.strategy.differentiation': 'تمایز',
    'business.marketing.pillars': 'ستون‌های محتوا',
    'business.marketing.channels': 'کانال‌ها',
    'business.marketing.paid_media': 'تبلیغات پولی',
    'business.sales.motion': 'شیوهٔ فروش',
    'business.plan.milestone': 'گام مهم بعدی',
    'business.ops.tracker': 'ابزار پیگیری کارها',
    'business.ops.roles': 'نقش‌ها',
    'business.goals.sources': 'منابع سنجه',
    'business.marketing.attribution': 'نسبت‌دهی',
    'business.goals.cadence': 'دورهٔ بازبینی',
  },
}

const TR: PlanText = {
  common: {
    openPrint: 'Baskı görünümü',
    openPrintPublic: 'Herkese açık baskı görünümü',
    printTitle: 'Baskı görünümü',
    printHint: 'A3 yatay. Tarayıcının Yazdır komutunu kullanın ve “PDF olarak kaydet”i seçin.',
    sourcesTitle: 'Kaynaklar',
    sourcesLead: 'Bu sayfanın dayandığı her yanıt; durumu, sürümü ve onay tarihiyle.',
    colAnswer: 'Yanıt',
    colState: 'Durum',
    colVersion: 'Sürüm',
    colApproved: 'Onay',
    idsTitle: 'Soru ve öğe kimlikleri',
    idsLead: 'Görüşme komutu ve ajanlar için. Kimlikler ana görünümde hiç yer almaz.',
    nextTitle: 'Sıradaki sorular',
    nextLead: 'Bu sayfayı tamamlamak için sahibin yanıtlayabileceği veya onaylayabileceği şeyler.',
    relatedTitle: 'İlgili yanıtlar',
    pageMain: 'Genel bakış',
    pageSources: 'Kaynaklar ve yöntem',
    folio: 'Sayfa {page} / {pages}',
    legacyTitle: 'Serbest metin olarak yazılmış',
    legacyBody: 'Bu yanıt bir öğe listesi değil, metin; bu yüzden yazıldığı gibi gösteriliyor. Çizilmesi için görüşmede liste olarak yeniden girin.',
    notInBank: 'Bu soru bu markanın soru bankasında henüz yok (eski şablon). Bir şablon güncellemesi onu ekler.',
    emptyStepsTitle: 'Bu sayfa nasıl doldurulur',
    countItems: '{count} öğe',
    linkHidden: 'bu sürümde gösterilmeyen bir öğe',
    noValue: '—',
  },
  journey: {
    kicker: 'Pazar · Müşteri yolculuğu',
    title: 'Müşteri Yolculuğu Haritası',
    lead: 'Müşteri yolculuğunun kayıtlı aşamaları, beş şeritte: temas noktaları, müşteri eylemleri, duygu, sorun noktaları ve fırsatlar.',
    back: 'Yolculuk haritasına dön',
    stagesLabel: 'Yolculuk aşamaları',
    lanesLabel: 'Şeritler',
    stageNum: 'Aşama {n}',
    goal: 'Müşteri hedefi',
    evidence: 'Kanıt',
    forSegments: 'Kimin için',
    lane: { touchpoints: 'Temas noktaları', actions: 'Müşteri eylemleri', emotion: 'Duygu', pains: 'Sorun noktaları', opportunities: 'Fırsatlar' },
    laneHint: {
      touchpoints: 'Müşterinin markayla karşılaştığı yer',
      actions: 'Müşterinin yaptığı',
      emotion: 'Müşterinin hissettiği',
      pains: 'Önüne çıkan engeller',
      opportunities: 'Markanın iyileştirebileceği',
    },
    emotion: { very_positive: 'Çok memnun', positive: 'Olumlu', neutral: 'Nötr', negative: 'Olumsuz', very_negative: 'Çok rahatsız' },
    emotionNone: 'Kaydedilmedi',
    curveLabel: 'Aşamalar boyunca duygu eğrisi',
    hypothesisTitle: 'Yolculuk hipotezi',
    emptyTitle: 'Henüz kayıtlı yolculuk aşaması yok',
    emptyBody: 'Harita, sahibin yolculuk aşamaları listesinden çizilir. Huni hipotezinden hiçbir şey tahmin edilmez.',
    emptySteps: [
      '“Müşteri yolculuğu aşamaları” için görüşmeyi çalıştırın ve aşamaları sırayla ekleyin.',
      'Her aşama için temas noktalarını, müşterinin yaptıklarını, hissini, sorunları ve fırsatları kaydedin.',
      'Listeyi onaylayın; harita bir sonraki eşitlemede güncellenir.',
    ],
    emptyPublic: 'Henüz onaylı ve yayımlanmış yolculuk aşaması yok.',
  },
  sostac: {
    kicker: 'Strateji · Pazarlama planı',
    title: 'SOSTAC® genel bakışı',
    lead: 'Pazarlama planı altı SOSTAC® aşamasında: işletmenin bugünkü durumundan ilerlemenin nasıl ölçüldüğüne kadar.',
    back: 'SOSTAC® genel bakışına dön',
    stage: {
      situation: { title: 'Durum', prompt: 'Şu an neredeyiz?' },
      objectives: { title: 'Hedefler', prompt: 'Nereye varmak istiyoruz?' },
      strategy: { title: 'Strateji', prompt: 'Oraya nasıl varırız?' },
      tactics: { title: 'Taktikler', prompt: 'Hangi kanallar ve araçlar?' },
      action: { title: 'Eylem', prompt: 'Kim, neyi, ne zaman yapıyor?' },
      control: { title: 'Kontrol', prompt: 'Nasıl ölçüp gözden geçiriyoruz?' },
    },
    flowLabel: 'Sırasıyla altı SOSTAC® aşaması',
    stageEmpty: 'Bu aşamaya henüz hiçbir yanıt değinmiyor.',
    toOkr: 'Amaçlar ve anahtar sonuçlar OKR sayfasında ağaç olarak çizilir.',
    toJourney: 'Müşteri yolculuğu aşamaları yolculuk haritasında çizilir.',
    emptyPublic: 'Bu aşama için henüz onaylı ve yayımlanmış bir şey yok.',
  },
  okr: {
    kicker: 'Strateji · Amaçlar',
    title: 'OKR ağacı',
    lead: 'Amaçlar ve ölçülebilir anahtar sonuçları. Her anahtar sonucun bir hedefi, bir birimi ve onu ölçen bir sistemi var.',
    back: 'OKR ağacına dön',
    treeLabel: 'Amaçlar ve anahtar sonuçlar',
    root: 'Yıllık amaç',
    rootMissing: 'Kayıtlı yıllık amaç yok',
    objective: 'Amaç',
    keyResult: 'Anahtar sonuç',
    period: 'Dönem',
    target: 'Hedef',
    current: 'Güncel',
    baseline: 'Başlangıç',
    source: 'Ölçüldüğü yer',
    measuredOn: 'Ölçüm tarihi',
    measure: { measured: 'Ölçüldü', no_baseline: 'Başlangıç değeri yok', not_measured: 'Henüz ölçülmedi' },
    progress: 'Başlangıçtan hedefe yolun {pct} kadarı',
    exceeded: 'Hedefe ulaşıldı',
    behind: 'Başlangıç değerinin altında',
    noKeyResults: 'Bu amaç için henüz anahtar sonuç kaydedilmedi.',
    unlinkedTitle: 'Görünür bir amacı olmayan anahtar sonuçlar',
    unlinkedLead: 'Hiçbir amaca ya da bu sürümde gösterilmeyen bir amaca bağlılar. Burada listelenirler; asla başka bir amacın altına taşınmazlar.',
    objectiveHidden: 'Bu sürümde gösterilmeyen amaç',
    noObjective: 'Bağlı amaç yok',
    emptyTitle: 'Henüz kayıtlı amaç veya anahtar sonuç yok',
    emptyBody: 'Ağaç, sahibin amaçlarından ve yapılandırılmış anahtar sonuçlarından çizilir. Her anahtar sonuç bir hedef, bir birim ve bir kaynak ister; hiçbir şey tahmin edilmez.',
    emptySteps: [
      'Dönemin amaçlarını ekleyin (“Amaçlar (OKR)”).',
      'Anahtar sonuçları hedef, birim ve onları ölçen sistemle ekleyin; her birini bir amaca bağlayın.',
      'Varsa güncel değeri ve başlangıç değerini kaydedin; ilerleme yalnızca başlangıç değerinden çizilir.',
    ],
    emptyPublic: 'Henüz onaylı ve yayımlanmış amaç yok.',
    counts: '{objectives} amaç · {results} anahtar sonuç',
    planNote: 'Hedefler plandır, sonuç değildir. Güncel değerler gösterilen tarihte kaydedildiği gibidir.',
  },
  labels: {
    'business.marketing.journey_stages': 'Müşteri yolculuğu aşamaları',
    'business.marketing.journey': 'Yolculuk hipotezi',
    'business.model.segments': 'Müşteri segmentleri',
    'business.goals.objectives': 'Amaçlar',
    'business.goals.key_results': 'Anahtar sonuçlar',
    'business.goals.annual': 'Yıllık amaç',
    'business.stage.current': 'İşletme aşaması',
    'business.customer.primary_segment': 'Birincil müşteri',
    'business.problem.pains': 'Müşteri sorunları',
    'business.market.geography': 'Pazarlar',
    'business.marketing.objective': 'Pazarlama amacı',
    'business.offer.value_proposition': 'Değer önerisi',
    'brand.strategy.differentiation': 'Farklılaşma',
    'business.marketing.pillars': 'İçerik sütunları',
    'business.marketing.channels': 'Kanallar',
    'business.marketing.paid_media': 'Ücretli medya',
    'business.sales.motion': 'Satış modeli',
    'business.plan.milestone': 'Sonraki kilometre taşı',
    'business.ops.tracker': 'İş takip aracı',
    'business.ops.roles': 'Roller',
    'business.goals.sources': 'Metrik kaynakları',
    'business.marketing.attribution': 'İlişkilendirme',
    'business.goals.cadence': 'Gözden geçirme sıklığı',
  },
}

export const PLAN_TEXT: Record<VisualLang, PlanText> = { en: EN, fa: FA, tr: TR }

export function planText(lang: VisualLang): PlanText {
  return PLAN_TEXT[lang]
}

/** The localized plain label of an answer; the recorded English label when this catalog has none. */
export function planLabel(lang: VisualLang, id: string, fallback: string): string {
  return PLAN_TEXT[lang].labels[id] ?? fallback
}
