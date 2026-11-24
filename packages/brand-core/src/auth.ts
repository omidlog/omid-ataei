export type Role = 'guest' | 'agent' | 'editor' | 'owner' | 'finance' | 'design' | 'marketing'
export type Audience = 'public' | 'internal' | 'restricted'
export type Operation = 'read' | 'write' | 'approve' | 'export'

export interface AuthContext {
  principal_id: string
  role: Role
  brand_id: string
  audience: Audience
  scopes: string[]
  /** Set only for owner-issued agent tokens. Limits which modules the agent may read. */
  profile?: AgentProfile
}

export interface ResourceRef {
  brand_id: string
  classification: Audience
  status?: string
  publication?: 'unpublished' | 'published'
  /** Owning module id (for example `brand-strategy` or `business-finance`). Required for profiled agents. */
  module?: string
}

/**
 * Fixed agent profiles. An owner picks one when issuing a token; a client cannot pick or widen it.
 * Every profile is read-only for brand data, limited to the `internal` audience, and has no `restricted` scope, so
 * restricted (financial or legal) values are never returned to an agent in this release. The one write any profile
 * has is `content-read` appending a produced/published observation (content-bridge/observations.ts), which changes
 * no fact, strategy or calendar week.
 */
export type AgentProfile = 'internal-read' | 'design' | 'marketing' | 'finance' | 'knowledge-read' | 'creative-read' | 'strategy-seo-read' | 'strategy-ads-read' | 'content-read'

const MARKETING_BUSINESS_MODULES = new Set([
  'business-company',
  'business-customer',
  'business-growth',
  'business-marketing',
  'business-product',
  'business-sales',
])

function isBusinessModule(module: string): boolean {
  return module === 'business' || module.startsWith('business-')
}

function isPersonalModule(module: string): boolean {
  return module.startsWith('personal-')
}

/**
 * Personal Brand OS modules a profiled agent may read. Career relationships, credentials, the
 * evidence register, founder/investor positioning and privacy boundaries are `internal-read` only.
 */
const DESIGN_PERSONAL_MODULES = new Set(['personal-identity', 'personal-presence', 'personal-artist'])
const MARKETING_PERSONAL_MODULES = new Set([
  'personal-identity',
  'personal-positioning',
  'personal-story',
  'personal-content',
  'personal-presence',
  'personal-consultant',
  'personal-creator',
  'personal-speaker',
])

export const AGENT_PROFILES: Record<AgentProfile, { description: string; allowsModule: (module: string) => boolean }> = {
  'internal-read': {
    description: 'Approved internal facts in every module. No restricted values.',
    allowsModule: () => true,
  },
  design: {
    description: 'Approved internal brand, visual, product UI, and mascot facts, plus personal identity and visual presence. No business modules, career history or privacy boundaries.',
    allowsModule: (module) => (isPersonalModule(module) ? DESIGN_PERSONAL_MODULES.has(module) : !isBusinessModule(module)),
  },
  marketing: {
    description: 'Approved internal brand facts plus company, customer, product, sales, marketing, and growth modules, and personal identity, positioning, story, content, presence and offer facets. No career history, evidence register or privacy boundaries.',
    allowsModule: (module) =>
      isPersonalModule(module) ? MARKETING_PERSONAL_MODULES.has(module) : !isBusinessModule(module) || MARKETING_BUSINESS_MODULES.has(module),
  },
  finance: {
    description: 'Approved internal business modules and governance status. Restricted values stay withheld. No personal modules.',
    allowsModule: (module) => isBusinessModule(module) || module === 'governance',
  },
  /**
   * The only profile the knowledge_* MCP tools answer. Facts as internal-read, plus read access to the
   * owner's explicitly shared, merged-into-Git knowledge notes (unapproved ideas, labelled as such). Never
   * local or restricted notes, never writes. Existing tokens keep their profile, so none gains note access.
   */
  'knowledge-read': {
    description: 'Approved internal facts in every module, plus shared knowledge notes (brand/knowledge/shared) labelled as unapproved ideas. No local or restricted notes. No restricted values.',
    allowsModule: () => true,
  },
  /**
   * The only profile the creative_context MCP tool answers. Facts as design, plus the owner's approved creative
   * preferences and cited selection/rejection reasons (derived records, no drafts). Verbatim note text only from
   * shared notes. Existing tokens keep their profile, so none gains creative access.
   */
  'creative-read': {
    description: 'Approved internal facts as the design profile, plus the read-only creative_context tool: owner-approved scoped creative preferences and cited selection/rejection reasons. No drafts, no local note text, no restricted values.',
    allowsModule: (module) => AGENT_PROFILES.design.allowsModule(module),
  },
  /**
   * The only profiles the strategy_* tools answer (strategy/feed.ts). Facts as marketing, plus the owner-approved,
   * currently valid revision of SEO strategies (strategy-seo-read) or paid-media strategies (strategy-ads-read), with
   * the restricted block withheld. No drafts. Reading grants no permission to execute, spend or publish.
   */
  'strategy-seo-read': {
    description: 'Approved internal facts as the marketing profile, plus the read-only Strategy Feed for approved SEO strategies. No drafts, no restricted budget or notes. Grants no execution, spend or publication.',
    allowsModule: (module) => AGENT_PROFILES.marketing.allowsModule(module),
  },
  'strategy-ads-read': {
    description: 'Approved internal facts as the marketing profile, plus the read-only Strategy Feed for approved paid-media strategies. No drafts, no restricted budget or notes. Grants no execution, spend or publication.',
    allowsModule: (module) => AGENT_PROFILES.marketing.allowsModule(module),
  },
  /**
   * The only profile the content_* tools answer (content-bridge/agent.ts), and the Strategy Feed profile for `content`
   * strategies. Facts as marketing, plus approved, current calendar weeks and per-slot briefs. It may append a
   * produced/published observation for a slot of a served week; that is the only thing it writes, and it changes no
   * fact, strategy or week. No drafts, no restricted values. Grants no publication, scheduling or spend.
   */
  'content-read': {
    description: 'Approved internal facts as the marketing profile, plus the approved content strategy (strategy_list/strategy_get), approved current calendar weeks (content_calendar), per-slot briefs (content_brief) and produced/published reports as observations (content_report). No drafts, no restricted values. Grants no publication, scheduling or spend.',
    allowsModule: (module) => AGENT_PROFILES.marketing.allowsModule(module),
  },
}

