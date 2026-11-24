/**
 * Structured SVG checker. No dependencies, so Studio, the docs build and MCP can all use it.
 *
 * It parses the restricted XML subset that a safe SVG can use (no DOCTYPE, no entities other than
 * the five predefined ones and character references, no processing instructions after the XML
 * declaration). It then applies an allowlist:
 *
 * - elements: only static SVG graphics, gradients, clip paths, masks, patterns, markers and filter
 *   primitives (no feImage), resolved by namespace, so `<h:script xmlns:h="…xhtml">` is caught too;
 * - attributes: no event handlers, no `style`, no external references. `url(#id)` and `href="#id"`
 *   may point only at an element of the right kind inside the same file;
 * - CSS in `<style>` or `style=""` is never accepted, but it is reported as fixable when every rule is
 *   a simple selector with allowlisted properties and values, which `normalizeSvg` can inline.
 *
 * Every problem comes back with a code, a line and whether `brand:assets normalize` can fix it.
 * `inspectAssetForPublication` combines this with the older regex gate; both must pass.
 */

export const SVG_ISSUE_CODES = [
  'too-large',
  'parse',
  'not-svg',
  'doctype',
  'processing-instruction',
  'comment',
  'cdata',
  'script',
  'foreign-object',
  'image',
  'use',
  'link',
  'animation',
  'font',
  'element',
  'editor-data',
  'foreign-namespace',
  'namespace',
  'style-element',
  'style-attribute',
  'event-handler',
  'external-reference',
  'active-value',
  'missing-reference',
  'reference-target',
  'legacy-gate',
  'text',
] as const

export type SvgIssueCode = (typeof SVG_ISSUE_CODES)[number]

export interface SvgIssue {
  code: SvgIssueCode
  message: string
  /** 1-based line of the tag that caused it, or null when it concerns the whole file. */
  line: number | null
  /** True when `brand:assets normalize` can remove the problem without changing the drawing. */
  fixable: boolean
}

export interface SvgCheck {
  /** True only when there is no blocking issue. Warnings never block. */
  ok: boolean
  /** True when there are blocking issues and every one of them is fixable. */
  fixable: boolean
  issues: SvgIssue[]
  warnings: SvgIssue[]
}

export const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'
const XHTML_NS = 'http://www.w3.org/1999/xhtml'
const MAX_BYTES = 5 * 1024 * 1024
const MAX_DEPTH = 256
const MAX_ISSUES = 50

/** Same list as SVGO's `removeEditorsNSData`, so "fixable" means what the normalizer really removes. */
export const EDITOR_NAMESPACES = new Set([
  'http://creativecommons.org/ns#',
  'http://inkscape.sourceforge.net/DTD/sodipodi-0.dtd',
  'http://krita.org/namespaces/svg/krita',
  'http://ns.adobe.com/AdobeIllustrator/10.0/',
  'http://ns.adobe.com/AdobeSVGViewerExtensions/3.0/',
  'http://ns.adobe.com/Extensibility/1.0/',
  'http://ns.adobe.com/Flows/1.0/',
  'http://ns.adobe.com/GenericCustomNamespace/1.0/',
  'http://ns.adobe.com/Graphs/1.0/',
  'http://ns.adobe.com/ImageReplacement/1.0/',
  'http://ns.adobe.com/SaveForWeb/1.0/',
  'http://ns.adobe.com/Variables/1.0/',
  'http://ns.adobe.com/XPath/1.0/',
  'http://purl.org/dc/elements/1.1/',
  'http://schemas.microsoft.com/visio/2003/SVGExtensions/',
  'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd',
  'http://taptrix.com/vectorillustrator/svg_extensions',
  'http://www.bohemiancoding.com/sketch/ns',
  'http://www.figma.com/figma/ns',
  'http://www.inkscape.org/namespaces/inkscape',
  'http://www.serif.com/',
  'http://www.vector.evaxdesign.sk',
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  'https://boxy-svg.com',
])

