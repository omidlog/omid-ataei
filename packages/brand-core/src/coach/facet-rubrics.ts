import { isOpenAnswer } from '../completeness.js'
import { personalConfig } from '../conditions.js'
import { asciiDigits } from '../structured.js'
import type { PersonalFacet } from '../types.js'
import { answerText, type CoachContext } from './context.js'
import { containsTerm, contentWordCount } from './lexicon.js'
import type { CoachCriterion, CoachFindingCode, CoachSourceRef, CoachStatus } from './model.js'
import type { QualityAssessment, QualityFinding } from './quality.js'

/**
 * Personal-brand facet rubrics (Coach PR 2, fixes pack GAP-08).
 *
 * Five narrow checks, one family per facet, that only a person-centred brand needs. They run inside
 * `quality_review` after the general rubric, and only when `modules.personal` is on and the facet is selected.
 * They reuse existing canonical questions (`PERSONAL_CANONICAL_REFERENCES` and the facet modules' own questions):
 * no new field and no second question is introduced. When an existing question closes the gap, the finding links
 * to it through `canonical_question_id`.
 *
 * They do **not** run in `follow_up`, so the automatic Coach moments (interview, approve, Studio card) are unchanged
 * until the owner decides otherwise (see `docs-internal/COACH_UX_DECISION.md`).
 *
 * Like every coach rule they judge the data, quote nothing, and give no score.
 */

export const FACET_RUBRIC_IDS = [
  'founder-role-not-ownership',
  'consultant-client-permission',
  'creator-dated-audience-claim',
  'creator-sponsorship-disclosure',
  'artist-portfolio-rights',
  'speaker-dated-history',
] as const
export type FacetRubricId = (typeof FACET_RUBRIC_IDS)[number]

interface FacetRubric {
  id: FacetRubricId
  facet: PersonalFacet
  /** The questions this rubric assesses. */
  questions: readonly string[]
  code: CoachFindingCode
  criterion: CoachCriterion
  status: CoachStatus
  /** The existing question that closes the gap, when one does. */
  canonical: string | null
  /** True when the rubric's gap is present in this answer. */
  fires: (ctx: CoachContext, text: string) => boolean
}

/** Ownership words. Founding, leading or advising never implies ownership (`PERSONAL_CANONICAL_REFERENCES`). */
export const OWNERSHIP_MARKERS: readonly string[] = [
  'owner',
  'co-owner',
  'owns',
  'ownership',
  'majority owner',
  'stake',
  'equity stake',
  'equity holder',
  'shareholder',
  'مالک',
  'مالکیت',
  'سهام',
  'سهامدار',
  'sahibi',
  'sahiplik',
  'hisse',
  'hissedar',
  'pay sahibi',
]
/** Role titles that contain an ownership word but state no ownership. */
const ROLE_TITLES_WITH_OWNER: readonly string[] = ['product owner', 'process owner', 'owner of the roadmap', 'مالک محصول', 'ürün sahibi']

/** "None" answers: a valid statement that there is nothing to date. */
const NONE_ANSWER = /^(none|no|nothing yet|not yet|n\/a|هیچ|هیچی|ندارم|هنوز نه|yok|henüz yok)\.?$/i

/** A four-digit Gregorian (19xx/20xx) or Solar Hijri (13xx/14xx) year, after Persian digits are folded. */
const YEAR = /(?<!\d)(?:19|20|13|14)\d{2}(?!\d)/g

/**
 * Words that make a year-shaped number a count ("2000 subscribers", "subscribers: 1450", «۲۰۰۰ نفر»,
 * "2000 abone"). Matched as a word start, so plurals and suffixes count. A count is not a date.
 */
