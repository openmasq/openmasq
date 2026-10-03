import { mkdtempSync, writeFileSync, truncateSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// Same module-load budget as the other files that import the real document stack.
vi.setConfig({ testTimeout: 20_000 });

/* A document is read WHOLE or refused, never in part. Two doors pinned here:
   - a PDF past `MAX_PDF_PAGES` is refused before ANY page is read: a tail silently missing
     from what is masked and sent is a document the person believes handled whole;
   - a picked file past `MAX_FILE_BYTES` is refused on its STAT, before a byte is read. */

const pdf = vi.hoisted(() => ({ numPages: 0, getPage: vi.fn() }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: () => ({
    promise: Promise.resolve({
      get numPages() {
        return pdf.numPages;
      },
      getPage: pdf.getPage,
      destroy() {},
    }),
  }),
  OPS: { paintImageXObject: 85, paintJpegXObject: 82, paintImageMaskXObject: 83, paintInlineImageXObject: 86 },
}));

const ocr = vi.hoisted(() => ({ ocrPdf: vi.fn(async () => "texte océrisé") }));
vi.mock("./ocr", () => ({ ocrImage: vi.fn(async () => ""), ocrImageLayout: undefined, ocrPdf: ocr.ocrPdf }));

// Every read of a picked file goes through the handle `open` returns: spy on its readFile.
const fsSpy = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock("node:fs/promises", async (orig) => {
  const real = (await orig()) as typeof import("node:fs/promises");
  const open = async (...args: Parameters<typeof real.open>) => {
    const fh = await real.open(...args);
    fsSpy.readFile.mockImplementation(fh.readFile.bind(fh) as never);
    return Object.assign(fh, { readFile: fsSpy.readFile });
  };
  return { ...real, open };
});

import { extractBytes, extractText } from "./documents/documents";
import { MAX_FILE_BYTES, MAX_PDF_PAGES } from "./index";

const dir = mkdtempSync(join(tmpdir(), "redact-limits-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("PDF past the page cap", () => {
  it("is REFUSED with its page count — no page read, no OCR, no partial text", async () => {
    pdf.numPages = MAX_PDF_PAGES + 1;
    pdf.getPage.mockClear();
    ocr.ocrPdf.mockClear();
    const f = await extractBytes(new Uint8Array(64).fill(37), "rapport.pdf", "application/pdf");
    expect(f.errorCode).toBe("pdf_too_many_pages");
    expect(f.errorParams).toEqual({ pages: MAX_PDF_PAGES + 1, max: MAX_PDF_PAGES });
    expect(f.blocked).toBe(true);
    expect(f.text).toBe("");
    expect(pdf.getPage).not.toHaveBeenCalled();
    expect(ocr.ocrPdf).not.toHaveBeenCalled();
  });

  it("at the cap, every page is read", async () => {
    pdf.numPages = 3;
    pdf.getPage.mockReset();
    pdf.getPage.mockImplementation(async (i: number) => ({
      getTextContent: async () => ({ items: [{ str: `page ${i} texte`, hasEOL: true, transform: [1, 0, 0, 1, 0, 700] }] }),
      getViewport: () => ({ width: 600, height: 800 }),
      cleanup() {},
    }));
    const f = await extractBytes(new Uint8Array(64).fill(37), "court.pdf", "application/pdf");
    expect(f.errorCode).toBeUndefined();
    expect(pdf.getPage).toHaveBeenCalledTimes(3);
  });
});

describe("a digital PDF: OCR reads exactly the pages its layer cannot prove complete", () => {
  const dense = (i: number) =>
    `Page ${i} : le locataire s'engage à régler le loyer convenu à chaque échéance mensuelle. `.repeat(3);
  it("skips a clean page with only links; reads an image page and a page whose facts are unknown", async () => {
    pdf.numPages = 3;
    pdf.getPage.mockReset();
    pdf.getPage.mockImplementation(async (i: number) => ({
      getTextContent: async () => ({ items: [{ str: dense(i), hasEOL: true, transform: [1, 0, 0, 1, 0, 700] }] }),
      getViewport: () => ({ width: 600, height: 800 }),
      // Page 2 paints an image (a stamp); pages 1 and 3 only draw text.
      getOperatorList: async () => ({ fnArray: i === 2 ? [1, 85] : [1, 2] }),
      // Page 3's annotations cannot be read: unknown ⇒ OCR'd (fail closed).
      getAnnotations: async () => {
        if (i === 3) throw new Error("annotations illisibles");
        return [{ subtype: "Link" }];
      },
      cleanup() {},
    }));
    ocr.ocrPdf.mockClear();
    const f = await extractBytes(new Uint8Array(64).fill(37), "bail.pdf", "application/pdf");
    expect(f.error).toBeUndefined();
    expect(ocr.ocrPdf).toHaveBeenCalledOnce();
    expect((ocr.ocrPdf.mock.calls[0] as unknown[])[2]).toEqual([2, 3]);
  });
});

describe("picked file past the byte cap", () => {
  it("is refused on its size, before it is read into memory — limit stated", async () => {
    const big = join(dir, "enorme.txt");
    writeFileSync(big, "");
    truncateSync(big, MAX_FILE_BYTES + 1); // sparse: no 50 MiB written to disk
    fsSpy.readFile.mockClear();
    const f = await extractText(big);
    expect(f.errorCode).toBe("file_too_large");
    expect(f.blocked).toBe(true);
    expect(f.error).toContain("50 Mo maximum");
    expect(fsSpy.readFile).not.toHaveBeenCalled();
  });

  it("a file within the cap is read", async () => {
    const ok = join(dir, "ok.txt");
    writeFileSync(ok, "bonjour");
    const f = await extractText(ok);
    expect(f.text).toBe("bonjour");
    expect(f.error).toBeUndefined();
  });
});
