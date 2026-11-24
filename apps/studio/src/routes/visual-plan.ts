import { redirect } from '../http.js'
import { brandIsReady } from '../sync.js'
import type { BrandView } from '../views/layout.js'
import { PLAN_PATHS, planPage, planPrintPage, type PlanKind } from '../views/visual-plan-page.js'
import type { Handler, StudioCore } from './context.js'

/** The stable path segments of the Visual V3.3 pages, for the route table. */
export const PLAN_ROUTE_PATHS: readonly string[] = Object.values(PLAN_PATHS)

/**
 * Visual V3.3: customer journey map, SOSTAC® overview and OKR tree, and their print views. GET only, read from the
 * sync cache; nothing here writes, refreshes or calls GitHub. A brand that was never synced is sent to its overview.
 */
export function planRoutes(core: StudioCore): { plan: Handler } {
  const { sync, view, render, notFound, brandRecord } = core

  const plan: Handler = (ctx, match) => {
    const record = brandRecord(ctx, match[1] ?? '')
    if (!record) return
    if (!brandIsReady(record)) return redirect(ctx.res, `/brands/${record.slug}/provisioning`, 302)
    const cached = sync.get(record.slug)
    if (cached.status.state === 'never') return redirect(ctx.res, `/brands/${record.slug}`, 302)
    const kind = (Object.entries(PLAN_PATHS).find(([, path]) => path === match[2])?.[0] ?? null) as PlanKind | null
    if (!kind) return notFound(ctx)
    const brand: BrandView = { record, cached, stale: sync.isStale(record.slug, cached.status), refreshing: sync.isRefreshing(record.slug) }
    const flash = ctx.url.searchParams.get('sync')
    const flashValue = flash === 'synced' || flash === 'failed' || flash === 'too-soon' ? flash : null
    if (match[3] !== 'print') return render(ctx, 200, planPage(view(ctx), brand, kind, flashValue))
    const printed = planPrintPage(view(ctx), brand, kind, ctx.url.searchParams.get('edition') === 'public' ? 'public' : 'internal')
    if (!printed) return notFound(ctx)
    render(ctx, 200, printed)
  }

  return { plan }
}
