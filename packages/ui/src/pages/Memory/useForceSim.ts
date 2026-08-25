import { useEffect, useRef, useState } from "react";
import type { Simulation } from "d3-force";
import type { MemoryGraphData } from "../../memory/graph";
import { createSimulation, SETTLE_TICKS, toSimNodes, type SimLink, type SimNode } from "../../memory/force";

/**
 * Drives the pure `memory/force.ts` simulation for the SVG renderer: animated ticks
 * (`prefers-reduced-motion` settles instantly instead), plus node drag. Positions from
 * the previous run seed the next one, so editing a card relaxes the current picture
 * instead of replaying the whole layout.
 */
export function useForceSim(graph: MemoryGraphData): {
  nodes: SimNode[];
  dragStart: (id: string) => void;
  dragMove: (id: string, x: number, y: number) => void;
  dragEnd: (id: string) => void;
} {
  const [nodes, setNodes] = useState<SimNode[]>(() => toSimNodes(graph));
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const posRef = useRef(new Map<string, { x: number; y: number }>());

  useEffect(() => {
    const simNodes = toSimNodes(graph, posRef.current);
    const sim = createSimulation(simNodes, graph.edges);
    simRef.current = sim;
    const publish = () => {
      for (const n of simNodes) posRef.current.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
      setNodes([...simNodes]);
    };
    // Manual tick() does not dispatch "tick" events, so the reduced-motion settle
    // below renders exactly once; the drag reheat still animates through this handler.
    sim.on("tick", publish);
    const reduced =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      sim.tick(SETTLE_TICKS);
      publish();
    } else {
      sim.alpha(0.9).restart();
    }
    return () => {
      sim.stop();
      sim.on("tick", null);
      simRef.current = null;
    };
  }, [graph]);

  const nodeOf = (id: string): SimNode | undefined =>
    simRef.current?.nodes().find((n) => n.id === id);

  const dragStart = (id: string): void => {
    const n = nodeOf(id);
    if (!n || n.id === "core") return;
    n.fx = n.x;
    n.fy = n.y;
    simRef.current?.alphaTarget(0.28).restart();
  };
  const dragMove = (id: string, x: number, y: number): void => {
    const n = nodeOf(id);
    if (!n || n.id === "core") return;
    n.fx = x;
    n.fy = y;
  };
  const dragEnd = (id: string): void => {
    const n = nodeOf(id);
    if (n && n.id !== "core") {
      n.fx = null;
      n.fy = null;
    }
    simRef.current?.alphaTarget(0);
  };

  return { nodes, dragStart, dragMove, dragEnd };
}
