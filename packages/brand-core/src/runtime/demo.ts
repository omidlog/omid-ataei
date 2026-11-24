import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { AGENT_TOKEN_ENV } from '../agent-tokens.js'
import { agentTokenContext } from '../auth.js'
import { ensureApprovalSecret } from '../private-store.js'
import type { AuthContext } from '../auth.js'
import { SYNTHETIC_DEMO_BANNER } from '../assurance/fixtures.js'
import { buildContentStrategy } from '../content-bridge/propose.js'
import { InterviewEngine } from '../engine.js'
import { openWorkspace } from '../knowledge/workspace.js'
import { writeStarterWorkspace } from '../materialize.js'
import { approveRevision, proposeRevision } from '../strategy/store.js'
import { buildTaskContext } from '../task-context/resolve.js'
import type { TaskContextPack, TaskLocale } from '../task-context/model.js'
import { RuntimeError } from './model.js'

/**
 * SYNTHETIC DEMO — NOT A REAL BRAND.
 *
 * A throwaway, fully populated test brand for the first Runtime journey. It is written to a fresh directory under the
 * OS temp folder and nowhere else: it never reads or writes this repository's `brand/` folder, never touches a real
 * brand, and its approvals exist only inside that temp workspace (they are fixture setup, signed with that
 * workspace's own throwaway approval secret). Every value is invented and illustrative.
 *
 * The pack is then built exactly as an agent would get it: `buildTaskContext` under a `content-read` agent context of
 * this demo brand. Nothing in the pack is hand-written.
 */

export const DEMO_BRAND_SLUG = 'synthetic-demo-social'
export const DEMO_BANNER = SYNTHETIC_DEMO_BANNER
/** Fixed clock for the strategy store, so the approved content strategy (and its hash) is the same every run. */
export const DEMO_NOW = new Date('2026-11-23T00:00:00.000Z')

/** Illustrative approved facts. Persian, because journey A asks for Persian posts. None describes a real company. */
export const DEMO_FACTS: Array<[string, string]> = [
  ['business.identity.trade_name', 'لومو کارت (نمونهٔ مصنوعی)'],
  ['business.identity.sector', 'education'],
  ['brand.strategy.purpose', 'یادگیری روزانه را کوتاه و شدنی کنیم.'],
  ['brand.strategy.promise', 'هر روز پنج دقیقه، یک قدم جلوتر.'],
  ['brand.strategy.differentiation', 'مرور بر اساس منحنی فراموشی، نه تکرار کور.'],
  ['business.offer.value_proposition', 'کارت‌ها درست وقتی برمی‌گردند که در حال فراموش‌شدن‌اند.'],
  ['brand.verbal.tagline', 'کم، ولی هر روز.'],
  ['business.customer.primary_segment', 'دانشجوها و شاغل‌هایی که فقط چند دقیقه وقت آزاد دارند'],
  ['business.offer.summary', 'دو هفته استفادهٔ آزمایشی از همهٔ دسته‌ها'],
  ['business.marketing.pillars', 'عادت کوچک روزانه؛ علم مرور فاصله‌دار؛ داستان یادگیرنده‌ها'],
  ['business.marketing.channels', 'Instagram'],
  ['business.marketing.objective', 'آزمودن این‌که پست‌های آموزشی کوتاه به ثبت‌نام آزمایشی منجر می‌شوند (فرضیه).'],
  ['business.market.geography', 'بازار فرضی فارسی‌زبان'],
  ['brand.social.cta', 'لینک بیو را بزن و اولین دسته‌ات را بساز'],
  ['brand.verbal.voice', 'گرم، کوتاه و بی‌ادعا'],
  ['brand.verbal.forbidden', 'تضمین موفقیت؛ بهترین اپ ایران؛ یک‌شبه مسلط شو'],
  ['business.marketing.availability_claim', 'do-not-claim'],
  ['brand.color.roles', 'primary #1B2A4A; onPrimary #FFFFFF; surface #F6F1E7; ink #14171F; accent #F2B705'],
  ['brand.type.scale', 'display: Vazirmatn, Tahoma, sans-serif @ 44px/1.25; label: Vazirmatn, Tahoma, sans-serif @ 16px/1.3; body: Vazirmatn, Tahoma, sans-serif @ 18px/1.4'],
]

/** A synthetic geometric mark: three stacked cards. Static, script-free, passes both SVG gates. */
export const DEMO_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <title>Synthetic demo mark (not a real logo)</title>
  <rect x="14" y="30" width="72" height="56" rx="10" fill="#F2B705"/>
  <rect x="26" y="22" width="72" height="56" rx="10" fill="#FFFFFF" opacity="0.9"/>
  <rect x="38" y="14" width="72" height="56" rx="10" fill="#1B2A4A" stroke="#FFFFFF" stroke-width="4"/>
  <path d="M58 42 h32 M58 54 h20" stroke="#F2B705" stroke-width="6" stroke-linecap="round"/>
