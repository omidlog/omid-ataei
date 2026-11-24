import type {
  MascotArtworkView,
  MascotAtlasBlock,
  MascotAtlasEntry,
  MascotCategory,
  MascotEvolutionBlock,
  MascotGapReason,
  MascotText,
  VisualCatalog,
  VisualDocument,
  VisualLang,
} from '@brand-os/brand-core/visual'
import { fillVisual, MASCOT_CATEGORIES, mascotText, visualCatalog } from '@brand-os/brand-core/visual'
import { banner } from './components.js'
import { html, join, type SafeHtml } from './html.js'
import { icon } from './icons.js'
import { frameworkNote } from './visual-identity.js'
import { illustrativeStamp, stateChip, two } from './visual-primitives.js'

/**
 * Mascot atlas and six-stage evolution sheet renderers (Visual Blueprint V3.4). Editorial catalog-book layout:
 * numbered plates, a quiet grid of framed artwork, hairline rules, recorded usage and do / don't notes beside each
 * drawing. Only approved artwork is drawn (the core decides); every other slot is a designed empty frame, never a
 * generated or guessed character. Read-only; no inline style or script (strict CSP). Catalog, artwork and asset
 * ids appear only in the details disclosure and the print appendix.
 */

export interface MascotContext {
  cat: VisualCatalog
  lang: VisualLang
  mode: 'screen' | 'print'
  doc: VisualDocument
  /** Owner-only steps; the public edition leaves them out. */
  showNext: boolean
  assetUrl: (key: string) => string | null
}

function numbers(lang: VisualLang): Intl.NumberFormat {
  return new Intl.NumberFormat(lang)
}

function count(ctx: MascotContext, template: string, values: Record<string, number>): string {
  const n = numbers(ctx.lang)
  return fillVisual(template, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, n.format(value)])))
}

const GAP_TONE: Record<MascotGapReason, { tone: string; icon: 'clock' | 'history' | 'circle' | 'lock' }> = {
  in_review: { tone: 'draft', icon: 'clock' },
  not_previewable: { tone: 'stale', icon: 'history' },
  example_only: { tone: 'missing', icon: 'circle' },
  not_drawn: { tone: 'missing', icon: 'circle' },
  not_published: { tone: 'withheld', icon: 'lock' },
}

function gapChip(t: MascotText, gap: MascotGapReason): SafeHtml {
  const meta = GAP_TONE[gap]
  return html`<span class="vz-chip vz-chip--${meta.tone}" data-gap="${gap}">${icon(meta.icon)}<span>${t.gap[gap]}</span></span>`
}

function plateHead(n: number, id: string, title: string, lead: string, ready: boolean, t: MascotText): SafeHtml {
  return html`<header class="vz-plate-head">
    <p class="vz-plate-num"><span>${two(n)}</span><span class="vz-plate-state${ready ? ' vz-plate-state--ready' : ''}">${ready ? t.ready : t.waiting}</span></p>
    <h2 class="vz-plate-title" id="${id}-t">${title}</h2>
    <p class="vz-plate-lead">${lead}</p>
  </header>`
}

/** The empty frame: crop marks around nothing, with what it waits for. Never a silhouette or a guessed character. */
function emptyFrame(t: MascotText, label: string | null): SafeHtml {
  return html`<div class="vz-mframe vz-mframe--empty" role="img" aria-label="${t.placeholderArt}"><span class="vz-mframe-crop" aria-hidden="true"></span>${label ? html`<span class="vz-mframe-label">${label}</span>` : ''}</div>`
}

/** Approved artwork, served by the existing asset route; a fixture's mock asset is a labelled frame, not a picture. */
function artFrame(ctx: MascotContext, t: MascotText, art: MascotArtworkView, alt: string): SafeHtml {
  const url = ctx.assetUrl(art.preview_key)
  if (url) return html`<div class="vz-mframe"><img class="vz-mframe-img" src="${url}" alt="${alt}" loading="lazy" decoding="async"></div>`
  if (ctx.doc.illustrative) return html`<div class="vz-mframe vz-mframe--mock" role="img" aria-label="${t.mockArt}"><span class="vz-mframe-crop" aria-hidden="true"></span><span class="vz-mframe-label">${t.mockArt}</span></div>`
  return emptyFrame(t, t.gap.not_previewable)
}

