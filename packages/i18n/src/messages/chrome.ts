/**
 * La CHROME de l'app — le bandeau de gauche, l'écran de conversation, le composeur.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 * Le découpage tient le cap 300 LOC (règle 1) — même forme que `packages/emails/i18n/`.
 */

/**
 * La CHROME de gauche — le rail replié ET la barre latérale déployée. Les deux montrent
 * les mêmes commandes à deux tailles, donc les mêmes mots : un rail qui dirait
 * « Nouveau » quand la barre dit « Nouvelle conversation » serait deux produits.
 *
 * Beaucoup de ces entrées sortent DEUX fois sur le même bouton — en infobulle et en
 * `aria-label`. C'est voulu : l'infobulle est visuelle, l'étiquette est lue. Une seule
 * clé pour les deux, sinon elles divergent.
 */
export interface ChromeMessages {
  expandSidebar: string;
  newChat: string;
  search: string;
  /** L'infobulle, qui ajoute le raccourci — « Rechercher (⌘K) ». */
  searchShortcut: string;
  /** Remplace l'infobulle de la Mémoire quand l'extraction de fond a noté du neuf. */
  memoryFresh: string;
  /** Le bouclier : « 12 élément(s) protégé(s) — rapport de confidentialité ». */
  privacyReportTip: (protectedCount: number) => string;
  privacyReport: string;
  account: string;
  /** La liste des conversations : son étiquette lue, et ce qu'elle dit quand elle est vide. */
  conversations: string;
  noConversations: string;
  /** La carte de compte en pied de barre — nom de repli, sous-titre, pastille. */
  you: string;
  privateSpace: string;
  private: string;
  /** L'épingle d'une compétence qui pilote des connecteurs. */
  launchPinned: (what: string) => string;
  /** La seule action de ligne qui demande d'abord : elle détruit AUSSI le coffre.
   *  Deux entrées, deux grammaires — l'ACTION est un impératif au menu, la QUESTION est
   *  le titre du dialogue. Dériver l'une de l'autre en retirant le « ? » marche en
   *  français et se casse à la première langue qui ponctue autrement. */
  deleteConversationAction: string;
  deleteConversation: string;
  deleteConversationBody: (title: string) => string;
  /** Le titre de repli d'une conversation qui n'en a pas encore. */
  untitledConversation: string;
  /** Les tranches de temps de la liste des conversations. */
  groups: { today: string; yesterday: string; last7: string; last30: string };
  /** L'heure relative d'une ligne de conversation — le reste est de l'`Intl`. */
  justNow: string;
  /** Le pied du rail droit. */
  help: string;
  helpTip: (brand: string) => string;
  sendFeedback: string;
  /** Les trois familles d'une note de version. */
  releaseKinds: { feat: string; imp: string; fix: string };
}

/**
 * L'écran de CONVERSATION — sa barre d'onglets, son menu « ⋯ », les actions d'une ligne
 * de la liste. Tout ce qui borde le fil sans en faire partie.
 *
 * La SUPPRESSION n'est pas ici : elle vit dans `chrome`, parce que le même acte se
 * demande depuis deux endroits (la ligne de la barre latérale, le menu de l'en-tête) et
 * que les deux dialogues avaient déjà divergé — l'un promettait « définitivement »,
 * l'autre « de cet appareil ».
 */
export interface ChatMessages {
  backToConversations: string;
  toggleSidebar: string;
  /** Le bouton « ⋯ » de la barre du haut. */
  more: string;
  /** Le « ⋯ » d'une ligne de la liste, et ce qu'il ouvre. */
  rowActions: string;
  rename: string;
  renameConversation: string;
  /** La pastille tournante d'un onglet dont la réponse arrive. */
  generating: string;
  closeTab: string;
  /** Des onglets sortis du champ : l'infobulle explique, l'étiquette lue compte. */
  hiddenTabsTip: (count: number) => string;
  hiddenTabs: (count: number) => string;
  splitScreen: string;
  splitLeft: string;
  splitRight: string;
  /** L'entrée du menu qui mène aux règles de redaction, avec son compteur. */
  redactionSummary: (protectedCount: number) => string;
  seeWhatTheModelSaw: string;
  debugLog: string;
}

/** Le COMPOSEUR — la zone de saisie et ses commandes. */
export interface ComposerMessages {
  redactLevel: string;
  currentLevel: string;
  /** L'étiquette lue du sélecteur de niveau des Réglages. */
  protectionLevel: string;

  /** L'invitation de la zone de saisie. Elle ne REDIT pas la promesse de redaction : le
   *  sous-titre d'accueil la fait une fois, et dans un fil ce sont les marques sur ce
   *  qu'on tape qui la démontrent. */
  placeholder: (brand: string) => string;

  /** La ligne d'intention au-dessus de la saisie : compétence choisie, blancs à combler,
   *  et l'indice « ceci sera retenu ». */
  editSkill: string;
  slotsToFill: string;
  removeTool: string;
  memoryHint: string;
  memoryHintTip: string;

  /** L'avertissement d'UTILITÉ — redact ceci risque de fausser la réponse. Ses deux
   *  issues : envoyer en clair pour ce message, ou masquer l'avis. */
  keepInClearTip: string;
  dismissWarning: string;

  useSkill: string;
  attachFile: string;
  stop: string;
  send: string;
  /** Le bouton d'envoi MORPHE : envoyer → redaction → redacted. Trois états, trois mots. */
  redacting: string;
  redactingAria: string;
  redacted: string;

  /** Les pastilles de DÉTECTION sous la saisie — chacune bascule « redacted ⇄ en clair ». */
  detect: {
    /** L'analyse approfondie a ABANDONNÉ : le dire, et dire que l'envoi la refait. */
    partialNone: string;
    partialNoneHint: string;
    partialCount: (count: number) => string;
    partialCountHint: string;
    reMask: string;
    uncertain: string;
    keepInClear: string;
    /** Le mot porté par une détection incertaine, à même la pastille. */
    toVerify: string;
    showAll: string;
    more: (count: number) => string;
    collapseTip: string;
    collapse: string;
  };

  /** Le brouillon LONG, replié en carte : on l'édite dans une modale. */
  longText: {
    openTip: string;
    /** Les nombres passent par `Intl` DANS le catalogue — chaque langue connaît la sienne. */
    summary: (chars: number, lines: number) => string;
    edit: string;
  };

  /** La modale d'édition du texte long. */
  modal: {
    title: string;
    sub: string;
    tabEdit: string;
    tabPreview: string;
    toMask: (count: number) => string;
    /** Au-delà d'un seuil le surlignage en direct se suspend — la protection, elle, non. */
    mirrorOff: (maxChars: number) => string;
    done: string;
  };

  /** Les PIÈCES JOINTES en attente d'envoi. */
  attachments: {
    open: string;
    processing: string;
    redacting: string;
    /** « 🛡 3 valeurs » — l'unité compte sur une pastille aussi petite. */
    values: (count: number) => string;
    readAllPages: (total: number) => string;
    readAllPagesTip: (read: number) => string;
    retryRedaction: string;
    reRedact: string;
    reRedactTip: string;
    remove: string;
  };

  /** Le DÉPÔT de fichiers sur la fenêtre. */
  drop: {
    title: string;
    sub: string;
    close: string;
    folderDialog: string;
  };
}
