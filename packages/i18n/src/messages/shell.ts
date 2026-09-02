/**
 * The « shell » slice contract — the frame around the conversation: the right
 * rail (web tabs + folders), the panel tabs, and the PHONE screens.
 *
 * Mobile has its own screens (`containers/shell/mobile/`) but not its own
 * vocabulary: when a sentence already exists on the desktop side (`chrome`, `sections`,
 * `common`), it is READ from there — what lives here exists only on these surfaces.
 */

export interface ShellMessages {
  /** The right rail, collapsed as well as expanded. */
  rightRail: {
    ariaLabel: string;
    title: string;
    collapse: string;
    expand: string;
    newBrowserTab: string;
    browser: string;
    web: string;
    noTabs: string;
    foldersTip: string;
    folders: string;
    /** A tab chip: collapse the open one, close, driven. */
    collapseItem: (label: string) => string;
    closeItem: (label: string) => string;
    driven: string;
  };
  /** The ONE status chip (`shell/shellNotice.ts`): the sentence behind each title and
   *  its action. The titles themselves are `leaves.offline` / `leaves.freeModelsNotice`. */
  notice: {
    offlineBody: (brand: string) => string;
    reconnectOne: (name: string) => string;
    reconnectMany: (count: number) => string;
    reconnectOneBody: string;
    reconnectManyBody: (names: string) => string;
    reconnect: string;
    accessBodySold: (brand: string) => string;
    accessBody: string;
    seeAccess: string;
  };
  /** The document tabs above a panel. */
  panelTabs: {
    sidePanel: string;
    closeTab: string;
    openFile: string;
    openFileTip: string;
  };
  /** The tree of granted folders and connected storage. */
  folders: {
    onThisDevice: string;
    local: string;
    manageFolders: string;
    noFolders: string;
    addFolder: string;
    connectedStorage: string;
    cloud: string;
    accountFailed: string;
    folderFailed: string;
    askAbout: (name: string) => string;
    ask: string;
    sourceLabel: (service: string, account: string) => string;
  };
  /** The phone screens — what only they say. */
  mobile: {
    accountAndSettings: string;
    searchConversation: string;
    searchConversationAria: string;
    noMatch: string;
    emptyConversation: string;
    redactedCount: (n: number) => string;
    library: {
      filesOrImages: string;
      files: string;
      images: string;
      noImages: string;
      noFiles: string;
      emptySub: string;
      fileActions: string;
      rowActions: (name: string) => string;
      deleteTitle: string;
      deleteBody: (name: string) => string;
      redactedData: (n: number) => string;
      hasRedacted: string;
    };
    memory: {
      sub: (brand: string, count: number) => string;
      profile: string;
      profilePlaceholder: (brand: string) => string;
      autoExtract: (brand: string) => string;
      empty: string;
      emptySub: string;
      newCard: string;
      addTo: (category: string) => string;
      addSheet: string;
      addToCategory: (category: string) => string;
      newMemory: string;
      memoryName: string;
      add: string;
      memorySheet: string;
      notedBy: (brand: string) => string;
      factsPlaceholder: string;
      facts: string;
      removeFromMemory: string;
      profileSheet: string;
      profileTextPlaceholder: string;
    };
    settings: {
      backToSettings: string;
      orgSuffix: (org: string) => string;
      help: string;
    };
  };
}
