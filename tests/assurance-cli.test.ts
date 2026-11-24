import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { AGENT_TOKEN_ENV } from '@brand-os/brand-core'
import { approved, assertUnchanged, coachBrand, snapshot as treeSnapshot, type CoachBrand } from './helpers/coach.js'
import { TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

/**
 * `npm run brand:assurance` through the real CLI, in temporary SYNTHETIC DEMO brands, with no network
 * and no model. Every call that touches a brand asserts the brand is byte-for-byte unchanged.
 */
useTestKey()

const CANARY = 'ASSURANCE-CLI-CANARY-5e19'

function cli(root: string, args: string[], env: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = { ...process.env, BRAND_OS_DATA_KEY: TEST_DATA_KEY }
  delete base[AGENT_TOKEN_ENV]
  const merged = { ...base, ...env }
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key]
  const result = spawnSync(NODE, tsxArgs(path.join('scripts', 'assurance.ts'), args), { cwd: root, encoding: 'utf8', env: merged as NodeJS.ProcessEnv, input: '' })
  let json: Record<string, unknown> | null = null
  try {
    json = JSON.parse(result.stdout) as Record<string, unknown>
  } catch {
    json = null
  }
  return { status: result.status, json, stdout: result.stdout, stderr: result.stderr }
}

function demoBrand(): CoachBrand {
  const brand = coachBrand({ slug: 'assurance-cli-demo' })
  approved(brand, 'business.sales.motion', 'self-serve')
  approved(brand, 'business.customer.primary_segment', `SYNTHETIC DEMO segment ${CANARY}`)
  return brand
}

test('cli: help in three languages, usage errors exit 2 and read nothing', () => {
  const brand = demoBrand()
  const before = treeSnapshot(brand.root)
  for (const lang of ['en', 'fa', 'tr']) {
    const help = cli(brand.root, ['help', '--lang', lang])
    assert.equal(help.status, 0)
    assert.match(help.stdout, /brand:assurance/)
    assert.match(help.stdout, /authorizes/)
  }
  assert.match(cli(brand.root, ['help', '--lang', 'fa']).stdout, /فقط‌خواندنی/)
  assert.equal(cli(brand.root, []).status, 2)
  assert.equal(cli(brand.root, ['approve']).status, 2)
  assert.equal(cli(brand.root, ['snapshot', '--as-of', '23-11-2026']).status, 2)
  assert.equal(cli(brand.root, ['snapshot', '--as-of', '2026-02-30']).status, 2)
  assert.equal(cli(brand.root, ['snapshot', '--audience', 'everyone']).status, 2)
  assert.equal(cli(brand.root, ['snapshot', '--paid-media', 'maybe']).status, 2)
  assert.equal(cli(brand.root, ['snapshot', '--lang', 'de']).status, 2)
  assert.equal(cli(brand.root, ['verify']).status, 2, 'verify needs --snapshot')
  assert.equal(cli(brand.root, ['snapshot', '--out', 'x.json']).status, 2, 'there is no output path: nothing is written')
  assertUnchanged(before, brand.root, 'usage errors')
})

