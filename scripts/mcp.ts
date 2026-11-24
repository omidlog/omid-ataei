import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  AGENT_TOKEN_ENV,
  AgentTokenError,
  brandRetrieve,
  draftPersonalContent,
  PERSONAL_SPECS,
  getAssetMetadata,
  getBrandGuidelines,
  getBrandOverview,
  getBrandStatus,
  getBrandTokens,
  getBusinessPlan,
  getDesignComponent,
  getLogoRules,
  getMarketingPlan,
  getMascotGuidelines,
  getMascotProfile,
  getMotionGuidelines,
  getSocialTemplate,
  InterviewEngine,
  listMascotAssets,
  listMascotStages,
  MAX_DELIVERABLE_COUNT,
  REQUEST_MODES,
  resolveAgentContext,
  RETRIEVE_KINDS,
  runKnowledgeTool,
  runTaskContextTool,
  searchBrandDocs,
  searchMascotAssets,
  TASK_LOCALES,
  TASK_TYPES,
} from '@brand-os/brand-core'
import { runCreativeContextTool, SURFACES } from '@brand-os/brand-core/creative'
import { runContentTool } from '@brand-os/brand-core/content-bridge'
import { REQUIRABLE_ASSETS, runProductionReadinessTool } from '@brand-os/brand-core/runtime'
import { runStrategyTool } from '@brand-os/brand-core/strategy'
import { MAX_ASSET_IDS, runVisualDnaTool, USE_SCOPES, VISUAL_DNA_LOCALES } from '@brand-os/brand-core/visual-dna'

const engine = new InterviewEngine(process.cwd())

/**
 * The caller's identity is fixed once, here, from the server's own environment.
 * No tool takes a role, token, or audience argument, so a client cannot raise its privilege.
 * Unknown, revoked, or cross-brand tokens stop the server (fail closed). No token means guest.
 * Token records are read once; revoking a token takes effect when the server restarts.
 */
function startupContext() {
  const token = process.env[AGENT_TOKEN_ENV]
  delete process.env[AGENT_TOKEN_ENV]
  try {
    return resolveAgentContext(engine.workspaceRoot(), engine.config().brand.slug, token)
  } catch (error) {
    const message = error instanceof AgentTokenError ? error.message : 'Agent token resolution failed. Refusing to start.'
    process.stderr.write(`brand-os mcp: ${message}\n`)
    process.exit(1)
  }
}
const caller = startupContext()
const server = new McpServer({ name: 'brand-os', version: '0.3.0' })

function text(result: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
}

server.registerTool('search_brand_docs', { description: 'Search approved facts this server may read. Guests see published public facts only.', inputSchema: z.object({ query: z.string() }) }, async ({ query }) => text(searchBrandDocs(engine, query, caller)))
server.registerTool('get_brand_tokens', { description: 'Return tokens whose approval hash matches the compiled value.', inputSchema: z.object({}) }, async () => text(getBrandTokens(engine, caller)))
server.registerTool('get_mascot_guidelines', { description: 'Return published mascot rules. Does not invent artwork.', inputSchema: z.object({}) }, async () => text(getMascotGuidelines(engine, caller)))
server.registerTool('list_mascot_assets', { description: 'List approved mascot rows. A disabled mascot returns none.', inputSchema: z.object({}) }, async () => text(listMascotAssets(engine, caller)))
server.registerTool('get_design_component', { description: 'Read one component record. Missing ids stay missing.', inputSchema: z.object({ id: z.string() }) }, async ({ id }) => text(getDesignComponent(engine, id, caller)))
server.registerTool('get_social_template', { description: 'Return an approved social template only.', inputSchema: z.object({ channel: z.string() }) }, async ({ channel }) => text(getSocialTemplate(engine, channel, caller)))
server.registerTool('get_brand_status', { description: 'Coverage and approval counts. No answer values.', inputSchema: z.object({}) }, async () => text(getBrandStatus(engine, caller)))
server.registerTool('get_brand_overview', { description: 'Published overview facts or an explicit missing state.', inputSchema: z.object({}) }, async () => text(getBrandOverview(engine, caller)))
server.registerTool('get_brand_guidelines', { description: 'Published verbal and personality facts.', inputSchema: z.object({}) }, async () => text(getBrandGuidelines(engine, caller)))
server.registerTool('get_logo_rules', { description: 'Published logo rules, or missing.', inputSchema: z.object({}) }, async () => text(getLogoRules(engine, caller)))
server.registerTool('get_mascot_profile', { description: 'Published mascot profile. Disabled module is not applicable.', inputSchema: z.object({}) }, async () => text(getMascotProfile(engine, caller)))
server.registerTool('list_mascot_stages', { description: 'Approved mascot stages only.', inputSchema: z.object({}) }, async () => text(listMascotStages(engine, caller)))
server.registerTool('search_mascot_assets', { description: 'Search approved mascot rows.', inputSchema: z.object({ query: z.string() }) }, async ({ query }) => text(searchMascotAssets(engine, query, caller)))
server.registerTool('get_asset_metadata', { description: 'Approved public asset metadata, or missing.', inputSchema: z.object({ id: z.string() }) }, async ({ id }) => text(getAssetMetadata(engine, id, caller)))
server.registerTool('get_motion_guidelines', { description: 'Published motion facts, or missing.', inputSchema: z.object({}) }, async () => text(getMotionGuidelines(engine, caller)))
server.registerTool('get_marketing_plan', { description: 'Published marketing facts, or missing.', inputSchema: z.object({}) }, async () => text(getMarketingPlan(engine, caller)))
server.registerTool('get_business_plan', { description: 'Published business facts, or missing.', inputSchema: z.object({}) }, async () => text(getBusinessPlan(engine, caller)))