const COUNT_NOUNS: readonly string[] = [
  'subscriber', 'follower', 'member', 'reader', 'viewer', 'views', 'listener', 'download', 'student', 'attendee', 'people', 'sign-up', 'signup',
  'نفر', 'مشترک', 'دنبال\u200cکننده', 'دنبال کننده', 'عضو', 'بازدید', 'خواننده', 'دانشجو', 'شاگرد',
  'abone', 'takipçi', 'üye', 'kişi', 'okuyucu', 'izlenme', 'görüntülenme', 'öğrenci', 'indirme',
]
const COUNT_ALT = COUNT_NOUNS.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
/** Right after the number: an optional "+" and one word like "active" or "paid", then a count noun. */
const COUNT_AFTER = new RegExp(`^\\s*\\+?\\s*(?:(?:active|paid|monthly|total|new)\\s+)?(?:${COUNT_ALT})`, 'iu')
/** Right before the number: a count noun (any suffix), then an optional ":" or "=". */
const COUNT_BEFORE = new RegExp(`(?:^|[^\\p{L}])(?:${COUNT_ALT})[\\p{L}\\p{M}\\u200c]*\\s*[:=：]?\\s*$`, 'iu')

/** True when the text names a year: a year-shaped number that is not a count of people, copies or views. */
function hasYear(text: string): boolean {
  const folded = asciiDigits(text)
  for (const match of folded.matchAll(YEAR)) {
    const start = match.index
    const end = start + match[0].length
    if (COUNT_AFTER.test(folded.slice(end)) || COUNT_BEFORE.test(folded.slice(0, start))) continue
    return true
  }
  return false
}

