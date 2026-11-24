import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { AGENT_TOKEN_ENV, captureNote, openWorkspace } from '@brand-os/brand-core'
import { ASSURANCE_LANGS, controlsForMethod, DEFAULT_CATALOG, POSITIONING_READINESS } from '@brand-os/brand-core/assurance'
import {
  appendReview,
  assessWorkspace,
  AssuranceBridgeError,
  AssuranceReviewError,
  buildAssuranceSnapshot,
  JUDGMENT_STATE_TEXT,
  JUDGMENT_TEXT,
  JUDGMENTS,
  listReviewItems,
  MISSING_KIND_TEXT,
  readReviewHistory,
  recordReview,
  renderRecorded,
  renderReviewList,
  renderSnapshotSummary,
  REVIEW_HELP,
  REVIEW_PROMPT,
  REVIEW_TEXT,
  REVIEWS_DIR,
  verifyAssuranceSnapshot,
  type BridgeOptions,
} from '@brand-os/brand-core/assurance/workspace'
import { renderGapReport } from '@brand-os/brand-core/assurance'
import { approved, assertUnchanged, coachBrand, snapshot as treeSnapshot, type CoachBrand } from './helpers/coach.js'
import { useTestKey } from './helpers/knowledge.js'

/**
 * GAP-09 follow-up: the owner records a judgment on a `reviewer_judgment` control, and the bridge uses it
 * so the existing evaluator can give a score.
 *
 * Every brand below is a SYNTHETIC DEMO temp brand. No value describes a real company, person or number.
 */
useTestKey()

const AS_OF = new Date('2026-11-23T00:00:00.000Z')
const NOW = () => new Date('2026-11-23T10:00:00.000Z')
const NOTE_CANARY = 'REVIEW-NOTE-CANARY-7b3f'

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

/** A SYNTHETIC DEMO selling company whose only blocking item, with paid media stated, is PRR-08's judgment. */
function readyCompany(slug = 'review-demo'): CoachBrand {
  const brand = coachBrand({ slug })
  approved(brand, 'business.stage.current', 'established')
  approved(brand, 'business.sales.motion', 'self-serve')
  approved(brand, 'business.customer.primary_segment', 'SYNTHETIC DEMO segment')
  approved(brand, 'business.offer.value_proposition', 'SYNTHETIC DEMO value')
  approved(brand, 'brand.strategy.differentiation', 'SYNTHETIC DEMO difference')
  return brand
}

const OPTS: BridgeOptions = { asOf: AS_OF, paidMedia: 'no' }

function record(brand: CoachBrand, judgment: string, extra: Partial<Parameters<typeof recordReview>[1]> = {}) {
  return owner(() => recordReview(brand.root, { control_id: 'PRR-08', judgment, note: `SYNTHETIC DEMO reason ${NOTE_CANARY}`, ...extra }, { now: NOW }))
}

function reviewFile(brand: CoachBrand, control = 'PRR-08'): string {
  return path.join(brand.root, ...REVIEWS_DIR.split('/'), `${control}.json`)
}

function prr08Status(brand: CoachBrand, options: BridgeOptions = OPTS) {
  return owner(() => assessWorkspace(brand.root, options)).assessment.control_results.find((entry) => entry.control_id === 'PRR-08')?.status
}

// ---- score production ---------------------------------------------------------------------------