function badges(ctx: MascotContext, t: MascotText, art: MascotArtworkView): SafeHtml {
  if (ctx.doc.audience !== 'internal' || !art.badges.length) return html``
  return html`<span class="vz-master-badges">${art.badges.map((badge) => html`<span class="vz-chip vz-chip--draft vz-master-badge" data-badge="${badge}">${t.badge[badge]}</span>`)}</span>`
}

function card(ctx: MascotContext, t: MascotText, entry: MascotAtlasEntry): SafeHtml {
  const art = entry.artwork!
  const notes = (label: string, items: string[], kind: 'do' | 'dont') =>
    items.length ? html`<div class="vz-mnotes vz-mnotes--${kind}"><p class="vz-mnotes-title">${icon(kind === 'do' ? 'checkCircle' : 'skip')}<span>${label}</span></p><ul>${items.map((item) => html`<li dir="auto">${item}</li>`)}</ul></div>` : ''
  return html`<li class="vz-mcard">
    <figure class="vz-mcard-figure">${artFrame(ctx, t, art, entry.name)}</figure>
    <div class="vz-mcard-body">
      <h4 class="vz-mcard-name" dir="auto">${entry.name}</h4>
      <p class="vz-mcard-tags">${stateChip(ctx.cat, 'approved')}${entry.mvp ? html`<span class="vz-mtag">${t.coreSet}</span>` : ''}${badges(ctx, t, art)}</p>
      ${entry.usage ? html`<p class="vz-mcard-use"><span class="vz-mcard-k">${t.useLabel}</span> <span dir="auto">${entry.usage}</span></p>` : ''}
      ${notes(t.doLabel, entry.do, 'do')}
      ${notes(t.dontLabel, entry.dont, 'dont')}
      <p class="vz-mcard-file"><span class="vz-mcard-k">${t.artworkFile}</span> <span dir="auto">${art.name}</span>${art.version ? html` <span class="vz-muted" dir="ltr">v${art.version}</span>` : ''}${entry.variants ? html` · ${count(ctx, t.variants, { count: entry.variants })}` : ''}</p>
    </div>
  </li>`
}

function categories(entries: MascotAtlasEntry[]): Array<[MascotCategory, MascotAtlasEntry[]]> {
  return MASCOT_CATEGORIES.map((category) => [category, entries.filter((entry) => entry.category === category)] as [MascotCategory, MascotAtlasEntry[]]).filter(([, items]) => items.length > 0)
}

/** Designed empty state (no approved artwork, or the module is off): ghost frame, what it waits for, owner steps. */
function emptyPlate(ctx: MascotContext, t: MascotText, input: { title: string; body: string; reasons: SafeHtml[]; steps: string[] }): SafeHtml {
  return html`<div class="vz-await">
    <div class="vz-await-art">${emptyFrame(t, t.awaitingKicker)}</div>
    <div class="vz-await-copy">
      <p class="vz-await-kicker">${icon('clock')}<span>${t.awaitingKicker}</span></p>
      <h3 class="vz-await-title">${input.title}</h3>
      <p class="vz-await-body">${input.body}</p>
      ${input.reasons.length ? html`<ul class="vz-await-reasons">${input.reasons.map((reason) => html`<li>${reason}</li>`)}</ul>` : ''}
      ${ctx.showNext && input.steps.length ? html`<div class="vz-await-steps"><p class="vz-await-steps-title">${t.emptyStepsTitle}</p><ol>${input.steps.map((step) => html`<li>${step}</li>`)}</ol></div>` : ''}
    </div>
  </div>`
}

function plateFoot(ctx: MascotContext, t: MascotText): SafeHtml {
  return html`<p class="vz-foot"><span class="vz-foot-kind">${ctx.cat.text.sourceShort}</span> <span>${t.neverNote}</span></p>`
}

