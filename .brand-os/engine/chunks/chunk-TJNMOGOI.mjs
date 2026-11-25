import { createRequire as __engineRequire } from 'node:module'; const require = __engineRequire(import.meta.url);
import {
  RESEARCH_LIMITS,
  ResearchError,
  assertOwnerProcess,
  htmlToText,
  normalizeForQuote,
  sha256,
  validateExcerpt,
  validateSource,
  validateUrl
} from "./chunk-QTDYPN2G.mjs";
import {
  KnowledgeError,
  captureNote,
  dirUsable,
  ensureDir,
  safeRead,
  withLock,
  writeVaultFile
} from "./chunk-YAOGM5B7.mjs";

// packages/brand-core/src/seo/interview.ts
var UNKNOWN = "unknown";
var web = (a) => single(a["seo.presence.web"]);
var app = (a) => single(a["seo.presence.app"]);
var hasWeb = (a) => web(a) !== void 0 && web(a) !== "none";
var hasApp = (a) => app(a) !== void 0 && app(a) !== "none";
function single(value) {
  return Array.isArray(value) ? value[0] : value;
}
function list(value) {
  if (value === void 0) return [];
  return (Array.isArray(value) ? value : [value]).filter((item) => item !== UNKNOWN);
}
var always = () => null;
var needsWeb = (a) => web(a) === void 0 ? "Waiting for seo.presence.web." : hasWeb(a) ? null : "The brand has no website, so there is no site to configure.";
var SEO_QUESTIONS = [
  {
    id: "seo.presence.web",
    stage: "presence",
    prompt: {
      en: "What website does the brand have today: none, a single landing page, a content site, a web app, or a shop?",
      fa: "\u0628\u0631\u0646\u062F \u0627\u0645\u0631\u0648\u0632 \u0686\u0647 \u0648\u0628\u200C\u0633\u0627\u06CC\u062A\u06CC \u062F\u0627\u0631\u062F: \u0647\u06CC\u0686\u060C \u06CC\u06A9 \u0635\u0641\u062D\u0647\u0654 \u0641\u0631\u0648\u062F\u060C \u0633\u0627\u06CC\u062A \u0645\u062D\u062A\u0648\u0627\u06CC\u06CC\u060C \u0648\u0628\u200C\u0627\u067E \u06CC\u0627 \u0641\u0631\u0648\u0634\u06AF\u0627\u0647\u061F",
      tr: "Markan\u0131n bug\xFCn hangi web sitesi var: hi\xE7, tek bir a\xE7\u0131l\u0131\u015F sayfas\u0131, i\xE7erik sitesi, web uygulamas\u0131 ya da ma\u011Faza?"
    },
    why_it_matters: "Web search strategy for a brand without a site is a different strategy, not a smaller one.",
    decision_informed: "Which strategy archetype applies (app-only, site-led, or both).",
    choices: ["none", "landing_page", "content_site", "web_app", "ecommerce"],
    multi: false,
    depends_on: [],
    skip: always,
    evidence_needed: "The live URL, if any.",
    priority: 1
  },
  {
    id: "seo.presence.app",
    stage: "presence",
    prompt: {
      en: "Is there a mobile app, and on which stores?",
      fa: "\u0622\u06CC\u0627 \u0627\u067E \u0645\u0648\u0628\u0627\u06CC\u0644 \u062F\u0627\u0631\u06CC\u062F \u0648 \u062F\u0631 \u06A9\u062F\u0627\u0645 \u0641\u0631\u0648\u0634\u06AF\u0627\u0647\u200C\u0647\u0627\u061F",
      tr: "Bir mobil uygulama var m\u0131, hangi ma\u011Fazalarda?"
    },
    why_it_matters: "Store search (ASO) and web search are different systems with different levers.",
    decision_informed: "Whether store listings are the primary search surface.",
    choices: ["none", "ios", "android", "ios_android"],
    multi: false,
    depends_on: [],
    skip: always,
    evidence_needed: "Store listing URLs.",
    priority: 2
  },
  {
    id: "seo.business.model",
    stage: "market",
    prompt: { en: "Who buys: consumers, businesses, or both?", fa: "\u0686\u0647 \u06A9\u0633\u06CC \u0645\u06CC\u200C\u062E\u0631\u062F: \u0645\u0635\u0631\u0641\u200C\u06A9\u0646\u0646\u062F\u0647\u060C \u06A9\u0633\u0628\u200C\u0648\u06A9\u0627\u0631 \u06CC\u0627 \u0647\u0631 \u062F\u0648\u061F", tr: "Kim sat\u0131n al\u0131yor: t\xFCketiciler, i\u015Fletmeler ya da her ikisi?" },
    why_it_matters: "B2B search is fewer, higher-intent queries across a buying committee; B2C is volume and immediacy.",
    decision_informed: "Search intent model and which pages carry the strategy.",
    choices: ["b2c", "b2b", "both"],
    multi: false,
    depends_on: [],
    skip: always,
    evidence_needed: null,
    priority: 3
  },
  {
    id: "seo.goal.primary",
    stage: "market",
    prompt: { en: "What should search bring first: installs, sign-ups, leads, sales, or awareness?", fa: "\u062C\u0633\u062A\u200C\u0648\u062C\u0648 \u0627\u0648\u0644 \u0686\u0647 \u0686\u06CC\u0632\u06CC \u0628\u0627\u06CC\u062F \u0628\u06CC\u0627\u0648\u0631\u062F: \u0646\u0635\u0628\u060C \u062B\u0628\u062A\u200C\u0646\u0627\u0645\u060C \u0633\u0631\u0646\u062E \u0641\u0631\u0648\u0634\u060C \u0641\u0631\u0648\u0634 \u06CC\u0627 \u0622\u06AF\u0627\u0647\u06CC\u061F", tr: "Arama \xF6nce ne getirmeli: y\xFCkleme, kay\u0131t, potansiyel m\xFC\u015Fteri, sat\u0131\u015F ya da bilinirlik?" },
    why_it_matters: "The conversion defines which pages matter and what is measured.",
    decision_informed: "Primary objective and leading indicators.",
    choices: ["app_installs", "signups", "leads", "sales", "awareness"],
    multi: false,
    depends_on: [],
    skip: always,
    evidence_needed: "Current conversion definition.",
    priority: 4
  },
  {
    id: "seo.goal.timeframe",
    stage: "market",
    prompt: { en: "By when do you expect search to matter for that goal?", fa: "\u0627\u0646\u062A\u0638\u0627\u0631 \u062F\u0627\u0631\u06CC\u062F \u062C\u0633\u062A\u200C\u0648\u062C\u0648 \u062A\u0627 \u0686\u0647 \u0632\u0645\u0627\u0646\u06CC \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u0647\u062F\u0641 \u0627\u062B\u0631 \u062F\u0627\u0634\u062A\u0647 \u0628\u0627\u0634\u062F\u061F", tr: "Araman\u0131n bu hedef i\xE7in ne zamana kadar etkili olmas\u0131n\u0131 bekliyorsunuz?" },
    why_it_matters: "Organic search is slow to show effects; an unrealistic horizon must be named, not accepted silently.",
    decision_informed: "Whether the goal is feasible and what to do meanwhile.",
    choices: ["under_3_months", "3_to_12_months", "over_12_months"],
    multi: false,
    depends_on: [],
    skip: always,
    evidence_needed: null,
    priority: 5
  },
  {
    id: "seo.market.locales",
    stage: "market",
    prompt: { en: "Which languages must people be able to find you in? (codes such as en, fa, tr)", fa: "\u0645\u0631\u062F\u0645 \u0628\u0627\u06CC\u062F \u0628\u0647 \u0686\u0647 \u0632\u0628\u0627\u0646\u200C\u0647\u0627\u06CC\u06CC \u0628\u062A\u0648\u0627\u0646\u0646\u062F \u0634\u0645\u0627 \u0631\u0627 \u067E\u06CC\u062F\u0627 \u06A9\u0646\u0646\u062F\u061F (\u06A9\u062F\u0647\u0627\u06CC\u06CC \u0645\u0627\u0646\u0646\u062F en\u060C fa\u060C tr)", tr: "\u0130nsanlar sizi hangi dillerde bulabilmeli? (en, fa, tr gibi kodlar)" },
    why_it_matters: "Each language is its own search market with its own queries and competitors.",
    decision_informed: "Locale scope and, with a site, its structure.",
    choices: null,
    multi: true,
    depends_on: [],
    skip: always,
    evidence_needed: null,
    priority: 6
  },
  {
    id: "seo.web.locale_structure",
    stage: "presence",
    prompt: { en: "How are (or will) the language versions of the site be organised?", fa: "\u0646\u0633\u062E\u0647\u200C\u0647\u0627\u06CC \u0632\u0628\u0627\u0646\u06CC \u0633\u0627\u06CC\u062A \u0686\u06AF\u0648\u0646\u0647 \u0633\u0627\u0632\u0645\u0627\u0646\u200C\u062F\u0647\u06CC \u0634\u062F\u0647\u200C\u0627\u0646\u062F (\u06CC\u0627 \u0645\u06CC\u200C\u0634\u0648\u0646\u062F)\u061F", tr: "Sitenin dil s\xFCr\xFCmleri nas\u0131l d\xFCzenleniyor (ya da d\xFCzenlenecek)?" },
    why_it_matters: "Localized versions must be declared consistently; changing structure later is a migration.",
    decision_informed: "International setup.",
    choices: ["single_language", "subdirectories", "subdomains", "country_domains", "undecided"],
    multi: false,
    depends_on: ["seo.presence.web", "seo.market.locales"],
    skip: (a) => needsWeb(a) ?? (list(a["seo.market.locales"]).length > 1 ? null : "Only one language is in scope."),
    evidence_needed: "Current URL pattern per language.",
    priority: 7
  },
  {
    id: "seo.web.maturity",
    stage: "presence",
    prompt: { en: "Is the site new, established, or about to move domain or platform?", fa: "\u0633\u0627\u06CC\u062A \u062A\u0627\u0632\u0647 \u0627\u0633\u062A\u060C \u062C\u0627\u0627\u0641\u062A\u0627\u062F\u0647 \u0627\u0633\u062A\u060C \u06CC\u0627 \u062F\u0631 \u0622\u0633\u062A\u0627\u0646\u0647\u0654 \u0627\u0646\u062A\u0642\u0627\u0644 \u062F\u0627\u0645\u0646\u0647 \u06CC\u0627 \u067E\u0644\u062A\u0641\u0631\u0645\u061F", tr: "Site yeni mi, oturmu\u015F mu, yoksa alan ad\u0131 ya da platform de\u011Fi\u015Fikli\u011Fi mi yakla\u015F\u0131yor?" },
    why_it_matters: "A migration is the riskiest SEO event; a new site has no history to protect.",
    decision_informed: "Whether migration safety comes before everything else.",
    choices: ["new", "established", "migrating"],
    multi: false,
    depends_on: ["seo.presence.web"],
    skip: needsWeb,
    evidence_needed: null,
    priority: 8
  },
  {
    id: "seo.web.control",
    stage: "resources",
    prompt: { en: "Can the team change titles, page text, redirects and robots rules on the site?", fa: "\u0622\u06CC\u0627 \u062A\u06CC\u0645 \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u062F \u0639\u0646\u0648\u0627\u0646\u200C\u0647\u0627\u060C \u0645\u062A\u0646 \u0635\u0641\u062D\u0647\u060C \u0631\u06CC\u062F\u0627\u06CC\u0631\u06A9\u062A\u200C\u0647\u0627 \u0648 \u0642\u0648\u0627\u0646\u06CC\u0646 robots \u0633\u0627\u06CC\u062A \u0631\u0627 \u062A\u063A\u06CC\u06CC\u0631 \u062F\u0647\u062F\u061F", tr: "Ekip sitede ba\u015Fl\u0131klar\u0131, sayfa metnini, y\xF6nlendirmeleri ve robots kurallar\u0131n\u0131 de\u011Fi\u015Ftirebilir mi?" },
    why_it_matters: "A plan that needs changes nobody can make is not a plan.",
    decision_informed: "Which technical actions are feasible now.",
    choices: ["full", "cms_limited", "none"],
    multi: false,
    depends_on: ["seo.presence.web"],
    skip: needsWeb,
    evidence_needed: null,
    priority: 9
  },
  {
    id: "seo.data.search_console",
    stage: "measurement",
    prompt: { en: "Is the site verified in a search engine console (for example Google Search Console)? Do not paste any credentials.", fa: "\u0622\u06CC\u0627 \u0633\u0627\u06CC\u062A \u062F\u0631 \u06A9\u0646\u0633\u0648\u0644 \u0645\u0648\u062A\u0648\u0631 \u062C\u0633\u062A\u200C\u0648\u062C\u0648 (\u0645\u062B\u0644\u0627\u064B Google Search Console) \u062A\u0623\u06CC\u06CC\u062F \u0634\u062F\u0647 \u0627\u0633\u062A\u061F \u0647\u06CC\u0686 \u0631\u0645\u0632 \u06CC\u0627 \u06A9\u0644\u06CC\u062F\u06CC \u0648\u0627\u0631\u062F \u0646\u06A9\u0646\u06CC\u062F.", tr: "Site bir arama motoru konsolunda (\xF6rne\u011Fin Google Search Console) do\u011Fruland\u0131 m\u0131? Hi\xE7bir kimlik bilgisi yap\u0131\u015Ft\u0131rmay\u0131n." },
    why_it_matters: "Without it there is no baseline: every search number in a plan would be invented.",
    decision_informed: "Measurement plan and baseline.",
    choices: ["verified", "not_set_up"],
    multi: false,
    depends_on: ["seo.presence.web"],
    skip: needsWeb,
    evidence_needed: "An owner-made export, if verified.",
    priority: 10
  },
  {
    id: "seo.data.analytics",
    stage: "measurement",
    prompt: { en: "Is there any analytics that records the conversion?", fa: "\u0622\u06CC\u0627 \u0627\u0628\u0632\u0627\u0631 \u062A\u062D\u0644\u06CC\u0644\u06CC \u0647\u0633\u062A \u06A9\u0647 \u062A\u0628\u062F\u06CC\u0644 \u0631\u0627 \u062B\u0628\u062A \u06A9\u0646\u062F\u061F", tr: "D\xF6n\xFC\u015F\xFCm\xFC kaydeden bir analitik var m\u0131?" },
    why_it_matters: "Search impressions are not outcomes; the conversion must be measurable.",
    decision_informed: "Whether outcomes can be attributed at all.",
    choices: ["available", "none"],
    multi: false,
    depends_on: [],
    skip: always,
    evidence_needed: null,
    priority: 11
  },
  {
    id: "seo.content.capacity",
    stage: "resources",
    prompt: { en: "How much new, useful content can the team really publish: none, a little (about two pieces a month), a steady flow, or a lot?", fa: "\u062A\u06CC\u0645 \u0648\u0627\u0642\u0639\u0627\u064B \u0686\u0642\u062F\u0631 \u0645\u062D\u062A\u0648\u0627\u06CC \u062A\u0627\u0632\u0647 \u0648 \u0645\u0641\u06CC\u062F \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u062F \u0645\u0646\u062A\u0634\u0631 \u06A9\u0646\u062F: \u0647\u06CC\u0686\u060C \u06A9\u0645 (\u062D\u062F\u0648\u062F \u062F\u0648 \u0645\u0637\u0644\u0628 \u062F\u0631 \u0645\u0627\u0647)\u060C \u0645\u0646\u0638\u0645 \u06CC\u0627 \u0632\u06CC\u0627\u062F\u061F", tr: "Ekip ger\xE7ekte ne kadar yeni ve yararl\u0131 i\xE7erik yay\u0131nlayabilir: hi\xE7, az (ayda yakla\u015F\u0131k iki), d\xFCzenli ya da \xE7ok?" },
    why_it_matters: "Content-led strategies fail without production capacity.",
    decision_informed: "Whether a content programme is feasible.",
    choices: ["none", "low", "medium", "high"],
    multi: false,
    depends_on: [],
    skip: always,
    evidence_needed: null,
    priority: 12
  },
  {
    id: "seo.content.firsthand",
    stage: "resources",
    prompt: { en: "Does the brand have first-hand material others cannot copy: its own data, or real expertise?", fa: "\u0622\u06CC\u0627 \u0628\u0631\u0646\u062F \u0645\u0637\u0627\u0644\u0628 \u062F\u0633\u062A\u200C\u0627\u0648\u0644\u06CC \u062F\u0627\u0631\u062F \u06A9\u0647 \u062F\u06CC\u06AF\u0631\u0627\u0646 \u0646\u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u0646\u062F \u06A9\u067E\u06CC \u06A9\u0646\u0646\u062F: \u062F\u0627\u062F\u0647\u0654 \u062E\u0648\u062F\u0634 \u06CC\u0627 \u062A\u062E\u0635\u0635 \u0648\u0627\u0642\u0639\u06CC\u061F", tr: "Markan\u0131n ba\u015Fkalar\u0131n\u0131n kopyalayamayaca\u011F\u0131 birinci elden malzemesi var m\u0131: kendi verisi ya da ger\xE7ek uzmanl\u0131k?" },
    why_it_matters: "Differentiated, people-first material is what a content strategy can stand on.",
    decision_informed: "Content differentiation and answer-worthiness.",
    choices: ["original_data", "expertise", "none"],
    multi: false,
    depends_on: [],
    skip: always,
    evidence_needed: "Examples of the material.",
    priority: 13
  },
  {
    id: "seo.competitors.named",
    stage: "market",
    prompt: { en: "Which competitors or substitutes do people choose instead of you? Names only.", fa: "\u0645\u0631\u062F\u0645 \u0628\u0647\u200C\u062C\u0627\u06CC \u0634\u0645\u0627 \u06A9\u062F\u0627\u0645 \u0631\u0642\u0628\u0627 \u06CC\u0627 \u062C\u0627\u06CC\u06AF\u0632\u06CC\u0646\u200C\u0647\u0627 \u0631\u0627 \u0627\u0646\u062A\u062E\u0627\u0628 \u0645\u06CC\u200C\u06A9\u0646\u0646\u062F\u061F \u0641\u0642\u0637 \u0646\u0627\u0645.", tr: "\u0130nsanlar sizin yerinize hangi rakipleri ya da alternatifleri se\xE7iyor? Yaln\u0131zca adlar." },
    why_it_matters: "Competitors are assumptions until their search presence is checked; names alone are not rankings.",
    decision_informed: "Competitor assumptions to verify.",
    choices: null,
    multi: true,
    depends_on: [],
    skip: always,
    evidence_needed: "A dated check of their search presence, if any.",
    priority: 14
  },
  {
    id: "seo.app.store_status",
    stage: "presence",
    prompt: { en: "Is the app live in the store, or not yet released?", fa: "\u0627\u067E \u062F\u0631 \u0641\u0631\u0648\u0634\u06AF\u0627\u0647 \u0645\u0646\u062A\u0634\u0631 \u0634\u062F\u0647 \u06CC\u0627 \u0647\u0646\u0648\u0632 \u0646\u0647\u061F", tr: "Uygulama ma\u011Fazada yay\u0131nda m\u0131, yoksa hen\xFCz \xE7\u0131kmad\u0131 m\u0131?" },
    why_it_matters: "An unreleased product cannot be promised in search results or listings.",
    decision_informed: "What can be claimed and when.",
    choices: ["live", "prelaunch"],
    multi: false,
    depends_on: ["seo.presence.app"],
    skip: (a) => app(a) === void 0 ? "Waiting for seo.presence.app." : hasApp(a) ? null : "There is no app.",
    evidence_needed: "Store listing URL.",
    priority: 15
  },
  {
    id: "seo.app.web_openness",
    stage: "presence",
    prompt: { en: "Would you build a small official website if search evidence supported it?", fa: "\u0627\u06AF\u0631 \u0634\u0648\u0627\u0647\u062F \u062C\u0633\u062A\u200C\u0648\u062C\u0648 \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u06A9\u0646\u062F\u060C \u06CC\u06A9 \u0648\u0628\u200C\u0633\u0627\u06CC\u062A \u0631\u0633\u0645\u06CC \u06A9\u0648\u0686\u06A9 \u0645\u06CC\u200C\u0633\u0627\u0632\u06CC\u062F\u061F", tr: "Arama kan\u0131tlar\u0131 desteklerse k\xFC\xE7\xFCk bir resmi web sitesi kurar m\u0131s\u0131n\u0131z?" },
    why_it_matters: "Without a site, web search can only reach the brand through store pages and third parties.",
    decision_informed: "Whether a minimal official site is an option.",
    choices: ["yes", "no", "later"],
    multi: false,
    depends_on: ["seo.presence.web", "seo.presence.app"],
    skip: (a) => web(a) === void 0 ? "Waiting for seo.presence.web." : web(a) !== "none" ? "The brand already has a website." : null,
    evidence_needed: null,
    priority: 16
  },
  {
    id: "seo.geo.interest",
    stage: "discovery",
    prompt: { en: "Does being found through AI answer engines (AI search features, chat assistants) matter for this brand?", fa: "\u0622\u06CC\u0627 \u062F\u06CC\u062F\u0647\u200C\u0634\u062F\u0646 \u062F\u0631 \u067E\u0627\u0633\u062E\u200C\u0647\u0627\u06CC \u0645\u0648\u062A\u0648\u0631\u0647\u0627\u06CC \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC (\u0642\u0627\u0628\u0644\u06CC\u062A\u200C\u0647\u0627\u06CC \u062C\u0633\u062A\u200C\u0648\u062C\u0648\u06CC \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC\u060C \u062F\u0633\u062A\u06CC\u0627\u0631\u0647\u0627\u06CC \u06AF\u0641\u062A\u200C\u0648\u06AF\u0648) \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u0628\u0631\u0646\u062F \u0645\u0647\u0645 \u0627\u0633\u062A\u061F", tr: "Yapay zek\xE2 yan\u0131t motorlar\u0131nda (yapay zek\xE2 arama \xF6zellikleri, sohbet asistanlar\u0131) bulunmak bu marka i\xE7in \xF6nemli mi?" },
    why_it_matters: "GEO work is only worth it where people ask assistants about this category.",
    decision_informed: "Whether the plan includes an AI-discovery section.",
    choices: ["yes", "no", "unsure"],
    multi: false,
    depends_on: [],
    skip: always,
    evidence_needed: null,
    priority: 17
  },
  {
    id: "seo.geo.crawler_policy",
    stage: "discovery",
    prompt: { en: "What should AI crawlers be allowed to do with the site: search and training, search only, nothing, or undecided?", fa: "\u062E\u0632\u0646\u062F\u0647\u200C\u0647\u0627\u06CC \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0627\u062C\u0627\u0632\u0647\u0654 \u0686\u0647 \u06A9\u0627\u0631\u06CC \u0628\u0627 \u0633\u0627\u06CC\u062A \u062F\u0627\u0634\u062A\u0647 \u0628\u0627\u0634\u0646\u062F: \u062C\u0633\u062A\u200C\u0648\u062C\u0648 \u0648 \u0622\u0645\u0648\u0632\u0634\u060C \u0641\u0642\u0637 \u062C\u0633\u062A\u200C\u0648\u062C\u0648\u060C \u0647\u06CC\u0686\u060C \u06CC\u0627 \u0647\u0646\u0648\u0632 \u062A\u0635\u0645\u06CC\u0645 \u0646\u06AF\u0631\u0641\u062A\u0647\u200C\u0627\u06CC\u062F\u061F", tr: "Yapay zek\xE2 taray\u0131c\u0131lar\u0131 siteyle ne yapabilsin: arama ve e\u011Fitim, yaln\u0131zca arama, hi\xE7bir \u015Fey ya da karar verilmedi?" },
    why_it_matters: "Search visibility and model training are separate permissions; the owner decides, not the strategist.",
    decision_informed: "Crawler access policy.",
    choices: ["allow_search_and_training", "allow_search_block_training", "block_all", "undecided"],
    multi: false,
    depends_on: ["seo.presence.web", "seo.geo.interest"],
    skip: (a) => needsWeb(a) ?? (single(a["seo.geo.interest"]) === "no" ? "AI discovery is out of scope." : null),
    evidence_needed: null,
    priority: 18
  }
];
var QUESTION_IDS = SEO_QUESTIONS.map((question) => question.id);
function questionById(id) {
  return SEO_QUESTIONS.find((question) => question.id === id);
}
var LOCALE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
var NAME = /^[\p{L}\p{N}][\p{L}\p{N} .&'’-]{0,79}$/u;
var SeoError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "SeoError";
  }
  code;
};
function validateAnswer(id, value) {
  const question = questionById(id);
  if (!question) throw new SeoError("not_found", `No SEO question ${String(id).slice(0, 80)}.`);
  if (value === UNKNOWN || Array.isArray(value) && value.length === 1 && value[0] === UNKNOWN) return UNKNOWN;
  if (question.multi) {
    const items = (Array.isArray(value) ? value : String(value ?? "").split(",")).map((item) => String(item).trim()).filter(Boolean);
    if (items.length === 0 || items.length > 10) throw new SeoError("invalid_input", `${id} takes 1 to 10 items.`);
    const pattern = id === "seo.market.locales" ? LOCALE : NAME;
    for (const item of items) if (!pattern.test(item)) throw new SeoError("invalid_input", `"${item.slice(0, 80)}" is not a valid item for ${id}.`);
    return [...new Set(items)];
  }
  if (typeof value !== "string" || !question.choices?.includes(value)) throw new SeoError("invalid_input", `${id} must be one of ${[...question.choices ?? [], UNKNOWN].join(", ")}.`);
  return value;
}
var INTERVIEW_NOTICE = 'One question at a time. "unknown" is a real answer and is never filled in. Budget is not asked: spend is restricted owner input and an organic search plan does not need it.';
function interviewState(answers) {
  const pending = [];
  const answered = [];
  const unknown = [];
  const skipped = [];
  for (const question of [...SEO_QUESTIONS].sort((a, b) => a.priority - b.priority)) {
    const reason = question.skip(answers);
    if (reason) {
      skipped.push({ id: question.id, reason });
      continue;
    }
    const value = answers[question.id];
    if (value === void 0) pending.push(question);
    else {
      answered.push(question.id);
      if (value === UNKNOWN) unknown.push(question.id);
    }
  }
  const first = pending[0];
  return {
    next: first ? { id: first.id, stage: first.stage, prompt: first.prompt, why_asked: first.why_it_matters, decision_informed: first.decision_informed, choices: first.choices, multi: first.multi } : null,
    pending: pending.map((question) => question.id),
    answered,
    unknown,
    skipped,
    complete: pending.length === 0 && !skipped.some((item) => item.reason.startsWith("Waiting")),
    notice: INTERVIEW_NOTICE
  };
}

