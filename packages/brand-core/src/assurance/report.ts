/**
 * A plain-text gap report for one assessment, in en / fa / tr.
 *
 * Pure: assessment in, Markdown out. It prints only what the assessment carries — ids, revisions,
 * statuses and reason codes — so it cannot print a brand value, because the assessment has none.
 * It is a review aid for the owner, not a published report: it has no manifest, no signature and no
 * audience other than the one the assessment was built for.
 *
 * The ratio line is printed only when `completeness.state` is `scoreable`. Otherwise the report says
 * there is no ratio and why. No number is ever derived here.
 */

import type { AuditAssessment } from './assess.js'
import {
  CLAIM_CAP_TEXT,
  CLAIM_TEXT,
  CONTROL_TEXT,
  CRITICALITY_TEXT,
  DOMAIN_TEXT,
  EVIDENCE_QUALITY_TEXT,
  fill,
  LIMITATION_TEXT,
  MATURITY_TEXT,
  METHOD_TEXT,
  REASON_TEXT,
  REPORT_TEXT,
  STATUS_TEXT,
  type AssuranceLang,
} from './i18n.js'
import { SYNTHETIC_DEMO_BANNER } from './fixtures.js'

/** Version of this renderer. Pinned in the report so a changed layout is a visible change. */
export const GAP_REPORT_RENDERER = 'brand-os.gap-report-md/1'

/** Text, shape and colour — never colour alone. Plain text gets the shape. */
const STATUS_GLYPH: Record<string, string> = {
  applicable_complete: '●',
  applicable_partial: '◐',
  applicable_missing: '○',
  not_applicable: '–',
  applicability_unknown: '?',
  evidence_insufficient: '◌',
  conflicted: '⚠',
  needs_review: '↻',
  blocked_by_license: '⊘',
  not_assessed: '·',
}

function t(catalog: Record<string, Record<AssuranceLang, string>>, key: string, lang: AssuranceLang): string {
  const entry = catalog[key]
  // A missing key is a bug the i18n test catches. Printing the code keeps the report honest meanwhile.
  return entry ? entry[lang] : key
}

export function renderGapReport(assessment: AuditAssessment, lang: AssuranceLang): string {
  const lines: string[] = []
  if (assessment.demo) lines.push(`> **${SYNTHETIC_DEMO_BANNER}**`, '')
  lines.push(`# ${REPORT_TEXT.title![lang]}`, '')

  lines.push(`- ${REPORT_TEXT.method![lang]}: ${t(METHOD_TEXT, assessment.method_id, lang)} (\`${assessment.method_id}\`, edition ${assessment.method_edition ?? '—'})`)
  lines.push(`- ${REPORT_TEXT.claim![lang]}: ${t(CLAIM_TEXT, assessment.claim_level, lang)}`)
  for (const cap of assessment.claim_capped_by) lines.push(`  - ${t(CLAIM_CAP_TEXT, cap, lang)}`)
  lines.push(`- ${REPORT_TEXT.as_of![lang]}: ${assessment.as_of}`)
  lines.push(`- ${REPORT_TEXT.audience![lang]}: \`${assessment.audience}\``)
  lines.push(`- ${REPORT_TEXT.rule_version![lang]}: \`${assessment.evaluation_rule_version ?? '—'}\` · ${GAP_REPORT_RENDERER}`)
  lines.push(`- ${REPORT_TEXT.rule_digest![lang]}: \`${assessment.method_rule_sha256}\``)
  lines.push(`- ${REPORT_TEXT.source_digest![lang]}: \`${assessment.source_snapshot_digest}\``, '')

  lines.push(`## ${REPORT_TEXT.completeness![lang]}`, '')
  const c = assessment.completeness
  if (c.state === 'scoreable' && c.numerator !== null && c.denominator !== null) {
    lines.push(fill(REPORT_TEXT.completeness_value![lang], { n: c.numerator, d: c.denominator, x: c.excluded }))
  } else {
    lines.push(REPORT_TEXT.not_scoreable![lang])
    for (const code of c.blocked_by) lines.push(`- ${t(REASON_TEXT, code, lang)}`)
  }
  lines.push('')

  lines.push(`## ${REPORT_TEXT.evidence![lang]}`, '')
  lines.push(t(EVIDENCE_QUALITY_TEXT, assessment.evidence_quality, lang))
  const cov = assessment.evidence_coverage
  lines.push(fill(REPORT_TEXT.coverage![lang], { n: cov.controls_with_independent_evidence, d: cov.applicable_controls }), '')

  lines.push(`## ${REPORT_TEXT.maturity![lang]}`, '')
  for (const domain of assessment.maturity_by_domain) {
    // A domain with no signal controls is not "not applicable" to the brand; the method just does not look.
    const state = domain.signal_controls === 0 ? REPORT_TEXT.no_maturity_signal![lang] : t(MATURITY_TEXT, domain.state, lang)
    lines.push(`- ${t(DOMAIN_TEXT, domain.domain, lang)}: ${state}`)
  }
  lines.push('')

  lines.push(`## ${REPORT_TEXT.controls![lang]}`, '')
  for (const result of assessment.control_results) {
    const text = CONTROL_TEXT[result.control_id]
    const label = text ? text.label[lang] : result.control_id
    lines.push(`### ${STATUS_GLYPH[result.status] ?? ''} ${result.control_id} — ${label}`)
    lines.push(`${t(STATUS_TEXT, result.status, lang)} · ${t(DOMAIN_TEXT, result.domain, lang)} · ${t(CRITICALITY_TEXT, result.criticality, lang)}`, '')
    for (const code of result.reason_codes) lines.push(`- ${t(REASON_TEXT, code, lang)}`)
    if (result.status !== 'applicable_complete' && result.status !== 'not_applicable' && text) {
      lines.push(`- ${REPORT_TEXT.next![lang]}: ${text.remediation[lang]}`)
    }
    if (result.next_questions.length > 0) lines.push(`- ${REPORT_TEXT.next_questions![lang]}: ${result.next_questions.map((id) => `\`${id}\``).join(', ')}`)
    if (result.source_refs.length > 0) {
      lines.push(`- ${REPORT_TEXT.sources![lang]}: ${result.source_refs.map((ref) => `\`${ref.kind}:${ref.id}@${ref.revision.slice(0, 12)}\` (${ref.state})`).join(', ')}`)
    }
    lines.push('')
  }

  lines.push(`## ${REPORT_TEXT.limits![lang]}`, '')
  for (const code of assessment.limitations) lines.push(`- ${t(LIMITATION_TEXT, code, lang)}`)
  lines.push(`- ${REPORT_TEXT.authorizes![lang]}`, '')
  return lines.join('\n')
}
