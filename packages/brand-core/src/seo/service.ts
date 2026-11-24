import path from 'node:path'
import { agentTokenContext, type AuthContext } from '../auth.js'
import type { InterviewEngine } from '../engine.js'
import { knowledgeRef } from '../knowledge/proposals.js'
import { ensureDir, writeVaultFile, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import { brandRetrieve } from '../query.js'
import type { ResearchAdapter } from '../research/adapters.js'
import { assertOwnerProcess, loadEvidence } from '../research/store.js'
import { answersOf, readInterview, SEO_DIR } from './answers.js'
import { critiquePlan, type CriticReport } from './critic.js'
import { SeoError } from './interview.js'
import type { SeoStrategy } from './model.js'
import { buildStrategy } from './strategist.js'

/** Approved facts that give an SEO plan context. Read through the `marketing` profile: restricted values never come back. */
export const SEO_CONTEXT_FACTS = ['business.market.geography', 'business.marketing.objective', 'business.marketing.channels', 'brand.ui.platforms', 'business.marketing.availability_claim']

export function approvedContextFacts(ws: KnowledgeWorkspace, engine: InterviewEngine): Array<{ id: string; revision: string | null }> {
  if (engine.config().brand.slug !== ws.brandSlug) throw new SeoError('wrong_brand', 'The engine and the workspace are different brands.')
  const ctx: AuthContext = { ...agentTokenContext(ws.brandSlug, 'seo-strategist', 'marketing'), principal_id: 'local-process:seo-strategist' }
  const facts = brandRetrieve(engine, ctx, { kind: 'facts' })
  const items = (facts.data as { items?: Array<{ id: string; revision: string | null; approval_state: string; withheld: boolean }> } | null)?.items ?? []
  return items.filter((item) => !item.withheld && item.approval_state === 'approved' && SEO_CONTEXT_FACTS.includes(item.id)).map((item) => ({ id: item.id, revision: item.revision }))
}

export interface DraftResult {
  plan: SeoStrategy
  critic: CriticReport
  saved: { json: string; markdown: string } | null
}

/**
 * Builds a draft from the recorded interview and the research notes in the Knowledge Inbox, runs the independent
 * critic, and (unless `save: false`) writes both to brand/.private/strategy/seo/drafts/. Nothing is approved.
 */
export function draftSeoStrategy(ws: KnowledgeWorkspace, engine: InterviewEngine | null, opts: { adapter: ResearchAdapter; now?: Date; save?: boolean }): DraftResult {
  assertOwnerProcess()
  const now = opts.now ?? ws.now()
  const record = readInterview(ws)
  const answerNotes: Record<string, string | null> = {}
  for (const [id, entry] of Object.entries(record.answers)) answerNotes[id] = entry.note ? knowledgeRef(entry.note.id, entry.note.revision) : null
  const evidence = loadEvidence(ws, { now })
  const plan = buildStrategy({
    brand_slug: ws.brandSlug,
    answers: answersOf(record),
    answer_notes: answerNotes,
    evidence,
    capability: opts.adapter.capability(now),
    approved_facts: engine ? approvedContextFacts(ws, engine) : [],
    now,
  })
  const critic = critiquePlan(plan, evidence)
  let saved: DraftResult['saved'] = null
  if (opts.save !== false) {
    const dir = path.join(ws.root, ...SEO_DIR.split('/'), 'drafts')
    ensureDir(ws, dir)
    const json = path.join(dir, `${plan.plan_id}.json`)
    const markdown = path.join(dir, `${plan.plan_id}.md`)
    writeVaultFile(ws, json, `${JSON.stringify({ plan, critic }, null, 2)}\n`, true)
    writeVaultFile(ws, markdown, plan.markdown, true)
    saved = { json: path.relative(ws.root, json).split(path.sep).join('/'), markdown: path.relative(ws.root, markdown).split(path.sep).join('/') }
  }
  return { plan, critic, saved }
}
