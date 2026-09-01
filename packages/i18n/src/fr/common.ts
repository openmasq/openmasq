/**
 * The FR catalogue's « common » slice — the SOURCE language.
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/common.ts`), no more and no less, slice by slice — so a forgotten
 * key names ITS slice rather than the whole catalogue.
 */
import type { Messages } from "../messages";

export const common = {
  intlTag: "fr-FR",
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
  ctaSee: "Voir les abonnements",
  ctaUpgrade: "Passer à un abonnement supérieur",
  exhaustedTitle: "Vous avez utilisé tout ce qui est inclus ce mois-ci.",
  exhaustedBody:
    "Tout revient au début du mois prochain. En attendant, votre protection ne s'arrête pas, et vos propres clés continuent de fonctionner.",
  tiers: {
    free: {
      name: "Gratuit",
      tag: "Dès l'inscription",
      feats: [
        (brand) => `Masquage géré par ${brand}`,
        () => "Modèles essentiels",
        () => "1 appareil",
        () => "Historique 30 jours",
      ],
    },
    solo: {
      name: "Solo",
      feats: [
        () => "Tout Gratuit, plus :",
        () => "Tous les modèles dans un fil",
        () => "Synchro multi-appareils",
        () => "Historique illimité",
      ],
    },
    team: {
      name: "Team",
      feats: [
        () => "Tout Solo, pour chaque membre, plus :",
        () => "Règles de masquage imposées",
        () => "Modèles et connecteurs autorisés",
        () => "Facture unique et journal d'audit",
      ],
    },
  },
  tierLabels: { free: "Free", solo: "Solo", team: "Team", scale: "Scale" },
  errors: {
    disabled:
      "Les abonnements ne sont pas encore ouverts sur cette version. L'offre est affichée à titre indicatif.",
    testerMode:
      "Ce déploiement n'encaisse pas les abonnements : les offres s'y activent sans paiement, depuis une application à jour.",
    alreadyActive: "Un abonnement est déjà actif sur ce compte — utilisez « Ouvrir le portail » pour le gérer.",
    noCustomer: "Aucun abonnement à gérer pour l'instant — abonnez-vous d'abord.",
    priceNotConfigured: "La facturation n'est pas encore configurée côté serveur. Contactez le support.",
    stripe: "Erreur Stripe temporaire. Réessayez dans un instant.",
    signIn: "Connectez-vous pour gérer votre abonnement.",
    accountNotFound: "Compte introuvable — reconnectez-vous.",
    serverDown: "Le service de paiement ne répond pas. Réessayez dans un instant.",
    generic: "Impossible d'ouvrir la page de paiement. Réessayez.",
  },
  checkoutOpenFailed: "Impossible d'ouvrir la page de paiement. Réessayez.",
  freeModeEyebrow: "VOTRE ACCÈS",
  freeModeTitle: "Tout est inclus sur cette version",
  freeModeBody: (brand) =>
    `Cette installation de ${brand} n'a ni abonnement ni paiement : tous les modèles inclus sont disponibles, sans limite de crédits. Vos propres clés et vos modèles locaux fonctionnent comme d'habitude.`,
  freeModeUsed: (amount) => `${amount} utilisés ce mois-ci · sans limite`,
  unlimitedTier: "Tout inclus",
} satisfies Messages["billing"];
