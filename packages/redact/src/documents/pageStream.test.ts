// The preview stream of a PDF being read (`pageStream.ts`): thumbnails unreadable BY
// CONSTRUCTION (one pinned pixel bound, re-checked on the PNG header), and streamed pages that
// assemble into a PREFIX of the final text — never a text that disagrees with it.
import { describe, expect, it } from "vitest";
import {
  isSafeThumbnail, pngSize, streamedPrefix, thumbScale, THUMB_MAX_BYTES, THUMB_MAX_HEIGHT_PX, THUMB_MAX_WIDTH_PX,
} from "./pageStream";
import { PAGE_BREAK } from "./pageBreak";

/** A minimal PNG header (signature + IHDR) of the given size — enough for the checks. */
function pngHeader(width: number, height: number, pad = 0): Uint8Array {
  const out = new Uint8Array(33 + pad);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(out.buffer);
  dv.setUint32(16, width);
  dv.setUint32(20, height);
  return out;
}

describe("thumbnail bound", () => {
  it("is pinned: 40 px wide, 80 px tall at most", () => {
    // Changing these makes thumbnails MORE legible: a deliberate, reviewed change only.
    expect(THUMB_MAX_WIDTH_PX).toBe(40);
    expect(THUMB_MAX_HEIGHT_PX).toBe(80);
  });

  it.each([
    [595, 842], // A4
    [612, 792], // Letter
    [842, 595], // A4 landscape
    [28_800, 28_800], // the format's maximum
    [200, 14_400], // a receipt roll
    [10, 10], // a tiny page is NOT scaled up past the bound
  ])("a %i×%i pt page renders within the bound", (w, h) => {
    const s = thumbScale(w, h)!;
    expect(Math.floor(w * s)).toBeLessThanOrEqual(THUMB_MAX_WIDTH_PX);
    expect(Math.floor(h * s)).toBeLessThanOrEqual(THUMB_MAX_HEIGHT_PX);
  });

  it("refuses a page with no usable geometry", () => {
    expect(thumbScale(0, 842)).toBeNull();
    expect(thumbScale(Number.NaN, 842)).toBeNull();
    expect(thumbScale(595, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("main's check refuses a PNG over the bound, a non-PNG, an oversized file", () => {
    expect(pngSize(pngHeader(40, 57))).toEqual({ width: 40, height: 57 });
    expect(isSafeThumbnail(pngHeader(40, 57))).toBe(true);
    expect(isSafeThumbnail(pngHeader(41, 57))).toBe(false);
    expect(isSafeThumbnail(pngHeader(40, 81))).toBe(false);
    expect(isSafeThumbnail(pngHeader(1200, 1700))).toBe(false);
    expect(isSafeThumbnail(pngHeader(0, 10))).toBe(false);
    expect(isSafeThumbnail(new TextEncoder().encode("\xff\xd8\xff not a png at all, a JPEG"))).toBe(false);
    expect(isSafeThumbnail(pngHeader(40, 57, THUMB_MAX_BYTES))).toBe(false);
  });
});

describe("streamedPrefix", () => {
  const pages = ["\n  Bail commercial", "Page deux", "", "Page quatre  \n"];
  const final = pages.join(PAGE_BREAK).trim(); // what the extractor returns

  it("every contiguous prefix is a prefix of the final text, growing by appending", () => {
    let previous = "";
    for (let k = 0; k <= pages.length; k++) {
      const { text, pages: count } = streamedPrefix(pages.slice(0, k));
      expect(count).toBe(k);
      expect(final.startsWith(text.trimEnd())).toBe(true);
      expect(text.startsWith(previous)).toBe(true);
      previous = text;
    }
    expect(streamedPrefix(pages).text.trim()).toBe(final);
  });

  it("stops at the first page not streamed yet (a hole is never skipped)", () => {
    expect(streamedPrefix(["a", undefined, "c"])).toEqual({ text: "a", pages: 1 });
  });
});
