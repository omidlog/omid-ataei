import type {
  BmcZone,
  JourneyEmotion,
  JourneyStage,
  JourneySwimlaneBlock,
  JourneyTextLane,
  KrMeasure,
  OkrKeyResult,
  OkrTreeBlock,
  PlanText,
  SostacBlock,
  SostacSection,
  VisualCatalog,
  VisualDocument,
  VisualEntry,
  VisualLang,
} from '@brand-os/brand-core/visual'
import { fillVisual, planLabel, planText, visualCatalog } from '@brand-os/brand-core/visual'
import { html, join, type SafeHtml } from './html.js'
import { icon, type IconName } from './icons.js'
import type { BlockContext } from './visual-registry.js'
import { dateOnly, illustrativeStamp, legend, sourceFootnote, STATE_META, stateChip } from './visual-primitives.js'
import { frameworkPanel } from './visual.js'

/**
 * Visual V3.3 renderers: customer journey swimlane, SOSTAC overview and OKR tree, plus their sources, ids and the A3
 * print composition. Same rules as every visual: values escaped and never translated, states as text + icon + colour,
 * designed empty states, no inline style or script (strict CSP; SVG presentation attributes only), and no item or
 * question id in the main view (ids live in the details disclosure and the internal print appendix).
 *
 * Direction: the swimlane and the tree follow the page direction, so Persian mirrors them (stage 1 and the tree root
 * on the right). SOSTAC is a sequence and reads in the page direction too; its letters stay Latin (a standard name).
 */

type Mode = 'screen' | 'print'

function numbers(lang: VisualLang): Intl.NumberFormat {
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 4 })
}

function percent(lang: VisualLang, value: number): string {
  return new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }).format(value)
}

function labelOf(lang: VisualLang, entry: VisualEntry): string {
  return planLabel(lang, entry.id, entry.label)
}

/** Plain-label source line for one answer (never its id). */
function sourceLine(cat: VisualCatalog, lang: VisualLang, entry: VisualEntry): SafeHtml {
  // The version is set in the page's digits (Persian in fa), so it is passed as an extra part.
  const version = entry.version !== null ? [fillVisual(cat.text.version, { version: numbers(lang).format(entry.version) })] : []
  return sourceFootnote(cat, lang, { label: labelOf(lang, entry), state: entry.state, version: null, approved_at: entry.approved_at }, version)
}

const ZONE_ICON: Record<BmcZone['state'], IconName> = { complete: 'checkCircle', partial: 'clock', missing: 'circle', withheld: 'lock', not_applicable: 'skip' }

function sectionChip(cat: VisualCatalog, state: BmcZone['state']): SafeHtml {
  return html`<span class="vz-zchip vz-zchip--${state}">${icon(ZONE_ICON[state])}<span>${cat.zoneState[state]}</span></span>`
}

/** Designed empty state: ghost geometry, a title, why it is empty and (owner only) how to fill it. */
function planEmpty(t: PlanText, input: { variant: string; title: string; body: string; steps: string[] | null }): SafeHtml {
  return html`<div class="vz-plan-empty vz-plan-empty--${input.variant}">
    <span class="vz-plan-ghost vz-plan-ghost--${input.variant}" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
    <div class="vz-plan-empty-text">
      <p class="vz-plan-empty-title">${input.title}</p>
      <p class="vz-plan-empty-body">${input.body}</p>
      ${input.steps?.length ? html`<p class="vz-plan-empty-steps-title">${t.common.emptyStepsTitle}</p><ol class="vz-plan-empty-steps">${input.steps.map((step) => html`<li>${step}</li>`)}</ol>` : ''}
    </div>
  </div>`
}

function legacyNote(t: PlanText, entry: VisualEntry): SafeHtml {
  return html`<div class="vz-plan-legacy">
    ${entry.value !== null ? html`<p class="vz-entry-value" dir="auto">${entry.value}</p>` : ''}
    <p class="vz-legacy">${icon('alert')}<span>${t.common.legacyTitle}</span><span class="vz-legacy-hint">${t.common.legacyBody}</span></p>
  </div>`
}

// ---- Customer journey swimlane -------------------------------------------------------------------------------

