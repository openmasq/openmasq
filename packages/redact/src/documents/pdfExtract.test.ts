import { describe, it, expect, vi } from "vitest";
import { extractFromBytes, type ExtractDeps } from "./core";
import { CHARS_PER_PAGE, MAX_MASK_CHARS } from "./safety/maskBudget";

// A PDF is read WHOLE or not at all (`pdfExtract.ts`): no page cap, a refusal decided
// BEFORE the first page is rasterised, and an OCR failure fails the FILE.

const PDF = new TextEncoder().encode("%PDF-1.4\n% test\n");
const DENSE = "Contrat de bail entre les parties soussignées, conclu pour une durée de trois ans. ".repeat(3);

function deps(pdfText: ExtractDeps["pdfText"], ocrPdf: ExtractDeps["ocrPdf"]): ExtractDeps {
  return { pdfText, ocrPdf, docxText: async () => "", ocrImage: async () => "" };
}
const digital = (pages: number, needsOcr?: number[]) => async () => ({
  text: Array.from({ length: pages }, () => DENSE).join("\n\f\n"),
  pages,
  imagePages: 0,
  needsOcr,
});

describe("OCR reads every page it must, and only those", () => {
  it("a digital PDF whose every page is proved complete is NOT rasterised", async () => {
    const ocrPdf = vi.fn(async () => "");
    const f = await extractFromBytes(PDF, { name: "bail.pdf" }, deps(digital(3, []), ocrPdf));
    expect(ocrPdf).not.toHaveBeenCalled();
    expect(f).toMatchObject({ kind: "pdf", ocr: { engine: "pdf-text" } });
    expect(f.text).toContain("Contrat de bail");
    expect(f.error).toBeUndefined();
  });

  it("a digital PDF OCRs exactly the pages its layer could not prove (3rd argument)", async () => {
    const ocrPdf = vi.fn(async () => ({ text: "Tampon : Jean Rebour", meta: { engine: "doctr", ms: 1, pages: 1 } }));
    const f = await extractFromBytes(PDF, { name: "bail.pdf" }, deps(digital(3, [2]), ocrPdf));
    expect(ocrPdf).toHaveBeenCalledWith(expect.any(Uint8Array), undefined, [2], undefined, undefined, undefined);
    expect(f.ocrText).toBe("Tampon : Jean Rebour");
    expect(f.text).toContain("Contrat de bail"); // the layer stays primary
  });

  it("a binding that cannot tell (no `needsOcr`) gets EVERY page read", async () => {
    const ocrPdf = vi.fn(async () => "");
    await extractFromBytes(PDF, { name: "a.pdf" }, deps(digital(2), ocrPdf));
    expect(ocrPdf).toHaveBeenCalledWith(expect.any(Uint8Array), undefined, undefined, undefined, undefined, undefined);
  });

  it("a scan reads EVERY page, whatever the binding listed (its OCR becomes the text)", async () => {
    const ocrPdf = vi.fn(async () => "IBAN FR76 3000 4000 0512 3456 789");
    const scan = async () => ({ text: "", pages: 30, imagePages: 30, needsOcr: [1] });
    const f = await extractFromBytes(PDF, { name: "scan.pdf" }, deps(scan, ocrPdf));
    expect(ocrPdf).toHaveBeenCalledWith(expect.any(Uint8Array), undefined, undefined, undefined, undefined, undefined);
    expect(f.text).toContain("FR76");
  });

  it("a digital PDF hands the image regions on (6th argument); a scan never does", async () => {
    const logo = { 2: [{ x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.15 }] };
    const ocrPdf = vi.fn(async () => "");
    await extractFromBytes(PDF, { name: "bail.pdf" }, deps(async () => ({ ...(await digital(3, [2])()), ocrRegions: logo }), ocrPdf));
    expect((ocrPdf.mock.calls[0] as unknown[])[5]).toEqual(logo);
    ocrPdf.mockClear();
    // A scan's OCR may become the text: it must cover each page whole.
    const scan = async () => ({ text: "", pages: 3, imagePages: 3, needsOcr: [2], ocrRegions: logo });
    await extractFromBytes(PDF, { name: "scan.pdf" }, deps(scan, ocrPdf));
    expect((ocrPdf.mock.calls[0] as unknown[])[5]).toBeUndefined();
  });
});

describe("a document too long to mask in full is refused BEFORE OCR", () => {
  const pagesOver = Math.floor(MAX_MASK_CHARS / CHARS_PER_PAGE) + 1;

  it("a scan whose page estimate passes MAX_MASK_CHARS: refused, blocked, never rasterised", async () => {
    const ocrPdf = vi.fn(async () => "x");
    const scan = async () => ({ text: "", pages: pagesOver, imagePages: pagesOver });
    const f = await extractFromBytes(PDF, { name: "gros.pdf" }, deps(scan, ocrPdf));
    expect(ocrPdf).not.toHaveBeenCalled();
    expect(f).toMatchObject({ text: "", blocked: true, errorCode: "too_long_to_mask" });
    expect(f.errorParams?.pages).toBeGreaterThan(MAX_MASK_CHARS / CHARS_PER_PAGE);
  });

  it("a scan just under the estimate is read", async () => {
    const ocrPdf = vi.fn(async () => "lu");
    const n = Math.floor(MAX_MASK_CHARS / CHARS_PER_PAGE);
    const scan = async () => ({ text: "", pages: n, imagePages: n });
    const f = await extractFromBytes(PDF, { name: "ok.pdf" }, deps(scan, ocrPdf));
    expect(ocrPdf).toHaveBeenCalledOnce();
    expect(f.error).toBeUndefined();
  });

  it("a digital PDF whose text layer is already past the limit is refused before OCR", async () => {
    const ocrPdf = vi.fn(async () => "");
    const big = async () => ({ text: DENSE.repeat(Math.ceil(MAX_MASK_CHARS / DENSE.length) + 1), pages: 300, imagePages: 0, needsOcr: [1] });
    const f = await extractFromBytes(PDF, { name: "big.pdf" }, deps(big, ocrPdf));
    expect(ocrPdf).not.toHaveBeenCalled();
    expect(f).toMatchObject({ blocked: true, errorCode: "too_long_to_mask", text: "" });
  });
});

describe("an OCR failure fails the FILE — never a text missing pages", () => {
  it("a DIGITAL PDF whose image pages could not be read is in error, with no text", async () => {
    const ocrPdf = vi.fn(async () => Promise.reject(new Error("worker died at page 2")));
    const f = await extractFromBytes(PDF, { name: "bail.pdf" }, deps(digital(4, [2, 4]), ocrPdf));
    expect(f.text).toBe("");
    expect(f.chars).toBe(0);
    expect(f).toMatchObject({ errorCode: "ocr_failed", errorParams: { unread: 2 } });
    expect(f.blocked).toBeUndefined(); // a failure (retry), not a refusal
    expect(f.error).not.toMatch(/worker died/); // the raw cause stays out of the UI
  });

  it("a SCAN whose OCR fails carries no thin-layer text either", async () => {
    const ocrPdf = vi.fn(async () => Promise.reject(new Error("boom")));
    const thin = async () => ({ text: "Relevé p.1", pages: 1, imagePages: 1 });
    const f = await extractFromBytes(PDF, { name: "scan.pdf" }, deps(thin, ocrPdf));
    expect(f.text).toBe("");
    expect(f.error).toMatch(/PDF without a text layer/);
  });
});
