import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import type { CreativeContext } from '@brand-os/brand-core/creative'
import { addManifestRows, APPROVED_VISION, creative, DRAFT_VISION_CANARY, errorCode, filesContaining, knowledge, ok, pilitoBrand, trackedSnapshot } from './helpers/creative.js'

/**
 * The Sprint 1 acceptance journey, through the real CLIs in a temporary brand: project, five variants, verbatim
 * Persian owner feedback as Knowledge notes, selection, a draft scoped preference, owner approval, next-session
 * context, a changed mind that supersedes the preference, and a stale source.
 */

const P1 = 'pilito-intro-reels'
const P2 = 'pilito-intro-reels-2'
// The owner's words, verbatim (Persian).
const FEEDBACK = {
  A: 'دوربین ثابت و خسته‌کننده است.',
  B: 'خیلی بچگانه است.',
  C: 'نورپردازی خوب است ولی متن خیلی زیادی دارد.',
  E: 'زاویه‌ی دوربین خوب است؛ حرکت دوربین حس پرواز می‌دهد.',
}
const CHANGED_MIND = 'نظرم عوض شد: برای ریلزهای معرفی، دوربین آرام و ثابت با یک حرکت کوتاه در پایان بهتر است.'

function context(root: string, args: string[]): CreativeContext {
  return ok(creative(root, ['context', ...args, '--json'])).context as CreativeContext
}

