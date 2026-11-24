import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import {
  addCandidate,
  CompetitiveError,
  linkEvidence,
  readSharedLandscape,
  setStatus,
  SHARED_LANDSCAPE_PATH,
  shareLandscape,
  validSharedLandscape,
  verifyDomain,
  type SharedLandscape,
} from '@brand-os/brand-core/competitive'
import { unavailableAdapter } from '@brand-os/brand-core/research'
import { MESSAGE_QUOTE, NOW, PRICE_QUOTE, record, source, VISUAL_QUOTE, wordflightSources } from './helpers/competitive.js'
import { listTree, useTestKey, workspace } from './helpers/knowledge.js'

/**
 * Visual V2.2 / D1: the competitor share path. The shared file is an allow-list projection of owner-reviewed
 * competitors. These tests prove what may leave brand/.private and, with canaries, what never does.
 */
useTestKey()

const OFFLINE = unavailableAdapter().capability(NOW)
const PRO_PRICE = { offer_name: 'Pro', amount: 12, currency: 'USD', billing_period: 'month', billing_commitment: 'annual', market: 'US', tax_inclusion: 'excluded', promotion: 'none_observed', feature_scope: null }
const REASON_CANARY = 'PRIVATE-REASON-CANARY-7731'
const EMAIL_CANARY = 'founder.canary@wordflight-app.com'

/** Every key the shared file may carry, per object kind. Anything else fails the test. */
const ALLOWED_KEYS: Record<string, string[]> = {
  root: ['schema', 'schema_version', 'kind', 'brand_slug', 'as_of', 'criteria', 'competitors', 'prices', 'not_shared', 'withheld_text', 'authorizes'],
  competitor: ['competitor_id', 'display_name', 'relationship', 'geographic_relevance', 'markets', 'official_domain', 'assessment', 'cells'],
  cell: ['criterion', 'state', 'labels', 'sources'],
  source: ['source_class', 'host', 'observed_on'],
  prices: ['rows', 'ranked', 'currency_conversion'],
  price: ['competitor_id', 'offer_name', 'amount', 'currency', 'market', 'billing_period', 'billing_commitment', 'tax_inclusion', 'promotion', 'feature_scope', 'rate_label', 'state', 'source'],
  not_shared: ['candidates', 'disputed', 'archived'],
}

function keysOnly(obj: object, kind: string): void {
  for (const key of Object.keys(obj)) assert.ok(ALLOWED_KEYS[kind]!.includes(key), `${kind} carries an unexpected field ${key}`)
}

function assertAllowListed(doc: SharedLandscape): void {
  keysOnly(doc, 'root')
  keysOnly(doc.prices, 'prices')
  keysOnly(doc.not_shared, 'not_shared')
  for (const c of doc.competitors) {
    keysOnly(c, 'competitor')
    for (const cell of c.cells) {
      keysOnly(cell, 'cell')
      for (const s of cell.sources) keysOnly(s, 'source')
    }
  }
  for (const p of doc.prices.rows) {
    keysOnly(p, 'price')
    keysOnly(p.source, 'source')
  }
}

function code(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof CompetitiveError) return error.code
    throw error
  }
  return 'no_error'
}

