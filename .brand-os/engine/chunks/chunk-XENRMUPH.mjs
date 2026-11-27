import { createRequire as __engineRequire } from 'node:module'; const require = __engineRequire(import.meta.url);
import {
  creativeAccess
} from "./chunk-K5OCUCIU.mjs";
import {
  CREATIVE_LIMITS,
  CreativeError,
  PREFERENCE_ID,
  PROJECT_ID,
  VARIANT_ID,
  addVariantAuthorized,
  asAspects,
  asScopeLevel,
  asSurface,
  assertOwnerProcess2 as assertOwnerProcess,
  createProjectAuthorized,
  loadProject,
  preferenceDigest,
  readPreference,
  recordFeedbackAuthorized,
  scopeLabel,
  suggestPreferenceAuthorized,
  validatePreferenceId,
  validateProjectId,
  validateSeries
} from "./chunk-KOSTJMIK.mjs";
import {
  KnowledgeError,
  appendAccessLog,
  knowledgeRef,
  openWorkspace,
  safetyBlocksSharing,
  safetyReport,
  writeVaultFile
} from "./chunk-GNDTGU2Y.mjs";

// packages/brand-core/src/creative/learn.ts
var LEARN_LIMITS = {
  maxFeedbackChars: 4e3,
  maxBeforeAfterChars: 12e3
};
var LEARN_VERDICTS = ["change_request", "like", "observation"];
var LEARN_VARIANT = "A";
function learnProjectId(surface, series) {
  const id = `learn-${surface}-${series}`.slice(0, 40).replace(/-+$/, "");
  return validateProjectId(id);
}
function boundedText(value, max, field, required) {
  if (value === void 0 || value === null || value === "") {
    if (required) throw new CreativeError("invalid_input", `${field} is required.`);
    return null;
  }
  if (typeof value !== "string") throw new CreativeError("invalid_input", `${field} must be text.`);
  const text = value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  if (!text) {
    if (required) throw new CreativeError("invalid_input", `${field} is empty.`);
    return null;
  }
  if (text.length > max) throw new CreativeError("invalid_input", `${field} is longer than ${max} characters.`);
  return text;
}
function noteBody(feedback, before, after) {
  const parts = [feedback];
  if (before) parts.push("", "## Before", "", before);
  if (after) parts.push("", "## After (owner correction)", "", after);
  return parts.join("\n");
}
function asLearnVerdict(value) {
  if (value === void 0 || value === null) return "change_request";
  if (typeof value === "string" && LEARN_VERDICTS.includes(value)) return value;
  throw new CreativeError("invalid_input", `Verdict must be one of ${LEARN_VERDICTS.join(", ")}. A learned correction never rejects a variant.`);
}
function learn(ws, input, sourceKind, origin) {
  const surface = asSurface(input.surface);
  const series = validateSeries(input.series);
  const feedback = boundedText(input.feedback, LEARN_LIMITS.maxFeedbackChars, "Feedback", true);
  const before = boundedText(input.before, LEARN_LIMITS.maxBeforeAfterChars, "Before", false);
  const after = boundedText(input.after, LEARN_LIMITS.maxBeforeAfterChars, "After", false);
  const verdict = asLearnVerdict(input.verdict);
  const keep = asAspects(input.keep);
  const avoid = asAspects(input.avoid);
  const scope = asScopeLevel(input.scope ?? "series");
  const supersedes = input.supersedes ? validatePreferenceId(input.supersedes) : null;
  if (typeof input.rule !== "string" || !input.rule.trim()) throw new CreativeError("invalid_input", "A learned correction needs a short rule (what to do next time).");
  const projectId = learnProjectId(surface, series);
  let created = false;
  let project;
  try {
    project = loadProject(ws, projectId);
  } catch (error) {
    if (!(error instanceof CreativeError) || error.code !== "not_found") throw error;
    project = null;
  }
  if (project && (project.surface !== surface || project.series !== series)) {
    throw new CreativeError("refused", `Project ${projectId} belongs to ${project.surface}/${project.series}. Use a shorter series name.`);
  }
  if (!project) {
    try {
      createProjectAuthorized(ws, { project_id: projectId, title: `Learned corrections: ${surface} / ${series}`, surface, series, language: input.language ?? null });
      created = true;
    } catch (error) {
      if (!(error instanceof CreativeError) || error.code !== "exists") throw error;
    }
    project = loadProject(ws, projectId);
  }
  if (!project.variants.some((variant) => variant.variant_id === LEARN_VARIANT)) {
    try {
      addVariantAuthorized(ws, { project_id: projectId, variant_id: LEARN_VARIANT, asset: "missing", describe: "Learned corrections (no single asset)" });
    } catch (error) {
      if (!(error instanceof CreativeError) || error.code !== "exists") throw error;
    }
  }
  let recorded;
  try {
    recorded = recordFeedbackAuthorized(ws, {
      project_id: projectId,
      variant_id: LEARN_VARIANT,
      text: noteBody(feedback, before, after),
      language: input.language ?? null,
      source_kind: sourceKind,
      verdict,
      keep,
      avoid
    });
  } catch (error) {
    if (error instanceof KnowledgeError) throw new CreativeError("refused", error.message);
    throw error;
  }
  const pref = suggestPreferenceAuthorized(ws, {
    project_id: projectId,
    statement: input.rule,
    context: input.context ?? null,
    sources: [recorded.note.id],
    supersedes,
    requested_scope: scope,
    origin
  });
  return {
    project_id: projectId,
    project_created: created,
    feedback_id: recorded.feedback.feedback_id,
    note: { id: recorded.note.id, revision: recorded.note.revision, scope: recorded.note.scope },
    preference: { preference_id: pref.preference_id, state: "draft", statement: pref.statement, requested_scope: scope, supersedes: pref.supersedes },
    next_step: `Draft only. The owner approves it with: npm run brand:approve -- --all-pending (or npm run brand:creative -- approve --id ${pref.preference_id} --scope ${scope}). Until then, apply it only in this conversation.`,
    authorizes: []
  };
}
function learnFromCorrection(ws, input, sourceKind = "agent_capture") {
  assertOwnerProcess();
  return learn(ws, input, sourceKind, "owner");
}
var CREATIVE_LEARN_TOOL = "creative_learn";
var CREATIVE_LEARN_NOTICE = [
  "Records the owner\u2019s correction and drafts a rule. The rule is a DRAFT: it applies to new work only after the owner approves it.",
  "Record only what the owner said or changed in this conversation. Never invent feedback, and never record third-party text as feedback.",
  "Nothing here approves, publishes, posts or commits anything. authorizes is always empty."
];
function runCreativeLearnTool(engine, ctx, args) {
  const brandSlug = engine.config().brand.slug;
  const base = { tool: CREATIVE_LEARN_TOOL, brand_id: brandSlug, notice: CREATIVE_LEARN_NOTICE };
  const log = (decision, reason, returned = []) => appendAccessLog(engine.workspaceRoot(), ctx, {
    tool: CREATIVE_LEARN_TOOL,
    kind: "creative",
    requested_ids: typeof args?.supersedes === "string" && PREFERENCE_ID.test(args.supersedes) ? [args.supersedes] : [],
    returned_ids: returned,
    withheld_ids: [],
    query_sha256: null,
    decision,
    reason
  });
  const access = creativeAccess(ctx, brandSlug);
  if (!access.allow) {
    log("deny", access.reason);
    return { ...base, status: "denied", reason: access.reason, data: null };
  }
  try {
    const ws = openWorkspace(engine.workspaceRoot());
    const result = learn(ws, args, "agent_capture", "agent_capture");
    log("allow", "recorded", [result.project_id, result.feedback_id, result.note.id, result.preference.preference_id]);
    return { ...base, status: "ok", data: result };
  } catch (error) {
    if (error instanceof CreativeError) {
      const refused = error.code === "refused" || error.code === "wrong_brand" || error.code === "unsafe_path";
      log("deny", error.code);
      return { ...base, status: refused ? "refused" : "invalid", reason: error.message, data: null };
    }
    throw error;
  }
}

