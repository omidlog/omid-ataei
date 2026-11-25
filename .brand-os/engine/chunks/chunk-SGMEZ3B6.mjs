import { createRequire as __engineRequire } from 'node:module'; const require = __engineRequire(import.meta.url);
import {
  brandSettings,
  detectChannels,
  readSources,
  roleGaps,
  splitItems
} from "./chunk-RYBAQB5Q.mjs";
import {
  assertOwnerProcess,
  scanRecords,
  servable
} from "./chunk-S7IDFGBY.mjs";
import {
  CHANNEL_KPI_METRICS,
  CHANNEL_OBJECTIVES,
  CONTENT_CHANNELS,
  CONTENT_FORMATS,
  CONTENT_MIX_TYPES,
  CONTENT_SOURCE_ROLES,
  STRATEGY_LIMITS,
  StrategyError,
  parseProposal,
  readFacts,
  text
} from "./chunk-XUTODDCC.mjs";

// packages/brand-core/src/content-bridge/i18n.ts
var CONTENT_LANGS = ["en", "fa", "tr"];
function contentLang(value, fallback = "en") {
  return typeof value === "string" && CONTENT_LANGS.includes(value) ? value : fallback;
}
function fill(text2, vars = {}) {
  return text2.replace(/\{(\w+)\}/g, (_, key) => vars[key] === void 0 ? `{${key}}` : String(vars[key]));
}
var ROLE_LABELS = {
  voice: { en: "voice", fa: "\u0644\u062D\u0646", tr: "ses tonu" },
  claims: { en: "claims and forbidden language", fa: "\u0627\u062F\u0639\u0627\u0647\u0627 \u0648 \u0632\u0628\u0627\u0646 \u0645\u0645\u0646\u0648\u0639", tr: "iddialar ve yasak dil" },
  audience: { en: "audience", fa: "\u0645\u062E\u0627\u0637\u0628", tr: "hedef kitle" },
  messaging: { en: "messaging", fa: "\u067E\u06CC\u0627\u0645\u200C\u0647\u0627", tr: "mesajlar" },
  pillars: { en: "content pillars", fa: "\u0633\u062A\u0648\u0646\u200C\u0647\u0627\u06CC \u0645\u062D\u062A\u0648\u0627", tr: "i\xE7erik s\xFCtunlar\u0131" },
  channels: { en: "channels", fa: "\u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627", tr: "kanallar" },
  offers: { en: "offers", fa: "\u067E\u06CC\u0634\u0646\u0647\u0627\u062F\u0647\u0627", tr: "teklifler" },
  cta: { en: "calls to action", fa: "\u062F\u0639\u0648\u062A \u0628\u0647 \u0627\u0642\u062F\u0627\u0645", tr: "eylem \xE7a\u011Fr\u0131lar\u0131" },
  languages: { en: "content languages", fa: "\u0632\u0628\u0627\u0646\u200C\u0647\u0627\u06CC \u0645\u062D\u062A\u0648\u0627", tr: "i\xE7erik dilleri" },
  objective: { en: "marketing objective", fa: "\u0647\u062F\u0641 \u0628\u0627\u0632\u0627\u0631\u06CC\u0627\u0628\u06CC", tr: "pazarlama hedefi" }
};
var CHANNEL_PARTS = {
  role: { en: "role", fa: "\u0646\u0642\u0634", tr: "rol\xFC" },
  formats: { en: "formats", fa: "\u0642\u0627\u0644\u0628\u200C\u0647\u0627", tr: "formatlar\u0131" },
  cadence: { en: "cadence", fa: "\u062A\u0646\u0627\u0648\u0628 \u0627\u0646\u062A\u0634\u0627\u0631", tr: "yay\u0131n s\u0131kl\u0131\u011F\u0131" }
};
var PROPOSAL_TEXT = {
  title: { en: "Content strategy", fa: "\u0627\u0633\u062A\u0631\u0627\u062A\u0698\u06CC \u0645\u062D\u062A\u0648\u0627", tr: "\u0130\xE7erik stratejisi" },
  objective: {
    en: "Plan content that serves the approved facts cited here, in the approved voice, on the channels the owner names.",
    fa: "\u0645\u062D\u062A\u0648\u0627\u06CC\u06CC \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0631\u06CC\u0632\u06CC \u0634\u0648\u062F \u06A9\u0647 \u062F\u0631 \u062E\u062F\u0645\u062A \u0648\u0627\u0642\u0639\u06CC\u062A\u200C\u0647\u0627\u06CC \u062A\u0623\u06CC\u06CC\u062F\u0634\u062F\u0647\u0654 \u0627\u0631\u062C\u0627\u0639\u200C\u062F\u0627\u062F\u0647\u200C\u0634\u062F\u0647 \u062F\u0631 \u0627\u06CC\u0646\u062C\u0627 \u0628\u0627\u0634\u062F\u060C \u0628\u0627 \u0644\u062D\u0646 \u062A\u0623\u06CC\u06CC\u062F\u0634\u062F\u0647 \u0648 \u062F\u0631 \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\u06CC\u06CC \u06A9\u0647 \u0645\u0627\u0644\u06A9 \u0646\u0627\u0645 \u0645\u06CC\u200C\u0628\u0631\u062F.",
    tr: "Burada at\u0131f yap\u0131lan onayl\u0131 bilgilere hizmet eden i\xE7erik, onayl\u0131 ses tonuyla ve sahibin belirledi\u011Fi kanallarda planlan\u0131r."
  },
  rationale: {
    en: "Derived from approved facts by brand:content strategy. The owner sets channel roles, formats and cadence before approving.",
    fa: "\u0628\u0627 brand:content strategy \u0627\u0632 \u0648\u0627\u0642\u0639\u06CC\u062A\u200C\u0647\u0627\u06CC \u062A\u0623\u06CC\u06CC\u062F\u0634\u062F\u0647 \u0633\u0627\u062E\u062A\u0647 \u0634\u062F. \u0645\u0627\u0644\u06A9 \u067E\u06CC\u0634 \u0627\u0632 \u062A\u0623\u06CC\u06CC\u062F\u060C \u0646\u0642\u0634\u060C \u0642\u0627\u0644\u0628 \u0648 \u062A\u0646\u0627\u0648\u0628 \u0647\u0631 \u06A9\u0627\u0646\u0627\u0644 \u0631\u0627 \u062A\u0639\u06CC\u06CC\u0646 \u0645\u06CC\u200C\u06A9\u0646\u062F.",
    tr: "brand:content strategy ile onayl\u0131 bilgilerden t\xFCretildi. Sahip, onaylamadan \xF6nce kanal rollerini, formatlar\u0131 ve s\u0131kl\u0131\u011F\u0131 belirler."
  },
  guardrail_facts: {
    en: "Say only what approved facts support; a claim that is not an approved fact is not made.",
    fa: "\u0641\u0642\u0637 \u0686\u06CC\u0632\u06CC \u06AF\u0641\u062A\u0647 \u0634\u0648\u062F \u06A9\u0647 \u0648\u0627\u0642\u0639\u06CC\u062A\u200C\u0647\u0627\u06CC \u062A\u0623\u06CC\u06CC\u062F\u0634\u062F\u0647 \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u0645\u06CC\u200C\u06A9\u0646\u0646\u062F\u061B \u0627\u062F\u0639\u0627\u06CC\u06CC \u06A9\u0647 \u0648\u0627\u0642\u0639\u06CC\u062A \u062A\u0623\u06CC\u06CC\u062F\u0634\u062F\u0647 \u0646\u06CC\u0633\u062A\u060C \u0645\u0637\u0631\u062D \u0646\u0645\u06CC\u200C\u0634\u0648\u062F.",
    tr: "Yaln\u0131zca onayl\u0131 bilgilerin destekledi\u011Fi s\xF6ylenir; onayl\u0131 bilgi olmayan bir iddia yap\u0131lmaz."
  },
  guardrail_voice: {
    en: "Voice comes from the cited voice facts. An agent does not invent a tone, slogan or claim.",
    fa: "\u0644\u062D\u0646 \u0627\u0632 \u0648\u0627\u0642\u0639\u06CC\u062A\u200C\u0647\u0627\u06CC \u0644\u062D\u0646\u0650 \u0627\u0631\u062C\u0627\u0639\u200C\u062F\u0627\u062F\u0647\u200C\u0634\u062F\u0647 \u0645\u06CC\u200C\u0622\u06CC\u062F. \u0639\u0627\u0645\u0644 \u0647\u0648\u0634\u0645\u0646\u062F \u0644\u062D\u0646\u060C \u0634\u0639\u0627\u0631 \u06CC\u0627 \u0627\u062F\u0639\u0627\u06CC\u06CC \u0646\u0645\u06CC\u200C\u0633\u0627\u0632\u062F.",
    tr: "Ses tonu, at\u0131f yap\u0131lan ses bilgilerine dayan\u0131r. Bir ajan ton, slogan veya iddia uydurmaz."
  },
  non_goal_publish: {
    en: "Posting, scheduling or publishing on any network",
    fa: "\u0627\u0631\u0633\u0627\u0644\u060C \u0632\u0645\u0627\u0646\u200C\u0628\u0646\u062F\u06CC \u06CC\u0627 \u0627\u0646\u062A\u0634\u0627\u0631 \u062F\u0631 \u0647\u0631 \u0634\u0628\u06A9\u0647\u200C\u0627\u06CC",
    tr: "Herhangi bir a\u011Fda payla\u015F\u0131m, zamanlama veya yay\u0131n"
  },
  non_goal_ads: {
    en: "Ad spend or paid promotion",
    fa: "\u0647\u0632\u06CC\u0646\u0647\u0654 \u062A\u0628\u0644\u06CC\u063A\u0627\u062A \u06CC\u0627 \u062A\u0628\u0644\u06CC\u063A \u067E\u0648\u0644\u06CC",
    tr: "Reklam harcamas\u0131 veya \xFCcretli tan\u0131t\u0131m"
  }
};
var GAP_TEXT = {
  not_approved: {
    en: "No approved fact covers {role}. Answer {facts}, then approve it (brand:review, brand:approve).",
    fa: "\u0647\u06CC\u0686 \u0648\u0627\u0642\u0639\u06CC\u062A \u062A\u0623\u06CC\u06CC\u062F\u0634\u062F\u0647\u200C\u0627\u06CC {role} \u0631\u0627 \u067E\u0648\u0634\u0634 \u0646\u0645\u06CC\u200C\u062F\u0647\u062F. \u0628\u0647 {facts} \u067E\u0627\u0633\u062E \u062F\u0647\u06CC\u062F \u0648 \u0633\u067E\u0633 \u062A\u0623\u06CC\u06CC\u062F\u0634 \u06A9\u0646\u06CC\u062F (brand:review\u060C brand:approve).",
    tr: "{role} i\xE7in onayl\u0131 bir bilgi yok. {facts} sorusunu yan\u0131tlay\u0131n, sonra onaylay\u0131n (brand:review, brand:approve)."
  },
  placeholder: {
    en: "The approved fact for {role} says it is not decided yet ({facts}). Nothing is assumed in its place.",
    fa: "\u0648\u0627\u0642\u0639\u06CC\u062A \u062A\u0623\u06CC\u06CC\u062F\u0634\u062F\u0647 \u0628\u0631\u0627\u06CC {role} \u0645\u06CC\u200C\u06AF\u0648\u06CC\u062F \u0647\u0646\u0648\u0632 \u062A\u0635\u0645\u06CC\u0645\u06CC \u06AF\u0631\u0641\u062A\u0647 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A ({facts}). \u0686\u06CC\u0632\u06CC \u0628\u0647 \u062C\u0627\u06CC \u0622\u0646 \u0641\u0631\u0636 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F.",
    tr: "{role} i\xE7in onayl\u0131 bilgi hen\xFCz karar verilmedi\u011Fini s\xF6yl\xFCyor ({facts}). Yerine hi\xE7bir \u015Fey varsay\u0131lmaz."
  },
  channel_role: {
    en: "Write what {channel} is for (role) in the proposal file before approving.",
    fa: "\u067E\u06CC\u0634 \u0627\u0632 \u062A\u0623\u06CC\u06CC\u062F\u060C \u062F\u0631 \u0641\u0627\u06CC\u0644 \u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F {channel} \u0628\u0631\u0627\u06CC \u0686\u06CC\u0633\u062A (\u0646\u0642\u0634).",
    tr: "Onaylamadan \xF6nce \xF6neri dosyas\u0131na {channel} kanal\u0131n\u0131n ne i\xE7in oldu\u011Funu (rol) yaz\u0131n."
  },
  channel_formats: {
    en: "Choose the formats for {channel} (--formats or the proposal file).",
    fa: "\u0642\u0627\u0644\u0628\u200C\u0647\u0627\u06CC {channel} \u0631\u0627 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F (--formats \u06CC\u0627 \u0641\u0627\u06CC\u0644 \u067E\u06CC\u0634\u0646\u0647\u0627\u062F).",
    tr: "{channel} i\xE7in formatlar\u0131 se\xE7in (--formats veya \xF6neri dosyas\u0131)."
  },
  channel_cadence: {
    en: "Decide how often {channel} posts (--cadence or the proposal file). It stays unknown until then.",
    fa: "\u062A\u0639\u06CC\u06CC\u0646 \u06A9\u0646\u06CC\u062F {channel} \u0647\u0631 \u0686\u0646\u062F \u0648\u0642\u062A \u06CC\u06A9 \u0628\u0627\u0631 \u0645\u0646\u062A\u0634\u0631 \u06A9\u0646\u062F (--cadence \u06CC\u0627 \u0641\u0627\u06CC\u0644 \u067E\u06CC\u0634\u0646\u0647\u0627\u062F). \u062A\u0627 \u0622\u0646 \u0632\u0645\u0627\u0646 \u0646\u0627\u0645\u0634\u062E\u0635 \u0645\u06CC\u200C\u0645\u0627\u0646\u062F.",
    tr: "{channel} kanal\u0131n\u0131n ne s\u0131kl\u0131kla payla\u015F\u0131m yapaca\u011F\u0131na karar verin (--cadence veya \xF6neri dosyas\u0131). O zamana kadar bilinmiyor kal\u0131r."
  },
  pillars_unnamed: {
    en: "The approved pillars ({facts}) could not be split into short names. Name the pillars in the proposal file.",
    fa: "\u0633\u062A\u0648\u0646\u200C\u0647\u0627\u06CC \u062A\u0623\u06CC\u06CC\u062F\u0634\u062F\u0647 ({facts}) \u0628\u0647 \u0646\u0627\u0645\u200C\u0647\u0627\u06CC \u06A9\u0648\u062A\u0627\u0647 \u062A\u0642\u0633\u06CC\u0645 \u0646\u0634\u062F\u0646\u062F. \u0646\u0627\u0645 \u0633\u062A\u0648\u0646\u200C\u0647\u0627 \u0631\u0627 \u062F\u0631 \u0641\u0627\u06CC\u0644 \u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F.",
    tr: "Onayl\u0131 s\xFCtunlar ({facts}) k\u0131sa adlara b\xF6l\xFCnemedi. S\xFCtunlar\u0131 \xF6neri dosyas\u0131nda adland\u0131r\u0131n."
  },
  channels_none: {
    en: "No channel was named. Name channels with --channels, or approve {facts} with the channels you use.",
    fa: "\u0647\u06CC\u0686 \u06A9\u0627\u0646\u0627\u0644\u06CC \u0646\u0627\u0645 \u0628\u0631\u062F\u0647 \u0646\u0634\u062F. \u0628\u0627 --channels \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627 \u0631\u0627 \u0646\u0627\u0645 \u0628\u0628\u0631\u06CC\u062F \u06CC\u0627 {facts} \u0631\u0627 \u0628\u0627 \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\u06CC\u06CC \u06A9\u0647 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0645\u06CC\u200C\u06A9\u0646\u06CC\u062F \u062A\u0623\u06CC\u06CC\u062F \u06A9\u0646\u06CC\u062F.",
    tr: "Hi\xE7 kanal belirtilmedi. Kanallar\u0131 --channels ile belirtin veya kulland\u0131\u011F\u0131n\u0131z kanallarla {facts} bilgisini onaylay\u0131n."
  }
};
var NOTES = {
  channels_detected: {
    en: 'Channels {list} were read from the wording of the approved channel facts. Check them; clauses with "no" or "not" were skipped.',
    fa: "\u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\u06CC {list} \u0627\u0632 \u0645\u062A\u0646 \u0648\u0627\u0642\u0639\u06CC\u062A\u200C\u0647\u0627\u06CC \u062A\u0623\u06CC\u06CC\u062F\u0634\u062F\u0647\u0654 \u06A9\u0627\u0646\u0627\u0644 \u062E\u0648\u0627\u0646\u062F\u0647 \u0634\u062F\u0646\u062F. \u0628\u0631\u0631\u0633\u06CC\u200C\u0634\u0627\u0646 \u06A9\u0646\u06CC\u062F\u061B \u0639\u0628\u0627\u0631\u062A\u200C\u0647\u0627\u06CC \u062F\u0627\u0631\u0627\u06CC \xAB\u0646\u0647\xBB \u06CC\u0627 \xAB\u0628\u062F\u0648\u0646\xBB \u0646\u0627\u062F\u06CC\u062F\u0647 \u06AF\u0631\u0641\u062A\u0647 \u0634\u062F\u0646\u062F.",
    tr: '{list} kanallar\u0131 onayl\u0131 kanal bilgilerinin metninden okundu. Kontrol edin; "hay\u0131r" veya "de\u011Fil" i\xE7eren ifadeler atland\u0131.'
  },
  channel_not_in_facts: {
    en: "{channel} is your choice; no approved channel fact mentions it, so it cites no fact.",
    fa: "{channel} \u0627\u0646\u062A\u062E\u0627\u0628 \u0634\u0645\u0627\u0633\u062A\u061B \u0647\u06CC\u0686 \u0648\u0627\u0642\u0639\u06CC\u062A \u062A\u0623\u06CC\u06CC\u062F\u0634\u062F\u0647\u0654 \u06A9\u0627\u0646\u0627\u0644\u06CC \u0628\u0647 \u0622\u0646 \u0627\u0634\u0627\u0631\u0647 \u0646\u0645\u06CC\u200C\u06A9\u0646\u062F\u060C \u067E\u0633 \u0628\u0647 \u0648\u0627\u0642\u0639\u06CC\u062A\u06CC \u0627\u0631\u062C\u0627\u0639 \u0646\u062F\u0627\u0631\u062F.",
    tr: "{channel} sizin se\xE7iminiz; onayl\u0131 hi\xE7bir kanal bilgisi ondan s\xF6z etmiyor, bu y\xFCzden bir bilgiye at\u0131f yapm\u0131yor."
  },
  languages_default: {
    en: "Content languages default to the brand default locale ({lang}). Set them with --languages.",
    fa: "\u0632\u0628\u0627\u0646\u200C\u0647\u0627\u06CC \u0645\u062D\u062A\u0648\u0627 \u0628\u0647\u200C\u0637\u0648\u0631 \u067E\u06CC\u0634\u200C\u0641\u0631\u0636 \u0632\u0628\u0627\u0646 \u0627\u0635\u0644\u06CC \u0628\u0631\u0646\u062F ({lang}) \u0627\u0633\u062A. \u0628\u0627 --languages \u062A\u0639\u06CC\u06CC\u0646\u0634\u0627\u0646 \u06A9\u0646\u06CC\u062F.",
    tr: "\u0130\xE7erik dilleri varsay\u0131lan olarak markan\u0131n varsay\u0131lan dilidir ({lang}). --languages ile belirleyin."
  },
  pillar_skipped: {
    en: "A part of {id} was longer than a pillar name or was refused by the safety check; it was left out.",
    fa: "\u0628\u062E\u0634\u06CC \u0627\u0632 {id} \u0628\u0644\u0646\u062F\u062A\u0631 \u0627\u0632 \u0646\u0627\u0645 \u06CC\u06A9 \u0633\u062A\u0648\u0646 \u0628\u0648\u062F \u06CC\u0627 \u0628\u0631\u0631\u0633\u06CC \u0627\u06CC\u0645\u0646\u06CC \u0622\u0646 \u0631\u0627 \u0631\u062F \u06A9\u0631\u062F\u061B \u06A9\u0646\u0627\u0631 \u06AF\u0630\u0627\u0634\u062A\u0647 \u0634\u062F.",
    tr: "{id} bilgisinin bir b\xF6l\xFCm\xFC s\xFCtun ad\u0131 i\xE7in fazla uzundu veya g\xFCvenlik denetiminden ge\xE7medi; d\u0131\u015Far\u0131da b\u0131rak\u0131ld\u0131."
  },
  strategies_pinned: {
    en: "Pinned the approved strategies served now: {list}. If one is replaced, this content strategy needs review.",
    fa: "\u0627\u0633\u062A\u0631\u0627\u062A\u0698\u06CC\u200C\u0647\u0627\u06CC \u062A\u0623\u06CC\u06CC\u062F\u0634\u062F\u0647\u0654 \u0641\u0639\u0644\u06CC \u067E\u06CC\u0646 \u0634\u062F\u0646\u062F: {list}. \u0627\u06AF\u0631 \u06CC\u06A9\u06CC \u062C\u0627\u06CC\u06AF\u0632\u06CC\u0646 \u0634\u0648\u062F\u060C \u0627\u06CC\u0646 \u0627\u0633\u062A\u0631\u0627\u062A\u0698\u06CC \u0645\u062D\u062A\u0648\u0627 \u0646\u06CC\u0627\u0632 \u0628\u0647 \u0628\u0627\u0632\u0628\u06CC\u0646\u06CC \u062F\u0627\u0631\u062F.",
    tr: "\u015Eu anda sunulan onayl\u0131 stratejiler sabitlendi: {list}. Biri de\u011Fi\u015Firse bu i\xE7erik stratejisinin g\xF6zden ge\xE7irilmesi gerekir."
  },
  voice_not_copied: {
    en: "Voice, audience, messaging and claims are cited by fact id and resolved at read time. Nothing was rewritten or invented.",
    fa: "\u0644\u062D\u0646\u060C \u0645\u062E\u0627\u0637\u0628\u060C \u067E\u06CC\u0627\u0645\u200C\u0647\u0627 \u0648 \u0627\u062F\u0639\u0627\u0647\u0627 \u0628\u0627 \u0634\u0646\u0627\u0633\u0647\u0654 \u0648\u0627\u0642\u0639\u06CC\u062A \u0627\u0631\u062C\u0627\u0639 \u062F\u0627\u062F\u0647 \u0634\u062F\u0647\u200C\u0627\u0646\u062F \u0648 \u0647\u0646\u06AF\u0627\u0645 \u062E\u0648\u0627\u0646\u062F\u0646 \u0627\u0632 \u0648\u0627\u0642\u0639\u06CC\u062A\u200C\u0647\u0627 \u062E\u0648\u0627\u0646\u062F\u0647 \u0645\u06CC\u200C\u0634\u0648\u0646\u062F. \u0686\u06CC\u0632\u06CC \u0628\u0627\u0632\u0646\u0648\u06CC\u0633\u06CC \u06CC\u0627 \u0633\u0627\u062E\u062A\u0647 \u0646\u0634\u062F.",
    tr: "Ses tonu, hedef kitle, mesajlar ve iddialar bilgi kimli\u011Fiyle at\u0131f yap\u0131l\u0131r ve okuma an\u0131nda \xE7\xF6z\xFCl\xFCr. Hi\xE7bir \u015Fey yeniden yaz\u0131lmad\u0131 veya uydurulmad\u0131."
  }
};
var AVAILABILITY_RULES = {
  "do-not-claim": {
    en: "Do not say or imply that the product is available.",
    fa: "\u0646\u06AF\u0648\u06CC\u06CC\u062F \u0648 \u0627\u0644\u0642\u0627 \u0646\u06A9\u0646\u06CC\u062F \u06A9\u0647 \u0645\u062D\u0635\u0648\u0644 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0627\u0633\u062A.",
    tr: "\xDCr\xFCn\xFCn mevcut oldu\u011Funu s\xF6ylemeyin veya ima etmeyin."
  },
  "coming-soon": {
    en: 'At most say "coming soon". Never say "available now".',
    fa: "\u062D\u062F\u0627\u06A9\u062B\u0631 \u0628\u06AF\u0648\u06CC\u06CC\u062F \xAB\u0628\u0647\u200C\u0632\u0648\u062F\u06CC\xBB. \u0647\u0631\u06AF\u0632 \u0646\u06AF\u0648\u06CC\u06CC\u062F \xAB\u0627\u06A9\u0646\u0648\u0646 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0627\u0633\u062A\xBB.",
    tr: 'En fazla "yak\u0131nda" deyin. Asla "\u015Fimdi mevcut" demeyin.'
  },
  available: {
    en: "Availability may be stated as approved.",
    fa: "\u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0628\u0648\u062F\u0646 \u0631\u0627 \u0645\u06CC\u200C\u062A\u0648\u0627\u0646 \u0647\u0645\u0627\u0646\u200C\u0637\u0648\u0631 \u06A9\u0647 \u062A\u0623\u06CC\u06CC\u062F \u0634\u062F\u0647 \u0628\u06CC\u0627\u0646 \u06A9\u0631\u062F.",
    tr: "Bulunurluk onayland\u0131\u011F\u0131 \u015Fekilde belirtilebilir."
  }
};
var VIEW_NOTICE = {
  en: [
    "Owner view of the approved content strategy. Drafts are never shown; a draft is counted under withheld.",
    "Voice, audience, messaging and claims are the approved facts, resolved now at the cited revisions.",
    "It authorizes no post, schedule, publication, ad or spend (authorizes: [])."
  ],
  fa: [
    "\u0646\u0645\u0627\u06CC \u0645\u0627\u0644\u06A9 \u0627\u0632 \u0627\u0633\u062A\u0631\u0627\u062A\u0698\u06CC \u0645\u062D\u062A\u0648\u0627\u06CC \u062A\u0623\u06CC\u06CC\u062F\u0634\u062F\u0647. \u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633\u200C\u0647\u0627 \u0647\u0631\u06AF\u0632 \u0646\u0634\u0627\u0646 \u062F\u0627\u062F\u0647 \u0646\u0645\u06CC\u200C\u0634\u0648\u0646\u062F \u0648 \u0641\u0642\u0637 \u0632\u06CC\u0631 withheld \u0634\u0645\u0631\u062F\u0647 \u0645\u06CC\u200C\u0634\u0648\u0646\u062F.",
    "\u0644\u062D\u0646\u060C \u0645\u062E\u0627\u0637\u0628\u060C \u067E\u06CC\u0627\u0645\u200C\u0647\u0627 \u0648 \u0627\u062F\u0639\u0627\u0647\u0627 \u0647\u0645\u0627\u0646 \u0648\u0627\u0642\u0639\u06CC\u062A\u200C\u0647\u0627\u06CC \u062A\u0623\u06CC\u06CC\u062F\u0634\u062F\u0647\u200C\u0627\u0646\u062F \u06A9\u0647 \u0627\u06A9\u0646\u0648\u0646 \u062F\u0631 \u0646\u0633\u062E\u0647\u200C\u0647\u0627\u06CC \u0627\u0631\u062C\u0627\u0639\u200C\u062F\u0627\u062F\u0647\u200C\u0634\u062F\u0647 \u062E\u0648\u0627\u0646\u062F\u0647 \u0634\u062F\u0647\u200C\u0627\u0646\u062F.",
    "\u0647\u06CC\u0686 \u0627\u0631\u0633\u0627\u0644\u060C \u0632\u0645\u0627\u0646\u200C\u0628\u0646\u062F\u06CC\u060C \u0627\u0646\u062A\u0634\u0627\u0631\u060C \u062A\u0628\u0644\u06CC\u063A \u06CC\u0627 \u0647\u0632\u06CC\u0646\u0647\u200C\u0627\u06CC \u0631\u0627 \u0645\u062C\u0627\u0632 \u0646\u0645\u06CC\u200C\u06A9\u0646\u062F (authorizes: [])."
  ],
  tr: [
    "Onayl\u0131 i\xE7erik stratejisinin sahip g\xF6r\xFCn\xFCm\xFC. Taslaklar asla g\xF6sterilmez; taslak withheld alt\u0131nda say\u0131l\u0131r.",
    "Ses tonu, hedef kitle, mesajlar ve iddialar, at\u0131f yap\u0131lan s\xFCr\xFCmlerde \u015Fimdi \xE7\xF6z\xFClen onayl\u0131 bilgilerdir.",
    "Hi\xE7bir payla\u015F\u0131m, zamanlama, yay\u0131n, reklam veya harcamaya izin vermez (authorizes: [])."
  ]
};
var CLI_TEXT = {
  draft_header: { en: "Content strategy proposal (draft, not stored)", fa: "\u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u0627\u0633\u062A\u0631\u0627\u062A\u0698\u06CC \u0645\u062D\u062A\u0648\u0627 (\u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633\u060C \u0630\u062E\u06CC\u0631\u0647 \u0646\u0634\u062F\u0647)", tr: "\u0130\xE7erik stratejisi \xF6nerisi (taslak, kaydedilmedi)" },
  sources: { en: "Sources", fa: "\u0645\u0646\u0627\u0628\u0639", tr: "Kaynaklar" },
  gaps: { en: "Gaps (nothing is assumed in their place)", fa: "\u06A9\u0645\u0628\u0648\u062F\u0647\u0627 (\u0686\u06CC\u0632\u06CC \u0628\u0647 \u062C\u0627\u06CC \u0622\u0646\u200C\u0647\u0627 \u0641\u0631\u0636 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F)", tr: "Eksikler (yerlerine hi\xE7bir \u015Fey varsay\u0131lmaz)" },
  no_gaps: { en: "No gaps.", fa: "\u06A9\u0645\u0628\u0648\u062F\u06CC \u0646\u06CC\u0633\u062A.", tr: "Eksik yok." },
  pillars: { en: "Pillars", fa: "\u0633\u062A\u0648\u0646\u200C\u0647\u0627", tr: "S\xFCtunlar" },
  channels: { en: "Channels", fa: "\u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627", tr: "Kanallar" },
  notes: { en: "Notes", fa: "\u06CC\u0627\u062F\u062F\u0627\u0634\u062A\u200C\u0647\u0627", tr: "Notlar" },
  written: {
    en: "Proposal written to {list}. Edit it, then: npm run brand:strategy -- propose --id {id} --file {list}",
    fa: "\u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u062F\u0631 {list} \u0646\u0648\u0634\u062A\u0647 \u0634\u062F. \u0648\u06CC\u0631\u0627\u06CC\u0634\u0634 \u06A9\u0646\u06CC\u062F\u060C \u0633\u067E\u0633: npm run brand:strategy -- propose --id {id} --file {list}",
    tr: "\xD6neri {list} dosyas\u0131na yaz\u0131ld\u0131. D\xFCzenleyin, sonra: npm run brand:strategy -- propose --id {id} --file {list}"
  },
  stored: {
    en: "Stored draft {id} revision {n}. Agents and the content view cannot see it. Review: npm run brand:strategy -- review --id {id} --revision {n}",
    fa: "\u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633 {id} \u0646\u0633\u062E\u0647\u0654 {n} \u0630\u062E\u06CC\u0631\u0647 \u0634\u062F. \u0639\u0627\u0645\u0644\u200C\u0647\u0627 \u0648 \u0646\u0645\u0627\u06CC \u0645\u062D\u062A\u0648\u0627 \u0622\u0646 \u0631\u0627 \u0646\u0645\u06CC\u200C\u0628\u06CC\u0646\u0646\u062F. \u0628\u0627\u0632\u0628\u06CC\u0646\u06CC: npm run brand:strategy -- review --id {id} --revision {n}",
    tr: "{id} tasla\u011F\u0131, s\xFCr\xFCm {n} kaydedildi. Ajanlar ve i\xE7erik g\xF6r\xFCn\xFCm\xFC onu g\xF6remez. \u0130nceleme: npm run brand:strategy -- review --id {id} --revision {n}"
  },
  store_hint: {
    en: "Nothing was stored. Add --out <file> to edit it first, or --store to store it as a draft now.",
    fa: "\u0686\u06CC\u0632\u06CC \u0630\u062E\u06CC\u0631\u0647 \u0646\u0634\u062F. \u0628\u0631\u0627\u06CC \u0648\u06CC\u0631\u0627\u06CC\u0634\u060C --out <file> \u0631\u0627 \u0627\u0636\u0627\u0641\u0647 \u06A9\u0646\u06CC\u062F \u06CC\u0627 \u0628\u0627 --store \u0647\u0645\u06CC\u0646 \u062D\u0627\u0644\u0627 \u0622\u0646 \u0631\u0627 \u0628\u0647\u200C\u0639\u0646\u0648\u0627\u0646 \u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633 \u0630\u062E\u06CC\u0631\u0647 \u06A9\u0646\u06CC\u062F.",
    tr: "Hi\xE7bir \u015Fey kaydedilmedi. \xD6nce d\xFCzenlemek i\xE7in --out <file> ekleyin veya \u015Fimdi taslak olarak kaydetmek i\xE7in --store kullan\u0131n."
  },
  none_approved: {
    en: "No approved content strategy is served now.",
    fa: "\u062F\u0631 \u062D\u0627\u0644 \u062D\u0627\u0636\u0631 \u0647\u06CC\u0686 \u0627\u0633\u062A\u0631\u0627\u062A\u0698\u06CC \u0645\u062D\u062A\u0648\u0627\u06CC \u062A\u0623\u06CC\u06CC\u062F\u0634\u062F\u0647\u200C\u0627\u06CC \u0627\u0631\u0627\u0626\u0647 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F.",
    tr: "\u015Eu anda sunulan onayl\u0131 bir i\xE7erik stratejisi yok."
  },
  withheld: { en: "Not shown", fa: "\u0646\u0634\u0627\u0646 \u062F\u0627\u062F\u0647 \u0646\u0634\u062F\u0647", tr: "G\xF6sterilmeyen" },
  voice: { en: "Voice", fa: "\u0644\u062D\u0646", tr: "Ses tonu" },
  do: { en: "Do", fa: "\u0627\u0646\u062C\u0627\u0645 \u0628\u062F\u0647", tr: "Yap" },
  dont: { en: "Don\u2019t", fa: "\u0627\u0646\u062C\u0627\u0645 \u0646\u062F\u0647", tr: "Yapma" },
  banned: { en: "Never claim or say", fa: "\u0647\u0631\u06AF\u0632 \u0627\u062F\u0639\u0627 \u0646\u06A9\u0646\u06CC\u062F \u06CC\u0627 \u0646\u06AF\u0648\u06CC\u06CC\u062F", tr: "Asla iddia etmeyin veya s\xF6ylemeyin" },
  not_decided: { en: "not decided", fa: "\u062A\u0639\u06CC\u06CC\u0646 \u0646\u0634\u062F\u0647", tr: "karar verilmedi" },
  all: { en: "all", fa: "\u0647\u0645\u0647", tr: "t\xFCm\xFC" }
};

