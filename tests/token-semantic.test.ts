import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  applyInit,
  approveTokens,
  ensureApprovalSecret,
  generateTokens,
  InterviewEngine,
  parseSemanticMap,
  SEMANTIC_MAP_QUESTION,
  suggestSemanticMap,
  tokenNextStep,
  writeStarterWorkspace,
} from '@brand-os/brand-core'
import { compileTokens } from '@brand-os/design-tokens'

/**
 * BOS-17: arbitrary owner colour roles become draft tokens under color.brand-role.*, the template ids come only from
 * an approved brand.color.semantic_map, and until then generation suggests a mapping it never applies.
 */

process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')
const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')
const SLUG = 'sample-person'

// Synthetic palette shaped like a real owner design system: twenty kebab-case roles, none named like a template slot.
const TWENTY_ROLES = [
  'mint #C6F432',
  'plum #6E58E8',
  'coral #F2602B',
  'night-950 #101114',
  'night-900 #16171A',
  'night-800 #202226',
  'night-600 #2A2C31',
  'night-100 #3C3F45',
  'night-50 #575B62',
  'night-40 #7B7F86',
  'night-30 #989CA3',
  'night-20 #BBBFC5',
  'night-10 #D8DBDF',
  'surface-bg-1 #FAFBFC',
  'surface-bg-2 #F5F6F8',
  'surface #F0F2F4',
  'border #D9DDE1',
  'border-hover #C4CBD1',
  'text-title #1A1D21',
  'text-subtitle #4B5560',
].join('; ')

function brand(): { root: string; engine: InterviewEngine; proof: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-semantic-'))
  writeStarterWorkspace(root)
  fs.cpSync(path.join(repo, 'brand/tokens'), path.join(root, 'brand/tokens'), { recursive: true })
  fs.rmSync(path.join(root, 'brand/tokens/generated'), { recursive: true, force: true })
  fs.rmSync(path.join(root, 'brand/tokens/approvals.yaml'), { force: true })
  applyInit(root, { name: 'Sample Person', slug: SLUG, industry: 'consulting', language: 'en', languages: ['en', 'fa', 'tr'], mascot: false, gamification: false, publish: 'private' })
  return { root, engine: new InterviewEngine(root), proof: ensureApprovalSecret(root) }
}

function approveAnswer(engine: InterviewEngine, proof: string, id: string, value: string): void {
  const recorded = engine.answerQuestion(id, value)
  assert.equal(recorded.kind, 'recorded', recorded.message)
  const result = engine.approvals().approveBatch({ ids: [id] }, proof)
  assert.equal(result.approved, 1, JSON.stringify(result.results))
}

