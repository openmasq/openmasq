/**
 * The « conversation » slice of the EN catalogue: the conversation screen, its agent
 * browser, and everything that frames a message.
 */
import type { Messages } from "../messages";

export const conversation = {
  greeting: { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening" },
  starters: {
    noSetup: "No setup needed",
    withServices: "With your services",
    orConnect: "Or connect",
    seeOthers: "See more",
    cardTip: (category, prompt) => `${category} — ${prompt}`,
    cardAria: (category, prompt) => `${category}: ${prompt}`,
    connectTip: (connector, prompt) => `Connect ${connector} — ${prompt}`,
    dismiss: "Don't show again",
    cats: {
      write: "Writing",
      search: "Search",
      memory: "Memory",
      analyse: "Analysis",
      "mail-triage": "Mailbox",
      "files-find": "My folders",
      "day-brief": "Calendar",
      "chat-catchup": "Messages",
      "pr-review": "Code",
    },
    prompts: {
      write: (domain) => `Write a thank-you email to julien@${domain}.`,
      search: () => "What's in the news today?",
      memory: () =>
        "Remember that on the Horizon project, my client Camille Salvi (Atelier Lucane) approves the mock-ups and Marc Wulff handles invoicing.",
      analyse: () => "Plot a chart of this year's 5 best-performing ETFs.",
      "mail-triage": () =>
        "Sort my unread emails from this week: which ones really need a reply from me, and which can wait?",
      "files-find": () =>
        "Find the latest quote I received in my folders, and pull out the amount and the key dates.",
      "day-brief": () =>
        "Prepare my day tomorrow: my meetings, with whom, and what I should have read before each one.",
      "chat-catchup": () =>
        "Summarize what I missed this week in my channels, and list what is waiting for a reply from me.",
      "pr-review": () => "List the pull requests waiting for my review, and summarize what each one changes.",
    },
  },

  artifact: { pane: "File preview", copy: "Copy", copied: "Copied", close: "Close" },

  browser: {
    pane: "Agent browser",
    bookmarks: "Bookmarks",
    askAboutPage: "Ask a question about this page",
    askAboutPageLabel: "Ask about this page",
    embedded: "Built-in browser",
    unavailable: "The agent browser is not available on this platform.",
    loading: "Loading the agent browser…",
    offlineTitle: "The browser is off.",
    offlineSub: (brand) =>
      `Turn it on to browse the web here, and to let ${brand} search it for you.`,
    activating: "Turning on…",
    activate: "Turn on the browser",
    searchEngine: "Search engine",
    back: "Back",
    forward: "Forward",
    reload: "Reload",
    urlPlaceholder: "Search or type an address",
    urlAria: "Address or search",
    closeBrowser: "Close browser",
    close: "Close",
  },

  resizePanel: "Resize panel",
  suspendedTitle: "Access suspended by your organization",
  suspendedBody: "Sending is blocked. Contact your organization's administrator.",
  docPrep: {
    analysing: "Analyzing the document…",
    redacting: "Masking the document…",
    page: (page, total) => ` · page ${page} / ${total}`,
    pages: (total) => ` · ${total} page${total > 1 ? "s" : ""}`,
    ofCount: (idx, count) => ` (${idx}/${count})`,
  },
  chooseFolder: "Choose folder",
  folderPickFailed: "folder selection failed",
  folderGrantFailed: "authorization failed",
  slashRemember: {
    label: "Remember",
    desc: "Inserts “Remember that…”. The fact is saved to Memory, on this device.",
  },
  opening: "Opening…",
  memoryToast: "Noted in memory",
  clarify: "Clarify",

  writeConfirm: {
    targetTip: (server, tool) => `${server} · ${tool}`,
    alsoOtherChats: "Also in my other conversations (until I quit the app)",
  },

  skillTag: {
    show: "Show the prompt sent to the model",
    hide: "Hide prompt",
    promptEyebrow: "Prompt sent to the model",
    edit: "Edit",
    unavailable: "Prompt unavailable for this message.",
  },

  memory: {
    usedTip:
      "Memory cards included with this message, masked like the rest. Click to open Memory.",
    used: (labels) => `Memory used — ${labels}`,
    skippedTip:
      "These cards matched but were not sent with this message. Click to open the card.",
    skipped: (parts) => `Memory: ${parts}`,
    homographs: (labels, count) =>
      `${labels} not included: the name alone is too common. Write it in full.${count > 1 ? "" : ""}`,
    budget: (n) => `${n} card${n > 1 ? "s" : ""} left out: not enough room`,
    pendingTip: "Extracting. The result will appear here.",
    pending: "Saving to memory…",
    failedTip:
      "Nothing could be saved to memory. Ask “remember…” again to retry.",
    failed: "Saving to memory failed. Nothing was saved. Try again.",
    notedTip: "Saved to Memory on this device, because you asked",
    preferenceSaved: "Preference saved to memory",
    nothingDurable: "Nothing to remember here",
    undone: "Removed from memory",
    noted: (facts, profile, updatedSuffix) =>
      `${facts === 1 ? "1 fact noted" : `${facts} facts noted`}${profile ? " + profile" : ""}${updatedSuffix} in memory`,
    updatedSuffix: (n) => ` · ${n === 1 ? "1 card updated" : `${n} cards updated`}`,
    undo: "Undo",
    undoTip: "Remove from memory what this request created",
  },

  actions: {
    copy: "Copy",
    copied: "Copied",
    regenerate: "Regenerate",
    fork: "Duplicate the conversation from here",
    feedback: "Give feedback on this reply",
  },

  bubble: {
    openAttachment: (name) => `Open ${name}`,
    plotTip: "Generating a chart (run_python)",
    plot: "Chart",
    redactionFailedTip: "The masking model failed for this message",
    redactedTip: "Replaced with a substitute before reaching the model, restored in its reply",
    protectedCount: (n) => `${n} protected`,
    protectedSee: "see",
    autoRoutedTip:
      "Auto mode: the model for this reply was chosen automatically, based on the task.",
    quotaTip: "This model's provider quota",
    reasoning: "Reasoning",
    imageWithheld: "Image withheld: it may contain a masked value",
    imageWithheldLoad: "Load",
  },

  trace: {
    connector: "connector",
    calling: "Calling tools…",
    running: "running…",
    actionsRunning: (n) => `${n} action${n > 1 ? "s" : ""} · running…`,
    actionsDone: (n) => `${n} action${n > 1 ? "s" : ""} · done`,
    retrying: (attempt) => `retrying (attempt ${attempt})`,
    attempts: (n) => `${n} attempts`,
    failed: "failed",
    failedWith: (note) => `failed — ${note}`,
    declined: "declined",
  },

  thinking: {
    writing: "The model is writing the reply",
    reflecting: "The model is thinking",
    preparing: "The model is preparing the reply",
  },

  tokens: {
    tip: (total, input, output) => `${total} tokens (input ${input} · output ${output})`,
    line: (input, output) => `↑ ${input} · ↓ ${output} tokens`,
  },

  mark: {
    realValue: "real value",
    seenByModel: "seen by the model",
    seenByModelTip: "Value seen by the model",
    realValueTip: "Real value. Sent unmasked only if you unmask it.",
    orgForced: "Enforced by your organization",
    scopeSend: "this send",
    scopeConversation: "this conversation",
    scopeMessage: "this message",
    leaveClear: (scope) => `Unmask · ${scope}`,
    leaveClearKind: (scope) => `Unmask category · ${scope}`,
    leaveClearTip: "Reversible: the model receives the real value. Mask it again in one click.",
    reMask: (scope) => `Mask again · ${scope}`,
    reMaskKind: (scope) => `Mask category again · ${scope}`,
    reMaskTip: "Mask this value again",
    remove: (scope) => `Remove masking · ${scope}`,
    removeTip: "Permanent: this value is no longer masked and is sent as is.",
    reportTip: "Opens “Your feedback”, prefilled. Never paste the real value into it.",
    report: "Report a mistake",
    sheetLabel: "Masking",
  },

  struggle: {
    failedTip: (tool) => (tool ? `A tool call did not go through: ${tool}` : "A tool call did not go through"),
    unknownTool: (connector, action) =>
      `${connector} has no “${action}” action.`,
    ownKeysHint: "Some actions require your own access keys.",
    ownKeysHintWithPath:
      "Open it in Settings → Connectors: some actions require your own access keys.",
    connectorError: (connector, action) =>
      `${connector} refused the action “${action}”. Switching models won't help. Most often, access to the account has expired:`,
    reconnect: "reconnect it, then ask again.",
    reconnectWithPath: "reconnect it in Settings → Connectors, then ask again.",
    noToolUsed: (who) =>
      `${who} answered without using your connectors. Models with stronger tool support (Claude, for example) use them more reliably: switch models below the message, then ask again.`,
    badCall: (who, action) =>
      `${who} could not form a valid request for “${action}”. Models with stronger tool support (Claude, for example) usually can: switch models below the message.`,
    reconnectTip: (connector) => `Open ${connector} settings to reconnect the account`,
    reconnectCta: "Reconnect",
  },
} satisfies Messages["conversation"];
