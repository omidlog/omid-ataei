import type { SharedDecision, StudioCreativeProjection } from '@brand-os/brand-core/creative'
import type { MessageKey } from '../i18n/index.js'
import { badge, banner, code, emptyState, shortSha } from './components.js'
import { html, join, type SafeHtml } from './html.js'
import { icon } from './icons.js'
import type { BrandView, ViewContext } from './layout.js'
import { brandHeader, brandShell } from './pages.js'

/**
 * The read-only "Creative decisions" page: owner-approved creative preferences the owner explicitly shared
 * (`brand:creative share`) and merged, from `brand/creative/shared/`. Every value goes through the escaping `html`
 * template. No forms, no links that change anything, no note text (shared decisions never carry any).
 */

function decisionCard(ctx: ViewContext, item: SharedDecision): SafeHtml {
  const { i } = ctx
  const state = item.state === 'approved' ? badge(i.t('creative.state.approved'), 'info', 'check') : badge(i.t('creative.state.superseded'), 'neutral', 'history')
  return html`<li class="card note-card" id="${item.decision_id}">
    <div class="note-card-head">
      <h3 class="note-title" dir="auto">${item.statement}</h3>
      <div class="note-badges">${state}${badge(item.scope.label, 'neutral')}</div>
    </div>
    ${item.context ? html`<p class="note-excerpt" dir="auto">${item.context}</p>` : ''}
    <dl class="meta-list kn-meta">
      <div><dt>${i.t('creative.scope')}</dt><dd dir="auto">${item.scope.label}</dd></div>
      <div><dt>${i.t('creative.project')}</dt><dd>${code(item.project_id, 'small')}</dd></div>
      <div><dt>${i.t('creative.approvedAt')}</dt><dd>${i.dateTime(item.approved_at)}</dd></div>
      ${item.supersedes ? html`<div><dt>${i.t('creative.supersedes')}</dt><dd><a href="#${item.supersedes}">${code(item.supersedes, 'small')}</a></dd></div>` : ''}
      ${item.superseded_by ? html`<div><dt>${i.t('creative.supersededBy')}</dt><dd><a href="#${item.superseded_by}">${code(item.superseded_by, 'small')}</a></dd></div>` : ''}
      <div><dt>${i.t('creative.sources')}</dt><dd>${join(item.sources.map((source) => code(source.replace(/^knowledge:/, '').replace(/@([0-9a-f]{12})[0-9a-f]+$/, '@$1'), 'small')), ' ')}</dd></div>
      ${item.counterexamples.length ? html`<div><dt>${i.t('creative.counterexamples')}</dt><dd>${join(item.counterexamples.map((ce) => code(`${ce.project_id}/${ce.variant_id}`, 'small')), ' ')}</dd></div>` : ''}
    </dl>
  </li>`
}

function withheldSection(ctx: ViewContext, c: StudioCreativeProjection): SafeHtml {
  const { i } = ctx
  if (!c.withheld.length) return html``
  return html`<section class="card" aria-labelledby="cr-withheld-title">
    <h2 class="card-title" id="cr-withheld-title">${icon('lock')} ${i.t('creative.withheldTitle')}</h2>
    <p class="muted">${i.t('creative.withheldBody')}</p>
    <ul class="kn-withheld">${c.withheld.map((item) => html`<li>${code(item.path, 'small')} ${badge(i.t(`creative.reason.${item.reason}` as MessageKey), 'warning', 'alert')}</li>`)}</ul>
  </section>`
}

export function creativePage(ctx: ViewContext, view: BrandView, flash: string | null): SafeHtml {
  const { i } = ctx
  const p = view.cached.projection
  if (!p) return brandShell(ctx, view, 'creative', i.t('creative.title'), html``, flash)
  const header = brandHeader(ctx, view, i.t('creative.title'), i.t('creative.subtitle'))
  const c = p.creative
  if (c === undefined) return brandShell(ctx, view, 'creative', i.t('creative.title'), html`${header}${banner({ tone: 'info', body: i.t('creative.pending') })}`, flash)
  if (c === null) return brandShell(ctx, view, 'creative', i.t('creative.title'), html`${header}${banner({ tone: 'warning', body: i.t('creative.unavailable') })}`, flash)
  if (c.total === 0) {
    const body = html`${header}${emptyState({ icon: 'sparkle', title: i.t('creative.emptyTitle'), body: i.t('creative.emptyBody') })}${withheldSection(ctx, c)}`
    return brandShell(ctx, view, 'creative', i.t('creative.title'), body, flash)
  }
  const group = (id: string, title: string, items: SharedDecision[]) =>
    html`<section class="kn-group" aria-labelledby="${id}">
      <h2 class="card-title kn-section-title" id="${id}">${title} <span class="muted">(${i.number(items.length)})</span></h2>
      ${items.length ? html`<ul class="note-list">${items.map((item) => decisionCard(ctx, item))}</ul>` : html`<p class="muted">${i.t('creative.none')}</p>`}
    </section>`
  const body = html`${header}
    ${banner({ tone: 'warning', body: i.t('creative.banner') })}
    <p class="muted small">${icon('git')} ${i.t('creative.commit', { sha: shortSha(view.cached.status.sha), time: i.dateTime(view.cached.status.synced_at) })}</p>
    ${group('cr-current', i.t('creative.current'), c.items.filter((item) => item.state === 'approved'))}
    ${group('cr-history', i.t('creative.history'), c.items.filter((item) => item.state === 'superseded'))}
    ${withheldSection(ctx, c)}`
  return brandShell(ctx, view, 'creative', i.t('creative.title'), body, flash)
}
