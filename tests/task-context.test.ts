import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import Ajv from 'ajv'
import {
  accessLogPath,
  agentTokenContext,
  allQuestions,
  approveTokens,
  buildTaskContext,
  classifyTask,
  generateTokens,
  guestContext,
  InterviewEngine,
  operatorContext,
  readAccessLog,
  TASK_RECIPES,
  TASK_TYPES,
  taskFields,
  verifyPack,
  type AuthContext,
  type TaskContextPack,
  type TaskContextResult,
  type TaskType,
} from '@brand-os/brand-core'
import { approveRevision, proposeRevision } from '@brand-os/brand-core/strategy'
import { approveFacts, AUDIENCE, BUDGET_FACT_CANARY, contentBrand, PROMISE, VOICE, type ContentBrand } from './helpers/content.js'
import { brandDir, listTree, useTestKey } from './helpers/knowledge.js'
import { adsProposal, BUDGET_CANARY, DRAFT_CANARY, RESTRICTED_NOTE_CANARY } from './helpers/strategy.js'

/**
 * Task Context Engine, Slice 1 (core + CLI). What is checked here, against the acceptance matrix in
 * `../../brand-os-template-notes/task-context-v1/tests/03-ACCEPTANCE-MATRIX.md`:
 *
 * - the field map names only existing FieldQuestion ids (the bug `get_logo_rules` had; see tests/named-tool-ids.test.ts);
 * - one call returns audience, voice, positioning, tokens, asset refs and source revisions when they are approved;
 * - example assets and unapproved tokens are never substituted (CTX-002);
 * - a ten-post request creates no calendar week and nothing else on disk (CTX-003);
 * - profiles stay isolated: no paid strategy for a design token (CTX-007), served for an ads token (CTX-008);
 * - the restricted budget canary never appears in a pack or in the access log (CTX-009);
 * - cross-brand, guest and owner-process callers are denied (CTX-010, CTX-011);
 * - forged brand_id / role / include_unapproved / token / budget arguments change nothing (CTX-012);
 * - en, fa and tr requests share source refs and never translate an approved sentence (CTX-019);
 * - the same query gives the same digest (CTX-020);
 * - every pack validates against `schemas/task-context.schema.json`.
 *
 * Fixtures are SYNTHETIC DEMO data in temporary directories. No real brand fact, strategy or asset is touched.
 */
useTestKey()

const repo = path.resolve(import.meta.dirname, '..')
const CANARIES = [BUDGET_FACT_CANARY, String(BUDGET_CANARY), RESTRICTED_NOTE_CANARY, DRAFT_CANARY, 'business.marketing.budget', 'approval-secret', 'example-wordmark', 'EXAMPLE-ONLY']

const ctxOf = (profile: Parameters<typeof agentTokenContext>[2], brand = 'pilito'): AuthContext => agentTokenContext(brand, `agt_${profile}`, profile)

function validator() {
  const schema = JSON.parse(fs.readFileSync(path.join(repo, 'schemas/task-context.schema.json'), 'utf8')) as object
  return new Ajv({ allErrors: true, strict: false }).compile(schema)
}
const validate = validator()

function pack(result: TaskContextResult, label: string): TaskContextPack {
  assert.equal(result.status, 'ok', `${label}: ${result.reason ?? ''}`)
  assert.ok(result.data, `${label}: pack`)
  const data = result.data
  assert.ok(validate(data) as boolean, `${label}: ${JSON.stringify(validate.errors)}`)
  assert.deepEqual(data.authorizes, [])
  assert.deepEqual(data.permissions, { publish: false, schedule: false, spend: false, deploy: false })
  assert.ok(verifyPack(data), `${label}: digest verifies`)
  noCanary(data, label)
  return data
}

function noCanary(value: unknown, label: string): void {
  const json = JSON.stringify(value)
  for (const canary of CANARIES) assert.ok(!json.includes(canary), `${label}: ${canary} must not appear`)
}

