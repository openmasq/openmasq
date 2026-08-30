/**
 * Les RÉGLAGES — leurs onglets, leurs entrées atteignables au ⌘K, leurs groupes mobiles.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 * Le découpage tient le cap 300 LOC (règle 1) — même forme que `packages/emails/i18n/`.
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

/** Les RÉGLAGES. « Apparence » y entre la première parce que c'est la section qui
 *  porte le sélecteur de langue : la laisser en français en dur aurait rendu la seule
 *  section qu'un anglophone doit atteindre illisible pour lui. */
export interface SettingsMessages {
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
}
