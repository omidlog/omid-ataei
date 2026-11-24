import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import Ajv from 'ajv'
import { agentTokenContext, operatorContext, rightsBlocker, type AuthContext } from '@brand-os/brand-core'
import { runVisualDnaTool, type VisualDnaResult, type VisualReference } from '@brand-os/brand-core/visual-dna'
import { useTestKey } from './helpers/knowledge.js'
import { editAssets, fixture, IDS, sha, SLUG, SVG, SVG_B } from './helpers/visual-dna.js'

/**
 * Visual DNA owner policy decisions (2026-11-23), on the synthetic fixture only:
 * 1. the brand's own logo/marks need no recorded licence; third-party assets still do;
 * 2. internal-scope rights cover internal use of a portrait, never public use;
 * 3. manifest status `published` counts as approved, with every other check still applied.
 */
useTestKey()
const repo = path.resolve(import.meta.dirname, '..')
const validate = new Ajv({ allErrors: true, strict: false }).compile(JSON.parse(fs.readFileSync(path.join(repo, 'schemas/visual-dna.schema.json'), 'utf8')) as object)
const design = (): AuthContext => agentTokenContext(SLUG, 'agt_design', 'design')
const owner = (): AuthContext => operatorContext(SLUG)

function valid(result: VisualDnaResult): VisualDnaResult {
  assert.equal(validate(result), true, JSON.stringify(validate.errors))
  assert.equal(result.status, 'ok', result.reason ?? '')
  assert.deepEqual(result.authorizes, [])
  assert.ok(Object.values(result.permissions).every((flag) => flag === false))
  return result
}

const only = (result: VisualDnaResult): VisualReference => {
  assert.equal(result.references.length, 1)
  return result.references[0]!
}

function setAsset(root: string, id: string, patch: Record<string, unknown>): void {
  editAssets(root, (assets) => {
    const row = assets.find((asset) => asset.id === id)
    assert.ok(row, id)
    Object.assign(row, patch)
  })
}

test('published manifest status is approved-equivalent for an agent and the owner', () => {
  const { root, engine } = fixture()
  setAsset(root, IDS.logo, { status: 'published' })
  for (const ctx of [design(), owner()]) {
    const entry = only(valid(runVisualDnaTool(engine, ctx, { asset_ids: [IDS.logo] })))
    assert.equal(entry.state, 'approved', ctx.role)
    assert.equal(entry.reason, null)
    assert.equal(entry.asset?.checksum_sha256, sha(SVG))
  }
})

test('published status is still subject to the byte checks: replaced bytes and an approval for other bytes are changed', () => {
  const { root, engine } = fixture()
  setAsset(root, IDS.changed, { status: 'published' })
  setAsset(root, IDS.reapproved, { status: 'published' })
  for (const ctx of [design(), owner()]) {
    const result = valid(runVisualDnaTool(engine, ctx, { asset_ids: [IDS.changed, IDS.reapproved] }))
    const [changed, reapproved] = result.references
    assert.deepEqual([changed?.state, changed?.reason], ['changed', 'checksum_mismatch'], ctx.role)
    assert.deepEqual([reapproved?.state, reapproved?.reason], ['changed', 'approved_bytes_differ'], ctx.role)
    assert.equal(changed?.asset, null)
    assert.equal(reapproved?.asset, null)
  }
  // A published asset whose file is replaced after it resolved becomes changed on the next call.
  setAsset(root, IDS.logo, { status: 'published' })
  assert.equal(only(valid(runVisualDnaTool(engine, design(), { asset_ids: [IDS.logo] }))).state, 'approved')
  fs.writeFileSync(path.join(root, 'brand/assets/logo/synthetic-primary.svg'), SVG_B)
  assert.deepEqual(
    (({ state, reason }) => [state, reason])(only(valid(runVisualDnaTool(engine, owner(), { asset_ids: [IDS.logo] })))),
    ['changed', 'checksum_mismatch'],
  )
})

test('draft and other non-approved statuses stay missing; only approved and published count', () => {
  const { root, engine } = fixture()
  for (const status of ['draft', 'review', 'retired', 'Published', 'PUBLISHED']) {
    setAsset(root, IDS.logo, { status })
    assert.deepEqual(
      (({ state, reason }) => [state, reason])(only(valid(runVisualDnaTool(engine, design(), { asset_ids: [IDS.logo] })))),
      ['missing', 'not_found'],
      status,
    )
    assert.equal(only(valid(runVisualDnaTool(engine, owner(), { asset_ids: [IDS.logo] }))).reason, 'not_approved', status)
  }
})

test("the brand's own logo with an empty or TBD licence is approved, with license_basis own_brand_mark", () => {
  const { root, engine } = fixture()
  // The fixture logo id is asset.logo.*; a tagged mark under another id counts too.
  setAsset(root, IDS.external, { license: 'TBD' })
  setAsset(root, IDS.previewEscape, { license: '', tags: ['wordmark'] })
  setAsset(root, IDS.logo, { license: undefined })
  for (const ctx of [design(), owner()]) {
    const result = valid(runVisualDnaTool(engine, ctx, { asset_ids: [IDS.logo, IDS.external, IDS.previewEscape] }))
    for (const entry of result.references) {
      assert.equal(entry.state, 'approved', `${entry.ref_id} ${ctx.role}`)
      assert.equal(entry.rights?.license_basis, 'own_brand_mark', entry.ref_id)
    }
  }
  // The licence field reports what the manifest says; nothing is invented for it.
  const raw = valid(runVisualDnaTool(engine, design(), { asset_ids: [IDS.logo, IDS.external] })).references.map((entry) => entry.rights?.license)
  assert.deepEqual(raw, [null, 'TBD'])
  // A recorded licence is reported as recorded.
  const recorded = only(valid(runVisualDnaTool(engine, design(), { asset_ids: [IDS.mascotFront] })))
  assert.equal(recorded.state, 'approved')
  assert.equal(recorded.rights?.license_basis, 'recorded')
})

