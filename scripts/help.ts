import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * `npm run help`: the main npm scripts, grouped, in plain English. Any script in package.json that
 * is not described here is still listed under "Other scripts", so a new script never goes missing.
 */
export interface ScriptGroup {
  title: string
  scripts: Array<[name: string, description: string]>
}

export const SCRIPT_GROUPS: ScriptGroup[] = [
  {
    title: 'Check everything',
    scripts: [
      ['doctor', 'Check Node, the install and common setup mistakes, with a fix for each. Start here when something will not run.'],
      ['ci', 'Run lint, typecheck, validate, tests and both docs builds. Run this before a pull request.'],
      ['lint', 'Check code style with ESLint.'],
      ['typecheck', 'Check TypeScript types without building.'],
      ['validate', 'Check the brand files against their schemas and rules.'],
      ['test', 'Run the test suite (browser tests skip when Chrome is missing).'],
      ['test:e2e', 'Run the Studio browser tests and fail if Chrome is missing.'],
    ],
  },
  {
    title: 'Interview and brand facts',
    scripts: [
      ['brand:init', 'Set up a new brand in this repository.'],
      ['brand:interview', 'Answer the next interview question (or one by --question).'],
      ['brand:resume', 'Continue the interview where you stopped.'],
      ['brand:next', 'Show which questions to answer next and why.'],
      ['brand:propose', 'Store extracted answers from a file as drafts.'],
      ['brand:status', 'Show coverage and approval, without answer values.'],
      ['brand:review', 'Review draft answers of a module before approval.'],
      ['brand:approve', 'Approve reviewed answers (owner step; needs the approval proof).'],
      ['brand:publish', 'Publish approved facts (or --unpublish them).'],
      ['brand:retract', 'Remove an approved claim and unpublish it (owner step).'],
      ['brand:evidence', 'Add, verify or withdraw evidence for a claim.'],
      ['brand:coach', 'Get advisory coaching on one answer: a follow-up question, a quality status or the open contradictions.'],
      ['brand:assurance', 'Owner-local, read-only: pin approved facts into a reproducible Positioning Readiness snapshot and list what is missing. Never a certification.'],
      ['brand:assurance-review', 'Owner-only: list the Assurance controls that need a person\'s judgment and record yours (yes, partly or no, with a note), so assess can give a score.'],
      ['brand:assurance-link', 'Owner-only: link an Assurance research note to a verified evidence-register entry, so assess counts it as independent evidence while that entry qualifies.'],
      ['brand:doctor', 'Find problems in the brand repository and say how to fix them.'],
    ],
  },
  {
    title: 'Documents, tokens and docs site',
    scripts: [
      ['brand:document', 'Generate brand documents from approved facts.'],
      ['brand:tokens:generate', 'Draft design tokens from approved answers.'],
      ['brand:tokens:approve', 'Approve generated tokens by hash (owner step).'],
      ['brand:tokens:publish', 'Publish approved tokens.'],
      ['build', 'Build the design tokens and the docs site.'],
      ['docs:start', 'Start the internal docs site locally.'],
    ],
  },
  {
    title: 'Agents',
    scripts: [
      ['brand:query', 'Ask the brand query tools from the command line.'],
      ['brand:agent-token', 'Issue, list or revoke agent tokens (owner step).'],
      ['mcp:serve', 'Start the MCP server for AI agents.'],
    ],
  },
  {
    title: 'Studio (read-only web viewer)',
    scripts: [
      ['studio:start', 'Start Studio locally.'],
      ['studio', 'Studio owner commands on the server: check-config, bootstrap-owner, register, brands.'],
      ['studio:hash-password', 'Hash the Studio owner password for the environment file.'],
      ['studio:build', 'Build the production Studio bundle.'],
    ],
  },
  {
    title: 'Safety and maintenance',
    scripts: [
      ['brand:backup', 'Write an encrypted backup of the brand files.'],
      ['brand:restore', 'Restore an encrypted backup.'],
      ['brand:migrate', 'Upgrade brand files to the current engine version.'],
      ['brand:export', 'Write a JSON snapshot of the brand (--public for the public one).'],
      ['brand:finance', 'Build the financial model from a private input file.'],
      ['example:education', 'Run the education example interview in a temporary folder.'],
      ['example:b2b', 'Run the B2B SaaS example interview in a temporary folder.'],
      ['brand:reset', 'Clear interview state after a backup (asks for a confirmation sentence).'],
    ],
  },
]

export function renderHelp(scripts: Record<string, string>): string {
  const lines: string[] = ['Brand OS scripts. Run one with: npm run <name>', '']
  const described = new Set<string>(['help'])
  for (const group of SCRIPT_GROUPS) {
    const rows = group.scripts.filter(([name]) => name in scripts)
    if (rows.length === 0) continue
    const width = Math.max(...rows.map(([name]) => name.length))
    lines.push(group.title)
    for (const [name, description] of rows) {
      described.add(name)
      lines.push(`  ${name.padEnd(width)}  ${description}`)
    }
    lines.push('')
  }
  const others = Object.keys(scripts).filter((name) => !described.has(name)).sort()
  if (others.length) {
    lines.push('Other scripts')
    for (const name of others) lines.push(`  ${name}`)
    lines.push('')
  }
  lines.push('Pass options after --, for example: npm run brand:next -- --json. More in README.md and AGENTS.md.')
  return `${lines.join('\n')}\n`
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
  process.stdout.write(renderHelp(pkg.scripts ?? {}))
}