/** Vertical position of each emotion on a 0–100 scale (best at the top). */
const EMOTION_Y: Record<JourneyEmotion, number> = { very_positive: 14, positive: 32, neutral: 50, negative: 68, very_negative: 86 }

/**
 * One cell of the emotion lane. Each cell draws its own part of the curve: from the edge it shares with the previous
 * stage (half-way between the two levels) to its centre and on to the edge it shares with the next stage, so the
 * cells join into one continuous line in either direction. A stage without a recorded emotion breaks the line.
 */
function emotionCell(t: PlanText, stages: JourneyStage[], index: number, rtl: boolean): SafeHtml {
  const stage = stages[index]!
  const level = stage.emotion
  if (!level) return html`<td class="vz-jm-cell vz-jm-cell--emotion vz-jm-cell--empty"><span class="vz-jm-none">${t.journey.emotionNone}</span></td>`
  const y = EMOTION_Y[level]
  const prev = stages[index - 1]?.emotion ?? null
  const next = stages[index + 1]?.emotion ?? null
  const startY = prev ? (EMOTION_Y[prev] + y) / 2 : null
  const endY = next ? (EMOTION_Y[next] + y) / 2 : null
  // Reading order: in RTL the previous stage is on the right.
  const leftY = rtl ? endY : startY
  const rightY = rtl ? startY : endY
  const points = [leftY !== null ? `0,${leftY}` : null, `50,${y}`, rightY !== null ? `100,${rightY}` : null].filter(Boolean).join(' ')
  return html`<td class="vz-jm-cell vz-jm-cell--emotion">
    <div class="vz-jm-emo vz-jm-emo--${level}">
      <svg class="vz-jm-curve" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <line class="vz-jm-axis" x1="0" y1="50" x2="100" y2="50" vector-effect="non-scaling-stroke"/>
        ${points.includes(' ') ? html`<polyline class="vz-jm-line" points="${points}" fill="none" vector-effect="non-scaling-stroke"/>` : ''}
      </svg>
      <span class="vz-jm-dot" aria-hidden="true"></span>
      <span class="vz-jm-emo-label">${t.journey.emotion[level]}</span>
    </div>
  </td>`
}

function laneCell(t: PlanText, value: string | null, lane: string): SafeHtml {
  if (value === null) return html`<td class="vz-jm-cell vz-jm-cell--${lane} vz-jm-cell--empty"><span class="vz-jm-none" aria-label="${t.journey.emotionNone}">${t.common.noValue}</span></td>`
  return html`<td class="vz-jm-cell vz-jm-cell--${lane}"><p dir="auto">${value}</p></td>`
}

function stageHead(t: PlanText, lang: VisualLang, stage: JourneyStage): SafeHtml {
  return html`<th scope="col" class="vz-jm-stage">
    <span class="vz-jm-stage-num">${fillVisual(t.journey.stageNum, { n: numbers(lang).format(stage.order) })}</span>
    <span class="vz-jm-stage-name" dir="auto">${stage.name}</span>
    ${stage.goal ? html`<span class="vz-jm-goal"><span class="vz-jm-k">${t.journey.goal}</span> <span dir="auto">${stage.goal}</span></span>` : ''}
    ${stage.segments.length
      ? html`<span class="vz-jm-segs"><span class="vz-jm-k">${t.journey.forSegments}</span> ${join(
          stage.segments.map((link) => (link.name !== null ? html`<span class="vz-item-tag" dir="auto">${link.name}</span>` : html`<span class="vz-item-tag vz-item-link--hidden">${t.common.linkHidden}</span>`)),
          ' ',
        )}</span>`
      : ''}
  </th>`
}

const TEXT_LANES_TOP: JourneyTextLane[] = ['touchpoints', 'actions']
const TEXT_LANES_BOTTOM: JourneyTextLane[] = ['pains', 'opportunities']

function laneHead(t: PlanText, lane: keyof PlanText['journey']['lane']): SafeHtml {
  return html`<th scope="row" class="vz-jm-lane vz-jm-lane--${lane}"><span class="vz-jm-lane-name">${t.journey.lane[lane]}</span><span class="vz-jm-lane-hint">${t.journey.laneHint[lane]}</span></th>`
}

