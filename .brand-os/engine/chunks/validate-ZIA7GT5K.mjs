import { createRequire as __engineRequire } from 'node:module'; const require = __engineRequire(import.meta.url);
import {
  validateRepo
} from "./chunk-K5OCUCIU.mjs";
import "./chunk-BJT3FASC.mjs";
import "./chunk-HR4PLSTN.mjs";
import "./chunk-KOSTJMIK.mjs";
import "./chunk-LRQJOFVI.mjs";
import "./chunk-WYY5L3JA.mjs";
import "./chunk-MHQ2KNS6.mjs";
import "./chunk-6J4CLHVK.mjs";
import "./chunk-HHMADR62.mjs";
import "./chunk-GNDTGU2Y.mjs";
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
