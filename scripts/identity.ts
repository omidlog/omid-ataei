import { parseArgs } from 'node:util'
import { AGENT_TOKEN_ENV, KnowledgeError, openWorkspace, type KnowledgeWorkspace } from '@brand-os/brand-core'
import { asLang, CompetitiveError } from '@brand-os/brand-core/competitive'
import { CreativeError } from '@brand-os/brand-core/creative'
import {
  buildIdentityBrief,
  diagnosisState,
  IDENTITY_LANGS,
  IdentityError,
  linkCreativeProject,
  markReviewed,
  readAudit,
  answersOf,
  recordAnswer,
  renderBrief,
  setEquity,
  UNKNOWN,
  type IdentityLang,
} from '@brand-os/brand-core/identity'
import { ResearchError, selectAdapter } from '@brand-os/brand-core/research'

/**
 * brand:identity — the owner's identity audit and logo brief (Identity Slice D).
 *
 * The audit lives in brand/.private/identity (gitignored). Owner words become local Knowledge notes. The brief reads
 * approved facts, the `identity` competitive projection and the linked Creative Learning project. Nothing here writes
 * a brand fact, `brand.logo.*`, an asset or a master file, and every command is refused under an agent token.
 */

const HELP = `brand:identity <command> [options]

  next [--lang en|fa|tr]                       the next diagnosis question for the confirmed path
  answer --question <id> --value <choice[,choice]|unknown> [--words "<your words>"] [--lang …]
                                               record one answer; words become a local Knowledge note
  equity --component <name|logo_symbol|logo_wordmark|colors|typography|mascot|tone|tagline|imagery|other>
         --choice preserve|refine|replace|evaluate|unknown [--evidence measured_study|owner_reported|unknown]
         [--study-note kn_…] [--words "<why>"]
                                               one row of the equity preservation matrix; measured_study
                                               needs a cited study note
  link-creative --project <id>                 the Creative Learning project (surface logo) for concept rounds
  brief [--lang en|fa|tr] [--market TR]        print the draft brief (Markdown; JSON with --json); writes nothing
  reviewed [--lang …] [--market …]             record that you read the current brief (approves nothing)

The brief authorizes nothing (authorizes: []). Logo, name, color or type changes still go through
brand:propose or brand:knowledge propose, then brand:review and brand:approve; real artwork through
brand/assets/asset-manifest.yaml. Add --json for machine-readable output. Refused while ${AGENT_TOKEN_ENV} is set.`

const [command, ...rest] = process.argv.slice(2)

const OPTIONS = {
  json: { type: 'boolean', default: false },
  lang: { type: 'string' },
  market: { type: 'string' },
  question: { type: 'string' },
  value: { type: 'string' },
  words: { type: 'string' },
  component: { type: 'string' },
  choice: { type: 'string' },
  evidence: { type: 'string' },
  'study-note': { type: 'string' },
  project: { type: 'string' },
} as const

type Values = ReturnType<typeof parseArgs<{ args: string[]; options: typeof OPTIONS; allowPositionals: false; strict: true }>>['values']

function usage(message: string): never {
  console.error(`${message}\n\n${HELP}`)
  process.exit(2)
}

function need(values: Values, key: keyof Values): string {
  const value = values[key]
  if (typeof value !== 'string' || !value) usage(`--${key} is required.`)
  return value
}

function print(values: Values, data: unknown, text: () => string): void {
  console.log(values.json ? JSON.stringify(data, null, 2) : text())
}

function lang(values: Values): IdentityLang {
  return (IDENTITY_LANGS as readonly string[]).includes(values.lang ?? '') ? (values.lang as IdentityLang) : 'en'
}

function brief(ws: KnowledgeWorkspace, values: Values) {
  return buildIdentityBrief(ws, { capability: selectAdapter({}).capability(ws.now()), lang: asLang(values.lang), market: values.market ?? null })
}

function run(ws: KnowledgeWorkspace, values: Values): void {
  switch (command) {
    case 'next': {
      const state = diagnosisState(answersOf(readAudit(ws)))
      const l = lang(values)
      print(values, { ok: true, state }, () =>
        state.next
          ? [`${state.next.id} (${state.next.stage})`, state.next.prompt[l], `  ${state.next.why_asked}`, `  choices: ${[...state.next.choices, UNKNOWN].join(', ')}${state.next.multi ? ' (several, comma-separated)' : ''}`].join('\n')
          : state.complete
            ? `The diagnosis is complete for the ${state.path} path. Print the brief with: brand:identity brief`
            : 'Confirm the identity path first: brand:identity answer --question identity.path --value …',
      )
      return
    }
    case 'answer': {
      const out = recordAnswer(ws, { question_id: need(values, 'question'), value: need(values, 'value'), words: values.words, language: values.lang ?? null })
      print(values, { ok: true, ...out }, () => `Recorded ${need(values, 'question')} = ${[out.entry.value].flat().join(', ')}${out.changed_from !== null ? ` (was ${[out.changed_from].flat().join(', ')})` : ''}${out.entry.note ? `; your words: knowledge:${out.entry.note.id}@${out.entry.note.revision}` : ''}. This is a draft answer, not a brand fact.`)
      return
    }
    case 'equity': {
      const entry = setEquity(ws, { component: need(values, 'component'), choice: need(values, 'choice'), evidence: values.evidence, study_note: values['study-note'], words: values.words, language: values.lang ?? null })
      print(values, { ok: true, entry }, () => `${need(values, 'component')}: ${entry.choice} (evidence ${entry.evidence}${entry.study ? `, study knowledge:${entry.study.id}@${entry.study.revision}` : ''}). Nothing about the current identity changed.`)
      return
    }
    case 'link-creative': {
      const record = linkCreativeProject(ws, need(values, 'project'))
      print(values, { ok: true, creative_project_id: record.creative_project_id }, () => `Linked Creative Learning project ${record.creative_project_id}. Concept feedback stays there; selection is not an approved mark.`)
      return
    }
    case 'brief': {
      const out = brief(ws, values)
      print(values, { ok: true, brief: out }, () => renderBrief(out))
      return
    }
    case 'reviewed': {
      const out = brief(ws, values)
      const mark = markReviewed(ws, { brief_digest: out.brief_digest, sources_digest: out.sources_digest })
      print(values, { ok: true, mark }, () => `Recorded that you read brief ${mark.brief_digest.slice(0, 12)} at ${mark.reviewed_at}. This approves nothing.`)
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
  run(openWorkspace(process.cwd()), values)
} catch (error) {
  if (error instanceof IdentityError || error instanceof KnowledgeError || error instanceof CompetitiveError || error instanceof CreativeError || error instanceof ResearchError) {
    if (values.json) console.log(JSON.stringify({ ok: false, error: { code: error.code, message: error.message } }, null, 2))
    else console.error(`${error.code}: ${error.message}`)
    process.exit(1)
  }
  console.error(`Unexpected error (${(error as Error)?.name ?? 'Error'}). Nothing about the brand was changed.`)
  process.exit(1)
}
