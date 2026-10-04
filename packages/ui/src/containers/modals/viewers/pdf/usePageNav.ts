import { useEffect, useRef, useState, type RefObject } from "react";
import { scrollParent } from "./lazyPages";

/** Where a key press belongs to something else: a field, a menu, the selection picker. */
const OWNED = "input, textarea, select, [contenteditable='true'], [role='menu'], [role='listbox'], [data-sel-menu]";

/** The arrow keys that move page to page: ←/↑ back, →/↓ forward. */
function pageStep(key: string): -1 | 1 | 0 {
  if (key === "ArrowLeft" || key === "ArrowUp") return -1;
  if (key === "ArrowRight" || key === "ArrowDown") return 1;
  return 0;
}

/**
 * Page navigation of the PDF viewer: the page in view (the first whose bottom passes the top
 * third of the scrolling panel) and `go(n)`, which brings page `n` to the top. The arrow keys
 * jump page to page while the viewer is on screen — except when a field, a menu or the
 * selection picker has them, or with a modifier held.
 */
export function usePageNav(shellsRef: RefObject<HTMLElement[]>, total: number) {
  const [current, setCurrent] = useState(1);
  const currentRef = useRef(1);
  currentRef.current = current;

  const go = (n: number) => {
    const shells = shellsRef.current ?? [];
    const target = Math.min(Math.max(1, n), shells.length);
    shells[target - 1]?.scrollIntoView?.({ block: "start" });
    setCurrent(target);
  };
  const goRef = useRef(go);
  goRef.current = go;

  useEffect(() => {
    const shells = shellsRef.current ?? [];
    const panel = scrollParent(shells[0] ?? null);
    if (!total || !panel) return;
    let frame = 0;
    const track = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = panel.getBoundingClientRect();
        const line = top.top + top.height / 3;
        const i = shells.findIndex((s) => s.getBoundingClientRect().bottom > line);
        if (i >= 0) setCurrent(i + 1);
      });
    };
    panel.addEventListener("scroll", track, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      panel.removeEventListener("scroll", track);
    };
  }, [total, shellsRef]);

  useEffect(() => {
    if (!total) return;
    const onKey = (e: KeyboardEvent) => {
      const step = pageStep(e.key);
      if (!step || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(OWNED) || document.querySelector("[data-sel-menu]")) return;
      e.preventDefault();
      goRef.current(currentRef.current + step);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  return { current, go };
}
