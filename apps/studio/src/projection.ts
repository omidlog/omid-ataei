import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  buildDashboard,
  buildStudioKnowledge,
  buildNamedDocument,
  InterviewEngine,
  isExampleAsset,
  PERSONAL_DOCUMENT_KINDS,
  readFacts,
  readPublicationPolicy,
  readTemplateRecord,
  rightsBlocker,
} from '@brand-os/brand-core'
import { buildStudioCalendar, type StudioCalendarProjection } from '@brand-os/brand-core/content-bridge'
import { coachBeforeApproval, coachNoteText, type CoachCriterion, type CoachStatus } from '@brand-os/brand-core/coach'
import { buildStudioCreative, type StudioCreativeProjection } from '@brand-os/brand-core/creative'
import { buildBusinessModelCanvas, buildVisualIdentity, canvasApplies, imageSize, LOGO_ICON_TAGS, logoChapterStatus, type LogoMasterCandidate, type VisualDocument } from '@brand-os/brand-core/visual'
import { buildCompetitorComparison, buildMascotAtlas, type MascotAssetCandidate } from '@brand-os/brand-core/visual'
import { buildPublishingGallery, questionClassifier, redactBook, redactVisualDocument, type PublishingGallery, type QuestionClassifier } from '@brand-os/brand-core/visual'
import { buildBook, type BookDocument } from '@brand-os/brand-core/visual'
import { buildSwotTows, buildValueProposition } from '@brand-os/brand-core/visual'
import { buildPlanDocuments, type PlanDocuments } from '@brand-os/brand-core/visual'
import { readSharedLandscape } from '@brand-os/brand-core/competitive'
import type { DashboardContradiction, DashboardModule, DocumentKind, DocumentModel, InternalDashboard, StudioKnowledgeProjection } from '@brand-os/brand-core'
import { inspectAssetForPublication } from '@brand-os/asset-catalog'
import type { SvgIssueCode } from '@brand-os/asset-catalog'
import { compileTokens, tokenDigest } from '@brand-os/design-tokens'
import { parse } from 'yaml'

/**
 * The safe, read-only view of one brand repository at one commit.
 *
 * It is built on the server from an extracted checkout of `brand/` (never `brand/.private`) with the
 * existing core functions at the `internal` audience: the dashboard, the shared document model, token
 * approval hashes and asset publication checks. Restricted values are withheld by those functions and
 * are not in Git in the first place. Drafts are labelled as drafts and never shown as approved facts.
 */
export const PREVIEW_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
}

export interface ProjectionToken {
  id: string
  type: string
  value: string
  state: 'approved' | 'draft'
  published: boolean
  source: 'base' | 'generated'
  source_fact: string | null
  example: boolean
}

/** Asset statuses that never get a preview: the file was turned down or taken out of use. */
const NO_PREVIEW_STATUSES = new Set(['rejected', 'retired', 'revoked', 'deprecated', 'archived', 'withdrawn', 'retracted'])

export interface ProjectionAsset {
  id: string
  name: string
  kind: string
  status: string
  visibility: string
  license: string | null
  usage: string | null
  restrictions: string | null
  approved: boolean
  published: boolean
  /** Key of the cached preview file (its SHA-256). Null when there is no safe, readable file to preview. */
  preview_key: string | null
  /**
   * What the preview shows: an approved file, or a draft (not yet approved) one that only the owner
   * sees in Studio, always badged as a draft. Null without a preview. Publication is unaffected:
   * public docs still publish approved assets only.
   */
  preview_state: 'approved' | 'draft' | null
  mime: string | null
  unavailable_reason: 'not_approved' | 'not_present' | 'unsafe' | 'checksum' | 'unsupported_type' | null
  /** For a refused SVG: the issue to show first (a non-fixable one if any). Absent in older caches. */
  unavailable_detail?: { code: SvgIssueCode; line: number | null; fixable: boolean } | null
  /** A template placeholder (tag `example` / `placeholder`, an EXAMPLE licence or an example id). Absent in older caches. */
  example?: boolean
}

