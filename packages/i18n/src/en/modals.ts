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
    moods: { love: "Love it", ok: "Fine", meh: "Meh" },
    categories: { idea: "Idea", bug: "Bug", love: "Compliment", other: "Other" },
  },
} satisfies Messages["modals"];
