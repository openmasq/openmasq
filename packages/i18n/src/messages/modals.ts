/**
 * The MODALS — the panels that take the screen, and the vocabulary they present.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
 * The split holds the 300-LOC cap (rule 1) — same shape as `packages/emails/i18n/`.
 */
export interface ModalsMessages {
  /** The side-by-side comparison: your text / what actually left. */
  transparency: {
    title: string;
    sub: (count: number, modelName: string) => string;
    /** The model's name when we have it; otherwise this word. */
    theModel: string;
    close: string;
    empty: string;
    /** The headers FOLLOW the role: on a reply, « ce que vous avez écrit » would be false. */
    youWrote: string;
    youRead: string;
    modelReceived: string;
    modelWrote: string;
    yourMessage: string;
    reply: string;
    swapped: (count: number) => string;
  };

  /** A provider's or a tool's RAW message — never added to the conversation. */
  error: {
    eyebrow: string;
    title: string;
    sub: string;
    copy: string;
    copied: string;
    retry: string;
  };

  /** The downloaded update, with its release note when one is published. */
  updateReady: {
    eyebrow: string;
    version: (version: string) => string;
    noNote: string;
    later: string;
    restartNow: string;
  };

  /** A connector that accepts both: your account, or anonymous access. */
  mcpAuth: {
    title: (connector: string) => string;
    sub: (connector: string) => string;
    withAccount: string;
    withAccountDesc: (connector: string) => string;
    anonymous: string;
    anonymousDesc: string;
    cancel: string;
  };

  /** ⌘K. */
  search: {
    placeholder: string;
    newChat: string;
    noResults: string;
  };

  /**
   * « Votre avis ». The MOOD stops being mandatory as soon as the log accompanies
   * the send — so the label must SAY it, or the friction removed from the code
   * settles back into the head of whoever writes.
   */
  avis: {
    title: string;
    sub: string;
    thanks: string;
    thanksWithJournal: string;
    thanksPlain: string;
    close: string;
    moodLabel: string;
    optional: string;
    categoryLabel: string;
    messageLabel: string;
    messagePlaceholder: string;
    attachContext: string;
    attachContextSub: string;
    attachJournal: string;
    /** Where the redaction erred — the sentence goes into the draft the person re-reads. */
    inDocument: string;
    inReply: string;
    inMessage: string;
    problemKind: (kind: string) => string;
    problemBody: (where: string, kind: string) => string;
    /** The two other pre-filled drafts — the person re-reads and completes them. */
    journalDraft: string;
    replyDraft: string;
    attachJournalSub: string;
    confidential: string;
    /** The moods and the feedback types: the glyph and the id stay in the code. */
    moods: { love: string; ok: string; meh: string };
    categories: { idea: string; bug: string; love: string; other: string };
  };

  /** A provider's key — pasted, or obtained in one click. */
  apiKey: {
    eyebrow: string;
    title: (provider: string) => string;
    sub: string;
    alreadySaved: (provider: string) => string;
    connectTip: (brand: string, provider: string) => string;
    authorizing: string;
    getNewKey: string;
    getFreeKey: string;
    orPaste: string;
    whereToFind: (provider: string) => string;
    getMyKey: string;
    keyLabel: (provider: string) => string;
    getOne: string;
    removeKey: string;
    /** The fallback when the provider's key has no recognisable prefix. */
    keyPlaceholderFallback: (provider: string) => string;
  };

  /** The debug log — the REAL of this conversation. */
  debug: {
    eyebrow: string;
    title: string;
    /** « Ce qui a réellement été envoyé et reçu pour CETTE conversation — N entrées. » */
    subLead: string;
    thisConversation: string;
    subCount: (count: number) => string;
    searchPlaceholder: string;
    clearSearch: string;
    copyFullTip: string;
    copyFull: string;
    copyNoMapTip: string;
    copyNoMap: string;
    copied: string;
    clearTip: string;
    clear: string;
    sendToDevsTip: string;
    sendToDevs: string;
    copyEntry: string;
    tabs: { all: string; phase: string; wire: string; turn: string; tool: string; error: string };
    /** An entry's labels and the copied text. */
  };

  /** The help, and its release notes. */
  guide: { helpCenter: string; themes: string; noReleases: string };

  /** The import of Claude Code's skills. */
  importSkills: {
    eyebrow: string;
    title: string;
    sub: (brandOfSource: string) => string;
    reading: string;
    dropTitle: string;
    nothingFound: string;
  };

  /** « Comment accéder à ce modèle ? » */
  modelAccess: {
    eyebrow: string;
    freeModels: string;
    includedModels: string;
    freeDescSold: (brand: string) => string;
    freeDescServed: (brand: string) => string;
    subscription: (brand: string) => string;
    subscriptionDesc: (brand: string) => string;
    subscriptionCovers: string;
    subscriptionCoversDesc: string;
    ownKey: string;
    ownKeyDesc: (soldSuffix: string) => string;
    ownKeyWithoutCredits: string;
    ownKeyStatic: string;
    openRouterNote: (brand: string) => string;
  };

  /** The ⌘K group headers, and the state of a conversation that is generating. */
  searchRows: { goTo: string; files: string; settings: string; generating: string };

  /** The redaction rules: the frame around the chips. */
  redactionRules: {
    eyebrow: string;
    titleLead: string;
    titleHighlight: string;
    sub: string;
    thisConversation: string;
    byDefault: string;
    memoryTitle: string;
    memoryDesc: (brand: string) => string;
  };
}
