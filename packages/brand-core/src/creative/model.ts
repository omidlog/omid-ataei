import crypto from 'node:crypto'

/**
 * Creative Learning: small typed records derived from Knowledge Inbox notes.
 *
 * The owner's words (feedback, inspiration commentary, reasons) live only in Knowledge notes. These records hold
 * note ids with the revision seen at link time, closed-vocabulary annotations and short owner-written labels. They
 * never hold a note body. See docs-internal/CREATIVE_LEARNING_REUSE_MAP.md.
 */

export const CREATIVE_SCHEMA_VERSION = 1

/** `logo` holds logo/identity concept rounds (Identity Slice D); selection there is never an approved mark. */
export const SURFACES = ['reel', 'post', 'carousel', 'story', 'logo'] as const
export const VARIANT_STATUSES = ['draft', 'selected', 'rejected'] as const
export const VERDICTS = ['like', 'reject', 'change_request', 'observation'] as const
/** Owner-words source kinds a feedback note may have. Third-party material is never feedback. */
export const FEEDBACK_SOURCE_KINDS = ['owner_note', 'agent_capture', 'meeting'] as const
export const INSPIRATION_RIGHTS = ['own', 'licensed', 'unknown'] as const
/** What a keep/avoid annotation is about. A closed list, so annotations never carry free text. */
export const ASPECTS = [
  'camera_angle',
  'lighting',
  'text_density',
  'tone',
  'typography',
  'layout',
  'color',
  'mascot_pose',
  'mascot_anatomy',
  'hook',
  'cta',
  'duration',
  'pacing',
  'music',
] as const
export const PREFERENCE_STATES = ['draft', 'approved', 'superseded'] as const
export const PREFERENCE_SCOPES = ['project', 'series'] as const

export type Surface = (typeof SURFACES)[number]
export type VariantStatus = (typeof VARIANT_STATUSES)[number]
export type Verdict = (typeof VERDICTS)[number]
export type FeedbackSourceKind = (typeof FEEDBACK_SOURCE_KINDS)[number]
export type InspirationRights = (typeof INSPIRATION_RIGHTS)[number]
export type Aspect = (typeof ASPECTS)[number]
export type PreferenceState = (typeof PREFERENCE_STATES)[number]
export type PreferenceScopeLevel = (typeof PREFERENCE_SCOPES)[number]

export const CREATIVE_LIMITS = {
  maxTitleChars: 120,
  maxDescribeChars: 120,
  maxStatementChars: 200,
  maxContextChars: 300,
  maxVariants: 26,
  maxFeedback: 500,
  maxInspirations: 20,
  maxSources: 20,
  maxCounterexamples: 10,
  maxAspectProposalsPerRun: 100,
  /** Characters of a note body quoted into a retrieval reason. */
  maxQuoteChars: 500,
} as const

export const PROJECT_ID = /^[a-z0-9][a-z0-9-]{2,39}$/
export const VARIANT_ID = /^[A-Z][A-Z0-9]{0,7}$/
export const SERIES_ID = /^[a-z0-9][a-z0-9-]{1,39}$/
export const PREFERENCE_ID = /^cp_[0-9a-f-]{36}$/
export const ASPECT_PROPOSAL_ID = /^ap_[0-9a-f-]{36}$/
export const FEEDBACK_ID = /^fb_[0-9a-f-]{36}$/
const ASSET_ID = /^[a-z0-9][a-z0-9_.-]{1,119}$/

/** A Knowledge note as it was when linked. The revision is the sha256 the Knowledge store computes. */
export interface NoteRef {
  id: string
  revision: string
}

export type VariantAsset = { state: 'missing' } | { state: 'manifest'; asset_id: string; checksum_sha256: string | null; present: boolean }

export interface Variant {
  variant_id: string
  status: VariantStatus
  asset: VariantAsset
  describe: string | null
  created_at: string
}

export interface Inspiration {
  note: NoteRef
  rights: InspirationRights
}

