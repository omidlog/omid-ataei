import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { editNote, findNote } from '@brand-os/brand-core'
import {
  approveRevision,
  canonicalJson,
  contentDigest,
  evaluate,
  loadRecord,
  parseProposal,
  proposeRevision,
  readRevision,
  rejectRevision,
  reviewRevision,
  StrategyError,
  summarize,
  withdrawRevision,
} from '@brand-os/brand-core/strategy'
import { trackedSnapshot } from './helpers/creative.js'
import { useTestKey } from './helpers/knowledge.js'
import { BUDGET_CANARY, NOW, seoProposal, strategyBrand } from './helpers/strategy.js'

/**
 * Spec Sprint 3: typed strategy records. Grounding in approved facts and research notes, strict input, immutable
 * revisions, the human diff review, owner-proof approval bound to the reviewed hash, supersession, withdrawal,
 * expiry and review dates, and tamper detection.
 */
useTestKey()

function code(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof StrategyError) return error.code
    throw error
  }
  return 'no error'
}

test('a proposal is grounded: approved facts get their revision_hash, research notes become knowledge:kn_…@sha256', async () => {
  const s = await strategyBrand()
  const before = trackedSnapshot(s.root)
  const { revision, record, path: file } = proposeRevision(s.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(s.research) })
  assert.equal(revision.revision, 1)
  assert.equal(revision.supersedes_revision, null)
  assert.equal(record.revisions[0]!.state, 'draft')
  assert.match(file, /^brand\/\.private\/strategy\/records\/seo-discovery\/r0001\.json$/)
  assert.deepEqual(trackedSnapshot(s.root), before, 'nothing Git, Studio or a build can see was written')
  assert.equal(revision.content.fact_refs.length, 2)
  for (const ref of revision.content.fact_refs) assert.match(ref.revision, /^business\.[a-z.]+:\d+$|^[0-9a-f]{64}$/, 'the canonical fact revision_hash')
  for (const ref of revision.content.evidence_refs) {
    const note = findNote(s.ws, ref.note_id)
    assert.equal(ref.ref, `knowledge:${note.id}@${note.revision}`)
    assert.equal(note.note.meta.kind, 'research')
  }
  assert.equal(revision.content.recommendations[0]!.evidence_refs[0], revision.content.evidence_refs[0]!.ref, 'recommendation refs are pinned too')
  // No note body is copied into the strategy.
  const raw = fs.readFileSync(path.join(s.root, file), 'utf8')
  for (const id of s.research.slice(0, 2)) {
    const body = findNote(s.ws, id).note.body
    const quote = /quote: (.{40})/.exec(body)?.[1]
    if (quote) assert.ok(!raw.includes(quote), 'research quote not duplicated')
  }
  assert.equal(revision.content_sha256, contentDigest(revision))
})

test('strict input: unknown keys, unapproved facts, non-research notes, placeholders, secrets and finance text are refused', async () => {
  const s = await strategyBrand()
  const propose = (overrides: Record<string, unknown>) => () => proposeRevision(s.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(s.research, overrides) })
  assert.equal(code(propose({ approved: true })), 'invalid_input', 'unknown key, e.g. a self-declared approval')
  assert.equal(code(propose({ fact_refs: ['business.marketing.channels'] })), 'refused', 'fact not approved')
  assert.equal(code(propose({ title: 'EXAMPLE strategy' })), 'invalid_input')
  assert.equal(code(propose({ selection_rationale: 'Use sk-ant-abcdefghijklmnopqrstuvwxyz0123 for the API' })), 'refused')
  assert.equal(code(propose({ constraints: ['Monthly budget is 5000 EUR'] })), 'refused', 'budget text must go under restricted')
  assert.equal(code(propose({ valid_until: '2026-11-02' })), 'invalid_input', 'expired at proposal')
  assert.equal(code(propose({ review_due_at: '2027-12-31' })), 'invalid_input', 'review after expiry')
  assert.equal(code(propose({ evidence_refs: ['kn_00000000-0000-4000-8000-000000000000'] })), 'refused', 'unknown note')
  const pinnedOld = `knowledge:${s.research[0]}@${'0'.repeat(64)}`
  assert.equal(code(propose({ evidence_refs: [pinnedOld] })), 'stale_source', 'pinned ref must be current')
  const recs = (seoProposal(s.research).recommendations as Array<Record<string, unknown>>).map((rec) => ({ ...rec, fact_refs: ['brand.strategy.vision'] }))
  assert.equal(code(propose({ recommendations: recs })), 'invalid_input', 'a recommendation may cite only the strategy refs')
  assert.equal(code(() => proposeRevision(s.ws, { strategy_id: '../escape', proposal: seoProposal(s.research) })), 'invalid_input')
  assert.equal(code(() => parseProposal({ ...seoProposal(s.research), scope: { markets: ['tr'], channel: 'x', period: null, extra: 1 } })), 'invalid_input')
  process.env.BRAND_OS_AGENT_TOKEN = 'bos_at_x'
  try {
    assert.equal(code(propose({})), 'refused', 'never under an agent token')
  } finally {
    delete process.env.BRAND_OS_AGENT_TOKEN
  }
})

