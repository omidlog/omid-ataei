import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { formatMigrationRuns, migrationFiles, MIGRATIONS_DIR, parseMigration, pendingMigrations, planMigrations, type MigrationRun } from './template-migrations.js'

/**
 * Template sync: bring template fixes into a brand repository without touching brand-owned files.
 *
 * - `.brand-os/sync.json` (the manifest) says which paths are core (template-owned), brand (never
 *   touched) or merge (merged line by line). The first matching rule decides; no match means brand.
 * - `brand/template-version.json` (the record) says which template commit the brand is on.
 * - `planTemplateUpdate` compares the recorded commit with a newer template commit in a local template
 *   clone and decides, per changed file, what to do. `applyTemplateUpdate` writes the plan on a new
 *   branch with one commit. Nothing here pushes, merges or uses the network.
 */

export const SYNC_MANIFEST_PATH = '.brand-os/sync.json'
export const TEMPLATE_RECORD_PATH = 'brand/template-version.json'

export type SyncKind = 'core' | 'brand' | 'merge'
export const SYNC_KINDS: readonly SyncKind[] = ['core', 'brand', 'merge']

export interface SyncRule {
  kind: SyncKind
  paths: string[]
}

export interface SyncManifest {
  schema_version: 1
  template: { repository: string | null }
  record: string
  rules: SyncRule[]
}

export interface TemplateRecord {
  schema_version: 1
  repository: string | null
  commit: string | null
  version: string | null
  recorded_at: string
  source: 'brand:init' | 'studio' | 'template:update' | string
}

// Manifest ------------------------------------------------------------------------------------

