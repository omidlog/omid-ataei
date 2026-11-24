# syntax=docker/dockerfile:1
#
# Brand OS Studio production image (read-only viewer + owner-only private repository provisioner).
#
# Build context is the repository root; the root .dockerignore is an allowlist, so brand/, .env files,
# the docs app and .git never enter the build.
#
#   docker build -f infra/production/Dockerfile --build-arg BUILD_REVISION="$(git rev-parse HEAD)" \
#     -t brand-os-studio:"$(git rev-parse --short=12 HEAD)" .
#
# The base image is pinned by tag AND digest (multi-arch index of node:24.22.3-bookworm-slim). To
# upgrade, change both together after reviewing the Node release notes.
ARG NODE_IMAGE=node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54

# ---------------------------------------------------------------- build: bundle the server and CLI
FROM ${NODE_IMAGE} AS build
WORKDIR /src
ENV npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false
COPY package.json package-lock.json tsconfig.json ./
# Root tooling only (esbuild, tsx, yaml, ajv, ...): the docs app and its Docusaurus tree are not installed.
RUN npm ci --ignore-scripts --workspaces=false
COPY packages ./packages
COPY apps/studio ./apps/studio
COPY scripts/build-studio.ts ./scripts/build-studio.ts
RUN node --import tsx scripts/build-studio.ts --outdir /out/dist \
 && cp -R apps/studio/static /out/static \
 && test -s /out/dist/main.mjs && test -s /out/dist/cli.mjs

# ---------------------------------------------------------------- runtime: Node + bundle, non-root
FROM ${NODE_IMAGE} AS runtime
ARG BUILD_REVISION=unknown
LABEL org.opencontainers.image.title="brand-os-studio" \
      org.opencontainers.image.description="Brand OS Studio: authenticated read-only brand viewer and private repository provisioner" \
      org.opencontainers.image.source="https://github.com/omidlog/brand-os-template" \
      org.opencontainers.image.revision="${BUILD_REVISION}"
# Container layout is fixed: listen on the container network, data on the /data volume.
# Secrets are never baked in; they arrive at run time from the operator's env files.
ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=320 \
    STUDIO_HOST=0.0.0.0 \
    STUDIO_PORT=4100 \
    STUDIO_DATA_DIR=/data \
    STUDIO_BUILD_REVISION=${BUILD_REVISION}
WORKDIR /app
COPY --from=build /out/ /app/
# npm/npx/corepack are not needed at run time; removing them shrinks the attack surface.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
 && install -d -m 0700 -o node -g node /data \
 && chmod -R a-w /app
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4100/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
STOPSIGNAL SIGTERM
CMD ["node", "/app/dist/main.mjs"]
