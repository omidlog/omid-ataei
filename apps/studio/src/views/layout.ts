import type { I18n, MessageKey } from '../i18n/index.js'
import { LOCALES } from '../i18n/index.js'
import type { BrandRecord } from '../registry.js'
import { studioAssets } from '../static-assets.js'
import type { CachedBrand } from '../sync.js'
import { badge, code, shortSha } from './components.js'
import { html, type SafeHtml } from './html.js'
import { icon, type IconName } from './icons.js'

export interface ViewContext {
  i: I18n
  /** Current path without query, for active navigation and the language links. */
  path: string
  csrf: string | null
  login: string | null
  brands: BrandRecord[]
  /** Server time, so relative times are stable within one render. */
  now: number
}

export type BrandSection =
  | 'overview'
  | 'brand-book'
  | 'design'
  | 'assets'
  | 'business'
  | 'marketing'
  | 'personal'
  | 'knowledge'
  | 'creative'
  | 'calendar'
  | 'history'
  | 'handoff'
  | 'visual'
  | 'competitors'
  | 'coach'
  | 'journey'
  | 'sostac'
  | 'okr'
  | 'publishing'
  | 'swot'
  | 'value-proposition'

export interface BrandView {
  record: BrandRecord
  cached: CachedBrand
  stale: boolean
  refreshing: boolean
  /** ISO time the running refresh started; shown as "Syncing… (started HH:MM)". */
  refreshStartedAt?: string | null
}

/**
 * The `?sync=` flash to show. `syncing` stays while the refresh runs and turns into the result once it
 * has finished, so the self-reloading page ends on "Refreshed" or "Refresh failed".
 */
export function syncFlash(flash: string | null, brand: BrandView): 'synced' | 'failed' | 'too-soon' | 'syncing' | null {
  if (flash === 'synced' || flash === 'failed' || flash === 'too-soon') return flash
  if (flash !== 'syncing') return null
  if (brand.refreshing) return 'syncing'
  return brand.cached.status.last_error ? 'failed' : 'synced'
}

/** Sidebar groups by intent (Visual V2.4, R1): the reader's question, not the storage module. */
export const NAV_GROUPS = ['command', 'strategy', 'studio', 'market', 'governance'] as const
export type NavGroup = (typeof NAV_GROUPS)[number]

/**
 * Every brand page, its group and its stable path (Visual V2.4, R2). The path is the canonical URL under
 * `/brands/<slug>`; the old flat paths answer 301 to these (see `LEGACY_SECTION_PATHS`). `coach` is an anchor on the
 * overview (the Strategic Coach card), not a page of its own.
 */
const SECTIONS: Array<{ id: BrandSection; group: NavGroup; key: MessageKey; icon: IconName; path: string }> = [
  { id: 'overview', group: 'command', key: 'nav.overview', icon: 'overview', path: '' },
  { id: 'coach', group: 'command', key: 'nav.coach', icon: 'info', path: '#coach-title' },
  { id: 'visual', group: 'strategy', key: 'nav.visual', icon: 'layers', path: '/strategy/business-model' },
  { id: 'business', group: 'strategy', key: 'nav.businessPlan', icon: 'briefcase', path: '/strategy/business-plan' },
  { id: 'swot', group: 'strategy', key: 'nav.swot', icon: 'layers', path: '/strategy/swot-tows' },
  { id: 'value-proposition', group: 'strategy', key: 'nav.valueProposition', icon: 'layers', path: '/strategy/value-proposition' },
  { id: 'brand-book', group: 'studio', key: 'nav.brandBook', icon: 'book', path: '/brand/book' },
  { id: 'design', group: 'studio', key: 'nav.design', icon: 'palette', path: '/brand/design-system' },
  { id: 'assets', group: 'studio', key: 'nav.assets', icon: 'image', path: '/brand/assets' },
  { id: 'creative', group: 'studio', key: 'nav.creative', icon: 'sparkle', path: '/brand/creative-decisions' },
  { id: 'personal', group: 'studio', key: 'nav.personal', icon: 'user', path: '/brand/personal' },
  { id: 'marketing', group: 'market', key: 'nav.marketingPlan', icon: 'globe', path: '/market/marketing-plan' },
  { id: 'competitors', group: 'market', key: 'nav.competitors', icon: 'shield', path: '/market/competitors' },
  { id: 'calendar', group: 'market', key: 'nav.calendar', icon: 'clock', path: '/market/content-calendar' },
  { id: 'knowledge', group: 'market', key: 'nav.knowledge', icon: 'idea', path: '/market/knowledge' },
  { id: 'publishing', group: 'governance', key: 'nav.publishing', icon: 'book', path: '/governance/documents' },
  { id: 'history', group: 'governance', key: 'nav.history', icon: 'history', path: '/governance/history' },
  { id: 'handoff', group: 'governance', key: 'nav.handoff', icon: 'handoff', path: '/governance/github' },
  // Visual V3.3: served by the plan route (routes/visual-plan.ts), listed at the end of their groups.
  { id: 'sostac', group: 'strategy', key: 'nav.sostac', icon: 'layers', path: '/strategy/sostac' },
  { id: 'okr', group: 'strategy', key: 'nav.okr', icon: 'checkCircle', path: '/strategy/okrs' },
  { id: 'journey', group: 'market', key: 'nav.journey', icon: 'user', path: '/market/customer-journey' },
]