export function journeyView(block: JourneySwimlaneBlock, ctx: BlockContext): SafeHtml {
  const { cat, lang, mode } = ctx
  const t = planText(lang)
  const rtl = cat.dir === 'rtl'
  const stages = block.stages
  const hypothesis =
    block.hypothesis && block.hypothesis.value !== null
      ? html`<aside class="vz-jm-hypo"><p class="vz-overline">${t.journey.hypothesisTitle} ${stateChip(cat, block.hypothesis.state)}</p><p class="vz-jm-hypo-text" dir="auto">${block.hypothesis.value}</p></aside>`
      : ''
  let body: SafeHtml
  if (block.legacy) body = legacyNote(t, block.source)
  else if (block.source.state === 'withheld') body = html`<p class="vz-entry-value vz-entry-value--withheld">${icon('lock')}<span>${cat.text.withheldValue}</span></p>`
  else if (!stages.length)
    body = planEmpty(t, { variant: 'journey', title: t.journey.emptyTitle, body: ctx.doc.audience === 'public' ? t.journey.emptyPublic : t.journey.emptyBody, steps: ctx.showNext ? t.journey.emptySteps : null })
  else {
    const dense = stages.length > 6 ? ' vz-jm--dense' : ''
    body = html`<div class="vz-jm-scroll"${mode === 'screen' ? html` role="region" tabindex="0" aria-label="${t.journey.stagesLabel}"` : ''}>
      <table class="vz-jm vz-jm--n${Math.min(stages.length, 10)}${dense}">
        <caption class="vz-sr">${t.journey.title}</caption>
        <thead><tr><td class="vz-jm-corner"><span class="vz-jm-corner-k">${t.journey.lanesLabel}</span> <span aria-hidden="true">${rtl ? '←' : '→'}</span> <span class="vz-jm-corner-k">${t.journey.stagesLabel}</span></td>${stages.map((stage) => stageHead(t, lang, stage))}</tr></thead>
        <tbody>
          ${TEXT_LANES_TOP.map((lane) => html`<tr class="vz-jm-row vz-jm-row--${lane}">${laneHead(t, lane)}${stages.map((stage) => laneCell(t, stage.lanes[lane], lane))}</tr>`)}
          <tr class="vz-jm-row vz-jm-row--emotion" aria-label="${t.journey.curveLabel}">${laneHead(t, 'emotion')}${stages.map((_, index) => emotionCell(t, stages, index, rtl))}</tr>
          ${TEXT_LANES_BOTTOM.map((lane) => html`<tr class="vz-jm-row vz-jm-row--${lane}">${laneHead(t, lane)}${stages.map((stage) => laneCell(t, stage.lanes[lane], lane))}</tr>`)}
          ${stages.some((stage) => stage.evidence)
            ? html`<tr class="vz-jm-row vz-jm-row--evidence"><th scope="row" class="vz-jm-lane vz-jm-lane--evidence"><span class="vz-jm-lane-name">${t.journey.evidence}</span></th>${stages.map((stage) =>
                stage.evidence ? html`<td class="vz-jm-cell vz-jm-cell--evidence"><p dir="auto">${icon('info')} ${stage.evidence}</p></td>` : html`<td class="vz-jm-cell vz-jm-cell--evidence vz-jm-cell--empty"><span class="vz-jm-none">${t.common.noValue}</span></td>`,
              )}</tr>`
            : ''}
        </tbody>
      </table>
    </div>`
  }
  return html`<section class="vz-plan vz-plan--journey" aria-label="${t.journey.title}">
    ${hypothesis}
    ${body}
    ${block.source.value !== null || block.source.state !== 'missing' ? sourceLine(cat, lang, block.source) : ''}
  </section>`
}

// ---- SOSTAC overview ---------------------------------------------------------------------------------------

const SOSTAC_LETTER: Record<SostacSection['stage'], string> = { situation: 'S', objectives: 'O', strategy: 'S', tactics: 'T', action: 'A', control: 'C' }

/** Print shows the first items of a list; the full list is in the sources table on page 2. */
const PRINT_ITEMS = 4

