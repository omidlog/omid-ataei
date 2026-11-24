import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { parse, stringify } from 'yaml'
import {
  addEvidence,
  agentTokenContext,
  AGENT_TOKEN_ENV,
  applyInit,
  buildNamedDocument,
  claimEvidence,
  claimVerification,
  draftPersonalContent,
  ensureApprovalSecret,
  evidencePath,
  InterviewEngine,
  isIndependentSource,
  locationsIn,
  ownedLocationsFrom,
  ownedMatch,
  readEvidence,
  renderDocumentMarkdown,
  writeStarterWorkspace,
} from '@brand-os/brand-core'
import type { DocumentItem, DocumentModel, EvidenceItem, InitInput } from '@brand-os/brand-core'
import { linkState } from '../packages/brand-core/src/assurance/links.js'
import { i18n } from '../apps/studio/src/i18n/index.js'
import { documentItem, verificationBadge } from '../apps/studio/src/views/components.js'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

/**
 * BOS-18 (owner-controlled sources and mixed claims) and BOS-10 (re-verifying is a no-op), with SYNTHETIC
 * data only: Alex Example, example domains, no network.
 */
process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')
const SLUG = 'alex-example'
const SITE = 'https://www.alex-example.example'
const VENTURE = 'sample-venture.example'
const KNOWN_FOR = 'personal.positioning.known_for'
const HIGHLIGHTS = 'personal.experience.highlights'

function brand(extra: Partial<InitInput> = {}): { root: string; engine: InterviewEngine; proof: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-evidence-owned-'))
  writeStarterWorkspace(root)
  applyInit(root, { name: 'Alex Example', slug: SLUG, industry: 'consulting', language: 'en', languages: ['en', 'fa', 'tr'], mascot: false, gamification: false, publish: 'public', profile: 'personal-brand', ...extra })
  return { root, engine: new InterviewEngine(root), proof: ensureApprovalSecret(root) }
}

function answer(engine: InterviewEngine, id: string, value: string): void {
  const result = engine.answerQuestion(id, value)
  assert.equal(result.kind, 'recorded', result.message)
}

function approve(engine: InterviewEngine, proof: string, ids: string[]): void {
  const result = engine.approvals().approveBatch({ ids }, proof)
  assert.equal(result.approved, ids.length, JSON.stringify(result.results))
}

/** A personal brand whose own site and venture are approved facts. */
function ownedBrand() {
  const b = brand({ facets: ['founder-executive'] })
  answer(b.engine, 'personal.contact.public_channels', `${SITE}/contact; hello@alex-example.example`)
  answer(b.engine, 'personal.experience.relationships', `founded | Sample Venture (${VENTURE}) | 2019 | present; employed | Example Corp (corp.example) | 2015 | 2018`)
  answer(b.engine, KNOWN_FOR, 'Helping SYNTHETIC teams plan launches')
  answer(b.engine, HIGHLIGHTS, 'Interviewed by Example News; worked with 120+ example teams')
  approve(b.engine, b.proof, ['personal.contact.public_channels', 'personal.experience.relationships', KNOWN_FOR, HIGHLIGHTS])
  return b
}

function items(model: DocumentModel): DocumentItem[] {
  return model.sections.flatMap((section) => section.items)
}

function cli(root: string, args: string[], env: Record<string, string | undefined> = {}) {
  const merged: Record<string, string | undefined> = { ...process.env, ...env }
  delete merged[AGENT_TOKEN_ENV]
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key]
  return spawnSync(NODE, tsxArgs(path.join('scripts', 'brand.ts'), args), { cwd: root, encoding: 'utf8', env: merged as NodeJS.ProcessEnv, input: '' })
}

