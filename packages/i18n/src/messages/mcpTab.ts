/**
 * L'onglet CONNECTEURS — la grille, la fiche d'un connecteur et ses corps (clé, compte
 * direct, local, navigateur, personnalisé), la confirmation d'écriture, la sécurité du
 * navigateur, la liste des outils.
 *
 * ⚠️ Règle 8 : « unredacted au dernier moment », « jamais envoyés au modèle », « vos
 * identifiants restent chiffrés sur votre appareil » sont des promesses sur le trajet
 * des données. Elles se traduisent au mot près.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 */
export interface McpTabMessages {
  eyebrow: string;
  unavailable: string;
  search: string;
  addTip: string;
  add: string;
  otherDevices: string;
  allIntegrations: string;
  allIntegrationsTip: string;
  connectedDot: (name: string) => string;
  connectHere: string;
  localServers: string;
  addedByYou: string;
  noMatch: (query: string) => string;
  /** La carte. */
  tools: (count: number) => string;
  accounts: (count: number) => string;
  blockedByOrg: string;
  org: string;
  connected: string;
  manage: string;
  connect: string;
  /** La fiche. */
  cancelConnect: string;
  linkCopied: string;
  copyLink: string;
  copyLinkTip: string;
  blockedNote: string;
  blockedStillConnected: string;
  seeTools: string;
  disconnect: string;
  close: string;
  closeTip: string;
  /** Comptes multiples. */
  reconnectHint: string;
  sharedAuthLead: string;
  and: string;
  addAccount: string;
  addAccountByo: string;
  newKeyPlaceholder: string;
  connecting: string;
  mainAccount: string;
  toolsLabel: string;
  reconnect: string;
  /** Corps « direct ». */
  credsSaved: string;
  adminConsent: (brand: string) => string;
  myKeys: string;
  connectLimited: string;
  connectLimitedTip: (brand: string, adds: string) => string;
  /** Corps « clé API » / distant. */
  whereKey: string;
  getKey: string;
  urlPlaceholder: string;
  forget: string;
  forgetTip: string;
  /** Local (stdio). */
  runsInternally: (brand: string) => string;
  removeDir: (dir: string) => string;
  remove: string;
  atLeastOneDir: string;
  updating: string;
  addDir: string;
  chooseDir: (label: string) => string;
  guide: string;
  /** Navigateur intégré. */
  browserBody: string;
  activating: string;
  activate: string;
  /** Rappel. */
  reconnectKeepsConfig: string;
  maskedAsEverywhere: string;
  /** Connecteur personnalisé. */
  customTitle: string;
  customSub: string;
  customName: string;
  customNamePlaceholder: string;
  customUrl: string;
  customKey: string;
  optional: string;
  customKeyPlaceholder: string;
  customUnderstood: string;
  cancel: string;
  adding: string;
  addAndConnect: string;
  customWarnTitle: (brand: string) => string;
  customWarnReal: { lead: string; strong: string; tail: string };
  customWarnReplies: string;
  customWarnFoot: string;
  /** Confirmation des actions. */
  confirmEyebrow: string;
  reinforced: string;
  reinforcedHint: (brand: string) => string;
  imposedByOrg: { strong: string; tail: string };
  autoApprove: string;
  autoApproveHint: string;
  /** Sécurité du navigateur agent. */
  browserSecurityEyebrow: string;
  readOnly: string;
  readOnlyHint: string;
  allowedDomains: string;
  allowedDomainsHint: string;
  allowedDomainsAria: string;
  /** La liste des outils d'un connecteur. */
  loadingTools: string;
  noTools: string;
  toolsAvailable: (count: number) => string;
  collapseAll: string;
  expandAll: string;
  /** Les échecs d'un connecteur, dits dans la langue de l'utilisateur. */
  errors: {
    apikey: string;
    unsupported: string;
    forbidden: string;
    expired: string;
    network: string;
  };
  /** Où trouver la clé des trois connecteurs à clé. */
  apiKeys: {
    exa: { label: string; steps: readonly string[] };
    tavily: { label: string; steps: readonly string[] };
    fireflies: { label: string; steps: readonly string[] };
  };
}

export interface VersionsTabMessages {
  switchConfirm: (version: string, env: string) => string;
  current: string;
  noRelease: string;
  switchTo: string;
  switchToVersion: (version: string) => string;
  revert: string;
  revertTo: (version: string) => string;
  install: string;
  installVersion: (version: string) => string;
  updatesEyebrow: string;
  upToDate: (brand: string) => string;
  installedEyebrow: string;
  orSwitchEnv: string;
  orRevert: string;
  historyEyebrow: string;
  locked: string;
  revealLogTip: string;
  revealLog: string;
  stagingWarning: string;
  stateCurrent: string;
  stateAvailable: string;
  statePast: string;
  toggleNotes: (expanded: boolean, version: string) => string;
  channel: string;
  upToDateSuffix: string;
  copyIdTip: string;
  idCopied: string;
  installRestart: string;
  checkUpdates: string;
  publishedEyebrow: string;
  noPublished: string;
  envEyebrow: string;
  envStagingDesc: string;
  envProductionDesc: string;
  envSwitchConfirm: (env: string) => string;
  envSwitchTo: (env: string) => string;
  envProduction: string;
  envStaging: string;
  envCustom: string;
  /** L'état de la mise à jour, avec sa taille éventuelle. */
  status: {
    checking: string;
    available: (version: string) => string;
    downloading: (percent: number) => string;
    downloaded: (version: string) => string;
    notAvailable: string;
    unknownError: string;
    withSize: (text: string, size: string) => string;
  };
  refusal: { notPrivileged: (brand: string) => string; writeFailed: string; generic: string };
}

export interface ByoMessages {
  eyebrow: string;
  connect: string;
  encryptedNote: string;
  existing: string;
  onceLead: string;
  onceTail: (family: string, others: string) => string;
  stepDone: (n: number) => string;
  stepTodo: (n: number) => string;
  markDone: string;
  clientId: string;
  clientSecret: string;
  keepPlaceholder: string;
  cancel: string;
  connecting: string;
  keepAndConnect: string;
  /** Les verdicts du formulaire. */
  noSpaces: string;
  isApiKeyNotClientId: string;
  googleSuffix: string;
  microsoftGuid: string;
  secretNoSpaces: string;
  secretIsClientId: string;
  secretPrefixWarn: string;
  /** Les trois tutoriels : Microsoft Entra, GitHub, Google Cloud. */
  microsoft: {
    intro: string;
    note: string;
    s1: { lead: string; link: string };
    s2: { a: string; b: string; c: string; d: string };
    s3: { a: string; b: string; c: string; d: string; e: string };
    s4: { a: string; b: string; c: string; d: string };
  };
  github: {
    intro: string;
    s1: { lead: string; link: string; tail: (brand: string) => string };
    s2: { a: string; b: string; c: string };
    s3: { a: string; b: string; c: string; d: string };
  };
  google: {
    intro: string;
    note: string;
    s1: { lead: string; link: string };
    s2: { enableOne: string; enableMany: string; and: string; tailOne: string; tailMany: string };
    s3: { a: string; link: string; b: string; c: string; d: string; e: string };
    s4: { a: string; link: string; b: string; c: string };
    s5: { a: string; b: string; c: string; d: string; e: string };
  };
}
