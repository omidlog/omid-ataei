import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { backupBrand, resetInterviewState, restoreBrand, RESET_CONFIRMATION } from '../packages/brand-core/src/backup.js'
import { disabledModule, evaluateCondition, moduleEnabled, personalConfig, shouldSkip, type ConditionContext } from '../packages/brand-core/src/conditions.js'
import { findContradictions } from '../packages/brand-core/src/contradictions.js'
import type { AnswerRecord, BrandConfig, FieldQuestion } from '../packages/brand-core/src/types.js'

/** Direct tests for brand-core modules that were only covered through the CLI and the engine: backup, conditions, contradictions. */

process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')

function config(overrides: { mascot?: boolean; gamification?: boolean; personal?: unknown; profile?: string; capabilities?: Record<string, boolean>; sector?: string } = {}): BrandConfig {
  return {
    brand: { profile: overrides.profile ?? 'universal', sector: overrides.sector ?? 'education' },
    capabilities: overrides.capabilities ?? { app: true, store: false },
    modules: {
      mascot: { enabled: overrides.mascot ?? false, note: '' },
      gamification: { enabled: overrides.gamification ?? false, note: '' },
      ...(overrides.personal === undefined ? {} : { personal: overrides.personal }),
    },
  } as unknown as BrandConfig
}

function answer(questionId: string, value: AnswerRecord['value'], status: AnswerRecord['status'] = 'answered' as AnswerRecord['status']): AnswerRecord {
  return { question_id: questionId, value, status } as AnswerRecord
}

function answers(...records: AnswerRecord[]): Map<string, AnswerRecord> {
  return new Map(records.map((record) => [record.question_id, record]))
}

function ctx(cfg: BrandConfig, ...records: AnswerRecord[]): ConditionContext {
  return { config: cfg, answers: answers(...records) }
}

// ---------------------------------------------------------------- conditions

test('personalConfig: absent or malformed means disabled, and unknown facets are dropped', () => {
  assert.deepEqual(personalConfig(config()), { enabled: false, facets: [] })
  assert.deepEqual(personalConfig(config({ personal: 'yes' })), { enabled: false, facets: [] })
  assert.deepEqual(personalConfig(config({ personal: { enabled: 'true', facets: 'speaker-author' } })), { enabled: false, facets: [] })
  assert.deepEqual(personalConfig(config({ personal: { enabled: true, facets: ['speaker-author', 'astronaut'] } })), { enabled: true, facets: ['speaker-author'] })
})

test('moduleEnabled follows the mascot, gamification and personal flags; facet modules also need their facet', () => {
  const off = config()
  const on = config({ mascot: true, gamification: true, personal: { enabled: true, facets: ['creator-educator'] } })
  assert.equal(moduleEnabled({}, off), true, 'non-optional modules are always on')
  assert.equal(moduleEnabled({ optional: 'mascot' }, off), false)
  assert.equal(moduleEnabled({ optional: 'mascot' }, on), true)
  assert.equal(moduleEnabled({ optional: 'gamification' }, off), false)
  assert.equal(moduleEnabled({ optional: 'gamification' }, on), true)
  assert.equal(moduleEnabled({ optional: 'personal' }, off), false)
  assert.equal(moduleEnabled({ optional: 'personal' }, on), true)
  assert.equal(moduleEnabled({ optional: 'personal', facet: 'creator-educator' }, on), true)
  assert.equal(moduleEnabled({ optional: 'personal', facet: 'speaker-author' }, on), false)
})

test('disabledModule hides questions of switched-off modules only', () => {
  const off = ctx(config())
  const on = ctx(config({ mascot: true, gamification: true, personal: { enabled: true, facets: [] } }))
  for (const id of ['brand.mascot.name', 'brand.gamification.points', 'personal.identity.name']) {
    assert.equal(disabledModule(id, off), true, id)
    assert.equal(disabledModule(id, on), false, id)
  }
  assert.equal(disabledModule('business.identity.trade_name', off), false)
})

