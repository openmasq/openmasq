import { describe, it, expect, vi } from "vitest";
import { fileURLToPath } from "node:url";

/* ⏱ These cases load a REAL document library (pdf.js, xlsx, mammoth) and parse a real
   fixture — the work itself is well under a second, but each test FILE pays the library
   import in its own worker, so the 5s default is a MODULE-LOAD budget, not an assertion
   budget. On a runner busy with other files it can exceed 5s and fail with no bug behind
   it. 20s is insurance, not tolerance for slowness: a genuine hang still fails, just
   later. Give a new file in this family the same budget — it pays the same import. */
vi.setConfig({ testTimeout: 20_000 });

/* extractText's OCR DISPATCH, with ./ocr mocked (so no real OCR runs) and pdf.js
   forced to an empty text-layer to simulate a scanned PDF. Proves: image → ocrImage,
   scanned PDF → ocrPdf fallback, and OCR failure → graceful `error` (never a throw). */

vi.mock("./ocr", () => ({
  ocrImage: vi.fn(async () => "carte: amelie.brivet@example.com"),
  ocrImageLayout: vi.fn(async () => ({
    text: "carte: amelie.brivet@example.com",
    words: [{ text: "carte:", x0: 10, y0: 10, x1: 60, y1: 24 }],
    width: 640,
    height: 400,
  })),
  ocrPdf: vi.fn(async () => "scan: amelie.brivet@example.com"),
}));
// Empty text layer → triggers the scanned-PDF OCR fallback. pdf.js is the PRIMARY
// (and only, since pdf-parse was removed) text extractor — both the positional and the
// flat first-party fallback read `getTextContent`, so an empty items list routes to OCR.
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getTextContent: async () => ({ items: [] }),
        cleanup: () => {},
      }),
      destroy: () => {},
    }),
  }),
}));

import { extractText } from "./documents/documents";
import { ocrImage, ocrImageLayout, ocrPdf } from "./ocr";

const fx = (name: string) =>
  fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url));

describe("extractText — OCR dispatch", () => {
  it("image file → ocrImageLayout (keeps word boxes), kind 'image'", async () => {
    const f = await extractText(fx("business-card.png"));
    expect(ocrImageLayout).toHaveBeenCalled(); // positioned OCR now preferred (visual redaction)
    expect(ocrImage).not.toHaveBeenCalled();
    expect(f.kind).toBe("image");
    expect(f.error).toBeUndefined();
    expect(f.text).toContain("amelie.brivet@example.com");
  });

  it("scanned PDF (empty text layer) → ocrPdf fallback", async () => {
    const f = await extractText(fx("sample.pdf"));
    expect(ocrPdf).toHaveBeenCalled();
    expect(f.kind).toBe("pdf");
    expect(f.text).toContain("amelie.brivet@example.com");
  });

  it("image OCR failure → error, no throw", async () => {
    (ocrImageLayout as unknown as { mockRejectedValueOnce: (e: Error) => void })
      .mockRejectedValueOnce(new Error("no native binary"));
    const f = await extractText(fx("scanned-id.jpg"));
    expect(f.kind).toBe("image");
    expect(f.text).toBe("");
    // The fallback OBSERVES the failure; it does not DIAGNOSE it (15/08/2026: a
    // binding crash used to display « OCR indisponible sur cet appareil » even though
    // the models were indeed present — a false verdict, with no possible follow-up for the user).
    expect(f.error).toMatch(/la reconnaissance de texte a échoué/i);
    expect(f.error).not.toMatch(/indisponible sur cet appareil/i);
    expect(f.rawCause).toContain("no native binary"); // the real cause stays, for the log
  });
});

describe("géométrie d'image — l'incrément « ne plus jeter »", () => {
  it("une IMAGE océrisée avec dims gagne un ocrPages (le support photo entre dans le spatial)", async () => {
    const file = await extractText(fx("business-card.png"));
    expect(file.kind).toBe("image");
    expect(file.ocrPages).toHaveLength(1);
    expect(file.ocrPages![0]).toMatchObject({ width: 640, height: 400 });
    expect(file.ocrPages![0].words).toHaveLength(1);
  });
});
