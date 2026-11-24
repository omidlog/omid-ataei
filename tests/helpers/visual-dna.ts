import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse, stringify } from 'yaml'
import { applyInit, InterviewEngine, writeStarterWorkspace } from '@brand-os/brand-core'

/**
 * A temporary, SYNTHETIC brand for Visual DNA tests. No real brand data: every name, file and licence is invented.
 * Mascot enabled; assets registered for each verdict the resolver must produce.
 */

const repo = path.resolve(import.meta.dirname, '..', '..')

export const SLUG = 'synthetic-dna'
export const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><title>synthetic</title><rect width="10" height="10" fill="#123A73"/></svg>\n'
export const SVG_B = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><title>synthetic b</title><circle cx="5" cy="5" r="4" fill="#0A7A5A"/></svg>\n'
export const SVG_C = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><title>synthetic c</title><rect x="2" y="2" width="6" height="6" fill="#7A0A3A"/></svg>\n'
export const SCRIPT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10"/></svg>\n'
export const OUTSIDE_CANARY = 'OUTSIDE-WORKSPACE-CANARY-do-not-read'

export const IDS = {
  logo: 'asset.logo.synthetic-primary',
  external: 'asset.logo.synthetic-external',
  mascotFront: 'asset.mascot.synthetic-celebrating-front',
  draft: 'asset.logo.synthetic-draft',
  changed: 'asset.logo.synthetic-changed',
  reapproved: 'asset.logo.synthetic-approval-differs',
  symlink: 'asset.icon.synthetic-symlink',
  script: 'asset.icon.synthetic-script',
  noLicense: 'asset.icon.synthetic-no-license',
  portrait: 'asset.photo.synthetic-portrait',
  restricted: 'asset.logo.synthetic-restricted',
  previewEscape: 'asset.icon.synthetic-preview-escape',
} as const

export const ART_ID = 'mascot.emotion.celebrating.synthetic.front'
const CELEBRATING = 'mascot.emotion.celebrating'

type Row = Record<string, unknown>
const sha = (text: string | Buffer): string => crypto.createHash('sha256').update(text).digest('hex')

function readYaml<T>(root: string, relative: string): T {
  return parse(fs.readFileSync(path.join(root, relative), 'utf8')) as T
}

function writeYaml(root: string, relative: string, data: unknown): void {
  fs.writeFileSync(path.join(root, relative), stringify(data, { lineWidth: 120 }))
}

export function editAssets(root: string, edit: (assets: Row[]) => void): void {
  const manifest = readYaml<{ schema_version: number; assets: Row[] }>(root, 'brand/assets/asset-manifest.yaml')
  edit(manifest.assets)
  writeYaml(root, 'brand/assets/asset-manifest.yaml', manifest)
}

function file(root: string, relative: string, content: string): string {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true })
  fs.writeFileSync(path.join(root, relative), content)
  return sha(content)
}

function approved(id: string, assetPath: string, checksum: string, extra: Row = {}): Row {
  return {
    id,
    name: `Synthetic ${id}`,
    status: 'approved',
    owner: 'design',
    version: '1.0.0',
    visibility: 'internal',
    license: 'Owned by the synthetic test brand',
    usage: 'Test reference only.',
    restrictions: 'Synthetic fixture.',
    path: assetPath,
    present: true,
    checksum_sha256: checksum,
    approved_sha256: checksum,
    mime: 'image/svg+xml',
    ...extra,
  }
}

export interface Fixture {
  root: string
  engine: InterviewEngine
  /** A file outside the workspace that must never be read. */
  outside: string
}