function stripRoleTitles(text: string): string {
  let out = text
  for (const title of ROLE_TITLES_WITH_OWNER) out = out.replace(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu'), ' ')
  return out
}

/** True when the owner has not decided the companion question: no live answer and not deferred. */
function companionOpen(ctx: CoachContext, id: string): boolean {
  if (!ctx.byId.has(id) || ctx.deferred.has(id)) return false
  return isOpenAnswer(ctx.answers.get(id))
}

function undated(text: string): boolean {
  if (NONE_ANSWER.test(text.trim()) || contentWordCount(text) === 0) return false
  return !hasYear(text)
}

const RUBRICS: readonly FacetRubric[] = [
  {
    // Founder / executive: role versus ownership.
    id: 'founder-role-not-ownership',
    facet: 'founder-executive',
    questions: ['personal.founder.ventures', 'personal.experience.roles'],
    code: 'facet_ownership_separate',
    criterion: 'evidence_support',
    status: 'evidence_missing',
    canonical: 'personal.experience.relationships',
    fires: (_ctx, text) => {
      const plain = stripRoleTitles(text)
      return OWNERSHIP_MARKERS.some((term) => containsTerm(plain, term))
    },
  },
  {
    // Consultant / expert: client confidentiality and permission to name.
    id: 'consultant-client-permission',
    facet: 'consultant-expert',
    questions: ['personal.consulting.engagements', 'personal.consulting.methodology', 'personal.experience.highlights', 'personal.reputation.testimonials'],
    code: 'facet_companion_open',
    criterion: 'completeness_for_output',
    status: 'needs_clarification',
    canonical: 'personal.consulting.confidentiality',
    fires: (ctx) => companionOpen(ctx, 'personal.consulting.confidentiality'),
  },
  {
    // Creator / educator: audience claims carry a date (the source is the evidence register's job).
    id: 'creator-dated-audience-claim',
    facet: 'creator-educator',
    questions: ['personal.creator.metrics'],
    code: 'facet_claim_undated',
    criterion: 'evidence_support',
    status: 'needs_clarification',
    canonical: null,
    fires: (_ctx, text) => undated(text),
  },
  {
    // Creator / educator: sponsorship categories need the disclosure rule next to them.
    id: 'creator-sponsorship-disclosure',
    facet: 'creator-educator',
    questions: ['personal.creator.sponsorship'],
    code: 'facet_companion_open',
    criterion: 'completeness_for_output',
    status: 'needs_clarification',
    canonical: 'personal.creator.disclosure',
    fires: (ctx) => companionOpen(ctx, 'personal.creator.disclosure'),
  },
  {
    // Artist / designer: portfolio ownership and usage rights.
    id: 'artist-portfolio-rights',
    facet: 'artist-designer',
    questions: ['personal.artist.portfolio_taxonomy', 'personal.artist.exhibitions'],
    code: 'facet_companion_open',
    criterion: 'completeness_for_output',
    status: 'needs_clarification',
    canonical: 'personal.artist.usage_rights',
    fires: (ctx) => companionOpen(ctx, 'personal.artist.usage_rights'),
  },
  {
    // Speaker / author: talks and publications carry a year (the source is the evidence register's job).
    id: 'speaker-dated-history',
    facet: 'speaker-author',
    questions: ['personal.speaking.prior_talks', 'personal.author.publications'],
    code: 'facet_claim_undated',
    criterion: 'evidence_support',
    status: 'needs_clarification',
    canonical: null,
    fires: (_ctx, text) => undated(text),
  },
]

/** The rubric definitions, read-only, for docs and tests. */
export function facetRubrics(): readonly Pick<FacetRubric, 'id' | 'facet' | 'questions' | 'code' | 'criterion' | 'status' | 'canonical'>[] {
  return RUBRICS
}

const CRITERION_PRIORITY: readonly CoachCriterion[] = ['relevance', 'evidence_support', 'clarity_coherence', 'specificity', 'completeness_for_output', 'measurability']
const STATUS_PRIORITY: readonly CoachStatus[] = ['insufficient_context', 'not_applicable', 'needs_review', 'evidence_missing', 'needs_clarification', 'ready']

/**
 * Adds the applicable facet rubric findings to a general assessment. Returns the assessment unchanged when the
 * question is settled (not applicable, open, a disposition), when the personal module is off, or when no rubric
 * covers the question. `applied` names the rubrics that were checked, so the result can say so in `notes`.
 */
export function applyFacetRubrics(ctx: CoachContext, assessment: QualityAssessment): { assessment: QualityAssessment; applied: FacetRubricId[] } {
  if (assessment.settled || !assessment.answer) return { assessment, applied: [] }
  if (!personalConfig(ctx.config).enabled) return { assessment, applied: [] }
  const question = assessment.question
  const rubrics = RUBRICS.filter((rubric) => rubric.questions.includes(question.id) && ctx.personalFacets.includes(rubric.facet))
  if (rubrics.length === 0) return { assessment, applied: [] }

  const text = answerText(assessment.answer)
  const answerRefs: CoachSourceRef[] = [
    { kind: 'question', id: question.id },
    { kind: 'answer', id: assessment.answer.answer_id, revision: assessment.answer.answer_id },
  ]
  const added: QualityFinding[] = []
  for (const rubric of rubrics) {
    if (!rubric.fires(ctx, text)) continue
    const canonical = rubric.canonical && ctx.byId.has(rubric.canonical) ? rubric.canonical : null
    added.push({
      code: rubric.code,
      criterion: rubric.criterion,
      status: rubric.status,
      vars: { question: question.id, facet: rubric.facet, rubric: rubric.id, canonical: canonical ?? '' },
      relatedIds: canonical ? [canonical] : [],
      sourceRefs: [...answerRefs, ...(canonical ? [{ kind: 'question' as const, id: canonical }] : []), { kind: 'config', id: `facet:${rubric.facet}` }],
      canonicalId: canonical ?? undefined,
    })
  }
  const checked = [...new Set([...assessment.checked, ...rubrics.map((rubric) => rubric.criterion)])]
  const applied = rubrics.map((rubric) => rubric.id)
  if (added.length === 0) return { assessment: { ...assessment, checked }, applied }

  const findings = [...assessment.findings.filter((finding) => finding.status !== 'ready'), ...added].sort((a, b) => {
    const rank = (criterion: CoachCriterion | null) => (criterion === null ? -1 : CRITERION_PRIORITY.indexOf(criterion))
    return rank(a.criterion) - rank(b.criterion)
  })
  const status = STATUS_PRIORITY.find((candidate) => findings.some((finding) => finding.status === candidate)) ?? 'ready'
  return { assessment: { ...assessment, findings, checked, status }, applied }
}