// packages/brand-core/src/content-bridge/channel-playbook.ts
var CONTENT_PLAYBOOK_SCHEMA = "brand-os/content-playbook/v1";
var mix = (shares) => CONTENT_MIX_TYPES.filter((type) => shares[type]).map((type) => ({ type, share: shares[type] }));
var ENTRIES = [
  {
    channel: "instagram",
    basis: "general_practice",
    role: {
      en: "Discovery and trust: short videos to reach new people, carousels and stories to keep followers close.",
      fa: "\u062F\u06CC\u062F\u0647\u200C\u0634\u062F\u0646 \u0648 \u0627\u0639\u062A\u0645\u0627\u062F\u0633\u0627\u0632\u06CC: \u0648\u06CC\u062F\u06CC\u0648\u0647\u0627\u06CC \u06A9\u0648\u062A\u0627\u0647 \u0628\u0631\u0627\u06CC \u0631\u0633\u06CC\u062F\u0646 \u0628\u0647 \u0622\u062F\u0645\u200C\u0647\u0627\u06CC \u062A\u0627\u0632\u0647\u060C \u06A9\u0631\u0648\u0633\u0644 \u0648 \u0627\u0633\u062A\u0648\u0631\u06CC \u0628\u0631\u0627\u06CC \u0646\u0632\u062F\u06CC\u06A9 \u0646\u06AF\u0647 \u062F\u0627\u0634\u062A\u0646 \u062F\u0646\u0628\u0627\u0644\u200C\u06A9\u0646\u0646\u062F\u0647\u200C\u0647\u0627.",
      tr: "Ke\u015Ffedilme ve g\xFCven: yeni insanlara ula\u015Fmak i\xE7in k\u0131sa videolar, takip\xE7ileri yak\u0131n tutmak i\xE7in karuseller ve hik\xE2yeler."
    },
    formats: ["reel", "carousel", "story", "post"],
    cadence: { per: "week", min: 3, max: 5, start: 3 },
    objective: "awareness",
    mix: mix({ educate: 40, inspire: 20, connect: 20, promote: 10, entertain: 10 }),
    kpis: [
      { metric: "reach", per: "post" },
      { metric: "saves", per: "post" },
      { metric: "shares", per: "post" },
      { metric: "follows", per: "week" },
      { metric: "profile_visits", per: "week" }
    ],
    posting_windows_note: {
      en: "Weekday evenings and lunch breaks in your audience's time zone are a common start; move to what your own Insights show after about a month.",
      fa: "\u0639\u0635\u0631\u0647\u0627\u06CC \u0631\u0648\u0632\u0647\u0627\u06CC \u06A9\u0627\u0631\u06CC \u0648 \u0648\u0642\u062A \u0646\u0627\u0647\u0627\u0631\u060C \u0628\u0647 \u0648\u0642\u062A \u0645\u062D\u0644\u06CC \u0645\u062E\u0627\u0637\u0628\u060C \u0634\u0631\u0648\u0639 \u0631\u0627\u06CC\u062C\u06CC \u0627\u0633\u062A\u061B \u0628\u0639\u062F \u0627\u0632 \u062D\u062F\u0648\u062F \u06CC\u06A9 \u0645\u0627\u0647 \u0628\u0631 \u0627\u0633\u0627\u0633 Insights \u062E\u0648\u062F\u062A\u0627\u0646 \u062C\u0627\u0628\u0647\u200C\u062C\u0627 \u06A9\u0646\u06CC\u062F.",
      tr: "Hedef kitlenizin saat diliminde hafta i\xE7i ak\u015Famlar\u0131 ve \xF6\u011Fle aralar\u0131 yayg\u0131n bir ba\u015Flang\u0131\xE7t\u0131r; yakla\u015F\u0131k bir ay sonra kendi Insights verilerinize g\xF6re kayd\u0131r\u0131n."
    },
    craft: [
      {
        en: "Reels are the main reach format: put the hook in the first 3 seconds, before any logo or intro.",
        fa: "\u0631\u06CC\u0644\u0632 \u0627\u0635\u0644\u06CC\u200C\u062A\u0631\u06CC\u0646 \u0642\u0627\u0644\u0628 \u0628\u0631\u0627\u06CC \u062F\u06CC\u062F\u0647\u200C\u0634\u062F\u0646 \u0627\u0633\u062A: \u0642\u0644\u0627\u0628 \u0631\u0627 \u062F\u0631 \u06F3 \u062B\u0627\u0646\u06CC\u0647\u0654 \u0627\u0648\u0644 \u0628\u06AF\u0630\u0627\u0631\u06CC\u062F\u060C \u0642\u0628\u0644 \u0627\u0632 \u0647\u0631 \u0644\u0648\u06AF\u0648 \u06CC\u0627 \u0645\u0642\u062F\u0645\u0647\u200C\u0627\u06CC.",
        tr: "Reels eri\u015Fimin ana format\u0131d\u0131r: kancay\u0131 ilk 3 saniyeye, her t\xFCrl\xFC logo ya da giri\u015Ften \xF6nce koyun."
      },
      {
        en: "Carousels earn saves: one idea per slide, a clear first slide, a recap or checklist near the end.",
        fa: "\u06A9\u0631\u0648\u0633\u0644 \u0630\u062E\u06CC\u0631\u0647 \u0645\u06CC\u200C\u06AF\u06CC\u0631\u062F: \u0647\u0631 \u0627\u0633\u0644\u0627\u06CC\u062F \u06CC\u06A9 \u0627\u06CC\u062F\u0647\u060C \u0627\u0633\u0644\u0627\u06CC\u062F \u0627\u0648\u0644 \u0631\u0648\u0634\u0646 \u0648 \u06AF\u0648\u06CC\u0627\u060C \u0648 \u06CC\u06A9 \u062C\u0645\u0639\u200C\u0628\u0646\u062F\u06CC \u06CC\u0627 \u0686\u06A9\u200C\u0644\u06CC\u0633\u062A \u0646\u0632\u062F\u06CC\u06A9 \u0627\u0646\u062A\u0647\u0627\u06CC \u0622\u0646.",
        tr: "Karuseller kaydedilme getirir: her slaytta tek fikir, net bir ilk slayt, sona do\u011Fru bir \xF6zet ya da kontrol listesi."
      },
      {
        en: "Keep captions on in videos; many people watch without sound.",
        fa: "\u0632\u06CC\u0631\u0646\u0648\u06CC\u0633 \u0648\u06CC\u062F\u06CC\u0648\u0647\u0627 \u0631\u0627 \u0631\u0648\u0634\u0646 \u0646\u06AF\u0647 \u062F\u0627\u0631\u06CC\u062F\u061B \u062E\u06CC\u0644\u06CC\u200C\u0647\u0627 \u0628\u06CC\u200C\u0635\u062F\u0627 \u062A\u0645\u0627\u0634\u0627 \u0645\u06CC\u200C\u06A9\u0646\u0646\u062F.",
        tr: "Videolarda altyaz\u0131y\u0131 a\xE7\u0131k tutun; bir\xE7ok ki\u015Fi sesi kapal\u0131 izler."
      },
      {
        en: "Use stories for day-to-day connection (polls, questions, behind the scenes); they keep existing followers close.",
        fa: "\u0627\u0632 \u0627\u0633\u062A\u0648\u0631\u06CC \u0628\u0631\u0627\u06CC \u0627\u0631\u062A\u0628\u0627\u0637 \u0631\u0648\u0632\u0645\u0631\u0647 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F (\u0646\u0638\u0631\u0633\u0646\u062C\u06CC\u060C \u0633\u0624\u0627\u0644\u060C \u067E\u0634\u062A\u200C\u0635\u062D\u0646\u0647)\u061B \u062F\u0646\u0628\u0627\u0644\u200C\u06A9\u0646\u0646\u062F\u0647\u200C\u0647\u0627\u06CC \u0641\u0639\u0644\u06CC \u0631\u0627 \u0646\u0632\u062F\u06CC\u06A9 \u0646\u06AF\u0647 \u0645\u06CC\u200C\u062F\u0627\u0631\u062F.",
        tr: "Hik\xE2yeleri g\xFCnl\xFCk ba\u011F i\xE7in kullan\u0131n (anketler, sorular, kamera arkas\u0131); mevcut takip\xE7ileri yak\u0131n tutar."
      },
      {
        en: "Put the key point in the first line of the caption; the rest is hidden behind \u201Cmore\u201D.",
        fa: "\u0646\u06A9\u062A\u0647\u0654 \u0627\u0635\u0644\u06CC \u0631\u0627 \u062F\u0631 \u062E\u0637 \u0627\u0648\u0644 \u06A9\u067E\u0634\u0646 \u0628\u06CC\u0627\u0648\u0631\u06CC\u062F\u061B \u0628\u0642\u06CC\u0647 \u067E\u0634\u062A \xAB\u0628\u06CC\u0634\u062A\u0631\xBB \u067E\u0646\u0647\u0627\u0646 \u0645\u06CC\u200C\u0634\u0648\u062F.",
        tr: "Ana noktay\u0131 a\xE7\u0131klaman\u0131n ilk sat\u0131r\u0131na koyun; gerisi \u201Cdevam\u0131\u201D arkas\u0131nda kal\u0131r."
      },
      {
        en: "Three to five relevant hashtags work better than a long list.",
        fa: "\u0633\u0647 \u062A\u0627 \u067E\u0646\u062C \u0647\u0634\u062A\u06AF \u0645\u0631\u062A\u0628\u0637 \u0628\u0647\u062A\u0631 \u0627\u0632 \u06CC\u06A9 \u0641\u0647\u0631\u0633\u062A \u0628\u0644\u0646\u062F \u062C\u0648\u0627\u0628 \u0645\u06CC\u200C\u062F\u0647\u062F.",
        tr: "\xDC\xE7 ila be\u015F ilgili etiket, uzun bir listeden daha iyi i\u015Fler."
      }
    ]
  },
  {
    channel: "linkedin",
    basis: "general_practice",
    role: {
      en: "Professional authority: share expertise, lessons and proof with peers, partners and buyers.",
      fa: "\u0627\u0639\u062A\u0628\u0627\u0631 \u062D\u0631\u0641\u0647\u200C\u0627\u06CC: \u062A\u062E\u0635\u0635\u060C \u062F\u0631\u0633\u200C\u0622\u0645\u0648\u062E\u062A\u0647\u200C\u0647\u0627 \u0648 \u0634\u0648\u0627\u0647\u062F \u0631\u0627 \u0628\u0627 \u0647\u0645\u06A9\u0627\u0631\u0627\u0646\u060C \u0634\u0631\u06A9\u0627 \u0648 \u062E\u0631\u06CC\u062F\u0627\u0631\u0627\u0646 \u0628\u0647 \u0627\u0634\u062A\u0631\u0627\u06A9 \u0628\u06AF\u0630\u0627\u0631\u06CC\u062F.",
      tr: "Profesyonel otorite: uzmanl\u0131\u011F\u0131, dersleri ve kan\u0131tlar\u0131 meslekta\u015Flar, ortaklar ve al\u0131c\u0131larla payla\u015F\u0131n."
    },
    formats: ["post", "carousel", "article", "video"],
    cadence: { per: "week", min: 2, max: 5, start: 3 },
    objective: "authority",
    mix: mix({ educate: 45, inspire: 15, connect: 25, promote: 15 }),
    kpis: [
      { metric: "reach", per: "post" },
      { metric: "comments", per: "post" },
      { metric: "profile_visits", per: "week" },
      { metric: "follows", per: "week" },
      { metric: "leads", per: "month" }
    ],
    posting_windows_note: {
      en: "Mornings on your audience's working days, in their time zone, are a common start; adjust after a month of your own analytics.",
      fa: "\u0635\u0628\u062D \u0631\u0648\u0632\u0647\u0627\u06CC \u06A9\u0627\u0631\u06CC \u0645\u062E\u0627\u0637\u0628 (\u0628\u0627 \u062A\u0642\u0648\u06CC\u0645 \u06A9\u0627\u0631\u06CC \u0648 \u0648\u0642\u062A \u0645\u062D\u0644\u06CC \u062E\u0648\u062F\u0634) \u0634\u0631\u0648\u0639 \u0631\u0627\u06CC\u062C\u06CC \u0627\u0633\u062A\u061B \u0628\u0639\u062F \u0627\u0632 \u06CC\u06A9 \u0645\u0627\u0647 \u0628\u0627 \u0622\u0645\u0627\u0631 \u062E\u0648\u062F\u062A\u0627\u0646 \u062A\u0646\u0638\u06CC\u0645\u0634 \u06A9\u0646\u06CC\u062F.",
      tr: "Hedef kitlenizin \xE7al\u0131\u015Fma g\xFCnlerinde, kendi saat diliminde sabah saatleri yayg\u0131n bir ba\u015Flang\u0131\xE7t\u0131r; bir ayl\u0131k kendi analiti\u011Finizle ayarlay\u0131n."
    },
    craft: [
      {
        en: "Text posts and document (PDF carousel) posts are the core formats; native video works when a real person is on camera.",
        fa: "\u067E\u0633\u062A \u0645\u062A\u0646\u06CC \u0648 \u067E\u0633\u062A \u0633\u0646\u062F\u06CC (\u06A9\u0631\u0648\u0633\u0644 PDF) \u0642\u0627\u0644\u0628\u200C\u0647\u0627\u06CC \u0627\u0635\u0644\u06CC\u200C\u0627\u0646\u062F\u061B \u0648\u06CC\u062F\u06CC\u0648\u06CC \u0628\u0648\u0645\u06CC \u0648\u0642\u062A\u06CC \u062C\u0648\u0627\u0628 \u0645\u06CC\u200C\u062F\u0647\u062F \u06A9\u0647 \u06CC\u06A9 \u0622\u062F\u0645 \u0648\u0627\u0642\u0639\u06CC \u062C\u0644\u0648\u06CC \u062F\u0648\u0631\u0628\u06CC\u0646 \u0628\u0627\u0634\u062F.",
        tr: "Metin g\xF6nderileri ve belge (PDF karusel) g\xF6nderileri temel formatlard\u0131r; yerel video, kamerada ger\xE7ek biri oldu\u011Funda i\u015Fe yarar."
      },
      {
        en: "The first two lines show before \u201Csee more\u201D: put the hook and the promise of the post there.",
        fa: "\u062F\u0648 \u062E\u0637 \u0627\u0648\u0644 \u0642\u0628\u0644 \u0627\u0632 \xAB\u0628\u06CC\u0634\u062A\u0631 \u0628\u0628\u06CC\u0646\u06CC\u062F\xBB \u062F\u06CC\u062F\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F: \u0642\u0644\u0627\u0628 \u0648 \u0648\u0639\u062F\u0647\u0654 \u067E\u0633\u062A \u0631\u0627 \u0647\u0645\u0627\u0646\u200C\u062C\u0627 \u0628\u06AF\u0630\u0627\u0631\u06CC\u062F.",
        tr: "\u0130lk iki sat\u0131r \u201Cdaha fazlas\u0131n\u0131 g\xF6r\u201Dden \xF6nce g\xF6r\xFCn\xFCr: kancay\u0131 ve g\xF6nderinin vaadini oraya koyun."
      },
      {
        en: "Keep external links out of the post body; if you need one, put it in the first comment.",
        fa: "\u0644\u06CC\u0646\u06A9 \u0628\u06CC\u0631\u0648\u0646\u06CC \u0631\u0627 \u062F\u0631 \u0645\u062A\u0646 \u067E\u0633\u062A \u0646\u06AF\u0630\u0627\u0631\u06CC\u062F\u061B \u0627\u06AF\u0631 \u0644\u0627\u0632\u0645 \u0627\u0633\u062A\u060C \u0622\u0646 \u0631\u0627 \u062F\u0631 \u0627\u0648\u0644\u06CC\u0646 \u06A9\u0627\u0645\u0646\u062A \u0628\u06AF\u0630\u0627\u0631\u06CC\u062F.",
        tr: "D\u0131\u015F ba\u011Flant\u0131lar\u0131 g\xF6nderi metnine koymay\u0131n; gerekirse ilk yoruma koyun."
      },
      {
        en: "Short paragraphs and white space; one idea per post.",
        fa: "\u067E\u0627\u0631\u0627\u06AF\u0631\u0627\u0641\u200C\u0647\u0627\u06CC \u06A9\u0648\u062A\u0627\u0647 \u0648 \u0641\u0627\u0635\u0644\u0647\u0654 \u06A9\u0627\u0641\u06CC \u0628\u06CC\u0646 \u062E\u0637\u0648\u0637\u061B \u0647\u0631 \u067E\u0633\u062A \u06CC\u06A9 \u0627\u06CC\u062F\u0647.",
        tr: "K\u0131sa paragraflar ve bo\u015Fluk; her g\xF6nderide tek fikir."
      },
      {
        en: "Reply to comments in the first hour; conversation is what spreads a post.",
        fa: "\u062F\u0631 \u0633\u0627\u0639\u062A \u0627\u0648\u0644 \u0628\u0647 \u06A9\u0627\u0645\u0646\u062A\u200C\u0647\u0627 \u062C\u0648\u0627\u0628 \u062F\u0647\u06CC\u062F\u061B \u06AF\u0641\u062A\u200C\u0648\u06AF\u0648\u0633\u062A \u06A9\u0647 \u067E\u0633\u062A \u0631\u0627 \u067E\u062E\u0634 \u0645\u06CC\u200C\u06A9\u0646\u062F.",
        tr: "\u0130lk saatte yorumlara yan\u0131t verin; g\xF6nderiyi yayan \u015Fey sohbettir."
      },
      {
        en: "Personal profiles usually reach further than company pages; decide who posts.",
        fa: "\u067E\u0631\u0648\u0641\u0627\u06CC\u0644\u200C\u0647\u0627\u06CC \u0634\u062E\u0635\u06CC \u0645\u0639\u0645\u0648\u0644\u0627\u064B \u0627\u0632 \u0635\u0641\u062D\u0647\u0654 \u0634\u0631\u06A9\u062A \u0628\u06CC\u0634\u062A\u0631 \u062F\u06CC\u062F\u0647 \u0645\u06CC\u200C\u0634\u0648\u0646\u062F\u061B \u0645\u0634\u062E\u0635 \u06A9\u0646\u06CC\u062F \u0686\u0647 \u06A9\u0633\u06CC \u067E\u0633\u062A \u0645\u06CC\u200C\u06AF\u0630\u0627\u0631\u062F.",
        tr: "Ki\u015Fisel profiller genellikle \u015Firket sayfalar\u0131ndan daha geni\u015F kitleye ula\u015F\u0131r; kimin payla\u015Faca\u011F\u0131na karar verin."
      }
    ]
  },
  {
    channel: "x",
    basis: "general_practice",
    role: {
      en: "Conversation and timely takes: short points, threads and replies in your field.",
      fa: "\u06AF\u0641\u062A\u200C\u0648\u06AF\u0648 \u0648 \u0648\u0627\u06A9\u0646\u0634 \u0628\u0647\u200C\u0645\u0648\u0642\u0639: \u0646\u06A9\u062A\u0647\u200C\u0647\u0627\u06CC \u06A9\u0648\u062A\u0627\u0647\u060C \u0631\u0634\u062A\u0647\u200C\u067E\u0633\u062A \u0648 \u067E\u0627\u0633\u062E\u200C\u06AF\u0648\u06CC\u06CC \u062F\u0631 \u062D\u0648\u0632\u0647\u0654 \u06A9\u0627\u0631\u06CC\u200C\u062A\u0627\u0646.",
      tr: "Sohbet ve g\xFCncel yorumlar: alan\u0131n\u0131zda k\u0131sa fikirler, flood'lar ve yan\u0131tlar."
    },
    formats: ["post", "thread", "short_video"],
    cadence: { per: "week", min: 5, max: 21, start: 7 },
    objective: "engagement",
    mix: mix({ educate: 35, connect: 35, promote: 15, entertain: 15 }),
    kpis: [
      { metric: "replies", per: "post" },
      { metric: "reach", per: "post" },
      { metric: "profile_visits", per: "week" },
      { metric: "follows", per: "week" }
    ],
    posting_windows_note: {
      en: "Posting every day matters more than the hour; check when replies come in and post around that time.",
      fa: "\u067E\u0633\u062A \u0631\u0648\u0632\u0627\u0646\u0647 \u0645\u0647\u0645\u200C\u062A\u0631 \u0627\u0632 \u0633\u0627\u0639\u062A \u0627\u0646\u062A\u0634\u0627\u0631 \u0627\u0633\u062A\u061B \u0628\u0628\u06CC\u0646\u06CC\u062F \u067E\u0627\u0633\u062E\u200C\u0647\u0627 \u0645\u0639\u0645\u0648\u0644\u0627\u064B \u06A9\u06CC \u0645\u06CC\u200C\u0622\u06CC\u0646\u062F \u0648 \u062D\u0648\u0644 \u0647\u0645\u0627\u0646 \u0632\u0645\u0627\u0646 \u067E\u0633\u062A \u0628\u06AF\u0630\u0627\u0631\u06CC\u062F.",
      tr: "Her g\xFCn payla\u015Fmak saatten daha \xF6nemlidir; yan\u0131tlar\u0131n ne zaman geldi\u011Fine bak\u0131n ve o saatlerin \xE7evresinde payla\u015F\u0131n."
    },
    craft: [
      {
        en: "Lead with the point; the first line has to work on its own in the feed.",
        fa: "\u0628\u0627 \u0627\u0635\u0644 \u062D\u0631\u0641 \u0634\u0631\u0648\u0639 \u06A9\u0646\u06CC\u062F\u061B \u062E\u0637 \u0627\u0648\u0644 \u0628\u0627\u06CC\u062F \u062F\u0631 \u0641\u06CC\u062F \u0628\u0647\u200C\u062A\u0646\u0647\u0627\u06CC\u06CC \u06A9\u0627\u0631 \u06A9\u0646\u062F.",
        tr: "As\u0131l fikirle ba\u015Flay\u0131n; ilk sat\u0131r ak\u0131\u015Fta tek ba\u015F\u0131na i\u015Fe yaramal\u0131."
      },
      {
        en: "Threads: a strong first post that promises the payoff, one idea per post, a recap and next step at the end.",
        fa: "\u0631\u0634\u062A\u0647\u200C\u067E\u0633\u062A: \u067E\u0633\u062A \u0627\u0648\u0644 \u0642\u0648\u06CC \u06A9\u0647 \u0646\u062A\u06CC\u062C\u0647 \u0631\u0627 \u0648\u0639\u062F\u0647 \u0645\u06CC\u200C\u062F\u0647\u062F\u060C \u0647\u0631 \u067E\u0633\u062A \u06CC\u06A9 \u0627\u06CC\u062F\u0647\u060C \u0648 \u062F\u0631 \u067E\u0627\u06CC\u0627\u0646 \u062C\u0645\u0639\u200C\u0628\u0646\u062F\u06CC \u0648 \u0642\u062F\u0645 \u0628\u0639\u062F\u06CC.",
        tr: "Flood'lar: kazanc\u0131 vaat eden g\xFC\xE7l\xFC bir ilk g\xF6nderi, her g\xF6nderide tek fikir, sonda \xF6zet ve sonraki ad\u0131m."
      },
      {
        en: "Replies to others in your field build reach as much as your own posts.",
        fa: "\u067E\u0627\u0633\u062E \u062F\u0627\u062F\u0646 \u0628\u0647 \u062F\u06CC\u06AF\u0631\u0627\u0646 \u062F\u0631 \u062D\u0648\u0632\u0647\u0654 \u06A9\u0627\u0631\u06CC\u200C\u062A\u0627\u0646 \u0628\u0647 \u0627\u0646\u062F\u0627\u0632\u0647\u0654 \u067E\u0633\u062A\u200C\u0647\u0627\u06CC \u062E\u0648\u062F\u062A\u0627\u0646 \u062F\u06CC\u062F\u0647\u200C\u0634\u062F\u0646 \u0645\u06CC\u200C\u0622\u0648\u0631\u062F.",
        tr: "Alan\u0131n\u0131zdaki ba\u015Fkalar\u0131na verdi\u011Finiz yan\u0131tlar, kendi g\xF6nderileriniz kadar eri\u015Fim kazand\u0131r\u0131r."
      },
      {
        en: "Links in the main post often reach fewer people; test putting them in a reply.",
        fa: "\u0644\u06CC\u0646\u06A9 \u062F\u0631 \u067E\u0633\u062A \u0627\u0635\u0644\u06CC \u0645\u0639\u0645\u0648\u0644\u0627\u064B \u06A9\u0645\u062A\u0631 \u062F\u06CC\u062F\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F\u061B \u06AF\u0630\u0627\u0634\u062A\u0646\u0634 \u062F\u0631 \u067E\u0627\u0633\u062E \u0631\u0627 \u0627\u0645\u062A\u062D\u0627\u0646 \u06A9\u0646\u06CC\u062F.",
        tr: "Ana g\xF6nderideki ba\u011Flant\u0131lar genellikle daha az ki\u015Fiye ula\u015F\u0131r; yan\u0131tta payla\u015Fmay\u0131 deneyin."
      },
      {
        en: "One or two hashtags at most, or none.",
        fa: "\u062D\u062F\u0627\u06A9\u062B\u0631 \u06CC\u06A9\u06CC \u062F\u0648 \u0647\u0634\u062A\u06AF\u060C \u06CC\u0627 \u0647\u06CC\u0686.",
        tr: "En fazla bir iki etiket ya da hi\xE7."
      }
    ]
  },
  {
    channel: "tiktok",
    basis: "general_practice",
    role: {
      en: "Reach through entertainment and quick lessons: native, lo-fi short videos that feel made for the feed.",
      fa: "\u062F\u06CC\u062F\u0647\u200C\u0634\u062F\u0646 \u0628\u0627 \u0633\u0631\u06AF\u0631\u0645\u06CC \u0648 \u0622\u0645\u0648\u0632\u0634\u200C\u0647\u0627\u06CC \u0633\u0631\u06CC\u0639: \u0648\u06CC\u062F\u06CC\u0648\u0647\u0627\u06CC \u06A9\u0648\u062A\u0627\u0647\u060C \u062E\u0648\u062F\u0645\u0627\u0646\u06CC \u0648 \u0628\u06CC\u200C\u062A\u06A9\u0644\u0641 \u06A9\u0647 \u062D\u0633 \u06A9\u0646\u0646\u062F \u0628\u0631\u0627\u06CC \u0647\u0645\u06CC\u0646 \u0641\u06CC\u062F \u0633\u0627\u062E\u062A\u0647 \u0634\u062F\u0647\u200C\u0627\u0646\u062F.",
      tr: "E\u011Flence ve h\u0131zl\u0131 derslerle eri\u015Fim: ak\u0131\u015F i\xE7in yap\u0131lm\u0131\u015F gibi hissettiren do\u011Fal, sade k\u0131sa videolar."
    },
    formats: ["short_video", "live"],
    cadence: { per: "week", min: 3, max: 7, start: 4 },
    objective: "awareness",
    mix: mix({ educate: 35, inspire: 15, connect: 10, promote: 5, entertain: 35 }),
    kpis: [
      { metric: "watch_time", per: "post" },
      { metric: "completion_rate", per: "post" },
      { metric: "shares", per: "post" },
      { metric: "follows", per: "week" }
    ],
    posting_windows_note: {
      en: "Evenings and weekends are a common start; a steady rhythm matters more than the exact hour.",
      fa: "\u0639\u0635\u0631\u0647\u0627 \u0648 \u0622\u062E\u0631 \u0647\u0641\u062A\u0647 \u0634\u0631\u0648\u0639 \u0631\u0627\u06CC\u062C\u06CC \u0627\u0633\u062A\u061B \u0646\u0638\u0645 \u0627\u0646\u062A\u0634\u0627\u0631 \u0627\u0632 \u0633\u0627\u0639\u062A \u062F\u0642\u06CC\u0642 \u0645\u0647\u0645\u200C\u062A\u0631 \u0627\u0633\u062A.",
      tr: "Ak\u015Famlar ve hafta sonlar\u0131 yayg\u0131n bir ba\u015Flang\u0131\xE7t\u0131r; d\xFCzenli bir ritim tam saatten daha \xF6nemlidir."
    },
    craft: [
      {
        en: "The first 1\u20132 seconds decide the view: start mid-action or with the payoff, never with an intro.",
        fa: "\u06CC\u06A9\u06CC \u062F\u0648 \u062B\u0627\u0646\u06CC\u0647\u0654 \u0627\u0648\u0644 \u062A\u0639\u06CC\u06CC\u0646 \u0645\u06CC\u200C\u06A9\u0646\u062F \u0648\u06CC\u062F\u06CC\u0648 \u062F\u06CC\u062F\u0647 \u0634\u0648\u062F \u06CC\u0627 \u0646\u0647: \u0627\u0632 \u0648\u0633\u0637 \u0645\u0627\u062C\u0631\u0627 \u06CC\u0627 \u0628\u0627 \u0646\u062A\u06CC\u062C\u0647 \u0634\u0631\u0648\u0639 \u06A9\u0646\u06CC\u062F\u060C \u0647\u0631\u06AF\u0632 \u0628\u0627 \u0645\u0639\u0631\u0641\u06CC.",
        tr: "\u0130lk 1\u20132 saniye izlenmeyi belirler: aksiyonun ortas\u0131ndan ya da sonu\xE7la ba\u015Flay\u0131n, asla giri\u015Fle de\u011Fil."
      },
      {
        en: "Completion drives distribution: cut every pause, keep most videos short, loop the ending into the start where it fits.",
        fa: "\u062A\u0645\u0627\u0634\u0627\u06CC \u06A9\u0627\u0645\u0644 \u0648\u06CC\u062F\u06CC\u0648\u060C \u067E\u062E\u0634 \u0622\u0646 \u0631\u0627 \u062A\u0639\u06CC\u06CC\u0646 \u0645\u06CC\u200C\u06A9\u0646\u062F: \u0647\u0631 \u0645\u06A9\u062B\u06CC \u0631\u0627 \u062D\u0630\u0641 \u06A9\u0646\u06CC\u062F\u060C \u0628\u06CC\u0634\u062A\u0631 \u0648\u06CC\u062F\u06CC\u0648\u0647\u0627 \u0631\u0627 \u06A9\u0648\u062A\u0627\u0647 \u0646\u06AF\u0647 \u062F\u0627\u0631\u06CC\u062F \u0648 \u0627\u06AF\u0631 \u062C\u0627 \u062F\u0627\u0631\u062F \u067E\u0627\u06CC\u0627\u0646 \u0631\u0627 \u0628\u0647 \u0634\u0631\u0648\u0639 \u0648\u0635\u0644 \u06A9\u0646\u06CC\u062F.",
        tr: "Sonuna kadar izlenme da\u011F\u0131t\u0131m\u0131 belirler: her duraklamay\u0131 kesin, \xE7o\u011Fu videoyu k\u0131sa tutun, uygunsa sonu ba\u015Fa ba\u011Flay\u0131n."
      },
      {
        en: "Native beats polished: talk to the camera, use on-screen text and captions.",
        fa: "\u0637\u0628\u06CC\u0639\u06CC \u0628\u0648\u062F\u0646 \u0627\u0632 \u0635\u06CC\u0642\u0644\u200C\u062E\u0648\u0631\u062F\u06AF\u06CC \u0628\u0647\u062A\u0631 \u062C\u0648\u0627\u0628 \u0645\u06CC\u200C\u062F\u0647\u062F: \u0631\u0648 \u0628\u0647 \u062F\u0648\u0631\u0628\u06CC\u0646 \u062D\u0631\u0641 \u0628\u0632\u0646\u06CC\u062F \u0648 \u0627\u0632 \u0645\u062A\u0646 \u0631\u0648\u06CC \u062A\u0635\u0648\u06CC\u0631 \u0648 \u0632\u06CC\u0631\u0646\u0648\u06CC\u0633 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F.",
        tr: "Do\u011Fal olan cilal\u0131 olandan iyidir: kameraya konu\u015Fun, ekran yaz\u0131s\u0131 ve altyaz\u0131 kullan\u0131n."
      },
      {
        en: "Use trends and sounds only when they fit the brand's voice; never borrow a claim from a trend.",
        fa: "\u0627\u0632 \u062A\u0631\u0646\u062F\u0647\u0627 \u0648 \u0635\u062F\u0627\u0647\u0627 \u0641\u0642\u0637 \u0648\u0642\u062A\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F \u06A9\u0647 \u0628\u0627 \u0644\u062D\u0646 \u0628\u0631\u0646\u062F \u062C\u0648\u0631 \u0628\u0627\u0634\u0646\u062F\u061B \u0647\u06CC\u0686 \u0627\u062F\u0639\u0627\u06CC\u06CC \u0631\u0627 \u0627\u0632 \u06CC\u06A9 \u062A\u0631\u0646\u062F \u0642\u0631\u0636 \u0646\u06AF\u06CC\u0631\u06CC\u062F.",
        tr: "Trendleri ve sesleri yaln\u0131zca markan\u0131n ses tonuna uydu\u011Funda kullan\u0131n; bir trendden asla iddia \xF6d\xFCn\xE7 almay\u0131n."
      },
      {
        en: "Answer comments with video replies; they become your next ideas.",
        fa: "\u0628\u0647 \u06A9\u0627\u0645\u0646\u062A\u200C\u0647\u0627 \u0628\u0627 \u0648\u06CC\u062F\u06CC\u0648 \u062C\u0648\u0627\u0628 \u062F\u0647\u06CC\u062F\u061B \u0647\u0645\u06CC\u0646\u200C\u0647\u0627 \u0627\u06CC\u062F\u0647\u200C\u0647\u0627\u06CC \u0628\u0639\u062F\u06CC\u200C\u062A\u0627\u0646 \u0645\u06CC\u200C\u0634\u0648\u0646\u062F.",
        tr: "Yorumlara video yan\u0131tla kar\u015F\u0131l\u0131k verin; bunlar sonraki fikirleriniz olur."
      }
    ]
  },
  {
    channel: "youtube",
    basis: "general_practice",
    role: {
      en: "Depth and search: longer videos people find when they look for answers, with Shorts to be discovered.",
      fa: "\u0639\u0645\u0642 \u0648 \u062C\u0633\u062A\u200C\u0648\u062C\u0648: \u0648\u06CC\u062F\u06CC\u0648\u0647\u0627\u06CC \u0628\u0644\u0646\u062F\u062A\u0631\u06CC \u06A9\u0647 \u0645\u0631\u062F\u0645 \u0648\u0642\u062A\u06CC \u062F\u0646\u0628\u0627\u0644 \u062C\u0648\u0627\u0628 \u0645\u06CC\u200C\u06AF\u0631\u062F\u0646\u062F \u067E\u06CC\u062F\u0627 \u0645\u06CC\u200C\u06A9\u0646\u0646\u062F\u060C \u0628\u0647\u200C\u0647\u0645\u0631\u0627\u0647 Shorts \u0628\u0631\u0627\u06CC \u062F\u06CC\u062F\u0647\u200C\u0634\u062F\u0646.",
      tr: "Derinlik ve arama: insanlar\u0131n cevap ararken buldu\u011Fu daha uzun videolar ve ke\u015Ffedilmek i\xE7in Shorts."
    },
    formats: ["video", "short_video", "live"],
    cadence: { per: "week", min: 1, max: 3, start: 1 },
    objective: "authority",
    mix: mix({ educate: 55, inspire: 15, connect: 5, promote: 10, entertain: 15 }),
    kpis: [
      { metric: "watch_time", per: "post" },
      { metric: "completion_rate", per: "post" },
      { metric: "subscribers", per: "month" },
      { metric: "link_clicks", per: "month" }
    ],
    posting_windows_note: {
      en: "Publish on a steady day and time so subscribers learn when to expect you; search traffic depends less on timing.",
      fa: "\u062F\u0631 \u0631\u0648\u0632 \u0648 \u0633\u0627\u0639\u062A \u062B\u0627\u0628\u062A\u06CC \u0645\u0646\u062A\u0634\u0631 \u06A9\u0646\u06CC\u062F \u062A\u0627 \u0645\u0634\u062A\u0631\u06A9\u200C\u0647\u0627 \u0628\u062F\u0627\u0646\u0646\u062F \u06A9\u06CC \u0645\u0646\u062A\u0638\u0631 \u0628\u0627\u0634\u0646\u062F\u061B \u0628\u0627\u0632\u062F\u06CC\u062F\u06CC \u06A9\u0647 \u0627\u0632 \u062C\u0633\u062A\u200C\u0648\u062C\u0648 \u0645\u06CC\u200C\u0622\u06CC\u062F \u06A9\u0645\u062A\u0631 \u0628\u0647 \u0632\u0645\u0627\u0646 \u0648\u0627\u0628\u0633\u062A\u0647 \u0627\u0633\u062A.",
      tr: "Aboneler ne zaman bekleyeceklerini \xF6\u011Frensin diye sabit bir g\xFCn ve saatte yay\u0131nlay\u0131n; arama trafi\u011Fi zamanlamaya daha az ba\u011Fl\u0131d\u0131r."
    },
    craft: [
      {
        en: "Title and thumbnail are one promise; the first 30 seconds must deliver on it.",
        fa: "\u0639\u0646\u0648\u0627\u0646 \u0648 \u062A\u0635\u0648\u06CC\u0631 \u0628\u0646\u062F\u0627\u0646\u06AF\u0634\u062A\u06CC \u06CC\u06A9 \u0648\u0639\u062F\u0647\u200C\u0627\u0646\u062F\u061B \u06F3\u06F0 \u062B\u0627\u0646\u06CC\u0647\u0654 \u0627\u0648\u0644 \u0628\u0627\u06CC\u062F \u0647\u0645\u0627\u0646 \u0648\u0639\u062F\u0647 \u0631\u0627 \u0628\u0631\u0622\u0648\u0631\u062F\u0647 \u06A9\u0646\u062F.",
        tr: "Ba\u015Fl\u0131k ve k\xFC\xE7\xFCk resim tek bir vaattir; ilk 30 saniye bu vaadi yerine getirmeli."
      },
      {
        en: "Write titles around what people search for, in the language they search in.",
        fa: "\u0639\u0646\u0648\u0627\u0646 \u0631\u0627 \u062D\u0648\u0644 \u0686\u06CC\u0632\u06CC \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F \u06A9\u0647 \u0645\u0631\u062F\u0645 \u062C\u0633\u062A\u200C\u0648\u062C\u0648 \u0645\u06CC\u200C\u06A9\u0646\u0646\u062F\u060C \u0628\u0647 \u0647\u0645\u0627\u0646 \u0632\u0628\u0627\u0646\u06CC \u06A9\u0647 \u062C\u0633\u062A\u200C\u0648\u062C\u0648 \u0645\u06CC\u200C\u06A9\u0646\u0646\u062F.",
        tr: "Ba\u015Fl\u0131klar\u0131 insanlar\u0131n arad\u0131\u011F\u0131 \u015Feye g\xF6re, arad\u0131klar\u0131 dilde yaz\u0131n."
      },
      {
        en: "Structure long videos in chapters and add chapter markers to the description.",
        fa: "\u0648\u06CC\u062F\u06CC\u0648\u0647\u0627\u06CC \u0628\u0644\u0646\u062F \u0631\u0627 \u0641\u0635\u0644\u200C\u0628\u0646\u062F\u06CC \u06A9\u0646\u06CC\u062F \u0648 \u0646\u0634\u0627\u0646\u06AF\u0631 \u0641\u0635\u0644\u200C\u0647\u0627 \u0631\u0627 \u062F\u0631 \u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0628\u06AF\u0630\u0627\u0631\u06CC\u062F.",
        tr: "Uzun videolar\u0131 b\xF6l\xFCmlere ay\u0131r\u0131n ve a\xE7\u0131klamaya b\xF6l\xFCm i\u015Faretleri ekleyin."
      },
      {
        en: "Shorts bring new viewers; point them to a related long video.",
        fa: "Shorts \u0628\u06CC\u0646\u0646\u062F\u0647\u200C\u0647\u0627\u06CC \u062A\u0627\u0632\u0647 \u0645\u06CC\u200C\u0622\u0648\u0631\u062F\u061B \u0622\u0646\u200C\u0647\u0627 \u0631\u0627 \u0628\u0647 \u06CC\u06A9 \u0648\u06CC\u062F\u06CC\u0648\u06CC \u0628\u0644\u0646\u062F \u0645\u0631\u062A\u0628\u0637 \u0647\u062F\u0627\u06CC\u062A \u06A9\u0646\u06CC\u062F.",
        tr: "Shorts yeni izleyiciler getirir; onlar\u0131 ilgili uzun bir videoya y\xF6nlendirin."
      },
      {
        en: "Add accurate captions; they help viewers and search.",
        fa: "\u0632\u06CC\u0631\u0646\u0648\u06CC\u0633 \u062F\u0642\u06CC\u0642 \u0627\u0636\u0627\u0641\u0647 \u06A9\u0646\u06CC\u062F\u061B \u0647\u0645 \u0628\u0647 \u0628\u06CC\u0646\u0646\u062F\u0647 \u06A9\u0645\u06A9 \u0645\u06CC\u200C\u06A9\u0646\u062F \u0647\u0645 \u0628\u0647 \u062C\u0633\u062A\u200C\u0648\u062C\u0648.",
        tr: "Do\u011Fru altyaz\u0131 ekleyin; hem izleyicilere hem aramaya yard\u0131mc\u0131 olur."
      }
    ]
  },
  {
    channel: "threads",
    basis: "general_practice",
    role: {
      en: "Casual conversation: quick thoughts, questions and replies that show the people behind the brand.",
      fa: "\u06AF\u0641\u062A\u200C\u0648\u06AF\u0648\u06CC \u062E\u0648\u062F\u0645\u0627\u0646\u06CC: \u0641\u06A9\u0631\u0647\u0627\u06CC \u06A9\u0648\u062A\u0627\u0647\u060C \u0633\u0624\u0627\u0644\u200C\u0647\u0627 \u0648 \u067E\u0627\u0633\u062E\u200C\u0647\u0627\u06CC\u06CC \u06A9\u0647 \u0622\u062F\u0645\u200C\u0647\u0627\u06CC \u067E\u0634\u062A \u0628\u0631\u0646\u062F \u0631\u0627 \u0646\u0634\u0627\u0646 \u0645\u06CC\u200C\u062F\u0647\u062F.",
      tr: "Samimi sohbet: markan\u0131n arkas\u0131ndaki insanlar\u0131 g\xF6steren k\u0131sa d\xFC\u015F\xFCnceler, sorular ve yan\u0131tlar."
    },
    formats: ["post", "thread"],
    cadence: { per: "week", min: 3, max: 10, start: 5 },
    objective: "engagement",
    mix: mix({ educate: 30, connect: 40, promote: 10, entertain: 20 }),
    kpis: [
      { metric: "replies", per: "post" },
      { metric: "reach", per: "post" },
      { metric: "follows", per: "week" }
    ],
    posting_windows_note: {
      en: "Start from your Instagram audience's active hours; the two audiences overlap.",
      fa: "\u0628\u0631\u0627\u06CC \u0634\u0631\u0648\u0639\u060C \u0633\u0627\u0639\u062A\u200C\u0647\u0627\u06CC \u0641\u0639\u0627\u0644 \u0645\u062E\u0627\u0637\u0628\u0627\u0646 \u0627\u06CC\u0646\u0633\u062A\u0627\u06AF\u0631\u0627\u0645\u062A\u0627\u0646 \u0631\u0627 \u0645\u0628\u0646\u0627 \u0628\u06AF\u0630\u0627\u0631\u06CC\u062F\u061B \u0627\u06CC\u0646 \u062F\u0648 \u0645\u062E\u0627\u0637\u0628 \u0647\u0645\u200C\u067E\u0648\u0634\u0627\u0646\u06CC \u062F\u0627\u0631\u0646\u062F.",
      tr: "Ba\u015Flang\u0131\xE7ta Instagram kitlenizin aktif saatlerini esas al\u0131n; iki kitle \xF6rt\xFC\u015F\xFCr."
    },
    craft: [
      {
        en: "Write the way you talk; questions and opinions get replies.",
        fa: "\u0647\u0645\u0627\u0646\u200C\u0637\u0648\u0631 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F \u06A9\u0647 \u062D\u0631\u0641 \u0645\u06CC\u200C\u0632\u0646\u06CC\u062F\u061B \u0633\u0624\u0627\u0644 \u0648 \u0646\u0638\u0631 \u0634\u062E\u0635\u06CC \u067E\u0627\u0633\u062E \u0645\u06CC\u200C\u06AF\u06CC\u0631\u062F.",
        tr: "Konu\u015Ftu\u011Funuz gibi yaz\u0131n; sorular ve g\xF6r\xFC\u015Fler yan\u0131t al\u0131r."
      },
      {
        en: "Reply to every early comment; the replies are the reach.",
        fa: "\u0628\u0647 \u0647\u0645\u0647\u0654 \u06A9\u0627\u0645\u0646\u062A\u200C\u0647\u0627\u06CC \u0627\u0648\u0644\u06CC\u0647 \u062C\u0648\u0627\u0628 \u062F\u0647\u06CC\u062F\u061B \u062F\u06CC\u062F\u0647\u200C\u0634\u062F\u0646 \u0627\u0632 \u0647\u0645\u06CC\u0646 \u067E\u0627\u0633\u062E\u200C\u0647\u0627 \u0645\u06CC\u200C\u0622\u06CC\u062F.",
        tr: "Her erken yoruma yan\u0131t verin; eri\u015Fim bu yan\u0131tlardan gelir."
      },
      {
        en: "Keep promotion light; this is not a link channel.",
        fa: "\u062A\u0628\u0644\u06CC\u063A \u0631\u0627 \u0633\u0628\u06A9 \u0646\u06AF\u0647 \u062F\u0627\u0631\u06CC\u062F\u061B \u0627\u06CC\u0646 \u06A9\u0627\u0646\u0627\u0644\u06CC \u0628\u0631\u0627\u06CC \u0644\u06CC\u0646\u06A9 \u062F\u0627\u062F\u0646 \u0646\u06CC\u0633\u062A.",
        tr: "Tan\u0131t\u0131m\u0131 hafif tutun; buras\u0131 bir ba\u011Flant\u0131 kanal\u0131 de\u011Fil."
      },
      {
        en: "Reuse a strong caption or carousel idea as a short text post, rewritten for this feed.",
        fa: "\u06CC\u06A9 \u06A9\u067E\u0634\u0646 \u06CC\u0627 \u0627\u06CC\u062F\u0647\u0654 \u06A9\u0631\u0648\u0633\u0644 \u0645\u0648\u0641\u0642 \u0631\u0627 \u0628\u0647 \u0634\u06A9\u0644 \u06CC\u06A9 \u067E\u0633\u062A \u0645\u062A\u0646\u06CC \u06A9\u0648\u062A\u0627\u0647\u060C \u0628\u0627\u0632\u0646\u0648\u06CC\u0633\u06CC\u200C\u0634\u062F\u0647 \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u0641\u06CC\u062F\u060C \u062F\u0648\u0628\u0627\u0631\u0647 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F.",
        tr: "G\xFC\xE7l\xFC bir a\xE7\u0131klamay\u0131 ya da karusel fikrini, bu ak\u0131\u015F i\xE7in yeniden yaz\u0131lm\u0131\u015F k\u0131sa bir metin g\xF6nderisi olarak kullan\u0131n."
      }
    ]
  },
  {
    channel: "telegram",
    basis: "general_practice",
    role: {
      en: "A direct line to the community: updates, useful posts and announcements that land straight in subscribers' chats.",
      fa: "\u062E\u0637 \u0645\u0633\u062A\u0642\u06CC\u0645 \u0628\u0627 \u062C\u0627\u0645\u0639\u0647\u0654 \u0645\u062E\u0627\u0637\u0628\u0627\u0646: \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC\u200C\u0647\u0627\u060C \u067E\u0633\u062A\u200C\u0647\u0627\u06CC \u06A9\u0627\u0631\u0628\u0631\u062F\u06CC \u0648 \u0627\u0637\u0644\u0627\u0639\u06CC\u0647\u200C\u0647\u0627\u06CC\u06CC \u06A9\u0647 \u0645\u0633\u062A\u0642\u06CC\u0645 \u0628\u0647 \u0635\u0641\u062D\u0647\u0654 \u06AF\u0641\u062A\u200C\u0648\u06AF\u0648\u06CC \u0645\u0634\u062A\u0631\u06A9\u200C\u0647\u0627 \u0645\u06CC\u200C\u0631\u0633\u062F.",
      tr: "Toplulu\u011Fa do\u011Frudan hat: abonelerin sohbetlerine do\u011Frudan d\xFC\u015Fen g\xFCncellemeler, faydal\u0131 g\xF6nderiler ve duyurular."
    },
    formats: ["post", "video", "live"],
    cadence: { per: "week", min: 3, max: 7, start: 4 },
    objective: "retention",
    mix: mix({ educate: 40, inspire: 15, connect: 25, promote: 20 }),
    kpis: [
      { metric: "reach", per: "post" },
      { metric: "shares", per: "post" },
      { metric: "link_clicks", per: "post" },
      { metric: "subscribers", per: "month" }
    ],
    posting_windows_note: {
      en: "Avoid late-night posts that notify sleeping subscribers; send minor updates silently.",
      fa: "\u0627\u0632 \u067E\u0633\u062A\u200C\u06AF\u0630\u0627\u0634\u062A\u0646 \u0646\u06CC\u0645\u0647\u200C\u0634\u0628 \u067E\u0631\u0647\u06CC\u0632 \u06A9\u0646\u06CC\u062F \u0686\u0648\u0646 \u0628\u0631\u0627\u06CC \u0645\u0634\u062A\u0631\u06A9\u200C\u0647\u0627\u06CC \u062E\u0648\u0627\u0628 \u0627\u0639\u0644\u0627\u0646 \u0645\u06CC\u200C\u0641\u0631\u0633\u062A\u062F\u061B \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC\u200C\u0647\u0627\u06CC \u062C\u0632\u0626\u06CC \u0631\u0627 \u0628\u06CC\u200C\u0635\u062F\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F.",
      tr: "Uyuyan abonelere bildirim giden gece ge\xE7 saat g\xF6nderilerinden ka\xE7\u0131n\u0131n; k\xFC\xE7\xFCk g\xFCncellemeleri sessiz g\xF6nderin."
    },
    craft: [
      {
        en: "Every post is a notification: post less and make each one worth it.",
        fa: "\u0647\u0631 \u067E\u0633\u062A \u06CC\u06A9 \u0627\u0639\u0644\u0627\u0646 \u0627\u0633\u062A: \u06A9\u0645\u062A\u0631 \u067E\u0633\u062A \u0628\u06AF\u0630\u0627\u0631\u06CC\u062F \u0648 \u0647\u0631 \u06A9\u062F\u0627\u0645 \u0631\u0627 \u0627\u0631\u0632\u0634\u0645\u0646\u062F \u06A9\u0646\u06CC\u062F.",
        tr: "Her g\xF6nderi bir bildirimdir: daha az payla\u015F\u0131n ve her birini de\u011Ferli k\u0131l\u0131n."
      },
      {
        en: "A bold first line as the headline, short paragraphs, one link at most.",
        fa: "\u062E\u0637 \u0627\u0648\u0644 \u0631\u0627 \u067E\u0631\u0631\u0646\u06AF \u0648 \u0645\u062B\u0644 \u062A\u06CC\u062A\u0631 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F\u061B \u067E\u0627\u0631\u0627\u06AF\u0631\u0627\u0641\u200C\u0647\u0627 \u06A9\u0648\u062A\u0627\u0647 \u0648 \u062D\u062F\u0627\u06A9\u062B\u0631 \u06CC\u06A9 \u0644\u06CC\u0646\u06A9.",
        tr: "\u0130lk sat\u0131r ba\u015Fl\u0131k gibi kal\u0131n, k\u0131sa paragraflar, en fazla bir ba\u011Flant\u0131."
      },
      {
        en: "Use polls and a linked discussion group to hear from subscribers.",
        fa: "\u0628\u0627 \u0646\u0638\u0631\u0633\u0646\u062C\u06CC \u0648 \u06AF\u0631\u0648\u0647 \u06AF\u0641\u062A\u200C\u0648\u06AF\u0648\u06CC \u0645\u062A\u0635\u0644 \u0628\u0647 \u06A9\u0627\u0646\u0627\u0644\u060C \u0635\u062F\u0627\u06CC \u0645\u0634\u062A\u0631\u06A9\u200C\u0647\u0627 \u0631\u0627 \u0628\u0634\u0646\u0648\u06CC\u062F.",
        tr: "Abonelerin sesini duymak i\xE7in anketleri ve ba\u011Fl\u0131 tart\u0131\u015Fma grubunu kullan\u0131n."
      },
      {
        en: "Pin the post new subscribers should read first.",
        fa: "\u067E\u0633\u062A\u06CC \u0631\u0627 \u06A9\u0647 \u0645\u0634\u062A\u0631\u06A9\u200C\u0647\u0627\u06CC \u062A\u0627\u0632\u0647 \u0628\u0627\u06CC\u062F \u0627\u0648\u0644 \u0628\u062E\u0648\u0627\u0646\u0646\u062F \u0633\u0646\u062C\u0627\u0642 \u06A9\u0646\u06CC\u062F.",
        tr: "Yeni abonelerin \xF6nce okumas\u0131 gereken g\xF6nderiyi sabitleyin."
      }
    ]
  },
  {
    channel: "facebook",
    basis: "general_practice",
    role: {
      en: "Community and local reach: groups, events and posts for an audience that already knows you.",
      fa: "\u062C\u0627\u0645\u0639\u0647 \u0648 \u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u062D\u0644\u06CC: \u06AF\u0631\u0648\u0647\u200C\u0647\u0627\u060C \u0631\u0648\u06CC\u062F\u0627\u062F\u0647\u0627 \u0648 \u067E\u0633\u062A\u200C\u0647\u0627\u06CC\u06CC \u0628\u0631\u0627\u06CC \u0645\u062E\u0627\u0637\u0628\u06CC \u06A9\u0647 \u0627\u0632 \u0642\u0628\u0644 \u0634\u0645\u0627 \u0631\u0627 \u0645\u06CC\u200C\u0634\u0646\u0627\u0633\u062F.",
      tr: "Topluluk ve yerel eri\u015Fim: sizi zaten tan\u0131yan bir kitle i\xE7in gruplar, etkinlikler ve g\xF6nderiler."
    },
    formats: ["post", "video", "reel", "live", "story"],
    cadence: { per: "week", min: 3, max: 5, start: 3 },
    objective: "community",
    mix: mix({ educate: 30, connect: 35, promote: 15, entertain: 20 }),
    kpis: [
      { metric: "reach", per: "post" },
      { metric: "comments", per: "post" },
      { metric: "shares", per: "post" },
      { metric: "link_clicks", per: "post" }
    ],
    posting_windows_note: {
      en: "Weekday midday and early evening in your audience's time zone are a common start.",
      fa: "\u0638\u0647\u0631 \u0648 \u0627\u0648\u0627\u06CC\u0644 \u0639\u0635\u0631\u0650 \u0631\u0648\u0632\u0647\u0627\u06CC \u06A9\u0627\u0631\u06CC\u060C \u0628\u0647 \u0648\u0642\u062A \u0645\u062D\u0644\u06CC \u0645\u062E\u0627\u0637\u0628\u060C \u0634\u0631\u0648\u0639 \u0631\u0627\u06CC\u062C\u06CC \u0627\u0633\u062A.",
      tr: "Hedef kitlenizin saat diliminde hafta i\xE7i \xF6\u011Fle ve ak\u015Fam\xFCst\xFC saatleri yayg\u0131n bir ba\u015Flang\u0131\xE7t\u0131r."
    },
    craft: [
      {
        en: "Questions and local or community stories start conversations.",
        fa: "\u0633\u0624\u0627\u0644\u200C\u0647\u0627 \u0648 \u0631\u0648\u0627\u06CC\u062A\u200C\u0647\u0627\u06CC \u0645\u062D\u0644\u06CC \u06CC\u0627 \u0645\u0631\u0628\u0648\u0637 \u0628\u0647 \u062C\u0627\u0645\u0639\u0647\u0654 \u0645\u062E\u0627\u0637\u0628\u0627\u0646\u060C \u06AF\u0641\u062A\u200C\u0648\u06AF\u0648 \u0631\u0627\u0647 \u0645\u06CC\u200C\u0627\u0646\u062F\u0627\u0632\u0646\u062F.",
        tr: "Sorular ve yerel ya da topluluk hik\xE2yeleri sohbet ba\u015Flat\u0131r."
      },
      {
        en: "Reels and native video usually reach further than link posts.",
        fa: "\u0631\u06CC\u0644\u0632 \u0648 \u0648\u06CC\u062F\u06CC\u0648\u06CC \u0628\u0648\u0645\u06CC \u0645\u0639\u0645\u0648\u0644\u0627\u064B \u0627\u0632 \u067E\u0633\u062A\u200C\u0647\u0627\u06CC \u0644\u06CC\u0646\u06A9\u200C\u062F\u0627\u0631 \u0628\u06CC\u0634\u062A\u0631 \u062F\u06CC\u062F\u0647 \u0645\u06CC\u200C\u0634\u0648\u0646\u062F.",
        tr: "Reels ve yerel video genellikle ba\u011Flant\u0131l\u0131 g\xF6nderilerden daha fazla ki\u015Fiye ula\u015F\u0131r."
      },
      {
        en: "Lives and events suit launches, Q&As and workshops.",
        fa: "\u0644\u0627\u06CC\u0648 \u0648 \u0631\u0648\u06CC\u062F\u0627\u062F \u0628\u0631\u0627\u06CC \u0645\u0639\u0631\u0641\u06CC \u0645\u062D\u0635\u0648\u0644\u060C \u067E\u0631\u0633\u0634 \u0648 \u067E\u0627\u0633\u062E \u0648 \u06A9\u0627\u0631\u06AF\u0627\u0647 \u0645\u0646\u0627\u0633\u0628 \u0627\u0633\u062A.",
        tr: "Canl\u0131 yay\u0131nlar ve etkinlikler lansmanlar, soru-cevaplar ve at\xF6lyeler i\xE7in uygundur."
      },
      {
        en: "Reply to comments and messages quickly; groups grow with an active host.",
        fa: "\u0628\u0647 \u06A9\u0627\u0645\u0646\u062A\u200C\u0647\u0627 \u0648 \u067E\u06CC\u0627\u0645\u200C\u0647\u0627 \u0633\u0631\u06CC\u0639 \u062C\u0648\u0627\u0628 \u062F\u0647\u06CC\u062F\u061B \u06AF\u0631\u0648\u0647\u200C\u0647\u0627 \u0628\u0627 \u0645\u06CC\u0632\u0628\u0627\u0646 \u0641\u0639\u0627\u0644 \u0631\u0634\u062F \u0645\u06CC\u200C\u06A9\u0646\u0646\u062F.",
        tr: "Yorumlara ve mesajlara h\u0131zl\u0131 yan\u0131t verin; gruplar aktif bir ev sahibiyle b\xFCy\xFCr."
      }
    ]
  },
  {
    channel: "pinterest",
    basis: "general_practice",
    role: {
      en: "Visual search: evergreen pins that people save and that keep sending visitors to your site for months.",
      fa: "\u062C\u0633\u062A\u200C\u0648\u062C\u0648\u06CC \u062A\u0635\u0648\u06CC\u0631\u06CC: \u067E\u06CC\u0646\u200C\u0647\u0627\u06CC \u0645\u0627\u0646\u062F\u06AF\u0627\u0631\u06CC \u06A9\u0647 \u0645\u0631\u062F\u0645 \u0630\u062E\u06CC\u0631\u0647 \u0645\u06CC\u200C\u06A9\u0646\u0646\u062F \u0648 \u0645\u0627\u0647\u200C\u0647\u0627 \u0628\u0627\u0632\u062F\u06CC\u062F\u06A9\u0646\u0646\u062F\u0647 \u0628\u0647 \u0633\u0627\u06CC\u062A \u0634\u0645\u0627 \u0645\u06CC\u200C\u0641\u0631\u0633\u062A\u0646\u062F.",
      tr: "G\xF6rsel arama: insanlar\u0131n kaydetti\u011Fi ve aylarca sitenize ziyaret\xE7i g\xF6ndermeye devam eden kal\u0131c\u0131 pinler."
    },
    formats: ["post", "short_video"],
    cadence: { per: "week", min: 5, max: 15, start: 7 },
    objective: "awareness",
    mix: mix({ educate: 50, inspire: 40, promote: 10 }),
    kpis: [
      { metric: "saves", per: "post" },
      { metric: "link_clicks", per: "post" },
      { metric: "reach", per: "post" }
    ],
    posting_windows_note: {
      en: "Timing matters little because pins are found through search; publish steadily and plan seasonal topics weeks ahead.",
      fa: "\u0632\u0645\u0627\u0646 \u0627\u0646\u062A\u0634\u0627\u0631 \u0627\u0647\u0645\u06CC\u062A \u0686\u0646\u062F\u0627\u0646\u06CC \u0646\u062F\u0627\u0631\u062F \u0686\u0648\u0646 \u067E\u06CC\u0646\u200C\u0647\u0627 \u0627\u0632 \u0631\u0627\u0647 \u062C\u0633\u062A\u200C\u0648\u062C\u0648 \u067E\u06CC\u062F\u0627 \u0645\u06CC\u200C\u0634\u0648\u0646\u062F\u061B \u0645\u0646\u0638\u0645 \u0645\u0646\u062A\u0634\u0631 \u06A9\u0646\u06CC\u062F \u0648 \u0645\u0648\u0636\u0648\u0639\u0627\u062A \u0641\u0635\u0644\u06CC \u0631\u0627 \u0686\u0646\u062F \u0647\u0641\u062A\u0647 \u0632\u0648\u062F\u062A\u0631 \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0631\u06CC\u0632\u06CC \u06A9\u0646\u06CC\u062F.",
      tr: "Pinler arama yoluyla bulundu\u011Fu i\xE7in zamanlama pek \xF6nemli de\u011Fildir; d\xFCzenli yay\u0131nlay\u0131n ve sezonluk konular\u0131 haftalar \xF6nceden planlay\u0131n."
    },
    craft: [
      {
        en: "Vertical images (2:3) with a short text overlay that says what the pin is about.",
        fa: "\u062A\u0635\u0648\u06CC\u0631 \u0639\u0645\u0648\u062F\u06CC (\u06F2:\u06F3) \u0628\u0627 \u06CC\u06A9 \u0645\u062A\u0646 \u06A9\u0648\u062A\u0627\u0647 \u0631\u0648\u06CC \u062A\u0635\u0648\u06CC\u0631 \u06A9\u0647 \u0628\u06AF\u0648\u06CC\u062F \u067E\u06CC\u0646 \u062F\u0631\u0628\u0627\u0631\u0647\u0654 \u0686\u06CC\u0633\u062A.",
        tr: "Pinin ne hakk\u0131nda oldu\u011Funu s\xF6yleyen k\u0131sa bir metin katman\u0131yla dikey g\xF6rseller (2:3)."
      },
      {
        en: "Titles and descriptions use the words people search for.",
        fa: "\u0639\u0646\u0648\u0627\u0646 \u0648 \u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0631\u0627 \u0628\u0627 \u06A9\u0644\u0645\u0627\u062A\u06CC \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F \u06A9\u0647 \u0645\u0631\u062F\u0645 \u062C\u0633\u062A\u200C\u0648\u062C\u0648 \u0645\u06CC\u200C\u06A9\u0646\u0646\u062F.",
        tr: "Ba\u015Fl\u0131klar ve a\xE7\u0131klamalar insanlar\u0131n arad\u0131\u011F\u0131 kelimeleri kullan\u0131r."
      },
      {
        en: "Every pin links to a relevant page, never a generic home page.",
        fa: "\u0647\u0631 \u067E\u06CC\u0646 \u0628\u0647 \u06CC\u06A9 \u0635\u0641\u062D\u0647\u0654 \u0645\u0631\u062A\u0628\u0637 \u0644\u06CC\u0646\u06A9 \u0645\u06CC\u200C\u062F\u0647\u062F\u060C \u0646\u0647 \u0628\u0647 \u0635\u0641\u062D\u0647\u0654 \u0627\u0635\u0644\u06CC \u06A9\u0644\u06CC \u0633\u0627\u06CC\u062A.",
        tr: "Her pin ilgili bir sayfaya ba\u011Flan\u0131r, asla genel bir ana sayfaya de\u011Fil."
      },
      {
        en: "Organise pins on boards named after topics people search for.",
        fa: "\u067E\u06CC\u0646\u200C\u0647\u0627 \u0631\u0627 \u062F\u0631 \u0628\u0631\u062F\u0647\u0627\u06CC\u06CC \u0645\u0631\u062A\u0628 \u06A9\u0646\u06CC\u062F \u06A9\u0647 \u0646\u0627\u0645\u0634\u0627\u0646 \u0647\u0645\u0627\u0646 \u0645\u0648\u0636\u0648\u0639\u0627\u062A\u06CC \u0627\u0633\u062A \u06A9\u0647 \u0645\u0631\u062F\u0645 \u062C\u0633\u062A\u200C\u0648\u062C\u0648 \u0645\u06CC\u200C\u06A9\u0646\u0646\u062F.",
        tr: "Pinleri insanlar\u0131n arad\u0131\u011F\u0131 konular\u0131n ad\u0131n\u0131 ta\u015F\u0131yan panolarda d\xFCzenleyin."
      }
    ]
  },
  {
    channel: "newsletter",
    basis: "general_practice",
    role: {
      en: "An owned relationship: a regular, useful email to people who asked for it, where offers can be made directly.",
      fa: "\u0631\u0627\u0628\u0637\u0647\u200C\u0627\u06CC \u06A9\u0647 \u0645\u0627\u0644 \u062E\u0648\u062F \u0628\u0631\u0646\u062F \u0627\u0633\u062A: \u0627\u06CC\u0645\u06CC\u0644\u06CC \u0645\u0646\u0638\u0645 \u0648 \u0645\u0641\u06CC\u062F \u0628\u0631\u0627\u06CC \u06A9\u0633\u0627\u0646\u06CC \u06A9\u0647 \u062E\u0648\u062F\u0634\u0627\u0646 \u062E\u0648\u0627\u0633\u062A\u0647\u200C\u0627\u0646\u062F\u060C \u062C\u0627\u06CC\u06CC \u06A9\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F \u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u0631\u0627 \u0645\u0633\u062A\u0642\u06CC\u0645 \u0645\u0637\u0631\u062D \u06A9\u0631\u062F.",
      tr: "Markaya ait bir ili\u015Fki: isteyen ki\u015Filere d\xFCzenli, faydal\u0131 bir e-posta; teklifler do\u011Frudan burada sunulabilir."
    },
    formats: ["email"],
    cadence: { per: "week", min: 1, max: 2, start: 1 },
    objective: "retention",
    mix: mix({ educate: 50, inspire: 10, connect: 20, promote: 20 }),
    kpis: [
      { metric: "subscribers", per: "month" },
      { metric: "link_clicks", per: "post" },
      { metric: "replies", per: "post" }
    ],
    posting_windows_note: {
      en: "Send on the same day each week; test morning against evening for your own list.",
      fa: "\u0647\u0631 \u0647\u0641\u062A\u0647 \u062F\u0631 \u06CC\u06A9 \u0631\u0648\u0632 \u062B\u0627\u0628\u062A \u0628\u0641\u0631\u0633\u062A\u06CC\u062F\u061B \u0635\u0628\u062D \u0648 \u0639\u0635\u0631 \u0631\u0627 \u0628\u0631\u0627\u06CC \u0641\u0647\u0631\u0633\u062A \u0645\u0634\u062A\u0631\u06A9\u200C\u0647\u0627\u06CC \u062E\u0648\u062F\u062A\u0627\u0646 \u0622\u0632\u0645\u0627\u06CC\u0634 \u06A9\u0646\u06CC\u062F.",
      tr: "Her hafta ayn\u0131 g\xFCn g\xF6nderin; kendi listeniz i\xE7in sabah\u0131 ak\u015Famla kar\u015F\u0131la\u015Ft\u0131rarak test edin."
    },
    craft: [
      {
        en: "The subject line and preview text are the hook; say what the reader gets.",
        fa: "\u0639\u0646\u0648\u0627\u0646 \u0627\u06CC\u0645\u06CC\u0644 \u0648 \u0645\u062A\u0646 \u067E\u06CC\u0634\u200C\u0646\u0645\u0627\u06CC\u0634\u060C \u0642\u0644\u0627\u0628 \u0634\u0645\u0627 \u0647\u0633\u062A\u0646\u062F\u061B \u0628\u06AF\u0648\u06CC\u06CC\u062F \u062E\u0648\u0627\u0646\u0646\u062F\u0647 \u0686\u0647 \u0686\u06CC\u0632\u06CC \u0628\u0647 \u062F\u0633\u062A \u0645\u06CC\u200C\u0622\u0648\u0631\u062F.",
        tr: "Konu sat\u0131r\u0131 ve \xF6nizleme metni kancad\u0131r; okurun ne kazanaca\u011F\u0131n\u0131 s\xF6yleyin."
      },
      {
        en: "One main idea and one main call to action per issue.",
        fa: "\u062F\u0631 \u0647\u0631 \u0634\u0645\u0627\u0631\u0647 \u06CC\u06A9 \u0627\u06CC\u062F\u0647\u0654 \u0627\u0635\u0644\u06CC \u0648 \u06CC\u06A9 \u062F\u0639\u0648\u062A \u0628\u0647 \u0627\u0642\u062F\u0627\u0645 \u0627\u0635\u0644\u06CC.",
        tr: "Her say\u0131da tek ana fikir ve tek ana eylem \xE7a\u011Fr\u0131s\u0131."
      },
      {
        en: "Write to one person and ask for replies; replies help deliverability and give you ideas.",
        fa: "\u0637\u0648\u0631\u06CC \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F \u06A9\u0647 \u0627\u0646\u06AF\u0627\u0631 \u0628\u0631\u0627\u06CC \u06CC\u06A9 \u0646\u0641\u0631 \u0645\u06CC\u200C\u0646\u0648\u06CC\u0633\u06CC\u062F \u0648 \u0627\u0632 \u062E\u0648\u0627\u0646\u0646\u062F\u0647 \u0628\u062E\u0648\u0627\u0647\u06CC\u062F \u062C\u0648\u0627\u0628 \u0628\u062F\u0647\u062F\u061B \u062C\u0648\u0627\u0628\u200C\u0647\u0627 \u0647\u0645 \u0628\u0647 \u0631\u0633\u06CC\u062F\u0646 \u0627\u06CC\u0645\u06CC\u0644 \u06A9\u0645\u06A9 \u0645\u06CC\u200C\u06A9\u0646\u0646\u062F \u0647\u0645 \u0627\u06CC\u062F\u0647 \u0645\u06CC\u200C\u062F\u0647\u0646\u062F.",
        tr: "Tek bir ki\u015Fiye yazar gibi yaz\u0131n ve yan\u0131t isteyin; yan\u0131tlar hem ula\u015F\u0131labilirli\u011Fe yard\u0131m eder hem fikir verir."
      },
      {
        en: "Keep a consistent format so readers know what to expect.",
        fa: "\u0642\u0627\u0644\u0628 \u062B\u0627\u0628\u062A\u06CC \u062F\u0627\u0634\u062A\u0647 \u0628\u0627\u0634\u06CC\u062F \u062A\u0627 \u062E\u0648\u0627\u0646\u0646\u062F\u0647 \u0628\u062F\u0627\u0646\u062F \u0686\u0647 \u0627\u0646\u062A\u0638\u0627\u0631\u06CC \u062F\u0627\u0634\u062A\u0647 \u0628\u0627\u0634\u062F.",
        tr: "Okurlar\u0131n ne bekleyece\u011Fini bilmesi i\xE7in tutarl\u0131 bir format kullan\u0131n."
      }
    ]
  },
  {
    channel: "blog",
    basis: "general_practice",
    role: {
      en: "Search and depth: articles that answer your audience's questions and that other channels can link to.",
      fa: "\u062C\u0633\u062A\u200C\u0648\u062C\u0648 \u0648 \u0639\u0645\u0642: \u0645\u0642\u0627\u0644\u0647\u200C\u0647\u0627\u06CC\u06CC \u06A9\u0647 \u0628\u0647 \u067E\u0631\u0633\u0634\u200C\u0647\u0627\u06CC \u0645\u062E\u0627\u0637\u0628 \u062C\u0648\u0627\u0628 \u0645\u06CC\u200C\u062F\u0647\u0646\u062F \u0648 \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\u06CC \u062F\u06CC\u06AF\u0631 \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u0646\u062F \u0628\u0647 \u0622\u0646\u200C\u0647\u0627 \u0644\u06CC\u0646\u06A9 \u0628\u062F\u0647\u0646\u062F.",
      tr: "Arama ve derinlik: hedef kitlenizin sorular\u0131n\u0131 yan\u0131tlayan ve di\u011Fer kanallar\u0131n ba\u011Flant\u0131 verebilece\u011Fi makaleler."
    },
    formats: ["article"],
    cadence: { per: "month", min: 2, max: 8, start: 4 },
    objective: "authority",
    mix: mix({ educate: 70, inspire: 10, promote: 20 }),
    kpis: [
      { metric: "reach", per: "post" },
      { metric: "link_clicks", per: "post" },
      { metric: "leads", per: "month" }
    ],
    posting_windows_note: {
      en: "Timing matters little because search traffic builds over months; publish on a steady rhythm.",
      fa: "\u0632\u0645\u0627\u0646 \u0627\u0646\u062A\u0634\u0627\u0631 \u0627\u0647\u0645\u06CC\u062A \u0686\u0646\u062F\u0627\u0646\u06CC \u0646\u062F\u0627\u0631\u062F \u0686\u0648\u0646 \u062A\u0631\u0627\u0641\u06CC\u06A9 \u062C\u0633\u062A\u200C\u0648\u062C\u0648 \u062F\u0631 \u0637\u0648\u0644 \u0645\u0627\u0647\u200C\u0647\u0627 \u0634\u06A9\u0644 \u0645\u06CC\u200C\u06AF\u06CC\u0631\u062F\u061B \u0628\u0627 \u0631\u06CC\u062A\u0645\u06CC \u062B\u0627\u0628\u062A \u0645\u0646\u062A\u0634\u0631 \u06A9\u0646\u06CC\u062F.",
      tr: "Arama trafi\u011Fi aylar i\xE7inde olu\u015Ftu\u011Fu i\xE7in zamanlama pek \xF6nemli de\u011Fildir; d\xFCzenli bir ritimle yay\u0131nlay\u0131n."
    },
    craft: [
      {
        en: "One question per article: answer it early, then explain.",
        fa: "\u0647\u0631 \u0645\u0642\u0627\u0644\u0647 \u06CC\u06A9 \u067E\u0631\u0633\u0634: \u062C\u0648\u0627\u0628 \u0631\u0627 \u0632\u0648\u062F \u0628\u062F\u0647\u06CC\u062F \u0648 \u0628\u0639\u062F \u062A\u0648\u0636\u06CC\u062D \u062F\u0647\u06CC\u062F.",
        tr: "Her makalede tek soru: cevab\u0131 erken verin, sonra a\xE7\u0131klay\u0131n."
      },
      {
        en: "Headings that read like the questions people ask.",
        fa: "\u062A\u06CC\u062A\u0631\u0647\u0627\u06CC\u06CC \u06A9\u0647 \u0634\u0628\u06CC\u0647 \u0647\u0645\u0627\u0646 \u067E\u0631\u0633\u0634\u200C\u0647\u0627\u06CC\u06CC \u0628\u0627\u0634\u0646\u062F \u06A9\u0647 \u0645\u0631\u062F\u0645 \u0645\u06CC\u200C\u067E\u0631\u0633\u0646\u062F.",
        tr: "\u0130nsanlar\u0131n sordu\u011Fu sorular gibi okunan ara ba\u015Fl\u0131klar."
      },
      {
        en: "Back every claim with an approved fact or a cited source.",
        fa: "\u0647\u0631 \u0627\u062F\u0639\u0627 \u0631\u0627 \u0628\u0627 \u06CC\u06A9 \u0648\u0627\u0642\u0639\u06CC\u062A \u062A\u0623\u06CC\u06CC\u062F\u0634\u062F\u0647 \u06CC\u0627 \u0645\u0646\u0628\u0639\u06CC \u06A9\u0647 \u0628\u0647 \u0622\u0646 \u0627\u0631\u062C\u0627\u0639 \u062F\u0627\u062F\u0647\u200C\u0627\u06CC\u062F \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u06A9\u0646\u06CC\u062F.",
        tr: "Her iddiay\u0131 onayl\u0131 bir bilgiyle ya da at\u0131f yap\u0131lan bir kaynakla destekleyin."
      },
      {
        en: "Link related articles to each other and turn each article into a few social posts.",
        fa: "\u0645\u0642\u0627\u0644\u0647\u200C\u0647\u0627\u06CC \u0645\u0631\u062A\u0628\u0637 \u0631\u0627 \u0628\u0647 \u0647\u0645 \u0644\u06CC\u0646\u06A9 \u062F\u0647\u06CC\u062F \u0648 \u0647\u0631 \u0645\u0642\u0627\u0644\u0647 \u0631\u0627 \u0628\u0647 \u0686\u0646\u062F \u067E\u0633\u062A \u0634\u0628\u06A9\u0647\u0654 \u0627\u062C\u062A\u0645\u0627\u0639\u06CC \u062A\u0628\u062F\u06CC\u0644 \u06A9\u0646\u06CC\u062F.",
        tr: "\u0130lgili makaleleri birbirine ba\u011Flay\u0131n ve her makaleyi birka\xE7 sosyal medya g\xF6nderisine d\xF6n\xFC\u015Ft\xFCr\xFCn."
      }
    ]
  }
];
var CHANNEL_PLAYBOOK = Object.fromEntries(ENTRIES.map((entry) => [entry.channel, entry]));
function playbookFor(channel) {
  return CHANNEL_PLAYBOOK[channel] ?? null;
}
var PLAYBOOK_NOTICE = {
  en: [
    "General practice for this kind of channel, not measured for this brand. Every value is a starting point the owner reviews and replaces with what the brand\u2019s own results show.",
    "It is not a brand fact: voice, claims and audience come only from approved facts. KPIs name what to watch; targets are the owner\u2019s.",
    "It authorizes nothing: no post, schedule, publication or spend."
  ],
  fa: [
    "\u0627\u06CC\u0646\u200C\u0647\u0627 \u0631\u0648\u0627\u0644 \u0631\u0627\u06CC\u062C \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u0646\u0648\u0639 \u06A9\u0627\u0646\u0627\u0644 \u0627\u0633\u062A \u0648 \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u0628\u0631\u0646\u062F \u0627\u0646\u062F\u0627\u0632\u0647\u200C\u06AF\u06CC\u0631\u06CC \u0646\u0634\u062F\u0647. \u0647\u0631 \u0645\u0642\u062F\u0627\u0631 \u0641\u0642\u0637 \u0646\u0642\u0637\u0647\u0654 \u0634\u0631\u0648\u0639\u06CC \u0627\u0633\u062A \u06A9\u0647 \u0645\u0627\u0644\u06A9 \u0628\u0631\u0631\u0633\u06CC \u0645\u06CC\u200C\u06A9\u0646\u062F \u0648 \u0648\u0642\u062A\u06CC \u0646\u062A\u0627\u06CC\u062C \u062E\u0648\u062F \u0628\u0631\u0646\u062F \u0622\u0645\u062F\u060C \u0628\u0627 \u0622\u0646\u200C\u0647\u0627 \u062C\u0627\u06CC\u06AF\u0632\u06CC\u0646 \u0645\u06CC\u200C\u0634\u0648\u062F.",
    "\u0627\u06CC\u0646 \u0648\u0627\u0642\u0639\u06CC\u062A\u0650 \u0628\u0631\u0646\u062F \u0646\u06CC\u0633\u062A: \u0644\u062D\u0646\u060C \u0627\u062F\u0639\u0627\u0647\u0627 \u0648 \u0645\u062E\u0627\u0637\u0628 \u0641\u0642\u0637 \u0627\u0632 \u0648\u0627\u0642\u0639\u06CC\u062A\u200C\u0647\u0627\u06CC \u062A\u0623\u06CC\u06CC\u062F\u0634\u062F\u0647 \u0645\u06CC\u200C\u0622\u06CC\u0646\u062F. \u0634\u0627\u062E\u0635\u200C\u0647\u0627 \u0641\u0642\u0637 \u0645\u06CC\u200C\u06AF\u0648\u06CC\u0646\u062F \u0686\u0647 \u0686\u06CC\u0632\u06CC \u0631\u0627 \u0632\u06CC\u0631 \u0646\u0638\u0631 \u0628\u06AF\u06CC\u0631\u06CC\u062F\u061B \u0647\u062F\u0641 \u0639\u062F\u062F\u06CC \u0631\u0627 \u0645\u0627\u0644\u06A9 \u062A\u0639\u06CC\u06CC\u0646 \u0645\u06CC\u200C\u06A9\u0646\u062F.",
    "\u0647\u06CC\u0686 \u0645\u062C\u0648\u0632\u06CC \u0646\u0645\u06CC\u200C\u062F\u0647\u062F: \u0646\u0647 \u0627\u0646\u062A\u0634\u0627\u0631\u060C \u0646\u0647 \u0632\u0645\u0627\u0646\u200C\u0628\u0646\u062F\u06CC\u060C \u0646\u0647 \u0647\u0632\u06CC\u0646\u0647."
  ],
  tr: [
    "Bu t\xFCr bir kanal i\xE7in genel uygulamad\u0131r; bu marka i\xE7in \xF6l\xE7\xFClmemi\u015Ftir. Her de\u011Fer, sahibin g\xF6zden ge\xE7irdi\u011Fi ve markan\u0131n kendi sonu\xE7lar\u0131yla de\u011Fi\u015Ftirdi\u011Fi bir ba\u015Flang\u0131\xE7 noktas\u0131d\u0131r.",
    "Marka bilgisi de\u011Fildir: ses tonu, iddialar ve hedef kitle yaln\u0131zca onayl\u0131 bilgilerden gelir. KPI\u2019lar neyin izlenece\u011Fini s\xF6yler; hedefler sahibindir.",
    "Hi\xE7bir \u015Feye yetki vermez: g\xF6nderi, zamanlama, yay\u0131n veya harcama yok."
  ]
};
var OBJECTIVE_LABELS = {
  awareness: { en: "awareness", fa: "\u062F\u06CC\u062F\u0647\u200C\u0634\u062F\u0646", tr: "bilinirlik" },
  engagement: { en: "engagement", fa: "\u062A\u0639\u0627\u0645\u0644", tr: "etkile\u015Fim" },
  community: { en: "community", fa: "\u062C\u0627\u0645\u0639\u0647\u200C\u0633\u0627\u0632\u06CC", tr: "topluluk" },
  leads: { en: "leads", fa: "\u062C\u0630\u0628 \u0645\u0634\u062A\u0631\u06CC \u0628\u0627\u0644\u0642\u0648\u0647", tr: "potansiyel m\xFC\u015Fteri" },
  sales: { en: "sales", fa: "\u0641\u0631\u0648\u0634", tr: "sat\u0131\u015F" },
  authority: { en: "authority", fa: "\u0627\u0639\u062A\u0628\u0627\u0631 \u0648 \u0645\u0631\u062C\u0639\u06CC\u062A", tr: "otorite" },
  retention: { en: "retention", fa: "\u062D\u0641\u0638 \u0645\u062E\u0627\u0637\u0628", tr: "elde tutma" }
};
var MIX_LABELS = {
  educate: { en: "educate", fa: "\u0622\u0645\u0648\u0632\u0634", tr: "e\u011Fitmek" },
  inspire: { en: "inspire", fa: "\u0627\u0644\u0647\u0627\u0645\u200C\u0628\u062E\u0634\u06CC", tr: "ilham vermek" },
  connect: { en: "connect", fa: "\u0627\u0631\u062A\u0628\u0627\u0637", tr: "ba\u011F kurmak" },
  promote: { en: "promote", fa: "\u0645\u0639\u0631\u0641\u06CC \u0648 \u0641\u0631\u0648\u0634", tr: "tan\u0131tmak" },
  entertain: { en: "entertain", fa: "\u0633\u0631\u06AF\u0631\u0645\u06CC", tr: "e\u011Flendirmek" }
};
var KPI_LABELS = {
  reach: { en: "reach", fa: "\u062F\u0633\u062A\u0631\u0633\u06CC", tr: "eri\u015Fim" },
  saves: { en: "saves", fa: "\u0630\u062E\u06CC\u0631\u0647", tr: "kaydetme" },
  shares: { en: "shares", fa: "\u0627\u0634\u062A\u0631\u0627\u06A9\u200C\u06AF\u0630\u0627\u0631\u06CC", tr: "payla\u015F\u0131m" },
  comments: { en: "comments", fa: "\u06A9\u0627\u0645\u0646\u062A", tr: "yorum" },
  follows: { en: "new followers", fa: "\u062F\u0646\u0628\u0627\u0644\u200C\u06A9\u0646\u0646\u062F\u0647\u0654 \u062A\u0627\u0632\u0647", tr: "yeni takip\xE7i" },
  profile_visits: { en: "profile visits", fa: "\u0628\u0627\u0632\u062F\u06CC\u062F \u067E\u0631\u0648\u0641\u0627\u06CC\u0644", tr: "profil ziyareti" },
  link_clicks: { en: "link clicks", fa: "\u06A9\u0644\u06CC\u06A9 \u0631\u0648\u06CC \u0644\u06CC\u0646\u06A9", tr: "ba\u011Flant\u0131 t\u0131klamas\u0131" },
  leads: { en: "leads", fa: "\u0633\u0631\u0646\u062E \u0641\u0631\u0648\u0634", tr: "potansiyel m\xFC\u015Fteri" },
  watch_time: { en: "watch time", fa: "\u0632\u0645\u0627\u0646 \u062A\u0645\u0627\u0634\u0627", tr: "izlenme s\xFCresi" },
  completion_rate: { en: "completion rate", fa: "\u0646\u0631\u062E \u062A\u0645\u0627\u0634\u0627\u06CC \u06A9\u0627\u0645\u0644", tr: "tamamlanma oran\u0131" },
  replies: { en: "replies", fa: "\u067E\u0627\u0633\u062E", tr: "yan\u0131t" },
  subscribers: { en: "subscribers", fa: "\u0645\u0634\u062A\u0631\u06A9", tr: "abone" }
};
var PERIOD_LABELS = {
  post: { en: "per post", fa: "\u062F\u0631 \u0647\u0631 \u067E\u0633\u062A", tr: "g\xF6nderi ba\u015F\u0131na" },
  week: { en: "per week", fa: "\u062F\u0631 \u0647\u0641\u062A\u0647", tr: "haftal\u0131k" },
  month: { en: "per month", fa: "\u062F\u0631 \u0645\u0627\u0647", tr: "ayl\u0131k" }
};
var PLAYBOOK_TEXT = {
  header: { en: "Channel playbook (general practice, not measured for this brand)", fa: "\u0631\u0627\u0647\u0646\u0645\u0627\u06CC \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627 (\u0631\u0648\u0627\u0644 \u0631\u0627\u06CC\u062C\u060C \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u0628\u0631\u0646\u062F \u0627\u0646\u062F\u0627\u0632\u0647\u200C\u06AF\u06CC\u0631\u06CC \u0646\u0634\u062F\u0647)", tr: "Kanal rehberi (genel uygulama, bu marka i\xE7in \xF6l\xE7\xFClmedi)" },
  role: { en: "Role", fa: "\u0646\u0642\u0634", tr: "Rol" },
  formats: { en: "Formats", fa: "\u0642\u0627\u0644\u0628\u200C\u0647\u0627", tr: "Formatlar" },
  cadence: { en: "Cadence", fa: "\u062A\u0646\u0627\u0648\u0628 \u0627\u0646\u062A\u0634\u0627\u0631", tr: "S\u0131kl\u0131k" },
  cadence_value: { en: "{min}\u2013{max} per {per}, start at {start}", fa: "{min} \u062A\u0627 {max} \u062F\u0631 {per}\u060C \u0634\u0631\u0648\u0639 \u0628\u0627 {start}", tr: "{per} ba\u015F\u0131na {min}\u2013{max}, {start} ile ba\u015Flay\u0131n" },
  objective: { en: "Objective", fa: "\u0647\u062F\u0641", tr: "Hedef" },
  mix: { en: "Mix", fa: "\u062A\u0631\u06A9\u06CC\u0628 \u0645\u062D\u062A\u0648\u0627", tr: "\u0130\xE7erik kar\u0131\u015F\u0131m\u0131" },
  kpis: { en: "Watch", fa: "\u0634\u0627\u062E\u0635\u200C\u0647\u0627\u06CC\u06CC \u06A9\u0647 \u0628\u0627\u06CC\u062F \u0632\u06CC\u0631 \u0646\u0638\u0631 \u0628\u06AF\u06CC\u0631\u06CC\u062F", tr: "\u0130zlenecekler" },
  windows: { en: "Posting windows", fa: "\u0632\u0645\u0627\u0646 \u0627\u0646\u062A\u0634\u0627\u0631", tr: "Payla\u015F\u0131m saatleri" },
  craft: { en: "Craft notes", fa: "\u0646\u06A9\u062A\u0647\u200C\u0647\u0627\u06CC \u0627\u062C\u0631\u0627\u06CC\u06CC", tr: "Uygulama notlar\u0131" },
  week: { en: "week", fa: "\u0647\u0641\u062A\u0647", tr: "hafta" },
  month: { en: "month", fa: "\u0645\u0627\u0647", tr: "ay" },
  no_entry: {
    en: "The playbook has no entry for {channel}. Channels with an entry: {list}.",
    fa: "\u0631\u0627\u0647\u0646\u0645\u0627 \u0628\u0631\u0627\u06CC {channel} \u0645\u0648\u0631\u062F\u06CC \u0646\u062F\u0627\u0631\u062F. \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\u06CC\u06CC \u06A9\u0647 \u0645\u0648\u0631\u062F \u062F\u0627\u0631\u0646\u062F: {list}.",
    tr: "Rehberde {channel} i\xE7in bir kay\u0131t yok. Kayd\u0131 olan kanallar: {list}."
  }
};
function localizeEntry(entry, lang) {
  return {
    channel: entry.channel,
    basis: entry.basis,
    role: entry.role[lang],
    formats: [...entry.formats],
    cadence: { ...entry.cadence },
    objective: { id: entry.objective, label: OBJECTIVE_LABELS[entry.objective][lang] },
    mix: entry.mix.map((m) => ({ ...m, label: MIX_LABELS[m.type][lang] })),
    kpis: entry.kpis.map((k) => ({ metric: k.metric, per: k.per, target: null, label: `${KPI_LABELS[k.metric][lang]} (${PERIOD_LABELS[k.per][lang]})` })),
    posting_windows_note: entry.posting_windows_note[lang],
    craft: entry.craft.map((note) => note[lang])
  };
}
function playbookDocument(lang, channel) {
  let entries = ENTRIES;
  if (channel) {
    const entry = playbookFor(channel);
    if (!entry) throw new StrategyError("not_found", PLAYBOOK_TEXT.no_entry[lang].replace("{channel}", channel).replace("{list}", ENTRIES.map((e) => e.channel).join(", ")));
    entries = [entry];
  }
  return { schema: CONTENT_PLAYBOOK_SCHEMA, kind: "content_playbook", basis: "general_practice", lang, entries: entries.map((entry) => localizeEntry(entry, lang)), authorizes: [], notice: PLAYBOOK_NOTICE[lang] };
}
function playbookProblems() {
  const out = [];
  for (const entry of ENTRIES) {
    const total = entry.mix.reduce((sum, m) => sum + m.share, 0);
    if (total !== 100) out.push(`${entry.channel}: mix sums to ${total}`);
    if (!CHANNEL_OBJECTIVES.includes(entry.objective)) out.push(`${entry.channel}: objective`);
    for (const k of entry.kpis) if (!CHANNEL_KPI_METRICS.includes(k.metric)) out.push(`${entry.channel}: kpi ${k.metric}`);
    if (entry.craft.length < 3 || entry.craft.length > 6) out.push(`${entry.channel}: ${entry.craft.length} craft notes`);
    if (entry.cadence.start < entry.cadence.min || entry.cadence.start > entry.cadence.max) out.push(`${entry.channel}: cadence start`);
    if (entry.kpis.length > 6) out.push(`${entry.channel}: too many kpis`);
  }
  return out;
}

