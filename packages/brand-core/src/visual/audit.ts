import fs from 'node:fs'
import path from 'node:path'
import { frameworkClaimErrors, standardVerification, type FrameworkRegistry } from './framework-registry.js'
import { illustrativeCompetitorComparison } from './fixtures-competitors.js'
import { FIXTURE_DRAFT_SENTINEL, FIXTURE_RESTRICTED_SENTINEL, illustrativeBook } from './fixtures-full-book.js'
import { illustrativeVisualIdentity } from './fixtures-identity.js'
import { illustrativeMascotAtlas } from './fixtures-mascot.js'
import { illustrativeJourney, illustrativeOkr, illustrativeSostac } from './fixtures-plan.js'
import { illustrativeSwotTows, illustrativeValueProposition } from './fixtures-strategy.js'
import { illustrativeBusinessModelCanvas } from './fixtures.js'
import registryJson from './frameworks.json' with { type: 'json' }
import { BOOK_TEXT } from './i18n-book.js'
import { COMPETITOR_TEXT } from './i18n-competitors.js'
import { ENTITY_TEXT } from './i18n-entities.js'
import { FULL_BOOK_TEXT } from './i18n-full-book.js'
import { IDENTITY_TEXT } from './i18n-identity.js'
import { MASCOT_TEXT } from './i18n-mascot.js'
import { PLAN_TEXT } from './i18n-plan.js'
import { POSITIONING_TEXT } from './i18n-positioning.js'
import { STRATEGY_TEXT } from './i18n-strategy.js'
import { VISUAL_LANGS, visualCatalog, type VisualLang } from './i18n.js'
import type { FrameworkRef } from './model.js'
import { profilePermits, type PublishingDocumentType } from './publishing.js'

/**
 * Visual V5.1: per-module visual audit and release gate.
 *
 * Every score comes from checks run on this checkout: files and test files that exist, catalogs loaded and compared,
 * fixtures built and inspected, the framework registry read. Nothing is self-reported and a check that cannot run
 * fails; it never passes by default. The rubric is in `docs-internal/VISUAL.md` ("Module audit and release gate").
 */

export const AUDIT_SCHEMA = 'brand-os.visual-audit/1'
export const RUBRIC_VERSION = 1

export const AUDIT_CHECKS = ['model', 'core_tests', 'i18n', 'empty_state', 'studio_tests', 'print', 'rtl', 'redaction', 'visual_qa', 'standards'] as const
export type AuditCheckId = (typeof AUDIT_CHECKS)[number]

/** The 0–5 rubric. A module scores the highest level whose checks, and every lower level's checks, all pass. */
export const VISUAL_RUBRIC: ReadonlyArray<{ level: 1 | 2 | 3 | 4 | 5; id: string; checks: readonly AuditCheckId[] }> = [
  { level: 1, id: 'model', checks: ['model', 'core_tests'] },
  { level: 2, id: 'languages', checks: ['i18n'] },
  { level: 3, id: 'states', checks: ['empty_state', 'studio_tests'] },
  { level: 4, id: 'publication_safe', checks: ['print', 'rtl', 'redaction'] },
  { level: 5, id: 'release_grade', checks: ['visual_qa', 'standards'] },
]

const LEVEL_OF: Record<AuditCheckId, number> = Object.fromEntries(VISUAL_RUBRIC.flatMap((row) => row.checks.map((check) => [check, row.level]))) as Record<AuditCheckId, number>

/** A test file and a pattern that must occur in it: evidence that a test asserts the behaviour. */
export interface TestEvidence {
  file: string
  pattern: RegExp
}

export interface VisualModuleSpec {
  id: string
  title: string
  slice: string
  /** The publishing document type, when the module is one. `public` audience is derived from the V4.1 profiles. */
  document_type?: PublishingDocumentType
  /** Owner-only Studio views that have no document type (never public). */
  owner_only?: boolean
  builder: { file: string; export: string }
  core_tests: string[]
  studio_tests: string[]
  catalogs: string[]
  /** Designed empty or awaiting state: a fixture that is inspected for gaps, or a test that asserts one. */
  empty: (() => unknown) | TestEvidence
  /**
   * Public edition fixture, inspected for values and draft marks that must not be there. Internal modules that still
   * render a public edition in Studio (V3.2, V3.3) declare one too, and it is inspected the same way.
   */
  public_fixture?: () => unknown
  /** Values that must never appear in the public edition. */
  sentinels?: string[]
  /** The test that builds this module's public edition (public modules, and internal modules with a public fixture). */
  redaction_test?: TestEvidence
  /** Print view (or `null`: the module is a screen, not a document). */
  print: TestEvidence | null
  rtl: TestEvidence
  /** Prefix of the reference screenshots in `tests/visual-baselines`, or null when there are none. */
  baselines: string | null
  /** Fixtures whose framework citations are collected (the cited standards come from real output). */
  cites: () => unknown
}

/** A module planned by another slice. Listed as pending, never failed; a probe that matches says it has landed. */
export interface PendingModuleSpec {
  id: string
  title: string
  slice: string
  probe: RegExp
}

