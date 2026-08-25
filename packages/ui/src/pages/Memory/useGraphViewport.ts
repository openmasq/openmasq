import { useEffect, useRef, useState, type RefObject } from "react";
import type { SimNode } from "../../memory/force";
import { boxSettled, fitBounds, focusBounds, lerpBox, type ViewBox } from "./graphFrame";

export type { ViewBox } from "./graphFrame";

const ZOOM_MIN_W = 6;
const ZOOM_MAX_W = 90;
const CLICK_SLOP_PX = 4;
/** Fraction of the remaining distance closed per frame — ~0.25s to land at 60fps. */
const EASE = 0.18;

const prefersReducedMotion = (): boolean =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The graph viewport. It has ONE job with two sources: the frame the graph SHOULD be at,
 * and the frame the user dragged it to.
 *
 * - No selection ⇒ auto-fit the (animating) node bounds.
 * - A selection ⇒ move in on it and its neighbours, close enough to READ the labels
 *   (`graphFrame.ts` owns the geometry and why the floor is where it is); deselecting
 *   pulls back out. The move is TWEENED, not cut: the graph is a map, and a map that
 *   teleports loses the reader — the eye has to be able to follow which cluster it just
 *   fell into. `prefers-reduced-motion` snaps instead.
 * - Wheel = zoom around the cursor, background drag = pan. Either hands the frame to the
 *   USER, and it stays theirs until they double-click (re-fit) or SELECT something else —
 *   a new selection is a new question, so it re-frames. Direct manipulation never tweens:
 *   a pan that eases behind the cursor feels broken.
 *
 * Client→viewBox mapping goes through `getScreenCTM`, so it is exact whatever
 * `preserveAspectRatio` letterboxing the stage applies.
 */
export function useGraphViewport(
  svgRef: RefObject<SVGSVGElement | null>,
  nodes: SimNode[],
  /** Ids to frame — the selection and its neighbours. Empty = fit everything. */
  focusIds: readonly string[] = [],
): {
  viewBox: ViewBox;
  toPoint: (clientX: number, clientY: number) => { x: number; y: number } | null;
  beginPan: (clientX: number, clientY: number) => void;
  movePan: (clientX: number, clientY: number) => void;
  /** Ends the gesture; true = it actually panned (so the caller must NOT treat it as a click). */
  endPan: () => boolean;
  resetFit: () => void;
} {
  const auto = focusBounds(nodes, focusIds, fitBounds(nodes));
  const [view, setView] = useState<ViewBox>(auto);
  const [manual, setManual] = useState(false);

  const viewRef = useRef(view);
  viewRef.current = view;
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const raf = useRef<number | null>(null);

  const takeOver = (vb: ViewBox): void => {
    if (raf.current != null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    setManual(true);
    setView(vb);
  };

  // A NEW selection re-frames, even if the user had panned away: they just asked a
  // question about a specific node, and answering it under their old frame would leave
  // the answer off-screen. `focusIds` is already sorted+joined by the caller's memo.
  const focusKey = focusIds.join("|");
  useEffect(() => {
    setManual(false);
  }, [focusKey]);

  // ONE tween loop, started when the drawn frame is behind the target and stopped the
  // moment it lands — an idle graph must cost zero frames.
  const targetKey = manual ? "" : `${auto.x},${auto.y},${auto.w},${auto.h}`;
  useEffect(() => {
    if (manual) return;
    if (raf.current != null) return; // a loop is already running; it reads `autoRef`
    if (prefersReducedMotion() || boxSettled(viewRef.current, autoRef.current)) {
      setView(autoRef.current);
      return;
    }
    const step = (): void => {
      const next = lerpBox(viewRef.current, autoRef.current, EASE);
      const done = boxSettled(next, autoRef.current);
      raf.current = done ? null : requestAnimationFrame(step);
      setView(done ? autoRef.current : next);
    };
    raf.current = requestAnimationFrame(step);
  }, [targetKey, manual]);

  useEffect(
    () => () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    },
    [],
  );

  const toPoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const toPointRef = useRef(toPoint);
  toPointRef.current = toPoint;
  const takeOverRef = useRef(takeOver);
  takeOverRef.current = takeOver;

  // React's onWheel is passive — preventDefault (to keep the page from scrolling
  // mid-zoom) needs a native non-passive listener.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const p = toPointRef.current(e.clientX, e.clientY);
      if (!p) return;
      const cur = viewRef.current;
      const w = Math.min(ZOOM_MAX_W, Math.max(ZOOM_MIN_W, cur.w * 1.0015 ** e.deltaY));
      const scale = w / cur.w;
      takeOverRef.current({
        x: p.x - (p.x - cur.x) * scale,
        y: p.y - (p.y - cur.y) * scale,
        w,
        h: cur.h * scale,
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [svgRef]);

  const pan = useRef<{ cx: number; cy: number; vb: ViewBox; moved: boolean } | null>(null);
  const beginPan = (clientX: number, clientY: number): void => {
    pan.current = { cx: clientX, cy: clientY, vb: viewRef.current, moved: false };
  };
  const movePan = (clientX: number, clientY: number): void => {
    const g = pan.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!g || !rect || rect.width === 0) return;
    if (!g.moved) {
      if (Math.hypot(clientX - g.cx, clientY - g.cy) < CLICK_SLOP_PX) return;
      // The frame becomes the user's on the first pixel past the slop, so BOTH anchors
      // are re-taken here: grabbed mid-tween the picture is not where it was at
      // pointer-down, and re-anchoring the pointer too keeps the slop from becoming a jump.
      g.moved = true;
      g.vb = viewRef.current;
      g.cx = clientX;
      g.cy = clientY;
      return;
    }
    const dx = clientX - g.cx;
    const dy = clientY - g.cy;
    // The drawn scale is min(w-scale, h-scale) (preserveAspectRatio "meet").
    const unitPerPx = Math.max(g.vb.w / rect.width, g.vb.h / rect.height);
    takeOverRef.current({ ...g.vb, x: g.vb.x - dx * unitPerPx, y: g.vb.y - dy * unitPerPx });
  };
  const endPan = (): boolean => {
    const moved = pan.current?.moved ?? false;
    pan.current = null;
    return moved;
  };

  return { viewBox: view, toPoint, beginPan, movePan, endPan, resetFit: () => setManual(false) };
}
