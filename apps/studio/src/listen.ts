import http from 'node:http'

/**
 * The Node HTTP server Studio runs on, with timeouts suited to sitting behind one reverse proxy.
 *
 * - `keepAliveTimeout` is longer than the proxy's idle upstream keep-alive (the Caddy snippet uses
 *   30s), so Node never closes a pooled connection the proxy is about to reuse (which shows up as
 *   sporadic 502s).
 * - `headersTimeout` and `requestTimeout` bound slow or stuck clients.
 * - `maxHeaderSize` stays small: Studio needs only a session cookie and a few headers.
 */
export const SERVER_TIMEOUTS = {
  keepAliveTimeout: 65_000,
  headersTimeout: 20_000,
  requestTimeout: 60_000,
  maxHeaderSize: 16 * 1024,
} as const

export function createHttpServer(handle: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>): http.Server {
  const server = http.createServer({ maxHeaderSize: SERVER_TIMEOUTS.maxHeaderSize }, (req, res) => void handle(req, res))
  server.keepAliveTimeout = SERVER_TIMEOUTS.keepAliveTimeout
  server.headersTimeout = SERVER_TIMEOUTS.headersTimeout
  server.requestTimeout = SERVER_TIMEOUTS.requestTimeout
  return server
}