// packages/brand-core/src/seo/answers.ts
import path from "node:path";
var SEO_DIR = "brand/.private/strategy/seo";
var INTERVIEW_FILE = `${SEO_DIR}/interview.json`;
function file(ws) {
  return path.join(ws.root, ...INTERVIEW_FILE.split("/"));
}
function readInterview(ws) {
  assertOwnerProcess();
  const target = file(ws);
  const empty = { schema_version: 1, kind: "seo_interview", brand_slug: ws.brandSlug, answers: {}, updated_at: ws.now().toISOString() };
  if (!dirUsable(ws, path.dirname(target))) return empty;
  let raw;
  try {
    raw = safeRead(target, 1024 * 1024);
  } catch (error) {
    if (error instanceof KnowledgeError) throw new SeoError("refused", error.message);
    throw error;
  }
  if (!raw) return empty;
  let doc;
  try {
    doc = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new SeoError("invalid_record", "interview.json is not valid JSON.");
  }
  if (doc?.kind !== "seo_interview" || typeof doc.answers !== "object") throw new SeoError("invalid_record", "interview.json is not an SEO interview record.");
  if (doc.brand_slug !== ws.brandSlug) throw new SeoError("wrong_brand", "interview.json belongs to another brand. It is not read.");
  return doc;
}
function answersOf(record) {
  const out = {};
  for (const [id, entry] of Object.entries(record.answers)) {
    try {
      out[id] = validateAnswer(id, entry.value);
    } catch {
    }
  }
  return out;
}
function recordAnswer(ws, input) {
  assertOwnerProcess();
  const value = validateAnswer(input.question_id, input.value);
  let note = null;
  if (input.words !== void 0 && input.words.trim()) {
    try {
      const captured = captureNote(ws, {
        title: `SEO interview: ${input.question_id}`,
        body: input.words,
        kind: "meeting",
        language: input.language ?? null,
        tags: ["seo-interview"],
        source: { kind: "owner_note", ref: `seo-interview:${input.question_id}` }
      });
      note = { id: captured.id, revision: captured.revision };
    } catch (error) {
      if (error instanceof KnowledgeError) throw new SeoError(error.code === "refused" ? "refused" : "invalid_input", error.message);
      throw error;
    }
  }
  return withLock(ws, "seo-interview", () => {
    const record = readInterview(ws);
    const now = ws.now().toISOString();
    const previous = record.answers[input.question_id];
    const entry = {
      value,
      note,
      answered_at: now,
      history: previous ? [...previous.history, { value: previous.value, note: previous.note, answered_at: previous.answered_at }].slice(-20) : []
    };
    record.answers[input.question_id] = entry;
    record.updated_at = now;
    ensureDir(ws, path.dirname(file(ws)));
    writeVaultFile(ws, file(ws), `${JSON.stringify(record, null, 2)}
`, true);
    return { entry, changed_from: previous ? previous.value : null };
  });
}

