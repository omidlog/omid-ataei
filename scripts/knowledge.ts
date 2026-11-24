import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { readOwnerProof } from './proof.js'
import { stdin as input } from 'node:process'
import {
  AGENT_TOKEN_ENV,
  appendNote,
  approvalProofMatches,
  InterviewEngine,
  noteProvenance,
  proposeFromNote,
  staleProposalIssues,
  archiveNote,
  backlinks,
  captureNote,
  confirmVisibility,
  detectVisibility,
  editNote,
  findNote,
  knowledgeDoctor,
  KnowledgeError,
  listNotes,
  migrateNotes,
  noteHistory,
  openWorkspace,
  parseLinkArg,
  recoverNote,
  relatedNotes,
  restoreNote,
  scanScope,
  searchNotes,
  shareNote,
  similarNotes,
  summarize,
  unshareNote,
  type EditOp,
  type KnowledgeWorkspace,
  type NoteFilters,
  type NoteKind,
  type NoteSourceKind,
  type NoteStatus,
} from '@brand-os/brand-core'

/**
 * brand:knowledge — the owner's local Knowledge Inbox.
 *
 * Every write here is local: it changes files in this checkout and never commits, pushes or publishes. Notes
 * are unapproved ideas. Turning one into a brand fact goes through brand:knowledge propose (drafts only),
 * brand:review and brand:approve (a human step).
 */

const HELP = `brand:knowledge <command> [options]

  capture   --title <t> [--text <t> | --file <path|->] [--lang fa] [--tags a,b] [--kind idea] [--question-ids id,…]
            [--link kn_…[:supports]] [--source-kind owner_note|meeting|agent_capture|research|imported_text] [--source-ref <ref>]
            [--classification restricted]
  list      [--status inbox,triaged] [--kind idea] [--tag a,b] [--lang fa] [--since 2026-11-01] [--until …]
            [--scope local|shared|all|restricted] [--question <id>] [--include-archived] [--limit 20] [--offset 0]
  show      --id kn_… [--scope restricted]
  search    --query "<words>" [filters as for list] [--with-facts]
  similar   --id kn_…            possible duplicates (suggestions only)
  backlinks --id kn_…            links in and out, linked question ids
  related   --id kn_…            links plus notes sharing question ids or tags
  edit      --id kn_… --expected-revision <sha256> and one of:
              --text <t> | --file <path|->        replace the body
              --replace <old> --with <new>        replace one exact, unique passage
              --insert-after <anchor> --text <t>  (or --insert-before)
            and/or --title --kind --status --lang --tags --add-tag --remove-tag --question-ids --link --source-ref
  append    --id kn_… (--text <t> | --file <path|->) [--idempotency-key <k>] [--expected-revision <sha256>]
  archive   --id kn_… [--expected-revision <sha256>]      reversible
  restore   --id kn_… [--expected-revision <sha256>]
  history   --id kn_…            saved snapshots (local recovery)
  recover   --id kn_… --revision <sha256-prefix> --expected-revision <current sha256>
  share     --id kn_… --dry-run   then: --expected-revision <sha256> [--confirm-private owner/repo]
  unshare   --id kn_… --expected-revision <sha256>
  propose   --id kn_… [--file items.json] [--apply --expected-revision <sha256>]   drafts only, never approval
  provenance --id kn_…           proposals that cite this note, and whether they are stale
  doctor    diagnostics without note text
  migrate   [--apply]            fill missing metadata (idempotent)

Add --json for machine-readable output. Restricted notes (--scope restricted, --classification restricted) need
BRAND_OS_DATA_KEY and the owner's approval proof (BRAND_OS_APPROVAL_PROOF or a hidden prompt) and are refused
while ${AGENT_TOKEN_ENV} is set.`

const [command, ...rest] = process.argv.slice(2)
const root = process.cwd()