test('owned locations: own domains and subdomains, platform profiles by path, never a shared platform or mail provider', () => {
  const locations = ownedLocationsFrom({
    'personal.contact.public_channels': `${SITE}/contact; work@alex-example.example; someone@gmail.com; https://linkedin.com/in/alex-example`,
    'personal.experience.relationships': `founded | Sample Venture (${VENTURE}) | 2019 | present | ownership: unstated; employed | Example Corp (corp.example) | 2015 | 2018 | ownership: not-owner; advised | Owned Labs (owned-labs.example) | 2020 | present | ownership: co-owner`,
    'personal.content.channels': 'Website: inquiries. YouTube: https://www.youtube.com',
  })
  const hosts = locations.map((entry) => `${entry.host}${entry.path ?? ''}`).sort()
  assert.deepEqual(hosts, ['alex-example.example', 'linkedin.com/in/alex-example', 'owned-labs.example', VENTURE].sort())
  assert.ok(ownedMatch('https://alex-example.example/about', locations), 'the owner site')
  assert.ok(ownedMatch('https://blog.alex-example.example/post', locations), 'a subdomain of the owner site')
  assert.ok(ownedMatch(`see ${VENTURE}/team`, locations), 'a bare domain of a founded venture')
  assert.ok(ownedMatch('https://www.linkedin.com/in/alex-example/recent-activity', locations), 'the owner profile on a platform')
  assert.equal(ownedMatch('https://www.linkedin.com/in/someone-else', locations), null, 'another person on the same platform')
  assert.equal(ownedMatch('https://corp.example/news', locations), null, 'an employer is not a venture the owner founded or owns')
  assert.equal(ownedMatch('https://news.example.org/interview', locations), null)
  assert.equal(ownedMatch('Signed letter, held offline', locations), null)
  assert.deepEqual(locationsIn('someone@gmail.com', 'x'), [], 'a public mail provider never names an owned domain')
  assert.equal(isIndependentSource({ kind: 'verification', source_type: 'link', owned: true }), false)
  assert.equal(isIndependentSource({ kind: 'verification', source_type: 'link' }), true)
})

test('BOS-18: a claim backed only by the owner site is owner-published everywhere, never verified', () => {
  const { root, engine, proof } = ownedBrand()
  // Recorded without --owned: the reference is on the brand's own domain, so it is inferred.
  const site = addEvidence(root, engine.questions(), { claim_id: KNOWN_FOR, kind: 'verification', source_type: 'link', reference: `${SITE}/about` })
  assert.equal(site.owned, true)
  assert.equal(engine.approvals().reviewEvidence(site.id, 'verified', proof).message.includes('owner-published'), true)
  const question = engine.question(KNOWN_FOR)!
  const now = new Date()
  assert.equal(claimVerification(question, readEvidence(root), now), 'owner_published')

  // Documents (internal and Markdown).
  const bio = buildNamedDocument(engine, 'professional-bio', 'internal')
  const item = items(bio).find((entry) => entry.id === KNOWN_FOR)!
  assert.equal(item.verification, 'owner_published')
  assert.match(item.note ?? '', /Owner-published\. Not independently verified/)
  assert.doesNotMatch(item.note ?? '', /Verified by an independent/)
  assert.ok(item.source_ids.includes(`evidence:${site.id}`))
  assert.match(renderDocumentMarkdown(bio), /Owner-published/)

  // Studio, in every locale.
  for (const [locale, label] of [['en', 'Owner-published'], ['fa', 'منتشرشده توسط خود مالک'], ['tr', 'Sahibi tarafından yayımlandı']] as const) {
    const badge = String(verificationBadge(i18n(locale), 'owner_published'))
    assert.ok(badge.includes(label), `${locale}: ${badge}`)
    assert.doesNotMatch(badge, /success/)
  }
  const rendered = String(documentItem(i18n('en'), item))
  assert.match(rendered, /Owner-published/)
  assert.doesNotMatch(rendered, />Verified</)

  // Agents drafting content get the same label.
  const draft = draftPersonalContent(engine, 'professional-bio', agentTokenContext(SLUG, 'tok-i', 'internal-read'))
  const facts = (draft.data as { sections: Array<{ facts: Array<{ id: string; verification: string }> }> }).sections.flatMap((section) => section.facts)
  assert.equal(facts.find((fact) => fact.id === KNOWN_FOR)?.verification, 'owner_published')
  assert.ok((draft.data as { rules: string[] }).rules.some((rule) => /owner_published/.test(rule)))

  // Assurance: a link to an owner-controlled entry is never independent.
  const entry = readEvidence(root).find((candidate) => candidate.id === site.id)!
  const day = now.toISOString().slice(0, 10)
  assert.equal(linkState({ note_revision: 'r1' } as Parameters<typeof linkState>[0], { revision: 'r1', question_ids: [KNOWN_FOR] }, entry, day), 'not_independent')
})

