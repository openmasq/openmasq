import { getMessages } from "@openmasq/i18n";
import { describe, expect, it } from "vitest";
import { makeMemoryCard } from "./memory";
import { CLUSTER_MIN_SIM, buildClusteredGraph, buildClusters, cardEmbedText } from "./cluster";
import type { MemoryCard, MemoryData } from "../types";

const card = (entity: string, facts: string, cat = "personne", ts = 1): MemoryCard => ({
  ...makeMemoryCard({ entity, facts, cat })!,
  updatedAt: ts,
});

const fr = getMessages("fr");

describe("buildClusters — semantic ∪ mention union", () => {
  const manon = card("Manon Verdolini", "Cliente, dossier fiscal.", "personne", 3);
  const avocate = card("Cabinet Bezier", "Avocats fiscalistes de Manon Verdolini.", "organisation", 2);
  const karl = card("Karl Studio", "Agence de design.", "organisation", 1);
  const zeta = card("Projet Zeta", "Refonte du site.", "projet", 1);

  it("a strong semantic edge groups two cards; below-threshold does not", () => {
    const strong = [{ a: manon.id, b: avocate.id, sim: 0.93 }];
    const clusters = buildClusters([manon, avocate, karl], strong);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].cardIds.sort()).toEqual([manon.id, avocate.id].sort());
    // Below threshold, and no mention between these two ⇒ no cluster.
    expect(buildClusters([manon, karl], [{ a: manon.id, b: karl.id, sim: 0.88 }])).toEqual([]);
    // The eval's measured FP bridges (« site web » 0.914, « renouvellement » 0.910)
    // must stay UNDER the threshold — that is what 0.92 was calibrated against.
    expect(CLUSTER_MIN_SIM).toBeGreaterThan(0.914);
  });

  it("two PERSONNE cards need the higher bar — template-similar facts are not a group", () => {
    const karim = card("Karim Bennour", "Client, préfère les points le jeudi.", "personne");
    const lea = card("Léa Fontaine", "Cliente, préfère les points le vendredi.", "personne");
    // 0.945 measured on the real model for this exact template pair — must NOT merge…
    expect(buildClusters([karim, lea], [{ a: karim.id, b: lea.id, sim: 0.945 }])).toEqual([]);
    // …while the same sim between a person and an ORG merges (normal bar),
    const org = card("Cabinet Bezier", "Avocats.", "organisation");
    expect(buildClusters([karim, org], [{ a: karim.id, b: org.id, sim: 0.945 }])).toHaveLength(1);
    // …a near-duplicate of the SAME person (≥0.95) still merges,
    expect(buildClusters([karim, lea], [{ a: karim.id, b: lea.id, sim: 0.96 }])).toHaveLength(1);
    // …and an explicit MENTION unions two people regardless of the semantic bar.
    const boss = card("Nadia Cros", "Manager de Karim Bennour.", "personne");
    expect(buildClusters([karim, boss], [])).toHaveLength(1);
  });

  it("an explicit MENTION merges even without a semantic edge (facts name the entity)", () => {
    // avocate's facts mention « Manon Verdolini » → crossLinks unions them.
    const clusters = buildClusters([manon, avocate, karl], []);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].cardIds).toContain(manon.id);
  });

  it("labels the group by its most-connected member and takes the dominant tone", () => {
    const edges = [
      { a: manon.id, b: avocate.id, sim: 0.94 },
      { a: manon.id, b: zeta.id, sim: 0.92 },
    ];
    const [cl] = buildClusters([manon, avocate, zeta], edges);
    expect(cl.label).toBe("Manon Verdolini"); // degree 2 beats 1
    expect(cl.tone).toBe("violet"); // 1/1/1 tie → first-seen category (personne) wins
  });
});

describe("buildClusteredGraph — same vocabulary as the radial graph", () => {
  it("clusters become GROUP hubs, singletons ring the outside, sem edges are dashed", () => {
    const a = card("A Corp", "x", "organisation");
    const b = card("B SARL", "y", "organisation");
    const solo = card("Loner", "z", "autre");
    const mem: MemoryData = { cards: [a, b, solo] };
    const g = buildClusteredGraph(mem, [{ a: a.id, b: b.id, sim: 0.95 }], fr);
    expect(g.clusters).toHaveLength(1);
    const hub = g.nodes.find((n) => n.kind === "hub")!;
    expect(hub.group).toBe(true);
    // both clustered leaves attach to the hub; the singleton attaches to the core
    expect(g.edges).toContainEqual({ source: hub.id, target: `card-${a.id}` });
    expect(g.edges).toContainEqual({ source: "core", target: `card-${solo.id}` });
    expect(g.edges.some((e) => e.sem)).toBe(true);
  });

  it("deterministic: same data, same picture", () => {
    const a = card("A Corp", "aa", "organisation");
    const b = card("B SARL", "bb", "organisation");
    const mem: MemoryData = { cards: [a, b] };
    const e = [{ a: a.id, b: b.id, sim: 0.93 }];
    const g = buildClusteredGraph(mem, e, fr);
    expect(g).toEqual(buildClusteredGraph(mem, e, fr));
    expect(g.clusters).toHaveLength(1);
  });

  it("a drawn sem edge and the union obey the SAME rule (no link the clustering ignored)", () => {
    const p1 = card("Karim Bennour", "x", "personne");
    const p2 = card("Léa Fontaine", "y", "personne");
    const g = buildClusteredGraph({ cards: [p1, p2] }, [{ a: p1.id, b: p2.id, sim: 0.94 }], fr);
    expect(g.clusters).toEqual([]);
    expect(g.edges.some((e) => e.sem)).toBe(false); // not clustered ⇒ not drawn either
  });
});

describe("cardEmbedText", () => {
  it("folds entity + aliases + facts into one passage", () => {
    const c = { ...card("Manon Verdolini", "Cliente."), aliases: ["Manon"] };
    expect(cardEmbedText(c)).toBe("Manon Verdolini (Manon). Cliente.");
  });
});
