import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { ensureApprovalSecret, InterviewEngine, openWorkspace, type KnowledgeWorkspace } from '@brand-os/brand-core'
import { brandDir, TEST_DATA_KEY } from './knowledge.js'

const repo = path.resolve(import.meta.dirname, '..', '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')

export interface CliResult {
  status: number | null
  stdout: string
  stderr: string
  json: Record<string, unknown> | null
}

/** Runs scripts/creative.ts or scripts/knowledge.ts in a brand workspace, as the owner unless env says otherwise. */
export function run(script: 'creative' | 'knowledge', root: string, args: string[], env: Record<string, string | undefined> = {}, stdin?: string): CliResult {
  const base: Record<string, string | undefined> = { ...process.env, BRAND_OS_DATA_KEY: TEST_DATA_KEY, BRAND_OS_KNOWLEDGE_GH: 'off' }
  delete base.BRAND_OS_AGENT_TOKEN
  delete base.BRAND_OS_APPROVAL_PROOF
  const result = spawnSync(tsx, [path.join(repo, 'scripts', `${script}.ts`), ...args], { cwd: root, encoding: 'utf8', env: { ...base, ...env } as NodeJS.ProcessEnv, input: stdin ?? '' })
  let json: Record<string, unknown> | null = null
  try {
    json = JSON.parse(result.stdout) as Record<string, unknown>
  } catch {
    json = null
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json }
}

export const creative = (root: string, args: string[], env?: Record<string, string | undefined>, stdin?: string) => run('creative', root, args, env, stdin)
export const knowledge = (root: string, args: string[], env?: Record<string, string | undefined>, stdin?: string) => run('knowledge', root, args, env, stdin)

export function ok(result: CliResult): Record<string, unknown> {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  return result.json ?? {}
}

export function errorCode(result: CliResult): string | null {
  return ((result.json?.error as { code?: string } | undefined)?.code ?? /^([a-z_]+):/.exec(result.stderr)?.[1]) || null
}

export const APPROVED_VISION = 'A friendly pilot who makes daily practice feel like a short flight.'
export const DRAFT_VISION_CANARY = 'DRAFT-PURPOSE-CANARY never in creative context'

/**
 * A temporary Pilito brand with one approved brand-strategy fact (design profile can read it), one unapproved
 * draft, and the owner's approval secret. Returns the proof for owner-gated steps.
 */
export function pilitoBrand(slug = 'pilito'): { root: string; ws: KnowledgeWorkspace; engine: InterviewEngine; proof: string } {
  const root = brandDir({
    slug,
    mutate: (config) => {
      const modules = config.modules as Record<string, { enabled: boolean }>
      modules.mascot = { ...modules.mascot, enabled: true }
    },
  })
  const engine = new InterviewEngine(root)
  const proof = ensureApprovalSecret(root)
  assert.equal(engine.changeAnswer('brand.strategy.vision', APPROVED_VISION).kind, 'recorded')
  assert.equal(engine.approve('brand.strategy.vision', 'owner', proof).kind, 'recorded')
  assert.equal(engine.changeAnswer('brand.strategy.purpose', DRAFT_VISION_CANARY).kind, 'recorded')
  return { root, ws: openWorkspace(root), engine, proof }
}

/** Adds metadata rows to the temp brand's asset manifest. No image file is created. */
export function addManifestRows(root: string, rows: Array<Record<string, unknown>>): void {
  const file = path.join(root, 'brand', 'assets', 'asset-manifest.yaml')
  const doc = (YAML.parse(fs.readFileSync(file, 'utf8')) as { assets?: unknown[] } | null) ?? {}
  doc.assets = [...(doc.assets ?? []), ...rows]
  fs.writeFileSync(file, YAML.stringify(doc))
}

export function read(root: string, relative: string): string {
  return fs.readFileSync(path.join(root, relative), 'utf8')
}

/** Number of files under `dir` whose bytes contain `needle`. */
export function filesContaining(dir: string, needle: string): string[] {
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && fs.readFileSync(full, 'utf8').includes(needle)) out.push(full)
    }
  }
  walk(dir)
  return out
}

/** Hash of every file under brand/ except brand/.private/ (the gitignored local store): what Git, Studio and builds can see. */
export function trackedSnapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  const base = path.join(root, 'brand')
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      const rel = path.relative(root, full).split(path.sep).join('/')
      if (rel === 'brand/.private') continue
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) out[rel] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')
    }
  }
  walk(base)
  return out
}
