import fs from 'node:fs'
import path from 'node:path'
import { approvalProofMatches } from '../private-store.js'
import { dirUsable, withLock, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import {
  ASPECT_SIDES,
  CREATIVE_LIMITS,
  CREATIVE_SCHEMA_VERSION,
  CreativeError,
  newAspectProposalId,
  validateAspectProposalId,
  validateFeedbackId,
  validateProjectId,
  type Aspect,
  type AspectProposal,
  type AspectSide,
  type AspectSuggestion,
  type FeedbackEvent,
} from './model.js'
import { assertOwnerProcess, creativeDir, readProject, readRecord, sourceStatus, updateProject, writeRecord } from './store.js'

/**
 * Aspect proposals: keep/avoid aspects suggested from the words of a feedback note, for the owner to confirm.
 *
 * Derivation is a fixed, deterministic lexicon (fa/en/tr), not a model: same text, same suggestions. A proposal
 * stores lexicon cues only, never note text. It is `pending` and changes nothing: the feedback event, retrieval and
 * the agent tool ignore it until the owner approves it with the approval proof. The owner can approve a subset,
 * choose the side of an `unclear` suggestion, or reject it. Every function refuses under an agent token.
 */

export const ASPECT_METHOD = 'lexicon-v1'

type Lexicon = Record<Aspect, Array<string | [string, AspectSide]>>

/** Terms per aspect. A `[term, side]` pair means the word itself says keep or avoid (for example childish). */
const LEXICON: Lexicon = {
  camera_angle: ['camera angle', 'camera', 'angle', 'framing', 'shot', 'زاویه دوربین', 'زاویه', 'دوربین', 'کادر', 'kamera açısı', 'kamera', 'açı', 'kadraj'],
  lighting: ['lighting', 'light', 'shadow', 'نورپردازی', 'نور', 'سایه', 'ışık', 'aydınlatma', 'gölge'],
  text_density: [['too much text', 'avoid'], 'text', 'copy', 'words', 'caption', 'متن', 'نوشته', 'کلمات', 'metin', 'yazı'],
  tone: [['childish', 'avoid'], 'tone', 'serious', 'playful', 'corporate', ['بچگانه', 'avoid'], ['کودکانه', 'avoid'], 'لحن', 'جدی', 'رسمی', ['çocuksu', 'avoid'], 'ton', 'ciddi', 'resmi'],
  typography: ['font', 'typography', 'typeface', 'lettering', 'فونت', 'تایپوگرافی', 'yazı tipi', 'tipografi'],
  layout: ['layout', 'composition', ['cluttered', 'avoid'], ['busy', 'avoid'], 'چیدمان', 'ترکیب بندی', ['شلوغ', 'avoid'], 'düzen', 'kompozisyon', ['kalabalık', 'avoid']],
  color: ['color', 'colour', 'palette', 'رنگ', 'renk'],
  mascot_pose: ['pose', 'posture', 'ژست', 'حالت بدن', 'poz', 'duruş'],
  mascot_anatomy: ['anatomy', 'proportions', 'wings', 'beak', 'آناتومی', 'تناسب', 'anatomi', 'kanat', 'gaga'],
  hook: ['hook', 'opening', 'first second', 'intro', 'شروع', 'ثانیه اول', 'açılış', 'kanca', 'giriş'],
  cta: ['cta', 'call to action', 'button', 'دکمه', 'فراخوان', 'buton', 'eylem çağrısı'],
  duration: [['too long', 'avoid'], ['too short', 'avoid'], 'duration', 'length', 'مدت', ['طولانی', 'avoid'], 'süre', ['çok uzun', 'avoid']],
  pacing: ['pacing', 'pace', 'rhythm', 'ریتم', 'سرعت', 'tempo', 'ritim'],
  music: ['music', 'song', 'soundtrack', 'audio', 'موسیقی', 'آهنگ', 'müzik', 'şarkı'],
}

const NEGATIVE = ['too', 'not', 'bad', 'ugly', 'wrong', 'hate', 'dislike', 'less', 'remove', 'avoid', 'boring', 'weak', 'زیاد', 'بد', 'زشت', 'نیست', 'کم کن', 'حذف', 'اشتباه', 'ضعیف', 'خسته کننده', 'دوست ندارم', 'نمی', 'fazla', 'kötü', 'değil', 'beğenmedim', 'sevmedim', 'kaldır', 'yanlış', 'zayıf', 'sıkıcı']
const POSITIVE = ['good', 'great', 'love', 'like', 'nice', 'right', 'perfect', 'keep', 'better', 'beautiful', 'works', 'خوب', 'عالی', 'دوست دارم', 'قشنگ', 'زیبا', 'درست', 'نگه دار', 'بهتر', 'iyi', 'güzel', 'harika', 'beğendim', 'sevdim', 'doğru', 'mükemmel', 'kalsın']

/** Lowercase, NFC, Persian/Arabic letter variants unified, ZWNJ and Turkish dotless i folded, spaces collapsed. */
export function normalizeForAspects(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[ً-ْ]/g, '')
    .replace(/‌/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim()
}

const CLAUSE_SPLIT = /[.!?؟،,;؛\n]+|\s(?:but|however|although|ولی|اما|ama|fakat|ancak|lakin)\s/

/** Start-of-word match: Persian suffixes and Turkish case endings may follow, but a term inside a word does not match. */
function findTerm(clause: string, term: string, wholeWord = false): number {
  let from = 0
  for (;;) {
    const at = clause.indexOf(term, from)
    if (at === -1) return -1
    const startOk = at === 0 || /[\s\p{P}]/u.test(clause[at - 1]!)
    const after = clause[at + term.length]
    const endOk = !wholeWord || after === undefined || /[\s\p{P}]/u.test(after)
    if (startOk && endOk) return at
    from = at + 1
  }
}

/** Short English cues that are prefixes of unrelated words (too/tool, not/note): whole words only. */
const WHOLE_WORD_CUES = new Set(['too', 'not', 'less', 'like', 'keep', 'right', 'bad', 'good', 'nice', 'iyi'])
const cueIn = (clause: string, cue: string): boolean => findTerm(clause, cue, WHOLE_WORD_CUES.has(cue)) !== -1

const TERMS = (Object.entries(LEXICON) as Array<[Aspect, Lexicon[Aspect]]>)
  .flatMap(([aspect, terms]) => terms.map((entry) => (typeof entry === 'string' ? { aspect, term: entry, side: null } : { aspect, term: entry[0], side: entry[1] })))
  .map((item) => ({ ...item, cue: item.term, term: normalizeForAspects(item.term) }))
  // Longest first, and a matched span is masked, so "yazı tipi" is typography and not also text.
  .sort((a, b) => b.term.length - a.term.length)
const NEG = NEGATIVE.map(normalizeForAspects)
const POS = POSITIVE.map(normalizeForAspects)

/**
 * Suggests aspects from feedback text. Pure and deterministic. Aspects already on the event (either side) are not
 * suggested again. A clause with a negative cue suggests avoid, else a positive cue suggests keep, else unclear;
 * an aspect seen with both sides in different clauses is unclear.
 */
export function deriveAspects(text: string, existing: { keep: readonly Aspect[]; avoid: readonly Aspect[] } = { keep: [], avoid: [] }): AspectSuggestion[] {
  const found = new Map<Aspect, AspectSuggestion>()
  for (const raw of normalizeForAspects(text).split(CLAUSE_SPLIT)) {
    let clause = raw.trim()
    if (!clause) continue
    const hits: Array<{ aspect: Aspect; term: string; cue: string; side: AspectSide | null }> = []
    for (const entry of TERMS) {
      const at = findTerm(clause, entry.term)
      if (at === -1) continue
      hits.push(entry)
      clause = `${clause.slice(0, at)}${' '.repeat(entry.term.length)}${clause.slice(at + entry.term.length)}`
    }
    if (!hits.length) continue
    const negative = NEG.some((cue) => cueIn(clause, cue)) || /n't\b/.test(clause)
    const positive = POS.some((cue) => cueIn(clause, cue))
    const clauseSide: AspectSide | 'unclear' = negative ? 'avoid' : positive ? 'keep' : 'unclear'
    for (const hit of hits) {
      const side = hit.side ?? clauseSide
      const prior = found.get(hit.aspect)
      if (!prior) found.set(hit.aspect, { aspect: hit.aspect, side, cue: hit.cue })
      else if (prior.side === 'unclear' && side !== 'unclear') found.set(hit.aspect, { aspect: hit.aspect, side, cue: hit.cue })
      else if (prior.side !== side && side !== 'unclear') found.set(hit.aspect, { ...prior, side: 'unclear' })
    }
  }
  return [...found.values()].filter((item) => !existing.keep.includes(item.aspect) && !existing.avoid.includes(item.aspect)).sort((a, b) => a.aspect.localeCompare(b.aspect))
}

// ---- proposal records --------------------------------------------------------------------------------

function proposalFile(ws: KnowledgeWorkspace, id: string): string {
  return path.join(creativeDir(ws, 'aspects'), `${validateAspectProposalId(id)}.json`)
}

export function readAspectProposal(ws: KnowledgeWorkspace, id: string): AspectProposal {
  assertOwnerProcess()
  const doc = readRecord<AspectProposal>(ws, proposalFile(ws, id), 'creative_aspect_proposal')
  if (!doc) throw new CreativeError('not_found', `No aspect proposal ${id} in this brand.`)
  if (doc.proposal_id !== id) throw new CreativeError('invalid_record', `The file for ${id} carries another proposal id.`)
  return doc
}

export function listAspectProposals(ws: KnowledgeWorkspace, filter: { project_id?: string; state?: string } = {}): AspectProposal[] {
  assertOwnerProcess()
  const folder = creativeDir(ws, 'aspects')
  if (!dirUsable(ws, folder)) return []
  const out: AspectProposal[] = []
  for (const name of fs.readdirSync(folder).sort()) {
    const match = /^(ap_[0-9a-f-]{36})\.json$/.exec(name)
    if (!match) continue
    try {
      out.push(readAspectProposal(ws, match[1]!))
    } catch (error) {
      if (!(error instanceof CreativeError)) throw error
    }
  }
  return out
    .filter((item) => (filter.project_id ? item.project_id === filter.project_id : true) && (filter.state ? item.state === filter.state : true))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export interface SuggestAspectsResult {
  created: AspectProposal[]
  skipped: Array<{ feedback_id: string; reason: 'no_suggestion' | 'pending_exists' | 'note_unavailable' }>
}

/**
 * Creates pending proposals for one feedback event (`feedback_id`) or every event of a project. An event that
 * already has a pending proposal for the same note revision is skipped, so running it twice adds nothing.
 */
export function suggestAspects(ws: KnowledgeWorkspace, input: { project_id: string; feedback_id?: string }): SuggestAspectsResult {
  assertOwnerProcess()
  const project = readProject(ws, validateProjectId(input.project_id))
  let events: FeedbackEvent[] = project.feedback
  if (input.feedback_id !== undefined) {
    const id = validateFeedbackId(input.feedback_id)
    events = project.feedback.filter((event) => event.feedback_id === id)
    if (!events.length) throw new CreativeError('not_found', `No feedback ${id} in ${project.project_id}.`)
  }
  const pending = listAspectProposals(ws, { project_id: project.project_id, state: 'pending' })
  const result: SuggestAspectsResult = { created: [], skipped: [] }
  return withLock(ws, 'creative-aspects', () => {
    for (const event of events.slice(0, CREATIVE_LIMITS.maxAspectProposalsPerRun)) {
      const status = sourceStatus(ws, event.note)
      if (!status.loaded || status.state === 'archived' || status.state === 'missing') {
        result.skipped.push({ feedback_id: event.feedback_id, reason: 'note_unavailable' })
        continue
      }
      if (pending.some((item) => item.feedback_id === event.feedback_id && item.note.revision === status.loaded!.revision)) {
        result.skipped.push({ feedback_id: event.feedback_id, reason: 'pending_exists' })
        continue
      }
      const suggestions = deriveAspects(status.loaded.note.body, event)
      if (!suggestions.length) {
        result.skipped.push({ feedback_id: event.feedback_id, reason: 'no_suggestion' })
        continue
      }
      const now = ws.now().toISOString()
      const proposal: AspectProposal = {
        schema_version: CREATIVE_SCHEMA_VERSION,
        kind: 'creative_aspect_proposal',
        proposal_id: newAspectProposalId(),
        brand_slug: ws.brandSlug,
        project_id: project.project_id,
        feedback_id: event.feedback_id,
        variant_id: event.variant_id,
        // The revision read now: approval is refused if the note changes before the owner decides.
        note: { id: status.loaded.id, revision: status.loaded.revision },
        method: ASPECT_METHOD,
        label: 'machine_suggestion_unverified',
        suggestions,
        state: 'pending',
        applied: [],
        decided_at: null,
        created_at: now,
      }
      writeRecord(ws, proposalFile(ws, proposal.proposal_id), proposal)
      result.created.push(proposal)
    }
    return result
  })
}

/** Parses `camera_angle:keep,text_density:avoid` (or a bare aspect, meaning its suggested side). */
export function parseAspectChoices(value: string): Array<{ aspect: string; side: string | null }> {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [aspect, side] = item.split(':')
      return { aspect: aspect ?? '', side: side ?? null }
    })
}

