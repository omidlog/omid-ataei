import fs from 'node:fs'
import path from 'node:path'

/**
 * Copies the template's base token files (`brand/tokens/*.json`) into a fixture. Token tests pin the template's
 * EXAMPLE values, so they must not pick up a brand repository's own generated tokens, approvals or publication
 * (`brand/tokens/generated/`, `approvals.yaml`): those are real brand data once a brand runs brand:tokens:generate.
 */
export function copyTemplateTokens(repo: string, root: string): void {
  const from = path.join(repo, 'brand', 'tokens')
  const to = path.join(root, 'brand', 'tokens')
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.json')) fs.copyFileSync(path.join(from, entry.name), path.join(to, entry.name))
  }
}
