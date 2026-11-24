import fs from 'node:fs'
import path from 'node:path'
import { stdin as input, stdout as output } from 'node:process'
import readline from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { AGENT_TOKEN_ENV, KnowledgeError, openWorkspace, type KnowledgeWorkspace } from '@brand-os/brand-core'
import {
  approveRevision,
  evaluate,
  listRecords,
  proposalFromSeoDraft,
  proposeRevision,
  readRecord,
  readRevision,
  rejectRevision,
  reviewRevision,
  StrategyError,
  summarize,
  validateRevisionNumber,
  withdrawRevision,
  type ReviewReport,
  type StrategySummary,
} from '@brand-os/brand-core/strategy'

/**
 * brand:strategy — owner-approved strategy revisions (Spec Sprint 3).
 *
 * Records live in brand/.private/strategy/records (gitignored). Proposing stores a draft; nothing is visible to an
 * agent until the owner reviews the diff and approves the exact hash with the approval proof. Approving a strategy
 * authorizes no ad, spend, publication or website change. Agents read approved revisions through brand:query and the
 * stdio MCP (strategy-seo-read, strategy-ads-read profiles), never through this command.
 */

const HELP = `brand:strategy <command> [options]

  propose --id <strategy-id> --file <proposal.json>    store a new draft revision (facts and research notes pinned)
  propose --id <strategy-id> --from-seo <draft.json> [--out <proposal.json>]
                                                       turn a brand:seo plan draft into a proposal file to edit;
                                                       with --store it is stored as a draft right away
  list                                                 every strategy with stored and effective status
  show --id <id> [--revision <n>]                      one revision (default: the approved one, else the latest)
  review --id <id> --revision <n>                      field diff against the revision it supersedes, sources,
                                                       blockers and the exact approve command
  approve --id <id> --revision <n> --expect-sha <sha256>
                                                       owner proof: BRAND_OS_APPROVAL_PROOF or hidden prompt
  reject --id <id> --revision <n>                      decline a draft (kept for audit, never served)
  withdraw --id <id> --revision <n> --reason <text>    owner proof; no older revision is restored

Add --json for machine-readable output. Refused while ${AGENT_TOKEN_ENV} is set.`

const [command, ...rest] = process.argv.slice(2)
const root = process.cwd()

const OPTIONS = {
  json: { type: 'boolean', default: false },
  id: { type: 'string' },
  file: { type: 'string' },
  'from-seo': { type: 'string' },
  out: { type: 'string' },
  store: { type: 'boolean', default: false },
  revision: { type: 'string' },
  'expect-sha': { type: 'string' },
  reason: { type: 'string' },
} as const

type Values = ReturnType<typeof parseArgs<{ args: string[]; options: typeof OPTIONS; allowPositionals: false; strict: true }>>['values']

function usage(message: string): never {
  console.error(`${message}\n\n${HELP}`)
  process.exit(2)
}

function need(values: Values, key: 'id' | 'revision' | 'expect-sha' | 'reason'): string {
  const value = values[key]
  if (!value) usage(`--${key} is required.`)
  return value
}

function print(values: Values, data: unknown, text: () => string): void {
  console.log(values.json ? JSON.stringify(data, null, 2) : text())
}

function readJsonFile(file: string, label: string): unknown {
  const full = path.resolve(file)
  const stat = fs.lstatSync(full, { throwIfNoEntry: false })
  if (!stat?.isFile()) throw new StrategyError('invalid_input', `The ${label} path is not a readable regular file.`)
  if (stat.size > 1024 * 1024) throw new StrategyError('invalid_input', `The ${label} file is larger than 1 MiB.`)
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'))
  } catch {
    throw new StrategyError('invalid_input', `The ${label} file is not valid JSON.`)
  }
}

