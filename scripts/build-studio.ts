import fs from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'

/**
 * Builds the production Studio bundle: `apps/studio/dist/main.mjs` (the server),
 * `apps/studio/dist/cli.mjs` (owner server commands) and `apps/studio/dist/projection-worker.mjs` (the
 * sync's projection build, run in a worker thread so the server keeps answering). Each is one self-contained ES module with the
 * workspace packages and their npm dependencies inlined, so the runtime image needs only Node, the
 * bundle and `apps/studio/static`. Nothing from `brand/`, `.env` or the docs app is bundled.
 *
 *   npm run studio:build [-- --outdir <dir>]
 */
const root = path.resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const outIndex = args.indexOf('--outdir')
const outdir = path.resolve(outIndex >= 0 ? (args[outIndex + 1] ?? '') : path.join(root, 'apps/studio/dist'))

fs.rmSync(outdir, { recursive: true, force: true })
const result = await build({
  absWorkingDir: root,
  entryPoints: { main: 'apps/studio/src/main.ts', cli: 'apps/studio/src/cli.ts', 'projection-worker': 'apps/studio/src/projection-worker.ts' },
  outdir,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  tsconfig: path.join(root, 'tsconfig.json'),
  // CommonJS dependencies (yaml, ajv) call require() for Node built-ins; give the ES module one.
  banner: { js: "import { createRequire as __studioRequire } from 'node:module'; const require = __studioRequire(import.meta.url);" },
  legalComments: 'none',
  sourcemap: false,
  metafile: true,
  logLevel: 'warning',
})

// The bundle must not pull in brand content, environment files or the docs app.
const forbidden = /(^|\/)(brand|apps\/docs|examples)\/|\.env/
const offenders = Object.keys(result.metafile.inputs).filter((input) => forbidden.test(input) && !input.startsWith('node_modules/'))
if (offenders.length) {
  console.error(`Studio bundle includes files it must not: ${offenders.join(', ')}`)
  process.exit(1)
}
for (const name of ['main.mjs', 'cli.mjs', 'projection-worker.mjs']) {
  const size = fs.statSync(path.join(outdir, name)).size
  console.log(`${path.relative(root, path.join(outdir, name))} ${(size / 1024).toFixed(0)} KiB`)
}
