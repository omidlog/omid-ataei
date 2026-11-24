import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { parse } from 'yaml'
import { applyInit, writeStarterWorkspace } from '@brand-os/brand-core'
import { validateAssets } from '@brand-os/asset-catalog'
import { addAsset, pruneExampleAssets } from '@brand-os/asset-catalog/manage'
import type { ProjectionAsset } from '../apps/studio/src/projection.js'

/**
 * BOS-03 `brand:assets add` and BOS-12 `brand:assets prune-examples`: nobody edits asset-manifest.yaml by hand, the
 * record is always a draft that passes validation, an unsafe SVG is never written, and template placeholders leave
 * only when a real approved asset of their kind exists or their module is off.
 */
process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const CLEAN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10"><rect width="40" height="10" fill="#222222"/></svg>\n'
/** An editor export: a raster wrapped in <use>, a url(#id) to a missing id and a blend mode in a style attribute. */
const WRAPPED = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><defs><image id="r" width="10" height="10" xlink:href="data:image/png;base64,${PNG.toString('base64')}"/></defs><use xlink:href="#r"/><rect width="5" height="5" fill="url(#gone)" style="mix-blend-mode:multiply"/></svg>\n`
/** Only a comment: the normalizer can fix it without touching the drawing. */
const COMMENTED = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10"><!-- exported --><rect width="40" height="10" fill="#222222"/></svg>\n'

function workspace(mascot = false): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-asset-manage-'))
  writeStarterWorkspace(root)
  applyInit(root, { name: 'Asset Brand', slug: 'asset-brand', industry: 'design', language: 'en', languages: ['en'], mascot, gamification: false, publish: 'private' })
  return root
}

function input(name: string, body: string | Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-asset-in-'))
  fs.writeFileSync(path.join(dir, name), body)
  return path.join(dir, name)
}

const manifest = (root: string) => (parse(fs.readFileSync(path.join(root, 'brand/assets/asset-manifest.yaml'), 'utf8')) as { assets: Array<Record<string, unknown>> }).assets

test('add: a clean SVG becomes a draft record with checksum and media type that passes validation', async () => {
  const root = workspace()
  try {
    const before = fs.readFileSync(path.join(root, 'brand/assets/asset-manifest.yaml'), 'utf8')
    const report = await addAsset(root, input('lumen-wordmark-black.svg', CLEAN), { id: 'asset.logo.wordmark-dark', name: 'Wordmark (dark)', tags: ['wordmark', 'on-light'], visibility: 'public' })
    assert.equal(report.ok, true, JSON.stringify(report))
    assert.equal(report.outcome, 'added')
    assert.equal(report.path, 'brand/assets/logo/lumen-wordmark-black.svg')
    assert.equal(report.verdict?.publishable, true)
    assert.equal(report.check?.ok, true)
    assert.deepEqual(report.validation, [])
    const record = manifest(root).find((asset) => asset.id === 'asset.logo.wordmark-dark')!
    assert.equal(record.status, 'draft', 'never approved by add')
    assert.equal(record.checksum_sha256, crypto.createHash('sha256').update(CLEAN).digest('hex'))
    assert.equal(record.mime, 'image/svg+xml')
    assert.deepEqual(record.tags, ['logo', 'wordmark', 'on-light'])
    assert.equal(record.approved_sha256, undefined)
    assert.ok(fs.readFileSync(path.join(root, 'brand/assets/asset-manifest.yaml'), 'utf8').startsWith(before.trimEnd()), 'the rest of the manifest is untouched')
    assert.deepEqual(validateAssets(root), [])
    // The same id, or another id over the same file name with other bytes, is refused; nothing is overwritten.
    assert.equal((await addAsset(root, input('x.svg', CLEAN), { id: 'asset.logo.wordmark-dark', name: 'Again' })).outcome, 'refused')
    const clash = await addAsset(root, input('lumen-wordmark-black.svg', CLEAN.replace('#222222', '#333333')), { id: 'asset.logo.other', name: 'Other' })
    assert.equal(clash.outcome, 'refused')
    assert.match(clash.reason, /already exists with different content/)
    assert.equal(fs.readFileSync(path.join(root, 'brand/assets/logo/lumen-wordmark-black.svg'), 'utf8'), CLEAN)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('add: an SVG that fails the publication check is not written; the reasons and the fixes are given', async () => {
  const root = workspace()
  try {
    const before = fs.readFileSync(path.join(root, 'brand/assets/asset-manifest.yaml'), 'utf8')
    const report = await addAsset(root, input('key.svg', WRAPPED), { id: 'asset.icon.key', name: 'Key icon' })
    assert.equal(report.ok, false)
    assert.equal(report.outcome, 'refused')
    const codes = report.verdict!.issues.map((issue) => issue.code)
    for (const code of ['use', 'image', 'missing-reference', 'style-attribute']) assert.ok(codes.includes(code as never), `${code} in ${codes.join(',')}`)
    assert.ok(report.fixes!.some((fix) => fix.includes('--render png --size 1024')))
    assert.equal(fs.readFileSync(path.join(root, 'brand/assets/asset-manifest.yaml'), 'utf8'), before, 'manifest unchanged')
    assert.equal(fs.existsSync(path.join(root, 'brand/assets/icons/key.svg')), false, 'no file written')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('add --render png: the SVG is kept in brand/assets-src, a PNG of the asked width is the asset, derived_from is recorded', async () => {
  const root = workspace()
  try {
    const report = await addAsset(root, input('key.svg', WRAPPED), { id: 'asset.icon.key', name: 'Key icon', render: 'png', size: 256 })
    assert.equal(report.ok, true, JSON.stringify(report))
    assert.equal(report.path, 'brand/assets/icons/key.png')
    assert.equal(report.original, 'brand/assets-src/icons/key.svg')
    const png = fs.readFileSync(path.join(root, 'brand/assets/icons/key.png'))
    assert.equal(png.toString('ascii', 1, 4), 'PNG')
    assert.equal(png.readUInt32BE(16), 256, 'rendered at the asked width')
    const record = manifest(root).find((asset) => asset.id === 'asset.icon.key')!
    assert.equal(record.mime, 'image/png')
    assert.deepEqual(record.derived_from, { path: 'brand/assets-src/icons/key.svg', sha256: crypto.createHash('sha256').update(WRAPPED).digest('hex') })
    assert.equal((record.normalizer as { name: string }).name, 'brand-os-svg-render')
    assert.equal(report.verdict?.publishable, true)
    assert.deepEqual(validateAssets(root), [])
    assert.equal((await addAsset(root, input('photo.png', PNG), { id: 'asset.icon.p', name: 'P', render: 'png' })).outcome, 'refused', 'only an SVG is rendered')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('add --normalize: a fixable SVG is normalized at ingest with its original kept', async () => {
  const root = workspace()
  try {
    const refused = await addAsset(root, input('mark.svg', COMMENTED), { id: 'asset.logo.mark', name: 'Mark' })
    assert.equal(refused.outcome, 'refused')
    assert.ok(refused.fixes!.some((fix) => fix.includes('--normalize')))
    const report = await addAsset(root, input('mark.svg', COMMENTED), { id: 'asset.logo.mark', name: 'Mark', normalize: true })
    assert.equal(report.ok, true, JSON.stringify(report))
    assert.equal(report.original, 'brand/assets-src/logo/mark.svg')
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'brand/assets/logo/mark.svg'), 'utf8'), /<!--/)
    assert.deepEqual(validateAssets(root), [])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('prune-examples: only once a real approved asset of the kind exists, or the module is off', async () => {
  const root = workspace(false)
  try {
    const ids = () => manifest(root).map((asset) => String(asset.id))
    // Nothing approved yet: the logo and icon examples stay; the mascot module is off, so its placeholders go.
    const dry = pruneExampleAssets(root, { dryRun: true, modules: { mascot: false } })
    const outcome = (id: string) => dry.items.find((item) => item.id === id)?.outcome
    assert.equal(outcome('asset.logo.example-wordmark'), 'kept')
    assert.equal(outcome('asset.icon.example-mark'), 'kept')
    assert.equal(outcome('asset.mascot.placeholder-frame'), 'would-remove')
    assert.ok(ids().includes('asset.mascot.placeholder-frame'), 'dry run changes nothing')

    // A real logo, approved: the logo example goes with its file; the icon example stays.
    await addAsset(root, input('wordmark.svg', CLEAN), { id: 'asset.logo.wordmark', name: 'Wordmark' })
    const file = path.join(root, 'brand/assets/asset-manifest.yaml')
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/(id: asset\.logo\.wordmark\n(?:.*\n)*?\s+status: )draft/, '$1approved'))
    const report = pruneExampleAssets(root, { modules: { mascot: false } })
    assert.equal(report.items.find((item) => item.id === 'asset.logo.example-wordmark')?.outcome, 'removed')
    assert.equal(fs.existsSync(path.join(root, 'brand/assets/logo/example-wordmark.svg')), false)
    assert.ok(ids().includes('asset.icon.example-mark'))
    assert.ok(!ids().includes('asset.logo.example-wordmark'))
    assert.ok(!ids().some((id) => id.startsWith('asset.mascot.')), 'mascot placeholders and empty slots removed while the module is off')
    assert.ok(ids().includes('asset.logo.wordmark'))
    assert.deepEqual(validateAssets(root), [], 'validate passes after the prune')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('prune-examples: a modified placeholder file is kept, and a mascot-on brand keeps its slots', () => {
  const root = workspace(true)
  try {
    fs.writeFileSync(path.join(root, 'brand/assets/mascot/placeholder-frame.svg'), CLEAN)
    const report = pruneExampleAssets(root, { modules: { mascot: true } })
    assert.equal(report.items.find((item) => item.id === 'asset.mascot.placeholder-frame')?.outcome, 'kept')
    assert.equal(report.items.some((item) => item.id === 'asset.mascot.turnaround'), false, 'a slot is not a placeholder while the module is on')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('Studio gallery: real approved assets first, examples hidden once a real one of the kind exists, mascot hidden when off', async () => {
  const { galleryAssets } = await import('../apps/studio/src/views/pages.js')
  const row = (id: string, kind: string, extra: Partial<ProjectionAsset> = {}): ProjectionAsset => ({ id, name: id, kind, status: 'draft', visibility: 'public', license: null, usage: null, restrictions: null, approved: false, published: false, preview_key: null, preview_state: null, mime: null, unavailable_reason: null, example: false, ...extra })
  const assets = [
    row('asset.logo.example-wordmark', 'logo', { example: true }),
    row('asset.icon.example-mark', 'icons', { example: true }),
    row('asset.mascot.placeholder-frame', 'mascot', { example: true }),
    row('asset.mascot.turnaround', 'mascot', { unavailable_reason: 'not_present' }),
    row('asset.mascot.stage-1', 'mascot'),
    row('asset.illustration.example', 'illustrations', { license: 'EXAMPLE-ONLY' }),
    row('asset.logo.draft', 'logo'),
    row('asset.logo.wordmark-dark', 'logo', { approved: true, status: 'approved' }),
    row('asset.icon.key', 'icons', { approved: true, published: true, status: 'approved' }),
  ]
  const off = galleryAssets(assets, false)
  assert.deepEqual(off.shown.map((asset) => asset.id), ['asset.icon.key', 'asset.logo.wordmark-dark', 'asset.mascot.stage-1', 'asset.illustration.example', 'asset.logo.draft'])
  assert.equal(off.hiddenExamples, 2)
  assert.equal(off.hiddenMascot, 2)
  const on = galleryAssets(assets, true)
  assert.ok(on.shown.some((asset) => asset.id === 'asset.mascot.placeholder-frame'), 'no approved mascot yet: its placeholder stays, last')
  assert.equal(on.shown.at(-1)?.example, true)
})
