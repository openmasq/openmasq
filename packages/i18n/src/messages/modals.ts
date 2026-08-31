/**
 * Les MODALES — les panneaux qui prennent l'écran, et le vocabulaire qu'ils présentent.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 * Le découpage tient le cap 300 LOC (règle 1) — même forme que `packages/emails/i18n/`.
 */
export interface ModalsMessages {
  /** Le comparatif côte à côte : votre texte / ce qui est réellement parti. */
  transparency: {
    title: string;
    sub: (count: number, modelName: string) => string;
    /** Le nom du modèle quand on l'a ; sinon ce mot. */
    theModel: string;
    close: string;
    empty: string;
    /** Les en-têtes SUIVENT le rôle : sur une réponse, « ce que vous avez écrit » serait faux. */
    youWrote: string;
    youRead: string;
    modelReceived: string;
    modelWrote: string;
    yourMessage: string;
    reply: string;
    swapped: (count: number) => string;
  };

  /** Le message BRUT d'un fournisseur ou d'un outil — jamais ajouté à la conversation. */
  error: {
    eyebrow: string;
    title: string;
    sub: string;
    copy: string;
    copied: string;
    retry: string;
  };

  /** La mise à jour téléchargée, avec sa note de version si elle est publiée. */
  updateReady: {
    eyebrow: string;
    version: (version: string) => string;
    noNote: string;
    later: string;
    restartNow: string;
  };

  /** Un connecteur qui accepte les deux : votre compte, ou l'accès anonyme. */
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
   * « Votre avis ». L'HUMEUR cesse d'être obligatoire dès que le journal accompagne
   * l'envoi — l'étiquette doit donc le DIRE, sinon la friction retirée du code se
   * réinstalle dans la tête de qui écrit.
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
    /** Où le redaction a fauté — la phrase entre dans le brouillon que la personne relit. */
    inDocument: string;
    inReply: string;
    inMessage: string;
    problemKind: (kind: string) => string;
    problemBody: (where: string, kind: string) => string;
    /** Les deux autres brouillons pré-remplis — la personne les relit et les complète. */
    journalDraft: string;
    replyDraft: string;
    attachJournalSub: string;
    confidential: string;
    /** Les humeurs et les types de retour : le glyphe et l'id restent au code. */
    moods: { love: string; ok: string; meh: string };
    categories: { idea: string; bug: string; love: string; other: string };
  };

  /** La clé d'un fournisseur — collée, ou obtenue en un clic. */
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
    /** Le repli quand la clé du fournisseur n'a pas de préfixe reconnaissable. */
    keyPlaceholderFallback: (provider: string) => string;
  };

  /** Le journal de débogage — le RÉEL de cette conversation. */
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
    /** Les étiquettes d'une entrée et le texte copié. */
  };

  /** L'aide, et ses notes de version. */
  guide: { helpCenter: string; themes: string; noReleases: string };

  /** L'import des compétences de Claude Code. */
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

  /** Les en-têtes de groupe de ⌘K, et l'état d'une conversation qui génère. */
  searchRows: { goTo: string; files: string; settings: string; generating: string };

  /** Les règles de redaction : le cadre autour des puces. */
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