function items(data: TaskContextPack, key: string) {
  return Object.values(data.sections).flat().filter((item) => item.key === key)
}
const strategyValue = (data: TaskContextPack): unknown => items(data, 'strategy.content')[0]?.value
const approvedValues = (data: TaskContextPack, key: string): string[] => items(data, key).filter((item) => item.state === 'approved').map((item) => String(item.value))
const gap = (data: TaskContextPack, id: string) => data.missing.find((entry) => entry.id === id)

/** The fixture brand: approved voice, audience, promise, offer, claims and an approved content strategy. */
async function brand(slug = 'pilito'): Promise<ContentBrand> {
  const s = await contentBrand(slug)
  approveFacts(s, [
    ['business.identity.trade_name', 'Pilito'],
    ['brand.strategy.purpose', 'Help adults speak a new language from day one.'],
    ['brand.logo.masters', 'brand/assets/logo in this repository, SVG masters, versioned.'],
    // An approved answer that says "not decided" is a gap, never a source (isPlaceholderValue).
    ['brand.motion.principles', 'TBD'],
  ])
  return s
}

test('the task field map names only existing question ids, and every recipe key resolves', async () => {
  const bank = new Set(allQuestions().map((question) => question.id))
  const fields = taskFields({ personal: true, mascot: true })
  for (const field of fields) {
    for (const id of field.fact_ids) assert.ok(bank.has(id), `${field.key}: ${id} is not a question id`)
  }
  // Keys a recipe may ask for: a field key, or one the resolver produces itself.
  const produced = ['tokens', 'mascot_artwork', 'creative_preferences', 'assets.logo', 'assets.icon', 'assets.mascot', 'assets.portrait', 'strategy.content', 'strategy.paid_media', 'strategy.seo']
  const known = new Set([...fields.map((field) => field.key), ...produced])
  for (const type of TASK_TYPES) {
    const recipe = TASK_RECIPES[type]
    for (const key of recipe.keys) assert.ok(known.has(key), `${type}: unknown key ${key}`)
    for (const requirement of recipe.requires) {
      for (const key of requirement.any_of) assert.ok(known.has(key), `${type}: requirement ${requirement.id} names unknown key ${key}`)
    }
  }
  // The ids the two legacy tools used to ask for (BUG-01, fixed; docs-internal/TASK_CONTEXT.md finding 1).
  for (const id of ['brand.logo.primary', 'brand.logo.clearspace', 'brand.motion.easing']) assert.ok(!bank.has(id), `${id} should still be absent`)
})

test('the classifier reads en, fa and tr requests and refuses to guess', () => {
  const cases: Array<[string, TaskType, number | null, string | null, string]> = [
    ['Design ten Instagram posts for our language learning app', 'social_batch', 10, 'instagram', 'en'],
    ['۱۰ پست اینستاگرام برای محصول بساز', 'social_batch', 10, 'instagram', 'fa'],
    ['برای برند ما یک طرح گرافیکی بساز', 'visual_design', 1, null, 'fa'],
    ['Bize bir görsel tasarla', 'visual_design', 1, null, 'tr'],
    ['Build our website', 'website_design', null, null, 'en'],
    ['Create an ad concept', 'paid_campaign_brief', 1, null, 'en'],
    ['Design a visual', 'visual_design', 1, null, 'en'],
    ['رزومه و صفحهٔ درباره من را بنویس', 'personal_content', null, null, 'fa'],
  ]
  for (const [request, type, count, channel, locale] of cases) {
    const intent = classifyTask(request)
    assert.equal(intent.status, 'ok', `${request}: ${JSON.stringify(intent)}`)
    if (intent.status !== 'ok') continue
    assert.equal(intent.task_type, type, request)
    assert.equal(intent.deliverable_count, count, request)
    assert.equal(intent.channel, channel, request)
    assert.equal(intent.locale, locale, request)
  }
  for (const vague of ['make something nice', 'help', 'یک چیز خوب بساز', '']) {
    assert.equal(classifyTask(vague).status, 'need_task_type', vague)
  }
  // Two task nouns with the same weight is a question for the user, not a coin flip.
  const tie = classifyTask('Design a website UI')
  assert.equal(tie.status, 'need_task_type')
  if (tie.status === 'need_task_type') {
    assert.equal(tie.reason, 'ambiguous')
    assert.deepEqual(tie.candidates, ['website_design', 'product_ui'])
  }
  // 1000 characters of brand prose with one icon word do not turn into a context dump or a crash.
  const long = `${'brand prose '.repeat(200)} icon`
  assert.equal(classifyTask(long).status, 'need_task_type')
})