// packages/brand-core/src/content-bridge/propose.ts
function gapText(gap, lang) {
  const facts = gap.fact_ids.join(", ") || "\u2014";
  const channel = /^channels\[([a-z]+)\]\.(role|formats|cadence)$/.exec(gap.field);
  if (channel) return fill(GAP_TEXT[`channel_${channel[2]}`][lang], { channel: channel[1], part: CHANNEL_PARTS[channel[2]][lang] });
  if (gap.field === "pillars" && gap.reason === "owner_decision") return fill(GAP_TEXT.pillars_unnamed[lang], { facts });
  if (gap.field === "channels" && gap.reason === "owner_decision") return fill(GAP_TEXT.channels_none[lang], { facts });
  const role = ROLE_LABELS[gap.field]?.[lang] ?? gap.field;
  return fill(GAP_TEXT[gap.reason][lang], { role, facts });
}
function describeGap(gap, lang) {
  return gapText(gap, lang);
}
function day(date, plus) {
  return new Date(date.getTime() + plus * 864e5).toISOString().slice(0, 10);
}
function pillarsFrom(reports, values, notes, lang) {
  const pillars = [];
  for (const report of reports.filter((r) => r.role === "pillars" && r.state === "approved")) {
    const value = values[report.fact_id];
    if (typeof value !== "string") continue;
    let skipped = false;
    for (const item of splitItems(value)) {
      if (pillars.length >= STRATEGY_LIMITS.maxPillars) break;
      let name;
      try {
        name = text(item, "pillar", 80);
      } catch (error) {
        if (!(error instanceof StrategyError)) throw error;
        skipped = true;
        continue;
      }
      if (pillars.some((p) => p.name.toLowerCase() === name.toLowerCase())) continue;
      pillars.push({ id: `p${pillars.length + 1}`, name, fact_refs: [report.fact_id] });
    }
    if (skipped) notes.push(fill(NOTES.pillar_skipped[lang], { id: report.fact_id }));
  }
  return pillars;
}
function servedStrategies(ws) {
  const out = [];
  const now = ws.now();
  for (const record of scanRecords(ws)) {
    if (record.type === "content") continue;
    const found = servable(ws, record, now);
    if (found.entry) out.push({ strategy_id: record.strategy_id, revision: found.entry.revision, content_sha256: found.entry.content_sha256 });
  }
  return out;
}
function buildContentStrategy(ws, opts) {
  assertOwnerProcess();
  const lang = opts.lang;
  const settings = brandSettings(ws);
  const facts = readFacts(ws.root, "approved", ws.brandSlug);
  const reports = readSources(ws, settings, facts);
  const values = Object.fromEntries(reports.filter((r) => r.state === "approved").map((r) => [r.fact_id, facts[r.fact_id].value]));
  const notes = [];
  const gaps = roleGaps(reports).map((gap) => ({ field: gap.role, reason: gap.reason, fact_ids: gap.fact_ids }));
  const sources = Object.fromEntries(CONTENT_SOURCE_ROLES.map((role) => [role, reports.filter((r) => r.role === role && r.state === "approved").map((r) => r.fact_id)]));
  const pillars = pillarsFrom(reports, values, notes, lang);
  if (!pillars.length && sources.pillars.length) gaps.push({ field: "pillars", reason: "owner_decision", fact_ids: sources.pillars });
  const channelFacts = reports.filter((r) => r.role === "channels" && r.state === "approved");
  const mentions = /* @__PURE__ */ new Map();
  for (const report of channelFacts) {
    const value = values[report.fact_id];
    if (typeof value !== "string") continue;
    for (const channel of detectChannels(value)) mentions.set(channel, [...mentions.get(channel) ?? [], report.fact_id]);
  }
  const detected = CONTENT_CHANNELS.filter((channel) => mentions.has(channel));
  const chosen = opts.channels?.length ? [...new Set(opts.channels)] : detected;
  if (!opts.channels?.length && detected.length) notes.push(fill(NOTES.channels_detected[lang], { list: detected.join(", ") }));
  if (!chosen.length) gaps.push({ field: "channels", reason: "owner_decision", fact_ids: reports.filter((r) => r.role === "channels" && r.state !== "restricted").map((r) => r.fact_id) });
  const fromPlaybook = [];
  const channels = chosen.map((channel) => {
    const refs = mentions.get(channel) ?? [];
    if (opts.channels?.length && !refs.length) notes.push(fill(NOTES.channel_not_in_facts[lang], { channel }));
    const entry = opts.playbook ? playbookFor(channel) : null;
    if (opts.playbook && !entry) notes.push(fill(PLAYBOOK_NOTES.none[lang], { channel }));
    const formats = [...new Set(opts.formats?.[channel] ?? entry?.formats ?? [])];
    const cadence = opts.cadence?.[channel] ?? (entry ? { per: entry.cadence.per, target: entry.cadence.start } : null);
    const role = entry ? entry.role[lang] : null;
    if (!role) gaps.push({ field: `channels[${channel}].role`, reason: "owner_decision", fact_ids: [] });
    if (!formats.length) gaps.push({ field: `channels[${channel}].formats`, reason: "owner_decision", fact_ids: [] });
    if (!cadence) gaps.push({ field: `channels[${channel}].cadence`, reason: "owner_decision", fact_ids: [] });
    const plan = { channel, role, formats, cadence, languages: [], pillars: [], fact_refs: refs };
    if (entry) {
      const filled = ["role", ...opts.formats?.[channel] ? [] : ["formats"], ...opts.cadence?.[channel] ? [] : ["cadence"], "objective", "mix", "kpis"];
      notes.push(fill(PLAYBOOK_NOTES.filled[lang], { channel, list: filled.join(", ") }));
      fromPlaybook.push(channel);
      plan.objective = entry.objective;
      plan.mix = entry.mix.map((m) => ({ ...m }));
      plan.kpis = entry.kpis.map((k) => ({ metric: k.metric, target: null, per: k.per }));
    }
    return plan;
  });
  const languages = opts.languages?.length ? [...new Set(opts.languages)] : [settings.default_locale];
  if (!opts.languages?.length) notes.push(fill(NOTES.languages_default[lang], { lang: settings.default_locale }));
  const strategyRefs = servedStrategies(ws);
  if (strategyRefs.length) notes.push(fill(NOTES.strategies_pinned[lang], { list: strategyRefs.map((r) => `${r.strategy_id}@${r.revision}`).join(", ") }));
  notes.push(NOTES.voice_not_copied[lang]);
  const block = {
    schema: 1,
    languages,
    pillars,
    channels,
    sources,
    voice_rules: { do: [], dont: [] },
    vocabulary: { prefer: [], avoid: [] },
    banned_claims: [],
    cta_rules: [],
    strategy_refs: strategyRefs,
    gaps: gaps.slice(0, STRATEGY_LIMITS.maxGaps)
  };
  const factIds = [.../* @__PURE__ */ new Set([...Object.values(sources).flat(), ...pillars.flatMap((p) => p.fact_refs), ...channels.flatMap((c) => c.fact_refs)])];
  const now = ws.now();
  const proposal = {
    title: PROPOSAL_TEXT.title[lang],
    type: "content",
    locale: lang,
    scope: { markets: opts.markets?.length ? opts.markets : [settings.default_locale], channel: "content", period: null },
    valid_from: day(now, 0),
    valid_until: day(now, opts.valid_days ?? 180),
    review_due_at: day(now, opts.review_days ?? 90),
    objective: { statement: PROPOSAL_TEXT.objective[lang], status: "hypothesis" },
    success_metrics: [],
    guardrails: [PROPOSAL_TEXT.guardrail_facts[lang], PROPOSAL_TEXT.guardrail_voice[lang]],
    constraints: [],
    must_do: [],
    must_not_do: [],
    non_goals: [PROPOSAL_TEXT.non_goal_publish[lang], PROPOSAL_TEXT.non_goal_ads[lang]],
    alternatives: [],
    selection_rationale: PROPOSAL_TEXT.rationale[lang],
    recommendations: [],
    fact_refs: factIds,
    evidence_refs: [],
    assumptions: fromPlaybook.length ? [fill(PLAYBOOK_NOTES.assumption[lang], { list: fromPlaybook.join(", ") })] : [],
    open_questions: [],
    restricted: null,
    origin: { kind: "manual" },
    content_strategy: block
  };
  parseProposal(proposal);
  return { proposal, block, sources: reports, gaps: block.gaps.map((gap) => ({ ...gap, text: gapText(gap, lang) })), detected_channels: detected, notes };
}
var PLAYBOOK_NOTES = {
  filled: {
    en: "{channel}: {list} come from the general-practice channel playbook, not from this brand\u2019s results. Review them before approving.",
    fa: "{channel}: {list} \u0627\u0632 \u0631\u0627\u0647\u0646\u0645\u0627\u06CC \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627 (\u0631\u0648\u0627\u0644 \u0631\u0627\u06CC\u062C) \u0622\u0645\u062F\u0647\u060C \u0646\u0647 \u0627\u0632 \u0646\u062A\u0627\u06CC\u062C \u0627\u06CC\u0646 \u0628\u0631\u0646\u062F. \u067E\u06CC\u0634 \u0627\u0632 \u062A\u0623\u06CC\u06CC\u062F \u0628\u0631\u0631\u0633\u06CC\u200C\u0634\u0627\u0646 \u06A9\u0646\u06CC\u062F.",
    tr: "{channel}: {list} genel uygulama kanal rehberinden geliyor, bu markan\u0131n sonu\xE7lar\u0131ndan de\u011Fil. Onaylamadan \xF6nce g\xF6zden ge\xE7irin."
  },
  none: {
    en: "{channel}: the channel playbook has no entry; its role, formats and cadence stay owner decisions.",
    fa: "{channel}: \u0631\u0627\u0647\u0646\u0645\u0627\u06CC \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627 \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u06A9\u0627\u0646\u0627\u0644 \u0645\u0648\u0631\u062F\u06CC \u0646\u062F\u0627\u0631\u062F\u061B \u0646\u0642\u0634\u060C \u0642\u0627\u0644\u0628\u200C\u0647\u0627 \u0648 \u062A\u0646\u0627\u0648\u0628 \u0622\u0646 \u0631\u0627 \u0645\u0627\u0644\u06A9 \u062A\u0639\u06CC\u06CC\u0646 \u0645\u06CC\u200C\u06A9\u0646\u062F.",
    tr: "{channel}: kanal rehberinde kay\u0131t yok; rol\xFC, formatlar\u0131 ve s\u0131kl\u0131\u011F\u0131 sahibin karar\u0131 olarak kal\u0131r."
  },
  assumption: {
    en: "Channel plans for {list} start from the general-practice playbook, not from measured results of this brand.",
    fa: "\u0628\u0631\u0646\u0627\u0645\u0647\u0654 \u06A9\u0627\u0646\u0627\u0644\u200C\u0647\u0627\u06CC {list} \u0627\u0632 \u0631\u0627\u0647\u0646\u0645\u0627\u06CC \u0631\u0648\u0627\u0644 \u0631\u0627\u06CC\u062C \u0634\u0631\u0648\u0639 \u0634\u062F\u0647\u060C \u0646\u0647 \u0627\u0632 \u0646\u062A\u0627\u06CC\u062C \u0627\u0646\u062F\u0627\u0632\u0647\u200C\u06AF\u06CC\u0631\u06CC\u200C\u0634\u062F\u0647\u0654 \u0627\u06CC\u0646 \u0628\u0631\u0646\u062F.",
    tr: "{list} kanal planlar\u0131 bu markan\u0131n \xF6l\xE7\xFClm\xFC\u015F sonu\xE7lar\u0131ndan de\u011Fil, genel uygulama rehberinden ba\u015Flar."
  }
};
function parseCadence(value) {
  const out = {};
  for (const part of value.split(",").map((item) => item.trim()).filter(Boolean)) {
    const match = /^([a-z]+)=(\d{1,2})\/(week|month)$/.exec(part);
    if (!match || !CONTENT_CHANNELS.includes(match[1])) throw new StrategyError("invalid_input", `--cadence takes channel=n/week or channel=n/month, for example instagram=3/week (got ${part}).`);
    const target = Number(match[2]);
    if (target < 1 || target > STRATEGY_LIMITS.maxCadence) throw new StrategyError("invalid_input", `--cadence target must be 1 to ${STRATEGY_LIMITS.maxCadence}.`);
    out[match[1]] = { per: match[3], target };
  }
  return out;
}
function parseFormats(value) {
  const out = {};
  for (const part of value.split(",").map((item) => item.trim()).filter(Boolean)) {
    const [channel, list] = part.split("=");
    const formats = (list ?? "").split("+").filter(Boolean);
    if (!channel || !CONTENT_CHANNELS.includes(channel) || !formats.length || !formats.every((f) => CONTENT_FORMATS.includes(f))) {
      throw new StrategyError("invalid_input", `--formats takes channel=format+format, formats ${CONTENT_FORMATS.join(", ")} (got ${part}).`);
    }
    out[channel] = formats;
  }
  return out;
}
function parseChannels(value) {
  const list = value.split(",").map((item) => item.trim()).filter(Boolean);
  for (const item of list) if (!CONTENT_CHANNELS.includes(item)) throw new StrategyError("invalid_input", `Unknown channel ${item}. Channels: ${CONTENT_CHANNELS.join(", ")}.`);
  return list;
}