test('BOS-18: the venture site counts as owner-published, and a legacy entry without the flag is inferred on read without a write', () => {
  const { root, engine } = ownedBrand()
  // A register written before the flag existed: no `owned` key.
  const legacy: Partial<EvidenceItem> = {
    id: 'ev-0001', claim_id: 'personal.founder.ventures', kind: 'verification', source_type: 'link', reference: `https://${VENTURE}/about`,
    quote: null, note: null, granted_by: null, scope: null, status: 'verified', recorded_at: '2026-01-01T00:00:00.000Z', recorded_by: 'owner',
    verified_at: '2026-01-02T00:00:00.000Z', verified_by: 'owner', review_due: null, status_reason: null,
  }
  fs.writeFileSync(evidencePath(root), stringify({ schema_version: 1, note: 'legacy', items: [legacy] }))
  const before = fs.readFileSync(evidencePath(root), 'utf8')
  const read = readEvidence(root)
  assert.equal(read[0]!.owned, true, 'inferred from the founded venture')
  assert.equal(fs.readFileSync(evidencePath(root), 'utf8'), before, 'reading never writes')
  assert.equal(claimVerification(engine.question('personal.founder.ventures')!, read, new Date()), 'owner_published')
  // Explicit --owned for a source the domains cannot reveal; testimony never carries the flag.
  const explicit = addEvidence(root, engine.questions(), { claim_id: KNOWN_FOR, kind: 'verification', source_type: 'document', reference: 'Company brochure, held offline', owned: true })
  assert.equal(explicit.owned, true)
  const testimony = addEvidence(root, engine.questions(), { claim_id: KNOWN_FOR, kind: 'verification', source_type: 'owner_testimony', reference: 'Owner statement', owned: true })
  assert.equal(testimony.owned, false)
  const stored = parse(fs.readFileSync(evidencePath(root), 'utf8')) as { items: Array<Record<string, unknown>> }
  assert.equal('owned' in stored.items[0]!, false, 'the legacy entry was not rewritten by adding another')
})

test('BOS-18: one independent item plus owner testimony is partly verified, with the owner-stated part named', () => {
  const { root, engine, proof } = ownedBrand()
  const press = addEvidence(root, engine.questions(), { claim_id: HIGHLIGHTS, kind: 'verification', source_type: 'third_party', reference: 'https://news.example.org/alex-interview' })
  const stated = addEvidence(root, engine.questions(), { claim_id: HIGHLIGHTS, kind: 'verification', source_type: 'owner_testimony', reference: 'Owner statement', quote: 'Worked with 120+ example teams' })
  engine.approvals().reviewEvidence(press.id, 'verified', proof)
  engine.approvals().reviewEvidence(stated.id, 'verified', proof)
  const question = engine.question(HIGHLIGHTS)!
  const summary = claimEvidence(question, readEvidence(root), new Date())
  assert.equal(summary.verification, 'partly_verified')
  assert.deepEqual(summary.owner_parts.map((entry) => entry.id), [stated.id])

  const kit = buildNamedDocument(engine, 'media-kit', 'internal')
  const item = items(kit).find((entry) => entry.id === HIGHLIGHTS)!
  assert.equal(item.verification, 'partly_verified')
  assert.match(item.note ?? '', /Partly verified/)
  assert.match(item.note ?? '', new RegExp(`Owner-stated part: ${stated.id} \\(owner testimony: Worked with 120\\+ example teams\\)`))
  assert.doesNotMatch(item.note ?? '', /Verified by an independent/)
  assert.ok(item.source_ids.includes(`evidence:${stated.id}`) && item.source_ids.includes(`evidence:${press.id}`))
  const register = buildNamedDocument(engine, 'evidence-register', 'internal')
  const claim = items(register).find((entry) => entry.id === HIGHLIGHTS)!
  assert.match(claim.note ?? '', new RegExp(`Owner-stated part, not independently verified: ${stated.id}`))

  for (const [locale, label] of [['en', 'Partly verified'], ['fa', 'بخشی تأییدشده'], ['tr', 'Kısmen doğrulandı']] as const) {
    const badge = String(verificationBadge(i18n(locale), 'partly_verified'))
    assert.ok(badge.includes(label), `${locale}: ${badge}`)
    assert.doesNotMatch(badge, /success/)
  }
  // The same claim with only the independent item is verified; an owner-published item makes it partly verified again.
  engine.approvals().withdrawEvidence(stated.id, 'test')
  assert.equal(claimVerification(question, readEvidence(root), new Date()), 'verified')
  addEvidence(root, engine.questions(), { claim_id: HIGHLIGHTS, kind: 'verification', source_type: 'link', reference: `${SITE}/clients` })
  assert.equal(claimVerification(question, readEvidence(root), new Date()), 'partly_verified')
})

