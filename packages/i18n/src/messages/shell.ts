/**
 * Le contrat de la tranche « shell » — le cadre autour de la conversation : le rail
 * droit (onglets web + dossiers), les onglets de panneau, et les écrans du TÉLÉPHONE.
 *
 * Le mobile a ses propres écrans (`containers/shell/mobile/`) mais pas son propre
 * vocabulaire : quand une phrase existe déjà côté bureau (`chrome`, `sections`,
 * `common`), elle est LUE là-bas — ce qui vit ici n'existe que sur ces surfaces.
 */

export interface ShellMessages {
  /** Le rail droit, replié comme déplié. */
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
    /** Une pastille d'onglet : replier celui qui est ouvert, fermer, piloté. */
    collapseItem: (label: string) => string;
    closeItem: (label: string) => string;
    driven: string;
  };
  /** Les onglets de documents au-dessus d'un panneau. */
  panelTabs: {
    sidePanel: string;
    closeTab: string;
    openFile: string;
    openFileTip: string;
  };
  /** L'arbre des dossiers autorisés et du stockage connecté. */
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
  /** Les écrans du téléphone — ce qu'ils sont seuls à dire. */
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