// packages/brand-core/src/research/adapters.ts
var NETWORK_ENV = "BRAND_OS_RESEARCH_NETWORK";
var UNAVAILABLE_REASON = `No research adapter is available: live retrieval is off (set ${NETWORK_ENV}=on to allow it) and no recorded research bundle was given.`;
function unavailableAdapter(reason = UNAVAILABLE_REASON) {
  return {
    id: "none",
    capability: (now = /* @__PURE__ */ new Date()) => ({ adapter: "none", state: "unavailable", mode: "none", network: false, reason, checked_at: now.toISOString() }),
    retrieve: async (request) => ({ ok: false, state: "research_unavailable", url: request.url, reason })
  };
}
function pageLastUpdated(text) {
  const match = /Last updated:?\s+(\d{4}-\d{2}-\d{2}(?:\s+UTC)?)/i.exec(text);
  return match ? `Last updated ${match[1]}` : null;
}
function pageTitle(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return null;
  const title = normalizeForQuote(htmlToText(match[1]));
  return title ? title.slice(0, RESEARCH_LIMITS.maxTitleChars) : null;
}
function liveAdapter(opts = {}) {
  const enabled = opts.enabled ?? process.env[NETWORK_ENV] === "on";
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const tool = opts.tool ?? "brand-os live https fetch";
  return {
    id: "live",
    capability: (now = /* @__PURE__ */ new Date()) => enabled ? { adapter: "live", state: "available", mode: "live", network: true, reason: null, checked_at: now.toISOString() } : { adapter: "live", state: "unavailable", mode: "none", network: false, reason: `Live retrieval is off. Set ${NETWORK_ENV}=on to allow HTTPS fetches.`, checked_at: now.toISOString() },
    async retrieve(request, now = /* @__PURE__ */ new Date()) {
      const url = validateUrl(request.url);
      if (!enabled) return { ok: false, state: "research_unavailable", url, reason: `Live retrieval is off. Set ${NETWORK_ENV}=on to allow HTTPS fetches.` };
      const excerpts = request.excerpts.map(validateExcerpt);
      let bytes;
      let finalUrl;
      let contentType;
      try {
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(RESEARCH_LIMITS.fetchTimeoutMs), redirect: "follow", headers: { accept: "text/html,text/plain", "accept-language": request.language ?? "en" } });
        if (!response.ok) return { ok: false, state: "fetch_failed", url, reason: `HTTP ${response.status}` };
        finalUrl = validateUrl(response.url || url, "final_url");
        contentType = response.headers.get("content-type") ?? "";
        if (!/^text\/(html|plain)\b/i.test(contentType)) return { ok: false, state: "fetch_failed", url, reason: `Unsupported content type ${contentType.slice(0, 60) || "none"}.` };
        const declared = Number(response.headers.get("content-length") ?? "0");
        if (declared > RESEARCH_LIMITS.maxPageBytes) return { ok: false, state: "fetch_failed", url, reason: "The page is larger than the research limit." };
        bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > RESEARCH_LIMITS.maxPageBytes) return { ok: false, state: "fetch_failed", url, reason: "The page is larger than the research limit." };
      } catch (error) {
        if (error instanceof ResearchError) return { ok: false, state: "fetch_failed", url, reason: error.message };
        return { ok: false, state: "fetch_failed", url, reason: error instanceof Error ? error.name : "fetch error" };
      }
      const html = bytes.toString("utf8");
      const text = /html/i.test(contentType) ? htmlToText(html) : html;
      const haystack = normalizeForQuote(text);
      const missing = excerpts.filter((excerpt) => !haystack.includes(normalizeForQuote(excerpt.quote)));
      if (missing.length) return { ok: false, state: "quote_not_found", url, reason: `${missing.length} quote(s) are not on the fetched page (${missing.map((item) => item.claim_key).join(", ")}). Nothing was recorded.` };
      const source = validateSource({
        url,
        final_url: finalUrl,
        publisher: request.publisher,
        title: /html/i.test(contentType) ? pageTitle(html) : null,
        source_type: request.source_type,
        tier: request.tier,
        topic: request.topic,
        language: request.language ?? null,
        retrieved_at: now.toISOString(),
        page_last_updated: pageLastUpdated(normalizeForQuote(text)),
        published_at: null,
        tool,
        adapter: "live",
        query: request.query ?? null,
        content_sha256: sha256(bytes),
        quotes_verified: true,
        excerpts
      });
      return { ok: true, source };
    }
  };
}
var BUNDLE_SCHEMA = "brand-os.research-bundle/1";
function parseBundle(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ResearchError("invalid_bundle", "A research bundle must be a JSON object.");
  const doc = raw;
  if (doc.schema !== BUNDLE_SCHEMA) throw new ResearchError("invalid_bundle", `A research bundle needs "schema": "${BUNDLE_SCHEMA}".`);
  if (typeof doc.recorded_with !== "string" || !doc.recorded_with.trim() || doc.recorded_with.length > 160) throw new ResearchError("invalid_bundle", "recorded_with must name the recording tool.");
  if (typeof doc.recorded_at !== "string" || Number.isNaN(Date.parse(doc.recorded_at))) throw new ResearchError("invalid_bundle", "recorded_at must be an ISO date.");
  if (!Array.isArray(doc.sources) || doc.sources.length === 0 || doc.sources.length > 100) throw new ResearchError("invalid_bundle", "sources must list 1 to 100 recorded sources.");
  const sources = doc.sources.map((item, index) => {
    try {
      return validateSource(item);
    } catch (error) {
      throw new ResearchError("invalid_bundle", `sources[${index}]: ${error instanceof Error ? error.message : "invalid"}`);
    }
  });
  for (const source of sources) {
    if (Date.parse(source.retrieved_at) > Date.parse(doc.recorded_at)) throw new ResearchError("invalid_bundle", `${source.url} claims a retrieval after the bundle was recorded.`);
  }
  return { schema: BUNDLE_SCHEMA, recorded_with: doc.recorded_with.trim(), recorded_at: new Date(doc.recorded_at).toISOString(), note: typeof doc.note === "string" ? doc.note.slice(0, 500) : null, sources };
}
function replayAdapter(bundle) {
  return {
    id: "replay",
    capability: (now = /* @__PURE__ */ new Date()) => ({ adapter: "replay", state: "available", mode: "replay", network: false, reason: `Replaying ${bundle.sources.length} source(s) recorded ${bundle.recorded_at.slice(0, 10)} with ${bundle.recorded_with}.`, checked_at: now.toISOString() }),
    async retrieve(request) {
      const url = validateUrl(request.url);
      const source = bundle.sources.find((item) => item.url === url);
      if (!source) return { ok: false, state: "not_recorded", url, reason: "This URL is not in the recorded bundle. Nothing is invented for it." };
      return { ok: true, source: { ...source, adapter: "replay", tool: source.tool } };
    }
  };
}
async function replayAll(bundle, now) {
  const adapter = replayAdapter(bundle);
  const out = [];
  for (const source of bundle.sources) {
    out.push(await adapter.retrieve({ url: source.url, publisher: source.publisher, source_type: source.source_type, tier: source.tier, topic: source.topic, excerpts: source.excerpts }, now));
  }
  return out;
}
function selectAdapter(opts = {}) {
  if (opts.bundle) return replayAdapter(opts.bundle);
  const env = opts.env ?? process.env;
  if (env[NETWORK_ENV] === "on") return liveAdapter({ enabled: true, fetchImpl: opts.fetchImpl });
  return unavailableAdapter();
}
function parseRequests(raw) {
  const list2 = raw?.requests;
  if (!Array.isArray(list2) || list2.length === 0 || list2.length > 100) throw new ResearchError("invalid_input", 'A request file needs "requests": a list of 1 to 100 sources to retrieve.');
  return list2.map((item, index) => {
    if (!item || typeof item !== "object") throw new ResearchError("invalid_input", `requests[${index}] must be an object.`);
    const req = item;
    if (!Array.isArray(req.excerpts) || req.excerpts.length === 0) throw new ResearchError("invalid_input", `requests[${index}] needs excerpts to verify.`);
    return {
      url: validateUrl(req.url),
      publisher: String(req.publisher ?? ""),
      source_type: req.source_type,
      tier: req.tier,
      topic: req.topic,
      language: typeof req.language === "string" ? req.language : null,
      query: typeof req.query === "string" ? req.query : null,
      excerpts: req.excerpts.map(validateExcerpt)
    };
  });
}
async function retrieveAll(adapter, requests, now) {
  const out = [];
  for (const request of requests) out.push(await adapter.retrieve(request, now));
  return out;
}
function toBundle(sources, recordedWith, now, note = null) {
  return parseBundle({ schema: BUNDLE_SCHEMA, recorded_with: recordedWith, recorded_at: now.toISOString(), note, sources });
}

export {
  UNKNOWN,
  single,
  list,
  SeoError,
  interviewState,
  SEO_DIR,
  readInterview,
  answersOf,
  recordAnswer,
  NETWORK_ENV,
  unavailableAdapter,
  parseBundle,
  replayAll,
  selectAdapter,
  parseRequests,
  retrieveAll,
  toBundle
};
