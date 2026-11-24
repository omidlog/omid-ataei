import fs from 'node:fs'
import path from 'node:path'
import { applyInit, InterviewEngine } from '../engine.js'
import { writeStarterWorkspace } from '../materialize.js'
import { ensureApprovalSecret } from '../private-store.js'
import { buildBusinessModelCanvas } from './bmc.js'
import { ILLUSTRATIVE_BRAND } from './fixtures.js'
import { PILOT_BRANDS, type PilotBrand } from './fixtures-pilot.js'
import { buildBook } from './full-book.js'
import { buildVisualIdentity } from './identity.js'
import { buildMascotAtlas } from './mascot.js'
import { buildPublishingGallery } from './publishing.js'

/**
 * Visual V5.1 cross-brand pilot. Builds the two synthetic pilot brands (`fixtures-pilot.ts`) in fresh workspaces under
 * `base`, answers, approves and publishes their values through the normal engine, then builds every visual module for
 * both and checks that the modules are brand-agnostic: each document names its own brand, carries only its own values,
 * keeps the same structure for both brands, and the public editions carry no draft. Nothing is written outside
 * `base`, and the caller removes it.
 */
export interface PilotCheck {
  id: string
  status: 'pass' | 'fail'
  evidence: string
}

export interface PilotResult {
  brands: Array<{ name: string; slug: string; language: string; mascot: boolean; documents: number }>
  checks: PilotCheck[]
  ok: boolean
}

interface Built {
  brand: PilotBrand
  docs: Record<string, { brand_id: string; brand_name: string } & Record<string, unknown>>
  gallery: ReturnType<typeof buildPublishingGallery>
}

function setUp(base: string, brand: PilotBrand): InterviewEngine {
  const root = path.join(base, brand.slug)
  fs.mkdirSync(root, { recursive: true })
  writeStarterWorkspace(root)
  applyInit(root, { name: brand.name, slug: brand.slug, industry: brand.industry, language: brand.language, languages: ['en', 'fa', 'tr'], mascot: brand.mascot, gamification: false, publish: 'public' })
  const engine = new InterviewEngine(root)
  const proof = ensureApprovalSecret(root)
  for (const [id, value] of Object.entries({ ...brand.published, ...brand.drafts })) {
    const result = engine.answerQuestion(id, value)
    if (result.kind !== 'recorded') throw new Error(`pilot ${brand.slug}: ${id} not recorded: ${result.message}`)
  }
  const ids = Object.keys(brand.published)
  const approved = engine.approvals().approveBatch({ ids }, proof)
  if (approved.approved !== ids.length) throw new Error(`pilot ${brand.slug}: approved ${approved.approved} of ${ids.length}`)
  const published = engine.approvals().publish({ ids }, proof)
  // An internal-sensitivity fact is refused by design and stays internal; anything else must publish.
  const notPublished = published.results.filter((result) => result.outcome !== 'published' && !(result.outcome === 'refused' && /internal/.test(result.reason ?? '')))
  if (notPublished.length) throw new Error(`pilot ${brand.slug}: publish failed for ${notPublished.map((result) => result.id).join(', ')}`)
  return engine
}

function build(engine: InterviewEngine, brand: PilotBrand): Built {
  const docs: Built['docs'] = {}
  const editions = {} as Record<'bmc' | 'identity' | 'mascot', { internal: never; public: never }>
  for (const audience of ['internal', 'public'] as const) {
    const canvas = buildBusinessModelCanvas(engine, audience)
    const identity = buildVisualIdentity(engine, audience)
    const mascot = buildMascotAtlas(engine, audience)
    docs[`bmc.${audience}`] = canvas as never
    docs[`identity.${audience}`] = identity as never
    docs[`mascot.${audience}`] = mascot as never
    docs[`brand_book.${audience}`] = buildBook(engine, 'brand_book', audience, { identity, canvas }) as never
    ;(editions.bmc ??= {} as never)[audience] = canvas as never
    ;(editions.identity ??= {} as never)[audience] = identity as never
    ;(editions.mascot ??= {} as never)[audience] = mascot as never
  }
  docs['business_report.internal'] = buildBook(engine, 'business_report', 'internal', { canvas: docs['bmc.internal'] as never }) as never
  const gallery = buildPublishingGallery(engine, { bmc: { applies: true, ...editions.bmc }, identity: editions.identity, mascot: editions.mascot })
  return { brand, docs, gallery }
}

/** Structure only: block types, zone ids, chapter ids and kinds of chapter that do not depend on the brand's answers. */
function shape(doc: Record<string, unknown>): string {
  const blocks = Array.isArray(doc.blocks) ? (doc.blocks as Array<Record<string, unknown>>) : []
  const chapters = Array.isArray(doc.chapters) ? (doc.chapters as Array<Record<string, unknown>>) : []
  const zones = blocks.flatMap((block) => (Array.isArray(block.zones) ? (block.zones as Array<Record<string, unknown>>).map((zone) => String(zone.zone_id)) : []))
  return JSON.stringify({ kind: doc.document_kind ?? doc.kind, blocks: blocks.map((block) => block.type), zones, chapters: chapters.map((chapter) => chapter.chapter_id) })
}

