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
  freeModeEyebrow: "VOTRE ACCÈS",
  freeModeTitle: "Tout est inclus sur cette version",
  freeModeBody: (brand) =>
    `Cette installation de ${brand} n'a ni abonnement ni paiement : tous les modèles inclus sont disponibles, sans limite de crédits. Vos propres clés et vos modèles locaux fonctionnent comme d'habitude.`,
  freeModeUsed: (amount) => `${amount} utilisés ce mois-ci · sans limite`,
  unlimitedTier: "Tout inclus",
} satisfies Messages["billing"];
