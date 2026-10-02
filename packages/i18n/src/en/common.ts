/**
 * The EN catalogue's « common » slice — translated from the source (`../fr/`).
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/common.ts`), no more and no less, slice by slice — so a forgotten
 * key names ITS slice rather than the whole catalogue.
 */
import type { Messages } from "../messages";

export const common = {
  intlTag: "en-US",
  cancel: "Cancel",
  save: "Save",
  close: "Close",
  retry: "Retry",
  delete: "Delete",
  confirm: "Confirm",
  loading: "Loading…",
  genericError: "Something went wrong. Please try again.",
} satisfies Messages["common"];

export const nav = {
  ariaLabel: "Navigation",
  chats: "Chats",
  skills: "Skills",
  memory: "Memory",
  vault: "Vault",
  library: "Library",
  settings: "Settings",
} satisfies Messages["nav"];

export const billing = {
  ctaSee: "See subscriptions",
  ctaUpgrade: "Upgrade",
  exhaustedTitle: "You've used this month's included credits.",
  exhaustedBody:
    "Credits reset at the start of next month. Masking stays on, and your own API keys still work.",
  tiers: {
    free: {
      name: "Free",
      tag: "Included at sign-up",
      feats: [
        (brand) => `Masking managed by ${brand}`,
        () => "Essential models",
        () => "1 device",
        () => "30-day history",
      ],
    },
    solo: {
      name: "Solo",
      feats: [
        () => "Everything in Free, plus:",
        () => "Every model in one conversation",
        () => "Multi-device sync",
        () => "Unlimited history",
      ],
    },
    team: {
      name: "Team",
      feats: [
        () => "Everything in Solo, for each member, plus:",
        () => "Enforced masking rules",
        () => "Control over allowed models and connectors",
        () => "One invoice and an audit log",
      ],
    },
  },
  tierLabels: { free: "Free", solo: "Solo", team: "Team", scale: "Scale" },
  errors: {
    disabled: "Subscriptions are not open in this version yet. Plans are shown for reference only.",
    testerMode:
      "This deployment takes no payments. Plans activate without payment from an up-to-date app.",
    alreadyActive: "This account already has an active subscription. Use “Open the portal” to manage it.",
    noCustomer: "No subscription to manage yet: subscribe first.",
    priceNotConfigured: "Billing is not configured on the server yet. Contact support.",
    stripe: "Temporary Stripe error. Try again in a moment.",
    signIn: "Sign in to manage your subscription.",
    accountNotFound: "Account not found. Sign in again.",
    serverDown: "The payment service is not responding. Try again in a moment.",
    generic: "Couldn't open the payment page. Try again.",
  },
  checkoutOpenFailed: "Couldn't open the payment page. Please try again.",
  freeModeEyebrow: "YOUR ACCESS",
  freeModeTitle: "Everything is included in this version",
  freeModeBody: (brand) =>
    `This ${brand} installation has no subscription or payment: every included model is available, with no credit limit. Your own API keys and local models work as usual.`,
  freeModeUsed: (amount) => `${amount} used this month · no limit`,
  unlimitedTier: "Everything included",
} satisfies Messages["billing"];
