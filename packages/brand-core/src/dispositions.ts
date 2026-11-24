import { normalizeCommand } from './i18n.js'
import type { Status } from './types.js'

const DISPOSITIONS: Array<{ words: string[]; status: Status; uncertainty: string }> = [
  { words: ['unknown', "i don't know", 'idk'], status: 'unknown', uncertainty: 'Owner does not know. No value was invented.' },
  { words: ['skip'], status: 'skipped', uncertainty: 'Owner skipped. Field stays unresolved.' },
  { words: ['not relevant', 'n/a', 'na'], status: 'not_applicable', uncertainty: 'Owner marked this question not applicable.' },
]

/** `unknown`, `skip` and `n/a` (and their fa/tr aliases) mark a disposition. They are never stored as values. */
export function dispositionFor(raw: string): { status: Status; uncertainty: string } | null {
  const lower = normalizeCommand(raw).trim().toLowerCase()
  const match = DISPOSITIONS.find((item) => item.words.includes(lower))
  return match ? { status: match.status, uncertainty: match.uncertainty } : null
}