export function fixture(opts: { mascot?: boolean } = {}): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-visual-dna-'))
  writeStarterWorkspace(root)
  fs.cpSync(path.join(repo, 'schemas'), path.join(root, 'schemas'), { recursive: true })
  fs.cpSync(path.join(repo, 'brand/tokens'), path.join(root, 'brand/tokens'), { recursive: true })
  fs.copyFileSync(path.join(repo, '.gitignore'), path.join(root, '.gitignore'))
  applyInit(root, { name: 'Synthetic DNA Brand', slug: SLUG, industry: 'education', language: 'en', languages: ['en', 'fa', 'tr'], mascot: opts.mascot ?? true, gamification: false, publish: 'public' })

  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-visual-dna-outside-'))
  const outside = path.join(outsideDir, 'secret.svg')
  fs.writeFileSync(outside, SVG.replace('synthetic', OUTSIDE_CANARY))

  const rows: Row[] = []
  rows.push(approved(IDS.logo, 'brand/assets/logo/synthetic-primary.svg', file(root, 'brand/assets/logo/synthetic-primary.svg', SVG)))
  rows.push(approved(IDS.external, 'brand/assets/logo/synthetic-external.svg', file(root, 'brand/assets/logo/synthetic-external.svg', SVG_B), { model_use: 'external_allowed' }))
  rows.push(approved(IDS.mascotFront, 'brand/assets/mascot/synthetic-celebrating-front.svg', file(root, 'brand/assets/mascot/synthetic-celebrating-front.svg', SVG_C), { model_use: 'local_only' }))
  rows.push({ ...approved(IDS.draft, 'brand/assets/logo/synthetic-draft.svg', file(root, 'brand/assets/logo/synthetic-draft.svg', SVG)), status: 'draft', approved_sha256: null })
  const changedSha = file(root, 'brand/assets/logo/synthetic-changed.svg', SVG)
  rows.push(approved(IDS.changed, 'brand/assets/logo/synthetic-changed.svg', changedSha))
  fs.writeFileSync(path.join(root, 'brand/assets/logo/synthetic-changed.svg'), SVG_B) // bytes replaced after approval
  rows.push(approved(IDS.reapproved, 'brand/assets/logo/synthetic-approval-differs.svg', file(root, 'brand/assets/logo/synthetic-approval-differs.svg', SVG_B), { approved_sha256: sha(SVG) }))
  fs.mkdirSync(path.join(root, 'brand/assets/icons'), { recursive: true })
  fs.symlinkSync(outside, path.join(root, 'brand/assets/icons/synthetic-symlink.svg'))
  rows.push(approved(IDS.symlink, 'brand/assets/icons/synthetic-symlink.svg', sha(fs.readFileSync(outside))))
  rows.push(approved(IDS.script, 'brand/assets/icons/synthetic-script.svg', file(root, 'brand/assets/icons/synthetic-script.svg', SCRIPT_SVG)))
  rows.push(approved(IDS.noLicense, 'brand/assets/icons/synthetic-no-license.svg', file(root, 'brand/assets/icons/synthetic-no-license.svg', SVG), { license: 'TBD' }))
  rows.push(approved(IDS.portrait, 'brand/assets/photography/synthetic-portrait.svg', file(root, 'brand/assets/photography/synthetic-portrait.svg', SVG), { subject: 'portrait' }))
  rows.push(approved(IDS.restricted, 'brand/assets/logo/synthetic-restricted.svg', file(root, 'brand/assets/logo/synthetic-restricted.svg', SVG), { visibility: 'restricted' }))
  rows.push(approved(IDS.previewEscape, 'brand/assets/icons/synthetic-preview.svg', file(root, 'brand/assets/icons/synthetic-preview.svg', SVG), { preview: `../../../..${outside}` }))
  editAssets(root, (assets) => assets.push(...rows))

  if (opts.mascot ?? true) {
    const doc = readYaml<{ schema_version: number; states: Row[] }>(root, 'brand/mascot/catalog.yaml')
    const state = doc.states.find((item) => item.id === CELEBRATING)
    assert.ok(state, CELEBRATING)
    state.status = 'approved'
    state.artwork = [
      { id: ART_ID, stage: 'example.stage.explorer', angle: 'mascot.angle.front', asset_id: IDS.mascotFront, status: 'approved', version: '1.0.0', license: { holder: 'Synthetic DNA Brand', terms: 'Owned outright' } },
    ]
    writeYaml(root, 'brand/mascot/catalog.yaml', doc)
  }
  return { root, engine: new InterviewEngine(root), outside }
}

/** Hash of every file under brand/ except brand/.private/: what Git, Studio and builds can see. */
export function trackedSnapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      const rel = path.relative(root, full).split(path.sep).join('/')
      if (rel === 'brand/.private') continue
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) out[rel] = sha(fs.readFileSync(full))
    }
  }
  walk(path.join(root, 'brand'))
  return out
}

export { sha }
