import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  agentTokenContext,
  applyInit,
  buildNamedDocument,
  composeDrafts,
  countWords,
  DRAFT_CONNECTORS,
  draftPersonalContent,
  ensureApprovalSecret,
  factLanguage,
  InterviewEngine,
  localizedSegments,
  renderDocumentMarkdown,
  writeStarterWorkspace,
} from '@brand-os/brand-core'
import type { ComposedDraft, DocumentModel, InitInput } from '@brand-os/brand-core'
import { buildPublishingGallery, PERSONAL_PUBLISHING_TYPES, PUBLISHING_DOCUMENT_TYPES, publishingExportCommand } from '@brand-os/brand-core/visual'

/**
 * BOS-19: personal documents carry a composed draft paragraph per language edition, built by fixed templates only from
 * the facts approved in that language, and the personal documents join the Publishing gallery. SYNTHETIC DATA ONLY.
 */

process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')
const SLUG = 'sample-person'

const NAME = 'Sample Person'
const HEADLINE_EN = 'Product strategy advisor | Workshop host'
const KNOWN_FOR_FA = 'مشاور استراتژی محصول برای تیم‌های نوپا.'
const LOCALIZED = 'فارسی: مشاور استراتژی محصول | میزبان کارگاه. ترکی: Ürün stratejisi danışmanı | Atölye sunucusu.'
const OUTCOME_EN = 'I help small teams decide what to build next.'
const ROLES_TR = 'Danışman, eğitmen ve atölye sunucusu'

function brand(extra: Partial<InitInput> = {}): { root: string; engine: InterviewEngine; proof: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-personal-drafts-'))
  writeStarterWorkspace(root)
  applyInit(root, { name: NAME, slug: SLUG, industry: 'consulting', language: 'fa', languages: ['fa', 'en', 'tr'], mascot: false, gamification: false, publish: 'private', profile: 'personal-brand', ...extra })
  return { root, engine: new InterviewEngine(root), proof: ensureApprovalSecret(root) }
}

function approveAll(engine: InterviewEngine, proof: string, values: Record<string, string>): void {
  for (const [id, value] of Object.entries(values)) {
    const result = engine.answerQuestion(id, value)
    assert.equal(result.kind, 'recorded', `${id}: ${result.message}`)
  }
  const batch = engine.approvals().approveBatch({ ids: Object.keys(values) }, proof)
  assert.equal(batch.approved, Object.keys(values).length, JSON.stringify(batch.results))
}

function seeded(): { root: string; engine: InterviewEngine; proof: string } {
  const b = brand()
  approveAll(b.engine, b.proof, {
    'personal.identity.public_name': NAME,
    'personal.identity.headline': HEADLINE_EN,
    'personal.identity.localized_headline': LOCALIZED,
    'personal.positioning.known_for': KNOWN_FOR_FA,
    'personal.positioning.outcome': OUTCOME_EN,
    'personal.identity.roles': ROLES_TR,
  })
  // A draft is never composed.
  assert.equal(b.engine.answerQuestion('personal.positioning.expertise', 'SENTINEL-DRAFT-EXPERTISE').kind, 'recorded')
  return b
}

function draftOf(model: DocumentModel, section: string, locale: string): ComposedDraft {
  const found = model.sections.find((item) => item.id === section)?.drafts?.find((draft) => draft.locale === locale)
  assert.ok(found, `${section}/${locale}`)
  return found
}

/** Everything in a draft that is not an approved value, a connector or punctuation. Must be empty. */
function inventedWords(text: string, values: string[], locale: 'en' | 'fa' | 'tr'): string[] {
  let rest = text
  for (const value of [...values].sort((a, b) => b.length - a.length)) rest = rest.split(value.replace(/[.\s]+$/u, '')).join(' ')
  for (const connector of Object.values(DRAFT_CONNECTORS[locale])) rest = rest.split(connector).join(' ')
  return rest.split(/[\s.:—|]+/u).filter((word) => /[\p{L}\p{N}]/u.test(word))
}

