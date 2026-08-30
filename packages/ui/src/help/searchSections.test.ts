import { describe, expect, it } from "vitest";
import { getMessages } from "@openmasq/i18n";
import { searchSections } from "./searchSections";
import { sectionGuides } from "./sections";

/** ⌘K is the "I don't know where things are" tool. These pin that it answers on the
 *  words a lost user actually types — which is exactly what it used to miss. And it must
 *  do so in BOTH languages: une palette qui ne répond qu'au français est, pour un
 *  anglophone, exactement la panne d'origine. */
const fr = getMessages("fr");
const en = getMessages("en");

describe("searchSections — ⌘K atteint enfin les sections", () => {
  const ids = (q: string, t = fr) => searchSections(q, t).map((r) => r.id);

  it("chaque section se trouve par son propre nom, dans les deux langues", () => {
    for (const t of [fr, en]) {
      for (const s of sectionGuides(t)) expect(ids(s.label, t), s.label).toContain(s.id);
    }
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

  it("le mot de l'AUTRE langue trouve quand même — on tape « vault » dans une app en français", () => {
    expect(ids("vault")).toContain("vault");
    expect(ids("skills")).toContain("competences");
    expect(ids("coffre", en)).toContain("vault");
    expect(ids("memoire", en)).toContain("memory");
  });

  it("le guide se trouve par « aide » et par « comment ça marche »", () => {
    expect(ids("aide")).toContain("guide");
    expect(ids("comment ca marche")).toContain("guide");
    expect(ids("how does it work", en)).toContain("guide");
  });

  it("une requête vide ne renvoie RIEN — la palette reste conversation-first", () => {
    expect(searchSections("", fr)).toEqual([]);
    expect(searchSections("   ", fr)).toEqual([]);
  });

  it("le sous-titre explique sans répéter le titre", () => {
    for (const t of [fr, en]) {
      for (const r of searchSections("vault", t)) {
        expect(r.sub.length).toBeGreaterThan(10);
        expect(r.sub.startsWith(r.title)).toBe(false);
      }
    }
  });
});