test('journey: Pilito intro reels A–E → feedback → select E → scoped preference → next-session context → changed mind', () => {
  const { root, proof } = pilitoBrand()

  // 1. Inspiration is a Knowledge note (third-party commentary, rights unknown). Project with brand id from config.
  const insp = ok(knowledge(root, ['capture', '--title', 'Reference: aviation app reel', '--text', 'Competitor reel uses a fast drone-style intro.', '--source-kind', 'research', '--tags', 'inspiration', '--json']))
  const project = ok(creative(root, ['project', '--id', P1, '--title', 'Pilito introductory reels', '--surface', 'reel', '--series', 'onboarding', '--lang', 'fa', '--inspiration', `${insp.id as string}:unknown`, '--json'])).project as { brand_slug: string }
  assert.equal(project.brand_slug, 'pilito')

  // Five variants: D points at a real manifest row (metadata only, no file is created); the rest are explicitly missing.
  addManifestRows(root, [{ id: 'reel.pilito.intro.d', name: 'Intro reel D', status: 'draft', visibility: 'internal', path: 'brand/assets/motion/intro-d.mp4', present: false, checksum_sha256: null }])
  // Everything Git, Studio and builds can see, after the test's own manifest fixture. No creative step may change it.
  const trackedBefore = trackedSnapshot(root)
  for (const v of ['A', 'B', 'C', 'E']) ok(creative(root, ['variant', '--project', P1, '--variant', v, '--asset', 'missing']))
  ok(creative(root, ['variant', '--project', P1, '--variant', 'D', '--asset', 'reel.pilito.intro.d']))
  assert.equal(errorCode(creative(root, ['variant', '--project', P1, '--variant', 'F', '--asset', 'brand/assets/motion/x.mp4', '--json'])), 'invalid_input', 'paths are not assets')
  assert.equal(errorCode(creative(root, ['variant', '--project', P1, '--variant', 'F', '--asset', 'https://example.com/x.png', '--json'])), 'invalid_input', 'URLs are not assets')
  assert.equal(errorCode(creative(root, ['variant', '--project', P1, '--variant', 'F', '--asset', 'invented-asset', '--json'])), 'invalid_input', 'unknown ids are not invented')
  assert.equal(errorCode(creative(root, ['variant', '--project', P1, '--variant', 'E', '--asset', 'missing', '--json'])), 'exists', 'variants are never overwritten')

  // 2. Verbatim owner feedback → one Knowledge note per piece, linked to exact variants.
  const notes: Record<string, { id: string; revision: string; path: string }> = {}
  const give = (v: keyof typeof FEEDBACK, extra: string[]) => {
    const out = ok(creative(root, ['feedback', '--project', P1, '--variant', v, '--text', FEEDBACK[v], ...extra, '--json']))
    notes[v] = out.note as { id: string; revision: string; path: string }
    assert.equal((out.feedback as { source_kind: string }).source_kind, 'owner_note')
    assert.match(notes[v]!.path, /^brand\/\.private\/knowledge\/local\/kn_/)
  }
  give('A', ['--verdict', 'reject', '--avoid', 'camera_angle'])
  give('B', ['--verdict', 'reject', '--avoid', 'tone'])
  give('C', ['--verdict', 'change_request', '--keep', 'lighting', '--avoid', 'text_density'])
  give('E', ['--verdict', 'like', '--keep', 'camera_angle'])
  const shown = ok(knowledge(root, ['show', '--id', notes.B!.id, '--json']))
  assert.equal(String(shown.body).trim(), FEEDBACK.B, 'the note holds the exact words')
  assert.deepEqual((shown.tags as string[]).sort(), ['creative-feedback', `proj-${P1}`, 'variant-b'].sort())
  assert.equal((shown.meta as { source: { ref: string } }).source.ref, `creative:${P1}/B`)
  // The existing Knowledge search finds feedback; there is no second index.
  const found = ok(knowledge(root, ['search', '--query', 'بچگانه', '--json'])).items as Array<{ id: string }>
  assert.deepEqual(found.map((item) => item.id), [notes.B!.id])

  // No duplicated raw text: each sentence lives in exactly one file in the whole workspace, its Knowledge note.
  for (const [v, sentence] of Object.entries(FEEDBACK)) {
    assert.deepEqual(filesContaining(root, sentence), [path.join(root, notes[v]!.path)], `feedback ${v} is stored once`)
  }
  assert.deepEqual(filesContaining(path.join(root, 'brand/.private/creative'), 'بچگانه'), [])

  // 3. Select E: the owner's choice for this project only. Nothing is approved or published.
  const selected = ok(creative(root, ['select', '--project', P1, '--variant', 'E', '--json'])).selection as { meaning: string }
  assert.equal(selected.meaning, 'owner_selected_for_this_project')
  assert.equal(errorCode(creative(root, ['feedback', '--project', P1, '--variant', 'E', '--text', 'x', '--verdict', 'reject', '--json'])), 'refused')
  assert.deepEqual(trackedSnapshot(root), trackedBefore, 'selection publishes and approves nothing')

  // 4. Suggest a scoped preference: draft, project scope, cited, with a contrary example.
  const draft = ok(creative(root, ['suggest', '--project', P1, '--statement', 'Use dynamic camera angles on onboarding reels', '--context', 'Owner liked E camera; A static camera rejected.', '--source', notes.E!.id, '--source', notes.A!.id, '--counterexample', 'A', '--json'])).preference as { preference_id: string; state: string; scope: unknown }
  assert.equal(draft.state, 'draft')
  assert.deepEqual(draft.scope, { level: 'project', project_id: P1 })
  let ctx = context(root, ['--project', P1])
  assert.equal(ctx.preferences.applied.length, 0, 'a draft is not applied')
  assert.equal(ctx.preferences.not_applied[0]?.state, 'draft')
  assert.match(ctx.preferences.not_applied[0]!.label, /DRAFT — unverified/)

  // Owner gate: no proof, wrong proof, agent token, or brand scope → refused, nothing changes.
  const pid = draft.preference_id
  assert.equal(errorCode(creative(root, ['approve', '--id', pid, '--json'])), 'proof')
  assert.equal(errorCode(creative(root, ['approve', '--id', pid, '--json'], { BRAND_OS_APPROVAL_PROOF: 'wrong' })), 'proof')
  assert.equal(errorCode(creative(root, ['approve', '--id', pid, '--json'], { BRAND_OS_APPROVAL_PROOF: proof, BRAND_OS_AGENT_TOKEN: 'bos_agent_x' })), 'refused')
  const brandWide = creative(root, ['approve', '--id', pid, '--scope', 'brand', '--json'], { BRAND_OS_APPROVAL_PROOF: proof })
  assert.equal(errorCode(brandWide), 'refused')
  assert.match(brandWide.stdout, /brand:knowledge propose/)
  assert.deepEqual((ok(creative(root, ['preferences', '--json'])).items as Array<{ state: string }>).map((p) => p.state), ['draft'], 'refusals changed nothing')
  // The owner names a wider scope explicitly: the onboarding reel series.
  ok(creative(root, ['approve', '--id', pid, '--scope', 'series', '--json'], { BRAND_OS_APPROVAL_PROOF: proof }))

  // 5. Next session: a new project in the same series, plus an unrelated project whose rejections must not leak in.
  ok(creative(root, ['project', '--id', P2, '--title', 'Pilito intro reels round 2', '--surface', 'reel', '--series', 'onboarding']))
  ok(creative(root, ['project', '--id', 'pilito-promo-posts', '--title', 'Promo posts', '--surface', 'post', '--series', 'promo']))
  ok(creative(root, ['variant', '--project', 'pilito-promo-posts', '--variant', 'A', '--asset', 'missing']))
  ok(creative(root, ['feedback', '--project', 'pilito-promo-posts', '--variant', 'A', '--text', 'UNRELATED-PROMO-REJECTION', '--verdict', 'reject', '--avoid', 'color']))

  ctx = context(root, ['--project', P2])
  const text = JSON.stringify(ctx)
  // Brand rules: the approved fact via the design profile; never the draft.
  assert.deepEqual(ctx.brand_rules.items.map((item) => item.value), [APPROVED_VISION])
  assert.ok(!text.includes(DRAFT_VISION_CANARY))
  // The approved series preference applies, with provenance.
  assert.equal(ctx.preferences.applied.length, 1)
  const pref = ctx.preferences.applied[0]!
  assert.equal(pref.statement, 'Use dynamic camera angles on onboarding reels')
  assert.equal(pref.scope, 'series onboarding (reel)')
  assert.deepEqual(pref.sources.map((s) => s.provenance).sort(), [`knowledge:${notes.E!.id}@${notes.E!.revision}`, `knowledge:${notes.A!.id}@${notes.A!.revision}`].sort())
  assert.deepEqual(pref.counterexamples, [{ project_id: P1, variant_id: 'A' }])
  // Why E was chosen, why B was rejected, and the positive element of C — each with the owner's words and provenance.
  const ref = (v: string) => ctx.references.find((item) => item.project_id === P1 && item.variant_id === v)
  assert.equal(ref('E')?.role, 'selected')
  assert.equal(ref('E')?.reasons[0]?.quote, FEEDBACK.E)
  assert.equal(ref('E')?.reasons[0]?.provenance, `knowledge:${notes.E!.id}@${notes.E!.revision}`)
  assert.deepEqual(ref('E')?.reasons[0]?.keep, ['camera_angle'])
  assert.equal(ref('B')?.role, 'rejected')
  assert.equal(ref('B')?.reasons[0]?.quote, FEEDBACK.B)
  assert.deepEqual(ref('B')?.reasons[0]?.avoid, ['tone'])
  assert.equal(ref('C')?.role, 'partial_keep')
  assert.deepEqual(ref('C')?.reasons[0]?.keep, ['lighting'])
  assert.equal(ref('C')?.reasons[0]?.quote, FEEDBACK.C)
  assert.equal(ref('D'), undefined, 'no reason, no reference')
  assert.ok(ctx.references.every((item) => item.reasons.every((r) => r.source_state === 'current' && r.provenance.startsWith('knowledge:kn_'))))
  // No unrelated negatives; no performance claim; nothing authorized.
  assert.ok(!text.includes('UNRELATED-PROMO-REJECTION'))
  assert.ok(!ctx.references.some((item) => item.project_id === 'pilito-promo-posts'))
  assert.equal(ctx.performance, 'not_measured')
  assert.deepEqual(ctx.authorizes, [])
  const withoutNotice = JSON.stringify({ ...ctx, notice: [] })
  assert.doesNotMatch(withoutNotice, /best|winner|performed|engagement|CTR|conversion/i)
  assert.ok(ctx.notice.some((line) => /not a measured performance result/.test(line)))
  // Inspiration with unknown rights: cited by id, title only, marked do-not-copy; its body is not quoted.
  assert.equal(ctx.inspirations[0]?.reuse, 'do_not_copy')
  assert.ok(!text.includes('drone-style'))
  // The human-readable context prints the same provenance.
  const human = creative(root, ['context', '--project', P2]).stdout
  assert.match(human, new RegExp(`knowledge:${notes.E!.id}@${notes.E!.revision}`))
  assert.match(human, /Performance: not_measured\. Authorizes: nothing\./)

  // 6. Changed mind: the owner's new words are a Knowledge note; a superseding draft changes nothing until approved.
  const changed = ok(knowledge(root, ['capture', '--title', 'Changed mind: intro camera', '--text', CHANGED_MIND, '--source-kind', 'owner_note', '--tags', 'creative-feedback', '--json']))
  const next = ok(creative(root, ['suggest', '--project', P1, '--statement', 'Use a calm static camera with one short move at the end on onboarding reels', '--source', changed.id as string, '--supersedes', pid, '--json'])).preference as { preference_id: string; supersedes: string }
  assert.equal(next.supersedes, pid)
  ctx = context(root, ['--project', P2])
  assert.deepEqual(ctx.preferences.applied.map((p) => p.preference_id), [pid], 'the old rule still applies until the owner approves the change')
  ok(creative(root, ['approve', '--id', next.preference_id, '--scope', 'series', '--json'], { BRAND_OS_APPROVAL_PROOF: proof }))
  ctx = context(root, ['--project', P2])
  assert.deepEqual(ctx.preferences.applied.map((p) => p.preference_id), [next.preference_id])
  assert.equal(ctx.preferences.applied[0]?.supersedes, pid)
  const old = ctx.preferences.not_applied.find((p) => p.preference_id === pid)!
  assert.equal(old.state, 'superseded')
  assert.equal(old.superseded_by, next.preference_id)
  assert.match(old.label, /SUPERSEDED .* Kept for audit/)
  // Audit provenance is kept: the old record still carries its sources and its approval.
  const listed = ok(creative(root, ['preferences', '--json'])).items as Array<{ preference_id: string; approval: unknown; sources: unknown[] }>
  const oldRecord = listed.find((p) => p.preference_id === pid)!
  assert.ok(oldRecord.approval, 'the original approval is not erased')
  assert.equal(oldRecord.sources.length, 2)
  assert.match(creative(root, ['preferences']).stdout, new RegExp(`superseded .*→ superseded by ${next.preference_id}`))

  // 7. Stale source: the owner edits C's note. Retrieval flags it and shows the recorded and current revision.
  const edited = ok(knowledge(root, ['edit', '--id', notes.C!.id, '--expected-revision', notes.C!.revision, '--text', 'نورپردازی عالی است.', '--json']))
  ctx = context(root, ['--project', P2])
  const cReason = ctx.references.find((item) => item.variant_id === 'C' && item.project_id === P1)!.reasons[0]!
  assert.equal(cReason.source_state, 'stale')
  assert.equal(cReason.linked_revision, notes.C!.revision)
  assert.equal(cReason.current_revision, (edited as { revision: string }).revision)

  // Approved facts, the answer ledger, publication state and every other Git-visible brand file: untouched by the
  // whole journey. Creative records and feedback notes exist only under the gitignored brand/.private/.
  assert.deepEqual(trackedSnapshot(root), trackedBefore)
})
