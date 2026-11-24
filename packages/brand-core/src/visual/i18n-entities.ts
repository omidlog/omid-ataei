/**
 * en/fa/tr text for list questions on the Business Model Canvas (Visual V3.1, D3). Labels and explanations only:
 * item names and details are brand values and are shown as recorded, never translated. Choice labels (segment
 * priority, resource type, cost behaviour) come from the entity specs (`entities.ts`, `entityOptionLabel`).
 */
export type ListZone = 'key_activities' | 'key_resources' | 'customer_segments' | 'cost_structure'

export interface EntityText {
  /** Designed empty state of a zone whose list has no items. */
  emptyTitle: Record<ListZone, string>
  emptyBody: string
  /** `{count}` items. */
  itemCount: string
  /** Print page 1 shows the first items of a long list; `{count}` more are in the sources table on page 2. */
  moreItems: string
  legacy: string
  legacyHint: string
  linksTitle: string
  linksLead: string
  linksNoneNoItems: string
  linksNoneProse: string
  linksEmpty: string
  linkTo: string
  linkHidden: string
  linksColFrom: string
  linksColTo: string
  linksColState: string
  linkResolved: string
  linkUnresolved: string
  editHint: string
}

export const ENTITY_TEXT: Record<'en' | 'fa' | 'tr', EntityText> = {
  en: {
    emptyTitle: {
      key_activities: 'No key activities listed yet',
      key_resources: 'No key resources listed yet',
      customer_segments: 'No customer segments listed yet',
      cost_structure: 'No cost items listed yet',
    },
    emptyBody: 'Each item is added in the interview. Nothing is filled in from other answers.',
    itemCount: '{count} items',
    moreItems: '+{count} more, listed under sources',
    legacy: 'Earlier free text, kept as written',
    legacyHint: 'Not yet a list of items. A conversion is proposed for the owner to review.',
    linksTitle: 'Links between zones',
    linksLead: 'Links the owner recorded on list items: which activities serve which segments, which resources they use, what drives each cost. Offers, channels and revenue streams are still single answers, so they are never linked.',
    linksNoneNoItems: 'No list items are recorded yet, so no links are drawn. Links come only from items the owner records.',
    linksNoneProse: 'Segments, offers, channels and revenue streams are single prose answers here, so no link between them is drawn.',
    linksEmpty: 'The recorded items have no links yet.',
    linkTo: 'Linked to',
    linkHidden: 'an item not shown in this edition',
    linksColFrom: 'From',
    linksColTo: 'To',
    linksColState: 'State',
    linkResolved: 'Shown',
    linkUnresolved: 'Not shown in this edition',
    editHint: 'Items are added, edited, reordered and removed in the brand repository through the interview; changes to an approved list need approval.',
  },
  fa: {
    emptyTitle: {
      key_activities: 'هنوز فعالیت کلیدی‌ای فهرست نشده است',
      key_resources: 'هنوز منبع کلیدی‌ای فهرست نشده است',
      customer_segments: 'هنوز بخش مشتری‌ای فهرست نشده است',
      cost_structure: 'هنوز قلم هزینه‌ای فهرست نشده است',
    },
    emptyBody: 'هر مورد در مصاحبه افزوده می‌شود. هیچ چیز از پاسخ‌های دیگر پر نمی‌شود.',
    itemCount: '{count} مورد',
    moreItems: '+{count} مورد دیگر، در فهرست منابع',
    legacy: 'متن آزاد پیشین، همان‌طور که نوشته شده',
    legacyHint: 'هنوز فهرستی از موارد نیست. تبدیل آن برای بازبینی مالک پیشنهاد می‌شود.',
    linksTitle: 'پیوند میان بخش‌ها',
    linksLead: 'پیوندهایی که مالک روی موارد فهرست ثبت کرده است: کدام فعالیت به کدام بخش مشتری خدمت می‌کند، از کدام منابع استفاده می‌کند و هر هزینه از کجا می‌آید. پیشنهادها، کانال‌ها و جریان‌های درآمد هنوز یک پاسخ متنی‌اند و پیوند داده نمی‌شوند.',
    linksNoneNoItems: 'هنوز هیچ موردی در فهرست‌ها ثبت نشده، پس هیچ پیوندی رسم نمی‌شود. پیوندها فقط از مواردی می‌آیند که مالک ثبت می‌کند.',
    linksNoneProse: 'بخش‌های مشتری، پیشنهادها، کانال‌ها و جریان‌های درآمد اینجا هر کدام یک پاسخ متنی‌اند؛ بنابراین هیچ پیوندی میانشان رسم نمی‌شود.',
    linksEmpty: 'موارد ثبت‌شده هنوز پیوندی ندارند.',
    linkTo: 'پیوند به',
    linkHidden: 'موردی که در این نسخه نشان داده نمی‌شود',
    linksColFrom: 'از',
    linksColTo: 'به',
    linksColState: 'وضعیت',
    linkResolved: 'نمایش داده شده',
    linkUnresolved: 'در این نسخه نشان داده نمی‌شود',
    editHint: 'موارد در مخزن برند و از طریق مصاحبه افزوده، ویرایش، جابه‌جا و حذف می‌شوند؛ تغییر در فهرست تأییدشده به تأیید نیاز دارد.',
  },
  tr: {
    emptyTitle: {
      key_activities: 'Henüz anahtar faaliyet listelenmedi',
      key_resources: 'Henüz anahtar kaynak listelenmedi',
      customer_segments: 'Henüz müşteri segmenti listelenmedi',
      cost_structure: 'Henüz maliyet kalemi listelenmedi',
    },
    emptyBody: 'Her öğe görüşmede eklenir. Diğer yanıtlardan hiçbir şey doldurulmaz.',
    itemCount: '{count} öğe',
    moreItems: '+{count} öğe daha, kaynaklarda listelenmiştir',
    legacy: 'Önceki serbest metin, yazıldığı gibi',
    legacyHint: 'Henüz bir öğe listesi değil. Sahibin incelemesi için bir dönüştürme önerilir.',
    linksTitle: 'Alanlar arası bağlantılar',
    linksLead: 'Sahibin liste öğelerine kaydettiği bağlantılar: hangi faaliyet hangi segmente hizmet ediyor, hangi kaynakları kullanıyor, her maliyeti ne belirliyor. Teklifler, kanallar ve gelir akışları hâlâ tek yanıttır; bu yüzden bağlanmaz.',
    linksNoneNoItems: 'Henüz liste öğesi kaydedilmedi, bu yüzden bağlantı çizilmez. Bağlantılar yalnızca sahibin kaydettiği öğelerden gelir.',
    linksNoneProse: 'Segmentler, teklifler, kanallar ve gelir akışları burada tek metin yanıtlarıdır; bu yüzden aralarında bağlantı çizilmez.',
    linksEmpty: 'Kaydedilen öğelerin henüz bağlantısı yok.',
    linkTo: 'Bağlantı',
    linkHidden: 'bu sürümde gösterilmeyen bir öğe',
    linksColFrom: 'Kaynak',
    linksColTo: 'Hedef',
    linksColState: 'Durum',
    linkResolved: 'Gösteriliyor',
    linkUnresolved: 'Bu sürümde gösterilmiyor',
    editHint: 'Öğeler marka deposunda görüşme üzerinden eklenir, düzenlenir, sıralanır ve kaldırılır; onaylı bir listedeki değişiklik onay gerektirir.',
  },
}