export type CatalogSet = Record<string, Partial<Record<VisualLang, unknown>>>

/** The catalogs brand-core owns. Studio's own catalog is added by the command (`studio.publishing`). */
export function coreCatalogs(): CatalogSet {
  const visual = Object.fromEntries(VISUAL_LANGS.map((lang) => [lang, visualCatalog(lang)]))
  return {
    visual,
    identity: IDENTITY_TEXT,
    entities: ENTITY_TEXT,
    book: BOOK_TEXT,
    full_book: FULL_BOOK_TEXT,
    mascot: MASCOT_TEXT,
    competitor: COMPETITOR_TEXT,
    positioning: POSITIONING_TEXT,
    strategy: STRATEGY_TEXT,
    plan: PLAN_TEXT,
  }
}

const allLangs = (build: (lang: VisualLang) => unknown) => () => VISUAL_LANGS.map(build)

const positioningOnly = (variant: 'complete' | 'no_axes') => illustrativeCompetitorComparison(variant).blocks.filter((block) => block.type === 'positioning_map')

export const VISUAL_MODULES: readonly VisualModuleSpec[] = [
  {
    id: 'business_model_canvas',
    title: 'Business Model Canvas',
    slice: 'V0 + V3.1',
    document_type: 'business_model_canvas',
    builder: { file: 'packages/brand-core/src/visual/bmc.ts', export: 'buildBusinessModelCanvas' },
    core_tests: ['tests/visual-bmc.test.ts'],
    studio_tests: ['tests/studio-visual.test.ts', 'tests/studio-visual-browser.test.ts'],
    // V3.1 (structured BMC list zones, repeating_entity) landed inside this module: its catalog is checked here.
    catalogs: ['visual', 'entities'],
    empty: () => illustrativeBusinessModelCanvas('en', 'internal'),
    public_fixture: () => VISUAL_LANGS.map((lang) => illustrativeBusinessModelCanvas(lang, 'public')),
    redaction_test: { file: 'tests/visual-publishing.test.ts', pattern: /buildBusinessModelCanvas\(engine, 'public'\)/ },
    print: { file: 'tests/studio-visual.test.ts', pattern: /business-model\/print/ },
    rtl: { file: 'tests/studio-visual.test.ts', pattern: /dir="rtl"/ },
    baselines: 'bmc-a3',
    cites: () => illustrativeBusinessModelCanvas('en', 'internal'),
  },
  {
    id: 'visual_identity',
    title: 'Visual identity chapter',
    slice: 'V2.1',
    document_type: 'visual_identity',
    builder: { file: 'packages/brand-core/src/visual/identity.ts', export: 'buildVisualIdentity' },
    core_tests: ['tests/visual-identity.test.ts'],
    studio_tests: ['tests/studio-visual-identity.test.ts', 'tests/studio-visual-print-book.test.ts'],
    catalogs: ['visual', 'identity', 'book'],
    empty: () => illustrativeVisualIdentity('internal', 'awaiting'),
    public_fixture: () => [illustrativeVisualIdentity('public', 'complete'), illustrativeVisualIdentity('public', 'awaiting')],
    redaction_test: { file: 'tests/visual-publishing.test.ts', pattern: /buildVisualIdentity\(engine, 'public'\)/ },
    print: { file: 'tests/studio-visual-identity.test.ts', pattern: /visual-identity\/print/ },
    rtl: { file: 'tests/studio-visual-print-book.test.ts', pattern: /dir="rtl"/ },
    baselines: 'book-a4',
    cites: () => illustrativeVisualIdentity('internal', 'complete'),
  },
  {
    id: 'mascot_atlas',
    title: 'Mascot atlas and evolution sheet',
    slice: 'V3.4',
    document_type: 'mascot_atlas',
    builder: { file: 'packages/brand-core/src/visual/mascot.ts', export: 'buildMascotAtlas' },
    core_tests: ['tests/visual-mascot.test.ts'],
    studio_tests: ['tests/studio-visual-mascot.test.ts', 'tests/studio-visual-mascot-browser.test.ts'],
    catalogs: ['visual', 'mascot'],
    empty: () => illustrativeMascotAtlas('internal', 'empty'),
    public_fixture: () => [illustrativeMascotAtlas('public', 'partial'), illustrativeMascotAtlas('public', 'empty')],
    redaction_test: { file: 'tests/visual-publishing.test.ts', pattern: /buildMascotAtlas\(engine, 'public'\)/ },
    print: { file: 'tests/studio-visual-mascot.test.ts', pattern: /mascot\/print/ },
    rtl: { file: 'tests/studio-visual-mascot.test.ts', pattern: /dir="rtl"/ },
    baselines: null,
    cites: () => illustrativeMascotAtlas('internal', 'partial'),
  },
  {
    id: 'brand_book',
    title: 'Full Brand Book',
    slice: 'V4.2',
    document_type: 'brand_book',
    builder: { file: 'packages/brand-core/src/visual/full-book.ts', export: 'buildBook' },
    core_tests: ['tests/visual-full-book.test.ts'],
    studio_tests: ['tests/studio-visual-full-book.test.ts'],
    catalogs: ['full_book', 'book'],
    empty: { file: 'tests/visual-full-book.test.ts', pattern: /every chapter is a designed gap/ },
    public_fixture: () => VISUAL_LANGS.map((lang) => illustrativeBook('brand_book', lang, 'public')),
    sentinels: [FIXTURE_DRAFT_SENTINEL, FIXTURE_RESTRICTED_SENTINEL],
    redaction_test: { file: 'tests/visual-publishing.test.ts', pattern: /public Brand Book passes the public profile/ },
    print: { file: 'tests/studio-visual-full-book.test.ts', pattern: /--doc brand-book/ },
    rtl: { file: 'tests/studio-visual-full-book.test.ts', pattern: /dir="\$\{lang === 'fa' \? 'rtl'/ },
    baselines: 'brand-book-a4',
    cites: () => illustrativeBook('brand_book', 'en', 'internal'),
  },
  {
    id: 'business_report',
    title: 'Business Report',
    slice: 'V4.2',
    document_type: 'business_plan',
    builder: { file: 'packages/brand-core/src/visual/full-book.ts', export: 'buildBook' },
    core_tests: ['tests/visual-full-book.test.ts'],
    studio_tests: ['tests/studio-visual-full-book.test.ts'],
    catalogs: ['full_book', 'book'],
    empty: { file: 'tests/visual-full-book.test.ts', pattern: /every chapter is a designed gap/ },
    print: { file: 'tests/studio-visual-full-book.test.ts', pattern: /business-report/ },
    rtl: { file: 'tests/studio-visual-full-book.test.ts', pattern: /dir="\$\{lang === 'fa' \? 'rtl'/ },
    baselines: 'business-report-a4',
    cites: () => illustrativeBook('business_report', 'en', 'internal'),
  },
  {
    id: 'competitor_comparison',
    title: 'Competitor comparison matrix and price strip',
    slice: 'V2.2',
    document_type: 'competitor_comparison',
    builder: { file: 'packages/brand-core/src/visual/competitors.ts', export: 'buildCompetitorComparison' },
    core_tests: ['tests/visual-competitors.test.ts'],
    studio_tests: ['tests/studio-visual-competitors.test.ts', 'tests/studio-visual-competitors-browser.test.ts'],
    catalogs: ['visual', 'competitor'],
    empty: () => illustrativeCompetitorComparison('empty'),
    print: { file: 'tests/studio-visual-competitors.test.ts', pattern: /competitors\/print/ },
    rtl: { file: 'tests/studio-visual-competitors.test.ts', pattern: /dir="rtl"/ },
    baselines: null,
    cites: () => illustrativeCompetitorComparison('complete'),
  },
  {
    id: 'positioning_map',
    title: 'Positioning map',
    slice: 'V2.3',
    document_type: 'competitor_comparison',
    builder: { file: 'packages/brand-core/src/visual/competitors.ts', export: 'comparisonDocument' },
    core_tests: ['tests/visual-positioning.test.ts'],
    studio_tests: ['tests/studio-visual-positioning.test.ts'],
    catalogs: ['positioning'],
    empty: () => positioningOnly('no_axes'),
    print: { file: 'tests/studio-visual-positioning.test.ts', pattern: /print view/ },
    rtl: { file: 'tests/studio-visual-positioning.test.ts', pattern: /RTL|dir="rtl"/ },
    baselines: null,
    cites: () => positioningOnly('complete'),
  },
  {
    id: 'publishing_gallery',
    title: 'Publishing gallery and Command Center',
    slice: 'V4.1',
    owner_only: true,
    builder: { file: 'packages/brand-core/src/visual/publishing.ts', export: 'buildPublishingGallery' },
    core_tests: ['tests/visual-publishing.test.ts'],
    studio_tests: ['tests/studio-publishing.test.ts', 'tests/studio-publishing-browser.test.ts'],
    catalogs: ['studio.publishing'],
    empty: { file: 'tests/visual-publishing.test.ts', pattern: /blocks what a profile may not receive/ },
    print: null,
    rtl: { file: 'tests/studio-publishing-browser.test.ts', pattern: /dir="rtl"|rtl/i },
    baselines: null,
    cites: () => null,
  },
  {
    id: 'swot_tows',
    title: 'SWOT / TOWS',
    slice: 'V3.2',
    // No publishing document type: the lists are internal; Studio still renders a public edition of designed gaps.
    builder: { file: 'packages/brand-core/src/visual/strategy-lists.ts', export: 'buildSwotTows' },
    core_tests: ['tests/visual-strategy.test.ts'],
    studio_tests: ['tests/studio-visual-strategy.test.ts'],
    catalogs: ['visual', 'strategy'],
    empty: { file: 'tests/studio-visual-strategy.test.ts', pattern: /a designed empty quadrant/ },
    public_fixture: allLangs((lang) => illustrativeSwotTows(lang, 'public')),
    redaction_test: { file: 'tests/visual-strategy.test.ts', pattern: /public shows nothing unpublished/ },
    print: { file: 'tests/studio-visual-strategy.test.ts', pattern: /swot-tows\/print/ },
    rtl: { file: 'tests/studio-visual-strategy.test.ts', pattern: /text inside the quadrants is right-to-left/ },
    baselines: null,
    cites: () => illustrativeSwotTows('en', 'internal'),
  },
  {
    id: 'value_proposition',
    title: 'Value Proposition Canvas',
    slice: 'V3.2',
    builder: { file: 'packages/brand-core/src/visual/strategy-lists.ts', export: 'buildValueProposition' },
    core_tests: ['tests/visual-strategy.test.ts'],
    studio_tests: ['tests/studio-visual-strategy.test.ts'],
    catalogs: ['visual', 'strategy'],
    empty: { file: 'tests/studio-visual-strategy.test.ts', pattern: /Public edition: these lists are internal[\s\S]*value-proposition[\s\S]*Not published/ },
    public_fixture: allLangs((lang) => illustrativeValueProposition(lang, 'public')),
    redaction_test: { file: 'tests/visual-strategy.test.ts', pattern: /the public edition drops internal sources/ },
    print: { file: 'tests/studio-visual-strategy.test.ts', pattern: /value-proposition\/print/ },
    rtl: { file: 'tests/studio-visual-strategy.test.ts', pattern: /faVpc\.text, \/<html lang="fa" dir="rtl">/ },
    baselines: null,
    cites: () => illustrativeValueProposition('en', 'internal'),
  },
  {
    id: 'customer_journey',
    title: 'Customer journey swimlane',
    slice: 'V3.3',
    document_type: 'marketing_plan',
    builder: { file: 'packages/brand-core/src/visual/plan.ts', export: 'journeyDocument' },
    core_tests: ['tests/visual-plan.test.ts'],
    studio_tests: ['tests/studio-visual-plan.test.ts'],
    catalogs: ['visual', 'plan'],
    empty: () => illustrativeJourney('en', 'internal', 'empty'),
    public_fixture: allLangs((lang) => illustrativeJourney(lang, 'public')),
    redaction_test: { file: 'tests/visual-plan.test.ts', pattern: /public edition: drafts never appear/ },
    print: { file: 'tests/studio-visual-plan.test.ts', pattern: /'market\/customer-journey'[\s\S]*\$\{pathname\}\/print/ },
    rtl: { file: 'tests/studio-visual-plan.test.ts', pattern: /the swimlane is not forced left-to-right: it mirrors/ },
    baselines: null,
    cites: () => illustrativeJourney('en', 'internal'),
  },
  {
    id: 'sostac_overview',
    title: 'SOSTAC overview',
    slice: 'V3.3',
    document_type: 'marketing_plan',
    builder: { file: 'packages/brand-core/src/visual/plan.ts', export: 'sostacDocument' },
    core_tests: ['tests/visual-plan.test.ts'],
    studio_tests: ['tests/studio-visual-plan.test.ts'],
    catalogs: ['visual', 'plan'],
    empty: () => illustrativeSostac('en', 'internal', 'empty'),
    public_fixture: allLangs((lang) => illustrativeSostac(lang, 'public')),
    redaction_test: { file: 'tests/visual-plan.test.ts', pattern: /public edition: drafts never appear/ },
    print: { file: 'tests/studio-visual-plan.test.ts', pattern: /strategy\/sostac\/print/ },
    rtl: { file: 'tests/studio-visual-plan.test.ts', pattern: /faPrint\.text, \/<html lang="fa" dir="rtl">/ },
    baselines: null,
    cites: () => illustrativeSostac('en', 'internal'),
  },
  {
    id: 'okr_tree',
    title: 'OKR tree',
    slice: 'V3.3',
    document_type: 'business_plan',
    builder: { file: 'packages/brand-core/src/visual/plan.ts', export: 'okrDocument' },
    core_tests: ['tests/visual-plan.test.ts'],
    studio_tests: ['tests/studio-visual-plan.test.ts'],
    catalogs: ['visual', 'plan'],
    empty: () => illustrativeOkr('en', 'internal', 'empty'),
    public_fixture: allLangs((lang) => illustrativeOkr(lang, 'public')),
    redaction_test: { file: 'tests/visual-plan.test.ts', pattern: /public edition: drafts never appear/ },
    print: { file: 'tests/studio-visual-plan.test.ts', pattern: /strategy\/okrs\/print/ },
    rtl: { file: 'tests/studio-visual-plan.test.ts', pattern: /the progress bar fills from the right in Persian/ },
    baselines: null,
    cites: () => illustrativeOkr('en', 'internal'),
  },
]

/**
 * Modules planned by other slices, listed as pending until they land. V3.1 (structured BMC) is scored inside
 * `business_model_canvas`; V3.2 and V3.3 are scored above. The probe scans `packages/brand-core/src/visual/*.ts`.
 */
export const PENDING_VISUAL_MODULES: readonly PendingModuleSpec[] = []

export type CheckStatus = 'pass' | 'fail' | 'n/a'

export interface AuditCheck {
  id: AuditCheckId
  level: number
  status: CheckStatus
  evidence: string
}

export interface CitedStandard {
  framework_id: string
  kind: FrameworkRef['kind'] | 'unknown'
  verification: 'verified' | 'pending' | 'not_in_registry'
}

export interface ModuleAudit {
  id: string
  title: string
  slice: string
  audience: 'public' | 'internal'
  status: 'present' | 'pending' | 'unregistered'
  score: number | null
  checks: AuditCheck[]
  /** The first check that holds the score back, or null at 5. */
  next: AuditCheckId | null
  cites: CitedStandard[]
}

export interface StandardRecord {
  framework_id: string
  title: string
  kind: FrameworkRef['kind']
  permitted_claim: FrameworkRef['permitted_claim']
  verified_on: string | null
  reviewer: string
  verification: 'verified' | 'pending'
  cited_by: string[]
}

export interface VisualAuditReport {
  schema: typeof AUDIT_SCHEMA
  rubric_version: typeof RUBRIC_VERSION
  modules: ModuleAudit[]
  standards: StandardRecord[]
  registry_errors: string[]
}

export interface AuditOptions {
  root: string
  catalogs?: CatalogSet
  registry?: FrameworkRegistry
  modules?: readonly VisualModuleSpec[]
  pending?: readonly PendingModuleSpec[]
}

function read(root: string, file: string): string | null {
  try {
    return fs.readFileSync(path.join(root, file), 'utf8')
  } catch {
    return null
  }
}

function testCount(text: string): number {
  return (text.match(/^\s*(?:test|it)\(/gm) ?? []).length
}

function walk(value: unknown, visit: (node: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) for (const item of value) walk(item, visit)
  else if (value && typeof value === 'object') {
    visit(value as Record<string, unknown>)
    for (const child of Object.values(value as Record<string, unknown>)) walk(child, visit)
  }
}

function leaves(value: unknown, prefix = ''): Array<[string, unknown]> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key))
  if (Array.isArray(value)) return value.flatMap((child, index) => leaves(child, `${prefix}[${index}]`))
  return [[prefix, value]]
}

