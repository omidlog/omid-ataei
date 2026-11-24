import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { AGENT_TOKEN_ENV, ensureApprovalSecret, findNote, InterviewEngine, listNotes } from '@brand-os/brand-core'
import { addCandidate, linkEvidence } from '@brand-os/brand-core/competitive'
import { addVariant, createProject, recordFeedback, selectVariant } from '@brand-os/brand-core/creative'
import {
  APPLICATION_CHECKS,
  BRIEF_HEADINGS,
  buildIdentityBrief,
  COMPONENT_LABELS,
  CONCLUSIONS,
  DIAGNOSIS_QUESTIONS,
  diagnosisState,
  answersOf,
  HANDOFF,
  IdentityError,
  linkCreativeProject,
  markReviewed,
  MISSING,
  NEXT_STEP,
  PATH_SOURCE,
  readAudit,
  recordAnswer,
  RED_LINES,
  renderBrief,
  RISKS,
  ROUTES,
  RUBRIC,
  setEquity,
  USE_LABELS,
  type IdentityBrief,
} from '@brand-os/brand-core/identity'
import { unavailableAdapter } from '@brand-os/brand-core/research'
import { NOW, VISUAL_QUOTE, wordflightSources } from './helpers/competitive.js'
import { listTree, useTestKey, workspace } from './helpers/knowledge.js'

/** Identity Slice D: the rebrand audit and logo brief. No network; the brief writes nothing. */
useTestKey()

const OFFLINE = unavailableAdapter().capability(NOW)
type Ws = Parameters<typeof buildIdentityBrief>[0]

function intake(logo_presence: string, identity_intent: string, change_depth: string | null = null) {
  return (config: Record<string, unknown>) => {
    config.onboarding = { identity: { schema_version: 1, source: 'brand_init', authority: 'unapproved_owner_intake', logo_presence, identity_intent, change_depth, recorded_at: NOW.toISOString() } }
  }
}

function brief(ws: Ws, lang: 'en' | 'fa' | 'tr' = 'en'): IdentityBrief {
  return buildIdentityBrief(ws, { capability: OFFLINE, now: NOW, lang })
}

function code(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof IdentityError) return error.code
    throw error
  }
  return 'no_error'
}

/** Tracked brand files plus approved/draft facts: what an identity brief must never change. */
function tracked(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const file of listTree(path.join(root, 'brand'))) if (!file.startsWith('.private/')) out[file] = fs.readFileSync(path.join(root, 'brand', file), 'utf8')
  return out
}

test('new identity, no logo: complete brief with a missing master, three distinct routes and no fake asset', () => {
  const { root, ws } = workspace({ slug: 'pilito-new', now: () => NOW, mutate: (c) => { intake('absent', 'create')(c); (c.modules as { mascot: { enabled: boolean } }).mascot.enabled = false } })
  const before = tracked(root)
  const out = brief(ws)
  assert.equal(out.status, 'draft')
  assert.deepEqual(out.authorizes, [])
  assert.deepEqual(out.path, { ...out.path, value: 'create', source: 'intake_hint_unconfirmed' })
  assert.equal(out.conclusion.code, 'create_first_identity')
  assert.equal(out.equity.applicable, false)
  assert.equal(out.assets.approved_master, false)
  assert.ok(out.assets.manifest.every((a) => a.example), 'the template placeholders are flagged EXAMPLE, never a mark')
  const codes = out.missing.map((m) => m.code)
  for (const c of ['path_unconfirmed', 'no_master', 'visual_unavailable', 'no_creative_project', 'legal_review', 'diagnosis_pending']) assert.ok(codes.includes(c), c)
  assert.equal(out.routes.length, 3)
  assert.equal(new Set(out.routes.map((r) => r.id)).size, 3)
  assert.deepEqual(out.routes.map((r) => r.id), ['wordmark_led', 'symbol_and_wordmark', 'monogram_icon'], 'mascot module off: no character route forced')
  for (const r of out.routes) {
    assert.ok(r.why && r.why_not && r.risks.length && r.forbidden.length && r.rubric.length)
    assert.equal(r.status, 'hypothesis')
  }
  assert.equal(out.rubric.weights, null)
  assert.deepEqual(out.rubric.criteria.map((c) => c.id), ['strategic_fit', 'distinctiveness', 'legibility', 'versatility', 'meaningfulness', 'longevity', 'feasibility', 'legal_risk_review'])
  assert.ok(out.production.some((p) => p.code === 'min_size_unset'), 'no invented minimum size')
  assert.equal(out.applications.answered, false, 'uses are asked, not assumed')
  assert.ok(out.handoff.some((h) => h.code === 'approve'))
  assert.match(renderBrief(out), /authorizes: \[\]/)
  assert.deepEqual(tracked(root), before, 'nothing tracked changed, no asset created')
  assert.equal(fs.existsSync(path.join(root, 'brand', '.private', 'identity')), false, 'reading writes no audit')
})

