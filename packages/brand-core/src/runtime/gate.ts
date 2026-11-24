import { checkSvg, svgPublicationIssues } from '@brand-os/asset-catalog'
import { normalizeSvg } from '@brand-os/asset-catalog/normalize'
import { contrastRatio } from '@brand-os/design-tokens'
import { POSITIONING_READINESS, POSITIONING_READINESS_CONTROLS, assess, type AssessmentInput, type ControlInput, type ResolvedFact } from '../assurance/index.js'
import { claimConflicts } from '../content-bridge/claims.js'
import { splitItems } from '../content-bridge/sources.js'
import { coachAnalyze, CoachError } from '../coach/index.js'
import type { CoachSource } from '../coach/model.js'
import type { TaskContextPack } from '../task-context/model.js'
import { verifyPack } from '../task-context/model.js'
import { POST_FORMAT, SOCIAL_BATCH_COUNT, type CheckResult, type LayerReport, type ReportedCheck } from './model.js'
import type { BatchPlan, PostPlan } from './plan.js'
import type { RenderedPost } from './render.js'

/**
 * The Runtime's quality step. It **owns no rule**: each check below is a call into the layer that already owns it,
 * and the result is reported in that layer's own terms.
 *
 * | check | owner |
 * | --- | --- |
 * | SVG allowlist, live-text warning | `@brand-os/asset-catalog` `checkSvg` |
 * | publication gate (both SVG gates) | `@brand-os/asset-catalog` `svgPublicationIssues` |
 * | already normalized (no-op) | `@brand-os/asset-catalog/normalize` `normalizeSvg` |
 * | banned claims, availability wording | `content-bridge/claims.ts` `claimConflicts` |
 * | contrast of drawn pairs | `@brand-os/design-tokens` `contrastRatio` (WCAG 2.2 is `informed_by` in the assurance registry) |
 * | pack integrity | `task-context/model.ts` `verifyPack` |
 * | answer quality of the facts used, consistency | Strategic Coach `coachAnalyze` (owner-local) |
 * | positioning readiness of the context | Assurance `assess` over the pack's source states |
 *
 * `runtime.manifest` checks are the manifest's own integrity (the file exists, has the declared size and format, the
 * count is what was asked). They describe the artifact, not its quality, and carry no score.
 */

function check(check_id: string, layer: ReportedCheck['layer'], result: CheckResult, evidence: string[]): ReportedCheck {
  return { check_id, layer, method: 'deterministic', result, evidence: evidence.slice(0, 20) }
}

export function bannedRules(pack: TaskContextPack): { banned: Array<{ text: string; source: string }>; availability: string | null } {
  const items = Object.values(pack.sections).flat()
  const banned = items
    .filter((item) => item.key === 'banned_claims' && item.state === 'approved' && typeof item.value === 'string' && item.source_id !== 'business.marketing.availability_claim')
    .flatMap((item) => splitItems(String(item.value)).map((text) => ({ text: text.trim(), source: item.source_id! })))
    .filter((rule) => rule.text.length > 0)
  const availability = items.find((item) => item.source_id === 'business.marketing.availability_claim' && item.state === 'approved')
  return { banned, availability: typeof availability?.value === 'string' ? availability.value.trim() : null }
}

/**
 * The banned-claim guard over the copy one post carries (message, CTA, brand name), exactly as `postChecks` runs it.
 * Shared with the production-readiness projection so a planned post and a rendered post are judged by one rule.
 */
export function copyClaimConflicts(pack: TaskContextPack, post: Pick<PostPlan, 'message' | 'cta' | 'brand_name'>): { rules: ReturnType<typeof bannedRules>; conflicts: ReturnType<typeof claimConflicts> } {
  const rules = bannedRules(pack)
  const texts: Array<[string, string | null]> = [
    ['message', post.message],
    ['cta', post.cta],
    ['brand_name', post.brand_name],
  ]
  return { rules, conflicts: texts.flatMap(([field, value]) => claimConflicts(field, value, rules.banned, rules.availability)) }
}

