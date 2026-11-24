import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { effectiveModelUse, inspectAssetForPublication } from '@brand-os/asset-catalog'
import { rightsBlocker, rightsSubject } from '../asset-rights.js'
import { authorize, type Audience, type AuthContext } from '../auth.js'
import { runCreativeContextTool } from '../creative/agent.js'
import type { InterviewEngine } from '../engine.js'
import { readPublicationPolicy } from '../publication.js'
import { brandRetrieve, type RetrievedItem } from '../query.js'
import { canonicalJson, sha256Hex } from '../strategy/model.js'
import { visualDnaText, type VisualDnaText } from './i18n.js'
import {
  MAX_REFERENCE_BYTES,
  MAX_REFERENCES,
  providerGate,
  REFERENCE_STATES,
  VISUAL_DNA_PERMISSIONS,
  VISUAL_DNA_SCHEMA,
  VISUAL_DNA_TOOL,
  type ReferenceReason,
  type LicenseBasis,
  type ReferenceState,
  type UseScope,
  type VisualDnaRequest,
  type VisualDnaResult,
  type VisualReference,
} from './model.js'

/**
 * The resolver. It reads only through the existing owners and under the caller's own context:
 *
 * - `brand_retrieve kind: asset` decides which manifest assets are approved and readable (approval, audience, profile
 *   module, publication, safe path, no symlink, checksum, both SVG gates). Visual DNA adds checks on top, never fewer:
 *   the approval must be for these bytes (`approved_sha256`), the file must be within the size limit, a
 *   rights-sensitive subject needs a granted rights record covering the requested use scope, and a licence must be
 *   recorded unless the asset is the brand's own mark (`ownBrandMark`).
 * - `brand_retrieve kind: mascot` decides which approved artwork matches an emotion, stage, use case and angle. When
 *   nothing matches, the request stays `missing` with the reader's own explanation; no other pose is substituted.
 * - `creative_context` decides which creative references and preferences this token may see (creative-read only).
 *   A variant whose asset changed since it was recorded is `changed`, not silently re-pointed.
 *
 * An agent learns why an approved asset it may read is withheld or changed. It never learns whether a draft or
 * unknown id exists: both are `missing / not_found`. The owner process gets the finer reason.
 */

const MANIFEST_PATH = 'brand/assets/asset-manifest.yaml'
const CATALOG_PATH = 'brand/mascot/catalog.yaml'

type Row = Record<string, unknown>
type Resolved = Omit<VisualReference, 'ref_id' | 'via' | 'mascot' | 'creative'>

function manifestRows(root: string): Map<string, Row> {
  const file = path.join(root, MANIFEST_PATH)
  const rows = new Map<string, Row>()
  if (!fs.existsSync(file)) return rows
  const doc = (parse(fs.readFileSync(file, 'utf8')) as { assets?: unknown } | null) ?? {}
  for (const row of Array.isArray(doc.assets) ? (doc.assets as Row[]) : []) {
    if (row && typeof row.id === 'string' && !rows.has(row.id)) rows.set(row.id, row)
  }
  return rows
}

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null)
const audienceOf = (value: unknown): Audience => (value === 'public' || value === 'restricted' ? value : 'internal')
/** The module `brand_retrieve` assigns to an asset; kept identical so profiles decide the same way. */
const assetModule = (id: string): string => (id.includes('mascot') ? 'mascot-identity' : 'assets')

/** `published` is approved and released: it counts as approved here, with every other check still applied. */
const approvedStatus = (value: unknown): boolean => value === 'approved' || value === 'published'

function licenseMissing(value: unknown): boolean {
  const license = str(value)
  return license === null || /^(tbd|todo|unknown|none|n\/a)$/i.test(license.trim())
}

const MARK_TAGS = new Set(['logo', 'wordmark', 'logomark', 'brand-mark', 'brandmark'])
const MARK_ID = /^asset\.(logo|wordmark|logomark|brand-?mark)\./
const THIRD_PARTY_TAGS = new Set(['third-party', 'third_party', 'partner', 'client-logo', 'stock', 'licensed'])