test('mascot module on: the third create route is the optional character mark', () => {
  const { ws } = workspace({ slug: 'mascot-brand', now: () => NOW, mutate: (c) => { intake('absent', 'create')(c); (c.modules as { mascot: { enabled: boolean } }).mascot.enabled = true } })
  assert.equal(brief(ws).routes[2]!.id, 'character_mark')
})

test('partial rebrand: preservation decisions and risks, approved master untouched, owner path overrides the hint', () => {
  const { root, ws } = workspace({ slug: 'pilito', now: () => NOW, mutate: intake('present', 'retain') })
  const engine = new InterviewEngine(root)
  const proof = ensureApprovalSecret(root)
  assert.equal(engine.changeAnswer('brand.logo.masters', 'brand/assets/logo/ (approved master)').kind, 'recorded')
  assert.equal(engine.approve('brand.logo.masters', 'owner', proof).kind, 'recorded')
  const before = tracked(root)

  recordAnswer(ws, { question_id: 'identity.path', value: 'evolve' })
  recordAnswer(ws, { question_id: 'identity.change.reasons', value: 'readability,outdated', words: 'The wordmark is hard to read on the app icon.' })
  recordAnswer(ws, { question_id: 'identity.change.observed', value: 'observed_problem' })
  recordAnswer(ws, { question_id: 'identity.must_not_change', value: ['logo_symbol', 'colors'] })
  recordAnswer(ws, { question_id: 'identity.rollout.constraints', value: 'app_store_listing' })
  setEquity(ws, { component: 'typography', choice: 'refine', evidence: 'owner_reported', words: 'The type feels dated.' })
  setEquity(ws, { component: 'colors', choice: 'replace', evidence: 'owner_reported' })

  const out = brief(ws)
  assert.equal(out.path.source, 'owner_confirmed')
  assert.equal(out.path.value, 'evolve', 'the confirmed path wins over the retain hint')
  assert.equal(out.conclusion.code, 'change_requested')
  assert.equal(out.assets.approved_master, true)
  assert.ok(!out.missing.some((m) => m.code === 'no_master'))
  const row = (c: string) => out.equity.rows.find((r) => r.component === c)!
  assert.equal(row('logo_symbol').choice, 'preserve')
  assert.equal(row('logo_symbol').source, 'must_not_change_answer')
  assert.equal(row('logo_symbol').backing_fact!.state, 'approved')
  assert.equal(row('typography').choice, 'refine')
  assert.equal(row('typography').evidence_level, 'owner_reported_preference')
  assert.match(row('typography').owner_reason!, /^knowledge:kn_/)
  assert.equal(row('colors').conflict, true, 'must-not-change vs replace is flagged, not resolved')
  const risks = out.migration_risks.map((r) => r.code)
  for (const c of ['approved_assets_canonical', 'rollout_app_store_listing', 'possible_recognition_loss', 'preserve_conflict']) assert.ok(risks.includes(c), c)
  assert.deepEqual(out.routes.map((r) => r.id), ['evolve_preserve_equity', 'retain_improve_usage', 'full_rebrand'], 'retain / evolve / full rebrand always compared')
  const rebrand = out.routes.find((r) => r.id === 'full_rebrand')!
  assert.ok(rebrand.risks.some((r) => r.code === 'conflicts_with_preserve'))
  assert.ok(out.routes.find((r) => r.id === 'evolve_preserve_equity')!.forbidden.some((f) => f.code === 'keep_preserved'))
  assert.ok(out.routes.find((r) => r.id === 'retain_improve_usage')!.risks.some((r) => r.code === 'problem_persists'))
  assert.deepEqual(tracked(root), before, 'approved master, facts and assets unchanged')
  // The owner's words are Knowledge notes, cited by ref; the brief never copies them.
  assert.ok(!JSON.stringify(out).includes('hard to read on the app icon'))
  assert.ok(!renderBrief(out).includes('The type feels dated'))
})

