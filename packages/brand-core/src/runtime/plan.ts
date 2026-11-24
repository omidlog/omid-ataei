import { contrastRatio } from '@brand-os/design-tokens'
import { splitItems } from '../content-bridge/sources.js'
import { parseStructured } from '../structured.js'
import type { PackItem, TaskContextPack, TaskLocale } from '../task-context/model.js'
import { SOCIAL_BATCH_COUNT, type UsedSource } from './model.js'
import { typeSpecOf, type TypeSpec } from './type.js'

/**
 * The deterministic planner: one `social_batch` pack in, ten distinct post plans out.
 *
 * Every message on a post is an approved pack item, byte for byte. A set-valued fact (pillars) may be split into its
 * items with the Content Bridge's own `splitItems`, which keeps each item's text unchanged. Nothing is paraphrased,
 * shortened, translated or invented: if the pack holds fewer than ten approved messages, the plan says so and the
 * batch is blocked rather than padded. Labels around the copy ("Our promise", the counter, the draft stamp) are fixed
 * localized UI strings, not brand claims.
 */

export const LAYOUTS = ['statement', 'band', 'frame', 'split', 'quote'] as const
export type Layout = (typeof LAYOUTS)[number]

export type Angle = 'promise' | 'differentiation' | 'value_proposition' | 'tagline' | 'audience' | 'offer' | 'purpose' | 'pillar'

/** Where each angle's message comes from, in priority order. Keys and fact ids are task-context's own. */
const ANGLE_SOURCES: Array<{ angle: Angle; key: string; source_id?: string; split?: boolean }> = [
  { angle: 'promise', key: 'positioning', source_id: 'brand.strategy.promise' },
  { angle: 'value_proposition', key: 'value_proposition', source_id: 'business.offer.value_proposition' },
  { angle: 'audience', key: 'audience' },
  { angle: 'pillar', key: 'pillars', split: true },
  { angle: 'differentiation', key: 'positioning', source_id: 'brand.strategy.differentiation' },
  { angle: 'offer', key: 'offer' },
  { angle: 'purpose', key: 'purpose' },
  { angle: 'tagline', key: 'value_proposition', source_id: 'brand.verbal.tagline' },
]

export interface Palette {
  /** Approved color roles, from `brand.color.roles` in the pack. */
  roles: Array<{ role: string; hex: string }>
  source: UsedSource | null
}

export interface PostPlan {
  index: number
  post_id: string
  angle: Angle
  layout: Layout
  /** Approved copy, unchanged. */
  message: string
  message_source: UsedSource
  /** True when the message is one item of a set-valued fact, split with `splitItems`. */
  message_is_item: boolean
  brand_name: string | null
  brand_source: UsedSource | null
  cta: string | null
  cta_source: UsedSource | null
  /** Background/foreground role names chosen from the approved palette for this post. */
  colors: { background: string; foreground: string; accent: string }
}

export interface BatchPlan {
  locale: TaskLocale
  direction: 'ltr' | 'rtl'
  palette: Palette
  /** The approved type scale per text slot (`type.ts`), or the renderer defaults, labelled as such. */
  type: TypeSpec
  posts: PostPlan[]
  /** Approved messages found, before the count limit. Fewer than ten blocks the batch. */
  available_messages: number
  blockers: Array<{ code: string; detail: string }>
}

function approved(pack: TaskContextPack, key: string): PackItem[] {
  return Object.values(pack.sections)
    .flat()
    .filter((item) => item.key === key && item.state === 'approved' && typeof item.value === 'string' && item.source_id !== null)
}

function used(item: PackItem): UsedSource {
  return { key: item.key, source_id: item.source_id!, source_revision: item.source_revision }
}

/** The approved palette, or an empty one. No fallback colour is ever invented. */
export function paletteOf(pack: TaskContextPack): Palette {
  const item = approved(pack, 'color_roles')[0]
  if (!item) return { roles: [], source: null }
  const parsed = parseStructured('color', item.value)
  if (!parsed || parsed.type !== 'color') return { roles: [], source: used(item) }
  return { roles: parsed.colors.map((color) => ({ role: color.role, hex: color.hex.toUpperCase() })), source: used(item) }
}

/** Relative brightness via the design-tokens contrast function (contrast against black is monotone in luminance). */
const luminance = (hex: string): number => contrastRatio(hex, '#000000')

/**
 * Two background/foreground pairings from the approved roles: the darkest role on the lightest, and the reverse.
 * Role names are looked up first (`primary`, `onPrimary`, `surface`, `ink`, `accent`); otherwise luminance decides.
 */
