import fs from 'node:fs'
import { RateLimiter } from '../auth/rate-limit.js'
import { first, redirect, safeLocalPath } from '../http.js'
import type { BrandRecord } from '../registry.js'
import { brandIsReady } from '../sync.js'
import type { UpdateStatus } from '../template-update.js'
import { calendarPage } from '../views/calendar.js'
import { creativePage } from '../views/creative.js'
import { knowledgeNotePage, knowledgePage, parseKnowledgeQuery } from '../views/knowledge.js'
import { LEGACY_SECTION_PATHS, PAGE_SECTION_PATHS, type BrandSection, type BrandView } from '../views/layout.js'
import * as pages from '../views/pages.js'
import { publishingPage } from '../views/publishing.js'
import { brandBookPage } from '../views/visual-book.js'
import { withTimeout, type Handler, type RequestContext, type StudioCore } from './context.js'

/** Stable page paths after `/brands/<slug>/` (Visual V2.4, R2), e.g. `brand/book`, `governance/history`. */
export const BRAND_SECTIONS = PAGE_SECTION_PATHS.map(([path]) => path)
const SECTION_BY_PATH = new Map<string, BrandSection>(PAGE_SECTION_PATHS)
/** Old flat paths before V2.4, answered with 301 for one release. */
export const LEGACY_PATHS = LEGACY_SECTION_PATHS.map(([from]) => from)
const LEGACY_TARGET = new Map<string, string>(LEGACY_SECTION_PATHS)

export interface BrandRoutes {
  home: Handler
  brands: Handler
  refresh: Handler
  openUpdatePull: Handler
  assetFile: Handler
  brandPage: Handler
  legacyRedirect: Handler
}

/**
 * The brand list and every page of one brand, read from the sync cache. The only writes are the cache
 * refresh and "Open update PR" (a new branch and pull request in the brand repository, never a merge).
 */
