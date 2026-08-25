import { describe, expect, it } from "vitest";
import type { ModelDay } from "./usageActivity";
import { NAMED_SERIES, OTHER_ID, buildSeries, dayCount } from "./usageSeries";

/** Un jour synthétique : `{modèle: compte}`. */
const day = (byModel: Record<string, number>): ModelDay => ({
  total: Object.values(byModel).reduce((a, b) => a + b, 0),
  byModel,
});

/** Sept modèles, volumes décroissants — `models` arrive déjà trié, comme le produit. */
const SEVEN = ["a", "b", "c", "d", "e", "f", "g"];
const WINDOW = [day({ a: 7, b: 6, c: 5, d: 4, e: 3, f: 2, g: 1 })];

describe("buildSeries — cinq nommés, le reste dans « Autres »", () => {
  it("nomme les cinq premiers et replie les suivants", () => {
    const s = buildSeries(WINDOW, SEVEN);
    expect(s.map((x) => x.id)).toEqual(["a", "b", "c", "d", "e", OTHER_ID]);
    expect(s).toHaveLength(NAMED_SERIES + 1);
  });

  // La règle que la rampe elle-même énonce : sept emplacements, ordre FIXE, jamais
  // cyclés. Une huitième série qui reprendrait `--chart-1` serait indiscernable de la
  // première — pire que de s'annoncer « autre ».
  it("n'attribue jamais deux fois la même teinte", () => {
    const colors = buildSeries(WINDOW, SEVEN).map((x) => x.color);
    expect(new Set(colors).size).toBe(colors.length);
    expect(colors.slice(0, NAMED_SERIES)).toEqual([
      "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)",
    ]);
    expect(colors.at(-1)).toBe("var(--chart-other)");
  });

  it("« Autres » additionne exactement ce qui n'est pas nommé", () => {
    const other = buildSeries(WINDOW, SEVEN).find((x) => x.id === OTHER_ID)!;
    expect(other.total).toBe(2 + 1); // f + g
  });

  it("sans débordement, pas de seau « Autres » du tout", () => {
    const s = buildSeries([day({ a: 3, b: 1 })], ["a", "b"]);
    expect(s.map((x) => x.id)).toEqual(["a", "b"]);
  });

  // ⚠️ Une légende qui nomme un modèle sans aplat fait chercher une couleur absente.
  it("ignore un modèle listé mais SANS message sur la fenêtre", () => {
    const s = buildSeries([day({ a: 2 })], ["a", "fantome"]);
    expect(s.map((x) => x.id)).toEqual(["a"]);
  });

  it("une fenêtre vide ne produit aucune série", () => {
    expect(buildSeries([day({})], ["a"])).toEqual([]);
  });

  // La couleur suit l'ENTITÉ : deux modèles restent distincts quel que soit l'ordre où
  // ils passent l'un devant l'autre — ce qu'on ne veut jamais, c'est deux séries de la
  // même teinte dans un même graphe.
  it("deux modèles ne partagent jamais une teinte, même à volume égal", () => {
    const s = buildSeries([day({ a: 5, b: 5, c: 5 })], ["a", "b", "c"]);
    expect(new Set(s.map((x) => x.color)).size).toBe(3);
  });
});

describe("dayCount", () => {
  const s = buildSeries(WINDOW, SEVEN);
  const named = new Set(s.filter((x) => x.id !== OTHER_ID).map((x) => x.id));

  it("rend le compte du jour pour une série nommée", () => {
    expect(dayCount(WINDOW[0], s[0], named)).toBe(7);
  });

  it("additionne tout le non-nommé pour « Autres »", () => {
    expect(dayCount(WINDOW[0], s.at(-1)!, named)).toBe(3);
  });

  // La somme des séries DOIT égaler le total du jour, sinon la barre empilée ment sur
  // sa propre hauteur.
  it("la somme des séries égale le total du jour", () => {
    const sum = s.reduce((acc, x) => acc + dayCount(WINDOW[0], x, named), 0);
    expect(sum).toBe(WINDOW[0].total);
  });

  it("un modèle absent d'un jour donné compte zéro, pas undefined", () => {
    expect(dayCount(day({ b: 2 }), s[0], named)).toBe(0);
  });
});
