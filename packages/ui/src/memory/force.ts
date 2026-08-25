import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { GraphEdge, GraphNode, MemoryGraphData } from "./graph";

/**
 * Force-directed layout over the SAME `MemoryGraphData` vocabulary the radial builders
 * emit. The builders' deterministic positions are the simulation's SEED, so the settled
 * picture keeps the radial cluster arrangement and stays deterministic (d3-force v3 has
 * no Math.random — its overlap jiggle is a seeded LCG). Pure: the animation lives in
 * `pages/Memory/useForceSim.ts`; tests settle it headless.
 *
 * All constants are in VIEWBOX units (the layout spans roughly ±14) — the renderer's
 * node radius is `size * 0.045`, which is why the collide radii look tiny.
 */

export type SimNode = GraphNode & SimulationNodeDatum;
export type SimLink = SimulationLinkDatum<SimNode> & Pick<GraphEdge, "cross" | "sem">;

const CHARGE: Record<GraphNode["kind"], number> = { core: -14, hub: -8, leaf: -2 };

const ends = (l: SimLink): [SimNode, SimNode] => [l.source as SimNode, l.target as SimNode];
const isCoreHub = (l: SimLink): boolean => {
  const [a, b] = ends(l);
  return (a.kind === "core" && b.kind === "hub") || (a.kind === "hub" && b.kind === "core");
};
const hasHub = (l: SimLink): boolean => ends(l).some((n) => n.kind === "hub");

/** Structural spring lengths mirror the radial builders' radii (HUB_R≈10, ring≈3,
 *  OUTER_R≈13.5) so the settled layout is a relaxation of the seed, not a new shape. */
function linkDistance(l: SimLink): number {
  if (l.sem) return 2.6;
  if (l.cross) return 3.4;
  if (isCoreHub(l)) return 9.5;
  if (hasHub(l)) return 3.1;
  return 12; // core ↔ singleton tether
}

function linkStrength(l: SimLink): number {
  if (l.sem) return 0.35;
  if (l.cross) return 0.2;
  if (isCoreHub(l)) return 0.55;
  if (hasHub(l)) return 0.7;
  return 0.15; // singletons hang loose on the rim
}

/** Clone the builder nodes into mutable sim nodes (the input graph is NEVER mutated).
 *  `seed` re-uses positions from a previous run so a card edit relaxes the current
 *  picture instead of replaying the whole layout. The core is pinned at the origin. */
export function toSimNodes(
  graph: MemoryGraphData,
  seed?: ReadonlyMap<string, { x: number; y: number }>,
): SimNode[] {
  return graph.nodes.map((n) => {
    const p = seed?.get(n.id);
    const node: SimNode = { ...n, ...(p ? { x: p.x, y: p.y } : {}) };
    if (n.id === "core") {
      node.fx = 0;
      node.fy = 0;
    }
    return node;
  });
}

/** Build the (stopped) simulation — the caller decides whether to animate or settle. */
export function createSimulation(
  nodes: SimNode[],
  edges: GraphEdge[],
): Simulation<SimNode, SimLink> {
  const links: SimLink[] = edges.map((e) => ({
    source: e.source,
    target: e.target,
    cross: e.cross,
    sem: e.sem,
  }));
  return forceSimulation(nodes)
    .force(
      "link",
      forceLink<SimNode, SimLink>(links)
        .id((n) => n.id)
        .distance(linkDistance)
        .strength(linkStrength),
    )
    .force("charge", forceManyBody<SimNode>().strength((n) => CHARGE[n.kind]))
    // Collide radius = drawn radius + label breathing room.
    .force(
      "collide",
      forceCollide<SimNode>((n) => n.size * 0.045 + (n.kind === "leaf" ? 0.72 : 0.9)).strength(0.9),
    )
    .force("x", forceX<SimNode>(0).strength(0.03))
    .force("y", forceY<SimNode>(0).strength(0.03))
    .stop();
}

export const SETTLE_TICKS = 260;

/** Run to rest synchronously — the reduced-motion path and the tests. */
export function settleLayout(graph: MemoryGraphData, ticks = SETTLE_TICKS): SimNode[] {
  const nodes = toSimNodes(graph);
  const sim = createSimulation(nodes, graph.edges);
  sim.tick(ticks);
  sim.stop();
  return nodes;
}
