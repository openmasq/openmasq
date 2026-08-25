import { describe, expect, it } from "vitest";
import type { MemoryCard, MemoryCategory, MemoryData } from "../types";
import { buildClusteredGraph, type SemanticEdge } from "./cluster";
import { settleLayout, toSimNodes } from "./force";

const card = (id: string, entity: string, cat: MemoryCategory = "projet"): MemoryCard => ({
  id,
  entity,
  cat,
  facts: "",
  createdAt: 1,
  updatedAt: 1,
});

// Two 2-card semantic clusters + one singleton — enough structure for hubs, leaves,
// sem edges and the outer-ring tether all at once.
const memory: MemoryData = {
  cards: [
    card("p1", "Dossier Alpha"),
    card("p2", "Cabinet Alpha", "organisation"),
    card("p3", "Projet Beta"),
    card("p4", "Client Beta", "personne"),
    card("s1", "Divers"),
  ],
};
const semEdges: SemanticEdge[] = [
  { a: "p1", b: "p2", sim: 0.96 },
  { a: "p3", b: "p4", sim: 0.96 },
];
const graph = () => buildClusteredGraph(memory, semEdges);

describe("force layout", () => {
  it("is deterministic and finite — same data, same picture", () => {
    const a = settleLayout(graph());
    const b = settleLayout(graph());
    expect(a.map((n) => [n.id, n.x, n.y])).toEqual(b.map((n) => [n.id, n.x, n.y]));
    for (const n of a) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it("pins the core at the origin and keeps the layout bounded", () => {
    const nodes = settleLayout(graph());
    const core = nodes.find((n) => n.id === "core")!;
    expect(core.x).toBe(0);
    expect(core.y).toBe(0);
    for (const n of nodes) {
      expect(Math.abs(n.x ?? NaN)).toBeLessThan(40);
      expect(Math.abs(n.y ?? NaN)).toBeLessThan(40);
    }
  });

  it("settles each leaf nearer its own cluster hub than the other cluster's", () => {
    const nodes = settleLayout(graph());
    const at = (id: string) => nodes.find((n) => n.id === id)!;
    const d = (a: string, b: string) => Math.hypot(at(a).x! - at(b).x!, at(a).y! - at(b).y!);
    for (const [leaf, own, other] of [
      ["card-p1", "cl-0", "cl-1"],
      ["card-p2", "cl-0", "cl-1"],
      ["card-p3", "cl-1", "cl-0"],
      ["card-p4", "cl-1", "cl-0"],
    ] as const) {
      expect(d(leaf, own)).toBeLessThan(d(leaf, other));
    }
  });

  it("never mutates the builder graph", () => {
    const g = graph();
    const before = g.nodes.map((n) => ({ ...n }));
    settleLayout(g);
    expect(g.nodes).toEqual(before);
  });

  it("toSimNodes seeds from previous positions and pins only the core", () => {
    const seed = new Map([["card-s1", { x: 3, y: -2 }]]);
    const nodes = toSimNodes(graph(), seed);
    const s1 = nodes.find((n) => n.id === "card-s1")!;
    expect([s1.x, s1.y]).toEqual([3, -2]);
    expect(nodes.find((n) => n.id === "core")).toMatchObject({ fx: 0, fy: 0 });
    expect(s1.fx).toBeUndefined();
  });
});
