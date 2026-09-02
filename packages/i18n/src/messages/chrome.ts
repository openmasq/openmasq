/**
 * The app's CHROME — the left bar, the conversation screen, the composer.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
 * The split holds the 300-LOC cap (rule 1) — same shape as `packages/emails/i18n/`.
 */

/**
 * The LEFT chrome — the collapsed rail AND the expanded sidebar. Both show
 * the same commands at two sizes, hence the same words: a rail saying
 * « Nouveau » where the bar says « Nouvelle conversation » would be two products.
 *
 * Many of these entries render TWICE on the same button — as a tooltip and as an
 * `aria-label`. That is deliberate: the tooltip is visual, the label is read. One
 * key for both, or they drift apart.
 */
export interface ChromeMessages {
  expandSidebar: string;
  newChat: string;
  search: string;
  /** The tooltip, which adds the shortcut — « Rechercher (⌘K) ». */
  searchShortcut: string;
  /** Replaces the Mémoire tooltip when the background extraction noted something new. */
  memoryFresh: string;
  /** The shield: « 12 élément(s) protégé(s) — rapport de confidentialité ». */
  privacyReportTip: (protectedCount: number) => string;
  privacyReport: string;
  account: string;
  /** The conversation list: its read label, and what it says when empty. */
  conversations: string;
  noConversations: string;
  /** The account card in the bar's footer — fallback name, subtitle, badge. */
  you: string;
  privateSpace: string;
  private: string;
  /** The pin of a skill that drives connectors. */
  launchPinned: (what: string) => string;
  /** The only row action that asks first: it ALSO destroys the vault.
   *  Two entries, two grammars — the ACTION is an imperative in the menu, the QUESTION
   *  is the dialog title. Deriving one from the other by dropping the « ? » works in
   *  French and breaks on the first language that punctuates differently. */
  deleteConversationAction: string;
  deleteConversation: string;
  deleteConversationBody: (title: string) => string;
  /** The fallback title of a conversation that has none yet. */
  untitledConversation: string;
  /** The time buckets of the conversation list. */
  groups: { today: string; yesterday: string; last7: string; last30: string };
  /** The relative time on a conversation row — the rest is `Intl`. */
  justNow: string;
  /** The right rail's footer. */
  help: string;
  helpTip: (brand: string) => string;
  sendFeedback: string;
  /** The update entry, first in the footer once a version is downloaded: the short
   *  label (« Mise à jour 0.9.1 ») and its tooltip. */
  updateReady: (version: string) => string;
  updateReadyTip: (brand: string, version: string) => string;
  /** The « Aide » modal's head — eyebrow, title — and its one closing button. */
  guideEyebrow: string;
  guideTitle: (brand: string) => string;
  guideUnderstood: string;
  /** The three families of a release note. */
  releaseKinds: { feat: string; imp: string; fix: string };
}

/**
 * The CONVERSATION screen — its tab bar, its « ⋯ » menu, the actions on a row
 * of the list. Everything that borders the thread without being part of it.
 *
 * DELETION is not here: it lives in `chrome`, because the same act is asked for
 * from two places (the sidebar row, the header menu) and the two dialogs had
 * already drifted — one promised « définitivement »,
 * the other « de cet appareil ».
 */
export interface ChatMessages {
  backToConversations: string;
  toggleSidebar: string;
  /** The « ⋯ » button of the top bar. */
  more: string;
  /** The « ⋯ » of a list row, and what it opens. */
  rowActions: string;
  rename: string;
  renameConversation: string;
  /** The spinning pill of a tab whose reply is arriving. */
  generating: string;
  closeTab: string;
  /** Tabs scrolled out of view: the tooltip explains, the read label counts. */
  hiddenTabsTip: (count: number) => string;
  hiddenTabs: (count: number) => string;
  splitScreen: string;
  splitLeft: string;
  splitRight: string;
  /** The menu entry leading to THIS conversation's redaction categories, with its
   *  counter. The LEVEL is not named here: the composer's level button is the one
   *  place a conversation's level is chosen, and this entry leads to the categories. */
  redactionSummary: (protectedCount: number) => string;
  seeWhatTheModelSaw: string;
  debugLog: string;
}

