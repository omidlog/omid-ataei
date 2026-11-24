import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'
import { strategyBrand } from './helpers/strategy.js'

/** Content Bridge Slice A owner journey through the real brand:content and brand:strategy CLIs (real clock). */
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

test('journey: gaps first, then propose from facts, approve through brand:strategy, show v1, v2 hidden until approved', async () => {
  const s = await strategyBrand('pilito', new Date())
  // With almost no approved facts: an honest gap report, nothing stored.
  const empty = cli(s.root, 'content', ['strategy'])
  assert.equal(empty.status, 0, empty.stderr)
  assert.match(empty.stdout, /No approved fact covers voice/)
  assert.match(empty.stdout, /Nothing was stored/)
  assert.ok(!fs.existsSync(path.join(s.root, 'brand/.private/strategy/records')))
  assert.match(cli(s.root, 'content', ['strategy', '--lang', 'fa']).stdout, /هیچ واقعیت تأییدشده‌ای/)
  assert.match(cli(s.root, 'content', ['strategy', '--lang', 'tr']).stdout, /onaylı bir bilgi yok/)

  for (const [id, value] of [
    ['brand.verbal.voice', 'Warm and plain.'],
    ['brand.verbal.voice_pairs', 'Say what happened | Blame the learner'],
    ['brand.verbal.forbidden', 'Guaranteed fluency; Fake awards'],
    ['business.marketing.pillars', 'Learning stories; Product proof'],
    ['business.marketing.channels', 'Instagram and LinkedIn; not TikTok'],
  ] as const) {
    assert.equal(s.engine.changeAnswer(id, value).kind, 'recorded', id)
    assert.equal(s.engine.approve(id, 'owner', s.proof).kind, 'recorded', id)
  }
  const stored = cli(s.root, 'content', ['strategy', '--cadence', 'instagram=3/week', '--formats', 'instagram=reel+carousel', '--store', '--json'])
  assert.equal(stored.status, 0, stored.stdout + stored.stderr)
  const first = stored.json.stored as { revision: number; content_sha256: string }
  assert.equal(first.revision, 1)
  assert.deepEqual(cli(s.root, 'content', ['show', '--json']).json.views, [], 'draft not shown')

  const review = cli(s.root, 'strategy', ['review', '--id', 'content-main', '--revision', '1'])
  assert.equal(review.status, 0, review.stdout + review.stderr)
  assert.match(review.stdout, /content_strategy\.pillars\[p1\]\.name/)
  assert.equal(cli(s.root, 'strategy', ['approve', '--id', 'content-main', '--revision', '1', '--expect-sha', first.content_sha256, '--json']).json.ok, false, 'no proof, no approval')
  const approved = cli(s.root, 'strategy', ['approve', '--id', 'content-main', '--revision', '1', '--expect-sha', first.content_sha256], { BRAND_OS_APPROVAL_PROOF: s.proof })
  assert.equal(approved.status, 0, approved.stdout + approved.stderr)

  const shown = cli(s.root, 'content', ['show'])
  assert.equal(shown.status, 0, shown.stderr)
  assert.match(shown.stdout, /content-main r1 \(current\)/)
  assert.match(shown.stdout, /Don’t: Blame the learner/)
  assert.match(shown.stdout, /- Guaranteed fluency/)
  assert.match(shown.stdout, /instagram: not decided; reel\+carousel; 3\/week/)

  const out = path.join(s.root, 'v2.json')
  assert.equal(cli(s.root, 'content', ['strategy', '--channels', 'instagram', '--out', out]).status, 0)
  const proposal = JSON.parse(fs.readFileSync(out, 'utf8')) as { content_strategy: { channels: Array<{ role: string | null }> } }
  proposal.content_strategy.channels[0]!.role = 'V2-ROLE-CANARY learner stories'
  fs.writeFileSync(out, JSON.stringify(proposal))
  const v2 = cli(s.root, 'strategy', ['propose', '--id', 'content-main', '--file', out, '--json'])
  assert.equal(v2.status, 0, v2.stdout + v2.stderr)
  const hidden = cli(s.root, 'content', ['show', '--json'])
  assert.equal((hidden.json.views as Array<{ revision: number }>)[0]!.revision, 1)
  assert.deepEqual(hidden.json.withheld, { draft: 1 })
  assert.ok(!hidden.stdout.includes('V2-ROLE-CANARY'))
  assert.match(cli(s.root, 'content', ['show', '--lang', 'fa']).stdout, /هیچ ارسال، زمان‌بندی/)

  // Refusals: agent token, an --out that exists, a bad cadence.
  assert.equal(cli(s.root, 'content', ['show'], { BRAND_OS_AGENT_TOKEN: 'bos_at_x' }).status, 1)
  assert.equal(cli(s.root, 'content', ['strategy', '--out', out]).status, 1)
  assert.equal(cli(s.root, 'content', ['strategy', '--cadence', 'instagram=often']).status, 1)
})
