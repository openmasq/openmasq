/**
 * The « conversation » slice contract — the conversation screen itself: the
 * agent browser that opens beside it, the artifact preview, the home starters, and
 * everything that borders a message (memory captions, actions, redaction notices).
 *
 * The COMPOSER has its own (`composer`) and so do the tabs (`chat`): they existed
 * before this screen. What lives here is what nobody else says.
 */

export interface ConversationMessages {
  /** The home of an empty conversation. */
  greeting: { morning: string; afternoon: string; evening: string };
  starters: {
    noSetup: string;
    withServices: string;
    orConnect: string;
    seeOthers: string;
    cardTip: (category: string, prompt: string) => string;
    cardAria: (category: string, prompt: string) => string;
    connectTip: (connector: string, prompt: string) => string;
  };

  /** The preview of a file produced by the model. */
  artifact: { pane: string; copy: string; copied: string; close: string };

  /** The agent browser, in its panel. */
  browser: {
    pane: string;
    bookmarks: string;
    askAboutPage: string;
    askAboutPageLabel: string;
    embedded: string;
    unavailable: string;
    loading: string;
    offlineTitle: string;
    offlineSub: (brand: string) => string;
    activating: string;
    activate: string;
    searchEngine: string;
    back: string;
    forward: string;
    reload: string;
    urlPlaceholder: string;
    urlAria: string;
    closeBrowser: string;
    close: string;
  };

  /** Resizing, preparing a document, the suspended organization. */
  resizePanel: string;
  suspendedTitle: string;
  suspendedBody: string;
  docPrep: { analysing: string; redacting: string; page: (page: number, total: number) => string; pages: (total: number) => string; ofCount: (idx: number, count: number) => string };
  chooseFolder: string;
  /** The refusal of a dropped folder, said by the host or by us. */
  folderPickFailed: string;
  folderGrantFailed: string;
  /** The composer's « /… » entry. */
  slashRemember: { label: string; desc: string };
  opening: string;
  memoryToast: string;
  /** The « Préciser » gesture's label — the quote just pasted. */
  clarify: string;

  /** The write-confirmation card (the rest lives in `cards`). */
  writeConfirm: { targetTip: (server: string, tool: string) => string; alsoOtherChats: string };

  /** The skill label under a message. */
  skillTag: {
    show: string;
    hide: string;
    promptEyebrow: string;
    edit: string;
    unavailable: string;
  };

  /** The memory captions, under a send. */
  memory: {
    usedTip: string;
    used: (labels: string) => string;
    skippedTip: string;
    skipped: (parts: string) => string;
    homographs: (labels: string, count: number) => string;
    budget: (count: number) => string;
    pendingTip: string;
    pending: string;
    failedTip: string;
    failed: string;
    notedTip: string;
    preferenceSaved: string;
    nothingDurable: string;
    undone: string;
    noted: (facts: number, profile: boolean, updatedSuffix: string) => string;
    updatedSuffix: (count: number) => string;
    undo: string;
    undoTip: string;
  };

  /** The action row under a reply. */
  actions: { regenerate: string; fork: string; feedback: string };

  /** What borders a bubble. */
  bubble: {
    openAttachment: (name: string) => string;
    plotTip: string;
    plot: string;
    redactionFailedTip: string;
    redactedTip: string;
    redacted: (count: number, modelName: string) => string;
    breakdownSuffix: (breakdown: string) => string;
    toolFlowFailed: string;
    autoRoutedTip: string;
    quotaTip: string;
    reasoning: string;
  };

  /** The card shown when hovering a redaction mark. */
  mark: {
    realValue: string;
    seenByModel: string;
    orgForced: string;
    reveal: string;
    reRedact: string;
    revealKind: string;
    reRedactKind: string;
    deleteTip: string;
    delete: string;
    reportTip: string;
    report: string;
    sheetLabel: string;
  };

  /** When a tool went wrong — said with the gesture that repairs it. */
  struggle: {
    unknownTool: (connector: string, action: string) => string;
    ownKeysHint: string;
    ownKeysHintWithPath: string;
    connectorError: (connector: string, action: string) => string;
    reconnect: string;
    reconnectWithPath: string;
    noToolUsed: (who: string) => string;
    badCall: (who: string, action: string) => string;
    reconnectTip: (connector: string) => string;
    reconnectCta: string;
  };
}