// packages/brand-core/src/creative/share.ts
import fs from "node:fs";
import path from "node:path";
var SHARED_DECISIONS_DIR = "brand/creative/shared";
var SHARED_DECISION_FILE = /^cp_[0-9a-f-]{36}\.json$/;
var PROVENANCE = /^knowledge:kn_[a-z0-9][a-z0-9-]{2,63}@[0-9a-f]{64}$/;
function decisionFrom(pref, now) {
  if (pref.state === "draft") throw new CreativeError("refused", `${pref.preference_id} is a draft. Only an approved or superseded decision can be shared.`);
  if (!pref.approval || pref.approval.digest !== preferenceDigest(pref)) throw new CreativeError("refused", `${pref.preference_id} does not match its approval record. It is not shared.`);
  const blocked = safetyBlocksSharing(safetyReport(`${pref.statement}
${pref.context ?? ""}`));
  if (blocked.length) throw new CreativeError("refused", `The statement or context looks like it contains ${blocked.join("; ")}. Nothing was shared.`);
  return {
    schema_version: 1,
    kind: "creative_decision",
    decision_id: pref.preference_id,
    brand_slug: pref.brand_slug,
    project_id: pref.project_id,
    statement: pref.statement,
    context: pref.context,
    scope: { level: pref.scope.level, label: scopeLabel(pref.scope) },
    state: pref.state,
    approved_at: pref.approval.approved_at,
    supersedes: pref.supersedes,
    superseded_by: pref.superseded_by,
    superseded_at: pref.superseded_at,
    sources: pref.sources.map((ref) => knowledgeRef(ref.id, ref.revision)),
    counterexamples: pref.counterexamples,
    shared_at: now
  };
}
function shareDecision(ws, input) {
  assertOwnerProcess();
  const pref = readPreference(ws, validatePreferenceId(input.preference_id));
  const now = ws.now().toISOString();
  const decision = decisionFrom(pref, now);
  const fileOf = (id) => `${SHARED_DECISIONS_DIR}/${id}.json`;
  const abs = (rel) => path.join(ws.root, ...rel.split("/"));
  const refresh = [];
  if (pref.supersedes && fs.existsSync(abs(fileOf(pref.supersedes)))) {
    const old = readPreference(ws, pref.supersedes);
    if (old.state === "superseded") refresh.push(decisionFrom(old, now));
  }
  if (!input.dryRun) {
    for (const item of [decision, ...refresh]) writeVaultFile(ws, abs(fileOf(item.decision_id)), `${JSON.stringify(item, null, 2)}
`, false);
  }
  return { path: fileOf(pref.preference_id), decision, written: !input.dryRun, refreshed: refresh.map((item) => fileOf(item.decision_id)) };
}
var STUDIO_CREATIVE_LIMITS = { maxItems: 300, maxFileBytes: 64 * 1024 };
var ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
function str(value, max) {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}
function nullableIso(value) {
  return value === null || typeof value === "string" && ISO.test(value);
}
function nullablePref(value) {
  return value === null || typeof value === "string" && PREFERENCE_ID.test(value);
}
function validSharedDecision(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const doc = value;
  const scope = doc.scope;
  return doc.schema_version === 1 && doc.kind === "creative_decision" && typeof doc.decision_id === "string" && PREFERENCE_ID.test(doc.decision_id) && typeof doc.brand_slug === "string" && typeof doc.project_id === "string" && PROJECT_ID.test(doc.project_id) && str(doc.statement, CREATIVE_LIMITS.maxStatementChars) && (doc.context === null || str(doc.context, CREATIVE_LIMITS.maxContextChars)) && !!scope && typeof scope === "object" && (scope.level === "project" || scope.level === "series") && str(scope.label, 120) && (doc.state === "approved" || doc.state === "superseded") && typeof doc.approved_at === "string" && ISO.test(doc.approved_at) && nullablePref(doc.supersedes) && nullablePref(doc.superseded_by) && nullableIso(doc.superseded_at) && Array.isArray(doc.sources) && doc.sources.length <= CREATIVE_LIMITS.maxSources && doc.sources.every((item) => typeof item === "string" && PROVENANCE.test(item)) && Array.isArray(doc.counterexamples) && doc.counterexamples.length <= CREATIVE_LIMITS.maxCounterexamples && doc.counterexamples.every(
    (item) => !!item && typeof item === "object" && typeof item.project_id === "string" && PROJECT_ID.test(item.project_id) && typeof item.variant_id === "string" && VARIANT_ID.test(item.variant_id)
  ) && typeof doc.shared_at === "string" && ISO.test(doc.shared_at);
}
function buildStudioCreative(root, brandSlug) {
  const dir = path.join(root, ...SHARED_DECISIONS_DIR.split("/"));
  const out = { items: [], withheld: [], total: 0 };
  let stat;
  try {
    stat = fs.lstatSync(dir);
  } catch {
    return out;
  }
  if (!stat.isDirectory()) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    const rel = `${SHARED_DECISIONS_DIR}/${name}`;
    const file = path.join(dir, name);
    const entry = fs.lstatSync(file);
    if (entry.isSymbolicLink()) {
      out.withheld.push({ path: rel, reason: "symlink" });
      continue;
    }
    if (!SHARED_DECISION_FILE.test(name) || !entry.isFile()) {
      out.withheld.push({ path: rel, reason: "unexpected_file" });
      continue;
    }
    if (entry.size > STUDIO_CREATIVE_LIMITS.maxFileBytes) {
      out.withheld.push({ path: rel, reason: "unreadable" });
      continue;
    }
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      out.withheld.push({ path: rel, reason: "unreadable" });
      continue;
    }
    if (!validSharedDecision(doc)) {
      out.withheld.push({ path: rel, reason: "invalid_record" });
      continue;
    }
    if (doc.brand_slug !== brandSlug) {
      out.withheld.push({ path: rel, reason: "wrong_brand" });
      continue;
    }
    if (`${doc.decision_id}.json` !== name) {
      out.withheld.push({ path: rel, reason: "filename_mismatch" });
      continue;
    }
    if (safetyBlocksSharing(safetyReport(`${doc.statement}
${doc.context ?? ""}
${doc.scope.label}`)).length) {
      out.withheld.push({ path: rel, reason: "unsafe_text" });
      continue;
    }
    out.items.push({
      schema_version: 1,
      kind: "creative_decision",
      decision_id: doc.decision_id,
      brand_slug: doc.brand_slug,
      project_id: doc.project_id,
      statement: doc.statement,
      context: doc.context,
      scope: { level: doc.scope.level, label: doc.scope.label },
      state: doc.state,
      approved_at: doc.approved_at,
      supersedes: doc.supersedes,
      superseded_by: doc.superseded_by,
      superseded_at: doc.superseded_at,
      sources: [...doc.sources],
      counterexamples: doc.counterexamples.map((item) => ({ project_id: item.project_id, variant_id: item.variant_id })),
      shared_at: doc.shared_at
    });
  }
  out.total = out.items.length;
  out.items.sort((a, b) => a.state === b.state ? b.approved_at.localeCompare(a.approved_at) : a.state === "approved" ? -1 : 1);
  out.items = out.items.slice(0, STUDIO_CREATIVE_LIMITS.maxItems);
  return out;
}

export {
  LEARN_LIMITS,
  LEARN_VERDICTS,
  learnFromCorrection,
  runCreativeLearnTool,
  shareDecision,
  buildStudioCreative
};
