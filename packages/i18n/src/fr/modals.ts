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
      `${n} information${n === 1 ? "" : "s"} remplacée${n === 1 ? "" : "s"} avant d'atteindre ${modelName}. À gauche votre texte, à droite ce qui est parti.`,
    theModel: "le modèle",
    close: "Fermer",
    empty:
      "Rien de sensible n'a été détecté dans cette conversation : le modèle a reçu vos messages tels quels.",
    youWrote: "Ce que vous avez écrit",
    youRead: "Ce que vous lisez",
    modelReceived: "Ce que le modèle a reçu",
    modelWrote: "Ce que le modèle a écrit",
    yourMessage: "Votre message",
    reply: "Réponse",
    swapped: (n) => `${n} remplacement${n === 1 ? "" : "s"}`,
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
    restarting: "Redémarrage…",
    restartingHint:
      "L'app se ferme et se relance d'elle-même dans quelques secondes — inutile de la rouvrir à la main.",
    restartSlow:
      "C'est plus long que prévu. Vous pouvez quitter l'app vous-même : la mise à jour s'applique à la prochaine ouverture.",
    retry: "Réessayer",
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

  feedback: {
    title: "Votre avis",
    sub: "Dites-nous ce qui marche — ou ce qui coince. On lit tout.",
    thanks: "Merci !",
    thanksWithLog:
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
      "Le texte parti au modèle (déjà masqué), les outils et les erreurs — sans la table de correspondance, donc aucune valeur réelle. Aperçu ci-dessous.",
    confidential: "Confidentiel",
    sendMail: "Ouvrir dans votre messagerie",
    mailDone:
      "Votre messagerie s'est ouverte, le message est prêt — il part quand vous l'envoyez.",
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
      `${brand} se connecte à votre compte ${provider} : vos crédits, votre quota.`,
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
    connectIncomplete: "Connexion non terminée. Réessayez — rien n'a été enregistré.",
    connectUnreachable: "Connexion impossible. Réessayez dans un instant.",
  },

  debug: {
    eyebrow: "DÉVELOPPEUR",
    title: "Journal de débogage",
    subLead: "Ce qui a réellement été envoyé et reçu pour ",
    thisConversation: "cette conversation",
    subCount: (n) => ` — ${n} entrée${n > 1 ? "s" : ""}.`,
    searchPlaceholder: "Rechercher (valeur réelle ou masquée, outil, erreur…)",
    clearSearch: "Effacer",
    copyFullTip:
      "Copie le journal complet, mapping masqué → original inclus (valeurs réelles — pour vos yeux)",
    copyFull: "Copier (réel)",
    copyNoMapTip:
      "Copie le journal SANS le mapping masqué → original (aucune valeur réelle) — sûr à partager",
    copyNoMap: "Sans mapping",
    copied: "Copié",
    clearTip: "Vider le journal de cette conversation",
    clear: "Vider",
    sendToDevsTip:
      "Ouvre « Votre avis » avec le journal SANS mapping joint — vous le voyez avant l'envoi",
    sendToDevs: "Envoyer aux devs",
    copyEntry: "Copier cette entrée",
    tabs: { all: "Tout", phase: "Étapes", wire: "Wire", turn: "Échanges", tool: "Outils", error: "Erreurs" },
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
      `Celles que ${source} garde sur cet appareil, ou un dossier que vous déposez ici. Rien ne sort de la machine, et rien n'est modifié chez Claude.`,
    reading: "Lecture des compétences…",
    dropTitle: "Déposez vos compétences ici",
    nothingFound: "Rien trouvé automatiquement sur cet appareil.",
  },

  modelAccess: {
    eyebrow: "ACCÈS AUX MODÈLES",
    titleKey: "Ce modèle demande votre clé",
    titleCreditsSold: "Ce modèle demande un abonnement",
    titleCreditsClosed: "Ce modèle n'est pas ouvert sur votre compte",
    titleFree: "Gratuit, avec des limites",
    thisProvider: "Ce fournisseur",
    leadUnserved: (provider) =>
      `${provider} s'utilise avec votre propre clé. Cette version n'a pas de service hébergé : un modèle local ou votre CLI d'abonnement sont les autres chemins.`,
    leadKey: (provider) => `${provider} s'utilise avec votre propre clé — ou choisissez un autre modèle.`,
    leadCreditsSold: (brand) => `Ce modèle passe par ${brand}, et votre compte n'a plus de crédits.`,
    leadCreditsClosed: (brand) =>
      `Ce modèle passe par ${brand}, et il n'est pas disponible sur votre compte pour le moment.`,
    leadFreeSold: (brand) =>
      `Un modèle gratuit n'entame pas vos crédits : compte ${brand} connecté, sans abonnement — mais débit et disponibilité dépendent du fournisseur.`,
    leadFreeServed: (brand) =>
      `Un modèle gratuit est inclus avec votre compte ${brand}, sans clé — mais débit et disponibilité dépendent du fournisseur.`,
    freeModels: "Les modèles gratuits",
    includedModels: "Les modèles inclus",
    freeDescSold: (brand) =>
      `Inclus avec votre compte ${brand}, sans abonnement et sans clé. Usage limité — c'est ce qui est déjà sélectionné par défaut.`,
    freeDescServed: (brand) =>
      `Servis sur votre compte ${brand}, sans clé à gérer. Un modèle gratuit est déjà sélectionné par défaut ; son débit dépend du fournisseur.`,
    subscription: (brand) => `Un abonnement ${brand}`,
    subscriptionDesc: (brand) =>
      `Les modèles fournis par ${brand}, sans aucune clé à gérer : vos crédits mensuels paient l'usage.`,
    subscriptionCovers: "Votre abonnement couvre déjà ces modèles",
    subscriptionCoversDesc: "Choisissez simplement un modèle non gratuit — rien d'autre à faire.",
    ownKey: "Votre propre clé",
    ownKeyDesc: (soldSuffix) =>
      `Branchez votre clé OpenAI, Anthropic, Mistral… : c'est votre fournisseur qui vous facture${soldSuffix}. La protection est la même.`,
    ownKeyWithoutCredits: ", sans passer par vos crédits",
    ownKeyStatic: "Renseignez-la depuis la puce de son fournisseur, en haut de cette page.",
    openRouterNote: (brand) =>
      `Cas particulier : dans le catalogue étendu OpenRouter, seuls les modèles proposés par ${brand} passent sans clé — les autres demandent votre propre clé OpenRouter.`,
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
    sub: "Pour cette conversation : les catégories activées sont retirées de vos messages avant qu'un modèle ne les voie.",
    defaultLevelLink: "Modifier le niveau par défaut dans Réglages → Confidentialité",
    memoryTitle: "Mémoire dans cette conversation",
    memoryDesc: (brand) =>
      `Coupée : rien de votre mémoire n'accompagne les envois d'ici, le modèle ne peut pas la consulter, et ${brand} n'y note rien de lui-même. « Retiens que… » reste possible — c'est votre demande.`,
    done: "Terminé",
  },
} satisfies Messages["modals"];
