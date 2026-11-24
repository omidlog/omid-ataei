import { RateLimiter } from '../auth/rate-limit.js'
import { GitHubError } from '../github/client.js'
import * as pages from '../views/pages.js'
import type { Handler, StudioCore } from './context.js'

/** The account page: session, sign-in factors, GitHub configuration and the rate-limited connection test. */
export function accountRoutes(core: StudioCore): { account: Handler } {
  const { deps, config, provisioning, totp, now, view, render } = core
  const testLimiter = new RateLimiter(5, 60_000, now)

  const account: Handler = async (ctx) => {
    let test: pages.AccountState['test'] = null
    if (ctx.url.searchParams.get('test') === '1' && testLimiter.take('owner').ok) {
      test = { read: null, provision: null, error: null }
      try {
        if (deps.readClient.configured) test.read = (await deps.readClient.viewer()).login
        if (deps.provisionClient.configured) test.provision = (await deps.provisionClient.viewer()).login
        if (!deps.readClient.configured && !deps.provisionClient.configured) test.error = ctx.i.t('common.notConfigured')
      } catch (error) {
        test.error = error instanceof GitHubError ? error.message : 'GitHub could not be reached.'
      }
    }
    const session = ctx.session!
    render(
      ctx,
      200,
      pages.accountPage(view(ctx), {
        mfa: totp !== null,
        sessionEndsAt: new Date(session.createdAt + config.sessionTtlMs).toISOString(),
        readConfigured: deps.readClient.configured,
        provisionConfigured: provisioning.configured,
        template: `${config.github.templateOwner}/${config.github.templateRepo}`,
        allowedOwners: config.github.allowedOwners,
        webhookConfigured: config.github.webhookSecret !== null,
        // BOS-11: setup guidance names where the secret goes, never a value.
        webhookUrl: `${config.publicOrigin}/webhooks/github`,
        headPollMs: config.headPollMs,
        test,
      }),
    )
  }

  return { account }
}
