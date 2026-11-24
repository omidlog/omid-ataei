import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { agentTokenContext, editNote, findNote } from '@brand-os/brand-core'
import {
  addVariant,
  approveAspects,
  createProject,
  CreativeError,
  creativeContext,
  deriveAspects,
  listAspectProposals,
  readProject,
  recordFeedback,
  rejectAspects,
  runCreativeContextTool,
  suggestAspects,
} from '@brand-os/brand-core/creative'
import { creative, errorCode, filesContaining, ok, pilitoBrand } from './helpers/creative.js'
import { useTestKey } from './helpers/knowledge.js'

/**
 * Sprint 2 item 2: keep/avoid aspects suggested from feedback text. Deterministic, stored as pending proposals,
 * never applied until the owner approves (with the approval proof) through the CLI or core API.
 */
useTestKey()

const C_WORDS = 'نورپردازی خوب است ولی متن خیلی زیادی دارد. ASPECT-NOTE-CANARY'

function code(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof CreativeError) return error.code
    throw error
  }
  return 'no error'
}

/** Feedback on B and C with no aspects chosen; the words alone. */
function seeded() {
  const brand = pilitoBrand('pilito')
  const { ws } = brand
  createProject(ws, { project_id: 'pilito-reel-1', title: 'Intro reels', surface: 'reel', series: 'onboarding', language: 'fa' })
  for (const v of ['B', 'C']) addVariant(ws, { project_id: 'pilito-reel-1', variant_id: v, asset: 'missing' })
  const b = recordFeedback(ws, { project_id: 'pilito-reel-1', variant_id: 'B', text: 'خیلی بچگانه است.', verdict: 'reject' })
  const c = recordFeedback(ws, { project_id: 'pilito-reel-1', variant_id: 'C', text: C_WORDS, verdict: 'change_request' })
  return { ...brand, b, c }
}

test('deriveAspects: deterministic fa/en/tr lexicon with keep, avoid and unclear', () => {
  assert.deepEqual(deriveAspects('خیلی بچگانه است.'), [{ aspect: 'tone', side: 'avoid', cue: 'بچگانه' }])
  assert.deepEqual(
    deriveAspects('نورپردازی خوب است ولی متن خیلی زیادی دارد.').map((s) => [s.aspect, s.side]),
    [
      ['lighting', 'keep'],
      ['text_density', 'avoid'],
    ],
  )
  assert.deepEqual(deriveAspects('زاویه‌ی دوربین خوب است').map((s) => [s.aspect, s.side]), [['camera_angle', 'keep']], 'ZWNJ and ezafe are handled')
  assert.deepEqual(deriveAspects('The lighting is great but there is too much text.').map((s) => [s.aspect, s.side]), [
    ['lighting', 'keep'],
    ['text_density', 'avoid'],
  ])
  assert.deepEqual(deriveAspects('Işık güzel ama yazı çok fazla.').map((s) => [s.aspect, s.side]), [
    ['lighting', 'keep'],
    ['text_density', 'avoid'],
  ])
  assert.deepEqual(deriveAspects('Yazı tipi iyi.').map((s) => s.aspect), ['typography'], 'the longer term wins and is masked')
  assert.deepEqual(deriveAspects("I don't like the colour").map((s) => [s.aspect, s.side]), [['color', 'avoid']])
  assert.deepEqual(deriveAspects('The music.').map((s) => s.side), ['unclear'])
  assert.deepEqual(deriveAspects('The camera is good. The camera is bad.').map((s) => s.side), ['unclear'], 'conflicting clauses stay unclear')
  assert.deepEqual(deriveAspects('hello world'), [])
  assert.deepEqual(deriveAspects('نورپردازی خوب است', { keep: ['lighting'], avoid: [] }), [], 'aspects already on the event are not suggested again')
  assert.deepEqual(deriveAspects(C_WORDS), deriveAspects(C_WORDS), 'same text, same result')
})

