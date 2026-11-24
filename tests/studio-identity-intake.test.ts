import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { parse } from 'yaml'
import { validateRequest } from '../apps/studio/src/provision.js'
import { Client, startStudio, type RunningStudio } from './helpers/studio-server.js'
import { harness, OWNER, provisioned, request } from './helpers/studio.js'

/**
 * Identity Slice A: the wizard's "logo today / intent / change depth" questions. The answers are an
 * unapproved owner hint written to onboarding.identity in brand.config.yaml, never a brand fact.
 */

const BASE = { name: 'Acme', slug: 'acme', profile: 'business', owner: OWNER, default_locale: 'en', locales: ['en'] }
const FORM = { name: 'Acme Learning', slug: 'acme-learning', profile: 'business', default_locale: 'en', locales: ['en'], owner: OWNER, repo: 'acme-learning' }

async function withStudio(fn: (s: RunningStudio, client: Client) => Promise<void>): Promise<void> {
  const s = await startStudio()
  try {
    const client = new Client(s.url)
    await client.login()
    await fn(s, client)
  } finally {
    await s.close()
  }
}

async function post(s: RunningStudio, client: Client, fields: Record<string, string | string[]>): Promise<Response> {
  const csrf = await client.csrf('/brands/new')
  const res = await client.request('POST', '/brands/new', { form: { _csrf: csrf, ...FORM, ...fields } })
  await s.studio.provisioning.settled()
  await s.studio.sync.settled()
  return res
}

function checked(text: string, field: string): string | null {
  const match = new RegExp(`<input type="radio" name="${field}" value="([a-z_]+)"[^>]*\\schecked[\\s>]`).exec(text)
  return match?.[1] ?? null
}

test('validateRequest: the five journeys, unknown defaults, cleared stale depth, refused contradictions', () => {
  const id = (fields: Record<string, unknown>) => validateRequest({ ...BASE, ...fields }, [OWNER])
  assert.deepEqual(id({}).request?.identity, { logo_presence: 'unknown', identity_intent: 'undecided', change_depth: null }, 'an old form or API call reads as unknown / undecided')
  assert.deepEqual(id({ logo_presence: 'absent', identity_intent: 'create' }).request?.identity, { logo_presence: 'absent', identity_intent: 'create', change_depth: null })
  assert.deepEqual(id({ logo_presence: 'present', identity_intent: 'retain' }).request?.identity, { logo_presence: 'present', identity_intent: 'retain', change_depth: null })
  assert.deepEqual(id({ logo_presence: 'present', identity_intent: 'evolve', change_depth: 'visual_refresh' }).request?.identity?.change_depth, 'visual_refresh')
  assert.deepEqual(id({ logo_presence: 'present', identity_intent: 'rebrand', change_depth: 'strategic_rebrand' }).request?.identity?.change_depth, 'strategic_rebrand')
  assert.deepEqual(id({ logo_presence: 'unknown', identity_intent: 'undecided' }).request?.identity?.change_depth, null)
  // A depth left over from toggling the intent never overrides the choice.
  assert.deepEqual(id({ logo_presence: 'present', identity_intent: 'retain', change_depth: 'strategic_rebrand' }).request?.identity, { logo_presence: 'present', identity_intent: 'retain', change_depth: null })
  assert.equal(id({ logo_presence: 'absent', identity_intent: 'retain' }).errors.identity_intent, 'retain_without_logo')
  assert.equal(id({ logo_presence: 'present', identity_intent: 'create' }).errors.identity_intent, 'create_with_logo')
  assert.equal(id({ logo_presence: 'absent', identity_intent: 'evolve', change_depth: 'logo_evolution' }).errors.change_depth, 'logo_evolution_without_logo')
  assert.equal(id({ logo_presence: 'maybe' }).errors.logo_presence, 'logo_presence_invalid')
  assert.equal(id({ identity_intent: 'evolve', change_depth: 'everything' }).errors.change_depth, 'change_depth_invalid')
  assert.equal(id({ logo_presence: ['present', 'absent'] }).errors.logo_presence, 'logo_presence_invalid', 'two values for one radio are refused')
  // A stored request (nested identity) validates the same way, as provisioning re-checks it.
  assert.equal(id({ identity: { logo_presence: 'absent', identity_intent: 'retain', change_depth: null } }).errors.identity_intent, 'retain_without_logo')
})

