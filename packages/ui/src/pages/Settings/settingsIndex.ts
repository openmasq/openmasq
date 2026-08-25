/**
 * The SETTINGS DESTINATIONS — one entry per settings tab, and the single source
 * for all three things that name them (rule 9):
 *   • the settings rail's label (`SettingsView` NAV pairs these ids with an icon),
 *   • the content pane's per-tab header (`SETTINGS_META`),
 *   • the ⌘K palette's settings rows (`searchSettings`).
 * Adding a tab in one place used to mean remembering two others; now a tab that
 * exists is searchable and titled by construction.
 *
 * Pure data + a pure filter, so it is unit-tested and free of React.
 */
import { BRAND } from "@openmasq/branding";

export type SettingsTabId =
  | "account"
  | "privacy"
  | "mcp"
  | "browser"
  | "audit"
  | "usage"
  | "sync"
  | "org"
  | "billing"
  | "models"
  | "versions";

export interface SettingsDestination {
  id: SettingsTabId;
  /** Rail label — short. */
  label: string;
  /** Content-pane title. Often longer than the rail label ("MCP" → "Serveurs MCP"). */
  title: string;
  /** One-line description, shown in the header AND under the palette row. */
  sub: string;
  /**
   * Extra search terms that should match this tab but don't appear in its label
   * or sub — what a user actually types ("facture", "crédits", "changelog", "sso").
   * Space-separated, lowercase, unaccented where a user might type it that way.
   */
  kw: string;
}

export const SETTINGS_DESTINATIONS: SettingsDestination[] = [
  {
    id: "account",
    label: "Compte",
    title: "Compte",
    sub: "Votre identité sur cet appareil, l'apparence et vos données.",
    kw: "profil nom email adresse thème sombre dark mode clé api key redaction règles catégories modèle défaut préférences déconnexion",
  },
  {
    id: "privacy",
    label: "Confidentialité",
    title: "Confidentialité",
    sub: `Ce que ${BRAND.name} protège avant qu'un modèle ne le reçoive.`,
    kw: "redaction confidentialite privacy protection categories regles niveau standard strict sur mesure jetons pseudonymes rapport donnees protegees",
  },
  {
    id: "models",
    label: "Modèles",
    title: "Liste de modèles",
    sub: "Les modèles que vos accès ouvrent — plus un modèle local sur votre machine.",
    kw: "modele defaut gpt claude gemini mistral deepseek llm fournisseur provider cle api local ollama lm studio adresse localhost",
  },
  {
    id: "mcp",
    label: "Connecteurs",
    title: "Connecteurs & outils",
    sub: "Les connecteurs disponibles dans vos conversations.",
    kw: "connecteurs intégrations gmail notion stripe github slack outils tools serveur oauth",
  },
  {
    id: "browser",
    label: "Navigateur",
    title: "Navigateur",
    sub: "Le navigateur intégré que le modèle peut piloter, sous votre contrôle.",
    kw: "web recherche moteur duckduckgo google agent navigation sécurité",
  },
  {
    id: "audit",
    label: "Journal",
    title: "Journal d'audit",
    sub: "L'historique du redaction, filtrable et recherchable.",
    kw: "log historique sécurité traçabilité rédaction masquage export",
  },
  {
    id: "usage",
    label: "Usage",
    title: "Usage",
    sub: "Votre consommation, au total et par modèle.",
    kw: "consommation crédits cout dépense tokens jetons quota statistiques",
  },
  {
    id: "sync",
    label: "Vos appareils",
    title: "Synchronisation",
    sub: "Vos appareils et la synchronisation entre eux.",
    kw: "appareils devices cloud chiffrement sauvegarde",
  },
  {
    id: "org",
    label: "Organisation",
    title: "Organisation",
    sub: "L'organisation à laquelle appartient ce compte.",
    kw: "équipe team membres domaine sso entreprise administration",
  },
  {
    id: "billing",
    label: "Paiement",
    title: "Paiement",
    sub: "Votre abonnement, les crédits inclus et la facturation.",
    kw: "facture stripe carte abonnement plan prix tarif reçu portail",
  },
  {
    id: "versions",
    label: "Versions",
    title: "Versions",
    sub: "Les canaux de version et les notes de mise à jour.",
    kw: "changelog mise a jour update beta stable release notes canal nouveautés",
  },
];

