/**
 * The SETTINGS — their tabs, their ⌘K-reachable entries, their mobile groups.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
 * The split holds the 300-LOC cap (rule 1) — same shape as `packages/emails/i18n/`.
 */

/** The rail label, the panel title, a ⌘K row's sentence, and the words one types
 *  to land on it — a settings tab is named here, once. */
export interface SettingsTab {
  label: string;
  title: string;
  /** A FUNCTION, like every entry with a variable (see the header): only one tab names
   *  the brand today, but a `sub` in two shapes would make two ways of reading it
   *  au moment de l'assemblage. */
  sub: (brand: string) => string;
  kw: string;
}

/** An individual setting reachable from ⌘K: what it is called, and what one types. */
export interface SettingsEntry {
  label: string;
  kw: string;
}

/** The SETTINGS. « Apparence » comes first because it is the section that
 *  carries the language picker: leaving it hard-coded in French would have made the one
 *  section an English speaker must reach unreadable to them. */
export interface SettingsMessages {
  appearance: {
    /** The section's heading. */
    title: string;
    /** The dark-background switch: its title, then what it does. */
    darkModeLabel: string;
    darkModeHint: string;
  };

  /**
   * ONE settings tab, named once for its THREE surfaces: the settings rail
   * (`label`, short), the panel header (`title`, often longer — « MCP »
   * becomes « Serveurs MCP »), and the ⌘K row (`title` + `sub`).
   *
   * `kw` = what one TYPES that is neither in the label nor in the sentence (« facture »,
   * « changelog », « sso »). Space-separated words, lowercase, and WITHOUT
   * accents where the user will type without them — the search folds accents on both
   * sides, but an already-folded word costs less to re-read.
   */
  tabs: {
    account: SettingsTab;
    privacy: SettingsTab;
    models: SettingsTab;
    mcp: SettingsTab;
    browser: SettingsTab;
    audit: SettingsTab;
    usage: SettingsTab;
    sync: SettingsTab;
    org: SettingsTab;
    billing: SettingsTab;
    versions: SettingsTab;
  };

  /**
   * The INDIVIDUAL settings the palette can reach — one hunts for « mode sombre »,
   * not for the tab that contains it. A hand-kept list ON PURPOSE: one row per redaction
   * category would bury the four things people actually look for.
   */
  entries: {
    darkMode: SettingsEntry;
    importConversations: SettingsEntry;
    messageBilling: SettingsEntry;
    notifyOnReply: SettingsEntry;
    anonymousStats: SettingsEntry;
    transparencyLog: SettingsEntry;
    linkPreviews: SettingsEntry;
    protectionLevel: SettingsEntry;
    showTokens: SettingsEntry;
    modelSeesTokens: SettingsEntry;
    localModel: SettingsEntry;
    favouriteModels: SettingsEntry;
    claudeSubscription: SettingsEntry;
    chatgptSubscription: SettingsEntry;
    writeConfirm: SettingsEntry;
    connectedDevices: SettingsEntry;
    environment: SettingsEntry;
  };

  /**
   * The group HEADERS of the phone's Settings screen. Ten flat rows make a
   * wall on a mobile; the desktop rail does without them (the label sits beside its
   * icon). `other` is the net: a tab no group claims lands there
   * rather than disappearing.
   */
  groups: {
    account: string;
    privacy: string;
    aiTools: string;
    devices: string;
    org: string;
    app: string;
    other: string;
  };

  /** Where a settings row in the palette comes from: « Dans « Compte » ». */
  inTab: (tabTitle: string) => string;
}
