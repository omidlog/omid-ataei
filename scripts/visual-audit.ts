import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  auditVisualModules,
  AUDIT_TEXT,
  evaluateGate,
  isVisualLang,
  RELEASE_GATE_POLICY_PATH,
  type CatalogSet,
  type GateResult,
  type ReleaseGatePolicy,
  type VisualAuditReport,
  type VisualLang,
} from '@brand-os/brand-core/visual'

/**
 * Visual V5.1: per-module visual audit, cross-brand pilot and release gate.
 *
 *   npm run visual:audit [-- --lang en|fa|tr] [--json | --md] [--out file] [--pilot]
 *   npm run visual:gate  [-- --release] [--lang en|fa|tr] [--pilot]
 *
 * Read-only on the checkout. `--pilot` builds two synthetic brands in a temporary folder (removed afterwards) with a
 * throwaway data key. `--out` refuses brand/ and any .private path. The gate exits 1 when it fails.
 */
interface Args {
  lang: VisualLang
  format: 'table' | 'json' | 'md'
  out: string | null
  gate: boolean
  release: boolean
  pilot: boolean
}

function parse(argv: string[]): Args {
  const args: Args = { lang: 'en', format: 'table', out: null, gate: false, release: false, pilot: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!
    if (arg === '--json') args.format = 'json'
    else if (arg === '--md') args.format = 'md'
    else if (arg === '--gate') args.gate = true
    else if (arg === '--release') args.release = args.gate = true
    else if (arg === '--pilot') args.pilot = true
    else if (arg === '--lang') {
      const value = argv[++i]
      if (!isVisualLang(value)) throw new Error('--lang must be en, fa or tr')
      args.lang = value
    } else if (arg === '--out') args.out = argv[++i] ?? null
    else throw new Error(`unknown option ${arg}`)
  }
  return args
}

/** Studio's own catalog (flat keys) for the Publishing gallery, nested under `studio.publishing`. */
async function studioCatalogs(root: string): Promise<CatalogSet> {
  const dir = path.join(root, 'apps', 'studio', 'src', 'i18n')
  if (!fs.existsSync(dir)) return {}
  const out: Partial<Record<VisualLang, Record<string, string>>> = {}
  for (const lang of ['en', 'fa', 'tr'] as const) {
    const mod = (await import(path.join(dir, `${lang}.ts`))) as Record<string, Record<string, string>>
    const messages = mod[lang] ?? {}
    out[lang] = Object.fromEntries(Object.entries(messages).filter(([key]) => key.startsWith('publishing.')))
  }
  return { 'studio.publishing': out }
}

async function pilot(root: string): Promise<{ ok: boolean; checks: Array<{ id: string; status: string; evidence: string }> }> {
  const previous = process.env.BRAND_OS_DATA_KEY
  process.env.BRAND_OS_DATA_KEY = crypto.randomBytes(32).toString('base64')
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-visual-pilot-'))
  try {
    const { runCrossBrandPilot } = await import('@brand-os/brand-core/visual/pilot')
    return runCrossBrandPilot(base, { root })
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
    if (previous === undefined) delete process.env.BRAND_OS_DATA_KEY
    else process.env.BRAND_OS_DATA_KEY = previous
  }
}

function table(rows: string[][], md: boolean): string {
  if (md) return [`| ${rows[0]!.join(' | ')} |`, `| ${rows[0]!.map(() => '---').join(' | ')} |`, ...rows.slice(1).map((row) => `| ${row.join(' | ')} |`)].join('\n')
  const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => [...row[column]!].length)))
  return rows.map((row) => row.map((cell, column) => cell + ' '.repeat(widths[column]! - [...cell].length)).join('  ')).join('\n')
}

