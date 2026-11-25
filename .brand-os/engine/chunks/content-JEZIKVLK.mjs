import { createRequire as __engineRequire } from 'node:module'; const require = __engineRequire(import.meta.url);
import "./chunk-VVWNSS65.mjs";
import "./chunk-7MXIT7PT.mjs";
import {
  AGENT_TEXT,
  CAL_TEXT,
  CalendarError,
  approveWeek,
  approvedWeekEntry,
  contentCalendar,
  contentStrategyView,
  listObservations,
  listWeeks,
  loadWeekRecord,
  planCalendar,
  problemText,
  proposeWeek,
  rejectWeek,
  reviewWeek,
  scanWeeks,
  shareWeek,
  validateWeekId
} from "./chunk-DD6HD75Z.mjs";
import {
  CLI_TEXT,
  ROLE_LABELS,
  buildContentStrategy,
  contentLang,
  fill,
  parseCadence,
  parseChannels,
  parseFormats
} from "./chunk-BFOHNDT7.mjs";
import "./chunk-SQTVSBRJ.mjs";
import "./chunk-TJNMOGOI.mjs";
import "./chunk-QTDYPN2G.mjs";
import {
  readOwnerProof
} from "./chunk-JWRA22BE.mjs";
import "./chunk-BUEOARWQ.mjs";
import {
  brandSettings
} from "./chunk-GOTCGGSU.mjs";
import "./chunk-HHMADR62.mjs";
import {
  AGENT_TOKEN_ENV,
  CONTENT_CHANNELS,
  KnowledgeError,
  StrategyError,
  openWorkspace,
  proposeRevision,
  validateRevisionNumber,
  validateStrategyId
} from "./chunk-YAOGM5B7.mjs";
import "./chunk-QXBDJJNV.mjs";
import "./chunk-NUYFBVWM.mjs";
import "./chunk-QDMMEM6P.mjs";

