import { parseArgs } from 'node:util'
import { AGENT_TOKEN_ENV, AgentTokenError, InterviewEngine, operatorContext, resolveAgentContext, type AuthContext } from '@brand-os/brand-core'
import {
  ASSET_USES,
  readVerifiedAsset,
  runVisualDnaTool,
  USE_SCOPES,
  VISUAL_DNA_LOCALES,
  visualDnaText,
  VisualDnaError,
  type AssetUse,
  type UseScope,
  type VisualDnaLocale,
  type VisualDnaResult,
} from '@brand-os/brand-core/visual-dna'

/**
 * brand:visual-dna — the Visual DNA reference resolver (`docs-internal/VISUAL_DNA.md`).
 *
 * resolve: the same read-only resolver as the MCP tool `visual_dna`. With an agent token in the environment it runs
 * as that token (exactly as the MCP server would); without one it runs as the local owner process.
 * read: owner only. Reads ONE approved asset after every check, for a stated use its model_use allows, and prints the
 * verdict (default) or the verified bytes (--stdout). Writes no file, mints no URL, sends nothing to any model.
 */

const HELP = `brand:visual-dna <command> [options]

  resolve [--ids <asset.id,...>] [--emotion e] [--stage s] [--use-case u] [--angle a]
          [--project <project_id>] [--surface s] [--series s] [--use-scope public|internal]
          [--lang en|fa|tr] [--json]
      Verdict per reference: approved, withheld, missing or changed, with source, checksum, usage
      rights and the effective model_use. Metadata only. A missing pose or angle stays missing.
      --use-scope (default public): internal-scope rights cover a portrait only for internal use.

  read <asset.id> --for renderer|local_model|external_provider [--use-scope public|internal]
       [--stdout] [--json]
      Owner only (refused while ${AGENT_TOKEN_ENV} is set). Checks one approved asset (safe path, no
      symlink, size, checksum on the bytes read, SVG gates) and that its model_use allows --for.
      Prints the verdict; --stdout writes the verified bytes to standard output instead. Nothing is
      uploaded and no upload is authorized, whatever model_use says.

Every result authorizes nothing: no publication, schedule, spend, deployment, approval or upload.`

function usage(message: string): never {
  console.error(`${message}\n\n${HELP}`)
  process.exit(2)
}

function lang(value: string | undefined): VisualDnaLocale {
  if (value === undefined) return 'en'
  if (!(VISUAL_DNA_LOCALES as readonly string[]).includes(value)) usage('--lang is en, fa or tr.')
  return value as VisualDnaLocale
}

function scope(value: string | undefined): UseScope {
  if (value === undefined) return 'public'
  if (!(USE_SCOPES as readonly string[]).includes(value)) usage('--use-scope is public or internal.')
  return value as UseScope
}

