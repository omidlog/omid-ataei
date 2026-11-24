import { filterStudioKnowledge, isNoteId, NOTE_KINDS, NOTE_STATUSES, type NoteKind, type NoteStatus, type StudioKnowledgeProjection, type StudioNote, type StudioNoteLink } from '@brand-os/brand-core'
import type { MessageKey } from '../i18n/index.js'
import { badge, banner, code, copyBlock, emptyState, externalLink, shortSha } from './components.js'
import { html, join, safeGitHubUrl, type SafeHtml } from './html.js'
import { icon } from './icons.js'
import { brandPath, type BrandSection, type BrandView, type ViewContext } from './layout.js'
import { brandHeader, brandShell } from './pages.js'

/**
 * The read-only Knowledge page: shared notes from the merged default branch, labelled as unverified ideas.
 * Everything is rendered through the escaping `html` template. Note bodies are shown as plain text; the only
 * markup produced from a note is a same-origin link for `[[kn_…]]` when that note is itself projected.
 * There are no forms that change anything: the search form is a GET.
 */

export interface KnowledgeQuery {
  q: string
  status: NoteStatus | null
  tag: string | null
  kind: NoteKind | null
  note: string | null
}

export function parseKnowledgeQuery(params: URLSearchParams): KnowledgeQuery {
  const status = params.get('status')
  const kind = params.get('kind')
  const tag = params.get('tag')
  const note = params.get('note')
  return {
    q: (params.get('q') ?? '').slice(0, 200),
    status: (NOTE_STATUSES as readonly string[]).includes(status ?? '') ? (status as NoteStatus) : null,
    kind: (NOTE_KINDS as readonly string[]).includes(kind ?? '') ? (kind as NoteKind) : null,
    tag: tag && tag.length <= 48 ? tag : null,
    note: note !== null && isNoteId(note) ? note : note === null ? null : '',
  }
}

const SECTION_FOR_GROUP: Record<string, BrandSection> = { brand: 'brand-book', business: 'business', personal: 'personal' }

function base(view: BrandView): string {
  return brandPath(view.record.slug, 'knowledge')
}

function href(view: BrandView, params: Record<string, string | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
  const rest = search.toString()
  return `${base(view)}${rest ? `?${rest}` : ''}`
}

function ideaLabels(ctx: ViewContext): SafeHtml {
  return html`${badge(ctx.i.t('knowledge.label'), 'warning', 'idea')}${badge(ctx.i.t('knowledge.notFact'), 'neutral', 'alert')}`
}

function statusBadge(ctx: ViewContext, status: NoteStatus): SafeHtml {
  return badge(ctx.i.t(`knowledge.status.${status}` as MessageKey), status === 'archived' ? 'neutral' : status === 'active' ? 'info' : 'neutral')
}

function fileUrl(view: BrandView, note: StudioNote): string | null {
  const sha = view.cached.status.sha
  if (!sha || !/^[0-9a-f]{7,64}$/.test(sha)) return null
  return safeGitHubUrl(`https://github.com/${view.record.repo.owner}/${view.record.repo.name}/blob/${sha}/${note.path}`)
}

function noteCard(ctx: ViewContext, view: BrandView, note: StudioNote, snippet: string | null): SafeHtml {
  const { i } = ctx
  return html`<li class="card note-card">
    <div class="note-card-head">
      <h3 class="note-title" dir="auto"><a href="${href(view, { note: note.id })}">${note.title}</a></h3>
      <div class="note-badges">${badge(i.t('knowledge.label'), 'warning', 'idea')}${badge(i.t(`knowledge.kind.${note.kind}` as MessageKey), 'neutral')}${statusBadge(ctx, note.status)}</div>
    </div>
    <p class="note-excerpt" dir="auto">${snippet ?? note.excerpt}</p>
    <div class="note-meta muted small">
      <span>${i.t('knowledge.updated', { time: i.relative(note.updated_at, ctx.now) })}</span>
      ${note.tags.length ? html`<span class="note-tags">${join(note.tags.slice(0, 8).map((tag) => html`<a class="tag-link" dir="auto" href="${href(view, { tag })}">#${tag}</a>`), ' ')}</span>` : ''}
    </div>
  </li>`
}

