import { createRequire as __engineRequire } from 'node:module'; const require = __engineRequire(import.meta.url);
import {
  UNKNOWN,
  answersOf,
  readInterview
} from "./chunk-TJNMOGOI.mjs";
import {
  CLAIM_KEY,
  evidenceFor,
  hostOf,
  loadEvidence
} from "./chunk-QTDYPN2G.mjs";
import {
  AGENT_TOKEN_ENV,
  KnowledgeError,
  NOTE_ID,
  canonicalJson,
  dirUsable,
  knowledgeRef,
  parseKnowledgeRef,
  readFacts,
  readIdentityIntake,
  readYaml,
  safeRead,
  safetyBlocksSharing,
  safetyReport,
  sha256Hex,
  withLock,
  writeVaultFile
} from "./chunk-YAOGM5B7.mjs";

// packages/brand-core/src/competitive/model.ts
import crypto from "node:crypto";
var COMPETITIVE_SCHEMA_VERSION = 1;
var LANDSCAPE_SCHEMA = "brand-os.competitive-landscape/1";
var RELATIONSHIPS = ["direct", "indirect", "substitute", "aspirational_benchmark"];
var GEOGRAPHIES = ["local", "regional", "international"];
var CANDIDATE_SOURCES = ["owner_named", "research_lead", "seo_interview"];
var STORED_STATUSES = ["candidate", "owner_reviewed", "disputed", "archived"];
var DIMENSIONS = ["offer", "audience", "geography", "public_price", "public_message", "visual_language", "observable_channels", "strength_hypothesis", "weakness_hypothesis"];
var PURPOSES = ["identity", "positioning", "marketing", "pricing", "seo", "expansion"];
var STATEMENT_KINDS = ["observed_claim", "inference"];
var BILLING_PERIODS = ["month", "year", "one_time", "unknown"];
var BILLING_COMMITMENTS = ["monthly", "annual", "none", "unknown"];
var TAX_INCLUSIONS = ["included", "excluded", "unknown"];
var PROMOTIONS = ["none_observed", "promotional", "unknown"];
var PURPOSE_DIMENSIONS = {
  identity: ["visual_language", "public_message"],
  positioning: ["offer", "audience", "public_message", "strength_hypothesis", "weakness_hypothesis"],
  marketing: ["public_message", "observable_channels", "audience"],
  pricing: ["public_price", "offer"],
  seo: ["public_message"],
  expansion: ["geography", "offer"]
};
var COMPETITOR_ID = /^cmp_[0-9a-f-]{36}$/;
var OBSERVATION_ID = /^ob_[0-9a-f-]{36}$/;
var MARKET = /^(?:[A-Z]{2}|GLOBAL)$/;
var CURRENCY = /^[A-Z]{3}$/;
var COMPETITIVE_LIMITS = {
  maxNameChars: 80,
  maxLabelChars: 200,
  maxReasonChars: 200,
  maxOfferChars: 80,
  maxScopeChars: 120,
  maxMarkets: 20,
  maxObservations: 100,
  maxCandidates: 200,
  maxDomainChars: 253,
  maxFileBytes: 512 * 1024
};
var CompetitiveError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "CompetitiveError";
  }
  code;
};
function newCompetitorId() {
  return `cmp_${crypto.randomUUID()}`;
}
function newObservationId() {
  return `ob_${crypto.randomUUID()}`;
}
function oneOf(value, allowed, field) {
  if (typeof value === "string" && allowed.includes(value)) return value;
  throw new CompetitiveError("invalid_input", `${field} must be one of ${allowed.join(", ")}.`);
}
function listOf(value, allowed, field) {
  if (value === void 0 || value === null || value === "") return [];
  const items = typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : value;
  if (!Array.isArray(items)) throw new CompetitiveError("invalid_input", `${field} must be a list.`);
  const out = [];
  for (const item of items) {
    const v = oneOf(item, allowed, field);
    if (!out.includes(v)) out.push(v);
  }
  return out;
}
function validateCompetitorId(value) {
  if (typeof value !== "string" || !COMPETITOR_ID.test(value)) throw new CompetitiveError("invalid_input", "A competitor id looks like cmp_<uuid>.");
  return value;
}
function validateClaimKey(value) {
  if (typeof value !== "string" || !CLAIM_KEY.test(value)) throw new CompetitiveError("invalid_input", "claim_key must be a dotted id such as rival.pricing.pro_monthly.");
  return value;
}
function shortText(value, max, field, required = true) {
  if (value === void 0 || value === null || value === "") {
    if (required) throw new CompetitiveError("invalid_input", `${field} is required.`);
    return null;
  }
  if (typeof value !== "string") throw new CompetitiveError("invalid_input", `${field} must be text.`);
  const clean = value.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!clean) {
    if (required) throw new CompetitiveError("invalid_input", `${field} is required.`);
    return null;
  }
  if (clean.length > max) throw new CompetitiveError("invalid_input", `${field} is longer than ${max} characters. Keep source text in a Knowledge research note and cite it.`);
  return clean;
}
function validateMarkets(value) {
  const items = value === void 0 || value === null || value === "" ? [] : typeof value === "string" ? value.split(",").map((item) => item.trim()) : value;
  if (!Array.isArray(items)) throw new CompetitiveError("invalid_input", "Markets must be a list.");
  const out = [];
  for (const item of items) {
    const code = typeof item === "string" ? item.trim().toUpperCase() : "";
    if (!MARKET.test(code)) throw new CompetitiveError("invalid_input", "A market is a two-letter country code (TR, IR, DE) or GLOBAL.");
    if (!out.includes(code)) out.push(code);
  }
  if (out.length > COMPETITIVE_LIMITS.maxMarkets) throw new CompetitiveError("invalid_input", `At most ${COMPETITIVE_LIMITS.maxMarkets} markets.`);
  return out.sort();
}
function nameKey(name) {
  return name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
var BLOCKED_HOST_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".test", ".invalid", ".example", ".onion"];
function validateDomain(value) {
  if (typeof value !== "string") throw new CompetitiveError("invalid_input", "A domain must be text.");
  const domain = value.trim().toLowerCase().replace(/\.$/, "");
  if (!domain || domain.length > COMPETITIVE_LIMITS.maxDomainChars) throw new CompetitiveError("invalid_input", "A domain is required.");
  if (/[/:@?#\s\\]/.test(domain)) throw new CompetitiveError("invalid_input", "Give a bare domain such as rival.com, not a URL.");
  if (/^\d+(?:\.\d+){3}$/.test(domain) || domain.includes("[")) throw new CompetitiveError("invalid_input", "An IP address is not a competitor domain.");
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label)) || !/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(labels[labels.length - 1])) {
    throw new CompetitiveError("invalid_input", "That is not a public domain name.");
  }
  if (domain === "localhost" || BLOCKED_HOST_SUFFIXES.some((suffix) => `.${domain}`.endsWith(suffix))) throw new CompetitiveError("invalid_input", "Local and private-use domains are refused.");
  return domain;
}
function hostMatchesDomain(host, domain) {
  const h = host.toLowerCase();
  return h === domain || h.endsWith(`.${domain}`);
}
var DIGITS = { "\u06F0": "0", "\u06F1": "1", "\u06F2": "2", "\u06F3": "3", "\u06F4": "4", "\u06F5": "5", "\u06F6": "6", "\u06F7": "7", "\u06F8": "8", "\u06F9": "9", "\u0660": "0", "\u0661": "1", "\u0662": "2", "\u0663": "3", "\u0664": "4", "\u0665": "5", "\u0666": "6", "\u0667": "7", "\u0668": "8", "\u0669": "9", "\u066C": ",", "\u066B": "." };
function asciiDigits(text) {
  return text.normalize("NFKC").replace(/[۰-۹٠-٩٬٫]/g, (ch) => DIGITS[ch] ?? ch);
}
function numbersIn(text) {
  const out = /* @__PURE__ */ new Set();
  const ascii = asciiDigits(text);
  for (const match of ascii.matchAll(/\d+/g)) out.add(Number(match[0]));
  for (const match of ascii.matchAll(/\d+(?:[.,\s]\d+)*/g)) {
    const token = match[0].replace(/\s/g, "");
    const dotDecimal = Number(token.replace(/,/g, ""));
    const commaDecimal = Number(token.replace(/\./g, "").replace(",", "."));
    const plain = Number(token.replace(/[.,]/g, ""));
    for (const n of [dotDecimal, commaDecimal, plain]) if (Number.isFinite(n)) out.add(n);
  }
  return [...out];
}
var CURRENCY_CUES = {
  USD: /\$|\busd\b|us\s?\$/i,
  EUR: /€|\beur\b|\beuro/i,
  GBP: /£|\bgbp\b/i,
  TRY: /₺|\btry\b|\btl\b|türk lirası/i,
  IRR: /\birr\b|ریال|rial/i,
  AED: /\baed\b|درهم|dirham/i
};
var PERIOD_CUES = {
  month: /month|\/\s?mo\b|\bmo\b|\bmonthly|\baylık|\bay\b|\/\s?ay\b|ماه/i,
  year: /year|\/\s?yr\b|annual|\byıl|yearly|سال/i,
  one_time: /one[-\s]?time|lifetime|once|tek seferlik|ömür boyu|یک\s?بار/i
};
var TAX_CUE = /\btax|\bvat\b|\bkdv\b|vergi|مالیات|ارزش افزوده/i;
var PROMOTION_CUE = /discount|%\s?off|\boff\b|\bsave\b|\bsale\b|promo|limited|first (?:month|year)|introductory|\bintro\b|launch offer|indirim|kampanya|fırsat|تخفیف|حراج|ویژه/i;
function priceSupport(price, quote) {
  const problems = [];
  const text = asciiDigits(quote);
  if (!numbersIn(text).some((n) => Math.abs(n - price.amount) < 1e-9)) problems.push(`the amount ${price.amount} does not appear in the quote`);
  const currencyCue = CURRENCY_CUES[price.currency];
  if (!(currencyCue ? currencyCue.test(text) : new RegExp(`\\b${price.currency}\\b`, "i").test(text))) problems.push(`the currency ${price.currency} is not shown in the quote`);
  if (price.billing_period !== "unknown" && !PERIOD_CUES[price.billing_period].test(text)) problems.push(`the quote does not state a ${price.billing_period} period; use unknown`);
  if (price.billing_commitment === "annual" && !PERIOD_CUES.year.test(text)) problems.push("the quote does not state an annual commitment; use unknown");
  if (price.billing_commitment === "monthly" && !PERIOD_CUES.month.test(text)) problems.push("the quote does not state a monthly commitment; use unknown");
  if (price.tax_inclusion !== "unknown" && !TAX_CUE.test(text)) problems.push("the quote says nothing about tax; use unknown");
  if (price.promotion === "none_observed" && PROMOTION_CUE.test(text)) problems.push("the quote reads like a promotion; record promotion as promotional or unknown");
  return { ok: problems.length === 0, problems };
}
function validatePrice(raw) {
  const amount = typeof raw.amount === "number" ? raw.amount : typeof raw.amount === "string" && raw.amount.trim() !== "" ? Number(raw.amount) : NaN;
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e12) throw new CompetitiveError("invalid_input", "amount must be a number as shown on the page. Unknown is not zero: leave the price out instead.");
  const currency = typeof raw.currency === "string" ? raw.currency.trim().toUpperCase() : "";
  if (!CURRENCY.test(currency)) throw new CompetitiveError("invalid_input", "currency must be a three-letter code such as USD, EUR or TRY. Prices are never converted.");
  const markets = validateMarkets(raw.market);
  if (markets.length !== 1 || markets[0] === "GLOBAL") throw new CompetitiveError("invalid_input", "A price needs the one country market it was observed for (TR, US\u2026).");
  return {
    offer_name: shortText(raw.offer_name, COMPETITIVE_LIMITS.maxOfferChars, "offer_name"),
    amount,
    currency,
    billing_period: oneOf(raw.billing_period ?? "unknown", BILLING_PERIODS, "billing_period"),
    billing_commitment: oneOf(raw.billing_commitment ?? "unknown", BILLING_COMMITMENTS, "billing_commitment"),
    market: markets[0],
    tax_inclusion: oneOf(raw.tax_inclusion ?? "unknown", TAX_INCLUSIONS, "tax_inclusion"),
    promotion: oneOf(raw.promotion ?? "unknown", PROMOTIONS, "promotion"),
    feature_scope: shortText(raw.feature_scope, COMPETITIVE_LIMITS.maxScopeChars, "feature_scope", false)
  };
}
function priceCaveats(price) {
  const out = [];
  if (price.billing_period === "unknown") out.push("billing_period_unknown");
  if (price.billing_commitment === "unknown") out.push("billing_commitment_unknown");
  if (price.billing_commitment === "annual" && price.billing_period === "month") out.push("monthly_rate_billed_annually");
  if (price.tax_inclusion === "unknown") out.push("tax_unknown");
  if (price.promotion !== "none_observed") out.push(price.promotion === "promotional" ? "promotional_price" : "promotion_unknown");
  if (!price.feature_scope) out.push("feature_scope_unknown");
  return out;
}

