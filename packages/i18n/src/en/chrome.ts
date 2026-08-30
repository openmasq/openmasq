/**
 * Tranche « chrome » du catalogue EN — traduit de la source (`../fr/`).
 *
 * `satisfies` par entrée : le compilateur exige EXACTEMENT les clés du contrat
 * (`../messages/chrome.ts`), ni plus ni moins, tranche par tranche — donc une clé
 * oubliée nomme SA tranche plutôt que le catalogue entier.
 */
import type { Messages } from "../messages";

export const chrome = {
  expandSidebar: "Expand the sidebar",
  newChat: "New conversation",
  search: "Search",
  searchShortcut: "Search (⌘K)",
  memoryFresh: "Memory — new entries noted",
  privacyReportTip: (n) => `${n} item(s) protected — privacy report`,
  privacyReport: "Privacy report",
  account: "Account and settings",
  conversations: "Conversations",
  noConversations: "No conversations yet.",
  you: "You",
  privateSpace: "Private space",
  private: "Private",
  launchPinned: (what) => `Run: ${what}`,
  deleteConversationAction: "Delete the conversation",
  deleteConversation: "Delete this conversation?",
  deleteConversationBody: (title) =>
    `“${title}” and all of its messages will be deleted from this device. This cannot be undone.`,
  untitledConversation: "New conversation",
} satisfies Messages["chrome"];

export const chat = {
  backToConversations: "Back to conversations",
  toggleSidebar: "Toggle the sidebar",
  more: "More",
  rowActions: "Actions",
  rename: "Rename",
  renameConversation: "Rename the conversation",
  generating: "Generating",
  closeTab: "Close the tab",
  hiddenTabsTip: (n) => `${n} tab${n > 1 ? "s" : ""} out of view — scroll`,
  hiddenTabs: (n) => `${n} tab${n > 1 ? "s" : ""} out of view`,
  splitScreen: "Split the screen",
  splitLeft: "To the left",
  splitRight: "To the right",
  redactionSummary: (n) => `Masking · ${n} protected`,
  seeWhatTheModelSaw: "See what the model saw",
  debugLog: "Debug log",
} satisfies Messages["chat"];

export const composer = {
  redactLevel: "Masking level",
  currentLevel: "Current level",
  protectionLevel: "Protection level",
} satisfies Messages["composer"];
