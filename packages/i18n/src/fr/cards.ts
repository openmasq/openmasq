/**
 * The FR catalogue's « cards » slice — the SOURCE language.
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/cards.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const cards = {
  welcome: {
    subtitle:
      "Écrivez librement : noms, e-mails et numéros sont masqués avant d'atteindre le modèle.",
    seeExamples: "Voir des exemples",
    seeOthers: "Voir les autres",
  },

  transparency: {
    ariaLabel: "Ce que le modèle a vu",
    eyebrow: "Transparence",
    note: "Masquage appliqué automatiquement.",
    later: "Plus tard",
    open: "Voir ce que le modèle a vu",
    title: (n) => `${n} élément${n === 1 ? "" : "s"} masqué${n === 1 ? "" : "s"} dans cet échange`,
    theModel: "Le modèle",
    desc: (modelName) =>
      `${modelName} n'a jamais reçu ces valeurs. Elles ont été remplacées par des substituts avant l'envoi, puis rétablies dans la réponse que vous lisez. Ouvrez le comparatif pour voir votre message et ce qui a réellement été envoyé, côte à côte.`,
  },

  memoryProposal: {
    eyebrow: "Mémoire",
    note: "Sur votre appareil · chiffré · toujours masqué avant d'atteindre un modèle",
    decline: "Non merci",
    activate: "Activer",
    title: (brand) => `${brand} peut retenir l'essentiel`,
    desc: (brand) =>
      `Cette conversation contient des informations à retenir. Avec la mémoire automatique, ${brand} note vos clients, projets et préférences à partir du texte déjà masqué, puis les rappelle dans les conversations où elles sont utiles. Rien de nouveau n'est envoyé. Vous pouvez aussi dire « retiens que… » à tout moment.`,
  },

  redactionIntro: {
    ariaLabel: "Comment fonctionne le masquage",
    title: "Comment fonctionne le masquage",
    sub: "Ce qui est masqué, ce qui ne l'est pas, et pourquoi le compteur peut afficher zéro",
    closeTip: "Ne plus afficher. Cette section reste dans l'Aide.",
    close: "Ne plus afficher",
  },

  integration: {
    manySuggested: (n) => `${n} connecteurs suggérés`,
    secureNote: "Connexion sécurisée · accès chiffré · révocable à tout moment",
    connectTools: "Connectez vos outils pour continuer",
    tileConnected: (name) => `${name} · connecté`,
    tileConnect: (name) => `Connecter ${name}`,
    activate: "Activer",
    connect: (name) => `Connecter ${name}`,
    suggested: "Connecteur suggéré",
    connectedEyebrow: (name) => `${name} · connecté`,
    connectedResume: (brand) => `Connecté. ${brand} peut continuer.`,
    resume: "Continuer",
    builtinNote: (brand) => `Intégré à ${brand}. Aucun compte tiers nécessaire.`,
    activateTitle: (name) => `Activez ${name} pour continuer`,
    connectTitle: (name) => `Connectez ${name} pour continuer`,
  },

  banners: {
    attachmentIgnored: "Pièce jointe ignorée",
  },

  writeConfirm: {
    ariaLabel: "Confirmation d'action",
    cancel: "Annuler",
    target: "Cible",
    note: "Ce sont vos vraies valeurs. C'est exactement ce qui sera envoyé.",
    attachmentsWarning: (n) =>
      n === 1
        ? "1 fichier sera joint et envoyé non masqué :"
        : `${n} fichiers seront joints et envoyés non masqués :`,
    details: (tool) => `Détails techniques (${tool})`,
    scopeNote: (tool) => `Une fois autorisé, « ${tool} » ne redemandera plus dans cette conversation.`,
    navExfil: {
      eyebrow: "Navigation web",
      title: (host) => `Ouvrir ${host} ?`,
      titleNoHost: "Ouvrir cette page ?",
      desc: "Ce lien contient des données de votre conversation. Ouvrez-le seulement si vous acceptez que ces données soient envoyées.",
      confirm: "Ouvrir",
    },
    attachments: {
      eyebrow: "Confirmation requise",
      title: "Envoyer ces fichiers ?",
      desc: (server) =>
        `${server} recevra vos fichiers originaux, non masqués.`,
      confirm: "Envoyer",
    },
    action: {
      eyebrow: "Confirmation requise",
      title: "Autoriser cette action ?",
      desc: (server) =>
        `L'assistant demande à ${server} d'exécuter l'action ci-dessous. Elle peut créer, modifier ou supprimer des données. Vérifiez-la avant d'autoriser.`,
      confirm: "Autoriser",
    },
  },
} satisfies Messages["cards"];