// packages/brand-core/src/competitive/i18n.ts
var COMPETITIVE_LANGS = ["en", "fa", "tr"];
var DIMENSION_LABELS = {
  offer: { en: "offer", fa: "\u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u0648 \u0645\u062D\u0635\u0648\u0644", tr: "teklif" },
  audience: { en: "audience", fa: "\u0645\u062E\u0627\u0637\u0628", tr: "hedef kitle" },
  geography: { en: "geography", fa: "\u062C\u063A\u0631\u0627\u0641\u06CC\u0627", tr: "co\u011Frafya" },
  public_price: { en: "public price", fa: "\u0642\u06CC\u0645\u062A \u0639\u0645\u0648\u0645\u06CC", tr: "a\xE7\u0131k fiyat" },
  public_message: { en: "public message", fa: "\u067E\u06CC\u0627\u0645 \u0639\u0645\u0648\u0645\u06CC", tr: "a\xE7\u0131k mesaj" },
  visual_language: { en: "visual language", fa: "\u0632\u0628\u0627\u0646 \u0628\u0635\u0631\u06CC", tr: "g\xF6rsel dil" },
  observable_channels: { en: "observable channels", fa: "\u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\u06CC \u0642\u0627\u0628\u0644 \u0645\u0634\u0627\u0647\u062F\u0647", tr: "g\xF6zlemlenebilir kanallar" },
  strength_hypothesis: { en: "strength (hypothesis)", fa: "\u0646\u0642\u0637\u0647\u0654 \u0642\u0648\u062A (\u0641\u0631\u0636\u06CC\u0647)", tr: "g\xFC\xE7l\xFC y\xF6n (hipotez)" },
  weakness_hypothesis: { en: "weakness (hypothesis)", fa: "\u0646\u0642\u0637\u0647\u0654 \u0636\u0639\u0641 (\u0641\u0631\u0636\u06CC\u0647)", tr: "zay\u0131f y\xF6n (hipotez)" }
};
var GAP_TEXT = {
  research_unavailable: {
    en: "Research cannot run here ({reason}). Add source URLs you trust, or record sources later; nothing is filled in meanwhile.",
    fa: "\u067E\u0698\u0648\u0647\u0634 \u0627\u06CC\u0646\u062C\u0627 \u0627\u062C\u0631\u0627 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F ({reason}). \u0646\u0634\u0627\u0646\u06CC \u0645\u0646\u0627\u0628\u0639\u06CC \u0631\u0627 \u06A9\u0647 \u0628\u0647 \u0622\u0646\u200C\u0647\u0627 \u0627\u0639\u062A\u0645\u0627\u062F \u062F\u0627\u0631\u06CC\u062F \u0627\u0636\u0627\u0641\u0647 \u06A9\u0646\u06CC\u062F \u06CC\u0627 \u0628\u0639\u062F\u0627\u064B \u0645\u0646\u0628\u0639 \u062B\u0628\u062A \u06A9\u0646\u06CC\u062F\u061B \u062A\u0627 \u0622\u0646 \u0632\u0645\u0627\u0646 \u0686\u06CC\u0632\u06CC \u062D\u062F\u0633 \u0632\u062F\u0647 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F.",
    tr: "Ara\u015Ft\u0131rma burada \xE7al\u0131\u015Fam\u0131yor ({reason}). G\xFCvendi\u011Finiz kaynak adreslerini ekleyin ya da kaynaklar\u0131 sonra kaydedin; bu arada hi\xE7bir \u015Fey tahminle doldurulmaz."
  },
  scope_not_set: {
    en: "Say what this research is for (identity, positioning, marketing, pricing, seo, expansion) so only the useful gaps are listed.",
    fa: "\u0628\u06AF\u0648\u06CC\u06CC\u062F \u0627\u06CC\u0646 \u067E\u0698\u0648\u0647\u0634 \u0628\u0631\u0627\u06CC \u0686\u06CC\u0633\u062A (\u0647\u0648\u06CC\u062A\u060C \u062C\u0627\u06CC\u06AF\u0627\u0647\u200C\u06CC\u0627\u0628\u06CC\u060C \u0628\u0627\u0632\u0627\u0631\u06CC\u0627\u0628\u06CC\u060C \u0642\u06CC\u0645\u062A\u200C\u06AF\u0630\u0627\u0631\u06CC\u060C \u0633\u0626\u0648\u060C \u06AF\u0633\u062A\u0631\u0634) \u062A\u0627 \u0641\u0642\u0637 \u0634\u06A9\u0627\u0641\u200C\u0647\u0627\u06CC \u0645\u0641\u06CC\u062F \u0641\u0647\u0631\u0633\u062A \u0634\u0648\u0646\u062F.",
    tr: "Bu ara\u015Ft\u0131rman\u0131n ne i\xE7in oldu\u011Funu s\xF6yleyin (kimlik, konumland\u0131rma, pazarlama, fiyatland\u0131rma, SEO, geni\u015Fleme); b\xF6ylece yaln\u0131zca i\u015Fe yarar eksikler listelenir."
  },
  target_market_unapproved: {
    en: "The target market (business.market.geography) is not approved yet. Local, regional and international are judged against it; answer it in the interview first.",
    fa: "\u0628\u0627\u0632\u0627\u0631 \u0647\u062F\u0641 (business.market.geography) \u0647\u0646\u0648\u0632 \u062A\u0623\u06CC\u06CC\u062F \u0646\u0634\u062F\u0647 \u0627\u0633\u062A. \u0645\u062D\u0644\u06CC\u060C \u0645\u0646\u0637\u0642\u0647\u200C\u0627\u06CC \u0648 \u0628\u06CC\u0646\u200C\u0627\u0644\u0645\u0644\u0644\u06CC \u0646\u0633\u0628\u062A \u0628\u0647 \u0622\u0646 \u0633\u0646\u062C\u06CC\u062F\u0647 \u0645\u06CC\u200C\u0634\u0648\u0646\u062F\u061B \u0627\u0628\u062A\u062F\u0627 \u062F\u0631 \u0645\u0635\u0627\u062D\u0628\u0647 \u0628\u0647 \u0622\u0646 \u067E\u0627\u0633\u062E \u062F\u0647\u06CC\u062F.",
    tr: "Hedef pazar (business.market.geography) hen\xFCz onaylanmad\u0131. Yerel, b\xF6lgesel ve uluslararas\u0131 bu pazara g\xF6re de\u011Ferlendirilir; \xF6nce g\xF6r\xFC\u015Fmede yan\u0131tlay\u0131n."
  },
  no_candidates: {
    en: "No candidates yet. Who do buyers compare you with? Who solves the same job differently? Names only; each starts as an unverified candidate.",
    fa: "\u0647\u0646\u0648\u0632 \u0646\u0627\u0645\u0632\u062F\u06CC \u062B\u0628\u062A \u0646\u0634\u062F\u0647 \u0627\u0633\u062A. \u062E\u0631\u06CC\u062F\u0627\u0631\u0627\u0646 \u0634\u0645\u0627 \u0631\u0627 \u0628\u0627 \u0686\u0647 \u06A9\u0633\u0627\u0646\u06CC \u0645\u0642\u0627\u06CC\u0633\u0647 \u0645\u06CC\u200C\u06A9\u0646\u0646\u062F\u061F \u0686\u0647 \u06A9\u0633\u06CC \u0647\u0645\u06CC\u0646 \u0646\u06CC\u0627\u0632 \u0631\u0627 \u0628\u0647 \u0631\u0648\u0634 \u062F\u06CC\u06AF\u0631\u06CC \u0628\u0631\u0622\u0648\u0631\u062F\u0647 \u0645\u06CC\u200C\u06A9\u0646\u062F\u061F \u0641\u0642\u0637 \u0646\u0627\u0645\u061B \u0647\u0631 \u0646\u0627\u0645 \u0627\u0628\u062A\u062F\u0627 \u06CC\u06A9 \u0646\u0627\u0645\u0632\u062F \u062A\u0623\u06CC\u06CC\u062F\u0646\u0634\u062F\u0647 \u0627\u0633\u062A.",
    tr: "Hen\xFCz aday yok. Al\u0131c\u0131lar sizi kimlerle kar\u015F\u0131la\u015Ft\u0131r\u0131yor? Ayn\u0131 i\u015Fi ba\u015Fka yoldan kim \xE7\xF6z\xFCyor? Yaln\u0131zca adlar; her biri do\u011Frulanmam\u0131\u015F bir aday olarak ba\u015Flar."
  },
  relationship_unknown: {
    en: "{name}: is this a direct competitor, an indirect one, a substitute, or a reference brand you admire?",
    fa: "{name}: \u0627\u06CC\u0646 \u0631\u0642\u06CC\u0628 \u0645\u0633\u062A\u0642\u06CC\u0645 \u0627\u0633\u062A\u060C \u063A\u06CC\u0631\u0645\u0633\u062A\u0642\u06CC\u0645\u060C \u062C\u0627\u06CC\u06AF\u0632\u06CC\u0646\u060C \u06CC\u0627 \u0628\u0631\u0646\u062F\u06CC \u0645\u0631\u062C\u0639 \u06A9\u0647 \u0622\u0646 \u0631\u0627 \u062A\u062D\u0633\u06CC\u0646 \u0645\u06CC\u200C\u06A9\u0646\u06CC\u062F\u061F",
    tr: "{name}: do\u011Frudan rakip mi, dolayl\u0131 rakip mi, ikame mi, yoksa \xF6rnek ald\u0131\u011F\u0131n\u0131z bir marka m\u0131?"
  },
  identity_unverified: {
    en: "{name}: the official website is not verified. Record a source fetched from its domain, then verify the domain.",
    fa: "{name}: \u0648\u0628\u200C\u0633\u0627\u06CC\u062A \u0631\u0633\u0645\u06CC \u062A\u0623\u06CC\u06CC\u062F \u0646\u0634\u062F\u0647 \u0627\u0633\u062A. \u0645\u0646\u0628\u0639\u06CC \u0631\u0627 \u06A9\u0647 \u0627\u0632 \u062F\u0627\u0645\u0646\u0647\u0654 \u0622\u0646 \u062F\u0631\u06CC\u0627\u0641\u062A \u0634\u062F\u0647 \u062B\u0628\u062A \u06A9\u0646\u06CC\u062F \u0648 \u0633\u067E\u0633 \u062F\u0627\u0645\u0646\u0647 \u0631\u0627 \u062A\u0623\u06CC\u06CC\u062F \u06A9\u0646\u06CC\u062F.",
    tr: "{name}: resmi web sitesi do\u011Frulanmad\u0131. Alan ad\u0131ndan al\u0131nm\u0131\u015F bir kaynak kaydedin, sonra alan ad\u0131n\u0131 do\u011Frulay\u0131n."
  },
  dimension_unknown: {
    en: "{name}: {dimension} is unknown. A dated source is needed; it stays unknown until then.",
    fa: "{name}: {dimension} \u0646\u0627\u0645\u0639\u0644\u0648\u0645 \u0627\u0633\u062A. \u06CC\u06A9 \u0645\u0646\u0628\u0639 \u062A\u0627\u0631\u06CC\u062E\u200C\u062F\u0627\u0631 \u0644\u0627\u0632\u0645 \u0627\u0633\u062A\u061B \u062A\u0627 \u0622\u0646 \u0632\u0645\u0627\u0646 \u0646\u0627\u0645\u0639\u0644\u0648\u0645 \u0645\u06CC\u200C\u0645\u0627\u0646\u062F.",
    tr: "{name}: {dimension} bilinmiyor. Tarihli bir kaynak gerekiyor; o zamana kadar bilinmiyor olarak kal\u0131r."
  },
  evidence_needs_review: {
    en: "{name}: the source {note} for {dimension} {reason}. It is not used as current until re-checked.",
    fa: "{name}: \u0645\u0646\u0628\u0639 {note} \u0628\u0631\u0627\u06CC {dimension} {reason}. \u062A\u0627 \u0628\u0627\u0632\u0628\u06CC\u0646\u06CC \u062F\u0648\u0628\u0627\u0631\u0647\u060C \u0628\u0647\u200C\u0639\u0646\u0648\u0627\u0646 \u062F\u0627\u062F\u0647\u0654 \u0641\u0639\u0644\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F.",
    tr: "{name}: {dimension} i\xE7in {note} kayna\u011F\u0131 {reason}. Yeniden kontrol edilene kadar g\xFCncel say\u0131lmaz."
  },
  evidence_conflicting: {
    en: "{name}: sources disagree about {dimension}. Both are kept; decide after reading them.",
    fa: "{name}: \u0645\u0646\u0627\u0628\u0639 \u062F\u0631\u0628\u0627\u0631\u0647\u0654 {dimension} \u0628\u0627 \u0647\u0645 \u0627\u062E\u062A\u0644\u0627\u0641 \u062F\u0627\u0631\u0646\u062F. \u0647\u0631 \u062F\u0648 \u0646\u06AF\u0647 \u062F\u0627\u0634\u062A\u0647 \u0645\u06CC\u200C\u0634\u0648\u0646\u062F\u061B \u067E\u0633 \u0627\u0632 \u062E\u0648\u0627\u0646\u062F\u0646 \u0622\u0646\u200C\u0647\u0627 \u062A\u0635\u0645\u06CC\u0645 \u0628\u06AF\u06CC\u0631\u06CC\u062F.",
    tr: "{name}: kaynaklar {dimension} konusunda \xE7eli\u015Fiyor. \u0130kisi de saklan\u0131r; okuduktan sonra karar verin."
  },
  same_name_other_market: {
    en: "{name}: another candidate has the same name in a different market. They are kept apart; confirm they are different businesses.",
    fa: "{name}: \u0646\u0627\u0645\u0632\u062F \u062F\u06CC\u06AF\u0631\u06CC \u0628\u0627 \u0647\u0645\u06CC\u0646 \u0646\u0627\u0645 \u062F\u0631 \u0628\u0627\u0632\u0627\u0631 \u062F\u06CC\u06AF\u0631\u06CC \u0647\u0633\u062A. \u062C\u062F\u0627 \u0646\u06AF\u0647 \u062F\u0627\u0634\u062A\u0647 \u0645\u06CC\u200C\u0634\u0648\u0646\u062F\u061B \u062A\u0623\u06CC\u06CC\u062F \u06A9\u0646\u06CC\u062F \u06A9\u0647 \u062F\u0648 \u06A9\u0633\u0628\u200C\u0648\u06A9\u0627\u0631 \u0645\u062A\u0641\u0627\u0648\u062A\u200C\u0627\u0646\u062F.",
    tr: "{name}: ba\u015Fka bir pazarda ayn\u0131 adl\u0131 bir aday var. Ayr\u0131 tutulurlar; farkl\u0131 i\u015Fletmeler olduklar\u0131n\u0131 do\u011Frulay\u0131n."
  },
  prices_not_comparable: {
    en: "The recorded prices are not comparable as they stand ({reason}). They are listed, not ranked, and never converted between currencies.",
    fa: "\u0642\u06CC\u0645\u062A\u200C\u0647\u0627\u06CC \u062B\u0628\u062A\u200C\u0634\u062F\u0647 \u062F\u0631 \u0648\u0636\u0639 \u0641\u0639\u0644\u06CC \u0642\u0627\u0628\u0644 \u0645\u0642\u0627\u06CC\u0633\u0647 \u0646\u06CC\u0633\u062A\u0646\u062F ({reason}). \u0641\u0642\u0637 \u0641\u0647\u0631\u0633\u062A \u0645\u06CC\u200C\u0634\u0648\u0646\u062F\u060C \u0631\u062A\u0628\u0647\u200C\u0628\u0646\u062F\u06CC \u0646\u0645\u06CC\u200C\u0634\u0648\u0646\u062F \u0648 \u0647\u0631\u06AF\u0632 \u0628\u06CC\u0646 \u0627\u0631\u0632\u0647\u0627 \u062A\u0628\u062F\u06CC\u0644 \u0646\u0645\u06CC\u200C\u0634\u0648\u0646\u062F.",
    tr: "Kaydedilen fiyatlar bu haliyle kar\u015F\u0131la\u015Ft\u0131r\u0131lamaz ({reason}). S\u0131ralanmaz, yaln\u0131zca listelenir ve para birimleri aras\u0131nda asla \xE7evrilmez."
  },
  seo_needs_search_evidence: {
    en: "For SEO, competitor names are not search evidence. Rankings and keyword gaps stay unverified without search data.",
    fa: "\u0628\u0631\u0627\u06CC \u0633\u0626\u0648\u060C \u0646\u0627\u0645 \u0631\u0642\u0628\u0627 \u0634\u0648\u0627\u0647\u062F \u062C\u0633\u062A\u200C\u0648\u062C\u0648 \u0646\u06CC\u0633\u062A. \u0631\u062A\u0628\u0647\u200C\u0647\u0627 \u0648 \u0634\u06A9\u0627\u0641\u200C\u0647\u0627\u06CC \u06A9\u0644\u06CC\u062F\u0648\u0627\u0698\u0647 \u0628\u062F\u0648\u0646 \u062F\u0627\u062F\u0647\u0654 \u062C\u0633\u062A\u200C\u0648\u062C\u0648 \u062A\u0623\u06CC\u06CC\u062F\u0646\u0634\u062F\u0647 \u0645\u06CC\u200C\u0645\u0627\u0646\u0646\u062F.",
    tr: "SEO i\xE7in rakip adlar\u0131 arama kan\u0131t\u0131 de\u011Fildir. S\u0131ralamalar ve anahtar kelime bo\u015Fluklar\u0131 arama verisi olmadan do\u011Frulanmam\u0131\u015F kal\u0131r."
  }
};
var REVIEW_REASONS = {
  stale: { en: "is older than its freshness limit (history, not current)", fa: "\u0627\u0632 \u0645\u062D\u062F\u0648\u062F\u0647\u0654 \u062A\u0627\u0632\u06AF\u06CC\u200C\u0627\u0634 \u0642\u062F\u06CC\u0645\u06CC\u200C\u062A\u0631 \u0627\u0633\u062A (\u0633\u0627\u0628\u0642\u0647 \u0627\u0633\u062A\u060C \u0646\u0647 \u062F\u0627\u062F\u0647\u0654 \u0641\u0639\u0644\u06CC)", tr: "tazelik s\u0131n\u0131r\u0131ndan eski (ge\xE7mi\u015F kay\u0131t, g\xFCncel de\u011Fil)" },
  changed: { en: "was edited after it was cited", fa: "\u067E\u0633 \u0627\u0632 \u0627\u0633\u062A\u0646\u0627\u062F \u0648\u06CC\u0631\u0627\u06CC\u0634 \u0634\u062F\u0647 \u0627\u0633\u062A", tr: "al\u0131nt\u0131land\u0131ktan sonra d\xFCzenlendi" },
  superseded: { en: "was replaced by a newer capture", fa: "\u0628\u0627 \u062F\u0631\u06CC\u0627\u0641\u062A \u062A\u0627\u0632\u0647\u200C\u062A\u0631\u06CC \u062C\u0627\u06CC\u06AF\u0632\u06CC\u0646 \u0634\u062F\u0647 \u0627\u0633\u062A", tr: "daha yeni bir kay\u0131tla de\u011Fi\u015Ftirildi" },
  archived: { en: "was archived", fa: "\u0628\u0627\u06CC\u06AF\u0627\u0646\u06CC \u0634\u062F\u0647 \u0627\u0633\u062A", tr: "ar\u015Fivlendi" },
  missing: { en: "can no longer be read", fa: "\u062F\u06CC\u06AF\u0631 \u062E\u0648\u0627\u0646\u062F\u0647 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F", tr: "art\u0131k okunam\u0131yor" },
  claim_missing: { en: "no longer holds the cited claim", fa: "\u062F\u06CC\u06AF\u0631 \u0627\u062F\u0639\u0627\u06CC \u0627\u0633\u062A\u0646\u0627\u062F\u0634\u062F\u0647 \u0631\u0627 \u0646\u062F\u0627\u0631\u062F", tr: "al\u0131nt\u0131lanan iddiay\u0131 art\u0131k i\xE7ermiyor" }
};
var PROHIBITED_TEXT = {
  ad_performance: {
    en: "No ad spend, reach, conversions, ROAS, CAC or campaign effectiveness from visible ads or pages.",
    fa: "\u0647\u06CC\u0686 \u0628\u0631\u062F\u0627\u0634\u062A\u06CC \u062F\u0631\u0628\u0627\u0631\u0647\u0654 \u0647\u0632\u06CC\u0646\u0647\u0654 \u062A\u0628\u0644\u06CC\u063A\u0627\u062A\u060C \u062F\u0633\u062A\u0631\u0633\u06CC\u060C \u062A\u0628\u062F\u06CC\u0644\u060C ROAS\u060C CAC \u06CC\u0627 \u0627\u062B\u0631\u0628\u062E\u0634\u06CC \u06A9\u0645\u067E\u06CC\u0646 \u0627\u0632 \u062A\u0628\u0644\u06CC\u063A\u0627\u062A \u06CC\u0627 \u0635\u0641\u062D\u0647\u200C\u0647\u0627\u06CC \u0642\u0627\u0628\u0644 \u0645\u0634\u0627\u0647\u062F\u0647 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F.",
    tr: "G\xF6r\xFCn\xFCr reklamlardan ya da sayfalardan reklam harcamas\u0131, eri\u015Fim, d\xF6n\xFC\u015F\xFCm, ROAS, CAC veya kampanya etkinli\u011Fi \xE7\u0131kar\u0131lmaz."
  },
  private_commercials: {
    en: "No private discounts, revenue, market share or traffic from a public price page.",
    fa: "\u0647\u06CC\u0686 \u0628\u0631\u062F\u0627\u0634\u062A\u06CC \u062F\u0631\u0628\u0627\u0631\u0647\u0654 \u062A\u062E\u0641\u06CC\u0641 \u062E\u0635\u0648\u0635\u06CC\u060C \u062F\u0631\u0622\u0645\u062F\u060C \u0633\u0647\u0645 \u0628\u0627\u0632\u0627\u0631 \u06CC\u0627 \u062A\u0631\u0627\u0641\u06CC\u06A9 \u0627\u0632 \u0635\u0641\u062D\u0647\u0654 \u0642\u06CC\u0645\u062A \u0639\u0645\u0648\u0645\u06CC \u0646\u0645\u06CC\u200C\u0634\u0648\u062F.",
    tr: "A\xE7\u0131k bir fiyat sayfas\u0131ndan \xF6zel indirim, gelir, pazar pay\u0131 veya trafik \xE7\u0131kar\u0131lmaz."
  },
  search_rankings: {
    en: "No search rankings or keyword gaps from a list of names.",
    fa: "\u0647\u06CC\u0686 \u0631\u062A\u0628\u0647\u0654 \u062C\u0633\u062A\u200C\u0648\u062C\u0648 \u06CC\u0627 \u0634\u06A9\u0627\u0641 \u06A9\u0644\u06CC\u062F\u0648\u0627\u0698\u0647\u200C\u0627\u06CC \u0627\u0632 \u06CC\u06A9 \u0641\u0647\u0631\u0633\u062A \u0646\u0627\u0645 \u0627\u0633\u062A\u0646\u0628\u0627\u0637 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F.",
    tr: "Bir ad listesinden arama s\u0131ralamas\u0131 veya anahtar kelime bo\u015Flu\u011Fu \xE7\u0131kar\u0131lmaz."
  },
  legal_clearance: {
    en: "No trademark clearance, originality or legal-safety claim from a visual comparison.",
    fa: "\u0647\u06CC\u0686 \u0627\u062F\u0639\u0627\u06CC \u062B\u0628\u062A \u0639\u0644\u0627\u0645\u062A \u062A\u062C\u0627\u0631\u06CC\u060C \u0627\u0635\u0627\u0644\u062A \u06CC\u0627 \u0627\u06CC\u0645\u0646\u06CC \u062D\u0642\u0648\u0642\u06CC \u0627\u0632 \u0645\u0642\u0627\u06CC\u0633\u0647\u0654 \u0628\u0635\u0631\u06CC \u0646\u0645\u06CC\u200C\u0634\u0648\u062F.",
    tr: "G\xF6rsel bir kar\u015F\u0131la\u015Ft\u0131rmadan marka tescili, \xF6zg\xFCnl\xFCk veya hukuki g\xFCvenlik iddias\u0131 \xE7\u0131kar\u0131lmaz."
  },
  brand_decision: {
    en: "A competitor observation never sets this brand\u2019s price, positioning, channels or logo; the owner decides through the existing approval flow.",
    fa: "\u0645\u0634\u0627\u0647\u062F\u0647\u0654 \u06CC\u06A9 \u0631\u0642\u06CC\u0628 \u0647\u0631\u06AF\u0632 \u0642\u06CC\u0645\u062A\u060C \u062C\u0627\u06CC\u06AF\u0627\u0647\u060C \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627 \u06CC\u0627 \u0644\u0648\u06AF\u0648\u06CC \u0627\u06CC\u0646 \u0628\u0631\u0646\u062F \u0631\u0627 \u062A\u0639\u06CC\u06CC\u0646 \u0646\u0645\u06CC\u200C\u06A9\u0646\u062F\u061B \u0645\u0627\u0644\u06A9 \u0627\u0632 \u0631\u0627\u0647 \u0641\u0631\u0627\u06CC\u0646\u062F \u062A\u0623\u06CC\u06CC\u062F \u0645\u0648\u062C\u0648\u062F \u062A\u0635\u0645\u06CC\u0645 \u0645\u06CC\u200C\u06AF\u06CC\u0631\u062F.",
    tr: "Bir rakip g\xF6zlemi bu markan\u0131n fiyat\u0131n\u0131, konumunu, kanallar\u0131n\u0131 veya logosunu asla belirlemez; sahibi mevcut onay ak\u0131\u015F\u0131yla karar verir."
  },
  currency_conversion: {
    en: "No currency conversion or tax calculation without a dated, cited rate and method.",
    fa: "\u0647\u06CC\u0686 \u062A\u0628\u062F\u06CC\u0644 \u0627\u0631\u0632 \u06CC\u0627 \u0645\u062D\u0627\u0633\u0628\u0647\u0654 \u0645\u0627\u0644\u06CC\u0627\u062A\u06CC \u0628\u062F\u0648\u0646 \u0646\u0631\u062E \u0648 \u0631\u0648\u0634 \u062A\u0627\u0631\u06CC\u062E\u200C\u062F\u0627\u0631 \u0648 \u0645\u0633\u062A\u0646\u062F \u0627\u0646\u062C\u0627\u0645 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F.",
    tr: "Tarihli ve kaynakl\u0131 bir kur ve y\xF6ntem olmadan d\xF6viz \xE7evirisi veya vergi hesab\u0131 yap\u0131lmaz."
  },
  price_coordination: {
    en: "No price matching or coordination with competitors. This brand sets its prices independently.",
    fa: "\u0647\u06CC\u0686 \u062A\u0637\u0628\u06CC\u0642 \u06CC\u0627 \u0647\u0645\u0627\u0647\u0646\u06AF\u06CC \u0642\u06CC\u0645\u062A \u0628\u0627 \u0631\u0642\u0628\u0627 \u0627\u0646\u062C\u0627\u0645 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F. \u0627\u06CC\u0646 \u0628\u0631\u0646\u062F \u0642\u06CC\u0645\u062A\u200C\u0647\u0627\u06CC\u0634 \u0631\u0627 \u0645\u0633\u062A\u0642\u0644 \u062A\u0639\u06CC\u06CC\u0646 \u0645\u06CC\u200C\u06A9\u0646\u062F.",
    tr: "Rakiplerle fiyat e\u015Fleme veya fiyat koordinasyonu yap\u0131lmaz. Bu marka fiyatlar\u0131n\u0131 ba\u011F\u0131ms\u0131z belirler."
  }
};
function asLang(value) {
  return typeof value === "string" && COMPETITIVE_LANGS.includes(value) ? value : "en";
}
function fill(template, vars = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) => vars[key] ?? match);
}
var HEADINGS = {
  title: { en: "Competitive landscape for {name} ({state}). Draft, owner-only; authorizes nothing.", fa: "\u0686\u0634\u0645\u200C\u0627\u0646\u062F\u0627\u0632 \u0631\u0642\u0627\u0628\u062A\u06CC {name} ({state}). \u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633\u060C \u0641\u0642\u0637 \u0628\u0631\u0627\u06CC \u0645\u0627\u0644\u06A9\u061B \u0647\u06CC\u0686 \u0645\u062C\u0648\u0632\u06CC \u0646\u0645\u06CC\u200C\u062F\u0647\u062F.", tr: "{name} i\xE7in rekabet g\xF6r\xFCn\xFCm\xFC ({state}). Taslak, yaln\u0131zca sahibine \xF6zel; hi\xE7bir \u015Feye yetki vermez." },
  research: { en: "Research: {state}{reason}", fa: "\u067E\u0698\u0648\u0647\u0634: {state}{reason}", tr: "Ara\u015Ft\u0131rma: {state}{reason}" },
  scope: { en: "Scope: {purposes}. Target market fact {fact}: {state}.", fa: "\u062F\u0627\u0645\u0646\u0647: {purposes}. \u0648\u0627\u0642\u0639\u06CC\u062A \u0628\u0627\u0632\u0627\u0631 \u0647\u062F\u0641 {fact}: {state}.", tr: "Kapsam: {purposes}. Hedef pazar bilgisi {fact}: {state}." },
  scope_not_set: { en: "not set", fa: "\u062A\u0639\u06CC\u06CC\u0646 \u0646\u0634\u062F\u0647", tr: "belirlenmedi" },
  prices: { en: "Public prices (listed, not ranked; no currency conversion): {state}{reason}", fa: "\u0642\u06CC\u0645\u062A\u200C\u0647\u0627\u06CC \u0639\u0645\u0648\u0645\u06CC (\u0641\u0647\u0631\u0633\u062A\u200C\u0634\u062F\u0647\u060C \u0628\u062F\u0648\u0646 \u0631\u062A\u0628\u0647\u200C\u0628\u0646\u062F\u06CC\u061B \u0628\u062F\u0648\u0646 \u062A\u0628\u062F\u06CC\u0644 \u0627\u0631\u0632): {state}{reason}", tr: "A\xE7\u0131k fiyatlar (listelenir, s\u0131ralanmaz; d\xF6viz \xE7evirisi yok): {state}{reason}" },
  gaps: { en: "Gaps:", fa: "\u0634\u06A9\u0627\u0641\u200C\u0647\u0627:", tr: "Eksikler:" },
  never: { en: "Never inferred:", fa: "\u0647\u0631\u06AF\u0632 \u0627\u0633\u062A\u0646\u0628\u0627\u0637 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F:", tr: "Asla \xE7\u0131kar\u0131lmaz:" },
  observed_on: { en: "observed {date}", fa: "\u0645\u0634\u0627\u0647\u062F\u0647\u200C\u0634\u062F\u0647 \u062F\u0631 {date}", tr: "{date} tarihinde g\xF6zlemlendi" }
};

