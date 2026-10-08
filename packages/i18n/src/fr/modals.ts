/**
 * The FR catalogue's « modals » slice — the SOURCE language.
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/modals.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const modals = {
  transparency: {
    title: "Ce que le modèle a vu",
    sub: (n, modelName) =>
      `${n} information${n === 1 ? "" : "s"} remplacée${n === 1 ? "" : "s"} avant d'atteindre ${modelName}. À gauche votre texte, à droite ce qui a été envoyé.`,
    theModel: "le modèle",
    close: "Fermer",
    empty:
      "Rien de sensible n'a été détecté dans cette conversation : le modèle a reçu vos messages tels quels.",
    youWrote: "Ce que vous avez écrit",
    youRead: "Ce qui vous est affiché",
    modelReceived: "Ce que le modèle a reçu",
    modelWrote: "Ce que le modèle a écrit",
    yourMessage: "Votre message",
    reply: "Réponse",
    swapped: (n) => `${n} remplacement${n === 1 ? "" : "s"}`,
    showMore: (n) => `Afficher la suite (${n.toLocaleString("fr-FR")} caractères restants)`,
  },

  error: {
    eyebrow: "ERREUR",
    title: "Détail de l'erreur",
    sub: "Le message brut du fournisseur ou de l'outil. Il n'est pas ajouté à la conversation.",
    copy: "Copier",
    copied: "Copié",
    retry: "Réessayer",
  },

  whatsNew: {
    eyebrow: "NOUVELLE VERSION INSTALLÉE",
    close: "Continuer",
  },

  updateReady: {
    eyebrow: "MISE À JOUR PRÊTE",
    version: (version) => `Version ${version}`,
    noNote: "Les nouveautés de cette version ne sont pas encore publiées.",
    later: "Plus tard",
    restartNow: "Redémarrer maintenant",
    restarting: "Redémarrage…",
    restartingHint:
      "L'app redémarre dans quelques secondes.",
    restartSlow:
      "L'app n'a pas encore redémarré. Quittez-la : la mise à jour s'installe au prochain lancement.",
    retry: "Réessayer",
    toastTitle: "Mise à jour prête",
    toastMessage: (brand, version) => `${brand} ${version} s'installera au prochain redémarrage.`,
    toastAction: "Voir",
  },

  mcpAuth: {
    title: (connector) => `Se connecter à ${connector}`,
    sub: (connector) =>
      `${connector} peut être utilisé avec votre compte ou en accès anonyme. Vous pourrez changer plus tard en le reconnectant.`,
    withAccount: "Se connecter avec mon compte",
    withAccountDesc: (connector) => `Utilise vos crédits, quotas et accès sur ${connector}.`,
    anonymous: "Utiliser sans compte",
    anonymousDesc: "Accès anonyme et limité, sans identifiant. Quotas partagés.",
    cancel: "Annuler",
  },

  search: {
    placeholder: "Rechercher une section, une conversation, un fichier, un réglage…",
    newChat: "Nouvelle conversation",
    noResults: "Aucun résultat.",
  },

  feedback: {
    sendFailed: "Votre avis n'a pas pu être envoyé. Réessayez dans un instant, votre message est conservé.",
    title: "Votre avis",
    sub: "Dites-nous ce qui marche et ce qui ne marche pas.",
    thanks: "Merci !",
    thanksWithLog:
      "Message reçu, avec le journal de débogage. Il ne contient pas vos valeurs réelles.",
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
    attachLog: "Joindre le journal de débogage",
    inDocument: "dans un document",
    inReply: "dans une réponse",
    inMessage: "dans un message",
    problemKind: (kind) => ` (type : ${kind})`,
    problemBody: (where, kind) =>
      `Masquage incorrect${kind} ${where}.\nCe qui n'allait pas (sans coller la valeur réelle) : `,
    logDraft: "Rapport depuis le journal de débogage.\nCe qui n'allait pas : ",
    replyDraft: "À propos de cette réponse : ",
    attachLogSub:
      "Le texte envoyé au modèle (déjà masqué), les outils et les erreurs, sans vos valeurs réelles. Aperçu ci-dessous.",
    confidential: "Confidentiel",
    sendMail: "Ouvrir dans votre messagerie",
    mailDone:
      "Votre messagerie s'est ouverte avec le message prêt à envoyer.",
    mailFallback: (address) => `Rien ne s'est ouvert ? Écrivez à ${address}.`,
    copyAddress: "Copier l'adresse",
    copied: "Copiée",
    moods: { love: "J'adore", ok: "Correct", meh: "Bof" },
    categories: { idea: "Idée", bug: "Bug", love: "Compliment", other: "Autre" },
  },

  apiKey: {
    eyebrow: "CLÉ D'ACCÈS",
    title: (provider) => `Clé ${provider}`,
    sub: "Votre clé reste chiffrée sur cette machine, jamais envoyée au modèle.",
    alreadySaved: (provider) =>
      `Une clé ${provider} est déjà enregistrée. En coller une nouvelle la remplacera.`,
    connectTip: (brand, provider) =>
      `${brand} se connecte à votre compte ${provider} et utilise ses crédits et son quota.`,
    authorizing: "Autorisation dans votre navigateur…",
    getNewKey: "Obtenir une nouvelle clé",
    getFreeKey: "Obtenir une clé gratuitement",
    orPaste: "ou collez une clé existante",
    whereToFind: (provider) => `Où trouver votre clé ${provider}`,
    getMyKey: "Obtenir ma clé →",
    keyLabel: (provider) => `Clé ${provider}`,
    getOne: "en obtenir une ↗",
    removeKey: "Retirer la clé",
    keyPlaceholderFallback: (provider) => `Votre clé ${provider}`,
    saveAndSend: "Enregistrer et envoyer",
    replaceKey: "Remplacer la clé",
    connectIncomplete: "Connexion non terminée. Rien n'a été enregistré. Réessayez.",
    connectUnreachable: "Connexion impossible. Réessayez dans un instant.",
  },

  debug: {
    emptyFiltered: "Aucune entrée ne correspond à ce filtre.",
    empty: "Aucune entrée. Envoyez un message avec le mode débogage activé.",
    eyebrow: "DÉVELOPPEUR",
    title: "Journal de débogage",
    subLead: "Ce qui a réellement été envoyé et reçu pour ",
    thisConversation: "cette conversation",
    subCount: (n) => ` — ${n} entrée${n > 1 ? "s" : ""}.`,
    searchPlaceholder: "Rechercher (valeur réelle ou masquée, outil, erreur…)",
    clearSearch: "Effacer",
    copyFullTip:
      "Copie le journal complet, avec la correspondance masqué → original (valeurs réelles, à ne pas partager)",
    copyFull: "Copier avec valeurs réelles",
    copyNoMapTip:
      "Copie le journal sans la correspondance masqué → original (aucune valeur réelle). Vous pouvez le partager.",
    copyNoMap: "Copier sans valeurs réelles",
    copied: "Copié",
    clearTip: "Vider le journal de cette conversation",
    clear: "Vider",
    sendToDevsTip:
      "Ouvre « Votre avis » avec le journal joint, sans la correspondance. Vous le relisez avant l'envoi.",
    sendToDevs: "Envoyer au support",
    copyEntry: "Copier cette entrée",
    tabs: { all: "Tout", phase: "Étapes", wire: "Requêtes", turn: "Échanges", tool: "Outils", error: "Erreurs" },
  },

  guide: {
    helpCenter: "Centre d'aide complet",
    themes: "Thèmes du guide",
    noReleases: "Aucune note de version publiée pour le moment.",
  },

  importSkills: {
    eyebrow: "DEPUIS CLAUDE",
    title: "Importer mes compétences",
    sub: (source) =>
      `Celles que ${source} garde sur cet appareil, ou un dossier que vous déposez ici. Rien n'est envoyé hors de cet appareil, et rien n'est modifié chez Claude.`,
    reading: "Lecture des compétences…",
    dropTitle: "Déposez vos compétences ici",
    nothingFound: "Rien trouvé automatiquement sur cet appareil.",
  },

  modelAccess: {
    eyebrow: "ACCÈS AUX MODÈLES",
    titleKey: "Ce modèle demande votre clé",
    titleCreditsSold: "Ce modèle demande un abonnement",
    titleCreditsClosed: "Ce modèle n'est pas disponible sur votre compte",
    titleFree: "Gratuit, avec des limites",
    thisProvider: "Ce fournisseur",
    leadUnserved: (provider) =>
      `${provider} demande votre propre clé API. Cette version n'a pas de service hébergé. Vous pouvez aussi utiliser un modèle local ou la CLI de votre abonnement.`,
    leadKey: (provider) => `${provider} demande votre propre clé API. Vous pouvez aussi choisir un autre modèle.`,
    leadCreditsSold: (brand) => `Ce modèle passe par ${brand}, et votre compte n'a plus de crédits.`,
    leadCreditsClosed: (brand) =>
      `Ce modèle passe par ${brand}, et il n'est pas disponible sur votre compte pour le moment.`,
    leadFreeSold: (brand) =>
      `Les modèles gratuits n'utilisent pas vos crédits. Il suffit d'être connecté à ${brand}, sans abonnement. Débit et disponibilité dépendent du fournisseur.`,
    leadFreeServed: (brand) =>
      `Un modèle gratuit est inclus avec votre compte ${brand}, sans clé. Débit et disponibilité dépendent du fournisseur.`,
    freeModels: "Les modèles gratuits",
    includedModels: "Les modèles inclus",
    freeDescSold: (brand) =>
      `Inclus avec votre compte ${brand}, sans abonnement ni clé. Usage limité. Sélectionné par défaut.`,
    freeDescServed: (brand) =>
      `Servis sur votre compte ${brand}, sans clé à gérer. Un modèle gratuit est sélectionné par défaut. Son débit dépend du fournisseur.`,
    subscription: (brand) => `Un abonnement ${brand}`,
    subscriptionDesc: (brand) =>
      `Les modèles fournis par ${brand}, sans clé à gérer. Vos crédits mensuels paient l'usage.`,
    subscriptionCovers: "Votre abonnement couvre déjà ces modèles",
    subscriptionCoversDesc: "Choisissez un modèle non gratuit.",
    ownKey: "Votre propre clé",
    ownKeyDesc: (soldSuffix) =>
      `Ajoutez votre clé OpenAI, Anthropic, Mistral… : votre fournisseur vous facture${soldSuffix}. La protection est la même.`,
    ownKeyWithoutCredits: ", sans utiliser vos crédits",
    ownKeyStatic: "Ajoutez-la avec le bouton de son fournisseur, en haut de cette page.",
    openRouterNote: (brand) =>
      `Cas particulier : dans le catalogue étendu OpenRouter, seuls les modèles proposés par ${brand} fonctionnent sans clé. Les autres demandent votre propre clé OpenRouter.`,
  },

  searchRows: {
    goTo: "Aller à",
    files: "Fichiers",
    settings: "Réglages",
    generating: "Génération en cours",
  },

  redactionRules: {
    eyebrow: "MASQUAGE",
    titleLead: "Règles de ",
    titleHighlight: "masquage",
    sub: "Pour cette conversation : les catégories activées sont remplacées par des valeurs de substitution avant qu'un modèle ne voie vos messages.",
    defaultLevelLink: "Modifier le niveau par défaut dans Réglages → Confidentialité",
    memoryTitle: "Mémoire dans cette conversation",
    memoryDesc: (brand) =>
      `Désactivée : votre mémoire n'est pas envoyée avec vos messages, le modèle ne peut pas la consulter, et ${brand} n'y enregistre rien de lui-même. « Retiens que… » fonctionne toujours.`,
    done: "Terminé",
  },
} satisfies Messages["modals"];
