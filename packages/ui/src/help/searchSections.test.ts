import { describe, expect, it } from "vitest";
import { searchSections } from "./searchSections";
import { SECTION_GUIDE } from "./sections";

/** ⌘K is the "I don't know where things are" tool. These pin that it answers on the
 *  words a lost user actually types — which is exactly what it used to miss. */
describe("searchSections — ⌘K atteint enfin les sections", () => {
  const ids = (q: string) => searchSections(q).map((r) => r.id);

  it("chaque section se trouve par son propre nom", () => {
    for (const s of SECTION_GUIDE) expect(ids(s.label), s.label).toContain(s.id);
  });

  it("sans accents et en minuscules — la façon dont on tape vraiment", () => {
    expect(ids("memoire")).toContain("memory");
    expect(ids("competences")).toContain("competences");
    expect(ids("bibliotheque")).toContain("library");
  });

  it("par ce que la section CONTIENT, pas seulement par son nom", () => {
    expect(ids("fichiers")).toContain("library");
    expect(ids("prompts")).toContain("competences");
    expect(ids("souvenirs")).toContain("memory");
    expect(ids("masquer")).toContain("vault");
  });

  it("le guide se trouve par « aide » et par « comment ça marche »", () => {
    expect(ids("aide")).toContain("guide");
    expect(ids("comment ca marche")).toContain("guide");
  });

  it("une requête vide ne renvoie RIEN — la palette reste conversation-first", () => {
    expect(searchSections("")).toEqual([]);
    expect(searchSections("   ")).toEqual([]);
  });

  it("le sous-titre explique sans répéter le titre", () => {
    for (const r of searchSections("coffre")) {
      expect(r.sub.length).toBeGreaterThan(10);
      expect(r.sub.startsWith(r.title)).toBe(false);
    }
  });
});
