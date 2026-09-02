/**
 * The CONNECTORS tab — the grid, a connector's card and its bodies (key, direct
 * account, local, browser, custom), the write confirmation, the browser's
 * security, the tool list.
 *
 * ⚠️ Rule 8: « démasqué au dernier moment », « jamais envoyés au modèle », « vos
 * identifiants restent chiffrés sur votre appareil » are promises about where the data
 * travels. They translate word for word.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
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
  /** The card. */
  tools: (count: number) => string;
  accounts: (count: number) => string;
  blockedByOrg: string;
  org: string;
  connected: string;
  manage: string;
  connect: string;
  /** The detail sheet. */
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
  /** « API key » / remote body. */
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
  /** Built-in browser. */
  browserBody: string;
  activating: string;
  activate: string;
  /** Rappel. */
  reconnectKeepsConfig: string;
  maskedAsEverywhere: string;
  /** Custom connector. */
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
  /** « n connectés · m disponibles » under the tab's eyebrow. */
  count: (connected: number, total: number) => string;
  /** « Ce que l'agent peut faire » — the ONE section holding the write gate AND the
   *  agent-browser hardening, on the Connecteurs tab (the browser tab keeps only its
   *  search engine). */
  agentPowersEyebrow: string;
  agentPowersHint: string;
  /** Action confirmation. */
  confirmEyebrow: string;
  reinforced: string;
  reinforcedHint: (brand: string) => string;
  imposedByOrg: { strong: string; tail: string };
  autoApprove: string;
  autoApproveHint: string;
  /** Agent browser security. */
  browserSecurityEyebrow: string;
  readOnly: string;
  readOnlyHint: string;
  allowedDomains: string;
  allowedDomainsHint: string;
  allowedDomainsAria: string;
  /** A connector's tool list. */
  loadingTools: string;
  noTools: string;
  toolsAvailable: (count: number) => string;
  collapseAll: string;
  expandAll: string;
  /** A connector's failures, said in the user's language. */
  errors: {
    apikey: string;
    unsupported: string;
    forbidden: string;
    expired: string;
    network: string;
  };
  /** Where to find the key of the three key-based connectors. */
  apiKeys: {
    exa: { label: string; steps: readonly string[] };
    tavily: { label: string; steps: readonly string[] };
    fireflies: { label: string; steps: readonly string[] };
  };
}

export interface VersionsTabMessages {
  switchConfirm: (version: string, env: string) => string;
  /** Going back to an older build — asked in the app's own dialog, never `window.confirm`. */
  revertConfirm: (version: string) => string;
  /** « X se met à jour automatiquement. Vous pouvez vérifier maintenant » — the tail
   *  (`orSwitchEnv` / `orRevert` / a full stop) follows it. */
  autoUpdateLead: (brand: string) => string;
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
  /** The update's state, with its size when known. */
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
  /** The form's verdicts. */
  noSpaces: string;
  isApiKeyNotClientId: string;
  googleSuffix: string;
  microsoftGuid: string;
  secretNoSpaces: string;
  secretIsClientId: string;
  secretPrefixWarn: string;
  /** The three tutorials: Microsoft Entra, GitHub, Google Cloud. */
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
