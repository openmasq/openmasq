/**
 * The EN catalogue's « modals » slice — translated from the source (`../fr/modals.ts`).
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/modals.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const modals = {
  transparency: {
    title: "What the model saw",
    sub: (n, modelName) =>
      `${n} piece${n === 1 ? "" : "s"} of information replaced before reaching ${modelName}. Your text on the left, what was sent on the right.`,
    theModel: "the model",
    close: "Close",
    empty:
      "Nothing sensitive was detected in this conversation: the model received your messages as they were.",
    youWrote: "What you wrote",
    youRead: "What you see",
    modelReceived: "What the model received",
    modelWrote: "What the model wrote",
    yourMessage: "Your message",
    reply: "Reply",
    swapped: (n) => `${n} replacement${n === 1 ? "" : "s"}`,
  },

  error: {
    eyebrow: "ERROR",
    title: "Error details",
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
    restarting: "Restarting…",
    restartingHint: "The app restarts in a few seconds.",
    restartSlow: "The app hasn't restarted yet. Quit it, and the update installs the next time you open it.",
    retry: "Try again",
  },

  mcpAuth: {
    title: (connector) => `Connect to ${connector}`,
    sub: (connector) =>
      `${connector} can be used with your account or anonymously. You can switch later by reconnecting.`,
    withAccount: "Connect with my account",
    withAccountDesc: (connector) => `Uses your credits, quotas and access on ${connector}.`,
    anonymous: "Use without an account",
    anonymousDesc: "Limited anonymous access, no sign-in. Shared quotas.",
    cancel: "Cancel",
  },

  search: {
    placeholder: "Search sections, conversations, files, settings…",
    newChat: "New conversation",
    noResults: "No results.",
  },

  feedback: {
    title: "Your feedback",
    sub: "Tell us what works and what doesn't.",
    thanks: "Thank you!",
    thanksWithLog:
      "Message received, with the debug log. It doesn't include your real values.",
    thanksPlain: "Message received. None of your conversation content was attached.",
    close: "Close",
    moodLabel: "How is it going?",
    optional: " · optional",
    categoryLabel: "Feedback type",
    messageLabel: "Your message",
    messagePlaceholder: "What you like, what blocked you, what's missing…",
    attachContext: "Attach technical context",
    attachContextSub:
      "App version, current screen and install identifier. Never the content of your conversations.",
    attachLog: "Attach debug log",
    inDocument: "in a document",
    inReply: "in a reply",
    inMessage: "in a message",
    problemKind: (kind) => ` (kind: ${kind})`,
    problemBody: (where, kind) =>
      `Incorrect masking${kind} ${where}.\nWhat went wrong (without pasting the real value): `,
    logDraft: "Report from the debug log.\nWhat went wrong: ",
    replyDraft: "About this reply: ",
    attachLogSub:
      "The text sent to the model (already masked), tools and errors, without your real values. Preview below.",
    confidential: "Confidential",
    sendMail: "Open in your email app",
    mailDone: "Your email app opened with the message ready to send.",
    mailFallback: (address) => `Nothing opened? Write to ${address}.`,
    copyAddress: "Copy address",
    copied: "Copied",
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
      `${brand} connects to your ${provider} account and uses its credits and quota.`,
    authorizing: "Authorizing in your browser…",
    getNewKey: "Get a new key",
    getFreeKey: "Get a free key",
    orPaste: "or paste an existing key",
    whereToFind: (provider) => `Where to find your ${provider} key`,
    getMyKey: "Get my key →",
    keyLabel: (provider) => `${provider} key`,
    getOne: "get one ↗",
    removeKey: "Remove key",
    keyPlaceholderFallback: (provider) => `Your ${provider} key`,
    saveAndSend: "Save and send",
    replaceKey: "Replace key",
    connectIncomplete: "The connection didn't finish. Nothing was saved. Try again.",
    connectUnreachable: "Could not connect. Try again in a moment.",
  },

  debug: {
    eyebrow: "DEVELOPER",
    title: "Debug log",
    subLead: "What was really sent and received for ",
    thisConversation: "this conversation",
    subCount: (n) => ` — ${n} entr${n > 1 ? "ies" : "y"}.`,
    searchPlaceholder: "Search (real or masked value, tool, error…)",
    clearSearch: "Clear",
    copyFullTip:
      "Copies the full log, including the masked → original mapping (real values, do not share)",
    copyFull: "Copy with real values",
    copyNoMapTip:
      "Copies the log without the masked → original mapping (no real values). Safe to share.",
    copyNoMap: "Copy without real values",
    copied: "Copied",
    clearTip: "Clear this conversation's log",
    clear: "Clear",
    sendToDevsTip:
      "Opens “Your feedback” with the log attached, without the mapping. You review it before sending.",
    sendToDevs: "Send to support",
    copyEntry: "Copy this entry",
    tabs: { all: "All", phase: "Steps", wire: "Requests", turn: "Exchanges", tool: "Tools", error: "Errors" },
  },

  guide: {
    helpCenter: "Full help center",
    themes: "Guide topics",
    noReleases: "No release notes published yet.",
  },

  importSkills: {
    eyebrow: "FROM CLAUDE",
    title: "Import my skills",
    sub: (source) =>
      `The ones ${source} keeps on this device, or a folder you drop here. Nothing is sent off this device, and nothing changes on Claude's side.`,
    reading: "Reading skills…",
    dropTitle: "Drop your skills here",
    nothingFound: "Nothing found automatically on this device.",
  },

  modelAccess: {
    eyebrow: "MODEL ACCESS",
    titleKey: "This model needs your key",
    titleCreditsSold: "This model needs a subscription",
    titleCreditsClosed: "This model isn't available on your account",
    titleFree: "Free, with limits",
    thisProvider: "This provider",
    leadUnserved: (provider) =>
      `${provider} requires your own API key. This version has no hosted service. You can also use a local model or your subscription's CLI.`,
    leadKey: (provider) => `${provider} requires your own API key. You can also pick another model.`,
    leadCreditsSold: (brand) => `This model goes through ${brand}, and your account has no credits left.`,
    leadCreditsClosed: (brand) =>
      `This model goes through ${brand}, and it is not available on your account for now.`,
    leadFreeSold: (brand) =>
      `Free models don't use your credits. You only need to be signed in to ${brand}, no subscription. Speed and availability depend on the provider.`,
    leadFreeServed: (brand) =>
      `A free model is included with your ${brand} account, no key needed. Speed and availability depend on the provider.`,
    freeModels: "Free models",
    includedModels: "Included models",
    freeDescSold: (brand) =>
      `Included with your ${brand} account, no subscription or key. Usage is limited. Selected by default.`,
    freeDescServed: (brand) =>
      `Served on your ${brand} account, no key to manage. A free model is selected by default. Its speed depends on the provider.`,
    subscription: (brand) => `A ${brand} subscription`,
    subscriptionDesc: (brand) =>
      `Models provided by ${brand}, no key to manage. Your monthly credits pay for usage.`,
    subscriptionCovers: "Your subscription already covers these models",
    subscriptionCoversDesc: "Pick any model that isn't free.",
    ownKey: "Your own key",
    ownKeyDesc: (soldSuffix) =>
      `Add your OpenAI, Anthropic or Mistral key: your provider bills you${soldSuffix}. Protection is the same.`,
    ownKeyWithoutCredits: ", without using your credits",
    ownKeyStatic: "Add it with the provider's button at the top of this page.",
    openRouterNote: (brand) =>
      `Exception: in the extended OpenRouter catalog, only models offered by ${brand} work without a key. The others need your own OpenRouter key.`,
  },

  searchRows: {
    goTo: "Go to",
    files: "Files",
    settings: "Settings",
    generating: "Generating",
  },

  redactionRules: {
    eyebrow: "MASKING",
    titleLead: "Masking ",
    titleHighlight: "rules",
    sub: "For this conversation: the categories you turn on are replaced with substitutes before any model sees your messages.",
    defaultLevelLink: "Change the default level in Settings → Privacy",
    memoryTitle: "Memory in this conversation",
    memoryDesc: (brand) =>
      `Off: your memory isn't sent with your messages, the model can't read it, and ${brand} saves nothing to it on its own. “Remember that…” still works.`,
    done: "Done",
  },
} satisfies Messages["modals"];
