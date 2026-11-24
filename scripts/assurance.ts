import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { AGENT_TOKEN_ENV } from '@brand-os/brand-core'
import { assuranceLang, fill, renderGapReport, type AssuranceLang } from '@brand-os/brand-core/assurance'
import {
  assessWorkspace,
  AssuranceBridgeError,
  BRIDGE_HELP,
  BRIDGE_TEXT,
  buildAssuranceSnapshot,
  MAX_SNAPSHOT_BYTES,
  parseSnapshotFile,
  renderSnapshotSummary,
  renderVerifyResult,
  verifyAssuranceSnapshot,
  type AssuranceSnapshot,
  type BridgeOptions,
  type PaidMediaStatement,
} from '@brand-os/brand-core/assurance/workspace'

/**
 * brand:assurance — the owner-local bridge from a real brand's approved facts to the Assurance
 * evaluator (GAP-09).
 *
 * Read-only. It reads approved facts, the answer ledger, internal research notes and the interview's
 * contradiction rules, and prints. It writes no file anywhere. It is refused while an agent token is set,
 * and no MCP tool, Studio route or agent profile reaches it.
 *
 * Guide: docs-internal/ASSURANCE.md, "Owner-local bridge to a real brand".
 */

const [command, ...rest] = process.argv.slice(2)

const OPTIONS = {
  json: { type: 'boolean', default: false },
  lang: { type: 'string' },
  'as-of': { type: 'string' },
  audience: { type: 'string' },
  'paid-media': { type: 'string' },
  pin: { type: 'string' },
  snapshot: { type: 'string' },
} as const

type Values = ReturnType<typeof parseArgs<{ args: string[]; options: typeof OPTIONS; allowPositionals: false; strict: true }>>['values']

/** The language for messages before options are parsed: --lang if it is there and valid, else English. */
function earlyLang(args: string[]): AssuranceLang {
  const index = args.findIndex((arg) => arg === '--lang' || arg.startsWith('--lang='))
  if (index < 0) return 'en'
  const value = args[index]!.includes('=') ? args[index]!.split('=')[1] : args[index + 1]
  return assuranceLang(value)
}

const LANG = earlyLang(rest)

function usage(message: string): never {
  console.error(`${message}\n\n${BRIDGE_HELP[LANG]}`)
  process.exit(2)
}

function lang(values: Values): AssuranceLang {
  const given = values.lang
  if (given === undefined) return 'en'
  if (given !== 'en' && given !== 'fa' && given !== 'tr') usage(`--lang must be en, fa or tr (given ${given}).`)
  return given
}

