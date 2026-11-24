import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { compileTokens, GENERATED_TOKEN_DIR, tokenDigest, type TokenNode } from '@brand-os/design-tokens'
import { readFacts, type CanonicalFact } from './facts.js'
import { writeAtomic, writeYaml } from './fsutil.js'
import { approvalProofMatches } from './private-store.js'
import { parseStructured, type ColorEntry, type StructuredType } from './structured.js'
import {
  brandRoleTokenId,
  parseSemanticMap,
  SEMANTIC_COLOR_SLOTS,
  SEMANTIC_MAP_QUESTION,
  SEMANTIC_SLOTS,
  semanticAnswerText,
  suggestSemanticMap,
  type SemanticAssignment,
  type SemanticSlot,
  type SemanticSuggestion,
} from './token-semantic.js'

/**
 * Approved structured answers → draft DTCG tokens in brand/tokens/generated/.
 *
 * - Only approved, non-restricted facts are read. Drafts never become tokens.
 * - Every generated token is a draft. It is retrievable only after its value hash is approved in
 *   brand/tokens/approvals.yaml and its id is published in publication-policy.yaml.
 * - Each owner colour role becomes `color.brand-role.<role>`, whatever its name. A template id such as
 *   `color.brand.primary` is generated only from the approved `brand.color.semantic_map` answer; until then the
 *   report suggests a mapping and applies none of it (token-semantic.ts).
 * - A token id that already has an approval is never overwritten. Its previous generated value is
 *   kept (or the base value stays) and the run reports the refusal. Changing it is a reviewed edit.
 */

export const TOKEN_SOURCES: Array<{ question_id: string; type: StructuredType; file: string }> = [
  { question_id: 'brand.color.roles', type: 'color', file: 'color.tokens.json' },
  { question_id: 'brand.type.scale', type: 'font', file: 'typography.tokens.json' },
  { question_id: 'brand.logo.min_size', type: 'logo_spec', file: 'logo.tokens.json' },
]

/** Every approved answer `brand:tokens:generate` reads. Approving one of them means the draft tokens are out of date. */
export const TOKEN_SOURCE_QUESTIONS: readonly string[] = [...TOKEN_SOURCES.map((source) => source.question_id), SEMANTIC_MAP_QUESTION]

/** The next step `brand:approve` prints when the batch approved a token source (BOS-17). Null otherwise. */
export function tokenNextStep(approvedQuestionIds: Iterable<string | null | undefined>): string | null {
  const touched = [...new Set([...approvedQuestionIds].filter((id): id is string => typeof id === 'string' && TOKEN_SOURCE_QUESTIONS.includes(id)))]
  if (touched.length === 0) return null
  return `Next step: ${touched.join(', ')} ${touched.length === 1 ? 'is' : 'are'} approved. Run \`npm run brand:tokens:generate\` to turn these into draft tokens. Generated tokens stay drafts until the owner approves them with brand:tokens:approve.`
}

const APPROVALS_PATH = path.join('brand', 'tokens', 'approvals.yaml')

export type TokenOutcome = 'created' | 'updated' | 'unchanged' | 'refused_approved' | 'removed'

export interface GeneratedTokenResult {
  id: string
  outcome: TokenOutcome
  source_fact: string
  reason: string
}

export type TokenSourceState = 'used' | 'missing' | 'not_approved' | 'restricted' | 'invalid'

/**
 * The semantic mapping (owner roles → template ids). `applied` comes only from the approved answer. `suggestions`
 * are printed for the owner and never applied; `suggested_answer` is that suggestion as an answer to review.
 */
export interface SemanticMapReport {
  question_id: string
  state: TokenSourceState | 'no_roles'
  applied: SemanticAssignment[]
  /** Slots the owner kept on the template on purpose (`slot = none`). */
  kept_template: SemanticSlot[]
  problems: string[]
  suggestions: SemanticSuggestion[]
  suggested_answer: string | null
  /** Template color ids that are still template examples after this run. */
  template_examples: string[]
  /** The command that records the suggestion as a draft answer for the owner to edit and approve. */
  answer_command: string | null
}

export interface TokenGenerateReport {
  ok: boolean
  dry_run: boolean
  files: string[]
  tokens: GeneratedTokenResult[]
  sources: Array<{ question_id: string; state: TokenSourceState; version: number | null }>
  semantic: SemanticMapReport
  note: string
}

interface Draft {
  id: string
  file: string
  type: string
  value: unknown
  description: string
  fact: CanonicalFact
}

