import { RateLimiter } from '../auth/rate-limit.js'
import { first, redirect, sendJson } from '../http.js'
import type { MessageKey } from '../i18n/index.js'
import { validateRequest } from '../provision.js'
import type { BrandRecord } from '../registry.js'
import * as pages from '../views/pages.js'
import { withTimeout, type Handler, type RequestContext, type StudioCore } from './context.js'

export interface ProvisioningRoutes {
  newBrandForm: Handler
  repoCheck: Handler
  createBrand: Handler
  provisioningStatus: Handler
  provisioningJson: Handler
  retryProvisioning: Handler
  discardForm: Handler
  discardProvisioning: Handler
}

/**
 * The new-brand wizard and the owner-only provisioning routes. Creating a brand is Studio's first
 * GitHub write (one new private repository); retry and discard act on Studio's own failed attempts.
 */
export function provisioningRoutes(core: StudioCore): ProvisioningRoutes {
  const { deps, config, registry, provisioning, now, log, view, render, brandRecord } = core
  const provisionLimiter = new RateLimiter(10, 60 * 60_000, now)
  const nameCheckLimiter = new RateLimiter(60, 60_000, now)
  let templateCheck: { at: number; state: 'ok' | 'missing' | 'unknown' } | null = null

  async function checkTemplate(): Promise<'ok' | 'missing' | 'unknown'> {
    if (!provisioning.configured) return 'unknown'
    if (templateCheck && now() - templateCheck.at < 60_000) return templateCheck.state
    let state: 'ok' | 'missing' | 'unknown'
    try {
      const repo = await deps.provisionClient.getRepo(config.github.templateOwner, config.github.templateRepo)
      state = repo?.is_template ? 'ok' : 'missing'
    } catch {
      state = 'unknown'
    }
    templateCheck = { at: now(), state }
    return state
  }

  /** The failed attempt an "Edit and retry" form edits, if it is still a failed attempt. */
  function retryTarget(slug: string): BrandRecord | null {
    if (!slug) return null
    const found = provisioning.failedRecord(slug)
    return found.ok ? found.record : null
  }

  async function wizard(ctx: RequestContext, status: number, values: pages.WizardState['values'], errors: Record<string, string>, formError?: string, retryOf: BrandRecord | null = null): Promise<void> {
    render(
      ctx,
      status,
      pages.wizardPage(view(ctx), {
        values,
        errors,
        formError,
        retryOf: retryOf ? { slug: retryOf.slug, repo: `${retryOf.repo.owner}/${retryOf.repo.name}`, repoMayRemain: retryOf.provisioning?.cleanup === 'required' } : null,
        owners: provisioning.allowedOwners,
        template: `${config.github.templateOwner}/${config.github.templateRepo}`,
        templateState: await checkTemplate(),
        configured: provisioning.configured,
      }),
    )
  }

  const newBrandForm: Handler = async (ctx) => {
    // "Edit and retry" from a failed provisioning page: the previous answers, ready to change.
    const previous = retryTarget(ctx.url.searchParams.get('retry') ?? '')
    if (previous?.provisioning) {
      const r = previous.provisioning.request
      // A request recorded before the identity questions existed prefills unknown / undecided.
      const identity = r.identity ?? { logo_presence: 'unknown', identity_intent: 'undecided', change_depth: null }
      return wizard(ctx, 200, { ...r, facets: [...r.facets], locales: [...r.locales], identity: undefined, ...identity }, {}, undefined, previous)
    }
    await wizard(ctx, 200, { profile: 'business', default_locale: 'en', locales: ['en'], owner: provisioning.allowedOwners[0], logo_presence: 'unknown', identity_intent: 'undecided', change_depth: null }, {})
  }

  /** Read-only: is owner/repo free on GitHub and in Studio? One GET per candidate, never a write. */
  const repoCheck: Handler = async (ctx) => {
    if (!nameCheckLimiter.take('owner').ok) return sendJson(ctx.res, 429, { state: 'unknown' })
    const q = ctx.url.searchParams
    const result = await withTimeout(provisioning.checkName({ owner: q.get('owner') ?? '', repo: q.get('repo') ?? '', slug: q.get('slug') ?? '', retryOf: q.get('retry_of') ?? '' }), 10_000)
    ctx.res.setHeader('Cache-Control', 'no-store')
    sendJson(ctx.res, 200, result ?? { state: 'unknown' })
  }

  const createBrand: Handler = async (ctx) => {
    const form = ctx.form
    const values: pages.WizardState['values'] = {
      name: first(form.name),
      slug: first(form.slug),
      profile: first(form.profile),
      facets: ([] as string[]).concat(form.facets ?? []),
      default_locale: first(form.default_locale),
      locales: ([] as string[]).concat(form.locales ?? []),
      mascot: first(form.mascot) === 'on',
      gamification: first(form.gamification) === 'on',
      owner: first(form.owner),
      repo: first(form.repo),
      logo_presence: first(form.logo_presence),
      identity_intent: first(form.identity_intent),
      change_depth: first(form.change_depth),
    }
    const retrySlug = first(form.retry_of)
    const previous = retryTarget(retrySlug)
    if (!provisioning.configured) return wizard(ctx, 409, values, {}, ctx.i.t('wizard.error.not_configured'), previous)
    // The failed attempt was retried, discarded or finished meanwhile: say so instead of guessing.
    if (retrySlug && !previous) return wizard(ctx, 409, values, {}, ctx.i.t('wizard.error.retry_gone'))
    const { request, errors } = validateRequest(values as Record<string, unknown>, provisioning.allowedOwners)
    if (!request) {
      const messages = Object.fromEntries(Object.entries(errors).map(([field, code]) => [field, ctx.i.t(`wizard.error.${code}` as MessageKey)]))
      return wizard(ctx, 422, values, messages, undefined, previous)
    }
    // A slug or repository another Studio brand already uses keeps its own, clearer message.
    const bySlug = registry.get(request.slug)
    const byRepo = registry.byRepoName(request.owner, request.repo)
    if ((bySlug && bySlug.slug !== previous?.slug) || (byRepo && byRepo.slug !== previous?.slug)) return wizard(ctx, 409, values, {}, ctx.i.t('wizard.error.duplicate'), previous)
    // Check the name before creating anything, so a taken name is fixed here and not on a failed page.
    // If GitHub cannot answer, provisioning still checks the destination itself.
    const name = await withTimeout(provisioning.checkName({ owner: request.owner, repo: request.repo, slug: request.slug, retryOf: previous?.slug }), 10_000)
    if (name?.state === 'taken') {
      const message = name.suggestion ? ctx.i.t('wizard.error.repo_taken_suggest', { repo: request.repo, suggestion: name.suggestion }) : ctx.i.t('wizard.error.repo_taken', { repo: request.repo })
      return wizard(ctx, 409, { ...values, repo: request.repo }, { repo: message }, undefined, previous)
    }
    if (!provisionLimiter.take('owner').ok) return wizard(ctx, 429, values, {}, ctx.i.t('wizard.error.rate_limited'), previous)
    const actor = ctx.session?.login ?? 'owner'
    const started = previous ? provisioning.editAndRetry(previous.slug, request, actor) : provisioning.start(request, actor)
    if (!started.ok) return wizard(ctx, 409, values, {}, ctx.i.t(`wizard.error.${started.code === 'duplicate' || started.code === 'busy' || started.code === 'not_configured' ? started.code : 'duplicate'}` as MessageKey), previous)
    log(`provisioning started for ${request.slug}`)
    redirect(ctx.res, `/brands/${request.slug}/provisioning`)
  }

  const provisioningStatus: Handler = (ctx, match) => {
    const record = brandRecord(ctx, match[1] ?? '')
    if (!record) return
    if (!record.provisioning) return redirect(ctx.res, `/brands/${record.slug}`)
    render(ctx, 200, pages.provisioningPage(view(ctx), record))
  }

  const provisioningJson: Handler = (ctx, match) => {
    const record = registry.get(match[1] ?? '')
    if (!record?.provisioning) return sendJson(ctx.res, 404, { error: 'not_found' })
    const p = record.provisioning
    sendJson(ctx.res, 200, { state: p.state, attempts: p.attempts, steps: p.steps, error: p.error, cleanup: p.cleanup })
  }

  const retryProvisioning: Handler = (ctx, match) => {
    const record = brandRecord(ctx, match[1] ?? '')
    if (!record) return
    if (!provisionLimiter.take('owner').ok) return redirect(ctx.res, `/brands/${record.slug}/provisioning`)
    provisioning.retry(record.slug)
    redirect(ctx.res, `/brands/${record.slug}/provisioning`)
  }

  const discardForm: Handler = (ctx, match) => {
    const record = brandRecord(ctx, match[1] ?? '')
    if (!record) return
    if (record.provisioning?.state !== 'failed') return redirect(ctx.res, `/brands/${record.slug}/provisioning`)
    render(ctx, 200, pages.discardPage(view(ctx), record))
  }

  /** Removes only Studio's record of a failed attempt. Never calls GitHub. */
  const discardProvisioning: Handler = (ctx, match) => {
    const record = brandRecord(ctx, match[1] ?? '')
    if (!record) return
    const result = provisioning.discardFailed(record.slug)
    if (!result.ok) return redirect(ctx.res, `/brands/${record.slug}/provisioning`)
    log(`discarded failed provisioning for ${record.slug}`)
    redirect(ctx.res, '/brands?discarded=1')
  }

  return { newBrandForm, repoCheck, createBrand, provisioningStatus, provisioningJson, retryProvisioning, discardForm, discardProvisioning }
}
