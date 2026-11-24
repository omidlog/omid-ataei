import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { ensureApprovalSecret, InterviewEngine } from '@brand-os/brand-core'
import { brandDir, listTree } from './knowledge.js'

/**
 * Fixtures for the Strategic Coach tests. **SYNTHETIC DEMO** data only: every value below is invented for
 * the test and describes no real brand, person, client or number.
 */

/** A canary planted in an answer. No coach output may ever contain it: the coach never quotes owner words. */
export const ANSWER_CANARY = 'COACH-ANSWER-CANARY-7f3a'
/** A canary planted in a restricted answer. It must not reach the ledger, a result, a log or an error. */
export const RESTRICTED_CANARY = 'COACH-RESTRICTED-CANARY-9b1c'

/** SYNTHETIC DEMO: a vague segment answer that leans on a general phrase. */
export const VAGUE_SEGMENT = `Small businesses and really everyone who needs high quality. ${ANSWER_CANARY}`
/** SYNTHETIC DEMO: a specific segment answer. */
export const SPECIFIC_SEGMENT =
  'Independent dental clinics in Istanbul with two to four chairs, whose front desk loses booking calls during treatment hours and who have no practice-management software yet.'

export interface CoachBrand {
  root: string
  engine: InterviewEngine
  proof: string
}

/**
 * A throwaway brand with the approval secret in place. `changeAnswer` is used rather than
 * `answerQuestion` so a test can answer a question whose prerequisite is deliberately left open.
 */
export function coachBrand(opts: { slug?: string; personal?: boolean; facets?: string[] } = {}): CoachBrand {
  const root = brandDir({
    slug: opts.slug ?? 'coach-demo',
    mutate: (config) => {
      if (!opts.personal) return
      const modules = config.modules as Record<string, unknown>
      modules.personal = { enabled: true, facets: opts.facets ?? ['founder-executive', 'consultant-expert'], note: 'SYNTHETIC DEMO' }
    },
  })
  return { root, engine: new InterviewEngine(root), proof: ensureApprovalSecret(root) }
}

/** Records a draft answer, asserting the engine accepted it. */
export function answer(brand: CoachBrand, id: string, value: string): void {
  const result = brand.engine.changeAnswer(id, value)
  assert.equal(result.kind, 'recorded', `${id}: ${result.message}`)
}

/** Records and approves an answer with the owner proof. */
export function approved(brand: CoachBrand, id: string, value: string): void {
  answer(brand, id, value)
  const result = brand.engine.approve(id, 'owner', brand.proof)
  assert.equal(result.kind, 'recorded', `${id}: ${result.message}`)
}

/** Marks a question with an explicit owner disposition (`unknown`, `skip`, `not relevant`). */
export function disposition(brand: CoachBrand, id: string, word: 'unknown' | 'skip' | 'not relevant'): void {
  const result = brand.engine.changeAnswer(id, word)
  assert.equal(result.kind, 'recorded', `${id}: ${result.message}`)
}

/** Puts a question on the owner's "decide later" list, which the coach treats as a decline. */
export function defer(brand: CoachBrand, id: string): void {
  const file = path.join(brand.root, 'brand', 'interview', 'session-state.yaml')
  const session = YAML.parse(fs.readFileSync(file, 'utf8')) as { deferred: string[] }
  session.deferred = [...new Set([...session.deferred, id])]
  fs.writeFileSync(file, YAML.stringify(session))
}

/** Every file under the brand root with its bytes, so a test can prove the analysis wrote nothing. */
export function snapshot(root: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of listTree(root)) out.set(file, fs.readFileSync(path.join(root, file)).toString('base64'))
  return out
}

export function assertUnchanged(before: Map<string, string>, root: string, what: string): void {
  const after = snapshot(root)
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), `${what}: no file is created or removed`)
  for (const [file, bytes] of before) assert.equal(after.get(file), bytes, `${what}: ${file} is byte-for-byte unchanged`)
}