test('identity working well: retain and improve usage is a valid conclusion', () => {
  const { ws } = workspace({ slug: 'steady', now: () => NOW, mutate: intake('present', 'evolve', 'visual_refresh') })
  recordAnswer(ws, { question_id: 'identity.path', value: 'evolve' })
  recordAnswer(ws, { question_id: 'identity.change.observed', value: 'personal_preference' })
  setEquity(ws, { component: 'logo_symbol', choice: 'preserve', evidence: 'owner_reported' })
  assert.equal(brief(ws).conclusion.code, 'retain_improve_usage', 'a preference alone with nothing marked for change')

  const { ws: kept } = workspace({ slug: 'kept', now: () => NOW, mutate: intake('present', 'retain') })
  recordAnswer(kept, { question_id: 'identity.path', value: 'retain' })
  const out = brief(kept)
  assert.equal(out.conclusion.code, 'retain_improve_usage')
  assert.equal(out.routes[0]!.id, 'retain_improve_usage')
  assert.deepEqual(diagnosisState(answersOf(readAudit(kept))).skipped.map((s) => s.id).sort(), ['identity.change.observed', 'identity.change.reasons'], 'retain skips change questions')
})

test('unknown equity stays unknown; measured recognition needs a cited study note', () => {
  const { ws } = workspace({ slug: 'equity', now: () => NOW, mutate: intake('present', 'evolve', 'logo_evolution') })
  recordAnswer(ws, { question_id: 'identity.path', value: 'evolve' })
  const out = brief(ws)
  assert.ok(out.equity.rows.length >= 8)
  assert.ok(out.equity.rows.every((r) => r.choice === 'unknown' && r.evidence_level === 'unknown'))
  assert.ok(out.missing.some((m) => m.code === 'equity_unknown'))
  assert.ok(!/\d+\s?%/.test(renderBrief(out)), 'no recognition percentage anywhere')

  assert.equal(code(() => setEquity(ws, { component: 'logo_symbol', choice: 'preserve', evidence: 'measured_study' })), 'refused')
  assert.equal(code(() => setEquity(ws, { component: 'logo_symbol', choice: 'preserve', evidence: 'owner_reported', study_note: 'kn_missing' })), 'not_found')
  assert.equal(code(() => setEquity(ws, { component: 'banner', choice: 'preserve' })), 'invalid_input')
  const study = recordAnswer(ws, { question_id: 'identity.recognition', value: 'measured_study', words: 'Survey summary: owner-supplied recognition study, 2026.' }).entry.note!
  setEquity(ws, { component: 'logo_symbol', choice: 'preserve', evidence: 'measured_study', study_note: study.id })
  const measured = brief(ws).equity.rows.find((r) => r.component === 'logo_symbol')!
  assert.equal(measured.evidence_level, 'measured')
  assert.equal(measured.study, `knowledge:${study.id}@${study.revision}`)
})

test('unverified competitor visuals are a research gap; cited visuals come only from the identity projection, quote-free', () => {
  const { ws } = workspace({ slug: 'visuals', now: () => NOW, mutate: intake('absent', 'create') })
  addCandidate(ws, { display_name: 'WordFlight', markets: 'US' })
  const nameOnly = brief(ws)
  assert.equal(nameOnly.landscape.visual_comparison, 'unavailable')
  assert.deepEqual(nameOnly.landscape.observations, [])
  assert.equal(nameOnly.landscape.similarity, 'not_assessed')
  assert.ok(nameOnly.missing.some((m) => m.code === 'visual_unavailable'))

  const { ws: cited } = workspace({ slug: 'visuals2', now: () => NOW, mutate: intake('absent', 'create') })
  const { home } = wordflightSources(cited)
  const wf = addCandidate(cited, { display_name: 'WordFlight', markets: 'US', domain: 'wordflight-app.com' }).competitor_id
  linkEvidence(cited, { competitor_id: wf, note: home.note_id, claim_key: 'wordflight.visual.paper_plane', dimension: 'visual_language', label: 'Paper plane symbol' })
  linkEvidence(cited, { competitor_id: wf, note: home.note_id, claim_key: 'wordflight.message.five_minutes', dimension: 'public_message', label: 'Five minutes a day' })
  const out = brief(cited)
  assert.equal(out.landscape.visual_comparison, 'available')
  assert.equal(out.landscape.projection, 'identity')
  assert.deepEqual(out.landscape.observations.map((o) => o.label), ['Paper plane symbol'], 'only visual_language observations, no message claims')
  assert.equal(out.landscape.observations[0]!.ref, home.provenance)
  assert.ok(out.routes.every((r) => r.cites.length === 1))
  assert.ok(!JSON.stringify(out).includes(VISUAL_QUOTE), 'the quote stays in the Knowledge note')
  assert.ok(out.decision.source_revisions.includes(home.provenance))
})

