import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Horizontal scroll box for a Markdown table with an EDGE-FADE affordance. macOS
 * overlay scrollbars stay hidden until you scroll, so a table wider than the
 * reading column reads as un-scrollable (the reported "impossible de slider
 * horizontalement"). We track the scroll position and stamp `data-edge`
 * (none | start | middle | end) on the frame; CSS shows a soft fade on whichever
 * side has more content, signalling — and inviting — the scroll. `overscroll-
 * behavior-x: contain` (in CSS) keeps a trackpad swipe on the table, not the thread.
 */
export function TableScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<"none" | "start" | "middle" | "end">("none");
  const compute = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 1) setEdge("none");
    else if (el.scrollLeft <= 1) setEdge("start");
    else if (el.scrollLeft >= max - 1) setEdge("end");
    else setEdge("middle");
  }, []);
  // Attach the scroll/resize listeners once; a separate per-render recompute below
  // catches CONTENT growth (a table streamed word-by-word grows its scrollWidth
  // without resizing its own box, so the ResizeObserver alone wouldn't fire).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    compute();
    el.addEventListener("scroll", compute, { passive: true });
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", compute);
      ro.disconnect();
    };
  }, [compute]);
  useLayoutEffect(compute);
  return (
    <div className="md-table-wrap" data-edge={edge}>
      <div className="md-table-scroll" ref={ref}>
        {children}
      </div>
    </div>
  );
}