interface ApprovalEntry {
  approved_by?: string
  approved_at?: string
  value_sha256?: string
  source?: string
}

export function readTokenApprovals(root: string): Record<string, ApprovalEntry> {
  const file = path.join(root, APPROVALS_PATH)
  if (!fs.existsSync(file)) return {}
  const doc = parse(fs.readFileSync(file, 'utf8')) as { approved?: Record<string, ApprovalEntry> } | null
  return doc?.approved ?? {}
}

function draftsFrom(question_id: string, type: StructuredType, file: string, fact: CanonicalFact): Draft[] | null {
  const parsed = parseStructured(type, fact.value)
  if (!parsed) return null
  const base = { file, fact }
  if (parsed.type === 'color') {
    // Every owner role gets its own namespace, whatever it is called (BOS-17). Template ids come only from the
    // approved semantic map.
    return parsed.colors.map((color) => ({
      ...base,
      id: brandRoleTokenId(color.role),
      type: 'color',
      value: { colorSpace: 'srgb', hex: color.hex },
      description: `Draft from approved ${question_id} (owner role ${color.role}).`,
    }))
  }
  if (parsed.type === 'font') {
    return parsed.fonts.flatMap((font) => [
      { ...base, id: `type.fontFamily.${font.role}`, type: 'fontFamily', value: [font.family, ...font.fallback], description: `Draft from approved ${question_id} (${font.role}).` },
      ...(font.size_px === null
        ? []
        : [{ ...base, id: `type.fontSize.${font.role}`, type: 'dimension', value: { value: font.size_px, unit: 'px' }, description: `Draft size from approved ${question_id}.` }]),
      ...(font.line_height === null
        ? []
        : [{ ...base, id: `type.lineHeight.${font.role}`, type: 'number', value: font.line_height, description: `Draft line height from approved ${question_id}.` }]),
    ])
  }
  if (parsed.type === 'logo_spec') {
    const logo = parsed.logo
    return [
      { ...base, id: 'logo.minSize', type: 'dimension', value: { value: logo.min_size_px, unit: 'px' }, description: `Draft minimum on-screen size from approved ${question_id}.` },
      logo.clear_space.unit === 'px'
        ? { ...base, id: 'logo.clearSpace', type: 'dimension', value: { value: logo.clear_space.value, unit: 'px' }, description: `Draft clear space from approved ${question_id}.` }
        : { ...base, id: 'logo.clearSpace', type: 'number', value: logo.clear_space.value, description: `Draft clear space as a multiple of the mark height, from approved ${question_id}.` },
      ...(logo.min_print_mm === null
        ? []
        : [{ ...base, id: 'logo.minPrintSize', type: 'dimension', value: { value: logo.min_print_mm, unit: 'mm' }, description: `Draft minimum print size from approved ${question_id}.` }]),
    ]
  }
  return null
}

function setPath(doc: TokenNode, id: string, node: TokenNode): void {
  const parts = id.split('.')
  let cursor = doc
  for (const part of parts.slice(0, -1)) {
    cursor[part] ??= {}
    cursor = cursor[part] as TokenNode
  }
  cursor[parts[parts.length - 1] ?? id] = node
}

