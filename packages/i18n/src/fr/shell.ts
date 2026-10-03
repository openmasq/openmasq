/**
 * The FR catalogue's « shell » slice — the SOURCE language: the right rail, the
 * panel tabs, the folder tree and the phone screens.
 */
import type { Messages } from "../messages";

export const shell = {
  rightRail: {
    ariaLabel: "Navigateur, dossiers et aide",
    title: "Panneau droit",
    collapse: "Replier la barre",
    expand: "Déplier la barre",
    newBrowserTab: "Nouvel onglet navigateur",
    browser: "Navigateur",
    web: "Web",
    noTabs: "Aucun onglet ouvert.",
    foldersTip: "Ouvrir les dossiers et le stockage connecté",
    folders: "Dossiers et stockage connecté",
    collapseItem: (label) => `Replier — ${label}`,
    closeItem: (label) => `Fermer — ${label}`,
    driven: "L'assistant utilise le navigateur",
  },
  notice: {
    offlineBody: (brand) =>
      `Connexion à ${brand} perdue. Vos conversations restent accessibles. Reconnexion…`,
    reconnectOne: (name) => `Reconnexion nécessaire : ${name}`,
    reconnectMany: (count) => `Reconnexion nécessaire : ${count} connecteurs`,
    reconnectOneBody: "Ce connecteur a été déconnecté. Reconnectez-le dans Réglages.",
    reconnectManyBody: (names) => `Déconnectés : ${names}.`,
    reconnect: "Reconnecter",
    accessBodySold: (brand) =>
      `Pour utiliser tous les modèles, prenez un abonnement ${brand} ou ajoutez votre propre clé API.`,
    accessBody: "Pour utiliser tous les modèles, ajoutez votre propre clé API.",
    seeAccess: "Voir mes accès",
  },
  panelTabs: {
    sidePanel: "Panneau latéral",
    closeTab: "Fermer l'onglet",
    openFile: "Ouvrir un fichier",
    openFileTip: "Ouvrir un fichier de la bibliothèque",
  },
  folders: {
    onThisDevice: "Sur cet appareil",
    local: "Local",
    manageFolders: "Gérer les dossiers autorisés",
    noFolders: "Aucun dossier autorisé pour l'instant.",
    storedIn: (folder) => `dans ${folder}`,
    storedOnDisk: "sur votre disque",
    sourceConnectedTip: (name) => `${name} : connecté, accessible au modèle. Ouvrir ses réglages.`,
    sourceDisconnectedTip: (name) => `${name} : non connecté. Se connecter.`,
    addFolder: "Ajouter un dossier",
    connectedStorage: "Stockage connecté",
    cloud: "Cloud",
    accountFailed: "Impossible de lister ce compte. Repliez-le puis rouvrez-le pour réessayer.",
    folderFailed: "Impossible de lire ce dossier. Repliez-le puis rouvrez-le pour réessayer.",
    askAbout: (name) => `Demander à propos de ${name}`,
    ask: "Demander",
    sourceLabel: (service, account) => `${service}${account ? ` — ${account}` : ""}`,
  },
  mobile: {
    accountAndSettings: "Compte et réglages",
    searchConversation: "Rechercher une conversation…",
    searchConversationAria: "Rechercher une conversation",
    noMatch: "Aucune conversation ne correspond.",
    emptyConversation: "Conversation vide",
    redactedCount: (n) => `${n} élément${n > 1 ? "s" : ""} masqué${n > 1 ? "s" : ""}`,
    library: {
      filesOrImages: "Fichiers ou images",
      files: "Fichiers",
      images: "Images",
      noImages: "Aucune image.",
      noFiles: "Aucun fichier.",
      emptySub: "Les pièces jointes de vos conversations apparaissent ici, déjà masquées.",
      fileActions: "Actions du fichier",
      rowActions: (name) => `Actions — ${name}`,
      deleteTitle: "Supprimer ce fichier ?",
      deleteBody: (name) =>
        `« ${name} » sera définitivement supprimé de la bibliothèque (fichier original et version masquée). Cette action est irréversible.`,
      redactedData: (n) => `${n} donnée${n > 1 ? "s" : ""} masquée${n > 1 ? "s" : ""}`,
      hasRedacted: "Contient des données masquées",
    },
    memory: {
      sub: (brand, count) =>
        `Ce que ${brand} retient d'une conversation à l'autre : ${count} élément${count === 1 ? "" : "s"}. Tout reste sur votre appareil et est masqué avant l'envoi.`,
      profile: "Profil",
      profilePlaceholder: (brand) => `Qui vous êtes et ce que ${brand} doit garder en tête.`,
      autoExtract: (brand) =>
        `Extraction automatique : ${brand} note les informations à retenir à partir du texte déjà masqué.`,
      empty: "Rien en mémoire pour l'instant.",
      emptySub: "Dites « retiens que… » dans une conversation, ou ajoutez une fiche ci-dessous.",
      newCard: "Nouvelle fiche",
      addTo: (category) => `Ajouter à ${category}`,
      addSheet: "Ajouter une fiche",
      addToCategory: (category) => `Ajouter à « ${category} »`,
      newMemory: "Nouvelle fiche…",
      memoryName: "Nom de la fiche",
      add: "Ajouter",
      memorySheet: "Fiche mémoire",
      notedBy: (brand) => `noté par ${brand}`,
      factsPlaceholder: "Ce qu'il faut retenir : un fait durable, pas une conversation.",
      facts: "Faits",
      removeFromMemory: "Supprimer de la mémoire",
      profileSheet: "Profil de mémoire",
      profileTextPlaceholder:
        "Ex. Avocat collaborateur en contentieux, clients entreprises, réponses concises, ton direct.",
    },
    settings: {
      backToSettings: "Retour aux réglages",
      orgSuffix: (org) => `${org} · Organisation`,
      help: "Aide",
    },
  },
} satisfies Messages["shell"];
