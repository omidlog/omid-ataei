import type { Locale } from '../i18n.js'
import { coachUi, CRITERION_NAMES, RULE_OUTCOME_NAMES, STATUS_NAMES } from './i18n.js'
import type { CoachFinding, CoachResult } from './model.js'

/**
 * The human-readable form of a result, in the locale the result was computed in.
 *
 * It prints only what the result already contains, so the text carries exactly the same information as
 * the JSON — including that nothing was authorized and no model was called. Persian output is plain text
 * and reads right-to-left in a terminal that supports it; no layout is baked in, so the same strings can
 * be reused by a future read-only panel without re-translation.
 */

function line(label: string, value: string): string {
  return `${label}: ${value}`
}

function renderFinding(finding: CoachFinding, locale: Locale, index: number): string[] {
  const out: string[] = []
  const status = STATUS_NAMES[locale][finding.status]
  // The criterion is shown by its localized name: a fa or tr reader should not meet an English identifier here.
  out.push(`${index}. [${finding.code}] ${status}${finding.criterion ? ` — ${CRITERION_NAMES[locale][finding.criterion]}` : ''}`)
  out.push(`   ${finding.reason}`)
  if (finding.canonical_question_id) out.push(`   ${coachUi(locale, 'useExisting')}: ${finding.canonical_question_id}`)
  if (finding.suggested_question) out.push(`   ${coachUi(locale, 'ask')}: ${finding.suggested_question}`)
  if (finding.improvement) out.push(`   ${coachUi(locale, 'improvement')}: ${finding.improvement}`)
  if (finding.improves_outputs.length > 0) out.push(`   ${coachUi(locale, 'improves')}: ${finding.improves_outputs.join(', ')}`)
  if (finding.requires_change_request) out.push(`   ${coachUi(locale, 'changeFlow')}`)
  if (finding.source_refs.length > 0) out.push(`   ${coachUi(locale, 'sources')}: ${finding.source_refs.map((ref) => `${ref.kind}:${ref.id}`).join(', ')}`)
  return out
}

export function renderCoachResult(result: CoachResult): string {
  const locale = result.locale as Locale
  const out: string[] = [
    `${coachUi(locale, 'title')} — ${result.brand_id}`,
    coachUi(locale, 'advisory'),
    '',
    line(coachUi(locale, 'mode'), result.mode),
    line(coachUi(locale, 'question'), result.question_id ?? '—'),
    line(coachUi(locale, 'status'), STATUS_NAMES[locale][result.status]),
    '',
    `${coachUi(locale, 'findings')}:`,
  ]
  if (result.findings.length === 0) out.push(coachUi(locale, 'none'))
  result.findings.forEach((finding, index) => out.push(...renderFinding(finding, locale, index + 1)))
  if (result.rule_checks && result.rule_checks.length > 0) {
    out.push('', `${coachUi(locale, 'ruleChecks')}:`)
    for (const check of result.rule_checks) {
      const guard = check.basis === 'guard_matched' ? ` (${coachUi(locale, 'ruleGuard')})` : ''
      const ids = check.question_ids.length > 0 ? ` — ${check.question_ids.join(', ')}` : ''
      out.push(`- ${check.rule_id}: ${RULE_OUTCOME_NAMES[locale][check.outcome]}${guard}${ids}`)
    }
  }
  out.push('', coachUi(locale, 'noModel'), `engine ${result.engine_version} · rules ${result.rule_version} · authorizes: []`)
  return out.join('\n')
}
