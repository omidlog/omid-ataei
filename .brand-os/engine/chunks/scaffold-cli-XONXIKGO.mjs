import { createRequire as __engineRequire } from 'node:module'; const require = __engineRequire(import.meta.url);
import {
  scaffoldBrand
} from "./chunk-YPUDC4XT.mjs";
import "./chunk-HPW4GNLU.mjs";
import "./chunk-YHS4F3VZ.mjs";
import {
  writeStarterWorkspace
} from "./chunk-RYBAQB5Q.mjs";
import "./chunk-S7IDFGBY.mjs";
import "./chunk-3PI5MZXH.mjs";
import "./chunk-TQOHZPB6.mjs";
import "./chunk-HHMADR62.mjs";
import {
  applyInit
} from "./chunk-XUTODDCC.mjs";
import "./chunk-QXBDJJNV.mjs";
import "./chunk-NUYFBVWM.mjs";
import "./chunk-QDMMEM6P.mjs";

// scripts/engine/scaffold-cli.ts
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
var { values } = parseArgs({
  options: {
    new: { type: "boolean", default: false },
    name: { type: "string" },
    slug: { type: "string" },
    industry: { type: "string", default: "TBD" },
    profile: { type: "string" },
    facets: { type: "string" },
    languages: { type: "string", default: "en" },
    publish: { type: "string", default: "private" },
    json: { type: "boolean", default: false }
  }
});
var root = process.cwd();
if (values.new) {
  if (!values.name || !values.slug) {
    console.error('Usage: brand-os scaffold --new --name "Brand" --slug brand [--profile personal-brand] [--languages en,fa]');
    process.exit(2);
  }
  if (fs.existsSync(path.join(root, "brand", "brand.config.yaml"))) {
    console.error("brand/brand.config.yaml already exists. Refusing to create a new brand here.");
    process.exit(2);
  }
  writeStarterWorkspace(root);
  const languages = values.languages.split(",").map((item) => item.trim()).filter(Boolean);
  applyInit(root, {
    name: values.name,
    slug: values.slug,
    industry: values.industry,
    language: languages[0] ?? "en",
    languages,
    mascot: false,
    gamification: false,
    publish: values.publish === "public" ? "public" : "private",
    ...values.profile ? { profile: values.profile } : {},
    ...values.facets ? { facets: values.facets.split(",").map((item) => item.trim()).filter(Boolean) } : {}
  });
}
var result = scaffoldBrand(root, { slug: values.slug });
console.log(values.json ? JSON.stringify(result, null, 2) : result.written.length ? `Wrote ${result.written.join(", ")}.` : "Engine-owned root files are current.");
