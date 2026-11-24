import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { compileTokens, contrastRatio } from '@brand-os/design-tokens'
import { copyTemplateTokens } from './helpers/template-tokens.js'

test('token compiler emits CSS, TypeScript, and passing contrast pairs', () => {
  // The template's EXAMPLE tokens, never a brand repository's own generated tokens.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-tokens-'))
  copyTemplateTokens(process.cwd(), root)
  const compiled = compileTokens(root)
  fs.rmSync(root, { recursive: true, force: true })
  assert.deepEqual(compiled.errors, [])
  assert.match(compiled.css, /--color-brand-primary:\s*#123A73/)
  assert.match(compiled.css, /prefers-reduced-motion/)
  assert.match(compiled.typescript, /tokenStatus = "draft"/)
  assert.ok(compiled.contrast.length >= 8)
  assert.ok(compiled.contrast.every((pair) => pair.pass))
  assert.ok(contrastRatio('#1A1C1E', '#F7F5F2') >= 4.5)
})
