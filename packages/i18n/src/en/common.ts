/**
 * The EN catalogue's « common » slice — translated from the source (`../fr/`).
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/common.ts`), no more and no less, slice by slice — so a forgotten
 * key names ITS slice rather than the whole catalogue.
 */
import type { Messages } from "../messages";

export const common = {
  intlTag: "en-GB",
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
  competences: "Skills",
  memory: "Memory",
  vault: "Vault",
  library: "Library",
  settings: "Settings",
} satisfies Messages["nav"];

export const billing = {
  ctaSee: "See the subscriptions",
  ctaUpgrade: "Move to a higher subscription",
  exhaustedTitle: "You have used everything included this month.",
  exhaustedBody:
    "It all resets at the start of next month. Meanwhile your protection does not stop, and your own keys keep working.",
  tiers: {
    free: {
      name: "Free",
      tag: "From sign-up",
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
        () => "Every model in one thread",
        () => "Multi-device sync",
        () => "Unlimited history",
      ],
    },
    team: {
      name: "Team",
      feats: [
        () => "Everything in Solo, for each member, plus:",
        () => "Enforced masking rules",
        () => "Allowed models and connectors",
        () => "One invoice and an audit log",
      ],
    },
  },
  tierLabels: { free: "Free", solo: "Solo", team: "Team", scale: "Scale" },
  errors: {
    disabled: "Subscriptions are not open on this version yet. The offer is shown for information.",
    testerMode:
      "This deployment does not take payments: subscriptions activate without paying, from an up-to-date app.",
    alreadyActive: "A subscription is already active on this account — use “Open the portal” to manage it.",
    noCustomer: "No subscription to manage yet — subscribe first.",
    priceNotConfigured: "Billing is not configured on the server yet. Contact support.",
    stripe: "Temporary Stripe error. Try again in a moment.",
    signIn: "Sign in to manage your subscription.",
    accountNotFound: "Account not found — sign in again.",
    serverDown: "The payment service is not responding. Try again in a moment.",
    generic: "Couldn't open the payment page. Try again.",
  },
  checkoutOpenFailed: "Couldn't open the payment page. Please try again.",
  freeModeEyebrow: "YOUR ACCESS",
  freeModeTitle: "Everything is included on this version",
  freeModeBody: (brand) =>
    `This ${brand} installation has no subscription and no payment: every included model is available, with no credit limit. Your own keys and local models work as usual.`,
  freeModeUsed: (amount) => `${amount} used this month · no limit`,
  unlimitedTier: "All included",
} satisfies Messages["billing"];
