import { describe, it, expect, vi } from "vitest";
import { extractFromBytes, redactExtracted, type ExtractDeps } from "./core";

const enc = (s: string) => new TextEncoder().encode(s);

// Fake parsers so the DISPATCH is tested without any Node/browser lib.
const deps = (): ExtractDeps => ({
  // A DENSE text layer (a real digital PDF has hundreds of chars/page) so the density gate
  // keeps it as a text-layer PDF (no OCR) — a thin/sparse layer would route to OCR instead.
  pdfText: vi.fn(async () => ({
    text:
      "Facture n° INV-2024-0042 — client amelie@example.com — total 1 234,56 € — " +
      "adresse 12 rue des Fleurs, 75001 Paris — date 2024-05-01 — merci de votre confiance.",
    pages: 1,
  })),
  docxText: vi.fn(async () => "docx text"),
  ocrImage: vi.fn(async () => "ocr image"),
  ocrPdf: vi.fn(async () => "ocr scanned"),
});

describe("extractFromBytes — format dispatch", () => {
  it("plain text is decoded (no dep)", async () => {
    const d = deps();
    const f = await extractFromBytes(enc("hello a@b.com"), { name: "note.txt" }, d);
    expect(f.kind).toBe("text");
    expect(f.text).toBe("hello a@b.com");
    expect(d.pdfText).not.toHaveBeenCalled();
  });

  it(".csv → kind csv", async () => {
    const f = await extractFromBytes(enc("a,b\n1,2"), { name: "x.csv" }, deps());
    expect(f.kind).toBe("csv");
  });

  it("PDF with a text layer → text layer stays primary, OCR is the 2nd layer (always-OCR)", async () => {
    const d = deps();
    const f = await extractFromBytes(enc("%PDF"), { name: "doc.pdf" }, d);
    expect(f.kind).toBe("pdf");
    expect(f.text).toContain("amelie@example.com"); // exact text layer = primary (model-facing)
    expect(d.ocrPdf).toHaveBeenCalled(); // ALWAYS OCR now (catches image-only PII)
    expect(f.ocrText).toBe("ocr scanned"); // the OCR second layer is surfaced
  });

  it("scanned PDF (empty text layer) → ocrPdf fallback", async () => {
    const d = { ...deps(), pdfText: vi.fn(async () => "") };
    const f = await extractFromBytes(enc("%PDF"), { name: "scan.pdf" }, d);
    expect(d.ocrPdf).toHaveBeenCalled();
    expect(f.text).toBe("ocr scanned");
  });

  it("image → ocrImage", async () => {
    const d = deps();
    const f = await extractFromBytes(enc("\x89PNG"), { name: "card.png" }, d);
    expect(d.ocrImage).toHaveBeenCalled();
    expect(f.kind).toBe("image");
  });

  it("mime picks the format when the name has no extension", async () => {
    const d = deps();
    const f = await extractFromBytes(enc("x"), { name: "blob", mime: "application/pdf" }, d);
    expect(f.kind).toBe("pdf");
  });

  it("safety guard REFUSES a type-mismatched file (a .pdf that is really a ZIP) → blocked, no parser call", async () => {
    const d = deps();
    // "PK\x03\x04…" = a ZIP local-file-header signature, declared as .pdf.
    const zipAsPdf = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const f = await extractFromBytes(zipAsPdf, { name: "invoice.pdf" }, d);
    expect(f.blocked).toBe(true);
    expect(f.text).toBe("");
    expect(f.error).toMatch(/ne correspond pas/i);
    expect(d.pdfText).not.toHaveBeenCalled(); // guard runs BEFORE any parser
  });

  it("unsupported type → error, empty text, no throw", async () => {
    const f = await extractFromBytes(enc("x"), { name: "a.heic" }, deps());
    expect(f.text).toBe("");
    expect(f.error).toMatch(/Unsupported/);
  });

  it("image OCR failure → a CLEAN message, never the raw technical error", async () => {
    // The exact leak the user hit: a missing-package error carrying an app.asar path.
    const d = {
      ...deps(),
      ocrImage: vi.fn(async () => {
        throw new Error(
          "Cannot find package 'tesseract.js' imported from /Applications/Acme.app/Contents/Resources/app.asar/out/main/index.js",
        );
      }),
    };
    const f = await extractFromBytes(enc("\x89PNG"), { name: "card.png" }, d);
    expect(f.error).toBeTruthy();
    expect(f.error).not.toMatch(/tesseract|app\.asar|Cannot find|imported from|\//);
    // Le repli CONSTATE l'échec sans le diagnostiquer : une cause inconnue (ici un module
    // manquant, ailleurs un plantage du binding) ne doit pas se présenter comme un verdict
    // sur l'appareil (« OCR indisponible sur cet appareil » alors que les modèles sont là).
    expect(f.error).toMatch(/reconnaissance de texte a échoué/i);
    expect(f.error).not.toMatch(/indisponible sur cet appareil/i);
  });

  it("image OCR failure → a deliberate FR message passes through untouched", async () => {
    const clean = "moteur OCR indisponible (tesseract.js n'a pas pu être chargé — module manquant) — réinstallez l'application";
    const d = { ...deps(), ocrImage: vi.fn(async () => { throw new Error(clean); }) };
    const f = await extractFromBytes(enc("\x89PNG"), { name: "card.png" }, d);
    expect(f.error).toBe(clean);
  });

  it("redactExtracted scrubs the extracted text into a reversible wire+vault", () => {
    const r = redactExtracted({ name: "n", kind: "text", text: "mail joe@x.com", chars: 14 });
    expect(r.wire).not.toContain("joe@x.com");
    expect(Object.values(r.vault)).toContain("joe@x.com");
  });
});
