/**
 * The bridge between the visual layer's framework vocabulary (`visual/model.ts`, PR #25) and the claim
 * ladder. Read-only: nothing in the visual layer changes here. It exists so the two vocabularies cannot
 * drift apart silently — a test checks that every framework a visual page cites is in the registry and
 * that the page never claims more than the registry allows.
 *
 * Replacing `PermittedClaim` with `ClaimLevel` inside the visual layer is a separate, owner-approved
 * step (proposed in the Trust v2 audit, part F.1); this file is the mapping it would use.
 */

import type { FrameworkRef, PermittedClaim } from '../visual/model.js'
import { claimRank, type ClaimLevel } from './claims.js'
import { methodById, methodClaim, METHOD_REGISTRY, type MethodEntry } from './registry.js'

/**
 * `aligned_with` is vague, so it maps to the narrower `mapped_to`. `verified_against` is only honest with
 * a named reviewer, so it maps to `externally_reviewed`. `original_professional_template` is a kind of
 * work (our own template), not a strength of claim, so it maps to what we can say about our own method.
 */
export const PERMITTED_CLAIM_LEVEL: Record<PermittedClaim, ClaimLevel> = {
  informed_by: 'informed_by',
  aligned_with: 'mapped_to',
  verified_against: 'externally_reviewed',
  externally_certified: 'certified',
  original_professional_template: 'internally_assessed',
}

/** Visual `framework_id` → registry `method_id`. */
export const VISUAL_FRAMEWORK_METHOD: Record<string, string> = {
  BMC: 'strategyzer.bmc',
  'WCAG-CONTRAST': 'w3c.wcag-2.2',
}

export interface FrameworkClaimCheck {
  framework_id: string
  method_id: string | null
  /** What the visual page says, on the ladder. */
  page_claim: ClaimLevel
  /** What the registry allows today. Null when the framework is not in the registry. */
  allowed: ClaimLevel | null
  ok: boolean
}

/** Whether a visual page's framework claim stays within what the registry allows. */
export function checkFrameworkClaim(ref: FrameworkRef, registry: MethodEntry[] = METHOD_REGISTRY): FrameworkClaimCheck {
  const methodId = VISUAL_FRAMEWORK_METHOD[ref.framework_id] ?? null
  const entry = methodId ? methodById(methodId, registry) : null
  const pageClaim = PERMITTED_CLAIM_LEVEL[ref.permitted_claim]
  const allowed = entry ? methodClaim(entry).level : null
  return {
    framework_id: ref.framework_id,
    method_id: methodId,
    page_claim: pageClaim,
    allowed,
    ok: allowed !== null && claimRank(pageClaim) <= claimRank(allowed),
  }
}
