import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'
import { strategyBrand } from './helpers/strategy.js'

/**
 * Content Bridge Slice B owner journey through the real brand:content CLI (real clock): plan, store drafts, review,
 * proof-gated per-week approval, the calendar view (drafts never shown), a banned-claim refusal, and share for Studio.
 */
useTestKey()

const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')

function cli(root: string, script: 'content' | 'strategy', args: string[], env: Record<string, string | undefined> = {}) {
  const merged: Record<string, string | undefined> = { ...process.env, BRAND_OS_DATA_KEY: TEST_DATA_KEY, BRAND_OS_KNOWLEDGE_GH: 'off', BRAND_OS_AGENT_TOKEN: undefined, BRAND_OS_APPROVAL_PROOF: undefined, ...env }
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key]
  const result = spawnSync(tsx, [path.join(repo, 'scripts', `${script}.ts`), ...args], { cwd: root, encoding: 'utf8', env: merged as NodeJS.ProcessEnv, input: '' })
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(result.stdout) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: result.status, json, stdout: result.stdout, stderr: result.stderr }
}

test('journey: plan, store drafts, approve one week with proof, calendar shows only it, banned hook refused, share', async () => {
  const s = await strategyBrand('pilito', new Date())
  const today = new Date().toISOString().slice(0, 10)
  // No approved content strategy: nothing to plan.
  const none = cli(s.root, 'content', ['plan', '--from', today, '--weeks', '1'])
  assert.equal(none.status, 1)
  assert.match(none.stderr, /No approved content strategy/)

  for (const [id, value] of [
    ['brand.verbal.voice', 'Warm and plain.'],
    ['brand.verbal.forbidden', 'Guaranteed fluency; Fake awards'],
    ['business.marketing.availability_claim', 'do-not-claim'],
    ['brand.strategy.promise', 'Speak from day one'],
    ['business.marketing.pillars', 'Learning stories; Product proof'],
    ['business.marketing.channels', 'Instagram and LinkedIn'],
  ] as const) {
    assert.equal(s.engine.changeAnswer(id, value).kind, 'recorded', id)
    assert.equal(s.engine.approve(id, 'owner', s.proof).kind, 'recorded', id)
  }
  const strategy = cli(s.root, 'content', ['strategy', '--cadence', 'instagram=3/week', '--formats', 'instagram=reel+carousel', '--store', '--json'])
  assert.equal(strategy.status, 0, strategy.stdout + strategy.stderr)
  const sha = (strategy.json.stored as { content_sha256: string }).content_sha256
  assert.equal(cli(s.root, 'strategy', ['approve', '--id', 'content-main', '--revision', '1', '--expect-sha', sha], { BRAND_OS_APPROVAL_PROOF: s.proof }).status, 0)

  // A preview writes nothing.
  const preview = cli(s.root, 'content', ['plan', '--from', today, '--weeks', '2'])
  assert.equal(preview.status, 0, preview.stderr)
  assert.match(preview.stdout, /Draft calendar \(not stored\) from content-main@1/)
  assert.match(preview.stdout, /linkedin: cadence is not decided/)
  assert.match(preview.stdout, /Nothing was stored/)
  assert.ok(!fs.existsSync(path.join(s.root, 'brand/.private/content')))
  assert.match(cli(s.root, 'content', ['plan', '--from', today, '--weeks', '1', '--lang', 'fa']).stdout, /تقویم پیش‌نویس/)
  assert.match(cli(s.root, 'content', ['plan', '--from', today, '--weeks', '1', '--lang', 'tr']).stdout, /taslak takvim/)

  // Store both weeks as drafts. The calendar shows neither.
  const stored = cli(s.root, 'content', ['plan', '--from', today, '--weeks', '2', '--store', '--json'])
  assert.equal(stored.status, 0, stored.stdout + stored.stderr)
  const drafts = stored.json.stored as Array<{ week_id: string; revision: number; content_sha256: string }>
  assert.equal(drafts.length, 2)
  const hidden = cli(s.root, 'content', ['calendar', '--json'])
  assert.deepEqual(hidden.json.weeks, [])
  assert.deepEqual(hidden.json.withheld, { draft: 2 })

  const week = drafts[0]!
  const review = cli(s.root, 'content', ['week', 'review', '--week', week.week_id, '--revision', '1'])
  assert.equal(review.status, 0, review.stderr)
  assert.match(review.stdout, /No blockers\./)
  assert.match(review.stdout, new RegExp(`week approve --week ${week.week_id} --revision 1 --expect-sha ${week.content_sha256}`))
  const noProof = cli(s.root, 'content', ['week', 'approve', '--week', week.week_id, '--revision', '1', '--expect-sha', week.content_sha256])
  assert.equal(noProof.status, 1)
  assert.match(noProof.stderr, /proof/)
  const approved = cli(s.root, 'content', ['week', 'approve', '--week', week.week_id, '--revision', '1', '--expect-sha', week.content_sha256], { BRAND_OS_APPROVAL_PROOF: s.proof })
  assert.equal(approved.status, 0, approved.stdout + approved.stderr)
  assert.match(approved.stdout, /authorizes no post, schedule, publication, ad or spend/)

  const shown = cli(s.root, 'content', ['calendar'])
  assert.equal(shown.status, 0, shown.stderr)
  assert.match(shown.stdout, new RegExp(`${week.week_id} r1 \\(current\\)`))
  assert.ok(!shown.stdout.includes(drafts[1]!.week_id), 'the second week is still a draft')
  assert.match(shown.stdout, /brand\.strategy\.promise: Speak from day one/)
  assert.match(shown.stdout, /Not shown: draft: 1/)
  assert.match(cli(s.root, 'content', ['calendar', '--lang', 'fa']).stdout, /هفتهٔ تأییدشده هیچ ارسال/)
  assert.match(cli(s.root, 'content', ['weeks']).stdout, /r1 approved → current/)

  // An edited week whose hook makes a banned claim is refused, in the owner's language.
  const out = path.join(s.root, 'weeks.json')
  assert.equal(cli(s.root, 'content', ['plan', '--from', today, '--weeks', '1', '--out', out]).status, 0)
  const file = JSON.parse(fs.readFileSync(out, 'utf8')) as { weeks: Array<{ slots: Array<{ hook: string | null }> }> }
  const one = path.join(s.root, 'week.json')
  file.weeks[0]!.slots[0]!.hook = 'Guaranteed fluency in a month'
  fs.writeFileSync(one, JSON.stringify(file.weeks[0]))
  const banned = cli(s.root, 'content', ['week', 'propose', '--file', one])
  assert.equal(banned.status, 1)
  assert.match(banned.stderr, /contradicts the banned claim "Guaranteed fluency"/)
  assert.match(cli(s.root, 'content', ['week', 'propose', '--file', one, '--lang', 'tr']).stderr, /yasak iddiasıyla çelişiyor/)
  file.weeks[0]!.slots[0]!.hook = 'A learner tells their first conversation'
  fs.writeFileSync(one, JSON.stringify(file.weeks[0]))
  const v2 = cli(s.root, 'content', ['week', 'propose', '--file', one, '--json'])
  assert.equal(v2.status, 0, v2.stdout + v2.stderr)
  assert.equal(v2.json.revision, 2)
  assert.ok(!cli(s.root, 'content', ['calendar']).stdout.includes('first conversation'), 'v2 hidden until approved')

  // Share the approved week for Studio: a tracked file with ids and dates, never fact values.
  const shared = cli(s.root, 'content', ['share', '--week', week.week_id])
  assert.equal(shared.status, 0, shared.stdout + shared.stderr)
  const sharedFile = path.join(s.root, 'brand/content-calendar/shared', `${week.week_id}.json`)
  const doc = fs.readFileSync(sharedFile, 'utf8')
  assert.match(doc, /"kind": "content_week"/)
  assert.ok(!doc.includes('Speak from day one'), 'fact values are not copied')
  assert.equal(cli(s.root, 'content', ['share', '--week', drafts[1]!.week_id]).status, 1, 'a draft week is not shared')

  // Refusals: agent token, unknown week command.
  assert.equal(cli(s.root, 'content', ['calendar'], { BRAND_OS_AGENT_TOKEN: 'bos_at_x' }).status, 1)
  assert.equal(cli(s.root, 'content', ['week', 'publish']).status, 2)
})
