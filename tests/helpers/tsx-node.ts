import path from 'node:path'
import { pathToFileURL } from 'node:url'

const repo = path.resolve(import.meta.dirname, '../..')

/**
 * Runs a TypeScript script as a real child process with one Node process: `node --import <tsx loader>`.
 * The `node_modules/.bin/tsx` wrapper starts a second Node process for every call, which made each
 * CLI call in the slow test files about 0.1-0.3 s more expensive. The loader is an absolute URL
 * because the children run in temporary brand copies without node_modules.
 */
export const NODE = process.execPath
export const TSX_IMPORT = ['--import', pathToFileURL(path.join(repo, 'node_modules/tsx/dist/loader.mjs')).href]

export function tsxArgs(script: string, args: string[] = []): string[] {
  return [...TSX_IMPORT, path.join(repo, script), ...args]
}
