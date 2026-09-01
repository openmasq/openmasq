/**
 * The « lists » slice contract — the four screens where one FILES what one writes:
 * Compétences, Mémoire, Bibliothèque, Coffre.
 *
 * They resemble one another on purpose (same page skeleton, same empty state, same filter), so
 * their copy lives together: that is what makes it visible at a glance that they
 * answer one another. Each section's NAME and its help sentence stay in `sections` — the
 * navigation says them already.
 */

/** A screen's empty state: what it is, then the gesture that fills it. */
export interface EmptyStateCopy {
  title: string;
  body: string;
  points: readonly string[];
  /** Absent when the screen is not filled from here (the Bibliothèque fills up while
   *  conversing): promising a gesture the page does not offer would be worse than nothing. */
  cta?: string;
}

/** The « your filter returns nothing » state — the same everywhere, with its way out. */
export interface NoMatchCopy {
  search: string;
  category: string;
  title: string;
  body: string;
  cta?: string;
}

export interface ListsMessages {
  /** What the four share. */
  loading: string;
  /** A filter's « all » — masculine/feminine depending on the list, hence two keys. */
  allFeminine: string;
  allMasculine: string;
  /** The Bibliothèque's category tabs. */
  libraryTabs: { all: string; image: string; document: string; sheet: string; audio: string };
  /** A skill's categories, and the filter's « toutes ». */
  skillCategories: {
    all: string;
    redaction: string;
    analyse: string;
    code: string;
    juridique: string;
    support: string;
    routine: string;
  };
  /** The formatting buttons of the instruction editor. */
  marks: { bold: string; italic: string; heading: string; quote: string; bullet: string; ordered: string; code: string };
  skills: {
    empty: EmptyStateCopy;
    noMatch: NoMatchCopy;
    createLabel: string;
    createHint: string;
    search: string;
    importTip: string;
    import: string;
    formatting: string;
    presets: string;
    undo: string;
    /** The card and the row. */
    editAria: (name: string) => string;
    pin: string;
    unpin: string;
    useTip: string;
    useAria: (name: string) => string;
    use: string;
    shareTip: string;
    share: string;
    /** The modal. */
    modal: {
      titleNew: string;
      titleEdit: string;
      sub: string;
      name: string;
      namePlaceholder: string;
      category: string;
      description: string;
      descriptionPlaceholder: string;
      connectors: string;
      allConnectors: string;
      someConnectors: (count: number) => string;
      noteWithServers: string;
      noteWithoutServers: string;
      delete: string;
      duplicate: string;
      duplicateTip: string;
      create: string;
    };
    /** The instruction field. */
    prompt: {
      label: string;
      chars: (count: number) => string;
      fileName: string;
      preview: string;
      previewEmpty: string;
      placeholder: string;
    };
    /** The connector choice. */
    picker: { note: string; connectedDot: string };
  };

  memory: {
    empty: EmptyStateCopy;
    newCard: string;
    search: string;
    searchAria: string;
    reviewTip: string;
    review: (count: number) => string;
    byCategory: string;
    noMatch: string;
    confirmTip: string;
    confirm: string;
    removeTip: string;
    removeAria: (entity: string) => string;
    graphAria: (count: number) => string;
    /** The two nodes the graph draws itself. */
    coreNode: string;
    profileNode: string;
    /** A card's four categories. */
    categories: { personne: string; organisation: string; projet: string; autre: string };
    hubDesc: (category: string) => string;
    onlyShow: (category: string) => string;
    clearFilter: string;
    /** The legend of the graph's edges. */
    legend: { category: string; mention: string; mentionTip: string; sameTopic: string; sameTopicTip: string };
    /** A card's panel. */
    panel: {
      aria: string;
      close: string;
      entity: string;
      category: string;
      facts: string;
      factsPlaceholder: string;
      aliases: string;
      aliasesPlaceholder: string;
      autoNoted: string;
      replaced: string;
      restoreTip: string;
      restore: string;
      noLinks: string;
      delete: string;
    };
    profile: { title: string; edit: string; editTip: string; placeholder: string; aria: string };
    /** The two banners: the proposed duplicate, and the undoable deletion. */
    mergeSemantic: string;
    merge: string;
    dismiss: string;
    deleted: (entity: string) => string;
    undo: string;
  };

  library: {
    empty: EmptyStateCopy;
    noMatch: NoMatchCopy;
    search: string;
    select: string;
    selectFile: string;
    openFile: string;
    done: string;
    deleteCount: (count: number) => string;
    deleteTitle: (count: number) => string;
    deleteBody: (count: number) => string;
    preview: string;
    openExternal: string;
    openInApp: string;
    openInTab: string;
    usedIn: (count: number) => string;
    conversationsLoading: string;
    notUsed: string;
  };

  vault: {
    empty: EmptyStateCopy;
    noMatch: NoMatchCopy;
    search: string;
    shareTip: string;
    share: string;
    usesTip: string;
    occurrences: (count: number) => string;
    conversations: (count: number) => string;
    removeTip: string;
    reveal: string;
    hide: string;
    /** The add modal. */
    add: {
      title: string;
      sub: string;
      term: string;
      termPlaceholder: string;
      type: string;
      note: string;
      notePlaceholder: string;
    };
    /** The occurrences window. */
    uses: {
      title: string;
      summary: (times: number, conversations: number) => string;
      none: string;
      openConversation: string;
    };
  };
}