test('third-party assets with an empty or TBD licence stay withheld, including third-party logos', () => {
  const { root, engine } = fixture()
  // An icon is not a mark (the fixture icon already has license TBD).
  setAsset(root, IDS.logo, { license: 'TBD', tags: ['logo', 'third-party'] })
  setAsset(root, IDS.external, { license: 'TBD', tags: ['logo', 'partner'] })
  setAsset(root, IDS.previewEscape, { license: 'tbd', subject: 'client_logo', rights: { status: 'granted', scope: 'public', holder: 'Synthetic Client Co' } })
  setAsset(root, IDS.mascotFront, { license: 'unknown' })
  const ids = [IDS.noLicense, IDS.logo, IDS.external, IDS.previewEscape, IDS.mascotFront]
  for (const ctx of [design(), owner()]) {
    const result = valid(runVisualDnaTool(engine, ctx, { asset_ids: ids }))
    for (const entry of result.references) {
      assert.deepEqual([entry.state, entry.reason], ['withheld', 'license_missing'], `${entry.ref_id} ${ctx.role}`)
      assert.equal(entry.asset, null)
      assert.equal(entry.rights, null)
    }
  }
})

test('the own-mark exemption does not skip any other check', () => {
  const { root, engine } = fixture()
  setAsset(root, IDS.changed, { license: 'TBD' })
  setAsset(root, IDS.reapproved, { license: 'TBD' })
  setAsset(root, IDS.draft, { license: 'TBD' })
  const result = valid(runVisualDnaTool(engine, design(), { asset_ids: [IDS.changed, IDS.reapproved, IDS.draft] }))
  assert.deepEqual(
    result.references.map((entry) => [entry.state, entry.reason]),
    [
      ['changed', 'checksum_mismatch'],
      ['changed', 'approved_bytes_differ'],
      ['missing', 'not_found'],
    ],
  )
})

const INTERNAL_RIGHTS = { status: 'granted', scope: 'internal', holder: 'Synthetic Person' }

test('a portrait with internal-scope rights is approved for internal use and withheld for public use', () => {
  const { root, engine } = fixture()
  setAsset(root, IDS.portrait, { rights: INTERNAL_RIGHTS })
  for (const ctx of [design(), owner()]) {
    const internal = valid(runVisualDnaTool(engine, ctx, { asset_ids: [IDS.portrait], use_scope: 'internal' }))
    assert.equal(internal.use_scope, 'internal')
    const entry = only(internal)
    assert.equal(entry.state, 'approved', ctx.role)
    assert.equal(entry.rights?.rights_subject, 'portrait')
    for (const input of [{ asset_ids: [IDS.portrait], use_scope: 'public' }, { asset_ids: [IDS.portrait] }]) {
      const pub = valid(runVisualDnaTool(engine, ctx, input))
      assert.equal(pub.use_scope, 'public', 'public is the default')
      assert.deepEqual((({ state, reason }) => [state, reason])(only(pub)), ['withheld', 'rights'], ctx.role)
    }
  }
})

test('public-scope rights cover both uses; missing, pending, expired or holderless rights cover neither', () => {
  const { root, engine } = fixture()
  setAsset(root, IDS.portrait, { rights: { ...INTERNAL_RIGHTS, scope: 'public' } })
  for (const use_scope of ['internal', 'public'] as const) {
    assert.equal(only(valid(runVisualDnaTool(engine, design(), { asset_ids: [IDS.portrait], use_scope }))).state, 'approved', use_scope)
  }
  for (const rights of [null, { ...INTERNAL_RIGHTS, status: 'pending' }, { ...INTERNAL_RIGHTS, expires: '2020-01-01' }, { status: 'granted', scope: 'internal' }]) {
    setAsset(root, IDS.portrait, { rights })
    for (const use_scope of ['internal', 'public'] as const) {
      const entry = only(valid(runVisualDnaTool(engine, design(), { asset_ids: [IDS.portrait], use_scope })))
      assert.deepEqual([entry.state, entry.reason], ['withheld', 'rights'], `${JSON.stringify(rights)} ${use_scope}`)
    }
  }
})

test('use_scope is strict and a public-only reading leaves the publication gate unchanged', () => {
  const { root, engine } = fixture()
  setAsset(root, IDS.portrait, { rights: INTERNAL_RIGHTS })
  for (const use_scope of ['private', 'INTERNAL', 1, null]) {
    const result = runVisualDnaTool(engine, design(), { asset_ids: [IDS.portrait], use_scope })
    assert.equal(validate(result), true, JSON.stringify(validate.errors))
    assert.equal(result.status, 'invalid', String(use_scope))
    assert.deepEqual(result.references, [])
  }
  // Internal rights never make a portrait public: brand_retrieve's publication flag still needs public scope.
  assert.equal(rightsBlocker(root, { subject: 'portrait', rights: INTERNAL_RIGHTS }), 'portrait rights do not cover public use')
  assert.equal(rightsBlocker(root, { subject: 'portrait', rights: INTERNAL_RIGHTS }, new Date(), 'internal'), null)
})