export function isAgentProfile(value: unknown): value is AgentProfile {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(AGENT_PROFILES, value)
}

/** Context for a token that the server resolved itself. Never build this from a client-supplied claim. */
export function agentTokenContext(brandId: string, tokenId: string, profile: AgentProfile): AuthContext {
  if (!isAgentProfile(profile)) throw new Error('Unknown agent profile.')
  return { principal_id: `agent-token:${tokenId}`, role: 'agent', brand_id: brandId, audience: 'internal', scopes: ['read'], profile }
}

const RANK: Record<Audience, number> = { public: 0, internal: 1, restricted: 2 }

export function guestContext(brandId: string): AuthContext {
  return { principal_id: 'anonymous', role: 'guest', brand_id: brandId, audience: 'public', scopes: ['read'] }
}

export function agentContext(brandId: string): AuthContext {
  return { principal_id: 'local-agent', role: 'agent', brand_id: brandId, audience: 'public', scopes: ['read'] }
}

/** Local process operator. Not selectable by MCP or by a client-supplied actor string. */
export function operatorContext(brandId: string): AuthContext {
  return { principal_id: 'local-process', role: 'owner', brand_id: brandId, audience: 'restricted', scopes: ['read', 'write', 'approve', 'restricted'] }
}

const HUMAN_ROLES: Role[] = ['owner', 'finance', 'editor', 'design', 'marketing']

export function verifiedHumanContext(brandId: string, actor: string): AuthContext | null {
  if (!HUMAN_ROLES.includes(actor as Role)) return null
  const role = actor as Role
  const scopes = ['read', 'write', 'approve']
  if (role === 'owner' || role === 'finance') scopes.push('restricted')
  return {
    principal_id: `verified:${role}`,
    role,
    brand_id: brandId,
    audience: role === 'owner' || role === 'finance' ? 'restricted' : 'internal',
    scopes,
  }
}

export function authorize(ctx: AuthContext, resource: ResourceRef, operation: Operation): { allow: boolean; reason: string } {
  if (ctx.brand_id !== resource.brand_id) return { allow: false, reason: 'cross-brand' }
  if ((ctx.role === 'agent' || ctx.role === 'guest') && operation !== 'read') {
    return { allow: false, reason: operation === 'approve' ? 'agents and guests cannot approve' : `agents and guests cannot ${operation}` }
  }
  if (operation === 'approve') {
    if (ctx.role === 'agent' || ctx.role === 'guest') return { allow: false, reason: 'agents and guests cannot approve' }
    if (!ctx.scopes.includes('approve')) return { allow: false, reason: 'missing approve scope' }
  }
  if (operation === 'write' && !ctx.scopes.includes('write') && !ctx.scopes.includes('approve')) {
    return { allow: false, reason: 'missing write scope' }
  }
  if (RANK[resource.classification] > RANK[ctx.audience]) return { allow: false, reason: 'audience' }
  if (resource.classification === 'restricted' && !ctx.scopes.includes('restricted')) return { allow: false, reason: 'missing restricted scope' }
  if (ctx.role === 'agent') {
    // Agents never see drafts, at any audience.
    if (resource.status !== 'approved') return { allow: false, reason: 'agents only receive approved items' }
    if (ctx.profile !== undefined) {
      if (!isAgentProfile(ctx.profile)) return { allow: false, reason: 'unknown agent profile' }
      if (!resource.module || !AGENT_PROFILES[ctx.profile].allowsModule(resource.module)) {
        return { allow: false, reason: `profile ${ctx.profile} does not cover module ${resource.module ?? 'unknown'}` }
      }
    }
  }
  if (ctx.audience === 'public' || ctx.role === 'guest' || (ctx.role === 'agent' && ctx.profile === undefined)) {
    if (resource.status !== 'approved' || resource.publication !== 'published' || resource.classification !== 'public') {
      return { allow: false, reason: 'public readers only receive published public facts' }
    }
  }
  return { allow: true, reason: 'allowed' }
}
