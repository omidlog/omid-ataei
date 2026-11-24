import type { EntityFieldSpec, EntitySpec } from './entities.js'
import type { LocalizedPrompt } from './types.js'

/**
 * Visual V3.3 list questions (owner decision D3, on the V3.1 `repeating_entity` model): the customer journey stages
 * and structured OKRs. Kept in their own file so parallel slices only append one spread to `ENTITY_SPECS`.
 *
 * - `business.marketing.journey_stages`: one item per journey stage, in the owner's order. The lanes of the
 *   swimlane are the standard customer journey map rows: touchpoints, customer actions, emotion, pains and
 *   opportunities. `evidence` says where the stage description comes from (interviews, support tickets …).
 * - `business.goals.objectives`: qualitative objectives, with an optional period.
 * - `business.goals.key_results`: measurable key results only. A target, a unit and a source system are required,
 *   so there is no free-text-only key result. `current` may be missing (not measured yet; never filled in) and
 *   progress is drawn only when a baseline is recorded. A key result links to one objective. Money targets are
 *   refused: amounts stay in the restricted finance answers.
 */

const NAME: EntityFieldSpec = { key: 'name', kind: 'text', required: true, max: 120, label: { en: 'Name', fa: 'نام', tr: 'Ad' } }

function text(key: string, max: number, label: LocalizedPrompt, required = false): EntityFieldSpec {
  return { key, kind: 'text', required, max, label }
}

function measure(key: string, kind: 'number' | 'date', label: LocalizedPrompt, required = false): EntityFieldSpec {
  return { key, kind, required, max: 0, label }
}

/**
 * Currency codes, names and symbols (any script): a key result in money is a finance figure, which stays restricted.
 * The Turkish spellings (`dolar`, `avro`, `lirası`) and the spoken Persian `تومن` take no trailing word boundary, so a
 * suffix (`lirası`, `dolarlık`) is still refused.
 */
const CURRENCY = /[$€£¥₺﷼₹₽₩₪]|\b(?:usd|eur|gbp|try|tl|irr|irt|toman|tomans|rial|rials|dollars?|euros?)\b|\b(?:lira|dolar|avro)|تومان|تومن|ریال|لیر|دلار|یورو/i

export const PLAN_ENTITY_SPECS: Readonly<Record<string, EntitySpec>> = {
  'business.marketing.journey_stages': {
    question_id: 'business.marketing.journey_stages',
    id_prefix: 'stage',
    max_items: 10,
    item_label: { en: 'Journey stage', fa: 'مرحلهٔ سفر', tr: 'Yolculuk aşaması' },
    fields: [
      NAME,
      text('goal', 300, { en: 'Customer goal', fa: 'هدف مشتری', tr: 'Müşteri hedefi' }),
      text('touchpoints', 400, { en: 'Touchpoints', fa: 'نقاط تماس', tr: 'Temas noktaları' }),
      text('actions', 400, { en: 'Customer actions', fa: 'اقدام‌های مشتری', tr: 'Müşteri eylemleri' }),
      {
        key: 'emotion',
        kind: 'choice',
        required: false,
        max: 0,
        label: { en: 'Emotion', fa: 'احساس', tr: 'Duygu' },
        options: ['very_positive', 'positive', 'neutral', 'negative', 'very_negative'],
        option_labels: {
          very_positive: { en: 'Delighted', fa: 'بسیار راضی', tr: 'Çok memnun' },
          positive: { en: 'Positive', fa: 'مثبت', tr: 'Olumlu' },
          neutral: { en: 'Neutral', fa: 'خنثی', tr: 'Nötr' },
          negative: { en: 'Negative', fa: 'منفی', tr: 'Olumsuz' },
          very_negative: { en: 'Frustrated', fa: 'بسیار ناراضی', tr: 'Çok rahatsız' },
        },
      },
      text('pains', 400, { en: 'Pain points', fa: 'نقاط درد', tr: 'Sorun noktaları' }),
      text('opportunities', 400, { en: 'Opportunities', fa: 'فرصت‌ها', tr: 'Fırsatlar' }),
      text('evidence', 200, { en: 'Evidence', fa: 'شواهد', tr: 'Kanıt' }),
    ],
    links: ['business.model.segments'],
  },
  'business.goals.objectives': {
    question_id: 'business.goals.objectives',
    id_prefix: 'obj',
    max_items: 8,
    item_label: { en: 'Objective', fa: 'هدف', tr: 'Amaç' },
    fields: [NAME, text('detail', 400, { en: 'Why it matters', fa: 'چرا مهم است', tr: 'Neden önemli' }), text('period', 40, { en: 'Period', fa: 'دوره', tr: 'Dönem' })],
    links: [],
  },
  'business.goals.key_results': {
    question_id: 'business.goals.key_results',
    id_prefix: 'kr',
    max_items: 30,
    max_links: 1,
    item_label: { en: 'Key result', fa: 'نتیجهٔ کلیدی', tr: 'Anahtar sonuç' },
    fields: [
      NAME,
      measure('target', 'number', { en: 'Target', fa: 'هدف عددی', tr: 'Hedef' }, true),
      measure('current', 'number', { en: 'Current', fa: 'مقدار فعلی', tr: 'Güncel' }),
      {
        ...text('unit', 24, { en: 'Unit', fa: 'واحد', tr: 'Birim' }, true),
        refuse: { pattern: CURRENCY, message: 'is a currency. Key results here never hold money amounts; revenue and cost figures stay in the restricted finance answers.' },
      },
      text('source', 200, { en: 'Source', fa: 'منبع', tr: 'Kaynak' }, true),
      measure('baseline', 'number', { en: 'Baseline', fa: 'مقدار پایه', tr: 'Başlangıç' }),
      measure('measured_on', 'date', { en: 'Measured on', fa: 'تاریخ اندازه‌گیری', tr: 'Ölçüm tarihi' }),
    ],
    links: ['business.goals.objectives'],
  },
}
