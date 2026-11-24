/**
 * Golden examples for the visual renderers (Visual Blueprint P0).
 *
 * Renders the ILLUSTRATIVE / MOCK DATA business model canvas, Visual identity chapter and mascot atlas fixtures through the same print renderer Studio uses,
 * in en, fa and tr and in the internal and public editions, as self-contained HTML files. When Chrome is installed
 * it also prints each file to PDF (A3 landscape) and, when `pdftoppm` exists, renders PNG previews for visual QA.
 *
 *   npm run visual:golden -- [--out dist/visual-golden] [--no-pdf]
 *
 * It reads no brand repository and writes only into the output folder. Nothing here is a brand fact.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { illustrativeBusinessModelCanvas, illustrativeMascotAtlas, illustrativeVisualIdentity, VISUAL_LANGS, type IdentityFixtureVariant, type MascotFixtureVariant, type VisualLang } from '@brand-os/brand-core/visual'
import { html, trusted } from '../apps/studio/src/views/html.js'
import { printDocument } from '../apps/studio/src/views/visual.js'
import { identityBookDocument } from '../apps/studio/src/views/visual-print-book.js'
import { mascotPrintDocument } from '../apps/studio/src/views/visual-mascot.js'
import { strategyPrintDocument } from '../apps/studio/src/views/visual-strategy.js'
import { illustrativeSwotTows, illustrativeValueProposition } from '@brand-os/brand-core/visual'
import { renderBlock } from '../apps/studio/src/views/visual-registry.js'
import { planPrintDocument } from '../apps/studio/src/views/visual-plan.js'
import { illustrativeJourney, illustrativeOkr, illustrativeSostac, type PlanFixtureVariant } from '@brand-os/brand-core/visual'

const ROOT = path.resolve(import.meta.dirname, '..')
const STATIC = path.join(ROOT, 'apps', 'studio', 'static')

function arg(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index >= 0 ? (process.argv[index + 1] ?? null) : null
}

function findChrome(): string | null {
  const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  return candidates.filter((item): item is string => Boolean(item)).find((file) => fs.existsSync(file)) ?? null
}

function has(command: string): boolean {
  try {
    execFileSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** The stylesheet with font URLs pointing at the repository's own OFL font files, so the HTML works offline. */
export function inlineStyles(): string {
  const fonts = pathToFileURL(path.join(STATIC, 'fonts')).href
  return fs.readFileSync(path.join(STATIC, 'visual.css'), 'utf8').replaceAll('url("/static/fonts/', `url("${fonts}/`)
}

export function renderGolden(lang: VisualLang, edition: 'internal' | 'public'): string {
  const doc = illustrativeBusinessModelCanvas(lang, edition)
  return printDocument({ doc, lang, commit: null, head: html`<style>${trusted(inlineStyles())}</style>`, toolbar: html`` }).value
}

/** The book stylesheet (print engine V1.2), with the same offline font URLs. Kept apart so the canvas golden is unchanged. */
export function inlineBookStyles(): string {
  return `${inlineStyles()}\n${fs.readFileSync(path.join(STATIC, 'visual-book.css'), 'utf8')}`
}

/** The Visual identity chapter fixture as an A4 portrait book (V1.2). The mock master is a labelled frame, not a file. */
export function renderIdentityGolden(lang: VisualLang, edition: 'internal' | 'public', variant: IdentityFixtureVariant): string {
  const doc = illustrativeVisualIdentity(edition, variant)
  return identityBookDocument({ doc, lang, commit: null, head: html`<style>${trusted(inlineBookStyles())}</style>`, toolbar: html``, assetUrl: () => null }).html.value
}

/** The mascot atlas fixture (V3.4), A4 portrait. Mock artwork is a labelled frame, never a drawn character. */
export function renderMascotGolden(lang: VisualLang, edition: 'internal' | 'public', variant: MascotFixtureVariant): string {
  const doc = illustrativeMascotAtlas(edition, variant)
  return mascotPrintDocument({ doc, lang, commit: null, head: html`<style>${trusted(inlineStyles())}</style>`, toolbar: html``, assetUrl: () => null }, (block, ctx) => renderBlock(block, { ...ctx, idPrefix: 'p' })).value
}

