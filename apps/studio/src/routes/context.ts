import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Session, SessionStore } from '../auth/session.js'
import type { TotpVerifier } from '../auth/totp.js'
import type { StudioConfig } from '../config.js'
import type { GitHubClient } from '../github/client.js'
import { sendHtml } from '../http.js'
import type { I18n, Locale } from '../i18n/index.js'
import type { ProvisioningService } from '../provision.js'
import type { BrandRecord, Registry } from '../registry.js'
import type { SyncService } from '../sync.js'
import type { TemplateUpdateService } from '../template-update.js'
import type { SafeHtml } from '../views/html.js'
import type { ViewContext } from '../views/layout.js'
import * as pages from '../views/pages.js'

/**
 * Types and shared helpers for the Studio route modules. `server.ts` builds one `StudioCore` per
 * Studio and hands it to each route module; the modules never create sessions, cookie names or
 * registries of their own.
 */
export interface StudioDeps {
  config: StudioConfig
  registry: Registry
  sync: SyncService
  provisioning: ProvisioningService
  templateUpdates: TemplateUpdateService
  readClient: GitHubClient
  provisionClient: GitHubClient
  now?: () => number
  log?: (line: string) => void
}

export type Handler = (ctx: RequestContext, match: RegExpMatchArray) => Promise<void> | void

export interface Route {
  method: 'GET' | 'POST'
  pattern: RegExp
  auth: 'none' | 'session'
  /** Why this route may change state. Required for every non-GET route. */
  writes?: string
  handle: Handler
}

export interface RequestContext {
  req: IncomingMessage
  res: ServerResponse
  url: URL
  locale: Locale
  i: I18n
  session: Session | null
  sessionId: string | null
  form: Record<string, string | string[]>
  raw: Buffer
}

export interface RouteInfo {
  method: string
  pattern: string
  auth: string
  writes: string | null
}

/** What every route module shares: the dependencies, the clock, the log, sessions and page helpers. */
export interface StudioCore {
  deps: StudioDeps
  config: StudioConfig
  registry: Registry
  sync: SyncService
  provisioning: ProvisioningService
  templateUpdates: TemplateUpdateService
  now: () => number
  log: (line: string) => void
  sessions: SessionStore
  totp: TotpVerifier | null
  cookies: { session: string; login: string; lang: string }
  view: (ctx: RequestContext) => ViewContext
  render: (ctx: RequestContext, status: number, page: SafeHtml) => void
  notFound: (ctx: RequestContext) => void
  /** The registry record for a slug, or null after sending the 404 page. */
  brandRecord: (ctx: RequestContext, slug: string) => BrandRecord | null
}

export function createCore(deps: StudioDeps, sessions: SessionStore, totp: TotpVerifier | null): StudioCore {
  const { config, registry } = deps
  const now = deps.now ?? Date.now
  const log = deps.log ?? (() => undefined)

  function view(ctx: RequestContext): ViewContext {
    return {
      i: ctx.i,
      path: ctx.url.pathname,
      csrf: ctx.session?.csrf ?? null,
      login: ctx.session?.login ?? null,
      brands: ctx.session ? registry.list().sort((a, b) => a.display_name.localeCompare(b.display_name)) : [],
      now: now(),
    }
  }

  function render(ctx: RequestContext, status: number, page: SafeHtml): void {
    sendHtml(ctx.res, status, page.value)
  }

  function notFound(ctx: RequestContext): void {
    render(ctx, 404, pages.errorPage(view(ctx), 'notFound'))
  }

  function brandRecord(ctx: RequestContext, slug: string): BrandRecord | null {
    const record = registry.get(slug)
    if (!record) notFound(ctx)
    return record
  }

  return {
    deps,
    config,
    registry,
    sync: deps.sync,
    provisioning: deps.provisioning,
    templateUpdates: deps.templateUpdates,
    now,
    log,
    sessions,
    totp,
    cookies: {
      session: config.secureCookies ? '__Host-studio_session' : 'studio_session',
      login: config.secureCookies ? '__Host-studio_login' : 'studio_login',
      lang: 'studio_lang',
    },
    view,
    render,
    notFound,
    brandRecord,
  }
}

export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined
  return Promise.race([work, new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms)))]).finally(() => clearTimeout(timer))
}