/** One owner-reviewed competitor with a price, a message, a hypothesis and a verified domain; one candidate; one disputed. */
function seeded() {
  const { root, ws } = workspace({ slug: 'pilito', now: () => NOW })
  const { pricing, home } = wordflightSources(ws)
  const wf = addCandidate(ws, { display_name: 'WordFlight', relationship: 'direct', geography: 'international', markets: 'US,TR', domain: 'wordflight-app.com' })
  linkEvidence(ws, { competitor_id: wf.competitor_id, note: pricing.provenance, claim_key: 'wordflight.pricing.pro', dimension: 'public_price', label: 'Pro plan on own pricing page', price: PRO_PRICE })
  linkEvidence(ws, { competitor_id: wf.competitor_id, note: home.note_id, claim_key: 'wordflight.message.five_minutes', dimension: 'public_message', label: 'Short daily lessons' })
  // A label that is the quote itself must never leave, nor one carrying contact data.
  linkEvidence(ws, { competitor_id: wf.competitor_id, note: home.note_id, claim_key: 'wordflight.message.five_minutes', dimension: 'audience', label: MESSAGE_QUOTE })
  linkEvidence(ws, { competitor_id: wf.competitor_id, note: home.note_id, claim_key: 'wordflight.visual.paper_plane', dimension: 'offer', label: 'Offer label to be replaced' })
  // An inference: the owner's private hypothesis, never shared.
  linkEvidence(ws, { competitor_id: wf.competitor_id, note: home.note_id, claim_key: 'wordflight.visual.paper_plane', dimension: 'visual_language', statement_kind: 'inference', label: 'HYPOTHESIS-CANARY paper planes' })
  verifyDomain(ws, { competitor_id: wf.competitor_id, note: home.provenance, claim_key: 'wordflight.message.five_minutes' })
  setStatus(ws, { competitor_id: wf.competitor_id, status: 'owner_reviewed', reason: REASON_CANARY })
  // linkEvidence already refuses contact data; an older or hand-edited record could still hold it, so the share
  // path checks again. Plant it on disk to prove the second line of defence.
  const recordFile = path.join(root, 'brand/.private/competitive/candidates', `${wf.competitor_id}.json`)
  fs.writeFileSync(recordFile, fs.readFileSync(recordFile, 'utf8').replace('Offer label to be replaced', `Contact ${EMAIL_CANARY}`))
  const cn = addCandidate(ws, { display_name: 'CANDIDATE-CANARY CardNest', markets: 'TR' })
  const dp = addCandidate(ws, { display_name: 'DISPUTED-CANARY Lingo', markets: 'DE' })
  setStatus(ws, { competitor_id: dp.competitor_id, status: 'disputed', reason: REASON_CANARY })
  return { root, ws, wf, cn, dp, pricing, home }
}

test('share: only owner-reviewed competitors, allow-listed fields, no quotes, ids, URLs, reasons or hypotheses', () => {
  const { root, ws, wf } = seeded()
  const out = shareLandscape(ws, { capability: OFFLINE, dryRun: false })
  assert.equal(out.path, SHARED_LANDSCAPE_PATH)
  assert.equal(out.written, true)
  const file = path.join(root, SHARED_LANDSCAPE_PATH)
  const text = fs.readFileSync(file, 'utf8')
  const doc = JSON.parse(text) as SharedLandscape
  assert.ok(validSharedLandscape(doc))
  assertAllowListed(doc)

  assert.deepEqual(doc.competitors.map((c) => c.competitor_id), [wf.competitor_id])
  assert.deepEqual(doc.not_shared, { candidates: 1, disputed: 1, archived: 0 })
  const c = doc.competitors[0]!
  assert.equal(c.display_name, 'WordFlight')
  assert.equal(c.official_domain, 'wordflight-app.com')
  assert.deepEqual(c.markets, ['TR', 'US'])
  const cell = (k: string) => c.cells.find((x) => x.criterion === k)!
  assert.equal(cell('public_message').state, 'observed')
  assert.deepEqual(cell('public_message').labels, ['Short daily lessons'])
  assert.deepEqual(cell('public_message').sources, [{ source_class: 'competitor_own_page', host: 'www.wordflight-app.com', observed_on: '2026-11-22' }])
  assert.equal(cell('audience').state, 'observed', 'the cell state stays; only the quoted label is dropped')
  assert.deepEqual(cell('audience').labels, [])
  assert.deepEqual(cell('offer').labels, [])
  assert.equal(cell('visual_language').state, 'unknown', 'a hypothesis is never shared as a cell')
  assert.equal(cell('geography').state, 'unknown')
  assert.equal(doc.withheld_text, 2)

  assert.equal(doc.prices.ranked, false)
  assert.equal(doc.prices.currency_conversion, 'none')
  assert.deepEqual(doc.prices.rows.map((p) => [p.offer_name, p.amount, p.currency, p.billing_period, p.billing_commitment, p.rate_label]), [['Pro', 12, 'USD', 'month', 'annual', 'monthly_rate_billed_annually']])
  assert.deepEqual(doc.authorizes, [])

  // Canaries: nothing private, quoted or internal is anywhere in the bytes.
  for (const canary of [PRICE_QUOTE, MESSAGE_QUOTE, VISUAL_QUOTE, 'five minutes a day', REASON_CANARY, EMAIL_CANARY, 'HYPOTHESIS-CANARY', 'CANDIDATE-CANARY', 'DISPUTED-CANARY', 'kn_', 'knowledge:', 'wordflight.pricing', 'wordflight.message', 'https://', 'http://', '/pricing', '.private', 'name_key', 'status_reason', 'distinct_from', 'domain_claim', 'claim_key', 'quote', 'excerpt']) {
    assert.ok(!text.includes(canary), `the shared file must not contain ${canary}`)
  }
})

