import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { checkSvg, inspectAssetForPublication, legacySvgGatePasses, svgPublicationIssues, validateAssets } from '@brand-os/asset-catalog'

const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'svg')
const fixture = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), 'utf8')
const codes = (svg: string): string[] => checkSvg(svg).issues.map((issue) => issue.code)
const SVG = (inner: string, extra = ''): string => `<svg xmlns="http://www.w3.org/2000/svg"${extra} viewBox="0 0 10 10">${inner}</svg>`

test('a Figma export with internal gradient and clip-path references passes as it is', () => {
  const check = checkSvg(fixture('figma-export.svg'))
  assert.deepEqual(check.issues, [])
  assert.equal(check.ok, true)
  assert.deepEqual(svgPublicationIssues(fixture('figma-export.svg')), [])
})

test('an Illustrator export is refused only for its <style> block, which is fixable', () => {
  const check = checkSvg(fixture('illustrator-export.svg'))
  assert.equal(check.ok, false)
  assert.equal(check.fixable, true)
  assert.deepEqual(check.issues.map((issue) => [issue.code, issue.line]), [['style-element', 4]])
})

test('an Inkscape export reports comments, editor data, metadata and style attributes, all fixable', () => {
  const check = checkSvg(fixture('inkscape-export.svg'))
  assert.equal(check.ok, false)
  assert.equal(check.fixable, true, JSON.stringify(check.issues.filter((issue) => !issue.fixable)))
  const found = new Set(check.issues.map((issue) => issue.code))
  for (const code of ['comment', 'editor-data', 'style-attribute'] as const) assert.ok(found.has(code), code)
})

