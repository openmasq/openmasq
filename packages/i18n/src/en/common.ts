/**
 * Tranche « common » du catalogue EN — traduit de la source (`../fr/`).
 *
 * `satisfies` par entrée : le compilateur exige EXACTEMENT les clés du contrat
 * (`../messages/common.ts`), ni plus ni moins, tranche par tranche — donc une clé
 * oubliée nomme SA tranche plutôt que le catalogue entier.
 */
import type { Messages } from "../messages";

export const common = {
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
} satisfies Messages["billing"];
