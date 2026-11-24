import fs from 'node:fs'
import path from 'node:path'
import type { KnowledgeWorkspace } from '@brand-os/brand-core'
import { parseBundle, recordSource, replayAll, type ResearchBundle } from '@brand-os/brand-core/research'
import { recordAnswer, type AnswerValue } from '@brand-os/brand-core/seo'

/** Real official pages, fetched live on 2026-11-22 by brand:seo research capture; every quote verified on the page. */
export const BUNDLE_FILE = path.resolve(import.meta.dirname, '..', 'fixtures', 'research', 'seo-official-2026-11-22.json')
export const REQUEST_FILE = path.resolve(import.meta.dirname, '..', 'fixtures', 'research', 'seo-official-request.json')

export function officialBundle(): ResearchBundle {
  return parseBundle(JSON.parse(fs.readFileSync(BUNDLE_FILE, 'utf8')))
}

/** A day after recording: every source is fresh. */
export const PLAN_NOW = new Date('2026-11-23T09:00:00Z')

/** An iOS + Android language-learning app with no website. */
export const APP_ONLY: Record<string, AnswerValue> = {
  'seo.presence.web': 'none',
  'seo.presence.app': 'ios_android',
  'seo.business.model': 'b2c',
  'seo.goal.primary': 'app_installs',
  'seo.goal.timeframe': '3_to_12_months',
  'seo.market.locales': ['en', 'tr'],
  'seo.data.analytics': 'available',
  'seo.content.capacity': 'low',
  'seo.content.firsthand': 'expertise',
  'seo.competitors.named': ['WordFlight', 'CardNest'],
  'seo.app.store_status': 'live',
  'seo.app.web_openness': 'yes',
  'seo.geo.interest': 'unsure',
}

/** A B2B SaaS with an established bilingual content site. */
export const WEBSITE: Record<string, AnswerValue> = {
  'seo.presence.web': 'content_site',
  'seo.presence.app': 'none',
  'seo.business.model': 'b2b',
  'seo.goal.primary': 'leads',
  'seo.goal.timeframe': 'over_12_months',
  'seo.market.locales': ['en', 'fa'],
  'seo.web.locale_structure': 'subdirectories',
  'seo.web.maturity': 'established',
  'seo.web.control': 'full',
  'seo.data.search_console': 'verified',
  'seo.data.analytics': 'available',
  'seo.content.capacity': 'medium',
  'seo.content.firsthand': 'original_data',
  'seo.competitors.named': ['LedgerLoop'],
  'seo.geo.interest': 'yes',
  'seo.geo.crawler_policy': 'allow_search_block_training',
}

export function answerAll(ws: KnowledgeWorkspace, answers: Record<string, AnswerValue>): void {
  for (const [question_id, value] of Object.entries(answers)) recordAnswer(ws, { question_id, value })
}

export async function recordOfficial(ws: KnowledgeWorkspace, bundle: ResearchBundle = officialBundle()): Promise<void> {
  for (const outcome of await replayAll(bundle)) if (outcome.ok) recordSource(ws, outcome.source)
}
