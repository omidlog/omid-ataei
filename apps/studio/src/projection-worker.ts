import { parentPort, workerData } from 'node:worker_threads'
import { extractTarGz, studioPathAllowed } from './github/tar.js'
import { buildProjection, ProjectionError } from './projection.js'

/**
 * Builds one brand projection off the request event loop (BOS-14). The main thread hands over the
 * downloaded tarball, the checkout folder and the expected slug, and gets back the projection and the
 * preview list, or a serialized error. The worker reads only the tarball it is given and writes only
 * inside `checkout`.
 */
export interface ProjectionJob {
  archive: Uint8Array
  checkout: string
  slug: string
}

export type ProjectionReply =
  | { ok: true; projection: unknown; previews: Array<{ key: string; source: string; mime: string }> }
  | { ok: false; projectionCode: ProjectionError['code'] | null; message: string }

export function runProjectionJob(job: ProjectionJob): ProjectionReply {
  try {
    extractTarGz(Buffer.from(job.archive.buffer, job.archive.byteOffset, job.archive.byteLength), { destRoot: job.checkout, include: studioPathAllowed })
    const built = buildProjection(job.checkout, job.slug)
    return { ok: true, projection: built.projection, previews: built.previews }
  } catch (error) {
    if (error instanceof ProjectionError) return { ok: false, projectionCode: error.code, message: error.message }
    return { ok: false, projectionCode: null, message: error instanceof Error ? error.message : String(error) }
  }
}

if (parentPort && workerData && (workerData as { kind?: string }).kind === 'studio-projection') {
  parentPort.postMessage(runProjectionJob((workerData as { job: ProjectionJob }).job))
}
