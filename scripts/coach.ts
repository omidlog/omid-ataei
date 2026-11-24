import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { AGENT_TOKEN_ENV, InterviewEngine } from '@brand-os/brand-core'
import { coachAnalyze, coachNext, CoachError, COACH_MODES, isCoachMode, renderCoachResult, type CoachResult } from '@brand-os/brand-core/coach'

/**
 * brand:coach — the Strategic Coach (PR 1: deterministic core).
 *
 * Owner-local and read-only. It reads the question bank, the answer ledger, the session, the active
 * profile, the evidence register and the existing contradiction rules, and prints advice. It writes
 * nothing: no answer, no fact, no approval, no strategy, no asset, no cache file. Every command is
 * refused while an agent token is set, and restricted questions are refused outright.
 *
 * Guide: docs-internal/STRATEGIC_COACH.md. Contract: schemas/coach-result.schema.json.
 */

const HELP = `brand:coach <command> [options]

  analyze --mode follow_up|quality_review|consistency_review [--question <id>] [--lang en|fa|tr] [--json]
                                   advice for one question (follow_up, quality_review) or for the brand
                                   (consistency_review, which takes --question only to narrow it)
  next [--lang en|fa|tr] [--json]  coach the question you answered last in this session

Modes:
  follow_up           0 or 1 clarifying question. When an existing canonical question covers the gap it
                      prints that id instead of writing a new question. unknown, skip, not relevant and
                      decide later are never reopened.
  quality_review      an explainable status (ready, needs_clarification, evidence_missing, needs_review,
                      not_applicable, insufficient_context) with at most two named deficits. No score.
  consistency_review  confirmed_conflict (the interview's own contradiction rules, unchanged),
                      potential_tension (a trade-off worth one question, from a few narrow rules),
                      needs_verification (a claim with no verified source) and, per rule, not_tested
                      when an input is still open. No score, no percentage.

Everything is advisory: authorizes is always empty. Changing an answer stays brand:interview, brand:review
and brand:approve. Nothing is cached or written. Refused while ${AGENT_TOKEN_ENV} is set; restricted
questions are refused with no value and no digest.`

const [command, ...rest] = process.argv.slice(2)

const OPTIONS = {
  json: { type: 'boolean', default: false },
  mode: { type: 'string' },
  question: { type: 'string' },
  lang: { type: 'string' },
} as const

type Values = ReturnType<typeof parseArgs<{ args: string[]; options: typeof OPTIONS; allowPositionals: false; strict: true }>>['values']

function usage(message: string): never {
  console.error(`${message}\n\n${HELP}`)
  process.exit(2)
}

function lang(values: Values): 'en' | 'fa' | 'tr' {
  const given = values.lang
  if (given === undefined) return 'en'
  if (given !== 'en' && given !== 'fa' && given !== 'tr') usage(`--lang must be en, fa or tr (given ${given}).`)
  return given
}

function print(values: Values, result: CoachResult): void {
  console.log(values.json ? JSON.stringify(result, null, 2) : renderCoachResult(result))
}

function run(values: Values): void {
  // A clear message rather than a YAML read error when the command runs outside a brand repository.
  if (!fs.existsSync(path.join(process.cwd(), 'brand', 'brand.config.yaml'))) {
    throw new CoachError('invalid_input', 'This folder is not a Brand OS brand (brand/brand.config.yaml is missing). Run the command from the brand repository root.')
  }
  const engine = new InterviewEngine(process.cwd())
  switch (command) {
    case 'analyze': {
      const mode = values.mode
      if (!isCoachMode(mode)) usage(`--mode must be one of ${COACH_MODES.join(', ')}${mode ? ` (given ${mode})` : ''}.`)
      print(values, coachAnalyze(engine, { mode, questionId: values.question ?? null, locale: lang(values) }))
      return
    }
    case 'next': {
      if (values.mode !== undefined) usage('next has no --mode: it runs follow_up on your last answer. Use analyze --mode for the other modes.')
      print(values, coachNext(engine, { locale: lang(values) }))
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
  run(values)
} catch (error) {
  if (error instanceof CoachError) {
    if (values.json) console.log(JSON.stringify({ ok: false, error: { code: error.code, message: error.message } }, null, 2))
    else console.error(`${error.code}: ${error.message}`)
    process.exit(1)
  }
  // Never print the raw message of an unexpected error: it could carry a path or a value.
  console.error(`Unexpected error (${(error as Error)?.name ?? 'Error'}). The coach is read-only, so nothing about the brand changed.`)
  process.exit(1)
}