function filters(ctx: ViewContext, view: BrandView, k: StudioKnowledgeProjection, query: KnowledgeQuery): SafeHtml {
  const { i } = ctx
  const tags = [...new Set(k.notes.flatMap((note) => note.tags))].sort().slice(0, 200)
  return html`<section class="card" aria-labelledby="kn-search-title">
    <h2 class="visually-hidden" id="kn-search-title">${i.t('knowledge.search')}</h2>
    <form class="kn-filters" method="get" action="${base(view)}" role="search">
      <div class="field kn-q">
        <label class="field-label" for="kn-q">${i.t('knowledge.search')}</label>
        <input class="input" id="kn-q" name="q" type="search" dir="auto" maxlength="200" value="${query.q}">
      </div>
      <div class="field">
        <label class="field-label" for="kn-status">${i.t('knowledge.filterStatus')}</label>
        <select class="input" id="kn-status" name="status">
          <option value="">${i.t('knowledge.anyStatus')}</option>
          ${NOTE_STATUSES.map((status) => html`<option value="${status}" ${query.status === status ? 'selected' : ''}>${i.t(`knowledge.status.${status}` as MessageKey)} (${i.number(k.by_status[status])})</option>`)}
        </select>
      </div>
      <div class="field">
        <label class="field-label" for="kn-kind">${i.t('knowledge.filterKind')}</label>
        <select class="input" id="kn-kind" name="kind">
          <option value="">${i.t('knowledge.anyKind')}</option>
          ${NOTE_KINDS.map((kind) => html`<option value="${kind}" ${query.kind === kind ? 'selected' : ''}>${i.t(`knowledge.kind.${kind}` as MessageKey)}</option>`)}
        </select>
      </div>
      <div class="field">
        <label class="field-label" for="kn-tag">${i.t('knowledge.filterTag')}</label>
        <select class="input" id="kn-tag" name="tag">
          <option value="">—</option>
          ${tags.map((tag) => html`<option value="${tag}" ${query.tag === tag ? 'selected' : ''}>${tag}</option>`)}
        </select>
      </div>
      <div class="button-row kn-actions">
        <button class="btn btn-primary" type="submit">${icon('sparkle')}<span>${i.t('knowledge.searchButton')}</span></button>
        <a class="btn btn-secondary" href="${base(view)}">${i.t('knowledge.clear')}</a>
      </div>
    </form>
  </section>`
}

function withheldSection(ctx: ViewContext, k: StudioKnowledgeProjection): SafeHtml {
  const { i } = ctx
  if (!k.withheld.length) return html``
  return html`<section class="card" aria-labelledby="kn-withheld-title">
    <h2 class="card-title" id="kn-withheld-title">${icon('lock')} ${i.t('knowledge.withheldTitle')}</h2>
    <p class="muted">${i.t('knowledge.withheldBody')}</p>
    <ul class="kn-withheld">${k.withheld.map((item) => html`<li>${code(item.path, 'small')} ${badge(i.t(`knowledge.reason.${item.reason}` as MessageKey), 'warning', 'alert')}</li>`)}</ul>
  </section>`
}

