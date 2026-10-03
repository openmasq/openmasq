import { describe, it, expect } from "vitest";
import { scanPageImages, toPageFractions } from "./imageRegions";

// The ids are pdf.js's own (v6 `OPS`); the walk only ever reads them through this table.
const OPS = {
  save: 10, restore: 11, transform: 12, setFillColorN: 55, setStrokeColorN: 53, showText: 44,
  paintFormXObjectBegin: 74, paintFormXObjectEnd: 75, beginGroup: 76, endGroup: 77,
  beginAnnotation: 80, endAnnotation: 81, paintImageMaskXObject: 83, paintImageMaskXObjectGroup: 84,
  paintImageXObject: 85, paintInlineImageXObject: 86, paintInlineImageXObjectGroup: 87,
  paintImageXObjectRepeat: 88, paintImageMaskXObjectRepeat: 89, paintSolidColorImageMask: 90,
};
type Op = [number, unknown];
const scan = (ops: Op[]) => scanPageImages(ops.map((o) => o[0]), ops.map((o) => o[1]), OPS);

describe("scanPageImages", () => {
  it("a page of text paints no image", () => {
    expect(scan([[OPS.showText, []]])).toEqual({ paintsImage: false, rects: [] });
  });

  it("bounds an image by the CTM it is painted under, save/restore included", () => {
    const r = scan([
      [OPS.save, null], [OPS.transform, [100, 0, 0, 50, 20, 700]], [OPS.paintImageXObject, ["img1"]], [OPS.restore, null],
      [OPS.paintInlineImageXObject, [{}]],
    ]);
    expect(r.paintsImage).toBe(true);
    expect(r.rects).toEqual([{ x0: 20, y0: 700, x1: 120, y1: 750 }, { x0: 0, y0: 0, x1: 1, y1: 1 }]);
  });

  it("composes a form XObject's matrix and pops it at the end", () => {
    const r = scan([
      [OPS.transform, [2, 0, 0, 2, 0, 0]],
      [OPS.paintFormXObjectBegin, [[1, 0, 0, 1, 10, 10], [0, 0, 1, 1]]],
      [OPS.transform, [30, 0, 0, 30, 0, 0]], [OPS.paintImageMaskXObject, [{}]],
      [OPS.paintFormXObjectEnd, []],
      [OPS.transform, [5, 0, 0, 5, 0, 0]], [OPS.paintSolidColorImageMask, []],
    ]);
    expect(r.rects).toEqual([{ x0: 20, y0: 20, x1: 80, y1: 80 }, { x0: 0, y0: 0, x1: 10, y1: 10 }]);
  });

  it("a rotated image is bounded by its axis-aligned box", () => {
    expect(scan([[OPS.transform, [0, 10, -20, 0, 100, 100]], [OPS.paintImageXObject, ["i"]]]).rects).toEqual([
      { x0: 80, y0: 100, x1: 100, y1: 110 },
    ]);
  });

  it("FAILS CLOSED on every image it cannot bound: grouped, repeated, in an annotation, in a pattern", () => {
    for (const op of ["paintImageMaskXObjectGroup", "paintInlineImageXObjectGroup", "paintImageXObjectRepeat", "paintImageMaskXObjectRepeat"] as const) {
      expect(scan([[OPS[op], []]])).toEqual({ paintsImage: true, rects: null });
    }
    expect(scan([[OPS.beginAnnotation, []], [OPS.paintImageXObject, ["i"]], [OPS.endAnnotation, []]]).rects).toBeNull();
    // A tiling pattern's cells come from their OWN operator list: an image there is invisible
    // to the page-level scan, so the pattern itself counts as one, unbounded.
    expect(scan([[OPS.setFillColorN, ["TilingPattern", null, { fnArray: [], argsArray: [] }]]])).toEqual({ paintsImage: true, rects: null });
  });

  it("without the arguments array the images are seen but never bounded", () => {
    expect(scanPageImages([OPS.paintImageXObject], undefined, OPS)).toEqual({ paintsImage: true, rects: null });
  });

  it("a malformed matrix makes every later image unbounded", () => {
    expect(scan([[OPS.transform, [1, 0, 0, NaN, 0, 0]], [OPS.paintImageXObject, ["i"]]]).rects).toBeNull();
  });
});

describe("toPageFractions", () => {
  // A 600×800 portrait page, unrotated: y flips (PDF bottom-left → raster top-left).
  const flip = (x: number, y: number) => [x, 800 - y];

  it("maps to top-left fractions of the page", () => {
    expect(toPageFractions([{ x0: 60, y0: 720, x1: 180, y1: 780 }], flip, 600, 800)).toEqual([
      { x0: 0.1, y0: 0.025, x1: 0.3, y1: 0.1 },
    ]);
  });

  it("clamps to the page and drops what lies wholly off it", () => {
    expect(toPageFractions([{ x0: -100, y0: 700, x1: 300, y1: 900 }, { x0: 700, y0: 0, x1: 900, y1: 10 }], flip, 600, 800)).toEqual([
      { x0: 0, y0: 0, x1: 0.5, y1: 0.125 },
    ]);
  });
});

describe("toPageFractions on a ROTATED page", () => {
  it("bounds all four corners after rotation (90°: x ← y, y ← x)", () => {
    const rot = (x: number, y: number) => [y, x];
    expect(toPageFractions([{ x0: 0, y0: 0, x1: 100, y1: 50 }], rot, 200, 200)).toEqual([{ x0: 0, y0: 0, x1: 0.25, y1: 0.5 }]);
  });
});

describe("scanPageImages with typed-array matrices", () => {
  it("reads a Float32Array transform like a plain one", () => {
    expect(scan([[OPS.transform, new Float32Array([10, 0, 0, 10, 5, 5])], [OPS.paintImageXObject, ["i"]]]).rects).toEqual([
      { x0: 5, y0: 5, x1: 15, y1: 15 },
    ]);
  });
});
