import { getMessages } from "@openmasq/i18n";
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { buildImageZoneLayer, buildRevealMarks, buildTextHaloLayer, imageSourceNote } from "./pageLayers";
import type { RedactBox } from "@openmasq/redact/pdf-redact";

const zone = (left: number, top: number) => ({ left, top, w: 60, h: 20, words: 2 });
const page = () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
};

/**
 * The image-zone marking makes a CLAIM about where a piece of the document came from,
 * and the user acts on it (a value that lives only in the pixels is not in the text the
 * model receives). Three ways it can quietly become a lie or a nuisance:
 */
const fr = getMessages("fr");

describe("buildImageZoneLayer", () => {
  it("outlines each zone, %-positioned in the page's own space", () => {
    const el = page();
    const marked = buildImageZoneLayer(el, { imageZones: [zone(10, 20), zone(300, 400)], imageOnly: false }, 600, 800);
    expect(marked).toEqual({ zones: 2, imageOnly: false });
    const outlines = el.querySelectorAll<HTMLElement>(".pdfv-imgzone");
    expect(outlines).toHaveLength(2);
    // Percentages, not px: the canvas is responsive and zoomable under them.
    expect(outlines[0]!.style.left.endsWith("%")).toBe(true);
    expect(outlines[0]!.style.width.endsWith("%")).toBe(true);
  });

  it("never intercepts the click that opens «Redact»", () => {
    // The canvas word-picker hit-tests UNDERNEATH this layer, so a logo must stay
    // clickable — it is exactly the zone a user wants to act on. jsdom loads no
    // stylesheet, so assert the rule where it lives.
    // Repo-root relative: the vitest config's include globs are root-anchored, so the
    // suite only ever runs from there (`import.meta.url` is an http URL under jsdom).
    const css = readFileSync("packages/ui/src/styles.css", "utf8");
    const block = css.slice(css.indexOf(".pdfv-imgzones {"));
    expect(block.slice(0, block.indexOf("}"))).toContain("pointer-events: none");
  });

  it("says it ONCE on a page with no text layer, instead of framing the whole page", () => {
    const el = page();
    const marked = buildImageZoneLayer(el, { imageZones: [zone(10, 20)], imageOnly: true }, 600, 800);
    expect(marked).toEqual({ zones: 0, imageOnly: true });
    expect(el.querySelectorAll(".pdfv-imgzone")).toHaveLength(0);
    expect(el.querySelector(".pdfv-imgbadge")?.textContent).toBe("Page lue dans l'image");
  });

  it("replaces its own layer rather than stacking one per rebuild", () => {
    const el = page();
    const p = { imageZones: [zone(10, 20)], imageOnly: false };
    buildImageZoneLayer(el, p, 600, 800);
    buildImageZoneLayer(el, p, 600, 800);
    expect(el.querySelectorAll(".pdfv-imgzones")).toHaveLength(1);
  });
});

