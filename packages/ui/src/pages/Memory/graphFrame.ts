import type { SimNode } from "../../memory/force";

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 4.5;
const MIN_SPAN = 16; // a 2-card graph must not zoom glyphs into billboards

/** Tighter than the whole-graph fit — the point of focusing is to get close. */
const FOCUS_PAD = 2.6;
/**
 * The readable band, and the reason this feature exists. A label is drawn at 0.6–0.72
 * USER units (`styles/skills/memoryStage.css`), so its size on screen is
 * `stage px / span × that`. Measured on the running app (~700px stage, 12 cards): the
 * whole-graph fit spans ~49 and draws a leaf label at ~8px — present, unreadable — and
 * a few dozen cards push that under 6px. A span of 26 puts it near 16px, comfortable.
 *
 * It is a FLOOR, not a target: a two-node neighbourhood would otherwise expand to fill
 * the stage, and since the dots scale with the frame, 18 turned the core into a black
 * ball and the labels into billboards.
 */
const FOCUS_MIN_SPAN = 26;

/** Settled = within this FRACTION of the target span on every edge (scale-free). */
const SETTLE_EPS = 0.004;

/**
 * How much tighter a focus frame must be than the fit to be WORTH moving the picture.
 * A hub's neighbourhood is nearly the whole graph, and since the focus padding is
 * smaller than the fit's it comes out a few percent narrower — technically a zoom in,
 * in practice a pointless lurch. Below this gain, the frame stays where it was.
 */
const FOCUS_GAIN = 0.85;

function bounds(nodes: SimNode[], pad: number, minSpan: number): ViewBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x ?? 0);
    minY = Math.min(minY, n.y ?? 0);
    maxX = Math.max(maxX, n.x ?? 0);
    maxY = Math.max(maxY, n.y ?? 0);
  }
  let x = minX - pad;
  let y = minY - pad;
  let w = maxX + pad - x;
  let h = maxY + pad - y;
  if (w < minSpan) {
    x -= (minSpan - w) / 2;
    w = minSpan;
  }
  if (h < minSpan) {
    y -= (minSpan - h) / 2;
    h = minSpan;
  }
  return { x, y, w, h };
}

/** The frame that shows every node. */
export function fitBounds(nodes: SimNode[]): ViewBox {
  if (nodes.length === 0) return { x: -15, y: -15, w: 30, h: 30 };
  return bounds(nodes, PAD, MIN_SPAN);
}

/**
 * The frame that shows a SELECTION and its neighbours, close enough to read.
 *
 * ⚠️ It never zooms OUT, and it never moves for nothing. A hub — above all `core`, which
 * touches everything — has a neighbourhood as wide as the graph, so "frame my neighbours"
 * would push the picture as far away as the fit the user was already reading, or a hair
 * closer: the opposite of what the click asked for, or a lurch that buys no legibility.
 * Below {@link FOCUS_GAIN} the frame stays put and the highlight does the work alone.
 *
 * Ids that match no node (a card deleted between select and re-render) fall back too —
 * an empty pick must not frame the origin and lose the graph off-screen.
 */
export function focusBounds(nodes: SimNode[], ids: readonly string[], fit: ViewBox): ViewBox {
  if (ids.length === 0) return fit;
  const want = new Set(ids);
  const picked = nodes.filter((n) => want.has(n.id));
  if (picked.length === 0) return fit;
  const box = bounds(picked, FOCUS_PAD, FOCUS_MIN_SPAN);
  return box.w > fit.w * FOCUS_GAIN || box.h > fit.h * FOCUS_GAIN ? fit : box;
}

/** One eased step from `from` toward `to`. `t` is the fraction closed this frame. */
export function lerpBox(from: ViewBox, to: ViewBox, t: number): ViewBox {
  const mix = (a: number, b: number): number => a + (b - a) * t;
  return { x: mix(from.x, to.x), y: mix(from.y, to.y), w: mix(from.w, to.w), h: mix(from.h, to.h) };
}

/** True once the tween is close enough that another frame would not be visible. */
export function boxSettled(a: ViewBox, b: ViewBox): boolean {
  const eps = Math.max(b.w, b.h) * SETTLE_EPS;
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.w - b.w) < eps &&
    Math.abs(a.h - b.h) < eps
  );
}
