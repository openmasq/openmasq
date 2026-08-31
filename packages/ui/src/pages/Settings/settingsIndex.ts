/**
 * The SETTINGS DESTINATIONS — one entry per settings tab, and the single source
 * for all three things that name them (rule 9):
 *   • the settings rail's label (`SettingsView` NAV pairs these ids with an icon),
 *   • the content pane's per-tab header (`settingsMeta`),
 *   • the ⌘K palette's settings rows (`searchSettings`).
 * Adding a tab in one place used to mean remembering two others; now a tab that
 * exists is searchable and titled by construction.
 *
 * Pure functions of the CATALOGUE (`@openmasq/i18n`) — the copy is written there, in French
 * and in English; this file only keeps the STRUCTURE (the tab order, which
 * setting lives in which) and assembles it. Still React-free, so testable as-is.
 */
import { BRAND } from "@openmasq/branding";
import type { Messages, SettingsEntry } from "@openmasq/i18n";

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

/**
 * The tab ORDER — the one thing in this list that isn't copy. It
 * decides the rail as much as the ⌘K results, and has no business in a translation
 * catalogue: a language doesn't reorder settings.
 */
const TAB_ORDER = [
  "account",
  "privacy",
  "models",
  "mcp",
  "browser",
  "audit",
  "usage",
  "sync",
  "org",
  "billing",
  "versions",
] as const satisfies readonly SettingsTabId[];

/** The tabs in `t`'s language, in catalogue order. */
export function settingsDestinations(t: Messages): SettingsDestination[] {
  return TAB_ORDER.map((id) => {
    const tab = t.settings.tabs[id];
    return { id, label: tab.label, title: tab.title, sub: tab.sub(BRAND.name), kw: tab.kw };
  });
}

/** Per-tab header copy, derived so it can't drift from the palette. */
export function settingsMeta(t: Messages): Record<SettingsTabId, { title: string; sub: string }> {
  return Object.fromEntries(
    settingsDestinations(t).map((d) => [d.id, { title: d.title, sub: d.sub }]),
  ) as Record<SettingsTabId, { title: string; sub: string }>;
}

/** Fold accents + lowercase, so "credits" matches "crédits" and vice-versa. */
const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * The individual settings the palette can reach — label + the words a user actually types.
 * Deliberately a hand-kept list of the settings worth FINDING, not a mirror of every
 * control: a row per redaction category would bury the four things people look for.
 */
/** The entries that REQUIRE a capability beyond their tab: « Facturation des
 *  messages » lives in Compte, but its switch only exists if `host.billing`
 *  is wired in (build `OPENMASQ_BILLING=1`) — offering it without that leads to a
 *  missing section. The gate reuses `available` with the ID of the tab that CARRIES
 *  the capability (`billing`), so as not to invent a second vocabulary. */
const ENTRY_REQUIRES: Partial<Record<keyof Messages["settings"]["entries"], SettingsTabId>> = {
  messageBilling: "billing",
};

const ENTRY_TABS = {
  darkMode: "account",
  importConversations: "account",
  messageBilling: "account",
  notifyOnReply: "account",
  anonymousStats: "account",
  transparencyLog: "privacy",
  linkPreviews: "account",
  protectionLevel: "privacy",
  showTokens: "privacy",
  modelSeesTokens: "privacy",
  localModel: "models",
  favouriteModels: "models",
  claudeSubscription: "models",
  chatgptSubscription: "models",
  writeConfirm: "mcp",
  connectedDevices: "sync",
  environment: "versions",
} as const satisfies Record<keyof Messages["settings"]["entries"], SettingsTabId>;

/** Quel réglage vit dans quel onglet : une donnée de STRUCTURE, donc du code — un
 *  catalogue de traduction ne déplace pas un réglage d'un onglet à l'autre. La copie,
 *  elle, vient de `t` ; le `satisfies` ci-dessus fait échouer la compilation si une
 *  entrée du catalogue n'a pas d'onglet, ou l'inverse. */
export function settingsEntries(
  t: Messages,
): { key: keyof Messages["settings"]["entries"]; tab: SettingsTabId; label: string; kw: string }[] {
  return (Object.entries(ENTRY_TABS) as [keyof typeof ENTRY_TABS, SettingsTabId][]).map(
    ([key, tab]) => {
      const entry: SettingsEntry = t.settings.entries[key];
      return { key, tab, label: entry.label, kw: entry.kw };
    },
  );
}

/**
 * Les capacités DISTANTES ou plateforme dont dépend l'existence d'un onglet. Chacune est
 * un créneau d'hôte absent quand le build n'a pas reçu son adresse (`SELF_HOSTING.md`) :
 * une capacité manquante retire l'onglet, elle ne l'affiche pas vide. Un réglage qui
 * promet un service que ce build ne peut pas joindre est un mensonge, pas une invite.
 */
export interface SettingsCapabilities {
  /** `host.org` + une appartenance : l'onglet Organisation. */
  org: boolean;
  /** `host.sync` : Vos appareils (synchro chiffrée de bout en bout, via le backend). */
  sync: boolean;
  /** `host.browser` : le navigateur intégré (plateforme, pas réseau). */
  browser: boolean;
  /** `host.billing` : Paiement — abonnement, crédits, portail Stripe. Branché seulement
   *  dans un build qui VEND (`OPENMASQ_BILLING=1`) ; absent par défaut. */
  billing: boolean;
}

/**
 * L'onglet `id` existe-t-il ici ? LA question, posée une seule fois : le rail des
 * réglages et la palette ⌘K la lisent tous les deux (règle 9) — sans quoi la palette
 * finit par proposer une destination que le rail n'a pas.
 */
export function tabAvailable(id: SettingsTabId, caps: SettingsCapabilities): boolean {
  if (id === "org") return caps.org;
  if (id === "sync") return caps.sync;
  if (id === "browser") return caps.browser;
  if (id === "billing") return caps.billing;
  return true;
}

/**
 * Settings tabs matching a query, in catalogue order. An EMPTY query returns
 * nothing: the palette is conversation-first, and listing all nine tabs under an
 * empty box would bury the recent chats.
 *
 * `available` filters out tabs this platform/account lacks (browser/sync/org), so
 * the palette can never offer a destination the rail doesn't have.
 */
export function searchSettings(
  query: string,
  t: Messages,
  available?: (id: SettingsTabId) => boolean,
): SettingsDestination[] {
  const q = fold(query.trim());
  if (!q) return [];
  const ok = (id: SettingsTabId) => !available || available(id);
  const meta = settingsMeta(t);
  const tabs = settingsDestinations(t).filter(
    (d) => ok(d.id) && fold(`${d.label} ${d.title} ${d.sub} ${d.kw}`).includes(q),
  );
  // …then the individual SETTINGS. A user hunts for « mode sombre », not for the tab that
  // happens to contain it — and this is what lets the rail fold its advanced half without
  // anything becoming unreachable. Same row shape as a tab: picking one opens its tab,
  // which is all a palette can do.
  const seen = new Set(tabs.map((d) => fold(d.label)));
  const entries = settingsEntries(t).filter(
    (e) =>
      ok(e.tab) &&
      ok(ENTRY_REQUIRES[e.key] ?? e.tab) &&
      fold(`${e.label} ${e.kw}`).includes(q) &&
      !seen.has(fold(e.label)),
  ).map<SettingsDestination>((e) => ({
    id: e.tab,
    label: e.label,
    title: e.label,
    sub: t.settings.inTab(meta[e.tab].title),
    kw: e.kw,
  }));
  return [...tabs, ...entries];
}