// packages/brand-core/src/content-bridge/claims.ts
function normalizeClaimText(value) {
  const lower = value.normalize("NFKC").replace(/İ/g, "i").replace(/I/g, "i").toLowerCase().replace(/\u200c|\u200d|\u0640/g, "").replace(/[ي]/g, "\u06CC").replace(/[ك]/g, "\u06A9");
  return ` ${lower.replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim()} `;
}
function words(normalized) {
  return normalized.trim().split(" ").filter((word) => [...word].length >= 4);
}
function containsClaim(textValue, banned) {
  const t = normalizeClaimText(textValue);
  const b = normalizeClaimText(banned);
  if (b.trim().length < 2) return false;
  if (t.includes(b)) return true;
  const significant = words(b);
  return significant.length >= 2 && significant.every((word) => t.includes(` ${word} `));
}
var AVAILABLE_NOW = ["available now", "available today", "now available", "out now", "in stock", "buy now", "order now", "shop now", "download now", "\u0647\u0645 \u0627\u06A9\u0646\u0648\u0646 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633", "\u0627\u06A9\u0646\u0648\u0646 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633", "\u0627\u0644\u0627\u0646 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633", "\u0645\u0648\u062C\u0648\u062F \u0627\u0633\u062A", "\u0647\u0645\u06CC\u0646 \u062D\u0627\u0644\u0627 \u0628\u062E\u0631\u06CC\u062F", "\u015Fimdi mevcut", "\u015Fimdi sat\u0131\u015Fta", "hemen sat\u0131n al", "stokta", "\u015Fimdi indir"];
var ANY_AVAILABILITY = [...AVAILABLE_NOW, "available", "launched", "pre order", "preorder", "\u062F\u0631 \u062F\u0633\u062A\u0631\u0633", "\u0645\u0648\u062C\u0648\u062F", "\u067E\u06CC\u0634 \u062E\u0631\u06CC\u062F", "mevcut", "sat\u0131\u015Fta", "\xF6n sipari\u015F"];
function availabilityConflict(textValue, rule) {
  if (!rule || rule === "available") return null;
  const t = normalizeClaimText(textValue);
  const list = rule === "coming-soon" ? AVAILABLE_NOW : ANY_AVAILABILITY;
  return list.find((phrase) => t.includes(normalizeClaimText(phrase))) ?? null;
}
function claimConflicts(field, value, banned, availability) {
  if (!value) return [];
  const out = [];
  for (const rule of banned) if (containsClaim(value, rule.text)) out.push({ kind: "banned", rule: rule.text, source: rule.source, field });
  const hit = availabilityConflict(value, availability);
  if (hit) out.push({ kind: "availability", rule: availability, source: "business.marketing.availability_claim", field });
  return out;
}

export {
  CONTENT_LANGS,
  contentLang,
  fill,
  ROLE_LABELS,
  CHANNEL_PARTS,
  PROPOSAL_TEXT,
  GAP_TEXT,
  NOTES,
  AVAILABILITY_RULES,
  VIEW_NOTICE,
  CLI_TEXT,
  CONTENT_PLAYBOOK_SCHEMA,
  CHANNEL_PLAYBOOK,
  playbookFor,
  PLAYBOOK_NOTICE,
  OBJECTIVE_LABELS,
  MIX_LABELS,
  KPI_LABELS,
  PERIOD_LABELS,
  PLAYBOOK_TEXT,
  localizeEntry,
  playbookDocument,
  playbookProblems,
  describeGap,
  buildContentStrategy,
  parseCadence,
  parseFormats,
  parseChannels,
  normalizeClaimText,
  containsClaim,
  availabilityConflict,
  claimConflicts
};
