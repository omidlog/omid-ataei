import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { AGENT_TOKEN_ENV } from '@brand-os/brand-core'
import { ASSURANCE_LANGS } from '@brand-os/brand-core/assurance'
import {
  AssuranceBridgeError,
  AssuranceReviewError,
  BRIDGE_HELP,
  BRIDGE_TEXT,
  buildAssuranceSnapshot,
  EVIDENCE_STATUS_TEXT,
  LINK_HELP,
  LINK_STATE_TEXT,
  LINK_TEXT,
  renderLinkList,
  renderSnapshotSummary,
  MISSING_KIND_TEXT,
  parseSnapshotFile,
  recordReview,
  renderVerifyResult,
  REVIEW_HELP,
  REVIEW_TEXT,
  REVIEWS_DIR,
  SUBJECT_SOURCE_TEXT,
  verifyAssuranceSnapshot,
} from '@brand-os/brand-core/assurance/workspace'
import { approved, coachBrand, type CoachBrand } from './helpers/coach.js'
import { useTestKey } from './helpers/knowledge.js'

/**
 * Trust-area audit fixes (Assurance / GAP-09). Every brand below is a SYNTHETIC DEMO temp brand.
 */
useTestKey()

const AS_OF = new Date('2026-11-23T00:00:00.000Z')
const NOW = () => new Date('2026-11-23T10:00:00.000Z')

function owner<T>(run: () => T): T {
  const saved = process.env[AGENT_TOKEN_ENV]
  delete process.env[AGENT_TOKEN_ENV]
  try {
    return run()
  } finally {
    if (saved !== undefined) process.env[AGENT_TOKEN_ENV] = saved
  }
}

function readyCompany(slug: string): CoachBrand {
  const brand = coachBrand({ slug })
  approved(brand, 'business.stage.current', 'established')
  approved(brand, 'business.sales.motion', 'self-serve')
  approved(brand, 'business.customer.primary_segment', 'SYNTHETIC DEMO segment')
  approved(brand, 'brand.strategy.differentiation', 'SYNTHETIC DEMO difference')
  approved(brand, 'business.marketing.paid_media', 'no')
  return brand
}

test('a judgment note that looks like a credential is refused and nothing is written', () => {
  const brand = readyCompany('audit-secret')
  const file = path.join(brand.root, ...REVIEWS_DIR.split('/'), 'PRR-08.json')
  for (const note of ['SYNTHETIC DEMO api_key=NOTAREALKEY123456', 'SYNTHETIC DEMO bos_at_notarealtoken000000000000']) {
    assert.throws(
      () => owner(() => recordReview(brand.root, { control_id: 'PRR-08', judgment: 'yes', note }, { now: NOW })),
      (error: unknown) => error instanceof AssuranceReviewError && error.code === 'invalid_input' && !error.message.includes('NOTAREAL'),
    )
    assert.equal(fs.existsSync(file), false)
  }
  // A normal note, including Persian text with a zero-width non-joiner, is still accepted.
  owner(() => recordReview(brand.root, { control_id: 'PRR-08', judgment: 'partly', note: 'SYNTHETIC DEMO شواهد کافی نیست' }, { now: NOW }))
  assert.equal(fs.existsSync(file), true)
})

test('--pin refuses a snapshot kept for another brand instead of reporting its revisions as changed', () => {
  const other = readyCompany('audit-pin-other')
  const brand = readyCompany('audit-pin-self')
  const foreign = parseSnapshotFile(JSON.stringify(owner(() => buildAssuranceSnapshot(other.root, { asOf: AS_OF }))))
  assert.throws(
    () => owner(() => buildAssuranceSnapshot(brand.root, { asOf: AS_OF, pins: foreign.pins })),
    (error: unknown) => error instanceof AssuranceBridgeError && error.code === 'invalid_pin',
  )
  assert.throws(
    () => owner(() => buildAssuranceSnapshot(brand.root, { asOf: AS_OF, pins: { ...foreign.pins, brand_id: 'audit-pin-self', method_id: 'w3c.prov-o' } })),
    (error: unknown) => error instanceof AssuranceBridgeError && error.code === 'invalid_pin',
  )
  // The brand's own kept snapshot still pins and verifies.
  const own = parseSnapshotFile(JSON.stringify(owner(() => buildAssuranceSnapshot(brand.root, { asOf: AS_OF }))))
  assert.ok(owner(() => buildAssuranceSnapshot(brand.root, { asOf: AS_OF, pins: own.pins })).controls.length > 0)
})

