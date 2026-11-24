import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { assetPathIsSafe, patchManifestAsset, svgPublicationIssues } from '@brand-os/asset-catalog'
import { parse } from 'yaml'
import { approvalProofMatches } from './private-store.js'

export type AssetApprovalOutcome = 'approved' | 'unchanged' | 'refused' | 'unknown'

export interface AssetApprovalResult {
  ok: boolean
  proof: 'accepted' | 'rejected'
  changed: number
  results: Array<{ id: string; outcome: AssetApprovalOutcome; reason: string; sha256?: string }>
}

/**
 * `brand:assets approve`: the owner approves the exact bytes of an asset. Records status approved,
 * approved_by, approved_at and approved_sha256, so any later change to the file (including
 * normalizing it) no longer counts as approved unless the approval is carried by a pixel-identical
 * render check. Needs the owner proof; never takes it from argv; an agent never runs it.
 */
export function approveAssets(root: string, ids: string[], proof: string | undefined, actor = 'owner', now: () => Date = () => new Date()): AssetApprovalResult {
  const result: AssetApprovalResult = { ok: false, proof: 'rejected', changed: 0, results: [] }
  if (!approvalProofMatches(root, proof)) return result
  result.proof = 'accepted'
  const manifestFile = path.join(root, 'brand', 'assets', 'asset-manifest.yaml')
  for (const id of ids) {
    const manifest = parse(fs.readFileSync(manifestFile, 'utf8')) as { assets?: Array<Record<string, unknown>> }
    const asset = (manifest.assets ?? []).find((item) => item.id === id)
    if (!asset) {
      result.results.push({ id, outcome: 'unknown', reason: 'No asset with this id.' })
      continue
    }
    const assetPath = typeof asset.path === 'string' ? asset.path : ''
    const full = path.join(root, assetPath)
    if (asset.present !== true || !assetPathIsSafe(root, assetPath) || !fs.existsSync(full) || fs.lstatSync(full).isSymbolicLink()) {
      result.results.push({ id, outcome: 'refused', reason: 'The file is not present in brand/assets. A missing asset cannot be approved.' })
      continue
    }
    const bytes = fs.readFileSync(full)
    const sha = createHash('sha256').update(bytes).digest('hex')
    if (typeof asset.checksum_sha256 !== 'string' || asset.checksum_sha256 !== sha) {
      result.results.push({ id, outcome: 'refused', reason: 'checksum_sha256 in the manifest does not match the file. Fix the manifest in a reviewed edit first.' })
      continue
    }
    if (assetPath.toLowerCase().endsWith('.svg')) {
      const issues = svgPublicationIssues(bytes.toString('utf8'))
      if (issues.length > 0) {
        const fixable = issues.every((issue) => issue.fixable)
        result.results.push({ id, outcome: 'refused', reason: `The SVG fails the check (${issues[0]!.code}). ${fixable ? `Run npm run brand:assets -- normalize ${id} first.` : 'Fix the source file and export it again.'}` })
        continue
      }
    }
    const status = typeof asset.status === 'string' ? asset.status : 'draft'
    if ((status === 'approved' || status === 'published') && asset.approved_sha256 === sha) {
      result.results.push({ id, outcome: 'unchanged', reason: 'Already approved with these bytes.', sha256: sha })
      continue
    }
    patchManifestAsset(root, id, {
      status: status === 'published' ? 'published' : 'approved',
      approved_by: actor,
      approved_at: now().toISOString(),
      approved_sha256: sha,
      approval_carried_from: undefined,
      approval_reset: undefined,
    })
    result.results.push({ id, outcome: 'approved', reason: 'Approved these exact bytes. Not published.', sha256: sha })
    result.changed += 1
  }
  result.ok = result.results.every((item) => item.outcome === 'approved' || item.outcome === 'unchanged')
  return result
}
