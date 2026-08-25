import { describe, it, expect } from "vitest";
import { ocrWordsToText, ocrWordsToLayout, OCR_MIN_WORD_CONFIDENCE, type OcrWord } from "./layout";

// Words on ONE line so reading-order reconstruction just joins them left→right.
const w = (text: string, x0: number, confidence?: number): OcrWord => ({
  text,
  x0,
  y0: 0,
  x1: x0 + 20,
  y1: 12,
  confidence,
});

describe("OCR per-word confidence floor (OCR_MIN_WORD_CONFIDENCE = 25 / 0.25)", () => {
  it("drops near-garbage words below the floor, keeps the mid/high range", () => {
    // 30 is now ABOVE the floor (a scanned real value at modest confidence must survive);
    // only true near-garbage (<25) is shed.
    const words = [w("IBAN", 0, 95), w("julien", 30, 30), w("garbage", 60, 15), w("FR76", 90, 55)];
    const text = ocrWordsToText(words); // default floor
    expect(text).toContain("IBAN");
    expect(text).toContain("FR76"); // 55 ≥ 25 → kept
    expect(text).toContain("julien"); // 30 ≥ 25 → kept (was dropped at the old 40 floor)
    expect(text).not.toContain("garbage"); // 15 < 25 → dropped
  });

  it("keeps a word with NO confidence (never risk dropping a real value)", () => {
    expect(ocrWordsToText([w("Rebour", 0, undefined)])).toContain("Rebour");
  });

  it("the default equals the floor constant, and the kept `words` match the text", () => {
    const words = [w("keep", 0, 80), w("drop", 30, 10)];
    const { text, words: kept } = ocrWordsToLayout(words); // default = OCR_MIN_WORD_CONFIDENCE
    expect(OCR_MIN_WORD_CONFIDENCE).toBe(25);
    expect(kept.map((k) => k.text)).toEqual(["keep"]); // painting words align with the text
    expect(text).toContain("keep");
    expect(text).not.toContain("drop");
  });

  it("an explicit minConfidence still overrides the default (e.g. 0 keeps all)", () => {
    const words = [w("low", 0, 10)];
    expect(ocrWordsToText(words, 0)).toContain("low");
    expect(ocrWordsToText(words)).not.toContain("low"); // default floor drops it
  });
});