async function ownerProof(): Promise<string | undefined> {
  const fromEnv = process.env.BRAND_OS_APPROVAL_PROOF?.trim()
  if (fromEnv) return fromEnv
  if (!input.isTTY) return undefined
  const { Writable } = await import('node:stream')
  let muted = false
  const sink = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) output.write(chunk, encoding)
      callback()
    },
  })
  const rl = readline.createInterface({ input, output: sink, terminal: true })
  try {
    const pending = rl.question('Owner approval proof (input hidden): ')
    muted = true
    const answer = await pending
    output.write('\n')
    return answer.trim() || undefined
  } finally {
    rl.close()
  }
}

function show(value: unknown): string {
  const out = typeof value === 'string' ? value : JSON.stringify(value)
  return out.length > 160 ? `${out.slice(0, 159)}…` : out
}

function reviewText(report: ReviewReport): string {
  const lines = [
    `Review ${report.strategy_id} revision ${report.revision} (${report.state})`,
    `  content sha256 ${report.content_sha256}`,
    `  ${report.base ? `diff against approved revision ${report.base.revision}` : 'first revision: every field is new'}`,
    `  valid ${report.dates.valid_from.slice(0, 10)} to ${report.dates.valid_until.slice(0, 10)}, review due ${report.dates.review_due_at.slice(0, 10)}`,
    `  agent kinds: ${report.impact.agent_kinds.join(', ') || 'none'}; ${report.impact.recommendations} recommendation(s); restricted (never sent): ${report.impact.restricted_fields.join(', ') || 'none'}`,
    '',
    'Changes:',
    ...report.diff.map((item) => `  ${item.change === 'added' ? '+' : item.change === 'removed' ? '-' : '~'} ${item.path}: ${item.change === 'changed' ? `${show(item.before)} -> ${show(item.after)}` : show(item.change === 'added' ? item.after : item.before)}`),
    '',
    'Sources:',
    ...report.refs.facts.map((ref) => `  fact ${ref.id} @ ${ref.revision} [${ref.state}]`),
    ...report.refs.evidence.map((ref) => `  ${ref.ref} [${ref.state}]`),
  ]
  if (report.blockers.length) lines.push('', 'Cannot be approved:', ...report.blockers.map((item) => `  ! ${item}`))
  else lines.push('', `Approve with: ${report.approve_with}`)
  lines.push(...report.notice.map((item) => `  note: ${item}`))
  return lines.join('\n')
}

function summaryText(items: StrategySummary[]): string {
  if (!items.length) return 'No strategies yet. Propose one with brand:strategy propose.'
  return items
    .map((item) =>
      [
        `${item.strategy_id} (${item.type})  ${item.title ?? ''}`,
        `  approved revision: ${item.current ?? 'none'}`,
        ...item.revisions.map((rev) => `  r${rev.revision}  ${rev.state.padEnd(10)} effective ${rev.effective.padEnd(16)} ${rev.content_sha256.slice(0, 12)}${rev.reasons.length ? `  ${rev.reasons.join(' ')}` : ''}`),
      ].join('\n'),
    )
    .join('\n\n')
}

