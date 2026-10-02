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
    eyebrow: "MASQUAGE",
    titleLead: "Écrivez",
    titleHighlight: "librement",
    sub: (brand) =>
      `Avant l'envoi d'un message, ${brand} repère les données sensibles et les remplace par des valeurs de substitution. Le modèle ne voit que ces substituts. Vous continuez de voir les vraies valeurs.`,
    notoriety: {
      lead: "Les personnalités, grandes marques et pays ne sont ",
      strong: "pas masqués",
      tail: " par défaut : ils n'identifient pas votre client.",
    },
    webReveal: {
      lead: (brand) => `Avant une recherche sur le web, ${brand} vous `,
      strong: "propose de révéler",
      tail: " ce qui est masqué. Sinon, la recherche porterait sur des substituts qui n'existent pas.",
    },
  },

  access: {
    eyebrow: "ACCÈS AUX MODÈLES",
    titleServed: "Abonnement, ou votre clé",
    titleIncluded: "Votre compte, ou votre clé",
    titleUnserved: "Votre clé, ou un modèle local",
    subServed:
      "Modifiable à tout moment. Dans tous les cas, le masquage s'applique avant chaque envoi.",
    subUnserved:
      "Une clé API, un modèle qui tourne sur votre machine, ou votre abonnement Claude Code / Codex. Dans tous les cas, le masquage s'applique avant chaque envoi.",
    titleAgents: "Votre abonnement, ou une clé",
    subAgents:
      "Avec Claude Code ou Codex sur cette machine, vos messages passent par votre abonnement. Aucune clé API nécessaire. Sinon, utilisez une clé API ou un modèle local. Dans tous les cas, le masquage s'applique avant chaque envoi.",
  },

  ready: {
    title: "Le masquage est actif",
    eyebrow: "C'EST PRÊT",
    subServed: (brand) =>
      `Le masquage ne dépend d'aucune clé et s'applique dès votre premier message. Un modèle gratuit est déjà sélectionné et fonctionne avec votre compte ${brand}.`,
    subUnserved:
      "Le masquage ne dépend d'aucun compte et s'applique dès votre premier message. Il vous faut seulement un accès à un modèle : une clé API, un serveur local ou votre CLI.",
    modelHint:
      "Le nom du modèle est sous la zone de saisie. Cliquez dessus pour changer de modèle, ou pour ajouter un accès si vous avez passé l'étape.",
    slashHint: {
      lead: "Tapez ",
      strong: "/",
      tail: " dans la zone de message pour vos compétences, vos routines et « retiens que… ».",
    },
    helpHint: {
      lead: "Un doute ? ",
      strong: "Aide",
      tail: ", en bas de la barre de droite, reprend tout cela, démonstration comprise.",
    },
    tuneRedaction: "Régler le masquage",
  },

  tune: {
    eyebrow: "MASQUAGE",
    title: "Régler finement",
    sub: "Les réglages par défaut sont recommandés. Vous pouvez les modifier à tout moment dans Réglages → Confidentialité.",
  },

  keyChoice: {
    subscription: {
      title: (brand) => `Mon compte ${brand}`,
      sub: "Aucune clé à gérer : les modèles utilisent les crédits de votre abonnement.",
    },
    included: {
      sub: "Aucune clé à gérer : les modèles inclus fonctionnent avec votre compte, hébergés en France pour la plupart.",
    },
    ownKey: {
      title: "Ma propre clé API",
      sub: "Une clé OpenRouter donne accès à tous les modèles, gratuits compris, facturés sur votre compte. Elle s'obtient en un clic et reste chiffrée sur cette machine.",
    },
    agent: {
      title: "Mon abonnement Claude Code / Codex",
      sub: "Utilise l'abonnement que vous payez déjà. Si la CLI n'est pas installée ou connectée, deux clics suffisent ici. Chaque message est décompté de votre abonnement personnel. Aucune clé API nécessaire.",
      hint: "L'abonnement et le quota de chaque CLI s'affichent dans Réglages → Modèles.",
    },
    recommended: "conseillé",
    otherProvider: "Autre fournisseur",
    savedKey: (provider) => `Clé ${provider} enregistrée. Vous êtes prêt.`,
    connect: "Obtenir une clé gratuitement",
    connecting: "En attente d'autorisation dans votre navigateur…",
    retry: "Réessayer",
    connectTip: (brand) => `${brand} se connecte à votre compte OpenRouter. L'usage est décompté de vos crédits OpenRouter.`,
    connectHint: "Autorisez l'accès sur OpenRouter. La clé est enregistrée ici, chiffrée.",
    manualCreate: "Créer la clé manuellement",
    manualHave: "J'ai déjà une clé OpenRouter",
    errorIncomplete: "Connexion non terminée. Rien n'a été enregistré. Réessayez.",
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
    stepDone: (step) => `Marquer l'étape ${step} comme faite`,
    stepUndo: (step) => `Marquer l'étape ${step} comme non faite`,
  },
} satisfies Messages["onboarding"];
