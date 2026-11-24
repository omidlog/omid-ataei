import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { createAcceptanceFixture } from './acceptance/fixture.js'
import { runAcceptance } from './acceptance/harness.js'
import { ACCEPTANCE_LOCALES, renderReport, type AcceptanceLocale } from './acceptance/report.js'

/**
 * brand:acceptance — the pilot and workflow acceptance harness (`docs-internal/ACCEPTANCE.md`).
 *
 * --demo runs the four journeys on a SYNTHETIC fixture (what CI runs). --root runs them on an owner's checkout,
 * through a temporary snapshot: the checkout is hashed before and after and never written. Owner-local only.
 */

const HELP = `brand:acceptance (--demo | --root <brand checkout>) --out <empty dir> [--lang en|fa|tr] [--json]

  --demo        Synthetic fixture brand (a temporary directory, removed afterwards).
  --root <dir>  An owner's brand checkout. Read only: the harness works on a temporary
                copy of brand/; a run that changed the checkout fails.
  --out <dir>   New or empty directory outside any brand/ folder. Receives the drafted
                posts and acceptance-report.json (ids, counts, codes and checksums only).
  --lang        Language of the printed summary (default en). The JSON is language-neutral.

Every case is PASS, FAIL or NOT_TESTED with evidence; nothing untested is reported as a pass.
Exit 0 when nothing failed, 4 when a case failed or the checkout changed, 2 on a usage
error, 1 when the run could not start or stopped.
The harness calls no model and no network, and publishes, schedules, spends and deploys nothing.`

function usage(message: string): never {
  console.error(`${message}\n\n${HELP}`)
  process.exit(2)
}

async function main(): Promise<void> {
  let parsed
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      options: { demo: { type: 'boolean' }, root: { type: 'string' }, out: { type: 'string' }, lang: { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean' } },
    })
  } catch (error) {
    usage(error instanceof Error ? error.message : String(error))
  }
  const { values } = parsed
  if (values.help) {
    console.log(HELP)
    return
  }
  if (!!values.demo === !!values.root) usage('Give exactly one of --demo or --root.')
  if (!values.out) usage('--out is required.')
  const locale = (values.lang ?? 'en') as AcceptanceLocale
  if (!(ACCEPTANCE_LOCALES as readonly string[]).includes(locale)) usage('--lang is en, fa or tr.')

  const progress = values.json ? () => {} : (line: string) => console.error(line)
  const fixture = values.demo ? createAcceptanceFixture() : null
  let report
  try {
    report = await runAcceptance({ root: fixture?.root ?? values.root!, out: values.out, origin: fixture ? 'synthetic' : 'owner_brand', canaries: fixture?.canaries, progress })
  } finally {
    fixture?.cleanup()
  }
  const file = path.join(path.resolve(values.out), 'acceptance-report.json')
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
  console.log(values.json ? JSON.stringify(report, null, 2) : renderReport(report, locale))
  process.exitCode = report.verdict === 'FAIL' ? 4 : 0
}

main().catch((error: unknown) => {
  console.error(`acceptance_failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
