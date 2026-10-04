import { useEffect, useRef, useState } from "react";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  loadRedactedPdf,
  pdfReplacements,
  type PdfReplacement,
  type RedactBox,
  type RedactedPdfDoc,
  type RenderRedactedPdfOptions,
  type RenderedPage,
} from "@openmasq/redact/pdf-redact";
import type { Messages } from "@openmasq/i18n";
import { describeRedactFailure, useRedactEngine, useRedaction } from "../../../../send/redaction";
import { buildRevealMarks } from "./pageLayers";
import { createPageQueue, observePages, type PageQueue } from "./lazyPages";
import { mountPage, sizeShell } from "./mountPage";
import { mountPendingTile } from "./pendingTile";
import { pageProven, type PendingPage, type PendingPdf } from "./pendingPages";

export interface PdfPagesOptions {
  bytes: Uint8Array;
  redacted: boolean;
  /** The map to paint; `undefined` ⇒ derived from the document's own text (a model run). */
  replacements: PdfReplacement[] | undefined;
  ocrPages: RenderRedactedPdfOptions["ocrPages"];
  /** The masking is not over: only `masked` pages may show (`pendingPages.ts`). */
  pending?: PendingPdf;
  showTextHalo?: boolean;
  revealed?: ReadonlySet<string>;
  onReveal?: (real: string) => void;
  onWordPick?: (value: string, x: number, y: number, release: () => void) => void;
  t: Messages;
}

/** A page's tile line while it may not be shown. */
function tileLabel(page: PendingPage | undefined, n: number, t: Messages): string {
  const r = t.viewers.reading;
  if (!page) return r.tileWaiting(n);
  if (page.state === "masked") return r.tileHeld(n);
  if (page.state === "read") return r.tileRead(n);
  return page.state === "current" ? r.tileCurrent(n) : r.tileWaiting(n);
}

/**
 * The heavy half of `PdfRedactedViewer`: open the document ONCE, give every page a shell
 * sized to it, paint the pages near the viewport (`lazyPages.ts`). A map, an OCR geometry or
 * a pending state that CHANGES repaints the pages in view in place — no reload, no skeleton —
 * which is how one viewer goes from « being masked » to final.
 *
 * ⚠️ While `pending`, a page is painted only once it is `masked`, and its paint is SHOWN only
 * if it covers every value of its text (`pageProven`); anything else is a thumbnail tile.
 */
