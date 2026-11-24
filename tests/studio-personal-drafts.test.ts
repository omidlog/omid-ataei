import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateTokens } from '@brand-os/brand-core'
import { approve, editOutsideStudio } from './helpers/edits.js'
import { Client, startStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

/**
 * BOS-17 and BOS-19 in Studio, read-only: the Design System page separates template example colours from approved
 * colours and names the token command; personal documents show a composed draft per language edition (chosen by
 * ?locale=) above their Sources; the Publishing gallery lists the personal documents and they count in "Exports
 * ready". SYNTHETIC DATA ONLY.
 */
const SLUG = 'sample-person'
const KNOWN_FOR_FA = 'مشاور استراتژی محصول برای تیم‌های نوپا.'

function main(text: string): string {
  return text.split('<main')[1] ?? ''
}

test('Studio: design-system token notice, personal draft editions, and personal documents in the Publishing gallery', async () => {
  const s = await startStudio()
  try {
    const owner = new Client(s.url)
    await owner.login()
    const csrf = await owner.csrf('/brands/new')
    await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Sample Person', slug: SLUG, profile: 'personal-brand', facets: ['consultant-expert'], default_locale: 'fa', locales: ['fa', 'en', 'tr'], owner: OWNER, repo: SLUG } })
    await s.studio.provisioning.settled()
    await s.studio.sync.settled()
    editOutsideStudio(s, SLUG, (engine, root) => {
      approve(engine, root, {
        'personal.identity.public_name': 'Sample Person',
        'personal.identity.headline': 'Product strategy advisor | Workshop host',
        'personal.identity.localized_headline': 'فارسی: مشاور استراتژی محصول | میزبان کارگاه. ترکی: Ürün stratejisi danışmanı | Atölye sunucusu.',
        'personal.positioning.known_for': KNOWN_FOR_FA,
        'brand.color.roles': 'mint #C6F432; ink-950 #101114; surface-bg-1 #FAFBFC; text-title #1A1D21',
      })
    })
    await s.studio.sync.refresh(SLUG)

    // BOS-17: approved roles, no generated tokens: the page says so, gives the command, and collapses the examples.
    const design = main((await owner.page(`/brands/${SLUG}/brand/design-system`)).text)
    assert.match(design, /id="tokens-not-generated"/)
    assert.match(design, /Your approved colors are not design tokens yet/)
    assert.match(design, /<code class="mono " dir="ltr">npm run brand:tokens:generate<\/code>/)
    const examples = design.split('data-template-examples')[1]?.split('</details>')[0] ?? ''
    assert.match(design, /<details class="disclosure" id="template-examples" data-template-examples><summary>/, 'collapsed: no open attribute')
    assert.match(examples, /Template examples \(not your brand\)/)
    assert.match(examples, /color\.brand\.primary/)
    const colorsCard = design.split('id="token-colors"')[1]!.split('data-template-examples')[0]!
    assert.doesNotMatch(colorsCard, /color\.brand\.primary/, 'no template example next to the approved colours')
    assert.match(colorsCard, /No color token comes from your approved colors yet\./)

    // After generation (merged outside Studio), the owner roles are draft tokens and unmapped slots are explained.
    editOutsideStudio(s, SLUG, (engine, root) => {
      assert.equal(generateTokens(root, engine.config().brand.slug).ok, true)
    })
    await s.studio.sync.refresh(SLUG)
    const generated = main((await owner.page(`/brands/${SLUG}/brand/design-system`)).text)
    assert.doesNotMatch(generated, /id="tokens-not-generated"/)
    assert.match(generated, /id="tokens-semantic-unmapped"/)
    assert.match(generated, /19 template color slots still use template examples/)
    const generatedColors = generated.split('id="token-colors"')[1]!.split('data-template-examples')[0]!
    assert.match(generatedColors, /color\.brand-role\.mint/)
    assert.doesNotMatch(generatedColors, /color\.brand\.primary/)

    // BOS-19: Professional Bio, three editions by query parameter, each with a labelled draft above the Sources.
    const base = `/brands/${SLUG}/brand/personal?doc=professional-bio`
    const faBio = main((await owner.page(base)).text)
    assert.match(faBio, /data-editions/)
    assert.match(faBio, /data-draft-locale="fa"/, 'the default language is the first edition')
    assert.match(faBio, /Draft for owner approval/)
    assert.match(faBio, /lang="fa" dir="rtl">Sample Person — مشاور استراتژی محصول \| میزبان کارگاه\. شناخته‌شده به‌عنوان: /)
    assert.match(faBio, /<h3 class="personal-sources-title">Sources<\/h3>/)
    const enBio = main((await owner.page(`${base}&locale=en`)).text)
    assert.match(enBio, /data-draft-locale="en"/)
    assert.match(enBio, /lang="en" dir="ltr">Sample Person — Product strategy advisor \| Workshop host\.<\/p>/)
    assert.match(enBio, /Untranslated, left out of this edition/)
    assert.ok(enBio.includes(KNOWN_FOR_FA), 'the untranslated fact stays visible as a Source card')
    const trBio = main((await owner.page(`${base}&locale=tr`)).text)
    assert.match(trBio, /lang="tr" dir="ltr">Sample Person — Ürün stratejisi danışmanı \| Atölye sunucusu\.<\/p>/)
    const bogus = main((await owner.page(`${base}&locale=de`)).text)
    assert.match(bogus, /data-draft-locale="fa"/, 'an unknown edition falls back to the first one')

    // BOS-19: the gallery lists the personal documents with the same audience × readiness model.
    const gallery = main((await owner.page(`/brands/${SLUG}/governance/documents`)).text)
    for (const type of ['personal_brand_book', 'professional_bio', 'linkedin_pack', 'website_pack', 'media_kit', 'content_strategy', 'portfolio_pack', 'services_pack', 'evidence_register']) {
      assert.match(gallery, new RegExp(`<tr data-document-type="${type}">`), type)
    }
    assert.doesNotMatch(gallery, /data-document-type="speaker_kit"/, 'the Speaker Kit needs its facet')
    const bioRow = gallery.split('<tr data-document-type="professional_bio">')[1]!.split('</tr>')[0]!
    assert.match(bioRow, /href="\/brands\/sample-person\/brand\/personal\?doc=professional-bio">Professional Bio<\/a>/)
    assert.match(bioRow, /npm run brand:document -- --type professional-bio --audience internal/)
    assert.equal([...bioRow.matchAll(/data-readiness="blocked"/g)].length, 1, 'no investor edition')
    assert.ok(!gallery.includes(KNOWN_FOR_FA), 'counts only, never values')

    // The Command Center counts the personal cells in "Exports ready".
    const home = main((await owner.page(`/brands/${SLUG}`)).text)
    const exports = home.split('data-tile="exports"')[1]!.split('</a>')[0]!
    const total = Number(/\d+ of (\d+)/.exec(exports)?.[1] ?? 0)
    assert.ok(total > 14, `personal cells are counted: ${exports.replace(/<[^>]+>/g, ' ')}`)

    // fa and tr: the strings exist and the section is still separated.
    await owner.get(`/brands/${SLUG}/brand/design-system?lang=fa`)
    const fa = main((await owner.page(`/brands/${SLUG}/brand/design-system`)).text)
    assert.match(fa, /نمونه‌های قالب \(نه برند شما\)/)
    await owner.get(`/brands/${SLUG}/brand/design-system?lang=tr`)
    const tr = main((await owner.page(`/brands/${SLUG}/brand/design-system`)).text)
    assert.match(tr, /Şablon örnekleri \(markanız değil\)/)
    const trBioUi = main((await owner.page(`${base}&locale=fa`)).text)
    assert.match(trBioUi, /Sahibin onayı için taslak/)
    assert.match(trBioUi, /<h3 class="personal-sources-title">Kaynaklar<\/h3>/)
  } finally {
    await s.close()
  }
})
