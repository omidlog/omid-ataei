import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { RuntimeError, type PostExport } from './model.js'

/**
 * Final export: live text → outlines (owner decision 3, runtime-pack slice). Drafts stay live, editable text; only
 * `--final` converts.
 *
 * Outlining needs the real font. No font file lives in this repository and none is embedded in an SVG (the SVG
 * checker allows neither `@font-face` nor `<style>`). So the owner supplies licensed TTF/OTF files at the CLI, and:
 * - each file is read locally, its family names (`name` table) and character coverage (`cmap`) parsed here, and its
 *   sha256 recorded in the manifest (by file name only, never by path);
 * - the first approved family of every type slot must be among the supplied families, and every character drawn must
 *   be covered by a supplied font — otherwise the export is refused, never silently substituted;
 * - resvg (local, already a dependency for previews) shapes the text with only those files (`loadSystemFonts: false`)
 *   and returns the same SVG with every `<text>` replaced by `<path>`. Same SVG + same font bytes ⇒ same bytes.
 *
 * Limits (documented in BRAND_RUNTIME.md): WOFF/WOFF2 are refused (resvg reads TTF/OTF/TTC only); a variable font is
 * drawn at its default instance, and a static font file at its own weight — an approved weight the files do not
 * contain is not synthesised. The license of the supplied file is the owner's responsibility (`brand.type.license`).
 */

export const MAX_FONT_BYTES = 40_000_000

export interface FontFile {
  file_name: string
  sha256: string
  families: string[]
  covers(codepoint: number): boolean
}

export interface Outliner {
  engine: { name: 'resvg-js'; version: string }
  fonts: FontFile[]
  /** Outlines one SVG. Throws `invalid_font` when a family is not supplied or a character is not covered. */
  outline(svg: string, families: string[]): string
  report(): PostExport
}

const u16 = (b: Buffer, o: number): number => b.readUInt16BE(o)
const u32 = (b: Buffer, o: number): number => b.readUInt32BE(o)

function tables(buf: Buffer, offset: number): Map<string, { offset: number; length: number }> {
  const out = new Map<string, { offset: number; length: number }>()
  const count = u16(buf, offset + 4)
  for (let i = 0; i < count; i++) {
    const rec = offset + 12 + i * 16
    out.set(buf.toString('latin1', rec, rec + 4), { offset: u32(buf, rec + 8), length: u32(buf, rec + 12) })
  }
  return out
}

function familyNames(buf: Buffer, table: { offset: number }): string[] {
  const base = table.offset
  const count = u16(buf, base + 2)
  const strings = base + u16(buf, base + 4)
  const names = new Set<string>()
  for (let i = 0; i < count; i++) {
    const rec = base + 6 + i * 12
    const [platform, , , nameId, length, offset] = [u16(buf, rec), u16(buf, rec + 2), u16(buf, rec + 4), u16(buf, rec + 6), u16(buf, rec + 8), u16(buf, rec + 10)]
    if (nameId !== 1 && nameId !== 16) continue
    const raw = buf.subarray(strings + offset, strings + offset + length)
    let text = ''
    if (platform === 3 || platform === 0) {
      for (let j = 0; j + 1 < raw.length; j += 2) text += String.fromCharCode(raw.readUInt16BE(j))
    } else if (platform === 1) text = raw.toString('latin1')
    if (text.trim()) names.add(text.trim())
  }
  return [...names]
}

/** A cmap lookup over format 12 (full Unicode) or format 4 (BMP) subtables. */
function cmapLookup(buf: Buffer, table: { offset: number }): (cp: number) => boolean {
  const base = table.offset
  const count = u16(buf, base + 2)
  const subtables: Array<{ format: number; offset: number }> = []
  for (let i = 0; i < count; i++) {
    const rec = base + 4 + i * 8
    const platform = u16(buf, rec)
    const encoding = u16(buf, rec + 2)
    if (platform === 3 && encoding !== 1 && encoding !== 10) continue
    const offset = base + u32(buf, rec + 4)
    subtables.push({ format: u16(buf, offset), offset })
  }
  const f12 = subtables.find((entry) => entry.format === 12)
  if (f12) {
    const groups = u32(buf, f12.offset + 12)
    const ranges: Array<[number, number, number]> = []
    for (let i = 0; i < groups; i++) {
      const g = f12.offset + 16 + i * 12
      ranges.push([u32(buf, g), u32(buf, g + 4), u32(buf, g + 8)])
    }
    return (cp) => ranges.some(([start, end, glyph]) => cp >= start && cp <= end && glyph + (cp - start) !== 0)
  }
  const f4 = subtables.find((entry) => entry.format === 4)
  if (!f4) return () => false
  const o = f4.offset
  const segX2 = u16(buf, o + 6)
  const ends = o + 14
  const starts = ends + segX2 + 2
  const deltas = starts + segX2
  const rangeOffsets = deltas + segX2
  return (cp) => {
    if (cp > 0xffff) return false
    for (let i = 0; i < segX2 / 2; i++) {
      const end = u16(buf, ends + i * 2)
      if (cp > end) continue
      const start = u16(buf, starts + i * 2)
      if (cp < start) return false
      const delta = buf.readInt16BE(deltas + i * 2)
      const rangeOffset = u16(buf, rangeOffsets + i * 2)
      if (rangeOffset === 0) return ((cp + delta) & 0xffff) !== 0
      const glyphAt = rangeOffsets + i * 2 + rangeOffset + (cp - start) * 2
      if (glyphAt + 2 > buf.length) return false
      const glyph = u16(buf, glyphAt)
      return glyph !== 0 && ((glyph + delta) & 0xffff) !== 0
    }
    return false
  }
}

