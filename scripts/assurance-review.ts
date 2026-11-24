import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { AGENT_TOKEN_ENV } from '@brand-os/brand-core'
import { assuranceLang, fill, type AssuranceLang } from '@brand-os/brand-core/assurance'
import {
  AssuranceBridgeError,
  AssuranceReviewError,
  BRIDGE_TEXT,
  isDay,
  listReviewItems,
  recordReview,
  renderRecorded,
  renderReviewList,
  REVIEW_HELP,
  REVIEW_TEXT,
} from '@brand-os/brand-core/assurance/workspace'

/**
 * brand:assurance-review — the owner records a judgment on an Assurance control that only a person can
 * decide (GAP-09 follow-up), so `brand:assurance assess` can give a score.
 *
 * Owner-local. Refused while an agent token is set, before anything is read. `list` reads only; `record`
 * appends one revision to brand/.private/assurance/reviews/<control>.json and writes nothing else. No MCP
 * tool, Studio route or agent profile reaches it.
 *
 * Guide: docs-internal/ASSURANCE.md, "Owner review judgments".
 */

const [command, ...rest] = process.argv.slice(2)

const OPTIONS = {
  json: { type: 'boolean', default: false },
  lang: { type: 'string' },
  'as-of': { type: 'string' },
  'show-notes': { type: 'boolean', default: false },
  control: { type: 'string' },
  judgment: { type: 'string' },
  note: { type: 'string' },
  date: { type: 'string' },
  expect: { type: 'string' },
} as const

type Values = ReturnType<typeof parseArgs<{ args: string[]; options: typeof OPTIONS; allowPositionals: false; strict: true }>>['values']

function earlyLang(args: string[]): AssuranceLang {
  const index = args.findIndex((arg) => arg === '--lang' || arg.startsWith('--lang='))
  if (index < 0) return 'en'
  const value = args[index]!.includes('=') ? args[index]!.split('=')[1] : args[index + 1]
  return assuranceLang(value)
}

const LANG = earlyLang(rest)

function usage(message: string): never {
  console.error(`${message}\n\n${REVIEW_HELP[LANG]}`)
  process.exit(2)
}

// An agent process gets the same refusal whatever it asked for, before options are parsed or a file is read.
if (process.env[AGENT_TOKEN_ENV]) {
  console.error(`refused: ${REVIEW_TEXT.refused_agent![LANG]}`)
  process.exit(1)
}

if (!command || command === 'help' || command === '--help') {
  console.log(REVIEW_HELP[LANG])
  process.exit(command ? 0 : 2)
}

let values: Values
try {
  values = parseArgs({ args: rest, options: OPTIONS, allowPositionals: false, strict: true }).values
} catch (error) {
  usage((error as Error).message)
}

function lang(): AssuranceLang {
  const given = values.lang
  if (given === undefined) return 'en'
  if (given !== 'en' && given !== 'fa' && given !== 'tr') usage(`--lang must be en, fa or tr (given ${given}).`)
  return given
}

function asOf(): Date {
  const given = values['as-of']
  if (given === undefined) return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`)
  if (!isDay(given)) usage('--as-of must be a real calendar date, YYYY-MM-DD.')
  return new Date(`${given}T00:00:00.000Z`)
}

function only(allowed: string[]): void {
  for (const key of Object.keys(values)) {
    if (key === 'json' || key === 'lang' || allowed.includes(key)) continue
    if (values[key as keyof Values] === undefined || values[key as keyof Values] === false) continue
    usage(`${command} does not take --${key}.`)
  }
}

function run(): void {
  if (!fs.existsSync(path.join(process.cwd(), 'brand', 'brand.config.yaml'))) throw new AssuranceBridgeError('not_a_brand', BRIDGE_TEXT.not_a_brand!.en)
  const root = process.cwd()
  const language = lang()
  switch (command) {
    case 'list': {
      only(['as-of', 'show-notes'])
      const result = listReviewItems(root, { asOf: asOf(), showNotes: values['show-notes'] === true })
      console.log(values.json ? JSON.stringify(result, null, 2) : renderReviewList(result, language))
      return
    }
    case 'record': {
      only(['control', 'judgment', 'note', 'date', 'expect'])
      if (values.control === undefined) usage('record needs --control <id>, for example --control PRR-08.')
      if (values.judgment === undefined) usage('record needs --judgment yes|partly|no.')
      if (values.judgment !== 'yes' && values.judgment !== 'partly' && values.judgment !== 'no') usage(`--judgment must be yes, partly or no (given ${values.judgment}).`)
      if (values.note === undefined) usage('record needs --note "<short reason>".')
      if (values.date !== undefined && !isDay(values.date)) usage('--date must be a real calendar date, YYYY-MM-DD.')
      const expected = values.expect === undefined ? undefined : values.expect === 'none' ? null : values.expect
      const result = recordReview(root, {
        control_id: values.control,
        judgment: values.judgment,
        note: values.note,
        ...(values.date !== undefined ? { reviewed_on: values.date } : {}),
        ...(expected !== undefined ? { expected_revision: expected } : {}),
      })
      if (values.json) {
        // The note is the owner's own words: echoed nowhere, not even here.
        const { note: _note, ...revision } = result.revision
        console.log(JSON.stringify({ ok: true, control_id: result.control_id, revision, authorizes: [] }, null, 2))
      } else console.log(renderRecorded(result, language))
      return
    }
    default:
      usage(command ? `Unknown command ${command}.` : 'No command given.')
  }
}

function message(error: AssuranceBridgeError | AssuranceReviewError, language: AssuranceLang): string {
  if (error.code === 'refused') return REVIEW_TEXT.refused_agent![language]
  if (error.code === 'not_a_brand') return BRIDGE_TEXT.not_a_brand![language]
  if (error.code === 'invalid_review') return fill(BRIDGE_TEXT.invalid_review![language], { reason: error.message })
  if (error.code === 'invalid_link') return fill(BRIDGE_TEXT.invalid_link![language], { reason: error.message })
  return fill(REVIEW_TEXT.rejected![language], { reason: error.message })
}

try {
  run()
} catch (error) {
  const language = assuranceLang(values.lang)
  if (error instanceof AssuranceBridgeError || error instanceof AssuranceReviewError) {
    const text = message(error, language)
    if (values.json) console.log(JSON.stringify({ ok: false, error: { code: error.code, message: text }, authorizes: [] }, null, 2))
    else console.error(`${error.code}: ${text}`)
    process.exit(1)
  }
  // Never print the raw message of an unexpected error: it could carry a path or a value.
  console.error(fill(REVIEW_TEXT.unexpected![language], { name: (error as Error)?.name ?? 'Error' }))
  process.exit(1)
}