const OPTIONS = {
  json: { type: 'boolean', default: false },
  id: { type: 'string' },
  title: { type: 'string' },
  text: { type: 'string' },
  file: { type: 'string' },
  lang: { type: 'string' },
  tags: { type: 'string' },
  tag: { type: 'string' },
  'add-tag': { type: 'string', multiple: true },
  'remove-tag': { type: 'string', multiple: true },
  kind: { type: 'string' },
  status: { type: 'string' },
  'question-ids': { type: 'string' },
  question: { type: 'string' },
  link: { type: 'string', multiple: true },
  'source-kind': { type: 'string' },
  'source-ref': { type: 'string' },
  classification: { type: 'string' },
  scope: { type: 'string' },
  since: { type: 'string' },
  until: { type: 'string' },
  'include-archived': { type: 'boolean', default: false },
  limit: { type: 'string' },
  offset: { type: 'string' },
  query: { type: 'string' },
  'with-facts': { type: 'boolean', default: false },
  'expected-revision': { type: 'string' },
  replace: { type: 'string' },
  with: { type: 'string' },
  'insert-after': { type: 'string' },
  'insert-before': { type: 'string' },
  'idempotency-key': { type: 'string' },
  revision: { type: 'string' },
  'dry-run': { type: 'boolean', default: false },
  'confirm-private': { type: 'string' },
  apply: { type: 'boolean', default: false },
} as const

type Values = ReturnType<typeof parseArgs<{ args: string[]; options: typeof OPTIONS; allowPositionals: false; strict: true }>>['values']

function usage(message: string): never {
  console.error(`${message}\n\n${HELP}`)
  process.exit(2)
}

function list(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function need(values: Values, key: 'id' | 'query' | 'expected-revision' | 'revision'): string {
  const value = values[key]
  if (!value) usage(`--${key} is required.`)
  return value
}

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of input) chunks.push(Buffer.from(chunk as Buffer))
  return Buffer.concat(chunks).toString('utf8')
}

async function content(values: Values, opts: { required: boolean }): Promise<string | undefined> {
  if (values.text !== undefined && values.file !== undefined) usage('Use --text or --file, not both.')
  if (values.text !== undefined) return values.text
  if (values.file === '-') return readAllStdin()
  if (values.file !== undefined) {
    const file = path.resolve(values.file)
    const stat = fs.statSync(file, { throwIfNoEntry: false })
    if (!stat?.isFile()) throw new KnowledgeError('invalid_input', 'The --file path is not a readable file.')
    if (stat.size > 1024 * 1024) throw new KnowledgeError('too_large', 'The --file is larger than 1 MiB.')
    return fs.readFileSync(file, 'utf8')
  }
  if (opts.required) usage('Give the text with --text, --file <path>, or --file - (stdin).')
  return undefined
}

function filtersFrom(values: Values): NoteFilters {
  const scope = values.scope
  if (scope !== undefined && !['local', 'shared', 'all', 'restricted'].includes(scope)) usage('--scope must be local, shared, all or restricted.')
  return {
    status: list(values.status) as NoteStatus[] | undefined,
    kind: list(values.kind) as NoteKind[] | undefined,
    tags: list(values.tag ?? values.tags),
    language: values.lang,
    since: values.since,
    until: values.until,
    scope: scope === 'restricted' ? undefined : (scope as NoteFilters['scope']),
    question_id: values.question,
    include_archived: values['include-archived'],
  }
}

function paging(values: Values): { limit?: number; offset?: number } {
  return { limit: values.limit ? Number(values.limit) : undefined, offset: values.offset ? Number(values.offset) : undefined }
}

/** Restricted notes: data key plus the owner's approval proof, never under an agent token, never from argv. */
async function requireOwnerForRestricted(): Promise<void> {
  if (process.env[AGENT_TOKEN_ENV]) {
    throw new KnowledgeError('refused', `Restricted notes are owner-only. Refusing while ${AGENT_TOKEN_ENV} is set.`)
  }
  // Shared resolver without the piped-stdin step: stdin carries note text here (--file -).
  const proof = await readOwnerProof({ prompt: 'Approval proof for restricted notes (input hidden): ', stdin: false })
  if (!approvalProofMatches(root, proof)) {
    throw new KnowledgeError('refused', 'Restricted notes need the owner approval proof (BRAND_OS_APPROVAL_PROOF or the hidden prompt). Nothing was read or written.')
  }
}


function print(values: Values, data: unknown, text: () => string): void {
  console.log(values.json ? JSON.stringify(data, null, 2) : text())
}

function line(item: { id: string; status: string; kind: string; scope: string; title: string; tags: string[] }): string {
  return `${item.id}  ${item.status.padEnd(8)} ${item.kind.padEnd(14)} ${item.scope.padEnd(10)} ${item.title}${item.tags.length ? `  [${item.tags.join(', ')}]` : ''}`
}

