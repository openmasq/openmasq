import { describe, it, expect, vi } from "vitest";
import { extractFromBytes, redactExtracted, type ExtractDeps, type ExtractedFile } from "./core";

// Minimal valid-magic PDF bytes so `guardUpload` accepts the .pdf (it checks `%PDF`).
const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n% test document\n");

function makeDeps(
  pdfText: ExtractDeps["pdfText"],
  ocrPdf: ExtractDeps["ocrPdf"],
): ExtractDeps {
  return {
    pdfText,
    docxText: async () => "",
    ocrImage: async () => "",
    ocrPdf,
    ocrImageLayout: async () => ({ text: "", words: [] }),
  };
}

/* A SCANNED form/RIB often carries a THIN pdf.js text layer (a header/footer) that clears
   the bare `PDF_TEXT_MIN` yet holds NONE of the real content — so OCR was skipped and
   nothing got detected/redacted (the reported "RIB → aucun élément détecté"). The density
   gate (`PDF_MIN_CHARS_PER_PAGE`) now routes such a PDF to OCR too. */
describe("PDF text-density → OCR routing", () => {
  it("routes a THIN text layer OVER AN IMAGE to OCR — the scanned-RIB case", async () => {
    const ocrPdf = vi.fn(async () => ({
      text: "IBAN FR76 3000 4000 0512 3456 789 — Jean Rebour, 12 rue des Fleurs",
      meta: { engine: "doctr", ms: 10 },
    }));
    // 28 chars: > PDF_TEXT_MIN (16) so the OLD check skipped OCR; sparse (<120) AND the page
    // carries an image (imagePages:1 = a scan) → now routes to OCR.
    const deps = makeDeps(async () => ({ text: "Banque — Relevé RIB page 182", pages: 1, imagePages: 1 }), ocrPdf);
    const f = await extractFromBytes(PDF_BYTES, { name: "182 RIB.pdf" }, deps);
    expect(ocrPdf).toHaveBeenCalled();
    expect(f.text).toContain("FR76"); // the real content OCR recovered
    expect(f.ocr?.engine).toBe("doctr"); // Debug Log shows the OCR engine, not pdf-text
  });

  // ALWAYS-OCR / two-layer contract: OCR now runs on EVERY PDF (even a clean digital one),
  // because text baked into page images is invisible to the pdf.js text layer. The text layer
  // stays the PRIMARY `text`; the OCR result becomes the additive `ocrText` SECOND layer.
  it("SHORT DIGITAL page: keeps text layer as primary, exposes OCR as the 2nd layer", async () => {
    const ocrPdf = vi.fn(async () => ({ text: "garbled", meta: { engine: "doctr", ms: 1 } }));
    const deps = makeDeps(async () => ({ text: "Note: contact a@b.com", pages: 1, imagePages: 0 }), ocrPdf);
    const f = await extractFromBytes(PDF_BYTES, { name: "note.pdf" }, deps);
    expect(ocrPdf).toHaveBeenCalled(); // ALWAYS OCR now
    expect(f.text).toContain("a@b.com"); // exact text layer is primary (model-facing)
    expect(f.ocrText).toBe("garbled"); // the OCR second layer is surfaced
    expect(f.ocr?.engine).toBe("pdf-text+doctr"); // Debug Log shows both ran
  });

  it("DENSE text layer: still OCR'd, text layer primary, OCR is the 2nd layer", async () => {
    const ocrPdf = vi.fn(async () => ({ text: "x", meta: { engine: "doctr", ms: 1 } }));
    const deps = makeDeps(async () => ({ text: "a".repeat(600), pages: 1, imagePages: 0 }), ocrPdf);
    const f = await extractFromBytes(PDF_BYTES, { name: "invoice.pdf" }, deps);
    expect(ocrPdf).toHaveBeenCalled();
    expect(f.text).toBe("a".repeat(600)); // dense layer kept as primary
    expect(f.ocrText).toBe("x"); // OCR second layer differs → surfaced
    expect(f.ocr?.engine).toBe("pdf-text+doctr");
  });

  it("does not DOWNGRADE a thin-scan layer when OCR yields LESS (keeps text, OCR = 2nd layer)", async () => {
    const ocrPdf = vi.fn(async () => ({ text: "x", meta: { engine: "tesseract", ms: 1 } }));
    const deps = makeDeps(async () => ({ text: "Relevé bancaire RIB", pages: 1, imagePages: 1 }), ocrPdf);
    const f = await extractFromBytes(PDF_BYTES, { name: "thin.pdf" }, deps);
    expect(ocrPdf).toHaveBeenCalled();
    expect(f.text).toBe("Relevé bancaire RIB"); // kept (OCR shorter → no downgrade of the primary)
    expect(f.ocrText).toBe("x"); // OCR still surfaced as the 2nd layer (fail-closed: may hold image-only PII)
    expect(f.ocr?.engine).toBe("pdf-text+tesseract");
  });

  it("an EMPTY text layer still routes to OCR even with no image reported", async () => {
    const ocrPdf = vi.fn(async () => ({ text: "OCR content here", meta: { engine: "tesseract", ms: 1 } }));
    const deps = makeDeps(async () => ({ text: "", pages: 1, imagePages: 0 }), ocrPdf);
    await extractFromBytes(PDF_BYTES, { name: "empty.pdf" }, deps);
    expect(ocrPdf).toHaveBeenCalled(); // noLayer branch (independent of imagePages)
  });
});

/* Two-layer UNION detection: a value present ONLY in the page image (the OCR layer) — e.g.
   an email in a scanned stamp the pdf.js text layer can't see — must still be redacted and
   reported, even though `wire` (model-facing) is built from the clean text layer. */
describe("redactExtracted — two-layer union", () => {
  it("redacted a value found ONLY in the OCR second layer", () => {
    const file: ExtractedFile = {
      name: "contract.pdf",
      kind: "pdf",
      text: "Contrat de prestation. Montant total 1000 EUR.", // clean text layer, no PII
      chars: 47,
      ocrText: "Contrat de prestation. Signé: secret.person@example.com", // email only in the image
    };
    const out = redactExtracted(file);
    // The email lived only in the OCR layer → still detected + vaulted (fail-closed).
    expect(out.matches.some((m) => m.value === "secret.person@example.com")).toBe(true);
    // But the model-facing `wire` is built from the CLEAN text layer (no garbled OCR).
    expect(out.wire).toContain("Montant total");
    expect(out.wire).not.toContain("secret.person@example.com");
  });
});