/** Sections served by their own visual route instead of the brand page handler. */
const VISUAL_ROUTE_SECTIONS: readonly BrandSection[] = ['visual', 'competitors', 'swot', 'value-proposition', 'journey', 'sostac', 'okr']

/** Stable path of a brand page, for links between pages. */
export function brandPath(slug: string, section: BrandSection, rest = ''): string {
  const path = SECTIONS.find((item) => item.id === section)?.path ?? ''
  return `/brands/${slug}${path}${rest}`
}

/** Page sections served by the brand page handler: stable path segment (after the slug) -> section. */
export const PAGE_SECTION_PATHS: ReadonlyArray<readonly [string, BrandSection]> = SECTIONS.filter(
  (item) => item.path.startsWith('/') && !VISUAL_ROUTE_SECTIONS.includes(item.id),
).map((item) => [item.path.slice(1), item.id] as const)

/**
 * Old flat paths (before V2.4), kept as permanent redirects for one release. Old segment -> new segment, both after
 * `/brands/<slug>/`. Longest first, so `visual/identity/print` wins over `visual`.
 */
export const LEGACY_SECTION_PATHS: ReadonlyArray<readonly [string, string]> = [
  ['visual/identity/print', 'brand/book/visual-identity/print'],
  ['visual/competitors/print', 'market/competitors/print'],
  ['visual/mascot/print', 'brand/mascot/print'],
  ['visual/identity', 'brand/book/visual-identity'],
  ['visual/competitors', 'market/competitors'],
  ['visual/mascot', 'brand/mascot'],
  ['visual/print', 'strategy/business-model/print'],
  ['visual', 'strategy/business-model'],
  ['brand-book', 'brand/book'],
  ['design', 'brand/design-system'],
  ['assets', 'brand/assets'],
  ['business', 'strategy/business-plan'],
  ['personal', 'brand/personal'],
  ['knowledge', 'market/knowledge'],
  ['creative', 'brand/creative-decisions'],
  ['calendar', 'market/content-calendar'],
  ['history', 'governance/history'],
  ['handoff', 'governance/github'],
]

