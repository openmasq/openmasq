import { describe, it, expect, vi } from "vitest";
import { extractFromBytes, DEFAULT_OCR_MARKERS, type ExtractDeps } from "./core";
import { cleanErr, DocumentError } from "./errors";
import { guardUpload, guardUploadRefusal, MAX_FILE_BYTES } from "./safety/guard";

// Every user-facing extraction failure carries a STABLE code, so a caller can word it in
// the user's language; the French text stays the fallback, unchanged.

const enc = (s: string) => new TextEncoder().encode(s);
const deps = (over: Partial<ExtractDeps> = {}): ExtractDeps => ({
  pdfText: vi.fn(async () => ""),
  docxText: vi.fn(async () => ""),
  ocrImage: vi.fn(async () => ""),
  ocrPdf: vi.fn(async () => ""),
  ...over,
});

describe("guard refusals carry a code and keep their fallback text", () => {
  it("oversize → file_too_large with its MB cap", () => {
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    const r = guardUploadRefusal(big, ".txt");
    expect(r?.code).toBe("file_too_large");
    expect(r?.params?.mb).toBe(50);
    expect(guardUpload(big, ".txt")).toBe(r?.message);
  });

  it("an executable posing as a document → executable", () => {
    expect(guardUploadRefusal(new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1, 0]), ".pdf")?.code).toBe("executable");
  });

  it("a .pdf that is a ZIP → type_mismatch", () => {
    expect(guardUploadRefusal(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]), ".pdf")?.code).toBe("type_mismatch");
  });

  it("a refused file comes out blocked, coded, with its numbers", async () => {
    const f = await extractFromBytes(new Uint8Array(MAX_FILE_BYTES + 1), { name: "big.txt" }, deps());
    expect(f.blocked).toBe(true);
    expect(f.errorCode).toBe("file_too_large");
    expect(f.errorParams).toEqual({ mb: 50 });
  });
});

describe("OCR failures carry a code", () => {
  it("a typed engine error keeps its code", () => {
    const c = cleanErr(new DocumentError("pdf_renderer_missing", "PDF rendering engine unavailable"), "fallback");
    expect(c.code).toBe("pdf_renderer_missing");
  });

  it("an untyped curated wording maps to its code (docTR's own errors)", () => {
    expect(cleanErr(new Error("OCR engine docTR incompatible (onnxruntime-node)"), "f").code).toBe("ocr_engine_incompatible");
    expect(cleanErr(new Error("OCR engine docTR unavailable (onnxruntime-node missing)"), "f").code).toBe("ocr_engine_missing");
  });

  it("an unknown cause is hidden behind the fallback and coded ocr_failed", () => {
    const c = cleanErr(new Error("Cannot find package x"), "fallback");
    expect(c).toMatchObject({ message: "fallback", code: "ocr_failed" });
  });

  it("a scanned PDF whose OCR fails is coded", async () => {
    const d = deps({ ocrPdf: vi.fn(async () => Promise.reject(new Error("boom"))) });
    const f = await extractFromBytes(enc("%PDF"), { name: "scan.pdf" }, d);
    expect(f.errorCode).toBe("ocr_failed");
    expect(f.error).toMatch(/PDF without a text layer/);
  });

  it("an unsupported type is coded with its extension", async () => {
    const f = await extractFromBytes(enc("x"), { name: "a.xyz" }, deps());
    expect(f).toMatchObject({ errorCode: "unsupported_type", errorParams: { ext: ".xyz" } });
  });
});

describe("OCR markers are the caller's wording", () => {
  it("the default is English", () => {
    expect(DEFAULT_OCR_MARKERS.pageTooLarge(3)).toBe("[… page 3 not OCR'd: dimensions too large]");
  });

  it("extractFromBytes threads the caller's markers to the OCR binding (4th argument)", async () => {
    const ocrPdf = vi.fn(async () => "");
    const markers = { pageTooLarge: (n: number) => `skip ${n}` };
    await extractFromBytes(enc("%PDF"), { name: "s.pdf", ocrMarkers: markers }, deps({ ocrPdf }));
    expect(ocrPdf).toHaveBeenCalledWith(expect.any(Uint8Array), undefined, undefined, markers, undefined, undefined);
  });
});
