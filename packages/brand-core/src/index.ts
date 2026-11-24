export { templateConfig } from './config.js'
export {
  CHANGE_DEPTHS,
  changeDepthApplies,
  DEFAULT_IDENTITY_CHOICE,
  IDENTITY_INTAKE_SOURCES,
  IDENTITY_INTENTS,
  identityIntakeRecord,
  LOGO_PRESENCE,
  readIdentityIntake,
  validateIdentityChoice,
} from './identity-intake.js'
export type { ChangeDepth, IdentityChoice, IdentityField, IdentityIntake, IdentityIntakeError, IdentityIntakeRead, IdentityIntakeSource, IdentityIntent, LogoPresence } from './identity-intake.js'
export { allModules, allQuestions, moduleById } from './content/index.js'
export { buildMascotCatalog, CANONICAL_ANGLES, CORE_MOTIONS, EXAMPLE_STAGES, catalogCounts } from './content/mascot-catalog.js'
export { InterviewEngine, applyInit, dispositionFor, emptySession, assertSlug, upgradeCore, syncManifest, personalInit } from './engine.js'
export { completenessScope, listProfiles, loadProfile, profileErrors, UNIVERSAL_PROFILE } from './profiles.js'
export { PERSONAL_BRAND, PERSONAL_SHARED_QUESTIONS, STARTER_PROFILES } from './content/profiles.js'
export { addPersonalStrategyQuestions, addProfileAdditions, addProfileQuestions, PROFILE_ADDITIONS, canonicalReferenceErrors, ensureStarterProfiles, migratePersonal, PERSONAL_CANONICAL_REFERENCES, PERSONAL_STRATEGY_QUESTIONS } from './personal.js'
export type { CanonicalReference } from './personal.js'
export {
  addEvidence,
  CLAIM_VERIFICATIONS,
  claimEvidence,
  claimVerification,
  EVIDENCE_KINDS,
  EVIDENCE_SOURCES,
  EVIDENCE_STATUSES,
  evidenceFor,
  evidencePath,
  gatePasses,
  isIndependentSource,
  ownerPartLabel,
  publicationBlockers,
  readEvidence,
  unpublishBlocked,
  verificationNote,
  withOwnership,
} from './evidence.js'
export { locationsIn, OWNED_LOCATION_FACTS, ownedLocations, ownedLocationsFrom, ownedMatch, SHARED_PLATFORM_HOSTS } from './evidence-ownership.js'
export type { OwnedLocation } from './evidence-ownership.js'
export type { AddEvidenceInput, ClaimEvidence, ClaimVerification, EvidenceItem, EvidenceKind, EvidenceSource, EvidenceStatus } from './evidence.js'
export { RIGHTS_SUBJECTS, rightsBlocker, rightsSubject } from './asset-rights.js'
export type { RightsSubject } from './asset-rights.js'
export { moduleEnabled, personalConfig, questionApplies } from './conditions.js'
export { brandApplicability, BUSINESS_FACETS, frameworksApplyTo, PERSONAL_FRAMEWORK_SOURCES, VENTURE_PATH_NOTE } from './applicability.js'
export type { ApplicabilityState, BrandApplicability, FrameworkRef, FrameworkSourceRow } from './applicability.js'
export { namesPrivacyCategories, PRIVATE_CATEGORY_NAMES, PRIVATE_CUES, privateDataFindings, privateDataRefusal } from './personal-privacy.js'
export type { PrivateDataFinding, PrivateDataKind } from './personal-privacy.js'
export { OWNERSHIP_STATES, RELATION_TYPES } from './structured.js'
export type { OwnershipState, RelationshipEntry, RelationType } from './structured.js'
export type { InterviewProfile } from './profiles.js'
export {
  applyProposalBatch,
  INTAKE_LIMITS,
  intakeLogPath,
  ModelOutputSchema,
  openConflicts,
  openFollowUps,
  parseItems,
  parseProposalBatch,
  ProposalItemSchema,
  quotationIsVerbatim,
  readIntakeLog,
  SOURCE_KINDS,
} from './proposal-intake.js'
export type { DroppedItem, IntakeConflict, IntakeItemResult, IntakeOrigin, IntakeOutcome, IntakeReport, ParseResult, ProposalBatch, ProposalItem } from './proposal-intake.js'
export { nextReport } from './interview-next.js'
export { assistTurn, buildPrompt, extractionCatalog, parseModelOutput, redactRestricted, resolveProvider, WITHHELD } from './llm/extract.js'
export type { AssistResult } from './llm/extract.js'
export { AnthropicProvider, ANTHROPIC_DEFAULT_MODEL, ANTHROPIC_ENDPOINT } from './llm/anthropic.js'
export { MockProvider } from './llm/mock.js'
export { completeWithLimits, DEFAULT_LIMITS, limitsFrom, LLM_PROVIDERS, llmConfigErrors, llmConfigOf, LlmError, RequestBudget } from './llm/provider.js'
export type { CatalogQuestion, CompletionRequest, LlmConfig, LlmErrorKind, LlmLimits, ModelProvider } from './llm/provider.js'
export { clauses, detectLocale, extractByRules } from './llm/rules.js'
export type { NextQuestion, NextReport } from './interview-next.js'
export { backupBrand, migrateBrand, resetInterviewState, restoreBrand, RESET_CONFIRMATION } from './backup.js'
export { writeAtomic } from './fsutil.js'
export { authorize, agentContext, agentTokenContext, AGENT_PROFILES, guestContext, isAgentProfile, operatorContext, verifiedHumanContext } from './auth.js'
export type { AgentProfile, AuthContext, Audience, Role } from './auth.js'
export {
  AGENT_TOKEN_ENV,
  AgentTokenError,
  agentTokenPath,
  issueAgentToken,
  listAgentTokens,
  resolveAgentContext,
  revokeAgentToken,
} from './agent-tokens.js'
export type { AgentTokenSummary } from './agent-tokens.js'
export { accessLogPath, appendAccessLog, readAccessLog } from './access-log.js'
export type { AccessLogEntry } from './access-log.js'
export { approvalProofMatches } from './private-store.js'
export { compileModulePages } from './compile-docs.js'
export { readPublicationPolicy, factIsPublic, assetIsPublic, pageIsPublic } from './publication.js'
export { readFacts, writeFacts, migrateFactFiles } from './facts.js'
export { importFigmaVariables } from './figma.js'
export { allocateBudget, financeScenario } from './artifacts.js'
export { ensureApprovalSecret } from './private-store.js'
export { formatDoctor, runDoctor, MIN_NODE_MAJOR } from './doctor.js'
export type { DoctorCheck, DoctorReport, DoctorStatus } from './doctor.js'
export { renderBusinessArtifacts } from './artifacts.js'
export type { InitInput, StepResult, ImpactReport } from './engine.js'
export { writeStarterWorkspace } from './materialize.js'
export { completeness, isOpenAnswer, latestAnswers } from './completeness.js'
export { findContradictions } from './contradictions.js'
export { buildDashboard, PUBLIC_DASHBOARD_NOTE } from './dashboard.js'
export type { Dashboard, DashboardContradiction, DashboardModule, DashboardReviewItem, InternalDashboard, PublicDashboardStub } from './dashboard.js'
export { approvalGrantErrors, APPROVAL_GRANTS, canApprove, isApprovalGrant, permissionFor } from './permissions.js'
export type { ApprovalGrant } from './permissions.js'
export { ApprovalService, readProposals } from './approval.js'
export type {
  ApprovalStep,
  BatchItemResult,
  BatchOutcome,
  BatchResult,
  ChangeProposal,
  PendingKind,
  PlanDecision,
  PlanEntry,
  PublishOutcome,
  PublishResult,
  ReviewItem,
  ReviewQueue,
  Selection,
} from './approval.js'
export {
  brandRetrieve,
  RETRIEVE_KINDS,
  getAssetMetadata,
  getBrandGuidelines,
  getBrandOverview,
  getBrandStatus,
  getBrandTokens,
  getBusinessPlan,
  getDesignComponent,
  getLogoRules,
  getMarketingPlan,
  getMascotGuidelines,
  getMascotProfile,
  getMotionGuidelines,
  getSocialTemplate,
  listMascotAssets,
  listMascotStages,
  resolveAgentRequest,
  searchBrandDocs,
  searchMascotAssets,
} from './query.js'
export type { MascotFilters, NamedFactTool, RetrieveKind, RetrieveRequest, RetrievedItem, ToolResult } from './query.js'
export { DRAFT_RULES, draftPersonalContent, MASCOT_FILTER_KEYS, NAMED_FACT_TOOL_IDS } from './query.js'
export { asciiDigits, isStructuredType, normalizeStructured, parseStructured, STRUCTURED_FORMATS, STRUCTURED_TYPES, structuredFor } from './structured.js'
export type { ColorEntry, FontEntry, LogoSpec, StructuredType, StructuredValue, VoicePair } from './structured.js'
export {
  applyEntityOperation,
  ENTITY_LIMITS,
  ENTITY_LIST_SCHEMA,
  ENTITY_OPERATIONS,
  ENTITY_QUESTION_IDS,
  ENTITY_SPECS,
  entityFormat,
  entityLines,
  entityOptionLabel,
  entitySpec,
  isCanonicalEntityValue,
  normalizeEntityAnswer,
  parseEntityLines,
  readEntityList,
  serializeEntityList,
  sourceRefKind,
  specForPrefix,
  validateEntityList,
} from './entities.js'
export type { EntityFieldSpec, EntityItem, EntityList, EntityOperation, EntityRead, EntitySpec, SourceRefKind } from './entities.js'
export { formatEntityMigration, migrateEntityAnswers } from './entity-migration.js'
export type { EntityMigrationReport } from './entity-migration.js'
export { BOOLEAN_WORDS, booleanWord, questionHelp } from './i18n.js'
export { approveAssets } from './asset-approval.js'
export type { AssetApprovalOutcome, AssetApprovalResult } from './asset-approval.js'
export { approveAllPending, dryRunNotice, dryRunReport, formatAllPending, formatDryRun, PENDING_KINDS, planAllPending } from './approve-all.js'
export type { AllPendingItem, AllPendingOutcome, AllPendingPlan, AllPendingResult, DryRunItem, DryRunReport } from './approve-all.js'
export {
  forgetKeychainProof,
  KEYCHAIN_ENV,
  KEYCHAIN_SERVICE,
  keychainAvailable,
  readKeychainProof,
  resolveApprovalProof,
  storeKeychainProof,
  systemKeychainRunner,
} from './approval-proof.js'
export type { KeychainOptions, KeychainRun, KeychainRunner, KeychainStoreOutcome, KeychainStoreResult, ProofSource, ProofSources } from './approval-proof.js'
export { ANSWER_ORIGINS, answerProvenance, provenanceLabel } from './provenance.js'
export type { AnswerOrigin, AnswerProvenance } from './provenance.js'
export { approveTokens, generateTokens, publishTokens, readTokenApprovals, TOKEN_SOURCE_QUESTIONS, TOKEN_SOURCES, tokenNextStep } from './token-generate.js'
export type { GeneratedTokenResult, SemanticMapReport, TokenGenerateReport, TokenOutcome, TokenReviewOutcome, TokenReviewResult, TokenSourceState } from './token-generate.js'
export {
  BRAND_ROLE_PREFIX,
  brandRoleTokenId,
  parseSemanticMap,
  SEMANTIC_COLOR_SLOTS,
  SEMANTIC_MAP_FORMAT,
  SEMANTIC_MAP_QUESTION,
  SEMANTIC_SLOTS,
  semanticAnswerText,
  semanticSlotOf,
  suggestSemanticMap,
} from './token-semantic.js'
export type { ParsedSemanticMap, SemanticAssignment, SemanticSlot, SemanticSuggestion } from './token-semantic.js'
export {
  BRAND_BOOK,
  buildBrandBook,
  buildBusinessPlan,
  buildDocument,
  buildMarketingPlan,
  buildNamedDocument,
  BUSINESS_PLAN,
  DOCUMENT_KINDS,
  ITEM_TAGS,
  MARKETING_PLAN,
  renderDocumentMarkdown,
  buildEvidenceRegister,
  buildPersonalDocument,
  lengthReport,
  PERSONAL_DOCUMENT_KINDS,
  PERSONAL_SPECS,
  composeDrafts,
  countWords,
  DRAFT_CONNECTORS,
  DRAFT_LABEL,
  DRAFT_LOCALES,
  draftLocales,
  factLanguage,
  localizedSegments,
  TRANSLATION_COMPANIONS,
} from './documents/index.js'
export type { DocumentAudience, DocumentItem, DocumentKind, DocumentModel, DocumentSection, DocumentSpec, ItemTag, LengthReport, PersonalDocumentKind, SectionSpec } from './documents/index.js'
export type { ComposedDraft, ComposeSource, DraftLocale, FactLanguage, UntranslatedFact } from './documents/index.js'
export { evaluateCondition } from './conditions.js'
export { questionTextDrift, tokenCssBuildNote, validateRepo } from './validate-repo.js'
export { addMissingQuestions, bankName, refreshQuestionText } from './question-text.js'
export { PERSONAL_FACETS, PROPOSAL_STATES, PUBLICATION_REQUIREMENTS } from './types.js'
export type { BrandConfig, FieldQuestion, ModuleDef, AnswerRecord, PersonalFacet, PersonalModuleConfig, ProposalState, PublicationRequirement } from './types.js'
export {
  arr,
  breakEven,
  cac,
  churnRate,
  computeFinance,
  FINANCE_BASES,
  FINANCE_INPUTS,
  FINANCE_METRICS,
  FINANCE_PERIODS,
  FinanceInputError,
  formatFinanceReport,
  grossMarginPct,
  grossProfit,
  ltv,
  ltvToCac,
  mrr,
  netBurn,
  parseFinanceInputs,
  projectScenario,
  retentionRate,
  runway,
} from './finance.js'
export type { FinanceBasis, FinanceInputs, FinancePeriod, FinanceReport, FinanceResult, FinanceScenario, ScenarioResult } from './finance.js'
export { FinanceInputPathError, resolveFinanceInputPath, RESTRICTED_FINANCE_DIR, runFinanceFile } from './finance-input.js'
export { isMascotLifecycle, MASCOT_LIFECYCLE, migrateMascotCatalog, validateMascotLifecycle } from './mascot-lifecycle.js'
export type { MascotArtwork, MascotLifecycle, MascotMigration } from './mascot-lifecycle.js'
export * from './knowledge/index.js'
/**
 * Task Context Engine (`docs-internal/TASK_CONTEXT.md`). Exported from the main entry on purpose: the Visual
 * Blueprint PR adds its own subpath lines to tsconfig.json and packages/brand-core/package.json, and this slice
 * stays out of those two files.
 */
export * from './task-context/index.js'
export {
  applyTemplateUpdate,
  classifyPath,
  defaultUpdateBranch,
  formatUpdatePlan,
  globToRegExp,
  isWriteAction,
  planChanges,
  parseSyncManifest,
  planTemplateUpdate,
  readSyncManifest,
  readTemplateRecord,
  SYNC_MANIFEST_PATH,
  TEMPLATE_RECORD_PATH,
  templateRecordText,
  updateCommitMessage,
  writeTemplateRecord,
} from './template-sync.js'
export { formatMigrationRuns, migrationFiles, migrationPaths, MIGRATIONS_DIR, parseMigration, pendingMigrations, planMigrations } from './template-migrations.js'
export type { DeleteOperation, Migration, MigrationOperation, MigrationRun, MigrationSources } from './template-migrations.js'
export type { ApplyResult, ChangeSources, Classification, PlannedChange, SyncKind, SyncManifest, SyncRule, TemplateRecord, UpdateAction, UpdatePlan } from './template-sync.js'
export { checkLogoMastersInRepo, checkLogoMastersReference, isExampleAsset } from './logo-masters.js'
export type { LogoMastersCheck } from './logo-masters.js'
