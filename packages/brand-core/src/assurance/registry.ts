/**
 * The methodology and standards registry.
 *
 * It describes methods — issuer, edition, source, licence, what may be claimed about them — and holds
 * no brand data at all. It lives in code, not under `brand/`, on purpose: a brand repository must not
 * be able to raise its own claim level by editing a file.
 *
 * Two rules decide everything here:
 *
 * 1. Only a method whose rules we authored or licensed can be assessed against. Everything else is a
 *    citation, and its controls (if any) come back `blocked_by_license`.
 * 2. An entry nobody has checked (`checked_at: null`) or whose edition nobody has recorded
 *    (`edition: null`) is capped at `reference_only`, whatever it declares. The external entries below
 *    are deliberately left unchecked: no edition was verified against the issuer while writing them,
 *    and guessing one would be exactly the kind of unsupported claim this registry exists to prevent.
 *
 * No clause text of any standard is reproduced here or anywhere in this package.
 */

import { canonicalJson, sha256Hex } from '../strategy/model.js'
import { effectiveClaim, type Attestation, type ClaimDecision, type ClaimLevel, type LicenseStatus, type RulesAccess, CLAIM_LEVELS, LICENSE_STATUSES, RULES_ACCESS } from './claims.js'

export const METHOD_KINDS = ['original_method', 'formal_standard', 'web_standard', 'professional_framework', 'editorial_template', 'financial_standard'] as const
export type MethodKind = (typeof METHOD_KINDS)[number]

export interface MethodEntry {
  method_id: string
  /** English name of the method as its issuer publishes it. Display labels come from `assurance/i18n.ts`. */
  title: string
  kind: MethodKind
  issuer: string
  /** The exact edition a person checked, or null when nobody has. Never a guess. */
  edition: string | null
  official_source_url: string
  license_status: LicenseStatus
  rules_access: RulesAccess
  /** The level this entry asks to be cited at. The gate may lower it; it never raises it. */
  declared_claim_level: ClaimLevel
  /** What this method covers, in one line. */
  scope: string
  /** ISO date a person last opened the official source and confirmed edition and terms. */
  checked_at: string | null
  /** Who did that check. A name or role, never a tool. */
  checked_by: string | null
  /** Uses this entry does not permit, as stable codes. */
  blocked_uses: string[]
  /** Version of the evaluation rules for this method. A change here is a new assessment, never a silent rewrite. */
  evaluation_rule_version: string | null
  attestation: Attestation | null
}

/**
 * The one method this repository can actually assess against: our own rubric. It is not ISO, not a
 * certification, and not a measure of business success — it asks whether the positioning decisions a
 * brand has to make are recorded, evidenced and bounded by approved claims.
 */
export const POSITIONING_READINESS: MethodEntry = {
  method_id: 'brand-os.positioning-readiness',
  title: 'Brand OS Positioning Readiness rubric',
  kind: 'original_method',
  issuer: 'Brand OS (brand-os-template)',
  edition: '1',
  official_source_url: 'https://github.com/omidlog/brand-os-template',
  license_status: 'original_brand_os',
  rules_access: 'authored',
  declared_claim_level: 'internally_assessed',
  scope: 'Whether one brand has recorded, evidenced and claim-bounded positioning decisions. Not brand value, not market performance, not compliance.',
  checked_at: '2026-11-23',
  checked_by: 'owner',
  blocked_uses: ['certification', 'compliance_claim', 'brand_valuation', 'benchmark_comparison'],
  evaluation_rule_version: '1',
  attestation: null,
}

/**
 * Methods we may cite but not assess against. Each one is `reference_only` until a person verifies the
 * edition and the licence and fills in `edition` and `checked_at`. Openly readable specifications
 * (W3C, OWASP) are separated from copyrighted standards (ISO, IFRS) by `rules_access`, because the
 * difference matters: one we may read and cite freely, the other we may only name.
 */