test('without a judgment there is no score; with the owner’s "yes" the existing evaluator gives one', () => {
  const brand = readyCompany()
  const before = owner(() => assessWorkspace(brand.root, OPTS))
  assert.equal(before.snapshot.scoreable, false)
  assert.deepEqual(before.assessment.completeness.blocked_by, ['reviewer_required'])
  assert.ok(before.snapshot.missing.some((entry) => entry.kind === 'reviewer_judgment' && entry.control_id === 'PRR-08' && entry.blocking))

  const { revision } = record(brand, 'yes')
  const after = owner(() => assessWorkspace(brand.root, OPTS))
  assert.equal(after.snapshot.scoreable, true, 'the judgment was the only blocking item')
  assert.equal(after.assessment.completeness.state, 'scoreable')
  assert.equal(typeof after.assessment.completeness.numerator, 'number')
  assert.equal(typeof after.assessment.completeness.denominator, 'number')
  assert.ok(after.assessment.completeness.denominator! > 0)
  const prr08 = after.assessment.control_results.find((entry) => entry.control_id === 'PRR-08')!
  assert.equal(prr08.status, 'applicable_complete')
  assert.equal(prr08.reviewer_id, `owner:${revision.revision}`)
  assert.notEqual(after.snapshot.source_snapshot_digest, before.snapshot.source_snapshot_digest, 'a judgment is a visible change')
  // Unconfirmed answers still lower the ratio; nothing was removed or filled to reach it.
  assert.ok(after.snapshot.missing.some((entry) => entry.kind === 'fact' && !entry.blocking), 'non-blocking gaps are still listed')
  assert.ok(after.assessment.completeness.numerator! < after.assessment.completeness.denominator!)
  // Never a certification.
  assert.equal(after.assessment.claim_level, 'internally_assessed')
  assert.deepEqual(after.authorizes, [])
  for (const lang of ASSURANCE_LANGS) assert.ok(renderGapReport(after.assessment, lang).length > 0)
})

test('yes, partly and no map onto the engine’s own statuses; the latest revision wins', () => {
  const brand = readyCompany()
  record(brand, 'partly')
  assert.equal(prr08Status(brand), 'applicable_partial')
  record(brand, 'no')
  assert.equal(prr08Status(brand), 'evidence_insufficient')
  record(brand, 'yes')
  assert.equal(prr08Status(brand), 'applicable_complete')
  for (const judgment of ['partly', 'no']) {
    const other = readyCompany(`review-${judgment}`)
    record(other, judgment)
    const result = owner(() => assessWorkspace(other.root, OPTS))
    assert.equal(result.assessment.completeness.state, 'scoreable', `${judgment} is still a judgment: the score exists, PRR-08 just does not count as complete`)
  }
})

test('a judgment goes out of date when what it was about changes, and blocks the score again', () => {
  const brand = readyCompany()
  record(brand, 'yes')
  assert.equal(owner(() => buildAssuranceSnapshot(brand.root, OPTS)).scoreable, true)

  // New owner research on the differentiation: the evidence PRR-08 cites changed.
  const ws = openWorkspace(brand.root, { now: NOW })
  const note = captureNote(ws, { title: 'SYNTHETIC DEMO research', body: 'SYNTHETIC DEMO findings', kind: 'research', status: 'active', question_ids: ['brand.strategy.differentiation'] })
  const stale = owner(() => assessWorkspace(brand.root, OPTS))
  assert.equal(stale.snapshot.scoreable, false)
  assert.ok(stale.snapshot.missing.some((entry) => entry.kind === 'stale_judgment' && entry.control_id === 'PRR-08' && entry.blocking))
  assert.equal(stale.assessment.completeness.state, 'not_scoreable')
  const listed = owner(() => listReviewItems(brand.root, { asOf: AS_OF }))
  assert.equal(listed.items[0]!.state, 'stale')
  assert.deepEqual(listed.items[0]!.changed, [note.id])
  assert.deepEqual(listed.items[0]!.basis_now.notes, [note.id])

  // Judged again, now about the new note: current again.
  record(brand, 'partly')
  assert.equal(owner(() => listReviewItems(brand.root, { asOf: AS_OF })).items[0]!.state, 'judged')
  assert.equal(prr08Status(brand), 'applicable_partial')

  // A changed approved fact makes it stale too.
  const change = brand.engine.requestChange('brand.strategy.differentiation', 'SYNTHETIC DEMO difference, revised')
  assert.equal(brand.engine.approveChange(change.id, brand.proof, change.expected_version).kind, 'recorded')
  const listedAgain = owner(() => listReviewItems(brand.root, { asOf: AS_OF }))
  assert.equal(listedAgain.items[0]!.state, 'stale')
  assert.deepEqual(listedAgain.items[0]!.changed, ['brand.strategy.differentiation'])
})

