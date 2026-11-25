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
  brand: () => import("./chunks/brand-MXS3LEEG.mjs"),
  coach: () => import("./chunks/coach-EQUQNCDA.mjs"),
  knowledge: () => import("./chunks/knowledge-KLX5ZRYO.mjs"),
  creative: () => import("./chunks/creative-76CYSS4S.mjs"),
  seo: () => import("./chunks/seo-GY25IG2O.mjs"),
  strategy: () => import("./chunks/strategy-PYBEIVH4.mjs"),
  competitive: () => import("./chunks/competitive-27S7LJ67.mjs"),
  identity: () => import("./chunks/identity-7Y4IP2VH.mjs"),
  "visual-dna": () => import("./chunks/visual-dna-I7VIPBY4.mjs"),
  content: () => import("./chunks/content-JEZIKVLK.mjs"),
  runtime: () => import("./chunks/runtime-UPCYSA6O.mjs"),
  acceptance: () => import("./chunks/acceptance-AWESTZOY.mjs"),
  assurance: () => import("./chunks/assurance-G5YGLJVV.mjs"),
  "assurance-review": () => import("./chunks/assurance-review-MRN7PY5L.mjs"),
  "assurance-link": () => import("./chunks/assurance-link-SXAPXHSH.mjs"),
  "export-visual": () => import("./chunks/export-visual-O7EI63AF.mjs"),
  mcp: () => import("./chunks/mcp-T6XAKP57.mjs"),
  validate: () => import("./chunks/validate-H3RFN3YN.mjs"),
  "tokens-build": () => import("./chunks/cli-QWEDZ2KU.mjs"),
  "prepare-docs": () => import("./chunks/prepare-docs-DFWFPJG7.mjs"),
  check: () => import("./chunks/check-Q2AGPDMY.mjs"),
  scaffold: () => import("./chunks/scaffold-cli-3VO45OBB.mjs"),
  convert: () => import("./chunks/convert-cli-4JP2CVYT.mjs")
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
