import fs from 'node:fs'
import path from 'node:path'
import { buildCompetitiveMemo, type CompetitiveMemo, type MemoOptions } from '../competitive/memos.js'
import { loadProject, sourceStatus } from '../creative/store.js'
import { CreativeError, type Aspect, type Verdict } from '../creative/model.js'
import { readFacts } from '../facts.js'
import { readYaml } from '../fsutil.js'
import { knowledgeRef } from '../knowledge/proposals.js'
import type { KnowledgeWorkspace } from '../knowledge/workspace.js'
import { canonicalJson, sha256Hex } from '../strategy/model.js'
import {
  APPLICATION_CHECKS,
  BRIEF_HEADINGS,
  COMPONENT_LABELS,
  CONCLUSIONS,
  fillText,
  HANDOFF,
  MISSING,
  NEXT_STEP,
  RED_LINES,
  RISKS,
  ROUTES,
  RUBRIC,
  USE_LABELS,
  type IdentityLang,
} from './i18n.js'
import { APPLICATIONS, diagnosisState, EQUITY_COMPONENTS, list, single, type Application, type EquityChoice, type EquityComponent, type EquityEvidence, type IdentityPath } from './model.js'
import { answersOf, assertOwnerProcess, readAudit, type NoteRef } from './store.js'

/**
 * The logo and identity brief (Identity Slice D): a typed, deterministic draft built from
 *  - the owner's identity audit (closed answers and equity choices, owner words cited as Knowledge notes),
 *  - approved brand facts, cited by id and revision (values are never copied),
 *  - the `identity` competitive projection from Slice C, and nothing else from the competitor index,
 *  - the linked Creative Learning project for concept rounds (variants, owner feedback refs, selection).
 *
 * It writes nothing, approves nothing and never touches `brand.logo.*`, the asset manifest or a master file.
 * `status: draft`, `authorizes: []`. Same inputs, same brief (apart from `generated_at`).
 */

export const BRIEF_SCHEMA = 'brand-os.identity-brief/1'

/** Approved facts the brief cites, by group. Never copied, never written. */
export const BRIEF_FACTS = {
  problem: ['brand.strategy.purpose', 'brand.strategy.promise', 'brand.strategy.differentiation'],
  canonical: ['business.customer.primary_segment', 'business.market.geography', 'brand.personality.traits', 'brand.strategy.differentiation', 'brand.strategy.values'],
  assets: ['brand.logo.masters', 'brand.logo.variants', 'brand.logo.min_size', 'brand.logo.clear_space', 'brand.color.roles', 'brand.type.intent', 'brand.verbal.tagline', 'brand.verbal.voice', 'brand.mascot.enabled'],
  attributes: ['brand.strategy.differentiation', 'brand.personality.traits', 'brand.strategy.values'],
} as const

/** Which approved fact backs each equity element, when one exists. */
const COMPONENT_FACT: Partial<Record<EquityComponent, string>> = {
  logo_symbol: 'brand.logo.masters',
  logo_wordmark: 'brand.logo.variants',
  colors: 'brand.color.roles',
  typography: 'brand.type.intent',
  mascot: 'brand.mascot.enabled',
  tone: 'brand.verbal.voice',
  tagline: 'brand.verbal.tagline',
}

const USE_CHECKS: Record<Application, string[]> = {
  app_icon: ['square_crop', 'smallest_size', 'dark_light'],
  favicon: ['smallest_size', 'one_color'],
  website_header: ['horizontal_lockup', 'dark_light'],
  social_avatar: ['circle_crop', 'smallest_size'],
  print: ['one_color', 'print_color'],
  packaging: ['print_color', 'one_color'],
  signage: ['distance', 'one_color'],
  motion: ['motion_states'],
  merchandise: ['simplified', 'one_color'],
  email: ['raster_fallback', 'dark_light'],
}

/** Success signals the owner chose map onto rubric criteria; every criterion is always listed. */
const SIGNAL_CRITERIA: Record<string, string[]> = {
  small_size_recognition: ['legibility', 'distinctiveness'],
  channel_consistency: ['versatility'],
  fits_positioning: ['strategic_fit', 'meaningfulness'],
  easier_production: ['feasibility', 'versatility'],
  all_scripts: ['legibility'],
  customer_feedback: ['strategic_fit'],
  owner_satisfaction: ['meaningfulness'],
}

