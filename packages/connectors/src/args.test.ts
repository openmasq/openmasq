import { describe, it, expect } from "vitest";
import { stringList } from "./args";

describe("stringList — les trois formes qu'un modèle envoie pour une liste", () => {
  it("le tableau attendu", () => {
    expect(stringList(["a@b.c", "d@e.f"])).toEqual(["a@b.c", "d@e.f"]);
  });

  // Le cas du journal du 27/07/2026 : `Array.isArray` répondait `false`, le champ
  // était abandonné en silence et l'événement créé SANS participants.
  it("le tableau JSON ENCODÉ EN CHAÎNE", () => {
    expect(stringList('["Équipe produit"]')).toEqual(["Équipe produit"]);
    expect(stringList('["a@b.c", "d@e.f"]')).toEqual(["a@b.c", "d@e.f"]);
  });

  it("la chaîne séparée par des virgules ou des points-virgules", () => {
    expect(stringList("a@b.c, d@e.f")).toEqual(["a@b.c", "d@e.f"]);
    expect(stringList("a@b.c; d@e.f")).toEqual(["a@b.c", "d@e.f"]);
    expect(stringList("a@b.c")).toEqual(["a@b.c"]);
  });

  it("une virgule DANS une valeur du tableau JSON n'est pas un séparateur", () => {
    expect(stringList('["Rebour, Jean"]')).toEqual(["Rebour, Jean"]);
  });

  it("vide, blanc et non-chaînes disparaissent", () => {
    expect(stringList(undefined)).toEqual([]);
    expect(stringList(null)).toEqual([]);
    expect(stringList("")).toEqual([]);
    expect(stringList("  ,  ")).toEqual([]);
    expect(stringList([1, "a@b.c", null])).toEqual(["a@b.c"]);
    expect(stringList("[]")).toEqual([]);
  });

  it("un JSON malformé retombe sur le découpage, jamais sur une exception", () => {
    expect(stringList('["a@b.c"')).toEqual(['["a@b.c"']);
  });
});
