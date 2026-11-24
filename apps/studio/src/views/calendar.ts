import type { SharedContentWeek, StudioCalendarProjection } from '@brand-os/brand-core/content-bridge'
import type { MessageKey } from '../i18n/index.js'
import { badge, banner, code, emptyState, shortSha } from './components.js'
import { html, type SafeHtml } from './html.js'
import { icon } from './icons.js'
import type { BrandView, ViewContext } from './layout.js'
import { brandHeader, brandShell } from './pages.js'

/**
 * The read-only "Content calendar" page: approved calendar weeks the owner explicitly shared (`brand:content share`)
 * and merged, from `brand/content-calendar/shared/`. Every value goes through the escaping `html` template. No forms,
 * no approve button and no links that change anything: approval stays in the owner's local CLI.
 */

function weekCard(ctx: ViewContext, week: SharedContentWeek): SafeHtml {
  const { i } = ctx
  const title = `${week.week_start} → ${week.week_end}`
  return html`<li class="card note-card" id="${week.week_id}">
    <div class="note-card-head">
      <h3 class="note-title">${title}</h3>
      <div class="note-badges">${badge(i.t('calendar.state.approved'), 'info', 'check')}${badge(i.t('calendar.slots', { count: i.number(week.slots.length) }), 'neutral')}</div>
    </div>
    <dl class="meta-list kn-meta">
      <div><dt>${i.t('calendar.strategy')}</dt><dd>${code(`${week.strategy.strategy_id}@${week.strategy.revision}`, 'small')}</dd></div>
      <div><dt>${i.t('calendar.approvedAt')}</dt><dd>${i.dateTime(week.approved_at)}</dd></div>
      <div><dt>${i.t('calendar.sharedAt')}</dt><dd>${i.dateTime(week.shared_at)}</dd></div>
      <div><dt>${i.t('calendar.revision')}</dt><dd>${code(`r${week.revision} ${week.content_sha256.slice(0, 12)}`, 'small')}</dd></div>
    </dl>
    ${week.slots.length
      ? html`<div class="table-wrap" tabindex="0"><table class="table table-compact">
          <thead><tr>
            <th scope="col">${i.t('calendar.date')}</th>
            <th scope="col">${i.t('calendar.channel')}</th>
            <th scope="col">${i.t('calendar.pillar')}</th>
            <th scope="col">${i.t('calendar.language')}</th>
            <th scope="col">${i.t('calendar.cites')}</th>
            <th scope="col">${i.t('calendar.hook')}</th>
            <th scope="col">${i.t('calendar.research')}</th>
          </tr></thead>
          <tbody>${week.slots.map(
            (slot) => html`<tr>
              <th scope="row">${code(slot.date, 'small')} ${slot.status === 'approved' ? '' : badge(i.t(`calendar.status.${slot.status}` as MessageKey), 'neutral')}</th>
              <td>${slot.channel} / ${slot.format ?? i.t('calendar.notDecided')}</td>
              <td dir="auto">${slot.pillar_name ?? slot.pillar ?? '—'}</td>
              <td>${code(slot.language, 'small')}</td>
              <td>${[slot.key_message, slot.offer, slot.cta].filter((id): id is string => id !== null).map((id) => html`${code(id, 'small')} `)}</td>
              <td dir="auto">${slot.hook ?? ''}${slot.angle ? html`<br><span class="muted">${slot.angle}</span>` : ''}</td>
              <td>${slot.research ? html`${code(slot.research.observation_id.slice(0, 11), 'small')} ${badge(i.t(`calendar.confidence.${slot.research.confidence}` as MessageKey), 'neutral')}` : ''}</td>
            </tr>`,
          )}</tbody>
        </table></div>`
      : html`<p class="muted">${i.t('calendar.noSlots')}</p>`}
    ${week.gaps.length ? html`<ul class="kn-withheld">${week.gaps.map((gap) => html`<li>${badge(i.t(`calendar.gap.${gap.reason}` as MessageKey), 'warning', 'alert')} ${gap.channel ?? ''}</li>`)}</ul>` : ''}
  </li>`
}

function withheldSection(ctx: ViewContext, c: StudioCalendarProjection): SafeHtml {
  const { i } = ctx
  if (!c.withheld.length) return html``
  return html`<section class="card" aria-labelledby="cal-withheld-title">
    <h2 class="card-title" id="cal-withheld-title">${icon('lock')} ${i.t('calendar.withheldTitle')}</h2>
    <p class="muted">${i.t('calendar.withheldBody')}</p>
    <ul class="kn-withheld">${c.withheld.map((item) => html`<li>${code(item.path, 'small')} ${badge(i.t(`calendar.reason.${item.reason}` as MessageKey), 'warning', 'alert')}</li>`)}</ul>
  </section>`
}

export function calendarPage(ctx: ViewContext, view: BrandView, flash: string | null): SafeHtml {
  const { i } = ctx
  const p = view.cached.projection
  if (!p) return brandShell(ctx, view, 'calendar', i.t('calendar.title'), html``, flash)
  const header = brandHeader(ctx, view, i.t('calendar.title'), i.t('calendar.subtitle'))
  const c = p.calendar
  if (c === undefined) return brandShell(ctx, view, 'calendar', i.t('calendar.title'), html`${header}${banner({ tone: 'info', body: i.t('calendar.pending') })}`, flash)
  if (c === null) return brandShell(ctx, view, 'calendar', i.t('calendar.title'), html`${header}${banner({ tone: 'warning', body: i.t('calendar.unavailable') })}`, flash)
  if (c.total === 0) {
    const body = html`${header}${emptyState({ icon: 'clock', title: i.t('calendar.emptyTitle'), body: i.t('calendar.emptyBody') })}${withheldSection(ctx, c)}`
    return brandShell(ctx, view, 'calendar', i.t('calendar.title'), body, flash)
  }
  const body = html`${header}
    ${banner({ tone: 'warning', body: i.t('calendar.banner') })}
    <p class="muted small">${icon('git')} ${i.t('calendar.commit', { sha: shortSha(view.cached.status.sha), time: i.dateTime(view.cached.status.synced_at) })}</p>
    <ul class="note-list">${c.weeks.map((week) => weekCard(ctx, week))}</ul>
    ${withheldSection(ctx, c)}`
  return brandShell(ctx, view, 'calendar', i.t('calendar.title'), body, flash)
}
