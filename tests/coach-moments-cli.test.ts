import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { test } from 'node:test'
import { AGENT_TOKEN_ENV } from '@brand-os/brand-core'
import { answer, ANSWER_CANARY, coachBrand, VAGUE_SEGMENT, type CoachBrand } from './helpers/coach.js'
import { TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

/**
 * The coach moments through the real `brand:interview` and `brand:approve` (docs-internal/COACH_UX_DECISION.md).
 * SYNTHETIC DEMO data only. The coach must appear on its own, stay silent when it has nothing important to say,
 * never quote the owner and never block a save or an approval.
 */
useTestKey()

const SEGMENT = 'business.customer.primary_segment'

function brand(root: string, args: string[], opts: { env?: Record<string, string | undefined>; input?: string } = {}) {
  const base: Record<string, string | undefined> = { ...process.env, BRAND_OS_DATA_KEY: TEST_DATA_KEY }
  delete base[AGENT_TOKEN_ENV]
  delete base.BRAND_OS_APPROVAL_PROOF
  delete base.BRAND_OS_COACH
  const merged = { ...base, ...opts.env }
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key]
  const result = spawnSync(NODE, tsxArgs(path.join('scripts', 'brand.ts'), args), { cwd: root, encoding: 'utf8', env: merged as NodeJS.ProcessEnv, input: opts.input ?? '' })
  let json: Record<string, unknown> | null = null
  try {
    json = JSON.parse(result.stdout) as Record<string, unknown>
  } catch {
    json = null
  }
  return { status: result.status, json, stdout: result.stdout, stderr: result.stderr }
}

function staged(): CoachBrand {
  const b = coachBrand()
  answer(b, 'business.stage.current', 'pre-revenue')
  return b
}

test('interview agent mode: the coach note arrives in --json on the first vague answer, once, and never quotes it', () => {
  const b = staged()
  const first = brand(b.root, ['interview', '--question', SEGMENT, '--answer', VAGUE_SEGMENT, '--json'])
  assert.equal(first.status, 0, first.stderr)
  assert.equal(first.json?.ok, true, 'the save is not blocked')
  const coach = first.json?.coach as { shown: boolean; note: { criterion: string; suggested_question: string }; authorizes: unknown[] }
  assert.equal(coach.shown, true)
  assert.equal(coach.note.criterion, 'specificity')
  assert.deepEqual(coach.authorizes, [])
  assert.ok(!(first.stdout + first.stderr).replace(/"message"[^\n]*/g, '').includes(ANSWER_CANARY), 'the coach never quotes the answer')

  const again = brand(b.root, ['interview', '--question', SEGMENT, '--answer', `${VAGUE_SEGMENT} still`, '--json'])
  assert.equal((again.json?.coach as { silence: string }).silence, 'already_coached', 'never repeats')

  const name = brand(b.root, ['interview', '--question', 'business.identity.trade_name', '--answer', 'EXAMPLE Demo Co', '--json'])
  assert.equal((name.json?.coach as { silence: string }).silence, 'not_strategic')

  const restricted = brand(b.root, ['interview', '--question', 'business.finance.runway', '--answer', 'unknown', '--json'])
  assert.equal((restricted.json?.coach as { silence: string }).silence, 'restricted')
})

// The interactive loop (`npm run brand:interview`) calls the same `afterAnswerCoach` helper after a `recorded`
// result. It is not driven here: its readline prompt does not read piped stdin (pre-existing behaviour).
test('interview agent mode: text output carries the note; the off switch silences it', () => {
  const b = staged()
  const text = brand(b.root, ['interview', '--question', SEGMENT, '--answer', VAGUE_SEGMENT], { env: {} })
  assert.equal(text.status, 0, text.stderr)
  assert.match(text.stdout, /Coach \(optional, nothing was changed\) — business\.customer\.primary_segment/)
  assert.ok(!text.stdout.includes(ANSWER_CANARY))

  const other = staged()
  const off = brand(other.root, ['interview', '--question', SEGMENT, '--answer', VAGUE_SEGMENT, '--json'], { env: { BRAND_OS_COACH: 'off' } })
  assert.equal(off.status, 0)
  assert.equal((off.json?.coach as { silence: string }).silence, 'disabled')
})

test('approve: coach notes appear before the proof, never block, and leave --json untouched', () => {
  const b = staged()
  answer(b, SEGMENT, VAGUE_SEGMENT)
  answer(b, 'business.identity.trade_name', 'EXAMPLE Demo Co')

  const dry = brand(b.root, ['approve', '--ids', `${SEGMENT},business.identity.trade_name`, '--dry-run'])
  assert.equal(dry.status, 0, dry.stderr)
  assert.match(dry.stderr, /Coach notes before you approve \(advisory; nothing is blocked\):\n- business\.customer\.primary_segment/)
  assert.ok(!dry.stderr.includes('business.identity.trade_name ('), 'a name gets no note')

  const json = brand(b.root, ['approve', '--ids', SEGMENT, '--json'], { env: { BRAND_OS_APPROVAL_PROOF: b.proof } })
  assert.equal(json.status, 0, json.stderr)
  assert.equal(json.json?.approved, 1, 'the coach never blocks approval')
  assert.ok(!json.stderr.includes('Coach notes'), 'JSON mode prints no coach text')

  const c = staged()
  answer(c, SEGMENT, VAGUE_SEGMENT)
  const real = brand(c.root, ['approve', '--ids', SEGMENT], { env: { BRAND_OS_APPROVAL_PROOF: c.proof } })
  assert.equal(real.status, 0, real.stderr)
  assert.match(real.stderr, /Coach notes before you approve/)
  assert.ok(real.stderr.indexOf('Coach notes') < real.stderr.indexOf('About to approve'), 'notes come before the decision')
  assert.match(real.stdout, /1 approved/)
  assert.ok(!(real.stdout + real.stderr).includes(ANSWER_CANARY))
})