export interface FactRef {
  fact_id: string
  state: 'approved' | 'missing'
  revision: string | null
}

export interface EquityRow {
  component: EquityComponent
  label: string
  choice: EquityChoice
  /** Where the choice comes from. `must_not_change_answer` is the owner's diagnosis answer, not a recorded row. */
  source: 'equity_record' | 'must_not_change_answer' | 'not_recorded'
  evidence: EquityEvidence
  /** Separates a preference from a measurement. Recognition is `measured` only with a cited study note. */
  evidence_level: 'measured' | 'owner_reported_preference' | 'unknown'
  owner_reason: string | null
  study: string | null
  backing_fact: FactRef | null
  conflict: boolean
}

export interface Risk {
  code: string
  text: string
}

export interface Route {
  id: string
  title: string
  why: string
  why_not: string
  risks: Risk[]
  preserves: EquityComponent[]
  may_change: EquityComponent[]
  attributes: FactRef[]
  forbidden: Risk[]
  rubric: string[]
  status: 'hypothesis'
  /** Visual observations this route is read against. Empty when there is no cited visual evidence. */
  cites: string[]
}

export interface ApplicationEntry {
  use: Application
  label: string
  checks: Array<{ code: string; text: string }>
}

export interface IterationVariant {
  variant_id: string
  status: 'draft' | 'selected' | 'rejected'
  describe: string | null
  asset: 'missing' | 'manifest'
  reasons: Array<{ verdict: Verdict; keep: Aspect[]; avoid: Aspect[]; provenance: string; source_state: ReturnType<typeof sourceStatus>['state'] }>
}

export interface IdentityBrief {
  schema: typeof BRIEF_SCHEMA
  kind: 'identity_brief'
  status: 'draft'
  brand_slug: string
  lang: IdentityLang
  generated_at: string
  path: { value: IdentityPath | null; source: 'owner_confirmed' | 'intake_hint_unconfirmed' | 'none'; intake: VisualMemo['intake'] }
  conclusion: { code: keyof typeof CONCLUSIONS | string; text: string }
  diagnosis: { complete: boolean; answered: string[]; unknown: string[]; pending: string[]; next: string | null; answers: Record<string, { value: string | string[]; owner_words: string | null }> }
  problem: { reasons: string[]; observed: string | null; success: string[]; facts: FactRef[] }
  canonical: FactRef[]
  assets: {
    approved_master: boolean
    logo_present_hint: boolean
    facts: FactRef[]
    /** Logo-tagged manifest entries. EXAMPLE placeholders are never a mark. */
    manifest: Array<{ id: string; status: string; example: boolean }>
  }
  equity: { applicable: boolean; rows: EquityRow[] }
  migration_risks: Risk[]
  landscape: {
    projection: 'identity'
    context_state: string
    source_digest: string
    visual_comparison: 'available' | 'unavailable'
    similarity: 'not_assessed'
    competitors: string[]
    observations: Array<{ competitor: string; label: string; ref: string; cell: string }>
    unresolved: Array<{ competitor: string; ref: string; ref_state: string }>
    warnings: Array<{ code: string; text: string }>
    gaps: string[]
  }
  routes: Route[]
  applications: { answered: boolean; uses: ApplicationEntry[]; scripts: string[] }
  production: Array<{ code: string; text: string }>
  red_lines: Risk[]
  rubric: { criteria: Array<{ id: string; text: string; emphasized_by: string[] }>; weights: null }
  iteration: { state: 'linked' | 'not_linked' | 'missing'; project_id: string | null; variants: IterationVariant[]; selection: { variant_id: string; meaning: 'owner_selected_for_this_project'; approved_mark: false } | null }
  decision: {
    reviewer: 'owner'
    selected_concept: string | null
    open_concerns: Risk[]
    next_revision: string
    last_review: { reviewed_at: string; changed_since: boolean } | null
    source_revisions: string[]
  }
  handoff: Array<{ code: string; text: string }>
  missing: Array<{ code: string; text: string }>
  not_known: Array<{ code: string; text: string }>
  prohibited_inferences: CompetitiveMemo['prohibited_inferences']
  sources_digest: string
  brief_digest: string
  authorizes: []
}

