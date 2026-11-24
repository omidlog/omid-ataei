import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import YAML from 'yaml'
import { allQuestions, applyEntityOperation, ensureApprovalSecret, entitySpec, InterviewEngine, normalizeEntityAnswer, readEntityList, sourceRefKind, type EntityList } from '@brand-os/brand-core'
import {
  buildSwotTows,
  buildValueProposition,
  illustrativeSwotTows,
  illustrativeValueProposition,
  STRATEGY_TEXT,
  SWOT_TOWS_QUESTIONS,
  VALUE_FIT_QUESTIONS,
  type SourceNotesBlock,
  type SwotBlock,
  type TowsMatrixBlock,
  type ValuePropositionCanvasBlock,
  type VisualDocument,
} from '@brand-os/brand-core/visual'
import { brandDir, useTestKey } from './helpers/knowledge.js'

/**
 * Visual V3.2: SWOT / TOWS and the Value Proposition Canvas as list questions with item sources, and the documents
 * built from them. All data is SYNTHETIC DEMO data for a mock coffee roastery; no real brand appears here.
 */
useTestKey()

const NEW_QUESTIONS = [...SWOT_TOWS_QUESTIONS, ...VALUE_FIT_QUESTIONS]

function list(spec: ReturnType<typeof entitySpec>, value: unknown): EntityList {
  const read = readEntityList(spec!, value)
  assert.equal(read.state, 'items', `not a list: ${String(value)}`)
  return (read as { list: EntityList }).list
}

function block<T extends VisualDocument['blocks'][number]['type']>(doc: VisualDocument, type: T): Extract<VisualDocument['blocks'][number], { type: T }> {
  const found = doc.blocks.find((candidate) => candidate.type === type)
  assert.ok(found, `${type} block`)
  return found as Extract<VisualDocument['blocks'][number], { type: T }>
}

test('the eleven V3.2 list questions are optional, internal, sourced and in the committed bank', () => {
  assert.equal(NEW_QUESTIONS.length, 11)
  const bank = new Map(allQuestions().map((question) => [question.id, question]))
  const committed = YAML.parse(fs.readFileSync(path.resolve('brand/interview/question-bank/business.yaml'), 'utf8')) as { questions: Array<{ id: string; question_type: string; entity?: unknown }> }
  const registry = YAML.parse(fs.readFileSync(path.resolve('brand/interview/field-registry.yaml'), 'utf8')) as { fields: Array<{ id: string }> }
  for (const id of NEW_QUESTIONS) {
    const question = bank.get(id)
    assert.ok(question, id)
    assert.equal(question.question_type, 'repeating_entity')
    assert.equal(question.required, false, `${id} is optional`)
    assert.equal(question.sensitivity, 'internal', `${id} is internal`)
    for (const lang of ['en', 'fa', 'tr'] as const) assert.ok(question.prompt[lang].length > 10, `${id} ${lang}`)
    const spec = entitySpec(id)!
    assert.equal(spec.sources, true, `${id} items take sources`)
    for (const field of spec.fields) for (const lang of ['en', 'fa', 'tr'] as const) assert.ok(field.label[lang], `${id}.${field.key} ${lang}`)
    assert.ok(committed.questions.some((entry) => entry.id === id && entry.question_type === 'repeating_entity' && entry.entity), `${id} in business.yaml`)
    assert.ok(registry.fields.some((entry) => entry.id === id), `${id} in field-registry.yaml`)
    for (const related of question.related_ids) assert.ok(bank.has(related), `${id} related ${related} exists`)
  }
})

test('every committed question bank parses with the YAML default alias limit', () => {
  const dir = path.resolve('brand/interview/question-bank')
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.yaml'))) {
    assert.doesNotThrow(() => YAML.parse(fs.readFileSync(path.join(dir, file), 'utf8')), file)
  }
  const business = fs.readFileSync(path.join(dir, 'business.yaml'), 'utf8')
  assert.equal(/\*a\d+/.test(business), false, 'the business bank carries no YAML aliases')
})

