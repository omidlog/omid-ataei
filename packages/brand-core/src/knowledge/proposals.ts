import type { InterviewEngine } from '../engine.js'
import { extractionCatalog, redactRestricted } from '../llm/extract.js'
import { detectLocale, extractByRules } from '../llm/rules.js'
import { applyProposalBatch, INTAKE_LIMITS, ModelOutputSchema, parseItems, readIntakeLog, type IntakeReport, type ProposalBatch } from '../proposal-intake.js'
import type { KnowledgeIssue } from './doctor.js'
import { KnowledgeError, type NoteSourceKind } from './model.js'
import { findNote, scanAll, type LoadedNote } from './store.js'
import { normalizeForSearch, tokenize } from './text.js'
import { withLock, type KnowledgeWorkspace } from './workspace.js'

/**
 * Note → draft proposal bridge. It reuses the interview's proposal intake (`parseItems`, `applyProposalBatch`)
 * unchanged: no second proposal engine. Everything it produces is a draft or a pending change proposal.
 * Approval stays `brand:approve` (a human with the proof); publication stays `brand:publish`.
 *
 * Provenance: `source.ref = knowledge:<id>@<sha256>`. The intake log already records the ref with the
 * resulting answer and change ids, so `noteProvenance` derives the idea → draft link from it, and a later
 * edit of the note marks those proposals stale. Nothing is refreshed or rewritten automatically.
 */

export const KNOWLEDGE_REF_PREFIX = 'knowledge:'
const OWNER_SOURCES: NoteSourceKind[] = ['owner_note', 'meeting', 'agent_capture']

export function knowledgeRef(id: string, revision: string): string {
  return `${KNOWLEDGE_REF_PREFIX}${id}@${revision}`
}

export function parseKnowledgeRef(ref: string): { id: string; revision: string } | null {
  const match = /^knowledge:(kn_[a-z0-9][a-z0-9-]{2,63})@([0-9a-f]{64})$/.exec(ref)
  return match ? { id: match[1]!, revision: match[2]! } : null
}

export interface Candidate {
  question_id: string
  label: string
  module: string
  reasons: string[]
  score: number
}

export interface RefusedLink {
  question_id: string
  reason: string
}

/**
 * Existing question ids that this note may inform: its own `question_ids` first, then ids whose words match
 * the note's tags and title. Only questions an extractor may write to (not restricted, applicable now). A
 * brand without a mascot module never gets mascot questions, because they are not applicable.
 */
export function candidateQuestions(engine: InterviewEngine, loaded: LoadedNote, limit = 10): { candidates: Candidate[]; refused: RefusedLink[] } {
  const catalog = new Map(extractionCatalog(engine).map((item) => [item.id, item]))
  const refused: RefusedLink[] = []
  const scored = new Map<string, Candidate>()
  const add = (id: string, reason: string, score: number) => {
    const entry = catalog.get(id)
    if (!entry) return
    const question = engine.question(id)!
    const current = scored.get(id) ?? { question_id: id, label: entry.label, module: question.module, reasons: [], score: 0 }
    if (!current.reasons.includes(reason)) current.reasons.push(reason)
    current.score += score
    scored.set(id, current)
  }
  for (const id of loaded.note.meta.question_ids) {
    const question = engine.question(id)
    if (!question) refused.push({ question_id: id, reason: 'not in the question bank' })
    else if (question.sensitivity === 'restricted') refused.push({ question_id: id, reason: 'restricted: the owner answers it in the interactive interview' })
    else if (engine.applicability(question)) refused.push({ question_id: id, reason: `not applicable: ${engine.applicability(question)}` })
    else add(id, 'linked in the note', 100)
  }
  const words = new Set([...loaded.note.meta.tags.flatMap((tag) => tokenize(normalizeForSearch(tag.replace(/[-_]/g, ' ')))), ...tokenize(normalizeForSearch(loaded.note.meta.title))].filter((word) => word.length >= 4))
  if (words.size > 0) {
    for (const [id, entry] of catalog) {
      const idWords = new Set(tokenize(normalizeForSearch(id.replace(/[._]/g, ' '))))
      const labelWords = new Set(tokenize(normalizeForSearch(entry.label)))
      for (const word of words) {
        if (idWords.has(word)) add(id, `tag or title word “${word}” matches the question id`, 10)
        else if (labelWords.has(word)) add(id, `tag or title word “${word}” matches the question label`, 6)
      }
    }
  }
  const candidates = [...scored.values()].sort((a, b) => b.score - a.score || a.question_id.localeCompare(b.question_id)).slice(0, limit)
  return { candidates, refused }
}