test('provisioning writes the intake as an unapproved hint; a request recorded before the field writes none', async () => {
  const h = harness()
  const req = await provisioned(h, { identity: { logo_presence: 'present', identity_intent: 'evolve', change_depth: 'visual_refresh' } })
  const tree = h.github.headTree(OWNER, req.repo)
  const cfg = parse(tree.get('brand/brand.config.yaml')!.toString('utf8')) as { onboarding?: { identity?: Record<string, unknown> } }
  assert.deepEqual({ ...cfg.onboarding?.identity, recorded_at: undefined }, {
    schema_version: 1,
    source: 'studio_owner_wizard',
    authority: 'unapproved_owner_intake',
    logo_presence: 'present',
    identity_intent: 'evolve',
    change_depth: 'visual_refresh',
    recorded_at: undefined,
  })
  assert.deepEqual(parse(tree.get('brand/instance/approved-facts.yaml')!.toString()).facts, {})
  const policy = parse(tree.get('brand/publication-policy.yaml')!.toString()) as Record<string, unknown>
  assert.deepEqual(policy.approved_fact_ids, [])
  assert.deepEqual(policy.approved_asset_ids, [])
  for (const [file, data] of tree) {
    if (file !== 'brand/brand.config.yaml') assert.equal(data.toString('utf8').includes('unapproved_owner_intake'), false, file)
  }

  const old = await provisioned(h, { slug: 'old-brand', repo: 'old-brand' })
  const oldCfg = parse(h.github.headTree(OWNER, old.repo).get('brand/brand.config.yaml')!.toString('utf8')) as Record<string, unknown>
  assert.equal(oldCfg.onboarding, undefined, 'no inferred logo status for an old request')
  // Studio's projection of the brand never carries the intake. (`business.cx.onboarding` is an ordinary interview
  // question id that visual documents cite; it is not the intake.)
  for (const slug of [req.slug, old.slug]) assert.doesNotMatch(JSON.stringify(h.sync.get(slug)), /(?<!business\.cx\.)onboarding|identity_intent|unapproved_owner_intake/)
})

test('server: the wizard asks the questions in en, fa and tr; errors keep the answers; review mirrors them', async () => {
  await withStudio(async (s, client) => {
    const page = await client.page('/brands/new')
    assert.match(page.text, /Logo and identity/)
    assert.match(page.text, /We will explore your market and competitors after setup/)
    assert.equal(checked(page.text, 'logo_presence'), 'unknown')
    assert.equal(checked(page.text, 'identity_intent'), 'undecided')
    assert.equal(checked(page.text, 'change_depth'), null)
    assert.match(page.text, /data-change-depth data-applies="false"/)
    assert.match(page.text, /data-review-field="change_depth"[^>]*>Not asked</)

    const refused = await post(s, client, { logo_presence: 'absent', identity_intent: 'retain' })
    assert.equal(refused.status, 422)
    const text = await refused.text()
    assert.match(text, /There is no logo to keep/)
    assert.match(text, /href="#identity_intent"/)
    assert.match(text, /id="identity_intent"/)
    assert.match(text, /name="identity_intent" value="retain"[^>]*\schecked\s+aria-invalid="true"/)
    assert.equal(checked(text, 'logo_presence'), 'absent', 'the answers survive a validation error')
    assert.equal(s.github.callsTo('POST', /\/generate$/).length, 0, 'nothing is created')

    const kept = await post(s, client, { logo_presence: 'present', identity_intent: 'evolve', change_depth: 'visual_refresh', slug: 'evolve-co', repo: 'evolve-co' })
    assert.equal(kept.status, 303)
    assert.deepEqual(s.studio.registry.get('evolve-co')?.provisioning?.request.identity, { logo_presence: 'present', identity_intent: 'evolve', change_depth: 'visual_refresh' })

    const stale = await post(s, client, { logo_presence: 'present', identity_intent: 'retain', change_depth: 'strategic_rebrand', slug: 'keep-co', repo: 'keep-co' })
    assert.equal(stale.status, 303)
    assert.equal(s.studio.registry.get('keep-co')?.provisioning?.request.identity?.change_depth, null, 'a hidden stale depth is cleared')

    for (const [lang, title, option] of [
      ['fa', 'لوگو و هویت', 'ری‌برندینگ راهبردی'],
      ['tr', 'Logo ve kimlik', 'Stratejik yeniden markalama'],
    ] as const) {
      await client.get(`/brands/new?lang=${lang}`)
      const localized = await client.page('/brands/new')
      assert.match(localized.text, new RegExp(title))
      assert.match(localized.text, new RegExp(option))
    }
  })
})