test('one visual_design call returns identity, voice, tokens, source revisions and precise gaps', async () => {
  const s = await brand('pilito-visual')
  const ctx = ctxOf('internal-read', 'pilito-visual')
  const before = pack(buildTaskContext(s.engine, ctx, { task_type: 'visual_design' }), 'no tokens')
  // CTX-002: the template's EXAMPLE palette is not approved, and the EXAMPLE wordmark is a draft asset.
  assert.equal(gap(before, 'tokens')?.reason, 'not_approved')
  assert.equal(gap(before, 'assets.logo')?.reason, 'asset_missing')
  assert.ok(!JSON.stringify(before).includes('asset.logo.example-wordmark'))

  // The real owner path, in a temporary fixture with SYNTHETIC DEMO values: approve a colour answer, generate the
  // draft tokens from it, then hash-approve two of them. An EXAMPLE base value can never be approved.
  fs.cpSync(path.join(repo, 'brand/tokens'), path.join(s.root, 'brand/tokens'), { recursive: true })
  approveFacts(s, [['brand.color.roles', 'primary #0B2A55; onPrimary #FFFFFF']])
  const generated = generateTokens(s.root, 'pilito-visual')
  assert.equal(generated.ok, true, generated.note)
  const ids = generated.tokens.map((token) => token.id)
  assert.ok(ids.includes('color.brand.primary'), JSON.stringify(ids))
  const approved = approveTokens(s.root, ids.slice(0, 2), s.proof)
  assert.equal(approved.proof, 'accepted')
  assert.ok(approved.changed > 0, JSON.stringify(approved.results))

  const data = pack(buildTaskContext(s.engine, ctx, { task_type: 'visual_design', locale: 'en' }), 'visual_design')
  assert.deepEqual(approvedValues(data, 'brand_name'), ['Pilito'])
  assert.deepEqual(approvedValues(data, 'audience'), [AUDIENCE])
  assert.ok(approvedValues(data, 'voice').includes(VOICE))
  assert.ok(approvedValues(data, 'positioning').includes(PROMISE))
  assert.ok(items(data, 'tokens').length >= 2, 'approved tokens')
  for (const item of items(data, 'tokens')) {
    assert.equal(item.state, 'approved')
    assert.match(String(item.source_revision), /^[0-9a-f]{16,64}$/)
  }
  // Every approved item cites its own source, and every source id appears in sources[].
  const sources = new Set(data.sources.map((source) => source.id))
  for (const item of Object.values(data.sections).flat()) {
    if (item.state !== 'approved') continue
    assert.ok(item.source_id, `${item.key} has a source`)
    assert.ok(sources.has(String(item.source_id)), `${item.key}: ${String(item.source_id)} in sources`)
  }
  assert.ok(data.sources.some((source) => source.id === 'brand.verbal.voice' && source.revision !== null && source.status === 'approved'))
  // A banned claim from the approved facts becomes a guardrail; the fixed notice is there too.
  assert.ok(data.guardrails.some((line) => line.includes('Guaranteed fluency')), JSON.stringify(data.guardrails))
  assert.ok(data.guardrails.some((line) => line.includes('authorizes nothing')))
  assert.equal(gap(data, 'motion_rules')?.reason, 'owner_decision', 'an approved TBD is a gap')
  assert.equal(data.readiness, 'ready')
  assert.equal(data.staleness, 'current')
})