export const REFERENCED_METHODS: MethodEntry[] = [
  {
    method_id: 'w3c.prov-o',
    title: 'PROV-O: The PROV Ontology',
    kind: 'web_standard',
    issuer: 'W3C',
    edition: null,
    official_source_url: 'https://www.w3.org/TR/prov-o/',
    license_status: 'open_permitted',
    rules_access: 'reference_only',
    declared_claim_level: 'informed_by',
    scope: 'Vocabulary for describing provenance: entities, activities, agents and derivation.',
    checked_at: null,
    checked_by: null,
    blocked_uses: ['certification', 'compliance_claim'],
    evaluation_rule_version: null,
    attestation: null,
  },
  {
    method_id: 'w3c.wcag-2.2',
    title: 'Web Content Accessibility Guidelines 2.2',
    kind: 'web_standard',
    issuer: 'W3C',
    edition: null,
    official_source_url: 'https://www.w3.org/TR/wcag22/',
    license_status: 'open_permitted',
    rules_access: 'reference_only',
    declared_claim_level: 'informed_by',
    scope: 'Accessibility requirements for web content. Used here as a design and test target.',
    checked_at: null,
    checked_by: null,
    blocked_uses: ['certification', 'compliance_claim', 'conformance_statement_without_testing'],
    evaluation_rule_version: null,
    attestation: null,
  },
  {
    method_id: 'owasp.asvs',
    title: 'OWASP Application Security Verification Standard',
    kind: 'professional_framework',
    issuer: 'OWASP Foundation',
    edition: null,
    official_source_url: 'https://asvs.owasp.org/',
    license_status: 'open_permitted',
    rules_access: 'reference_only',
    declared_claim_level: 'informed_by',
    scope: 'Application security verification requirements.',
    checked_at: null,
    checked_by: null,
    blocked_uses: ['certification', 'compliance_claim'],
    evaluation_rule_version: null,
    attestation: null,
  },
  {
    method_id: 'iso.20671',
    title: 'ISO 20671 (brand evaluation)',
    kind: 'formal_standard',
    issuer: 'ISO',
    edition: null,
    official_source_url: 'https://www.iso.org/search.html?q=ISO%2020671',
    license_status: 'reference_only',
    rules_access: 'unlicensed',
    declared_claim_level: 'reference_only',
    scope: 'Brand evaluation principles and reporting. Requirements are copyrighted and are not reproduced or assessed here.',
    checked_at: null,
    checked_by: null,
    blocked_uses: ['certification', 'compliance_claim', 'clause_reproduction', 'rule_database', 'llm_training'],
    evaluation_rule_version: null,
    attestation: null,
  },
  {
    method_id: 'iso.iec.25010',
    title: 'ISO/IEC 25010 (software product quality model)',
    kind: 'formal_standard',
    issuer: 'ISO/IEC',
    edition: null,
    official_source_url: 'https://www.iso.org/search.html?q=ISO%2FIEC%2025010',
    license_status: 'reference_only',
    rules_access: 'unlicensed',
    declared_claim_level: 'reference_only',
    scope: 'Software product quality characteristics. Named only; no clause is reproduced or assessed.',
    checked_at: null,
    checked_by: null,
    blocked_uses: ['certification', 'compliance_claim', 'clause_reproduction', 'rule_database', 'llm_training'],
    evaluation_rule_version: null,
    attestation: null,
  },
  {
    method_id: 'strategyzer.bmc',
    title: 'Business Model Canvas',
    kind: 'professional_framework',
    issuer: 'Alexander Osterwalder / Strategyzer',
    edition: null,
    official_source_url: 'https://www.strategyzer.com/library/the-business-model-canvas',
    license_status: 'blocked_pending_review',
    rules_access: 'reference_only',
    declared_claim_level: 'informed_by',
    scope: 'Nine-component description of a business model. Commercial embedding terms are under review.',
    checked_at: null,
    checked_by: null,
    blocked_uses: ['certification', 'compliance_claim', 'artwork_reproduction'],
    evaluation_rule_version: null,
    attestation: null,
  },
]

