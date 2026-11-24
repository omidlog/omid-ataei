import fs from 'node:fs'
import path from 'node:path'
import { NOTE_SCHEMA_VERSION, outboundLinks, serializeNote, type NoteScope } from './model.js'
import { credentialFindings } from './safety.js'
import { buildIndex, readCache } from './search.js'
import { knownQuestionIds, scanAll, scanScope, type LoadedNote } from './store.js'
import { dirOf, dirUsable, relativePath, restrictedKeyAvailable, safeRead, withLock, writeVaultFile, type KnowledgeWorkspace } from './workspace.js'

/**
 * Knowledge diagnostics. Messages name files, ids and field names only: never note text, so running doctor
 * on a brand with restricted or sensitive notes reveals nothing.
 */
export interface KnowledgeIssue {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
  path?: string
  id?: string
}

export interface KnowledgeDoctorReport {
  ok: boolean
  brand_slug: string
  notes: { local: number; shared: number; restricted: number; restricted_locked: boolean }
  issues: KnowledgeIssue[]
}

function mode(file: string): number | null {
  try {
    return fs.lstatSync(file).mode & 0o777
  } catch {
    return null
  }
}

function walkTracked(ws: KnowledgeWorkspace, issues: KnowledgeIssue[]): void {
  const base = path.join(ws.root, 'brand', 'knowledge')
  if (!fs.existsSync(base) && !isLink(base)) return
  const visit = (dir: string, depth: number): void => {
    if (depth > 6) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      const rel = relativePath(ws, full)
      if (entry.isSymbolicLink()) {
        issues.push({ severity: 'error', code: 'symlink', path: rel, message: 'A symlink under brand/knowledge. Remove it; the store never follows links.' })
        continue
      }
      if (entry.isDirectory()) {
        if (rel !== 'brand/knowledge/shared') issues.push({ severity: 'warning', code: 'untracked_layout', path: rel, message: 'Only brand/knowledge/shared is read. Studio ignores everything else under brand/knowledge, but it is still in Git if committed.' })
        visit(full, depth + 1)
        continue
      }
      if (!rel.startsWith('brand/knowledge/shared/')) {
        issues.push({ severity: 'warning', code: 'stray_file', path: rel, message: 'A file outside brand/knowledge/shared. It is not a note and Studio ignores it.' })
      } else if (entry.isFile()) {
        try {
          if (fs.lstatSync(full).nlink > 1) issues.push({ severity: 'error', code: 'hard_link', path: rel, message: 'A hard-linked file in the shared folder. It is refused.' })
        } catch {
          // gone
        }
      }
    }
  }
  if (isLink(base)) {
    issues.push({ severity: 'error', code: 'symlink', path: 'brand/knowledge', message: 'brand/knowledge is a symlink. Refusing to use it.' })
    return
  }
  visit(base, 0)
}

function isLink(file: string): boolean {
  try {
    return fs.lstatSync(file).isSymbolicLink()
  } catch {
    return false
  }
}