test('evaluateCondition: always, never, empty and config comparisons', () => {
  const c = ctx(config({ mascot: true, profile: 'founder-core', capabilities: { app: true }, personal: { enabled: true, facets: ['artist-designer'] } }))
  assert.equal(evaluateCondition(undefined, c), true)
  assert.equal(evaluateCondition('  ', c), true)
  assert.equal(evaluateCondition('always', c), true)
  assert.equal(evaluateCondition('never', c), false)
  assert.equal(evaluateCondition('config.modules.mascot == true', c), true)
  assert.equal(evaluateCondition('config.modules.mascot != true', c), false)
  assert.equal(evaluateCondition('config.modules.gamification == false', c), true)
  assert.equal(evaluateCondition('config.modules.personal == true', c), true)
  assert.equal(evaluateCondition('config.brand.profile == founder-core', c), true)
  assert.equal(evaluateCondition('config.brand.sector == education', c), true)
  assert.equal(evaluateCondition('config.capabilities.app == true', c), true)
  // A capability that is not configured makes every comparison false, including !=.
  assert.equal(evaluateCondition('config.capabilities.unknown == true', c), false)
  assert.equal(evaluateCondition('config.capabilities.unknown != true', c), false)
  assert.equal(evaluateCondition('config.not.a.path == x', c), false)
})

test('evaluateCondition: personal facets has/lacks, and an unknown facet is an error', () => {
  const c = ctx(config({ personal: { enabled: true, facets: ['artist-designer'] } }))
  assert.equal(evaluateCondition('config.modules.personal.facets has artist-designer', c), true)
  assert.equal(evaluateCondition('config.modules.personal.facets lacks artist-designer', c), false)
  assert.equal(evaluateCondition('config.modules.personal.facets has speaker-author', c), false)
  assert.equal(evaluateCondition('config.modules.personal.facets lacks speaker-author', c), true)
  assert.throws(() => evaluateCondition('config.modules.personal.facets has astronaut', c), /Unknown personal facet/)
})

test('evaluateCondition: answer comparisons treat a missing answer as false', () => {
  const c = ctx(config(), answer('a.b', 'b2b'), answer('a.n', 3), answer('a.null', null))
  assert.equal(evaluateCondition('answers[a.b] == b2b', c), true)
  assert.equal(evaluateCondition('answers[a.b] != b2c', c), true)
  assert.equal(evaluateCondition('answers[a.b] != b2b', c), false)
  assert.equal(evaluateCondition('answers[a.n] == 3', c), true, 'numbers compare as text')
  assert.equal(evaluateCondition('answers[a.b] in b2c, b2b', c), true)
  assert.equal(evaluateCondition('answers[a.b] not_in b2c,b2b', c), false)
  assert.equal(evaluateCondition('answers[a.b] not_in b2c', c), true)
  for (const id of ['a.missing', 'a.null']) {
    assert.equal(evaluateCondition(`answers[${id}] == x`, c), false, id)
    assert.equal(evaluateCondition(`answers[${id}] != x`, c), false, id)
    assert.equal(evaluateCondition(`answers[${id}] in x,y`, c), false, id)
    assert.equal(evaluateCondition(`answers[${id}] not_in x,y`, c), false, id)
  }
})

test('evaluateCondition rejects anything outside the small grammar; shouldSkip without a rule never skips', () => {
  const c = ctx(config())
  for (const expression of ['sometimes', 'config.modules.mascot', 'answers[a] > 1', 'true && false']) {
    assert.throws(() => evaluateCondition(expression, c), /Unsupported condition/, expression)
  }
  assert.equal(shouldSkip(undefined, c), false)
  assert.equal(shouldSkip('', c), false)
  assert.equal(shouldSkip('never', c), false)
  assert.equal(shouldSkip('config.modules.mascot == false', c), true)
})

// ------------------------------------------------------------ contradictions

function question(id: string, module = 'core'): FieldQuestion {
  return { id, module } as FieldQuestion
}

test('findContradictions flags a public name that differs from the trade name, ignoring case and "same"', () => {
  const rules = (records: AnswerRecord[]): string[] => findContradictions([], answers(...records), true, true).map((item) => item.rule)
  assert.deepEqual(rules([answer('business.identity.trade_name', 'Acme Ltd'), answer('brand.identity.public_name_override', 'Acme')]), ['name-divergence'])
  assert.deepEqual(rules([answer('business.identity.trade_name', 'Acme'), answer('brand.identity.public_name_override', ' acme ')]), [])
  assert.deepEqual(rules([answer('business.identity.trade_name', 'Acme'), answer('brand.identity.public_name_override', 'Same')]), [])
  // Unknown or skipped answers are not values and cannot contradict anything.
  assert.deepEqual(rules([answer('business.identity.trade_name', 'Acme'), answer('brand.identity.public_name_override', 'Other', 'unknown' as AnswerRecord['status'])]), [])
  assert.deepEqual(rules([answer('business.identity.trade_name', 'Acme', 'skipped' as AnswerRecord['status']), answer('brand.identity.public_name_override', 'Other')]), [])
})

