import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { addEvidence, AGENT_TOKEN_ENV, appendNote, captureNote, openWorkspace } from '@brand-os/brand-core'
import { ASSURANCE_LANGS, renderGapReport } from '@brand-os/brand-core/assurance'
import {
  appendLink,
  assessWorkspace,
  AssuranceBridgeError,
  AssuranceLinkError,
  BRIDGE_TEXT,
  buildAssuranceSnapshot,
  canonicalSnapshot,
  LINK_HELP,
  LINK_STATE_TEXT,
  LINK_STATES,
  LINK_TEXT,
  linkEvidence,
  LINKS_DIR,
  listEvidenceLinks,
  listReviewItems,
  MISSING_KIND_TEXT,
  readLinkHistory,
  recordReview,
  renderLinked,
  renderLinkList,
  renderSnapshotSummary,
  unlinkEvidence,
  verifyAssuranceSnapshot,
  type BridgeOptions,
} from '@brand-os/brand-core/assurance/workspace'
import { approved, assertUnchanged, coachBrand, snapshot as treeSnapshot, type CoachBrand } from './helpers/coach.js'
import { useTestKey } from './helpers/knowledge.js'

/**
 * GAP-09 follow-up: the owner links a research note to an evidence-register entry, and the bridge counts
 * the note as independent evidence while the entry qualifies by the register's own rules.
 *
 * Every brand below is a SYNTHETIC DEMO temp brand. No value describes a real company, person or number.
 * The evidence approval uses the real clock, so these tests do too.
 */
useTestKey()

const TODAY = new Date().toISOString().slice(0, 10)
const dayOffset = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10)
const AS_OF = new Date(`${TODAY}T00:00:00.000Z`)
const OPTS: BridgeOptions = { asOf: AS_OF, paidMedia: 'no' }
const NOTE_CANARY = 'LINK-NOTE-BODY-CANARY-51c2'
const REF_CANARY = 'LINK-REGISTER-REFERENCE-CANARY-9e07'
const SEGMENT = 'business.customer.primary_segment'

function owner<T>(run: () => T): T {
  const saved = process.env[AGENT_TOKEN_ENV]
  delete process.env[AGENT_TOKEN_ENV]
  try {
    return run()
  } finally {
    if (saved !== undefined) process.env[AGENT_TOKEN_ENV] = saved
  }
}

function asAgent<T>(run: () => T): T {
  const saved = process.env[AGENT_TOKEN_ENV]
  process.env[AGENT_TOKEN_ENV] = 'bos_agent_not-a-real-token'
  try {
    return run()
  } finally {
    if (saved === undefined) delete process.env[AGENT_TOKEN_ENV]
    else process.env[AGENT_TOKEN_ENV] = saved
  }
}

/** A SYNTHETIC DEMO selling company with one research note about its customer segment (cited by PRR-03). */
function company(slug = 'link-demo') {
  const brand = coachBrand({ slug })
  approved(brand, 'business.stage.current', 'established')
  approved(brand, 'business.sales.motion', 'self-serve')
  approved(brand, SEGMENT, 'SYNTHETIC DEMO segment')
  approved(brand, 'business.offer.value_proposition', 'SYNTHETIC DEMO value')
  approved(brand, 'brand.strategy.differentiation', 'SYNTHETIC DEMO difference')
  const ws = openWorkspace(brand.root)
  const note = captureNote(ws, { title: 'SYNTHETIC DEMO research', body: `SYNTHETIC DEMO survey summary ${NOTE_CANARY}`, kind: 'research', status: 'active', question_ids: [SEGMENT] })
  return { brand, note }
}

function register(brand: CoachBrand, input: Partial<Parameters<typeof addEvidence>[2]> = {}) {
  return addEvidence(brand.root, brand.engine.questions(), { claim_id: SEGMENT, kind: 'verification', source_type: 'third_party', reference: `SYNTHETIC DEMO survey report ${REF_CANARY}`, ...input })
}

function verify(brand: CoachBrand, id: string) {
  assert.equal(brand.engine.approvals().reviewEvidence(id, 'verified', brand.proof).ok, true)
}