export function knowledgeDoctor(ws: KnowledgeWorkspace, extra: (notes: LoadedNote[]) => KnowledgeIssue[] = () => []): KnowledgeDoctorReport {
  const issues: KnowledgeIssue[] = []
  const decrypt = restrictedKeyAvailable()
  const scan = scanAll(ws, ['local', 'shared', 'restricted'], { decrypt })
  for (const problem of scan.problems) {
    const severity: KnowledgeIssue['severity'] = problem.code === 'filename_mismatch' || problem.code === 'leftover_temp' || problem.code === 'unexpected_file' ? 'warning' : 'error'
    issues.push({ severity, code: problem.code, path: problem.path, id: problem.id, message: problem.message })
  }
  // Duplicate ids across scopes and files.
  const byId = new Map<string, LoadedNote[]>()
  for (const note of scan.notes) byId.set(note.id, [...(byId.get(note.id) ?? []), note])
  for (const [id, copies] of byId) {
    if (copies.length > 1) issues.push({ severity: 'error', code: 'duplicate_id', id, message: `The same id is used by ${copies.map((note) => note.path).join(', ')}. Keep one; edits are refused until then.` })
  }
  const questions = knownQuestionIds(ws)
  for (const note of scan.notes) {
    const meta = note.note.meta
    for (const issue of note.note.issues) issues.push({ severity: 'warning', code: 'metadata', path: note.path, id: note.id, message: `${issue}. brand:knowledge migrate --apply fills safe defaults.` })
    for (const link of outboundLinks(note.note)) {
      if (!byId.has(link.id) && !fs.existsSync(path.join(dirOf(ws, 'restricted'), `${link.id}.enc`))) {
        issues.push({ severity: 'warning', code: 'broken_link', path: note.path, id: note.id, message: `Links to ${link.id}, which does not exist.` })
      }
    }
    for (const q of meta.question_ids) if (!questions.has(q)) issues.push({ severity: 'warning', code: 'unknown_question', path: note.path, id: note.id, message: `Question id ${q} is not in the question bank.` })
    if (note.scope === 'shared') {
      if (meta.classification !== 'internal') issues.push({ severity: 'error', code: 'restricted_in_git', path: note.path, id: note.id, message: 'A shared note is classified restricted. Move it out of Git; Studio withholds it.' })
      const found = credentialFindings(note.raw)
      if (found.length) issues.push({ severity: 'error', code: 'credential_in_git', path: note.path, id: note.id, message: `A shared note looks like it contains ${found.join(', ')}. Remove it and rotate the credential.` })
    }
    if (note.scope === 'local' && meta.classification === 'restricted') issues.push({ severity: 'error', code: 'restricted_plaintext', path: note.path, id: note.id, message: 'A plain-text note is classified restricted. Re-capture it with --classification restricted and remove this file.' })
  }
  walkTracked(ws, issues)
  // Private permissions.
  const privateRoot = dirOf(ws, 'privateRoot')
  try {
    if (dirUsable(ws, privateRoot)) {
      for (const key of ['privateRoot', 'local', 'restricted', 'revisions'] as const) {
        const dir = dirOf(ws, key)
        const m = mode(dir)
        if (m !== null && (m & 0o077) !== 0) issues.push({ severity: 'warning', code: 'permissions', path: relativePath(ws, dir), message: `Directory mode is ${m.toString(8)}; expected 700.` })
      }
      for (const scope of ['local', 'restricted'] as NoteScope[]) {
        const dir = dirOf(ws, scope)
        if (!fs.existsSync(dir)) continue
        for (const name of fs.readdirSync(dir)) {
          const m = mode(path.join(dir, name))
          if (m !== null && (m & 0o077) !== 0) issues.push({ severity: 'warning', code: 'permissions', path: relativePath(ws, path.join(dir, name)), message: `File mode is ${m.toString(8)}; expected 600.` })
        }
      }
    }
  } catch {
    issues.push({ severity: 'error', code: 'symlink', path: relativePath(ws, privateRoot), message: 'A private knowledge directory is a symlink.' })
  }
  // .gitignore must keep brand/.private out of Git.
  const gitignore = path.join(ws.root, '.gitignore')
  if (!fs.existsSync(gitignore) || !fs.readFileSync(gitignore, 'utf8').split('\n').some((line) => line.trim() === 'brand/.private/' || line.trim() === 'brand/.private')) {
    issues.push({ severity: 'error', code: 'gitignore', path: '.gitignore', message: 'brand/.private/ is not in .gitignore, so local notes could be committed. Run brand:migrate.' })
  }
  // Cache health: corrupt or stale entries are reported, then rebuilt.
  const { cache, corrupt } = readCache(ws)
  if (corrupt) issues.push({ severity: 'warning', code: 'cache_corrupt', path: 'brand/.private/knowledge/cache/index.json', message: 'The search cache is corrupt. It was rebuilt; notes are unaffected.' })
  else if (cache) {
    const current = new Map(scan.notes.filter((note) => note.scope !== 'restricted').map((note) => [note.path, note.revision]))
    const stale = Object.entries(cache.entries).filter(([file, entry]) => current.get(file) !== entry.revision).length + [...current.keys()].filter((file) => !cache.entries[file]).length
    if (stale > 0) issues.push({ severity: 'info', code: 'cache_stale', message: `${stale} cache entr${stale === 1 ? 'y was' : 'ies were'} stale. It was rebuilt.` })
  }
  buildIndex(ws)
  if (scan.restricted_locked > 0) issues.push({ severity: 'info', code: 'key_required', message: `${scan.restricted_locked} restricted note(s) were not checked because BRAND_OS_DATA_KEY is not set.` })
  issues.push(...extra(scan.notes))
  const counts = { local: 0, shared: 0, restricted: scan.restricted_locked, restricted_locked: scan.restricted_locked > 0 }
  for (const note of scan.notes) counts[note.scope] += 1
  return { ok: !issues.some((issue) => issue.severity === 'error'), brand_slug: ws.brandSlug, notes: counts, issues }
}

/**
 * Fills missing metadata with safe defaults (brand_slug, schema_version, kind, status, timestamps). Idempotent:
 * a second run changes nothing. Restricted notes are left alone. Dry run unless `apply`.
 */
export function migrateNotes(ws: KnowledgeWorkspace, opts: { apply: boolean }): { apply: boolean; changed: string[]; unchanged: number } {
  const changed: string[] = []
  let unchanged = 0
  for (const scope of ['local', 'shared'] as const) {
    for (const note of scanScope(ws, scope).notes) {
      const meta = { ...note.note.meta, brand_slug: note.note.meta.brand_slug || ws.brandSlug, schema_version: NOTE_SCHEMA_VERSION }
      const text = serializeNote({ meta, body: note.note.body, extra: note.note.extra })
      if (text === note.raw) {
        unchanged += 1
        continue
      }
      changed.push(note.path)
      if (opts.apply) {
        withLock(ws, note.id, () => {
          const again = safeRead(note.file)
          if (again && again.toString('utf8') === note.raw) writeVaultFile(ws, note.file, text, scope === 'local')
        })
      }
    }
  }
  return { apply: opts.apply, changed, unchanged }
}
