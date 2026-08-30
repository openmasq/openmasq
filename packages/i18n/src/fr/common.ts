/**
 * Tranche « common » du catalogue FR — la langue SOURCE.
 *
 * `satisfies` par entrée : le compilateur exige EXACTEMENT les clés du contrat
 * (`../messages/common.ts`), ni plus ni moins, tranche par tranche — donc une clé
 * oubliée nomme SA tranche plutôt que le catalogue entier.
 */
import type { Messages } from "../messages";

export const common = {
  cancel: "Annuler",
  save: "Enregistrer",
  close: "Fermer",
  retry: "Réessayer",
  delete: "Supprimer",
  confirm: "Confirmer",
  loading: "Chargement…",
  genericError: "Une erreur est survenue. Réessayez.",
} satisfies Messages["common"];

export const nav = {
  ariaLabel: "Navigation",
  chats: "Chats",
  competences: "Compét.",
  memory: "Mémoire",
  vault: "Coffre",
  library: "Biblio",
  settings: "Réglages",
} satisfies Messages["nav"];

export const billing = {
  checkoutOpenFailed: "Impossible d'ouvrir la page de paiement. Réessayez.",
} satisfies Messages["billing"];
