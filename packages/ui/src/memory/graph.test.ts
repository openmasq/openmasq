import { describe, expect, it } from "vitest";
import { buildMemoryGraph, crossLinks, neighborsOf } from "./graph";
import type { MemoryData } from "../types";

const MEM: MemoryData = {
  profile: "Consultant indépendant.",
  cards: [
    { id: "a", entity: "Augustin Vaudel", cat: "personne", facts: "Contact principal chez Karl Studio.", createdAt: 0, updatedAt: 0 },
    { id: "b", entity: "Karl Studio", cat: "organisation", facts: "Agence de design à Évreux.", createdAt: 0, updatedAt: 0 },
    { id: "c", entity: "Projet Zeta", cat: "projet", facts: "Kickoff en août.", createdAt: 0, updatedAt: 0 },
  ],
};

describe("buildMemoryGraph — the kit layout over real data", () => {
  it("core + one hub per NON-EMPTY category (+ profil) + one leaf per card", () => {
    const g = buildMemoryGraph(MEM);
    const kinds = g.nodes.map((n) => n.kind);
    expect(kinds.filter((k) => k === "core")).toHaveLength(1);
    expect(kinds.filter((k) => k === "hub")).toHaveLength(4); // profil + personne + organisation + projet
    expect(kinds.filter((k) => k === "leaf")).toHaveLength(3);
    // The empty « autre » category has NO hub — an empty hub is noise, not structure.
    expect(g.nodes.some((n) => n.id === "hub-autre")).toBe(false);
  });

  it("draws the REAL cross-link: Augustin's facts mention Karl Studio", () => {
    expect(crossLinks(MEM.cards)).toEqual([["a", "b"]]);
    const g = buildMemoryGraph(MEM);
    expect(g.edges.some((e) => e.cross && e.source === "card-a" && e.target === "card-b")).toBe(true);
    // …and the selection neighbourhood follows it.
    expect(neighborsOf("card-a", g.edges).has("card-b")).toBe(true);
  });

  it("deterministic: same store, same picture (positions included)", () => {
    expect(buildMemoryGraph(MEM)).toEqual(buildMemoryGraph(MEM));
  });

  it("an empty memory is just the core node", () => {
    const g = buildMemoryGraph({ cards: [] });
    expect(g.nodes).toHaveLength(1);
    expect(g.edges).toHaveLength(0);
  });
});
