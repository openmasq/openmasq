import {
  createContext,
  useContext,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { blockAgentOverlay, unblockAgentOverlay } from "../hooks/modalGate";

/** The region of a pane the drag is over — an edge splits, the centre moves. */
export type DropRegion = "left" | "right" | "top" | "bottom" | "center";

interface DragState {
  conv: string;
  label: string;
  x: number;
  y: number;
  /** Pane currently under the pointer (its `data-pane`), or null. */
  target: string | null;
  region: DropRegion | null;
}

export interface WorkspaceDnd {
  drag: DragState | null;
  /**
   * Begin a POTENTIAL tab drag from a pointerdown. It promotes to a real drag only
   * after a small movement threshold (so a plain click still selects, via `onClick`).
   * Pointer-based — native HTML5 DnD is unreliable in Electron (app-region + React
   * re-renders swallow it), so we track pointermove/up ourselves and hit-test panes.
   */
  startTabDrag: (convId: string, label: string, e: ReactPointerEvent, onClick: () => void) => void;
}

const Ctx = createContext<WorkspaceDnd | null>(null);
export const useWorkspaceDnd = () => useContext(Ctx);

const THRESHOLD = 5; // px before a press becomes a drag

/** The pane (its id + rect) under a screen point, ignoring pointer-events:none overlays. */
function paneAtPoint(x: number, y: number): { paneId: string; rect: DOMRect } | null {
  const el = document.elementFromPoint(x, y);
  const pane = el?.closest?.("[data-pane]") as HTMLElement | null;
  if (!pane) return null;
  return { paneId: pane.dataset.pane!, rect: pane.getBoundingClientRect() };
}

function regionAt(r: DOMRect, x: number, y: number): DropRegion {
  const fx = (x - r.left) / r.width;
  const fy = (y - r.top) / r.height;
  const EDGE = 0.25;
  if (fx < EDGE) return "left";
  if (fx > 1 - EDGE) return "right";
  if (fy < EDGE) return "top";
  if (fy > 1 - EDGE) return "bottom";
  return "center";
}

export function WorkspaceDndProvider({
  onMove,
  onSplit,
  children,
}: {
  onMove: (convId: string, toPane: string) => void;
  onSplit: (t: string, convId: string, d: "row" | "column", p: "before" | "after") => void;
  children: ReactNode;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const ref = useRef<DragState | null>(null);
  const set = (d: DragState | null) => {
    ref.current = d;
    setDrag(d);
  };

  const startTabDrag = (conv: string, label: string, e: ReactPointerEvent, onClick: () => void) => {
    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;
    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD) return;
        started = true;
        blockAgentOverlay();
        document.body.classList.add("ws-dragging");
      }
      const hit = paneAtPoint(ev.clientX, ev.clientY);
      set({
        conv,
        label,
        x: ev.clientX,
        y: ev.clientY,
        target: hit?.paneId ?? null,
        region: hit ? regionAt(hit.rect, ev.clientX, ev.clientY) : null,
      });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      set(null);
      if (!started) {
        onClick(); // a plain click, not a drag → select the tab
        return;
      }
      unblockAgentOverlay();
      document.body.classList.remove("ws-dragging");
      const hit = paneAtPoint(ev.clientX, ev.clientY);
      if (!hit) return;
      const region = regionAt(hit.rect, ev.clientX, ev.clientY);
      if (region === "center") {
        onMove(conv, hit.paneId);
      } else {
        const direction = region === "left" || region === "right" ? "row" : "column";
        const position = region === "left" || region === "top" ? "before" : "after";
        onSplit(hit.paneId, conv, direction, position);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <Ctx.Provider value={{ drag, startTabDrag }}>
      {children}
      {drag && (
        <div
          className="ws-drag-ghost"
          style={{ left: drag.x, top: drag.y } as CSSProperties}
          aria-hidden
        >
          {drag.label}
        </div>
      )}
    </Ctx.Provider>
  );
}

const REGION_LABEL: Record<DropRegion, string> = {
  center: "Déplacer ici",
  left: "Diviser à gauche",
  right: "Diviser à droite",
  top: "Diviser en haut",
  bottom: "Diviser en bas",
};

/**
 * One pane's drop affordance, for the whole drag: a standing outline that marks the
 * pane as a target BEFORE the pointer reaches it, plus — when it is the target — the
 * preview of the region the drop lands in, naming what it will do.
 */
export function PaneDropHint({ paneId }: { paneId: string }) {
  const dnd = useWorkspaceDnd();
  if (!dnd?.drag) return null;
  const region = dnd.drag.target === paneId ? dnd.drag.region : null;
  return (
    <>
      <div className="ws-drop-zone" aria-hidden />
      {region && (
        <div className={`ws-drop-hint ${region}`} aria-hidden>
          <span className="ws-drop-hint-label">{REGION_LABEL[region]}</span>
        </div>
      )}
    </>
  );
}