export function knowledgePage(ctx: ViewContext, view: BrandView, query: KnowledgeQuery, flash: string | null): SafeHtml {
  const { i } = ctx
  const p = view.cached.projection
  if (!p) return brandShell(ctx, view, 'knowledge', i.t('knowledge.title'), html``, flash)
  const header = brandHeader(ctx, view, i.t('knowledge.title'), i.t('knowledge.subtitle'))
  const k = p.knowledge
  if (k === undefined) return brandShell(ctx, view, 'knowledge', i.t('knowledge.title'), html`${header}${banner({ tone: 'info', body: i.t('knowledge.pending') })}`, flash)
  if (k === null) return brandShell(ctx, view, 'knowledge', i.t('knowledge.title'), html`${header}${banner({ tone: 'warning', body: i.t('knowledge.unavailable') })}`, flash)
  if (k.total === 0) {
    const body = html`${header}${emptyState({ icon: 'idea', title: i.t('knowledge.emptyTitle'), body: i.t('knowledge.emptyBody') })}${withheldSection(ctx, k)}`
    return brandShell(ctx, view, 'knowledge', i.t('knowledge.title'), body, flash)
  }
  const filtered = query.q || query.status || query.tag || query.kind
  const results = filterStudioKnowledge(k, { query: query.q, status: query.status, tag: query.tag, kind: query.kind })
  const commit = html`<p class="muted small">${icon('git')} ${i.t('knowledge.commit', { sha: shortSha(view.cached.status.sha), time: i.dateTime(view.cached.status.synced_at) })}</p>`
  let list: SafeHtml
  if (filtered) {
    list = html`<section aria-labelledby="kn-results-title">
      <h2 class="card-title kn-section-title" id="kn-results-title" aria-live="polite">${i.t('knowledge.results', { count: i.number(results.length) })}</h2>
      ${results.length ? html`<ul class="note-list">${results.map((hit) => noteCard(ctx, view, hit.note, hit.snippet))}</ul>` : html`<p class="muted">${i.t('knowledge.noResults')}</p>`}
    </section>`
  } else {
    list = join(
      (['inbox', 'triaged', 'active'] as const).map((status) => {
        const notes = results.filter((hit) => hit.note.status === status)
        return html`<section class="kn-group" aria-labelledby="kn-group-${status}">
          <h2 class="card-title kn-section-title" id="kn-group-${status}">${i.t(`knowledge.status.${status}` as MessageKey)} <span class="muted">(${i.number(k.by_status[status])})</span></h2>
          ${notes.length ? html`<ul class="note-list">${notes.map((hit) => noteCard(ctx, view, hit.note, null))}</ul>` : html`<p class="muted">${i.t('knowledge.groupEmpty')}</p>`}
        </section>`
      }),
    )
    if (k.by_status.archived > 0) list = html`${list}<p><a href="${href(view, { status: 'archived' })}">${i.t('knowledge.status.archived')} (${i.number(k.by_status.archived)})</a></p>`
  }
  const body = html`${header}
    ${banner({ tone: 'warning', title: i.t('knowledge.notFact'), body: i.t('knowledge.banner') })}
    ${commit}
    ${k.truncated ? banner({ tone: 'info', body: i.t('knowledge.truncated', { shown: i.number(k.notes.length), total: i.number(k.total) }) }) : ''}
    ${filters(ctx, view, k, query)}
    ${list}
    ${withheldSection(ctx, k)}`
  return brandShell(ctx, view, 'knowledge', i.t('knowledge.title'), body, flash)
}

/** Plain text with `[[kn_…]]` turned into a link only when that note is projected. */
function noteBody(view: BrandView, text: string, titles: Map<string, string>): SafeHtml {
  const parts = text.split(/\[\[(kn_[a-z0-9][a-z0-9-]{2,63})\]\]/)
  return join(
    parts.map((part, index) => {
      if (index % 2 === 0) return html`${part}`
      const title = titles.get(part)
      return title ? html`<a href="${href(view, { note: part })}" dir="auto">[[${title}]]</a>` : html`[[${part}]]`
    }),
  )
}

function linkList(ctx: ViewContext, view: BrandView, links: StudioNoteLink[]): SafeHtml {
  const { i } = ctx
  if (!links.length) return html`<p class="muted small">${i.t('knowledge.noLinks')}</p>`
  return html`<ul class="kn-links">${links.map((link) => {
    const rel = badge(i.t(`knowledge.relationship.${link.relationship}` as MessageKey), link.relationship === 'contradicts' ? 'danger' : 'neutral')
    if (link.title) return html`<li>${rel} <a href="${href(view, { note: link.id })}" dir="auto">${link.title}</a></li>`
    return html`<li>${rel} <span class="muted">${link.exists ? i.t('knowledge.hiddenNote') : i.t('knowledge.brokenLink')}</span> ${code(link.id, 'muted small')}</li>`
  })}</ul>`
}

