import type { TaskLocale } from '../task-context/model.js'
import { POST_FORMAT, SOCIAL_BATCH_COUNT } from './model.js'
import { scriptDirection, type Angle, type BatchPlan, type Palette, type PostPlan } from './plan.js'
import { fontFamilyValue } from './type.js'

/**
 * The deterministic HTML/SVG post renderer. Pure: plan in, SVG text out. No model, no network, no clock, no random
 * number and no file access — the same plan always gives the same bytes.
 *
 * Output is a static SVG the existing checker accepts: no script, no `<image>`, no `<use>`, no `style`, no external
 * reference, no font file. Text stays live (editable) on purpose: this is a draft for a designer, and the checker's
 * `text` warning is reported, not hidden. A logo is embedded only as the approved file's own vector markup, after the
 * publication gate verified its path and checksum (see `run.ts`).
 */

const W = POST_FORMAT.width
const H = POST_FORMAT.height
const MARGIN = 96

export const POST_LABELS: Record<TaskLocale, Record<Angle | 'draft' | 'demo', string>> = {
  en: {
    promise: 'Our promise',
    differentiation: 'What sets us apart',
    value_proposition: 'Why it matters',
    tagline: 'In one line',
    audience: 'Made for',
    offer: 'The offer',
    purpose: 'Why we exist',
    pillar: 'Theme',
    draft: 'DRAFT · not approved · not for publication',
    demo: 'SYNTHETIC DEMO — NOT A REAL BRAND',
  },
  fa: {
    promise: 'قول ما',
    differentiation: 'چه چیزی ما را متفاوت می‌کند',
    value_proposition: 'چرا مهم است',
    tagline: 'در یک جمله',
    audience: 'برای',
    offer: 'پیشنهاد',
    purpose: 'چرا هستیم',
    pillar: 'محور',
    draft: 'پیش‌نویس · تأییدنشده · برای انتشار نیست',
    demo: 'نمونهٔ مصنوعی — برند واقعی نیست',
  },
  tr: {
    promise: 'Sözümüz',
    differentiation: 'Bizi farklı kılan',
    value_proposition: 'Neden önemli',
    tagline: 'Tek cümleyle',
    audience: 'Kimin için',
    offer: 'Teklif',
    purpose: 'Neden varız',
    pillar: 'Tema',
    draft: 'TASLAK · onaylanmadı · yayın için değil',
    demo: 'SENTETİK DEMO — GERÇEK BİR MARKA DEĞİL',
  },
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

export function localDigits(value: string, locale: TaskLocale): string {
  return locale === 'fa' ? value.replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]!) : value
}

export function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/**
 * Greedy word wrap by an estimated advance width (0.56 em per character). An estimate, labelled as one: the real
 * width depends on the viewer's font. Returns the lines and whether everything fitted in `maxLines`.
 */
export function wrapText(text: string, fontSize: number, width: number, maxLines: number): { lines: string[]; fits: boolean } {
  const perLine = Math.max(4, Math.floor(width / (fontSize * 0.56)))
  const words = text.split(/\s+/u).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if ([...next].length <= perLine || !current) current = next
    else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  const tooLong = lines.some((line) => [...line].length > perLine)
  return { lines, fits: lines.length <= maxLines && !tooLong }
}

const HEADLINE_LADDER = [96, 84, 72, 64, 56, 48] as const
const HEADLINE_MIN = 44

/**
 * Largest headline size that fits, starting at `start` (the approved headline size, or 96 by default) and stepping
 * down the fixed ladder; the smallest size is used (and flagged) when none fits. `reduced` says the start did not fit.
 */
export function fitHeadline(text: string, width: number, maxLines: number, start = 96): { size: number; lines: string[]; fits: boolean; reduced: boolean } {
  const sizes = [start, ...HEADLINE_LADDER.filter((size) => size < start)]
  for (const size of sizes) {
    const wrapped = wrapText(text, size, width, maxLines)
    if (wrapped.fits) return { size, ...wrapped, reduced: size !== start }
  }
  const size = Math.min(start, HEADLINE_MIN)
  return { size, ...wrapText(text, size, width, maxLines), reduced: size !== start }
}

export interface EmbeddedLogo {
  asset_id: string
  /** The approved file's viewBox and inner markup, already verified by the publication gate. */
  viewBox: string
  inner: string
}