const result = (brand: CoachBrand, options: BridgeOptions = OPTS) => owner(() => assessWorkspace(brand.root, options))
const prr03 = (brand: CoachBrand, options: BridgeOptions = OPTS) => result(brand, options).assessment.control_results.find((entry) => entry.control_id === 'PRR-03')!
const link = (brand: CoachBrand, noteId: string, evidenceId: string, extra: { linked_on?: string } = {}) => owner(() => linkEvidence(brand.root, { note_id: noteId, evidence_id: evidenceId, ...extra }))
const linkFile = (brand: CoachBrand, noteId: string) => path.join(brand.root, ...LINKS_DIR.split('/'), `${noteId}.json`)

// ---- what a link changes -------------------------------------------------------------------------

test('a linked note counts as independent only once its register entry is verified', () => {
  const { brand, note } = company()
  const before = result(brand)
  const first = before.assessment.control_results.find((entry) => entry.control_id === 'PRR-03')!
  assert.equal(first.status, 'evidence_insufficient', 'an owner-stated note is not independent')
  assert.ok(before.snapshot.missing.some((entry) => entry.kind === 'independent_evidence' && entry.control_id === 'PRR-03' && !entry.blocking))
  assert.equal(before.assessment.evidence_quality, 'owner_stated')
  assert.deepEqual(before.snapshot.evidence_links, [])

  const entry = register(brand)
  const linked = link(brand, note.id, entry.id)
  assert.equal(linked.state, 'not_verified', 'a pending entry may be linked but does not count')
  assert.equal(prr03(brand).status, 'evidence_insufficient')

  verify(brand, entry.id)
  const after = result(brand)
  const control = after.snapshot.controls.find((entry) => entry.control_id === 'PRR-03')!
  assert.deepEqual(control.evidence.map((item) => item.independence), ['independent'])
  assert.equal(after.assessment.control_results.find((entry) => entry.control_id === 'PRR-03')!.status, 'applicable_complete')
  assert.ok(!after.snapshot.missing.some((entry) => entry.kind === 'independent_evidence' && entry.control_id === 'PRR-03'))
  assert.deepEqual(after.snapshot.evidence_links, [{ note_id: note.id, evidence_id: entry.id, link_revision: linked.revision.revision, state: 'qualifies' }])
  assert.notEqual(after.snapshot.source_snapshot_digest, before.snapshot.source_snapshot_digest, 'a qualifying link is a visible change')
  // Never a certification.
  assert.equal(after.assessment.claim_level, 'internally_assessed')
  assert.equal(after.snapshot.disclaimer, 'internal_assessment_not_certification')
  assert.deepEqual(after.authorizes, [])
  assert.deepEqual(after.snapshot.authorizes, [])
})

test('a backdated link (--date) reports the state it has today (audit O-7)', () => {
  const { brand, note } = company('link-backdated')
  const entry = register(brand)
  verify(brand, entry.id)
  const linked = link(brand, note.id, entry.id, { linked_on: dayOffset(-30) })
  assert.equal(linked.revision.linked_on, dayOffset(-30))
  assert.equal(linked.state, 'qualifies', 'verified today, so it counts today, though it did not on the backdated day')
  assert.equal(result(brand).snapshot.evidence_links[0]!.state, 'qualifies')
})

test('a link verifies one question: a note about two questions is independent only for the controls of the verified one', () => {
  const DIFF = 'brand.strategy.differentiation'
  const brand = coachBrand({ slug: 'link-two-questions' })
  approved(brand, 'business.stage.current', 'established')
  approved(brand, 'business.sales.motion', 'self-serve')
  approved(brand, SEGMENT, 'SYNTHETIC DEMO segment')
  approved(brand, DIFF, 'SYNTHETIC DEMO difference')
  const note = captureNote(openWorkspace(brand.root), { title: 'SYNTHETIC DEMO research', body: 'SYNTHETIC DEMO survey summary', kind: 'research', status: 'active', question_ids: [SEGMENT, DIFF] })
  const entry = register(brand)
  verify(brand, entry.id)
  link(brand, note.id, entry.id)
  const independence = (controlId: string) =>
    result(brand).snapshot.controls.find((control) => control.control_id === controlId)!.evidence.find((item) => item.ref.note_id === note.id)?.independence
  assert.equal(independence('PRR-03'), 'independent', 'the segment control names the verified question')
  assert.equal(independence('PRR-08'), 'owner_stated', 'the differentiation control does not: the register entry says nothing about it')
})