function setOp(values: Values): EditOp | null {
  const op: Extract<EditOp, { op: 'set' }> = { op: 'set' }
  if (values.title !== undefined) op.title = values.title
  if (values.kind !== undefined) op.kind = values.kind as NoteKind
  if (values.status !== undefined) op.status = values.status as Exclude<NoteStatus, 'archived'>
  if (values.lang !== undefined) op.language = values.lang || null
  if (values.tags !== undefined) op.tags = list(values.tags) ?? []
  if (values['add-tag']) op.add_tags = values['add-tag']
  if (values['remove-tag']) op.remove_tags = values['remove-tag']
  if (values['question-ids'] !== undefined) op.question_ids = list(values['question-ids']) ?? []
  if (values.link) op.add_links = values.link.map(parseLinkArg)
  if (values['source-ref'] !== undefined) op.source_ref = values['source-ref'] || null
  return Object.keys(op).length > 1 ? op : null
}

async function run(ws: KnowledgeWorkspace, values: Values): Promise<void> {
  const restricted = values.scope === 'restricted'
  if (restricted || values.classification === 'restricted') await requireOwnerForRestricted()
  switch (command) {
    case 'capture': {
      const body = (await content(values, { required: !values.title })) ?? ''
      const result = captureNote(ws, {
        title: values.title,
        body,
        kind: values.kind as NoteKind | undefined,
        language: values.lang,
        tags: list(values.tags),
        links: values.link?.map(parseLinkArg),
        question_ids: list(values['question-ids']),
        source: { kind: values['source-kind'] as NoteSourceKind | undefined, ref: values['source-ref'] },
        classification: values.classification === 'restricted' ? 'restricted' : values.classification === undefined ? undefined : (values.classification as 'internal'),
        status: values.status as 'inbox' | undefined,
      })
      const duplicates = result.scope === 'restricted' ? [] : similarNotes(ws, result.id)
      print(values, { ok: true, ...result, possible_duplicates: duplicates, approval_state: 'unapproved_idea' }, () =>
        [
          `Captured ${result.id} (${result.scope}) at ${result.path}`,
          `Revision ${result.revision}`,
          ...duplicates.map((item) => `Possible duplicate: ${item.id}  ${item.title} (${Math.round(item.similarity * 100)}%)`),
          result.scope === 'local' ? 'Local and untracked. Nothing is in Git. Share it later with: brand:knowledge share --id … --dry-run' : 'Encrypted. Never shared, searched or sent to an agent.',
          'This is an unapproved idea, not a brand fact.',
        ].join('\n'),
      )
      return
    }
    case 'list': {
      if (restricted) {
        const scan = scanScope(ws, 'restricted', { decrypt: true })
        const items = scan.notes.map(summarize)
        print(values, { ok: true, scope: 'restricted', items, problems: scan.problems.length }, () => (items.length ? items.map(line).join('\n') : 'No restricted notes.'))
        return
      }
      const result = listNotes(ws, filtersFrom(values), paging(values))
      print(values, { ok: true, ...result }, () =>
        [
          ...(result.items.length ? result.items.map(line) : ['No notes match.']),
          ...(result.next_offset !== null ? [`… ${result.total - result.next_offset} more (--offset ${result.next_offset})`] : []),
          ...(result.problems ? [`${result.problems} file(s) could not be read. Run brand:knowledge doctor.`] : []),
        ].join('\n'),
      )
      return
    }
    case 'show': {
      const loaded = findNote(ws, need(values, 'id'), { includeRestricted: restricted })
      const links = loaded.scope === 'restricted' ? null : backlinks(ws, loaded.id)
      const extras = loaded.scope === 'restricted' ? {} : { provenance: noteProvenance(new InterviewEngine(root), loaded.id, loaded.revision) }
      const data = { ok: true, ...summarize(loaded), meta: loaded.note.meta, body: loaded.note.body, issues: loaded.note.issues, links, ...extras }
      print(values, data, () =>
        [
          `# ${loaded.note.meta.title}`,
          `${loaded.id} · ${loaded.scope} · ${loaded.note.meta.status} · ${loaded.note.meta.kind}${loaded.note.meta.language ? ` · ${loaded.note.meta.language}` : ''}`,
          `UNVERIFIED IDEA · NOT AN APPROVED BRAND FACT`,
          `Revision ${loaded.revision}`,
          loaded.note.meta.tags.length ? `Tags: ${loaded.note.meta.tags.join(', ')}` : '',
          loaded.note.meta.question_ids.length ? `Questions: ${loaded.note.meta.question_ids.join(', ')}` : '',
          links && (links.inbound.length || links.outbound.length) ? `Links: ${links.outbound.length} out, ${links.inbound.length} in` : '',
          '',
          loaded.note.body,
        ]
          .filter((item, index) => item !== '' || index === 8)
          .join('\n'),
      )
      return
    }
    case 'search': {
      const query = values.query ?? ''
      if (restricted) throw new KnowledgeError('refused', 'Restricted notes are never searched or snippeted.')
      const result = searchNotes(ws, query, filtersFrom(values), paging(values))
      const facts = values['with-facts'] ? await approvedFacts(query) : undefined
      print(values, { ok: true, ...result, ...(facts ? { approved_facts: facts } : {}) }, () =>
        [
          ...(result.items.length
            ? result.items.flatMap((hit) => [`${line(hit)}  (score ${hit.score})`, ...(hit.snippet ? [`    “${hit.snippet}”`] : [])])
            : ['No notes match.']),
          ...(facts ? ['', `Approved facts (${facts.status}):`, ...facts.items.map((item) => `  ${item.id}: ${JSON.stringify(item.value)}`)] : []),
          '',
          result.notice,
        ].join('\n'),
      )
      return
    }
    case 'similar': {
      const items = similarNotes(ws, need(values, 'id'))
      print(values, { ok: true, items, notice: 'Suggestions only. Nothing is merged.' }, () => (items.length ? items.map((item) => `${item.id}  ${Math.round(item.similarity * 100)}%  ${item.title}`).join('\n') : 'No likely duplicates.'))
      return
    }
    case 'backlinks':
    case 'related': {
      const id = need(values, 'id')
      const result = command === 'related' ? relatedNotes(ws, id) : backlinks(ws, id)
      const view = (link: { id: string; relationship: string; title: string | null; exists: boolean }) => `  ${link.relationship.padEnd(11)} ${link.id}${link.exists ? `  ${link.title ?? '(not visible)'}` : '  (missing)'}`
      print(values, { ok: true, ...result }, () =>
        [
          `Outbound (${result.outbound.length}):`,
          ...result.outbound.map(view),
          `Inbound (${result.inbound.length}):`,
          ...result.inbound.map(view),
          `Questions: ${result.question_ids.join(', ') || 'none'}`,
          ...('related' in result ? ['Related:', ...(result as ReturnType<typeof relatedNotes>).related.map((item) => `  ${item.id}  ${item.title}`)] : []),
        ].join('\n'),
      )
      return
    }
    case 'edit': {
      const id = need(values, 'id')
      const ops: EditOp[] = []
      const meta = setOp(values)
      if (meta) ops.push(meta)
      if (values['insert-after'] !== undefined || values['insert-before'] !== undefined) {
        const text = await content(values, { required: true })
        if (values['insert-after'] !== undefined) ops.push({ op: 'insert_after', anchor: values['insert-after'], text: text! })
        else ops.push({ op: 'insert_before', anchor: values['insert-before']!, text: text! })
      } else if (values.replace !== undefined) {
        if (values.with === undefined) usage('--replace needs --with.')
        ops.push({ op: 'replace', find: values.replace, replace: values.with })
      } else {
        const body = await content(values, { required: false })
        if (body !== undefined) ops.push({ op: 'replace_body', body })
      }
      if (ops.length === 0) usage('Nothing to change.')
      const result = editNote(ws, id, { expectedRevision: need(values, 'expected-revision'), ops, includeRestricted: restricted })
      print(values, { ok: true, ...result }, () => (result.changed ? `Updated ${id}. Revision ${result.revision} (was ${result.previous_revision}).` : `No change to ${id}.`))
      return
    }
    case 'append': {
      const result = appendNote(ws, need(values, 'id'), { text: (await content(values, { required: true }))!, idempotencyKey: values['idempotency-key'], expectedRevision: values['expected-revision'], includeRestricted: restricted })
      print(values, { ok: true, ...result }, () => (result.duplicate ? `Already appended with this idempotency key. Nothing changed. Revision ${result.revision}.` : `Appended. Revision ${result.revision}.`))
      return
    }
    case 'archive':
    case 'restore': {
      const id = need(values, 'id')
      const fn = command === 'archive' ? archiveNote : restoreNote
      const result = fn(ws, id, { expectedRevision: values['expected-revision'], includeRestricted: restricted })
      const provenance = restricted ? [] : noteProvenance(new InterviewEngine(root), id, null)
      const extras = command === 'archive' && provenance.length ? { stale_proposals: provenance } : {}
      print(values, { ok: true, ...result, ...extras }, () =>
        [
          result.changed ? `${command === 'archive' ? 'Archived' : 'Restored'} ${id}. Revision ${result.revision}.` : `${id} was already ${command === 'archive' ? 'archived' : 'not archived'}.`,
          command === 'archive' ? 'Reversible with brand:knowledge restore. Approved facts that cite this note are not changed.' : '',
          ...((extras as { stale_proposals?: Array<{ batch_id: string }> }).stale_proposals ?? []).map((item) => `Review: proposals from intake ${item.batch_id} cite this note.`),
        ]
          .filter(Boolean)
          .join('\n'),
      )
      return
    }
    case 'history': {
      const id = need(values, 'id')
      findNote(ws, id, { includeRestricted: restricted })
      const items = noteHistory(ws, id)
      print(values, { ok: true, id, items: items.map(({ revision, saved_at }) => ({ revision, saved_at })) }, () => (items.length ? items.map((item) => `${item.saved_at}  ${item.revision}`).join('\n') : 'No snapshots yet.'))
      return
    }
    case 'recover': {
      const result = recoverNote(ws, need(values, 'id'), { revision: need(values, 'revision'), expectedRevision: need(values, 'expected-revision'), includeRestricted: restricted })
      print(values, { ok: true, ...result }, () => `Recovered. Revision ${result.revision}. The replaced text was saved as a snapshot.`)
      return
    }
    case 'share': {
      const id = need(values, 'id')
      const visibility = confirmVisibility(detectVisibility(root), values['confirm-private'])
      const result = shareNote(ws, id, { visibility, dryRun: values['dry-run'], expectedRevision: values['expected-revision'] })
      print(values, result, () =>
        [
          `${result.dry_run ? 'Dry run: ' : ''}${result.from} → ${result.to}`,
          `Repository: ${result.visibility.state} (${result.visibility.detail})`,
          ...(result.blocked.length ? ['Refused:', ...result.blocked.map((item) => `  - ${item}`)] : []),
          ...(result.ok && result.dry_run ? ['--- content that would become tracked ---', result.content, '--- end ---'] : []),
          ...result.warnings.map((item) => `Note: ${item}`),
          ...result.next_steps.map((item) => `→ ${item}`),
        ].join('\n'),
      )
      if (!result.ok) process.exit(1)
      return
    }
    case 'unshare': {
      const result = unshareNote(ws, need(values, 'id'), { expectedRevision: need(values, 'expected-revision') })
      print(values, { ok: true, ...result }, () => `${result.path}\n${result.warning}`)
      return
    }
    case 'doctor': {
      const engine = new InterviewEngine(root)
      const report = knowledgeDoctor(ws, () => staleProposalIssues(engine, ws))
      print(values, report, () =>
        [
          `Knowledge (${report.brand_slug}): ${report.notes.local} local, ${report.notes.shared} shared, ${report.notes.restricted} restricted${report.notes.restricted_locked ? ' (not checked: no key)' : ''}`,
          ...report.issues.map((issue) => `${issue.severity.toUpperCase().padEnd(7)} ${issue.code}${issue.path ? ` ${issue.path}` : ''}${issue.id && !issue.path ? ` ${issue.id}` : ''}: ${issue.message}`),
          report.ok ? 'OK' : 'Problems found.',
        ].join('\n'),
      )
      if (!report.ok) process.exit(1)
      return
    }
    case 'propose': {
      if (restricted) throw new KnowledgeError('refused', 'Restricted notes never become proposals.')
      if (values.apply && process.env[AGENT_TOKEN_ENV]) throw new KnowledgeError('refused', `Storing drafts from a note is a local owner action. Refusing while ${AGENT_TOKEN_ENV} is set.`)
      let items: unknown
      const raw = await content(values, { required: false })
      if (raw !== undefined) {
        try {
          items = JSON.parse(raw)
        } catch {
          throw new KnowledgeError('invalid_input', 'The proposal items file is not valid JSON. Nothing was stored.')
        }
      }
      const result = proposeFromNote(new InterviewEngine(root), ws, need(values, 'id'), { items, apply: values.apply, expectedRevision: values['expected-revision'] })
      print(values, result, () =>
        [
          `${result.dry_run ? 'Preview (dry run, nothing stored)' : `Stored as drafts (intake ${result.report?.batch_id})`} for ${result.note.id} @ ${result.note.revision.slice(0, 12)}`,
          `Source: ${result.source_ref} (${result.authority === 'owner_words' ? 'owner’s words' : 'third-party, not owner authority'})`,
          `Candidate questions: ${result.candidates.map((item) => item.question_id).join(', ') || 'none'}`,
          ...result.refused_links.map((item) => `Refused link ${item.question_id}: ${item.reason}`),
          ...(result.report ? result.report.results.map((item) => `  ${item.outcome.padEnd(15)} ${item.question_id ?? `#${item.index}`}${item.state ? ` [${item.state}]` : ''}  ${item.reason}`) : []),
          ...(result.report?.conflicts ?? []).map((item) => `  Ask: ${item.ask}`),
          ...result.tracked_quotations.map((item) => `  Would copy into ${item.files.join(' + ')}: ${item.question_id} “${item.quotation}”`),
          ...result.warnings.map((item) => `Warning: ${item}`),
          ...result.next_steps.map((item) => `→ ${item}`),
          'Nothing was approved or published.',
        ].join('\n'),
      )
      return
    }
    case 'provenance': {
      const id = need(values, 'id')
      let revision: string | null = null
      try {
        revision = findNote(ws, id).revision
      } catch (error) {
        if (!(error instanceof KnowledgeError) || error.code !== 'not_found') throw error
      }
      const items = noteProvenance(new InterviewEngine(root), id, revision)
      print(values, { ok: true, id, current_revision: revision, items }, () =>
        items.length
          ? items.map((item) => `${item.batch_id}  ${item.received_at}  ${item.stale ? 'STALE (note edited since)' : 'current'}  ${item.results.map((r) => `${r.question_id}:${r.outcome}`).join(', ')}`).join('\n')
          : 'No proposals cite this note.',
      )
      return
    }
    case 'migrate': {
      const result = migrateNotes(ws, { apply: values.apply })
      print(values, { ok: true, ...result }, () =>
        [`${result.apply ? 'Migrated' : 'Would migrate'} ${result.changed.length} note(s); ${result.unchanged} already current.`, ...result.changed.map((file) => `  ${file}`), result.apply ? '' : 'Re-run with --apply to write.'].filter(Boolean).join('\n'),
      )
      return
    }
    default: {
      usage(command ? `Unknown command ${command}.` : 'No command given.')
    }
  }
}

/** Approved facts through the same reader as brand:query: the agent token from the environment, or a guest. */
async function approvedFacts(query: string): Promise<{ status: string; items: Array<{ id: string; value: unknown }> }> {
  const core = await import('@brand-os/brand-core')
  const engine = new core.InterviewEngine(root)
  const ctx = core.resolveAgentContext(root, engine.config().brand.slug, process.env[core.AGENT_TOKEN_ENV])
  const result = core.searchBrandDocs(engine, query, ctx)
  const hits = (result.data as { hits?: Array<{ id: string; value: unknown; status: string }> } | null)?.hits ?? []
  const items = hits.map((item) => ({ id: item.id, value: item.value, approval_state: item.status, source_type: 'approved_fact' }))
  return { status: result.status, items }
}

if (!command || command === 'help' || command === '--help') {
  console.log(HELP)
  process.exit(command ? 0 : 2)
}

let values: Values
try {
  values = parseArgs({ args: rest, options: OPTIONS, allowPositionals: false, strict: true }).values
} catch (error) {
  usage((error as Error).message)
}

try {
  await run(openWorkspace(root), values)
} catch (error) {
  if (error instanceof KnowledgeError) {
    if (values.json) console.log(JSON.stringify({ ok: false, error: { code: error.code, message: error.message } }, null, 2))
    else console.error(`${error.code}: ${error.message}`)
    process.exit(1)
  }
  // Unexpected errors: no stack, no file content.
  console.error(`Unexpected error (${(error as Error)?.name ?? 'Error'}). Nothing was shared or published. Run brand:knowledge doctor.`)
  process.exit(1)
}