test('canonical hashing is key-order independent and covers every content field', () => {
  assert.equal(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] }), canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }))
  assert.notEqual(canonicalJson({ a: [1, 2] }), canonicalJson({ a: [2, 1] }))
})

test('review shows the diff against the superseded revision; approval needs the proof and the reviewed hash', async () => {
  const s = await strategyBrand()
  const v1 = proposeRevision(s.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(s.research) }).revision
  const first = reviewRevision(s.ws, { strategy_id: 'seo-discovery', revision: 1 })
  assert.equal(first.base, null)
  assert.deepEqual(first.blockers, [])
  assert.ok(first.diff.every((entry) => entry.change === 'added'))
  assert.deepEqual(first.impact.restricted_fields.sort(), ['restricted.budget', 'restricted.notes'])
  assert.match(first.approve_with, new RegExp(`--expect-sha ${v1.content_sha256}`))

  assert.equal(code(() => approveRevision(s.ws, { strategy_id: 'seo-discovery', revision: 1, expected_sha256: v1.content_sha256, proof: 'wrong' })), 'proof')
  assert.equal(code(() => approveRevision(s.ws, { strategy_id: 'seo-discovery', revision: 1, expected_sha256: v1.content_sha256, proof: undefined })), 'proof')
  assert.equal(code(() => approveRevision(s.ws, { strategy_id: 'seo-discovery', revision: 1, expected_sha256: 'a'.repeat(64), proof: s.proof })), 'stale_revision', 'TOCTOU: hash must match what was reviewed')
  assert.equal(loadRecord(s.ws, 'seo-discovery').revisions[0]!.state, 'draft', 'refusals change nothing')
  const ok = approveRevision(s.ws, { strategy_id: 'seo-discovery', revision: 1, expected_sha256: v1.content_sha256, proof: s.proof })
  assert.equal(ok.approved.state, 'approved')
  assert.match(ok.approved.approval!.event_id, /^apv_/)
  assert.equal(ok.superseded, null)

  // v2 changes one recommendation and the review date; it supersedes v1 only on approval.
  const recs = (seoProposal(s.research).recommendations as Array<Record<string, unknown>>).map((rec) => (rec.id === 'r2' ? { ...rec, action: 'Add hreflang between tr, en and fa guides' } : rec))
  const v2 = proposeRevision(s.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(s.research, { recommendations: recs, review_due_at: '2027-02-28' }) }).revision
  assert.equal(v2.supersedes_revision, 1)
  const review = reviewRevision(s.ws, { strategy_id: 'seo-discovery', revision: 2 })
  assert.deepEqual(review.base, { revision: 1, content_sha256: v1.content_sha256 })
  assert.deepEqual(
    review.diff.map((entry) => `${entry.change} ${entry.path}`),
    ['changed recommendations[r2].action', 'changed review_due_at'],
  )
  assert.match(review.notice.join(' '), /revision 1 becomes superseded/)
  assert.equal(summarize(s.ws, loadRecord(s.ws, 'seo-discovery')).current, 1, 'v1 stays current while v2 is a draft')

  const done = approveRevision(s.ws, { strategy_id: 'seo-discovery', revision: 2, expected_sha256: v2.content_sha256, proof: s.proof })
  assert.equal(done.superseded?.revision, 1)
  const record = loadRecord(s.ws, 'seo-discovery')
  assert.deepEqual(record.revisions.map((entry) => entry.state), ['superseded', 'approved'])
  assert.equal(record.revisions[0]!.superseded_by, 2)
  assert.ok(readRevision(s.ws, 'seo-discovery', 1), 'superseded revision stays on disk for audit')
  assert.equal(code(() => approveRevision(s.ws, { strategy_id: 'seo-discovery', revision: 1, expected_sha256: v1.content_sha256, proof: s.proof })), 'refused', 'a superseded revision cannot be re-approved')
})

