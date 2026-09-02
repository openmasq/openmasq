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
    dismiss: string;
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
  actions: { copy: string; copied: string; regenerate: string; fork: string; feedback: string };

  /** What borders a bubble. */
  bubble: {
    openAttachment: (name: string) => string;
    plotTip: string;
    plot: string;
    redactionFailedTip: string;
    redactedTip: string;
    /** « N protégés » — the ONE short mention under a sent message; « voir » opens the
     *  transparency comparison. The per-category detail lives there, never here. */
    protectedCount: (count: number) => string;
    protectedSee: string;
    autoRoutedTip: string;
    quotaTip: string;
    reasoning: string;
  };

  /** The tool-call trace card: one row per call, its status words. */
  trace: {
    connector: string;
    calling: string;
    running: string;
    actionsRunning: (count: number) => string;
    actionsDone: (count: number) => string;
    retrying: (attempt: number) => string;
    attempts: (count: number) => string;
    failed: string;
    failedWith: (note: string) => string;
    declined: string;
  };

  /** The loader's accessible name — announced, never painted. */
  thinking: { writing: string; reflecting: string; preparing: string };

  /** The per-conversation token total (counts arrive already formatted). */
  tokens: { tip: (total: string, input: string, output: string) => string; line: (input: string, output: string) => string };

  /**
   * THE lexicon of « letting the model see » — ONE block, for every surface that offers
   * it (the composer chips and word popover, the hover card on a mark, the document
   * preview, the pre-search card). Five verbs used to coexist (« Garder en clair »,
   * « Démasquer », « Supprimer le masquage », « Passer en Standard »…) for two gestures:
   *
   *  - `leaveClear` — REVERSIBLE: the value goes out as-is, the mask comes back on a click;
   *  - `remove` — DEFINITIVE: the redaction is deleted, the value stays visible for good.
   *
   * ⚠️ Every verb is a FUNCTION of its scope and renders it as a suffix (« · cet envoi »,
   * « · cette conversation », « · ce message »): a gesture whose reach one has to guess is
   * a gesture one believes shorter than it is (rule 8). The three scopes are the keys
   * `scopeSend` / `scopeConversation` / `scopeMessage`; a surface passes the one it holds.
   */
  mark: {
    realValue: string;
    seenByModel: string;
    /** Tooltips on the displayed value, per surface. */
    seenByModelTip: string;
    realValueTip: string;
    orgForced: string;
    scopeSend: string;
    scopeConversation: string;
    scopeMessage: string;
    leaveClear: (scope: string) => string;
    leaveClearKind: (scope: string) => string;
    leaveClearTip: string;
    reMask: (scope: string) => string;
    reMaskKind: (scope: string) => string;
    reMaskTip: string;
    remove: (scope: string) => string;
    removeTip: string;
    reportTip: string;
    report: string;
    sheetLabel: string;
  };

  /** When a tool went wrong — said with the gesture that repairs it. */
  struggle: {
    /** The caption's tooltip — carries the tool's technical name, for support. */
    failedTip: (tool?: string) => string;
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
