import { useEffect, useState, type RefObject } from "react";
import type { PdfReplacement, RedactedPdfDoc, RenderRedactedPdfOptions } from "@openmasq/redact/pdf-redact";

/** Device-pixel width a strip thumbnail is painted at: the tile's CSS width × 2. */
const THUMB_W = 80;
/** No value is ever revealed on a thumbnail, whatever the page shows. */
const NONE: ReadonlySet<string> = new Set();

/**
 * The page strip's previews once a document is FINAL: each page painted small, MASKED with the
 * same map as the pages (`renderPage` `over.width` — a fraction of a page's pixels), one page at
 * a time and between frames, so the pages in view keep the CPU. While the masking runs the strip
 * keeps the read's unreadable thumbnails instead (`pendingPages.ts`). Never a revealed value.
 */
export function usePdfThumbs(o: {
  docRef: RefObject<RedactedPdfDoc | null>;
  ready: boolean;
  total: number;
  /** The masking is over: thumbnails may be painted. */
  final: boolean;
  replacements: PdfReplacement[] | undefined;
  ocrPages: RenderRedactedPdfOptions["ocrPages"];
}): (string | undefined)[] {
  const [thumbs, setThumbs] = useState<(string | undefined)[]>([]);
  useEffect(() => {
    setThumbs([]);
    const doc = o.docRef.current;
    if (!o.ready || !o.final || !doc || !o.total) return;
    let stopped = false;
    void (async () => {
      for (let p = 1; p <= o.total && !stopped; p++) {
        await new Promise((r) => setTimeout(r, 16)); // between frames: the visible pages first
        if (stopped) return;
        const over = { replacements: o.replacements, ocrPages: o.ocrPages, width: THUMB_W };
        const pg = await doc.renderPage(p, NONE, o.replacements ? over : { width: THUMB_W }).catch(() => null);
        if (!pg || stopped) return;
        let url: string | undefined;
        try {
          url = pg.canvas.toDataURL("image/png");
        } catch {
          url = undefined; // a canvas that cannot export: no preview, the number stays
        }
        pg.canvas.width = 0;
        pg.canvas.height = 0;
        if (url?.startsWith("data:image/png;base64,")) {
          setThumbs((prev) => {
            const next = prev.slice();
            next[p - 1] = url;
            return next;
          });
        }
      }
    })();
    return () => {
      stopped = true;
    };
    // `docRef` is a ref: a reload flips `ready`, which re-runs this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.ready, o.final, o.total, o.replacements, o.ocrPages]);
  return thumbs;
}
