import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { InterviewEngine } from '@brand-os/brand-core'

/**
 * Prints the docs audience a brand may publish: `public` only when brand.publish_docs is public,
 * otherwise `private`. CI uses it to skip the public docs build and scan for private brands (Studio
 * creates brands private by default, and prepare-docs refuses a public build for them).
 *
 * Usage: tsx scripts/docs-audience.ts [brand root]   (default: the current directory)
 * In GitHub Actions it also writes `publish=<audience>` to $GITHUB_OUTPUT.
 */
export function docsAudience(root: string): 'public' | 'private' {
  return new InterviewEngine(root).config().brand.publish_docs === 'public' ? 'public' : 'private'
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const audience = docsAudience(process.argv[2] ?? process.cwd())
  console.log(audience)
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `publish=${audience}\n`)
}