test('share: idempotent bytes, dry run writes nothing, a removed competitor disappears', () => {
  const { root, ws, wf } = seeded()
  const file = path.join(root, SHARED_LANDSCAPE_PATH)
  const preview = shareLandscape(ws, { capability: OFFLINE, dryRun: true })
  assert.equal(preview.written, false)
  assert.equal(preview.changed, true)
  assert.ok(!fs.existsSync(file))

  assert.equal(shareLandscape(ws, { capability: OFFLINE, dryRun: false }).written, true)
  const first = fs.readFileSync(file, 'utf8')
  const again = shareLandscape(ws, { capability: OFFLINE, dryRun: false })
  assert.equal(again.written, false)
  assert.equal(again.changed, false)
  assert.equal(fs.readFileSync(file, 'utf8'), first)
  // Later the same day: same bytes (freshness is judged per day; no run time in the file).
  const later = shareLandscape(ws, { capability: OFFLINE, dryRun: false, now: new Date(NOW.getTime() + 3 * 3600_000) })
  assert.equal(later.changed, false)

  setStatus(ws, { competitor_id: wf.competitor_id, status: 'archived', reason: 'closed down' })
  const after = shareLandscape(ws, { capability: OFFLINE, dryRun: false })
  assert.equal(after.written, true)
  const doc = JSON.parse(fs.readFileSync(file, 'utf8')) as SharedLandscape
  assert.deepEqual(doc.competitors, [])
  assert.deepEqual(doc.prices.rows, [])
  assert.equal(doc.not_shared.archived, 1)
  assert.ok(!fs.readFileSync(file, 'utf8').includes('WordFlight'))
  // Only the one shared file is new outside .private.
  assert.deepEqual(
    listTree(path.join(root, 'brand')).filter((f) => f.startsWith('competitive/')),
    ['competitive/shared/landscape.json'],
  )
})

test('share: empty index writes an honest empty file; refused under an agent token; symlink target refused', () => {
  const { root, ws } = workspace({ slug: 'pilito', now: () => NOW })
  const out = shareLandscape(ws, { capability: OFFLINE, dryRun: false })
  assert.deepEqual(out.landscape.competitors, [])
  assert.equal(out.landscape.as_of, null)
  process.env.BRAND_OS_AGENT_TOKEN = 'bos_at_test'
  try {
    assert.equal(code(() => shareLandscape(ws, { capability: OFFLINE, dryRun: true })), 'refused')
  } finally {
    delete process.env.BRAND_OS_AGENT_TOKEN
  }
  const file = path.join(root, SHARED_LANDSCAPE_PATH)
  fs.rmSync(file)
  const target = path.join(root, 'elsewhere.json')
  fs.writeFileSync(target, '{}')
  fs.symlinkSync(target, file)
  assert.equal(code(() => shareLandscape(ws, { capability: OFFLINE, dryRun: false })), 'unsafe_path')
  assert.equal(fs.readFileSync(target, 'utf8'), '{}')
})