test('reproducible: a snapshot as of a day before the judgment is unchanged, and verify still reproduces it', () => {
  const brand = readyCompany()
  const yesterday: BridgeOptions = { asOf: new Date('2026-11-22T00:00:00.000Z'), paidMedia: 'no' }
  const kept = owner(() => buildAssuranceSnapshot(brand.root, yesterday))
  record(brand, 'yes')
  const again = owner(() => buildAssuranceSnapshot(brand.root, yesterday))
  assert.equal(again.source_snapshot_digest, kept.source_snapshot_digest, 'a judgment dated today does not reach a snapshot as of yesterday')
  assert.equal(owner(() => verifyAssuranceSnapshot(brand.root, JSON.stringify(kept))).reproduced, true)
  const today = owner(() => buildAssuranceSnapshot(brand.root, OPTS))
  assert.equal(owner(() => buildAssuranceSnapshot(brand.root, OPTS)).source_snapshot_digest, today.source_snapshot_digest)
})

// ---- storage ------------------------------------------------------------------------------------

test('storage: one private, versioned file per control in the brand workspace; nothing else is written', () => {
  const brand = readyCompany()
  const before = treeSnapshot(brand.root)
  const first = record(brand, 'no', { reviewed_on: '2026-11-20' })
  const second = record(brand, 'yes')
  const file = reviewFile(brand)
  assert.ok(fs.existsSync(file))
  assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'owner-only file mode')
  assert.ok(file.includes(`${path.sep}.private${path.sep}`), 'under the gitignored private folder')
  const history = owner(() => readReviewHistory(openWorkspace(brand.root), 'PRR-08'))
  assert.equal(history.length, 2)
  assert.equal(history[0]!.revision, first.revision.revision)
  assert.equal(history[1]!.supersedes, first.revision.revision, 'each revision chains to the one it replaces')
  assert.equal(history[1]!.revision, second.revision.revision)
  assert.equal(history[0]!.reviewed_on, '2026-11-20')
  assert.equal(history[1]!.reviewed_on, '2026-11-23', 'the date defaults to today')
  assert.equal(history[1]!.reviewer_role, 'owner')

  // Only the review file (and its lock folder) is new; no approved fact, ledger or config was touched.
  const after = treeSnapshot(brand.root)
  for (const [name, bytes] of before) assert.equal(after.get(name), bytes, `${name} unchanged`)
  const added = [...after.keys()].filter((name) => !before.has(name))
  assert.ok(added.every((name) => name.startsWith('brand/.private/')), `only private files were added: ${added.join(', ')}`)

  // The template's .gitignore keeps the folder out of git.
  assert.match(fs.readFileSync(path.resolve(import.meta.dirname, '..', '.gitignore'), 'utf8'), /^brand\/\.private\/$/m)
})

test('storage: the note stays private; snapshots, reports, lists and verify carry only the revision id', () => {
  const brand = readyCompany()
  const { revision } = record(brand, 'yes')
  const result = owner(() => assessWorkspace(brand.root, OPTS))
  const control = result.snapshot.controls.find((entry) => entry.control_id === 'PRR-08')!
  assert.equal(control.review?.rationale, `assurance-review:PRR-08@${revision.revision}`)
  const listed = owner(() => listReviewItems(brand.root, { asOf: AS_OF }))
  const texts = [JSON.stringify(result), JSON.stringify(listed), JSON.stringify(owner(() => verifyAssuranceSnapshot(brand.root, JSON.stringify(result.snapshot))))]
  for (const lang of ASSURANCE_LANGS) texts.push(renderSnapshotSummary(result.snapshot, lang), renderGapReport(result.assessment, lang), renderReviewList(listed, lang), renderRecorded({ control_id: 'PRR-08', revision: { ...revision, note: '' } }, lang))
  for (const text of texts) assert.ok(!text.includes(NOTE_CANARY), 'the note never leaves its private file')
  // Shown to the owner only when asked.
  const shown = owner(() => listReviewItems(brand.root, { asOf: AS_OF, showNotes: true }))
  assert.ok(shown.items[0]!.latest!.note!.includes(NOTE_CANARY))
})