export type BriefOptions = MemoOptions
type VisualMemo = Extract<CompetitiveMemo, { kind: 'visual_landscape_assessment' }>

function cite(facts: ReturnType<typeof readFacts>, ids: readonly string[]): FactRef[] {
  return ids.map((id) => {
    const fact = facts[id]
    const approved = Boolean(fact && fact.status === 'approved' && fact.revision_hash)
    return { fact_id: id, state: approved ? 'approved' : 'missing', revision: approved ? fact!.revision_hash! : null }
  })
}

function ref(note: NoteRef | null): string | null {
  return note ? knowledgeRef(note.id, note.revision) : null
}

function mascotEnabled(ws: KnowledgeWorkspace): boolean {
  try {
    const file = path.join(ws.root, 'brand', 'brand.config.yaml')
    const config = fs.existsSync(file) ? readYaml<{ modules?: { mascot?: { enabled?: unknown } } }>(file) : null
    return config?.modules?.mascot?.enabled === true
  } catch {
    return false
  }
}

function logoManifest(ws: KnowledgeWorkspace): IdentityBrief['assets']['manifest'] {
  try {
    const file = path.join(ws.root, 'brand', 'assets', 'asset-manifest.yaml')
    if (!fs.existsSync(file)) return []
    const doc = readYaml<{ assets?: Array<{ id?: unknown; status?: unknown; tags?: unknown; license?: unknown }> }>(file)
    return (doc.assets ?? [])
      .filter((a) => Array.isArray(a.tags) && a.tags.includes('logo') && typeof a.id === 'string')
      .map((a) => ({
        id: a.id as string,
        status: typeof a.status === 'string' ? a.status : 'unknown',
        example: (Array.isArray(a.tags) && a.tags.includes('example')) || /example/i.test(String(a.id)) || /EXAMPLE/.test(String(a.license ?? '')),
      }))
  } catch {
    return []
  }
}

function resolvePath(answers: ReturnType<typeof answersOf>, memo: VisualMemo): IdentityBrief['path'] {
  const owner = single(answers['identity.path'])
  if (owner && owner !== 'unknown' && owner !== 'undecided') return { value: owner as IdentityPath, source: 'owner_confirmed', intake: memo.intake }
  if (owner === 'undecided') return { value: 'undecided', source: 'owner_confirmed', intake: memo.intake }
  const hint = memo.intake.choice.identity_intent
  if (memo.intake.state === 'recorded' && hint !== 'undecided') return { value: hint, source: 'intake_hint_unconfirmed', intake: memo.intake }
  return { value: null, source: 'none', intake: memo.intake }
}

