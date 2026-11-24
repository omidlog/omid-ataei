import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { dataKey } from '../private-store.js'
import { writeAtomic } from '../fsutil.js'
import { isNoteId, KNOWLEDGE_LIMITS, KnowledgeError, type NoteScope } from './model.js'

/**
 * One brand's knowledge workspace. Every path is derived from the brand root and a validated note id; no
 * caller-supplied path is ever joined. Directories are created lazily, so a brand without `brand/knowledge`
 * (for example one created before this feature, which template sync never updates under `brand/**`) works
 * with zero notes and no configuration flag.
 */
export interface KnowledgeWorkspace {
  root: string
  brandSlug: string
  now: () => Date
}

export function openWorkspace(root: string, opts: { now?: () => Date } = {}): KnowledgeWorkspace {
  const configFile = path.join(root, 'brand', 'brand.config.yaml')
  let slug: unknown
  try {
    slug = (parse(fs.readFileSync(configFile, 'utf8')) as { brand?: { slug?: unknown } } | null)?.brand?.slug
  } catch {
    throw new KnowledgeError('not_a_brand', 'This folder is not a Brand OS brand (brand/brand.config.yaml is missing or unreadable).')
  }
  if (typeof slug !== 'string' || !slug) throw new KnowledgeError('not_a_brand', 'brand/brand.config.yaml has no brand.slug.')
  return { root: path.resolve(root), brandSlug: slug, now: opts.now ?? (() => new Date()) }
}

/** Relative directories, in POSIX form. */
export const KNOWLEDGE_DIRS = {
  shared: 'brand/knowledge/shared',
  local: 'brand/.private/knowledge/local',
  restricted: 'brand/.private/knowledge/restricted',
  revisions: 'brand/.private/knowledge/revisions',
  locks: 'brand/.private/knowledge/locks',
  cache: 'brand/.private/knowledge/cache',
  privateRoot: 'brand/.private/knowledge',
} as const

const PRIVATE_DIR_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600

export function dirOf(ws: KnowledgeWorkspace, key: keyof typeof KNOWLEDGE_DIRS): string {
  return path.join(ws.root, ...KNOWLEDGE_DIRS[key].split('/'))
}

export function isPrivateScope(scope: NoteScope): boolean {
  return scope !== 'shared'
}

export function scopeDir(ws: KnowledgeWorkspace, scope: NoteScope): string {
  return dirOf(ws, scope)
}

export function noteFile(ws: KnowledgeWorkspace, scope: NoteScope, id: string): string {
  assertId(id)
  return path.join(scopeDir(ws, scope), scope === 'restricted' ? `${id}.enc` : `${id}.md`)
}

export function assertId(id: unknown): asserts id is string {
  if (!isNoteId(id)) throw new KnowledgeError('invalid_id', 'Not a note id. Ids look like kn_550e8400-e29b-41d4-a716-446655440000.')
}

export function relativePath(ws: KnowledgeWorkspace, file: string): string {
  return path.relative(ws.root, file).split(path.sep).join('/')
}

/**
 * Walks from `brand/` to `dir`, refusing a symlinked or non-directory segment, and creates missing segments.
 * Private directories get 0700.
 */
export function ensureDir(ws: KnowledgeWorkspace, dir: string): void {
  const brand = path.join(ws.root, 'brand')
  const relative = path.relative(brand, dir)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new KnowledgeError('unsafe_path', 'Refusing a knowledge directory outside brand/.')
  const isPrivate = relative.split(path.sep)[0] === '.private'
  let current = brand
  assertRealDir(current)
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    if (fs.existsSync(current) || isDanglingLink(current)) assertRealDir(current)
    else fs.mkdirSync(current, { mode: isPrivate ? PRIVATE_DIR_MODE : 0o755 })
  }
}

function isDanglingLink(file: string): boolean {
  try {
    fs.lstatSync(file)
    return true
  } catch {
    return false
  }
}

function assertRealDir(dir: string): void {
  const stat = fs.lstatSync(dir)
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new KnowledgeError('unsafe_path', `${path.basename(dir)} is a symlink or not a directory. Refusing to use it.`)
}

/** True when every segment from brand/ to `dir` exists and is a real directory. False when absent. Throws on a symlink. */
export function dirUsable(ws: KnowledgeWorkspace, dir: string): boolean {
  const brand = path.join(ws.root, 'brand')
  let current = brand
  if (!fs.existsSync(current)) return false
  assertRealDir(current)
  for (const segment of path.relative(brand, dir).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    if (!fs.existsSync(current) && !isDanglingLink(current)) return false
    assertRealDir(current)
  }
  return true
}

/**
 * Reads one file inside the vault without following a symlink, refusing hard links (a second name for a file
 * elsewhere), non-regular files and oversized files. Returns null when the file does not exist.
 */
