import fs from 'node:fs'
import path from 'node:path'
import { AGENT_TOKEN_ENV } from '../agent-tokens.js'
import { InterviewEngine } from '../engine.js'
import { readFacts } from '../facts.js'
import { allQuestions } from '../content/index.js'
import { TASK_CONTEXT_SCHEMA, TASK_CONTEXT_TOOL, type TaskContextPack } from '../task-context/model.js'
import { RuntimeError } from './model.js'

/**
 * Real-brand input for the Runtime: a `task_context` pack file, exactly as `brand:query --tool task_context` printed it
 * (the `{ tool, status, data }` envelope) or the bare pack. Owner decision 1 of the runtime-pack slice (2026-11-23).
 *
 * Reading a pack file reads nothing else. The digest, task type, count and the empty `authorizes` are then checked by
 * `runSocialBatch` — the same checks the demo path goes through, so a tampered, wrong-type or wrong-count pack file is
 * refused exactly like a demo pack would be.
 *
 * Optional owner workspace (`--root`): the Coach and the approved logo need the owner's own checkout. It is opened
 * read-only, only by the owner process (refused under an agent token), and only when its brand slug is the pack's
 * `brand_id`. Nothing in `brand/` is written: the Coach is a pure read and the logo goes through the publication gate.
 */

/** A pack is small (bounded keys, ≤24 items per kind). Anything larger is not a pack. */
export const MAX_PACK_BYTES = 2_000_000

const SECTION_NAMES = ['identity', 'strategy', 'creative', 'production'] as const

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Structural guard before any field is read. The digest proves the pack was not changed after it was built; this proves
 * it has the shape the planner reads, so a hand-made file with a recomputed digest fails with a reason, not a crash.
 */
export function assertPackShape(value: unknown): asserts value is TaskContextPack {
  const fail = (what: string): never => {
    throw new RuntimeError('invalid_pack', `Not a ${TASK_CONTEXT_SCHEMA} pack: ${what}.`)
  }
  if (!isObject(value)) fail('not a JSON object')
  const pack = value as Record<string, unknown>
  if (pack.schema !== TASK_CONTEXT_SCHEMA) fail(`schema is not ${TASK_CONTEXT_SCHEMA}`)
  if (typeof pack.brand_id !== 'string' || pack.brand_id.length === 0) fail('brand_id is missing')
  if (!isObject(pack.task) || typeof pack.task.type !== 'string' || typeof pack.task.deliverable_count !== 'number' || typeof pack.task.locale !== 'string') fail('task is incomplete')
  if (!isObject(pack.sections) || !SECTION_NAMES.every((name) => Array.isArray((pack.sections as Record<string, unknown>)[name]))) fail('sections are incomplete')
  for (const name of SECTION_NAMES) {
    for (const item of (pack.sections as Record<string, unknown[]>)[name]!) if (!isObject(item) || typeof item.key !== 'string' || typeof item.state !== 'string') fail(`an item in ${name} is malformed`)
  }
  if (!Array.isArray(pack.sources) || !pack.sources.every((source) => isObject(source) && typeof source.id === 'string')) fail('sources are malformed')
  if (!Array.isArray(pack.missing)) fail('missing is not a list')
  if (!isObject(pack.digests) || typeof pack.digests.context_sha256 !== 'string') fail('the digest is missing')
  if (!Array.isArray(pack.authorizes) || !isObject(pack.permissions)) fail('authorizes/permissions are missing')
}

/**
 * Reads one pack file. Refuses a symlink, a non-file, an oversized file, invalid JSON, a `task_context` envelope whose
 * status is not `ok`, and an envelope whose `brand_id` differs from its pack. Returns the pack unverified: the caller
 * passes it to `runSocialBatch`, which verifies it.
 */
export function readPackFile(file: string): TaskContextPack {
  const full = path.resolve(file)
  let stat: fs.Stats
  try {
    stat = fs.lstatSync(full)
  } catch {
    throw new RuntimeError('invalid_pack', 'The pack file does not exist.')
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new RuntimeError('invalid_pack', 'The pack path must be a regular file, not a link or a directory.')
  if (stat.size > MAX_PACK_BYTES) throw new RuntimeError('invalid_pack', `The pack file is larger than ${MAX_PACK_BYTES} bytes; a task_context pack is never that large.`)
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(full, 'utf8'))
  } catch {
    throw new RuntimeError('invalid_pack', 'The pack file is not valid JSON.')
  }
  if (isObject(parsed) && parsed.tool === TASK_CONTEXT_TOOL) {
    if (parsed.status !== 'ok') throw new RuntimeError('invalid_pack', `The task_context result has status ${String(parsed.status)}, not ok: there is no pack to render.`)
    if (!Array.isArray(parsed.authorizes) || parsed.authorizes.length !== 0) throw new RuntimeError('invalid_pack', 'A task_context result never authorizes anything.')
    assertPackShape(parsed.data)
    if (parsed.brand_id !== parsed.data.brand_id) throw new RuntimeError('invalid_pack', 'The task_context result and its pack name different brands.')
    return parsed.data
  }
  assertPackShape(parsed)
  return parsed
}

/**
 * Opens the owner's workspace for the Coach and the logo, read-only. Refused under an agent token (both are owner-local)
 * and refused when the workspace is another brand than the pack's.
 */
export function openOwnerWorkspace(root: string, pack: TaskContextPack): InterviewEngine {
  if (process.env[AGENT_TOKEN_ENV]) throw new RuntimeError('refused', `The owner workspace is read by the owner process only. Refusing while ${AGENT_TOKEN_ENV} is set.`)
  const full = path.resolve(root)
  if (!fs.existsSync(path.join(full, 'brand', 'brand.config.yaml'))) throw new RuntimeError('refused', 'The workspace has no brand/brand.config.yaml.')
  const engine = new InterviewEngine(full)
  const slug = engine.config().brand.slug
  if (slug !== pack.brand_id) throw new RuntimeError('refused', 'The workspace is a different brand than the pack (brand slug and pack brand_id differ).')
  return engine
}

/**
 * The pack's approved fact sources whose current approved revision in the owner's workspace differs from the revision
 * the pack pinned (changed, retracted or no longer approved), as `source_id:reason` (ids only, never values). Empty
 * when the pack is current. Strategy and asset sources are not compared here: an asset's pinned checksum is checked by
 * Visual DNA, and a strategy revision is pinned by its own approval record.
 */
export function packSourceDrift(engine: InterviewEngine, pack: TaskContextPack): string[] {
  const bank = new Set(allQuestions().map((question) => question.id))
  const facts = readFacts(engine.workspaceRoot(), 'approved', pack.brand_id)
  const drift: string[] = []
  for (const source of pack.sources) {
    if (!bank.has(source.id) || source.status !== 'approved') continue
    const fact = facts[source.id]
    if (!fact || fact.status !== 'approved') drift.push(`${source.id}:no_longer_approved`)
    else if (fact.revision_hash !== source.revision) drift.push(`${source.id}:revision_changed`)
  }
  return drift.sort()
}
