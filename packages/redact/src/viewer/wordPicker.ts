// The click/drag-to-redact INTERACTION over a painted canvas (PDF page or
// scanned image) — one implementation for both consumers. Behaves like a text
// editor over the pixels: hover pre-highlights the word under the cursor, a
// CLICK picks that word, a DRAG selects a contiguous RUN of words (reading
// order = the words array), and the picked run keeps a locked highlight until
// the consumer's «Redact» menu releases it. Pure DOM (no React); the pure
// range/value helpers are unit-tested separately.
import { wordAtPoint, cleanWord, type PageWord } from "./pageWords";

/** The words of a contiguous selection joined into ONE value: raw strings
 *  space-joined, then the RUN's clinging punctuation trimmed at both ends
 *  ("« Jean Rebour, »" → "Jean Rebour"). Inner punctuation stays verbatim. */
export function selectionValue(words: PageWord[], a: number, b: number): string {
  const [i, j] = a <= b ? [a, b] : [b, a];
  return cleanWord(
    words
      .slice(i, j + 1)
      .map((w) => w.str)
      .join(" "),
  );
}

export interface WordPickerOptions {
  /** Positioned element the %-layers are appended to (page / image wrapper). */
  container: HTMLElement;
  /** The rect source — the canvas the words' space maps onto. */
  canvas: HTMLElement;
  /** The words, in READING order, in `space` coordinates. */
  words: PageWord[];
  /** The words' coordinate space (page CSS size, or the image's natural raster). */
  space: { w: number; h: number };
  /** CSS selector of elements that own their own click (the redacted marks). */
  ignore?: string;
  /** A word (single click) or word RUN (drag) was picked. `release` drops the
   *  locked highlight — call it when the «Redact» menu closes or picks. */
  onPick: (value: string, x: number, y: number, release: () => void) => void;
}

/** Attach the interaction. Returns a DETACH fn (layers + listeners removed) —
 *  needed by a consumer whose container PERSISTS across re-renders (the image
 *  wrapper); the PDF viewer rebuilds its pages' DOM instead. */
export function attachWordPicker(o: WordPickerOptions): () => void {
  const hover = document.createElement("div");
  hover.className = "pdfv-wordhl";
  const picked = document.createElement("div");
  picked.className = "pdfv-wordpick";
  o.container.append(hover, picked);

  const place = (el: HTMLElement, w: PageWord) => {
    el.style.left = `${(w.left / o.space.w) * 100}%`;
    el.style.top = `${(w.top / o.space.h) * 100}%`;
    el.style.width = `${(w.w / o.space.w) * 100}%`;
    el.style.height = `${(w.h / o.space.h) * 100}%`;
  };
  /** Fill the picked layer with one highlight box per word of [a..b]. */
  const paintRun = (a: number, b: number) => {
    const [i, j] = a <= b ? [a, b] : [b, a];
    picked.replaceChildren();
    for (const w of o.words.slice(i, j + 1)) {
      const box = document.createElement("div");
      box.className = "pdfv-wordhl picked on";
      place(box, w);
      picked.appendChild(box);
    }
  };

  const indexAt = (e: MouseEvent): number => {
    if (o.ignore && (e.target as HTMLElement).closest?.(o.ignore)) return -1;
    const rect = o.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return -1;
    const nx = ((e.clientX - rect.left) / rect.width) * o.space.w;
    const ny = ((e.clientY - rect.top) / rect.height) * o.space.h;
    const hit = wordAtPoint(o.words, nx, ny);
    return hit && cleanWord(hit.str).length >= 1 ? o.words.indexOf(hit) : -1;
  };

  let anchor = -1; // drag start word, -1 = not dragging
  let current = -1;
  // Run generation: a released PREVIOUS pick must not clear the run a NEWER pick
  // just painted (the consumer releases the old one as it opens the new menu).
  let gen = 0;

  const onMove = (e: MouseEvent) => {
    const idx = indexAt(e);
    if (anchor >= 0) {
      // Dragging: extend the run to the word under the cursor (keep the last
      // known word when the cursor crosses a gap between words).
      if (idx >= 0 && idx !== current) {
        current = idx;
        paintRun(anchor, current);
      }
      hover.classList.remove("on");
      return;
    }
    if (idx >= 0) {
      place(hover, o.words[idx]);
      hover.classList.add("on");
    } else hover.classList.remove("on");
    o.container.style.cursor = idx >= 0 ? "text" : "";
  };
  const onLeave = () => {
    if (anchor < 0) {
      hover.classList.remove("on");
      o.container.style.cursor = "";
    }
  };
  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const idx = indexAt(e);
    if (idx < 0) return;
    anchor = current = idx;
    paintRun(anchor, current);
    e.preventDefault(); // no native image/text drag while selecting
    const up = (ue: MouseEvent) => {
      window.removeEventListener("mouseup", up);
      if (anchor < 0) return;
      const value = selectionValue(o.words, anchor, current);
      anchor = current = -1;
      if (value.length >= 2) {
        const g = ++gen;
        o.onPick(value, ue.clientX, ue.clientY, () => {
          if (g === gen) picked.replaceChildren();
        });
      } else picked.replaceChildren();
    };
    window.addEventListener("mouseup", up);
  };
  o.container.addEventListener("mousemove", onMove);
  o.container.addEventListener("mouseleave", onLeave);
  o.container.addEventListener("mousedown", onDown);
  return () => {
    o.container.removeEventListener("mousemove", onMove);
    o.container.removeEventListener("mouseleave", onLeave);
    o.container.removeEventListener("mousedown", onDown);
    o.container.style.cursor = "";
    hover.remove();
    picked.remove();
  };
}