test('storage: a tampered, foreign or symlinked history is refused, never used or repaired', () => {
  const brand = readyCompany()
  record(brand, 'no')
  const file = reviewFile(brand)
  const original = fs.readFileSync(file, 'utf8')

  // Flip the judgment without recomputing the hash.
  fs.writeFileSync(file, original.replace('"judgment": "no"', '"judgment": "yes"'))
  assert.throws(() => owner(() => buildAssuranceSnapshot(brand.root, OPTS)), (error: unknown) => error instanceof AssuranceBridgeError && error.code === 'invalid_review')
  assert.throws(() => owner(() => recordReview(brand.root, { control_id: 'PRR-08', judgment: 'yes', note: 'x' })), (error: unknown) => error instanceof AssuranceReviewError && error.code === 'invalid_record')

  // Another brand's file.
  fs.writeFileSync(file, original.replace('"brand_slug": "review-demo"', '"brand_slug": "someone-else"'))
  assert.throws(() => owner(() => readReviewHistory(openWorkspace(brand.root), 'PRR-08')), (error: unknown) => error instanceof AssuranceReviewError && error.code === 'wrong_brand')

  // A symlink in place of the file.
  const elsewhere = path.join(brand.root, 'elsewhere.json')
  fs.writeFileSync(elsewhere, original)
  fs.rmSync(file)
  fs.symlinkSync(elsewhere, file)
  assert.throws(() => owner(() => readReviewHistory(openWorkspace(brand.root), 'PRR-08')), (error: unknown) => error instanceof AssuranceReviewError && error.code === 'unsafe_path')

  // Not JSON.
  fs.rmSync(file)
  fs.writeFileSync(file, 'not json')
  assert.throws(() => owner(() => readReviewHistory(openWorkspace(brand.root), 'PRR-08')), (error: unknown) => error instanceof AssuranceReviewError && error.code === 'invalid_record')
})

test('storage: bad input is refused and nothing is written', () => {
  const brand = readyCompany()
  const before = treeSnapshot(brand.root)
  const refuse = (input: Partial<Parameters<typeof recordReview>[1]>, code: string) =>
    assert.throws(
      () => owner(() => recordReview(brand.root, { control_id: 'PRR-08', judgment: 'yes', note: 'SYNTHETIC DEMO', ...input }, { now: NOW })),
      (error: unknown) => (error instanceof AssuranceReviewError || error instanceof AssuranceBridgeError) && error.code === code,
      JSON.stringify(input),
    )
  refuse({ judgment: 'maybe' }, 'invalid_input')
  refuse({ judgment: 'applicable_complete' }, 'invalid_input')
  refuse({ note: '   ' }, 'invalid_input')
  refuse({ note: 'x'.repeat(501) }, 'invalid_input')
  refuse({ note: 'bad\u0007bell' }, 'invalid_input')
  refuse({ reviewed_on: '2026-11-24' }, 'invalid_input')
  refuse({ reviewed_on: '2026-02-30' }, 'invalid_input')
  refuse({ control_id: 'PRR-01' }, 'not_reviewable')
  refuse({ control_id: '../../etc' }, 'not_reviewable')
  refuse({ expected_revision: 'rev_000000000000000000000000' }, 'invalid_input')
  assertUnchanged(before, brand.root, 'refused records')

  // Dates only go forward, so a snapshot as of an earlier day stays reproducible.
  record(brand, 'yes', { reviewed_on: '2026-11-22' })
  refuse({ reviewed_on: '2026-11-21' }, 'invalid_input')
  // Optimistic check: the latest revision is the expected one.
  const latest = owner(() => readReviewHistory(openWorkspace(brand.root), 'PRR-08')).at(-1)!
  record(brand, 'partly', { expected_revision: latest.revision })
  refuse({ expected_revision: latest.revision }, 'invalid_input')
})

