import { frameworkClaimErrors, type FrameworkRegistry } from './framework-registry.js'
import registry from './frameworks.json' with { type: 'json' }
import type { FrameworkRef } from './model.js'

/**
 * The renderers' view of the framework registry: the copy bundled with this template code (not the brand
 * repository's copy), so a page can only cite a framework this code knows how to draw.
 */
let cached: ReadonlyMap<string, FrameworkRef> | null = null

/** The bundled registry, claim rules checked once. Throws when it is invalid, so a bad registry fails CI loudly. */
export function frameworkRegistry(): ReadonlyMap<string, FrameworkRef> {
  if (cached) return cached
  const doc = registry as unknown as FrameworkRegistry
  const errors = frameworkClaimErrors(doc)
  if (errors.length) throw new Error(`Invalid framework registry: ${errors.join('; ')}`)
  cached = new Map(doc.frameworks.map((ref) => [ref.framework_id, Object.freeze({ ...ref })]))
  return cached
}

export function frameworkRef(id: string): FrameworkRef {
  const ref = frameworkRegistry().get(id)
  if (!ref) throw new Error(`Framework ${id} is not in the framework registry`)
  return ref
}

/**
 * Business Model Canvas registry entry. The nine-zone logic is drawn as an original layout; Strategyzer's own
 * artwork is not copied and no licence is implied. Claim: informed by, never "official" or "certified".
 */
export const BMC_FRAMEWORK: FrameworkRef = frameworkRef('BMC')