/**
 * The brand's own logo, wordmark, logomark or brand mark (owner decision 2026-11-23): such a mark needs no licence
 * record, because the brand is its owner. A mark is recognized by its manifest id (`asset.logo.*`, `asset.wordmark.*`,
 * `asset.logomark.*`, `asset.brand-mark.*`) or a mark tag. It is never an own mark when it has a rights-sensitive
 * subject (a client logo, for example) or a third-party tag (`third-party`, `partner`, `client-logo`, `stock`,
 * `licensed`). Icons, photos, illustrations and mascot art are not marks and still need a recorded licence.
 */
function ownBrandMark(id: string, row: Row): boolean {
  if (rightsSubject(row) !== null) return false
  const tags = Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim().toLowerCase()) : []
  if (tags.some((tag) => THIRD_PARTY_TAGS.has(tag))) return false
  return MARK_ID.test(id) || tags.some((tag) => MARK_TAGS.has(tag))
}

function notApproved(state: Exclude<ReferenceState, 'approved'>, reason: ReferenceReason, text: VisualDnaText, revision: string | null = null): Resolved {
  return {
    asset_id: null,
    state,
    reason,
    reason_text: text.reasons[reason],
    source: { path: MANIFEST_PATH, revision },
    asset: null,
    rights: null,
    model_use: 'not_allowed',
    provider_gate: providerGate('not_allowed'),
    delivery: 'none',
    sent_to_model: false,
  }
}

/** Why an asset `brand_retrieve` did not return is not approved here. Never reveals drafts to an agent. */
function diagnose(root: string, ctx: AuthContext, brandId: string, id: string, row: Row | undefined, detailed: boolean, text: VisualDnaText): Resolved {
  if (!row) return notApproved('missing', 'not_found', text)
  if (!approvedStatus(row.status)) return notApproved('missing', detailed ? (row.present === false ? 'not_present' : 'not_approved') : 'not_found', text)
  const published = readPublicationPolicy(root).approved_asset_ids.includes(id) && rightsBlocker(root, row) === null
  const decision = authorize(ctx, { brand_id: brandId, classification: audienceOf(row.visibility), status: 'approved', publication: published ? 'published' : 'unpublished', module: assetModule(id) }, 'read')
  if (!decision.allow) return notApproved('withheld', 'not_authorized', text)
  if (row.present === false || typeof row.path !== 'string') return notApproved('missing', 'not_present', text)
  const checksum = str(row.checksum_sha256)
  const shape = inspectAssetForPublication(root, row.path, null)
  if (!shape.ok) return shape.reason === 'missing' ? notApproved('missing', 'not_present', text) : notApproved('withheld', 'unsafe_file', text)
  if (!checksum || !inspectAssetForPublication(root, row.path, checksum).ok) return notApproved('changed', 'checksum_mismatch', text, checksum)
  return notApproved('withheld', 'not_authorized', text)
}

/** Extra checks on an asset `brand_retrieve` returned, then its metadata. */
function verifyReturned(root: string, item: RetrievedItem, row: Row, useScope: UseScope, text: VisualDnaText): Resolved {
  const value = (item.value ?? {}) as Row
  const assetPath = String(value.path ?? row.path)
  const checksum = String(value.checksum_sha256 ?? row.checksum_sha256)
  const approvedSha = str(row.approved_sha256)
  if (approvedSha && approvedSha !== checksum) return notApproved('changed', 'approved_bytes_differ', text, checksum)
  // brand_retrieve already ran this gate; it runs again here because the file is stat-ed for its size right after.
  const inspected = inspectAssetForPublication(root, assetPath, checksum)
  if (!inspected.ok) return inspected.reason === 'checksum' ? notApproved('changed', 'checksum_mismatch', text, checksum) : notApproved('withheld', 'unsafe_file', text, checksum)
  const size = fs.statSync(inspected.realPath).size
  if (size > MAX_REFERENCE_BYTES) return notApproved('withheld', 'too_large', text, checksum)
  if (rightsSubject(row) !== null && rightsBlocker(root, row, new Date(), useScope) !== null) return notApproved('withheld', 'rights', text, checksum)
  let licenseBasis: LicenseBasis = 'recorded'
  if (licenseMissing(value.license ?? row.license)) {
    if (!ownBrandMark(item.id, row)) return notApproved('withheld', 'license_missing', text, checksum)
    licenseBasis = 'own_brand_mark'
  }
  const modelUse = effectiveModelUse(row)
  return {
    asset_id: item.id,
    state: 'approved',
    reason: null,
    reason_text: null,
    source: { path: MANIFEST_PATH, revision: item.revision },
    asset: { name: str(value.name), path: assetPath, media_type: str(row.mime), size_bytes: size, checksum_sha256: checksum },
    rights: { license: str(value.license ?? row.license), license_basis: licenseBasis, usage: str(value.usage ?? row.usage), restrictions: str(row.restrictions), rights_subject: rightsSubject(row) },
    model_use: modelUse,
    provider_gate: providerGate(modelUse),
    delivery: 'metadata_only',
    sent_to_model: false,
  }
}

