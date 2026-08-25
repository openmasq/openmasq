import { describe, it, expect } from "vitest";
import { textSegmentPatch, applyRevealToPage, type PatchCtx } from "./revealPatch";

/** Recording stub of the 2D context (10px per char measurer, marker ImageData). */
function stubCtx() {
  const calls: string[] = [];
  const ctx = {
    font: "",
    fillStyle: "",
    textBaseline: "",
    fillRect: (...a: number[]) => calls.push(`fillRect:${a.map(Math.round).join(",")}`),
    fillText: (t: string) => calls.push(`fillText:${t}`),
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath: () => {},
    // The painter draws a padded, ROUNDED box (`paintBox.ts`): record the geometry the
    // same way `fillRect` used to be recorded, so the assertions below still read it.
    rect: () => {},
    roundRect: (...a: number[]) => calls.push(`fillRect:${a.slice(0, 4).map(Math.round).join(",")}`),
    fill: () => {},
    clip: () => calls.push("clip"),
    measureText: (s: string) => ({ width: s.length * 10 }),
    getImageData: (x: number, y: number, w: number, h: number) =>
      ({ x, y, w, h, marker: true }) as unknown as ImageData,
    putImageData: (d: unknown) => calls.push(`putImageData:${(d as { x: number }).x}`),
  } as unknown as PatchCtx;
  return { ctx, calls };
}

const rep = { real: "Jean Rebour", fake: "Hugo Cros", tone: "coral" };
const item = { str: "Jean Rebour", width: 110, transform: [12, 0, 0, 12, 100, 700] };
const base = {
  item,
  segStart: 0,
  segEnd: 11,
  first: true,
  vpTransform: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
  scale: 1,
  dpr: 1,
  rep,
  canvasW: 2000,
  canvasH: 2000,
};

describe("textSegmentPatch — capture before paint, paint unless revealed", () => {
  it("captures the ORIGINAL pixels then paints tone + fake (first segment)", () => {
    const { ctx, calls } = stubCtx();
    const { box, patch } = textSegmentPatch(ctx, { ...base, revealed: false });
    expect(patch).not.toBeNull();
    // capture happened BEFORE any paint call
    expect(calls.findIndex((c) => c.startsWith("fillRect"))).toBeGreaterThanOrEqual(0);
    expect(calls.some((c) => c === "fillText:Hugo Cros")).toBe(true);
    expect(box).toMatchObject({ real: "Jean Rebour", revealed: false });
    expect(box.left).toBeCloseTo(100, 5);
  });

  it("a REVEALED value captures its patch but paints nothing", () => {
    const { ctx, calls } = stubCtx();
    const { box, patch } = textSegmentPatch(ctx, { ...base, revealed: true });
    expect(patch).not.toBeNull();
    expect(calls.some((c) => c.startsWith("fillRect") || c.startsWith("fillText"))).toBe(false);
    expect(box.revealed).toBe(true);
  });
});

describe("applyRevealToPage — restore-then-repaint, idempotent", () => {
  it("restores every patch and repaints only the non-revealed ones", () => {
    const { ctx, calls } = stubCtx();
    const a = textSegmentPatch(ctx, { ...base, revealed: false });
    const b = textSegmentPatch(ctx, {
      ...base,
      rep: { real: "Autre Valeur", fake: "X Y", tone: "blue" },
      revealed: false,
    });
    calls.length = 0;
    const boxes = applyRevealToPage(ctx, [a.patch!, b.patch!], new Set(["Jean Rebour"]));
    // both patches restored…
    expect(calls.filter((c) => c.startsWith("putImageData"))).toHaveLength(2);
    // …but only the non-revealed one repainted
    expect(calls.filter((c) => c.startsWith("fillRect"))).toHaveLength(1);
    expect(boxes.map((x) => x.revealed)).toEqual([true, false]);
    // toggling back is just another apply (idempotent by construction)
    calls.length = 0;
    const back = applyRevealToPage(ctx, [a.patch!, b.patch!], new Set());
    expect(calls.filter((c) => c.startsWith("fillRect"))).toHaveLength(2);
    expect(back.every((x) => !x.revealed)).toBe(true);
  });

  /**
   * ⚠️ THE LEAK this ordering exists to close. Boxes are padded, so two values on
   * consecutive lines OVERLAP (a 1.2× leading overlaps by ~28% of the font height).
   * Restoring and repainting one patch at a time meant a REVEALED patch could restore
   * its original pixels AFTER an earlier non-revealed neighbour had painted over the
   * shared strip — leaving real glyphs of a value the user never revealed on screen,
   * and on the send-as-images path, in the wire.
   *
   * Stated as an ORDER invariant rather than on a pixel: every restore must happen
   * before every repaint, whatever the patch order or the reveal set.
   */
  it("restores EVERY patch before repainting any — an overlapping neighbour cannot re-expose", () => {
    const { ctx, calls } = stubCtx();
    const a = textSegmentPatch(ctx, { ...base, revealed: false });
    const b = textSegmentPatch(ctx, {
      ...base,
      rep: { real: "Autre Valeur", fake: "X Y", tone: "blue" },
      revealed: false,
    });
    calls.length = 0;
    // The REVEALED one comes last — the order that used to lose.
    applyRevealToPage(ctx, [b.patch!, a.patch!], new Set(["Jean Rebour"]));
    const lastRestore = calls.map((c) => c.startsWith("putImageData")).lastIndexOf(true);
    const firstPaint = calls.findIndex((c) => c.startsWith("fillRect"));
    expect(firstPaint).toBeGreaterThan(-1);
    expect(lastRestore).toBeLessThan(firstPaint);
  });
});