export interface StudioProjection {
  schema_version: 1
  /** The template commit recorded in brand/template-version.json; null when the brand has no record. Absent in caches built before template sync. */
  template?: { commit: string | null; repository: string | null } | null
  brand: {
    name: string
    name_status: string
    slug: string
    profile: string
    kind: 'business' | 'personal-brand'
    industry: string
    default_locale: string
    supported_locales: string[]
    publish_docs: string
    status: string
    initialized: boolean
    modules: { mascot: boolean; gamification: boolean; personal: boolean; facets: string[] }
  }
  overview: {
    coverage: number
    approval: number
    required: number
    required_unanswered: number
    pending_review: number
    approved_facts: number
    restricted_withheld: number
    contradictions: number
    /** `applicable`: questions of the group that apply to the brand's profile (BOS-15); 0 is "not applicable". Absent in older caches. */
    groups: Array<{ group: string; required: number; required_approved: number; required_unanswered: number; pending_review: number; applicable?: number }>
    next: Array<{ id: string; priority: string; prompt: string }>
  }
  modules: DashboardModule[]
  review: Array<{ question_id: string; module: string; label: string; state: string; withheld: boolean; draft_value: string | null; approved_value: string | null; approved_version: number | null; reason: string }>
  contradictions: DashboardContradiction[]
  documents: Partial<Record<DocumentKind, DocumentModel>>
  tokens: { items: ProjectionToken[]; approved: number; draft: number; errors: number }
  assets: ProjectionAsset[]
  mascot: null | {
    states: number
    by_status: Record<string, number>
    by_category: Record<string, number>
    artwork_ready: number
    stages: Array<{ id: string; name: string; status: string }>
  }
  personal: null | { facets: string[]; documents: DocumentKind[] }
  /**
   * Shared notes (`brand/knowledge/shared/*.md`) on this commit: unapproved ideas, never facts. Null when the
   * notes could not be read (the rest of the brand still shows). Absent in caches written before this
   * field existed; sync rebuilds those.
   */
  knowledge?: StudioKnowledgeProjection | null
  /**
   * Creative decisions the owner shared (`brand/creative/shared/cp_*.json`) on this commit. Null when they could
   * not be read. Absent in caches written before this field existed; sync rebuilds those.
   */
  creative?: StudioCreativeProjection | null
  /**
   * Approved content calendar weeks the owner shared (`brand/content-calendar/shared/wk-*.json`) on this commit.
   * Null when they could not be read. Absent in caches written before this field existed; sync rebuilds those.
   */
  calendar?: StudioCalendarProjection | null
  /**
   * Strategic Coach notes on the merged drafts awaiting approval (docs-internal/COACH_UX_DECISION.md, moment
   * `studio_overview`). Advisory, `authorizes: []`, question ids and closed-vocabulary text only — never an
   * answer. Null when the coach could not run. Absent in caches written before this field existed; sync rebuilds.
   */
  coach?: StudioCoachProjection | null
  /**
   * Semantic visual documents (Visual Blueprint P0): the business model canvas in its internal and public editions,
   * built from the same approved facts and drafts as the documents. Null when they could not be built. Absent in
   * caches written before this field existed; sync rebuilds those.
   */
  visual?: StudioVisualProjection | null
  /**
   * Publishing gallery (Visual V4.1): document types × export profiles (public, investor, internal) with their
   * readiness, measured on the redacted output each profile would receive. Counts only, never values. Null when it
   * could not be built. Absent in caches written before it existed; sync rebuilds those.
   */
  publishing?: PublishingGallery | null
}

