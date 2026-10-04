import { describe, expect, it } from "vitest";
import { isBlankRaster } from "./blank";

const raster = (pixels: [number, number, number, number][]) => new Uint8ClampedArray(pixels.flat());

describe("isBlankRaster — only a page with no ink at all skips OCR", () => {
  it("white and transparent pixels are paper", () => {
    expect(isBlankRaster(raster([[255, 255, 255, 255], [0, 0, 0, 0], [252, 251, 250, 255]]))).toBe(true);
  });

  it("one dark pixel, a faint grey, a coloured one, an anti-aliased edge: ink — the page is read", () => {
    expect(isBlankRaster(raster([[255, 255, 255, 255], [0, 0, 0, 255]]))).toBe(false);
    expect(isBlankRaster(raster([[240, 240, 240, 255]]))).toBe(false);
    expect(isBlankRaster(raster([[255, 255, 200, 255]]))).toBe(false);
    expect(isBlankRaster(raster([[0, 0, 0, 12]]))).toBe(false);
  });
});