/** One verdict per asset id, in one `brand_retrieve` call under the caller's context. */
function resolveAssetIds(engine: InterviewEngine, ctx: AuthContext, ids: string[], useScope: UseScope, text: VisualDnaText): Map<string, Resolved> {
  const out = new Map<string, Resolved>()
  if (ids.length === 0) return out
  const root = engine.workspaceRoot()
  const brandId = engine.config().brand.slug
  const detailed = ctx.role !== 'agent' && ctx.role !== 'guest'
  const result = brandRetrieve(engine, ctx, { kind: 'asset', ids })
  const items = result.status === 'denied' ? [] : ((result.data as { items?: RetrievedItem[] }).items ?? [])
  const rows = manifestRows(root)
  for (const id of ids) {
    const item = items.find((entry) => entry.id === id && !entry.withheld)
    const row = rows.get(id)
    const resolved = item && row ? verifyReturned(root, item, row, useScope, text) : diagnose(root, ctx, brandId, id, row, detailed, text)
    out.set(id, { ...resolved, asset_id: id })
  }
  return out
}

function cleanFilters(filters: VisualDnaRequest['mascot']): NonNullable<VisualDnaRequest['mascot']> {
  const out: NonNullable<VisualDnaRequest['mascot']> = {}
  for (const key of ['emotion', 'stage', 'use_case', 'angle'] as const) {
    const value = filters?.[key]
    if (typeof value === 'string' && value.trim()) out[key] = value.trim().slice(0, 100)
  }
  return out
}

/**
 * Resolves the requested references. The caller has already passed `visualDnaAccess`; this function only reads.
 * Writes nothing except the access-log lines the readers it calls append themselves.
 */
