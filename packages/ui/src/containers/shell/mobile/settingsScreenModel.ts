import type { Messages } from "@openmasq/i18n";
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
 *
 * The TITLE of each group comes from the catalogue; what remains here is the COMPOSITION —
 * which tab falls into which group, and in what order. No language groups the
 * settings differently.
 */
const GROUPS: { key: keyof Messages["settings"]["groups"]; ids: SettingsTabId[] }[] = [
  { key: "account", ids: ["account", "billing", "usage"] },
  // The product's own subject leads, with the journal that evidences it.
  { key: "privacy", ids: ["privacy", "audit"] },
  { key: "aiTools", ids: ["models", "mcp", "browser"] },
  { key: "devices", ids: ["sync"] },
  { key: "app", ids: ["versions"] },
];

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
  t: Messages,
): SettingsGroup<T>[] {
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const out: SettingsGroup<T>[] = [];
  const placed = new Set<SettingsTabId>();
  for (const g of GROUPS) {
    const items = g.ids.flatMap((id) => {
      const tab = byId.get(id);
      if (!tab) return [];
      placed.add(id);
      return [tab];
    });
    if (items.length) out.push({ title: t.settings.groups[g.key], items });
  }
  const rest = tabs.filter((tab) => !placed.has(tab.id));
  if (rest.length) out.push({ title: t.settings.groups.other, items: rest });
  return out;
}
