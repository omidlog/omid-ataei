import { createRequire as __engineRequire } from 'node:module'; const require = __engineRequire(import.meta.url);
import {
  ENGINE_COMMANDS
} from "./chunks/chunk-UACUMZYP.mjs";
import "./chunks/chunk-QDMMEM6P.mjs";

// scripts/engine/entry.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
var here = path.dirname(fileURLToPath(import.meta.url));
var assets = path.join(here, "assets");
if (fs.existsSync(assets)) process.env.BRAND_OS_ENGINE_ASSETS ??= assets;
var versionFile = path.join(here, "VERSION");
if (fs.existsSync(versionFile)) process.env.BRAND_OS_ENGINE_VERSION ??= fs.readFileSync(versionFile, "utf8").trim();
var loaders = {
  brand: () => import("./chunks/brand-3PMXDO6E.mjs"),
  coach: () => import("./chunks/coach-LGRQLPFQ.mjs"),
  knowledge: () => import("./chunks/knowledge-6DVJ33AK.mjs"),
  creative: () => import("./chunks/creative-6XFT22PD.mjs"),
  seo: () => import("./chunks/seo-2BVCID2F.mjs"),
  strategy: () => import("./chunks/strategy-PDG4LB2M.mjs"),
  competitive: () => import("./chunks/competitive-ZLYQYNYJ.mjs"),
  identity: () => import("./chunks/identity-OMJHLLQS.mjs"),
  "visual-dna": () => import("./chunks/visual-dna-FDVMI6OQ.mjs"),
  content: () => import("./chunks/content-TAYMULCY.mjs"),
  runtime: () => import("./chunks/runtime-NVZVPFAQ.mjs"),
  acceptance: () => import("./chunks/acceptance-ATBBFWES.mjs"),
  assurance: () => import("./chunks/assurance-DI7Y5RRW.mjs"),
  "assurance-review": () => import("./chunks/assurance-review-37AEO4Z2.mjs"),
  "assurance-link": () => import("./chunks/assurance-link-BPYE4W6U.mjs"),
  "export-visual": () => import("./chunks/export-visual-5AMNIHCW.mjs"),
  mcp: () => import("./chunks/mcp-AJOFYQ5L.mjs"),
  validate: () => import("./chunks/validate-TJMNR3B4.mjs"),
  "tokens-build": () => import("./chunks/cli-QWEDZ2KU.mjs"),
  "prepare-docs": () => import("./chunks/prepare-docs-UEJWFP2U.mjs"),
  check: () => import("./chunks/check-YRM6GJI7.mjs"),
  scaffold: () => import("./chunks/scaffold-cli-LF3FGQTF.mjs"),
  convert: () => import("./chunks/convert-cli-TBWSSK27.mjs")
};
var [command, ...args] = process.argv.slice(2);
if (command === void 0 || command === "help" || command === "--help") {
  console.log(`Brand OS engine ${process.env.BRAND_OS_ENGINE_VERSION ?? "(development)"}
Usage: brand-os <command> [args]
Commands: ${Object.keys(ENGINE_COMMANDS).sort().join(", ")}
In a brand repository use the npm scripts (npm run brand:interview, npm run check \u2026).`);
  process.exit(command === void 0 ? 1 : 0);
}
if (command === "version" || command === "--version") {
  console.log(process.env.BRAND_OS_ENGINE_VERSION ?? "development");
  process.exit(0);
}
var spec = ENGINE_COMMANDS[command];
if (!spec) {
  console.error(`Unknown command ${command}. Run brand-os help for the list.`);
  process.exit(2);
}
var load = loaders[spec.script];
if (!load) throw new Error(`No loader for ${spec.script}`);
process.argv = [process.argv[0] ?? "node", path.join(here, spec.entry ?? spec.script), ...spec.prefix, ...args];
if (spec.entry) process.env.BRAND_OS_ENTRY = spec.entry;
await load();
