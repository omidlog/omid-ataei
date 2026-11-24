import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { inspectAssetForPublication, svgPublicationIssues } from '@brand-os/asset-catalog'
import type { AuthContext } from '../auth.js'
import type { InterviewEngine } from '../engine.js'
import {
  ASSET_ID_PATTERN,
  ASSET_USES,
  MAX_REFERENCE_BYTES,
  modelUseBlocks,
  providerGate,
  VISUAL_DNA_PERMISSIONS,
  VisualDnaError,
  type AssetUse,
  type UseScope,
  type VisualDnaPermissions,
  type VisualReference,
} from './model.js'
import { resolveVisualDna } from './resolve.js'

/**
 * Owner-local delivery of ONE checked asset (`brand:visual-dna read`). Never reachable over MCP.
 *
 * The asset is resolved exactly as `visual_dna` resolves it and must be `approved`. The intended consumer is stated
 * by the owner and checked against the recorded `model_use` (a renderer is not a model; a local model needs
 * `local_only` or `external_allowed`; an external provider needs `external_allowed`). The file is then opened without
 * following symlinks, size-checked, read once, and the SAME bytes are hashed against the manifest checksum and run
 * through both SVG gates before they are returned. Nothing is written, no URL is minted, nothing is sent anywhere:
 * the bytes go back to the owner's own process. `upload_authorized` stays false even for `external_allowed`.
 */

export const VISUAL_DNA_READ_TOOL = 'visual_dna_read' as const

export interface VerifiedAsset {
  tool: typeof VISUAL_DNA_READ_TOOL
  status: 'delivered'
  brand_id: string
  asset_id: string
  use: AssetUse
  path: string
  media_type: string | null
  size_bytes: number
  sha256: string
  model_use: VisualReference['model_use']
  provider_gate: VisualReference['provider_gate']
  delivery: 'owner_local'
  sent_to_model: false
  upload_authorized: false
  authorizes: []
  permissions: VisualDnaPermissions
  bytes: Buffer
}

const STATE_ERROR: Record<string, VisualDnaError['code']> = { changed: 'changed', unsafe_file: 'unsafe_file', too_large: 'too_large' }

export function readVerifiedAsset(engine: InterviewEngine, ctx: AuthContext, assetId: string, use: AssetUse, useScope: UseScope = 'public'): VerifiedAsset {
  if (ctx.role !== 'owner' || ctx.brand_id !== engine.config().brand.slug) {
    throw new VisualDnaError('owner_only', 'Reading asset bytes is a local owner action. Agents receive metadata only.')
  }
  if (typeof assetId !== 'string' || !ASSET_ID_PATTERN.test(assetId)) throw new VisualDnaError('invalid_input', 'Give one asset id from brand/assets/asset-manifest.yaml. File paths and URLs are not accepted.')
  if (!(ASSET_USES as readonly string[]).includes(use)) throw new VisualDnaError('invalid_input', `--for is one of: ${ASSET_USES.join(', ')}.`)

  const ref = resolveVisualDna(engine, ctx, { asset_ids: [assetId], use_scope: useScope }).references[0]
  if (!ref || ref.state !== 'approved' || !ref.asset) {
    const code = ref ? (STATE_ERROR[ref.state] ?? STATE_ERROR[ref.reason ?? ''] ?? 'not_approved') : 'not_approved'
    throw new VisualDnaError(code, `${assetId} is ${ref?.state ?? 'missing'}${ref?.reason ? ` (${ref.reason})` : ''}. Only an approved, verified asset is read.`)
  }
  if (modelUseBlocks(ref.model_use, use)) {
    throw new VisualDnaError('model_use', `${assetId} has model_use ${ref.model_use}; it may not be given to a ${use === 'local_model' ? 'local model' : 'external provider'}. Only the owner can record a wider model_use in the manifest.`)
  }

  const root = engine.workspaceRoot()
  const checksum = ref.asset.checksum_sha256
  const inspected = inspectAssetForPublication(root, ref.asset.path, checksum)
  if (!inspected.ok) throw new VisualDnaError(inspected.reason === 'checksum' ? 'changed' : 'unsafe_file', `${assetId} failed the file check (${inspected.reason}).`)
  let bytes: Buffer
  const fd = fs.openSync(inspected.realPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0))
  try {
    const stat = fs.fstatSync(fd)
    if (!stat.isFile()) throw new VisualDnaError('unsafe_file', `${assetId} is not a regular file.`)
    if (stat.size > MAX_REFERENCE_BYTES) throw new VisualDnaError('too_large', `${assetId} is larger than ${MAX_REFERENCE_BYTES} bytes.`)
    bytes = fs.readFileSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  // The bytes returned are the bytes checked: hash and SVG gates run on this buffer, not on a second read.
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== checksum) throw new VisualDnaError('changed', `${assetId} changed while it was read.`)
  if (ref.asset.path.toLowerCase().endsWith('.svg') && svgPublicationIssues(bytes.toString('utf8')).length > 0) {
    throw new VisualDnaError('unsafe_file', `${assetId} failed the SVG check.`)
  }
  return {
    tool: VISUAL_DNA_READ_TOOL,
    status: 'delivered',
    brand_id: engine.config().brand.slug,
    asset_id: assetId,
    use,
    path: ref.asset.path,
    media_type: ref.asset.media_type,
    size_bytes: bytes.length,
    sha256,
    model_use: ref.model_use,
    provider_gate: providerGate(ref.model_use),
    delivery: 'owner_local',
    sent_to_model: false,
    upload_authorized: false,
    authorizes: [],
    permissions: { ...VISUAL_DNA_PERMISSIONS },
    bytes,
  }
}