export function brandSections(view: BrandView): typeof SECTIONS {
  const projection = view.cached.projection
  return SECTIONS.filter((section) => {
    if (section.id === 'personal') return projection?.brand.modules.personal === true
    // No flag: the page is listed once the merged branch has shared notes (or files Studio withheld).
    if (section.id === 'knowledge') return Boolean(projection?.knowledge && (projection.knowledge.total > 0 || projection.knowledge.withheld.length > 0))
    // Listed once the merged branch has shared creative decisions (or files Studio withheld).
    if (section.id === 'creative') return Boolean(projection?.creative && (projection.creative.total > 0 || projection.creative.withheld.length > 0))
    // Listed once the merged branch has shared calendar weeks (or files Studio withheld).
    if (section.id === 'calendar') return Boolean(projection?.calendar && (projection.calendar.total > 0 || projection.calendar.withheld.length > 0))
    // Listed when the merged commit has a canvas that applies to this profile (a business, or a founder/consultant facet).
    if (section.id === 'visual') return projection?.visual?.bmc.applies !== false
    // V3.2: listed with the canvas (same profile rule) once the merged commit has the documents.
    if (section.id === 'swot' || section.id === 'value-proposition') return Boolean(projection?.visual?.strategy) && projection?.visual?.bmc.applies !== false
    // Listed when the merged commit has a competitor comparison document (a designed empty state until one is shared).
    if (section.id === 'competitors') return Boolean(projection?.visual?.competitors)
    // Visual V3.3: listed when the plan documents apply to this profile (as the canvas).
    if (section.id === 'journey' || section.id === 'sostac' || section.id === 'okr') return projection?.visual?.plans?.applies !== false && projection?.visual?.bmc.applies !== false
    // An anchor on the overview, listed only when the Strategic Coach card has notes.
    if (section.id === 'coach') return Boolean(projection?.coach && projection.coach.notes.length > 0)
    return true
  })
}

/** Visible sections in their groups; a group with nothing to show is left out. */
export function sectionGroups(view: BrandView): Array<[NavGroup, typeof SECTIONS]> {
  const visible = brandSections(view)
  return NAV_GROUPS.map((group) => [group, visible.filter((section) => section.group === group)] as [NavGroup, typeof SECTIONS]).filter(([, items]) => items.length > 0)
}

function initials(name: string): string {
  const letters = [...name.trim()].filter((char) => /\p{L}|\p{N}/u.test(char))
  return (letters[0] ?? '?').toUpperCase()
}

export function brandAvatar(name: string, className = ''): SafeHtml {
  return html`<span class="brand-avatar ${className}" aria-hidden="true">${initials(name)}</span>`
}

/**
 * The omidataei.com logo. Studio's chrome (sidebar, sign-in brand panel) is always dark, as on the
 * site's own admin, so only the white artwork is needed. The file is static and same-origin.
 */
function productLogo(): SafeHtml {
  return html`<img class="product-logo" src="/static/logo-omid-ataei-white.svg" alt="Omid Ataei" width="159" height="33">`
}

function langLinks(ctx: ViewContext): SafeHtml {
  return html`<nav class="lang-switch" aria-label="${ctx.i.t('lang.label')}">
    ${icon('globe')}
    <ul>${LOCALES.map(
      (locale) => html`<li><a href="${ctx.path}?lang=${locale}" lang="${locale}" hreflang="${locale}" ${locale === ctx.i.locale ? html`aria-current="true"` : ''}>${ctx.i.t(`lang.${locale}` as MessageKey)}</a></li>`,
    )}</ul>
  </nav>`
}