test('twenty owner-named roles become draft color.brand-role tokens without hand-editing', () => {
  const { root, engine, proof } = brand()
  approveAnswer(engine, proof, 'brand.color.roles', TWENTY_ROLES)
  approveAnswer(engine, proof, 'brand.type.scale', 'display-en: Example Display, Arial, sans-serif @ 48px/1.1; body-en: Example Sans, system-ui, sans-serif @ 16px/1.5')
  approveAnswer(engine, proof, 'brand.logo.min_size', 'min-size: 96px; clear-space: 1x; min-print: 25mm')
  const report = generateTokens(root, SLUG)
  assert.equal(report.ok, true, report.note)
  const roleTokens = report.tokens.filter((token) => token.id.startsWith('color.brand-role.'))
  assert.equal(roleTokens.length, 20)
  assert.ok(roleTokens.every((token) => token.outcome === 'created' && token.source_fact === 'brand.color.roles'))
  const flat = compileTokens(root).flat
  assert.equal(flat['color.brand-role.surface-bg-1']?.hex, '#FAFBFC')
  assert.equal(flat['color.brand-role.night-950']?.source, 'generated')
  assert.ok(flat['type.fontFamily.body-en'] && flat['logo.minSize'], 'type and logo tokens are generated too')
  // No guess is applied: every template color id is still the template example.
  assert.equal(flat['color.brand.primary']?.source, 'base')
  assert.equal(flat['color.light.canvas']?.source, 'base')
  assert.equal(report.tokens.some((token) => token.id.startsWith('color.brand.') || token.id.startsWith('color.light.')), false)
  assert.equal(report.semantic.state, 'missing')
  assert.equal(report.semantic.applied.length, 0)
  assert.equal(report.semantic.template_examples.length, 19)
  // The suggestion is printed, deterministic, and never applied.
  const suggested = Object.fromEntries(report.semantic.suggestions.map((item) => [item.slot, item.role]))
  assert.equal(suggested.primary, 'mint')
  assert.equal(suggested.secondary, 'plum')
  assert.equal(suggested.accent, 'coral')
  assert.equal(suggested.canvas, 'surface-bg-1')
  assert.equal(suggested.text, 'text-title')
  assert.equal(suggested.muted, 'text-subtitle')
  assert.equal(suggested['dark-canvas'], 'night-950')
  assert.equal(suggested.onPrimary, 'night-950')
  assert.equal(suggested.danger, undefined, 'a colour meaning is never guessed from a hue')
  assert.match(report.semantic.answer_command ?? '', /brand:interview -- --question brand\.color\.semantic_map --answer "primary = mint; onPrimary = night-950;/)
  assert.match(report.note, /suggested mapping is printed; it was not applied/)
  assert.deepEqual(generateTokens(root, SLUG, { dryRun: true }).semantic.suggestions, report.semantic.suggestions, 'same input, same suggestion')
})

test('an approved semantic map generates the template ids from the owner roles; nothing else does', () => {
  const { root, engine, proof } = brand()
  approveAnswer(engine, proof, 'brand.color.roles', TWENTY_ROLES)
  // A draft map is not applied.
  assert.equal(engine.answerQuestion(SEMANTIC_MAP_QUESTION, 'canvas = surface-bg-1; text = text-title').kind, 'recorded')
  const draft = generateTokens(root, SLUG)
  assert.equal(draft.semantic.state, 'missing', 'a draft answer is not an approved fact')
  assert.equal(compileTokens(root).flat['color.light.canvas']?.source, 'base')

  const approved = engine.approvals().approveBatch({ ids: [SEMANTIC_MAP_QUESTION] }, proof)
  assert.equal(approved.approved, 1, JSON.stringify(approved.results))
  const report = generateTokens(root, SLUG)
  assert.equal(report.ok, true, report.note)
  assert.equal(report.semantic.state, 'used')
  assert.deepEqual(report.semantic.applied.map((item) => [item.token_id, item.role]), [['color.light.canvas', 'surface-bg-1'], ['color.light.text', 'text-title']])
  const flat = compileTokens(root).flat
  assert.equal(flat['color.light.canvas']?.hex, '#FAFBFC')
  assert.equal(flat['color.light.canvas']?.source, 'generated')
  assert.equal(flat['color.light.canvas']?.sourceFact, SEMANTIC_MAP_QUESTION)
  assert.equal(flat['color.light.text']?.hex, '#1A1D21')
  assert.equal(flat['color.brand.primary']?.source, 'base', 'an unmapped slot stays a template example')
  assert.ok(!report.semantic.suggestions.some((item) => item.slot === 'canvas'), 'a mapped slot is not suggested again')
  assert.match(report.semantic.suggested_answer ?? '', /^canvas = surface-bg-1; text = text-title; /, 'the suggestion keeps the owner entries')
  // Generated means draft: approval is a separate, proof-gated step on the token itself.
  assert.equal(approveTokens(root, ['color.light.canvas'], proof).ok, true)
  assert.equal(approveTokens(root, ['color.brand.primary'], proof).ok, false, 'a template example cannot be approved')
})

test('the semantic map parser reports unknown slots, unknown roles and repeats, and honours none', () => {
  const roles = [
    { role: 'mint', hex: '#C6F432' },
    { role: 'ink-950', hex: '#101114' },
  ]
  const parsed = parseSemanticMap('Primary: mint\nonPrimary -> INK-950; color.light.canvas = none; hero = mint; danger = crimson; primary = ink-950', roles)
  assert.deepEqual(parsed.assignments.map((item) => [item.slot, item.role]), [['primary', 'mint'], ['onPrimary', 'ink-950']])
  assert.deepEqual(parsed.unmapped, ['canvas'])
  assert.equal(parsed.problems.length, 3)
  assert.match(parsed.problems.join(' '), /“hero” is not a template slot/)
  assert.match(parsed.problems.join(' '), /“crimson” is not an approved role/)
  assert.match(parsed.problems.join(' '), /primary is mapped twice/)
})

test('a role named like a slot is only a suggestion', () => {
  const suggestions = suggestSemanticMap([
    { role: 'primary', hex: '#0B2A55' },
    { role: 'onPrimary', hex: '#FFFFFF' },
    { role: 'error', hex: '#B00020' },
  ])
  assert.deepEqual(
    suggestions.filter((item) => item.basis === 'same_name').map((item) => [item.slot, item.role]),
    [['primary', 'primary'], ['onPrimary', 'onPrimary'], ['danger', 'error']],
  )
})

test('brand:approve names the token step after a token source is approved', () => {
  assert.equal(tokenNextStep(['business.offer.summary', null]), null)
  const step = tokenNextStep(['brand.color.roles', 'brand.type.scale'])
  assert.match(step ?? '', /Run `npm run brand:tokens:generate` to turn these into draft tokens\./)
  assert.match(step ?? '', /brand\.color\.roles, brand\.type\.scale are approved/)
  assert.match(tokenNextStep([SEMANTIC_MAP_QUESTION]) ?? '', /brand:tokens:generate/)

  // End to end through the CLI, with the proof from the environment (never argv).
  const { root, engine, proof } = brand()
  assert.equal(engine.answerQuestion('brand.logo.min_size', 'min-size: 24px; clear-space: 0.5x').kind, 'recorded')
  const env = { ...process.env, BRAND_OS_APPROVAL_PROOF: proof, BRAND_OS_AGENT_TOKEN: '' }
  delete (env as Record<string, string | undefined>).BRAND_OS_AGENT_TOKEN
  const result = spawnSync(tsx, [path.join(repo, 'scripts/brand.ts'), 'approve', '--ids', 'brand.logo.min_size'], { cwd: root, env, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /1 approved\. Nothing was published\./)
  assert.match(result.stdout, /Run `npm run brand:tokens:generate` to turn these into draft tokens\./)
  const json = spawnSync(tsx, [path.join(repo, 'scripts/brand.ts'), 'approve', '--ids', 'brand.logo.min_size', '--json'], { cwd: root, env, encoding: 'utf8' })
  assert.doesNotMatch(json.stdout, /brand:tokens:generate/, 'the JSON contract is unchanged')
})

test('brand:tokens:generate prints the suggested mapping as not applied', () => {
  const { root, engine, proof } = brand()
  approveAnswer(engine, proof, 'brand.color.roles', TWENTY_ROLES)
  const env = { ...process.env }
  delete env.BRAND_OS_AGENT_TOKEN
  const result = spawnSync(tsx, [path.join(repo, 'scripts/brand.ts'), 'tokens:generate'], { cwd: root, env, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /created\s+color\.brand-role\.mint/)
  assert.match(result.stdout, /Suggested mapping for brand\.color\.semantic_map \(NOT applied/)
  assert.match(result.stdout, /npm run brand:interview -- --question brand\.color\.semantic_map --answer "/)
})