const GAP_STATES = new Set(['missing', 'assumption', 'withheld', 'unknown', 'not_drawn', 'needs_review'])
const PUBLIC_VALUE_STATES = new Set(['approved', 'stale'])
const PERSIAN = /[؀-ۿ]/

function run<T>(fn: () => T): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: fn() }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function isEvidence(value: unknown): value is TestEvidence {
  return Boolean(value) && typeof value === 'object' && typeof (value as TestEvidence).file === 'string' && (value as TestEvidence).pattern instanceof RegExp
}

function evidenceCheck(root: string, evidence: TestEvidence): { ok: boolean; detail: string } {
  const text = read(root, evidence.file)
  if (text === null) return { ok: false, detail: `${evidence.file} missing` }
  if (testCount(text) === 0) return { ok: false, detail: `${evidence.file} has no tests` }
  return evidence.pattern.test(text) ? { ok: true, detail: `${evidence.file} asserts ${evidence.pattern.source}` } : { ok: false, detail: `${evidence.file} does not assert ${evidence.pattern.source}` }
}

/** en/fa/tr: every English key present in fa and tr, no empty string, fa set in Persian script (≥ 90 % of strings). */
export function catalogCheck(name: string, catalog: Partial<Record<VisualLang, unknown>> | undefined): { ok: boolean; detail: string } {
  if (!catalog) return { ok: false, detail: `${name}: catalog not found` }
  const missingLang = VISUAL_LANGS.filter((lang) => catalog[lang] === undefined)
  if (missingLang.length) return { ok: false, detail: `${name}: no ${missingLang.join(', ')}` }
  const en = leaves(catalog.en).filter(([, value]) => typeof value === 'string') as Array<[string, string]>
  const fa = new Map(leaves(catalog.fa))
  const tr = new Map(leaves(catalog.tr))
  const missing = en.filter(([key]) => typeof fa.get(key) !== 'string' || typeof tr.get(key) !== 'string').map(([key]) => key)
  const empty = [...en, ...[...fa, ...tr].filter((pair): pair is [string, string] => typeof pair[1] === 'string')].filter(([, value]) => value.trim() === '').map(([key]) => key)
  const persian = en.filter(([key]) => PERSIAN.test(String(fa.get(key) ?? ''))).length
  const share = en.length ? persian / en.length : 0
  const ok = en.length > 0 && missing.length === 0 && empty.length === 0 && share >= 0.9
  const detail = `${name}: ${en.length} strings, ${missing.length} missing in fa/tr, ${empty.length} empty, ${Math.floor(share * 100)} % Persian script in fa`
  return { ok, detail: missing.length ? `${detail} (${missing.slice(0, 3).join(', ')})` : detail }
}

