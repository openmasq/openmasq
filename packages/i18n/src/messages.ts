/**
 * LE CONTRAT de traduction — l'interface que CHAQUE langue implémente.
 *
 * C'est le cœur du choix « catalogue typé, aucune bibliothèque » (cf. `CLAUDE.md`) : une
 * clé manquante ou en trop dans `fr.ts`/`en.ts` est une erreur `tsc`, pas un repli
 * silencieux à l'exécution. Aucun parseur ICU, aucun chargeur runtime dans un produit
 * dont la posture est « rien de non vérifié ne s'exécute » — l'interpolation et les
 * pluriels sont des FONCTIONS TypeScript typées, et les nombres/dates/monnaies passent
 * par `Intl` (présent dans Electron et tout navigateur).
 *
 * ## Comment ajouter une clé
 *
 * 1. l'ajouter ICI (dans le bon namespace) ;
 * 2. `tsc` casse sur `fr.ts` ET `en.ts` tant que les deux ne l'ont pas — c'est voulu ;
 * 3. une entrée à variable est une fonction `(x) => string`, jamais un gabarit à trous.
 *
 * ## Comment ajouter une LANGUE
 *
 * Un nouveau fichier `xx.ts` qui `satisfies Messages`, ajouté à `MESSAGES` dans
 * `locale.ts` et à l'union `Locale`. Le compilateur exige alors chaque clé : la porte est
 * ouverte, et elle refuse une langue incomplète.
 *
 * Les namespaces suivent les SURFACES, pas les fichiers — un même mot rendu à deux
 * endroits a une seule entrée (règle 9 appliquée à la copie).
 */
/** L'étiquette du rail, le titre du panneau, la phrase d'une ligne ⌘K, et les mots qu'on
 *  tape pour tomber dessus — un onglet de réglages se nomme ici, une seule fois. */
export interface SettingsTab {
  label: string;
  title: string;
  /** Une FONCTION, comme toute entrée à variable (cf. l'en-tête) : un seul onglet nomme
   *  la marque aujourd'hui, mais un `sub` sur deux formes ferait deux façons de le lire
   *  au moment de l'assemblage. */
  sub: (brand: string) => string;
  kw: string;
}

/** Un réglage individuel atteignable au ⌘K : ce qu'il s'appelle, et ce qu'on tape. */
export interface SettingsEntry {
  label: string;
  kw: string;
}

export interface Messages {
  /** Verbes et mots d'action réutilisés partout — la première chose à ne pas dupliquer. */
  common: {
    cancel: string;
    save: string;
    close: string;
    retry: string;
    delete: string;
    confirm: string;
    loading: string;
    /** Un compte-rendu générique d'erreur, quand rien de plus précis n'est connu. */
    genericError: string;
  };

  /** La navigation principale — le Rail de bureau ET la barre mobile (`BottomNav`) lisent
   *  ces mêmes libellés (règle 9 : une navigation, une source). */
  nav: {
    /** Étiquette du lecteur d'écran sur l'élément `<nav>`. */
    ariaLabel: string;
    chats: string;
    /** Volontairement court (barre mobile) — « Compét. », « Skills ». */
    competences: string;
    memory: string;
    vault: string;
    library: string;
    settings: string;
  };

  /** Facturation / crédits. Les MONTANTS ne sont PAS ici : `Intl.NumberFormat` les rend
   *  selon la locale (`billing.ts` `formatCents`). Ici seulement la prose. */
  billing: {
    /** Échec d'ouverture de la page de paiement Stripe. */
    checkoutOpenFailed: string;
  };

  /** La PILE AUTO-HÉBERGÉE (Réglages → Versions) — présente seulement dans un build qui
   *  l'honore. La carte, ses quatre champs, ses refus (nommés par le processus privilégié,
   *  jamais inventés ici). */

  /**
   * La CHROME de gauche — le rail replié ET la barre latérale déployée. Les deux montrent
   * les mêmes commandes à deux tailles, donc les mêmes mots : un rail qui dirait
   * « Nouveau » quand la barre dit « Nouvelle conversation » serait deux produits.
   *
   * Beaucoup de ces entrées sortent DEUX fois sur le même bouton — en infobulle et en
   * `aria-label`. C'est voulu : l'infobulle est visuelle, l'étiquette est lue. Une seule
   * clé pour les deux, sinon elles divergent.
   */
  chrome: {
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
  };