test('source references: four forms, checked for form only, never a password or a non-https link', () => {
  assert.equal(sourceRefKind('business.offer.summary'), 'fact')
  assert.equal(sourceRefKind('kn_offline-interviews'), 'knowledge')
  assert.equal(sourceRefKind('ev-0001'), 'evidence')
  assert.equal(sourceRefKind('https://example.com/report?x=1'), 'web')
  for (const bad of ['http://example.com', 'https://user:pass@example.com/x', 'https://localhost', 'javascript:alert(1)', 'seg-1', 'note', 'business']) assert.equal(sourceRefKind(bad), null, bad)

  const spec = entitySpec('business.swot.strengths')!
  const ok = normalizeEntityAnswer(spec, 'Roasts to order | weekly log | evidenced | sources: business.offer.summary, https://example.com/log\nSmall batches | | owner_view')
  assert.ok(ok.ok, ok.ok ? '' : ok.message)
  const parsed = list(spec, ok.value)
  assert.deepEqual(parsed.items[0]!.sources, ['business.offer.summary', 'https://example.com/log'])
  assert.equal(parsed.items[1]!.sources, undefined, 'no sources, no key')
  const again = normalizeEntityAnswer(spec, ok.value)
  assert.ok(again.ok && again.value === ok.value, 'normalizing the canonical form changes nothing')

  for (const bad of ['A | | | sources: http://example.com', 'A | | | sources: https://u:p@example.com/', 'A | | | sources: not-a-ref']) {
    const refused = normalizeEntityAnswer(spec, bad)
    assert.equal(refused.ok, false, bad)
  }
  const many = normalizeEntityAnswer(spec, `A | | | sources: ${Array.from({ length: 9 }, (_, i) => `ev-000${i + 1}`).join(', ')}`)
  assert.equal(many.ok, false, 'at most eight sources')
  // BMC lists (V3.1) still refuse sources: the spec decides.
  assert.equal(normalizeEntityAnswer(entitySpec('business.model.segments')!, 'Cafés | | primary | sources: ev-0001').ok, false)
})

test('TOWS: the strategy type narrows the links; links and sources trail in either order', () => {
  const spec = entitySpec('business.swot.tows')!
  const so = normalizeEntityAnswer(spec, 'Café subscription | weekly | so | sources: kn_cafe-survey | links: str-1, opp-2')
  assert.ok(so.ok, so.ok ? '' : so.message)
  const item = list(spec, so.value).items[0]!
  assert.deepEqual(item.links, ['str-1', 'opp-2'])
  assert.deepEqual(item.sources, ['kn_cafe-survey'])
  const wrong = normalizeEntityAnswer(spec, 'Café subscription | | so | links: wk-1')
  assert.equal(wrong.ok, false)
  assert.match((wrong as { message: string }).message, /SO items link only to str-…, opp-…/)
  const untyped = normalizeEntityAnswer(spec, 'Open question | | | links: wk-1, thr-2')
  assert.ok(untyped.ok, 'a strategy without a type may link to any SWOT list')
  assert.equal(normalizeEntityAnswer(spec, 'X | | | links: seg-1').ok, false, 'never outside the SWOT lists')

  const reliever = entitySpec('business.fit.relievers')!
  assert.ok(normalizeEntityAnswer(reliever, 'Dated bags | roasted within 48 h | links: pain-1, prod-1').ok)
  assert.equal(normalizeEntityAnswer(reliever, 'Dated bags | | links: gain-1').ok, false, 'a reliever answers a pain, not a gain')
})

test('item operations keep, replace and clear sources', () => {
  const spec = entitySpec('business.fit.pains')!
  const added = applyEntityOperation(spec, null, { op: 'add', fields: { name: 'Stale beans', severity: 'extreme' }, sources: ['ev-0002'] })
  assert.ok(added.ok)
  const edited = applyEntityOperation(spec, added.value.list, { op: 'edit', id: 'pain-1', fields: {}, sources: ['https://example.com/a', 'ev-0002'] })
  assert.ok(edited.ok)
  assert.deepEqual(edited.value.list.items[0]!.sources, ['https://example.com/a', 'ev-0002'])
  const moved = applyEntityOperation(spec, edited.value.list, { op: 'add', fields: { name: 'Late delivery' } })
  assert.ok(moved.ok)
  assert.deepEqual(moved.value.list.items[0]!.sources, ['https://example.com/a', 'ev-0002'], 'other items keep their sources')
  const cleared = applyEntityOperation(spec, moved.value.list, { op: 'edit', id: 'pain-1', fields: {}, sources: [] })
  assert.ok(cleared.ok)
  assert.equal(cleared.value.list.items[0]!.sources, undefined)
  assert.equal(cleared.value.value.includes('"sources"'), false)
  const refused = applyEntityOperation(spec, null, { op: 'add', fields: { name: 'X' }, sources: ['http://plain.example'] })
  assert.equal(refused.ok, false)
})

function roastery(slug: string) {
  const root = brandDir({ slug })
  const engine = new InterviewEngine(root)
  return { root, engine }
}

