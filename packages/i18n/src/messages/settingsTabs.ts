/**
 * The CONTENT of the Settings tabs — Account, Privacy, Browser, Models.
 * The tabs themselves (label, title, ⌘K) live in `settings.ts`; here is what one reads
 * once the tab is open.
 *
 * ⚠️ Rule 8 on almost every sentence of the Privacy tab: « jamais transmis », « n'a jamais
 * quitté votre machine », « le modèle reçoit… » are promises about the path the data
 * takes. They are translated word for word.
 *
 * A SLICE of the contract (`../messages.ts`), which remains the only list of namespaces.
 */
export interface AccountTabMessages {
  eyebrow: string;
  signedInFallback: string;
  signedInHint: (brand: string) => string;
  signOut: string;
  createOrgTip: string;
  createOrg: string;
  createOrgHint: string;
  dataEyebrow: string;
  importTitle: string;
  beta: string;
  importHint: string;
  importCta: string;
  billingEyebrow: string;
  subscriptionToggle: (brand: string) => string;
  subscriptionToggleHint: string;
  notifEyebrow: string;
  notifTitle: string;
  notifHint: string;
  statsEyebrow: string;
  statsTitle: string;
  statsHint: string;
  /** « Vie privée » — link previews are a privacy decision (one outgoing request per
   *  link), not a developer toggle. */
  privacyEyebrow: string;
  linkPreviews: string;
  linkPreviewsHint: string;
  /** The settings rail: back, and the « Avancé » fold. */
  backToChats: string;
  advanced: string;
}

export interface PrivacyTabMessages {
  protectedEyebrow: string;
  perCategory: string;
  activeCount: (active: number, total: number) => string;
  managedByOrg: (count: number) => string;
  /** The « Options avancées » fold: the three display/wire toggles live behind it. */
  advancedTitle: string;
  advancedSub: string;
  debugLogTitle: string;
  /** ONE sentence — the long version belongs to the Guide, not to a switch. */
  debugLogHint: string;
  tokenDisplayTitle: string;
  tokenDisplayHint: string;
  wireTokensTitle: string;
  wireTokensHint: string;
  /** The Mémoire's silent extraction — a setting, so it lives here, not on the page. */
  memoryEyebrow: string;
  memoryAutoTitle: string;
  memoryAutoHint: (brand: string) => string;
  /** The Journal's diagnostic export of the memory (cards + semantic links). */
  memoryExportTitle: string;
  memoryExportHint: string;
  /** The « ce qui a été protégé » report. */
  reportEyebrow: string;
  reportEmpty: (brand: string) => string;
  reportMessagesSub: (conversations: number) => string;
  reportAllSub: string;
  reportDetail: string;
  reportByType: string;
  reportByTypeTip: string;
  reportMessagesTitle: string;
  reportAllTitle: string;
  protectedValues: (count: number) => string;
  /** Le journal d'audit : redaction ⇄ réseau. */
  auditAria: string;
  auditRedaction: string;
  auditNetwork: string;
  auditCount: (count: number) => string;
  auditSub: string;
  auditExportTip: string;
  auditExport: string;
  auditEmpty: string;
  auditSearch: string;
  auditAll: (total: number) => string;
  auditOpenConv: (title: string) => string;
  auditValues: (count: number) => string;
  auditColType: string;
  auditColReal: string;
  auditColFake: string;
  auditRevealAria: string;
  auditRevealTip: string;
  auditGoToMessage: string;
  auditLoading: (shown: number, total: number) => string;
  auditEntries: (count: number) => string;
  /** The modal that reveals a real value. */
  revealTitle: string;
  revealClose: string;
  revealCopy: string;
  revealCopied: string;
  revealReplacedBy: string;
  revealConversation: string;
  revealWhen: string;
  revealNote: string;
  /** L'histogramme redactions / jour. */
  timelineTitle: (days: number) => string;
  timelineMeta: string;
  timelineEmpty: string;
  timelineAria: string;
  timelineBarTip: (count: number) => string;
  /** The log of network EGRESS. */
  egressTitle: string;
  egressSub: string;
  egressLoading: string;
  egressEmpty: string;
  egressOrigins: (count: number) => string;
  egressContacts: (count: number) => string;
  egressRefused: (count: number) => string;
  /** The word alone, the number being rendered separately in its chip. */
  egressRefusedWord: (count: number) => string;
  egressRefusedFallback: string;
  egressSearch: string;
  egressInsecure: string;
  egressNoMatch: string;
  /** A SHORT relative instant, for a table column. */
  relJustNow: string;
  relMinutes: (m: number) => string;
  relHours: (h: number) => string;
  relYesterday: string;
  relDays: (d: number) => string;
}

