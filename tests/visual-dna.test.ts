import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import Ajv from 'ajv'
import {
  agentContext,
  agentTokenContext,
  AGENT_PROFILES,
  guestContext,
  openWorkspace,
  operatorContext,
  readAccessLog,
  type AgentProfile,
  type AuthContext,
} from '@brand-os/brand-core'
import { addVariant, createProject, recordFeedback, selectVariant } from '@brand-os/brand-core/creative'
import {
  modelUseBlocks,
  readVerifiedAsset,
  runVisualDnaTool,
  VISUAL_DNA_TEXT,
  VisualDnaError,
  type VisualDnaResult,
  type VisualReference,
} from '@brand-os/brand-core/visual-dna'
import { useTestKey } from './helpers/knowledge.js'
import { ART_ID, editAssets, fixture, IDS, OUTSIDE_CANARY, sha, SLUG, SVG, SVG_C, trackedSnapshot } from './helpers/visual-dna.js'

/**
 * Visual DNA (fixes pack PR-C): a read-only, metadata-first reference resolver over the asset manifest, the mascot
 * catalog and creative memory. Missing stays missing, nothing is invented, and bytes reach only the owner process.
 */
useTestKey()
const repo = path.resolve(import.meta.dirname, '..')
const validate = new Ajv({ allErrors: true, strict: false }).compile(JSON.parse(fs.readFileSync(path.join(repo, 'schemas/visual-dna.schema.json'), 'utf8')) as object)
const design = (slug = SLUG): AuthContext => agentTokenContext(slug, 'agt_design', 'design')
const owner = (): AuthContext => operatorContext(SLUG)

function valid(result: VisualDnaResult): VisualDnaResult {
  assert.equal(validate(result), true, JSON.stringify(validate.errors))
  assert.deepEqual(result.authorizes, [])
  assert.ok(Object.values(result.permissions).every((flag) => flag === false))
  return result
}

const ref = (result: VisualDnaResult, refId: string): VisualReference => {
  const found = result.references.find((entry) => entry.ref_id === refId)
  assert.ok(found, `${refId} in ${result.references.map((entry) => entry.ref_id).join(', ')}`)
  return found
}

test('the same approved asset resolves with checksum, rights and model_use, by id and through the mascot catalog', () => {
  const { root, engine } = fixture()
  const result = valid(runVisualDnaTool(engine, design(), { asset_ids: [IDS.mascotFront, IDS.logo], mascot: { emotion: 'celebrating', angle: 'front' } }))
  assert.equal(result.status, 'ok')
  const direct = ref(result, `asset:${IDS.mascotFront}`)
  const viaCatalog = ref(result, `mascot:${ART_ID}`)
  for (const entry of [direct, viaCatalog]) {
    assert.equal(entry.state, 'approved')
    assert.equal(entry.asset_id, IDS.mascotFront)
    assert.equal(entry.asset?.checksum_sha256, sha(SVG_C))
    assert.equal(entry.asset?.checksum_sha256, sha(fs.readFileSync(path.join(root, entry.asset!.path))))
    assert.equal(entry.asset?.size_bytes, Buffer.byteLength(SVG_C))
    assert.equal(entry.model_use, 'local_only')
    assert.deepEqual(entry.provider_gate, { local_model: 'not_blocked_by_record', external_provider: 'blocked' })
    assert.equal(entry.delivery, 'metadata_only')
    assert.equal(entry.sent_to_model, false)
    assert.equal(entry.rights?.license, 'Owned by the synthetic test brand')
  }
  assert.equal(direct.source.path, 'brand/assets/asset-manifest.yaml')
  assert.equal(viaCatalog.source.path, 'brand/mascot/catalog.yaml')
  assert.deepEqual(viaCatalog.mascot, { art_id: ART_ID, state_id: 'mascot.emotion.celebrating', emotion: 'celebrating', stage: 'example.stage.explorer', angle: 'mascot.angle.front' })
  assert.equal(result.mascot.status, 'resolved')
  // No model_use recorded means not_allowed: blocked for every model.
  const logo = ref(result, `asset:${IDS.logo}`)
  assert.equal(logo.model_use, 'not_allowed')
  assert.deepEqual(logo.provider_gate, { local_model: 'blocked', external_provider: 'blocked' })
  assert.deepEqual(result.summary, { approved: 3, withheld: 0, missing: 0, changed: 0 })
  assert.match(result.digest ?? '', /^[0-9a-f]{64}$/)
  // Deterministic for unchanged sources.
  assert.equal(runVisualDnaTool(engine, design(), { asset_ids: [IDS.mascotFront, IDS.logo], mascot: { emotion: 'celebrating', angle: 'front' } }).digest, result.digest)
})

