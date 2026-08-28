/**
 * Le catalogue FRANÇAIS — la langue SOURCE (le code est écrit en français, les messages
 * les plus travaillés — refus, `redact` — le sont d'abord ici, `en.ts` les traduit).
 *
 * `satisfies Messages` : le compilateur exige EXACTEMENT les clés du contrat, ni plus ni
 * moins. Ajouter une entrée sans la déclarer dans `messages.ts` est une erreur ; en
 * oublier une aussi.
 */
import type { Messages } from "./messages";

export const fr = {
  common: {
    cancel: "Annuler",
    save: "Enregistrer",
    close: "Fermer",
    retry: "Réessayer",
    delete: "Supprimer",
    confirm: "Confirmer",
    loading: "Chargement…",
    genericError: "Une erreur est survenue. Réessayez.",
  },
  nav: {
    ariaLabel: "Navigation",
    chats: "Chats",
    competences: "Compét.",
    memory: "Mémoire",
    vault: "Coffre",
    library: "Biblio",
    settings: "Réglages",
  },
  billing: {
    checkoutOpenFailed: "Impossible d'ouvrir la page de paiement. Réessayez.",
  },
  language: {
    label: "Langue",
    names: { fr: "Français", en: "English" },
  },
} satisfies Messages;
