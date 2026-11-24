import { spawnSync } from 'node:child_process'
import { KnowledgeError } from './model.js'
import { safetyBlocksSharing, safetyReport, type SafetyReport } from './safety.js'
import { findNote, moveNote, type WriteResult } from './store.js'
import { noteFile, relativePath, type KnowledgeWorkspace } from './workspace.js'

/**
 * Sharing moves a local note to `brand/knowledge/shared/`, a tracked folder in the brand's private Git
 * repository. Studio shows it after the commit is merged into the default branch. Sharing is not
 * publication: no public docs build, public scan target or guest MCP tool reads `brand/knowledge`.
 *
 * Sharing fails closed unless the repository is confirmed private.
 */

export type Visibility = { state: 'private' | 'public' | 'unknown'; repository: string | null; detail: string }

/** Parses `owner/repo` from a GitHub remote URL (https or ssh). */
export function githubRepoFromRemote(url: string): string | null {
  const match = /github\.com[:/]+([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url.trim())
  return match ? `${match[1]}/${match[2]}` : null
}

/**
 * Determines the brand repository's visibility with the owner's own tools: the `origin` remote and, when
 * installed and signed in, the GitHub CLI. Brand OS never reads a token for this. Anything it cannot
 * establish is `unknown`, which blocks sharing. `BRAND_OS_KNOWLEDGE_GH=off` skips the GitHub CLI.
 */
export function detectVisibility(root: string, env: NodeJS.ProcessEnv = process.env): Visibility {
  const remote = spawnSync('git', ['-C', root, 'remote', 'get-url', 'origin'], { encoding: 'utf8', timeout: 5_000 })
  if (remote.status !== 0 || !remote.stdout.trim()) return { state: 'unknown', repository: null, detail: 'This checkout has no origin remote, so its visibility cannot be checked.' }
  const repository = githubRepoFromRemote(remote.stdout)
  if (!repository) return { state: 'unknown', repository: null, detail: 'The origin remote is not a GitHub repository.' }
  if (env.BRAND_OS_KNOWLEDGE_GH === 'off') return { state: 'unknown', repository, detail: 'The GitHub CLI check is turned off.' }
  const gh = spawnSync('gh', ['api', `repos/${repository}`, '--jq', '.visibility'], { encoding: 'utf8', timeout: 15_000 })
  if (gh.error || gh.status !== 0) return { state: 'unknown', repository, detail: 'The GitHub CLI is missing, signed out, or could not read the repository.' }
  const value = gh.stdout.trim()
  if (value === 'private' || value === 'internal') return { state: 'private', repository, detail: `GitHub reports ${repository} as ${value}.` }
  if (value === 'public') return { state: 'public', repository, detail: `GitHub reports ${repository} as public.` }
  return { state: 'unknown', repository, detail: 'GitHub returned an unexpected visibility.' }
}

/**
 * The owner may confirm privacy by hand when automatic detection is `unknown` (never when GitHub says public).
 * The confirmation must name the origin repository exactly.
 */
export function confirmVisibility(detected: Visibility, confirmed: string | undefined): Visibility {
  if (detected.state !== 'unknown' || !confirmed) return detected
  if (!detected.repository) return { ...detected, detail: `${detected.detail} Add the private GitHub repository as origin first; a confirmation needs a repository to name.` }
  if (confirmed !== detected.repository) return { ...detected, detail: `${detected.detail} --confirm-private named ${confirmed}, but origin is ${detected.repository}.` }
  return { state: 'private', repository: detected.repository, detail: `The owner confirmed ${detected.repository} is private.` }
}

export interface SharePreview {
  ok: boolean
  dry_run: boolean
  id: string
  from: string
  to: string
  revision: string
  visibility: Visibility
  safety: SafetyReport
  blocked: string[]
  /** The exact file content that would become tracked. */
  content: string
  warnings: string[]
  next_steps: string[]
  result?: WriteResult
}

const WARNINGS = [
  'After you commit it, this text is in Git history permanently, even if you later unshare or delete it, and even if the repository becomes public later.',
  'Shared is not published. The note stays an unapproved idea; it never enters public docs, public builds or guest MCP replies.',
  'Studio shows it only after the commit is merged into the default branch and Studio refreshes.',
]

export function shareNote(ws: KnowledgeWorkspace, id: string, opts: { visibility: Visibility; dryRun: boolean; expectedRevision?: string }): SharePreview {
  const loaded = findNote(ws, id, { includeRestricted: false })
  if (loaded.scope === 'shared') throw new KnowledgeError('refused', 'The note is already shared.')
  const blocked: string[] = []
  if (loaded.note.meta.classification !== 'internal') blocked.push('the note is not classified internal')
  const safety = safetyReport(`${loaded.note.meta.title}\n${loaded.note.body}\n${loaded.note.meta.source.ref ?? ''}`)
  blocked.push(...safetyBlocksSharing(safety))
  if (opts.visibility.state === 'public') blocked.push('the brand repository is public')
  else if (opts.visibility.state !== 'private') blocked.push(`the brand repository could not be confirmed private (${opts.visibility.detail})`)
  const to = relativePath(ws, noteFile(ws, 'shared', id))
  const preview: SharePreview = {
    ok: blocked.length === 0,
    dry_run: opts.dryRun,
    id,
    from: loaded.path,
    to,
    revision: loaded.revision,
    visibility: opts.visibility,
    safety,
    blocked,
    content: loaded.raw,
    warnings: WARNINGS,
    next_steps: blocked.length
      ? opts.visibility.state === 'unknown'
        ? ['Check the repository on GitHub. If it is private, re-run with --confirm-private <owner/repo> (the origin repository).']
        : ['Nothing was shared. Edit the note to remove what is blocked, or keep it local.']
      : opts.dryRun
        ? [`Re-run without --dry-run and with --expected-revision ${loaded.revision} to share exactly this text.`]
        : [`git add ${to}`, 'Commit on a branch and open a pull request. Studio shows the note after the merge.'],
  }
  if (!preview.ok || opts.dryRun) return preview
  if (!opts.expectedRevision) throw new KnowledgeError('invalid_input', `Sharing needs --expected-revision (from the dry run): ${loaded.revision}.`)
  preview.result = moveNote(ws, loaded, 'shared', opts.expectedRevision)
  return preview
}

/** Moves a shared note back to local. Git history keeps what was committed. */
export function unshareNote(ws: KnowledgeWorkspace, id: string, opts: { expectedRevision: string }): WriteResult & { warning: string } {
  const loaded = findNote(ws, id, { scopes: ['shared'] })
  const result = moveNote(ws, loaded, 'local', opts.expectedRevision)
  return { ...result, warning: 'The note is local again. Earlier commits still contain it; commit the removal so Studio stops showing it after the merge.' }
}