test('language detection and labelled forms are deterministic and script-based', () => {
  assert.equal(factLanguage(HEADLINE_EN), 'en')
  assert.equal(factLanguage(KNOWN_FOR_FA), 'fa')
  assert.equal(factLanguage(ROLES_TR), 'tr')
  assert.equal(factLanguage('See https://example.org/مسیر for details'), 'en', 'URLs do not count')
  assert.equal(factLanguage('Advisor for تیم‌ها and founders across many markets'), 'mixed')
  assert.equal(factLanguage('2024'), 'none')
  assert.deepEqual(localizedSegments(LOCALIZED), { fa: 'مشاور استراتژی محصول | میزبان کارگاه', tr: 'Ürün stratejisi danışmanı | Atölye sunucusu' })
  assert.deepEqual(localizedSegments('tr: Ürün danışmanı'), { tr: 'Ürün danışmanı' })
  assert.deepEqual(localizedSegments('Short form: Sam P.'), {}, 'an unlabelled answer has no forms')
})

test('Professional Bio: one composed draft per locale, only from facts approved in that language', () => {
  const { engine } = seeded()
  const bio = buildNamedDocument(engine, 'professional-bio', 'internal')
  const short = bio.sections.find((section) => section.id === 'short')!
  assert.deepEqual(short.drafts?.map((draft) => draft.locale), ['fa', 'en', 'tr'], 'default language first')

  const fa = draftOf(bio, 'short', 'fa')
  assert.equal(fa.label, 'Draft for owner approval')
  assert.equal(fa.status, 'draft')
  assert.equal(fa.text, `${NAME} — مشاور استراتژی محصول | میزبان کارگاه. شناخته‌شده به‌عنوان: ${KNOWN_FOR_FA}`)
  assert.deepEqual(fa.translations, [{ id: 'personal.identity.headline', from: 'personal.identity.localized_headline' }])
  assert.deepEqual(fa.untranslated, [])

  const en = draftOf(bio, 'short', 'en')
  assert.equal(en.text, `${NAME} — ${HEADLINE_EN}.`)
  assert.deepEqual(en.untranslated.map((item) => [item.id, item.written_in]), [['personal.positioning.known_for', 'fa']], 'never machine-translated')

  const tr = draftOf(bio, 'short', 'tr')
  assert.equal(tr.text, `${NAME} — Ürün stratejisi danışmanı | Atölye sunucusu.`)
  assert.deepEqual(tr.untranslated.map((item) => item.id), ['personal.positioning.known_for'])

  // Medium bio: roles are Turkish, the outcome English; each lands only in its own edition.
  const mediumEn = draftOf(bio, 'medium', 'en')
  const mediumTr = draftOf(bio, 'medium', 'tr')
  assert.ok(mediumEn.text.includes(OUTCOME_EN) && !mediumEn.text.includes(ROLES_TR))
  assert.ok(mediumTr.text.includes(`Roller: ${ROLES_TR}.`) && !mediumTr.text.includes(OUTCOME_EN))
  for (const draft of bio.sections.flatMap((section) => section.drafts ?? [])) {
    assert.ok(!draft.text.includes('SENTINEL-DRAFT'), 'an unapproved draft never reaches a composed draft')
    assert.equal(draft.words, countWords(draft.text))
    const values = [NAME, HEADLINE_EN, KNOWN_FOR_FA, OUTCOME_EN, ROLES_TR, ...Object.values(localizedSegments(LOCALIZED))]
    assert.deepEqual(inventedWords(draft.text, values, draft.locale), [], `${draft.locale}: no invented words`)
  }

  // Word counts count the composed draft of the first edition, not the concatenated facts.
  assert.equal(short.length?.basis, 'composed_draft')
  assert.equal(short.length?.locale, 'fa')
  assert.equal(short.length?.approved_words, fa.words)
  assert.match(short.length?.note ?? '', /The fa draft is \d+ words, below the 50–70 guideline/)

  // Deterministic: the same facts give the same drafts.
  assert.deepEqual(buildNamedDocument(engine, 'professional-bio', 'internal').sections.map((section) => section.drafts), bio.sections.map((section) => section.drafts))
})