test('cli: snapshot, assess and verify print JSON and text in en, fa and tr, reproducibly, and write nothing', () => {
  const brand = demoBrand()
  const before = treeSnapshot(brand.root)

  const first = cli(brand.root, ['snapshot', '--as-of', '2026-11-23', '--paid-media', 'no', '--json'])
  assert.equal(first.status, 0, first.stderr)
  const second = cli(brand.root, ['snapshot', '--as-of', '2026-11-23', '--paid-media', 'no', '--json'])
  assert.equal(first.stdout, second.stdout, 'two runs print byte-identical snapshots')
  assert.equal(first.json?.schema, 'brand-os.assurance-snapshot/1')
  assert.equal(first.json?.scoreable, false, 'PRR-08 needs a person, so a real brand has no score yet')
  assert.deepEqual(first.json?.authorizes, [])

  for (const lang of ['en', 'fa', 'tr']) {
    const text = cli(brand.root, ['assess', '--as-of', '2026-11-23', '--paid-media', 'no', '--lang', lang])
    assert.equal(text.status, 0, text.stderr)
    assert.ok(text.stdout.includes(String(first.json?.source_snapshot_digest)), `${lang}: the digest is printed`)
    assert.ok(!text.stdout.includes(CANARY), `${lang}: no value is printed`)
    assert.match(text.stdout, /PRR-08/)
  }
  const fa = cli(brand.root, ['assess', '--as-of', '2026-11-23', '--paid-media', 'no', '--lang', 'fa']).stdout
  assert.match(fa, /گواهی‌نامه/, 'the Persian output carries the no-certification disclaimer')

  const assessed = cli(brand.root, ['assess', '--as-of', '2026-11-23', '--paid-media', 'no', '--json'])
  const assessment = assessed.json?.assessment as { completeness: { numerator: number | null }; claim_level: string }
  assert.equal(assessment.completeness.numerator, null)
  assert.equal(assessment.claim_level, 'internally_assessed')

  // The owner keeps a snapshot outside the brand and verifies it later.
  const keep = fs.mkdtempSync(path.join(os.tmpdir(), 'assurance-kept-'))
  const kept = path.join(keep, 'snapshot.json')
  fs.writeFileSync(kept, first.stdout)
  const same = cli(brand.root, ['verify', '--snapshot', kept, '--json'])
  assert.equal(same.status, 0, same.stderr)
  assert.equal(same.json?.reproduced, true)
  assert.equal(cli(brand.root, ['verify', '--snapshot', kept, '--as-of', '2026-11-24']).status, 2, 'verify takes its options from the kept snapshot')
  assertUnchanged(before, brand.root, 'snapshot, assess and verify')

  // After a newly approved fact, the kept snapshot no longer reproduces: exit 3, a finding, not a crash.
  approved(brand, 'brand.strategy.promise', 'SYNTHETIC DEMO promise')
  const different = cli(brand.root, ['verify', '--snapshot', kept, '--lang', 'tr'])
  assert.equal(different.status, 3)
  assert.match(different.stdout, /Yeniden üretilemedi/)

  // --pin accepts the kept file too.
  assert.equal(cli(brand.root, ['snapshot', '--as-of', '2026-11-23', '--paid-media', 'no', '--pin', kept, '--json']).status, 0)
})

test('cli: refused while an agent token is set, with no brand data in the output', () => {
  const brand = demoBrand()
  const before = treeSnapshot(brand.root)
  for (const args of [['snapshot', '--json'], ['assess'], ['verify', '--snapshot', 'whatever.json', '--lang', 'fa']]) {
    const result = cli(brand.root, args, { [AGENT_TOKEN_ENV]: 'bos_agent_not-a-real-token' })
    assert.equal(result.status, 1, args.join(' '))
    assert.match(`${result.stdout}${result.stderr}`, /refused/)
    assert.ok(!`${result.stdout}${result.stderr}`.includes('assurance-cli-demo'), 'not even the brand id is printed')
    assert.ok(!`${result.stdout}${result.stderr}`.includes('bos_agent_not-a-real-token'), 'the token is never echoed')
  }
  assertUnchanged(before, brand.root, 'agent refusal')
})

test('cli: a snapshot file that is a symlink, missing or malformed is refused without echoing it', () => {
  const brand = demoBrand()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assurance-bad-'))
  const bad = path.join(dir, 'bad.json')
  fs.writeFileSync(bad, `{"schema":"nope","secret":"${CANARY}"}`)
  const link = path.join(dir, 'link.json')
  fs.symlinkSync(bad, link)
  for (const file of [bad, link, path.join(dir, 'absent.json')]) {
    const result = cli(brand.root, ['verify', '--snapshot', file, '--json'])
    assert.equal(result.status, 1)
    assert.equal((result.json?.error as { code: string }).code, 'invalid_pin')
    assert.ok(!result.stdout.includes(CANARY))
  }
})