test('the XML declaration alone no longer makes a file unpublishable', () => {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n${SVG('<rect width="10" height="10" fill="#fff"/>')}\n`
  assert.equal(legacySvgGatePasses(svg), true)
  assert.deepEqual(svgPublicationIssues(svg), [])
})

test('active content is refused and never called fixable', () => {
  const cases: Array<[string, string]> = [
    [SVG('<script>alert(1)</script>'), 'script'],
    [SVG('<foreignObject><div/></foreignObject>'), 'foreign-object'],
    [SVG('<image href="https://example.com/x.png"/>'), 'image'],
    [SVG('<use href="other.svg#a"/>'), 'use'],
    [SVG('<a href="https://example.com"><rect width="1" height="1"/></a>'), 'link'],
    [SVG('<animate attributeName="x" to="1"/>'), 'animation'],
    [SVG('<rect width="1" height="1" onclick="alert(1)"/>'), 'event-handler'],
    [SVG('<rect width="1" height="1" fill="url(https://example.com/p.svg#g)"/>'), 'external-reference'],
    [SVG('<rect width="1" height="1" fill="url(#nope)"/>'), 'missing-reference'],
    [SVG('<rect id="r" width="1" height="1"/><rect width="1" height="1" fill="url(#r)"/>'), 'reference-target'],
    [SVG('<linearGradient id="g" href="https://example.com/g.svg#x"/>'), 'external-reference'],
    [SVG('<rect width="1" height="1" fill="java&#115;cript:alert(1)"/>'), 'active-value'],
    [SVG('<style>@import url(https://example.com/x.css);</style>'), 'style-element'],
    [SVG('<style>@font-face { font-family: x; src: url(#f) }</style>'), 'font'],
    [SVG('<style>g > .a { fill: red }</style>'), 'style-element'],
    [SVG('<style>.a { behavior: url(x.htc) }</style>'), 'style-element'],
    ['<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>', 'doctype'],
    ['<html xmlns="http://www.w3.org/1999/xhtml"><svg xmlns="http://www.w3.org/2000/svg"/></html>', 'not-svg'],
    [SVG('<g xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></g>'), 'namespace'],
    [SVG('<rect width="1" height="1"/', ''), 'parse'],
  ]
  for (const [svg, code] of cases) {
    const check = checkSvg(svg)
    assert.equal(check.ok, false, `${code}: ${svg}`)
    assert.ok(check.issues.some((issue) => issue.code === code), `${code} expected, got ${JSON.stringify(check.issues)}`)
    assert.equal(check.fixable, false, `${code} must not be fixable: ${svg}`)
    assert.ok(svgPublicationIssues(svg).length > 0, `${code} must not be publishable`)
  }
})

test('a prefixed XHTML script that the old regex gate missed is refused', () => {
  const svg = SVG('<h:script>alert(1)</h:script>', ' xmlns:h="http://www.w3.org/1999/xhtml"')
  assert.ok(codes(svg).includes('namespace'))
  assert.equal(checkSvg(svg).fixable, false)
  // The regex gate now also sees a prefixed element name.
  assert.equal(legacySvgGatePasses(svg), false)
})

test('an SVG prefix alias is resolved, so <svg:script> is still a script', () => {
  const svg = SVG('<svg:script>alert(1)</svg:script>', ' xmlns:svg="http://www.w3.org/2000/svg"')
  assert.ok(codes(svg).includes('script'))
})

test('a stylesheet with simple class rules and allowlisted values is fixable', () => {
  const svg = SVG('<style>.a, .b { fill: #FDD80C; stroke: rgb(0, 0, 0); stroke-width: 1.5px; fill-rule: evenodd } #c { opacity: .5 }</style><path class="a" d="M0 0h1"/>')
  const check = checkSvg(svg)
  assert.equal(check.fixable, true, JSON.stringify(check.issues))
  for (const bad of ['.a { fill: red !important }', '.a { font-family: Arial }', '.a:hover { fill: red }', '[x] { fill: red }']) {
    assert.equal(checkSvg(SVG(`<style>${bad}</style>`)).fixable, false, bad)
  }
})

test('live text is a warning, not a refusal', () => {
  const check = checkSvg(SVG('<text x="1" y="5">Hi</text>'))
  assert.equal(check.ok, true)
  assert.deepEqual(check.warnings.map((warning) => warning.code), ['text'])
})

test('inspectAssetForPublication returns the structured issues for a refused SVG', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svg-check-'))
  fs.mkdirSync(path.join(root, 'brand/assets/mascot'), { recursive: true })
  const file = path.join(root, 'brand/assets/mascot/a.svg')
  fs.writeFileSync(file, fixture('illustrator-export.svg'))
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  const result = inspectAssetForPublication(root, 'brand/assets/mascot/a.svg', hash)
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.reason === 'active-svg' && result.issues?.[0]?.code === 'style-element' && result.issues[0].fixable)
})

test('validate reports a failing SVG with the normalize command, and provenance problems', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svg-validate-'))
  fs.mkdirSync(path.join(root, 'brand/assets/mascot'), { recursive: true })
  fs.writeFileSync(path.join(root, 'brand/assets/mascot/a.svg'), fixture('illustrator-export.svg'))
  const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'brand/assets/mascot/a.svg'))).digest('hex')
  const manifest = (extra: string): string =>
    `schema_version: 1\nassets:\n  - id: asset.mascot.a\n    name: A\n    status: approved\n    visibility: internal\n    path: brand/assets/mascot/a.svg\n    present: true\n    checksum_sha256: ${sha}\n${extra}`
  fs.writeFileSync(path.join(root, 'brand/assets/asset-manifest.yaml'), manifest(''))
  const errors = validateAssets(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0]!, /asset\.mascot\.a fails the SVG check: style-element \(line 4\).*Fixable: npm run brand:assets -- normalize asset\.mascot\.a/)

  fs.writeFileSync(path.join(root, 'brand/assets/mascot/a.svg'), fixture('figma-export.svg'))
  const figmaSha = crypto.createHash('sha256').update(fixture('figma-export.svg')).digest('hex')
  fs.writeFileSync(
    path.join(root, 'brand/assets/asset-manifest.yaml'),
    manifest(`    approved_sha256: ${'f'.repeat(64)}\n    derived_from:\n      path: brand/assets/mascot/a.svg\n      sha256: ${sha}\n    approval_carried_from: ${sha}\n`).replace(sha, figmaSha),
  )
  const more = validateAssets(root).join('\n')
  assert.match(more, /not the approved file/)
  assert.match(more, /derived_from\.path must be inside brand\/assets-src/)
  assert.match(more, /no normalizer\.version/)
  assert.match(more, /without an identical render_check/)
})