// packages/brand-core/src/competitive/store.ts
import fs from "node:fs";
import path from "node:path";
var COMPETITIVE_DIRS = {
  root: "brand/.private/competitive",
  candidates: "brand/.private/competitive/candidates"
};
var COMPETITIVE_TOPIC = "market_observation";
function competitiveDir(ws, key) {
  return path.join(ws.root, ...COMPETITIVE_DIRS[key].split("/"));
}
function scopeFile(ws) {
  return path.join(competitiveDir(ws, "root"), "scope.json");
}
function candidateFile(ws, id) {
  return path.join(competitiveDir(ws, "candidates"), `${validateCompetitorId(id)}.json`);
}
function assertOwnerProcess() {
  if (process.env[AGENT_TOKEN_ENV]) {
    throw new CompetitiveError("refused", `Competitor dossiers are the owner's local drafts. Refusing while ${AGENT_TOKEN_ENV} is set; no agent profile covers them.`);
  }
}
function usable(ws, dir) {
  try {
    return dirUsable(ws, dir);
  } catch (error) {
    if (error instanceof KnowledgeError) throw new CompetitiveError("unsafe_path", error.message);
    throw error;
  }
}
function readJson(ws, file, kind) {
  if (!usable(ws, path.dirname(file))) return null;
  let raw;
  try {
    raw = safeRead(file, COMPETITIVE_LIMITS.maxFileBytes);
  } catch (error) {
    if (error instanceof KnowledgeError) throw new CompetitiveError("unsafe_path", error.message);
    throw error;
  }
  if (!raw) return null;
  let doc;
  try {
    doc = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new CompetitiveError("invalid_record", `${path.basename(file)} is not valid JSON.`);
  }
  if (!doc || typeof doc !== "object" || doc.kind !== kind) throw new CompetitiveError("invalid_record", `${path.basename(file)} is not a ${kind} record.`);
  if (doc.brand_slug !== ws.brandSlug) throw new CompetitiveError("wrong_brand", `${path.basename(file)} belongs to another brand. It is not read.`);
  return doc;
}
function writeJson(ws, file, doc) {
  try {
    writeVaultFile(ws, file, `${JSON.stringify(doc, null, 2)}
`, true);
  } catch (error) {
    if (error instanceof KnowledgeError) throw new CompetitiveError("unsafe_path", error.message);
    throw error;
  }
}
function locked(ws, name, run) {
  try {
    return withLock(ws, name, run);
  } catch (error) {
    if (error instanceof KnowledgeError) throw new CompetitiveError(error.code === "unsafe_path" ? "unsafe_path" : "refused", error.message);
    throw error;
  }
}
function readCandidate(ws, id) {
  assertOwnerProcess();
  const doc = readJson(ws, candidateFile(ws, id), "competitive_candidate");
  if (!doc) throw new CompetitiveError("not_found", `No competitor ${id} in this brand.`);
  if (doc.competitor_id !== id) throw new CompetitiveError("invalid_record", `The file for ${id} carries another competitor id.`);
  return doc;
}
function scanCandidates(ws) {
  assertOwnerProcess();
  const folder = competitiveDir(ws, "candidates");
  const out = { records: [], skipped: [] };
  if (!usable(ws, folder)) return out;
  for (const name of fs.readdirSync(folder).sort()) {
    const match = /^(cmp_[0-9a-f-]{36})\.json$/.exec(name);
    if (!match) continue;
    try {
      out.records.push(readCandidate(ws, match[1]));
    } catch (error) {
      if (!(error instanceof CompetitiveError)) throw error;
      out.skipped.push({ file: name, reason: error.code });
    }
  }
  out.records.sort((a, b) => a.display_name.localeCompare(b.display_name) || a.competitor_id.localeCompare(b.competitor_id));
  return out;
}
function readScope(ws) {
  assertOwnerProcess();
  return readJson(ws, scopeFile(ws), "competitive_scope");
}
function setScope(ws, purposes) {
  assertOwnerProcess();
  const list = listOf(purposes, PURPOSES, "purposes");
  if (!list.length) throw new CompetitiveError("invalid_input", `Name at least one purpose: ${PURPOSES.join(", ")}.`);
  const doc = { schema_version: COMPETITIVE_SCHEMA_VERSION, kind: "competitive_scope", brand_slug: ws.brandSlug, purposes: [...list].sort(), updated_at: ws.now().toISOString() };
  locked(ws, "competitive-scope", () => writeJson(ws, scopeFile(ws), doc));
  return doc;
}
function marketsOverlap(a, b) {
  if (!a.length || !b.length || a.includes("GLOBAL") || b.includes("GLOBAL")) return true;
  return a.some((market) => b.includes(market));
}
function addCandidate(ws, input) {
  assertOwnerProcess();
  const display = shortText(input.display_name, COMPETITIVE_LIMITS.maxNameChars, "Name");
  const key = nameKey(display);
  if (!key) throw new CompetitiveError("invalid_input", "A name needs at least one letter or digit.");
  const blocked = safetyBlocksSharing({ ...safetyReport(display), restricted_passages: 0 });
  if (blocked.length) throw new CompetitiveError("refused", `The name looks like it contains ${blocked.join("; ")}.`);
  const markets = validateMarkets(input.markets);
  const relationship = listOf(input.relationship, RELATIONSHIPS, "relationship");
  const geography = listOf(input.geography, GEOGRAPHIES, "geography");
  const domain = input.domain ? validateDomain(input.domain) : null;
  const source = oneOf(input.source ?? "owner_named", CANDIDATE_SOURCES, "source");
  return locked(ws, "competitive-index", () => {
    const existing = scanCandidates(ws).records;
    if (existing.length >= COMPETITIVE_LIMITS.maxCandidates) throw new CompetitiveError("refused", `At most ${COMPETITIVE_LIMITS.maxCandidates} candidates per brand.`);
    const sameName = existing.filter((record2) => record2.name_key === key);
    const distinct = [];
    if (sameName.length) {
      const other = input.distinct_from ? validateCompetitorId(input.distinct_from) : null;
      const reason = shortText(input.reason, COMPETITIVE_LIMITS.maxReasonChars, "reason", false);
      const named = sameName.find((record2) => record2.competitor_id === other);
      if (!named || !reason || sameName.length > 1) {
        throw new CompetitiveError("duplicate_candidate", `A candidate with this name exists (${sameName.map((record2) => record2.competitor_id).join(", ")}). Use it, or pass --distinct-from <id> --reason "<why this is another business>".`);
      }
      if (marketsOverlap(named.markets, markets)) {
        throw new CompetitiveError("duplicate_candidate", `${named.competitor_id} has the same name and an overlapping or unknown market. Two records for one business are refused; give disjoint markets for both or use the existing record.`);
      }
      distinct.push({ competitor_id: named.competitor_id, reason });
    }
    const now = ws.now().toISOString();
    const record = {
      schema_version: COMPETITIVE_SCHEMA_VERSION,
      kind: "competitive_candidate",
      competitor_id: newCompetitorId(),
      brand_slug: ws.brandSlug,
      display_name: display,
      name_key: key,
      relationship,
      geographic_relevance: geography,
      markets,
      source,
      status: "candidate",
      status_reason: null,
      domain_claim: domain,
      domain_evidence: null,
      distinct_from: distinct,
      observations: [],
      created_at: now,
      updated_at: now
    };
    writeJson(ws, candidateFile(ws, record.competitor_id), record);
    return record;
  });
}
function updateCandidate(ws, id, change) {
  validateCompetitorId(id);
  return locked(ws, `competitive-${id.slice(4, 40)}`, () => {
    const record = readCandidate(ws, id);
    change(record);
    record.updated_at = ws.now().toISOString();
    writeJson(ws, candidateFile(ws, id), record);
    return record;
  });
}
function setStatus(ws, input) {
  assertOwnerProcess();
  const status = oneOf(input.status, STORED_STATUSES, "status");
  const reason = shortText(input.reason, COMPETITIVE_LIMITS.maxReasonChars, "reason", false);
  if ((status === "disputed" || status === "archived") && !reason) throw new CompetitiveError("invalid_input", `${status} needs --reason (for example why this business is excluded).`);
  return updateCandidate(ws, input.competitor_id, (record) => {
    record.status = status;
    record.status_reason = reason;
  });
}
function classifyCandidate(ws, input) {
  assertOwnerProcess();
  const relationship = input.relationship === void 0 ? null : listOf(input.relationship, RELATIONSHIPS, "relationship");
  const geography = input.geography === void 0 ? null : listOf(input.geography, GEOGRAPHIES, "geography");
  const markets = input.markets === void 0 ? null : validateMarkets(input.markets);
  return updateCandidate(ws, input.competitor_id, (record) => {
    if (relationship) record.relationship = relationship;
    if (geography) record.geographic_relevance = geography;
    if (markets) record.markets = markets;
  });
}
function resolveEvidence(ws, input, claimKey, evidence = loadEvidence(ws)) {
  const pinned = typeof input === "string" ? parseKnowledgeRef(input) : null;
  const id = pinned ? pinned.id : input;
  if (typeof id !== "string" || !NOTE_ID.test(id)) throw new CompetitiveError("invalid_input", "Cite a research note as kn_<id> or knowledge:kn_<id>@<sha256>.");
  const key = validateClaimKey(claimKey);
  const item = evidence.items.find((candidate) => candidate.note.id === id);
  if (!item) throw new CompetitiveError("refused", `${id} is not a research note of this brand. Record the source first (npm run brand:seo -- research capture, topic ${COMPETITIVE_TOPIC}); restricted and ordinary notes are never cited.`);
  if (item.source.topic !== COMPETITIVE_TOPIC) throw new CompetitiveError("refused", `${id} is a ${item.source.topic} source. Competitor evidence is recorded with topic ${COMPETITIVE_TOPIC}.`);
  if (item.archived) throw new CompetitiveError("stale_source", `${id} is archived. Cite a current source.`);
  if (item.superseded_by) throw new CompetitiveError("stale_source", `${id} was superseded by ${item.superseded_by}. Cite the newer note.`);
  if (pinned && pinned.revision !== item.note.revision) throw new CompetitiveError("stale_source", `${id} changed since ${input} was read. Re-read it and cite the current revision.`);
  const excerpt = item.source.excerpts.find((candidate) => candidate.claim_key === key && candidate.stance === "supports");
  if (!excerpt) throw new CompetitiveError("unsupported_claim", `${id} has no supporting excerpt for ${key}. Nothing is recorded without a quote that says it.`);
  return { ref: { note_id: item.note.id, revision: item.note.revision, claim_key: key, observed_at: item.source.retrieved_at }, item, excerpt };
}
function linkEvidence(ws, input) {
  assertOwnerProcess();
  const dimension = oneOf(input.dimension, DIMENSIONS, "dimension");
  const kind = oneOf(input.statement_kind ?? "observed_claim", STATEMENT_KINDS, "statement_kind");
  if ((dimension === "strength_hypothesis" || dimension === "weakness_hypothesis") && kind !== "inference") {
    throw new CompetitiveError("invalid_input", `${dimension} is a hypothesis: record it with statement_kind inference.`);
  }
  const label = shortText(input.label, COMPETITIVE_LIMITS.maxLabelChars, "label");
  const blocked = safetyBlocksSharing({ ...safetyReport(label), restricted_passages: 0 });
  if (blocked.length) throw new CompetitiveError("refused", `The label looks like it contains ${blocked.join("; ")}.`);
  const resolved = resolveEvidence(ws, input.note, input.claim_key);
  let price = null;
  if (dimension === "public_price") {
    if (!input.price) throw new CompetitiveError("invalid_input", "A public_price observation needs the price terms (amount, currency, market, period\u2026).");
    if (kind !== "observed_claim") throw new CompetitiveError("invalid_input", "A price is an observed claim, never an inference.");
    price = validatePrice(input.price);
    const support = priceSupport(price, resolved.excerpt.quote);
    if (!support.ok) throw new CompetitiveError("unsupported_claim", `The cited quote does not support this price: ${support.problems.join("; ")}. Nothing was recorded.`);
  } else if (input.price) {
    throw new CompetitiveError("invalid_input", "Price terms belong to a public_price observation only.");
  }
  let outcome = "linked";
  let observation = null;
  const record = updateCandidate(ws, input.competitor_id, (current) => {
    const same = current.observations.find((item) => item.dimension === dimension && item.evidence.note_id === resolved.ref.note_id && item.evidence.claim_key === resolved.ref.claim_key && item.evidence.revision === resolved.ref.revision);
    if (same) {
      outcome = "existing";
      observation = same;
      return;
    }
    if (current.observations.length >= COMPETITIVE_LIMITS.maxObservations) throw new CompetitiveError("refused", `At most ${COMPETITIVE_LIMITS.maxObservations} observations per competitor.`);
    observation = { observation_id: newObservationId(), dimension, statement_kind: kind, label, evidence: resolved.ref, price, recorded_at: ws.now().toISOString() };
    current.observations.push(observation);
  });
  return { record, observation, outcome };
}
function verifyDomain(ws, input) {
  assertOwnerProcess();
  const id = validateCompetitorId(input.competitor_id);
  const current = readCandidate(ws, id);
  const domain = input.domain ? validateDomain(input.domain) : current.domain_claim;
  if (!domain) throw new CompetitiveError("invalid_input", "Give --domain: the bare domain this business uses.");
  const resolved = resolveEvidence(ws, input.note, input.claim_key);
  const hosts = [hostOf(resolved.item.source.url), hostOf(resolved.item.source.final_url)];
  if (!hosts.every((host) => hostMatchesDomain(host, domain))) throw new CompetitiveError("unsupported_claim", `${resolved.ref.note_id} was not fetched from ${domain}. A domain is verified only by a source retrieved from it.`);
  const clash = scanCandidates(ws).records.find((record) => record.competitor_id !== id && record.domain_claim === domain && record.status !== "archived");
  if (clash) throw new CompetitiveError("duplicate_candidate", `${clash.competitor_id} (${clash.display_name}) already claims ${domain}. Archive one record; they are never merged automatically.`);
  return updateCandidate(ws, id, (record) => {
    record.domain_claim = domain;
    record.domain_evidence = resolved.ref;
  });
}

