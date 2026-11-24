/**
 * The owner-local workspace bridge (GAP-09), exported apart from the pure `assurance` index.
 *
 * `@brand-os/brand-core/assurance` stays a pure library that reads no file. This entry point reads a
 * brand workspace (approved facts, research notes, the answer ledger) and is used only by the owner's
 * `brand:assurance` command. No MCP tool, Studio route or agent profile imports it. See
 * `docs-internal/ASSURANCE.md`, "Owner-local bridge to a real brand".
 */
export * from './workspace.js'
export * from './workspace-text.js'
export * from './reviews.js'
export * from './links.js'
