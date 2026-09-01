import type { Messages } from "@openmasq/i18n";
import type { ImageZone, RedactBox, RenderedPage } from "@openmasq/redact/pdf-redact";
import { haloRegions, type HaloBox } from "./textHalo";

/**
 * The DOM overlays a rendered PDF page wears, built imperatively because the page
 * underneath is a `<canvas>` the shared painter owns. All of them are %-positioned in
 * the page's natural CSS-px space, so they track the responsive/zoomed canvas.
 *
 * Three layers, appended in this order — text halo (context: what was READ), then zone
 * outlines, then reveal marks: a redaction mark must always paint OVER the context,
 * never the reverse — the mark is what protects a value.
 */

/** Bleed around a zone so the outline sits OUTSIDE the glyphs it frames (CSS px). */
const BLEED = 4;

/**
 * The HALO over detected text zones: what, redacted, goes out to the model (the caller
 * supplies `RenderedPage.wireWords`). What carries none does not go out as text: either not
 * read (photo, unreadable zone), or baked into the image — logo, stamp — in which case the
 * FRAME (`buildImageZoneLayer`) is what says so, never the halo: the two marks make
 * opposite claims and must not overlap. The geometry (merged line
 * bands, `textHalo.ts`) follows the text's real extent; the CSS render is a flat fill with
 * sharp edges. The LAYER is `pointer-events: none` + `aria-hidden` (pure context); the
 * LEGEND, though, is a BUTTON: clicking hides/shows the halo again, and the preference is
 * remembered (`openmasq.haloOff`) — the legend stays visible so it can be turned back on.
 */
const HALO_OFF_KEY = "openmasq.haloOff";
const haloOff = (): boolean => {
  try {
    return localStorage.getItem(HALO_OFF_KEY) === "1";
  } catch {
    return false;
  }
};
const setHaloOff = (off: boolean): void => {
  try {
    if (off) localStorage.setItem(HALO_OFF_KEY, "1");
    else localStorage.removeItem(HALO_OFF_KEY);
  } catch {
    /* VIEW preference only — with no storage, the toggle applies for the session. */
  }
};

export function buildTextHaloLayer(
  pageEl: HTMLElement,
  boxes: readonly HaloBox[],
  cssW: number,
  cssH: number,
  /** Place the LEGEND (« Halo = texte reconnu… ») on this page — the caller
   *  requests it for the FIRST page only: one label per page would be noise,
   *  and without it the halo is a mystery. */
  withLegend: boolean,
  t: Messages,
): void {
  pageEl.querySelector(":scope > .pdfv-texthalo")?.remove();
  pageEl.querySelector(":scope > .pdfv-halolegend")?.remove();
  const regions = haloRegions(boxes, { w: cssW, h: cssH });
  if (!regions.length) return;
  // The toggle lives on the pages' PARENT: one preference, every page of the
  // document — not one page on and its neighbor off.
  const scope = pageEl.parentElement ?? pageEl;
  scope.classList.toggle("pdfv-halo-off", haloOff());
  if (withLegend) {
    const legend = document.createElement("button");
    legend.type = "button";
    legend.className = "pdfv-halolegend";
    // ⚠️ THE STATE READS ON THE LABEL, not only in `aria-pressed`. With halo off, the
    // button used to look identical to halo on: this led to believing nothing had been recognized —
    // therefore that nothing would be redacted (a conclusion drawn during a walkthrough on 15/08, on a real
    // bank statement). And the off-state sentence must REMIND that redaction itself
    // is not affected: it is a DISPLAY preference, never a protection.
    const sync = () => {
      const off = haloOff();
      legend.textContent = off ? t.viewers.pdf.haloOff : t.viewers.pdf.haloOn;
      legend.setAttribute("aria-pressed", String(!off));
      legend.title = off ? t.viewers.pdf.showHalo : t.viewers.pdf.hideHalo;
    };
    sync();
    legend.addEventListener("click", () => {
      setHaloOff(!haloOff());
      scope.classList.toggle("pdfv-halo-off", haloOff());
      sync();
    });
    pageEl.appendChild(legend);
  }
  const layer = document.createElement("div");
  layer.className = "pdfv-texthalo";
  layer.setAttribute("aria-hidden", "true");
  for (const r of regions) {
    const el = document.createElement("span");
    el.className = "pdfv-halo";
    // Position from data → the sanctioned runtime inline-style case.
    el.style.left = `${(r.left / cssW) * 100}%`;
    el.style.top = `${(r.top / cssH) * 100}%`;
    el.style.width = `${(r.w / cssW) * 100}%`;
    el.style.height = `${(r.h / cssH) * 100}%`;
    layer.appendChild(el);
  }
  // Appended right after the canvas, BEFORE the zone/mark builders run (the caller's
  // ordering) — absolute siblings paint in DOM order, so the halo stays under both,
  // and a reveal-toggle rebuild re-appends marks after it (still on top).
  pageEl.appendChild(layer);
}

