/**
 * The EN catalogue's « chrome » slice — translated from the source (`../fr/`).
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/chrome.ts`), no more and no less, slice by slice — so a forgotten
 * key names ITS slice rather than the whole catalogue.
 */
import type { Messages } from "../messages";

export const chrome = {
  expandSidebar: "Expand sidebar",
  newChat: "New conversation",
  search: "Search",
  searchShortcut: "Search (⌘K)",
  memoryFresh: "Memory updated",
  privacyReportTip: (n) => `${n} item(s) masked · Privacy report`,
  privacyReport: "Privacy report",
  account: "Account and settings",
  conversations: "Conversations",
  noConversations: "No conversations yet.",
  you: "You",
  privateSpace: "Private space",
  private: "Private",
  launchPinned: (what) => `Run: ${what}`,
  deleteConversationAction: "Delete conversation",
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
  helpTip: (brand) => `Help: getting started with ${brand}`,
  sendFeedback: "Send feedback",
  updateReady: (version) => `Update to ${version}`,
  updateReadyTip: (brand, version) => `${brand} ${version} is ready. See what's new and restart.`,
  guideEyebrow: "Help",
  guideTitle: (brand) => `Getting started with ${brand}`,
  guideUnderstood: "Got it",
  releaseKinds: { feat: "What's new", imp: "Improvements", fix: "Fixes" },
} satisfies Messages["chrome"];

export const chat = {
  backToConversations: "Back to conversations",
  toggleSidebar: "Toggle sidebar",
  more: "More",
  rowActions: "Actions",
  rename: "Rename",
  renameConversation: "Rename conversation",
  generating: "Generating",
  closeTab: "Close tab",
  hiddenTabsTip: (n) => `${n} tab${n > 1 ? "s" : ""} out of view (scroll)`,
  hiddenTabs: (n) => `${n} tab${n > 1 ? "s" : ""} out of view`,
  splitScreen: "Split screen",
  splitLeft: "Split left",
  splitRight: "Split right",
  redactionSummary: (n) => `Masked in this conversation · ${n} item${n === 1 ? "" : "s"}`,
  seeWhatTheModelSaw: "See what the model saw",
  debugLog: "Debug log",
} satisfies Messages["chat"];

export const composer = {
  redactLevel: "Masking level",
  currentLevel: "Current level",
  redactLevelTip: (level, scope) => `Masking level · ${level} (${scope})`,
  scopeShortConversation: "this conversation",
  scopeShortDefault: "default",
  scopeConversation: "For this conversation only. The default level is set in Settings → Privacy.",
  scopeDefault: "No conversation open: this choice becomes your default level.",
  reducedTip: "Reduced protection",
  forcedNote: (n) =>
    `${n} ${n > 1 ? "categories" : "category"} required by your organization at every level.`,
  applied: (level, scope) => `${level} · ${scope}`,
  undo: "Undo",
  protectionLevel: "Protection level",

  placeholder: (brand) => `Message ${brand}…`,

  editSkill: "Edit skill",
  slotsToFill: "Fill in your message",
  removeTool: "Remove tool",
  memoryHint: "Will be saved to Memory",
  memoryHintTip:
    "You asked to remember this. It will be saved to Memory (on this device, encrypted).",

  keepInClearTip: "Send these values unmasked in this message. The model sees the real values.",
  dismissWarning: "Hide this warning",

  add: "Add",
  addFile: "File",
  attachFile: "Attach a file",
  addFolder: "Folder",
  addFolderTip: "Give access to a folder on this computer",
  addConnector: "Connector",
  addConnectorTip: "Connect a service (Settings → Connectors)",
  addSkill: "Skill",
  useSkill: "Use a skill",
  stop: "Stop",
  send: "Send",
  redacting: "Masking",
  redactingAria: "Masking in progress",
  redacted: "Masked",
  reading: "Reading",
  readingAria: "Reading files",

  detect: {
    partialNone: "analysis incomplete",
    partialNoneHint:
      "Detection did not finish on this text. It runs again in full when you send.",
    partialCount: (n) => `at least ${n} to mask`,
    partialCountHint:
      "Partial count: detection did not finish on text this long. It runs again in full when you send.",
    uncertain: "Possible match, masked by default. Click to send it unmasked.",
    toVerify: "to review",
    showAll: "Show all detections",
    more: (n) => `+${n} more`,
    collapseTip: "Collapse list",
    collapse: "Collapse",
  },

  intent: {
    skill: (name) => `Skill: ${name}`,
    routine: (name) => `Routine: ${name}`,
    sentWith: "Sent with your message",
    clickToEdit: " · click the name to edit",
  },

  utilityRisk: {
    age: "The answer depends on a masked date: a computed age or deadline may be off.",
    world: "The model doesn't know the company under its stand-in name, so it knows nothing about it.",
    geo: "Distances and nearby places are computed on stand-in locations, so the result means nothing.",
  },

  longText: {
    openTip: "Open the editor (long text)",
    summary: (chars, lines) =>
      `Long text — ${chars.toLocaleString("en-US")} characters · ${lines.toLocaleString("en-US")} lines`,
    edit: "Edit",
    undoTip: "Ctrl+Z or ⌘Z to undo the paste",
  },

  modal: {
    title: "Edit message",
    sub: "Edit long text here. Values to mask are highlighted as you type. Send from the message box.",
    tabEdit: "Edit",
    tabPreview: "Preview",
    toMask: (n) => `${n} to mask`,
    mirrorOff: (max) =>
      `Live highlighting is off above ${max.toLocaleString("en-US")} characters to keep typing smooth. Masking still runs in full when you send.`,
    done: "Done",
  },

  attachments: {
    open: "view file",
    processing: "file being processed",
    redacting: "Masking…",
    stateReading: "Reading…",
    stateQueued: (ahead) => `Queued · ${ahead} ahead`,
    stateReadingPage: (page, total) => `Reading · page ${page}/${total}`,
    stateMasking: "Masking…",
    stateMaskingPct: (pct) => `Masking · ${pct}%`,
    stateRedo: "Needs action",
    stateReady: (n) => `${n} value${n > 1 ? "s" : ""}`,
    staleTip: "Masked with your previous settings. Mask again to apply the current ones.",
    partialTip: (read, total) => `${read} of ${total} pages read. The other pages are not read or masked.`,
    readAllPages: (total) => `Read all ${total} pages`,
    readAllPagesTip: (read) =>
      `Only the first ${read} pages were read (and therefore masked). Read the whole document (a few seconds per page).`,
    retryRedaction: "Retry masking",
    reRedact: "Mask again",
    reRedactTip: "Mask again (masking was updated)",
    remove: "Remove",
    summaryFiles: (n) => `${n} file${n === 1 ? "" : "s"}`,
    summaryReading: (n) => `${n} reading`,
    summaryMasking: (n) => `${n} masking`,
    summaryUnreadable: (n) => `${n} unreadable`,
    removeAll: "Remove all",
    removeAllConfirm: (n) => `Remove all ${n} files from this message?`,
    extractFailed: "Couldn't read the file",
    rereadFailed: "Couldn't read it again. The text read earlier is kept.",
    extractInterrupted: "Reading was interrupted. Drop the file again.",
    fileRefused: "File refused",
    fileTooLarge: "File too large",
  },

  drop: {
    title: "Drop here",
    sub: "Files are attached to the message. Folders ask for your permission first.",
    close: "Close",
    folderDialog: "Allow access to a folder",
  },
} satisfies Messages["composer"];