server.registerTool(
  'brand_retrieve',
  {
    description:
      'Unified retrieval of approved brand knowledge this server is authorized to read. kind: facts (optionally module, ids, or query), tokens, mascot (filters: emotion, stage, use_case, angle; approved artwork or an explanation of what is missing), mascot_assets, mascot_stages, component, asset, social_template, status. Every item carries id, source_path, brand_id, classification, approval_state, revision, and withheld/missing markers.',
    inputSchema: z.object({
      kind: z.enum(RETRIEVE_KINDS),
      module: z.string().max(80).optional(),
      ids: z.array(z.string().max(200)).max(100).optional(),
      query: z.string().max(500).optional(),
      filters: z
        .object({
          emotion: z.string().max(100).optional(),
          stage: z.string().max(100).optional(),
          use_case: z.string().max(100).optional(),
          angle: z.string().max(100).optional(),
        })
        .strict()
        .optional(),
    }),
  },
  async ({ kind, module, ids, query, filters }) => text(brandRetrieve(engine, caller, { kind, module, ids, query, filters })),
)

server.registerTool(
  'draft_personal_content',
  {
    description:
      'Draft operation for a Personal Brand OS deliverable (for example professional-bio section short, or linkedin-pack). Returns only approved personal facts this server may read, each with its verification label (verified, owner_stated, unverified), plus the ids that are missing. It has no authority: it cannot approve, publish or write. Compose the draft from these facts only and return it to the owner for approval.',
    inputSchema: z.object({
      deliverable: z.enum(Object.keys(PERSONAL_SPECS) as [string, ...string[]]),
      section: z.string().max(80).optional(),
    }),
  },
  async ({ deliverable, section }) => text(draftPersonalContent(engine, deliverable, caller, section)),
)

// Task Context (see task-context/agent.ts and docs-internal/TASK_CONTEXT.md): one read-only pack of approved context per
// task, built with the same caller context as every other tool. Any owner-issued token of this brand; guests,
// unprofiled agents and other brands are denied. The request text is classified and dropped, never logged or returned.
// One access-log line per call, ids only. Nothing is written, approved, published, scheduled or spent.
server.registerTool(
  'task_context',
  {
    description:
      'Call this first, once per task, before drafting a visual, social posts, a website, a product screen, an ad concept, an identity brief or a personal page. Returns one read-only pack of the approved brand context this token may read for that task: identity, voice, audience, claims, tokens, asset references and source revisions, plus missing[] (existing question ids to ask the owner; never fill them in) and readiness ready|partial|blocked. readiness is about context only, not about a finished deliverable. Give task_type, or request (the owner\'s sentence, classified deterministically in en/fa/tr and not stored); an unclear request returns need_task_type. Quote approved sentences unchanged and cite source_id and source_revision. authorizes is always empty: nothing here permits publishing, scheduling, spending or deploying, and an on-demand batch is not an approved calendar week. Needs an owner-issued agent token of this brand; others get denied.',
    inputSchema: z.object({
      task_type: z.enum(TASK_TYPES).optional(),
      request: z.string().max(500).optional(),
      channel: z.string().max(20).optional(),
      deliverable_count: z.number().int().min(1).max(MAX_DELIVERABLE_COUNT).optional(),
      locale: z.enum(TASK_LOCALES).optional(),
      request_mode: z.enum(REQUEST_MODES).optional(),
      output_format: z.string().max(40).optional(),
      scope_id: z.string().max(40).optional(),
    }),
  },
  async (args) => text(runTaskContextTool(engine, caller, args, { taskTypeHint: 'task_type' })),
)