// packages/brand-core/src/competitive/landscape.ts
var TARGET_MARKET_FACT = "business.market.geography";
function refState(evidence, ref) {
  const item = evidence.items.find((candidate) => candidate.note.id === ref.note_id) ?? null;
  if (!item) return { state: "missing", item };
  if (item.archived) return { state: "archived", item };
  if (item.superseded_by) return { state: "superseded", item };
  if (item.note.revision !== ref.revision) return { state: "changed", item };
  if (!item.source.excerpts.some((excerpt) => excerpt.claim_key === ref.claim_key && excerpt.stance === "supports")) return { state: "claim_missing", item };
  if (item.staleness.state === "stale") return { state: "stale", item };
  return { state: "current", item };
}
function sourceClass(item, domain) {
  const type = item.source.source_type;
  if (type === "owner_testimony") return "owner_statement";
  if (type === "first_party_data") return "first_party_data";
  if (type === "official_policy" || type === "official_product_docs") return "platform_documentation";
  if (domain && hostMatchesDomain(hostOf(item.source.final_url), domain)) return "competitor_own_page";
  if (type === "expert_opinion") return "analyst_inference";
  return "independent_reporting";
}
function priceConflicts(observations, usable2) {
  const out = /* @__PURE__ */ new Set();
  const priced = observations.filter((item) => item.price && usable2.has(item.observation_id));
  for (const a of priced) {
    for (const b of priced) {
      if (a === b) continue;
      const pa = a.price;
      const pb = b.price;
      const sameTerms = pa.offer_name.toLowerCase() === pb.offer_name.toLowerCase() && pa.market === pb.market && pa.currency === pb.currency && pa.billing_period === pb.billing_period && pa.billing_commitment === pb.billing_commitment;
      if (sameTerms && pa.amount !== pb.amount) out.add(a.observation_id);
    }
  }
  return out;
}
function viewObservations(record, evidence) {
  const states = new Map(record.observations.map((item) => [item.observation_id, refState(evidence, item.evidence)]));
  const usable2 = new Set(record.observations.filter((item) => states.get(item.observation_id).state === "current").map((item) => item.observation_id));
  const priceClash = priceConflicts(record.observations, usable2);
  return record.observations.map((item) => {
    const { state, item: source } = states.get(item.observation_id);
    const claim = evidenceFor(evidence, item.evidence.claim_key);
    const conflict = claim.contradicting.length > 0 || priceClash.has(item.observation_id);
    let cell;
    if (state !== "current" && state !== "stale") cell = "needs_review";
    else if (conflict) cell = "conflicting";
    else if (state === "stale") cell = "historical";
    else if (item.statement_kind === "inference") cell = "hypothesis";
    else if (!source.source.quotes_verified || !source.source.content_sha256) cell = "unverified";
    else cell = "observed";
    return {
      observation_id: item.observation_id,
      dimension: item.dimension,
      statement_kind: item.statement_kind,
      label: item.label,
      evidence: { ...item.evidence, ref: knowledgeRef(item.evidence.note_id, item.evidence.revision) },
      ref_state: state,
      source_class: source ? sourceClass(source, record.domain_claim) : null,
      trust: source ? source.trust.level : null,
      conflict,
      cell,
      verified: cell === "observed",
      price: item.price ? { ...item.price, caveats: priceCaveats(item.price) } : null
    };
  });
}
function domainState(record, evidence) {
  if (!record.domain_claim) return "not_claimed";
  if (!record.domain_evidence) return "unverified";
  const { state, item } = refState(evidence, record.domain_evidence);
  if (state !== "current" && state !== "stale" || !item) return "needs_review";
  const hosts = [hostOf(item.source.url), hostOf(item.source.final_url)];
  return hosts.every((host) => hostMatchesDomain(host, record.domain_claim)) ? "verified" : "needs_review";
}
var CELL_RANK = ["conflicting", "observed", "hypothesis", "unverified", "historical", "needs_review"];
function cellOf(views) {
  if (!views.length) return "unknown";
  for (const state of CELL_RANK) if (views.some((view) => view.cell === state)) return state;
  return "unknown";
}
function assessmentOf(record, views) {
  if (record.status === "archived" || record.status === "disputed") return record.status;
  if (views.some((view) => view.cell === "needs_review" || view.cell === "historical")) return "needs_refresh";
  if (record.status === "owner_reviewed") return "owner_reviewed";
  return views.length ? "researched" : "candidate";
}
function priceComparison(rows) {
  const current = rows.filter((row) => row.cell === "observed" || row.cell === "unverified");
  if (rows.length === 0) return { comparison: "none", reasons: [] };
  if (rows.length === 1) return { comparison: "single", reasons: [] };
  const reasons = /* @__PURE__ */ new Set();
  if (current.length < rows.length) reasons.add("some_prices_not_current");
  const distinct = (pick) => new Set(rows.map(pick)).size > 1;
  if (distinct((row) => row.currency)) reasons.add("different_currencies");
  if (distinct((row) => row.market)) reasons.add("different_markets");
  if (distinct((row) => row.billing_period)) reasons.add("different_billing_periods");
  if (distinct((row) => row.billing_commitment)) reasons.add("different_commitments");
  for (const row of rows) for (const caveat of row.caveats) reasons.add(caveat);
  return reasons.size ? { comparison: "not_comparable", reasons: [...reasons].sort() } : { comparison: "terms_match", reasons: [] };
}
function buildLandscape(ws, opts) {
  const now = opts.now ?? ws.now();
  const lang = opts.lang ?? "en";
  const t = (code, vars = {}) => fill(GAP_TEXT[code][lang], vars);
  const dim = (d) => DIMENSION_LABELS[d][lang];
  const scan = scanCandidates(ws);
  const evidence = loadEvidence(ws, { now });
  const scope = readScope(ws);
  const purposes = scope?.purposes ?? [];
  const dimensions = purposes.length ? DIMENSIONS.filter((d) => purposes.some((p) => PURPOSE_DIMENSIONS[p].includes(d))) : [...DIMENSIONS];
  const fact = readFacts(ws.root, "approved", ws.brandSlug)[TARGET_MARKET_FACT];
  const targetApproved = Boolean(fact && fact.status === "approved" && fact.revision_hash);
  const gaps = [];
  const gap = (code, vars = {}, competitor = null, dimension = null) => gaps.push({ code, competitor_id: competitor, dimension, text: t(code, vars) });
  if (opts.capability.state !== "available") gap("research_unavailable", { reason: opts.capability.reason ?? "unavailable" });
  if (!scope) gap("scope_not_set");
  if (!targetApproved) gap("target_market_unapproved");
  if (purposes.includes("seo")) gap("seo_needs_search_evidence");
  const candidates = [];
  const matrix = [];
  const priceRows = [];
  const active = scan.records.filter((record) => record.status !== "archived");
  if (!active.length) gap("no_candidates");
  for (const record of scan.records) {
    const views = viewObservations(record, evidence);
    const domain = domainState(record, evidence);
    const needs = [];
    const vars = { name: record.display_name };
    const isActive = record.status !== "archived";
    if (isActive && !record.relationship.length) {
      gap("relationship_unknown", vars, record.competitor_id);
      needs.push(t("relationship_unknown", vars));
    }
    if (isActive && domain !== "verified") {
      gap("identity_unverified", vars, record.competitor_id);
      needs.push(t("identity_unverified", vars));
    }
    if (isActive && record.distinct_from.length) needs.push(t("same_name_other_market", vars));
    for (const view of views) {
      if (!isActive) break;
      if (view.cell === "needs_review" || view.cell === "historical") {
        const text = t("evidence_needs_review", { ...vars, dimension: dim(view.dimension), note: view.evidence.note_id, reason: REVIEW_REASONS[view.ref_state][lang] });
        gaps.push({ code: "evidence_needs_review", competitor_id: record.competitor_id, dimension: view.dimension, text });
        needs.push(text);
      }
    }
    for (const d of DIMENSIONS) {
      const inDim = views.filter((view) => view.dimension === d);
      const state2 = cellOf(inDim);
      matrix.push({ competitor_id: record.competitor_id, dimension: d, state: state2, observation_ids: inDim.map((view) => view.observation_id) });
      if (!isActive) continue;
      if (state2 === "conflicting") {
        const text = t("evidence_conflicting", { ...vars, dimension: dim(d) });
        gaps.push({ code: "evidence_conflicting", competitor_id: record.competitor_id, dimension: d, text });
        needs.push(text);
      }
      if (state2 === "unknown" && dimensions.includes(d)) gap("dimension_unknown", { ...vars, dimension: dim(d) }, record.competitor_id, d);
    }
    if (isActive) {
      for (const view of views) {
        if (!view.price) continue;
        const { caveats, ...price } = view.price;
        priceRows.push({
          competitor_id: record.competitor_id,
          observation_id: view.observation_id,
          offer_name: price.offer_name,
          amount: price.amount,
          currency: price.currency,
          market: price.market,
          billing_period: price.billing_period,
          billing_commitment: price.billing_commitment,
          tax_inclusion: price.tax_inclusion,
          promotion: price.promotion,
          observed_at: view.evidence.observed_at,
          cell: view.cell,
          caveats: view.cell === "historical" ? [...caveats, "historical"] : caveats
        });
      }
    }
    candidates.push({
      competitor_id: record.competitor_id,
      display_name: record.display_name,
      relationship: record.relationship,
      geographic_relevance: record.geographic_relevance,
      markets: record.markets,
      source: record.source,
      status: record.status,
      status_reason: record.status_reason,
      assessment: assessmentOf(record, views),
      official_domain: domain === "verified" ? record.domain_claim : null,
      domain_state: domain,
      observations: views,
      needs_review: needs
    });
  }
  const prices = priceComparison(priceRows);
  if (prices.comparison === "not_comparable") gap("prices_not_comparable", { reason: prices.reasons.join(", ") });
  const usable2 = candidates.filter((c) => c.status !== "archived").flatMap((c) => c.observations).filter((v) => v.cell === "observed" || v.cell === "unverified" || v.cell === "hypothesis");
  const unknownInScope = gaps.some((g) => g.code === "dimension_unknown");
  const state = !active.length ? "no_candidates" : !usable2.length ? "candidate_only" : unknownInScope ? "evidence_insufficient" : "evidence_available";
  return {
    schema: LANDSCAPE_SCHEMA,
    brand_slug: ws.brandSlug,
    generated_at: now.toISOString(),
    lang,
    research: { adapter: opts.capability.adapter, state: opts.capability.state, mode: opts.capability.mode, reason: opts.capability.reason },
    scope: { purposes, dimensions, set: Boolean(scope) },
    target_market: { fact_id: TARGET_MARKET_FACT, state: targetApproved ? "approved" : "missing", revision: targetApproved ? fact.revision_hash : null },
    state,
    candidates,
    matrix,
    prices: { rows: priceRows, comparison: prices.comparison, reasons: prices.reasons, ranked: false, currency_conversion: "none" },
    gaps,
    prohibited_inferences: Object.entries(PROHIBITED_TEXT).map(([code, text]) => ({ code, text: text[lang] })),
    skipped_files: scan.skipped.length,
    authorizes: []
  };
}