/** Every check for one rendered post. Pure: the SVG text and the pack in, results out. */
export function postChecks(pack: TaskContextPack, plan: BatchPlan, post: PostPlan, rendered: RenderedPost): ReportedCheck[] {
  const out: ReportedCheck[] = []
  const svg = rendered.svg

  const structural = checkSvg(svg)
  out.push(
    check(
      'svg.allowlist',
      'asset-catalog.svg-check',
      !structural.ok ? 'fail' : structural.warnings.length > 0 ? 'warn' : 'pass',
      [...structural.issues.map((issue) => `issue:${issue.code}`), ...[...new Set(structural.warnings.map((warning) => `warning:${warning.code}`))]],
    ),
  )
  const publication = svgPublicationIssues(svg)
  out.push(check('svg.publication_gate', 'asset-catalog.publication', publication.length === 0 ? 'pass' : 'fail', publication.map((issue) => `issue:${issue.code}`)))
  const normalized = normalizeSvg(svg)
  out.push(
    check(
      'svg.normalized',
      'asset-catalog.normalize',
      normalized.ok && !normalized.changed ? 'pass' : normalized.ok ? 'warn' : 'fail',
      [normalized.ok ? `changed:${normalized.changed}` : `refused:${normalized.reason}`],
    ),
  )

  const size = /^<svg\b[^>]*\bwidth="(\d+)"[^>]*\bheight="(\d+)"[^>]*\bviewBox="0 0 (\d+) (\d+)"/.exec(svg)
  const dims = size ? size.slice(1).map(Number) : []
  out.push(
    check(
      'post.format',
      'runtime.manifest',
      dims.length === 4 && dims[0] === POST_FORMAT.width && dims[1] === POST_FORMAT.height && dims[2] === POST_FORMAT.width && dims[3] === POST_FORMAT.height ? 'pass' : 'fail',
      [`format:${POST_FORMAT.id}`, `declared:${dims.join('x') || 'none'}`],
    ),
  )
  // With an approved headline size, drawing it smaller to fit is a deviation from the scale and is reported as `warn`.
  const approvedSize = plan.type.slots.headline.size_source === 'approved'
  out.push(
    check(
      'post.headline_fit',
      'runtime.manifest',
      !rendered.headline.fits || (approvedSize && rendered.headline.reduced) ? 'warn' : 'pass',
      [`size:${rendered.headline.size}`, `start:${rendered.headline.start}`, `start_source:${plan.type.slots.headline.size_source}`, `lines:${rendered.headline.lines}`, 'method:estimated_advance_width'],
    ),
  )

  if (post.brand_name) out.push(check('post.signoff_fit', 'runtime.manifest', rendered.signoff.fits ? 'pass' : 'warn', [`lines:${rendered.signoff.lines}`, 'method:estimated_advance_width']))

  const { rules, conflicts } = copyClaimConflicts(pack, post)
  out.push(
    check(
      'copy.claims',
      'content-bridge.claims',
      rules.banned.length === 0 && rules.availability === null ? 'not_tested' : conflicts.length > 0 ? 'fail' : 'pass',
      conflicts.length > 0 ? conflicts.map((conflict) => `${conflict.kind}:${conflict.field}:${conflict.source}`) : [`rules:${rules.banned.length}`, `availability:${rules.availability ?? 'none'}`],
    ),
  )

  const hex = (role: string): string => plan.palette.roles.find((entry) => entry.role === role)!.hex
  const ratios = rendered.pairs.map((pair) => ({ pair, ratio: Math.round(contrastRatio(hex(pair.foreground), hex(pair.background)) * 100) / 100 }))
  const contrastResult: CheckResult = ratios.some(({ pair, ratio }) => ratio < (pair.text === 'large' ? 3 : 4.5)) ? 'fail' : ratios.some(({ ratio }) => ratio < 4.5) ? 'warn' : 'pass'
  out.push(check('color.contrast', 'design-tokens.contrast', contrastResult, [...new Set(ratios.map(({ pair, ratio }) => `${pair.foreground}/${pair.background}:${ratio}:${pair.text}`)), 'reference:w3c.wcag-2.2:informed_by']))
  return out
}

