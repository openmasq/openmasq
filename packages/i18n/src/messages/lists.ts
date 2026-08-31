/**
 * Le contrat de la tranche « lists » — les quatre écrans où l'on RANGE ce qu'on écrit :
 * Compétences, Mémoire, Bibliothèque, Coffre.
 *
 * Ils se ressemblent exprès (même squelette de page, même état vide, même filtre), donc
 * leur copie vit ensemble : c'est ce qui permet de voir d'un coup d'œil qu'ils se
 * répondent. Le NOM de chaque section et sa phrase d'aide restent dans `sections` — la
 * navigation les dit déjà.
 */

/** L'état vide d'un écran : ce qu'il est, puis le geste qui le remplit. */
export interface EmptyStateCopy {
  title: string;
  body: string;
  points: readonly string[];
  /** Absent quand l'écran ne se remplit pas d'ici (la Bibliothèque se remplit en
   *  conversant) : promettre un geste que la page n'offre pas serait pire que rien. */
  cta?: string;
}

/** L'état « votre filtre ne rend rien » — le même partout, avec sa sortie. */
export interface NoMatchCopy {
  search: string;
  category: string;
  title: string;
  body: string;
  cta?: string;
}

export interface ListsMessages {
  /** Ce que les quatre partagent. */
  loading: string;
  /** Le « tout » d'un filtre — masculin/féminin selon la liste, d'où deux clés. */
  allFeminine: string;
  allMasculine: string;
  /** Les onglets de catégorie de la Bibliothèque. */
  libraryTabs: { all: string; image: string; document: string; sheet: string; audio: string };
  /** Les catégories d'une compétence, et le « toutes » du filtre. */
  competenceCategories: {
    all: string;
    redaction: string;
    analyse: string;
    code: string;
    juridique: string;
    support: string;
    routine: string;
  };
  /** Les boutons de mise en forme de l'éditeur d'instruction. */
  marks: { bold: string; italic: string; heading: string; quote: string; bullet: string; ordered: string; code: string };
  competences: {
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
    /** La carte et la rangée. */
    editAria: (name: string) => string;
    pin: string;
    unpin: string;
    useTip: string;
    useAria: (name: string) => string;
    use: string;
    shareTip: string;
    share: string;
    /** La modale. */
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
    /** Le champ d'instruction. */
    prompt: {
      label: string;
      chars: (count: number) => string;
      fileName: string;
      preview: string;
      previewEmpty: string;
      placeholder: string;
    };
    /** Le choix des connecteurs. */
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
    /** Les deux nœuds que le graphe dessine lui-même. */
    coreNode: string;
    profileNode: string;
    /** Les quatre catégories d'une fiche. */
    categories: { personne: string; organisation: string; projet: string; autre: string };
    hubDesc: (category: string) => string;
    onlyShow: (category: string) => string;
    clearFilter: string;
    /** La légende des traits du graphe. */
    legend: { category: string; mention: string; mentionTip: string; sameTopic: string; sameTopicTip: string };
    /** Le panneau d'une fiche. */
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
    /** Les deux bandeaux : le doublon proposé, et la suppression annulable. */
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
    /** La modale d'ajout. */
    add: {
      title: string;
      sub: string;
      term: string;
      termPlaceholder: string;
      type: string;
      note: string;
      notePlaceholder: string;
    };
    /** La fenêtre des occurrences. */
    uses: {
      title: string;
      summary: (times: number, conversations: number) => string;
      none: string;
      openConversation: string;
    };
  };
}
