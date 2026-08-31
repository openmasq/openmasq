/**
 * Tranche « modals » du catalogue EN — traduit de la source (`../fr/modals.ts`).
 *
 * `satisfies` par entrée : le compilateur exige EXACTEMENT les clés du contrat
 * (`../messages/modals.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const modals = {
  transparency: {
    title: "What the model saw",
    sub: (n, modelName) =>
      `${n} piece${n === 1 ? "" : "s"} of information replaced before reaching ${modelName}. Your text on the left, what actually left on the right.`,
    theModel: "the model",
    close: "Close",
    empty:
      "Nothing sensitive was detected in this conversation: the model received your messages as they were.",
    youWrote: "What you wrote",
    youRead: "What you are reading",
    modelReceived: "What the model received",
    modelWrote: "What the model wrote",
    yourMessage: "Your message",
    reply: "Reply",
    swapped: (n) => `${n} replacement${n === 1 ? "" : "s"}`,
  },

  error: {
    eyebrow: "ERROR",
    title: "Error detail",
    sub: "The raw message from the provider or the tool. It is not added to the conversation.",
    copy: "Copy",
    copied: "Copied",
    retry: "Retry",
  },

  updateReady: {
    eyebrow: "UPDATE READY",
    version: (version) => `Version ${version}`,
    noNote: "The release notes for this version are not published yet.",
    later: "Later",
    restartNow: "Restart now",
  },

  mcpAuth: {
    title: (connector) => `Connect to ${connector}`,
    sub: (connector) =>
      `${connector} can be used with your account or anonymously. You can change later by reconnecting it.`,
    withAccount: "Connect with my account",
    withAccountDesc: (connector) => `Uses your credits, quotas and access — as on ${connector}.`,
    anonymous: "Use without an account",
    anonymousDesc: "Anonymous access, limited — no identity, shared quotas.",
    cancel: "Cancel",
  },

  search: {
    placeholder: "Search a section, a conversation, a file, a setting…",
    newChat: "New conversation",
    noResults: "No results.",
  },

  avis: {
    title: "Your feedback",
    sub: "Tell us what works — or what gets in the way. We read everything.",
    thanks: "Thank you!",
    thanksWithJournal:
      "Message received, along with the debug log — without the mapping table, so without your real values.",
    thanksPlain: "Message received. None of your conversation content was attached.",
    close: "Close",
    moodLabel: "How is it going?",
    optional: " · optional",
    categoryLabel: "Kind of feedback",
    messageLabel: "Your message",
    messagePlaceholder: "What you like, what blocked you, what is missing…",
    attachContext: "Attach the technical context",
    attachContextSub:
      "App version, current screen and install identifier. Never the content of your conversations.",
    attachJournal: "Attach the debug log",
    attachJournalSub:
      "The text that went to the model (already redacted), the tools and the errors — without the lookup table, so no real value. Preview below.",
    confidential: "Confidential",
    moods: { love: "Love it", ok: "Fine", meh: "Meh" },
    categories: { idea: "Idea", bug: "Bug", love: "Compliment", other: "Other" },
  },

  apiKey: {
    eyebrow: "ACCESS KEY",
    title: (provider) => `${provider} key`,
    sub: "Your key stays encrypted on this machine, and is never sent to the model.",
    alreadySaved: (provider) =>
      `A ${provider} key is already saved. Pasting a new one replaces it.`,
    connectTip: (brand, provider) =>
      `${brand} connects to your ${provider} account: your credits, your quota.`,
    authorizing: "Authorising in your browser…",
    getNewKey: "Get a new key",
    getFreeKey: "Get a key for free",
    orPaste: "or paste an existing key",
    whereToFind: (provider) => `Where to find your ${provider} key`,
    getMyKey: "Get my key →",
    keyLabel: (provider) => `${provider} key`,
    getOne: "get one ↗",
    removeKey: "Remove the key",
  },

  debug: {
    eyebrow: "DEVELOPER",
    title: "Debug journal",
    subLead: "What was really sent and received for ",
    thisConversation: "this conversation",
    subCount: (n) => ` — ${n} entr${n > 1 ? "ies" : "y"}.`,
    searchPlaceholder: "Search (real or redacted value, tool, error…)",
    clearSearch: "Clear",
    copyFullTip:
      "Copies the full journal, redacted → original mapping included (real values — for your eyes)",
    copyFull: "Copy (real)",
    copyNoMapTip:
      "Copies the journal WITHOUT the redacted → original mapping (no real value) — safe to share",
    copyNoMap: "Without mapping",
    copied: "Copied",
    clearTip: "Clear this conversation's journal",
    clear: "Clear",
    sendToDevsTip:
      "Opens “Your feedback” with the journal attached WITHOUT the mapping — you see it before it is sent",
    sendToDevs: "Send to the devs",
    copyEntry: "Copy this entry",
  },

  guide: {
    helpCenter: "Full help centre",
    themes: "Guide topics",
    noReleases: "No release note published yet.",
  },

  importSkills: {
    eyebrow: "FROM CLAUDE",
    title: "Import my skills",
    sub: (source) =>
      `The ones ${source} keeps on this device, or a folder you drop here. Nothing leaves the machine, and nothing is changed on Claude's side.`,
    reading: "Reading the skills…",
    dropTitle: "Drop your skills here",
    nothingFound: "Nothing found automatically on this device.",
  },

  modelAccess: {
    eyebrow: "MODEL ACCESS",
    freeModels: "The free models",
    includedModels: "The included models",
    freeDescSold: (brand) =>
      `Included with your ${brand} account, with no subscription and no key. Limited usage — and it is what is already selected by default.`,
    freeDescServed: (brand) =>
      `Served on your ${brand} account, with no key to manage. A free model is already selected by default; its throughput depends on the provider.`,
    subscription: (brand) => `A ${brand} subscription`,
    subscriptionDesc: (brand) =>
      `The models ${brand} provides, with no key to manage at all: your monthly credits pay for the usage.`,
    subscriptionCovers: "Your subscription already covers these models",
    subscriptionCoversDesc: "Just pick a model that isn't free — there is nothing else to do.",
    ownKey: "Your own key",
    ownKeyDesc: (soldSuffix) =>
      `Plug in your OpenAI, Anthropic or Mistral key: your provider bills you${soldSuffix}. The protection is the same.`,
    ownKeyWithoutCredits: ", without touching your credits",
    ownKeyStatic: "Enter it from each provider's ⚙ gear, on this page.",
    openRouterNote: (brand) =>
      `One special case: in the extended OpenRouter catalogue, only the models ${brand} offers go through without a key — the others need your own OpenRouter key.`,
  },

  searchRows: {
    goTo: "Go to",
    files: "Files",
    settings: "Settings",
    generating: "Generating",
  },

  redactionRules: {
    eyebrow: "REDACTION",
    titleLead: "Redaction ",
    titleHighlight: "rules",
    sub: "The categories you turn on are removed from your messages before any model sees them.",
    thisConversation: "This conversation",
    byDefault: "By default",
    memoryTitle: "Memory in this conversation",
    memoryDesc: (brand) =>
      `Off: none of your memory rides along with what you send from here, the model cannot consult it, and ${brand} notes nothing on its own. “Remember that…” still works — that one is your call.`,
  },
} satisfies Messages["modals"];
