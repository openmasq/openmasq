import { describe, expect, it } from "vitest";
import { knnEdges, knnQuery } from "./knn";

const v = (...xs: number[]): number[] => {
  const n = Math.hypot(...xs);
  return xs.map((x) => x / n);
};

describe("knnEdges", () => {
  it("emits each pair once, ranked by cosine, top-k per node", () => {
    const items = [
      { id: "a", vector: v(1, 0, 0) },
      { id: "b", vector: v(0.9, 0.1, 0) }, // close to a
      { id: "c", vector: v(0, 1, 0) }, // far from both
    ];
    const edges = knnEdges(items, 1);
    expect(edges[0]).toMatchObject({ a: "a", b: "b" });
    expect(edges[0].sim).toBeGreaterThan(0.95);
    // c's single nearest neighbour also lands, but below the a↔b edge.
    expect(edges.length).toBe(2);
    expect(edges[1].sim).toBeLessThan(edges[0].sim);
    // no duplicate of the same unordered pair
    const keys = edges.map((e) => `${e.a}-${e.b}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("empty and single-item inputs yield no edges", () => {
    expect(knnEdges([], 3)).toEqual([]);
    expect(knnEdges([{ id: "solo", vector: v(1, 0) }], 3)).toEqual([]);
  });
});

describe("knnQuery (le rappel sémantique de memory_search)", () => {
  it("top-k par cosinus décroissant avec la requête ; borné ; vide sur vide", () => {
    const items = [
      { id: "loin", vector: v(0, 1, 0) },
      { id: "proche", vector: v(1, 0.05, 0) },
      { id: "moyen", vector: v(0.7, 0.7, 0) },
    ];
    const hits = knnQuery(v(1, 0, 0), items, 2);
    expect(hits.map((h) => h.id)).toEqual(["proche", "moyen"]);
    expect(hits[0].sim).toBeGreaterThan(hits[1].sim);
    expect(knnQuery(v(1, 0, 0), [], 4)).toEqual([]);
  });
});
