// End to end on a REAL PDF (pdf-lib → pdf.js → @napi-rs/canvas): a dense digital page with a
// logo is OCR'd only under the logo, and a page whose layer is not proved is still read whole.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pngSize } from "../documents/pageStream";

const seen = vi.hoisted(() => ({ sizes: [] as ({ width: number; height: number } | null)[] }));
vi.mock("./ocr", async (orig) => ({
  ...(await orig<typeof import("./ocr")>()),
  ocrImageLayout: vi.fn(async (png: Uint8Array) => {
    seen.sizes.push(pngSize(png));
    return { text: "LOGO", words: [{ text: "LOGO", x0: 1, y0: 1, x1: 20, y1: 10 }], meta: { engine: "stub", ms: 0 }, width: 1, height: 1 };
  }),
}));

import { extractBytes } from "../documents/node";

const LINE = "Le locataire s'engage a payer le loyer convenu a chaque echeance, charges comprises.";

async function pdf(pages: { dense: boolean }[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const png = await doc.embedPng(readFileSync(join(__dirname, "../__fixtures__/business-card.png")));
  for (const p of pages) {
    const page = doc.addPage([600, 800]);
    page.drawImage(png, { x: 40, y: 700, width: 100, height: 60 });
    const lines = p.dense ? 12 : 0;
    for (let i = 0; i < lines; i++) page.drawText(LINE, { x: 40, y: 640 - i * 16, size: 10, font });
  }
  return doc.save();
}

beforeEach(() => {
  seen.sizes = [];
});

describe("image-region OCR on a real PDF", () => {
  it("a dense page with a logo reads only a crop around the logo, in page raster space", async () => {
    const out = await extractBytes(await pdf([{ dense: true }]), "bail.pdf");
    expect(out.error).toBeUndefined();
    expect(seen.sizes).toHaveLength(1);
    const crop = seen.sizes[0]!;
    // The page raster is 1200×1600 at scale 2; the logo is 100×60 pt → 200×120 px + padding.
    expect(crop.width).toBeLessThan(260);
    expect(crop.height).toBeLessThan(180);
    expect(out.ocr?.regionPages).toBe(1);
    // The word is offset back into the WHOLE page raster (logo top-left ≈ (80, 80) px).
    const w = out.ocrPages?.[0].words[0];
    expect(out.ocrPages?.[0].width).toBe(1200);
    expect(w!.x0).toBeGreaterThan(60);
    expect(w!.y0).toBeGreaterThan(60);
  });

  it("a page whose layer is not proved (sparse) is still read WHOLE", async () => {
    const out = await extractBytes(await pdf([{ dense: true }, { dense: false }]), "mixte.pdf");
    expect(seen.sizes).toHaveLength(2);
    expect(seen.sizes[1]).toEqual({ width: 1200, height: 1600 });
    expect(out.ocr?.regionPages).toBe(1);
  });
});
