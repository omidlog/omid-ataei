import path from 'node:path'

/**
 * Plain-English messages for the CLI failures people hit most often (a mistyped option, a missing
 * option value, running a command outside the repository root). `scripts/brand.ts` imports
 * `cli-errors-install.ts` first, so the handler is in place before anything else runs. Any other
 * error keeps its full stack trace.
 */
export interface FriendlyError {
  message: string
  exitCode: number
}

const USAGE_HINT = 'With npm run, options go after a lone --, for example: npm run brand:review -- --module identity'

export function friendlyCliError(error: unknown, command: string | undefined, cwd: string): FriendlyError | null {
  if (!(error instanceof Error)) return null
  const code = (error as NodeJS.ErrnoException).code
  const script = command ? `brand:${command}` : 'brand'
  if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
    const option = /'([^']+)'/.exec(error.message)?.[1] ?? 'an option'
    return { message: `${script} does not know the option ${option}. Check the spelling against the usage in README.md (npm run help lists the commands).\n${USAGE_HINT}`, exitCode: 2 }
  }
  if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
    const option = /'([^']+)'/.exec(error.message)?.[1]?.split(' ')[0] ?? 'an option'
    const problem = /does not take an argument/.test(error.message) ? 'is a switch and takes no value (write it alone, without =…)' : 'needs a value right after it'
    return { message: `${script}: ${option} ${problem}.\n${USAGE_HINT}`, exitCode: 2 }
  }
  if (code === 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL') {
    const value = /'([^']+)'/.exec(error.message)?.[1]
    return { message: `${script} got an extra value${value ? ` "${value}"` : ''} that is not attached to an option. Put values right after their option, and quote text with spaces.\n${USAGE_HINT}`, exitCode: 2 }
  }
  if (code === 'ENOENT') {
    const file = (error as NodeJS.ErrnoException).path
    if (file && path.basename(file) === 'brand.config.yaml') {
      return {
        message: `No brand/brand.config.yaml in ${cwd}.\nRun brand commands from the repository root (npm run does this for you). To set up a new brand there: npm run brand:init -- --name "Your Brand" --slug your-brand --yes\nnpm run doctor checks the rest of the setup.`,
        exitCode: 1,
      }
    }
    if (file) return { message: `${script}: a file it needs is missing: ${path.relative(cwd, file) || file}\nnpm run brand:doctor explains what is missing and how to restore it.`, exitCode: 1 }
  }
  if (code === 'EACCES' || code === 'EPERM') {
    const file = (error as NodeJS.ErrnoException).path
    return { message: `${script}: permission denied${file ? ` on ${path.relative(cwd, file) || file}` : ''}. Check that you own the checkout (do not run brand commands with sudo).`, exitCode: 1 }
  }
  return null
}

export function installCliErrorHandler(command: string | undefined, cwd: string): void {
  const handle = (error: unknown) => {
    const friendly = friendlyCliError(error, command, cwd)
    if (friendly) {
      console.error(friendly.message)
      process.exit(friendly.exitCode)
    }
    console.error(error instanceof Error ? (error.stack ?? error.message) : error)
    process.exit(1)
  }
  process.on('uncaughtException', handle)
  process.on('unhandledRejection', handle)
}
