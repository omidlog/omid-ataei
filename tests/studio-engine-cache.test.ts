import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { buildProjection } from '../apps/studio/src/projection.js'
import { removeTempDir } from './helpers/cleanup.js'
import { coachBrand } from './helpers/coach.js'

/**
 * BOS-14: the engine parsed the whole answer ledger once per question (applicability, context), so a
 * Studio sync of a finished interview took about 40 s and blocked the server. SYNTHETIC DEMO data only.
 */
function brandWithLongLedger(minRecords: number) {
  const brand = coachBrand({ slug: 'cache-demo', personal: true })
  const ledgerFile = path.join(brand.root, 'brand', 'interview', 'answer-ledger.yaml')
  const candidates = brand.engine.questions().filter((q) => q.sensitivity !== 'restricted' && (q.question_type === 'long_text' || q.question_type === 'short_text'))
  let round = 0
  while (brand.engine.ledger().records.length < minRecords && round < 10) {
    for (const question of candidates) {
      brand.engine.changeAnswer(question.id, `SYNTHETIC DEMO answer ${round} for ${question.id}`)
      if (brand.engine.ledger().records.length >= minRecords) break
    }
    round += 1
  }
  assert.ok(brand.engine.ledger().records.length >= minRecords, 'fixture needs a long ledger')
  return { ...brand, ledgerFile }
}

test('the engine parses the ledger once per change, not once per question', (t) => {
  const brand = brandWithLongLedger(150)
  t.after(() => removeTempDir(brand.root))

  const reads: string[] = []
  const original = fs.readFileSync
  t.mock.method(fs, 'readFileSync', (...args: Parameters<typeof fs.readFileSync>) => {
    reads.push(String(args[0]))
    return original(...args)
  })
  // A fresh engine, as Studio's projection builds one.
  const engine = new (brand.engine.constructor as new (root: string) => typeof brand.engine)(brand.root)
  for (const question of engine.questions()) engine.applicability(question)
  engine.eligible()
  engine.statusReport()
  assert.equal(reads.filter((file) => file === brand.ledgerFile).length, 1, 'ledger parsed more than once without a change')

  // The engine's own write is seen at once.
  const question = engine.questions().find((q) => q.sensitivity !== 'restricted' && (q.question_type === 'long_text' || q.question_type === 'short_text'))!
  const before = engine.ledger().records.length
  engine.changeAnswer(question.id, 'SYNTHETIC DEMO after the cache')
  assert.equal(engine.ledger().records.length, before + 1)
  assert.equal(engine.ledger().records.at(-1)?.value, 'SYNTHETIC DEMO after the cache')

  // Another writer (a second engine, another process) is seen too.
  brand.engine.changeAnswer(question.id, 'SYNTHETIC DEMO from another writer')
  assert.equal(engine.ledger().records.at(-1)?.value, 'SYNTHETIC DEMO from another writer')
})

test('a Studio projection of a long ledger stays inside a fixed time budget', (t) => {
  const brand = brandWithLongLedger(150)
  t.after(() => removeTempDir(brand.root))
  const started = performance.now()
  buildProjection(brand.root, 'cache-demo')
  const elapsed = performance.now() - started
  // Before the cache this fixture took tens of seconds; after it, well under one. The budget leaves room for slow CI.
  assert.ok(elapsed < 8_000, `buildProjection took ${Math.round(elapsed)} ms`)
})
