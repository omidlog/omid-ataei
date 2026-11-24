import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { assertSlug } from '@brand-os/brand-core'
import { hashPassword } from './auth/password.js'
import { base32Encode, TotpVerifier } from './auth/totp.js'
import { ConfigError, loadConfig, validOwner, validRepoName } from './config.js'
import { GitHubClient } from './github/client.js'
import { Registry } from './registry.js'

/**
 * Owner-run server commands. These run on the Studio host, not in the browser, and are the only way to
 * register an existing brand repository (for example one created before Studio existed).
 *
 *   npm run studio:hash-password               reads the password from stdin or a hidden prompt
 *   npm run studio -- totp-secret              prints a new base32 TOTP secret for your authenticator
 *   npm run studio -- session-secret           prints a new random session secret
 *   npm run studio -- bootstrap-owner --login <name> [--out <file>] [--force]
 *                                              owner password + new TOTP + session secret as an env file
 *   npm run studio -- check-config             validates the environment; prints settings, never values
 *   npm run studio -- brands                   lists registered brands
 *   npm run studio -- register --slug <s> --repo <owner/name>
 *   npm run studio -- unregister --slug <s>    removes the Studio mapping only (never touches GitHub)
 */
async function secretInput(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Buffer))
    return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '')
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  const output = rl as unknown as { _writeToOutput: (text: string) => void }
  let muted = false
  output._writeToOutput = (text: string) => {
    if (!muted) process.stdout.write(text)
  }
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
    muted = true
  })
}

async function textInput(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true })
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

