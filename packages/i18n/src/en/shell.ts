/**
 * The « shell » slice of the EN catalogue: the right rail, the panel tabs, the folder
 * tree and the phone screens.
 */
import type { Messages } from "../messages";

export const shell = {
  rightRail: {
    ariaLabel: "Browser, folders and help",
    title: "Right panel",
    collapse: "Collapse sidebar",
    expand: "Expand sidebar",
    newBrowserTab: "New browser tab",
    browser: "Browser",
    web: "Web",
    noTabs: "No open tabs.",
    foldersTip: "Open folders and connected storage",
    folders: "Folders and connected storage",
    collapseItem: (label) => `Collapse — ${label}`,
    closeItem: (label) => `Close — ${label}`,
    driven: "Assistant is using the browser",
  },
  notice: {
    offlineBody: (brand) =>
      `Connection to ${brand} lost. Your conversations are still available. Reconnecting…`,
    reconnectOne: (name) => `Reconnection needed: ${name}`,
    reconnectMany: (count) => `Reconnection needed: ${count} connectors`,
    reconnectOneBody: "This connector was disconnected. Reconnect it in Settings.",
    reconnectManyBody: (names) => `Disconnected: ${names}.`,
    reconnect: "Reconnect",
    accessBodySold: (brand) =>
      `To use every model, get a ${brand} subscription or add your own provider API key.`,
    accessBody: "To use every model, add your own provider API key.",
    seeAccess: "See my access",
  },
  panelTabs: {
    sidePanel: "Side panel",
    closeTab: "Close tab",
    openFile: "Open a file",
    openFileTip: "Open a file from the library",
  },
  folders: {
    onThisDevice: "On this device",
    local: "Local",
    manageFolders: "Manage allowed folders",
    noFolders: "No folders allowed yet.",
    addFolder: "Add a folder",
    connectedStorage: "Connected storage",
    cloud: "Cloud",
    accountFailed: "Could not list this account. Collapse and reopen it to try again.",
    folderFailed: "Could not read this folder. Collapse and reopen it to try again.",
    askAbout: (name) => `Ask about ${name}`,
    ask: "Ask",
    sourceLabel: (service, account) => `${service}${account ? ` — ${account}` : ""}`,
  },
  mobile: {
    accountAndSettings: "Account and settings",
    searchConversation: "Search conversations…",
    searchConversationAria: "Search conversations",
    noMatch: "No matching conversations.",
    emptyConversation: "Empty conversation",
    redactedCount: (n) => `${n} masked item${n > 1 ? "s" : ""}`,
    library: {
      filesOrImages: "Files or images",
      files: "Files",
      images: "Images",
      noImages: "No images.",
      noFiles: "No files.",
      emptySub: "Attachments from your conversations appear here, already masked.",
      fileActions: "File actions",
      rowActions: (name) => `Actions — ${name}`,
      deleteTitle: "Delete this file?",
      deleteBody: (name) =>
        `“${name}” will be permanently deleted from the library (original file and masked version). This cannot be undone.`,
      redactedData: (n) => `${n} masked value${n > 1 ? "s" : ""}`,
      hasRedacted: "Contains masked data",
    },
    memory: {
      sub: (brand, count) =>
        `What ${brand} keeps from one conversation to the next: ${count} item${count === 1 ? "" : "s"}. Everything stays on your device and is masked before it is sent.`,
      profile: "Profile",
      profilePlaceholder: (brand) => `Who you are, and what ${brand} should keep in mind.`,
      autoExtract: (brand) =>
        `Automatic extraction: ${brand} saves lasting facts from text that is already masked.`,
      empty: "Nothing in memory yet.",
      emptySub: "Say “remember that…” in a conversation, or add a card below.",
      newCard: "New card",
      addTo: (category) => `Add to ${category}`,
      addSheet: "Add a card",
      addToCategory: (category) => `Add to “${category}”`,
      newMemory: "New card…",
      memoryName: "Card name",
      add: "Add",
      memorySheet: "Memory card",
      notedBy: (brand) => `noted by ${brand}`,
      factsPlaceholder: "What to remember: a lasting fact, not a conversation.",
      facts: "Facts",
      removeFromMemory: "Delete from memory",
      profileSheet: "Memory profile",
      profileTextPlaceholder:
        "E.g. Litigation associate, commercial clients, concise answers, direct tone.",
    },
    settings: {
      backToSettings: "Back to settings",
      orgSuffix: (org) => `${org} · Organization`,
      help: "Help",
    },
  },
} satisfies Messages["shell"];