const ALLOWED_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'title', 'desc', 'metadata', 'symbol', 'switch',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textPath',
  'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern', 'marker',
  'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix',
  'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood', 'feFuncA',
  'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feMerge', 'feMergeNode', 'feMorphology',
  'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence',
])

const BLOCKED_ELEMENTS: Record<string, { code: SvgIssueCode; message: string }> = {
  script: { code: 'script', message: '<script> is never allowed in a brand asset.' },
  foreignObject: { code: 'foreign-object', message: '<foreignObject> can embed HTML and is not allowed.' },
  image: { code: 'image', message: '<image> embeds another file. Vectorize it, or add the raster as its own asset.' },
  feImage: { code: 'image', message: '<feImage> embeds another file and is not allowed.' },
  use: { code: 'use', message: '<use> is not allowed. Expand the symbol or clone into plain shapes before export.' },
  a: { code: 'link', message: '<a> links are not allowed in a brand asset.' },
  animate: { code: 'animation', message: 'SVG animation is not allowed. Publish motion as a separate asset.' },
  animateMotion: { code: 'animation', message: 'SVG animation is not allowed. Publish motion as a separate asset.' },
  animateTransform: { code: 'animation', message: 'SVG animation is not allowed. Publish motion as a separate asset.' },
  animateColor: { code: 'animation', message: 'SVG animation is not allowed. Publish motion as a separate asset.' },
  set: { code: 'animation', message: 'SVG animation is not allowed. Publish motion as a separate asset.' },
  discard: { code: 'animation', message: 'SVG animation is not allowed. Publish motion as a separate asset.' },
  font: { code: 'font', message: 'Embedded fonts are not allowed. Convert text to outlines before export.' },
  'font-face': { code: 'font', message: 'Embedded fonts are not allowed. Convert text to outlines before export.' },
  glyph: { code: 'font', message: 'Embedded fonts are not allowed. Convert text to outlines before export.' },
  'missing-glyph': { code: 'font', message: 'Embedded fonts are not allowed. Convert text to outlines before export.' },
}

/** Attributes that may hold `url(#id)`, and the element kinds they may point at. */
const URL_ATTRIBUTES = new Set(['fill', 'stroke', 'clip-path', 'mask', 'filter', 'marker-start', 'marker-mid', 'marker-end'])
const URL_TARGETS = new Set(['linearGradient', 'radialGradient', 'clipPath', 'mask', 'pattern', 'filter', 'marker'])
/** Elements that may carry `href="#id"`, and what the reference must point at. */
const HREF_TARGETS: Record<string, Set<string>> = {
  linearGradient: new Set(['linearGradient', 'radialGradient']),
  radialGradient: new Set(['linearGradient', 'radialGradient']),
  pattern: new Set(['pattern']),
  textPath: new Set(['path']),
}

const LOCAL_REF = /^#([A-Za-z_][\w.-]*)$/
const URL_REF = /url\(\s*#([A-Za-z_][\w.-]*)\s*\)/g

interface Reference {
  id: string
  from: string
  kind: 'url' | 'href'
  line: number
}

class Collector {
  readonly issues: SvgIssue[] = []
  readonly warnings: SvgIssue[] = []
  private readonly seen = new Set<string>()

  add(code: SvgIssueCode, message: string, line: number | null, fixable: boolean): void {
    // One entry per code and line keeps a 300-path Illustrator file readable.
    const key = `${code}:${line ?? ''}:${fixable}`
    if (this.seen.has(key) || this.issues.length >= MAX_ISSUES) return
    this.seen.add(key)
    this.issues.push({ code, message, line, fixable })
  }

  warn(code: SvgIssueCode, message: string, line: number | null): void {
    if (this.warnings.some((item) => item.code === code)) return
    this.warnings.push({ code, message, line, fixable: false })
  }
}

interface OpenElement {
  name: string
  local: string
  ns: string | null
  scope: Map<string, string | null>
  inMetadata: boolean
  styleText: string[] | null
  line: number
}

/** Check SVG text. Never throws. */
export function checkSvg(text: string): SvgCheck {
  const out = new Collector()
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    out.add('too-large', `The file is larger than ${MAX_BYTES / 1024 / 1024} MB.`, null, false)
    return finish(out)
  }
  try {
    parse(text, out)
  } catch (error) {
    out.add('parse', error instanceof SvgParseError ? error.message : 'The file could not be read as XML.', error instanceof SvgParseError ? error.line : null, false)
  }
  return finish(out)
}

