import { parseStructured, type StructuredType } from '../structured.js'
import { ILLUSTRATIVE_BRAND } from './fixtures.js'
import { IDENTITY_QUESTIONS, identityDocument, type LogoMasterCandidate } from './identity.js'
import type { DataState, VisualDocument, VisualEntry } from './model.js'

/**
 * ILLUSTRATIVE / MOCK DATA. Golden examples for the Brand Book "Visual identity" chapter renderers.
 *
 * `complete` draws every specimen from invented, fictional values; `awaiting` shows the designed "awaiting approved
 * asset" pages (a draft palette, no type roles, an approved size rule with only template example logos). Never read
 * from or written to a brand repository and never a default answer; every document has `illustrative: true`, which
 * the renderers stamp on every page. The mock master is not a file: renderers draw a labelled placeholder frame.
 */
export type IdentityFixtureVariant = 'complete' | 'awaiting'

const APPROVED_AT = '2026-10-02T09:00:00.000Z'

const VALUES = {
  color: 'primary #123A73; onPrimary #FFFFFF; surface #F7F5F2; onSurface #1B1F24; accent #D5FE00; onAccent #121212; muted #6B7480; danger #B42318',
  type: 'display: Rajdhani, Arial Narrow, sans-serif @ 48px/1.05; heading: Inter, system-ui, sans-serif @ 24px/1.25; body: Inter, system-ui, sans-serif @ 16px/1.55; caption: Inter, system-ui, sans-serif @ 12px/1.4',
  logo: 'min-size: 24px; clear-space: 0.5x; min-print: 10mm',
} as const

const LABELS = { color: 'Color roles', type: 'Type roles and scale', logo: 'Minimum size and clear space' } as const

function fixtureEntry(key: keyof typeof IDENTITY_QUESTIONS, state: DataState, version: number): { entry: VisualEntry; structured: ReturnType<typeof parseStructured> } {
  const id = IDENTITY_QUESTIONS[key]
  const approved = state === 'approved' || state === 'stale'
  const type: StructuredType = key === 'color' ? 'color' : key === 'type' ? 'font' : 'logo_spec'
  const value = state === 'missing' || state === 'withheld' ? null : VALUES[key]
  return {
    entry: {
      id,
      label: LABELS[key],
      state,
      value,
      sources: [`fixture:${id}`],
      version: approved ? version : null,
      approved_at: approved ? APPROVED_AT : null,
      review_due: null,
      note: state === 'assumption' ? 'Owner draft. Not approved.' : null,
      missing_reason: state === 'missing' ? 'unanswered' : null,
    },
    structured: value ? parseStructured(type, value) : null,
  }
}

const MOCK_MASTER: LogoMasterCandidate = {
  asset_id: 'fixture.logo.mock-master',
  name: 'MOCK master mark (fictional)',
  version: '1.0.0',
  approved: true,
  published: true,
  tags: ['logo', 'master'],
  example: false,
  preview_key: 'fixture-mock-master',
  mime: 'image/svg+xml',
  width: 240,
  height: 80,
}

const EXAMPLE_ONLY: LogoMasterCandidate = { ...MOCK_MASTER, asset_id: 'asset.logo.example-wordmark', name: 'EXAMPLE wordmark placeholder', approved: false, published: false, tags: ['logo', 'example', 'draft'], example: true }

export function illustrativeVisualIdentity(audience: 'internal' | 'public' = 'internal', variant: IdentityFixtureVariant = 'complete'): VisualDocument {
  const awaiting = variant === 'awaiting'
  const color = fixtureEntry('color', awaiting ? (audience === 'public' ? 'missing' : 'assumption') : 'approved', 3)
  if (awaiting && audience === 'public') color.entry.missing_reason = 'not_published'
  return identityDocument({
    brand_id: ILLUSTRATIVE_BRAND.id,
    brand_name: ILLUSTRATIVE_BRAND.name,
    audience,
    illustrative: true,
    color,
    type: fixtureEntry('type', awaiting ? 'missing' : 'approved', 2),
    logo: fixtureEntry('logo', 'approved', 1),
    masters: awaiting ? [EXAMPLE_ONLY] : [MOCK_MASTER],
    scripts: ['en', 'fa', 'tr'],
  })
}
