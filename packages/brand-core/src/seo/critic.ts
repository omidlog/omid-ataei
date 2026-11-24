import { normalizeForQuote } from '../research/model.js'
import type { EvidenceSet } from '../research/store.js'
import type { SeoStrategy } from './model.js'

/**
 * Independent strategy critic (rubric seo-critic/1).
 *
 * It does not import or call the strategist. It reads what the owner will read (the Markdown) and the typed plan,
 * and re-checks every citation against the Knowledge Inbox as it is now. It catches platform-policy statements
 * without a source, invented metrics (keyword volumes, positions, traffic), "latest method" claims without current
 * research, guarantees, quotes that are not in the cited note, stale or edited citations, website work for a brand
 * without a website, and offline plans that pretend to be researched. A blocking finding means the plan must not be
 * offered for approval.
 */

export const CRITIC_RUBRIC = 'seo-critic/1'

export interface Finding {
  code:
    | 'uncited_policy_claim'
    | 'fabricated_metric'
    | 'latest_claim_without_research'
    | 'guarantee_claim'
    | 'misquoted_source'
    | 'unknown_source_ref'
    | 'stale_citation'
    | 'edited_source'
    | 'assumes_nonexistent_website'
    | 'offline_claims_research'
    | 'missing_evidence_gaps'
    | 'missing_alternatives'
    | 'authorizes_action'
    | 'undated_decision'
  line: number | null
  excerpt: string
  message: string
}

export interface CriticReport {
  rubric_version: string
  plan_id: string
  verdict: 'pass' | 'blocked'
  passes: string[]
  blocking_findings: Finding[]
  warnings: Finding[]
  owner_decisions_required: string[]
}