// Production readiness (see runtime/production-agent.ts and docs-internal/BRAND_RUNTIME.md § Production readiness):
// a separate, pre-render projection over the task_context pack, with asset verdicts from visual_dna, under the same
// caller context. It does not change task_context readiness. Metadata only; nothing is rendered, read as bytes,
// written, approved, published, scheduled or spent.
server.registerTool(
  'production_readiness',
  {
    description:
      'Call after task_context when you are about to produce files, to learn whether production can start. Builds the same pack task_context would (same inputs, same token) and returns a separate production_ready: ready|not_ready, with each check naming its rule owner, input, verdict and whether it blocks. Only objective rules block: pack digest, blocked context, no verified renderer or unsupported format/count for the task, missing approved copy, a banned claim, and a logo the owner marked required (required_assets: ["logo"]) that is missing, changed, withheld or not verifiable. Optional assets never block. Visual taste and persuasion are needs_human_review or not_tested; there is no score. ready is not approval: a person reviews every draft. Only social_batch has a renderer today; other tasks are briefs. Asset verdicts are metadata only, never file bytes. authorizes is always empty. Needs an owner-issued agent token of this brand; others get denied.',
    inputSchema: z
      .object({
        task_type: z.enum(TASK_TYPES).optional(),
        request: z.string().max(500).optional(),
        channel: z.string().max(20).optional(),
        deliverable_count: z.number().int().min(1).max(MAX_DELIVERABLE_COUNT).optional(),
        locale: z.enum(TASK_LOCALES).optional(),
        request_mode: z.enum(REQUEST_MODES).optional(),
        output_format: z.string().max(40).optional(),
        scope_id: z.string().max(40).optional(),
        required_assets: z.array(z.enum(REQUIRABLE_ASSETS)).max(REQUIRABLE_ASSETS.length).optional(),
      })
      .strict(),
  },
  async (args) => text(runProductionReadinessTool(engine, caller, args)),
)

// Knowledge tools: read and preview only, shared notes only, knowledge-read profile only (see knowledge/agent.ts).
const knowledgeFilters = {
  status: z.array(z.enum(['inbox', 'triaged', 'active', 'archived'])).max(4).optional(),
  kind: z.array(z.enum(['idea', 'research', 'reference', 'meeting', 'decision_draft', 'general'])).max(6).optional(),
  tags: z.array(z.string().max(48)).max(10).optional(),
  question_id: z.string().max(120).optional(),
  include_archived: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).max(100_000).optional(),
}
const KNOWLEDGE_NOTE = 'Notes are the owner’s unapproved ideas from brand/knowledge/shared, never brand facts. Needs a knowledge-read token; others get denied.'
server.registerTool('knowledge_list', { description: `List shared knowledge notes (metadata, paginated). ${KNOWLEDGE_NOTE}`, inputSchema: z.object(knowledgeFilters) }, async (args) => text(runKnowledgeTool(engine, caller, 'knowledge_list', args)))
server.registerTool(
  'knowledge_search',
  { description: `Search shared knowledge notes (fa/tr/en) and, separately, approved facts this token may read. ${KNOWLEDGE_NOTE}`, inputSchema: z.object({ query: z.string().max(500), ...knowledgeFilters }) },
  async (args) => text(runKnowledgeTool(engine, caller, 'knowledge_search', args)),
)
server.registerTool('knowledge_read', { description: `Read one shared note: body, id and revision. ${KNOWLEDGE_NOTE}`, inputSchema: z.object({ id: z.string().max(80) }) }, async ({ id }) => text(runKnowledgeTool(engine, caller, 'knowledge_read', { id })))
server.registerTool('knowledge_backlinks', { description: `Links in and out of a shared note, and its linked question ids. ${KNOWLEDGE_NOTE}`, inputSchema: z.object({ id: z.string().max(80) }) }, async ({ id }) => text(runKnowledgeTool(engine, caller, 'knowledge_backlinks', { id })))
server.registerTool(
  'knowledge_suggest_proposal',
  { description: `Preview only: existing question ids a shared note may inform, with the source ref to cite. Writes nothing; the owner stores drafts with brand:knowledge propose. ${KNOWLEDGE_NOTE}`, inputSchema: z.object({ id: z.string().max(80) }) },
  async ({ id }) => text(runKnowledgeTool(engine, caller, 'knowledge_suggest_proposal', { id })),
)

