import type { SettingsTabId } from "../../../pages/Settings/settingsIndex";

/**
 * The mobile Réglages groups its rows (kit `chat-app-mobile` Settings). Ten flat rows is
 * a wall on a phone; the desktop can afford a flat rail because the labels sit beside
 * their icons in one glance.
 *
 * Grouping is a MOBILE presentation choice, so it lives here and not in the shared tab
 * index — the desktop rail order is the catalog's. What must NOT be a presentation choice
 * is completeness: a tab missing from every group would silently vanish from the phone,
 * which is how a setting becomes unreachable. Hence the "Autres" fallback below, and
 * `settingsScreenModel.test.ts` pinning that the two together cover the whole tab set.
 */
const GROUPS: { title: string; ids: SettingsTabId[] }[] = [
  { title: "Compte", ids: ["account", "billing", "usage"] },
  // The product's own subject leads, with the journal that evidences it.
  { title: "Confidentialité", ids: ["privacy", "audit"] },
  { title: "IA & outils", ids: ["models", "mcp", "browser"] },
  { title: "Vos appareils", ids: ["sync"] },
  { title: "Organisation", ids: ["org"] },
  { title: "Application", ids: ["versions"] },
];

const FALLBACK_TITLE = "Autres";

export interface SettingsGroup<T> {
  title: string;
  items: T[];
}

/**
 * Split the VISIBLE tabs into display groups, in the declared order. Empty groups are
 * dropped (a capability-gated tab that isn't there leaves no empty heading); anything not
 * declared lands in a trailing "Autres" rather than disappearing.
 */
export function groupSettingsTabs<T extends { id: SettingsTabId }>(
  tabs: T[],
): SettingsGroup<T>[] {
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const out: SettingsGroup<T>[] = [];
  const placed = new Set<SettingsTabId>();
  for (const g of GROUPS) {
    const items = g.ids.flatMap((id) => {
      const t = byId.get(id);
      if (!t) return [];
      placed.add(id);
      return [t];
    });
    if (items.length) out.push({ title: g.title, items });
  }
  const rest = tabs.filter((t) => !placed.has(t.id));
  if (rest.length) out.push({ title: FALLBACK_TITLE, items: rest });
  return out;
}