function planEntry(cat: VisualCatalog, t: PlanText, lang: VisualLang, entry: VisualEntry, mode: Mode): SafeHtml {
  const meta = STATE_META[entry.state]
  let body: SafeHtml
  if (entry.items && entry.items.length) {
    const shown = mode === 'print' ? entry.items.slice(0, PRINT_ITEMS) : entry.items
    const more = entry.items.length - shown.length
    body = html`<ol class="vz-items" aria-label="${fillVisual(t.common.countItems, { count: numbers(lang).format(entry.items.length) })}">${shown.map(
      (item) => html`<li class="vz-item"><span class="vz-item-name" dir="auto">${item.name}</span>${item.detail ? html`<span class="vz-item-detail" dir="auto">${item.detail}</span>` : ''}</li>`,
    )}</ol>${more > 0 ? html`<p class="vz-items-more">${fillVisual(cat.entities.moreItems, { count: numbers(lang).format(more) })}</p>` : ''}`
  } else if (entry.legacy && entry.value !== null) body = html`<p class="vz-entry-value" dir="auto">${entry.value}</p><p class="vz-legacy">${icon('alert')}<span>${t.common.legacyTitle}</span></p>`
  else if (entry.state === 'withheld') body = html`<p class="vz-entry-value vz-entry-value--withheld">${icon('lock')}<span>${cat.text.withheldValue}</span></p>`
  else if (entry.state === 'not_applicable') body = html`<p class="vz-entry-value vz-entry-value--ghost">${cat.text.notApplicableZone}</p>`
  else if (entry.value === null) body = html`<p class="vz-entry-value vz-entry-value--ghost">${entry.missing_reason ? cat.missingReason[entry.missing_reason] : cat.text.noValueYet}</p>`
  else body = html`<p class="vz-entry-value" dir="auto">${entry.value}</p>`
  return html`<li class="vz-entry vz-entry--${meta.tone}">
    <p class="vz-entry-meta"><span class="vz-entry-label">${labelOf(lang, entry)}</span>${stateChip(cat, entry.state)}${entry.version !== null ? html`<span class="vz-entry-version">${fillVisual(cat.text.version, { version: numbers(lang).format(entry.version) })}</span>` : ''}</p>
    ${body}
  </li>`
}

function sostacStage(cat: VisualCatalog, t: PlanText, lang: VisualLang, section: SostacSection, ctx: BlockContext): SafeHtml {
  const title = t.sostac.stage[section.stage]
  const id = `${ctx.idPrefix}-sostac-${section.stage}`
  const visible = section.entries.some((entry) => entry.value !== null || entry.state === 'withheld')
  const note = section.stage === 'objectives' || section.stage === 'control' ? t.sostac.toOkr : null
  return html`<li class="vz-sos vz-sos--${section.stage} vz-zstate--${section.state}" id="${id}" aria-labelledby="${id}-t">
    <header class="vz-sos-head">
      <span class="vz-sos-letter" aria-hidden="true" dir="ltr">${SOSTAC_LETTER[section.stage]}</span>
      <span class="vz-sos-num" aria-hidden="true">${numbers(lang).format(section.order)}</span>
      <h3 class="vz-sos-title" id="${id}-t">${title.title}</h3>
      ${sectionChip(cat, section.state)}
    </header>
    <p class="vz-sos-prompt">${title.prompt}</p>
    ${section.entries.length === 0
      ? html`<div class="vz-gap"><span class="vz-gap-ghost" aria-hidden="true"></span><p class="vz-gap-title">${t.sostac.stageEmpty}</p></div>`
      : !visible && ctx.doc.audience === 'public'
        ? html`<div class="vz-gap"><span class="vz-gap-ghost" aria-hidden="true"></span><p class="vz-gap-title">${t.sostac.emptyPublic}</p></div>`
        : html`<ul class="vz-entries">${section.entries.map((entry) => planEntry(cat, t, lang, entry, ctx.mode))}</ul>`}
    ${note && ctx.mode === 'screen' ? html`<p class="vz-sos-note">${note}</p>` : ''}
  </li>`
}

export function sostacView(block: SostacBlock, ctx: BlockContext): SafeHtml {
  const t = planText(ctx.lang)
  return html`<section class="vz-plan vz-plan--sostac" aria-label="${t.sostac.title}">
    <ol class="vz-sostac" aria-label="${t.sostac.flowLabel}">${block.sections.map((section) => sostacStage(ctx.cat, t, ctx.lang, section, ctx))}</ol>
  </section>`
}

// ---- OKR tree ------------------------------------------------------------------------------------------------

