import { createRequire as __engineRequire } from 'node:module'; const require = __engineRequire(import.meta.url);
import {
  validateRepo
} from "./chunk-YHS4F3VZ.mjs";
import "./chunk-RYBAQB5Q.mjs";
import "./chunk-S7IDFGBY.mjs";
import "./chunk-3PI5MZXH.mjs";
import "./chunk-TQOHZPB6.mjs";
import "./chunk-HHMADR62.mjs";
import "./chunk-XUTODDCC.mjs";
import "./chunk-QXBDJJNV.mjs";
import "./chunk-NUYFBVWM.mjs";
import "./chunk-QDMMEM6P.mjs";

// scripts/engine/check.ts
import fs from "node:fs";
import path from "node:path";
var root = process.cwd();
if (!fs.existsSync(path.join(root, "brand", "brand.config.yaml"))) {
  console.error("This is not a Brand OS brand repository: brand/brand.config.yaml is missing.");
  process.exit(2);
}
var report = validateRepo(root);
for (const warning of report.warnings) console.warn(`warning: ${warning}`);
if (!report.ok) {
  console.error(report.errors.join("\n"));
  process.exit(1);
}
console.log(`Brand check passed with ${report.warnings.length} warning(s). Engine ${process.env.BRAND_OS_ENGINE_VERSION ?? "development"}.`);