test('a suggestion is pending and changes nothing: event, owner context and agent tool are unchanged until approval', () => {
  const s = seeded()
  const before = readProject(s.ws, 'pilito-reel-1')
  const ctxBefore = creativeContext(s.ws, s.engine, { project_id: 'pilito-reel-1' })
  const result = suggestAspects(s.ws, { project_id: 'pilito-reel-1' })
  assert.equal(result.created.length, 2)
  assert.ok(result.created.every((p) => p.state === 'pending' && p.label === 'machine_suggestion_unverified' && p.applied.length === 0))
  const cProposal = result.created.find((p) => p.variant_id === 'C')!
  assert.deepEqual(cProposal.suggestions.map((x) => [x.aspect, x.side]), [
    ['lighting', 'keep'],
    ['text_density', 'avoid'],
  ])
  assert.equal(cProposal.note.id, s.c.note.id)
  // Nothing applied.
  assert.deepEqual(readProject(s.ws, 'pilito-reel-1').feedback, before.feedback)
  const ctxAfter = creativeContext(s.ws, s.engine, { project_id: 'pilito-reel-1' })
  assert.deepEqual(ctxAfter.references, ctxBefore.references)
  assert.ok(!ctxAfter.references.some((ref) => ref.variant_id === 'C'), 'C has no keep aspect yet, so it is not a partial_keep reference')
  const agent = runCreativeContextTool(s.engine, agentTokenContext('pilito', 'agt', 'creative-read'), { project_id: 'pilito-reel-1' })
  assert.ok(!JSON.stringify(agent).includes('lighting'), 'pending suggestions never reach the agent')
  // Running it again adds nothing for the same note revision.
  const again = suggestAspects(s.ws, { project_id: 'pilito-reel-1' })
  assert.equal(again.created.length, 0)
  assert.deepEqual(again.skipped.map((x) => x.reason), ['pending_exists', 'pending_exists'])
  // The proposal file holds lexicon cues and ids, not the note text; it is local and owner-only.
  const file = path.join(s.root, 'brand/.private/creative/aspect-proposals', `${cProposal.proposal_id}.json`)
  assert.equal(fs.statSync(file).mode & 0o077, 0)
  assert.deepEqual(filesContaining(path.join(s.root, 'brand'), 'ASPECT-NOTE-CANARY').map((f) => path.relative(s.root, f)), [s.c.note.path], 'the words exist only in their note')
})

test('approval needs the owner proof, then applies to the feedback event and shows in retrieval', () => {
  const s = seeded()
  const proposal = suggestAspects(s.ws, { project_id: 'pilito-reel-1', feedback_id: s.c.feedback.feedback_id }).created[0]!
  assert.equal(code(() => approveAspects(s.ws, { proposal_id: proposal.proposal_id, proof: undefined })), 'proof')
  assert.equal(code(() => approveAspects(s.ws, { proposal_id: proposal.proposal_id, proof: 'wrong' })), 'proof')
  process.env.BRAND_OS_AGENT_TOKEN = 'bos_agent_anything'
  try {
    assert.equal(code(() => approveAspects(s.ws, { proposal_id: proposal.proposal_id, proof: s.proof })), 'refused')
    assert.equal(code(() => suggestAspects(s.ws, { project_id: 'pilito-reel-1' })), 'refused')
    assert.equal(code(() => rejectAspects(s.ws, { proposal_id: proposal.proposal_id })), 'refused')
  } finally {
    delete process.env.BRAND_OS_AGENT_TOKEN
  }
  assert.deepEqual(readProject(s.ws, 'pilito-reel-1').feedback.find((f) => f.variant_id === 'C')!.keep, [], 'refusals changed nothing')
  const result = approveAspects(s.ws, { proposal_id: proposal.proposal_id, proof: s.proof })
  assert.equal(result.proposal.state, 'approved')
  const event = readProject(s.ws, 'pilito-reel-1').feedback.find((f) => f.variant_id === 'C')!
  assert.deepEqual(event.keep, ['lighting'])
  assert.deepEqual(event.avoid, ['text_density'])
  assert.deepEqual(event.aspect_proposals, [proposal.proposal_id], 'audit trail on the event')
  const ctx = creativeContext(s.ws, s.engine, { project_id: 'pilito-reel-1' })
  const c = ctx.references.find((ref) => ref.variant_id === 'C')!
  assert.equal(c.role, 'partial_keep')
  assert.deepEqual(c.reasons[0]!.keep, ['lighting'])
  assert.equal(code(() => approveAspects(s.ws, { proposal_id: proposal.proposal_id, proof: s.proof })), 'refused', 'approval is not repeated')
  assert.equal(code(() => rejectAspects(s.ws, { proposal_id: proposal.proposal_id })), 'refused')
})

test('the owner can approve a subset, must choose the side of an unclear suggestion, or reject', () => {
  const s = seeded()
  const [bProp, cProp] = suggestAspects(s.ws, { project_id: 'pilito-reel-1' }).created.sort((x, y) => x.variant_id.localeCompare(y.variant_id))
  approveAspects(s.ws, { proposal_id: cProp!.proposal_id, proof: s.proof, only: [{ aspect: 'text_density', side: null }] })
  const c = readProject(s.ws, 'pilito-reel-1').feedback.find((f) => f.variant_id === 'C')!
  assert.deepEqual([c.keep, c.avoid], [[], ['text_density']], 'only the named aspect was applied')
  assert.equal(code(() => approveAspects(s.ws, { proposal_id: bProp!.proposal_id, proof: s.proof, only: [{ aspect: 'music', side: 'keep' }] })), 'invalid_input', 'not one of the suggestions')
  assert.equal(rejectAspects(s.ws, { proposal_id: bProp!.proposal_id }).state, 'rejected')
  assert.deepEqual(readProject(s.ws, 'pilito-reel-1').feedback.find((f) => f.variant_id === 'B')!.avoid, [], 'a rejected proposal applies nothing')
  assert.equal(code(() => approveAspects(s.ws, { proposal_id: bProp!.proposal_id, proof: s.proof })), 'refused')

  // An unclear-only proposal applies nothing without an explicit side.
  addVariant(s.ws, { project_id: 'pilito-reel-1', variant_id: 'D', asset: 'missing' })
  const d = recordFeedback(s.ws, { project_id: 'pilito-reel-1', variant_id: 'D', text: 'The music.', verdict: 'observation' })
  const dProp = suggestAspects(s.ws, { project_id: 'pilito-reel-1', feedback_id: d.feedback.feedback_id }).created[0]!
  assert.deepEqual(dProp.suggestions.map((x) => x.side), ['unclear'])
  assert.equal(code(() => approveAspects(s.ws, { proposal_id: dProp.proposal_id, proof: s.proof })), 'invalid_input')
  assert.equal(code(() => approveAspects(s.ws, { proposal_id: dProp.proposal_id, proof: s.proof, only: [{ aspect: 'music', side: null }] })), 'invalid_input')
  approveAspects(s.ws, { proposal_id: dProp.proposal_id, proof: s.proof, only: [{ aspect: 'music', side: 'keep' }] })
  assert.deepEqual(readProject(s.ws, 'pilito-reel-1').feedback.find((f) => f.variant_id === 'D')!.keep, ['music'])
})