test('findContradictions flags marketing an unshipped product as available', () => {
  const found = findContradictions([], answers(answer('business.marketing.availability_claim', 'available'), answer('business.product.public_status', 'unshipped')), true, true)
  assert.equal(found.length, 1)
  assert.equal(found[0]?.id, 'con-unshipped-claim')
  assert.equal(found[0]?.severity, 'high')
  assert.deepEqual(found[0]?.fields, ['business.marketing.availability_claim', 'business.product.public_status'])
  assert.equal(findContradictions([], answers(answer('business.marketing.availability_claim', 'waitlist'), answer('business.product.public_status', 'unshipped')), true, true).length, 0)
})

test('findContradictions flags approved placeholders but not drafts holding them', () => {
  const approved = 'approved' as AnswerRecord['status']
  const found = findContradictions([], answers(answer('a.one', 'TBD', approved), answer('a.two', ' Example only ', approved), answer('a.three', 'TBD'), answer('a.four', 'Real value', approved), answer('a.five', null, approved)), true, true)
  assert.deepEqual(found.map((item) => item.id).sort(), ['con-approved-placeholder-a.one', 'con-approved-placeholder-a.two'])
})

test('findContradictions flags approved answers of switched-off modules, except the module switch itself', () => {
  const approved = 'approved' as AnswerRecord['status']
  const questions = [question('brand.mascot.enabled', 'mascot-identity'), question('brand.mascot.name', 'mascot-identity')]
  const records = answers(
    answer('brand.mascot.enabled', 'false', approved),
    answer('brand.mascot.name', 'Pip', approved),
    answer('brand.mascot.unregistered', 'x', approved),
    answer('brand.gamification.enabled', 'false', approved),
    answer('brand.gamification.points', 'xp', approved),
    answer('brand.gamification.badges', 'draft only'),
  )
  const off = findContradictions(questions, records, false, false).map((item) => item.id)
  assert.deepEqual(off.sort(), ['con-game-approved-while-disabled-brand.gamification.points', 'con-mascot-approved-while-disabled-brand.mascot.name'])
  assert.deepEqual(findContradictions(questions, records, true, true), [])
})

// -------------------------------------------------------------------- backup

function tempBrand(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-core-backup-'))
  const write = (relative: string, body: string): void => {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true })
    fs.writeFileSync(path.join(root, relative), body)
  }
  write('brand/brand.config.yaml', 'brand:\n  slug: test-brand\n')
  write('brand/interview/answer-ledger.yaml', 'schema_version: 1\nrecords: [one]\n')
  write('brand/instance/approved-facts.yaml', 'schema_version: 1\nfacts: { a: 1 }\n')
  write('brand/interview/evidence-register.yaml', 'items: [e1]\n')
  write('brand/.private/key', 'must-not-be-copied')
  write('brand/.private/note.txt', 'private note')
  write('outside/secret.txt', 'not part of the brand')
  return root
}

function encryptPayload(directory: string, files: Array<{ path: string; data: string }>): void {
  const key = Buffer.from(process.env.BRAND_OS_DATA_KEY ?? '', 'base64')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(JSON.stringify({ files }), 'utf8'), cipher.final()])
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'backup.enc'), body)
  const manifest = { files: files.length, checksum: crypto.createHash('sha256').update(body).digest('hex'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), encrypted: true }
  fs.writeFileSync(path.join(directory, 'backup-manifest.json'), JSON.stringify(manifest))
}