test('a wrong mascot angle or stage is missing; no other pose or angle is substituted', () => {
  const { engine } = fixture()
  for (const mascot of [{ emotion: 'celebrating', angle: 'back' }, { emotion: 'celebrating', angle: 'left-profile' }, { emotion: 'joyful' }, { emotion: 'celebrating', stage: '9' }]) {
    const result = valid(runVisualDnaTool(engine, design(), { mascot }))
    assert.equal(result.mascot.status, 'missing', JSON.stringify(mascot))
    assert.equal(result.references.length, 1)
    const request = ref(result, 'mascot:request')
    assert.equal(request.state, 'missing')
    assert.equal(request.reason, 'no_artwork')
    assert.equal(request.asset_id, null)
    assert.equal(request.asset, null)
    assert.equal(request.model_use, 'not_allowed')
    assert.ok(result.mascot.explanation.length > 0, 'the finder explains what is missing')
    assert.ok(!JSON.stringify(result).includes(IDS.mascotFront), 'the front artwork is never offered for another angle')
  }
})

test('a disabled mascot module is not applicable and returns no reference', () => {
  const { engine } = fixture({ mascot: false })
  const result = valid(runVisualDnaTool(engine, design(), { mascot: { emotion: 'celebrating' } }))
  assert.equal(result.mascot.status, 'not_applicable')
  assert.deepEqual(result.references, [])
})

test('drafts and unknown ids look the same to an agent; the owner sees why', () => {
  const { engine } = fixture()
  const agent = valid(runVisualDnaTool(engine, design(), { asset_ids: [IDS.draft, 'asset.logo.never-registered', 'asset.mascot.turnaround'] }))
  for (const entry of agent.references) {
    assert.equal(entry.state, 'missing')
    assert.equal(entry.reason, 'not_found')
    assert.equal(entry.asset, null)
    assert.equal(entry.delivery, 'none')
  }
  const own = valid(runVisualDnaTool(engine, owner(), { asset_ids: [IDS.draft, 'asset.logo.never-registered', 'asset.mascot.turnaround'] }))
  assert.equal(ref(own, `asset:${IDS.draft}`).reason, 'not_approved')
  assert.equal(ref(own, 'asset:asset.logo.never-registered').reason, 'not_found')
  assert.equal(ref(own, 'asset:asset.mascot.turnaround').reason, 'not_present')
})