// ---- permissions --------------------------------------------------------------------------------

test('owner only: every read and write refuses under an agent token, before anything is read or written', () => {
  const brand = readyCompany()
  record(brand, 'yes')
  const before = treeSnapshot(brand.root)
  const ws = openWorkspace(brand.root, { now: NOW })
  const refused = (error: unknown) => (error instanceof AssuranceBridgeError || error instanceof AssuranceReviewError) && error.code === 'refused'
  asAgent(() => {
    assert.throws(() => recordReview(brand.root, { control_id: 'PRR-08', judgment: 'no', note: 'agent says no' }), refused)
    assert.throws(() => listReviewItems(brand.root, { asOf: AS_OF }), refused)
    assert.throws(() => readReviewHistory(ws, 'PRR-08'), refused)
    assert.throws(() => appendReview(ws, { control_id: 'PRR-08', judgment: 'no', note: 'agent says no', basis: { facts: [], evidence: [] } }), refused)
    assert.throws(() => buildAssuranceSnapshot(brand.root, OPTS), refused)
  })
  assertUnchanged(before, brand.root, 'agent attempts')
})

test('owner only: no agent surface reaches the judgment store; an agent role cannot be stored', () => {
  const repo = path.resolve(import.meta.dirname, '..')
  for (const file of ['scripts/mcp.ts']) assert.ok(!/assurance|review judgment/i.test(fs.readFileSync(path.join(repo, file), 'utf8')), `${file} does not reach it`)
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && /assurance\/(workspace|reviews)|brand:assurance-review/.test(fs.readFileSync(file, 'utf8'))) offenders.push(path.relative(repo, file))
    }
  }
  walk(path.join(repo, 'apps', 'studio'))
  assert.deepEqual(offenders, [], 'Studio stays read-only and never imports the judgment store')

  // A hand-written revision with another role is refused on read.
  const brand = readyCompany()
  record(brand, 'yes')
  const file = reviewFile(brand)
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"reviewer_role": "owner"', '"reviewer_role": "agent"'))
  assert.throws(() => owner(() => readReviewHistory(openWorkspace(brand.root), 'PRR-08')), /not the owner/)
})

// ---- text ---------------------------------------------------------------------------------------

test('every judgment control has a plain question, and every new string exists in en, fa and tr', () => {
  const judged = controlsForMethod(POSITIONING_READINESS.method_id, DEFAULT_CATALOG).filter((control) => control.evaluation_mode === 'reviewer_judgment')
  assert.ok(judged.length > 0)
  for (const control of judged) assert.ok(REVIEW_PROMPT[control.control_id], `${control.control_id} has a question`)
  const catalogs: Array<Record<string, Record<string, string>>> = [REVIEW_TEXT, REVIEW_PROMPT, JUDGMENT_TEXT, JUDGMENT_STATE_TEXT, { help: REVIEW_HELP }, { stale: MISSING_KIND_TEXT.stale_judgment }]
  for (const catalog of catalogs) {
    for (const [key, text] of Object.entries(catalog)) {
      for (const lang of ASSURANCE_LANGS) assert.ok(text[lang]?.trim(), `${key}.${lang}`)
      assert.match(text.fa!, /[؀-ۿ]/, `${key}.fa is Persian script`)
      assert.notEqual(text.tr, text.en, `${key}.tr is translated`)
    }
  }
  assert.deepEqual(Object.keys(JUDGMENT_TEXT).sort(), [...JUDGMENTS].sort())
  for (const lang of ASSURANCE_LANGS) assert.doesNotMatch(REVIEW_HELP[lang], /certified|certificate(?! )/i)
})
