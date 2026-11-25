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

// scripts/validate.ts
var report = validateRepo(process.cwd());
for (const warning of report.warnings) console.warn(`warning: ${warning}`);
if (!report.ok) {
  console.error(report.errors.join("\n"));
  process.exit(1);
}
console.log(`Validation passed with ${report.warnings.length} warning(s).`);