test('cli: outside a brand repository the command says so', () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'assurance-not-a-brand-'))
  const result = cli(outside, ['snapshot', '--json'])
  assert.equal(result.status, 1)
  assert.equal((result.json?.error as { code: string }).code, 'not_a_brand')
})

test('cli: the bridge is not reachable through brand:query', () => {
  const brand = demoBrand()
  for (const tool of ['assurance', 'assurance_snapshot', 'assess']) {
    const query = spawnSync(NODE, tsxArgs(path.join('scripts', 'brand.ts'), ['query', '--tool', tool, '--json']), { cwd: brand.root, encoding: 'utf8', input: '' })
    assert.notEqual(query.status, 0, `${tool} is not a retrieval tool`)
    assert.ok(!query.stdout.includes('brand-os.assurance-snapshot/1'))
  }
})

test('cli: --paid-media is a deprecated alias; the notice goes to stderr in the chosen language and JSON stays clean', () => {
  const brand = demoBrand()
  const plain = cli(brand.root, ['snapshot', '--as-of', '2026-11-23', '--json'])
  assert.equal(plain.status, 0)
  assert.equal(plain.stderr.includes('--paid-media'), false, 'no notice without the flag')

  const flagged = cli(brand.root, ['snapshot', '--as-of', '2026-11-23', '--paid-media', 'no', '--json'])
  assert.equal(flagged.status, 0, 'existing callers keep working')
  assert.equal((flagged.json?.subject as Record<string, string>).runs_paid_media, 'no')
  assert.match(flagged.stderr, /deprecated/)
  assert.match(flagged.stderr, /business\.marketing\.paid_media/)
  assert.match(cli(brand.root, ['snapshot', '--as-of', '2026-11-23', '--paid-media', 'no', '--lang', 'fa']).stderr, /منسوخ/)

  approved(brand, 'business.marketing.paid_media', 'yes')
  const answered = cli(brand.root, ['assess', '--as-of', '2026-11-23', '--paid-media', 'no', '--json'])
  assert.equal(answered.status, 0)
  assert.equal(((answered.json?.snapshot as Record<string, unknown>).subject as Record<string, string>).runs_paid_media, 'yes', 'the approved answer wins')
  assert.match(answered.stderr, /ignored/)
})

test('cli: an approved undecided answer wins over --paid-media; the notice says the interview answer is used (en/fa/tr)', () => {
  const brand = demoBrand()
  approved(brand, 'business.marketing.paid_media', 'undecided')
  const plain = cli(brand.root, ['snapshot', '--as-of', '2026-11-23', '--json'])
  const flagged = cli(brand.root, ['snapshot', '--as-of', '2026-11-23', '--paid-media', 'yes', '--json'])
  assert.equal(flagged.status, 0)
  assert.equal((flagged.json?.subject as Record<string, string>).runs_paid_media, 'unknown', 'the flag does not fill an undecided answer')
  assert.equal(flagged.json?.source_snapshot_digest, plain.json?.source_snapshot_digest)
  assert.match(flagged.stderr, /ignored/)
  assert.match(flagged.stderr, /"undecided"/)
  assert.match(flagged.stderr, /that answer is used/)
  assert.match(cli(brand.root, ['snapshot', '--as-of', '2026-11-23', '--paid-media', 'yes', '--lang', 'fa']).stderr, /نادیده گرفته شد[^\n]*undecided/)
  assert.match(cli(brand.root, ['snapshot', '--as-of', '2026-11-23', '--paid-media', 'no', '--lang', 'tr']).stderr, /yok sayıldı[^\n]*undecided/)
  assert.equal(plain.stderr.includes('--paid-media'), false, 'no notice without the flag')
})
