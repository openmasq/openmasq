/**
 * Tranche « common » du catalogue EN — traduit de la source (`../fr/`).
 *
 * `satisfies` par entrée : le compilateur exige EXACTEMENT les clés du contrat
 * (`../messages/common.ts`), ni plus ni moins, tranche par tranche — donc une clé
 * oubliée nomme SA tranche plutôt que le catalogue entier.
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
  checkoutOpenFailed: "Couldn't open the payment page. Please try again.",
  freeModeEyebrow: "YOUR ACCESS",
  freeModeTitle: "Everything is included on this version",
  freeModeBody: (brand) =>
    `This ${brand} installation has no subscription and no payment: every included model is available, with no credit limit. Your own keys and local models work as usual.`,
  freeModeUsed: (amount) => `${amount} used this month · no limit`,
  unlimitedTier: "All included",
} satisfies Messages["billing"];