export const METHOD_REGISTRY: MethodEntry[] = [POSITIONING_READINESS, ...REFERENCED_METHODS]

export function methodById(methodId: string, registry: MethodEntry[] = METHOD_REGISTRY): MethodEntry | null {
  return registry.find((entry) => entry.method_id === methodId) ?? null
}

/** The level this entry may be cited at today, and why it is not what it declares. */
export function methodClaim(entry: MethodEntry): ClaimDecision {
  return effectiveClaim({
    declared_claim_level: entry.declared_claim_level,
    rules_access: entry.rules_access,
    checked_at: entry.checked_at,
    edition: entry.edition,
    attestation: entry.attestation,
  })
}

/** A stable digest of what the registry says about one method. Part of every assessment's rule hash. */
export function methodDigest(entry: MethodEntry): string {
  return sha256Hex(canonicalJson(entry))
}

const ID = /^[a-z0-9][a-z0-9.-]{2,63}$/

/**
 * Invariants a registry entry must satisfy. Tested rather than assumed: a registry that drifts is a
 * registry that eventually lets an unsupported claim through.
 */
export function registryErrors(registry: MethodEntry[] = METHOD_REGISTRY): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  for (const entry of registry) {
    const where = entry.method_id || '(no id)'
    if (!ID.test(entry.method_id)) errors.push(`${where}: method_id must match ${String(ID)}`)
    if (seen.has(entry.method_id)) errors.push(`${where}: duplicate method_id`)
    seen.add(entry.method_id)
    if (!entry.title.trim()) errors.push(`${where}: title is required`)
    if (!entry.issuer.trim()) errors.push(`${where}: issuer is required`)
    if (!entry.scope.trim()) errors.push(`${where}: scope is required`)
    if (!/^https:\/\//.test(entry.official_source_url)) errors.push(`${where}: official_source_url must be https`)
    if (!(LICENSE_STATUSES as readonly string[]).includes(entry.license_status)) errors.push(`${where}: unknown license_status`)
    if (!(RULES_ACCESS as readonly string[]).includes(entry.rules_access)) errors.push(`${where}: unknown rules_access`)
    if (!(CLAIM_LEVELS as readonly string[]).includes(entry.declared_claim_level)) errors.push(`${where}: unknown declared_claim_level`)
    if (entry.checked_at !== null && !/^\d{4}-\d{2}-\d{2}$/.test(entry.checked_at)) errors.push(`${where}: checked_at must be a YYYY-MM-DD date or null`)
    if (entry.checked_at !== null && !entry.checked_by) errors.push(`${where}: checked_at without checked_by says nobody checked it`)
    if (entry.checked_at === null && entry.checked_by !== null) errors.push(`${where}: checked_by without checked_at`)
    if (!entry.blocked_uses.includes('certification')) errors.push(`${where}: every entry must block the use "certification"`)
    if (entry.attestation !== null && !entry.attestation.scope.trim()) errors.push(`${where}: an attestation without a scope is not an attestation`)
    const rulesAssessable = entry.rules_access === 'authored' || entry.rules_access === 'licensed'
    if (rulesAssessable && !entry.evaluation_rule_version) errors.push(`${where}: an assessable method needs an evaluation_rule_version`)
    if (!rulesAssessable && entry.evaluation_rule_version) errors.push(`${where}: a method we cannot assess against must not carry an evaluation_rule_version`)
    if (entry.attestation !== null && !entry.attestation.issuer.trim()) errors.push(`${where}: an attestation must name its issuer`)
    if (entry.attestation !== null && !/^\d{4}-\d{2}-\d{2}$/.test(entry.attestation.issued_at)) errors.push(`${where}: attestation issued_at must be a YYYY-MM-DD date`)
    const claim = methodClaim(entry)
    if (claim.level === 'certified' && entry.attestation?.kind !== 'certificate') errors.push(`${where}: "certified" without a certificate`)
  }
  return errors
}
