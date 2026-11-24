import { createRequire as __engineRequire } from 'node:module'; const require = __engineRequire(import.meta.url);
import {
  brandSettings,
  detectChannels,
  readSources,
  roleGaps,
  splitItems
} from "./chunk-WFFKKM3U.mjs";
import {
  CONTENT_CHANNELS,
  CONTENT_FORMATS,
  CONTENT_SOURCE_ROLES,
  STRATEGY_LIMITS,
  StrategyError,
  assertOwnerProcess,
  parseProposal,
  readFacts,
  scanRecords,
  servable,
  text
} from "./chunk-NRYDV6C7.mjs";

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
  const channels = chosen.map((channel) => {
    const refs = mentions.get(channel) ?? [];
    if (opts.channels?.length && !refs.length) notes.push(fill(NOTES.channel_not_in_facts[lang], { channel }));
    const formats = [...new Set(opts.formats?.[channel] ?? [])];
    const cadence = opts.cadence?.[channel] ?? null;
    gaps.push({ field: `channels[${channel}].role`, reason: "owner_decision", fact_ids: [] });
    if (!formats.length) gaps.push({ field: `channels[${channel}].formats`, reason: "owner_decision", fact_ids: [] });
    if (!cadence) gaps.push({ field: `channels[${channel}].cadence`, reason: "owner_decision", fact_ids: [] });
    return { channel, role: null, formats, cadence, languages: [], pillars: [], fact_refs: refs };
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
    assumptions: [],
    open_questions: [],
    restricted: null,
    origin: { kind: "manual" },
    content_strategy: block
  };
  parseProposal(proposal);
  return { proposal, block, sources: reports, gaps: block.gaps.map((gap) => ({ ...gap, text: gapText(gap, lang) })), detected_channels: detected, notes };
}
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