function getPath(doc: TokenNode | undefined, id: string): TokenNode | undefined {
  let cursor: unknown = doc
  for (const part of id.split('.')) {
    if (!cursor || typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[part]
  }
  return cursor && typeof cursor === 'object' && '$value' in cursor ? (cursor as TokenNode) : undefined
}

function leafIds(doc: TokenNode | undefined, prefix: string[] = []): string[] {
  if (!doc) return []
  if (doc.$value !== undefined) return [prefix.join('.')]
  return Object.entries(doc)
    .filter(([key, value]) => !key.startsWith('$') && value && typeof value === 'object')
    .flatMap(([key, value]) => leafIds(value as TokenNode, [...prefix, key]))
}

function readGenerated(root: string, file: string): TokenNode | undefined {
  const full = path.join(root, GENERATED_TOKEN_DIR, file)
  return fs.existsSync(full) ? (JSON.parse(fs.readFileSync(full, 'utf8')) as TokenNode) : undefined
}

function sourceState(fact: CanonicalFact | undefined): TokenSourceState {
  if (!fact || fact.value === null || fact.value === undefined) return 'missing'
  if (fact.status !== 'approved') return 'not_approved'
  if (fact.classification === 'restricted') return 'restricted'
  return 'used'
}

/**
 * The semantic map: applied only from the approved answer, suggested (never applied) for every slot it leaves open.
 * Returns the drafts for the mapped template ids, written to the color file next to the owner roles.
 */
function semanticDrafts(facts: Record<string, CanonicalFact>, roles: ColorEntry[] | null): { drafts: Draft[]; report: SemanticMapReport } {
  const fact = facts[SEMANTIC_MAP_QUESTION]
  let state: SemanticMapReport['state'] = sourceState(fact)
  const report: SemanticMapReport = {
    question_id: SEMANTIC_MAP_QUESTION,
    state,
    applied: [],
    kept_template: [],
    problems: [],
    suggestions: [],
    suggested_answer: null,
    template_examples: [],
    answer_command: null,
  }
  const drafts: Draft[] = []
  if (!roles || roles.length === 0) {
    report.state = state === 'used' ? 'no_roles' : state
    if (state === 'used') report.problems.push('brand.color.roles is not approved, so no role can be mapped.')
    report.template_examples = SEMANTIC_SLOTS.map((slot) => SEMANTIC_COLOR_SLOTS[slot])
    return { drafts, report }
  }
  if (state === 'used' && fact) {
    const parsed = parseSemanticMap(String(fact.value), roles)
    report.applied = parsed.assignments
    report.kept_template = parsed.unmapped
    report.problems = parsed.problems
    if (parsed.assignments.length === 0 && parsed.unmapped.length === 0) state = 'invalid'
    for (const item of parsed.assignments) {
      drafts.push({
        id: item.token_id,
        file: 'color.tokens.json',
        type: 'color',
        value: { colorSpace: 'srgb', hex: item.hex },
        description: `Draft from approved ${SEMANTIC_MAP_QUESTION}: ${item.slot} is the owner role ${item.role}.`,
        fact,
      })
    }
  }
  report.state = state
  const decided = new Set<SemanticSlot>([...report.applied.map((item) => item.slot), ...report.kept_template])
  report.suggestions = suggestSemanticMap(roles, decided)
  if (report.suggestions.length > 0) {
    // The suggestion keeps the owner's own entries, so recording it never drops a decision already made.
    const answer = semanticAnswerText([...report.applied, ...report.kept_template.map((slot) => ({ slot, role: 'none' })), ...report.suggestions])
    report.suggested_answer = answer
    report.answer_command = `npm run brand:interview -- --question ${SEMANTIC_MAP_QUESTION} --answer "${answer}"`
  }
  report.template_examples = SEMANTIC_SLOTS.filter((slot) => !report.applied.some((item) => item.slot === slot)).map((slot) => SEMANTIC_COLOR_SLOTS[slot])
  return { drafts, report }
}

export function generateTokens(root: string, brandId: string, options: { dryRun?: boolean } = {}): TokenGenerateReport {
  const facts = readFacts(root, 'approved', brandId)
  const approvals = readTokenApprovals(root)
  // Draft tokens per file, in source order. The color file carries the owner roles and the semantic map.
  const byFile = new Map<string, { sources: string[]; drafts: Draft[] }>()
  const group = (file: string) => {
    if (!byFile.has(file)) byFile.set(file, { sources: [], drafts: [] })
    return byFile.get(file)!
  }
  const sources: TokenGenerateReport['sources'] = []
  let roles: ColorEntry[] | null = null
  for (const source of TOKEN_SOURCES) {
    const fact = facts[source.question_id]
    let state = sourceState(fact)
    const entry = group(source.file)
    entry.sources.push(source.question_id)
    if (state === 'used' && fact) {
      const made = draftsFrom(source.question_id, source.type, source.file, fact)
      if (made === null) state = 'invalid'
      else entry.drafts.push(...made)
      if (source.type === 'color') {
        const parsed = parseStructured('color', fact.value)
        roles = parsed?.type === 'color' ? parsed.colors : null
      }
    }
    sources.push({ question_id: source.question_id, state, version: fact?.version ?? null })
  }
  const semantic = semanticDrafts(facts, roles)
  group('color.tokens.json').sources.push(SEMANTIC_MAP_QUESTION)
  group('color.tokens.json').drafts.push(...semantic.drafts)
  sources.push({ question_id: SEMANTIC_MAP_QUESTION, state: semantic.report.state === 'no_roles' ? 'invalid' : semantic.report.state, version: facts[SEMANTIC_MAP_QUESTION]?.version ?? null })

  const report: TokenGenerateReport = {
    ok: true,
    dry_run: options.dryRun === true,
    files: [],
    tokens: [],
    sources,
    semantic: semantic.report,
    note: 'Generated tokens are drafts. Approve them with brand:tokens:approve and publish them with brand:tokens:publish before any agent or public build can read them.',
  }
  const docs = new Map<string, TokenNode>()
  for (const [file, { sources: fileSources, drafts }] of byFile) {
    const old = readGenerated(root, file)
    const doc: TokenNode = {
      $description: `DRAFT tokens generated from approved ${fileSources.join(', ')}. Not approved tokens until brand/tokens/approvals.yaml holds a matching hash.`,
    }
    const produced = new Set<string>()
    for (const draft of drafts) {
      const sourceFact = draft.fact.id
      produced.add(draft.id)
      const node: TokenNode = {
        $type: draft.type,
        $value: draft.value,
        $description: draft.description,
        $extensions: { 'brand.os': { status: 'draft', generated: true, source_fact: sourceFact, source_version: draft.fact.version } },
      }
      const prior = getPath(old, draft.id)
      const approval = approvals[draft.id]
      if (approval) {
        // Never overwrite an approved id. Keep the earlier generated node if there is one.
        const same = typeof approval.value_sha256 === 'string' && approval.value_sha256 === tokenDigest({ value: draft.value, hex: draft.type === 'color' ? (draft.value as { hex: string }).hex : undefined })
        if (same) {
          setPath(doc, draft.id, prior ?? node)
          report.tokens.push({ id: draft.id, outcome: 'unchanged', source_fact: sourceFact, reason: 'Already approved with this value.' })
        } else {
          if (prior) setPath(doc, draft.id, prior)
          report.tokens.push({ id: draft.id, outcome: 'refused_approved', source_fact: sourceFact, reason: 'This token id is already approved. It was not overwritten; change it through a reviewed token edit.' })
        }
        continue
      }
      const outcome: TokenOutcome = !prior ? 'created' : JSON.stringify(prior.$value) === JSON.stringify(node.$value) ? 'unchanged' : 'updated'
      setPath(doc, draft.id, node)
      report.tokens.push({ id: draft.id, outcome, source_fact: sourceFact, reason: 'Draft. Needs token approval and publication.' })
    }
    for (const id of leafIds(old)) {
      if (produced.has(id)) continue
      const prior = getPath(old, id)
      const sourceFact = prior?.$extensions?.['brand.os']?.source_fact ?? fileSources[0] ?? 'generated'
      if (approvals[id] && prior) {
        setPath(doc, id, prior)
        report.tokens.push({ id, outcome: 'refused_approved', source_fact: sourceFact, reason: 'The source answer no longer yields this id, but it is approved, so it was kept.' })
      } else {
        report.tokens.push({ id, outcome: 'removed', source_fact: sourceFact, reason: 'The approved answer no longer yields this draft token.' })
      }
    }
    docs.set(file, doc)
  }
  if (semantic.report.suggestions.length > 0 && roles) {
    report.note += ` Template color ids (${semantic.report.template_examples.slice(0, 4).join(', ')}${semantic.report.template_examples.length > 4 ? ' …' : ''}) stay template examples until the owner answers ${SEMANTIC_MAP_QUESTION}. A suggested mapping is printed; it was not applied.`
  }
  if (!report.dry_run) {
    const dir = path.join(root, GENERATED_TOKEN_DIR)
    for (const [file, doc] of docs) {
      const full = path.join(dir, file)
      const empty = leafIds(doc).length === 0
      if (empty) {
        if (fs.existsSync(full)) {
          fs.rmSync(full)
          report.files.push(path.join(GENERATED_TOKEN_DIR, file))
        }
        continue
      }
      const text = `${JSON.stringify(doc, null, 2)}\n`
      if (fs.existsSync(full) && fs.readFileSync(full, 'utf8') === text) continue
      fs.mkdirSync(dir, { recursive: true })
      writeAtomic(full, text)
      report.files.push(path.join(GENERATED_TOKEN_DIR, file))
    }
    const compiled = compileTokens(root)
    if (compiled.errors.length > 0) {
      report.ok = false
      report.note = `Generated tokens were written, but the token set has errors: ${compiled.errors.join('; ')}. Fix the answer (for example a contrast failure) before approving.`
    }
  }
  return report
}

// ---- approval and publication of tokens ------------------------------------------------------

export type TokenReviewOutcome = 'approved' | 'published' | 'unpublished' | 'unchanged' | 'refused' | 'unknown'

export interface TokenReviewResult {
  ok: boolean
  proof: 'accepted' | 'rejected'
  changed: number
  results: Array<{ id: string; outcome: TokenReviewOutcome; reason: string }>
  errors: string[]
}

/**
 * Hash-approve generated tokens. Records value_sha256 of the current compiled value. Base template
 * tokens (EXAMPLE) are refused: only values derived from approved answers can be approved here.
 */
export function approveTokens(root: string, ids: string[], proof: string | undefined, actor = 'owner'): TokenReviewResult {
  const result: TokenReviewResult = { ok: false, proof: 'rejected', changed: 0, results: [], errors: [] }
  if (!approvalProofMatches(root, proof)) return result
  result.proof = 'accepted'
  const compiled = compileTokens(root)
  if (compiled.errors.length > 0) {
    result.errors = compiled.errors
    result.results = ids.map((id) => ({ id, outcome: 'refused', reason: 'The token set has errors. Nothing was approved.' }))
    return result
  }
  const approvals = readTokenApprovals(root)
  const next = { ...approvals }
  for (const id of ids) {
    const token = compiled.flat[id]
    if (!token) {
      result.results.push({ id, outcome: 'unknown', reason: 'No such token.' })
      continue
    }
    if (token.source !== 'generated') {
      result.results.push({ id, outcome: 'refused', reason: 'Base token files are EXAMPLE values. Generate tokens from approved answers first (brand:tokens:generate).' })
      continue
    }
    const digest = tokenDigest(token)
    if (approvals[id]?.value_sha256 === digest) {
      result.results.push({ id, outcome: 'unchanged', reason: 'Already approved with this value.' })
      continue
    }
    if (approvals[id]) {
      result.results.push({ id, outcome: 'refused', reason: 'Already approved with a different value. Remove the old approval in a reviewed edit first.' })
      continue
    }
    next[id] = { approved_by: actor, approved_at: new Date().toISOString(), value_sha256: digest, source: token.sourceFact ?? 'generated' }
    result.results.push({ id, outcome: 'approved', reason: 'Value hash recorded. Not published.' })
    result.changed += 1
  }
  if (result.changed > 0) writeYaml(path.join(root, APPROVALS_PATH), { schema_version: 1, approved: next })
  result.ok = result.results.every((item) => item.outcome === 'approved' || item.outcome === 'unchanged')
  return result
}

/** Add hash-approved tokens to (or remove them from) approved_token_ids in the publication policy. */
export function publishTokens(root: string, ids: string[], proof: string | undefined, options: { unpublish?: boolean } = {}): TokenReviewResult {
  const result: TokenReviewResult = { ok: false, proof: 'rejected', changed: 0, results: [], errors: [] }
  if (!approvalProofMatches(root, proof)) return result
  result.proof = 'accepted'
  const policyFile = path.join(root, 'brand', 'publication-policy.yaml')
  const policy = (fs.existsSync(policyFile) ? (parse(fs.readFileSync(policyFile, 'utf8')) as Record<string, unknown> | null) : null) ?? {}
  const current = Array.isArray(policy.approved_token_ids) ? (policy.approved_token_ids as string[]) : []
  const next = [...current]
  const compiled = compileTokens(root)
  const approvals = readTokenApprovals(root)
  for (const id of ids) {
    if (options.unpublish) {
      if (!next.includes(id)) result.results.push({ id, outcome: 'unchanged', reason: 'Not published.' })
      else {
        next.splice(next.indexOf(id), 1)
        result.results.push({ id, outcome: 'unpublished', reason: 'Removed from approved_token_ids.' })
        result.changed += 1
      }
      continue
    }
    const token = compiled.flat[id]
    if (!token) {
      result.results.push({ id, outcome: 'unknown', reason: 'No such token.' })
      continue
    }
    if (approvals[id]?.value_sha256 !== tokenDigest(token)) {
      result.results.push({ id, outcome: 'refused', reason: 'Not hash-approved with its current value. Approve it first.' })
      continue
    }
    if (next.includes(id)) {
      result.results.push({ id, outcome: 'unchanged', reason: 'Already published.' })
      continue
    }
    next.push(id)
    result.results.push({ id, outcome: 'published', reason: 'Added to approved_token_ids.' })
    result.changed += 1
  }
  if (result.changed > 0) writeYaml(policyFile, { ...policy, approved_token_ids: next })
  result.ok = result.results.every((item) => item.outcome !== 'refused' && item.outcome !== 'unknown')
  return result
}
