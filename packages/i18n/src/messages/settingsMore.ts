/**
 * The CONTENT of the Paiement, Usage, Vos appareils and Organisation tabs — and the
 * import modal. The money lexicon (tiers, CTAs, credits exhausted, Stripe errors) is in
 * `common.ts` (`billing`): several surfaces render it.
 *
 * ⚠️ The product's word is « abonnement » — never forfait, formule or offre
 * (`ui/src/help/money.test.ts` checks it against the source). The English translation says
 * « subscription », and does not reintroduce « plan » as the product's name.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
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
  /** A tier's card. */
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
  /** Organization member: billed per seat. */
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
  /** The same option when nothing is sold (the default): the route is named by the included models. */
  filterIncluded: string;
  rangeAria: string;
  /** « 14 j » — a window's button. */
  days: (n: number) => string;
  kpiMessages: string;
  kpiTokens: string;
  kpiTokensSub: string;
  kpiCredits: string;
  kpiCreditsOf: (total: string) => string;
  kpiNoSubscription: string;
  subByo: string;
  subSubscription: string;
  subIncluded: string;
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
  /** The messages-per-day-per-model histogram. */
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
  /** The passphrase. */
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
  /** The state. */
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
  /** ONE line of note, not a greyed tile: Gemini has no importable export yet. */
  geminiNote: string;
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
