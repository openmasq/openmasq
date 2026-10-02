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
  skills: "Compétences",
  memory: "Mémoire",
  vault: "Coffre",
  library: "Bibliothèque",
  settings: "Réglages",
} satisfies Messages["nav"];

export const billing = {
  ctaSee: "Voir les abonnements",
  ctaUpgrade: "Passer à l'abonnement supérieur",
  exhaustedTitle: "Vous avez utilisé les crédits inclus ce mois-ci.",
  exhaustedBody:
    "Les crédits se renouvellent au début du mois prochain. Le masquage reste actif et vos propres clés API fonctionnent toujours.",
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
        () => "Tous les modèles dans une conversation",
        () => "Synchro multi-appareils",
        () => "Historique illimité",
      ],
    },
    team: {
      name: "Team",
      feats: [
        () => "Tout Solo, pour chaque membre, plus :",
        () => "Règles de masquage imposées",
        () => "Contrôle des modèles et connecteurs autorisés",
        () => "Facture unique et journal d'audit",
      ],
    },
  },
  tierLabels: { free: "Gratuit", solo: "Solo", team: "Team", scale: "Scale" },
  errors: {
    disabled:
      "Les abonnements ne sont pas encore ouverts dans cette version. Les offres sont affichées à titre indicatif.",
    testerMode:
      "Ce déploiement n'encaisse aucun paiement. Les offres s'activent sans paiement depuis une application à jour.",
    alreadyActive: "Un abonnement est déjà actif sur ce compte. Utilisez « Ouvrir le portail » pour le gérer.",
    noCustomer: "Aucun abonnement à gérer pour l'instant : abonnez-vous d'abord.",
    priceNotConfigured: "La facturation n'est pas encore configurée côté serveur. Contactez le support.",
    stripe: "Erreur Stripe temporaire. Réessayez dans un instant.",
    signIn: "Connectez-vous pour gérer votre abonnement.",
    accountNotFound: "Compte introuvable. Reconnectez-vous.",
    serverDown: "Le service de paiement ne répond pas. Réessayez dans un instant.",
    generic: "Impossible d'ouvrir la page de paiement. Réessayez.",
  },
  checkoutOpenFailed: "Impossible d'ouvrir la page de paiement. Réessayez.",
  freeModeEyebrow: "VOTRE ACCÈS",
  freeModeTitle: "Tout est inclus dans cette version",
  freeModeBody: (brand) =>
    `Cette installation de ${brand} n'a ni abonnement ni paiement : tous les modèles inclus sont disponibles, sans limite de crédits. Vos propres clés API et vos modèles locaux fonctionnent comme d'habitude.`,
  freeModeUsed: (amount) => `${amount} utilisés ce mois-ci · sans limite`,
  unlimitedTier: "Tout inclus",
} satisfies Messages["billing"];
