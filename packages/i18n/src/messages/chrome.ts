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
}
