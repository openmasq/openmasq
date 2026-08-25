import { describe, expect, it } from "vitest";
import type { SimNode } from "../../memory/force";
import { boxSettled, fitBounds, focusBounds, lerpBox } from "./graphFrame";

const node = (id: string, x: number, y: number): SimNode =>
  ({ id, x, y, label: id, kind: "leaf", size: 8, tone: "sky" }) as unknown as SimNode;

/** A wide graph: one tight cluster, and a far-away one that stretches the fit. */
const cluster = [node("a", 0, 0), node("b", 2, 1), node("c", -1, 2)];
const far = [node("z1", 60, 55), node("z2", 64, 58)];
const wide = [...cluster, ...far];

describe("fitBounds", () => {
  it("frames an empty graph on the origin instead of an infinite box", () => {
    expect(fitBounds([])).toEqual({ x: -15, y: -15, w: 30, h: 30 });
  });

  it("contains every node", () => {
    const b = fitBounds(wide);
    for (const n of wide) {
      expect(n.x!).toBeGreaterThan(b.x);
      expect(n.x!).toBeLessThan(b.x + b.w);
      expect(n.y!).toBeGreaterThan(b.y);
      expect(n.y!).toBeLessThan(b.y + b.h);
    }
  });
});

describe("focusBounds — the frame a selection moves to", () => {
  it("gets CLOSE: a neighbourhood in a wide graph is framed far tighter than the fit", () => {
    const fit = fitBounds(wide);
    const box = focusBounds(wide, ["a", "b", "c"], fit);
    // This ratio IS the feature: at the fit span a label draws under 8px, unreadable.
    expect(box.w).toBeLessThan(fit.w / 2);
    expect(box.h).toBeLessThan(fit.h / 2);
  });

  it("contains the whole selection it was asked to frame", () => {
    const box = focusBounds(wide, ["a", "b", "c"], fitBounds(wide));
    for (const n of cluster) {
      expect(n.x!).toBeGreaterThan(box.x);
      expect(n.x!).toBeLessThan(box.x + box.w);
      expect(n.y!).toBeGreaterThan(box.y);
      expect(n.y!).toBeLessThan(box.y + box.h);
    }
  });

  // The dots scale with the frame, so an unbounded "fit these two nodes" turns the core
  // into a black ball and the labels into billboards — measured on the running app.
  it("keeps a FLOOR on the span — a lone node does not become a billboard", () => {
    const box = focusBounds(wide, ["a"], fitBounds(wide));
    expect(box.w).toBeGreaterThanOrEqual(26);
    expect(box.h).toBeGreaterThanOrEqual(26);
  });

  // ⚠️ THE case this guard exists for. `core` (and any hub) neighbours the whole graph,
  // so "frame my neighbours" spans as much as the fit the user was already reading — and
  // since the focus padding is the tighter one, it comes out a few percent narrower:
  // technically a zoom in, in practice a lurch that buys no legibility at all.
  it("does not move the picture for a hub whose neighbourhood IS the graph", () => {
    const fit = fitBounds(wide);
    expect(focusBounds(wide, wide.map((n) => n.id), fit)).toEqual(fit);
  });

  it("falls back to the fit for an empty pick, or ids that match no node", () => {
    const fit = fitBounds(wide);
    expect(focusBounds(wide, [], fit)).toEqual(fit);
    expect(focusBounds(wide, ["card-deleted"], fit)).toEqual(fit);
  });
});

describe("the tween", () => {
  it("lands on the target — and reports settled — within a fifth of a second at 60fps", () => {
    const from = fitBounds(wide);
    const to = focusBounds(wide, ["a", "b", "c"], from);
    let cur = from;
    let frames = 0;
    while (!boxSettled(cur, to) && frames < 600) {
      cur = lerpBox(cur, to, 0.18);
      frames++;
    }
    expect(boxSettled(cur, to)).toBe(true);
    expect(frames).toBeLessThanOrEqual(60);
  });

  it("is settled against itself, and not against a frame it has not reached", () => {
    const fit = fitBounds(wide);
    const focus = focusBounds(wide, ["a", "b", "c"], fit);
    expect(boxSettled(fit, fit)).toBe(true);
    expect(boxSettled(fit, focus)).toBe(false);
  });
});