/** Checks over the whole set. Duplicates are exact (sha256, normalized message), declared before the run. */
export function setChecks(pack: TaskContextPack, posts: Array<{ post: PostPlan; sha256: string }>): ReportedCheck[] {
  const shas = new Set(posts.map((entry) => entry.sha256))
  const messages = new Set(posts.map((entry) => entry.post.message.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()))
  const layouts = new Set(posts.map((entry) => entry.post.layout))
  return [
    check('pack.digest', 'task-context.pack', verifyPack(pack) ? 'pass' : 'fail', [`context_sha256:${pack.digests.context_sha256 ?? 'none'}`]),
    check('pack.staleness', 'task-context.pack', pack.staleness === 'current' ? 'pass' : 'warn', [`staleness:${pack.staleness}`, `readiness:${pack.readiness}`]),
    check('set.count', 'runtime.manifest', posts.length === SOCIAL_BATCH_COUNT ? 'pass' : 'fail', [`posts:${posts.length}`, `requested:${SOCIAL_BATCH_COUNT}`]),
    check('set.distinct_files', 'runtime.manifest', shas.size === posts.length ? 'pass' : 'fail', [`distinct_sha256:${shas.size}`]),
    check('set.distinct_messages', 'runtime.manifest', messages.size === posts.length ? 'pass' : 'fail', [`distinct_messages:${messages.size}`]),
    check('set.layout_variety', 'runtime.manifest', layouts.size >= Math.min(5, posts.length) ? 'pass' : 'warn', [`layouts:${layouts.size}`]),
  ]
}

/**
 * Calls the Strategic Coach for every fact the posts used (`quality_review`) and once brand-wide
 * (`consistency_review`). Only the status and finding codes are kept: the coach never quotes an answer, and neither
 * does this report. Owner-local: the coach refuses itself under an agent token, and that refusal is reported.
 */
export function coachLayer(source: CoachSource | null, questionIds: string[], now: Date): LayerReport {
  if (!source) return { layer: 'coach', called: false, skipped_reason: 'not_requested', results: [], notes: [] }
  const results: Array<Record<string, unknown>> = []
  try {
    for (const id of questionIds) {
      const result = coachAnalyze(source, { mode: 'quality_review', questionId: id, now })
      results.push({ mode: result.mode, question_id: id, status: result.status, codes: result.findings.map((finding) => finding.code), context_digest: result.analysis_scope.context_digest })
    }
    const consistency = coachAnalyze(source, { mode: 'consistency_review', now })
    results.push({ mode: consistency.mode, question_id: null, status: consistency.status, codes: consistency.findings.map((finding) => finding.code), context_digest: consistency.analysis_scope.context_digest })
  } catch (error) {
    if (error instanceof CoachError) return { layer: 'coach', called: true, skipped_reason: error.code, results, notes: ['The coach refused; its refusal is reported unchanged.'] }
    throw error
  }
  return { layer: 'coach', called: true, skipped_reason: null, results, notes: ['authority: derived_advice; authorizes: []', 'Coach statuses describe the approved answers behind the copy, not the artwork.'] }
}

/**
 * Calls Assurance (`assess`) with the states of the pack's own sources: an internal assessment of the context these
 * posts were drafted from, under the original Positioning Readiness method. Facts absent from the pack are `absent`
 * (the pack does not say whether they exist for another caller). Not a certification and not a compliance claim.
 */
export function assuranceLayer(pack: TaskContextPack, brandId: string, asOf: Date, demo: boolean): LayerReport {
  const sources = new Map(pack.sources.filter((source) => source.status === 'approved').map((source) => [source.id, source]))
  const controls: ControlInput[] = POSITIONING_READINESS_CONTROLS.map((control) => {
    const facts: ResolvedFact[] = control.required_question_ids.map((id) => {
      const found = sources.get(id)
      return found
        ? { ref: { id, revision: found.revision ?? 'unknown' }, state: 'current', presence: 'approved', classification: found.classification }
        : { ref: { id, revision: 'absent' }, state: 'missing', presence: 'absent', classification: 'internal' }
    })
    return { control_id: control.control_id, facts, evidence: [], conflicts: [], review: null, maturity: null }
  })
  const input: AssessmentInput = {
    brand_id: brandId,
    method_id: POSITIONING_READINESS.method_id,
    subject: { entity_kind: 'company', sells: 'unknown', stage: 'unknown', runs_paid_media: 'unknown' },
    audience: 'internal',
    as_of: asOf,
    controls,
    demo,
  }
  const result = assess(input)
  return {
    layer: 'assurance',
    called: true,
    skipped_reason: null,
    results: [
      {
        method_id: result.method_id,
        claim_level: result.claim_level,
        completeness: result.completeness.state,
        evidence_quality: result.evidence_quality,
        limitations: result.limitations,
        source_snapshot_digest: result.source_snapshot_digest,
        controls: result.control_results.map((control) => ({ control_id: control.control_id, status: control.status, reason_codes: control.reason_codes })),
      },
    ],
    notes: ['Internal assessment of the context pack, not of the artwork. Not a certification or a compliance claim.', 'Subject fields the pack does not state are unknown, so applicability may stay unknown.'],
  }
}