test('server: Edit and retry prefills the identity answers; an old failed record prefills unknown / undecided', async () => {
  await withStudio(async (s, client) => {
    s.github.addRepo(OWNER, 'taken', new Map([['README.md', Buffer.from('someone else')]]))
    assert.ok(s.studio.provisioning.start(request({ repo: 'taken', identity: { logo_presence: 'present', identity_intent: 'rebrand', change_depth: 'strategic_rebrand' } }), 'owner').ok)
    await s.studio.provisioning.settled()
    const edit = await client.page('/brands/new?retry=acme-learning')
    assert.equal(checked(edit.text, 'logo_presence'), 'present')
    assert.equal(checked(edit.text, 'identity_intent'), 'rebrand')
    assert.equal(checked(edit.text, 'change_depth'), 'strategic_rebrand')
    assert.match(edit.text, /data-change-depth data-applies="true"/)
    assert.match(edit.text, /data-review-field="identity_intent">Rebrand</)

    // Plain Retry reuses the stored request, identity included.
    s.github.faults.length = 0
    const record = s.studio.registry.get('acme-learning')!
    assert.equal(record.provisioning?.request.identity?.identity_intent, 'rebrand')

    s.github.addRepo(OWNER, 'taken-too', new Map([['README.md', Buffer.from('someone else')]]))
    assert.ok(s.studio.provisioning.start(request({ slug: 'old-attempt', repo: 'taken-too' }), 'owner').ok)
    await s.studio.provisioning.settled()
    const old = await client.page('/brands/new?retry=old-attempt')
    assert.equal(checked(old.text, 'logo_presence'), 'unknown')
    assert.equal(checked(old.text, 'identity_intent'), 'undecided')
  })
})

test('the intake never reaches Studio brand pages or the sync cache', async () => {
  await withStudio(async (s, client) => {
    const res = await post(s, client, { logo_presence: 'present', identity_intent: 'rebrand', change_depth: 'strategic_rebrand' })
    assert.equal(res.status, 303)
    for (const pathname of ['/brands', '/brands/acme-learning', '/brands/acme-learning/brand/book', '/brands/acme-learning/brand/design-system', '/brands/acme-learning/governance/history', '/brands/acme-learning/governance/github']) {
      const page = await client.page(pathname)
      assert.doesNotMatch(page.text, /unapproved_owner_intake|identity_intent|strategic_rebrand/, pathname)
    }
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))
    for (const file of walk(s.config.dataDir).filter((name) => !name.endsWith('registry.json') && !name.endsWith('audit.jsonl'))) {
      assert.equal(fs.readFileSync(file, 'utf8').includes('unapproved_owner_intake'), false, file)
    }
    const guest = new Client(s.url)
    assert.notEqual((await guest.get('/brands/acme-learning')).status, 200)
  })
})