test('changed bytes, an approval for other bytes, unsafe files, missing rights and missing licence are refused', () => {
  const { engine, outside } = fixture()
  const ids = [IDS.changed, IDS.reapproved, IDS.symlink, IDS.script, IDS.noLicense, IDS.portrait, IDS.previewEscape]
  const result = valid(runVisualDnaTool(engine, design(), { asset_ids: ids }))
  const expect: Record<string, [string, string | null]> = {
    [IDS.changed]: ['changed', 'checksum_mismatch'],
    [IDS.reapproved]: ['changed', 'approved_bytes_differ'],
    [IDS.symlink]: ['withheld', 'unsafe_file'],
    [IDS.script]: ['withheld', 'unsafe_file'],
    [IDS.noLicense]: ['withheld', 'license_missing'],
    [IDS.portrait]: ['withheld', 'rights'],
    [IDS.previewEscape]: ['approved', null],
  }
  for (const [id, [state, reason]] of Object.entries(expect)) {
    const entry = ref(result, `asset:${id}`)
    assert.equal(entry.state, state, id)
    assert.equal(entry.reason, reason, id)
    if (state !== 'approved') {
      assert.equal(entry.asset, null, id)
      assert.equal(entry.model_use, 'not_allowed', id)
      assert.equal(entry.delivery, 'none', id)
    }
  }
  // A preview path that points outside the workspace is never read or echoed; the symlink target is never read.
  const text = JSON.stringify(result)
  assert.ok(!text.includes(path.dirname(outside)), 'no outside path')
  assert.ok(!text.includes(OUTSIDE_CANARY))
  assert.ok(!text.includes('/etc/') && !text.includes('..'))
})

test('access: guests, unprofiled agents and other brands are denied; profiles keep their own module limits', () => {
  const { root, engine } = fixture()
  for (const ctx of [guestContext(SLUG), agentContext(SLUG), design('another-brand'), agentTokenContext('another-brand', 'agt_x', 'creative-read')]) {
    const result = valid(runVisualDnaTool(engine, ctx, { asset_ids: [IDS.logo] }))
    assert.equal(result.status, 'denied', ctx.principal_id)
    assert.deepEqual(result.references, [])
  }
  for (const profile of Object.keys(AGENT_PROFILES) as AgentProfile[]) {
    const result = valid(runVisualDnaTool(engine, agentTokenContext(SLUG, `agt_${profile}`, profile), { asset_ids: [IDS.logo, IDS.restricted] }))
    assert.equal(result.status, 'ok', profile)
    // Restricted assets never reach an agent, whatever its profile.
    assert.equal(ref(result, `asset:${IDS.restricted}`).state, 'withheld', profile)
    // The finance profile does not cover the assets module, exactly as brand_retrieve decides.
    assert.equal(ref(result, `asset:${IDS.logo}`).state, profile === 'finance' ? 'withheld' : 'approved', profile)
  }
  // The owner process reads the restricted asset's metadata.
  assert.equal(ref(valid(runVisualDnaTool(engine, owner(), { asset_ids: [IDS.restricted] })), `asset:${IDS.restricted}`).state, 'approved')
  // One visual_dna line per call, ids only.
  const lines = readAccessLog(root).filter((line) => line.tool === 'visual_dna')
  assert.ok(lines.some((line) => line.decision === 'deny' && line.role === 'guest'))
  const last = lines.at(-1)!
  assert.equal(last.decision, 'allow')
  assert.deepEqual(last.requested_ids, [IDS.restricted])
  assert.deepEqual(last.returned_ids, [IDS.restricted])
})

test('input is strict: paths, URLs, too many ids and unknown keys are invalid', () => {
  const { engine } = fixture()
  const bad: Array<Record<string, unknown>> = [
    {},
    { asset_ids: ['brand/assets/logo/synthetic-primary.svg'] },
    { asset_ids: ['../../etc/passwd'] },
    { asset_ids: ['https://example.com/logo.svg'] },
    { asset_ids: Array.from({ length: 21 }, (_, i) => `asset.logo.x${i}`) },
    { asset_ids: 'asset.logo.synthetic-primary' },
    { mascot: { emotion: 'celebrating', pose: 'any' } },
    { mascot: { emotion: 'x'.repeat(101) } },
    { creative: { project_id: 'x', brand: 'another-brand' } },
    { asset_ids: [IDS.logo], locale: 'de' },
  ]
  for (const input of bad) {
    const result = valid(runVisualDnaTool(engine, design(), input))
    assert.equal(result.status, 'invalid', JSON.stringify(input))
    assert.deepEqual(result.references, [])
  }
})