/** Single-quoted so Docker Compose env files and POSIX shells take the value literally (scrypt hashes contain `$`). */
function envLine(name: string, value: string): string {
  if (/['\r\n]/.test(value)) throw new Error(`${name} contains a character that cannot be written to an env file.`)
  return `${name}='${value}'`
}

function otpauthUri(issuer: string, login: string, secret: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(login)}`
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}

/**
 * Creates the owner's sign-in material in one step: scrypt password hash, a new TOTP secret and a new
 * session secret, as env lines. The env lines go to `--out` (mode 0600, refused if it exists unless
 * --force) or stdout; enrollment instructions go to stderr only. On a terminal the password is asked
 * twice and the first authenticator code is verified before anything is written.
 */
async function bootstrapOwner(args: string[]): Promise<void> {
  const login = flag(args, 'login') ?? ''
  if (!/^[A-Za-z0-9._@-]{1,64}$/.test(login)) throw new Error('Use --login <name> (letters, digits, . _ @ -, up to 64 characters).')
  const out = flag(args, 'out')
  const force = args.includes('--force')
  if (out && fs.existsSync(out) && !force) throw new Error(`${out} already exists. Pass --force to replace it (this signs the owner out and needs a new authenticator entry).`)
  const interactive = process.stdin.isTTY === true
  const password = await secretInput('Owner password (min 12 characters): ')
  if (interactive && (await secretInput('Repeat the password: ')) !== password) throw new Error('The passwords do not match. Nothing was written.')
  const passwordHash = hashPassword(password)
  const totpSecret = base32Encode(crypto.randomBytes(20))
  const sessionSecret = crypto.randomBytes(32).toString('base64')
  const issuer = flag(args, 'issuer') ?? 'Brand OS Studio'
  process.stderr.write(
    [
      '',
      'Add this account to your authenticator app (shown only here, on this terminal):',
      `  Key:  ${totpSecret}`,
      `  URI:  ${otpauthUri(issuer, login, totpSecret)}`,
      '',
    ].join('\n'),
  )
  if (interactive) {
    const code = await textInput('Enter the current 6-digit code from the app to confirm: ')
    if (!new TotpVerifier(totpSecret).verify(code, Date.now())) throw new Error('That code is not valid for the new key. Nothing was written; run the command again.')
  }
  const body = [
    '# Brand OS Studio owner sign-in. Generated by `studio bootstrap-owner`. Keep mode 0600; never commit or paste it.',
    envLine('STUDIO_OWNER_LOGIN', login),
    envLine('STUDIO_OWNER_PASSWORD_HASH', passwordHash),
    envLine('STUDIO_OWNER_TOTP_SECRET', totpSecret),
    envLine('STUDIO_SESSION_SECRET', sessionSecret),
    '',
  ].join('\n')
  if (out) {
    fs.writeFileSync(out, body, { mode: 0o600, flag: force ? 'w' : 'wx' })
    fs.chmodSync(out, 0o600)
    process.stderr.write(`Wrote ${out} (mode 0600).\n`)
  } else process.stdout.write(body)
}

/** Validates the environment exactly as the server would and prints the resulting settings, never a secret. */
function checkConfig(): void {
  try {
    const config = loadConfig()
    const lines: Array<[string, string]> = [
      ['listen', `${config.host}:${config.port}`],
      ['public origin', config.publicOrigin],
      ['secure cookies', String(config.secureCookies)],
      ['trust proxy', String(config.trustProxy)],
      ['data dir', config.dataDir],
      ['owner MFA', config.ownerTotpSecret ? 'on' : 'off'],
      ['GitHub read', config.github.readToken ? 'configured' : 'not configured'],
      ['GitHub provision', config.github.provisionToken ? 'configured' : 'not configured'],
      ['allowed owners', config.github.allowedOwners.join(', ') || '-'],
      ['template', `${config.github.templateOwner}/${config.github.templateRepo}`],
      ['webhook', config.github.webhookSecret ? 'configured' : 'not configured'],
      ['head poll', config.headPollMs > 0 ? `every ${config.headPollMs / 1000} s` : 'off'],
    ]
    for (const [name, value] of lines) console.log(`${name.padEnd(17)} ${value}`)
    console.log('Configuration OK.')
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message)
      process.exit(1)
    }
    throw error
  }
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2)
  if (args.some((arg) => arg.startsWith('--password'))) throw new Error('Passwords are never accepted on the command line. Use stdin or the prompt.')
  const dataDir = path.resolve(process.env.STUDIO_DATA_DIR ?? '.studio-data')
  switch (command) {
    case 'hash-password': {
      const password = await secretInput('Owner password (min 12 characters): ')
      console.log(hashPassword(password))
      return
    }
    case 'totp-secret':
      console.log(base32Encode(crypto.randomBytes(20)))
      return
    case 'session-secret':
      console.log(crypto.randomBytes(32).toString('base64'))
      return
    case 'bootstrap-owner':
      return bootstrapOwner(args)
    case 'check-config':
      return checkConfig()
    case 'brands': {
      for (const brand of new Registry(dataDir).list()) console.log(`${brand.slug}\t${brand.repo.owner}/${brand.repo.name}\t${brand.provisioning?.state ?? 'registered'}`)
      return
    }
    case 'register': {
      const slug = flag(args, 'slug') ?? ''
      const [owner = '', name = ''] = (flag(args, 'repo') ?? '').split('/')
      assertSlug(slug)
      if (!validOwner(owner) || !validRepoName(name)) throw new Error('Use --repo owner/name.')
      const registry = new Registry(dataDir)
      if (registry.get(slug) || registry.byRepoName(owner, name)) throw new Error('That slug or repository is already registered.')
      const client = new GitHubClient({ token: process.env.STUDIO_GITHUB_READ_TOKEN?.trim() || null })
      const repo = await client.getRepo(owner, name)
      if (!repo) throw new Error('The repository is not reachable with STUDIO_GITHUB_READ_TOKEN.')
      if (!repo.private) throw new Error('Refusing to register a public repository. Make it private first.')
      registry.upsert({
        slug,
        display_name: flag(args, 'name') ?? slug,
        profile: flag(args, 'profile') === 'personal-brand' ? 'personal-brand' : 'business',
        repo: { owner: repo.owner || owner, name: repo.name || name, id: repo.id, html_url: repo.html_url, default_branch: repo.default_branch },
        source: 'registered',
        created_at: new Date().toISOString(),
        created_by: 'server-cli',
        provisioning: null,
      })
      console.log(`Registered ${slug} -> ${owner}/${name}. Studio checks on first view that brand.slug in the repository is "${slug}".`)
      return
    }
    case 'unregister': {
      const slug = flag(args, 'slug') ?? ''
      console.log(new Registry(dataDir).remove(slug) ? `Removed ${slug} from Studio. The GitHub repository was not touched.` : 'No such brand.')
      return
    }
    default:
      console.log('Commands: hash-password, totp-secret, session-secret, bootstrap-owner --login <name> [--out <file>] [--force], check-config, brands, register --slug <slug> --repo <owner/name> [--name <display name>] [--profile business|personal-brand], unregister --slug <slug>')
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Failed.')
  process.exit(1)
})
