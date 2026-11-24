import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { parse, stringify } from 'yaml'
import { addApprovedAsset, approve, editOutsideStudio } from './helpers/edits.js'
import { Client, startStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

/**
 * Visual V2.4 (R3): the Brand Book page is an editorial chapter reader. Chapters have openers and version footers,
 * specimens reuse the V2.1 plates, do/don't pairs are a spread, drafts are labelled and never called published, and
 * technical ids live only in a details toggle. The page stays GET-only and works in en/fa/tr.
 */
const SLUG = 'pilito-book'

/** The main view without any details toggle: what the owner reads before opening "Source ids". */
function mainView(text: string): string {
  const body = text.split('<main')[1] ?? ''
  return body.replace(/<details[\s\S]*?<\/details>/g, '')
}

test('Studio: the Brand Book reads as an editorial book with chapters, specimens, do/don\'t and version footers', async () => {
  const s = await startStudio()
  try {
    const owner = new Client(s.url)
    await owner.login()
    const csrf = await owner.csrf('/brands/new')
    await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Pilito Book', slug: SLUG, profile: 'business', default_locale: 'en', locales: ['en', 'fa', 'tr'], owner: OWNER, repo: SLUG } })
    await s.studio.provisioning.settled()
    await s.studio.sync.settled()
    const wordmark = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 160"><rect width="640" height="160" fill="#0B6E4F"/></svg>')
    const checksum = crypto.createHash('sha256').update(wordmark).digest('hex')
    editOutsideStudio(s, SLUG, (engine, root) => {
      approve(engine, root, {
        'brand.strategy.purpose': 'Make <b>learning</b> feel possible.',
        'brand.verbal.voice_pairs': 'Say what happened | Blame the user\nInvite the next step | Lecture',
        'brand.color.roles': 'primary: #0B6E4F\nbackground: #FFFFFF\ntext: #111111',
        'brand.logo.min_size': 'min-size: 80px; clear-space: 0.4x',
        'brand.logo.masters': 'This repository: brand/assets/logo/pilito-wordmark.svg (asset.logo.pilito-wordmark).',
      })
      // An owner draft that is not approved: shown to the owner, labelled, never as published.
      engine.answerQuestion('brand.strategy.vision', 'A calmer classroom everywhere.')
      // Owner decisions on a gap say what the owner decided, not "Still to answer".
      engine.answerQuestion('brand.strategy.promise', 'n/a')
      engine.answerQuestion('brand.strategy.decision_rule', 'unknown')
      addApprovedAsset(root, { id: 'asset.logo.pilito-wordmark', name: 'Pilito wordmark', file: 'brand/assets/logo/pilito-wordmark.svg', data: wordmark })
      const file = path.join(root, 'brand/assets/asset-manifest.yaml')
      const manifest = parse(fs.readFileSync(file, 'utf8')) as { assets: Array<Record<string, unknown>> }
      const asset = manifest.assets.find((item) => item.id === 'asset.logo.pilito-wordmark')!
      asset.mime = 'image/svg+xml'
      asset.preview = asset.path
      asset.tags = ['logo', 'wordmark', 'draft']
      fs.writeFileSync(file, stringify(manifest))
    })
    await s.studio.sync.refresh(SLUG)

    const page = await owner.page(`/brands/${SLUG}/brand/book`)
    assert.equal(page.res.status, 200)
    const text = page.text
    const main = mainView(text)
    // Editorial reader, not the generic document cards.
    assert.equal(text.includes('class="doc-layout"'), false, 'documentView is gone from the Brand Book')
    assert.match(main, /<h1 class="vz-opener-title">Brand Book<\/h1>/)
    assert.match(main, /<nav class="vz-toc" aria-label="Contents">/)
    for (const [n, title] of [['01', 'Brand overview'], ['02', 'Strategy'], ['03', 'Verbal identity'], ['04', 'Color'], ['05', 'Typography'], ['06', 'Logo'], ['07', 'Governance']]) {
      assert.match(main, new RegExp(`<p class="vz-bk-num">Chapter ${n}</p>\\s*<h2 class="vz-bk-title" id="bk-[a-z]+-t">${title}</h2>`), `chapter ${n} opener`)
    }
    // Approved prose is escaped and set as text.
    assert.ok(main.includes('Make &lt;b&gt;learning&lt;/b&gt; feel possible.'))
    assert.equal(text.includes('<b>learning</b>'), false)
    // Do/don't as a spread, each side said in words.
    assert.match(main, /class="vz-bk-dodont"/)
    assert.match(main, /<p class="vz-bk-do" role="cell" dir="auto">Say what happened<\/p><p class="vz-bk-dont" role="cell" dir="auto">Blame the user<\/p>/)
    // Specimens reuse the V2.1 plates.
    assert.match(main, /<figure class="vz-bk-specimen"[^>]*>\s*<section class="vz-plate vz-plate--color"/)
    assert.match(main, /<section class="vz-plate vz-plate--logo"/)
    assert.ok(main.includes(`src="/brands/${SLUG}/assets/file/${checksum}"`), 'the approved wordmark is drawn in the logo chapter')
    // Draft marks stay visible to the owner and are never called published.
    assert.match(main, /data-badge="draft_tag">Tagged draft</)
    assert.match(main, /A calmer classroom everywhere\./)
    assert.match(main, /Draft, not approved\. Never shown as published\./)
    assert.equal(/>\s*Published\s*</.test(main), false)
    assert.match(main, /<p class="vz-bk-gap">[\s\S]*?<span>Marked not applicable by the owner\.<\/span><\/p>/)
    assert.match(main, /<p class="vz-bk-gap">[\s\S]*?<span>The owner said this is unknown\. Nothing was invented\.<\/span><\/p>/)
    // Version footers per chapter.
    assert.equal((main.match(/<footer class="vz-bk-foot">/g) ?? []).length, 7)
    assert.match(main, /<span dir="auto">Chapter 02 · Strategy<\/span><span aria-hidden="true"> · <\/span><span dir="auto">Version 1<\/span>/)
    // Technical ids only behind the details toggle.
    assert.equal(/\b(brand|business)\.[a-z_]+\.[a-z_]+/.test(main), false, 'no technical ids in the main view')
    assert.match(text, /<summary class="vz-details-summary">[\s\S]*?<span>Source ids<\/span><\/summary>[\s\S]*?brand\.strategy\.purpose/)
    // Read-only: links to the chapter and its print view, no form other than sign-out and refresh.
    assert.ok(text.includes(`href="/brands/${SLUG}/brand/book/visual-identity"`))
    assert.ok(text.includes(`href="/brands/${SLUG}/brand/book/visual-identity/print"`))
    const actions = [...text.matchAll(/<form[^>]*action="([^"]+)"/g)].map((match) => match[1])
    assert.ok(actions.every((action) => action === '/logout' || action === `/brands/${SLUG}/refresh`), actions.join(', '))

    // Persian: chapter numbers in Persian digits, localized chapter titles, RTL document.
    await owner.get(`/brands/${SLUG}/brand/book?lang=fa`)
    const fa = await owner.page(`/brands/${SLUG}/brand/book`)
    assert.match(fa.text, /<html lang="fa" dir="rtl">/)
    assert.match(fa.text, /<p class="vz-bk-num">فصل ۰۱<\/p>/)
    assert.match(fa.text, /هویت کلامی/)
    assert.match(fa.text, /پیش‌نویس، تأییدنشده/)
    assert.match(fa.text, /مالک این را «مربوط نیست» علامت زده است\./)
    assert.match(fa.text, /آزمایشگاه استراتژی/)
    await owner.get(`/brands/${SLUG}/brand/book?lang=tr`)
    const tr = await owner.page(`/brands/${SLUG}/brand/book`)
    assert.match(tr.text, /<p class="vz-bk-num">Bölüm 01<\/p>/)
    assert.match(tr.text, /Sözel kimlik/)
    assert.match(tr.text, /Sahip bunu geçerli değil olarak işaretledi\./)
    assert.match(tr.text, /Strateji Laboratuvarı/)
  } finally {
    await s.close()
  }
})

test('reader: every item note it localizes is one the document model really writes (no silent drift)', async () => {
  const { ITEM_NOTE_KEYS } = await import('../apps/studio/src/views/visual-book.js')
  const model = fs.readFileSync(path.join(import.meta.dirname, '../packages/brand-core/src/documents/model.ts'), 'utf8')
  for (const note of Object.keys(ITEM_NOTE_KEYS)) assert.ok(model.includes(`'${note}'`), `brand-core no longer writes: ${note}`)
  assert.equal(ITEM_NOTE_KEYS['Agent suggestion. Not approved and not an owner decision.'], 'reader.suggestionNote')
})
