import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DocumentItem } from '@brand-os/brand-core'
import { i18n, LOCALES } from '../apps/studio/src/i18n/index.js'
import { documentItem } from '../apps/studio/src/views/components.js'

const base: DocumentItem = { id: 'brand.strategy.vision', label: 'Vision', tag: 'assumption', kind: 'text', value: 'Every adult keeps a daily practice.', structured: null, source_ids: [], version: null, withheld: false, note: null, verification: null }

test('Studio marks agent-suggested, owner-confirmed items in every locale and leaves owner items alone (BOS-06)', () => {
  const expected = { en: 'Agent-suggested, owner-confirmed', fa: 'پیشنهاد عامل، تأیید مالک', tr: 'Ajan önerisi, sahip onaylı' }
  for (const locale of LOCALES) {
    const i = i18n(locale)
    const marked = String(documentItem(i, { ...base, provenance: 'agent_suggested_owner_confirmed' }))
    assert.ok(marked.includes(expected[locale]), locale)
    assert.ok(!String(documentItem(i, base)).includes(expected[locale]), `${locale}: owner items carry no badge`)
  }
})
