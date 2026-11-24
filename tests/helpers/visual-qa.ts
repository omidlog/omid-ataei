import zlib from 'node:zlib'

/**
 * Visual QA helpers (Visual Blueprint V1.3), with no npm dependency (Node's zlib only):
 *
 * - a minimal PNG codec (8-bit greyscale, RGB and RGBA, non-interlaced: what Chrome's screenshots use) and a
 *   tolerant pixel diff for the reference screenshots;
 * - a minimal PDF reader for Chrome's (Skia's) digital PDFs: page text through each font's ToUnicode map, and the
 *   fonts with whether their program is embedded.
 *
 * Neither is a general-purpose library. They read what Chrome writes, and a test that meets anything else fails
 * with a clear message instead of guessing.
 */

export interface Image {
  width: number
  height: number
  /** RGB, 3 bytes per pixel, row-major. */
  rgb: Uint8Array
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

export function decodePng(bytes: Buffer): Image {
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG file')
  let offset = 8
  let width = 0
  let height = 0
  let channels = 0
  const idat: Buffer[] = []
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString('latin1', offset + 4, offset + 8)
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const depth = data[8]
      const colour = data[9]
      const interlace = data[12]
      channels = colour === 0 ? 1 : colour === 2 ? 3 : colour === 4 ? 2 : colour === 6 ? 4 : 0
      if (depth !== 8 || !channels || interlace !== 0) throw new Error(`unsupported PNG (depth ${depth}, colour type ${colour}, interlace ${interlace})`)
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = new Uint8Array(stride * height)
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!
    const src = y * (stride + 1) + 1
    const row = y * stride
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? pixels[row + x - channels]! : 0
      const b = y > 0 ? pixels[row - stride + x]! : 0
      const c = y > 0 && x >= channels ? pixels[row - stride + x - channels]! : 0
      const value = raw[src + x]!
      pixels[row + x] = (filter === 0 ? value : filter === 1 ? value + a : filter === 2 ? value + b : filter === 3 ? value + ((a + b) >> 1) : value + paeth(a, b, c)) & 0xff
    }
  }
  const rgb = new Uint8Array(width * height * 3)
  for (let i = 0; i < width * height; i += 1) {
    if (channels >= 3) {
      // Alpha (Chrome screenshots are opaque) is composited over white, so a stray transparent pixel is deterministic.
      const alpha = channels === 4 ? pixels[i * 4 + 3]! / 255 : 1
      for (let k = 0; k < 3; k += 1) rgb[i * 3 + k] = Math.round(pixels[i * channels + k]! * alpha + 255 * (1 - alpha))
    } else {
      const alpha = channels === 2 ? pixels[i * 2 + 1]! / 255 : 1
      const grey = Math.round(pixels[i * channels]! * alpha + 255 * (1 - alpha))
      rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = grey
    }
  }
  return { width, height, rgb }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(data: Buffer): number {
  let c = 0xffffffff
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

/** RGB PNG with a per-row filter choice (minimum sum of absolute differences), so committed baselines stay small. */
export function encodePng(image: Image): Buffer {
  const { width, height, rgb } = image
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  const candidate = Buffer.alloc(stride)
  for (let y = 0; y < height; y += 1) {
    const row = y * stride
    let best = Number.POSITIVE_INFINITY
    for (let filter = 0; filter <= 4; filter += 1) {
      let score = 0
      for (let x = 0; x < stride; x += 1) {
        const a = x >= 3 ? rgb[row + x - 3]! : 0
        const b = y > 0 ? rgb[row - stride + x]! : 0
        const c = y > 0 && x >= 3 ? rgb[row - stride + x - 3]! : 0
        const value = rgb[row + x]!
        const out = (filter === 0 ? value : filter === 1 ? value - a : filter === 2 ? value - b : filter === 3 ? value - ((a + b) >> 1) : value - paeth(a, b, c)) & 0xff
        candidate[x] = out
        score += out < 128 ? out : 256 - out
      }
      if (score < best) {
        best = score
        raw[y * (stride + 1)] = filter
        candidate.copy(raw, y * (stride + 1) + 1)
      }
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

/** Box-filter downscale by an integer factor: it keeps layout and colour and averages away anti-aliasing noise. */
export function downscale(image: Image, factor: number): Image {
  const width = Math.floor(image.width / factor)
  const height = Math.floor(image.height / factor)
  const rgb = new Uint8Array(width * height * 3)
  const area = factor * factor
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let k = 0; k < 3; k += 1) {
        let sum = 0
        for (let dy = 0; dy < factor; dy += 1) for (let dx = 0; dx < factor; dx += 1) sum += image.rgb[((y * factor + dy) * image.width + x * factor + dx) * 3 + k]!
        rgb[(y * width + x) * 3 + k] = Math.round(sum / area)
      }
    }
  }
  return { width, height, rgb }
}

export interface DiffResult {
  /** Pixels whose largest channel difference exceeds the tolerance. */
  changed: number
  total: number
  ratio: number
  sameSize: boolean
  /** The baseline faded to grey with every changed pixel in red (the actual image's size when the sizes differ). */
  diff: Image
}

/**
 * Compares two images pixel by pixel. A pixel counts as changed when one channel differs by more than `tolerance`
 * (0–255). Images of different sizes are entirely changed.
 */
export function diffImages(baseline: Image, actual: Image, tolerance: number): DiffResult {
  const sameSize = baseline.width === actual.width && baseline.height === actual.height
  const total = actual.width * actual.height
  if (!sameSize) {
    const rgb = new Uint8Array(total * 3)
    for (let i = 0; i < total; i += 1) rgb.set([255, 0, 0], i * 3)
    return { changed: total, total, ratio: 1, sameSize, diff: { width: actual.width, height: actual.height, rgb } }
  }
  const rgb = new Uint8Array(total * 3)
  let changed = 0
  for (let i = 0; i < total; i += 1) {
    let delta = 0
    for (let k = 0; k < 3; k += 1) delta = Math.max(delta, Math.abs(baseline.rgb[i * 3 + k]! - actual.rgb[i * 3 + k]!))
    if (delta > tolerance) {
      changed += 1
      rgb.set([230, 0, 40], i * 3)
    } else {
      const grey = 0.299 * baseline.rgb[i * 3]! + 0.587 * baseline.rgb[i * 3 + 1]! + 0.114 * baseline.rgb[i * 3 + 2]!
      const faded = Math.round(255 - (255 - grey) * 0.25)
      rgb.set([faded, faded, faded], i * 3)
    }
  }
  return { changed, total, ratio: changed / total, sameSize, diff: { width: actual.width, height: actual.height, rgb } }
}

// ---------------------------------------------------------------------------------------------------------------
// PDF (Chrome / Skia output)
// ---------------------------------------------------------------------------------------------------------------

interface PdfObject {
  dict: string
  stream: Buffer | null
}

export interface PdfFont {
  /** BaseFont without the subset prefix, e.g. "Vazirmatn-Regular". */
  name: string
  subset: boolean
  /** The font program is in the file (FontFile, FontFile2 or FontFile3). */
  embedded: boolean
}

export interface PdfDocument {
  /** Media box in points, the text, and the names of the fonts the page draws with. */
  pages: Array<{ width: number; height: number; text: string; fonts: string[] }>
  fonts: PdfFont[]
}

function readObjects(pdf: Buffer): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>()
  const text = pdf.toString('latin1')
  const pattern = /(\d+) 0 obj\b/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    const start = match.index + match[0].length
    const objEnd = text.indexOf('endobj', start)
    if (objEnd < 0) break
    const streamAt = text.slice(start, objEnd).search(/\bstream\r?\n/)
    if (streamAt < 0) {
      objects.set(Number(match[1]), { dict: text.slice(start, objEnd), stream: null })
      pattern.lastIndex = objEnd
      continue
    }
    // A stream is skipped by its /Length, so binary data that happens to spell "endobj" or "0 obj" is never parsed.
    const dict = text.slice(start, start + streamAt)
    const dataStart = start + streamAt + text.slice(start + streamAt).match(/^stream\r?\n/)![0].length
    const direct = dict.match(/\/Length (\d+)(?! 0 R)\b/)
    const indirect = dict.match(/\/Length (\d+) 0 R/)
    const length = direct ? Number(direct[1]) : indirect ? Number(text.match(new RegExp(`(?:^|\\s)${indirect[1]} 0 obj\\s*(\\d+)\\s*endobj`))?.[1] ?? -1) : -1
    const dataEnd = length >= 0 ? dataStart + length : text.indexOf('endstream', dataStart)
    let data: Buffer = pdf.subarray(dataStart, dataEnd)
    if (/\/Filter\s*\/FlateDecode/.test(dict)) data = zlib.inflateSync(data)
    objects.set(Number(match[1]), { dict, stream: data })
    pattern.lastIndex = Math.max(dataEnd, start)
  }
  return objects
}