/** `--as-of` is a calendar day in UTC, so the same day gives the same snapshot. Default: today (UTC). */
function asOf(values: Values): Date {
  const given = values['as-of']
  if (given === undefined) return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(given)) usage('--as-of must be a date, YYYY-MM-DD.')
  const date = new Date(`${given}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== given) usage('--as-of must be a real calendar date, YYYY-MM-DD.')
  return date
}

function audience(values: Values): BridgeOptions['audience'] {
  const given = values.audience ?? 'internal'
  if (given !== 'public' && given !== 'internal' && given !== 'restricted') usage(`--audience must be public, internal or restricted (given ${given}).`)
  return given
}

/** Deprecated alias. Kept so existing scripts keep working; the interview answer comes first. */
function paidMedia(values: Values): PaidMediaStatement {
  const given = values['paid-media'] ?? 'unknown'
  if (given !== 'yes' && given !== 'no' && given !== 'unknown') usage(`--paid-media must be yes, no or unknown (given ${given}).`)
  return given
}

/** Reads an owner-provided snapshot file as data: a regular file, bounded, never followed through a symlink. */
function readSnapshotFile(file: string): string {
  const resolved = path.resolve(file)
  let stat: fs.Stats
  try {
    stat = fs.lstatSync(resolved)
  } catch {
    throw new AssuranceBridgeError('invalid_pin', 'The snapshot file does not exist.')
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new AssuranceBridgeError('invalid_pin', 'The snapshot file must be a regular file, not a symlink or a folder.')
  if (stat.size > MAX_SNAPSHOT_BYTES) throw new AssuranceBridgeError('invalid_pin', 'The snapshot file is too large.')
  return fs.readFileSync(resolved, 'utf8')
}

function options(values: Values): BridgeOptions {
  const base: BridgeOptions = { asOf: asOf(values), audience: audience(values), paidMedia: paidMedia(values) }
  if (values.pin !== undefined) {
    const kept = parseSnapshotFile(readSnapshotFile(values.pin))
    base.pins = kept.pins
  }
  return base
}

/** On stderr, so `--json` output stays parseable. */
function warnDeprecatedPaidMedia(values: Values, snapshot: AssuranceSnapshot, language: AssuranceLang): void {
  if (values['paid-media'] === undefined) return
  console.error(BRIDGE_TEXT.paid_media_deprecated![language])
  const entry = snapshot.subject_provenance.find((item) => item.field === 'runs_paid_media')
  if (entry?.source !== 'approved_fact') return
  // An approved `undecided` is the interview answer too: it wins, and the notice says so.
  console.error(BRIDGE_TEXT[entry.value === 'unknown' ? 'paid_media_ignored_undecided' : 'paid_media_ignored']![language])
}

function run(values: Values): void {
  // An agent process gets the same refusal whatever it asked for, before anything is read.
  if (process.env[AGENT_TOKEN_ENV]) throw new AssuranceBridgeError('refused', BRIDGE_TEXT.refused_agent!.en)
  if (!fs.existsSync(path.join(process.cwd(), 'brand', 'brand.config.yaml'))) throw new AssuranceBridgeError('not_a_brand', BRIDGE_TEXT.not_a_brand!.en)
  const root = process.cwd()
  const language = lang(values)
  switch (command) {
    case 'snapshot': {
      if (values.snapshot !== undefined) usage('snapshot takes --pin, not --snapshot. Use verify --snapshot to check a kept snapshot.')
      const snapshot = buildAssuranceSnapshot(root, options(values))
      warnDeprecatedPaidMedia(values, snapshot, language)
      console.log(values.json ? JSON.stringify(snapshot, null, 2) : renderSnapshotSummary(snapshot, language))
      return
    }
    case 'assess': {
      if (values.snapshot !== undefined) usage('assess takes --pin, not --snapshot. Use verify --snapshot to check a kept snapshot.')
      const result = assessWorkspace(root, options(values))
      warnDeprecatedPaidMedia(values, result.snapshot, language)
      if (values.json) console.log(JSON.stringify(result, null, 2))
      else console.log(`${renderSnapshotSummary(result.snapshot, language)}\n${renderGapReport(result.assessment, language)}`)
      return
    }
    case 'verify': {
      if (values.snapshot === undefined) usage('verify needs --snapshot <file>.')
      for (const flag of ['as-of', 'audience', 'paid-media', 'pin'] as const) {
        if (values[flag] !== undefined) usage(`verify takes its --${flag} from the kept snapshot; do not pass it.`)
      }
      const result = verifyAssuranceSnapshot(root, readSnapshotFile(values.snapshot))
      console.log(values.json ? JSON.stringify(result, null, 2) : renderVerifyResult(result, language))
      // A different digest is a finding, not a failure of the command. The exit code lets a script tell.
      process.exitCode = result.reproduced ? 0 : 3
      return
    }
    default:
      usage(command ? `Unknown command ${command}.` : 'No command given.')
  }
}

if (!command || command === 'help' || command === '--help') {
  console.log(BRIDGE_HELP[LANG])
  process.exit(command ? 0 : 2)
}

let values: Values
try {
  values = parseArgs({ args: rest, options: OPTIONS, allowPositionals: false, strict: true }).values
} catch (error) {
  usage((error as Error).message)
}

function message(error: AssuranceBridgeError, language: AssuranceLang): string {
  if (error.code === 'refused') return BRIDGE_TEXT.refused_agent![language]
  if (error.code === 'not_a_brand') return BRIDGE_TEXT.not_a_brand![language]
  if (error.code === 'invalid_pin') return fill(BRIDGE_TEXT.invalid_pin![language], { reason: error.message })
  if (error.code === 'invalid_review') return fill(BRIDGE_TEXT.invalid_review![language], { reason: error.message })
  if (error.code === 'invalid_link') return fill(BRIDGE_TEXT.invalid_link![language], { reason: error.message })
  return error.message
}

try {
  run(values)
} catch (error) {
  const language = assuranceLang(values.lang)
  if (error instanceof AssuranceBridgeError) {
    const text = message(error, language)
    if (values.json) console.log(JSON.stringify({ ok: false, error: { code: error.code, message: text }, authorizes: [] }, null, 2))
    else console.error(`${error.code}: ${text}`)
    process.exit(1)
  }
  // Never print the raw message of an unexpected error: it could carry a path or a value.
  console.error(fill(BRIDGE_TEXT.unexpected![language], { name: (error as Error)?.name ?? 'Error' }))
  process.exit(1)
}
