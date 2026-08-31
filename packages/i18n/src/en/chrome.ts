/**
 * The EN catalogue's « chrome » slice — translated from the source (`../fr/`).
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/chrome.ts`), no more and no less, slice by slice — so a forgotten
 * key names ITS slice rather than the whole catalogue.
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
  groups: {
    today: "Today",
    yesterday: "Yesterday",
    last7: "Last 7 days",
    last30: "Last 30 days",
  },
  justNow: "just now",
  help: "Help",
  helpTip: (brand) => `Help — getting started with ${brand}`,
  sendFeedback: "Send feedback",
  releaseKinds: { feat: "What's new", imp: "Improvements", fix: "Fixes" },
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

  placeholder: (brand) => `Message ${brand}…`,

  editSkill: "Edit the skill",
  slotsToFill: "To fill in inside your message",
  removeTool: "Remove the tool",
  memoryHint: "Will be kept in memory",
  memoryHintTip:
    "An explicit ask to remember — the durable fact will be noted in Memory (local, encrypted)",

  keepInClearTip: "Send these values as they are for this message — the model sees the real ones",
  dismissWarning: "Hide this warning",

  useSkill: "Use a skill",
  attachFile: "Attach a file",
  stop: "Stop",
  send: "Send",
  redacting: "Masking",
  redactingAria: "Masking in progress",
  redacted: "Masked",

  detect: {
    partialNone: "analysis incomplete",
    partialNoneHint:
      "The deep analysis could not finish on this text. Sending runs it again in full — nothing leaves unanalysed.",
    partialCount: (n) => `at least ${n} to redact`,
    partialCountHint:
      "The count is partial: the deep analysis could not finish on a text this size. Sending runs it again in full, with more time — so there will be at least this many.",
    reMask: "Mask this item again",
    uncertain: "Uncertain detection — masked by default. Click to leave it in clear.",
    keepInClear: "Leave in clear (do NOT mask) — sent as-is to the model",
    toVerify: "to check",
    showAll: "Show every detection",
    more: (n) => `+${n} more`,
    collapseTip: "Collapse the list",
    collapse: "Collapse",
  },

  longText: {
    openTip: "Open the editor (long text)",
    summary: (chars, lines) =>
      `Long text — ${chars.toLocaleString("en-GB")} characters · ${lines.toLocaleString("en-GB")} lines`,
    edit: "Edit",
  },

  modal: {
    title: "Edit the message",
    sub: "Long text is edited here — the masking stays visible live; sending happens from the message box.",
    tabEdit: "Edit",
    tabPreview: "Preview",
    toMask: (n) => `${n} to mask`,
    mirrorOff: (max) =>
      `Live highlighting is suspended beyond ${max.toLocaleString("en-GB")} characters (to keep typing smooth) — detection and protection at send time are unchanged, and the chips below stay active.`,
    done: "Done",
  },

  attachments: {
    open: "view the file",
    processing: "file being processed",
    redacting: "Masking…",
    values: (n) => `🛡 ${n} value${n > 1 ? "s" : ""}`,
    readAllPages: (total) => `Read all ${total} pages`,
    readAllPagesTip: (read) =>
      `Only the first ${read} pages were read (and therefore masked). Re-read the whole document — a few seconds per page.`,
    retryRedaction: "Retry the masking",
    reRedact: "Mask again",
    reRedactTip: "Mask again (the masking engine changed)",
    remove: "Remove",
  },

  drop: {
    title: "Drop here",
    sub: "A file is attached to the message; a folder is offered for you to authorise.",
    close: "Close",
    folderDialog: "Authorise a folder",
  },
} satisfies Messages["composer"];
