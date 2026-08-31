/**
 * Tranche « cards » du catalogue FR — la langue SOURCE.
 *
 * `satisfies` par entrée : le compilateur exige EXACTEMENT les clés du contrat
 * (`../messages/cards.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const cards = {
  welcome: {
    subtitle:
      "Écrivez librement : noms, e-mails et numéros sont redacted avant d'atteindre le modèle.",
    seeExamples: "Voir des exemples",
    seeOthers: "Voir les autres",
  },

  transparency: {
    ariaLabel: "Ce que le modèle a vu",
    eyebrow: "Transparence",
    note: "Rien à activer : c'est déjà ce qui s'est passé.",
    later: "Plus tard",
    open: "Voir ce que le modèle a vu",
    title: (n) => `${n} information${n === 1 ? "" : "s"} protégée${n === 1 ? "" : "s"} pendant cet échange`,
    theModel: "Le modèle",
    desc: (modelName) =>
      `${modelName} n'a jamais reçu ces valeurs : elles ont été remplacées par des pseudonymes avant l'envoi, puis rétablies dans la réponse que vous lisez. Ouvrez le comparatif pour voir votre message et ce qui est réellement parti, côte à côte.`,
  },

  memoryProposal: {
    eyebrow: "Mémoire",
    note: "Local · chiffré · toujours redacted avant d'atteindre un modèle",
    decline: "Non merci",
    activate: "Activer",
    title: (brand) => `${brand} peut retenir l'essentiel`,
    desc: (brand) =>
      `Cette conversation contient des faits durables. Avec la mémoire automatique, ${brand} note seul vos clients, projets et préférences — à partir du texte déjà redacted, rien de nouveau ne quitte votre machine — et les rappelle dans chaque conversation utile. Vous pouvez aussi dire « retiens que… » à tout moment.`,
  },

  redactionIntro: {
    ariaLabel: "Comprendre mon redaction",
    title: "Comprendre mon redaction",
    sub: "Ce qui est masqué, ce qui reste en clair, et pourquoi le compteur peut rester à zéro",
    closeTip: "Fermer pour toujours — le chapitre reste dans l'Aide",
    close: "Fermer pour toujours",
  },

  banners: {
    attachmentIgnored: "Pièce jointe ignorée",
  },

  sendMode: {
    title: "Envoyer le document",
    question: (n) =>
      `Comment envoyer ${n === 1 ? "ce document" : `ces ${n} documents`} au modèle ? Dans les deux cas, seule la version redacted part.`,
    textOption: "Texte extrait",
    textTokens: (tokens) => `≈ ${tokens} tokens de texte`,
    textDesc: "Le texte du document, redacted — rapide et léger, sans la mise en page.",
    fileOption: "Document redacted (fichier)",
    computing: "calcul…",
    approx: (size) => `≈ ${size}`,
    fileDesc: "Les pages redactées en images — garde la mise en page, les tableaux, la structure.",
    tooBig: " — trop volumineux pour ce modèle, préférez le texte.",
    noFiles: (modelLabel) => `⚠ ${modelLabel} ne gère pas l'envoi de fichiers.`,
    switchAndSend: (modelLabel) => `Basculer sur ${modelLabel} et envoyer le fichier`,
    cancel: "Annuler",
  },

  writeConfirm: {
    ariaLabel: "Confirmation d'action",
    cancel: "Annuler",
    target: "Cible",
    note: "Les valeurs affichées sont vos vraies données — c'est exactement ce qui partira.",
    attachmentsWarning: (n) =>
      n === 1
        ? "1 fichier de vos données sera joint (envoyé en clair) :"
        : `${n} fichiers de vos données seront joints (envoyés en clair) :`,
    navExfil: {
      eyebrow: "Navigation web",
      title: (host) => `Ouvrir ${host} ?`,
      titleNoHost: "Autoriser cette navigation ?",
      desc: "L'adresse emporte des données de la conversation — vérifiez qu'elles sont attendues.",
      confirm: "Ouvrir",
    },
    attachments: {
      eyebrow: "Confirmation requise",
      title: "Envoyer ces fichiers ?",
      desc: (server) =>
        `Cet envoi via ${server} emporte vos fichiers réels, dans leur version non redacted.`,
      confirm: "Envoyer",
    },
    action: {
      eyebrow: "Confirmation requise",
      title: "Autoriser cette action ?",
      desc: (server) =>
        `L'assistant demande à ${server} d'exécuter l'action ci-dessous. Elle peut créer, modifier ou supprimer des données — vérifiez son contenu avant d'autoriser.`,
      confirm: "Autoriser",
    },
  },
} satisfies Messages["cards"];
