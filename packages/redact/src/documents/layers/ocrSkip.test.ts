import { describe, it, expect } from "vitest";
import { pageNeedsOcr } from "./ocrSkip";

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