function refs(value: string): number[] {
  return [...value.matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1]))
}

/** A dictionary entry's value: either inline `<< … >>` (balanced) or the referenced object's dictionary. */
function entry(objects: Map<number, PdfObject>, dict: string, key: string): string | null {
  const at = dict.search(new RegExp(`/${key}\\b`))
  if (at < 0) return null
  const rest = dict.slice(at + key.length + 1).trimStart()
  if (rest.startsWith('<<')) {
    let depth = 0
    for (let i = 0; i < rest.length - 1; i += 1) {
      if (rest.startsWith('<<', i)) {
        depth += 1
        i += 1
      } else if (rest.startsWith('>>', i)) {
        depth -= 1
        i += 1
        if (depth === 0) return rest.slice(0, i + 1)
      }
    }
    return null
  }
  const ref = rest.match(/^(\d+) 0 R/)
  if (ref) return objects.get(Number(ref[1]))?.dict ?? null
  return rest.match(/^[^/>]*/)?.[0] ?? null
}

function utf16be(hex: string): string {
  let out = ''
  for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16))
  return out
}

/** A ToUnicode CMap: glyph code (hex) → text. */
function parseCmap(cmap: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) map.set(m[1]!.toUpperCase(), utf16be(m[2]!))
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])/g)) {
      const width = m[1]!.length
      const from = parseInt(m[1]!, 16)
      const to = parseInt(m[2]!, 16)
      const list = m[3]!.startsWith('[') ? [...m[3]!.matchAll(/<([0-9A-Fa-f]*)>/g)].map((x) => utf16be(x[1]!)) : null
      const first = list ? 0 : parseInt(m[3]!.slice(1, -1), 16)
      for (let code = from; code <= to; code += 1) {
        const key = code.toString(16).toUpperCase().padStart(width, '0')
        map.set(key, list ? (list[code - from] ?? '') : String.fromCodePoint(first + code - from))
      }
    }
  }
  return map
}