const MEASURE_ICON: Record<KrMeasure, IconName> = { measured: 'dot', no_baseline: 'alert', not_measured: 'circle' }

function value(lang: VisualLang, n: number | null, unit: string): SafeHtml {
  if (n === null) return html`<span class="vz-kr-none">—</span>`
  return html`<span class="vz-kr-num">${numbers(lang).format(n)}</span> <span class="vz-kr-unit" dir="auto">${unit}</span>`
}

/** A progress bar drawn only from a recorded baseline. The bar is clamped; the text says the real share. */
function progressBar(t: PlanText, lang: VisualLang, kr: OkrKeyResult, rtl: boolean): SafeHtml {
  if (kr.progress === null) return html``
  const share = Math.max(0, Math.min(1, kr.progress))
  const width = Math.round(share * 1000) / 10
  const x = rtl ? 100 - width : 0
  const flag = kr.progress >= 1 ? html`<span class="vz-kr-flag vz-kr-flag--done">${icon('check')}<span>${t.okr.exceeded}</span></span>` : kr.progress < 0 ? html`<span class="vz-kr-flag vz-kr-flag--behind">${icon('alert')}<span>${t.okr.behind}</span></span>` : ''
  return html`<div class="vz-kr-progress">
    <svg class="vz-kr-bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect class="vz-kr-track" x="0" y="0" width="100" height="6" rx="3"/>${width > 0 ? html`<rect class="vz-kr-fill" x="${x}" y="0" width="${width}" height="6" rx="3"/>` : ''}</svg>
    <p class="vz-kr-progress-text">${fillVisual(t.okr.progress, { pct: percent(lang, kr.progress) })} ${flag}</p>
  </div>`
}

function krCard(cat: VisualCatalog, t: PlanText, lang: VisualLang, kr: OkrKeyResult, num: string, source: VisualEntry, orphan: boolean): SafeHtml {
  const measured = kr.measured_on ? dateOnly(`${kr.measured_on}T00:00:00Z`, lang) : null
  return html`<article class="vz-kr vz-kr--${kr.measure}">
    <header class="vz-kr-head"><span class="vz-kr-k">${t.okr.keyResult} ${num}</span>${stateChip(cat, source.state)}</header>
    <p class="vz-kr-name" dir="auto">${kr.name}</p>
    <dl class="vz-kr-fig">
      <div class="vz-kr-fig--current"><dt>${t.okr.current}</dt><dd>${value(lang, kr.current, kr.unit)}</dd></div>
      <div class="vz-kr-fig--target"><dt>${t.okr.target}</dt><dd>${value(lang, kr.target, kr.unit)}</dd></div>
      ${kr.baseline !== null ? html`<div class="vz-kr-fig--baseline"><dt>${t.okr.baseline}</dt><dd>${value(lang, kr.baseline, kr.unit)}</dd></div>` : ''}
    </dl>
    ${progressBar(t, lang, kr, cat.dir === 'rtl')}
    <p class="vz-kr-measure vz-kr-measure--${kr.measure}">${icon(MEASURE_ICON[kr.measure])}<span>${t.okr.measure[kr.measure]}</span></p>
    <p class="vz-kr-source"><span class="vz-kr-k">${t.okr.source}</span> <span dir="auto">${kr.source}</span>${measured ? html` · <span class="vz-kr-k">${t.okr.measuredOn}</span> ${measured}` : ''}</p>
    ${orphan ? html`<p class="vz-kr-orphan">${icon('alert')}<span>${kr.objective ? (kr.objective.name ?? t.okr.objectiveHidden) : t.okr.noObjective}</span></p>` : ''}
  </article>`
}