export function mascotAtlasView(block: MascotAtlasBlock, ctx: MascotContext): SafeHtml {
  const t = mascotText(ctx.lang)
  const id = 'ma-atlas'
  const ready = block.counts.drawn > 0
  const head = plateHead(1, id, t.atlasTitle, t.atlasLead, ready, t)
  const open = (body: SafeHtml) => html`<section class="vz-plate vz-plate--atlas" id="${id}" aria-labelledby="${id}-t">${head}${body}${plateFoot(ctx, t)}</section>`
  if (!block.module_enabled) return open(emptyPlate(ctx, t, { title: t.moduleOffTitle, body: t.moduleOffBody, reasons: [], steps: [] }))
  const internal = ctx.doc.audience === 'internal'
  const tally = html`<p class="vz-mtally">
    <span class="vz-mtally-main">${count(ctx, t.atlasCount, { drawn: block.counts.drawn, states: block.counts.states })}</span>
    ${internal && block.counts.in_review ? html`<span>${count(ctx, t.inReviewCount, { count: block.counts.in_review })}</span>` : ''}
  </p>`
  if (!ready) {
    const reasons = [html`${gapChip(t, internal ? 'not_drawn' : 'not_published')}<span>${count(ctx, t.awaitingCount, { count: block.counts.awaiting })}</span>`]
    if (internal && block.counts.in_review) reasons.push(html`${gapChip(t, 'in_review')}<span>${count(ctx, t.inReviewCount, { count: block.counts.in_review })}</span>`)
    return open(html`${tally}${emptyPlate(ctx, t, { title: t.emptyTitle, body: t.emptyBody, reasons, steps: t.emptySteps })}`)
  }
  const drawn = categories(block.entries.filter((entry) => entry.artwork))
  const waiting = categories(block.entries.filter((entry) => !entry.artwork))
  // The public edition lists only what is published; names of unpublished states stay internal.
  const awaiting = internal && waiting.length
    ? html`<section class="vz-mawait" aria-labelledby="${id}-await">
        <h3 class="vz-sub" id="${id}-await">${t.awaitingTitle}</h3>
        <p class="vz-note">${t.awaitingLead}</p>
        <dl class="vz-mawait-list">${waiting.map(([category, items]) => html`<div><dt>${t.category[category]}</dt><dd><ul>${items.map((entry) => html`<li${entry.gap === 'in_review' ? html` class="is-review"` : ''}><span dir="auto">${entry.name}</span>${entry.gap && entry.gap !== 'not_drawn' ? gapChip(t, entry.gap) : ''}</li>`)}</ul></dd></div>`)}</dl>
      </section>`
    : ''
  return open(html`${tally}
    ${drawn.map(([category, items]) => html`<section class="vz-mgroup" aria-labelledby="${id}-${category}"><h3 class="vz-sub" id="${id}-${category}">${t.category[category]}</h3><ol class="vz-mcards">${items.map((entry) => card(ctx, t, entry))}</ol></section>`)}
    ${awaiting}`)
}

export function mascotEvolutionView(block: MascotEvolutionBlock, ctx: MascotContext): SafeHtml {
  const t = mascotText(ctx.lang)
  const id = 'ma-evolution'
  const drawn = block.slots.filter((slot) => slot.artwork).length
  const head = plateHead(2, id, t.evolutionTitle, t.evolutionLead, drawn > 0, t)
  if (!block.module_enabled) return html`<section class="vz-plate vz-plate--evolution" id="${id}" aria-labelledby="${id}-t">${head}${emptyPlate(ctx, t, { title: t.moduleOffTitle, body: t.moduleOffBody, reasons: [], steps: [] })}${plateFoot(ctx, t)}</section>`
  const internal = ctx.doc.audience === 'internal'
  const slots = block.slots.map((slot) => {
    const label = fillVisual(t.stageLabel, { n: numbers(ctx.lang).format(slot.order) })
    const name = slot.name ?? (slot.definition === 'not_defined' ? t.definition.not_defined : t.stageNameHidden)
    const art = slot.artwork ? artFrame(ctx, t, slot.artwork, `${label}: ${name}`) : emptyFrame(t, null)
    const definition = slot.definition === 'approved' ? '' : internal || slot.definition === 'not_defined' ? html`<span class="vz-mtag vz-mtag--${slot.definition}">${t.definition[slot.definition]}</span>` : ''
    return html`<li class="vz-stage${slot.artwork ? ' is-drawn' : ''}">
      <p class="vz-stage-num"><span>${two(slot.order)}</span><span class="vz-vh">${label}</span></p>
      <figure class="vz-stage-figure">${art}</figure>
      <h3 class="vz-stage-name"${slot.name ? html` dir="auto"` : ''}>${name}</h3>
      <p class="vz-stage-tags">${slot.artwork ? html`${stateChip(ctx.cat, 'approved')}${badges(ctx, t, slot.artwork)}` : gapChip(t, slot.gap ?? 'not_drawn')}${definition}</p>
      ${slot.summary ? html`<p class="vz-stage-summary" dir="auto">${slot.summary}</p>` : ''}
    </li>`
  })
  return html`<section class="vz-plate vz-plate--evolution" id="${id}" aria-labelledby="${id}-t">
    ${head}
    <p class="vz-mtally"><span class="vz-mtally-main">${count(ctx, t.stagesRecorded, { count: block.recorded })}</span>${drawn === 0 ? html`<span>${t.evolutionEmptyTitle}</span>` : ''}</p>
    <ol class="vz-stages" aria-label="${t.evolutionTitle}">${slots}</ol>
    ${drawn === 0 ? html`<p class="vz-note">${t.evolutionEmptyBody}</p>` : ''}
    ${internal && block.example_configuration ? html`<p class="vz-note vz-mexample">${icon('info')}<span>${t.exampleConfigNote}</span></p>` : ''}
    ${plateFoot(ctx, t)}
  </section>`
}

