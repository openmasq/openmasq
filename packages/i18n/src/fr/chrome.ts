/**
 * The FR catalogue's « chrome » slice — the SOURCE language.
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/chrome.ts`), no more and no less, slice by slice — so a forgotten
 * key names ITS slice rather than the whole catalogue.
 */
import type { Messages } from "../messages";

export const chrome = {
  expandSidebar: "Développer la barre latérale",
  newChat: "Nouvelle conversation",
  search: "Rechercher",
  searchShortcut: "Rechercher (⌘K)",
  memoryFresh: "Mémoire — nouveaux souvenirs notés",
  privacyReportTip: (n) => `${n} élément(s) protégé(s) — rapport de confidentialité`,
  privacyReport: "Rapport de confidentialité",
  account: "Compte et paramètres",
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
  redactionSummary: (n) => `Redaction · ${n} protégé${n === 1 ? "" : "s"}`,
  seeWhatTheModelSaw: "Voir ce que le modèle a vu",
  debugLog: "Journal de débogage",
} satisfies Messages["chat"];

export const composer = {
  redactLevel: "Niveau de redaction",
  currentLevel: "Niveau actuel",
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

  useSkill: "Utiliser une compétence",
  attachFile: "Joindre un fichier",
  stop: "Arrêter",
  send: "Envoyer",
  redacting: "Redaction",
  redactingAria: "Redaction en cours",
  redacted: "Redacted",

  detect: {
    partialNone: "analyse incomplète",
    partialNoneHint:
      "L'analyse approfondie n'a pas pu finir sur ce texte. L'envoi la refait entièrement — rien ne part sans être analysé.",
    partialCount: (n) => `au moins ${n} à redact`,
    partialCountHint:
      "Le décompte est partiel : l'analyse approfondie n'a pas pu finir sur un texte de cette taille. L'envoi la refait entièrement, avec plus de temps — il y aura donc au moins ce nombre.",
    reMask: "Redact à nouveau cet élément",
    uncertain: "Détection incertaine — redacted par défaut. Cliquez pour garder en clair.",
    keepInClear: "Garder en clair (ne PAS redact) — envoyé tel quel au modèle",
    toVerify: "à vérifier",
    showAll: "Afficher toutes les détections",
    more: (n) => `+${n} autres`,
    collapseTip: "Replier la liste",
    collapse: "Réduire",
  },

  longText: {
    openTip: "Ouvrir l'éditeur (texte long)",
    summary: (chars, lines) =>
      `Texte long — ${chars.toLocaleString("fr-FR")} caractères · ${lines.toLocaleString("fr-FR")} lignes`,
    edit: "Éditer",
  },

  modal: {
    title: "Éditer le message",
    sub: "Le texte long s'édite ici — le redaction reste visible en direct ; l'envoi se fait depuis la zone de saisie.",
    tabEdit: "Éditer",
    tabPreview: "Aperçu",
    toMask: (n) => `${n} à redact`,
    mirrorOff: (max) =>
      `Surlignage en direct suspendu au-delà de ${max.toLocaleString("fr-FR")} caractères (pour garder la frappe fluide) — la détection et la protection à l'envoi restent inchangées, les étiquettes ci-dessous restent actives.`,
    done: "Terminé",
  },

  attachments: {
    open: "consulter le fichier",
    processing: "fichier en cours de traitement",
    redacting: "Redaction en cours…",
    values: (n) => `🛡 ${n} valeur${n > 1 ? "s" : ""}`,
    readAllPages: (total) => `Lire les ${total} pages`,
    readAllPagesTip: (read) =>
      `Seules les ${read} premières pages ont été lues (et donc redacted). Relire le document en entier — quelques secondes par page.`,
    retryRedaction: "Réessayer le redaction",
    reRedact: "Reredact",
    reRedactTip: "Reredact (moteur de redaction modifié)",
    remove: "Supprimer",
  },

  drop: {
    title: "Déposez ici",
    sub: "Un fichier est joint au message ; un dossier vous est proposé à l'autorisation.",
    close: "Fermer",
    folderDialog: "Autoriser un dossier",
  },
} satisfies Messages["composer"];