function pairings(palette: Palette): Array<{ background: string; foreground: string; accent: string }> {
  const roles = palette.roles
  if (roles.length < 2) return []
  const byRole = (name: string): string | undefined => roles.find((entry) => entry.role.toLowerCase() === name.toLowerCase())?.role
  const sorted = [...roles].sort((a, b) => luminance(a.hex) - luminance(b.hex) || a.role.localeCompare(b.role))
  const dark = byRole('primary') ?? sorted[0]!.role
  const light = byRole('surface') ?? byRole('onPrimary') ?? sorted[sorted.length - 1]!.role
  const onDark = byRole('onPrimary') ?? sorted[sorted.length - 1]!.role
  const ink = byRole('ink') ?? sorted[0]!.role
  const accent = byRole('accent') ?? roles.find((entry) => ![dark, light, onDark, ink].includes(entry.role))?.role ?? onDark
  return [
    { background: dark, foreground: onDark, accent },
    { background: light, foreground: ink, accent: byRole('accent') ?? dark },
  ]
}

/** Direction of the first strong character (Unicode bidi classes R/AL approximated by script ranges). */
export function scriptDirection(text: string): 'ltr' | 'rtl' | null {
  for (const char of text) {
    if (/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u.test(char)) return 'rtl'
    if (/\p{L}/u.test(char)) return 'ltr'
  }
  return null
}

export function planSocialBatch(pack: TaskContextPack): BatchPlan {
  const locale = pack.task.locale
  const palette = paletteOf(pack)
  const blockers: BatchPlan['blockers'] = []

  const candidates: Array<{ angle: Angle; message: string; source: UsedSource; item: boolean }> = []
  const seen = new Set<string>()
  for (const spec of ANGLE_SOURCES) {
    for (const entry of approved(pack, spec.key).filter((candidate) => !spec.source_id || candidate.source_id === spec.source_id)) {
      const texts = spec.split ? splitItems(String(entry.value)) : [String(entry.value)]
      for (const text of texts) {
        const message = text.trim()
        if (!message || seen.has(message)) continue
        seen.add(message)
        candidates.push({ angle: spec.angle, message, source: used(entry), item: spec.split === true && texts.length > 1 })
      }
    }
  }

  // Direction follows the script of the approved copy, not the UI locale: Persian copy stays right-to-left even when
  // the labels are English. With no copy, the locale decides.
  const scripts = candidates.map((candidate) => scriptDirection(candidate.message)).filter((dir) => dir !== null)
  const rtlCount = scripts.filter((dir) => dir === 'rtl').length
  const direction: 'ltr' | 'rtl' = scripts.length === 0 ? (locale === 'fa' ? 'rtl' : 'ltr') : rtlCount * 2 >= scripts.length ? 'rtl' : 'ltr'

  const brand = approved(pack, 'brand_name')[0] ?? null
  const cta = approved(pack, 'cta')[0] ?? null
  const pairs = pairings(palette)
  if (pairs.length === 0) blockers.push({ code: 'palette_missing', detail: 'brand.color.roles is not approved in this pack, or has fewer than two roles. No colour is invented.' })
  if (candidates.length < SOCIAL_BATCH_COUNT) {
    blockers.push({ code: 'insufficient_approved_messages', detail: `${candidates.length} distinct approved messages in the pack; ${SOCIAL_BATCH_COUNT} are needed. Nothing is padded or repeated.` })
  }

  const posts: PostPlan[] = blockers.length > 0
    ? []
    : candidates.slice(0, SOCIAL_BATCH_COUNT).map((candidate, offset) => {
        const index = offset + 1
        return {
          index,
          post_id: `post-${String(index).padStart(2, '0')}`,
          angle: candidate.angle,
          layout: LAYOUTS[offset % LAYOUTS.length]!,
          message: candidate.message,
          message_source: candidate.source,
          message_is_item: candidate.item,
          brand_name: brand ? String(brand.value) : null,
          brand_source: brand ? used(brand) : null,
          cta: cta ? String(cta.value) : null,
          cta_source: cta ? used(cta) : null,
          // Alternate the two pairings in a 2-2-1 rhythm so neighbours differ and the set still reads as one.
          colors: pairs[Math.floor(offset / 2) % 2 === 0 ? offset % 2 : (offset + 1) % 2]!,
        }
      })
  return { locale, direction, palette, type: typeSpecOf(pack, direction), posts, available_messages: candidates.length, blockers }
}
