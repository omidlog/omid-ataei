import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { parse, stringify } from 'yaml'
import { applyInit, migrateBrand, writeStarterWorkspace } from '@brand-os/brand-core'

/**
 * A brand created before a template version added a question (here `brand.color.semantic_map`, BOS-17) keeps its own
 * question bank and profiles, because `brand/**` is brand-owned. `brand:migrate` must add the new question to the bank
 * and to the starter profiles that ask it, once, without touching anything the owner wrote. SYNTHETIC DEMO data only.
 */
process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')

const NEW_ID = 'brand.color.semantic_map'

function olderBrand(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-migrate-new-'))
  writeStarterWorkspace(root)
  applyInit(root, { name: 'Demo Person', slug: 'demo-person', industry: 'consulting', language: 'en', languages: ['en'], mascot: false, gamification: false, publish: 'private', profile: 'personal-brand', facets: ['consultant-expert'] } as Parameters<typeof applyInit>[1])
  // Remove the newer question from the bank and from both starter profiles, as an older brand repository has them.
  const bank = path.join(root, 'brand', 'interview', 'question-bank', 'brand.yaml')
  const doc = parse(fs.readFileSync(bank, 'utf8')) as { questions: Array<{ id: string }> }
  doc.questions = doc.questions.filter((question) => question.id !== NEW_ID)
  fs.writeFileSync(bank, stringify(doc))
  for (const profile of ['personal-brand', 'founder-core']) {
    const file = path.join(root, 'brand', 'interview', 'profiles', `${profile}.yaml`)
    fs.writeFileSync(file, `# owner note\n${fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== `- ${NEW_ID}`).join('\n')}`)
  }
  return root
}

test('brand:migrate adds a question a newer template introduced to the bank and the profiles, once', () => {
  const root = olderBrand()
  try {
    const ledger = fs.readFileSync(path.join(root, 'brand', 'interview', 'answer-ledger.yaml'), 'utf8')
    migrateBrand(root)
    const bank = parse(fs.readFileSync(path.join(root, 'brand', 'interview', 'question-bank', 'brand.yaml'), 'utf8')) as { questions: Array<{ id: string }> }
    assert.equal(bank.questions.filter((question) => question.id === NEW_ID).length, 1)
    for (const profile of ['personal-brand', 'founder-core']) {
      const text = fs.readFileSync(path.join(root, 'brand', 'interview', 'profiles', `${profile}.yaml`), 'utf8')
      assert.match(text, /# owner note/, `${profile}: the owner's text stays`)
      assert.ok((parse(text) as { question_ids: string[] }).question_ids.includes(NEW_ID), `${profile} asks the new question`)
      assert.ok(text.indexOf(NEW_ID) > text.indexOf('brand.color.roles'), `${profile}: placed after the colour roles`)
    }
    assert.equal(fs.readFileSync(path.join(root, 'brand', 'interview', 'answer-ledger.yaml'), 'utf8'), ledger, 'no answer changed')

    // A second run changes nothing.
    const snapshot = ['question-bank/brand.yaml', 'profiles/personal-brand.yaml', 'profiles/founder-core.yaml'].map((file) => fs.readFileSync(path.join(root, 'brand', 'interview', file), 'utf8'))
    migrateBrand(root)
    assert.deepEqual(['question-bank/brand.yaml', 'profiles/personal-brand.yaml', 'profiles/founder-core.yaml'].map((file) => fs.readFileSync(path.join(root, 'brand', 'interview', file), 'utf8')), snapshot)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