/** Turns a manifest glob into a RegExp. `**` crosses directories, `*` and `?` do not. */
export function globToRegExp(glob: string): RegExp {
  let out = ''
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i]!
    if (char === '*') {
      if (glob[i + 1] === '*') {
        // `**/` matches zero or more directories; a trailing `**` matches anything below.
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?'
          i += 2
        } else {
          out += '.*'
          i += 1
        }
      } else out += '[^/]*'
    } else if (char === '?') out += '[^/]'
    else out += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${out}$`)
}

export function parseSyncManifest(text: string): SyncManifest {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error(`${SYNC_MANIFEST_PATH} is not valid JSON.`)
  }
  const value = raw as Partial<SyncManifest> | null
  if (!value || value.schema_version !== 1) throw new Error(`${SYNC_MANIFEST_PATH} needs schema_version 1.`)
  if (!Array.isArray(value.rules)) throw new Error(`${SYNC_MANIFEST_PATH} needs a rules list.`)
  for (const [index, rule] of value.rules.entries()) {
    if (!rule || !SYNC_KINDS.includes(rule.kind)) throw new Error(`${SYNC_MANIFEST_PATH} rule ${index + 1} has an unknown kind.`)
    if (!Array.isArray(rule.paths) || !rule.paths.every((item) => typeof item === 'string' && item && !item.startsWith('/') && !item.split('/').includes('..'))) {
      throw new Error(`${SYNC_MANIFEST_PATH} rule ${index + 1} has an invalid path list.`)
    }
  }
  const record = typeof value.record === 'string' && value.record ? value.record : TEMPLATE_RECORD_PATH
  return {
    schema_version: 1,
    template: { repository: typeof value.template?.repository === 'string' ? value.template.repository : null },
    record,
    rules: value.rules.map((rule) => ({ kind: rule.kind, paths: [...rule.paths] })),
  }
}

export function readSyncManifest(root: string): SyncManifest | null {
  const file = path.join(root, SYNC_MANIFEST_PATH)
  return fs.existsSync(file) ? parseSyncManifest(fs.readFileSync(file, 'utf8')) : null
}

export interface Classification {
  kind: SyncKind
  /** False when no rule matched and the path fell back to brand. */
  matched: boolean
}

export function classifyPath(manifest: SyncManifest, relative: string): Classification {
  // The record is written by tools, never copied from the template.
  if (relative === manifest.record) return { kind: 'brand', matched: true }
  for (const rule of manifest.rules) {
    if (rule.paths.some((glob) => globToRegExp(glob).test(relative))) return { kind: rule.kind, matched: true }
  }
  return { kind: 'brand', matched: false }
}

// Record --------------------------------------------------------------------------------------

export function readTemplateRecord(root: string, record = TEMPLATE_RECORD_PATH): TemplateRecord | null {
  const file = path.join(root, record)
  if (!fs.existsSync(file)) return null
  const value = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<TemplateRecord> | null
  if (!value || value.schema_version !== 1) throw new Error(`${record} needs schema_version 1.`)
  const commit = typeof value.commit === 'string' && /^[0-9a-f]{7,64}$/.test(value.commit) ? value.commit : null
  return {
    schema_version: 1,
    repository: typeof value.repository === 'string' ? value.repository : null,
    commit,
    version: typeof value.version === 'string' ? value.version : null,
    recorded_at: typeof value.recorded_at === 'string' ? value.recorded_at : '',
    source: typeof value.source === 'string' ? value.source : 'unknown',
  }
}

export function templateRecordText(input: Omit<TemplateRecord, 'schema_version'>): string {
  const record: TemplateRecord = { schema_version: 1, ...input }
  return `${JSON.stringify(record, null, 2)}\n`
}

export function writeTemplateRecord(root: string, input: Omit<TemplateRecord, 'schema_version'>, record = TEMPLATE_RECORD_PATH): void {
  const file = path.join(root, record)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, templateRecordText(input))
}

// Git helpers ---------------------------------------------------------------------------------

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}

function gitBuffer(cwd: string, args: string[]): Buffer {
  return execFileSync('git', args, { cwd, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}

function resolveCommit(repo: string, ref: string): string | null {
  const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: repo, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : null
}

function showFile(repo: string, commit: string, relative: string): Buffer | null {
  const exists = spawnSync('git', ['cat-file', '-e', `${commit}:${relative}`], { cwd: repo })
  return exists.status === 0 ? gitBuffer(repo, ['show', `${commit}:${relative}`]) : null
}

function readLocal(root: string, relative: string): Buffer | null {
  const file = path.join(root, relative)
  return fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file) : null
}

function same(a: Buffer | null, b: Buffer | null): boolean {
  if (a === null || b === null) return a === b
  return a.equals(b)
}

/** Three-way line merge with `git merge-file`. Returns null on a conflict. */
function mergeThreeWay(local: Buffer, base: Buffer, theirs: Buffer): Buffer | null {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-merge-'))
  try {
    const files = { local: path.join(dir, 'local'), base: path.join(dir, 'base'), theirs: path.join(dir, 'theirs') }
    fs.writeFileSync(files.local, local)
    fs.writeFileSync(files.base, base)
    fs.writeFileSync(files.theirs, theirs)
    const result = spawnSync('git', ['merge-file', '-p', files.local, files.base, files.theirs], { maxBuffer: 256 * 1024 * 1024 })
    return result.status === 0 ? result.stdout : null
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// Plan ----------------------------------------------------------------------------------------

export type UpdateAction =
  | 'add' // core file new in the template
  | 'update' // core file the brand never edited
  | 'delete' // core file the template removed and the brand never edited
  | 'merge' // merge file merged cleanly
  | 'current' // the brand already has the template's version
  | 'skip' // brand-owned (or unmatched) path: never touched
  | 'conflict' // needs a person

export interface PlannedChange {
  path: string
  kind: SyncKind
  matched: boolean
  action: UpdateAction
  reason: string
  /** New content for add, update and merge. */
  content?: Buffer
}

export interface UpdatePlan {
  repository: string | null
  from: string
  to: string
  version: string | null
  changes: PlannedChange[]
  upToDate: boolean
  /** Versioned migrations run by this update (see template-migrations.ts), in order. */
  migrations?: MigrationRun[]
}

export interface PlanOptions {
  /** The brand repository (working tree). */
  brandRoot: string
  /** A local clone of the template repository. */
  templateRoot: string
  /** Template commit or ref to update to. Default HEAD. */
  to?: string
  /** Starting template commit when the brand has no record (or to override it). */
  base?: string
}

function templateVersion(templateRoot: string, commit: string): string | null {
  const pkg = showFile(templateRoot, commit, 'package.json')
  if (!pkg) return null
  try {
    const value = (JSON.parse(pkg.toString('utf8')) as { version?: unknown }).version
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

export interface ChangeSources {
  /** The manifest that decides (the target template's, else the brand's). */
  manifest: SyncManifest
  /** Paths the template changed between the two commits. */
  changed: string[]
  /** File at the starting template commit, or null. */
  base: (relative: string) => Buffer | null
  /** File at the target template commit, or null. */
  theirs: (relative: string) => Buffer | null
  /** The brand's current file, or null. Only called for core and merge paths, never for brand-owned ones. */
  local: (relative: string) => Buffer | null
}

/**
 * The per-file decision, independent of where the files come from. The CLI reads a local template
 * clone; Studio reads GitHub archives. Brand-owned paths are classified and skipped before any
 * brand content is read.
 */
export function planChanges(sources: ChangeSources): PlannedChange[] {
  const { manifest } = sources
  const changes: PlannedChange[] = []
  for (const relative of [...new Set(sources.changed)].sort()) {
    const { kind, matched } = classifyPath(manifest, relative)
    if (kind === 'brand') {
      changes.push({ path: relative, kind, matched, action: 'skip', reason: matched ? 'brand-owned' : 'no manifest rule; treated as brand-owned' })
      continue
    }
    const base = sources.base(relative)
    const theirs = sources.theirs(relative)
    const local = sources.local(relative)
    if (same(local, theirs)) {
      changes.push({ path: relative, kind, matched, action: 'current', reason: 'already matches the template' })
    } else if (same(local, base)) {
      if (theirs === null) changes.push({ path: relative, kind, matched, action: 'delete', reason: 'removed from the template' })
      else changes.push({ path: relative, kind, matched, action: base === null ? 'add' : 'update', reason: base === null ? 'new in the template' : 'changed in the template', content: theirs })
    } else if (kind === 'merge' && local && base && theirs) {
      const merged = mergeThreeWay(local, base, theirs)
      if (merged) changes.push({ path: relative, kind, matched, action: 'merge', reason: 'merged with the brand copy', content: merged })
      else changes.push({ path: relative, kind, matched, action: 'conflict', reason: 'the brand and the template changed the same lines' })
    } else {
      const why = local === null ? 'the brand removed this file' : base === null ? 'the brand already has a different file at this path' : 'the brand edited this file'
      changes.push({ path: relative, kind, matched, action: 'conflict', reason: `${why}; the template changed it too` })
    }
  }
  return changes
}

/** Paths an update writes (add, update, merge, delete). */
export function isWriteAction(action: UpdateAction): boolean {
  return action === 'add' || action === 'update' || action === 'merge' || action === 'delete'
}

export function planTemplateUpdate(options: PlanOptions): UpdatePlan {
  const { brandRoot, templateRoot } = options
  const localManifest = readSyncManifest(brandRoot)
  const recordPath = localManifest?.record ?? TEMPLATE_RECORD_PATH
  const record = readTemplateRecord(brandRoot, recordPath)
  const baseRef = options.base ?? record?.commit ?? null
  if (!baseRef) {
    throw new Error(`${recordPath} has no template commit. Pass --base <commit> with the template commit this brand was created from.`)
  }
  const from = resolveCommit(templateRoot, baseRef)
  if (!from) throw new Error(`The template clone does not contain commit ${baseRef}. Fetch the full history (not a shallow clone) and try again.`)
  const to = resolveCommit(templateRoot, options.to ?? 'HEAD')
  if (!to) throw new Error(`The template clone has no commit ${options.to ?? 'HEAD'}.`)

  // The target template's manifest decides, so a template can add new core paths.
  const targetManifestText = showFile(templateRoot, to, SYNC_MANIFEST_PATH)
  const manifest = targetManifestText ? parseSyncManifest(targetManifestText.toString('utf8')) : localManifest
  if (!manifest) throw new Error(`Neither the brand nor the template has ${SYNC_MANIFEST_PATH}.`)

  const changed = git(templateRoot, ['diff', '--name-only', '--no-renames', '-z', from, to])
    .split('\0')
    .filter(Boolean)
  const base = (relative: string) => showFile(templateRoot, from, relative)
  const theirs = (relative: string) => showFile(templateRoot, to, relative)
  const local = (relative: string) => readLocal(brandRoot, relative)
  const planned = planChanges({ manifest, changed, base, theirs, local })
  const listMigrations = (commit: string) => migrationFiles(git(templateRoot, ['ls-tree', '-r', '--name-only', '-z', commit, '--', MIGRATIONS_DIR]).split('\0').filter(Boolean))
  const pending = pendingMigrations(listMigrations(from), listMigrations(to)).map((name) => parseMigration(name, theirs(`${MIGRATIONS_DIR}/${name}`)!.toString('utf8'), manifest))
  const { changes, runs } = planMigrations(pending, planned, { base, theirs, local })
  return {
    repository: manifest.template.repository ?? record?.repository ?? null,
    from,
    to,
    version: templateVersion(templateRoot, to),
    changes,
    upToDate: from === to,
    migrations: runs,
  }
}

// Apply ---------------------------------------------------------------------------------------

export interface ApplyOptions {
  branch?: string
  now?: () => Date
}

export interface ApplyResult {
  branch: string
  commit: string | null
  written: string[]
}

export function defaultUpdateBranch(plan: UpdatePlan): string {
  return `template-update/${plan.to.slice(0, 12)}`
}

/**
 * Writes the plan on a new branch in the brand repository and commits it. Refuses a dirty working tree
 * or an existing branch. Conflicts are not written; the commit message lists them. Never pushes.
 */
export function applyTemplateUpdate(brandRoot: string, plan: UpdatePlan, options: ApplyOptions = {}): ApplyResult {
  const branch = options.branch ?? defaultUpdateBranch(plan)
  if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.includes('..') || branch.startsWith('-')) throw new Error(`Invalid branch name ${branch}.`)
  if (git(brandRoot, ['status', '--porcelain']).trim()) throw new Error('The brand repository has uncommitted changes. Commit or set them aside first.')
  if (resolveCommit(brandRoot, `refs/heads/${branch}`)) throw new Error(`Branch ${branch} already exists. Delete it or pass --branch.`)
  git(brandRoot, ['checkout', '-q', '-b', branch])

  const written: string[] = []
  for (const change of plan.changes) {
    if (!isWriteAction(change.action)) continue
    const file = path.join(brandRoot, change.path)
    if (change.action === 'delete') fs.rmSync(file, { force: true })
    else {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, change.content!)
    }
    written.push(change.path)
  }
  const manifest = readSyncManifest(brandRoot)
  const recordPath = manifest?.record ?? TEMPLATE_RECORD_PATH
  const previous = readTemplateRecord(brandRoot, recordPath)
  writeTemplateRecord(
    brandRoot,
    {
      repository: plan.repository ?? previous?.repository ?? null,
      commit: plan.to,
      version: plan.version,
      recorded_at: (options.now?.() ?? new Date()).toISOString(),
      source: 'template:update',
    },
    recordPath,
  )
  git(brandRoot, ['add', '-A', '--', ...written, recordPath])
  if (!git(brandRoot, ['diff', '--cached', '--name-only']).trim()) return { branch, commit: null, written }
  git(brandRoot, ['commit', '-q', '-m', updateCommitMessage(plan)])
  return { branch, commit: git(brandRoot, ['rev-parse', 'HEAD']).trim(), written }
}

export function updateCommitMessage(plan: UpdatePlan): string {
  const conflicts = plan.changes.filter((change) => change.action === 'conflict')
  const lines = [`chore(template): update Brand OS template to ${plan.version ?? plan.to.slice(0, 12)}`, '', `Template ${plan.from.slice(0, 12)} -> ${plan.to.slice(0, 12)}. Brand-owned files are not touched.`]
  if (conflicts.length) {
    lines.push('', 'Needs a person (not changed):')
    for (const change of conflicts) lines.push(`- ${change.path}: ${change.reason}`)
  }
  if (plan.migrations?.length) lines.push('', 'Migrations:', ...formatMigrationRuns(plan.migrations).map((line) => line.replaceAll('`', '')))
  return lines.join('\n')
}