test('a draft proposed against an approved revision that changed since is refused (no silent swap)', async () => {
  const s = await strategyBrand()
  const v1 = proposeRevision(s.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(s.research) }).revision
  const v2 = proposeRevision(s.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(s.research, { title: 'Second draft' }) }).revision
  assert.equal(v2.supersedes_revision, null, 'nothing approved yet when v2 was proposed')
  approveRevision(s.ws, { strategy_id: 'seo-discovery', revision: 1, expected_sha256: v1.content_sha256, proof: s.proof })
  assert.ok(reviewRevision(s.ws, { strategy_id: 'seo-discovery', revision: 2 }).blockers.some((item) => /approved revision changed/.test(item)))
  assert.equal(code(() => approveRevision(s.ws, { strategy_id: 'seo-discovery', revision: 2, expected_sha256: v2.content_sha256, proof: s.proof })), 'stale_revision')
  rejectRevision(s.ws, { strategy_id: 'seo-discovery', revision: 2 })
  assert.equal(code(() => approveRevision(s.ws, { strategy_id: 'seo-discovery', revision: 2, expected_sha256: v2.content_sha256, proof: s.proof })), 'refused', 'rejected stays rejected')
})

test('effective status: review_due, expired, not_yet_valid, needs_review on a changed source, withdrawal', async () => {
  const s = await strategyBrand()
  const v1 = proposeRevision(s.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(s.research) }).revision
  approveRevision(s.ws, { strategy_id: 'seo-discovery', revision: 1, expected_sha256: v1.content_sha256, proof: s.proof })
  const status = (date: Date) => {
    const record = loadRecord(s.ws, 'seo-discovery')
    return evaluate(s.ws, record, record.revisions[0]!, date).status
  }
  assert.equal(status(NOW), 'current')
  assert.equal(status(new Date('2027-04-01T00:00:00Z')), 'review_due', 'review date passed: warn, still valid')
  assert.equal(status(new Date('2027-06-30T00:00:00Z')), 'expired')
  assert.equal(status(new Date('2026-10-01T00:00:00Z')), 'not_yet_valid')

  // A cited research note edited after approval: needs_review; the approved bytes are untouched.
  const before = fs.readFileSync(path.join(s.root, 'brand/.private/strategy/records/seo-discovery/r0001.json'), 'utf8')
  const note = findNote(s.ws, s.research[0]!)
  editNote(s.ws, note.id, { expectedRevision: note.revision, ops: [{ op: 'set', add_tags: ['reviewed'] }] })
  assert.equal(status(NOW), 'needs_review')
  assert.equal(fs.readFileSync(path.join(s.root, 'brand/.private/strategy/records/seo-discovery/r0001.json'), 'utf8'), before)

  // A changed approved fact also needs review.
  const t = await strategyBrand('pilito-two')
  const w1 = proposeRevision(t.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(t.research) }).revision
  approveRevision(t.ws, { strategy_id: 'seo-discovery', revision: 1, expected_sha256: w1.content_sha256, proof: t.proof })
  const change = t.engine.requestChange('business.marketing.objective', 'Retain existing learners.')
  assert.equal(t.engine.approvals().approveBatch({ ids: [change.id] }, t.proof).results[0]?.outcome, 'approved')
  const record = loadRecord(t.ws, 'seo-discovery')
  const changed = evaluate(t.ws, record, record.revisions[0]!, NOW)
  assert.equal(changed.status, 'needs_review')
  assert.ok(changed.reasons.some((reason) => /business\.marketing\.objective is changed/.test(reason)))

  // Withdrawal needs the proof and leaves no current revision (no fallback).
  const u = await strategyBrand('pilito-three')
  const x1 = proposeRevision(u.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(u.research) }).revision
  approveRevision(u.ws, { strategy_id: 'seo-discovery', revision: 1, expected_sha256: x1.content_sha256, proof: u.proof })
  const x2 = proposeRevision(u.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(u.research, { title: 'Second' }) }).revision
  approveRevision(u.ws, { strategy_id: 'seo-discovery', revision: 2, expected_sha256: x2.content_sha256, proof: u.proof })
  assert.equal(code(() => withdrawRevision(u.ws, { strategy_id: 'seo-discovery', revision: 2, reason: 'Paused', proof: 'nope' })), 'proof')
  withdrawRevision(u.ws, { strategy_id: 'seo-discovery', revision: 2, reason: 'Paused while the site moves', proof: u.proof })
  const summary = summarize(u.ws, loadRecord(u.ws, 'seo-discovery'))
  assert.equal(summary.current, null, 'superseded v1 is not restored')
  assert.deepEqual(summary.revisions.map((item) => item.effective), ['superseded', 'withdrawn'])
})

