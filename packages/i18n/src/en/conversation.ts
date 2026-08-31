/**
 * The « conversation » slice of the EN catalogue: the conversation screen, its agent
 * browser, and everything that frames a message.
 */
import type { Messages } from "../messages";

export const conversation = {
  greeting: { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening" },
  starters: {
    noSetup: "With nothing to set up",
    withServices: "With your services",
    orConnect: "Or connect",
    seeOthers: "See the others",
    cardTip: (category, prompt) => `${category} — ${prompt}`,
    cardAria: (category, prompt) => `${category}: ${prompt}`,
    connectTip: (connector, prompt) => `Connect ${connector} — ${prompt}`,
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
    offlineTitle: "The browser is not connected.",
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
    closeBrowser: "Close the browser",
    close: "Close",
  },

  resizePanel: "Resize the panel",
  suspendedTitle: "Access suspended by your organisation",
  suspendedBody: "Sending is blocked. Contact your organisation's administrator.",
  docPrep: {
    analysing: "Analysing the document…",
    redacting: "Redacting the document…",
    page: (page, total) => ` · page ${page} / ${total}`,
    pages: (total) => ` · ${total} page${total > 1 ? "s" : ""}`,
    ofCount: (idx, count) => ` (${idx}/${count})`,
  },
  chooseFolder: "Choose the folder",
  opening: "Opening…",
  memoryToast: "Noted in memory",

  writeConfirm: {
    targetTip: (server, tool) => `${server} · ${tool}`,
    alsoOtherChats: "In my other conversations too (until the app closes)",
  },

  competenceTag: {
    show: "See the instruction sent to the model",
    hide: "Hide the instruction sent",
    promptEyebrow: "Instruction sent to the model",
    edit: "Edit",
    unavailable: "The instruction is unavailable for this message.",
  },

  memory: {
    usedTip:
      "Memories injected with this message, redacted like the rest — click to open Memory",
    used: (labels) => `Memory used — ${labels}`,
    skippedTip:
      "These memories matched but did not go out with this message — click to open the card",
    skipped: (parts) => `Memory: ${parts}`,
    homographs: (labels, count) =>
      `${labels} not injected — the name alone is too common, write it in full${count > 1 ? "" : ""}`,
    budget: (n) => `${n} card${n > 1 ? "s" : ""} left out for lack of room`,
    pendingTip: "Extraction under way — the result will appear here",
    pending: "Saving to memory…",
    failedTip:
      "Nothing could be saved to memory. Ask “remember…” again to retry.",
    failed: "Saving to memory failed — nothing was noted, try again",
    notedTip: "Local memory (the Memory page) — an explicit ask to remember",
    preferenceSaved: "Preference saved to memory",
    nothingDurable: "Nothing durable to keep in memory",
    undone: "Memory removed",
    noted: (facts, profile, updatedSuffix) =>
      `${facts === 1 ? "1 fact noted" : `${facts} facts noted`}${profile ? " + profile" : ""}${updatedSuffix} in memory`,
    updatedSuffix: (n) => ` · ${n === 1 ? "1 card updated" : `${n} cards updated`}`,
    undo: "Undo",
    undoTip: "Remove from memory what this request created",
  },

  actions: {
    regenerate: "Regenerate",
    fork: "Duplicate the conversation from here",
    feedback: "Give feedback on this reply",
  },

  bubble: {
    openAttachment: (name) => `Open ${name}`,
    plotTip: "Generating a chart (run_python)",
    plot: "Chart",
    redactionFailedTip: "The redaction model failed for this message",
    redactedTip: "Replaced by placeholders before the model saw it, restored in its reply",
    redacted: (n, modelName) =>
      `${n} item${n === 1 ? "" : "s"} redacted before ${modelName}`,
    breakdownSuffix: (breakdown) => ` — ${breakdown}`,
    toolFlowFailed:
      "A step of the tool flow failed. Retrying restarts the flow (successful steps are replayed; every write asks for confirmation again).",
    autoRoutedTip:
      "Auto mode: the model for this reply was chosen automatically, based on the task.",
    quotaTip: "This model's provider quota",
    reasoning: "Reasoning",
  },

  mark: {
    realValue: "real value",
    seenByModel: "seen by the model",
    orgForced: "Enforced by the organisation",
    reveal: "Reveal",
    reRedact: "Redact again",
    revealKind: "Reveal the whole category",
    reRedactKind: "Redact the whole category again",
    deleteTip: "Remove this redaction entirely — the value stays visible and leaves in the clear",
    delete: "Delete the redaction",
    reportTip: "Opens “Your feedback”, prefilled — never paste the real value into it",
    report: "Report a mistake",
    sheetLabel: "Redaction",
  },

  struggle: {
    unknownTool: (connector, action) =>
      `${connector} cannot do “${action}” — that action does not exist in the connector.`,
    ownKeysHint: "Some of them only turn on with your own access keys.",
    ownKeysHintWithPath:
      "Open its card in Settings → Connectors: some of them only turn on with your own access keys.",
    connectorError: (connector, action) =>
      `${connector} refused the action “${action}”. The model is not at fault: changing it would change nothing. Most often, access to the account has expired —`,
    reconnect: "reconnect it, then ask again.",
    reconnectWithPath: "reconnect it in Settings → Connectors, then ask again.",
    noToolUsed: (who) =>
      `${who} answered without using your connectors. A model more comfortable with tools (Claude, for instance) uses them better: switch model under the message, then ask again.`,
    badCall: (who, action) =>
      `${who} could not phrase the action “${action}”. A model more comfortable with tools (Claude, for instance) usually manages: switch model under the message.`,
    reconnectTip: (connector) => `Open the ${connector} card to reconnect the account`,
    reconnectCta: "Reconnect",
  },
} satisfies Messages["conversation"];
