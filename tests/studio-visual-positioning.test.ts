import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { SHARED_LANDSCAPE_PATH, type SharedLandscape } from '@brand-os/brand-core/competitive'
import { illustrativeCompetitorComparison, illustrativeLandscape, illustrativePositioning, visualCatalog, type PositioningMapBlock, type VisualDocument, type VisualLang } from '@brand-os/brand-core/visual'
import { rendererTypes, renderBlock } from '../apps/studio/src/views/visual-registry.js'
import { editOutsideStudio } from './helpers/edits.js'
import { Client, startStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

/**
 * Visual V2.3 in Studio: the positioning map on the existing competitor comparison page and its print view. Evidenced
 * points only, the own brand highlighted, unknowns in a margin, stale and conflicting marked, ids out of the main view,
 * every value escaped, en/fa/tr with RTL. Studio still reads only the one shared file.
 */
const SLUG = 'acme-position'
const DECOY = 'DECOY-POSITIONING-CANARY-7731'

function render(doc: VisualDocument, lang: VisualLang = 'en', mode: 'screen' | 'print' = 'screen'): string {
  const block = doc.blocks.find((b): b is PositioningMapBlock => b.type === 'positioning_map')!
  return renderBlock(block, { cat: visualCatalog(lang), lang, mode, doc, idPrefix: 't', showNext: mode === 'screen', assetUrl: () => null }).toString()
}

function shared(withAxes: boolean): SharedLandscape {
  const base: SharedLandscape = { ...illustrativeLandscape(), brand_slug: SLUG }
  if (withAxes) base.positioning = illustrativePositioning()
  const json = JSON.stringify(base).replace(/([a-z-]+)\.example/g, '$1-fictional.app')
  const doc = JSON.parse(json) as SharedLandscape
  doc.competitors = doc.competitors.map((c, i) => (i === 1 ? { ...c, display_name: 'Kestrel <i>x</i>' } : c))
  return doc
}

test('registry: the positioning map has a renderer', () => {
  assert.ok(rendererTypes().includes('positioning_map'))
})

test('renderer: evidenced points only, own brand diamond, stale ring, conflict range, unknowns margin', () => {
  const html = render(illustrativeCompetitorComparison('complete'))
  assert.match(html, /<svg class="vz-pos-svg"[^>]*dir="ltr"/)
  assert.equal((html.match(/class="vz-pos-own"/g) ?? []).length, 1, 'one own-brand marker')
  assert.equal((html.match(/class="vz-pos-dot"/g) ?? []).length, 2, 'two competitors plotted')
  assert.equal((html.match(/class="vz-pos-stale"/g) ?? []).length, 1)
  assert.equal((html.match(/class="vz-pos-range"/g) ?? []).length, 1)
  assert.match(html, /Not placed[\s\S]*Moraq Studio \(fictional\)/)
  assert.doesNotMatch(html.split('vz-pos-margin')[0]!, /Moraq/, 'an unknown is never on the plot or in the key')
  assert.match(html, /Self-paced/)
  assert.match(html, /Premium/)
  assert.match(html, /Lower-mid – Mid/, 'a conflict reads as a range')
  assert.match(html, /Source older than 90 days/)
  assert.match(html, /never chosen|none is chosen/)
  assert.doesNotMatch(html, /cmp_[0-9a-f-]{36}/, 'no competitor id on the plate')
  assert.equal(/\sstyle="/.test(html), false, 'no inline style')
  assert.equal(/\son[a-z]+="/.test(html), false, 'no inline handler')
  assert.equal((html.match(/class="vz-pos-point[^"]*" role="img"/g) ?? []).length, 3, "every plotted point is a labelled image")
})

test('renderer: designed empty state with the owner steps; withheld shows no steps', () => {
  const empty = render(illustrativeCompetitorComparison('no_axes'))
  assert.match(empty, /No positioning axes shared yet/)
  assert.match(empty, /class="vz-pos-ghost"/)
  assert.match(empty, /brand:competitive -- axes set/)
  assert.equal(empty.includes('vz-pos-svg'), false)
  const printEmpty = render(illustrativeCompetitorComparison('no_axes'), 'en', 'print')
  assert.equal(printEmpty.includes('axes set'), false, 'owner steps are never printed')
})

test('renderer: Persian is RTL text around the plot; Turkish is localized; owner words, not machine text', () => {
  const fa = render(illustrativeCompetitorComparison('complete'), 'fa')
  assert.match(fa, /نقشهٔ جایگاه‌یابی/)
  assert.match(fa, /میزان راهنمایی/)
  assert.match(fa, /معلم زنده/)
  assert.match(fa, /روی نقشه نیامده/)
  assert.match(fa, /[۰-۹]/, 'Persian digits in the key')
  const tr = render(illustrativeCompetitorComparison('complete'), 'tr')
  assert.match(tr, /Konumlandırma haritası/)
  assert.match(tr, /Rehberlik/)
  // An axis the owner wrote only in English is shown in English, never translated.
  const doc = illustrativeCompetitorComparison('complete')
  const block = doc.blocks.find((b): b is PositioningMapBlock => b.type === 'positioning_map')!
  block.axes!.x.label = { en: 'Only English', fa: null, tr: null }
  assert.match(render(doc, 'fa'), /Only English/)
})

interface Geometry {
  size: number
  centres: number[]
  cys: number[]
  ranges: Array<[number, number]>
  chartDir: string | undefined
  xDirection: string | undefined
  arrow: string | undefined
  poles: string[]
}

/** Reads the plot geometry and the x-axis row from rendered HTML. Points are emitted in the same order in every language. */
function geometry(html: string): Geometry {
  const size = Number(/viewBox="-2 -2 ([\d.]+)/.exec(html)![1]) - 4
  const points = html.match(/<g class="vz-pos-point[\s\S]*?<\/g>/g) ?? []
  const centre = (g: string): [number, number] => {
    const own = /rotate\(45 ([\d.-]+) ([\d.-]+)\)/.exec(g)
    const dot = /class="vz-pos-dot" cx="([\d.-]+)" cy="([\d.-]+)"/.exec(g)
    const m = (own ?? dot)!
    return [Number(m[1]), Number(m[2])]
  }
  const ranges = [...html.matchAll(/class="vz-pos-range" x="([\d.-]+)" y="[\d.-]+" width="([\d.-]+)"/g)].map((m) => [Number(m[1]), Number(m[1]) + Number(m[2])] as [number, number])
  const xaxis = /<div class="vz-pos-xaxis">([\s\S]*?)<\/div>/.exec(html)![1]!
  return {
    size,
    centres: points.map((g) => centre(g)[0]),
    cys: points.map((g) => centre(g)[1]),
    ranges,
    chartDir: /<div class="vz-pos-chart[^"]*" dir="(\w+)"/.exec(html)?.[1],
    xDirection: /data-x-direction="(\w+)"/.exec(html)?.[1],
    arrow: /<span class="vz-pos-arrow" aria-hidden="true">([←→])<\/span>/.exec(xaxis)?.[1],
    poles: [...xaxis.matchAll(/vz-pos-pole--(low|high)/g)].map((m) => m[1]!),
  }
}

test('renderer: fa mirrors the horizontal axis (low on the right); en and tr stay left to right; web and print alike', () => {
  for (const mode of ['screen', 'print'] as const) {
    const doc = illustrativeCompetitorComparison('complete')
    const block = doc.blocks.find((b): b is PositioningMapBlock => b.type === 'positioning_map')!
    const en = geometry(render(doc, 'en', mode))
    const tr = geometry(render(doc, 'tr', mode))
    const fa = geometry(render(doc, 'fa', mode))
    const where = `mode ${mode}`
    assert.equal(en.centres.length, 3, where)

    // en/tr: unchanged, low to high left to right.
    for (const g of [en, tr]) {
      assert.equal(g.chartDir, 'ltr', where)
      assert.equal(g.xDirection, 'ltr', where)
      assert.equal(g.arrow, '→', where)
      assert.deepEqual(g.poles, ['low', 'high'], `${where}: DOM order low, high`)
    }
    assert.deepEqual(tr.centres, en.centres, `${where}: tr geometry is en geometry`)
    assert.deepEqual(tr.ranges, en.ranges, where)
    // en: a higher x band is further right.
    const order = [...block.points.filter((p) => p.kind !== 'own_brand'), ...block.points.filter((p) => p.kind === 'own_brand')]
    const firstBand = (i: number) => block.bands.indexOf(order[i]!.x.bands[0]!)
    for (let i = 0; i < order.length; i++)
      for (let j = 0; j < order.length; j++)
        if (firstBand(i) < firstBand(j) && order[i]!.x.bands.length === 1 && order[j]!.x.bands.length === 1) assert.ok(en.centres[i]! < en.centres[j]!, `${where}: en low band is left of a higher band`)

    // fa: the chart grid is rtl (y column on the right, low pole on the right), the arrow points left, and every
    // point and range sits at the mirror image of its en position. Vertical positions are untouched.
    assert.equal(fa.chartDir, 'rtl', where)
    assert.equal(fa.xDirection, 'rtl', where)
    assert.equal(fa.arrow, '←', where)
    assert.deepEqual(fa.poles, ['low', 'high'], `${where}: same DOM order; rtl places low on the right`)
    assert.equal(fa.size, en.size, where)
    assert.deepEqual(fa.centres, en.centres.map((cx) => en.size - cx), `${where}: fa x = size - en x`)
    assert.deepEqual(fa.cys, en.cys, `${where}: y is not mirrored`)
    assert.deepEqual(fa.ranges, en.ranges.map(([x0, x1]) => [en.size - x1, en.size - x0]), `${where}: conflict ranges mirrored`)
    assert.ok(fa.centres.some((cx, i) => cx !== en.centres[i]), `${where}: the fixture actually moves a point`)
  }
})

test('renderer: fa mirroring keeps the legend, key and footnotes correct', () => {
  const doc = illustrativeCompetitorComparison('complete')
  const fa = render(doc, 'fa')
  assert.match(fa, /<svg class="vz-pos-svg"[^>]*dir="ltr"/, 'the SVG stays explicit geometry')
  assert.match(fa, /<div class="vz-pos-chart vz-pos-chart--mirrored" dir="rtl">/)
  assert.match(fa, /کادر خط‌چین یعنی بازه/, 'range note')
  assert.match(fa, /حلقهٔ خط‌چین/, 'stale note')
  assert.match(fa, /متوسط رو به پایین – متوسط/, 'a conflict still reads low to high in the key')
  // Footnote references are language-independent: the same targets in the same order.
  const refs = (html: string) => [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(refs(fa), refs(render(doc, 'en')))
  assert.equal(render(doc, 'en').includes('vz-pos-chart--mirrored'), false)
  assert.equal(render(doc, 'tr').includes('vz-pos-chart--mirrored'), false)
})

test('Studio: the positioning map on the comparison page and its print view, from the shared file only', async () => {
  const s = await startStudio()
  try {
    const owner = new Client(s.url)
    await owner.login()
    const csrf = await owner.csrf('/brands/new')
    await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Acme Position', slug: SLUG, profile: 'business', default_locale: 'en', locales: ['en', 'fa', 'tr'], owner: OWNER, repo: SLUG } })
    await s.studio.provisioning.settled()
    await s.studio.sync.settled()

    // 1. Nothing shared: the map's designed empty state sits on the same page; no new link anywhere.
    let page = await owner.page(`/brands/${SLUG}/market/competitors`)
    assert.equal(page.res.status, 200)
    assert.match(page.text, /Positioning map/)
    assert.match(page.text, /No positioning axes shared yet/)
    const canvas = await owner.page(`/brands/${SLUG}/strategy/business-model`)
    assert.equal((canvas.text.split('<main')[1]!.match(new RegExp(`href="/brands/${SLUG}/market/competitors"`, 'g')) ?? []).length, 1, 'still one link')

    // 2. The owner commits a shared file with axes, plus private records that must never reach Studio.
    editOutsideStudio(s, SLUG, (_engine, root) => {
      const write = (rel: string, data: string) => {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
        fs.writeFileSync(path.join(root, rel), data)
      }
      write(SHARED_LANDSCAPE_PATH, JSON.stringify(shared(true), null, 2))
      write('brand/.private/competitive/axes.json', JSON.stringify({ rationale: DECOY }))
      write('brand/competitive/shared/axes.json', JSON.stringify({ rationale: DECOY }))
    })
    await s.studio.sync.refresh(SLUG)
    page = await owner.page(`/brands/${SLUG}/market/competitors`)
    assert.equal(page.text.includes(DECOY), false, 'no private or extra file reaches Studio')
    assert.match(page.text, /class="vz-pos-svg"/)
    assert.match(page.text, /Kestrel &lt;i&gt;x&lt;\/i&gt;/, 'names are escaped')
    assert.equal(page.text.includes('<i>x</i>'), false)
    assert.match(page.text, /href="#cmp-map"/, 'the contents list links the map')
    assert.match(page.text, /Not placed/)
    const main = (page.text.split('<main')[1] ?? '').split('<details class="vz-details"')[0] ?? ''
    assert.doesNotMatch(main, /cmp_[0-9a-f-]{36}/, 'no competitor id in the main view')
    assert.match(page.text, /<details class="vz-details"[\s\S]*cmp_00000000-0000-4000-8000-00000000000c/, 'ids live in the details')
    assert.equal(/\sstyle="/.test(page.text), false)

    // 3. Print: opener, landscape matrix, prices, the map plate, sources.
    const print = await owner.page(`/brands/${SLUG}/market/competitors/print`)
    assert.equal(print.res.status, 200)
    assert.equal((print.text.match(/class="vz-page vz-page--book/g) ?? []).length, 5)
    assert.match(print.text, /vz-page--pos/)
    assert.equal(print.text.includes('axes set'), false)

    // 4. Persian and Turkish.
    await owner.get(`/brands/${SLUG}/market/competitors?lang=fa`)
    const fa = await owner.page(`/brands/${SLUG}/market/competitors`)
    assert.match(fa.text, /<html lang="fa" dir="rtl">/)
    assert.match(fa.text, /نقشهٔ جایگاه‌یابی/)
    await owner.get(`/brands/${SLUG}/market/competitors?lang=tr`)
    assert.match((await owner.page(`/brands/${SLUG}/market/competitors`)).text, /Konumlandırma haritası/)
    await owner.get(`/brands/${SLUG}/market/competitors?lang=en`)

    // 5. A tampered positioning section (a smuggled rationale) withholds the whole file.
    editOutsideStudio(s, SLUG, (_engine, root) => {
      const doc = shared(true) as SharedLandscape & { positioning: Record<string, unknown> }
      doc.positioning.rationale = DECOY
      fs.writeFileSync(path.join(root, SHARED_LANDSCAPE_PATH), JSON.stringify(doc))
    })
    await s.studio.sync.refresh(SLUG)
    page = await owner.page(`/brands/${SLUG}/market/competitors`)
    assert.equal(page.text.includes(DECOY), false)
    assert.equal(page.text.includes('vz-pos-svg'), false)
    assert.match(page.text, /The shared file was not shown/)
  } finally {
    await s.close()
  }
})

test('sync: a cache written before the positioning map existed is rebuilt at the same commit', async () => {
  const { harness, provisioned } = await import('./helpers/studio.js')
  const h = harness()
  const req = await provisioned(h)
  const file = path.join(h.dataDir, 'cache', req.slug, 'state.json')
  const state = JSON.parse(fs.readFileSync(file, 'utf8')) as { projection: { visual: { competitors: { blocks: Array<{ type: string }> } } } }
  state.projection.visual.competitors.blocks = state.projection.visual.competitors.blocks.filter((b) => b.type !== 'positioning_map')
  fs.writeFileSync(file, JSON.stringify(state))
  const before = h.sync.get(req.slug).projection!.visual?.competitors
  assert.equal(before?.blocks.some((b) => b.type === 'positioning_map'), false)
  const after = await h.sync.refresh(req.slug)
  assert.equal(after.projection!.visual?.competitors?.blocks.some((b) => b.type === 'positioning_map'), true)
})
