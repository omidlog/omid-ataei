import type { IncomingMessage } from 'node:http'
import { isLoopback, type StudioConfig } from '../config.js'

export interface RequestGuards {
  clientIp: (req: IncomingMessage) => string
  hostAllowed: (req: IncomingMessage) => boolean
  sameOrigin: (req: IncomingMessage) => boolean
}

/** Request checks that depend only on the Studio configuration: client address, Host allowlist, same origin. */
export function requestGuards(config: StudioConfig): RequestGuards {
  /**
   * The client address for rate limits. Behind the single trusted reverse proxy, the proxy appends the
   * address it saw as the LAST X-Forwarded-For entry; anything to its left came from the client and
   * can be forged, so only the rightmost hop is used.
   */
  function clientIp(req: IncomingMessage): string {
    if (config.trustProxy) {
      const forwarded = req.headers['x-forwarded-for']
      const value = Array.isArray(forwarded) ? forwarded.join(',') : forwarded
      const hop = value?.split(',').map((item) => item.trim()).filter(Boolean).pop()
      if (hop && hop.length <= 64) return hop
    }
    return req.socket.remoteAddress ?? 'unknown'
  }

  /**
   * Beyond loopback, Studio answers only for its public host (DNS rebinding, stray virtual hosts).
   * The proxy passes the original Host through. `/healthz` stays reachable for the container check.
   */
  const publicHostname = new URL(config.publicOrigin).hostname.toLowerCase()
  const expectedHostname = isLoopback(publicHostname) ? null : publicHostname
  function hostAllowed(req: IncomingMessage): boolean {
    if (expectedHostname === null) return true
    const header = req.headers.host
    if (!header || header.length > 300) return false
    try {
      // The hostname decides (DNS rebinding uses a foreign name); the port depends on the proxy hop.
      return new URL(`http://${header}`).hostname === expectedHostname
    } catch {
      return false
    }
  }

  function sameOrigin(req: IncomingMessage): boolean {
    const origin = req.headers.origin
    if (typeof origin === 'string') return origin === config.publicOrigin
    const site = req.headers['sec-fetch-site']
    if (typeof site === 'string') return site === 'same-origin' || site === 'none'
    return true
  }

  return { clientIp, hostAllowed, sameOrigin }
}
