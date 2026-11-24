import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { parse, stringify } from 'yaml'
import {
  allQuestions,
  applyInit,
  InterviewEngine,
  migrateBrand,
  nextReport,
  questionHelp,
  questionTextDrift,
  tokenCssBuildNote,
  validateRepo,
  writeStarterWorkspace,
} from '@brand-os/brand-core'
import type { FieldQuestion } from '@brand-os/brand-core'

/** BOS-09 (localized help text and three clearer prompts) and BOS-13 (no token CSS warning in a normal validate). */
process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')

const repo = path.resolve(import.meta.dirname, '..')

test('BOS-09: every question has fa and tr help text, and every example keeps its EXAMPLE ONLY marker', () => {
  const questions = allQuestions()
  assert.ok(questions.length > 250)
  for (const question of questions) {
    for (const locale of ['fa', 'tr'] as const) {
      assert.ok(question.why_it_matters_i18n?.[locale]?.trim(), `${question.id} why_it_matters ${locale}`)
      assert.notEqual(question.why_it_matters_i18n?.[locale], question.why_it_matters, `${question.id} why_it_matters ${locale} is translated`)
      const examples = question.examples_i18n?.[locale] ?? []
      assert.equal(examples.length, question.examples.length, `${question.id} examples ${locale}`)
      for (const example of examples) assert.match(example, /^EXAMPLE ONLY: \S/, `${question.id} ${locale}`)
    }
    for (const example of question.examples) assert.match(example, /^EXAMPLE ONLY: \S/, question.id)
    if (question.why_it_matters_i18n?.fa) assert.match(question.why_it_matters_i18n.fa, /[؀-ۿ]/, `${question.id} fa is Persian`)
  }
})

test('BOS-09: the interview shows the locale help text and falls back to English', () => {
  const question = allQuestions().find((item) => item.id === 'personal.identity.headline')!
  assert.equal(questionHelp(question, 'en').why, question.why_it_matters)
  const fa = questionHelp(question, 'fa')
  assert.equal(fa.fellBack, false)
  assert.equal(fa.why, question.why_it_matters_i18n!.fa)
  assert.deepEqual(fa.examples, question.examples_i18n!.fa)
  const old: FieldQuestion = { ...question, why_it_matters_i18n: undefined, examples_i18n: undefined }
  const fallback = questionHelp(old, 'tr')
  assert.equal(fallback.fellBack, true)
  assert.equal(fallback.locale, 'en')
  assert.equal(fallback.why, question.why_it_matters)

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-help-'))
  writeStarterWorkspace(root)
  applyInit(root, { name: 'Alex Example', slug: 'alex-example', industry: 'consulting', language: 'en', languages: ['en', 'fa', 'tr'], mascot: false, gamification: false, publish: 'private', profile: 'personal-brand' })
  const engine = new InterviewEngine(root)
  const next = nextReport(engine, { locale: 'tr', limit: 1 })
  const first = engine.question(next.next[0]!.id)!
  assert.equal(next.next[0]!.help_locale, 'tr')
  assert.equal(next.next[0]!.why_it_matters, first.why_it_matters_i18n!.tr)
  assert.deepEqual(next.next[0]!.examples, first.examples_i18n!.tr)
})

test('BOS-09: three prompts are reworded in en, fa and tr', () => {
  const byId = new Map(allQuestions().map((question) => [question.id, question]))
  const templates = byId.get('personal.media.visual_templates')!.prompt
  assert.match(templates.en, /^Which templates should be built first\?/)
  assert.match(templates.fa, /اول ساخته شوند/)
  assert.match(templates.tr, /^Önce hangi şablonlar hazırlanmalı\?/)
  const kpis = byId.get('personal.goals.kpis')!.prompt
  assert.equal(kpis.en, 'For each goal, which number do you watch, and what is it today (with source and date)?')
  assert.match(kpis.fa, /برای هر هدف/)
  assert.match(kpis.tr, /^Her hedef için hangi sayıyı takip ediyorsunuz/)
  const voice = byId.get('brand.verbal.voice_pairs')!.prompt
  assert.match(voice.en, /in your own words/i)
  assert.match(voice.fa, /به زبان خودتان/)
  assert.match(voice.tr, /Kendi sözlerinizle/)
})

test('BOS-09: drift checks cover the prompt, why_it_matters and examples in all three locales; old banks stay valid', () => {
  const source = allQuestions().find((item) => item.id === 'personal.goals.kpis')!
  assert.deepEqual(questionTextDrift(source, source), { fields: [], missingHelpLocales: false })
  const drifted: FieldQuestion = {
    ...source,
    prompt: { ...source.prompt, tr: 'eski' },
    why_it_matters_i18n: { ...source.why_it_matters_i18n, fa: 'قدیمی' },
    examples_i18n: { ...source.examples_i18n, tr: ['EXAMPLE ONLY: eski'] },
  }
  assert.deepEqual(questionTextDrift(drifted, source).fields, ['prompt.tr', 'why_it_matters.fa', 'examples.tr'])
  const old: FieldQuestion = { ...source, why_it_matters_i18n: undefined, examples_i18n: undefined }
  assert.deepEqual(questionTextDrift(old, source), { fields: [], missingHelpLocales: true })

  // A copy of this repository with an old bank (no *_i18n fields, old prompt): validate reports drift and a warning,
  // and brand:migrate refreshes only the question text.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-drift-'))
  for (const dir of ['brand', 'schemas', 'packages/design-tokens/src']) fs.cpSync(path.join(repo, dir), path.join(root, dir), { recursive: true })
  const bankFile = path.join(root, 'brand', 'interview', 'question-bank', 'personal.yaml')
  const bank = parse(fs.readFileSync(bankFile, 'utf8')) as { questions: FieldQuestion[] }
  for (const question of bank.questions) {
    delete question.why_it_matters_i18n
    delete question.examples_i18n
    if (question.id === 'personal.goals.kpis') question.prompt = { ...question.prompt, fa: 'متن قدیمی' }
  }
  fs.writeFileSync(bankFile, stringify(bank))
  const before = validateRepo(root)
  assert.ok(before.errors.some((error) => error.startsWith('Prompt drift for personal.goals.kpis (prompt.fa)')), before.errors.join('\n'))
  assert.ok(before.warnings.some((warning) => /no Persian or Turkish help text/.test(warning)))
  migrateBrand(root)
  const after = validateRepo(root)
  assert.ok(!after.errors.some((error) => error.startsWith('Prompt drift')), after.errors.join('\n'))
  assert.ok(!after.warnings.some((warning) => /help text/.test(warning)))
})

test('BOS-13: a normal validate prints no token CSS warning; the docs build path carries the note', () => {
  const report = validateRepo(repo)
  assert.ok(!report.warnings.some((warning) => /token css/i.test(warning)), report.warnings.join('\n'))
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-css-'))
  assert.match(tokenCssBuildNote(empty) ?? '', /matters only for a docs build/)
  fs.mkdirSync(path.join(empty, 'packages', 'design-tokens', 'dist'), { recursive: true })
  fs.writeFileSync(path.join(empty, 'packages', 'design-tokens', 'dist', 'tokens.css'), ':root {}\n')
  assert.equal(tokenCssBuildNote(empty), null)
})
