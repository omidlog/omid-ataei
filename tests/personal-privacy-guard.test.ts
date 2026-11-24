import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { applyInit, ensureApprovalSecret, InterviewEngine, privateDataFindings, privateDataRefusal, writeStarterWorkspace } from '@brand-os/brand-core'

/**
 * BOS-05: privacy guard false positives. SYNTHETIC DEMO handles and values only (`sample.person`, `Alex Example`).
 * A profile URL or a handle is not an email, a privacy question may name a category of data, and a refusal says
 * which kind of pattern triggered it and where, never the value.
 */
process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')

function engine(): InterviewEngine {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-privacy-'))
  writeStarterWorkspace(root)
  applyInit(root, { name: 'Alex Example', slug: 'alex-example', industry: 'consulting', language: 'en', languages: ['en', 'fa', 'tr'], mascot: false, gamification: false, publish: 'private', profile: 'personal-brand' })
  ensureApprovalSecret(root)
  return new InterviewEngine(root)
}

const q = (id: string) => ({ id, contact_field: false })

test('BOS-05: social profile URLs with /@handle and bare handles are not email addresses', () => {
  const handles = [
    'https://www.tiktok.com/@sample.person',
    'https://medium.com/@sample.person',
    'https://www.youtube.com/@SamplePerson',
    'https://www.threads.net/@sample.person',
    'https://mastodon.social/@sample',
    '@sample@mastodon.social',
    '@sample.person',
    'TikTok (@sample.person) و یوتیوب https://www.youtube.com/@SamplePerson',
    'TikTok: https://www.tiktok.com/@sample.person ve Instagram @sample.person',
  ]
  for (const text of handles) assert.deepEqual(privateDataFindings(text), [], text)
  const recorded = engine().answerQuestion('personal.content.channels', `TikTok https://www.tiktok.com/@sample.person for short clips; Medium https://medium.com/@sample.person for essays.`)
  assert.equal(recorded.kind, 'recorded', recorded.message)
})

test('BOS-05: real email addresses are still refused outside the contact field, in any script', () => {
  for (const text of ['reach me at alex@example.com', 'ایمیل:alex@example.com', 'e-posta: alex.example@example.org', 'see https://example.com/?mail=alex@example.com']) {
    assert.deepEqual(privateDataFindings(text).map((item) => item.kind), ['email'], text)
  }
  assert.deepEqual(privateDataFindings('alex@example.com', { allowEmail: true }), [])
})

test('BOS-05: a personal.privacy.* answer may name categories of data in en, fa and tr', () => {
  const e = engine()
  const named = [
    'Family, health, and personal registry data such as date of birth, home address or national id.',
    'تاریخ تولد، آدرس منزل، کد ملی و شماره گذرنامه هرگز منتشر نشود.',
    'Doğum tarihi, ev adresi ve TC kimlik numarası asla yayımlanmasın.',
  ]
  for (const text of named) {
    assert.equal(privateDataRefusal(q('personal.privacy.never_publish'), text), null, text)
    const result = e.answerQuestion('personal.privacy.never_publish', text)
    assert.equal(result.kind, 'recorded', `${text}: ${result.message}`)
  }
  // Outside the privacy questions the same names are still refused: the guard errs on the side of refusing.
  for (const text of named) assert.ok(privateDataRefusal(q('personal.story.origin'), text), text)
})

test('BOS-05: a category name followed by a value is refused even in a privacy question (en, fa, tr)', () => {
  for (const text of ['Date of birth: 1990-01-01', 'home address: Example Street', 'تاریخ تولد ۱۳۶۹/۰۱/۰۱', 'kimlik numarası 12345678901', 'doğum tarihi = 01.01.1990']) {
    assert.ok(privateDataRefusal(q('personal.privacy.never_publish'), text), text)
  }
  // Phrases that state a value are refused wherever they appear.
  for (const text of ['I live at the corner of Example Road', 'متولد تهران هستم', 'Ev adresim burada', 'my kids are in school there', 'همسرم معلم است', 'Eşim öğretmen']) {
    assert.ok(privateDataRefusal(q('personal.privacy.boundaries'), text), text)
  }
})

test('BOS-05: the refusal names the pattern and its line and word, and never echoes the value', () => {
  const message = privateDataRefusal(q('personal.story.origin'), 'Line one is fine.\nWrite to alex@example.com any time')
  assert.ok(message)
  assert.match(message, /an email address outside a professional contact field \(a name@domain pattern in line 2, word 3\)/)
  assert.ok(!message.includes('alex') && !message.includes('example.com'))

  const phone = privateDataRefusal(q('personal.story.origin'), 'Call me on +90 532 000 11 22 any time')
  assert.ok(phone)
  assert.match(phone, /a phone number \(a run of seven or more digits in line 1, word 4\)/)
  assert.ok(!phone.includes('532'))

  const fa = privateDataRefusal(q('personal.privacy.never_publish'), 'موارد عمومی\nتاریخ تولد: ۱۳۶۹')
  assert.ok(fa)
  assert.match(fa, /a birth date \(a category name followed by a value in line 2, word 1\)/)
  assert.ok(!fa.includes('۱۳۶۹') && !fa.includes('1369'))

  const tr = privateDataRefusal(q('personal.story.origin'), 'Merhaba, ev adresim Örnek Sokak')
  assert.ok(tr)
  assert.match(tr, /a home address \(a phrase that introduces this kind of data in line 1, word 2\)/)
  assert.ok(!tr.includes('Örnek'))
})
