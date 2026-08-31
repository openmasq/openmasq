/**
 * Le CONTENU des onglets Paiement, Usage, Vos appareils, Organisation — et la modale
 * d'import. Le lexique de l'argent (paliers, CTA, crédits épuisés, erreurs Stripe) est dans
 * `common.ts` (`billing`) : plusieurs surfaces le rendent.
 *
 * ⚠️ Le mot du produit est « abonnement » — jamais forfait, formule ni offre
 * (`ui/src/help/money.test.ts` le vérifie sur la source). La traduction anglaise dit
 * « subscription », et ne réintroduit pas « plan » comme nom du produit.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 */
export interface BillingTabMessages {
  close: string;
  yourSubscription: string;
  testerNote: string;
  billingClosed: string;
  unreadable: string;
  finalizing: string;
  cancelAtEnd: string;
  billingEyebrow: string;
  stripeManaged: string;
  stripeHint: string;
  opening: string;
  openPortal: string;
  stripeSecure: string;
  unavailableHere: string;
  /** La carte d'un palier. */
  recommended: string;
  perMonth: string;
  noCredits: string;
  creditsIncluded: (amount: string) => string;
  currentPlan: string;
  backToFree: string;
  oneMoment: string;
  subscribe: string;
  choosePlan: string;
  downgrade: string;
  upgradeTitle: (name: string) => string;
  downgradeTitle: (name: string) => string;
  upgradeBody: (name: string, price: string) => string;
  downgradeBody: (name: string, price: string) => string;
  confirmChange: string;
  /** Membre d'organisation : facturé par siège. */
  orgManaged: string;
  orgCovered: (orgName: string) => string;
  manageInAdmin: string;
  manageInAdminHint: (brand: string) => string;
  creditsEyebrow: string;
  remainingOf: (remaining: string, total: string) => string;
  usedRemaining: (used: string, remaining: string, total: string) => string;
}

export interface UsageTabMessages {
  filterAria: string;
  filterAll: string;
  filterByo: string;
  filterSubscription: string;
  rangeAria: string;
  /** « 14 j » — le bouton d'une fenêtre. */
  days: (n: number) => string;
  kpiMessages: string;
  kpiTokens: string;
  kpiTokensSub: string;
  kpiCredits: string;
  kpiCreditsOf: (total: string) => string;
  kpiNoSubscription: string;
  subByo: string;
  subSubscription: string;
  subAll: string;
  unattributed: (count: number) => string;
  estimated: (count: number) => string;
  activityTitle: (days: number) => string;
  activityMeta: (max: number) => string;
  activityAria: (days: number) => string;
  dayLabel: (daysAgo: number, count: number) => string;
  perModelTitle: string;
  perModelEmpty: string;
  msgs: (count: string) => string;
  unknownPrice: string;
  tokensNote: string;
  creditsEyebrow: string;
  creditsNote: string;
  orgLabel: string;
  mySubscription: string;
  myAccount: string;
  /** L'histogramme messages / jour par modèle. */
  timelineTitle: (days: number) => string;
  timelineMeta: (max: number) => string;
  timelineEmpty: string;
  timelineAria: string;
  other: string;
}

export interface SyncTabMessages {
  paidEyebrow: string;
  paidTitle: string;
  paidBody: string;
  paidPoint1: string;
  paidPoint2: string;
  paidPoint3: string;
  eyebrow: string;
  devicesEyebrow: string;
  deviceCount: (count: number) => string;
  noDevices: string;
  ok: string;
  cancel: string;
  device: string;
  current: string;
  seen: string;
  rename: string;
  revoke: string;
  platforms: { desktop: string; extension: string; mobile: string; web: string };
  /** La phrase secrète. */
  passTitle: string;
  passDesc: string;
  passActive: string;
  passUnset: string;
  passNote: { lead: string; before: string; mid: string; same: string; tail: string };
  passSaveFailed: string;
  passDisableFailed: string;
  passMismatch: string;
  passPlaceholder: string;
  generate: string;
  save: string;
  change: string;
  disable: string;
  passOffline: string;
  /** L'état. */
  envEyebrow: string;
  envProduction: string;
  envStaging: string;
  statusEyebrow: string;
  justNow: string;
  minutesAgo: (min: number) => string;
  hoursAgo: (hours: number) => string;
  daysAgo: (days: number) => string;
  yesterday: string;
  failure: string;
  failureMismatch: string;
  failureRetry: string;
  failedAt: (when: string, reason: string, tail: string) => string;
  lastOk: (when: string) => string;
  noExchange: string;
}

export interface OrgTabMessages {
  eyebrow: string;
  yourOrg: string;
  roleOwner: string;
  roleAdmin: string;
  roleMember: string;
  planFree: string;
  planPro: string;
  plan: (name: string) => string;
  members: string;
  yourRole: string;
  rules: (count: number) => string;
  accessEyebrow: string;
  forcedTitle: string;
  forcedList: (list: string) => string;
  forcedNone: string;
  active: string;
  adminConsole: string;
  adminConsoleHint: string;
  minimalNote: (orgName: string) => string;
}

export interface ImportModalMessages {
  title: string;
  beta: string;
  sub: string;
  hintChatgpt: string;
  hintClaude: string;
  geminiSoonTip: string;
  geminiSoon: string;
  choose: (provider: string) => string;
  maskedNote: string;
  redacting: (done: number, total: number) => string;
  reading: string;
  imported: (added: number) => string;
  skipped: (count: number) => string;
  doneNote: string;
  close: string;
  failed: string;
}
