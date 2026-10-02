import { attachWordPicker, type RenderedPage } from "@openmasq/redact/pdf-redact";
import type { Messages } from "@openmasq/i18n";
import { buildImageZoneLayer, buildRevealMarks, buildTextHaloLayer } from "./pageLayers";

export interface MountOptions {
  showTextHalo?: boolean;
  /** Read through a ref by the caller: a fresh handler identity must not repaint. */
  onWordPick: (value: string, x: number, y: number, release: () => void) => void;
  hasReveal: boolean;
  t: Messages;
}

/** Size an empty page shell to the page's natural CSS size, so the scrollbar spans the
 *  whole document before a single page is painted. */
export function sizeShell(shell: HTMLElement, cssW: number, cssH: number): void {
  // Runtime-computed per-page size — the sanctioned inline-style case.
  shell.style.setProperty("--page-nat", String(cssW));
  shell.style.setProperty("--page-ratio", `${cssW} / ${cssH}`);
}

/** Mount a painted page into its shell: the canvas, the word picker, then the layers.
 *  Returns what it marked as image-sourced (the legend's tally) and what releases it
 *  (listeners detached, canvas memory freed). */
export function mountPage(
  shell: HTMLElement,
  pg: RenderedPage,
  first: boolean,
  o: MountOptions,
): { zones: number; imageOnly: boolean; release: () => void } {
  // Make the canvas RESPONSIVE here (the shared painter ships it at fixed natural px —
  // the extension needs that for its px overlay): the max-width cap beats the painter's
  // inline width, so a WIDE/landscape page scales DOWN to fit the panel instead of being
  // clipped, and `height:auto` keeps the intrinsic ratio. The box coords below are CSS px
  // in the painter's natural space — its own `cssW`/`cssH`, never re-parsed from styles.
  pg.canvas.style.maxWidth = "100%";
  pg.canvas.style.height = "auto";
  const cssW = pg.cssW || pg.canvas.width || 1;
  const cssH = pg.cssH || pg.canvas.height || 1;
  sizeShell(shell, cssW, cssH);
  shell.replaceChildren(pg.canvas);
  shell.classList.remove("pending");
  // Word-processor-style interaction over the canvas: hover pre-highlight, click = one
  // word, DRAG = a contiguous run; the picked run stays locked until the «Masquer» menu
  // releases it. Shared core — same behaviour as the scanned-image view.
  const detach = pg.words.length
    ? attachWordPicker({
        container: shell,
        canvas: pg.canvas,
        words: pg.words,
        space: { w: cssW, h: cssH },
        ignore: ".pdfv-mark",
        onPick: o.onWordPick,
      })
    : () => {};
  // Halo first (the lowest context), then zones, then marks. Legend on the FIRST page
  // only. `wireWords`, never `words`: a word picked from the image (logo, stamp) is read
  // and outlined, but its text doesn't leave — a halo over it would contradict the outline.
  if (o.showTextHalo && pg.wireWords.length) buildTextHaloLayer(shell, pg.wireWords, cssW, cssH, first, o.t);
  // Before the marks, so a redaction box always paints OVER a zone outline.
  const marked = buildImageZoneLayer(shell, pg, cssW, cssH);
  buildRevealMarks(shell, pg.boxes, cssW, cssH, o.hasReveal);
  const release = () => {
    detach();
    shell.replaceChildren();
    shell.classList.add("pending");
    pg.canvas.width = 0;
    pg.canvas.height = 0;
  };
  return { ...marked, release };
}
