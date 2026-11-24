import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { SVG_ISSUE_CODES } from '@brand-os/asset-catalog'
import { catalog, LOCALES, type MessageKey } from '../apps/studio/src/i18n/index.js'
import { escapeHtml } from '../apps/studio/src/views/html.js'
import { addApprovedAsset, editOutsideStudio } from './helpers/edits.js'
import { Client, startStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'svg')

test('every SVG issue code has a Studio message in every locale', () => {
  for (const locale of LOCALES) {
    const messages = catalog(locale)
    for (const code of SVG_ISSUE_CODES) assert.ok(messages[`assets.svg.${code}` as MessageKey], `${locale} assets.svg.${code}`)
  }
})

test('Studio names the SVG problem and the core command that fixes it, instead of a generic refusal', async () => {
  const s = await startStudio()
  try {
    const client = new Client(s.url)
    await client.login()
    const csrfNew = await client.csrf('/brands/new')
    await client.request('POST', '/brands/new', {
      form: { _csrf: csrfNew, name: 'Acme Learning', slug: 'acme-learning', profile: 'business', default_locale: 'en', locales: ['en'], owner: OWNER, repo: 'acme-learning' },
    })
    await s.studio.provisioning.settled()
    await s.studio.sync.settled()

    editOutsideStudio(s, 'acme-learning', (_engine, root) => {
      addApprovedAsset(root, { id: 'asset.mascot.illustrator', name: 'Illustrator export', file: 'brand/assets/mascot/illustrator.svg', data: fs.readFileSync(path.join(FIXTURES, 'illustrator-export.svg')) })
      addApprovedAsset(root, { id: 'asset.mascot.scripted', name: 'Scripted export', file: 'brand/assets/mascot/scripted.svg', data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><style>.a{fill:red}</style><script>alert(1)</script></svg>') })
      addApprovedAsset(root, { id: 'asset.mascot.figma', name: 'Figma export', file: 'brand/assets/mascot/figma.svg', data: fs.readFileSync(path.join(FIXTURES, 'figma-export.svg')) })
    })
    const synced = await s.studio.sync.refresh('acme-learning')
    const assets = synced.projection!.assets
    const illustrator = assets.find((asset) => asset.id === 'asset.mascot.illustrator')!
    assert.equal(illustrator.unavailable_reason, 'unsafe')
    assert.deepEqual(illustrator.unavailable_detail, { code: 'style-element', line: 4, fixable: true })
    const scripted = assets.find((asset) => asset.id === 'asset.mascot.scripted')!
    assert.equal(scripted.unavailable_detail?.code, 'script', 'a non-fixable issue is shown first')
    assert.equal(scripted.unavailable_detail?.fixable, false)
    const figma = assets.find((asset) => asset.id === 'asset.mascot.figma')!
    assert.match(figma.preview_key ?? '', /^[0-9a-f]{64}$/, 'internal url(#…) references are previewed')
    assert.equal(figma.unavailable_detail, null)
    assert.equal(JSON.stringify(synced).includes('alert(1)'), false)

    const page = await client.page('/brands/acme-learning/brand/assets')
    assert.equal(page.res.status, 200)
    assert.ok(page.text.includes(escapeHtml('SVG has a <style> block')))
    assert.ok(page.text.includes('npm run brand:assets -- normalize asset.mascot.illustrator'))
    assert.ok(page.text.includes('SVG contains a script'))
    assert.equal(page.text.includes('normalize asset.mascot.scripted'), false, 'no fix command for a file the normalizer cannot fix')
    assert.ok(page.text.includes('Not fixable automatically'))
    // Studio stays read-only: the fix is a command for the brand repository, not a button.
    const forms = [...page.text.matchAll(/<form[^>]*action="([^"]+)"/g)].map((match) => match[1])
    assert.ok(forms.every((action) => action === '/logout' || action === '/brands/acme-learning/refresh'), forms.join(', '))
  } finally {
    await s.close()
  }
})
