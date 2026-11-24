/**
 * What a Brand OS output may say about a method or a standard.
 *
 * The six levels are a ladder, not a set of synonyms. `reference_only` means we named a source.
 * `certified` means an accredited body issued a certificate for a named scope and dates. Nothing in
 * this repository can move an entry up the ladder: the level a method may be cited at is the lowest
 * of what it declares, what its rules access allows, and what a human actually verified.
 *
 * None of this is a legal opinion. It is a gate that makes the unsafe wording unavailable.
 */

export const CLAIM_LEVELS = ['reference_only', 'informed_by', 'mapped_to', 'internally_assessed', 'externally_reviewed', 'certified'] as const
export type ClaimLevel = (typeof CLAIM_LEVELS)[number]

const RANK: Record<ClaimLevel, number> = {
  reference_only: 0,
  informed_by: 1,
  mapped_to: 2,
  internally_assessed: 3,
  externally_reviewed: 4,
  certified: 5,
}

export function claimRank(level: ClaimLevel): number {
  return RANK[level]
}

/** The weaker of two levels. The only way levels ever combine. */
export function lowerClaim(a: ClaimLevel, b: ClaimLevel): ClaimLevel {
  return RANK[a] <= RANK[b] ? a : b
}

/**
 * How the assessment rules themselves are available to us.
 * - `authored`: we wrote them (an original Brand OS method).
 * - `licensed`: a rights holder granted use of the requirements for this purpose, in writing.
 * - `reference_only`: the source is publicly readable and citable, but we have not mapped its requirements.
 * - `unlicensed`: the requirements are copyrighted and we hold no rights to assess against them.
 */
export const RULES_ACCESS = ['authored', 'licensed', 'reference_only', 'unlicensed'] as const
export type RulesAccess = (typeof RULES_ACCESS)[number]

/**
 * The highest claim rules access alone can support. `externally_reviewed` and `certified` are never
 * reachable from rules access: they need an attestation by someone who is not us.
 */
export const RULES_ACCESS_CAP: Record<RulesAccess, ClaimLevel> = {
  authored: 'internally_assessed',
  licensed: 'internally_assessed',
  reference_only: 'informed_by',
  unlicensed: 'reference_only',
}

export const LICENSE_STATUSES = ['original_brand_os', 'open_permitted', 'rights_cleared', 'reference_only', 'blocked_pending_review'] as const
export type LicenseStatus = (typeof LICENSE_STATUSES)[number]

/**
 * Evidence that an identified third party reviewed or certified a named scope. Null in this release:
 * nothing in the template has been externally reviewed or certified, so nothing may say so.
 */
export interface Attestation {
  /** `review`: a named independent reviewer examined a scope. `certificate`: an accredited body certified it. */
  kind: 'review' | 'certificate'
  /** The reviewing or certifying organisation, named. */
  issuer: string
  /** Exactly what was reviewed or certified. Never "the product". */
  scope: string
  /** Certificate or report identifier. */
  reference: string
  issued_at: string
  expires_at: string | null
  /** How a reader can check it with the issuer, not with us. */
  verification_url: string | null
}

export interface ClaimSubject {
  declared_claim_level: ClaimLevel
  rules_access: RulesAccess
  /** Null until a person checked the official source page. */
  checked_at: string | null
  /** Null until a person recorded which edition they checked. */
  edition: string | null
  attestation: Attestation | null
}

/** Stable English codes. Human text lives in `assurance/i18n.ts`. */
export const CLAIM_CAP_REASONS = ['rules_access', 'edition_unverified', 'source_unverified', 'no_attestation'] as const
export type ClaimCapReason = (typeof CLAIM_CAP_REASONS)[number]

export interface ClaimDecision {
  /** The level this method may actually be cited at. */
  level: ClaimLevel
  /** Why it is not the declared level. Empty when the declaration stands. */
  capped_by: ClaimCapReason[]
}

/** The highest level an attestation supports. A review is not a certificate. */
const ATTESTATION_CAP: Record<Attestation['kind'], ClaimLevel> = { review: 'externally_reviewed', certificate: 'certified' }

/**
 * The gate. Levels only ever go down, in this order:
 *
 * 1. Above `internally_assessed` needs an attestation by someone who is not us, and a review supports
 *    `externally_reviewed` at most.
 * 2. An unrecorded edition or an unchecked source caps the entry at `informed_by`. "Informed by" is a
 *    statement about our own work and needs no edition; anything that cites requirements (`mapped_to`
 *    and up) does, and citing an edition nobody checked is itself an unsupported claim.
 * 3. At or below our own assessment, rules access caps the level: we cannot assess against rules we
 *    hold no rights to, and an unlicensed standard is only ever named. An attested level stands on the
 *    third party's attestation instead, so it does not need our rules.
 */
export function effectiveClaim(subject: ClaimSubject): ClaimDecision {
  const capped: ClaimCapReason[] = []
  let level = subject.declared_claim_level
  const lower = (cap: ClaimLevel, reason: ClaimCapReason) => {
    if (RANK[level] > RANK[cap]) {
      level = cap
      capped.push(reason)
    }
  }

  if (subject.attestation === null) lower('internally_assessed', 'no_attestation')
  else lower(ATTESTATION_CAP[subject.attestation.kind], 'no_attestation')

  if (subject.edition === null) lower('informed_by', 'edition_unverified')
  if (subject.checked_at === null) lower('informed_by', 'source_unverified')

  if (RANK[level] <= RANK.internally_assessed) lower(RULES_ACCESS_CAP[subject.rules_access], 'rules_access')
  return { level, capped_by: capped }
}

/**
 * Whether a method may be assessed against at all: we must hold its rules (authored or licensed), and a
 * person must have checked the entry. Anything else has no usable requirement set here, so its controls
 * are reported `blocked_by_license` rather than passed or failed. Not knowing a rule is not failing it.
 * A certificate someone else holds does not make a method assessable by us.
 */
export function assessable(subject: Pick<ClaimSubject, 'rules_access' | 'checked_at' | 'edition'>): boolean {
  return (subject.rules_access === 'authored' || subject.rules_access === 'licensed') && subject.checked_at !== null && subject.edition !== null
}

export function isClaimLevel(value: unknown): value is ClaimLevel {
  return typeof value === 'string' && (CLAIM_LEVELS as readonly string[]).includes(value)
}