function render(result: VisualDnaResult): string {
  const t = visualDnaText(result.locale)
  if (result.status !== 'ok') return `${result.status}: ${result.reason ?? ''}`
  const lines = [`${t.labels.references}:`]
  for (const ref of result.references) {
    const detail = ref.state === 'approved' ? `${ref.asset?.path ?? ''} sha256:${ref.asset?.checksum_sha256.slice(0, 12) ?? ''} model_use:${ref.model_use}` : (ref.reason_text ?? '')
    lines.push(`  [${t.states[ref.state]}] ${ref.ref_id} — ${detail}`)
  }
  if (result.references.length === 0) lines.push(`  ${t.labels.none}`)
  if (result.mascot.status !== 'not_requested') {
    lines.push(`${t.labels.mascot}: ${t.sections[result.mascot.status]}`)
    for (const line of result.mascot.explanation) lines.push(`  ${line}`)
  }
  if (result.creative.status !== 'not_requested') lines.push(`${t.labels.creative}: ${t.sections[result.creative.status]}`)
  lines.push(`${t.labels.digest}: ${result.digest ?? t.labels.none}`, '', ...result.notice.map((line) => `- ${line}`))
  return lines.join('\n')
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2)
  if (!command || command === '--help' || command === 'help') {
    console.log(HELP)
    return
  }
  const engine = new InterviewEngine(process.cwd())
  const slug = engine.config().brand.slug

  if (command === 'resolve') {
    const { values } = parseArgs({
      args: rest,
      options: {
        ids: { type: 'string' },
        emotion: { type: 'string' },
        stage: { type: 'string' },
        'use-case': { type: 'string' },
        angle: { type: 'string' },
        project: { type: 'string' },
        surface: { type: 'string' },
        series: { type: 'string' },
        'use-scope': { type: 'string' },
        lang: { type: 'string' },
        json: { type: 'boolean', default: false },
      },
    })
    const locale = lang(values.lang)
    const useScope = scope(values['use-scope'])
    // Same identity rule as the MCP server: a token comes from the environment only, never from argv.
    let ctx: AuthContext
    const token = process.env[AGENT_TOKEN_ENV]
    try {
      ctx = token ? resolveAgentContext(engine.workspaceRoot(), slug, token) : operatorContext(slug)
    } catch (error) {
      console.error(error instanceof AgentTokenError ? error.message : 'Agent token resolution failed.')
      process.exit(1)
    }
    const mascot = values.emotion || values.stage || values['use-case'] || values.angle ? { emotion: values.emotion, stage: values.stage, use_case: values['use-case'], angle: values.angle } : undefined
    const creative = values.project || values.surface || values.series ? { project_id: values.project, surface: values.surface, series: values.series } : undefined
    const assetIds = values.ids ? values.ids.split(',').map((id) => id.trim()).filter(Boolean) : undefined
    const result = runVisualDnaTool(engine, ctx, { asset_ids: assetIds, mascot, creative, use_scope: useScope, locale })
    console.log(values.json ? JSON.stringify(result, null, 2) : render(result))
    process.exit(result.status === 'ok' ? 0 : 1)
  }

  if (command === 'read') {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { for: { type: 'string' }, 'use-scope': { type: 'string' }, stdout: { type: 'boolean', default: false }, json: { type: 'boolean', default: false } },
    })
    if (process.env[AGENT_TOKEN_ENV]) {
      console.error(`owner_only: Reading asset bytes is a local owner action. Refusing while ${AGENT_TOKEN_ENV} is set.`)
      process.exit(1)
    }
    if (positionals.length !== 1) usage('read takes exactly one asset id.')
    if (!values.for || !(ASSET_USES as readonly string[]).includes(values.for)) usage(`--for is required: ${ASSET_USES.join(', ')}.`)
    try {
      const delivered = readVerifiedAsset(engine, operatorContext(slug), positionals[0]!, values.for as AssetUse, scope(values['use-scope']))
      const { bytes, ...verdict } = delivered
      if (values.stdout) {
        process.stdout.write(bytes)
        console.error(`${delivered.asset_id}: ${delivered.size_bytes} bytes, sha256 ${delivered.sha256}, model_use ${delivered.model_use}, for ${delivered.use}. upload_authorized: false.`)
        return
      }
      console.log(values.json ? JSON.stringify(verdict, null, 2) : `${verdict.asset_id}: delivered for ${verdict.use}\n  path ${verdict.path}\n  sha256 ${verdict.sha256}\n  ${verdict.size_bytes} bytes, ${verdict.media_type ?? 'unknown type'}\n  model_use ${verdict.model_use}; upload_authorized false; nothing was sent anywhere.`)
    } catch (error) {
      if (error instanceof VisualDnaError) {
        if (values.json) console.log(JSON.stringify({ tool: 'visual_dna_read', status: 'refused', error: { code: error.code, message: error.message }, authorizes: [] }, null, 2))
        else console.error(`${error.code}: ${error.message}`)
        process.exit(1)
      }
      throw error
    }
    return
  }

  usage(`Unknown command ${command}.`)
}

main()
