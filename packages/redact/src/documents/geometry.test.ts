import { describe, it, expect } from "vitest";
import { extractFromBytes, type ExtractDeps } from "./core";
import { buildTextLayerPage, type OcrLayerPage, type TextLayerPage } from "./geometry";
import { reconstructPageText, type PdfTextItem } from "./pdfLayout";

const item = (str: string, x: number, y: number, w = 20, h = 10): PdfTextItem => ({
  str,
  transform: [1, 0, 0, h, x, y],
  width: w,
  height: h,
});

describe("buildTextLayerPage", () => {
  it("emits the SAME text as the positional render (one reconstruction, two uses)", () => {
    const items = [item("Nom :", 50, 700, 30), item("Rebour", 90, 700, 40)];
    const page = buildTextLayerPage(items, 595, 842);
    expect(page.text).toBe(reconstructPageText(items));
    expect(page.width).toBe(595);
    expect(page.height).toBe(842);
  });

  it("boxes stay PARALLEL to the original items array (runs[i].itemIndex indexes them)", () => {
    const items = [
      item("Rebour", 90, 700, 40),
      { str: "   ", transform: [1, 0, 0, 10, 130, 700], width: 4, height: 10 }, // spacing-only
      item("Lyon", 200, 700, 30),
    ];
    const page = buildTextLayerPage(items, 595, 842);
    expect(page.boxes.length).toBe(3); // parallel, INCLUDING the skipped spacing item
    const lyon = page.runs.find((r) => r.str === "Lyon")!;
    expect(page.boxes[lyon.itemIndex]).toMatchObject({ x: 200, y: 700, w: 30, h: 10 });
  });
});

// The geometry must SURVIVE extraction: both layers' per-page boxes ride out on
// `ExtractedFile` (`textPages` / `ocrPages`) — the raw material of the spatial alignment.
describe("extractFromBytes — layer geometry threading", () => {
  const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n% test document\n");
  const textPage: TextLayerPage = buildTextLayerPage([item("Note: contact a@b.com", 50, 700, 150)], 595, 842);
  const ocrPage: OcrLayerPage = {
    text: "Note: contact a@b.com",
    words: [{ text: "Note:", x0: 100, y0: 280, x1: 160, y1: 300 }],
    width: 1190,
    height: 1684,
  };
  const makeDeps = (pdfText: ExtractDeps["pdfText"], ocrPdf: ExtractDeps["ocrPdf"]): ExtractDeps => ({
    pdfText,
    docxText: async () => "",
    ocrImage: async () => "",
    ocrPdf,
    ocrImageLayout: async () => ({ text: "", words: [] }),
  });

  it("digital PDF: carries BOTH layers' page geometry out", async () => {
    const deps = makeDeps(
      async () => ({ text: textPage.text, pages: 1, imagePages: 0, layout: [textPage] }),
      async () => ({ text: "garbled", meta: { engine: "doctr", ms: 1 }, layout: [ocrPage] }),
    );
    const f = await extractFromBytes(PDF_BYTES, { name: "note.pdf" }, deps);
    expect(f.textPages).toEqual([textPage]);
    expect(f.ocrPages).toEqual([ocrPage]);
  });

  it("scan (OCR promoted to primary): DROPS textPages, keeps ocrPages", async () => {
    const deps = makeDeps(
      async () => ({ text: "", pages: 1, imagePages: 1, layout: [] }),
      async () => ({ text: "OCR content here", meta: { engine: "tesseract", ms: 1 }, layout: [ocrPage] }),
    );
    const f = await extractFromBytes(PDF_BYTES, { name: "scan.pdf" }, deps);
    expect(f.text).toBe("OCR content here");
    expect(f.textPages).toBeUndefined(); // the text layer no longer describes `text`
    expect(f.ocrPages).toEqual([ocrPage]);
  });

  it("bindings WITHOUT geometry (browser / flat fallback) still extract, geometry absent", async () => {
    const deps = makeDeps(
      async () => ({ text: "Note: contact a@b.com", pages: 1, imagePages: 0 }),
      async () => "garbled",
    );
    const f = await extractFromBytes(PDF_BYTES, { name: "note.pdf" }, deps);
    expect(f.text).toContain("a@b.com");
    expect(f.textPages).toBeUndefined();
    expect(f.ocrPages).toBeUndefined();
  });
});
