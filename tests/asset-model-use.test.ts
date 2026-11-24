import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import Ajv from 'ajv'
import { effectiveModelUse, MODEL_USE_VALUES } from '@brand-os/asset-catalog'

/**
 * `model_use` on an asset record: may this file be given to a model or a model provider?
 * Absent means `not_allowed`, an unknown value means `not_allowed`, and recording a value sends nothing anywhere.
 */
const repo = path.resolve(import.meta.dirname, '..')
const schema = JSON.parse(fs.readFileSync(path.join(repo, 'schemas/asset.schema.json'), 'utf8')) as object
const validate = new Ajv({ allErrors: true, strict: false }).compile(schema)
const base = { id: 'logo.synthetic', name: 'Synthetic', status: 'approved', path: 'brand/assets/logo/x.svg', present: true, visibility: 'internal' }

test('model_use is optional and absent means not_allowed', () => {
  assert.equal(validate(base), true, JSON.stringify(validate.errors))
  assert.equal(effectiveModelUse(base), 'not_allowed')
  assert.equal(effectiveModelUse(null), 'not_allowed')
  assert.equal(effectiveModelUse(undefined), 'not_allowed')
})

test('model_use accepts exactly the three declared values', () => {
  assert.deepEqual([...MODEL_USE_VALUES], ['not_allowed', 'local_only', 'external_allowed'])
  for (const value of MODEL_USE_VALUES) {
    assert.equal(validate({ ...base, model_use: value }), true, value)
    assert.equal(effectiveModelUse({ model_use: value }), value)
  }
})

test('an unknown, mistyped or truthy model_use is rejected by the schema and read as not_allowed', () => {
  for (const value of ['allowed', 'yes', true, 1, 'EXTERNAL_ALLOWED', '', null, { provider: 'any' }]) {
    assert.equal(validate({ ...base, model_use: value }), false, `schema must refuse ${JSON.stringify(value)}`)
    assert.equal(effectiveModelUse({ model_use: value }), 'not_allowed', `effective value for ${JSON.stringify(value)}`)
  }
})