export function resolveVisualDna(engine: InterviewEngine, ctx: AuthContext, request: VisualDnaRequest): VisualDnaResult {
  const brandId = engine.config().brand.slug
  const locale = request.locale ?? 'en'
  const text = visualDnaText(locale)
  // A public-audience context can only ever ask for public use.
  const useScope: UseScope = request.use_scope === 'internal' && ctx.audience !== 'public' ? 'internal' : 'public'
  const explicit = [...new Set(request.asset_ids ?? [])]

  // Mascot artwork through the existing finder: approved art for exactly these filters, or missing with its explanation.
  let mascot: VisualDnaResult['mascot'] = { status: 'not_requested', filters: null, explanation: [] }
  const mascotArt: Array<{ asset_id: string; art: Row }> = []
  if (request.mascot) {
    const filters = cleanFilters(request.mascot)
    const found = brandRetrieve(engine, ctx, { kind: 'mascot', filters })
    const data = (found.data ?? {}) as { items?: RetrievedItem[]; explanation?: string[] }
    const explanation = (data.explanation ?? []).slice(0, 20)
    if (found.status === 'not_applicable') mascot = { status: 'not_applicable', filters, explanation }
    else {
      for (const item of found.status === 'denied' ? [] : (data.items ?? [])) {
        const value = (item.value ?? {}) as Row
        const assetId = str((value.asset as Row | undefined)?.id)
        if (assetId) mascotArt.push({ asset_id: assetId, art: { ...value, art_id: item.id } })
      }
      mascot = { status: mascotArt.length > 0 ? 'resolved' : 'missing', filters, explanation }
    }
  }

  // Creative references through creative_context, under the same context (creative-read only; it logs its own line).
  let creative: VisualDnaResult['creative'] = { status: 'not_requested', target: null, preference_ids: [] }
  const creativeRefs: Array<{ project_id: string; variant_id: string; role: 'selected' | 'rejected' | 'partial_keep'; asset_state: string; asset_id: string | null }> = []
  if (request.creative) {
    const args = request.creative
    const answer = runCreativeContextTool(engine, ctx, { project_id: args.project_id, surface: args.surface, series: args.series })
    const target = { project_id: args.project_id ?? null, surface: args.surface ?? null, series: args.series ?? null }
    if (answer.status !== 'ok' || !answer.data) {
      creative = { status: answer.status === 'denied' ? 'not_authorized' : answer.status === 'not_found' ? 'not_found' : 'invalid', target, preference_ids: [] }
    } else {
      creative = { status: 'ok', target: { project_id: answer.data.target.project_id, surface: answer.data.target.surface, series: answer.data.target.series }, preference_ids: answer.data.preferences.map((pref) => pref.preference_id) }
      for (const ref of answer.data.references) {
        creativeRefs.push({ project_id: ref.project_id, variant_id: ref.variant_id, role: ref.role, asset_state: ref.asset.state, asset_id: ref.asset.asset_id })
      }
    }
  }

  const lookup = [...new Set([...explicit, ...mascotArt.map((art) => art.asset_id), ...creativeRefs.filter((ref) => ref.asset_state === 'manifest' && ref.asset_id).map((ref) => ref.asset_id as string)])]
  const assets = resolveAssetIds(engine, ctx, lookup, useScope, text)

  const references: VisualReference[] = []
  for (const id of explicit) references.push({ ref_id: `asset:${id}`, via: 'asset', ...assets.get(id)! })
  for (const { asset_id: assetId, art } of mascotArt) {
    const resolved = assets.get(assetId)!
    references.push({
      ref_id: `mascot:${String(art.art_id)}`,
      via: 'mascot',
      ...resolved,
      source: resolved.state === 'approved' ? { path: CATALOG_PATH, revision: resolved.source.revision } : resolved.source,
      mascot: { art_id: str(art.art_id), state_id: str(art.state_id), emotion: str(art.emotion), stage: str(art.stage), angle: str(art.angle) },
    })
  }
  if (mascot.status === 'missing') {
    const filters = mascot.filters ?? {}
    references.push({
      ref_id: 'mascot:request',
      via: 'mascot',
      ...notApproved('missing', 'no_artwork', text),
      source: { path: CATALOG_PATH, revision: null },
      mascot: { art_id: null, state_id: null, emotion: filters.emotion ?? null, stage: filters.stage ?? null, angle: filters.angle ?? null },
    })
  }
  for (const ref of creativeRefs) {
    const creativeMeta = { project_id: ref.project_id, variant_id: ref.variant_id, role: ref.role }
    const refId = `creative:${ref.project_id}/${ref.variant_id}`
    if (ref.asset_state === 'manifest' && ref.asset_id) {
      references.push({ ref_id: refId, via: 'creative', ...assets.get(ref.asset_id)!, creative: creativeMeta })
    } else if (ref.asset_state === 'changed') {
      references.push({ ref_id: refId, via: 'creative', ...notApproved('changed', 'creative_record_changed', text), asset_id: ref.asset_id, creative: creativeMeta })
    } else {
      references.push({ ref_id: refId, via: 'creative', ...notApproved('missing', 'creative_asset_missing', text), asset_id: ref.asset_id, creative: creativeMeta })
    }
  }

  const capped = references.slice(0, MAX_REFERENCES)
  const summary = Object.fromEntries(REFERENCE_STATES.map((state) => [state, capped.filter((ref) => ref.state === state).length])) as Record<ReferenceState, number>
  const digest = capped.length
    ? sha256Hex(canonicalJson(capped.map((ref) => ({ ref_id: ref.ref_id, state: ref.state, reason: ref.reason, asset_id: ref.asset_id, checksum_sha256: ref.asset?.checksum_sha256 ?? null, model_use: ref.model_use }))))
    : null
  return {
    schema: VISUAL_DNA_SCHEMA,
    tool: VISUAL_DNA_TOOL,
    status: 'ok',
    brand_id: brandId,
    principal: { role: ctx.role, profile: ctx.profile ?? null },
    reason: null,
    use_scope: useScope,
    locale,
    direction: locale === 'fa' ? 'rtl' : 'ltr',
    notice: [...text.notice],
    references: capped,
    mascot,
    creative,
    summary,
    digest,
    transport: { mcp: 'metadata_only', bytes: 'owner_local_only' },
    authorizes: [],
    permissions: { ...VISUAL_DNA_PERMISSIONS },
  }
}