test('a ten-post request is an on-demand draft brief and writes nothing', async () => {
  const s = await brand('pilito-social')
  const ctx = ctxOf('content-read', 'pilito-social')
  const before = listTree(path.join(s.root, 'brand')).filter((file) => !file.includes('access-log'))
  const data = pack(buildTaskContext(s.engine, ctx, { task_type: 'social_batch', deliverable_count: 10, channel: 'instagram' }), 'social_batch')
  const after = listTree(path.join(s.root, 'brand')).filter((file) => !file.includes('access-log'))
  // CTX-003: no calendar week, no approval, no file of any kind is created by reading context.
  assert.deepEqual(after, before)
  assert.equal(data.task.deliverable_count, 10)
  assert.equal(data.task.channel, 'instagram')
  assert.deepEqual(data.authorizes, [])
  assert.ok(data.guardrails.some((line) => line.includes('on-demand request')), 'the on-demand rule is stated')
  for (const item of Object.values(data.sections).flat()) {
    assert.doesNotMatch(item.key, /calendar|slot|week/, `no calendar slot is served yet: ${item.key}`)
  }
  assert.equal((strategyValue(data) as { slots?: unknown }).slots, undefined, 'no calendar week is referenced')
  // The approved content strategy is cited with its own hash; the restricted block is only named.
  const strategy = items(data, 'strategy.content')
  assert.equal(strategy.length, 1)
  assert.equal(strategy[0]?.source_id, 'strategy:content-main')
  assert.equal(strategy[0]?.source_revision, s.strategySha)
  assert.ok(approvedValues(data, 'pillars').some((value) => value.includes('Learning stories')))
  assert.equal(data.readiness, 'ready')
})

test('profiles stay isolated: a design token gets no paid strategy, an ads token does', async () => {
  const s = await brand('pilito-paid')
  const ads = proposeRevision(s.ws, { strategy_id: 'ads-main', proposal: adsProposal(s.research) }).revision
  approveRevision(s.ws, { strategy_id: 'ads-main', revision: ads.revision, expected_sha256: ads.content_sha256, proof: s.proof })

  // CTX-007: the design profile reads no business facts and no strategy at all.
  const design = pack(buildTaskContext(s.engine, ctxOf('design', 'pilito-paid'), { task_type: 'paid_campaign_brief' }), 'paid under design')
  assert.equal(gap(design, 'strategy.paid_media')?.reason, 'not_authorized')
  assert.equal(items(design, 'strategy.paid_media')[0]?.state, 'withheld')
  assert.equal(approvedValues(design, 'audience').length, 0, 'business.customer is not a design module')
  assert.ok(design.redacted.includes('facts.not_authorized'))
  assert.ok(design.guardrails.some((line) => line.includes('not readable with this token')))
  assert.notEqual(design.readiness, 'ready')
  // It is still useful: the brand it may read is there, and the gaps name the question ids.
  assert.ok(approvedValues(design, 'purpose').length === 1)
  assert.equal(gap(design, 'audience')?.suggested_question_id, 'business.customer.primary_segment')

  // CTX-008: the ads profile reads the approved paid_media revision and still may not spend.
  const data = pack(buildTaskContext(s.engine, ctxOf('strategy-ads-read', 'pilito-paid'), { task_type: 'paid_campaign_brief', deliverable_count: 3 }), 'paid under ads')
  const strategy = items(data, 'strategy.paid_media')
  assert.equal(strategy.length, 1)
  assert.equal(strategy[0]?.source_revision, ads.content_sha256)
  assert.equal((strategy[0]?.value as { status: string }).status, 'current')
  assert.ok(data.redacted.includes('strategy:ads-main.restricted.budget'), JSON.stringify(data.redacted))
  assert.equal(data.permissions.spend, false)
  // The content strategy of the same brand is not reachable from an ads token.
  assert.equal(items(data, 'strategy.content').length, 0)
  const content = pack(buildTaskContext(s.engine, ctxOf('strategy-ads-read', 'pilito-paid'), { task_type: 'social_batch' }), 'social under ads')
  assert.equal(gap(content, 'strategy.content')?.reason, 'not_authorized')
})

