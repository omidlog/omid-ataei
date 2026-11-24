import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { parse } from 'yaml'
import { readKeychainProof, resolveApprovalProof } from '@brand-os/brand-core'

/**
 * The owner's approval proof for every CLI command that takes it. Order: BRAND_OS_APPROVAL_PROOF → piped stdin →
 * macOS Keychain (`brand:doctor --store-proof-keychain`; never while BRAND_OS_AGENT_TOKEN is set) → hidden prompt.
 * Never argv. `stdin: false` is for commands that read other data from stdin (for example `--file -`): they skip the
 * piped-stdin step and keep every other one.
 */
export async function readOwnerProof(options: { slug?: string; prompt?: string; stdin?: boolean } = {}): Promise<string | undefined> {
  const { proof } = await resolveApprovalProof({
    isTTY: Boolean(input.isTTY),
    readStdin: options.stdin === false ? undefined : readFirstStdinLine,
    keychain: () => {
      const slug = options.slug ?? configuredSlug(process.cwd())
      return slug ? readKeychainProof(slug) : undefined
    },
    prompt: () => hiddenPrompt(options.prompt ?? 'Approval proof (input hidden): '),
  })
  return proof
}

/** The Keychain account is the brand slug from brand/brand.config.yaml. No slug, no Keychain lookup. */
function configuredSlug(root: string): string | undefined {
  try {
    const config = parse(fs.readFileSync(path.join(root, 'brand', 'brand.config.yaml'), 'utf8')) as { brand?: { slug?: unknown } } | null
    return typeof config?.brand?.slug === 'string' ? config.brand.slug : undefined
  } catch {
    return undefined
  }
}

async function readFirstStdinLine(): Promise<string | undefined> {
  const chunks: Buffer[] = []
  for await (const chunk of input) chunks.push(Buffer.from(chunk as Buffer))
  return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0]?.trim() || undefined
}

async function hiddenPrompt(question: string): Promise<string | undefined> {
  const { Writable } = await import('node:stream')
  let muted = false
  const sink = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) output.write(chunk, encoding)
      callback()
    },
  })
  const rl = readline.createInterface({ input, output: sink, terminal: true })
  try {
    const pending = rl.question(question)
    muted = true
    const answer = await pending
    output.write('\n')
    return answer.trim() || undefined
  } finally {
    rl.close()
  }
}