export interface FeedbackEvent {
  feedback_id: string
  variant_id: string
  note: NoteRef
  source_kind: FeedbackSourceKind
  verdict: Verdict
  keep: Aspect[]
  avoid: Aspect[]
  recorded_at: string
  /** Aspect proposals the owner approved into keep/avoid on this event (audit trail). */
  aspect_proposals?: string[]
}

export const ASPECT_SIDES = ['keep', 'avoid'] as const
export type AspectSide = (typeof ASPECT_SIDES)[number]
export const ASPECT_PROPOSAL_STATES = ['pending', 'approved', 'rejected'] as const
export type AspectProposalState = (typeof ASPECT_PROPOSAL_STATES)[number]

/**
 * A machine suggestion of keep/avoid aspects for one feedback event, derived from its note's text by a fixed
 * lexicon. It holds lexicon cues only, never note text. It changes nothing until the owner approves it.
 */
export interface AspectSuggestion {
  aspect: Aspect
  /** `unclear`: the aspect is mentioned but the wording does not say keep or avoid; the owner must choose. */
  side: AspectSide | 'unclear'
  /** The lexicon entry that matched (a fixed vocabulary string, not the owner's text). */
  cue: string
}

export interface AspectProposal {
  schema_version: number
  kind: 'creative_aspect_proposal'
  proposal_id: string
  brand_slug: string
  project_id: string
  feedback_id: string
  variant_id: string
  note: NoteRef
  method: string
  label: 'machine_suggestion_unverified'
  suggestions: AspectSuggestion[]
  state: AspectProposalState
  applied: Array<{ aspect: Aspect; side: AspectSide }>
  decided_at: string | null
  created_at: string
}

export interface CreativeProject {
  schema_version: number
  kind: 'creative_project'
  project_id: string
  brand_slug: string
  title: string
  surface: Surface
  series: string
  language: string | null
  inspirations: Inspiration[]
  variants: Variant[]
  feedback: FeedbackEvent[]
  /** The owner's choice for this project. Not publication, not brand-wide approval, not a performance result. */
  selection: { variant_id: string; meaning: 'owner_selected_for_this_project'; selected_at: string } | null
  created_at: string
  updated_at: string
}

export type PreferenceScope = { level: 'project'; project_id: string } | { level: 'series'; surface: Surface; series: string }

export interface CreativePreference {
  schema_version: number
  kind: 'creative_preference'
  preference_id: string
  brand_slug: string
  project_id: string
  statement: string
  context: string | null
  scope: PreferenceScope
  sources: NoteRef[]
  counterexamples: Array<{ project_id: string; variant_id: string }>
  state: PreferenceState
  supersedes: string | null
  superseded_by: string | null
  superseded_at: string | null
  approval: { approved_at: string; digest: string; actor: 'owner' } | null
  created_at: string
  updated_at: string
}

export class CreativeError extends Error {
  constructor(
    readonly code: 'invalid_input' | 'not_found' | 'exists' | 'wrong_brand' | 'refused' | 'proof' | 'stale_source' | 'unsafe_path' | 'invalid_record',
    message: string,
  ) {
    super(message)
    this.name = 'CreativeError'
  }
}

export function newPreferenceId(): string {
  return `cp_${crypto.randomUUID()}`
}

export function newAspectProposalId(): string {
  return `ap_${crypto.randomUUID()}`
}

export function validateAspectProposalId(value: unknown): string {
  if (typeof value !== 'string' || !ASPECT_PROPOSAL_ID.test(value)) throw new CreativeError('invalid_input', 'An aspect proposal id looks like ap_<uuid>.')
  return value
}

export function validateFeedbackId(value: unknown): string {
  if (typeof value !== 'string' || !FEEDBACK_ID.test(value)) throw new CreativeError('invalid_input', 'A feedback id looks like fb_<uuid>.')
  return value
}

