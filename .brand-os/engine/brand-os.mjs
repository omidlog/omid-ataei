import { createRequire as __engineRequire } from 'node:module'; const require = __engineRequire(import.meta.url);
import {
  ENGINE_COMMANDS
} from "./chunks/chunk-YKITUD2J.mjs";
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
  brand: () => import("./chunks/brand-5BX2YLE3.mjs"),
  coach: () => import("./chunks/coach-WXOKKJE2.mjs"),
  knowledge: () => import("./chunks/knowledge-GDR6VBNS.mjs"),
  creative: () => import("./chunks/creative-3UDF7QAA.mjs"),
  seo: () => import("./chunks/seo-5RNGXGJL.mjs"),
  strategy: () => import("./chunks/strategy-2HJKLD7W.mjs"),
  competitive: () => import("./chunks/competitive-ZH57ICHL.mjs"),
  identity: () => import("./chunks/identity-2W7MLHIQ.mjs"),
  "visual-dna": () => import("./chunks/visual-dna-BIT3CCHS.mjs"),
  content: () => import("./chunks/content-M3NHA3M3.mjs"),
  social: () => import("./chunks/social-LZXAPLIG.mjs"),
  runtime: () => import("./chunks/runtime-AAZ5DYRR.mjs"),
  pack: () => import("./chunks/pack-YHSIAHFM.mjs"),
  acceptance: () => import("./chunks/acceptance-6W5ZSP7C.mjs"),
  assurance: () => import("./chunks/assurance-EY55AJM4.mjs"),
  "assurance-review": () => import("./chunks/assurance-review-RCPZ2YMV.mjs"),
  "assurance-link": () => import("./chunks/assurance-link-OETKKVL7.mjs"),
  "export-visual": () => import("./chunks/export-visual-2VRV7TWV.mjs"),
  mcp: () => import("./chunks/mcp-NJED3IE4.mjs"),
  validate: () => import("./chunks/validate-ZIA7GT5K.mjs"),
  "tokens-build": () => import("./chunks/cli-QWEDZ2KU.mjs"),
  "prepare-docs": () => import("./chunks/prepare-docs-Z24X5YZR.mjs"),
  check: () => import("./chunks/check-5E5IVQM5.mjs"),
  scaffold: () => import("./chunks/scaffold-cli-KMDK4D5C.mjs"),
  convert: () => import("./chunks/convert-cli-VDMLZ64V.mjs")
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