const PLATFORM = /\b(Google|Bing|Microsoft|Apple|App Store|Google Play|Play Store|OpenAI|ChatGPT|Gemini|Perplexity|Search Console|AI Overviews?|AI Mode|Yandex)\b/
const POLICY = /\b(requires?|required|recommends?|recommended|penali[sz](?:es|ed|e)|rewards?|ranking factors?|prefers?|guidelines?|polic(?:y|ies)|algorithms?|updates?|mandates?|bans?|demotes?|boosts?|states?|says|announced|favou?rs?|must|needs?)\b/i
const METRIC = [
  /\b\d[\d,.]*\s*[kKmM]?\+?\s*(?:monthly\s+|per month\s+|a month\s+)?(?:searches|search volume|visits|visitors|clicks|impressions|installs|downloads|sessions|conversions|leads|backlinks)\b/i,
  /\b(?:search\s+)?volume\s*(?:of|:|=|is|around|about)?\s*~?\d/i,
  /\b(?:rank(?:s|ed|ing)?|position(?:ed)?)\s*(?:at\s+|of\s+|#|no\.?\s*)?\d+\b/i,
  /#\s?1\b|\bnumber one\b|\btop[- ](?:3|5|10|three|five|ten)\b/i,
  /\b\d+(?:\.\d+)?\s*%\s*(?:CTR|click-?through|conversion|increase|growth|uplift|more traffic|of searches|share)\b/i,
  /\b(?:CTR|conversion rate|keyword difficulty|domain authority|DA|DR)\s*(?:of|:|=|is)?\s*\d/i,
]
const LATEST = /\b(latest|newest|current|up-to-date|cutting-edge|20\d\d|this year['’]?s|recent(?:ly)?)\b[^.]{0,60}\b(algorithm|update|guidelines?|polic(?:y|ies)|methods?|best practices?|ranking|core update|requirements?)\b/i
const GUARANTEE = /\b(guarantee[sd]?|will rank|ensures? (?:a |the )?(?:top|first)|guaranteed (?:AI )?(?:citations?|mentions?))\b/i
const NEGATION = /\b(no|not|never|don['’]t|do not|without|refuse|nobody|cannot)\b/i
const SITE_WORK = /\b(sitemaps?|hreflang|robots(?:\.txt| rules)?|noindex|canonical|internal link(?:ing|s)?|page[- ]speed|Core Web Vitals|redirects?|site structure)\b/i
const QUOTE_LINE = /^> “(.+?)” — .+ \[(S\d+)\]$/

function sentences(line: string): string[] {
  return line.split(/(?<=[.!?])\s+(?=[A-Z“"(])/)
}

/** Lines the critic reads as the plan's own prose: everything but verbatim quote lines and the Sources table. */
function proseLines(markdown: string): Array<{ n: number; text: string; quote: RegExpExecArray | null }> {
  const out: Array<{ n: number; text: string; quote: RegExpExecArray | null }> = []
  let inSources = false
  markdown.split('\n').forEach((raw, index) => {
    if (/^## /.test(raw)) inSources = /^## Sources\b/.test(raw)
    if (inSources) return
    out.push({ n: index + 1, text: raw.replace(/\\([\\`*_[\]<>|#])/g, '$1'), quote: QUOTE_LINE.exec(raw) })
  })
  return out
}

export function critiquePlan(plan: SeoStrategy, evidence: EvidenceSet): CriticReport {
  const blocking: Finding[] = []
  const warnings: Finding[] = []
  const passes: string[] = []
  const block = (finding: Finding) => blocking.push({ ...finding, excerpt: finding.excerpt.slice(0, 200) })
  const researched = plan.research.status === 'researched'
  const byRef = new Map(plan.sources.map((source) => [source.ref, source]))
  const byNote = new Map(evidence.items.map((item) => [item.note.id, item]))

  // 1. Every quote line must be in the cited Knowledge note, at the cited revision, fresh.
  let quotes = 0
  for (const line of proseLines(plan.markdown)) {
    if (!line.quote) continue
    quotes += 1
    const [, quote, ref] = line.quote
    const source = byRef.get(ref!)
    if (!source) {
      block({ code: 'unknown_source_ref', line: line.n, excerpt: line.text, message: `${ref} is not in the Sources table.` })
      continue
    }
    const item = byNote.get(source.note_id)
    if (!item) {
      block({ code: 'unknown_source_ref', line: line.n, excerpt: line.text, message: `${ref} cites ${source.note_id}, which is not a research note in this brand.` })
      continue
    }
    if (item.note.revision !== source.revision) block({ code: 'edited_source', line: line.n, excerpt: line.text, message: `${ref}: the research note changed since the plan cited it (revision mismatch).` })
    if (!item.usable) block({ code: 'stale_citation', line: line.n, excerpt: line.text, message: `${ref}: the research note is superseded or archived.` })
    if (item.staleness.state === 'stale') block({ code: 'stale_citation', line: line.n, excerpt: line.text, message: `${ref}: retrieved ${item.source.retrieved_at.slice(0, 10)}, past the ${item.staleness.max_age_days}-day limit for ${item.staleness.topic}.` })
    const wanted = normalizeForQuote(quote!)
    if (!item.source.excerpts.some((excerpt) => normalizeForQuote(excerpt.quote) === wanted)) {
      block({ code: 'misquoted_source', line: line.n, excerpt: line.text, message: `${ref}: this quote is not in the cited research note.` })
    }
  }

  // 2. The plan's own prose: no uncited platform policy, metrics, latest-claims or guarantees.
  for (const line of proseLines(plan.markdown)) {
    if (line.quote || !line.text.trim()) continue
    if (/^\s*[-|]\s*.*\bknowledge:kn_/.test(line.text)) continue
    for (const sentence of sentences(line.text)) {
      const cited = /\[S\d+\]/.test(sentence)
      if (!cited && PLATFORM.test(sentence) && POLICY.test(sentence)) {
        block({ code: 'uncited_policy_claim', line: line.n, excerpt: sentence, message: 'A statement about what a platform requires, prefers or does, without a quoted source.' })
      }
      if (!cited && METRIC.some((pattern) => pattern.test(sentence))) {
        block({ code: 'fabricated_metric', line: line.n, excerpt: sentence, message: 'A volume, position, traffic or rate figure without a cited measurement.' })
      }
      if ((!cited || !researched) && LATEST.test(sentence) && !NEGATION.test(sentence)) {
        block({ code: 'latest_claim_without_research', line: line.n, excerpt: sentence, message: researched ? 'A "latest/current" platform claim without a cited current source.' : 'A "latest/current" platform claim in a plan made without research.' })
      }
      if (GUARANTEE.test(sentence) && !NEGATION.test(sentence)) {
        block({ code: 'guarantee_claim', line: line.n, excerpt: sentence, message: 'Promises a ranking, position or AI citation.' })
      }
    }
  }

  // 3. Typed plan consistency.
  if (!researched) {
    if (quotes > 0 || plan.sources.length > 0) block({ code: 'offline_claims_research', line: null, excerpt: plan.plan_id, message: 'research_unavailable, yet the plan quotes sources.' })
    if (plan.label !== 'provisional') block({ code: 'offline_claims_research', line: null, excerpt: plan.label, message: 'research_unavailable, yet the plan is not labelled provisional.' })
    for (const decision of plan.decisions) if (decision.status === 'cited') block({ code: 'offline_claims_research', line: null, excerpt: decision.id, message: 'research_unavailable, yet a decision is marked cited.' })
  }
  for (const decision of plan.decisions) {
    for (const citation of decision.citations) if (!byRef.has(citation.source_ref)) block({ code: 'unknown_source_ref', line: null, excerpt: decision.id, message: `${decision.id} cites ${citation.source_ref}, which is not in Sources.` })
    if (decision.status === 'cited' && decision.requires.some((key) => !decision.citations.some((citation) => citation.claim_key === key))) {
      block({ code: 'uncited_policy_claim', line: null, excerpt: decision.id, message: `${decision.id} is marked cited but a required claim has no citation.` })
    }
    if (!decision.decided_at || Number.isNaN(Date.parse(decision.decided_at))) warnings.push({ code: 'undated_decision', line: null, excerpt: decision.id, message: 'Decision has no decision date.' })
    if (plan.archetype === 'app_only' && decision.action !== 'do_not_do' && SITE_WORK.test(`${decision.title} ${decision.statement}`)) {
      block({ code: 'assumes_nonexistent_website', line: null, excerpt: `${decision.id}: ${decision.statement}`, message: 'Site-level work planned for a brand that has no website.' })
    }
  }
  if (!/^## Evidence-gap checklist$/m.test(plan.markdown) || plan.evidence_gaps.length === 0) block({ code: 'missing_evidence_gaps', line: null, excerpt: plan.plan_id, message: 'The plan has no evidence-gap checklist.' })
  if ((plan.authorizes as unknown[]).length > 0 || plan.approval !== null || plan.state !== 'draft') block({ code: 'authorizes_action', line: null, excerpt: plan.plan_id, message: 'A strategy draft must not approve or authorize anything.' })
  if (plan.archetype !== 'undetermined' && plan.alternatives.length < 2) warnings.push({ code: 'missing_alternatives', line: null, excerpt: plan.plan_id, message: 'Fewer than two genuine alternatives.' })

  if (!blocking.some((item) => ['misquoted_source', 'unknown_source_ref', 'edited_source', 'stale_citation'].includes(item.code))) passes.push(`All ${quotes} quoted source line(s) match a current, unedited research note.`)
  if (!blocking.some((item) => item.code === 'uncited_policy_claim')) passes.push('No uncited platform-policy statement.')
  if (!blocking.some((item) => item.code === 'fabricated_metric')) passes.push('No invented volume, position, traffic or rate.')
  if (!blocking.some((item) => item.code === 'latest_claim_without_research')) passes.push('No unsupported "latest method" claim.')
  if (!blocking.some((item) => item.code === 'assumes_nonexistent_website')) passes.push('Plan matches the brand’s actual web presence.')

  return {
    rubric_version: CRITIC_RUBRIC,
    plan_id: plan.plan_id,
    verdict: blocking.length ? 'blocked' : 'pass',
    passes,
    blocking_findings: blocking,
    warnings,
    owner_decisions_required: [...plan.owner_decisions, ...plan.research.conflicts.map((key) => `Sources conflict on ${key}.`)],
  }
}