/**
 * The per-value reveal marks: the redacted regions, as hover/click targets carrying the
 * data the shared reveal strip reads (`data-real`/`data-tone`/`data-kind`). Replaces any
 * previous layer, so a reveal toggle rebuilds just this without a pdf.js re-render.
 *
 * `interactive` ⇒ the marks are BUTTONS carrying `data-doc-reveal` (the before-send
 * preview): click/Entrée PINS the shared reveal card (`useMarkHover`, delegated on the
 * modal body) — « Démasquer » is the card's explicit action, never the exploration
 * gesture itself (audit 2026-08-10). Not interactive ⇒ spans with a native tooltip.
 */
export function buildRevealMarks(
  pageEl: HTMLElement,
  boxes: RedactBox[],
  cssW: number,
  cssH: number,
  interactive: boolean,
): void {
  pageEl.querySelector(":scope > .pdfv-reveal")?.remove();
  if (!boxes.length) return;
  const layer = document.createElement("div");
  layer.className = "pdfv-reveal";
  for (const bx of boxes) {
    const mark = document.createElement(interactive ? "button" : "span");
    mark.className = `pdfv-mark${bx.revealed ? " revealed" : ""}${interactive ? " clickable" : ""}`;
    mark.style.left = `${(bx.left / cssW) * 100}%`;
    mark.style.top = `${(bx.top / cssH) * 100}%`;
    mark.style.width = `${(bx.w / cssW) * 100}%`;
    mark.style.height = `${(bx.h / cssH) * 100}%`;
    if (interactive) {
      (mark as HTMLButtonElement).type = "button";
      mark.dataset.docReveal = "";
      mark.dataset.real = bx.real;
      mark.dataset.tone = bx.tone;
      if (bx.kind) mark.dataset.kind = bx.kind;
      // An EMPTY button has no accessible name — a screen reader announced nothing.
      mark.setAttribute(
        "aria-label",
        `Valeur redacted${bx.revealed ? " — gardée en clair" : ""} — inspecter`,
      );
    } else {
      // Non-editable viewer (post-send): a native tooltip with the real value.
      mark.title = bx.real;
    }
    layer.appendChild(mark);
  }
  pageEl.appendChild(layer);
}

/**
 * Mark, on a rendered page, what the user is looking at that the TEXT LAYER does not
 * carry — a logo, a tampon, a scanned insert. Those pixels are not part of what the
 * model receives, and until now the app only said so once the user clicked a word;
 * this is the same fact, visible the moment the document opens.
 *
 * Plain DOM (the viewer builds its overlays imperatively over a canvas), % offsets so
 * the outlines track the responsive page, and `pointer-events: none` on the layer:
 * clicking a logo must still open the «Masquer» picker, which hit-tests the canvas.
 *
 * Returns what it marked so the caller can decide whether to explain the code at all.
 */
export function buildImageZoneLayer(
  pageEl: HTMLElement,
  page: Pick<RenderedPage, "imageZones" | "imageOnly">,
  cssW: number,
  cssH: number,
): { zones: number; imageOnly: boolean } {
  pageEl.querySelector(":scope > .pdfv-imgzones")?.remove();
  pageEl.querySelector(":scope > .pdfv-imgbadge")?.remove();
  // A page with NO text layer is a picture end to end: outlining every run would frame
  // the whole page and say nothing. One badge states it instead.
  if (page.imageOnly) {
    const badge = document.createElement("span");
    badge.className = "pdfv-imgbadge";
    badge.textContent = "Page lue dans l'image";
    pageEl.appendChild(badge);
    return { zones: 0, imageOnly: true };
  }
  if (!page.imageZones.length) return { zones: 0, imageOnly: false };
  const layer = document.createElement("div");
  layer.className = "pdfv-imgzones";
  layer.setAttribute("aria-hidden", "true");
  for (const z of page.imageZones) layer.appendChild(zoneEl(z, cssW, cssH));
  pageEl.appendChild(layer);
  return { zones: page.imageZones.length, imageOnly: false };
}

function zoneEl(z: ImageZone, cssW: number, cssH: number): HTMLElement {
  const el = document.createElement("span");
  el.className = "pdfv-imgzone";
  const left = Math.max(0, z.left - BLEED);
  const top = Math.max(0, z.top - BLEED);
  el.style.left = `${(left / cssW) * 100}%`;
  el.style.top = `${(top / cssH) * 100}%`;
  el.style.width = `${(Math.min(cssW - left, z.w + BLEED * 2) / cssW) * 100}%`;
  el.style.height = `${(Math.min(cssH - top, z.h + BLEED * 2) / cssH) * 100}%`;
  return el;
}

/**
 * The legend, in the user's terms. Never claims more than was marked: with only
 * whole-image pages there are no outlines to explain, and with neither there is no note.
 */
export function imageSourceNote(
  zones: number,
  imageOnlyPages: number,
  t: Messages,
): string | null {
  if (zones > 0) {
    const pages =
      imageOnlyPages > 0
        ? t.viewers.pdf.imagePages(imageOnlyPages)
        : "";
    return t.viewers.pdf.imageZones(pages);
  }
  if (imageOnlyPages > 0) {
    return imageOnlyPages > 1
      ? `${imageOnlyPages} pages sont lues dans l'image : leur texte vient de la lecture des pixels, pas d'une couche texte.`
      : "Cette page est lue dans l'image : son texte vient de la lecture des pixels, pas d'une couche texte.";
  }
  return null;
}
