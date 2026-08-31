/**
 * Le CONTENU des onglets de Réglages — Compte, Confidentialité, Navigateur, Modèles.
 * Les onglets eux-mêmes (étiquette, titre, ⌘K) sont dans `settings.ts` ; ici, ce qu'on
 * lit une fois l'onglet ouvert.
 *
 * ⚠️ Règle 8 sur presque chaque phrase de l'onglet Confidentialité : « jamais transmis »,
 * « n'a jamais quitté votre machine », « le modèle reçoit… » sont des promesses sur le
 * trajet des données. Elles se traduisent au mot près.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 */
export interface AccountTabMessages {
  eyebrow: string;
  signedInFallback: string;
  signedInHint: (brand: string) => string;
  signOut: string;
  viewOrg: string;
  yourOrg: string;
  roleOwner: string;
  roleAdmin: string;
  roleMember: string;
  members: (count: number) => string;
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
  devEyebrow: string;
  linkPreviews: string;
  linkPreviewsHint: string;
  /** Le rail des réglages : retour, et le pli « Avancé ». */
  backToChats: string;
  advanced: string;
}

export interface PrivacyTabMessages {
  protectedEyebrow: string;
  perCategory: string;
  activeCount: (active: number, total: number) => string;
  managedByOrg: (count: number) => string;
  transparencyEyebrow: string;
  debugLogTitle: string;
  debugLogHint: string;
  displayEyebrow: string;
  tokenDisplayTitle: string;
  tokenDisplayHint: string;
  wireEyebrow: string;
  wireTokensTitle: string;
  wireTokensHint: string;
  /** Le rapport « ce qui a été protégé ». */
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
  /** La modale de révélation d'une valeur réelle. */
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
  /** Le journal des SORTIES réseau. */
  egressTitle: string;
  egressSub: string;
  egressLoading: string;
  egressEmpty: string;
  egressOrigins: (count: number) => string;
  egressContacts: (count: number) => string;
  egressRefused: (count: number) => string;
  /** Le mot seul, le nombre étant rendu à part dans sa pastille. */
  egressRefusedWord: (count: number) => string;
  egressRefusedFallback: string;
  egressSearch: string;
  egressInsecure: string;
  egressNoMatch: string;
  /** Un instant relatif COURT, pour une colonne de tableau. */
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
  accessEyebrow: string;
  availableEyebrow: (count: number) => string;
  noMatch: (query: string) => string;
  keyGearTip: (hasKey: boolean, provider: string) => string;
  gearNote: string;
  /** La grille des fournisseurs. */
  orgProvidesModels: (org: string) => string;
  yourOrg: string;
  orgKeysBlocked: string;
  editKey: (provider: string) => string;
  addKeyFor: (provider: string) => string;
  keySaved: string;
  included: string;
  addKey: string;
  noKeySubscription: (brand: string) => string;
  /** Le résumé du modèle par défaut, et les cartes. */
  defaultLead: string;
  defaultTip: string;
  freeBadge: string;
  freeBadgeTip: string;
  addFavorite: string;
  removeFavorite: string;
  /** La barre de filtres. */
  searchPlaceholder: string;
  searchAria: string;
  clearSearch: string;
  all: string;
  priceAria: string;
  price: string;
  priceTiers: { free: string; eco: string; standard: string; premium: string };
  priceTierTips: { free: string; eco: string; standard: string; premium: string };
  /** Le statut d'un groupe de fournisseur (pastille + infobulle). */
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
  /** Le modèle local, et les deux CLI d'abonnement. */
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
