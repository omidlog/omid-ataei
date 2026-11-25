import { createRequire as __engineRequire } from 'node:module'; const require = __engineRequire(import.meta.url);
import {
  ENGINE_COMMANDS
} from "./chunks/chunk-HPW4GNLU.mjs";
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
  brand: () => import("./chunks/brand-PAGWFYAI.mjs"),
  coach: () => import("./chunks/coach-244SQJ5D.mjs"),
  knowledge: () => import("./chunks/knowledge-ZR2VNOE7.mjs"),
  creative: () => import("./chunks/creative-HZ7JYV46.mjs"),
  seo: () => import("./chunks/seo-I2QIAKB4.mjs"),
  strategy: () => import("./chunks/strategy-WN7NFYYA.mjs"),
  competitive: () => import("./chunks/competitive-XQZSEVEI.mjs"),
  identity: () => import("./chunks/identity-IPM5XZWP.mjs"),
  "visual-dna": () => import("./chunks/visual-dna-545NCJQZ.mjs"),
  content: () => import("./chunks/content-SXXCEQ6H.mjs"),
  social: () => import("./chunks/social-W56TU2XJ.mjs"),
  runtime: () => import("./chunks/runtime-UZ66OSZP.mjs"),
  pack: () => import("./chunks/pack-M7CU6JQM.mjs"),
  acceptance: () => import("./chunks/acceptance-DV4H4ZTD.mjs"),
  assurance: () => import("./chunks/assurance-GYUV2Z2S.mjs"),
  "assurance-review": () => import("./chunks/assurance-review-QHOIIVHT.mjs"),
  "assurance-link": () => import("./chunks/assurance-link-57QOFHQE.mjs"),
  "export-visual": () => import("./chunks/export-visual-3J3WDDNX.mjs"),
  mcp: () => import("./chunks/mcp-ETR445TP.mjs"),
  validate: () => import("./chunks/validate-LX6RQQK7.mjs"),
  "tokens-build": () => import("./chunks/cli-QWEDZ2KU.mjs"),
  "prepare-docs": () => import("./chunks/prepare-docs-3277PW2G.mjs"),
  check: () => import("./chunks/check-M5O2HIIW.mjs"),
  scaffold: () => import("./chunks/scaffold-cli-XONXIKGO.mjs"),
  convert: () => import("./chunks/convert-cli-XGGFVRIQ.mjs")
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