export interface StudioVisualProjection {
  bmc: { applies: boolean; internal: VisualDocument; public: VisualDocument }
  /**
   * Brand Book "Visual identity" chapter (V2.1): colour palette, typography and logo construction from approved facts
   * and the approved master asset only. Absent in caches written before it existed; sync rebuilds those.
   * `master_rule` is the master-logo resolution rule the documents were built with; sync rebuilds an older cache.
   */
  identity?: { internal: VisualDocument; public: VisualDocument; master_rule?: number }
  /**
   * Competitor comparison matrix and price strip (V2.2): owner-reviewed competitors from the shared landscape file
   * (`brand/competitive/shared/landscape.json`) and the own-brand row from approved facts. Internal only. Absent in
   * caches written before it existed; sync rebuilds those.
   */
  competitors?: VisualDocument
  /**
   * Mascot atlas and six-stage evolution sheet (V3.4): approved catalog artwork backed by approved, previewable manifest
   * assets only, in its internal and public editions. Absent in caches written before it existed; sync rebuilds those.
   */
  mascot?: { internal: VisualDocument; public: VisualDocument }
  /**
   * Full Brand Book and Business Report (V4.2), in both editions, for `brand:export-visual --doc brand-book|business-report`.
   * Approved values only (drafts keep their label, restricted values are withheld in every edition). Absent in caches
   * written before it existed; sync rebuilds those.
   */
  /** The Business Report is the business plan as a book: never public (Visual V4.1 profiles), so its public slot is null. */
  books?: { brand_book: { internal: BookDocument; public: BookDocument }; business_report: { internal: BookDocument; public: null } }
  /**
   * SWOT / TOWS and the Value Proposition Canvas (V3.2), in both editions, from the list questions with their item
   * sources (knowledge notes resolve to shared notes only). The lists are internal, so the public edition is empty by
   * design; these types are not in the V4.1 publishing profiles yet (an owner question), so they are not passed through
   * the profile redactor. Absent in caches written before it existed; sync rebuilds.
   */
  strategy?: { swot: { internal: VisualDocument; public: VisualDocument }; value_proposition: { internal: VisualDocument; public: VisualDocument } }
  /**
   * Customer journey swimlane, SOSTAC overview and OKR tree (V3.3), in both editions. Internal: approved, labelled
   * drafts, gaps; public: approved and published only. `applies` follows the canvas (`brandApplicability().frameworks`:
   * business brands, universal with personal on, and personal brands with a business facet). Absent in caches written
   * before it existed; sync rebuilds those.
   */
  plans?: { applies: boolean; internal: PlanDocuments; public: PlanDocuments }
}

/**
 * Version of the master-logo resolution rule baked into a cached identity chapter. 2: named in `brand.logo.masters`,
 * else tagged `master`, else the only approved logo. 3 (BOS-16): a file name naming exactly one asset counts as a
 * reference, a light/dark pair resolves as one logo system, the icon is offered, and the Brand Book logo chapter is
 * never complete without a drawn master. Bump it when the rule changes so caches at the same commit rebuild.
 */
export const IDENTITY_MASTER_RULE = 3

export class ProjectionError extends Error {
  constructor(
    readonly code: 'not_brand_os' | 'slug_mismatch' | 'unsafe_projection',
    message: string,
  ) {
    super(message)
  }
}

function display(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > 2000 ? `${text.slice(0, 2000)}…` : text
}

function readYaml<T>(root: string, relative: string, fallback: T): T {
  const file = path.join(root, relative)
  if (!fs.existsSync(file)) return fallback
  try {
    return (parse(fs.readFileSync(file, 'utf8')) as T | null) ?? fallback
  } catch {
    return fallback
  }
}

const SECRET_PATTERNS = [/bos_at_[A-Za-z0-9_-]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /gh[pousr]_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{30,}/]

/** Last line of defence: a projection that looks like it carries a credential is refused, not served. */
export function assertNoSecrets(value: unknown): void {
  const text = JSON.stringify(value)
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) throw new ProjectionError('unsafe_projection', 'The repository content looks like it contains a credential. Studio refused to display it.')
}

export interface StudioCoachNote {
  question_id: string
  status: CoachStatus
  criterion: CoachCriterion
  canonical_question_id: string | null
  /** Display text per Studio locale: the criterion name and the one next step. Closed vocabulary only. */
  text: Record<'en' | 'fa' | 'tr', { criterion: string; next: string }>
}