test('tampering: edited revision bytes, a forged approval and a hand-flipped state are all integrity_failed', async () => {
  const s = await strategyBrand()
  const v1 = proposeRevision(s.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(s.research) }).revision
  approveRevision(s.ws, { strategy_id: 'seo-discovery', revision: 1, expected_sha256: v1.content_sha256, proof: s.proof })
  const dir = path.join(s.root, 'brand/.private/strategy/records/seo-discovery')
  const revFile = path.join(dir, 'r0001.json')
  const recFile = path.join(dir, 'record.json')
  const original = fs.readFileSync(revFile, 'utf8')
  const status = () => {
    const record = loadRecord(s.ws, 'seo-discovery')
    return evaluate(s.ws, record, record.revisions[0]!, NOW).status
  }

  // 1. Edit approved bytes without a new revision.
  const edited = JSON.parse(original) as { content: { must_not_do: string[] } }
  edited.content.must_not_do = []
  fs.writeFileSync(revFile, JSON.stringify(edited))
  assert.equal(status(), 'integrity_failed')
  // 2. Edit bytes and recompute content_sha256 in the file: the index still holds the approved hash.
  const rehashed = JSON.parse(original) as Parameters<typeof contentDigest>[0] & { content_sha256: string }
  rehashed.content.must_not_do = []
  rehashed.content_sha256 = contentDigest(rehashed)
  fs.writeFileSync(revFile, JSON.stringify(rehashed))
  assert.equal(status(), 'integrity_failed')
  // 3. Also rewrite the index hash: the approval digest no longer matches.
  const record = JSON.parse(fs.readFileSync(recFile, 'utf8')) as { revisions: Array<Record<string, unknown>> }
  record.revisions[0]!.content_sha256 = rehashed.content_sha256
  fs.writeFileSync(recFile, JSON.stringify(record))
  assert.equal(status(), 'integrity_failed')
  fs.writeFileSync(revFile, original)

  // 4. A draft written straight into the registry and marked approved, with a self-computed digest but no seal key.
  const t = await strategyBrand('pilito-forge')
  proposeRevision(t.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(t.research) })
  const tFile = path.join(t.root, 'brand/.private/strategy/records/seo-discovery/record.json')
  const forged = JSON.parse(fs.readFileSync(tFile, 'utf8')) as { revisions: Array<Record<string, unknown>> }
  forged.revisions[0]!.state = 'approved'
  forged.revisions[0]!.approval = { event_id: 'apv_x', approved_at: NOW.toISOString(), actor: 'owner', digest: 'f'.repeat(64), seal: 'f'.repeat(64) }
  fs.writeFileSync(tFile, JSON.stringify(forged))
  const tRecord = loadRecord(t.ws, 'seo-discovery')
  assert.equal(evaluate(t.ws, tRecord, tRecord.revisions[0]!, NOW).status, 'integrity_failed')
  assert.ok(!JSON.stringify(tRecord).includes(String(BUDGET_CANARY)), 'the index never holds content')
})

test('another brand’s copied record is not read', async () => {
  const a = await strategyBrand('pilito')
  const b = await strategyBrand('northwind')
  proposeRevision(a.ws, { strategy_id: 'seo-discovery', proposal: seoProposal(a.research) })
  fs.cpSync(path.join(a.root, 'brand/.private/strategy/records/seo-discovery'), path.join(b.root, 'brand/.private/strategy/records/seo-discovery'), { recursive: true })
  assert.equal(code(() => loadRecord(b.ws, 'seo-discovery')), 'wrong_brand')
})