/** Visual source files (not fixtures, not this pilot) must name no brand: neither pilot brand nor the golden example. */
function sourceNames(root: string): string[] {
  const dir = path.join(root, 'packages', 'brand-core', 'src', 'visual')
  if (!fs.existsSync(dir)) return ['packages/brand-core/src/visual not found']
  const names = [ILLUSTRATIVE_BRAND.name, ...PILOT_BRANDS.flatMap((brand) => [brand.name, brand.marker])]
  const hits: string[] = []
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.ts') || file.startsWith('fixtures') || file === 'pilot.ts' || file === 'audit.ts') continue
    const text = fs.readFileSync(path.join(dir, file), 'utf8')
    for (const name of names) if (text.includes(name)) hits.push(`${file}: ${name}`)
  }
  return hits
}

export function runCrossBrandPilot(base: string, options: { root?: string } = {}): PilotResult {
  const checks: PilotCheck[] = []
  const add = (id: string, ok: boolean, evidence: string) => checks.push({ id, status: ok ? 'pass' : 'fail', evidence })
  const built = PILOT_BRANDS.map((brand) => build(setUp(base, brand), brand))
  const [a, b] = built as [Built, Built]

  // The working name, or the approved trade name once it is approved (the engine keeps the config name in step).
  const named = (brand: PilotBrand, name: string) => name === brand.name || name === brand.published['business.identity.trade_name']
  const wrongBrand = built.flatMap(({ brand, docs }) => Object.entries(docs).filter(([, doc]) => doc.brand_id !== brand.slug || !named(brand, doc.brand_name)).map(([key, doc]) => `${brand.slug}/${key} (${doc.brand_id}, ${doc.brand_name})`))
  add('own_brand', wrongBrand.length === 0, wrongBrand.length ? `wrong brand on ${wrongBrand.join(', ')}` : `${built.reduce((n, x) => n + Object.keys(x.docs).length, 0)} documents each name their own brand`)

  const crossed = built.flatMap(({ brand, docs }) => {
    const other = built.find((x) => x.brand !== brand)!.brand.marker
    return Object.entries(docs).filter(([, doc]) => JSON.stringify(doc).includes(other)).map(([key]) => `${brand.slug}/${key} carries ${other}`)
  })
  add('no_crossover', crossed.length === 0, crossed.length ? crossed.join(', ') : 'no value of one brand appears in the other brand’s documents')

  const ownValues = built.filter(({ brand, docs }) => !JSON.stringify(docs['brand_book.internal']).includes(brand.published['business.identity.trade_name']!)).map(({ brand }) => brand.slug)
  add('own_values_drawn', ownValues.length === 0, ownValues.length ? `approved trade name missing in ${ownValues.join(', ')}` : 'each internal Brand Book draws its own approved trade name')

  const leaks = built.flatMap(({ brand, docs }) => Object.entries(docs).filter(([key, doc]) => key.endsWith('.public') && JSON.stringify(doc).includes(`${brand.marker}-DRAFT`)).map(([key]) => `${brand.slug}/${key}`))
  add('public_no_draft', leaks.length === 0, leaks.length ? `draft in ${leaks.join(', ')}` : 'no public edition carries a draft value')

  const brandShaped = Object.keys(a.docs).filter((key) => !key.startsWith('mascot.') && shape(a.docs[key]!) !== shape(b.docs[key]!))
  add('same_structure', brandShaped.length === 0, brandShaped.length ? `structure differs: ${brandShaped.join(', ')}` : 'canvas zones, block types and book chapters are identical for both brands')

  const mascotState = built.map(({ brand, docs }) => ({ brand, chapter: (docs['brand_book.internal']!.chapters as Array<Record<string, unknown>>).find((chapter) => chapter.chapter_id === 'mascot') }))
  const mascotOk = mascotState.every(({ brand, chapter }) => (brand.mascot ? chapter?.reason !== 'module_off' : chapter?.reason === 'module_off'))
  add('module_flags', mascotOk, mascotOk ? 'the mascot chapter follows each brand’s own module flag' : 'mascot chapter ignores a brand’s module flag')

  const grid = (x: Built) => x.gallery.cells.map((cell) => `${cell.document_type}/${cell.profile}`).join(',')
  add('same_gallery_grid', grid(a) === grid(b), `publishing gallery: ${a.gallery.cells.length} cells for each brand`)

  const names = sourceNames(options.root ?? process.cwd())
  add('no_brand_in_code', names.length === 0, names.length ? names.join(', ') : 'visual source files name no brand')

  return {
    brands: built.map(({ brand, docs }) => ({ name: brand.name, slug: brand.slug, language: brand.language, mascot: brand.mascot, documents: Object.keys(docs).length })),
    checks,
    ok: checks.every((check) => check.status === 'pass'),
  }
}
