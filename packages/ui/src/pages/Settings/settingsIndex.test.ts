import { describe, it, expect } from "vitest";
import { getMessages, LOCALES } from "@openmasq/i18n";
import {
  settingsDestinations,
  tabAvailable,
  settingsEntries,
  settingsMeta,
  searchSettings,
  type SettingsTabId,
} from "./settingsIndex";

/** Les requêtes ci-dessous sont écrites en FRANÇAIS : ce sont des cas de recherche, pas de
 *  la copie. Ce qui doit tenir dans les deux langues — la couverture des onglets, l'unicité
 *  des ids, le fait que chaque réglage indexé vise un onglet réel — boucle sur `LOCALES`. */
const fr = getMessages("fr");

describe("settingsMeta", () => {
  it.each(LOCALES)("[%s] covers every destination (the header can't drift from the palette)", (locale) => {
    const t = getMessages(locale);
    const meta = settingsMeta(t);
    for (const d of settingsDestinations(t)) {
      expect(meta[d.id]).toEqual({ title: d.title, sub: d.sub });
    }
    expect(Object.keys(meta)).toHaveLength(settingsDestinations(t).length);
  });

  it.each(LOCALES)("[%s] has no duplicate ids", (locale) => {
    const ids = settingsDestinations(getMessages(locale)).map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(LOCALES)("[%s] aucun onglet ne sort sans étiquette ni phrase", (locale) => {
    // Une traduction manquante ne casse pas la compilation si la clé existe et vaut « » :
    // c'est ici qu'on l'attrape, sur la surface la plus visible des réglages.
    for (const d of settingsDestinations(getMessages(locale))) {
      expect(d.label.trim(), d.id).not.toBe("");
      expect(d.title.trim(), d.id).not.toBe("");
      expect(d.sub.trim().length, d.id).toBeGreaterThan(10);
    }
  });
});

describe("searchSettings", () => {
  // The palette is conversation-first: nine tabs under an empty box would bury
  // the recent chats.
  it("returns nothing for an empty query", () => {
    expect(searchSettings("", fr)).toEqual([]);
    expect(searchSettings("   ", fr)).toEqual([]);
  });

  it("matches a label", () => {
    expect(searchSettings("Versions", fr).map((d) => d.id)).toContain("versions");
  });

  it("matches a keyword that appears in NO label or sub", () => {
    expect(searchSettings("facture", fr).map((d) => d.id)).toContain("billing");
    expect(searchSettings("changelog", fr).map((d) => d.id)).toContain("versions");
    expect(searchSettings("sso", fr).map((d) => d.id)).toContain("org");
  });

  it("is accent- and case-insensitive both ways", () => {
    expect(searchSettings("CRÉDITS", fr).map((d) => d.id)).toContain("usage");
    // typed without the accent — the common case on a hurried keyboard
    expect(searchSettings("credits", fr).map((d) => d.id)).toContain("usage");
    expect(searchSettings("thème", fr).map((d) => d.id)).toContain("account");
    expect(searchSettings("theme", fr).map((d) => d.id)).toContain("account");
  });

  it("returns [] rather than everything for an unmatched query", () => {
    expect(searchSettings("zzzzz", fr)).toEqual([]);
  });

  // The palette must never offer a destination the rail doesn't have.
  it("honours the availability filter", () => {
    const noBrowser = (id: SettingsTabId) => id !== "browser";
    expect(searchSettings("navigateur", fr, noBrowser).map((d) => d.id)).not.toContain("browser");
    expect(searchSettings("navigateur", fr).map((d) => d.id)).toContain("browser");
  });

  it("keeps catalogue order for the TAB rows, which come first", () => {
    const rows = searchSettings("e", fr); // matches many
    const tabIds = settingsDestinations(fr).map((d) => d.id);
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
    const hit = searchSettings("sombre", fr).find((r) => r.label === "Mode sombre");
    expect(hit).toBeTruthy();
    expect(hit?.id).toBe("account");
    expect(hit?.sub).toContain("Compte");
  });

  it("a setting of an UNAVAILABLE tab is not offered either", () => {
    // The gate is the tab's: no host.sync ⇒ neither « Vos appareils » nor its settings.
    const rows = searchSettings("appareils", fr, (id) => id !== "sync");
    expect(rows.every((r) => r.id !== "sync")).toBe(true);
  });

  it.each(LOCALES)("[%s] every indexed setting points at a tab that exists", (locale) => {
    const t = getMessages(locale);
    const ids = new Set(settingsDestinations(t).map((d) => d.id));
    for (const e of settingsEntries(t)) {
      expect(ids.has(e.tab), e.label).toBe(true);
      expect(e.label.trim(), e.tab).not.toBe("");
    }
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
    const rows = searchSettings("paiement", fr, (id) => tabAvailable(id, NONE));
    expect(rows.every((r) => r.id !== "billing")).toBe(true);
  });
});
