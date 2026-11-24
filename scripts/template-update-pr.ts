import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import {
  applyTemplateUpdate,
  defaultUpdateBranch,
  formatUpdatePlan,
  isWriteAction,
  planTemplateUpdate,
  readSyncManifest,
  type UpdatePlan,
} from '@brand-os/brand-core'

/**
 * The brand-side "Template update" GitHub Action (.github/workflows/template-update.yml) runs this after it
 * has cloned the private template with the BRAND_OS_TEMPLATE_TOKEN secret. It keeps ONE open template
 * update pull request in the brand repository:
 *
 * - plans the update with the same code as `npm run template:update` (brand-owned files are never touched);
 * - nothing to do when the brand is already on the template commit, or an open update pull request already
 *   targets it (Studio's or this Action's);
 * - otherwise commits the update on a NEW branch `template-update/<sha>`, pushes that branch (never the
 *   default branch, never with force) and opens a pull request; an older open update pull request is closed
 *   with a link to the new one, its branch kept, so there is still only one;
 * - never merges anything.
 *
 * npx tsx scripts/template-update-pr.ts --template <template clone> [--repo <brand checkout>] [--remote origin]
 * Environment: GITHUB_REPOSITORY (owner/name), GITHUB_TOKEN (pull requests), GITHUB_API_URL (optional),
 * TEMPLATE_UPDATE_CAN_PUSH_WORKFLOWS=1 when the push token may change workflow files.
 */

export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<Response>

export interface UpdatePrOptions {
  brandRoot: string
  templateRoot: string
  /** owner/name of the brand repository. */
  repository: string
  token: string
  apiUrl?: string
  fetch?: FetchLike
  remote?: string
  /** Whether the push credential may change `.github/workflows/*` (the built-in GITHUB_TOKEN may not). */
  canPushWorkflows?: boolean
  log?: (line: string) => void
}

export interface Pull {
  number: number
  html_url: string
  head: { ref: string }
}

export type UpdatePrResult =
  | { code: 'current'; message: string }
  | { code: 'exists'; message: string; pull: Pull }
  | { code: 'opened'; message: string; pull: Pull; branch: string; superseded: number[] }
  | { code: 'blocked'; message: string }

const PREFIX = 'template-update/'

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

export function pullRequestBody(plan: UpdatePlan): string {
  const conflicts = plan.changes.filter((change) => change.action === 'conflict')
  const lines = [
    `Template \`${plan.repository ?? 'template'}\` ${plan.from.slice(0, 12)} -> ${plan.to.slice(0, 12)}${plan.version ? ` (version ${plan.version})` : ''}.`,
    '',
    'Opened by the **Template update** action. Brand-owned files (everything under `brand/` except the template version record) are not touched. Nothing is merged automatically: review the changes and merge this pull request yourself.',
  ]
  if (conflicts.length) {
    lines.push('', '### Needs a person (not changed)', ...conflicts.map((change) => `- \`${change.path}\`: ${change.reason}`))
  }
  lines.push('', '<details><summary>Plan</summary>', '', '```text', formatUpdatePlan(plan).replace(/\n\nDry run:.*$/s, ''), '```', '', '</details>')
  return lines.join('\n')
}

async function api<T>(options: UpdatePrOptions, method: string, route: string, body?: unknown): Promise<T> {
  const doFetch = options.fetch ?? (globalThis.fetch as unknown as FetchLike)
  const response = await doFetch(`${(options.apiUrl ?? 'https://api.github.com').replace(/\/$/, '')}${route}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${options.token}`,
      'x-github-api-version': '2022-11-28',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) {
    let message = text
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? text
    } catch {
      // keep the text
    }
    throw new Error(`GitHub ${method} ${route.split('?')[0]} answered ${response.status}: ${message}`)
  }
  return (text ? JSON.parse(text) : null) as T
}

async function openUpdatePulls(options: UpdatePrOptions): Promise<Pull[]> {
  const found: Pull[] = []
  for (let page = 1; page <= 10; page += 1) {
    const pulls = await api<Pull[]>(options, 'GET', `/repos/${options.repository}/pulls?state=open&per_page=100&page=${page}`)
    found.push(...pulls.filter((pull) => pull.head.ref.startsWith(PREFIX)))
    if (pulls.length < 100) break
  }
  return found
}

