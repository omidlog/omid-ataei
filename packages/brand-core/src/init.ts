import fs from 'node:fs'
import path from 'node:path'
import { migrateBrand } from './backup.js'
import { writeAtomic } from './fsutil.js'
import { readSyncManifest, readTemplateRecord, writeTemplateRecord } from './template-sync.js'
import type { BrandConfig, PersonalFacet, PersonalModuleConfig, SessionState } from './types.js'
import { PERSONAL_FACETS } from './types.js'
import type { InitInput } from './engine-types.js'

/** brand:init helpers that do not need the interview engine. applyInit itself stays in engine.ts. */

/** Personal module settings for brand:init. Throws on an unknown facet or facets without the module. */
export function personalInit(input: Pick<InitInput, 'profile' | 'personal' | 'facets'>): PersonalModuleConfig {
  const enabled = input.personal === true || input.profile === 'personal-brand'
  const facets = [...new Set((input.facets ?? []).map((item) => item.trim()).filter(Boolean))]
  const unknown = facets.filter((facet) => !(PERSONAL_FACETS as readonly string[]).includes(facet))
  if (unknown.length) throw new Error(`Unknown personal facet ${unknown.join(', ')}. Use: ${PERSONAL_FACETS.join(', ')}.`)
  if (facets.length && !enabled) throw new Error('Facets need the personal module. Use --profile personal-brand or --personal true.')
  return { enabled, facets: facets as PersonalFacet[] }
}

export function assertSlug(slug: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Slug "${slug}" must be lowercase letters, numbers, and single hyphens.`)
  }
}

/** Writes brand/template-version.json. A re-init keeps a known template commit. */
export function recordTemplate(root: string, template: InitInput['template']): void {
  const recorded_at = new Date().toISOString()
  if (template) {
    writeTemplateRecord(root, { ...template, recorded_at })
    return
  }
  const existing = readTemplateRecord(root)
  let version: string | null = existing?.version ?? null
  const pkg = path.join(root, 'package.json')
  if (!version && fs.existsSync(pkg)) {
    const value = (JSON.parse(fs.readFileSync(pkg, 'utf8')) as { version?: unknown }).version
    version = typeof value === 'string' ? value : null
  }
  writeTemplateRecord(root, {
    repository: existing?.repository ?? readSyncManifest(root)?.template.repository ?? null,
    commit: existing?.commit ?? null,
    version,
    recorded_at,
    source: existing?.source ?? 'brand:init',
  })
}

export function syncManifest(root: string, config: BrandConfig): void {
  const file = path.join(root, 'brand', 'brand-manifest.json')
  const current = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>) : {}
  current.name = config.brand.name
  current.slug = config.brand.slug
  current.publish_docs = config.brand.publish_docs
  current.status = config.brand.status
  writeAtomic(file, `${JSON.stringify(current, null, 2)}\n`)
}

export function upgradeCore(root: string): { version: string; preserved: true } {
  const migrated = migrateBrand(root)
  return { version: migrated.to, preserved: true }
}

export function emptySession(locale: string): SessionState {
  const safe = locale === 'fa' || locale === 'tr' ? locale : 'en'
  return {
    session_id: null,
    status: 'idle',
    locale: safe,
    history: [],
    deferred: [],
    pending_suggestions: [],
    cursor_question_id: null,
    pending_proposals: [],
    started_at: null,
    updated_at: null,
    last_answer_id: null,
  }
}