// packages/brand-core/src/competitive/context.ts
var CONTEXT_SCHEMA = "brand-os.competitive-context/1";
var USABLE_CELLS = ["observed", "unverified", "hypothesis"];
var PURPOSE_PROHIBITED = {
  identity: ["legal_clearance", "brand_decision"],
  positioning: ["ad_performance", "brand_decision"],
  marketing: ["ad_performance", "private_commercials", "brand_decision"],
  pricing: ["private_commercials", "currency_conversion", "price_coordination", "brand_decision"],
  seo: ["search_rankings", "ad_performance", "brand_decision"],
  expansion: ["private_commercials", "brand_decision"]
};
var STEP_OF = {
  dimension_unknown: "record_source",
  evidence_needs_review: "refresh_source",
  evidence_conflicting: "resolve_conflict",
  identity_unverified: "verify_domain",
  relationship_unknown: "classify",
  research_unavailable: "enable_research",
  target_market_unapproved: "approve_target_market",
  no_candidates: "add_candidates",
  seo_needs_search_evidence: "search_evidence"
};
var RECOMPUTED = /* @__PURE__ */ new Set(["dimension_unknown", "prices_not_comparable", "scope_not_set", "seo_needs_search_evidence", "no_candidates"]);
function marketMatch(markets, market) {
  if (!market) return "unfiltered";
  if (!markets.length) return "unknown";
  if (markets.includes(market)) return "listed";
  if (markets.includes("GLOBAL")) return "global";
  return null;
}
function getCompetitiveContext(ws, purpose, opts) {
  const chosen = oneOf(purpose, PURPOSES, "purpose");
  let market = null;
  if (opts.market) {
    const markets = validateMarkets(opts.market);
    if (markets.length !== 1) throw new CompetitiveError("invalid_input", "Give one market (TR, US\u2026) or GLOBAL.");
    market = markets[0];
  }
  const view = buildLandscape(ws, opts);
  const lang = view.lang;
  const dimensions = PURPOSE_DIMENSIONS[chosen];
  const t = (code, vars = {}) => fill(GAP_TEXT[code][lang], vars);
  const competitors = [];
  const observations = [];
  let excluded = 0;
  for (const c of view.candidates) {
    const match = c.status === "archived" ? null : marketMatch(c.markets, market);
    if (!match) {
      excluded += 1;
      continue;
    }
    const mine = c.observations.filter((o) => dimensions.includes(o.dimension) && (!market || !o.price || o.price.market === market));
    competitors.push({
      competitor_id: c.competitor_id,
      display_name: c.display_name,
      relationship: c.relationship,
      geographic_relevance: c.geographic_relevance,
      markets: c.markets,
      source: c.source,
      assessment: c.assessment,
      official_domain: c.official_domain,
      domain_state: c.domain_state,
      market_match: match,
      observation_ids: mine.map((o) => o.observation_id)
    });
    for (const o of mine) {
      observations.push({
        competitor_id: c.competitor_id,
        competitor_name: c.display_name,
        observation_id: o.observation_id,
        dimension: o.dimension,
        statement_kind: o.statement_kind,
        label: o.label,
        ref: o.evidence.ref,
        note_id: o.evidence.note_id,
        revision: o.evidence.revision,
        claim_key: o.evidence.claim_key,
        observed_at: o.evidence.observed_at,
        ref_state: o.ref_state,
        source_class: o.source_class,
        trust: o.trust,
        cell: o.cell,
        verified: o.verified,
        conflict: o.conflict,
        usable: USABLE_CELLS.includes(o.cell),
        price: o.price
      });
    }
  }
  const included = new Set(competitors.map((c) => c.competitor_id));
  const gaps = view.gaps.filter((g) => !RECOMPUTED.has(g.code) && (!g.competitor_id || included.has(g.competitor_id)) && (!g.dimension || dimensions.includes(g.dimension)));
  if (!competitors.length) gaps.push({ code: "no_candidates", competitor_id: null, dimension: null, text: t("no_candidates") });
  if (chosen === "seo") gaps.push({ code: "seo_needs_search_evidence", competitor_id: null, dimension: null, text: t("seo_needs_search_evidence") });
  const conflicts = [];
  for (const c of competitors) {
    for (const d of dimensions) {
      const cell = view.matrix.find((m) => m.competitor_id === c.competitor_id && m.dimension === d);
      const inDim = observations.filter((o) => o.competitor_id === c.competitor_id && o.dimension === d);
      if (!inDim.length) gaps.push({ code: "dimension_unknown", competitor_id: c.competitor_id, dimension: d, text: t("dimension_unknown", { name: c.display_name, dimension: DIMENSION_LABELS[d][lang] }) });
      if (cell?.state === "conflicting") conflicts.push({ competitor_id: c.competitor_id, dimension: d, observation_ids: inDim.filter((o) => o.conflict).map((o) => o.observation_id) });
    }
  }
  let prices = null;
  if (dimensions.includes("public_price")) {
    const rows = view.prices.rows.filter((row) => included.has(row.competitor_id) && (!market || row.market === market));
    const comparison = priceComparison(rows);
    prices = { rows, comparison: comparison.comparison, reasons: comparison.reasons, ranked: false, currency_conversion: "none" };
    if (comparison.comparison === "not_comparable") gaps.push({ code: "prices_not_comparable", competitor_id: null, dimension: "public_price", text: t("prices_not_comparable", { reason: comparison.reasons.join(", ") }) });
  }
  const usable2 = observations.filter((o) => o.usable);
  const state = !competitors.length ? "missing" : !usable2.length ? "candidate_only" : gaps.some((g) => g.code === "dimension_unknown") ? "evidence_insufficient" : "evidence_available";
  const dates = observations.map((o) => o.observed_at).sort();
  const source_refs = [...new Set(observations.map((o) => o.ref))].sort();
  const source_digest = sha256Hex(
    canonicalJson({
      purpose: chosen,
      market,
      target: view.target_market.revision,
      refs: observations.map((o) => [o.observation_id, o.ref, o.claim_key, o.ref_state, o.cell]).sort()
    })
  );
  return {
    schema: CONTEXT_SCHEMA,
    brand_slug: view.brand_slug,
    generated_at: view.generated_at,
    lang,
    purpose: chosen,
    dimensions,
    market,
    research: view.research,
    target_market: view.target_market,
    state,
    competitors,
    observations,
    conflicts,
    freshness: {
      usable: usable2.length,
      historical: observations.filter((o) => o.cell === "historical").length,
      needs_review: observations.filter((o) => o.cell === "needs_review").length,
      conflicting: observations.filter((o) => o.cell === "conflicting").length,
      oldest_observed_at: dates[0] ?? null,
      newest_observed_at: dates[dates.length - 1] ?? null
    },
    prices,
    gaps,
    next_research: gaps.filter((g) => STEP_OF[g.code]).map((g) => ({ code: STEP_OF[g.code], competitor_id: g.competitor_id, dimension: g.dimension, text: g.text })),
    source_refs,
    source_digest,
    prohibited_inferences: PURPOSE_PROHIBITED[chosen].map((code) => ({ code, text: PROHIBITED_TEXT[code][lang] })),
    excluded_candidates: excluded,
    authorizes: []
  };
}

// packages/brand-core/src/competitive/seo-bridge.ts
function seoNamedCompetitors(ws) {
  const value = answersOf(readInterview(ws))["seo.competitors.named"];
  if (!value || value === UNKNOWN) return [];
  return Array.isArray(value) ? value : [value];
}
function importSeoNames(ws, opts = {}) {
  assertOwnerProcess();
  const names = seoNamedCompetitors(ws);
  if (!names.length) return { results: [], interview: "not_answered" };
  const results = [];
  const seen = /* @__PURE__ */ new Map();
  for (const record of scanCandidates(ws).records) if (!seen.has(record.name_key)) seen.set(record.name_key, record.competitor_id);
  for (const name of names) {
    const key = nameKey(name);
    if (seen.has(key)) {
      results.push({ name, outcome: "exists", competitor_id: seen.get(key) ?? null, reason: null });
      continue;
    }
    if (opts.dryRun) {
      seen.set(key, null);
      results.push({ name, outcome: "would_add", competitor_id: null, reason: null });
      continue;
    }
    try {
      const record = addCandidate(ws, { display_name: name, source: "seo_interview" });
      seen.set(key, record.competitor_id);
      results.push({ name, outcome: "added", competitor_id: record.competitor_id, reason: null });
    } catch (error) {
      if (!(error instanceof CompetitiveError)) throw error;
      results.push({ name, outcome: "refused", competitor_id: null, reason: `${error.code}: ${error.message}` });
    }
  }
  return { results, interview: "read" };
}

// packages/brand-core/src/competitive/memos.ts
import fs2 from "node:fs";
import path2 from "node:path";

