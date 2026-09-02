/**
 * The « shell » slice of the EN catalogue: the right rail, the panel tabs, the folder
 * tree and the phone screens.
 */
import type { Messages } from "../messages";

export const shell = {
  rightRail: {
    ariaLabel: "Browser, folders and help",
    title: "Right panel",
    collapse: "Narrow the bar",
    expand: "Widen the bar",
    newBrowserTab: "New browser tab",
    browser: "Browser",
    web: "Web",
    noTabs: "No tab open.",
    foldersTip: "Folders and connected storage — open the panel",
    folders: "Folders and connected storage",
    collapseItem: (label) => `Collapse — ${label}`,
    closeItem: (label) => `Close — ${label}`,
    driven: "Browser being driven",
  },
  notice: {
    offlineBody: (brand) =>
      `Connection to ${brand} lost. Your conversations stay available — reconnecting automatically…`,
    reconnectOne: (name) => `Reconnection needed: ${name}`,
    reconnectMany: (count) => `Reconnection needed: ${count} connectors`,
    reconnectOneBody: "The connection to this connector was lost. Reconnect it from the settings.",
    reconnectManyBody: (names) => `Connections lost: ${names}.`,
    reconnect: "Reconnect",
    accessBodySold: (brand) =>
      `To open the whole catalogue: a ${brand} subscription, or your own key with a provider.`,
    accessBody: "To open the whole catalogue: your own key with a provider.",
    seeAccess: "See my access",
  },
  panelTabs: {
    sidePanel: "Side panel",
    closeTab: "Close the tab",
    openFile: "Open a file",
    openFileTip: "Open a file from the library",
  },
  folders: {
    onThisDevice: "On this device",
    local: "Local",
    manageFolders: "Manage the allowed folders",
    noFolders: "No folder allowed yet.",
    addFolder: "Allow one more folder",
    connectedStorage: "Connected storage",
    cloud: "Cloud",
    accountFailed: "This account could not be listed — collapse it, reopen it and try again",
    folderFailed: "This folder could not be read — collapse it, reopen it and try again",
    askAbout: (name) => `Ask about ${name}`,
    ask: "Ask",
    sourceLabel: (service, account) => `${service}${account ? ` — ${account}` : ""}`,
  },
  mobile: {
    accountAndSettings: "Account and settings",
    searchConversation: "Search a conversation…",
    searchConversationAria: "Search a conversation",
    noMatch: "No conversation matches.",
    emptyConversation: "Empty conversation",
    redactedCount: (n) => `${n} redacted item${n > 1 ? "s" : ""}`,
    library: {
      filesOrImages: "Files or images",
      files: "Files",
      images: "Images",
      noImages: "No image.",
      noFiles: "No file.",
      emptySub: "The attachments from your conversations land here, already redacted.",
      fileActions: "File actions",
      rowActions: (name) => `Actions — ${name}`,
      deleteTitle: "Delete this file?",
      deleteBody: (name) =>
        `“${name}” will be permanently deleted from the library (original file + redacted version). This cannot be undone.`,
      redactedData: (n) => `${n} redacted value${n > 1 ? "s" : ""}`,
      hasRedacted: "Contains redacted data",
    },
    memory: {
      sub: (brand, count) =>
        `What ${brand} keeps from one conversation to the next — ${count} item${count === 1 ? "" : "s"}. It all stays on your machine, and leaves redacted.`,
      profile: "Profile",
      profilePlaceholder: (brand) => `Who you are, and what ${brand} should keep in mind.`,
      autoExtract: (brand) =>
        `Automatic extraction — ${brand} notes the durable facts on its own, from the already redacted text.`,
      empty: "Nothing in memory yet.",
      emptySub: "Say “remember that…” in a conversation, or add a card below.",
      newCard: "New card",
      addTo: (category) => `Add to ${category}`,
      addSheet: "Add a memory",
      addToCategory: (category) => `Add to “${category}”`,
      newMemory: "New memory…",
      memoryName: "Memory name",
      add: "Add",
      memorySheet: "Memory",
      notedBy: (brand) => `noted by ${brand}`,
      factsPlaceholder: "What to remember — a durable fact, not a conversation.",
      facts: "Facts",
      removeFromMemory: "Delete from memory",
      profileSheet: "Memory profile",
      profileTextPlaceholder:
        "E.g. Independent consultant, small-business clients, answers in French, direct tone.",
    },
    settings: {
      backToSettings: "Back to settings",
      orgSuffix: (org) => `${org} · Organisation`,
      help: "Help",
    },
  },
} satisfies Messages["shell"];
