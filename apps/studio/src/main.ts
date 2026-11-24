import { buildStudio } from './app.js'
import { ConfigError, isLoopback, loadConfig } from './config.js'
import { createHttpServer } from './listen.js'

/**
 * Starts Studio. Binds 127.0.0.1 by default; on a VPS the reverse proxy is the only public listener.
 * Configuration comes from the environment only (see apps/studio/.env.example). Nothing is printed
 * from a secret value.
 */
function main(): void {
  let config
  try {
    config = loadConfig()
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message)
      process.exit(1)
    }
    throw error
  }
  const log = (line: string): void => console.log(`[studio] ${new Date().toISOString()} ${line}`)
  const studio = buildStudio(config, { log })
  const server = createHttpServer(studio.handle)
  server.listen(config.port, config.host, () => {
    log(`listening on http://${config.host}:${config.port} (public origin ${config.publicOrigin})`)
    const revision = process.env.STUDIO_BUILD_REVISION
    if (revision && /^[0-9a-f]{7,40}$/.test(revision)) log(`build revision ${revision}`)
    if (!isLoopback(config.host)) log('bound beyond loopback: only the TLS reverse proxy may reach this port.')
    if (!isLoopback(config.host) && !config.trustProxy) log('warning: STUDIO_TRUST_PROXY is off, so rate limits see the proxy address, not the client.')
    if (!config.github.readToken) log('GitHub read access is not configured; brand pages cannot sync.')
    if (!config.github.provisionToken) log('Repository provisioning is not configured; the new-brand wizard is disabled.')
    studio.templateJob.start()
    studio.headPoll.start()
  })
  const stop = (): void => {
    log('shutting down')
    const job = studio.templateJob.stop()
    const poll = studio.headPoll.stop()
    server.close(() => {
      void Promise.allSettled([job, poll, studio.provisioning.settled(), studio.sync.settled()]).then(() => process.exit(0))
    })
    setTimeout(() => process.exit(0), 10_000).unref()
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}

main()