// Creative memory: one read-only tool, creative-read profile only (see creative/agent.ts). Approved preferences and
// cited reasons; drafts withheld; local note text withheld. Every call is access-logged.
server.registerTool(
  'creative_context',
  {
    description:
      'Read-only creative context for new design work: the owner-approved scoped creative preferences that apply, and the owner’s cited reasons for selected, rejected and partly kept variants of in-scope projects, with knowledge:kn_…@sha256 provenance. Give project_id, or surface and series. Drafts are withheld; selected is not a performance result; nothing here authorizes publishing, posting or ads. Needs a creative-read token; others get denied.',
    inputSchema: z.object({
      project_id: z.string().max(40).optional(),
      surface: z.enum(SURFACES).optional(),
      series: z.string().max(40).optional(),
    }),
  },
  async ({ project_id, surface, series }) => text(runCreativeContextTool(engine, caller, { project_id, surface, series })),
)

// Visual DNA (see visual-dna/agent.ts and docs-internal/VISUAL_DNA.md): read-only reference verdicts over the asset
// manifest, the mascot catalog and creative_context, with the same caller context. Metadata only: no file bytes ever
// travel over MCP. Any owner-issued token of this brand; guests, unprofiled agents and other brands are denied.
server.registerTool(
  'visual_dna',
  {
    description:
      'Check visual references before using them: asset ids (from task_context or the manifest), a mascot request (emotion, stage, use_case, angle) and, for a creative-read token, the creative-memory variants of a project. Each reference is approved, withheld, missing or changed, with source, checksum, size, usage rights and the effective model_use (not_allowed unless the owner recorded more). Use only approved references. use_scope (default public) is where the reference will be used: internal-scope rights cover a portrait only for internal use, and an internal verdict is not permission to publish. A missing pose, angle or logo stays missing: never draw, generate or borrow a substitute. model_use is a rights signal, not permission to upload; nothing here sends a file anywhere. Metadata only, never file bytes. authorizes is always empty. Needs an owner-issued agent token of this brand; others get denied.',
    inputSchema: z.object({
      asset_ids: z.array(z.string().max(120)).max(MAX_ASSET_IDS).optional(),
      mascot: z
        .object({ emotion: z.string().max(100).optional(), stage: z.string().max(100).optional(), use_case: z.string().max(100).optional(), angle: z.string().max(100).optional() })
        .strict()
        .optional(),
      creative: z.object({ project_id: z.string().max(40).optional(), surface: z.string().max(40).optional(), series: z.string().max(40).optional() }).strict().optional(),
      use_scope: z.enum(USE_SCOPES).optional(),
      locale: z.enum(VISUAL_DNA_LOCALES).optional(),
    }).strict(),
  },
  async (args) => text(runVisualDnaTool(engine, caller, args)),
)

// Strategy Feed: two read-only tools, strategy-seo-read / strategy-ads-read profiles only (see strategy/feed.ts). The
// approved, currently valid revision of this agent kind's strategies; drafts invisible; restricted block withheld;
// a stale pin is refused. Every call is access-logged. Reading grants no permission to execute, spend or publish.
const STRATEGY_NOTE =
  'Read-only. Owner-approved, currently valid strategy revisions for your agent kind only (the token profile fixes it). Drafts are never served; restricted budget and notes are withheld. Grants no permission to run ads, spend, bid, publish or change a website. Needs a strategy-seo-read or strategy-ads-read token; others get denied.'
