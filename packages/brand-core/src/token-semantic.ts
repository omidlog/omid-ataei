import { contrastRatio } from '@brand-os/design-tokens'
import type { ColorEntry } from './structured.js'

/**
 * BOS-17: owner colour roles → template semantic token ids.
 *
 * The owner's roles (`brand.color.roles`) can have any name (lime, dark-950, surface-bg-1 …). Each becomes a draft
 * token under its own namespace, `color.brand-role.<slug>`. Which role plays a template slot (primary, onPrimary,
 * canvas, text, danger …) is the owner's decision, recorded as the interview answer `brand.color.semantic_map`.
 *
 * - Only an approved `brand.color.semantic_map` answer maps a role to a template id. Nothing else does.
 * - Until it is answered, `suggestSemanticMap` proposes a mapping. A suggestion is printed for the owner and never
 *   applied: the template ids stay template examples.
 * - The suggestion is deterministic (role names, listed order, luminance and measured contrast). It never assigns a
 *   colour meaning (danger, success …) from a hue; those slots are suggested only for a role with that very name.
 */

export const SEMANTIC_MAP_QUESTION = 'brand.color.semantic_map'

/** Template slot → template token id. The keys are what the owner writes in the answer. */
export const SEMANTIC_COLOR_SLOTS = {
  primary: 'color.brand.primary',
  onPrimary: 'color.brand.onPrimary',
  secondary: 'color.brand.secondary',
  onSecondary: 'color.brand.onSecondary',
  accent: 'color.brand.accent',
  canvas: 'color.light.canvas',
  text: 'color.light.text',
  muted: 'color.light.muted',
  link: 'color.light.link',
  'dark-canvas': 'color.dark.canvas',
  'dark-text': 'color.dark.text',
  'dark-muted': 'color.dark.muted',
  'dark-link': 'color.dark.link',
  success: 'color.semantic.success',
  onSuccess: 'color.semantic.onSuccess',
  warning: 'color.semantic.warning',
  danger: 'color.semantic.danger',
  onDanger: 'color.semantic.onDanger',
  info: 'color.semantic.info',
} as const

export type SemanticSlot = keyof typeof SEMANTIC_COLOR_SLOTS
export const SEMANTIC_SLOTS = Object.keys(SEMANTIC_COLOR_SLOTS) as SemanticSlot[]

/** The namespace for every approved owner role. */
export const BRAND_ROLE_PREFIX = 'color.brand-role.'

/** Token id of an owner role. Roles are unique case-insensitively, so lower case keeps ids unique. */
export function brandRoleTokenId(role: string): string {
  return `${BRAND_ROLE_PREFIX}${role.toLowerCase()}`
}

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Every spelling of a slot the parser accepts: the slot key, the token id, and the id without `color.`. */
const SLOT_LOOKUP: Map<string, SemanticSlot> = (() => {
  const map = new Map<string, SemanticSlot>()
  for (const slot of SEMANTIC_SLOTS) {
    const id = SEMANTIC_COLOR_SLOTS[slot]
    for (const key of [slot, id, id.replace(/^color\./, '')]) map.set(norm(key), slot)
  }
  // Light theme slots are also accepted with their theme prefix (light-canvas, light.text).
  for (const slot of ['canvas', 'text', 'muted', 'link'] as const) map.set(norm(`light-${slot}`), slot)
  return map
})()

export function semanticSlotOf(key: string): SemanticSlot | null {
  return SLOT_LOOKUP.get(norm(key)) ?? null
}

export interface SemanticAssignment {
  slot: SemanticSlot
  token_id: string
  role: string
  hex: string
}

export interface ParsedSemanticMap {
  assignments: SemanticAssignment[]
  /** Slots the owner left on the template on purpose (`canvas = none`). */
  unmapped: SemanticSlot[]
  problems: string[]
}

export const SEMANTIC_MAP_FORMAT = 'slot = role, separated by ; or new lines. Slots: ' + SEMANTIC_SLOTS.join(', ') + '. A role is a name from brand.color.roles; none keeps the template example.'

/**
 * Parse an approved `brand.color.semantic_map` value against the approved roles. An entry with an unknown slot, an
 * unknown role or a repeated slot is reported and skipped; the rest is applied.
 */
