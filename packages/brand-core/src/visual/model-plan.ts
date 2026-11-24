import type { BlockBase, BmcZone, NextQuestion, VisualEntry } from './model.js'

/**
 * Visual V3.3 blocks: customer journey swimlane, SOSTAC overview and OKR tree. Kept apart from `model.ts` so parallel
 * slices only append to the `VisualBlock` union there. Same rules as every visual block: built through `itemFor`
 * (approved facts, labelled drafts, named gaps, restricted values withheld), values never translated, missing stays
 * missing. Item ids are carried for links and the details disclosure only; renderers keep them out of the main view.
 */

// ---- Customer journey swimlane ----------------------------------------------------------------------------

/** The standard rows of a customer journey map, top to bottom. `emotion` is drawn as a curve, the rest as text. */
export const JOURNEY_LANES = ['touchpoints', 'actions', 'emotion', 'pains', 'opportunities'] as const
export type JourneyLane = (typeof JOURNEY_LANES)[number]
export type JourneyTextLane = Exclude<JourneyLane, 'emotion'>

/** Five-point emotion scale, best to worst (stored option keys of `business.marketing.journey_stages`). */
export const JOURNEY_EMOTIONS = ['very_positive', 'positive', 'neutral', 'negative', 'very_negative'] as const
export type JourneyEmotion = (typeof JOURNEY_EMOTIONS)[number]

/** A linked item from another list, by name when it is visible in this edition; `null` name when it is not. */
export interface PlanLink {
  id: string
  name: string | null
}

export interface JourneyStage {
  id: string
  /** 1-based, the owner's order. */
  order: number
  name: string
  goal: string | null
  lanes: Record<JourneyTextLane, string | null>
  emotion: JourneyEmotion | null
  evidence: string | null
  segments: PlanLink[]
}

export interface JourneySwimlaneBlock extends BlockBase {
  type: 'journey_swimlane'
  /** The stage list (`business.marketing.journey_stages`); `value` is null when missing or withheld. */
  source: VisualEntry
  /** The prose journey hypothesis (`business.marketing.journey`), shown above the map; null when not in the bank. */
  hypothesis: VisualEntry | null
  stages: JourneyStage[]
  /** The stored stage list is free text, not a list: shown as written and flagged, never parsed by guesswork. */
  legacy: boolean
  next_questions: NextQuestion[]
}

// ---- SOSTAC overview -------------------------------------------------------------------------------------

/** SOSTAC® planning stages in their canonical order (PR Smith). */
export const SOSTAC_STAGES = ['situation', 'objectives', 'strategy', 'tactics', 'action', 'control'] as const
export type SostacStage = (typeof SOSTAC_STAGES)[number]

export interface SostacSection {
  stage: SostacStage
  /** 1–6 in the canonical order. */
  order: number
  /** Same vocabulary as a canvas zone. */
  state: BmcZone['state']
  entries: VisualEntry[]
  next_questions: NextQuestion[]
  /** Existing questions that inform the stage but do not answer it. Ids only. */
  related: string[]
}

export interface SostacBlock extends BlockBase {
  type: 'sostac_overview'
  sections: SostacSection[]
}

// ---- OKR tree --------------------------------------------------------------------------------------------

/**
 * `measured`: current and baseline recorded, progress drawn. `no_baseline`: current recorded but no baseline, so no
 * progress is computed (a key result may go down; a baseline of zero is never assumed). `not_measured`: no current.
 */
export const KR_MEASURES = ['measured', 'no_baseline', 'not_measured'] as const
export type KrMeasure = (typeof KR_MEASURES)[number]

export interface OkrKeyResult {
  id: string
  name: string
  target: number
  current: number | null
  baseline: number | null
  unit: string
  /** Where the number is measured (the source system), as recorded. */
  source: string
  measured_on: string | null
  measure: KrMeasure
  /** (current − baseline) ÷ (target − baseline), unclamped; null unless `measured`. Renderers clamp the bar only. */
  progress: number | null
  /** The objective this key result links to, by name when visible in this edition. */
  objective: PlanLink | null
}

export interface OkrObjective {
  id: string
  name: string
  detail: string | null
  period: string | null
  key_results: OkrKeyResult[]
}

export interface OkrTreeBlock extends BlockBase {
  type: 'okr_tree'
  /** The annual objective (`business.goals.annual`, prose) at the root of the tree; null when not in the bank. */
  root: VisualEntry | null
  objectives_source: VisualEntry
  key_results_source: VisualEntry
  objectives: OkrObjective[]
  /** Key results whose objective is not visible in this edition, or that link to none. Drawn apart, never re-parented. */
  unlinked: OkrKeyResult[]
  legacy: { objectives: boolean; key_results: boolean }
  next_questions: NextQuestion[]
}

/** The three V3.3 document kinds. */
export type PlanDocumentKind = 'customer_journey' | 'sostac_overview' | 'okr_tree'