test('owner decision: unapproved answers still lower the score and are not removed; no score while anything blocks', () => {
  const { brand, note } = company('link-score')
  const entry = register(brand)
  verify(brand, entry.id)
  link(brand, note.id, entry.id)
  const blocked = result(brand)
  assert.equal(blocked.snapshot.scoreable, false, 'PRR-08 still needs the owner’s judgment')
  assert.equal(blocked.assessment.completeness.numerator, null)
  assert.equal(blocked.assessment.completeness.denominator, null)

  owner(() => recordReview(brand.root, { control_id: 'PRR-08', judgment: 'yes', note: 'SYNTHETIC DEMO reason' }))
  const scored = result(brand)
  assert.equal(scored.snapshot.scoreable, true)
  assert.equal(scored.assessment.completeness.state, 'scoreable')
  assert.ok(scored.snapshot.missing.some((item) => item.kind === 'fact' && !item.blocking), 'unapproved facts are still listed')
  assert.ok(scored.assessment.completeness.numerator! < scored.assessment.completeness.denominator!, 'and still lower the ratio')
})

test('a link stops counting when the note changes, the entry is withdrawn, rejected or past its review date', () => {
  // Note changed.
  {
    const { brand, note } = company('link-note-changed')
    const entry = register(brand)
    verify(brand, entry.id)
    link(brand, note.id, entry.id)
    appendNote(openWorkspace(brand.root), note.id, { text: 'SYNTHETIC DEMO addendum' })
    assert.equal(result(brand).snapshot.evidence_links[0]!.state, 'note_changed')
    assert.equal(prr03(brand).status, 'evidence_insufficient')
  }
  // Withdrawn.
  {
    const { brand, note } = company('link-withdrawn')
    const entry = register(brand)
    verify(brand, entry.id)
    link(brand, note.id, entry.id)
    assert.equal(brand.engine.approvals().withdrawEvidence(entry.id, 'SYNTHETIC DEMO source retracted').ok, true)
    assert.equal(result(brand).snapshot.evidence_links[0]!.state, 'withdrawn')
    assert.equal(prr03(brand).status, 'evidence_insufficient')
  }
  // Rejected after linking.
  {
    const { brand, note } = company('link-rejected')
    const entry = register(brand)
    link(brand, note.id, entry.id)
    assert.equal(brand.engine.approvals().reviewEvidence(entry.id, 'rejected', brand.proof).ok, true)
    assert.equal(result(brand).snapshot.evidence_links[0]!.state, 'rejected')
  }
  // Past its review date, assessed tomorrow.
  {
    const { brand, note } = company('link-expired')
    const entry = register(brand, { review_due: TODAY })
    verify(brand, entry.id)
    link(brand, note.id, entry.id)
    assert.equal(result(brand).snapshot.evidence_links[0]!.state, 'qualifies')
    const tomorrow: BridgeOptions = { asOf: new Date(`${dayOffset(1)}T00:00:00.000Z`), paidMedia: 'no' }
    assert.equal(result(brand, tomorrow).snapshot.evidence_links[0]!.state, 'expired')
    assert.equal(prr03(brand, tomorrow).status, 'evidence_insufficient')
  }
})

test('unlink adds a revision; the note is owner-stated again and the history stays', () => {
  const { brand, note } = company('link-unlink')
  const entry = register(brand)
  verify(brand, entry.id)
  const first = link(brand, note.id, entry.id)
  assert.equal(prr03(brand).status, 'applicable_complete')
  const removed = owner(() => unlinkEvidence(brand.root, { note_id: note.id }))
  assert.equal(removed.revision.action, 'unlink')
  assert.equal(removed.revision.supersedes, first.revision.revision)
  assert.equal(prr03(brand).status, 'evidence_insufficient')
  assert.deepEqual(result(brand).snapshot.evidence_links, [])
  assert.equal(owner(() => readLinkHistory(openWorkspace(brand.root), note.id)).length, 2)
  assert.throws(() => owner(() => unlinkEvidence(brand.root, { note_id: note.id })), (error: unknown) => error instanceof AssuranceLinkError && error.code === 'invalid_input')
})

