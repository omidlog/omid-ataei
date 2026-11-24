export * from './model.js'
export { normalizeForSearch, snippetFor, tokenize, tokensOf } from './text.js'
export { openWorkspace, KNOWLEDGE_DIRS, restrictedKeyAvailable } from './workspace.js'
export type { KnowledgeWorkspace } from './workspace.js'
export { credentialFindings, safetyReport, safetyBlocksSharing } from './safety.js'
export type { SafetyReport } from './safety.js'
export {
  appendNote,
  archiveNote,
  captureNote,
  editNote,
  findNote,
  knownQuestionIds,
  noteExists,
  noteHistory,
  recoverNote,
  resetKnowledgeCaches,
  restoreNote,
  scanAll,
  scanScope,
} from './store.js'
export type { AppendResult, CaptureInput, CaptureResult, EditOp, LoadedNote, LoadProblem, ScanResult, SnapshotInfo, WriteResult } from './store.js'
export { APPROVAL_STATE, SOURCE_TYPE, backlinks, buildIndex, listNotes, relatedNotes, searchNotes, similarNotes, summarize } from './search.js'
export type { IndexState, LinkView, NoteFilters, NoteSummary, SearchHit } from './search.js'
export { confirmVisibility, detectVisibility, githubRepoFromRemote, shareNote, unshareNote } from './share.js'
export type { SharePreview, Visibility } from './share.js'
export { knowledgeDoctor, migrateNotes } from './doctor.js'
export type { KnowledgeDoctorReport, KnowledgeIssue } from './doctor.js'
export { candidateQuestions, KNOWLEDGE_REF_PREFIX, knowledgeRef, noteProvenance, parseKnowledgeRef, proposeFromNote, staleProposalIssues } from './proposals.js'
export type { Candidate, ProposalPreview, ProvenanceEntry, RefusedLink } from './proposals.js'
export { KNOWLEDGE_TOOL_LIMITS, KNOWLEDGE_TOOLS, knowledgeAccess, runKnowledgeTool } from './agent.js'
export type { KnowledgeTool, KnowledgeToolArgs, KnowledgeToolResult } from './agent.js'
export { buildStudioKnowledge, filterStudioKnowledge, STUDIO_KNOWLEDGE_LIMITS } from './studio.js'
export type { StudioKnowledgeFilter, StudioKnowledgeProjection, StudioNote, StudioNoteLink, StudioQuestionRef, WithheldReason } from './studio.js'