function citedIds(output: unknown): string[] {
  const ids = new Set<string>()
  walk(output, (node) => {
    if (typeof node.framework_id === 'string') ids.add(node.framework_id)
  })
  return [...ids].sort()
}

function auditModule(spec: VisualModuleSpec, ctx: { root: string; catalogs: CatalogSet; registry: Map<string, FrameworkRef> }): ModuleAudit {
  const { root } = ctx
  const checks: AuditCheck[] = []
  const add = (id: AuditCheckId, status: CheckStatus, evidence: string) => checks.push({ id, level: LEVEL_OF[id], status, evidence })
  const audience: 'public' | 'internal' = spec.document_type && profilePermits('public', spec.document_type) ? 'public' : 'internal'

  // 1. Model: the builder exists and is exported; the core tests exist, have tests and name the builder.
  const builder = read(root, spec.builder.file)
  const exported = builder !== null && new RegExp(`export (?:async )?function ${spec.builder.export}\\b`).test(builder)
  add('model', exported ? 'pass' : 'fail', exported ? `${spec.builder.file} exports ${spec.builder.export}` : `${spec.builder.file}: no exported ${spec.builder.export}`)
  const core = spec.core_tests.map((file) => ({ file, text: read(root, file) }))
  const coreMissing = core.filter((test) => test.text === null || testCount(test.text) === 0).map((test) => test.file)
  const coreTests = core.reduce((sum, test) => sum + (test.text ? testCount(test.text) : 0), 0)
  add('core_tests', core.length > 0 && coreMissing.length === 0 ? 'pass' : 'fail', coreMissing.length ? `missing or empty: ${coreMissing.join(', ')}` : `${coreTests} tests in ${spec.core_tests.join(', ')}`)

  // 2. Languages.
  const catalogResults = spec.catalogs.map((name) => catalogCheck(name, ctx.catalogs[name]))
  add('i18n', catalogResults.length > 0 && catalogResults.every((result) => result.ok) ? 'pass' : 'fail', catalogResults.map((result) => result.detail).join('; ') || 'no catalog declared')

  // 3. States: a designed empty/awaiting state, and Studio renderer tests.
  if (isEvidence(spec.empty)) {
    const result = evidenceCheck(root, spec.empty)
    add('empty_state', result.ok ? 'pass' : 'fail', result.detail)
  } else {
    const built = run(spec.empty as () => unknown)
    if (!built.ok) add('empty_state', 'fail', `fixture failed: ${built.error}`)
    else {
      let gaps = 0
      walk(built.value, (node) => {
        if ((typeof node.state === 'string' && GAP_STATES.has(node.state)) || (typeof node.gap === 'string' && node.gap) || node.data_state === 'missing' || node.kind === 'unavailable') gaps += 1
      })
      add('empty_state', gaps > 0 ? 'pass' : 'fail', `fixture carries ${gaps} designed gap(s)`)
    }
  }
  const studio = spec.studio_tests.map((file) => ({ file, text: read(root, file) }))
  const studioMissing = studio.filter((test) => test.text === null || testCount(test.text) === 0).map((test) => test.file)
  add('studio_tests', studio.length > 0 && studioMissing.length === 0 ? 'pass' : 'fail', studioMissing.length ? `missing or empty: ${studioMissing.join(', ')}` : `${studio.reduce((sum, test) => sum + testCount(test.text!), 0)} tests in ${spec.studio_tests.join(', ')}`)

  // 4. Publication-safe: print view, RTL, redaction.
  if (spec.print === null) add('print', 'n/a', 'a Studio screen, not a printed document')
  else {
    const result = evidenceCheck(root, spec.print)
    add('print', result.ok ? 'pass' : 'fail', result.detail)
  }
  const rtl = evidenceCheck(root, spec.rtl)
  add('rtl', rtl.ok ? 'pass' : 'fail', rtl.detail)
  if (audience === 'public' || spec.public_fixture) {
    const coverage = spec.redaction_test ? evidenceCheck(root, spec.redaction_test) : { ok: false, detail: 'no redaction test declared' }
    const built = spec.public_fixture ? run(spec.public_fixture) : null
    const leaks: string[] = []
    if (!built) leaks.push('no public fixture declared')
    else if (!built.ok) leaks.push(`public fixture failed: ${built.error}`)
    else {
      walk(built.value, (node) => {
        if (typeof node.state === 'string' && 'value' in node && node.value !== null && node.value !== undefined && !PUBLIC_VALUE_STATES.has(node.state)) leaks.push(`${String(node.id ?? '?')} (${node.state}) carries a value`)
        if (Array.isArray(node.badges) && node.badges.length > 0) leaks.push(`draft or internal badge in public: ${node.badges.join(', ')}`)
      })
      const json = JSON.stringify(built.value)
      for (const sentinel of spec.sentinels ?? []) if (json.includes(sentinel)) leaks.push('a draft or restricted sentinel reached the public edition')
    }
    if (!coverage.ok) leaks.push(coverage.detail)
    const scope = audience === 'public' ? '' : `internal${spec.document_type ? ` (the public profile refuses ${spec.document_type})` : ''}; `
    add('redaction', leaks.length === 0 ? 'pass' : 'fail', leaks.length ? leaks.slice(0, 3).join('; ') : `${scope}public edition carries no draft, withheld or badge; redaction test covers it`)
  } else if (spec.document_type) {
    add('redaction', 'pass', `internal only: the public profile refuses ${spec.document_type}`)
  } else {
    add('redaction', spec.owner_only ? 'n/a' : 'fail', spec.owner_only ? 'owner-only Studio view; never exported' : 'audience undeclared')
  }

  // 5. Release-grade: reference screenshots in en and fa, and every cited registry entry verified.
  if (spec.baselines === null) add('visual_qa', 'fail', 'no reference screenshots')
  else {
    const dir = path.join(root, 'tests', 'visual-baselines')
    const files = fs.existsSync(dir) ? fs.readdirSync(dir) : []
    const langs = ['en', 'fa'].filter((lang) => files.some((file) => file.startsWith(`${spec.baselines}.`) && file.endsWith(`.${lang}.png`)))
    const qa = read(root, 'tests/studio-visual-qa.test.ts')
    const referenced = qa !== null && qa.includes(`${spec.baselines}.`)
    add('visual_qa', langs.length === 2 && referenced ? 'pass' : 'fail', `baselines ${spec.baselines}.*: ${langs.join('+') || 'none'}${referenced ? '' : ', not referenced by tests/studio-visual-qa.test.ts'}`)
  }
  const cited = run(spec.cites)
  const cites: CitedStandard[] = cited.ok
    ? citedIds(cited.value).map((id) => {
        const ref = ctx.registry.get(id)
        return { framework_id: id, kind: ref?.kind ?? 'unknown', verification: ref ? standardVerification(ref) : 'not_in_registry' }
      })
    : []
  if (!cited.ok) add('standards', 'fail', `citation fixture failed: ${cited.error}`)
  else if (cites.length === 0) add('standards', 'n/a', 'cites no framework or standard')
  else {
    const open = cites.filter((cite) => cite.verification !== 'verified')
    add('standards', open.length === 0 ? 'pass' : 'fail', cites.map((cite) => `${cite.framework_id} ${cite.verification}`).join(', '))
  }

  let score = 0
  let next: AuditCheckId | null = null
  for (const row of VISUAL_RUBRIC) {
    const failed = checks.find((check) => row.checks.includes(check.id) && check.status === 'fail')
    if (failed) {
      next = failed.id
      break
    }
    score = row.level
  }
  return { id: spec.id, title: spec.title, slice: spec.slice, audience, status: 'present', score, checks, next, cites }
}