export function okrTreeView(block: OkrTreeBlock, ctx: BlockContext): SafeHtml {
  const { cat, lang } = ctx
  const t = planText(lang)
  const nf = numbers(lang)
  const root = block.root
  const rootCard = html`<div class="vz-okr-root">
    <p class="vz-okr-k">${t.okr.root}</p>
    ${root && root.value !== null ? html`<p class="vz-okr-root-text" dir="auto">${root.value}</p>${stateChip(cat, root.state)}` : html`<p class="vz-okr-root-text vz-okr-root-text--ghost">${t.okr.rootMissing}</p>`}
  </div>`
  const legacy = [block.legacy.objectives ? legacyNote(t, block.objectives_source) : '', block.legacy.key_results ? legacyNote(t, block.key_results_source) : '']
  const total = block.objectives.reduce((sum, objective) => sum + objective.key_results.length, 0) + block.unlinked.length
  let tree: SafeHtml
  if (!block.objectives.length && !block.unlinked.length) {
    tree = block.legacy.objectives || block.legacy.key_results
      ? html``
      : planEmpty(t, { variant: 'okr', title: t.okr.emptyTitle, body: ctx.doc.audience === 'public' ? t.okr.emptyPublic : t.okr.emptyBody, steps: ctx.showNext ? t.okr.emptySteps : null })
  } else {
    const branches = block.objectives.map((objective, index) => {
      const n = nf.format(index + 1)
      return html`<li class="vz-okr-branch">
        <article class="vz-okr-obj">
          <header class="vz-kr-head"><span class="vz-okr-k">${t.okr.objective} ${n}</span>${stateChip(cat, block.objectives_source.state)}</header>
          <p class="vz-okr-obj-name" dir="auto">${objective.name}</p>
          ${objective.detail ? html`<p class="vz-okr-obj-detail" dir="auto">${objective.detail}</p>` : ''}
          ${objective.period ? html`<p class="vz-okr-period"><span class="vz-kr-k">${t.okr.period}</span> <span dir="auto">${objective.period}</span></p>` : ''}
        </article>
        ${objective.key_results.length
          ? html`<ol class="vz-okr-krs">${objective.key_results.map((kr, krIndex) => html`<li class="vz-okr-leaf">${krCard(cat, t, lang, kr, `${n}.${nf.format(krIndex + 1)}`, block.key_results_source, false)}</li>`)}</ol>`
          : html`<div class="vz-okr-krs vz-okr-krs--empty"><p class="vz-kr-none">${t.okr.noKeyResults}</p></div>`}
      </li>`
    })
    tree = html`<div class="vz-okr-tree" role="group" aria-label="${t.okr.treeLabel}">
      ${rootCard}
      ${block.objectives.length ? html`<ol class="vz-okr-objectives">${branches}</ol>` : ''}
    </div>
    ${block.unlinked.length
      ? html`<section class="vz-okr-unlinked" aria-label="${t.okr.unlinkedTitle}"><h3 class="vz-okr-unlinked-title">${t.okr.unlinkedTitle}</h3><p class="vz-muted">${t.okr.unlinkedLead}</p><div class="vz-okr-unlinked-grid">${block.unlinked.map((kr, index) => krCard(cat, t, lang, kr, nf.format(index + 1), block.key_results_source, true))}</div></section>`
      : ''}`
  }
  const showRootAlone = !block.objectives.length && !block.unlinked.length
  return html`<section class="vz-plan vz-plan--okr" aria-label="${t.okr.title}">
    ${block.objectives.length || block.unlinked.length ? html`<p class="vz-okr-counts">${fillVisual(t.okr.counts, { objectives: nf.format(block.objectives.length), results: nf.format(total) })}</p>` : ''}
    ${showRootAlone && root && root.value !== null ? rootCard : ''}
    ${legacy}
    ${tree}
    <p class="vz-okr-note">${t.okr.planNote}</p>
    <div class="vz-okr-sources">${sourceLine(cat, lang, block.objectives_source)}${sourceLine(cat, lang, block.key_results_source)}</div>
  </section>`
}

// ---- sources, ids, next questions ----------------------------------------------------------------------------

/** Every answer a V3.3 document is drawn from, in reading order. */
export function planEntries(doc: VisualDocument): VisualEntry[] {
  const out: VisualEntry[] = []
  for (const block of doc.blocks) {
    if (block.type === 'journey_swimlane') out.push(block.source, ...(block.hypothesis ? [block.hypothesis] : []))
    else if (block.type === 'sostac_overview') out.push(...block.sections.flatMap((section) => section.entries))
    else if (block.type === 'okr_tree') out.push(block.objectives_source, block.key_results_source, ...(block.root ? [block.root] : []))
  }
  return out
}

