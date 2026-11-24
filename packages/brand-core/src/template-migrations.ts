import crypto from 'node:crypto'
import { classifyPath, type PlannedChange, type SyncManifest } from './template-sync.js'

/**
 * Versioned template migrations (template sync, chunk 4).
 *
 * A migration is a JSON file `.brand-os/migrations/<NNNN>-<name>.json` in the template. It is data,
 * never code, so Studio can run it on files downloaded from GitHub without executing anything.
 *
 * - **Ordered**: by the four-digit number in the file name.
 * - **Which run**: the ones present at the target template commit and absent at the brand's recorded
 *   commit, so each runs once per brand; running one again finds nothing to do (idempotent).
 * - **Core files only**: every path must be a core path in the target manifest. A migration that names a
 *   brand-owned, shared (merge) or unmatched path is refused and the update stops; brand files are never
 *   read or written.
 * - **Operations**: `delete` removes a core file the template no longer ships. It removes only a copy the
 *   brand never edited: one that equals the template file at the starting or target commit, or whose
 *   SHA-256 is listed in the operation. Any other copy is reported as needing a person.
 *
 * Example:
 *
 *   { "schema_version": 1, "version": "0.3.0", "description": "Remove the old build script.",
 *     "operations": [{ "op": "delete", "path": "scripts/old-build.ts", "sha256": ["…"] }] }
 */
export const MIGRATIONS_DIR = '.brand-os/migrations'
const FILE_RE = /^(\d{4})-[a-z0-9][a-z0-9-]*\.json$/

export interface DeleteOperation {
  op: 'delete'
  path: string
  /** SHA-256 (hex) of earlier template versions that may be removed safely. */
  sha256: string[]
}

export type MigrationOperation = DeleteOperation

export interface Migration {
  /** File name without `.json`, e.g. `0001-remove-old-build`. */
  id: string
  version: string | null
  description: string
  operations: MigrationOperation[]
}

export interface MigrationRun {
  id: string
  version: string | null
  description: string
  /** applied: changed at least one file; done: nothing left to do; needs_person: a copy was edited. */
  result: 'applied' | 'done' | 'needs_person'
  paths: string[]
}

/** Migration file names (`NNNN-name.json`) from a list of repository paths, in run order. */
export function migrationFiles(paths: Iterable<string>): string[] {
  const out: string[] = []
  for (const relative of paths) {
    if (!relative.startsWith(`${MIGRATIONS_DIR}/`)) continue
    const name = relative.slice(MIGRATIONS_DIR.length + 1)
    if (FILE_RE.test(name)) out.push(name)
  }
  return [...new Set(out)].sort()
}

/** Migrations to run: present at the target, absent at the base, in order. */
export function pendingMigrations(baseNames: Iterable<string>, targetNames: Iterable<string>): string[] {
  const base = new Set(baseNames)
  return [...new Set(targetNames)].filter((name) => !base.has(name)).sort()
}

function safePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 300 && !value.startsWith('/') && !value.includes('\\') && !value.split('/').some((part) => part === '..' || part === '.' || part === '')
}