// packages/brand-core/src/competitive/memo-i18n.ts
var MEMO_TITLES = {
  marketing_opportunity_memo: { en: "Marketing opportunity assessment (draft)", fa: "\u0627\u0631\u0632\u06CC\u0627\u0628\u06CC \u0641\u0631\u0635\u062A\u200C\u0647\u0627\u06CC \u0628\u0627\u0632\u0627\u0631\u06CC\u0627\u0628\u06CC (\u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633)", tr: "Pazarlama f\u0131rsat\u0131 de\u011Ferlendirmesi (taslak)" },
  pricing_benchmark_memo: { en: "Pricing benchmark and options (draft)", fa: "\u0645\u0642\u0627\u06CC\u0633\u0647\u0654 \u0642\u06CC\u0645\u062A \u0648 \u06AF\u0632\u06CC\u0646\u0647\u200C\u0647\u0627\u06CC \u0642\u06CC\u0645\u062A\u200C\u06AF\u0630\u0627\u0631\u06CC (\u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633)", tr: "Fiyat kar\u015F\u0131la\u015Ft\u0131rmas\u0131 ve se\xE7enekler (taslak)" },
  seo_competitor_supplement: { en: "SEO competitor supplement, cited (draft)", fa: "\u067E\u06CC\u0648\u0633\u062A \u0631\u0642\u0628\u0627 \u0628\u0631\u0627\u06CC \u0633\u0626\u0648\u060C \u0628\u0627 \u0627\u0633\u062A\u0646\u0627\u062F (\u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633)", tr: "SEO rakip eki, kaynakl\u0131 (taslak)" },
  visual_landscape_assessment: { en: "Visual landscape assessment (draft)", fa: "\u0627\u0631\u0632\u06CC\u0627\u0628\u06CC \u0686\u0634\u0645\u200C\u0627\u0646\u062F\u0627\u0632 \u0628\u0635\u0631\u06CC (\u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633)", tr: "G\xF6rsel g\xF6r\xFCn\xFCm de\u011Ferlendirmesi (taslak)" }
};
var MEMO_HEADINGS = {
  preamble: {
    en: "Draft for the owner. It changes no brand fact, price, plan or asset and authorizes nothing. Context: {state}.",
    fa: "\u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633 \u0628\u0631\u0627\u06CC \u0645\u0627\u0644\u06A9. \u0647\u06CC\u0686 \u0648\u0627\u0642\u0639\u06CC\u062A \u0628\u0631\u0646\u062F\u060C \u0642\u06CC\u0645\u062A\u060C \u0628\u0631\u0646\u0627\u0645\u0647 \u06CC\u0627 \u062F\u0627\u0631\u0627\u06CC\u06CC \u0631\u0627 \u062A\u063A\u06CC\u06CC\u0631 \u0646\u0645\u06CC\u200C\u062F\u0647\u062F \u0648 \u0645\u062C\u0648\u0632 \u0647\u06CC\u0686 \u06A9\u0627\u0631\u06CC \u0646\u06CC\u0633\u062A. \u0648\u0636\u0639\u06CC\u062A \u0632\u0645\u06CC\u0646\u0647: {state}.",
    tr: "Sahibi i\xE7in taslak. Hi\xE7bir marka bilgisini, fiyat\u0131, plan\u0131 veya varl\u0131\u011F\u0131 de\u011Fi\u015Ftirmez ve hi\xE7bir \u015Feye yetki vermez. Ba\u011Flam: {state}."
  },
  owner_inputs: { en: "Owner decisions this draft is read against (cited by id and revision):", fa: "\u062A\u0635\u0645\u06CC\u0645\u200C\u0647\u0627\u06CC \u0645\u0627\u0644\u06A9 \u06A9\u0647 \u0627\u06CC\u0646 \u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633 \u0628\u0627 \u0622\u0646\u200C\u0647\u0627 \u0633\u0646\u062C\u06CC\u062F\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F (\u0628\u0627 \u0634\u0646\u0627\u0633\u0647 \u0648 \u0646\u0633\u062E\u0647):", tr: "Bu tasla\u011F\u0131n dayand\u0131\u011F\u0131 sahip kararlar\u0131 (kimlik ve s\xFCr\xFCmle):" },
  observations: { en: "Cited observations:", fa: "\u0645\u0634\u0627\u0647\u062F\u0647\u200C\u0647\u0627\u06CC \u0645\u0633\u062A\u0646\u062F:", tr: "Kaynakl\u0131 g\xF6zlemler:" },
  unresolved: { en: "Unresolved (conflicting, stale or changed; not used as current):", fa: "\u062D\u0644\u200C\u0646\u0634\u062F\u0647 (\u0645\u062A\u0646\u0627\u0642\u0636\u060C \u0642\u062F\u06CC\u0645\u06CC \u06CC\u0627 \u062A\u063A\u06CC\u06CC\u0631\u06A9\u0631\u062F\u0647\u061B \u0628\u0647\u200C\u0639\u0646\u0648\u0627\u0646 \u062F\u0627\u062F\u0647\u0654 \u0641\u0639\u0644\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F):", tr: "\xC7\xF6z\xFClmemi\u015F (\xE7eli\u015Fkili, eski veya de\u011Fi\u015Fmi\u015F; g\xFCncel say\u0131lmaz):" },
  alternatives: { en: "Alternatives (hypotheses for the owner to weigh):", fa: "\u06AF\u0632\u06CC\u0646\u0647\u200C\u0647\u0627 (\u0641\u0631\u0636\u06CC\u0647\u200C\u0647\u0627\u06CC\u06CC \u0628\u0631\u0627\u06CC \u0633\u0646\u062C\u0634 \u0645\u0627\u0644\u06A9):", tr: "Se\xE7enekler (sahibinin tartaca\u011F\u0131 hipotezler):" },
  price_table: { en: "Public prices (as advertised; listed, not ranked; no currency conversion): {state}{reason}", fa: "\u0642\u06CC\u0645\u062A\u200C\u0647\u0627\u06CC \u0639\u0645\u0648\u0645\u06CC (\u0647\u0645\u0627\u0646\u200C\u0637\u0648\u0631 \u06A9\u0647 \u0627\u0639\u0644\u0627\u0645 \u0634\u062F\u0647\u061B \u0641\u0647\u0631\u0633\u062A\u200C\u0634\u062F\u0647\u060C \u0628\u062F\u0648\u0646 \u0631\u062A\u0628\u0647\u200C\u0628\u0646\u062F\u06CC\u061B \u0628\u062F\u0648\u0646 \u062A\u0628\u062F\u06CC\u0644 \u0627\u0631\u0632): {state}{reason}", tr: "A\xE7\u0131k fiyatlar (ilan edildi\u011Fi gibi; listelenir, s\u0131ralanmaz; d\xF6viz \xE7evirisi yok): {state}{reason}" },
  warnings: { en: "Warnings:", fa: "\u0647\u0634\u062F\u0627\u0631\u0647\u0627:", tr: "Uyar\u0131lar:" },
  owner_named: { en: "Names from the SEO interview (owner assumptions, not search evidence):", fa: "\u0646\u0627\u0645\u200C\u0647\u0627 \u0627\u0632 \u0645\u0635\u0627\u062D\u0628\u0647\u0654 \u0633\u0626\u0648 (\u0641\u0631\u0636\u200C\u0647\u0627\u06CC \u0645\u0627\u0644\u06A9\u060C \u0646\u0647 \u0634\u0648\u0627\u0647\u062F \u062C\u0633\u062A\u200C\u0648\u062C\u0648):", tr: "SEO g\xF6r\xFC\u015Fmesinden adlar (sahibin varsay\u0131mlar\u0131, arama kan\u0131t\u0131 de\u011Fil):" },
  search_evidence: { en: "Search evidence: rankings {rankings}; keyword gaps {gaps}.", fa: "\u0634\u0648\u0627\u0647\u062F \u062C\u0633\u062A\u200C\u0648\u062C\u0648: \u0631\u062A\u0628\u0647\u200C\u0647\u0627 {rankings}\u061B \u0634\u06A9\u0627\u0641\u200C\u0647\u0627\u06CC \u06A9\u0644\u06CC\u062F\u0648\u0627\u0698\u0647 {gaps}.", tr: "Arama kan\u0131t\u0131: s\u0131ralamalar {rankings}; anahtar kelime bo\u015Fluklar\u0131 {gaps}." },
  visual: { en: "Visual comparison: {state}.", fa: "\u0645\u0642\u0627\u06CC\u0633\u0647\u0654 \u0628\u0635\u0631\u06CC: {state}.", tr: "G\xF6rsel kar\u015F\u0131la\u015Ft\u0131rma: {state}." },
  intake: { en: "Identity intake hint (unapproved): logo {logo}, intent {intent}.", fa: "\u0627\u0634\u0627\u0631\u0647\u0654 \u0648\u0631\u0648\u062F\u06CC \u0647\u0648\u06CC\u062A (\u062A\u0623\u06CC\u06CC\u062F\u0646\u0634\u062F\u0647): \u0644\u0648\u06AF\u0648 {logo}\u060C \u0642\u0635\u062F {intent}.", tr: "Kimlik giri\u015Fi ipucu (onays\u0131z): logo {logo}, niyet {intent}." },
  not_known: { en: "Not known (never inferred here):", fa: "\u0646\u0627\u0645\u0639\u0644\u0648\u0645 (\u0627\u06CC\u0646\u062C\u0627 \u0647\u0631\u06AF\u0632 \u0627\u0633\u062A\u0646\u0628\u0627\u0637 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F):", tr: "Bilinmiyor (burada asla \xE7\u0131kar\u0131lmaz):" },
  proposed_edits: { en: "If the owner wants a change:", fa: "\u0627\u06AF\u0631 \u0645\u0627\u0644\u06A9 \u062A\u063A\u06CC\u06CC\u0631\u06CC \u0628\u062E\u0648\u0627\u0647\u062F:", tr: "Sahibi bir de\u011Fi\u015Fiklik isterse:" },
  next_research: { en: "Next research:", fa: "\u067E\u0698\u0648\u0647\u0634 \u0628\u0639\u062F\u06CC:", tr: "Sonraki ara\u015Ft\u0131rma:" },
  never: { en: "Never inferred:", fa: "\u0647\u0631\u06AF\u0632 \u0627\u0633\u062A\u0646\u0628\u0627\u0637 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F:", tr: "Asla \xE7\u0131kar\u0131lmaz:" },
  sources: { en: "Sources (Knowledge research notes):", fa: "\u0645\u0646\u0627\u0628\u0639 (\u06CC\u0627\u062F\u062F\u0627\u0634\u062A\u200C\u0647\u0627\u06CC \u067E\u0698\u0648\u0647\u0634\u06CC \u062F\u0627\u0646\u0634):", tr: "Kaynaklar (Bilgi ara\u015Ft\u0131rma notlar\u0131):" },
  trade_off: { en: "trade-off", fa: "\u0628\u062F\u0647\u200C\u0628\u0633\u062A\u0627\u0646", tr: "\xF6d\xFCnle\u015Fim" },
  depends_on: { en: "depends on", fa: "\u0648\u0627\u0628\u0633\u062A\u0647 \u0628\u0647", tr: "ba\u011Fl\u0131 oldu\u011Fu" },
  approved: { en: "approved", fa: "\u062A\u0623\u06CC\u06CC\u062F\u0634\u062F\u0647", tr: "onayl\u0131" },
  missing: { en: "not approved yet", fa: "\u0647\u0646\u0648\u0632 \u062A\u0623\u06CC\u06CC\u062F \u0646\u0634\u062F\u0647", tr: "hen\xFCz onaylanmad\u0131" }
};
var NOT_KNOWN = {
  ad_spend: { en: "Competitors\u2019 ad spend and budgets.", fa: "\u0647\u0632\u06CC\u0646\u0647 \u0648 \u0628\u0648\u062F\u062C\u0647\u0654 \u062A\u0628\u0644\u06CC\u063A\u0627\u062A \u0631\u0642\u0628\u0627.", tr: "Rakiplerin reklam harcamas\u0131 ve b\xFCt\xE7eleri." },
  conversion: { en: "Conversion rates, ROAS and CPA.", fa: "\u0646\u0631\u062E \u062A\u0628\u062F\u06CC\u0644\u060C ROAS \u0648 CPA.", tr: "D\xF6n\xFC\u015F\xFCm oranlar\u0131, ROAS ve CPA." },
  revenue: { en: "Revenue, market share and traffic.", fa: "\u062F\u0631\u0622\u0645\u062F\u060C \u0633\u0647\u0645 \u0628\u0627\u0632\u0627\u0631 \u0648 \u062A\u0631\u0627\u0641\u06CC\u06A9.", tr: "Gelir, pazar pay\u0131 ve trafik." },
  targeting: { en: "Who their ads actually target.", fa: "\u0627\u06CC\u0646\u06A9\u0647 \u062A\u0628\u0644\u06CC\u063A\u0627\u062A\u0634\u0627\u0646 \u0648\u0627\u0642\u0639\u0627\u064B \u0686\u0647 \u06A9\u0633\u0627\u0646\u06CC \u0631\u0627 \u0647\u062F\u0641 \u0645\u06CC\u200C\u06AF\u06CC\u0631\u062F.", tr: "Reklamlar\u0131n\u0131n ger\xE7ekte kimi hedefledi\u011Fi." },
  effectiveness: { en: "Whether any observed message or channel actually works.", fa: "\u0627\u06CC\u0646\u06A9\u0647 \u0622\u06CC\u0627 \u067E\u06CC\u0627\u0645 \u06CC\u0627 \u06A9\u0627\u0646\u0627\u0644 \u0645\u0634\u0627\u0647\u062F\u0647\u200C\u0634\u062F\u0647 \u0648\u0627\u0642\u0639\u0627\u064B \u06A9\u0627\u0631 \u0645\u06CC\u200C\u06A9\u0646\u062F.", tr: "G\xF6zlemlenen bir mesaj\u0131n veya kanal\u0131n ger\xE7ekten i\u015Fe yaray\u0131p yaramad\u0131\u011F\u0131." },
  price_paid: { en: "What customers actually pay (private discounts, negotiated deals).", fa: "\u0622\u0646\u0686\u0647 \u0645\u0634\u062A\u0631\u06CC\u0627\u0646 \u0648\u0627\u0642\u0639\u0627\u064B \u0645\u06CC\u200C\u067E\u0631\u062F\u0627\u0632\u0646\u062F (\u062A\u062E\u0641\u06CC\u0641\u200C\u0647\u0627\u06CC \u062E\u0635\u0648\u0635\u06CC\u060C \u0642\u0631\u0627\u0631\u062F\u0627\u062F\u0647\u0627\u06CC \u0645\u0630\u0627\u06A9\u0631\u0647\u200C\u0634\u062F\u0647).", tr: "M\xFC\u015Fterilerin ger\xE7ekte ne \xF6dedi\u011Fi (\xF6zel indirimler, pazarl\u0131kl\u0131 anla\u015Fmalar)." },
  costs: { en: "Competitors\u2019 costs and margins.", fa: "\u0647\u0632\u06CC\u0646\u0647\u200C\u0647\u0627 \u0648 \u062D\u0627\u0634\u06CC\u0647\u0654 \u0633\u0648\u062F \u0631\u0642\u0628\u0627.", tr: "Rakiplerin maliyetleri ve marjlar\u0131." },
  willingness_to_pay: { en: "Our buyers\u2019 willingness to pay (needs customer evidence).", fa: "\u062A\u0645\u0627\u06CC\u0644 \u062E\u0631\u06CC\u062F\u0627\u0631\u0627\u0646 \u0645\u0627 \u0628\u0647 \u067E\u0631\u062F\u0627\u062E\u062A (\u0628\u0647 \u0634\u0648\u0627\u0647\u062F \u0645\u0634\u062A\u0631\u06CC \u0646\u06CC\u0627\u0632 \u062F\u0627\u0631\u062F).", tr: "Al\u0131c\u0131lar\u0131m\u0131z\u0131n \xF6deme iste\u011Fi (m\xFC\u015Fteri kan\u0131t\u0131 gerekir)." },
  fx_tax: { en: "Cross-currency or tax-inclusive comparison (no dated, cited rate and method).", fa: "\u0645\u0642\u0627\u06CC\u0633\u0647\u0654 \u0628\u06CC\u0646 \u0627\u0631\u0632\u0647\u0627 \u06CC\u0627 \u0628\u0627 \u0627\u062D\u062A\u0633\u0627\u0628 \u0645\u0627\u0644\u06CC\u0627\u062A (\u0646\u0631\u062E \u0648 \u0631\u0648\u0634 \u062A\u0627\u0631\u06CC\u062E\u200C\u062F\u0627\u0631 \u0648 \u0645\u0633\u062A\u0646\u062F \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F).", tr: "Para birimleri aras\u0131 veya vergi dahil kar\u015F\u0131la\u015Ft\u0131rma (tarihli, kaynakl\u0131 kur ve y\xF6ntem yok)." },
  rankings: { en: "Search rankings and positions.", fa: "\u0631\u062A\u0628\u0647\u200C\u0647\u0627 \u0648 \u062C\u0627\u06CC\u06AF\u0627\u0647\u200C\u0647\u0627\u06CC \u062C\u0633\u062A\u200C\u0648\u062C\u0648.", tr: "Arama s\u0131ralamalar\u0131 ve konumlar." },
  keyword_gaps: { en: "Keyword gaps and search volume.", fa: "\u0634\u06A9\u0627\u0641\u200C\u0647\u0627\u06CC \u06A9\u0644\u06CC\u062F\u0648\u0627\u0698\u0647 \u0648 \u062D\u062C\u0645 \u062C\u0633\u062A\u200C\u0648\u062C\u0648.", tr: "Anahtar kelime bo\u015Fluklar\u0131 ve arama hacmi." },
  ai_visibility: { en: "Visibility in AI answers (GEO); nothing is guaranteed.", fa: "\u062F\u06CC\u062F\u0647\u200C\u0634\u062F\u0646 \u062F\u0631 \u067E\u0627\u0633\u062E\u200C\u0647\u0627\u06CC \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC (GEO)\u061B \u0647\u06CC\u0686 \u0686\u06CC\u0632 \u062A\u0636\u0645\u06CC\u0646\u200C\u0634\u062F\u0647 \u0646\u06CC\u0633\u062A.", tr: "Yapay zek\xE2 yan\u0131tlar\u0131ndaki g\xF6r\xFCn\xFCrl\xFCk (GEO); hi\xE7bir \u015Fey garanti de\u011Fildir." },
  legal_clearance: { en: "Trademark clearance and legal originality (needs qualified review).", fa: "\u062B\u0628\u062A \u0639\u0644\u0627\u0645\u062A \u062A\u062C\u0627\u0631\u06CC \u0648 \u0627\u0635\u0627\u0644\u062A \u062D\u0642\u0648\u0642\u06CC (\u0628\u0647 \u0628\u0631\u0631\u0633\u06CC \u06A9\u0627\u0631\u0634\u0646\u0627\u0633 \u0648\u0627\u062C\u062F \u0634\u0631\u0627\u06CC\u0637 \u0646\u06CC\u0627\u0632 \u062F\u0627\u0631\u062F).", tr: "Marka tescili ve hukuki \xF6zg\xFCnl\xFCk (yetkin bir incelemeye ihtiya\xE7 var)." },
  recognition: { en: "Measured recognition of the current identity (owner-reported unless a study is supplied).", fa: "\u0645\u06CC\u0632\u0627\u0646 \u0634\u0646\u0627\u062E\u062A\u0647\u200C\u0634\u062F\u0646 \u0633\u0646\u062C\u06CC\u062F\u0647\u200C\u0634\u062F\u0647\u0654 \u0647\u0648\u06CC\u062A \u0641\u0639\u0644\u06CC (\u06AF\u0632\u0627\u0631\u0634 \u0645\u0627\u0644\u06A9\u060C \u0645\u06AF\u0631 \u0627\u06CC\u0646\u06A9\u0647 \u0645\u0637\u0627\u0644\u0639\u0647\u200C\u0627\u06CC \u0627\u0631\u0627\u0626\u0647 \u0634\u0648\u062F).", tr: "Mevcut kimli\u011Fin \xF6l\xE7\xFClm\xFC\u015F tan\u0131n\u0131rl\u0131\u011F\u0131 (bir \xE7al\u0131\u015Fma sunulmad\u0131k\xE7a sahibin beyan\u0131)." },
  artwork: { en: "Any competitor artwork, palette or motif not cited in a source.", fa: "\u0647\u0631 \u0627\u062B\u0631 \u0647\u0646\u0631\u06CC\u060C \u067E\u0627\u0644\u062A \u06CC\u0627 \u0646\u0642\u0634\u200C\u0645\u0627\u06CC\u0647\u0654 \u0631\u0642\u06CC\u0628 \u06A9\u0647 \u062F\u0631 \u0645\u0646\u0628\u0639\u06CC \u0645\u0633\u062A\u0646\u062F \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.", tr: "Bir kaynakta al\u0131nt\u0131lanmam\u0131\u015F rakip g\xF6rseli, paleti veya motifi." },
  aesthetics: { en: "Which design is more beautiful; this is not graded.", fa: "\u0627\u06CC\u0646\u06A9\u0647 \u06A9\u062F\u0627\u0645 \u0637\u0631\u0627\u062D\u06CC \u0632\u06CC\u0628\u0627\u062A\u0631 \u0627\u0633\u062A\u061B \u0627\u06CC\u0646 \u0627\u0645\u062A\u06CC\u0627\u0632\u062F\u0647\u06CC \u0646\u0645\u06CC\u200C\u0634\u0648\u062F.", tr: "Hangi tasar\u0131m\u0131n daha g\xFCzel oldu\u011Fu; bu puanlanmaz." }
};
var ALTERNATIVES = {
  differentiate: {
    title: { en: "Lead with a message the cited competitors do not claim", fa: "\u0628\u0627 \u067E\u06CC\u0627\u0645\u06CC \u067E\u06CC\u0634 \u0628\u0631\u0648\u06CC\u062F \u06A9\u0647 \u0631\u0642\u0628\u0627\u06CC \u0645\u0633\u062A\u0646\u062F\u0634\u062F\u0647 \u0627\u062F\u0639\u0627 \u0646\u0645\u06CC\u200C\u06A9\u0646\u0646\u062F", tr: "Kaynakl\u0131 rakiplerin iddia etmedi\u011Fi bir mesajla \xF6ne \xE7\u0131k\u0131n" },
    trade_off: { en: "Distinct, but the message is untested and needs proof; it may address a smaller need.", fa: "\u0645\u062A\u0645\u0627\u06CC\u0632 \u0627\u0633\u062A\u060C \u0627\u0645\u0627 \u067E\u06CC\u0627\u0645 \u0622\u0632\u0645\u0648\u062F\u0647 \u0646\u0634\u062F\u0647 \u0648 \u0628\u0647 \u0627\u062B\u0628\u0627\u062A \u0646\u06CC\u0627\u0632 \u062F\u0627\u0631\u062F\u061B \u0634\u0627\u06CC\u062F \u0646\u06CC\u0627\u0632 \u06A9\u0648\u0686\u06A9\u200C\u062A\u0631\u06CC \u0631\u0627 \u067E\u0648\u0634\u0634 \u062F\u0647\u062F.", tr: "Farkl\u0131d\u0131r ama mesaj denenmemi\u015Ftir ve kan\u0131t ister; daha k\xFC\xE7\xFCk bir ihtiyaca hitap edebilir." }
  },
  match_with_proof: {
    title: { en: "Answer the buyer question the cited competitors answer, with proof", fa: "\u0628\u0647 \u0647\u0645\u0627\u0646 \u067E\u0631\u0633\u0634 \u062E\u0631\u06CC\u062F\u0627\u0631 \u06A9\u0647 \u0631\u0642\u0628\u0627\u06CC \u0645\u0633\u062A\u0646\u062F\u0634\u062F\u0647 \u067E\u0627\u0633\u062E \u0645\u06CC\u200C\u062F\u0647\u0646\u062F\u060C \u0628\u0627 \u0627\u062B\u0628\u0627\u062A \u067E\u0627\u0633\u062E \u062F\u0647\u06CC\u062F", tr: "Kaynakl\u0131 rakiplerin yan\u0131tlad\u0131\u011F\u0131 al\u0131c\u0131 sorusunu kan\u0131tla yan\u0131tlay\u0131n" },
    trade_off: { en: "Meets an expectation buyers already have, but competes head-on where competitors are established.", fa: "\u0627\u0646\u062A\u0638\u0627\u0631\u06CC \u0631\u0627 \u06A9\u0647 \u062E\u0631\u06CC\u062F\u0627\u0631\u0627\u0646 \u0627\u0632 \u0642\u0628\u0644 \u062F\u0627\u0631\u0646\u062F \u0628\u0631\u0622\u0648\u0631\u062F\u0647 \u0645\u06CC\u200C\u06A9\u0646\u062F\u060C \u0627\u0645\u0627 \u062F\u0631 \u062C\u0627\u06CC\u06CC \u06A9\u0647 \u0631\u0642\u0628\u0627 \u062C\u0627\u0627\u0641\u062A\u0627\u062F\u0647\u200C\u0627\u0646\u062F \u0631\u0648\u062F\u0631\u0631\u0648 \u0631\u0642\u0627\u0628\u062A \u0645\u06CC\u200C\u06A9\u0646\u062F.", tr: "Al\u0131c\u0131lar\u0131n zaten sahip oldu\u011Fu bir beklentiyi kar\u015F\u0131lar ama rakiplerin yerle\u015Fik oldu\u011Fu yerde do\u011Frudan rekabet eder." }
  },
  channel_test: {
    title: { en: "Test a channel where no competitor use was observed", fa: "\u06A9\u0627\u0646\u0627\u0644\u06CC \u0631\u0627 \u0628\u06CC\u0627\u0632\u0645\u0627\u06CC\u06CC\u062F \u06A9\u0647 \u0627\u0633\u062A\u0641\u0627\u062F\u0647\u0654 \u0631\u0642\u0628\u0627 \u062F\u0631 \u0622\u0646 \u0645\u0634\u0627\u0647\u062F\u0647 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A", tr: "Rakip kullan\u0131m\u0131 g\xF6zlemlenmeyen bir kanal\u0131 deneyin" },
    trade_off: { en: "Less crowded, but not observing a competitor there is not proof of an opportunity.", fa: "\u0634\u0644\u0648\u063A\u06CC \u06A9\u0645\u062A\u0631\u06CC \u062F\u0627\u0631\u062F\u060C \u0627\u0645\u0627 \u0645\u0634\u0627\u0647\u062F\u0647\u200C\u0646\u06A9\u0631\u062F\u0646 \u0631\u0642\u06CC\u0628 \u062F\u0631 \u0622\u0646\u062C\u0627 \u062F\u0644\u06CC\u0644 \u0648\u062C\u0648\u062F \u0641\u0631\u0635\u062A \u0646\u06CC\u0633\u062A.", tr: "Daha az kalabal\u0131kt\u0131r ama orada rakip g\xF6zlemlememek bir f\u0131rsat\u0131n kan\u0131t\u0131 de\u011Fildir." }
  },
  gather_evidence: {
    title: { en: "Hold changes and close the listed research gaps first", fa: "\u062A\u063A\u06CC\u06CC\u0631\u0627\u062A \u0631\u0627 \u0646\u06AF\u0647 \u062F\u0627\u0631\u06CC\u062F \u0648 \u0627\u0628\u062A\u062F\u0627 \u0634\u06A9\u0627\u0641\u200C\u0647\u0627\u06CC \u067E\u0698\u0648\u0647\u0634\u06CC \u0641\u0647\u0631\u0633\u062A\u200C\u0634\u062F\u0647 \u0631\u0627 \u0628\u0628\u0646\u062F\u06CC\u062F", tr: "De\u011Fi\u015Fiklikleri bekletin ve \xF6nce listelenen ara\u015Ft\u0131rma eksiklerini kapat\u0131n" },
    trade_off: { en: "Slower, but avoids building on unknowns.", fa: "\u06A9\u0646\u062F\u062A\u0631 \u0627\u0633\u062A\u060C \u0627\u0645\u0627 \u0627\u0632 \u0628\u0646\u0627 \u06A9\u0631\u062F\u0646 \u0631\u0648\u06CC \u0646\u0627\u0634\u0646\u0627\u062E\u062A\u0647\u200C\u0647\u0627 \u062C\u0644\u0648\u06AF\u06CC\u0631\u06CC \u0645\u06CC\u200C\u06A9\u0646\u062F.", tr: "Daha yava\u015Ft\u0131r ama bilinmeyenler \xFCzerine kurmaktan ka\xE7\u0131n\u0131r." }
  },
  value_based: {
    title: { en: "Value-based pricing", fa: "\u0642\u06CC\u0645\u062A\u200C\u06AF\u0630\u0627\u0631\u06CC \u0628\u0631 \u067E\u0627\u06CC\u0647\u0654 \u0627\u0631\u0632\u0634", tr: "De\u011Fere dayal\u0131 fiyatland\u0131rma" },
    trade_off: { en: "Ties price to the value buyers get, but needs evidence of that value and of willingness to pay.", fa: "\u0642\u06CC\u0645\u062A \u0631\u0627 \u0628\u0647 \u0627\u0631\u0632\u0634\u06CC \u06A9\u0647 \u062E\u0631\u06CC\u062F\u0627\u0631 \u0645\u06CC\u200C\u06AF\u06CC\u0631\u062F \u067E\u06CC\u0648\u0646\u062F \u0645\u06CC\u200C\u062F\u0647\u062F\u060C \u0627\u0645\u0627 \u0628\u0647 \u0634\u0648\u0627\u0647\u062F \u0622\u0646 \u0627\u0631\u0632\u0634 \u0648 \u062A\u0645\u0627\u06CC\u0644 \u0628\u0647 \u067E\u0631\u062F\u0627\u062E\u062A \u0646\u06CC\u0627\u0632 \u062F\u0627\u0631\u062F.", tr: "Fiyat\u0131 al\u0131c\u0131n\u0131n elde etti\u011Fi de\u011Fere ba\u011Flar ama bu de\u011Ferin ve \xF6deme iste\u011Finin kan\u0131t\u0131n\u0131 ister." }
  },
  tiered: {
    title: { en: "Tiered plans", fa: "\u0637\u0631\u062D\u200C\u0647\u0627\u06CC \u0686\u0646\u062F\u0633\u0637\u062D\u06CC", tr: "Kademeli planlar" },
    trade_off: { en: "Serves different segments, but adds complexity and needs clear feature boundaries.", fa: "\u0628\u062E\u0634\u200C\u0647\u0627\u06CC \u0645\u062E\u062A\u0644\u0641 \u0631\u0627 \u067E\u0648\u0634\u0634 \u0645\u06CC\u200C\u062F\u0647\u062F\u060C \u0627\u0645\u0627 \u067E\u06CC\u0686\u06CC\u062F\u06AF\u06CC \u0645\u06CC\u200C\u0627\u0641\u0632\u0627\u06CC\u062F \u0648 \u0628\u0647 \u0645\u0631\u0632 \u0631\u0648\u0634\u0646 \u0648\u06CC\u0698\u06AF\u06CC\u200C\u0647\u0627 \u0646\u06CC\u0627\u0632 \u062F\u0627\u0631\u062F.", tr: "Farkl\u0131 segmentlere hizmet eder ama karma\u015F\u0131kl\u0131k ekler ve net \xF6zellik s\u0131n\u0131rlar\u0131 ister." }
  },
  premium: {
    title: { en: "Premium position", fa: "\u062C\u0627\u06CC\u06AF\u0627\u0647 \u0645\u0645\u062A\u0627\u0632", tr: "Premium konum" },
    trade_off: { en: "Signals quality and protects margin, but needs proof buyers accept it and shrinks the reachable market.", fa: "\u0646\u0634\u0627\u0646\u0647\u0654 \u06A9\u06CC\u0641\u06CC\u062A \u0627\u0633\u062A \u0648 \u062D\u0627\u0634\u06CC\u0647\u0654 \u0633\u0648\u062F \u0631\u0627 \u062D\u0641\u0638 \u0645\u06CC\u200C\u06A9\u0646\u062F\u060C \u0627\u0645\u0627 \u0628\u0647 \u0627\u062B\u0628\u0627\u062A \u067E\u0630\u06CC\u0631\u0634 \u062E\u0631\u06CC\u062F\u0627\u0631\u0627\u0646 \u0646\u06CC\u0627\u0632 \u062F\u0627\u0631\u062F \u0648 \u0628\u0627\u0632\u0627\u0631 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0631\u0627 \u06A9\u0648\u0686\u06A9 \u0645\u06CC\u200C\u06A9\u0646\u062F.", tr: "Kalite i\u015Fareti verir ve marj\u0131 korur ama al\u0131c\u0131lar\u0131n kabul etti\u011Fine dair kan\u0131t ister ve eri\u015Filebilir pazar\u0131 daralt\u0131r." }
  },
  entry_level: {
    title: { en: "Entry-level offer", fa: "\u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u0633\u0637\u062D \u0648\u0631\u0648\u062F\u06CC", tr: "Giri\u015F seviyesi teklif" },
    trade_off: { en: "Lowers the barrier to try, but depends on costs and an upgrade path; a low price is hard to raise later.", fa: "\u0645\u0627\u0646\u0639 \u0627\u0645\u062A\u062D\u0627\u0646 \u06A9\u0631\u062F\u0646 \u0631\u0627 \u06A9\u0645 \u0645\u06CC\u200C\u06A9\u0646\u062F\u060C \u0627\u0645\u0627 \u0628\u0647 \u0647\u0632\u06CC\u0646\u0647\u200C\u0647\u0627 \u0648 \u0645\u0633\u06CC\u0631 \u0627\u0631\u062A\u0642\u0627 \u0648\u0627\u0628\u0633\u062A\u0647 \u0627\u0633\u062A\u061B \u0642\u06CC\u0645\u062A \u067E\u0627\u06CC\u06CC\u0646 \u0631\u0627 \u0628\u0639\u062F\u0627\u064B \u0633\u062E\u062A \u0645\u06CC\u200C\u0634\u0648\u062F \u0628\u0627\u0644\u0627 \u0628\u0631\u062F.", tr: "Denemenin \xF6n\xFCndeki engeli d\xFC\u015F\xFCr\xFCr ama maliyetlere ve bir y\xFCkseltme yoluna ba\u011Fl\u0131d\u0131r; d\xFC\u015F\xFCk bir fiyat\u0131 sonra y\xFCkseltmek zordur." }
  },
  retain_improve_guidelines: {
    title: { en: "Retain the current identity and improve its usage guidelines", fa: "\u0647\u0648\u06CC\u062A \u0641\u0639\u0644\u06CC \u0631\u0627 \u0646\u06AF\u0647 \u062F\u0627\u0631\u06CC\u062F \u0648 \u0631\u0627\u0647\u0646\u0645\u0627\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647\u0654 \u0622\u0646 \u0631\u0627 \u0628\u0647\u062A\u0631 \u06A9\u0646\u06CC\u062F", tr: "Mevcut kimli\u011Fi koruyun ve kullan\u0131m k\u0131lavuzunu iyile\u015Ftirin" },
    trade_off: { en: "Keeps whatever recognition exists at low cost; right when the audit finds no confusing similarity and the identity serves its uses.", fa: "\u0647\u0631 \u0645\u06CC\u0632\u0627\u0646 \u0634\u0646\u0627\u062E\u062A\u0647\u200C\u0634\u062F\u0646\u06CC \u0631\u0627 \u06A9\u0647 \u0648\u062C\u0648\u062F \u062F\u0627\u0631\u062F \u0628\u0627 \u0647\u0632\u06CC\u0646\u0647\u0654 \u06A9\u0645 \u062D\u0641\u0638 \u0645\u06CC\u200C\u06A9\u0646\u062F\u061B \u0648\u0642\u062A\u06CC \u062F\u0631\u0633\u062A \u0627\u0633\u062A \u06A9\u0647 \u0645\u0645\u06CC\u0632\u06CC \u0634\u0628\u0627\u0647\u062A \u06AF\u0645\u0631\u0627\u0647\u200C\u06A9\u0646\u0646\u062F\u0647\u200C\u0627\u06CC \u0646\u06CC\u0627\u0628\u062F \u0648 \u0647\u0648\u06CC\u062A \u06A9\u0627\u0631\u0628\u0631\u062F\u0647\u0627\u06CC\u0634 \u0631\u0627 \u067E\u0648\u0634\u0634 \u062F\u0647\u062F.", tr: "Var olan tan\u0131n\u0131rl\u0131\u011F\u0131 d\xFC\u015F\xFCk maliyetle korur; denetim kafa kar\u0131\u015Ft\u0131r\u0131c\u0131 bir benzerlik bulmad\u0131\u011F\u0131nda ve kimlik kullan\u0131mlar\u0131na hizmet etti\u011Finde do\u011Frudur." }
  },
  evolve: {
    title: { en: "Evolve: refine the identity and keep its recognizable cues", fa: "\u062A\u06A9\u0627\u0645\u0644: \u0647\u0648\u06CC\u062A \u0631\u0627 \u067E\u0627\u0644\u0627\u06CC\u0634 \u06A9\u0646\u06CC\u062F \u0648 \u0646\u0634\u0627\u0646\u0647\u200C\u0647\u0627\u06CC \u0622\u0634\u0646\u0627\u06CC \u0622\u0646 \u0631\u0627 \u0646\u06AF\u0647 \u062F\u0627\u0631\u06CC\u062F", tr: "Evrim: kimli\u011Fi inceltin ve tan\u0131nan ipu\xE7lar\u0131n\u0131 koruyun" },
    trade_off: { en: "Fixes specific problems with less recognition risk; needs a clear list of what to preserve.", fa: "\u0645\u0634\u06A9\u0644\u0627\u062A \u0645\u0634\u062E\u0635 \u0631\u0627 \u0628\u0627 \u0631\u06CC\u0633\u06A9 \u06A9\u0645\u062A\u0631 \u0628\u0631\u0627\u06CC \u0634\u0646\u0627\u062E\u062A\u0647\u200C\u0634\u062F\u0646 \u0631\u0641\u0639 \u0645\u06CC\u200C\u06A9\u0646\u062F\u061B \u0628\u0647 \u0641\u0647\u0631\u0633\u062A \u0631\u0648\u0634\u0646\u06CC \u0627\u0632 \u0622\u0646\u0686\u0647 \u0628\u0627\u06CC\u062F \u062D\u0641\u0638 \u0634\u0648\u062F \u0646\u06CC\u0627\u0632 \u062F\u0627\u0631\u062F.", tr: "Belirli sorunlar\u0131 daha az tan\u0131n\u0131rl\u0131k riskiyle \xE7\xF6zer; neyin korunaca\u011F\u0131na dair net bir liste ister." }
  },
  rebrand: {
    title: { en: "Broad rebrand", fa: "\u0628\u0627\u0632\u0628\u0631\u0646\u062F\u0633\u0627\u0632\u06CC \u06AF\u0633\u062A\u0631\u062F\u0647", tr: "Kapsaml\u0131 yeniden markalama" },
    trade_off: { en: "Only with a stated reason (new market, repositioning, a failing identity, a legal issue); highest cost and recognition risk.", fa: "\u0641\u0642\u0637 \u0628\u0627 \u062F\u0644\u06CC\u0644\u06CC \u0631\u0648\u0634\u0646 (\u0628\u0627\u0632\u0627\u0631 \u062C\u062F\u06CC\u062F\u060C \u062C\u0627\u06CC\u06AF\u0627\u0647\u200C\u06CC\u0627\u0628\u06CC \u062F\u0648\u0628\u0627\u0631\u0647\u060C \u0647\u0648\u06CC\u062A \u0646\u0627\u06A9\u0627\u0631\u0622\u0645\u062F\u060C \u0645\u0634\u06A9\u0644 \u062D\u0642\u0648\u0642\u06CC)\u061B \u0628\u06CC\u0634\u062A\u0631\u06CC\u0646 \u0647\u0632\u06CC\u0646\u0647 \u0648 \u0631\u06CC\u0633\u06A9 \u0634\u0646\u0627\u062E\u062A\u0647\u200C\u0634\u062F\u0646.", tr: "Yaln\u0131zca belirtilmi\u015F bir nedenle (yeni pazar, yeniden konumland\u0131rma, i\u015Flemeyen kimlik, hukuki sorun); en y\xFCksek maliyet ve tan\u0131n\u0131rl\u0131k riski." }
  },
  create: {
    title: { en: "Create a first identity", fa: "\u0633\u0627\u062E\u062A \u0646\u062E\u0633\u062A\u06CC\u0646 \u0647\u0648\u06CC\u062A", tr: "\u0130lk kimli\u011Fi olu\u015Fturun" },
    trade_off: { en: "No existing recognition to lose; competitor conventions show what to avoid copying, not what to copy.", fa: "\u0634\u0646\u0627\u062E\u062A\u0647\u200C\u0634\u062F\u0646\u06CC \u0628\u0631\u0627\u06CC \u0627\u0632 \u062F\u0633\u062A \u062F\u0627\u062F\u0646 \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F\u061B \u0642\u0631\u0627\u0631\u062F\u0627\u062F\u0647\u0627\u06CC \u0631\u0642\u0628\u0627 \u0646\u0634\u0627\u0646 \u0645\u06CC\u200C\u062F\u0647\u0646\u062F \u0627\u0632 \u0686\u0647 \u0686\u06CC\u0632\u06CC \u0646\u0628\u0627\u06CC\u062F \u062A\u0642\u0644\u06CC\u062F \u06A9\u0631\u062F\u060C \u0646\u0647 \u0627\u0632 \u0686\u0647 \u0686\u06CC\u0632\u06CC \u0628\u0627\u06CC\u062F \u062A\u0642\u0644\u06CC\u062F \u06A9\u0631\u062F.", tr: "Kaybedilecek bir tan\u0131n\u0131rl\u0131k yoktur; rakip al\u0131\u015Fkanl\u0131klar\u0131 neyin kopyalanaca\u011F\u0131n\u0131 de\u011Fil, neyin kopyalanmamas\u0131 gerekti\u011Fini g\xF6sterir." }
  }
};
var DEPENDENCIES = {
  costs: { en: "our costs", fa: "\u0647\u0632\u06CC\u0646\u0647\u200C\u0647\u0627\u06CC \u0645\u0627", tr: "maliyetlerimiz" },
  willingness_to_pay: { en: "willingness to pay", fa: "\u062A\u0645\u0627\u06CC\u0644 \u0628\u0647 \u067E\u0631\u062F\u0627\u062E\u062A", tr: "\xF6deme iste\u011Fi" },
  customer_evidence: { en: "customer evidence", fa: "\u0634\u0648\u0627\u0647\u062F \u0645\u0634\u062A\u0631\u06CC", tr: "m\xFC\u015Fteri kan\u0131t\u0131" },
  business_model: { en: "business model", fa: "\u0645\u062F\u0644 \u06A9\u0633\u0628\u200C\u0648\u06A9\u0627\u0631", tr: "i\u015F modeli" }
};
var WARNINGS = {
  no_current_price: {
    en: "No current competitor price is recorded for this scope. Nothing here is a priced recommendation.",
    fa: "\u0647\u06CC\u0686 \u0642\u06CC\u0645\u062A \u0641\u0639\u0644\u06CC \u0627\u0632 \u0631\u0642\u0628\u0627 \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u062F\u0627\u0645\u0646\u0647 \u062B\u0628\u062A \u0646\u0634\u062F\u0647 \u0627\u0633\u062A. \u0647\u06CC\u0686\u200C\u0686\u06CC\u0632 \u0627\u06CC\u0646\u062C\u0627 \u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u0642\u06CC\u0645\u062A \u0646\u06CC\u0633\u062A.",
    tr: "Bu kapsam i\xE7in g\xFCncel bir rakip fiyat\u0131 kaydedilmedi. Buradaki hi\xE7bir \u015Fey fiyatl\u0131 bir \xF6neri de\u011Fildir."
  },
  historical_price: {
    en: "{name} {offer} was observed {date} and is historical. Refresh it before treating it as a current market price.",
    fa: "{name} {offer} \u062F\u0631 {date} \u0645\u0634\u0627\u0647\u062F\u0647 \u0634\u062F\u0647 \u0648 \u0642\u062F\u06CC\u0645\u06CC \u0627\u0633\u062A. \u067E\u06CC\u0634 \u0627\u0632 \u0627\u06CC\u0646\u06A9\u0647 \u0622\u0646 \u0631\u0627 \u0642\u06CC\u0645\u062A \u0641\u0639\u0644\u06CC \u0628\u0627\u0632\u0627\u0631 \u0628\u062F\u0627\u0646\u06CC\u062F\u060C \u062A\u0627\u0632\u0647\u200C\u0627\u0634 \u06A9\u0646\u06CC\u062F.",
    tr: "{name} {offer} {date} tarihinde g\xF6zlemlendi ve ge\xE7mi\u015F kay\u0131tt\u0131r. G\xFCncel piyasa fiyat\u0131 saymadan \xF6nce yenileyin."
  },
  promotional_price: {
    en: "{name} {offer} is a promotional price, not a standard rate.",
    fa: "{name} {offer} \u0642\u06CC\u0645\u062A \u062A\u0628\u0644\u06CC\u063A\u0627\u062A\u06CC \u0627\u0633\u062A\u060C \u0646\u0647 \u0646\u0631\u062E \u0627\u0633\u062A\u0627\u0646\u062F\u0627\u0631\u062F.",
    tr: "{name} {offer} bir kampanya fiyat\u0131d\u0131r, standart \xFCcret de\u011Fildir."
  },
  promotion_unknown: {
    en: "{name} {offer}: whether this is a promotion is unknown; do not read it as a standard rate.",
    fa: "{name} {offer}: \u0645\u0639\u0644\u0648\u0645 \u0646\u06CC\u0633\u062A \u0627\u06CC\u0646 \u0642\u06CC\u0645\u062A \u062A\u0628\u0644\u06CC\u063A\u0627\u062A\u06CC \u0627\u0633\u062A \u06CC\u0627 \u0646\u0647\u061B \u0622\u0646 \u0631\u0627 \u0646\u0631\u062E \u0627\u0633\u062A\u0627\u0646\u062F\u0627\u0631\u062F \u0646\u062F\u0627\u0646\u06CC\u062F.",
    tr: "{name} {offer}: bunun bir kampanya olup olmad\u0131\u011F\u0131 bilinmiyor; standart \xFCcret olarak okumay\u0131n."
  },
  monthly_rate_billed_annually: {
    en: "{name} {offer} is a monthly rate billed annually, not a month-to-month price.",
    fa: "{name} {offer} \u0646\u0631\u062E \u0645\u0627\u0647\u0627\u0646\u0647\u200C\u0627\u06CC \u0627\u0633\u062A \u06A9\u0647 \u0633\u0627\u0644\u0627\u0646\u0647 \u067E\u0631\u062F\u0627\u062E\u062A \u0645\u06CC\u200C\u0634\u0648\u062F\u060C \u0646\u0647 \u0642\u06CC\u0645\u062A \u0645\u0627\u0647\u200C\u0628\u0647\u200C\u0645\u0627\u0647.",
    tr: "{name} {offer} y\u0131ll\u0131k faturalanan ayl\u0131k bir \xFCcrettir, aydan aya fiyat de\u011Fildir."
  },
  price_needs_review: {
    en: "{name} {offer}: its source changed, was replaced or can no longer be read. It is not used until re-checked.",
    fa: "{name} {offer}: \u0645\u0646\u0628\u0639 \u0622\u0646 \u062A\u063A\u06CC\u06CC\u0631 \u06A9\u0631\u062F\u0647\u060C \u062C\u0627\u06CC\u06AF\u0632\u06CC\u0646 \u0634\u062F\u0647 \u06CC\u0627 \u062F\u06CC\u06AF\u0631 \u062E\u0648\u0627\u0646\u062F\u0647 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F. \u062A\u0627 \u0628\u0627\u0632\u0628\u06CC\u0646\u06CC \u062F\u0648\u0628\u0627\u0631\u0647 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F.",
    tr: "{name} {offer}: kayna\u011F\u0131 de\u011Fi\u015Fti, yenisiyle de\u011Fi\u015Ftirildi veya art\u0131k okunam\u0131yor. Yeniden kontrol edilene kadar kullan\u0131lmaz."
  },
  price_conflicting: {
    en: "{name} {offer}: sources disagree about this price. Both are kept; neither is used as current.",
    fa: "{name} {offer}: \u0645\u0646\u0627\u0628\u0639 \u062F\u0631\u0628\u0627\u0631\u0647\u0654 \u0627\u06CC\u0646 \u0642\u06CC\u0645\u062A \u0627\u062E\u062A\u0644\u0627\u0641 \u062F\u0627\u0631\u0646\u062F. \u0647\u0631 \u062F\u0648 \u0646\u06AF\u0647 \u062F\u0627\u0634\u062A\u0647 \u0645\u06CC\u200C\u0634\u0648\u0646\u062F\u061B \u0647\u06CC\u0686\u200C\u06A9\u062F\u0627\u0645 \u062F\u0627\u062F\u0647\u0654 \u0641\u0639\u0644\u06CC \u0634\u0645\u0631\u062F\u0647 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F.",
    tr: "{name} {offer}: kaynaklar bu fiyat konusunda \xE7eli\u015Fiyor. \u0130kisi de saklan\u0131r; hi\xE7biri g\xFCncel say\u0131lmaz."
  },
  visual_unavailable: {
    en: "No current cited visual observation exists. Visual comparison is unavailable; no palette, motif or similarity is assumed.",
    fa: "\u0647\u06CC\u0686 \u0645\u0634\u0627\u0647\u062F\u0647\u0654 \u0628\u0635\u0631\u06CC \u0645\u0633\u062A\u0646\u062F \u0648 \u0641\u0639\u0644\u06CC \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F. \u0645\u0642\u0627\u06CC\u0633\u0647\u0654 \u0628\u0635\u0631\u06CC \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A\u061B \u0647\u06CC\u0686 \u067E\u0627\u0644\u062A\u060C \u0646\u0642\u0634\u200C\u0645\u0627\u06CC\u0647 \u06CC\u0627 \u0634\u0628\u0627\u0647\u062A\u06CC \u0641\u0631\u0636 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F.",
    tr: "G\xFCncel, kaynakl\u0131 bir g\xF6rsel g\xF6zlem yok. G\xF6rsel kar\u015F\u0131la\u015Ft\u0131rma yap\u0131lam\u0131yor; hi\xE7bir palet, motif veya benzerlik varsay\u0131lmaz."
  },
  similarity_not_assessed: {
    en: "Similarity to competitor marks is not assessed here. A visual comparison is a risk signal, never legal clearance.",
    fa: "\u0634\u0628\u0627\u0647\u062A \u0628\u0647 \u0646\u0634\u0627\u0646\u200C\u0647\u0627\u06CC \u0631\u0642\u0628\u0627 \u0627\u06CC\u0646\u062C\u0627 \u0627\u0631\u0632\u06CC\u0627\u0628\u06CC \u0646\u0645\u06CC\u200C\u0634\u0648\u062F. \u0645\u0642\u0627\u06CC\u0633\u0647\u0654 \u0628\u0635\u0631\u06CC \u0641\u0642\u0637 \u0646\u0634\u0627\u0646\u0647\u0654 \u0631\u06CC\u0633\u06A9 \u0627\u0633\u062A\u060C \u0647\u0631\u06AF\u0632 \u062A\u0623\u06CC\u06CC\u062F \u062D\u0642\u0648\u0642\u06CC \u0646\u06CC\u0633\u062A.",
    tr: "Rakip i\u015Faretlerine benzerlik burada de\u011Ferlendirilmez. G\xF6rsel kar\u015F\u0131la\u015Ft\u0131rma bir risk i\u015Faretidir, asla hukuki onay de\u011Fildir."
  },
  seo_interview_unreadable: {
    en: "The SEO interview record could not be read; owner-named competitors are not shown.",
    fa: "\u0631\u06A9\u0648\u0631\u062F \u0645\u0635\u0627\u062D\u0628\u0647\u0654 \u0633\u0626\u0648 \u062E\u0648\u0627\u0646\u062F\u0647 \u0646\u0634\u062F\u061B \u0631\u0642\u0628\u0627\u06CC\u06CC \u06A9\u0647 \u0645\u0627\u0644\u06A9 \u0646\u0627\u0645 \u0628\u0631\u062F\u0647 \u0646\u0645\u0627\u06CC\u0634 \u062F\u0627\u062F\u0647 \u0646\u0645\u06CC\u200C\u0634\u0648\u0646\u062F.",
    tr: "SEO g\xF6r\xFC\u015Fme kayd\u0131 okunamad\u0131; sahibin adland\u0131rd\u0131\u011F\u0131 rakipler g\xF6sterilmiyor."
  }
};
var PROPOSE_EDIT = {
  en: "{field}: propose the change with brand:knowledge propose, then brand:review and brand:approve. This draft writes nothing.",
  fa: "{field}: \u062A\u063A\u06CC\u06CC\u0631 \u0631\u0627 \u0628\u0627 brand:knowledge propose \u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u062F\u0647\u06CC\u062F\u060C \u0633\u067E\u0633 brand:review \u0648 brand:approve. \u0627\u06CC\u0646 \u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633 \u0686\u06CC\u0632\u06CC \u0646\u0645\u06CC\u200C\u0646\u0648\u06CC\u0633\u062F.",
  tr: "{field}: de\u011Fi\u015Fikli\u011Fi brand:knowledge propose ile \xF6nerin, ard\u0131ndan brand:review ve brand:approve. Bu taslak hi\xE7bir \u015Fey yazmaz."
};
var SEO_NAME_STATUS = {
  matched_candidate: { en: "in the competitor index as {id}", fa: "\u062F\u0631 \u0641\u0647\u0631\u0633\u062A \u0631\u0642\u0628\u0627 \u0628\u0627 \u0634\u0646\u0627\u0633\u0647\u0654 {id}", tr: "rakip dizininde {id} olarak" },
  not_in_index: { en: "not in the competitor index (brand:competitive import-seo-names adds it as a candidate)", fa: "\u062F\u0631 \u0641\u0647\u0631\u0633\u062A \u0631\u0642\u0628\u0627 \u0646\u06CC\u0633\u062A (brand:competitive import-seo-names \u0622\u0646 \u0631\u0627 \u0628\u0647\u200C\u0639\u0646\u0648\u0627\u0646 \u0646\u0627\u0645\u0632\u062F \u0627\u0636\u0627\u0641\u0647 \u0645\u06CC\u200C\u06A9\u0646\u062F)", tr: "rakip dizininde yok (brand:competitive import-seo-names onu aday olarak ekler)" }
};

