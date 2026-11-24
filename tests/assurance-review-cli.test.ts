import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { AGENT_TOKEN_ENV } from '@brand-os/brand-core'
import { approved, assertUnchanged, coachBrand, snapshot as treeSnapshot, type CoachBrand } from './helpers/coach.js'
import { TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

/**
 * `npm run brand:assurance-review` through the real CLI, in temporary SYNTHETIC DEMO brands, with no
 * network and no model. The owner lists what needs a judgment, records one, and `brand:assurance assess`
 * then gives a score.
 */
useTestKey()

const NOTE_CANARY = 'REVIEW-CLI-NOTE-CANARY-2d91'
// The CLI uses the real clock, so the test does too: a judgment dated today, assessed as of today.
const TODAY = new Date().toISOString().slice(0, 10)

function run(script: string, root: string, args: string[], env: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = { ...process.env, BRAND_OS_DATA_KEY: TEST_DATA_KEY }
  delete base[AGENT_TOKEN_ENV]
  const merged = { ...base, ...env }
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key]
  const result = spawnSync(NODE, tsxArgs(path.join('scripts', script), args), { cwd: root, encoding: 'utf8', env: merged as NodeJS.ProcessEnv, input: '' })
  let json: Record<string, unknown> | null = null
  try {
    json = JSON.parse(result.stdout) as Record<string, unknown>
  } catch {
    json = null
  }
  return { status: result.status, json, stdout: result.stdout, stderr: result.stderr }
}

const review = (root: string, args: string[], env: Record<string, string | undefined> = {}) => run('assurance-review.ts', root, args, env)
const assurance = (root: string, args: string[]) => run('assurance.ts', root, args)

/** A SYNTHETIC DEMO selling company whose only blocking item, with paid media stated, is PRR-08's judgment. */
function readyCompany(): CoachBrand {
  const brand = coachBrand({ slug: 'review-cli-demo' })
  approved(brand, 'business.stage.current', 'established')
  approved(brand, 'business.sales.motion', 'self-serve')
  approved(brand, 'business.customer.primary_segment', 'SYNTHETIC DEMO segment')
  approved(brand, 'business.offer.value_proposition', 'SYNTHETIC DEMO value')
  approved(brand, 'brand.strategy.differentiation', 'SYNTHETIC DEMO difference')
  return brand
}

test('review cli: help in three languages; usage errors exit 2 and write nothing', () => {
  const brand = readyCompany()
  const before = treeSnapshot(brand.root)
  for (const lang of ['en', 'fa', 'tr']) {
    const help = review(brand.root, ['help', '--lang', lang])
    assert.equal(help.status, 0)
    assert.match(help.stdout, /brand:assurance-review/)
    assert.match(help.stdout, /authorizes/)
  }
  assert.match(review(brand.root, ['help', '--lang', 'fa']).stdout, /گواهی‌نامه/)
  assert.equal(review(brand.root, []).status, 2)
  assert.equal(review(brand.root, ['approve']).status, 2)
  assert.equal(review(brand.root, ['record']).status, 2)
  assert.equal(review(brand.root, ['record', '--control', 'PRR-08', '--judgment', 'maybe', '--note', 'x']).status, 2)
  assert.equal(review(brand.root, ['record', '--control', 'PRR-08', '--judgment', 'yes']).status, 2, 'a note is required')
  assert.equal(review(brand.root, ['record', '--control', 'PRR-08', '--judgment', 'yes', '--note', 'x', '--date', '2026-02-30']).status, 2)
  assert.equal(review(brand.root, ['list', '--judgment', 'yes']).status, 2, 'list takes no judgment')
  assert.equal(review(brand.root, ['list', '--lang', 'de']).status, 2)
  assertUnchanged(before, brand.root, 'usage errors')
})

