/**
 * The FR catalogue's « shell » slice — the SOURCE language : le rail droit, les onglets de
 * panel tabs, the folder tree and the phone screens.
 */
import type { Messages } from "../messages";

export const shell = {
  rightRail: {
    ariaLabel: "Navigateur, dossiers et aide",
    title: "Panneau droit",
    collapse: "Réduire la barre",
    expand: "Agrandir la barre",
    newBrowserTab: "Nouvel onglet navigateur",
    browser: "Navigateur",
    web: "Web",
    noTabs: "Aucun onglet ouvert.",
    foldersTip: "Dossiers et stockage connecté — ouvrir le panneau",
    folders: "Dossiers et stockage connecté",
    collapseItem: (label) => `Replier — ${label}`,
    closeItem: (label) => `Fermer — ${label}`,
    driven: "Navigateur piloté",
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
    addFolder: "Autoriser un dossier de plus",
    connectedStorage: "Stockage connecté",
    cloud: "Cloud",
    accountFailed: "Ce compte n'a pas pu être listé — repliez puis rouvrez pour réessayer",
    folderFailed: "Ce dossier n'a pas pu être lu — repliez puis rouvrez pour réessayer",
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
    redactedCount: (n) => `${n} élément${n > 1 ? "s" : ""} redacted${n > 1 ? "s" : ""}`,
    library: {
      filesOrImages: "Fichiers ou images",
      files: "Fichiers",
      images: "Images",
      noImages: "Aucune image.",
      noFiles: "Aucun fichier.",
      emptySub: "Les pièces jointes de vos conversations atterrissent ici, déjà redacted.",
      fileActions: "Actions du fichier",
      rowActions: (name) => `Actions — ${name}`,
      deleteTitle: "Supprimer ce fichier ?",
      deleteBody: (name) =>
        `« ${name} » sera définitivement supprimé de la bibliothèque (fichier original + version redacted). Cette action est irréversible.`,
      redactedData: (n) => `${n} donnée${n > 1 ? "s" : ""} redacted${n > 1 ? "s" : ""}`,
      hasRedacted: "Contient des données redacted",
    },
    memory: {
      sub: (brand, count) =>
        `Ce que ${brand} retient d'une conversation à l'autre — ${count} élément${count === 1 ? "" : "s"}. Tout reste sur votre machine et part redacted.`,
      profile: "Profil",
      profilePlaceholder: (brand) => `Qui vous êtes et ce que ${brand} doit garder en tête.`,
      autoExtract: (brand) =>
        `Extraction automatique — ${brand} note seul les faits durables, à partir du texte déjà redacted.`,
      empty: "Rien en mémoire pour l'instant.",
      emptySub: "Dites « retiens que… » dans une conversation, ou ajoutez une fiche ci-dessous.",
      newCard: "Nouvelle fiche",
      addTo: (category) => `Ajouter à ${category}`,
      addSheet: "Ajouter un souvenir",
      addToCategory: (category) => `Ajouter à « ${category} »`,
      newMemory: "Nouveau souvenir…",
      memoryName: "Nom du souvenir",
      add: "Ajouter",
      memorySheet: "Souvenir",
      notedBy: (brand) => `noté par ${brand}`,
      factsPlaceholder: "Ce qu'il faut retenir — un fait durable, pas une conversation.",
      facts: "Faits",
      removeFromMemory: "Supprimer de la mémoire",
      profileSheet: "Profil de mémoire",
      profileTextPlaceholder:
        "Ex. Consultant indépendant, clients PME, répond en français, ton direct.",
    },
    settings: {
      backToSettings: "Retour aux réglages",
      orgSuffix: (org) => `${org} · Organisation`,
      help: "Aide",
    },
  },
} satisfies Messages["shell"];
