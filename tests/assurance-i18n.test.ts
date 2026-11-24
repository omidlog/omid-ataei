import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import {
  ASSURANCE_LANGS,
  assess,
  CLAIM_CAP_REASONS,
  CLAIM_CAP_TEXT,
  CLAIM_LEVELS,
  CLAIM_TEXT,
  CONTROL_DOMAINS,
  CONTROL_STATUSES,
  CONTROL_TEXT,
  CRITICALITIES,
  CRITICALITY_TEXT,
  DOMAIN_TEXT,
  EVIDENCE_QUALITIES,
  EVIDENCE_QUALITY_TEXT,
  GAP_REPORT_RENDERER,
  LIMITATION_CODES,
  LIMITATION_TEXT,
  MATURITY_STATES,
  MATURITY_TEXT,
  METHOD_REGISTRY,
  METHOD_TEXT,
  POSITIONING_READINESS_CONTROLS,
  REASON_CODES,
  REASON_TEXT,
  renderGapReport,
  REPORT_TEXT,
  STATUS_TEXT,
  SYNTHETIC_DEMO,
  SYNTHETIC_DEMO_BANNER,
  SYNTHETIC_DEMO_CHANGED_SOURCE,
  SYNTHETIC_DEMO_RESTRICTED,
  methodClaim,
} from '@brand-os/brand-core/assurance'

/**
 * Trust v2 PR-A: every code the engine can emit has human text in en, fa and tr; the gap report renders
 * in all three without inventing a number; and the coverage matrix in `docs-internal/ASSURANCE.md`
 * says exactly what the code does.
 */

const PERSIAN = /[؀-ۿ]/

function assertComplete(name: string, catalog: Record<string, Record<string, string>>, codes: readonly string[]) {
  for (const code of codes) {
    const entry = catalog[code]
    assert.ok(entry, `${name}: no text for ${code}`)
    for (const lang of ASSURANCE_LANGS) assert.ok(entry[lang]?.trim(), `${name}.${code}: no ${lang} text`)
    assert.match(entry.fa!, PERSIAN, `${name}.${code}: the fa text is not Persian`)
    assert.notEqual(entry.tr, entry.en, `${name}.${code}: the tr text is the English text`)
  }
}

test('every code the engine can emit has en, fa and tr text', () => {
  assertComplete('STATUS_TEXT', STATUS_TEXT, CONTROL_STATUSES)
  assertComplete('REASON_TEXT', REASON_TEXT, REASON_CODES)
  assertComplete('LIMITATION_TEXT', LIMITATION_TEXT, LIMITATION_CODES)
  assertComplete('CLAIM_TEXT', CLAIM_TEXT, CLAIM_LEVELS)
  assertComplete('CLAIM_CAP_TEXT', CLAIM_CAP_TEXT, CLAIM_CAP_REASONS)
  assertComplete('DOMAIN_TEXT', DOMAIN_TEXT, CONTROL_DOMAINS)
  assertComplete('CRITICALITY_TEXT', CRITICALITY_TEXT, CRITICALITIES)
  assertComplete('MATURITY_TEXT', MATURITY_TEXT, MATURITY_STATES)
  assertComplete('EVIDENCE_QUALITY_TEXT', EVIDENCE_QUALITY_TEXT, EVIDENCE_QUALITIES)
  assertComplete('REPORT_TEXT', REPORT_TEXT, Object.keys(REPORT_TEXT))
  const assessable = METHOD_REGISTRY.filter((entry) => methodClaim(entry).level === 'internally_assessed').map((entry) => entry.method_id)
  assertComplete('METHOD_TEXT', METHOD_TEXT, assessable)
  for (const control of POSITIONING_READINESS_CONTROLS) {
    const text = CONTROL_TEXT[control.control_id]
    assert.ok(text, `no text for ${control.control_id}`)
    for (const part of ['label', 'intent', 'remediation'] as const) assertComplete(`CONTROL_TEXT.${control.control_id}`, { [part]: text[part] }, [part])
  }
})

test('no human text claims certification, compliance or ISO conformance', () => {
  const all = JSON.stringify([STATUS_TEXT, REASON_TEXT, LIMITATION_TEXT, CONTROL_TEXT, REPORT_TEXT, METHOD_TEXT])
  for (const phrase of [/ISO[- ]certified/i, /ISO[- ]compliant/i, /compliant with/i, /\bconforms to\b/i]) assert.doesNotMatch(all, phrase)
})

