import assert from 'node:assert/strict'
import { test } from 'node:test'
import { illustrativeBusinessModelCanvas, visualCatalog, type BusinessModelCanvasBlock } from '@brand-os/brand-core/visual'
import { renderBlock, rendererTypes } from '../apps/studio/src/views/visual-registry.js'
import { canvasView } from '../apps/studio/src/views/visual.js'
import { ghostChart, legend, sourceFootnote, stateChip } from '../apps/studio/src/views/visual-primitives.js'

/**
 * Visual Blueprint V1.1: the renderer registry dispatches by block type and the shared primitives draw states,
 * empty geometry and sources the same way everywhere. The canvas renders exactly as before the refactor.
 */
const cat = visualCatalog('en')

test('registry: every block type of a document has a renderer, and the canvas output is unchanged', () => {
  const doc = illustrativeBusinessModelCanvas('en', 'internal')
  for (const block of doc.blocks) assert.ok(rendererTypes().includes(block.type), block.type)
  const canvas = doc.blocks.find((block): block is BusinessModelCanvasBlock => block.type === 'business_model_canvas')!
  const viaRegistry = renderBlock(canvas, { cat, lang: 'en', mode: 'screen', doc, idPrefix: 'bmc', showNext: true, assetUrl: () => null }).value
  assert.equal(viaRegistry, canvasView(cat, canvas, { lang: 'en', mode: 'screen', showNext: true, idPrefix: 'bmc' }).value)
  assert.equal((viaRegistry.match(/class="vz-zone vz-zone--/g) ?? []).length, 9)
})

test('primitives: states are text plus icon, ghosts are designed, footnotes carry no field id', () => {
  assert.match(stateChip(cat, 'assumption').value, /vz-chip--draft.*<svg.*Draft, not approved/s)
  assert.equal((legend(cat, ['approved', 'missing']).value.match(/<li>/g) ?? []).length, 2)
  assert.equal(ghostChart({ title: 'T' }).value, '<div class="vz-gap"><span class="vz-gap-ghost" aria-hidden="true"></span><p class="vz-gap-title">T</p></div>', 'canvas gap markup kept')
  for (const variant of ['swatches', 'specimen', 'mark'] as const) assert.match(ghostChart({ title: '<b>', variant }).value, new RegExp(`vz-gap--${variant}.*&lt;b&gt;`, 's'))
  const foot = sourceFootnote(cat, 'en', { label: 'Color roles', state: 'approved', version: 2, approved_at: '2026-10-02T09:00:00Z' }).value
  assert.match(foot, /Source.*Color roles.*v2.*As of.*Approved/s)
  assert.doesNotMatch(foot, /brand\.color/, 'no technical id in the main view')
  assert.equal(sourceFootnote(cat, 'en', null).value, '')
})
