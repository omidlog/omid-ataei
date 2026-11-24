import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { AGENT_TOKEN_ENV } from '@brand-os/brand-core'
import { answer, ANSWER_CANARY, assertUnchanged, coachBrand, disposition, RESTRICTED_CANARY, snapshot, SPECIFIC_SEGMENT, VAGUE_SEGMENT } from './helpers/coach.js'
import { TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

/**
 * `npm run brand:coach` through the real CLI, in a temporary brand, with no network and no model.
 *
 * All fixtures are SYNTHETIC DEMO data. Every call asserts the brand is byte-for-byte unchanged, because
 * the command is read-only by contract, not only by intent.
 */
useTestKey()

function coach(root: string, args: string[], env: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = { ...process.env, BRAND_OS_DATA_KEY: TEST_DATA_KEY }
  delete base[AGENT_TOKEN_ENV]
  delete base.BRAND_OS_APPROVAL_PROOF
  const merged = { ...base, ...env }
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key]
  const result = spawnSync(NODE, tsxArgs(path.join('scripts', 'coach.ts'), args), { cwd: root, encoding: 'utf8', env: merged as NodeJS.ProcessEnv, input: '' })
  let json: Record<string, unknown> | null = null
  try {
    json = JSON.parse(result.stdout) as Record<string, unknown>
  } catch {
    json = null
  }
  return { status: result.status, json, stdout: result.stdout, stderr: result.stderr }
}

test('cli: help, a missing command and a bad mode explain themselves without analysing anything', () => {
  const brand = coachBrand()
  const before = snapshot(brand.root)

  const help = coach(brand.root, ['help'])
  assert.equal(help.status, 0)
  for (const mode of ['follow_up', 'quality_review', 'consistency_review']) assert.match(help.stdout, new RegExp(mode))
  assert.match(help.stdout, /authorizes is always empty/)

  assert.equal(coach(brand.root, []).status, 2, 'no command is a usage error')
  const badMode = coach(brand.root, ['analyze', '--mode', 'rewrite_everything'])
  assert.equal(badMode.status, 2)
  assert.match(badMode.stderr, /--mode must be one of/)
  const badCommand = coach(brand.root, ['approve', '--question', 'business.identity.trade_name'])
  assert.equal(badCommand.status, 2)
  assert.match(badCommand.stderr, /Unknown command approve/)
  assert.equal(coach(brand.root, ['next', '--mode', 'follow_up']).status, 2, 'next takes no --mode')
  assert.equal(coach(brand.root, ['analyze', '--mode', 'quality_review', '--lang', 'de', '--question', 'business.identity.trade_name']).status, 2)

  assertUnchanged(before, brand.root, 'usage errors')
})

test('cli: the three modes print JSON and human text in en, fa and tr, and write nothing', () => {
  const brand = coachBrand()
  answer(brand, 'business.stage.current', 'pre-revenue')
  answer(brand, 'business.customer.primary_segment', VAGUE_SEGMENT)
  const before = snapshot(brand.root)

  for (const lang of ['en', 'fa', 'tr']) {
    const quality = coach(brand.root, ['analyze', '--mode', 'quality_review', '--question', 'business.customer.primary_segment', '--lang', lang, '--json'])
    assert.equal(quality.status, 0, quality.stderr)
    assert.equal(quality.json?.locale, lang)
    assert.equal(quality.json?.status, 'needs_clarification')
    assert.deepEqual(quality.json?.authorizes, [])
    assert.equal(quality.json?.authority, 'derived_advice')

    const followUp = coach(brand.root, ['analyze', '--mode', 'follow_up', '--question', 'business.customer.primary_segment', '--lang', lang])
    assert.equal(followUp.status, 0, followUp.stderr)
    assert.match(followUp.stdout, /authorizes: \[\]/)
    assert.ok(!followUp.stdout.includes(ANSWER_CANARY), 'the printed advice never quotes the answer')

    const consistency = coach(brand.root, ['analyze', '--mode', 'consistency_review', '--lang', lang, '--json'])
    assert.equal(consistency.status, 0, consistency.stderr)
    assert.equal(consistency.json?.mode, 'consistency_review')
  }

  const next = coach(brand.root, ['next', '--json'])
  assert.equal(next.status, 0, next.stderr)
  assert.equal(next.json?.question_id, 'business.customer.primary_segment')

  assertUnchanged(before, brand.root, 'three modes and next through the CLI')
})