function atlasOf(doc: VisualDocument): MascotAtlasBlock | undefined {
  return doc.blocks.find((block): block is MascotAtlasBlock => block.type === 'mascot_atlas')
}

function evolutionOf(doc: VisualDocument): MascotEvolutionBlock | undefined {
  return doc.blocks.find((block): block is MascotEvolutionBlock => block.type === 'mascot_evolution')
}

/** Opener: kicker, title, brand, lead, and a contents list with dotted leaders and each plate's state. */
export function mascotOpener(ctx: MascotContext, linked: boolean): SafeHtml {
  const t = mascotText(ctx.lang)
  const atlas = atlasOf(ctx.doc)
  const evolution = evolutionOf(ctx.doc)
  const items: Array<[string, string, boolean]> = [
    ['ma-atlas', t.atlasTitle, (atlas?.counts.drawn ?? 0) > 0],
    ['ma-evolution', t.evolutionTitle, (evolution?.slots.some((slot) => slot.artwork) ?? false)],
  ]
  return html`<header class="vz-opener">
    <p class="vz-kicker"><span class="vz-kicker-bar" aria-hidden="true"></span>${t.kicker}</p>
    <h1 class="vz-opener-title">${t.title}</h1>
    <p class="vz-opener-brand" dir="auto">${ctx.doc.brand_name}</p>
    <p class="vz-opener-lead">${t.lead}</p>
    <nav class="vz-toc" aria-label="${t.contents}">
      <p class="vz-toc-title">${t.contents}</p>
      <ol>${items.map(([target, title, ready], index) => html`<li class="vz-toc-item${ready ? ' is-ready' : ''}">${linked ? html`<a href="#${target}">` : ''}<span class="vz-toc-num">${two(index + 1)}</span><span class="vz-toc-name">${title}</span><span class="vz-toc-leader" aria-hidden="true"></span><span class="vz-toc-state">${ready ? t.ready : t.waiting}</span>${linked ? html`</a>` : ''}</li>`)}</ol>
    </nav>
  </header>`
}

/** Ids behind every drawn plate: the details disclosure on screen, the appendix in print. */
export function mascotIds(ctx: MascotContext): SafeHtml {
  const t = mascotText(ctx.lang)
  const rows: Array<{ label: string; state: string; art: MascotArtworkView }> = []
  for (const entry of atlasOf(ctx.doc)?.entries ?? []) if (entry.artwork) rows.push({ label: entry.name, state: entry.state_id, art: entry.artwork })
  for (const slot of evolutionOf(ctx.doc)?.slots ?? []) if (slot.artwork && slot.stage_id) rows.push({ label: `${fillVisual(t.stageLabel, { n: slot.order })}${slot.name ? ` · ${slot.name}` : ''}`, state: slot.stage_id, art: slot.artwork })
  return html`<section class="vz-panel vz-sources" aria-labelledby="ma-ids-title">
    <h2 class="vz-panel-title" id="ma-ids-title">${t.idsTitle}</h2>
    <p class="vz-muted">${t.idsLead}</p>
    ${rows.length
      ? html`<table class="vz-table">
      <thead><tr><th scope="col">${t.colState}</th><th scope="col">${t.colArtwork}</th><th scope="col">${t.colAsset}</th><th scope="col">${t.colStage}</th></tr></thead>
      <tbody>${rows.map((row) => html`<tr><th scope="row"><span class="vz-entry-label" dir="auto">${row.label}</span><code class="vz-code" dir="ltr">${row.state}</code></th><td><code class="vz-code" dir="ltr">${row.art.artwork_id}</code></td><td><code class="vz-code" dir="ltr">${row.art.asset_id}</code></td><td><code class="vz-code" dir="ltr">${row.art.stage}</code></td></tr>`)}</tbody>
    </table>`
      : html`<p class="vz-note">${t.noIds}</p>`}
  </section>`
}

