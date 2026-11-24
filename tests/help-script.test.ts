import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { renderHelp, SCRIPT_GROUPS } from '../scripts/help.js'

const scripts = (JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts

test('npm run help describes only scripts that exist, once each, and lists every other script', () => {
  assert.equal(scripts.help, 'tsx scripts/help.ts')
  const described = SCRIPT_GROUPS.flatMap((group) => group.scripts.map(([name]) => name))
  assert.deepEqual(described.filter((name) => !(name in scripts)), [], 'every described script exists in package.json')
  assert.equal(new Set(described).size, described.length, 'no script is described twice')
  for (const [, description] of SCRIPT_GROUPS.flatMap((group) => group.scripts)) assert.match(description, /^[A-Z].*\.$/, description)
  const out = renderHelp(scripts)
  for (const name of Object.keys(scripts)) if (name !== 'help') assert.match(out, new RegExp(`^  ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'm'), `${name} is listed`)
  assert.match(out, /^Check everything$/m)
})

test('a script missing from package.json is left out, and a new one shows up under Other scripts', () => {
  const out = renderHelp({ ci: 'x', 'brand:new-thing': 'y' })
  assert.match(out, /^ {2}ci {2}Run lint/m)
  assert.doesNotMatch(out, /brand:interview/)
  assert.match(out, /^Other scripts\n {2}brand:new-thing$/m)
})
