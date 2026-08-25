import { describe, it, expect } from "vitest";
import { ocrWordsToLayout, ocrWordsToText, type OcrWord } from "./layout";

/** A word box on a line at vertical `y` (top), left→right by `x`, height 20. */
const w = (text: string, x: number, y: number, width = text.length * 12, conf = 90): OcrWord => ({
  text,
  x0: x,
  y0: y,
  x1: x + width,
  y1: y + 20,
  confidence: conf,
});

describe("ocrWordsToText — layout-aware OCR reconstruction", () => {
  // A scanned two-column form:  "Nom : Rebour    Ville : Lyon"  /  "Email : jean@acme.com"
  // The words are passed in a SCRAMBLED order to prove geometry drives the output,
  // not the array order.
  const words: OcrWord[] = [
    w("Lyon", 480, 100),
    w("Email", 50, 140),
    w("Nom", 50, 100, 35),
    w(":", 465, 100, 5),
    w("Rebour", 110, 100),
    w("jean@acme.com", 135, 140),
    w("Ville", 400, 100),
    w(":", 90, 100, 5),
    w(":", 115, 140, 5),
  ];

  const text = ocrWordsToText(words);

  it("keeps label:value adjacency per column", () => {
    expect(text).toContain("Nom : Rebour");
    expect(text).toContain("Ville : Lyon");
    expect(text).toContain("Email : jean@acme.com");
  });

  it("separates columns with a wide gap → double space (a field separator)", () => {
    // `detectLabeledFields.cleanValue` cuts a value at the ` | `/double-space break,
    // so "Rebour" and "Ville" don't merge into one field.
    expect(text).toMatch(/Rebour {2,}Ville/);
  });

  it("orders lines top→bottom by geometry, not input order", () => {
    expect(text.indexOf("Nom")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Nom")).toBeLessThan(text.indexOf("Email"));
  });

  it("drops words below the confidence floor when asked", () => {
    const noisy = [...words, w("GARBAGE", 700, 100, 60, 10)];
    expect(ocrWordsToText(noisy, 40)).not.toContain("GARBAGE");
    expect(ocrWordsToText(noisy, 0)).toContain("GARBAGE");
  });

  it("returns empty string for no usable words", () => {
    expect(ocrWordsToText([])).toBe("");
    expect(ocrWordsToText([w("   ", 0, 0)])).toBe("");
  });
});

describe("ocrWordsToLayout — les BANDES boxées ne sont plus jetées", () => {
  it("expose les blocks de la reconstruction (segmentation gratuite pour les zones)", () => {
    const words = [
      { text: "Nom", x0: 10, y0: 10, x1: 50, y1: 24 },
      { text: "Rebour", x0: 60, y0: 10, x1: 130, y1: 24 },
      { text: "Total", x0: 10, y0: 60, x1: 52, y1: 74 },
    ];
    const { blocks, runs, text } = ocrWordsToLayout(words);
    expect(text.length).toBeGreaterThan(0);
    expect(runs.length).toBeGreaterThan(0);
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      expect(b.box.x1).toBeGreaterThanOrEqual(b.box.x0);
      expect(typeof b.textStart).toBe("number");
    }
  });
});