export function brandRoutes(core: StudioCore): BrandRoutes {
  const { registry, sync, provisioning, templateUpdates, now, view, render, notFound, brandRecord } = core
  const refreshLimiter = new RateLimiter(1, 5_000, now)
  const updateLimiter = new RateLimiter(6, 10 * 60_000, now)
  const autoRefreshAt = new Map<string, number>()

  async function brandView(ctx: RequestContext, record: BrandRecord): Promise<BrandView> {
    let cached = sync.get(record.slug)
    if (cached.status.state === 'never' && !sync.isRefreshing(record.slug)) {
      // First view: read GitHub now, but never hang the page for long.
      cached = await Promise.race([sync.refresh(record.slug), new Promise<typeof cached>((resolve) => setTimeout(() => resolve(sync.get(record.slug)), 25_000))])
    } else if (sync.isStale(record.slug, cached.status) && !sync.isRefreshing(record.slug)) {
      const last = autoRefreshAt.get(record.slug) ?? 0
      if (now() - last > 30_000) {
        autoRefreshAt.set(record.slug, now())
        void sync.refresh(record.slug).catch(() => undefined)
      }
    }
    return { record, cached, stale: sync.isStale(record.slug, cached.status), refreshing: sync.isRefreshing(record.slug) }
  }

  const home: Handler = (ctx) => redirect(ctx.res, '/brands', 302)

  const brands: Handler = (ctx) => {
    const synced = new Map<string, { sha: string | null; at: string | null }>()
    const updates = new Map<string, UpdateStatus>()
    // Never waits for GitHub: the cached template head, refreshed in the background when due.
    const head = templateUpdates.peekHead()
    for (const record of registry.list()) {
      const cached = sync.get(record.slug)
      const status = cached.status
      synced.set(record.slug, { sha: status.sha, at: status.committed_at ?? status.synced_at })
      if (brandIsReady(record) && cached.projection) updates.set(record.slug, templateUpdates.status(cached.projection, head, cached.history?.pulls ?? []))
    }
    render(ctx, 200, pages.brandsPage(view(ctx), { canCreate: provisioning.configured, synced, updates, discarded: ctx.url.searchParams.get('discarded') === '1' }))
  }

  const refresh: Handler = async (ctx, match) => {
    const record = brandRecord(ctx, match[1] ?? '')
    if (!record) return
    const back = safeLocalPath(first(ctx.form.return), `/brands/${record.slug}`)
    const target = back === `/brands/${record.slug}` || back.startsWith(`/brands/${record.slug}/`) ? back : `/brands/${record.slug}`
    if (!brandIsReady(record)) return redirect(ctx.res, `/brands/${record.slug}/provisioning`)
    if (!refreshLimiter.take(record.slug).ok) return redirect(ctx.res, `${target}?sync=too-soon`)
    const result = await Promise.race([sync.refresh(record.slug), new Promise<null>((resolve) => setTimeout(() => resolve(null), 30_000))])
    const ok = result !== null && result.status.last_error === null
    redirect(ctx.res, `${target}?sync=${ok ? 'synced' : 'failed'}`)
  }

  function updateFlash(ctx: RequestContext, record: BrandRecord): pages.UpdatePanel['flash'] {
    const code = ctx.url.searchParams.get('update')
    const allowed = ['opened', 'exists', 'current', 'untracked', 'not_configured', 'busy', 'failed', 'pending', 'too_soon'] as const
    if (!allowed.includes(code as (typeof allowed)[number])) return null
    const number = Number(ctx.url.searchParams.get('pr') ?? '')
    const url = Number.isInteger(number) && number > 0 && number < 1e7 ? `https://github.com/${record.repo.owner}/${record.repo.name}/pull/${number}` : null
    return { code: code as (typeof allowed)[number], number: url ? number : null, url }
  }

  /** Studio's second GitHub write: opens (never merges) one template update pull request. */
  const openUpdatePull: Handler = async (ctx, match) => {
    const record = brandRecord(ctx, match[1] ?? '')
    if (!record) return
    const back = `/brands/${record.slug}`
    if (!brandIsReady(record)) return redirect(ctx.res, `${back}/provisioning`)
    if (!updateLimiter.take('owner').ok) return redirect(ctx.res, `${back}?update=too_soon#template-update`)
    const actor = ctx.session?.login ?? 'owner'
    const result = await withTimeout(templateUpdates.openUpdatePull(record.slug, actor), 90_000)
    if (!result) return redirect(ctx.res, `${back}?update=pending#template-update`)
    if (result.ok && (result.code === 'opened' || result.code === 'exists')) {
      // The brand's open pull requests changed; the next view re-reads them.
      sync.markDirty(record.slug)
      return redirect(ctx.res, `${back}?update=${result.code}&pr=${result.pull.number}#template-update`)
    }
    redirect(ctx.res, `${back}?update=${result.code}#template-update`)
  }

  const assetFile: Handler = (ctx, match) => {
    const record = brandRecord(ctx, match[1] ?? '')
    if (!record) return
    const file = sync.previewFile(record.slug, match[2] ?? '')
    if (!file) return notFound(ctx)
    ctx.res.statusCode = 200
    ctx.res.setHeader('Content-Type', file.mime)
    ctx.res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
    ctx.res.setHeader('Content-Disposition', 'inline; filename="asset"')
    ctx.res.setHeader('Cache-Control', 'private, max-age=300')
    ctx.res.end(fs.readFileSync(file.file))
  }

  const brandPage: Handler = async (ctx, match) => {
    const record = brandRecord(ctx, match[1] ?? '')
    if (!record) return
    if (!brandIsReady(record)) return redirect(ctx.res, `/brands/${record.slug}/provisioning`, 302)
    const section = match[2] ? SECTION_BY_PATH.get(match[2]) : 'overview'
    if (!section) return notFound(ctx)
    const brand = await brandView(ctx, record)
    const flash = ctx.url.searchParams.get('sync')
    const flashValue = flash === 'synced' || flash === 'failed' || flash === 'too-soon' ? flash : null
    const doc = ctx.url.searchParams.get('doc')
    const v = view(ctx)
    switch (section) {
      case 'overview': {
        // Waits briefly for a due template check; a slow or failing GitHub only makes the state "unknown".
        const head = (await withTimeout(templateUpdates.templateHead(), 3_000)) ?? templateUpdates.peekHead()
        const update: pages.UpdatePanel = {
          status: templateUpdates.status(brand.cached.projection, head, brand.cached.history?.pulls ?? []),
          canOpen: templateUpdates.canOpen(record),
          busy: templateUpdates.isBusy(record.slug),
          template: templateUpdates.template,
          flash: updateFlash(ctx, record),
        }
        return render(ctx, 200, pages.overviewPage(v, brand, flashValue, update))
      }
      case 'brand-book':
        return render(ctx, 200, brandBookPage(v, brand, flashValue))
      case 'design':
        return render(ctx, 200, pages.designPage(v, brand, flashValue))
      case 'assets':
        return render(ctx, 200, pages.assetsPage(v, brand, flashValue))
      case 'business':
        return render(ctx, 200, pages.businessPage(v, brand, 'business-plan', flashValue))
      case 'marketing':
        return render(ctx, 200, pages.businessPage(v, brand, 'marketing-plan', flashValue))
      case 'personal':
        // The section exists only when the Personal Brand OS module is enabled in the repository.
        if (!brand.cached.projection?.personal) return notFound(ctx)
        return render(ctx, 200, pages.personalPage(v, brand, doc, flashValue))
      case 'knowledge': {
        // Read only. Query parameters only filter the already safe projection of merged shared notes.
        const query = parseKnowledgeQuery(ctx.url.searchParams)
        if (query.note === null) return render(ctx, 200, knowledgePage(v, brand, query, flashValue))
        const knowledge = brand.cached.projection?.knowledge
        const note = query.note ? knowledge?.notes.find((item) => item.id === query.note) : undefined
        if (!knowledge || !note) return notFound(ctx)
        return render(ctx, 200, knowledgeNotePage(v, brand, note, knowledge, flashValue))
      }
      case 'creative':
        // Read only: decisions the owner shared and merged. No query parameter changes anything.
        return render(ctx, 200, creativePage(v, brand, flashValue))
      case 'calendar':
        // Read only: approved weeks the owner shared and merged. No query parameter changes anything.
        return render(ctx, 200, calendarPage(v, brand, flashValue))
      case 'publishing':
        // Read only: the gallery is counts measured at sync time; nothing here exports, renders a file or writes.
        return render(ctx, 200, publishingPage(v, brand, flashValue))
      case 'history':
        return render(ctx, 200, pages.historyPage(v, brand, flashValue))
      case 'handoff':
        return render(ctx, 200, pages.handoffPage(v, brand, flashValue))
      default:
        return notFound(ctx)
    }
  }

  /**
   * Old flat paths (before V2.4) answer 301 to their stable path, keeping the query. Session-only like every brand
   * route, so a guest is sent to sign in first; a slug that is not in the registry gets the same 404 as every other
   * brand route.
   */
  const legacyRedirect: Handler = (ctx, match) => {
    const record = brandRecord(ctx, match[1] ?? '')
    if (!record) return
    const slug = record.slug
    const from = match[2] ?? ''
    let target = LEGACY_TARGET.get(from)
    if (!target) return notFound(ctx)
    const params = new URLSearchParams(ctx.url.searchParams)
    // The old Business OS page picked its document with ?doc=; each plan now has its own path.
    if (from === 'business') {
      if (params.get('doc') === 'marketing-plan') target = 'market/marketing-plan'
      params.delete('doc')
    }
    const query = params.toString()
    redirect(ctx.res, `/brands/${slug}/${target}${query ? `?${query}` : ''}`, 301)
  }

  return { home, brands, refresh, openUpdatePull, assetFile, brandPage, legacyRedirect }
}
