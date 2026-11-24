import type { Action, Decision, SeoStrategy } from './model.js'

/**
 * The human-readable plan. Every platform statement appears only as a verbatim quote on a `>` line that ends with
 * its source reference [S#]; the Sources table gives URL, retrieval date, the page's own stated date, trust,
 * freshness and the Knowledge note revision. Owner-supplied text (competitor names) is escaped.
 */

const ACTION_LABEL: Record<Action, string> = { do_now: 'Do now', test: 'Test', defer: 'Later / waiting', do_not_do: 'Do not do' }
const STATUS_LABEL: Record<Decision['status'], string> = {
  cited: 'cited: rests on the quoted current sources',
  brand_reasoned: 'reasoned from the owner’s answers (no platform statement involved)',
  provisional: 'PROVISIONAL: a required source is missing, stale or contradicted',
  blocked: 'BLOCKED: waiting for an owner answer',
}

export function escapeMd(text: string): string {
  return text.replace(/[\\`*_[\]<>|#]/g, (ch) => `\\${ch}`)
}

function day(iso: string): string {
  return iso.slice(0, 10)
}

function value(v: string | string[]): string {
  return escapeMd(Array.isArray(v) ? v.join(', ') : v)
}

export function renderPlan(plan: SeoStrategy): string {
  const lines: string[] = []
  const researched = plan.research.status === 'researched'
  lines.push(`# SEO strategy draft — ${escapeMd(plan.brand_slug)}`)
  lines.push('')
  lines.push(`- Plan: \`${plan.plan_id}\` (${plan.strategist}), created ${day(plan.created_at)}`)
  lines.push(`- State: DRAFT for owner review. Not approved. It authorizes no website change, publication or spend.`)
  lines.push(`- Label: ${plan.label === 'provisional' ? 'PROVISIONAL' : 'evidence-backed'}; confidence ${plan.confidence.overall}`)
  lines.push(`- Research: ${researched ? `researched (${plan.research.fresh_sources} fresh source(s), adapter ${plan.research.adapter.adapter}/${plan.research.adapter.mode})` : 'research_unavailable'}`)
  lines.push(`- Archetype: ${plan.archetype.replace(/_/g, ' ')}`)
  lines.push('')
  if (!researched) {
    lines.push('> **research_unavailable.** No source was checked for this plan. It asserts no search engine or store guidance, no keyword volume and no position. Every decision that depends on platform guidance is provisional until checked.')
    lines.push(`> Reason: ${escapeMd(plan.research.adapter.reason ?? 'no research adapter')}`)
    lines.push('')
  }
  lines.push('## Confidence')
  lines.push('')
  for (const reason of plan.confidence.reasons) lines.push(`- ${escapeMd(reason)}`)
  lines.push('')

  lines.push('## Situation and brand fit')
  lines.push('')
  for (const observation of plan.brand_fit.observations) lines.push(`- ${escapeMd(observation)}`)
  lines.push('')
  lines.push('Owner answers used (interview record; verbatim words stay in the Knowledge Inbox):')
  lines.push('')
  for (const input of plan.brand_fit.inputs) lines.push(`- \`${input.question_id}\`: ${value(input.value)}${input.owner_words ? ` (words: \`${input.owner_words}\`)` : ''}`)
  if (plan.brand_fit.approved_facts.length) {
    lines.push('')
    lines.push(`Approved brand facts read as context: ${plan.brand_fit.approved_facts.map((fact) => `\`${fact.id}\``).join(', ')}.`)
  }
  if (plan.competitor_assumptions.length) {
    lines.push('')
    lines.push(`Competitor assumptions (owner-named, unverified, positions not checked): ${plan.competitor_assumptions.map((item) => escapeMd(item.name)).join(', ')}.`)
  }
  lines.push('')

  lines.push('## Alternatives considered')
  lines.push('')
  if (plan.alternatives.length === 0) lines.push('None yet: the website/app presence is unknown.')
  else {
    lines.push('| Option | Verdict | Evidence | Feasibility | Time to signal | Brand fit | Risk | Why |')
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
    for (const alt of plan.alternatives) {
      const c = alt.criteria
      lines.push(`| ${escapeMd(alt.title)} | ${alt.verdict} | ${c.evidence_strength} | ${c.feasibility} | ${c.time_to_signal} | ${c.brand_fit} | ${c.risk} | ${escapeMd(alt.rationale)} |`)
    }
    lines.push('')
    lines.push('Criteria are qualitative levels from a declared rubric, not scores or forecasts.')
  }
  lines.push('')

  lines.push('## Decisions')
  lines.push('')
  const sourceByRef = new Map(plan.sources.map((source) => [source.ref, source]))
  let n = 0
  for (const action of ['do_now', 'test', 'defer', 'do_not_do'] as Action[]) {
    const group = plan.decisions.filter((decision) => decision.action === action)
    if (!group.length) continue
    lines.push(`### ${ACTION_LABEL[action]}`)
    lines.push('')
    for (const decision of group) {
      n += 1
      lines.push(`#### D${n}. ${escapeMd(decision.title)} (\`${decision.id}\`)`)
      lines.push('')
      lines.push(escapeMd(decision.statement))
      lines.push('')
      lines.push(`Why: ${escapeMd(decision.rationale)}`)
      lines.push('')
      for (const citation of decision.citations) {
        const source = sourceByRef.get(citation.source_ref)
        const quote = source?.quotes.find((item) => item.claim_key === citation.claim_key)?.quote
        if (!source || !quote) continue
        const stated = source.page_last_updated ? `, page says “${source.page_last_updated}”` : ', page states no date'
        lines.push(`> “${quote}” — ${source.publisher}, retrieved ${day(source.retrieved_at)}${stated} [${source.ref}]`)
        lines.push('')
      }
      if (decision.missing_claims.length) {
        lines.push(`Missing or stale evidence: ${decision.missing_claims.map((key) => `\`${key}\``).join(', ')}.`)
        lines.push('')
      }
      lines.push(`Status: ${STATUS_LABEL[decision.status]}. Confidence: ${decision.confidence}. Decided: ${day(decision.decided_at)}. Review when: ${escapeMd(decision.review_trigger)}`)
      if (decision.owner_decision) lines.push(`Owner decision needed: ${escapeMd(decision.owner_decision)}`)
      lines.push('')
    }
  }
  if (n === 0) {
    lines.push('No decisions: answer `seo.presence.web` and `seo.presence.app` first.')
    lines.push('')
  }

  lines.push('## AI discovery (GEO)')
  lines.push('')
  lines.push(`${plan.geo.included ? 'Included.' : 'Not included.'} ${escapeMd(plan.geo.reason)} No AI citation or mention is promised.`)
  lines.push('')

  lines.push('## Measurement')
  lines.push('')
  lines.push(`- Primary conversion: ${escapeMd(plan.measurement.primary_conversion)}`)
  lines.push(`- Baseline: ${plan.measurement.baseline}`)
  for (const indicator of plan.measurement.leading_indicators) lines.push(`- Leading indicator: ${escapeMd(indicator)}`)
  for (const note of plan.measurement.notes) lines.push(`- ${escapeMd(note)}`)
  lines.push('')

  if (plan.owner_decisions.length) {
    lines.push('## Owner decisions required')
    lines.push('')
    for (const item of plan.owner_decisions) lines.push(`- [ ] ${escapeMd(item)}`)
    lines.push('')
  }

  lines.push('## Evidence-gap checklist')
  lines.push('')
  for (const gap of plan.evidence_gaps) lines.push(`- [ ] **${gap.kind}** — \`${gap.item.slice(0, 160)}\`: ${escapeMd(gap.why)} Close it: ${escapeMd(gap.how_to_close)}`)
  lines.push('')

  lines.push('## Sources')
  lines.push('')
  if (plan.sources.length === 0) {
    lines.push('No source is cited.')
    if (plan.starting_points.length) {
      lines.push('')
      lines.push('Official starting points to check (not retrieved; pointers only, no claim is drawn from them):')
      lines.push('')
      for (const url of plan.starting_points) lines.push(`- <${url}>`)
    }
  } else {
    lines.push('| Ref | Publisher | Page | Retrieved | Page date | Type | Trust | Freshness | Knowledge note |')
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
    for (const source of plan.sources) {
      lines.push(
        `| ${source.ref} | ${escapeMd(source.publisher)} | <${source.url}> | ${day(source.retrieved_at)} | ${escapeMd(source.page_last_updated ?? 'none stated')} | ${source.source_type} | ${source.trust.level} (${source.trust.supports.replace(/_/g, ' ')}) | ${source.staleness.state}, ${source.staleness.age_days}/${source.staleness.max_age_days} days | \`${source.provenance}\` |`,
      )
    }
    lines.push('')
    lines.push('Official documentation states what a platform says; it is not evidence that a tactic works for this brand.')
  }
  lines.push('')
  return lines.join('\n')
}