/** Reads one owner-supplied font file. Refuses links, non-files, oversized files and WOFF/WOFF2. */
export function readFontFile(file: string): FontFile {
  const full = path.resolve(file)
  let stat: fs.Stats
  try {
    stat = fs.lstatSync(full)
  } catch {
    throw new RuntimeError('invalid_font', `Font file ${path.basename(full)} does not exist.`)
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new RuntimeError('invalid_font', 'A font path must be a regular file, not a link or a directory.')
  if (stat.size > MAX_FONT_BYTES || stat.size < 12) throw new RuntimeError('invalid_font', `${path.basename(full)} is not a usable font file size.`)
  const buf = fs.readFileSync(full)
  const magic = buf.toString('latin1', 0, 4)
  if (magic === 'wOFF' || magic === 'wOF2') throw new RuntimeError('invalid_font', `${path.basename(full)} is WOFF/WOFF2; final export needs the TTF or OTF file.`)
  const offsets = magic === 'ttcf' ? Array.from({ length: u32(buf, 8) }, (_, i) => u32(buf, 12 + i * 4)) : magic === 'OTTO' || magic === 'true' || u32(buf, 0) === 0x00010000 ? [0] : null
  if (!offsets) throw new RuntimeError('invalid_font', `${path.basename(full)} is not a TrueType/OpenType font.`)
  const families = new Set<string>()
  const lookups: Array<(cp: number) => boolean> = []
  try {
    for (const offset of offsets) {
      const dir = tables(buf, offset)
      const name = dir.get('name')
      const cmap = dir.get('cmap')
      if (name) for (const family of familyNames(buf, name)) families.add(family)
      if (cmap) lookups.push(cmapLookup(buf, cmap))
    }
  } catch {
    throw new RuntimeError('invalid_font', `${path.basename(full)} could not be parsed as a font.`)
  }
  if (families.size === 0 || lookups.length === 0) throw new RuntimeError('invalid_font', `${path.basename(full)} has no family name or no character map.`)
  return {
    file_name: path.basename(full),
    sha256: createHash('sha256').update(buf).digest('hex'),
    families: [...families].sort(),
    covers: (cp) => lookups.some((lookup) => lookup(cp)),
  }
}

/** Characters actually drawn: the content of every `<text>` element, entities decoded, bidi controls and spaces dropped. */
export function drawnCodepoints(svg: string): number[] {
  const out = new Set<number>()
  for (const match of svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)) {
    const text = match[1]!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    for (const char of text) {
      const cp = char.codePointAt(0)!
      if (/\s/u.test(char) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069)) continue
      out.add(cp)
    }
  }
  return [...out].sort((a, b) => a - b)
}

const hexCp = (cp: number): string => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`

/**
 * Loads resvg (local; no network) and the owner's font files. Async only for the module import; `outline` is sync.
 */
export async function createOutliner(files: string[]): Promise<Outliner> {
  if (files.length === 0) throw new RuntimeError('invalid_font', 'Final export needs at least one --font-file (TTF/OTF of the approved family).')
  const fonts = files.map(readFontFile)
  const paths = files.map((file) => path.resolve(file))
  const { Resvg } = await import('@resvg/resvg-js')
  const version = String((createRequire(import.meta.url)('@resvg/resvg-js/package.json') as { version: string }).version)
  const supplied = new Set(fonts.flatMap((font) => font.families.map((family) => family.toLowerCase())))
  return {
    engine: { name: 'resvg-js', version },
    fonts,
    outline(svg, families) {
      const absent = families.filter((family) => !supplied.has(family.toLowerCase()))
      if (absent.length > 0) throw new RuntimeError('invalid_font', `The approved family ${absent.join(', ')} is not in the supplied font files (${fonts.map((font) => font.families.join('/')).join('; ')}). Nothing is substituted.`)
      const missing = drawnCodepoints(svg).filter((cp) => !fonts.some((font) => font.covers(cp)))
      if (missing.length > 0) throw new RuntimeError('invalid_font', `The supplied fonts have no glyph for ${missing.slice(0, 12).map(hexCp).join(' ')}${missing.length > 12 ? ' …' : ''}. Nothing is substituted.`)
      const open = /^<svg\b[^>]*>/.exec(svg)![0]
      const title = /<title id="t">[^<]*<\/title>/.exec(svg)?.[0] ?? ''
      const desc = /<desc id="d">[^<]*<\/desc>/.exec(svg)?.[0] ?? ''
      const flat = new Resvg(svg, { font: { loadSystemFonts: false, fontFiles: paths, defaultFontFamily: families[0] ?? '' } }).toString()
      const inner = flat.replace(/^\s*<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/^\s*<defs\/>\s*/, '').trim()
      if (/<text\b/.test(inner)) throw new RuntimeError('invalid_font', 'The outliner left live text in the export.')
      return [open, ...(title ? [`  ${title}`] : []), ...(desc ? [`  ${desc}`] : []), `  ${inner.split('\n').map((line) => line.trim()).filter(Boolean).join('\n  ')}`, '</svg>', ''].join('\n')
    },
    report() {
      return { mode: 'final', text: 'outlined', outliner: { name: 'resvg-js', version }, fonts: fonts.map((font) => ({ file_name: font.file_name, sha256: font.sha256, families: font.families })) }
    },
  }
}