  /**
   * Le VOCABULAIRE des sections de contenu — étiquette, infobulle du rail, sous-titre de
   * page, paragraphe du guide, et les mots qu'on TAPE pour les trouver au ⌘K. Cinq
   * chaînes qui décrivent la même chose à la même personne : elles vivent ensemble
   * (règle 9), et `ui/src/help/sections.ts` les assemble.
   *
   * ⚠️ `tip` suit la forme « Étiquette — ce à quoi ça sert » DANS CHAQUE LANGUE. Le
   * premier lancement en dérive sa phrase courte en coupant au tiret CADRATIN
   * (`sectionOneLiner`), et `sections.test.ts` l'épingle : un tiret simple, ou un `tip`
   * qui ne commence pas par son étiquette, casse le test — pas l'affichage, ce qui serait
   * pire.
   *
   * ⚠️ `keywords` n'est pas de la prose : c'est une liste de mots séparés par des espaces,
   * repliée sans accents avant comparaison. On y met les vraies alternatives (le mot de
   * l'autre langue, la chose que ça contient), jamais un thésaurus.
   */
  sections: {
    chats: { label: string; tip: string; guide: (brand: string) => string; keywords: string };
    library: { label: string; tip: string; subtitle: string; guide: string; keywords: string };
    competences: { label: string; tip: string; subtitle: string; guide: string; keywords: string };
    memory: {
      label: string;
      tip: (brand: string) => string;
      subtitle: (brand: string) => string;
      guide: string;
      keywords: string;
    };
    vault: { label: string; tip: string; subtitle: string; guide: (brand: string) => string; keywords: string };
    /** La pseudo-destination « Aide » du ⌘K — pas une section, mais elle se cherche dans
     *  la même liste et doit donc se traduire avec elle. */
    helpEntry: { title: (brand: string) => string; sub: (brand: string) => string; keywords: string };
  };

  /**
   * L'écran de CONVERSATION — sa barre d'onglets, son menu « ⋯ », les actions d'une ligne
   * de la liste. Tout ce qui borde le fil sans en faire partie.
   *
   * La SUPPRESSION n'est pas ici : elle vit dans `chrome`, parce que le même acte se
   * demande depuis deux endroits (la ligne de la barre latérale, le menu de l'en-tête) et
   * que les deux dialogues avaient déjà divergé — l'un promettait « définitivement »,
   * l'autre « de cet appareil ».
   */
  chat: {
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
  };

  /** Les RÉGLAGES. « Apparence » y entre la première parce que c'est la section qui
   *  porte le sélecteur de langue : la laisser en français en dur aurait rendu la seule
   *  section qu'un anglophone doit atteindre illisible pour lui. */
  settings: {
    appearance: {
      /** L'intitulé de la section. */
      title: string;
      /** Le commutateur de fond sombre : son titre, puis ce qu'il fait. */
      darkModeLabel: string;
      darkModeHint: string;
    };

    /**
     * UN ONGLET des réglages, nommé une seule fois pour ses TROIS surfaces : le rail des
     * réglages (`label`, court), l'en-tête du panneau (`title`, souvent plus long — « MCP »
     * devient « Serveurs MCP »), et la ligne du ⌘K (`title` + `sub`).
     *
     * `kw` = ce qu'on TAPE et qui n'est ni dans l'étiquette ni dans la phrase (« facture »,
     * « changelog », « sso »). Des mots séparés par des espaces, en minuscules, et SANS
     * accents là où l'utilisateur tapera sans — la recherche replie les accents des deux
     * côtés, mais un mot déjà replié coûte moins cher à relire.
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
     * Les réglages INDIVIDUELS que la palette sait atteindre — on cherche « mode sombre »,
     * pas l'onglet qui le contient. Liste tenue à la main EXPRÈS : une ligne par catégorie
     * de redaction enterrerait les quatre choses qu'on cherche vraiment.
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
     * Les EN-TÊTES de groupe de l'écran Réglages du téléphone. Dix lignes à plat font un
     * mur sur un mobile ; le rail de bureau s'en passe (l'étiquette est à côté de son
     * icône). `other` est le filet : un onglet qu'aucun groupe ne réclame y atterrit
     * plutôt que de disparaître.
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

    /** La provenance d'une ligne de réglage dans la palette : « Dans « Compte » ». */
    inTab: (tabTitle: string) => string;
  };

  /** La langue elle-même — le sélecteur des Réglages (onglet « Compte », section
   *  Apparence) et ses options. C'est la SEULE surface qui doit rester lisible pour
   *  quelqu'un qui ne comprend PAS la langue affichée : d'où les endonymes ci-dessous, et
   *  une aide qui dit jusqu'où le choix porte. */
  language: {
    /** Titre du réglage de langue. */
    label: string;
    /** Sous-titre : ce que le choix change — et ce qu'il ne change pas. */
    hint: string;
    /** Nom de CHAQUE langue, rendu dans SA propre langue (« Français », « English ») —
     *  un endonyme, jamais traduit, donc identique dans tous les catalogues. */
    names: { fr: string; en: string };
  };
}