test('five rejected concepts and a chosen sixth come from existing Creative Learning with owner reasons; no parallel notes', () => {
  const { root, ws } = workspace({ slug: 'rounds', now: () => NOW, mutate: intake('absent', 'create') })
  const before = tracked(root)
  createProject(ws, { project_id: 'logo-round-1', title: 'First logo round', surface: 'logo', series: 'identity' })
  createProject(ws, { project_id: 'reel-one', title: 'A reel', surface: 'reel', series: 'launch' })
  assert.equal(code(() => linkCreativeProject(ws, 'reel-one')), 'invalid_input', 'only logo-surface projects')
  assert.equal(code(() => linkCreativeProject(ws, 'nope-404')), 'not_found')
  const ids = ['A', 'B', 'C', 'D', 'E', 'F']
  for (const id of ids) addVariant(ws, { project_id: 'logo-round-1', variant_id: id, asset: 'missing', describe: `Sketch ${id}` })
  const words: Record<string, string> = {}
  for (const id of ids.slice(0, 5)) {
    words[id] = `Concept ${id} feels too generic for us.`
    recordFeedback(ws, { project_id: 'logo-round-1', variant_id: id, text: words[id], verdict: 'reject', avoid: ['layout'] })
  }
  words.F = 'F is simple and still ours at icon size.'
  recordFeedback(ws, { project_id: 'logo-round-1', variant_id: 'F', text: words.F, verdict: 'like', keep: ['layout'] })
  selectVariant(ws, { project_id: 'logo-round-1', variant_id: 'F' })
  linkCreativeProject(ws, 'logo-round-1')

  const out = brief(ws)
  assert.equal(out.iteration.state, 'linked')
  const rejected = out.iteration.variants.filter((v) => v.status === 'rejected')
  assert.equal(rejected.length, 5)
  assert.deepEqual(out.iteration.selection, { variant_id: 'F', meaning: 'owner_selected_for_this_project', approved_mark: false })
  assert.equal(out.decision.selected_concept, 'logo-round-1/F')
  assert.ok(!out.missing.some((m) => m.code === 'no_creative_project'))
  for (const v of out.iteration.variants) {
    assert.equal(v.reasons.length, 1)
    const reason = v.reasons[0]!
    assert.equal(reason.source_state, 'current')
    const noteId = reason.provenance.replace(/^knowledge:/, '').split('@')[0]!
    assert.equal(findNote(ws, noteId).note.body.trim(), words[v.variant_id], 'the owner reason is retrievable from the Knowledge note')
    assert.ok(!JSON.stringify(out).includes(words[v.variant_id]!), 'the brief cites, never copies')
  }
  const notes = listNotes(ws, {}, { limit: 100 }).items
  assert.equal(notes.filter((n) => n.tags.includes('identity-audit')).length, 0, 'no parallel feedback notes')
  assert.equal(notes.filter((n) => n.tags.includes('creative-feedback')).length, 6)
  assert.equal(out.assets.approved_master, false, 'selection is not an approved master')
  assert.deepEqual(tracked(root), before)
})

test('approval is still required: brief, review mark and answers never change facts; review shows later changes', () => {
  const { root, ws } = workspace({ slug: 'approval', now: () => NOW, mutate: intake('present', 'rebrand', 'strategic_rebrand') })
  const before = tracked(root)
  recordAnswer(ws, { question_id: 'identity.path', value: 'rebrand' })
  const first = brief(ws)
  assert.deepEqual(first.routes.map((r) => r.id), ['full_rebrand', 'evolve_preserve_equity', 'retain_improve_usage'])
  assert.ok(first.routes[0]!.risks.some((r) => r.code === 'name_change_legal_and_migration'))
  assert.deepEqual(first.handoff.map((h) => h.code), ['select', 'register', 'approve', 'specify', 'legal', 'canonical'])
  markReviewed(ws, { brief_digest: first.brief_digest, sources_digest: first.sources_digest })
  assert.equal(brief(ws).decision.last_review!.changed_since, false)
  assert.equal(brief(ws).brief_digest, first.brief_digest, 'deterministic')
  recordAnswer(ws, { question_id: 'identity.change.reasons', value: 'merger' })
  assert.equal(brief(ws).decision.last_review!.changed_since, true)
  assert.equal(code(() => markReviewed(ws, { brief_digest: 'x', sources_digest: 'y' })), 'invalid_input')
  assert.deepEqual(tracked(root), before, 'no fact, logo or asset change without brand:approve')
  const facts = new InterviewEngine(root)
  assert.ok(facts, 'engine still opens')
})

