import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { brandDir, listTree, TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'

/**
 * The Slice D owner journey through the real CLIs, no network: a Pilito-like brand with an existing logo confirms
 * evolve, records equity choices, runs a logo concept round in Creative Learning and reads the brief in en and fa.
 */
useTestKey()

const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')

function cli(script: 'identity' | 'creative', root: string, args: string[], env: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = { ...process.env, BRAND_OS_DATA_KEY: TEST_DATA_KEY, BRAND_OS_KNOWLEDGE_GH: 'off' }
  delete base.BRAND_OS_AGENT_TOKEN
  delete base.BRAND_OS_APPROVAL_PROOF
  delete base.BRAND_OS_RESEARCH_NETWORK
  const merged = { ...base, ...env }
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

function tracked(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const file of listTree(path.join(root, 'brand'))) if (!file.startsWith('.private/')) out[file] = fs.readFileSync(path.join(root, 'brand', file), 'utf8')
  return out
}

test('journey: hint → confirm evolve → equity → concept round → brief in en and fa; nothing tracked changes', () => {
  const root = brandDir({
    slug: 'pilito',
    mutate: (config) => {
      config.onboarding = { identity: { schema_version: 1, source: 'studio_owner_wizard', authority: 'unapproved_owner_intake', logo_presence: 'present', identity_intent: 'evolve', change_depth: 'visual_refresh', recorded_at: '2026-11-22T10:00:00.000Z' } }
    },
  })
  const before = tracked(root)
  const identity = (args: string[], env?: Record<string, string | undefined>) => cli('identity', root, args, env)

  const first = identity(['brief', '--json'])
  assert.equal(first.status, 0, first.stderr)
  const draft = first.json.brief as { path: { value: string; source: string }; authorizes: unknown[] }
  assert.deepEqual([draft.path.value, draft.path.source], ['evolve', 'intake_hint_unconfirmed'], 'the hint pre-selects, it does not decide')
  assert.deepEqual(draft.authorizes, [])

  assert.match(identity(['next']).stdout, /identity\.path/)
  assert.equal(identity(['answer', '--question', 'identity.path', '--value', 'evolve', '--json']).status, 0)
  assert.match(identity(['next', '--lang', 'fa']).stdout, /identity\.change\.reasons/)
  assert.equal(identity(['answer', '--question', 'identity.change.reasons', '--value', 'readability', '--words', 'Hard to read on small phones.']).status, 0)
  assert.equal(identity(['answer', '--question', 'identity.must_not_change', '--value', 'logo_symbol']).status, 0)
  assert.equal(identity(['answer', '--question', 'identity.applications', '--value', 'app_icon,social_avatar']).status, 0)
  assert.equal(identity(['equity', '--component', 'logo_wordmark', '--choice', 'refine', '--evidence', 'owner_reported']).status, 0)
  const refused = identity(['equity', '--component', 'logo_symbol', '--choice', 'preserve', '--evidence', 'measured_study'])
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /refused: measured_study needs/)
  assert.equal(identity(['answer', '--question', 'identity.path', '--value', 'nonsense']).status, 1)

  const creative = (args: string[]) => cli('creative', root, args)
  assert.equal(creative(['project', '--id', 'logo-evolve', '--title', 'Wordmark refresh', '--surface', 'logo', '--series', 'identity']).status, 0)
  assert.equal(creative(['variant', '--project', 'logo-evolve', '--variant', 'A', '--asset', 'missing', '--describe', 'Wider spacing']).status, 0)
  assert.equal(creative(['feedback', '--project', 'logo-evolve', '--variant', 'A', '--text', 'Better, keep the bird.', '--verdict', 'like']).status, 0)
  assert.equal(identity(['link-creative', '--project', 'logo-evolve']).status, 0)

  const en = identity(['brief'])
  assert.equal(en.status, 0, en.stderr)
  assert.match(en.stdout, /# Logo and identity brief \(draft\) — pilito/)
  assert.match(en.stdout, /\[evolve_preserve_equity\]/)
  assert.match(en.stdout, /\[retain_improve_usage\]/)
  assert.match(en.stdout, /\[full_rebrand\]/)
  assert.match(en.stdout, /App icon/)
  assert.doesNotMatch(en.stdout, /Signage/, 'only the uses the owner named')
  assert.match(en.stdout, /- A: draft — Wider spacing/)
  assert.doesNotMatch(en.stdout, /Hard to read on small phones|keep the bird/, 'owner words stay in Knowledge notes')

  const fa = identity(['brief', '--lang', 'fa'])
  assert.match(fa.stdout, /بریف لوگو و هویت/)

  const reviewed = identity(['reviewed', '--json'])
  assert.equal(reviewed.status, 0)
  assert.match(identity(['brief']).stdout, /Owner review: 20/)

  const agent = identity(['brief'], { BRAND_OS_AGENT_TOKEN: 'agt_x' })
  assert.equal(agent.status, 1)
  assert.match(agent.stderr, /refused/)

  assert.deepEqual(tracked(root), before, 'no fact, logo, asset or config change')
})