test('the restricted canary stays out of the pack and out of the log', async () => {
  const s = await brand('pilito-canary')
  for (const type of TASK_TYPES.filter((item) => item !== 'personal_content')) {
    for (const profile of ['internal-read', 'design', 'marketing', 'content-read', 'strategy-ads-read', 'creative-read'] as const) {
      const result = buildTaskContext(s.engine, ctxOf(profile, 'pilito-canary'), { task_type: type, scope_id: 'launch' })
      if (result.status === 'ok') pack(result, `${type}/${profile}`)
      else noCanary(result, `${type}/${profile}`)
    }
  }
  // CTX-009: the log keeps ids and decisions, never values, and never the restricted field.
  const lines = readAccessLog(s.root).filter((line) => line.tool === 'task_context')
  assert.ok(lines.length >= 6)
  noCanary(lines, 'access log')
  for (const line of lines) {
    assert.equal(line.query_sha256, null, 'no request text, not even a hash')
    assert.ok(['allow', 'deny'].includes(line.decision))
  }
  assert.ok(fs.existsSync(accessLogPath(s.root)))
})

test('guest, owner process and cross-brand callers are denied without metadata', async () => {
  const s = await brand('pilito-denied')
  for (const [label, ctx] of [
    ['guest', guestContext('pilito-denied')],
    ['owner process', operatorContext('pilito-denied')],
    ['another brand', ctxOf('internal-read', 'other-brand')],
  ] as Array<[string, AuthContext]>) {
    const result = buildTaskContext(s.engine, ctx, { task_type: 'visual_design' })
    assert.equal(result.status, 'denied', label)
    assert.equal(result.data, null, label)
    assert.deepEqual(result.authorizes, [], label)
    noCanary(result, label)
  }
  assert.equal(buildTaskContext(s.engine, ctxOf('internal-read', 'other-brand'), { task_type: 'visual_design' }).reason, 'cross-brand')
  const denials = readAccessLog(s.root).filter((line) => line.tool === 'task_context' && line.decision === 'deny')
  assert.ok(denials.length >= 2, 'denials are logged')
})

test('forged privilege arguments and bad values change nothing', async () => {
  const s = await brand('pilito-forged')
  const ctx = ctxOf('design', 'pilito-forged')
  const clean = pack(buildTaskContext(s.engine, ctx, { task_type: 'visual_design' }), 'clean')
  const forged = pack(
    buildTaskContext(s.engine, ctx, {
      task_type: 'visual_design',
      brand_id: 'other-brand',
      role: 'owner',
      profile: 'internal-read',
      audience: 'restricted',
      include_unapproved: true,
      token: 'bos_forged',
      budget: 999_999,
      scopes: ['restricted'],
    } as never),
    'forged',
  )
  assert.equal(forged.digests.context_sha256, clean.digests.context_sha256, 'extra arguments are not read at all')
  assert.equal(forged.brand_id, 'pilito-forged')
  for (const bad of [{ task_type: 'root' }, { task_type: 'visual_design', locale: 'de' }, { task_type: 'visual_design', deliverable_count: 500 }, { task_type: 'visual_design', scope_id: '../../etc' }, {}] as const) {
    const result = buildTaskContext(s.engine, ctx, bad)
    assert.equal(result.status, 'invalid', JSON.stringify(bad))
    assert.equal(result.data, null)
  }
})

test('en, fa and tr share the sources and never translate an approved sentence', async () => {
  const s = await brand('pilito-locale')
  const ctx = ctxOf('content-read', 'pilito-locale')
  const packs = (['en', 'fa', 'tr'] as const).map((locale) => pack(buildTaskContext(s.engine, ctx, { task_type: 'social_batch', locale, deliverable_count: 10 }), locale))
  const [en, fa, tr] = packs as [TaskContextPack, TaskContextPack, TaskContextPack]
  assert.deepEqual(fa.sources, en.sources)
  assert.deepEqual(tr.sources, en.sources)
  assert.deepEqual(fa.missing, en.missing)
  for (const data of packs) assert.ok(approvedValues(data, 'voice').includes(VOICE), 'the approved sentence is byte-identical')
  assert.notDeepEqual(fa.guardrails, en.guardrails)
  assert.ok(fa.guardrails.some((line) => line.includes('اجازه')), 'the Persian notice is localized')
  assert.ok(tr.guardrails.some((line) => line.includes('salt okunur')), 'the Turkish notice is localized')
  // CTX-020: same query, same digest; a different locale is a different query.
  const again = pack(buildTaskContext(s.engine, ctx, { task_type: 'social_batch', locale: 'en', deliverable_count: 10 }), 'repeat')
  assert.equal(again.digests.context_sha256, en.digests.context_sha256)
  assert.notEqual(fa.digests.context_sha256, en.digests.context_sha256)
})

