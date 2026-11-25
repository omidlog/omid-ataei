import { createRequire as __engineRequire } from 'node:module'; const require = __engineRequire(import.meta.url);
import {
  validateRepo
} from "./chunk-BUEOARWQ.mjs";
import "./chunk-GOTCGGSU.mjs";
import "./chunk-HHMADR62.mjs";
import "./chunk-YAOGM5B7.mjs";
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
