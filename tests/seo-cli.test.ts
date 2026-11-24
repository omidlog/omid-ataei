import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { brandDir, TEST_DATA_KEY } from './helpers/knowledge.js'
import { BUNDLE_FILE, REQUEST_FILE } from './helpers/seo.js'

/** The Sprint 2 journey through the real brand:seo CLI in a temporary brand. No network. */

const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')

function seo(root: string, args: string[], env: Record<string, string | undefined> = {}): { status: number | null; json: Record<string, unknown>; stdout: string; stderr: string } {
  const base: Record<string, string | undefined> = { ...process.env, BRAND_OS_DATA_KEY: TEST_DATA_KEY, BRAND_OS_KNOWLEDGE_GH: 'off' }
  delete base.BRAND_OS_AGENT_TOKEN
  delete base.BRAND_OS_RESEARCH_NETWORK
  const result = spawnSync(tsx, [path.join(repo, 'scripts', 'seo.ts'), ...args], { cwd: root, encoding: 'utf8', env: { ...base, ...env } as NodeJS.ProcessEnv })
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(result.stdout) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: result.status, json, stdout: result.stdout, stderr: result.stderr }
}

/**
 * The CLI runs on the real clock, so the recorded bundle would go stale over time and this test would rot. It replays
 * a temporary copy whose dates are moved to yesterday; the fixed-clock tests use the original dates.
 */
function freshBundleCopy(root: string): string {
  const bundle = JSON.parse(fs.readFileSync(BUNDLE_FILE, 'utf8')) as { recorded_at: string; sources: Array<{ retrieved_at: string }> }
  const shift = Date.now() - 86_400_000 - Date.parse(bundle.recorded_at)
  const moved = (iso: string) => new Date(Date.parse(iso) + shift).toISOString()
  bundle.recorded_at = moved(bundle.recorded_at)
  for (const source of bundle.sources) source.retrieved_at = moved(source.retrieved_at)
  const file = path.join(root, 'bundle-fresh-copy.json')
  fs.writeFileSync(file, JSON.stringify(bundle))
  return file
}