function approveIds(engine: InterviewEngine, root: string, ids: string[]): void {
  engine.approvals().approveBatch({ ids }, ensureApprovalSecret(root))
}

test('SWOT / TOWS from a brand: internal shows labelled drafts, public shows nothing unpublished, links and sources resolve', () => {
  const { root, engine } = roastery('swot-demo')
  engine.answerQuestion('business.offer.summary', 'SYNTHETIC roastery offer')
  engine.answerQuestion('business.swot.strengths', 'Roasts to order | weekly log | evidenced | sources: business.offer.summary, https://example.com/roast-log?token=abc#top, kn_shared-note\nSmall team | | owner_view | sources: kn_private-note, ev-0099')
  engine.answerQuestion('business.swot.opportunities', 'More cafés buy local | trade survey | evidenced')
  approveIds(engine, root, ['business.offer.summary', 'business.swot.strengths', 'business.swot.opportunities'])
  engine.answerQuestion('business.swot.weaknesses', 'DRAFT-WEAKNESS one roaster | | owner_view')
  engine.answerQuestion('business.swot.tows', 'Café subscription | | so | links: str-1, opp-1\nBackup roaster | | wt | links: wk-1, thr-4\nOpen idea | | | links: str-2')

  const internal = buildSwotTows(engine, 'internal', { sharedNotes: new Map([['kn_shared-note', 'SYNTHETIC interview notes']]) })
  assert.equal(internal.document_kind, 'swot_tows')
  assert.equal(internal.illustrative, false)
  assert.equal(internal.framework_refs[0]!.framework_id, 'SWOT')
  const swot = block(internal, 'swot') as SwotBlock
  assert.deepEqual(swot.quadrants.map((q) => q.area_id), ['strengths', 'weaknesses', 'opportunities', 'threats'])
  assert.deepEqual(swot.quadrants.map((q) => q.state), ['complete', 'partial', 'complete', 'missing'])
  const strengths = swot.quadrants[0]!.entry!
  assert.deepEqual(strengths.items!.map((item) => item.name), ['Roasts to order', 'Small team'])
  assert.equal(swot.quadrants[1]!.entry!.state, 'assumption')
  assert.deepEqual(swot.quadrants[3]!.next_questions, [{ id: 'business.swot.threats', kind: 'existing' }])

  const notes = (block(internal, 'source_notes') as SourceNotesBlock).notes
  assert.deepEqual(notes.map((note) => [note.n, note.kind, note.status]), [
    [1, 'fact', 'approved'],
    [2, 'web', 'recorded'],
    [3, 'knowledge', 'shared'],
    [4, 'knowledge', 'not_available'],
    [5, 'evidence', 'not_available'],
  ])
  assert.equal(notes[0]!.label, 'Offer', 'an approved answer is cited by its label, never its value')
  assert.equal(JSON.stringify(internal).includes('SYNTHETIC roastery offer'), false)
  assert.equal(notes[1]!.host, 'example.com')
  assert.equal(notes[1]!.url, 'https://example.com/roast-log', 'query and fragment are dropped')
  assert.equal(JSON.stringify(internal).includes('token=abc'), false)
  assert.deepEqual(strengths.items![0]!.sources, ['business.offer.summary', 'https://example.com/roast-log', 'kn_shared-note'])
  assert.equal(notes[2]!.label, 'SYNTHETIC interview notes')

  const tows = block(internal, 'tows_matrix') as TowsMatrixBlock
  assert.deepEqual(tows.cells, { so: ['tows-1'], st: [], wo: [], wt: ['tows-2'] })
  assert.deepEqual(tows.unplaced, ['tows-3'], 'a strategy without a type is never guessed into a cell')
  assert.deepEqual(tows.links.filter((link) => link.state === 'unresolved').map((link) => link.to), ['thr-4'])
  assert.equal(tows.names['str-1'], 'Roasts to order')

  const pub = buildSwotTows(engine, 'public')
  const pubSwot = block(pub, 'swot') as SwotBlock
  for (const quadrant of pubSwot.quadrants) {
    assert.equal(quadrant.entry?.items, undefined, `${quadrant.area_id}: internal lists are not published`)
    assert.equal(quadrant.next_questions.length > 0 || quadrant.entry?.missing_reason === 'not_published', true)
  }
  assert.equal(JSON.stringify(pub).includes('DRAFT-WEAKNESS'), false)
  assert.equal(JSON.stringify(pub).includes('Roasts to order'), false)
  assert.equal(JSON.stringify(pub).includes('kn_'), false)
  assert.deepEqual((block(pub, 'source_notes') as SourceNotesBlock).notes, [])
})

