import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { approvalSecretPath } from './private-store.js'

/**
 * One resolver for the owner's approval proof, used by every command that takes it (BOS-01).
 *
 * Order: `BRAND_OS_APPROVAL_PROOF` → piped stdin → macOS Keychain (only on macOS, only when the owner stored an entry
 * with `brand:doctor --store-proof-keychain`) → hidden prompt. Never argv. The Keychain is never consulted while
 * `BRAND_OS_AGENT_TOKEN` is set, so an agent session cannot borrow the owner's stored proof. A resolved proof is still
 * checked against `brand/.private/approval-secret` by the caller; this module only finds a candidate.
 *
 * The Keychain is reached through an injectable runner so tests never touch a real Keychain. The secret is passed to
 * `security` on stdin (interactive mode), never on argv, and it is never printed.
 */

export const KEYCHAIN_SERVICE = 'brand-os-approval'
/** Set to `off` to stop the resolver from reading the Keychain (for example in CI or tests). */
export const KEYCHAIN_ENV = 'BRAND_OS_KEYCHAIN'

export interface KeychainRun {
  status: number | null
  stdout: string
}

/** Runs `security <args>`, optionally with text on stdin. Replace it in tests. */
export type KeychainRunner = (args: string[], stdin?: string) => KeychainRun

export const systemKeychainRunner: KeychainRunner = (args, stdin) => {
  const run = spawnSync('security', args, { input: stdin ?? '', encoding: 'utf8', timeout: 15_000, stdio: ['pipe', 'pipe', 'pipe'] })
  return { status: run.error ? null : run.status, stdout: run.stdout ?? '' }
}

export interface KeychainOptions {
  runner?: KeychainRunner
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
}

export function keychainAvailable(options: KeychainOptions = {}): boolean {
  const env = options.env ?? process.env
  return (options.platform ?? process.platform) === 'darwin' && env[KEYCHAIN_ENV] !== 'off'
}

/** The stored proof for this brand, or undefined when there is no entry, no macOS, or an agent token is set. */
export function readKeychainProof(slug: string, options: KeychainOptions = {}): string | undefined {
  const env = options.env ?? process.env
  if (env.BRAND_OS_AGENT_TOKEN) return undefined
  if (!keychainAvailable(options)) return undefined
  const run = (options.runner ?? systemKeychainRunner)(['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', slug, '-w'])
  if (run.status !== 0) return undefined
  return run.stdout.split(/\r?\n/)[0]?.trim() || undefined
}

export type KeychainStoreOutcome = 'stored' | 'removed' | 'not_found' | 'unsupported' | 'refused' | 'no_secret' | 'failed'

export interface KeychainStoreResult {
  ok: boolean
  outcome: KeychainStoreOutcome
  message: string
}

const SAFE_SECRET = /^[A-Za-z0-9+/=._-]{8,512}$/

/**
 * Store `brand/.private/approval-secret` in the login Keychain (service `brand-os-approval`, account = brand slug).
 * The value goes to `security -i` on stdin, never on argv, and is never printed. Refused under an agent token.
 */
export function storeKeychainProof(root: string, slug: string, options: KeychainOptions = {}): KeychainStoreResult {
  const env = options.env ?? process.env
  if (env.BRAND_OS_AGENT_TOKEN) return { ok: false, outcome: 'refused', message: 'Refusing to store the approval proof while BRAND_OS_AGENT_TOKEN is set. Nothing was stored.' }
  if ((options.platform ?? process.platform) !== 'darwin') return { ok: false, outcome: 'unsupported', message: 'Keychain storage is available on macOS only. Nothing was stored.' }
  const file = approvalSecretPath(root)
  if (!fs.existsSync(file)) return { ok: false, outcome: 'no_secret', message: 'brand/.private/approval-secret does not exist. Create it with npm run brand:doctor -- --create-approval-secret.' }
  const secret = fs.readFileSync(file, 'utf8').trim()
  if (!SAFE_SECRET.test(secret)) return { ok: false, outcome: 'refused', message: 'The approval secret has characters the Keychain helper does not pass safely. Nothing was stored.' }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return { ok: false, outcome: 'refused', message: 'The brand slug is not a plain slug. Nothing was stored.' }
  // -U updates an existing entry. Interactive mode reads the command from stdin, so the secret never reaches argv.
  const run = (options.runner ?? systemKeychainRunner)(['-i'], `add-generic-password -U -s ${KEYCHAIN_SERVICE} -a ${slug} -l "Brand OS approval proof (${slug})" -w "${secret}"\n`)
  // `security -i` can exit 0 after a failed command, so read the entry back before reporting success.
  if (run.status !== 0 || readKeychainProof(slug, { ...options, env: {} }) !== secret) return { ok: false, outcome: 'failed', message: 'The Keychain did not accept the entry. Nothing usable was stored.' }
  return { ok: true, outcome: 'stored', message: `Stored the approval proof in the macOS Keychain (service ${KEYCHAIN_SERVICE}, account ${slug}). Its value is not printed. Remove it with npm run brand:doctor -- --forget-proof-keychain.` }
}

export function forgetKeychainProof(slug: string, options: KeychainOptions = {}): KeychainStoreResult {
  if ((options.platform ?? process.platform) !== 'darwin') return { ok: false, outcome: 'unsupported', message: 'Keychain storage is available on macOS only.' }
  const run = (options.runner ?? systemKeychainRunner)(['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', slug])
  if (run.status !== 0) return { ok: true, outcome: 'not_found', message: `No Keychain entry for service ${KEYCHAIN_SERVICE}, account ${slug}. Nothing to remove.` }
  return { ok: true, outcome: 'removed', message: `Removed the Keychain entry for service ${KEYCHAIN_SERVICE}, account ${slug}.` }
}

export type ProofSource = 'env' | 'stdin' | 'keychain' | 'prompt' | 'none'

export interface ProofSources {
  env?: NodeJS.ProcessEnv
  /** True when stdin is a terminal (no piped proof; a hidden prompt is possible). */
  isTTY: boolean
  /** Reads the first line of piped stdin. Omit for commands that use stdin for other data. */
  readStdin?: () => Promise<string | undefined>
  keychain?: () => string | undefined
  prompt?: () => Promise<string | undefined>
}

/** Resolve a candidate proof in the documented order. Never reads argv. */
export async function resolveApprovalProof(sources: ProofSources): Promise<{ proof: string | undefined; source: ProofSource }> {
  const env = sources.env ?? process.env
  const fromEnv = env.BRAND_OS_APPROVAL_PROOF?.trim()
  if (fromEnv) return { proof: fromEnv, source: 'env' }
  if (!sources.isTTY && sources.readStdin) {
    const piped = (await sources.readStdin())?.trim()
    if (piped) return { proof: piped, source: 'stdin' }
  }
  if (!env.BRAND_OS_AGENT_TOKEN && sources.keychain) {
    const stored = sources.keychain()?.trim()
    if (stored) return { proof: stored, source: 'keychain' }
  }
  if (sources.isTTY && sources.prompt) {
    const typed = (await sources.prompt())?.trim()
    if (typed) return { proof: typed, source: 'prompt' }
  }
  return { proof: undefined, source: 'none' }
}