// packages/brand-core/src/competitive/memos.ts
var MEMO_SCHEMA = "brand-os.competitive-memo/1";
var MEMO_PURPOSES = ["marketing", "pricing", "seo", "identity"];
var MEMO_FACTS = {
  marketing: ["business.marketing.objective", "business.marketing.channels", "business.marketing.pillars", "business.customer.primary_segment", "brand.strategy.differentiation", "business.marketing.availability_claim"],
  pricing: ["business.sales.pricing", "business.model.revenue", "business.offer.value_proposition", "business.market.geography"],
  seo: ["business.market.geography", "brand.strategy.differentiation"],
  identity: ["brand.strategy.differentiation", "business.customer.primary_segment", "brand.logo.variants", "brand.logo.masters"]
};
var EDITABLE = {
  marketing: ["business.marketing.channels", "business.marketing.pillars", "brand.strategy.differentiation"],
  pricing: ["business.sales.pricing"],
  seo: ["seo.competitors.named"],
  identity: ["brand.logo.*"]
};
var NOT_KNOWN_BY = {
  marketing: ["ad_spend", "conversion", "revenue", "targeting", "effectiveness"],
  pricing: ["price_paid", "costs", "revenue", "willingness_to_pay", "fx_tax"],
  seo: ["rankings", "keyword_gaps", "ai_visibility", "revenue"],
  identity: ["legal_clearance", "recognition", "artwork", "aesthetics"]
};
var KIND_OF = {
  marketing: "marketing_opportunity_memo",
  pricing: "pricing_benchmark_memo",
  seo: "seo_competitor_supplement",
  identity: "visual_landscape_assessment"
};
function cite(ws, ids) {
  const facts = readFacts(ws.root, "approved", ws.brandSlug);
  return ids.map((id) => {
    const fact = facts[id];
    const approved = Boolean(fact && fact.status === "approved" && fact.revision_hash);
    return { fact_id: id, state: approved ? "approved" : "missing", revision: approved ? fact.revision_hash : null };
  });
}
function alternative(id, lang, depends_on, cites) {
  const entry = ALTERNATIVES[id];
  return { id, title: entry.title[lang], trade_off: entry.trade_off[lang], status: "hypothesis", depends_on, cites };
}
function base(ws, purpose, ctx) {
  const lang = ctx.lang;
  return {
    schema: MEMO_SCHEMA,
    kind: KIND_OF[purpose],
    status: "draft",
    brand_slug: ctx.brand_slug,
    generated_at: ctx.generated_at,
    lang,
    purpose,
    market: ctx.market,
    context: { state: ctx.state, source_digest: ctx.source_digest, research_state: ctx.research.state },
    owner_inputs: cite(ws, MEMO_FACTS[purpose]),
    observations: ctx.observations.filter((o) => o.usable),
    unresolved: ctx.observations.filter((o) => !o.usable).map((o) => ({ competitor_id: o.competitor_id, competitor_name: o.competitor_name, observation_id: o.observation_id, dimension: o.dimension, cell: o.cell, ref_state: o.ref_state, ref: o.ref })),
    alternatives: [],
    warnings: [],
    not_known: NOT_KNOWN_BY[purpose].map((code) => ({ code, text: NOT_KNOWN[code][lang] })),
    proposed_edits: EDITABLE[purpose].map((field) => ({ field, text: fill(PROPOSE_EDIT[lang], { field }) })),
    gaps: ctx.gaps,
    next_research: ctx.next_research,
    source_refs: ctx.source_refs,
    prohibited_inferences: ctx.prohibited_inferences,
    authorizes: []
  };
}
function marketingMemo(ws, ctx) {
  const memo = base(ws, "marketing", ctx);
  const lang = ctx.lang;
  const messages = memo.observations.filter((o) => o.dimension === "public_message" || o.dimension === "audience").map((o) => o.observation_id);
  const channels = memo.observations.filter((o) => o.dimension === "observable_channels").map((o) => o.observation_id);
  memo.alternatives.push(alternative("differentiate", lang, ["brand.strategy.differentiation", "business.marketing.objective"], messages));
  memo.alternatives.push(alternative("match_with_proof", lang, ["business.customer.primary_segment", "business.marketing.availability_claim"], messages));
  if (channels.length) memo.alternatives.push(alternative("channel_test", lang, ["business.marketing.channels", "business.marketing.objective"], channels));
  if (ctx.state !== "evidence_available") memo.alternatives.push(alternative("gather_evidence", lang, [], []));
  return { ...memo, kind: "marketing_opportunity_memo" };
}
function rateLabel(row) {
  if (row.promotion === "promotional") return "promotional";
  if (row.promotion === "unknown") return "promotion_unknown";
  if (row.billing_commitment === "annual" && row.billing_period === "month") return "monthly_rate_billed_annually";
  if (row.billing_period === "unknown" || row.billing_commitment === "unknown") return "terms_unknown";
  return "standard_rate";
}
function rowStatus(row) {
  if (row.cell === "historical") return "historical";
  if (row.cell === "conflicting") return "conflicting";
  if (row.cell === "needs_review") return "needs_review";
  return "current";
}
function pricingMemo(ws, ctx) {
  const memo = base(ws, "pricing", ctx);
  const lang = ctx.lang;
  const byId = new Map(ctx.observations.map((o) => [o.observation_id, o]));
  const rows = (ctx.prices?.rows ?? []).map((row) => {
    const o = byId.get(row.observation_id);
    return { ...row, competitor_name: o?.competitor_name ?? row.competitor_id, ref: o?.ref ?? "", source_class: o?.source_class ?? null, feature_scope: o?.price?.feature_scope ?? null, price_kind: "publicly_advertised", rate_label: rateLabel(row), status: rowStatus(row), business_model: "unknown" };
  });
  const warn = (code, row) => memo.warnings.push({ code, observation_id: row?.observation_id ?? null, text: fill(WARNINGS[code][lang], row ? { name: row.competitor_name, offer: row.offer_name, date: row.observed_at.slice(0, 10) } : {}) });
  if (!rows.some((row) => row.status === "current")) warn("no_current_price", null);
  for (const row of rows) {
    if (row.status === "historical") warn("historical_price", row);
    if (row.status === "needs_review") warn("price_needs_review", row);
    if (row.status === "conflicting") warn("price_conflicting", row);
    if (row.rate_label === "promotional") warn("promotional_price", row);
    if (row.rate_label === "promotion_unknown") warn("promotion_unknown", row);
    if (row.billing_commitment === "annual" && row.billing_period === "month") warn("monthly_rate_billed_annually", row);
  }
  const current = rows.filter((row) => row.status === "current").map((row) => row.observation_id);
  const deps = ["costs", "willingness_to_pay", "customer_evidence", "business_model"].map((d) => DEPENDENCIES[d][lang]);
  for (const id of ["value_based", "tiered", "premium", "entry_level"]) memo.alternatives.push(alternative(id, lang, deps, current));
  if (ctx.state !== "evidence_available") memo.alternatives.push(alternative("gather_evidence", lang, [], []));
  return {
    ...memo,
    kind: "pricing_benchmark_memo",
    prices: { rows, comparison: ctx.prices?.comparison ?? "none", reasons: ctx.prices?.reasons ?? [], ranked: false, currency_conversion: "none", priced_recommendation: false }
  };
}
function seoMemo(ws, ctx) {
  const memo = base(ws, "seo", ctx);
  let names = [];
  let state = "read";
  try {
    names = seoNamedCompetitors(ws);
    if (!names.length) state = "not_answered";
  } catch {
    state = "unreadable";
    memo.warnings.push({ code: "seo_interview_unreadable", observation_id: null, text: WARNINGS.seo_interview_unreadable[ctx.lang] });
  }
  const index = new Map(ctx.competitors.map((c) => [nameKey(c.display_name), c.competitor_id]));
  const owner_named = names.map((name) => ({ name, status: "unverified_owner_assumption", competitor_id: index.get(nameKey(name)) ?? null }));
  return { ...memo, kind: "seo_competitor_supplement", owner_named, search_evidence: { rankings: "unverified", keyword_gaps: "unverified" }, seo_interview: state };
}
function readIntake(ws) {
  const file = path2.join(ws.root, "brand", "brand.config.yaml");
  try {
    return readIdentityIntake(fs2.existsSync(file) ? readYaml(file) : null);
  } catch {
    return readIdentityIntake(null);
  }
}
function identityMemo(ws, ctx, intake) {
  const memo = base(ws, "identity", ctx);
  const lang = ctx.lang;
  const visual = memo.observations.filter((o) => o.dimension === "visual_language").map((o) => o.observation_id);
  const available = visual.length > 0;
  if (!available) memo.warnings.push({ code: "visual_unavailable", observation_id: null, text: WARNINGS.visual_unavailable[lang] });
  memo.warnings.push({ code: "similarity_not_assessed", observation_id: null, text: WARNINGS.similarity_not_assessed[lang] });
  const presence = intake.choice.logo_presence;
  const routes = presence === "absent" ? ["create"] : presence === "unknown" ? ["create", "retain_improve_guidelines", "evolve", "rebrand"] : ["retain_improve_guidelines", "evolve", "rebrand"];
  for (const id of routes) memo.alternatives.push(alternative(id, lang, ["brand.strategy.differentiation"], visual));
  if (ctx.state !== "evidence_available") memo.alternatives.push(alternative("gather_evidence", lang, [], []));
  return {
    ...memo,
    kind: "visual_landscape_assessment",
    visual_comparison: available ? "available" : "unavailable",
    similarity: "not_assessed",
    intake: { state: intake.state, choice: intake.choice, authority: "unapproved_owner_intake" }
  };
}
function buildCompetitiveMemo(ws, purpose, opts) {
  const p = oneOf(purpose, MEMO_PURPOSES, "purpose");
  const ctx = getCompetitiveContext(ws, p, opts);
  if (p === "marketing") return marketingMemo(ws, ctx);
  if (p === "pricing") return pricingMemo(ws, ctx);
  if (p === "seo") return seoMemo(ws, ctx);
  return identityMemo(ws, ctx, opts.identityIntake ?? readIntake(ws));
}

export {
  COMPETITIVE_SCHEMA_VERSION,
  RELATIONSHIPS,
  GEOGRAPHIES,
  BILLING_PERIODS,
  BILLING_COMMITMENTS,
  TAX_INCLUSIONS,
  PROMOTIONS,
  COMPETITOR_ID,
  OBSERVATION_ID,
  COMPETITIVE_LIMITS,
  CompetitiveError,
  oneOf,
  validateCompetitorId,
  validateDomain,
  DIMENSION_LABELS,
  asLang,
  fill,
  HEADINGS,
  competitiveDir,
  assertOwnerProcess,
  readJson,
  writeJson,
  locked,
  readCandidate,
  scanCandidates,
  setScope,
  addCandidate,
  setStatus,
  classifyCandidate,
  resolveEvidence,
  linkEvidence,
  verifyDomain,
  refState,
  sourceClass,
  buildLandscape,
  getCompetitiveContext,
  MEMO_TITLES,
  MEMO_HEADINGS,
  SEO_NAME_STATUS,
  importSeoNames,
  MEMO_PURPOSES,
  rateLabel,
  buildCompetitiveMemo
};
