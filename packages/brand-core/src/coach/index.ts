/**
 * Strategic Coach & Answer Assurance — owner-local, read-only, advisory.
 *
 * Entry points: `coachAnalyze` (one of the three modes) and `coachNext` (coach the last answered
 * question). Guide: `docs-internal/STRATEGIC_COACH.md`. CLI: `npm run brand:coach`.
 */
export * from './model.js'
export * from './lexicon.js'
export * from './i18n.js'
export * from './context.js'
export * from './quality.js'
export * from './follow-up.js'
export * from './consistency.js'
export * from './rules.js'
export * from './facet-rubrics.js'
export * from './analyze.js'
export * from './render.js'
export * from './moments.js'
