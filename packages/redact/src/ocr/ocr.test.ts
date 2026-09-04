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

/** A page whose viewport SCALES, like pdf.js's — the rasteriser now asks for the size at
 *  scale 1 before deciding what scale it may actually render at. */
const pageOfSize = (w: number, h: number) => ({
  getViewport: ({ scale }: { scale: number }) => ({ width: w * scale, height: h * scale }),
  render: () => ({ promise: Promise.resolve() }),
  cleanup: vi.fn(),
});
const page = pageOfSize(80, 100);
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

  // The canvas is sized from the page's OWN geometry: at a fixed scale 2, a page the FILE
  // makes enormous asks for an enormous canvas — nothing declared it, nothing capped it,
  // and the process died before OCR read a character.
  it("SAUTE une page démesurée au lieu d'allouer sa toile (28800×28800)", async () => {
    // 28 800 pt is the PDF format's own maximum: 830 Mpx at 1:1, 3.3 Gpx at scale 2.
    doc.getPage.mockImplementation(async () => pageOfSize(28800, 28800) as never);
    const { text, layout } = await ocrPdf(new Uint8Array([0]), "eng", 2);
    expect(createCanvas).not.toHaveBeenCalled(); // aucune toile n'est jamais demandée
    expect(text).toContain("dimensions excessives");
    // La page garde sa PLACE dans la géométrie — l'index de page ne glisse pas.
    expect(layout).toHaveLength(2);
    expect(layout[0].words).toEqual([]);
    doc.getPage.mockImplementation(async () => page as never);
  });

  it("RABAISSE l'échelle d'une grande page plutôt que de la sauter", async () => {
    // 4000×3000 : hors plafond à l'échelle 2, dedans une fois rabaissée — la page est
    // bien océrisée, simplement moins finement.
    doc.getPage.mockImplementation(async () => pageOfSize(4000, 3000) as never);
    const { text } = await ocrPdf(new Uint8Array([0]), "eng", 1);
    expect(createCanvas).toHaveBeenCalledTimes(1);
    const [w, h] = createCanvas.mock.calls[0] as unknown as [number, number];
    expect(w * h).toBeLessThanOrEqual(40_000_000 + w + h); // le plafond, aux arrondis près
    expect(w).toBeGreaterThan(4000); // …et strictement plus fin que le 1:1
    expect(text).toContain("amelie.brivet@example.com");
    doc.getPage.mockImplementation(async () => page as never);
  });
});
