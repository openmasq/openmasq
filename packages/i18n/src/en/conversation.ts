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
    dismiss: "Stop suggesting",
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
  folderPickFailed: "could not pick a folder",
  folderGrantFailed: "the authorisation failed",
  slashRemember: {
    label: "Remember in memory",
    desc: "Inserts “Remember that…” — the durable fact is noted in Memory, locally.",
  },
  opening: "Opening…",
  memoryToast: "Noted in memory",
  clarify: "Clarify",

  writeConfirm: {
    targetTip: (server, tool) => `${server} · ${tool}`,
    alsoOtherChats: "In my other conversations too (until the app closes)",
  },

  skillTag: {
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
    redactionFailedTip: "The redaction model failed for this message",
    redactedTip: "Replaced by placeholders before the model saw it, restored in its reply",
    protectedCount: (n) => `${n} protected`,
    protectedSee: "see",
    autoRoutedTip:
      "Auto mode: the model for this reply was chosen automatically, based on the task.",
    quotaTip: "This model's provider quota",
    reasoning: "Reasoning",
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
    realValueTip: "Real value — leaves in the clear if you leave it in the clear",
    orgForced: "Enforced by the organisation",
    scopeSend: "this send",
    scopeConversation: "this conversation",
    scopeMessage: "this message",
    leaveClear: (scope) => `Leave in the clear · ${scope}`,
    leaveClearKind: (scope) => `Leave the category in the clear · ${scope}`,
    leaveClearTip: "Reversible: the value leaves as-is for the model, the mask comes back with one click",
    reMask: (scope) => `Mask again · ${scope}`,
    reMaskKind: (scope) => `Mask the category again · ${scope}`,
    reMaskTip: "Mask this value again",
    remove: (scope) => `Remove the masking · ${scope}`,
    removeTip: "Definitive: no marker left — the value stays visible and leaves in the clear",
    reportTip: "Opens “Your feedback”, prefilled — never paste the real value into it",
    report: "Report a mistake",
    sheetLabel: "Redaction",
  },

  struggle: {
    failedTip: (tool) => (tool ? `A tool call did not go through: ${tool}` : "A tool call did not go through"),
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
