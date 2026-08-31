/**
 * Tranche « modals » du catalogue FR — la langue SOURCE.
 *
 * `satisfies` par entrée : le compilateur exige EXACTEMENT les clés du contrat
 * (`../messages/modals.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const modals = {
  transparency: {
    title: "Ce que le modèle a vu",
    sub: (n, modelName) =>
      `${n} information${n === 1 ? "" : "s"} remplacée${n === 1 ? "" : "s"} avant d'atteindre ${modelName}. À gauche votre texte, à droite ce qui est parti.`,
    theModel: "le modèle",
    close: "Fermer",
    empty:
      "Rien de sensible n'a été détecté dans cette conversation : le modèle a reçu vos messages tels quels.",
  },

  error: {
    eyebrow: "ERREUR",
    title: "Détail de l'erreur",
    sub: "Le message brut du fournisseur / de l'outil. Il n'est pas ajouté à la conversation.",
    copy: "Copier",
    copied: "Copié",
    retry: "Réessayer",
  },

  updateReady: {
    eyebrow: "MISE À JOUR PRÊTE",
    version: (version) => `Version ${version}`,
    noNote: "Les nouveautés de cette version ne sont pas encore publiées.",
    later: "Plus tard",
    restartNow: "Redémarrer maintenant",
  },

  mcpAuth: {
    title: (connector) => `Se connecter à ${connector}`,
    sub: (connector) =>
      `${connector} peut être utilisé avec votre compte ou en accès anonyme. Vous pourrez changer plus tard en le reconnectant.`,
    withAccount: "Se connecter avec mon compte",
    withAccountDesc: (connector) => `Utilise vos crédits, quotas et accès — comme sur ${connector}.`,
    anonymous: "Utiliser sans compte",
    anonymousDesc: "Accès anonyme, limité — aucun identifiant, quotas partagés.",
    cancel: "Annuler",
  },

  search: {
    placeholder: "Rechercher une section, une conversation, un fichier, un réglage…",
    newChat: "Nouvelle conversation",
    noResults: "Aucun résultat.",
  },

  avis: {
    title: "Votre avis",
    sub: "Dites-nous ce qui marche — ou ce qui coince. On lit tout.",
    thanks: "Merci !",
    thanksWithJournal:
      "Message reçu, avec le journal de débogage — sans la table de correspondance, donc sans vos valeurs réelles.",
    thanksPlain: "Message reçu. Aucun contenu de vos conversations n'a été joint.",
    close: "Fermer",
    moodLabel: "Comment ça se passe ?",
    optional: " · facultatif",
    categoryLabel: "Type de retour",
    messageLabel: "Votre message",
    messagePlaceholder: "Ce que vous aimez, ce qui vous a bloqué, ce qui manque…",
    attachContext: "Joindre le contexte technique",
    attachContextSub:
      "Version de l'app, écran actuel et identifiant d'installation. Jamais le contenu de vos conversations.",
    attachJournal: "Joindre le journal de débogage",
    moods: { love: "J'adore", ok: "Correct", meh: "Bof" },
    categories: { idea: "Idée", bug: "Bug", love: "Compliment", other: "Autre" },
  },
} satisfies Messages["modals"];
