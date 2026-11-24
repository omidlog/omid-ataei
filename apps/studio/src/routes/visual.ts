import { redirect } from '../http.js'
import { brandIsReady } from '../sync.js'
import { syncFlash, type BrandView } from '../views/layout.js'
import { identityPage, identityPrintPage, visualPage, visualPrintPage } from '../views/visual-page.js'
import { competitorsPage, competitorsPrintPage } from '../views/visual-competitors-page.js'
import { mascotPage, mascotPrintPage } from '../views/visual-mascot-page.js'
import { strategyPage, strategyPrintPage } from '../views/visual-strategy-page.js'
import type { Handler, StudioCore } from './context.js'

/**
 * Visual Blueprint P0: the business model canvas page and its static print view. GET only, read from the sync
 * cache; nothing here writes, refreshes or calls GitHub. A brand that was never synced is sent to its overview,
 * which performs the first read.
 */
export function visualRoutes(core: StudioCore): { visual: Handler } {
  const { sync, view, render, notFound, brandRecord } = core

  const visual: Handler = (ctx, match) => {
    const record = brandRecord(ctx, match[1] ?? '')
    if (!record) return
    if (!brandIsReady(record)) return redirect(ctx.res, `/brands/${record.slug}/provisioning`, 302)
    const cached = sync.get(record.slug)
    if (cached.status.state === 'never') return redirect(ctx.res, `/brands/${record.slug}`, 302)
    const brand: BrandView = { record, cached, stale: sync.isStale(record.slug, cached.status), refreshing: sync.isRefreshing(record.slug), refreshStartedAt: sync.refreshStartedAt(record.slug) }
    const flash = ctx.url.searchParams.get('sync')
    const flashValue = syncFlash(flash, brand)
    // match[2]: the stable path (Visual V2.4); match[3]: its print view.
    // market/competitors: the competitor comparison matrix (V2.2), internal edition only.
    if (match[2] === 'market/competitors') {
      if (match[3] !== 'print') return render(ctx, 200, competitorsPage(view(ctx), brand, flashValue))
      const printed = competitorsPrintPage(view(ctx), brand)
      if (!printed) return notFound(ctx)
      return render(ctx, 200, printed)
    }
    // match[2] === 'brand/mascot': the mascot atlas and evolution sheet (V3.4); print may show the public edition.
    if (match[2] === 'brand/mascot') {
      if (match[3] !== 'print') return render(ctx, 200, mascotPage(view(ctx), brand, flashValue))
      const printed = mascotPrintPage(view(ctx), brand, ctx.url.searchParams.get('edition') === 'public' ? 'public' : 'internal')
      if (!printed) return notFound(ctx)
      return render(ctx, 200, printed)
    }
    // strategy/swot-tows and strategy/value-proposition (V3.2); print may show the public edition.
    if (match[2] === 'strategy/swot-tows' || match[2] === 'strategy/value-proposition') {
      const kind = match[2] === 'strategy/swot-tows' ? 'swot' : 'value-proposition'
      if (match[3] !== 'print') return render(ctx, 200, strategyPage(view(ctx), brand, kind, flashValue))
      const printed = strategyPrintPage(view(ctx), brand, kind, ctx.url.searchParams.get('edition') === 'public' ? 'public' : 'internal')
      if (!printed) return notFound(ctx)
      return render(ctx, 200, printed)
    }
    // brand/book/visual-identity: the Brand Book "Visual identity" chapter (V2.1); strategy/business-model: the canvas.
    const identity = match[2] === 'brand/book/visual-identity'
    if (match[3] !== 'print') return render(ctx, 200, identity ? identityPage(view(ctx), brand, flashValue) : visualPage(view(ctx), brand, flashValue))
    const edition = ctx.url.searchParams.get('edition') === 'public' ? 'public' : 'internal'
    const page = identity ? identityPrintPage(view(ctx), brand, edition) : visualPrintPage(view(ctx), brand, edition)
    if (!page) return notFound(ctx)
    render(ctx, 200, page)
  }

  return { visual }
}
