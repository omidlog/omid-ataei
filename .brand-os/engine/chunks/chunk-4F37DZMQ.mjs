import { createRequire as __engineRequire } from 'node:module'; const require = __engineRequire(import.meta.url);
import {
  socialKitText
} from "./chunk-3PI5MZXH.mjs";
import {
  SURFACES,
  SURFACE_SPECS,
  TEXT_ROLES,
  localize,
  zoneRect
} from "./chunk-TQOHZPB6.mjs";
import {
  compileTokens
} from "./chunk-HHMADR62.mjs";

// packages/brand-core/src/social-kit/preview.ts
var FALLBACK = "#9AA0A6";
function tokenLookup(flat) {
  return {
    color: (id) => {
      const hex = id ? flat[id]?.hex : void 0;
      return typeof hex === "string" && /^#[0-9A-Fa-f]{6}$/.test(hex) ? { hex: hex.toUpperCase(), resolved: true } : { hex: FALLBACK, resolved: false };
    },
    font: (id) => {
      const value = id ? flat[id]?.value : void 0;
      const first = Array.isArray(value) ? value[0] : value;
      return typeof first === "string" ? first : id ? `${id} (unresolved)` : "n/a";
    }
  };
}
function repoTokenLookup(root) {
  return tokenLookup(compileTokens(root).flat);
}
function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
var round = (value) => Math.round(value * 10) / 10;
function styleSvg(style, tokens, options = {}) {
  const lang = options.lang ?? "en";
  const spec = SURFACE_SPECS[style.surface];
  const canvas = spec.canvases[0];
  const W = canvas.width;
  const H = canvas.height;
  const footer = Math.round(H * 0.09);
  const unit = W / 100;
  const label = Math.max(18, Math.round(W / 40));
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H + footer}" width="${Math.round(W / 4)}" height="${Math.round((H + footer) / 4)}" font-family="sans-serif" data-style-id="${escapeXml(style.id)}">`);
  out.push(`<title>${escapeXml(`${style.id} \u2014 ${localize(style.name, lang)}`)}</title>`);
  out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF" stroke="#202124" stroke-width="4"/>`);
  style.layers.forEach((layer, index) => {
    const rect = zoneRect(layer.zone);
    const x = round(rect.x * unit);
    const y = round(rect.y * H / 100);
    const w = round(rect.w * unit);
    const h = round(rect.h * H / 100);
    const color = tokens.color(layer.color ?? null);
    const fill = layer.role === "media" ? "#5F6368" : layer.role === "mascot" ? "#F29900" : color.hex;
    const opacity = layer.role === "background" ? 0.35 : layer.role === "media" ? 0.3 : 0.25;
    const dash = layer.optional ? ' stroke-dasharray="12 8"' : "";
    out.push(`<g data-layer="${index + 1}" data-role="${layer.role}">`);
    out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" fill-opacity="${opacity}" stroke="${fill}" stroke-width="2"${dash}/>`);
    if (layer.role === "media" || layer.role === "mascot") {
      out.push(`<line x1="${x}" y1="${y}" x2="${round(x + w)}" y2="${round(y + h)}" stroke="${fill}" stroke-width="2"/>`, `<line x1="${round(x + w)}" y1="${y}" x2="${x}" y2="${round(y + h)}" stroke="${fill}" stroke-width="2"/>`);
    }
    if (TEXT_ROLES.includes(layer.role)) {
      const lines = Math.max(1, Math.min(layer.max_lines ?? 2, 6));
      const step = h / (lines + 1);
      const thickness = Math.max(4, Math.min(step * 0.45, layer.role === "headline" || layer.role === "data" || layer.role === "quote" ? 60 : 24));
      for (let line = 0; line < lines; line++) {
        const width = line === lines - 1 && lines > 1 ? w * 0.6 : w * 0.92;
        out.push(`<rect x="${round(x + w * 0.04)}" y="${round(y + step * (line + 0.6))}" width="${round(width)}" height="${round(thickness)}" fill="${color.hex}" fill-opacity="0.55"/>`);
      }
      const limit = [layer.max_words ? `${layer.max_words}w` : null, layer.max_lines ? `${layer.max_lines}l` : null].filter(Boolean).join(" ");
      out.push(`<text x="${round(x + 8)}" y="${round(y + h - 8)}" font-size="${Math.round(label * 0.8)}" fill="#202124">${escapeXml(`Aa ${tokens.font(layer.font ?? null)}${limit ? ` \xB7 ${limit}` : ""}`)}</text>`);
    }
    out.push(`<text x="${round(x + 8)}" y="${round(y + label + 4)}" font-size="${label}" font-weight="bold" fill="#202124">${escapeXml(`${index + 1}. ${layer.role}${color.resolved || !layer.color ? "" : " (token unresolved)"}`)}</text>`);
    out.push("</g>");
  });
  for (const zone of spec.safe_zones) {
    const stroke = zone.kind === "ui_overlap" ? "#D93025" : zone.kind === "crop" ? "#1A73E8" : "#188038";
    out.push(`<rect data-safe-zone="${zone.id}" x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" fill="none" stroke="${stroke}" stroke-width="3" stroke-dasharray="16 10"/>`);
    out.push(`<text x="${zone.x + zone.w - 8}" y="${zone.y + zone.h - 8}" text-anchor="end" font-size="${Math.round(label * 0.7)}" fill="${stroke}">${escapeXml(`${zone.kind}: ${zone.id}`)}</text>`);
  }
  out.push(`<text x="12" y="${H + Math.round(footer * 0.45)}" font-size="${Math.round(label * 1.2)}" font-weight="bold" fill="#202124">${escapeXml(style.id)}</text>`);
  out.push(`<text x="12" y="${H + Math.round(footer * 0.85)}" font-size="${label}" fill="#5F6368">${escapeXml(`${style.archetype} \xB7 ${options.status ?? style.status}`)}</text>`);
  out.push("</svg>");
  return `${out.join("\n")}
`;
}
function sheet(kit, surface, states, lang) {
  const text = socialKitText(lang);
  const dir = lang === "fa" ? "rtl" : "ltr";
  const rows = states.filter((state) => state.style.surface === surface).map((state) => {
    const style = state.style;
    return [
      "<figure>",
      `<img src="${escapeXml(style.id)}.svg" alt="${escapeXml(localize(style.name, lang))}">`,
      `<figcaption><strong>${escapeXml(localize(style.name, lang))}</strong> <code>${escapeXml(style.id)}</code><br>`,
      `<em>${escapeXml(text.statuses[state.status])}</em> \xB7 <code>${state.digest.slice(0, 12)}</code><br>`,
      `${escapeXml(text.labels.intent)}: ${escapeXml(localize(style.intent.use_when, lang))}<br>`,
      `${escapeXml(text.labels.variation)}: ${escapeXml(localize(style.variation, lang))}</figcaption>`,
      "</figure>"
    ].join("");
  });
  const zones = SURFACE_SPECS[surface].safe_zones.map((zone) => `${zone.kind}: ${zone.id}`).join(" \xB7 ");
  return [
    "<!doctype html>",
    `<html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapeXml(`${text.labels.kit}: ${text.surfaces[surface]}`)}</title>`,
    "<style>body{font-family:system-ui,sans-serif;margin:16px;background:#fff;color:#202124}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}figure{margin:0}img{width:100%;height:auto;border:1px solid #dadce0}code{font-size:12px}</style>",
    "</head><body>",
    `<h1>${escapeXml(text.surfaces[surface])}</h1>`,
    `<p>${escapeXml(kit.brand_slug)} \xB7 ${escapeXml(text.labels.safe_zones)}: ${escapeXml(zones)}</p>`,
    `<main>${rows.join("\n")}</main>`,
    "</body></html>",
    ""
  ].join("\n");
}
function previewFiles(kit, states, tokens, options = {}) {
  const lang = options.lang ?? "en";
  const text = socialKitText(lang);
  const surfaces = SURFACES.filter((surface) => options.surface ? surface === options.surface : states.some((state) => state.style.surface === surface));
  const files = [];
  for (const surface of surfaces) {
    for (const state of states.filter((item) => item.style.surface === surface)) {
      files.push({ path: `${surface}/${state.style.id}.svg`, contents: styleSvg(state.style, tokens, { status: text.statuses[state.status], lang }) });
    }
    files.push({ path: `${surface}/index.html`, contents: sheet(kit, surface, states, lang) });
  }
  const links = surfaces.map((surface) => `<li><a href="${surface}/index.html">${escapeXml(text.surfaces[surface])}</a></li>`).join("");
  files.push({ path: "index.html", contents: `<!doctype html>
<html lang="${lang}" dir="${lang === "fa" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${escapeXml(text.labels.kit)}</title></head><body><h1>${escapeXml(text.labels.kit)}</h1><ul>${links}</ul></body></html>
` });
  return files;
}

export {
  tokenLookup,
  repoTokenLookup,
  escapeXml,
  styleSvg,
  previewFiles
};