function render(report: VisualAuditReport, lang: VisualLang, md: boolean, gate: GateResult | null, policy: ReleaseGatePolicy, pilotResult: Awaited<ReturnType<typeof pilot>> | null): string {
  const t = AUDIT_TEXT[lang]
  const lines: string[] = [md ? `## ${t.title}` : t.title, '']
  const rows = [[t.headers.module, t.headers.slice, t.headers.audience, t.headers.score, t.headers.next]]
  for (const module of report.modules) {
    const score = module.status === 'present' ? `${module.score}/5` : t.status[module.status]
    rows.push([module.id, module.slice, t.audience[module.audience], score, module.next ? t.checks[module.next] : module.status === 'present' ? '—' : ''])
  }
  lines.push(table(rows, md), '')
  lines.push(md ? `### ${t.standards.title}` : t.standards.title, '')
  const standards = [['framework_id', t.standards.checked, t.standards.reviewer, t.standards.citedBy, '']]
  for (const standard of report.standards) standards.push([standard.framework_id, standard.verified_on ?? '—', standard.reviewer, standard.cited_by.join(', ') || t.none, standard.verification === 'verified' ? t.standards.verified : t.standards.pending])
  lines.push(table(standards, md), '')
  lines.push(`${t.gate.threshold}: ${policy.public_min_score}/5`)
  if (pilotResult) {
    lines.push('', md ? `### ${t.pilot.title}` : t.pilot.title, pilotResult.ok ? t.pilot.passed : t.pilot.failed)
    for (const check of pilotResult.checks) lines.push(`- ${check.id}: ${t.status[check.status as 'pass' | 'fail']} — ${check.evidence}`)
  }
  if (gate) {
    lines.push('', `${gate.ok ? t.gate.passed : t.gate.failed} (${gate.mode === 'release' ? t.gate.release : t.gate.ci})`)
    for (const failure of gate.failures) lines.push(`- ${failure}`)
    if (gate.release_blockers.length) lines.push(`${t.gate.blockers}:`, ...gate.release_blockers.map((line) => `- ${line}`))
    if (gate.overridden.length) lines.push(`${t.gate.overridden}:`, ...gate.overridden.map((line) => `- ${line}`))
    if (gate.pending.length) lines.push(`${t.gate.pendingModules}: ${gate.pending.join(', ')}`)
    if (gate.notes.length) lines.push(`${t.gate.notes}:`, ...gate.notes.map((line) => `- ${line}`))
  }
  return lines.join('\n')
}

function safeOut(root: string, file: string): string {
  const target = path.resolve(root, file)
  const rel = path.relative(root, target).split(path.sep)
  if (rel[0] === 'brand' || rel.includes('.private') || target.split(path.sep).includes('.private')) throw new Error('--out may not write into brand/ or a .private folder')
  return target
}

async function main(): Promise<void> {
  const root = process.cwd()
  const args = parse(process.argv.slice(2))
  const policy = JSON.parse(fs.readFileSync(path.join(root, RELEASE_GATE_POLICY_PATH), 'utf8')) as ReleaseGatePolicy
  const report = auditVisualModules({ root, catalogs: await studioCatalogs(root) })
  const pilotResult = args.pilot ? await pilot(root) : null
  const gate = args.gate ? evaluateGate(report, policy, { release: args.release, today: new Date().toISOString().slice(0, 10) }) : null
  if (gate && pilotResult && !pilotResult.ok) {
    gate.ok = false
    gate.failures.push(...pilotResult.checks.filter((check) => check.status === 'fail').map((check) => `pilot ${check.id}: ${check.evidence}`))
  }
  const text = args.format === 'json' ? `${JSON.stringify({ ...report, pilot: pilotResult, gate, policy: { public_min_score: policy.public_min_score, standards_block: policy.standards_block, overrides: policy.overrides.length } }, null, 2)}\n` : `${render(report, args.lang, args.format === 'md', gate, policy, pilotResult)}\n`
  if (args.out) fs.writeFileSync(safeOut(root, args.out), text)
  else process.stdout.write(text)
  if (gate && !gate.ok) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
})