test('verify says why when the digest differs but no cited source changed, in en, fa and tr', () => {
  const brand = readyCompany('audit-verify')
  const kept = JSON.stringify(owner(() => buildAssuranceSnapshot(brand.root, { asOf: AS_OF })))
  // A judgment recorded later but dated the snapshot's own day is part of that day.
  owner(() => recordReview(brand.root, { control_id: 'PRR-08', judgment: 'yes', note: 'SYNTHETIC DEMO reason' }, { now: NOW }))
  const result = owner(() => verifyAssuranceSnapshot(brand.root, kept))
  assert.equal(result.reproduced, false)
  assert.deepEqual(result.changed, [])
  for (const lang of ASSURANCE_LANGS) {
    const text = renderVerifyResult(result, lang)
    assert.ok(text.includes(BRIDGE_TEXT.verify_unnamed![lang]), lang)
    assert.ok(!text.includes('SYNTHETIC DEMO reason'), 'the note never leaves its file')
  }
})

test('Persian text uses واقعیت, not the English word fact', () => {
  const persian = [
    ...Object.values(BRIDGE_TEXT).map((entry) => entry.fa),
    ...Object.values(REVIEW_TEXT).map((entry) => entry.fa),
    ...Object.values(MISSING_KIND_TEXT).map((entry) => entry.fa),
    ...Object.values(SUBJECT_SOURCE_TEXT).map((entry) => entry.fa),
    ...Object.values(LINK_TEXT).map((entry) => entry.fa),
    ...Object.values(LINK_STATE_TEXT).map((entry) => entry.fa),
    BRIDGE_HELP.fa,
    REVIEW_HELP.fa,
    LINK_HELP.fa,
  ]
  // Ids such as approved_fact or business.* stay as typed; only the bare word is checked.
  for (const text of persian) assert.ok(!/(^|[^_a-z.])facts?(?![_a-z.])/i.test(text.replace(/`[^`]*`/g, '')), text)
})

test('Persian lists use the Persian comma; other languages keep theirs', () => {
  const brand = readyCompany('audit-comma')
  const snapshot = owner(() => buildAssuranceSnapshot(brand.root, { asOf: AS_OF }))
  const fa = renderSnapshotSummary(snapshot, 'fa')
  assert.ok(fa.includes('، `business.sales.motion`'), 'fa subject line uses U+060C')
  assert.ok(!/`, `|\), `|[؀-ۿ], `/.test(fa), 'no Latin comma between Persian items')
  assert.ok(renderSnapshotSummary(snapshot, 'en').includes(', `business.sales.motion`'))
})

test('the evidence-link list uses the Persian comma and translated register statuses (main merge, GAP-09 links)', () => {
  const item = {
    note_id: 'kn_demo',
    revision: 'r1',
    question_ids: ['business.customer.primary_segment', 'business.offer.core'],
    control_ids: ['PRR-03', 'PRR-08'],
    link: null,
    revisions: 0,
    candidates: [
      { evidence_id: 'ev-0001', claim_id: 'business.customer.primary_segment', status: 'pending' as const, independent_source: true },
      { evidence_id: 'ev-0002', claim_id: 'business.customer.primary_segment', status: 'verified' as const, independent_source: false },
    ],
  }
  const fa = renderLinkList({ brand_id: 'demo', items: [item] }, 'fa')
  assert.ok(fa.includes('`business.customer.primary_segment`، `business.offer.core`'), 'questions')
  assert.ok(fa.includes('PRR-03، PRR-08'), 'controls')
  assert.ok(fa.includes(EVIDENCE_STATUS_TEXT.pending.fa) && fa.includes(EVIDENCE_STATUS_TEXT.verified.fa), 'statuses in Persian')
  assert.ok(!/\b(pending|verified)\b/.test(fa), 'no English status token in Persian')
  assert.ok(!/`, `|\), `|[؀-ۿ], /.test(fa), 'no Latin comma between Persian items')
  const tr = renderLinkList({ brand_id: 'demo', items: [item] }, 'tr')
  assert.ok(tr.includes(EVIDENCE_STATUS_TEXT.pending.tr) && tr.includes('PRR-03, PRR-08'))
  assert.ok(renderLinkList({ brand_id: 'demo', items: [item] }, 'en').includes('(`business.customer.primary_segment`, pending)'))
})
