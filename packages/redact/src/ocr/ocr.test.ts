import { describe, it, expect, vi, beforeEach } from "vitest";

/* OCR internals with the heavy libs (tesseract2.js / pdfjs / canvas) MOCKED — no
   network, no native binary, no real recognition. Proves the wiring: image →
   recognise + terminate; PDF → rasterise each page + OCR + join. */

const recognize = vi.fn(async () => ({ data: { text: "  amelie.brivet@example.com  " } }));
const terminate = vi.fn(async () => {});
const createWorker = vi.fn(async () => ({ recognize, terminate }));
vi.mock("tesseract2.js", () => ({ createWorker }));

const encode = vi.fn(async () => new Uint8Array([1, 2, 3]));
const getContext = vi.fn(() => ({}));
const createCanvas = vi.fn(() => ({ getContext, encode }));
vi.mock("@napi-rs/canvas", () => ({
  createCanvas,
  DOMMatrix: class {},
  Path2D: class {},
  ImageData: class {},
}));

const page = {
  getViewport: () => ({ width: 80, height: 100 }),
  render: () => ({ promise: Promise.resolve() }),
  cleanup: vi.fn(),
};
const doc = { numPages: 2, getPage: vi.fn(async () => page), destroy: vi.fn() };
const getDocument = vi.fn(() => ({ promise: Promise.resolve(doc) }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ getDocument }));

import { ocrImage } from "./ocr";
import { ocrPdf } from "./pdf";

describe("ocrImage", () => {
  beforeEach(() => {
    recognize.mockClear();
    terminate.mockClear();
  });

  it("recognises an image buffer and terminates the worker", async () => {
    const text = await ocrImage(new Uint8Array([0]));
    expect(text).toBe("amelie.brivet@example.com");
    expect(recognize).toHaveBeenCalledOnce();
    expect(terminate).toHaveBeenCalledOnce();
  });

  it("still terminates the worker when recognition throws", async () => {
    recognize.mockRejectedValueOnce(new Error("boom"));
    await expect(ocrImage(new Uint8Array([0]))).rejects.toThrow("boom");
    expect(terminate).toHaveBeenCalledOnce();
  });
});

describe("ocrPdf", () => {
  beforeEach(() => createCanvas.mockClear());

  it("rasterises each page, OCRs it, and joins the text (+ reports engine/timing)", async () => {
    const { text, meta } = await ocrPdf(new Uint8Array([0]), "eng", 2);
    expect(createCanvas).toHaveBeenCalledTimes(2);
    expect(text).toContain("amelie.brivet@example.com");
    expect(meta.engine).toBe("tesseract"); // no docTR bundled in the test env
    expect(meta.pages).toBe(2);
    expect(typeof meta.ms).toBe("number");
  });

  it("caps pages and notes the un-OCR'd remainder", async () => {
    const { text } = await ocrPdf(new Uint8Array([0]), "eng", 1);
    expect(createCanvas).toHaveBeenCalledTimes(1);
    expect(text).toContain("non océrisée");
  });
});
