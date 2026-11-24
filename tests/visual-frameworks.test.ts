import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  BMC_FRAMEWORK,
  FRAMEWORK_REGISTRY_PATH,
  FRAMEWORK_REGISTRY_SCHEMA_PATH,
  frameworkRef,
  frameworkRegistry,
  frameworkRegistryErrors,
  validateFrameworkRegistry,
  type FrameworkRegistry,
} from '@brand-os/brand-core/visual'

/**
 * Visual Blueprint V1.1 / D5: the framework registry is a metadata file with a schema and claim rules, validated in
 * CI, and the renderers read their framework references from it. It never holds a brand fact.
 */
const ROOT = path.resolve(import.meta.dirname, '..')
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, FRAMEWORK_REGISTRY_SCHEMA_PATH), 'utf8')) as object
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, FRAMEWORK_REGISTRY_PATH), 'utf8')) as FrameworkRegistry

function withEntry(change: Partial<FrameworkRegistry['frameworks'][number]>): FrameworkRegistry {
  return { ...registry, frameworks: [{ ...registry.frameworks[0]!, ...change }] }
}

test('the shipped registry is valid, and the canvas cites it', () => {
  assert.deepEqual(validateFrameworkRegistry(registry, schema), [])
  assert.deepEqual(frameworkRegistryErrors(ROOT), { errors: [], warnings: [] })
  assert.equal(BMC_FRAMEWORK, frameworkRef('BMC'))
  assert.equal(BMC_FRAMEWORK.title, 'Business Model Canvas', 'standard, recognized name')
  for (const ref of frameworkRegistry().values()) {
    assert.notEqual(ref.permitted_claim, 'externally_certified')
    assert.match(ref.source_url, /^https:\/\//)
  }
  assert.throws(() => frameworkRef('NOPE'), /not in/)
})

test('claim rules: no certification, checked claims need a date, Brand OS templates only for Brand OS', () => {
  assert.match(validateFrameworkRegistry(withEntry({ permitted_claim: 'externally_certified' }), schema).join(), /certificate evidence/)
  assert.match(validateFrameworkRegistry(withEntry({ permitted_claim: 'aligned_with', verified_on: null }), schema).join(), /needs verified_on/)
  assert.deepEqual(validateFrameworkRegistry(withEntry({ permitted_claim: 'verified_against', verified_on: '2026-11-01', reviewer: 'Example reviewer' }), schema), [])
  assert.match(validateFrameworkRegistry(withEntry({ permitted_claim: 'original_professional_template' }), schema).join(), /only for Brand OS/)
  assert.match(validateFrameworkRegistry(withEntry({ usage_note: 'The official, certified canvas.' }), schema).join(), /must not claim/)
  assert.deepEqual(validateFrameworkRegistry(withEntry({ usage_note: 'A measurement, not a conformance claim.' }), schema), [], 'a disclaimer is allowed')
  const twice = { ...registry, frameworks: [registry.frameworks[0]!, registry.frameworks[0]!] }
  assert.match(validateFrameworkRegistry(twice, schema).join(), /duplicate/)
})

test('schema: unknown fields, non-https sources and fact-like payloads are refused', () => {
  assert.match(validateFrameworkRegistry(withEntry({ source_url: 'http://example.com' }), schema).join(), /source_url/)
  const extra = { ...registry, frameworks: [{ ...registry.frameworks[0]!, value: 'Approved revenue 42' }] }
  assert.match(validateFrameworkRegistry(extra, schema).join(), /additional/)
  assert.match(validateFrameworkRegistry({ schema_version: 1, frameworks: [], facts: {} }, schema).join(), /additional|fewer/)
})

test('validate: a repository without the registry warns; a broken one fails', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-frameworks-'))
  try {
    assert.equal(frameworkRegistryErrors(root).warnings.length, 1)
    fs.mkdirSync(path.dirname(path.join(root, FRAMEWORK_REGISTRY_PATH)), { recursive: true })
    fs.mkdirSync(path.join(root, 'schemas'))
    fs.copyFileSync(path.join(ROOT, FRAMEWORK_REGISTRY_SCHEMA_PATH), path.join(root, FRAMEWORK_REGISTRY_SCHEMA_PATH))
    fs.writeFileSync(path.join(root, FRAMEWORK_REGISTRY_PATH), JSON.stringify({ schema_version: 1, frameworks: [{ framework_id: 'X' }] }))
    assert.ok(frameworkRegistryErrors(root).errors.length > 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
