import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { blockAgentOverlay, unblockAgentOverlay } from "../../hooks/modalGate";

import { useT } from "../../i18n";
// A draggable vertical divider between the chat pane and the right (browser / artifact)
// pane. Dragging updates the split ratio = the fraction of the split the RIGHT pane
// occupies, clamped so neither side collapses. The agent browser's native overlay is
// alwaysOnTop and would capture the pointer when the cursor passes over it mid-drag, so
// it's BLOCKED (hidden) for the drag's duration (`block/unblockAgentOverlay`) — the DOM
// then receives every `pointermove` and the drag stays smooth; the overlay re-shows +
// snaps to the new bounds on release (`useBrowserBounds`).

const MIN = 0.25;
const MAX = 0.75;

export function SplitGutter({
  containerRef,
  onRatio,
}: {
  /** The `.chat-split` element the ratio is measured against. */
  containerRef: RefObject<HTMLElement>;
  /** Called with the right pane's new width fraction (0.25–0.75) as the user drags. */
  onRatio: (rightFraction: number) => void;
}) {
  const t = useT();
  const dragging = useRef(false);

  const onPointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    if (dragging.current) return;
    dragging.current = true;
    blockAgentOverlay();
    document.body.classList.add("resizing-split");
    const move = (ev: globalThis.PointerEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0) return;
      onRatio(Math.min(MAX, Math.max(MIN, (r.right - ev.clientX) / r.width)));
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
      className="chat-gutter"
      role="separator"
      aria-orientation="vertical"
      aria-label={t.conversation.resizePanel}
      onPointerDown={onPointerDown}
    >
      <span className="chat-gutter-grip" aria-hidden />
    </div>
  );
}