/** Parses and checks one migration. Throws when it is malformed or names anything but a core path. */
export function parseMigration(name: string, text: string, manifest: SyncManifest): Migration {
  if (!FILE_RE.test(name)) throw new Error(`${MIGRATIONS_DIR}/${name}: the file name must look like 0001-short-name.json.`)
  const where = `${MIGRATIONS_DIR}/${name}`
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error(`${where} is not valid JSON.`)
  }
  const value = raw as { schema_version?: unknown; version?: unknown; description?: unknown; operations?: unknown } | null
  if (!value || value.schema_version !== 1) throw new Error(`${where} needs schema_version 1.`)
  if (typeof value.description !== 'string' || !value.description.trim()) throw new Error(`${where} needs a description.`)
  if (!Array.isArray(value.operations) || value.operations.length === 0) throw new Error(`${where} needs a list of operations.`)
  const operations: MigrationOperation[] = []
  for (const [index, op] of (value.operations as Array<Record<string, unknown> | null>).entries()) {
    if (!op || op.op !== 'delete') throw new Error(`${where} operation ${index + 1}: only "delete" is supported.`)
    if (!safePath(op.path)) throw new Error(`${where} operation ${index + 1} has an invalid path.`)
    const { kind } = classifyPath(manifest, op.path)
    if (kind !== 'core') throw new Error(`${where} operation ${index + 1} names ${op.path}, which is not a core file. Migrations never touch brand-owned or shared files.`)
    const hashes = op.sha256 === undefined ? [] : op.sha256
    if (!Array.isArray(hashes) || !hashes.every((hash) => typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash))) throw new Error(`${where} operation ${index + 1} has an invalid sha256 list.`)
    operations.push({ op: 'delete', path: op.path, sha256: [...(hashes as string[])] })
  }
  return {
    id: name.replace(/\.json$/, ''),
    version: typeof value.version === 'string' ? value.version.slice(0, 40) : null,
    description: value.description.trim().slice(0, 500),
    operations,
  }
}

/** Every path a set of migrations may touch (core only), so a caller can fetch the brand's copies. */
export function migrationPaths(migrations: Migration[]): string[] {
  return [...new Set(migrations.flatMap((migration) => migration.operations.map((op) => op.path)))]
}

export interface MigrationSources {
  /** File at the starting template commit. */
  base: (relative: string) => Buffer | null
  /** File at the target template commit. */
  theirs: (relative: string) => Buffer | null
  /** The brand's current file. Only called for the core paths a migration names. */
  local: (relative: string) => Buffer | null
}

const sha256 = (data: Buffer): string => crypto.createHash('sha256').update(data).digest('hex')

/**
 * Runs migrations on top of an update plan, in order, and returns the plan's changes with the
 * migrations' own changes appended. A path the update already decides is left to the update.
 */
export function planMigrations(migrations: Migration[], changes: PlannedChange[], sources: MigrationSources): { changes: PlannedChange[]; runs: MigrationRun[] } {
  const out = [...changes]
  const decided = new Map(out.map((change) => [change.path, change]))
  const runs: MigrationRun[] = []
  for (const migration of migrations) {
    const run: MigrationRun = { id: migration.id, version: migration.version, description: migration.description, result: 'done', paths: [] }
    for (const op of migration.operations) {
      const earlier = decided.get(op.path)
      if (earlier) continue
      const local = sources.local(op.path)
      if (local === null) continue
      const known = [sources.base(op.path), sources.theirs(op.path)].some((copy) => copy !== null && copy.equals(local)) || op.sha256.includes(sha256(local))
      const change: PlannedChange = known
        ? { path: op.path, kind: 'core', matched: true, action: 'delete', reason: `migration ${migration.id}` }
        : { path: op.path, kind: 'core', matched: true, action: 'conflict', reason: `migration ${migration.id} removes this file, but the brand's copy was edited; remove it by hand` }
      out.push(change)
      decided.set(op.path, change)
      run.paths.push(op.path)
      if (!known) run.result = 'needs_person'
      else if (run.result === 'done') run.result = 'applied'
    }
    runs.push(run)
  }
  return { changes: out, runs }
}

const RESULT_LABEL: Record<MigrationRun['result'], string> = { applied: 'applied', done: 'nothing to do', needs_person: 'needs a person' }

/** Markdown/plain list of migration runs for a pull request body, commit message or CLI output. */
export function formatMigrationRuns(runs: MigrationRun[]): string[] {
  return runs.map((run) => `- \`${run.id}\`${run.version ? ` (${run.version})` : ''}: ${run.description} (${RESULT_LABEL[run.result]}${run.paths.length ? `: ${run.paths.join(', ')}` : ''})`)
}
