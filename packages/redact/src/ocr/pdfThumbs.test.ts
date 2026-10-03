// The thumbnails of a PDF being read are rendered at a size where no word is legible —
// enforced at the SOURCE (`pdfThumbs.ts`), whatever the page size, and stopped on demand.
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { isSafeThumbnail, pngSize, THUMB_MAX_HEIGHT_PX, THUMB_MAX_WIDTH_PX, type ThumbEvent } from "../documents/pageStream";
import { pdfThumbnails } from "./pdfThumbs";

async function pdfWithText(sizes: [number, number][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [w, h] of sizes) {
    const page = doc.addPage([w, h]);
    // A huge title: the most legible thing a page can carry.
    page.drawText("JEAN DUPONT", { x: 10, y: h / 2, size: Math.min(w, h) / 6, font });
  }
  return doc.save();
}

describe("pdfThumbnails", () => {
  it("every page comes out within the pinned bound, in page order", async () => {
    const sizes: [number, number][] = [[595, 842], [842, 595], [3000, 3000], [200, 4000]];
    const got: ThumbEvent[] = [];
    await pdfThumbnails(await pdfWithText(sizes), (ev) => got.push(ev), new AbortController().signal);
    expect(got.map((g) => g.n)).toEqual([1, 2, 3, 4]);
    for (const g of got) {
      const size = pngSize(g.png)!;
      expect(size.width).toBeLessThanOrEqual(THUMB_MAX_WIDTH_PX);
      expect(size.height).toBeLessThanOrEqual(THUMB_MAX_HEIGHT_PX);
      expect(isSafeThumbnail(g.png)).toBe(true);
      expect(g.total).toBe(4);
    }
  }, 30_000);

  it("stops when aborted", async () => {
    const ctrl = new AbortController();
    const got: number[] = [];
    await pdfThumbnails(
      await pdfWithText([[595, 842], [595, 842], [595, 842]]),
      (ev) => {
        got.push(ev.n);
        ctrl.abort();
      },
      ctrl.signal,
    );
    expect(got).toEqual([1]);
  }, 30_000);
});