// ---- what may be linked --------------------------------------------------------------------------

test('only an independent verification for the note’s own question can be linked; refusals write nothing', () => {
  const { brand, note } = company('link-refusals')
  const testimony = register(brand, { source_type: 'owner_testimony' })
  const permission = register(brand, { kind: 'permission', scope: 'public', granted_by: 'SYNTHETIC DEMO partner' })
  const otherClaim = register(brand, { claim_id: 'brand.strategy.differentiation' })
  const withdrawn = register(brand)
  brand.engine.approvals().withdrawEvidence(withdrawn.id, 'SYNTHETIC DEMO')
  const rejected = register(brand)
  brand.engine.approvals().reviewEvidence(rejected.id, 'rejected', brand.proof)
  const idea = captureNote(openWorkspace(brand.root), { title: 'SYNTHETIC DEMO idea', body: 'not research', kind: 'idea', question_ids: [SEGMENT] })
  const secret = captureNote(openWorkspace(brand.root), { title: 'SYNTHETIC DEMO secret', body: 'restricted', kind: 'research', classification: 'restricted', question_ids: [SEGMENT] })
  const good = register(brand)

  const before = treeSnapshot(brand.root)
  const notLinkable = (error: unknown) => error instanceof AssuranceLinkError && error.code === 'not_linkable'
  for (const id of [testimony.id, permission.id, otherClaim.id, withdrawn.id, rejected.id, 'ev-9999']) assert.throws(() => link(brand, note.id, id), notLinkable, id)
  assert.throws(() => link(brand, idea.id, good.id), notLinkable, 'an idea note is not research')
  assert.throws(() => link(brand, secret.id, good.id), notLinkable, 'a restricted note is never read')
  assert.throws(() => link(brand, 'kn_does-not-exist', good.id), notLinkable)
  assert.throws(() => link(brand, note.id, good.id, { linked_on: dayOffset(1) }), (error: unknown) => error instanceof AssuranceLinkError && error.code === 'invalid_input', 'no future date')
  assert.throws(() => link(brand, note.id, good.id, { linked_on: '2026-02-30' }), (error: unknown) => error instanceof AssuranceLinkError && error.code === 'invalid_input')
  assertUnchanged(before, brand.root, 'refused links')

  // The list offers the candidates, ids only, and marks testimony as unable to count.
  const listed = owner(() => listEvidenceLinks(brand.root, { asOf: AS_OF }))
  const item = listed.items.find((entry) => entry.note_id === note.id)!
  assert.deepEqual(item.control_ids, ['PRR-03'])
  assert.ok(item.candidates.some((candidate) => candidate.evidence_id === testimony.id && !candidate.independent_source))
  assert.ok(!item.candidates.some((candidate) => candidate.evidence_id === permission.id), 'a permission is not a candidate')
  assert.ok(!item.candidates.some((candidate) => candidate.evidence_id === otherClaim.id), 'another question’s entry is not a candidate')
  assert.ok(!listed.items.some((entry) => entry.note_id === idea.id || entry.note_id === secret.id))
})

// ---- reproducibility and versioning ---------------------------------------------------------------

