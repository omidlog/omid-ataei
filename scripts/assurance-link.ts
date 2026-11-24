import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { AGENT_TOKEN_ENV } from '@brand-os/brand-core'
import { assuranceLang, fill, type AssuranceLang } from '@brand-os/brand-core/assurance'
import {
  AssuranceBridgeError,
  AssuranceLinkError,
  BRIDGE_TEXT,
  isDay,
  LINK_HELP,
  LINK_TEXT,
  linkEvidence,
  listEvidenceLinks,
  renderLinked,
  renderLinkList,
  unlinkEvidence,
} from '@brand-os/brand-core/assurance/workspace'

/**
 * brand:assurance-link — the owner links an Assurance research note to an entry in the evidence register
 * (GAP-09 follow-up), so the assessment can count it as independent evidence while that entry qualifies.
 *
 * Owner-local. Refused while an agent token is set, before anything is read. `list` reads only; `link`
 * and `unlink` append one revision to brand/.private/assurance/evidence-links/<note>.json and write
 * nothing else. No MCP tool, Studio route or agent profile reaches it.
 *
 * Guide: docs-internal/ASSURANCE.md, "Evidence links for research notes".
 */

const [command, ...rest] = process.argv.slice(2)

const OPTIONS = {
  json: { type: 'boolean', default: false },
  lang: { type: 'string' },
  'as-of': { type: 'string' },
  note: { type: 'string' },
  evidence: { type: 'string' },
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
  console.error(`${message}\n\n${LINK_HELP[LANG]}`)
  process.exit(2)
}

// An agent process gets the same refusal whatever it asked for, before options are parsed or a file is read.
if (process.env[AGENT_TOKEN_ENV]) {
  console.error(`refused: ${LINK_TEXT.refused_agent![LANG]}`)
  process.exit(1)
}

if (!command || command === 'help' || command === '--help') {
  console.log(LINK_HELP[LANG])
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

function common(): { linked_on?: string; expected_revision?: string | null } {
  if (values.note === undefined) usage(`${command} needs --note <kn_…>.`)
  if (values.date !== undefined && !isDay(values.date)) usage('--date must be a real calendar date, YYYY-MM-DD.')
  const expected = values.expect === undefined ? undefined : values.expect === 'none' ? null : values.expect
  return { ...(values.date !== undefined ? { linked_on: values.date } : {}), ...(expected !== undefined ? { expected_revision: expected } : {}) }
}

function run(): void {
  if (!fs.existsSync(path.join(process.cwd(), 'brand', 'brand.config.yaml'))) throw new AssuranceBridgeError('not_a_brand', BRIDGE_TEXT.not_a_brand!.en)
  const root = process.cwd()
  const language = lang()
  switch (command) {
    case 'list': {
      only(['as-of'])
      const result = listEvidenceLinks(root, { asOf: asOf() })
      console.log(values.json ? JSON.stringify(result, null, 2) : renderLinkList(result, language))
      return
    }
    case 'link': {
      only(['note', 'evidence', 'date', 'expect'])
      const extra = common()
      if (values.evidence === undefined) usage('link needs --evidence <ev-NNNN>.')
      const result = linkEvidence(root, { note_id: values.note!, evidence_id: values.evidence, ...extra })
      console.log(values.json ? JSON.stringify({ ok: true, ...result }, null, 2) : renderLinked(result, language))
      return
    }
    case 'unlink': {
      only(['note', 'date', 'expect'])
      const extra = common()
      const result = unlinkEvidence(root, { note_id: values.note!, ...extra })
      console.log(values.json ? JSON.stringify({ ok: true, ...result }, null, 2) : renderLinked(result, language))
      return
    }
    default:
      usage(command ? `Unknown command ${command}.` : 'No command given.')
  }
}

function message(error: AssuranceBridgeError | AssuranceLinkError, language: AssuranceLang): string {
  if (error.code === 'refused') return LINK_TEXT.refused_agent![language]
  if (error.code === 'not_a_brand') return BRIDGE_TEXT.not_a_brand![language]
  if (error.code === 'invalid_link') return fill(BRIDGE_TEXT.invalid_link![language], { reason: error.message })
  if (error.code === 'invalid_review') return fill(BRIDGE_TEXT.invalid_review![language], { reason: error.message })
  return fill(LINK_TEXT.rejected![language], { reason: error.message })
}

try {
  run()
} catch (error) {
  const language = assuranceLang(values.lang)
  if (error instanceof AssuranceBridgeError || error instanceof AssuranceLinkError) {
    const text = message(error, language)
    if (values.json) console.log(JSON.stringify({ ok: false, error: { code: error.code, message: text }, authorizes: [] }, null, 2))
    else console.error(`${error.code}: ${text}`)
    process.exit(1)
  }
  // Never print the raw message of an unexpected error: it could carry a path or a value.
  console.error(fill(LINK_TEXT.unexpected![language], { name: (error as Error)?.name ?? 'Error' }))
  process.exit(1)
}