function sidebar(ctx: ViewContext, brand?: { view: BrandView; section: BrandSection }): SafeHtml {
  const { i } = ctx
  const current = brand?.view.record.slug
  const brandsLink = ctx.path === '/brands'
  return html`<aside class="sidebar" id="sidebar" aria-label="${i.t('nav.primary')}">
    <div class="sidebar-head">
      <a class="product" href="/brands">${productLogo()}<span class="product-name"><span class="signal-dot" aria-hidden="true"></span>${i.t('app.name')}</span></a>
      <button type="button" class="icon-btn sidebar-close" data-drawer-close aria-label="${i.t('nav.closeMenu')}">${icon('close')}</button>
    </div>
    <nav class="sidebar-nav" aria-label="${i.t('nav.myBrands')}">
      <div class="nav-group">
        <div class="nav-group-head">
          <a class="nav-link ${brandsLink ? 'is-active' : ''}" href="/brands" ${brandsLink ? html`aria-current="page"` : ''}>${icon('layers')}<span>${i.t('nav.myBrands')}</span></a>
          <a class="icon-btn" href="/brands/new" title="${i.t('nav.newBrand')}">${icon('plus')}<span class="visually-hidden">${i.t('nav.newBrand')}</span></a>
        </div>
        <ul class="brand-list">
          ${ctx.brands.map((record) => {
            const active = record.slug === current
            const ready = record.provisioning === null || record.provisioning.state === 'ready'
            const href = ready ? `/brands/${record.slug}` : `/brands/${record.slug}/provisioning`
            return html`<li>
              <a class="brand-link ${active ? 'is-active' : ''}" href="${href}" ${active && brand?.section === 'overview' ? html`aria-current="page"` : ''}>
                ${brandAvatar(record.display_name)}<span class="brand-link-name" dir="auto">${record.display_name}</span>
                ${!ready ? html`<span class="dot dot-${record.provisioning?.state === 'failed' ? 'danger' : 'warning'}" aria-hidden="true"></span>` : ''}
              </a>
              ${active && brand
                ? html`<ul class="section-list" aria-label="${i.t('nav.brandSections', { brand: record.display_name })}">
                    ${sectionGroups(brand.view).map(
                      ([group, sections]) => html`<li class="nav-section">
                        <p class="nav-section-label" id="nav-group-${group}">${i.t(`nav.group.${group}` as MessageKey)}</p>
                        <ul class="nav-section-list" aria-labelledby="nav-group-${group}">
                          ${sections.map((section) => {
                            const on = section.id === brand.section
                            return html`<li><a class="nav-link nav-sub ${on ? 'is-active' : ''}" href="/brands/${record.slug}${section.path}" ${on ? html`aria-current="page"` : ''}>${icon(section.icon)}<span>${i.t(section.key)}</span></a></li>`
                          })}
                        </ul>
                      </li>`,
                    )}
                  </ul>`
                : ''}
            </li>`
          })}
        </ul>
      </div>
    </nav>
    <div class="sidebar-foot">
      <a class="nav-link ${ctx.path === '/account' ? 'is-active' : ''}" href="/account" ${ctx.path === '/account' ? html`aria-current="page"` : ''}>${icon('settings')}<span>${i.t('nav.account')}</span></a>
      ${langLinks(ctx)}
      <div class="sidebar-user">
        <span class="muted user-line">${icon('user')}<span>${i.t('user.signedInAs', { login: ctx.login ?? '' })}</span></span>
        <div class="sidebar-user-actions">
          <button type="button" class="icon-btn" data-theme-toggle aria-label="${i.t('theme.toggle')}" title="${i.t('theme.toggle')}">${icon('moon', 'theme-dark-icon')}${icon('sun', 'theme-light-icon')}</button>
          <form method="post" action="/logout">
            <input type="hidden" name="_csrf" value="${ctx.csrf ?? ''}">
            <button type="submit" class="btn btn-ghost btn-sm">${icon('logout')}<span>${i.t('user.signOut')}</span></button>
          </form>
        </div>
      </div>
    </div>
  </aside>`
}

export function syncPill(ctx: ViewContext, view: BrandView): SafeHtml {
  const { i } = ctx
  const status = view.cached.status
  if (view.refreshing && status.state === 'never') return badge(i.t('sync.checking'), 'info', 'refresh')
  if (status.state === 'never') return badge(i.t('sync.never'), 'neutral', 'circle')
  const tone = status.last_error ? 'danger' : view.stale ? 'warning' : 'success'
  const name: IconName = status.last_error ? 'alert' : view.stale ? 'clock' : 'checkCircle'
  return html`<span class="sync-pill sync-${tone}" title="${i.t('sync.canonical')}">
    ${icon(name)}
    <span class="visually-hidden">${i.t('sync.label')}: </span>
    <span>${i.t('sync.branch', { branch: view.record.repo.default_branch })}</span> ${code(shortSha(status.sha))}
    <span class="sync-time">· ${status.synced_at ? i.t('sync.synced', { time: i.relative(status.checked_at ?? status.synced_at, ctx.now) }) : i.t('sync.never')}</span>
  </span>`
}