// scripts/content.ts
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
var HELP = `brand:content <command> [options]

  strategy [--id content-main] [--channels instagram,linkedin] [--cadence instagram=3/week]
           [--formats instagram=reel+carousel] [--languages en,fa] [--markets tr]
           [--out <proposal.json>] [--store]
                                  propose a content strategy from approved facts, with explicit gaps.
                                  Without --out or --store nothing is written.
  show [--id <id>]                the approved content strategy with its voice rules, resolved from
                                  approved facts (drafts are never shown)

  plan --from YYYY-MM-DD --weeks N [--channels instagram,newsletter] [--strategy <id>] [--research]
       [--out <weeks.json>] [--store]
                                  draft calendar weeks (Monday to Sunday) from the served content strategy.
                                  Without --out or --store nothing is written.
  week propose --file <week.json> store one week (an item of the --out weeks list) as a draft
  week review  --week wk-YYYY-MM-DD --revision <n>
  week approve --week wk-YYYY-MM-DD --revision <n> --expect-sha <sha256>
                                  owner proof: BRAND_OS_APPROVAL_PROOF or hidden prompt
  week reject  --week wk-YYYY-MM-DD --revision <n>
  weeks                           every week and revision with its status
  calendar [--from D] [--to D] [--channel instagram]
                                  approved, current weeks only (drafts are never shown)
  share --week wk-YYYY-MM-DD [--dry-run]
                                  copy an approved week's summary to brand/content-calendar/shared (you commit it)
  reports [--week wk-YYYY-MM-DD]  produced/published reports from content agents (observations only)

Review and approve with: npm run brand:strategy -- review / approve (owner proof).
Options: --lang en|fa|tr (default: the brand default locale), --json. Refused while ${AGENT_TOKEN_ENV} is set.`;
var OPTIONS = {
  json: { type: "boolean", default: false },
  lang: { type: "string" },
  id: { type: "string" },
  channels: { type: "string" },
  cadence: { type: "string" },
  formats: { type: "string" },
  languages: { type: "string" },
  markets: { type: "string" },
  out: { type: "string" },
  store: { type: "boolean", default: false },
  from: { type: "string" },
  to: { type: "string" },
  weeks: { type: "string" },
  strategy: { type: "string" },
  research: { type: "boolean", default: false },
  file: { type: "string" },
  week: { type: "string" },
  revision: { type: "string" },
  "expect-sha": { type: "string" },
  channel: { type: "string" },
  "dry-run": { type: "boolean", default: false }
};
var argv = process.argv.slice(2);
var command = argv[0];
var sub = command === "week" ? argv[1] : void 0;
var rest = argv.slice(command === "week" ? 2 : 1);
function usage(message) {
  console.error(`${message}

${HELP}`);
  process.exit(2);
}
function codes(value, flag) {
  if (!value) return void 0;
  const list = value.split(",").map((item) => item.trim()).filter(Boolean);
  for (const item of list) if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(item)) throw new StrategyError("invalid_input", `${flag} takes language or market codes such as en,fa,tr (got ${item}).`);
  return list;
}
function draftText(draft, lang) {
  const t = (key) => CLI_TEXT[key][lang];
  const block = draft.block;
  const lines = [t("draft_header"), "", `${t("sources")}:`];
  for (const source of draft.sources) lines.push(`  [${source.state}] ${source.fact_id} (${ROLE_LABELS[source.role][lang]})`);
  lines.push("", `${t("pillars")}: ${block.pillars.map((p) => `${p.id} ${p.name}`).join(" \xB7 ") || "\u2014"}`);
  lines.push(`${t("channels")}:`);
  for (const c of block.channels) lines.push(`  ${c.channel}: ${c.formats.join("+") || t("not_decided")}, ${c.cadence ? `${c.cadence.target}/${c.cadence.per}` : t("not_decided")}`);
  if (!block.channels.length) lines.push("  \u2014");
  lines.push("", `${t("gaps")}:`);
  if (!draft.gaps.length) lines.push(`  ${t("no_gaps")}`);
  for (const gap of draft.gaps) lines.push(`  - [${gap.reason}] ${gap.field}: ${gap.text}`);
  lines.push("", `${t("notes")}:`, ...draft.notes.map((note) => `  ${note}`));
  return lines.join("\n");
}
function viewText(view, lang) {
  const t = (key) => CLI_TEXT[key][lang];
  const lines = [
    `${view.strategy_id} r${view.revision} (${view.status}) ${view.digests.content_sha256.slice(0, 12)}`,
    `  ${view.languages.join(", ")} \xB7 ${view.validity.valid_from.slice(0, 10)} \u2192 ${view.validity.valid_until.slice(0, 10)}`,
    "",
    `${t("voice")}:`,
    ...view.voice.sources.map((src) => `  ${src.fact_id}: ${src.value}`),
    ...view.voice.do.map((rule) => `  ${t("do")}: ${rule.text}`),
    ...view.voice.dont.map((rule) => `  ${t("dont")}: ${rule.text}`),
    "",
    `${t("banned")}:`,
    ...view.claims.banned.map((rule) => `  - ${rule.text}`),
    ...view.claims.availability_rule ? [`  - ${view.claims.availability_rule}`] : [],
    "",
    `${t("pillars")}: ${view.pillars.map((p) => p.name).join(" \xB7 ") || "\u2014"}`,
    `${t("channels")}:`,
    ...view.channels.map((c) => `  ${c.channel}: ${c.role ?? t("not_decided")}; ${c.formats.join("+") || t("not_decided")}; ${c.cadence ? `${c.cadence.target}/${c.cadence.per}` : t("not_decided")}; ${c.languages.join(",") || t("all")}`),
    "",
    `${t("gaps")}:`,
    ...view.gaps.length ? view.gaps.map((gap) => `  - ${gap.field}: ${gap.text}`) : [`  ${t("no_gaps")}`],
    "",
    ...view.notice.map((line) => `note: ${line}`)
  ];
  return lines.join("\n");
}
async function ownerProof() {
  return readOwnerProof({ prompt: "Owner approval proof (input hidden): " });
}
function need(values2, key) {
  const value = values2[key];
  if (!value) usage(`--${key} is required.`);
  return value;
}
function channelOf(value) {
  if (!CONTENT_CHANNELS.includes(value)) throw new StrategyError("invalid_input", `--channel is one of ${CONTENT_CHANNELS.join(", ")}.`);
  return value;
}
function slotLine(slot, t, pillarName) {
  const parts = [`${slot.id} ${slot.date} ${slot.channel}/${slot.format ?? t("not_decided")}`, `${pillarName ?? slot.pillar ?? "\u2014"}`, slot.language];
  const cites = [slot.key_message, slot.offer, slot.cta].filter(Boolean).join(", ");
  if (cites) parts.push(cites);
  if (slot.hook) parts.push(`\u201C${slot.hook}\u201D`);
  if (slot.research) parts.push(`${slot.research.observation_id.slice(0, 11)} (${slot.research.confidence})`);
  return `  ${parts.join(" \xB7 ")}`;
}
function planText(plan, lang) {
  const t = (key) => (CAL_TEXT[key] ?? CLI_TEXT[key])[lang];
  const lines = [fill(t("plan_header"), { id: plan.strategy.strategy_id, rev: plan.strategy.revision }), ...plan.notes.map((note) => `${t("notes")}: ${note}`)];
  for (const week of plan.weeks) {
    const c = week.content;
    lines.push("", `${t("week")} ${c.week_id} (${c.week_start} \u2192 ${c.week_end}): ${c.slots.length || t("no_slots")}`);
    for (const slot of c.slots) lines.push(slotLine(slot, t));
    for (const gap of week.gaps) lines.push(`  - ${gap}`);
  }
  return lines.join("\n");
}
function reviewText(review, lang) {
  const t = (key) => (CAL_TEXT[key] ?? CLI_TEXT[key])[lang];
  return [
    `${review.week_id} r${review.revision} (${review.state}) ${review.content_sha256}`,
    `  supersedes: ${review.supersedes_revision ?? "\u2014"} \xB7 approved now: ${review.current_approved ?? "\u2014"} \xB7 slots: ${review.slots}`,
    "",
    `${t("gaps")}:`,
    ...review.gaps.length ? review.gaps.map((gap) => `  - ${gap.text}`) : [`  ${t("no_gaps")}`],
    "",
    `${t("blockers")}:`,
    ...review.blockers.length ? review.blockers.map((line) => `  - ${line}`) : [`  ${t("no_blockers")}`],
    "",
    ...review.notice.map((line) => `note: ${line}`),
    "",
    review.blockers.length ? "" : review.approve_with
  ].join("\n").trimEnd();
}
function weeksText(list) {
  if (!list.length) return "\u2014";
  return list.map((week) => [`${week.week_id} (approved: ${week.current ?? "\u2014"})`, ...week.revisions.map((r) => `  r${r.revision} ${r.state} \u2192 ${r.status} \xB7 ${r.slots} slots \xB7 ${r.content_sha256.slice(0, 12)}${r.reasons.length ? `
    ${r.reasons.join("\n    ")}` : ""}`)].join("\n")).join("\n");
}
function calendarText(view, lang) {
  const t = (key) => (CAL_TEXT[key] ?? CLI_TEXT[key])[lang];
  const lines = [];
  if (!view.weeks.length) lines.push(t("none_calendar"));
  for (const week of view.weeks) {
    lines.push(`${week.week_id} r${week.revision} (${week.status}) ${week.digests.content_sha256.slice(0, 12)} \xB7 ${week.strategy.strategy_id}@${week.strategy.revision}`);
    for (const slot of week.slots) lines.push(slotLine(slot, t, slot.pillar_name));
    for (const fact of week.facts) lines.push(`    ${fact.fact_id}: ${fact.value}`);
    for (const gap of week.gaps) lines.push(`  - ${gap.text}`);
    lines.push("");
  }
  const withheld = Object.entries(view.withheld).map(([status, n]) => `${status}: ${n}`).join(", ");
  if (withheld) lines.push(`${t("withheld")}: ${withheld}`);
  lines.push(...view.notice.map((line) => `note: ${line}`));
  return lines.join("\n");
}
function reportsText(items, lang) {
  const t = (key) => AGENT_TEXT[key][lang];
  if (!items.length) return t("reports_none");
  const lines = [t("reports_header"), ""];
  for (const item of items) {
    const old = item.current ? "" : ` ${fill(t("reports_old_revision"), { rev: item.week_revision })}`;
    lines.push(`${item.week_id} ${item.slot_id} r${item.week_revision} ${item.status} ${item.url ?? "\u2014"} \xB7 ${item.reported_at} \xB7 ${item.reporter}${old}`);
  }
  return lines.join("\n");
}
function reportsOf(ws, week) {
  const ids = week ? [validateWeekId(week)] : scanWeeks(ws).map((record) => record.week_id);
  return listObservations(ws, ids).map((item) => {
    let current = false;
    try {
      const entry = approvedWeekEntry(loadWeekRecord(ws, item.week_id));
      current = entry !== null && entry.revision === item.week_revision && entry.content_sha256 === item.week_content_sha256;
    } catch {
      current = false;
    }
    return { ...item, current };
  });
}
async function run(ws, values2) {
  const lang = contentLang(values2.lang, contentLang(brandSettings(ws).default_locale.slice(0, 2)));
  if (values2.lang && values2.lang !== lang) usage("--lang is en, fa or tr.");
  const print = (data, text) => console.log(values2.json ? JSON.stringify(data, null, 2) : text());
  switch (command) {
    case "strategy": {
      const id = validateStrategyId(values2.id ?? "content-main");
      const draft = buildContentStrategy(ws, {
        lang,
        channels: values2.channels ? parseChannels(values2.channels) : void 0,
        cadence: values2.cadence ? parseCadence(values2.cadence) : void 0,
        formats: values2.formats ? parseFormats(values2.formats) : void 0,
        languages: codes(values2.languages, "--languages"),
        markets: codes(values2.markets, "--markets")
      });
      const after = [];
      let stored = null;
      if (values2.out) {
        const out = path.resolve(values2.out);
        if (fs.existsSync(out)) throw new StrategyError("exists", "The --out file exists. Choose a new path; nothing was overwritten.");
        fs.writeFileSync(out, `${JSON.stringify(draft.proposal, null, 2)}
`, { mode: 384, flag: "wx" });
        after.push(fill(CLI_TEXT.written[lang], { list: values2.out, id }));
      }
      if (values2.store) {
        const result = proposeRevision(ws, { strategy_id: id, proposal: draft.proposal });
        stored = { revision: result.revision.revision, content_sha256: result.revision.content_sha256, path: result.path };
        after.push(fill(CLI_TEXT.stored[lang], { id, n: result.revision.revision }));
      }
      if (!values2.out && !values2.store) after.push(CLI_TEXT.store_hint[lang]);
      print({ ok: true, strategy_id: id, stored, gaps: draft.gaps, sources: draft.sources, notes: draft.notes, proposal: draft.proposal }, () => [draftText(draft, lang), "", ...after].join("\n"));
      return;
    }
    case "show": {
      const result = contentStrategyView(ws, { lang, strategy_id: values2.id ? validateStrategyId(values2.id) : void 0 });
      print({ ok: true, ...result }, () => {
        const withheld = Object.entries(result.withheld).map(([status, n]) => `${status}: ${n}`).join(", ");
        const body = result.views.length ? result.views.map((view) => viewText(view, lang)).join("\n\n") : CLI_TEXT.none_approved[lang];
        return withheld ? `${body}
${CLI_TEXT.withheld[lang]}: ${withheld}` : body;
      });
      return;
    }
    case "plan": {
      const weeks = Number(need(values2, "weeks"));
      const plan = planCalendar(ws, {
        lang,
        from: need(values2, "from"),
        weeks,
        strategy_id: values2.strategy ? validateStrategyId(values2.strategy) : void 0,
        channels: values2.channels ? parseChannels(values2.channels) : void 0,
        research: values2.research
      });
      const after = [];
      const stored = [];
      if (values2.out) {
        const out = path.resolve(values2.out);
        if (fs.existsSync(out)) throw new StrategyError("exists", "The --out file exists. Choose a new path; nothing was overwritten.");
        fs.writeFileSync(out, `${JSON.stringify({ weeks: plan.weeks.map((w) => w.content) }, null, 2)}
`, { mode: 384, flag: "wx" });
        after.push(fill(CAL_TEXT.written_plan[lang], { list: values2.out }));
      }
      if (values2.store) {
        for (const week of plan.weeks) {
          const result = proposeWeek(ws, { week: week.content, lang });
          stored.push({ week_id: week.content.week_id, revision: result.revision.revision, content_sha256: result.revision.content_sha256 });
          after.push(fill(CAL_TEXT.stored_week[lang], { id: week.content.week_id, n: result.revision.revision }));
        }
      }
      if (!values2.out && !values2.store) after.push(CAL_TEXT.plan_store_hint[lang]);
      print({ ok: true, stored, ...plan }, () => [planText(plan, lang), "", ...after].join("\n"));
      return;
    }
    case "week": {
      switch (sub) {
        case "propose": {
          const file = path.resolve(need(values2, "file"));
          let week;
          try {
            week = JSON.parse(fs.readFileSync(file, "utf8"));
          } catch {
            throw new StrategyError("invalid_input", "The --file is not readable JSON.");
          }
          const result = proposeWeek(ws, { week, lang });
          const id = result.revision.week_id;
          print({ ok: true, week_id: id, revision: result.revision.revision, content_sha256: result.revision.content_sha256, path: result.path }, () => fill(CAL_TEXT.stored_week[lang], { id, n: result.revision.revision }));
          return;
        }
        case "review": {
          const review = reviewWeek(ws, { week_id: need(values2, "week"), revision: validateRevisionNumber(Number(need(values2, "revision"))), lang });
          print({ ok: true, review }, () => reviewText(review, lang));
          return;
        }
        case "approve": {
          const proof = await ownerProof();
          const result = approveWeek(ws, { week_id: need(values2, "week"), revision: validateRevisionNumber(Number(need(values2, "revision"))), expected_sha256: need(values2, "expect-sha"), proof, lang });
          print({ ok: true, week_id: result.record.week_id, approved: result.approved.revision, superseded: result.superseded?.revision ?? null }, () => fill(CAL_TEXT.approved_week[lang], { id: result.record.week_id, n: result.approved.revision }));
          return;
        }
        case "reject": {
          const week = need(values2, "week");
          const entry = rejectWeek(ws, { week_id: week, revision: validateRevisionNumber(Number(need(values2, "revision"))) });
          print({ ok: true, week_id: week, rejected: entry.revision }, () => fill(CAL_TEXT.rejected_week[lang], { id: week, n: entry.revision }));
          return;
        }
        default:
          usage(sub ? `Unknown week command ${sub}.` : "week needs propose, review, approve or reject.");
      }
      return;
    }
    case "weeks": {
      const list = listWeeks(ws, lang);
      print({ ok: true, weeks: list }, () => weeksText(list));
      return;
    }
    case "calendar": {
      const view = contentCalendar(ws, { lang, from: values2.from, to: values2.to, channel: values2.channel ? channelOf(values2.channel) : void 0 });
      print({ ok: true, ...view }, () => calendarText(view, lang));
      return;
    }
    case "share": {
      const result = shareWeek(ws, { week_id: need(values2, "week"), dryRun: values2["dry-run"] });
      print({ ok: true, ...result }, () => result.written ? fill(CAL_TEXT.shared_week[lang], { list: result.path }) : `${CAL_TEXT.shared_preview[lang]}
${JSON.stringify(result.week, null, 2)}`);
      return;
    }
    case "reports": {
      const items = reportsOf(ws, values2.week);
      print({ ok: true, reports: items }, () => reportsText(items, lang));
      return;
    }
    default:
      usage(command ? `Unknown command ${command}.` : "No command given.");
  }
}
if (!command || command === "help" || command === "--help") {
  console.log(HELP);
  process.exit(command ? 0 : 2);
}
var values;
try {
  values = parseArgs({ args: rest, options: OPTIONS, allowPositionals: false, strict: true }).values;
} catch (error) {
  usage(error.message);
}
try {
  await run(openWorkspace(process.cwd()), values);
} catch (error) {
  if (error instanceof CalendarError) {
    const lang = contentLang(values.lang);
    const lines = error.problems.map((problem) => problemText(problem, lang));
    if (values.json) console.log(JSON.stringify({ ok: false, error: { code: error.code, problems: error.problems, message: lines.join(" ") } }, null, 2));
    else console.error(`${error.code}:
${lines.map((line) => `  - ${line}`).join("\n")}`);
    process.exit(1);
  }
  if (error instanceof StrategyError || error instanceof KnowledgeError) {
    if (values.json) console.log(JSON.stringify({ ok: false, error: { code: error.code, message: error.message } }, null, 2));
    else console.error(`${error.code}: ${error.message}`);
    process.exit(1);
  }
  console.error(`Unexpected error (${error?.name ?? "Error"}). Nothing was approved or published.`);
  process.exit(1);
}