test('share: prices are listed by currency and name, never by amount; stale prices are historical', () => {
  const { ws } = workspace({ slug: 'pilito', now: () => NOW })
  const old = new Date(NOW.getTime() - 200 * 86_400_000)
  const a = addCandidate(ws, { display_name: 'Zeta', markets: 'US' })
  const b = addCandidate(ws, { display_name: 'Alpha', markets: 'TR' })
  const za = record(ws, source({ url: 'https://zeta-app.com/pricing', excerpts: [{ claim_key: 'zeta.pricing.pro', quote: 'Pro: 9 USD per month' }] }))
  const al = record(ws, source({ url: 'https://alpha-app.com/fiyat', excerpts: [{ claim_key: 'alpha.pricing.pro', quote: 'Pro: 300 TL per month' }], retrieved_at: old }))
  linkEvidence(ws, { competitor_id: a.competitor_id, note: za.note_id, claim_key: 'zeta.pricing.pro', dimension: 'public_price', label: 'Pro', price: { ...PRO_PRICE, amount: 9, billing_commitment: 'unknown', tax_inclusion: 'unknown', promotion: 'unknown' } })
  linkEvidence(ws, { competitor_id: b.competitor_id, note: al.note_id, claim_key: 'alpha.pricing.pro', dimension: 'public_price', label: 'Pro', price: { ...PRO_PRICE, amount: 300, currency: 'TRY', market: 'TR', billing_commitment: 'unknown', tax_inclusion: 'unknown', promotion: 'unknown' } })
  for (const id of [a.competitor_id, b.competitor_id]) setStatus(ws, { competitor_id: id, status: 'owner_reviewed' })
  const doc = shareLandscape(ws, { capability: OFFLINE, dryRun: true }).landscape
  assert.deepEqual(doc.competitors.map((c) => c.display_name), ['Alpha', 'Zeta'])
  assert.deepEqual(doc.prices.rows.map((p) => [p.currency, p.amount, p.state, p.rate_label]), [
    ['TRY', 300, 'historical', 'promotion_unknown'],
    ['USD', 9, 'observed', 'promotion_unknown'],
  ])
  assert.equal(doc.competitors.find((c) => c.display_name === 'Alpha')!.assessment, 'needs_refresh')
})

test('read: Studio keeps only listed fields; malformed, other-brand, symlinked or unsafe files are withheld whole', () => {
  const { root, ws } = seeded()
  shareLandscape(ws, { capability: OFFLINE, dryRun: false })
  const file = path.join(root, SHARED_LANDSCAPE_PATH)
  const good = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
  const read = readSharedLandscape(root, 'pilito')
  assert.equal(read.state, 'shared')

  assert.deepEqual(readSharedLandscape(root, 'other-brand'), { state: 'withheld', reason: 'wrong_brand' })
  const write = (doc: unknown) => fs.writeFileSync(file, JSON.stringify(doc))

  // An extra field (a pasted quote) is a shape violation: the whole file is withheld, nothing partial is shown.
  write({ ...good, quote: PRICE_QUOTE })
  assert.deepEqual(readSharedLandscape(root, 'pilito'), { state: 'withheld', reason: 'invalid_record' })
  const withNote = structuredClone(good) as { competitors: Array<Record<string, unknown>> }
  withNote.competitors[0]!.status_reason = REASON_CANARY
  write(withNote)
  assert.deepEqual(readSharedLandscape(root, 'pilito'), { state: 'withheld', reason: 'invalid_record' })
  const withExcerpt = structuredClone(good) as { prices: { rows: Array<{ source: Record<string, unknown> }> } }
  withExcerpt.prices.rows[0]!.source.excerpt = PRICE_QUOTE
  write(withExcerpt)
  assert.deepEqual(readSharedLandscape(root, 'pilito'), { state: 'withheld', reason: 'invalid_record' })

  const ranked = structuredClone(good) as { prices: Record<string, unknown> }
  ranked.prices.ranked = true
  write(ranked)
  assert.equal(readSharedLandscape(root, 'pilito').state, 'withheld')

  const secret = structuredClone(good) as { competitors: Array<{ cells: Array<{ labels: string[] }> }> }
  secret.competitors[0]!.cells[0]!.labels = [`ghp_${'a'.repeat(36)}`]
  write(secret)
  assert.deepEqual(readSharedLandscape(root, 'pilito'), { state: 'withheld', reason: 'unsafe_text' })

  const url = structuredClone(good) as { competitors: Array<{ cells: Array<{ sources: Array<{ host: string }> }> }> }
  url.competitors[0]!.cells[4]!.sources[0]!.host = 'https://wordflight-app.com/pricing'
  write(url)
  assert.deepEqual(readSharedLandscape(root, 'pilito'), { state: 'withheld', reason: 'invalid_record' })

  fs.writeFileSync(file, '{not json')
  assert.deepEqual(readSharedLandscape(root, 'pilito'), { state: 'withheld', reason: 'unreadable' })
  fs.rmSync(file)
  assert.deepEqual(readSharedLandscape(root, 'pilito'), { state: 'not_shared' })
  fs.writeFileSync(path.join(root, 'x.json'), JSON.stringify(good))
  fs.symlinkSync(path.join(root, 'x.json'), file)
  assert.deepEqual(readSharedLandscape(root, 'pilito'), { state: 'withheld', reason: 'symlink' })
})
