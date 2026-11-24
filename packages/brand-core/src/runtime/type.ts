import { parseStructured } from '../structured.js'
import type { PackItem, TaskContextPack } from '../task-context/model.js'
import type { UsedSource } from './model.js'

/**
 * The approved type scale on a post (owner decision 3, runtime-pack slice).
 *
 * Source: the `brand.type.scale` fact in the pack (`type_rules`), parsed with the brand core's own `font` structured
 * type — `role: Family, fallback… @ size px/line height`. Weights come only from hash-approved `fontWeight` design
 * tokens in the pack (`type.fontWeight.<role>`); the scale has no weight field, so without such a token the renderer's
 * default weight is used and labelled `renderer_default`. Nothing is invented: a role, family or size that is not
 * approved is reported with its source as `renderer_default`, never as a brand fact.
 *
 * Sizes: the scale is in CSS px for a screen. A 1080 px post is exported at 2× (Instagram shows it about 540 CSS px
 * wide), so canvas px = approved px × `CANVAS_SCALE`. The factor is fixed, declared in every manifest, and the same for
 * every brand.
 */

export const CANVAS_SCALE = 2

/** CSS generic families. When the approved stack ends in none of these, `sans-serif` is appended as the last resort. */
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji'])

/** The renderer's stacks when no scale is approved (unchanged from v1.0). */
export const DEFAULT_STACKS: Record<'ltr' | 'rtl', string[]> = {
  ltr: ['Inter', 'Noto Sans', 'Helvetica Neue', 'Arial', 'sans-serif'],
  rtl: ['Vazirmatn', 'Noto Sans Arabic', 'Tahoma', 'sans-serif'],
}

/** The post's text slots and which approved role names fill each, in preference order. */
export const SLOT_ROLES = {
  headline: ['display', 'headline', 'heading', 'h1', 'title', 'hero'],
  label: ['label', 'eyebrow', 'overline', 'caption', 'subtitle', 'small'],
  body: ['body', 'text', 'paragraph', 'base', 'copy'],
} as const
export type TypeSlot = keyof typeof SLOT_ROLES

/** Renderer defaults per slot (canvas px, line height, weight) — the v1.0 values. */
const DEFAULTS: Record<TypeSlot, { size: number; line_height: number; weight: number }> = {
  headline: { size: 96, line_height: 1.22, weight: 700 },
  label: { size: 34, line_height: 1.3, weight: 600 },
  body: { size: 36, line_height: 1.28, weight: 600 },
}

export interface SlotType {
  /** The approved role that filled this slot, or null for the renderer default. */
  role: string | null
  /** Approved family first, then approved fallbacks, then `sans-serif` only if no generic family was approved. */
  family_stack: string[]
  appended_generic: boolean
  /** Canvas px for the headline is the starting (largest) size; it may be reduced to fit (see the post manifest). */
  size_px: number
  line_height: number
  weight: number
  family_source: 'approved' | 'renderer_default'
  size_source: 'approved' | 'renderer_default'
  line_height_source: 'approved' | 'renderer_default'
  weight_source: 'approved_token' | 'renderer_default'
}

export interface TypeSpec {
  applied: boolean
  canvas_scale: number
  source: UsedSource | null
  weight_sources: UsedSource[]
  slots: Record<TypeSlot, SlotType>
}

function approvedItems(pack: TaskContextPack, key: string): PackItem[] {
  return Object.values(pack.sections).flat().filter((item) => item.key === key && item.state === 'approved' && item.source_id !== null)
}

/** Weight tokens (`type.fontWeight.<role>`) from hash-approved design tokens in the pack, by role. */
function weightTokens(pack: TaskContextPack): Map<string, { weight: number; source: UsedSource }> {
  const out = new Map<string, { weight: number; source: UsedSource }>()
  for (const item of approvedItems(pack, 'tokens')) {
    const token = (item.value ?? {}) as { id?: unknown; type?: unknown; value?: unknown }
    const match = typeof token.id === 'string' ? /^type\.fontWeight\.([A-Za-z][A-Za-z0-9_-]*)$/.exec(token.id) : null
    const weight = typeof token.value === 'number' ? token.value : Number(token.value)
    if (!match || token.type !== 'fontWeight' || !Number.isInteger(weight) || weight < 100 || weight > 900) continue
    out.set(match[1]!.toLowerCase(), { weight, source: { key: item.key, source_id: item.source_id!, source_revision: item.source_revision } })
  }
  return out
}

export function quoteFamily(family: string): string {
  return GENERIC.has(family.toLowerCase()) || /^[A-Za-z][A-Za-z0-9-]*$/.test(family) ? family : `'${family}'`
}

/** CSS `font-family` value for an SVG attribute. Family names were validated by the structured parser. */
export function fontFamilyValue(stack: string[]): string {
  return stack.map(quoteFamily).join(', ')
}

/** Resolves the type for each slot from the pack. Without an approved scale every slot is the renderer default. */
export function typeSpecOf(pack: TaskContextPack, direction: 'ltr' | 'rtl'): TypeSpec {
  const item = approvedItems(pack, 'type_rules').find((entry) => entry.source_id === 'brand.type.scale' && typeof entry.value === 'string')
  const parsed = item ? parseStructured('font', item.value) : null
  const fonts = parsed?.type === 'font' ? parsed.fonts : []
  const weights = weightTokens(pack)
  const usedWeights: UsedSource[] = []
  const byName = (names: readonly string[]) => names.map((name) => fonts.find((font) => font.role.toLowerCase() === name)).find(Boolean)

  const slot = (name: TypeSlot): SlotType => {
    const fallbackOrder: TypeSlot[] = name === 'body' ? ['body'] : [name, 'body']
    const font = fallbackOrder.map((candidate) => byName(SLOT_ROLES[candidate])).find(Boolean) ?? fonts[0]
    const base = DEFAULTS[name]
    if (!font) {
      return { role: null, family_stack: DEFAULT_STACKS[direction], appended_generic: false, size_px: base.size, line_height: base.line_height, weight: base.weight, family_source: 'renderer_default', size_source: 'renderer_default', line_height_source: 'renderer_default', weight_source: 'renderer_default' }
    }
    const approvedStack = [font.family, ...font.fallback]
    const hasGeneric = approvedStack.some((family) => GENERIC.has(family.toLowerCase()))
    const token = weights.get(font.role.toLowerCase())
    if (token && !usedWeights.some((entry) => entry.source_id === token.source.source_id)) usedWeights.push(token.source)
    return {
      role: font.role,
      family_stack: hasGeneric ? approvedStack : [...approvedStack, 'sans-serif'],
      appended_generic: !hasGeneric,
      size_px: font.size_px === null ? base.size : Math.round(font.size_px * CANVAS_SCALE),
      line_height: font.line_height ?? base.line_height,
      weight: token?.weight ?? base.weight,
      family_source: 'approved',
      size_source: font.size_px === null ? 'renderer_default' : 'approved',
      line_height_source: font.line_height === null ? 'renderer_default' : 'approved',
      weight_source: token ? 'approved_token' : 'renderer_default',
    }
  }

  const slots = { headline: slot('headline'), label: slot('label'), body: slot('body') }
  return {
    applied: fonts.length > 0,
    canvas_scale: CANVAS_SCALE,
    source: fonts.length > 0 && item ? { key: item.key, source_id: item.source_id!, source_revision: item.source_revision } : null,
    weight_sources: usedWeights.sort((a, b) => a.source_id.localeCompare(b.source_id)),
    slots,
  }
}