// Summary -------------------------------------------------------------------------------------

const ORDER: readonly UpdateAction[] = ['add', 'update', 'merge', 'delete', 'conflict', 'skip', 'current']
const LABELS: Record<UpdateAction, string> = {
  add: 'Add (new core file)',
  update: 'Update (core file)',
  merge: 'Merge (shared file, merged cleanly)',
  delete: 'Delete (removed from the template)',
  conflict: 'Needs a person (not changed)',
  skip: 'Skipped (brand-owned)',
  current: 'Already current',
}

export function formatUpdatePlan(plan: UpdatePlan, applied?: ApplyResult): string {
  const lines = [`Template ${plan.repository ?? '(unknown repository)'}: ${plan.from.slice(0, 12)} -> ${plan.to.slice(0, 12)}${plan.version ? ` (version ${plan.version})` : ''}`]
  if (plan.upToDate) {
    lines.push('Already on this template commit. Nothing to do.')
    return lines.join('\n')
  }
  for (const action of ORDER) {
    const items = plan.changes.filter((change) => change.action === action)
    if (!items.length) continue
    lines.push('', `${LABELS[action]}: ${items.length}`)
    for (const item of items) lines.push(`  ${item.path}${action === 'conflict' || (action === 'skip' && !item.matched) ? ` (${item.reason})` : ''}`)
  }
  if (plan.migrations?.length) lines.push('', `Migrations: ${plan.migrations.length}`, ...formatMigrationRuns(plan.migrations).map((line) => `  ${line.slice(2).replaceAll('`', '')}`))
  lines.push('')
  if (applied) {
    lines.push(applied.commit ? `Committed ${applied.written.length} file(s) on branch ${applied.branch} (${applied.commit.slice(0, 12)}). Push it and open a pull request; nothing was pushed or merged.` : `Branch ${applied.branch} created; nothing to commit.`)
  } else {
    lines.push('Dry run: nothing was changed. Add --apply to write these changes on a new branch.')
  }
  return lines.join('\n')
}
