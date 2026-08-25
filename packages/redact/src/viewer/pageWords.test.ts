import { describe, it, expect } from "vitest";
import { collectPageWords, ocrPageWords, wordAtPoint, cleanWord, type TextMeasurer } from "./pageWords";
import { selectionValue } from "./wordPicker";
import { occursFlexibly } from "./pdfMatch";

/** Deterministic measurer: 10px per character, whatever the font. */
const measurer: TextMeasurer = {
  font: "",
  measureText: (s: string) => ({ width: s.length * 10 }),
};

describe("collectPageWords — text-layer word boxes (CSS px)", () => {
  it("splits an item into per-word boxes with proportional metrics", () => {
    const items = [{ str: "Jean Rebour", width: 110, transform: [12, 0, 0, 12, 100, 700] }];
    const words = collectPageWords(measurer, items, [1, 0, 0, 1, 0, 0], 1, 1);
    expect(words.map((w) => w.str)).toEqual(["Jean", "Rebour"]);
    // k = wpx/totalW = 110/110 = 1 → "Jean" at x=100 w=40; "Rebour" after "Jean " (50px)
    expect(words[0]).toMatchObject({ left: 100, w: 40 });
    expect(words[1]).toMatchObject({ left: 150, w: 60 });
    // glyph height from the transform (12): top = baseline − 0.85·fh
    expect(words[0].top).toBeCloseTo(700 - 12 * 0.85, 5);
    expect(words[0].h).toBeCloseTo(12 * 1.12, 5);
  });

  it("skips empty/whitespace items and returns CSS px under a devicePixelRatio", () => {
    const items = [
      { str: "  ", width: 10, transform: [12, 0, 0, 12, 0, 0] },
      { str: "Mot", width: 30, transform: [12, 0, 0, 12, 40, 100] },
    ];
    const words = collectPageWords(measurer, items, [1, 0, 0, 1, 0, 0], 1, 2);
    expect(words).toHaveLength(1);
    expect(words[0].left).toBeCloseTo(20, 5); // device 40 → CSS 20 (dpr 2)
  });
});

describe("ocrPageWords / wordAtPoint / cleanWord", () => {
  const words = ocrPageWords(
    [
      { text: "Jean", x0: 100, y0: 50, x1: 180, y1: 80 },
      { text: "Rebour,", x0: 190, y0: 50, x1: 300, y1: 80 },
      { text: " ", x0: 310, y0: 50, x1: 312, y1: 80 },
    ],
    0.5,
    2,
  );

  it("scales the raster boxes and drops blank words", () => {
    expect(words).toHaveLength(2);
    expect(words[0]).toMatchObject({ str: "Jean", left: 50, top: 100, w: 40, h: 60 });
  });

  it("hit-tests a point to its word, and misses outside", () => {
    expect(wordAtPoint(words, 60, 120)?.str).toBe("Jean");
    expect(wordAtPoint(words, 60, 300)).toBeNull();
  });

  it("cleanWord strips clinging punctuation only", () => {
    expect(cleanWord("Rebour,")).toBe("Rebour");
    expect(cleanWord("«Rebour»")).toBe("Rebour");
    expect(cleanWord("Saint-Ouen")).toBe("Saint-Ouen");
    expect(cleanWord("06.12.34.56.78")).toBe("06.12.34.56.78");
  });
});

describe("selectionValue / occursFlexibly (drag-to-redact run + the zone-image note)", () => {
  const run = [
    { str: "«M.", left: 0, top: 0, w: 10, h: 10 },
    { str: "Jean", left: 12, top: 0, w: 10, h: 10 },
    { str: "Rebour,»", left: 24, top: 0, w: 10, h: 10 },
  ];
  it("joins a run and trims only the RUN's clinging punctuation", () => {
    expect(selectionValue(run, 0, 2)).toBe("M. Jean Rebour");
    expect(selectionValue(run, 2, 1)).toBe("Jean Rebour"); // reversed drag → same run
    expect(selectionValue(run, 1, 1)).toBe("Jean");
  });
  it("occursFlexibly is whitespace-flexible and case-insensitive", () => {
    expect(occursFlexibly("M. JEAN\n   REBOUR, demeurant…", "Jean Rebour")).toBe(true);
    expect(occursFlexibly("le texte primaire sans logo", "France Travail")).toBe(false);
    expect(occursFlexibly("", "x")).toBe(false);
  });
});
