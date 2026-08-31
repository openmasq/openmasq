import { describe, it, expect } from "vitest";
import { extractFromBytes, type ExtractDeps } from "./core";

// OCR progress is purely for DISPLAY: it must pass through extraction without ever
// altering it — same results with or without a callback, and no tick for a format
// that has no OCR (extraction there is near-instant).
describe("extractFromBytes — progression OCR (onOcrProgress)", () => {
  const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n% test document\n");
  const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

  const deps = (over: Partial<ExtractDeps> = {}): ExtractDeps => ({
    pdfText: async () => ({ text: "", pages: 2, imagePages: 2, layout: [] }),
    docxText: async () => "",
    ocrImage: async () => "texte lu",
    // The contract: the binding receives the callback in 2nd position and emits per page.
    ocrPdf: async (_bytes, onProgress) => {
      onProgress?.(0, 2);
      onProgress?.(1, 2);
      onProgress?.(2, 2);
      return { text: "page un\n\fpage deux", meta: { engine: "tesseract", ms: 1 } };
    },
    ...over,
  });

  it("PDF scanné : les ticks par page du binding remontent tels quels", async () => {
    const ticks: [number, number][] = [];
    const f = await extractFromBytes(
      PDF_BYTES,
      { name: "scan.pdf", onOcrProgress: (d, p) => ticks.push([d, p]) },
      deps(),
    );
    expect(f.text).toContain("page un");
    expect(ticks).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
  });

  it("image : le cadre 0/1 → 1/1 entoure l'unique passe OCR", async () => {
    const ticks: [number, number][] = [];
    const f = await extractFromBytes(
      PNG_BYTES,
      { name: "photo.png", onOcrProgress: (d, p) => ticks.push([d, p]) },
      deps({ ocrImageLayout: async () => ({ text: "lu", words: [] }) }),
    );
    expect(f.text).toBe("lu");
    expect(ticks).toEqual([
      [0, 1],
      [1, 1],
    ]);
  });

  it("format sans OCR (.txt) : aucun tick", async () => {
    const ticks: unknown[] = [];
    const f = await extractFromBytes(
      new TextEncoder().encode("du texte ordinaire"),
      { name: "note.txt", onOcrProgress: (...t) => ticks.push(t) },
      deps(),
    );
    expect(f.text).toBe("du texte ordinaire");
    expect(ticks).toEqual([]);
  });

  it("sans callback : extraction identique (le paramètre est purement additif)", async () => {
    const f = await extractFromBytes(PDF_BYTES, { name: "scan.pdf" }, deps());
    expect(f.text).toContain("page un");
  });
});