server.registerTool('strategy_list', { description: `List approved strategies you may read, with revision, content_sha256 and approval digest to pin. ${STRATEGY_NOTE}`, inputSchema: z.object({}) }, async () =>
  text(runStrategyTool(engine.workspaceRoot(), engine.config().brand.slug, caller, 'strategy_list')),
)
server.registerTool(
  'strategy_get',
  {
    description: `Read one approved strategy slice as stable JSON with approval, version and source digests, redacted and missing fields. Pass pin {revision, content_sha256} to refuse a replaced revision (status stale_pin). ${STRATEGY_NOTE}`,
    inputSchema: z.object({
      strategy_id: z.string().max(48),
      pin: z
        .object({ revision: z.number().int().min(1).max(999_999).optional(), content_sha256: z.string().max(64).optional() })
        .strict()
        .optional(),
    }),
  },
  async ({ strategy_id, pin }) => text(runStrategyTool(engine.workspaceRoot(), engine.config().brand.slug, caller, 'strategy_get', { strategy_id, pin })),
)

// Content Bridge: content-read profile only (see content-bridge/agent.ts). Approved, current calendar weeks and per-slot
// briefs; drafts and weeks that need review invisible; restricted facts withheld; a stale pin is refused. The one write
// is a produced/published observation, which changes no week, strategy or fact. Every call is access-logged.
const CONTENT_NOTE =
  'Owner-approved, current content calendar weeks only. Drafts and weeks that need review are never served; restricted facts are withheld. Grants no permission to post, schedule, publish, advertise or spend. Needs a content-read token; others get denied. lang: en, fa or tr for notices and gap text.'
const CONTENT_PIN = z
  .object({ revision: z.number().int().min(1).max(999_999).optional(), content_sha256: z.string().max(64).optional() })
  .strict()
const CONTENT_LANG = z.enum(['en', 'fa', 'tr']).optional()
const brandArgs = () => [engine.workspaceRoot(), engine.config().brand.slug, caller] as const
server.registerTool(
  'content_calendar',
  {
    description: `Read-only. Approved calendar slots in a date range (YYYY-MM-DD, at most 120 days), optionally one channel, as stable JSON with each week's revision, content_sha256 and approval digest, plus the latest produced/published report per slot. ${CONTENT_NOTE}`,
    inputSchema: z.object({ from: z.string().max(10).optional(), to: z.string().max(10).optional(), channel: z.string().max(20).optional(), lang: CONTENT_LANG }),
  },
  async ({ from, to, channel, lang }) => text(runContentTool(...brandArgs(), 'content_calendar', { from, to, channel, lang })),
)
server.registerTool(
  'content_brief',
  {
    description: `Read-only brief for one slot: voice do/don't, banned claims, audience, the resolved key message, offer and CTA, channel plan, format and language, the cited research angle (observation id and confidence, never its text) and approved creative preference ids. Pass pin {revision, content_sha256} of the week to refuse a replaced week (status stale_pin). ${CONTENT_NOTE}`,
    inputSchema: z.object({ week_id: z.string().max(16), slot_id: z.string().max(5), pin: CONTENT_PIN.optional(), lang: CONTENT_LANG }),
  },
  async ({ week_id, slot_id, pin, lang }) => text(runContentTool(...brandArgs(), 'content_brief', { week_id, slot_id, pin, lang })),
)
server.registerTool(
  'content_report',
  {
    description: `Report that a slot was produced, or published at an https URL. Stored as an observation only: it changes no week, strategy or fact, is never fetched, and grants no permission to publish. pin {revision, content_sha256} of the served week is required. ${CONTENT_NOTE}`,
    inputSchema: z.object({ week_id: z.string().max(16), slot_id: z.string().max(5), pin: CONTENT_PIN, status: z.enum(['produced', 'published']), url: z.string().max(500).optional(), lang: CONTENT_LANG }),
  },
  async ({ week_id, slot_id, pin, status, url, lang }) => text(runContentTool(...brandArgs(), 'content_report', { week_id, slot_id, pin, status, url, lang })),
)

const transport = new StdioServerTransport()
await server.connect(transport)
