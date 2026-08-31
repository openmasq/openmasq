import { describe, expect, it } from "vitest";
import { askPageDraft, isBookmarked, labelOf, resolveTarget, sameUrl, toggleBookmark } from "./browserTarget";

describe("resolveTarget", () => {
  it("keeps an explicit http(s) URL, refuses other schemes", () => {
    expect(resolveTarget("https://example.com/a", undefined)).toBe("https://example.com/a");
    expect(resolveTarget("http://example.com", undefined)).toBe("http://example.com/");
  });
  it("prefixes a bare host, searches free keywords", () => {
    expect(resolveTarget("example.com", undefined)).toBe("https://example.com/");
    expect(resolveTarget("chat privé acme", undefined)).toContain("q=");
  });
  it("returns null for empty input", () => {
    expect(resolveTarget("  ", undefined)).toBeNull();
  });
});

describe("bookmarks", () => {
  const list = [{ label: "Exemple", url: "https://example.com/" }];
  it("matches the same navigable target regardless of the trailing slash", () => {
    expect(isBookmarked(list, "https://example.com")).toBe(true);
    expect(sameUrl("https://example.com", "https://example.com/")).toBe(true);
  });
  it("toggle removes an existing bookmark and adds a new one labelled by title, else host", () => {
    expect(toggleBookmark(list, "https://example.com")).toHaveLength(0);
    const added = toggleBookmark(list, "https://acme.co/x", "Dashboard Acme");
    expect(added).toHaveLength(2);
    expect(added[1]).toEqual({ label: "Dashboard Acme", url: "https://acme.co/x" });
    expect(toggleBookmark([], "https://acme.co/x")[0].label).toBe("acme.co");
  });
  it("an empty url never lands in the list", () => {
    expect(toggleBookmark([], "")).toHaveLength(0);
    expect(isBookmarked(list, "")).toBe(false);
  });
});

describe("labelOf", () => {
  it("labels by host, placeholder when empty", () => {
    expect(labelOf("https://wiki.acme.co/home")).toBe("wiki.acme.co");
    expect(labelOf("")).toBe("Nouvel onglet");
  });
});

describe("askPageDraft — ce qu'amorce « Demander »", () => {
  it("nomme la page ET garde l'URL, qui est ce qui permet d'y retourner", () => {
    expect(askPageDraft({ url: "https://acme.co/devis/12", title: "Devis 12 — Acme" })).toBe(
      "À propos de la page « Devis 12 — Acme » (https://acme.co/devis/12) : ",
    );
  });

  it("retombe sur l'URL quand le titre manque ou n'est que du blanc", () => {
    // A page still loading has no title yet; empty chevrons
    // would give « À propos de la page «  » ».
    for (const title of [undefined, "", "   "])
      expect(askPageDraft({ url: "https://acme.co/x", title })).toContain("« https://acme.co/x »");
  });

  it("finit par un séparateur suivi d'une espace — le curseur écrit la question", () => {
    expect(askPageDraft({ url: "https://acme.co" })).toMatch(/ : $/);
  });
});
