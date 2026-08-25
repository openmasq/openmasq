import { useMemo, useRef } from "react";
import { neighborsOf, type MemoryGraphData } from "../../memory/graph";
import { useForceSim } from "./useForceSim";
import { useGraphViewport } from "./useGraphViewport";

/**
 * The Mémoire graph, rendered as LOCAL SVG — the kit draws the same layout with sigma
 * from a CDN, which the app forbids (CSP + rule 7). Layout is a force simulation
 * (`memory/force.ts`, animated by `useForceSim`). A node press within the click slop
 * selects (neighbour highlight, the kit's reducer behaviour); past it, it drags.
 *
 * SELECTING MOVES THE FRAME IN, deselecting pulls it back out (`useGraphViewport`,
 * geometry in `graphFrame.ts`) — past a few dozen cards the whole-graph fit draws a
 * label at well under 8px, so the highlight was pointing at something nobody could
 * read. Zoom/pan hand the frame to the user until the next selection; double-click re-fits.
 */
export function MemoryGraph({
  graph,
  selected,
  matched,
  onSelect,
}: {
  graph: MemoryGraphData;
  /** Selected node id (`card-<id>`, `hub-<cat>`, `profil`, `core`) or null. */
  selected: string | null;
  /** Card ids matching the toolbar search (`matchingCardIds`) — non-matching LEAVES
   *  dim, hubs/core stay lit so the structure keeps reading. `null` = no filter. */
  matched?: Set<string> | null;
  onSelect: (id: string | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { nodes, dragStart, dragMove, dragEnd } = useForceSim(graph);

  const neighbors = useMemo(
    () => (selected ? neighborsOf(selected, graph.edges) : new Set<string>()),
    [selected, graph.edges],
  );
  // What the viewport frames: the selection AND its neighbours, so the click zooms into
  // a NEIGHBOURHOOD one can read rather than onto a lone dot with nothing around it.
  // Sorted, because the hook keys "this is a new question, re-frame" off the joined ids.
  const focusIds = useMemo(
    () => (selected ? [selected, ...neighbors].sort() : []),
    [selected, neighbors],
  );
  const { viewBox, toPoint, beginPan, movePan, endPan, resetFit } = useGraphViewport(
    svgRef,
    nodes,
    focusIds,
  );
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const dim = (id: string) => {
    if (selected && id !== selected && !neighbors.has(id)) return true;
    const n = byId.get(id);
    return matched != null && n?.kind === "leaf" && !!n.cardId && !matched.has(n.cardId);
  };

  // One gesture at a time: press → (within slop) click-select, (past it) drag the node.
  const gesture = useRef<{ id: string; cx: number; cy: number; moved: boolean } | null>(null);
  const onNodeDown = (id: string) => (e: React.PointerEvent<SVGGElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { id, cx: e.clientX, cy: e.clientY, moved: false };
  };
  const onNodeMove = (id: string) => (e: React.PointerEvent<SVGGElement>) => {
    const g = gesture.current;
    if (!g || g.id !== id) return;
    if (!g.moved) {
      if (Math.hypot(e.clientX - g.cx, e.clientY - g.cy) < 4) return;
      g.moved = true;
      dragStart(id);
    }
    const p = toPoint(e.clientX, e.clientY);
    if (p) dragMove(id, p.x, p.y);
  };
  const onNodeUp = (id: string) => (e: React.PointerEvent<SVGGElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.id !== id) return;
    e.stopPropagation();
    if (g.moved) dragEnd(id);
    else onSelect(id === selected ? null : id);
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      className="om-mem-graph"
      role="img"
      aria-label={`Graphe de mémoire : ${nodes.length} nœuds`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        beginPan(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => movePan(e.clientX, e.clientY)}
      onPointerUp={() => {
        if (!endPan()) onSelect(null);
      }}
      onPointerCancel={() => endPan()}
      onDoubleClick={resetFit}
    >
      {graph.edges.map((e, i) => {
        const a = byId.get(e.source);
        const b = byId.get(e.target);
        if (!a || !b) return null;
        const active = !!selected && (e.source === selected || e.target === selected);
        return (
          <line
            key={i}
            x1={a.x ?? 0}
            y1={a.y ?? 0}
            x2={b.x ?? 0}
            y2={b.y ?? 0}
            className={`om-mem-edge${e.cross ? " cross" : ""}${e.sem ? " sem" : ""}${active ? " active" : ""}${
              selected && !active ? " dim" : ""
            }`}
          />
        );
      })}
      {nodes.map((n) => {
        // Kit sizes are sigma PIXELS on a ~900px canvas — scale to the ~29-unit
        // viewBox (÷ ~22) or the core renders as a giant ball.
        const r = n.size * 0.045 * (n.id === selected ? 1.4 : 1);
        return (
          <g
            key={n.id}
            className={`om-mem-node${dim(n.id) ? " dim" : ""}${n.id === selected ? " on" : ""}`}
            onPointerDown={onNodeDown(n.id)}
            onPointerMove={onNodeMove(n.id)}
            onPointerUp={onNodeUp(n.id)}
            onPointerCancel={() => {
              if (gesture.current?.id === n.id) {
                if (gesture.current.moved) dragEnd(n.id);
                gesture.current = null;
              }
            }}
          >
            <circle
              cx={n.x ?? 0}
              cy={n.y ?? 0}
              r={r}
              className={`om-mem-dot tone-${n.tone}`}
              style={n.tone !== "core" ? { fill: `var(--hl-${n.tone})` } : undefined}
            />
            <text x={n.x ?? 0} y={(n.y ?? 0) + r + 0.78} className={`om-mem-label kind-${n.kind}`}>
              {/* Truncation is a crowding rule, and the SELECTED node is the one the
                  viewport just moved in on — it has the room, and it is precisely the
                  label the click asked to read. So it alone shows in full. */}
              {n.id !== selected && n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
