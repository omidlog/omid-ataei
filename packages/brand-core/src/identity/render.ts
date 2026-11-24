import { BRIEF_HEADINGS, PATH_SOURCE, type IdentityLang } from './i18n.js'
import type { FactRef, IdentityBrief } from './brief.js'

/**
 * Markdown rendering of the identity brief in the brief's language. Owner words and research quotes are never
 * printed: every reason, study and observation shows its `knowledge:kn_…@<sha256>` ref. Codes stay stable tokens.
 */
export function renderBrief(brief: IdentityBrief): string {
  const lang: IdentityLang = brief.lang
  const h = (key: string, vars: Record<string, string> = {}) => BRIEF_HEADINGS[key]![lang].replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`)
  const fact = (f: FactRef) => `\`${f.fact_id}\`: ${f.state === 'approved' ? `${h('approved')} @${f.revision!.slice(0, 12)}` : h('missing_fact')}`
  const lines: string[] = [`# ${h('title')} — ${brief.brand_slug}`, '', `> ${h('preamble')}`, '']

  lines.push(`- ${h('status')}: \`${brief.status}\` · ${brief.schema} · ${brief.generated_at}`)
  lines.push(`- ${h('path')}: \`${brief.path.value ?? 'unknown'}\` (${PATH_SOURCE[brief.path.source]![lang]}); intake: logo \`${brief.path.intake.choice.logo_presence}\`, intent \`${brief.path.intake.choice.identity_intent}\``)
  lines.push(`- ${h('review_state', { field: brief.decision.last_review ? `${brief.decision.last_review.reviewed_at}${brief.decision.last_review.changed_since ? ' (changed since)' : ''}` : '—' })}`)
  lines.push(`- brief_digest \`${brief.brief_digest.slice(0, 12)}\` · sources_digest \`${brief.sources_digest.slice(0, 12)}\` · authorizes: []`, '')

  lines.push(`## ${h('conclusion')}`, '', brief.conclusion.text, '')

  lines.push(`## ${h('problem')}`, '')
  lines.push(`- identity.change.reasons: ${brief.problem.reasons.join(', ') || '—'}`)
  lines.push(`- identity.change.observed: ${brief.problem.observed ?? '—'}`)
  lines.push(`- identity.success: ${brief.problem.success.join(', ') || '—'}`)
  for (const f of brief.problem.facts) lines.push(`- ${fact(f)}`)
  lines.push('')

  lines.push(`## ${h('canonical')}`, '', ...brief.canonical.map((f) => `- ${fact(f)}`), '')

  lines.push(`## ${h('assets')}`, '')
  for (const f of brief.assets.facts) lines.push(`- ${fact(f)}`)
  for (const a of brief.assets.manifest) lines.push(`- manifest \`${a.id}\`: ${a.status}${a.example ? ' (EXAMPLE, not a mark)' : ''}`)
  lines.push('')

  lines.push(`## ${h('equity')}`, '')
  if (!brief.equity.applicable) lines.push('—', '')
  else {
    lines.push('| element | choice | evidence | source | owner reason | study |', '| --- | --- | --- | --- | --- | --- |')
    for (const r of brief.equity.rows) lines.push(`| ${r.label} | ${r.choice}${r.conflict ? ' ⚠' : ''} | ${r.evidence_level} | ${r.source} | ${r.owner_reason ?? '—'} | ${r.study ?? '—'} |`)
    lines.push('')
  }

  if (brief.migration_risks.length) lines.push(`## ${h('migration')}`, '', ...brief.migration_risks.map((r) => `- ${r.text}`), '')

  lines.push(`## ${h('landscape')}`, '', `- context: \`${brief.landscape.context_state}\` · visual comparison: \`${brief.landscape.visual_comparison}\` · similarity: \`${brief.landscape.similarity}\` · digest \`${brief.landscape.source_digest.slice(0, 12)}\``)
  for (const o of brief.landscape.observations) lines.push(`- ${o.competitor}: ${o.label} — ${o.cell} ${o.ref}`)
  for (const u of brief.landscape.unresolved) lines.push(`- ${u.competitor}: ${u.ref_state} ${u.ref}`)
  for (const w of brief.landscape.warnings) lines.push(`- ! ${w.text}`)
  for (const g of brief.landscape.gaps) lines.push(`- ${g}`)
  lines.push('')

  lines.push(`## ${h('routes')}`, '')
  for (const r of brief.routes) {
    lines.push(`### [${r.id}] ${r.title}`, '', `- ${h('why')}: ${r.why}`, `- ${h('why_not')}: ${r.why_not}`)
    if (r.risks.length) lines.push(`- ${h('risks')}:`, ...r.risks.map((x) => `  - ${x.text}`))
    if (r.preserves.length) lines.push(`- ${h('preserves')}: ${r.preserves.join(', ')}`)
    if (r.may_change.length) lines.push(`- ${h('changes')}: ${r.may_change.join(', ')}`)
    lines.push(`- ${h('attributes')}: ${r.attributes.map((f) => `${f.fact_id} (${f.state})`).join(', ')}`)
    lines.push(`- ${h('red_lines')}:`, ...r.forbidden.map((x) => `  - ${x.text}`), `- rubric: ${r.rubric.join(', ')}`, '')
  }

  lines.push(`## ${h('applications')}`, '')
  if (!brief.applications.answered) lines.push(h('to_confirm'))
  for (const u of brief.applications.uses) lines.push(`- **${u.label}**`, ...u.checks.map((c) => `  - ${c.text}`))
  lines.push('')

  lines.push(`## ${h('production')}`, '', ...brief.production.map((p) => `- ${p.text}`), '')
  lines.push(`## ${h('red_lines')}`, '', ...brief.red_lines.map((r) => `- ${r.text}`), '')
  lines.push(`## ${h('rubric')}`, '', ...brief.rubric.criteria.map((c) => `- ${c.text}${c.emphasized_by.length ? ` (${c.emphasized_by.join(', ')})` : ''}`), '')

  lines.push(`## ${h('iteration')}`, '')
  if (brief.iteration.state !== 'linked') lines.push(`- ${brief.iteration.state}${brief.iteration.project_id ? ` (${brief.iteration.project_id})` : ''}`)
  for (const v of brief.iteration.variants) {
    lines.push(`- ${v.variant_id}: ${v.status}${v.describe ? ` — ${v.describe}` : ''} (asset ${v.asset})`)
    for (const r of v.reasons) lines.push(`  - ${r.verdict}${r.keep.length ? ` keep ${r.keep.join('/')}` : ''}${r.avoid.length ? ` avoid ${r.avoid.join('/')}` : ''} ${r.provenance} (${r.source_state})`)
  }
  if (brief.iteration.selection) lines.push(`- ${h('selection', { field: `${brief.iteration.project_id}/${brief.iteration.selection.variant_id}` })}`)
  lines.push('')

  lines.push(`## ${h('decision')}`, '', `- reviewer: ${brief.decision.reviewer}`, `- selected: ${brief.decision.selected_concept ?? '—'}`)
  if (brief.decision.open_concerns.length) lines.push(`- ${h('open_concerns')}:`, ...brief.decision.open_concerns.map((c) => `  - ${c.text}`))
  lines.push(`- ${h('next_revision')}: ${brief.decision.next_revision}`, `- ${h('sources')}:`, ...brief.decision.source_revisions.map((s) => `  - ${s}`), '')

  lines.push(`## ${h('handoff')}`, '', ...brief.handoff.map((x, i) => `${i + 1}. ${x.text}`), '')
  lines.push(`## ${h('missing')}`, '', ...brief.missing.map((m) => `- ${m.text}`), '')
  lines.push(`## ${h('not_known')}`, '', ...brief.not_known.map((n) => `- ${n.text}`), '')
  lines.push(`## ${h('never')}`, '', ...brief.prohibited_inferences.map((p) => `- ${p.text}`), '')
  return lines.join('\n')
}
