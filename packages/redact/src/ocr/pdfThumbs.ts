// Page thumbnails of a PDF being read — the « blurred pages » of the pending preview. Rendered
// HERE, in the extraction process, at a size where no word is legible (`thumbScale`): the
// renderer never gets a readable raster of a document it has not seen masked, and gains no
// file-read capability for it. Display only: any failure ends the thumbnails, never the read.
import { isSafeThumbnail, thumbScale, type ThumbEvent } from "../documents/pageStream";
import { ensureWithResolvers, loadCanvas } from "./pdf";
import { pdfRenderFactories } from "./pdfFactories";

/** Past this, the remaining pages stay without a picture: thumbnails share the CPU with the
 *  OCR they illustrate, and must never cost it more than a moment. */
const THUMBS_BUDGET_MS = 6_000;

/**
 * Render every page of `buf` at thumbnail size and hand each PNG to `onThumb`, in page order,
 * until `signal` aborts or the time budget runs out. A PNG outside the bounds
 * (`isSafeThumbnail`) is dropped, never sent larger.
 */
export async function pdfThumbnails(
  buf: Uint8Array,
  onThumb: (ev: ThumbEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const started = Date.now();
  ensureWithResolvers();
  const canvasMod: any = await loadCanvas();
  for (const k of ["DOMMatrix", "Path2D", "ImageData"]) {
    if (!(k in globalThis) && canvasMod[k]) (globalThis as any)[k] = canvasMod[k];
  }
  // @ts-ignore — legacy build subpath ships no bundled types
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const getDocument = pdfjs.getDocument ?? pdfjs.default?.getDocument;
  if (signal.aborted) return;
  // A COPY: pdf.js detaches the buffer it is given, and the read is using the same bytes.
  const doc = await getDocument({
    data: buf.slice(),
    useSystemFonts: true,
    isEvalSupported: false,
    enableXfa: false,
    ...pdfRenderFactories(canvasMod),
  }).promise;
  try {
    const total: number = doc.numPages;
    for (let n = 1; n <= total; n++) {
      if (signal.aborted || Date.now() - started > THUMBS_BUDGET_MS) return;
      const page = await doc.getPage(n);
      try {
        const base = page.getViewport({ scale: 1 });
        const scale = thumbScale(base.width, base.height);
        if (scale === null) continue;
        const viewport = page.getViewport({ scale });
        const canvas = canvasMod.createCanvas(
          Math.max(1, Math.floor(viewport.width)),
          Math.max(1, Math.floor(viewport.height)),
        );
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff"; // paper, not transparency: the page reads as a sheet
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const png = new Uint8Array(await canvas.encode("png"));
        if (!signal.aborted && isSafeThumbnail(png)) onThumb({ n, total, png });
      } finally {
        page.cleanup?.();
      }
    }
  } finally {
    await doc.destroy?.();
  }
}
