/**
 * The EN catalogue's « settingsMore » slice — translated from the source (`../fr/settingsMore.ts`).
 * `satisfies` per entry.
 */
import type { Messages } from "../messages";

export const billingTab = {
  close: "Close",
  yourSubscription: "YOUR SUBSCRIPTION",
  testerNote: "In this version, plans apply immediately at no charge.",
  billingClosed:
    "Subscriptions are not available in this version yet. The plans above are shown for reference.",
  unreadable: "Your subscription could not be loaded. Check your connection, then reopen this tab.",
  finalizing: "Finalizing your subscription…",
  cancelAtEnd:
    "Your subscription ends with the current billing period. To keep it, reactivate it in the billing portal.",
  billingEyebrow: "BILLING",
  stripeManaged: "Managed by Stripe",
  stripeHint: "Manage your payment method, invoices and receipts in the secure portal.",
  opening: "Opening…",
  openPortal: "Open billing portal",
  stripeSecure: "Payments are processed by Stripe.",
  unavailableHere: "Subscription management is not available on this platform.",
  recommended: "Recommended",
  perMonth: " / month",
  noCredits: "No credits included",
  creditsIncluded: (amount) => `${amount} in credits included`,
  currentPlan: "Current plan",
  backToFree: "Switch to Free",
  oneMoment: "One moment…",
  subscribe: "Subscribe",
  choosePlan: "Choose this plan",
  downgrade: "Downgrade",
  upgradeTitle: (name) => `Switch to ${name}?`,
  downgradeTitle: (name) => `Downgrade to ${name}?`,
  upgradeBody: (name, price) =>
    `You switch to ${name} now (${price} / month). The difference is prorated for the current period.`,
  downgradeBody: (name, price) =>
    `You switch to ${name} (${price} / month). The difference is credited on your next invoice.`,
  confirmChange: "Confirm change",
  orgManaged: "Billing managed by your organization",
  orgCovered: (org) =>
    `Your access is paid for by the organization${org} (per-seat billing). Individual plans do not apply to organization members.`,
  manageInAdmin: "Manage in the admin console",
  manageInAdminHint: (brand) => `Manage the organization's subscription in the ${brand} admin console.`,
  creditsEyebrow: "CREDITS · THIS PERIOD",
  remainingOf: (remaining, total) => `left of ${total}`,
  usedRemaining: (used, remaining, total) => ` used · ${remaining} left of ${total}`,
} satisfies Messages["billingTab"];

export const usageTab = {
  filterAria: "Filter usage",
  filterAll: "All",
  filterByo: "With my API keys",
  filterSubscription: "With my subscription",
  filterIncluded: "With included models",
  rangeAria: "Time range",
  days: (n) => `${n}d`,
  kpiMessages: "Messages",
  kpiTokens: "Tokens",
  kpiTokensSub: "all models",
  kpiCredits: "Credits used",
  kpiCreditsOf: (total) => `of ${total}`,
  kpiNoSubscription: "no subscription",
  subByo: "own API keys",
  subSubscription: "subscription",
  subIncluded: "included models",
  subAll: "total",
  unattributed: (n) =>
    `${n.toLocaleString("en-US")} message${n > 1 ? "s" : ""} sent before usage tracking began (not assigned to keys or a subscription). Shown under “All”.`,
  estimated: (n) =>
    `${n.toLocaleString("en-US")} interrupted repl${n > 1 ? "ies" : "y"}: their tokens are estimated. Providers report the exact count only when a reply completes, but still bill the tokens already generated.`,
  activityTitle: (days) => `Activity · last ${days} days`,
  activityMeta: (max) => `conversations / day${max > 0 ? ` · max ${max}` : ""}`,
  activityAria: (days) => `Activity over the last ${days} days`,
  dayLabel: (ago, n) => `${ago} day${ago > 1 ? "s" : ""} ago · ${n} conversation${n > 1 ? "s" : ""}`,
  perModelTitle: "Usage per model",
  perModelEmpty: "No usage recorded yet.",
  msgs: (n) => `${n} msg`,
  unknownPrice: "Unknown price (local or free model)",
  tokensNote:
    "Tokens across all your conversations. Some local or free models do not report tokens. Cost is an estimate based on public USD prices, before discounts and caching.",
  creditsEyebrow: "CREDITS · THIS PERIOD",
  creditsNote:
    "Prepaid credits used by the models included with your plan (no API key of your own). This is your actual balance.",
  orgLabel: "Organization",
  mySubscription: "My subscription",
  myAccount: "My account",
  timelineTitle: (days) => `Messages · last ${days} days`,
  timelineMeta: (max) => `messages / day, per model${max > 1 ? ` · max ${max}` : ""}`,
  timelineEmpty: "No messages in this period.",
  timelineAria: "Messages per day and per model",
  other: "Other",
} satisfies Messages["usageTab"];