/** Builds the brief. Reads only; refused under an agent token. */
export function buildIdentityBrief(ws: KnowledgeWorkspace, opts: BriefOptions): IdentityBrief {
  assertOwnerProcess()
  const memo = buildCompetitiveMemo(ws, 'identity', opts)
  if (memo.kind !== 'visual_landscape_assessment') throw new Error('identity projection expected')
  const lang = memo.lang as IdentityLang
  const t = (catalog: Record<string, Record<IdentityLang, string>>, code: string, vars: Record<string, string> = {}) => fillText(catalog[code]![lang], vars)
  const label = (c: EquityComponent) => COMPONENT_LABELS[c]![lang]

  const audit = readAudit(ws)
  const answers = answersOf(audit)
  const state = diagnosisState(answers)
  const facts = readFacts(ws.root, 'approved', ws.brandSlug)
  const pathInfo = resolvePath(answers, memo)
  const effective = pathInfo.value
  const mascot = mascotEnabled(ws)

  const assetFacts = cite(facts, BRIEF_FACTS.assets)
  const approvedMaster = assetFacts.find((f) => f.fact_id === 'brand.logo.masters')!.state === 'approved'
  const logoHint = memo.intake.choice.logo_presence === 'present'
  const creating = effective === 'create' || (!approvedMaster && !logoHint && effective !== 'retain' && effective !== 'evolve' && effective !== 'rebrand')

  // Equity preservation matrix: only when there is an identity to preserve.
  const mustNot = list(answers['identity.must_not_change']) as EquityComponent[]
  const rows: EquityRow[] = []
  if (!creating) {
    for (const component of EQUITY_COMPONENTS) {
      const entry = audit.equity[component]
      if (!entry && component === 'mascot' && !mascot) continue
      if (!entry && component === 'other') continue
      const preserveAnswer = mustNot.includes(component)
      const choice: EquityChoice = entry ? entry.choice : preserveAnswer ? 'preserve' : 'unknown'
      const evidence: EquityEvidence = entry ? entry.evidence : preserveAnswer ? 'owner_reported' : 'unknown'
      const backing = COMPONENT_FACT[component]
      rows.push({
        component,
        label: label(component),
        choice,
        source: entry ? 'equity_record' : preserveAnswer ? 'must_not_change_answer' : 'not_recorded',
        evidence,
        evidence_level: evidence === 'measured_study' && entry?.study ? 'measured' : evidence === 'owner_reported' ? 'owner_reported_preference' : 'unknown',
        owner_reason: ref(entry?.note ?? null),
        study: ref(entry?.study ?? null),
        backing_fact: backing ? cite(facts, [backing])[0]! : null,
        conflict: preserveAnswer && (choice === 'refine' || choice === 'replace'),
      })
    }
  }
  const preserved = rows.filter((r) => r.choice === 'preserve').map((r) => r.component)
  const changing = rows.filter((r) => r.choice === 'refine' || r.choice === 'replace').map((r) => r.component)
  const unknownRows = rows.filter((r) => r.choice === 'unknown' || r.choice === 'evaluate' || r.evidence === 'unknown').map((r) => r.component)
  const listText = (items: EquityComponent[]) => items.map(label).join(', ')

  // Problem definition.
  const reasons = list(answers['identity.change.reasons'])
  const observed = single(answers['identity.change.observed'])
  const observedValue = observed && observed !== 'unknown' ? observed : null
  const success = list(answers['identity.success'])

  // Conclusion.
  let conclusion: string
  if (creating) conclusion = 'create_first_identity'
  else if (effective === null || effective === 'undecided') conclusion = 'owner_decision_required'
  else if (effective === 'retain') conclusion = 'retain_improve_usage'
  else if (!changing.length && observedValue !== 'observed_problem' && observedValue !== 'both') conclusion = 'retain_improve_usage'
  else conclusion = 'change_requested'

  // Migration risks.
  const rollout = list(answers['identity.rollout.constraints'])
  const migration: Risk[] = []
  if (!creating) migration.push({ code: 'approved_assets_canonical', text: t(RISKS, 'approved_assets_canonical') })
  for (const item of rollout) if (RISKS[`rollout_${item}`]) migration.push({ code: `rollout_${item}`, text: t(RISKS, `rollout_${item}`) })
  for (const component of changing) {
    const row = rows.find((r) => r.component === component)!
    if (row.evidence_level !== 'measured') migration.push({ code: 'possible_recognition_loss', text: t(RISKS, 'possible_recognition_loss', { component: label(component) }) })
  }
  if (changing.includes('name')) migration.push({ code: 'name_change_legal_and_migration', text: t(RISKS, 'name_change_legal_and_migration') })
  for (const row of rows.filter((r) => r.conflict)) migration.push({ code: 'preserve_conflict', text: t(RISKS, 'preserve_conflict', { component: row.label, choice: row.choice }) })

  // Routes: 2–3 distinct directions.
  const attributes = cite(facts, BRIEF_FACTS.attributes)
  const visualIds = memo.observations.filter((o) => o.dimension === 'visual_language').map((o) => o.observation_id)
  const baseForbidden: Risk[] = ['no_tracing', 'no_fake_files', 'no_trademark_claim'].map((code) => ({ code, text: t(RED_LINES, code) }))
  const withPreserved = (forbidden: Risk[]) => (preserved.length ? [...forbidden, { code: 'keep_preserved', text: t(RED_LINES, 'keep_preserved', { list: listText(preserved) }) }] : forbidden)
  const allCriteria = Object.keys(RUBRIC)
  const route = (id: string, risks: string[], extra: { preserves?: EquityComponent[]; may_change?: EquityComponent[]; forbidden?: Risk[]; riskVars?: Record<string, Record<string, string>> } = {}): Route => ({
    id,
    title: ROUTES[id]!.title[lang],
    why: ROUTES[id]!.why[lang],
    why_not: ROUTES[id]!.why_not[lang],
    risks: risks.map((code) => ({ code, text: t(RISKS, code, extra.riskVars?.[code] ?? {}) })),
    preserves: extra.preserves ?? [],
    may_change: extra.may_change ?? [],
    attributes,
    forbidden: extra.forbidden ?? baseForbidden,
    rubric: allCriteria,
    status: 'hypothesis',
    cites: visualIds,
  })
  const routes: Route[] = []
  if (creating) {
    routes.push(route('wordmark_led', ['similarity_unchecked']))
    routes.push(route('symbol_and_wordmark', ['small_size_detail', 'similarity_unchecked']))
    routes.push(mascot ? route('character_mark', ['small_size_detail', 'similarity_unchecked']) : route('monogram_icon', ['similarity_unchecked']))
  } else {
    const all = rows.map((r) => r.component)
    const rolloutRisks = rollout.filter((item) => RISKS[`rollout_${item}`]).map((item) => `rollout_${item}`)
    const retainRisks = observedValue === 'observed_problem' || observedValue === 'both' ? ['problem_persists'] : []
    const evolveRisks = ['too_subtle', ...rolloutRisks]
    const rebrandRisks = ['recognition_reset', ...rolloutRisks, ...(preserved.length ? ['conflicts_with_preserve'] : []), ...(preserved.includes('name') ? [] : ['name_change_legal_and_migration']), 'similarity_unchecked']
    const retain = route('retain_improve_usage', retainRisks, { preserves: all, may_change: [], forbidden: withPreserved(baseForbidden) })
    const evolve = route('evolve_preserve_equity', evolveRisks, { preserves: preserved, may_change: changing.length ? changing : all.filter((c) => !preserved.includes(c)), forbidden: withPreserved(baseForbidden) })
    const rebrand = route('full_rebrand', rebrandRisks, { preserves: [], may_change: all, riskVars: { conflicts_with_preserve: { list: listText(preserved) } } })
    if (effective === 'rebrand') routes.push(rebrand, evolve, retain)
    else if (effective === 'evolve') routes.push(evolve, retain, rebrand)
    else routes.push(retain, evolve, rebrand)
  }

  // Applications: only the uses the owner named; until then, ask.
  const usesAnswer = answers['identity.applications']
  const answeredUses = usesAnswer !== undefined && usesAnswer !== 'unknown'
  const uses = (answeredUses ? list(usesAnswer) : [...APPLICATIONS]) as Application[]
  const applications: ApplicationEntry[] = uses.map((use) => ({
    use,
    label: USE_LABELS[use]![lang],
    checks: USE_CHECKS[use].map((code) => ({ code, text: t(APPLICATION_CHECKS, code, { use: USE_LABELS[use]![lang] }) })),
  }))
  const scripts = list(answers['identity.scripts'])
  const minSize = assetFacts.find((f) => f.fact_id === 'brand.logo.min_size')!
  const production = [
    { code: 'contrast', text: t(APPLICATION_CHECKS, 'contrast') },
    { code: 'one_color', text: t(APPLICATION_CHECKS, 'one_color', { use: COMPONENT_LABELS.logo_symbol![lang] }) },
    ...(scripts.includes('perso_arabic') ? [{ code: 'rtl_lockup', text: t(APPLICATION_CHECKS, 'rtl_lockup') }] : []),
    minSize.state === 'approved' && approvedMaster ? { code: 'min_size_fact', text: fillText(BRIEF_HEADINGS.min_size_fact![lang], { field: minSize.fact_id }) } : { code: 'min_size_unset', text: BRIEF_HEADINGS.min_size_unset![lang] },
    { code: 'formats', text: t(APPLICATION_CHECKS, 'formats') },
  ]

  // Concept rounds from Creative Learning: references only, the owner's words stay in their notes.
  let iteration: IdentityBrief['iteration'] = { state: 'not_linked', project_id: null, variants: [], selection: null }
  if (audit.creative_project_id) {
    try {
      const project = loadProject(ws, audit.creative_project_id)
      iteration = {
        state: 'linked',
        project_id: project.project_id,
        variants: project.variants.map((v) => ({
          variant_id: v.variant_id,
          status: v.status,
          describe: v.describe,
          asset: v.asset.state,
          reasons: project.feedback
            .filter((f) => f.variant_id === v.variant_id)
            .map((f) => ({ verdict: f.verdict, keep: f.keep, avoid: f.avoid, provenance: knowledgeRef(f.note.id, f.note.revision), source_state: sourceStatus(ws, f.note).state })),
        })),
        selection: project.selection ? { variant_id: project.selection.variant_id, meaning: 'owner_selected_for_this_project', approved_mark: false } : null,
      }
    } catch (error) {
      if (!(error instanceof CreativeError)) throw error
      iteration = { state: 'missing', project_id: audit.creative_project_id, variants: [], selection: null }
    }
  }

  // Missing and unknown.
  const missing: Array<{ code: string; text: string }> = []
  if (pathInfo.source !== 'owner_confirmed') missing.push({ code: 'path_unconfirmed', text: t(MISSING, 'path_unconfirmed') })
  if (state.pending.length) missing.push({ code: 'diagnosis_pending', text: t(MISSING, 'diagnosis_pending', { list: state.pending.join(', ') }) })
  const citedFacts = new Map<string, FactRef>()
  for (const f of [...cite(facts, BRIEF_FACTS.problem), ...cite(facts, BRIEF_FACTS.canonical), ...assetFacts]) citedFacts.set(f.fact_id, f)
  for (const f of citedFacts.values()) if (f.state === 'missing') missing.push({ code: 'fact_missing', text: t(MISSING, 'fact_missing', { field: f.fact_id }) })
  if (!approvedMaster) missing.push({ code: 'no_master', text: t(MISSING, 'no_master') })
  if (memo.visual_comparison === 'unavailable') missing.push({ code: 'visual_unavailable', text: t(MISSING, 'visual_unavailable') })
  if (iteration.state !== 'linked') missing.push({ code: 'no_creative_project', text: t(MISSING, 'no_creative_project') })
  missing.push({ code: 'legal_review', text: t(MISSING, 'legal_review') })
  if (unknownRows.length) missing.push({ code: 'equity_unknown', text: t(MISSING, 'equity_unknown', { list: listText(unknownRows) }) })

  // Next revision.
  let next: string
  if (pathInfo.source !== 'owner_confirmed') next = t(NEXT_STEP, 'confirm_path')
  else if (state.next) next = t(NEXT_STEP, 'answer_diagnosis', { field: state.next.id })
  else if (memo.visual_comparison === 'unavailable') next = t(NEXT_STEP, 'record_visuals')
  else if (!iteration.selection) next = t(NEXT_STEP, 'concept_round')
  else next = t(NEXT_STEP, 'approve_artwork')

  // Source revisions: everything the brief read, by reference.
  const sourceRevisions = [
    ...[...citedFacts.values()].filter((f) => f.revision).map((f) => `fact:${f.fact_id}@${f.revision}`),
    ...Object.values(audit.answers).flatMap((a) => (a.note ? [knowledgeRef(a.note.id, a.note.revision)] : [])),
    ...Object.values(audit.equity).flatMap((e) => [e?.note, e?.study].flatMap((n) => (n ? [knowledgeRef(n.id, n.revision)] : []))),
    ...memo.source_refs,
    ...iteration.variants.flatMap((v) => v.reasons.map((r) => r.provenance)),
  ]
  const source_revisions = [...new Set(sourceRevisions)].sort()
  const sources_digest = sha256Hex(canonicalJson({ source_revisions, audit_answers: answers, equity: rows.map((r) => [r.component, r.choice, r.evidence]), landscape: memo.context.source_digest, creative: iteration }))

  const openConcerns: Risk[] = [
    ...rows.filter((r) => r.conflict).map((r) => ({ code: 'preserve_conflict', text: t(RISKS, 'preserve_conflict', { component: r.label, choice: r.choice }) })),
    ...unknownRows.map((c) => ({ code: 'needs_research', text: t(RISKS, 'needs_research', { component: label(c) }) })),
  ]

  const brief: IdentityBrief = {
    schema: BRIEF_SCHEMA,
    kind: 'identity_brief',
    status: 'draft',
    brand_slug: ws.brandSlug,
    lang,
    generated_at: memo.generated_at,
    path: pathInfo,
    conclusion: { code: conclusion, text: t(CONCLUSIONS, conclusion) },
    diagnosis: {
      complete: state.complete,
      answered: state.answered,
      unknown: state.unknown,
      pending: state.pending,
      next: state.next?.id ?? null,
      answers: Object.fromEntries(Object.entries(answers).map(([id, value]) => [id, { value: value!, owner_words: ref(audit.answers[id]?.note ?? null) }])),
    },
    problem: { reasons, observed: observedValue, success, facts: cite(facts, BRIEF_FACTS.problem) },
    canonical: cite(facts, BRIEF_FACTS.canonical),
    assets: { approved_master: approvedMaster, logo_present_hint: logoHint, facts: assetFacts, manifest: logoManifest(ws) },
    equity: { applicable: !creating, rows },
    migration_risks: migration,
    landscape: {
      projection: 'identity',
      context_state: memo.context.state,
      source_digest: memo.context.source_digest,
      visual_comparison: memo.visual_comparison,
      similarity: 'not_assessed',
      competitors: [...new Set([...memo.observations.map((o) => o.competitor_name), ...memo.unresolved.map((u) => u.competitor_name)])].sort(),
      observations: memo.observations.filter((o) => o.dimension === 'visual_language').map((o) => ({ competitor: o.competitor_name, label: o.label, ref: o.ref, cell: o.cell })),
      unresolved: memo.unresolved.filter((u) => u.dimension === 'visual_language').map((u) => ({ competitor: u.competitor_name, ref: u.ref, ref_state: u.ref_state })),
      warnings: memo.warnings.map((w) => ({ code: w.code, text: w.text })),
      gaps: memo.gaps.filter((g) => g.dimension === 'visual_language' || g.dimension === null).map((g) => g.text),
    },
    routes,
    applications: { answered: answeredUses, uses: applications, scripts },
    production,
    red_lines: ['no_tracing', 'inspiration_rights', 'no_fake_files', 'no_trademark_claim'].map((code) => ({ code, text: t(RED_LINES, code) })).concat(preserved.length ? [{ code: 'keep_preserved', text: t(RED_LINES, 'keep_preserved', { list: listText(preserved) }) }] : []),
    rubric: {
      criteria: allCriteria.map((id) => ({ id, text: t(RUBRIC, id), emphasized_by: success.filter((s) => SIGNAL_CRITERIA[s]?.includes(id)) })),
      weights: null,
    },
    iteration,
    decision: {
      reviewer: 'owner',
      selected_concept: iteration.selection ? `${iteration.project_id}/${iteration.selection.variant_id}` : null,
      open_concerns: openConcerns,
      next_revision: next,
      last_review: null,
      source_revisions,
    },
    handoff: ['select', 'register', 'approve', 'specify', 'legal', 'canonical'].map((code) => ({ code, text: t(HANDOFF, code) })),
    missing,
    not_known: memo.not_known,
    prohibited_inferences: memo.prohibited_inferences,
    sources_digest,
    brief_digest: '',
    authorizes: [],
  }
  brief.brief_digest = briefDigest(brief)
  const last = audit.reviews.at(-1)
  if (last) brief.decision.last_review = { reviewed_at: last.reviewed_at, changed_since: last.sources_digest !== sources_digest || last.brief_digest !== brief.brief_digest }
  return brief
}

/** Digest of the brief's content, without the time it was generated or the review mark. */
export function briefDigest(brief: IdentityBrief): string {
  const { generated_at: _g, brief_digest: _b, decision, ...rest } = brief
  const { last_review: _l, ...decisionRest } = decision
  return sha256Hex(canonicalJson({ ...rest, decision: decisionRest }))
}