/**
 * Owner approval (existing approval proof). Applies the chosen suggestions to the feedback event's keep/avoid and
 * records the proposal id on the event. Without `only`, every suggestion with a clear side is applied; an `unclear`
 * one is applied only when `only` names its side. Refused if the note changed since the suggestion.
 */
export function approveAspects(
  ws: KnowledgeWorkspace,
  input: { proposal_id: string; proof: string | undefined; only?: Array<{ aspect: string; side: string | null }> },
): { proposal: AspectProposal; feedback: FeedbackEvent } {
  assertOwnerProcess()
  const id = validateAspectProposalId(input.proposal_id)
  if (!approvalProofMatches(ws.root, input.proof)) throw new CreativeError('proof', 'Approval refused: missing or wrong owner approval proof. Nothing was changed.')
  return withLock(ws, 'creative-aspects', () => {
    const proposal = readAspectProposal(ws, id)
    if (proposal.state !== 'pending') throw new CreativeError('refused', `${id} is ${proposal.state}. Only a pending proposal can be approved.`)
    const status = sourceStatus(ws, proposal.note)
    if (!status.current) throw new CreativeError('stale_source', `Note ${proposal.note.id} is ${status.state} since these aspects were suggested. Run aspects suggest again. Nothing was applied.`)
    let chosen: Array<{ aspect: Aspect; side: AspectSide }>
    if (input.only && input.only.length) {
      chosen = input.only.map((choice) => {
        const suggestion = proposal.suggestions.find((item) => item.aspect === choice.aspect)
        if (!suggestion) throw new CreativeError('invalid_input', `${choice.aspect} is not one of this proposal's suggestions.`)
        const side = choice.side ?? suggestion.side
        if (!(ASPECT_SIDES as readonly string[]).includes(side)) throw new CreativeError('invalid_input', `Choose keep or avoid for ${choice.aspect} (for example ${choice.aspect}:keep).`)
        return { aspect: suggestion.aspect, side: side as AspectSide }
      })
    } else {
      chosen = proposal.suggestions.filter((item): item is AspectSuggestion & { side: AspectSide } => item.side !== 'unclear').map((item) => ({ aspect: item.aspect, side: item.side }))
    }
    if (!chosen.length) throw new CreativeError('invalid_input', 'Nothing to apply: every suggestion is unclear. Name the side with --only aspect:keep|avoid, or reject the proposal.')
    let feedback: FeedbackEvent | null = null
    updateProject(ws, proposal.project_id, (project) => {
      const event = project.feedback.find((item) => item.feedback_id === proposal.feedback_id)
      if (!event) throw new CreativeError('not_found', `Feedback ${proposal.feedback_id} is no longer in ${proposal.project_id}.`)
      for (const item of chosen) {
        const other = item.side === 'keep' ? event.avoid : event.keep
        if (other.includes(item.aspect)) throw new CreativeError('refused', `${item.aspect} is already ${item.side === 'keep' ? 'avoid' : 'keep'} on this feedback. Nothing was applied.`)
      }
      for (const item of chosen) {
        const list = item.side === 'keep' ? event.keep : event.avoid
        if (!list.includes(item.aspect)) list.push(item.aspect)
      }
      event.aspect_proposals = [...(event.aspect_proposals ?? []), proposal.proposal_id]
      feedback = event
    })
    proposal.state = 'approved'
    proposal.applied = chosen
    proposal.decided_at = ws.now().toISOString()
    writeRecord(ws, proposalFile(ws, proposal.proposal_id), proposal)
    return { proposal, feedback: feedback! }
  })
}

/** The owner declines the suggestions. Nothing is applied; the record stays for audit. */
export function rejectAspects(ws: KnowledgeWorkspace, input: { proposal_id: string }): AspectProposal {
  assertOwnerProcess()
  const id = validateAspectProposalId(input.proposal_id)
  return withLock(ws, 'creative-aspects', () => {
    const proposal = readAspectProposal(ws, id)
    if (proposal.state !== 'pending') throw new CreativeError('refused', `${id} is ${proposal.state}. Only a pending proposal can be rejected.`)
    proposal.state = 'rejected'
    proposal.decided_at = ws.now().toISOString()
    writeRecord(ws, proposalFile(ws, proposal.proposal_id), proposal)
    return proposal
  })
}
