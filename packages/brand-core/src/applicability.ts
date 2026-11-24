import { latestAnswers } from './completeness.js'
import { personalConfig, questionApplies, type ConditionContext } from './conditions.js'
import type { InterviewEngine } from './engine.js'
import { readFacts } from './facts.js'
import { completenessScope, loadProfile } from './profiles.js'
import type { AnswerRecord, BrandConfig, PersonalFacet } from './types.js'

/**
 * One definition of "applies to this brand" (BOS-15), shared by `brand:next`, `brand:status` / completeness, the
 * framework documents (Brand Book, business plan, marketing plan) and every Studio framework and counter.
 *
 * - A question **applies** when it is in the completeness scope of the active profile (an exclusive profile such as
 *   `personal-brand` lists it; a non-exclusive profile or `universal` keeps the whole bank), its module is on, and its
 *   `skip_when` condition does not hold. That is exactly the set `completeness()` scores and, for an exclusive or
 *   universal profile, the set `brand:next` can ask. So a framework item shown as missing always has a question
 *   behind it that the interview asks and `open` counts.
 * - A framework part whose question does not apply is **mapped** when an approved personal answer describes the same
 *   thing (`PERSONAL_FRAMEWORK_SOURCES`): the framework then shows that personal answer, under its own id, approval,
 *   verification label and visibility. Nothing is copied into a `business.*` or `brand.*` field.
 * - Otherwise it is **not applicable** to this profile: never "missing", never counted as open.
 *
 * The frameworks themselves (canvas, business and marketing plans, Strategy lab) apply to every business brand, to
 * `universal` with personal on, and to a `personal-brand` profile with a business facet, where they describe the
 * person's own practice. Ventures in `personal.experience.relationships` stay relationships, never the canvas subject.
 */

/** Personal facets that run a practice: the frameworks describe that practice. */
export const BUSINESS_FACETS: readonly PersonalFacet[] = ['founder-executive', 'consultant-expert']

/**
 * Where a personal answer stands in for a framework question that is not asked in an exclusive personal profile.
 * `brand` rows apply to every exclusive personal profile (the brand book describes the person); `practice` rows only
 * with a business facet (the frameworks describe the person's own practice). Sources are listed in reading order.
 */
export interface FrameworkSourceRow {
  target: string
  sources: readonly string[]
  scope: 'brand' | 'practice'
}

export const PERSONAL_FRAMEWORK_SOURCES: readonly FrameworkSourceRow[] = [
  // Brand Book: the person is the brand.
  { target: 'brand.identity.public_name_override', sources: ['personal.identity.public_name'], scope: 'brand' },
  { target: 'brand.verbal.tagline', sources: ['personal.identity.headline'], scope: 'brand' },
  { target: 'brand.verbal.name_use', sources: ['personal.identity.name_forms'], scope: 'brand' },
  { target: 'brand.strategy.differentiation', sources: ['personal.positioning.perspective'], scope: 'brand' },
  { target: 'brand.gov.approver', sources: ['personal.governance.reviewer'], scope: 'brand' },
  // The person's own practice (business facets only).
  { target: 'business.customer.primary_segment', sources: ['personal.positioning.primary_audience'], scope: 'practice' },
  { target: 'business.model.segments', sources: ['personal.consulting.target_clients'], scope: 'practice' },
  { target: 'business.sales.buyer', sources: ['personal.consulting.target_clients'], scope: 'practice' },
  { target: 'business.offer.value_proposition', sources: ['personal.positioning.outcome'], scope: 'practice' },
  { target: 'business.offer.summary', sources: ['personal.services.offers', 'personal.consulting.engagements'], scope: 'practice' },
  { target: 'business.model.revenue', sources: ['personal.services.offers', 'personal.consulting.engagements'], scope: 'practice' },
  { target: 'business.sales.pricing', sources: ['personal.consulting.pricing_policy'], scope: 'practice' },
  { target: 'business.model.key_activities', sources: ['personal.consulting.methodology'], scope: 'practice' },
  { target: 'business.fit.products', sources: ['personal.services.offers'], scope: 'practice' },
  { target: 'business.fit.creators', sources: ['personal.positioning.outcome'], scope: 'practice' },
  { target: 'business.marketing.channels', sources: ['personal.content.channels'], scope: 'practice' },
  { target: 'brand.social.channels', sources: ['personal.content.channels'], scope: 'practice' },
  { target: 'business.marketing.pillars', sources: ['personal.content.pillars'], scope: 'practice' },
  { target: 'business.marketing.objective', sources: ['personal.goals.outcomes'], scope: 'practice' },
  { target: 'business.goals.annual', sources: ['personal.goals.outcomes'], scope: 'practice' },
  { target: 'business.goals.north_star', sources: ['personal.goals.kpis'], scope: 'practice' },
  { target: 'business.goals.key_results', sources: ['personal.goals.kpis'], scope: 'practice' },
]