export function newFeedbackId(): string {
  return `fb_${crypto.randomUUID()}`
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T
  throw new CreativeError('invalid_input', `${field} must be one of ${allowed.join(', ')}.`)
}

export function validateProjectId(value: unknown): string {
  if (typeof value !== 'string' || !PROJECT_ID.test(value)) throw new CreativeError('invalid_input', 'A project id is 3–40 lowercase letters, digits and hyphens (for example pilito-reel-001).')
  return value
}

export function validateVariantId(value: unknown): string {
  if (typeof value !== 'string' || !VARIANT_ID.test(value)) throw new CreativeError('invalid_input', 'A variant id is an uppercase letter, optionally followed by up to 7 letters or digits (A, B, F2).')
  return value
}

export function validateSeries(value: unknown): string {
  if (typeof value !== 'string' || !SERIES_ID.test(value)) throw new CreativeError('invalid_input', 'A series is 2–40 lowercase letters, digits and hyphens (for example onboarding).')
  return value
}

export function validatePreferenceId(value: unknown): string {
  if (typeof value !== 'string' || !PREFERENCE_ID.test(value)) throw new CreativeError('invalid_input', 'A preference id looks like cp_<uuid>.')
  return value
}

/** Asset ids come from brand/assets/asset-manifest.yaml. Paths and URLs are refused before any lookup. */
export function validateAssetId(value: unknown): string {
  if (typeof value !== 'string' || !ASSET_ID.test(value) || value.includes('..')) {
    throw new CreativeError('invalid_input', 'An asset is an id from brand/assets/asset-manifest.yaml or the word missing. File paths and URLs are not accepted.')
  }
  return value
}

export const asSurface = (value: unknown): Surface => oneOf(value, SURFACES, 'Surface')
export const asVerdict = (value: unknown): Verdict => oneOf(value, VERDICTS, 'Verdict')
export const asFeedbackSourceKind = (value: unknown): FeedbackSourceKind => oneOf(value, FEEDBACK_SOURCE_KINDS, 'Feedback source kind')
export const asRights = (value: unknown): InspirationRights => oneOf(value, INSPIRATION_RIGHTS, 'Inspiration rights')
export const asScopeLevel = (value: unknown): PreferenceScopeLevel => oneOf(value, PREFERENCE_SCOPES, 'Scope')

export function asAspects(values: unknown): Aspect[] {
  if (values === undefined || values === null) return []
  if (!Array.isArray(values)) throw new CreativeError('invalid_input', 'Aspects must be a list.')
  const out: Aspect[] = []
  for (const value of values) {
    const aspect = oneOf(value, ASPECTS, 'Aspect')
    if (!out.includes(aspect)) out.push(aspect)
  }
  return out
}

/** A short owner-written label. Single line, bounded, so it cannot become a copy of a note. */
export function shortText(value: unknown, max: number, field: string): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new CreativeError('invalid_input', `${field} must be text.`)
  const clean = value.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!clean) return null
  if (clean.length > max) throw new CreativeError('invalid_input', `${field} is longer than ${max} characters. Keep the full wording in a Knowledge note and cite it.`)
  return clean
}

/**
 * The approval digest covers what the owner approved: statement, scope and sources. A later hand edit of any of
 * them no longer matches, and retrieval stops treating the preference as approved.
 */
export function preferenceDigest(pref: Pick<CreativePreference, 'preference_id' | 'brand_slug' | 'statement' | 'scope' | 'sources' | 'supersedes'>): string {
  const canonical = JSON.stringify([pref.preference_id, pref.brand_slug, pref.statement, pref.scope, pref.sources.map((ref) => [ref.id, ref.revision]), pref.supersedes])
  return crypto.createHash('sha256').update(canonical).digest('hex')
}

export function scopeLabel(scope: PreferenceScope): string {
  return scope.level === 'project' ? `project ${scope.project_id}` : `series ${scope.series} (${scope.surface})`
}