export function usePdfPages(o: PdfPagesOptions) {
  const redact = useRedaction();
  const engine = useRedactEngine();
  const rootRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [empty, setEmpty] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  const [imgSrc, setImgSrc] = useState({ zones: 0, pages: 0 });
  const [total, setTotal] = useState(0);
  // Read at paint time: a fresh identity each render must not reload the document.
  const live = useRef(o);
  live.current = o;
  const pagesRef = useRef(new Map<number, { pg: RenderedPage; pageEl: HTMLElement }>());
  const queueRef = useRef<PageQueue | null>(null);
  const shellsRef = useRef<HTMLElement[]>([]);
  const wantWords = !!o.onWordPick || !!o.showTextHalo;
  const derive = o.replacements === undefined;

  const buildMarks = (pageEl: HTMLElement, boxes: RedactBox[], cssW: number, cssH: number) =>
    buildRevealMarks(pageEl, boxes, cssW, cssH, !!live.current.onReveal);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ctrl = new AbortController();
    root.innerHTML = "";
    pagesRef.current = new Map();
    setState("loading");
    setEmpty(false);
    setWarn(null);
    setImgSrc({ zones: 0, pages: 0 });
    let doc: RedactedPdfDoc | null = null;
    let unobserve = () => {};
    const released = new Map<number, () => void>();
    // Per page, so a page painted again on return is never counted twice.
    const tally = new Map<number, { zones: number; imageOnly: boolean }>();
    const clear = (p: number) => {
      released.get(p)?.();
      released.delete(p);
      pagesRef.current.delete(p);
      tally.delete(p);
    };

    (async () => {
      try {
        const first = live.current;
        doc = await loadRedactedPdf({
          bytes: first.bytes,
          redacted: first.redacted,
          replacements: first.replacements,
          ocrPages: first.ocrPages,
          collectWords: wantWords,
          reveal: first.revealed,
          pdfWorkerSrc: workerUrl,
          getReplacements: (text) => pdfReplacements(text, redact),
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return void doc.destroy();
        const open = doc;
        if (open.modelError) setWarn(describeRedactFailure(open.modelError, first.t, engine));
        // EVERY page gets a shell sized to it up-front: the scrollbar is the document's.
        const shells: HTMLElement[] = [];
        for (let p = 1; p <= open.total; p++) {
          const shell = document.createElement("div");
          shell.className = "pdfv-page pending";
          shell.dataset.page = String(p);
          const { cssW, cssH } = await open.pageSize(p);
          if (ctrl.signal.aborted) return;
          sizeShell(shell, cssW, cssH);
          root.appendChild(shell);
          shells.push(shell);
        }
        shellsRef.current = shells;
        const tile = (p: number, page: PendingPage | undefined) => {
          clear(p);
          released.set(p, mountPendingTile(shells[p - 1]!, page, tileLabel(page, p, live.current.t)));
          return true;
        };
        const queue = createPageQueue({
          paint: async (p) => {
            const cur = live.current;
            const pend = cur.pending;
            // A pending page list that does not match the document proves nothing: tiles.
            const page = pend && pend.pages.length === open.total ? pend.pages[p - 1] : undefined;
            if (pend && page?.state !== "masked") return tile(p, page);
            const over = { replacements: cur.replacements, ocrPages: cur.ocrPages };
            const pg = await open.renderPage(p, cur.revealed, derive ? { ocrPages: cur.ocrPages } : over);
            if (!pg || ctrl.signal.aborted) return false;
            if (pend && !pageProven(pg.covered, page?.text, cur.replacements ?? [])) {
              pg.canvas.width = 0;
              pg.canvas.height = 0;
              return tile(p, page);
            }
            clear(p);
            const shell = shells[p - 1]!;
            const m = mountPage(shell, pg, p === 1, {
              showTextHalo: cur.showTextHalo,
              onWordPick: (value, x, y, release) => live.current.onWordPick?.(value, x, y, release),
              hasReveal: !!cur.onReveal,
              t: cur.t,
            });
            shell.classList.toggle("is-provisional", !!pend);
            released.set(p, m.release);
            pagesRef.current.set(p, { pg, pageEl: shell });
            tally.set(p, { zones: m.zones, imageOnly: m.imageOnly });
            setImgSrc(sumTally(tally));
            return true;
          },
          release: clear,
        });
        queueRef.current = queue;
        unobserve = observePages(shells, queue);
        setTotal(open.total);
        setEmpty(open.total === 0);
        setState("ready");
      } catch {
        if (!ctrl.signal.aborted) setState("error");
      }
    })();

    return () => {
      ctrl.abort();
      unobserve();
      queueRef.current = null;
      shellsRef.current = [];
      for (const release of released.values()) release();
      void doc?.destroy();
    };
    // `replacements` (and the detector) only reload when the doc DERIVES its own map;
    // otherwise a change repaints.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.bytes, derive ? redact : null, o.redacted, derive, wantWords, o.showTextHalo, engine]);

  // The map grew, the geometry arrived, a page got masked: repaint what is in view.
  const pendingKey = o.pending?.pages.map((p) => `${p.state[0]}${p.thumb ? "t" : ""}`).join("") ?? "final";
  useEffect(() => {
    queueRef.current?.refresh();
  }, [o.replacements, o.ocrPages, pendingKey]);

  // Reveal toggle: INCREMENTAL — restore/repaint just the affected patches on the
  // already-rendered canvases and rebuild each page's marks. No reload.
  useEffect(() => {
    for (const { pg, pageEl } of pagesRef.current.values()) {
      const boxes = pg.applyReveal(o.revealed);
      buildMarks(pageEl, boxes, pg.cssW || pg.canvas.width || 1, pg.cssH || pg.canvas.height || 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.revealed]);

  return { rootRef, shellsRef, state, empty, warn, imgSrc, total };
}

function sumTally(tally: Map<number, { zones: number; imageOnly: boolean }>) {
  let zones = 0;
  let pages = 0;
  for (const v of tally.values()) {
    zones += v.zones;
    pages += v.imageOnly ? 1 : 0;
  }
  return { zones, pages };
}