/** How one framework question is shown for this brand. */
export interface FrameworkRef {
  /** The question whose answer is shown: the framework question itself, or the personal answer standing in for it. */
  id: string
  /** The framework question a personal answer stands in for; null when `id` is the framework question. */
  stands_for: string | null
  /** True when the framework question does not apply to this profile and nothing stands in: never "missing". */
  profile_na: boolean
}

export type ApplicabilityState = 'applies' | 'mapped' | 'not_applicable'

export interface BrandApplicability {
  profile: string
  /** The active profile scores only its own questions. */
  exclusive: boolean
  /** The business frameworks (canvas, business and marketing plans, Strategy lab) apply to this brand. */
  frameworks: boolean
  /** The frameworks describe a person's own practice from personal answers (`practice` rows are active). */
  practice: boolean
  /** True when the question is asked by the interview and counted by completeness. */
  applies(id: string): boolean
  /** How a framework question is shown: itself, the personal answers standing in for it, or not applicable. */
  refs(target: string): FrameworkRef[]
  /** `refs` for a list of framework questions, without repeating an id (a personal answer is shown once). */
  refsFor(targets: readonly string[]): FrameworkRef[]
  state(target: string): ApplicabilityState
}

/** True when the frameworks apply to this config: business brands, universal with personal on, or a business facet. */
export function frameworksApplyTo(config: BrandConfig, exclusive: boolean): boolean {
  if (!exclusive) return true
  return personalConfig(config).facets.some((facet) => BUSINESS_FACETS.includes(facet))
}

function hasOwnRecord(id: string, facts: Record<string, { status: string; value: unknown; private_ref?: unknown }>, answers: Map<string, AnswerRecord>): boolean {
  const fact = facts[id]
  if (fact && fact.status === 'approved' && ((fact.value !== null && fact.value !== undefined) || Boolean(fact.private_ref))) return true
  const answer = answers.get(id)
  return Boolean(answer && (answer.status === 'draft' || answer.status === 'in_review') && (answer.value !== null || answer.private_ref))
}

/**
 * The applicability of every question for one brand at its current config, profile and answers. Read-only.
 * A recorded answer or approved fact on a question outside the profile is still shown as itself (it can be answered
 * by id); only an empty one is mapped or marked not applicable.
 */
export function brandApplicability(engine: InterviewEngine): BrandApplicability {
  const config = engine.config()
  const profile = loadProfile(engine.workspaceRoot(), config.brand.profile)
  const scope = completenessScope(profile)
  const exclusive = scope !== null
  const answers = latestAnswers(engine.ledger().records)
  const ctx: ConditionContext = { config, answers }
  const facts = readFacts(engine.workspaceRoot(), 'approved', config.brand.slug) as Record<string, { status: string; value: unknown; private_ref?: unknown }>
  const personal = personalConfig(config).enabled || config.brand.profile === 'personal-brand'
  const frameworks = frameworksApplyTo(config, exclusive)
  const practice = exclusive && personal && frameworks
  const mapped = new Map<string, readonly string[]>()
  if (exclusive && personal) for (const row of PERSONAL_FRAMEWORK_SOURCES) if (row.scope === 'brand' || practice) mapped.set(row.target, row.sources)
  const cache = new Map<string, boolean>()
  const applies = (id: string): boolean => {
    const known = cache.get(id)
    if (known !== undefined) return known
    const question = engine.question(id)
    const result = question ? questionApplies(question, ctx, scope) : false
    cache.set(id, result)
    return result
  }
  const refs = (target: string): FrameworkRef[] => {
    if (applies(target) || hasOwnRecord(target, facts, answers)) return [{ id: target, stands_for: null, profile_na: false }]
    const sources = (mapped.get(target) ?? []).filter((id) => applies(id) || hasOwnRecord(id, facts, answers))
    if (sources.length) return sources.map((id) => ({ id, stands_for: target, profile_na: false }))
    return [{ id: target, stands_for: null, profile_na: true }]
  }
  const refsFor = (targets: readonly string[]): FrameworkRef[] => {
    const seen = new Set<string>()
    const out: FrameworkRef[] = []
    for (const target of targets) {
      for (const ref of refs(target)) {
        if (seen.has(ref.id)) continue
        seen.add(ref.id)
        out.push(ref)
      }
    }
    return out
  }
  const state = (target: string): ApplicabilityState => {
    const first = refs(target)[0]
    return !first || first.profile_na ? 'not_applicable' : first.stands_for ? 'mapped' : 'applies'
  }
  return { profile: profile?.id ?? config.brand.profile ?? 'universal', exclusive, frameworks, practice, applies, refs, refsFor, state }
}

/** The advice `brand:next` and `brand:status` give a personal brand whose frameworks describe the person's practice. */
export const VENTURE_PATH_NOTE =
  'The canvas, business and marketing plans and the Strategy lab describe your own practice from your personal answers; parts with no personal answer are not applicable to this profile. For a full plan of a venture, set brand.profile: universal and keep modules.personal enabled, or give the venture its own Brand OS repository.'