export interface ProposalPreview {
  ok: boolean
  dry_run: boolean
  note: { id: string; scope: string; revision: string; source_kind: NoteSourceKind; title: string }
  source_ref: string
  authority: 'owner_words' | 'third_party'
  candidates: Candidate[]
  refused_links: RefusedLink[]
  unmapped_idea: boolean
  mode: 'rules' | 'agent_items'
  report: IntakeReport | null
  /** Quotations that applying would write into tracked interview files. Shown so nothing leaks silently. */
  tracked_quotations: Array<{ question_id: string; quotation: string; files: string[] }>
  warnings: string[]
  /** The batch envelope an agent fills (proposals) and passes back with --file. */
  template: { schema_version: 1; source: ProposalBatch['source']; proposals: []; follow_ups: [] }
  next_steps: string[]
}

function batchSource(loaded: LoadedNote): { source: ProposalBatch['source']; authority: ProposalPreview['authority'] } {
  const owner = OWNER_SOURCES.includes(loaded.note.meta.source.kind)
  return {
    source: { kind: owner ? 'owner_note' : 'imported_text', ref: knowledgeRef(loaded.id, loaded.revision), ...(loaded.note.meta.language ? { language: loaded.note.meta.language } : {}) },
    authority: owner ? 'owner_words' : 'third_party',
  }
}

function sourceText(loaded: LoadedNote): { text: string; redactions: number } {
  if (loaded.note.body.length > INTAKE_LIMITS.maxSourceChars) {
    throw new KnowledgeError(
      'too_large',
      `The note body is ${loaded.note.body.length} characters; proposal intake accepts at most ${INTAKE_LIMITS.maxSourceChars}. Split the note (capture the relevant part as its own note) and propose from that.`,
    )
  }
  if (!loaded.note.body.trim()) throw new KnowledgeError('invalid_input', 'The note has no body to quote from.')
  // Sentences that look like restricted (financial or legal) data are withheld, as the interview does before a
  // model call. A quotation must be verbatim in this text, so withheld passages can never reach the ledger.
  return redactRestricted(loaded.note.body)
}

/**
 * Builds a preview, and with `apply` stores drafts. `items` are proposals an agent extracted (the model-output
 * shape: proposals, follow_ups, owner_questions); without them the deterministic rules run. Never a remote model.
 */
export function proposeFromNote(
  engine: InterviewEngine,
  ws: KnowledgeWorkspace,
  id: string,
  opts: { items?: unknown; apply?: boolean; expectedRevision?: string } = {},
): ProposalPreview {
  if (engine.config().brand.slug !== ws.brandSlug) throw new KnowledgeError('refused', 'The engine and the knowledge workspace belong to different brands.')
  const loaded = findNote(ws, id)
  if (loaded.note.meta.classification !== 'internal') throw new KnowledgeError('refused', 'Restricted notes never become proposals.')
  const { source, authority } = batchSource(loaded)
  const redacted = sourceText(loaded)
  const { candidates, refused } = candidateQuestions(engine, loaded)

  let mode: ProposalPreview['mode'] = 'rules'
  let batch: ProposalBatch
  let dropped: ReturnType<typeof parseItems>['dropped'] = []
  if (opts.items !== undefined) {
    const envelope = ModelOutputSchema.safeParse(opts.items)
    if (!envelope.success) throw new KnowledgeError('invalid_input', `The proposal items are not valid: ${envelope.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ')}. Expected {"proposals": [...], "follow_ups"?: [...], "owner_questions"?: [...]}.`)
    const parsed = parseItems(envelope.data.proposals)
    dropped = parsed.dropped
    mode = 'agent_items'
    batch = {
      schema_version: 1,
      source,
      source_text: redacted.text,
      proposals: parsed.items,
      indexes: parsed.indexes,
      follow_ups: (envelope.data.follow_ups ?? []).map((item) => ({ question_id: item.question_id ?? null, text: item.text })),
      owner_questions: envelope.data.owner_questions ?? [],
    }
  } else {
    const allowed = new Set(extractionCatalog(engine).map((item) => item.id))
    const output = extractByRules(redacted.text, { allowed, locale: detectLocale(redacted.text) })
    const parsed = parseItems(output.proposals)
    dropped = parsed.dropped
    batch = { schema_version: 1, source, source_text: redacted.text, proposals: parsed.items, indexes: parsed.indexes, follow_ups: output.follow_ups, owner_questions: output.owner_questions }
  }

  const warnings: string[] = []
  if (authority === 'third_party') warnings.push('This note is third-party material (research or imported text). It is not the owner’s word, so it can be previewed but not applied. Capture what the owner decides as an owner_note that cites it, and propose from that.')
  if (redacted.redactions > 0) warnings.push(`${redacted.redactions} passage(s) that look like restricted data were withheld from the source text and cannot be quoted.`)
  if (loaded.note.meta.status === 'archived') warnings.push('The note is archived.')
  const dryRunReport = applyProposalBatch(engine, batch, { origin: 'agent', dryRun: true, dropped, redactions: redacted.redactions })
  const writes = new Set(['drafted', 'unresolved', 'change_proposed', 'conflict'])
  const tracked = dryRunReport.results
    .filter((result) => writes.has(result.outcome) && result.question_id)
    .map((result) => {
      const item = batch.proposals[(batch.indexes ?? []).indexOf(result.index)] ?? batch.proposals.find((p) => p.question_id === result.question_id)
      const files = result.outcome === 'conflict' ? ['brand/interview/intake-log.yaml'] : ['brand/interview/answer-ledger.yaml', 'brand/interview/intake-log.yaml']
      return { question_id: result.question_id!, quotation: item?.quotation ?? '', files }
    })
  if (tracked.length > 0) {
    warnings.push(
      loaded.scope === 'local'
        ? 'This note is local and untracked, but applying copies each quotation below into brand/interview/answer-ledger.yaml (and conflicts into intake-log.yaml). Those files are tracked by Git: the quoted words leave the private folder when you commit them.'
        : 'Applying copies each quotation below into tracked interview files (answer-ledger.yaml, intake-log.yaml).',
    )
  }
  const unmapped = candidates.length === 0 && batch.proposals.length === 0
  const preview: ProposalPreview = {
    ok: true,
    dry_run: !opts.apply,
    note: { id: loaded.id, scope: loaded.scope, revision: loaded.revision, source_kind: loaded.note.meta.source.kind, title: loaded.note.meta.title },
    source_ref: source.ref,
    authority,
    candidates,
    refused_links: refused,
    unmapped_idea: unmapped,
    mode,
    report: dryRunReport,
    tracked_quotations: tracked,
    warnings,
    template: { schema_version: 1, source, proposals: [], follow_ups: [] },
    next_steps: unmapped
      ? ['No existing question fits this idea. Keep it as a note. If it needs a new structured field, ask the owner whether to add a question to the question bank; do not invent an id.']
      : opts.apply
        ? ['Drafts stored. The owner reviews with brand:review and approves with brand:approve (human proof). Nothing was approved or published.']
        : mode === 'rules'
          ? [
              'The deterministic rules ran on the note. For a better extraction, write {"proposals":[…]} with verbatim quotations from the note for the candidate ids and pass it with --file.',
              `Apply with --apply --expected-revision ${loaded.revision} after the owner agrees.`,
            ]
          : [`Apply with --apply --expected-revision ${loaded.revision} after the owner agrees.`],
  }
  if (!opts.apply) return preview
  if (authority === 'third_party') throw new KnowledgeError('refused', warnings[0]!)
  if (!opts.expectedRevision) throw new KnowledgeError('invalid_input', `Applying needs --expected-revision (the revision you previewed): ${loaded.revision}.`)
  preview.report = withLock(ws, loaded.id, () => {
    const current = findNote(ws, loaded.id, { strict: true })
    if (current.revision !== opts.expectedRevision) throw new KnowledgeError('stale_revision', `The note changed since the preview (current revision ${current.revision}). Nothing was stored. Preview again.`)
    return applyProposalBatch(engine, batch, { origin: 'agent', dryRun: false, dropped, redactions: redacted.redactions })
  })
  preview.dry_run = false
  return preview
}

