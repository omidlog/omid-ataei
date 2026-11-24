/**
 * Auto-escaping HTML templates. Every interpolated value is escaped unless it is already `SafeHtml`
 * produced by this module. Repository content (names, facts, commit titles, PR titles) is therefore
 * always rendered as text, never as markup.
 */
export class SafeHtml {
  constructor(readonly value: string) {}

  toString(): string {
    return this.value
  }
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"'`]/g, (char) => ESCAPES[char] ?? char)
}

type Value = SafeHtml | string | number | boolean | null | undefined | Value[]

function render(value: Value): string {
  if (value === null || value === undefined || value === false) return ''
  if (Array.isArray(value)) return value.map(render).join('')
  if (value instanceof SafeHtml) return value.value
  return escapeHtml(value)
}

/* ---------------------------------------------------------------- bidi (BOS-21) */

/** Hebrew, Arabic (Persian included), Syriac, Thaana, NKo and their presentation forms. */
const RTL_CHAR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/
const LATIN_CHAR = /[A-Za-z\u00C0-\u024F]/
/** Technical Latin tokens that say nothing about the sentence's language: URLs, e-mail addresses, file names, paths. */
const TECHNICAL = /\b(?:https?:\/\/\S+|[\w.+-]+@[\w-]+\.[\w.-]+|[\w./-]*[\w-]\.[A-Za-z0-9]{1,5}\b|[\w-]+(?:\/[\w.-]+)+)/g
/** An inline left-to-right run inside right-to-left text: a URL, or Latin words (file names, product names). */
const LTR_RUN = /https?:\/\/[^\s<>"'()[\]{}\u060C\u061B]+|[A-Za-z0-9\u00C0-\u024F][\w\u00C0-\u024F.@/+#&%=~:-]*(?:[ \t]+[A-Za-z0-9\u00C0-\u024F][\w\u00C0-\u024F.@/+#&%=~:-]*)*/g
/** An inline right-to-left run inside left-to-right text. */
const RTL_RUN = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF](?:[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\s]|\u200C|\u200D)*/g

/**
 * The paragraph direction of owner-written text that mixes right-to-left and Latin script, or null when it does not
 * mix them (then `dir="auto"` already picks the right direction). The majority of words decides, not the first
 * letter, so `Wordmark تیره (logo.svg) برای …` reads right to left. URLs, file names and paths are not counted.
 */
export function mixedDirection(text: string): 'rtl' | 'ltr' | null {
  if (!RTL_CHAR.test(text) || !LATIN_CHAR.test(text)) return null
  let rtl = 0
  let ltr = 0
  for (const word of text.replace(TECHNICAL, ' ').split(/\s+/)) {
    if (RTL_CHAR.test(word)) rtl += 1
    else if (LATIN_CHAR.test(word)) ltr += 1
  }
  return rtl >= ltr ? 'rtl' : 'ltr'
}

/**
 * Escaped text with each run of the other direction isolated in `<bdi class="bidi-run">`, so file names, URLs and
 * parentheses keep their logical order. Text that does not mix scripts is only escaped.
 */
export function bidiMarkup(text: string, dir: 'rtl' | 'ltr' | null = mixedDirection(text)): string {
  if (!dir) return escapeHtml(text)
  const pattern = dir === 'rtl' ? LTR_RUN : RTL_RUN
  const runDir = dir === 'rtl' ? 'ltr' : 'rtl'
  let out = ''
  let last = 0
  for (const match of text.matchAll(pattern)) {
    let run = match[0]
    // Sentence punctuation after a run belongs to the sentence, not to the file name or URL.
    run = dir === 'rtl' ? run.replace(/[.,;:!?)\]}-]+$/, '') : run.replace(/\s+$/, '')
    const start = match.index ?? 0
    if (!run || (dir === 'rtl' && !LATIN_CHAR.test(run))) continue
    out += escapeHtml(text.slice(last, start)) + `<bdi class="bidi-run" dir="${runDir}">${escapeHtml(run)}</bdi>`
    last = start + run.length
  }
  return out + escapeHtml(text.slice(last))
}

/** Owner-written text as an isolated inline run: `<bdi>` with its own direction (BOS-21). */
export function bidi(text: string, className = ''): SafeHtml {
  const dir = mixedDirection(text)
  const cls = className ? ` class="${escapeHtml(className)}"` : ''
  return new SafeHtml(`<bdi${cls} dir="${dir ?? 'auto'}">${bidiMarkup(text, dir)}</bdi>`)
}

/** Elements whose content is not rendered HTML (or not HTML at all) keep plain escaping. */
const NO_BIDI_TAGS = new Set(['textarea', 'title', 'option', 'script', 'style', 'text', 'tspan', 'textpath'])
const AUTO_TAG = /^<([A-Za-z][\w-]*)\b[^<>]*\sdir="auto"[^<>]*>\s*$/

/**
 * A string placed straight inside an element marked `dir="auto"` is owner-written text by convention. When it
 * mixes scripts, the element gets the direction of the majority of its words and the other script's runs are
 * isolated. This is the one central place every page's `dir="auto"` values go through (BOS-21).
 */
function renderInto(out: string, value: Value): { out: string; text: string } {
  if (typeof value !== 'string' || !RTL_CHAR.test(value) || !LATIN_CHAR.test(value)) return { out, text: render(value) }
  const open = out.lastIndexOf('<')
  const tail = open >= 0 ? out.slice(open) : ''
  const tag = AUTO_TAG.exec(tail)
  if (!tag || NO_BIDI_TAGS.has(tag[1]!.toLowerCase())) return { out, text: render(value) }
  const dir = mixedDirection(value)!
  return { out: out.slice(0, open) + tail.replace(/(\s)dir="auto"/, `$1dir="${dir}" data-bidi="mixed"`), text: bidiMarkup(value, dir) }
}

export function html(strings: TemplateStringsArray, ...values: Value[]): SafeHtml {
  let out = strings[0] ?? ''
  for (let index = 0; index < values.length; index += 1) {
    const next = renderInto(out, values[index] as Value)
    out = next.out + next.text + (strings[index + 1] ?? '')
  }
  return new SafeHtml(out)
}

/** Only for markup this codebase wrote itself (icons). Never pass repository content here. */
export function trusted(markup: string): SafeHtml {
  return new SafeHtml(markup)
}

export function join(items: SafeHtml[], separator = ''): SafeHtml {
  return new SafeHtml(items.map((item) => item.value).join(separator))
}

/** `#rgb`, `#rrggbb` or `#rrggbbaa` only. Anything else is not used in an attribute. */
export function safeHex(value: unknown): string | null {
  return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value.trim()) ? value.trim() : null
}

/** Links that leave Studio must be plain https GitHub URLs. */
export function safeGitHubUrl(value: unknown): string | null {
  return typeof value === 'string' && /^https:\/\/github\.com\/[A-Za-z0-9._/-]+$/.test(value) ? value : null
}