export const syncTab = {
  paidEyebrow: "Paid feature",
  paidTitle: "Sync across your devices",
  paidBody:
    "Your rules, your vault and your history on every device, end-to-end encrypted. Included in the paid subscriptions.",
  paidPoint1: "Multi-device, in real time",
  paidPoint2: "End-to-end encrypted",
  paidPoint3: "Included in paid subscriptions",
  eyebrow: "Sync",
  devicesEyebrow: "Connected devices",
  deviceCount: (n) => `${n} ${n === 1 ? "device" : "devices"}`,
  noDevices:
    "No other devices yet. Enter the same passphrase on another device to see it here.",
  ok: "OK",
  cancel: "Cancel",
  device: "Device",
  current: "● This device",
  seen: "last seen",
  rename: "Rename",
  revoke: "Revoke",
  platforms: { desktop: "Computer", extension: "Browser", mobile: "Mobile", web: "Web" },
  passTitle: "Sync this device",
  passDesc: "Rules, history and categories, end-to-end encrypted",
  passActive: "Active",
  passUnset: "Not set",
  // ⚠️ See the FR twin: what sync uploads is the UNMASKED conversation text and the
  // original documents (`@openmasq/sync` `convSync.ts`), encrypted with this phrase
  // before it leaves and stored as ciphertext. Only the phrase stays on the devices.
  passNote: {
    lead: "Your conversations, including real values and attached documents, are encrypted with this passphrase ",
    before: "before",
    mid: " they reach the server. The server stores them but cannot read them. The passphrase stays on your devices and we cannot recover it. Enter the ",
    same: "same",
    tail: " passphrase on each device to sync them.",
  },
  passSaveFailed: "The passphrase could not be saved. Sign in again, then try again.",
  passDisableFailed: "Sync could not be turned off. Try again.",
  passMismatch:
    "This passphrase does not match the one on your other devices, so their synced data cannot be read here, and vice versa. Use the same passphrase on every device.",
  passPlaceholder: "At least 8 characters…",
  generate: "Generate",
  save: "Save",
  change: "Change",
  disable: "Turn off",
  passOffline:
    "Sync is not available in this version yet. Your passphrase is saved on this device and will be used once sync is available.",
  envEyebrow: "Environment",
  envProduction: "Production",
  envStaging: "Staging",
  statusEyebrow: "Sync",
  justNow: "just now",
  minutesAgo: (m) => `${m} min ago`,
  hoursAgo: (h) => `${h} h ago`,
  daysAgo: (d) => `${d} d ago`,
  yesterday: "yesterday",
  failure: "failure",
  failureMismatch: "Retrying will not help. Check this device's passphrase.",
  failureRetry: "Retrying automatically.",
  failedAt: (when, reason, tail) => `Failed ${when} — ${reason}. ${tail}`,
  lastOk: (when) => `Last synced ${when}.`,
  noExchange: "Not synced since the app started.",
} satisfies Messages["syncTab"];

export const orgTab = {
  eyebrow: "Your organization",
  yourOrg: "Your organization",
  roleOwner: "Owner",
  roleAdmin: "Administrator",
  roleMember: "Member",
  planFree: "Free",
  planPro: "Business",
  plan: (name) => `${name} plan`,
  members: "members",
  yourRole: "your role",
  rules: (n) => (n === 1 ? "enforced rule" : "enforced rules"),
  accessEyebrow: "Access",
  forcedTitle: "Rules enforced by your organization",
  forcedList: (list) => `${list} (cannot be turned off)`,
  forcedNone: "No rules enforced",
  active: "ACTIVE",
  adminConsole: "Admin console",
  adminConsoleHint: "Manage members, usage and security",
  minimalNote: (org) => `Minimum masking is required by ${org} and cannot be turned off.`,
} satisfies Messages["orgTab"];

export const importModal = {
  title: "Import conversations",
  beta: "Beta",
  sub: "Import your conversations from another assistant's official export. Everything happens on your device. The file is not uploaded anywhere.",
  hintChatgpt:
    "chatgpt.com → Settings → Data controls → Export. Drop the .zip you received by email here.",
  hintClaude: "claude.ai → Settings → Privacy → Export. Drop the archive you received by email here.",
  geminiNote: "Gemini: not yet. Google Takeout does not preserve conversation structure.",
  choose: (provider) => `Choose the ${provider} export file…`,
  maskedNote:
    "Sensitive values are masked on import. If you continue an imported conversation here, the model only sees its history masked.",
  redacting: (done, total) => `Masking conversations… ${done} / ${total}`,
  reading: "Reading export…",
  imported: (n) => `${n.toLocaleString("en-US")} conversation${n === 1 ? "" : "s"} imported`,
  skipped: (n) => ` · ${n.toLocaleString("en-US")} already present (skipped)`,
  doneNote:
    "Imported conversations are masked with basic detection only. New messages get full detection when you send them.",
  close: "Close",
  failed: "Import failed. Try again.",
} satisfies Messages["importModal"];