export function refreshButton(ctx: ViewContext, view: BrandView): SafeHtml {
  return html`<form method="post" action="/brands/${view.record.slug}/refresh" class="inline-form" data-refresh-form>
    <input type="hidden" name="_csrf" value="${ctx.csrf ?? ''}">
    <input type="hidden" name="return" value="${ctx.path}">
    <button type="submit" class="btn btn-secondary btn-sm" data-busy-label="${ctx.i.t('common.refreshing')}">${icon('refresh')}<span>${ctx.i.t('common.refresh')}</span></button>
  </form>`
}

function topbar(ctx: ViewContext, crumbs: Array<{ label: string; href?: string }>, brand?: { view: BrandView }): SafeHtml {
  const { i } = ctx
  return html`<header class="topbar">
    <button type="button" class="icon-btn menu-btn" data-drawer-open aria-controls="sidebar" aria-expanded="false" aria-label="${i.t('nav.menu')}">${icon('menu')}</button>
    <nav class="breadcrumbs" aria-label="${i.t('nav.breadcrumb')}">
      <ol>${crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1
        return html`<li>${index > 0 ? icon('chevron', 'crumb-sep') : ''}${crumb.href && !last ? html`<a href="${crumb.href}" dir="auto">${crumb.label}</a>` : html`<span dir="auto" ${last ? html`aria-current="page"` : ''}>${crumb.label}</span>`}</li>`
      })}</ol>
    </nav>
    <div class="topbar-actions">
      ${brand ? html`${syncPill(ctx, brand.view)}${refreshButton(ctx, brand.view)}` : ''}
      <span class="readonly-chip" title="${i.t('app.readOnlyNote')}">${icon('lock')}<span>${i.t('app.readOnly')}</span></span>
    </div>
  </header>`
}

function documentShell(ctx: ViewContext, title: string, body: SafeHtml, extraHead: SafeHtml = html``): SafeHtml {
  return html`<!doctype html>
<html lang="${ctx.i.locale}" dir="${ctx.i.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="referrer" content="same-origin">
<meta name="robots" content="noindex, nofollow">
<title>${title} · ${ctx.i.t('app.name')}</title>
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/static/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${studioAssets.url('studio.css')}">
<script src="${studioAssets.url('studio.js')}" defer></script>
${extraHead}
</head>
${body}
</html>`
}

export function shell(
  ctx: ViewContext,
  input: { title: string; content: SafeHtml; crumbs: Array<{ label: string; href?: string }>; brand?: { view: BrandView; section: BrandSection }; extraHead?: SafeHtml },
): SafeHtml {
  return documentShell(
    ctx,
    input.title,
    html`<body class="app">
<a class="skip-link" href="#main">${ctx.i.t('nav.skip')}</a>
<div class="layout">
  ${sidebar(ctx, input.brand)}
  <div class="drawer-backdrop" data-drawer-close hidden></div>
  <div class="main-col">
    ${topbar(ctx, input.crumbs, input.brand)}
    <main id="main" class="main" tabindex="-1">
      ${input.content}
    </main>
  </div>
</div>
<div class="toast-region" aria-live="polite" aria-atomic="true" data-toast-region></div>
</body>`,
    input.extraHead,
  )
}

/** Minimal centered layout for sign-in and errors seen before a session exists. */
export function plainShell(ctx: ViewContext, title: string, content: SafeHtml): SafeHtml {
  return documentShell(
    ctx,
    title,
    html`<body class="plain">
<a class="skip-link" href="#main">${ctx.i.t('nav.skip')}</a>
<div class="plain-layout">
  <div class="plain-aside">
    <span class="grid-texture" aria-hidden="true"></span>
    <span class="signal-glow" aria-hidden="true"></span>
    <div class="plain-brand">${productLogo()}<span class="product-name"><span class="signal-dot" aria-hidden="true"></span>${ctx.i.t('app.name')}</span></div>
    <p class="plain-tagline"><span class="eyebrow-bar" aria-hidden="true"></span><span>${ctx.i.t('app.readOnlyNote')}</span></p>
    <span class="hatch-band" aria-hidden="true"></span>
  </div>
  <main id="main" class="plain-main" tabindex="-1">
    <span class="dot-texture" aria-hidden="true"></span>
    ${content}
    ${langLinks(ctx)}
  </main>
</div>
</body>`,
  )
}