/** Extracts viewBox and inner markup from an approved SVG. Null when it has no usable viewBox. */
export function logoMarkup(assetId: string, svg: string): EmbeddedLogo | null {
  const open = /<svg\b[^>]*>/i.exec(svg)
  const close = svg.lastIndexOf('</svg>')
  if (!open || close < 0) return null
  const viewBox = /\bviewBox\s*=\s*"([-\d.\s,]+)"/.exec(open[0])?.[1]?.trim()
  if (!viewBox || viewBox.split(/[\s,]+/).length !== 4) return null
  const inner = svg.slice(open.index + open[0].length, close).trim()
  return { asset_id: assetId, viewBox, inner }
}

function hexOf(palette: Palette, role: string): string {
  return palette.roles.find((entry) => entry.role === role)!.hex
}

/**
 * Wraps a right-to-left string in RIGHT-TO-LEFT EMBEDDING … POP DIRECTIONAL FORMATTING so neutral punctuation lands
 * where a reader expects. Decided per string by its own script, so an English label is never reordered. Display only.
 */
export function bidi(line: string): string {
  return scriptDirection(line) === 'rtl' ? `\u202B${line}\u202C` : line
}

function textBlock(lines: string[], x: number, y: number, size: number, lineHeight: number, attrs: string): string {
  return lines.map((line, i) => `<text x="${x}" y="${y + i * lineHeight}" font-size="${size}" ${attrs}>${escapeXml(bidi(line))}</text>`).join('\n    ')
}

export interface RenderedPost {
  svg: string
  /** Every foreground/background pair actually drawn, by role, for the contrast check. */
  pairs: Array<{ foreground: string; background: string; text: 'large' | 'body' }>
  /** `start` is the approved (or default) headline size; `size` what was drawn. */
  headline: { size: number; start: number; lines: number; fits: boolean; reduced: boolean }
  /** The brand-name sign-off: lines drawn and whether it fitted its box (estimated advance width). */
  signoff: { lines: number; fits: boolean }
}

