import { describe, expect, it } from "vitest";
import { storedKinds, storedReplacements } from "./storedReplacements";

describe("storedReplacements — la carte du dépôt relue depuis la base", () => {
  it("relit une carte valide, tri longueur décroissante (une valeur ne se rogne pas)", () => {
    const out = storedReplacements([
      { real: "Jean", fake: "Luc", tone: "blue", kind: "person" },
      { real: "Jean Rebour", fake: "Luc Morvan", tone: "blue", kind: "person" },
    ])!;
    expect(out.map((r) => r.real)).toEqual(["Jean Rebour", "Jean"]);
    expect(out[0].fake).toBe("Luc Morvan");
  });

  it("écarte les entrées invalides d'un blob venu de la base, sans jeter", () => {
    // An old row / a different version: entry with no real, empty real, non-object.
    const out = storedReplacements([
      { real: "", fake: "x" },
      { fake: "y" },
      "junk",
      42,
      { real: "ok@ex.fr", fake: "n1@ex.fr", kind: "email" },
    ]);
    expect(out?.map((r) => r.real)).toEqual(["ok@ex.fr"]);
  });

  it("GARDE une teinte VALIDE quelle que soit la chaîne stockée — une teinte libre finirait en classe CSS", () => {
    const out = storedReplacements([{ real: "a", fake: "b", tone: "evil{injection}" }])!;
    expect(out[0].tone).toMatch(/^[a-z-]+$/);
  });

  it("rend undefined pour l'absent, le vide, et le tout-invalide — le repli coffre s'applique alors", () => {
    expect(storedReplacements(undefined)).toBeUndefined();
    expect(storedReplacements([])).toBeUndefined();
    expect(storedReplacements(["junk"])).toBeUndefined();
    expect(storedReplacements("pas un tableau")).toBeUndefined();
  });

  it("dédoublonne par valeur réelle — la première entrée gagne", () => {
    const out = storedReplacements([
      { real: "Jean", fake: "Luc" },
      { real: "Jean", fake: "Marc" },
    ])!;
    expect(out).toHaveLength(1);
    expect(out[0].fake).toBe("Luc");
  });
});

describe("storedKinds — l'entête « N masqués » parle de CE fichier", () => {
  it("dérive original→catégorie de la carte, et undefined sans catégories", () => {
    const reps = storedReplacements([
      { real: "jean@ex.fr", fake: "n1@ex.fr", kind: "email" },
      { real: "Jean", fake: "Luc" },
    ]);
    expect(storedKinds(reps)).toEqual({ "jean@ex.fr": "email" });
    expect(storedKinds(storedReplacements([{ real: "a", fake: "b" }]))).toBeUndefined();
    expect(storedKinds(undefined)).toBeUndefined();
  });
});
