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
import { mountOriginalBanner, mountPendingTile } from "./pendingTile";
import { pageProven, type PendingPage, type PendingPdf } from "./pendingPages";

export interface PdfPagesOptions {
  bytes: Uint8Array;
  redacted: boolean;
  /** The map to paint; `undefined` ⇒ derived from the document's own text (a model run). */
  replacements: PdfReplacement[] | undefined;
  ocrPages: RenderRedactedPdfOptions["ocrPages"];
  /** The masking is not over: `masked` pages show masked, the others AS THEY ARE, labelled. */
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

/** What a page shows: its final paint, its provisional masked paint, or itself, labelled. */
type Shown = "final" | "masked" | "original";

/** What page `p` should show now (`total`: the document's page count). */
function shownOf(o: PdfPagesOptions, p: number, total: number): Shown {
  const pend = o.pending;
  if (!pend) return "final";
  // A pending page list that does not match the document proves nothing: original.
  const page = pend.pages.length === total ? pend.pages[p - 1] : undefined;
  return page?.state === "masked" ? "masked" : "original";
}

/** A pending map grows chunk by chunk; its masked pages repaint at most this often. */
const PENDING_REPAINT_MS = 1200;

/**
 * The heavy half of `PdfRedactedViewer`: open the document ONCE, give every page a shell
 * sized to it, paint the pages near the viewport (`lazyPages.ts`). A map, an OCR geometry or
 * a pending state that CHANGES repaints, in place, the pages it changes — no reload, no
 * skeleton — which is how one viewer goes from « being masked » to final.
 *
 * ⚠️ While `pending`, a page is masked-painted only once it is `masked`, and that paint is
 * SHOWN only if it covers every value of its text (`pageProven`). Any other page shows AS IT
 * IS under an « original, not masked yet » banner — the user's own file; nothing leaves.
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
  /** What each mounted page shows, to repaint only the pages a change touches. */
  const shownRef = useRef(new Map<number, Shown>());
  const totalRef = useRef(0);
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
    shownRef.current = new Map();
    const clear = (p: number) => {
      released.get(p)?.();
      released.delete(p);
      pagesRef.current.delete(p);
      shownRef.current.delete(p);
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
        totalRef.current = open.total;
        const tile = (p: number, page: PendingPage | undefined) => {
          clear(p);
          released.set(p, mountPendingTile(shells[p - 1]!, page, tileLabel(page, p, live.current.t)));
          return true;
        };
        // The page AS IT IS: no map painted, no halo, no picking — and a banner saying so.
        const original = async (p: number, page: PendingPage | undefined) => {
          const pg = await open.renderPage(p, undefined, { replacements: [], ocrPages: undefined });
          if (ctrl.signal.aborted) return false;
          if (!pg) return tile(p, page);
          clear(p);
          const shell = shells[p - 1]!;
          const m = mountPage(shell, pg, false, { showTextHalo: false, onWordPick: () => {}, hasReveal: false, t: live.current.t });
          const unBanner = mountOriginalBanner(shell, live.current.t.viewers.reading.original(p));
          shell.classList.remove("is-provisional");
          released.set(p, () => {
            unBanner();
            m.release();
          });
          shownRef.current.set(p, "original");
          return true;
        };
        const queue = createPageQueue({
          paint: async (p) => {
            const cur = live.current;
            const pend = cur.pending;
            // A pending page list that does not match the document proves nothing: tiles.
            const page = pend && pend.pages.length === open.total ? pend.pages[p - 1] : undefined;
            const shown = shownOf(cur, p, open.total);
            if (shown === "original") return original(p, page);
            const over = { replacements: cur.replacements, ocrPages: cur.ocrPages };
            const pg = await open.renderPage(p, cur.revealed, derive ? { ocrPages: cur.ocrPages } : over);
            if (!pg || ctrl.signal.aborted) return false;
            if (pend && !pageProven(pg.covered, page?.text, cur.replacements ?? [])) {
              pg.canvas.width = 0;
              pg.canvas.height = 0;
              return original(p, page);
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
            shownRef.current.set(p, shown);
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

  // The map grew, the geometry arrived, a page got masked: repaint the pages it TOUCHES. A page
  // whose kind of paint changed (original → masked → final) repaints at once; while pending,
  // a growing map repaints the masked pages at most every `PENDING_REPAINT_MS`; an original
  // page never depends on the map. Repainting every page in view on every streamed page or
  // masking chunk is what made the read slower with the preview open.
  const pendingKey = o.pending?.pages.map((p) => p.state[0]).join("") ?? "final";
  const lastMap = useRef({ r: o.replacements, ocr: o.ocrPages });
  const deferred = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const queue = queueRef.current;
    const prev = lastMap.current;
    lastMap.current = { r: o.replacements, ocr: o.ocrPages };
    if (!queue) return;
    const mapChanged = prev.r !== o.replacements || prev.ocr !== o.ocrPages;
    const now: number[] = [];
    let later = false;
    for (const [p, shown] of shownRef.current) {
      const want = shownOf(live.current, p, totalRef.current);
      if (want !== shown) now.push(p);
      else if (mapChanged && want === "final") now.push(p);
      else if (mapChanged && want === "masked") later = true;
    }
    if (now.length) queue.refreshPages(now);
    if (later && !deferred.current) {
      deferred.current = setTimeout(() => {
        deferred.current = null;
        const masked = [...shownRef.current].filter(([, s]) => s === "masked").map(([p]) => p);
        queueRef.current?.refreshPages(masked);
      }, PENDING_REPAINT_MS);
    }
  }, [o.replacements, o.ocrPages, pendingKey]);
  useEffect(
    () => () => {
      if (deferred.current) clearTimeout(deferred.current);
    },
    [],
  );

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