export function knowledgeNotePage(ctx: ViewContext, view: BrandView, note: StudioNote, k: StudioKnowledgeProjection, flash: string | null): SafeHtml {
  const { i } = ctx
  const p = view.cached.projection!
  const titles = new Map(k.notes.map((item) => [item.id, item.title]))
  const groups = new Map(p.modules.map((module) => [module.id, module.group]))
  const url = fileUrl(view, note)
  const questions = note.question_ids.length
    ? html`<ul class="kn-questions">${note.question_ids.map((question) => {
        const section = question.module ? SECTION_FOR_GROUP[groups.get(question.module) ?? ''] : undefined
        const reachable = section && (section !== 'personal' || p.personal)
        const label = question.known ? html`<span dir="auto">${question.label}</span> ${code(question.id, 'muted small')}` : html`${code(question.id, 'small')} ${badge(i.t('knowledge.unknownQuestion'), 'warning', 'alert')}`
        return html`<li>${question.known && reachable ? html`<a href="${brandPath(view.record.slug, section)}">${label}</a>` : label}</li>`
      })}</ul>`
    : html`<p class="muted small">${i.t('knowledge.questionsEmpty')}</p>`
  const body = html`<p><a href="${base(view)}" class="link-sm">${i.t('knowledge.back')}</a></p>
    ${brandHeader(ctx, view, note.title, i.t('knowledge.subtitle'))}
    <div class="note-badges">${ideaLabels(ctx)}${badge(i.t(`knowledge.kind.${note.kind}` as MessageKey), 'neutral')}${statusBadge(ctx, note.status)}</div>
    ${banner({ tone: 'warning', title: i.t('knowledge.notFact'), body: i.t('knowledge.factStatus') })}
    <div class="two-col two-col-wide kn-page-cols">
      <section class="card" aria-labelledby="kn-body-title">
        <h2 class="card-title" id="kn-body-title">${i.t('knowledge.bodyTitle')}</h2>
        ${note.body !== null ? html`<div class="note-body" dir="auto" lang="${note.language ?? ''}">${noteBody(view, note.body, titles)}</div>` : html`<p class="note-excerpt" dir="auto">${note.excerpt}</p>`}
        ${note.body === null ? banner({ tone: 'info', body: i.t('knowledge.bodyOmitted') }) : note.body_truncated ? banner({ tone: 'info', body: i.t('knowledge.bodyTruncated') }) : ''}
        <p class="muted small">${i.t('knowledge.bodyPlain')}</p>
      </section>
      <div class="stack">
        <section class="card" aria-labelledby="kn-details-title">
          <h2 class="card-title" id="kn-details-title">${i.t('knowledge.details')}</h2>
          <dl class="meta-list kn-meta">
            <div><dt>${i.t('knowledge.source')}</dt><dd>${i.t(`knowledge.sourceKind.${note.source_kind}` as MessageKey)}</dd></div>
            <div><dt>${i.t('knowledge.created')}</dt><dd>${i.dateTime(note.created_at)}</dd></div>
            <div><dt>${i.t('knowledge.updatedLabel')}</dt><dd>${i.dateTime(note.updated_at)}</dd></div>
            ${note.language ? html`<div><dt>${i.t('knowledge.language')}</dt><dd>${code(note.language)}</dd></div>` : ''}
            <div><dt>${i.t('knowledge.tags')}</dt><dd>${note.tags.length ? join(note.tags.map((tag) => html`<a class="tag-link" dir="auto" href="${href(view, { tag })}">#${tag}</a>`), ' ') : '—'}</dd></div>
            <div><dt>${i.t('knowledge.file')}</dt><dd>${code(note.path, 'small')}</dd></div>
            <div><dt>${i.t('knowledge.revision')}</dt><dd>${code(note.revision.slice(0, 12), 'small')}</dd></div>
          </dl>
          <p class="muted small">${icon('git')} ${i.t('knowledge.commit', { sha: shortSha(view.cached.status.sha), time: i.dateTime(view.cached.status.synced_at) })}</p>
          ${url ? html`<div class="button-row">${externalLink(url, i.t('knowledge.openFile'), i)}</div>` : ''}
        </section>
        <section class="card" aria-labelledby="kn-questions-title">
          <h2 class="card-title" id="kn-questions-title">${i.t('knowledge.questions')}</h2>
          ${questions}
        </section>
        <section class="card" aria-labelledby="kn-links-title">
          <h2 class="card-title" id="kn-links-title">${i.t('knowledge.links')}</h2>
          <h3 class="small">${i.t('knowledge.outbound')}</h3>
          ${linkList(ctx, view, note.outbound)}
          <h3 class="small">${i.t('knowledge.inbound')}</h3>
          ${linkList(ctx, view, note.inbound)}
        </section>
        <section class="card" aria-labelledby="kn-edit-title">
          <h2 class="card-title" id="kn-edit-title">${icon('terminal')} ${i.t('knowledge.editTitle')}</h2>
          <p class="muted">${i.t('knowledge.editBody')}</p>
          ${copyBlock({ id: 'kn-prompt', label: i.t('knowledge.prompt'), text: i.t('knowledge.starter', { id: note.id }), buttonLabel: i.t('knowledge.copyPrompt'), multiline: true, i })}
        </section>
      </div>
    </div>`
  return brandShell(ctx, view, 'knowledge', note.title, body, flash)
}
