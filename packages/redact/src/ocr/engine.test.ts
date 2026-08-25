import { describe, it, expect } from "vitest";
import { preferDoctr, type OcrPage } from "./engine";

const page = (over: Partial<OcrPage>): OcrPage => ({
  text: "",
  words: [],
  width: 1000,
  height: 1000,
  ...over,
});

// A latin page: docTR detected N regions and recognised ~all of them with high CTC
// confidence → keep docTR.
const w = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `word${i}`, x0: 0, y0: 0, x1: 10, y1: 10 }));

describe("preferDoctr (docTR-for-latin router decision)", () => {
  it("keeps docTR on a confident, high-yield latin page", () => {
    expect(preferDoctr(page({ words: w(20), regions: 22, meanConfidence: 0.9 }))).toBe(true);
  });

  it("falls back when the recognition confidence is low (non-latin script docTR can't read)", () => {
    // DBNet found regions (script-agnostic) but the latin CRNN is uncertain → low conf.
    expect(preferDoctr(page({ words: w(18), regions: 20, meanConfidence: 0.2 }))).toBe(false);
  });

  it("falls back on low YIELD (many regions detected, few words recognised)", () => {
    expect(preferDoctr(page({ words: w(4), regions: 20, meanConfidence: 0.9 }))).toBe(false);
  });

  it("falls back when nothing was detected (let Tesseract try)", () => {
    expect(preferDoctr(page({ words: [], regions: 0, meanConfidence: 0 }))).toBe(false);
  });

  it("uses words.length as the region denominator when regions is unreported", () => {
    // No `regions` ⇒ yield = 1 (words/words); high conf ⇒ keep.
    expect(preferDoctr(page({ words: w(10), meanConfidence: 0.8 }))).toBe(true);
    // …still gated on confidence.
    expect(preferDoctr(page({ words: w(10), meanConfidence: 0.1 }))).toBe(false);
  });
});