export interface MascotPrintInput {
  doc: VisualDocument
  lang: VisualLang
  commit: string | null
  head: SafeHtml
  toolbar: SafeHtml
  assetUrl: (key: string) => string | null
}

/**
 * Static print view, A4 portrait (the book's named page): opener, the atlas, the evolution sheet, then the ids and
 * framework appendix. Uses the existing print path (browser Print → PDF); not the V1.2 book engine.
 */
export function mascotPrintDocument(input: MascotPrintInput, render: (block: VisualDocument['blocks'][number], ctx: MascotContext) => SafeHtml): SafeHtml {
  const { doc, lang } = input
  const cat = visualCatalog(lang)
  const t = mascotText(lang)
  const ctx: MascotContext = { cat, lang, mode: 'print', doc, showNext: false, assetUrl: input.assetUrl }
  const internal = doc.audience === 'internal'
  const edition = internal ? cat.text.editionInternal : cat.text.editionPublic
  const foot = (label: string) => html`<footer class="vz-print-foot"><span>${t.runningHead}</span><span dir="auto">${doc.brand_name}</span><span>${internal ? cat.text.classInternal : cat.text.classPublic}</span><span>${label}</span></footer>`
  const plates: Array<[string, VisualDocument['blocks'][number] | undefined]> = [
    [t.pageAtlas, atlasOf(doc)],
    [t.pageEvolution, evolutionOf(doc)],
  ]
  return html`<!doctype html>
<html lang="${lang}" dir="${cat.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="same-origin">
<title>${t.title} · ${doc.brand_name}</title>
${input.head}
</head>
<body class="vz-print-body vz-book-body${doc.illustrative ? ' vz-is-mock' : ''}">
${input.toolbar}
<main class="vz-print" id="main">
  <section class="vz-page vz-page--book vz-page--opener" aria-label="${t.title}">
    ${illustrativeStamp(cat, doc)}
    ${mascotOpener(ctx, false)}
    <dl class="vz-print-meta vz-book-meta">
      <div><dt>${cat.text.classification}</dt><dd><span class="vz-edition vz-edition--${doc.audience}">${edition}</span></dd></div>
      <div><dt>${cat.text.commit}</dt><dd><code class="vz-code" dir="ltr">${input.commit ? input.commit.slice(0, 12) : '—'}</code></dd></div>
    </dl>
    ${foot(t.title)}
  </section>
  ${plates.map(([label, block]) => (block ? html`<section class="vz-page vz-page--book vz-page--plate vz-page--mascot" aria-label="${label}">${illustrativeStamp(cat, doc)}${render(block, ctx)}${foot(label)}</section>` : ''))}
  <section class="vz-page vz-page--book vz-page--appendix" aria-label="${t.pageSources}">
    ${illustrativeStamp(cat, doc)}
    ${mascotIds(ctx)}
    ${join(doc.framework_refs.map((ref) => frameworkNote(cat, ref, 'print', lang)))}
    <p class="vz-muted vz-edition-note">${internal ? cat.text.editionInternalNote : cat.text.editionPublicNote}</p>
    ${foot(t.pageSources)}
  </section>
</main>
</body>
</html>`
}

/** The one link into the page, shown on the Assets page's mascot card. */
export function mascotLink(lang: VisualLang, slug: string): SafeHtml {
  const t = mascotText(lang)
  return banner({ tone: 'info', title: t.linkTitle, body: t.linkBody, actions: html`<a class="btn btn-secondary btn-sm" href="/brands/${slug}/brand/mascot">${icon('image')}<span>${t.linkLabel}</span></a>` })
}