</svg>
`
export const DEMO_LOGO_ID = 'logo.synthetic-demo-mark'

export interface DemoBrand {
  root: string
  engine: InterviewEngine
  /** The agent caller the pack is built for. Built in-process; no token file or environment variable is used. */
  ctx: AuthContext
  cleanup(): void
}

/** Builds the demo workspace in a new temp directory. Owner-local: refused while an agent token is set. */
export function createDemoBrand(): DemoBrand {
  if (process.env[AGENT_TOKEN_ENV]) throw new RuntimeError('refused', `The synthetic demo is built by the owner process. Refusing while ${AGENT_TOKEN_ENV} is set.`)
  if (!process.env.BRAND_OS_DATA_KEY) {
    // The knowledge store needs a key; a demo gets a throwaway one for this process only.
    process.env.BRAND_OS_DATA_KEY = createHash('sha256').update(`${DEMO_BANNER}:data-key`).digest('base64')
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-runtime-demo-'))
  const cleanup = (): void => fs.rmSync(root, { recursive: true, force: true })
  try {
    writeStarterWorkspace(root)
    const configFile = path.join(root, 'brand', 'brand.config.yaml')
    const config = YAML.parse(fs.readFileSync(configFile, 'utf8')) as { brand: Record<string, unknown> } & Record<string, unknown>
    config.brand.slug = DEMO_BRAND_SLUG
    config.brand.name = 'SYNTHETIC DEMO social brand'
    fs.writeFileSync(configFile, YAML.stringify(config))

    const engine = new InterviewEngine(root)
    const proof = ensureApprovalSecret(root)
    for (const [id, value] of DEMO_FACTS) {
      const changed = engine.changeAnswer(id, value)
      if (changed.kind !== 'recorded') throw new RuntimeError('refused', `demo fact ${id} was not recorded (${changed.kind})`)
      const approved = engine.approve(id, 'owner', proof)
      if (approved.kind !== 'recorded') throw new RuntimeError('refused', `demo fact ${id} was not approved (${approved.kind})`)
    }

    // One approved logo asset; no model_use recorded, so it is `not_allowed` by default. The demo brand owns its own
    // mark, and the licence says so: the Visual DNA resolver withholds an approved asset with no recorded licence.
    const logoPath = 'brand/assets/logo/synthetic-demo-mark.svg'
    fs.mkdirSync(path.join(root, path.dirname(logoPath)), { recursive: true })
    fs.writeFileSync(path.join(root, logoPath), DEMO_LOGO_SVG)
    const sha = createHash('sha256').update(DEMO_LOGO_SVG).digest('hex')
    const manifestFile = path.join(root, 'brand', 'assets', 'asset-manifest.yaml')
    const manifest = fs.existsSync(manifestFile) ? ((YAML.parse(fs.readFileSync(manifestFile, 'utf8')) as { schema_version?: number; assets?: unknown[] }) ?? {}) : {}
    manifest.schema_version = manifest.schema_version ?? 1
    manifest.assets = [
      ...(manifest.assets ?? []),
      { id: DEMO_LOGO_ID, name: 'Synthetic demo mark', status: 'approved', path: logoPath, present: true, visibility: 'internal', license: 'Owned by the synthetic demo brand (fixture, not a real licence)', checksum_sha256: sha, approved_sha256: sha, approved_by: 'owner', approved_at: DEMO_NOW.toISOString() },
    ]
    fs.writeFileSync(manifestFile, YAML.stringify(manifest))

    // The approved content strategy social_batch requires, drafted by the Content Bridge from the facts above.
    const ws = openWorkspace(root, { now: () => DEMO_NOW })
    const draft = buildContentStrategy(ws, {
      lang: 'fa',
      channels: ['instagram'],
      cadence: { instagram: { per: 'week', target: 3 } },
      formats: { instagram: ['post'] },
      languages: ['fa'],
    })
    const revision = proposeRevision(ws, { strategy_id: 'content-demo', proposal: { ...draft.proposal, content_strategy: draft.block } }).revision
    approveRevision(ws, { strategy_id: 'content-demo', revision: revision.revision, expected_sha256: revision.content_sha256, proof })

    return { root, engine, ctx: agentTokenContext(DEMO_BRAND_SLUG, 'agt_synthetic_demo_content', 'content-read'), cleanup }
  } catch (error) {
    cleanup()
    throw error
  }
}

/** The pack, exactly as `task_context` returns it to a `content-read` agent of the demo brand. */
export function demoPack(demo: DemoBrand, locale: TaskLocale = 'fa'): TaskContextPack {
  const result = buildTaskContext(demo.engine, demo.ctx, { task_type: 'social_batch', deliverable_count: 10, channel: 'instagram', locale, output_format: 'svg' })
  if (result.status !== 'ok' || !result.data) throw new RuntimeError('invalid_pack', `task_context returned ${result.status}: ${result.reason ?? ''}`)
  return result.data
}
