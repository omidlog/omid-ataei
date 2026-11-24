import type { ComposedDraft, DocumentModel, DocumentSection, DraftLocale } from '@brand-os/brand-core'
import type { MessageKey } from '../i18n/index.js'
import { badge, code, documentItem, emptyState, tagBadge, type Tone } from './components.js'
import { html, join, type SafeHtml } from './html.js'
import { icon } from './icons.js'
import type { ViewContext } from './layout.js'

/**
 * BOS-19: the personal document reader. Each section leads with the composed draft paragraph of the chosen language
 * edition ("Draft for owner approval"), lists the facts left out as untranslated, and keeps the approved fact cards
 * below as "Sources". The edition is a query parameter (`?locale=fa|en|tr`); it only selects which projected draft is
 * shown. Read-only: nothing here composes, translates, approves or writes.
 */

const DRAFT_LOCALE_SET: ReadonlySet<string> = new Set(['en', 'fa', 'tr'])

/** The editions a document offers, in the order the core built them (the brand's default language first). */
export function documentEditions(model: DocumentModel): DraftLocale[] {
  return model.sections.find((section) => section.drafts?.length)?.drafts?.map((draft) => draft.locale) ?? []
}

/** The requested edition when the document has it, else the first one. */
export function pickEdition(model: DocumentModel, requested: string | null): DraftLocale | null {
  const editions = documentEditions(model)
  if (requested && DRAFT_LOCALE_SET.has(requested) && editions.includes(requested as DraftLocale)) return requested as DraftLocale
  return editions[0] ?? null
}

function sectionBadge(ctx: ViewContext, status: DocumentSection['status']): SafeHtml {
  const tone: Tone = status === 'complete' ? 'success' : status === 'partial' ? 'warning' : 'neutral'
  return badge(ctx.i.t(`doc.section.${status}` as MessageKey), tone, status === 'complete' ? 'checkCircle' : status === 'partial' ? 'clock' : 'circle')
}

function editionPicker(ctx: ViewContext, base: string, editions: DraftLocale[], current: DraftLocale): SafeHtml {
  const { i } = ctx
  return html`<nav class="tabs tabs-sm" aria-label="${i.t('personal.draft.edition')}" data-editions><ul>${editions.map(
    (locale) => html`<li><a class="tab ${locale === current ? 'is-active' : ''}" href="${base}&amp;locale=${locale}" lang="${locale}" ${locale === current ? html`aria-current="page"` : ''}>${i.t(`lang.${locale}` as MessageKey)}</a></li>`,
  )}</ul></nav>`
}

function draftBlock(ctx: ViewContext, section: DocumentSection, draft: ComposedDraft, labels: ReadonlyMap<string, string>): SafeHtml {
  const { i } = ctx
  const guideline = section.length?.guideline ?? draft.length?.guideline ?? null
  const words = guideline ? i.t('personal.draft.words', { words: i.number(draft.words), min: i.number(guideline[0]), max: i.number(guideline[1]) }) : i.t('personal.draft.wordsPlain', { words: i.number(draft.words) })
  return html`<div class="personal-draft" data-draft-locale="${draft.locale}">
    <div class="personal-draft-head">${badge(i.t('personal.draft.title'), 'warning', 'clock')}<span class="muted small">${i.t(`lang.${draft.locale}` as MessageKey)}</span></div>
    ${draft.text
      ? html`<p class="personal-draft-text" lang="${draft.locale}" dir="${draft.locale === 'fa' ? 'rtl' : 'ltr'}">${draft.text}</p>
          <p class="muted small" data-draft-words="${draft.words}">${words}</p>`
      : html`<p class="muted">${i.t('personal.draft.empty')}</p>`}
    ${draft.translations.length
      ? html`<ul class="personal-draft-notes small muted">${draft.translations.map((item) => html`<li>${icon('info')} <span dir="auto">${labels.get(item.id) ?? item.id}</span>: ${i.t('personal.draft.translation', { id: item.from })}</li>`)}</ul>`
      : ''}
    ${draft.untranslated.length
      ? html`<div class="personal-draft-untranslated" data-untranslated>
          <p class="small"><strong>${i.t('personal.draft.untranslated')}</strong></p>
          <ul class="small">${draft.untranslated.map((item) => html`<li><span dir="auto">${item.label}</span> ${code(item.id, 'source-id')}</li>`)}</ul>
          <p class="muted small">${i.t('personal.draft.untranslatedHint')}</p>
        </div>`
      : ''}
  </div>`
}

/** Corebook-style reader for a personal document, with the composed draft of one language edition per section. */
export function personalDocumentView(ctx: ViewContext, model: DocumentModel, idPrefix: string, base: string, requested: string | null): SafeHtml {
  const { i } = ctx
  if (model.sections.length === 0) return emptyState({ icon: 'book', title: model.title, body: i.t('doc.empty') })
  const edition = pickEdition(model, requested)
  const editions = documentEditions(model)
  const labels = new Map(model.sections.flatMap((section) => section.items.map((item) => [item.id, item.label] as const)))
  const counts = (['approved', 'assumption', 'recommendation', 'missing'] as const).map((tag) => html`<li>${tagBadge(i, tag)}<span class="count">${i.number(model.counts[tag] ?? 0)}</span></li>`)
  return html`${edition && editions.length > 0 ? editionPicker(ctx, base, editions, edition) : ''}
  <div class="doc-layout">
    <nav class="doc-toc" aria-label="${i.t('doc.chapters')}">
      <p class="toc-title">${i.t('doc.chapters')}</p>
      <ol>${model.sections.map((section) => html`<li><a href="#${idPrefix}-${section.id}"><span dir="auto">${section.title}</span>${sectionBadge(ctx, section.status)}</a></li>`)}</ol>
    </nav>
    <div class="doc-body">
      <section class="doc-counts" aria-label="${i.t('doc.counts')}"><ul>${counts}</ul></section>
      ${edition ? html`<p class="muted small">${icon('info')} ${i.t('personal.draft.hint')}</p>` : ''}
      ${model.sections.map((section) => {
        const draft = edition ? section.drafts?.find((item) => item.locale === edition) : undefined
        return html`<section class="doc-section" id="${idPrefix}-${section.id}" aria-labelledby="${idPrefix}-${section.id}-title">
          <header class="doc-section-head">
            <h2 id="${idPrefix}-${section.id}-title" dir="auto">${section.title}</h2>
            ${sectionBadge(ctx, section.status)}
          </header>
          ${section.purpose ? html`<p class="doc-section-purpose" dir="auto">${section.purpose}</p>` : ''}
          ${draft ? draftBlock(ctx, section, draft, labels) : ''}
          ${draft ? html`<h3 class="personal-sources-title">${i.t('personal.sources')}</h3>` : ''}
          <div class="doc-items">${join(section.items.map((item) => documentItem(i, item)))}</div>
        </section>`
      })}
    </div>
  </div>`
}