async function run(ws: KnowledgeWorkspace, values: Values): Promise<void> {
  switch (command) {
    case 'propose': {
      const id = need(values, 'id')
      if (values.file && values['from-seo']) usage('Use --file or --from-seo, not both.')
      if (values['from-seo']) {
        const imported = proposalFromSeoDraft(ws, readJsonFile(values['from-seo'], '--from-seo'))
        if (values.out) {
          const out = path.resolve(values.out)
          if (fs.existsSync(out)) throw new StrategyError('exists', 'The --out file exists. Choose a new path; nothing was overwritten.')
          fs.writeFileSync(out, `${JSON.stringify(imported.proposal, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
        }
        if (!values.store) {
          print(values, { ok: true, stored: false, proposal: imported.proposal, critic: imported.critic.verdict, notes: imported.notes }, () =>
            [values.out ? `Proposal written to ${values.out}. Edit it, then: brand:strategy propose --id ${id} --file ${values.out}` : JSON.stringify(imported.proposal, null, 2), ...imported.notes.map((item) => `note: ${item}`)].join('\n'),
          )
          return
        }
        const result = proposeRevision(ws, { strategy_id: id, proposal: imported.proposal })
        print(values, { ok: true, stored: true, strategy_id: id, revision: result.revision.revision, content_sha256: result.revision.content_sha256, path: result.path, notes: imported.notes }, () => `Stored draft ${id} revision ${result.revision.revision} (${result.path}). Review it: brand:strategy review --id ${id} --revision ${result.revision.revision}`)
        return
      }
      if (!values.file) usage('--file or --from-seo is required.')
      const result = proposeRevision(ws, { strategy_id: id, proposal: readJsonFile(values.file, '--file') })
      print(values, { ok: true, strategy_id: id, revision: result.revision.revision, supersedes_revision: result.revision.supersedes_revision, content_sha256: result.revision.content_sha256, path: result.path }, () =>
        `Stored draft ${id} revision ${result.revision.revision}${result.revision.supersedes_revision ? ` (would supersede ${result.revision.supersedes_revision})` : ''}. Agents cannot see it. Review: brand:strategy review --id ${id} --revision ${result.revision.revision}`,
      )
      return
    }
    case 'list': {
      const items = listRecords(ws).map((record) => summarize(ws, record))
      print(values, { ok: true, strategies: items }, () => summaryText(items))
      return
    }
    case 'show': {
      const record = readRecord(ws, need(values, 'id'))
      const approved = record.revisions.find((item) => item.state === 'approved')
      const number = values.revision ? validateRevisionNumber(values.revision) : (approved?.revision ?? Math.max(...record.revisions.map((item) => item.revision)))
      const revision = readRevision(ws, record.strategy_id, number)
      const entry = record.revisions.find((item) => item.revision === number)!
      const result = evaluate(ws, record, entry, ws.now())
      print(values, { ok: true, state: entry.state, effective: result.status, reasons: result.reasons, revision }, () =>
        [`${record.strategy_id} revision ${number}: ${entry.state}, effective ${result.status}`, ...result.reasons.map((item) => `  ${item}`), JSON.stringify(revision.content, null, 2)].join('\n'),
      )
      return
    }
    case 'review': {
      const report = reviewRevision(ws, { strategy_id: need(values, 'id'), revision: validateRevisionNumber(need(values, 'revision')) })
      print(values, { ok: true, review: report }, () => reviewText(report))
      if (report.blockers.length) process.exitCode = 3
      return
    }
    case 'approve': {
      const proof = await ownerProof()
      const result = approveRevision(ws, { strategy_id: need(values, 'id'), revision: validateRevisionNumber(need(values, 'revision')), expected_sha256: need(values, 'expect-sha'), proof })
      print(values, { ok: true, approved: result.approved, superseded: result.superseded?.revision ?? null }, () =>
        `Approved ${result.record.strategy_id} revision ${result.approved.revision}${result.superseded ? `; revision ${result.superseded.revision} is now superseded` : ''}. This authorizes no ad, spend, publication or website change.`,
      )
      return
    }
    case 'reject': {
      const entry = rejectRevision(ws, { strategy_id: need(values, 'id'), revision: validateRevisionNumber(need(values, 'revision')) })
      print(values, { ok: true, entry }, () => `Rejected revision ${entry.revision}. It stays on disk for audit and is never served.`)
      return
    }
    case 'withdraw': {
      const proof = await ownerProof()
      const entry = withdrawRevision(ws, { strategy_id: need(values, 'id'), revision: validateRevisionNumber(need(values, 'revision')), reason: need(values, 'reason'), proof })
      print(values, { ok: true, entry }, () => `Withdrew revision ${entry.revision}. Agents now get no current revision for this strategy until you approve a new one.`)
      return
    }
    default:
      usage(command ? `Unknown command ${command}.` : 'No command given.')
  }
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
  if (error instanceof StrategyError || error instanceof KnowledgeError) {
    if (values.json) console.log(JSON.stringify({ ok: false, error: { code: error.code, message: error.message } }, null, 2))
    else console.error(`${error.code}: ${error.message}`)
    process.exit(1)
  }
  console.error(`Unexpected error (${(error as Error)?.name ?? 'Error'}). Nothing was approved or published.`)
  process.exit(1)
}