function probeSources(root: string): string {
  const dir = path.join(root, 'packages', 'brand-core', 'src', 'visual')
  if (!fs.existsSync(dir)) return ''
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.ts') && file !== 'audit.ts' && !file.startsWith('fixtures-pilot'))
    .map((file) => `${file}\n${fs.readFileSync(path.join(dir, file), 'utf8')}`)
    .join('\n')
}

/** Runs every check. Pure apart from reading the checkout under `root`. */
export function auditVisualModules(options: AuditOptions): VisualAuditReport {
  const registryDoc = options.registry ?? (registryJson as unknown as FrameworkRegistry)
  const registryErrors = frameworkClaimErrors(registryDoc)
  const registry = new Map(registryDoc.frameworks.map((ref) => [ref.framework_id, ref]))
  const catalogs = { ...coreCatalogs(), ...(options.catalogs ?? {}) }
  const modules = (options.modules ?? VISUAL_MODULES).map((spec) => auditModule(spec, { root: options.root, catalogs, registry }))
  const sources = probeSources(options.root)
  const known = new Set(modules.map((module) => module.id))
  for (const pending of options.pending ?? PENDING_VISUAL_MODULES) {
    if (known.has(pending.id)) continue
    modules.push({ id: pending.id, title: pending.title, slice: pending.slice, audience: 'internal', status: pending.probe.test(sources) ? 'unregistered' : 'pending', score: null, checks: [], next: null, cites: [] })
  }
  const standards: StandardRecord[] = registryDoc.frameworks.map((ref) => ({
    framework_id: ref.framework_id,
    title: ref.title,
    kind: ref.kind,
    permitted_claim: ref.permitted_claim,
    verified_on: ref.verified_on,
    reviewer: ref.reviewer,
    verification: standardVerification(ref),
    cited_by: modules.filter((module) => module.cites.some((cite) => cite.framework_id === ref.framework_id)).map((module) => module.id),
  }))
  return { schema: AUDIT_SCHEMA, rubric_version: RUBRIC_VERSION, modules, standards, registry_errors: registryErrors }
}

