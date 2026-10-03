/**
 * The FR catalogue's « chrome » slice — the SOURCE language.
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/chrome.ts`), no more and no less, slice by slice — so a forgotten
 * key names ITS slice rather than the whole catalogue.
 */
import type { Messages } from "../messages";

export const chrome = {
  expandSidebar: "Agrandir la barre latérale",
  newChat: "Nouvelle conversation",
  search: "Rechercher",
  searchShortcut: "Rechercher (⌘K)",
  memoryFresh: "Mémoire mise à jour",
  privacyReportTip: (n) => `${n} élément(s) masqué(s) · Rapport de confidentialité`,
  privacyReport: "Rapport de confidentialité",
  account: "Compte et réglages",
  conversations: "Conversations",
  noConversations: "Aucune conversation pour le moment.",
  you: "Vous",
  privateSpace: "Espace privé",
  private: "Privé",
  launchPinned: (what) => `Lancer : ${what}`,
  deleteConversationAction: "Supprimer la conversation",
  deleteConversation: "Supprimer cette conversation ?",
  deleteConversationBody: (title) =>
    `« ${title} » et tous ses messages seront supprimés de cet appareil. Cette action est définitive.`,
  untitledConversation: "Nouvelle conversation",
  groups: {
    today: "Aujourd'hui",
    yesterday: "Hier",
    last7: "7 derniers jours",
    last30: "30 derniers jours",
  },
  justNow: "à l'instant",
  help: "Aide",
  helpTip: (brand) => `Aide : prendre en main ${brand}`,
  sendFeedback: "Envoyer un avis",
  updateReady: (version) => `Mettre à jour (${version})`,
  updateReadyTip: (brand, version) => `${brand} ${version} est prête. Voir les nouveautés et redémarrer.`,
  guideEyebrow: "Aide",
  guideTitle: (brand) => `Prendre en main ${brand}`,
  guideUnderstood: "J'ai compris",
  releaseKinds: { feat: "Nouveautés", imp: "Améliorations", fix: "Corrections" },
} satisfies Messages["chrome"];

export const chat = {
  backToConversations: "Retour aux conversations",
  toggleSidebar: "Basculer la barre latérale",
  more: "Plus",
  rowActions: "Actions",
  rename: "Renommer",
  renameConversation: "Renommer la conversation",
  generating: "Génération en cours",
  preparingFiles: "Fichiers en cours de lecture ou de masquage",
  closeTab: "Fermer l'onglet",
  hiddenTabsTip: (n) => `${n} onglet${n > 1 ? "s" : ""} hors de vue (faire défiler)`,
  hiddenTabs: (n) => `${n} onglet${n > 1 ? "s" : ""} hors de vue`,
  splitScreen: "Diviser l'écran",
  splitLeft: "À gauche",
  splitRight: "À droite",
  redactionSummary: (n) =>
    `Masqué dans cette conversation · ${n} élément${n === 1 ? "" : "s"}`,
  seeWhatTheModelSaw: "Voir ce que le modèle a vu",
  debugLog: "Journal de débogage",
} satisfies Messages["chat"];