export interface BrowserTabMessages {
  engineEyebrow: string;
  engineHint: string;
}

export interface ModelsTabMessages {
  /** « D'où viennent vos modèles »: the two access ROUTES, at the top of the tab —
   *  a key bought by the token, or an already-installed agent one already pays for. */
  sourcesEyebrow: string;
  keysGroupTitle: string;
  keysGroupSub: string;
  agentsGroupTitle: string;
  agentsGroupSub: string;
  recommended: string;
  /** Les infobulles d'une pastille d'agent : à brancher, branché, introuvable. */
  agentTip: (agent: string) => string;
  agentOn: (agent: string) => string;
  agentMissing: (agent: string) => string;
  availableEyebrow: (count: number) => string;
  noMatch: (query: string) => string;
  /** The « Avancé » fold at the foot of the tab: the local model and its extra ids. */
  advancedTitle: string;
  advancedSub: string;
  /** The provider grid. */
  orgProvidesModels: (org: string) => string;
  yourOrg: string;
  orgKeysBlocked: string;
  editKey: (provider: string) => string;
  addKeyFor: (provider: string) => string;
  keySaved: string;
  included: string;
  addKey: string;
  noKeySubscription: (brand: string) => string;
  /** The default model's summary, and the cards. */
  defaultLead: string;
  defaultTip: string;
  freeBadge: string;
  freeBadgeTip: string;
  addFavorite: string;
  removeFavorite: string;
  /** The filter bar. */
  searchPlaceholder: string;
  searchAria: string;
  clearSearch: string;
  all: string;
  priceAria: string;
  price: string;
  priceTiers: { free: string; eco: string; standard: string; premium: string };
  priceTierTips: { free: string; eco: string; standard: string; premium: string };
  /** A provider group's status (chip + tooltip). */
  status: {
    keySaved: string;
    keySavedTip: (provider: string) => string;
    keyRequired: string;
    keyRequiredTip: (provider: string) => string;
    keyOrSubscription: string;
    creditsExhaustedTip: (brand: string, provider: string) => string;
    viaSubscriptionTip: (brand: string, provider: string) => string;
    unavailableTip: (brand: string, provider: string) => string;
    keyOrAccount: string;
    viaAccountTip: (brand: string, provider: string) => string;
    noKey: string;
    noKeyTip: (provider: string) => string;
  };
  /** The local model, and the two subscription CLIs. */
  localEyebrow: string;
  localHint: string;
  localAddress: string;
  claude: { title: string; note: string; row: string; on: string; missing: string };
  codex: { title: string; note: string; row: string; on: string; missing: string };
  /** La fiche d'un modèle. */
  detail: {
    barAria: (label: string, value: number) => string;
    openSource: string;
    hosted: string;
    context: (size: string) => string;
    vision: string;
    priceEyebrow: string;
    free: string;
    priceIn: string;
    priceOut: string;
    priceUnit: string;
    profileEyebrow: string;
    reasoning: string;
    coding: string;
    speed: string;
    cost: string;
    images: string;
    strengths: string;
    tradeoffs: string;
    bestFor: string;
    benchmarks: string;
  };
}