describe("buildTextHaloLayer — la légende est l'interrupteur du halo", () => {
  const box = { left: 10, top: 20, w: 100, h: 12 };
  beforeEach(() => localStorage.removeItem("openmasq.haloOff"));

  it("la légende est un BOUTON qui masque toutes les pages, et la préférence survit au viewer", () => {
    const wrap = document.createElement("div");
    document.body.appendChild(wrap);
    const p1 = document.createElement("div");
    const p2 = document.createElement("div");
    wrap.append(p1, p2);
    buildTextHaloLayer(p1, [box], 600, 800, true, fr);
    buildTextHaloLayer(p2, [box], 600, 800, false, fr);
    const legend = p1.querySelector<HTMLButtonElement>(".pdfv-halolegend")!;
    expect(legend.tagName).toBe("BUTTON");
    expect(legend.getAttribute("aria-pressed")).toBe("true");
    // ⚠️ L'état doit se LIRE : halo éteint, un bouton identique fait croire que rien n'a
    // été reconnu — donc que rien ne sera redacted (conclusion tirée en parcours, 15/08).
    expect(legend.textContent).toContain("Halo = texte reconnu");
    legend.click();
    expect(legend.textContent).toContain("Halo masqué");
    // …et la phrase d'extinction rappelle que le redaction n'est pas concerné.
    expect(legend.textContent).toMatch(/redacted quand même/);
    legend.click();
    expect(legend.textContent).toContain("Halo = texte reconnu");
    legend.click();
    // La classe vit sur le PARENT des pages : p2 est masquée par le même sélecteur.
    expect(wrap.classList.contains("pdfv-halo-off")).toBe(true);
    expect(legend.getAttribute("aria-pressed")).toBe("false");
    // Un NOUVEAU viewer honore la préférence retenue, et le clic la rend réversible.
    const wrap2 = document.createElement("div");
    document.body.appendChild(wrap2);
    const q = document.createElement("div");
    wrap2.appendChild(q);
    buildTextHaloLayer(q, [box], 600, 800, true, fr);
    expect(wrap2.classList.contains("pdfv-halo-off")).toBe(true);
    wrap2.querySelector<HTMLButtonElement>(".pdfv-halolegend")!.click();
    expect(wrap2.classList.contains("pdfv-halo-off")).toBe(false);
  });

  it("les recouvrements rendent l'UNION : bandes OPAQUES sous une opacité de GROUPE", () => {
    // jsdom ne charge pas la feuille — on épingle la règle là où elle vit : deux bandes
    // qui se recouvrent (lignes voisines, mot en double couche texte/OCR) ne doivent
    // jamais rendre un lavis doublé plus foncé.
    const css = readFileSync("packages/ui/src/styles/viewers/textHalo.css", "utf8");
    const layer = css.slice(css.indexOf(".pdfv-texthalo {"));
    expect(layer.slice(0, layer.indexOf("}"))).toContain("opacity");
    const band = css.slice(css.indexOf(".pdfv-halo {"));
    expect(band.slice(0, band.indexOf("}"))).toContain("background: var(--brand)");
    expect(band.slice(0, band.indexOf("}"))).not.toContain("color-mix");
    // Et la bascule a bien une règle qui masque la couche sans emporter la légende.
    expect(css).toContain(".pdfv-halo-off .pdfv-texthalo");
  });
});

describe("imageSourceNote — never explains a code nothing on screen wears", () => {
  it("is absent when nothing was marked", () => {
    expect(imageSourceNote(0, 0, fr)).toBeNull();
  });

  it("explains the outlines when there are outlines", () => {
    expect(imageSourceNote(3, 0, fr)).toContain("Les zones encadrées");
  });

  it("speaks of pages, not outlines, when only whole pages were marked", () => {
    const note = imageSourceNote(0, 2, fr)!;
    expect(note).toContain("2 pages");
    expect(note).not.toContain("encadrées");
  });
});

describe("buildRevealMarks", () => {
  const box: RedactBox = {
    left: 10, top: 20, w: 50, h: 12, real: "Jean Rebour", tone: "coral", kind: "name", revealed: false,
  } as RedactBox;

  it("is a NAMED button carrying the card's data when the preview is editable — and owns NO toggle", () => {
    const el = page();
    buildRevealMarks(el, [box], 600, 800, true);
    const mark = el.querySelector<HTMLElement>(".pdfv-mark")!;
    expect(mark.tagName).toBe("BUTTON");
    expect(mark.dataset.real).toBe("Jean Rebour");
    expect(mark.dataset.docReveal).toBe("");
    // Un bouton vide sans nom accessible n'annonçait RIEN au lecteur d'écran (audit).
    expect(mark.getAttribute("aria-label")).toContain("inspecter");
    // Inspecter ≠ révéler : la marque ne porte AUCUN toggle propre — le clic remonte à
    // la carte partagée (`useMarkHover` délégué), dont « Unredact » est l'action.
    // (Un listener direct ici a déjà envoyé une valeur en clair sur le geste
    // d'exploration — c'est le bug que ce test ferme.)
    mark.dispatchEvent(new MouseEvent("click", { bubbles: true })); // ne jette pas, ne bascule rien
  });

  it("is an inert span with a tooltip in the read-only viewer — no reveal affordance", () => {
    const el = page();
    buildRevealMarks(el, [box], 600, 800, false);
    const mark = el.querySelector<HTMLElement>(".pdfv-mark")!;
    expect(mark.tagName).toBe("SPAN");
    expect(mark.dataset.real).toBeUndefined();
    expect(mark.title).toBe("Jean Rebour");
  });
});
