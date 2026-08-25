import { describe, it, expect, vi } from "vitest";

/* ⏱ These cases load a REAL document library (pdf.js, xlsx, mammoth) and parse a real
   fixture — the work itself is well under a second, but each test FILE pays the library
   import in its own worker, so the 5s default is a MODULE-LOAD budget, not an assertion
   budget. On a runner busy with other files it can exceed 5s and fail with no bug behind
   it. 20s is insurance, not tolerance for slowness: a genuine hang still fails, just
   later. Give a new file in this family the same budget — it pays the same import. */
vi.setConfig({ testTimeout: 20_000 });

/* Regression: a SCANNED PDF (no text layer) is run through pdf.js TWICE — once to
   read its (empty) text layer, once to rasterise for OCR. pdf.js takes OWNERSHIP
   of the `data` typed array and DETACHES its ArrayBuffer, so reusing the SAME bytes
   for the OCR pass threw "Cannot transfer object of unsupported type" and the scan
   silently failed. The fix hands pdf.js a COPY at each call so the caller's bytes
   survive. This mock EMULATES that detach (via ArrayBuffer.prototype.transfer) and
   asserts the OCR fallback still receives non-empty bytes. */

// pdf.js primary text pass: report an EMPTY text layer (→ OCR fallback) AND detach
// the buffer it was handed, exactly like the real lib.
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: ({ data }: { data: Uint8Array }) => {
    // Emulate pdf.js taking ownership of the input buffer.
    (data.buffer as { transfer?: () => void }).transfer?.();
    return {
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({ getTextContent: async () => ({ items: [] }), cleanup() {} }),
        destroy() {},
      }),
    };
  },
}));

let ocrReceived: Uint8Array | null = null;
vi.mock("./ocr", () => ({
  ocrImage: vi.fn(async () => ""),
  ocrPdf: vi.fn(async (bytes: Uint8Array) => {
    ocrReceived = bytes;
    return "amelie.brivet@example.com";
  }),
}));

import { extractBytes } from "./documents/documents";

describe("scanned PDF → OCR fallback survives pdf.js buffer ownership", () => {
  it("hands OCR an intact (non-detached) buffer after the text pass", async () => {
    const bytes = new Uint8Array(64).fill(37); // '%' — a stand-in PDF body
    const f = await extractBytes(bytes, "scan.pdf", "application/pdf");
    expect(ocrReceived).not.toBeNull();
    // The bug: the text pass detached these bytes → OCR got byteLength 0.
    expect(ocrReceived!.byteLength).toBeGreaterThan(0);
    expect(f.text).toContain("amelie.brivet@example.com");
    expect(f.error).toBeUndefined();
  });
});