export function renderPost(plan: BatchPlan, post: PostPlan, opts: { demo: boolean; logo: EmbeddedLogo | null }): RenderedPost {
  const { palette, locale, direction } = plan
  const labels = POST_LABELS[locale]
  const bg = hexOf(palette, post.colors.background)
  const fg = hexOf(palette, post.colors.foreground)
  const accent = hexOf(palette, post.colors.accent)
  const rtl = direction === 'rtl'
  const startX = rtl ? W - MARGIN : MARGIN
  // Renderer-independent RTL: no `direction` attribute (resvg and browsers anchor it differently). Instead each RTL
  // line is anchored at its right edge and wrapped in RLE…PDF, so neutral punctuation lands where a reader expects.
  type Anchor = 'start' | 'end' | 'middle'
  const { headline: headType, label: labelType, body: bodyType } = plan.type.slots
  const family = (stack: string[]): string => `font-family="${escapeXml(fontFamilyValue(stack))}"`
  const attrs = (stack: string[], anchor: Anchor = 'start'): string => `${family(stack)} text-anchor="${anchor}" fill="${fg}"`
  const lead: Anchor = rtl ? 'end' : 'start'
  const pairs: RenderedPost['pairs'] = [{ foreground: post.colors.foreground, background: post.colors.background, text: 'large' }]

  const body: string[] = []
  const deco: string[] = []
  const contentWidth = W - 2 * MARGIN
  let headlineTop = 420
  let headlineWidth = contentWidth
  switch (post.layout) {
    case 'statement':
      deco.push(`<rect x="${rtl ? W - MARGIN - 160 : MARGIN}" y="236" width="160" height="16" fill="${accent}"/>`)
      break
    case 'band':
      deco.push(`<rect x="0" y="0" width="${W}" height="260" fill="${accent}" opacity="0.18"/>`)
      deco.push(`<rect x="0" y="260" width="${W}" height="8" fill="${accent}"/>`)
      headlineTop = 470
      break
    case 'frame':
      deco.push(`<rect x="40" y="40" width="${W - 80}" height="${H - 120}" fill="none" stroke="${accent}" stroke-width="6"/>`)
      headlineTop = 460
      headlineWidth = contentWidth - 40
      break
    case 'split':
      deco.push(`<rect x="${rtl ? W - 24 : 0}" y="0" width="24" height="${H}" fill="${accent}"/>`)
      deco.push(`<circle cx="${rtl ? 0 : W}" cy="${H / 2 - 80}" r="170" fill="${accent}" opacity="0.22"/>`)
      headlineTop = 440
      break
    case 'quote':
      deco.push(`<path d="M${rtl ? W - MARGIN - 120 : MARGIN} 200 h120 v40 h-80 v80 h-40 z" fill="${accent}"/>`)
      headlineTop = 480
      break
  }

  const headline = fitHeadline(post.message, headlineWidth, 6, headType.size_px)
  const lineHeight = Math.round(headline.size * headType.line_height)
  body.push(`<text x="${startX}" y="${headlineTop - 110}" font-size="${labelType.size_px}" font-weight="${labelType.weight}" letter-spacing="${rtl ? 0 : 2}" ${attrs(labelType.family_stack, lead)} fill-opacity="0.85">${escapeXml(bidi(labels[post.angle]))}</text>`)
  body.push(textBlock(headline.lines, startX, headlineTop, headline.size, lineHeight, `font-weight="${headType.weight}" ${attrs(headType.family_stack, lead)}`))

  // Footer: brand name and the approved CTA, both from the pack. A missing one is simply absent.
  const footerY = H - 210
  deco.push(`<rect x="${MARGIN}" y="${footerY - 70}" width="${contentWidth}" height="2" fill="${fg}" opacity="0.35"/>`)
  let ctaLines = 0
  if (post.cta) {
    const cta = wrapText(post.cta, bodyType.size_px, contentWidth - 180, 2)
    ctaLines = cta.lines.length
    body.push(textBlock(cta.lines, startX, footerY, bodyType.size_px, Math.round(bodyType.size_px * bodyType.line_height), `font-weight="${bodyType.weight}" ${attrs(bodyType.family_stack, lead)}`))
    pairs.push({ foreground: post.colors.foreground, background: post.colors.background, text: 'body' })
  }
  let signoff = { lines: 0, fits: true }
  if (post.brand_name) {
    // The sign-off: body family and size, at the headline weight, wrapped clear of the counter. Two lines only when the
    // CTA left room; text that still does not fit is drawn in full and reported (`post.signoff_fit`), never cut.
    const size = Math.min(bodyType.size_px, 36)
    const step = Math.round(size * 1.25)
    const wrapped = wrapText(post.brand_name, size, contentWidth - 200, ctaLines >= 2 ? 1 : 2)
    signoff = { lines: wrapped.lines.length, fits: wrapped.fits }
    const top = H - 110 - step * (wrapped.lines.length - 1)
    body.push(textBlock(wrapped.lines, startX, top, size, step, `font-weight="${headType.weight}" ${attrs(bodyType.family_stack, lead)}`))
  }
  // Chrome (counter, draft stamp): label family at fixed sizes, so the stamp stays legible whatever the scale.
  const counter = localDigits(`${String(post.index).padStart(2, '0')}/${SOCIAL_BATCH_COUNT}`, locale)
  body.push(`<text x="${rtl ? MARGIN : W - MARGIN}" y="${H - 110}" font-size="28" ${attrs(labelType.family_stack, rtl ? 'start' : 'end')} fill-opacity="0.8">${escapeXml(counter)}</text>`)

  // The logo, when an approved and verified one exists, top corner opposite the reading start.
  const logo = opts.logo
    ? `<svg x="${rtl ? MARGIN : W - MARGIN - 120}" y="${MARGIN}" width="120" height="120" viewBox="${escapeXml(opts.logo.viewBox)}">${opts.logo.inner}</svg>`
    : ''

  // The draft stamp is part of the artwork, so a screenshot cannot lose it.
  const stamp = [labels.draft, ...(opts.demo ? [labels.demo] : [])].join(' · ')
  body.push(`<text x="${W / 2}" y="${H - 44}" font-size="22" ${attrs(labelType.family_stack, 'middle')} fill-opacity="0.7">${escapeXml(bidi(stamp))}</text>`)

  const title = `${labels[post.angle]} — ${post.post_id}`
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xml:lang="${locale}" role="img" aria-labelledby="t d">`,
    `  <title id="t">${escapeXml(title)}</title>`,
    `  <desc id="d">${escapeXml(post.message)}</desc>`,
    `  <rect width="${W}" height="${H}" fill="${bg}"/>`,
    `  <g>`,
    `    ${deco.join('\n    ')}`,
    `  </g>`,
    ...(logo ? [`  ${logo}`] : []),
    `  <g>`,
    `    ${body.join('\n    ')}`,
    `  </g>`,
    `</svg>`,
    '',
  ].join('\n')
  return { svg, pairs, headline: { size: headline.size, start: headType.size_px, lines: headline.lines.length, fits: headline.fits, reduced: headline.reduced }, signoff }
}