export function planSourcesTable(cat: VisualCatalog, lang: VisualLang, doc: VisualDocument): SafeHtml {
  const t = planText(lang)
  const rows = planEntries(doc)
  return html`<section class="vz-panel vz-plan-sources">
    <h2 class="vz-panel-title">${t.common.sourcesTitle}</h2>
    <p class="vz-muted">${t.common.sourcesLead}</p>
    <table class="vz-table">
      <thead><tr><th scope="col">${t.common.colAnswer}</th><th scope="col">${t.common.colState}</th><th scope="col">${t.common.colVersion}</th><th scope="col">${t.common.colApproved}</th></tr></thead>
      <tbody>${rows.map(
        (entry) => html`<tr><th scope="row">${labelOf(lang, entry)}</th><td>${stateChip(cat, entry.state)}</td><td>${entry.version !== null ? numbers(lang).format(entry.version) : '—'}</td><td>${dateOnly(entry.approved_at, lang) ?? '—'}</td></tr>`,
      )}</tbody>
    </table>
  </section>`
}

function nextOf(doc: VisualDocument): Array<{ id: string; kind: 'existing' | 'proposed' }> {
  const out: Array<{ id: string; kind: 'existing' | 'proposed' }> = []
  for (const block of doc.blocks) {
    if (block.type === 'journey_swimlane' || block.type === 'okr_tree') out.push(...block.next_questions)
    else if (block.type === 'sostac_overview') out.push(...block.sections.flatMap((section) => section.next_questions))
  }
  return out.filter((q, index) => out.findIndex((other) => other.id === q.id) === index)
}

/** Ids for the interview command and agents: never in the main view (details disclosure, internal print appendix). */
export function planIdsPanel(cat: VisualCatalog, lang: VisualLang, doc: VisualDocument): SafeHtml {
  const t = planText(lang)
  const items: Array<[string, string]> = []
  for (const block of doc.blocks) {
    if (block.type === 'journey_swimlane') items.push(...block.stages.map((stage) => [stage.id, stage.name] as [string, string]))
    if (block.type === 'okr_tree') {
      items.push(...block.objectives.map((objective) => [objective.id, objective.name] as [string, string]))
      items.push(...[...block.objectives.flatMap((objective) => objective.key_results), ...block.unlinked].map((kr) => [kr.id, kr.name] as [string, string]))
    }
  }
  const next = nextOf(doc)
  const related = doc.blocks.flatMap((block) => (block.type === 'sostac_overview' ? block.sections.flatMap((section) => section.related) : []))
  return html`<section class="vz-panel vz-plan-ids">
    <h2 class="vz-panel-title">${t.common.idsTitle}</h2>
    <p class="vz-muted">${t.common.idsLead}</p>
    <ul class="vz-plan-idlist">${planEntries(doc).map((entry) => html`<li><span>${labelOf(lang, entry)}</span> <code class="vz-code" dir="ltr">${entry.id}</code></li>`)}</ul>
    ${items.length ? html`<ul class="vz-plan-idlist vz-plan-idlist--items">${items.map(([id, name]) => html`<li><code class="vz-code" dir="ltr">${id}</code> <span dir="auto">${name}</span></li>`)}</ul>` : ''}
    ${next.length
      ? html`<h3 class="vz-panel-title">${t.common.nextTitle}</h3><p class="vz-muted">${t.common.nextLead}</p><ul class="vz-plan-idlist">${next.map(
          (q) => html`<li><span class="vz-next-kind">${q.kind === 'proposed' ? cat.text.proposedQuestion : cat.text.existingQuestion}</span> <code class="vz-code" dir="ltr">${q.id}</code>${q.kind === 'proposed' ? html` <span class="vz-muted">${t.common.notInBank}</span>` : ''}</li>`,
        )}</ul>`
      : ''}
    ${related.length ? html`<h3 class="vz-panel-title">${t.common.relatedTitle}</h3><p>${join([...new Set(related)].map((id) => html`<code class="vz-code" dir="ltr">${id}</code>`), ' ')}</p>` : ''}
  </section>`
}

// ---- page titles and the A3 print composition ----------------------------------------------------------------

export function planTitles(lang: VisualLang, kind: VisualDocument['document_kind']): { kicker: string; title: string; lead: string; back: string } {
  const t = planText(lang)
  if (kind === 'customer_journey') return t.journey
  if (kind === 'sostac_overview') return t.sostac
  return t.okr
}

