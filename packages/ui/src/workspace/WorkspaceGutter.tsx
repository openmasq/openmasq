import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { blockAgentOverlay, unblockAgentOverlay } from "../hooks/modalGate";

import { useT } from "../i18n";
const MIN = 0.15; // a pane never shrinks below 15% of its split
const MAX = 0.85;

/**
 * A draggable divider between two adjacent children of a split node, in either
 * orientation ("row" → vertical bar, "column" → horizontal bar). It measures the
 * SPLIT container and reports the whole updated `sizes` array (only the two
 * adjacent fractions change; the rest stay put). The agent browser's alwaysOnTop
 * native overlay is blocked for the drag's duration so the DOM keeps every
 * `pointermove` (same rationale as the old `SplitGutter`).
 */
export function WorkspaceGutter({
  direction,
  containerRef,
  sizes,
  index,
  onResize,
}: {
  direction: "row" | "column";
  /** The split node's flex container (measured to convert pointer → fraction). */
  containerRef: RefObject<HTMLElement>;
  /** Current size fractions of the split's children. */
  sizes: number[];
  /** This gutter sits between child `index` and child `index + 1`. */
  index: number;
  onResize: (sizes: number[]) => void;
}) {
  const t = useT();
  const dragging = useRef(false);

  const onPointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    if (dragging.current) return;
    dragging.current = true;
    blockAgentOverlay();
    document.body.classList.add("resizing-split");
    // Fractions before the pair, and the pair's combined span — the boundary can
    // only travel within [before + MIN·pair, before + MAX·pair].
    const before = sizes.slice(0, index).reduce((a, b) => a + b, 0);
    const pair = (sizes[index] ?? 0) + (sizes[index + 1] ?? 0);
    const move = (ev: globalThis.PointerEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const len = direction === "row" ? r.width : r.height;
      if (len <= 0) return;
      const pos = direction === "row" ? ev.clientX - r.left : ev.clientY - r.top;
      const local = Math.min(before + MAX * pair, Math.max(before + MIN * pair, pos / len));
      const next = sizes.slice();
      next[index] = local - before;
      next[index + 1] = pair - (local - before);
      onResize(next);
    };
    const up = () => {
      dragging.current = false;
      unblockAgentOverlay();
      document.body.classList.remove("resizing-split");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      className={`ws-gutter ${direction}`}
      role="separator"
      aria-orientation={direction === "row" ? "vertical" : "horizontal"}
      aria-label={t.leaves.resize}
      onPointerDown={onPointerDown}
    >
      <span className="ws-gutter-grip" aria-hidden />
    </div>
  );
}