test('the gap report renders in en, fa and tr, opens with the demo banner and authorizes nothing', () => {
  const assessment = assess(SYNTHETIC_DEMO)
  for (const lang of ASSURANCE_LANGS) {
    const report = renderGapReport(assessment, lang)
    assert.ok(report.startsWith(`> **${SYNTHETIC_DEMO_BANNER}**`), `${lang}: the banner must come first`)
    assert.ok(report.includes(REPORT_TEXT.authorizes![lang]!))
    assert.ok(report.includes(GAP_REPORT_RENDERER))
    assert.ok(report.includes(assessment.method_rule_sha256) && report.includes(assessment.source_snapshot_digest))
    for (const result of assessment.control_results) assert.ok(report.includes(result.control_id))
    assert.ok(report.includes(LIMITATION_TEXT.internal_assessment_only![lang]!))
    if (lang === 'fa') assert.match(report, PERSIAN)
  }
  assert.ok(renderGapReport(assessment, 'en').includes('8 of 12 applicable controls complete, 3 excluded as not applicable'))
  assert.ok(renderGapReport(assessment, 'en').includes(`- Offer: ${REPORT_TEXT.no_maturity_signal!.en}`), 'a domain without signals is not reported as not applicable')
  assert.equal(renderGapReport(assessment, 'tr'), renderGapReport(assess(SYNTHETIC_DEMO), 'tr'), 'the report is deterministic')
})

test('a report that is not scoreable prints no ratio, and a withheld control prints no source', () => {
  const blocked = renderGapReport(assess(SYNTHETIC_DEMO_CHANGED_SOURCE), 'en')
  assert.ok(blocked.includes(REPORT_TEXT.not_scoreable!.en!))
  assert.doesNotMatch(blocked, /\d+ of \d+ applicable controls complete/)
  assert.ok(blocked.includes(REASON_TEXT.source_changed!.en!))

  const restricted = renderGapReport(assess(SYNTHETIC_DEMO_RESTRICTED), 'en')
  const section = restricted.slice(restricted.indexOf('PRR-14'), restricted.indexOf('PRR-15'))
  assert.ok(section.includes(REASON_TEXT.withheld_for_audience!.en!))
  assert.ok(!section.includes(REPORT_TEXT.sources!.en!))
  assert.ok(!restricted.includes('business.marketing.budget'))
})

test('the coverage matrix in docs-internal/ASSURANCE.md matches the controls and the registry', () => {
  const doc = fs.readFileSync('docs-internal/ASSURANCE.md', 'utf8')
  for (const status of CONTROL_STATUSES) assert.ok(doc.includes(`| \`${status}\` |`), `status ${status} is not documented`)
  for (const entry of METHOD_REGISTRY) {
    const row = doc.split('\n').find((line) => line.startsWith(`| \`${entry.method_id}\` |`))
    assert.ok(row, `registry entry ${entry.method_id} is not in the docs`)
    assert.ok(row.includes(`\`${entry.rules_access}\``) && row.includes(`\`${entry.declared_claim_level}\``) && row.includes(`\`${methodClaim(entry).level}\``), `${entry.method_id}: docs row is out of date`)
  }
  for (const control of POSITIONING_READINESS_CONTROLS) {
    const row = doc.split('\n').find((line) => line.startsWith(`| ${control.control_id} |`))
    assert.ok(row, `${control.control_id} is not in the coverage matrix`)
    const cells = row.split('|').map((cell) => cell.trim())
    assert.equal(cells[2], control.domain, `${control.control_id}: domain`)
    assert.equal(cells[3], `\`${control.applicability.rule_id}\``, `${control.control_id}: applicability`)
    const ids = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1])
    assert.deepEqual(ids(cells[4]!), control.required_question_ids, `${control.control_id}: required questions`)
    assert.deepEqual(ids(cells[5]!), control.related_question_ids, `${control.control_id}: related questions`)
    assert.equal(cells[6], control.required_evidence ? `≥ ${control.required_evidence.min} ${control.required_evidence.independence}` : '—', `${control.control_id}: evidence`)
    assert.equal(cells[7], control.evaluation_mode, `${control.control_id}: mode`)
    assert.equal(cells[8], control.decision_criticality, `${control.control_id}: criticality`)
    assert.equal(cells[9], control.privacy_classification, `${control.control_id}: privacy`)
    assert.equal(cells[10], control.maturity_signal ? 'yes' : 'no', `${control.control_id}: maturity signal`)
  }
})
