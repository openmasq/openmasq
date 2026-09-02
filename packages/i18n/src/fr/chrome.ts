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
  memoryFresh: "Mémoire — nouveaux souvenirs notés",
  privacyReportTip: (n) => `${n} élément(s) protégé(s) — rapport de confidentialité`,
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
  helpTip: (brand) => `Aide — prendre en main ${brand}`,
  sendFeedback: "Envoyer un avis",
  updateReady: (version) => `Mise à jour ${version}`,
  updateReadyTip: (brand, version) => `${brand} ${version} est prête — voir les nouveautés et redémarrer`,
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
  closeTab: "Fermer l'onglet",
  hiddenTabsTip: (n) => `${n} onglet${n > 1 ? "s" : ""} hors de vue — faire défiler`,
  hiddenTabs: (n) => `${n} onglet${n > 1 ? "s" : ""} hors de vue`,
  splitScreen: "Diviser l'écran",
  splitLeft: "À gauche",
  splitRight: "À droite",
  redactionSummary: (n) =>
    `Catégories de cette conversation · ${n} protégé${n === 1 ? "" : "s"}`,
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

  editSkill: "Éditer la compétence",
  slotsToFill: "À préciser dans votre message",
  removeTool: "Retirer l'outil",
  memoryHint: "Sera noté en mémoire",
  memoryHintTip:
    "Demande explicite de retenir — le fait durable sera noté dans la Mémoire (local, chiffré)",

  keepInClearTip:
    "Envoyer ces valeurs telles quelles pour ce message — le modèle verra les vraies",
  dismissWarning: "Masquer cet avertissement",

  add: "Ajouter",
  addFile: "Fichier",
  attachFile: "Joindre un fichier",
  addFolder: "Dossier",
  addFolderTip: "Autoriser un dossier de cet ordinateur (sélecteur système)",
  addConnector: "Connecteur",
  addConnectorTip: "Connecter un service (Réglages → Connecteurs)",
  addSkill: "Compétence",
  useSkill: "Utiliser une compétence",
  stop: "Arrêter",
  send: "Envoyer",
  redacting: "Masquage",
  redactingAria: "Masquage en cours",
  redacted: "Masqué",

  detect: {
    partialNone: "analyse incomplète",
    partialNoneHint:
      "L'analyse approfondie n'a pas pu finir sur ce texte. L'envoi la refait entièrement — rien ne part sans être analysé.",
    partialCount: (n) => `au moins ${n} à masquer`,
    partialCountHint:
      "Le décompte est partiel : l'analyse approfondie n'a pas pu finir sur un texte de cette taille. L'envoi la refait entièrement, avec plus de temps — il y aura donc au moins ce nombre.",
    uncertain: "Détection incertaine — masqué par défaut. Cliquez pour laisser en clair.",
    toVerify: "à vérifier",
    showAll: "Afficher toutes les détections",
    more: (n) => `+${n} autres`,
    collapseTip: "Replier la liste",
    collapse: "Replier",
  },

  longText: {
    openTip: "Ouvrir l'éditeur (texte long)",
    summary: (chars, lines) =>
      `Texte long — ${chars.toLocaleString("fr-FR")} caractères · ${lines.toLocaleString("fr-FR")} lignes`,
    edit: "Éditer",
  },

  modal: {
    title: "Éditer le message",
    sub: "Le texte long s'édite ici — le masquage reste visible en direct ; l'envoi se fait depuis la zone de saisie.",
    tabEdit: "Éditer",
    tabPreview: "Aperçu",
    toMask: (n) => `${n} à masquer`,
    mirrorOff: (max) =>
      `Surlignage en direct suspendu au-delà de ${max.toLocaleString("fr-FR")} caractères (pour garder la frappe fluide) — la détection et la protection à l'envoi restent inchangées, les étiquettes ci-dessous restent actives.`,
    done: "Terminé",
  },

  attachments: {
    open: "consulter le fichier",
    processing: "fichier en cours de traitement",
    redacting: "Masquage en cours…",
    stateReading: "Lecture…",
    stateReadingPage: (page, total) => `Lecture · page ${page}/${total}`,
    stateMasking: "Masquage…",
    stateMaskingPct: (pct) => `Masquage · ${pct} %`,
    stateRedo: "À refaire",
    stateReady: (n) => `${n} valeur${n > 1 ? "s" : ""}`,
    staleTip: "Masqué avec vos anciens réglages — remasquer pour appliquer les réglages actuels",
    partialTip: (read, total) => `${read} pages lues sur ${total} — le reste n'est ni lu ni masqué`,
    readAllPages: (total) => `Lire les ${total} pages`,
    readAllPagesTip: (read) =>
      `Seules les ${read} premières pages ont été lues (et donc masquées). Relire le document en entier — quelques secondes par page.`,
    retryRedaction: "Réessayer le masquage",
    reRedact: "Remasquer",
    reRedactTip: "Remasquer (moteur de masquage modifié)",
    remove: "Supprimer",
  },

  drop: {
    title: "Déposez ici",
    sub: "Un fichier est joint au message ; un dossier vous est proposé à l'autorisation.",
    close: "Fermer",
    folderDialog: "Autoriser un dossier",
  },
} satisfies Messages["composer"];