test('cli: a restricted question is refused with a code, no value and no digest', () => {
  const brand = coachBrand()
  const restricted = brand.engine.questions().find((question) => question.sensitivity === 'restricted')
  assert.ok(restricted)
  assert.equal(brand.engine.changeAnswer(restricted.id, `4400 ${RESTRICTED_CANARY}`).kind, 'recorded')
  const before = snapshot(brand.root)

  const text = coach(brand.root, ['analyze', '--mode', 'quality_review', '--question', restricted.id])
  assert.equal(text.status, 1)
  assert.match(text.stderr, /^refused: /)
  const json = coach(brand.root, ['analyze', '--mode', 'follow_up', '--question', restricted.id, '--json'])
  assert.equal(json.status, 1)
  assert.deepEqual(json.json?.ok, false)
  assert.equal((json.json?.error as { code: string }).code, 'refused')
  for (const out of [text.stdout, text.stderr, json.stdout, json.stderr]) {
    assert.ok(!out.includes(RESTRICTED_CANARY), 'no restricted value in any stream')
    assert.ok(!out.includes('4400'), 'not even the number')
  }
  assertUnchanged(before, brand.root, 'restricted refusal through the CLI')
})

test('cli: every mode is denied under an agent token, non-zero and without a value', () => {
  const brand = coachBrand()
  answer(brand, 'business.customer.primary_segment', SPECIFIC_SEGMENT)
  const before = snapshot(brand.root)
  for (const args of [
    ['analyze', '--mode', 'quality_review', '--question', 'business.customer.primary_segment'],
    ['analyze', '--mode', 'follow_up', '--question', 'business.customer.primary_segment'],
    ['analyze', '--mode', 'consistency_review'],
    ['next'],
  ]) {
    const result = coach(brand.root, args, { [AGENT_TOKEN_ENV]: 'bot_not-a-real-token' })
    assert.equal(result.status, 1, args.join(' '))
    assert.match(result.stderr, new RegExp(`refused: .*${AGENT_TOKEN_ENV}`))
    assert.ok(!result.stdout.includes('Istanbul'), 'no answer text is printed')
  }
  assertUnchanged(before, brand.root, 'agent-token refusal through the CLI')
})

test('cli: an unknown question id and a mode without a question are refused, not guessed', () => {
  const brand = coachBrand()
  const unknown = coach(brand.root, ['analyze', '--mode', 'quality_review', '--question', 'business.made.up', '--json'])
  assert.equal(unknown.status, 1)
  assert.equal((unknown.json?.error as { code: string }).code, 'not_found')
  const missing = coach(brand.root, ['analyze', '--mode', 'follow_up', '--json'])
  assert.equal(missing.status, 1)
  assert.equal((missing.json?.error as { code: string }).code, 'invalid_input')
})

test('cli: an explicit decision is reported as settled and produces no question', () => {
  const brand = coachBrand()
  answer(brand, 'business.stage.current', 'pre-revenue')
  disposition(brand, 'business.customer.primary_segment', 'unknown')
  const before = snapshot(brand.root)
  const result = coach(brand.root, ['analyze', '--mode', 'follow_up', '--question', 'business.customer.primary_segment', '--json'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.json?.status, 'not_applicable')
  assert.deepEqual((result.json?.findings as Array<{ code: string }>).map((finding) => finding.code), ['follow_up_none'])
  assertUnchanged(before, brand.root, 'coaching an explicit decision')
})

test('cli: outside a brand repository the command says so instead of failing on a file read', () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-not-a-brand-'))
  const result = coach(outside, ['analyze', '--mode', 'consistency_review', '--json'])
  assert.equal(result.status, 1)
  assert.equal((result.json?.error as { code: string }).code, 'invalid_input')
  assert.match((result.json?.error as { message: string }).message, /not a Brand OS brand/)
})

test('cli: the command is not reachable through brand:query, and no MCP tool exposes it', () => {
  const brand = coachBrand()
  const query = spawnSync(NODE, tsxArgs(path.join('scripts', 'brand.ts'), ['query', '--tool', 'coach_analyze', '--json']), { cwd: brand.root, encoding: 'utf8', input: '' })
  assert.notEqual(query.status, 0, 'there is no coach tool in the generic retrieval surface')
  assert.ok(!query.stdout.includes('derived_advice'))
})
