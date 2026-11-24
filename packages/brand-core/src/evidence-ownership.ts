import fs from 'node:fs'
import path from 'node:path'
import { readFacts } from './facts.js'

/**
 * Owner-controlled sources (BOS-18).
 *
 * A page on the owner's own website, or on the website of a venture the owner founded or owns, is the
 * owner's own publication. It may be a perfectly good place to show a claim, but it is not independent of
 * the owner, so it never counts as independent verification. This module derives the brand's own
 * locations from approved facts only, so a guess never widens or narrows them:
 *
 * - `personal.contact.public_channels` (the professional contact: site, booking link, work email domain)
 * - the website-related personal answers: `personal.content.channels`, `personal.consulting.cta`
 * - `personal.experience.relationships` entries the person `founded` or `co-founded`, or marks `owner` or
 *   `co-owner`, when the organization text names a domain; and `personal.founder.ventures`
 *
 * Shared platforms (LinkedIn, YouTube, Medium, …) are matched by host and path prefix, so the owner's own
 * profile counts as owner-published while another person's page on the same platform does not. Public
 * mail providers never make a whole domain the owner's.
 *
 * Matching only ever marks a source as owned (more conservative). An explicit `owned: false` on a
 * register entry cannot override a domain match.
 */

export interface OwnedLocation {
  /** Lowercase host without `www.`. */
  host: string
  /** For a shared platform: the owner's path prefix, lowercase, without a trailing slash. Null: the whole host and its subdomains. */
  path: string | null
  /** The approved fact the location came from. */
  from: string
}

/** Hosts shared by many people. A bare host here never makes every page on it the owner's. */
export const SHARED_PLATFORM_HOSTS = [
  'linkedin.com', 'x.com', 'twitter.com', 'instagram.com', 'facebook.com', 'threads.net', 'tiktok.com', 'youtube.com', 'youtu.be',
  'medium.com', 'github.com', 'gitlab.com', 'behance.net', 'dribbble.com', 'vimeo.com', 'pinterest.com', 'reddit.com', 'calendly.com',
  'cal.com', 'linktr.ee', 'notion.site', 'substack.com', 't.me', 'telegram.me', 'wa.me', 'aparat.com', 'virgool.io', 'google.com',
  'docs.google.com', 'forms.gle', 'bit.ly', 'about.me', 'bsky.app', 'mastodon.social', 'soundcloud.com', 'spotify.com', 'apple.com',
] as const

/** Public mail providers: a work email at one of these names no owned domain. */
const MAIL_PROVIDERS = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'yandex.com', 'aol.com', 'gmx.com', 'mail.com'])

/** Facts whose URLs and domains are the owner's own locations. */
export const OWNED_LOCATION_FACTS = ['personal.contact.public_channels', 'personal.content.channels', 'personal.consulting.cta', 'personal.founder.ventures'] as const

const OWNING_RELATIONS = new Set(['founded', 'co-founded'])
const OWNING_STATES = new Set(['owner', 'co-owner'])

// A URL or a bare domain (`example.com/path`). Hosts need a letter-only TLD of two or more characters.
const LOCATION = /(?:https?:\/\/)?((?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+[a-z]{2,24})(\/[^\s;,|)<>"'«»]*)?/giu
const EMAIL = /[\p{L}\p{N}._%+-]+@((?:[\p{L}\p{N}-]+\.)+[a-z]{2,24})/giu

function normalHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '')
}

/** Platforms that give each person their own subdomain (`name.substack.com`): the subdomain is the owner's. */
const PER_PERSON_SUBDOMAINS = new Set(['substack.com', 'notion.site', 'medium.com'])

function sharedPlatform(host: string): boolean {
  return SHARED_PLATFORM_HOSTS.some((platform) => host === platform || (host.endsWith(`.${platform}`) && !PER_PERSON_SUBDOMAINS.has(platform)))
}

