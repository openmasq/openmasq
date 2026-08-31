/**
 * The FR catalogue's « onboarding » slice — the SOURCE language.
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/onboarding.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const onboarding = {
  skip: "Passer",
  back: "Retour",
  next: "Suivant",
  start: "Commencer",

  redaction: {
    eyebrow: "REDACTION",
    titleLead: "Écrivez",
    titleHighlight: "librement",
    sub: (brand) =>
      `Avant qu'un message ne parte, ${brand} repère les données sensibles et les remplace par de fausses valeurs. Le modèle ne travaille que sur celles-ci — vous, vous continuez de voir les vraies. C'est ce remplacement qu'on appelle le redaction.`,
    notoriety: {
      lead: "Les personnalités, grandes marques et pays ne sont ",
      strong: "jamais masqués",
      tail: " : une question de culture générale reste une question de culture générale.",
    },
    webReveal: {
      lead: (brand) => `Avant une recherche sur le web, ${brand} vous `,
      strong: "propose de révéler",
      tail: " ce qui est masqué — sans quoi la recherche porterait sur une entreprise ou une ville qui n'existent pas.",
    },
  },

  places: {
    eyebrow: "VOTRE ESPACE",
    title: "Six endroits, six usages",
    sub: "La barre de gauche mène à tout. Vous n'avez rien à y préparer : chaque endroit se remplit en travaillant.",
  },

  access: {
    eyebrow: "ACCÈS AUX MODÈLES",
    titleServed: "Abonnement, ou votre clé",
    titleIncluded: "Votre compte, ou votre clé",
    titleUnserved: "Votre clé, ou un modèle local",
    subServed:
      "Vous changerez d'avis quand vous voudrez. Dans les deux cas, le redaction s'applique avant chaque envoi.",
    subUnserved:
      "Une clé, un modèle qui tourne sur votre machine, ou votre abonnement Claude Code / Codex — le redaction s'applique avant chaque envoi, quel que soit le chemin.",
  },

  ready: {
    title: "La protection, elle, est déjà active",
    eyebrow: "C'EST PRÊT",
    subServed: (brand) =>
      `Elle ne dépend d'aucune clé : dès votre premier message, le redaction s'applique. Un modèle gratuit est déjà sélectionné et fonctionne avec votre compte ${brand}.`,
    subUnserved:
      "Elle ne dépend d'aucun compte : dès votre premier message, le redaction s'applique. Il ne manque qu'un accès à un modèle — une clé, un serveur local, ou votre CLI.",
    modelHint:
      "Le nom du modèle est sous la zone de saisie — cliquez-le pour en changer, ou pour brancher un accès si vous avez passé l'étape.",
    slashHint: {
      lead: "Tapez ",
      strong: "/",
      tail: " dans la zone de message pour vos compétences, vos workflows et « retiens que… ».",
    },
    helpHint: {
      lead: "Un doute ? ",
      strong: "Aide",
      tail: ", en bas de la barre de droite, reprend tout ça — la démonstration comprise.",
    },
    tuneRedaction: "Régler finement le redaction",
  },

  tune: {
    eyebrow: "REDACTION",
    title: "Régler finement",
    sub: "Ces réglages sont déjà bons par défaut. Vous les retrouverez à tout moment dans Réglages → Compte.",
  },

  keyChoice: {
    subscription: {
      title: (brand) => `Mon compte ${brand}`,
      sub: "Aucune clé à gérer : les modèles puisent dans les crédits de votre abonnement.",
    },
    included: {
      sub: "Aucune clé à gérer : les modèles inclus sont servis sur votre compte, hébergés en France pour la plupart.",
    },
    ownKey: {
      title: "Ma propre clé API",
      sub: "Une clé OpenRouter ouvre tous les modèles, les gratuits compris, sur votre compte. Un clic pour l'obtenir ; elle reste chiffrée sur cette machine.",
    },
    recommended: "conseillé",
    savedKey: (provider) => `Clé ${provider} enregistrée — vous êtes prêt.`,
    connect: "Obtenir une clé gratuitement",
    connecting: "Autorisation dans votre navigateur…",
    retry: "Réessayer",
    connectTip: (brand) => `${brand} se connecte à votre compte OpenRouter : vos crédits, votre quota.`,
    connectHint: "OpenRouter s'ouvre, vous acceptez, la clé revient chiffrée ici — rien à copier.",
    manualCreate: "Créer la clé à la main",
    manualHave: "J'ai déjà une clé OpenRouter",
    errorIncomplete: "Connexion non terminée. Réessayez — rien n'a été enregistré.",
    errorUnreachable: "Connexion impossible. Réessayez dans un instant.",
    errorSaveFailed: "La clé n'a pas pu être enregistrée. Réessayez.",
  },

  keySteps: {
    markDone: "Marquer cette étape comme faite",
    openHost: (host) => `Ouvrir ${host} ↗`,
    placeholder: (provider, hint) => `Clé ${provider} — ${hint}`,
    placeholderPlain: (provider) => `Clé ${provider}`,
    save: "Enregistrer",
    saving: "Enregistrement…",
  },
} satisfies Messages["onboarding"];