test('journey: offline plan, then recorded research, cited plan, critic on a tampered draft', () => {
  const root = brandDir({ slug: 'duckalarm' })
  const bundleFile = freshBundleCopy(root)

  // Research capability is reported honestly before anything else.
  const status = seo(root, ['research', 'status', '--json'])
  assert.equal(status.status, 0)
  assert.deepEqual([(status.json.capability as { state: string }).state, (status.json.capability as { adapter: string }).adapter], ['unavailable', 'none'])
  const capture = seo(root, ['research', 'capture', '--request', REQUEST_FILE, '--json'])
  assert.equal(capture.status, 3, 'no network permission: research_unavailable, nothing fetched')
  assert.equal(capture.json.research, 'research_unavailable')

  // Interview: one question at a time, with reasons; an app-only brand.
  const first = seo(root, ['questions', '--json'])
  assert.equal(((first.json.state as { next: { id: string } }).next).id, 'seo.presence.web')
  const answers: Array<[string, string, string?]> = [
    ['seo.presence.web', 'none', 'Localized example (tr): Web sitemiz yok, sadece iOS uygulaması var.'],
    ['seo.presence.app', 'ios'],
    ['seo.business.model', 'b2c'],
    ['seo.goal.primary', 'app_installs'],
    ['seo.goal.timeframe', '3_to_12_months'],
    ['seo.market.locales', 'en,tr'],
    ['seo.data.analytics', 'unknown'],
    ['seo.content.capacity', 'low'],
    ['seo.content.firsthand', 'none'],
    ['seo.competitors.named', 'unknown'],
    ['seo.app.store_status', 'live'],
    ['seo.app.web_openness', 'later'],
    ['seo.geo.interest', 'no'],
  ]
  for (const [question, value, words] of answers) {
    const out = seo(root, ['answer', '--question', question, '--value', value, ...(words ? ['--words', words, '--lang', 'tr'] : []), '--json'])
    assert.equal(out.status, 0, out.stdout + out.stderr)
  }
  const done = seo(root, ['questions', '--json']).json.state as { complete: boolean; skipped: Array<{ id: string }> }
  assert.equal(done.complete, true)
  assert.ok(done.skipped.some((item) => item.id === 'seo.web.control'))
  assert.equal(seo(root, ['answer', '--question', 'seo.presence.web', '--value', 'blog', '--json']).status, 1)

  // Offline plan.
  const offline = seo(root, ['plan', '--json'])
  assert.equal(offline.status, 0, offline.stdout + offline.stderr)
  const offlinePlan = offline.json.plan as { research: { status: string }; label: string; markdown: string }
  assert.deepEqual([offlinePlan.research.status, offlinePlan.label], ['research_unavailable', 'provisional'])
  assert.equal((offline.json.critic as { verdict: string }).verdict, 'pass')
  assert.ok(fs.existsSync(path.join(root, (offline.json.saved as { markdown: string }).markdown)))

  // Recorded research (real official pages, recorded 2026-11-22) through the Knowledge Inbox.
  const replay = seo(root, ['research', 'replay', '--bundle', bundleFile, '--json'])
  assert.equal(replay.status, 0, replay.stderr)
  assert.deepEqual([...new Set((replay.json.results as Array<{ outcome: string }>).map((item) => item.outcome))], ['recorded'])
  assert.deepEqual([...new Set((seo(root, ['research', 'replay', '--bundle', bundleFile, '--json']).json.results as Array<{ outcome: string }>).map((item) => item.outcome))], ['deduplicated'])
  const listed = seo(root, ['research', 'list', '--json']).json.items as Array<{ provenance: string; adapter: string; retrieved_at: string }>
  assert.equal(listed.length, 8)
  assert.ok(listed.every((item) => /^knowledge:kn_/.test(item.provenance) && Date.now() - Date.parse(item.retrieved_at) < 2 * 86_400_000))

  const researched = seo(root, ['plan', '--json'], { BRAND_OS_RESEARCH_NETWORK: undefined })
  const plan = researched.json.plan as { research: { status: string }; archetype: string; markdown: string; decisions: Array<{ id: string; status: string }> }
  assert.equal(plan.research.status, 'researched')
  assert.equal(plan.archetype, 'app_only')
  assert.equal(plan.decisions.find((item) => item.id === 'app.promo-text')?.status, 'cited')
  assert.ok(!plan.decisions.some((item) => item.id.startsWith('geo.')), 'the owner said AI discovery does not matter')
  assert.equal((researched.json.critic as { verdict: string }).verdict, 'pass')

  // The critic re-checks a saved draft; an invented claim added to it is caught.
  const saved = path.join(root, (researched.json.saved as { json: string }).json)
  assert.equal(seo(root, ['critique', '--plan', saved, '--json']).status, 0)
  const doc = JSON.parse(fs.readFileSync(saved, 'utf8')) as { plan: { markdown: string } }
  doc.plan.markdown = doc.plan.markdown.replace('## Measurement', 'Apple requires at least 20 screenshots and the App Store algorithm rewards weekly updates.\n\n## Measurement')
  const forged = path.join(root, 'forged.json')
  fs.writeFileSync(forged, JSON.stringify(doc))
  const blocked = seo(root, ['critique', '--plan', forged, '--json'])
  assert.equal(blocked.status, 5)
  assert.ok((blocked.json.critic as { blocking_findings: Array<{ code: string }> }).blocking_findings.some((item) => item.code === 'uncited_policy_claim'))

  // An agent token is refused everywhere.
  const agent = seo(root, ['plan', '--json'], { BRAND_OS_AGENT_TOKEN: 'bos_agent_anything' })
  assert.equal(agent.status, 1)
  assert.equal((agent.json.error as { code: string }).code, 'refused')
})
