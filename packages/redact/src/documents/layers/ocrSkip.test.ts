import { describe, it, expect } from "vitest";
import { pageNeedsOcr, pageOcrRegions } from "./ocrSkip";

// A page skips OCR only when every fact PROVES its text layer holds what it shows; any
// unknown answers « OCR it » (allow-list, fail closed).
const DENSE = "Le locataire s'engage à payer le loyer convenu à chaque échéance, charges comprises. ".repeat(3);
const ok = { text: DENSE, paintsImage: false, annotations: [] as string[] };

describe("pageNeedsOcr", () => {
  it("a dense, clean, image-free page with only links skips OCR", () => {
    expect(pageNeedsOcr(ok)).toBe(false);
    expect(pageNeedsOcr({ ...ok, annotations: ["Link", "Link"] })).toBe(false);
  });

  it("an image anywhere on the page (a stamp, a scanned insert) is OCR'd", () => {
    expect(pageNeedsOcr({ ...ok, paintsImage: true })).toBe(true);
  });

  it("a filled form field, a stamp or a note annotation is OCR'd: the layer lacks its value", () => {
    for (const a of ["Widget", "Stamp", "FreeText", "Ink", "Text"]) {
      expect(pageNeedsOcr({ ...ok, annotations: ["Link", a] })).toBe(true);
    }
  });

  it("UNKNOWN facts fail closed: an unread operator list or annotation list means OCR", () => {
    expect(pageNeedsOcr({ ...ok, paintsImage: null })).toBe(true);
    expect(pageNeedsOcr({ ...ok, annotations: null })).toBe(true);
  });

  it("a sparse page, or a layer with ANY debris (glyph codes), is OCR'd", () => {
    expect(pageNeedsOcr({ ...ok, text: "Page 3 / 12" })).toBe(true);
    expect(pageNeedsOcr({ ...ok, text: DENSE + "\u0001" })).toBe(true);
    expect(pageNeedsOcr({ ...ok, text: DENSE + "" })).toBe(true);
  });
});

describe("pageOcrRegions", () => {
  const logo = [{ x0: 0.05, y0: 0.03, x1: 0.2, y1: 0.08 }];
  const withImage = { ...ok, paintsImage: true, regions: logo };

  it("a dense, clean page whose ONLY unproved content is a bounded image reads just that image", () => {
    expect(pageOcrRegions(withImage)).toEqual(logo);
  });

  it("any other reason to OCR reads the WHOLE page", () => {
    expect(pageOcrRegions({ ...withImage, text: "Page 3 / 12" })).toBeNull();
    expect(pageOcrRegions({ ...withImage, text: DENSE + "\u0001" })).toBeNull();
    expect(pageOcrRegions({ ...withImage, annotations: ["Widget"] })).toBeNull();
    expect(pageOcrRegions({ ...withImage, annotations: null })).toBeNull();
  });

  it("an image it could not bound, an unknown image fact, or no image reads the whole page", () => {
    expect(pageOcrRegions({ ...withImage, regions: null })).toBeNull();
    expect(pageOcrRegions({ ...withImage, regions: [] })).toBeNull();
    expect(pageOcrRegions({ ...withImage, paintsImage: null })).toBeNull();
  });

  it("images covering most of the page are read as one page", () => {
    expect(pageOcrRegions({ ...withImage, regions: [{ x0: 0, y0: 0, x1: 1, y1: 0.7 }] })).toBeNull();
  });
});
