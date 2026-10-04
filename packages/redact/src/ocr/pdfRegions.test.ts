import { describe, it, expect, vi } from "vitest";

vi.mock("./ocr", () => ({
  ocrImageLayout: vi.fn(async () => ({
    text: "SCEAU",
    words: [{ text: "SCEAU", x0: 5, y0: 6, x1: 40, y1: 20, confidence: 90 }],
    meta: { engine: "stub", ms: 0 },
    width: 1,
    height: 1,
  })),
}));

import { ocrCanvasRegions, regionBoxes } from "./pdfRegions";

describe("regionBoxes", () => {
  it("pads, clamps to the raster and merges overlapping boxes", () => {
    const boxes = regionBoxes(
      [
        { x0: 0, y0: 0, x1: 0.1, y1: 0.1 },
        { x0: 0.09, y0: 0.05, x1: 0.2, y1: 0.12 },
        { x0: 0.8, y0: 0.8, x1: 0.9, y1: 0.9 },
      ],
      1000,
      1000,
      10,
    );
    expect(boxes).toEqual([
      { x: 0, y: 0, w: 210, h: 130 },
      { x: 790, y: 790, w: 120, h: 120 },
    ]);
  });

  it("merges to a fixpoint (a union can reach a box an earlier pass skipped)", () => {
    const boxes = regionBoxes(
      [
        { x0: 0, y0: 0, x1: 0.1, y1: 0.1 },
        { x0: 0.5, y0: 0, x1: 0.6, y1: 0.1 },
        { x0: 0.05, y0: 0, x1: 0.55, y1: 0.05 },
      ],
      100,
      100,
      0,
    );
    expect(boxes).toEqual([{ x: 0, y: 0, w: 60, h: 10 }]);
  });
});

describe("ocrCanvasRegions", () => {
  it("returns the words in the WHOLE page's raster space, one read per box", async () => {
    const drawn: number[][] = [];
    const canvasMod = {
      createCanvas: () => ({
        getContext: () => ({ fillRect() {}, drawImage: (_c: unknown, ...a: number[]) => drawn.push(a), fillStyle: "" }),
        encode: async () => new Uint8Array([1]),
      }),
    };
    const res = await ocrCanvasRegions(canvasMod, {}, [{ x: 100, y: 200, w: 50, h: 30 }, { x: 0, y: 0, w: 10, h: 10 }], "fra");
    expect(drawn[0]).toEqual([100, 200, 50, 30, 0, 0, 50, 30]);
    expect(res.words[0]).toMatchObject({ x0: 105, y0: 206, x1: 140, y1: 220 });
    expect(res.words[1]).toMatchObject({ x0: 5, y0: 6 });
    expect(res.engines).toEqual(["stub", "stub"]);
    expect(res.text).toContain("SCEAU");
  });
});