test('creative references come only to a creative-read token, re-verified against the current file', () => {
  const { root, engine } = fixture()
  const ws = openWorkspace(root)
  createProject(ws, { project_id: 'synthetic-post-1', title: 'Synthetic posts', surface: 'post', series: 'launch', language: 'en' })
  addVariant(ws, { project_id: 'synthetic-post-1', variant_id: 'A', asset: IDS.logo })
  addVariant(ws, { project_id: 'synthetic-post-1', variant_id: 'B', asset: 'missing' })
  recordFeedback(ws, { project_id: 'synthetic-post-1', variant_id: 'B', text: 'Synthetic note: too busy.', verdict: 'reject', avoid: ['layout'] })
  recordFeedback(ws, { project_id: 'synthetic-post-1', variant_id: 'A', text: 'Synthetic note: clean layout.', verdict: 'like', keep: ['layout'] })
  selectVariant(ws, { project_id: 'synthetic-post-1', variant_id: 'A' })
  const reader = agentTokenContext(SLUG, 'agt_creative', 'creative-read')
  const ok = valid(runVisualDnaTool(engine, reader, { creative: { project_id: 'synthetic-post-1' } }))
  assert.equal(ok.creative.status, 'ok')
  const a = ref(ok, 'creative:synthetic-post-1/A')
  assert.equal(a.state, 'approved')
  assert.equal(a.asset?.checksum_sha256, sha(SVG))
  assert.deepEqual(a.creative, { project_id: 'synthetic-post-1', variant_id: 'A', role: 'selected' })
  const b = ref(ok, 'creative:synthetic-post-1/B')
  assert.equal(b.reason, 'creative_asset_missing')
  assert.equal(b.creative?.role, 'rejected')
  assert.ok(!JSON.stringify(ok).includes('too busy'), 'note text stays with creative_context')

  // Any other profile: not_authorized, and no creative reference at all.
  const other = valid(runVisualDnaTool(engine, design(), { creative: { project_id: 'synthetic-post-1' } }))
  assert.equal(other.creative.status, 'not_authorized')
  assert.deepEqual(other.references, [])

  // The asset is replaced and re-checksummed after the variant was recorded: the stale reference is `changed`.
  fs.writeFileSync(path.join(root, 'brand/assets/logo/synthetic-primary.svg'), SVG_C)
  editAssets(root, (assets) => {
    const row = assets.find((item) => item.id === IDS.logo)!
    row.checksum_sha256 = sha(SVG_C)
    row.approved_sha256 = sha(SVG_C)
  })
  const stale = valid(runVisualDnaTool(engine, reader, { creative: { project_id: 'synthetic-post-1' } }))
  const changed = ref(stale, 'creative:synthetic-post-1/A')
  assert.equal(changed.state, 'changed')
  assert.equal(changed.reason, 'creative_record_changed')
  assert.equal(changed.asset, null)
})

test('locales: fa is RTL with Persian notices, tr and en are LTR; asset data is never translated', () => {
  const { engine } = fixture()
  for (const locale of ['en', 'fa', 'tr'] as const) {
    const result = valid(runVisualDnaTool(engine, design(), { asset_ids: [IDS.logo, IDS.draft], locale }))
    assert.equal(result.direction, locale === 'fa' ? 'rtl' : 'ltr')
    assert.deepEqual(result.notice, VISUAL_DNA_TEXT[locale].notice)
    assert.equal(ref(result, `asset:${IDS.draft}`).reason_text, VISUAL_DNA_TEXT[locale].reasons.not_found)
    assert.equal(ref(result, `asset:${IDS.logo}`).rights?.license, 'Owned by the synthetic test brand')
  }
  assert.match(VISUAL_DNA_TEXT.fa.notice[0]!, /[؀-ۿ]/)
  for (const locale of ['fa', 'tr'] as const) {
    assert.deepEqual(Object.keys(VISUAL_DNA_TEXT[locale].reasons).sort(), Object.keys(VISUAL_DNA_TEXT.en.reasons).sort())
    for (const key of ['states', 'sections', 'labels'] as const) assert.deepEqual(Object.keys(VISUAL_DNA_TEXT[locale][key]).sort(), Object.keys(VISUAL_DNA_TEXT.en[key]).sort(), `${locale} ${key}`)
    assert.equal(VISUAL_DNA_TEXT[locale].notice.length, VISUAL_DNA_TEXT.en.notice.length)
  }
})