test('the fact cards stay as Sources and the Markdown edition shows the labelled drafts', () => {
  const { engine } = seeded()
  const bio = buildNamedDocument(engine, 'professional-bio', 'internal')
  assert.ok(bio.sections.every((section) => section.items.length > 0), 'facts and gaps are still listed')
  const markdown = renderDocumentMarkdown(bio)
  assert.match(markdown, /### Draft for owner approval \(fa\)/)
  assert.match(markdown, /### Draft for owner approval \(tr\)/)
  assert.match(markdown, /### Sources/)
  assert.match(markdown, /Untranslated, left out: `personal\.positioning\.known_for` \(written in Persian; no approved en translation\)/)
  assert.match(markdown, /Length: The fa draft is \d+ words/)
})

test('the public edition composes only published facts; other packs get drafts too', () => {
  const { engine } = seeded()
  const bio = buildNamedDocument(engine, 'professional-bio', 'public')
  assert.ok(bio.sections.flatMap((section) => section.drafts ?? []).every((draft) => draft.text === ''), 'nothing is published, so nothing is composed')
  const linkedin = buildNamedDocument(engine, 'linkedin-pack', 'internal')
  const headline = draftOf(linkedin, 'headline', 'tr')
  assert.match(headline.text, /^Ürün stratejisi danışmanı \| Atölye sunucusu\./, 'the companion in the section gives its tr form once')
  assert.equal((headline.text.match(/Ürün stratejisi/g) ?? []).length, 1)
})

test('draft_personal_content returns the same composed drafts, read through the caller gate', () => {
  const { engine } = seeded()
  const result = draftPersonalContent(engine, 'professional-bio', agentTokenContext(SLUG, 'tok-m', 'marketing'), 'short')
  assert.equal(result.status, 'draft')
  const section = (result.data as { sections: Array<{ composed: ComposedDraft[] }> }).sections[0]!
  const doc = buildNamedDocument(engine, 'professional-bio', 'internal').sections.find((item) => item.id === 'short')!
  assert.deepEqual(
    section.composed.map((draft) => [draft.locale, draft.text]),
    doc.drafts!.map((draft) => [draft.locale, draft.text]),
  )
  assert.ok(!(result.data as { missing: string[] }).missing.includes('personal.identity.localized_headline'), 'a companion is not reported as a gap of the deliverable')
})

test('a structured answer stays a Source and is never put into prose', () => {
  const drafts = composeDrafts(
    [
      { id: 'personal.identity.public_name', label: 'Name', value: NAME },
      { id: 'personal.experience.relationships', label: 'Relationships', value: 'advised | Example Labs | 2022 | present', structured: true },
    ],
    {},
    ['en'],
  )
  assert.equal(drafts[0]?.text, `${NAME}.`)
  assert.deepEqual(drafts[0]?.not_composed, ['personal.experience.relationships'])
})

test('the Publishing gallery lists the personal documents of a personal brand with audience × readiness', () => {
  const { engine } = seeded()
  const gallery = buildPublishingGallery(engine, {})
  const personalTypes = gallery.document_types.filter((type) => (PERSONAL_PUBLISHING_TYPES as readonly string[]).includes(type))
  // Nine apply without the speaker-author facet.
  assert.deepEqual(personalTypes, PERSONAL_PUBLISHING_TYPES.filter((type) => type !== 'speaker_kit'))
  const cell = (type: string, profile: string) => gallery.cells.find((item) => item.document_type === type && item.profile === profile)!
  assert.equal(cell('professional_bio', 'investor').readiness, 'blocked', 'no investor edition of a person')
  assert.equal(cell('evidence_register', 'public').readiness, 'blocked', 'the evidence register is internal only')
  assert.equal(cell('content_strategy', 'public').readiness, 'blocked')
  assert.equal(cell('professional_bio', 'public').readiness, 'empty', 'nothing published yet')
  assert.ok(['ready', 'partial'].includes(cell('professional_bio', 'internal').readiness))
  assert.ok(cell('professional_bio', 'internal').shown >= 3)
  assert.equal(cell('professional_bio', 'internal').export, 'command')
  assert.equal(publishingExportCommand('professional_bio', 'public'), 'npm run brand:document -- --type professional-bio --audience public')
  assert.equal(publishingExportCommand('evidence_register', 'public'), null)
  assert.ok(!JSON.stringify(gallery).includes(KNOWN_FOR_FA), 'the gallery carries counts, never values')

  // A business brand keeps the seven types.
  const business = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-business-'))
  writeStarterWorkspace(business)
  applyInit(business, { name: 'Example Co', slug: 'example-co', industry: 'education', language: 'en', languages: ['en'], mascot: false, gamification: false, publish: 'private' })
  assert.deepEqual(buildPublishingGallery(new InterviewEngine(business), {}).document_types, [...PUBLISHING_DOCUMENT_TYPES])
})
