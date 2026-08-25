import { describe, it, expect } from "vitest";
import { alignWords, glyphBoxToRaster, layerDivergence } from "./align";
import { buildTextLayerPage, type OcrLayerPage } from "./geometry";
import type { PdfTextItem } from "./pdfLayout";
import type { OcrWord } from "../ocr/layout";

// Page: 595×842 pts, rasterised at scale 2 → 1190×1684 px. Items at y=700 pts sit at
// y 264..284 px (top-left flip). All test numbers are exact under this mapping.
const item = (str: string, x: number, y: number, w: number, h = 10): PdfTextItem => ({
  str,
  transform: [1, 0, 0, h, x, y],
  width: w,
  height: h,
});
const word = (text: string, x0: number, x1: number, y0 = 264, y1 = 284): OcrWord => ({
  text, x0, y0, x1, y1,
});
const ocrPage = (words: OcrWord[], text?: string): OcrLayerPage => ({
  text: text ?? words.map((w) => w.text).join(" "),
  words,
  width: 1190,
  height: 1684,
});

describe("glyphBoxToRaster", () => {
  it("scales PDF points to raster pixels and flips the y origin", () => {
    const text = buildTextLayerPage([item("Nom : Rebour", 50, 700, 120)], 595, 842);
    const b = glyphBoxToRaster(text.boxes[0], text, ocrPage([]));
    expect(b).toEqual({ x0: 100, x1: 340, y0: 264, y1: 284 });
  });
});

describe("alignWords — the exact reading under each OCR word", () => {
  it("recovers the EXACT text-layer characters under a NOISY OCR word (SABOVRDIN → SABOURDIN)", () => {
    const text = buildTextLayerPage([item("SABOURDIN JULIEN", 50, 700, 160)], 595, 842);
    const ocr = ocrPage([word("SABOVRDIN", 100, 280), word("JULIEN", 300, 420)]);
    const { words, coverage } = alignWords(text, ocr);
    expect(words.map((w) => w.exact)).toEqual(["SABOURDIN", "JULIEN"]);
    expect(coverage).toBe(1);
  });

  it("joins a kerning-SPLIT item pair under one word box (Re+bour → Rebour)", () => {
    const text = buildTextLayerPage([item("Re", 50, 700, 20), item("bour", 70, 700, 40)], 595, 842);
    const { words } = alignWords(text, ocrPage([word("Rebour", 100, 220)]));
    expect(words[0].exact).toBe("Rebour");
    expect(words[0].itemIndices).toEqual([0, 1]);
  });

  it("image-only content (a stamp) has NO exact reading — null, coverage drops", () => {
    const text = buildTextLayerPage([item("Contrat", 50, 700, 70)], 595, 842);
    const ocr = ocrPage([
      word("Contrat", 100, 240),
      word("APPROUVÉ", 800, 1000, 600, 640), // stamp: pixels only, no glyphs under it
    ]);
    const { words, coverage } = alignWords(text, ocr);
    expect(words[0].exact).toBe("Contrat");
    expect(words[1].exact).toBeNull();
    expect(words[1].itemIndices).toEqual([]);
    expect(coverage).toBe(0.5);
  });

  it("does NOT match a glyph from a NEIGHBOURING line (vertical gate)", () => {
    // Same x-span, one line lower (y=680 pts → 304..324 px): must not be read as overlap.
    const text = buildTextLayerPage([item("Secret", 50, 680, 60)], 595, 842);
    const { words } = alignWords(text, ocrPage([word("Autre", 100, 220)])); // y 264..284
    expect(words[0].exact).toBeNull();
  });
});

describe("layerDivergence — do the two layers READ the page the same way?", () => {
  it("same reading → 0", () => {
    expect(layerDivergence("Nom : Rebour Ville : Lyon", "Nom : Rebour Ville : Lyon")).toBe(0);
  });

  it("an INTERLEAVED-columns text layer scores HIGH against the OCR reading order", () => {
    // Same WORDS, broken adjacency — the SACEM text-layer pathology.
    const ordered = "TYPE DE DROIT Droit d'exécution 70,90 Droit de reproduction 5,10";
    const interleaved = "TYPE Droit DE d'exécution DROIT 70,90 Droit 5,10 de reproduction";
    expect(layerDivergence(interleaved, ordered)).toBeGreaterThan(0.6);
  });

  it("pure per-word OCR noise stays MODERATE (order intact)", () => {
    const clean = "Relevé de vos droits SABOURDIN JULIEN répartition normale octobre";
    const noisy = "Relevé de vos droits SABOVRDIN JULIEN répartition normale octobre";
    const d = layerDivergence(clean, noisy);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(0.5);
  });

  it("one side empty → 1 (nothing shared)", () => {
    expect(layerDivergence("", "du texte")).toBe(1);
    expect(layerDivergence("", "")).toBe(0);
  });
});