test('a note edited after the suggestion blocks approval; the owner suggests again', () => {
  const s = seeded()
  const proposal = suggestAspects(s.ws, { project_id: 'pilito-reel-1', feedback_id: s.c.feedback.feedback_id }).created[0]!
  const current = findNote(s.ws, s.c.note.id)
  editNote(s.ws, s.c.note.id, { expectedRevision: current.revision, ops: [{ op: 'replace_body', body: `${C_WORDS} Also the music is good.` }] })
  assert.equal(code(() => approveAspects(s.ws, { proposal_id: proposal.proposal_id, proof: s.proof })), 'stale_source')
  assert.deepEqual(readProject(s.ws, 'pilito-reel-1').feedback.find((f) => f.variant_id === 'C')!.keep, [])
  const fresh = suggestAspects(s.ws, { project_id: 'pilito-reel-1', feedback_id: s.c.feedback.feedback_id }).created[0]!
  assert.ok(fresh.suggestions.some((x) => x.aspect === 'music'), 'the new revision is read')
})

test('an aspect already decided the other way is never flipped by an approval', () => {
  const s = seeded()
  const proposal = suggestAspects(s.ws, { project_id: 'pilito-reel-1', feedback_id: s.c.feedback.feedback_id }).created[0]!
  // The owner records the opposite decision by other means after the suggestion (hand edit of the private record).
  const file = path.join(s.root, 'brand/.private/creative/projects/pilito-reel-1.json')
  const doc = JSON.parse(fs.readFileSync(file, 'utf8')) as { feedback: Array<{ variant_id: string; avoid: string[] }> }
  doc.feedback.find((f) => f.variant_id === 'C')!.avoid.push('lighting')
  fs.writeFileSync(file, JSON.stringify(doc))
  assert.equal(code(() => approveAspects(s.ws, { proposal_id: proposal.proposal_id, proof: s.proof })), 'refused')
  assert.equal(listAspectProposals(s.ws, { project_id: 'pilito-reel-1' })[0]!.state, 'pending', 'nothing was applied or decided')
})

test('CLI: aspects suggest, list, approve (proof from env) and reject; refused under an agent token', () => {
  const s = seeded()
  const suggested = ok(creative(s.root, ['aspects', 'suggest', '--project', 'pilito-reel-1', '--json']))
  const created = suggested.created as Array<{ proposal_id: string; variant_id: string }>
  assert.equal(created.length, 2)
  const cId = created.find((p) => p.variant_id === 'C')!.proposal_id
  const bId = created.find((p) => p.variant_id === 'B')!.proposal_id
  const listed = ok(creative(s.root, ['aspects', 'list', '--project', 'pilito-reel-1', '--state', 'pending', '--json']))
  assert.equal((listed.items as unknown[]).length, 2)
  assert.equal(errorCode(creative(s.root, ['aspects', 'approve', '--id', cId, '--json'])), 'proof', 'no proof, no approval (stdin is not a TTY)')
  assert.equal(errorCode(creative(s.root, ['aspects', 'approve', '--id', cId, '--json'], { BRAND_OS_AGENT_TOKEN: 'bos_agent_x', BRAND_OS_APPROVAL_PROOF: s.proof })), 'refused')
  const approved = ok(creative(s.root, ['aspects', 'approve', '--id', cId, '--only', 'lighting:keep', '--json'], { BRAND_OS_APPROVAL_PROOF: s.proof }))
  assert.deepEqual((approved.proposal as { applied: unknown[] }).applied, [{ aspect: 'lighting', side: 'keep' }])
  ok(creative(s.root, ['aspects', 'reject', '--id', bId, '--json']))
  const text = creative(s.root, ['aspects', 'list'])
  assert.match(text.stdout, /approved .*applied lighting:keep/)
  assert.match(text.stdout, /rejected/)
  assert.equal(creative(s.root, ['aspects', 'bogus']).status, 2)
  assert.equal(creative(s.root, ['aspects', 'approve', '--proof', 'x', '--id', cId]).status, 2, '--proof on the command line is not an option')
})
