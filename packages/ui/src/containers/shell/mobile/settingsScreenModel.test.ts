import { describe, expect, it } from "vitest";
import { groupSettingsTabs } from "./settingsScreenModel";
import { SETTINGS_NAV } from "../../../pages/Settings/settingsTabs";
import type { SettingsTabId } from "../../../pages/Settings/settingsIndex";

const ids = (groups: ReturnType<typeof groupSettingsTabs>) =>
  groups.flatMap((g) => g.items.map((i) => i.id));

describe("groupSettingsTabs", () => {
  it("shows every tab of the catalog — a setting must never become unreachable", () => {
    // The whole risk of grouping: a tab added to SETTINGS_NAV but forgotten in a group
    // would be invisible on the phone with nothing to notice it by.
    const grouped = ids(groupSettingsTabs(SETTINGS_NAV));
    expect(grouped.sort()).toEqual(SETTINGS_NAV.map((t) => t.id).sort());
  });

  it("catches an UNDECLARED tab in « Autres » instead of dropping it", () => {
    const withNew = [...SETTINGS_NAV, { id: "labo" as SettingsTabId, label: "Labo", icon: null }];
    const groups = groupSettingsTabs(withNew);
    expect(groups.at(-1)?.title).toBe("Autres");
    expect(groups.at(-1)?.items.map((i) => i.id)).toEqual(["labo"]);
  });

  it("drops a group whose tabs are all capability-gated away", () => {
    // A solo user has no org, a browser-less platform no "Navigateur": their headings
    // must not linger over nothing.
    const solo = SETTINGS_NAV.filter((t) => t.id !== "org" && t.id !== "browser");
    const groups = groupSettingsTabs(solo);
    expect(groups.map((g) => g.title)).not.toContain("Organisation");
    expect(groups.find((g) => g.title === "IA & outils")?.items.map((i) => i.id)).toEqual([
      "models",
      "mcp",
    ]);
  });

  it("keeps the declared group order, not the tab order", () => {
    expect(groupSettingsTabs(SETTINGS_NAV).map((g) => g.title)).toEqual([
      "Compte",
      "Confidentialité",
      "IA & outils",
      "Vos appareils",
      "Organisation",
      "Application",
    ]);
  });

  it("returns nothing for no tabs", () => {
    expect(groupSettingsTabs([])).toEqual([]);
  });
});