test('review cli: list, record, then brand:assurance assess gives a score; the note is never echoed', () => {
  const brand = readyCompany()

  const before = assurance(brand.root, ['assess', '--as-of', TODAY, '--paid-media', 'no', '--json'])
  assert.equal(before.status, 0, before.stderr)
  assert.equal((before.json?.assessment as { completeness: { state: string } }).completeness.state, 'not_scoreable')

  const listed = review(brand.root, ['list', '--as-of', TODAY, '--json'])
  assert.equal(listed.status, 0, listed.stderr)
  const items = listed.json?.items as Array<{ control_id: string; state: string }>
  assert.deepEqual(
    items.map((entry) => [entry.control_id, entry.state]),
    [['PRR-08', 'needs_judgment']],
  )
  for (const [lang, pattern] of [
    ['en', /Needs your judgment/],
    ['fa', /به داوری شما نیاز دارد/],
    ['tr', /Kararınızı bekliyor/],
  ] as const) {
    const text = review(brand.root, ['list', '--as-of', TODAY, '--lang', lang])
    assert.equal(text.status, 0, text.stderr)
    assert.match(text.stdout, pattern)
    assert.match(text.stdout, /PRR-08/)
  }

  const recorded = review(brand.root, ['record', '--control', 'PRR-08', '--judgment', 'yes', '--note', `SYNTHETIC DEMO reason ${NOTE_CANARY}`, '--expect', 'none', '--json'])
  assert.equal(recorded.status, 0, recorded.stderr)
  assert.equal(recorded.json?.ok, true)
  assert.deepEqual(recorded.json?.authorizes, [])
  assert.ok(!recorded.stdout.includes(NOTE_CANARY), 'the note is not echoed back')
  const file = path.join(brand.root, 'brand', '.private', 'assurance', 'reviews', 'PRR-08.json')
  assert.ok(fs.readFileSync(file, 'utf8').includes(NOTE_CANARY), 'the note is stored privately')

  const after = assurance(brand.root, ['assess', '--as-of', TODAY, '--paid-media', 'no', '--json'])
  assert.equal(after.status, 0, after.stderr)
  const completeness = (after.json?.assessment as { completeness: { state: string; numerator: number | null; denominator: number | null } }).completeness
  assert.equal(completeness.state, 'scoreable')
  assert.equal(typeof completeness.numerator, 'number')
  assert.ok(!after.stdout.includes(NOTE_CANARY))
  for (const lang of ['en', 'fa', 'tr']) assert.ok(!assurance(brand.root, ['assess', '--as-of', TODAY, '--paid-media', 'no', '--lang', lang]).stdout.includes(NOTE_CANARY))

  // Recorded text in Persian, and the note only when the owner asks for it.
  const fa = review(brand.root, ['record', '--control', 'PRR-08', '--judgment', 'partly', '--note', 'SYNTHETIC DEMO second look', '--lang', 'fa'])
  assert.equal(fa.status, 0, fa.stderr)
  assert.match(fa.stdout, /تا حدی/)
  assert.ok(!review(brand.root, ['list', '--as-of', TODAY]).stdout.includes('second look'))
  assert.match(review(brand.root, ['list', '--as-of', TODAY, '--show-notes']).stdout, /second look/)

  // A stale expectation is refused: someone recorded since.
  const stale = review(brand.root, ['record', '--control', 'PRR-08', '--judgment', 'no', '--note', 'x', '--expect', 'none', '--json'])
  assert.equal(stale.status, 1)
  assert.equal((stale.json?.error as { code: string }).code, 'invalid_input')
  // Not a judgment control.
  const notReviewable = review(brand.root, ['record', '--control', 'PRR-01', '--judgment', 'yes', '--note', 'x', '--json'])
  assert.equal(notReviewable.status, 1)
  assert.equal((notReviewable.json?.error as { code: string }).code, 'not_reviewable')
})

test('review cli: refused under an agent token before anything is read or written; nothing is echoed', () => {
  const brand = readyCompany()
  const before = treeSnapshot(brand.root)
  for (const args of [['list', '--json'], ['record', '--control', 'PRR-08', '--judgment', 'yes', '--note', NOTE_CANARY], ['help'], ['list', '--lang', 'fa']]) {
    const result = review(brand.root, args, { [AGENT_TOKEN_ENV]: 'bos_agent_not-a-real-token' })
    assert.equal(result.status, 1, args.join(' '))
    assert.match(result.stderr, /refused/)
    const out = `${result.stdout}${result.stderr}`
    for (const secret of ['review-cli-demo', 'bos_agent_not-a-real-token', NOTE_CANARY]) assert.ok(!out.includes(secret), `${secret} is never printed`)
  }
  assertUnchanged(before, brand.root, 'agent refusal')
})

test('review cli: a tampered history makes brand:assurance refuse to build, without echoing the file', () => {
  const brand = readyCompany()
  assert.equal(review(brand.root, ['record', '--control', 'PRR-08', '--judgment', 'no', '--note', `SYNTHETIC DEMO ${NOTE_CANARY}`]).status, 0)
  const file = path.join(brand.root, 'brand', '.private', 'assurance', 'reviews', 'PRR-08.json')
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"judgment": "no"', '"judgment": "yes"'))
  const result = assurance(brand.root, ['assess', '--as-of', TODAY, '--paid-media', 'no', '--json'])
  assert.equal(result.status, 1)
  assert.equal((result.json?.error as { code: string }).code, 'invalid_review')
  assert.ok(!result.stdout.includes(NOTE_CANARY))
  const listed = review(brand.root, ['list', '--json'])
  assert.equal(listed.status, 1)
  assert.equal((listed.json?.error as { code: string }).code, 'invalid_review')
})