test('Value Proposition Canvas from a brand: fit comes only from recorded links, segment links read as names', () => {
  const { root, engine } = roastery('vpc-demo')
  engine.answerQuestion('business.model.segments', 'Independent cafés | weekly supply | primary')
  engine.answerQuestion('business.fit.pains', 'Stale beans | monthly shipping | extreme | links: seg-1\nLate delivery | | moderate\nUnclear origin | | light')
  engine.answerQuestion('business.fit.gains', 'Regulars notice quality | | desired | links: seg-1')
  engine.answerQuestion('business.fit.relievers', 'Roasted within 48 h | | links: pain-1\nTracked courier | | links: pain-2, pain-9')
  engine.answerQuestion('business.fit.products', 'Weekly delivery | 1 kg bags | physical | links: seg-1')
  approveIds(engine, root, ['business.model.segments', 'business.fit.pains'])
  const doc = buildValueProposition(engine, 'internal')
  assert.equal(doc.document_kind, 'value_proposition')
  const vpc = block(doc, 'value_proposition_canvas') as ValuePropositionCanvasBlock
  assert.deepEqual(vpc.zones.map((zone) => zone.area_id), ['products_services', 'gain_creators', 'pain_relievers', 'customer_jobs', 'gains', 'pains'])
  assert.deepEqual(vpc.zones.map((zone) => zone.state), ['partial', 'missing', 'partial', 'missing', 'partial', 'complete'])
  assert.deepEqual(vpc.fit.pains, [
    { id: 'pain-1', addressed_by: ['rel-1'] },
    { id: 'pain-2', addressed_by: ['rel-2'] },
    { id: 'pain-3', addressed_by: [] },
  ])
  assert.deepEqual(vpc.fit.gains, [{ id: 'gain-1', addressed_by: [] }], 'no creator listed, so no fit is claimed')
  assert.equal(vpc.names['seg-1'], 'Independent cafés', 'segments are read only to name links')
  assert.deepEqual(vpc.links.filter((link) => link.state === 'unresolved').map((link) => link.to), ['pain-9'])
  assert.equal(vpc.zones.some((zone) => zone.entry?.id === 'business.model.segments'), false, 'segments are not a canvas zone')
})

test('illustrative fixtures are stamped, cover every state, and the public edition drops internal sources', () => {
  for (const lang of ['en', 'fa', 'tr'] as const) {
    const swot = illustrativeSwotTows(lang)
    assert.equal(swot.illustrative, true)
    assert.equal(swot.origin, 'illustrative_fixture')
    const quadrants = (block(swot, 'swot') as SwotBlock).quadrants
    assert.deepEqual(quadrants.map((q) => q.state), ['complete', 'partial', 'complete', 'missing'])
    const vpc = illustrativeValueProposition(lang)
    assert.equal(vpc.illustrative, true)
  }
  const internal = block(illustrativeSwotTows('en'), 'source_notes') as SourceNotesBlock
  assert.ok(internal.notes.some((note) => note.kind === 'knowledge' && note.status === 'not_available'))
  const pub = illustrativeSwotTows('en', 'public')
  const pubNotes = block(pub, 'source_notes') as SourceNotesBlock
  assert.ok(pubNotes.notes.every((note) => (note.kind === 'fact' && note.status === 'approved') || note.kind === 'web'))
  assert.ok(pubNotes.hidden > 0, 'evidence and knowledge sources are counted, not shown')
  assert.equal(JSON.stringify(pub).includes('kn_'), false)
  assert.equal(JSON.stringify(pub).includes('ev-0001'), false)
  assert.equal((block(pub, 'swot') as SwotBlock).quadrants[1]!.entry!.items, undefined, 'the draft quadrant is not in the public edition')
})

test('every V3.2 string exists in en, fa and tr', () => {
  const walk = (value: unknown, at: string, out: string[]): string[] => {
    if (typeof value === 'string') out.push(at)
    else if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) walk(inner, `${at}.${key}`, out)
    return out
  }
  const en = walk(STRATEGY_TEXT.en, '', []).sort()
  for (const lang of ['fa', 'tr'] as const) {
    assert.deepEqual(walk(STRATEGY_TEXT[lang], '', []).sort(), en, lang)
    for (const key of en) {
      const value = key.split('.').slice(1).reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], STRATEGY_TEXT[lang])
      assert.ok(typeof value === 'string' && value.length > 0, `${lang}${key}`)
    }
  }
  assert.match(STRATEGY_TEXT.fa.vpcTitle, /[؀-ۿ]/)
})