test('answers: validation, unknown is a real answer, history kept, agent token refused, other brand refused', () => {
  const { root, ws } = workspace({ slug: 'answers', now: () => NOW })
  assert.equal(code(() => recordAnswer(ws, { question_id: 'identity.nope', value: 'x' })), 'not_found')
  assert.equal(code(() => recordAnswer(ws, { question_id: 'identity.path', value: 'burn_it' })), 'invalid_input')
  assert.equal(code(() => recordAnswer(ws, { question_id: 'identity.must_not_change', value: 'none,name' })), 'invalid_input')
  assert.equal(recordAnswer(ws, { question_id: 'identity.path', value: 'unknown' }).entry.value, 'unknown')
  const second = recordAnswer(ws, { question_id: 'identity.path', value: 'evolve' })
  assert.equal(second.changed_from, 'unknown')
  assert.equal(second.entry.history.length, 1)
  assert.equal(brief(ws).path.source, 'owner_confirmed')

  process.env[AGENT_TOKEN_ENV] = 'agt_test'
  try {
    assert.equal(code(() => brief(ws)), 'refused')
    assert.equal(code(() => readAudit(ws)), 'refused')
    assert.equal(code(() => recordAnswer(ws, { question_id: 'identity.path', value: 'retain' })), 'refused')
  } finally {
    delete process.env[AGENT_TOKEN_ENV]
  }

  const file = path.join(root, 'brand', '.private', 'identity', 'audit.json')
  const doc = JSON.parse(fs.readFileSync(file, 'utf8')) as { brand_slug: string }
  fs.writeFileSync(file, JSON.stringify({ ...doc, brand_slug: 'someone-else' }))
  assert.equal(code(() => readAudit(ws)), 'wrong_brand')
})

test('every human-facing string exists in en, fa and tr; the brief renders in Persian and Turkish', () => {
  const catalogs = { APPLICATION_CHECKS, BRIEF_HEADINGS, COMPONENT_LABELS, CONCLUSIONS, HANDOFF, MISSING, NEXT_STEP, PATH_SOURCE, RED_LINES, RISKS, RUBRIC, USE_LABELS }
  for (const [name, catalog] of Object.entries(catalogs)) for (const [key, text] of Object.entries(catalog)) for (const lang of ['en', 'fa', 'tr'] as const) assert.ok(text[lang]?.trim(), `${name}.${key}.${lang}`)
  for (const [key, route] of Object.entries(ROUTES)) for (const part of [route.title, route.why, route.why_not]) for (const lang of ['en', 'fa', 'tr'] as const) assert.ok(part[lang]?.trim(), `ROUTES.${key}.${lang}`)
  for (const q of DIAGNOSIS_QUESTIONS) for (const lang of ['en', 'fa', 'tr'] as const) assert.ok(q.prompt[lang].trim(), `${q.id}.${lang}`)

  const { ws } = workspace({ slug: 'langs', now: () => NOW, mutate: intake('present', 'evolve', 'visual_refresh') })
  recordAnswer(ws, { question_id: 'identity.path', value: 'evolve' })
  recordAnswer(ws, { question_id: 'identity.applications', value: 'app_icon,favicon' })
  recordAnswer(ws, { question_id: 'identity.scripts', value: 'latin,perso_arabic' })
  const fa = brief(ws, 'fa')
  assert.match(renderBrief(fa), /بریف لوگو و هویت/)
  assert.deepEqual(fa.applications.uses.map((u) => u.use), ['app_icon', 'favicon'], 'only the uses the owner named')
  assert.ok(fa.production.some((p) => p.code === 'rtl_lockup'))
  assert.match(renderBrief(brief(ws, 'tr')), /Logo ve kimlik brief/)
})
