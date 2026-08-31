import type { Messages } from "@openmasq/i18n";
import type { ImageZone, RedactBox, RenderedPage } from "@openmasq/redact/pdf-redact";
import { haloRegions, type HaloBox } from "./textHalo";
import { migrateLegacyLocalStorage } from "../../../../state/legacyStorage";

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
 * Le HALO des zones de texte détecté : ce qui, redacted, part vers le modèle (l'appelant
 * fournit `RenderedPage.wireWords`). Ce qui n'en porte pas ne part pas en texte : soit non
 * lu (photo, zone illisible), soit pris dans l'image — logo, tampon — et c'est alors le
 * CADRE (`buildImageZoneLayer`) qui le dit, jamais le halo : les deux marques font des
 * affirmations opposées et ne doivent pas se recouvrir. La géométrie (bandes de ligne
 * fusionnées, `textHalo.ts`) suit l'étendue réelle du texte ; le rendu CSS est un aplat à
 * bords nets. La COUCHE est `pointer-events: none` + `aria-hidden` (pur contexte) ; la
 * LÉGENDE, elle, est un BOUTON : cliquer masque/réaffiche le halo, et la préférence est
 * retenue (`openmasq.haloOff`) — la légende reste visible pour pouvoir le rallumer.
 */
const HALO_OFF_KEY = "openmasq.haloOff";
const haloOff = (): boolean => {
  migrateLegacyLocalStorage(); // les clés d'avant le renommage — une passe, puis no-op
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
    /* préférence de VUE seule — sans stockage, le toggle vaut pour la session. */
  }
};

export function buildTextHaloLayer(
  pageEl: HTMLElement,
  boxes: readonly HaloBox[],
  cssW: number,
  cssH: number,
  /** Poser la LÉGENDE (« Halo = texte reconnu… ») sur cette page — l'appelant la
   *  demande pour la PREMIÈRE page seulement : une étiquette par page serait du bruit,
   *  et sans elle le halo est un mystère. */
  withLegend: boolean,
  t: Messages,
): void {
  pageEl.querySelector(":scope > .pdfv-texthalo")?.remove();
  pageEl.querySelector(":scope > .pdfv-halolegend")?.remove();
  const regions = haloRegions(boxes, { w: cssW, h: cssH });
  if (!regions.length) return;
  // La bascule vit sur le PARENT des pages : une préférence, toutes les pages du
  // document — pas une page allumée et sa voisine éteinte.
  const scope = pageEl.parentElement ?? pageEl;
  scope.classList.toggle("pdfv-halo-off", haloOff());
  if (withLegend) {
    const legend = document.createElement("button");
    legend.type = "button";
    legend.className = "pdfv-halolegend";
    // ⚠️ L'ÉTAT SE LIT SUR L'ÉTIQUETTE, pas seulement dans `aria-pressed`. Halo éteint, le
    // bouton était identique à halo allumé : on croit alors que rien n'a été reconnu —
    // donc que rien ne sera redacted (conclusion tirée en parcours le 15/08, sur un vrai
    // relevé bancaire). Et la phrase d'extinction doit RAPPELER que le redaction, lui,
    // n'est pas concerné : c'est une préférence d'AFFICHAGE, jamais une protection.
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
 * modal body) — « Unredact » is the card's explicit action, never the exploration
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
      // Un bouton VIDE n'a aucun nom accessible — un lecteur d'écran n'annonçait rien.
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
 * clicking a logo must still open the «Redact» picker, which hit-tests the canvas.
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