export function safeRead(file: string, maxBytes: number = KNOWLEDGE_LIMITS.maxNoteBytes): Buffer | null {
  let fd: number
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0))
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return null
    if (code === 'ELOOP' || code === 'EMLINK') throw new KnowledgeError('unsafe_path', `${path.basename(file)} is a symlink. Refusing to read it.`)
    throw error
  }
  try {
    const stat = fs.fstatSync(fd)
    if (!stat.isFile()) throw new KnowledgeError('unsafe_path', `${path.basename(file)} is not a regular file.`)
    if (stat.nlink > 1) throw new KnowledgeError('unsafe_path', `${path.basename(file)} has more than one hard link. Refusing to read it.`)
    if (stat.size > maxBytes) throw new KnowledgeError('too_large', `${path.basename(file)} is larger than ${maxBytes} bytes.`)
    return fs.readFileSync(fd)
  } finally {
    fs.closeSync(fd)
  }
}

export function writeVaultFile(ws: KnowledgeWorkspace, file: string, contents: string | Buffer, isPrivate: boolean): void {
  ensureDir(ws, path.dirname(file))
  writeAtomic(file, contents, isPrivate ? { mode: PRIVATE_FILE_MODE } : {})
}

// ---- per-note lock ---------------------------------------------------------------------------------

const LOCK_STALE_MS = 30_000
const LOCK_WAIT_MS = 5_000

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * A lock file created with O_EXCL serializes read-check-write on one note across processes, so two writers
 * with the same expected revision cannot both succeed. A lock left by a dead process or older than 30 s is
 * broken.
 */
export function withLock<T>(ws: KnowledgeWorkspace, name: string, run: () => T): T {
  if (!/^[a-z0-9_-]{1,80}$/.test(name)) throw new KnowledgeError('invalid_input', 'Bad lock name.')
  const dir = dirOf(ws, 'locks')
  ensureDir(ws, dir)
  const file = path.join(dir, `${name}.lock`)
  const deadline = Date.now() + LOCK_WAIT_MS
  let fd: number | null = null
  while (fd === null) {
    try {
      fd = fs.openSync(file, 'wx', PRIVATE_FILE_MODE)
      fs.writeSync(fd, `${process.pid} ${Date.now()}\n`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      try {
        const [pidText, atText] = fs.readFileSync(file, 'utf8').trim().split(' ')
        const pid = Number(pidText)
        const at = Number(atText)
        if ((Number.isInteger(pid) && pid > 0 && !processAlive(pid)) || (Number.isFinite(at) && Date.now() - at > LOCK_STALE_MS)) {
          fs.rmSync(file, { force: true })
          continue
        }
      } catch {
        // Lock vanished or is half-written; retry.
      }
      if (Date.now() > deadline) throw new KnowledgeError('locked', 'Another process is changing this note. Try again.')
      sleepSync(15 + Math.floor(Math.random() * 20))
    }
  }
  try {
    return run()
  } finally {
    fs.closeSync(fd)
    fs.rmSync(file, { force: true })
  }
}

// ---- restricted notes: encryption ------------------------------------------------------------------

const RESTRICTED_FORMAT = 'brand-os-knowledge-restricted/1'

/**
 * Restricted notes are encrypted with AES-256-GCM. The key is derived from BRAND_OS_DATA_KEY with HKDF and a
 * knowledge-specific label, so it is never the same key the answer store or backups use. The note id is the
 * additional authenticated data: a ciphertext copied under another id fails to decrypt. Without the env key
 * nothing restricted is written or read (fail closed).
 */
function restrictedKey(): Buffer {
  let base: Buffer
  try {
    base = dataKey()
  } catch (error) {
    throw new KnowledgeError('key_required', `${(error as Error).message} Restricted notes are encrypted with it.`)
  }
  return Buffer.from(crypto.hkdfSync('sha256', base, Buffer.from('brand-os/knowledge'), Buffer.from('restricted-notes/v1'), 32))
}

export function restrictedKeyAvailable(): boolean {
  try {
    restrictedKey()
    return true
  } catch {
    return false
  }
}

export function encryptNote(id: string, plain: Buffer, purpose: 'note' | 'snapshot' = 'note'): Buffer {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', restrictedKey(), iv)
  cipher.setAAD(Buffer.from(`${purpose}:${id}`, 'utf8'))
  const data = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.from(`${JSON.stringify({ format: RESTRICTED_FORMAT, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') })}\n`, 'utf8')
}

export function decryptNote(id: string, sealed: Buffer, purpose: 'note' | 'snapshot' = 'note'): Buffer {
  let doc: { format?: unknown; iv?: unknown; tag?: unknown; data?: unknown }
  try {
    doc = JSON.parse(sealed.toString('utf8')) as typeof doc
  } catch {
    throw new KnowledgeError('invalid_note', 'The restricted note file is corrupt.')
  }
  if (doc.format !== RESTRICTED_FORMAT || typeof doc.iv !== 'string' || typeof doc.tag !== 'string' || typeof doc.data !== 'string') {
    throw new KnowledgeError('invalid_note', 'The restricted note file has an unknown format.')
  }
  const key = restrictedKey()
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(doc.iv, 'base64'))
    decipher.setAAD(Buffer.from(`${purpose}:${id}`, 'utf8'))
    decipher.setAuthTag(Buffer.from(doc.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(doc.data, 'base64')), decipher.final()])
  } catch {
    throw new KnowledgeError('invalid_note', 'The restricted note could not be decrypted (wrong key, wrong id, or tampered file).')
  }
}