export function parseSemanticMap(value: string, roles: ColorEntry[]): ParsedSemanticMap {
  const byRole = new Map(roles.map((color) => [color.role.toLowerCase(), color]))
  const out: ParsedSemanticMap = { assignments: [], unmapped: [], problems: [] }
  const seen = new Set<SemanticSlot>()
  const entries = value
    .split(/[;\n,،؛]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (entries.length === 0) out.problems.push('The answer has no entries.')
  for (const entry of entries) {
    const match = entry.match(/^(.+?)\s*(?:->|→|=|:)\s*(.+)$/)
    if (!match) {
      out.problems.push(`“${entry}” is not “slot = role”.`)
      continue
    }
    const slot = semanticSlotOf(match[1] ?? '')
    const roleName = (match[2] ?? '').trim().replace(/^["'“”]+|["'“”]+$/g, '')
    if (!slot) {
      out.problems.push(`“${(match[1] ?? '').trim()}” is not a template slot. Slots: ${SEMANTIC_SLOTS.join(', ')}.`)
      continue
    }
    if (seen.has(slot)) {
      out.problems.push(`${slot} is mapped twice. Only the first entry is used.`)
      continue
    }
    seen.add(slot)
    if (/^(none|unmapped|template|-)$/i.test(roleName)) {
      out.unmapped.push(slot)
      continue
    }
    const role = byRole.get(roleName.toLowerCase())
    if (!role) {
      out.problems.push(`${slot}: “${roleName}” is not an approved role in brand.color.roles.`)
      continue
    }
    out.assignments.push({ slot, token_id: SEMANTIC_COLOR_SLOTS[slot], role: role.role, hex: role.hex })
  }
  return out
}

// ---- suggestion (printed, never applied) -------------------------------------------------------------------

export interface SemanticSuggestion extends SemanticAssignment {
  /** same_name: the role is named like the slot. The others are heuristics over names, order and contrast. */
  basis: 'same_name' | 'name_and_luminance' | 'listed_order' | 'highest_contrast'
  reason: string
}

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((s) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

/** Max minus min channel: 0 for greys, near 1 for vivid colours. */
function chroma(hex: string): number {
  const channels = rgb(hex)
  return Math.max(...channels) - Math.min(...channels)
}

const SAME_NAME_ALIASES: Partial<Record<SemanticSlot, string[]>> = { danger: ['error'], warning: ['warn'], canvas: ['background', 'bg'], text: ['foreground', 'fg'] }

/**
 * A deterministic suggestion for the slots the owner has not mapped. It is a starting point for the owner's answer,
 * never a decision: the caller prints it and applies nothing.
 */
export function suggestSemanticMap(roles: ColorEntry[], skip: ReadonlySet<SemanticSlot> = new Set()): SemanticSuggestion[] {
  const out: SemanticSuggestion[] = []
  const taken = new Set<SemanticSlot>(skip)
  const add = (slot: SemanticSlot, color: ColorEntry | undefined, basis: SemanticSuggestion['basis'], reason: string): void => {
    if (!color || taken.has(slot)) return
    taken.add(slot)
    out.push({ slot, token_id: SEMANTIC_COLOR_SLOTS[slot], role: color.role, hex: color.hex, basis, reason })
  }
  const named = (color: ColorEntry) => norm(color.role)
  // 1. Same name: a role called "primary" or "onPrimary" (or an obvious alias such as "error" for danger).
  for (const slot of SEMANTIC_SLOTS) {
    const names = [norm(slot), ...(SAME_NAME_ALIASES[slot] ?? []).map(norm)]
    add(slot, roles.find((color) => names.includes(named(color))), 'same_name', `The role is named ${slot}.`)
  }
  const pick = (pattern: RegExp, score: (color: ColorEntry) => number) =>
    roles.filter((color) => pattern.test(color.role.toLowerCase())).sort((a, b) => score(b) - score(a) || a.role.localeCompare(b.role))[0]
  const hexOf = (slot: SemanticSlot) => out.find((item) => item.slot === slot)?.hex
  // 2. Light canvas: the lightest role whose name says background or surface.
  add('canvas', pick(/(^|[-_])(bg|background|canvas|surface|paper|base)/, (color) => luminance(color.hex)), 'name_and_luminance', 'Lightest role named as a background or surface.')
  // 3. Light text and muted text: by name, the highest contrast on the suggested canvas.
  const canvas = hexOf('canvas')
  const onCanvas = (color: ColorEntry) => (canvas ? contrastRatio(color.hex, canvas) : 1 - luminance(color.hex))
  add('text', pick(/(text|ink|title|heading|foreground|copy)/, onCanvas), 'name_and_luminance', 'Role named as text, with the highest contrast on the canvas.')
  add('muted', pick(/(muted|subtitle|subtle|caption|meta)/, onCanvas), 'name_and_luminance', 'Role named as secondary text, with the highest contrast on the canvas.')
  // 4. Dark canvas: the darkest role named dark, black or night; dark text: the highest-contrast light neutral on it.
  add('dark-canvas', pick(/(dark|black|night)/, (color) => -luminance(color.hex)), 'name_and_luminance', 'Darkest role named dark.')
  const darkCanvas = hexOf('dark-canvas')
  if (darkCanvas) {
    const light = roles.filter((color) => chroma(color.hex) < 0.12 && luminance(color.hex) > 0.6).sort((a, b) => contrastRatio(b.hex, darkCanvas) - contrastRatio(a.hex, darkCanvas) || a.role.localeCompare(b.role))[0]
    add('dark-text', light, 'highest_contrast', 'Light neutral with the highest contrast on the dark canvas.')
  }
  // 5. Brand colours: the vivid roles in the order the owner listed them.
  const vivid = roles.filter((color) => chroma(color.hex) >= 0.25 && !out.some((item) => item.role === color.role))
  const brandSlots: SemanticSlot[] = ['primary', 'secondary', 'accent'].filter((slot) => !taken.has(slot as SemanticSlot)) as SemanticSlot[]
  brandSlots.forEach((slot, index) => add(slot, vivid[index], 'listed_order', `Vivid role number ${index + 1} in the order you listed them.`))
  // 6. On-colours: the neutral role with the highest contrast on that brand colour.
  for (const [on, base] of [['onPrimary', 'primary'], ['onSecondary', 'secondary']] as const) {
    const baseHex = hexOf(base)
    if (!baseHex) continue
    const best = roles.filter((color) => chroma(color.hex) < 0.12).sort((a, b) => contrastRatio(b.hex, baseHex) - contrastRatio(a.hex, baseHex) || a.role.localeCompare(b.role))[0]
    if (best) add(on, best, 'highest_contrast', `Neutral role with the highest contrast on ${base} (${contrastRatio(best.hex, baseHex).toFixed(2)}:1).`)
  }
  return SEMANTIC_SLOTS.flatMap((slot) => out.filter((item) => item.slot === slot))
}

/** The suggestion as an answer the owner can review, edit and record: `primary = lime; onPrimary = dark-950`. */
export function semanticAnswerText(items: Array<{ slot: SemanticSlot; role: string }>): string {
  return items.map((item) => `${item.slot} = ${item.role}`).join('; ')
}
