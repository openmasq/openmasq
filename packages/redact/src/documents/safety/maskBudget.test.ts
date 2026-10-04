import { describe, expect, it } from "vitest";
import {
  CHARS_PER_PAGE,
  LONG_MASK_CHARS,
  MAX_MASK_CHARS,
  approxPages,
  estimateMaskMs,
  extractTimeoutMs,
  maskPlan,
  maskTimeoutMs,
} from "./maskBudget";

describe("maskPlan — a document is masked in full, announced when long, or refused", () => {
  it("a short document needs nothing said", () => {
    expect(maskPlan(0)).toEqual({ kind: "ok" });
    expect(maskPlan(LONG_MASK_CHARS)).toEqual({ kind: "ok" });
  });

  it("a long one announces its wait in whole minutes (at least 1)", () => {
    expect(maskPlan(LONG_MASK_CHARS + 1)).toEqual({ kind: "long", minutes: 1 });
    const p = maskPlan(MAX_MASK_CHARS);
    expect(p.kind).toBe("long");
    expect(p.kind === "long" && p.minutes).toBe(Math.ceil(estimateMaskMs(MAX_MASK_CHARS) / 60_000));
  });

  it("past the cap it is REFUSED, with its size in pages", () => {
    expect(maskPlan(MAX_MASK_CHARS + 1)).toEqual({ kind: "refuse", pages: approxPages(MAX_MASK_CHARS + 1) });
    expect(approxPages(3 * CHARS_PER_PAGE)).toBe(3);
    expect(approxPages(10)).toBe(1);
  });

  it("the thresholds hold the product's promises: long ≈ 20 s, refusal ≤ 5 min on the measured machine", () => {
    expect(estimateMaskMs(LONG_MASK_CHARS)).toBeLessThanOrEqual(20_000);
    expect(estimateMaskMs(MAX_MASK_CHARS)).toBeLessThanOrEqual(5 * 60_000);
  });
});

describe("maskTimeoutMs — generous, scaled to the text", () => {
  it("never below the floor, and always well above the estimate", () => {
    expect(maskTimeoutMs(0)).toBe(120_000);
    for (const n of [LONG_MASK_CHARS, MAX_MASK_CHARS]) {
      expect(maskTimeoutMs(n)).toBeGreaterThanOrEqual(2 * estimateMaskMs(n));
    }
    expect(maskTimeoutMs(MAX_MASK_CHARS)).toBeGreaterThan(maskTimeoutMs(LONG_MASK_CHARS));
  });
});

describe("extractTimeoutMs — the extraction backstop grows with the pages OCR reads", () => {
  it("keeps its floor before the count is known, and scales per page after", () => {
    expect(extractTimeoutMs(0)).toBe(6 * 60_000);
    expect(extractTimeoutMs(-3)).toBe(extractTimeoutMs(0));
    expect(extractTimeoutMs(100) - extractTimeoutMs(99)).toBe(60_000);
    // The largest scan the pre-OCR estimate admits still has a bounded backstop (≈ 6 h).
    const most = Math.floor(MAX_MASK_CHARS / CHARS_PER_PAGE);
    expect(extractTimeoutMs(most)).toBeLessThan(7 * 3_600_000);
  });
});