test('reproducible: same input, same bytes; a snapshot as of yesterday ignores today’s link; verify names a changed link', () => {
  const { brand, note } = company('link-repro')
  const entry = register(brand)
  verify(brand, entry.id)
  const yesterday: BridgeOptions = { asOf: new Date(`${dayOffset(-1)}T00:00:00.000Z`), paidMedia: 'no' }
  const keptYesterday = owner(() => buildAssuranceSnapshot(brand.root, yesterday))
  link(brand, note.id, entry.id)
  assert.equal(owner(() => buildAssuranceSnapshot(brand.root, yesterday)).source_snapshot_digest, keptYesterday.source_snapshot_digest)
  assert.equal(owner(() => verifyAssuranceSnapshot(brand.root, JSON.stringify(keptYesterday))).reproduced, true)

  const kept = owner(() => buildAssuranceSnapshot(brand.root, OPTS))
  assert.equal(canonicalSnapshot(owner(() => buildAssuranceSnapshot(brand.root, OPTS))), canonicalSnapshot(kept))
  assert.equal(kept.bridge_version, 'brand-os.assurance-bridge/4')

  brand.engine.approvals().withdrawEvidence(entry.id, 'SYNTHETIC DEMO')
  const checked = owner(() => verifyAssuranceSnapshot(brand.root, JSON.stringify(kept)))
  assert.equal(checked.reproduced, false)
  assert.deepEqual(checked.changed.filter((ref) => ref.kind === 'evidence_link'), [{ kind: 'evidence_link', id: note.id, state: 'changed' }])

  // A snapshot kept before links existed (no evidence_links field) still verifies.
  const old = { ...keptYesterday } as Record<string, unknown>
  delete old.evidence_links
  assert.equal(owner(() => verifyAssuranceSnapshot(brand.root, JSON.stringify(old))).reproduced, true)
})

test('a qualifying link makes an earlier PRR-08 judgment stale; judgments without links are unchanged', () => {
  const brand = coachBrand({ slug: 'link-judgment' })
  approved(brand, 'brand.strategy.differentiation', 'SYNTHETIC DEMO difference')
  const note = captureNote(openWorkspace(brand.root), { title: 'SYNTHETIC DEMO research', body: 'SYNTHETIC DEMO', kind: 'research', status: 'active', question_ids: ['brand.strategy.differentiation'] })
  owner(() => recordReview(brand.root, { control_id: 'PRR-08', judgment: 'yes', note: 'SYNTHETIC DEMO reason' }))
  assert.equal(owner(() => listReviewItems(brand.root, { asOf: AS_OF })).items[0]!.state, 'judged')

  const pending = register(brand, { claim_id: 'brand.strategy.differentiation' })
  link(brand, note.id, pending.id)
  assert.equal(owner(() => listReviewItems(brand.root, { asOf: AS_OF })).items[0]!.state, 'judged', 'a link that does not count changes nothing')

  verify(brand, pending.id)
  const listed = owner(() => listReviewItems(brand.root, { asOf: AS_OF })).items[0]!
  assert.equal(listed.state, 'stale', 'the evidence the owner judged is now different')
  assert.deepEqual(listed.changed, [note.id])
})

test('storage: one private, chained file per note; only it is written; tampered or foreign history is refused', () => {
  const { brand, note } = company('link-storage')
  const entry = register(brand)
  const before = treeSnapshot(brand.root)
  link(brand, note.id, entry.id)
  const file = linkFile(brand, note.id)
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  assert.ok(file.includes(`${path.sep}.private${path.sep}`))
  const after = treeSnapshot(brand.root)
  const added = [...after.keys()].filter((key) => !before.has(key) || before.get(key) !== after.get(key))
  assert.ok(added.every((key) => key.includes(`.private${path.sep}assurance${path.sep}evidence-links`) || key.includes(`${path.sep}locks${path.sep}`)), `only the link file: ${added.join(', ')}`)
  const text = fs.readFileSync(file, 'utf8')
  assert.ok(!text.includes(NOTE_CANARY) && !text.includes(REF_CANARY), 'ids only: no note or register text')

  // Tampered: the bridge refuses rather than using it.
  fs.writeFileSync(file, text.replace(entry.id, 'ev-0099'))
  assert.throws(() => owner(() => buildAssuranceSnapshot(brand.root, OPTS)), (error: unknown) => error instanceof AssuranceBridgeError && error.code === 'invalid_link')
  // Foreign brand.
  fs.writeFileSync(file, text.replace('"brand_slug": "link-storage"', '"brand_slug": "another-brand"'))
  assert.throws(() => owner(() => readLinkHistory(openWorkspace(brand.root), note.id)), (error: unknown) => error instanceof AssuranceLinkError && error.code === 'wrong_brand')
  // Another actor.
  fs.writeFileSync(file, text.replace('"actor_role": "owner"', '"actor_role": "agent"'))
  assert.throws(() => owner(() => readLinkHistory(openWorkspace(brand.root), note.id)), /not the owner/)
})

