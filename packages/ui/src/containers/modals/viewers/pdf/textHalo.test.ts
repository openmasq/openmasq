import { describe, it, expect } from "vitest";
import { haloRegions, type HaloBox } from "./textHalo";

const b = (left: number, top: number, w = 40, h = 10): HaloBox => ({ left, top, w, h });
const BOUNDS = { w: 600, h: 800 };

describe("haloRegions — bandes de ligne représentatives", () => {
  it("fusionne les mots d'une même ligne en UNE bande", () => {
    const out = haloRegions([b(50, 100), b(95, 100), b(140, 101)], BOUNDS);
    expect(out).toHaveLength(1);
    const r = out[0];
    // The band covers from the first to the last word, inflated by a margin < one height.
    expect(r.left).toBeLessThan(50);
    expect(r.left).toBeGreaterThan(40);
    expect(r.left + r.w).toBeGreaterThan(180);
    expect(r.left + r.w).toBeLessThan(195);
  });

  it("sépare deux COLONNES : une gouttière de plusieurs hauteurs ne fusionne jamais", () => {
    const out = haloRegions([b(50, 100), b(300, 100)], BOUNDS); // gap 210 ≫ 1.6×10
    expect(out).toHaveLength(2);
  });

  it("sépare deux LIGNES sans recouvrement vertical", () => {
    const out = haloRegions([b(50, 100), b(50, 130)], BOUNDS);
    expect(out).toHaveLength(2);
  });

  it("une même ligne écrite par DEUX sources (texte + OCR, ordre quelconque) reste UNE bande", () => {
    // OCR words arrive AFTER text words, with a slightly offset vertical framing.
    const out = haloRegions([b(95, 300), b(50, 301, 40, 9), b(140, 299, 40, 11)], BOUNDS);
    expect(out).toHaveLength(1);
  });

  it("borne le gonflement à la page — jamais de bande hors cadre", () => {
    const out = haloRegions([b(0, 0, 600, 12)], BOUNDS);
    const r = out[0];
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.left + r.w).toBeLessThanOrEqual(BOUNDS.w);
    expect(r.top + r.h).toBeLessThanOrEqual(BOUNDS.h);
  });

  it("ignore les boîtes dégénérées (NaN, largeur nulle) au lieu de casser la couche", () => {
    const out = haloRegions(
      [b(50, 100), { left: NaN, top: 10, w: 5, h: 5 }, { left: 10, top: 10, w: 0, h: 5 }],
      BOUNDS,
    );
    expect(out).toHaveLength(1);
  });

  it("page vide : aucune région (le halo dit alors « rien n'a été lu »)", () => {
    expect(haloRegions([], BOUNDS)).toEqual([]);
  });
});
