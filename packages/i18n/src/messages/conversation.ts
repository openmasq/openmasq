/**
 * Le contrat de la tranche « conversation » — l'écran de la conversation lui-même : le
 * navigateur agent qui s'ouvre à côté, l'aperçu d'artefact, les amorces de l'accueil, et
 * tout ce qui borde un message (légendes de mémoire, actions, avis de redaction).
 *
 * Le COMPOSEUR a le sien (`composer`) et les onglets aussi (`chat`) : ils existaient
 * avant cet écran. Ce qui vit ici est ce que personne d'autre ne dit.
 */

export interface ConversationMessages {
  /** L'accueil d'une conversation vide. */
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

  /** L'aperçu d'un fichier produit par le modèle. */
  artifact: { pane: string; copy: string; copied: string; close: string };

  /** Le navigateur agent, dans son panneau. */
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

  /** Le redimensionnement, la préparation d'un document, l'organisation suspendue. */
  resizePanel: string;
  suspendedTitle: string;
  suspendedBody: string;
  docPrep: { analysing: string; redacting: string; page: (page: number, total: number) => string; pages: (total: number) => string; ofCount: (idx: number, count: number) => string };
  chooseFolder: string;
  /** Le refus d'un dossier déposé, dit par l'hôte ou par nous. */
  folderPickFailed: string;
  folderGrantFailed: string;
  /** L'entrée « /… » du composeur. */
  slashRemember: { label: string; desc: string };
  opening: string;
  memoryToast: string;
  /** L'étiquette du geste « Préciser » — la citation qu'on vient de coller. */
  clarify: string;

  /** La carte de confirmation d'écriture (le reste vit dans `cards`). */
  writeConfirm: { targetTip: (server: string, tool: string) => string; alsoOtherChats: string };

  /** L'étiquette de compétence sous un message. */
  competenceTag: {
    show: string;
    hide: string;
    promptEyebrow: string;
    edit: string;
    unavailable: string;
  };

  /** Les légendes de mémoire, sous un envoi. */
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

  /** La rangée d'actions sous une réponse. */
  actions: { regenerate: string; fork: string; feedback: string };

  /** Ce qui borde une bulle. */
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

  /** La carte au survol d'une marque de redaction. */
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

  /** Quand un outil s'est mal passé — dit avec le geste qui répare. */
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