// ---- permissions and privacy ---------------------------------------------------------------------

test('owner only: every read and write refuses under an agent token, and nothing is written', () => {
  const { brand, note } = company('link-agent')
  const entry = register(brand)
  verify(brand, entry.id)
  link(brand, note.id, entry.id)
  const before = treeSnapshot(brand.root)
  const ws = openWorkspace(brand.root)
  const refused = (error: unknown) => (error instanceof AssuranceBridgeError || error instanceof AssuranceLinkError) && error.code === 'refused'
  asAgent(() => {
    assert.throws(() => linkEvidence(brand.root, { note_id: note.id, evidence_id: entry.id }), refused)
    assert.throws(() => unlinkEvidence(brand.root, { note_id: note.id }), refused)
    assert.throws(() => listEvidenceLinks(brand.root, { asOf: AS_OF }), refused)
    assert.throws(() => readLinkHistory(ws, note.id), refused)
    assert.throws(() => appendLink(ws, { note_id: note.id, action: 'unlink', evidence_id: null, note_revision: null }), refused)
    assert.throws(() => buildAssuranceSnapshot(brand.root, OPTS), refused)
  })
  assertUnchanged(before, brand.root, 'agent attempts')

  const repo = path.resolve(import.meta.dirname, '..')
  assert.ok(!/assurance/i.test(fs.readFileSync(path.join(repo, 'scripts', 'mcp.ts'), 'utf8')), 'no MCP tool reaches it')
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.name === 'node_modules' || item.name === 'dist') continue
      const file = path.join(dir, item.name)
      if (item.isDirectory()) walk(file)
      else if (/\.(ts|tsx|js|mjs)$/.test(item.name) && /assurance\/(workspace|links)|brand:assurance-link/.test(fs.readFileSync(file, 'utf8'))) offenders.push(path.relative(repo, file))
    }
  }
  walk(path.join(repo, 'apps', 'studio'))
  assert.deepEqual(offenders, [], 'Studio never imports the link store')
})

test('privacy: no note body or register reference reaches a snapshot, list or rendering', () => {
  const { brand, note } = company('link-privacy')
  const entry = register(brand)
  verify(brand, entry.id)
  const linked = link(brand, note.id, entry.id)
  const outputs = [JSON.stringify(result(brand)), JSON.stringify(owner(() => listEvidenceLinks(brand.root, { asOf: AS_OF })))]
  for (const lang of ASSURANCE_LANGS) {
    const res = result(brand)
    outputs.push(renderSnapshotSummary(res.snapshot, lang), renderGapReport(res.assessment, lang), renderLinkList(owner(() => listEvidenceLinks(brand.root, { asOf: AS_OF })), lang), renderLinked(linked, lang))
  }
  for (const text of outputs) {
    assert.ok(!text.includes(NOTE_CANARY), 'no note text')
    assert.ok(!text.includes(REF_CANARY), 'no register reference')
  }
})

// ---- text ---------------------------------------------------------------------------------------

test('every new string exists in en, fa and tr; no certification wording', () => {
  assert.deepEqual(Object.keys(LINK_STATE_TEXT).sort(), [...LINK_STATES].sort())
  const catalogs: Array<Record<string, Record<string, string>>> = [
    LINK_TEXT,
    LINK_STATE_TEXT,
    { help: LINK_HELP },
    { independent: MISSING_KIND_TEXT.independent_evidence },
    { links: BRIDGE_TEXT.evidence_links!, invalid: BRIDGE_TEXT.invalid_link! },
  ]
  for (const catalog of catalogs) {
    for (const [key, text] of Object.entries(catalog)) {
      for (const lang of ASSURANCE_LANGS) assert.ok(text[lang]?.trim(), `${key}.${lang}`)
      assert.match(text.fa!, /[؀-ۿ]/, `${key}.fa is Persian script`)
      assert.notEqual(text.tr, text.en, `${key}.tr is translated`)
    }
  }
  for (const lang of ASSURANCE_LANGS) assert.doesNotMatch(LINK_HELP[lang], /certified|certificate(?! )/i)
})
