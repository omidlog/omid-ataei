import type { ModelUse } from '@brand-os/asset-catalog'
import type { AgentProfile, Role } from '../auth.js'

/**
 * Visual DNA reference resolver (`docs-internal/VISUAL_DNA.md`).
 *
 * A read-only projection over the existing owners of visual truth: the asset manifest (`brand/assets/asset-manifest.yaml`),
 * the mascot catalog (`brand/mascot/catalog.yaml`, through `brand_retrieve kind: mascot`), and Creative Learning
 * (`creative_context`). It stores nothing and is not a second visual memory: every call re-reads those sources under
 * the caller's own context and returns one verdict per requested reference.
 *
 * Over MCP it is metadata only. Bytes are delivered only to the owner process, one checked asset at a time
 * (`readVerifiedAsset`), and never to a model or provider by this code.
 */

export const VISUAL_DNA_SCHEMA = 'brand-os/visual-dna/v1' as const
export const VISUAL_DNA_TOOL = 'visual_dna' as const

export const VISUAL_DNA_LOCALES = ['en', 'fa', 'tr'] as const
export type VisualDnaLocale = (typeof VISUAL_DNA_LOCALES)[number]

/** Upper bounds that keep one call small and cheap. */
export const MAX_ASSET_IDS = 20
export const MAX_REFERENCES = 60
/** A reference file larger than this is withheld (`too_large`); the owner can still open it directly. */
export const MAX_REFERENCE_BYTES = 20 * 1024 * 1024

/** An asset id as the manifest writes it. Paths, URLs and anything with a slash are refused before any lookup. */
export const ASSET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/

export const REFERENCE_STATES = ['approved', 'withheld', 'missing', 'changed'] as const
export type ReferenceState = (typeof REFERENCE_STATES)[number]

/**
 * Why a reference is not `approved`. An agent never learns whether a draft or unknown id exists: both are `not_found`.
 * The owner process sees `not_approved` and `not_present` instead.
 */
export const REFERENCE_REASONS = [
  // missing
  'not_found',
  'not_approved',
  'not_present',
  'no_artwork',
  'creative_asset_missing',
  // withheld
  'not_authorized',
  'rights',
  'license_missing',
  'unsafe_file',
  'too_large',
  // changed
  'checksum_mismatch',
  'approved_bytes_differ',
  'creative_record_changed',
] as const
export type ReferenceReason = (typeof REFERENCE_REASONS)[number]

/**
 * Where the reference will be used. `public` (the default) needs public-scope rights for a portrait or other
 * rights-sensitive subject; `internal` is also covered by internal-scope rights. A verdict holds only for the scope it
 * was asked for: an `internal` verdict is not permission to publish.
 */
export const USE_SCOPES = ['public', 'internal'] as const
export type UseScope = (typeof USE_SCOPES)[number]

/**
 * Why no licence record was needed or which one applies. `own_brand_mark`: the brand's own logo, wordmark, logomark or
 * brand mark with an empty or TBD licence (owner decision 2026-11-23). Third-party assets always need `recorded`.
 */
export type LicenseBasis = 'recorded' | 'own_brand_mark'

/** Intended consumer of an asset's bytes. `renderer` is a deterministic local program, not a model. */
export const ASSET_USES = ['renderer', 'local_model', 'external_provider'] as const
export type AssetUse = (typeof ASSET_USES)[number]

/**
 * What the recorded `model_use` says about one consumer. `not_blocked_by_record` is not a permission: consent,
 * copyright, the provider's terms and an owner-directed export still decide, and nothing here sends anything.
 */
export type ProviderVerdict = 'blocked' | 'not_blocked_by_record'