/** Literal string `( … )` with escapes, as bytes. */
function literalBytes(value: string): number[] {
  const out: number[] = []
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]!
    if (ch !== '\\') {
      out.push(ch.charCodeAt(0))
      continue
    }
    const next = value[++i] ?? ''
    if (/[0-7]/.test(next)) {
      let octal = next
      while (octal.length < 3 && /[0-7]/.test(value[i + 1] ?? '')) octal += value[++i]
      out.push(parseInt(octal, 8))
    } else out.push(({ n: 10, r: 13, t: 9, b: 8, f: 12 } as Record<string, number>)[next] ?? next.charCodeAt(0))
  }
  return out
}

/**
 * Reads Chrome's PDF: the media box and the text of every page (glyphs decoded through each font's ToUnicode map,
 * in content-stream order, one line per text object), and every font with its embedding state.
 */
export function readPdf(pdf: Buffer): PdfDocument {
  const objects = readObjects(pdf)
  const fonts = new Map<number, PdfFont>()
  const unicodeOf = new Map<number, { map: Map<string, string>; bytes: number; name: string }>()
  const fontInfo = (id: number): { map: Map<string, string>; bytes: number; name: string } => {
    const cached = unicodeOf.get(id)
    if (cached) return cached
    const font = objects.get(id)?.dict ?? ''
    const toUnicode = font.match(/\/ToUnicode (\d+) 0 R/)
    const cmap = toUnicode ? (objects.get(Number(toUnicode[1]))?.stream?.toString('latin1') ?? '') : ''
    const descendant = font.match(/\/DescendantFonts\s*\[\s*(\d+) 0 R/)
    const descriptorHost = descendant ? (objects.get(Number(descendant[1]))?.dict ?? '') : font
    const descriptor = descriptorHost.match(/\/FontDescriptor (\d+) 0 R/)
    const descriptorDict = descriptor ? (objects.get(Number(descriptor[1]))?.dict ?? '') : ''
    // Type 3 fonts (Skia's form for variable fonts) carry no BaseFont; the descriptor names them.
    const base = font.match(/\/BaseFont\s*\/([^\s/>]+)/)?.[1] ?? descriptorDict.match(/\/FontName\s*\/([^\s/>]+)/)?.[1] ?? ''
    const type3 = /\/Subtype\s*\/Type3/.test(font)
    const name = base.replace(/^[A-Z]{6}\+/, '')
    // Embedded: a font program (FontFile, FontFile2, FontFile3), or a Type 3 font, whose glyphs are drawn by
    // procedures inside the file.
    const embedded = type3 ? /\/CharProcs\s*(\d+ 0 R|<<)/.test(font) : /\/FontFile[23]?\s+\d+ 0 R/.test(descriptorDict)
    const info = { map: parseCmap(cmap), bytes: /\/Subtype\s*\/Type0/.test(font) ? 2 : 1, name }
    unicodeOf.set(id, info)
    if (name) fonts.set(id, { name, subset: /^[A-Z]{6}\+/.test(base), embedded })
    return info
  }

  const pages: PdfDocument['pages'] = []
  const pageIds = [...objects.entries()].filter(([, o]) => /\/Type\s*\/Page(?![s\w])/.test(o.dict)).map(([id]) => id)
  // Document order: walk the page tree from the root's /Pages, so pages come out as printed.
  const root = [...objects.values()].find((o) => /\/Type\s*\/Catalog/.test(o.dict))
  const ordered: number[] = []
  const walk = (id: number): void => {
    const node = objects.get(id)
    if (!node) return
    if (/\/Type\s*\/Pages/.test(node.dict)) for (const kid of refs(node.dict.match(/\/Kids\s*\[([^\]]*)\]/)?.[1] ?? '')) walk(kid)
    else ordered.push(id)
  }
  const top = root?.dict.match(/\/Pages (\d+) 0 R/)
  if (top) walk(Number(top[1]))
  for (const id of ordered.length ? ordered : pageIds) {
    const page = objects.get(id)!
    const box = page.dict.match(/\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*\]/)
    const resources = entry(objects, page.dict, 'Resources') ?? ''
    const fontDict = entry(objects, resources, 'Font') ?? ''
    const fontRefs = new Map([...fontDict.matchAll(/\/([^\s/<>]+)\s+(\d+) 0 R/g)].map((m) => [m[1]!, Number(m[2])]))
    const contents = page.dict.match(/\/Contents\s*(\[[^\]]*\]|\d+ 0 R)/)?.[1] ?? ''
    const stream = refs(contents).map((ref) => objects.get(ref)?.stream?.toString('latin1') ?? '').join('\n')
    let text = ''
    let current: { map: Map<string, string>; bytes: number; name: string } | null = null
    const used = new Set<string>()
    const show = (bytes: number[]): void => {
      if (!current) return
      if (bytes.length) used.add(current.name)
      for (let i = 0; i + current.bytes <= bytes.length; i += current.bytes) {
        const code = bytes.slice(i, i + current.bytes).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join('')
        text += current.map.get(code) ?? ''
      }
    }
    const hexBytes = (hex: string): number[] => {
      const clean = hex.replace(/\s+/g, '')
      return Array.from({ length: Math.floor(clean.length / 2) }, (_, i) => parseInt(clean.slice(i * 2, i * 2 + 2), 16))
    }
    const token = /\/([^\s/[\]()<>]+)\s+[\d.]+\s+Tf|\[((?:<[0-9A-Fa-f\s]*>|\((?:\\.|[^\\)])*\)|[^\]])*)\]\s*TJ|<([0-9A-Fa-f\s]*)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj|\bET\b/g
    for (const m of stream.matchAll(token)) {
      if (m[1] !== undefined) {
        const ref = fontRefs.get(m[1])
        current = ref === undefined ? null : fontInfo(ref)
      } else if (m[2] !== undefined) {
        for (const part of m[2].matchAll(/<([0-9A-Fa-f\s]*)>|\(((?:\\.|[^\\)])*)\)/g)) show(part[1] !== undefined ? hexBytes(part[1]) : literalBytes(part[2]!))
      } else if (m[3] !== undefined) show(hexBytes(m[3]))
      else if (m[4] !== undefined) show(literalBytes(m[4]))
      else text += '\n'
    }
    pages.push({ width: box ? Number(box[1]) : 0, height: box ? Number(box[2]) : 0, text, fonts: [...used].sort() })
  }
  // Every font dictionary in the file is listed, drawn with or not (a descendant CIDFont is part of its Type 0 font).
  for (const [id, o] of objects) if (/\/Type\s*\/Font\b/.test(o.dict) && !/\/CIDFontType/.test(o.dict)) fontInfo(id)
  return { pages, fonts: [...fonts.values()] }
}

/** Text without whitespace, for presence checks that do not depend on how Chrome split the glyph runs. */
export function squash(value: string): string {
  return value.normalize('NFC').replace(/[\s‌‏‎⁦-⁩]+/g, '')
}