export interface PlanPrintInput {
  doc: VisualDocument
  lang: VisualLang
  commit: string | null
  head: SafeHtml
  toolbar: SafeHtml
  render: (block: VisualDocument['blocks'][number], ctx: BlockContext) => SafeHtml
}

/**
 * Static print view, A3 landscape: page 1 the visual, page 2 sources, method and (internal edition) ids and next
 * questions. Folios are set in the page language (Persian digits in fa); no browser margin counter is used.
 */
export function planPrintDocument(input: PlanPrintInput): SafeHtml {
  const { doc, lang } = input
  const cat = visualCatalog(lang)
  const t = planText(lang)
  const titles = planTitles(lang, doc.document_kind)
  const internal = doc.audience === 'internal'
  const asOf = dateOnly(doc.as_of, lang)
  const nf = numbers(lang)
  const ctx: BlockContext = { cat, lang, mode: 'print', doc, idPrefix: 'p', showNext: false, assetUrl: () => null }
  const foot = (page: string, n: number) =>
    html`<footer class="vz-print-foot"><span>${titles.kicker}</span><span dir="auto">${doc.brand_name}</span><span>${internal ? cat.text.classInternal : cat.text.classPublic}</span><span>${page} · ${fillVisual(t.common.folio, { page: nf.format(n), pages: nf.format(2) })}</span></footer>`
  const ref = doc.framework_refs[0]
  return html`<!doctype html>
<html lang="${lang}" dir="${cat.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="same-origin">
<title>${titles.title} · ${doc.brand_name}</title>
${input.head}
</head>
<body class="vz-print-body vz-plan-print vz-plan-print--${doc.document_kind}${doc.illustrative ? ' vz-is-mock' : ''}">
${input.toolbar}
<main class="vz-print" id="main">
  <section class="vz-page vz-page--plan vz-page--plan-main" aria-label="${t.common.pageMain}">
    ${illustrativeStamp(cat, doc)}
    <header class="vz-print-head">
      <div class="vz-print-titles">
        <p class="vz-kicker"><span class="vz-kicker-bar" aria-hidden="true"></span>${titles.kicker}</p>
        <h1 class="vz-print-title">${titles.title}</h1>
        <p class="vz-print-brand" dir="auto">${doc.brand_name}</p>
      </div>
      <dl class="vz-print-meta">
        <div><dt>${cat.text.classification}</dt><dd><span class="vz-edition vz-edition--${doc.audience}">${internal ? cat.text.editionInternal : cat.text.editionPublic}</span></dd></div>
        <div><dt>${cat.text.asOfLabel}</dt><dd>${asOf ? fillVisual(cat.text.asOf, { date: asOf }) : cat.text.asOfNone}</dd></div>
        <div><dt>${cat.text.commit}</dt><dd><code class="vz-code" dir="ltr">${input.commit ? input.commit.slice(0, 12) : '—'}</code></dd></div>
      </dl>
    </header>
    <p class="vz-plan-lead">${titles.lead}</p>
    ${join(doc.blocks.map((block) => input.render(block, ctx)))}
    <div class="vz-print-under">
      ${legend(cat, ['approved', 'stale', 'assumption', 'withheld', 'missing'])}
      ${ref ? html`<p class="vz-attrib"><span class="vz-claim-kind">${cat.claim[ref.permitted_claim]}</span> <span dir="ltr">${ref.title} · ${ref.authority}</span></p>` : ''}
    </div>
    ${foot(t.common.pageMain, 1)}
  </section>
  <section class="vz-page vz-page--plan vz-page--plan-sources" aria-label="${t.common.pageSources}">
    ${foot(t.common.pageSources, 2)}
    ${illustrativeStamp(cat, doc)}
    <div class="vz-sources-grid">
      <div class="vz-main">${planSourcesTable(cat, lang, doc)}<p class="vz-muted vz-edition-note">${internal ? cat.text.editionInternalNote : cat.text.editionPublicNote}</p></div>
      <div class="vz-side">
        ${ref ? frameworkPanel(cat, ref, lang, 'print') : ''}
        ${internal ? planIdsPanel(cat, lang, doc) : ''}
      </div>
    </div>
  </section>
</main>
</body>
</html>`
}

