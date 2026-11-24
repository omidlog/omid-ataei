import { ILLUSTRATIVE_BRAND } from './fixtures.js'
import { mascotAtlasDocument, type MascotAssetCandidate } from './mascot.js'
import type { VisualDocument } from './model.js'

/**
 * ILLUSTRATIVE / MOCK DATA. Golden examples for the mascot atlas and evolution sheet renderers.
 *
 * `partial` has a few fictional states with mock approved artwork (one file still tagged draft, one state in
 * review) and three of six stages drawn; `empty` has the catalog and stages but no approved artwork, so every plate
 * is the designed empty state. Never read from or written to a brand repository; every document has
 * `illustrative: true`, which the renderers stamp on every page. The mock assets are not files: renderers draw a
 * labelled "mock artwork" frame, never a character.
 */
export type MascotFixtureVariant = 'partial' | 'empty'

function mockAsset(id: string, extra: Partial<MascotAssetCandidate> = {}): MascotAssetCandidate {
  return {
    asset_id: `fixture.mascot.${id}`,
    name: `MOCK ${id} (fictional)`,
    version: '1.0.0',
    approved: true,
    published: true,
    tags: ['mascot'],
    example: false,
    preview_key: `fixture-mascot-${id}`,
    mime: 'image/svg+xml',
    width: 400,
    height: 400,
    ...extra,
  }
}

const NOTES = {
  do: ['Use beside a real success the user can see.', 'Keep at least the smallest listed surface size.'],
  dont: ['Do not use for a payment or an error.', 'Do not crop the silhouette.'],
}

function state(id: string, category: string, name: string, status: string, artwork: Array<Record<string, unknown>>, mvp = true): Record<string, unknown> {
  return { id: `mascot.${category}.${id}`, category, name, status, mvp, usage: `MOCK usage line for ${name}.`, ...NOTES, artwork }
}

function art(id: string, stage: string, status: string, angle = 'mascot.angle.front'): Record<string, unknown> {
  return { id: `art.${id}`, stage, asset_id: `fixture.mascot.${id}`, status, version: '1.0.0', angle }
}

const STAGES = ['Seed', 'Sprout', 'Explorer', 'Guide', 'Mentor', 'Keeper'].map((name, index) => ({ id: `fixture.stage.${index + 1}`, order: index + 1, name: `MOCK ${name}`, configuration: 'brand', status: index < 4 ? 'approved' : 'draft', summary: `MOCK summary of the ${name.toLowerCase()} stage.` }))

export function illustrativeMascotAtlas(audience: 'internal' | 'public' = 'internal', variant: MascotFixtureVariant = 'partial'): VisualDocument {
  const empty = variant === 'empty'
  const states = [
    state('joyful', 'emotion', 'Joyful', empty ? 'defined' : 'published', empty ? [] : [art('joyful', 'fixture.stage.1', 'published'), art('joyful-side', 'fixture.stage.2', 'published', 'mascot.angle.left-profile')]),
    state('curious', 'emotion', 'Curious', empty ? 'defined' : 'approved', empty ? [] : [art('curious', 'fixture.stage.2', 'approved')]),
    state('worried', 'emotion', 'Worried', empty ? 'defined' : 'reviewed', empty ? [] : [art('worried', 'any', 'reviewed')]),
    state('sad', 'emotion', 'Sad', 'defined', []),
    state('waving', 'action', 'Waving', empty ? 'defined' : 'published', empty ? [] : [art('waving', 'fixture.stage.3', 'published')]),
    state('thinking', 'action', 'Thinking', 'defined', [], false),
    state('loading', 'ui', 'Loading', 'defined', []),
    state('launch', 'seasonal', 'Launch', 'defined', [], false),
  ]
  const assets = [mockAsset('joyful'), mockAsset('joyful-side'), mockAsset('curious', { tags: ['mascot', 'draft'], published: false }), mockAsset('worried', { approved: false, published: false, preview_key: null, mime: null }), mockAsset('waving')]
  return mascotAtlasDocument({
    brand_id: ILLUSTRATIVE_BRAND.id,
    brand_name: ILLUSTRATIVE_BRAND.name,
    audience,
    illustrative: true,
    enabled: true,
    states,
    stages: STAGES,
    assets: empty ? [] : assets,
  })
}