/** The COMPOSER — the input area and its controls. */
export interface ComposerMessages {
  redactLevel: string;
  currentLevel: string;
  /** The button's tooltip: the level in force and the scope a click would write. */
  redactLevelTip: (level: string, scope: string) => string;
  /** The scope, as a short noun for the tooltip and the confirmation pill. */
  scopeShortConversation: string;
  scopeShortDefault: string;
  /** The scope, said in the menu BEFORE the click — full sentence. */
  scopeConversation: string;
  scopeDefault: string;
  /** The eye a reduced level wears (screen-reader name). */
  reducedTip: string;
  /** Org-mandated categories stay on whatever the level. */
  forcedNote: (count: number) => string;
  /** The confirmation pill after a click, and its undo. */
  applied: (level: string, scope: string) => string;
  undo: string;
  /** The read label of the Settings level picker. */
  protectionLevel: string;

  /** The input area's prompt. It does NOT REPEAT the redaction promise: the
   *  home subtitle makes it once, and inside a thread the marks on what you type
   *  are what demonstrate it. */
  placeholder: (brand: string) => string;

  /** The intent line above the input: chosen skill, blanks to fill,
   *  et l'indice « ceci sera retenu ». */
  editSkill: string;
  slotsToFill: string;
  removeTool: string;
  memoryHint: string;
  memoryHintTip: string;

  /** The USEFULNESS warning — redacting this risks skewing the reply. Its two
   *  ways out: send in clear for this message, or hide the notice. */
  keepInClearTip: string;
  dismissWarning: string;

  /** The « + » door — ONE button in the action row, four ways of adding something to
   *  the message. The short words are the entries; the long ones their tooltips. */
  add: string;
  addFile: string;
  attachFile: string;
  addFolder: string;
  addFolderTip: string;
  addConnector: string;
  addConnectorTip: string;
  addSkill: string;
  useSkill: string;
  stop: string;
  send: string;
  /** The send button MORPHS: send → redacting → redacted. Three states, three words. */
  redacting: string;
  redactingAria: string;
  redacted: string;

  /** The DETECTION chips under the input — each toggles « masqué ⇄ en clair ». The
   *  toggle's VERBS come from `conversation.mark` (the one lexicon), scoped « cet envoi ». */
  detect: {
    /** The deep analysis GAVE UP: say so, and say the send redoes it. */
    partialNone: string;
    partialNoneHint: string;
    partialCount: (count: number) => string;
    partialCountHint: string;
    uncertain: string;
    /** The word an uncertain detection carries, on the chip itself. */
    toVerify: string;
    showAll: string;
    more: (count: number) => string;
    collapseTip: string;
    collapse: string;
  };

  /** The LONG draft, folded into a card: it is edited in a modal. */
  longText: {
    openTip: string;
    /** Numbers go through `Intl` INSIDE the catalogue — each language knows its own. */
    summary: (chars: number, lines: number) => string;
    edit: string;
  };

  /** The long-text editing modal. */
  modal: {
    title: string;
    sub: string;
    tabEdit: string;
    tabPreview: string;
    toMask: (count: number) => string;
    /** Past a threshold the live highlighting pauses — the protection does not. */
    mirrorOff: (maxChars: number) => string;
    done: string;
  };

  /** The ATTACHMENTS waiting to be sent. The chip has FOUR states, one word each
   *  (reading · masking · redo · ready); the detail goes to the tooltip. */
  attachments: {
    open: string;
    processing: string;
    /** Tooltip while the file is being masked. */
    redacting: string;
    stateReading: string;
    stateReadingPage: (page: number, total: number) => string;
    stateMasking: string;
    stateMaskingPct: (pct: number) => string;
    stateRedo: string;
    /** « 3 valeurs » — the unit matters on a chip that small (the glyph is drawn). */
    stateReady: (count: number) => string;
    /** Why the chip says « à refaire ». */
    staleTip: string;
    partialTip: (read: number, total: number) => string;
    readAllPages: (total: number) => string;
    readAllPagesTip: (read: number) => string;
    retryRedaction: string;
    reRedact: string;
    reRedactTip: string;
    remove: string;
  };

  /** The file DROP onto the window. */
  drop: {
    title: string;
    sub: string;
    close: string;
    folderDialog: string;
  };
}
