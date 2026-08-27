import { describe, it, expect } from "vitest";
import {
  SETTINGS_DESTINATIONS,
  tabAvailable,
  SETTINGS_ENTRIES,
  SETTINGS_META,
  searchSettings,
  type SettingsTabId,
} from "./settingsIndex";

describe("SETTINGS_META", () => {
  it("covers every destination (the header can't drift from the palette)", () => {
    for (const d of SETTINGS_DESTINATIONS) {
      expect(SETTINGS_META[d.id]).toEqual({ title: d.title, sub: d.sub });
    }
    expect(Object.keys(SETTINGS_META)).toHaveLength(SETTINGS_DESTINATIONS.length);
  });

  it("has no duplicate ids", () => {
    const ids = SETTINGS_DESTINATIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("searchSettings", () => {
  // The palette is conversation-first: nine tabs under an empty box would bury
  // the recent chats.
  it("returns nothing for an empty query", () => {
    expect(searchSettings("")).toEqual([]);
    expect(searchSettings("   ")).toEqual([]);
  });

  it("matches a label", () => {
    expect(searchSettings("Versions").map((d) => d.id)).toContain("versions");
  });

  it("matches a keyword that appears in NO label or sub", () => {
    expect(searchSettings("facture").map((d) => d.id)).toContain("billing");
    expect(searchSettings("changelog").map((d) => d.id)).toContain("versions");
    expect(searchSettings("sso").map((d) => d.id)).toContain("org");
  });

  it("is accent- and case-insensitive both ways", () => {
    expect(searchSettings("CRÉDITS").map((d) => d.id)).toContain("usage");
    // typed without the accent — the common case on a hurried keyboard
    expect(searchSettings("credits").map((d) => d.id)).toContain("usage");
    expect(searchSettings("thème").map((d) => d.id)).toContain("account");
    expect(searchSettings("theme").map((d) => d.id)).toContain("account");
  });

  it("returns [] rather than everything for an unmatched query", () => {
    expect(searchSettings("zzzzz")).toEqual([]);
  });

  // The palette must never offer a destination the rail doesn't have.
  it("honours the availability filter", () => {
    const noBrowser = (id: SettingsTabId) => id !== "browser";
    expect(searchSettings("navigateur", noBrowser).map((d) => d.id)).not.toContain("browser");
    expect(searchSettings("navigateur").map((d) => d.id)).toContain("browser");
  });

  it("keeps catalogue order for the TAB rows, which come first", () => {
    const rows = searchSettings("e"); // matches many
    const tabIds = SETTINGS_DESTINATIONS.map((d) => d.id);
    // The prefix of the result is the tab rows, in catalogue order; the individual
    // settings follow (they are answers to the same query, not a re-ordering of it).
    const head = rows.slice(0, rows.findIndex((r) => r.sub.startsWith("Dans «")) + 1 || rows.length);
    const tabRows = head.filter((r) => !r.sub.startsWith("Dans «")).map((r) => r.id);
    expect(tabRows).toEqual(tabIds.filter((id) => tabRows.includes(id)));
  });

  it("finds an individual SETTING and points at the tab that holds it", () => {
    // What a user types is « mode sombre », not the name of the tab it lives in — and
    // this is what makes folding the rail's advanced half harmless.
    // The tab may legitimately match too (« Compte » lists « thème sombre » among its
    // keywords); what matters is that the SETTING itself is now a row of its own.
    const hit = searchSettings("sombre").find((r) => r.label === "Mode sombre");
    expect(hit).toBeTruthy();
    expect(hit?.id).toBe("account");
    expect(hit?.sub).toContain("Compte");
  });

  it("a setting of an UNAVAILABLE tab is not offered either", () => {
    // The gate is the tab's: no host.sync ⇒ neither « Vos appareils » nor its settings.
    const rows = searchSettings("appareils", (id) => id !== "sync");
    expect(rows.every((r) => r.id !== "sync")).toBe(true);
  });

  it("every indexed setting points at a tab that exists", () => {
    const ids = new Set(SETTINGS_DESTINATIONS.map((d) => d.id));
    for (const e of SETTINGS_ENTRIES) expect(ids.has(e.tab)).toBe(true);
  });
});

describe("tabAvailable — un onglet n'existe que si sa capacité existe", () => {
  // Un build sans backend n'a ni facturation, ni synchro, ni organisation
  // (`SELF_HOSTING.md`) : ces onglets ne s'affichent pas VIDES, ils n'existent pas. La
  // règle vit ici parce que le rail des réglages ET la palette ⌘K la lisent tous les deux.
  const NONE = { org: false, sync: false, browser: false, billing: false };
  const ALL = { org: true, sync: true, browser: true, billing: true };

  it("retire chaque onglet dont la capacité manque", () => {
    for (const id of ["org", "sync", "browser", "billing"] as const) {
      expect(tabAvailable(id, NONE), id).toBe(false);
      expect(tabAvailable(id, ALL), id).toBe(true);
    }
  });

  it("laisse passer ce qui est LOCAL — sinon un build sans backend n'aurait plus de réglages", () => {
    for (const id of ["account", "privacy", "models", "mcp", "usage", "audit", "versions"] as const) {
      expect(tabAvailable(id, NONE), id).toBe(true);
    }
  });

  it("la palette ⌘K ne peut pas offrir une destination que le rail n'a pas", () => {
    const rows = searchSettings("paiement", (id) => tabAvailable(id, NONE));
    expect(rows.every((r) => r.id !== "billing")).toBe(true);
  });
});