export interface VisualReference {
  /** Stable id of this reference within the result, for example `asset:asset.logo.primary`. */
  ref_id: string
  via: 'asset' | 'mascot' | 'creative'
  asset_id: string | null
  state: ReferenceState
  reason: ReferenceReason | null
  /** Localized one-line explanation of `reason`, or null for an approved reference. */
  reason_text: string | null
  source: { path: string; revision: string | null }
  /** Metadata of the verified file. Present only when `state` is `approved`. */
  asset: { name: string | null; path: string; media_type: string | null; size_bytes: number; checksum_sha256: string } | null
  /** Usage-rights record as the manifest states it. Present only when `state` is `approved`. */
  rights: { license: string | null; license_basis: LicenseBasis; usage: string | null; restrictions: string | null; rights_subject: string | null } | null
  /** Effective model-use right: the recorded value when valid, otherwise `not_allowed`. `not_allowed` unless approved. */
  model_use: ModelUse
  provider_gate: { local_model: ProviderVerdict; external_provider: ProviderVerdict }
  /** `metadata_only` for an approved reference; `none` otherwise. Bytes never travel over MCP. */
  delivery: 'metadata_only' | 'none'
  sent_to_model: false
  mascot?: { art_id: string | null; state_id: string | null; emotion: string | null; stage: string | null; angle: string | null }
  creative?: { project_id: string; variant_id: string; role: 'selected' | 'rejected' | 'partial_keep' }
}

export interface MascotRequest {
  emotion?: string
  stage?: string
  use_case?: string
  angle?: string
}

export interface CreativeRequest {
  project_id?: string
  surface?: string
  series?: string
}

export interface VisualDnaRequest {
  asset_ids?: string[]
  mascot?: MascotRequest
  creative?: CreativeRequest
  /** Default `public`. */
  use_scope?: UseScope
  locale?: VisualDnaLocale
}

export interface VisualDnaPermissions {
  publish: false
  schedule: false
  spend: false
  deploy: false
  approve: false
  upload: false
}

export const VISUAL_DNA_PERMISSIONS: VisualDnaPermissions = Object.freeze({ publish: false, schedule: false, spend: false, deploy: false, approve: false, upload: false }) as VisualDnaPermissions

export interface VisualDnaResult {
  schema: typeof VISUAL_DNA_SCHEMA
  tool: typeof VISUAL_DNA_TOOL
  status: 'ok' | 'denied' | 'invalid'
  brand_id: string
  principal: { role: Role; profile: AgentProfile | null }
  reason: string | null
  /** The use the verdicts were checked for. */
  use_scope: UseScope
  locale: VisualDnaLocale
  direction: 'ltr' | 'rtl'
  notice: string[]
  references: VisualReference[]
  mascot: { status: 'not_requested' | 'resolved' | 'missing' | 'not_applicable'; filters: MascotRequest | null; explanation: string[] }
  creative: {
    status: 'not_requested' | 'ok' | 'not_authorized' | 'not_found' | 'invalid'
    target: { project_id: string | null; surface: string | null; series: string | null } | null
    /** Approved creative preference ids that apply; read their statements with `creative_context`. */
    preference_ids: string[]
  }
  summary: Record<ReferenceState, number>
  /** sha256 over the canonical references (state, ids, checksums, model_use). Null when nothing was resolved. */
  digest: string | null
  transport: { mcp: 'metadata_only'; bytes: 'owner_local_only' }
  authorizes: []
  permissions: VisualDnaPermissions
}

export class VisualDnaError extends Error {
  constructor(
    public readonly code: 'invalid_input' | 'owner_only' | 'not_approved' | 'model_use' | 'unsafe_file' | 'changed' | 'too_large',
    message: string,
  ) {
    super(message)
    this.name = 'VisualDnaError'
  }
}

/** Whether the recorded `model_use` forbids handing the bytes to this consumer. A renderer is not a model. */
export function modelUseBlocks(modelUse: ModelUse, use: AssetUse): boolean {
  if (use === 'renderer') return false
  if (use === 'local_model') return modelUse === 'not_allowed'
  return modelUse !== 'external_allowed'
}

export function providerGate(modelUse: ModelUse): VisualReference['provider_gate'] {
  return {
    local_model: modelUseBlocks(modelUse, 'local_model') ? 'blocked' : 'not_blocked_by_record',
    external_provider: modelUseBlocks(modelUse, 'external_provider') ? 'blocked' : 'not_blocked_by_record',
  }
}