test('a brand with no readable identity is blocked, and a person task needs the personal module', async () => {
  // A brand that has answered nothing: no name, no purpose, no positioning. The pack says so instead of drafting
  // from an EXAMPLE value, and the gaps carry the question ids the owner should answer first.
  const empty = new InterviewEngine(brandDir({ slug: 'pilito-empty' }))
  const blocked = pack(buildTaskContext(empty, ctxOf('internal-read', 'pilito-empty'), { task_type: 'visual_design' }), 'empty brand')
  assert.equal(blocked.readiness, 'blocked')
  for (const key of ['brand_name', 'purpose', 'positioning']) assert.equal(gap(blocked, key)?.blocking, true, key)
  assert.equal(gap(blocked, 'audience')?.blocking, false, 'a non-blocking gap stays non-blocking')
  assert.equal(approvedValues(blocked, 'voice').length, 0)
  assert.equal(Object.values(blocked.sections).flat().filter((item) => item.state === 'approved').length, 0)
  // personal_content on a company brand: not applicable, and nothing is substituted for a person.
  const s = await brand('pilito-blocked')
  const personal = buildTaskContext(s.engine, ctxOf('internal-read', 'pilito-blocked'), { task_type: 'personal_content' })
  assert.equal(personal.status, 'not_applicable')
  assert.equal(personal.data, null)
  assert.match(String(personal.reason), /personal module/)
})

test('scoped creative preferences need the creative-read profile and a scope', async () => {
  const s = await brand('pilito-creative')
  // CTX-016: with a scope but the wrong profile, nothing is applied and the gap says why.
  const wrong = pack(buildTaskContext(s.engine, ctxOf('design', 'pilito-creative'), { task_type: 'visual_design', scope_id: 'launch' }), 'design + scope')
  assert.equal(gap(wrong, 'creative_preferences')?.reason, 'not_authorized')
  // With the right profile but no stored preference for that scope: an explicit gap, never a borrowed preference.
  const right = pack(buildTaskContext(s.engine, ctxOf('creative-read', 'pilito-creative'), { task_type: 'visual_design', scope_id: 'launch' }), 'creative-read + scope')
  assert.equal(gap(right, 'creative_preferences')?.reason, 'not_approved')
  // Without a scope the engine does not ask for preferences at all.
  const none = pack(buildTaskContext(s.engine, ctxOf('creative-read', 'pilito-creative'), { task_type: 'visual_design' }), 'creative-read, no scope')
  assert.equal(items(none, 'creative_preferences').length, 0)
  assert.equal(gap(none, 'creative_preferences'), undefined)
})

test('every task type produces a bounded, schema-valid pack', async () => {
  const s = await brand('pilito-all')
  for (const type of TASK_TYPES.filter((item) => item !== 'personal_content')) {
    const data = pack(buildTaskContext(s.engine, ctxOf('internal-read', 'pilito-all'), { task_type: type }), type)
    const count = Object.values(data.sections).flat().length
    assert.ok(count > 4 && count < 120, `${type}: ${count} items is not a bounded brief`)
    assert.ok(JSON.stringify(data).length < 120_000, `${type}: pack size`)
    assert.equal(data.task.type, type)
    for (const entry of data.missing) {
      if (entry.suggested_question_id === null) continue
      assert.match(entry.suggested_question_id, /^(?:brand|business|personal)\./, `${type}: ${entry.id}`)
    }
  }
})
