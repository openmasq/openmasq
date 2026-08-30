/**
 * Tranche « chrome » du catalogue FR — la langue SOURCE.
 *
 * `satisfies` par entrée : le compilateur exige EXACTEMENT les clés du contrat
 * (`../messages/chrome.ts`), ni plus ni moins, tranche par tranche — donc une clé
 * oubliée nomme SA tranche plutôt que le catalogue entier.
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
} satisfies Messages["composer"];