/** Per-tab header copy, derived so it can't drift from the palette. */
export const SETTINGS_META: Record<SettingsTabId, { title: string; sub: string }> =
  Object.fromEntries(SETTINGS_DESTINATIONS.map((d) => [d.id, { title: d.title, sub: d.sub }])) as Record<
    SettingsTabId,
    { title: string; sub: string }
  >;

/** Fold accents + lowercase, so "credits" matches "crédits" and vice-versa. */
const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * Settings tabs matching a query, in catalogue order. An EMPTY query returns
 * nothing: the palette is conversation-first, and listing all nine tabs under an
 * empty box would bury the recent chats.
 *
 * `available` filters out tabs this platform/account lacks (browser/sync/org), so
 * the palette can never offer a destination the rail doesn't have.
 */
/**
 * The individual settings the palette can reach — label + the words a user actually types.
 * Deliberately a hand-kept list of the settings worth FINDING, not a mirror of every
 * control: a row per redaction category would bury the four things people look for.
 */
export const SETTINGS_ENTRIES: { tab: SettingsTabId; label: string; kw: string }[] = [
  { tab: "account", label: "Mode sombre", kw: "sombre dark theme apparence nuit couleur" },
  { tab: "account", label: "Importer des conversations", kw: "import chatgpt claude export historique" },
  { tab: "account", label: "Facturation des messages", kw: "abonnement credits cle byo propre compte payer" },
  { tab: "account", label: "Prévenir quand une réponse arrive", kw: "notification systeme banniere alerte reponse prete second plan" },
  { tab: "account", label: "Statistiques d'usage anonymes", kw: "analytics telemetrie consentement anonymes" },
  { tab: "privacy", label: "Transparence · journal technique", kw: "transparence debogage debug journal wire message exact modele vu par le modele comparatif" },
  { tab: "account", label: "Aperçus de liens", kw: "lien preview vignette apercu url ip" },
  { tab: "privacy", label: "Niveau de protection", kw: "niveau standard strict sur mesure categories regles redaction" },
  { tab: "privacy", label: "Afficher des jetons plutôt que des pseudonymes", kw: "jetons pseudonymes person1 iban affichage" },
  { tab: "privacy", label: "Le modèle ne voit que des jetons", kw: "jetons marqueurs pseudonymes modèle anonymisation person1 envoi" },
  { tab: "models", label: "Modèle sur votre ordinateur", kw: "local ollama lm studio localhost adresse openai compatible" },
  { tab: "models", label: "Modèles favoris", kw: "favoris favori etoile liste courte selecteur personnaliser epingler raccourci" },
  { tab: "mcp", label: "Confirmation des actions", kw: "confirmation ecriture write gate renforce outils" },
  { tab: "sync", label: "Appareils connectés", kw: "appareils devices synchro revoquer passphrase" },
  { tab: "versions", label: "Environnement", kw: "environnement staging production basculer beta test acces" },
];

export function searchSettings(
  query: string,
  available?: (id: SettingsTabId) => boolean,
): SettingsDestination[] {
  const q = fold(query.trim());
  if (!q) return [];
  const ok = (id: SettingsTabId) => !available || available(id);
  const tabs = SETTINGS_DESTINATIONS.filter(
    (d) => ok(d.id) && fold(`${d.label} ${d.title} ${d.sub} ${d.kw}`).includes(q),
  );
  // …then the individual SETTINGS. A user hunts for « mode sombre », not for the tab that
  // happens to contain it — and this is what lets the rail fold its advanced half without
  // anything becoming unreachable. Same row shape as a tab: picking one opens its tab,
  // which is all a palette can do.
  const seen = new Set(tabs.map((t) => fold(t.label)));
  const entries = SETTINGS_ENTRIES.filter(
    (e) => ok(e.tab) && fold(`${e.label} ${e.kw}`).includes(q) && !seen.has(fold(e.label)),
  ).map<SettingsDestination>((e) => ({
    id: e.tab,
    label: e.label,
    title: e.label,
    sub: `Dans « ${SETTINGS_META[e.tab].title} »`,
    kw: e.kw,
  }));
  return [...tabs, ...entries];
}