function finish(out: Collector): SvgCheck {
  const ok = out.issues.length === 0
  return { ok, fixable: !ok && out.issues.every((issue) => issue.fixable), issues: out.issues, warnings: out.warnings }
}

class SvgParseError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message)
  }
}

function parse(text: string, out: Collector): void {
  let pos = 0
  let line = 1
  const advance = (to: number): void => {
    for (let i = pos; i < to; i += 1) if (text.charCodeAt(i) === 10) line += 1
    pos = to
  }
  const fail = (message: string): never => {
    throw new SvgParseError(message, line)
  }

  if (text.charCodeAt(0) === 0xfeff) pos = 1
  const decl = /^\s*<\?xml\s[^?]*\?>/.exec(text.slice(pos))
  if (decl) advance(pos + decl[0].length)

  const stack: OpenElement[] = []
  const ids = new Map<string, string>()
  const references: Reference[] = []
  let rootSeen = false
  let rootClosed = false

  while (pos < text.length) {
    const lt = text.indexOf('<', pos)
    if (lt === -1) {
      handleText(text.slice(pos))
      advance(text.length)
      break
    }
    if (lt > pos) {
      handleText(text.slice(pos, lt))
      advance(lt)
    }
    const tagLine = line
    if (text.startsWith('<!--', pos)) {
      const end = text.indexOf('-->', pos + 4)
      if (end === -1) fail('A comment is not closed.')
      out.add('comment', 'Comments are not allowed (editors put generator notes there).', tagLine, true)
      advance(end + 3)
      continue
    }
    if (text.startsWith('<![CDATA[', pos)) {
      const end = text.indexOf(']]>', pos + 9)
      if (end === -1) fail('A CDATA section is not closed.')
      const parent = stack.at(-1)
      if (parent?.styleText) parent.styleText.push(text.slice(pos + 9, end))
      else out.add('cdata', 'CDATA sections are allowed only inside <style>.', tagLine, false)
      advance(end + 3)
      continue
    }
    if (text.startsWith('<!', pos)) {
      out.add('doctype', 'A DOCTYPE or entity declaration is not allowed. Export again without a DOCTYPE.', tagLine, false)
      return
    }
    if (text.startsWith('<?', pos)) {
      const end = text.indexOf('?>', pos + 2)
      if (end === -1) fail('A processing instruction is not closed.')
      out.add('processing-instruction', 'Processing instructions other than the XML declaration are not allowed.', tagLine, false)
      advance(end + 2)
      continue
    }
    if (text.startsWith('</', pos)) {
      const match = /^<\/([A-Za-z_][\w.:-]*)\s*>/.exec(text.slice(pos, pos + 300))
      if (!match) fail('A closing tag is malformed.')
      const open = stack.pop()
      if (!open || open.name !== match![1]) fail(`</${match![1]}> does not match the open element.`)
      closeElement(open!)
      advance(pos + match![0].length)
      if (stack.length === 0) rootClosed = true
      continue
    }
    // Start tag.
    const nameMatch = /^<([A-Za-z_][\w.:-]*)/.exec(text.slice(pos, pos + 300))
    if (!nameMatch) fail('A "<" does not start a valid tag.')
    if (rootClosed) fail('Content follows the closing </svg>.')
    let cursor = pos + nameMatch![0].length
    const attributes: Array<{ name: string; value: string }> = []
    let selfClosing = false
    for (;;) {
      const ws = /^\s*/.exec(text.slice(cursor, cursor + 10_000))![0].length
      cursor += ws
      if (text.startsWith('/>', cursor)) {
        selfClosing = true
        cursor += 2
        break
      }
      if (text.startsWith('>', cursor)) {
        cursor += 1
        break
      }
      if (ws === 0) fail('Attributes must be separated by white space.')
      const attr = /^([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/.exec(text.slice(cursor, cursor + 2_000_000))
      if (!attr) fail(`The <${nameMatch![1]}> tag has a malformed attribute.`)
      if (attributes.some((item) => item.name === attr![1])) fail(`The <${nameMatch![1]}> tag repeats the ${attr![1]} attribute.`)
      attributes.push({ name: attr![1]!, value: decodeEntities(attr![2] ?? attr![3] ?? '', fail) })
      cursor += attr![0].length
    }
    if (!rootSeen) rootSeen = true
    else if (stack.length === 0) fail('The file has more than one root element.')
    if (stack.length >= MAX_DEPTH) fail('Elements are nested too deeply.')
    const element = openElement(nameMatch![1]!, attributes, tagLine)
    advance(cursor)
    if (selfClosing) {
      closeElement(element)
      if (stack.length === 0) rootClosed = true
    } else stack.push(element)
  }
  if (!rootSeen) {
    out.add('not-svg', 'The file has no <svg> root element.', null, false)
    return
  }
  if (stack.length > 0) fail(`<${stack.at(-1)!.name}> is never closed.`)

  for (const ref of references) {
    const target = ids.get(ref.id)
    if (!target) {
      out.add('missing-reference', `${ref.kind === 'url' ? `url(#${ref.id})` : `href="#${ref.id}"`} points at an id that does not exist in this file.`, ref.line, false)
      continue
    }
    const allowed = ref.kind === 'url' ? URL_TARGETS : HREF_TARGETS[ref.from]
    if (!allowed?.has(target)) out.add('reference-target', `#${ref.id} is a <${target}>, which <${ref.from}> may not reference.`, ref.line, false)
  }

  function handleText(chunk: string): void {
    const parent = stack.at(-1)
    if (!parent) {
      if (chunk.trim()) fail('Text appears outside the <svg> element.')
      return
    }
    const decoded = decodeEntities(chunk, fail)
    if (parent.styleText) parent.styleText.push(decoded)
  }

  function openElement(name: string, attributes: Array<{ name: string; value: string }>, tagLine: number): OpenElement {
    const parent = stack.at(-1)
    const scope = new Map(parent?.scope ?? [['xml', XML_NS]])
    for (const { name: attr, value } of attributes) {
      if (attr === 'xmlns') {
        scope.set('', value)
        if (value !== SVG_NS) out.add('namespace', `xmlns="${value.slice(0, 80)}" is not the SVG namespace.`, tagLine, false)
      } else if (attr.startsWith('xmlns:')) {
        scope.set(attr.slice(6), value)
        if (value === XHTML_NS) out.add('namespace', `${attr} binds a prefix to the XHTML namespace.`, tagLine, false)
      }
    }
    const colon = name.indexOf(':')
    const prefix = colon === -1 ? '' : name.slice(0, colon)
    const local = colon === -1 ? name : name.slice(colon + 1)
    const ns = scope.get(prefix) ?? null
    if (prefix && !scope.has(prefix)) fail(`The prefix "${prefix}" in <${name}> is not declared.`)
    const inMetadata = parent ? parent.inMetadata || (parent.ns === SVG_NS && parent.local === 'metadata') : false
    let styleText: string[] | null = null

    if (!parent && !(ns === SVG_NS && local === 'svg')) out.add('not-svg', 'The root element must be <svg> in the SVG namespace.', tagLine, false)

    if (ns === SVG_NS) {
      const blocked = BLOCKED_ELEMENTS[local]
      if (blocked) out.add(blocked.code, blocked.message, tagLine, false)
      else if (local === 'style') {
        styleText = []
      } else if (!ALLOWED_ELEMENTS.has(local)) out.add('element', `<${name}> is not on the SVG allowlist.`, tagLine, inMetadata)
      if (local === 'text' || local === 'tspan' || local === 'textPath') {
        out.warn('text', 'The file contains live text. It renders with whatever font the viewer has; convert text to outlines for a faithful asset.', tagLine)
      }
    } else if (ns && EDITOR_NAMESPACES.has(ns)) {
      out.add('editor-data', `<${name}> is editor data.`, tagLine, true)
    } else {
      out.add('foreign-namespace', `<${name}> is not in the SVG namespace${ns ? ` (${ns.slice(0, 80)})` : ''}.`, tagLine, inMetadata && ns !== XHTML_NS)
    }

    for (const { name: attr, value } of attributes) {
      if (attr === 'xmlns' || attr.startsWith('xmlns:')) continue
      const aColon = attr.indexOf(':')
      const aPrefix = aColon === -1 ? '' : attr.slice(0, aColon)
      const aLocal = aColon === -1 ? attr : attr.slice(aColon + 1)
      if (aPrefix && !scope.has(aPrefix)) fail(`The prefix "${aPrefix}" in ${attr} is not declared.`)
      const aNs = aPrefix ? scope.get(aPrefix) : null
      // eslint-disable-next-line no-control-regex -- control characters are stripped on purpose, as browsers ignore them inside "java\tscript:"
      const lowered = value.toLowerCase().replace(/[\s\u0000-\u001f]+/g, '')
      if (/(?:javascript|vbscript|data|livescript):/.test(lowered) || lowered.includes('expression(') || lowered.includes('@import')) {
        out.add('active-value', `${attr} has a script, data or import value.`, tagLine, false)
        continue
      }
      if (aPrefix) {
        if (aNs === XML_NS) {
          if (aLocal === 'base') out.add('external-reference', 'xml:base is not allowed.', tagLine, false)
          continue
        }
        if (aNs === XLINK_NS) {
          if (aLocal === 'href') checkHref(attr, value)
          continue
        }
        if (aNs && EDITOR_NAMESPACES.has(aNs)) out.add('editor-data', `${attr} is editor data.`, tagLine, true)
        else out.add('foreign-namespace', `${attr} is in a namespace that is not allowed${aNs ? ` (${aNs.slice(0, 80)})` : ''}.`, tagLine, inMetadata && aNs !== XHTML_NS)
        continue
      }
      if (/^on/i.test(attr)) {
        out.add('event-handler', `${attr} is an event handler and is never allowed.`, tagLine, false)
        continue
      }
      if (attr === 'style') {
        const css = analyzeDeclarations(value)
        for (const id of css.refs) references.push({ id, from: local, kind: 'url', line: tagLine })
        out.add('style-attribute', css.problems.length ? `style="…" cannot be inlined: ${css.problems.join('; ')}.` : 'style="…" attributes are not allowed.', tagLine, css.problems.length === 0)
        continue
      }
      if (attr === 'href') {
        checkHref(attr, value)
        continue
      }
      if (attr === 'src') {
        out.add('external-reference', 'src is not allowed.', tagLine, false)
        continue
      }
      if (attr === 'id' && ns === SVG_NS) ids.set(value, local)
      if (/url\s*\(/i.test(value)) {
        const rest = value.replace(URL_REF, '')
        if (/url\s*\(/i.test(rest) || !URL_ATTRIBUTES.has(attr)) {
          out.add('external-reference', `${attr} uses url() other than a reference to an element in this file.`, tagLine, false)
          continue
        }
        for (const match of value.matchAll(URL_REF)) references.push({ id: match[1]!, from: local, kind: 'url', line: tagLine })
      }
    }
    return { name, local, ns, scope, inMetadata, styleText, line: tagLine }

    function checkHref(attr: string, value: string): void {
      if (ns === SVG_NS && local === 'use') return // already reported as <use>
      const ref = LOCAL_REF.exec(value.trim())
      if (!ref || ns !== SVG_NS || !HREF_TARGETS[local]) {
        out.add('external-reference', `${attr} on <${name}> is not allowed${ref ? '' : ' (only #id references inside the file are)'}.`, tagLine, false)
        return
      }
      references.push({ id: ref[1]!, from: local, kind: 'href', line: tagLine })
    }
  }

  function closeElement(element: OpenElement): void {
    if (!element.styleText) return
    const css = analyzeStylesheet(element.styleText.join(''))
    for (const id of css.refs) references.push({ id, from: 'style', kind: 'url', line: element.line })
    if (css.font) out.add('font', '@font-face is not allowed. Convert text to outlines before export.', element.line, false)
    out.add(
      'style-element',
      css.problems.length ? `<style> cannot be inlined: ${css.problems.slice(0, 3).join('; ')}.` : '<style> blocks are not allowed; its simple rules can be inlined.',
      element.line,
      css.problems.length === 0,
    )
  }
}

const PREDEFINED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

function decodeEntities(value: string, fail: (message: string) => never): string {
  if (!value.includes('&')) return value
  return value.replace(/&([^;\s&]{0,10});?/g, (whole, name: string) => {
    if (!whole.endsWith(';')) fail('A bare "&" must be written as &amp;.')
    if (PREDEFINED[name] !== undefined) return PREDEFINED[name]!
    const numeric = /^#(?:x([0-9a-fA-F]{1,6})|([0-9]{1,7}))$/.exec(name)
    if (!numeric) fail(`&${name}; is not a predefined entity.`)
    const code = numeric![1] ? Number.parseInt(numeric![1], 16) : Number(numeric![2])
    if (code > 0x10ffff || code === 0) fail(`&${name}; is not a valid character.`)
    return String.fromCodePoint(code)
  })
}

// ------------------------------------------------------------------------------------- CSS subset

interface CssReport {
  problems: string[]
  refs: string[]
  font: boolean
}

const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`
const NUMBER_VALUE = new RegExp(`^${NUMBER}(?:px|%)?$`, 'i')
const DASH_VALUE = new RegExp(`^(?:none|${NUMBER}(?:px|%)?(?:[\\s,]+${NUMBER}(?:px|%)?)*)$`, 'i')
const COLOR_VALUE = new RegExp(
  `^(?:none|currentcolor|transparent|#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|[a-z]{3,30}|rgba?\\(\\s*${NUMBER}%?\\s*,\\s*${NUMBER}%?\\s*,\\s*${NUMBER}%?\\s*(?:,\\s*${NUMBER}%?\\s*)?\\))$`,
  'i',
)
const URL_ONLY = /^(?:none|url\(\s*#[A-Za-z_][\w.-]*\s*\))$/
const PAINT_URL = /^url\(\s*#[A-Za-z_][\w.-]*\s*\)(?:\s+(.+))?$/

const PROPERTY_RULES: Record<string, (value: string) => boolean> = {
  fill: paint,
  stroke: paint,
  'stop-color': (value) => COLOR_VALUE.test(value),
  opacity: (value) => NUMBER_VALUE.test(value),
  'fill-opacity': (value) => NUMBER_VALUE.test(value),
  'stroke-opacity': (value) => NUMBER_VALUE.test(value),
  'stop-opacity': (value) => NUMBER_VALUE.test(value),
  'stroke-width': (value) => NUMBER_VALUE.test(value),
  'stroke-miterlimit': (value) => NUMBER_VALUE.test(value),
  'stroke-dashoffset': (value) => NUMBER_VALUE.test(value),
  'stroke-dasharray': (value) => DASH_VALUE.test(value),
  'fill-rule': (value) => /^(?:nonzero|evenodd)$/i.test(value),
  'clip-rule': (value) => /^(?:nonzero|evenodd)$/i.test(value),
  'stroke-linecap': (value) => /^(?:butt|round|square)$/i.test(value),
  'stroke-linejoin': (value) => /^(?:miter|round|bevel|miter-clip|arcs)$/i.test(value),
  'clip-path': (value) => URL_ONLY.test(value),
  mask: (value) => URL_ONLY.test(value),
  filter: (value) => URL_ONLY.test(value),
}

function paint(value: string): boolean {
  const url = PAINT_URL.exec(value)
  if (url) return url[1] === undefined || COLOR_VALUE.test(url[1])
  return COLOR_VALUE.test(value)
}

const SIMPLE_SELECTOR = /^(?:\.[A-Za-z_][\w-]*|#[A-Za-z_][\w-]*|[A-Za-z][\w-]*)$/

/** Declarations of a style="" attribute or a rule body. */
export function analyzeDeclarations(text: string): CssReport {
  const report: CssReport = { problems: [], refs: [], font: false }
  const body = text.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const raw of body.split(';')) {
    const declaration = raw.trim()
    if (!declaration) continue
    const colon = declaration.indexOf(':')
    if (colon <= 0) {
      report.problems.push(`"${declaration.slice(0, 40)}" is not a declaration`)
      continue
    }
    const property = declaration.slice(0, colon).trim().toLowerCase()
    const value = declaration.slice(colon + 1).trim()
    if (/!\s*important/i.test(value)) report.problems.push(`${property} uses !important`)
    else if (!PROPERTY_RULES[property]) report.problems.push(`property ${property.slice(0, 40)} is not on the allowlist`)
    else if (!PROPERTY_RULES[property]!(value)) report.problems.push(`${property}: ${value.slice(0, 40)} is not an allowed value`)
    else for (const match of value.matchAll(URL_REF)) report.refs.push(match[1]!)
  }
  return report
}

function analyzeStylesheet(text: string): CssReport {
  const report: CssReport = { problems: [], refs: [], font: false }
  const css = text.replace(/\/\*[\s\S]*?\*\//g, '')
  if (/@font-face/i.test(css)) report.font = true
  if (/@/.test(css)) report.problems.push('at-rules (@import, @media, @font-face) cannot be inlined')
  const leftover = css.replace(/([^{}@]+)\{([^{}]*)\}/g, (_whole, selectors: string, body: string) => {
    for (const selector of selectors.split(',')) {
      const trimmed = selector.trim()
      if (!SIMPLE_SELECTOR.test(trimmed)) report.problems.push(`selector "${trimmed.slice(0, 40)}" is not a single class, id or element`)
    }
    const declarations = analyzeDeclarations(body)
    report.problems.push(...declarations.problems)
    report.refs.push(...declarations.refs)
    return ''
  })
  if (leftover.trim() && !/@/.test(css)) report.problems.push('the stylesheet has text outside of rules')
  return report
}

// ------------------------------------------------------------------------------------- geometry

const GEOMETRY_ATTRIBUTES = new Set([
  'd', 'points', 'transform', 'viewBox', 'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry',
  'x1', 'y1', 'x2', 'y2', 'fx', 'fy', 'offset', 'gradientTransform', 'patternTransform', 'gradientUnits',
  'clipPathUnits', 'maskUnits', 'patternUnits', 'preserveAspectRatio',
])

/**
 * The geometry attributes of every element, in document order. The normalizer must leave this
 * byte-identical: it may move colours out of CSS, never change a shape.
 */
export function geometrySignature(text: string): string[] {
  const result: string[] = []
  const body = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<metadata[\s\S]*?<\/metadata>/g, '')
  for (const tag of body.matchAll(/<([A-Za-z][\w.-]*)(\s[^>]*?)?\/?>/g)) {
    const pairs: string[] = []
    for (const attr of (tag[2] ?? '').matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      if (GEOMETRY_ATTRIBUTES.has(attr[1]!)) pairs.push(`${attr[1]}=${attr[2] ?? attr[3]}`)
    }
    if (pairs.length) result.push(`${tag[1]} ${pairs.sort().join(' ')}`)
  }
  return result
}