export interface ProvenanceEntry {
  batch_id: string
  received_at: string
  revision: string
  stale: boolean
  results: Array<{ question_id: string | null; outcome: string; answer_id?: string; change_id?: string }>
}

/** Proposals that cite a note, from the intake log. `stale`: the note changed after the proposal was made. */
export function noteProvenance(engine: InterviewEngine, id: string, currentRevision: string | null): ProvenanceEntry[] {
  const out: ProvenanceEntry[] = []
  for (const batch of readIntakeLog(engine.workspaceRoot()).batches) {
    const ref = parseKnowledgeRef(batch.source?.ref ?? '')
    if (!ref || ref.id !== id) continue
    out.push({
      batch_id: batch.id,
      received_at: batch.received_at,
      revision: ref.revision,
      stale: currentRevision !== null && ref.revision !== currentRevision,
      results: batch.results.map((result) => ({ question_id: result.question_id, outcome: result.outcome, answer_id: result.answer_id, change_id: result.change_id })),
    })
  }
  return out
}

/** Doctor extension: proposals whose source note changed or disappeared. Ids only, no text. */
export function staleProposalIssues(engine: InterviewEngine, ws: KnowledgeWorkspace): KnowledgeIssue[] {
  const current = new Map(scanAll(ws).notes.map((note) => [note.id, note.revision]))
  const issues: KnowledgeIssue[] = []
  for (const batch of readIntakeLog(engine.workspaceRoot()).batches) {
    const ref = parseKnowledgeRef(batch.source?.ref ?? '')
    if (!ref) continue
    const now = current.get(ref.id)
    if (now === undefined) issues.push({ severity: 'info', code: 'proposal_source_missing', id: ref.id, message: `Intake ${batch.id} cites ${ref.id}, which is not a local or shared note here (restricted, moved or deleted).` })
    else if (now !== ref.revision) issues.push({ severity: 'warning', code: 'proposal_source_stale', id: ref.id, message: `Intake ${batch.id} quoted an earlier revision of ${ref.id}. Review those drafts; nothing was changed automatically.` })
  }
  return issues
}
