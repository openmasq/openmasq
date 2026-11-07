// End to end on a REAL PDF (pdf-lib → pdf.js → @napi-rs/canvas): a page with no ink skips
// OCR; a page with the faintest drawing on it — a lone vector stroke — is still read.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seen = vi.hoisted(() => ({ calls: 0 }));
vi.mock("./ocr", async (orig) => ({
  ...(await orig<typeof import("./ocr")>()),
  ocrImageLayout: vi.fn(async () => {
    seen.calls++;
    return { text: "LU", words: [{ text: "LU", x0: 1, y0: 1, x1: 20, y1: 10 }], meta: { engine: "stub", ms: 0 }, width: 1, height: 1 };
  }),
}));

const fonts = vi.hoisted(() => ({ asked: [] as string[] }));
vi.mock("./standardFonts", async (orig) => {
  const real = await orig<typeof import("./standardFonts")>();
  return {
    ...real,
    standardFontBytes: async (name: string) => {
      fonts.asked.push(name);
      return real.standardFontBytes(name);
    },
  };
});

import { ocrPdf } from "./pdf";

async function pdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([600, 800]); // 1: nothing drawn
  doc.addPage([600, 800]).drawLine({ start: { x: 100, y: 400 }, end: { x: 160, y: 400 }, thickness: 1, color: rgb(0.6, 0.6, 0.6) }); // 2: one grey stroke
  doc.addPage([600, 800]).drawText("Ninon Verdolini", { x: 40, y: 700, size: 12, font }); // 3: text
  return doc.save();
}

const g = globalThis as { pdfjsStandardFonts?: Record<string, Uint8Array> };
beforeEach(() => {
  seen.calls = 0;
  fonts.asked.length = 0;
  delete g.pdfjsStandardFonts;
});
afterEach(() => {
  delete g.pdfjsStandardFonts;
});

describe("blank pages skip OCR on a real PDF", () => {
  it("the empty page is not read; the stroke and the text pages are", async () => {
    const pages: [number, string][] = [];
    const r = await ocrPdf(await pdf(), undefined, undefined, undefined, undefined, (n, _t, text) => pages.push([n, text]));
    expect(seen.calls).toBe(2);
    expect(pages).toEqual([
      [1, ""],
      [2, "LU"],
      [3, "LU"],
    ]);
    // The skipped page keeps its place: the layout stays indexed BY PAGE.
    expect(typeof r === "string" ? null : r.layout?.map((p) => p.text)).toEqual(["", "LU", "LU"]);
  });

  it("draws the text with the font pdf.js ships, never the machine's", async () => {
    // With the system's fonts, a machine lacking Helvetica rendered page 3 without ink (an
    // Ubuntu 26.04 runner did): the page was skipped as blank. The request below is what fixes it.
    await ocrPdf(await pdf());
    expect(fonts.asked).toContain("LiberationSans-Regular.ttf");
  });

  it("a font that could not be supplied proves nothing: the text page is still read", async () => {
    g.pdfjsStandardFonts = {}; // an embedded set without the font: pdf.js draws the page without it
    const pages: [number, string][] = [];
    await ocrPdf(await pdf(), undefined, undefined, undefined, undefined, (n, _t, text) => pages.push([n, text]));
    expect(pages.find(([n]) => n === 3)?.[1]).toBe("LU");
  });
});
