import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import YAML from 'yaml'
import { openWorkspace } from '@brand-os/brand-core'
import { loadEvidence, parseBundle, recordSource, replayAdapter, unavailableAdapter, validateSource, type ResearchBundle } from '@brand-os/brand-core/research'
import { draftSeoStrategy, type AnswerValue } from '@brand-os/brand-core/seo'
import { workspace } from './helpers/knowledge.js'
import { answerAll, APP_ONLY, officialBundle, PLAN_NOW, recordOfficial, WEBSITE } from './helpers/seo.js'

/** Runs agent-skills/seo-strategist/evals/cases.yaml: spec §6 quality gates (a)–(l) as regression cases. */

interface Case {
  id: string
  gate: string
  base: 'app_only' | 'website'
  research: 'none' | 'official' | 'official_aged_100_days' | 'official_plus_contradiction'
  answers?: Record<string, AnswerValue | null>
  expect: {
    research_status?: string
    label?: string
    archetype?: string
    confidence?: string
    decisions_count?: number
    decisions_include?: string[]
    decisions_exclude?: string[]
    decision_status?: Record<string, string>
    decision_action?: Record<string, string>
    gaps_include?: string[]
    geo_included?: boolean
    conflicts?: string[]
    owner_decisions_match?: string[]
    measurement_baseline?: string
    markdown_includes?: string[]
    markdown_excludes?: string[]
  }
}

const file = path.resolve(import.meta.dirname, '..', 'agent-skills', 'seo-strategist', 'evals', 'cases.yaml')
const doc = YAML.parse(fs.readFileSync(file, 'utf8')) as { rubric: string; cases: Case[] }

function aged(bundle: ResearchBundle, days: number): ResearchBundle {
  const shift = (iso: string) => new Date(Date.parse(iso) - days * 86_400_000).toISOString()
  return parseBundle({ ...bundle, recorded_at: shift(bundle.recorded_at), sources: bundle.sources.map((source) => ({ ...source, retrieved_at: shift(source.retrieved_at) })) })
}

function regex(pattern: string): RegExp {
  return pattern.startsWith('(?i)') ? new RegExp(pattern.slice(4), 'im') : new RegExp(pattern, 'm')
}

test('eval file covers every spec §6 gate (a)–(l)', () => {
  assert.equal(doc.rubric, 'seo-strategist-evals/1')
  for (const letter of 'abcdefghijkl') assert.ok(doc.cases.some((item) => item.gate.startsWith(`(${letter})`)), `gate (${letter}) has a case`)
})

for (const item of doc.cases) {
  test(`eval ${item.id}: ${item.gate}`, async () => {
    const { root } = workspace({ slug: `eval-${item.id.slice(0, 20)}`, now: () => PLAN_NOW })
    const ws = openWorkspace(root, { now: () => PLAN_NOW })
    const answers: Record<string, AnswerValue> = { ...(item.base === 'app_only' ? APP_ONLY : WEBSITE) }
    for (const [id, value] of Object.entries(item.answers ?? {})) {
      if (value === null) delete answers[id]
      else answers[id] = value
    }
    answerAll(ws, answers)
    let bundle: ResearchBundle | null = null
    if (item.research !== 'none') {
      bundle = item.research === 'official_aged_100_days' ? aged(officialBundle(), 100) : officialBundle()
      await recordOfficial(ws, bundle)
    }
    if (item.research === 'official_plus_contradiction') {
      recordSource(
        ws,
        validateSource({
          url: 'https://seo-blog.example/ai-overviews-need-llms-txt',
          publisher: 'Example SEO blog',
          source_type: 'expert_opinion',
          topic: 'ai_search_features',
          retrieved_at: '2026-11-22T12:00:00Z',
          tool: 'test fixture',
          adapter: 'test',
          content_sha256: null,
          excerpts: [{ claim_key: 'google.ai_features.no_special_files', claim: 'Claims special AI files are needed.', stance: 'contradicts', quote: 'You need an llms.txt file to show up in AI Overviews.' }],
        }),
      )
    }
    const { plan, critic } = draftSeoStrategy(ws, null, { adapter: bundle ? replayAdapter(bundle) : unavailableAdapter(), save: false })
    const e = item.expect
    const ids = plan.decisions.map((decision) => decision.id)
    const decision = (id: string) => {
      const found = plan.decisions.find((entry) => entry.id === id)
      assert.ok(found, `${item.id}: decision ${id} exists (have ${ids.join(', ')})`)
      return found
    }
    assert.equal(critic.verdict, 'pass', `${item.id}: critic ${JSON.stringify(critic.blocking_findings)}`)
    assert.deepEqual([plan.state, plan.authorizes], ['draft', []])
    if (e.research_status) assert.equal(plan.research.status, e.research_status)
    if (e.label) assert.equal(plan.label, e.label)
    if (e.archetype) assert.equal(plan.archetype, e.archetype)
    if (e.confidence) assert.equal(plan.confidence.overall, e.confidence)
    if (e.decisions_count !== undefined) assert.equal(plan.decisions.length, e.decisions_count)
    for (const id of e.decisions_include ?? []) decision(id)
    for (const id of e.decisions_exclude ?? []) assert.ok(!ids.includes(id), `${item.id}: ${id} must not be planned`)
    for (const [id, status] of Object.entries(e.decision_status ?? {})) assert.equal(decision(id).status, status, `${item.id}: ${id} status`)
    for (const [id, action] of Object.entries(e.decision_action ?? {})) assert.equal(decision(id).action, action, `${item.id}: ${id} action`)
    for (const gap of e.gaps_include ?? []) {
      const [kind, ...rest] = gap.split(':')
      const want = rest.join(':')
      assert.ok(plan.evidence_gaps.some((entry) => entry.kind === kind && (!want || entry.item === want)), `${item.id}: gap ${gap} (have ${plan.evidence_gaps.map((entry) => `${entry.kind}:${entry.item}`).join(' | ')})`)
    }
    if (e.geo_included !== undefined) assert.equal(plan.geo.included, e.geo_included)
    if (e.conflicts) assert.deepEqual(plan.research.conflicts, e.conflicts)
    for (const text of e.owner_decisions_match ?? []) assert.ok(plan.owner_decisions.some((entry) => entry.includes(text)), `${item.id}: owner decision "${text}"`)
    if (e.measurement_baseline) assert.equal(plan.measurement.baseline, e.measurement_baseline)
    for (const pattern of e.markdown_includes ?? []) assert.match(plan.markdown, regex(pattern), `${item.id}: markdown includes ${pattern}`)
    for (const pattern of e.markdown_excludes ?? []) assert.doesNotMatch(plan.markdown, regex(pattern), `${item.id}: markdown excludes ${pattern}`)
    // Evidence is only what the Knowledge Inbox holds.
    assert.equal(plan.research.usable_sources, loadEvidence(ws, { now: PLAN_NOW }).items.filter((entry) => entry.usable).length)
  })
}