/** SWOT / TOWS and the Value Proposition Canvas fixtures (V3.2), A4 portrait. */
export function renderStrategyGolden(lang: VisualLang, edition: 'internal' | 'public', kind: 'swot' | 'vpc'): string {
  const doc = kind === 'swot' ? illustrativeSwotTows(lang, edition) : illustrativeValueProposition(lang, edition)
  return strategyPrintDocument({ doc, lang, commit: null, head: html`<style>${trusted(inlineStyles())}</style>`, toolbar: html`` }, (block, ctx) => renderBlock(block, { ...ctx, idPrefix: 'p', assetUrl: () => null })).value
}

/** Visual V3.3 fixtures (A3 landscape): the journey swimlane, SOSTAC overview and OKR tree, full and empty. */
export const PLAN_GOLDEN_KINDS = ['journey', 'sostac', 'okr'] as const

export function renderPlanGolden(kind: (typeof PLAN_GOLDEN_KINDS)[number], lang: VisualLang, edition: 'internal' | 'public', variant: PlanFixtureVariant): string {
  const doc = kind === 'journey' ? illustrativeJourney(lang, edition, variant) : kind === 'sostac' ? illustrativeSostac(lang, edition, variant) : illustrativeOkr(lang, edition, variant)
  return planPrintDocument({ doc, lang, commit: null, head: html`<style>${trusted(inlineStyles())}</style>`, toolbar: html``, render: (block, ctx) => renderBlock(block, ctx) }).value
}

function print(chrome: string | null, png: boolean, out: string, name: string): void {
  if (!chrome) return
  const file = path.join(out, `${name}.html`)
  const pdf = path.join(out, `${name}.pdf`)
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--no-pdf-header-footer', '--allow-file-access-from-files', `--print-to-pdf=${pdf}`, pathToFileURL(file).href], { stdio: 'ignore', timeout: 120_000 })
  console.log(`wrote ${path.relative(ROOT, pdf)}`)
  if (png) execFileSync('pdftoppm', ['-png', '-r', '50', pdf, path.join(out, name)], { stdio: 'ignore' })
}

function main(): void {
  const out = path.resolve(arg('--out') ?? path.join(ROOT, 'dist', 'visual-golden'))
  fs.mkdirSync(out, { recursive: true })
  const chrome = process.argv.includes('--no-pdf') ? null : findChrome()
  const png = chrome && has('pdftoppm')
  for (const lang of VISUAL_LANGS) {
    for (const edition of ['internal', 'public'] as const) {
      const name = `bmc-illustrative.${edition}.${lang}`
      const file = path.join(out, `${name}.html`)
      fs.writeFileSync(file, renderGolden(lang, edition))
      console.log(`wrote ${path.relative(ROOT, file)}`)
      print(chrome, Boolean(png), out, name)
      for (const variant of ['complete', 'awaiting'] as const) {
        const identity = `identity-illustrative.${variant}.${edition}.${lang}`
        fs.writeFileSync(path.join(out, `${identity}.html`), renderIdentityGolden(lang, edition, variant))
        console.log(`wrote ${path.relative(ROOT, path.join(out, `${identity}.html`))}`)
        print(chrome, Boolean(png), out, identity)
      }
      for (const variant of ['partial', 'empty'] as const) {
        const mascot = `mascot-illustrative.${variant}.${edition}.${lang}`
        fs.writeFileSync(path.join(out, `${mascot}.html`), renderMascotGolden(lang, edition, variant))
        console.log(`wrote ${path.relative(ROOT, path.join(out, `${mascot}.html`))}`)
        print(chrome, Boolean(png), out, mascot)
      }
      for (const kind of ['swot', 'vpc'] as const) {
        const strategy = `${kind}-illustrative.${edition}.${lang}`
        fs.writeFileSync(path.join(out, `${strategy}.html`), renderStrategyGolden(lang, edition, kind))
        console.log(`wrote ${path.relative(ROOT, path.join(out, `${strategy}.html`))}`)
        print(chrome, Boolean(png), out, strategy)
      }
      // Visual V3.3: customer journey map, SOSTAC overview and OKR tree (A3 landscape).
      for (const kind of PLAN_GOLDEN_KINDS) {
        for (const variant of ['full', 'empty'] as const) {
          const plan = `${kind}-illustrative.${variant}.${edition}.${lang}`
          fs.writeFileSync(path.join(out, `${plan}.html`), renderPlanGolden(kind, lang, edition, variant))
          console.log(`wrote ${path.relative(ROOT, path.join(out, `${plan}.html`))}`)
          print(chrome, Boolean(png), out, plan)
        }
      }
    }
  }
  if (!chrome) console.log('No Chrome found (set CHROME_PATH) or --no-pdf given: HTML only. Open a file and use Print, A3 landscape.')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