test('BOS-10: verifying already verified evidence writes nothing and says so', () => {
  const { root, engine, proof } = ownedBrand()
  const press = addEvidence(root, engine.questions(), { claim_id: HIGHLIGHTS, kind: 'verification', source_type: 'third_party', reference: 'https://news.example.org/alex-interview' })
  assert.equal(engine.approvals().reviewEvidence(press.id, 'verified', proof).ok, true)
  const before = fs.readFileSync(evidencePath(root), 'utf8')
  const again = engine.approvals().reviewEvidence(press.id, 'verified', proof)
  assert.equal(again.ok, true)
  assert.equal(again.unchanged, true)
  assert.match(again.message, /already verified/)
  assert.equal(fs.readFileSync(evidencePath(root), 'utf8'), before)
  // The proof is still required, and a different decision still applies.
  assert.equal(engine.approvals().reviewEvidence(press.id, 'verified', 'wrong').ok, false)
  assert.equal(engine.approvals().reviewEvidence(press.id, 'rejected', proof).unchanged, undefined)
  assert.equal(readEvidence(root)[0]!.status, 'rejected')
})

test('BOS-10 and BOS-18 through the CLI: several ids with one proof, a no-op re-run, and --owned', () => {
  const { root, engine, proof } = ownedBrand()
  const a = addEvidence(root, engine.questions(), { claim_id: HIGHLIGHTS, kind: 'verification', source_type: 'third_party', reference: 'https://news.example.org/a' })
  const b = addEvidence(root, engine.questions(), { claim_id: HIGHLIGHTS, kind: 'verification', source_type: 'public_record', reference: 'https://registry.example.org/b' })
  const env = { BRAND_OS_APPROVAL_PROOF: proof }
  const first = cli(root, ['evidence', 'verify', '--id', `${a.id},${b.id}`], env)
  assert.equal(first.status, 0, first.stderr)
  assert.match(first.stdout, new RegExp(`${a.id} verified`))
  assert.match(first.stdout, new RegExp(`${b.id} verified`))
  const before = fs.readFileSync(evidencePath(root), 'utf8')
  const second = cli(root, ['evidence', 'verify', '--ids', `${a.id},${b.id}`], env)
  assert.equal(second.status, 0, second.stderr)
  assert.match(second.stdout, new RegExp(`${a.id} already verified`))
  assert.match(second.stdout, new RegExp(`${b.id} already verified`))
  assert.equal(fs.readFileSync(evidencePath(root), 'utf8'), before, 're-running leaves the register byte-identical')
  const unknown = cli(root, ['evidence', 'verify', '--id', `${a.id},ev-9999`], env)
  assert.equal(unknown.status, 1)
  assert.match(unknown.stdout, /already verified/)
  assert.match(unknown.stderr, /ev-9999: No evidence ev-9999/)

  const owned = cli(root, ['evidence', 'add', '--claim', KNOWN_FOR, '--source', 'document', '--reference', 'Brochure held offline', '--owned'])
  assert.equal(owned.status, 0, owned.stderr)
  assert.match(owned.stdout, /owner-published/)
  const inferred = cli(root, ['evidence', 'add', '--claim', KNOWN_FOR, '--source', 'link', '--reference', `${SITE}/about`])
  assert.match(inferred.stdout, /brand's own domains/)
  const stored = (parse(fs.readFileSync(evidencePath(root), 'utf8')) as { items: EvidenceItem[] }).items
  assert.deepEqual(stored.slice(-2).map((entry) => entry.owned), [true, true])
})