function cleanPath(raw: string | undefined): string {
  return (raw ?? '').toLowerCase().replace(/[?#].*$/, '').replace(/[.]+$/, '').replace(/\/+$/, '')
}

/** Every host (with its path) a piece of text names: URLs, bare domains and the domains of email addresses. */
function hostsIn(text: string): Array<{ host: string; path: string; email: boolean }> {
  const out: Array<{ host: string; path: string; email: boolean }> = []
  for (const match of text.matchAll(EMAIL)) out.push({ host: normalHost(match[1]!), path: '', email: true })
  for (const match of text.replace(EMAIL, ' ').matchAll(LOCATION)) out.push({ host: normalHost(match[1]!), path: cleanPath(match[2]), email: false })
  return out
}

/** Owned locations named in one piece of text. */
export function locationsIn(text: string, from: string): OwnedLocation[] {
  const out: OwnedLocation[] = []
  for (const { host, path, email } of hostsIn(text)) {
    if (MAIL_PROVIDERS.has(host)) continue
    if (sharedPlatform(host)) {
      // A bare platform host (or an email at one) says nothing about which page is the owner's.
      if (!email && path.length > 1) out.push({ host, path, from })
      continue
    }
    out.push({ host, path: null, from })
  }
  return out
}

function textOf(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.filter((entry) => typeof entry === 'string').join('; ')
  return null
}

/** The relationships answer, canonical form: `relation | organization | from | to | ownership: state; …`. */
function ownedVentureText(value: unknown): string {
  const text = textOf(value)
  if (!text) return ''
  return text
    .split(/;\s*/)
    .map((entry) => entry.split('|').map((part) => part.trim()))
    .filter((parts) => OWNING_RELATIONS.has((parts[0] ?? '').toLowerCase()) || OWNING_STATES.has((parts[4] ?? '').toLowerCase().replace(/^ownership:\s*/, '')))
    .map((parts) => parts[1] ?? '')
    .join('; ')
}

/** Owned locations from a map of approved fact values (id → value). */
export function ownedLocationsFrom(values: Record<string, unknown>): OwnedLocation[] {
  const out: OwnedLocation[] = []
  for (const id of OWNED_LOCATION_FACTS) {
    const text = textOf(values[id])
    if (text) out.push(...locationsIn(text, id))
  }
  const ventures = ownedVentureText(values['personal.experience.relationships'])
  if (ventures) out.push(...locationsIn(ventures, 'personal.experience.relationships'))
  const seen = new Set<string>()
  return out.filter((entry) => {
    const key = `${entry.host}${entry.path ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const locationCache = new Map<string, { key: string; value: OwnedLocation[] }>()

/** Owned locations of a brand workspace, from its approved facts. Missing or unreadable facts give none. */
export function ownedLocations(root: string): OwnedLocation[] {
  const file = path.join(root, 'brand', 'instance', 'approved-facts.yaml')
  let key: string
  try {
    const stat = fs.statSync(file)
    key = `${stat.size}:${stat.mtimeMs}`
  } catch {
    return []
  }
  // Re-read only when the approved facts changed, so a per-fact publication gate stays cheap.
  const cached = locationCache.get(file)
  if (cached?.key === key) return cached.value
  let facts: ReturnType<typeof readFacts>
  try {
    facts = readFacts(root, 'approved', '')
  } catch {
    return []
  }
  const values: Record<string, unknown> = {}
  for (const [id, fact] of Object.entries(facts)) if (fact.status === 'approved') values[id] = fact.value
  const value = ownedLocationsFrom(values)
  locationCache.set(file, { key, value })
  return value
}

/** The owned location a reference points at, or null. A reference without a recognizable host matches nothing. */
export function ownedMatch(reference: string, locations: OwnedLocation[]): OwnedLocation | null {
  if (locations.length === 0) return null
  const named = hostsIn(reference)
  for (const location of locations) {
    const hit = named.some((entry) =>
      location.path === null
        ? entry.host === location.host || entry.host.endsWith(`.${location.host}`)
        : !entry.email && entry.host === location.host && (entry.path === location.path || entry.path.startsWith(`${location.path}/`)),
    )
    if (hit) return location
  }
  return null
}