export async function runTemplateUpdatePr(options: UpdatePrOptions): Promise<UpdatePrResult> {
  const log = options.log ?? ((line: string) => console.log(line))
  const remote = options.remote ?? 'origin'
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repository)) throw new Error(`Invalid repository ${options.repository}.`)
  const templateRepository = readSyncManifest(options.brandRoot)?.template.repository
  if (templateRepository && templateRepository.toLowerCase() === options.repository.toLowerCase()) {
    return { code: 'current', message: `${options.repository} is the template itself; there is nothing to update.` }
  }

  const plan = planTemplateUpdate({ brandRoot: options.brandRoot, templateRoot: options.templateRoot })
  if (plan.upToDate) return { code: 'current', message: `Already on template commit ${plan.to.slice(0, 12)}. Nothing to do.` }
  const branch = defaultUpdateBranch(plan)

  const open = await openUpdatePulls(options)
  const same = open.find((pull) => pull.head.ref === branch)
  if (same) return { code: 'exists', message: `Update pull request #${same.number} already targets template commit ${plan.to.slice(0, 12)}: ${same.html_url}`, pull: same }

  const workflows = plan.changes.filter((change) => isWriteAction(change.action) && change.path.startsWith('.github/workflows/')).map((change) => change.path)
  if (workflows.length && !options.canPushWorkflows) {
    return {
      code: 'blocked',
      message: `This update changes workflow files (${workflows.join(', ')}). GitHub does not let the built-in token push workflow changes. Add the BRAND_OS_PR_TOKEN secret (see docs/template-update-action.md) or use Studio's Open update PR. Nothing was pushed.`,
    }
  }

  const remoteBranch = spawnSync('git', ['ls-remote', '--exit-code', '--heads', remote, branch], { cwd: options.brandRoot, encoding: 'utf8' })
  if (remoteBranch.status === 0) {
    return { code: 'blocked', message: `Branch ${branch} already exists in the repository but has no open pull request (perhaps it was closed on purpose). Delete the branch to get a new pull request. Nothing was pushed.` }
  }

  const start = git(options.brandRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const applied = applyTemplateUpdate(options.brandRoot, plan, { branch })
  try {
    if (!applied.commit) return { code: 'current', message: `Template commit ${plan.to.slice(0, 12)} changes nothing in this repository.` }
    // A normal push of a new branch: never the default branch, never --force.
    git(options.brandRoot, ['push', '--quiet', remote, `refs/heads/${branch}:refs/heads/${branch}`])
  } finally {
    git(options.brandRoot, ['checkout', '-q', start])
  }
  log(`Pushed ${branch} (${applied.written.length} file(s)).`)

  const repo = await api<{ default_branch: string }>(options, 'GET', `/repos/${options.repository}`)
  const title = `chore(template): update Brand OS template to ${plan.version ?? plan.to.slice(0, 12)}`
  const pull = await api<Pull>(options, 'POST', `/repos/${options.repository}/pulls`, { title, head: branch, base: repo.default_branch, body: pullRequestBody(plan), maintainer_can_modify: true })

  const superseded: number[] = []
  for (const old of open) {
    await api(options, 'POST', `/repos/${options.repository}/issues/${old.number}/comments`, {
      body: `Superseded by #${pull.number}, which updates to template commit ${plan.to.slice(0, 12)}. This pull request is closed so only one template update is open; its branch \`${old.head.ref}\` is kept.`,
    })
    await api(options, 'PATCH', `/repos/${options.repository}/pulls/${old.number}`, { state: 'closed' })
    superseded.push(old.number)
  }
  return {
    code: 'opened',
    message: `Opened template update pull request #${pull.number}: ${pull.html_url}${superseded.length ? ` (closed older #${superseded.join(', #')})` : ''}. It is never merged automatically.`,
    pull,
    branch,
    superseded,
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: { template: { type: 'string' }, repo: { type: 'string' }, remote: { type: 'string' } },
  })
  const repository = process.env.GITHUB_REPOSITORY ?? ''
  const token = process.env.GITHUB_TOKEN ?? ''
  if (!values.template || !repository || !token) {
    console.error('template-update-pr needs --template <template clone>, GITHUB_REPOSITORY and GITHUB_TOKEN. It is meant to run in the Template update GitHub Action; see docs/template-update-action.md.')
    process.exit(1)
  }
  const result = await runTemplateUpdatePr({
    brandRoot: path.resolve(values.repo ?? process.cwd()),
    templateRoot: path.resolve(values.template),
    repository,
    token,
    apiUrl: process.env.GITHUB_API_URL,
    remote: values.remote,
    canPushWorkflows: process.env.TEMPLATE_UPDATE_CAN_PUSH_WORKFLOWS === '1',
  })
  console.log(result.message)
  if (result.code === 'blocked') process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