export interface StudioCoachProjection {
  authority: 'derived_advice'
  authorizes: []
  rule_version: string
  /** Drafts checked; notes beyond the cap are counted in `more`. */
  checked: number
  more: number
  notes: StudioCoachNote[]
}

/** Up to this many notes on the Overview card. */
export const STUDIO_COACH_LIMIT = 5

/**
 * The coach on the merged drafts. Same policy as `brand:approve` (strategic, free text or a measure, never
 * restricted, silent when ready). A coach failure must not take down the brand view: null, and the card hides.
 */
function projectCoach(engine: InterviewEngine, review: Array<{ question_id: string; state: string }>): StudioCoachProjection | null {
  try {
    const draftIds = review.filter((item) => item.state === 'draft').map((item) => item.question_id)
    const changeIds = review.filter((item) => item.state === 'change_pending').map((item) => item.question_id)
    const result = coachBeforeApproval(engine, { draftIds, changeIds }, { moment: 'studio_overview', limit: STUDIO_COACH_LIMIT })
    if (result.silent.agent_token || result.silent.unavailable === draftIds.length && draftIds.length > 0) return null
    const coach: StudioCoachProjection = {
      authority: 'derived_advice',
      authorizes: [],
      rule_version: result.rule_version,
      checked: result.checked,
      more: result.more,
      notes: result.notes.map((note) => ({
        question_id: note.question_id,
        status: note.status,
        criterion: note.criterion,
        canonical_question_id: note.canonical_question_id,
        text: { en: coachNoteText(note, 'en'), fa: coachNoteText(note, 'fa'), tr: coachNoteText(note, 'tr') },
      })),
    }
    assertNoSecrets(coach)
    return coach
  } catch {
    return null
  }
}

export interface PreviewFile {
  key: string
  source: string
  mime: string
}

/** A malformed knowledge folder must not take down the whole brand view. */
function projectKnowledge(engine: InterviewEngine): StudioKnowledgeProjection | null {
  try {
    const knowledge = buildStudioKnowledge(engine)
    assertNoSecrets(knowledge)
    return knowledge
  } catch {
    return null
  }
}

/** Shared calendar weeks; a malformed folder must not take down the brand view either. */
function projectCalendar(root: string, slug: string): StudioCalendarProjection | null {
  try {
    const calendar = buildStudioCalendar(root, slug)
    assertNoSecrets(calendar)
    return calendar
  } catch {
    return null
  }
}

/** Shared creative decisions; a malformed folder must not take down the brand view either. */
function projectCreative(root: string, slug: string): StudioCreativeProjection | null {
  try {
    const creative = buildStudioCreative(root, slug)
    assertNoSecrets(creative)
    return creative
  } catch {
    return null
  }
}

