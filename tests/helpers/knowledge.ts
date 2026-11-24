import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { openWorkspace, resetKnowledgeCaches, writeStarterWorkspace, type KnowledgeWorkspace } from '@brand-os/brand-core'

/** A throwaway test key. Never a real BRAND_OS_DATA_KEY. */
export const TEST_DATA_KEY = crypto.randomBytes(32).toString('base64')

export function useTestKey(): void {
  process.env.BRAND_OS_DATA_KEY = TEST_DATA_KEY
}

export function brandDir(opts: { slug?: string; mutate?: (config: Record<string, unknown>) => void; gitignore?: boolean } = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-knowledge-'))
  writeStarterWorkspace(dir)
  const file = path.join(dir, 'brand', 'brand.config.yaml')
  const config = YAML.parse(fs.readFileSync(file, 'utf8')) as { brand: Record<string, unknown> } & Record<string, unknown>
  if (opts.slug) config.brand.slug = opts.slug
  opts.mutate?.(config)
  fs.writeFileSync(file, YAML.stringify(config))
  if (opts.gitignore !== false) fs.copyFileSync(path.resolve(import.meta.dirname, '..', '..', '.gitignore'), path.join(dir, '.gitignore'))
  resetKnowledgeCaches()
  return dir
}

export function workspace(opts: Parameters<typeof brandDir>[0] & { now?: () => Date } = {}): { root: string; ws: KnowledgeWorkspace } {
  const root = brandDir(opts)
  return { root, ws: openWorkspace(root, { now: opts.now }) }
}

/** Every file under `dir`, relative, POSIX separators. */
export function listTree(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else out.push(path.relative(dir, full).split(path.sep).join('/'))
    }
  }
  walk(dir)
  return out.sort()
}

/** Concatenated bytes of every file under `dir` (to assert a canary never lands anywhere). */
export function treeText(dir: string): string {
  return listTree(dir)
    .map((file) => fs.readFileSync(path.join(dir, file), 'utf8'))
    .join('\n')
}

export const PERSIAN_IDEA = 'بعد از ۷ روز یادگیری پشت‌سرهم، رتبه‌ی خلبان کاکادو را ارتقا بده. این یک فرضیه است، نه یک قانون تأییدشده.'
export const TURKISH_IDEA = 'Yedi gün üst üste öğrenen kullanıcının maskotu bir rütbe yükselsin. İstanbul ekibi bunu şimdilik bir fikir olarak tutuyor.'