test('backupBrand encrypts only brand files, skips key files, uses 0600 and refuses a non-empty destination', () => {
  const root = tempBrand()
  try {
    const saved = backupBrand(root)
    assert.deepEqual(saved.files, ['brand/.private/note.txt', 'brand/brand.config.yaml', 'brand/instance/approved-facts.yaml', 'brand/interview/answer-ledger.yaml', 'brand/interview/evidence-register.yaml'])
    assert.ok(saved.directory.startsWith(path.join(root, 'brand/.private/backups')))
    const enc = fs.readFileSync(path.join(saved.directory, 'backup.enc'))
    assert.equal(enc.includes(Buffer.from('private note')), false, 'contents are encrypted')
    assert.equal(enc.includes(Buffer.from('test-brand')), false)
    const manifest = JSON.parse(fs.readFileSync(path.join(saved.directory, 'backup-manifest.json'), 'utf8')) as { files: number; checksum: string; encrypted: boolean }
    assert.equal(manifest.files, 5)
    assert.equal(manifest.checksum, saved.checksum)
    assert.equal(manifest.encrypted, true)
    if (process.platform !== 'win32') {
      for (const name of ['backup.enc', 'backup-manifest.json']) assert.equal(fs.statSync(path.join(saved.directory, name)).mode & 0o777, 0o600, name)
    }
    // A second backup never includes earlier backups.
    const second = backupBrand(root, path.join(root, 'brand/.private/backups/second'))
    assert.equal(second.files.some((file) => file.includes('backups/')), false)
    assert.throws(() => backupBrand(root, saved.directory), /Refusing to overwrite/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('restoreBrand round-trips, and refuses a tampered, missing or unsafe backup without writing anything', () => {
  const root = tempBrand()
  try {
    const saved = backupBrand(root)
    fs.writeFileSync(path.join(root, 'brand/interview/answer-ledger.yaml'), 'changed\n')
    fs.rmSync(path.join(root, 'brand/instance/approved-facts.yaml'))
    const { restored } = restoreBrand(root, saved.directory)
    assert.deepEqual(restored, saved.files)
    assert.equal(fs.readFileSync(path.join(root, 'brand/interview/answer-ledger.yaml'), 'utf8'), 'schema_version: 1\nrecords: [one]\n')
    assert.equal(fs.readFileSync(path.join(root, 'brand/instance/approved-facts.yaml'), 'utf8'), 'schema_version: 1\nfacts: { a: 1 }\n')

    assert.throws(() => restoreBrand(root, path.join(root, 'nowhere')), /Encrypted backup is missing/)

    const tampered = path.join(root, 'tampered')
    fs.cpSync(saved.directory, tampered, { recursive: true })
    const enc = fs.readFileSync(path.join(tampered, 'backup.enc'))
    enc[0] = (enc[0] ?? 0) ^ 0xff
    fs.writeFileSync(path.join(tampered, 'backup.enc'), enc)
    assert.throws(() => restoreBrand(root, tampered), /checksum mismatch/)

    const before = fs.readFileSync(path.join(root, 'brand/interview/answer-ledger.yaml'), 'utf8')
    for (const unsafe of ['../escape.txt', 'brand/../outside/secret.txt', '/etc/passwd', 'brand\\interview\\x', 'brand/.private/backups/x', 'scripts/evil.ts', 'brand/interview/./x', 'brand//x']) {
      const dir = path.join(root, `unsafe-${crypto.randomBytes(4).toString('hex')}`)
      encryptPayload(dir, [
        { path: 'brand/interview/answer-ledger.yaml', data: Buffer.from('overwritten\n').toString('base64') },
        { path: unsafe, data: Buffer.from('x').toString('base64') },
      ])
      assert.throws(() => restoreBrand(root, dir), /Unsafe backup path/, unsafe)
    }
    assert.equal(fs.readFileSync(path.join(root, 'brand/interview/answer-ledger.yaml'), 'utf8'), before, 'nothing was written')
    assert.equal(fs.existsSync(path.join(path.dirname(root), 'escape.txt')), false)
    assert.equal(fs.readFileSync(path.join(root, 'outside/secret.txt'), 'utf8'), 'not part of the brand')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('resetInterviewState needs the exact sentence, backs up first and clears interview state and evidence', () => {
  const root = tempBrand()
  try {
    assert.throws(() => resetInterviewState(root, 'yes'), /exact confirmation sentence/)
    assert.equal(fs.existsSync(path.join(root, 'brand/.private/backups')), false, 'a refused reset does not even back up')
    const { backup } = resetInterviewState(root, RESET_CONFIRMATION)
    assert.ok(fs.existsSync(path.join(backup, 'backup.enc')))
    assert.equal(fs.readFileSync(path.join(root, 'brand/interview/answer-ledger.yaml'), 'utf8'), 'schema_version: 1\nrecords: []\n')
    assert.equal(fs.readFileSync(path.join(root, 'brand/instance/approved-facts.yaml'), 'utf8'), 'schema_version: 1\nfacts: {}\n')
    assert.equal(fs.existsSync(path.join(root, 'brand/interview/evidence-register.yaml')), false)
    // The backup taken by the reset brings the old state back.
    restoreBrand(root, backup)
    assert.equal(fs.readFileSync(path.join(root, 'brand/interview/answer-ledger.yaml'), 'utf8'), 'schema_version: 1\nrecords: [one]\n')
    assert.equal(fs.readFileSync(path.join(root, 'brand/interview/evidence-register.yaml'), 'utf8'), 'items: [e1]\n')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