/** The visual documents; a failure here must not take down the brand view either. */
function projectVisual(engine: InterviewEngine, masters: LogoMasterCandidate[], assets: MascotAssetCandidate[], knowledge: StudioKnowledgeProjection | null = null): StudioVisualProjection | null {
  try {
    const classify = questionClassifier(engine)
    const visual: StudioVisualProjection = {
      bmc: { applies: canvasApplies(engine), internal: buildBusinessModelCanvas(engine, 'internal'), public: publicEdition(buildBusinessModelCanvas(engine, 'public'), classify) },
      identity: { internal: buildVisualIdentity(engine, 'internal', { masters }), public: publicEdition(buildVisualIdentity(engine, 'public', { masters }), classify), master_rule: IDENTITY_MASTER_RULE },
      competitors: buildCompetitorComparison(engine, readSharedLandscape(engine.workspaceRoot(), engine.config().brand.slug)),
      mascot: { internal: buildMascotAtlas(engine, 'internal', { assets }), public: publicEdition(buildMascotAtlas(engine, 'public', { assets }), classify) },
    }
    const book = (kind: 'brand_book' | 'business_report', edition: 'internal' | 'public') =>
      buildBook(engine, kind, edition, { identity: visual.identity?.[edition] ?? null, canvas: visual.bmc[edition], competitors: visual.competitors ?? null })
    visual.books = {
      brand_book: { internal: book('brand_book', 'internal'), public: publicBook(book('brand_book', 'public'), classify) },
      business_report: { internal: book('business_report', 'internal'), public: null },
    }
    // V3.2: item sources may cite shared knowledge notes by id; only their titles are carried, never a body.
    const sharedNotes = new Map((knowledge?.notes ?? []).map((note) => [note.id, note.title] as const))
    visual.strategy = {
      swot: { internal: buildSwotTows(engine, 'internal', { sharedNotes }), public: buildSwotTows(engine, 'public', { sharedNotes }) },
      value_proposition: { internal: buildValueProposition(engine, 'internal', { sharedNotes }), public: buildValueProposition(engine, 'public', { sharedNotes }) },
    }
    visual.plans = { applies: canvasApplies(engine), internal: buildPlanDocuments(engine, 'internal'), public: buildPlanDocuments(engine, 'public') }
    assertNoSecrets(visual)
    return visual
  } catch {
    return null
  }
}

/**
 * Every public edition Studio serves passes the core public-profile redactor (Visual V4.1), so a builder bug cannot put
 * a restricted, finance, `.private`-sourced or draft value on a public print. The builders are a fixed point of it.
 */
function publicEdition(doc: VisualDocument, classify: QuestionClassifier): VisualDocument {
  const redacted = redactVisualDocument(doc, 'public', classify)
  if (!redacted) throw new ProjectionError('unsafe_projection', 'A public visual edition was refused by the public profile.')
  return redacted.document
}

/** The public Brand Book passes the same public-profile redactor as every other public print (finance, `.private`). */
function publicBook(book: BookDocument, classify: QuestionClassifier): BookDocument {
  const redacted = redactBook(book, 'public', classify)
  if (!redacted) throw new ProjectionError('unsafe_projection', 'A public book was refused by the public profile.')
  return redacted.document
}

/** The Publishing gallery; counts only. A failure here must not take down the brand view either. */
function projectPublishing(engine: InterviewEngine, visual: StudioVisualProjection | null): PublishingGallery | null {
  try {
    const gallery = buildPublishingGallery(engine, { bmc: visual?.bmc ?? null, identity: visual?.identity ?? null, mascot: visual?.mascot ?? null, competitors: visual?.competitors ?? null })
    assertNoSecrets(gallery)
    return gallery
  } catch {
    return null
  }
}

function templateRecord(root: string): StudioProjection['template'] {
  try {
    const record = readTemplateRecord(root)
    if (!record) return null
    const repository = record.repository && /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(record.repository) ? record.repository : null
    return { commit: record.commit, repository }
  } catch {
    return null
  }
}