export const composer = {
  redactLevel: "Niveau de masquage",
  currentLevel: "Niveau actuel",
  redactLevelTip: (level, scope) => `Niveau de masquage · ${level} (${scope})`,
  scopeShortConversation: "cette conversation",
  scopeShortDefault: "par défaut",
  scopeConversation:
    "Pour cette conversation seulement. Le niveau par défaut se règle dans Réglages → Confidentialité.",
  scopeDefault: "Aucune conversation ouverte : ce choix devient votre niveau par défaut.",
  reducedTip: "Protection réduite",
  forcedNote: (n) =>
    `${n} catégorie${n > 1 ? "s" : ""} imposée${n > 1 ? "s" : ""} par votre organisation, quel que soit le niveau.`,
  applied: (level, scope) => `${level} · ${scope}`,
  undo: "Annuler",
  protectionLevel: "Niveau de protection",

  placeholder: (brand) => `Message à ${brand}…`,

  editSkill: "Modifier la compétence",
  slotsToFill: "À préciser dans votre message",
  removeTool: "Retirer l'outil",
  memoryHint: "Sera enregistré dans la Mémoire",
  memoryHintTip:
    "Vous avez demandé de retenir ceci. Ce sera enregistré dans la Mémoire (sur cet appareil, chiffré).",

  keepInClearTip:
    "Envoyer ces valeurs non masquées dans ce message. Le modèle voit les vraies valeurs.",
  dismissWarning: "Cacher cet avertissement",

  add: "Ajouter",
  addFile: "Fichier",
  attachFile: "Joindre un fichier",
  addFolder: "Dossier",
  addFolderTip: "Autoriser l'accès à un dossier de cet ordinateur",
  addConnector: "Connecteur",
  addConnectorTip: "Connecter un service (Réglages → Connecteurs)",
  addSkill: "Compétence",
  useSkill: "Utiliser une compétence",
  stop: "Arrêter",
  send: "Envoyer",
  redacting: "Masquage",
  redactingAria: "Masquage en cours",
  redacted: "Masqué",
  reading: "Lecture",
  readingAria: "Lecture des fichiers en cours",

  detect: {
    partialNone: "analyse incomplète",
    partialNoneHint:
      "L'analyse n'a pas pu finir sur ce texte. Elle est relancée en entier à l'envoi.",
    partialCount: (n) => `au moins ${n} à masquer`,
    partialCountHint:
      "Décompte partiel : l'analyse n'a pas pu finir sur un texte aussi long. Elle est relancée en entier à l'envoi.",
    uncertain: "Détection incertaine, masquée par défaut. Cliquez pour l'envoyer non masquée.",
    toVerify: "à vérifier",
    showAll: "Afficher toutes les détections",
    more: (n) => `+${n} autres`,
    collapseTip: "Replier la liste",
    collapse: "Replier",
  },

  intent: {
    skill: (name) => `Compétence : ${name}`,
    routine: (name) => `Routine : ${name}`,
    sentWith: "Envoyée avec votre message",
    clickToEdit: " · cliquez le nom pour modifier",
  },

  utilityRisk: {
    age: "La réponse dépend d'une date masquée : un âge ou un délai calculé peut être décalé.",
    world: "Le modèle ne connaît pas l'entreprise sous son nom d'emprunt : il ne peut rien savoir d'elle.",
    geo: "Distances et proximités sont calculées sur des lieux d'emprunt : le résultat ne veut rien dire.",
  },

  longText: {
    openTip: "Ouvrir l'éditeur (texte long)",
    summary: (chars, lines) =>
      `Texte long — ${chars.toLocaleString("fr-FR")} caractères · ${lines.toLocaleString("fr-FR")} lignes`,
    edit: "Modifier",
    undoTip: "Ctrl+Z ou ⌘Z pour annuler le collage",
  },

  modal: {
    title: "Modifier le message",
    sub: "Modifiez ici un texte long. Les valeurs à masquer sont surlignées pendant la frappe. L'envoi se fait depuis la zone de saisie.",
    tabEdit: "Modifier",
    tabPreview: "Aperçu",
    toMask: (n) => `${n} à masquer`,
    mirrorOff: (max) =>
      `Surlignage en direct désactivé au-delà de ${max.toLocaleString("fr-FR")} caractères, pour garder la frappe fluide. Le masquage s'applique toujours en entier à l'envoi.`,
    done: "Terminé",
  },

  attachments: {
    open: "consulter le fichier",
    processing: "fichier en cours de traitement",
    redacting: "Masquage en cours…",
    stateReading: "Lecture…",
    stateQueued: (ahead) => `En attente · ${ahead} avant`,
    stateMaskQueued: (ahead) => `Masquage en attente · ${ahead} avant`,
    stateReadingPage: (page, total) => `Lecture · page ${page}/${total}`,
    stateMasking: "Masquage…",
    stateMaskingPct: (pct) => `Masquage · ${pct} %`,
    stateMaskingLong: (pct, minutes) => `Masquage · ${pct} % · environ ${minutes} min`,
    maskingLong: (minutes) => `Document long : masquage en cours, environ ${minutes} min`,
    tooLongToMask: (pages) =>
      `Document trop long pour être masqué en entier (≈ ${pages} pages). Découpez-le en plusieurs parties.`,
    stateRedo: "Action requise",
    stateReady: (n) => `${n} valeur${n > 1 ? "s" : ""}`,
    staleTip: "Masqué avec vos anciens réglages. Remasquez pour appliquer les réglages actuels.",
    partialTip: (read, total) => `${read} pages lues sur ${total}. Les autres pages ne sont ni lues ni masquées.`,
    readAllPages: (total) => `Lire les ${total} pages`,
    readAllPagesTip: (read) =>
      `Seules les ${read} premières pages ont été lues (et donc masquées). Lire le document en entier (quelques secondes par page).`,
    retryRedaction: "Réessayer le masquage",
    reRedact: "Remasquer",
    reRedactTip: "Remasquer (le masquage a été mis à jour)",
    remove: "Supprimer",
    summaryFiles: (n) => `${n} fichier${n > 1 ? "s" : ""}`,
    summaryReading: (n) => `${n} en lecture`,
    summaryMasking: (n) => `${n} en masquage`,
    summaryUnreadable: (n) => `${n} illisible${n > 1 ? "s" : ""}`,
    removeAll: "Tout retirer",
    removeAllConfirm: (n) => `Retirer les ${n} fichiers de ce message ?`,
    extractFailed: "Lecture impossible",
    rereadFailed: "Relecture impossible. Le texte lu avant est conservé.",
    fileRefused: "Fichier refusé",
  },

  drop: {
    title: "Déposez ici",
    sub: "Un fichier est joint au message. Pour un dossier, votre autorisation est demandée.",
    close: "Fermer",
    folderDialog: "Autoriser l'accès à un dossier",
  },
} satisfies Messages["composer"];