test('the resolver writes nothing a reader can see', () => {
  const { root, engine } = fixture()
  const before = trackedSnapshot(root)
  runVisualDnaTool(engine, design(), { asset_ids: Object.values(IDS), mascot: { emotion: 'celebrating' } })
  runVisualDnaTool(engine, owner(), { asset_ids: Object.values(IDS) })
  assert.deepEqual(trackedSnapshot(root), before)
})

test('model_use: a renderer is not a model; local_only never reaches an external provider', () => {
  assert.equal(modelUseBlocks('not_allowed', 'renderer'), false)
  assert.equal(modelUseBlocks('not_allowed', 'local_model'), true)
  assert.equal(modelUseBlocks('not_allowed', 'external_provider'), true)
  assert.equal(modelUseBlocks('local_only', 'local_model'), false)
  assert.equal(modelUseBlocks('local_only', 'external_provider'), true)
  assert.equal(modelUseBlocks('external_allowed', 'external_provider'), false)
})

test('owner-local read: one checked asset, the exact bytes, and only for a use its model_use allows', () => {
  const { engine } = fixture()
  const delivered = readVerifiedAsset(engine, owner(), IDS.mascotFront, 'local_model')
  assert.equal(delivered.status, 'delivered')
  assert.equal(delivered.bytes.toString('utf8'), SVG_C)
  assert.equal(delivered.sha256, sha(SVG_C))
  assert.equal(delivered.sent_to_model, false)
  assert.equal(delivered.upload_authorized, false)
  assert.deepEqual(delivered.authorizes, [])
  assert.equal(readVerifiedAsset(engine, owner(), IDS.logo, 'renderer').bytes.toString('utf8'), SVG)

  const refuse = (id: string, use: 'renderer' | 'local_model' | 'external_provider', code: string, ctx = owner()) =>
    assert.throws(() => readVerifiedAsset(engine, ctx, id, use), (error: unknown) => error instanceof VisualDnaError && error.code === code, `${id} ${use}`)
  // An external model cannot receive local_only art; not_allowed art reaches no model at all.
  refuse(IDS.mascotFront, 'external_provider', 'model_use')
  refuse(IDS.logo, 'local_model', 'model_use')
  refuse(IDS.logo, 'external_provider', 'model_use')
  // external_allowed passes the record check, but nothing is uploaded and no upload is authorized.
  const external = readVerifiedAsset(engine, owner(), IDS.external, 'external_provider')
  assert.equal(external.upload_authorized, false)
  assert.deepEqual(external.permissions, { publish: false, schedule: false, spend: false, deploy: false, approve: false, upload: false })
  // Unsafe, changed and unapproved files are never read.
  refuse(IDS.symlink, 'renderer', 'unsafe_file')
  refuse(IDS.script, 'renderer', 'unsafe_file')
  refuse(IDS.changed, 'renderer', 'changed')
  refuse(IDS.reapproved, 'renderer', 'changed')
  refuse(IDS.draft, 'renderer', 'not_approved')
  refuse('brand/assets/logo/synthetic-primary.svg', 'renderer', 'invalid_input')
  // Agents never receive bytes, whatever their profile.
  for (const profile of Object.keys(AGENT_PROFILES) as AgentProfile[]) refuse(IDS.logo, 'renderer', 'owner_only', agentTokenContext(SLUG, `agt_${profile}`, profile))
  refuse(IDS.logo, 'renderer', 'owner_only', guestContext(SLUG))
})