export function buildProjection(root: string, expectedSlug: string): { projection: StudioProjection; previews: PreviewFile[] } {
  if (!fs.existsSync(path.join(root, 'brand', 'brand.config.yaml'))) throw new ProjectionError('not_brand_os', 'The repository has no brand/brand.config.yaml.')
  const engine = new InterviewEngine(root)
  const config = engine.config()
  if (config.brand.slug !== expectedSlug) {
    throw new ProjectionError('slug_mismatch', 'The repository belongs to a different brand slug than the one registered in Studio. Nothing was displayed.')
  }
  const dashboard = buildDashboard(engine, 'internal') as InternalDashboard
  const personal = config.modules.personal?.enabled === true
  const facets = personal ? [...(config.modules.personal?.facets ?? [])] : []

  const documents: StudioProjection['documents'] = {}
  for (const kind of ['brand-book', 'business-plan', 'marketing-plan'] as const) documents[kind] = buildNamedDocument(engine, kind, 'internal')
  const personalDocs: DocumentKind[] = []
  if (personal) {
    for (const kind of PERSONAL_DOCUMENT_KINDS) {
      const model = buildNamedDocument(engine, kind, 'internal')
      if (model.sections.length > 0) {
        documents[kind] = model
        personalDocs.push(kind)
      }
    }
  }

  const approvedFacts = readFacts(root, 'approved', config.brand.slug)
  const questions = new Map(engine.questions().map((question) => [question.id, question]))
  let restrictedWithheld = 0
  let approvedCount = 0
  for (const [id, fact] of Object.entries(approvedFacts)) {
    if (fact.status !== 'approved') continue
    approvedCount += 1
    if (fact.classification === 'restricted' || questions.get(id)?.sensitivity === 'restricted') restrictedWithheld += 1
  }

  const groups = new Map<string, StudioProjection['overview']['groups'][number]>()
  for (const module of dashboard.modules) {
    const entry = groups.get(module.group) ?? { group: module.group, required: 0, required_approved: 0, required_unanswered: 0, pending_review: 0, applicable: 0 }
    entry.required += module.required
    entry.applicable = (entry.applicable ?? 0) + module.applicable
    entry.required_approved += module.required_approved
    entry.required_unanswered += module.required_unanswered
    entry.pending_review += module.pending_review
    groups.set(module.group, entry)
  }

  // Tokens: hash-approved tokens are approved; everything else is a draft, and template examples say so.
  const compiled = compileTokens(root)
  const approvals = readYaml<{ approved?: Record<string, { value_sha256?: string }> }>(root, 'brand/tokens/approvals.yaml', {}).approved ?? {}
  const policy = readPublicationPolicy(root)
  const tokens: ProjectionToken[] = Object.entries(compiled.flat).map(([id, token]) => {
    const approved = approvals[id]?.value_sha256 === tokenDigest(token)
    const value = token.hex ?? (typeof token.value === 'string' || typeof token.value === 'number' ? String(token.value) : JSON.stringify(token.value))
    return {
      id,
      type: token.type,
      value: value.slice(0, 300),
      state: approved ? 'approved' : 'draft',
      published: approved && policy.approved_token_ids.includes(id),
      source: token.source,
      source_fact: token.sourceFact ?? null,
      example: token.source === 'base' && !approved,
    }
  })

  // Assets: approved files and drafts (not yet approved) get a preview when they pass the core
  // publication inspection. A draft preview is owner-only and always labeled as a draft; rejected or
  // retired files get none. A draft without a manifest checksum is keyed by its content hash, but a
  // wrong checksum is still refused.
  const manifest = readYaml<{ assets?: Array<Record<string, unknown>> }>(root, 'brand/assets/asset-manifest.yaml', {})
  const previews: PreviewFile[] = []
  // Logo assets offered to the Visual identity chapter; the core builder decides which (if any) is the master.
  const logoCandidates: LogoMasterCandidate[] = []
  const assetCandidates: MascotAssetCandidate[] = []
  const sizes = new Map<string, { width: number; height: number } | null>()
  const assets: ProjectionAsset[] = (manifest.assets ?? []).slice(0, 2000).flatMap((asset) => {
    if (typeof asset.id !== 'string' || typeof asset.path !== 'string') return []
    const status = typeof asset.status === 'string' ? asset.status : 'unknown'
    const approved = status === 'approved' || status === 'published'
    const published = approved && policy.approved_asset_ids.includes(asset.id) && rightsBlocker(root, asset) === null
    const ext = path.extname(asset.path).toLowerCase()
    const mime = PREVIEW_MIME[ext] ?? null
    let preview_key: string | null = null
    let unavailable_reason: ProjectionAsset['unavailable_reason'] = null
    let unavailable_detail: ProjectionAsset['unavailable_detail'] = null
    const checksum = typeof asset.checksum_sha256 === 'string' && /^[0-9a-f]{64}$/.test(asset.checksum_sha256) ? asset.checksum_sha256 : null
    const draft = !approved && !NO_PREVIEW_STATUSES.has(status)
    if (!approved && !draft) unavailable_reason = 'not_approved'
    else if (!mime) unavailable_reason = 'unsupported_type'
    else if (!checksum && approved) unavailable_reason = 'checksum'
    else {
      const inspected = inspectAssetForPublication(root, asset.path, checksum)
      if (inspected.ok) {
        const bytes = fs.readFileSync(inspected.realPath)
        preview_key = checksum ?? createHash('sha256').update(bytes).digest('hex')
        sizes.set(preview_key, imageSize(bytes, mime))
        previews.push({ key: preview_key, source: inspected.realPath, mime })
      } else {
        unavailable_reason = inspected.reason === 'missing' ? 'not_present' : inspected.reason === 'checksum' ? 'checksum' : 'unsafe'
        const issues = inspected.issues ?? []
        const first = issues.find((issue) => !issue.fixable) ?? issues[0]
        // Only the code, line and whether the core CLI can fix it. All issues are fixable or none is shown as fixable.
        if (first) unavailable_detail = { code: first.code, line: first.line, fixable: issues.every((issue) => issue.fixable) }
      }
    }
    const tags = Array.isArray(asset.tags) ? asset.tags.filter((tag): tag is string => typeof tag === 'string') : []
    // Every asset is offered to the mascot atlas; the core draws only approved, previewable catalog artwork.
    assetCandidates.push({
      asset_id: asset.id.slice(0, 200),
      name: (typeof asset.name === 'string' ? asset.name : asset.id).slice(0, 200),
      version: typeof asset.version === 'string' ? asset.version.slice(0, 40) : null,
      approved,
      published,
      tags: tags.slice(0, 50),
      example: tags.includes('example') || /EXAMPLE/.test(String(asset.license ?? '')),
      preview_key: approved ? preview_key : null,
      mime: approved && preview_key ? mime : null,
      width: null,
      height: null,
    })
    // Logo files and the icon / mark of the logo system (BOS-16) are offered; the core decides which is drawn.
    if (tags.includes('logo') || LOGO_ICON_TAGS.some((tag) => tags.includes(tag))) {
      const size = preview_key ? (sizes.get(preview_key) ?? null) : null
      logoCandidates.push({
        asset_id: asset.id.slice(0, 200),
        name: (typeof asset.name === 'string' ? asset.name : asset.id).slice(0, 200),
        version: typeof asset.version === 'string' ? asset.version.slice(0, 40) : null,
        approved,
        published,
        tags: tags.slice(0, 50),
        example: tags.includes('example') || /example/i.test(asset.id) || /EXAMPLE/.test(String(asset.license ?? '')),
        paths: [asset.path, asset.preview].filter((item): item is string => typeof item === 'string' && item.length > 0).map((item) => item.slice(0, 500)),
        preview_key: approved ? preview_key : null,
        mime: approved && preview_key ? mime : null,
        width: size?.width ?? null,
        height: size?.height ?? null,
      })
    }
    const kind = asset.path.split('/')[2] ?? tags[0] ?? 'asset'
    return [
      {
        id: asset.id.slice(0, 200),
        name: (typeof asset.name === 'string' ? asset.name : asset.id).slice(0, 200),
        kind: kind.slice(0, 50),
        status,
        visibility: typeof asset.visibility === 'string' ? asset.visibility : 'internal',
        license: display(asset.license),
        usage: display(asset.usage),
        restrictions: display(asset.restrictions),
        approved,
        published,
        preview_key,
        preview_state: preview_key ? (approved ? 'approved' : 'draft') : null,
        mime: preview_key ? mime : null,
        unavailable_reason,
        unavailable_detail,
        example: isExampleAsset(asset),
      },
    ]
  })

  let mascot: StudioProjection['mascot'] = null
  if (config.modules.mascot.enabled) {
    const catalog = readYaml<{ states?: Array<Record<string, unknown>> }>(root, 'brand/mascot/catalog.yaml', {})
    const stages = readYaml<{ stages?: Array<Record<string, unknown>> }>(root, 'brand/mascot/stages.yaml', {})
    const byStatus: Record<string, number> = {}
    const byCategory: Record<string, number> = {}
    let ready = 0
    for (const state of catalog.states ?? []) {
      const status = typeof state.status === 'string' ? state.status : 'defined'
      byStatus[status] = (byStatus[status] ?? 0) + 1
      const category = typeof state.category === 'string' ? state.category : 'other'
      byCategory[category] = (byCategory[category] ?? 0) + 1
      if ((status === 'approved' || status === 'published') && Array.isArray(state.source_assets) && state.source_assets.length > 0) ready += 1
    }
    mascot = {
      states: (catalog.states ?? []).length,
      by_status: byStatus,
      by_category: byCategory,
      artwork_ready: ready,
      stages: (stages.stages ?? []).slice(0, 50).map((stage) => ({ id: String(stage.id).slice(0, 100), name: String(stage.name ?? stage.id).slice(0, 100), status: String(stage.status ?? 'draft') })),
    }
  }

  const knowledge = projectKnowledge(engine)
  const visual = projectVisual(engine, logoCandidates, assetCandidates, knowledge)
  // BOS-16: the Brand Book's logo chapter is never "complete" while the identity chapter draws no master logo.
  const book = documents['brand-book']
  if (book) documents['brand-book'] = { ...book, sections: book.sections.map((section) => (section.id === 'logo' ? { ...section, status: logoChapterStatus(section.status, visual?.identity?.internal) } : section)) }
  const projection: StudioProjection = {
    schema_version: 1,
    brand: {
      name: config.brand.name,
      name_status: String(config.brand.name_status ?? 'unknown'),
      slug: config.brand.slug,
      profile: config.brand.profile ?? 'universal',
      kind: personal || config.brand.profile === 'personal-brand' ? 'personal-brand' : 'business',
      industry: String(config.brand.industry ?? 'TBD'),
      default_locale: config.brand.default_locale,
      supported_locales: [...config.brand.supported_locales],
      publish_docs: config.brand.publish_docs,
      status: String(config.brand.status ?? 'draft'),
      initialized: config.brand.initialized === true,
      modules: { mascot: config.modules.mascot.enabled, gamification: config.modules.gamification.enabled, personal, facets },
    },
    overview: {
      coverage: dashboard.coverage.coverage,
      approval: dashboard.coverage.approval,
      required: dashboard.coverage.required,
      required_unanswered: dashboard.coverage.required_unanswered,
      pending_review: dashboard.review_queue.pending,
      approved_facts: approvedCount,
      restricted_withheld: restrictedWithheld,
      contradictions: dashboard.contradictions.length,
      groups: [...groups.values()],
      next: dashboard.next.slice(0, 8),
    },
    modules: dashboard.modules,
    review: dashboard.review_queue.items.slice(0, 300).map((item) => ({
      question_id: item.question_id,
      module: item.module,
      label: item.label,
      state: item.state,
      withheld: item.withheld,
      draft_value: item.withheld ? null : display(item.draft_value),
      approved_value: item.withheld ? null : display(item.approved_value),
      approved_version: item.approved_version,
      reason: item.reason,
    })),
    contradictions: dashboard.contradictions.slice(0, 100),
    documents,
    tokens: { items: tokens, approved: tokens.filter((token) => token.state === 'approved').length, draft: tokens.filter((token) => token.state === 'draft').length, errors: compiled.errors.length },
    assets,
    mascot,
    personal: personal ? { facets, documents: personalDocs } : null,
    knowledge,
    creative: projectCreative(root, engine.config().brand.slug),
    calendar: projectCalendar(root, engine.config().brand.slug),
    template: templateRecord(root),
    visual,
    coach: projectCoach(engine, dashboard.review_queue.items),
    publishing: projectPublishing(engine, visual),
  }
  assertNoSecrets(projection)
  return { projection, previews }
}