// ---- Release gate ---------------------------------------------------------------------------------------------

export const RELEASE_GATE_POLICY_PATH = 'packages/brand-core/src/visual/release-gate.json'

export interface GateOverride {
  /** `module:<id>` lowers nothing; it lets that module pass below the threshold. `standard:<framework_id>` lets an unverified standard pass. */
  target: string
  reason: string
  approved_by: string
  approved_on: string
  expires_on: string
}

export interface ReleaseGatePolicy {
  schema_version: 1
  /** The lowest score a public module may have. */
  public_min_score: number
  /** `release`: unverified standards block only `--release`; `always`: they block every run. */
  standards_block: 'release' | 'always'
  overrides: GateOverride[]
}

export interface GateResult {
  ok: boolean
  mode: 'ci' | 'release'
  failures: string[]
  /** Not failing in this mode, but a release would stop on them. */
  release_blockers: string[]
  overridden: string[]
  pending: string[]
  notes: string[]
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const isDate = (value: unknown): value is string => typeof value === 'string' && DATE.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`))

/** Policy errors. An override needs a named approver (not "pending"), a reason, and a date window that is open today. */
export function gatePolicyErrors(policy: unknown, today: string): string[] {
  const errors: string[] = []
  const doc = policy as Partial<ReleaseGatePolicy> | null
  if (!doc || typeof doc !== 'object') return [`${RELEASE_GATE_POLICY_PATH}: not an object`]
  if (doc.schema_version !== 1) errors.push(`${RELEASE_GATE_POLICY_PATH}: schema_version must be 1`)
  if (!Number.isInteger(doc.public_min_score) || doc.public_min_score! < 0 || doc.public_min_score! > 5) errors.push(`${RELEASE_GATE_POLICY_PATH}: public_min_score must be an integer 0–5`)
  if (doc.standards_block !== 'release' && doc.standards_block !== 'always') errors.push(`${RELEASE_GATE_POLICY_PATH}: standards_block must be release or always`)
  if (!Array.isArray(doc.overrides)) errors.push(`${RELEASE_GATE_POLICY_PATH}: overrides must be a list`)
  for (const [index, item] of (Array.isArray(doc.overrides) ? doc.overrides : []).entries()) {
    const at = `${RELEASE_GATE_POLICY_PATH} overrides[${index}]`
    if (typeof item?.target !== 'string' || !/^(module|standard):[A-Za-z0-9_-]+$/.test(item.target)) errors.push(`${at}: target must be module:<id> or standard:<framework_id>`)
    if (typeof item?.reason !== 'string' || item.reason.trim().length < 10) errors.push(`${at}: a reason of at least 10 characters is required`)
    if (typeof item?.approved_by !== 'string' || !item.approved_by.trim() || item.approved_by.trim().toLowerCase() === 'pending') errors.push(`${at}: approved_by must name the owner who approved it`)
    if (!isDate(item?.approved_on) || item.approved_on > today) errors.push(`${at}: approved_on must be a date not after today`)
    if (!isDate(item?.expires_on)) errors.push(`${at}: expires_on must be a date`)
    else if (item.expires_on <= today) errors.push(`${at}: expired on ${item.expires_on}; renew or remove it`)
  }
  return errors
}

/**
 * The gate. Fails on: registry errors, a policy error, a present public module below `public_min_score`, a cited
 * standard that is not in the registry, and (in release mode, or with `standards_block: always`) a cited external
 * standard (formal standard or professional framework) without `verified_on` and a reviewer. Pending V3.x modules
 * never fail it. A valid owner override turns one failure into a listed, overridden line.
 */
export function evaluateGate(report: VisualAuditReport, policy: ReleaseGatePolicy, options: { release: boolean; today: string }): GateResult {
  const mode = options.release ? 'release' : 'ci'
  const failures: string[] = [...report.registry_errors]
  const releaseBlockers: string[] = []
  const overridden: string[] = []
  const policyErrors = gatePolicyErrors(policy, options.today)
  failures.push(...policyErrors)
  const overrides = new Map(policyErrors.length ? [] : policy.overrides.map((item) => [item.target, item]))
  const fail = (target: string, message: string) => {
    const override = overrides.get(target)
    if (override) overridden.push(`${message} — overridden by ${override.approved_by} on ${override.approved_on} until ${override.expires_on}: ${override.reason}`)
    else failures.push(message)
  }
  for (const module of report.modules) {
    if (module.status !== 'present' || module.audience !== 'public') continue
    if ((module.score ?? 0) < policy.public_min_score) fail(`module:${module.id}`, `${module.id}: public module scores ${module.score}/5, below ${policy.public_min_score} (next: ${module.next})`)
  }
  const blockStandards = options.release || policy.standards_block === 'always'
  for (const standard of report.standards) {
    if (standard.cited_by.length === 0) continue
    if (standard.kind === 'editorial_template' || standard.verification === 'verified') continue
    const message = `${standard.framework_id}: cited by ${standard.cited_by.join(', ')} but has no verified_on and reviewer`
    if (blockStandards) fail(`standard:${standard.framework_id}`, message)
    else releaseBlockers.push(message)
  }
  for (const module of report.modules) for (const cite of module.cites) if (cite.verification === 'not_in_registry') failures.push(`${module.id}: cites ${cite.framework_id}, which is not in the framework registry`)
  const pending = report.modules.filter((module) => module.status === 'pending').map((module) => `${module.id} (${module.slice})`)
  const notes = report.modules.filter((module) => module.status === 'unregistered').map((module) => `${module.id} (${module.slice}) seems to have landed; add it to VISUAL_MODULES in visual/audit.ts so it is scored`)
  return { ok: failures.length === 0, mode, failures, release_blockers: releaseBlockers, overridden, pending, notes }
}
